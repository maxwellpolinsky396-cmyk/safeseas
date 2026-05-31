const _fetch = globalThis.fetch;
const path = require('path');
const fs   = require('fs');

// ─── Land polygon index ───────────────────────────────────────────────────────
// NE10m LAND polygon, inverted: water = !isLand.
// Naturally includes bays, sounds, ICW, estuaries — no ocean polygon needed.
//
// Perf: raw ray-cast (bypasses turf object overhead), bbox pre-filter,
// route-level polygon cache so we only scan the local coastline.

let _landIndex = null;

const BAND = 0.5; // latitude band size in degrees

// Build a lat-band edge index for a polygon ring stored as Float64Array.
// Edges are bucketed by which 0.5° lat bands they cross.
// A point at lat `la` only tests edges in band floor(la/BAND), cutting vertex
// iteration from ~50K (full US coastline) to ~2K (edges in that strip).
function _buildBandIdx(flat) {
  const n = flat.length >> 1;
  const bands = new Map();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const yi = flat[2*i+1], yj = flat[2*j+1];
    const b0 = Math.floor(Math.min(yi, yj) / BAND);
    const b1 = Math.floor(Math.max(yi, yj) / BAND);
    for (let b = b0; b <= b1; b++) {
      if (!bands.has(b)) bands.set(b, []);
      bands.get(b).push(i);
    }
  }
  return bands;
}

function _flattenRing(ring) {
  const f = new Float64Array(ring.length * 2);
  let mnLo = Infinity, mxLo = -Infinity, mnLa = Infinity, mxLa = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const lo = ring[i][0], la = ring[i][1];
    f[2*i] = lo; f[2*i+1] = la;
    if (lo < mnLo) mnLo = lo; if (lo > mxLo) mxLo = lo;
    if (la < mnLa) mnLa = la; if (la > mxLa) mxLa = la;
  }
  return { flat: f, bands: _buildBandIdx(f), bbox: [mnLo, mnLa, mxLo, mxLa] };
}

function _loadLandIndex() {
  if (_landIndex) return _landIndex;
  console.log('Loading NE10m land index...');
  const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/ne_10m_land.geojson'), 'utf8'));
  _landIndex = [];
  for (const feat of fc.features) {
    const geom = feat.geometry;
    const allPolys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    for (const rings of allPolys) {
      const outer = _flattenRing(rings[0]);
      const holes = rings.slice(1).map(r => { const o = _flattenRing(r); return { flat: o.flat, bands: o.bands }; });
      _landIndex.push({ bbox: outer.bbox, outer: outer.flat, outerBands: outer.bands, holes });
    }
  }
  console.log(`Land index: ${_landIndex.length} polygons`);
  return _landIndex;
}

// Ray-cast using band index — only tests edges in the point's lat strip
function _inBanded(lo, la, flat, bands) {
  const n = flat.length >> 1;
  const b = Math.floor(la / BAND);
  const edgeIdxs = bands.get(b);
  if (!edgeIdxs) return false;
  let inside = false;
  for (const i of edgeIdxs) {
    const j = (i + 1) % n;
    const yi = flat[2*i+1], yj = flat[2*j+1];
    if ((yi > la) !== (yj > la)) {
      const xi = flat[2*i], xj = flat[2*j];
      if (lo < (xj - xi) * (la - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// Route-level cache: filter all 6837 polygons down to those in the route bbox once
let _cachedBbox = null, _cachedPolygons = null;

function _filterForBbox(mnLo, mnLa, mxLo, mxLa) {
  const key = `${mnLo},${mnLa},${mxLo},${mxLa}`;
  if (_cachedBbox === key) return _cachedPolygons;
  const idx = _loadLandIndex();
  _cachedPolygons = idx.filter(({ bbox }) =>
    bbox[0] <= mxLo && bbox[2] >= mnLo && bbox[1] <= mxLa && bbox[3] >= mnLa
  );
  _cachedBbox = key;
  console.log(`Bbox filter: ${_cachedPolygons.length}/${idx.length} polygons`);
  return _cachedPolygons;
}

function _isLand(lat, lon, polys) {
  const local = polys ?? _loadLandIndex();
  for (const { bbox, outer, outerBands, holes } of local) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    if (!_inBanded(lon, lat, outer, outerBands)) continue;
    let inHole = false;
    for (const { flat, bands } of holes) {
      if (_inBanded(lon, lat, flat, bands)) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

function _isWater(lat, lon)             { return !_isLand(lat, lon, null); }
function _isWaterLocal(lat, lon, polys) { return !_isLand(lat, lon, polys); }

// ─── Min-heap ─────────────────────────────────────────────────────────────────

class MinHeap {
  constructor() { this._d = []; }
  push(item, p) { this._d.push({ item, p }); this._up(this._d.length - 1); }
  pop() { const t = this._d[0]; const l = this._d.pop(); if (this._d.length) { this._d[0] = l; this._dn(0); } return t?.item; }
  get size() { return this._d.length; }
  _up(i) { while (i > 0) { const p = (i-1)>>1; if (this._d[p].p <= this._d[i].p) break; [this._d[p],this._d[i]]=[this._d[i],this._d[p]]; i=p; } }
  _dn(i) { const n=this._d.length; for(;;){ let s=i,l=2*i+1,r=2*i+2; if(l<n&&this._d[l].p<this._d[s].p)s=l; if(r<n&&this._d[r].p<this._d[s].p)s=r; if(s===i)break; [this._d[s],this._d[i]]=[this._d[i],this._d[s]]; i=s; } }
}

// ─── A* over water grid ───────────────────────────────────────────────────────

function _astar(waterCells, startKey, endKey, lats, lons) {
  const latIdx = new Map(lats.map((v, i) => [v, i]));
  const lonIdx = new Map(lons.map((v, i) => [v, i]));
  const [eLat, eLon] = endKey.split(',').map(Number);
  const step = lats.length > 1 ? lats[1] - lats[0] : 0.01;

  const h = (lat, lon) => Math.hypot(lat - eLat, lon - eLon);
  const open = new MinHeap();
  const g = new Map([[startKey, 0]]);
  const from = new Map();
  const closed = new Set();
  open.push(startKey, h(...startKey.split(',').map(Number)));

  let iters = 0;
  while (open.size && iters++ < 60000) {
    const cur = open.pop();
    if (!cur || closed.has(cur)) continue;
    if (cur === endKey) {
      const pts = []; let n = cur;
      while (n !== undefined) { pts.unshift(n); n = from.get(n); }
      return pts;
    }
    closed.add(cur);
    const [cLat, cLon] = cur.split(',').map(Number);
    const ci = latIdx.get(cLat), cj = lonIdx.get(cLon);
    if (ci == null || cj == null) continue;

    for (const [di, dj] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || ni >= lats.length || nj < 0 || nj >= lons.length) continue;
      const nKey = `${lats[ni]},${lons[nj]}`;
      if (!waterCells.has(nKey) || closed.has(nKey)) continue;
      const edgeCost = (Math.abs(di) + Math.abs(dj) > 1 ? 1.414 : 1) * step;
      const ng = (g.get(cur) || 0) + edgeCost;
      if (ng < (g.get(nKey) ?? Infinity)) {
        from.set(nKey, cur); g.set(nKey, ng);
        open.push(nKey, ng + h(lats[ni], lons[nj]));
      }
    }
  }
  return null;
}

// ─── Segment validation ───────────────────────────────────────────────────────

function _checkSegment(la1, lo1, la2, lo2, polys) {
  const segLenKm = Math.hypot((la2-la1)*111, (lo2-lo1)*111*Math.cos(la1*Math.PI/180));
  const n = Math.max(20, Math.min(500, Math.ceil(segLenKm * 1000 / 40)));
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const lat = la1 + t * (la2 - la1);
    const lon = lo1 + t * (lo2 - lo1);
    if (_isLand(lat, lon, polys)) return { lat, lon, t };
  }
  return null;
}

// ─── Simplification (water-aware Douglas-Peucker) ─────────────────────────────

function _perp([la,lo],[la1,lo1],[la2,lo2]){const dx=la2-la1,dy=lo2-lo1,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(la-la1,lo-lo1);const t=((la-la1)*dx+(lo-lo1)*dy)/l2;return Math.hypot(la-(la1+t*dx),lo-(lo1+t*dy));}

function _simplify(pts, tol = 0.002, polys) {
  if (pts.length <= 2) return pts;
  let mx = 0, mi = 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = _perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > mx) { mx = d; mi = i; }
  }
  if (mx > tol || _checkSegment(pts[0][0], pts[0][1], pts[pts.length-1][0], pts[pts.length-1][1], polys)) {
    return [
      ..._simplify(pts.slice(0, mi + 1), tol, polys).slice(0, -1),
      ..._simplify(pts.slice(mi), tol, polys),
    ];
  }
  return [pts[0], pts[pts.length - 1]];
}

// ─── Nearest water cell in grid ───────────────────────────────────────────────

function _nearestWater(key, waterCells, lats, lons) {
  if (waterCells.has(key)) return key;
  const [cLat, cLon] = key.split(',').map(Number);
  const ci = lats.findIndex(v => v === cLat);
  const cj = lons.findIndex(v => v === cLon);
  if (ci < 0 || cj < 0) return key;
  for (let r = 1; r <= 12; r++) {
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || ni >= lats.length || nj < 0 || nj >= lons.length) continue;
        const nKey = `${lats[ni]},${lons[nj]}`;
        if (waterCells.has(nKey)) return nKey;
      }
    }
  }
  return key;
}

// ─── Core routing ─────────────────────────────────────────────────────────────

async function _waterRoute(fromLat, fromLon, toLat, toLon) {
  const distKm = Math.hypot(
    (toLat - fromLat) * 111,
    (toLon - fromLon) * 111 * Math.cos(fromLat * Math.PI / 180)
  );

  // Step: fine enough to resolve channels; margin: large enough to route around peninsulas.
  // Coastal routes often detour 2-3x their straight-line distance, so margins are generous.
  const stepDeg = distKm < 15  ? 0.004
                : distKm < 50  ? 0.008
                : distKm < 130 ? 0.015
                : 0.04;

  const margin = distKm < 20  ? 0.25
               : distKm < 50  ? 0.4
               : distKm < 130 ? 0.55
               : Math.max(0.6, distKm * 0.006);

  const minLat = +(Math.min(fromLat, toLat) - margin).toFixed(5);
  const maxLat = +(Math.max(fromLat, toLat) + margin).toFixed(5);
  const minLon = +(Math.min(fromLon, toLon) - margin).toFixed(5);
  const maxLon = +(Math.max(fromLon, toLon) + margin).toFixed(5);

  const lats = [], lons = [];
  for (let v = minLat; v <= maxLat + 1e-9; v = +(v + stepDeg).toFixed(5)) lats.push(v);
  for (let v = minLon; v <= maxLon + 1e-9; v = +(v + stepDeg).toFixed(5)) lons.push(v);

  console.log(`A* grid: ${lats.length}×${lons.length}=${lats.length*lons.length} pts, step=${stepDeg}°, dist=${distKm.toFixed(0)}km`);

  // Pre-filter land polygons to this bbox — massive speedup vs scanning all 6837
  const localPolys = _filterForBbox(minLon, minLat, maxLon, maxLat);

  // Classify grid using land polygon (inverted): water = !isLand
  // Opens up bays, sounds, ICW, estuaries — anything not explicitly land
  const t0 = Date.now();
  const waterCells = new Set();
  for (const lat of lats) {
    for (const lon of lons) {
      if (_isWaterLocal(lat, lon, localPolys)) waterCells.add(`${lat},${lon}`);
    }
  }
  console.log(`Grid classified in ${Date.now()-t0}ms. Water: ${waterCells.size}/${lats.length*lons.length}`);

  const nearKey = (lat, lon) => {
    const nL = lats.reduce((a, b) => Math.abs(a - lat) < Math.abs(b - lat) ? a : b);
    const nO = lons.reduce((a, b) => Math.abs(a - lon) < Math.abs(b - lon) ? a : b);
    return `${nL},${nO}`;
  };

  const startKey = _nearestWater(nearKey(fromLat, fromLon), waterCells, lats, lons);
  const endKey   = _nearestWater(nearKey(toLat,   toLon),   waterCells, lats, lons);

  if (!waterCells.has(startKey)) waterCells.add(startKey);
  if (!waterCells.has(endKey))   waterCells.add(endKey);

  const path = _astar(waterCells, startKey, endKey, lats, lons);
  if (!path || path.length < 2) {
    console.warn('A* found no path — straight line fallback');
    return [[fromLat, fromLon], [toLat, toLon]];
  }

  let waypoints = _simplify(path.map(k => k.split(',').map(Number)), 0.002, localPolys);

  // Always anchor endpoints to exact user-specified coords.
  // The A* inner path is all water; the short first/last segments may briefly
  // cross the marina shoreline polygon, but visually this is correct — the
  // route line starts and ends exactly where the user placed their pins.
  waypoints[0] = [fromLat, fromLon];
  waypoints[waypoints.length - 1] = [toLat, toLon];

  console.log(`Route: ${waypoints.length} waypoints`);
  return waypoints;
}

// ─── Public ───────────────────────────────────────────────────────────────────

async function computeMaritimeRoute(fromLat, fromLon, toLat, toLon) {
  const waypoints = await _waterRoute(fromLat, fromLon, toLat, toLon);
  return { fromSnapped: null, toSnapped: null, waypoints };
}

// Pre-load land index at startup so the first route request isn't slow
_loadLandIndex();

module.exports = { computeMaritimeRoute };
