import { it } from 'vitest';
import { generateLeague } from '../../src/league/generate';
import { PlaySim } from '../../src/game/engine/PlaySim';
import { defenseLineup, offenseLineup } from '../../src/game/engine/lineup';
import { OFF_PLAYS, DEF_PLAYS } from '../../src/data/playbook';
import { DIFFICULTY } from '../../src/game/engine/mods';

it('debug pass', () => {
  const league = generateLeague(42);
  const offPlay = OFF_PLAYS.find((p) => p.id === (process.env.PLAY ?? 'gun_curls'))!;
  const defPlay = DEF_PLAYS.find((p) => p.id === (process.env.DEF ?? 'b_c3'))!;
  const sim = new PlaySim({ kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1, off: offenseLineup(league, league.teams[0], offPlay), def: defenseLineup(league, league.teams[1], defPlay), offPlay, defPlay, userSide: null, oppDiff: DIFFICULTY.pro, seed: Number(process.env.SEED ?? 3) });
  sim.snap();
  let t = 0;
  while (sim.phase !== 'done' && t < 15) {
    sim.step(1 / 60);
    t += 1 / 60;
    const ev = sim.drainEvents();
    for (const e of ev) console.log(t.toFixed(2), e.type, e.text ?? '');
    if (Math.round(t * 60) % 12 === 0 && t < 1.5) {
      console.log(t.toFixed(2), sim.agents.filter((a) => ['LT','LG','C','RG','RT','LE','LDT','RDT','RE'].includes(a.slot)).map((a) => `${a.slot}(${a.x.toFixed(1)},${a.y.toFixed(1)} e${a.engaged} s${a.shed.toFixed(2)})`).join(' '));
    }
    if (Math.round(t * 60) % 30 === 0) {
      const qb = sim.agents[sim.qb];
      const b = sim.ball;
      console.log(t.toFixed(2), 'ball', b.state, b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1), 'qb', qb.x.toFixed(1), qb.y.toFixed(1),
        sim.receivers().map((r) => `${r.slot}@${r.x.toFixed(0)},${r.y.toFixed(0)} o=${sim.openness(qb, r).toFixed(1)}`).join(' '));
    }
  }
  console.log(sim.outcome);
});
