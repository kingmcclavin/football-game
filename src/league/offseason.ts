// Offseason processing for the AI league: aging, progression, retirement,
// contracts, free agency and the draft.
import type { Attr, League, Player, Pos, TeamState } from '../core/types';
import { Rng } from '../core/rng';
import { clamp } from '../core/util';
import { POS_ATTRS, ROSTER_TEMPLATE } from '../data/positions';
import { TEAMS, teamsInDiv } from '../data/teams';
import { rebuildDepth } from './depth';
import { dedupeNumbers, newPid } from './generate';
import { careerLine, addNews, playerValue } from './season';
import { fullName, makePlayer, marketValue, recalcOvr } from './players';
import { buildSchedule } from './schedule';
import { computeRecords, divisionStandings } from './standings';

const SPEED_ATTRS: Attr[] = ['spd', 'acc', 'agi'];

/** Age a player one year and apply progression/regression to attributes. */
export function developPlayer(rng: Rng, p: Player, opts: { skipGrowth?: boolean } = {}) {
  p.age += 1;
  p.yearsPro += 1;
  const age = p.age;
  let base: number;
  if (age <= 24) base = 1.5 + (p.pot - p.ovr) * 0.3;
  else if (age <= 27) base = 0.6 + (p.pot - p.ovr) * 0.2;
  else if (age <= 30) base = 0;
  else if (age <= 32) base = -1.5;
  else if (age <= 34) base = -3;
  else base = -4.5;
  if (opts.skipGrowth && base > 0) base = 0;
  const weights = POS_ATTRS[p.pos];
  for (const k in p.attrs) {
    const key = k as Attr;
    let d = base * (weights[key] ? 1 : 0.6) + rng.normal(0, 1.2);
    if (SPEED_ATTRS.includes(key) && age >= 29) d -= (age - 28) * 0.45;
    if ((key === 'awr' || key === 'prc') && age <= 33) d += 0.6;
    p.attrs[key] = clamp(Math.round((p.attrs[key] as number) + d), 20, 99);
  }
  recalcOvr(p);
  p.pot = Math.max(p.ovr, age >= 29 ? p.ovr : p.pot);
}

export function retireChance(p: Player): number {
  if (p.age >= 39) return 0.95;
  if (p.age >= 36) return 0.55;
  if (p.age >= 33) return p.ovr < 70 ? 0.45 : 0.12;
  if (p.age >= 30 && p.ovr < 58) return 0.4;
  if (p.teamId < 0 && p.ovr < 55) return 0.6;
  return 0.01;
}

export function legacyScore(p: Player): number {
  const c = careerLine(p);
  let s = 0;
  for (const season in p.stats) s += Math.max(0, playerValue(p, p.stats[Number(season)])) / 25;
  for (const a of p.awards) {
    s += ({ MVP: 25, OPOY: 14, DPOY: 14, OROY: 4, DROY: 4, ALLSTAR: 3, CHAMPION: 8, CONF_CHAMP: 2, FINAL_MVP: 8 } as Record<string, number>)[a.key] ?? 6;
  }
  s += (c.passTD ?? 0) * 0.08 + (c.rushYds ?? 0) / 600 + (c.recYds ?? 0) / 600 + (c.sacks ?? 0) * 0.35 + (c.ints ?? 0) * 0.5;
  return Math.round(s);
}

function needAt(league: League, team: TeamState, pos: Pos): number {
  const have = team.roster.filter((id) => league.players[id]?.pos === pos).length;
  return ROSTER_TEMPLATE[pos] - have;
}

function bestNeed(league: League, team: TeamState): Pos | null {
  let best: Pos | null = null;
  let bn = 0;
  for (const pos of Object.keys(ROSTER_TEMPLATE) as Pos[]) {
    const n = needAt(league, team, pos);
    if (n > bn) { bn = n; best = pos; }
  }
  return best;
}

function sign(league: League, p: Player, team: TeamState, years: number, salary?: number) {
  p.teamId = team.id;
  p.contract = { years, salary: salary ?? marketValue(p.pos, p.ovr, p.age), bonus: 0, signed: league.season };
  if (!team.roster.includes(p.id)) team.roster.push(p.id);
  league.freeAgents = league.freeAgents.filter((id) => id !== p.id);
}

function release(league: League, p: Player) {
  const t = league.teams[p.teamId];
  if (t) t.roster = t.roster.filter((id) => id !== p.id);
  p.teamId = -1;
  p.contract = { years: 0, salary: 0, bonus: 0, signed: league.season };
  if (!league.freeAgents.includes(p.id)) league.freeAgents.push(p.id);
}

/**
 * Run the AI offseason. The user's player is skipped entirely: the career
 * layer handles their aging, development and contract decisions.
 */
export function runOffseason(league: League, rng: Rng): { retired: Player[]; drafted: Player[] } {
  const retired: Player[] = [];
  // Order for the draft: worst record first.
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  const order = recs.slice().sort((a, b) => a.w - b.w || b.pa - b.pf - (a.pa - a.pf)).map((r) => r.id);
  // Final division standings for next season's schedule.
  const last: number[][] = [];
  for (let c = 0; c < 2; c++) for (let d = 0; d < 4; d++) last.push(divisionStandings(recs, c, d).map((r) => r.id));
  league.lastStandings = last;

  // 1. Development and retirement
  for (const id of Object.keys(league.players)) {
    const p = league.players[id];
    if (p.user) continue;
    developPlayer(rng, p);
    p.injury = undefined;
    if (rng.chance(retireChance(p))) {
      retired.push(p);
      const score = legacyScore(p);
      if (score >= 60) {
        league.hallOfFame.push({ id: p.id, name: fullName(p), pos: p.pos, score, inducted: league.season + 1 });
        addNews(league, { title: `${fullName(p)} retires`, body: `A Hall of Fame-caliber career (${score} legacy points) comes to an end.`, kind: 'league' });
      }
      const t = league.teams[p.teamId];
      if (t) t.roster = t.roster.filter((x) => x !== p.id);
      league.freeAgents = league.freeAgents.filter((x) => x !== p.id);
      delete league.players[id];
    }
  }
  // 2. Contracts expire
  for (const id of Object.keys(league.players)) {
    const p = league.players[id];
    if (p.user || p.teamId < 0) continue;
    p.contract.years -= 1;
    if (p.contract.years <= 0) {
      const keep = p.ovr >= 70 ? 0.8 : p.age <= 25 ? 0.6 : 0.4;
      if (rng.chance(keep)) sign(league, p, league.teams[p.teamId], rng.int(1, 4));
      else release(league, p);
    }
  }
  // 3. Draft: generate a class and let teams pick by need
  const classSize = 7 * 32;
  const pool: Player[] = [];
  const posWeights = Object.entries(ROSTER_TEMPLATE) as [Pos, number][];
  for (let i = 0; i < classSize; i++) {
    const pos = rng.weighted(posWeights.map((x) => x[0]), posWeights.map((x) => x[1]));
    const tier = i / classSize;
    const ovr = Math.round(clamp(rng.normal(72 - tier * 20, 4), 45, 82));
    const p = makePlayer(rng, newPid(league), pos, ovr, -1, league.season + 1, { rookie: true });
    p.pot = clamp(p.ovr + rng.int(4, 18), p.ovr, 99);
    pool.push(p);
  }
  pool.sort((a, b) => b.ovr + b.pot * 0.5 - (a.ovr + a.pot * 0.5));
  const drafted: Player[] = [];
  for (let round = 1; round <= 7; round++) {
    for (let k = 0; k < order.length; k++) {
      const team = league.teams[order[k]];
      const need = bestNeed(league, team);
      let idx = need ? pool.findIndex((p) => p.pos === need) : 0;
      if (idx < 0 || idx > 12) idx = 0;
      const pick = pool.splice(idx, 1)[0];
      if (!pick) continue;
      league.players[pick.id] = pick;
      pick.draft = { season: league.season + 1, round, pick: k + 1, teamId: team.id };
      sign(league, pick, team, 4, marketValue(pick.pos, pick.ovr, pick.age) * (round === 1 ? 1.6 : 1));
      drafted.push(pick);
    }
  }
  for (const p of pool.slice(0, 60)) {
    league.players[p.id] = p;
    p.teamId = -1;
    league.freeAgents.push(p.id);
  }
  // 4. Trim rosters to the template and fill holes from free agency
  for (const team of league.teams) {
    for (const pos of Object.keys(ROSTER_TEMPLATE) as Pos[]) {
      const at = team.roster.map((id) => league.players[id]).filter((p) => p && p.pos === pos && !p.user).sort((a, b) => a.ovr - b.ovr);
      const userHere = team.roster.some((id) => league.players[id]?.user && league.players[id].pos === pos) ? 1 : 0;
      let over = at.length + userHere - ROSTER_TEMPLATE[pos];
      while (over-- > 0 && at.length) release(league, at.shift()!);
    }
  }
  fillRosters(league, rng);
  // 5. Free agent pool cleanup
  league.freeAgents = league.freeAgents.filter((id) => league.players[id]);
  league.freeAgents.sort((a, b) => league.players[b].ovr - league.players[a].ovr);
  for (const id of league.freeAgents.slice(120)) { if (!league.players[id].user) delete league.players[id]; }
  league.freeAgents = league.freeAgents.slice(0, 120);
  for (const t of league.teams) { dedupeNumbers(league, t); rebuildDepth(league, t); }
  addNews(league, { title: 'Draft complete', body: `${drafted.length} rookies selected. ${retired.length} veterans retired.`, kind: 'draft' });
  return { retired, drafted };
}

export function fillRosters(league: League, rng: Rng) {
  for (const team of league.teams) {
    for (const pos of Object.keys(ROSTER_TEMPLATE) as Pos[]) {
      let need = needAt(league, team, pos);
      while (need-- > 0) {
        const fa = league.freeAgents.map((id) => league.players[id]).filter((p) => p && p.pos === pos && !p.user).sort((a, b) => b.ovr - a.ovr)[0];
        if (fa) sign(league, fa, team, rng.int(1, 2));
        else {
          const p = makePlayer(rng, newPid(league), pos, rng.int(50, 62), team.id, league.season);
          league.players[p.id] = p;
          team.roster.push(p.id);
        }
      }
    }
  }
}

/** Roll the league over into a new season. */
export function startNewSeason(league: League, rng: Rng) {
  league.season += 1;
  league.seasonIndex += 1;
  league.phase = 'preseason';
  league.week = -3;
  league.seeds = undefined;
  // keep only recent games in the schedule to bound save size
  league.schedule = buildSchedule(league, rng);
  for (const t of league.teams) rebuildDepth(league, t);
  addNews(league, { title: `Season ${league.season} kicks off`, body: `${TEAMS.length} teams, one ${'Crown Bowl'}. Preseason begins.`, kind: 'league', week: -3 });
}

export { teamsInDiv };
