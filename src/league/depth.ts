import type { League, Player, Pos, TeamState } from '../core/types';
import { POS_LIST } from '../data/positions';

/**
 * Rebuild a team's depth chart. Players are ordered by effective rating;
 * the user's player gets a coach-trust adjustment so performance and
 * trust (not just raw OVR) decide playing time.
 */
export function rebuildDepth(league: League, team: TeamState, userTrust?: number) {
  const byPos: Partial<Record<Pos, Player[]>> = {};
  for (const id of team.roster) {
    const p = league.players[id];
    if (!p) continue;
    (byPos[p.pos] ??= []).push(p);
  }
  const eff = (p: Player) => {
    let v = p.ovr - (p.injury ? 100 : 0);
    if (p.user && userTrust !== undefined) v += (userTrust - 50) * 0.12;
    return v;
  };
  team.depth = {};
  for (const pos of POS_LIST) {
    const arr = (byPos[pos] ?? []).slice().sort((a, b) => eff(b) - eff(a) || a.id.localeCompare(b.id));
    team.depth[pos] = arr.map((p) => p.id);
  }
}

export function depthIndex(team: TeamState, p: Player): number {
  return team.depth[p.pos]?.indexOf(p.id) ?? -1;
}

/** Team strength numbers used by quick simulation and AI. */
export interface TeamRatings {
  ovr: number;
  off: number;
  def: number;
  pass: number;
  run: number;
  passDef: number;
  runDef: number;
  rush: number;
  block: number;
  kick: number;
}

export function teamRatings(league: League, team: TeamState): TeamRatings {
  const top = (pos: Pos, n: number) => {
    const ids = team.depth[pos] ?? [];
    const vals = ids.slice(0, n).map((id) => league.players[id]?.ovr ?? 50);
    while (vals.length < n) vals.push(45);
    return vals.reduce((a, b) => a + b, 0) / n;
  };
  const qb = top('QB', 1), rb = top('RB', 1), wr = top('WR', 3), te = top('TE', 1), ol = top('OL', 5);
  const de = top('DE', 2), dt = top('DT', 2), lb = top('LB', 3), cb = top('CB', 3), s = top('S', 2);
  const k = top('K', 1);
  const pass = qb * 0.5 + wr * 0.3 + te * 0.08 + ol * 0.12;
  const run = rb * 0.45 + ol * 0.4 + te * 0.08 + qb * 0.07;
  const block = ol;
  const rush = de * 0.6 + dt * 0.4;
  const passDef = cb * 0.45 + s * 0.3 + lb * 0.1 + rush * 0.15;
  const runDef = dt * 0.3 + lb * 0.35 + de * 0.2 + s * 0.15;
  const off = pass * 0.6 + run * 0.4;
  const def = passDef * 0.6 + runDef * 0.4;
  const ovr = Math.round(off * 0.5 + def * 0.45 + k * 0.05);
  return { ovr, off, def, pass, run, passDef, runDef, rush, block, kick: k };
}
