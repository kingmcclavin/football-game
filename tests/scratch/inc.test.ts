import { it } from 'vitest';
import { generateLeague } from '../../src/league/generate';
import { PlaySim } from '../../src/game/engine/PlaySim';
import { defenseLineup, offenseLineup } from '../../src/game/engine/lineup';
import { OFF_PLAYS, DEF_PLAYS } from '../../src/data/playbook';
import { DIFFICULTY } from '../../src/game/engine/mods';

it('inc', () => {
  const league = generateLeague(42);
  const plays = OFF_PLAYS.filter((p) => p.type === 'pass' && !p.tags.includes('special') && p.formation !== 'goalline');
  const defs = DEF_PLAYS.filter((d) => d.formation !== 'goalline');
  const rows: string[] = [];
  for (let i = 0; i < 200; i++) {
    const offPlay = plays[i % plays.length];
    const defPlay = defs[Math.floor(i / plays.length) % defs.length];
    const sim = new PlaySim({ kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1, off: offenseLineup(league, league.teams[i % 32], offPlay), def: defenseLineup(league, league.teams[(i + 7) % 32], defPlay), offPlay, defPlay, userSide: null, oppDiff: DIFFICULTY.pro, seed: 77 + i });
    sim.snap();
    let t = 0;
    let minD = 99, minZ = 0, predErr = -1, tgt = -1;
    let plan = { x: 0, y: 0 };
    while (sim.phase !== 'done' && t < 30) {
      sim.step(1 / 60); t += 1 / 60;
      for (const e of sim.drainEvents()) if (e.type === 'throw') { tgt = sim.ball.target; plan = { x: sim.ball.tx, y: sim.ball.ty }; }
      if (sim.ball.state === 'air' && tgt >= 0) {
        const r = sim.agents[tgt];
        const d = Math.hypot(r.x - sim.ball.x, r.y - sim.ball.y);
        if (d < minD) { minD = d; minZ = sim.ball.z; }
        if (Math.abs(sim.t - sim.ball.tArrive) < 0.01) predErr = Math.hypot(r.x - plan.x, r.y - plan.y);
      }
    }
    if (sim.outcome?.desc.includes('incomplete') && !sim.outcome.desc.includes('Broken') && tgt >= 0) rows.push(`${offPlay.id} ${sim.agents[tgt].slot} minD=${minD.toFixed(2)} z=${minZ.toFixed(1)} recvToPlanAtArrival=${predErr.toFixed(1)} air=${sim.airYards}`);
  }
  console.log(rows.join('\n'));
});
