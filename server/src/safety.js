const noaa = require('./noaa');
const geocode = require('./geocode');

function parseLength(length) {
  if (!length) return null;
  const match = String(length).match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  return parseFloat(match[1]);
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

  if (wind > thresholds.windLim) {
    reasons.push(`Wind ${wind} kt exceeds ${thresholds.windLim} kt safe limit`);
  }
  if (gust && gust > thresholds.windLim + 4) {
    reasons.push(`Gusts ${gust} kt are above a conservative safety window for this boat`);
  }
  if (waveHeight !== null && waveHeight > thresholds.waveLim) {
    reasons.push(`Wave height ${waveHeight} ft exceeds ${thresholds.waveLim} ft boat comfort`);
  }
  if (current !== null && current > thresholds.currentLim) {
    reasons.push(`Current ${current} kt is stronger than the ${thresholds.currentLim} kt limit for this boat`);
  }
  if (tide !== null && tide < 0.5) {
    reasons.push('Low tide may make shallow passage or inlet transit hazardous');
  }

  const verdict = reasons.length === 0 ? 'go' : reasons.some(r => /exceeds|stronger|hazardous|above/i.test(r)) ? 'nogo' : 'wait';
  return { verdict, reasons };
}

async function checkRouteSafety({ boat, route, departureTime }) {
  let location = noaa.lookupLocation(route?.from) || noaa.lookupLocation(route?.to);
  let geocoded = null;
  if (!location) {
    // try geocoding the 'from' location
    try {
      const results = await geocode.geocode(route?.from || route?.to || '');
      if (Array.isArray(results) && results.length) {
        geocoded = results[0];
        location = { lat: geocoded.lat, lon: geocoded.lon };
      }
    } catch (err) {
      console.warn('Geocode failed', err.message);
    }
  }
  const thresholds = getBoatThresholds(boat || {});
  let conditions = {
    wind: null,
    gust: null,
    waveHeight: null,
    tideHeight: null,
    currentSpeed: null,
  };
  const now = departureTime ? new Date(departureTime) : new Date();
  const beginDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const endDate = beginDate;

  let hourly = [];
  if (location) {
    try {
      const periods = await noaa.getHourlyForecast(location.lat, location.lon);
      if (periods.length) {
        const sample = periods[0];
        conditions.wind = parseWindSpeed(sample.windSpeed);
        conditions.gust = parseWindSpeed(sample.windGust) || conditions.wind;
        if (sample.waveHeight) {
          conditions.waveHeight = parseFloat(sample.waveHeight);
        }
        hourly = periods.slice(0, 7).map(item => {
          const itemWind = parseWindSpeed(item.windSpeed);
          const itemGust = parseWindSpeed(item.windGust) || itemWind;
          return {
            t: item.startTime ? new Date(item.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : item.name,
            wind: itemWind,
            gust: itemGust,
            shortForecast: item.shortForecast || item.detailedForecast || '',
            temperature: item.temperature != null ? `${item.temperature}${item.temperatureUnit || 'F'}` : null,
            ok: itemWind != null && itemWind <= thresholds.windLim && itemGust <= thresholds.windLim + 4,
          };
        });
      }
    } catch (err) {
      console.warn('NOAA weather fetch failed', err.message);
    }

    // if we don't have a station, try to find the nearest known station
    let stationId = location.station;
    if (!stationId && geocoded) {
      const nearest = noaa.getNearestStation(geocoded.lat, geocoded.lon);
      if (nearest && nearest.station) stationId = nearest.station;
    }

    if (stationId) {
      try {
        const tides = await noaa.getTidePredictions(stationId, beginDate, endDate);
        if (Array.isArray(tides) && tides.length) {
          conditions.tideHeight = parseFloat(tides[0].v);
        }
      } catch (err) {
        console.warn('NOAA tide fetch failed', err.message);
      }

      try {
        const currents = await noaa.getCurrentPredictions(stationId, beginDate, endDate);
        if (Array.isArray(currents) && currents.length) {
          const current = parseFloat(currents[0].s || currents[0].v || 0);
          if (!Number.isNaN(current)) {
            conditions.currentSpeed = current;
          }
        }
      } catch (err) {
        console.warn('NOAA current fetch failed', err.message);
      }
    }
  }

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

module.exports = {
  checkRouteSafety,
};
