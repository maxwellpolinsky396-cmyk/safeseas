const BASE = 'https://nominatim.openstreetmap.org/search';

function encodeParams(obj) {
  return Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');
}

async function geocode(query, limit = 5) {
  if (!query) return [];
  const params = encodeParams({ q: query, format: 'jsonv2', limit, addressdetails: 1 });
  const url = `${BASE}?${params}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SafeSeas/1.0 (dev)',
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Geocode request failed ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.map(d => ({
    display_name: d.display_name,
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
    type: d.type,
    osm_id: d.osm_id,
    boundingbox: d.boundingbox,
  }));
}

module.exports = { geocode };
