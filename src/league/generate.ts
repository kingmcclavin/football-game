import type { League, Player, Pos, TeamState } from '../core/types';
import { Rng } from '../core/rng';
import { clamp } from '../core/util';
import { ROSTER_TEMPLATE, STARTERS } from '../data/positions';
import { COACH_FIRST, COACH_LAST, TEAMS } from '../data/teams';
import { makePlayer } from './players';
import { rebuildDepth } from './depth';
import { buildSchedule } from './schedule';

export const SAVE_VERSION = 1;

export function newPid(league: League): string {
  return `p${league.nextPid++}`;
}

/** Target OVR for the n-th player at a position on a team of given strength. */
function depthTarget(rng: Rng, pos: Pos, idx: number, teamStrength: number): number {
  const starters = STARTERS[pos];
  let base: number;
  if (idx < starters) base = 74 + teamStrength - idx * 1.5;
  else base = 64 + teamStrength * 0.5 - (idx - starters) * 3;
  return clamp(Math.round(base + rng.normal(0, 4.5)), 45, 97);
}

export function generateLeague(seed: number, season = 2026): League {
  const rng = new Rng(seed);
  const league: League = {
    version: SAVE_VERSION,
    season,
    seasonIndex: 0,
    phase: 'preseason',
    week: 0,
    players: {},
    teams: [],
    schedule: [],
    records: { game: {}, season: {}, career: {}, playoffGame: {}, team: {} },
    history: [],
    news: [],
    nextPid: 1,
    nextNews: 1,
    freeAgents: [],
    hallOfFame: [],
  };
  for (const def of TEAMS) {
    const strength = rng.normal(0, 4);
    const team: TeamState = {
      id: def.id,
      roster: [],
      depth: {},
      fanRep: clamp(Math.round(55 + strength * 4 + rng.normal(0, 10)), 20, 99),
      coach: `${rng.pick(COACH_FIRST)} ${rng.pick(COACH_LAST)}`,
      history: [],
      championships: rng.chance(0.4) ? rng.int(1, 5) : 0,
    };
    for (const pos of Object.keys(ROSTER_TEMPLATE) as Pos[]) {
      for (let i = 0; i < ROSTER_TEMPLATE[pos]; i++) {
        const p = makePlayer(rng, newPid(league), pos, depthTarget(rng, pos, i, strength), def.id, season);
        league.players[p.id] = p;
        team.roster.push(p.id);
      }
    }
    dedupeNumbers(league, team);
    rebuildDepth(league, team);
    league.teams.push(team);
  }
  // A small free agent pool of veterans.
  for (let i = 0; i < 40; i++) {
    const pos = rng.pick(Object.keys(ROSTER_TEMPLATE) as Pos[]);
    const p = makePlayer(rng, newPid(league), pos, rng.int(52, 66), -1, season);
    p.contract = { years: 0, salary: 0, bonus: 0, signed: season };
    league.players[p.id] = p;
    league.freeAgents.push(p.id);
  }
  league.schedule = buildSchedule(league, rng);
  return league;
}

export function dedupeNumbers(league: League, team: TeamState) {
  const used = new Set<number>();
  for (const id of team.roster) {
    const p: Player = league.players[id];
    let n = p.num;
    let guard = 0;
    while (used.has(n) && guard++ < 100) n = (n % 99) + 1;
    p.num = n;
    used.add(n);
  }
}
