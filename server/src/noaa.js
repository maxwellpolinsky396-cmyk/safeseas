const fs   = require('fs');
const path = require('path');

const fetch = globalThis.fetch;
if (typeof fetch !== 'function') {
  throw new Error('Global fetch is not available in this Node runtime.');
}

const BASE_WEATHER = 'https://api.weather.gov';
const BASE_TIDE    = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const DATA_DIR     = path.join(__dirname, '../data');

// ── Static data loaded at startup ────────────────────────────────────────────

let ndbcStations = [];
let bridgeFeatures = [];

function loadStaticData() {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'ndbc_stations.json'), 'utf8');
    ndbcStations = JSON.parse(raw);
    console.log(`NDBC stations loaded: ${ndbcStations.length}`);
  } catch { console.warn('ndbc_stations.json not found — run scripts/download-noaa-data.js'); }

  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'noaa_bridges.geojson'), 'utf8');
    const gc  = JSON.parse(raw);
    bridgeFeatures = gc.features || [];
    console.log(`NOAA bridges loaded: ${bridgeFeatures.length}`);
  } catch { console.warn('noaa_bridges.geojson not found — run scripts/download-noaa-data.js'); }
}

// ── Location lookup (name → lat/lon/tide-station) ───────────────────────────

const LOCATION_LOOKUP = {
  'Anna Maria Island': { lat: 27.5048, lon: -82.7384, station: '8720530' },
  'Egmont Key':        { lat: 27.4309, lon: -82.7269, station: '8720870' },
  'Fort Myers Beach':  { lat: 26.4516, lon: -81.9449, station: '8721890' },
  'Amelia Island':     { lat: 30.6698, lon: -81.4628, station: '8720218' },
  'Fernandina Beach':  { lat: 30.6696, lon: -81.4604, station: '8720218' },
  'Sarasota':          { lat: 27.3364, lon: -82.5307, station: '8720390' },
  'St. Petersburg':    { lat: 27.7676, lon: -82.6403, station: '8720530' },
};

function cleanName(name) { return name ? name.trim().toLowerCase() : ''; }

function lookupLocation(name) {
  const clean = cleanName(name);
  if (!clean) return null;
  if (LOCATION_LOOKUP[name]) return LOCATION_LOOKUP[name];
  for (const key of Object.keys(LOCATION_LOOKUP)) {
    if (clean.includes(key.toLowerCase())) return LOCATION_LOOKUP[key];
  }
  return null;
}

// ── Haversine ────────────────────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Tide station lookup ───────────────────────────────────────────────────────

function getNearestStation(lat, lon) {
  let best = null, bestDist = Infinity;
  for (const key of Object.keys(LOCATION_LOOKUP)) {
    const s = LOCATION_LOOKUP[key];
    if (!s?.lat || !s?.station) continue;
    const d = haversine(lat, lon, s.lat, s.lon);
    if (d < bestDist) { bestDist = d; best = { name: key, distance_km: d, ...s }; }
  }
  return best;
}

// ── NDBC buoy lookup ─────────────────────────────────────────────────────────

function getNearestBuoys(lat, lon, n = 3) {
  return ndbcStations
    .map(s => ({ ...s, distance_km: haversine(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, n);
}

async function getBuoyObservations(stationId) {
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId.toLowerCase()}.txt`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SafeSeas/1.0' } });
  if (!res.ok) throw new Error(`NDBC ${res.status}`);
  const text = await res.text();

  const allLines = text.split('\n');
  const headerLine = allLines.find(l => l.startsWith('#YY'));
  const dataLines  = allLines.filter(l => l.trim() && !l.startsWith('#'));
  if (!headerLine || !dataLines.length) return null;

  const cols = headerLine.replace(/^#/, '').trim().split(/\s+/);
  // Use first row that has at least some non-MM values
  const vals = dataLines[0].trim().split(/\s+/);

  const get = (col) => {
    const i = cols.indexOf(col);
    if (i < 0) return null;
    const v = parseFloat(vals[i]);
    return isNaN(v) || vals[i] === 'MM' ? null : v;
  };

  const wspd = get('WSPD'); // m/s
  const gst  = get('GST');
  const wvht = get('WVHT'); // meters
  const wdir = get('WDIR');
  const atmp = get('ATMP');
  const wtmp = get('WTMP');
  const pres = get('PRES');

  return {
    stationId,
    windSpeed_kt:   wspd != null ? Math.round(wspd * 1.944) : null,  // m/s → knots
    windGust_kt:    gst  != null ? Math.round(gst  * 1.944) : null,
    windDir_deg:    wdir,
    waveHeight_ft:  wvht != null ? Math.round(wvht * 3.281 * 10) / 10 : null, // m → ft
    airTemp_f:      atmp != null ? Math.round(atmp * 9/5 + 32)  : null,
    waterTemp_f:    wtmp != null ? Math.round(wtmp * 9/5 + 32)  : null,
    pressure_mb:    pres,
    fetchedAt:      new Date().toISOString(),
  };
}

// ── Tidal current stations ───────────────────────────────────────────────────

let currentStations = [];
let currentStationsLoaded = false;
const currentPredCache = new Map(); // stationId → { data, fetchedAt }

async function loadCurrentStations() {
  if (currentStationsLoaded) return;
  const FILE = path.join(DATA_DIR, 'current_stations.json');
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (raw._ts && (Date.now() - raw._ts) < 7 * 86400000 && raw.stations?.length) {
      currentStations = raw.stations;
      currentStationsLoaded = true;
      console.log(`Current stations loaded from cache: ${currentStations.length}`);
      return;
    }
  } catch {}
  try {
    const res = await fetch(
      'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=currentpredictions',
      { headers: { 'User-Agent': 'SafeSeas/1.0' } }
    );
    if (!res.ok) { console.warn(`Current stations fetch: HTTP ${res.status}`); return; }
    const data = await res.json();
    currentStations = (data.stations || [])
      .filter(s => s.lat && s.lng && s.type === 'H') // harmonic only
      .map(s => ({ id: s.id, name: s.name, lat: parseFloat(s.lat), lon: parseFloat(s.lng), state: s.state || null }));
    currentStationsLoaded = true;
    console.log(`Current stations downloaded: ${currentStations.length}`);
    fs.writeFileSync(FILE, JSON.stringify({ _ts: Date.now(), stations: currentStations }));
  } catch (e) { console.warn('Failed to download current stations:', e.message); }
}

function getNearestCurrentStations(lat, lon, n = 8) {
  return currentStations
    .map(s => ({ ...s, dist_km: haversine(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.dist_km - b.dist_km)
    .slice(0, n);
}

async function fetchCurrentNow(stationId) {
  const cached = currentPredCache.get(stationId);
  if (cached && Date.now() - cached.fetchedAt < 30 * 60000) return cached.data;

  const today = new Date();
  const url = `${BASE_TIDE}?product=currents&application=SafeSeas`+
    `&begin_date=${formatDate(today)}&end_date=${formatDate(today)}`+
    `&station=${stationId}&units=english&time_zone=lst_ldt&interval=h&format=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'SafeSeas/1.0' } });
    if (!res.ok) { currentPredCache.set(stationId, { data: null, fetchedAt: Date.now() }); return null; }
    const json = await res.json();
    const preds = json.current_predictions?.cp || [];
    if (!preds.length) { currentPredCache.set(stationId, { data: null, fetchedAt: Date.now() }); return null; }
    const now = new Date();
    const closest = preds.reduce((best, p) => {
      const diff = Math.abs(new Date(p.t) - now);
      return !best || diff < Math.abs(new Date(best.t) - now) ? p : best;
    }, null);
    const data = closest ? {
      speed: Math.abs(parseFloat(closest.v) || 0),
      dir:   parseFloat(closest.d) || 0,
      type:  closest.q || 'slack',
      time:  closest.t,
    } : null;
    currentPredCache.set(stationId, { data, fetchedAt: Date.now() });
    return data;
  } catch { return null; }
}

// ── Tide water-level stations ─────────────────────────────────────────────────

let tideStations = [];
let tideStationsLoaded = false;

async function loadTideStations() {
  if (tideStationsLoaded) return;
  const FILE = path.join(DATA_DIR, 'tide_stations.json');
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (raw._ts && (Date.now() - raw._ts) < 7 * 86400000 && raw.stations?.length) {
      tideStations = raw.stations;
      tideStationsLoaded = true;
      console.log(`Tide stations loaded from cache: ${tideStations.length}`);
      return;
    }
  } catch {}
  try {
    const res = await fetch(
      'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels',
      { headers: { 'User-Agent': 'SafeSeas/1.0' } }
    );
    if (!res.ok) { console.warn(`Tide stations fetch: HTTP ${res.status}`); return; }
    const data = await res.json();
    tideStations = (data.stations || [])
      .filter(s => s.lat && s.lng)
      .map(s => ({ id: s.id, name: s.name, lat: parseFloat(s.lat), lon: parseFloat(s.lng) }));
    tideStationsLoaded = true;
    console.log(`Tide stations downloaded: ${tideStations.length}`);
    fs.writeFileSync(FILE, JSON.stringify({ _ts: Date.now(), stations: tideStations }));
  } catch (e) { console.warn('Failed to download tide stations:', e.message); }
}

function getNearestTideStation(lat, lon) {
  // Fallback to hardcoded lookup if dynamic list not yet loaded
  const list = tideStations.length ? tideStations : Object.entries(LOCATION_LOOKUP).map(([, v]) => ({ id: v.station, name: Object.keys(LOCATION_LOOKUP).find(k => LOCATION_LOOKUP[k] === v), lat: v.lat, lon: v.lon })).filter(s => s.id);
  let best = null, bestD = Infinity;
  for (const s of list) {
    const d = haversine(lat, lon, s.lat, s.lon);
    if (d < bestD) { bestD = d; best = { ...s, dist_km: Math.round(d * 10) / 10 }; }
  }
  return best;
}

// ── Bridge/obstruction lookup ────────────────────────────────────────────────

function getBridgesNear(lat, lon, radiusKm = 50) {
  return bridgeFeatures
    .filter(f => {
      const { _lat, _lon } = f.properties;
      if (_lat == null || _lon == null) return false;
      return haversine(lat, lon, _lat, _lon) <= radiusKm;
    })
    .map(f => {
      const p = f.properties;
      return {
        name:      p.OBJNAM || null,
        chart:     p.DSNM   || null,
        verClr_m:  p.VERCLR != null ? parseFloat(p.VERCLR) : null,  // vertical clearance (m)
        verCcl_m:  p.VERCCL != null ? parseFloat(p.VERCCL) : null,  // closed clearance (m)
        horClr_m:  p.HORCLR != null ? parseFloat(p.HORCLR) : null,
        category:  p.CATBRG || null, // 1=fixed,2=opening,3=swing,4=drawbridge,5=lifting
        lat:       parseFloat(p._lat),
        lon:       parseFloat(p._lon),
        dist_km:   Math.round(haversine(lat, lon, p._lat, p._lon) * 10) / 10,
      };
    })
    .sort((a, b) => a.dist_km - b.dist_km);
}

// ── NWS forecast API ─────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/geo+json,application/json', 'User-Agent': 'SafeSeas/1.0' }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`NOAA request failed ${res.status}: ${body}`);
  }
  return res.json();
}

async function getPointInfo(lat, lon) {
  return fetchJSON(`${BASE_WEATHER}/points/${lat},${lon}`);
}

async function getHourlyForecast(lat, lon) {
  const point = await getPointInfo(lat, lon);
  const url = point?.properties?.forecastHourly || point?.properties?.forecast;
  if (!url) throw new Error('Unable to resolve NOAA forecast endpoint for location');
  const forecast = await fetchJSON(url);
  return forecast.properties?.periods || [];
}

async function getActiveAlerts(lat, lon) {
  try {
    const data = await fetchJSON(`${BASE_WEATHER}/alerts/active?point=${lat},${lon}`);
    return (data.features || []).map(f => {
      const p = f.properties;
      return {
        id:        p.id,
        event:     p.event,
        headline:  p.headline,
        description: (p.description || '').slice(0, 500),
        severity:  p.severity,   // Extreme | Severe | Moderate | Minor | Unknown
        urgency:   p.urgency,
        onset:     p.onset,
        expires:   p.expires,
        areaDesc:  p.areaDesc,
        senderName: p.senderName,
      };
    });
  } catch { return []; }
}

// ── NOAA Tides & Currents ────────────────────────────────────────────────────

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const dd   = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function getTidePredictions(station, beginDate, endDate) {
  const url = `${BASE_TIDE}?product=predictions&application=SafeSeas&begin_date=${beginDate}&end_date=${endDate}&station=${station}&datum=MLLW&units=english&time_zone=lst_ldt&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NOAA tide request failed ${res.status}`);
  const json = await res.json();
  return json.predictions || [];
}

async function getCurrentPredictions(station, beginDate, endDate) {
  const url = `${BASE_TIDE}?product=currents&application=SafeSeas&begin_date=${beginDate}&end_date=${endDate}&station=${station}&units=english&time_zone=lst_ldt&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NOAA currents request failed ${res.status}`);
  const json = await res.json();
  return json.current_predictions || [];
}

module.exports = {
  loadStaticData,
  lookupLocation,
  getHourlyForecast,
  getActiveAlerts,
  getTidePredictions,
  getCurrentPredictions,
  getNearestStation,
  getNearestBuoys,
  getBuoyObservations,
  getBridgesNear,
  loadCurrentStations,
  getNearestCurrentStations,
  fetchCurrentNow,
  loadTideStations,
  getNearestTideStation,
  formatDate,
};
