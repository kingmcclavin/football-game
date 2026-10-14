import React, { type ReactNode } from 'react';
import type { Appearance, Player, Pos, Role, StatLine } from '../../core/types';
import { TEAMS } from '../../data/teams';
import { FORMATIONS, ROUTES, type OffPlay, type DefPlay, DEF_FORMATIONS } from '../../data/playbook';
import { emblemPath } from '../../game/render/textures';
import { SKIN_TONES, HAIR_COLORS } from '../../game/render/playerModel';
import { store } from '../store';

export function TeamLogo({ id, size = 40 }: { id: number; size?: number }) {
  const t = TEAMS[id];
  if (!t) return <div style={{ width: size, height: size }} />;
  const glyphSize = t.emblem.glyph.length > 1 ? 36 : 50;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={`${t.city} ${t.name}`} style={{ flexShrink: 0 }}>
      <path d={emblemPath(t.emblem.shape)} fill={t.primary} stroke={t.secondary} strokeWidth={6} />
      <text x="50" y={t.emblem.shape === 'star' ? 60 : 58} textAnchor="middle" fontFamily="Barlow Condensed, Arial Black, Impact, sans-serif" fontWeight={800} fontSize={glyphSize} fill={t.accent === t.primary ? '#fff' : t.accent}>{t.emblem.glyph}</text>
    </svg>
  );
}

/** Stylized 2D portrait drawn from the player's appearance (used in menus). */
export function Portrait({ app, teamId, num, size = 96, helmet = true }: { app?: Appearance; teamId: number; num?: number; size?: number; helmet?: boolean }) {
  const t = TEAMS[teamId] ?? TEAMS[0];
  const skin = SKIN_TONES[app?.skin ?? 3];
  const hair = HAIR_COLORS[app?.hairColor ?? 0];
  return (
    <div className="portrait" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <rect x="18" y="70" width="64" height="40" rx="14" fill={teamId >= 0 ? t.primary : '#2a3550'} />
        <rect x="10" y="72" width="80" height="12" rx="6" fill={teamId >= 0 ? t.primary : '#2a3550'} stroke={t.secondary} strokeWidth="2" />
        <text x="50" y="98" textAnchor="middle" fontFamily="Barlow Condensed, Arial Black" fontWeight={800} fontSize="16" fill="#fff">{num ?? ''}</text>
        <rect x="43" y="58" width="14" height="14" fill={skin} />
        <ellipse cx="50" cy="44" rx="17" ry="20" fill={skin} />
        {!helmet && app && app.hair === 1 && <path d="M33 40 Q35 22 50 22 Q65 22 67 40 Q60 30 50 30 Q40 30 33 40Z" fill={hair} />}
        {!helmet && app && app.hair === 2 && <path d="M34 38 Q36 25 50 25 Q64 25 66 38 Q58 31 50 31 Q42 31 34 38Z" fill={hair} opacity="0.8" />}
        {!helmet && app && app.hair === 3 && <circle cx="50" cy="30" r="22" fill={hair} />}
        {!helmet && app && app.hair === 4 && <path d="M32 44 Q32 20 50 20 Q68 20 68 44 L70 66 L64 50 L60 66 L56 48 L50 64 L44 48 L40 66 L36 50 L30 66Z" fill={hair} />}
        {!helmet && app && app.hair === 5 && <rect x="46" y="16" width="8" height="18" rx="3" fill={hair} />}
        {!helmet && <ellipse cx="50" cy="44" rx="17" ry="20" fill={skin} opacity={app && app.hair === 3 ? 1 : 0} />}
        <circle cx="43" cy="44" r="2.2" fill="#111" />
        <circle cx="57" cy="44" r="2.2" fill="#111" />
        {app?.accessories.eyeBlack && <><rect x="39" y="48" width="8" height="2.5" fill="#111" /><rect x="53" y="48" width="8" height="2.5" fill="#111" /></>}
        {app && app.facialHair === 3 && <path d="M34 50 Q50 72 66 50 L66 56 Q50 74 34 56Z" fill={hair} />}
        {app && app.facialHair === 2 && <rect x="46" y="56" width="8" height="8" rx="3" fill={hair} />}
        {app && app.facialHair === 4 && <rect x="43" y="52" width="14" height="2.5" rx="1" fill={hair} />}
        {app && app.facialHair === 1 && <path d="M36 52 Q50 68 64 52 Q50 64 36 52Z" fill={hair} opacity="0.4" />}
        <path d="M44 56 Q50 59 56 56" stroke="#5a2a1a" strokeWidth="1.5" fill="none" />
        {helmet && (
          <g>
            <path d="M28 46 Q28 18 50 18 Q73 18 74 44 L74 54 L66 54 L64 44 Q50 38 36 44 L34 56 L28 56Z" fill={TEAMS[teamId] ? (t.primary === '#FFFFFF' ? t.secondary : t.primary) : '#3a4560'} />
            <rect x="48" y="18" width="4" height="22" fill={t.secondary} />
            <path d="M34 50 L66 50 M36 56 L64 56 M40 62 L60 62 M50 48 L50 64" stroke="#ddd" strokeWidth="2.2" fill="none" />
            {app && app.visor > 0 && <rect x="36" y="39" width="28" height="8" rx="3" fill={['', '#cfe8ff', '#1b1f24', '#d9a521', '#2f6fd6'][app.visor]} opacity={app.visor === 1 ? 0.4 : 0.9} />}
          </g>
        )}
      </svg>
    </div>
  );
}

export function Bar({ value, max = 100, green }: { value: number; max?: number; green?: boolean }) {
  return (
    <div className={`bar ${green ? 'green' : ''}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function Picker({ value, onPrev, onNext, label }: { value: ReactNode; onPrev: () => void; onNext: () => void; label?: string }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      {label && <span className="small muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>}
      <div className="picker">
        <button onClick={onPrev} aria-label="previous">{'‹'}</button>
        <div className="val">{value}</div>
        <button onClick={onNext} aria-label="next">{'›'}</button>
      </div>
    </div>
  );
}

export function TopBar({ title, sub, back = 'hub', right }: { title: string; sub?: string; back?: string | null; right?: ReactNode }) {
  return (
    <div className="topbar">
      <div className="row">
        {back && <button className="back" onClick={() => store.go(back as never)}>{'←'}</button>}
        <div>
          <h2>{title}</h2>
          {sub && <div className="small muted">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export const ROLE_NAMES: Record<Role, string> = { ST: 'Starter', RT: 'Rotation', BK: 'Backup', PS: 'Practice Squad' };
export function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge ${role}`}>{ROLE_NAMES[role]}</span>;
}

export const playerName = (p?: Player) => (p ? `${p.first} ${p.last}` : '—');

/** Which stat columns to show for a position. */
export function statColumns(pos: Pos): { key: keyof StatLine | 'cmp%' | 'ypc' | 'ypr' | 'fg%' | 'avg'; label: string }[] {
  switch (pos) {
    case 'QB': return [{ key: 'gp', label: 'GP' }, { key: 'passCmp', label: 'CMP' }, { key: 'passAtt', label: 'ATT' }, { key: 'cmp%', label: 'PCT' }, { key: 'passYds', label: 'YDS' }, { key: 'passTD', label: 'TD' }, { key: 'passInt', label: 'INT' }, { key: 'sacked', label: 'SK' }, { key: 'rushYds', label: 'RYDS' }, { key: 'rushTD', label: 'RTD' }];
    case 'RB': return [{ key: 'gp', label: 'GP' }, { key: 'rushAtt', label: 'ATT' }, { key: 'rushYds', label: 'YDS' }, { key: 'ypc', label: 'AVG' }, { key: 'rushTD', label: 'TD' }, { key: 'rec', label: 'REC' }, { key: 'recYds', label: 'RYDS' }, { key: 'recTD', label: 'RTD' }, { key: 'fumbles', label: 'FUM' }];
    case 'WR': case 'TE': return [{ key: 'gp', label: 'GP' }, { key: 'targets', label: 'TGT' }, { key: 'rec', label: 'REC' }, { key: 'recYds', label: 'YDS' }, { key: 'ypr', label: 'AVG' }, { key: 'recTD', label: 'TD' }, { key: 'recLong', label: 'LNG' }, { key: 'drops', label: 'DRP' }, { key: 'krYds', label: 'KR YDS' }];
    case 'OL': return [{ key: 'gp', label: 'GP' }, { key: 'gs', label: 'GS' }, { key: 'pancakes', label: 'PANC' }, { key: 'sacksAllowed', label: 'SK ALW' }];
    case 'K': return [{ key: 'gp', label: 'GP' }, { key: 'fgM', label: 'FGM' }, { key: 'fgA', label: 'FGA' }, { key: 'fg%', label: 'PCT' }, { key: 'fgLong', label: 'LNG' }, { key: 'xpM', label: 'XPM' }, { key: 'xpA', label: 'XPA' }];
    case 'P': return [{ key: 'gp', label: 'GP' }, { key: 'punts', label: 'PUNTS' }, { key: 'puntYds', label: 'YDS' }, { key: 'avg', label: 'AVG' }, { key: 'puntLong', label: 'LNG' }, { key: 'puntIn20', label: 'IN20' }];
    default: return [{ key: 'gp', label: 'GP' }, { key: 'tackles', label: 'TKL' }, { key: 'tfl', label: 'TFL' }, { key: 'sacks', label: 'SACK' }, { key: 'ints', label: 'INT' }, { key: 'pbu', label: 'PD' }, { key: 'ff', label: 'FF' }, { key: 'fr', label: 'FR' }, { key: 'defTD', label: 'TD' }];
  }
}

export function statVal(l: StatLine, key: string): string {
  const v = (k: keyof StatLine) => (l[k] as number | undefined) ?? 0;
  switch (key) {
    case 'cmp%': return v('passAtt') ? ((v('passCmp') / v('passAtt')) * 100).toFixed(1) : '0.0';
    case 'ypc': return v('rushAtt') ? (v('rushYds') / v('rushAtt')).toFixed(1) : '0.0';
    case 'ypr': return v('rec') ? (v('recYds') / v('rec')).toFixed(1) : '0.0';
    case 'fg%': return v('fgA') ? ((v('fgM') / v('fgA')) * 100).toFixed(1) : '0.0';
    case 'avg': return v('punts') ? (v('puntYds') / v('punts')).toFixed(1) : '0.0';
    default: return String(Math.round(v(key as keyof StatLine)));
  }
}

/** One-line summary of a stat line for a position. */
export function statSummary(pos: Pos, l: StatLine): string {
  const v = (k: keyof StatLine) => (l[k] as number | undefined) ?? 0;
  switch (pos) {
    case 'QB': return `${v('passCmp')}/${v('passAtt')}, ${v('passYds')} yds, ${v('passTD')} TD, ${v('passInt')} INT${v('rushYds') ? `, ${v('rushYds')} rush` : ''}`;
    case 'RB': return `${v('rushAtt')} car, ${v('rushYds')} yds, ${v('rushTD')} TD${v('rec') ? `, ${v('rec')} rec ${v('recYds')} yds` : ''}`;
    case 'WR': case 'TE': return `${v('rec')} rec, ${v('recYds')} yds, ${v('recTD')} TD${v('drops') ? `, ${v('drops')} drops` : ''}${v('kr') ? `, ${v('krYds')} KR yds` : ''}`;
    case 'OL': return `${v('pancakes')} pancakes, ${v('sacksAllowed')} sacks allowed`;
    case 'K': return `FG ${v('fgM')}/${v('fgA')}, long ${v('fgLong')}, XP ${v('xpM')}/${v('xpA')}`;
    case 'P': return `${v('punts')} punts, ${v('punts') ? (v('puntYds') / v('punts')).toFixed(1) : 0} avg, ${v('puntIn20')} inside 20`;
    default: return `${v('tackles')} tkl, ${v('tfl')} TFL, ${v('sacks')} sacks, ${v('ints')} INT, ${v('pbu')} PD`;
  }
}

/** SVG play diagram (offense going up). */
export function PlayDiagram({ play, def, highlight }: { play?: OffPlay; def?: DefPlay; highlight?: string }) {
  const W = 120, H = 90;
  const sx = (dy: number) => W / 2 - dy * 3.2;
  const sy = (dx: number) => H - 22 - dx * 2.4;
  if (play) {
    const f = FORMATIONS[play.formation];
    return (
      <svg viewBox={`0 0 ${W} ${H}`}>
        <line x1="0" x2={W} y1={sy(0)} y2={sy(0)} stroke="#cfe0ff" strokeWidth="0.8" opacity="0.6" />
        {f.spots.map((s) => {
          const x = sx(s.dy), y = sy(s.dx);
          const asg = play.assign[s.slot];
          let path = '';
          let color = '#ffffff';
          if (asg && (asg.kind === 'route' || asg.kind === 'checkRelease')) {
            const side = asg.side ?? (s.dy >= 0 ? 1 : -1);
            path = `M${x},${y} ` + ROUTES[asg.route].pts.map(([fw, o]) => `L${sx(s.dy + o * side)},${sy(s.dx + fw)}`).join(' ');
            color = s.slot === highlight ? '#ffd23f' : '#ffeb9c';
          } else if (asg && asg.kind === 'run') {
            path = `M${x},${y} L${sx(asg.hole)},${sy(1.5)} L${sx(asg.hole)},${sy(7)}`;
            color = '#ff8a5c';
          } else if (asg && asg.kind === 'fake') {
            path = `M${x},${y} L${sx(asg.hole * 0.6)},${sy(-1)}`;
            color = '#9fb7ff';
          } else if (asg && asg.kind === 'lead') {
            path = `M${x},${y} L${sx((asg.side ?? 0) * 2)},${sy(3)}`;
            color = '#9fb7ff';
          }
          return (
            <g key={s.slot}>
              {path && <path d={path} stroke={color} strokeWidth={s.slot === highlight ? 2.2 : 1.4} fill="none" strokeLinejoin="round" markerEnd="" />}
              <circle cx={x} cy={y} r={s.slot === highlight ? 3.4 : 2.6} fill={s.slot === highlight ? '#ffd23f' : ['LT', 'LG', 'C', 'RG', 'RT'].includes(s.slot) ? '#d6dbe6' : '#fff'} stroke="#0b1220" strokeWidth="0.8" />
            </g>
          );
        })}
      </svg>
    );
  }
  if (def) {
    const f = DEF_FORMATIONS[def.formation];
    const pos: Record<string, [number, number]> = { LE: [3.5, 1], LDT: [1, 1], RDT: [-1, 1], RE: [-3.5, 1], WLB: [-4, 5], MLB: [0, 5.5], SLB: [4, 5], LB4: [2, 4], CB1: [13, 6], CB2: [-13, 6], NCB: [7, 5], DCB: [-7, 5], FS: [5, 13], SS: [-5, 12] };
    return (
      <svg viewBox={`0 0 ${W} ${H}`}>
        <line x1="0" x2={W} y1={sy(-6)} y2={sy(-6)} stroke="#cfe0ff" strokeWidth="0.8" opacity="0.6" />
        {f.slots.map((s) => {
          const [dy, dx] = pos[s] ?? [0, 5];
          const blitz = def.blitz.includes(s);
          const x = sx(dy), y = sy(dx - 6) + 0;
          return (
            <g key={s}>
              {blitz && <path d={`M${x},${y} L${sx(dy * 0.3)},${sy(-7.5)}`} stroke="#ff5a5a" strokeWidth="1.5" />}
              <text x={x} y={y + 3} textAnchor="middle" fontSize="9" fontWeight="800" fill={s === highlight ? '#ffd23f' : blitz ? '#ff8a8a' : '#fff'}>{'✕'}</text>
            </g>
          );
        })}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="8" fill="#e8eefc" fontWeight="700">{def.coverage.toUpperCase().replace('C', 'COVER ').replace('M', ' MAN')}</text>
      </svg>
    );
  }
  return null;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export function useForceUpdate() {
  const [, set] = React.useState(0);
  return () => set((x) => x + 1);
}
