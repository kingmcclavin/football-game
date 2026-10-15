import { describe, expect, it } from 'vitest';
import { generateLeague } from '../src/league/generate';
import { PlaySim, runToEnd } from '../src/game/engine/PlaySim';
import { defenseLineup, offenseLineup, kickingUnit, returnUnit } from '../src/game/engine/lineup';
import { OFF_PLAYS, DEF_PLAYS } from '../src/data/playbook';
import { DIFFICULTY } from '../src/game/engine/mods';

const league = generateLeague(42);
const off = league.teams[0];
const def = league.teams[1];

function runPlay(playId: string, defId: string, seed: number, los = 30) {
  const offPlay = OFF_PLAYS.find((p) => p.id === playId)!;
  const defPlay = DEF_PLAYS.find((p) => p.id === defId)!;
  const sim = new PlaySim({
    kind: 'scrimmage', los, hashY: 26.67, toGo: 10, down: 1,
    off: offenseLineup(league, off, offPlay), def: defenseLineup(league, def, defPlay),
    offPlay, defPlay, userSide: null, oppDiff: DIFFICULTY.pro, seed,
  });
  return runToEnd(sim)!;
}

describe('PlaySim (AI vs AI)', () => {
  it('produces sensible pass and run distributions', () => {
    let att = 0, cmp = 0, yds = 0, ints = 0, sacks = 0, runs = 0, runYds = 0, tds = 0;
    const passPlays = OFF_PLAYS.filter((p) => p.type === 'pass' && !p.tags.includes('special') && p.formation !== 'goalline');
    const runPlays = OFF_PLAYS.filter((p) => p.type === 'run' && p.formation !== 'goalline');
    const defs = DEF_PLAYS.filter((d) => d.formation !== 'goalline');
    for (let i = 0; i < 160; i++) {
      const pp = passPlays[i % passPlays.length];
      const o = runPlay(pp.id, defs[i % defs.length].id, 1000 + i);
      expect(o).toBeTruthy();
      if (o.kind === 'sack') sacks++;
      else {
        att++;
        if (o.kind === 'pass') { cmp++; yds += o.endX - 30; }
        if (o.kind === 'interception') ints++;
      }
      if (o.td) tds++;
    }
    for (let i = 0; i < 120; i++) {
      const rp = runPlays[i % runPlays.length];
      const o = runPlay(rp.id, defs[i % defs.length].id, 5000 + i);
      runs++;
      runYds += o.endX - 30;
    }
    const cmpPct = cmp / att;
    const ypc = runYds / runs;
    console.log({ att, cmp, cmpPct: cmpPct.toFixed(2), ypa: (yds / att).toFixed(1), ints, sacks, ypc: ypc.toFixed(2), tds });
    expect(cmpPct).toBeGreaterThan(0.35);
    expect(cmpPct).toBeLessThan(0.9);
    expect(ypc).toBeGreaterThan(1.5);
    expect(ypc).toBeLessThan(12);
  });

  it('runs kicks', () => {
    const k = kickingUnit(league, off, 'fg');
    const r = returnUnit(league, def, 'fg');
    let made = 0;
    for (let i = 0; i < 40; i++) {
      const sim = new PlaySim({ kind: 'fg', los: 75, hashY: 26.67, kicker: k.kicker, kickTeam: k.others, retTeam: r, userSide: null, oppDiff: DIFFICULTY.pro, seed: i });
      const o = runToEnd(sim)!;
      expect(o.kind).toBe('fg');
      if (o.good) made++;
    }
    console.log('42-yd FG made', made, '/ 40');
    expect(made).toBeGreaterThan(20);
    const pk = kickingUnit(league, off, 'punt');
    const pr = returnUnit(league, def, 'punt');
    const nets: number[] = [];
    for (let i = 0; i < 20; i++) {
      const sim = new PlaySim({ kind: 'punt', los: 30, hashY: 26.67, kicker: pk.kicker, kickTeam: pk.others, retTeam: pr, userSide: null, oppDiff: DIFFICULTY.pro, seed: i });
      const o = runToEnd(sim)!;
      expect(o.kind).toBe('punt');
      nets.push((o.touchback ? 80 : o.endX) - 30);
    }
    console.log('punt nets', nets.join(','));
    const ko = kickingUnit(league, off, 'kickoff');
    const kr = returnUnit(league, def, 'kickoff');
    const starts: string[] = [];
    for (let i = 0; i < 20; i++) {
      const sim = new PlaySim({ kind: 'kickoff', los: 35, hashY: 26.67, kicker: ko.kicker, kickTeam: ko.others, retTeam: kr, userSide: null, oppDiff: DIFFICULTY.pro, seed: i });
      const o = runToEnd(sim)!;
      expect(o.kind).toBe('kickoff');
      starts.push(o.touchback ? 'TB' : String(Math.round(100 - o.endX)));
    }
    console.log('kickoff starts', starts.join(','));
  });
});

describe('play flipping', () => {
  it('mirrors formations and run holes', () => {
    const offPlay = OFF_PLAYS.find((p) => p.id === 'sb_stretch')!;
    const defPlay = DEF_PLAYS.find((p) => p.id === 'b_c3')!;
    const mk = (flip: boolean) => new PlaySim({
      kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1, off: offenseLineup(league, off, offPlay), def: defenseLineup(league, def, defPlay),
      offPlay, defPlay, userSide: null, oppDiff: DIFFICULTY.pro, seed: 3, flip,
    });
    const a = mk(false), b = mk(true);
    const te = (s: PlaySim) => s.agents.find((x) => x.slot === 'TE1')!;
    expect(Math.sign(te(a).y - 26.67)).toBe(-Math.sign(te(b).y - 26.67));
    const rb = (s: PlaySim) => s.agents.find((x) => x.task.k === 'runner')!;
    const ha = (rb(a).task as { holeY: number }).holeY - 26.67;
    const hb = (rb(b).task as { holeY: number }).holeY - 26.67;
    expect(ha).toBeCloseTo(-hb, 5);
  });
});

describe('PlaySim drag-to-aim passing', () => {
  it('completes passes thrown at a spot in front of the most open receiver', async () => {
    const { buildMods } = await import('../src/game/engine/mods');
    const qbId = off.depth.QB![0];
    const qbP = league.players[qbId];
    const user = { pid: qbP.id, mods: buildMods([]) };
    const passPlays = OFF_PLAYS.filter((p) => p.type === 'pass' && !p.tags.includes('special') && p.formation !== 'goalline');
    const defs = DEF_PLAYS.filter((d) => d.formation !== 'goalline');
    let att = 0, cmp = 0, ints = 0;
    for (let i = 0; i < 80; i++) {
      const offPlay = passPlays[i % passPlays.length];
      const defPlay = defs[i % defs.length];
      const sim = new PlaySim({
        kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1,
        off: offenseLineup(league, off, offPlay, user), def: defenseLineup(league, def, defPlay),
        offPlay, defPlay, userSide: 'off', oppDiff: DIFFICULTY.pro, seed: 9000 + i,
      });
      sim.snap();
      let thrown = false;
      for (let s = 0; s < 60 * 12 && sim.phase !== 'done'; s++) {
        sim.setInput({ mx: 0, my: 0, sprint: false });
        if (!thrown && sim.t > 1.6 && sim.canThrow()) {
          const qb = sim.agents[sim.qb];
          const best = sim.receivers().map((r) => ({ r, o: sim.openness(qb, r) })).sort((a, b) => b.o - a.o)[0];
          if (best) {
            const T = Math.hypot(best.r.x - qb.x, best.r.y - qb.y) / 22;
            const p = sim.predict(best.r, T);
            const air = Math.hypot(p.x - qb.x, p.y - qb.y);
            thrown = sim.throwToPoint(p.x, p.y, Math.min(1, 0.3 + (air / sim.maxThrow(qb)) * 0.75));
          }
        }
        sim.step(1 / 60);
      }
      const o = sim.outcome;
      if (!o || !thrown || o.kind === 'sack') continue;
      att++;
      if (o.kind === 'pass') cmp++;
      if (o.kind === 'interception') ints++;
    }
    console.log('drag-aim', { att, cmp, ints });
    expect(att).toBeGreaterThan(40);
    expect(cmp / att).toBeGreaterThan(0.4);
    expect(ints / att).toBeLessThan(0.2);
  });
});

describe('PlaySim arcade offense', () => {
  const mk = (playId: string, defId: string, seed: number, userPid?: string) => {
    const offPlay = OFF_PLAYS.find((p) => p.id === playId)!;
    const defPlay = DEF_PLAYS.find((p) => p.id === defId)!;
    const user = userPid ? { pid: userPid, mods: {} } : undefined;
    return new PlaySim({
      kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1,
      off: offenseLineup(league, off, offPlay, user), def: defenseLineup(league, def, defPlay),
      offPlay, defPlay, userSide: 'off', oppDiff: DIFFICULTY.pro, seed, userPasses: true, controlCarrier: true,
    });
  };
  const wr = () => off.depth.WR![0];

  it('the AI quarterback never throws on its own', () => {
    for (let i = 0; i < 12; i++) {
      const sim = mk('gun_curls', 'b_c3', 300 + i, wr());
      sim.snap();
      let threw = false;
      for (let s = 0; s < 60 * 6 && sim.phase !== 'done'; s++) {
        sim.setInput({ mx: 0, my: 0, sprint: true });
        sim.step(1 / 60);
        if (sim.drainEvents().some((e) => e.type === 'throw')) threw = true;
      }
      expect(threw).toBe(false);
    }
  });

  it('slingshot throws at the open receiver are accurate', () => {
    const passPlays = OFF_PLAYS.filter((p) => p.type === 'pass' && !p.tags.includes('special') && p.formation !== 'goalline');
    const defs = DEF_PLAYS.filter((d) => d.formation !== 'goalline');
    let att = 0, cmp = 0, ints = 0;
    for (let i = 0; i < 80; i++) {
      const sim = mk(passPlays[i % passPlays.length].id, defs[i % defs.length].id, 7000 + i, wr());
      sim.snap();
      let thrown = false;
      for (let s = 0; s < 60 * 12 && sim.phase !== 'done'; s++) {
        sim.setInput({ mx: 0, my: 0, sprint: true });
        if (!thrown && sim.t > 1.5 && sim.canThrow()) {
          const qb = sim.agents[sim.qb];
          const best = sim.receivers().map((r) => ({ r, o: sim.openness(qb, r) })).sort((a, b) => b.o - a.o)[0];
          let p = sim.predict(best.r, sim.slingTime(qb, best.r.x, best.r.y));
          p = sim.predict(best.r, sim.slingTime(qb, p.x, p.y));
          thrown = sim.throwToPoint(p.x, p.y, sim.slingPower(qb, p.x, p.y), true);
        }
        sim.step(1 / 60);
      }
      const o = sim.outcome;
      if (!o || !thrown || o.kind === 'sack') continue;
      att++;
      if (o.kind === 'pass') cmp++;
      if (o.kind === 'interception') ints++;
    }
    console.log('slingshot', { att, cmp, ints });
    expect(att).toBeGreaterThan(40);
    expect(cmp / att).toBeGreaterThan(0.6);
    expect(ints / att).toBeLessThan(0.15);
  });

  it('the user steers the ball carrier and gains yards on runs', () => {
    let yds = 0, n = 0;
    for (let i = 0; i < 30; i++) {
      const sim = mk(i % 2 ? 'gun_iz' : 'sb_stretch', 'b_c3', 900 + i, wr());
      sim.snap();
      let controlled = false;
      for (let s = 0; s < 60 * 12 && sim.phase !== 'done'; s++) {
        const c = sim.controlled();
        if (c) controlled = true;
        // steer away from the nearest defender
        let my = 0;
        if (c) {
          const near = sim.agents.filter((a) => a.side === 'def').sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
          if (near && Math.abs(near.x - c.x) < 5) my = near.y > c.y ? -1 : 1;
        }
        sim.setInput({ mx: 0, my, sprint: true });
        sim.step(1 / 60);
      }
      expect(controlled).toBe(true);
      if (sim.outcome) { yds += sim.outcome.endX - 30; n++; }
    }
    console.log('arcade run ypc', (yds / n).toFixed(2));
    expect(yds / n).toBeGreaterThan(1.5);
  });
});
