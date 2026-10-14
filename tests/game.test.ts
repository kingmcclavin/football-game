import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/league/generate';
import { simulateGame } from '../src/game/engine/gameLoop';
import { applyOutcome, newGame } from '../src/game/engine/rules';
import type { PlayOutcome } from '../src/game/engine/types';

const base = (o: Partial<PlayOutcome>): PlayOutcome => ({ kind: 'run', endX: 0, holder: 'off', duration: 5, stats: [], desc: '', ...o });

describe('rules engine', () => {
  it('handles downs, first downs and turnover on downs', () => {
    const g = newGame(0, 1, 15, false, 0);
    applyOutcome(g, base({ kind: 'kickoff', endX: 100, holder: 'def', touchback: true }));
    expect(g.poss).toBe(1);
    expect(g.ballOn).toBe(30);
    expect(g.down).toBe(1);
    applyOutcome(g, base({ endX: 34 }));
    expect(g.down).toBe(2);
    expect(g.toGo).toBe(6);
    applyOutcome(g, base({ endX: 41 }));
    expect(g.down).toBe(1);
    expect(g.toGo).toBe(10);
    for (let i = 0; i < 4; i++) applyOutcome(g, base({ endX: 41, kind: 'incomplete', stopClock: true }));
    expect(g.poss).toBe(0);
    expect(g.ballOn).toBe(59);
  });

  it('scores touchdowns, PATs, field goals and safeties', () => {
    const g = newGame(0, 1, 15, false, 1);
    applyOutcome(g, base({ kind: 'kickoff', endX: 100, holder: 'def', touchback: true }));
    expect(g.poss).toBe(0);
    applyOutcome(g, base({ endX: 100, td: true }));
    expect(g.score).toEqual([6, 0]);
    expect(g.phase).toBe('pat');
    applyOutcome(g, base({ kind: 'xp', good: true }));
    expect(g.score).toEqual([7, 0]);
    expect(g.phase).toBe('kickoff');
    applyOutcome(g, base({ kind: 'kickoff', endX: 100, holder: 'def', touchback: true }));
    expect(g.poss).toBe(1);
    g.ballOn = 70;
    applyOutcome(g, base({ kind: 'fg', good: true }));
    expect(g.score).toEqual([7, 3]);
    applyOutcome(g, base({ kind: 'kickoff', endX: 95, holder: 'def' }));
    expect(g.poss).toBe(0);
    expect(g.ballOn).toBe(5);
    applyOutcome(g, base({ kind: 'sack', endX: -1, safety: true }));
    expect(g.score).toEqual([7, 5]);
    expect(g.phase).toBe('kickoff');
    expect(g.kickFrom).toBe(20);
    expect(g.poss).toBe(0);
  });

  it('handles interceptions and touchbacks', () => {
    const g = newGame(0, 1, 15, false, 1);
    applyOutcome(g, base({ kind: 'kickoff', endX: 100, holder: 'def', touchback: true }));
    applyOutcome(g, base({ kind: 'interception', endX: 60, holder: 'def' }));
    expect(g.poss).toBe(1);
    expect(g.ballOn).toBe(40);
    applyOutcome(g, base({ kind: 'interception', endX: 104, holder: 'def', touchback: true }));
    expect(g.poss).toBe(0);
    expect(g.ballOn).toBe(20);
  });

  it('runs the clock through quarters to the end', () => {
    const g = newGame(0, 1, 1, false, 0);
    applyOutcome(g, base({ kind: 'kickoff', endX: 100, holder: 'def', touchback: true }));
    let guard = 0;
    while (!g.over && guard++ < 500) {
      if (g.phase === 'kickoff') applyOutcome(g, base({ kind: 'kickoff', endX: 100, holder: 'def', touchback: true }));
      else applyOutcome(g, base({ endX: g.ballOn + 1, duration: 20 }));
    }
    expect(g.over).toBe(true);
    expect(g.quarter).toBeGreaterThanOrEqual(4);
  });
});

describe('full game simulation', () => {
  const league = generateLeague(7);
  it('plays complete games with consistent stats', () => {
    let totalPts = 0;
    for (let i = 0; i < 30; i++) {
      const g = simulateGame(league, i % 32, (i + 5) % 32, { seed: i + 1 });
      expect(g.over).toBe(true);
      totalPts += g.score[0] + g.score[1];
      let passYds = 0, recYds = 0, cmp = 0, rec = 0;
      for (const id in g.box) {
        passYds += g.box[id].passYds ?? 0;
        recYds += g.box[id].recYds ?? 0;
        cmp += g.box[id].passCmp ?? 0;
        rec += g.box[id].rec ?? 0;
      }
      expect(passYds).toBe(recYds);
      expect(cmp).toBe(rec);
    }
    const avg = totalPts / 30;
    console.log('avg combined points', avg.toFixed(1));
    expect(avg).toBeGreaterThan(20);
    expect(avg).toBeLessThan(75);
  });
});
