import React, { useState, useEffect, useRef, useCallback } from 'react'
import Map, { Marker, Popup, Source, Layer } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { io as socketIO } from 'socket.io-client'
import { IOSDevice, IOSStatusBar } from './ios-frame'
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle } from './tweaks-panel'

// SafeSeas — Boater go/no-go app
// Three screens: Home, Trip Detail, Boat Profile
// Dark marine theme, outdoor-readable, large touch targets

// ─────────────────────────────────────────────────────────────
// Theme & tokens
// ─────────────────────────────────────────────────────────────
const ACCENT_OPTIONS = {
  cyan:   '#22E3D0',
  teal:   '#2DD4BF',
  sky:    '#38BDF8',
  amber:  '#F5B547',
};

const STATUS = {
  go:    { bg: '#0F3D2E', fg: '#34E0A0', border: '#1F6B4D', label: 'SAFE TO GO' },
  wait:  { bg: '#3F2E0A', fg: '#F5B547', border: '#7A5A18', label: 'WAIT' },
  nogo:  { bg: '#3F1418', fg: '#FF6B6B', border: '#7A2530', label: 'NO-GO' },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#22E3D0",
  "verdict": "go",
  "pulseVerdict": true
}/*EDITMODE-END*/;

const API = 'http://localhost:4000';

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────

const VERDICT_COPY = {
  go:   { line: 'Winds and waves are within your boats comfort range.', best: 'Leave anytime  conditions hold through 6 PM.' },
  wait: { line: 'Waves are too rough for a 22-ft bowrider this morning.',     best: 'Leave at 4:15 PM for the smoothest ride.' },
  nogo: { line: 'Small craft advisory in effect through tonight.',            best: 'Skip today  Sunday looks clean.' },
};

// ─────────────────────────────────────────────────────────────
// Icon set
// ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 22, color = 'currentColor', sw = 1.8 }) => {
  const p = { fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    search:   <><circle cx="11" cy="11" r="7" {...p}/><path d="M16.5 16.5 21 21" {...p}/></>,
    arrow:    <><path d="M5 12h14M13 6l6 6-6 6" {...p}/></>,
    chevron:  <><path d="M9 6l6 6-6 6" {...p}/></>,
    home:     <><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" {...p}/></>,
    boat:     <><path d="M3 17c2 1 4 1 6 0s4-1 6 0 4 1 6 0M4 14l1.5-4.5A2 2 0 0 1 7.4 8h9.2a2 2 0 0 1 1.9 1.5L20 14M9 8V5h6v3M12 5v3" {...p}/></>,
    map:      <><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v16M15 6v16" {...p}/></>,
    wind:     <><path d="M3 8h11a3 3 0 1 0-3-3M3 12h17a3 3 0 1 1-3 3M3 16h9a3 3 0 1 0-3 3" {...p}/></>,
    wave:     <><path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" {...p}/></>,
    eye:      <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" {...p}/><circle cx="12" cy="12" r="3" {...p}/></>,
    clock:    <><circle cx="12" cy="12" r="9" {...p}/><path d="M12 7v5l3 2" {...p}/></>,
    bookmark: <><path d="M6 4h12v17l-6-4-6 4z" {...p}/></>,
    pin:      <><path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z" {...p}/><circle cx="12" cy="10" r="2.5" {...p}/></>,
    check:    <><path d="m5 12 4 4L20 6" {...p}/></>,
    plus:     <><path d="M12 5v14M5 12h14" {...p}/></>,
    compass:  <><circle cx="12" cy="12" r="9" {...p}/><path d="m15 9-4 2-2 4 4-2z" {...p}/></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" {...p}/></>,
    trash:    <><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M9 6V4h6v2" {...p}/></>,
    settings: <><circle cx="12" cy="12" r="3" {...p}/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...p}/></>,
    anchor:   <><circle cx="12" cy="5" r="3" {...p}/><path d="M12 8v13M5 12a7 7 0 0 0 14 0M5 12H2M22 12h-3" {...p}/></>,
    chat:     <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...p}/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{paths[name]}</svg>;
};

// ─────────────────────────────────────────────────────────────
// Reusable UI primitives
// ─────────────────────────────────────────────────────────────
function StatusPill({ status, size = 'sm' }) {
  const s = STATUS[status];
  const pad = size === 'lg' ? '8px 14px' : '4px 9px';
  const fs  = size === 'lg' ? 13 : 10.5;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 999,
      background: s.bg, color: s.fg,
      border: `1px solid ${s.border}`,
      fontSize: fs, fontWeight: 700, letterSpacing: '0.08em',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: s.fg, boxShadow: `0 0 8px ${s.fg}` }}/>
      {s.label}
    </span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--c-surface)',
      border: '1px solid var(--c-border)',
      borderRadius: 18,
      padding: 18,
      ...style,
    }}>{children}</div>
  );
}

function ConditionTile({ icon, label, value, unit, sub, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 16px',
      background: 'var(--c-surface-alt)', borderRadius: 14, border: '1px solid var(--c-border-soft)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--c-text-3)' }}>
        <Icon name={icon} size={14} sw={2}/>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: 12, color: 'var(--c-text-3)', fontWeight: 600 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Boat artwork
// ─────────────────────────────────────────────────────────────
function BoatArt({ type, color = 'var(--c-text)', size = 80 }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const f = { fill: color, opacity: 0.08 };
  const arts = {
    'Center console': (
      <svg width={size*1.4} height={size} viewBox="0 0 110 80">
        <path d="M10 56 Q14 64 24 64 L86 64 Q96 64 100 56 L96 52 L14 52 Z" {...f}/>
        <path d="M10 56 Q14 64 24 64 L86 64 Q96 64 100 56" {...p}/>
        <path d="M14 52 L96 52" {...p}/>
        <rect x="44" y="34" width="22" height="18" rx="2" {...p}/>
        <path d="M55 34 V20" {...p}/>
        <path d="M51 24 H59" {...p}/>
        <path d="M22 52 V42 M88 52 V42" {...p}/>
      </svg>
    ),
    'Bowrider': (
      <svg width={size*1.4} height={size} viewBox="0 0 110 80">
        <path d="M8 58 Q10 66 22 66 L88 66 L102 50 L96 50 L12 50 Z" {...f}/>
        <path d="M8 58 Q10 66 22 66 L88 66 L102 50" {...p}/>
        <path d="M12 50 L96 50" {...p}/>
        <path d="M30 50 V40 H72 V50" {...p}/>
        <path d="M40 50 V44 M52 50 V44 M64 50 V44" {...p}/>
        <path d="M76 50 L80 42 L96 42 L96 50" {...p}/>
      </svg>
    ),
    'Pontoon': (
      <svg width={size*1.4} height={size} viewBox="0 0 110 80">
        <rect x="8" y="54" width="94" height="6" rx="3" {...p}/>
        <rect x="8" y="64" width="94" height="6" rx="3" {...p}/>
        <rect x="14" y="36" width="82" height="18" rx="2" {...p}/>
        <path d="M14 36 H96" {...p}/>
        <path d="M30 36 V24 H70 V36" {...p}/>
        <path d="M22 50 H30 M40 50 H50 M60 50 H70 M80 50 H88" {...p}/>
      </svg>
    ),
    'Sailboat': (
      <svg width={size*1.4} height={size} viewBox="0 0 110 80">
        <path d="M16 58 Q20 68 32 68 L82 68 Q94 68 98 58 L90 54 L24 54 Z" {...f}/>
        <path d="M16 58 Q20 68 32 68 L82 68 Q94 68 98 58" {...p}/>
        <path d="M24 54 L90 54" {...p}/>
        <path d="M55 54 V8" {...p}/>
        <path d="M55 12 L80 50 L55 50 Z" {...p}/>
        <path d="M55 16 L36 50 L55 50" {...p}/>
      </svg>
    ),
    'Jon boat': (
      <svg width={size*1.4} height={size} viewBox="0 0 110 80">
        <path d="M16 50 L94 50 L88 64 L22 64 Z" {...f}/>
        <path d="M16 50 L94 50 L88 64 L22 64 Z" {...p}/>
        <path d="M36 50 V44 H74 V50" {...p}/>
        <path d="M40 64 V58 M70 64 V58" {...p}/>
        <path d="M82 50 L84 38" {...p}/>
        <circle cx="84" cy="36" r="2" {...p}/>
      </svg>
    ),
    'Jet boat': (
      <svg width={size*1.4} height={size} viewBox="0 0 110 80">
        <path d="M8 54 Q12 64 24 64 L96 64 L104 50 L96 48 L14 48 Z" {...f}/>
        <path d="M8 54 Q12 64 24 64 L96 64 L104 50" {...p}/>
        <path d="M14 48 L96 48" {...p}/>
        <path d="M28 48 L34 36 L78 36 L86 48" {...p}/>
        <path d="M48 36 V48 M62 36 V48" {...p}/>
        <path d="M88 56 L100 58" {...p}/>
      </svg>
    ),
    'Skiff': (
      <svg width={size*1.4} height={size} viewBox="0 0 110 80">
        <path d="M8 54 Q12 66 26 66 L90 66 L100 52 L94 52 L14 52 Z" {...f}/>
        <path d="M8 54 Q12 66 26 66 L90 66 L100 52" {...p}/>
        <path d="M14 52 L94 52" {...p}/>
        <path d="M36 52 V44 H68 V52" {...p}/>
        <path d="M78 52 L82 38 L94 38 L96 52" {...p}/>
      </svg>
    ),
  };
  return arts[type] || arts['Center console'];
}

// ─────────────────────────────────────────────────────────────
// LIVE MAP — MapLibre GL + ESRI Satellite + 3D Terrain + AIS
// ─────────────────────────────────────────────────────────────
const AISSTREAM_KEY = import.meta.env.VITE_AISSTREAM_KEY || '';

function _vesselColor(typeCode) {
  if (typeCode >= 60 && typeCode <= 69) return '#4ADE80';
  if (typeCode >= 70 && typeCode <= 79) return '#38BDF8';
  if (typeCode >= 80 && typeCode <= 89) return '#F87171';
  if (typeCode === 30)                  return '#FB923C';
  if (typeCode === 36 || typeCode === 37) return '#818CF8';
  return '#94A3B8';
}

const MAP_STYLE = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, DigitalGlobe',
      maxzoom: 19,
    },
    openseamap: {
      type: 'raster',
      tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenSeaMap',
      maxzoom: 18,
    },
    terrarium: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
    },
  },
  layers: [
    { id: 'esri-tiles', type: 'raster', source: 'esri' },
    { id: 'openseamap-tiles', type: 'raster', source: 'openseamap', paint: { 'raster-opacity': 0.85 } },
  ],
  terrain: { source: 'terrarium', exaggeration: 1.5 },
};

// ── Navigation helpers ────────────────────────────────────────────────────────
function _haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function _routeRemainingNm(waypoints, uLat, uLon) {
  if (!waypoints || waypoints.length < 2) return null;
  let minD = Infinity, mi = 0;
  waypoints.forEach(([wLat, wLon], i) => { const d = _haversineNm(uLat, uLon, wLat, wLon); if (d < minD) { minD = d; mi = i; } });
  let total = _haversineNm(uLat, uLon, waypoints[mi][0], waypoints[mi][1]);
  for (let i = mi; i < waypoints.length - 1; i++) total += _haversineNm(waypoints[i][0], waypoints[i][1], waypoints[i+1][0], waypoints[i+1][1]);
  return total;
}

function _etaStr(distNm, speedKts) {
  if (!speedKts || speedKts < 0.5) return null;
  const arrival = new Date(Date.now() + (distNm / speedKts) * 3600000);
  return arrival.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function _compassDir(deg) {
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((deg%360)+360)%360/22.5)%16];
}

function _navZoom(kts) {
  if (kts < 2) return 15; if (kts < 6) return 13.5; if (kts < 12) return 12.5; return 11.5;
}

function _routeDistNm(waypoints) {
  if (!waypoints || waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++)
    total += _haversineNm(waypoints[i][0], waypoints[i][1], waypoints[i+1][0], waypoints[i+1][1]);
  return total;
}

function _circleGeoJSON(lat, lon, radiusNm, steps = 72) {
  const rLat = radiusNm / 60;
  const rLon = rLat / Math.cos(lat * Math.PI / 180);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    pts.push([lon + rLon * Math.sin(a), lat + rLat * Math.cos(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] } };
}

async function _fetchNearbyPlaces(lat, lon, radiusM = 30000) {
  const ar = `around:${radiusM},${lat},${lon}`;
  const ar15 = `around:15000,${lat},${lon}`;
  const query = `[out:json][timeout:20];(`+
    `node["seamark:type"="fuel_station"](${ar});`+
    `node["amenity"="fuel"]["boat"="yes"](${ar});`+
    `node["fuel"="yes"]["leisure"="marina"](${ar});`+
    `node["fuel:marine"="yes"](${ar});`+
    `node["leisure"="slipway"](${ar});way["leisure"="slipway"](${ar});`+
    `node["leisure"="marina"](${ar});way["leisure"="marina"](${ar});`+
    `node["amenity"="harbour"](${ar});way["amenity"="harbour"](${ar});`+
    `node["seamark:type"~"^(rock|wreck|obstruction|shoal)$"](${ar15});`+
    `node["natural"="reef"](${ar15});`+
    `way["bridge"="yes"]["maxheight"](${ar});`+
    `way["man_made"="bridge"]["maxheight"](${ar});`+
  `);out center;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method:'POST', body:`data=${encodeURIComponent(query)}`,
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      signal: AbortSignal.timeout(22000),
    });
    if (!res.ok) return { fuel:[], ramps:[], hazards:[], bridges:[] };
    const data = await res.json();
    const fuel=[], ramps=[], hazards=[], bridges=[];
    for (const el of data.elements||[]) {
      const lat2 = el.lat??el.center?.lat, lon2 = el.lon??el.center?.lon;
      if (lat2==null) continue;
      const name = el.tags?.name||el.tags?.['name:en']||null;
      const dist = _haversineNm(lat,lon,lat2,lon2);
      const t = el.tags||{};
      if (t.seamark_type==='fuel_station'||t['seamark:type']==='fuel_station'||t.amenity==='fuel'||t.fuel==='yes'||t['fuel:marine']==='yes') {
        fuel.push({ name:name||'Fuel Dock', lat:lat2, lon:lon2, dist });
      } else if (t.leisure==='slipway') {
        ramps.push({ name:name||'Boat Ramp', lat:lat2, lon:lon2, dist, isRamp:true });
      } else if (t.leisure==='marina'||t.amenity==='harbour') {
        ramps.push({ name:name||'Marina', lat:lat2, lon:lon2, dist, isRamp:false });
      } else if (['rock','wreck','obstruction','shoal'].includes(t['seamark:type'])||t.natural==='reef') {
        hazards.push({ name:name||t['seamark:type']||'Hazard', lat:lat2, lon:lon2, dist, type:t['seamark:type']||'hazard' });
      } else if (t.bridge==='yes'||t.man_made==='bridge') {
        const clr = t.maxheight||t['seamark:bridge_clearance:water_level']||null;
        if (clr) bridges.push({ name:name||'Bridge', lat:lat2, lon:lon2, dist, clearance:clr });
      }
    }
    const byDist = (a,b)=>a.dist-b.dist;
    return {
      fuel:fuel.sort(byDist).slice(0,6),
      ramps:ramps.sort(byDist).slice(0,6),
      hazards:hazards.sort(byDist).slice(0,8),
      bridges:bridges.sort(byDist).slice(0,5),
    };
  } catch { return { fuel:[], ramps:[], hazards:[], bridges:[] }; }
}

async function _fetchAlerts(lat, lon) {
  try {
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: { 'User-Agent':'SafeSeas/1.0', Accept:'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features||[]).map(f=>({
      id: f.id||Math.random().toString(36).slice(2),
      event: f.properties.event||'Alert',
      severity: f.properties.severity||'Unknown',
      headline: f.properties.headline||f.properties.event||'Weather alert',
      expires: f.properties.expires,
    })).slice(0,4);
  } catch { return []; }
}

async function _fetchSeamarks(minLat, minLon, maxLat, maxLon, signal) {
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  const query = `[out:json][timeout:15];(`+
    `node["seamark:type"="buoy_lateral"](${bbox});`+
    `node["seamark:type"="rock"](${bbox});`+
    `node["seamark:type"="wreck"](${bbox});`+
    `node["seamark:type"="obstruction"](${bbox});`+
    `node["seamark:type"="shoal"](${bbox});`+
    `node["natural"="reef"](${bbox});`+
    `way["man_made"="bridge"]["maxheight"](${bbox});`+
    `way["bridge"="yes"]["maxheight"](${bbox});`+
  `);out center;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  });
  if (!res.ok) return { buoys: [], hazards: [], bridges: [] };
  const data = await res.json();
  const buoys = [], hazards = [], bridges = [];
  for (const el of data.elements || []) {
    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (elLat == null) continue;
    const t = el.tags?.['seamark:type'];
    if (el.tags?.man_made === 'bridge' || el.tags?.bridge === 'yes') {
      const clr = el.tags?.maxheight || el.tags?.['seamark:bridge_clearance:water_level'] || null;
      if (clr) bridges.push({ lat: elLat, lon: elLon, clearance: clr, name: el.tags?.name || 'Bridge' });
    } else if (t === 'buoy_lateral') {
      const ref = el.tags?.['seamark:buoy_lateral:ref'] || el.tags?.ref || '';
      const colour = el.tags?.['seamark:buoy_lateral:colour'] || '';
      buoys.push({ lat: elLat, lon: elLon, ref, isRed: colour.includes('red'), isGreen: colour.includes('green') });
    } else {
      hazards.push({ lat: elLat, lon: elLon, type: t || el.tags?.natural || 'hazard', name: el.tags?.name || el.tags?.['seamark:name'] || t || 'Hazard' });
    }
  }
  return { buoys, hazards, bridges };
}

// ─────────────────────────────────────────────────────────────────────────────

function LiveMap({ route, accent, routingActive, onPinSet, bottomInset = 0, boat, fuelLevel, onReportHazard }) {
  const mapRef = useRef(null);
  const [userPos, setUserPos] = useState(null); // { lat, lng, acc, heading, speedKts }
  const [tracking, setTracking] = useState(false);
  const [follow, setFollow] = useState(false);
  const [navMode, setNavMode] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [vessels, setVessels] = useState({});
  const [gpsError, setGpsError] = useState(null);
  const [aisConnected, setAisConnected] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [mapClick, setMapClick] = useState(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [seamarks, setSeamarks] = useState({ buoys: [], hazards: [], bridges: [] });
  const watchRef = useRef(null);
  const wsRef = useRef(null);
  const headingHistory = useRef([]);

  const handlePinChoice = async (type) => {
    if (!mapClick || !onPinSet) return;
    const { lat, lon } = mapClick;
    setMapClick(null);
    setPinBusy(true);
    let name = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
    try {
      const res = await fetch(`${API}/api/reverse-geocode?lat=${lat}&lon=${lon}`);
      if (res.ok) { const d = await res.json(); if (d.name) name = d.name; }
    } catch {}
    setPinBusy(false);
    onPinSet(type, lat, lon, name);
  };

  const DEFAULT_LNG = -82.7196;
  const DEFAULT_LAT = 27.4976;

  const fromCoords = route?.fromLat ? [parseFloat(route.fromLat), parseFloat(route.fromLon)] : null;
  const toCoords   = route?.toLat   ? [parseFloat(route.toLat),   parseFloat(route.toLon)]   : null;
  const depCoords = route?.fromSnapped ? [route.fromSnapped.lat, route.fromSnapped.lon] : fromCoords;
  const arrCoords = route?.toSnapped   ? [route.toSnapped.lat,   route.toSnapped.lon]   : toCoords;

  const initLat = depCoords ? depCoords[0] : DEFAULT_LAT;
  const initLng = depCoords ? depCoords[1] : DEFAULT_LNG;

  // Fly to departure when route loads
  useEffect(() => {
    if (!mapRef.current || !depCoords) return;
    mapRef.current.flyTo({ center: [depCoords[1], depCoords[0]], duration: 1200 });
  }, [depCoords?.[0], depCoords?.[1]]);

  // Camera: navigation mode (heading-up, lower-third) or plain follow
  useEffect(() => {
    if (!userPos || !mapRef.current) return;
    if (navMode) {
      mapRef.current.easeTo({
        center: [userPos.lng, userPos.lat],
        bearing: userPos.heading ?? 0,
        pitch: 65,
        zoom: _navZoom(userPos.speedKts ?? 0),
        duration: 600,
        padding: { top: 60, bottom: bottomInset + 160, left: 20, right: 20 },
      });
    } else if (follow) {
      mapRef.current.flyTo({ center: [userPos.lng, userPos.lat], duration: 800 });
    }
  }, [
    navMode, follow,
    Math.round((userPos?.lat ?? 0) * 10000),
    Math.round((userPos?.lng ?? 0) * 10000),
    Math.round((userPos?.heading ?? 0) * 5),
    Math.round((userPos?.speedKts ?? 0) * 5),
  ]);

  // Reset nav state when route changes
  useEffect(() => { setNavMode(false); setArrived(false); }, [route?.to]);

  // Fetch buoys + hazards along the route
  useEffect(() => {
    const wpts = route?.waypoints;
    if (!wpts || wpts.length < 2) { setSeamarks({ buoys: [], hazards: [], bridges: [] }); return; }
    const ctrl = new AbortController();
    const margin = 0.04;
    const lats = wpts.map(([la]) => la), lons = wpts.map(([, lo]) => lo);
    _fetchSeamarks(
      Math.min(...lats) - margin, Math.min(...lons) - margin,
      Math.max(...lats) + margin, Math.max(...lons) + margin,
      ctrl.signal,
    ).then(setSeamarks).catch(() => {});
    return () => ctrl.abort();
  }, [JSON.stringify(route?.waypoints)]);

  // Arrival detection
  useEffect(() => {
    if (!navMode || !userPos || !arrCoords) return;
    if (_haversineNm(userPos.lat, userPos.lng, arrCoords[0], arrCoords[1]) < 0.054) setArrived(true);
  }, [navMode, Math.round((userPos?.lat ?? 0) * 10000), Math.round((userPos?.lng ?? 0) * 10000)]);

  const startGPS = () => {
    if (!navigator.geolocation) { setGpsError('GPS not supported by this browser'); return; }
    setGpsError(null);
    headingHistory.current = [];
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const raw = pos.coords.heading;
        let heading = null;
        if (raw != null && !isNaN(raw)) {
          headingHistory.current.push(raw);
          if (headingHistory.current.length > 6) headingHistory.current.shift();
          const rads = headingHistory.current.map(a => a * Math.PI / 180);
          const sx = rads.reduce((s, a) => s + Math.cos(a), 0);
          const sy = rads.reduce((s, a) => s + Math.sin(a), 0);
          heading = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
        }
        const speedKts = pos.coords.speed != null ? pos.coords.speed * 1.944 : null;
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, heading, speedKts });
      },
      () => setGpsError('Location access denied — check browser permissions'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
    );
    setTracking(true);
    setFollow(true);
  };

  const stopGPS = () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    headingHistory.current = [];
    setTracking(false);
    setFollow(false);
    setNavMode(false);
    setArrived(false);
    setUserPos(null);
  };

  const aisCenter = userPos
    ? { lat: userPos.lat, lng: userPos.lng }
    : (depCoords ? { lat: depCoords[0], lng: depCoords[1] } : null);

  useEffect(() => {
    if (!aisCenter || !AISSTREAM_KEY) return;
    const { lat, lng } = aisCenter;
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    wsRef.current = ws;
    ws.onopen = () => {
      setAisConnected(true);
      ws.send(JSON.stringify({
        APIKey: AISSTREAM_KEY,
        BoundingBoxes: [[[lat - 0.25, lng - 0.25], [lat + 0.25, lng + 0.25]]],
        FilterMessageTypes: ['PositionReport'],
      }));
    };
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.MessageType !== 'PositionReport') return;
        const p    = msg.Message?.PositionReport;
        const meta = msg.MetaData;
        if (!p || Math.abs(p.Latitude) < 0.001 || Math.abs(p.Longitude) < 0.001) return;
        setVessels(prev => ({
          ...prev,
          [p.UserID]: {
            mmsi:     p.UserID,
            name:     (meta?.ShipName || `Vessel ${p.UserID}`).trim(),
            lat:      p.Latitude,
            lng:      p.Longitude,
            cog:      p.CourseOverGround,
            sog:      p.SpeedOverGround,
            shipType: meta?.ShipType || 0,
          },
        }));
      } catch {}
    };
    ws.onclose = () => setAisConnected(false);
    return () => { ws.close(); setAisConnected(false); };
  }, [
    aisCenter ? Math.round(aisCenter.lat * 10) : null,
    aisCenter ? Math.round(aisCenter.lng * 10) : null,
  ]);

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    wsRef.current?.close();
  }, []);

  const vesselList = Object.values(vessels);

  // GeoJSON route line (MapLibre uses [lon, lat])
  const routeCoords = route?.waypoints?.length >= 2
    ? route.waypoints.map(([lat, lon]) => [lon, lat])
    : (depCoords && arrCoords ? [[depCoords[1], depCoords[0]], [arrCoords[1], arrCoords[0]]] : null);

  // Fuel range circle
  const fuelRangeNm = (boat?.fuelBurn > 0 && boat?.cruiseSpeed > 0 && fuelLevel > 0)
    ? (fuelLevel / boat.fuelBurn) * boat.cruiseSpeed
    : null;
  const rangeCircle = fuelRangeNm && depCoords
    ? _circleGeoJSON(depCoords[0], depCoords[1], fuelRangeNm)
    : null;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Map
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={{ longitude: initLng, latitude: initLat, zoom: 12, pitch: 60, bearing: 0 }}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        onClick={onPinSet ? (e) => {
          setSelectedVessel(null);
          setMapClick({ lat: e.lngLat.lat, lon: e.lngLat.lng, x: e.point.x, y: e.point.y });
        } : undefined}
      >
        {/* Fuel range circle */}
        {rangeCircle && (
          <Source id="range" type="geojson" data={rangeCircle}>
            <Layer id="range-fill" type="fill" paint={{ 'fill-color': accent, 'fill-opacity': 0.06 }}/>
            <Layer id="range-line" type="line" paint={{ 'line-color': accent, 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [4, 3] }}/>
          </Source>
        )}

        {/* Route line — glow + dashed overlay */}
        {routeCoords && (
          <Source id="route" type="geojson" data={{ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords } }}>
            <Layer id="route-glow" type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': accent, 'line-width': 8, 'line-opacity': 0.3, 'line-blur': 5 }}
            />
            <Layer id="route-line" type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': accent, 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [2, 1.5] }}
            />
          </Source>
        )}

        {/* Hazard markers — rocks, wrecks, obstructions, shoals, reefs */}
        {seamarks.hazards.map((h, i) => (
          <Marker key={`haz-${i}`} longitude={h.lon} latitude={h.lat} anchor="center">
            <div title={h.name} style={{
              width: 20, height: 20, borderRadius: 5,
              background: '#DC2626', border: '1.5px solid rgba(255,120,120,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, lineHeight: 1,
              boxShadow: '0 0 0 3px rgba(220,38,38,0.25), 0 2px 6px rgba(0,0,0,0.6)',
              cursor: 'default',
            }}>⚠</div>
          </Marker>
        ))}

        {/* Buoy markers — colored and numbered per IALA */}
        {seamarks.buoys.map((b, i) => {
          const bg = b.isRed ? '#E53E3E' : b.isGreen ? '#22C55E' : '#F6AD55';
          const textColor = b.isRed || !b.isGreen ? 'white' : '#052E16';
          return (
            <Marker key={`buoy-${i}`} longitude={b.lon} latitude={b.lat} anchor="center">
              <div style={{
                minWidth: 20, height: 20, borderRadius: 99,
                paddingLeft: b.ref ? 4 : 0, paddingRight: b.ref ? 4 : 0,
                background: bg, border: '1.5px solid rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, color: textColor,
                boxShadow: '0 1px 5px rgba(0,0,0,0.7)',
                cursor: 'default', whiteSpace: 'nowrap',
              }}>
                {b.ref || ''}
              </div>
            </Marker>
          );
        })}

        {/* Bridge clearance markers */}
        {seamarks.bridges?.map((b, i) => b.lat && (
          <Marker key={`br-${i}`} longitude={b.lon} latitude={b.lat} anchor="center">
            <div title={`${b.name} — ${b.clearance} clearance`} style={{
              background:'#1D4ED8', color:'white', borderRadius:6,
              padding:'2px 5px', fontSize:9, fontWeight:800,
              border:'1.5px solid rgba(147,197,253,0.5)',
              boxShadow:'0 1px 4px rgba(0,0,0,0.6)', cursor:'default',
              whiteSpace:'nowrap',
            }}>{b.clearance}</div>
          </Marker>
        ))}

        {/* Departure dot */}
        {depCoords && (
          <Marker longitude={depCoords[1]} latitude={depCoords[0]} anchor="center">
            <div style={{ width: 10, height: 10, background: 'white', border: `2.5px solid ${accent}`, borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.6)', cursor: 'default' }}/>
          </Marker>
        )}

        {/* Arrival pin */}
        {arrCoords && (
          <Marker longitude={arrCoords[1]} latitude={arrCoords[0]} anchor="bottom">
            <svg width="16" height="22" viewBox="0 0 16 22" style={{ display: 'block', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}>
              <path d="M8 0C3.6 0 0 3.6 0 8c0 5.4 8 14 8 14s8-8.6 8-14c0-4.4-3.6-8-8-8z" fill={accent}/>
              <circle cx="8" cy="8" r="3.5" fill="white"/>
            </svg>
          </Marker>
        )}

        {/* AIS vessel markers */}
        {vesselList.map(v => (
          <Marker key={v.mmsi} longitude={v.lng} latitude={v.lat} anchor="center"
            onClick={e => { e.originalEvent.stopPropagation(); setSelectedVessel(sel => sel?.mmsi === v.mmsi ? null : v); }}
          >
            <svg width="14" height="18" viewBox="0 0 14 18"
              style={{ transform: `rotate(${v.cog || 0}deg)`, display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))', cursor: 'pointer' }}
            >
              <polygon points="7,0 14,18 7,13 0,18" fill={_vesselColor(v.shipType)}/>
            </svg>
          </Marker>
        ))}

        {/* Vessel popup on click */}
        {selectedVessel && (
          <Popup longitude={selectedVessel.lng} latitude={selectedVessel.lat} anchor="top"
            closeButton={true} onClose={() => setSelectedVessel(null)}
          >
            <div style={{ minWidth: 140, fontFamily: 'ui-sans-serif,system-ui,sans-serif', fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{selectedVessel.name}</div>
              <div>Speed: {selectedVessel.sog?.toFixed(1) ?? '—'} kt</div>
              <div>Course: {selectedVessel.cog != null ? Math.round(selectedVessel.cog) : '—'}°</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>MMSI {selectedVessel.mmsi}</div>
            </div>
          </Popup>
        )}

        {/* GPS position */}
        {userPos && (
          <Marker longitude={userPos.lng} latitude={userPos.lat} anchor="center">
            {navMode && userPos.heading != null ? (
              <svg width="26" height="26" viewBox="0 0 26 26"
                style={{ display: 'block', transform: `rotate(${userPos.heading}deg)`, filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.7))' }}>
                <polygon points="13,2 21,24 13,19 5,24" fill="#4F9FFF" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
              </svg>
            ) : (
              <div style={{ width: 16, height: 16, background: '#4F9FFF', border: '3px solid white', borderRadius: '50%', boxShadow: '0 0 0 5px rgba(79,159,255,0.28),0 2px 6px rgba(0,0,0,0.5)' }}/>
            )}
          </Marker>
        )}

        {/* Custom pin drop crosshair */}
        {mapClick && (
          <Marker longitude={mapClick.lon} latitude={mapClick.lat} anchor="center">
            <svg width="28" height="28" viewBox="0 0 28 28" style={{ display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
              <circle cx="14" cy="14" r="5" fill="white" fillOpacity="0.95"/>
              <circle cx="14" cy="14" r="5" fill="none" stroke={accent} strokeWidth="2.5"/>
              <line x1="14" y1="1" x2="14" y2="8" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
              <line x1="14" y1="20" x2="14" y2="27" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
              <line x1="1" y1="14" x2="8" y2="14" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
              <line x1="20" y1="14" x2="27" y2="14" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </Marker>
        )}
      </Map>

      {/* Map pin context menu */}
      {mapClick && (
        <div style={{
          position: 'absolute',
          left: `clamp(8px, ${mapClick.x - 88}px, calc(100% - 184px))`,
          top: mapClick.y > 150 ? mapClick.y - 118 : mapClick.y + 18,
          zIndex: 2000,
          background: 'rgba(10,20,32,0.97)', border: '1px solid var(--c-border)',
          borderRadius: 14, padding: 6, backdropFilter: 'blur(14px)',
          display: 'flex', flexDirection: 'column', gap: 3,
          boxShadow: '0 8px 28px rgba(0,0,0,0.65)',
          minWidth: 172,
        }}>
          {[
            { type: 'from', label: 'Set as Departure', icon: '⊙' },
            { type: 'to',   label: 'Set as Arrival',   icon: '⊕' },
          ].map(({ type, label, icon }) => (
            <button key={type} onClick={() => handlePinChoice(type)} style={{
              all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10,
              color: 'var(--c-text)', fontSize: 13.5, fontWeight: 600,
              transition: 'background 0.12s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-alt)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 16, color: accent, lineHeight: 1 }}>{icon}</span>
              {label}
            </button>
          ))}
          {onReportHazard && (
            <button onClick={() => { onReportHazard(mapClick.lat, mapClick.lon); setMapClick(null); }} style={{
              all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10,
              background: 'transparent',
              color: '#FF8080', fontSize: 13.5, fontWeight: 600,
              transition: 'background 0.12s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(122,31,31,0.35)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>⚠</span>
              Report Hazard Here
            </button>
          )}
          <div style={{ height: 1, background: 'var(--c-border)', margin: '2px 4px' }}/>
          <button onClick={() => setMapClick(null)} style={{
            all: 'unset', cursor: 'pointer', padding: '7px 12px', borderRadius: 10,
            color: 'var(--c-text-4)', fontSize: 12.5, fontWeight: 600,
            transition: 'background 0.12s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-alt)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Pin resolving indicator */}
      {pinBusy && (
        <div style={{
          position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 2000,
          padding: '5px 14px', borderRadius: 99,
          background: 'rgba(10,20,32,0.92)', border: '1px solid var(--c-border)',
          backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: accent, animation: 'pulse 1.2s infinite' }}/>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-text-2)' }}>Setting pin…</span>
        </div>
      )}

      {/* Navigate button — shown when GPS active + route destination set */}
      {tracking && arrCoords && !navMode && (
        <button onClick={() => { setNavMode(true); setArrived(false); setFollow(true); }} style={{
          position: 'absolute', bottom: bottomInset + 104, right: 14, zIndex: 1000,
          padding: '0 14px', height: 36, borderRadius: 10,
          background: accent, color: '#06151E',
          fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em',
          border: 'none', cursor: 'pointer',
          boxShadow: `0 0 0 3px ${accent}44, 0 4px 14px rgba(0,0,0,0.5)`,
        }}>
          Navigate
        </button>
      )}

      {/* Navigation HUD */}
      {navMode && (() => {
        const distNm = userPos && arrCoords
          ? (route?.waypoints?.length >= 2
              ? _routeRemainingNm(route.waypoints, userPos.lat, userPos.lng)
              : _haversineNm(userPos.lat, userPos.lng, arrCoords[0], arrCoords[1]))
          : null;
        const etaVal = distNm != null ? _etaStr(distNm, userPos?.speedKts) : null;

        return (
          <div style={{
            position: 'absolute', bottom: bottomInset + 66, left: 12, right: 12, zIndex: 1000,
            background: 'rgba(8,17,28,0.97)', border: '1px solid var(--c-border)',
            borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 -4px 30px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(16px)',
          }}>
            {/* Destination bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="pin" size={13} color={accent} sw={2.2}/>
                <span style={{ fontSize: 12.5, color: 'var(--c-text)', fontWeight: 700, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {route?.to || 'Destination'}
                </span>
              </div>
              <button onClick={() => setNavMode(false)} style={{
                all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                color: 'var(--c-text-4)', background: 'var(--c-surface-alt)',
                padding: '3px 10px', borderRadius: 6,
              }}>End</button>
            </div>

            {/* Metrics row */}
            <div style={{ display: 'flex', padding: '8px 10px 12px', gap: 2 }}>
              {[
                { label: 'Speed', val: userPos?.speedKts != null ? `${userPos.speedKts.toFixed(1)}` : '—', unit: 'kt' },
                { label: 'Heading', val: userPos?.heading != null ? _compassDir(userPos.heading) : '—', unit: userPos?.heading != null ? `${Math.round(userPos.heading)}°` : '' },
                { label: 'Distance', val: distNm != null ? distNm.toFixed(1) : '—', unit: 'nm' },
                { label: 'ETA', val: etaVal || (userPos?.speedKts != null && userPos.speedKts < 0.5 ? 'Stopped' : '—'), unit: '' },
              ].map(({ label, val, unit }) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 10, color: 'var(--c-text-4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 17, color: 'var(--c-text)', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                  {unit && <div style={{ fontSize: 10, color: 'var(--c-text-3)', marginTop: 2 }}>{unit}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Arrival overlay */}
      {arrived && navMode && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1100,
          background: 'rgba(8,17,28,0.97)', border: `1.5px solid ${accent}`,
          borderRadius: 22, padding: '28px 32px', textAlign: 'center',
          boxShadow: `0 0 0 6px ${accent}22, 0 12px 40px rgba(0,0,0,0.8)`,
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚓</div>
          <div style={{ fontSize: 20, color: 'var(--c-text)', fontWeight: 800, marginBottom: 6 }}>You've arrived!</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 20 }}>{route?.to || 'Destination'}</div>
          <button onClick={() => { setNavMode(false); setArrived(false); }} style={{
            all: 'unset', cursor: 'pointer', padding: '10px 24px', borderRadius: 12,
            background: accent, color: '#06151E', fontSize: 14, fontWeight: 700,
          }}>Done</button>
        </div>
      )}

      {/* GPS tracking button */}
      <button
        onClick={tracking ? stopGPS : startGPS}
        style={{
          position: 'absolute', bottom: bottomInset + 14, right: 14, zIndex: 1000,
          width: 44, height: 44, borderRadius: 12,
          background: tracking ? '#4F9FFF' : 'rgba(10,20,32,0.9)',
          border: `1.5px solid ${tracking ? '#4F9FFF' : 'var(--c-border)'}`,
          display: 'grid', placeItems: 'center', cursor: 'pointer',
          boxShadow: tracking ? '0 0 0 4px rgba(79,159,255,0.25),0 4px 14px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tracking ? 'white' : 'var(--c-text-3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        </svg>
      </button>

      {/* Follow mode chip — hidden in navMode (navigation always follows) */}
      {tracking && !navMode && (
        <button onClick={() => setFollow(f => !f)} style={{
          position: 'absolute', bottom: bottomInset + 66, right: 14, zIndex: 1000,
          padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
          background: 'rgba(10,20,32,0.9)', border: `1px solid ${follow ? '#4F9FFF' : 'var(--c-border)'}`,
          color: follow ? '#4F9FFF' : 'var(--c-text-3)', fontSize: 11.5, fontWeight: 600,
          backdropFilter: 'blur(10px)',
        }}>
          {follow ? '● Following' : '○ Follow me'}
        </button>
      )}

      {/* Maritime routing indicator */}
      {routingActive && (
        <div style={{
          position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          padding: '5px 12px', borderRadius: 99,
          background: 'rgba(10,20,32,0.92)', border: '1px solid var(--c-border)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: '#38BDF8', boxShadow: '0 0 6px #38BDF8', animation: 'pulse 1.2s infinite' }}/>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#CBD5E1' }}>Finding water route…</span>
        </div>
      )}

      {/* AIS vessel count badge */}
      {aisConnected && vesselList.length > 0 && (
        <div style={{
          position: 'absolute', top: 56, right: 14, zIndex: 1000,
          padding: '5px 10px', borderRadius: 99,
          background: 'rgba(10,20,32,0.9)', border: '1px solid var(--c-border)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: 99, background: '#4ADE80', boxShadow: '0 0 6px #4ADE80' }}/>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-text)' }}>{vesselList.length} vessels nearby</span>
        </div>
      )}

      {/* GPS error */}
      {gpsError && (
        <div style={{
          position: 'absolute', bottom: bottomInset + 148, left: 14, right: 14, zIndex: 1000,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(63,20,24,0.95)', border: '1px solid #7A2530',
          color: '#FF6B6B', fontSize: 13,
        }}>
          {gpsError}
        </div>
      )}

      {/* Map attribution */}
      <div style={{
        position: 'absolute', bottom: 8, left: 8, zIndex: 1000,
        fontSize: 9, color: 'rgba(255,255,255,0.5)',
      }}>
        © Esri · OpenSeaMap
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Marine map (legacy SVG — kept for reference)
// ─────────────────────────────────────────────────────────────
function MarineMap({ accent, route, routeProgress = 1 }) {
  const { from = 'Start', to = 'Destination' } = route || {};
  return (
    <svg viewBox="0 0 390 600" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <pattern id="depthLines" patternUnits="userSpaceOnUse" width="60" height="60" patternTransform="rotate(28)">
          <path d="M0 30 H60" stroke="#1A3148" strokeWidth="0.6" fill="none"/>
        </pattern>
        <radialGradient id="waterGrad" cx="50%" cy="40%" r="80%">
          <stop offset="0%"  stopColor="#0B2030"/>
          <stop offset="100%" stopColor="#061520"/>
        </radialGradient>
        <linearGradient id="landGrad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#1D2128"/>
          <stop offset="100%" stopColor="#161A20"/>
        </linearGradient>
        <filter id="routeGlow"><feGaussianBlur stdDeviation="3"/></filter>
      </defs>
      <rect width="390" height="600" fill="url(#waterGrad)"/>
      <rect width="390" height="600" fill="url(#depthLines)" opacity="0.7"/>
      <g fill="none" stroke="#143049" strokeWidth="0.7" opacity="0.7">
        <path d="M-20 380 Q 60 360 130 380 T 280 360 T 420 380"/>
        <path d="M-20 430 Q 60 410 130 430 T 280 410 T 420 430"/>
        <path d="M-20 480 Q 60 460 130 480 T 280 460 T 420 480"/>
      </g>
      <path d="M390 0 L390 600 L300 600 Q 290 540 320 500 Q 340 470 330 430 Q 318 388 348 360 Q 372 332 360 290 Q 350 250 372 220 Q 388 195 380 160 Q 372 120 388 80 Q 396 40 390 0 Z"
        fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      <path d="M70 320 Q 64 360 70 410 Q 76 460 82 510 Q 84 540 78 560 L 88 562 Q 96 540 92 510 Q 86 460 82 410 Q 78 360 84 322 Z"
        fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      <ellipse cx="180" cy="260" rx="18" ry="26" fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      <ellipse cx="140" cy="300" rx="7" ry="4" fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      <ellipse cx="240" cy="180" rx="12" ry="6" fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      <ellipse cx="220" cy="160" rx="5" ry="3" fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      <g fontFamily="ui-monospace, Menlo, monospace" fontSize="9" fill="#3D556F" letterSpacing="0.05em">
        <circle cx="125" cy="365" r="2" fill="#3D556F"/><text x="130" y="368">G "1"</text>
        <circle cx="160" cy="320" r="2" fill="#3D556F"/><text x="165" y="323">R "2"</text>
        <circle cx="195" cy="290" r="2" fill="#3D556F"/><text x="200" y="293">G "3"</text>
      </g>
      <g>
        <path d="M82 420 C 110 400 130 380 150 340 C 165 310 170 290 180 270"
          stroke={accent} strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.4" filter="url(#routeGlow)"/>
        <path d="M82 420 C 110 400 130 380 150 340 C 165 310 170 290 180 270"
          stroke={accent} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeDasharray="800" strokeDashoffset={(1 - routeProgress) * 800}/>
      </g>
      <g transform="translate(82 420)">
        <circle r="11" fill={accent} opacity="0.18"/>
        <circle r="6" fill="var(--c-bg)" stroke={accent} strokeWidth="2.5"/>
      </g>
      <text x="96" y="424" fill="var(--c-text)" fontSize="11" fontWeight="600" fontFamily="ui-sans-serif">{from}</text>
      <text x="96" y="438" fill="var(--c-text-3)" fontSize="9.5" fontFamily="ui-monospace">{from}</text>
      <g transform="translate(180 260)">
        <circle r="13" fill={accent} opacity="0.18"/>
        <circle r="13" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5"/>
        <path d="M0 -16 L4 -8 L-4 -8 Z" fill={accent}/>
        <circle r="4" fill={accent}/>
      </g>
      <text x="200" y="258" fill="var(--c-text)" fontSize="11" fontWeight="600" fontFamily="ui-sans-serif">{to}</text>
      <text x="200" y="272" fill="var(--c-text-3)" fontSize="9.5" fontFamily="ui-monospace">{to}</text>
      <g transform="translate(345 50)" opacity="0.55">
        <circle r="18" fill="none" stroke="var(--c-text-5)" strokeWidth="0.8"/>
        <path d="M0 -14 L3 0 L0 14 L-3 0 Z" fill="var(--c-text-4)"/>
        <path d="M0 -14 L3 0 L0 0 Z" fill="var(--c-text)"/>
        <text y="-22" textAnchor="middle" fontSize="9" fill="var(--c-text-4)" fontFamily="ui-monospace">N</text>
      </g>
      <g transform="translate(24 558)" fontFamily="ui-monospace" fontSize="9" fill="var(--c-text-4)">
        <line x1="0" y1="0" x2="60" y2="0" stroke="var(--c-text-4)" strokeWidth="1"/>
        <line x1="0" y1="-4" x2="0" y2="4" stroke="var(--c-text-4)" strokeWidth="1"/>
        <line x1="60" y1="-4" x2="60" y2="4" stroke="var(--c-text-4)" strokeWidth="1"/>
        <text x="0" y="16">0</text>
        <text x="60" y="16">5 nm</text>
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, accent }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'fp-email' | 'fp-code' | 'fp-pass' | 'fp-done'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot-password state
  const [fpEmail, setFpEmail] = useState('');
  const [fpCode, setFpCode] = useState('');
  const [fpNewPass, setFpNewPass] = useState('');
  const [fpConfirm, setFpConfirm] = useState('');

  const inputStyle = {
    width: 'calc(100% - 32px)',
    background: 'var(--c-surface-alt)',
    border: '1px solid var(--c-border-soft)',
    borderRadius: 14,
    padding: '14px 16px',
    color: 'var(--c-text)',
    fontSize: 16,
    outline: 'none',
    fontFamily: 'inherit',
  };

  const ErrorBox = ({ msg }) => msg ? (
    <div style={{ padding: '10px 14px', borderRadius: 10, background: '#3F1418', border: '1px solid #7A2530', color: '#FF6B6B', fontSize: 13, lineHeight: 1.4 }}>
      {msg}
    </div>
  ) : null;

  const PrimaryBtn = ({ onClick, disabled, children }) => (
    <button onClick={onClick} disabled={disabled || loading} style={{
      all: 'unset', cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      height: 56, borderRadius: 14, marginTop: 4,
      background: (disabled || loading) ? 'var(--c-disabled)' : accent,
      color: (disabled || loading) ? 'var(--c-text-3)' : '#06151E',
      fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em',
      boxShadow: (disabled || loading) ? 'none' : `0 0 0 1px ${accent}, 0 8px 24px ${accent}33`,
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  );

  const BackBtn = ({ onClick }) => (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 13, color: 'var(--c-text-3)', fontWeight: 600, marginBottom: 20,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M11 6l-6 6 6 6"/>
      </svg>
      Back to login
    </button>
  );

  // ── Login / signup submit ──
  const submit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields'); return; }
    if (mode === 'signup' && !name.trim()) { setError('Please enter your name'); return; }
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { email: email.trim(), password }
        : { email: email.trim(), name: name.trim(), password };
      const res = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); }
      else { localStorage.setItem('safeseas_token', data.token); onLogin(data.token, data.user); }
    } catch { setError('Could not connect to server. Is the server running?'); }
    finally { setLoading(false); }
  };

  // ── Step 1: send code ──
  const sendCode = async () => {
    setError('');
    if (!fpEmail.trim()) { setError('Please enter your email'); return; }
    setLoading(true);
    try {
      await fetch(`${API}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fpEmail.trim() }) });
      setMode('fp-code');
    } catch { setError('Could not connect to server. Is the server running?'); }
    finally { setLoading(false); }
  };

  // ── Step 2: verify code ──
  const verifyCode = async () => {
    setError('');
    if (fpCode.length !== 6) { setError('Enter the 6-digit code sent to your email'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/verify-reset-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fpEmail.trim(), code: fpCode }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Incorrect code'); }
      else { setMode('fp-pass'); }
    } catch { setError('Could not connect to server. Is the server running?'); }
    finally { setLoading(false); }
  };

  // ── Step 3: set new password ──
  const resetPassword = async () => {
    setError('');
    if (fpNewPass.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (fpNewPass !== fpConfirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fpEmail.trim(), code: fpCode, newPassword: fpNewPass }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Reset failed'); }
      else { setMode('fp-done'); }
    } catch { setError('Could not connect to server. Is the server running?'); }
    finally { setLoading(false); }
  };

  const resetFp = () => { setFpEmail(''); setFpCode(''); setFpNewPass(''); setFpConfirm(''); setError(''); setMode('login'); };

  // ── Shared branding header ──
  const Branding = () => (
    <div style={{ marginBottom: 28, textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: `${accent}1A`, border: `1.5px solid ${accent}44`, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
        <Icon name="boat" size={32} color={accent} sw={1.6}/>
      </div>
      <div style={{ fontSize: 26, color: 'var(--c-text)', fontWeight: 800, letterSpacing: '-0.03em' }}>Safe Seas</div>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 4, letterSpacing: '0.02em' }}>Your boating go/no-go companion</div>
    </div>
  );

  // ──────────────────────────────────────────────────────────
  // FORGOT PASSWORD — Step 1: enter email
  // ──────────────────────────────────────────────────────────
  if (mode === 'fp-email') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column', padding: '28px 24px', overflowY: 'auto' }}>
        <BackBtn onClick={resetFp}/>
        <Branding/>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 18, color: 'var(--c-text)', fontWeight: 700, marginBottom: 6 }}>Forgot your password?</div>
          <div style={{ fontSize: 13.5, color: 'var(--c-text-3)', lineHeight: 1.6 }}>Enter your account email and we'll send a 6-digit verification code.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="email" value={fpEmail} onChange={e => setFpEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendCode()} placeholder="Email address" autoComplete="email" style={inputStyle}/>
          <ErrorBox msg={error}/>
          <PrimaryBtn onClick={sendCode}>
            {loading ? 'Sending…' : 'Send Code'}
            {!loading && <Icon name="arrow" size={18} color="#06151E" sw={2.2}/>}
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // FORGOT PASSWORD — Step 2: enter 6-digit code
  // ──────────────────────────────────────────────────────────
  if (mode === 'fp-code') {
    const digits = fpCode.split('').concat(Array(6).fill('')).slice(0, 6);
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column', padding: '28px 24px', overflowY: 'auto' }}>
        <BackBtn onClick={() => { setMode('fp-email'); setError(''); setFpCode(''); }}/>
        <Branding/>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 18, color: 'var(--c-text)', fontWeight: 700, marginBottom: 6 }}>Check your email</div>
          <div style={{ fontSize: 13.5, color: 'var(--c-text-3)', lineHeight: 1.6 }}>
            We sent a 6-digit code to <span style={{ color: 'var(--c-text-2)', fontWeight: 600 }}>{fpEmail}</span>. It expires in 15 minutes.
          </div>
        </div>
        {/* 6-digit OTP boxes */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {digits.map((d, i) => (
            <div key={i} style={{
              width: 44, height: 56, borderRadius: 12,
              background: 'var(--c-surface-alt)',
              border: `1.5px solid ${d ? accent : 'var(--c-border-soft)'}`,
              display: 'grid', placeItems: 'center',
              fontSize: 24, fontWeight: 700, color: 'var(--c-text)',
              fontVariantNumeric: 'tabular-nums',
              transition: 'border-color 0.15s',
              boxShadow: d ? `0 0 0 3px ${accent}22` : 'none',
            }}>
              {d || ''}
            </div>
          ))}
        </div>
        {/* Hidden input captures typing and maps to boxes */}
        <input
          value={fpCode}
          onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setFpCode(v); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && verifyCode()}
          inputMode="numeric"
          maxLength={6}
          placeholder="Type your 6-digit code"
          style={{ ...inputStyle, textAlign: 'center', fontSize: 18, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
          autoFocus
        />
        <div style={{ height: 12 }}/>
        <ErrorBox msg={error}/>
        <div style={{ height: error ? 12 : 0 }}/>
        <PrimaryBtn onClick={verifyCode} disabled={fpCode.length !== 6}>
          {loading ? 'Verifying…' : 'Verify Code'}
          {!loading && <Icon name="arrow" size={18} color="#06151E" sw={2.2}/>}
        </PrimaryBtn>
        <button onClick={sendCode} style={{ all: 'unset', cursor: 'pointer', marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--c-text-4)' }}>
          Didn't get it? <span style={{ color: accent, fontWeight: 600 }}>Resend code</span>
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // FORGOT PASSWORD — Step 3: set new password
  // ──────────────────────────────────────────────────────────
  if (mode === 'fp-pass') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column', padding: '28px 24px', overflowY: 'auto' }}>
        <BackBtn onClick={() => { setMode('fp-code'); setError(''); }}/>
        <Branding/>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 18, color: 'var(--c-text)', fontWeight: 700, marginBottom: 6 }}>Set a new password</div>
          <div style={{ fontSize: 13.5, color: 'var(--c-text-3)', lineHeight: 1.6 }}>Choose a strong password for your account.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="password" value={fpNewPass} onChange={e => { setFpNewPass(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && resetPassword()} placeholder="New password" autoComplete="new-password" style={inputStyle}/>
          <input type="password" value={fpConfirm} onChange={e => { setFpConfirm(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && resetPassword()} placeholder="Confirm new password" autoComplete="new-password" style={{
            ...inputStyle,
            borderColor: fpConfirm && fpNewPass !== fpConfirm ? '#7A2530' : fpConfirm && fpNewPass === fpConfirm ? '#1F6B4D' : 'var(--c-border-soft)',
          }}/>
          {fpConfirm && fpNewPass === fpConfirm && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#34E0A0' }}>
              <Icon name="check" size={14} color="#34E0A0" sw={2.5}/> Passwords match
            </div>
          )}
          <ErrorBox msg={error}/>
          <PrimaryBtn onClick={resetPassword}>
            {loading ? 'Saving…' : 'Reset Password'}
            {!loading && <Icon name="check" size={18} color="#06151E" sw={2.5}/>}
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // FORGOT PASSWORD — Done
  // ──────────────────────────────────────────────────────────
  if (mode === 'fp-done') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 24px' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: '#0F3D2E', border: '1.5px solid #1F6B4D', display: 'grid', placeItems: 'center', marginBottom: 20 }}>
          <Icon name="check" size={30} color="#34E0A0" sw={2.2}/>
        </div>
        <div style={{ fontSize: 22, color: 'var(--c-text)', fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Password updated!</div>
        <div style={{ fontSize: 13.5, color: 'var(--c-text-3)', lineHeight: 1.6, textAlign: 'center', marginBottom: 32 }}>
          Your password has been reset. You can now log in with your new password.
        </div>
        <button onClick={resetFp} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          height: 56, width: '100%', borderRadius: 14,
          background: accent, color: '#06151E', fontWeight: 700, fontSize: 16,
          boxShadow: `0 0 0 1px ${accent}, 0 8px 24px ${accent}33`,
        }}>
          Log In
          <Icon name="arrow" size={18} color="#06151E" sw={2.2}/>
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // MAIN LOGIN / SIGNUP form
  // ──────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--c-bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '28px 24px',
      overflowY: 'auto',
    }}>
      <Branding/>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--c-surface-alt)', borderRadius: 14, padding: 4, marginBottom: 24, width: '100%', border: '1px solid var(--c-border)' }}>
        {['login', 'signup'].map(m => (
          <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
            all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
            padding: '10px 0', borderRadius: 10,
            background: mode === m ? 'var(--c-disabled)' : 'transparent',
            color: mode === m ? 'var(--c-text)' : 'var(--c-text-3)',
            fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
            border: mode === m ? '1px solid var(--c-border)' : '1px solid transparent',
          }}>
            {m === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        ))}
      </div>

      {/* Form fields */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'signup' && (
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Your name" autoComplete="name" style={inputStyle}/>
        )}
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Email address" autoComplete="email" style={inputStyle}/>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} style={inputStyle}/>

        {mode === 'login' && (
          <button onClick={() => { setFpEmail(email); setError(''); setMode('fp-email'); }} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: accent, fontWeight: 600, textAlign: 'right' }}>
            Forgot password?
          </button>
        )}

        <ErrorBox msg={error}/>
        <PrimaryBtn onClick={submit}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          {!loading && <Icon name="arrow" size={18} color="#06151E" sw={2.2}/>}
        </PrimaryBtn>
      </div>

      {mode === 'login' && (
        <p style={{ marginTop: 20, fontSize: 12.5, color: 'var(--c-text-4)', textAlign: 'center', lineHeight: 1.5 }}>
          Don't have an account?{' '}
          <button onClick={() => { setMode('signup'); setError(''); }} style={{ all: 'unset', cursor: 'pointer', color: accent, fontWeight: 600 }}>Sign up</button>
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DISCLAIMER SCREEN
// ─────────────────────────────────────────────────────────────
function DisclaimerScreen({ onAccept, accent }) {
  const [checked, setChecked] = useState(false);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--c-bg)',
      display: 'flex', flexDirection: 'column',
      padding: '28px 24px 32px',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18,
          background: '#3F2E0A', border: '1.5px solid #7A5A18',
          display: 'grid', placeItems: 'center', margin: '0 auto 14px',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F5B547" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.14em', color: '#F5B547', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
          Important Notice
        </div>
        <div style={{ fontSize: 22, color: 'var(--c-text)', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Before you set sail
        </div>
      </div>

      {/* Disclaimer card */}
      <div style={{
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 18,
        padding: '20px 18px',
        marginBottom: 20,
        flex: 1,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--c-text-3)', marginBottom: 14,
        }}>
          Liability Disclaimer
        </div>
        <div style={{ fontSize: 14.5, color: 'var(--c-text-2)', lineHeight: 1.65 }}>
          Safe Seas is not liable for any damages or collisions while using our software. You use Safe Seas at your own risk.
        </div>
        <div style={{
          marginTop: 18, paddingTop: 16,
          borderTop: '1px solid var(--c-border)',
          fontSize: 13, color: 'var(--c-text-3)', lineHeight: 1.6,
        }}>
          Safe Seas provides weather and marine condition data for informational purposes only. Always consult official maritime authorities, the U.S. Coast Guard, and your own judgment before departing. Conditions can change rapidly on the water.
        </div>
      </div>

      {/* Checkbox acknowledgement */}
      <button
        onClick={() => setChecked(c => !c)}
        style={{
          all: 'unset', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
          background: checked ? accent : 'var(--c-surface-alt)',
          border: `1.5px solid ${checked ? accent : 'var(--c-text-5)'}`,
          display: 'grid', placeItems: 'center',
          transition: 'all 0.15s',
          boxShadow: checked ? `0 0 0 3px ${accent}22` : 'none',
        }}>
          {checked && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#06151E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 4 4L20 6"/>
            </svg>
          )}
        </div>
        <span style={{ fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
          I have read and understand the disclaimer. I accept all risks associated with using Safe Seas.
        </span>
      </button>

      {/* Accept button */}
      <button
        onClick={() => { if (checked) onAccept(); }}
        disabled={!checked}
        style={{
          all: 'unset',
          cursor: checked ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          height: 56, borderRadius: 14,
          background: checked ? accent : 'var(--c-surface)',
          color: checked ? '#06151E' : '#3A5068',
          border: `1.5px solid ${checked ? accent : 'var(--c-border)'}`,
          fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em',
          boxShadow: checked ? `0 0 0 1px ${accent}, 0 8px 24px ${accent}33` : 'none',
          transition: 'all 0.2s',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 4 4L20 6"/>
        </svg>
        I Understand &amp; Accept
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────
function HomeScreen({ accent, boat, boats = [], onPlan, onTrip, onSelectBoat, currentStatus, trips, route, onUpdateRoute, routeSafety, user, onSettings, profileColor, onPickBoat, onRouteTo, userPos }) {
  const [focus, setFocus] = useState(false);
  const [from, setFrom] = useState(route?.from || 'Anna Maria Island');
  const [to, setTo] = useState(route?.to || 'Egmont Key');
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [fromActiveIndex, setFromActiveIndex] = useState(-1);
  const [toActiveIndex, setToActiveIndex] = useState(-1);
  const fetchTimer = useRef(null);
  const [nearby, setNearby] = useState({ fuel:[], ramps:[], hazards:[], bridges:[] });
  const [alerts, setAlerts] = useState([]);

  // Re-fetch when real GPS position first arrives; throttled to ~1.1km movement to avoid hammering Overpass
  const nearbyFetchKey = userPos
    ? `${Math.round(userPos.lat * 100)},${Math.round(userPos.lng * 100)}`
    : (route?.fromLat || 'default');

  useEffect(() => {
    const lat = userPos?.lat ?? parseFloat(route?.fromLat) ?? 27.4976;
    const lon = userPos?.lng ?? parseFloat(route?.fromLon) ?? -82.7196;
    _fetchNearbyPlaces(lat, lon).then(setNearby).catch(()=>{});
    _fetchAlerts(lat, lon).then(setAlerts).catch(()=>{});
  }, [nearbyFetchKey]);

  const fetchSuggestions = async (q, which) => {
    if (!q || q.length < 2) {
      if (which === 'from') setFromSuggestions([]);
      else setToSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const json = await res.json();
      if (which === 'from') setFromSuggestions(json || []);
      else setToSuggestions(json || []);
    } catch (err) {
      console.warn('Geocode fetch failed', err);
    }
  };

  const fetchSuggestionsDebounced = (q, which) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => fetchSuggestions(q, which), 250);
  };

  const PRESET_LOCATIONS = [
    { display_name: 'Egmont Key, FL', lat: '27.5595', lon: '-82.7432' },
    { display_name: 'Anna Maria Island, FL', lat: '27.4976', lon: '-82.7196' },
    { display_name: 'Longboat Key, FL', lat: '27.3540', lon: '-82.5923' },
    { display_name: 'Sarasota Bay, FL', lat: '27.3364', lon: '-82.5307' },
    { display_name: 'Tampa Bay, FL', lat: '27.9506', lon: '-82.4572' },
  ];

  const applyPreset = (p) => {
    setTo(p.display_name);
    onUpdateRoute && onUpdateRoute({ to: p.display_name, toLat: p.lat, toLon: p.lon });
    setShowToSuggestions(false);
    setToActiveIndex(-1);
  };

  const selectFromSuggestion = (i) => {
    const s = fromSuggestions[i];
    if (!s) return;
    setFrom(s.display_name);
    setShowFromSuggestions(false);
    setFromActiveIndex(-1);
    onUpdateRoute && onUpdateRoute({ from: s.display_name, fromLat: s.lat, fromLon: s.lon });
  };

  const selectToSuggestion = (i) => {
    const s = toSuggestions[i];
    if (!s) return;
    setTo(s.display_name);
    setShowToSuggestions(false);
    setToActiveIndex(-1);
    onUpdateRoute && onUpdateRoute({ to: s.display_name, toLat: s.lat, toLon: s.lon });
  };

  useEffect(() => {
    setFrom(route?.from || 'Anna Maria Island');
    setTo(route?.to || 'Egmont Key');
  }, [route]);

  const firstName = user?.name ? user.name.split(' ')[0] : 'Captain';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--c-text-3)', fontWeight: 600, textTransform: 'uppercase', display:'flex', alignItems:'center', gap:5 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {userPos && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:3, color: accent, fontWeight:700, letterSpacing:'0.06em' }}>
                <span style={{ width:5, height:5, borderRadius:99, background:accent, display:'inline-block', boxShadow:`0 0 6px ${accent}` }}/>
                LIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 22, color: 'var(--c-text)', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>
            {greeting}, {firstName}
          </div>
        </div>
        <button onClick={onSettings} title="Settings" style={{
          all: 'unset', cursor: 'pointer',
          width: 38, height: 38, borderRadius: 99,
          background: profileColor || '#22E3D0',
          display: 'grid', placeItems: 'center',
          boxShadow: `0 0 0 2px ${(profileColor || '#22E3D0')}44`,
        }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#06151E', lineHeight: 1 }}>
            {user?.name ? user.name[0].toUpperCase() : '?'}
          </span>
        </button>
      </div>

      <div>
        <label style={{ fontSize: 12, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.04em' }}>CREATE ROUTE</label>
        <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--c-surface)', borderRadius: 16, padding: '0 16px 0 16px', height: 60, border: `1px solid ${focus ? accent : 'var(--c-border)'}`, boxShadow: focus ? `0 0 0 4px ${accent}22` : 'none', transition: 'all 0.15s ease' }}>
              <Icon name="search" size={20} color={focus ? accent : 'var(--c-text-3)'}/>
              <input
                value={from}
                onChange={e => { setFrom(e.target.value); fetchSuggestionsDebounced(e.target.value, 'from'); }}
                onFocus={() => { setFocus(true); setShowFromSuggestions(true); fetchSuggestionsDebounced(from, 'from'); }}
                onBlur={() => setTimeout(() => { setShowFromSuggestions(false); setFocus(false); setFromActiveIndex(-1); }, 160)}
                onKeyDown={(e) => {
                  if (!fromSuggestions || fromSuggestions.length === 0) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setFromActiveIndex(i => Math.min((fromSuggestions.length - 1), (i < 0 ? 0 : i + 1))); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setFromActiveIndex(i => Math.max(0, (i > 0 ? i - 1 : 0))); }
                  if (e.key === 'Enter') { e.preventDefault(); if (fromActiveIndex >= 0) selectFromSuggestion(fromActiveIndex); }
                }}
                placeholder="From"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', fontFamily: 'inherit' }} />
            </div>
            {showFromSuggestions && fromSuggestions && fromSuggestions.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 68, background: '#0B1620', border: '1px solid var(--c-border)', borderRadius: 10, zIndex: 40, padding: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.6)' }}>
                {fromSuggestions.map((s, i) => (
                  <div key={i} onMouseDown={() => selectFromSuggestion(i)} onMouseEnter={() => setFromActiveIndex(i)}
                    style={{ padding: '8px 10px', cursor: 'pointer', color: fromActiveIndex === i ? '#06151E' : 'var(--c-text-2)', background: fromActiveIndex === i ? 'var(--c-text-2)' : 'transparent', fontSize: 13 }}>{s.display_name}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--c-surface)', borderRadius: 16, padding: '0 16px 0 16px', height: 60, border: `1px solid ${focus ? accent : 'var(--c-border)'}`, boxShadow: focus ? `0 0 0 4px ${accent}22` : 'none', transition: 'all 0.15s ease' }}>
              <Icon name="pin" size={20} color={focus ? accent : 'var(--c-text-3)'}/>
              <input
                value={to}
                onChange={e => { setTo(e.target.value); fetchSuggestionsDebounced(e.target.value, 'to'); }}
                onFocus={() => { setFocus(true); setShowToSuggestions(true); fetchSuggestionsDebounced(to, 'to'); }}
                onBlur={() => setTimeout(() => { setShowToSuggestions(false); setFocus(false); setToActiveIndex(-1); }, 160)}
                onKeyDown={(e) => {
                  if (!toSuggestions || toSuggestions.length === 0) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setToActiveIndex(i => Math.min((toSuggestions.length - 1), (i < 0 ? 0 : i + 1))); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setToActiveIndex(i => Math.max(0, (i > 0 ? i - 1 : 0))); }
                  if (e.key === 'Enter') { e.preventDefault(); if (toActiveIndex >= 0) selectToSuggestion(toActiveIndex); }
                }}
                placeholder="To"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', fontFamily: 'inherit' }} />
            </div>
            {showToSuggestions && toSuggestions && toSuggestions.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 68, background: '#0B1620', border: '1px solid var(--c-border)', borderRadius: 10, zIndex: 40, padding: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.6)' }}>
                {toSuggestions.map((s, i) => (
                  <div key={i} onMouseDown={() => selectToSuggestion(i)} onMouseEnter={() => setToActiveIndex(i)}
                    style={{ padding: '8px 10px', cursor: 'pointer', color: toActiveIndex === i ? '#06151E' : 'var(--c-text-2)', background: toActiveIndex === i ? 'var(--c-text-2)' : 'transparent', fontSize: 13 }}>{s.display_name}</div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, marginBottom: 6 }}>Popular destinations</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRESET_LOCATIONS.filter(p => !to || p.display_name.toLowerCase().includes(to.toLowerCase())).map((p, i) => (
                  <button key={i} onClick={() => applyPreset(p)} style={{ all: 'unset', cursor: 'pointer' }}>
                    <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', fontSize: 13 }}>{p.display_name}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
          <div style={{ width: 64, height: 44, background: 'var(--c-surface-alt)', borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <BoatArt type={boat && boat.type ? boat.type : 'Center console'} color="var(--c-text)" size={40}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your boat</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: 'var(--c-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {boat ? `${boat.year || ''} ${boat.name || ''}`.trim() : 'No boat added yet'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {boat ? `${boat.length || ''} · ${boat.type || ''}` : 'Add one in the Boat tab'}
                </div>
              </div>
              <div style={{ minWidth: 120, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button onClick={() => onPickBoat && onPickBoat()} style={{ all: 'unset', cursor: 'pointer' }}>
                  <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)', color: accent, fontSize: 13, fontWeight: 700 }}>Manage boats</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 600 }}>Right now at {from}</span>
          <span style={{ fontSize: 11, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>updated 6 min ago</span>
        </div>
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <StatusPill status={currentStatus}/>
            <span style={{ fontSize: 11, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>{from} → {to}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ConditionTile icon="wind" label="Wind" value={routeSafety?.conditions?.wind != null ? routeSafety.conditions.wind : '—'} unit="kt" sub={routeSafety?.conditions?.gust != null ? `gusts ${routeSafety.conditions.gust}` : 'Forecast unavailable'} />
            <ConditionTile icon="wave" label="Waves" value={routeSafety?.conditions?.waveHeight != null ? routeSafety.conditions.waveHeight : '—'} unit="ft" sub={routeSafety?.conditions?.waveHeight != null ? `forecast` : 'Forecast unavailable'} />
            <ConditionTile icon="eye" label="Vis" value={routeSafety?.hourly?.[0]?.temperature || '—'} unit="" sub={routeSafety?.hourly?.[0]?.shortForecast || 'Forecast unavailable'} />
          </div>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:11, color:'var(--c-text-3)', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase' }}>
            {alerts.length} Active Alert{alerts.length>1?'s':''}
          </div>
          {alerts.map(a => {
            const isSerious = ['Extreme','Severe'].includes(a.severity);
            return (
              <div key={a.id} style={{
                display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px',
                background: isSerious ? 'rgba(220,38,38,0.1)' : 'rgba(245,158,11,0.1)',
                border:`1px solid ${isSerious ? '#7A2530' : '#78490A'}`,
                borderRadius:12,
              }}>
                <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{isSerious ? '🚨' : '⚠️'}</span>
                <div>
                  <div style={{ fontSize:12.5, color:'var(--c-text)', fontWeight:700 }}>{a.event}</div>
                  <div style={{ fontSize:11.5, color:'var(--c-text-3)', marginTop:2, lineHeight:1.4 }}>{a.headline}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fuel gauge */}
      {boat?.fuelCap > 0 && (() => {
        const storedLevel = boat?.id ? parseFloat(localStorage.getItem(`safeseas_fuel_${boat.id}`))||0 : 0;
        const fuelLev = storedLevel > 0 ? storedLevel : (boat?.fuelLevel||0);
        const pct = Math.min(1, fuelLev / boat.fuelCap);
        const barColor = pct > 0.5 ? '#22C55E' : pct > 0.25 ? '#F59E0B' : '#EF4444';
        const rangeNm = (boat.fuelBurn>0 && boat.cruiseSpeed>0 && fuelLev>0)
          ? ((fuelLev/boat.fuelBurn)*boat.cruiseSpeed).toFixed(0)+' nm range'
          : null;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
            background:'var(--c-surface)', border:'1px solid var(--c-border)', borderRadius:14 }}>
            <span style={{ fontSize:18 }}>⛽</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:11, fontWeight:600, color:'var(--c-text-3)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Fuel</span>
                <span style={{ fontSize:12, fontWeight:700, color:'var(--c-text-2)' }}>
                  {fuelLev.toFixed(1)} / {boat.fuelCap} gal {rangeNm ? `· ${rangeNm}` : ''}
                </span>
              </div>
              <div style={{ height:6, borderRadius:99, background:'var(--c-surface-alt)', overflow:'hidden' }}>
                <div style={{ width:`${pct*100}%`, height:'100%', background:barColor, borderRadius:99 }}/>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Nearby: Fuel Docks */}
      {nearby.fuel.length > 0 && (
        <div>
          <div style={{ fontSize:11, color:'var(--c-text-3)', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>⛽ Fuel Docks Nearby</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {nearby.fuel.map((f,i) => (
              <button key={i} onClick={() => onRouteTo && f.lat != null && onRouteTo({ name: f.name, lat: f.lat, lon: f.lon })}
                style={{ all:'unset', cursor: onRouteTo && f.lat != null ? 'pointer' : 'default',
                  display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                  background:'var(--c-surface)', border:'1px solid var(--c-border)', borderRadius:12,
                  transition:'opacity 0.12s' }}
                onMouseEnter={e => { if (onRouteTo && f.lat != null) e.currentTarget.style.opacity='0.8'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity='1'; }}>
                <div style={{ width:32, height:32, borderRadius:99, background:'#16351D', display:'grid', placeItems:'center', flexShrink:0, fontSize:15 }}>⛽</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:'var(--c-text)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                  {onRouteTo && f.lat != null && <div style={{ fontSize:11, color: accent, marginTop:1, fontWeight:600 }}>Tap to navigate</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  <span style={{ fontSize:12, color:'var(--c-text-3)', fontWeight:600 }}>{f.dist.toFixed(1)} nm</span>
                  {onRouteTo && f.lat != null && <Icon name="chevron" size={14} color="var(--c-text-4)" sw={2.5}/>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nearby: Ramps & Marinas */}
      {nearby.ramps.length > 0 && (
        <div>
          <div style={{ fontSize:11, color:'var(--c-text-3)', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>⚓ Ramps & Marinas Nearby</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {nearby.ramps.map((r,i) => (
              <button key={i} onClick={() => onRouteTo && r.lat != null && onRouteTo({ name: r.name, lat: r.lat, lon: r.lon })}
                style={{ all:'unset', cursor: onRouteTo && r.lat != null ? 'pointer' : 'default',
                  display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                  background:'var(--c-surface)', border:'1px solid var(--c-border)', borderRadius:12,
                  transition:'opacity 0.12s' }}
                onMouseEnter={e => { if (onRouteTo && r.lat != null) e.currentTarget.style.opacity='0.8'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity='1'; }}>
                <div style={{ width:32, height:32, borderRadius:99, background:'#0E2238', display:'grid', placeItems:'center', flexShrink:0, fontSize:15 }}>{r.isRamp?'🚤':'⚓'}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:'var(--c-text)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize:11, color: onRouteTo && r.lat != null ? accent : 'var(--c-text-4)', marginTop:1, fontWeight: onRouteTo && r.lat != null ? 600 : 400 }}>
                    {onRouteTo && r.lat != null ? 'Tap to navigate' : (r.isRamp ? 'Boat Ramp' : 'Marina')}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  <span style={{ fontSize:12, color:'var(--c-text-3)', fontWeight:600 }}>{r.dist.toFixed(1)} nm</span>
                  {onRouteTo && r.lat != null && <Icon name="chevron" size={14} color="var(--c-text-4)" sw={2.5}/>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nearby: Hazards */}
      {nearby.hazards.length > 0 && (
        <div>
          <div style={{ fontSize:11, color:'var(--c-text-3)', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>⚠️ Hazards Nearby</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {nearby.hazards.map((h,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                background:'rgba(220,38,38,0.07)', border:'1px solid #7A2530', borderRadius:12 }}>
                <div style={{ width:32, height:32, borderRadius:6, background:'#DC2626', display:'grid', placeItems:'center', flexShrink:0, fontSize:13 }}>⚠</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:'var(--c-text)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.name}</div>
                  <div style={{ fontSize:11, color:'#FF6B6B', marginTop:1, textTransform:'capitalize' }}>{h.type.replace(/_/g,' ')}</div>
                </div>
                <span style={{ fontSize:12, color:'#FF6B6B', fontWeight:600, flexShrink:0 }}>{h.dist.toFixed(1)} nm</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => onPlan({ from, to })} style={{
        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        height: 60, borderRadius: 16, background: accent, color: '#06151E',
        fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em',
        boxShadow: `0 0 0 1px ${accent}, 0 8px 24px ${accent}33`,
      }}>
        Plan trip to {to || 'destination'}
        <Icon name="arrow" size={20} color="#06151E" sw={2.2}/>
      </button>

      <div>
        <div style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 600, marginBottom: 10 }}>Recent trips</div>
        {trips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--c-text-4)', fontSize: 13 }}>
            No saved trips yet. Plan a route and save it!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {trips.map((t, i) => {
              const title = t.name || (t.from && t.to ? `${t.from} → ${t.to}` : 'Trip');
              const sub = t.notes || (t.date && t.dist ? `${t.date} · ${t.dist}` : (t.created_at ? new Date(t.created_at).toLocaleString() : ''));
              const status = t.status || 'go';
              return (
                <button key={t.id || i} onClick={() => onTrip(t)} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                  <Card style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--c-surface-alt)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Icon name="pin" size={16} color={(STATUS[status] && STATUS[status].fg) || '#34E0A0'} sw={2}/>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{sub}</div>
                      </div>
                      <Icon name="chevron" size={16} color="var(--c-text-4)" sw={2}/>
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FuelCard({ boat, fuelLevel, fuelRangeNm, routeDistNm, fuelOk, accent }) {
  const cap = boat?.fuelCap || 0;
  const pct = cap > 0 ? Math.min(1, fuelLevel / cap) : 0;
  const overRange = fuelRangeNm != null && routeDistNm > 0 && routeDistNm > fuelRangeNm;
  const barColor = pct > 0.5 ? '#22C55E' : pct > 0.25 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ background: 'var(--c-surface)', border: `1px solid ${overRange ? '#7A2530' : 'var(--c-border)'}`, borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Fuel</div>
        <div style={{ fontSize: 12, color: overRange ? '#FF6B6B' : 'var(--c-text-2)', fontWeight: 600 }}>
          {fuelRangeNm != null ? `Range: ${fuelRangeNm.toFixed(0)} nm` : '—'}
          {routeDistNm > 0 ? ` · Route: ${routeDistNm.toFixed(0)} nm` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--c-surface-alt)', overflow: 'hidden' }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 99, transition: 'width 0.4s' }}/>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {fuelLevel.toFixed(1)} / {cap} gal
        </span>
      </div>
      {overRange && (
        <div style={{ fontSize: 12, color: '#FF6B6B', fontWeight: 600 }}>
          ⚠ Destination is beyond fuel range — refuel or shorten route.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TRIP DETAIL SCREEN
// ─────────────────────────────────────────────────────────────
function TripScreen({ accent, boat, verdict, pulse, onSave, onPlan, route, currentTrip, routeSafety, routingActive, onPinSet }) {
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [routeProgress, setRouteProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const [fromValue, setFromValue] = useState(route?.from || 'Anna Maria Island');
  const [toValue, setToValue] = useState(route?.to || 'Egmont Key');

  useEffect(() => {
    setFromValue(route?.from || 'Anna Maria Island');
    setToValue(route?.to || 'Egmont Key');
  }, [route]);

  useEffect(() => {
    let raf, start;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / 1400);
      setRouteProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const v = STATUS[verdict];
  const copy = VERDICT_COPY[verdict];
  const safetyReasons = routeSafety?.reasons || [];

  const routeConditions = routeSafety?.conditions || {};
  const hourly = routeSafety?.hourly || [
    { t: '7a', wind: 14, ok: false },
    { t: '9a', wind: 12, ok: true },
    { t: '11a', wind: 10, ok: true },
    { t: '1p', wind: 9, ok: true },
    { t: '3p', wind: 11, ok: true },
    { t: '5p', wind: 13, ok: true },
    { t: '7p', wind: 15, ok: false },
  ];
  const startWind = routeConditions.wind != null ? routeConditions.wind : '—';
  const startSub  = routeSafety
    ? (routeConditions.gust != null ? `${routeConditions.gust} kt gust` : 'No gust data')
    : 'Forecast unavailable';
  const arrWindVal = routeConditions.arrivalWind != null ? routeConditions.arrivalWind : '—';
  const arrWindSub = routeSafety
    ? (routeConditions.arrivalWindDir
        ? `From ${routeConditions.arrivalWindDir}`
        : (routeConditions.arrivalWind != null ? 'At destination' : 'Forecast unavailable'))
    : 'Forecast unavailable';
  const depthVal = routeConditions.maxDepthFt != null ? routeConditions.maxDepthFt : '—';
  const depthSub  = routeSafety
    ? (routeConditions.maxDepthFt != null ? 'Deepest along route' : 'Unavailable')
    : 'Unavailable';
  const safeHour = hourly.find(h => h.ok);
  const bestWindow = routeSafety ? (
    safeHour ? `Leave ${safeHour.t}${safeHour.shortForecast ? ` — ${safeHour.shortForecast.toLowerCase()}` : ''}` : 'No safe departure window today'
  ) : (
    verdict === 'go' ? 'Leave 9:15 AM — smoothest ride' : verdict === 'wait' ? 'Leave 4:15 PM — waves drop' : 'Sunday 8 AM looks clean'
  );

  const sheetH = sheetExpanded ? 540 : 380;

  // Fuel range
  const storedFuel = boat?.id ? parseFloat(localStorage.getItem(`safeseas_fuel_${boat.id}`) || '0') : 0;
  const fuelLevel  = storedFuel > 0 ? storedFuel : (boat?.fuelLevel || 0);
  const fuelRangeNm = (boat?.fuelBurn > 0 && boat?.cruiseSpeed > 0 && fuelLevel > 0)
    ? (fuelLevel / boat.fuelBurn) * boat.cruiseSpeed : null;
  const routeDistNm = _routeDistNm(route?.waypoints);
  const fuelOk = fuelRangeNm == null || routeDistNm === 0 || fuelRangeNm >= routeDistNm;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <LiveMap accent={accent} route={route} routingActive={routingActive} onPinSet={onPinSet} bottomInset={sheetH} boat={boat} fuelLevel={fuelLevel}/>

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100, zIndex: 500,
        background: 'linear-gradient(180deg, rgba(6,21,32,0.7), transparent)', pointerEvents: 'none' }}/>

      <div style={{ position: 'absolute', top: 12, left: 16, right: 16, zIndex: 500, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 10px',
          background: 'rgba(15,26,38,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 99, border: '1px solid var(--c-border)' }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, border: `1.5px solid ${accent}`, background: '#06151E' }}/>
          <span style={{ fontSize: 12, color: 'var(--c-text)', fontWeight: 600 }}>{route?.from || 'Start'}</span>
          <Icon name="arrow" size={12} color="var(--c-text-3)" sw={2}/>
          <Icon name="pin" size={14} color={accent} sw={2}/>
          <span style={{ fontSize: 12, color: 'var(--c-text)', fontWeight: 600 }}>{route?.to || 'Destination'}</span>
        </div>
      </div>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 500,
        background: 'linear-gradient(180deg, rgba(11,26,38,0.96), var(--c-bg) 30%)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        borderTop: '1px solid var(--c-border)',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
        height: sheetH,
        transition: 'height 0.35s cubic-bezier(.4,1.4,.6,1)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <button onClick={() => setSheetExpanded(!sheetExpanded)} style={{
          all: 'unset', cursor: 'pointer', padding: '10px 0 4px', display: 'flex', justifyContent: 'center',
        }}>
          <div style={{ width: 40, height: 5, borderRadius: 99, background: 'var(--c-text-5)' }}/>
        </button>

        <div style={{ padding: '8px 20px 20px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: v.bg, border: `1.5px solid ${v.border}`, borderRadius: 18, padding: '18px 18px 20px',
            position: 'relative', overflow: 'hidden',
          }}>
            {pulse && (
              <div style={{
                position: 'absolute', inset: -2, borderRadius: 18,
                border: `1.5px solid ${v.fg}`,
                animation: 'verdictPulse 2.2s ease-out infinite',
                pointerEvents: 'none', opacity: 0.6,
              }}/>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: v.fg, boxShadow: `0 0 12px ${v.fg}` }}/>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: v.fg }}>{v.label} TODAY</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {verdict === 'go' && 'Clear all day.'}
              {verdict === 'wait' && 'Hold till afternoon.'}
              {verdict === 'nogo' && 'Stay at the dock.'}
            </div>
            <div style={{ fontSize: 14.5, color: 'var(--c-text-2)', marginTop: 8, lineHeight: 1.4 }}>{copy.line}</div>
            {routeSafety && (
              <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: '#0E1D29', border: '1px solid #1C3246' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Safety details</div>
                {safetyReasons.length ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {safetyReasons.map((reason, index) => (
                      <div key={index} style={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.4 }}>• {reason}</div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--c-text-2)' }}>No critical safety issues detected for this route.</div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
            background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}1F`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="clock" size={22} color={accent} sw={2}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Best window</div>
              <div style={{ fontSize: 17, color: 'var(--c-text)', fontWeight: 700, marginTop: 2, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{bestWindow}</div>
            </div>
          </div>

          {/* Fuel range card */}
          {boat?.fuelBurn > 0 && boat?.cruiseSpeed > 0 && boat?.fuelCap > 0 && (
            <FuelCard boat={boat} fuelLevel={fuelLevel} fuelRangeNm={fuelRangeNm} routeDistNm={routeDistNm} fuelOk={fuelOk} accent={accent}/>
          )}

          <div style={{ background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)', borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Plan your trip</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={fromValue} onChange={e => setFromValue(e.target.value)} placeholder="From" style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid var(--c-border)', background: 'var(--c-bg)', color: 'var(--c-text)', fontSize: 15 }} />
              <input value={toValue} onChange={e => setToValue(e.target.value)} placeholder="To" style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid var(--c-border)', background: 'var(--c-bg)', color: 'var(--c-text)', fontSize: 15 }} />
            </div>
            <button onClick={() => { setSaved(false); onPlan && onPlan({ from: fromValue, to: toValue }); }} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 18px', borderRadius: 15, background: accent, color: '#06151E', fontWeight: 700, fontSize: 15, textTransform: 'uppercase' }}>
              Plan route
            </button>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Conditions along the route
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ConditionTile icon="wind"   label="Depart"    value={startWind} unit="kt" sub={startSub}/>
              <ConditionTile icon="wind"   label="Arrival"   value={arrWindVal} unit="kt" sub={arrWindSub}/>
              <ConditionTile icon="anchor" label="Max depth" value={depthVal}   unit="ft" sub={depthSub}/>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Hourly wind · {(boat && boat.windLim) || 0} kt limit
            </div>
            <div style={{ position: 'relative', background: 'var(--c-surface-alt)', borderRadius: 14, border: '1px solid var(--c-border-soft)', padding: '16px 12px 10px' }}>
              <div style={{ position: 'absolute', left: 12, right: 12, top: 16 + (1 - (boat?.windLim || 20)/30) * 60, height: 1, background: `${STATUS.wait.fg}33`, borderTop: `1px dashed ${STATUS.wait.fg}66`, pointerEvents: 'none' }}/>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 60, gap: 4 }}>
                {hourly.map((h, i) => {
                  const windValue = typeof h.wind === 'number' ? h.wind : 0;
                  const hh = Math.max(8, Math.min(60, (windValue / 30) * 60));
                  const ok = typeof h.ok === 'boolean' ? h.ok : (boat ? windValue <= (boat.windLim || 0) : true);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '70%', height: hh, borderRadius: 3, background: ok ? accent : STATUS.wait.fg, opacity: ok ? 1 : 0.7 }}/>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                {hourly.map((h, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>{h.t}</div>
                ))}
              </div>
            </div>
          </div>

          <button onClick={() => {
            setSaved(true);
            const savedStatus = routeSafety?.verdict || verdict;
            const reasonText = routeSafety?.reasons?.length ? `Reasons: ${routeSafety.reasons.join(' | ')}` : '';
            onSave && onSave({
              name: `${route?.from || fromValue || 'Start'} → ${route?.to || toValue || 'Destination'}`,
              from: route?.from || fromValue || 'Anna Maria Island',
              to: route?.to || toValue || 'Egmont Key',
              notes: `Boat: ${boat ? boat.name : 'Unknown'} · ${boat ? boat.type : ''}${reasonText ? ' · ' + reasonText : ''}`,
              status: savedStatus,
              boatId: boat?.id || null,
            });
          }} style={{
            all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            height: 56, borderRadius: 16,
            background: saved ? '#0F3D2E' : accent, color: saved ? STATUS.go.fg : '#06151E',
            border: saved ? `1.5px solid ${STATUS.go.border}` : 'none',
            fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em',
            boxShadow: saved ? 'none' : `0 6px 20px ${accent}33`,
            marginTop: 4,
          }}>
            <Icon name={saved ? 'check' : 'bookmark'} size={20} color={saved ? STATUS.go.fg : '#06151E'} sw={2.2}/>
            {saved ? 'Trip saved' : 'Save trip'}
          </button>
        </div>
      </div>

      <style>{`@keyframes verdictPulse {
        0% { transform: scale(1); opacity: 0.7; }
        70% { transform: scale(1.04); opacity: 0; }
        100% { transform: scale(1.04); opacity: 0; }
      }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BOAT PROFILE SCREEN
// ─────────────────────────────────────────────────────────────
function BoatScreen({ accent, boat, setBoat, boats, addBoat, deleteBoat, presetBoats = [], user }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ name: '', length: '', type: '', description: '', waveLim: 0, windLim: 0 });
  const [catalogOpen, setCatalogOpen] = useState(false);

  const types = ['Center console', 'Bowrider', 'Pontoon', 'Sailboat', 'Jon boat', 'Jet boat', 'Skiff'];

  const addFromPreset = async (preset) => {
    // Check if user already has this preset added
    const alreadyAdded = boats.some(b => b.name === preset.name && b.type === preset.type);
    if (!alreadyAdded) {
      await addBoat({ name: preset.name, type: preset.type, year: preset.year, length: preset.length, waveLim: preset.waveLim, windLim: preset.windLim, description: preset.description });
    }
    setCatalogOpen(false);
  };

  return (
    <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--c-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Profile</div>
        <div style={{ fontSize: 26, color: 'var(--c-text)', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>My Boats</div>
      </div>

      {/* Active boat card */}
      <Card style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 92, height: 64, background: 'var(--c-surface-alt)', borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <BoatArt type={(boat && boat.type) || 'Center console'} color={accent} size={56}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Currently selected</div>
            <div style={{ fontSize: 17, color: 'var(--c-text)', fontWeight: 700, marginTop: 4, letterSpacing: '-0.01em' }}>{boat ? `${boat.year || ''} ${boat.name || ''}`.trim() : 'No boat selected'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--c-text-3)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{boat ? `${boat.length || ''} · ${boat.type || ''}` : 'Add a boat below'}</div>
          </div>
        </div>
        {boat && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: 14, background: 'var(--c-surface-alt)', borderRadius: 12, border: '1px solid var(--c-border-soft)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                Comfortable up to{' '}
                <span style={{ color: accent, fontWeight: 700 }}>{boat.waveLim || '—'} ft waves</span> and{' '}
                <span style={{ color: accent, fontWeight: 700 }}>{boat.windLim || '—'} kt winds</span>. SafeSeas uses these limits for go/no-go decisions.
              </div>
            </div>
            {boat.fuelCap > 0 && (() => {
              const storageKey = user ? `safeseas_fuel_${boat.id}` : null;
              const stored = storageKey ? parseFloat(localStorage.getItem(storageKey) || '') : NaN;
              const cur = isNaN(stored) ? (boat.fuelLevel || 0) : stored;
              const pct = cur / boat.fuelCap;
              const barColor = pct > 0.5 ? '#22C55E' : pct > 0.25 ? '#F59E0B' : '#EF4444';
              return (
                <div style={{ padding: 14, background: 'var(--c-surface-alt)', borderRadius: 12, border: '1px solid var(--c-border-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Current fuel</div>
                    <div style={{ fontSize: 12, color: 'var(--c-text-2)', fontWeight: 600 }}>{cur.toFixed(1)} / {boat.fuelCap} gal</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--c-bg)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 99, transition: 'width 0.3s' }}/>
                    </div>
                  </div>
                  <input type="range" min={0} max={boat.fuelCap} step={0.5}
                    value={cur}
                    onChange={e => {
                      if (storageKey) localStorage.setItem(storageKey, e.target.value);
                      setBoat({ ...boat, _fuelLevel: parseFloat(e.target.value) });
                    }}
                    style={{ width: '100%', marginTop: 8, accentColor: accent }}
                  />
                  {boat.fuelBurn > 0 && boat.cruiseSpeed > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 4 }}>
                      Est. range: <span style={{ color: accent, fontWeight: 700 }}>{((cur / boat.fuelBurn) * boat.cruiseSpeed).toFixed(0)} nm</span>{' '}
                      at {boat.cruiseSpeed} kt / {boat.fuelBurn} gph
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Card>

      {/* User's boats */}
      {boats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--c-text-4)', fontSize: 13 }}>
          You haven't added any boats yet.
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 600, marginBottom: 10 }}>Your boats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {boats.map(b => {
              const active = boat && boat.id === b.id;
              return (
                <div key={b.id || b.name} style={{ position: 'relative' }}>
                  <button onClick={() => setBoat(b)} style={{
                    all: 'unset', cursor: 'pointer', display: 'block', width: '100%',
                    background: active ? `${accent}14` : 'var(--c-surface)',
                    border: `1.5px solid ${active ? accent : 'var(--c-border)'}`,
                    borderRadius: 14, padding: '14px 12px 12px',
                    transition: 'all 0.18s ease',
                    boxShadow: active ? `0 0 0 4px ${accent}1A` : 'none',
                  }}>
                    <div style={{ height: 56, display: 'grid', placeItems: 'center' }}>
                      <BoatArt type={b.type || 'Center console'} color={active ? accent : 'var(--c-text-2)'} size={50}/>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--c-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{b.name}</span>
                      {active && (
                        <span style={{ width: 18, height: 18, borderRadius: 99, background: accent, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          <Icon name="check" size={11} color="#06151E" sw={3}/>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {b.waveLim || '—'} ft · {b.windLim || '—'} kt
                    </div>
                  </button>
                  {/* Delete button */}
                  <button onClick={() => deleteBoat(b.id)} style={{
                    all: 'unset', cursor: 'pointer', position: 'absolute', top: 8, right: 8,
                    width: 22, height: 22, borderRadius: 99, background: 'var(--c-surface-alt)',
                    border: '1px solid var(--c-border)', display: 'grid', placeItems: 'center',
                    color: 'var(--c-text-4)',
                  }}>
                    <Icon name="trash" size={12} sw={1.8}/>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Browse preset catalog */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <button onClick={() => setCatalogOpen(!catalogOpen)} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', width: 'calc(100% - 32px)',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--c-surface-alt)', display: 'grid', placeItems: 'center' }}>
            <Icon name="boat" size={16} color={accent} sw={2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 600 }}>Browse boat catalog</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>Add from preset boats</div>
          </div>
          <div style={{ transform: catalogOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
            <Icon name="chevron" size={16} color="var(--c-text-4)" sw={2}/>
          </div>
        </button>
        {catalogOpen && (
          <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {presetBoats.map(p => {
              const alreadyAdded = boats.some(b => b.name === p.name && b.type === p.type);
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 10px', borderRadius: 12,
                  background: 'var(--c-surface-alt)', border: '1px solid var(--c-border-soft)',
                }}>
                  <div style={{ width: 44, height: 36, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <BoatArt type={p.type || 'Center console'} color="var(--c-text-3)" size={32}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{p.type} · {p.length} · {p.waveLim} ft / {p.windLim} kt</div>
                  </div>
                  <button onClick={() => addFromPreset(p)} disabled={alreadyAdded} style={{
                    all: 'unset', cursor: alreadyAdded ? 'default' : 'pointer',
                    padding: '6px 12px', borderRadius: 8,
                    background: alreadyAdded ? 'var(--c-surface)' : `${accent}22`,
                    border: `1px solid ${alreadyAdded ? 'var(--c-border)' : accent}`,
                    color: alreadyAdded ? 'var(--c-text-4)' : accent,
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                  }}>
                    {alreadyAdded ? 'Added' : '+ Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Add custom boat */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <button onClick={() => setCustomOpen(!customOpen)} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', width: 'calc(100% - 32px)',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--c-surface-alt)', display: 'grid', placeItems: 'center' }}>
            <Icon name="plus" size={18} color={accent} sw={2.2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 600 }}>Add custom boat</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>Enter your own length, limits, and type</div>
          </div>
          <div style={{ transform: customOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
            <Icon name="chevron" size={16} color="var(--c-text-4)" sw={2}/>
          </div>
        </button>
        {customOpen && (
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Boat name"      placeholder="e.g. Reel Time"         value={custom.name}        onChange={v => setCustom({...custom, name: v})}/>
            <Field label="Year"           placeholder="e.g. 2022"              value={custom.year || ''}  onChange={v => setCustom({...custom, year: v})}/>
            <Field label="Length (ft)"    placeholder="22"                      value={custom.length}      onChange={v => setCustom({...custom, length: v})} numeric/>
            <Field label="Wave limit (ft)" placeholder="3.5"                   value={custom.waveLim || ''} onChange={v => setCustom({...custom, waveLim: parseFloat(v) || 0})} numeric />
            <Field label="Wind limit (kt)" placeholder="22"                    value={custom.windLim || ''} onChange={v => setCustom({...custom, windLim: parseFloat(v) || 0})} numeric />
            <Field label="Cruise speed (kt)" placeholder="e.g. 22"            value={custom.cruiseSpeed || ''} onChange={v => setCustom({...custom, cruiseSpeed: parseFloat(v) || 0})} numeric />
            <Field label="Fuel tank (gal)"   placeholder="e.g. 56"            value={custom.fuelCap || ''} onChange={v => setCustom({...custom, fuelCap: parseFloat(v) || 0})} numeric />
            <Field label="Fuel burn (gph)"   placeholder="e.g. 4.5"           value={custom.fuelBurn || ''} onChange={v => setCustom({...custom, fuelBurn: parseFloat(v) || 0})} numeric />
            <Field label="Description"    placeholder="Optional description"    value={custom.description || ''} onChange={v => setCustom({...custom, description: v})} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Type</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {types.map(t => (
                  <button key={t} onClick={() => setCustom({...custom, type: t})} style={{
                    all: 'unset', cursor: 'pointer',
                    padding: '6px 11px', borderRadius: 99,
                    background: custom.type === t ? `${accent}22` : 'var(--c-surface-alt)',
                    border: `1px solid ${custom.type === t ? accent : 'var(--c-border-soft)'}`,
                    color: custom.type === t ? accent : 'var(--c-text-2)',
                    fontSize: 12, fontWeight: 600,
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={async () => {
                if (!custom.name.trim()) return;
                await addBoat(custom);
                setCustom({ name: '', length: '', type: '', waveLim: 0, windLim: 0, description: '', year: '', cruiseSpeed: 0, fuelCap: 0, fuelBurn: 0 });
                setCustomOpen(false);
              }} style={{ all: 'unset', cursor: 'pointer', padding: '10px 14px', background: accent, color: '#06151E', borderRadius: 10, fontWeight: 700 }}>Save boat</button>
              <button onClick={() => setCustomOpen(false)} style={{ all: 'unset', cursor: 'pointer', padding: '10px 14px', background: 'var(--c-surface-alt)', color: 'var(--c-text-2)', borderRadius: 10 }}>Cancel</button>
            </div>
          </div>
        )}
      </Card>

    </div>
  );
}

function Field({ label, value, onChange, placeholder, numeric }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'numeric' : 'text'}
        style={{
          width: 'calc(100% - 28px)',
          background: 'var(--c-surface-alt)', border: '1px solid var(--c-border-soft)', borderRadius: 10,
          padding: '12px 14px', color: 'var(--c-text)', fontSize: 15, outline: 'none',
          fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
        }}/>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// SETTINGS SCREEN
// ─────────────────────────────────────────────────────────────
const PROFILE_COLORS = ['#22E3D0', '#38BDF8', '#818CF8', '#F472B6', '#FB923C', '#4ADE80', '#FACC15', '#F87171'];

function FriendsSection({ accent, authToken, user }) {
  const [friends, setFriends] = useState({ friends: [], incoming: [], outgoing: [] });
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  const loadFriends = async () => {
    try {
      const res = await fetch(`${API}/api/friends`, { headers: authHeaders });
      if (res.ok) setFriends(await res.json());
    } catch {}
  };

  useEffect(() => { loadFriends(); }, []);

  const handleSearchChange = (q) => {
    setSearchQ(q);
    clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/users/search?q=${encodeURIComponent(q)}`, { headers: authHeaders });
        if (res.ok) setSearchResults(await res.json());
      } catch {}
      setSearching(false);
    }, 350);
  };

  const sendRequest = async (toUserId) => {
    try {
      await fetch(`${API}/api/friends/request`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId }),
      });
      setSearchResults(r => r.filter(u => u.id !== toUserId));
      loadFriends();
    } catch {}
  };

  const respond = async (requestId, action) => {
    try {
      await fetch(`${API}/api/friends/respond`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });
      loadFriends();
    } catch {}
  };

  const outgoingIds = new Set(friends.outgoing.map(r => r.id));
  const friendIds = new Set(friends.friends.map(r => r.id));
  const incomingIds = new Set(friends.incoming.map(r => r.id));

  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 18, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Friends</div>

      {/* Incoming requests */}
      {friends.incoming.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 600, marginBottom: 8 }}>Friend Requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {friends.incoming.map(r => (
              <div key={r.requestId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <div style={{ width: 32, height: 32, borderRadius: 99, background: accent + '33', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: accent }}>
                  {r.name[0].toUpperCase()}
                </div>
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-text)', fontWeight: 600 }}>{r.name}</span>
                <button onClick={() => respond(r.requestId, 'accept')} style={{
                  all: 'unset', cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
                  background: accent, color: '#06151E', fontSize: 12, fontWeight: 700,
                }}>Accept</button>
                <button onClick={() => respond(r.requestId, 'decline')} style={{
                  all: 'unset', cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
                  background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)',
                  color: 'var(--c-text-3)', fontSize: 12, fontWeight: 600,
                }}>Decline</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div>
        <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 600, marginBottom: 8 }}>Add Friend</div>
        <input
          type="text"
          value={searchQ}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search by name…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)',
            borderRadius: 10, padding: '9px 12px',
            color: 'var(--c-text)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
          }}
        />
        {searching && <div style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 6 }}>Searching…</div>}
        {searchResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {searchResults.map(u => {
              const isFriend = friendIds.has(u.id);
              const isPending = outgoingIds.has(u.id) || incomingIds.has(u.id);
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 99, background: 'var(--c-surface-alt)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--c-text-3)' }}>
                    {u.name[0].toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-text)', fontWeight: 600 }}>{u.name}</span>
                  {isFriend ? (
                    <span style={{ fontSize: 11.5, color: '#22C55E', fontWeight: 600 }}>Friends</span>
                  ) : isPending ? (
                    <span style={{ fontSize: 11.5, color: 'var(--c-text-4)', fontWeight: 600 }}>Pending</span>
                  ) : (
                    <button onClick={() => sendRequest(u.id)} style={{
                      all: 'unset', cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
                      background: accent + '22', border: `1px solid ${accent}55`,
                      color: accent, fontSize: 12, fontWeight: 700,
                    }}>Add</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Friend list */}
      {friends.friends.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 600, marginBottom: 8 }}>
            {friends.friends.length} Friend{friends.friends.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {friends.friends.map(f => (
              <div key={f.requestId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <div style={{ width: 32, height: 32, borderRadius: 99, background: accent + '33', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: accent }}>
                  {f.name[0].toUpperCase()}
                </div>
                <span style={{ fontSize: 13.5, color: 'var(--c-text)', fontWeight: 600 }}>{f.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing */}
      {friends.outgoing.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 600, marginBottom: 6 }}>Sent Requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {friends.outgoing.map(r => (
              <div key={r.requestId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                <div style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--c-surface-alt)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--c-text-4)' }}>
                  {r.name[0].toUpperCase()}
                </div>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--c-text-3)', fontWeight: 600 }}>{r.name}</span>
                <span style={{ fontSize: 11, color: 'var(--c-text-4)' }}>Awaiting reply</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {friends.friends.length === 0 && friends.incoming.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--c-text-4)', textAlign: 'center', padding: '8px 0' }}>
          No friends yet — search above to add some.
        </div>
      )}
    </div>
  );
}

function SettingsScreen({ accent, user, onLogout, profileColor, onProfileColorChange, colorMode, onColorModeChange, onDeleteAccount, authToken }) {
  const [deleteMode, setDeleteMode] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackState('sending');
    try {
      const token = localStorage.getItem('safeseas_token');
      const res = await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: feedbackText.trim() }),
      });
      if (!res.ok) throw new Error();
      setFeedbackState('sent');
      setFeedbackText('');
    } catch {
      setFeedbackState('error');
    }
  };

  const initial = user?.name ? user.name[0].toUpperCase() : '?';

  const handleDelete = async () => {
    if (!deletePassword) { setDeleteError('Please enter your password'); return; }
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await onDeleteAccount(deletePassword);
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--c-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Account</div>
        <div style={{ fontSize: 26, color: 'var(--c-text)', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>Settings</div>
      </div>

      {/* Profile card */}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 18, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 20,
            background: profileColor, display: 'grid', placeItems: 'center', flexShrink: 0,
            boxShadow: `0 0 0 3px ${profileColor}44`,
          }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#06151E', lineHeight: 1 }}>{initial}</span>
          </div>
          <div>
            <div style={{ fontSize: 17, color: 'var(--c-text)', fontWeight: 700 }}>{user?.name || 'Captain'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--c-text-4)', marginTop: 2 }}>{user?.email || ''}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Profile color</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {PROFILE_COLORS.map(c => (
            <button key={c} onClick={() => onProfileColorChange(c)} style={{
              all: 'unset', cursor: 'pointer',
              width: 32, height: 32, borderRadius: 99, background: c,
              outline: profileColor === c ? `3px solid var(--c-text)` : '3px solid transparent',
              outlineOffset: 2,
              boxShadow: profileColor === c ? `0 0 0 2px ${c}` : 'none',
              transition: 'all 0.15s',
            }}/>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 18, padding: '14px 18px' }}>
        <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Appearance</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 600 }}>Dark mode</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 2 }}>Use the dark marine theme</div>
          </div>
          <button onClick={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')} style={{
            all: 'unset', cursor: 'pointer',
            width: 50, height: 28, borderRadius: 99,
            background: colorMode === 'dark' ? accent : 'var(--c-text-5)',
            position: 'relative', transition: 'background 0.2s',
            boxShadow: colorMode === 'dark' ? `0 0 0 1px ${accent}66` : 'none',
            flexShrink: 0,
          }}>
            <div style={{
              position: 'absolute', top: 3, left: colorMode === 'dark' ? 25 : 3,
              width: 22, height: 22, borderRadius: 99, background: 'white',
              transition: 'left 0.2s',
            }}/>
          </button>
        </div>
      </div>

      {/* Friends */}
      <FriendsSection accent={accent} authToken={authToken} user={user} />

      {/* Feedback */}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 18, padding: '16px 18px' }}>
        <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Send Feedback</div>
        <div style={{ fontSize: 13, color: 'var(--c-text-4)', marginBottom: 12, lineHeight: 1.5 }}>
          Have a suggestion or found a bug? We'd love to hear from you.
        </div>
        <textarea
          value={feedbackText}
          onChange={e => { setFeedbackText(e.target.value); if (feedbackState !== 'idle') setFeedbackState('idle'); }}
          placeholder="Type your feedback here…"
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--c-surface-alt)', border: `1px solid ${feedbackState === 'error' ? '#FF6B6B' : 'var(--c-border)'}`,
            borderRadius: 12, padding: '11px 13px',
            color: 'var(--c-text)', fontSize: 14, lineHeight: 1.55,
            resize: 'none', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          {feedbackState === 'sent' && (
            <span style={{ fontSize: 13, color: '#34E0A0', fontWeight: 600 }}>Feedback sent — thanks!</span>
          )}
          {feedbackState === 'error' && (
            <span style={{ fontSize: 13, color: '#FF6B6B', fontWeight: 600 }}>Failed to send. Try again.</span>
          )}
          {(feedbackState === 'idle' || feedbackState === 'sending') && <span/>}
          <button
            onClick={submitFeedback}
            disabled={feedbackState === 'sending' || !feedbackText.trim()}
            style={{
              all: 'unset', cursor: feedbackText.trim() && feedbackState !== 'sending' ? 'pointer' : 'default',
              padding: '9px 18px', borderRadius: 10,
              background: feedbackText.trim() && feedbackState !== 'sending' ? accent : 'var(--c-disabled)',
              color: feedbackText.trim() && feedbackState !== 'sending' ? '#06151E' : 'var(--c-text-4)',
              fontSize: 13, fontWeight: 700, transition: 'background 0.15s, color 0.15s',
            }}
          >
            {feedbackState === 'sending' ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      {/* Log out */}
      <button onClick={onLogout} style={{
        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px', borderRadius: 18,
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--c-surface-alt)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="logout" size={18} color="#FF6B6B" sw={2}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 600 }}>Log Out</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 2 }}>{user?.email || ''}</div>
        </div>
        <Icon name="chevron" size={16} color="var(--c-text-4)" sw={2}/>
      </button>

      {/* Delete account */}
      {!deleteMode ? (
        <button onClick={() => setDeleteMode(true)} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', borderRadius: 18,
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: '#1A0A0A', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="trash" size={18} color="#FF6B6B" sw={2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: '#FF6B6B', fontWeight: 600 }}>Delete Account</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 2 }}>Permanently remove your data</div>
          </div>
          <Icon name="chevron" size={16} color="var(--c-text-4)" sw={2}/>
        </button>
      ) : (
        <div style={{ background: '#3F1418', border: '1px solid #7A2530', borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 14, color: '#FF6B6B', fontWeight: 700, marginBottom: 6 }}>Delete your account?</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 16, lineHeight: 1.5 }}>
            This permanently deletes your account, boats, and trip history. This cannot be undone.
          </div>
          <input
            type="password"
            value={deletePassword}
            onChange={e => { setDeletePassword(e.target.value); setDeleteError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleDelete()}
            placeholder="Enter your password to confirm"
            style={{
              width: 'calc(100% - 32px)', background: 'var(--c-bg)',
              border: '1px solid #7A2530', borderRadius: 10,
              padding: '12px 16px', color: 'var(--c-text)', fontSize: 15,
              outline: 'none', fontFamily: 'inherit', marginBottom: 12,
            }}
          />
          {deleteError && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#1A0608', border: '1px solid #7A2530', color: '#FF6B6B', fontSize: 12.5, marginBottom: 12 }}>
              {deleteError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setDeleteMode(false); setDeletePassword(''); setDeleteError(''); }} style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
              padding: '12px 0', borderRadius: 10,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600,
            }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleteLoading} style={{
              all: 'unset', cursor: deleteLoading ? 'not-allowed' : 'pointer', flex: 1, textAlign: 'center',
              padding: '12px 0', borderRadius: 10,
              background: deleteLoading ? '#3F1418' : '#FF6B6B',
              color: '#06151E', fontSize: 14, fontWeight: 700,
            }}>
              {deleteLoading ? 'Deleting…' : 'Delete Account'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHAT SCREEN
// ─────────────────────────────────────────────────────────────

const MSG_TYPES = {
  general: { label: 'General',   color: null,      icon: '💬' },
  hazard:  { label: 'Hazard',    color: '#EF4444', icon: '⚠️' },
  rescue:  { label: 'CG Alert',  color: '#F97316', icon: '🆘' },
};

function _timeSince(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function _distNmBetween(lat1, lon1, lat2, lon2) {
  if (lat1==null||lon1==null||lat2==null||lon2==null) return null;
  return _haversineNm(lat1, lon1, lat2, lon2);
}

function ChatScreen({ accent, authToken, user, routeDep, onNewMessage }) {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [msgType, setMsgType]     = useState('general');
  const [pos, setPos]             = useState(null);
  const [status, setStatus]       = useState('connecting');
  const [areaName, setAreaName]   = useState(null);
  const [profileCard, setProfileCard] = useState(null); // { userId, name } → fetched profile
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const socketRef  = useRef(null);
  const listRef    = useRef(null);
  const inputRef   = useRef(null);

  // Resolve position: GPS → route departure → default (Tampa Bay).
  // Always resolves — never leaves pos null.
  useEffect(() => {
    const fallback = { lat: 27.4976, lon: -82.7196 };
    const useDep   = routeDep ? { lat: routeDep[0], lon: routeDep[1] } : fallback;

    if (!navigator.geolocation) { setPos(useDep); return; }

    const id = navigator.geolocation.getCurrentPosition(
      p  => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setPos(useDep),
      { timeout: 6000, maximumAge: 120000 },
    );
    // Guarantee resolution even if geolocation hangs
    const guard = setTimeout(() => setPos(prev => prev ?? useDep), 7000);
    return () => clearTimeout(guard);
  }, []);

  // Reverse-geocode for friendly area label
  useEffect(() => {
    if (!pos) return;
    fetch(`${API}/api/reverse-geocode?lat=${pos.lat}&lon=${pos.lon}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.name ? setAreaName(d.name) : null)
      .catch(() => {});
  }, [pos?.lat, pos?.lon]);

  // Connect socket immediately on mount; join room when pos arrives
  useEffect(() => {
    if (!authToken) return;
    const socket = socketIO(API, { auth: { token: authToken } });
    socketRef.current = socket;
    socket.on('connect', () => { if (pos) setStatus('joined'); })
    socket.on('connect_error', () => setStatus('error'));
    socket.on('history', msgs => { setMessages(msgs); setStatus('joined'); });
    socket.on('message', msg  => {
      setMessages(prev => [...prev, msg]);
      if (msg.userId !== user?.id && onNewMessage) onNewMessage(msg);
    });
    return () => { socket.disconnect(); socketRef.current = null; setStatus('connecting'); };
  }, [authToken]);

  // Emit join whenever pos changes (or when socket first connects with pos already set)
  useEffect(() => {
    if (!pos || !socketRef.current) return;
    const s = socketRef.current;
    const doJoin = () => { s.emit('join', { lat: pos.lat, lon: pos.lon }); setStatus('joined'); };
    if (s.connected) { doJoin(); }
    else { s.once('connect', doJoin); }
  }, [pos?.lat, pos?.lon]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const openProfile = async (msg) => {
    setProfileCard({ userId: msg.userId, name: msg.name });
    setProfileData(null);
    setProfileLoading(true);
    try {
      const res = await fetch(`${API}/api/users/${msg.userId}/profile`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) setProfileData(await res.json());
    } catch {}
    setProfileLoading(false);
  };

  const canSend = input.trim().length > 0 && socketRef.current?.connected && pos != null;

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !socketRef.current?.connected || !pos) return;
    socketRef.current.emit('message', { lat: pos.lat, lon: pos.lon, text, type: msgType });
    setInput('');
  }, [input, msgType, pos]);

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const accentColor = accent || '#22E3D0';

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 94, display: 'flex', flexDirection: 'column', background: 'var(--c-bg)' }}>

      {/* Header */}
      <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--c-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Live</div>
        <div style={{ fontSize: 26, color: 'var(--c-text)', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>Nearby Radio</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: 99,
            background: status === 'joined' ? '#22C55E' : status === 'error' ? '#EF4444' : '#F59E0B',
            boxShadow: status === 'joined' ? '0 0 6px #22C55E' : 'none',
          }}/>
          <span style={{ fontSize: 12, color: 'var(--c-text-3)', fontWeight: 500 }}>
            {status === 'joined'
              ? (areaName ? `Chatting near ${areaName}` : 'Connected to local area')
              : status === 'error' ? 'Connection failed — check your internet'
              : 'Locating you…'}
          </span>
        </div>
      </div>

      {/* Message type selector */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        {Object.entries(MSG_TYPES).map(([key, t]) => (
          <button key={key} onClick={() => setMsgType(key)} style={{
            all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
            background: msgType === key ? (t.color ? `${t.color}22` : `${accentColor}22`) : 'var(--c-surface)',
            border: `1px solid ${msgType === key ? (t.color || accentColor) : 'var(--c-border)'}`,
            color: msgType === key ? (t.color || accentColor) : 'var(--c-text-3)',
          }}>
            <span style={{ fontSize: 13 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && status === 'joined' && (
          <div style={{ textAlign: 'center', color: 'var(--c-text-4)', fontSize: 13, paddingTop: 40 }}>
            No messages yet in this area.<br/>Be the first to say something.
          </div>
        )}
        {messages.length === 0 && status !== 'joined' && status !== 'error' && (
          <div style={{ textAlign: 'center', color: 'var(--c-text-4)', fontSize: 13, paddingTop: 40 }}>
            Getting your location…
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.userId === user?.id;
          const t    = MSG_TYPES[msg.type] || MSG_TYPES.general;
          const bubbleColor = t.color
            ? { bg: `${t.color}18`, border: `${t.color}44`, text: t.color }
            : isMe
              ? { bg: `${accentColor}18`, border: `${accentColor}44`, text: accentColor }
              : { bg: 'var(--c-surface)', border: 'var(--c-border)', text: 'var(--c-text)' };
          const dist = isMe ? null : _distNmBetween(pos?.lat, pos?.lon, msg.lat, msg.lon);
          const initials = (msg.name || '?')[0].toUpperCase();

          return (
            <div key={msg.id} style={{ display: 'flex', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
              {isMe ? (
                <div style={{
                  width: 30, height: 30, borderRadius: 99, flexShrink: 0,
                  background: accentColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#06151E',
                }}>{initials}</div>
              ) : (
                <button onClick={() => openProfile(msg)} style={{
                  all: 'unset', cursor: 'pointer',
                  width: 30, height: 30, borderRadius: 99, flexShrink: 0,
                  background: `${accentColor}22`, border: `1.5px solid ${accentColor}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: accentColor,
                }}>{initials}</button>
              )}
              <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 3, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                {!isMe && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', paddingLeft: 2 }}>
                    <button onClick={() => openProfile(msg)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)' }}>{msg.name}</button>
                    {dist != null && <span style={{ fontSize: 10, color: 'var(--c-text-4)' }}>{dist.toFixed(1)} nm away</span>}
                  </div>
                )}
                <div style={{
                  padding: '8px 12px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: bubbleColor.bg, border: `1px solid ${bubbleColor.border}`,
                  fontSize: 14, color: msg.type !== 'general' ? bubbleColor.text : 'var(--c-text)', lineHeight: 1.45,
                  wordBreak: 'break-word',
                }}>
                  {msg.type !== 'general' && <span style={{ marginRight: 5 }}>{t.icon}</span>}
                  {msg.text}
                </div>
                <div style={{ fontSize: 10, color: 'var(--c-text-5)', paddingInline: 4 }}>{_timeSince(msg.ts)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input bar */}
      <div style={{
        padding: '10px 12px 16px', borderTop: '1px solid var(--c-border)', flexShrink: 0,
        background: 'var(--c-bg)', display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={msgType === 'hazard' ? 'Describe the hazard…' : msgType === 'rescue' ? 'Describe the emergency…' : 'Message nearby boaters…'}
          rows={1}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 14, resize: 'none',
            border: `1px solid ${msgType !== 'general' ? (MSG_TYPES[msgType].color || accentColor) : 'var(--c-border)'}`,
            background: 'var(--c-surface)', color: 'var(--c-text)', fontSize: 14,
            outline: 'none', fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 100, overflowY: 'auto',
          }}
        />
        <button onClick={send} disabled={!canSend} style={{
          all: 'unset', cursor: canSend ? 'pointer' : 'default',
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: canSend
            ? (msgType !== 'general' ? MSG_TYPES[msgType].color : accentColor)
            : 'var(--c-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke={canSend ? '#06151E' : 'var(--c-text-4)'}
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13M22 2 15 22l-4-9-9-4z"/>
          </svg>
        </button>
      </div>

      {/* Profile card modal */}
      {profileCard && (
        <div onClick={() => setProfileCard(null)} style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-end', zIndex: 900,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', background: 'var(--c-bg)',
            borderRadius: '20px 20px 0 0', padding: '20px 20px 32px',
            border: '1px solid var(--c-border)', borderBottom: 'none',
            display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto',
          }}>
            {/* Handle bar */}
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--c-border)', margin: '0 auto -8px' }}/>

            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 99, flexShrink: 0,
                background: `${accentColor}22`, border: `2px solid ${accentColor}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 800, color: accentColor,
              }}>{(profileCard.name || '?')[0].toUpperCase()}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.01em' }}>{profileCard.name}</div>
                {profileData && (
                  <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2 }}>
                    Member since {new Date(profileData.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                )}
              </div>
            </div>

            {profileLoading && (
              <div style={{ textAlign: 'center', color: 'var(--c-text-4)', fontSize: 13, padding: '12px 0' }}>Loading profile…</div>
            )}

            {profileData && (
              <>
                {/* Boats */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Boats ({profileData.boats.length})
                  </div>
                  {profileData.boats.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--c-text-4)' }}>No boats added yet</div>
                  ) : profileData.boats.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--c-surface)', borderRadius: 12, border: '1px solid var(--c-border)', marginBottom: 6 }}>
                      <span style={{ fontSize: 18 }}>⛵</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{b.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--c-text-4)' }}>{[b.type, b.length, b.year].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Recent routes */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Recent Routes
                  </div>
                  {profileData.recentRoutes.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--c-text-4)' }}>No routes yet</div>
                  ) : profileData.recentRoutes.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--c-surface)', borderRadius: 12, border: '1px solid var(--c-border)', marginBottom: 6 }}>
                      <Icon name="pin" size={16} color={accentColor} sw={2}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.from && r.to ? `${r.from} → ${r.to}` : (r.from || r.to || 'Route')}
                        </div>
                        {r.date && <div style={{ fontSize: 11, color: 'var(--c-text-4)' }}>{new Date(r.date).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button onClick={() => setProfileCard(null)} style={{
              all: 'unset', cursor: 'pointer', textAlign: 'center',
              padding: '12px', borderRadius: 14, background: 'var(--c-surface)',
              border: '1px solid var(--c-border)', fontSize: 14, fontWeight: 600, color: 'var(--c-text-3)',
            }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBar({ tab, setTab, accent, chatUnread = 0 }) {
  const tabs = [
    { id: 'home',     label: 'Home',     icon: 'home'     },
    { id: 'trip',     label: 'Trip',     icon: 'compass'  },
    { id: 'chat',     label: 'Radio',    icon: 'chat'     },
    { id: 'boat',     label: 'Boat',     icon: 'boat'     },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: 28, paddingTop: 6,
      background: 'linear-gradient(180deg, rgba(10,20,32,0) 0%, var(--c-bg) 30%)',
      zIndex: 600,
    }}>
      <div style={{
        margin: '0 16px', height: 60, borderRadius: 22,
        background: 'rgba(19, 32, 46, 0.92)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'stretch',
      }}>
        {tabs.map(t => {
          const on = tab === t.id;
          const badge = t.id === 'chat' && chatUnread > 0 && !on;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              all: 'unset', cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, color: on ? accent : 'var(--c-text-3)',
            }}>
              <div style={{ position: 'relative' }}>
                <Icon name={t.icon} size={22} sw={on ? 2.2 : 1.8}/>
                {badge && (
                  <div style={{
                    position: 'absolute', top: -3, right: -4,
                    minWidth: 14, height: 14, borderRadius: 99,
                    background: '#EF4444', color: 'white',
                    fontSize: 8.5, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    paddingInline: 2,
                  }}>{chatUnread > 9 ? '9+' : chatUnread}</div>
                )}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em' }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // ── Auth state ──
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('safeseas_token'));
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  // ── Settings state ──
  const [colorMode, setColorMode] = useState(() => localStorage.getItem('safeseas_color_mode') || 'dark');
  const [profileColor, setProfileColor] = useState('#22E3D0');

  const AVATAR_COLORS = ['#22E3D0', '#38BDF8', '#A78BFA', '#F472B6', '#34D399', '#FB923C', '#F5B547', '#2DD4BF'];

  function applyUserPrefs(u) {
    setDisclaimerAccepted(localStorage.getItem(`safeseas_disclaimer_${u.id}`) === '1');
    const stored = localStorage.getItem(`safeseas_profile_color_${u.id}`);
    if (stored) {
      setProfileColor(stored);
    } else {
      const color = AVATAR_COLORS[u.id % AVATAR_COLORS.length];
      setProfileColor(color);
      localStorage.setItem(`safeseas_profile_color_${u.id}`, color);
    }
  }

  // Apply/remove .light class on <html> so CSS variables resolve correctly.
  useEffect(() => {
    document.documentElement.classList.toggle('light', colorMode === 'light');
  }, [colorMode]);

  // ── App state ──
  const [tab, setTab] = useState('home');
  const [chatUnread, setChatUnread] = useState(0);
  const [boat, setBoat] = useState(null);
  const [boats, setBoats] = useState([]);
  const [presetBoats, setPresetBoats] = useState([]);
  const [trips, setTrips] = useState([]);
  const [route, setRoute] = useState({ from: 'Anna Maria Island', to: 'Egmont Key' });
  const [currentTrip, setCurrentTrip] = useState(null);
  const [routeSafety, setRouteSafety] = useState(null);
  const [routingActive, setRoutingActive] = useState(false);
  const homeStatus = routeSafety?.verdict || t.verdict;

  // ── Global GPS (runs on all tabs so Home nearby uses real position) ──
  const [appUserPos, setAppUserPos] = useState(null);
  const appGpsWatchRef = useRef(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    appGpsWatchRef.current = navigator.geolocation.watchPosition(
      pos => setAppUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (appGpsWatchRef.current != null) navigator.geolocation.clearWatch(appGpsWatchRef.current);
    };
  }, []);

  const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  // Verify token on mount
  useEffect(() => {
    if (!authToken) { setAuthChecked(true); return; }
    fetch(`${API}/api/auth/me`, { headers: authHeaders })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          applyUserPrefs(data.user);
        } else {
          localStorage.removeItem('safeseas_token');
          setAuthToken(null);
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  // Load user data after login
  useEffect(() => {
    if (!user || !authToken) return;

    async function load() {
      try {
        const [bRes, tRes, pRes] = await Promise.all([
          fetch(`${API}/api/boats`, { headers: authHeaders }),
          fetch(`${API}/api/trips`, { headers: authHeaders }),
          fetch(`${API}/api/presets`),
        ]);
        if (bRes.ok) {
          const b = await bRes.json();
          if (Array.isArray(b)) { setBoats(b); if (b.length && !boat) setBoat(b[0]); }
        }
        if (tRes.ok) {
          const tr = await tRes.json();
          if (Array.isArray(tr)) setTrips(tr);
        }
        if (pRes.ok) {
          const p = await pRes.json();
          if (Array.isArray(p)) setPresetBoats(p);
        }
      } catch (err) {
        console.warn('Failed to load user data', err);
      }
    }
    load();
  }, [user]);

  const handleLogin = (token, loggedInUser) => {
    setAuthToken(token);
    setUser(loggedInUser);
    applyUserPrefs(loggedInUser);
  };

  const handleDisclaimerAccept = () => {
    if (user) localStorage.setItem(`safeseas_disclaimer_${user.id}`, '1');
    setDisclaimerAccepted(true);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/api/auth/logout`, { method: 'POST', headers: authHeaders });
    } catch {}
    localStorage.removeItem('safeseas_token');
    setAuthToken(null);
    setUser(null);
    setDisclaimerAccepted(false);
    setProfileColor('#22E3D0');
    setBoat(null);
    setBoats([]);
    setTrips([]);
    setRouteSafety(null);
    setCurrentTrip(null);
  };

  const handleColorModeChange = (mode) => {
    setColorMode(mode);
    localStorage.setItem('safeseas_color_mode', mode);
  };

  const handleProfileColorChange = (color) => {
    setProfileColor(color);
    if (user) localStorage.setItem(`safeseas_profile_color_${user.id}`, color);
  };

  async function deleteAccount(password) {
    const res = await fetch(`${API}/api/auth/account`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete account');
    }
    if (user) {
      localStorage.removeItem(`safeseas_disclaimer_${user.id}`);
      localStorage.removeItem(`safeseas_profile_color_${user.id}`);
    }
    localStorage.removeItem('safeseas_token');
    setAuthToken(null);
    setUser(null);
    setBoat(null);
    setBoats([]);
    setTrips([]);
    setRouteSafety(null);
    setCurrentTrip(null);
  }

  async function addBoat(boatObj) {
    try {
      const res = await fetch(`${API}/api/boats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(boatObj),
      });
      if (res.ok) {
        const bRes = await fetch(`${API}/api/boats`, { headers: authHeaders });
        if (bRes.ok) {
          const b = await bRes.json();
          setBoats(b);
          if (b.length) setBoat(prev => prev || b[0]);
        }
      }
    } catch (err) {
      console.warn('Failed to add boat', err);
    }
  }

  async function deleteBoat(boatId) {
    try {
      await fetch(`${API}/api/boats/${boatId}`, { method: 'DELETE', headers: authHeaders });
      const bRes = await fetch(`${API}/api/boats`, { headers: authHeaders });
      if (bRes.ok) {
        const b = await bRes.json();
        setBoats(b);
        if (boat?.id === boatId) setBoat(b[0] || null);
      }
    } catch (err) {
      console.warn('Failed to delete boat', err);
    }
  }

  async function checkSafety(boatToCheck, routeToCheck, departureTime) {
    try {
      const res = await fetch(`${API}/api/safety-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ boat: boatToCheck, route: routeToCheck, departureTime }),
      });
      if (res.ok) {
        const data = await res.json();
        setRouteSafety(data);
        return data;
      }
    } catch (err) {
      console.warn('Failed to calculate route safety', err);
    }
    return null;
  }

  async function planRoute(routeData) {
    setRouteSafety(null);
    // Build full route — reuse existing coords when text is unchanged, geocode otherwise
    let full = { ...routeData };
    if (route.from === routeData.from && route.fromLat) { full.fromLat = route.fromLat; full.fromLon = route.fromLon; }
    if (route.to   === routeData.to   && route.toLat)   { full.toLat   = route.toLat;   full.toLon   = route.toLon;   }
    const needFrom = !full.fromLat;
    const needTo   = !full.toLat;
    if (needFrom || needTo) {
      try {
        const fetches = [];
        if (needFrom) fetches.push(fetch(`${API}/api/geocode?q=${encodeURIComponent(routeData.from)}`).then(r => r.ok ? r.json() : []));
        if (needTo)   fetches.push(fetch(`${API}/api/geocode?q=${encodeURIComponent(routeData.to)}`).then(r => r.ok ? r.json() : []));
        const results = await Promise.all(fetches);
        let i = 0;
        if (needFrom && results[i]?.[0]) { full.fromLat = results[i][0].lat; full.fromLon = results[i][0].lon; i++; }
        if (needTo   && results[i]?.[0]) { full.toLat   = results[i][0].lat; full.toLon   = results[i][0].lon; }
      } catch (err) { console.warn('Route geocode failed', err); }
    }

    // Switch to trip tab immediately
    setRoute(full);
    setCurrentTrip(null);
    setTab('trip');

    // Safety check and maritime routing run independently — neither blocks the other
    checkSafety(boat, full);

    if (full.fromLat && full.toLat) {
      setRoutingActive(true);
      fetch(`${API}/api/maritime-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromLat: full.fromLat, fromLon: full.fromLon, toLat: full.toLat, toLon: full.toLon }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(maritime => {
          setRoutingActive(false);
          if (maritime) {
            setRoute(prev => ({
              ...prev,
              waypoints:   maritime.waypoints   || null,
              fromSnapped: maritime.fromSnapped || null,
              toSnapped:   maritime.toSnapped   || null,
            }));
          }
        })
        .catch(() => setRoutingActive(false));
    }
  }

  async function saveTrip(trip) {
    try {
      const res = await fetch(`${API}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(trip),
      });
      if (res.ok) {
        const json = await res.json();
        const tRes = await fetch(`${API}/api/trips`, { headers: authHeaders });
        if (tRes.ok) {
          const tr = await tRes.json();
          setTrips(tr);
          const savedTrip = tr.find(item => item.id === json.id);
          setCurrentTrip(savedTrip || trip);
        }
      }
    } catch (err) {
      console.warn('Failed to save trip', err);
    }
  }

  // ── Render ──

  if (!authChecked) {
    return (
      <div style={{
        minHeight: '100vh', width: '100%',
        background: 'var(--c-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Inter", -apple-system, "SF Pro Text", system-ui, sans-serif',
      }}>
        <IOSDevice statusBar={<IOSStatusBar dark={colorMode === 'dark'} time="9:14"/>}>
          <div style={{
            position: 'absolute', inset: 0, background: 'var(--c-bg)',
            display: 'grid', placeItems: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: `${t.accent}1A`, border: `1.5px solid ${t.accent}44`, display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                <Icon name="boat" size={24} color={t.accent}/>
              </div>
              <div style={{ fontSize: 13, color: 'var(--c-text-4)' }}>Loading…</div>
            </div>
          </div>
        </IOSDevice>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      background: 'var(--c-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 12px',
      fontFamily: '"Inter", -apple-system, "SF Pro Text", system-ui, sans-serif',
    }}>
      <IOSDevice statusBar={<IOSStatusBar dark={colorMode === 'dark'} time="9:14"/>}>
        <div data-screen-label={`SafeSeas — ${user ? tab : 'login'}`} style={{
          position: 'absolute', inset: 0,
          background: 'var(--c-bg)', color: 'var(--c-text)',
          overflow: 'hidden',
        }}>
          {!user ? (
            <LoginScreen accent={t.accent} onLogin={handleLogin}/>
          ) : !disclaimerAccepted ? (
            <DisclaimerScreen accent={t.accent} onAccept={handleDisclaimerAccept}/>
          ) : (
            <>
              {tab === 'trip' ? (
                <div style={{ position: 'absolute', inset: 0, paddingBottom: 100 }}>
                  <TripScreen
                    accent={t.accent} boat={boat}
                    verdict={routeSafety?.verdict || t.verdict}
                    pulse={t.pulseVerdict}
                    route={currentTrip ? { from: currentTrip.from, to: currentTrip.to } : route}
                    currentTrip={currentTrip}
                    routeSafety={routeSafety}
                    routingActive={routingActive}
                    onSave={saveTrip}
                    onPlan={planRoute}
                    onPinSet={(type, lat, lon, name) => {
                      const r = route;
                      const updated = type === 'from'
                        ? { from: name, fromLat: lat, fromLon: lon, to: r.to, toLat: r.toLat, toLon: r.toLon }
                        : { from: r.from, fromLat: r.fromLat, fromLon: r.fromLon, to: name, toLat: lat, toLon: lon };
                      planRoute({ ...updated, waypoints: null, fromSnapped: null, toSnapped: null });
                    }}
                  />
                </div>
              ) : tab === 'chat' ? (
                <div style={{ position: 'absolute', inset: 0, paddingBottom: 100 }}>
                  <ChatScreen
                    accent={t.accent}
                    authToken={authToken}
                    user={user}
                    routeDep={route?.fromLat ? [parseFloat(route.fromLat), parseFloat(route.fromLon)] : null}
                    onNewMessage={() => setChatUnread(n => n + 1)}
                  />
                </div>
              ) : (
                <div style={{ position: 'absolute', inset: 0, overflow: 'auto', paddingBottom: 110 }}>
                  {tab === 'home' && (
                    <HomeScreen
                      accent={t.accent} boat={boat} boats={boats}
                      currentStatus={homeStatus} routeSafety={routeSafety}
                      route={currentTrip ? { from: currentTrip.from, to: currentTrip.to } : route}
                      onPlan={planRoute}
                      onTrip={(trip) => {
                        setCurrentTrip(trip);
                        setRoute({ from: trip.from || 'Anna Maria Island', to: trip.to || 'Egmont Key' });
                        setTab('trip');
                      }}
                      onUpdateRoute={(partial) => setRoute(r => ({
                        ...r, ...partial,
                        // Clear computed route whenever endpoints change so stale waypoints don't linger
                        waypoints: null, fromSnapped: null, toSnapped: null,
                      }))}
                      userPos={appUserPos}
                      onRouteTo={({ name, lat, lon }) => {
                        const depLat = appUserPos?.lat ?? route.fromLat;
                        const depLon = appUserPos?.lng ?? route.fromLon;
                        const depName = appUserPos ? 'My Location' : route.from;
                        planRoute({
                          from: depName, fromLat: String(depLat), fromLon: String(depLon),
                          to: name, toLat: String(lat), toLon: String(lon),
                        });
                      }}
                      onSelectBoat={(b) => setBoat(b)}
                      onPickBoat={() => setTab('boat')}
                      trips={trips}
                      user={user}
                      onSettings={() => setTab('settings')}
                      profileColor={profileColor}
                    />
                  )}
                  {tab === 'boat' && (
                    <BoatScreen
                      accent={t.accent} boat={boat} setBoat={setBoat}
                      boats={boats} addBoat={addBoat} deleteBoat={deleteBoat}
                      presetBoats={presetBoats}
                      user={user}
                    />
                  )}
                  {tab === 'settings' && (
                    <SettingsScreen
                      accent={t.accent}
                      user={user}
                      onLogout={handleLogout}
                      profileColor={profileColor}
                      onProfileColorChange={handleProfileColorChange}
                      colorMode={colorMode}
                      onColorModeChange={handleColorModeChange}
                      onDeleteAccount={deleteAccount}
                      authToken={authToken}
                    />
                  )}
                </div>
              )}
              <TabBar tab={tab} setTab={(id) => { setTab(id); if (id === 'chat') setChatUnread(0); }} accent={t.accent} chatUnread={chatUnread}/>
            </>
          )}
        </div>
      </IOSDevice>

      <TweaksPanel>
        <TweakSection label="Accent color"/>
        <TweakColor
          label="Route & active"
          value={t.accent}
          options={[ACCENT_OPTIONS.cyan, ACCENT_OPTIONS.teal, ACCENT_OPTIONS.sky, ACCENT_OPTIONS.amber]}
          onChange={v => setTweak('accent', v)}
        />
        <TweakSection label="Trip verdict"/>
        <TweakRadio
          label="Today's call"
          value={t.verdict}
          options={['go', 'wait', 'nogo']}
          onChange={v => setTweak('verdict', v)}
        />
        <TweakToggle
          label="Pulse verdict pill"
          value={t.pulseVerdict}
          onChange={v => setTweak('pulseVerdict', v)}
        />
        <TweakSection label="Jump to"/>
        <div style={{ display: 'flex', gap: 6, padding: '4px 12px 10px' }}>
          {['home','trip','boat','settings'].map(id => (
            <button key={id} onClick={() => setTab(id)} style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
              padding: '7px 0', borderRadius: 8,
              background: tab === id ? '#29261b' : 'rgba(0,0,0,0.05)',
              color: tab === id ? '#fff' : '#29261b',
              fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize',
            }}>{id}</button>
          ))}
        </div>
      </TweaksPanel>
    </div>
  );
}

export default App
