import { it } from 'vitest';
import { generateLeague } from '../../src/league/generate';
import { PlaySim, runToEnd } from '../../src/game/engine/PlaySim';
import { defenseLineup, offenseLineup } from '../../src/game/engine/lineup';
import { OFF_PLAYS, DEF_PLAYS } from '../../src/data/playbook';
import { DIFFICULTY } from '../../src/game/engine/mods';

it('diag', () => {
  const league = generateLeague(42);
  const kinds = (process.env.KIND ?? 'pass');
  const plays = OFF_PLAYS.filter((p) => p.type === kinds && !p.tags.includes('special') && p.formation !== 'goalline');
  const defs = DEF_PLAYS.filter((d) => d.formation !== 'goalline');
  const cat: Record<string, number> = {};
  const byPlay: Record<string, number[]> = {};
  let tdShown = 0;
  let sackT = 0, sackN = 0, throwT = 0, throwN = 0;
  for (let i = 0; i < 200; i++) {
    const offPlay = plays[i % plays.length];
    const defPlay = defs[Math.floor(i / plays.length) % defs.length];
    const sim = new PlaySim({ kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1, off: offenseLineup(league, league.teams[i % 32], offPlay), def: defenseLineup(league, league.teams[(i + 7) % 32], defPlay), offPlay, defPlay, userSide: null, oppDiff: DIFFICULTY.pro, seed: 77 + i });
    let thrownAt = -1;
    const logs: string[] = [];
    sim.snap();
    let t = 0;
    while (sim.phase !== 'done' && t < 30) { sim.step(1 / 60); t += 1 / 60; for (const e of sim.drainEvents()) { if (e.type === 'throw' && thrownAt < 0) thrownAt = sim.t; if (process.env.TD && (e.type === 'catch' || e.type === 'miss')) { const c = sim.carrier(); const nd = c ? sim.agents.filter((a) => a.side !== c.side).map((a) => `${a.slot}:${Math.hypot(a.x - c.x, a.y - c.y).toFixed(1)}${a.readT >= 0 ? '' : '?'}`).sort().join(' ') : ''; logs.push(`${sim.t.toFixed(2)} ${e.type} at ${c?.x.toFixed(0)},${c?.y.toFixed(0)} ${nd}`); } } }
    if (process.env.TD && sim.outcome?.td && (!process.env.ONLY || offPlay.id === process.env.ONLY) && tdShown++ < 6) console.log(offPlay.id, defPlay.id, logs.join('\n'));
    const o = sim.outcome!;
    const key = o.kind === 'incomplete' ? `inc:${o.desc.includes('Broken') ? 'pbu' : o.desc.includes('Dropped') ? 'drop' : ''}${sim.whistleText}` : o.kind;
    cat[key] = (cat[key] ?? 0) + 1;
    (byPlay[offPlay.id] ??= []).push(Math.round(o.endX - 30));
    if (o.kind === 'sack') { sackT += o.duration; sackN++; }
    if (thrownAt > 0) { throwT += thrownAt; throwN++; }
  }
  console.log(cat);
  console.log('avg sack time', (sackT / sackN).toFixed(2), 'avg throw time', (throwT / throwN).toFixed(2));
  for (const k in byPlay) console.log(k, (byPlay[k].reduce((a, b) => a + b, 0) / byPlay[k].length).toFixed(1), byPlay[k].join(','));
});
