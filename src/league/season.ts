// Season flow: applying box scores, simulating weeks, playoffs, awards.
import type { AwardKey, Game, League, Player, Pos, RecordEntry, StatKey, StatLine, TeamState } from '../core/types';
import { Rng } from '../core/rng';
import { CHAMPIONSHIP_NAME, TEAMS, teamName } from '../data/teams';
import { STARTERS } from '../data/positions';
import { simulateGame } from '../game/engine/gameLoop';
import type { GameState } from '../game/engine/rules';
import { computeRecords, conferenceSeeds, recStr } from './standings';
import { PLAYOFF_WEEK_BASE, REG_WEEKS, gameId } from './schedule';
import { fullName } from './players';

export const RECORD_KEYS: StatKey[] = ['passYds', 'passTD', 'rushYds', 'rushTD', 'rec', 'recYds', 'recTD', 'sacks', 'ints', 'tackles', 'fgM', 'fgLong', 'defTD', 'retTD'];
export const RECORD_LABEL: Partial<Record<StatKey, string>> = {
  passYds: 'Passing Yards', passTD: 'Passing TDs', rushYds: 'Rushing Yards', rushTD: 'Rushing TDs', rec: 'Receptions', recYds: 'Receiving Yards', recTD: 'Receiving TDs',
  sacks: 'Sacks', ints: 'Interceptions', tackles: 'Tackles', fgM: 'Field Goals Made', fgLong: 'Longest Field Goal', defTD: 'Defensive TDs', retTD: 'Return TDs',
};

export function addLine(dst: StatLine, src: StatLine) {
  for (const k in src) {
    const key = k as StatKey;
    const v = src[key] as number;
    if (key.endsWith('Long')) (dst as Record<string, number>)[key] = Math.max((dst[key] as number | undefined) ?? 0, v);
    else (dst as Record<string, number>)[key] = ((dst[key] as number | undefined) ?? 0) + v;
  }
}

export function careerLine(p: Player, post = false): StatLine {
  const out: StatLine = {};
  for (const s in post ? p.post : p.stats) addLine(out, (post ? p.post : p.stats)[Number(s)]);
  return out;
}

export function addNews(league: League, n: Omit<import('../core/types').NewsItem, 'id' | 'season' | 'week'> & { week?: number }) {
  league.news.unshift({ id: league.nextNews++, season: league.season, week: n.week ?? league.week, title: n.title, body: n.body, kind: n.kind });
  if (league.news.length > 160) league.news.length = 160;
}

/** Credit games played/started to the teams' regulars and merge the box score. */
export function applyBox(league: League, game: Game, box: Record<string, StatLine>, playoff: boolean) {
  const season = league.season;
  const credited = new Set<string>();
  for (const tid of [game.home, game.away]) {
    const team = league.teams[tid];
    for (const pos of Object.keys(STARTERS) as Pos[]) {
      const ids = team.depth[pos] ?? [];
      const n = STARTERS[pos];
      ids.slice(0, n + (pos === 'K' || pos === 'P' || pos === 'QB' ? 0 : 1)).forEach((id, idx) => {
        const p = league.players[id];
        if (!p || p.injury) return;
        if (p.user) return; // the user's games played are credited by the career layer
        const line = bucket(p, season, playoff);
        line.gp = (line.gp ?? 0) + 1;
        if (idx < n) line.gs = (line.gs ?? 0) + 1;
        credited.add(id);
      });
    }
  }
  for (const pid in box) {
    const p = league.players[pid];
    if (!p) continue;
    const line = bucket(p, season, playoff);
    addLine(line, box[pid]);
    if (!credited.has(pid) && !p.user) line.gp = (line.gp ?? 0) + 1;
  }
}

function bucket(p: Player, season: number, playoff: boolean): StatLine {
  const tbl = playoff ? p.post : p.stats;
  return (tbl[season] ??= {});
}

function checkRecord(league: League, scope: 'game' | 'playoffGame' | 'season' | 'career', key: StatKey, value: number, p: Player): boolean {
  const recs = league.records[scope];
  const cur = recs[key];
  if (value <= 0) return false;
  if (!cur || value > cur.value) {
    const entry: RecordEntry = { value, playerId: p.id, name: fullName(p), teamId: p.teamId, season: league.season };
    const broke = !!cur && cur.playerId !== p.id;
    recs[key] = entry;
    if (broke || (p.user && scope !== 'career')) {
      if (cur) addNews(league, { title: `${p.user ? 'You set' : `${fullName(p)} sets`} a new ${scope === 'game' ? 'single-game' : scope === 'season' ? 'single-season' : scope === 'career' ? 'career' : 'playoff game'} record`, body: `${RECORD_LABEL[key]}: ${value} (previous ${cur.value} by ${cur.name}, ${cur.season}).`, kind: 'record' });
    }
    return broke;
  }
  return false;
}

export function updateGameRecords(league: League, game: Game, box: Record<string, StatLine>, playoff: boolean) {
  for (const pid in box) {
    const p = league.players[pid];
    if (!p) continue;
    for (const k of RECORD_KEYS) {
      const v = box[pid][k];
      if (v) checkRecord(league, playoff ? 'playoffGame' : 'game', k, v, p);
    }
  }
  const pts = Math.max(game.hs, game.as);
  const tid = game.hs >= game.as ? game.home : game.away;
  const cur = league.records.team.mostPointsGame;
  if (!cur || pts > cur.value) league.records.team.mostPointsGame = { value: pts, playerId: '', name: teamName(tid), teamId: tid, season: league.season };
}

export function updateSeasonRecords(league: League) {
  for (const id in league.players) {
    const p = league.players[id];
    const line = p.stats[league.season];
    if (line) for (const k of RECORD_KEYS) { const v = line[k]; if (v) checkRecord(league, 'season', k, v, p); }
    const car = careerLine(p);
    for (const k of RECORD_KEYS) { if (k === 'fgLong') continue; const v = car[k]; if (v) checkRecord(league, 'career', k, v, p); }
  }
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  for (const r of recs) {
    const cur = league.records.team.mostWins;
    if (!cur || r.w > cur.value) league.records.team.mostWins = { value: r.w, playerId: '', name: teamName(r.id), teamId: r.id, season: league.season };
  }
}

export function finalizeGame(league: League, game: Game, g: GameState, playoff: boolean) {
  game.hs = g.score[0];
  game.as = g.score[1];
  game.played = true;
  game.ot = g.quarter > 4;
  if (!game.preseason) {
    applyBox(league, game, g.box, playoff);
    updateGameRecords(league, game, g.box, playoff);
  }
  // Top performers (for schedule display)
  const top = Object.entries(g.box)
    .map(([pid, l]) => ({ pid, v: (l.passYds ?? 0) / 25 + (l.passTD ?? 0) * 4 + (l.rushYds ?? 0) / 10 + (l.recYds ?? 0) / 10 + ((l.rushTD ?? 0) + (l.recTD ?? 0)) * 6 + (l.sacks ?? 0) * 4 + (l.ints ?? 0) * 5 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 2)
    .map((x) => x.pid);
  game.topPerformers = top;
  if (playoff && game.round === 4) {
    // Championship MVP: best performer on the winning side.
    const winner = game.hs > game.as ? game.home : game.away;
    const score = (l: Partial<Record<string, number>>) => (l.passYds ?? 0) / 20 + (l.passTD ?? 0) * 5 - (l.passInt ?? 0) * 4 + (l.rushYds ?? 0) / 9 + (l.recYds ?? 0) / 9 + ((l.rushTD ?? 0) + (l.recTD ?? 0)) * 6
      + (l.tackles ?? 0) * 0.8 + (l.sacks ?? 0) * 5 + (l.ints ?? 0) * 7 + (l.ff ?? 0) * 4 + (l.defTD ?? 0) * 7 + (l.fgM ?? 0) * 2.5;
    const best = Object.entries(g.box)
      .filter(([pid]) => league.players[pid]?.teamId === winner)
      .map(([pid, l]) => ({ pid, v: score(l as Partial<Record<string, number>>) }))
      .sort((a, b) => b.v - a.v)[0];
    if (best) game.mvp = best.pid;
  }
}

/** Simulate every unplayed game in a week except `skipId`. */
export function simWeek(league: League, week: number, rng: Rng, skipId?: string, quarterMinutes = 15) {
  for (const game of league.schedule) {
    if (game.season !== league.season || game.week !== week || game.played || game.id === skipId) continue;
    const g = simulateGame(league, game.home, game.away, { seed: rng.int(1, 1e9), quarterMinutes, playoff: week > PLAYOFF_WEEK_BASE });
    finalizeGame(league, game, g, week > PLAYOFF_WEEK_BASE);
    if (week > PLAYOFF_WEEK_BASE) {
      const w = game.hs > game.as ? game.home : game.away;
      const l = w === game.home ? game.away : game.home;
      addNews(league, { title: `${TEAMS[w].name} ${week === PLAYOFF_WEEK_BASE + 4 ? `win the ${CHAMPIONSHIP_NAME}!` : 'advance'}`, body: `${teamName(w)} defeated the ${TEAMS[l].name} ${Math.max(game.hs, game.as)}-${Math.min(game.hs, game.as)}.`, kind: 'game' });
    }
  }
}

// ----------------------------- Playoffs ------------------------------------
export function seedPlayoffs(league: League) {
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  league.seeds = [conferenceSeeds(recs, 0, league.season), conferenceSeeds(recs, 1, league.season)];
  const week = PLAYOFF_WEEK_BASE + 1;
  for (let c = 0; c < 2; c++) {
    const s = league.seeds[c];
    for (const [a, b] of [[1, 6], [2, 5], [3, 4]]) {
      league.schedule.push({ id: gameId(league.season, week, s[a], s[b]), season: league.season, week, home: s[a], away: s[b], hs: 0, as: 0, played: false, round: 1 });
    }
  }
  addNews(league, { title: 'Playoff field is set', body: `Top seeds: ${teamName(league.seeds[0][0])} and ${teamName(league.seeds[1][0])} earn first-round byes.`, kind: 'league', week });
}

const seedOf = (league: League, tid: number) => {
  for (const s of league.seeds ?? []) { const i = s.indexOf(tid); if (i >= 0) return i; }
  return 99;
};

function winnersOf(league: League, round: number, conf?: number): number[] {
  return league.schedule
    .filter((g) => g.season === league.season && g.round === round && g.played && (conf === undefined || TEAMS[g.home].conf === conf))
    .map((g) => (g.hs > g.as ? g.home : g.away));
}

/** Create the next playoff round once the current round is complete. Returns false when the season is over. */
export function advancePlayoffs(league: League): boolean {
  const cur = league.week - PLAYOFF_WEEK_BASE;
  const games = league.schedule.filter((g) => g.season === league.season && g.round === cur);
  if (games.some((g) => !g.played)) return true;
  if (cur >= 4) return false;
  const next = cur + 1;
  const week = PLAYOFF_WEEK_BASE + next;
  const add = (h: number, a: number) => league.schedule.push({ id: gameId(league.season, week, h, a), season: league.season, week, home: h, away: a, hs: 0, as: 0, played: false, round: next });
  if (next === 2) {
    for (let c = 0; c < 2; c++) {
      const teams = [league.seeds![c][0], ...winnersOf(league, 1, c)].sort((a, b) => seedOf(league, a) - seedOf(league, b));
      add(teams[0], teams[3]);
      add(teams[1], teams[2]);
    }
  } else if (next === 3) {
    for (let c = 0; c < 2; c++) {
      const teams = winnersOf(league, 2, c).sort((a, b) => seedOf(league, a) - seedOf(league, b));
      add(teams[0], teams[1]);
    }
  } else if (next === 4) {
    const champs = winnersOf(league, 3);
    const lc = champs.find((t) => TEAMS[t].conf === 0)!;
    const fc = champs.find((t) => TEAMS[t].conf === 1)!;
    if (league.season % 2 === 0) add(lc, fc);
    else add(fc, lc);
  }
  league.week = week;
  return true;
}

export function champion(league: League): number | undefined {
  const f = league.schedule.find((g) => g.season === league.season && g.round === 4 && g.played);
  if (!f) return undefined;
  return f.hs > f.as ? f.home : f.away;
}

// ------------------------------ Awards -------------------------------------
function teamWins(league: League): Record<number, number> {
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  const out: Record<number, number> = {};
  for (const r of recs) out[r.id] = r.w;
  return out;
}

export function playerValue(p: Player, l: StatLine): number {
  switch (p.pos) {
    case 'QB': return (l.passYds ?? 0) / 25 + (l.passTD ?? 0) * 4 - (l.passInt ?? 0) * 3 + (l.rushYds ?? 0) / 10 + (l.rushTD ?? 0) * 6 - (l.fumblesLost ?? 0) * 2;
    case 'RB': return (l.rushYds ?? 0) / 10 + (l.recYds ?? 0) / 10 + ((l.rushTD ?? 0) + (l.recTD ?? 0)) * 6 - (l.fumblesLost ?? 0) * 3;
    case 'WR':
    case 'TE': return (l.recYds ?? 0) / 10 + (l.rec ?? 0) * 0.5 + (l.recTD ?? 0) * 6 + (l.retTD ?? 0) * 6 - (l.drops ?? 0);
    case 'OL': return (l.gs ?? 0) * 4 + (l.pancakes ?? 0) * 2 - (l.sacksAllowed ?? 0) * 4;
    case 'K': return (l.fgM ?? 0) * 3 + (l.xpM ?? 0) - ((l.fgA ?? 0) - (l.fgM ?? 0)) * 3 + ((l.fgLong ?? 0) >= 50 ? 5 : 0);
    case 'P': return (l.puntYds ?? 0) / 40 + (l.puntIn20 ?? 0) * 2;
    default: return (l.tackles ?? 0) * 1 + (l.tfl ?? 0) * 1.5 + (l.sacks ?? 0) * 5 + (l.ints ?? 0) * 6 + (l.pbu ?? 0) * 1.5 + (l.ff ?? 0) * 4 + (l.fr ?? 0) * 3 + (l.defTD ?? 0) * 6;
  }
}

export interface AwardResult {
  key: AwardKey;
  pid: string;
}

/** Determine season awards from real statistics and team success. */
export function computeAwards(league: League): AwardResult[] {
  const wins = teamWins(league);
  const out: AwardResult[] = [];
  const active = Object.values(league.players).filter((p) => p.teamId >= 0 && p.stats[league.season]);
  const score = (p: Player, winW: number) => playerValue(p, p.stats[league.season]) + (wins[p.teamId] ?? 0) * winW;
  const best = (pool: Player[], winW: number) => pool.slice().sort((a, b) => score(b, winW) - score(a, winW) || a.id.localeCompare(b.id))[0];
  const offense = active.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.pos));
  const defense = active.filter((p) => ['DE', 'DT', 'LB', 'CB', 'S'].includes(p.pos));
  // MVP: quarterbacks weighted toward team success, others need big numbers
  const mvpPool = offense.map((p) => ({ p, v: score(p, 3) * (p.pos === 'QB' ? 1 : 0.85) })).sort((a, b) => b.v - a.v);
  const push = (key: AwardKey, p?: Player) => { if (p) out.push({ key, pid: p.id }); };
  push('MVP', mvpPool[0]?.p);
  push('OPOY', best(offense.filter((p) => p.id !== mvpPool[0]?.p.id), 0.5));
  push('DPOY', best(defense, 0.3));
  push('OROY', best(offense.filter((p) => p.yearsPro === 0), 0.3));
  push('DROY', best(defense.filter((p) => p.yearsPro === 0), 0.2));
  push('BEST_QB', best(active.filter((p) => p.pos === 'QB'), 1));
  push('BEST_RB', best(active.filter((p) => p.pos === 'RB'), 0.3));
  push('BEST_WR', best(active.filter((p) => p.pos === 'WR'), 0.3));
  push('BEST_TE', best(active.filter((p) => p.pos === 'TE'), 0.3));
  push('BEST_OL', best(active.filter((p) => p.pos === 'OL'), 0.8));
  push('BEST_DL', best(active.filter((p) => p.pos === 'DE' || p.pos === 'DT'), 0.2));
  push('BEST_LB', best(active.filter((p) => p.pos === 'LB'), 0.2));
  push('BEST_DB', best(active.filter((p) => p.pos === 'CB' || p.pos === 'S'), 0.2));
  push('BEST_K', best(active.filter((p) => p.pos === 'K'), 0.2));
  // All-Stars: top 2 per position per conference (top 4 WR, 5 OL)
  const per: Partial<Record<Pos, number>> = { QB: 1, RB: 1, WR: 2, TE: 1, OL: 3, DE: 2, DT: 1, LB: 2, CB: 2, S: 1, K: 1, P: 1 };
  for (const conf of [0, 1]) {
    for (const pos of Object.keys(per) as Pos[]) {
      const pool = active.filter((p) => p.pos === pos && TEAMS[p.teamId].conf === conf).sort((a, b) => score(b, 0.2) + b.ovr * 0.3 - score(a, 0.2) - a.ovr * 0.3);
      pool.slice(0, per[pos]).forEach((p) => out.push({ key: 'ALLSTAR', pid: p.id }));
    }
  }
  return out;
}

export const AWARD_LABEL: Record<AwardKey, string> = {
  MVP: 'Most Valuable Player', OPOY: 'Offensive Player of the Year', DPOY: 'Defensive Player of the Year', OROY: 'Offensive Rookie of the Year',
  DROY: 'Defensive Rookie of the Year', BEST_QB: 'Quarterback of the Year', BEST_RB: 'Running Back of the Year', BEST_WR: 'Receiver of the Year',
  BEST_TE: 'Tight End of the Year', BEST_OL: 'Lineman of the Year', BEST_DL: 'Pass Rusher of the Year', BEST_LB: 'Linebacker of the Year',
  BEST_DB: 'Defensive Back of the Year', BEST_K: 'Kicker of the Year', ALLSTAR: 'All-Star', CHAMPION: `${CHAMPIONSHIP_NAME} Champion`,
  FINAL_MVP: `${CHAMPIONSHIP_NAME} MVP`, CONF_CHAMP: 'Conference Champion',
};

/** Finish the season: awards, history, team records. */
export function closeSeason(league: League): AwardResult[] {
  const awards = computeAwards(league);
  const champ = champion(league);
  const final = league.schedule.find((g) => g.season === league.season && g.round === 4);
  const runner = final ? (final.hs > final.as ? final.away : final.home) : -1;
  const awardIds: Partial<Record<AwardKey, string>> = {};
  const awardNames: Partial<Record<AwardKey, string>> = {};
  for (const a of awards) {
    const p = league.players[a.pid];
    p.awards.push({ key: a.key, season: league.season });
    if (a.key !== 'ALLSTAR') { awardIds[a.key] = a.pid; awardNames[a.key] = `${fullName(p)} (${TEAMS[p.teamId]?.abbr ?? 'FA'})`; }
  }
  if (final?.mvp && league.players[final.mvp]) {
    const p = league.players[final.mvp];
    p.awards.push({ key: 'FINAL_MVP', season: league.season });
    awardIds.FINAL_MVP = p.id;
    awardNames.FINAL_MVP = `${fullName(p)} (${TEAMS[p.teamId]?.abbr ?? 'FA'})`;
  }
  if (champ !== undefined) {
    league.teams[champ].championships++;
    for (const id of league.teams[champ].roster) league.players[id]?.awards.push({ key: 'CHAMPION', season: league.season });
    if (runner >= 0) {
      for (const id of league.teams[runner].roster) league.players[id]?.awards.push({ key: 'CONF_CHAMP', season: league.season });
    }
  }
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  const bestRecord = recs.slice().sort((a, b) => b.w - a.w)[0]?.id ?? 0;
  league.history.push({ season: league.season, champion: champ ?? -1, runnerUp: runner, awards: awardIds, awardNames, bestRecord });
  for (const t of league.teams) {
    const r = recs[t.id];
    let result = 'Missed playoffs';
    const inPO = league.schedule.filter((g) => g.season === league.season && g.round && (g.home === t.id || g.away === t.id));
    if (inPO.length || league.seeds?.some((s) => s[0] === t.id)) {
      const lost = inPO.find((g) => (g.home === t.id ? g.hs < g.as : g.as < g.hs));
      result = champ === t.id ? 'Champion' : lost ? ['Lost Wild Card', 'Lost Divisional', 'Lost Conference', `Lost ${CHAMPIONSHIP_NAME}`][(lost.round ?? 1) - 1] : 'Playoffs';
    }
    t.history.push({ season: league.season, w: r.w, l: r.l, t: r.t, result });
    t.fanRep = Math.max(10, Math.min(99, t.fanRep + (r.w - 8.5) * 0.8 + (champ === t.id ? 8 : 0)));
  }
  if (champ !== undefined) addNews(league, { title: `${teamName(champ)} are ${CHAMPIONSHIP_NAME} champions!`, body: `Season ${league.season} ends with a title for ${TEAMS[champ].city}. MVP: ${awardNames.MVP ?? 'n/a'}.`, kind: 'award' });
  updateSeasonRecords(league);
  return awards;
}

export function teamRecordStr(league: League, tid: number): string {
  const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
  return recStr(recs[tid]);
}

export function isRegularSeasonOver(league: League): boolean {
  return league.week > REG_WEEKS || league.schedule.filter((g) => g.season === league.season && g.week >= 1 && g.week <= REG_WEEKS).every((g) => g.played);
}

export function teamGames(league: League, tid: number): Game[] {
  return league.schedule.filter((g) => g.season === league.season && (g.home === tid || g.away === tid)).sort((a, b) => a.week - b.week);
}

export function rosterOf(league: League, t: TeamState): Player[] {
  return t.roster.map((id) => league.players[id]).filter(Boolean);
}
