// ---------------------------------------------------------------------------
// Position drills (training mini-games and the rookie combine). Reuses the
// GameController's live-play machinery with custom scenarios and scoring.
// ---------------------------------------------------------------------------
import type { Career, Game, GameRecap, League, Player, Pos, Settings } from '../core/types';
import { clamp } from '../core/util';
import { OFF_PLAYS, DEF_PLAYS, type DefSlot, type OffPlay, type OffSlot } from '../data/playbook';
import { GameController } from './GameController';
import { PlaySim, type KickParams, type SimPlayer } from './engine/PlaySim';
import { DIFFICULTY } from './engine/mods';
import { depthPlayers, kickingUnit, returnUnit, toSim } from './engine/lineup';
import type { PlayOutcome } from './engine/types';
import { TEAMS } from '../data/teams';

export type DrillKind = 'qb' | 'wr' | 'rb' | 'pass_rush' | 'ol' | 'run_fit' | 'coverage' | 'kick' | 'punt';

export const DRILL_INFO: Record<DrillKind, { name: string; desc: string }> = {
  qb: { name: 'Accuracy Under Fire', desc: 'Five live reps against a zone shell. Completions, yards and touchdowns score; sacks and picks cost you.' },
  wr: { name: 'Route & Catch', desc: 'Beat a press corner on five routes. Get open, press CATCH, and pick up yards after the catch.' },
  rb: { name: 'Gauntlet Run', desc: 'Find the crease behind your line and make defenders miss. Score on every yard gained.' },
  pass_rush: { name: 'One-on-One Rush', desc: 'Beat the tackle and get home before the quarterback throws it away. Mash SHED when engaged.' },
  ol: { name: 'Pass Pro Mirror', desc: 'Keep the rusher off your quarterback for four seconds. Punch to reset his rush.' },
  run_fit: { name: 'Run Fit', desc: 'Read the run, shed the blocker and make the tackle near the line of scrimmage.' },
  coverage: { name: 'Lockdown Coverage', desc: 'Stay in phase with the receiver and play the ball. Breakups and picks score big.' },
  kick: { name: 'Field Goal Ladder', desc: 'Kicks from 30, 38, 45, 50 and 55 yards. Nail the power and accuracy meters.' },
  punt: { name: 'Directional Punting', desc: 'Boom it for distance and hang time. Bonus points for pinning returners deep.' },
};

export function drillFor(pos: Pos): DrillKind {
  switch (pos) {
    case 'QB': return 'qb';
    case 'RB': return 'rb';
    case 'WR': case 'TE': return 'wr';
    case 'OL': return 'ol';
    case 'DE': case 'DT': return 'pass_rush';
    case 'LB': return 'run_fit';
    case 'CB': case 'S': return 'coverage';
    case 'K': return 'kick';
    case 'P': return 'punt';
  }
}

const REPS = 5;

export class DrillController extends GameController {
  kind: DrillKind;
  rep = 0;
  points = 0;
  repLog: number[] = [];
  onDone: (score: number) => void;
  isDrill = true;
  private oppTeam: number;
  private combine: boolean;

  constructor(league: League, career: Career, settings: Settings, kind: DrillKind, onDone: (score: number) => void, combine = false) {
    const p = league.players[career.playerId];
    const home = p.teamId >= 0 ? p.teamId : 0;
    const opp = (home + 7) % 32;
    const fake: Game = { id: 'drill', season: league.season, week: 0, home, away: opp, hs: 0, as: 0, played: false, preseason: true };
    super(league, career, fake, settings, () => undefined);
    this.kind = kind;
    this.oppTeam = opp;
    this.onDone = onDone;
    this.combine = combine;
  }

  get title() {
    return `${this.combine ? 'Combine: ' : ''}${DRILL_INFO[this.kind].name}`;
  }

  start() {
    this.rep = 0;
    this.points = 0;
    this.nextRep();
  }

  simToEnd() { /* not available in drills */ }

  advance() {
    this.nextRep();
  }

  continueAfterResult() {
    if (this.mode !== 'result') return;
    this.hud.banner = null;
    this.nextRep();
  }

  private userSim(): SimPlayer {
    return toSim(this.user, { pid: this.user.id, mods: this.userMods });
  }

  private mate(pos: Pos, idx = 0, teamId?: number): SimPlayer | undefined {
    const team = this.league.teams[teamId ?? this.user.teamId] ?? this.league.teams[0];
    const list = depthPlayers(this.league, team, pos).filter((p: Player) => p.id !== this.user.id);
    const p = list[idx] ?? list[0];
    return p ? toSim(p) : undefined;
  }

  private nextRep() {
    if (this.rep >= REPS) {
      this.finishDrill();
      return;
    }
    this.rep++;
    const k = this.kind;
    if (k === 'kick' || k === 'punt') {
      this.mode = 'kickmeter';
      const dist = [30, 38, 45, 50, 55][this.rep - 1];
      this.hud.kick = { kind: k === 'kick' ? 'fg' : 'punt', distance: k === 'kick' ? dist : undefined };
      this.buildDrillKick(null);
      this.emitHud({ playName: `Rep ${this.rep}/${REPS}` });
      return;
    }
    this.buildDrillSim();
    this.mode = 'presnap';
    this.emitHud({ playName: `Rep ${this.rep}/${REPS}` });
  }

  private buildDrillKick(params: KickParams | null) {
    const dist = [30, 38, 45, 50, 55][this.rep - 1];
    const kTeam = this.league.teams[this.user.teamId];
    const rTeam = this.league.teams[this.oppTeam];
    const kind = this.kind === 'kick' ? 'fg' : 'punt';
    const unit = kickingUnit(this.league, kTeam, kind, { pid: this.user.id, mods: this.userMods });
    const ret = returnUnit(this.league, rTeam, kind);
    this.sim = new PlaySim({
      kind, los: kind === 'fg' ? 117 - dist : 25 + this.rep * 4, hashY: [26.67, 23.6, 29.75, 26.67, 23.6][this.rep - 1], kicker: this.userSim(), kickTeam: unit.others, retTeam: ret,
      userSide: 'off', userRole: kind === 'fg' ? 'K' : 'P', kick: params ?? undefined, oppDiff: DIFFICULTY[this.career.difficulty], seed: this.rng.int(1, 1e9), drill: true,
    });
    this.scene?.setPlay(this.sim, { offTeam: kTeam.id, defTeam: rTeam.id, homeTeam: kTeam.id, dir: 1, userAppearance: this.career.appearance, showRoutes: false, qbView: false });
  }

  kickWith(params: KickParams) {
    this.buildDrillKick(params);
    this.hud.kick = null;
    this.mode = 'live';
    this.sim!.snap();
    this.emitHud();
  }

  private buildDrillSim() {
    const k = this.kind;
    const u = this.userSim();
    const off: Partial<Record<OffSlot, SimPlayer>> = {};
    const def: Partial<Record<DefSlot, SimPlayer>> = {};
    const opp = this.oppTeam;
    let play: OffPlay;
    let defPlay = DEF_PLAYS.find((d) => d.id === 'b_c3')!;
    const pick = (ids: string[]) => OFF_PLAYS.find((p) => p.id === ids[(this.rep - 1) % ids.length])!;
    let userSide: 'off' | 'def' = 'off';
    switch (k) {
      case 'qb':
        play = pick(['gun_slants', 'gun_curls', 'sb_outs', 'gun_mesh', 'sb_corner']);
        off.QB = u; off.X = this.mate('WR', 0); off.Z = this.mate('WR', 1); off.SL = this.mate('WR', 2); off.TE1 = this.mate('TE', 0); off.RB = this.mate('RB', 0);
        for (const s of ['LT', 'LG', 'C', 'RG', 'RT'] as OffSlot[]) off[s] = this.mate('OL', ['LT', 'LG', 'C', 'RG', 'RT'].indexOf(s));
        defPlay = DEF_PLAYS.find((d) => d.id === (this.rep % 2 ? 'b_c3' : 'b_c2'))!;
        def.LE = this.mate('DE', 0, opp); def.RE = this.mate('DE', 1, opp); def.LDT = this.mate('DT', 0, opp); def.RDT = this.mate('DT', 1, opp);
        def.CB1 = this.mate('CB', 0, opp); def.CB2 = this.mate('CB', 1, opp); def.FS = this.mate('S', 0, opp); def.SS = this.mate('S', 1, opp); def.MLB = this.mate('LB', 0, opp); def.WLB = this.mate('LB', 1, opp);
        break;
      case 'wr': {
        play = pick(['gun_slants', 'sb_outs', 'gun_curls', 'gun_post', 'gun_smash']);
        const slot: OffSlot = this.user.pos === 'TE' ? 'TE1' : 'X';
        off.QB = this.mate('QB', 0); off[slot] = u;
        for (const s of ['LT', 'LG', 'C', 'RG', 'RT'] as OffSlot[]) off[s] = this.mate('OL', ['LT', 'LG', 'C', 'RG', 'RT'].indexOf(s));
        defPlay = DEF_PLAYS.find((d) => d.id === 'b_c1')!;
        def.CB1 = this.mate(this.user.pos === 'TE' ? 'S' : 'CB', 0, opp); def.FS = this.mate('S', 0, opp);
        def.LE = this.mate('DE', 0, opp); def.RE = this.mate('DE', 1, opp);
        if (slot === 'TE1') { def.SS = this.mate('S', 1, opp); delete def.CB1; }
        break;
      }
      case 'rb':
        play = pick(['gun_iz', 'sb_stretch', 'i_power', 'sb_dive', 'i_toss']);
        off.QB = this.mate('QB', 0); off.RB = u; off.TE1 = this.mate('TE', 0); off.FB = this.mate('RB', 1);
        for (const s of ['LT', 'LG', 'C', 'RG', 'RT'] as OffSlot[]) off[s] = this.mate('OL', ['LT', 'LG', 'C', 'RG', 'RT'].indexOf(s));
        defPlay = DEF_PLAYS.find((d) => d.id === 'b_c3')!;
        def.LE = this.mate('DE', 0, opp); def.RE = this.mate('DE', 1, opp); def.LDT = this.mate('DT', 0, opp); def.RDT = this.mate('DT', 1, opp);
        def.WLB = this.mate('LB', 0, opp); def.MLB = this.mate('LB', 1, opp); def.SLB = this.mate('LB', 2, opp); def.SS = this.mate('S', 0, opp); def.FS = this.mate('S', 1, opp);
        break;
      case 'pass_rush':
        userSide = 'def';
        play = OFF_PLAYS.find((p) => p.id === 'gun_post')!;
        off.QB = this.mate('QB', 0, opp);
        if (this.user.pos === 'DT') { off.RG = this.mate('OL', 3, opp); off.C = this.mate('OL', 2, opp); }
        else off.RT = this.mate('OL', 4, opp);
        defPlay = DEF_PLAYS.find((d) => d.id === 'b_c3')!;
        def[this.user.pos === 'DT' ? 'RDT' : 'RE'] = u;
        break;
      case 'ol':
        play = OFF_PLAYS.find((p) => p.id === 'gun_post')!;
        off.QB = this.mate('QB', 0); off.LT = u;
        defPlay = DEF_PLAYS.find((d) => d.id === 'b_c3')!;
        def.LE = this.mate('DE', this.rep % 2, opp);
        if (this.rep >= 4) def.LDT = this.mate('DT', 0, opp);
        if (this.rep >= 4) off.LG = this.mate('OL', 1);
        break;
      case 'run_fit':
        userSide = 'def';
        play = pick(['sb_dive', 'gun_iz', 'i_iso', 'sb_stretch', 'p_counter']);
        off.QB = this.mate('QB', 0, opp); off.RB = this.mate('RB', 0, opp); off.LG = this.mate('OL', 1, opp); off.C = this.mate('OL', 2, opp); off.RG = this.mate('OL', 3, opp);
        if (play.formation === 'iform') off.FB = this.mate('RB', 1, opp);
        defPlay = DEF_PLAYS.find((d) => d.id === 'b_c3')!;
        def.MLB = u; def.LDT = this.mate('DT', 0); def.RDT = this.mate('DT', 1);
        break;
      case 'coverage':
      default:
        userSide = 'def';
        play = pick(['gun_slants', 'gun_curls', 'gun_post', 'sb_outs', 'gun_smash']);
        off.QB = this.mate('QB', 0, opp); off.X = this.mate('WR', 0, opp);
        for (const s of ['LT', 'LG', 'C', 'RG', 'RT'] as OffSlot[]) off[s] = this.mate('OL', ['LT', 'LG', 'C', 'RG', 'RT'].indexOf(s), opp);
        defPlay = DEF_PLAYS.find((d) => d.id === 'b_c1')!;
        def.CB1 = u; def.LE = this.mate('DE', 0); def.RE = this.mate('DE', 1);
        break;
    }
    // remove undefined entries
    for (const key of Object.keys(off) as OffSlot[]) if (!off[key]) delete off[key];
    for (const key of Object.keys(def) as DefSlot[]) if (!def[key]) delete def[key];
    this.playOff = play;
    this.playDef = defPlay;
    this.sim = new PlaySim({
      kind: 'scrimmage', los: 30, hashY: 26.67, toGo: 10, down: 1, off, def, offPlay: play, defPlay, userSide, oppDiff: DIFFICULTY[this.career.difficulty],
      seed: this.rng.int(1, 1e9), penalties: false, featureUser: 1, drill: true,
    });
    this.scene?.setPlay(this.sim, {
      offTeam: userSide === 'off' ? this.user.teamId : opp, defTeam: userSide === 'off' ? opp : this.user.teamId, homeTeam: this.user.teamId, dir: 1,
      userAppearance: this.career.appearance, showRoutes: true, qbView: k === 'qb',
    });
  }

  protected playFinished(o: PlayOutcome) {
    const sim = this.sim!;
    const gained = Math.round(o.endX - sim.los);
    const k = this.kind;
    let pts = 0;
    let title = '';
    const t = sim.t;
    switch (k) {
      case 'qb':
        if (o.kind === 'pass') { pts = 10 + Math.min(15, gained * 0.6) + (o.td ? 10 : 0); title = `Complete +${gained}`; }
        else if (o.kind === 'interception') { pts = -10; title = 'Intercepted'; }
        else if (o.kind === 'sack') { pts = -5; title = 'Sacked'; }
        else if (o.kind === 'run') { pts = Math.max(0, gained * 0.6); title = `Scramble +${gained}`; }
        else title = 'Incomplete';
        break;
      case 'wr': {
        const caught = o.kind === 'pass' && o.stats.some((s) => s.pid === this.user.id && s.key === 'rec');
        const dropped = o.stats.some((s) => s.pid === this.user.id && s.key === 'drops');
        if (caught) { pts = 14 + Math.min(16, gained * 0.5) + (o.td ? 6 : 0); title = `Catch +${gained}`; }
        else if (dropped) { pts = -5; title = 'Drop'; }
        else if (o.kind === 'interception') { pts = -6; title = 'Intercepted'; }
        else { title = o.kind === 'pass' ? 'Not your target' : 'Incomplete'; }
        break;
      }
      case 'rb':
        pts = o.td ? 30 : gained <= 0 ? -4 : Math.min(28, gained * 2.2);
        title = o.td ? 'TOUCHDOWN' : `${gained >= 0 ? '+' : ''}${gained} yards`;
        break;
      case 'pass_rush':
        if (o.kind === 'sack') { pts = clamp(32 - t * 5, 12, 30); title = `SACK in ${t.toFixed(1)}s`; }
        else { pts = 0; title = 'QB got it off'; }
        break;
      case 'ol':
        if (o.kind === 'sack') { pts = Math.round(Math.min(15, t * 4)); title = 'Sack allowed'; }
        else { pts = 25; title = 'Clean pocket!'; }
        break;
      case 'run_fit': {
        const mine = o.stats.some((s) => s.pid === this.user.id && s.key === 'tackles');
        pts = gained <= 0 ? 26 : gained <= 2 ? 20 : gained <= 5 ? 10 : 0;
        if (mine) pts += 4;
        title = `${gained <= 0 ? 'Stuffed' : `+${gained} allowed`}${mine ? ' (your tackle)' : ''}`;
        break;
      }
      case 'coverage': {
        const pbu = o.stats.some((s) => s.pid === this.user.id && s.key === 'pbu');
        if (o.kind === 'interception') { pts = 30; title = 'INTERCEPTION'; }
        else if (pbu) { pts = 24; title = 'Pass breakup'; }
        else if (o.kind === 'incomplete') { pts = 16; title = 'Incomplete'; }
        else if (o.kind === 'pass') { pts = Math.max(0, 8 - gained * 0.5); title = `Allowed ${gained}`; }
        else { pts = 10; title = 'No completion'; }
        break;
      }
      case 'kick':
        pts = o.good ? 14 + this.rep * 3 : 0;
        title = o.good ? 'GOOD!' : 'NO GOOD';
        break;
      case 'punt': {
        const gross = o.stats.find((s) => s.key === 'puntYds')?.v ?? 0;
        pts = clamp((gross - 32) * 1.3, 0, 26) + (o.endX >= 90 && !o.touchback ? 6 : 0);
        title = `${gross} yard punt`;
        break;
      }
    }
    pts = Math.round(pts);
    this.points += pts;
    this.repLog.push(pts);
    this.mode = 'result';
    this.hud.banner = { title, sub: `Rep ${this.rep}/${REPS} • ${pts >= 0 ? '+' : ''}${pts} pts • Total ${this.points}`, tone: pts >= 15 ? 'good' : pts <= 0 ? 'bad' : 'neutral' };
    this.autoT = 2;
    this.emitHud();
  }

  private finishDrill() {
    const score = clamp(Math.round((this.points / (REPS * 25)) * 100), 0, 100);
    this.mode = 'final';
    const recap = { gameId: 'drill', season: this.league.season, week: this.league.week, opp: this.oppTeam, home: true, us: 0, them: 0, line: {}, grade: score, xp: 0, trustDelta: 0, objectives: [], notes: [] } as GameRecap;
    this.hud.recap = recap;
    this.emitHud({ final: true, banner: null });
  }

  finish() {
    const score = clamp(Math.round((this.points / (REPS * 25)) * 100), 0, 100);
    this.onDone(score);
  }
}

export const opponentName = (id: number) => TEAMS[id].name;
