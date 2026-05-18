const BASE = 'https://nominatim.openstreetmap.org/search';

function encodeParams(obj) {
  return Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');
}

// Simple cache: query → { results, expires }
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Serial request queue — Nominatim requires max 1 req/s
let _lastRequest = 0;
async function _throttledFetch(url) {
  const now = Date.now();
  const wait = Math.max(0, _lastRequest + 1100 - now);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastRequest = Date.now();
  return fetch(url, {
    headers: { 'User-Agent': 'SafeSeas/1.0 (dev)', Accept: 'application/json' },
  });
}

async function geocode(query, limit = 5) {
  if (!query) return [];

  const cacheKey = `${query}|${limit}`;
  const cached = _cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.results;

  const params = encodeParams({ q: query, format: 'jsonv2', limit, addressdetails: 1 });
  const url = `${BASE}?${params}`;
  const res = await _throttledFetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Geocode request failed ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const results = data.map(d => ({
    display_name: d.display_name,
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
    type: d.type,
    osm_id: d.osm_id,
    boundingbox: d.boundingbox,
  }));

  _cache.set(cacheKey, { results, expires: Date.now() + CACHE_TTL });
  return results;
}

module.exports = { geocode };
