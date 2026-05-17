const fetch = globalThis.fetch;
if (typeof fetch !== 'function') {
  throw new Error('Global fetch is not available in this Node runtime.');
}
const BASE_WEATHER = 'https://api.weather.gov';
const BASE_TIDE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

const LOCATION_LOOKUP = {
  'Anna Maria Island': { lat: 27.5048, lon: -82.7384, station: '8720530' },
  'Egmont Key': { lat: 27.4309, lon: -82.7269, station: '8720870' },
  'Fort Myers Beach': { lat: 26.4516, lon: -81.9449, station: '8721890' },
  'Amelia Island': { lat: 30.6698, lon: -81.4628, station: '8720218' },
  'Fernandina Beach': { lat: 30.6696, lon: -81.4604, station: '8720218' },
  'Sarasota': { lat: 27.3364, lon: -82.5307, station: '8720390' },
  'St. Petersburg': { lat: 27.7676, lon: -82.6403, station: '8720530' },
};

function cleanName(name) {
  if (!name) return '';
  return name.trim().toLowerCase();
}

function lookupLocation(name) {
  const clean = cleanName(name);
  if (!clean) return null;
  const exact = LOCATION_LOOKUP[name];
  if (exact) return exact;
  for (const key of Object.keys(LOCATION_LOOKUP)) {
    if (clean.includes(key.toLowerCase())) return LOCATION_LOOKUP[key];
  }
  return null;
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/geo+json,application/json',
      'User-Agent': 'SafeSeas/1.0 (+https://example.com)'
    }
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

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function getTidePredictions(station, beginDate, endDate) {
  const url = `${BASE_TIDE}?product=predictions&application=SafeSeas&begin_date=${beginDate}&end_date=${endDate}&station=${station}&datum=MLLW&units=english&time_zone=lst_ldt&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`NOAA tide request failed ${res.status}: ${txt}`);
  }
  const json = await res.json();
  return json.predictions || [];
}

async function getCurrentPredictions(station, beginDate, endDate) {
  const url = `${BASE_TIDE}?product=currents&application=SafeSeas&begin_date=${beginDate}&end_date=${endDate}&station=${station}&units=english&time_zone=lst_ldt&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`NOAA currents request failed ${res.status}: ${txt}`);
  }
  const json = await res.json();
  return json.current_predictions || [];
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (v) => v * Math.PI / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getNearestStation(lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const key of Object.keys(LOCATION_LOOKUP)) {
    const s = LOCATION_LOOKUP[key];
    if (!s || !s.lat || !s.lon || !s.station) continue;
    const d = haversine(lat, lon, s.lat, s.lon);
    if (d < bestDist) {
      bestDist = d;
      best = Object.assign({ name: key, distance_km: d }, s);
    }
  }
  return best;
}

module.exports = {
  lookupLocation,
  getHourlyForecast,
  getTidePredictions,
  getCurrentPredictions,
  getNearestStation,
};
