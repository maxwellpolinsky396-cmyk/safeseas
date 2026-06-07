#!/usr/bin/env node
// Downloads NOAA ENC bridge data + NDBC buoy stations and saves to server/data/
// Run: node server/scripts/download-noaa-data.js

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SafeSeas/1.0 NOAA-data-downloader' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

// ── NOAA ENC bridge download ────────────────────────────────────────────────

const ENC_BASE = 'https://gis.charttools.noaa.gov/arcgis/rest/services/encdirect';

async function downloadLayer(service, layerId, label) {
  const countUrl = `${ENC_BASE}/${service}/MapServer/${layerId}/query?where=1%3D1&returnCountOnly=true&f=json`;
  const { count } = await fetchJSON(countUrl);
  console.log(`  ${label}: ${count} features`);

  const features = [];
  const PAGE = 1000;
  for (let offset = 0; offset < count; offset += PAGE) {
    const url = `${ENC_BASE}/${service}/MapServer/${layerId}/query` +
      `?where=1%3D1&outFields=OBJNAM,VERCLR,VERCCL,HORCLR,CATBRG,CONDTN,DSNM` +
      `&outSR=4326&resultOffset=${offset}&resultRecordCount=${PAGE}&f=geojson`;
    const page = await fetchJSON(url);
    features.push(...(page.features || []));
    process.stdout.write(`    page ${Math.floor(offset/PAGE)+1}/${Math.ceil(count/PAGE)}\r`);
  }
  console.log(`    done — ${features.length} loaded`);
  return features;
}

async function downloadBridges() {
  console.log('\nDownloading NOAA ENC bridge data...');
  const [lines, areas] = await Promise.all([
    downloadLayer('enc_harbour', 87,  'Harbour bridge lines'),
    downloadLayer('enc_harbour', 141, 'Harbour bridge areas'),
  ]);

  // Merge into one FeatureCollection; give each feature a centroid lat/lon
  const features = [...lines, ...areas].map(f => {
    const coords = f.geometry?.coordinates;
    let lat = null, lon = null;
    if (f.geometry?.type === 'LineString' && coords?.length) {
      const mid = coords[Math.floor(coords.length / 2)];
      [lon, lat] = mid;
    } else if (f.geometry?.type === 'Polygon' && coords?.[0]?.length) {
      const ring = coords[0];
      lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    } else if (f.geometry?.type === 'MultiPolygon' && coords?.[0]?.[0]?.length) {
      const ring = coords[0][0];
      lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    }
    return { ...f, properties: { ...f.properties, _lat: lat, _lon: lon } };
  }).filter(f => f.properties._lat !== null);

  const out = { type: 'FeatureCollection', features };
  fs.writeFileSync(path.join(DATA_DIR, 'noaa_bridges.geojson'), JSON.stringify(out));
  console.log(`Saved ${features.length} bridge features → data/noaa_bridges.geojson`);
}

// ── NDBC buoy station download ──────────────────────────────────────────────

async function downloadNDBC() {
  console.log('\nDownloading NDBC buoy station list...');
  const res = await fetch('https://www.ndbc.noaa.gov/data/stations/station_table.txt', {
    headers: { 'User-Agent': 'SafeSeas/1.0' }
  });
  if (!res.ok) throw new Error(`NDBC HTTP ${res.status}`);
  const text = await res.text();

  const lines = text.split('\n');
  const stations = [];
  // Format: STATION_ID | OWNER | TTYPE | HULL | NAME | PAYLOAD | LOCATION | ...
  // LOCATION field: "44.794 N 87.313 W" or "12.000 N 23.000 W"
  const locRe = /([\d.]+)\s*([NS])\s+([\d.]+)\s*([EW])/;
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const parts = line.split('|');
    if (parts.length < 7) continue;
    const id       = parts[0].trim();
    const owner    = parts[1].trim();
    const type     = parts[2].trim();
    const name     = parts[4].trim();
    const location = parts[6].trim();
    const m = locRe.exec(location);
    if (!m) continue;
    let lat = parseFloat(m[1]) * (m[2] === 'S' ? -1 : 1);
    let lon = parseFloat(m[3]) * (m[4] === 'W' ? -1 : 1);
    if (!isNaN(lat) && !isNaN(lon)) {
      stations.push({ id, name, lat, lon, type, owner });
    }
  }

  fs.writeFileSync(path.join(DATA_DIR, 'ndbc_stations.json'), JSON.stringify(stations, null, 2));
  console.log(`Saved ${stations.length} NDBC stations → data/ndbc_stations.json`);
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await downloadBridges();
    await downloadNDBC();
    console.log('\nAll NOAA data downloaded successfully.');
  } catch (err) {
    console.error('Download failed:', err.message);
    process.exit(1);
  }
})();
