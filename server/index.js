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
noaa.loadCurrentStations().catch(e => console.warn('Current stations pre-load:', e.message));
noaa.loadTideStations().catch(e => console.warn('Tide stations pre-load:', e.message));

// ── Hazard store ─────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2-lat1)*d2r, dLon = (lon2-lon1)*d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

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
    if (!result.ok) {
      return res.status(422).json({ error: result.message, code: result.code });
    }
    res.json({ waypoints: result.waypoints, distanceNm: result.distanceNm });
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

// ── Fuel Log ─────────────────────────────────────────────────────────────────

app.get('/api/fuel', requireAuth, async (req, res) => {
  try {
    const { boatId } = req.query;
    const entries = await db.getFuelLogs(req.user.id, boatId || null);
    res.json(entries);
  } catch (err) {
    console.error('get-fuel error', err);
    res.status(500).json({ error: 'Failed to load fuel logs' });
  }
});

app.post('/api/fuel', requireAuth, async (req, res) => {
  try {
    const { boatId, gallons, pricePerGal, locationName, lat, lon, note, fillToFull } = req.body;
    if (!gallons || gallons <= 0) return res.status(400).json({ error: 'gallons required' });
    const entry = {
      id:           Date.now().toString(),
      userId:       req.user.id,
      boatId:       boatId || null,
      gallons:      parseFloat(gallons),
      pricePerGal:  pricePerGal ? parseFloat(pricePerGal) : null,
      totalCost:    pricePerGal ? Math.round(parseFloat(gallons) * parseFloat(pricePerGal) * 100) / 100 : null,
      locationName: locationName || null,
      lat:          lat ? parseFloat(lat) : null,
      lon:          lon ? parseFloat(lon) : null,
      note:         (note || '').slice(0, 200),
      fillToFull:   !!fillToFull,
      date:         new Date().toISOString(),
    };
    await db.addFuelLog(entry);
    res.status(201).json(entry);
  } catch (err) {
    console.error('add-fuel error', err);
    res.status(500).json({ error: 'Failed to save fuel log' });
  }
});

app.delete('/api/fuel/:id', requireAuth, async (req, res) => {
  try {
    const ok = await db.deleteFuelLog(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete-fuel error', err);
    res.status(500).json({ error: 'Failed to delete fuel log' });
  }
});

// ── Trip Logs ────────────────────────────────────────────────────────────────

// List logs for user (strip heavy track array for list view)
app.get('/api/trip-logs', requireAuth, async (req, res) => {
  try {
    const logs = await db.getTripLogs(req.user.id);
    res.json(logs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)));
  } catch (err) {
    console.error('get-trip-logs error', err);
    res.status(500).json({ error: 'Failed to load trip logs' });
  }
});

// Get full log including track
app.get('/api/trip-logs/:id', requireAuth, async (req, res) => {
  try {
    const log = await db.getTripLog(req.user.id, req.params.id);
    if (!log) return res.status(404).json({ error: 'Not found' });
    res.json(log);
  } catch (err) {
    console.error('get-trip-log error', err);
    res.status(500).json({ error: 'Failed to load trip log' });
  }
});

// Save completed trip log
app.post('/api/trip-logs', requireAuth, async (req, res) => {
  try {
    const { name, startedAt, endedAt, durationMin, distanceNm, maxSpeedKt, avgSpeedKt, track, boatId, boatName } = req.body;
    if (!startedAt || !track?.length) return res.status(400).json({ error: 'startedAt and track required' });
    const log = {
      id: `tl_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      userId: req.user.id,
      name: name || `Trip ${new Date(startedAt).toLocaleDateString()}`,
      startedAt, endedAt, durationMin: durationMin || 0,
      distanceNm: distanceNm || 0, maxSpeedKt: maxSpeedKt || 0, avgSpeedKt: avgSpeedKt || 0,
      boatId: boatId || null, boatName: boatName || null,
      track: track || [],
      createdAt: new Date().toISOString(),
    };
    await db.addTripLog(log);
    res.status(201).json(log);
  } catch (err) {
    console.error('add-trip-log error', err);
    res.status(500).json({ error: 'Failed to save trip log' });
  }
});

// Rename a trip log
app.patch('/api/trip-logs/:id', requireAuth, async (req, res) => {
  try {
    if (!req.body.name) return res.json({ ok: true });
    const ok = await db.renameTripLog(req.user.id, req.params.id, req.body.name.trim().slice(0, 80));
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('rename-trip-log error', err);
    res.status(500).json({ error: 'Failed to rename trip log' });
  }
});

app.delete('/api/trip-logs/:id', requireAuth, async (req, res) => {
  try {
    const ok = await db.deleteTripLog(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete-trip-log error', err);
    res.status(500).json({ error: 'Failed to delete trip log' });
  }
});

// ── Community Hazard Reports ─────────────────────────────────────────────────

app.get('/api/hazards', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const radius = parseFloat(req.query.radius) || 100;
    const hazards = await db.getHazards();
    if (!isNaN(lat) && !isNaN(lon)) {
      const near = hazards
        .map(h => ({ ...h, dist_km: Math.round(haversineKm(lat, lon, h.lat, h.lon) * 10) / 10 }))
        .filter(h => h.dist_km <= radius)
        .sort((a, b) => a.dist_km - b.dist_km);
      return res.json(near);
    }
    res.json(hazards);
  } catch (err) {
    console.error('get-hazards error', err);
    res.status(500).json({ error: 'Failed to load hazards' });
  }
});

app.post('/api/hazards', requireAuth, async (req, res) => {
  try {
    const { lat, lon, type, description } = req.body;
    if (!lat || !lon || !type) return res.status(400).json({ error: 'lat, lon, type required' });
    const hazard = {
      id:               Date.now().toString(),
      lat:              parseFloat(lat),
      lon:              parseFloat(lon),
      type,
      description:      (description || '').slice(0, 300),
      reportedBy:       req.user?.name || 'Anonymous',
      reportedByUserId: req.user?.id || null,
      reportedAt:       new Date().toISOString(),
      upvotes:          0,
    };
    await db.addHazard(hazard);
    res.status(201).json(hazard);
  } catch (err) {
    console.error('add-hazard error', err);
    res.status(500).json({ error: 'Failed to save hazard' });
  }
});

app.post('/api/hazards/:id/upvote', requireAuth, async (req, res) => {
  try {
    const h = await db.upvoteHazard(req.params.id);
    if (!h) return res.status(404).json({ error: 'Not found' });
    res.json(h);
  } catch (err) {
    console.error('upvote-hazard error', err);
    res.status(500).json({ error: 'Failed to upvote hazard' });
  }
});

app.delete('/api/hazards/:id', requireAuth, async (req, res) => {
  try {
    const ok = await db.deleteHazard(req.params.id, req.user?.name);
    if (!ok) return res.status(404).json({ error: 'Not found or not your report' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete-hazard error', err);
    res.status(500).json({ error: 'Failed to delete hazard' });
  }
});

// Active NWS weather alerts near a point
app.get('/api/noaa/alerts', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });
  try {
    const alerts = await noaa.getActiveAlerts(lat, lon);
    res.json(alerts);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// NWS hourly forecast for a point
app.get('/api/noaa/forecast', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });
  try {
    const periods = await noaa.getHourlyForecast(lat, lon);
    res.json(periods.slice(0, 24));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// NOAA tide predictions for nearest station
app.get('/api/noaa/tides', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });
  const station = noaa.getNearestStation(lat, lon);
  if (!station?.station) return res.status(404).json({ error: 'No tide station near this location' });
  const today    = new Date();
  const tomorrow = new Date(today.getTime() + 2 * 86400000);
  try {
    const preds = await noaa.getTidePredictions(station.station, noaa.formatDate(today), noaa.formatDate(tomorrow));
    res.json({ station: station.name, stationId: station.station, predictions: preds });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/noaa/currents', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const n   = Math.min(parseInt(req.query.n) || 8, 15);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });
  await noaa.loadCurrentStations();
  const nearby = noaa.getNearestCurrentStations(lat, lon, n);
  if (!nearby.length) return res.json([]);
  const results = await Promise.allSettled(nearby.map(async s => {
    const current = await noaa.fetchCurrentNow(s.id);
    return current ? { ...s, ...current } : null;
  }));
  res.json(results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean));
});

// ── Tide gauge ───────────────────────────────────────────────────────────────
const tideGaugeCache = new Map(); // stationId → { data, ts }

app.get('/api/noaa/tides/gauge', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });

  await noaa.loadTideStations();
  const station = noaa.getNearestTideStation(lat, lon);
  if (!station?.id) return res.status(404).json({ error: 'No tide station found' });

  const cached = tideGaugeCache.get(station.id);
  if (cached && Date.now() - cached.ts < 5 * 60000) return res.json(cached.data);

  const today    = noaa.formatDate(new Date());
  const tomorrow = noaa.formatDate(new Date(Date.now() + 86400000));

  try {
    const base = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter`;
    const common = `&datum=MLLW&station=${station.id}&time_zone=lst_ldt&units=english&format=json`;

    const [obsRes, predRes, hiloRes] = await Promise.all([
      fetch(`${base}?product=water_level${common}&date=today`, { headers: { 'User-Agent': 'SafeSeas/1.0' } }),
      fetch(`${base}?product=predictions${common}&begin_date=${today}&end_date=${today}&interval=h`, { headers: { 'User-Agent': 'SafeSeas/1.0' } }),
      fetch(`${base}?product=predictions${common}&begin_date=${today}&end_date=${tomorrow}&interval=hilo`, { headers: { 'User-Agent': 'SafeSeas/1.0' } }),
    ]);

    // Observed water level (real-time — may not exist for all stations)
    let currentFt = null, trend = 'unknown';
    try {
      const obsJson = await obsRes.json();
      const obs = obsJson.data || [];
      if (obs.length >= 2) {
        currentFt = parseFloat(obs[obs.length - 1].v);
        const prevFt = parseFloat(obs[obs.length - 2].v);
        trend = currentFt > prevFt + 0.04 ? 'rising' : currentFt < prevFt - 0.04 ? 'falling' : 'steady';
      } else if (obs.length === 1) {
        currentFt = parseFloat(obs[0].v);
      }
    } catch {}

    // Hourly predictions for chart
    const predJson = await predRes.json();
    const predictions = (predJson.predictions || []).map(p => ({ t: p.t, v: parseFloat(p.v) }));

    // If no real-time, interpolate current from predictions
    if (currentFt == null && predictions.length) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      let closest = predictions[0], closestDiff = Infinity;
      for (const p of predictions) {
        const [, time] = p.t.split(' ');
        const [h, m] = time.split(':').map(Number);
        const diff = Math.abs(h * 60 + m - nowMin);
        if (diff < closestDiff) { closestDiff = diff; closest = p; }
      }
      currentFt = closest.v;
    }

    // Hi/Lo predictions
    const hiloJson = await hiloRes.json();
    const now = new Date();
    const hilos = (hiloJson.predictions || []).map(p => ({ t: p.t, v: parseFloat(p.v), type: p.type }));
    const future = hilos.filter(p => {
      const [date, time] = p.t.split(' ');
      const d = new Date(`${date}T${time}:00`);
      return d > now;
    });
    const nextHigh = future.find(p => p.type === 'H') ?? null;
    const nextLow  = future.find(p => p.type === 'L') ?? null;

    const data = { station, currentFt, trend, predictions, hilos, nextHigh, nextLow, fetchedAt: new Date().toISOString() };
    tideGaugeCache.set(station.id, { data, ts: Date.now() });
    res.json(data);
  } catch (e) {
    console.warn('Tide gauge error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── Wind grid (Open-Meteo) ────────────────────────────────────────────────────
const windGridCache = new Map(); // cacheKey → { data, ts }

app.get('/api/weather/wind', async (req, res) => {
  const lat  = parseFloat(req.query.lat);
  const lon  = parseFloat(req.query.lon);
  const zoom = parseFloat(req.query.zoom) || 10;
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });

  const spacing = zoom >= 13 ? 0.08 : zoom >= 11 ? 0.18 : 0.40;
  const half    = 2; // 5×5 grid

  const snapLat  = Math.round(lat / spacing) * spacing;
  const snapLon  = Math.round(lon / spacing) * spacing;
  const cacheKey = `${snapLat.toFixed(3)},${snapLon.toFixed(3)},${spacing}`;
  const cached   = windGridCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 15 * 60000) return res.json(cached.data);

  const lats = [], lons = [];
  for (let i = -half; i <= half; i++) {
    for (let j = -half; j <= half; j++) {
      lats.push((lat + i * spacing).toFixed(4));
      lons.push((lon + j * spacing).toFixed(4));
    }
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lats.join(',')}&longitude=${lons.join(',')}&` +
      `hourly=windspeed_10m,winddirection_10m,windgusts_10m&` +
      `windspeed_unit=kn&forecast_days=1&timezone=UTC`;
    const r = await fetch(url, { headers: { 'User-Agent': 'SafeSeas/1.0' } });
    if (!r.ok) return res.status(502).json({ error: 'Open-Meteo error' });
    const raw = await r.json();

    const nowStr = new Date().toISOString().slice(0, 13) + ':00';
    const arr    = Array.isArray(raw) ? raw : [raw];
    const results = arr.map((d, i) => {
      const times = d.hourly?.time ?? [];
      let idx = times.indexOf(nowStr);
      if (idx < 0) idx = 0;
      const spd  = d.hourly?.windspeed_10m?.[idx];
      const dir  = d.hourly?.winddirection_10m?.[idx];
      const gust = d.hourly?.windgusts_10m?.[idx];
      if (spd == null || dir == null) return null;
      return {
        lat: parseFloat(lats[i]), lon: parseFloat(lons[i]),
        speedKt: Math.round(spd  * 10) / 10,
        dirDeg:  Math.round(dir),
        gustKt:  gust != null ? Math.round(gust * 10) / 10 : null,
      };
    }).filter(Boolean);

    windGridCache.set(cacheKey, { data: results, ts: Date.now() });
    res.json(results);
  } catch (e) {
    console.warn('Wind fetch error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── Wave forecast (Open-Meteo Marine) ────────────────────────────────────────
const waveCache = new Map(); // cacheKey → { data, ts }

app.get('/api/marine/waves', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' });

  const key = `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;
  const cached = waveCache.get(key);
  if (cached && Date.now() - cached.ts < 60 * 60000) return res.json(cached.data);

  try {
    const url = `https://marine-api.open-meteo.com/v1/marine?` +
      `latitude=${lat}&longitude=${lon}&` +
      `hourly=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period&` +
      `forecast_days=7&timezone=auto`;
    const r = await fetch(url, { headers: { 'User-Agent': 'SafeSeas/1.0' } });
    if (!r.ok) return res.status(502).json({ error: 'Marine API unavailable' });
    const raw = await r.json();

    if (!raw.hourly?.time) return res.status(404).json({ error: 'No wave data for this location' });

    const times  = raw.hourly.time;
    const waveH  = raw.hourly.wave_height;
    const waveD  = raw.hourly.wave_direction;
    const waveP  = raw.hourly.wave_period;
    const swellH = raw.hourly.swell_wave_height;
    const swellD = raw.hourly.swell_wave_direction;
    const swellP = raw.hourly.swell_wave_period;

    const toFt  = m => m != null ? Math.round(m * 3.281 * 10) / 10 : null;
    const getStatus = ft => ft == null ? 'go' : ft < 2 ? 'go' : ft < 4 ? 'caution' : 'nogo';

    const nowPrefix = new Date().toISOString().slice(0, 13);
    let nowIdx = times.findIndex(t => t.startsWith(nowPrefix));
    if (nowIdx < 0) nowIdx = 0;

    const current = {
      waveHeightFt: toFt(waveH[nowIdx]),
      wavePeriodS:  waveP[nowIdx] != null ? Math.round(waveP[nowIdx]) : null,
      waveDir:      waveD[nowIdx] != null ? Math.round(waveD[nowIdx]) : null,
      swellHeightFt: toFt(swellH[nowIdx]),
      swellDir:      swellD[nowIdx] != null ? Math.round(swellD[nowIdx]) : null,
      swellPeriodS:  swellP[nowIdx] != null ? Math.round(swellP[nowIdx]) : null,
      status: getStatus(toFt(waveH[nowIdx])),
    };

    // Group hourly into days
    const dayMap = {};
    times.forEach((t, i) => {
      const date = t.slice(0, 10);
      if (!dayMap[date]) dayMap[date] = [];
      dayMap[date].push({
        t, hour: parseInt(t.slice(11, 13)),
        waveHeightFt:  toFt(waveH[i]),
        wavePeriodS:   waveP[i]  != null ? Math.round(waveP[i])  : null,
        waveDir:       waveD[i]  != null ? Math.round(waveD[i])  : null,
        swellHeightFt: toFt(swellH[i]),
        swellDir:      swellD[i] != null ? Math.round(swellD[i]) : null,
        swellPeriodS:  swellP[i] != null ? Math.round(swellP[i]) : null,
      });
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const daily = Object.entries(dayMap).map(([date, hours], idx) => {
      const validH  = hours.map(h => h.waveHeightFt).filter(v => v != null);
      const maxFt   = validH.length ? Math.round(Math.max(...validH) * 10) / 10 : null;
      const avgFt   = validH.length ? Math.round(validH.reduce((a, b) => a + b, 0) / validH.length * 10) / 10 : null;
      const periods = hours.map(h => h.wavePeriodS).filter(Boolean);
      const avgPeriod = periods.length ? Math.round(periods.reduce((a, b) => a + b, 0) / periods.length) : null;
      const dirs      = hours.map(h => h.waveDir).filter(v => v != null);
      const dominantDir = dirs.length ? Math.round(dirs.reduce((a, b) => a + b, 0) / dirs.length) : null;
      const d = new Date(date + 'T12:00:00');
      const dayLabel  = date === todayStr ? 'Today' : idx === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
      const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { date, dayLabel, dateLabel, maxFt, avgFt, avgPeriodS: avgPeriod, dominantDir, status: getStatus(maxFt), hours };
    });

    const data = { current, daily, fetchedAt: new Date().toISOString() };
    waveCache.set(key, { data, ts: Date.now() });
    res.json(data);
  } catch (e) {
    console.warn('Wave forecast error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`SafeSeas API running on http://localhost:${PORT}`));
