const _fetch = globalThis.fetch;

// ─── Nominatim marina snap ────────────────────────────────────────────────────

async function _snapToMarina(lat, lon) {
  const d = 0.18;
  const vb = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const hdr = { 'User-Agent': 'SafeSeas/1.0', Accept: 'application/json' };
  const base = 'https://nominatim.openstreetmap.org/search';
  const [a, b] = await Promise.allSettled([
    _fetch(`${base}?q=marina&format=json&limit=8&viewbox=${vb}&bounded=1`,  { headers: hdr, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : []),
    _fetch(`${base}?q=harbour&format=json&limit=8&viewbox=${vb}&bounded=1`, { headers: hdr, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : []),
  ]);
  const results = [
    ...(a.status === 'fulfilled' ? a.value : []),
    ...(b.status === 'fulfilled' ? b.value : []),
  ];
  if (!results.length) return null;
  let best = null, bestDist = Infinity;
  for (const r of results) {
    const rlat = parseFloat(r.lat), rlon = parseFloat(r.lon);
    if (isNaN(rlat) || isNaN(rlon)) continue;
    const dist = Math.hypot(rlat - lat, rlon - lon);
    if (dist < bestDist) { bestDist = dist; best = { lat: rlat, lon: rlon, name: r.display_name?.split(',')[0] || null }; }
  }
  return best;
}

// ─── OpenTopoData helpers ─────────────────────────────────────────────────────

// GEBCO 2020 — 15 arc-sec (~460 m). Negative elevation = navigable water.
async function _gebco(points) {
  if (!points.length) return [];
  const locs = points.map(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join('|');
  try {
    const res = await _fetch(`https://api.opentopodata.org/v1/gebco2020?locations=${locs}`,
      { headers: { 'User-Agent': 'SafeSeas/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return points.map(() => -10);
    const data = await res.json();
    if (data.status !== 'OK') return points.map(() => -10);
    return (data.results || []).map(r => (typeof r.elevation === 'number' ? r.elevation : -10));
  } catch { return points.map(() => -10); }
}

// SRTM 30m — land only. Returns elevation for land, null for ocean.
// true = definitely land (elevation > 0.5 m), false = water / unknown.
async function _srtmIsLand(points) {
  if (!points.length) return [];
  const locs = points.map(p => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|');
  try {
    const res = await _fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${locs}`,
      { headers: { 'User-Agent': 'SafeSeas/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return points.map(() => false);
    const data = await res.json();
    if (data.status !== 'OK') return points.map(() => false);
    return (data.results || []).map(r => typeof r.elevation === 'number' && r.elevation > 0.5);
  } catch { return points.map(() => false); }
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

// ─── Depth-weighted A* ────────────────────────────────────────────────────────

function _astar(waterCells, startKey, endKey, lats, lons) {
  const latIdx = new Map(lats.map((v, i) => [v, i]));
  const lonIdx = new Map(lons.map((v, i) => [v, i]));
  const [eLat, eLon] = endKey.split(',').map(Number);
  const step = lats.length > 1 ? lats[1] - lats[0] : 0.02;

  const h = (lat, lon) => Math.hypot(lat - eLat, lon - eLon);
  const open = new MinHeap();
  const g = new Map([[startKey, 0]]);
  const from = new Map();
  const closed = new Set();
  open.push(startKey, h(...startKey.split(',').map(Number)));

  let iters = 0;
  while (open.size && iters++ < 30000) {
    const cur = open.pop();
    if (!cur || closed.has(cur)) continue;
    if (cur === endKey) {
      const path = []; let n = cur;
      while (n !== undefined) { path.unshift(n); n = from.get(n); }
      return path;
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
      // Depth cost: prefer deeper water (more negative elevation = deeper)
      const elev = waterCells.get(nKey);
      const depthFactor = elev < -20 ? 0.8 : elev < -5 ? 1.0 : 1.5;
      const edgeCost = (Math.abs(di) + Math.abs(dj) > 1 ? 1.414 : 1) * step * depthFactor;
      const ng = (g.get(cur) || 0) + edgeCost;
      if (ng < (g.get(nKey) ?? Infinity)) {
        from.set(nKey, cur); g.set(nKey, ng);
        open.push(nKey, ng + h(lats[ni], lons[nj]));
      }
    }
  }
  return null;
}

// ─── Douglas-Peucker ─────────────────────────────────────────────────────────

function _perp([la,lo],[la1,lo1],[la2,lo2]){const dx=la2-la1,dy=lo2-lo1,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(la-la1,lo-lo1);const t=((la-la1)*dx+(lo-lo1)*dy)/l2;return Math.hypot(la-(la1+t*dx),lo-(lo1+t*dy));}
function _simplify(pts, tol=0.002){if(pts.length<=2)return pts;let mx=0,mi=0;for(let i=1;i<pts.length-1;i++){const d=_perp(pts[i],pts[0],pts[pts.length-1]);if(d>mx){mx=d;mi=i;}}if(mx>tol)return[..._simplify(pts.slice(0,mi+1),tol).slice(0,-1),..._simplify(pts.slice(mi),tol)];return[pts[0],pts[pts.length-1]];}

// ─── SRTM segment validation + land bypass ───────────────────────────────────

// Sample N interior points along segment and return true if any is on land.
// Returns { isLand: bool, landPt: {lat, lon, t} | null }
async function _checkSegment(la1, lo1, la2, lo2, n = 12) {
  const samples = Array.from({ length: n }, (_, k) => {
    const t = (k + 1) / (n + 1);
    return { lat: +(la1 + t * (la2 - la1)).toFixed(5), lon: +(lo1 + t * (lo2 - lo1)).toFixed(5), t };
  });
  const land = await _srtmIsLand(samples);
  const first = samples.find((_, j) => land[j]);
  return first ?? null;
}

// Given a land point on segment [P1→P2], try perpendicular offsets to find water.
async function _bypass(landLat, landLon, la1, lo1, la2, lo2) {
  const dx = lo2 - lo1, dy = la2 - la1;
  const len = Math.hypot(dx, dy) || 1;
  const perpLat = -dx / len, perpLon = dy / len;

  for (const scale of [0.025, 0.05, 0.08, 0.13, 0.2]) {
    const cands = [
      { lat: +(landLat + perpLat * scale).toFixed(5), lon: +(landLon + perpLon * scale).toFixed(5) },
      { lat: +(landLat - perpLat * scale).toFixed(5), lon: +(landLon - perpLon * scale).toFixed(5) },
    ];
    const land = await _srtmIsLand(cands);
    const w = cands.find((_, j) => !land[j]);
    if (w) return [w.lat, w.lon];
  }
  return null;
}

// Walk every segment; insert a bypass waypoint for any that cross land.
// Iterates up to maxPasses to handle routes with multiple crossings.
async function _fixLandCrossings(waypoints, maxPasses = 3) {
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    const out = [waypoints[0]];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const [la1, lo1] = waypoints[i];
      const [la2, lo2] = waypoints[i + 1];
      const cross = await _checkSegment(la1, lo1, la2, lo2);
      if (!cross) { out.push([la2, lo2]); continue; }

      console.log(`Segment ${i} crosses land at ${cross.lat},${cross.lon} — finding bypass`);
      const bpt = await _bypass(cross.lat, cross.lon, la1, lo1, la2, lo2);
      if (bpt) { out.push(bpt, [la2, lo2]); changed = true; }
      else      { out.push([la2, lo2]); } // no bypass, keep original
    }

    waypoints = out;
    if (!changed) break;
  }
  return waypoints;
}

// ─── Main route builder ───────────────────────────────────────────────────────

async function _waterRoute(fromLat, fromLon, toLat, toLon) {
  const distKm = Math.hypot(
    (toLat - fromLat) * 111,
    (toLon - fromLon) * 111 * Math.cos(fromLat * Math.PI / 180)
  );
  // Finer grid for short routes — catches narrower obstacles
  const stepDeg = distKm < 50 ? 0.012 : distKm < 130 ? 0.022 : 0.05;
  const margin  = stepDeg * 5;

  const minLat = +(Math.min(fromLat, toLat) - margin).toFixed(4);
  const maxLat = +(Math.max(fromLat, toLat) + margin).toFixed(4);
  const minLon = +(Math.min(fromLon, toLon) - margin).toFixed(4);
  const maxLon = +(Math.max(fromLon, toLon) + margin).toFixed(4);

  const lats = [], lons = [];
  for (let v = minLat; v <= maxLat + 1e-9; v = +(v + stepDeg).toFixed(4)) lats.push(v);
  for (let v = minLon; v <= maxLon + 1e-9; v = +(v + stepDeg).toFixed(4)) lons.push(v);

  const grid = [];
  for (const lat of lats) for (const lon of lons) grid.push({ lat, lon });
  console.log(`A* grid: ${grid.length} pts (${lats.length}×${lons.length}) step=${stepDeg}° dist=${distKm.toFixed(0)}km`);

  // GEBCO in batches (rate-limit: 1 req/s)
  const waterCells = new Map();
  const BATCH = 100;
  for (let i = 0; i < grid.length; i += BATCH) {
    const batch = grid.slice(i, i + BATCH);
    const elevs = await _gebco(batch);
    for (let j = 0; j < batch.length; j++) {
      if (elevs[j] < 0) waterCells.set(`${batch[j].lat},${batch[j].lon}`, elevs[j]);
    }
    if (i + BATCH < grid.length) await new Promise(r => setTimeout(r, 1150));
  }

  const nearKey = (lat, lon) => {
    const nL = lats.reduce((a, b) => Math.abs(a - lat) < Math.abs(b - lat) ? a : b);
    const nO = lons.reduce((a, b) => Math.abs(a - lon) < Math.abs(b - lon) ? a : b);
    return `${nL},${nO}`;
  };
  const startKey = nearKey(fromLat, fromLon);
  const endKey   = nearKey(toLat, toLon);
  if (!waterCells.has(startKey)) waterCells.set(startKey, -5);
  if (!waterCells.has(endKey))   waterCells.set(endKey,   -5);

  console.log(`Water cells: ${waterCells.size}/${grid.length}  ${startKey}→${endKey}`);

  const path = _astar(waterCells, startKey, endKey, lats, lons);
  if (!path || path.length < 2) {
    console.warn('A* found no path — fallback to straight line');
    return [[fromLat, fromLon], [toLat, toLon]];
  }

  let waypoints = path.map(k => k.split(',').map(Number));
  waypoints[0] = [fromLat, fromLon];
  waypoints[waypoints.length - 1] = [toLat, toLon];
  waypoints = _simplify(waypoints);

  // ── SRTM 30m validation: fix any segments that still cross land ──────────
  console.log(`Validating ${waypoints.length - 1} segments with SRTM 30m…`);
  waypoints = await _fixLandCrossings(waypoints);
  // Re-apply exact endpoints after fix
  waypoints[0] = [fromLat, fromLon];
  waypoints[waypoints.length - 1] = [toLat, toLon];

  console.log(`Final route: ${waypoints.length} waypoints`);
  return waypoints;
}

// ─── Public ───────────────────────────────────────────────────────────────────

async function computeMaritimeRoute(fromLat, fromLon, toLat, toLon) {
  const [fromSnapped, toSnapped] = await Promise.all([
    _snapToMarina(fromLat, fromLon),
    _snapToMarina(toLat,   toLon),
  ]);
  const depLat = fromSnapped?.lat ?? fromLat;
  const depLon = fromSnapped?.lon ?? fromLon;
  const arrLat = toSnapped?.lat   ?? toLat;
  const arrLon = toSnapped?.lon   ?? toLon;

  const waypoints = await _waterRoute(depLat, depLon, arrLat, arrLon);

  return {
    fromSnapped: fromSnapped ? { lat: depLat, lon: depLon, name: fromSnapped.name } : null,
    toSnapped:   toSnapped   ? { lat: arrLat, lon: arrLon, name: toSnapped.name }   : null,
    waypoints,
  };
}

module.exports = { computeMaritimeRoute };
