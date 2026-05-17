const noaa = require('./noaa');
const geocode = require('./geocode');

const _fetch = globalThis.fetch;

function parseLength(length) {
  if (!length) return null;
  const match = String(length).match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function getBoatThresholds(boat) {
  const length = parseLength(boat.length) || 15;
  const windLim = boat.windLim || (length <= 12 ? 10 : length <= 16 ? 14 : length <= 20 ? 18 : 22);
  const waveLim = boat.waveLim || (length <= 12 ? 1.0 : length <= 16 ? 1.6 : length <= 20 ? 2.2 : 3.0);
  const currentLim = length <= 12 ? 0.8 : length <= 16 ? 1.2 : length <= 20 ? 1.8 : 2.5;
  return { windLim, waveLim, currentLim, length };
}

function parseWindSpeed(value) {
  if (!value) return null;
  const match = String(value).match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function evaluate(conditions, thresholds) {
  const reasons = [];
  const wind = conditions.wind || 0;
  const gust = conditions.gust || 0;
  const waveHeight = conditions.waveHeight || null;
  const current = conditions.currentSpeed || null;
  const tide = conditions.tideHeight || null;

  if (wind > thresholds.windLim)
    reasons.push(`Wind ${wind} kt exceeds ${thresholds.windLim} kt safe limit`);
  if (gust && gust > thresholds.windLim + 4)
    reasons.push(`Gusts ${gust} kt are above a conservative safety window for this boat`);
  if (waveHeight !== null && waveHeight > thresholds.waveLim)
    reasons.push(`Wave height ${waveHeight} ft exceeds ${thresholds.waveLim} ft boat comfort`);
  if (current !== null && current > thresholds.currentLim)
    reasons.push(`Current ${current} kt is stronger than the ${thresholds.currentLim} kt limit for this boat`);
  if (tide !== null && tide < 0.5)
    reasons.push('Low tide may make shallow passage or inlet transit hazardous');

  const verdict = reasons.length === 0
    ? 'go'
    : reasons.some(r => /exceeds|stronger|hazardous|above/i.test(r)) ? 'nogo' : 'wait';
  return { verdict, reasons };
}

// Interpolate n evenly-spaced points along a straight-line route (inclusive)
function _routePoints(fromLat, fromLon, toLat, toLon, n = 5) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    pts.push({
      lat: +(fromLat + t * (toLat - fromLat)).toFixed(5),
      lon: +(fromLon + t * (toLon - fromLon)).toFixed(5),
    });
  }
  return pts;
}

// OpenTopoData ETOPO1 — returns deepest point along route in feet, or null
async function _fetchMaxDepth(fromLat, fromLon, toLat, toLon) {
  try {
    const pts = _routePoints(fromLat, fromLon, toLat, toLon, 5);
    const locs = pts.map(p => `${p.lat},${p.lon}`).join('|');
    const res = await _fetch(
      `https://api.opentopodata.org/v1/etopo1?locations=${locs}`,
      { headers: { 'User-Agent': 'SafeSeas/1.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;
    const elevs = (data.results || []).map(r => r.elevation).filter(e => typeof e === 'number');
    if (!elevs.length) return null;
    const minElev = Math.min(...elevs);
    if (minElev >= 0) return null; // entirely above sea level
    return Math.round(Math.abs(minElev) * 3.28084); // metres → feet
  } catch (err) {
    console.warn('Max depth fetch failed:', err.message);
    return null;
  }
}

async function checkRouteSafety({ boat, route, departureTime }) {
  // ── Resolve departure location ──────────────────────────────────────────────
  let depLoc = noaa.lookupLocation(route?.from) || noaa.lookupLocation(route?.to);
  let geocoded = null;
  if (!depLoc) {
    if (route?.fromLat && route?.fromLon) {
      depLoc = { lat: parseFloat(route.fromLat), lon: parseFloat(route.fromLon) };
    } else {
      try {
        const results = await geocode.geocode(route?.from || route?.to || '');
        if (Array.isArray(results) && results.length) {
          geocoded = results[0];
          depLoc = { lat: parseFloat(geocoded.lat), lon: parseFloat(geocoded.lon) };
        }
      } catch (err) {
        console.warn('Departure geocode failed', err.message);
      }
    }
  }

  // ── Resolve destination location ────────────────────────────────────────────
  let destLoc = noaa.lookupLocation(route?.to);
  if (!destLoc && route?.toLat && route?.toLon) {
    destLoc = { lat: parseFloat(route.toLat), lon: parseFloat(route.toLon) };
  } else if (!destLoc && route?.to) {
    try {
      const results = await geocode.geocode(route.to);
      if (Array.isArray(results) && results.length) {
        destLoc = { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
      }
    } catch {}
  }

  const thresholds = getBoatThresholds(boat || {});
  const conditions = {
    wind: null, gust: null, waveHeight: null,
    tideHeight: null, currentSpeed: null,
    arrivalWind: null, arrivalWindDir: null, maxDepthFt: null,
  };
  const now = departureTime ? new Date(departureTime) : new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  let hourly = [];

  const tasks = [];

  // ── Departure weather ───────────────────────────────────────────────────────
  if (depLoc) {
    tasks.push(
      noaa.getHourlyForecast(depLoc.lat, depLoc.lon)
        .then(periods => {
          if (!periods.length) return;
          const s = periods[0];
          conditions.wind = parseWindSpeed(s.windSpeed);
          conditions.gust = parseWindSpeed(s.windGust) || conditions.wind;
          if (s.waveHeight) conditions.waveHeight = parseFloat(s.waveHeight);
          hourly = periods.slice(0, 7).map(item => {
            const iw = parseWindSpeed(item.windSpeed);
            const ig = parseWindSpeed(item.windGust) || iw;
            return {
              t: item.startTime
                ? new Date(item.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : item.name,
              wind: iw, gust: ig,
              shortForecast: item.shortForecast || '',
              temperature: item.temperature != null ? `${item.temperature}${item.temperatureUnit || 'F'}` : null,
              ok: iw != null && iw <= thresholds.windLim && ig <= thresholds.windLim + 4,
            };
          });
        })
        .catch(err => console.warn('NOAA departure forecast failed', err.message))
    );

    // Tide & currents
    let stationId = depLoc.station;
    if (!stationId && geocoded) {
      const nearest = noaa.getNearestStation(parseFloat(geocoded.lat), parseFloat(geocoded.lon));
      if (nearest?.station) stationId = nearest.station;
    }
    if (stationId) {
      tasks.push(
        noaa.getTidePredictions(stationId, yyyymmdd, yyyymmdd)
          .then(tides => { if (tides.length) conditions.tideHeight = parseFloat(tides[0].v); })
          .catch(err => console.warn('Tide fetch failed', err.message))
      );
      tasks.push(
        noaa.getCurrentPredictions(stationId, yyyymmdd, yyyymmdd)
          .then(currents => {
            if (currents.length) {
              const c = parseFloat(currents[0].s || currents[0].v || 0);
              if (!isNaN(c)) conditions.currentSpeed = c;
            }
          })
          .catch(err => console.warn('Currents fetch failed', err.message))
      );
    }
  }

  // ── Arrival wind (NOAA NWS at destination) ──────────────────────────────────
  if (destLoc) {
    tasks.push(
      noaa.getHourlyForecast(destLoc.lat, destLoc.lon)
        .then(periods => {
          if (!periods.length) return;
          conditions.arrivalWind = parseWindSpeed(periods[0].windSpeed);
          conditions.arrivalWindDir = periods[0].windDirection || null;
        })
        .catch(err => console.warn('NOAA arrival forecast failed', err.message))
    );
  }

  // ── Max depth along route (OpenTopoData ETOPO1) ─────────────────────────────
  if (depLoc && destLoc) {
    tasks.push(
      _fetchMaxDepth(depLoc.lat, depLoc.lon, destLoc.lat, destLoc.lon)
        .then(depth => { conditions.maxDepthFt = depth; })
    );
  }

  await Promise.all(tasks);

  const result = evaluate(conditions, thresholds);
  return {
    route: route || {},
    boat: boat || {},
    thresholds,
    conditions,
    hourly,
    verdict: result.verdict,
    reasons: result.reasons,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { checkRouteSafety };
