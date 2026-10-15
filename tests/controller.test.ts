import { describe, expect, it } from 'vitest';
import { createCareer, defaultAppearance, userPlayer } from '../src/career/career';
import { GameController } from '../src/game/GameController';
import { DrillController, type DrillKind } from '../src/game/DrillController';
import { defaultSettings } from '../src/core/save';
import type { Pos } from '../src/core/types';
import type { PlaySim } from '../src/game/engine/PlaySim';

const ARCH: Record<string, string> = { QB: 'qb_pocket', RB: 'rb_power', WR: 'wr_route', CB: 'cb_man', K: 'k_power', LB: 'lb_run', OL: 'ol_pass', DE: 'de_speed', P: 'p_power', TE: 'te_receiving', S: 's_free', DT: 'dt_nose' };

function career(pos: Pos, seed: number) {
  return createCareer({ first: 'Test', last: pos, pos, archetype: ARCH[pos], num: 10, ht: 74, wt: 220, appearance: defaultAppearance(), startMode: 'established', teamChoice: 'draft', difficulty: 'pro', quarterMinutes: 3, slot: 0, seed });
}

/** Drive a live play like a (simple) human would. */
function playLive(ctl: GameController | DrillController, sim: PlaySim) {
  let t = 0;
  let thrown = false;
  while (sim.phase !== 'done' && t < 40) {
    const u = sim.user;
    if (u && u.slot === 'QB' && !thrown && sim.t > 1.6 && sim.canThrow()) {
      const qb = sim.agents[sim.qb];
      const best = sim.receivers().map((r) => ({ r, o: sim.openness(qb, r) })).sort((a, b) => b.o - a.o)[0];
      if (best) { sim.throwTo(best.r.i, best.o > 4 ? 0.5 : 0.85); thrown = true; }
      else { sim.throwAway(); thrown = true; }
    }
    if (u && sim.ball.state === 'air' && sim.ball.target === u.i && sim.ball.tArrive - sim.t < 0.3) sim.action('catch');
    const c = sim.carrier();
    if (u && c && c.side !== u.side && Math.hypot(c.x - u.x, c.y - u.y) < 2.5) sim.action('tackle');
    if (u && u.engaged >= 0) sim.action(u.side === 'def' ? 'shed' : 'punch');
    sim.step(1 / 60);
    sim.rememberTarget();
    t += 1 / 60;
  }
  expect(sim.outcome).toBeTruthy();
  (ctl as unknown as { playFinished: (o: unknown) => void }).playFinished(sim.outcome);
}

function driveGame(ctl: GameController) {
  ctl.start();
  let guard = 0;
  let userPlays = 0;
  while (ctl.mode !== 'final' && guard++ < 3000) {
    switch (ctl.mode) {
      case 'playcall': ctl.choosePlay(ctl.hud.playcall!.suggestion); break;
      case 'kickmeter': ctl.kickWith({ power: 0.85, accuracy: 0.05, aim: 0 }); break;
      case 'presnap': ctl.snap(); break;
      case 'live': userPlays++; playLive(ctl, ctl.sim!); break;
      case 'result': ctl.continueAfterResult(); break;
      case 'drive': ctl.continueFromDrive(); break;
      default: throw new Error(`unexpected mode ${ctl.mode}`);
    }
  }
  return userPlays;
}

describe('GameController (headless, full games)', () => {
  for (const pos of ['QB', 'RB', 'WR', 'CB', 'K', 'LB', 'OL', 'DE'] as Pos[]) {
    it(`plays a full game as ${pos}`, () => {
      const { league, career: c } = career(pos, 1000 + pos.charCodeAt(0));
      const p = userPlayer(league, c);
      const game = league.schedule.find((g) => g.week === -3 && (g.home === p.teamId || g.away === p.teamId))!;
      let recap = null as unknown;
      const settings = { ...defaultSettings(), autoContinue: false };
      const ctl = new GameController(league, c, game, settings, (r) => { recap = r; });
      const plays = driveGame(ctl);
      expect(ctl.g.over).toBe(true);
      expect(ctl.hud.recap).toBeTruthy();
      ctl.finish();
      expect(recap).toBeTruthy();
      expect(game.played).toBe(true);
      // box score integrity
      let passYds = 0, recYds = 0, cmp = 0, rec = 0;
      for (const id in ctl.g.box) {
        passYds += ctl.g.box[id].passYds ?? 0; recYds += ctl.g.box[id].recYds ?? 0;
        cmp += ctl.g.box[id].passCmp ?? 0; rec += ctl.g.box[id].rec ?? 0;
      }
      expect(passYds).toBe(recYds);
      expect(cmp).toBe(rec);
      expect(ctl.g.score[0] % 1).toBe(0);
      expect(plays).toBeGreaterThan(0);
      // the league advanced to the next week
      expect(league.week).toBe(-2);
    });
  }
});

describe('Drills (headless)', () => {
  const kinds: [Pos, DrillKind][] = [['QB', 'qb'], ['WR', 'wr'], ['RB', 'rb'], ['DE', 'pass_rush'], ['OL', 'ol'], ['LB', 'run_fit'], ['CB', 'coverage'], ['K', 'kick'], ['P', 'punt']];
  for (const [pos, kind] of kinds) {
    it(`runs the ${kind} drill`, () => {
      const { league, career: c } = career(pos, 77);
      let score = -1;
      const ctl = new DrillController(league, c, defaultSettings(), kind, (s) => { score = s; });
      ctl.start();
      let guard = 0;
      while (ctl.mode !== 'final' && guard++ < 100) {
        if (ctl.mode === 'kickmeter') ctl.kickWith({ power: 0.9, accuracy: 0.02, aim: 0 });
        else if (ctl.mode === 'presnap') ctl.snap();
        else if (ctl.mode === 'live') playLive(ctl, ctl.sim!);
        else if (ctl.mode === 'result') ctl.continueAfterResult();
      }
      expect(ctl.mode).toBe('final');
      ctl.finish();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(ctl.repLog.length).toBe(5);
    });
  }
});

describe('Exhibition game', () => {
  it('plays a standalone game where the user is in on every offensive snap', () => {
    const { league, career: c } = createCareer({ first: 'Exhibition', last: 'Player', pos: 'WR', archetype: 'wr_route', num: 11, ht: 74, wt: 200, appearance: defaultAppearance(), startMode: 'established', teamChoice: 3, difficulty: 'pro', quarterMinutes: 2, slot: -1, seed: 77 });
    c.role = 'BK'; // even a backup plays every snap in an exhibition
    const game = { id: 'exh-test', season: league.season, week: 1, home: 3, away: 9, hs: 0, as: 0, played: false };
    let recap = null as unknown;
    const ctl = new GameController(league, c, game, { ...defaultSettings(), autoContinue: false }, (r) => { recap = r; }, { allSnaps: true, title: 'Exhibition' });
    expect(ctl.title).toBe('Exhibition');
    const plays = driveGame(ctl);
    ctl.finish();
    expect(recap).toBeTruthy();
    expect(ctl.g.over).toBe(true);
    expect(plays).toBeGreaterThan(8);
  });
});
