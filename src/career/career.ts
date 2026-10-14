// ---------------------------------------------------------------------------
// The career layer: creates the user's player, runs the weekly loop, awards
// XP and coach trust, manages playing time, contracts and retirement.
// ---------------------------------------------------------------------------
import type {
  Appearance, Career, ContractOffer, Difficulty, Game, GameRecap, League, Player, Pos, Role, StatLine,
} from '../core/types';
import { Rng } from '../core/rng';
import { clamp, fmtMoney } from '../core/util';
import { POS_BODY, ROSTER_TEMPLATE, STARTERS } from '../data/positions';
import { TEAMS, teamName } from '../data/teams';
import { generateLeague, newPid } from '../league/generate';
import { buildAttrs, marketValue, randomNumber } from '../league/players';
import { rebuildDepth, depthIndex, teamRatings } from '../league/depth';
import { PLAYOFF_WEEK_BASE, REG_WEEKS, weekLabel } from '../league/schedule';
import {
  addLine, addNews, advancePlayoffs, careerLine, closeSeason, finalizeGame, playerValue, seedPlayoffs, simWeek, RECORD_LABEL,
} from '../league/season';
import { legacyScore, runOffseason, startNewSeason } from '../league/offseason';
import { simulateGame } from '../game/engine/gameLoop';
import type { GameState } from '../game/engine/rules';
import { addXp, ageUser } from './progression';
import { evalObjective, makeGameObjectives, makeSeasonGoals, seasonGoalMet } from './objectives';
import { rollEvent } from './events';
import { computeRecords, recStr } from '../league/standings';
import { calcOvr } from '../data/positions';

export const defaultAppearance = (): Appearance => ({
  skin: 3, face: 0, hair: 1, hairColor: 0, facialHair: 0, body: 1, helmet: 0, visor: 0, gloves: 0, cleats: 0, sleeves: 0,
  accessories: { eyeBlack: true, wristbands: false, towel: false, neckRoll: false },
});

export interface CreateOptions {
  first: string;
  last: string;
  pos: Pos;
  archetype: string;
  num: number;
  ht: number;
  wt: number;
  appearance: Appearance;
  startMode: 'rookie' | 'established' | 'undrafted';
  teamChoice: number | 'draft';
  difficulty: Difficulty;
  quarterMinutes: number;
  slot: number;
  seed?: number;
  olSlot?: 'OT' | 'OG';
}

export function userPlayer(league: League, c: Career): Player {
  return league.players[c.playerId];
}

/** Put the user on a team's roster, releasing the weakest player at their position if needed. */
export function joinTeam(league: League, p: Player, teamId: number) {
  if (p.teamId >= 0) {
    const old = league.teams[p.teamId];
    old.roster = old.roster.filter((id) => id !== p.id);
    rebuildDepth(league, old);
  }
  const team = league.teams[teamId];
  const same = team.roster.map((id) => league.players[id]).filter((x) => x && x.pos === p.pos && !x.user);
  if (same.length + 1 > ROSTER_TEMPLATE[p.pos]) {
    const cut = same.sort((a, b) => a.ovr - b.ovr)[0];
    team.roster = team.roster.filter((id) => id !== cut.id);
    cut.teamId = -1;
    league.freeAgents.push(cut.id);
  }
  league.freeAgents = league.freeAgents.filter((id) => id !== p.id);
  team.roster.push(p.id);
  p.teamId = teamId;
  // jersey number conflicts: give the teammate a new number
  for (const id of team.roster) {
    const q = league.players[id];
    if (q && q.id !== p.id && q.num === p.num) q.num = randomNumber(new Rng(q.num * 31 + 7), q.pos, new Set(team.roster.map((x) => league.players[x]?.num)));
  }
}

export function createCareer(o: CreateOptions): { league: League; career: Career } {
  const seed = o.seed ?? Math.floor(Math.random() * 1e9);
  const league = generateLeague(seed);
  const rng = new Rng(seed ^ 0x5bd1e995);
  const target = o.startMode === 'rookie' ? 61 : o.startMode === 'undrafted' ? 57 : 73;
  const attrs = buildAttrs(rng, o.pos, target, o.archetype);
  const body = POS_BODY[o.pos];
  const p: Player = {
    id: newPid(league),
    first: o.first.trim() || 'Rookie',
    last: o.last.trim() || 'Player',
    pos: o.pos,
    age: o.startMode === 'established' ? 23 : 22,
    num: o.num,
    ht: clamp(o.ht, body.ht[0] - 3, body.ht[1] + 3),
    wt: clamp(o.wt, body.wt[0] - 20, body.wt[1] + 20),
    attrs,
    ovr: calcOvr(o.pos, attrs),
    pot: 99,
    teamId: -1,
    contract: { years: 0, salary: 0, bonus: 0, signed: league.season },
    yearsPro: 0,
    stats: {},
    post: {},
    awards: [],
    archetype: o.archetype,
    user: true,
    college: 'State University',
    seasonsWith: [],
  };
  // Body size nudges physical attributes slightly.
  const htAdj = (p.ht - (body.ht[0] + body.ht[1]) / 2) * 0.6;
  const wtAdj = (p.wt - (body.wt[0] + body.wt[1]) / 2) / 12;
  p.attrs.str = clamp(Math.round((p.attrs.str ?? 60) + wtAdj), 30, 99);
  p.attrs.spd = clamp(Math.round((p.attrs.spd ?? 60) - wtAdj * 0.6), 30, 99);
  if (p.attrs.jmp !== undefined) p.attrs.jmp = clamp(Math.round(p.attrs.jmp + htAdj), 30, 99);
  p.ovr = calcOvr(p.pos, p.attrs);
  league.players[p.id] = p;
  const career: Career = {
    playerId: p.id,
    slot: o.slot,
    created: Date.now(),
    startMode: o.startMode,
    difficulty: o.difficulty,
    quarterMinutes: o.quarterMinutes,
    level: 1,
    xp: 0,
    sp: o.startMode === 'established' ? 6 : o.startMode === 'rookie' ? 3 : 2,
    abilities: [],
    equipped: [],
    trust: o.startMode === 'established' ? 55 : o.startMode === 'rookie' ? 40 : 32,
    role: 'BK',
    reputation: o.startMode === 'established' ? 35 : o.startMode === 'rookie' ? 15 : 5,
    phase: o.startMode === 'rookie' ? 'combine' : 'season',
    objectives: [],
    seasonGoals: [],
    trainingDoneWeek: -999,
    appearance: o.appearance,
    uniform: 'home',
    fatigue: 0,
    morale: 70,
    earnings: 0,
    recaps: [],
    decisions: [],
    milestones: [],
    seasonLog: [],
    olSlot: o.olSlot,
    wantsTeamId: o.teamChoice === 'draft' ? undefined : o.teamChoice,
    eventsSeen: [],
  };
  if (o.startMode === 'undrafted') {
    // Went undrafted: sign a minimum one-year deal and fight from the practice squad.
    const teamId = o.teamChoice === 'draft' ? pickDraftTeam(league, rng, p) : o.teamChoice;
    p.contract = { years: 1, salary: 0.75, bonus: 0, signed: league.season };
    joinTeam(league, p, teamId);
    beginSeason(league, career);
    addNews(league, { title: `Undrafted ${p.pos} ${p.first} ${p.last} signs with ${teamName(teamId)}`, body: 'Nobody called their name on draft weekend. Now the rookie gets a camp invite and a minimum deal to prove everybody wrong.', kind: 'contract' });
  }
  if (o.startMode === 'established') {
    const teamId = o.teamChoice === 'draft' ? pickDraftTeam(league, rng, p) : o.teamChoice;
    const salary = Math.max(1.2, marketValue(p.pos, p.ovr, p.age) * 1.1);
    p.contract = { years: 3, salary, bonus: Math.round(salary * 0.6 * 10) / 10, signed: league.season };
    p.draft = { season: league.season, round: 1, pick: rng.int(5, 32), teamId };
    joinTeam(league, p, teamId);
    career.earnings += p.contract.bonus;
    beginSeason(league, career);
    addNews(league, { title: `${p.first} ${p.last} signs with ${teamName(teamId)}`, body: `The ${TEAMS[teamId].name} add a promising ${p.pos} on a 3-year, ${fmtMoney(salary * 3)} deal.`, kind: 'contract' });
  }
  return { league, career };
}

/** Team that would draft the player: weaker teams with need pick first. */
export function pickDraftTeam(league: League, rng: Rng, p: Player): number {
  const scored = league.teams.map((t) => {
    const r = teamRatings(league, t);
    const starters = (t.depth[p.pos] ?? []).slice(0, STARTERS[p.pos]).map((id) => league.players[id]?.ovr ?? 60);
    const need = starters.length ? 80 - Math.min(...starters) : 20;
    return { id: t.id, s: -r.ovr + need * 0.6 + rng.normal(0, 4) };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].id;
}

/** Finish the rookie combine: compute a draft slot and place the player. */
export function runDraft(league: League, career: Career, combineScore: number): { round: number; pick: number; teamId: number } {
  const p = userPlayer(league, career);
  const rng = new Rng(league.season * 7 + combineScore);
  career.combineScore = combineScore;
  // Combine performance (0-100) can bump ratings slightly.
  const bump = Math.round((combineScore - 50) / 25);
  for (const k of Object.keys(p.attrs)) {
    const key = k as keyof typeof p.attrs;
    if (rng.chance(0.4)) p.attrs[key] = clamp((p.attrs[key] ?? 50) + bump, 25, 99);
  }
  p.ovr = calcOvr(p.pos, p.attrs);
  const score = p.ovr + combineScore / 12;
  const round = clamp(Math.ceil((74 - score) / 2.5), 1, 7);
  const pick = rng.int(1, 32);
  const teamId = career.wantsTeamId ?? pickDraftTeam(league, rng, p);
  const roundSal = [3.6, 1.8, 1.2, 1.0, 0.95, 0.9, 0.87][round - 1];
  p.contract = { years: 4, salary: Math.max(roundSal, marketValue(p.pos, p.ovr, p.age)), bonus: round <= 2 ? Math.round(roundSal * 1.5 * 10) / 10 : 0.2, signed: league.season };
  p.draft = { season: league.season, round, pick, teamId };
  joinTeam(league, p, teamId);
  career.earnings += p.contract.bonus;
  career.phase = 'draft';
  refreshRole(league, career);
  addNews(league, {
    title: `${TEAMS[teamId].name} select ${p.first} ${p.last}`,
    body: `${teamName(teamId)} take the ${p.pos} in round ${round} (pick ${pick}). ${career.wantsTeamId !== undefined ? 'A dream landing spot for the rookie.' : ''}`,
    kind: 'draft',
  });
  return { round, pick, teamId };
}

/** Called when a new season begins for the user (after draft or offseason). */
export function beginSeason(league: League, career: Career) {
  const p = userPlayer(league, career);
  career.phase = 'season';
  career.seasonGoals = makeSeasonGoals(p);
  career.trainingDoneWeek = -999;
  if (!p.seasonsWith) p.seasonsWith = [];
  p.seasonsWith.push(p.teamId);
  refreshRole(league, career);
  newWeekObjectives(league, career);
}

export function refreshRole(league: League, career: Career) {
  const p = userPlayer(league, career);
  if (p.teamId < 0) return;
  const team = league.teams[p.teamId];
  rebuildDepth(league, team, career.trust);
  const idx = depthIndex(team, p);
  const st = STARTERS[p.pos];
  const prev = career.role;
  let role: Role;
  if (idx < st) role = 'ST';
  else if (idx < st + 1) role = 'RT';
  else if (idx < st + 2 || p.pos === 'K' || p.pos === 'P') role = 'BK';
  else role = 'PS';
  career.role = role;
  if (prev !== role && league.week !== -3) {
    const names: Record<Role, string> = { ST: 'the starting lineup', RT: 'a rotational role', BK: 'a backup role', PS: 'the practice squad' };
    const up = ['PS', 'BK', 'RT', 'ST'].indexOf(role) > ['PS', 'BK', 'RT', 'ST'].indexOf(prev);
    addNews(league, { title: up ? `${p.last} earns ${names[role]}` : `${p.last} moved to ${names[role]}`, body: up ? 'Coaches like what they have seen and are rewarding the work.' : 'The staff wants more consistency before handing over more snaps.', kind: 'user' });
  }
}

export const ROLE_LABEL: Record<Role, string> = { ST: 'Starter', RT: 'Rotation', BK: 'Backup', PS: 'Practice Squad' };

/** Share of their unit's snaps the user is on the field for. */
export function snapShare(role: Role, preseason: boolean): number {
  if (preseason) return { ST: 0.7, RT: 0.85, BK: 0.85, PS: 0.75 }[role];
  return { ST: 1, RT: 0.5, BK: 0.18, PS: 0 }[role];
}

export function newWeekObjectives(league: League, career: Career) {
  const p = userPlayer(league, career);
  career.objectives = makeGameObjectives(new Rng(league.season * 100 + league.week + career.level), p, career.role);
}

export function userGameThisWeek(league: League, career: Career): Game | undefined {
  const p = userPlayer(league, career);
  return league.schedule.find((g) => g.season === league.season && g.week === league.week && !g.played && (g.home === p.teamId || g.away === p.teamId));
}

/** Next scheduled (unplayed) game for the user's team. */
export function nextUserGame(league: League, career: Career): Game | undefined {
  const p = userPlayer(league, career);
  return league.schedule
    .filter((g) => g.season === league.season && !g.played && (g.home === p.teamId || g.away === p.teamId))
    .sort((a, b) => a.week - b.week)[0];
}

/** Estimate a game grade for simulated games from the stat line. */
export function simGrade(p: Player, line: StatLine, role: Role): number {
  const v = playerValue(p, line);
  const base = role === 'ST' ? 58 : 55;
  return clamp(Math.round(base + v * (p.pos === 'OL' ? 0.8 : 1.4)), 35, 96);
}

function statXp(line: StatLine): number {
  const v = (k: keyof StatLine) => (line[k] as number | undefined) ?? 0;
  return v('passYds') * 0.35 + v('passTD') * 60 - v('passInt') * 30 + v('rushYds') * 0.9 + v('rushTD') * 70 + v('recYds') * 0.9 + v('rec') * 10 + v('recTD') * 70 +
    v('tackles') * 14 + v('tfl') * 20 + v('sacks') * 70 + v('ints') * 90 + v('pbu') * 25 + v('ff') * 60 + v('fr') * 40 + v('defTD') * 100 +
    v('fgM') * 35 + v('xpM') * 8 + v('punts') * 12 + v('puntIn20') * 25 + v('pancakes') * 30 + v('krYds') * 0.3 + v('prYds') * 0.4 + v('retTD') * 100 - v('fumblesLost') * 30;
}

const MILESTONES: { key: keyof StatLine; vals: number[]; label: string }[] = [
  { key: 'passYds', vals: [1000, 5000, 10000, 20000, 30000, 40000, 50000], label: 'career passing yards' },
  { key: 'passTD', vals: [1, 25, 50, 100, 200, 300, 400], label: 'career passing touchdowns' },
  { key: 'rushYds', vals: [500, 1000, 5000, 8000, 10000, 15000], label: 'career rushing yards' },
  { key: 'rushTD', vals: [1, 25, 50, 100], label: 'career rushing touchdowns' },
  { key: 'recYds', vals: [500, 1000, 5000, 8000, 10000, 15000], label: 'career receiving yards' },
  { key: 'recTD', vals: [1, 25, 50, 100], label: 'career receiving touchdowns' },
  { key: 'sacks', vals: [1, 10, 25, 50, 100, 150], label: 'career sacks' },
  { key: 'ints', vals: [1, 10, 25, 50], label: 'career interceptions' },
  { key: 'tackles', vals: [50, 250, 500, 1000, 1500], label: 'career tackles' },
  { key: 'fgM', vals: [1, 50, 100, 250, 400], label: 'career field goals' },
  { key: 'gs', vals: [1, 50, 100, 200], label: 'career starts' },
];

function checkMilestones(league: League, career: Career, before: StatLine, after: StatLine): string[] {
  const hits: string[] = [];
  for (const m of MILESTONES) {
    const b = (before[m.key] as number | undefined) ?? 0;
    const a = (after[m.key] as number | undefined) ?? 0;
    for (const v of m.vals) {
      if (b < v && a >= v) {
        const text = v === 1 ? `First ${m.label.replace('career ', '').replace(/s$/, '')}` : `${v.toLocaleString()} ${m.label}`;
        hits.push(text);
        career.milestones.push(`${league.season}: ${text}`);
        addNews(league, { title: `Milestone: ${text}`, body: `${userPlayer(league, career).first} ${userPlayer(league, career).last} reaches a new career mark.`, kind: 'user' });
      }
    }
  }
  return hits;
}

/**
 * Process the user's game: finalize the score, update stats, XP, trust,
 * objectives, simulate the rest of the week and advance the calendar.
 */
export function completeUserGame(league: League, career: Career, game: Game, g: GameState, opts: { grade?: number; snaps?: number; played: boolean; notes?: string[] }): GameRecap {
  const p = userPlayer(league, career);
  const playoff = game.week > PLAYOFF_WEEK_BASE;
  const careerBefore = careerLine(p);
  finalizeGame(league, game, g, playoff);
  const line: StatLine = { ...(g.box[p.id] ?? {}) };
  const played = opts.played && (opts.snaps ?? 1) > 0;
  if (!game.preseason) {
    const tbl = playoff ? p.post : p.stats;
    const bucket = (tbl[league.season] ??= {});
    if (played) {
      bucket.gp = (bucket.gp ?? 0) + 1;
      if (career.role === 'ST') bucket.gs = (bucket.gs ?? 0) + 1;
    }
    line.gp = played ? 1 : 0;
  }
  const home = game.home === p.teamId;
  const us = home ? g.score[0] : g.score[1];
  const them = home ? g.score[1] : g.score[0];
  const won = us > them;
  const grade = played ? clamp(Math.round(opts.grade ?? simGrade(p, line, career.role)), 0, 100) : 0;
  // Objectives
  const objResults = career.objectives.map((o) => {
    const done = evalObjective(o, line, { won, grade, played });
    return { o, done };
  });
  let xp = played ? 80 + grade * 2.5 + statXp(line) : 40;
  let trustDelta = 0;
  for (const r of objResults) if (r.done) { xp += r.o.xp; trustDelta += r.o.trust * 0.5; }
  if (played) {
    trustDelta += (grade - 62) / 7;
    trustDelta -= ((line.passInt ?? 0) + (line.fumblesLost ?? 0)) * 0.8;
    if (won) trustDelta += 0.8;
    // Consistency: a single bad game is softened if recent games were good
    const recent = career.recaps.slice(-3).filter((r) => !r.preseason);
    if (trustDelta < 0 && recent.length && recent.every((r) => r.grade >= 65)) trustDelta *= 0.5;
  } else if (career.role === 'PS') {
    trustDelta += 0.5; // scout-team work
  }
  if (game.preseason && played) trustDelta *= 1.4; // preseason is an audition
  trustDelta = clamp(trustDelta, -6, 8);
  if (playoff) xp *= 1.25;
  career.trust = clamp(career.trust + trustDelta, 0, 100);
  career.reputation = clamp(career.reputation + (played ? (grade - 62) / 25 : 0) + (playoff && won ? 1 : 0), 0, 100);
  career.fatigue = clamp(career.fatigue + (played ? 8 : 2), 0, 100);
  const levels = addXp(career, xp);
  const after = careerLine(p);
  if (game.preseason) addLine(after, {});
  const milestones = game.preseason ? [] : checkMilestones(league, career, careerBefore, after);
  if (milestones.length) addXp(career, milestones.length * 200);
  const notes = [...(opts.notes ?? [])];
  if (levels) notes.push(`Leveled up to ${career.level}! (+${levels * 3} skill points)`);
  for (const m of milestones) notes.push(`Milestone: ${m}`);
  const recap: GameRecap = {
    gameId: game.id, season: league.season, week: game.week, opp: home ? game.away : game.home, home, us, them,
    line, grade, xp: Math.round(xp), trustDelta: Math.round(trustDelta * 10) / 10,
    objectives: objResults.map((r) => ({ text: r.o.text, done: r.done, xp: r.o.xp })), notes, playoff, preseason: game.preseason,
    top: topPerformers(league, g.box), teamStats: teamTotals(league, g.box, p.teamId),
  };
  career.recaps.push(recap);
  if (career.recaps.length > 60) career.recaps.shift();
  if (played && grade >= 85) addNews(league, { title: `${p.first} ${p.last} shines vs ${TEAMS[recap.opp].name}`, body: `A ${grade} game grade in a ${won ? 'win' : 'loss'}, ${us}-${them}.`, kind: 'user' });
  advanceWeek(league, career, game.id);
  return recap;
}

export function lineText(pos: Pos, l: StatLine): string {
  const v = (k: keyof StatLine) => (l[k] as number | undefined) ?? 0;
  if (pos === 'QB') return `${v('passCmp')}/${v('passAtt')}, ${v('passYds')} yds, ${v('passTD')} TD, ${v('passInt')} INT`;
  if (v('rushAtt') >= v('rec') && v('rushAtt') > 0) return `${v('rushAtt')} car, ${v('rushYds')} yds, ${v('rushTD')} TD`;
  if (v('rec') > 0) return `${v('rec')} rec, ${v('recYds')} yds, ${v('recTD')} TD`;
  if (pos === 'K') return `${v('fgM')}/${v('fgA')} FG, ${v('xpM')}/${v('xpA')} XP`;
  if (pos === 'P') return `${v('punts')} punts, ${v('puntYds')} yds`;
  return `${v('tackles')} tkl, ${v('sacks')} sk, ${v('ints')} INT`;
}

function topPerformers(league: League, box: Record<string, StatLine>) {
  return Object.entries(box)
    .map(([pid, l]) => ({ pid, l, p: league.players[pid] }))
    .filter((x) => x.p)
    .map((x) => ({ ...x, v: playerValue(x.p, x.l) + (x.p.pos === 'QB' ? 0 : 2) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6)
    .map((x) => ({ pid: x.pid, name: `${x.p.first[0]}. ${x.p.last}`, team: x.p.teamId, pos: x.p.pos, text: lineText(x.p.pos, x.l) }));
}

function teamTotals(league: League, box: Record<string, StatLine>, teamId: number) {
  const t = () => ({ yds: 0, pass: 0, rush: 0, to: 0 });
  const us = t(), them = t();
  for (const [pid, l] of Object.entries(box)) {
    const p = league.players[pid];
    if (!p) continue;
    const side = p.teamId === teamId ? us : them;
    side.pass += (l.passYds ?? 0);
    side.rush += (l.rushYds ?? 0);
    side.to += (l.passInt ?? 0) + (l.fumblesLost ?? 0);
  }
  us.yds = us.pass + us.rush;
  them.yds = them.pass + them.rush;
  return { us, them };
}

/** Simulate the user's game without playing it (practice squad or user choice). */
export function simUserGame(league: League, career: Career, game: Game): GameRecap {
  const g = simulateGame(league, game.home, game.away, { seed: Math.floor(Math.random() * 1e9), quarterMinutes: 15, playoff: game.week > PLAYOFF_WEEK_BASE });
  const p = userPlayer(league, career);
  const played = career.role !== 'PS' || !!game.preseason;
  if (!played) delete g.box[p.id];
  return completeUserGame(league, career, game, g, { played, snaps: played ? 1 : 0, notes: played ? ['Simulated game'] : ['You were inactive (practice squad). Keep training to earn a roster spot.'] });
}

/** Advance the calendar: simulate the rest of the week and handle phase changes. */
export function advanceWeek(league: League, career: Career, skipId?: string) {
  const rng = new Rng(league.season * 1000 + league.week + 17);
  const week = league.week;
  simWeek(league, week, rng, skipId, 15);
  if (week < 0) {
    league.week = week === -1 ? 1 : week + 1;
    if (week === -1) {
      league.phase = 'regular';
      addNews(league, { title: 'Regular season begins', body: 'Preseason evaluations are over. Every game counts now.', kind: 'league', week: 1 });
    }
  } else if (week <= REG_WEEKS) {
    if (week === REG_WEEKS) {
      league.phase = 'playoffs';
      seedPlayoffs(league);
      league.week = PLAYOFF_WEEK_BASE + 1;
      const p = userPlayer(league, career);
      const inPO = league.seeds!.some((s) => s.includes(p.teamId));
      addNews(league, { title: inPO ? 'Your team is in the playoffs!' : 'Season over for your team', body: inPO ? `${TEAMS[p.teamId].name} clinch a playoff berth.` : 'The team misses the postseason. Time to regroup for next year.', kind: 'user' });
    } else league.week = week + 1;
  } else {
    if (!advancePlayoffs(league)) {
      endSeason(league, career);
      return;
    }
  }
  career.fatigue = clamp(career.fatigue - 12, 0, 100);
  refreshRole(league, career);
  newWeekObjectives(league, career);
  if (!career.pendingEvent && league.phase !== 'offseason') {
    const r = new Rng(league.season * 31 + league.week * 7 + career.level);
    const p = userPlayer(league, career);
    const stuck = (career.role === 'BK' || career.role === 'PS') && league.phase === 'regular' && league.week >= 4 && league.week <= 11;
    const alreadyAsked = career.decisions.some((d) => d.season === league.season && d.title === 'Trade Request?');
    if (stuck && !alreadyAsked && p.ovr >= 60 && r.chance(0.3)) {
      career.pendingEvent = {
        id: 'trade_request', title: 'Trade Request?',
        body: `You have been stuck on the bench as a ${ROLE_LABEL[career.role].toLowerCase()}. Your agent says a couple of teams with holes at ${p.pos} would give you a real shot. Requesting a trade will cost you standing in this locker room.`,
        choices: [
          { label: 'Request a trade', detail: 'Move to a team with a clearer path to playing time', effects: { trade: true } },
          { label: 'Stay and compete', detail: '+4 coach trust, +100 XP', effects: { trust: 4, xp: 100 } },
        ],
      };
    } else {
      const ev = rollEvent(r, career.eventsSeen);
      if (ev) career.pendingEvent = ev;
    }
  }
}

/** The user's team has no game this week (eliminated / bye): simulate it. */
export function simEmptyWeek(league: League, career: Career) {
  advanceWeek(league, career);
}

export function resolveEvent(league: League, career: Career, choiceIdx: number): string {
  const ev = career.pendingEvent;
  if (!ev) return '';
  const ch = ev.choices[choiceIdx];
  const p = userPlayer(league, career);
  const e = ch.effects;
  if (e.trust) career.trust = clamp(career.trust + e.trust, 0, 100);
  if (e.xp) addXp(career, e.xp);
  if (e.fatigue) career.fatigue = clamp(career.fatigue + e.fatigue, 0, 100);
  if (e.rep) career.reputation = clamp(career.reputation + e.rep, 0, 100);
  if (e.attr) { p.attrs[e.attr.attr] = clamp((p.attrs[e.attr.attr] ?? 50) + e.attr.delta, 20, 99); p.ovr = calcOvr(p.pos, p.attrs); }
  let tradeNote = '';
  if (e.trade) {
    const from = p.teamId;
    const cands = league.teams.filter((t) => t.id !== from).map((t) => ({ t, role: projectedRole(league, p, t.id) }))
      .sort((a, b) => ['ST', 'RT', 'BK', 'PS'].indexOf(a.role) - ['ST', 'RT', 'BK', 'PS'].indexOf(b.role) || teamRatings(league, b.t).ovr - teamRatings(league, a.t).ovr);
    const dest = cands[0];
    if (dest) {
      joinTeam(league, p, dest.t.id);
      career.trust = 50;
      refreshRole(league, career);
      newWeekObjectives(league, career);
      tradeNote = ` Traded to the ${teamName(dest.t.id)}.`;
      addNews(league, { title: `Trade: ${p.first} ${p.last} to ${TEAMS[dest.t.id].city}`, body: `The ${TEAMS[from].name} grant the ${p.pos}'s request and send him to the ${TEAMS[dest.t.id].name}.`, kind: 'contract' });
    } else tradeNote = ' No team made a deal.';
  }
  career.decisions.push({ season: league.season, week: league.week, title: ev.title, choice: ch.label });
  career.eventsSeen.push(ev.id);
  career.pendingEvent = undefined;
  return ch.detail + tradeNote;
}

/** Weekly training drill result. score 0..100 */
export function applyTraining(league: League, career: Career, score: number): { xp: number; trust: number } {
  const fatigueMult = 1 - career.fatigue / 250;
  const xp = Math.round((120 + score * 4.5) * fatigueMult);
  const trust = Math.round(((score - 50) / 18 + (career.role === 'PS' ? 1.5 : 0.5)) * 10) / 10;
  addXp(career, xp);
  career.trust = clamp(career.trust + trust, 0, 100);
  career.fatigue = clamp(career.fatigue + 6, 0, 100);
  career.trainingDoneWeek = league.season * 1000 + league.week;
  refreshRole(league, career);
  return { xp, trust };
}

export function trainingAvailable(league: League, career: Career): boolean {
  return career.phase === 'season' && career.trainingDoneWeek !== league.season * 1000 + league.week;
}

// --------------------------- Season end & contracts --------------------------
export function endSeason(league: League, career: Career) {
  const p = userPlayer(league, career);
  closeSeason(league);
  league.phase = 'offseason';
  // Season goals
  const line = p.stats[league.season] ?? {};
  for (const gl of career.seasonGoals) {
    gl.done = seasonGoalMet(gl, line);
    if (gl.done) { addXp(career, gl.xp); career.trust = clamp(career.trust + gl.trust, 0, 100); }
  }
  career.earnings += p.contract.salary;
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  const team = league.teams[p.teamId];
  const hist = team?.history[team.history.length - 1];
  const awards = p.awards.filter((a) => a.season === league.season).map((a) => a.key);
  career.seasonLog.push({
    season: league.season, teamId: p.teamId, age: p.age, ovr: p.ovr, role: career.role, line: { ...line }, post: { ...(p.post[league.season] ?? {}) },
    teamRecord: recStr(recs[p.teamId]), result: hist?.result ?? '', awards, salary: p.contract.salary,
  });
  for (const a of awards) {
    career.reputation = clamp(career.reputation + (({ MVP: 15, OPOY: 10, DPOY: 10, OROY: 6, DROY: 6, ALLSTAR: 4, CHAMPION: 6 } as Record<string, number>)[a] ?? 4), 0, 100);
    addXp(career, a === 'MVP' ? 2500 : a === 'ALLSTAR' ? 600 : 1200);
  }
  career.phase = 'awards';
}

function projectedRole(league: League, p: Player, teamId: number): Role {
  const ids = (league.teams[teamId].depth[p.pos] ?? []).filter((id) => id !== p.id);
  const better = ids.filter((id) => (league.players[id]?.ovr ?? 0) > p.ovr).length;
  const st = STARTERS[p.pos];
  return better < st ? 'ST' : better < st + 1 ? 'RT' : better < st + 2 ? 'BK' : 'PS';
}

export function generateOffers(league: League, career: Career): void {
  const p = userPlayer(league, career);
  const rng = new Rng(league.season * 13 + p.ovr);
  const offers: ContractOffer[] = [];
  const repBonus = career.reputation / 400;
  const base = marketValue(p.pos, p.ovr, p.age, repBonus);
  const yearsFor = () => clamp(p.age <= 26 ? rng.int(3, 5) : p.age <= 30 ? rng.int(2, 4) : rng.int(1, 2), 1, 5);
  if (p.contract.years <= 0) {
    career.offerKind = 'resign';
    if (p.teamId >= 0 && career.trust >= 30 && p.ovr >= 55) {
      offers.push({ teamId: p.teamId, years: yearsFor(), salary: Math.round(base * (0.9 + career.trust / 500) * 100) / 100, bonus: Math.round(base * 0.4 * 10) / 10, projectedRole: projectedRole(league, p, p.teamId), note: 'Re-sign with your current team. Familiar system, established trust.' });
    }
    // Free agency: teams with need
    const cands = league.teams.filter((t) => t.id !== p.teamId).map((t) => ({ t, role: projectedRole(league, p, t.id), r: teamRatings(league, t).ovr }))
      .sort((a, b) => ['ST', 'RT', 'BK', 'PS'].indexOf(a.role) - ['ST', 'RT', 'BK', 'PS'].indexOf(b.role) + rng.normal(0, 0.8));
    const n = clamp(Math.round(2 + career.reputation / 25 + (p.ovr - 65) / 8), 1, 5);
    for (const c of cands.slice(0, n)) {
      const needMult = c.role === 'ST' ? 1.08 : c.role === 'RT' ? 0.95 : 0.85;
      const offer: ContractOffer = {
        teamId: c.t.id, years: yearsFor(), salary: Math.round(base * needMult * rng.range(0.9, 1.12) * 100) / 100, bonus: Math.round(base * rng.range(0.2, 0.7) * 10) / 10,
        projectedRole: c.role, note: `${TEAMS[c.t.id].offense} offense / ${TEAMS[c.t.id].defense} defense. Team rating ${c.r}.`,
      };
      if (rng.chance(0.35)) {
        const stat = p.pos === 'QB' ? 'passTD' : p.pos === 'RB' ? 'rushYds' : p.pos === 'WR' || p.pos === 'TE' ? 'recYds' : p.pos === 'K' ? 'fgM' : p.pos === 'P' ? 'puntIn20' : p.pos === 'OL' ? 'gs' : 'tackles';
        const target = { passTD: 25, rushYds: 1000, recYds: 900, fgM: 25, puntIn20: 20, gs: 15, tackles: 80 }[stat as string] ?? 10;
        offer.incentive = { stat: stat as keyof StatLine, target, bonus: Math.round(base * 0.25 * 10) / 10 };
        offer.note += ` Incentive: ${fmtMoney(offer.incentive.bonus)} for ${target} ${RECORD_LABEL[stat as keyof StatLine] ?? stat}.`;
      }
      offers.push(offer);
    }
  } else if (p.contract.years <= 2 && p.ovr >= 72 && career.trust >= 55 && base > p.contract.salary * 1.15) {
    career.offerKind = 'extension';
    offers.push({ teamId: p.teamId, years: yearsFor() + 1, salary: Math.round(base * 1.02 * 100) / 100, bonus: Math.round(base * 0.8 * 10) / 10, projectedRole: projectedRole(league, p, p.teamId), note: 'Contract extension: lock in long-term security now.' });
  }
  career.offers = offers;
}

/** Move to the contract phase (called after awards are viewed). */
export function toContractPhase(league: League, career: Career) {
  const p = userPlayer(league, career);
  p.contract.years -= 1;
  generateOffers(league, career);
  career.phase = 'contract';
}

export function acceptOffer(league: League, career: Career, idx: number) {
  const p = userPlayer(league, career);
  const o = career.offers?.[idx];
  if (!o) return;
  const from = p.teamId;
  p.contract = { years: o.years, salary: o.salary, bonus: o.bonus, signed: league.season + 1, incentive: o.incentive };
  career.earnings += o.bonus;
  if (o.teamId !== from) {
    joinTeam(league, p, o.teamId);
    career.trust = 45 + (o.projectedRole === 'ST' ? 10 : 0);
    addNews(league, { title: `${p.first} ${p.last} signs with ${teamName(o.teamId)}`, body: `${o.years} years, ${fmtMoney(o.salary * o.years + o.bonus)} total.`, kind: 'contract' });
  } else addNews(league, { title: `${p.first} ${p.last} ${career.offerKind === 'extension' ? 'agrees to an extension' : 're-signs'} with the ${TEAMS[o.teamId].name}`, body: `${o.years} years at ${fmtMoney(o.salary)} per season.`, kind: 'contract' });
  career.decisions.push({ season: league.season, week: 0, title: 'Contract', choice: `${TEAMS[o.teamId].abbr} ${o.years}yr ${fmtMoney(o.salary)}/yr` });
  career.offers = undefined;
  career.phase = 'progression';
}

export function declineOffers(league: League, career: Career) {
  const p = userPlayer(league, career);
  if (p.contract.years <= 0) return false; // must sign or retire
  career.offers = undefined;
  career.phase = 'progression';
  return true;
}

export function checkIncentive(league: League, career: Career): string | undefined {
  const p = userPlayer(league, career);
  const inc = p.contract.incentive;
  if (!inc) return undefined;
  const v = ((p.stats[league.season] ?? {})[inc.stat] as number | undefined) ?? 0;
  if (v >= inc.target) {
    career.earnings += inc.bonus;
    return `Incentive earned: ${fmtMoney(inc.bonus)} bonus!`;
  }
  return undefined;
}

/** Offseason: AI league moves forward, user ages, new season begins. */
export function runUserOffseason(league: League, career: Career): string[] {
  const p = userPlayer(league, career);
  const notes: string[] = [];
  const inc = checkIncentive(league, career);
  if (inc) notes.push(inc);
  const before = p.ovr;
  ageUser(p);
  if (p.ovr !== before) notes.push(`Age ${p.age}: overall ${before} -> ${p.ovr}${p.ovr < before ? ' (physical decline)' : ''}.`);
  const rng = new Rng(league.season * 97 + 3);
  runOffseason(league, rng);
  startNewSeason(league, rng);
  career.trust = clamp(career.trust * 0.8 + 50 * 0.2, 0, 100);
  career.fatigue = 0;
  beginSeason(league, career);
  notes.push(`Season ${league.season} begins. Role: ${ROLE_LABEL[career.role]}.`);
  return notes;
}

export function canRetire(career: Career): boolean {
  return ['awards', 'contract', 'progression'].includes(career.phase);
}

export const LEGACY_TIERS: [number, string][] = [
  [260, 'Immortal Legend'],
  [170, 'First-Ballot Hall of Famer'],
  [110, 'Hall of Famer'],
  [65, 'Hall of Very Good'],
  [30, 'Solid Pro'],
  [0, 'Journeyman'],
];

export function retire(league: League, career: Career) {
  const p = userPlayer(league, career);
  const careerStats = careerLine(p);
  const post = careerLine(p, true);
  addLine(careerStats, {});
  const records: string[] = [];
  for (const scope of ['game', 'season', 'career', 'playoffGame'] as const) {
    for (const [k, r] of Object.entries(league.records[scope])) {
      if (r && r.playerId === p.id) records.push(`${scope === 'game' ? 'Single-game' : scope === 'season' ? 'Single-season' : scope === 'career' ? 'Career' : 'Playoff game'} ${RECORD_LABEL[k as keyof StatLine] ?? k}: ${r.value}`);
    }
  }
  let legacy = legacyScore(p) + records.length * 5 + Math.round(career.reputation / 4);
  const champs = p.awards.filter((a) => a.key === 'CHAMPION').length;
  legacy += champs * 4;
  const tier = LEGACY_TIERS.find(([min]) => legacy >= min)![1];
  const best = career.seasonLog.slice().sort((a, b) => playerValue(p, b.line) - playerValue(p, a.line))[0];
  career.retiredSummary = {
    seasons: career.seasonLog.length,
    teams: Array.from(new Set(career.seasonLog.map((s) => s.teamId))),
    games: (careerStats.gp ?? 0) + (post.gp ?? 0),
    career: careerStats,
    awards: p.awards.filter((a) => a.key !== 'CONF_CHAMP'),
    championships: champs,
    earnings: Math.round(career.earnings * 10) / 10,
    records,
    bestSeason: best?.season ?? league.season,
    legacyScore: legacy,
    tier,
    finalOvr: p.ovr,
  };
  if (legacy >= 110) league.hallOfFame.push({ id: p.id, name: `${p.first} ${p.last}`, pos: p.pos, score: legacy, inducted: league.season + 5 });
  addNews(league, { title: `${p.first} ${p.last} announces retirement`, body: `${career.seasonLog.length} seasons. Legacy: ${tier}.`, kind: 'user' });
  career.phase = 'retired';
}

export function teamRecordFor(league: League, tid: number): string {
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  return recStr(recs[tid]);
}

export function phaseLabel(league: League): string {
  if (league.phase === 'offseason') return 'Offseason';
  return weekLabel(league.week);
}

export { TEAMS };
