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
  getTidePredictions,
  getCurrentPredictions,
  getNearestStation,
  getNearestBuoys,
  getBuoyObservations,
  getBridgesNear,
};
