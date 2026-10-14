import { it } from 'vitest';
import { generateLeague } from '../../src/league/generate';
import { PlaySim } from '../../src/game/engine/PlaySim';
import { defenseLineup, offenseLineup } from '../../src/game/engine/lineup';
import { OFF_PLAYS, DEF_PLAYS } from '../../src/data/playbook';
import { DIFFICULTY } from '../../src/game/engine/mods';

it('debug3', () => {
  const league = generateLeague(42);
  const offPlay = OFF_PLAYS.find((p) => p.id === (process.env.PLAY ?? 'gun_verts'))!;
  const defPlay = DEF_PLAYS.find((p) => p.id === (process.env.DEF ?? 'b_c3'))!;
  const sim = new PlaySim({ kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1, off: offenseLineup(league, league.teams[Number(process.env.OT ?? 0)], offPlay), def: defenseLineup(league, league.teams[Number(process.env.DT ?? 1)], defPlay), offPlay, defPlay, userSide: null, oppDiff: DIFFICULTY.pro, seed: Number(process.env.SEED ?? 1) });
  sim.snap();
  let t = 0;
  const slots = (process.env.SLOTS ?? 'X,Z,SL,TE1,CB1,CB2,FS,SS,WLB,MLB,SLB').split(',');
  while (sim.phase !== 'done' && t < 12) {
    sim.step(1 / 60); t += 1 / 60;
    for (const e of sim.drainEvents()) console.log(sim.t.toFixed(2), 'EV', e.type, e.text ?? '', e.type === 'throw' ? `tgt=${sim.agents[sim.ball.target]?.slot} land=${sim.ball.tx.toFixed(1)},${sim.ball.ty.toFixed(1)} arrive=${sim.ball.tArrive.toFixed(2)} v=${sim.ball.vx.toFixed(1)},${sim.ball.vy.toFixed(1)},${sim.ball.vz.toFixed(1)}` : '');
    if (Math.round(t * 60) % 15 === 0) {
      console.log(sim.t.toFixed(2), sim.ball.state, sim.agents.filter((a) => slots.includes(a.slot)).map((a) => `${a.slot}(${a.x.toFixed(0)},${a.y.toFixed(0)}${a.task.k === 'zone' ? ':' + a.task.zone : a.task.k === 'man' ? ':m' + sim.agents[a.task.target].slot : ''}${a.engaged >= 0 ? ' E' : ''})`).join(' '));
    }
  }
  console.log(sim.outcome?.desc);
});
