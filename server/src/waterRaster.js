const fs = require('fs');
const path = require('path');

// ─── Precomputed water/land raster ────────────────────────────────────────────
//
// The old routing code re-ran point-in-polygon (PIP) tests against the raw
// Natural Earth polygons on every single request, and only ever mid-edge-
// checked diagonal A* moves — cardinal moves could hop clean over a barrier
// island undetected. This module builds ONE water/land raster bitmap, once,
// covering the app's actual operating region (continental US Atlantic + Gulf
// coast + Caribbean margin), so that:
//   - a "is this point water" check is an O(1) bit test instead of a PIP scan
//   - it's cheap to validate *every* A* edge (cardinal AND diagonal) by
//     sampling several points along its length, at a fixed real-world
//     spacing, regardless of the A* search grid's own step size.
//
// The raster is cached to disk (server/data/water_raster.bin) so only the
// very first boot pays the build cost; later boots load the cached bitset in
// well under a second.

const BAND = 0.5; // ° latitude band width for the edge index (same scheme as maritime.js)

const BBOX = { minLon: -98, minLat: 18, maxLon: -64, maxLat: 46 };
const RES_DEG = 0.0015; // ~150-170m/cell — fine enough to resolve real barrier islands
const CACHE_VERSION = 1;

const DATA_DIR    = path.join(__dirname, '../data');
const CACHE_PATH  = path.join(DATA_DIR, 'water_raster.bin');
const OCEAN_PATH  = path.join(DATA_DIR, 'ne_10m_ocean.geojson');
const LAND_PATH   = path.join(DATA_DIR, 'ne_10m_land.geojson');

const ROWS = Math.round((BBOX.maxLat - BBOX.minLat) / RES_DEG) + 1;
const COLS = Math.round((BBOX.maxLon - BBOX.minLon) / RES_DEG) + 1;

// ─── Combined multi-ring edge index ────────────────────────────────────────────
// Pools every ring (outer AND holes, across every polygon) from one GeoJSON
// file into one flat edge list + band index. An even-odd scanline over the
// pooled edges naturally handles holes (no need to track outer/hole separately)
// as long as rings don't self-intersect, which Natural Earth data satisfies.

function _loadCombinedEdges(geojsonPath) {
  const fc = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const edges = []; // flat: x1,y1,x2,y2 per edge
  const bands = new Map();
  let count = 0;
  for (const feat of fc.features) {
    const geom = feat.geometry;
    const allPolys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    for (const rings of allPolys) {
      for (const ring of rings) {
        const n = ring.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const x1 = ring[i][0], y1 = ring[i][1];
          const x2 = ring[j][0], y2 = ring[j][1];
          if (y1 === y2) continue; // horizontal edges never cross a scanline
          const idx = count++;
          edges.push(x1, y1, x2, y2);
          const b0 = Math.floor(Math.min(y1, y2) / BAND);
          const b1 = Math.floor(Math.max(y1, y2) / BAND);
          for (let b = b0; b <= b1; b++) {
            if (!bands.has(b)) bands.set(b, []);
            bands.get(b).push(idx);
          }
        }
      }
    }
  }
  return { edges: Float64Array.from(edges), bands };
}

function _rowCrossings(lat, layer) {
  const candidates = layer.bands.get(Math.floor(lat / BAND));
  if (!candidates) return [];
  const xs = [];
  const e = layer.edges;
  for (const idx of candidates) {
    const o = idx * 4;
    const y1 = e[o + 1], y2 = e[o + 3];
    if ((y1 > lat) !== (y2 > lat)) {
      const x1 = e[o], x2 = e[o + 2];
      xs.push(x1 + (x2 - x1) * (lat - y1) / (y2 - y1));
    }
  }
  xs.sort((a, b) => a - b);
  return xs;
}

// ─── Build ──────────────────────────────────────────────────────────────────

function _buildRaster() {
  const t0 = Date.now();
  console.log('Water raster: building (first boot — will be cached to disk)...');
  const ocean = _loadCombinedEdges(OCEAN_PATH);
  const land  = _loadCombinedEdges(LAND_PATH);

  const bits = new Uint8Array(Math.ceil((ROWS * COLS) / 8));
  const setBit = (idx) => { bits[idx >> 3] |= (1 << (idx & 7)); };

  for (let r = 0; r < ROWS; r++) {
    const lat = BBOX.minLat + r * RES_DEG;
    const oceanXs = _rowCrossings(lat, ocean);
    const landXs  = _rowCrossings(lat, land);
    let oi = 0, li = 0, oceanIn = false, landIn = false;
    const rowBase = r * COLS;
    for (let c = 0; c < COLS; c++) {
      const lon = BBOX.minLon + c * RES_DEG;
      while (oi < oceanXs.length && oceanXs[oi] <= lon) { oceanIn = !oceanIn; oi++; }
      while (li < landXs.length  && landXs[li]  <= lon) { landIn  = !landIn;  li++; }
      if (oceanIn && !landIn) setBit(rowBase + c);
    }
  }

  const ms = Date.now() - t0;
  console.log(`Water raster: built in ${ms}ms — ${ROWS}x${COLS} = ${(ROWS * COLS).toLocaleString()} cells, ${(bits.length / 1024 / 1024).toFixed(1)}MB`);
  return bits;
}

// ─── Disk cache ─────────────────────────────────────────────────────────────
// header: magic(4) + version(1) + bbox(4×f64) + resDeg(f64) + rows(u32) + cols(u32) + oceanMtime(f64) + landMtime(f64)

const HEADER_SIZE = 4 + 1 + 8 * 4 + 8 + 4 + 4 + 8 + 8;

function _writeCache(bits) {
  try {
    const oceanMtime = fs.statSync(OCEAN_PATH).mtimeMs;
    const landMtime  = fs.statSync(LAND_PATH).mtimeMs;
    const header = Buffer.alloc(HEADER_SIZE);
    let o = 0;
    header.write('SSWR', o, 'ascii'); o += 4;
    header.writeUInt8(CACHE_VERSION, o); o += 1;
    header.writeDoubleLE(BBOX.minLon, o); o += 8;
    header.writeDoubleLE(BBOX.minLat, o); o += 8;
    header.writeDoubleLE(BBOX.maxLon, o); o += 8;
    header.writeDoubleLE(BBOX.maxLat, o); o += 8;
    header.writeDoubleLE(RES_DEG, o); o += 8;
    header.writeUInt32LE(ROWS, o); o += 4;
    header.writeUInt32LE(COLS, o); o += 4;
    header.writeDoubleLE(oceanMtime, o); o += 8;
    header.writeDoubleLE(landMtime, o); o += 8;
    fs.writeFileSync(CACHE_PATH, Buffer.concat([header, Buffer.from(bits.buffer, bits.byteOffset, bits.byteLength)]));
  } catch (err) {
    console.warn('Water raster: failed to write cache —', err.message);
  }
}

function _readCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const buf = fs.readFileSync(CACHE_PATH);
    if (buf.length < HEADER_SIZE) return null;
    let o = 0;
    if (buf.toString('ascii', 0, 4) !== 'SSWR') return null;
    o = 4;
    const version = buf.readUInt8(o); o += 1;
    if (version !== CACHE_VERSION) return null;
    const minLon = buf.readDoubleLE(o); o += 8;
    const minLat = buf.readDoubleLE(o); o += 8;
    const maxLon = buf.readDoubleLE(o); o += 8;
    const maxLat = buf.readDoubleLE(o); o += 8;
    const resDeg = buf.readDoubleLE(o); o += 8;
    const rows = buf.readUInt32LE(o); o += 4;
    const cols = buf.readUInt32LE(o); o += 4;
    const oceanMtime = buf.readDoubleLE(o); o += 8;
    const landMtime  = buf.readDoubleLE(o); o += 8;
    if (minLon !== BBOX.minLon || minLat !== BBOX.minLat || maxLon !== BBOX.maxLon || maxLat !== BBOX.maxLat) return null;
    if (resDeg !== RES_DEG || rows !== ROWS || cols !== COLS) return null;
    if (oceanMtime !== fs.statSync(OCEAN_PATH).mtimeMs) return null;
    if (landMtime !== fs.statSync(LAND_PATH).mtimeMs) return null;
    return new Uint8Array(buf.buffer, buf.byteOffset + HEADER_SIZE, buf.length - HEADER_SIZE);
  } catch (err) {
    console.warn('Water raster: cache read failed, rebuilding —', err.message);
    return null;
  }
}

// ─── Public ─────────────────────────────────────────────────────────────────

let _bits = null;

function preload() {
  if (_bits) return;
  const t0 = Date.now();
  const cached = _readCache();
  if (cached) {
    _bits = cached;
    console.log(`Water raster: loaded from cache in ${Date.now() - t0}ms (${(cached.length / 1024 / 1024).toFixed(1)}MB)`);
    return;
  }
  _bits = _buildRaster();
  _writeCache(_bits);
}

function contains(lat, lon) {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
}

// true = water, false = land, null = outside the raster's covered region
function isWaterAt(lat, lon) {
  if (!contains(lat, lon)) return null;
  if (!_bits) preload();
  const row = Math.round((lat - BBOX.minLat) / RES_DEG);
  const col = Math.round((lon - BBOX.minLon) / RES_DEG);
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
  const idx = row * COLS + col;
  return (_bits[idx >> 3] & (1 << (idx & 7))) !== 0;
}

module.exports = { preload, contains, isWaterAt, BBOX, RES_DEG };
