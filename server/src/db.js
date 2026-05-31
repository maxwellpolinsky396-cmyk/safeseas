const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

// In-memory sessions: token -> userId (persisted to data.json on writes)
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

// ── JSON file store ──────────────────────────────────────────────────────────

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
        .map(u => ({ id:u.id, name:u.name }));
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
      for (const [token, uid] of sessions.entries()) {
        if (uid === userId) sessions.delete(token);
      }
      write(data);
    },

    // ── Preset catalog ──

    getPresetBoats: async () => STANDARD_BOATS,
  };
}

// ── MySQL store ──────────────────────────────────────────────────────────────

async function tryMySQL() {
  const mysql = require('mysql2/promise');
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'safeseas',
  };
  const conn = await mysql.createConnection(config);
  await conn.query('SELECT 1');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_boats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      type VARCHAR(128),
      year VARCHAR(32),
      length VARCHAR(64),
      wave_lim FLOAT,
      wind_lim FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await conn.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS user_id INT`);

  return {
    type: 'mysql',

    createUser: async (email, name, password) => {
      const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
      if (existing.length) throw new Error('Email already registered');
      const [result] = await conn.query(
        'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
        [email.toLowerCase(), name, hashPassword(password)]
      );
      const id = result.insertId;
      const token = generateToken();
      sessions.set(token, id);
      return { token, user: { id, email: email.toLowerCase(), name } };
    },

    loginUser: async (email, password) => {
      const [rows] = await conn.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
      const user = rows[0];
      if (!user) return null;
      if (!verifyPassword(password, user.password_hash)) return null;
      const token = generateToken();
      sessions.set(token, user.id);
      return { token, user: { id: user.id, email: user.email, name: user.name } };
    },

    getUserByToken: async (token) => {
      const userId = sessions.get(token);
      if (!userId) return null;
      const [rows] = await conn.query('SELECT id, email, name FROM users WHERE id = ?', [userId]);
      return rows[0] || null;
    },

    logoutUser: async (token) => {
      sessions.delete(token);
    },

    getBoats: async (userId) => {
      const [rows] = await conn.query(
        'SELECT id, name, description, type, year, length, wave_lim AS waveLim, wind_lim AS windLim, cruise_speed AS cruiseSpeed, fuel_cap AS fuelCap, fuel_burn AS fuelBurn, created_at FROM user_boats WHERE user_id = ?',
        [userId]
      );
      return rows;
    },

    addBoat: async (userId, boat) => {
      const [result] = await conn.query(
        'INSERT INTO user_boats (user_id, name, description, type, year, length, wave_lim, wind_lim, cruise_speed, fuel_cap, fuel_burn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, boat.name || '', boat.description || '', boat.type || '', boat.year || '', boat.length || '', boat.waveLim || null, boat.windLim || null, boat.cruiseSpeed || null, boat.fuelCap || null, boat.fuelBurn || null]
      );
      return result.insertId;
    },

    deleteBoat: async (userId, boatId) => {
      await conn.query('DELETE FROM user_boats WHERE id = ? AND user_id = ?', [boatId, userId]);
    },

    // ── Friends (MySQL stubs — JSON store is primary) ──
    searchUsers: async (q, excludeId) => {
      const [rows] = await conn.query(
        'SELECT id, name FROM users WHERE id != ? AND name LIKE ? LIMIT 8',
        [excludeId, `%${q}%`]
      );
      return rows;
    },
    sendFriendRequest: async (fromId, toId) => {
      throw new Error('Not implemented for MySQL');
    },
    respondFriendRequest: async (requestId, userId, action) => {
      throw new Error('Not implemented for MySQL');
    },
    getFriends: async (userId) => {
      return { friends: [], incoming: [], outgoing: [] };
    },

    getTrips: async (userId) => {
      const [rows] = await conn.query(
        'SELECT * FROM trips WHERE user_id = ? ORDER BY id DESC',
        [userId]
      );
      return rows;
    },

    addTrip: async (userId, trip) => {
      const [result] = await conn.query(
        'INSERT INTO trips (`name`, `from`, `to`, notes, status, boatId, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [trip.name || '', trip.from || '', trip.to || '', trip.notes || '', trip.status || '', trip.boatId || null, userId, new Date()]
      );
      return result.insertId;
    },

    updatePassword: async (email, newPassword) => {
      await conn.query(
        'UPDATE users SET password_hash = ? WHERE email = ?',
        [hashPassword(newPassword), email.toLowerCase()]
      );
    },

    verifyUserPassword: async (userId, password) => {
      const [rows] = await conn.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
      const user = rows[0];
      if (!user) return false;
      return verifyPassword(password, user.password_hash);
    },

    deleteUser: async (userId) => {
      await conn.query('DELETE FROM user_boats WHERE user_id = ?', [userId]);
      await conn.query('DELETE FROM trips WHERE user_id = ?', [userId]);
      await conn.query('DELETE FROM users WHERE id = ?', [userId]);
      for (const [token, uid] of sessions.entries()) {
        if (uid === userId) sessions.delete(token);
      }
    },

    getPresetBoats: async () => STANDARD_BOATS,
  };
}

// ── Lazy-init singleton ──────────────────────────────────────────────────────

let impl = null;

async function init() {
  if (impl) return impl;
  try {
    impl = await tryMySQL();
    console.log('DB: connected to MySQL');
  } catch (err) {
    console.warn('DB: MySQL unavailable, using JSON store');
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
};
