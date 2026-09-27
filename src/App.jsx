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
  go:    { bg: '#ECFDF5', fg: '#15803D', border: '#86EFAC', label: 'SAFE TO GO' },
  wait:  { bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D', label: 'WAIT' },
  nogo:  { bg: '#FEF2F2', fg: '#B91C1C', border: '#FCA5A5', label: 'NO-GO' },
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
  if (typeCode >= 60 && typeCode <= 69) return '#4ADE80';   // Passenger — green
  if (typeCode >= 70 && typeCode <= 79) return '#38BDF8';   // Cargo — blue
  if (typeCode >= 80 && typeCode <= 89) return '#F87171';   // Tanker — red
  if (typeCode === 30)                  return '#FB923C';   // Fishing — orange
  if (typeCode === 36 || typeCode === 37) return '#818CF8'; // Sailing/Pleasure — purple
  return '#94A3B8';
}

function _vesselTypeName(typeCode) {
  if (!typeCode) return 'Unknown';
  if (typeCode === 30) return 'Fishing';
  if (typeCode === 31 || typeCode === 32) return 'Towing';
  if (typeCode === 33) return 'Dredging';
  if (typeCode === 34) return 'Diving ops';
  if (typeCode === 35) return 'Military';
  if (typeCode === 36) return 'Sailing';
  if (typeCode === 37) return 'Pleasure craft';
  if (typeCode >= 40 && typeCode <= 49) return 'High-speed craft';
  if (typeCode >= 50 && typeCode <= 59) return 'Special craft';
  if (typeCode >= 60 && typeCode <= 69) return 'Passenger';
  if (typeCode >= 70 && typeCode <= 79) return 'Cargo';
  if (typeCode >= 80 && typeCode <= 89) return 'Tanker';
  if (typeCode >= 90 && typeCode <= 99) return 'Other';
  return `Type ${typeCode}`;
}

function _mmsiToFlag(mmsi) {
  const mid = String(mmsi).slice(0, 3);
  const F = {
    '303':'🇺🇸','338':'🇺🇸','366':'🇺🇸','367':'🇺🇸','368':'🇺🇸','369':'🇺🇸','379':'🇺🇸',
    '316':'🇨🇦',
    '219':'🇩🇰','220':'🇩🇰',
    '232':'🇬🇧','233':'🇬🇧','234':'🇬🇧','235':'🇬🇧',
    '211':'🇩🇪','218':'🇩🇪',
    '226':'🇫🇷','227':'🇫🇷','228':'🇫🇷',
    '247':'🇮🇹',
    '257':'🇳🇴','258':'🇳🇴','259':'🇳🇴',
    '265':'🇸🇪','266':'🇸🇪',
    '273':'🇷🇺',
    '308':'🇧🇸','309':'🇧🇸','311':'🇧🇸','377':'🇧🇸',
    '319':'🇰🇾',
    '339':'🇲🇭',
    '351':'🇵🇦','352':'🇵🇦','353':'🇵🇦','354':'🇵🇦','355':'🇵🇦','356':'🇵🇦','357':'🇵🇦',
    '370':'🇵🇦','371':'🇵🇦','372':'🇵🇦','373':'🇵🇦',
    '374':'🇹🇹','376':'🇻🇮','378':'🇻🇬',
    '215':'🇲🇹','249':'🇲🇹',
    '431':'🇯🇵','432':'🇯🇵',
    '440':'🇰🇷','441':'🇰🇷',
    '477':'🇭🇰',
    '410':'🇨🇳','412':'🇨🇳','413':'🇨🇳',
    '563':'🇸🇬','564':'🇸🇬','565':'🇸🇬','566':'🇸🇬','567':'🇸🇬',
    '525':'🇮🇩',
    '636':'🇱🇷',
    '710':'🇧🇷','711':'🇧🇷',
    '503':'🇦🇺','512':'🇳🇿',
  };
  return F[mid] ?? '🏴';
}

// ── Vessel Detail Panel ───────────────────────────────────────────────────────
function VesselDetailPanel({ vessel, userPos, accent, onClose }) {
  if (!vessel) return null;

  const typeColor = _vesselColor(vessel.shipType);
  const typeName  = vessel.shipType > 0 ? _vesselTypeName(vessel.shipType) : null;
  const flag      = _mmsiToFlag(vessel.mmsi);

  const cpa     = (userPos && (vessel.sog ?? 0) > 0.2)
    ? _computeCPA(userPos.lat, userPos.lng, 0, 0, vessel.lat, vessel.lng, vessel.sog || 0, vessel.cog || 0)
    : null;
  const curDist = userPos ? _haversineNm(userPos.lat, userPos.lng, vessel.lat, vessel.lng) : null;
  const cpaWarn    = cpa && cpa.dNm < 0.5 && cpa.tMin > 0 && cpa.tMin < 20;
  const cpaCaution = cpa && cpa.dNm < 1.0 && cpa.tMin > 0 && cpa.tMin < 30;

  const ageS   = vessel.updatedAt ? Math.round((Date.now() - vessel.updatedAt) / 1000) : null;
  const ageStr = ageS == null ? null : ageS < 60 ? `${ageS}s ago` : `${Math.floor(ageS / 60)}m ago`;

  const history = vessel.speedHistory || [];
  const speeds  = history.map(h => h.sog);
  const maxSpd  = Math.max(...speeds, 0.5);

  const SLabel = { fontSize: 9.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 };
  const SVal   = { fontSize: 14, fontWeight: 700, color: '#0F172A' };
  const SUnit  = { fontSize: 11.5, fontWeight: 500, color: '#64748B', marginLeft: 3 };
  const SDivider = { borderTop: '1px solid #F1F5F9', margin: '0 0 12px 0' };

  const compassPt = (deg) => {
    if (deg == null) return '';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 284,
      background: 'white', borderLeft: '1px solid #E2E8F0',
      boxShadow: '-6px 0 20px rgba(0,0,0,0.13)',
      display: 'flex', flexDirection: 'column', zIndex: 600,
      fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', lineHeight: 1.2, marginBottom: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {flag} {vessel.name}
            </div>
            {typeName && (
              <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: typeColor, background: `${typeColor}18`, border: `1px solid ${typeColor}44`, borderRadius: 99, padding: '2px 9px' }}>
                {typeName}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: '#F1F5F9', color: '#64748B', fontSize: 15, flexShrink: 0 }}>✕</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px' }}>

        {/* Speed / Course / Distance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 6px', marginBottom: 14 }}>
          <div>
            <div style={SLabel}>Speed</div>
            <div style={SVal}>{vessel.sog?.toFixed(1) ?? '—'}<span style={SUnit}>kt</span></div>
          </div>
          <div>
            <div style={SLabel}>Course</div>
            <div style={SVal}>{vessel.cog != null ? `${Math.round(vessel.cog)}°` : '—'}<span style={SUnit}>{compassPt(vessel.cog)}</span></div>
          </div>
          {curDist != null && (
            <div>
              <div style={SLabel}>Distance</div>
              <div style={SVal}>{curDist.toFixed(2)}<span style={SUnit}>nm</span></div>
            </div>
          )}
          {ageStr && (
            <div>
              <div style={SLabel}>Updated</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: ageS > 120 ? '#F59E0B' : '#64748B' }}>{ageStr}</div>
            </div>
          )}
        </div>

        {/* Speed sparkline */}
        {speeds.length > 2 && (() => {
          const W = 256, H = 36;
          const pts = speeds.map((s, i) => `${((i / (speeds.length - 1)) * W).toFixed(1)},${(H - (s / maxSpd) * H).toFixed(1)}`).join(' ');
          const lastX = W, lastY = H - (speeds[speeds.length - 1] / maxSpd) * H;
          return (
            <div style={{ marginBottom: 14 }}>
              <div style={SLabel}>Speed History</div>
              <svg width={W} height={H + 2} viewBox={`0 0 ${W} ${H + 2}`} style={{ display: 'block' }}>
                <polyline points={pts} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.75"/>
                <circle cx={lastX} cy={lastY} r="3.5" fill={accent}/>
              </svg>
            </div>
          );
        })()}

        <div style={SDivider}/>

        {/* Vessel info */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Vessel Info</div>
        {[
          { label: 'MMSI',     val: vessel.mmsi },
          vessel.imo > 0    && { label: 'IMO',      val: vessel.imo },
          vessel.callsign   && { label: 'Callsign', val: vessel.callsign },
          vessel.dimLength > 0 && { label: 'Length', val: `${vessel.dimLength} m` },
        ].filter(Boolean).map(({ label, val }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #F8FAFC' }}>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{val}</span>
          </div>
        ))}

        {/* Destination */}
        {vessel.destination && (
          <div style={{ marginTop: 14 }}>
            <div style={SDivider}/>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Destination</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{vessel.destination}</div>
          </div>
        )}

        {/* CPA */}
        {cpa && (
          <div style={{ marginTop: 14 }}>
            <div style={SDivider}/>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Collision Risk (CPA)</div>
            <div style={{ background: cpaWarn ? '#FEF2F2' : cpaCaution ? '#FFFBEB' : '#F0FDF4', borderRadius: 10, padding: '10px 12px', border: `1px solid ${cpaWarn ? '#FCA5A5' : cpaCaution ? '#FCD34D' : '#86EFAC'}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: cpaWarn ? '#DC2626' : cpaCaution ? '#D97706' : '#16A34A', marginBottom: cpa.tMin < 120 ? 4 : 0 }}>
                {cpaWarn ? '⚠ Close Approach' : cpaCaution ? '⚡ Caution' : '✓ Clear'}
              </div>
              {cpa.tMin < 120 && (
                <div style={{ fontSize: 12, color: '#475569' }}>
                  CPA {cpa.dNm.toFixed(2)} nm · in {Math.round(cpa.tMin)} min
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// Returns { tMin: minutes to CPA, dNm: nm at CPA }
function _computeCPA(myLat, myLon, mySpeedKt, myCog, vLat, vLon, vSpeedKt, vCog) {
  const toRad = d => d * Math.PI / 180;
  const cosLat = Math.cos(toRad((myLat + vLat) / 2));
  const dx = (vLon - myLon) * 60 * cosLat;
  const dy = (vLat  - myLat) * 60;
  const myVx = (mySpeedKt || 0) * Math.sin(toRad(myCog || 0));
  const myVy = (mySpeedKt || 0) * Math.cos(toRad(myCog || 0));
  const vVx  = (vSpeedKt  || 0) * Math.sin(toRad(vCog  || 0));
  const vVy  = (vSpeedKt  || 0) * Math.cos(toRad(vCog  || 0));
  const rvx = vVx - myVx, rvy = vVy - myVy;
  const relSpdSq = rvx*rvx + rvy*rvy;
  const curDist = Math.sqrt(dx*dx + dy*dy);
  if (relSpdSq < 0.001) return { tMin: Infinity, dNm: curDist };
  const tHr = -(dx*rvx + dy*rvy) / relSpdSq;
  if (tHr <= 0) return { tMin: 0, dNm: curDist };
  const cpaDx = dx + rvx*tHr, cpaDy = dy + rvy*tHr;
  return { tMin: tHr * 60, dNm: Math.sqrt(cpaDx*cpaDx + cpaDy*cpaDy) };
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

// Bearing from point A to point B in degrees (0–360)
function _bearing(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLon  = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Minimum distance (nm) from a point to a route
function _distToRoute(lat, lon, waypoints) {
  if (!waypoints || waypoints.length < 2) return Infinity;
  let minD = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [la, lo] = waypoints[i], [lb, lb2] = waypoints[i + 1];
    // Project onto segment, clamp to [0,1]
    const dx = lb - la, dy = lb2 - lo;
    const t  = dx*dx + dy*dy < 1e-12 ? 0
      : Math.max(0, Math.min(1, ((lat-la)*dx + (lon-lo)*dy) / (dx*dx + dy*dy)));
    const d = _haversineNm(lat, lon, la + t*dx, lo + t*dy);
    if (d < minD) minD = d;
  }
  return minD;
}

// Next waypoint index ahead of the user
function _nextWaypointIdx(lat, lon, waypoints) {
  if (!waypoints || waypoints.length < 2) return -1;
  let minD = Infinity, mi = 0;
  waypoints.forEach(([wLat, wLon], i) => {
    const d = _haversineNm(lat, lon, wLat, wLon);
    if (d < minD) { minD = d; mi = i; }
  });
  return Math.min(mi + 1, waypoints.length - 1);
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
  `);out center;`;

  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  const radiusKm = Math.max(
    Math.hypot((maxLat - minLat) * 111, (maxLon - minLon) * 111 * Math.cos(midLat * Math.PI / 180)) / 2,
    5,
  );

  const [osmRes, bridgeRes, reportedRes] = await Promise.allSettled([
    fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal,
    }),
    fetch(`http://localhost:4000/api/noaa/bridges?lat=${midLat}&lon=${midLon}&radius=${Math.ceil(radiusKm)}`, { signal }),
    fetch(`http://localhost:4000/api/hazards?lat=${midLat}&lon=${midLon}&radius=${Math.ceil(radiusKm)}`, { signal }),
  ]);

  const buoys = [], hazards = [], bridges = [], reported = [];

  // OSM seamarks (buoys + hazards)
  if (osmRes.status === 'fulfilled' && osmRes.value.ok) {
    const data = await osmRes.value.json();
    for (const el of data.elements || []) {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null) continue;
      const t = el.tags?.['seamark:type'];
      if (t === 'buoy_lateral') {
        const ref = el.tags?.['seamark:buoy_lateral:ref'] || el.tags?.ref || '';
        const colour = el.tags?.['seamark:buoy_lateral:colour'] || '';
        buoys.push({ lat: elLat, lon: elLon, ref, isRed: colour.includes('red'), isGreen: colour.includes('green') });
      } else {
        hazards.push({ lat: elLat, lon: elLon, type: t || el.tags?.natural || 'hazard', name: el.tags?.name || el.tags?.['seamark:name'] || t || 'Hazard' });
      }
    }
  }

  // NOAA ENC bridge data
  if (bridgeRes.status === 'fulfilled' && bridgeRes.value.ok) {
    const noaaBridges = await bridgeRes.value.json();
    for (const b of noaaBridges) {
      if (b.lat == null || !b.verClr_m) continue;
      const ftRaw = b.verClr_m * 3.281;
      const clrLabel = `${Math.round(ftRaw)}ft`;
      bridges.push({ lat: b.lat, lon: b.lon, clearance: clrLabel, name: b.name || 'Bridge', verClr_ft: Math.round(ftRaw) });
    }
  }

  // Community-reported hazards
  if (reportedRes.status === 'fulfilled' && reportedRes.value.ok) {
    const data = await reportedRes.value.json();
    for (const h of data) reported.push(h);
  }

  return { buoys, hazards, bridges, reported };
}

// ─────────────────────────────────────────────────────────────────────────────

function LiveMap({ route, accent, routingActive, routeError, onPinSet, bottomInset = 0, boat, fuelLevel, onReportHazard, onSeamarks, onVessels, isNavView, isLogging, logElapsed, logDistNm, onStartLog, onStopLog }) {
  const mapRef = useRef(null);
  const [userPos, setUserPos] = useState(null); // { lat, lng, acc, heading, speedKts }
  const [tracking, setTracking] = useState(false);
  const [follow, setFollow] = useState(false);
  const [navMode, setNavMode] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const [vessels, setVessels] = useState({});
  const [gpsError, setGpsError] = useState(null);
  const [aisConnected, setAisConnected] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [mapClick, setMapClick] = useState(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [seamarks, setSeamarks] = useState({ buoys: [], hazards: [], bridges: [] });
  const [showSeamarks, setShowSeamarks] = useState(true);
  const [showCurrents, setShowCurrents] = useState(false);
  const [currents, setCurrents] = useState([]);
  const [selectedCurrent, setSelectedCurrent] = useState(null);
  const [showWind, setShowWind] = useState(false);
  const [windGrid, setWindGrid] = useState([]);
  const [selectedWind, setSelectedWind] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [mapZoom, setMapZoom] = useState(10);
  const [buoyObs, setBuoyObs] = useState(null); // nearest NDBC buoy live obs
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
  useEffect(() => { setNavMode(false); setArrived(false); setOffRoute(false); }, [route?.to]);

  // Auto-activate navMode when isNavView is set and a route + GPS are available
  useEffect(() => {
    if (isNavView && route?.waypoints?.length >= 2 && tracking && userPos) {
      setNavMode(true);
      setFollow(true);
    }
    if (!isNavView && navMode) {
      setNavMode(false);
    }
  }, [isNavView, !!route?.waypoints, tracking, !!userPos]);

  // Off-route detection — alert when > 0.3 nm from route while navigating
  useEffect(() => {
    if (!navMode || !userPos || !route?.waypoints?.length) { setOffRoute(false); return; }
    const dist = _distToRoute(userPos.lat, userPos.lng, route.waypoints);
    setOffRoute(dist > 0.3);
  }, [navMode, Math.round((userPos?.lat??0)*1000), Math.round((userPos?.lng??0)*1000)]);

  // Fetch seamarks + NDBC buoy obs along the route
  useEffect(() => {
    const wpts = route?.waypoints;
    if (!wpts || wpts.length < 2) { setSeamarks({ buoys: [], hazards: [], bridges: [] }); setBuoyObs(null); return; }
    const ctrl = new AbortController();
    const margin = 0.04;
    const lats = wpts.map(([la]) => la), lons = wpts.map(([, lo]) => lo);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const midLon = (Math.min(...lons) + Math.max(...lons)) / 2;

    _fetchSeamarks(
      Math.min(...lats) - margin, Math.min(...lons) - margin,
      Math.max(...lats) + margin, Math.max(...lons) + margin,
      ctrl.signal,
    ).then(sm => { setSeamarks(sm); onSeamarks?.(sm); }).catch(() => {});

    // Nearest NDBC buoy observations
    fetch(`http://localhost:4000/api/noaa/buoys?lat=${midLat}&lon=${midLon}&n=1`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : [])
      .then(async (buoys) => {
        if (!buoys.length) return;
        const obs = await fetch(`http://localhost:4000/api/noaa/buoys/${buoys[0].id}/obs`, { signal: ctrl.signal })
          .then(r => r.ok ? r.json() : null).catch(() => null);
        if (obs) setBuoyObs({ ...obs, stationName: buoys[0].name, dist_km: buoys[0].distance_km });
      }).catch(() => {});

    return () => ctrl.abort();
  }, [JSON.stringify(route?.waypoints)]);

  // Tidal current overlay fetch
  useEffect(() => {
    if (!showCurrents) { setCurrents([]); return; }
    const center = mapRef.current?.getCenter();
    const lat = center?.lat ?? initLat;
    const lon = center?.lng ?? initLng;
    let cancelled = false;
    fetch(`${API}/api/noaa/currents?lat=${lat}&lon=${lon}&n=8`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (!cancelled) setCurrents(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showCurrents, mapCenter]);

  // Wind overlay fetch
  useEffect(() => {
    if (!showWind) { setWindGrid([]); return; }
    const center = mapRef.current?.getCenter();
    const lat = center?.lat ?? initLat;
    const lon = center?.lng ?? initLng;
    const zoom = mapRef.current?.getZoom() ?? mapZoom;
    let cancelled = false;
    fetch(`${API}/api/weather/wind?lat=${lat}&lon=${lon}&zoom=${zoom.toFixed(1)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (!cancelled) setWindGrid(Array.isArray(d) ? d : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showWind, mapCenter, mapZoom]);

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
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }));
    };
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        const meta = msg.MetaData;
        if (msg.MessageType === 'PositionReport') {
          const p = msg.Message?.PositionReport;
          if (!p || Math.abs(p.Latitude) < 0.001 || Math.abs(p.Longitude) < 0.001) return;
          setVessels(prev => {
            const prevData   = prev[p.UserID] || {};
            const prevHist   = prevData.speedHistory || [];
            const lastEntry  = prevHist[prevHist.length - 1];
            const shouldSample = !lastEntry || (Date.now() - lastEntry.t) > 30000;
            const speedHistory = shouldSample
              ? [...prevHist, { t: Date.now(), sog: p.SpeedOverGround ?? 0 }].slice(-20)
              : prevHist;
            return {
              ...prev,
              [p.UserID]: {
                ...prevData,
                mmsi:     p.UserID,
                name:     (prevData.name || meta?.ShipName || `Vessel ${p.UserID}`).trim(),
                lat:      p.Latitude,
                lng:      p.Longitude,
                cog:      p.CourseOverGround,
                sog:      p.SpeedOverGround,
                shipType: prevData.shipType || meta?.ShipType || 0,
                updatedAt: Date.now(),
                speedHistory,
              },
            };
          });
        } else if (msg.MessageType === 'ShipStaticData') {
          const s = msg.Message?.ShipStaticData;
          if (!s) return;
          setVessels(prev => ({
            ...prev,
            [s.UserID]: {
              ...(prev[s.UserID] || {}),
              mmsi:        s.UserID,
              name:        (s.Name || meta?.ShipName || `Vessel ${s.UserID}`).trim(),
              callsign:    s.CallSign?.trim() || null,
              destination: s.Destination?.trim() || null,
              shipType:    s.Type || meta?.ShipType || 0,
              dimLength:   (s.Dimension?.A || 0) + (s.Dimension?.B || 0) || null,
              imo:         s.ImoNumber || null,
            },
          }));
        }
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

  const vesselList = Object.values(vessels).filter(v => v.lat && v.lng);

  useEffect(() => { onVessels?.(vesselList); }, [JSON.stringify(vesselList.map(v=>v.mmsi+v.lat+v.lng))]);

  // 10-minute projected heading lines for moving vessels
  const vesselTracksGeoJSON = React.useMemo(() => {
    const toRad = d => d * Math.PI / 180;
    return {
      type: 'FeatureCollection',
      features: vesselList.filter(v => v.sog > 0.5 && v.cog != null).map(v => {
        const cosLat = Math.cos(toRad(v.lat));
        const dHr = 10 / 60;
        const dLat = v.sog * dHr * Math.cos(toRad(v.cog)) / 60;
        const dLon = v.sog * dHr * Math.sin(toRad(v.cog)) / (60 * cosLat);
        return {
          type: 'Feature',
          properties: { color: _vesselColor(v.shipType) },
          geometry: { type: 'LineString', coordinates: [[v.lng, v.lat], [v.lng + dLon, v.lat + dLat]] },
        };
      }),
    };
  }, [JSON.stringify(vesselList.map(v=>v.mmsi+v.sog+v.cog))]);

  // GeoJSON route line (MapLibre uses [lon, lat]). Only ever drawn from real,
  // water-verified backend waypoints — never a naive straight line, which by
  // construction can cross land.
  const routeCoords = route?.waypoints?.length >= 2
    ? route.waypoints.map(([lat, lon]) => [lon, lat])
    : null;

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
        onMoveEnd={e => {
          const c = e.target?.getCenter();
          const z = e.target?.getZoom();
          if (c) setMapCenter({ lat: Math.round(c.lat * 100) / 100, lng: Math.round(c.lng * 100) / 100 });
          if (z != null) setMapZoom(Math.round(z));
        }}
        onClick={onPinSet ? (e) => {
          setSelectedVessel(null);
          setMapClick({ lat: e.lngLat.lat, lon: e.lngLat.lng, x: e.point.x, y: e.point.y });
        } : undefined}
      >
        {/* OpenSeaMap nautical overlay */}
        {showSeamarks && (
          <Source id="openseamap" type="raster"
            tiles={['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png']}
            tileSize={256} attribution="© OpenSeaMap" maxzoom={18}
          >
            <Layer id="openseamap-tiles" type="raster" paint={{ 'raster-opacity': 0.9 }}/>
          </Source>
        )}

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

        {/* Next waypoint highlight in navMode */}
        {navMode && userPos && route?.waypoints?.length >= 2 && (() => {
          const idx = _nextWaypointIdx(userPos.lat, userPos.lng, route.waypoints);
          const wpt = route.waypoints[idx];
          if (!wpt) return null;
          return (
            <Marker longitude={wpt[1]} latitude={wpt[0]} anchor="center">
              <div style={{ width:20, height:20, borderRadius:'50%', background:accent, border:'3px solid white', boxShadow:`0 0 0 4px ${accent}55, 0 2px 8px rgba(0,0,0,0.7)`, animation:'pulse 1.5s infinite' }}/>
            </Marker>
          );
        })()}

        {/* Community-reported hazard markers */}
        {seamarks.reported?.map((h, i) => {
          const emoji = h.type?.includes('rock')||h.type?.includes('reef') ? '🪨'
            : h.type?.includes('wreck') ? '🚢' : h.type?.includes('shoal') ? '🏖️'
            : h.type?.includes('debris') ? '📦' : '⚠️';
          return (
            <Marker key={`rep-${h.id||i}`} longitude={h.lon} latitude={h.lat} anchor="center">
              <div title={h.description || h.type} style={{ width:24, height:24, borderRadius:6, background:'#FFFBEB', border:'2px solid #D97706', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, boxShadow:'0 0 0 3px rgba(217,119,6,0.25), 0 2px 6px rgba(0,0,0,0.5)', cursor:'default' }}>
                {emoji}
              </div>
            </Marker>
          );
        })}

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

        {/* AIS vessel heading projections (10-min track lines) */}
        {vesselTracksGeoJSON.features.length > 0 && (
          <Source id="vessel-tracks" type="geojson" data={vesselTracksGeoJSON}>
            <Layer id="vessel-tracks-line" type="line" paint={{ 'line-color': ['get','color'], 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [4, 3] }}/>
          </Source>
        )}

        {/* AIS vessel markers */}
        {vesselList.map(v => {
          const isSel = selectedVessel?.mmsi === v.mmsi;
          const cpaData = userPos ? _computeCPA(userPos.lat, userPos.lng, 0, 0, v.lat, v.lng, v.sog||0, v.cog||0) : null;
          const cpaWarn = cpaData && cpaData.dNm < 0.5 && cpaData.tMin < 20 && cpaData.tMin > 0;
          return (
            <Marker key={v.mmsi} longitude={v.lng} latitude={v.lat} anchor="center"
              onClick={e => { e.originalEvent.stopPropagation(); setSelectedVessel(sel => sel?.mmsi === v.mmsi ? null : v); }}
            >
              <div style={{ position:'relative', cursor:'pointer' }}>
                {cpaWarn && <div style={{ position:'absolute', inset:-4, borderRadius:'50%', border:'2px solid #EF4444', animation:'pulse 1s infinite', pointerEvents:'none' }}/>}
                <svg width="14" height="18" viewBox="0 0 14 18"
                  style={{ transform:`rotate(${v.cog||0}deg)`, display:'block', filter:`drop-shadow(0 1px 3px rgba(0,0,0,0.7))` }}
                >
                  <polygon points="7,0 14,18 7,13 0,18" fill={cpaWarn ? '#EF4444' : _vesselColor(v.shipType)} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5"/>
                </svg>
              </div>
            </Marker>
          );
        })}

        {/* Vessel popup — handled by VesselDetailPanel outside <Map> */}

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

        {/* Tidal current arrows */}
        {showCurrents && currents.map((c, i) => {
          const col = c.type === 'flood' ? '#60A5FA' : c.type === 'ebb' ? '#FBBF24' : '#94A3B8';
          const sz = c.speed < 0.3 ? 18 : c.speed < 0.8 ? 22 : c.speed < 1.5 ? 28 : 36;
          const isSelected = selectedCurrent?.id === c.id;
          return (
            <Marker key={`cur-${c.id}-${i}`} longitude={c.lon} latitude={c.lat} anchor="center">
              <div
                title={`${c.name}: ${c.speed.toFixed(1)} kt ${c.type}`}
                onClick={e => { e.stopPropagation(); setSelectedCurrent(isSelected ? null : c); }}
                style={{ cursor: 'pointer', transform: isSelected ? 'scale(1.2)' : undefined, transition: 'transform 0.12s' }}
              >
                <svg
                  width={sz} height={sz * 1.3}
                  viewBox="0 0 24 32"
                  style={{ display: 'block', transform: `rotate(${c.dir}deg)`, filter: `drop-shadow(0 1px 3px rgba(0,0,0,0.65))` }}
                >
                  <polygon points="12,2 20,24 12,19 4,24" fill={col} fillOpacity={Math.min(0.95, 0.45 + c.speed * 0.28)}/>
                  <line x1="12" y1="24" x2="12" y2="31" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.85"/>
                </svg>
              </div>
            </Marker>
          );
        })}

        {/* Current station popup */}
        {selectedCurrent && (
          <Marker longitude={selectedCurrent.lon} latitude={selectedCurrent.lat} anchor="bottom" offset={[0, -20]}>
            <div style={{
              background: 'rgba(8,17,28,0.96)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12, padding: '10px 14px', backdropFilter: 'blur(14px)',
              boxShadow: '0 4px 18px rgba(0,0,0,0.7)', minWidth: 160, pointerEvents: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'white', letterSpacing: '0.02em' }}>
                  {selectedCurrent.name}
                </span>
                <button onClick={() => setSelectedCurrent(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: selectedCurrent.type === 'flood' ? '#60A5FA' : selectedCurrent.type === 'ebb' ? '#FBBF24' : '#94A3B8', marginBottom: 2 }}>
                {selectedCurrent.speed.toFixed(1)} kt
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ textTransform: 'capitalize', fontWeight: 600,
                  color: selectedCurrent.type === 'flood' ? '#93C5FD' : selectedCurrent.type === 'ebb' ? '#FCD34D' : '#CBD5E1' }}>
                  {selectedCurrent.type}
                </span>
                <span>·</span>
                <span>{selectedCurrent.dir.toFixed(0)}° {(() => {
                  const d = ((selectedCurrent.dir % 360) + 360) % 360;
                  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
                  return dirs[Math.round(d / 45) % 8];
                })()}</span>
                {selectedCurrent.dist_km != null && (<><span>·</span><span>{(selectedCurrent.dist_km * 0.621).toFixed(0)} mi</span></>)}
              </div>
              {selectedCurrent.time && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
                  as of {selectedCurrent.time}
                </div>
              )}
            </div>
          </Marker>
        )}

        {/* Wind arrows */}
        {showWind && windGrid.map((w, i) => {
          const col = w.speedKt < 5 ? '#94A3B8' : w.speedKt < 12 ? '#4ADE80' : w.speedKt < 20 ? '#FB923C' : w.speedKt < 30 ? '#EF4444' : '#A855F7';
          const sz  = w.speedKt < 5 ? 20 : w.speedKt < 12 ? 24 : w.speedKt < 20 ? 30 : w.speedKt < 30 ? 36 : 42;
          const rotDeg = (w.dirDeg + 180) % 360;
          const isSel  = selectedWind && selectedWind.lat === w.lat && selectedWind.lon === w.lon;
          return (
            <Marker key={`wind-${i}`} longitude={w.lon} latitude={w.lat} anchor="center">
              <div
                title={`Wind: ${w.speedKt} kt from ${w.dirDeg}°`}
                onClick={e => { e.stopPropagation(); setSelectedWind(isSel ? null : w); setSelectedCurrent(null); }}
                style={{ cursor: 'pointer', transform: isSel ? 'scale(1.25)' : undefined, transition: 'transform 0.12s' }}
              >
                <svg width={sz} height={sz * 1.3} viewBox="0 0 24 32"
                  style={{ display: 'block', transform: `rotate(${rotDeg}deg)`, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
                >
                  <polygon points="12,2 20,22 12,17 4,22" fill={col} fillOpacity={0.9}/>
                  <line x1="12" y1="22" x2="12" y2="30" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.85"/>
                  <line x1="8" y1="26" x2="16" y2="26" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6"/>
                </svg>
              </div>
            </Marker>
          );
        })}

        {/* Wind popup */}
        {selectedWind && (
          <Marker longitude={selectedWind.lon} latitude={selectedWind.lat} anchor="bottom" offset={[0, -22]}>
            <div style={{
              background: 'rgba(8,17,28,0.96)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12, padding: '10px 14px', backdropFilter: 'blur(14px)',
              boxShadow: '0 4px 18px rgba(0,0,0,0.7)', minWidth: 148, pointerEvents: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Wind</span>
                <button onClick={() => setSelectedWind(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color:
                selectedWind.speedKt < 5 ? '#94A3B8' : selectedWind.speedKt < 12 ? '#4ADE80' :
                selectedWind.speedKt < 20 ? '#FB923C' : selectedWind.speedKt < 30 ? '#EF4444' : '#A855F7',
                marginBottom: 2 }}>
                {selectedWind.speedKt.toFixed(1)} kt
              </div>
              {selectedWind.gustKt != null && selectedWind.gustKt > selectedWind.speedKt && (
                <div style={{ fontSize: 11, color: '#FB923C', marginBottom: 4 }}>
                  Gusts to {selectedWind.gustKt.toFixed(1)} kt
                </div>
              )}
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                {(() => {
                  const d = ((selectedWind.dirDeg % 360) + 360) % 360;
                  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
                  const label = dirs[Math.round(d / 22.5) % 16];
                  return `From ${label} · ${d}°`;
                })()}
              </div>
            </div>
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

      {/* Map overlay toggle buttons */}
      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => setShowSeamarks(v => !v)}
          title={showSeamarks ? 'Hide nautical chart overlay' : 'Show nautical chart overlay'}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: showSeamarks ? 'rgba(34,227,208,0.18)' : 'rgba(10,20,32,0.82)',
            backdropFilter: 'blur(10px)',
            boxShadow: showSeamarks
              ? '0 0 0 1.5px rgba(34,227,208,0.6), 0 2px 8px rgba(0,0,0,0.5)'
              : '0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, transition: 'background 0.15s, box-shadow 0.15s',
          }}
        >⚓</button>
        <button
          onClick={() => { setShowCurrents(v => !v); setSelectedCurrent(null); }}
          title={showCurrents ? 'Hide tidal currents' : 'Show tidal current overlay'}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: showCurrents ? 'rgba(96,165,250,0.22)' : 'rgba(10,20,32,0.82)',
            backdropFilter: 'blur(10px)',
            boxShadow: showCurrents
              ? '0 0 0 1.5px rgba(96,165,250,0.7), 0 2px 8px rgba(0,0,0,0.5)'
              : '0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, transition: 'background 0.15s, box-shadow 0.15s',
          }}
        >🌊</button>
        <button
          onClick={() => { setShowWind(v => !v); setSelectedWind(null); }}
          title={showWind ? 'Hide wind overlay' : 'Show wind overlay'}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: showWind ? 'rgba(74,222,128,0.22)' : 'rgba(10,20,32,0.82)',
            backdropFilter: 'blur(10px)',
            boxShadow: showWind
              ? '0 0 0 1.5px rgba(74,222,128,0.7), 0 2px 8px rgba(0,0,0,0.5)'
              : '0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, transition: 'background 0.15s, box-shadow 0.15s',
          }}
        >💨</button>
      </div>

      {/* NDBC buoy conditions chip */}
      {buoyObs && (buoyObs.waveHeight_ft != null || buoyObs.windSpeed_kt != null) && (
        <div style={{
          position: 'absolute', top: 146, right: 14, zIndex: 1000,
          background: 'rgba(8,17,28,0.92)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '6px 10px', backdropFilter: 'blur(12px)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
            NDBC · {buoyObs.stationName?.split(' ')[0]}
          </div>
          {buoyObs.waveHeight_ft != null && (
            <div style={{ fontSize: 11, fontWeight: 600, color: 'white' }}>
              🌊 {buoyObs.waveHeight_ft} ft
            </div>
          )}
          {buoyObs.windSpeed_kt != null && (
            <div style={{ fontSize: 11, fontWeight: 600, color: 'white' }}>
              💨 {buoyObs.windSpeed_kt} kt{buoyObs.windGust_kt ? ` G${buoyObs.windGust_kt}` : ''}
            </div>
          )}
          {buoyObs.waterTemp_f != null && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
              Water {buoyObs.waterTemp_f}°F
            </div>
          )}
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
        const wpts    = route?.waypoints;
        const distNm  = userPos && arrCoords
          ? (wpts?.length >= 2
              ? _routeRemainingNm(wpts, userPos.lat, userPos.lng)
              : _haversineNm(userPos.lat, userPos.lng, arrCoords[0], arrCoords[1]))
          : null;
        const totalNm   = wpts ? _routeDistNm(wpts) : 0;
        const progPct   = (totalNm > 0 && distNm != null) ? Math.max(0, Math.min(100, ((totalNm - distNm) / totalNm) * 100)) : 0;
        const etaVal    = distNm != null ? _etaStr(distNm, userPos?.speedKts) : null;
        const nextIdx   = userPos && wpts ? _nextWaypointIdx(userPos.lat, userPos.lng, wpts) : -1;
        const nextWpt   = nextIdx >= 0 ? wpts[nextIdx] : null;
        const nextDistNm = nextWpt && userPos ? _haversineNm(userPos.lat, userPos.lng, nextWpt[0], nextWpt[1]) : null;
        const nextBearDeg = nextWpt && userPos ? _bearing(userPos.lat, userPos.lng, nextWpt[0], nextWpt[1]) : null;
        const nextBearStr = nextBearDeg != null ? _compassDir(nextBearDeg) : null;
        const isLast    = nextIdx === (wpts?.length ?? 0) - 1;

        return (
          <div style={{
            position: 'absolute', bottom: bottomInset + 66, left: 12, right: 12, zIndex: 1000,
            background: 'rgba(8,17,28,0.97)', border: `1px solid ${offRoute ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 18, overflow: 'hidden',
            boxShadow: offRoute ? '0 0 0 3px rgba(239,68,68,0.3), 0 -4px 30px rgba(0,0,0,0.7)' : '0 -4px 30px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(16px)',
          }}>
            {/* Off-route warning */}
            {offRoute && (
              <div style={{ background:'#7F1D1D', padding:'6px 14px', display:'flex', alignItems:'center', gap:7, borderBottom:'1px solid #EF444444' }}>
                <span style={{ fontSize:15 }}>⚠</span>
                <span style={{ fontSize:12.5, fontWeight:700, color:'#FCA5A5' }}>Off Route — recalculate or return to course</span>
              </div>
            )}

            {/* Destination bar + progress */}
            <div style={{ padding: '10px 14px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="pin" size={13} color={accent} sw={2.2}/>
                  <span style={{ fontSize: 12.5, color: 'var(--c-text)', fontWeight: 700, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {route?.to || 'Destination'}
                  </span>
                </div>
                <button onClick={() => { setNavMode(false); setOffRoute(false); }} style={{
                  all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  color: 'var(--c-text-4)', background: 'var(--c-surface-alt)',
                  padding: '3px 10px', borderRadius: 6,
                }}>End</button>
              </div>
              {/* Route progress bar */}
              {totalNm > 0 && (
                <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', width: `${progPct}%`, borderRadius: 99, background: accent, transition: 'width 1s linear' }}/>
                </div>
              )}
            </div>

            {/* Next waypoint banner */}
            {nextWpt && !isLast && nextDistNm != null && nextBearStr && (
              <div style={{ margin: '0 10px 6px', padding: '5px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: accent + '22', border: `1.5px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: `rotate(${nextBearDeg}deg)` }}>
                    <polygon points="6,0 12,12 6,9 0,12" fill={accent}/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em' }}>NEXT WAYPOINT</div>
                  <div style={{ fontSize: 12, color: 'var(--c-text)', fontWeight: 600 }}>{nextDistNm < 0.1 ? (nextDistNm*6076).toFixed(0)+'yd' : nextDistNm.toFixed(2)+' nm'} · {nextBearStr} ({Math.round(nextBearDeg)}°)</div>
                </div>
                {wpts && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{nextIdx}/{wpts.length - 1}</div>}
              </div>
            )}

            {/* Metrics row */}
            <div style={{ display: 'flex', padding: '4px 10px 12px', gap: 2 }}>
              {[
                { label: 'Speed',    val: userPos?.speedKts != null ? userPos.speedKts.toFixed(1) : '—', unit: 'kt' },
                { label: 'Heading',  val: userPos?.heading != null ? _compassDir(userPos.heading) : '—', unit: userPos?.heading != null ? `${Math.round(userPos.heading)}°` : '' },
                { label: 'Dist',     val: distNm != null ? distNm.toFixed(1) : '—', unit: 'nm left' },
                { label: 'ETA',      val: etaVal || (userPos?.speedKts != null && userPos.speedKts < 0.5 ? 'Stopped' : '—'), unit: '' },
                { label: 'Progress', val: totalNm > 0 ? `${Math.round(progPct)}` : '—', unit: '%' },
              ].map(({ label, val, unit }) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', padding: '6px 3px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 16, color: 'var(--c-text)', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                  {unit && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{unit}</div>}
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

      {/* Routing failure — shown instead of ever drawing an unverified line */}
      {!routingActive && routeError && (
        <div style={{
          position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          maxWidth: 'calc(100% - 28px)',
          padding: '7px 14px', borderRadius: 99,
          background: 'rgba(63,20,24,0.95)', border: '1px solid #7A2530',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>⚠️</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#FF6B6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{routeError}</span>
        </div>
      )}

      {/* AIS vessel count badge */}
      {aisConnected && vesselList.length > 0 && (
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 1000,
          padding: '5px 10px', borderRadius: 99,
          background: 'rgba(10,20,32,0.9)', border: '1px solid var(--c-border)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: 99, background: '#4ADE80', boxShadow: '0 0 6px #4ADE80' }}/>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-text)' }}>{vesselList.length} vessels nearby</span>
        </div>
      )}

      {/* Trip Logger REC button */}
      {(onStartLog || onStopLog) && (
        <button
          onClick={isLogging ? onStopLog : onStartLog}
          style={{
            position: 'absolute', bottom: bottomInset + 16, left: 16, zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 14px', borderRadius: 22, border: 'none', cursor: 'pointer',
            background: isLogging ? 'rgba(220,38,38,0.92)' : 'rgba(10,20,32,0.88)',
            backdropFilter: 'blur(12px)',
            boxShadow: isLogging ? '0 0 0 2px rgba(220,38,38,0.5), 0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.45)',
            transition: 'all 0.2s',
          }}
        >
          {isLogging ? (
            <>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', animation: 'pulse 1s infinite', flexShrink: 0 }}/>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'white', letterSpacing: '0.04em' }}>
                {logElapsed || '0:00'} · {logDistNm != null ? `${logDistNm.toFixed(2)} nm` : '0.00 nm'}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.06em' }}>STOP</span>
            </>
          ) : (
            <>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#EF4444', flexShrink: 0 }}/>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'white', letterSpacing: '0.06em' }}>REC TRIP</span>
            </>
          )}
        </button>
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

      {/* Vessel detail panel */}
      {selectedVessel && (
        <VesselDetailPanel
          vessel={vessels[selectedVessel.mmsi] ?? selectedVessel}
          userPos={userPos}
          accent={accent}
          onClose={() => setSelectedVessel(null)}
        />
      )}
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
        <div style={{ width: 64, height: 64, borderRadius: 20, background: STATUS.go.bg, border: `1.5px solid ${STATUS.go.border}`, display: 'grid', placeItems: 'center', marginBottom: 20 }}>
          <Icon name="check" size={30} color={STATUS.go.fg} sw={2.2}/>
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
          background: STATUS.wait.bg, border: `1.5px solid ${STATUS.wait.border}`,
          display: 'grid', placeItems: 'center', margin: '0 auto 14px',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={STATUS.wait.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.14em', color: STATUS.wait.fg, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
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
              <div style={{ position: 'absolute', left: 0, right: 0, top: 68, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, zIndex: 40, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                {fromSuggestions.map((s, i) => (
                  <div key={i} onMouseDown={() => selectFromSuggestion(i)} onMouseEnter={() => setFromActiveIndex(i)}
                    style={{ padding: '8px 10px', borderRadius: 7, cursor: 'pointer', color: 'var(--c-text)', background: fromActiveIndex === i ? 'var(--c-surface-alt)' : 'transparent', fontSize: 13 }}>{s.display_name}</div>
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
              <div style={{ position: 'absolute', left: 0, right: 0, top: 68, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, zIndex: 40, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                {toSuggestions.map((s, i) => (
                  <div key={i} onMouseDown={() => selectToSuggestion(i)} onMouseEnter={() => setToActiveIndex(i)}
                    style={{ padding: '8px 10px', borderRadius: 7, cursor: 'pointer', color: 'var(--c-text)', background: toActiveIndex === i ? 'var(--c-surface-alt)' : 'transparent', fontSize: 13 }}>{s.display_name}</div>
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
                <div style={{ width:32, height:32, borderRadius:99, background:'var(--c-surface-alt)', border:'1px solid var(--c-border)', display:'grid', placeItems:'center', flexShrink:0, fontSize:15 }}>{r.isRamp?'🚤':'⚓'}</div>
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
function TripScreen({ accent, boat, verdict, onSave, onPlan, route, routeSafety }) {
  const [saved, setSaved] = useState(false);
  const [fromValue, setFromValue] = useState(route?.from || '');
  const [toValue, setToValue]     = useState(route?.to   || '');

  useEffect(() => {
    setFromValue(route?.from || '');
    setToValue(route?.to   || '');
  }, [route?.from, route?.to]);

  const v    = STATUS[verdict] || STATUS.go;
  const copy = VERDICT_COPY[verdict] || VERDICT_COPY.go;
  const safetyReasons   = routeSafety?.reasons   || [];
  const routeConditions = routeSafety?.conditions || {};

  const hourly = routeSafety?.hourly || [
    { t: '7a',  wind: 14, ok: false },
    { t: '9a',  wind: 12, ok: true  },
    { t: '11a', wind: 10, ok: true  },
    { t: '1p',  wind: 9,  ok: true  },
    { t: '3p',  wind: 11, ok: true  },
    { t: '5p',  wind: 13, ok: true  },
    { t: '7p',  wind: 15, ok: false },
  ];

  const startWind  = routeConditions.wind        != null ? routeConditions.wind        : '—';
  const startSub   = routeSafety ? (routeConditions.gust != null ? `${routeConditions.gust} kt gust` : 'No gust data') : 'Forecast unavailable';
  const arrWindVal = routeConditions.arrivalWind != null ? routeConditions.arrivalWind : '—';
  const arrWindSub = routeSafety
    ? (routeConditions.arrivalWindDir ? `From ${routeConditions.arrivalWindDir}` : (routeConditions.arrivalWind != null ? 'At destination' : 'Forecast unavailable'))
    : 'Forecast unavailable';
  const depthVal = routeConditions.maxDepthFt != null ? routeConditions.maxDepthFt : '—';
  const depthSub = routeSafety ? (routeConditions.maxDepthFt != null ? 'Deepest along route' : 'Unavailable') : 'Unavailable';

  const safeHour   = hourly.find(h => h.ok);
  const bestWindow = routeSafety
    ? (safeHour ? `Leave ${safeHour.t}${safeHour.shortForecast ? ` — ${safeHour.shortForecast.toLowerCase()}` : ''}` : 'No safe window today')
    : (verdict === 'go' ? 'Leave 9:15 AM — smoothest ride' : verdict === 'wait' ? 'Leave 4:15 PM — waves drop' : 'Sunday 8 AM looks clean');

  const storedFuel  = boat?.id ? parseFloat(localStorage.getItem(`safeseas_fuel_${boat.id}`) || '0') : 0;
  const fuelLevel   = storedFuel > 0 ? storedFuel : (boat?.fuelLevel || 0);
  const fuelRangeNm = (boat?.fuelBurn > 0 && boat?.cruiseSpeed > 0 && fuelLevel > 0)
    ? (fuelLevel / boat.fuelBurn) * boat.cruiseSpeed : null;
  const routeDistNm = _routeDistNm(route?.waypoints);
  const fuelOk      = fuelRangeNm == null || routeDistNm === 0 || fuelRangeNm >= routeDistNm;

  const windLim = boat?.windLim || 20;
  const windMax = Math.max(...hourly.map(h => typeof h.wind === 'number' ? h.wind : 0), windLim, 5);
  const CW = 360, CH = 58;
  const limitY = CH - (windLim / windMax) * CH;

  const inputStyle = {
    flex: 1, padding: '11px 13px', borderRadius: 10,
    border: `1.5px solid ${DB.border}`, background: DB.bg,
    color: DB.text, fontSize: 14, outline: 'none', fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{ padding: '12px 20px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: DB.muted, fontWeight: 700, textTransform: 'uppercase' }}>Navigation</div>
        <div style={{ fontSize: 26, color: DB.text, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>Trips & Plans</div>
      </div>

      {/* Route planner */}
      <div style={{ background: DB.card, border: `1px solid ${DB.border}`, borderRadius: 16, padding: '16px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: DB.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Plan a Route</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
              <div style={{ width: 11, height: 11, borderRadius: 99, border: `2.5px solid ${accent}`, background: '#fff' }}/>
              <div style={{ width: 2, height: 22, background: `${accent}40`, marginTop: 3 }}/>
            </div>
            <input value={fromValue} onChange={e => setFromValue(e.target.value)}
              placeholder="From — departure point" style={inputStyle}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 16 }}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: accent }}/>
            </div>
            <input value={toValue} onChange={e => setToValue(e.target.value)}
              placeholder="To — destination" style={inputStyle}/>
          </div>
        </div>
        <button onClick={() => { setSaved(false); onPlan && onPlan({ from: fromValue, to: toValue }); }} style={{
          all: 'unset', cursor: 'pointer', marginTop: 14, width: '100%', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px', borderRadius: 11, background: accent, color: '#fff',
          fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', boxShadow: `0 4px 14px ${accent}44`,
        }}>
          <Icon name="compass" size={16} color="#fff" sw={2}/>
          Plan Route
        </button>
      </div>

      {/* Go / Wait / No-Go verdict */}
      <div style={{ background: v.bg, border: `1.5px solid ${v.border}`, borderRadius: 16, padding: '18px 18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: v.fg, boxShadow: `0 0 8px ${v.fg}` }}/>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: v.fg }}>{v.label}</span>
          </div>
          <span style={{ fontSize: 10, color: v.fg, fontWeight: 600, opacity: 0.65 }}>TODAY</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: DB.text, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 8 }}>
          {verdict === 'go'   && 'Clear all day.'}
          {verdict === 'wait' && 'Hold till afternoon.'}
          {verdict === 'nogo' && 'Stay at the dock.'}
        </div>
        <div style={{ fontSize: 13, color: DB.muted, lineHeight: 1.5 }}>{copy.line}</div>
        {safetyReasons.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${v.border}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {safetyReasons.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: v.fg, lineHeight: 1.4 }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}>•</span>{r}
              </div>
            ))}
          </div>
        )}
        {!safetyReasons.length && routeSafety && (
          <div style={{ marginTop: 10, fontSize: 12, color: v.fg, opacity: 0.7 }}>No critical issues detected for this route.</div>
        )}
      </div>

      {/* Best departure window */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: DB.card, border: `1px solid ${DB.border}`, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `${accent}18`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="clock" size={20} color={accent} sw={2}/>
        </div>
        <div>
          <div style={{ fontSize: 10, color: DB.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Best Departure Window</div>
          <div style={{ fontSize: 16, color: DB.text, fontWeight: 700, marginTop: 3, letterSpacing: '-0.01em' }}>{bestWindow}</div>
        </div>
      </div>

      {/* Conditions along route */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: DB.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Conditions Along Route</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ConditionTile icon="wind"   label="Depart"    value={startWind}  unit="kt" sub={startSub}  accent={accent}/>
          <ConditionTile icon="wind"   label="Arrival"   value={arrWindVal} unit="kt" sub={arrWindSub} accent={accent}/>
          <ConditionTile icon="anchor" label="Max depth" value={depthVal}   unit="ft" sub={depthSub}  accent={accent}/>
        </div>
      </div>

      {/* Hourly wind chart */}
      <div style={{ background: DB.card, border: `1px solid ${DB.border}`, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DB.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Hourly Wind</div>
          {windLim > 0 && <div style={{ fontSize: 11, color: STATUS.wait.fg, fontWeight: 700 }}>{windLim} kt limit</div>}
        </div>
        <svg width="100%" viewBox={`0 0 ${CW} ${CH + 22}`} style={{ display: 'block', overflow: 'visible' }}>
          {/* Limit line */}
          {limitY >= 0 && limitY <= CH && (
            <line x1="0" y1={limitY} x2={CW} y2={limitY} stroke={STATUS.wait.fg} strokeWidth="1.2" strokeDasharray="5 3" opacity="0.55"/>
          )}
          {/* Bars */}
          {hourly.map((h, i) => {
            const wind = typeof h.wind === 'number' ? h.wind : 0;
            const bH   = Math.max(4, (wind / windMax) * CH);
            const col  = CW / hourly.length;
            const bW   = col - 6;
            const bX   = i * col + 3;
            const ok   = typeof h.ok === 'boolean' ? h.ok : wind <= windLim;
            return <rect key={i} x={bX} y={CH - bH} width={bW} height={bH} rx="3" fill={ok ? accent : STATUS.wait.fg} opacity={ok ? 0.92 : 0.75}/>;
          })}
          {/* Wind values */}
          {hourly.map((h, i) => {
            const wind = typeof h.wind === 'number' ? h.wind : 0;
            const bH   = Math.max(4, (wind / windMax) * CH);
            const col  = CW / hourly.length;
            return (
              <text key={i} x={i * col + col / 2} y={CH - bH - 3} fontSize="7.5" textAnchor="middle" fill={DB.muted}>{wind}</text>
            );
          })}
          {/* Hour labels */}
          {hourly.map((h, i) => (
            <text key={i} x={i * (CW / hourly.length) + (CW / hourly.length) / 2} y={CH + 15}
              fontSize="9" textAnchor="middle" fill={DB.muted}>{h.t}</text>
          ))}
        </svg>
      </div>

      {/* Fuel card */}
      {boat?.fuelBurn > 0 && boat?.cruiseSpeed > 0 && boat?.fuelCap > 0 && (
        <FuelCard boat={boat} fuelLevel={fuelLevel} fuelRangeNm={fuelRangeNm} routeDistNm={routeDistNm} fuelOk={fuelOk} accent={accent}/>
      )}

      {/* Save trip */}
      <button onClick={() => {
        setSaved(true);
        const savedStatus = routeSafety?.verdict || verdict;
        const reasonText  = routeSafety?.reasons?.length ? `Reasons: ${routeSafety.reasons.join(' | ')}` : '';
        onSave && onSave({
          name:   `${route?.from || fromValue || 'Start'} → ${route?.to || toValue || 'Destination'}`,
          from:   route?.from || fromValue || 'Start',
          to:     route?.to   || toValue   || 'Destination',
          notes:  `Boat: ${boat ? boat.name : 'Unknown'} · ${boat ? boat.type : ''}${reasonText ? ' · ' + reasonText : ''}`,
          status: savedStatus,
          boatId: boat?.id || null,
        });
      }} style={{
        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        height: 52, borderRadius: 14, width: '100%', boxSizing: 'border-box',
        background: saved ? DB.greenSoft : accent, color: saved ? DB.green : '#fff',
        border: saved ? `1.5px solid #86EFAC` : 'none',
        fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em',
        boxShadow: saved ? 'none' : `0 4px 16px ${accent}44`,
      }}>
        <Icon name={saved ? 'check' : 'bookmark'} size={19} color={saved ? DB.green : '#fff'} sw={2.2}/>
        {saved ? 'Trip saved' : 'Save trip'}
      </button>
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
          <div style={{ width: 92, minHeight: 64, background: 'var(--c-surface-alt)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', padding: 4 }}>
            <BoatArt type={(boat && boat.type) || 'Center console'} color={accent} size={52}/>
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
                    boxSizing: 'border-box',
                    background: active ? `${accent}14` : 'var(--c-surface)',
                    border: `1.5px solid ${active ? accent : 'var(--c-border)'}`,
                    borderRadius: 14, padding: '14px 12px 12px',
                    transition: 'all 0.18s ease',
                    boxShadow: active ? `0 0 0 4px ${accent}1A` : 'none',
                  }}>
                    <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
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

function FriendsSection({ accent, authToken, user, onOpenDm }) {
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {searchResults.map(u => {
              const isFriend  = friendIds.has(u.id);
              const isPending = outgoingIds.has(u.id) || incomingIds.has(u.id);
              return (
                <div key={u.id} style={{ background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 99, background: `${accent}22`, border: `1.5px solid ${accent}44`, display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: accent }}>
                      {u.name[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 700, lineHeight: 1.2 }}>{u.name}</div>
                      {u.locationLabel && (
                        <div style={{ fontSize: 11.5, color: 'var(--c-text-4)', marginTop: 2 }}>📍 {u.locationLabel}</div>
                      )}
                    </div>
                    {isFriend ? (
                      <span style={{ fontSize: 11.5, color: '#22C55E', fontWeight: 600, flexShrink: 0 }}>Friends</span>
                    ) : isPending ? (
                      <span style={{ fontSize: 11.5, color: 'var(--c-text-4)', fontWeight: 600, flexShrink: 0 }}>Pending</span>
                    ) : (
                      <button onClick={() => sendRequest(u.id)} style={{
                        all: 'unset', cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
                        background: accent + '22', border: `1px solid ${accent}55`,
                        color: accent, fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>Add</button>
                    )}
                  </div>
                  {u.boats?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {u.boats.map((b, i) => (
                        <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)', fontWeight: 600 }}>
                          ⚓ {b.name || b.type}{b.length ? ` · ${b.length}ft` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {u.recentRoutes?.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--c-text-4)', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 600, color: 'var(--c-text-3)' }}>Recent routes: </span>
                      {u.recentRoutes.slice(0, 2).map((r, i) => (
                        <span key={i}>{i > 0 ? ' · ' : ''}{r.from} → {r.to}</span>
                      ))}
                    </div>
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
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-text)', fontWeight: 600 }}>{f.name}</span>
                <button onClick={() => onOpenDm && onOpenDm(f)} style={{
                  all: 'unset', cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
                  background: `${accent}18`, border: `1px solid ${accent}44`,
                  color: accent, fontSize: 12, fontWeight: 700,
                }}>Chat</button>
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

function SettingsScreen({ accent, user, onLogout, profileColor, onProfileColorChange, onDeleteAccount, authToken, onOpenDm }) {
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

      {/* Friends */}
      <FriendsSection accent={accent} authToken={authToken} user={user} onOpenDm={onOpenDm} />

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

function DirectMessageModal({ friend, authToken, user, profileColor, accent, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const socketRef = useRef(null);
  const listRef   = useRef(null);
  const accentColor   = accent || '#22E3D0';
  const myAvatarColor = profileColor || accentColor;

  useEffect(() => {
    const socket = socketIO(API, { auth: { token: authToken } });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('joinDm', { otherId: friend.id }));
    socket.on('dmHistory', msgs => setMessages(msgs));
    socket.on('dmMessage', msg  => setMessages(prev => [...prev, msg]));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [authToken, friend.id]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const canSend = input.trim().length > 0 && socketRef.current?.connected;

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !socketRef.current?.connected) return;
    socketRef.current.emit('dmMessage', { toUserId: friend.id, text });
    setInput('');
  }, [input, friend.id]);

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  const friendInitial = (friend.name || '?')[0].toUpperCase();

  return (
    <div style={{ height: '100%', background: 'var(--c-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', width: 34, height: 34, borderRadius: 10, background: 'var(--c-surface-alt)', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div style={{ width: 36, height: 36, borderRadius: 99, background: `${accentColor}22`, border: `1.5px solid ${accentColor}44`, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, color: accentColor, flexShrink: 0 }}>
          {friendInitial}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>{friend.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--c-text-4)' }}>Private message</div>
        </div>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--c-text-4)', fontSize: 13, paddingTop: 40 }}>
            No messages yet — say hello to {friend.name}!
          </div>
        )}
        {messages.map(msg => {
          const isMe    = msg.fromUserId === user?.id;
          const initial = (msg.fromName || '?')[0].toUpperCase();
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 99, flexShrink: 0,
                background: isMe ? myAvatarColor : `${accentColor}22`,
                border: isMe ? 'none' : `1.5px solid ${accentColor}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: isMe ? '#06151E' : accentColor,
              }}>{initial}</div>
              <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 2, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isMe ? `${accentColor}18` : 'var(--c-surface)',
                  border: `1px solid ${isMe ? `${accentColor}44` : 'var(--c-border)'}`,
                  fontSize: 14, color: 'var(--c-text)', lineHeight: 1.45, wordBreak: 'break-word',
                }}>{msg.text}</div>
                <div style={{ fontSize: 10, color: 'var(--c-text-5)', paddingInline: 4 }}>{_timeSince(msg.ts)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '10px 12px 16px', borderTop: '1px solid var(--c-border)', flexShrink: 0, background: 'var(--c-bg)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Message ${friend.name}…`}
          rows={1}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 14, resize: 'none',
            border: '1px solid var(--c-border)',
            background: 'var(--c-surface)', color: 'var(--c-text)', fontSize: 14,
            outline: 'none', fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 100, overflowY: 'auto',
          }}
        />
        <button onClick={send} disabled={!canSend} style={{
          all: 'unset', cursor: canSend ? 'pointer' : 'default',
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: canSend ? accentColor : 'var(--c-surface)',
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
    </div>
  );
}

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

function ChatScreen({ accent, authToken, user, routeDep, onNewMessage, profileColor }) {
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
  const myAvatarColor = profileColor || accentColor;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-bg)', overflow: 'hidden' }}>

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
                  background: myAvatarColor,
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

// ═══════════════════════════════════════════════════════════════════════════
// WEB DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

const DB = {
  navy: '#1B3A5C', navyHover: '#22497A', navyActive: '#2B6CB0',
  bg: '#EEF2F8', card: '#FFFFFF', border: '#E2E8F0',
  text: '#1E293B', muted: '#64748B',
  blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#16A34A', greenSoft: '#F0FDF4',
  amber: '#D97706', amberSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2',
  orange: '#EA580C',
};

async function _fetchFuelDocks(lat, lon) {
  const d = 0.25;
  const bbox = `${lat-d},${lon-d},${lat+d},${lon+d}`;
  const q = `[out:json][timeout:12];(`+
    `node["waterway"="fuel"](${bbox});`+
    `node["seamark:type"="fuel_station"](${bbox});`+
    `node["amenity"="fuel"]["boat"="yes"](${bbox});`+
    `node["fuel:marine"="yes"](${bbox});`+
  `);out 8;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:`data=${encodeURIComponent(q)}`, headers:{'Content-Type':'application/x-www-form-urlencoded'} });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.elements||[]).map(el => ({
      name: el.tags?.name || el.tags?.operator || 'Fuel Dock',
      lat: el.lat, lon: el.lon,
      dist: Math.round(_haversineNm(lat,lon,el.lat,el.lon)*10)/10,
      price: el.tags?.['fuel:marine'] || el.tags?.fuel_price || null,
    })).filter(d => d.dist < 20).sort((a,b)=>a.dist-b.dist).slice(0,5);
  } catch { return []; }
}

async function _fetchMarinas(lat, lon) {
  const d = 0.3;
  const bbox = `${lat-d},${lon-d},${lat+d},${lon+d}`;
  const q = `[out:json][timeout:12];(node["leisure"="marina"](${bbox});way["leisure"="marina"](${bbox});node["amenity"="boat_rental"](${bbox}););out 8 center;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:`data=${encodeURIComponent(q)}`, headers:{'Content-Type':'application/x-www-form-urlencoded'} });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.elements||[]).map(el => {
      const eLat = el.lat ?? el.center?.lat;
      const eLon = el.lon ?? el.center?.lon;
      if (!eLat) return null;
      return { name: el.tags?.name || 'Marina', lat: eLat, lon: eLon, dist: Math.round(_haversineNm(lat,lon,eLat,eLon)*10)/10 };
    }).filter(Boolean).filter(m=>m.dist<25).sort((a,b)=>a.dist-b.dist).slice(0,5);
  } catch { return []; }
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function DashSidebar({ activeView, onNavigate, user, boat, profileColor, chatUnread, alertCount, vesselAlertCount, onLogout }) {
  const NAV_GROUPS = [
    { items: [
      { id:'home',     label:'Home',            icon:'home'    },
      { id:'chat',     label:'Chat',             icon:'chat',   badge: chatUnread },
    ]},
    { label: 'Navigate', items: [
      { id:'navigate', label:'Navigate',        icon:'compass'  },
      { id:'map',      label:'Map',             icon:'map'      },
      { id:'vessels',  label:'Live Vessels',    icon:'boat',    badge: vesselAlertCount },
      { id:'marinas',  label:'Marinas & Ramps', icon:'anchor'   },
    ]},
    { label: 'Conditions', items: [
      { id:'weather',    label:'Weather',    icon:'wind'    },
      { id:'windy',      label:'Windy',      icon:'wind'    },
      { id:'tides',      label:'Tide Gauge', icon:'anchor'  },
      { id:'sea-state',  label:'Sea State',  icon:'wind'    },
    ]},
    { label: 'Safety', items: [
      { id:'alerts',   label:'Alerts',   icon:'anchor', badge: alertCount },
      { id:'hazards',  label:'Hazards',  icon:'anchor'  },
    ]},
    { label: 'Trips', items: [
      { id:'trips',      label:'Trips & Plans', icon:'bookmark' },
      { id:'trip-logs',  label:'Trip Logger',   icon:'compass'  },
      { id:'fuel',       label:'Fuel',          icon:'anchor'   },
    ]},
    { items: [
      { id:'boats',      label:'My Boats', icon:'boat'     },
      { id:'settings',   label:'Settings', icon:'settings' },
    ]},
  ];
  return (
    <div style={{ width:214, minWidth:214, height:'100vh', background:DB.navy, color:'white', display:'flex', flexDirection:'column', flexShrink:0, zIndex:100, userSelect:'none' }}>
      <div style={{ padding:'16px 14px 14px', borderBottom:'1px solid rgba(255,255,255,0.09)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:'rgba(255,255,255,0.13)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Icon name="boat" size={21} color="white" sw={1.6}/>
          </div>
          <div>
            <div style={{ fontSize:13.5, fontWeight:800, letterSpacing:'0.07em', color:'white', lineHeight:1.1 }}>SAFE SEAS</div>
            <div style={{ fontSize:8.5, color:'rgba(255,255,255,0.42)', lineHeight:1.35, marginTop:2 }}>The Waze for Recreational Boaters</div>
          </div>
        </div>
      </div>
      <nav style={{ flex:1, padding:'6px 0', overflowY:'auto' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginTop: gi > 0 ? 10 : 0, paddingTop: gi > 0 ? 10 : 0, borderTop: gi > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
            {group.label && (
              <div style={{ padding:'2px 14px 5px', fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,0.34)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                {group.label}
              </div>
            )}
            {group.items.map(item => {
              const on = activeView === item.id;
              const bd = item.badge > 0 ? item.badge : 0;
              return (
                <button key={item.id} onClick={() => onNavigate(item.id)} style={{
                  all:'unset', cursor:'pointer', width:'100%', boxSizing:'border-box',
                  display:'flex', alignItems:'center', gap:9, padding:'8px 14px',
                  borderLeft:`3px solid ${on ? '#60C8F5' : 'transparent'}`,
                  background: on ? 'rgba(255,255,255,0.11)' : 'transparent',
                  color: on ? 'white' : 'rgba(255,255,255,0.58)',
                  fontSize:13, fontWeight: on ? 600 : 400, transition:'background 0.1s',
                }}
                  onMouseEnter={e => { if(!on) e.currentTarget.style.background='rgba(255,255,255,0.07)'; }}
                  onMouseLeave={e => { if(!on) e.currentTarget.style.background='transparent'; }}
                >
                  <Icon name={item.icon} size={15} color={on?'white':'rgba(255,255,255,0.58)'} sw={on?2.2:1.8}/>
                  <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</span>
                  {bd > 0 && <span style={{ background:'#EF4444', color:'white', borderRadius:99, fontSize:9.5, fontWeight:700, padding:'1px 6px', lineHeight:'15px' }}>{bd > 99 ? '99+' : bd}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* SOS button */}
      <button onClick={() => onNavigate('sos')} style={{
        all: 'unset', cursor: 'pointer', margin: '6px 10px 2px', borderRadius: 10, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 14px',
        background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.45)',
        color: '#FCA5A5', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em',
        transition: 'background 0.15s, border-color 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.28)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.75)'; }}
        onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.45)'; }}
      >
        🚨 EMERGENCY
      </button>

      <div style={{ borderTop:'1px solid rgba(255,255,255,0.09)', padding:12, marginTop:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom: boat ? 10 : 0 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background: profileColor||'#22E3D0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#06151E', flexShrink:0, cursor:'pointer' }} onClick={() => onNavigate('settings')}>
            {(user?.name||'U')[0].toUpperCase()}
          </div>
          <div style={{ overflow:'hidden', flex:1, minWidth:0 }}>
            <div style={{ fontSize:12.5, fontWeight:600, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name||'User'}</div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.42)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{boat?.name||'No boat selected'}</div>
          </div>
        </div>
        {boat && (
          <div style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'7px 10px', cursor:'pointer' }} onClick={() => onNavigate('boats')}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.38)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>Boat Profile</div>
            <div style={{ fontSize:12, color:'white', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{boat.type||'Motorboat'} · {boat.name}</div>
            {(boat.height||boat.mastHeight) && <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2 }}>Height {boat.height||boat.mastHeight}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Top Bar ──────────────────────────────────────────────────────────────────
function DashTopBar({ searchVal, setSearchVal, onSearch, user, chatUnread, profileColor, accent, alertCount, onNavigate }) {
  return (
    <div style={{ background:DB.card, borderBottom:`1px solid ${DB.border}`, padding:'10px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0, zIndex:50 }}>
      <div style={{ flex:1, position:'relative', maxWidth:680 }}>
        <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
          <Icon name="search" size={16} color={DB.muted}/>
        </div>
        <input value={searchVal} onChange={e=>setSearchVal(e.target.value)} onKeyDown={onSearch}
          placeholder="Where do you want to go on the water?"
          style={{ width:'100%', boxSizing:'border-box', paddingLeft:38, paddingRight:40, paddingTop:9, paddingBottom:9, border:`1.5px solid ${DB.border}`, borderRadius:24, fontSize:13.5, color:DB.text, background:'#F8FAFC', outline:'none', fontFamily:'inherit' }}
          onFocus={e => e.target.style.borderColor = accent}
          onBlur={e => e.target.style.borderColor = DB.border}
        />
        <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:16, cursor:'pointer' }}>🎤</span>
      </div>
      {[
        { icon: null, emoji:'🔔', badge: alertCount, onClick: () => onNavigate('alerts') },
        { icon:'chat', badge: chatUnread, onClick: () => onNavigate('chat') },
      ].map((btn, i) => (
        <button key={i} onClick={btn.onClick} style={{ all:'unset', cursor:'pointer', position:'relative', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:10, background:'#F1F5F9', flexShrink:0 }}>
          {btn.emoji ? <span style={{ fontSize:18 }}>{btn.emoji}</span> : <Icon name={btn.icon} size={18} color={DB.muted}/>}
          {btn.badge > 0 && <span style={{ position:'absolute', top:4, right:4, minWidth:14, height:14, borderRadius:99, background:'#EF4444', color:'white', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px' }}>{btn.badge}</span>}
        </button>
      ))}
      <div style={{ width:36, height:36, borderRadius:'50%', background: profileColor||'#22E3D0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#06151E', cursor:'pointer', flexShrink:0 }} onClick={() => onNavigate('settings')}>
        {(user?.name||'U')[0].toUpperCase()}
      </div>
    </div>
  );
}

// ── Info Cards Strip ─────────────────────────────────────────────────────────
function DashInfoCards({ boat, fuelRangeMi, fuelPct, nextBridge, weather, accent, onPickBoat, onSOS }) {
  const tempF = weather?.airTemp_f ?? weather?.waterTemp_f;
  const cards = [
    {
      id:'boat', label:'BOAT PROFILE', accent: DB.blue, onClick: onPickBoat,
      content: boat ? (
        <>
          <div style={{ fontSize:14.5, fontWeight:700, color:DB.text, lineHeight:1.2 }}>{boat.type||'Motorboat'} <span style={{ fontWeight:400, color:DB.muted, fontSize:12.5 }}>{boat.name}</span></div>
          {(boat.height||boat.mastHeight) && <div style={{ fontSize:12, color:DB.blue, fontWeight:600, marginTop:4 }}>Height {boat.height||boat.mastHeight}</div>}
        </>
      ) : <div style={{ fontSize:13, color:DB.blue, fontWeight:600, cursor:'pointer' }}>Add a Boat →</div>,
    },
    {
      id:'fuel', label:'FUEL RANGE', accent: DB.green,
      content: (
        <>
          <div style={{ fontSize:19, fontWeight:700, color:DB.text, lineHeight:1 }}>{fuelRangeMi} <span style={{ fontSize:12, fontWeight:600, color:DB.muted }}>mi</span></div>
          <div style={{ marginTop:7, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${fuelPct}%`, borderRadius:99, background: fuelPct>30 ? DB.green : fuelPct>15 ? DB.amber : DB.red, transition:'width 0.4s' }}/>
          </div>
          <div style={{ fontSize:11, color:DB.muted, marginTop:4 }}>{fuelPct}% Remaining</div>
        </>
      ),
    },
    {
      id:'bridge', label:'NEXT BRIDGE', accent: DB.orange,
      content: nextBridge ? (
        <>
          <div style={{ fontSize:13.5, fontWeight:700, color:DB.text, lineHeight:1.25 }}>{nextBridge.name||'Upcoming Bridge'}</div>
          <div style={{ fontSize:12.5, fontWeight:700, color: nextBridge.verClr_ft<25 ? DB.red : DB.amber, marginTop:4 }}>Clearance {nextBridge.verClr_ft}ft</div>
          <div style={{ fontSize:11, color:DB.muted, marginTop:2 }}>{nextBridge.dist_km} km away</div>
        </>
      ) : <div style={{ fontSize:12.5, color:DB.muted, paddingTop:4 }}>No bridges on active route</div>,
    },
    {
      id:'weather', label:'WEATHER', accent:'#0EA5E9',
      content: weather ? (
        <>
          {tempF != null && <div style={{ fontSize:19, fontWeight:700, color:DB.text, lineHeight:1 }}>{tempF}°F</div>}
          {weather.waveHeight_ft != null && <div style={{ fontSize:12, color:DB.muted, marginTop:3 }}>Waves {weather.waveHeight_ft}ft</div>}
          {weather.windSpeed_kt != null && <div style={{ fontSize:12, color:DB.muted }}>Wind {weather.windSpeed_kt}kt{weather.windGust_kt ? ` G${weather.windGust_kt}` : ''}</div>}
        </>
      ) : <div style={{ fontSize:12, color:DB.muted, paddingTop:4 }}>Fetching conditions…</div>,
    },
    {
      id:'sos', label:'EMERGENCY', cardBg: DB.red, accent:'white', noArrow:true, onClick: onSOS,
      content: (
        <>
          <div style={{ fontSize:15, fontWeight:800, color:'white', lineHeight:1.2 }}>Emergency</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:3, fontWeight:600 }}>Tap for Help</div>
          <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.6)', marginTop:5, lineHeight:1.4 }}>MAYDAY script · Coast Guard contacts</div>
        </>
      ),
    },
  ];
  return (
    <div style={{ background:DB.bg, padding:'8px 10px', display:'flex', gap:8, flexShrink:0 }}>
      {cards.map(card => (
        <div key={card.id} onClick={card.onClick}
          style={{ flex:1, minWidth:0, background: card.cardBg||DB.card, border:`1px solid ${card.cardBg ? 'transparent' : DB.border}`, borderRadius:12, padding:'10px 12px', cursor: card.onClick || card.id==='sos' ? 'pointer' : 'default', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', transition:'transform 0.12s, box-shadow 0.12s', boxSizing:'border-box' }}
          onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'; }}
        >
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
            <span style={{ fontSize:9.5, fontWeight:700, color: card.cardBg ? 'rgba(255,255,255,0.55)' : card.accent || DB.blue, letterSpacing:'0.07em' }}>{card.label}</span>
            {!card.noArrow && card.onClick && <span style={{ fontSize:11, color:DB.muted }}>›</span>}
          </div>
          {card.content}
        </div>
      ))}
    </div>
  );
}

// ── Right Panel ───────────────────────────────────────────────────────────────
function DashRightPanel({ alerts, fuelDocks, hazards, marinas, onOpenChat }) {
  const Section = ({ title, badge, children }) => (
    <div style={{ background:DB.card, border:`1px solid ${DB.border}`, borderRadius:12, marginBottom:8, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 12px 8px', borderBottom:`1px solid ${DB.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ fontSize:11.5, fontWeight:700, color:DB.blue, letterSpacing:'0.04em' }}>{title}</span>
          {badge > 0 && <span style={{ background:DB.red, color:'white', borderRadius:99, fontSize:9.5, fontWeight:700, padding:'1px 6px', lineHeight:'15px' }}>{badge}</span>}
        </div>
        <button style={{ all:'unset', cursor:'pointer', fontSize:11, color:DB.blue, fontWeight:600 }}>View all</button>
      </div>
      <div>{children}</div>
    </div>
  );
  const Row = ({ emoji, label, sub, right, tint }) => (
    <div style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 12px' }}>
      <div style={{ width:28, height:28, borderRadius:8, background: tint||'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{emoji}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12.5, fontWeight:600, color:DB.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:DB.muted, marginTop:1 }}>{sub}</div>}
      </div>
      {right && <div style={{ fontSize:11.5, color:DB.muted, flexShrink:0, fontWeight:500 }}>{right}</div>}
    </div>
  );
  const Empty = ({ msg }) => <div style={{ padding:'9px 12px', fontSize:12, color:DB.muted }}>{msg}</div>;
  return (
    <div style={{ width:282, minWidth:282, height:'100%', overflowY:'auto', background:DB.bg, padding:'8px 8px 8px 0', flexShrink:0, boxSizing:'border-box' }}>
      <Section title="ALERTS" badge={alerts.length}>
        {alerts.length === 0
          ? <Empty msg="No active alerts"/>
          : alerts.slice(0,4).map((a,i) => (
            <Row key={i}
              emoji={a.type==='danger'?'🚨':a.type==='warning'?'⚠️':'ℹ️'}
              tint={a.type==='danger'?'#FEE2E2':a.type==='warning'?'#FEF9C3':'#EFF6FF'}
              label={a.text.length>46 ? a.text.slice(0,46)+'…' : a.text}
            />
          ))
        }
      </Section>
      <Section title="FUEL DOCKS NEARBY">
        {fuelDocks.length === 0
          ? <Empty msg="No fuel docks found nearby"/>
          : fuelDocks.map((d,i) => <Row key={i} emoji="⛽" tint="#F0FDF4" label={d.name} sub={`${d.dist} mi away`} right={d.price ? `${d.price}/gal` : null}/>)
        }
      </Section>
      <Section title="HAZARDS NEARBY">
        {hazards.length === 0
          ? <Empty msg="No hazards along route"/>
          : hazards.slice(0,4).map((h,i) => {
            const ico = h.type==='rock'||h.type==='reef'?'🪨':h.type==='wreck'?'🚢':h.type==='shoal'?'🏖️':'⚠️';
            return <Row key={i} emoji={ico} tint="#FFFBEB" label={h.name||h.type||'Hazard'} sub={h.type}/>;
          })
        }
      </Section>
      <Section title="MARINAS & RAMPS NEARBY">
        {marinas.length === 0
          ? <Empty msg="No marinas found nearby"/>
          : marinas.map((m,i) => <Row key={i} emoji="⚓" tint="#EFF6FF" label={m.name} right={`${m.dist} mi`}/>)
        }
      </Section>
      <Section title="BOATER CHAT">
        <div style={{ padding:'8px 12px' }}>
          <div style={{ fontSize:12, color:DB.muted, marginBottom:8 }}>Connect with nearby boaters in real time</div>
          <button onClick={onOpenChat} style={{ all:'unset', cursor:'pointer', display:'block', width:'100%', boxSizing:'border-box', padding:'8px 0', borderRadius:8, textAlign:'center', background:DB.blue, color:'white', fontSize:13, fontWeight:600 }}>Open Chat</button>
        </div>
      </Section>
    </div>
  );
}

// ── Trip Bar ─────────────────────────────────────────────────────────────────
function DashTripBar({ route, currentTrip, fuelLevel, fuelPct, fuelCap, fuelRangeMi, routeDistMi, onPlan }) {
  const from = currentTrip?.from || route?.from || '—';
  const to   = currentTrip?.to   || route?.to   || '—';
  const speed = 20;
  const etaMins = routeDistMi > 0 ? Math.round((routeDistMi / speed) * 60) : null;
  const etaStr  = etaMins ? (etaMins >= 60 ? `${Math.floor(etaMins/60)}h ${etaMins%60}m` : `${etaMins}m`) : null;
  const fuelUsed = Math.max(0, fuelCap - fuelLevel);
  const gaugeColor = fuelPct > 30 ? DB.green : fuelPct > 15 ? DB.amber : DB.red;
  const arcLen = Math.PI * 22;

  return (
    <div style={{ background:DB.card, borderTop:`1px solid ${DB.border}`, display:'flex', alignItems:'stretch', flexShrink:0, boxShadow:'0 -2px 8px rgba(0,0,0,0.04)', minHeight:100 }}>
      {/* Current Trip */}
      <div style={{ flex:1.3, padding:'10px 14px', borderRight:`1px solid ${DB.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
          <span style={{ fontSize:10, fontWeight:700, color:DB.blue, letterSpacing:'0.06em' }}>CURRENT TRIP</span>
          <button onClick={onPlan} style={{ all:'unset', cursor:'pointer', fontSize:10.5, color:DB.blue, fontWeight:600 }}>✏ Edit</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:9.5, color:DB.muted, fontWeight:600, marginBottom:1 }}>From</div>
            <div style={{ fontSize:12.5, fontWeight:600, color:DB.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{from}</div>
          </div>
          <span style={{ color:DB.muted, fontSize:15, flexShrink:0 }}>→</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:9.5, color:DB.muted, fontWeight:600, marginBottom:1 }}>To</div>
            <div style={{ fontSize:12.5, fontWeight:600, color:DB.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{to}</div>
          </div>
        </div>
        {routeDistMi > 0 && (
          <div style={{ display:'flex', gap:12, marginTop:7 }}>
            {etaStr && <span style={{ fontSize:11.5, color:DB.muted }}><b style={{ color:DB.text }}>ETA</b> {etaStr}</span>}
            <span style={{ fontSize:11.5, color:DB.muted }}><b style={{ color:DB.text }}>{routeDistMi}</b> mi</span>
          </div>
        )}
      </div>
      {/* Trip Progress */}
      <div style={{ flex:1.3, padding:'10px 16px', borderRight:`1px solid ${DB.border}` }}>
        <div style={{ fontSize:10, fontWeight:700, color:DB.blue, letterSpacing:'0.06em', marginBottom:10 }}>TRIP PROGRESS</div>
        <div style={{ display:'flex', alignItems:'center' }}>
          {[{ label: from, icon:'anchor' }, { label:'En Route', icon:'boat' }, { label: to, icon:'pin' }].map((node, i, arr) => (
            <React.Fragment key={i}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background: i===0||i===arr.length-1 ? DB.blue : '#E2E8F0', border:`2px solid ${i===0||i===arr.length-1 ? DB.blue : '#CBD5E1'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name={node.icon} size={12} color={i===0||i===arr.length-1?'white':DB.muted} sw={2}/>
                </div>
                <div style={{ fontSize:9, color:DB.muted, maxWidth:56, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{node.label}</div>
              </div>
              {i < arr.length-1 && <div style={{ flex:1, height:2, background: i===0 ? `linear-gradient(90deg,${DB.blue},#CBD5E1)` : '#E2E8F0', margin:'0 3px', marginBottom:14 }}/>}
            </React.Fragment>
          ))}
        </div>
      </div>
      {/* My Fuel */}
      <div style={{ flex:1, padding:'10px 14px', borderRight:`1px solid ${DB.border}` }}>
        <div style={{ fontSize:10, fontWeight:700, color:DB.blue, letterSpacing:'0.06em', marginBottom:6 }}>MY FUEL</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <svg width={58} height={32} viewBox="0 0 58 32" style={{ flexShrink:0 }}>
            <path d="M 5 30 A 24 24 0 0 1 53 30" fill="none" stroke="#E2E8F0" strokeWidth={5.5} strokeLinecap="round"/>
            <path d="M 5 30 A 24 24 0 0 1 53 30" fill="none" stroke={gaugeColor}
              strokeWidth={5.5} strokeLinecap="round"
              strokeDasharray={`${arcLen * (fuelPct/100)} ${arcLen}`}/>
            <text x="29" y="28" textAnchor="middle" fontSize="9" fontWeight="700" fill={DB.text}>{fuelPct}%</text>
          </svg>
          <div style={{ fontSize:11 }}>
            <div style={{ color:DB.muted }}>Tank <span style={{ fontWeight:700, color:DB.text }}>{fuelCap}gal</span></div>
            <div style={{ color:DB.muted }}>Used <span style={{ fontWeight:700, color:DB.text }}>{fuelUsed.toFixed(1)}gal</span></div>
            <div style={{ color:DB.muted }}>Range <span style={{ fontWeight:700, color:DB.text }}>{fuelRangeMi}mi</span></div>
          </div>
        </div>
      </div>
      {/* Quick Actions */}
      <div style={{ flex:0.85, padding:'10px 12px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:DB.blue, letterSpacing:'0.06em', marginBottom:8 }}>QUICK ACTIONS</div>
        <div style={{ display:'flex', gap:5 }}>
          {[
            { emoji:'🗺️', label:'Plan Trip',        onClick: onPlan },
            { emoji:'⏺️', label:'Record Trip',      onClick: ()=>{} },
            { emoji:'📍', label:'Share\nLocation',  onClick: ()=>{} },
          ].map((a,i) => (
            <button key={i} onClick={a.onClick} style={{ all:'unset', cursor:'pointer', flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'6px 3px', borderRadius:8, background:'#F8FAFC', border:`1px solid ${DB.border}`, transition:'background 0.1s', textAlign:'center' }}
              onMouseEnter={e => e.currentTarget.style.background='#EFF6FF'}
              onMouseLeave={e => e.currentTarget.style.background='#F8FAFC'}
            >
              <span style={{ fontSize:18 }}>{a.emoji}</span>
              <span style={{ fontSize:9, color:DB.muted, fontWeight:600, lineHeight:1.3, whiteSpace:'pre-line' }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Bottom Tab Bar ───────────────────────────────────────────────────────────
function DashBottomTab({ activeView, onNavigate, chatUnread, alertCount, accent }) {
  const TABS = [
    { id:'home',    label:'Home',          icon:'home'     },
    { id:'alerts',  label:'Alerts',        icon:'anchor',  badge: alertCount },
    { id:'hazards-report', label:'Report Hazard', center:true },
    { id:'trips',   label:'Trips',         icon:'bookmark' },
    { id:'boats',   label:'More',          icon:'settings' },
  ];
  return (
    <div style={{ background:DB.card, borderTop:`1px solid ${DB.border}`, display:'flex', alignItems:'center', flexShrink:0, height:52 }}>
      {TABS.map(tab => {
        const on = activeView === tab.id;
        if (tab.center) return (
          <button key={tab.id} onClick={() => onNavigate(tab.id)} style={{ all:'unset', cursor:'pointer', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2 }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:DB.blue, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 2px 10px ${DB.blue}55`, marginTop:-10 }}>
              <Icon name="plus" size={18} color="white" sw={2.5}/>
            </div>
            <span style={{ fontSize:9, fontWeight:600, color:DB.blue }}>{tab.label}</span>
          </button>
        );
        return (
          <button key={tab.id} onClick={() => onNavigate(tab.id)} style={{
            all:'unset', cursor:'pointer', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, height:'100%',
            color: on ? DB.blue : DB.muted,
            borderTop:`2px solid ${on ? DB.blue : 'transparent'}`,
          }}>
            <div style={{ position:'relative' }}>
              <Icon name={tab.icon} size={17} color={on?DB.blue:DB.muted} sw={on?2.2:1.8}/>
              {tab.badge > 0 && <span style={{ position:'absolute', top:-4, right:-6, minWidth:13, height:13, borderRadius:99, background:'#EF4444', color:'white', fontSize:8.5, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px' }}>{tab.badge}</span>}
            </div>
            <span style={{ fontSize:9.5, fontWeight: on ? 700 : 500 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Vessels View ──────────────────────────────────────────────────────────────
function VesselsView({ vessels, userPos, aisConnected, accent }) {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('dist');

  const withDist = vessels.map(v => ({
    ...v,
    distNm: userPos ? _haversineNm(userPos.lat, userPos.lng, v.lat, v.lng) : null,
    cpa: userPos ? _computeCPA(userPos.lat, userPos.lng, 0, 0, v.lat, v.lng, v.sog||0, v.cog||0) : null,
  }));

  const TYPE_FILTERS = [
    { id:'all',       label:'All' },
    { id:'cargo',     label:'🚢 Cargo',     test: v => v.shipType >= 70 && v.shipType <= 79 },
    { id:'tanker',    label:'🛢 Tanker',    test: v => v.shipType >= 80 && v.shipType <= 89 },
    { id:'passenger', label:'🛳 Passenger', test: v => v.shipType >= 60 && v.shipType <= 69 },
    { id:'fishing',   label:'🎣 Fishing',   test: v => v.shipType === 30 },
    { id:'pleasure',  label:'⛵ Pleasure',  test: v => v.shipType === 36 || v.shipType === 37 },
  ];

  const filterFn = TYPE_FILTERS.find(f => f.id === filter);
  const filtered = filter === 'all' ? withDist : withDist.filter(filterFn?.test || (()=>true));
  const sorted   = [...filtered].sort((a,b) => {
    if (sortBy === 'dist') return (a.distNm??999) - (b.distNm??999);
    if (sortBy === 'speed') return (b.sog||0) - (a.sog||0);
    if (sortBy === 'cpa') return (a.cpa?.dNm??999) - (b.cpa?.dNm??999);
    return 0;
  });

  const cpaAlerts = withDist.filter(v => v.cpa && v.cpa.dNm < 0.5 && v.cpa.tMin > 0 && v.cpa.tMin < 20);

  const compassDir = deg => {
    if (deg == null) return '—';
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(deg/45)%8];
  };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:DB.bg }}>
      {/* Header */}
      <div style={{ padding:'14px 16px 10px', background:DB.card, borderBottom:`1px solid ${DB.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:DB.text }}>Live Vessels</h2>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background: aisConnected ? DB.green : DB.muted, boxShadow: aisConnected ? `0 0 6px ${DB.green}` : 'none' }}/>
              <span style={{ fontSize:13, color:DB.muted }}>{aisConnected ? `${vessels.length} vessels in range` : 'AIS disconnected'}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {['dist','speed','cpa'].map(s => (
              <button key={s} onClick={()=>setSortBy(s)} style={{ all:'unset', cursor:'pointer', padding:'4px 10px', borderRadius:99, fontSize:11.5, fontWeight:600, border:`1.5px solid ${sortBy===s?DB.blue:DB.border}`, background:sortBy===s?DB.blueSoft:'white', color:sortBy===s?DB.blue:DB.muted }}>
                {s==='dist'?'Distance':s==='speed'?'Speed':'CPA'}
              </button>
            ))}
          </div>
        </div>

        {/* Type filter chips */}
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
          {TYPE_FILTERS.map(f => (
            <button key={f.id} onClick={()=>setFilter(f.id)} style={{ all:'unset', cursor:'pointer', flexShrink:0, padding:'4px 12px', borderRadius:99, fontSize:12, fontWeight:600, border:`1.5px solid ${filter===f.id?DB.blue:DB.border}`, background:filter===f.id?DB.blueSoft:'white', color:filter===f.id?DB.blue:DB.muted }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:12 }}>
        {/* CPA alerts banner */}
        {cpaAlerts.length > 0 && (
          <div style={{ background:DB.redSoft, border:`1.5px solid ${DB.red}44`, borderLeft:`4px solid ${DB.red}`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:800, color:DB.red, marginBottom:4 }}>⚠ Collision Risk — {cpaAlerts.length} vessel{cpaAlerts.length>1?'s':''}</div>
            {cpaAlerts.map(v => (
              <div key={v.mmsi} style={{ fontSize:12.5, color:DB.text, marginTop:3 }}>
                <b>{v.name}</b> — CPA {v.cpa.dNm.toFixed(2)} nm in {Math.round(v.cpa.tMin)} min
              </div>
            ))}
          </div>
        )}

        {!aisConnected && vessels.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0', color:DB.muted }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📡</div>
            <div style={{ fontSize:15, fontWeight:700, color:DB.text, marginBottom:6 }}>AIS Not Connected</div>
            <div style={{ fontSize:13 }}>Set a location or enable GPS to stream live vessel data.</div>
          </div>
        )}

        {sorted.map(v => {
          const warn = v.cpa && v.cpa.dNm < 0.5 && v.cpa.tMin > 0 && v.cpa.tMin < 20;
          const caution = v.cpa && v.cpa.dNm < 1.0 && v.cpa.tMin > 0 && v.cpa.tMin < 30 && !warn;
          return (
            <div key={v.mmsi} style={{ background: warn ? DB.redSoft : 'white', border:`1.5px solid ${warn?DB.red:caution?DB.amber:DB.border}`, borderRadius:13, padding:'10px 14px', marginBottom:8, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
                {/* Vessel icon */}
                <div style={{ width:36, height:36, borderRadius:10, background:`${_vesselColor(v.shipType)}22`, border:`1.5px solid ${_vesselColor(v.shipType)}55`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="12" height="16" viewBox="0 0 14 18" style={{ transform:`rotate(${v.cog||0}deg)` }}>
                    <polygon points="7,0 14,18 7,13 0,18" fill={_vesselColor(v.shipType)}/>
                  </svg>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:DB.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.name}</span>
                    {warn && <span style={{ fontSize:11, fontWeight:800, color:DB.red, flexShrink:0 }}>⚠ CPA ALERT</span>}
                    {caution && <span style={{ fontSize:11, fontWeight:700, color:DB.amber, flexShrink:0 }}>⚠ Caution</span>}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))', gap:'2px 12px', fontSize:12, color:DB.muted }}>
                    {v.shipType > 0 && <span style={{ color:DB.blue, fontWeight:600 }}>{_vesselTypeName(v.shipType)}</span>}
                    {v.distNm != null && <span>📍 {v.distNm < 1 ? (v.distNm*10).toFixed(0)*100+'yd' : v.distNm.toFixed(2)+' nm'} away</span>}
                    {v.sog != null && <span>⚡ {v.sog.toFixed(1)} kt</span>}
                    {v.cog != null && <span>🧭 {Math.round(v.cog)}° {compassDir(v.cog)}</span>}
                    {v.cpa && v.cpa.tMin < 60 && <span style={{ color: warn?DB.red:caution?DB.amber:DB.muted, fontWeight: (warn||caution)?700:400 }}>CPA {v.cpa.dNm.toFixed(2)} nm / {Math.round(v.cpa.tMin)} min</span>}
                    {v.destination && <span>🏁 {v.destination}</span>}
                    {v.dimLength > 0 && <span>📏 {v.dimLength}m</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FUEL_KEY = id => `safeseas_fuel_${id}`;

// ── Fill-Up Modal ─────────────────────────────────────────────────────────────
function FillUpModal({ boat, lat, lon, locationName, authToken, onClose, onSubmitted }) {
  const cap = boat?.fuelCapacity || boat?.tank || 0;
  const cur = boat?.id ? parseFloat(localStorage.getItem(FUEL_KEY(boat.id)) || '0') : 0;

  const [gallons, setGallons]     = useState('');
  const [price, setPrice]         = useState('');
  const [note, setNote]           = useState('');
  const [full, setFull]           = useState(false);
  const [submitting, setSub]      = useState(false);
  const [error, setError]         = useState('');

  const gal = parseFloat(gallons) || 0;
  const newLevel = Math.min(cap || 9999, cur + gal);
  const totalCost = gal && price ? (gal * parseFloat(price)).toFixed(2) : null;

  const submit = async () => {
    if (!gal || gal <= 0) { setError('Enter gallons added'); return; }
    setSub(true); setError('');
    try {
      const r = await fetch(`${API}/api/fuel`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({
          boatId: boat?.id, gallons: gal, pricePerGal: price || null,
          locationName: locationName || null, lat, lon, note, fillToFull: full,
        }),
      });
      if (!r.ok) { const e = await r.json(); setError(e.error || 'Failed'); setSub(false); return; }
      // Update localStorage tank level
      if (boat?.id) {
        const level = full && cap ? cap : newLevel;
        localStorage.setItem(FUEL_KEY(boat.id), String(level));
      }
      onSubmitted?.();
      onClose();
    } catch { setError('Network error'); setSub(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'white', borderRadius:18, padding:24, width:420, maxWidth:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div>
            <h3 style={{ margin:0, fontSize:17, fontWeight:800, color:DB.text }}>Log Fill-Up</h3>
            <div style={{ fontSize:12, color:DB.muted, marginTop:2 }}>{boat?.name || 'Current boat'}</div>
          </div>
          <button onClick={onClose} style={{ all:'unset', cursor:'pointer', fontSize:22, color:DB.muted }}>✕</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:DB.blue, letterSpacing:'0.06em', display:'block', marginBottom:5 }}>GALLONS ADDED *</label>
            <input type="number" min="0" step="0.1" value={gallons} onChange={e=>setGallons(e.target.value)}
              placeholder="e.g. 24.5"
              style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', border:`1.5px solid ${DB.border}`, borderRadius:9, fontSize:14, fontFamily:'inherit', outline:'none' }}
              onFocus={e=>e.target.style.borderColor=DB.blue} onBlur={e=>e.target.style.borderColor=DB.border}/>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:DB.blue, letterSpacing:'0.06em', display:'block', marginBottom:5 }}>PRICE / GAL <span style={{ color:DB.muted, fontWeight:400 }}>(optional)</span></label>
            <input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}
              placeholder="e.g. 4.89"
              style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', border:`1.5px solid ${DB.border}`, borderRadius:9, fontSize:14, fontFamily:'inherit', outline:'none' }}
              onFocus={e=>e.target.style.borderColor=DB.blue} onBlur={e=>e.target.style.borderColor=DB.border}/>
          </div>
        </div>

        {cap > 0 && gal > 0 && (
          <div style={{ background:DB.greenSoft, border:`1px solid ${DB.green}33`, borderRadius:10, padding:'9px 12px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ fontSize:12, color:DB.muted }}>New tank level</span>
              <span style={{ fontSize:13, fontWeight:700, color:DB.green }}>{Math.min(newLevel, cap).toFixed(1)} / {cap} gal</span>
            </div>
            <div style={{ height:5, borderRadius:99, background:'#D1FAE5', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(100,(newLevel/cap)*100)}%`, background:DB.green, borderRadius:99 }}/>
            </div>
            {totalCost && <div style={{ fontSize:12, color:DB.muted, marginTop:6 }}>Total cost: <b style={{ color:DB.text }}>${totalCost}</b></div>}
          </div>
        )}

        <label style={{ display:'flex', alignItems:'center', gap:9, marginBottom:14, cursor:'pointer', fontSize:13.5, color:DB.text, fontWeight:500 }}>
          <input type="checkbox" checked={full} onChange={e=>setFull(e.target.checked)} style={{ width:16, height:16, accentColor:DB.green }}/>
          Filled tank to full
        </label>

        <div>
          <label style={{ fontSize:11, fontWeight:700, color:DB.blue, letterSpacing:'0.06em', display:'block', marginBottom:5 }}>NOTE <span style={{ color:DB.muted, fontWeight:400 }}>(optional)</span></label>
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Marina name, dock, etc."
            style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', border:`1.5px solid ${DB.border}`, borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:14 }}
            onFocus={e=>e.target.style.borderColor=DB.blue} onBlur={e=>e.target.style.borderColor=DB.border}/>
        </div>

        {locationName && (
          <div style={{ fontSize:12, color:DB.muted, marginBottom:12 }}>📍 {locationName}</div>
        )}

        {error && <div style={{ background:DB.redSoft, border:`1px solid ${DB.red}33`, borderRadius:8, padding:'8px 12px', fontSize:13, color:DB.red, marginBottom:12 }}>{error}</div>}

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ all:'unset', cursor:'pointer', flex:1, padding:'11px 0', textAlign:'center', borderRadius:10, border:`1.5px solid ${DB.border}`, fontSize:13.5, fontWeight:600, color:DB.muted }}>Cancel</button>
          <button onClick={submit} disabled={submitting} style={{ all:'unset', cursor:submitting?'not-allowed':'pointer', flex:2, padding:'11px 0', textAlign:'center', borderRadius:10, background:submitting?'#94A3B8':DB.green, color:'white', fontSize:13.5, fontWeight:700 }}>
            {submitting ? 'Saving…' : '⛽ Log Fill-Up'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fuel View ─────────────────────────────────────────────────────────────────
function FuelView({ boat, authToken, route, appUserPos }) {
  const cap      = boat?.fuelCapacity || boat?.tank || 0;
  const fuelKey  = boat?.id ? FUEL_KEY(boat.id) : null;
  const [level, setLevelState] = useState(() => fuelKey ? parseFloat(localStorage.getItem(fuelKey) || '0') : 0);
  const [log, setLog]           = useState([]);
  const [showFillUp, setFillUp] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const setLevel = v => {
    const clamped = Math.max(0, Math.min(cap || 9999, v));
    setLevelState(clamped);
    if (fuelKey) localStorage.setItem(fuelKey, String(clamped));
  };

  const fetchLog = () => {
    if (!authToken) return;
    const q = boat?.id ? `?boatId=${boat.id}` : '';
    fetch(`${API}/api/fuel${q}`, { headers:{ 'Authorization':`Bearer ${authToken}` }})
      .then(r => r.ok ? r.json() : []).then(setLog).catch(()=>{});
  };
  useEffect(fetchLog, [boat?.id, authToken]);

  const deleteEntry = async id => {
    setDeleting(id);
    await fetch(`${API}/api/fuel/${id}`, { method:'DELETE', headers:{ 'Authorization':`Bearer ${authToken}` }}).catch(()=>{});
    setLog(prev => prev.filter(e => e.id !== id));
    setDeleting(null);
  };

  const pct    = cap > 0 ? Math.min(100, Math.round((level/cap)*100)) : 0;
  const color  = pct > 30 ? DB.green : pct > 15 ? DB.amber : DB.red;
  const rangeNm  = (boat?.fuelBurn>0 && boat?.cruiseSpeed>0 && level>0) ? (level/boat.fuelBurn)*boat.cruiseSpeed : 0;
  const rangeMi  = Math.round(rangeNm * 1.151);
  const routeDistNm = route?.waypoints ? _routeDistNm(route.waypoints) : 0;
  const routeDistMi = Math.round(routeDistNm * 1.151);
  const routeOk  = !routeDistNm || rangeNm >= routeDistNm;

  const totalGal  = log.reduce((s,e)=>s+e.gallons,0);
  const totalCost = log.filter(e=>e.totalCost).reduce((s,e)=>s+(e.totalCost||0),0);
  const avgPrice  = log.filter(e=>e.pricePerGal).length
    ? (log.filter(e=>e.pricePerGal).reduce((s,e)=>s+e.pricePerGal,0)/log.filter(e=>e.pricePerGal).length).toFixed(2)
    : null;

  const arcR = 52, arcLen = Math.PI * arcR;

  return (
    <div style={{ height:'100%', overflowY:'auto', background:DB.bg, padding:16 }}>
      <div style={{ maxWidth:800, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:DB.text }}>Fuel</h2>
            <div style={{ fontSize:13, color:DB.muted, marginTop:3 }}>{boat?.name || 'Select a boat to track fuel'}</div>
          </div>
          {boat && (
            <button onClick={()=>setFillUp(true)} style={{ all:'unset', cursor:'pointer', display:'flex', alignItems:'center', gap:7, padding:'9px 16px', background:DB.green, color:'white', borderRadius:10, fontSize:13, fontWeight:700, boxShadow:`0 2px 8px ${DB.green}55` }}>
              <span>⛽</span> Log Fill-Up
            </button>
          )}
        </div>

        {/* Tank gauge + level control */}
        {boat && (
          <div style={{ background:DB.card, border:`1px solid ${DB.border}`, borderRadius:14, padding:'20px 24px', marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:24 }}>
              {/* Arc gauge */}
              <svg width={130} height={76} viewBox="0 0 130 76" style={{ flexShrink:0 }}>
                <path d={`M 10 74 A ${arcR} ${arcR} 0 0 1 120 74`} fill="none" stroke="#E2E8F0" strokeWidth={10} strokeLinecap="round"/>
                <path d={`M 10 74 A ${arcR} ${arcR} 0 0 1 120 74`} fill="none" stroke={color}
                  strokeWidth={10} strokeLinecap="round"
                  strokeDasharray={`${arcLen * pct/100} ${arcLen}`}/>
                <text x="65" y="62" textAnchor="middle" fontSize="18" fontWeight="800" fill={DB.text}>{pct}%</text>
                <text x="65" y="76" textAnchor="middle" fontSize="10" fill={DB.muted}>{level.toFixed(1)} gal</text>
              </svg>
              {/* Stats + slider */}
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', gap:16, marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:11, color:DB.muted, fontWeight:600 }}>TANK SIZE</div>
                    <div style={{ fontSize:16, fontWeight:700, color:DB.text }}>{cap > 0 ? `${cap} gal` : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:DB.muted, fontWeight:600 }}>EST. RANGE</div>
                    <div style={{ fontSize:16, fontWeight:700, color: routeOk?DB.green:DB.red }}>{rangeMi > 0 ? `${rangeMi} mi` : '—'}</div>
                  </div>
                  {routeDistMi > 0 && (
                    <div>
                      <div style={{ fontSize:11, color:DB.muted, fontWeight:600 }}>ROUTE DIST</div>
                      <div style={{ fontSize:16, fontWeight:700, color:DB.text }}>{routeDistMi} mi</div>
                    </div>
                  )}
                </div>
                {!routeOk && <div style={{ fontSize:12, color:DB.red, fontWeight:600, background:DB.redSoft, borderRadius:7, padding:'5px 10px', marginBottom:10 }}>⚠ Fuel may not cover this route — plan a refuel stop</div>}
                {cap > 0 && (
                  <>
                    <label style={{ fontSize:11, fontWeight:700, color:DB.muted, letterSpacing:'0.06em' }}>CURRENT LEVEL</label>
                    <input type="range" min={0} max={cap} step={0.5} value={level} onChange={e=>setLevel(parseFloat(e.target.value))}
                      style={{ width:'100%', accentColor:color, marginTop:4 }}/>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:DB.muted }}>
                      <span>0</span><span>{cap} gal</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats strip */}
        {log.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
            {[
              { label:'Total Logged', value:`${totalGal.toFixed(1)} gal` },
              { label:'Total Spent',  value: totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—' },
              { label:'Avg Price',    value: avgPrice ? `$${avgPrice}/gal` : '—' },
            ].map(s => (
              <div key={s.label} style={{ background:DB.card, border:`1px solid ${DB.border}`, borderRadius:12, padding:'10px 14px', textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize:15, fontWeight:800, color:DB.text }}>{s.value}</div>
                <div style={{ fontSize:10.5, color:DB.muted, fontWeight:600, marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Fill-up log */}
        <div style={{ background:DB.card, border:`1px solid ${DB.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ padding:'11px 16px', borderBottom:`1px solid ${DB.border}`, fontSize:10.5, fontWeight:800, color:DB.blue, letterSpacing:'0.07em' }}>FILL-UP LOG</div>
          {log.length === 0 ? (
            <div style={{ padding:'30px 16px', textAlign:'center', color:DB.muted }}>
              <div style={{ fontSize:28, marginBottom:8 }}>⛽</div>
              <div style={{ fontSize:14, fontWeight:600, color:DB.text, marginBottom:4 }}>No fill-ups logged yet</div>
              <div style={{ fontSize:13 }}>Tap "Log Fill-Up" to start tracking your fuel.</div>
            </div>
          ) : log.map(e => (
            <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderBottom:`1px solid ${DB.border}` }}>
              <div style={{ width:38, height:38, borderRadius:10, background:DB.greenSoft, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>⛽</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
                  <span style={{ fontSize:14, fontWeight:700, color:DB.text }}>{e.gallons.toFixed(1)} gal</span>
                  {e.totalCost && <span style={{ fontSize:13, color:DB.green, fontWeight:600 }}>${e.totalCost.toFixed(2)}</span>}
                  {e.pricePerGal && <span style={{ fontSize:12, color:DB.muted }}>${e.pricePerGal.toFixed(2)}/gal</span>}
                  {e.fillToFull && <span style={{ fontSize:11, color:DB.blue, background:DB.blueSoft, borderRadius:99, padding:'1px 7px', fontWeight:700 }}>Full</span>}
                </div>
                <div style={{ fontSize:12, color:DB.muted, marginTop:2 }}>
                  {new Date(e.date).toLocaleDateString()} {new Date(e.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  {e.locationName && ` · ${e.locationName}`}
                  {e.note && ` · ${e.note}`}
                </div>
              </div>
              <button onClick={()=>deleteEntry(e.id)} disabled={deleting===e.id} style={{ all:'unset', cursor:'pointer', color:'#CBD5E1', fontSize:16, padding:'4px 8px' }}
                onMouseEnter={el=>el.target.style.color=DB.red} onMouseLeave={el=>el.target.style.color='#CBD5E1'}>
                {deleting===e.id?'…':'✕'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {showFillUp && (
        <FillUpModal boat={boat} lat={appUserPos?.lat} lon={appUserPos?.lng}
          locationName={null} authToken={authToken}
          onClose={()=>setFillUp(false)} onSubmitted={()=>{ fetchLog(); setFillUp(false); }}/>
      )}
    </div>
  );
}

// ── Marina View ───────────────────────────────────────────────────────────────
async function _fetchMarinasAndRamps(lat, lon) {
  const d = 0.4;
  const bbox = `${lat-d},${lon-d},${lat+d},${lon+d}`;
  const q = `[out:json][timeout:18];(`+
    `node["leisure"="marina"](${bbox});way["leisure"="marina"](${bbox});`+
    `node["leisure"="slipway"](${bbox});way["leisure"="slipway"](${bbox});`+
    `node["amenity"="boat_ramp"](${bbox});way["amenity"="boat_ramp"](${bbox});`+
    `node["waterway"="fuel"](${bbox});`+
    `node["seamark:type"="fuel_station"](${bbox});`+
    `node["amenity"="fuel"]["boat"="yes"](${bbox});`+
    `node["fuel:marine"="yes"](${bbox});`+
  `);out center 40;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:`data=${encodeURIComponent(q)}`, headers:{'Content-Type':'application/x-www-form-urlencoded'} });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.elements||[]).map(el => {
      const eLat = el.lat ?? el.center?.lat;
      const eLon = el.lon ?? el.center?.lon;
      if (!eLat) return null;
      const t = el.tags || {};
      let kind = 'marina';
      if (t.leisure === 'slipway' || t.amenity === 'boat_ramp') kind = 'ramp';
      if (t.waterway === 'fuel' || t['seamark:type'] === 'fuel_station' || t['fuel:marine'] === 'yes' || (t.amenity === 'fuel' && t.boat === 'yes')) kind = 'fuel';
      const amenities = [
        t.fuel === 'yes' || t.waterway === 'fuel' ? 'fuel' : null,
        t.pump_out === 'yes' || t['seamark:small_craft_facility:category'] === 'pump_out' ? 'pump-out' : null,
        t.sanitation_dump_station === 'yes' ? 'pump-out' : null,
        t.wifi === 'yes' || t.internet_access === 'wlan' ? 'WiFi' : null,
        t.laundry === 'yes' ? 'laundry' : null,
        t.shower === 'yes' ? 'showers' : null,
        t.boat_repair === 'yes' ? 'repairs' : null,
        t.fee === 'yes' ? 'fee' : null,
      ].filter(Boolean);
      return {
        id: el.id,
        kind,
        name: t.name || t.operator || (kind==='ramp'?'Boat Ramp':kind==='fuel'?'Fuel Dock':'Marina'),
        lat: eLat, lon: eLon,
        dist: Math.round(_haversineNm(lat,lon,eLat,eLon)*1.151*10)/10,
        amenities,
        fee: t.fee,
        hours: t.opening_hours,
        phone: t.phone || t['contact:phone'],
        website: t.website || t['contact:website'],
      };
    }).filter(Boolean).sort((a,b)=>a.dist-b.dist);
  } catch { return []; }
}

function MarinaView({ lat, lon, onPlanRoute }) {
  const [places, setPlaces]   = useState([]);
  const [filter, setFilter]   = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSel]    = useState(null);

  useEffect(() => {
    if (!lat || !lon) { setLoading(false); return; }
    setLoading(true);
    _fetchMarinasAndRamps(lat, lon).then(data => { setPlaces(data); setLoading(false); });
  }, [lat, lon]);

  const kindLabel = { marina:'⚓ Marina', ramp:'🚤 Boat Ramp', fuel:'⛽ Fuel Dock' };
  const kindColor = { marina:DB.blue, ramp:DB.green, fuel:DB.orange };

  const filtered = filter === 'all' ? places : places.filter(p => p.kind === filter);

  const AmenityChip = ({ label }) => (
    <span style={{ fontSize:11, fontWeight:600, color:DB.blue, background:DB.blueSoft, borderRadius:99, padding:'2px 8px' }}>{label}</span>
  );

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:DB.bg }}>
      {/* Header + filter */}
      <div style={{ padding:'14px 16px 10px', background:DB.card, borderBottom:`1px solid ${DB.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:DB.text }}>Marinas & Ramps</h2>
            <div style={{ fontSize:13, color:DB.muted, marginTop:2 }}>{filtered.length} results{lat ? ` within ~25 mi` : ''}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:7 }}>
          {['all','marina','ramp','fuel'].map(f => (
            <button key={f} onClick={()=>{setFilter(f);setSel(null);}} style={{ all:'unset', cursor:'pointer', padding:'5px 13px', borderRadius:99, fontSize:12, fontWeight:600, border:`1.5px solid ${filter===f?kindColor[f]||DB.blue:DB.border}`, background:filter===f?`${kindColor[f]||DB.blue}12`:'white', color:filter===f?kindColor[f]||DB.blue:DB.muted, transition:'all 0.1s' }}>
              {f==='all'?'All':kindLabel[f]}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex:1, overflowY:'auto', padding:12 }}>
        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'24px 0', color:DB.muted }}>
            <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${DB.blue}`, borderTopColor:'transparent', animation:'spin 0.9s linear infinite' }}/>
            Finding marinas and ramps…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0', color:DB.muted }}>
            <div style={{ fontSize:32, marginBottom:10 }}>⚓</div>
            <div style={{ fontSize:15, fontWeight:700, color:DB.text, marginBottom:4 }}>None Found</div>
            <div style={{ fontSize:13 }}>No {filter!=='all'?filter+'s':'marinas or ramps'} in this area.</div>
          </div>
        )}
        {filtered.map(p => {
          const isSel = selected?.id === p.id;
          return (
            <div key={p.id} onClick={()=>setSel(isSel?null:p)}
              style={{ background:isSel?DB.blueSoft:'white', border:`1.5px solid ${isSel?DB.blue:DB.border}`, borderRadius:13, padding:'11px 14px', marginBottom:8, cursor:'pointer', transition:'all 0.12s', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:`${kindColor[p.kind]||DB.blue}14`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {p.kind==='marina'?'⚓':p.kind==='ramp'?'🚤':'⛽'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:DB.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                    <span style={{ fontSize:12.5, color:DB.muted, flexShrink:0 }}>{p.dist} mi</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:kindColor[p.kind]||DB.blue, background:`${kindColor[p.kind]||DB.blue}12`, borderRadius:99, padding:'1px 8px' }}>{(kindLabel[p.kind]||'').replace(/^\S+\s/,'')}</span>
                    {p.amenities.slice(0,4).map(a => <AmenityChip key={a} label={a}/>)}
                  </div>
                </div>
              </div>

              {isSel && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${DB.border}` }}>
                  {p.amenities.length > 0 && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:DB.muted, letterSpacing:'0.06em', marginBottom:5 }}>AMENITIES</div>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                        {p.amenities.map(a => <AmenityChip key={a} label={a}/>)}
                      </div>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                    {p.hours && <div style={{ fontSize:12, color:DB.muted }}>🕐 {p.hours}</div>}
                    {p.phone && <div style={{ fontSize:12, color:DB.blue }}>📞 {p.phone}</div>}
                    {p.fee === 'yes' && <div style={{ fontSize:12, color:DB.amber }}>💰 Fee required</div>}
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    {onPlanRoute && (
                      <button onClick={e=>{ e.stopPropagation(); onPlanRoute({ to:p.name, toLat:String(p.lat), toLon:String(p.lon) }); }} style={{ all:'unset', cursor:'pointer', flex:1, padding:'9px 0', textAlign:'center', background:DB.blue, color:'white', borderRadius:9, fontSize:13, fontWeight:700 }}>
                        🗺 Route Here
                      </button>
                    )}
                    {p.website && (
                      <button onClick={e=>{ e.stopPropagation(); window.open(p.website,'_blank'); }} style={{ all:'unset', cursor:'pointer', padding:'9px 14px', background:'#F1F5F9', color:DB.muted, borderRadius:9, fontSize:13, fontWeight:600 }}>
                        Website ↗
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Report Hazard Modal ───────────────────────────────────────────────────────
const HAZARD_TYPES = [
  { id:'rock',        label:'Rock / Reef',       emoji:'🪨' },
  { id:'shoal',       label:'Shoal / Sandbar',   emoji:'🏖️' },
  { id:'debris',      label:'Floating Debris',   emoji:'📦' },
  { id:'wreck',       label:'Sunken Wreck',       emoji:'🚢' },
  { id:'obstruction', label:'Obstruction',        emoji:'⚠️' },
  { id:'other',       label:'Other',              emoji:'❓' },
];

function ReportHazardModal({ lat, lon, authToken, user, onClose, onSubmitted }) {
  const [type, setType]         = useState('');
  const [desc, setDesc]         = useState('');
  const [submitting, setSub]    = useState(false);
  const [error, setError]       = useState('');
  const [pickingLat, setPickingLat] = useState(lat);
  const [pickingLon, setPickingLon] = useState(lon);

  const submit = async () => {
    if (!type) { setError('Choose a hazard type'); return; }
    if (!pickingLat || !pickingLon) { setError('Location required'); return; }
    setSub(true); setError('');
    try {
      const r = await fetch(`${API}/api/hazards`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ lat: pickingLat, lon: pickingLon, type, description: desc }),
      });
      if (r.ok) { onSubmitted?.(); onClose(); }
      else { const e = await r.json(); setError(e.error || 'Submit failed'); }
    } catch { setError('Network error'); }
    finally { setSub(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'white', borderRadius:18, padding:24, width:420, maxWidth:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div>
            <h3 style={{ margin:0, fontSize:17, fontWeight:800, color:DB.text }}>Report a Hazard</h3>
            <div style={{ fontSize:12, color:DB.muted, marginTop:2 }}>Help keep boaters safe</div>
          </div>
          <button onClick={onClose} style={{ all:'unset', cursor:'pointer', fontSize:22, color:DB.muted, lineHeight:1 }}>✕</button>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:DB.blue, letterSpacing:'0.06em', marginBottom:8 }}>HAZARD TYPE</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:16 }}>
          {HAZARD_TYPES.map(t => (
            <button key={t.id} onClick={() => setType(t.id)} style={{
              all:'unset', cursor:'pointer', padding:'9px 12px', borderRadius:10,
              border:`2px solid ${type === t.id ? DB.blue : DB.border}`,
              background: type === t.id ? DB.blueSoft : 'white',
              display:'flex', alignItems:'center', gap:8, transition:'all 0.1s',
            }}>
              <span style={{ fontSize:18 }}>{t.emoji}</span>
              <span style={{ fontSize:12.5, fontWeight:600, color: type === t.id ? DB.blue : DB.text }}>{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:DB.blue, letterSpacing:'0.06em', marginBottom:6 }}>DESCRIPTION <span style={{ color:DB.muted, fontWeight:400 }}>(optional)</span></div>
        <textarea value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Describe the hazard — size, depth, visibility…"
          rows={3} maxLength={300}
          style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', border:`1.5px solid ${DB.border}`, borderRadius:10, fontSize:13, fontFamily:'inherit', resize:'vertical', outline:'none', color:DB.text }}
          onFocus={e => e.target.style.borderColor = DB.blue}
          onBlur={e => e.target.style.borderColor = DB.border}
        />
        <div style={{ fontSize:11, color:DB.muted, textAlign:'right', marginBottom:14 }}>{desc.length}/300</div>

        <div style={{ background:DB.bg, border:`1px solid ${DB.border}`, borderRadius:10, padding:'8px 12px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:DB.muted, marginBottom:3 }}>📍 LOCATION</div>
          {pickingLat ? (
            <div style={{ fontSize:13, color:DB.text }}>{pickingLat.toFixed(4)}°, {pickingLon.toFixed(4)}°</div>
          ) : (
            <div style={{ fontSize:13, color:DB.muted }}>No location — go to the map and tap a spot first</div>
          )}
        </div>

        {error && <div style={{ background:DB.redSoft, border:`1px solid ${DB.red}33`, borderRadius:8, padding:'8px 12px', fontSize:13, color:DB.red, marginBottom:12 }}>{error}</div>}

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ all:'unset', cursor:'pointer', flex:1, padding:'11px 0', textAlign:'center', borderRadius:10, border:`1.5px solid ${DB.border}`, fontSize:13.5, fontWeight:600, color:DB.muted }}>Cancel</button>
          <button onClick={submit} disabled={submitting || !type} style={{ all:'unset', cursor: submitting||!type ? 'not-allowed':'pointer', flex:2, padding:'11px 0', textAlign:'center', borderRadius:10, background: submitting||!type ? '#94A3B8' : DB.red, color:'white', fontSize:13.5, fontWeight:700 }}>
            {submitting ? 'Submitting…' : '🚨 Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hazards View ──────────────────────────────────────────────────────────────
function HazardsView({ lat, lon, seamarks, authToken, user, onHazardSubmitted }) {
  const [reported, setReported]   = useState([]);
  const [filter, setFilter]       = useState('all');
  const [showReport, setShowReport] = useState(false);
  const [upvoted, setUpvoted]     = useState(new Set());

  const fetchReported = () => {
    if (!lat || !lon) return;
    fetch(`${API}/api/hazards?lat=${lat}&lon=${lon}&radius=100`)
      .then(r => r.ok ? r.json() : [])
      .then(setReported).catch(()=>{});
  };
  useEffect(fetchReported, [lat, lon]);

  const hazardEmoji = type => {
    if (!type) return '⚠️';
    if (type.includes('rock') || type.includes('reef')) return '🪨';
    if (type.includes('wreck')) return '🚢';
    if (type.includes('shoal')) return '🏖️';
    if (type.includes('debris')) return '📦';
    if (type.includes('obstruction')) return '🚧';
    return '⚠️';
  };

  const osmHazards = (seamarks||[]).map(h => ({ ...h, source:'noaa_osm' }));
  const userHazards = reported.map(h => ({ ...h, source:'community', name: h.description || HAZARD_TYPES.find(t=>t.id===h.type)?.label || h.type }));
  const all = [...osmHazards, ...userHazards];
  const filterTypes = ['all', 'rock', 'shoal', 'wreck', 'debris', 'obstruction'];
  const filtered = filter === 'all' ? all : all.filter(h => (h.type||'').includes(filter));

  const upvote = async (id) => {
    if (upvoted.has(id)) return;
    try {
      const r = await fetch(`${API}/api/hazards/${id}/upvote`, { method:'POST', headers:{ 'Authorization':`Bearer ${authToken}` }});
      if (r.ok) {
        setUpvoted(s => new Set([...s, id]));
        setReported(prev => prev.map(h => h.id === id ? { ...h, upvotes: (h.upvotes||0)+1 } : h));
      }
    } catch {}
  };

  return (
    <div style={{ height:'100%', overflowY:'auto', background:DB.bg, padding:16 }}>
      <div style={{ maxWidth:800, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:DB.text }}>Hazards</h2>
            <div style={{ fontSize:13, color:DB.muted, marginTop:3 }}>{all.length} hazards found{lat ? ` near ${lat.toFixed(2)}°, ${lon.toFixed(2)}°` : ''}</div>
          </div>
          <button onClick={() => setShowReport(true)} style={{ all:'unset', cursor:'pointer', display:'flex', alignItems:'center', gap:7, padding:'9px 14px', background:DB.red, color:'white', borderRadius:10, fontSize:13, fontWeight:700, boxShadow:`0 2px 8px ${DB.red}55` }}>
            <span style={{ fontSize:16 }}>🚨</span> Report Hazard
          </button>
        </div>

        {/* Filter chips */}
        <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
          {filterTypes.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ all:'unset', cursor:'pointer', padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600, border:`1.5px solid ${filter===f ? DB.blue : DB.border}`, background: filter===f ? DB.blueSoft : 'white', color: filter===f ? DB.blue : DB.muted, transition:'all 0.1s' }}>
              {f === 'all' ? 'All' : hazardEmoji(f)+' '+f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0', color:DB.muted }}>
            <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:DB.green, marginBottom:6 }}>No Hazards Found</div>
            <div style={{ fontSize:13 }}>No hazards in this area{filter!=='all'?' matching that filter':''}.</div>
          </div>
        )}

        {filtered.map((h, i) => {
          const isUser = h.source === 'community';
          return (
            <div key={h.id||i} style={{ background:'white', border:`1px solid ${DB.border}`, borderRadius:12, padding:'11px 14px', marginBottom:8, display:'flex', alignItems:'flex-start', gap:12, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ width:36, height:36, borderRadius:10, background: isUser ? DB.amberSoft : DB.redSoft, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                {hazardEmoji(h.type)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3, flexWrap:'wrap' }}>
                  <span style={{ fontSize:13.5, fontWeight:700, color:DB.text }}>{h.name || h.type || 'Hazard'}</span>
                  <span style={{ fontSize:10, fontWeight:700, color: isUser ? DB.amber : DB.muted, background: isUser ? DB.amberSoft : '#F1F5F9', borderRadius:99, padding:'1px 7px' }}>{isUser ? '👤 Community Report' : 'NOAA/OSM'}</span>
                </div>
                {h.description && h.description !== h.name && <div style={{ fontSize:12.5, color:DB.muted, marginBottom:4 }}>{h.description}</div>}
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {h.type && h.type !== h.name && <span style={{ fontSize:11.5, color:DB.muted }}>Type: {h.type}</span>}
                  {h.dist_km != null && <span style={{ fontSize:11.5, color:DB.muted }}>📍 {h.dist_km} km away</span>}
                  {h.reportedBy && <span style={{ fontSize:11.5, color:DB.muted }}>By {h.reportedBy}</span>}
                  {h.reportedAt && <span style={{ fontSize:11.5, color:DB.muted }}>{new Date(h.reportedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              {isUser && (
                <button onClick={() => upvote(h.id)} disabled={upvoted.has(h.id)} style={{ all:'unset', cursor: upvoted.has(h.id)?'default':'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'4px 8px', borderRadius:8, border:`1.5px solid ${upvoted.has(h.id)?DB.amber:DB.border}`, background: upvoted.has(h.id)?DB.amberSoft:'white', flexShrink:0 }}>
                  <span style={{ fontSize:14 }}>👍</span>
                  <span style={{ fontSize:10, fontWeight:700, color: upvoted.has(h.id)?DB.amber:DB.muted }}>{h.upvotes||0}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showReport && (
        <ReportHazardModal lat={lat} lon={lon} authToken={authToken} user={user} onClose={() => setShowReport(false)} onSubmitted={() => { fetchReported(); onHazardSubmitted?.(); }}/>
      )}
    </div>
  );
}

// ── Alerts View ──────────────────────────────────────────────────────────────
function AlertsView({ lat, lon, routeSafety, boat, bridges }) {
  const [nwsAlerts, setNwsAlerts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    if (!lat || !lon) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API}/api/noaa/alerts?lat=${lat}&lon=${lon}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setNwsAlerts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [lat, lon]);

  const sevOrder = { Extreme:0, Severe:1, Moderate:2, Minor:3, Unknown:4 };
  const sevColor = sev => sev==='Extreme'||sev==='Severe' ? DB.red : sev==='Moderate' ? DB.amber : DB.blue;
  const sevBg    = sev => sev==='Extreme'||sev==='Severe' ? DB.redSoft : sev==='Moderate' ? DB.amberSoft : DB.blueSoft;
  const sevLabel = sev => sev==='Extreme'?'🚨 Extreme':sev==='Severe'?'🔴 Severe':sev==='Moderate'?'⚠️ Moderate':'ℹ️ '+sev;

  const bridgeAlerts = (bridges||[])
    .filter(b => b.verClr_ft != null && boat?.mastHeight && b.verClr_ft < parseFloat(boat.mastHeight))
    .map(b => ({
      id: `bridge-${b.lat}-${b.lon}`, event:'Bridge Clearance Warning',
      headline:`${b.name||'Bridge'}: ${b.verClr_ft}ft clearance — your boat is ${boat.mastHeight}`,
      severity:'Severe', areaDesc:`${b.dist_km} km away`, expires: null,
    }));

  const routeAlerts = (routeSafety?.reasons||[]).map((r, i) => ({
    id:`route-${i}`, event:'Route Advisory',
    headline: r, severity:'Moderate', areaDesc:'Active route', expires: null,
  }));

  const all = [...bridgeAlerts, ...routeAlerts,
    ...nwsAlerts.map(a => ({ ...a, id: a.id || a.event })),
  ].filter(a => !dismissed.has(a.id))
   .sort((a,b) => (sevOrder[a.severity]||4) - (sevOrder[b.severity]||4));

  return (
    <div style={{ height:'100%', overflowY:'auto', background:DB.bg, padding:16 }}>
      <div style={{ maxWidth:800, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:DB.text }}>Alerts</h2>
            <div style={{ fontSize:13, color:DB.muted, marginTop:3 }}>{lat && lon ? `Near ${lat.toFixed(3)}, ${lon.toFixed(3)}` : 'Set a location to see alerts'}</div>
          </div>
          {all.length > 0 && (
            <span style={{ background:DB.red, color:'white', borderRadius:99, fontSize:12, fontWeight:700, padding:'3px 10px' }}>{all.length} Active</span>
          )}
        </div>

        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0', color:DB.muted }}>
            <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${DB.blue}`, borderTopColor:'transparent', animation:'spin 0.9s linear infinite' }}/>
            Fetching NOAA alerts…
          </div>
        )}

        {!loading && all.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0', color:DB.muted }}>
            <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:700, color:DB.green, marginBottom:6 }}>No Active Alerts</div>
            <div style={{ fontSize:13 }}>No weather warnings or hazard alerts for this area.</div>
          </div>
        )}

        {all.map(alert => (
          <div key={alert.id} style={{ background:sevBg(alert.severity), border:`1.5px solid ${sevColor(alert.severity)}33`, borderLeft:`4px solid ${sevColor(alert.severity)}`, borderRadius:12, padding:'12px 14px', marginBottom:10, position:'relative' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:sevColor(alert.severity), background:`${sevColor(alert.severity)}18`, borderRadius:99, padding:'2px 8px' }}>{sevLabel(alert.severity)}</span>
                  {alert.areaDesc && <span style={{ fontSize:11, color:DB.muted }}>📍 {alert.areaDesc}</span>}
                  {alert.expires && <span style={{ fontSize:11, color:DB.muted }}>⏱ Expires {new Date(alert.expires).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:DB.text, marginBottom:4 }}>{alert.event}</div>
                <div style={{ fontSize:13, color:DB.text, lineHeight:1.5 }}>{alert.headline}</div>
                {alert.description && (
                  <details style={{ marginTop:8 }}>
                    <summary style={{ fontSize:12, color:DB.blue, cursor:'pointer', fontWeight:600 }}>Full details</summary>
                    <div style={{ fontSize:12, color:DB.muted, marginTop:6, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{alert.description}</div>
                  </details>
                )}
                {alert.senderName && <div style={{ fontSize:11, color:DB.muted, marginTop:6 }}>Source: {alert.senderName}</div>}
              </div>
              <button onClick={() => setDismissed(s => new Set([...s, alert.id]))}
                style={{ all:'unset', cursor:'pointer', color:DB.muted, fontSize:18, lineHeight:1, flexShrink:0, padding:'0 4px' }}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Weather View ─────────────────────────────────────────────────────────────
function WeatherView({ lat, lon }) {
  const [buoy, setBuoy]         = useState(null);
  const [obs, setObs]           = useState(null);
  const [forecast, setForecast] = useState([]);
  const [tides, setTides]       = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!lat || !lon) { setLoading(false); return; }
    setLoading(true);
    const all = [
      fetch(`${API}/api/noaa/buoys?lat=${lat}&lon=${lon}&n=1`)
        .then(r => r.ok ? r.json() : [])
        .then(async buoys => {
          if (!buoys.length) return;
          setBuoy(buoys[0]);
          const o = await fetch(`${API}/api/noaa/buoys/${buoys[0].id}/obs`).then(r => r.ok ? r.json() : null).catch(()=>null);
          if (o) setObs(o);
        }).catch(()=>{}),
      fetch(`${API}/api/noaa/forecast?lat=${lat}&lon=${lon}`)
        .then(r => r.ok ? r.json() : [])
        .then(setForecast).catch(()=>{}),
      fetch(`${API}/api/noaa/tides?lat=${lat}&lon=${lon}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setTides(d); }).catch(()=>{}),
    ];
    Promise.all(all).finally(() => setLoading(false));
  }, [lat, lon]);

  const windDir = deg => {
    if (deg == null) return '—';
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(deg/45) % 8];
  };

  const beaufort = kt => {
    if (kt == null) return null;
    if (kt < 1) return { n:0, label:'Calm' };
    if (kt < 4) return { n:1, label:'Light air' };
    if (kt < 8) return { n:2, label:'Light breeze' };
    if (kt < 12) return { n:3, label:'Gentle breeze' };
    if (kt < 18) return { n:4, label:'Moderate breeze' };
    if (kt < 25) return { n:5, label:'Fresh breeze' };
    if (kt < 32) return { n:6, label:'Strong breeze' };
    if (kt < 40) return { n:7, label:'Near gale' };
    return { n:8, label:'Gale', danger:true };
  };

  const bf = beaufort(obs?.windSpeed_kt);
  const waveColor = obs?.waveHeight_ft == null ? DB.muted : obs.waveHeight_ft < 2 ? DB.green : obs.waveHeight_ft < 4 ? DB.amber : DB.red;

  const tidePairs = React.useMemo(() => {
    if (!tides?.predictions?.length) return [];
    const preds = tides.predictions;
    const pairs = [];
    for (let i = 1; i < preds.length - 1; i++) {
      const prev = parseFloat(preds[i-1].v), cur = parseFloat(preds[i].v), next = parseFloat(preds[i+1].v);
      if ((cur > prev && cur > next) || (cur < prev && cur < next)) {
        pairs.push({ t: preds[i].t, v: cur, type: cur > prev ? 'H' : 'L' });
      }
    }
    return pairs.slice(0, 6);
  }, [tides]);

  const Card = ({ title, children, accent: ca = DB.blue }) => (
    <div style={{ background:DB.card, border:`1px solid ${DB.border}`, borderRadius:14, padding:'14px 16px', marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize:10, fontWeight:800, color:ca, letterSpacing:'0.07em', marginBottom:10 }}>{title}</div>
      {children}
    </div>
  );
  const Stat = ({ label, value, unit, color }) => (
    <div style={{ textAlign:'center', flex:1 }}>
      <div style={{ fontSize:22, fontWeight:800, color:color||DB.text, lineHeight:1 }}>{value ?? '—'}</div>
      {unit && <div style={{ fontSize:11, color:DB.muted, marginTop:2 }}>{unit}</div>}
      <div style={{ fontSize:11, color:DB.muted, marginTop:3, fontWeight:600 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ height:'100%', overflowY:'auto', background:DB.bg, padding:16 }}>
      <div style={{ maxWidth:800, margin:'0 auto' }}>
        <div style={{ marginBottom:14 }}>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:DB.text }}>Weather</h2>
          {buoy && <div style={{ fontSize:13, color:DB.muted, marginTop:3 }}>Conditions from NDBC buoy <b>{buoy.name}</b> · {buoy.distance_km?.toFixed(0)} km away</div>}
        </div>

        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0', color:DB.muted }}>
            <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${DB.blue}`, borderTopColor:'transparent', animation:'spin 0.9s linear infinite' }}/>
            Fetching marine conditions…
          </div>
        )}

        {obs && (
          <Card title="CURRENT CONDITIONS" accent={DB.blue}>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <Stat label="Air Temp" value={obs.airTemp_f} unit="°F"/>
              <Stat label="Water Temp" value={obs.waterTemp_f} unit="°F" color='#0EA5E9'/>
              <Stat label="Wave Height" value={obs.waveHeight_ft} unit="ft" color={waveColor}/>
              <Stat label="Wind" value={obs.windSpeed_kt} unit="knots"/>
              <Stat label="Wind Dir" value={windDir(obs.windDir_deg)} color={DB.muted}/>
              {obs.windGust_kt && <Stat label="Gusts" value={obs.windGust_kt} unit="knots" color={DB.amber}/>}
              {obs.pressure_mb && <Stat label="Pressure" value={obs.pressure_mb} unit="mb"/>}
            </div>
            {bf && (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:9, background: bf.danger ? DB.redSoft : bf.n >= 5 ? DB.amberSoft : DB.greenSoft }}>
                <div style={{ display:'flex', gap:2 }}>
                  {[...Array(8)].map((_,i) => (
                    <div key={i} style={{ width:7, height: 10 + i * 4, borderRadius:2, background: i < bf.n ? (bf.danger?DB.red:bf.n>=5?DB.amber:DB.green) : DB.border }}/>
                  ))}
                </div>
                <div>
                  <span style={{ fontSize:13, fontWeight:700, color:DB.text }}>Beaufort {bf.n}</span>
                  <span style={{ fontSize:12, color:DB.muted, marginLeft:8 }}>{bf.label}</span>
                  {bf.danger && <span style={{ marginLeft:8, fontSize:12, color:DB.red, fontWeight:700 }}>⚠ Use caution</span>}
                </div>
              </div>
            )}
          </Card>
        )}

        {tidePairs.length > 0 && (
          <Card title={`TIDES · ${tides.station}`} accent='#0EA5E9'>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {tidePairs.map((t, i) => (
                <div key={i} style={{ flex:1, minWidth:110, background: t.type==='H' ? DB.blueSoft : '#F8FAFC', border:`1px solid ${DB.border}`, borderRadius:9, padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:12, fontWeight:800, color: t.type==='H' ? DB.blue : DB.muted }}>{t.type==='H' ? '▲ HIGH' : '▼ LOW'}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:DB.text, margin:'4px 0' }}>{parseFloat(t.v).toFixed(1)} <span style={{ fontSize:11, color:DB.muted }}>ft</span></div>
                  <div style={{ fontSize:11, color:DB.muted }}>{t.t.split(' ')[1]?.slice(0,5) || t.t}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {forecast.length > 0 && (
          <Card title="12-HOUR FORECAST" accent={DB.blue}>
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
              {forecast.slice(0, 12).map((p, i) => {
                const time = new Date(p.startTime).toLocaleTimeString([], { hour:'numeric', hour12:true });
                const isNight = p.isDaytime === false;
                return (
                  <div key={i} style={{ minWidth:72, textAlign:'center', padding:'8px 6px', borderRadius:10, background:'#F8FAFC', border:`1px solid ${DB.border}`, flexShrink:0 }}>
                    <div style={{ fontSize:11, color:DB.muted, fontWeight:600 }}>{time}</div>
                    <div style={{ fontSize:20, margin:'5px 0' }}>{isNight ? '🌙' : p.temperature > 85 ? '☀️' : p.shortForecast?.toLowerCase().includes('rain') ? '🌧️' : p.shortForecast?.toLowerCase().includes('cloud') ? '⛅' : '🌤️'}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:DB.text }}>{p.temperature}°</div>
                    <div style={{ fontSize:10, color:DB.muted, marginTop:3, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{p.shortForecast}</div>
                    {p.windSpeed && <div style={{ fontSize:10, color:DB.muted, marginTop:3 }}>💨 {p.windSpeed}</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {!loading && !obs && !forecast.length && (
          <div style={{ textAlign:'center', padding:'40px 0', color:DB.muted }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📡</div>
            <div style={{ fontSize:15, fontWeight:700, color:DB.text, marginBottom:6 }}>No location set</div>
            <div style={{ fontSize:13 }}>Plan a route or enable location access to see weather conditions.</div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Trip Logger Hook ─────────────────────────────────────────────────────────
function useTripLogger({ authToken, boat, appUserPos }) {
  const [isLogging, setIsLogging]   = useState(false);
  const [startTime, setStartTime]   = useState(null);
  const [elapsed, setElapsed]       = useState('0:00');
  const [distNm, setDistNm]         = useState(0);
  const trackRef    = useRef([]);
  const lastPosRef  = useRef(null);
  const timerRef    = useRef(null);
  const maxSpdRef   = useRef(0);

  // Accumulate GPS points while logging
  useEffect(() => {
    if (!isLogging || !appUserPos) return;
    const { lat, lng, speedKts } = appUserPos;
    if (lat == null || lng == null) return;
    const last = lastPosRef.current;
    const point = { lat, lng: lng ?? appUserPos.lon, spd: speedKts ?? 0, ts: Date.now() };
    if (last) {
      const d = _haversineNm(last.lat, last.lng, lat, lng ?? appUserPos.lon);
      if (d > 0.005) { // only add if moved >~30ft to avoid noise
        setDistNm(prev => prev + d);
        trackRef.current.push(point);
        lastPosRef.current = point;
        if ((speedKts ?? 0) > maxSpdRef.current) maxSpdRef.current = speedKts ?? 0;
      }
    } else {
      trackRef.current = [point];
      lastPosRef.current = point;
    }
  }, [isLogging, appUserPos?.lat, appUserPos?.lng]);

  // Elapsed time ticker
  useEffect(() => {
    if (!isLogging || !startTime) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startTime) / 1000);
      const m = Math.floor(sec / 60), s = sec % 60;
      setElapsed(`${m}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isLogging, startTime]);

  const startLog = () => {
    trackRef.current = [];
    lastPosRef.current = null;
    maxSpdRef.current = 0;
    setDistNm(0);
    setElapsed('0:00');
    setStartTime(Date.now());
    setIsLogging(true);
  };

  const stopLog = async () => {
    setIsLogging(false);
    clearInterval(timerRef.current);
    const track = trackRef.current;
    if (!track.length || !authToken) return;
    const endedAt = new Date().toISOString();
    const startedAt = new Date(startTime).toISOString();
    const durationMin = Math.round((Date.now() - startTime) / 60000);
    const avgSpeedKt = track.length > 1
      ? track.reduce((s, p) => s + (p.spd || 0), 0) / track.length : 0;
    try {
      await fetch(`${API}/api/trip-logs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt, endedAt, durationMin,
          distanceNm: Math.round(distNm * 100) / 100,
          maxSpeedKt: Math.round(maxSpdRef.current * 10) / 10,
          avgSpeedKt: Math.round(avgSpeedKt * 10) / 10,
          boatId: boat?.id ?? null,
          boatName: boat?.name ?? null,
          track,
        }),
      });
    } catch { /* non-fatal */ }
  };

  return { isLogging, elapsed, distNm, startLog, stopLog };
}

// ── Trip Logs View ───────────────────────────────────────────────────────────
function TripLogsView({ authToken, accent, boat }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null); // full log with track
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const replayRef = useRef(null);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API}/api/trip-logs`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setLogs(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [authToken]);

  const openLog = async (id) => {
    if (selectedLog?.id === id) { setSelectedLog(null); return; }
    setLoadingDetail(true);
    try {
      const r = await fetch(`${API}/api/trip-logs/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (r.ok) setSelectedLog(await r.json());
    } finally { setLoadingDetail(false); }
  };

  const deleteLog = async (id) => {
    await fetch(`${API}/api/trip-logs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } });
    setLogs(l => l.filter(x => x.id !== id));
    if (selectedLog?.id === id) setSelectedLog(null);
  };

  const renameLog = async (id) => {
    const name = editName.trim();
    if (!name) return;
    await fetch(`${API}/api/trip-logs/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setLogs(l => l.map(x => x.id === id ? { ...x, name } : x));
    if (selectedLog?.id === id) setSelectedLog(s => ({ ...s, name }));
    setEditingId(null);
  };

  const fmtDuration = (min) => {
    if (!min) return '—';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const fmtDist = (nm) => nm > 0 ? `${nm.toFixed(1)} nm` : '—';
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const fmtTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Build a simple SVG track preview from track points
  const TrackPreview = ({ track, accent: a }) => {
    if (!track?.length) return null;
    const lats = track.map(p => p.lat), lons = track.map(p => p.lng ?? p.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const W = 240, H = 120, PAD = 8;
    const xScale = (maxLon - minLon) || 0.0001, yScale = (maxLat - minLat) || 0.0001;
    const toX = lon => PAD + ((lon - minLon) / xScale) * (W - PAD*2);
    const toY = lat => H - PAD - ((lat - minLat) / yScale) * (H - PAD*2);
    const pts = track.map(p => `${toX(p.lng??p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(' ');
    const start = track[0], end = track[track.length - 1];
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', borderRadius: 10 }}>
        <rect width={W} height={H} rx="10" fill={DB.bg}/>
        <polyline points={pts} fill="none" stroke={a} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
        <circle cx={toX(start.lng??start.lon)} cy={toY(start.lat)} r="4" fill={DB.green} stroke="white" strokeWidth="1.5"/>
        <circle cx={toX(end.lng??end.lon)} cy={toY(end.lat)} r="4" fill={a} stroke="white" strokeWidth="1.5"/>
      </svg>
    );
  };

  return (
    <div style={{ padding: '8px 20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: DB.muted, fontWeight: 600, textTransform: 'uppercase' }}>History</div>
        <div style={{ fontSize: 26, color: DB.text, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>Trip Logs</div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: DB.muted, fontSize: 13 }}>Loading…</div>
      )}
      {!loading && logs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: DB.muted }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: DB.text, marginBottom: 6 }}>No trips recorded yet</div>
          <div style={{ fontSize: 13 }}>Start a trip from the map to log your journey.</div>
        </div>
      )}

      {logs.map(log => (
        <div key={log.id} style={{ background: DB.card, border: `1.5px solid ${selectedLog?.id === log.id ? accent : DB.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'border-color 0.15s' }}>

          {/* Log header row */}
          <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => openLog(log.id)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              {editingId === log.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameLog(log.id); if (e.key === 'Escape') setEditingId(null); }}
                  onBlur={() => renameLog(log.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 15, fontWeight: 700, color: DB.text, border: `1.5px solid ${accent}`, borderRadius: 8, padding: '3px 8px', background: DB.blueSoft, outline: 'none', flex: 1, marginRight: 8 }}
                />
              ) : (
                <span style={{ fontSize: 15, fontWeight: 700, color: DB.text, flex: 1 }}>{log.name}</span>
              )}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditingId(log.id); setEditName(log.name); }}
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: DB.muted, padding: '2px 6px', borderRadius: 6, background: DB.bg }}>✏️</button>
                <button onClick={() => { if (confirm(`Delete "${log.name}"?`)) deleteLog(log.id); }}
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: DB.red, padding: '2px 6px', borderRadius: 6, background: DB.redSoft }}>🗑</button>
              </div>
            </div>

            <div style={{ fontSize: 11, color: DB.muted, marginBottom: 8 }}>
              {fmtDate(log.startedAt)} · {fmtTime(log.startedAt)}
              {log.boatName ? ` · ${log.boatName}` : ''}
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: 'Distance', val: fmtDist(log.distanceNm) },
                { label: 'Duration', val: fmtDuration(log.durationMin) },
                { label: 'Max speed', val: log.maxSpeedKt > 0 ? `${log.maxSpeedKt.toFixed(1)} kt` : '—' },
                { label: 'Avg speed', val: log.avgSpeedKt > 0 ? `${log.avgSpeedKt.toFixed(1)} kt` : '—' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: DB.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: DB.text, marginTop: 2 }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Expanded track preview */}
          {selectedLog?.id === log.id && (
            <div style={{ borderTop: `1px solid ${DB.border}`, padding: 16 }}>
              {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: 20, color: DB.muted, fontSize: 13 }}>Loading track…</div>
              ) : selectedLog?.track?.length > 1 ? (
                <div>
                  <div style={{ fontSize: 11, color: DB.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>GPS Track</div>
                  <TrackPreview track={selectedLog.track} accent={accent}/>
                  <div style={{ marginTop: 12, display: 'flex', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: DB.muted }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: DB.green, border: '1.5px solid white', flexShrink: 0 }}/>
                      Start: {fmtTime(selectedLog.startedAt)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: DB.muted }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, border: '1.5px solid white', flexShrink: 0 }}/>
                      End: {fmtTime(selectedLog.endedAt)}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: DB.muted, textAlign: 'center', padding: '10px 0' }}>Not enough track points to display.</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Sea State / Wave Forecast View ───────────────────────────────────────────
function SeaStateView({ lat, lon, accent }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState(null);
  const [selDayIdx, setSelDayIdx] = useState(0);

  useEffect(() => {
    if (!lat || !lon) { setErr('Enable GPS or plan a route to see wave data.'); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setErr(null);
    fetch(`${API}/api/marine/waves?lat=${lat}&lon=${lon}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || 'Error')))
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setErr(typeof e === 'string' ? e : 'Could not load wave forecast.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [lat, lon]);

  const compassPt = deg => {
    if (deg == null) return '—';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  const SS = {
    go:      { bg: DB.greenSoft, fg: DB.green,  border: '#86EFAC', label: 'GO'      },
    caution: { bg: DB.amberSoft, fg: DB.amber,  border: '#FCD34D', label: 'CAUTION' },
    nogo:    { bg: DB.redSoft,   fg: DB.red,    border: '#FCA5A5', label: 'NO-GO'   },
  };

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: DB.muted }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🌊</div>
      <div style={{ fontSize: 13 }}>Loading wave forecast…</div>
    </div>
  );
  if (err || !data) return (
    <div style={{ padding: 40, textAlign: 'center', color: DB.muted }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>🌊</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: DB.text, marginBottom: 4 }}>{err || 'No wave data available'}</div>
      <div style={{ fontSize: 12 }}>Wave data requires a coastal or ocean location.</div>
    </div>
  );

  const { current, daily } = data;
  const cs = SS[current.status] || SS.go;
  const selDay = daily[selDayIdx] || daily[0];
  const hours  = selDay?.hours || [];
  const chartH = hours.filter(h => h.waveHeightFt != null);

  const CW = 380, CH = 72;
  const maxH  = Math.max(...chartH.map(h => h.waveHeightFt), 5);
  const toX   = h => (h / 24) * CW;
  const toY   = ft => CH - (ft / maxH) * CH;
  const pts   = chartH.map(h => `${toX(h.hour).toFixed(1)},${toY(h.waveHeightFt).toFixed(1)}`).join(' ');
  const areaPts = chartH.length
    ? `${toX(chartH[0].hour).toFixed(1)},${CH} ${pts} ${toX(chartH[chartH.length - 1].hour).toFixed(1)},${CH}`
    : '';
  const y2 = toY(2), y4 = toY(4);
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;

  return (
    <div style={{ padding: '12px 20px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: DB.muted, fontWeight: 700, textTransform: 'uppercase' }}>Marine Forecast</div>
        <div style={{ fontSize: 26, color: DB.text, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>Sea State</div>
      </div>

      {/* Current conditions */}
      <div style={{ background: cs.bg, border: `1.5px solid ${cs.border}`, borderRadius: 16, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: cs.fg, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Current Conditions</div>
          <span style={{ background: cs.fg, color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '3px 10px', letterSpacing: '0.07em' }}>
            {cs.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 46, fontWeight: 900, color: cs.fg, lineHeight: 1, letterSpacing: '-0.03em' }}>
            {current.waveHeightFt?.toFixed(1) ?? '—'}
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, color: DB.muted }}>ft</span>
          <span style={{ fontSize: 12, color: DB.muted, marginLeft: 4 }}>significant wave height</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Period',   val: current.wavePeriodS  ? `${current.wavePeriodS}s`              : '—' },
            { label: 'Swell',    val: current.swellHeightFt ? `${current.swellHeightFt.toFixed(1)} ft` : '—' },
            { label: 'From',     val: compassPt(current.waveDir) },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: 9, fontWeight: 700, color: cs.fg, opacity: 0.7, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: cs.fg }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 7-day forecast row */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: DB.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>7-Day Forecast</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {daily.map((day, i) => {
            const s   = SS[day.status] || SS.go;
            const sel = i === selDayIdx;
            return (
              <button key={day.date} onClick={() => setSelDayIdx(i)} style={{
                all: 'unset', cursor: 'pointer', flexShrink: 0, width: 88, boxSizing: 'border-box',
                background: sel ? s.bg : DB.card, border: `1.5px solid ${sel ? s.border : DB.border}`,
                borderRadius: 12, overflow: 'hidden',
                boxShadow: sel ? `0 0 0 2px ${s.fg}2A` : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'all 0.12s',
              }}>
                <div style={{ height: 4, background: s.fg }}/>
                <div style={{ padding: '10px 9px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: sel ? s.fg : DB.text, marginBottom: 1 }}>{day.dayLabel}</div>
                  <div style={{ fontSize: 9, color: DB.muted, marginBottom: 8 }}>{day.dateLabel}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: sel ? s.fg : DB.text, lineHeight: 1 }}>
                    {day.maxFt?.toFixed(1) ?? '—'}
                  </div>
                  <div style={{ fontSize: 9, color: DB.muted, marginBottom: 5 }}>ft max</div>
                  <div style={{ fontSize: 10, color: DB.muted }}>
                    {day.avgPeriodS ? `${day.avgPeriodS}s` : '—'} · {compassPt(day.dominantDir)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hourly chart */}
      {chartH.length > 1 && (
        <div style={{ background: DB.card, border: `1px solid ${DB.border}`, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DB.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {selDay.dayLabel} · Hourly Wave Height
          </div>
          <svg width="100%" viewBox={`0 0 ${CW} ${CH + 22}`} style={{ display: 'block', overflow: 'visible' }}>
            {/* Zone fills */}
            <rect x="0" y={y2} width={CW} height={CH - y2} rx="4" fill={DB.greenSoft} opacity="0.7"/>
            {y4 < y2 && <rect x="0" y={y4} width={CW} height={y2 - y4} fill={DB.amberSoft} opacity="0.7"/>}
            {y4 > 0  && <rect x="0" y="0"  width={CW} height={y4}      fill={DB.redSoft}   opacity="0.7"/>}
            {/* Threshold lines */}
            <line x1="0" y1={y2} x2={CW} y2={y2} stroke={DB.amber} strokeWidth="0.8" strokeDasharray="4 3" opacity="0.8"/>
            <line x1="0" y1={y4} x2={CW} y2={y4} stroke={DB.red}   strokeWidth="0.8" strokeDasharray="4 3" opacity="0.8"/>
            <text x={CW - 2} y={y2 - 3} fontSize="7.5" textAnchor="end" fill={DB.amber}>2 ft</text>
            <text x={CW - 2} y={Math.max(y4 - 3, 8)} fontSize="7.5" textAnchor="end" fill={DB.red}>4 ft</text>
            {/* Wave area + line */}
            {areaPts && <polygon points={areaPts} fill={accent} fillOpacity="0.18"/>}
            {pts && <polyline points={pts} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
            {/* Now marker (today only) */}
            {selDayIdx === 0 && (
              <line x1={toX(nowHour)} y1="0" x2={toX(nowHour)} y2={CH} stroke={DB.red} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.85"/>
            )}
            {/* X axis labels */}
            <text x="1"     y={CH + 15} fontSize="8.5" fill={DB.muted}>12am</text>
            <text x={toX(6)}  y={CH + 15} fontSize="8.5" textAnchor="middle" fill={DB.muted}>6am</text>
            <text x={toX(12)} y={CH + 15} fontSize="8.5" textAnchor="middle" fill={DB.muted}>noon</text>
            <text x={toX(18)} y={CH + 15} fontSize="8.5" textAnchor="middle" fill={DB.muted}>6pm</text>
            <text x={CW - 1}  y={CH + 15} fontSize="8.5" textAnchor="end"    fill={DB.muted}>12am</text>
          </svg>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Safe  < 2 ft',   color: DB.green },
          { label: 'Caution  2–4 ft', color: DB.amber },
          { label: 'No-Go  > 4 ft',  color: DB.red   },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: DB.muted }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }}/>
            {label}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: DB.muted, textAlign: 'center', marginTop: 4 }}>
        Open-Meteo Marine Forecast · Updated hourly
      </div>
    </div>
  );
}

// ── Windy Embed View ─────────────────────────────────────────────────────────
const WINDY_OVERLAYS = [
  { id: 'wind',     label: '🌬 Wind'    },
  { id: 'waves',    label: '🌊 Waves'   },
  { id: 'gustAccu', label: '💨 Gusts'   },
  { id: 'rain',     label: '🌧 Rain'    },
  { id: 'temp',     label: '🌡 Temp'    },
];

function WindyView({ lat, lon, accent }) {
  const [overlay, setOverlay] = useState('wind');
  const [product, setProduct] = useState('ecmwf');

  const clat = lat  ? parseFloat(lat.toFixed(3))  : 27.5;
  const clon = lon  ? parseFloat(lon.toFixed(3))  : -82.6;
  const zoom = 8;

  const src = `https://embed.windy.com/embed2.html?` +
    `lat=${clat}&lon=${clon}&` +
    `detailLat=${clat}&detailLon=${clon}&` +
    `width=800&height=600&zoom=${zoom}&level=surface&` +
    `overlay=${overlay}&product=${product}&` +
    `menu=&message=true&marker=true&calendar=now&pressure=&` +
    `type=map&location=coordinates&detail=&` +
    `metricWind=kt&metricTemp=%C2%B0F&radarRange=-1`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: DB.bg }}>
      {/* Header bar */}
      <div style={{
        padding: '10px 16px', background: DB.card, borderBottom: `1px solid ${DB.border}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', color: DB.muted, fontWeight: 700, textTransform: 'uppercase' }}>Live Forecast</div>
          <div style={{ fontSize: 19, color: DB.text, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Windy</div>
        </div>

        {/* Overlay pills */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {WINDY_OVERLAYS.map(o => {
            const on = overlay === o.id;
            return (
              <button key={o.id} onClick={() => setOverlay(o.id)} style={{
                all: 'unset', cursor: 'pointer', padding: '5px 11px', borderRadius: 8,
                background: on ? accent : DB.bg,
                color: on ? '#fff' : DB.muted,
                fontSize: 12, fontWeight: on ? 700 : 500,
                border: `1.5px solid ${on ? accent : DB.border}`,
                transition: 'all 0.12s',
                boxShadow: on ? `0 2px 8px ${accent}44` : 'none',
              }}>
                {o.label}
              </button>
            );
          })}
        </div>

        {/* Model switcher */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {['ecmwf', 'gfs'].map(m => {
            const on = product === m;
            return (
              <button key={m} onClick={() => setProduct(m)} style={{
                all: 'unset', cursor: 'pointer', padding: '5px 10px', borderRadius: 7,
                background: on ? `${accent}18` : 'transparent',
                color: on ? accent : DB.muted,
                fontSize: 11, fontWeight: on ? 700 : 500,
                border: `1.5px solid ${on ? `${accent}55` : DB.border}`,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Windy iframe */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <iframe
          key={src}
          src={src}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
          allowFullScreen
          title="Windy live forecast map"
        />
      </div>
    </div>
  );
}

// ── Tide Gauge View ──────────────────────────────────────────────────────────
function TideGaugeView({ lat, lon, accent }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);
  const [lastLoad, setLastLoad] = useState(null);

  useEffect(() => {
    if (!lat || !lon) { setErr('No location — enable GPS or plan a route first.'); setLoading(false); return; }
    let cancelled = false;
    setLoading(d => d === null ? true : d); // only show spinner on first load
    fetch(`${API}/api/noaa/tides/gauge?lat=${lat}&lon=${lon}`)
      .then(r => r.ok ? r.json() : Promise.reject('API error'))
      .then(d => { if (!cancelled) { setData(d); setLoading(false); setErr(null); setLastLoad(Date.now()); } })
      .catch(() => { if (!cancelled) { setErr('Could not load tide data from NOAA.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [lat, lon]);

  // Auto-refresh every 5 min
  useEffect(() => {
    if (!lat || !lon) return;
    const id = setInterval(() => {
      fetch(`${API}/api/noaa/tides/gauge?lat=${lat}&lon=${lon}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) { setData(d); setLastLoad(Date.now()); } })
        .catch(() => {});
    }, 5 * 60000);
    return () => clearInterval(id);
  }, [lat, lon]);

  const fmtFt  = (v) => v != null ? `${v.toFixed(1)} ft` : '—';
  const fmtTime = (noaaStr) => {
    if (!noaaStr) return '—';
    const [date, time] = noaaStr.split(' ');
    if (!time) return '—';
    const [h, m] = time.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const ageStr = lastLoad ? (() => {
    const s = Math.floor((Date.now() - lastLoad) / 1000);
    return s < 60 ? 'just now' : `${Math.floor(s / 60)}m ago`;
  })() : null;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: DB.muted, fontSize: 14 }}>
      Loading tide data…
    </div>
  );

  if (err || !data) return (
    <div style={{ padding: 32, textAlign: 'center', color: DB.muted }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🌊</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: DB.text, marginBottom: 6 }}>{err || 'No data'}</div>
    </div>
  );

  const { station, currentFt, trend, predictions, hilos, nextHigh, nextLow } = data;

  // Chart dimensions
  const CW = 360, CH = 70;
  const vals  = predictions.map(p => p.v);
  const vMin  = Math.min(...vals) - 0.3;
  const vMax  = Math.max(...vals) + 0.3;
  const vRng  = vMax - vMin || 1;

  const toX = (noaaStr) => {
    const time = noaaStr.split(' ')[1] || '00:00';
    const [h, m] = time.split(':').map(Number);
    return ((h * 60 + m) / 1440) * CW;
  };
  const toY = (v) => CH - ((v - vMin) / vRng) * CH;

  const linePts = predictions.map(p => `${toX(p.t).toFixed(1)},${toY(p.v).toFixed(1)}`).join(' ');
  const areaPts = `${toX(predictions[0].t).toFixed(1)},${CH} ${linePts} ${toX(predictions[predictions.length - 1].t).toFixed(1)},${CH}`;

  const now = new Date();
  const nowX = ((now.getHours() * 60 + now.getMinutes()) / 1440) * CW;

  // Tide level gauge bar (vertical stick)
  const dayMin = Math.min(...vals), dayMax = Math.max(...vals);
  const dayRng = dayMax - dayMin || 1;
  const levelPct = currentFt != null ? Math.max(0, Math.min(1, (currentFt - dayMin) / dayRng)) : 0;

  const trendColor = trend === 'rising' ? DB.blue : trend === 'falling' ? '#64748B' : DB.muted;
  const trendIcon  = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : '→';
  const heightColor = currentFt == null ? DB.muted : currentFt < 1 ? DB.amber : currentFt > 3 ? DB.blue : '#0EA5E9';

  // Today's hi/lo from hilos filtered to today only
  const todayHilos = (hilos || []).filter(p => {
    const dateStr = p.t?.split(' ')[0];
    const todayStr = now.toISOString().slice(0, 10);
    return dateStr === todayStr || dateStr === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  });

  return (
    <div style={{ padding: '12px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: DB.muted, fontWeight: 600, textTransform: 'uppercase' }}>NOAA Tide Gauge</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: DB.text, letterSpacing: '-0.02em', marginTop: 2 }}>{station.name}</div>
        <div style={{ fontSize: 11, color: DB.muted, marginTop: 2 }}>
          {station.dist_km != null ? `${(station.dist_km * 0.621).toFixed(0)} mi away · ` : ''}Station {station.id}
        </div>
      </div>

      {/* Main gauge card */}
      <div style={{ background: DB.card, border: `1.5px solid ${DB.border}`, borderRadius: 16, padding: '18px 20px', display: 'flex', gap: 20, alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* Tide stick */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: DB.muted, letterSpacing: '0.06em' }}>{fmtFt(dayMax)}</div>
          <div style={{ width: 22, height: 100, background: '#EFF6FF', borderRadius: 6, border: `1px solid ${DB.border}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${levelPct * 100}%`, background: `linear-gradient(to top, ${accent}, ${accent}88)`, borderRadius: '0 0 5px 5px', transition: 'height 0.6s ease' }}/>
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: DB.muted, letterSpacing: '0.06em' }}>{fmtFt(dayMin)}</div>
        </div>

        {/* Current reading */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 42, fontWeight: 900, color: heightColor, lineHeight: 1, letterSpacing: '-0.03em' }}>
              {currentFt != null ? currentFt.toFixed(1) : '—'}
            </span>
            <span style={{ fontSize: 18, fontWeight: 600, color: DB.muted }}>ft</span>
            <span style={{ fontSize: 22, color: trendColor, fontWeight: 800, marginLeft: 4 }}>{trendIcon}</span>
          </div>
          <div style={{ fontSize: 12, color: DB.muted, marginTop: 4 }}>
            above MLLW · <span style={{ color: trendColor, fontWeight: 600, textTransform: 'capitalize' }}>{trend}</span>
          </div>
        </div>
      </div>

      {/* Next High / Low */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Next High', item: nextHigh, color: DB.blue, bg: DB.blueSoft },
          { label: 'Next Low',  item: nextLow,  color: DB.muted, bg: DB.bg },
        ].map(({ label, item, color, bg }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${DB.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DB.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{fmtFt(item?.v)}</div>
            <div style={{ fontSize: 12, color: DB.muted, marginTop: 4 }}>{fmtTime(item?.t)}</div>
          </div>
        ))}
      </div>

      {/* Tide chart */}
      {predictions.length > 1 && (
        <div style={{ background: DB.card, border: `1px solid ${DB.border}`, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DB.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Today's Tide</div>
          <svg width="100%" viewBox={`0 0 ${CW} ${CH + 22}`} style={{ display: 'block', overflow: 'visible' }}>
            {/* Background */}
            <rect width={CW} height={CH} rx="6" fill="#EFF6FF"/>
            {/* Horizontal grid lines */}
            {[0.25, 0.5, 0.75].map(f => (
              <line key={f} x1="0" y1={CH * (1 - f)} x2={CW} y2={CH * (1 - f)} stroke="#DBEAFE" strokeWidth="0.8"/>
            ))}
            {/* Tide area fill */}
            <polygon points={areaPts} fill={accent} fillOpacity="0.15"/>
            {/* Tide curve */}
            <polyline points={linePts} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            {/* H/L labels */}
            {todayHilos.map((p, i) => {
              const x = toX(p.t), y = toY(p.v);
              const isH = p.type === 'H';
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r="4" fill={isH ? DB.blue : '#94A3B8'} stroke="white" strokeWidth="1.5"/>
                  <text x={x} y={isH ? y - 8 : y + 16} fontSize="8.5" textAnchor="middle" fill={isH ? DB.blue : '#64748B'} fontWeight="700">
                    {p.type} {p.v.toFixed(1)}
                  </text>
                </g>
              );
            })}
            {/* Current time line */}
            {nowX >= 0 && nowX <= CW && (
              <line x1={nowX} y1="0" x2={nowX} y2={CH} stroke="#EF4444" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.9"/>
            )}
            {/* X-axis labels */}
            {[{ label: '6am', h: 6 }, { label: 'noon', h: 12 }, { label: '6pm', h: 18 }].map(({ label, h }) => (
              <text key={label} x={(h / 24) * CW} y={CH + 14} fontSize="8.5" textAnchor="middle" fill={DB.muted}>{label}</text>
            ))}
            <text x="0" y={CH + 14} fontSize="8.5" fill={DB.muted}>12am</text>
            <text x={CW} y={CH + 14} fontSize="8.5" textAnchor="end" fill={DB.muted}>12am</text>
          </svg>
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: 11, color: DB.muted, textAlign: 'center' }}>
        NOAA Tides &amp; Currents · MLLW datum
        {ageStr && <span style={{ marginLeft: 6 }}>· refreshed {ageStr}</span>}
      </div>
    </div>
  );
}

// ── SOS / Emergency Panel ────────────────────────────────────────────────────
const USCG_SECTORS = [
  { name: 'USCG Sector Boston',            lat: 42.36, lon: -71.06, phone: '(617) 223-8555' },
  { name: 'USCG Sector New York',          lat: 40.65, lon: -74.03, phone: '(718) 354-4352' },
  { name: 'USCG Sector Delaware Bay',      lat: 39.93, lon: -75.14, phone: '(215) 271-4940' },
  { name: 'USCG Sector Baltimore',         lat: 39.29, lon: -76.61, phone: '(410) 576-2525' },
  { name: 'USCG Sector Hampton Roads',     lat: 36.82, lon: -76.09, phone: '(757) 398-6390' },
  { name: 'USCG Sector North Carolina',    lat: 34.73, lon: -76.67, phone: '(252) 247-4570' },
  { name: 'USCG Sector Charleston',        lat: 32.78, lon: -79.93, phone: '(843) 724-7600' },
  { name: 'USCG Sector Jacksonville',      lat: 30.33, lon: -81.66, phone: '(904) 714-7600' },
  { name: 'USCG Sector Miami',             lat: 25.78, lon: -80.19, phone: '(305) 535-4314' },
  { name: 'USCG Sector St. Petersburg',   lat: 27.77, lon: -82.64, phone: '(727) 824-7506' },
  { name: 'USCG Sector Mobile',            lat: 30.65, lon: -88.11, phone: '(251) 441-5976' },
  { name: 'USCG Sector New Orleans',       lat: 29.97, lon: -90.07, phone: '(504) 589-6225' },
  { name: 'USCG Sector Houston-Galveston', lat: 29.76, lon: -95.37, phone: '(281) 464-4851' },
  { name: 'USCG Sector Corpus Christi',    lat: 27.79, lon: -97.40, phone: '(361) 939-6393' },
  { name: 'USCG Sector San Diego',         lat: 32.73, lon: -117.17, phone: '(619) 278-7033' },
  { name: 'USCG Sector LA/Long Beach',     lat: 33.75, lon: -118.22, phone: '(310) 521-3801' },
  { name: 'USCG Sector San Francisco',     lat: 37.81, lon: -122.47, phone: '(415) 399-3547' },
  { name: 'USCG Sector Puget Sound',       lat: 47.60, lon: -122.34, phone: '(206) 217-6232' },
  { name: 'USCG Sector Columbia River',    lat: 46.13, lon: -123.93, phone: '(503) 861-6211' },
  { name: 'USCG Sector Honolulu',          lat: 21.31, lon: -157.87, phone: '(808) 842-2600' },
  { name: 'USCG Sector Anchorage',         lat: 61.22, lon: -149.88, phone: '(907) 428-4100' },
  { name: 'USCG Sector Lake Michigan',     lat: 41.89, lon: -87.63,  phone: '(312) 980-8600' },
  { name: 'USCG Sector Detroit',           lat: 42.33, lon: -83.05,  phone: '(313) 568-9580' },
  { name: 'USCG Sector Buffalo',           lat: 42.89, lon: -78.87,  phone: '(716) 843-9570' },
];

function _nearestSector(lat, lon) {
  if (lat == null || lon == null) return null;
  let best = null, bestD = Infinity;
  for (const s of USCG_SECTORS) {
    const d = _haversineNm(lat, lon, s.lat, s.lon);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

const DISTRESS_TYPES = [
  { id: 'general',  label: 'General',       desc: 'in distress and require immediate assistance' },
  { id: 'sinking',  label: 'Sinking',       desc: 'sinking / taking on water' },
  { id: 'fire',     label: 'Fire',          desc: 'on fire' },
  { id: 'mob',      label: 'Man Overboard', desc: 'reporting a person overboard' },
  { id: 'medical',  label: 'Medical',       desc: 'experiencing a medical emergency' },
];

function _fmtDeg(val, posLabel, negLabel) {
  if (val == null) return '?';
  return `${Math.abs(val).toFixed(4)}° ${val >= 0 ? posLabel : negLabel}`;
}

function SOSScreen({ boat, appUserPos }) {
  const [distressId, setDistressId] = useState('general');
  const [copied, setCopied]         = useState(null); // 'script' | 'location' | null

  const lat = appUserPos?.lat ?? null;
  const lon = appUserPos?.lng ?? appUserPos?.lon ?? null;
  const sector = _nearestSector(lat, lon);

  const locationStr = lat != null
    ? `${_fmtDeg(lat,'N','S')}, ${_fmtDeg(lon,'E','W')}`
    : 'UNKNOWN — enable GPS';

  const distress = DISTRESS_TYPES.find(d => d.id === distressId) ?? DISTRESS_TYPES[0];
  const vessel   = boat?.name ?? 'MY VESSEL';
  const persons  = boat?.capacity ?? '?';

  const script = [
    'MAYDAY  MAYDAY  MAYDAY',
    `This is vessel ${vessel.toUpperCase()}, ${vessel.toUpperCase()}, ${vessel.toUpperCase()}`,
    `MAYDAY ${vessel.toUpperCase()}`,
    `My position: ${locationStr}`,
    `I am ${distress.desc}`,
    `${persons !== '?' ? `I have ${persons} persons on board` : 'Number of persons — state count'}`,
    'I require immediate assistance',
    'OVER',
  ].join('\n');

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
    }).catch(() => {});
  };

  const mapsLink = lat != null ? `https://maps.google.com/?q=${lat},${lon}` : null;

  const S = {
    card:  { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '16px 18px', marginBottom: 14 },
    step:  { fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 6 },
    h2:    { fontSize: 15, fontWeight: 800, color: 'white', marginBottom: 10 },
    btn:   { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, transition: 'background 0.12s' },
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'linear-gradient(160deg, #7F1D1D 0%, #991B1B 50%, #7C0000 100%)', fontFamily: 'inherit', padding: '20px 20px 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 28 }}>🚨</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: '-0.02em', lineHeight: 1.1 }}>EMERGENCY</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Stay calm — follow these steps</div>
        </div>
      </div>

      {/* Distress type selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {DISTRESS_TYPES.map(d => (
          <button key={d.id} onClick={() => setDistressId(d.id)} style={{
            all: 'unset', cursor: 'pointer', padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
            background: distressId === d.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
            border: `1.5px solid ${distressId === d.id ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.18)'}`,
            color: distressId === d.id ? 'white' : 'rgba(255,255,255,0.65)',
          }}>
            {d.label}
          </button>
        ))}
      </div>

      {/* Step 1 — Call */}
      <div style={S.card}>
        <div style={S.step}>Step 1</div>
        <div style={S.h2}>📻 Call for Help</div>

        <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>VHF Radio</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: '-0.01em' }}>Channel 16</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>International distress frequency — monitored 24/7</div>
        </div>

        {sector && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Nearest Coast Guard</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 2 }}>{sector.name}</div>
            <a href={`tel:${sector.phone.replace(/[^\d]/g,'')}`} style={{ fontSize: 20, fontWeight: 900, color: '#FCA5A5', textDecoration: 'none', letterSpacing: '-0.01em' }}>
              {sector.phone}
            </a>
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>National USCG Emergency</div>
          <a href="tel:18007326293" style={{ fontSize: 15, fontWeight: 800, color: '#FCA5A5', textDecoration: 'none' }}>1-800-SEA-MAYDAY</a>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>(1-800-732-6293)</span>
        </div>
      </div>

      {/* Step 2 — MAYDAY Script */}
      <div style={S.card}>
        <div style={S.step}>Step 2</div>
        <div style={S.h2}>📢 Say This on VHF Channel 16</div>

        <pre style={{
          fontFamily: '"JetBrains Mono", "Fira Mono", "Consolas", monospace',
          fontSize: 13, lineHeight: 1.7, color: 'white', background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '14px 16px',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0 0 12px 0',
        }}>
          {script}
        </pre>

        <button
          onClick={() => copyText(script, 'script')}
          style={{ ...S.btn, background: copied === 'script' ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.12)', color: copied === 'script' ? '#86EFAC' : 'white', border: `1px solid ${copied === 'script' ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.2)'}` }}
        >
          {copied === 'script' ? '✓ Copied!' : '⎘ Copy Script'}
        </button>
      </div>

      {/* Step 3 — Share Location */}
      <div style={S.card}>
        <div style={S.step}>Step 3</div>
        <div style={S.h2}>📍 Share Your Position</div>

        <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 12, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
          {locationStr}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mapsLink && (
            <>
              <button
                onClick={() => copyText(mapsLink, 'location')}
                style={{ ...S.btn, background: copied === 'location' ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.12)', color: copied === 'location' ? '#86EFAC' : 'white', border: `1px solid ${copied === 'location' ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.2)'}` }}
              >
                {copied === 'location' ? '✓ Copied!' : '⎘ Copy Map Link'}
              </button>
              <a href={mapsLink} target="_blank" rel="noreferrer" style={{ ...S.btn, background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', textDecoration: 'none' }}>
                ↗ Open in Maps
              </a>
            </>
          )}
          {lat == null && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Enable GPS on the map to get your position.</div>
          )}
        </div>
      </div>

      {/* Footer reminder */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.6, marginTop: 4 }}>
        In US waters, the Coast Guard monitors VHF Channel 16 and 2182 kHz at all times.<br/>
        Always activate your EPIRB if available.
      </div>
    </div>
  );
}

// ── Main WebDashboard ────────────────────────────────────────────────────────
function WebDashboard({
  user, boat, boats, presetBoats, route, routeSafety, trips, currentTrip, appUserPos,
  profileColor, accent, authToken, chatUnread, setChatUnread, activeDm, setActiveDm,
  onPlanRoute, onSaveTrip, onLogout, onPinSet, onSelectBoat, onPickBoat,
  addBoat, deleteBoat, onProfileColorChange,
  onDeleteAccount, routingActive, routeError,
}) {
  const [activeView, setActiveView] = useState('home');

  const { isLogging, elapsed: logElapsed, distNm: logDistNm, startLog, stopLog } =
    useTripLogger({ authToken, boat, appUserPos });

  const [weather, setWeather] = useState(null);
  const [nwsAlerts, setNwsAlerts] = useState([]);
  const [fuelDocks, setFuelDocks] = useState([]);
  const [marinas, setMarinas] = useState([]);
  const [dashSeamarks, setDashSeamarks] = useState({ hazards: [], bridges: [], reported: [] });
  const [dashVessels, setDashVessels] = useState([]);
  const [aisConnected, setAisConnected] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);

  const storedFuel = boat?.id ? parseFloat(localStorage.getItem(FUEL_KEY(boat.id)) || '0') : 0;
  const fuelLevel  = storedFuel > 0 ? storedFuel : (boat?.fuelLevel || 0);
  const fuelRangeNm = (boat?.fuelBurn>0 && boat?.cruiseSpeed>0 && fuelLevel>0) ? (fuelLevel/boat.fuelBurn)*boat.cruiseSpeed : 0;
  const fuelRangeMi = Math.round(fuelRangeNm * 1.151);
  const fuelCap    = boat?.fuelCapacity || boat?.tank || 90;
  const fuelPct    = fuelCap > 0 ? Math.min(100, Math.round((fuelLevel/fuelCap)*100)) : 0;

  const nextBridge = dashSeamarks.bridges?.find(b => b.verClr_ft != null) || null;
  const bridgeAlert = nextBridge && boat?.mastHeight && nextBridge.verClr_ft < parseFloat(boat.mastHeight)
    ? [{ type:'danger', text:`Bridge Clearance Alert — ${nextBridge.name||'Upcoming Bridge'}: ${nextBridge.verClr_ft}ft clearance` }] : [];
  const nwsSevere = nwsAlerts.filter(a => a.severity === 'Extreme' || a.severity === 'Severe').map(a => ({ type:'danger', text: a.headline || a.event }));
  const nwsMod    = nwsAlerts.filter(a => a.severity === 'Moderate').map(a => ({ type:'warning', text: a.headline || a.event }));
  const cpaAlertVessels = dashVessels.filter(v => {
    if (!appUserPos) return false;
    const c = _computeCPA(appUserPos.lat, appUserPos.lng, 0, 0, v.lat, v.lng, v.sog||0, v.cog||0);
    return c.dNm < 0.5 && c.tMin > 0 && c.tMin < 20;
  });
  const cpaAlerts = cpaAlertVessels.map(v => ({ type:'danger', text:`Collision risk: ${v.name} — CPA within 20 min` }));
  const alerts = [...bridgeAlert, ...cpaAlerts, ...nwsSevere, ...nwsMod, ...(routeSafety?.reasons||[]).map(r => ({ type:'warning', text:r }))].slice(0,10);

  const routeDistNm  = route?.waypoints ? _routeDistNm(route.waypoints) : 0;
  const routeDistMi  = Math.round(routeDistNm * 1.151 * 10) / 10;
  const isMapView    = ['home','navigate','map'].includes(activeView);

  useEffect(() => {
    const lat = appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null);
    const lon = appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null);
    if (!lat || !lon) return;
    fetch(`${API}/api/noaa/buoys?lat=${lat}&lon=${lon}&n=1`)
      .then(r => r.ok ? r.json() : [])
      .then(async buoys => {
        if (!buoys.length) return;
        const obs = await fetch(`${API}/api/noaa/buoys/${buoys[0].id}/obs`).then(r => r.ok ? r.json() : null).catch(()=>null);
        if (obs) setWeather({ ...obs, buoyName: buoys[0].name });
      }).catch(()=>{});
  }, [appUserPos?.lat, route?.fromLat]);

  useEffect(() => {
    const lat = appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null);
    const lon = appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null);
    if (!lat || !lon) return;
    fetch(`${API}/api/noaa/alerts?lat=${lat}&lon=${lon}`)
      .then(r => r.ok ? r.json() : [])
      .then(setNwsAlerts).catch(()=>{});
  }, [appUserPos?.lat, route?.fromLat]);

  useEffect(() => {
    const lat = appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null);
    const lon = appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null);
    if (!lat || !lon) return;
    _fetchFuelDocks(lat, lon).then(setFuelDocks);
    _fetchMarinas(lat, lon).then(setMarinas);
  }, [appUserPos?.lat, route?.fromLat]);

  const handleSearch = e => {
    if (e.key === 'Enter' && searchVal.trim()) {
      const from = route?.from
        ? { from: route.from }
        : appUserPos
        ? { from: 'My Location', fromLat: appUserPos.lat, fromLon: appUserPos.lng }
        : { from: 'My Location' };
      onPlanRoute({ ...from, to: searchVal.trim(), waypoints: null });
      setSearchVal('');
      setActiveView('home');
    }
  };

  const navigate = v => {
    if (v === 'hazards-report') { setShowReportModal(true); return; }
    setActiveView(v);
    if (v === 'chat') setChatUnread(0);
  };

  return (
    <div style={{ display:'flex', height:'100vh', width:'100vw', overflow:'hidden', fontFamily:'"Inter",-apple-system,system-ui,sans-serif', background:DB.bg }}>
      <DashSidebar activeView={activeView} onNavigate={navigate} user={user} boat={boat}
        profileColor={profileColor} chatUnread={chatUnread} alertCount={alerts.length}
        vesselAlertCount={cpaAlertVessels.length} onLogout={onLogout}/>

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        <DashTopBar searchVal={searchVal} setSearchVal={setSearchVal} onSearch={handleSearch}
          user={user} chatUnread={chatUnread} profileColor={profileColor} accent={accent}
          alertCount={alerts.length} onNavigate={navigate}/>

        <DashInfoCards boat={boat} fuelRangeMi={fuelRangeMi} fuelPct={fuelPct}
          nextBridge={nextBridge} weather={weather} accent={accent} onPickBoat={() => navigate('boats')}
          onSOS={() => navigate('sos')}/>

        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
            <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
              {isMapView ? (
                <>
                  <LiveMap route={route} accent={accent} routingActive={routingActive} routeError={routeError}
                    onPinSet={(type, lat, lon, name) => {
                      const r = route;
                      const up = type === 'from'
                        ? { from:name, fromLat:lat, fromLon:lon, to:r.to, toLat:r.toLat, toLon:r.toLon }
                        : { from:r.from, fromLat:r.fromLat, fromLon:r.fromLon, to:name, toLat:lat, toLon:lon };
                      onPlanRoute({ ...up, waypoints:null });
                    }}
                    bottomInset={0} boat={boat} fuelLevel={fuelLevel}
                    onReportHazard={(lat, lon) => { setShowReportModal({ lat, lon }); }}
                    onSeamarks={setDashSeamarks}
                    onVessels={list => { setDashVessels(list); setAisConnected(list.length > 0 || true); }}
                    isNavView={activeView === 'navigate'}
                    isLogging={isLogging}
                    logElapsed={logElapsed}
                    logDistNm={Math.round(logDistNm * 100) / 100}
                    onStartLog={startLog}
                    onStopLog={stopLog}/>
                  {/* Navigate view — no-route prompt */}
                  {activeView === 'navigate' && !route?.waypoints && (
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', zIndex:200 }}>
                      <div style={{ background:'rgba(8,17,28,0.92)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:18, padding:'24px 28px', textAlign:'center', pointerEvents:'auto', backdropFilter:'blur(16px)', maxWidth:320 }}>
                        <div style={{ fontSize:32, marginBottom:10 }}>🧭</div>
                        <div style={{ fontSize:16, fontWeight:800, color:'white', marginBottom:6 }}>No Active Route</div>
                        <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)', marginBottom:16, lineHeight:1.5 }}>Plan a route first, then come back to Navigate for turn-by-turn guidance.</div>
                        <button onClick={() => navigate('trips')} style={{ all:'unset', cursor:'pointer', padding:'10px 20px', background:accent, color:'#06151E', borderRadius:10, fontSize:13.5, fontWeight:700 }}>
                          Plan a Route →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : activeView === 'chat' ? (
                <div style={{ height:'100%', overflow:'hidden' }}>
                  <ChatScreen accent={accent} authToken={authToken} user={user}
                    routeDep={route?.fromLat ? [parseFloat(route.fromLat), parseFloat(route.fromLon)] : null}
                    onNewMessage={()=>{}} profileColor={profileColor}/>
                </div>
              ) : activeView === 'settings' ? (
                <div style={{ height:'100%', overflowY:'auto', background:DB.bg }}>
                  <SettingsScreen accent={accent} user={user} onLogout={onLogout}
                    profileColor={profileColor} onProfileColorChange={onProfileColorChange}
                    onDeleteAccount={onDeleteAccount} authToken={authToken} onOpenDm={setActiveDm}/>
                </div>
              ) : activeView === 'boats' ? (
                <div style={{ height:'100%', overflowY:'auto', background:DB.bg }}>
                  <BoatScreen accent={accent} boat={boat} setBoat={onSelectBoat}
                    boats={boats} addBoat={addBoat} deleteBoat={deleteBoat}
                    presetBoats={presetBoats} user={user}/>
                </div>
              ) : activeView === 'trips' ? (
                <div style={{ height:'100%', overflowY:'auto', background:DB.bg }}>
                  <TripScreen accent={accent} boat={boat} verdict={routeSafety?.verdict||'go'}
                    route={route} routeSafety={routeSafety}
                    onSave={onSaveTrip} onPlan={onPlanRoute}/>
                </div>
              ) : activeView === 'vessels' ? (
                <VesselsView vessels={dashVessels} userPos={appUserPos} aisConnected={aisConnected} accent={accent}/>
              ) : activeView === 'fuel' ? (
                <FuelView boat={boat} authToken={authToken} route={route} appUserPos={appUserPos}/>
              ) : activeView === 'marinas' ? (
                <MarinaView
                  lat={appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null)}
                  lon={appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null)}
                  onPlanRoute={partial => onPlanRoute({ ...route, ...partial, waypoints:null })}/>
              ) : activeView === 'hazards' ? (
                <HazardsView
                  lat={appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null)}
                  lon={appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null)}
                  seamarks={[...dashSeamarks.hazards, ...(dashSeamarks.reported||[])]}
                  authToken={authToken} user={user}
                  onHazardSubmitted={() => {}}/>
              ) : activeView === 'alerts' ? (
                <AlertsView
                  lat={appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null)}
                  lon={appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null)}
                  routeSafety={routeSafety}
                  boat={boat}
                  bridges={dashSeamarks.bridges}/>
              ) : activeView === 'tides' ? (
                <div style={{ height:'100%', overflowY:'auto', background:DB.bg }}>
                  <TideGaugeView
                    lat={appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null)}
                    lon={appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null)}
                    accent={accent}/>
                </div>
              ) : activeView === 'sea-state' ? (
                <div style={{ height:'100%', overflowY:'auto', background:DB.bg }}>
                  <SeaStateView
                    lat={appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null)}
                    lon={appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null)}
                    accent={accent}/>
                </div>
              ) : activeView === 'sos' ? (
                <SOSScreen boat={boat} appUserPos={appUserPos}/>
              ) : activeView === 'trip-logs' ? (
                <div style={{ height:'100%', overflowY:'auto', background:DB.bg }}>
                  <TripLogsView authToken={authToken} accent={accent} boat={boat}/>
                </div>
              ) : activeView === 'weather' ? (
                <WeatherView
                  lat={appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null)}
                  lon={appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null)}/>
              ) : activeView === 'windy' ? (
                <WindyView
                  lat={appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null)}
                  lon={appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null)}
                  accent={accent}/>
              ) : (
                <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:DB.muted, background:DB.bg }}>
                  <Icon name="compass" size={38} color={DB.border}/>
                  <div style={{ fontSize:15, fontWeight:600, color:DB.muted }}>Coming Soon</div>
                  <div style={{ fontSize:13 }}>This section is under development</div>
                </div>
              )}
            </div>

            <DashTripBar route={route} currentTrip={currentTrip}
              fuelLevel={fuelLevel} fuelPct={fuelPct} fuelCap={fuelCap}
              fuelRangeMi={fuelRangeMi} routeDistMi={routeDistMi}
              onPlan={() => navigate('trips')}/>
          </div>

          <DashRightPanel alerts={alerts} fuelDocks={fuelDocks}
            hazards={[...dashSeamarks.hazards, ...(dashSeamarks.reported||[])]} marinas={marinas}
            onOpenChat={() => navigate('chat')}/>
        </div>

        <DashBottomTab activeView={activeView} onNavigate={navigate}
          chatUnread={chatUnread} alertCount={alerts.length} accent={accent}/>
      </div>

      {activeDm && (
        <DirectMessageModal friend={activeDm} authToken={authToken} user={user}
          profileColor={profileColor} accent={accent} onClose={() => setActiveDm(null)}/>
      )}

      {showReportModal && (
        <ReportHazardModal
          lat={showReportModal.lat ?? appUserPos?.lat ?? (route?.fromLat ? parseFloat(route.fromLat) : null)}
          lon={showReportModal.lon ?? appUserPos?.lng ?? (route?.fromLon ? parseFloat(route.fromLon) : null)}
          authToken={authToken} user={user}
          onClose={() => setShowReportModal(false)}
          onSubmitted={() => setShowReportModal(false)}/>
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
  // Dark mode removed — always use light theme. Clear any stale stored preference.
  localStorage.removeItem('safeseas_color_mode');
  const [colorMode] = useState('light');
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

  // Ensure .dark class is never present (dark mode removed).
  useEffect(() => { document.documentElement.classList.remove('dark'); }, []);

  // ── App state ──
  const [tab, setTab] = useState('home');
  const [chatUnread, setChatUnread] = useState(0);
  const [activeDm, setActiveDm] = useState(null); // { id, name } of friend
  const [boat, setBoat] = useState(null);
  const [boats, setBoats] = useState([]);
  const [presetBoats, setPresetBoats] = useState([]);
  const [trips, setTrips] = useState([]);
  const [route, setRoute] = useState({ from: 'Anna Maria Island', to: 'Egmont Key' });
  const [currentTrip, setCurrentTrip] = useState(null);
  const [routeSafety, setRouteSafety] = useState(null);
  const [routingActive, setRoutingActive] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const routeReqIdRef = useRef(0);
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
      // Request sequencing: only the most recently issued planRoute call is
      // allowed to apply its result, so an overlapping earlier request can't
      // overwrite a newer one with a stale route.
      const reqId = ++routeReqIdRef.current;
      setRoutingActive(true);
      setRouteError(null);
      fetch(`${API}/api/maritime-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromLat: full.fromLat, fromLon: full.fromLon, toLat: full.toLat, toLon: full.toLon }),
      })
        .then(async r => {
          const data = await r.json().catch(() => null);
          if (routeReqIdRef.current !== reqId) return; // superseded by a newer request
          setRoutingActive(false);
          if (r.ok && data?.waypoints) {
            setRoute(prev => ({ ...prev, waypoints: data.waypoints }));
          } else {
            // Never fall back to a straight line — an unrouted line can cross land.
            setRoute(prev => ({ ...prev, waypoints: null }));
            setRouteError(data?.error || 'No water route found between these points.');
          }
        })
        .catch(() => {
          if (routeReqIdRef.current !== reqId) return;
          setRoutingActive(false);
          setRoute(prev => ({ ...prev, waypoints: null }));
          setRouteError('Could not reach the routing server.');
        });
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
      <div style={{ minHeight:'100vh', width:'100%', background:DB.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Inter",-apple-system,system-ui,sans-serif' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:52, height:52, borderRadius:16, background:`${t.accent}18`, border:`1.5px solid ${t.accent}44`, display:'grid', placeItems:'center', margin:'0 auto 14px' }}>
            <Icon name="boat" size={26} color={t.accent}/>
          </div>
          <div style={{ fontSize:14, color:DB.muted }}>Loading Safe Seas…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight:'100vh', width:'100%', background:DB.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Inter",-apple-system,system-ui,sans-serif' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <LoginScreen accent={t.accent} onLogin={handleLogin}/>
        </div>
      </div>
    );
  }

  if (!disclaimerAccepted) {
    return (
      <div style={{ minHeight:'100vh', width:'100%', background:DB.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Inter",-apple-system,system-ui,sans-serif' }}>
        <div style={{ width:'100%', maxWidth:480 }}>
          <DisclaimerScreen accent={t.accent} onAccept={handleDisclaimerAccept}/>
        </div>
      </div>
    );
  }

  return (
    <WebDashboard
      user={user}
      boat={boat}
      boats={boats}
      presetBoats={presetBoats}
      route={route}
      routeSafety={routeSafety}
      routeError={routeError}
      trips={trips}
      currentTrip={currentTrip}
      appUserPos={appUserPos}
      profileColor={profileColor}
      accent={t.accent}
      authToken={authToken}
      chatUnread={chatUnread}
      setChatUnread={setChatUnread}
      activeDm={activeDm}
      setActiveDm={setActiveDm}
      onPlanRoute={planRoute}
      onSaveTrip={saveTrip}
      onLogout={handleLogout}
      onPinSet={(type, lat, lon, name) => {
        const r = route;
        const updated = type === 'from'
          ? { from: name, fromLat: lat, fromLon: lon, to: r.to, toLat: r.toLat, toLon: r.toLon }
          : { from: r.from, fromLat: r.fromLat, fromLon: r.fromLon, to: name, toLat: lat, toLon: lon };
        planRoute({ ...updated, waypoints: null, fromSnapped: null, toSnapped: null });
      }}
      onSelectBoat={b => setBoat(b)}
      onPickBoat={() => {}}
      addBoat={addBoat}
      deleteBoat={deleteBoat}
      onProfileColorChange={handleProfileColorChange}
      onDeleteAccount={deleteAccount}
      routingActive={routingActive}
    />
  );
}

export default App
