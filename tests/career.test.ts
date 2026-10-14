import { describe, expect, it } from 'vitest';
import {
  acceptOffer, applyTraining, createCareer, defaultAppearance, nextUserGame, resolveEvent, retire, runDraft, runUserOffseason,
  simEmptyWeek, simUserGame, toContractPhase, userGameThisWeek, userPlayer,
} from '../src/career/career';
import { addXp, upgradeAttr, buyAbility, trainableAttrs } from '../src/career/progression';
import { migrate, SAVE_VERSION } from '../src/core/save';
import { abilitiesFor } from '../src/data/abilities';

function opts(mode: 'rookie' | 'established', pos: 'QB' | 'WR' | 'LB' = 'QB') {
  return {
    first: 'Test', last: 'Player', pos, archetype: pos === 'QB' ? 'qb_pocket' : pos === 'WR' ? 'wr_deep' : 'lb_run', num: 12, ht: 75, wt: 220,
    appearance: defaultAppearance(), startMode: mode, teamChoice: 'draft' as const, difficulty: 'pro' as const, quarterMinutes: 5, slot: 0, seed: 99,
  };
}

function playOutSeason(league: ReturnType<typeof createCareer>['league'], career: ReturnType<typeof createCareer>['career']) {
  let guard = 0;
  while (career.phase === 'season' && guard++ < 40) {
    if (career.pendingEvent) resolveEvent(league, career, 0);
    const g = userGameThisWeek(league, career);
    if (g) simUserGame(league, career, g);
    else simEmptyWeek(league, career);
  }
}

describe('career', () => {
  it('rookie path: combine, draft, preseason and a full season', () => {
    const { league, career } = createCareer(opts('rookie'));
    expect(career.phase).toBe('combine');
    const d = runDraft(league, career, 70);
    expect(d.round).toBeGreaterThanOrEqual(1);
    const p = userPlayer(league, career);
    expect(p.teamId).toBe(d.teamId);
    expect(league.teams[d.teamId].roster).toContain(p.id);
    // begin season
    career.phase = 'season';
    expect(nextUserGame(league, career)).toBeTruthy();
    const xpBefore = career.level * 100000 + career.xp;
    const t = applyTraining(league, career, 80);
    expect(t.xp).toBeGreaterThan(0);
    playOutSeason(league, career);
    expect(career.phase).toBe('awards');
    expect(career.level * 100000 + career.xp).toBeGreaterThan(xpBefore);
    expect(career.recaps.length).toBeGreaterThan(10);
    expect(career.seasonLog.length).toBe(1);
  });

  it('established path through multiple seasons, contracts and retirement', () => {
    const { league, career } = createCareer(opts('established', 'WR'));
    expect(career.phase).toBe('season');
    const p = userPlayer(league, career);
    const startOvr = p.ovr;
    addXp(career, 20000);
    expect(career.sp).toBeGreaterThan(10);
    const attr = trainableAttrs(p)[0];
    const before = p.attrs[attr]!;
    expect(upgradeAttr(career, p, attr)).toBe(true);
    expect(p.attrs[attr]).toBe(before + 1);
    const ab = abilitiesFor('WR').find((a) => a.minLevel <= career.level && !a.req);
    expect(buyAbility(career, p, ab!.id)).toBe(true);
    expect(career.equipped).toContain(ab!.id);
    for (let s = 0; s < 3; s++) {
      playOutSeason(league, career);
      expect(career.phase).toBe('awards');
      toContractPhase(league, career);
      if (career.offers && career.offers.length) acceptOffer(league, career, 0);
      else career.phase = 'progression';
      if (career.phase === 'contract') career.phase = 'progression';
      const season = league.season;
      runUserOffseason(league, career);
      expect(league.season).toBe(season + 1);
      expect(career.phase).toBe('season');
      const me = userPlayer(league, career);
      expect(me.teamId).toBeGreaterThanOrEqual(0);
      expect(league.teams[me.teamId].roster).toContain(me.id);
    }
    expect(career.seasonLog.length).toBe(3);
    expect(userPlayer(league, career).age).toBe(26);
    expect(startOvr).toBeGreaterThan(0);
    // save format round trip
    const json = JSON.stringify({ version: SAVE_VERSION, slot: 0, updated: 1, name: 'x', career, league });
    const loaded = migrate(JSON.parse(json));
    expect(loaded.league.season).toBe(league.season);
    playOutSeason(league, career);
    retire(league, career);
    expect(career.phase).toBe('retired');
    expect(career.retiredSummary?.seasons).toBe(4);
    expect(career.retiredSummary?.tier).toBeTruthy();
  });

  it('lets a benched player request a trade', () => {
    const { league, career } = createCareer(opts('rookie', 'WR'));
    runDraft(league, career, 50);
    career.phase = 'season';
    const p = userPlayer(league, career);
    const from = p.teamId;
    career.pendingEvent = { id: 'trade_request', title: 'Trade Request?', body: '', choices: [{ label: 'Request a trade', detail: 'x', effects: { trade: true } }] };
    const msg = resolveEvent(league, career, 0);
    expect(msg).toContain('Traded');
    expect(p.teamId).not.toBe(from);
    expect(league.teams[p.teamId].roster).toContain(p.id);
    expect(league.teams[from].roster).not.toContain(p.id);
  });

  it('rejects corrupt saves', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate({ version: 1 })).toThrow();
    expect(() => migrate({ version: 99, career: {}, league: {} })).toThrow();
  });
});
