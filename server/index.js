require('dotenv').config();
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const { Server: SocketServer } = require('socket.io');
const db       = require('./src/db');
const safety   = require('./src/safety');
const geocode  = require('./src/geocode');
const mailer   = require('./src/mailer');
const maritime = require('./src/maritime');
const noaa     = require('./src/noaa');

noaa.loadStaticData();

// In-memory store: email -> { code, expires }
const resetCodes = new Map();

const app = express();
app.use(cors());
app.use(express.json());

// ── Chat (Socket.io) ─────────────────────────────────────────────────────────

const httpServer = http.createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: '*' } });

// roomKey: 0.25° grid cell (~15 nm). Users in the same cell chat together.
function roomKey(lat, lon) {
  return `${Math.floor(lat / 0.25)},${Math.floor(lon / 0.25)}`;
}

// Per-room message history (last 60 messages, ephemeral — in memory only).
const roomHistory = new Map();
function roomPush(room, msg) {
  const msgs = roomHistory.get(room) || [];
  msgs.push(msg);
  if (msgs.length > 60) msgs.splice(0, msgs.length - 60);
  roomHistory.set(room, msgs);
}

// Per-user last known position & reverse-geocoded label.
const lastKnownPos  = new Map(); // userId -> { lat, lon }
const userLocLabels = new Map(); // userId -> "City, ST"

// DM history (last 60 messages per pair, ephemeral).
const dmHistory = new Map();
function dmRoomKey(a, b) { return `dm:${Math.min(a, b)}-${Math.max(a, b)}`; }
function dmPush(room, msg) {
  const msgs = dmHistory.get(room) || [];
  msgs.push(msg);
  if (msgs.length > 60) msgs.splice(0, msgs.length - 60);
  dmHistory.set(room, msgs);
}

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  const user = await db.getUserByToken(token).catch(() => null);
  if (!user) return next(new Error('Invalid token'));
  socket.user = user;
  next();
});

io.on('connection', socket => {
  let currentRoom = null;

  socket.on('join', ({ lat, lon }) => {
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = roomKey(lat, lon);
    socket.join(currentRoom);
    socket.emit('history', roomHistory.get(currentRoom) || []);
    lastKnownPos.set(socket.user.id, { lat, lon });
    geocode.reverseGeocode(lat, lon).then(name => {
      if (name) userLocLabels.set(socket.user.id, name);
    }).catch(() => {});
  });

  socket.on('message', ({ lat, lon, text, type }) => {
    if (!currentRoom || !text?.trim()) return;
    const allowed = ['general', 'hazard', 'rescue'];
    const msg = {
      id:     Math.random().toString(36).slice(2, 10),
      userId: socket.user.id,
      name:   socket.user.name,
      lat:    typeof lat === 'number' ? lat : null,
      lon:    typeof lon === 'number' ? lon : null,
      text:   String(text).slice(0, 400).trim(),
      type:   allowed.includes(type) ? type : 'general',
      ts:     Date.now(),
    };
    roomPush(currentRoom, msg);
    io.to(currentRoom).emit('message', msg);
    if (typeof lat === 'number' && typeof lon === 'number') {
      lastKnownPos.set(socket.user.id, { lat, lon });
    }
  });

  socket.on('joinDm', ({ otherId }) => {
    if (typeof otherId !== 'number') return;
    const dmRoom = dmRoomKey(socket.user.id, Number(otherId));
    socket.join(dmRoom);
    socket.emit('dmHistory', dmHistory.get(dmRoom) || []);
  });

  socket.on('dmMessage', ({ toUserId, text }) => {
    if (!text?.trim()) return;
    const dmRoom = dmRoomKey(socket.user.id, Number(toUserId));
    const msg = {
      id:         Math.random().toString(36).slice(2, 10),
      fromUserId: socket.user.id,
      fromName:   socket.user.name,
      text:       String(text).slice(0, 400).trim(),
      ts:         Date.now(),
    };
    dmPush(dmRoom, msg);
    io.to(dmRoom).emit('dmMessage', msg);
  });
});

// ── Auth middleware ──────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
  req.user = user;
  next();
}

// ── Auth routes ──────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const result = await db.createUser(email, name, password);
    res.status(201).json(result);
  } catch (err) {
    if (err.message === 'Email already registered') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await db.loginUser(email, password);
    if (!result) return res.status(401).json({ error: 'Invalid email or password' });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers['authorization'].slice(7);
    await db.logoutUser(token);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Forgot password ──────────────────────────────────────────────────────────

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    resetCodes.set(email.toLowerCase(), { code, expires: Date.now() + 15 * 60 * 1000 });
    await mailer.sendResetCode(email, code);
    // Always respond ok — don't reveal whether email exists
    res.json({ ok: true });
  } catch (err) {
    console.error('forgot-password error', err);
    res.status(500).json({ error: 'Failed to send reset code' });
  }
});

app.post('/api/auth/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const stored = resetCodes.get(email?.toLowerCase());
    if (!stored || stored.code !== String(code) || Date.now() > stored.expires) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('verify-reset-code error', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const stored = resetCodes.get(email?.toLowerCase());
    if (!stored || stored.code !== String(code) || Date.now() > stored.expires) {
      return res.status(400).json({ error: 'Invalid or expired code — please start over' });
    }
    await db.updatePassword(email, newPassword);
    resetCodes.delete(email.toLowerCase());
    res.json({ ok: true });
  } catch (err) {
    console.error('reset-password error', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// ── Delete account ───────────────────────────────────────────────────────────

app.delete('/api/auth/account', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const valid = await db.verifyUserPassword(req.user.id, password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });
    await db.deleteUser(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('delete-account error', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ── Preset catalog (no auth required) ───────────────────────────────────────

app.get('/api/presets', async (req, res) => {
  try {
    const boats = await db.getPresetBoats();
    res.json(boats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load presets' });
  }
});

// ── Boats (per-user) ─────────────────────────────────────────────────────────

app.get('/api/boats', requireAuth, async (req, res) => {
  try {
    const boats = await db.getBoats(req.user.id);
    res.json(boats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load boats' });
  }
});

app.post('/api/boats', requireAuth, async (req, res) => {
  try {
    const id = await db.addBoat(req.user.id, req.body);
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to create boat' });
  }
});

app.delete('/api/boats/:id', requireAuth, async (req, res) => {
  try {
    await db.deleteBoat(req.user.id, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to delete boat' });
  }
});

// ── Trips (per-user) ─────────────────────────────────────────────────────────

app.get('/api/trips', requireAuth, async (req, res) => {
  try {
    const trips = await db.getTrips(req.user.id);
    res.json(trips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load trips' });
  }
});

app.post('/api/trips', requireAuth, async (req, res) => {
  try {
    const id = await db.addTrip(req.user.id, req.body);
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to create trip' });
  }
});

// ── Safety check ─────────────────────────────────────────────────────────────

app.post('/api/safety-check', requireAuth, async (req, res) => {
  try {
    const { boat, route, departureTime } = req.body;
    const result = await safety.checkRouteSafety({ boat, route, departureTime });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute safety check', message: err.message });
  }
});

// ── Maritime routing ─────────────────────────────────────────────────────────

app.post('/api/maritime-route', async (req, res) => {
  try {
    const { fromLat, fromLon, toLat, toLon } = req.body;
    if (fromLat == null || fromLon == null || toLat == null || toLon == null) {
      return res.status(400).json({ error: 'fromLat, fromLon, toLat, toLon are required' });
    }
    const result = await maritime.computeMaritimeRoute(
      parseFloat(fromLat), parseFloat(fromLon),
      parseFloat(toLat),   parseFloat(toLon)
    );
    res.json(result);
  } catch (err) {
    console.error('maritime-route error', err);
    res.status(500).json({ error: 'maritime routing failed', message: err.message });
  }
});

// ── Geocode ──────────────────────────────────────────────────────────────────

app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q || '';
    const results = await geocode.geocode(q, 6);
    res.json(results);
  } catch (err) {
    console.error('geocode error', err);
    res.status(500).json({ error: 'geocode failed', message: err.message });
  }
});

app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });
    const name = await geocode.reverseGeocode(lat, lon);
    res.json({ name });
  } catch (err) {
    console.error('reverse-geocode error', err);
    res.status(500).json({ error: 'reverse geocode failed' });
  }
});

app.post('/api/feedback', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    const from = `${req.user.name} <${req.user.email}>`;
    await mailer.sendFeedback(from, message.trim());
    res.json({ ok: true });
  } catch (err) {
    console.error('feedback error', err);
    res.status(500).json({ error: 'Failed to send feedback' });
  }
});

// ── Friends ──────────────────────────────────────────────────────────────────
app.get('/api/users/search', requireAuth, async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.trim().length < 2) return res.json([]);
    const results = await db.searchUsers(q, req.user.id);
    const enriched = results.map(u => ({
      ...u,
      locationLabel: userLocLabels.get(u.id) || null,
    }));
    res.json(enriched);
  } catch (err) {
    console.error('search-users error', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/friends', requireAuth, async (req, res) => {
  try {
    const data = await db.getFriends(req.user.id);
    res.json(data);
  } catch (err) {
    console.error('get-friends error', err);
    res.status(500).json({ error: 'Failed to load friends' });
  }
});

app.post('/api/friends/request', requireAuth, async (req, res) => {
  try {
    const { toUserId } = req.body;
    if (!toUserId) return res.status(400).json({ error: 'toUserId required' });
    const id = await db.sendFriendRequest(req.user.id, Number(toUserId));
    res.status(201).json({ id });
  } catch (err) {
    if (err.message === 'Friend request already exists') return res.status(409).json({ error: err.message });
    console.error('friend-request error', err);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

app.post('/api/friends/respond', requireAuth, async (req, res) => {
  try {
    const { requestId, action } = req.body;
    if (!['accept','decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline' });
    await db.respondFriendRequest(Number(requestId), req.user.id, action);
    res.json({ ok: true });
  } catch (err) {
    console.error('friend-respond error', err);
    res.status(500).json({ error: 'Failed to respond to request' });
  }
});

// ── Public user profiles (shown when tapping a chat message) ────────────────
app.get('/api/users/:id/profile', requireAuth, async (req, res) => {
  try {
    const profile = await db.getUserPublicProfile(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json(profile);
  } catch (err) {
    console.error('profile error', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ── NOAA data endpoints ──────────────────────────────────────────────────────

// Bridges near a point (or along a route)
// ?lat=&lon=&radius=50   or   ?waypoints=[[lat,lon],...]&radius=5
app.get('/api/noaa/bridges', async (req, res) => {
  try {
    const radius = parseFloat(req.query.radius) || 50;
    if (req.query.waypoints) {
      const wps = JSON.parse(req.query.waypoints);
      const seen = new Set();
      const bridges = [];
      for (const [lat, lon] of wps) {
        for (const b of noaa.getBridgesNear(lat, lon, Math.min(radius, 5))) {
          const key = `${b.lat},${b.lon}`;
          if (!seen.has(key)) { seen.add(key); bridges.push(b); }
        }
      }
      return res.json(bridges.sort((a, b) => a.dist_km - b.dist_km));
    }
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });
    res.json(noaa.getBridgesNear(lat, lon, radius));
  } catch (err) {
    console.error('bridges error', err);
    res.status(500).json({ error: 'Failed to query bridges' });
  }
});

// Nearest NDBC buoys to a point
app.get('/api/noaa/buoys', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const n   = Math.min(parseInt(req.query.n) || 3, 10);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });
  res.json(noaa.getNearestBuoys(lat, lon, n));
});

// Live observations from a specific NDBC buoy
app.get('/api/noaa/buoys/:stationId/obs', async (req, res) => {
  try {
    const obs = await noaa.getBuoyObservations(req.params.stationId);
    if (!obs) return res.status(404).json({ error: 'No data from buoy' });
    res.json(obs);
  } catch (err) {
    res.status(502).json({ error: `NDBC fetch failed: ${err.message}` });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`SafeSeas API running on http://localhost:${PORT}`));
