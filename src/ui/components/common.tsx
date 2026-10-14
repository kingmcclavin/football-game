import React, { type ReactNode } from 'react';
import type { Appearance, Player, Pos, Role, StatLine } from '../../core/types';
import { TEAMS } from '../../data/teams';
import { FORMATIONS, ROUTES, type OffPlay, type DefPlay, DEF_FORMATIONS } from '../../data/playbook';
import { logoDataUrl, portraitDataUrl } from '../../game/pixel/sprites';
import { store } from '../store';

export function TeamLogo({ id, size = 40 }: { id: number; size?: number }) {
  const t = TEAMS[id];
  if (!t) return <div style={{ width: size, height: size }} />;
  return <img className="pix" src={logoDataUrl(id)} width={size} height={size} alt={`${t.city} ${t.name}`} style={{ flexShrink: 0 }} />;
}

/** Pixel portrait drawn from the player's appearance (used in menus). */
export function Portrait({ app, teamId, num, size = 96, helmet = true }: { app?: Appearance; teamId: number; num?: number; size?: number; helmet?: boolean }) {
  return (
    <div className="portrait" style={{ width: size, height: size }}>
      <img className="pix" src={portraitDataUrl(app, teamId, num, helmet)} width={size} height={size} alt="" />
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
