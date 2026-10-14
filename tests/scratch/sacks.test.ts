import { it } from 'vitest';
import { generateLeague } from '../../src/league/generate';
import { PlaySim } from '../../src/game/engine/PlaySim';
import { defenseLineup, offenseLineup } from '../../src/game/engine/lineup';
import { OFF_PLAYS, DEF_PLAYS } from '../../src/data/playbook';
import { DIFFICULTY } from '../../src/game/engine/mods';

it('sacks', () => {
  const league = generateLeague(42);
  const plays = OFF_PLAYS.filter((p) => p.type === 'pass' && !p.tags.includes('special') && p.formation !== 'goalline');
  const defs = DEF_PLAYS.filter((d) => d.formation !== 'goalline');
  const bySlot: Record<string, number> = {};
  const everEng: Record<string, number> = {};
  const byDef: Record<string, number> = {};
  for (let i = 0; i < 200; i++) {
    const offPlay = plays[i % plays.length];
    const defPlay = defs[Math.floor(i / plays.length) % defs.length];
    const sim = new PlaySim({ kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1, off: offenseLineup(league, league.teams[i % 32], offPlay), def: defenseLineup(league, league.teams[(i + 7) % 32], defPlay), offPlay, defPlay, userSide: null, oppDiff: DIFFICULTY.pro, seed: 77 + i });
    const engaged = new Set<number>();
    sim.snap();
    let t = 0;
    while (sim.phase !== 'done' && t < 30) { sim.step(1 / 60); t += 1 / 60; for (const a of sim.agents) if (a.side === 'def' && a.engaged >= 0) engaged.add(a.i); }
    if (sim.outcome?.kind === 'sack') {
      const s = sim.agents[sim.sackBy];
      bySlot[s.slot] = (bySlot[s.slot] ?? 0) + 1;
      everEng[engaged.has(s.i) ? 'engaged' : 'free'] = (everEng[engaged.has(s.i) ? 'engaged' : 'free'] ?? 0) + 1;
      byDef[defPlay.id] = (byDef[defPlay.id] ?? 0) + 1;
    }
  }
  console.log(bySlot, everEng, byDef);
});
