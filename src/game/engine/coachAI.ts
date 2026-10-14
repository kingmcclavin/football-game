// AI play calling: situation-aware offensive and defensive decisions.
import { Rng } from '../../core/rng';
import { TEAMS } from '../../data/teams';
import { DEF_PLAYS, OFF_PLAYS, type DefPlay, type OffPlay } from '../../data/playbook';
import { fgChance, type SideCtx } from './quickSim';
import { type GameState, possTeam } from './rules';

export type OffDecision =
  | { kind: 'play'; play: OffPlay }
  | { kind: 'punt' }
  | { kind: 'fg' }
  | { kind: 'kneel' }
  | { kind: 'spike' };

const remainingGame = (g: GameState) => (g.quarter >= 4 ? g.clock : (4 - g.quarter) * g.quarterLen + g.clock);

export function scoreDiff(g: GameState): number {
  return g.score[g.poss] - g.score[1 - g.poss];
}

/** Should the offense go for it on 4th down? */
export function goForIt(g: GameState, kickerChance: number): boolean {
  const diff = scoreDiff(g);
  const late = g.quarter >= 4 && g.clock < 360;
  const desperate = late && diff < 0 && (diff < -8 || g.clock < 150);
  if (desperate) return true;
  if (g.toGo <= 1 && g.ballOn >= 45 && g.ballOn <= 95) return true;
  if (g.toGo <= 2 && g.ballOn >= 60 && kickerChance < 0.6) return true;
  if (g.toGo <= 3 && g.ballOn >= 55 && g.ballOn < 62) return true;
  return false;
}

export function chooseOffense(rng: Rng, g: GameState, side: SideCtx): OffDecision {
  const diff = scoreDiff(g);
  const left = remainingGame(g);
  // Victory formation
  if (g.quarter >= 4 && diff > 0 && g.clockRunning && left <= 40 * (5 - g.down) && g.phase === 'play') return { kind: 'kneel' };
  if (g.quarter === 2 && g.clock < 30 && g.ballOn < 50 && diff >= 0 && g.clockRunning) return { kind: 'kneel' };
  // Spike to stop the clock in a hurry
  if (g.clockRunning && ((g.quarter === 2 || g.quarter >= 4) && g.clock < 25 && g.clock > 3 && (g.quarter === 2 || diff <= 0)) && g.down < 4 && g.ballOn > 50) {
    if (rng.chance(0.6)) return { kind: 'spike' };
  }
  const fgDist = 100 - g.ballOn + 17;
  const kc = fgChance(side.k, fgDist);
  // Last-second field goal
  if ((g.quarter === 2 || g.quarter >= 4) && g.clock <= 8 && kc > 0.25 && (g.quarter === 2 || (diff >= -3 && diff <= 0))) return { kind: 'fg' };
  if (g.down === 4) {
    if (!goForIt(g, kc)) {
      if (kc >= 0.45 && fgDist <= 60) return { kind: 'fg' };
      if (g.ballOn >= 62 && kc < 0.45 && g.toGo <= 4) {/* go for it */} else return { kind: 'punt' };
    }
  }
  return { kind: 'play', play: pickOffPlay(rng, g, side) };
}

export function offTags(g: GameState): { want: 'run' | 'pass'; depth?: 'short' | 'medium' | 'deep'; goal?: boolean; hurry?: boolean } {
  const diff = scoreDiff(g);
  const late = g.quarter >= 4 && g.clock < 300;
  const hurry = (g.quarter === 2 && g.clock < 120) || (late && diff < 0);
  const goal = g.ballOn >= 96;
  if (goal && g.toGo <= 3) return { want: Math.random() < 0.6 ? 'run' : 'pass', goal: true };
  if (hurry) return { want: 'pass', depth: diff < -8 ? 'deep' : g.toGo > 8 ? 'medium' : 'short', hurry };
  if (late && diff > 0) return { want: 'run' };
  if (g.toGo <= 2) return { want: 'run' };
  if (g.down >= 3 && g.toGo >= 7) return { want: 'pass', depth: g.toGo >= 12 ? 'deep' : 'medium' };
  if (g.down >= 3) return { want: 'pass', depth: 'short' };
  return { want: 'run' };
}

export function pickOffPlay(rng: Rng, g: GameState, side: SideCtx): OffPlay {
  const t = offTags(g);
  const ident = TEAMS[side.team.id].offense;
  const runBias = ident === 'Power Run' ? 0.12 : ident === 'Air Raid' ? -0.15 : ident === 'Spread' ? -0.08 : ident === 'Option' ? 0.08 : 0;
  let want = t.want;
  if (!t.goal && !t.hurry && g.down < 3 && g.toGo > 2) want = rng.chance(0.47 + runBias) ? 'run' : 'pass';
  if (g.ballOn >= 98) want = rng.chance(0.55) ? 'run' : 'pass';
  let pool = OFF_PLAYS.filter((p) => p.type === want && !p.tags.includes('special'));
  if (t.goal) pool = pool.filter((p) => p.tags.includes('goal') || p.tags.includes('shortyd') || p.tags.includes('short'));
  else pool = pool.filter((p) => p.formation !== 'goalline' || g.toGo <= 1);
  if (want === 'pass' && t.depth) {
    const f = pool.filter((p) => p.tags.includes(t.depth!));
    if (f.length) pool = f;
  }
  if (want === 'run' && g.toGo <= 2) {
    const f = pool.filter((p) => p.tags.includes('shortyd'));
    if (f.length && rng.chance(0.7)) pool = f;
  }
  if (t.hurry) {
    const f = pool.filter((p) => p.tags.includes('hurry'));
    if (f.length && rng.chance(0.6)) pool = f;
  }
  // QB runs only for mobile quarterbacks
  if ((side.qb?.attrs.spd ?? 60) < 78) pool = pool.filter((p) => !p.tags.includes('qbrun'));
  if (!pool.length) pool = OFF_PLAYS.filter((p) => p.type === 'pass' && !p.tags.includes('special'));
  // Hail Mary at the end of a half from long range
  if ((g.quarter === 2 || g.quarter >= 4) && g.clock < 10 && g.ballOn > 45 && g.ballOn < 70 && scoreDiff(g) < 0) {
    return OFF_PLAYS.find((p) => p.id === 'e_hail')!;
  }
  return rng.pick(pool);
}

export function pickDefPlay(rng: Rng, g: GameState, side: SideCtx): DefPlay {
  const ident = TEAMS[side.team.id].defense;
  const blitzRate = ident === 'Man Blitz' ? 0.32 : ident === '3-4 Pressure' ? 0.28 : ident === 'Cover 2' ? 0.12 : 0.18;
  const diff = g.score[1 - g.poss] - g.score[g.poss]; // defense's lead
  let pool: DefPlay[];
  if (g.ballOn >= 95) pool = DEF_PLAYS.filter((d) => d.tags.includes('goal'));
  else if (g.quarter >= 4 && g.clock < 120 && diff > 0 && diff <= 8 && g.ballOn < 70) pool = DEF_PLAYS.filter((d) => d.tags.includes('prevent') || d.id === 'n_c4');
  else if (g.toGo <= 2) pool = DEF_PLAYS.filter((d) => d.tags.includes('run') && !d.tags.includes('goal'));
  else if (g.down >= 3 && g.toGo >= 7) pool = DEF_PLAYS.filter((d) => d.formation === 'nickel' || d.formation === 'dime');
  else pool = DEF_PLAYS.filter((d) => d.formation === 'base' || d.formation === 'nickel');
  const blitz = pool.filter((d) => d.tags.includes('blitz'));
  const safe = pool.filter((d) => !d.tags.includes('blitz'));
  if (blitz.length && safe.length) pool = rng.chance(blitzRate) ? blitz : safe;
  if (!pool.length) pool = DEF_PLAYS;
  return rng.pick(pool);
}

/** Decide whether to attempt a 2-point conversion after a touchdown. */
export function goForTwo(g: GameState): boolean {
  const diff = scoreDiff(g); // after the TD
  if (g.quarter < 4) return false;
  return [-2, -5, -9, -10, -12, 1, -16].includes(diff) && g.clock < 600;
}

/** Defensive timeout logic: stop the clock late when trailing. */
export function wantsTimeout(g: GameState, side: 0 | 1): boolean {
  if (!g.clockRunning || g.timeouts[side] <= 0) return false;
  const isOff = g.poss === side;
  const lead = g.score[side] - g.score[1 - side];
  if (g.quarter === 2 && g.clock < 60 && isOff && g.ballOn > 40) return true;
  if (g.quarter >= 4 && g.clock < 130 && lead <= 0 && lead >= -16) return true;
  return false;
}

export { possTeam };
