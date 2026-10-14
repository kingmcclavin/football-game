import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateLeague } from '../src/league/generate';
import { buildRegularRounds, PLAYOFF_WEEK_BASE, REG_WEEKS } from '../src/league/schedule';
import { advancePlayoffs, champion, closeSeason, seedPlayoffs, simWeek } from '../src/league/season';
import { runOffseason, startNewSeason } from '../src/league/offseason';
import { computeRecords } from '../src/league/standings';
import { ROSTER_TEMPLATE } from '../src/data/positions';
import { TEAMS } from '../src/data/teams';

function playSeason(league: ReturnType<typeof generateLeague>, rng: Rng) {
  for (let w = -3; w <= -1; w++) simWeek(league, w, rng, undefined, 4);
  league.phase = 'regular';
  for (let w = 1; w <= REG_WEEKS; w++) { league.week = w; simWeek(league, w, rng, undefined, 6); }
  league.phase = 'playoffs';
  seedPlayoffs(league);
  league.week = PLAYOFF_WEEK_BASE + 1;
  for (let i = 0; i < 6; i++) {
    simWeek(league, league.week, rng, undefined, 6);
    if (!advancePlayoffs(league)) break;
  }
}

describe('schedule', () => {
  it('builds 17 perfect-matching weeks with a valid formula', () => {
    for (let s = 0; s < 6; s++) {
      const league = generateLeague(3);
      league.seasonIndex = s;
      const rounds = buildRegularRounds(league, new Rng(s));
      expect(rounds.length).toBe(17);
      const opp: Record<number, number[]> = {};
      for (const r of rounds) {
        const seen = new Set<number>();
        expect(r.length).toBe(16);
        for (const [h, a] of r) {
          expect(seen.has(h) || seen.has(a)).toBe(false);
          seen.add(h); seen.add(a);
          (opp[h] ??= []).push(a); (opp[a] ??= []).push(h);
        }
      }
      for (const t of TEAMS) {
        const div = opp[t.id].filter((o) => TEAMS[o].conf === t.conf && TEAMS[o].div === t.div).length;
        expect(div).toBe(6);
        expect(opp[t.id].length).toBe(17);
      }
    }
  });
});

describe('multi-season league', () => {
  it('plays seasons with playoffs, awards and offseasons', () => {
    const league = generateLeague(11);
    const rng = new Rng(5);
    for (let season = 0; season < 3; season++) {
      playSeason(league, rng);
      const champ = champion(league);
      expect(champ).toBeDefined();
      const recs = computeRecords(league.schedule.filter((g) => g.season === league.season));
      const games = recs.reduce((a, r) => a + r.w + r.l + r.t, 0);
      expect(games).toBe(32 * 17);
      const playoffGames = league.schedule.filter((g) => g.season === league.season && g.round);
      expect(playoffGames.length).toBe(13);
      const awards = closeSeason(league);
      expect(awards.find((a) => a.key === 'MVP')).toBeTruthy();
      runOffseason(league, rng);
      startNewSeason(league, rng);
      for (const t of league.teams) {
        expect(t.roster.length).toBe(Object.values(ROSTER_TEMPLATE).reduce((a, b) => a + b, 0));
        for (const id of t.roster) expect(league.players[id]).toBeTruthy();
      }
    }
    expect(league.history.length).toBe(3);
    expect(league.season).toBe(2029);
  });
});
