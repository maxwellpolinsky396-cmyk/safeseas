const path = require('path');
const fs   = require('fs');
const waterRaster = require('./waterRaster');

// ─── Maritime pathfinding ──────────────────────────────────────────────────────
//
// Primary path: an O(1) precomputed water raster (waterRaster.js) covering the
// app's operating region (continental US Atlantic + Gulf coast + Caribbean
// margin). Because raster lookups are cheap, A* validates EVERY accepted move
// — cardinal and diagonal alike — by sampling several points along its length
// at a fixed real-world spacing. This is what actually prevents land-crossing;
// previous versions of this file only mid-edge-checked diagonal moves, so a
// single cardinal hop could pass clean over a barrier island.
//
// Fallback path: for requests with an endpoint outside the raster's fixed
// bounding box, the original per-request point-in-polygon (PIP) approach
// against the raw Natural Earth ocean/land polygons is used instead (slower,
// but still correctness-safe — it gets the same full-edge validation).
//
// Both paths share one A* implementation, parameterized by a small
// "water predicate" object: { isWater(lat,lon), edgeClear(la1,lo1,la2,lo2) }.

const BAND = 0.5;
const NEIGHBORS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

// ─── Ring utilities (legacy PIP path) ──────────────────────────────────────────

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

// ─── Ocean polygon (positive water mask) — legacy PIP path ────────────────────

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

// ─── Land polygon (negative constraint) — legacy PIP path ─────────────────────

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

function _isWaterPIP(lat, lon, oceanPolys, landPolys) {
  return _isOcean(lat, lon, oceanPolys) && !_isLand(lat, lon, landPolys);
}

// ─── Distance helpers ───────────────────────────────────────────────────────

function _haversineKm(la1, lo1, la2, lo2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (la2-la1)*d2r, dLon = (lo2-lo1)*d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(la1*d2r)*Math.cos(la2*d2r)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function _pathLengthNm(pts) {
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    km += _haversineKm(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]);
  }
  return km / 1.852;
}

// ─── Edge (segment) water verification ─────────────────────────────────────────
// Samples at a fixed real-world spacing (not a capped sample COUNT) so long
// chords can't skip over a barrier island narrower than the spacing.

const EDGE_SAMPLE_SPACING_M = 100;

function _rasterEdgeClear(la1, lo1, la2, lo2) {
  const distM = _haversineKm(la1, lo1, la2, lo2) * 1000;
  const n = Math.max(1, Math.ceil(distM / EDGE_SAMPLE_SPACING_M));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const lat = la1 + t * (la2 - la1);
    const lon = lo1 + t * (lo2 - lo1);
    if (waterRaster.isWaterAt(lat, lon) !== true) return false;
  }
  return true;
}

function _pipEdgeClear(la1, lo1, la2, lo2, oceanPolys, landPolys) {
  const distM = _haversineKm(la1, lo1, la2, lo2) * 1000;
  const n = Math.max(20, Math.ceil(distM / EDGE_SAMPLE_SPACING_M));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const lat = la1 + t * (la2 - la1);
    const lon = lo1 + t * (lo2 - lo1);
    if (!_isWaterPIP(lat, lon, oceanPolys, landPolys)) return false;
  }
  return true;
}

// Exact (non-raster) segment check against the raw polygons, at fine (~15m)
// spacing. The raster is a ~150-170m discretization of the coastline, so it
// can disagree with the true vector boundary within about one cell of any
// shoreline — negligible for open-water A* search, but endpoint anchoring
// connects the literal user-clicked pin (often right at a tight urban
// waterfront/marina) directly to the route, which is exactly where that
// discretization risk matters most. Anchoring only runs twice per route over
// a short (capped ~3km) segment, so paying the exact-PIP cost here is cheap.
const ANCHOR_SAMPLE_SPACING_M = 15;

function _exactEdgeClear(la1, lo1, la2, lo2, oceanPolys, landPolys) {
  const distM = _haversineKm(la1, lo1, la2, lo2) * 1000;
  const n = Math.max(4, Math.ceil(distM / ANCHOR_SAMPLE_SPACING_M));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const lat = la1 + t * (la2 - la1);
    const lon = lo1 + t * (lo2 - lo1);
    if (!_isWaterPIP(lat, lon, oceanPolys, landPolys)) return false;
  }
  return true;
}

// Builds the water predicate for one route request: raster-backed when both
// endpoints (plus margin) fall inside the raster's fixed region, PIP-backed
// otherwise.
function _makeWaterPredicate(minLat, minLon, maxLat, maxLon) {
  if (waterRaster.contains(minLat, minLon) && waterRaster.contains(maxLat, maxLon)) {
    return {
      mode: 'raster',
      isWater: (lat, lon) => waterRaster.isWaterAt(lat, lon) === true,
      edgeClear: _rasterEdgeClear,
    };
  }
  const oceanPolys = _buildRouteOcean(minLon, minLat, maxLon, maxLat);
  const landPolys  = _buildRouteLand(minLon, minLat, maxLon, maxLat);
  return {
    mode: 'legacy-pip',
    isWater: (lat, lon) => _isWaterPIP(lat, lon, oceanPolys, landPolys),
    edgeClear: (la1, lo1, la2, lo2) => _pipEdgeClear(la1, lo1, la2, lo2, oceanPolys, landPolys),
  };
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

// ─── A* over the water grid ─────────────────────────────────────────────────
// Every accepted move — cardinal AND diagonal — is validated with
// waterPred.edgeClear(), which samples along the full edge length at a fixed
// real-world spacing. This is the fix for the core bug: the old version only
// mid-edge-checked diagonal moves, so a cardinal hop could cross a barrier
// island undetected.

function _astar(startLat, startLon, endLat, endLon, lats, lons, waterPred) {
  const latIdx = new Map(lats.map((v, i) => [v, i]));
  const lonIdx = new Map(lons.map((v, i) => [v, i]));
  const startKey = `${startLat},${startLon}`;
  const endKey = `${endLat},${endLon}`;
  const cosLat = Math.cos(((startLat + endLat) / 2) * Math.PI / 180);

  const h = (lat, lon) => Math.hypot(lat - endLat, (lon - endLon) * cosLat);
  const open   = new MinHeap();
  const g      = new Map([[startKey, 0]]);
  const from   = new Map();
  const closed = new Set();
  open.push(startKey, h(startLat, startLon));

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

    for (const [di, dj] of NEIGHBORS8) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || ni >= lats.length || nj < 0 || nj >= lons.length) continue;
      const nLat = lats[ni], nLon = lons[nj];
      const nKey = `${nLat},${nLon}`;
      if (closed.has(nKey)) continue;
      if (!waterPred.isWater(nLat, nLon)) continue;
      if (!waterPred.edgeClear(cLat, cLon, nLat, nLon)) continue;

      const dLat = nLat - cLat, dLon = (nLon - cLon) * cosLat;
      const edgeCost = Math.hypot(dLat, dLon);
      const ng = (g.get(cur) || 0) + edgeCost;
      if (ng < (g.get(nKey) ?? Infinity)) {
        from.set(nKey, cur); g.set(nKey, ng);
        open.push(nKey, ng + h(nLat, nLon));
      }
    }
  }
  return null;
}

// ─── Water-aware Douglas-Peucker simplification ───────────────────────────────
// Every candidate collapsed chord is re-verified with the exact (non-raster)
// check before being accepted — a 2-point leaf reached via recursion is
// always a directly-adjacent pair from the raw A* path (already
// raster-validated during search), so it's safe to return unchecked; the
// risky case is the collapse branch below, which always re-checks before
// collapsing.

function _perp([la,lo],[la1,lo1],[la2,lo2]){const dx=la2-la1,dy=lo2-lo1,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(la-la1,lo-lo1);const t=((la-la1)*dx+(lo-lo1)*dy)/l2;return Math.hypot(la-(la1+t*dx),lo-(lo1+t*dy));}

function _simplify(pts, tol, oceanPolys, landPolys) {
  if (pts.length <= 2) return pts;
  let mx = 0, mi = 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = _perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > mx) { mx = d; mi = i; }
  }
  // Exact (non-raster) check, short-circuited: only actually runs once the
  // chord has already passed the cheap deviation test, so it's paid at most
  // once per surviving (near-final) chord, not on every recursive call.
  if (mx > tol || !_exactEdgeClear(pts[0][0], pts[0][1], pts[pts.length-1][0], pts[pts.length-1][1], oceanPolys, landPolys)) {
    return [
      ..._simplify(pts.slice(0, mi + 1), tol, oceanPolys, landPolys).slice(0, -1),
      ..._simplify(pts.slice(mi), tol, oceanPolys, landPolys),
    ];
  }
  return [pts[0], pts[pts.length - 1]];
}

// ─── Nearest water cell (directional-biased) ──────────────────────────────────
// Expands outward in grid rings, capped to a real-world search radius, scoring
// by distance minus a bias toward the destination-facing side (so a barrier
// island doesn't strand the snap on the wrong side of it). Returns null if
// nothing is found within the cap — callers must NOT silently legitimize a
// land point, unlike the previous implementation.
//
// The raster is a ~150-170m discretization of the coastline, so near a tight
// or intricate shoreline it can occasionally disagree with the exact polygon
// boundary by about one cell. That's fine for A* search (open water doesn't
// care), but this is the literal point a route can start/end at, so each
// ring's candidates are tried in score order against the exact check
// (route-bbox-filtered, so it stays cheap) until one survives both — a ring
// has at most a few dozen candidates.

const NEAREST_WATER_MAX_M = 3000;

function _nearestWater(lat, lon, hintLat, hintLon, waterPred, stepDeg, oceanPolys, landPolys) {
  if (waterPred.isWater(lat, lon) && _isWaterPIP(lat, lon, oceanPolys, landPolys)) return { lat, lon };

  const dhLat = (hintLat ?? lat) - lat;
  const dhLon = (hintLon ?? lon) - lon;
  const dhLen = Math.hypot(dhLat, dhLon) || 1;
  const uhLat = dhLat / dhLen, uhLon = dhLon / dhLen;

  const maxRing = Math.max(1, Math.ceil(NEAREST_WATER_MAX_M / (stepDeg * 111000)));
  for (let r = 1; r <= maxRing; r++) {
    const candidates = [];
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const nLat = +(lat + di * stepDeg).toFixed(5);
        const nLon = +(lon + dj * stepDeg).toFixed(5);
        if (!waterPred.isWater(nLat, nLon)) continue;
        const dist = Math.hypot(di, dj);
        const dot  = (di * uhLat + dj * uhLon) / dist;
        candidates.push({ lat: nLat, lon: nLon, score: dist - 0.4 * dot });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const c of candidates) {
      if (_isWaterPIP(c.lat, c.lon, oceanPolys, landPolys)) return { lat: c.lat, lon: c.lon };
    }
  }
  return null;
}

// ─── Core routing ─────────────────────────────────────────────────────────────

async function _waterRoute(fromLat, fromLon, toLat, toLon) {
  const distKm = _haversineKm(fromLat, fromLon, toLat, toLon);

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

  const waterPred = _makeWaterPredicate(minLat, minLon, maxLat, maxLon);
  // Built regardless of raster/legacy mode: this is the route-bbox-filtered
  // (cheap) polygon set used by every *exact* check below (endpoint snap
  // verification, simplify chord verification, anchoring) — using the
  // unfiltered global index there was the previous perf regression (each
  // exact check would otherwise scan all 6837 land polygons).
  const oceanPolys = _buildRouteOcean(minLon, minLat, maxLon, maxLat);
  const landPolys  = _buildRouteLand(minLon, minLat, maxLon, maxLat);
  console.log(`A* grid: ${lats.length}×${lons.length}=${lats.length*lons.length} pts, step=${stepDeg}°, dist=${distKm.toFixed(0)}km, mode=${waterPred.mode}`);

  const nearestLat = v => lats.reduce((a, b) => Math.abs(a - v) < Math.abs(b - v) ? a : b);
  const nearestLon = v => lons.reduce((a, b) => Math.abs(a - v) < Math.abs(b - v) ? a : b);

  const t0 = Date.now();
  const startSnap = _nearestWater(nearestLat(fromLat), nearestLon(fromLon), toLat, toLon, waterPred, stepDeg, oceanPolys, landPolys);
  if (!startSnap) {
    return { ok: false, code: 'NO_WATER_NEAR_ENDPOINT', message: 'No navigable water found near the departure point.' };
  }
  const endSnap = _nearestWater(nearestLat(toLat), nearestLon(toLon), fromLat, fromLon, waterPred, stepDeg, oceanPolys, landPolys);
  if (!endSnap) {
    return { ok: false, code: 'NO_WATER_NEAR_ENDPOINT', message: 'No navigable water found near the arrival point.' };
  }

  const rawPath = _astar(startSnap.lat, startSnap.lon, endSnap.lat, endSnap.lon, lats, lons, waterPred);
  if (!rawPath || rawPath.length < 2) {
    console.warn('A* found no path');
    return { ok: false, code: 'NO_ROUTE_FOUND', message: 'No water route could be found between these points.' };
  }

  let waypoints = _simplify(rawPath.map(k => k.split(',').map(Number)), 0.002, oceanPolys, landPolys);

  // Endpoint anchoring: connect the literal requested pin if a clear straight
  // segment exists to it, so the drawn route actually touches the marker
  // instead of stopping short at the nearest grid-snapped water cell. Uses
  // the exact (non-raster) check — see _exactEdgeClear above.
  if (_exactEdgeClear(fromLat, fromLon, waypoints[0][0], waypoints[0][1], oceanPolys, landPolys)) {
    waypoints[0] = [fromLat, fromLon];
  }
  const lastIdx = waypoints.length - 1;
  if (_exactEdgeClear(toLat, toLon, waypoints[lastIdx][0], waypoints[lastIdx][1], oceanPolys, landPolys)) {
    waypoints[lastIdx] = [toLat, toLon];
  }

  console.log(`Route: ${waypoints.length} waypoints in ${Date.now()-t0}ms`);
  return { ok: true, waypoints, distanceNm: Math.round(_pathLengthNm(waypoints) * 10) / 10 };
}

// ─── Public ───────────────────────────────────────────────────────────────────

async function computeMaritimeRoute(fromLat, fromLon, toLat, toLon) {
  return _waterRoute(fromLat, fromLon, toLat, toLon);
}

// Pre-load at startup (legacy indexes stay needed for the out-of-region fallback path).
_loadOceanIndex();
_loadLandIndex();
waterRaster.preload();

module.exports = { computeMaritimeRoute };
