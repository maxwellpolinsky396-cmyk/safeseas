const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// node-postgres returns BIGINT (OID 20) columns as strings to avoid precision
// loss beyond Number.MAX_SAFE_INTEGER. This app's ids never get remotely close
// to that, and the JSON/MySQL stores always returned numeric ids — parse as
// number here so callers (including the frontend's strict `===` id checks)
// keep seeing the same shape regardless of which store is active.
require('pg').types.setTypeParser(20, (val) => parseInt(val, 10));

const DATA_FILE = path.join(__dirname, '..', 'data.json');
const HAZARDS_FILE = path.join(__dirname, '..', 'data', 'hazards.json');
const FUEL_LOG_FILE = path.join(__dirname, '..', 'data', 'fuel_logs.json');
const TRIP_LOG_FILE = path.join(__dirname, '..', 'data', 'trip_logs.json');

// In-memory sessions: token -> userId (persisted to data.json on writes, JSON store only)
const sessions = new Map();

const STANDARD_BOATS = [
  { id: 'preset_1', name: '2022 Maverick 18 HPX-V', type: 'Center console', year: '2022', length: '18 ft', waveLim: 2.0, windLim: 15, description: 'Shallow-water flats boat built for coastal fishing.' },
  { id: 'preset_2', name: '2022 Yellowfin 17 CE', type: 'Center console', year: '2022', length: '17 ft', waveLim: 2.2, windLim: 16, description: 'Lightweight carbon elite center console for nearshore trips.' },
  { id: 'preset_3', name: 'Chittum Islamorada 18', type: 'Skiff', year: '2021', length: '18 ft', waveLim: 2.0, windLim: 15, description: 'Versatile flats skiff designed for shallow-water fishing.' },
  { id: 'preset_4', name: "Hell's Bay Islamorada 21", type: 'Skiff', year: '2021', length: '21 ft', waveLim: 2.5, windLim: 18, description: 'High-performance flats skiff for rougher nearshore conditions.' },
  { id: 'preset_5', name: 'Beavertail Mosquito', type: 'Skiff', year: '2020', length: '14 ft', waveLim: 1.2, windLim: 12, description: 'Small, lightweight bay skiff for calm water and short trips.' },
  { id: 'preset_6', name: 'East Cape EVO', type: 'Skiff', year: '2022', length: '17 ft', waveLim: 2.0, windLim: 15, description: 'Bay skiff tuned for flats, inlets, and close-coastal runs.' },
  { id: 'preset_7', name: 'Bay Craft Bone Skiff 162', type: 'Skiff', year: '2021', length: '16 ft', waveLim: 1.8, windLim: 14, description: 'Stable flats boat with shallow draft and a compact profile.' },
  { id: 'preset_8', name: 'MAKO Pro Skiff 17 CC', type: 'Center console', year: '2022', length: '17 ft', waveLim: 2.2, windLim: 16, description: 'Heavy-duty pro skiff built for sport fishing in coastal waters.' },
  { id: 'preset_9', name: 'Floyd Skiff Co. 10 WT', type: 'Skiff', year: '2023', length: '10 ft', waveLim: 1.0, windLim: 10, description: 'Very light, shallow-water tender best for protected water.' },
];

// ── Password / token utilities ──────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── JSON file store (local dev fallback when DATABASE_URL is not set) ───────

function jsonStore() {
  function read() {
    if (!fs.existsSync(DATA_FILE)) {
      const init = { users: [], sessions: {}, userBoats: [], trips: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
      return init;
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Migrate old format (has 'boats' but no 'users')
    if (!raw.users) {
      const fresh = { users: [], sessions: {}, userBoats: [], trips: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    // Restore persisted sessions into in-memory Map
    if (raw.sessions) {
      for (const [token, userId] of Object.entries(raw.sessions)) {
        sessions.set(token, userId);
      }
    }
    return raw;
  }

  function write(data) {
    const sessObj = {};
    for (const [token, userId] of sessions.entries()) {
      sessObj[token] = userId;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify({ ...data, sessions: sessObj }, null, 2));
  }

  function loadJsonArray(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return []; }
  }
  function saveJsonArray(file, arr) {
    fs.writeFileSync(file, JSON.stringify(arr, null, 2));
  }

  // Restore sessions on init
  read();

  return {
    type: 'json',

    // ── Auth ──

    createUser: async (email, name, password) => {
      const data = read();
      if (data.users.find(u => u.email === email.toLowerCase())) {
        throw new Error('Email already registered');
      }
      const id = (data.users.reduce((m, u) => Math.max(m, u.id || 0), 0)) + 1;
      const user = {
        id,
        email: email.toLowerCase(),
        name,
        passwordHash: hashPassword(password),
        created_at: new Date().toISOString(),
      };
      data.users.push(user);
      const token = generateToken();
      sessions.set(token, id);
      write(data);
      return { token, user: { id, email: user.email, name } };
    },

    loginUser: async (email, password) => {
      const data = read();
      const user = data.users.find(u => u.email === email.toLowerCase());
      if (!user) return null;
      if (!verifyPassword(password, user.passwordHash)) return null;
      const token = generateToken();
      sessions.set(token, user.id);
      write(data);
      return { token, user: { id: user.id, email: user.email, name: user.name } };
    },

    getUserByToken: async (token) => {
      const userId = sessions.get(token);
      if (!userId) return null;
      const data = read();
      const user = data.users.find(u => u.id === userId);
      if (!user) return null;
      return { id: user.id, email: user.email, name: user.name };
    },

    logoutUser: async (token) => {
      sessions.delete(token);
      const data = read();
      write(data);
    },

    // ── Boats (per-user) ──

    getBoats: async (userId) => {
      const data = read();
      return (data.userBoats || []).filter(b => b.userId === userId);
    },

    addBoat: async (userId, boat) => {
      const data = read();
      if (!data.userBoats) data.userBoats = [];
      const id = (data.userBoats.reduce((m, b) => Math.max(m, b.id || 0), 0)) + 1;
      const toSave = { id, userId, created_at: new Date().toISOString(), ...boat };
      data.userBoats.push(toSave);
      write(data);
      return id;
    },

    deleteBoat: async (userId, boatId) => {
      const data = read();
      data.userBoats = (data.userBoats || []).filter(
        b => !(b.id === boatId && b.userId === userId)
      );
      write(data);
    },

    // ── Friends ──
    searchUsers: async (q, excludeId) => {
      const data = read();
      const qLower = q.toLowerCase();
      return (data.users||[])
        .filter(u => u.id !== excludeId && u.name.toLowerCase().includes(qLower))
        .slice(0,8)
        .map(u => {
          const boats = (data.userBoats || []).filter(b => b.userId === u.id);
          const trips = (data.trips || [])
            .filter(t => t.userId === u.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 3);
          return {
            id: u.id, name: u.name,
            memberSince: u.created_at,
            boats: boats.map(b => ({ name: b.name, type: b.type, length: b.length })),
            recentRoutes: trips.map(t => ({ from: t.from, to: t.to })),
          };
        });
    },
    sendFriendRequest: async (fromId, toId) => {
      const data = read();
      if (!data.friendRequests) data.friendRequests = [];
      const existing = data.friendRequests.find(r =>
        ((r.fromId===fromId && r.toId===toId)||(r.fromId===toId && r.toId===fromId)) && r.status!=='declined'
      );
      if (existing) throw new Error('Friend request already exists');
      const id = (data.friendRequests.reduce((m,r)=>Math.max(m,r.id||0),0))+1;
      data.friendRequests.push({ id, fromId, toId, status:'pending', ts:Date.now() });
      write(data);
      return id;
    },
    respondFriendRequest: async (requestId, userId, action) => {
      const data = read();
      const req = (data.friendRequests||[]).find(r=>r.id===requestId && r.toId===userId);
      if (!req) throw new Error('Request not found');
      req.status = action==='accept' ? 'accepted' : 'declined';
      write(data);
    },
    getFriends: async (userId) => {
      const data = read();
      const reqs = data.friendRequests||[];
      const users = data.users||[];
      const resolve = id => { const u=users.find(u=>u.id===id); return u?{id:u.id,name:u.name}:{id,name:'Unknown'}; };
      return {
        friends: reqs.filter(r=>r.status==='accepted'&&(r.fromId===userId||r.toId===userId))
          .map(r=>({ requestId:r.id, ...resolve(r.fromId===userId?r.toId:r.fromId) })),
        incoming: reqs.filter(r=>r.toId===userId&&r.status==='pending')
          .map(r=>({ requestId:r.id, ...resolve(r.fromId) })),
        outgoing: reqs.filter(r=>r.fromId===userId&&r.status==='pending')
          .map(r=>({ requestId:r.id, ...resolve(r.toId) })),
      };
    },

    // ── Trips (per-user) ──

    getTrips: async (userId) => {
      const data = read();
      return (data.trips || [])
        .filter(t => t.userId === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },

    getUserPublicProfile: async (userId) => {
      const data = read();
      const user = data.users.find(u => u.id === userId);
      if (!user) return null;
      const boats = (data.userBoats || []).filter(b => b.userId === userId);
      const trips = (data.trips || [])
        .filter(t => t.userId === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
      return {
        id: user.id,
        name: user.name,
        memberSince: user.created_at,
        boats: boats.map(b => ({ name: b.name, type: b.type, length: b.length, year: b.year })),
        recentRoutes: trips.map(t => ({ from: t.from, to: t.to, date: t.created_at })),
      };
    },

    addTrip: async (userId, trip) => {
      const data = read();
      const id = (data.trips.reduce((m, t) => Math.max(m, t.id || 0), 0)) + 1;
      const toSave = { id, userId, created_at: new Date().toISOString(), ...trip };
      data.trips.push(toSave);
      write(data);
      return id;
    },

    // ── Password reset ──

    updatePassword: async (email, newPassword) => {
      const data = read();
      const user = data.users.find(u => u.email === email.toLowerCase());
      if (!user) throw new Error('User not found');
      user.passwordHash = hashPassword(newPassword);
      write(data);
    },

    verifyUserPassword: async (userId, password) => {
      const data = read();
      const user = data.users.find(u => u.id === userId);
      if (!user) return false;
      return verifyPassword(password, user.passwordHash);
    },

    deleteUser: async (userId) => {
      const data = read();
      data.users = data.users.filter(u => u.id !== userId);
      data.userBoats = (data.userBoats || []).filter(b => b.userId !== userId);
      data.trips = (data.trips || []).filter(t => t.userId !== userId);
      data.friendRequests = (data.friendRequests || []).filter(r => r.fromId !== userId && r.toId !== userId);
      for (const [token, uid] of sessions.entries()) {
        if (uid === userId) sessions.delete(token);
      }
      write(data);
      saveJsonArray(FUEL_LOG_FILE, loadJsonArray(FUEL_LOG_FILE).filter(e => e.userId !== userId));
      saveJsonArray(TRIP_LOG_FILE, loadJsonArray(TRIP_LOG_FILE).filter(l => l.userId !== userId));
    },

    // ── Preset catalog ──

    getPresetBoats: async () => STANDARD_BOATS,

    // ── Hazards (community reports) ──

    getHazards: async () => loadJsonArray(HAZARDS_FILE),

    addHazard: async (hazard) => {
      const arr = loadJsonArray(HAZARDS_FILE);
      arr.push(hazard);
      saveJsonArray(HAZARDS_FILE, arr);
      return hazard;
    },

    upvoteHazard: async (hazardId) => {
      const arr = loadJsonArray(HAZARDS_FILE);
      const h = arr.find(x => x.id === hazardId);
      if (!h) return null;
      h.upvotes = (h.upvotes || 0) + 1;
      saveJsonArray(HAZARDS_FILE, arr);
      return h;
    },

    deleteHazard: async (hazardId, reporterName) => {
      const arr = loadJsonArray(HAZARDS_FILE);
      const idx = arr.findIndex(x => x.id === hazardId && x.reportedBy === reporterName);
      if (idx === -1) return false;
      arr.splice(idx, 1);
      saveJsonArray(HAZARDS_FILE, arr);
      return true;
    },

    // ── Fuel logs (per-user) ──

    getFuelLogs: async (userId, boatId) => {
      const arr = loadJsonArray(FUEL_LOG_FILE);
      return arr.filter(e => e.userId === userId && (!boatId || e.boatId === boatId));
    },

    addFuelLog: async (entry) => {
      const arr = loadJsonArray(FUEL_LOG_FILE);
      arr.push(entry);
      saveJsonArray(FUEL_LOG_FILE, arr);
      return entry;
    },

    deleteFuelLog: async (userId, entryId) => {
      const arr = loadJsonArray(FUEL_LOG_FILE);
      const idx = arr.findIndex(e => e.id === entryId && e.userId === userId);
      if (idx === -1) return false;
      arr.splice(idx, 1);
      saveJsonArray(FUEL_LOG_FILE, arr);
      return true;
    },

    // ── GPS trip logs (per-user) ──

    getTripLogs: async (userId) => {
      const arr = loadJsonArray(TRIP_LOG_FILE);
      return arr.filter(l => l.userId === userId);
    },

    getTripLog: async (userId, logId) => {
      const arr = loadJsonArray(TRIP_LOG_FILE);
      return arr.find(l => l.id === logId && l.userId === userId) || null;
    },

    addTripLog: async (log) => {
      const arr = loadJsonArray(TRIP_LOG_FILE);
      arr.push(log);
      saveJsonArray(TRIP_LOG_FILE, arr);
      return log;
    },

    renameTripLog: async (userId, logId, name) => {
      const arr = loadJsonArray(TRIP_LOG_FILE);
      const log = arr.find(l => l.id === logId && l.userId === userId);
      if (!log) return false;
      log.name = name;
      saveJsonArray(TRIP_LOG_FILE, arr);
      return true;
    },

    deleteTripLog: async (userId, logId) => {
      const arr = loadJsonArray(TRIP_LOG_FILE);
      const idx = arr.findIndex(l => l.id === logId && l.userId === userId);
      if (idx === -1) return false;
      arr.splice(idx, 1);
      saveJsonArray(TRIP_LOG_FILE, arr);
      return true;
    },
  };
}

// ── Postgres store (Supabase) ────────────────────────────────────────────────

async function tryPostgres() {
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await pool.query('SELECT 1');

  return {
    type: 'postgres',

    // ── Auth ──

    createUser: async (email, name, password) => {
      const emailLower = email.toLowerCase();
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [emailLower]);
      if (existing.rows.length) throw new Error('Email already registered');
      const { rows } = await pool.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [emailLower, name, hashPassword(password)]
      );
      const id = rows[0].id;
      const token = generateToken();
      await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, id]);
      return { token, user: { id, email: emailLower, name } };
    },

    loginUser: async (email, password) => {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
      const user = rows[0];
      if (!user) return null;
      if (!verifyPassword(password, user.password_hash)) return null;
      const token = generateToken();
      await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, user.id]);
      return { token, user: { id: user.id, email: user.email, name: user.name } };
    },

    getUserByToken: async (token) => {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.name FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = $1`,
        [token]
      );
      return rows[0] || null;
    },

    logoutUser: async (token) => {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    },

    // ── Boats (per-user) ──

    getBoats: async (userId) => {
      const { rows } = await pool.query(
        `SELECT id, name, description, type, year, length,
                wave_lim AS "waveLim", wind_lim AS "windLim",
                cruise_speed AS "cruiseSpeed", fuel_cap AS "fuelCap", fuel_burn AS "fuelBurn",
                created_at
         FROM user_boats WHERE user_id = $1 ORDER BY id`,
        [userId]
      );
      return rows;
    },

    addBoat: async (userId, boat) => {
      const { rows } = await pool.query(
        `INSERT INTO user_boats
           (user_id, name, description, type, year, length, wave_lim, wind_lim, cruise_speed, fuel_cap, fuel_burn)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [userId, boat.name || '', boat.description || '', boat.type || '', boat.year || '', boat.length || '',
         boat.waveLim || null, boat.windLim || null, boat.cruiseSpeed || null, boat.fuelCap || null, boat.fuelBurn || null]
      );
      return rows[0].id;
    },

    deleteBoat: async (userId, boatId) => {
      await pool.query('DELETE FROM user_boats WHERE id = $1 AND user_id = $2', [boatId, userId]);
    },

    // ── Friends ──

    searchUsers: async (q, excludeId) => {
      const { rows: users } = await pool.query(
        'SELECT id, name, created_at FROM users WHERE id != $1 AND name ILIKE $2 LIMIT 8',
        [excludeId, `%${q}%`]
      );
      const out = [];
      for (const u of users) {
        const { rows: boats } = await pool.query(
          'SELECT name, type, length FROM user_boats WHERE user_id = $1', [u.id]
        );
        const { rows: trips } = await pool.query(
          `SELECT "from", "to" FROM trips WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`, [u.id]
        );
        out.push({
          id: u.id, name: u.name,
          memberSince: u.created_at,
          boats,
          recentRoutes: trips,
        });
      }
      return out;
    },

    sendFriendRequest: async (fromId, toId) => {
      const { rows: existing } = await pool.query(
        `SELECT id FROM friend_requests
         WHERE ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)) AND status != 'declined'`,
        [fromId, toId]
      );
      if (existing.length) throw new Error('Friend request already exists');
      const { rows } = await pool.query(
        `INSERT INTO friend_requests (from_id, to_id, status) VALUES ($1, $2, 'pending') RETURNING id`,
        [fromId, toId]
      );
      return rows[0].id;
    },

    respondFriendRequest: async (requestId, userId, action) => {
      const status = action === 'accept' ? 'accepted' : 'declined';
      const { rowCount } = await pool.query(
        `UPDATE friend_requests SET status = $1 WHERE id = $2 AND to_id = $3`,
        [status, requestId, userId]
      );
      if (!rowCount) throw new Error('Request not found');
    },

    getFriends: async (userId) => {
      const { rows } = await pool.query(
        `SELECT fr.id AS request_id, fr.from_id, fr.to_id, fr.status,
                u.id AS other_id, u.name AS other_name
         FROM friend_requests fr
         JOIN users u ON u.id = (CASE WHEN fr.from_id = $1 THEN fr.to_id ELSE fr.from_id END)
         WHERE fr.from_id = $1 OR fr.to_id = $1`,
        [userId]
      );
      const friends = [], incoming = [], outgoing = [];
      for (const r of rows) {
        const entry = { requestId: r.request_id, id: r.other_id, name: r.other_name };
        if (r.status === 'accepted') friends.push(entry);
        else if (r.status === 'pending' && r.to_id === userId) incoming.push(entry);
        else if (r.status === 'pending' && r.from_id === userId) outgoing.push(entry);
      }
      return { friends, incoming, outgoing };
    },

    // ── Trips (per-user) ──

    getTrips: async (userId) => {
      const { rows } = await pool.query(
        `SELECT id, user_id AS "userId", name, "from", "to", notes, status, boat_id AS "boatId", created_at
         FROM trips WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return rows;
    },

    addTrip: async (userId, trip) => {
      const { rows } = await pool.query(
        `INSERT INTO trips (user_id, name, "from", "to", notes, status, boat_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, trip.name || '', trip.from || '', trip.to || '', trip.notes || '', trip.status || '', trip.boatId || null]
      );
      return rows[0].id;
    },

    getUserPublicProfile: async (userId) => {
      const { rows: userRows } = await pool.query('SELECT id, name, created_at FROM users WHERE id = $1', [userId]);
      const user = userRows[0];
      if (!user) return null;
      const { rows: boats } = await pool.query(
        'SELECT name, type, length, year FROM user_boats WHERE user_id = $1', [userId]
      );
      const { rows: trips } = await pool.query(
        `SELECT "from", "to", created_at AS date FROM trips WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [userId]
      );
      return {
        id: user.id,
        name: user.name,
        memberSince: user.created_at,
        boats,
        recentRoutes: trips,
      };
    },

    // ── Password reset ──

    updatePassword: async (email, newPassword) => {
      const { rowCount } = await pool.query(
        'UPDATE users SET password_hash = $1 WHERE email = $2',
        [hashPassword(newPassword), email.toLowerCase()]
      );
      if (!rowCount) throw new Error('User not found');
    },

    verifyUserPassword: async (userId, password) => {
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user) return false;
      return verifyPassword(password, user.password_hash);
    },

    deleteUser: async (userId) => {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      // user_boats/trips/sessions/friend_requests cascade via FK ON DELETE CASCADE
    },

    // ── Preset catalog ──

    getPresetBoats: async () => STANDARD_BOATS,

    // ── Hazards (community reports) ──

    getHazards: async () => {
      const { rows } = await pool.query(
        `SELECT id, lat, lon, type, description,
                reported_by AS "reportedBy", reported_by_user_id AS "reportedByUserId",
                reported_at AS "reportedAt", upvotes
         FROM hazards ORDER BY reported_at DESC`
      );
      return rows;
    },

    addHazard: async (hazard) => {
      await pool.query(
        `INSERT INTO hazards (id, lat, lon, type, description, reported_by, reported_by_user_id, reported_at, upvotes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [hazard.id, hazard.lat, hazard.lon, hazard.type, hazard.description || '',
         hazard.reportedBy || null, hazard.reportedByUserId || null, hazard.reportedAt, hazard.upvotes || 0]
      );
      return hazard;
    },

    upvoteHazard: async (hazardId) => {
      const { rows } = await pool.query(
        `UPDATE hazards SET upvotes = upvotes + 1 WHERE id = $1
         RETURNING id, lat, lon, type, description, reported_by AS "reportedBy", reported_at AS "reportedAt", upvotes`,
        [hazardId]
      );
      return rows[0] || null;
    },

    deleteHazard: async (hazardId, reporterName) => {
      const { rowCount } = await pool.query(
        'DELETE FROM hazards WHERE id = $1 AND reported_by = $2',
        [hazardId, reporterName]
      );
      return rowCount > 0;
    },

    // ── Fuel logs (per-user) ──

    getFuelLogs: async (userId, boatId) => {
      const { rows } = await pool.query(
        `SELECT id, user_id AS "userId", boat_id AS "boatId", gallons,
                price_per_gal AS "pricePerGal", total_cost AS "totalCost",
                location_name AS "locationName", lat, lon, note,
                fill_to_full AS "fillToFull", date
         FROM fuel_logs WHERE user_id = $1 AND ($2::bigint IS NULL OR boat_id = $2)
         ORDER BY date DESC`,
        [userId, boatId || null]
      );
      return rows;
    },

    addFuelLog: async (entry) => {
      await pool.query(
        `INSERT INTO fuel_logs (id, user_id, boat_id, gallons, price_per_gal, total_cost, location_name, lat, lon, note, fill_to_full, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [entry.id, entry.userId, entry.boatId, entry.gallons, entry.pricePerGal, entry.totalCost,
         entry.locationName, entry.lat, entry.lon, entry.note || '', entry.fillToFull || false, entry.date]
      );
      return entry;
    },

    deleteFuelLog: async (userId, entryId) => {
      const { rowCount } = await pool.query(
        'DELETE FROM fuel_logs WHERE id = $1 AND user_id = $2',
        [entryId, userId]
      );
      return rowCount > 0;
    },

    // ── GPS trip logs (per-user) ──

    getTripLogs: async (userId) => {
      const { rows } = await pool.query(
        `SELECT id, user_id AS "userId", name, started_at AS "startedAt", ended_at AS "endedAt",
                duration_min AS "durationMin", distance_nm AS "distanceNm",
                max_speed_kt AS "maxSpeedKt", avg_speed_kt AS "avgSpeedKt",
                boat_id AS "boatId", boat_name AS "boatName", created_at AS "createdAt"
         FROM trip_logs WHERE user_id = $1 ORDER BY started_at DESC`,
        [userId]
      );
      return rows;
    },

    getTripLog: async (userId, logId) => {
      const { rows } = await pool.query(
        `SELECT id, user_id AS "userId", name, started_at AS "startedAt", ended_at AS "endedAt",
                duration_min AS "durationMin", distance_nm AS "distanceNm",
                max_speed_kt AS "maxSpeedKt", avg_speed_kt AS "avgSpeedKt",
                boat_id AS "boatId", boat_name AS "boatName", track, created_at AS "createdAt"
         FROM trip_logs WHERE id = $1 AND user_id = $2`,
        [logId, userId]
      );
      return rows[0] || null;
    },

    addTripLog: async (log) => {
      await pool.query(
        `INSERT INTO trip_logs
           (id, user_id, name, started_at, ended_at, duration_min, distance_nm, max_speed_kt, avg_speed_kt, boat_id, boat_name, track, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [log.id, log.userId, log.name, log.startedAt, log.endedAt, log.durationMin, log.distanceNm,
         log.maxSpeedKt, log.avgSpeedKt, log.boatId, log.boatName, JSON.stringify(log.track || []), log.createdAt]
      );
      return log;
    },

    renameTripLog: async (userId, logId, name) => {
      const { rowCount } = await pool.query(
        'UPDATE trip_logs SET name = $1 WHERE id = $2 AND user_id = $3',
        [name, logId, userId]
      );
      return rowCount > 0;
    },

    deleteTripLog: async (userId, logId) => {
      const { rowCount } = await pool.query(
        'DELETE FROM trip_logs WHERE id = $1 AND user_id = $2',
        [logId, userId]
      );
      return rowCount > 0;
    },
  };
}

// ── Lazy-init singleton ──────────────────────────────────────────────────────

let impl = null;

async function init() {
  if (impl) return impl;
  try {
    impl = await tryPostgres();
    console.log('DB: connected to Supabase (Postgres)');
  } catch (err) {
    console.warn('DB: Supabase/Postgres unavailable, using JSON store —', err.message);
    impl = jsonStore();
  }
  return impl;
}

module.exports = {
  updatePassword: async (email, newPassword) => (await init()).updatePassword(email, newPassword),
  verifyUserPassword: async (userId, password) => (await init()).verifyUserPassword(userId, password),
  deleteUser: async (userId) => (await init()).deleteUser(userId),
  getPresetBoats: async () => (await init()).getPresetBoats(),
  getBoats: async (userId) => (await init()).getBoats(userId),
  addBoat: async (userId, boat) => (await init()).addBoat(userId, boat),
  deleteBoat: async (userId, boatId) => (await init()).deleteBoat(userId, boatId),
  getTrips: async (userId) => (await init()).getTrips(userId),
  addTrip: async (userId, trip) => (await init()).addTrip(userId, trip),
  createUser: async (email, name, password) => (await init()).createUser(email, name, password),
  loginUser: async (email, password) => (await init()).loginUser(email, password),
  getUserByToken: async (token) => (await init()).getUserByToken(token),
  logoutUser: async (token) => (await init()).logoutUser(token),
  searchUsers: async (q, excludeId) => (await init()).searchUsers(q, excludeId),
  sendFriendRequest: async (fromId, toId) => (await init()).sendFriendRequest(fromId, toId),
  respondFriendRequest: async (requestId, userId, action) => (await init()).respondFriendRequest(requestId, userId, action),
  getFriends: async (userId) => (await init()).getFriends(userId),
  getUserPublicProfile: async (userId) => (await init()).getUserPublicProfile(userId),

  getHazards: async () => (await init()).getHazards(),
  addHazard: async (hazard) => (await init()).addHazard(hazard),
  upvoteHazard: async (hazardId) => (await init()).upvoteHazard(hazardId),
  deleteHazard: async (hazardId, reporterName) => (await init()).deleteHazard(hazardId, reporterName),

  getFuelLogs: async (userId, boatId) => (await init()).getFuelLogs(userId, boatId),
  addFuelLog: async (entry) => (await init()).addFuelLog(entry),
  deleteFuelLog: async (userId, entryId) => (await init()).deleteFuelLog(userId, entryId),

  getTripLogs: async (userId) => (await init()).getTripLogs(userId),
  getTripLog: async (userId, logId) => (await init()).getTripLog(userId, logId),
  addTripLog: async (log) => (await init()).addTripLog(log),
  renameTripLog: async (userId, logId, name) => (await init()).renameTripLog(userId, logId, name),
  deleteTripLog: async (userId, logId) => (await init()).deleteTripLog(userId, logId),
};
