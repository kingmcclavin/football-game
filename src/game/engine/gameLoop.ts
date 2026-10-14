// Drives a full game using the rules engine + AI coaches + quick sim.
import type { League } from '../../core/types';
import { Rng } from '../../core/rng';
import { OFF_PLAYS, type DefPlay, type OffPlay } from '../../data/playbook';
import { chooseOffense, goForTwo, offTags, pickDefPlay, pickOffPlay, wantsTimeout, type OffDecision } from './coachAI';
import { buildSide, quickFieldGoal, quickKickoff, quickPunt, quickScrimmage, type SideCtx } from './quickSim';
import { applyOutcome, applyRunoff, callTimeout, checkQuarterEnd, newGame, updateOtSudden, type GameState } from './rules';
import type { PlayOutcome } from './types';

export type NextStep =
  | { kind: 'kickoff' }
  | { kind: 'xp' }
  | { kind: 'twopt'; play: OffPlay; defPlay: DefPlay }
  | { kind: 'fg' }
  | { kind: 'punt' }
  | { kind: 'kneel' }
  | { kind: 'spike' }
  | { kind: 'play'; play: OffPlay; defPlay: DefPlay };

/** Ask the AI coaches what happens next. */
export function aiNextStep(rng: Rng, g: GameState, sides: [SideCtx, SideCtx]): NextStep {
  const off = sides[g.poss];
  const def = sides[1 - g.poss];
  if (g.phase === 'kickoff') return { kind: 'kickoff' };
  if (g.phase === 'pat') {
    if (goForTwo(g)) {
      const pool = OFF_PLAYS.filter((p) => p.tags.includes('goal') || p.id === 'gun_slants');
      return { kind: 'twopt', play: rng.pick(pool), defPlay: pickDefPlay(rng, g, def) };
    }
    return { kind: 'xp' };
  }
  const d: OffDecision = chooseOffense(rng, g, off);
  if (d.kind === 'play') return { kind: 'play', play: d.play, defPlay: pickDefPlay(rng, g, def) };
  return d;
}

/** Quick-resolve a step. */
export function quickResolve(rng: Rng, g: GameState, sides: [SideCtx, SideCtx], step: NextStep): PlayOutcome {
  const off = sides[g.poss];
  const def = sides[1 - g.poss];
  switch (step.kind) {
    case 'kickoff': return quickKickoff(rng, g, off, def);
    case 'xp': return quickFieldGoal(rng, g, off, 'xp');
    case 'fg': return quickFieldGoal(rng, g, off, 'fg');
    case 'punt': return quickPunt(rng, g, off, def);
    case 'kneel': return { kind: 'kneel', endX: g.ballOn - 1, holder: 'off', duration: 2, stats: off.qb ? [{ pid: off.qb.id, key: 'rushAtt', v: 1 }, { pid: off.qb.id, key: 'rushYds', v: -1 }] : [], desc: 'QB kneels down.' };
    case 'spike': return { kind: 'spike', endX: g.ballOn, holder: 'off', duration: 1, stopClock: true, stats: off.qb ? [{ pid: off.qb.id, key: 'passAtt', v: 1 }] : [], desc: 'QB spikes the ball to stop the clock.' };
    case 'twopt': return quickScrimmage(rng, g, off, def, step.play, step.defPlay, { twoPoint: true, noPenalty: true });
    case 'play': return quickScrimmage(rng, g, off, def, step.play, step.defPlay);
  }
}

/** Pre-snap bookkeeping: timeouts and clock runoff. */
export function preSnap(g: GameState, step: NextStep) {
  if (step.kind === 'kickoff' || step.kind === 'xp' || step.kind === 'twopt') return;
  for (const side of [0, 1] as const) if (wantsTimeout(g, side)) callTimeout(g, side);
  const hurry = !!offTags(g).hurry;
  applyRunoff(g, hurry);
}

export function simulateGame(league: League, home: number, away: number, opts: { seed: number; quarterMinutes?: number; playoff?: boolean }): GameState {
  const rng = new Rng(opts.seed);
  const g = newGame(home, away, opts.quarterMinutes ?? 15, !!opts.playoff, rng.chance(0.5) ? 0 : 1);
  const sides: [SideCtx, SideCtx] = [buildSide(league, league.teams[home]), buildSide(league, league.teams[away])];
  let guard = 0;
  while (!g.over && guard++ < 600) {
    const step = aiNextStep(rng, g, sides);
    preSnap(g, step);
    if (g.clock <= 0 && g.phase === 'play') {
      // clock ran out during the runoff
      forceQuarterEnd(g);
      continue;
    }
    const o = quickResolve(rng, g, sides, step);
    applyOutcome(g, o);
    updateOtSudden(g);
  }
  if (!g.over) { g.over = true; g.phase = 'final'; }
  return g;
}

/** When the clock hits zero between plays, end the quarter. */
export function forceQuarterEnd(g: GameState) {
  checkQuarterEnd(g);
}

export { pickOffPlay, pickDefPlay };
