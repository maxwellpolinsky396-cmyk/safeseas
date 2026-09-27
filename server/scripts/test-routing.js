#!/usr/bin/env node
// Regression check for computeMaritimeRoute — no test framework in this repo,
// so this is a plain Node script (matches download-noaa-data.js's convention).
// Run: node server/scripts/test-routing.js
//
// This exists because the "route crosses land" bug has been silently
// reintroduced multiple times (see git log). Run this after any change to
// server/src/maritime.js or server/src/waterRaster.js.

const path = require('path');
const fs = require('fs');
const turfBooleanPip = require('@turf/boolean-point-in-polygon').default;
const { point } = require('@turf/helpers');
const { computeMaritimeRoute } = require('../src/maritime');

const land = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/ne_10m_land.geojson'), 'utf8'));

function isOnLand(lat, lon) {
  const pt = point([lon, lat]);
  for (const feat of land.features) {
    if (turfBooleanPip(pt, feat)) return true;
  }
  return false;
}

function haversineKm(la1, lo1, la2, lo2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (la2 - la1) * d2r, dLon = (lo2 - lo1) * d2r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * d2r) * Math.cos(la2 * d2r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Densely sample a polyline (~50m spacing) and report any point that lands on land.
function findLandCrossings(waypoints) {
  const crossings = [];
  for (let i = 1; i < waypoints.length; i++) {
    const [la1, lo1] = waypoints[i - 1];
    const [la2, lo2] = waypoints[i];
    const distM = haversineKm(la1, lo1, la2, lo2) * 1000;
    const n = Math.max(1, Math.ceil(distM / 50));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const lat = la1 + t * (la2 - la1);
      const lon = lo1 + t * (lo2 - lo1);
      if (isOnLand(lat, lon)) crossings.push([lat, lon]);
    }
  }
  return crossings;
}

const ENDPOINT_TOLERANCE_KM = 3.5; // allow for grid-snap when the literal pin isn't reachable

const CASES = [
  { name: 'Fernandina Beach -> Cumberland Island', from: [30.70, -81.44], to: [30.8020, -81.4370], expect: 'route' },
  { name: 'Sarasota short hop',                    from: [27.3364, -82.5307], to: [27.2364, -82.6100], expect: 'route' },
  { name: 'Anna Maria Island -> Fort Myers',        from: [27.5253, -82.7412], to: [26.6406, -81.8723], expect: 'route' },
  { name: 'Miami -> Tampa (previously crossed Key Largo)',      from: [25.7743, -80.1937], to: [27.85, -82.55], expect: 'route' },
  { name: 'Charleston -> Miami (previously crossed Miami Beach)', from: [32.7765, -79.9311], to: [25.7743, -80.1937], expect: 'route' },
  { name: 'Lake Okeechobee -> Gulf (genuinely unreachable)', from: [26.9, -80.8], to: [26.5, -82.0], expect: 'no_route' },
];

async function main() {
  let failures = 0;

  for (const c of CASES) {
    process.stdout.write(`\n— ${c.name} — `);
    const t0 = Date.now();
    const result = await computeMaritimeRoute(c.from[0], c.from[1], c.to[0], c.to[1]);
    const ms = Date.now() - t0;

    if (c.expect === 'no_route') {
      if (result.ok) {
        console.log(`FAIL (expected NO_ROUTE_FOUND, got a ${result.waypoints.length}-point route) [${ms}ms]`);
        failures++;
      } else {
        console.log(`PASS — correctly returned ${result.code} [${ms}ms]`);
      }
      continue;
    }

    // expect: 'route'
    if (!result.ok) {
      console.log(`FAIL (expected a route, got ${result.code}: ${result.message}) [${ms}ms]`);
      failures++;
      continue;
    }

    const crossings = findLandCrossings(result.waypoints);
    const startKm = haversineKm(c.from[0], c.from[1], result.waypoints[0][0], result.waypoints[0][1]);
    const endKm = haversineKm(c.to[0], c.to[1], result.waypoints.at(-1)[0], result.waypoints.at(-1)[1]);

    let ok = true;
    const problems = [];
    if (crossings.length > 0) { ok = false; problems.push(`${crossings.length} land crossing(s), first at ${crossings[0]}`); }
    if (startKm > ENDPOINT_TOLERANCE_KM) { ok = false; problems.push(`start ${startKm.toFixed(2)}km from requested pin`); }
    if (endKm > ENDPOINT_TOLERANCE_KM) { ok = false; problems.push(`end ${endKm.toFixed(2)}km from requested pin`); }

    if (ok) {
      console.log(`PASS — ${result.waypoints.length} waypoints, ${result.distanceNm}nm, 0 land crossings [${ms}ms]`);
    } else {
      console.log(`FAIL — ${problems.join('; ')} [${ms}ms]`);
      failures++;
    }
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
