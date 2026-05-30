require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./src/db');
const safety = require('./src/safety');
const geocode = require('./src/geocode');
const mailer = require('./src/mailer');
const maritime = require('./src/maritime');

// In-memory store: email -> { code, expires }
const resetCodes = new Map();

const app = express();
app.use(cors());
app.use(express.json());

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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`SafeSeas API running on http://localhost:${PORT}`));
