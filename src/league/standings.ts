import type { Game, League } from '../core/types';
import { TEAMS } from '../data/teams';
import { PLAYOFF_WEEK_BASE } from './schedule';

export interface TeamRecord {
  id: number;
  w: number; l: number; t: number;
  pf: number; pa: number;
  dw: number; dl: number; dt: number;
  cw: number; cl: number; ct: number;
  h2h: Record<number, [number, number, number]>;
  streak: string;
  home: [number, number, number];
  away: [number, number, number];
}

export const winPct = (w: number, l: number, t: number) => (w + l + t === 0 ? 0 : (w + t * 0.5) / (w + l + t));
export const recStr = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;

export function computeRecords(games: Game[]): TeamRecord[] {
  const recs: TeamRecord[] = TEAMS.map((t) => ({
    id: t.id, w: 0, l: 0, t: 0, pf: 0, pa: 0, dw: 0, dl: 0, dt: 0, cw: 0, cl: 0, ct: 0, h2h: {}, streak: '', home: [0, 0, 0], away: [0, 0, 0],
  }));
  const streaks: Record<number, string[]> = {};
  const sorted = games.filter((g) => g.played && !g.preseason && g.week > 0 && g.week < PLAYOFF_WEEK_BASE).sort((a, b) => a.week - b.week);
  for (const g of sorted) {
    const H = recs[g.home], A = recs[g.away];
    H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
    const sameDiv = TEAMS[g.home].conf === TEAMS[g.away].conf && TEAMS[g.home].div === TEAMS[g.away].div;
    const sameConf = TEAMS[g.home].conf === TEAMS[g.away].conf;
    const res = g.hs > g.as ? 0 : g.hs < g.as ? 1 : 2; // 0 home win, 1 away win, 2 tie
    const apply = (r: TeamRecord, opp: number, outcome: 'w' | 'l' | 't', home: boolean) => {
      r[outcome]++;
      const h = (r.h2h[opp] ??= [0, 0, 0]);
      const idx = outcome === 'w' ? 0 : outcome === 'l' ? 1 : 2;
      h[idx]++;
      (home ? r.home : r.away)[idx]++;
      if (sameDiv) r[(`d${outcome}`) as 'dw' | 'dl' | 'dt']++;
      if (sameConf) r[(`c${outcome}`) as 'cw' | 'cl' | 'ct']++;
      (streaks[r.id] ??= []).push(outcome.toUpperCase());
    };
    apply(H, g.away, res === 0 ? 'w' : res === 1 ? 'l' : 't', true);
    apply(A, g.home, res === 1 ? 'w' : res === 0 ? 'l' : 't', false);
  }
  for (const r of recs) {
    const s = streaks[r.id] ?? [];
    if (s.length) {
      const last = s[s.length - 1];
      let n = 0;
      for (let i = s.length - 1; i >= 0 && s[i] === last; i--) n++;
      r.streak = `${last}${n}`;
    }
  }
  return recs;
}

/** Ordered comparison using simplified pro tiebreakers. */
export function compareTeams(a: TeamRecord, b: TeamRecord, salt = 0): number {
  const pa = winPct(a.w, a.l, a.t), pb = winPct(b.w, b.l, b.t);
  if (pa !== pb) return pb - pa;
  const h = a.h2h[b.id];
  if (h && h[0] !== h[1]) return h[1] - h[0];
  const ta = TEAMS[a.id], tb = TEAMS[b.id];
  if (ta.conf === tb.conf && ta.div === tb.div) {
    const da = winPct(a.dw, a.dl, a.dt), db = winPct(b.dw, b.dl, b.dt);
    if (da !== db) return db - da;
  }
  const ca = winPct(a.cw, a.cl, a.ct), cb = winPct(b.cw, b.cl, b.ct);
  if (ca !== cb) return cb - ca;
  const pd = b.pf - b.pa - (a.pf - a.pa);
  if (pd !== 0) return pd;
  return ((a.id * 7919 + salt) % 97) - ((b.id * 7919 + salt) % 97);
}

export function divisionStandings(recs: TeamRecord[], conf: number, div: number, salt = 0): TeamRecord[] {
  return recs.filter((r) => TEAMS[r.id].conf === conf && TEAMS[r.id].div === div).sort((a, b) => compareTeams(a, b, salt));
}

/** Returns 7 seeds for a conference: 4 division winners, then 3 wild cards. */
export function conferenceSeeds(recs: TeamRecord[], conf: number, salt = 0): number[] {
  const winners: TeamRecord[] = [];
  const rest: TeamRecord[] = [];
  for (let d = 0; d < 4; d++) {
    const ds = divisionStandings(recs, conf, d, salt);
    winners.push(ds[0]);
    rest.push(...ds.slice(1));
  }
  winners.sort((a, b) => compareTeams(a, b, salt));
  rest.sort((a, b) => compareTeams(a, b, salt));
  return [...winners, ...rest.slice(0, 3)].map((r) => r.id);
}

export function leagueStandings(league: League) {
  return computeRecords(league.schedule.filter((g) => g.season === league.season));
}
