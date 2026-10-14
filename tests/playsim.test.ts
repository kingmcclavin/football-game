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
