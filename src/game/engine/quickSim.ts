// ---------------------------------------------------------------------------
// Statistical play resolution. Used for every snap the user is not on the
// field for, and for all league games the user does not play. It produces the
// same PlayOutcome as the 3D sim so the rules engine and stats stay unified.
// ---------------------------------------------------------------------------
import type { League, Player, Pos, TeamState } from '../../core/types';
import { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import { OFF_PLAYS, ROUTES, type OffPlay, type DefPlay, type OffSlot } from '../../data/playbook';
import { teamRatings, type TeamRatings } from '../../league/depth';
import { depthPlayers, pickReturner } from './lineup';
import { FIELD_W, MID_Y, type GameState } from './rules';
import type { PlayOutcome, StatEvent, Penalty } from './types';

export interface SideCtx {
  team: TeamState;
  r: TeamRatings;
  qb?: Player;
  rbs: Player[];
  wrs: Player[];
  tes: Player[];
  ol: Player[];
  dl: Player[];
  lbs: Player[];
  dbs: Player[];
  k?: Player;
  p?: Player;
  kr?: Player;
  /** Player ids that must not be used this snap (e.g. the user when they sit). */
  exclude?: Set<string>;
}

export function buildSide(league: League, team: TeamState, excludeId?: string): SideCtx {
  const d = (pos: Pos) => depthPlayers(league, team, pos).filter((p) => p.id !== excludeId);
  return {
    team,
    r: teamRatings(league, team),
    qb: d('QB')[0],
    rbs: d('RB').slice(0, 2),
    wrs: d('WR').slice(0, 4),
    tes: d('TE').slice(0, 2),
    ol: d('OL').slice(0, 5),
    dl: [...d('DE').slice(0, 2), ...d('DT').slice(0, 2)],
    lbs: d('LB').slice(0, 3),
    dbs: [...d('CB').slice(0, 3), ...d('S').slice(0, 2)],
    k: d('K')[0],
    p: d('P')[0] ?? d('K')[0],
    kr: pickReturner(league, team, excludeId),
  };
}

const nm = (p?: Player) => (p ? `${p.first[0]}. ${p.last}` : 'Unknown');
const a = (p: Player | undefined, k: keyof Player['attrs'], d = 60) => (p?.attrs[k] ?? d);

function pickWeighted(rng: Rng, players: (Player | undefined)[], weights: number[], exclude?: Set<string>): Player | undefined {
  const ps: Player[] = [];
  const ws: number[] = [];
  players.forEach((p, i) => {
    if (p && !(exclude && exclude.has(p.id))) { ps.push(p); ws.push(weights[i] ?? 1); }
  });
  if (!ps.length) return undefined;
  return rng.weighted(ps, ws);
}

function tackler(rng: Rng, def: SideCtx, kind: 'run' | 'short' | 'deep'): Player | undefined {
  if (kind === 'run') return pickWeighted(rng, [...def.dl, ...def.lbs, ...def.dbs], [1.1, 1.1, 0.9, 0.9, 2.4, 2.2, 1.5, 0.6, 0.6, 0.4, 1.0, 1.2], def.exclude);
  if (kind === 'short') return pickWeighted(rng, [...def.lbs, ...def.dbs, ...def.dl], [1.6, 1.4, 1, 1.8, 1.8, 1.2, 1, 1, 0.3, 0.3, 0.2, 0.2], def.exclude);
  return pickWeighted(rng, def.dbs, [1.6, 1.6, 1, 1.5, 1.3], def.exclude);
}

function maybePenalty(rng: Rng, kind: 'run' | 'pass', airYards: number): Penalty | undefined {
  const r = rng.next();
  if (r < 0.012) return { name: 'False Start', against: 'off', yards: 5, preSnap: true };
  if (r < 0.022) return { name: 'Offside', against: 'def', yards: 5, preSnap: true };
  if (r < 0.042) return { name: 'Offensive Holding', against: 'off', yards: 10 };
  if (r < 0.05) return { name: 'Defensive Holding', against: 'def', yards: 5, autoFirst: true };
  if (kind === 'pass' && airYards > 12 && r < 0.062) return { name: 'Defensive Pass Interference', against: 'def', yards: airYards };
  return undefined;
}

/** Resolve a scrimmage play statistically. */
export function quickScrimmage(rng: Rng, g: GameState, off: SideCtx, def: SideCtx, play: OffPlay, _defPlay: DefPlay | null, opts: { twoPoint?: boolean; noPenalty?: boolean } = {}): PlayOutcome {
  const los = g.ballOn;
  const stats: StatEvent[] = [];
  const add = (p: Player | undefined, key: StatEvent['key'], v = 1, max = false) => { if (p) stats.push({ pid: p.id, key, v, max }); };
  const offR = off.r, defR = def.r;
  const ex = off.exclude;
  const qb = off.qb && !(ex && ex.has(off.qb.id)) ? off.qb : undefined;
  const isBlitz = _defPlay?.tags.includes('blitz') ?? false;
  let endY = clamp(g.hashY + rng.normal(0, 4), 1, FIELD_W - 1);

  if (play.type === 'run') {
    const carrier = play.carrier === 'QB' ? qb : pickWeighted(rng, off.rbs, [3, 1], ex) ?? qb;
    const edge = offR.run - defR.runDef;
    let mean = 3.9 + edge * 0.11;
    if (los > 90) mean -= 1.2;
    if (play.tags.includes('shortyd') && g.toGo <= 2) mean += 0.5;
    if (isBlitz) mean += rng.chance(0.25) ? 4 : -0.8;
    let yds = rng.normal(mean, 3.2);
    if (rng.chance(0.07 + Math.max(0, edge) * 0.004)) yds += Math.abs(rng.normal(0, 14)) + 6;
    if (rng.chance(0.09)) yds = -Math.abs(rng.normal(1.5, 1.5));
    yds = Math.round(yds);
    let endX = los + yds;
    const td = endX >= 100;
    if (td) endX = 100;
    const safety = endX <= 0;
    const fumble = !td && rng.chance(0.009 * (100 - a(carrier, 'car', 70)) / 30);
    const tk = tackler(rng, def, 'run');
    add(carrier, 'rushAtt'); add(carrier, 'rushYds', Math.round(endX - los)); add(carrier, 'rushLong', Math.round(endX - los), true);
    const desc = [`${nm(carrier)} runs for ${Math.round(endX - los)} yard${Math.abs(endX - los) === 1 ? '' : 's'}.`];
    if (td) add(carrier, 'rushTD');
    let holder: 'off' | 'def' = 'off';
    if (fumble) {
      add(carrier, 'fumbles');
      if (rng.chance(0.55)) {
        holder = 'def';
        add(carrier, 'fumblesLost');
        const rec = tackler(rng, def, 'run');
        add(tk, 'ff');
        add(rec, 'fr');
        desc.push(`FUMBLE recovered by ${nm(rec)}!`);
      } else desc.push('Fumble, recovered by the offense.');
    }
    if (!td) { add(tk, 'tackles'); if (endX < los) add(tk, 'tfl'); desc.push(`Tackled by ${nm(tk)}.`); }
    const oob = !td && play.tags.includes('run') && rng.chance(0.12);
    const pen = opts.noPenalty || td ? undefined : maybePenalty(rng, 'run', 0);
    endY = clamp(g.hashY + rng.normal(0, 6), 1, FIELD_W - 1);
    return {
      kind: fumble && holder === 'def' ? 'fumble' : opts.twoPoint ? 'twopt' : 'run',
      endX, holder, td, safety, oob, duration: 4 + Math.min(6, Math.abs(yds) * 0.15), stats, desc: desc.join(' '), endY,
      penalty: pen, bigPlay: yds >= 20 || td,
    };
  }

  // ---------------- Pass ----------------
  const passEdge = offR.pass - defR.passDef;
  const sackP = clamp(0.05 + (defR.rush - offR.block) * 0.003 + (isBlitz ? 0.03 : 0), 0.02, 0.15);
  if (qb && rng.chance(sackP)) {
    const sacker = pickWeighted(rng, [...def.dl, ...def.lbs], [2.5, 2.5, 1.5, 1.5, 1, 1, 0.5], def.exclude);
    const loss = Math.round(clamp(rng.normal(6.5, 2), 1, 13));
    let endX = los - loss;
    const safety = endX <= 0;
    if (safety) endX = 0;
    add(qb, 'sacked'); add(sacker, 'sacks'); add(sacker, 'tackles'); add(sacker, 'tfl');
    const fumble = rng.chance(0.08);
    let holder: 'off' | 'def' = 'off';
    const desc = [`${nm(qb)} sacked by ${nm(sacker)} for a loss of ${loss}.`];
    if (fumble) {
      add(qb, 'fumbles'); add(sacker, 'ff');
      if (rng.chance(0.5)) { holder = 'def'; add(qb, 'fumblesLost'); const rec = pickWeighted(rng, def.dl, [1, 1, 1, 1], def.exclude); add(rec, 'fr'); desc.push(`Strip sack! Recovered by ${nm(rec)}.`); }
    }
    return { kind: holder === 'def' ? 'fumble' : opts.twoPoint ? 'twopt' : 'sack', endX, holder, safety, duration: 5, stats, desc: desc.join(' '), endY: g.hashY };
  }
  // choose target by progression and route depth
  const prog = play.progression.length ? play.progression : (['X', 'Z', 'SL', 'TE1', 'RB'] as OffSlot[]);
  const slotPlayer = (s: OffSlot): Player | undefined => {
    switch (s) {
      case 'X': return off.wrs[0];
      case 'Z': return off.wrs[1];
      case 'SL': return off.wrs[2];
      case 'SL2': return off.wrs[3];
      case 'TE1': return off.tes[0];
      case 'TE2': return off.tes[1];
      case 'RB': return off.rbs[0];
      case 'FB': return off.rbs[1];
      default: return undefined;
    }
  };
  const cands = prog.map(slotPlayer);
  const weights = prog.map((s, i) => {
    const p = cands[i];
    const asg = play.assign[s];
    const depth = asg && (asg.kind === 'route' || asg.kind === 'checkRelease') ? ROUTES[asg.route].depth : 'short';
    return (1.6 - i * 0.22) * ((p?.ovr ?? 50) / 70) ** 2 * (depth === 'deep' ? 0.7 : 1);
  });
  const target = pickWeighted(rng, cands, weights, ex);
  const tIdx = cands.indexOf(target);
  const tSlot = prog[tIdx] ?? 'X';
  const asg = play.assign[tSlot];
  const depth = asg && (asg.kind === 'route' || asg.kind === 'checkRelease') ? ROUTES[asg.route].depth : 'short';
  let air = depth === 'deep' ? rng.range(16, 38) : depth === 'medium' ? rng.range(8, 17) : rng.range(-1, 8);
  if (asg && asg.kind === 'route' && ['screen', 'swing', 'bubble'].includes(asg.route)) air = rng.range(-3, 0);
  air = Math.min(air, 100 - los + 9);
  let cmpP = depth === 'deep' ? 0.36 : depth === 'medium' ? 0.6 : 0.74;
  if (los > 85) cmpP -= 0.1;
  cmpP += passEdge * 0.008 + ((a(qb, depth === 'deep' ? 'dac' : depth === 'medium' ? 'mac' : 'sac') - 75) * 0.004) + ((target?.ovr ?? 70) - 72) * 0.002;
  cmpP = clamp(cmpP, 0.18, 0.9);
  let intP = clamp(0.015 + (depth === 'deep' ? 0.018 : 0) - passEdge * 0.0012 - (a(qb, 'awr') - 75) * 0.0006, 0.006, 0.07);
  add(qb, 'passAtt');
  add(target, 'targets');
  const ballCarrierDef = depth === 'deep' ? 'deep' : 'short';
  if (rng.chance(intP)) {
    const picker = pickWeighted(rng, [...def.dbs, ...def.lbs], [2, 2, 1.2, 1.5, 1.5, 0.6, 0.6, 0.4], def.exclude);
    const catchX = Math.min(109, los + air);
    let ret = Math.round(Math.max(0, rng.normal(6, 10)));
    if (rng.chance(0.05)) ret = 200;
    let endX = catchX - ret;
    const td = endX <= 0;
    if (td) endX = 0;
    add(qb, 'passInt'); add(picker, 'ints'); add(picker, 'intYds', Math.round(Math.min(ret, catchX)));
    if (td) add(picker, 'defTD');
    const touchback = catchX >= 100 && ret < catchX - 100 + 1 && !td;
    return {
      kind: 'interception', endX: touchback ? 100 : endX, holder: 'def', td, touchback, duration: 6, stats,
      desc: `${nm(qb)} pass INTERCEPTED by ${nm(picker)}${td ? ' and returned for a TOUCHDOWN' : ''}!`, endY, bigPlay: true, airYards: Math.round(air),
    };
  }
  if (!rng.chance(cmpP) || !target) {
    const pbu = rng.chance(0.3) ? tackler(rng, def, 'short') : undefined;
    const drop = !pbu && rng.chance(0.12);
    if (pbu) add(pbu, 'pbu');
    if (drop) add(target, 'drops');
    const pen = opts.noPenalty ? undefined : maybePenalty(rng, 'pass', air);
    return {
      kind: opts.twoPoint ? 'twopt' : 'incomplete', endX: los, holder: 'off', stopClock: true, duration: 5, stats,
      desc: `${nm(qb)} pass incomplete${target ? ` intended for ${nm(target)}` : ''}.${pbu ? ` Broken up by ${nm(pbu)}.` : drop ? ' Dropped.' : ''}`,
      endY: g.hashY, penalty: pen && !pen.preSnap ? pen : pen?.preSnap ? pen : undefined, airYards: Math.round(air),
    };
  }
  let yac = Math.max(0, rng.normal(depth === 'deep' ? 2.5 : 3.6, 2.8));
  if (rng.chance(0.045)) yac += Math.abs(rng.normal(0, 15));
  const yds = Math.round(air + yac);
  let endX = los + yds;
  const td = endX >= 100;
  if (td) endX = 100;
  add(qb, 'passCmp'); add(qb, 'passYds', Math.round(endX - los)); add(qb, 'passLong', Math.round(endX - los), true);
  add(target, 'rec'); add(target, 'recYds', Math.round(endX - los)); add(target, 'recLong', Math.round(endX - los), true);
  if (td) { add(qb, 'passTD'); add(target, 'recTD'); }
  const desc = [`${nm(qb)} pass complete to ${nm(target)} for ${Math.round(endX - los)} yards.`];
  let holder: 'off' | 'def' = 'off';
  if (!td) {
    const tk = tackler(rng, def, ballCarrierDef);
    add(tk, 'tackles');
    desc.push(`Tackled by ${nm(tk)}.`);
    if (rng.chance(0.006)) {
      add(target, 'fumbles');
      if (rng.chance(0.5)) { holder = 'def'; add(target, 'fumblesLost'); add(tk, 'ff'); add(tk, 'fr'); desc.push('FUMBLE! Defense recovers.'); }
    }
  }
  const oob = !td && rng.chance(depth === 'short' ? 0.15 : 0.3);
  const pen = opts.noPenalty || td ? undefined : maybePenalty(rng, 'pass', air);
  return {
    kind: holder === 'def' ? 'fumble' : opts.twoPoint ? 'twopt' : 'pass', endX, holder, td, oob, duration: 6 + yac * 0.1, stats,
    desc: desc.join(' '), endY, penalty: pen && pen.against === 'off' && !pen.preSnap ? pen : pen, bigPlay: yds >= 20 || td, airYards: Math.round(air),
  };
}

export function fgChance(kicker: Player | undefined, distYds: number): number {
  const kpw = a(kicker, 'kpw', 70), kac = a(kicker, 'kac', 70);
  const range = 50 + (kpw - 70) * 0.35 + (kac - 70) * 0.12;
  return clamp(1 / (1 + Math.exp((distYds - range) / 4.2)) + 0.05, 0.01, 0.99);
}

export function quickFieldGoal(rng: Rng, g: GameState, off: SideCtx, kind: 'fg' | 'xp'): PlayOutcome {
  const k = off.k;
  const d = Math.round(100 - g.ballOn + 17);
  const good = rng.chance(kind === 'xp' ? Math.min(0.985, fgChance(k, d) + 0.03) : fgChance(k, d));
  const stats: StatEvent[] = [];
  if (k) {
    if (kind === 'fg') { stats.push({ pid: k.id, key: 'fgA', v: 1 }); if (good) { stats.push({ pid: k.id, key: 'fgM', v: 1 }); stats.push({ pid: k.id, key: 'fgLong', v: d, max: true }); } }
    else { stats.push({ pid: k.id, key: 'xpA', v: 1 }); if (good) stats.push({ pid: k.id, key: 'xpM', v: 1 }); }
  }
  return {
    kind, endX: g.ballOn, holder: 'off', good, duration: 5, stats,
    desc: `${nm(k)} ${d}-yard ${kind === 'xp' ? 'extra point' : 'field goal'} is ${good ? 'GOOD' : 'NO GOOD'}.`,
  };
}

export function quickPunt(rng: Rng, g: GameState, off: SideCtx, def: SideCtx): PlayOutcome {
  const p = off.p;
  const gross = Math.round(clamp(rng.normal(45 + (a(p, 'kpw', 70) - 70) * 0.25, 5.5), 25, 70));
  const land = g.ballOn + gross;
  const stats: StatEvent[] = [];
  if (p) { stats.push({ pid: p.id, key: 'punts', v: 1 }); stats.push({ pid: p.id, key: 'puntYds', v: gross }); stats.push({ pid: p.id, key: 'puntLong', v: gross, max: true }); }
  if (land >= 100 && rng.chance(0.7)) {
    return { kind: 'punt', endX: 100, holder: 'def', touchback: true, duration: 6, stats, desc: `${nm(p)} punts ${gross} yards into the end zone. Touchback.` };
  }
  const landX = Math.min(99, land);
  const r = rng.next();
  let endX = landX;
  let desc = `${nm(p)} punts ${gross} yards.`;
  let td = false;
  if (landX >= 90 || r < 0.32) {
    desc += landX >= 90 ? ' Downed inside the 10.' : ` Fair catch by ${nm(def.kr)}.`;
    if (landX >= 80 && p) stats.push({ pid: p.id, key: 'puntIn20', v: 1 });
  } else {
    let ret = Math.round(Math.max(0, rng.normal(8, 7)));
    if (rng.chance(0.012)) ret = 200;
    endX = landX - ret;
    if (endX <= 0) { endX = 0; td = true; }
    if (def.kr) { stats.push({ pid: def.kr.id, key: 'pr', v: 1 }); stats.push({ pid: def.kr.id, key: 'prYds', v: Math.round(landX - endX) }); if (td) stats.push({ pid: def.kr.id, key: 'retTD', v: 1 }); }
    desc += ` ${nm(def.kr)} returns it ${Math.round(landX - endX)} yards${td ? ' for a TOUCHDOWN!' : '.'}`;
    if (!td && endX >= 80 && p) stats.push({ pid: p.id, key: 'puntIn20', v: 1 });
  }
  return { kind: 'punt', endX, holder: 'def', td, duration: 7, stats, desc, endY: MID_Y, bigPlay: td };
}

export function quickKickoff(rng: Rng, g: GameState, off: SideCtx, def: SideCtx): PlayOutcome {
  const k = off.k;
  const stats: StatEvent[] = [];
  const from = g.kickFrom;
  const deep = from + clamp(rng.normal(66 + (a(k, 'kpw', 70) - 70) * 0.2, 4), 45, 78);
  if (deep >= 102 && rng.chance(0.85)) {
    return { kind: 'kickoff', endX: 100, holder: 'def', touchback: true, duration: 0, stats, desc: `${nm(k)} kicks deep. Touchback.` };
  }
  const catchX = Math.min(deep, 104);
  let ret = Math.round(clamp(rng.normal(25, 7), 8, 60));
  if (rng.chance(0.006)) ret = 200;
  let endX = catchX - ret;
  let td = false;
  if (endX <= 0) { endX = 0; td = true; }
  const r = def.kr;
  if (r) { stats.push({ pid: r.id, key: 'kr', v: 1 }); stats.push({ pid: r.id, key: 'krYds', v: Math.round(catchX - endX) }); if (td) stats.push({ pid: r.id, key: 'retTD', v: 1 }); }
  return {
    kind: 'kickoff', endX, holder: 'def', td, duration: 6, stats,
    desc: `${nm(k)} kicks off. ${nm(r)} returns it ${Math.round(catchX - endX)} yards${td ? ' for a TOUCHDOWN!' : '.'}`, endY: MID_Y, bigPlay: td,
  };
}

export const ALL_RUNS = OFF_PLAYS.filter((p) => p.type === 'run');
