const path = require('path');
const fs   = require('fs');

// ─── Ocean polygon index ──────────────────────────────────────────────────────
// NE10m OCEAN polygon: a point is navigable water iff _isOcean() returns true.
// The polygon's outer ring is the world boundary; its holes are land masses
// (continents, islands). isOcean = inside outer ring AND outside all holes.
// Resolution ~0.5–1 km at coastlines — sufficient for inter-coastal routing.
//
// Performance layers:
//   1. Route-level hole pre-filter  →  6804 global holes → ~5–15 local holes
//   2. Per-hole bbox check          →  eliminates most remaining holes instantly
//   3. Lat-band edge index (0.5°)   →  ~200–300 edges tested vs 66K for N.America ring

let _oceanIndex = null;      // Array of { bbox, outer, outerBands, holes[] }
let _oceanBboxCache = null;  // { key, mainOuter, mainOuterBands, holes }

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

// Ray-cast using lat-band index — only tests edges in the point's 0.5° lat strip
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

// ─── Load ocean index ─────────────────────────────────────────────────────────

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
      // Store bbox with each hole for fast point-outside-hole short-circuit
      const holes = rings.slice(1).map(r => {
        const o = _flattenRing(r);
        return { flat: o.flat, bands: o.bands, bbox: o.bbox };
      });
      _oceanIndex.push({ bbox: outer.bbox, outer: outer.flat, outerBands: outer.bands, holes });
    }
  }
  console.log(`Ocean index: ${_oceanIndex.length} polygons, ${_oceanIndex.reduce((s, p) => s + p.holes.length, 0)} total holes`);
  return _oceanIndex;
}

// ─── Route-level hole pre-filter ──────────────────────────────────────────────
// For each ocean polygon, filter its holes down to those touching the route bbox.
// This reduces ~6804 global holes to a handful of local land masses per route.

function _buildRouteOcean(mnLo, mnLa, mxLo, mxLa) {
  const key = `${mnLo},${mnLa},${mxLo},${mxLa}`;
  if (_oceanBboxCache?.key === key) return _oceanBboxCache.polys;

  const idx = _loadOceanIndex();
  const polys = idx.map(p => ({
    bbox: p.bbox,
    outer: p.outer,
    outerBands: p.outerBands,
    // Keep only holes whose bbox overlaps the route bbox
    holes: p.holes.filter(h =>
      h.bbox[0] <= mxLo && h.bbox[2] >= mnLo &&
      h.bbox[1] <= mxLa && h.bbox[3] >= mnLa
    ),
  }));
  const totalHoles = polys.reduce((s, p) => s + p.holes.length, 0);
  console.log(`Route hole filter: ${totalHoles} holes (of ${idx.reduce((s,p)=>s+p.holes.length,0)} global)`);
  _oceanBboxCache = { key, polys };
  return polys;
}

// ─── Point-in-ocean test ──────────────────────────────────────────────────────

function _isOcean(lat, lon, polys) {
  const local = polys ?? _loadOceanIndex();
  for (const { bbox, outer, outerBands, holes } of local) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    if (!_inBanded(lon, lat, outer, outerBands)) continue;
    // Inside outer ring — now check if it falls inside a land-mass hole
    for (const { flat, bands, bbox: hbb } of holes) {
      if (lon < hbb[0] || lon > hbb[2] || lat < hbb[1] || lat > hbb[3]) continue;
      if (_inBanded(lon, lat, flat, bands)) return false; // inside a land hole
    }
    return true;
  }
  return false;
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
// Two land-crossing safeguards baked into expansion:
//   1. No corner-cutting: diagonal (di,dj) requires both cardinal intermediates
//      (i+di,j) and (i,j+dj) to also be water. Prevents routes squeezing
//      through diagonal gaps in thin barrier islands.
//   2. Midpoint check: for diagonal moves, verify the midpoint of the segment
//      is ocean. Catches thin strips missed at the grid cell level.

function _astar(waterCells, startKey, endKey, lats, lons, oceanPolys) {
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

      // ── Safeguard 1: no corner-cutting through land ──────────────────────
      if (Math.abs(di) === 1 && Math.abs(dj) === 1) {
        const cardA = `${lats[ci + di]},${lons[cj]}`;
        const cardB = `${lats[ci]},${lons[cj + dj]}`;
        if (!waterCells.has(cardA) || !waterCells.has(cardB)) continue;

        // ── Safeguard 2: midpoint of diagonal segment must be ocean ─────────
        const midLat = (cLat + lats[ni]) / 2;
        const midLon = (cLon + lons[nj]) / 2;
        if (!_isOcean(midLat, midLon, oceanPolys)) continue;
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

// ─── Segment cross-check (used during path simplification) ───────────────────
// Samples N points along a segment. Returns a land-crossing hit if found.

function _checkSegment(la1, lo1, la2, lo2, oceanPolys) {
  const segLenKm = Math.hypot((la2-la1)*111, (lo2-lo1)*111*Math.cos(la1*Math.PI/180));
  const n = Math.max(20, Math.min(500, Math.ceil(segLenKm * 1000 / 40)));
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const lat = la1 + t * (la2 - la1);
    const lon = lo1 + t * (lo2 - lo1);
    if (!_isOcean(lat, lon, oceanPolys)) return { lat, lon, t };
  }
  return null;
}

// ─── Water-aware Douglas-Peucker simplification ───────────────────────────────

function _perp([la,lo],[la1,lo1],[la2,lo2]){const dx=la2-la1,dy=lo2-lo1,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(la-la1,lo-lo1);const t=((la-la1)*dx+(lo-lo1)*dy)/l2;return Math.hypot(la-(la1+t*dx),lo-(lo1+t*dy));}

function _simplify(pts, tol = 0.002, oceanPolys) {
  if (pts.length <= 2) return pts;
  let mx = 0, mi = 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = _perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > mx) { mx = d; mi = i; }
  }
  if (mx > tol || _checkSegment(pts[0][0], pts[0][1], pts[pts.length-1][0], pts[pts.length-1][1], oceanPolys)) {
    return [
      ..._simplify(pts.slice(0, mi + 1), tol, oceanPolys).slice(0, -1),
      ..._simplify(pts.slice(mi), tol, oceanPolys),
    ];
  }
  return [pts[0], pts[pts.length - 1]];
}

// ─── Nearest water cell in grid ───────────────────────────────────────────────
// Searches outward in expanding rings.  When hint coords (the other endpoint)
// are supplied, scores candidates by: grid_distance - 0.4 * cos(angle_toward_hint)
// so that water cells on the side of a barrier island facing the destination are
// preferred over equally-close cells on the far side.

function _nearestWater(key, waterCells, lats, lons, hintLat, hintLon) {
  if (waterCells.has(key)) return key;
  const [cLat, cLon] = key.split(',').map(Number);
  const ci = lats.findIndex(v => v === cLat);
  const cj = lons.findIndex(v => v === cLon);
  if (ci < 0 || cj < 0) return key;

  // Unit vector toward hint (destination/departure)
  const dhLat = (hintLat ?? cLat) - cLat;
  const dhLon = (hintLon ?? cLon) - cLon;
  const dhLen = Math.hypot(dhLat, dhLon) || 1;
  const uhLat = dhLat / dhLen, uhLon = dhLon / dhLen;

  let bestKey = null, bestScore = Infinity;

  for (let r = 1; r <= 16; r++) {
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || ni >= lats.length || nj < 0 || nj >= lons.length) continue;
        const nKey = `${lats[ni]},${lons[nj]}`;
        if (!waterCells.has(nKey)) continue;
        const dot  = (di * uhLat + dj * uhLon) / (Math.hypot(di, dj) || 1);
        const score = Math.hypot(di, dj) - 0.4 * dot;
        if (score < bestScore) { bestScore = score; bestKey = nKey; }
      }
    }
    // Stop once we've found a candidate in this ring and gone one ring further
    if (bestKey && r > Math.sqrt(bestScore) + 1) break;
  }
  return bestKey ?? key;
}

// ─── Core routing ─────────────────────────────────────────────────────────────

async function _waterRoute(fromLat, fromLon, toLat, toLon) {
  const distKm = Math.hypot(
    (toLat - fromLat) * 111,
    (toLon - fromLon) * 111 * Math.cos(fromLat * Math.PI / 180)
  );

  // Step: fine enough to resolve coastal channels.
  // No-corner-cutting in A* means we need step < ~half the width of thin waterways.
  const stepDeg = distKm < 15  ? 0.003   // ~330 m — resolves ICW-scale channels
                : distKm < 50  ? 0.005   // ~550 m
                : distKm < 130 ? 0.010   // ~1.1 km
                : 0.025;                 // ~2.8 km for long offshore routes

  // Margin: generous enough to route around peninsulas & barrier island chains.
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

  // Pre-filter ocean polygon holes to route bbox (6804 global → handful local)
  const oceanPolys = _buildRouteOcean(minLon, minLat, maxLon, maxLat);

  // Classify grid using positive ocean polygon
  const t0 = Date.now();
  const waterCells = new Set();
  for (const lat of lats) {
    for (const lon of lons) {
      if (_isOcean(lat, lon, oceanPolys)) waterCells.add(`${lat},${lon}`);
    }
  }
  console.log(`Grid classified in ${Date.now()-t0}ms. Water: ${waterCells.size}/${lats.length*lons.length}`);

  const nearKey = (lat, lon) => {
    const nL = lats.reduce((a, b) => Math.abs(a - lat) < Math.abs(b - lat) ? a : b);
    const nO = lons.reduce((a, b) => Math.abs(a - lon) < Math.abs(b - lon) ? a : b);
    return `${nL},${nO}`;
  };

  // Hint = the OTHER endpoint so snapping prefers the side facing the destination
  const startKey = _nearestWater(nearKey(fromLat, fromLon), waterCells, lats, lons, toLat,   toLon);
  const endKey   = _nearestWater(nearKey(toLat,   toLon),   waterCells, lats, lons, fromLat, fromLon);

  if (!waterCells.has(startKey)) waterCells.add(startKey);
  if (!waterCells.has(endKey))   waterCells.add(endKey);

  const routePath = _astar(waterCells, startKey, endKey, lats, lons, oceanPolys);
  if (!routePath || routePath.length < 2) {
    console.warn('A* found no path — straight line fallback');
    return [[fromLat, fromLon], [toLat, toLon]];
  }

  let waypoints = _simplify(routePath.map(k => k.split(',').map(Number)), 0.002, oceanPolys);

  // Anchor endpoints to exact user coords ONLY when the pin is in navigable water.
  // If a pin sits on land at NE10m scale (marina, dock, barrier-island road), the
  // A* already started from the nearest water cell — keep that rather than drawing
  // a straight line back through land to the pin.
  if (_isOcean(fromLat, fromLon, oceanPolys)) waypoints[0] = [fromLat, fromLon];
  if (_isOcean(toLat,   toLon,   oceanPolys)) waypoints[waypoints.length - 1] = [toLat, toLon];

  console.log(`Route: ${waypoints.length} waypoints, from-in-ocean=${_isOcean(fromLat,fromLon,oceanPolys)}, to-in-ocean=${_isOcean(toLat,toLon,oceanPolys)}`);
  return waypoints;
}

// ─── Public ───────────────────────────────────────────────────────────────────

async function computeMaritimeRoute(fromLat, fromLon, toLat, toLon) {
  const waypoints = await _waterRoute(fromLat, fromLon, toLat, toLon);
  return { fromSnapped: null, toSnapped: null, waypoints };
}

// Pre-load ocean index at startup so the first route request isn't slow
_loadOceanIndex();

module.exports = { computeMaritimeRoute };
