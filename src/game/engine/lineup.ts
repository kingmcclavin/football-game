import type { League, Player, Pos, TeamState } from '../../core/types';
import {
  DEF_FORMATIONS, DEF_SLOT_DEPTH, DEF_SLOT_POS, FORMATIONS, OFF_SLOT_DEPTH, OFF_SLOT_POS,
  type DefPlay, type DefSlot, type OffPlay, type OffSlot,
} from '../../data/playbook';
import type { SimPlayer } from './PlaySim';
import type { Mods } from './mods';

export interface UserOnField {
  pid: string;
  mods: Mods;
  olSlot?: 'OT' | 'OG';
}

export function toSim(p: Player, user?: UserOnField): SimPlayer {
  const isUser = !!user && user.pid === p.id;
  return {
    pid: p.id,
    name: `${p.first[0]}. ${p.last}`,
    num: p.num,
    pos: p.pos,
    attrs: p.attrs,
    ht: p.ht,
    wt: p.wt,
    user: isUser,
    mods: isUser ? user!.mods : undefined,
  };
}

/** Players at a position on a team's depth chart (healthy first). */
export function depthPlayers(league: League, team: TeamState, pos: Pos): Player[] {
  return (team.depth[pos] ?? []).map((id) => league.players[id]).filter((p) => p && !p.injury);
}

function fillFrom(league: League, team: TeamState, pos: Pos, idx: number, used: Set<string>): Player | undefined {
  const list = depthPlayers(league, team, pos);
  const pick = list[idx] && !used.has(list[idx].id) ? list[idx] : list.find((p) => !used.has(p.id));
  if (pick) return pick;
  // emergency fallback: any unused player from a related position
  const alt: Partial<Record<Pos, Pos[]>> = { RB: ['WR'], TE: ['OL', 'WR'], WR: ['RB', 'TE', 'CB'], CB: ['S'], S: ['CB', 'LB'], LB: ['S', 'DE'], DE: ['DT', 'LB'], DT: ['DE'], OL: ['DT', 'TE'] };
  for (const a of alt[pos] ?? []) {
    const p = depthPlayers(league, team, a).find((q) => !used.has(q.id));
    if (p) return p;
  }
  return undefined;
}

/**
 * Build the 11 offensive players for a play. `userIn` forces the user's
 * player onto the field at their natural slot (or keeps them off).
 */
export function offenseLineup(league: League, team: TeamState, play: OffPlay, user?: UserOnField, userIn = true): Partial<Record<OffSlot, SimPlayer>> {
  const form = FORMATIONS[play.formation];
  const used = new Set<string>();
  const userP = user ? league.players[user.pid] : undefined;
  const userOnTeam = userP && userP.teamId === team.id;
  if (userOnTeam && !userIn) used.add(userP!.id);
  const out: Partial<Record<OffSlot, SimPlayer>> = {};
  // decide the user's slot first
  let userSlot: OffSlot | undefined;
  if (userOnTeam && userIn) {
    const slots = form.spots.map((s) => s.slot).filter((s) => OFF_SLOT_POS[s] === userP!.pos);
    if (userP!.pos === 'OL') userSlot = user!.olSlot === 'OT' ? 'LT' : 'LG';
    else if (userP!.pos === 'WR') userSlot = slots.includes('X') ? 'X' : slots[0];
    else userSlot = slots.find((s) => OFF_SLOT_DEPTH[s] === 0) ?? slots[0];
    if (userSlot && form.spots.some((s) => s.slot === userSlot)) {
      out[userSlot] = toSim(userP!, user);
      used.add(userP!.id);
    } else userSlot = undefined;
  }
  for (const spot of form.spots) {
    if (out[spot.slot]) continue;
    const pos = OFF_SLOT_POS[spot.slot];
    const p = fillFrom(league, team, pos === 'RB' && spot.slot === 'FB' ? 'RB' : pos, OFF_SLOT_DEPTH[spot.slot], used);
    if (p) {
      used.add(p.id);
      out[spot.slot] = toSim(p, user);
    }
  }
  return out;
}

export function defenseLineup(league: League, team: TeamState, play: DefPlay, user?: UserOnField, userIn = true): Partial<Record<DefSlot, SimPlayer>> {
  const form = DEF_FORMATIONS[play.formation];
  const used = new Set<string>();
  const userP = user ? league.players[user.pid] : undefined;
  const userOnTeam = userP && userP.teamId === team.id;
  if (userOnTeam && !userIn) used.add(userP!.id);
  const out: Partial<Record<DefSlot, SimPlayer>> = {};
  if (userOnTeam && userIn) {
    const slots = form.slots.filter((s) => DEF_SLOT_POS[s] === userP!.pos);
    const slot = slots.find((s) => DEF_SLOT_DEPTH[s] === 0) ?? slots[0];
    if (slot) {
      out[slot] = toSim(userP!, user);
      used.add(userP!.id);
    }
  }
  for (const slot of form.slots) {
    if (out[slot]) continue;
    const p = fillFrom(league, team, DEF_SLOT_POS[slot], DEF_SLOT_DEPTH[slot], used);
    if (p) {
      used.add(p.id);
      out[slot] = toSim(p, user);
    }
  }
  return out;
}

/** Does this formation use the user's position at all? */
export function formationUsesUser(pos: Pos, offPlay?: OffPlay, defPlay?: DefPlay): boolean {
  if (offPlay) return FORMATIONS[offPlay.formation].spots.some((s) => OFF_SLOT_POS[s.slot] === pos);
  if (defPlay) return DEF_FORMATIONS[defPlay.formation].slots.some((s) => DEF_SLOT_POS[s] === pos);
  return false;
}

/** Special teams units. */
export function kickingUnit(league: League, team: TeamState, kind: 'fg' | 'punt' | 'kickoff', user?: UserOnField) {
  const used = new Set<string>();
  const kPos: Pos = kind === 'punt' ? 'P' : 'K';
  const kicker = depthPlayers(league, team, kPos)[0] ?? depthPlayers(league, team, 'K')[0] ?? depthPlayers(league, team, 'P')[0];
  used.add(kicker.id);
  const order: Pos[] = kind === 'fg'
    ? ['OL', 'OL', 'OL', 'OL', 'OL', 'TE', 'TE', 'QB', 'OL']
    : kind === 'punt'
      ? ['OL', 'OL', 'OL', 'OL', 'OL', 'TE', 'LB', 'CB', 'WR', 'S']
      : ['LB', 'LB', 'S', 'S', 'CB', 'CB', 'WR', 'LB', 'RB', 'TE'];
  const others: SimPlayer[] = [];
  const counters: Partial<Record<Pos, number>> = {};
  for (const pos of order) {
    const start = kind === 'fg' ? 0 : pos === 'OL' ? 0 : 1;
    const list = depthPlayers(league, team, pos);
    let idx = (counters[pos] ?? start);
    let p = list[idx];
    while (p && used.has(p.id)) p = list[++idx];
    counters[pos] = idx + 1;
    const pick = p ?? fillFrom(league, team, pos, 0, used);
    if (pick) { used.add(pick.id); others.push(toSim(pick, user)); }
  }
  return { kicker: toSim(kicker, user), others };
}

export function returnUnit(league: League, team: TeamState, kind: 'fg' | 'punt' | 'kickoff', user?: UserOnField, userReturner = false) {
  const used = new Set<string>();
  const out: SimPlayer[] = [];
  const add = (p?: Player) => { if (p && !used.has(p.id)) { used.add(p.id); out.push(toSim(p, user)); } };
  if (kind === 'fg') {
    for (const pos of ['DE', 'DE', 'DT', 'DT', 'LB', 'LB', 'LB', 'DE', 'DT'] as Pos[]) add(fillFrom(league, team, pos, 0, used));
    return out;
  }
  // returner first
  if (userReturner && user) add(league.players[user.pid]);
  else add(pickReturner(league, team));
  const order: Pos[] = kind === 'punt' ? ['DE', 'DE', 'DT', 'LB', 'LB', 'LB', 'CB', 'CB', 'S', 'S'] : ['LB', 'LB', 'TE', 'TE', 'S', 'RB', 'WR', 'LB', 'CB', 'S'];
  for (const pos of order) add(fillFrom(league, team, pos, 1, used));
  return out;
}

export function pickReturner(league: League, team: TeamState, excludeId?: string): Player | undefined {
  const cands = [...depthPlayers(league, team, 'WR').slice(2), ...depthPlayers(league, team, 'RB').slice(1), ...depthPlayers(league, team, 'CB').slice(2)].filter((p) => p.id !== excludeId);
  cands.sort((a, b) => (b.attrs.spd ?? 0) + (b.attrs.agi ?? 0) - (a.attrs.spd ?? 0) - (a.attrs.agi ?? 0));
  return cands[0] ?? depthPlayers(league, team, 'WR')[0];
}
