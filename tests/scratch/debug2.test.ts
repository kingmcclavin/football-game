import { it } from 'vitest';
import { generateLeague } from '../../src/league/generate';
import { PlaySim } from '../../src/game/engine/PlaySim';
import { defenseLineup, offenseLineup } from '../../src/game/engine/lineup';
import { OFF_PLAYS, DEF_PLAYS } from '../../src/data/playbook';
import { DIFFICULTY } from '../../src/game/engine/mods';

it('debug2', () => {
  const league = generateLeague(42);
  const offPlay = OFF_PLAYS.find((p) => p.id === (process.env.PLAY ?? 'sb_outs'))!;
  const defPlay = DEF_PLAYS.find((p) => p.id === (process.env.DEF ?? 'b_c3'))!;
  for (let seed = 1; seed <= Number(process.env.N ?? 4); seed++) {
    const sim = new PlaySim({ kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1, off: offenseLineup(league, league.teams[0], offPlay), def: defenseLineup(league, league.teams[1], defPlay), offPlay, defPlay, userSide: null, oppDiff: DIFFICULTY.pro, seed });
    sim.snap();
    let t = 0;
    let tgt = -1;
    while (sim.phase !== 'done' && t < 15) {
      sim.step(1 / 60); t += 1 / 60;
      for (const e of sim.drainEvents()) {
        if (e.type === 'throw') {
          tgt = sim.ball.target;
          const r = sim.agents[tgt];
          console.log(`seed${seed} t=${sim.t.toFixed(2)} throw to ${r?.slot} at (${r?.x.toFixed(1)},${r?.y.toFixed(1)}) land (${sim.ball.tx.toFixed(1)},${sim.ball.ty.toFixed(1)}) arrive ${sim.ball.tArrive.toFixed(2)}`);
        } else if (['catch','incomplete','deflect','int','tackle','miss','td','whistle'].includes(e.type)) {
          const r = tgt >= 0 ? sim.agents[tgt] : null;
          const near = sim.agents.filter((a) => a.side === 'def').map((a) => Math.hypot(a.x - sim.ball.x, a.y - sim.ball.y)).sort((a, b) => a - b)[0];
          console.log(`   t=${sim.t.toFixed(2)} ${e.type} ${e.text ?? ''} ball(${sim.ball.x.toFixed(1)},${sim.ball.y.toFixed(1)},${sim.ball.z.toFixed(1)}) rec(${r?.x.toFixed(1)},${r?.y.toFixed(1)}) nearestDef ${near.toFixed(1)}`);
        }
      }
    }
    console.log('  =>', sim.outcome?.desc);
  }
});
