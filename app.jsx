// SafeSeas — Boater go/no-go app
// Three screens: Home, Trip Detail, Boat Profile
// Dark marine theme, outdoor-readable, large touch targets

const { useState, useEffect, useRef } = React;

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
  nogo:  { bg: '#3F1418', fg: '#FF6B6B', border: '#7A2530', label: 'NOT TODAY' },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#22E3D0",
  "verdict": "go",
  "pulseVerdict": true
}/*EDITMODE-END*/;

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
const BOATS = [
  { id: 'whaler',   name: 'Boston Whaler 220 Dauntless', short: 'Whaler 220',  year: '2018', length: '22 ft', type: 'Center console', waveLim: 3.5, windLim: 22 },
  { id: 'searay',   name: 'Sea Ray SPX 210',             short: 'Sea Ray 210', year: '2020', length: '21 ft', type: 'Bowrider',       waveLim: 3.0, windLim: 20 },
  { id: 'pontoon',  name: 'Bennington 22 SSX',           short: 'Bennington',  year: '2021', length: '22 ft', type: 'Pontoon',        waveLim: 2.0, windLim: 15 },
  { id: 'sail',     name: 'Catalina 22',                 short: 'Catalina 22', year: '2016', length: '22 ft', type: 'Sailboat',       waveLim: 4.0, windLim: 25 },
  { id: 'jon',      name: 'Tracker Grizzly 1648',        short: 'Grizzly 1648',year: '2019', length: '16 ft', type: 'Jon boat',       waveLim: 1.5, windLim: 12 },
  { id: 'jet',      name: 'Yamaha 252SD',                short: 'Yamaha 252',  year: '2022', length: '25 ft', type: 'Jet boat',       waveLim: 3.0, windLim: 22 },
];

const RECENT_TRIPS = [
  { from: 'Anna Maria Island', to: 'Egmont Key',     date: 'Last Saturday', dist: '11.4 nm', status: 'go' },
  { from: 'Anna Maria Island', to: 'Shell Key',      date: 'Apr 28',        dist: '8.2 nm',  status: 'go' },
  { from: 'Sarasota Bay',      to: 'Caladesi Island',date: 'Apr 14',        dist: '24.6 nm', status: 'wait' },
  { from: 'Anna Maria Island', to: 'Passage Key',    date: 'Apr 6',         dist: '4.1 nm',  status: 'go' },
];

const VERDICT_COPY = {
  go:   { line: 'Winds and waves are within your boat\u2019s comfort range.', best: 'Leave anytime \u2014 conditions hold through 6 PM.' },
  wait: { line: 'Waves are too rough for a 22-ft bowrider this morning.',     best: 'Leave at 4:15 PM for the smoothest ride.' },
  nogo: { line: 'Small craft advisory in effect through tonight.',            best: 'Skip today \u2014 Sunday looks clean.' },
};

// ─────────────────────────────────────────────────────────────
// Tiny icon set (line, 24px, strokeWidth 1.8)
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
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{paths[name]}</svg>;
};

// ─────────────────────────────────────────────────────────────
// Reusable UI bits
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

// Sparkline-style wind/wave/visibility tile
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
// Boat silhouette illustrations (simple line art)
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
  };
  return arts[type] || arts['Center console'];
}

// ─────────────────────────────────────────────────────────────
// Map — stylized Florida Gulf Coast SVG
// ─────────────────────────────────────────────────────────────
function MarineMap({ accent, routeProgress = 1 }) {
  // routeProgress 0..1 for draw animation
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

      {/* water */}
      <rect width="390" height="600" fill="url(#waterGrad)"/>
      <rect width="390" height="600" fill="url(#depthLines)" opacity="0.7"/>

      {/* contour lines around islands */}
      <g fill="none" stroke="#143049" strokeWidth="0.7" opacity="0.7">
        <path d="M-20 380 Q 60 360 130 380 T 280 360 T 420 380"/>
        <path d="M-20 430 Q 60 410 130 430 T 280 410 T 420 430"/>
        <path d="M-20 480 Q 60 460 130 480 T 280 460 T 420 480"/>
      </g>

      {/* mainland (right side — Florida peninsula edge) */}
      <path d="M390 0 L390 600 L300 600 Q 290 540 320 500 Q 340 470 330 430 Q 318 388 348 360 Q 372 332 360 290 Q 350 250 372 220 Q 388 195 380 160 Q 372 120 388 80 Q 396 40 390 0 Z"
        fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>

      {/* Anna Maria Island (long thin barrier island) */}
      <path d="M70 320 Q 64 360 70 410 Q 76 460 82 510 Q 84 540 78 560 L 88 562 Q 96 540 92 510 Q 86 460 82 410 Q 78 360 84 322 Z"
        fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>

      {/* Egmont Key */}
      <ellipse cx="180" cy="260" rx="18" ry="26" fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      {/* Passage Key */}
      <ellipse cx="140" cy="300" rx="7" ry="4" fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      {/* Shell Key cluster */}
      <ellipse cx="240" cy="180" rx="12" ry="6" fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>
      <ellipse cx="220" cy="160" rx="5" ry="3" fill="url(#landGrad)" stroke="#2A323E" strokeWidth="0.8"/>

      {/* Channel markers */}
      <g fontFamily="ui-monospace, Menlo, monospace" fontSize="9" fill="#3D556F" letterSpacing="0.05em">
        <circle cx="125" cy="365" r="2" fill="#3D556F"/><text x="130" y="368">G "1"</text>
        <circle cx="160" cy="320" r="2" fill="#3D556F"/><text x="165" y="323">R "2"</text>
        <circle cx="195" cy="290" r="2" fill="#3D556F"/><text x="200" y="293">G "3"</text>
      </g>

      {/* Route — accent line with glow */}
      <g>
        <path d="M82 420 C 110 400 130 380 150 340 C 165 310 170 290 180 270"
          stroke={accent} strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.4" filter="url(#routeGlow)"/>
        <path d="M82 420 C 110 400 130 380 150 340 C 165 310 170 290 180 270"
          stroke={accent} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeDasharray="800" strokeDashoffset={(1 - routeProgress) * 800}/>
      </g>

      {/* Start marker */}
      <g transform="translate(82 420)">
        <circle r="11" fill={accent} opacity="0.18"/>
        <circle r="6" fill="#0A1420" stroke={accent} strokeWidth="2.5"/>
      </g>
      <text x="96" y="424" fill="#F1F5F9" fontSize="11" fontWeight="600" fontFamily="ui-sans-serif">Anna Maria Island</text>
      <text x="96" y="438" fill="#7E94AE" fontSize="9.5" fontFamily="ui-monospace">27.4986° N · 82.7404° W</text>

      {/* End marker */}
      <g transform="translate(180 260)">
        <circle r="13" fill={accent} opacity="0.18"/>
        <circle r="13" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5"/>
        <path d="M0 -16 L4 -8 L-4 -8 Z" fill={accent}/>
        <circle r="4" fill={accent}/>
      </g>
      <text x="200" y="258" fill="#F1F5F9" fontSize="11" fontWeight="600" fontFamily="ui-sans-serif">Egmont Key</text>
      <text x="200" y="272" fill="#7E94AE" fontSize="9.5" fontFamily="ui-monospace">11.4 nm · 0h 52m</text>

      {/* Compass rose */}
      <g transform="translate(345 50)" opacity="0.55">
        <circle r="18" fill="none" stroke="#2A4258" strokeWidth="0.8"/>
        <path d="M0 -14 L3 0 L0 14 L-3 0 Z" fill="#5B7791"/>
        <path d="M0 -14 L3 0 L0 0 Z" fill="#F1F5F9"/>
        <text y="-22" textAnchor="middle" fontSize="9" fill="#5B7791" fontFamily="ui-monospace">N</text>
      </g>

      {/* Scale bar */}
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
// HOME SCREEN
// ─────────────────────────────────────────────────────────────
function HomeScreen({ accent, boat, onPlan, onTrip, onPickBoat, currentStatus }) {
  const [focus, setFocus] = useState(false);
  const [q, setQ] = useState('');
  return (
    <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#7E94AE', fontWeight: 600, textTransform: 'uppercase' }}>Friday · May 16</div>
          <div style={{ fontSize: 24, color: '#F1F5F9', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>Good morning, Max</div>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 99, background: '#13202E', border: '1px solid #1E2F42',
          display: 'grid', placeItems: 'center', color: '#F1F5F9', fontSize: 14, fontWeight: 700 }}>M</div>
      </div>

      {/* Destination search */}
      <div>
        <label style={{ fontSize: 12, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.04em' }}>WHERE ARE YOU HEADED?</label>
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 12,
          background: '#13202E', borderRadius: 16, padding: '0 16px', height: 60,
          border: `1px solid ${focus ? accent : '#1E2F42'}`,
          boxShadow: focus ? `0 0 0 4px ${accent}22` : 'none',
          transition: 'all 0.15s ease',
        }}>
          <Icon name="search" size={20} color={focus || q ? accent : '#7E94AE'}/>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="Egmont Key, Shell Key…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#F1F5F9', fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em',
              fontFamily: 'inherit',
            }}/>
        </div>
      </div>

      {/* Boat card */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <button onClick={onPickBoat} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
            <div style={{ width: 64, height: 44, background: '#0F1A26', borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <BoatArt type={boat.type} color="#F1F5F9" size={40}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your boat</div>
              <div style={{ fontSize: 15, color: '#F1F5F9', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {boat.year} {boat.name}
              </div>
              <div style={{ fontSize: 12, color: '#7E94AE', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {boat.length} · {boat.type}
              </div>
            </div>
            <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>Change</span>
          </div>
        </button>
      </Card>

      {/* Right now at marina */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: '#F1F5F9', fontWeight: 600 }}>Right now at Anna Maria Island</span>
          <span style={{ fontSize: 11, color: '#7E94AE', fontVariantNumeric: 'tabular-nums' }}>updated 6 min ago</span>
        </div>
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <StatusPill status={currentStatus}/>
            <span style={{ fontSize: 11, color: '#7E94AE', fontVariantNumeric: 'tabular-nums' }}>27.4986° N · 82.7404° W</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ConditionTile icon="wind" label="Wind"  value="12" unit="kt"  sub="SSW · gusts 16"/>
            <ConditionTile icon="wave" label="Waves" value="2.1" unit="ft"  sub="period 4s"/>
            <ConditionTile icon="eye"  label="Vis"   value="8"   unit="mi"  sub="haze · clearing"/>
          </div>
        </Card>
      </div>

      {/* Plan trip CTA */}
      <button onClick={onPlan} style={{
        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        height: 60, borderRadius: 16, background: accent, color: '#06151E',
        fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em',
        boxShadow: `0 0 0 1px ${accent}, 0 8px 24px ${accent}33`,
      }}>
        Plan trip to Egmont Key
        <Icon name="arrow" size={20} color="#06151E" sw={2.2}/>
      </button>

      {/* Recent trips */}
      <div>
        <div style={{ fontSize: 13, color: '#F1F5F9', fontWeight: 600, marginBottom: 10 }}>Recent trips</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {RECENT_TRIPS.map((t, i) => (
            <button key={i} onClick={() => onTrip(t)} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
              <Card style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 99, background: '#0F1A26', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="pin" size={16} color={STATUS[t.status].fg} sw={2}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#F1F5F9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.from} → {t.to}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#7E94AE', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {t.date} · {t.dist}
                    </div>
                  </div>
                  <Icon name="chevron" size={16} color="#5B7791" sw={2}/>
                </div>
              </Card>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TRIP DETAIL SCREEN
// ─────────────────────────────────────────────────────────────
function TripScreen({ accent, boat, verdict, pulse, onSave }) {
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [routeProgress, setRouteProgress] = useState(0);
  const [saved, setSaved] = useState(false);

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

  // Hourly timeline data — wind kt
  const hourly = [
    { t: '7a',  wind: 14, wave: 2.4, ok: false },
    { t: '9a',  wind: 12, wave: 2.1, ok: true  },
    { t: '11a', wind: 10, wave: 1.8, ok: true  },
    { t: '1p',  wind:  9, wave: 1.6, ok: true  },
    { t: '3p',  wind: 11, wave: 1.7, ok: true  },
    { t: '5p',  wind: 13, wave: 2.0, ok: true  },
    { t: '7p',  wind: 15, wave: 2.3, ok: false },
  ];

  const sheetH = sheetExpanded ? 540 : 380;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Map fullscreen */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <MarineMap accent={accent} routeProgress={routeProgress}/>
      </div>

      {/* Top fade for legibility */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100,
        background: 'linear-gradient(180deg, rgba(6,21,32,0.7), transparent)', pointerEvents: 'none' }}/>

      {/* Back / route header */}
      <div style={{ position: 'absolute', top: 12, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 10px',
          background: 'rgba(15,26,38,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 99, border: '1px solid #1E2F42' }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, border: `1.5px solid ${accent}`, background: '#06151E' }}/>
          <span style={{ fontSize: 12, color: '#F1F5F9', fontWeight: 600 }}>Anna Maria Is.</span>
          <Icon name="arrow" size={12} color="#7E94AE" sw={2}/>
          <Icon name="pin" size={14} color={accent} sw={2}/>
          <span style={{ fontSize: 12, color: '#F1F5F9', fontWeight: 600 }}>Egmont Key</span>
        </div>
      </div>

      {/* Bottom sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
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
        {/* Drag handle */}
        <button onClick={() => setSheetExpanded(!sheetExpanded)} style={{
          all: 'unset', cursor: 'pointer', padding: '10px 0 4px', display: 'flex', justifyContent: 'center',
        }}>
          <div style={{ width: 40, height: 5, borderRadius: 99, background: '#2A4258' }}/>
        </button>

        <div style={{ padding: '8px 20px 20px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Verdict */}
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
            <div style={{ fontSize: 14.5, color: '#C5D2E0', marginTop: 8, lineHeight: 1.4 }}>
              {copy.line}
            </div>
          </div>

          {/* Best departure */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
            background: '#13202E', border: '1px solid #1E2F42', borderRadius: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}1F`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="clock" size={22} color={accent} sw={2}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Best window</div>
              <div style={{ fontSize: 17, color: '#F1F5F9', fontWeight: 700, marginTop: 2, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
                {verdict === 'go'   && 'Leave 9:15 AM — smoothest ride'}
                {verdict === 'wait' && 'Leave 4:15 PM — waves drop'}
                {verdict === 'nogo' && 'Sunday 8 AM looks clean'}
              </div>
            </div>
          </div>

          {/* Conditions along route */}
          <div>
            <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Conditions along the route
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ConditionTile icon="wind" label="At start" value="12" unit="kt" sub="9:15 AM · SSW"/>
              <ConditionTile icon="wave" label="Mid-trip" value="1.8" unit="ft" sub="9:45 AM · 4s"/>
              <ConditionTile icon="eye"  label="Arrival"  value="8" unit="mi" sub="10:07 AM · clear"/>
            </div>
          </div>

          {/* Hourly timeline */}
          <div>
            <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Hourly wind · {boat.windLim} kt limit
            </div>
            <div style={{ position: 'relative', background: '#0F1A26', borderRadius: 14, border: '1px solid #1B2C40', padding: '16px 12px 10px' }}>
              {/* limit line */}
              <div style={{ position: 'absolute', left: 12, right: 12, top: 16 + (1 - boat.windLim/30) * 60, height: 1, background: `${STATUS.wait.fg}33`, borderTop: `1px dashed ${STATUS.wait.fg}66`, pointerEvents: 'none' }}/>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 60, gap: 4 }}>
                {hourly.map((h, i) => {
                  const hh = (h.wind / 30) * 60;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: '70%', height: hh, borderRadius: 3,
                        background: h.ok ? accent : STATUS.wait.fg,
                        opacity: h.ok ? 1 : 0.7,
                      }}/>
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

          {/* Save trip button */}
          <button onClick={() => { setSaved(true); onSave && onSave(); }} style={{
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
function BoatScreen({ accent, boat, setBoat }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ name: '', length: '', type: 'Center console' });

  // Group unique types for grid
  const grid = [
    { type: 'Center console', label: 'Center console', boat: BOATS[0] },
    { type: 'Bowrider',       label: 'Bowrider',       boat: BOATS[1] },
    { type: 'Pontoon',        label: 'Pontoon',        boat: BOATS[2] },
    { type: 'Sailboat',       label: 'Sailboat',       boat: BOATS[3] },
    { type: 'Jon boat',       label: 'Jon boat',       boat: BOATS[4] },
    { type: 'Jet boat',       label: 'Jet boat',       boat: BOATS[5] },
  ];

  return (
    <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#7E94AE', fontWeight: 600, textTransform: 'uppercase' }}>Profile</div>
        <div style={{ fontSize: 26, color: '#F1F5F9', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>Your boat</div>
      </div>

      {/* Currently-selected boat summary */}
      <Card style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 92, height: 64, background: '#0F1A26', borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <BoatArt type={boat.type} color={accent} size={56}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Currently selected</div>
            <div style={{ fontSize: 17, color: '#F1F5F9', fontWeight: 700, marginTop: 4, letterSpacing: '-0.01em' }}>{boat.year} {boat.name}</div>
            <div style={{ fontSize: 12.5, color: '#7E94AE', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{boat.length} · {boat.type}</div>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: 14, background: '#0F1A26', borderRadius: 12, border: '1px solid #1B2C40' }}>
          <div style={{ fontSize: 11.5, color: '#C5D2E0', lineHeight: 1.5 }}>
            Your boat is rated comfortable up to{' '}
            <span style={{ color: accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{boat.waveLim} ft waves</span> and{' '}
            <span style={{ color: accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{boat.windLim} kt winds</span>. SafeSeas uses these limits to decide your go/no-go.
          </div>
        </div>
      </Card>

      {/* Pick a boat grid */}
      <div>
        <div style={{ fontSize: 13, color: '#F1F5F9', fontWeight: 600, marginBottom: 10 }}>Pick a boat type</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {grid.map(g => {
            const active = boat.type === g.type;
            return (
              <button key={g.type} onClick={() => setBoat(g.boat)} style={{
                all: 'unset', cursor: 'pointer', display: 'block',
                background: active ? `${accent}14` : '#13202E',
                border: `1.5px solid ${active ? accent : '#1E2F42'}`,
                borderRadius: 14, padding: '14px 12px 12px',
                transition: 'all 0.18s ease',
                boxShadow: active ? `0 0 0 4px ${accent}1A` : 'none',
              }}>
                <div style={{ height: 56, display: 'grid', placeItems: 'center' }}>
                  <BoatArt type={g.type} color={active ? accent : '#C5D2E0'} size={50}/>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: '#F1F5F9', fontWeight: 600 }}>{g.label}</span>
                  {active && (
                    <span style={{ width: 18, height: 18, borderRadius: 99, background: accent, display: 'grid', placeItems: 'center' }}>
                      <Icon name="check" size={11} color="#06151E" sw={3}/>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: '#7E94AE', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {g.boat.waveLim} ft · {g.boat.windLim} kt
                </div>
              </button>
            );
          })}
        </div>
      </div>

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
            <div style={{ fontSize: 11.5, color: '#7E94AE', marginTop: 2 }}>Enter length, weight, and type</div>
          </div>
          <Icon name="chevron" size={16} color="#5B7791" sw={2}/>
        </button>
        {customOpen && (
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Boat name"  placeholder="e.g. Reel Time" value={custom.name}   onChange={v => setCustom({...custom, name: v})}/>
            <Field label="Length (ft)" placeholder="22"             value={custom.length} onChange={v => setCustom({...custom, length: v})} numeric/>
            <Field label="Weight (lb)" placeholder="3,200"          value={''} onChange={() => {}} numeric/>
            <div>
              <div style={{ fontSize: 11, color: '#7E94AE', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Type</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Center console','Bowrider','Pontoon','Sailboat','Jon boat','Jet boat'].map(t => (
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
// Tab bar
// ─────────────────────────────────────────────────────────────
function TabBar({ tab, setTab, accent }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'trip', label: 'Trip', icon: 'compass' },
    { id: 'boat', label: 'Boat', icon: 'boat' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: 28, paddingTop: 6,
      background: 'linear-gradient(180deg, rgba(10,20,32,0) 0%, #0A1420 30%)',
      zIndex: 100,
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
// App
// ─────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useState('home');
  const [boat, setBoat] = useState(BOATS[0]);

  // Status pill on Home derives from verdict for consistency
  const homeStatus = t.verdict;

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      background: '#06121C',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 12px',
      fontFamily: '"Inter", -apple-system, "SF Pro Text", system-ui, sans-serif',
    }}>
      <IOSDevice statusBar={<IOSStatusBar dark={true} time="9:14"/>}>
        <div data-screen-label={`SafeSeas — ${tab}`} style={{
          position: 'absolute', inset: 0,
          background: '#0A1420', color: '#F1F5F9',
          overflow: 'hidden',
        }}>
          {/* Scrollable content area (Trip is full-bleed, others scroll) */}
          {tab === 'trip' ? (
            <div style={{ position: 'absolute', inset: 0, paddingBottom: 100 }}>
              <TripScreen accent={t.accent} boat={boat} verdict={t.verdict} pulse={t.pulseVerdict}/>
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, overflow: 'auto', paddingBottom: 110 }}>
              {tab === 'home' && (
                <HomeScreen
                  accent={t.accent} boat={boat} currentStatus={homeStatus}
                  onPlan={() => setTab('trip')}
                  onTrip={() => setTab('trip')}
                  onPickBoat={() => setTab('boat')}
                />
              )}
              {tab === 'boat' && (
                <BoatScreen accent={t.accent} boat={boat} setBoat={setBoat}/>
              )}
            </div>
          )}

          <TabBar tab={tab} setTab={setTab} accent={t.accent}/>
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
          {['home','trip','boat'].map(id => (
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

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
