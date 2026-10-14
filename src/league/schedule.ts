import type { Game, League } from '../core/types';
import { Rng } from '../core/rng';
import { TEAMS, teamsInDiv } from '../data/teams';
import { teamRatings } from './depth';

export const REG_WEEKS = 17;
export const PRESEASON_WEEKS = 3;
export const PLAYOFF_WEEK_BASE = 100; // playoff round r => week 100 + r

type Pair = [number, number]; // [home, away]

const RR: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

/** Division ordering by last season's finish (or team strength for season one). */
function divisionOrder(league: League): number[][] {
  if (league.lastStandings && league.lastStandings.length === 8) return league.lastStandings;
  const out: number[][] = [];
  for (let c = 0; c < 2; c++)
    for (let d = 0; d < 4; d++) {
      const ids = teamsInDiv(c, d);
      ids.sort((a, b) => teamRatings(league, league.teams[b]).ovr - teamRatings(league, league.teams[a]).ovr);
      out.push(ids);
    }
  return out;
}

/**
 * Builds a 17-week regular season (each week a perfect matching of all 32
 * teams) following the modern pro formula: 6 division games, 4 vs a same-
 * conference division, 4 vs an other-conference division, 2 same-place
 * conference games and 1 same-place inter-conference game.
 */
export function buildRegularRounds(league: League, rng: Rng): Pair[][] {
  const s = league.seasonIndex;
  const D = divisionOrder(league);
  const div = (c: number, d: number) => D[c * 4 + d];
  const rounds: Pair[][] = [];
  const divRounds: Pair[][] = [];

  // 1. Division home-and-home.
  for (let leg = 0; leg < 2; leg++)
    for (let r = 0; r < 3; r++) {
      const round: Pair[] = [];
      for (let c = 0; c < 2; c++)
        for (let d = 0; d < 4; d++) {
          const t = div(c, d);
          for (const [a, b] of RR[r]) round.push(leg === 0 ? [t[a], t[b]] : [t[b], t[a]]);
        }
      divRounds.push(round);
    }

  // 2. Same-conference division rotation.
  const intraPairs = RR[s % 3];
  for (let k = 0; k < 4; k++) {
    const round: Pair[] = [];
    for (let c = 0; c < 2; c++)
      for (const [da, db] of intraPairs) {
        const A = div(c, da), B = div(c, db);
        for (let i = 0; i < 4; i++) {
          const j = (i + k) % 4;
          round.push((i + k) % 2 === 0 ? [A[i], B[j]] : [B[j], A[i]]);
        }
      }
    rounds.push(round);
  }
  // 3. Inter-conference division rotation.
  for (let k = 0; k < 4; k++) {
    const round: Pair[] = [];
    for (let d = 0; d < 4; d++) {
      const A = div(0, d), B = div(1, (d + s) % 4);
      for (let i = 0; i < 4; i++) {
        const j = (i + k) % 4;
        round.push((i + k + s) % 2 === 0 ? [A[i], B[j]] : [B[j], A[i]]);
      }
    }
    rounds.push(round);
  }
  // 4. Same-place games vs the two remaining conference divisions.
  for (let o = 1; o <= 2; o++) {
    const pairs = RR[(s + o) % 3];
    const round: Pair[] = [];
    for (let c = 0; c < 2; c++)
      for (const [da, db] of pairs) {
        const A = div(c, da), B = div(c, db);
        for (let i = 0; i < 4; i++) round.push((i + o + s) % 2 === 0 ? [A[i], B[i]] : [B[i], A[i]]);
      }
    rounds.push(round);
  }
  // 5. 17th game: same-place inter-conference.
  {
    const round: Pair[] = [];
    for (let d = 0; d < 4; d++) {
      const A = div(0, d), B = div(1, (d + s + 2) % 4);
      for (let i = 0; i < 4; i++) round.push((s + i) % 2 === 0 ? [A[i], B[i]] : [B[i], A[i]]);
    }
    rounds.push(round);
  }
  rng.shuffle(rounds);
  rng.shuffle(divRounds);
  // Interleave: open with non-division games, finish the season inside the division.
  const out: Pair[][] = [];
  const nd = rounds.slice();
  const dv = divRounds.slice();
  const pattern = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1];
  for (const p of pattern) out.push(p === 1 && dv.length ? dv.shift()! : nd.length ? nd.shift()! : dv.shift()!);
  return out;
}

export function gameId(season: number, week: number, home: number, away: number) {
  return `${season}-${week}-${home}-${away}`;
}

export function buildSchedule(league: League, rng: Rng): Game[] {
  const games: Game[] = [];
  // Preseason: random pairings, three weeks.
  for (let w = 1; w <= PRESEASON_WEEKS; w++) {
    const ids = rng.shuffle(TEAMS.map((t) => t.id));
    for (let i = 0; i < ids.length; i += 2) {
      const week = -PRESEASON_WEEKS - 1 + w; // -3, -2, -1
      games.push({ id: gameId(league.season, week, ids[i], ids[i + 1]), season: league.season, week, home: ids[i], away: ids[i + 1], hs: 0, as: 0, played: false, preseason: true });
    }
  }
  const rounds = buildRegularRounds(league, rng);
  rounds.forEach((round, wi) => {
    const week = wi + 1;
    for (const [h, a] of round) games.push({ id: gameId(league.season, week, h, a), season: league.season, week, home: h, away: a, hs: 0, as: 0, played: false });
  });
  return games;
}

export const weekLabel = (week: number) => {
  if (week < 0) return `Preseason ${week + PRESEASON_WEEKS + 1}`;
  if (week > PLAYOFF_WEEK_BASE) return ['Wild Card', 'Divisional', 'Conference Championship', 'Crown Bowl'][week - PLAYOFF_WEEK_BASE - 1];
  return `Week ${week}`;
};
