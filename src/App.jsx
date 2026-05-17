import React, { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
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
      background: '#13202E',
      border: '1px solid #1E2F42',
      borderRadius: 18,
      padding: 18,
      ...style,
    }}>{children}</div>
  );
}

function ConditionTile({ icon, label, value, unit, sub, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 16px',
      background: '#0F1A26', borderRadius: 14, border: '1px solid #1B2C40',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#7E94AE' }}>
        <Icon name={icon} size={14} sw={2}/>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: '#F1F5F9', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: 12, color: '#7E94AE', fontWeight: 600 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: '#7E94AE', fontVariantNumeric: 'tabular-nums' }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Boat artwork
// ─────────────────────────────────────────────────────────────
function BoatArt({ type, color = '#F1F5F9', size = 80 }) {
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
// LIVE MAP — Leaflet + OpenSeaMap + GPS + AIS vessel traffic
// ─────────────────────────────────────────────────────────────
const AISSTREAM_KEY = import.meta.env.VITE_AISSTREAM_KEY || '';

function _vesselColor(typeCode) {
  if (typeCode >= 60 && typeCode <= 69) return '#4ADE80'; // passenger
  if (typeCode >= 70 && typeCode <= 79) return '#38BDF8'; // cargo
  if (typeCode >= 80 && typeCode <= 89) return '#F87171'; // tanker
  if (typeCode === 30)                  return '#FB923C'; // fishing
  if (typeCode === 36 || typeCode === 37) return '#818CF8'; // sailing
  return '#94A3B8';
}

function _vesselIcon(cog, color) {
  return L.divIcon({
    className: '',
    html: `<svg width="14" height="18" viewBox="0 0 14 18" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(${(cog || 0)}deg);display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))"><polygon points="7,0 14,18 7,13 0,18" fill="${color}"/></svg>`,
    iconSize: [14, 18],
    iconAnchor: [7, 9],
  });
}

const _gpsIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:#4F9FFF;border:3px solid white;border-radius:50%;box-shadow:0 0 0 5px rgba(79,159,255,0.28),0 2px 6px rgba(0,0,0,0.5)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function _dotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;background:white;border:2.5px solid ${color};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

function _pinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="16" height="22" viewBox="0 0 16 22" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5))"><path d="M8 0C3.6 0 0 3.6 0 8c0 5.4 8 14 8 14s8-8.6 8-14c0-4.4-3.6-8-8-8z" fill="${color}"/><circle cx="8" cy="8" r="3.5" fill="white"/></svg>`,
    iconSize: [16, 22],
    iconAnchor: [8, 22],
  });
}

function MapFollower({ position, follow }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!follow || !position) return;
    const { lat, lng } = position;
    if (prev.current && Math.abs(prev.current.lat - lat) < 0.00005 && Math.abs(prev.current.lng - lng) < 0.00005) return;
    prev.current = { lat, lng };
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [position, follow]);
  return null;
}

function LiveMap({ route, accent, routingActive }) {
  const [userPos, setUserPos] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [follow, setFollow] = useState(false);
  const [vessels, setVessels] = useState({});
  const [gpsError, setGpsError] = useState(null);
  const [aisConnected, setAisConnected] = useState(false);
  const watchRef = useRef(null);
  const wsRef = useRef(null);

  const defaultCenter = [27.4976, -82.7196];
  const fromCoords = route?.fromLat ? [parseFloat(route.fromLat), parseFloat(route.fromLon)] : null;
  const toCoords   = route?.toLat   ? [parseFloat(route.toLat),   parseFloat(route.toLon)]   : null;
  // Snapped marina coords override the raw geocoded point for markers
  const depCoords = route?.fromSnapped ? [route.fromSnapped.lat, route.fromSnapped.lon] : fromCoords;
  const arrCoords = route?.toSnapped   ? [route.toSnapped.lat,   route.toSnapped.lon]   : toCoords;
  const center = userPos
    ? [userPos.lat, userPos.lng]
    : (depCoords || defaultCenter);

  const startGPS = () => {
    if (!navigator.geolocation) { setGpsError('GPS not supported by this browser'); return; }
    setGpsError(null);
    watchRef.current = navigator.geolocation.watchPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => setGpsError('Location access denied — check browser permissions'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
    );
    setTracking(true);
    setFollow(true);
  };

  const stopGPS = () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    setTracking(false);
    setFollow(false);
    setUserPos(null);
    watchRef.current = null;
  };

  // AIS center: prefer live GPS, fall back to route departure point
  const aisCenter = userPos
    ? { lat: userPos.lat, lng: userPos.lng }
    : (depCoords ? { lat: depCoords[0], lng: depCoords[1] } : null);

  // AIS WebSocket — resubscribes when center moves ~0.1°
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

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapContainer center={center} zoom={12} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        <TileLayer url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png" opacity={0.85}/>

        {/* Route line — maritime waypoints when available, straight-line fallback */}
        {route?.waypoints?.length >= 2 && (
          <Polyline positions={route.waypoints} color={accent} weight={3} dashArray="10 6" opacity={0.9}/>
        )}
        {!route?.waypoints && depCoords && arrCoords && (
          <Polyline positions={[depCoords, arrCoords]} color={accent} weight={3} dashArray="10 6" opacity={0.9}/>
        )}

        {depCoords && (
          <Marker position={depCoords} icon={_dotIcon(accent)}>
            <Popup>
              <strong>Departure</strong>{route?.fromSnapped?.name ? <><br/><span style={{ fontSize: 12 }}>{route.fromSnapped.name}</span></> : null}
              <br/><span style={{ fontSize: 11, color: '#888' }}>{route?.from}</span>
            </Popup>
          </Marker>
        )}
        {arrCoords && (
          <Marker position={arrCoords} icon={_pinIcon(accent)}>
            <Popup>
              <strong>Destination</strong>{route?.toSnapped?.name ? <><br/><span style={{ fontSize: 12 }}>{route.toSnapped.name}</span></> : null}
              <br/><span style={{ fontSize: 11, color: '#888' }}>{route?.to}</span>
            </Popup>
          </Marker>
        )}

        {vesselList.map(v => (
          <Marker key={v.mmsi} position={[v.lat, v.lng]} icon={_vesselIcon(v.cog, _vesselColor(v.shipType))}>
            <Popup>
              <div style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{v.name}</div>
                <div style={{ fontSize: 12 }}>Speed: {v.sog?.toFixed(1) ?? '—'} kt</div>
                <div style={{ fontSize: 12 }}>Course: {v.cog != null ? Math.round(v.cog) : '—'}°</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>MMSI {v.mmsi}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {userPos && (
          <Marker position={[userPos.lat, userPos.lng]} icon={_gpsIcon}>
            <Popup>You are here<br/><span style={{ fontSize: 11 }}>±{Math.round(userPos.acc)} m accuracy</span></Popup>
          </Marker>
        )}

        <MapFollower position={userPos} follow={follow}/>
      </MapContainer>

      {/* GPS tracking button */}
      <button
        onClick={tracking ? stopGPS : startGPS}
        style={{
          position: 'absolute', bottom: 228, right: 14, zIndex: 1000,
          width: 44, height: 44, borderRadius: 12,
          background: tracking ? '#4F9FFF' : 'rgba(10,20,32,0.9)',
          border: `1.5px solid ${tracking ? '#4F9FFF' : '#1E2F42'}`,
          display: 'grid', placeItems: 'center', cursor: 'pointer',
          boxShadow: tracking ? '0 0 0 4px rgba(79,159,255,0.25),0 4px 14px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tracking ? 'white' : '#7E94AE'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        </svg>
      </button>

      {/* Follow mode chip */}
      {tracking && (
        <button onClick={() => setFollow(f => !f)} style={{
          position: 'absolute', bottom: 280, right: 14, zIndex: 1000,
          padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
          background: 'rgba(10,20,32,0.9)', border: `1px solid ${follow ? '#4F9FFF' : '#1E2F42'}`,
          color: follow ? '#4F9FFF' : '#7E94AE', fontSize: 11.5, fontWeight: 600,
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
          background: 'rgba(10,20,32,0.92)', border: '1px solid #1E2F42',
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
          background: 'rgba(10,20,32,0.9)', border: '1px solid #1E2F42',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: 99, background: '#4ADE80', boxShadow: '0 0 6px #4ADE80' }}/>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#F1F5F9' }}>{vesselList.length} vessels nearby</span>
        </div>
      )}

      {/* GPS error */}
      {gpsError && (
        <div style={{
          position: 'absolute', bottom: 330, left: 14, right: 14, zIndex: 1000,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(63,20,24,0.95)', border: '1px solid #7A2530',
          color: '#FF6B6B', fontSize: 13,
        }}>
          {gpsError}
        </div>
      )}

      {/* Map attribution (small) */}
      <div style={{
        position: 'absolute', bottom: 8, left: 8, zIndex: 1000,
        fontSize: 9, color: 'rgba(255,255,255,0.4)',
      }}>
        © OpenStreetMap · OpenSeaMap
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
        <circle r="6" fill="#0A1420" stroke={accent} strokeWidth="2.5"/>
      </g>
      <text x="96" y="424" fill="#F1F5F9" fontSize="11" fontWeight="600" fontFamily="ui-sans-serif">{from}</text>
      <text x="96" y="438" fill="#7E94AE" fontSize="9.5" fontFamily="ui-monospace">{from}</text>
      <g transform="translate(180 260)">
        <circle r="13" fill={accent} opacity="0.18"/>
        <circle r="13" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5"/>
        <path d="M0 -16 L4 -8 L-4 -8 Z" fill={accent}/>
        <circle r="4" fill={accent}/>
      </g>
      <text x="200" y="258" fill="#F1F5F9" fontSize="11" fontWeight="600" fontFamily="ui-sans-serif">{to}</text>
      <text x="200" y="272" fill="#7E94AE" fontSize="9.5" fontFamily="ui-monospace">{to}</text>
      <g transform="translate(345 50)" opacity="0.55">
        <circle r="18" fill="none" stroke="#2A4258" strokeWidth="0.8"/>
        <path d="M0 -14 L3 0 L0 14 L-3 0 Z" fill="#5B7791"/>
        <path d="M0 -14 L3 0 L0 0 Z" fill="#F1F5F9"/>
        <text y="-22" textAnchor="middle" fontSize="9" fill="#5B7791" fontFamily="ui-monospace">N</text>
      </g>
      <g transform="translate(24 558)" fontFamily="ui-monospace" fontSize="9" fill="#5B7791">
        <line x1="0" y1="0" x2="60" y2="0" stroke="#5B7791" strokeWidth="1"/>
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#5B7791" strokeWidth="1"/>
        <line x1="60" y1="-4" x2="60" y2="4" stroke="#5B7791" strokeWidth="1"/>
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
    background: '#0F1A26',
    border: '1px solid #1B2C40',
    borderRadius: 14,
    padding: '14px 16px',
    color: '#F1F5F9',
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
      background: (disabled || loading) ? '#1A2D40' : accent,
      color: (disabled || loading) ? '#7E94AE' : '#06151E',
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
      fontSize: 13, color: '#7E94AE', fontWeight: 600, marginBottom: 20,
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
      <div style={{ fontSize: 26, color: '#F1F5F9', fontWeight: 800, letterSpacing: '-0.03em' }}>Safe Seas</div>
      <div style={{ fontSize: 13, color: '#7E94AE', marginTop: 4, letterSpacing: '0.02em' }}>Your boating go/no-go companion</div>
    </div>
  );

  // ──────────────────────────────────────────────────────────
  // FORGOT PASSWORD — Step 1: enter email
  // ──────────────────────────────────────────────────────────
  if (mode === 'fp-email') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#0A1420', display: 'flex', flexDirection: 'column', padding: '28px 24px', overflowY: 'auto' }}>
        <BackBtn onClick={resetFp}/>
        <Branding/>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 18, color: '#F1F5F9', fontWeight: 700, marginBottom: 6 }}>Forgot your password?</div>
          <div style={{ fontSize: 13.5, color: '#7E94AE', lineHeight: 1.6 }}>Enter your account email and we'll send a 6-digit verification code.</div>
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
      <div style={{ position: 'absolute', inset: 0, background: '#0A1420', display: 'flex', flexDirection: 'column', padding: '28px 24px', overflowY: 'auto' }}>
        <BackBtn onClick={() => { setMode('fp-email'); setError(''); setFpCode(''); }}/>
        <Branding/>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 18, color: '#F1F5F9', fontWeight: 700, marginBottom: 6 }}>Check your email</div>
          <div style={{ fontSize: 13.5, color: '#7E94AE', lineHeight: 1.6 }}>
            We sent a 6-digit code to <span style={{ color: '#C5D2E0', fontWeight: 600 }}>{fpEmail}</span>. It expires in 15 minutes.
          </div>
        </div>
        {/* 6-digit OTP boxes */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {digits.map((d, i) => (
            <div key={i} style={{
              width: 44, height: 56, borderRadius: 12,
              background: '#0F1A26',
              border: `1.5px solid ${d ? accent : '#1B2C40'}`,
              display: 'grid', placeItems: 'center',
              fontSize: 24, fontWeight: 700, color: '#F1F5F9',
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
        <button onClick={sendCode} style={{ all: 'unset', cursor: 'pointer', marginTop: 16, textAlign: 'center', fontSize: 13, color: '#5B7791' }}>
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
      <div style={{ position: 'absolute', inset: 0, background: '#0A1420', display: 'flex', flexDirection: 'column', padding: '28px 24px', overflowY: 'auto' }}>
        <BackBtn onClick={() => { setMode('fp-code'); setError(''); }}/>
        <Branding/>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 18, color: '#F1F5F9', fontWeight: 700, marginBottom: 6 }}>Set a new password</div>
          <div style={{ fontSize: 13.5, color: '#7E94AE', lineHeight: 1.6 }}>Choose a strong password for your account.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="password" value={fpNewPass} onChange={e => { setFpNewPass(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && resetPassword()} placeholder="New password" autoComplete="new-password" style={inputStyle}/>
          <input type="password" value={fpConfirm} onChange={e => { setFpConfirm(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && resetPassword()} placeholder="Confirm new password" autoComplete="new-password" style={{
            ...inputStyle,
            borderColor: fpConfirm && fpNewPass !== fpConfirm ? '#7A2530' : fpConfirm && fpNewPass === fpConfirm ? '#1F6B4D' : '#1B2C40',
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
      <div style={{ position: 'absolute', inset: 0, background: '#0A1420', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 24px' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: '#0F3D2E', border: '1.5px solid #1F6B4D', display: 'grid', placeItems: 'center', marginBottom: 20 }}>
          <Icon name="check" size={30} color="#34E0A0" sw={2.2}/>
        </div>
        <div style={{ fontSize: 22, color: '#F1F5F9', fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Password updated!</div>
        <div style={{ fontSize: 13.5, color: '#7E94AE', lineHeight: 1.6, textAlign: 'center', marginBottom: 32 }}>
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
      background: '#0A1420',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '28px 24px',
      overflowY: 'auto',
    }}>
      <Branding/>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#0F1A26', borderRadius: 14, padding: 4, marginBottom: 24, width: '100%', border: '1px solid #1E2F42' }}>
        {['login', 'signup'].map(m => (
          <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
            all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
            padding: '10px 0', borderRadius: 10,
            background: mode === m ? '#1A2D40' : 'transparent',
            color: mode === m ? '#F1F5F9' : '#7E94AE',
            fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
            border: mode === m ? '1px solid #1E2F42' : '1px solid transparent',
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
        <p style={{ marginTop: 20, fontSize: 12.5, color: '#5B7791', textAlign: 'center', lineHeight: 1.5 }}>
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
      background: '#0A1420',
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
        <div style={{ fontSize: 22, color: '#F1F5F9', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Before you set sail
        </div>
      </div>

      {/* Disclaimer card */}
      <div style={{
        background: '#13202E',
        border: '1px solid #1E2F42',
        borderRadius: 18,
        padding: '20px 18px',
        marginBottom: 20,
        flex: 1,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: '#7E94AE', marginBottom: 14,
        }}>
          Liability Disclaimer
        </div>
        <div style={{ fontSize: 14.5, color: '#C5D2E0', lineHeight: 1.65 }}>
          Safe Seas is not liable for any damages or collisions while using our software. You use Safe Seas at your own risk.
        </div>
        <div style={{
          marginTop: 18, paddingTop: 16,
          borderTop: '1px solid #1E2F42',
          fontSize: 13, color: '#7E94AE', lineHeight: 1.6,
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
          background: checked ? accent : '#0F1A26',
          border: `1.5px solid ${checked ? accent : '#2A4258'}`,
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
        <span style={{ fontSize: 13.5, color: '#C5D2E0', lineHeight: 1.5 }}>
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
          background: checked ? accent : '#13202E',
          color: checked ? '#06151E' : '#3A5068',
          border: `1.5px solid ${checked ? accent : '#1E2F42'}`,
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
function HomeScreen({ accent, boat, boats = [], onPlan, onTrip, onSelectBoat, currentStatus, trips, route, onUpdateRoute, routeSafety, user, onSettings, profileColor, onPickBoat }) {
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
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#7E94AE', fontWeight: 600, textTransform: 'uppercase' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 22, color: '#F1F5F9', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>
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
        <label style={{ fontSize: 12, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.04em' }}>CREATE ROUTE</label>
        <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#13202E', borderRadius: 16, padding: '0 16px 0 16px', height: 60, border: `1px solid ${focus ? accent : '#1E2F42'}`, boxShadow: focus ? `0 0 0 4px ${accent}22` : 'none', transition: 'all 0.15s ease' }}>
              <Icon name="search" size={20} color={focus ? accent : '#7E94AE'}/>
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
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#F1F5F9', fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', fontFamily: 'inherit' }} />
            </div>
            {showFromSuggestions && fromSuggestions && fromSuggestions.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 68, background: '#0B1620', border: '1px solid #1E2F42', borderRadius: 10, zIndex: 40, padding: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.6)' }}>
                {fromSuggestions.map((s, i) => (
                  <div key={i} onMouseDown={() => selectFromSuggestion(i)} onMouseEnter={() => setFromActiveIndex(i)}
                    style={{ padding: '8px 10px', cursor: 'pointer', color: fromActiveIndex === i ? '#06151E' : '#C5D2E0', background: fromActiveIndex === i ? '#C5D2E0' : 'transparent', fontSize: 13 }}>{s.display_name}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#13202E', borderRadius: 16, padding: '0 16px 0 16px', height: 60, border: `1px solid ${focus ? accent : '#1E2F42'}`, boxShadow: focus ? `0 0 0 4px ${accent}22` : 'none', transition: 'all 0.15s ease' }}>
              <Icon name="pin" size={20} color={focus ? accent : '#7E94AE'}/>
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
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#F1F5F9', fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', fontFamily: 'inherit' }} />
            </div>
            {showToSuggestions && toSuggestions && toSuggestions.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 68, background: '#0B1620', border: '1px solid #1E2F42', borderRadius: 10, zIndex: 40, padding: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.6)' }}>
                {toSuggestions.map((s, i) => (
                  <div key={i} onMouseDown={() => selectToSuggestion(i)} onMouseEnter={() => setToActiveIndex(i)}
                    style={{ padding: '8px 10px', cursor: 'pointer', color: toActiveIndex === i ? '#06151E' : '#C5D2E0', background: toActiveIndex === i ? '#C5D2E0' : 'transparent', fontSize: 13 }}>{s.display_name}</div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, marginBottom: 6 }}>Popular destinations</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRESET_LOCATIONS.filter(p => !to || p.display_name.toLowerCase().includes(to.toLowerCase())).map((p, i) => (
                  <button key={i} onClick={() => applyPreset(p)} style={{ all: 'unset', cursor: 'pointer' }}>
                    <div style={{ padding: '8px 12px', borderRadius: 10, background: '#0F1A26', border: '1px solid #1E2F42', color: '#C5D2E0', fontSize: 13 }}>{p.display_name}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
          <div style={{ width: 64, height: 44, background: '#0F1A26', borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <BoatArt type={boat && boat.type ? boat.type : 'Center console'} color="#F1F5F9" size={40}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your boat</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: '#F1F5F9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {boat ? `${boat.year || ''} ${boat.name || ''}`.trim() : 'No boat added yet'}
                </div>
                <div style={{ fontSize: 12, color: '#7E94AE', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {boat ? `${boat.length || ''} · ${boat.type || ''}` : 'Add one in the Boat tab'}
                </div>
              </div>
              <div style={{ minWidth: 120, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button onClick={() => onPickBoat && onPickBoat()} style={{ all: 'unset', cursor: 'pointer' }}>
                  <div style={{ padding: '8px 12px', borderRadius: 10, background: '#0F1A26', border: '1px solid #1E2F42', color: accent, fontSize: 13, fontWeight: 700 }}>Manage boats</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: '#F1F5F9', fontWeight: 600 }}>Right now at {from}</span>
          <span style={{ fontSize: 11, color: '#7E94AE', fontVariantNumeric: 'tabular-nums' }}>updated 6 min ago</span>
        </div>
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <StatusPill status={currentStatus}/>
            <span style={{ fontSize: 11, color: '#7E94AE', fontVariantNumeric: 'tabular-nums' }}>{from} → {to}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ConditionTile icon="wind" label="Wind" value={routeSafety?.conditions?.wind != null ? routeSafety.conditions.wind : '—'} unit="kt" sub={routeSafety?.conditions?.gust != null ? `gusts ${routeSafety.conditions.gust}` : 'Forecast unavailable'} />
            <ConditionTile icon="wave" label="Waves" value={routeSafety?.conditions?.waveHeight != null ? routeSafety.conditions.waveHeight : '—'} unit="ft" sub={routeSafety?.conditions?.waveHeight != null ? `forecast` : 'Forecast unavailable'} />
            <ConditionTile icon="eye" label="Vis" value={routeSafety?.hourly?.[0]?.temperature || '—'} unit="" sub={routeSafety?.hourly?.[0]?.shortForecast || 'Forecast unavailable'} />
          </div>
        </Card>
      </div>

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
        <div style={{ fontSize: 13, color: '#F1F5F9', fontWeight: 600, marginBottom: 10 }}>Recent trips</div>
        {trips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#5B7791', fontSize: 13 }}>
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
                      <div style={{ width: 32, height: 32, borderRadius: 99, background: '#0F1A26', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Icon name="pin" size={16} color={(STATUS[status] && STATUS[status].fg) || '#34E0A0'} sw={2}/>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: '#F1F5F9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                        <div style={{ fontSize: 11.5, color: '#7E94AE', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{sub}</div>
                      </div>
                      <Icon name="chevron" size={16} color="#5B7791" sw={2}/>
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

// ─────────────────────────────────────────────────────────────
// TRIP DETAIL SCREEN
// ─────────────────────────────────────────────────────────────
function TripScreen({ accent, boat, verdict, pulse, onSave, onPlan, route, currentTrip, routeSafety, routingActive }) {
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

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <LiveMap accent={accent} route={route} routingActive={routingActive}/>

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100, zIndex: 500,
        background: 'linear-gradient(180deg, rgba(6,21,32,0.7), transparent)', pointerEvents: 'none' }}/>

      <div style={{ position: 'absolute', top: 12, left: 16, right: 16, zIndex: 500, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 10px',
          background: 'rgba(15,26,38,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 99, border: '1px solid #1E2F42' }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, border: `1.5px solid ${accent}`, background: '#06151E' }}/>
          <span style={{ fontSize: 12, color: '#F1F5F9', fontWeight: 600 }}>{route?.from || 'Start'}</span>
          <Icon name="arrow" size={12} color="#7E94AE" sw={2}/>
          <Icon name="pin" size={14} color={accent} sw={2}/>
          <span style={{ fontSize: 12, color: '#F1F5F9', fontWeight: 600 }}>{route?.to || 'Destination'}</span>
        </div>
      </div>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 500,
        background: 'linear-gradient(180deg, rgba(11,26,38,0.96), #0A1420 30%)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        borderTop: '1px solid #1E2F42',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
        height: sheetH,
        transition: 'height 0.35s cubic-bezier(.4,1.4,.6,1)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <button onClick={() => setSheetExpanded(!sheetExpanded)} style={{
          all: 'unset', cursor: 'pointer', padding: '10px 0 4px', display: 'flex', justifyContent: 'center',
        }}>
          <div style={{ width: 40, height: 5, borderRadius: 99, background: '#2A4258' }}/>
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
            <div style={{ fontSize: 28, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {verdict === 'go' && 'Clear all day.'}
              {verdict === 'wait' && 'Hold till afternoon.'}
              {verdict === 'nogo' && 'Stay at the dock.'}
            </div>
            <div style={{ fontSize: 14.5, color: '#C5D2E0', marginTop: 8, lineHeight: 1.4 }}>{copy.line}</div>
            {routeSafety && (
              <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: '#0E1D29', border: '1px solid #1C3246' }}>
                <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Safety details</div>
                {safetyReasons.length ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {safetyReasons.map((reason, index) => (
                      <div key={index} style={{ fontSize: 12, color: '#C5D2E0', lineHeight: 1.4 }}>• {reason}</div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#C5D2E0' }}>No critical safety issues detected for this route.</div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
            background: '#13202E', border: '1px solid #1E2F42', borderRadius: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}1F`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="clock" size={22} color={accent} sw={2}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Best window</div>
              <div style={{ fontSize: 17, color: '#F1F5F9', fontWeight: 700, marginTop: 2, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{bestWindow}</div>
            </div>
          </div>

          <div style={{ background: '#0F1A26', border: '1px solid #1E2F42', borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Plan your trip</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={fromValue} onChange={e => setFromValue(e.target.value)} placeholder="From" style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid #1E2F42', background: '#06121C', color: '#F1F5F9', fontSize: 15 }} />
              <input value={toValue} onChange={e => setToValue(e.target.value)} placeholder="To" style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid #1E2F42', background: '#06121C', color: '#F1F5F9', fontSize: 15 }} />
            </div>
            <button onClick={() => { setSaved(false); onPlan && onPlan({ from: fromValue, to: toValue }); }} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 18px', borderRadius: 15, background: accent, color: '#06151E', fontWeight: 700, fontSize: 15, textTransform: 'uppercase' }}>
              Plan route
            </button>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Conditions along the route
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ConditionTile icon="wind"   label="Depart"    value={startWind} unit="kt" sub={startSub}/>
              <ConditionTile icon="wind"   label="Arrival"   value={arrWindVal} unit="kt" sub={arrWindSub}/>
              <ConditionTile icon="anchor" label="Max depth" value={depthVal}   unit="ft" sub={depthSub}/>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Hourly wind · {(boat && boat.windLim) || 0} kt limit
            </div>
            <div style={{ position: 'relative', background: '#0F1A26', borderRadius: 14, border: '1px solid #1B2C40', padding: '16px 12px 10px' }}>
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
                  <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#7E94AE', fontVariantNumeric: 'tabular-nums' }}>{h.t}</div>
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
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#7E94AE', fontWeight: 600, textTransform: 'uppercase' }}>Profile</div>
        <div style={{ fontSize: 26, color: '#F1F5F9', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>My Boats</div>
      </div>

      {/* Active boat card */}
      <Card style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 92, height: 64, background: '#0F1A26', borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <BoatArt type={(boat && boat.type) || 'Center console'} color={accent} size={56}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Currently selected</div>
            <div style={{ fontSize: 17, color: '#F1F5F9', fontWeight: 700, marginTop: 4, letterSpacing: '-0.01em' }}>{boat ? `${boat.year || ''} ${boat.name || ''}`.trim() : 'No boat selected'}</div>
            <div style={{ fontSize: 12.5, color: '#7E94AE', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{boat ? `${boat.length || ''} · ${boat.type || ''}` : 'Add a boat below'}</div>
          </div>
        </div>
        {boat && (
          <div style={{ marginTop: 14, padding: 14, background: '#0F1A26', borderRadius: 12, border: '1px solid #1B2C40' }}>
            <div style={{ fontSize: 11.5, color: '#C5D2E0', lineHeight: 1.5 }}>
              Comfortable up to{' '}
              <span style={{ color: accent, fontWeight: 700 }}>{boat.waveLim || '—'} ft waves</span> and{' '}
              <span style={{ color: accent, fontWeight: 700 }}>{boat.windLim || '—'} kt winds</span>. SafeSeas uses these limits for go/no-go decisions.
            </div>
          </div>
        )}
      </Card>

      {/* User's boats */}
      {boats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#5B7791', fontSize: 13 }}>
          You haven't added any boats yet.
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: '#F1F5F9', fontWeight: 600, marginBottom: 10 }}>Your boats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {boats.map(b => {
              const active = boat && boat.id === b.id;
              return (
                <div key={b.id || b.name} style={{ position: 'relative' }}>
                  <button onClick={() => setBoat(b)} style={{
                    all: 'unset', cursor: 'pointer', display: 'block', width: '100%',
                    background: active ? `${accent}14` : '#13202E',
                    border: `1.5px solid ${active ? accent : '#1E2F42'}`,
                    borderRadius: 14, padding: '14px 12px 12px',
                    transition: 'all 0.18s ease',
                    boxShadow: active ? `0 0 0 4px ${accent}1A` : 'none',
                  }}>
                    <div style={{ height: 56, display: 'grid', placeItems: 'center' }}>
                      <BoatArt type={b.type || 'Center console'} color={active ? accent : '#C5D2E0'} size={50}/>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: '#F1F5F9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{b.name}</span>
                      {active && (
                        <span style={{ width: 18, height: 18, borderRadius: 99, background: accent, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          <Icon name="check" size={11} color="#06151E" sw={3}/>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#7E94AE', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {b.waveLim || '—'} ft · {b.windLim || '—'} kt
                    </div>
                  </button>
                  {/* Delete button */}
                  <button onClick={() => deleteBoat(b.id)} style={{
                    all: 'unset', cursor: 'pointer', position: 'absolute', top: 8, right: 8,
                    width: 22, height: 22, borderRadius: 99, background: '#0F1A26',
                    border: '1px solid #1E2F42', display: 'grid', placeItems: 'center',
                    color: '#5B7791',
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
          <div style={{ width: 32, height: 32, borderRadius: 99, background: '#0F1A26', display: 'grid', placeItems: 'center' }}>
            <Icon name="boat" size={16} color={accent} sw={2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: '#F1F5F9', fontWeight: 600 }}>Browse boat catalog</div>
            <div style={{ fontSize: 11.5, color: '#7E94AE', marginTop: 2 }}>Add from preset boats</div>
          </div>
          <div style={{ transform: catalogOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
            <Icon name="chevron" size={16} color="#5B7791" sw={2}/>
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
                  background: '#0F1A26', border: '1px solid #1B2C40',
                }}>
                  <div style={{ width: 44, height: 36, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <BoatArt type={p.type || 'Center console'} color="#7E94AE" size={32}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#F1F5F9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#7E94AE', marginTop: 2 }}>{p.type} · {p.length} · {p.waveLim} ft / {p.windLim} kt</div>
                  </div>
                  <button onClick={() => addFromPreset(p)} disabled={alreadyAdded} style={{
                    all: 'unset', cursor: alreadyAdded ? 'default' : 'pointer',
                    padding: '6px 12px', borderRadius: 8,
                    background: alreadyAdded ? '#13202E' : `${accent}22`,
                    border: `1px solid ${alreadyAdded ? '#1E2F42' : accent}`,
                    color: alreadyAdded ? '#5B7791' : accent,
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
          <div style={{ width: 32, height: 32, borderRadius: 99, background: '#0F1A26', display: 'grid', placeItems: 'center' }}>
            <Icon name="plus" size={18} color={accent} sw={2.2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: '#F1F5F9', fontWeight: 600 }}>Add custom boat</div>
            <div style={{ fontSize: 11.5, color: '#7E94AE', marginTop: 2 }}>Enter your own length, limits, and type</div>
          </div>
          <div style={{ transform: customOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
            <Icon name="chevron" size={16} color="#5B7791" sw={2}/>
          </div>
        </button>
        {customOpen && (
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Boat name"      placeholder="e.g. Reel Time"         value={custom.name}        onChange={v => setCustom({...custom, name: v})}/>
            <Field label="Year"           placeholder="e.g. 2022"              value={custom.year || ''}  onChange={v => setCustom({...custom, year: v})}/>
            <Field label="Length (ft)"    placeholder="22"                      value={custom.length}      onChange={v => setCustom({...custom, length: v})} numeric/>
            <Field label="Wave limit (ft)" placeholder="3.5"                   value={custom.waveLim || ''} onChange={v => setCustom({...custom, waveLim: parseFloat(v) || 0})} numeric />
            <Field label="Wind limit (kt)" placeholder="22"                    value={custom.windLim || ''} onChange={v => setCustom({...custom, windLim: parseFloat(v) || 0})} numeric />
            <Field label="Description"    placeholder="Optional description"    value={custom.description || ''} onChange={v => setCustom({...custom, description: v})} />
            <div>
              <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Type</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {types.map(t => (
                  <button key={t} onClick={() => setCustom({...custom, type: t})} style={{
                    all: 'unset', cursor: 'pointer',
                    padding: '6px 11px', borderRadius: 99,
                    background: custom.type === t ? `${accent}22` : '#0F1A26',
                    border: `1px solid ${custom.type === t ? accent : '#1B2C40'}`,
                    color: custom.type === t ? accent : '#C5D2E0',
                    fontSize: 12, fontWeight: 600,
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={async () => {
                if (!custom.name.trim()) return;
                await addBoat(custom);
                setCustom({ name: '', length: '', type: '', waveLim: 0, windLim: 0, description: '', year: '' });
                setCustomOpen(false);
              }} style={{ all: 'unset', cursor: 'pointer', padding: '10px 14px', background: accent, color: '#06151E', borderRadius: 10, fontWeight: 700 }}>Save boat</button>
              <button onClick={() => setCustomOpen(false)} style={{ all: 'unset', cursor: 'pointer', padding: '10px 14px', background: '#0F1A26', color: '#C5D2E0', borderRadius: 10 }}>Cancel</button>
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
      <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'numeric' : 'text'}
        style={{
          width: 'calc(100% - 28px)',
          background: '#0F1A26', border: '1px solid #1B2C40', borderRadius: 10,
          padding: '12px 14px', color: '#F1F5F9', fontSize: 15, outline: 'none',
          fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
        }}/>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// SETTINGS SCREEN
// ─────────────────────────────────────────────────────────────
const PROFILE_COLORS = ['#22E3D0', '#38BDF8', '#818CF8', '#F472B6', '#FB923C', '#4ADE80', '#FACC15', '#F87171'];

function SettingsScreen({ accent, user, onLogout, profileColor, onProfileColorChange, colorMode, onColorModeChange, onDeleteAccount }) {
  const [deleteMode, setDeleteMode] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

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
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#7E94AE', fontWeight: 600, textTransform: 'uppercase' }}>Account</div>
        <div style={{ fontSize: 26, color: '#F1F5F9', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>Settings</div>
      </div>

      {/* Profile card */}
      <div style={{ background: '#13202E', border: '1px solid #1E2F42', borderRadius: 18, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 20,
            background: profileColor, display: 'grid', placeItems: 'center', flexShrink: 0,
            boxShadow: `0 0 0 3px ${profileColor}44`,
          }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#06151E', lineHeight: 1 }}>{initial}</span>
          </div>
          <div>
            <div style={{ fontSize: 17, color: '#F1F5F9', fontWeight: 700 }}>{user?.name || 'Captain'}</div>
            <div style={{ fontSize: 12.5, color: '#5B7791', marginTop: 2 }}>{user?.email || ''}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Profile color</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {PROFILE_COLORS.map(c => (
            <button key={c} onClick={() => onProfileColorChange(c)} style={{
              all: 'unset', cursor: 'pointer',
              width: 32, height: 32, borderRadius: 99, background: c,
              outline: profileColor === c ? `3px solid #F1F5F9` : '3px solid transparent',
              outlineOffset: 2,
              boxShadow: profileColor === c ? `0 0 0 2px ${c}` : 'none',
              transition: 'all 0.15s',
            }}/>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <div style={{ background: '#13202E', border: '1px solid #1E2F42', borderRadius: 18, padding: '14px 18px' }}>
        <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Appearance</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, color: '#F1F5F9', fontWeight: 600 }}>Dark mode</div>
            <div style={{ fontSize: 12, color: '#5B7791', marginTop: 2 }}>Use the dark marine theme</div>
          </div>
          <button onClick={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')} style={{
            all: 'unset', cursor: 'pointer',
            width: 50, height: 28, borderRadius: 99,
            background: colorMode === 'dark' ? accent : '#2A4258',
            position: 'relative', transition: 'background 0.2s',
            boxShadow: colorMode === 'dark' ? `0 0 0 1px ${accent}66` : 'none',
            flexShrink: 0,
          }}>
            <div style={{
              position: 'absolute', top: 3, left: colorMode === 'dark' ? 25 : 3,
              width: 22, height: 22, borderRadius: 99, background: '#F1F5F9',
              transition: 'left 0.2s',
            }}/>
          </button>
        </div>
      </div>

      {/* Log out */}
      <button onClick={onLogout} style={{
        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px', borderRadius: 18,
        background: '#13202E', border: '1px solid #1E2F42',
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: '#0F1A26', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="logout" size={18} color="#FF6B6B" sw={2}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: '#F1F5F9', fontWeight: 600 }}>Log Out</div>
          <div style={{ fontSize: 12, color: '#5B7791', marginTop: 2 }}>{user?.email || ''}</div>
        </div>
        <Icon name="chevron" size={16} color="#5B7791" sw={2}/>
      </button>

      {/* Delete account */}
      {!deleteMode ? (
        <button onClick={() => setDeleteMode(true)} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', borderRadius: 18,
          background: '#13202E', border: '1px solid #1E2F42',
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: '#1A0A0A', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="trash" size={18} color="#FF6B6B" sw={2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: '#FF6B6B', fontWeight: 600 }}>Delete Account</div>
            <div style={{ fontSize: 12, color: '#5B7791', marginTop: 2 }}>Permanently remove your data</div>
          </div>
          <Icon name="chevron" size={16} color="#5B7791" sw={2}/>
        </button>
      ) : (
        <div style={{ background: '#3F1418', border: '1px solid #7A2530', borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 14, color: '#FF6B6B', fontWeight: 700, marginBottom: 6 }}>Delete your account?</div>
          <div style={{ fontSize: 13, color: '#C5D2E0', marginBottom: 16, lineHeight: 1.5 }}>
            This permanently deletes your account, boats, and trip history. This cannot be undone.
          </div>
          <input
            type="password"
            value={deletePassword}
            onChange={e => { setDeletePassword(e.target.value); setDeleteError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleDelete()}
            placeholder="Enter your password to confirm"
            style={{
              width: 'calc(100% - 32px)', background: '#06121C',
              border: '1px solid #7A2530', borderRadius: 10,
              padding: '12px 16px', color: '#F1F5F9', fontSize: 15,
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
              background: '#13202E', border: '1px solid #1E2F42',
              color: '#C5D2E0', fontSize: 14, fontWeight: 600,
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

function TabBar({ tab, setTab, accent }) {
  const tabs = [
    { id: 'home',     label: 'Home',     icon: 'home'     },
    { id: 'trip',     label: 'Trip',     icon: 'compass'  },
    { id: 'boat',     label: 'Boat',     icon: 'boat'     },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: 28, paddingTop: 6,
      background: 'linear-gradient(180deg, rgba(10,20,32,0) 0%, #0A1420 30%)',
      zIndex: 600,
    }}>
      <div style={{
        margin: '0 16px', height: 60, borderRadius: 22,
        background: 'rgba(19, 32, 46, 0.92)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid #1E2F42',
        display: 'flex', alignItems: 'stretch',
      }}>
        {tabs.map(t => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              all: 'unset', cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, color: on ? accent : '#7E94AE',
            }}>
              <Icon name={t.icon} size={22} sw={on ? 2.2 : 1.8}/>
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
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(
    () => localStorage.getItem('safeseas_disclaimer_accepted') === '1'
  );

  // ── Settings state ──
  const [colorMode, setColorMode] = useState(() => localStorage.getItem('safeseas_color_mode') || 'dark');
  const [profileColor, setProfileColor] = useState(() => localStorage.getItem('safeseas_profile_color') || '#22E3D0');

  // ── App state ──
  const [tab, setTab] = useState('home');
  const [boat, setBoat] = useState(null);
  const [boats, setBoats] = useState([]);
  const [presetBoats, setPresetBoats] = useState([]);
  const [trips, setTrips] = useState([]);
  const [route, setRoute] = useState({ from: 'Anna Maria Island', to: 'Egmont Key' });
  const [currentTrip, setCurrentTrip] = useState(null);
  const [routeSafety, setRouteSafety] = useState(null);
  const [routingActive, setRoutingActive] = useState(false);
  const homeStatus = routeSafety?.verdict || t.verdict;

  const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  // Verify token on mount
  useEffect(() => {
    if (!authToken) { setAuthChecked(true); return; }
    fetch(`${API}/api/auth/me`, { headers: authHeaders })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setUser(data.user);
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
  };

  const handleDisclaimerAccept = () => {
    localStorage.setItem('safeseas_disclaimer_accepted', '1');
    setDisclaimerAccepted(true);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/api/auth/logout`, { method: 'POST', headers: authHeaders });
    } catch {}
    localStorage.removeItem('safeseas_token');
    setAuthToken(null);
    setUser(null);
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
    localStorage.setItem('safeseas_profile_color', color);
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
    localStorage.removeItem('safeseas_token');
    localStorage.removeItem('safeseas_disclaimer_accepted');
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
        background: '#06121C',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Inter", -apple-system, "SF Pro Text", system-ui, sans-serif',
      }}>
        <IOSDevice statusBar={<IOSStatusBar dark={true} time="9:14"/>}>
          <div style={{
            position: 'absolute', inset: 0, background: '#0A1420',
            display: 'grid', placeItems: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: `${t.accent}1A`, border: `1.5px solid ${t.accent}44`, display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                <Icon name="boat" size={24} color={t.accent}/>
              </div>
              <div style={{ fontSize: 13, color: '#5B7791' }}>Loading…</div>
            </div>
          </div>
        </IOSDevice>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      background: '#06121C',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 12px',
      fontFamily: '"Inter", -apple-system, "SF Pro Text", system-ui, sans-serif',
    }}>
      <IOSDevice statusBar={<IOSStatusBar dark={true} time="9:14"/>}>
        <div data-screen-label={`SafeSeas — ${user ? tab : 'login'}`} style={{
          position: 'absolute', inset: 0,
          background: '#0A1420', color: '#F1F5F9',
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
                    />
                  )}
                </div>
              )}
              <TabBar tab={tab} setTab={setTab} accent={t.accent}/>
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
