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

async function reverseGeocode(lat, lon) {
  const cacheKey = `rev|${lat.toFixed(5)}|${lon.toFixed(5)}`;
  const cached = _cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.results;

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16`;
  const res = await _throttledFetch(url);
  if (!res.ok) return null;
  const d = await res.json();
  if (d.error) return null;

  const addr = d.address || {};
  const specific = d.name || addr.tourism || addr.leisure || addr.amenity || addr.marina || addr.pier;
  const locality = addr.hamlet || addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city;
  const parts = [];
  if (specific) parts.push(specific);
  else if (locality) parts.push(locality);
  if (addr.state && !parts.includes(addr.state)) parts.push(addr.state);
  const name = parts.length ? parts.join(', ') : (d.display_name || '').split(',').slice(0, 2).join(',').trim() || null;

  _cache.set(cacheKey, { results: name, expires: Date.now() + CACHE_TTL });
  return name;
}

module.exports = { geocode, reverseGeocode };
