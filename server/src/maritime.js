const path = require('path');
const fs   = require('fs');

// ─── Dual-constraint water classification ─────────────────────────────────────
//
// A cell is navigable water iff BOTH hold:
//   1. _isOcean(lat,lon)  — inside the NE10m ocean polygon
//      (outer ring = world; holes = large land masses / continents)
//   2. !_isLand(lat,lon)  — outside the NE10m land polygon
//      (6 837 individual polygons, including small barrier islands & cays)
//
// Using ocean alone misses small barrier islands (no hole in ocean polygon).
// Using !land alone misses inland lakes / non-ocean areas.
// Together they correctly classify open ocean, bays, AND small-island coasts.
//
// Performance:
//   • Route-level bbox filter  → land 6 837 → ~3 polys; ocean holes ~6 → ~6
//   • Per-polygon bbox check   → eliminates most remaining polys instantly
//   • Lat-band edge index (0.5°) → ~200–300 edges tested vs full ring

const BAND = 0.5;

// ─── Ring utilities ───────────────────────────────────────────────────────────

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

// ─── Ocean polygon (positive water mask) ──────────────────────────────────────

let _oceanIndex = null;
let _oceanBboxCache = null;

function _loadOceanIndex() {
  if (_oceanIndex) return _oceanIndex;
  console.log('Loading NE10m ocean index...');
  const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/ne_10m_ocean.geojson'), 'utf8'));
  _oceanIndex = [];
  for (const feat of fc.features) {
    const geom = feat.geometry;
    const allPolys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    for (const rings of allPolys) {
      const outer = _flattenRing(rings[0]);
      const holes = rings.slice(1).map(r => {
        const o = _flattenRing(r);
        return { flat: o.flat, bands: o.bands, bbox: o.bbox };
      });
      _oceanIndex.push({ bbox: outer.bbox, outer: outer.flat, outerBands: outer.bands, holes });
    }
  }
  console.log(`Ocean index: ${_oceanIndex.length} polygons, ${_oceanIndex.reduce((s,p)=>s+p.holes.length,0)} holes`);
  return _oceanIndex;
}

function _buildRouteOcean(mnLo, mnLa, mxLo, mxLa) {
  const key = `O:${mnLo},${mnLa},${mxLo},${mxLa}`;
  if (_oceanBboxCache?.key === key) return _oceanBboxCache.polys;
  const idx = _loadOceanIndex();
  const polys = idx.map(p => ({
    bbox: p.bbox,
    outer: p.outer,
    outerBands: p.outerBands,
    holes: p.holes.filter(h =>
      h.bbox[0] <= mxLo && h.bbox[2] >= mnLo &&
      h.bbox[1] <= mxLa && h.bbox[3] >= mnLa
    ),
  }));
  _oceanBboxCache = { key, polys };
  return polys;
}

function _isOcean(lat, lon, polys) {
  const local = polys ?? _loadOceanIndex();
  for (const { bbox, outer, outerBands, holes } of local) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    if (!_inBanded(lon, lat, outer, outerBands)) continue;
    for (const { flat, bands, bbox: hbb } of holes) {
      if (lon < hbb[0] || lon > hbb[2] || lat < hbb[1] || lat > hbb[3]) continue;
      if (_inBanded(lon, lat, flat, bands)) return false;
    }
    return true;
  }
  return false;
}

// ─── Land polygon (negative constraint — catches small barrier islands) ────────

let _landIndex = null;
let _landBboxCache = null;

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
      const holes = rings.slice(1).map(r => {
        const o = _flattenRing(r);
        return { flat: o.flat, bands: o.bands, bbox: o.bbox };
      });
      _landIndex.push({ bbox: outer.bbox, outer: outer.flat, outerBands: outer.bands, holes });
    }
  }
  console.log(`Land index: ${_landIndex.length} polygons`);
  return _landIndex;
}

function _buildRouteLand(mnLo, mnLa, mxLo, mxLa) {
  const key = `L:${mnLo},${mnLa},${mxLo},${mxLa}`;
  if (_landBboxCache?.key === key) return _landBboxCache.polys;
  const idx = _loadLandIndex();
  const polys = idx.filter(({ bbox }) =>
    bbox[0] <= mxLo && bbox[2] >= mnLo && bbox[1] <= mxLa && bbox[3] >= mnLa
  );
  console.log(`Land bbox filter: ${polys.length}/${idx.length} polygons`);
  _landBboxCache = { key, polys };
  return polys;
}

function _isLand(lat, lon, polys) {
  const local = polys ?? _loadLandIndex();
  for (const { bbox, outer, outerBands, holes } of local) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    if (!_inBanded(lon, lat, outer, outerBands)) continue;
    let inHole = false;
    for (const { flat, bands, bbox: hbb } of holes) {
      if (lon < hbb[0] || lon > hbb[2] || lat < hbb[1] || lat > hbb[3]) continue;
      if (_inBanded(lon, lat, flat, bands)) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

// Dual-constraint: navigable water = ocean AND not land
function _isWater(lat, lon, oceanPolys, landPolys) {
  return _isOcean(lat, lon, oceanPolys) && !_isLand(lat, lon, landPolys);
}

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
// Diagonal land-crossing safeguards:
//   1. No corner-cutting: both cardinal intermediates must be water cells.
//   2. Diagonal midpoint dual-check: midpoint of diagonal segment must be
//      water by both ocean polygon and land polygon.

function _astar(waterCells, startKey, endKey, lats, lons, oceanPolys, landPolys) {
  const latIdx = new Map(lats.map((v, i) => [v, i]));
  const lonIdx = new Map(lons.map((v, i) => [v, i]));
  const [eLat, eLon] = endKey.split(',').map(Number);
  const step = lats.length > 1 ? lats[1] - lats[0] : 0.01;

  const h = (lat, lon) => Math.hypot(lat - eLat, lon - eLon);
  const open   = new MinHeap();
  const g      = new Map([[startKey, 0]]);
  const from   = new Map();
  const closed = new Set();
  open.push(startKey, h(...startKey.split(',').map(Number)));

  let iters = 0;
  while (open.size && iters++ < 80000) {
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

      if (Math.abs(di) === 1 && Math.abs(dj) === 1) {
        // Safeguard 1: no corner-cutting
        const cardA = `${lats[ci + di]},${lons[cj]}`;
        const cardB = `${lats[ci]},${lons[cj + dj]}`;
        if (!waterCells.has(cardA) || !waterCells.has(cardB)) continue;
        // Safeguard 2: midpoint must pass dual water check
        const midLat = (cLat + lats[ni]) / 2;
        const midLon = (cLon + lons[nj]) / 2;
        if (!_isWater(midLat, midLon, oceanPolys, landPolys)) continue;
      }

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

// ─── Segment cross-check ──────────────────────────────────────────────────────

function _checkSegment(la1, lo1, la2, lo2, oceanPolys, landPolys) {
  const segLenKm = Math.hypot((la2-la1)*111, (lo2-lo1)*111*Math.cos(la1*Math.PI/180));
  const n = Math.max(20, Math.min(500, Math.ceil(segLenKm * 1000 / 40)));
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const lat = la1 + t * (la2 - la1);
    const lon = lo1 + t * (lo2 - lo1);
    if (!_isWater(lat, lon, oceanPolys, landPolys)) return { lat, lon, t };
  }
  return null;
}

// ─── Water-aware Douglas-Peucker simplification ───────────────────────────────

function _perp([la,lo],[la1,lo1],[la2,lo2]){const dx=la2-la1,dy=lo2-lo1,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(la-la1,lo-lo1);const t=((la-la1)*dx+(lo-lo1)*dy)/l2;return Math.hypot(la-(la1+t*dx),lo-(lo1+t*dy));}

function _simplify(pts, tol = 0.002, oceanPolys, landPolys) {
  if (pts.length <= 2) return pts;
  let mx = 0, mi = 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = _perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > mx) { mx = d; mi = i; }
  }
  if (mx > tol || _checkSegment(pts[0][0], pts[0][1], pts[pts.length-1][0], pts[pts.length-1][1], oceanPolys, landPolys)) {
    return [
      ..._simplify(pts.slice(0, mi + 1), tol, oceanPolys, landPolys).slice(0, -1),
      ..._simplify(pts.slice(mi), tol, oceanPolys, landPolys),
    ];
  }
  return [pts[0], pts[pts.length - 1]];
}

// ─── Nearest water cell (directional-biased) ──────────────────────────────────
// Expands outward in rings; scores by distance - 0.4 * cos(angle_toward_hint)
// so that water cells on the side facing the destination are preferred over
// equally-close cells on the far side of a barrier island.

function _nearestWater(key, waterCells, lats, lons, hintLat, hintLon) {
  if (waterCells.has(key)) return key;
  const [cLat, cLon] = key.split(',').map(Number);
  const ci = lats.findIndex(v => v === cLat);
  const cj = lons.findIndex(v => v === cLon);
  if (ci < 0 || cj < 0) return key;

  const dhLat = (hintLat ?? cLat) - cLat;
  const dhLon = (hintLon ?? cLon) - cLon;
  const dhLen = Math.hypot(dhLat, dhLon) || 1;
  const uhLat = dhLat / dhLen, uhLon = dhLon / dhLen;

  let bestKey = null, bestScore = Infinity;
  for (let r = 1; r <= 20; r++) {
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || ni >= lats.length || nj < 0 || nj >= lons.length) continue;
        const nKey = `${lats[ni]},${lons[nj]}`;
        if (!waterCells.has(nKey)) continue;
        const dist = Math.hypot(di, dj);
        const dot  = (di * uhLat + dj * uhLon) / dist;
        const score = dist - 0.4 * dot;
        if (score < bestScore) { bestScore = score; bestKey = nKey; }
      }
    }
    if (bestKey && r >= Math.ceil(bestScore)) break;
  }
  return bestKey ?? key;
}

// ─── Core routing ─────────────────────────────────────────────────────────────

async function _waterRoute(fromLat, fromLon, toLat, toLon) {
  const distKm = Math.hypot(
    (toLat - fromLat) * 111,
    (toLon - fromLon) * 111 * Math.cos(fromLat * Math.PI / 180)
  );

  const stepDeg = distKm < 15  ? 0.003
                : distKm < 50  ? 0.005
                : distKm < 130 ? 0.010
                : 0.025;

  const margin = distKm < 20  ? 0.3
               : distKm < 50  ? 0.5
               : distKm < 130 ? 0.65
               : Math.max(0.7, distKm * 0.007);

  const minLat = +(Math.min(fromLat, toLat) - margin).toFixed(5);
  const maxLat = +(Math.max(fromLat, toLat) + margin).toFixed(5);
  const minLon = +(Math.min(fromLon, toLon) - margin).toFixed(5);
  const maxLon = +(Math.max(fromLon, toLon) + margin).toFixed(5);

  const lats = [], lons = [];
  for (let v = minLat; v <= maxLat + 1e-9; v = +(v + stepDeg).toFixed(5)) lats.push(v);
  for (let v = minLon; v <= maxLon + 1e-9; v = +(v + stepDeg).toFixed(5)) lons.push(v);

  console.log(`A* grid: ${lats.length}×${lons.length}=${lats.length*lons.length} pts, step=${stepDeg}°, dist=${distKm.toFixed(0)}km`);

  const oceanPolys = _buildRouteOcean(minLon, minLat, maxLon, maxLat);
  const landPolys  = _buildRouteLand(minLon, minLat, maxLon, maxLat);

  // Dual-constraint grid: water = in ocean polygon AND not in land polygon
  const t0 = Date.now();
  const waterCells = new Set();
  for (const lat of lats) {
    for (const lon of lons) {
      if (_isWater(lat, lon, oceanPolys, landPolys)) waterCells.add(`${lat},${lon}`);
    }
  }
  console.log(`Grid classified in ${Date.now()-t0}ms. Water: ${waterCells.size}/${lats.length*lons.length}`);

  const nearKey = (lat, lon) => {
    const nL = lats.reduce((a, b) => Math.abs(a - lat) < Math.abs(b - lat) ? a : b);
    const nO = lons.reduce((a, b) => Math.abs(a - lon) < Math.abs(b - lon) ? a : b);
    return `${nL},${nO}`;
  };

  const startKey = _nearestWater(nearKey(fromLat, fromLon), waterCells, lats, lons, toLat,   toLon);
  const endKey   = _nearestWater(nearKey(toLat,   toLon),   waterCells, lats, lons, fromLat, fromLon);

  if (!waterCells.has(startKey)) waterCells.add(startKey);
  if (!waterCells.has(endKey))   waterCells.add(endKey);

  const routePath = _astar(waterCells, startKey, endKey, lats, lons, oceanPolys, landPolys);
  if (!routePath || routePath.length < 2) {
    console.warn('A* found no path — straight line fallback');
    return [[fromLat, fromLon], [toLat, toLon]];
  }

  let waypoints = _simplify(routePath.map(k => k.split(',').map(Number)), 0.002, oceanPolys, landPolys);

  // Anchor endpoints to the exact pin only when the straight-line segment from
  // the pin to the first/last A* waypoint is fully through navigable water.
  // _checkSegment samples 20-500 points along the segment using the dual
  // constraint — if any sample hits land (either polygon), we skip the anchor
  // and keep the already-correct snapped water cell instead.
  // This handles pins on small barrier islands regardless of polygon resolution.
  const astarFrom = routePath[0].split(',').map(Number);
  const astarTo   = routePath[routePath.length - 1].split(',').map(Number);
  const fromClear = !_checkSegment(fromLat, fromLon, astarFrom[0], astarFrom[1], oceanPolys, landPolys);
  const toClear   = !_checkSegment(toLat,   toLon,   astarTo[0],  astarTo[1],   oceanPolys, landPolys);
  if (fromClear) waypoints[0] = [fromLat, fromLon];
  if (toClear)   waypoints[waypoints.length - 1] = [toLat, toLon];

  console.log(`Route: ${waypoints.length} waypoints (from-clear=${fromClear}, to-clear=${toClear})`);
  return waypoints;
}

// ─── Public ───────────────────────────────────────────────────────────────────

async function computeMaritimeRoute(fromLat, fromLon, toLat, toLon) {
  const waypoints = await _waterRoute(fromLat, fromLon, toLat, toLon);
  return { fromSnapped: null, toSnapped: null, waypoints };
}

// Pre-load both indexes at startup
_loadOceanIndex();
_loadLandIndex();

module.exports = { computeMaritimeRoute };
