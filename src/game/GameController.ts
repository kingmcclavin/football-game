// ---------------------------------------------------------------------------
// GameController: runs one career game. Combines the rules engine, AI coaches,
// quick sim (snaps without the user) and the real-time 3D PlaySim (the user's
// snaps), and exposes a HUD state for the React overlay.
// ---------------------------------------------------------------------------
import type { Career, Game, GameRecap, League, Player, Settings } from '../core/types';
import { Rng } from '../core/rng';
import { clamp, fmtClock } from '../core/util';
import { TEAMS } from '../data/teams';
import { isDefense } from '../data/positions';
import { DEF_FORMATIONS, DEF_PLAYS, OFF_PLAYS, playUnlockLevel, type DefPlay, type OffPlay } from '../data/playbook';
import { completeUserGame, lineText, simGrade, snapShare, userPlayer } from '../career/career';
import { PLAYOFF_WEEK_BASE } from '../league/schedule';
import { buildMods, DIFFICULTY } from './engine/mods';
import { aiNextStep, forceQuarterEnd, preSnap, quickResolve, type NextStep } from './engine/gameLoop';
import { pickDefPlay, pickOffPlay } from './engine/coachAI';
import { buildSide, type SideCtx } from './engine/quickSim';
import {
  applyOutcome, callTimeout, downLabel, fieldPosLabel, newGame, possTeam, teamOf, updateOtSudden, type GameState,
} from './engine/rules';
import { PlaySim, type KickParams, type SimAgent, type SimEvent, type KickSetup, type ScrimmageSetup } from './engine/PlaySim';
import { defenseLineup, formationUsesUser, kickingUnit, offenseLineup, pickReturner, returnUnit, type UserOnField } from './engine/lineup';
import type { PlayOutcome } from './engine/types';
import { Renderer2D, type CamMode, type AimState } from './pixel/renderer';
import { input, type ActionName } from './input/Input';
import { audio } from '../audio/audio';

export type GameMode = 'pregame' | 'playcall' | 'kickmeter' | 'presnap' | 'live' | 'result' | 'drive' | 'final';

export interface HudButton {
  id: ActionName | 'snap';
  label: string;
  key?: string;
  big?: boolean;
}

export interface HudState {
  mode: GameMode;
  home: number;
  away: number;
  score: [number, number];
  quarter: string;
  clock: string;
  down: string;
  ballOn: string;
  poss: number;
  timeouts: [number, number];
  userTeam: number;
  userOnField: boolean;
  userSide: 'off' | 'def' | null;
  playName: string;
  assignment: string;
  receivers: { idx: number; label: string; name: string; open: number }[];
  canThrow: boolean;
  buttons: HudButton[];
  banner: { title: string; sub: string; tone: 'good' | 'bad' | 'neutral' | 'score' } | null;
  ticker: string[];
  kick: { kind: 'fg' | 'xp' | 'punt' | 'kickoff'; distance?: number } | null;
  playcall: { side: 'off' | 'def'; suggestion: string; options: (OffPlay | DefPlay)[]; canChoose: boolean; reason: string; labels?: Record<string, string> } | null;
  /** Arcade offense: the user throws every pass and steers the ball carrier. */
  arcade: boolean;
  /** Opening coin toss state (pregame). */
  toss: { won: boolean; call: 'heads' | 'tails'; result: 'heads' | 'tails' } | null;
  grade: number;
  snaps: number;
  final: boolean;
  recap: GameRecap | null;
  charge: number;
  camMode: CamMode;
  isQB: boolean;
  lastPlay: string;
  twoMinute: boolean;
  matchup: string;
  playClock: number;
  canAudible: boolean;
  flip: boolean;
  summaryTitle: string;
}

const dbgLog: string[] = [];

export class GameController {
  league: League;
  career: Career;
  game: Game;
  settings: Settings;
  g: GameState;
  rng: Rng;
  sides: [SideCtx, SideCtx];
  userSideIdx: 0 | 1;
  user: Player;
  scene: Renderer2D | null = null;
  sim: PlaySim | null = null;
  step: NextStep | null = null;
  mode: GameMode = 'pregame';
  hud: HudState;
  protected subs = new Set<(h: HudState) => void>();
  protected raf = 0;
  protected last = 0;
  protected acc = 0;
  protected hudT = 0;
  protected gradeSum = 0;
  protected userSnaps = 0;
  protected notes: string[] = [];
  protected charge: { idx: number; t0: number } | null = null;
  /** Drag-to-aim passing state (field coordinates). */
  aim: AimState = { active: false, x: 0, y: 0, target: -1 };
  protected aimFrom: { cx: number; cy: number; t: number } | null = null;
  /** Arcade running: drag to steer the ball carrier. */
  protected steerFrom: { cx: number; cy: number; t: number } | null = null;
  protected steer = { mx: 0, my: 0 };
  /** The current live play uses arcade offense controls. */
  protected arcadeLive = false;
  protected toss: HudState['toss'] = null;
  protected unsub: (() => void)[] = [];
  protected autoT = -1;
  protected snapDelay = -1;
  protected playOff: OffPlay | null = null;
  protected playDef: DefPlay | null = null;
  protected onFinish: (r: GameRecap) => void;
  protected finished = false;
  protected resizeObs: ResizeObserver | null = null;
  protected userMods;
  protected preseason: boolean;
  protected flip = false;
  protected playClock = 0;
  protected runoffDone = false;
  protected readText = '';
  protected summaryTitle = '';
  protected halftimeShown = false;

  /** allSnaps: the user plays every snap their unit is on the field (exhibitions). */
  protected opts: { allSnaps?: boolean; title?: string };

  constructor(league: League, career: Career, game: Game, settings: Settings, onFinish: (r: GameRecap) => void, opts: { allSnaps?: boolean; title?: string } = {}) {
    this.opts = opts;
    this.league = league;
    this.career = career;
    this.game = game;
    this.settings = settings;
    this.onFinish = onFinish;
    this.rng = new Rng(Math.floor(Math.random() * 1e9));
    this.user = userPlayer(league, career);
    this.userSideIdx = game.home === this.user.teamId ? 0 : 1;
    this.preseason = !!game.preseason;
    this.g = newGame(game.home, game.away, career.quarterMinutes, game.week > PLAYOFF_WEEK_BASE, this.rng.chance(0.5) ? 0 : 1);
    this.sides = [buildSide(league, league.teams[game.home]), buildSide(league, league.teams[game.away])];
    const fatigueMult = 1 - career.fatigue / 900;
    this.userMods = buildMods(career.equipped);
    this.userMods.sprintSpeed = (this.userMods.sprintSpeed ?? 1) * fatigueMult;
    this.hud = this.baseHud();
  }

  // --------------------------------------------------------------------------
  protected baseHud(): HudState {
    const g = this.g;
    return {
      mode: this.mode, home: g.home, away: g.away, score: [g.score[0], g.score[1]],
      quarter: g.quarter > 4 ? `OT${g.quarter > 5 ? g.quarter - 4 : ''}` : `Q${g.quarter}`,
      clock: fmtClock(g.clock), down: downLabel(g), ballOn: g.phase === 'play' ? fieldPosLabel(g) : '', poss: possTeam(g), timeouts: [g.timeouts[0], g.timeouts[1]],
      userTeam: this.user.teamId, userOnField: !!this.sim?.user, userSide: this.sim?.user ? this.sim.user.side : null,
      playName: this.playOff?.name ?? this.playDef?.name ?? '', assignment: '', receivers: [], canThrow: false, buttons: [], banner: null, ticker: [], kick: null,
      playcall: null, arcade: this.arcadeLive, toss: this.toss, grade: this.liveGrade(), snaps: this.userSnaps, final: g.over, recap: null, charge: 0, camMode: this.scene?.camMode ?? (this.settings.camera as CamMode),
      isQB: this.user.pos === 'QB', lastPlay: g.log[g.log.length - 1]?.text ?? '', twoMinute: (g.quarter === 2 || g.quarter === 4) && g.clock <= 120,
      matchup: `${TEAMS[g.away].abbr} @ ${TEAMS[g.home].abbr}`,
      playClock: Math.ceil(this.playClock), canAudible: this.canAudible(), flip: this.flip, summaryTitle: this.summaryTitle,
    };
  }

  subscribe(fn: (h: HudState) => void) {
    this.subs.add(fn);
    fn(this.hud);
    return () => this.subs.delete(fn);
  }

  protected emitHud(patch: Partial<HudState> = {}) {
    const keep = { banner: this.hud.banner, ticker: this.hud.ticker, playcall: this.hud.playcall, kick: this.hud.kick, recap: this.hud.recap };
    this.hud = { ...this.baseHud(), ...keep, ...this.liveHud(), ...patch, mode: this.mode };
    this.subs.forEach((s) => s(this.hud));
  }

  protected liveGrade() {
    return this.userSnaps ? clamp(Math.round(62 + (this.gradeSum / this.userSnaps) * 11), 0, 100) : 0;
  }

  // --------------------------------------------------------------------------
  mount(canvas: HTMLCanvasElement) {
    this.scene = new Renderer2D(canvas, this.game.home, this.settings.graphics);
    this.scene.camMode = this.settings.camera as CamMode;
    const resize = () => {
      const r = canvas.parentElement!.getBoundingClientRect();
      this.scene?.resize(r.width, r.height);
    };
    resize();
    this.resizeObs = new ResizeObserver(resize);
    this.resizeObs.observe(canvas.parentElement!);
    input.attach();
    input.keyMap = { ...this.settings.keys };
    this.unsub.push(input.onAction((a) => this.onAction(a)));
    this.unsub.push(input.onReceiver((i, ph) => this.onReceiver(i, ph)));
    audio.setVolume(this.settings.volume, this.settings.sound, this.settings.music);
    audio.unlock();
    audio.startCrowd();
    // Build an idle formation for the pregame backdrop
    this.buildIdleSim();
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (document.hidden) return;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
    this.updateScoreboard();
    this.emitHud();
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    this.unsub.forEach((u) => u());
    this.unsub = [];
    input.detach();
    audio.stopCrowd();
    this.resizeObs?.disconnect();
    this.scene?.dispose();
    this.scene = null;
  }

  protected buildIdleSim() {
    const off = this.league.teams[this.game.home];
    const def = this.league.teams[this.game.away];
    const play = OFF_PLAYS[0], dplay = DEF_PLAYS[0];
    const sim = new PlaySim({
      kind: 'scrimmage', los: 35, hashY: 26.67, toGo: 10, down: 1, off: offenseLineup(this.league, off, play), def: defenseLineup(this.league, def, dplay),
      offPlay: play, defPlay: dplay, userSide: null, oppDiff: DIFFICULTY.pro, seed: 1,
    });
    this.sim = sim;
    this.scene?.setPlay(sim, { offTeam: off.id, defTeam: def.id, homeTeam: this.game.home, dir: 1, showRoutes: false, qbView: false });
  }

  // --------------------------------------------------------------------------
  /** Start the game from the pregame screen. */
  start() {
    audio.unlock();
    audio.whistle();
    this.advance();
  }

  /** Opening coin toss. Returns whether the user's call was right. */
  coinToss(call: 'heads' | 'tails'): boolean {
    const result: 'heads' | 'tails' = this.rng.chance(0.5) ? 'heads' : 'tails';
    const won = result === call;
    this.toss = { won, call, result };
    audio.click();
    // The opponent always elects to receive when it wins the toss.
    if (!won) this.setOpeningKicker(this.userSideIdx);
    this.emitHud();
    return won;
  }

  /** After winning the toss: receive (true) or kick (false). */
  chooseOpening(receive: boolean) {
    this.setOpeningKicker(receive ? ((1 - this.userSideIdx) as 0 | 1) : this.userSideIdx);
    this.start();
  }

  protected setOpeningKicker(side: 0 | 1) {
    const g = this.g;
    g.openingKicker = side;
    g.poss = side;
    g.drive.team = side === 0 ? 1 : 0;
  }

  /** Simulate the rest of the game (quick sim, user's stats still count). */
  simToEnd() {
    this.sim = null;
    const g = this.g;
    let guard = 0;
    while (!g.over && guard++ < 800) {
      const step = aiNextStep(this.rng, g, this.sides);
      preSnap(g, step);
      if (g.clock <= 0 && g.phase === 'play') { forceQuarterEnd(g); continue; }
      applyOutcome(g, quickResolve(this.rng, g, this.sides, step));
      updateOtSudden(g);
    }
    this.notes.push('Simulated part of the game');
    this.finishGame();
  }

  callTimeout() {
    if (callTimeout(this.g, this.userSideIdx)) {
      this.emitHud({ banner: { title: 'Timeout', sub: `${TEAMS[this.user.teamId].name} stop the clock`, tone: 'neutral' } });
    }
  }

  setCamera(m: CamMode) {
    if (this.scene) this.scene.camMode = m;
    this.emitHud();
  }

  cycleCamera() {
    const order: CamMode[] = ['broadcast', 'chase', 'wide'];
    const cur = this.scene?.camMode ?? 'broadcast';
    this.setCamera(order[(order.indexOf(cur) + 1) % order.length]);
  }

  // --------------------------------------------------------------------------
  /** Decide what happens next; quick-sim until the user is involved. */
  advance() {
    const g = this.g;
    const ticker: string[] = [];
    let guard = 0;
    this.hud.banner = null;
    while (!g.over && guard++ < 600) {
      if (g.quarter >= 3 && !this.halftimeShown && !this.isDrill) {
        this.halftimeShown = true;
        const me = g.box[this.user.id];
        const lines = [...ticker.slice(-6), `HALFTIME — ${TEAMS[g.away].abbr} ${g.score[1]}, ${TEAMS[g.home].abbr} ${g.score[0]}`];
        if (me) lines.push(`Your first half: ${lineText(this.user.pos, me)}`);
        lines.push(`Snaps played: ${this.userSnaps} • Grade so far: ${this.liveGrade() || '—'}`);
        this.summaryTitle = 'Halftime';
        this.step = null;
        this.mode = 'drive';
        this.hud.ticker = lines;
        this.autoT = -1;
        this.updateScoreboard();
        this.emitHud();
        return;
      }
      const step = aiNextStep(this.rng, g, this.sides);
      const involve = this.userInvolvement(step);
      if (involve) {
        if (ticker.length >= 2 || ticker.some((t) => t.startsWith('\u2605'))) {
          // show what happened while the user was off the field first
          this.step = null;
          this.mode = 'drive';
          this.summaryTitle = 'While you were on the sideline';
          this.hud.ticker = ticker.slice(-10);
          this.autoT = this.settings.autoContinue ? 3.2 : -1;
          this.updateScoreboard();
          this.emitHud();
          return;
        }
        this.setupUserStep(step);
        return;
      }
      preSnap(g, step);
      if (g.clock <= 0 && g.phase === 'play') { forceQuarterEnd(g); continue; }
      const sides = this.sidesFor(false);
      const before = [g.score[0], g.score[1]];
      const o = quickResolve(this.rng, g, sides, step);
      applyOutcome(g, o);
      updateOtSudden(g);
      const scored = g.score[0] !== before[0] || g.score[1] !== before[1];
      const q = g.log[g.log.length - 1];
      if (q) ticker.push(`${scored ? '★ ' : ''}${TEAMS[q.poss]?.abbr ?? ''} ${q.text}`);
    }
    if (g.over) {
      this.hud.ticker = ticker.slice(-10);
      this.finishGame();
    }
  }

  /** Continue from the drive summary. */
  continueFromDrive() {
    this.hud.ticker = [];
    if (this.summaryTitle === 'Halftime') { this.summaryTitle = ''; this.advance(); return; }
    const step = aiNextStep(this.rng, this.g, this.sides);
    if (this.userInvolvement(step)) this.setupUserStep(step);
    else this.advance();
  }

  protected sidesFor(userIn: boolean): [SideCtx, SideCtx] {
    if (userIn) return this.sides;
    const s: [SideCtx, SideCtx] = [this.sides[0], this.sides[1]];
    s[this.userSideIdx] = buildSide(this.league, this.league.teams[this.user.teamId], this.user.id);
    return s;
  }

  /** Is the user's player on the field for this step? */
  protected userInvolvement(step: NextStep): boolean {
    const g = this.g;
    const u = this.user;
    const userPoss = g.poss === this.userSideIdx;
    const role = this.career.role;
    if (role === 'PS' && !this.preseason && !this.opts.allSnaps) return false;
    const diff = g.score[this.userSideIdx] - g.score[1 - this.userSideIdx];
    let share = snapShare(role, this.preseason);
    if (g.quarter >= 4 && Math.abs(diff) >= 21) share = role === 'ST' ? 0.4 : 1;
    if (this.opts.allSnaps) share = 1;
    if (step.kind === 'kickoff' || step.kind === 'punt') {
      if (userPoss) return (step.kind === 'kickoff' ? u.pos === 'K' : u.pos === 'P');
      const team = this.league.teams[u.teamId];
      const ret = pickReturner(this.league, team);
      return !!ret && ret.id === u.id;
    }
    if (step.kind === 'fg' || step.kind === 'xp') return userPoss && u.pos === 'K';
    if (step.kind === 'kneel' || step.kind === 'spike') return false;
    if (u.pos === 'K' || u.pos === 'P') return false;
    const offense = userPoss;
    if (offense === isDefense(u.pos)) return false;
    const play = step.kind === 'play' || step.kind === 'twopt' ? step : null;
    if (!play) return false;
    if (offense && !formationUsesUser(u.pos, play.play)) return false;
    if (!offense && !formationUsesUser(u.pos, undefined, play.defPlay)) return false;
    return this.rng.chance(share);
  }

  protected setupUserStep(step: NextStep) {
    this.step = step;
    this.runoffDone = false;
    this.flip = false;
    const g = this.g;
    const u = this.user;
    this.hud.banner = null;
    if (step.kind === 'play' || step.kind === 'twopt') {
      const userOff = g.poss === this.userSideIdx;
      this.playOff = step.play;
      this.playDef = step.defPlay;
      const trust = this.career.trust;
      if (userOff && this.arcadeEligible()) {
        this.mode = 'playcall';
        const { options, labels } = this.arcadeCalls(step.play);
        this.hud.playcall = { side: 'off', suggestion: step.play.id, options, canChoose: true, reason: `${downLabel(g)} at ${fieldPosLabel(g)} • pick a call`, labels };
      } else if (userOff && u.pos === 'QB') {
        this.mode = 'playcall';
        const pool = this.qbPlayPool(trust);
        this.hud.playcall = { side: 'off', suggestion: step.play.id, options: pool, canChoose: true, reason: trust >= 60 ? 'Full playbook access' : `Coach trust ${Math.round(trust)}: limited to the coordinator's call sheet` };
      } else if (trust >= 70) {
        this.mode = 'playcall';
        const options = userOff
          ? OFF_PLAYS.filter((p) => formationUsesUser(u.pos, p) && this.unlocked(p) && !p.tags.includes('special') && (p.formation !== 'goalline' || g.ballOn > 90))
          : DEF_PLAYS.filter((d) => formationUsesUser(u.pos, undefined, d) && (!d.tags.includes('goal') || g.ballOn > 90));
        this.hud.playcall = { side: userOff ? 'off' : 'def', suggestion: userOff ? step.play.id : step.defPlay.id, options, canChoose: true, reason: 'High coach trust: you can request the call' };
      } else {
        this.hud.playcall = null;
        this.beginPresnap();
        return;
      }
      this.emitHud();
      return;
    }
    if (step.kind === 'fg' || step.kind === 'xp' || step.kind === 'kickoff' || step.kind === 'punt') {
      const userKicking = g.poss === this.userSideIdx;
      if (userKicking) {
        this.mode = 'kickmeter';
        this.hud.kick = { kind: step.kind, distance: step.kind === 'fg' ? Math.round(100 - g.ballOn + 17) : step.kind === 'xp' ? 33 : undefined };
        this.buildKickSim(step.kind, null);
        this.emitHud();
        return;
      }
      // user returns the kick
      this.buildKickSim(step.kind, null);
      this.mode = 'presnap';
      this.snapDelay = 1.0;
      this.emitHud();
    }
  }

  protected qbPlayPool(trust: number): OffPlay[] {
    const g = this.g;
    const all = OFF_PLAYS.filter((p) => (p.formation !== 'goalline' || g.ballOn >= 90 || g.toGo <= 1) && (!p.tags.includes('special') || g.clock < 30));
    if (trust >= 60) return all.filter((p) => this.unlocked(p) || p.id === this.playOff?.id);
    // Coordinator's call sheet: suggestion + 5 situational plays
    const side = this.sides[this.userSideIdx];
    const set = new Map<string, OffPlay>();
    if (this.playOff) set.set(this.playOff.id, this.playOff);
    let guard = 0;
    while (set.size < 6 && guard++ < 40) {
      const p = pickOffPlay(this.rng, g, side);
      set.set(p.id, p);
    }
    return Array.from(set.values());
  }

  /** Offensive careers play every one of their offensive snaps arcade-style. */
  protected arcadeEligible(): boolean {
    return !this.isDrill && ['QB', 'RB', 'WR', 'TE'].includes(this.user.pos);
  }

  /** A short arcade call sheet: one play per call type, picked from the unlocked playbook. */
  protected arcadeCalls(coach: OffPlay): { options: OffPlay[]; labels: Record<string, string> } {
    const g = this.g;
    const u = this.user;
    const goal = g.ballOn >= 90 || g.toGo <= 1;
    const style = (p: OffPlay) => { const a = p.carrier ? p.assign[p.carrier] : undefined; return a && a.kind === 'run' ? a.style : ''; };
    const base = OFF_PLAYS.filter((p) => formationUsesUser(u.pos, p) && this.unlocked(p) && (!p.tags.includes('special') || g.clock < 30) && (p.formation !== 'goalline' || goal));
    const cats: [string, (p: OffPlay) => boolean][] = [
      ['Quick Pass', (p) => p.type === 'pass' && p.tags.includes('short') && !p.tags.includes('screen') && !p.tags.includes('pa')],
      ['Deep Shot', (p) => p.type === 'pass' && p.tags.includes('deep') && !p.tags.includes('pa')],
      ['Play Action', (p) => p.tags.includes('pa')],
      ['Screen', (p) => p.tags.includes('screen')],
      ['Run Inside', (p) => p.type === 'run' && style(p) !== 'outside'],
      ['Run Outside', (p) => p.type === 'run' && style(p) === 'outside'],
    ];
    if (g.clock < 30 && g.quarter % 2 === 0) cats.push(['Hail Mary', (p) => p.tags.includes('special')]);
    const options: OffPlay[] = [];
    const labels: Record<string, string> = {};
    for (const [label, f] of cats) {
      const pool = base.filter((p) => f(p) && !options.includes(p));
      if (!pool.length) continue;
      const p = goal ? (pool.find((x) => x.formation === 'goalline') ?? this.rng.pick(pool)) : this.rng.pick(pool);
      options.push(p);
      labels[p.id] = label;
    }
    if (!options.includes(coach)) { options.unshift(coach); labels[coach.id] = "Coach's Call"; }
    return { options, labels };
  }

  /** Plays unlock for the user's own calls as their career level rises. */
  protected unlocked(p: OffPlay): boolean {
    return this.isDrill || this.career.level >= playUnlockLevel(p.id);
  }

  /** Toggle mirroring of the next play. */
  toggleFlip() {
    this.flip = !this.flip;
    this.emitHud();
  }

  protected canAudible(): boolean {
    if (this.mode !== 'presnap' || !this.sim?.user || this.sim.kind !== 'scrimmage' || this.isDrill) return false;
    const u = this.sim.user;
    if (u.side === 'off' && u.slot === 'QB') return this.career.trust >= 60;
    return this.career.trust >= 75;
  }

  /** Change the play at the line of scrimmage (trust-gated). */
  audible() {
    if (!this.canAudible() || !this.step || (this.step.kind !== 'play' && this.step.kind !== 'twopt')) return;
    const g = this.g;
    const userOff = g.poss === this.userSideIdx;
    const u = this.user;
    const options = userOff
      ? OFF_PLAYS.filter((p) => formationUsesUser(u.pos, p) && this.unlocked(p) && (!p.tags.includes('special') || g.clock < 30) && (p.formation !== 'goalline' || g.ballOn >= 90 || g.toGo <= 1))
      : DEF_PLAYS.filter((d) => formationUsesUser(u.pos, undefined, d));
    this.mode = 'playcall';
    this.hud.playcall = { side: userOff ? 'off' : 'def', suggestion: userOff ? this.step.play.id : this.step.defPlay.id, options, canChoose: true, reason: 'Audible: change the call at the line' };
    this.emitHud();
  }

  /** User picked a play from the play-call screen. */
  choosePlay(id: string) {
    const g = this.g;
    if (!this.step || (this.step.kind !== 'play' && this.step.kind !== 'twopt')) return;
    const off = OFF_PLAYS.find((p) => p.id === id);
    const def = DEF_PLAYS.find((p) => p.id === id);
    if (off) this.step.play = off;
    if (def) this.step.defPlay = def;
    // the AI defense reacts to the user's offensive call (not to the exact play)
    if (off && g.poss === this.userSideIdx && this.rng.chance(0.3)) this.step.defPlay = pickDefPlay(this.rng, g, this.sides[1 - this.userSideIdx]);
    this.playOff = this.step.play;
    this.playDef = this.step.defPlay;
    this.hud.playcall = null;
    audio.click();
    this.beginPresnap();
  }

  protected beginPresnap() {
    const step = this.step;
    if (!step || (step.kind !== 'play' && step.kind !== 'twopt')) return;
    if (!this.runoffDone) preSnap(this.g, step);
    this.runoffDone = true;
    if (this.g.clock <= 0 && this.g.phase === 'play') {
      forceQuarterEnd(this.g);
      this.advance();
      return;
    }
    this.buildScrimmageSim(step.play, step.defPlay, step.kind === 'twopt');
    this.mode = 'presnap';
    const userOff = this.g.poss === this.userSideIdx;
    this.snapDelay = -1;
    this.playClock = userOff && this.user.pos === 'QB' && !this.isDrill && !this.arcadeLive ? 25 : 0;
    this.readText = this.defenseRead();
    this.updateScoreboard();
    this.emitHud();
  }

  protected dirFor(offSide: 0 | 1): 1 | -1 {
    if (!this.isDrill) return offSide === this.userSideIdx ? 1 : -1;
    const homeDir: 1 | -1 = this.g.quarter > 4 ? 1 : this.g.quarter % 2 === 1 ? 1 : -1;
    return offSide === 0 ? homeDir : (homeDir === 1 ? -1 : 1);
  }

  protected userOnField(): UserOnField {
    return { pid: this.user.id, mods: this.userMods, olSlot: this.career.olSlot };
  }

  protected buildScrimmageSim(play: OffPlay, defPlay: DefPlay, twoPoint: boolean) {
    const g = this.g;
    const offTeam = this.league.teams[possTeam(g)];
    const defTeam = this.league.teams[teamOf(g, (1 - g.poss) as 0 | 1)];
    const userOff = g.poss === this.userSideIdx;
    const uof = this.userOnField();
    const setup: ScrimmageSetup = {
      kind: 'scrimmage', los: g.ballOn, hashY: g.hashY, toGo: g.toGo, down: g.down,
      off: offenseLineup(this.league, offTeam, play, userOff ? uof : undefined, true),
      def: defenseLineup(this.league, defTeam, defPlay, userOff ? undefined : uof, true),
      offPlay: play, defPlay, userSide: userOff ? 'off' : 'def', oppDiff: DIFFICULTY[this.career.difficulty], seed: this.rng.int(1, 1e9),
      twoPoint, penalties: !twoPoint, featureUser: 0.5 + this.career.trust / 200, flip: this.flip,
      userPasses: userOff && this.arcadeEligible(), controlCarrier: userOff && this.arcadeEligible(),
    };
    this.arcadeLive = !!setup.controlCarrier;
    this.aimCancel();
    this.sim = new PlaySim(setup);
    if (this.scene) this.scene.arcade = this.arcadeLive;
    this.scene?.setPlay(this.sim, {
      offTeam: offTeam.id, defTeam: defTeam.id, homeTeam: this.game.home, dir: this.dirFor(g.poss), userAppearance: this.career.appearance,
      userUniform: this.career.uniform === 'alt' ? 'alt' : 'home', showRoutes: true, qbView: userOff && this.user.pos === 'QB',
    });
  }

  protected buildKickSim(kind: 'fg' | 'xp' | 'punt' | 'kickoff', params: KickParams | null) {
    const g = this.g;
    const kTeam = this.league.teams[possTeam(g)];
    const rTeam = this.league.teams[teamOf(g, (1 - g.poss) as 0 | 1)];
    const userKicking = g.poss === this.userSideIdx;
    const uof = this.userOnField();
    const unit = kickingUnit(this.league, kTeam, kind === 'xp' ? 'fg' : kind, userKicking ? uof : undefined);
    const userReturner = !userKicking && (kind === 'punt' || kind === 'kickoff');
    const ret = returnUnit(this.league, rTeam, kind === 'xp' ? 'fg' : kind, userReturner ? uof : undefined, userReturner);
    const los = kind === 'kickoff' ? g.kickFrom : kind === 'xp' ? 85 : g.ballOn;
    const setup: KickSetup = {
      kind, los, hashY: kind === 'kickoff' ? 26.67 : g.hashY, kicker: unit.kicker, kickTeam: unit.others, retTeam: ret,
      userSide: userKicking ? 'off' : 'def', userRole: userKicking ? (kind === 'punt' ? 'P' : 'K') : kind === 'punt' ? 'PR' : 'KR',
      kick: params ?? undefined, oppDiff: DIFFICULTY[this.career.difficulty], seed: this.rng.int(1, 1e9),
      wind: { x: this.rng.normal(0, 1.2), y: this.rng.normal(0, 1.2) },
    };
    this.sim = new PlaySim(setup);
    this.scene?.setPlay(this.sim, {
      offTeam: kTeam.id, defTeam: rTeam.id, homeTeam: this.game.home, dir: this.dirFor(g.poss), userAppearance: this.career.appearance,
      userUniform: this.career.uniform === 'alt' ? 'alt' : 'home', showRoutes: false, qbView: false,
    });
  }

  /** Kick meter finished. */
  kickWith(params: KickParams) {
    const step = this.step;
    if (!step || !(step.kind === 'fg' || step.kind === 'xp' || step.kind === 'punt' || step.kind === 'kickoff')) return;
    if (step.kind !== 'kickoff' && step.kind !== 'xp') preSnap(this.g, step);
    this.buildKickSim(step.kind, params);
    this.hud.kick = null;
    this.mode = 'live';
    this.sim!.snap();
    audio.snap();
    this.emitHud();
  }

  snap() {
    if (this.mode !== 'presnap' || !this.sim) return;
    this.sim.snap();
    this.mode = 'live';
    audio.snap();
    this.scene?.clearRoutes();
    this.emitHud();
  }

  // --------------------------------------------------------------------------
  protected onAction(a: ActionName) {
    if (a === 'pause') return;
    if (a === 'camera') { this.cycleCamera(); return; }
    if (this.mode === 'presnap' && (a === 'snap' || a === 'action')) { this.snap(); return; }
    if (this.mode === 'result' && (a === 'snap' || a === 'action')) { this.continueAfterResult(); return; }
    if (this.mode === 'drive' && (a === 'snap' || a === 'action')) { this.continueFromDrive(); return; }
    if (this.mode !== 'live' || !this.sim) return;
    const sim = this.sim;
    const u = sim.user;
    if (!u) return;
    if (a === 'throwAway') { sim.throwAway(); return; }
    if (a === 'action' || a === 'snap') {
      const ctx = this.context();
      if (ctx === 'defender') sim.action(u.engaged >= 0 ? 'shed' : 'tackle');
      else if (ctx === 'receiver') sim.action('catch');
      else if (ctx === 'blocker') sim.action('punch');
      else if (ctx === 'returner') sim.action('fair');
      else if (ctx === 'carrier') sim.action('stiff');
      return;
    }
    sim.action(a);
  }

  protected onReceiver(idx: number, phase: 'down' | 'up') {
    if (this.mode !== 'live' || !this.sim) return;
    const recs = this.sim.receivers();
    const r = recs[idx];
    if (!r) return;
    if (phase === 'down') {
      if (!this.sim.canThrow()) return;
      this.charge = { idx, t0: performance.now() };
    } else if (this.charge && this.charge.idx === idx) {
      const held = (performance.now() - this.charge.t0) / 1000;
      const power = clamp(0.25 + held / 0.6, 0.25, 1);
      const mv = this.fieldMove();
      this.sim.throwTo(r.i, power, mv.x * 0.6, mv.y * 0.6);
      this.charge = null;
    }
  }

  /** Throw immediately (tap-to-throw from the HUD). */
  quickThrow(idx: number, power: number) {
    if (!this.sim || this.mode !== 'live') return;
    const r = this.sim.receivers()[idx];
    if (!r || !this.sim.canThrow()) return;
    const mv = this.fieldMove();
    this.sim.throwTo(r.i, power, mv.x * 0.6, mv.y * 0.6);
  }

  protected fieldMove(): { x: number; y: number; sprint: boolean } {
    const raw = input.move();
    const sens = this.settings.stickSensitivity || 1;
    let mx = raw.x * sens, my = raw.y * sens;
    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    if (!this.scene) return { x: my, y: -mx, sprint: raw.sprint };
    const b = this.scene.cameraFieldBasis();
    return { x: b.fx * my + b.rx * mx, y: b.fy * my + b.ry * mx, sprint: raw.sprint };
  }

  /** True when the user is the quarterback and can throw right now. */
  canAim(): boolean {
    return !!this.sim && this.mode === 'live' && this.sim.canThrow() && (this.arcadeLive || (!!this.sim.user && this.sim.user.slot === 'QB'));
  }

  /** Drag-to-aim: press anywhere on the field. Client (CSS) coordinates. */
  aimBegin(cx: number, cy: number): boolean {
    if (!this.canAim()) {
      if (this.arcadeLive && this.mode === 'live' && this.sim?.controlled()) {
        this.steerFrom = { cx, cy, t: performance.now() };
        return true;
      }
      return false;
    }
    this.aimFrom = { cx, cy, t: performance.now() };
    this.aim = { active: false, x: 0, y: 0, target: -1 };
    return true;
  }

  aimMove(cx: number, cy: number) {
    const sim = this.sim;
    if (this.steerFrom && this.scene) {
      const d = this.scene.deltaToField(cx - this.steerFrom.cx, cy - this.steerFrom.cy);
      const sens = this.settings.stickSensitivity || 1;
      this.steer = { mx: clamp((d.dx / 7) * sens, -1, 1), my: clamp((d.dy / 5) * sens, -1, 1) };
      return;
    }
    if (!this.aimFrom || !sim || !this.scene) return;
    if (!this.canAim()) { this.aimCancel(); return; }
    const dx = cx - this.aimFrom.cx, dy = cy - this.aimFrom.cy;
    if (Math.hypot(dx, dy) < 10) { this.aim.active = false; return; }
    const qb = sim.agents[sim.qb];
    const sling = this.settings.passScheme === 'sling';
    const k = (sling ? 1.7 : 2.2) * (this.settings.aimSensitivity || 1);
    const d = this.scene.deltaToField(dx * k, dy * k);
    // Slingshot: pull back away from the target. Drag scheme: drag toward it.
    let ax = sling ? qb.x - d.dx : qb.x + d.dx, ay = sling ? qb.y - d.dy : qb.y + d.dy;
    const maxD = sim.maxThrow(qb);
    const len = Math.hypot(ax - qb.x, ay - qb.y);
    if (len > maxD) { ax = qb.x + ((ax - qb.x) / len) * maxD; ay = qb.y + ((ay - qb.y) / len) * maxD; }
    ay = clamp(ay, -1, 53.333 + 1);
    // Highlight the receiver projected nearest to the aim point.
    const T = Math.hypot(ax - qb.x, ay - qb.y) / 24 + (sling ? 0.1 : 0.24);
    let best = -1, bd = 4.5;
    for (const r of sim.receivers()) {
      const p = sim.predict(r, T);
      const dd = Math.hypot(p.x - ax, p.y - ay);
      if (dd < bd) { bd = dd; best = r.i; }
    }
    if (sling && best >= 0) {
      // light magnet toward the receiver's projected spot
      const p = sim.predict(sim.agents[best], T);
      const pull = clamp(1 - bd / 4.5, 0, 1) * 0.55;
      ax += (p.x - ax) * pull;
      ay += (p.y - ay) * pull;
    }
    this.aim = { active: true, x: ax, y: ay, target: best, arc: sling };
  }

  aimEnd(cx: number, cy: number) {
    const sim = this.sim;
    if (this.steerFrom) {
      const from = this.steerFrom;
      this.steerFrom = null;
      const dt = performance.now() - from.t;
      const dx = cx - from.cx, dy = cy - from.cy;
      if (sim && this.scene && dt < 260 && Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx)) {
        // quick swipe up/down = juke that way
        const d = this.scene.deltaToField(0, dy);
        sim.setInput({ mx: 0, my: Math.sign(d.dy), sprint: true });
        sim.action('juke');
      }
      this.steer = { mx: 0, my: 0 };
      return;
    }
    const from = this.aimFrom;
    this.aimFrom = null;
    if (!from || !sim || !this.scene || !this.canAim()) { this.aimCancel(); return; }
    const moved = Math.hypot(cx - from.cx, cy - from.cy);
    if (moved < 10) {
      // Tap: throw to the receiver closest to the tapped spot.
      const p = this.scene.cssToCanvas(cx, cy);
      const f = this.scene.toField(p.px, p.py);
      let best = -1, bd = 6;
      for (const r of sim.receivers()) {
        const dd = Math.hypot(r.x - f.x, r.y - f.y);
        if (dd < bd) { bd = dd; best = r.i; }
      }
      if (best >= 0) sim.throwTo(best, 0.65);
      this.aimCancel();
      return;
    }
    this.aimMove(cx, cy);
    if (this.aim.active) {
      const qb = sim.agents[sim.qb];
      const air = Math.hypot(this.aim.x - qb.x, this.aim.y - qb.y);
      const power = clamp(0.3 + (air / sim.maxThrow(qb)) * 0.75, 0.3, 1);
      sim.throwToPoint(this.aim.x, this.aim.y, power, this.aim.arc);
    }
    this.aimCancel();
  }

  aimCancel() {
    this.aimFrom = null;
    this.steerFrom = null;
    this.steer = { mx: 0, my: 0 };
    this.aim = { active: false, x: 0, y: 0, target: -1 };
  }

  protected context(): 'qb' | 'carrier' | 'receiver' | 'defender' | 'blocker' | 'returner' | 'kicker' | 'none' {
    const sim = this.sim;
    if (sim && this.arcadeLive && sim.kind === 'scrimmage') {
      if (sim.canThrow()) return 'qb';
      return sim.controlled() ? 'carrier' : 'none';
    }
    if (!sim || !sim.user) return 'none';
    const u = sim.user;
    const c = sim.carrier();
    if (c === u) {
      if (u.slot === 'QB' && sim.canThrow()) return 'qb';
      return 'carrier';
    }
    if (u.task.k === 'returner') return 'returner';
    if (u.task.k === 'kick') return 'kicker';
    if (u.side === 'def' && sim.kind === 'scrimmage') return c && c.side === 'def' ? 'blocker' : 'defender';
    if (u.side === 'off' && sim.kind === 'scrimmage') {
      if (c && c.side === 'def') return 'defender';
      if (u.task.k === 'route' && !sim.passComplete) return 'receiver';
      if (u.slot === 'QB') return 'none';
      return 'blocker';
    }
    if (c && c.side !== u.side) return 'defender';
    return 'blocker';
  }

  protected liveHud(): Partial<HudState> {
    const sim = this.sim;
    if (!sim || (this.mode !== 'live' && this.mode !== 'presnap')) return {};
    const u = sim.user;
    const out: Partial<HudState> = {};
    const buttons: HudButton[] = [];
    const k = (code?: string) => (code ? code.replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'Shift') : undefined);
    const km = this.settings.keys;
    if (this.mode === 'presnap') {
      buttons.push({ id: 'snap', label: sim.kind === 'scrimmage' ? (u?.slot === 'QB' || this.arcadeLive ? 'SNAP' : 'READY') : 'READY', key: 'Space', big: true });
      out.assignment = this.arcadeLive
        ? (this.playOff?.type === 'run' ? 'Run play: the carrier runs for you. Drag up/down to steer, swipe to juke, tap Dive near the line.' : 'After the snap: pull back anywhere, aim the arc, release to throw. Time slows while you aim.')
        : this.assignmentText();
    } else if (u) {
      const ctx = this.context();
      if (ctx === 'qb') {
        const recs = sim.receivers();
        const qb = sim.agents[sim.qb];
        out.receivers = recs.map((r, i) => ({ idx: r.i, label: String(i + 1), name: `${r.p.name}`, open: Math.round(sim.openness(qb, r) * 10) / 10 }));
        out.canThrow = sim.canThrow();
        buttons.push({ id: 'throwAway', label: 'Throw Away', key: k(km.throwAway) });
      } else if (ctx === 'carrier' && this.arcadeLive) {
        buttons.push({ id: 'juke', label: 'Juke', key: k(km.juke) }, { id: 'spin', label: 'Spin', key: k(km.spin) }, { id: 'stiff', label: 'Stiff Arm', key: k(km.stiff) }, { id: 'dive', label: 'Dive', key: k(km.dive), big: true });
      } else if (ctx === 'carrier') {
        buttons.push({ id: 'juke', label: 'Juke', key: k(km.juke) }, { id: 'spin', label: 'Spin', key: k(km.spin) }, { id: 'stiff', label: 'Stiff Arm', key: k(km.stiff) }, { id: 'dive', label: 'Dive', key: k(km.dive) }, { id: 'protect', label: 'Protect', key: k(km.protect) });
        if (u.slot === 'QB' && u.x > sim.los) buttons.push({ id: 'slide', label: 'Slide' });
        if (u.side === 'def' && u.x >= 100) buttons.push({ id: 'kneel', label: 'Take Knee', big: true });
      } else if (ctx === 'receiver') {
        buttons.push({ id: 'catch', label: 'Catch', key: k(km.action), big: true }, { id: 'dive', label: 'Dive', key: k(km.dive) });
      } else if (ctx === 'defender') {
        if (u.engaged >= 0) buttons.push({ id: 'shed', label: 'Shed Block', key: k(km.action), big: true });
        else buttons.push({ id: 'tackle', label: 'Tackle', key: k(km.action), big: true });
        buttons.push({ id: 'swat', label: 'Swat / Play Ball', key: k(km.swat) });
      } else if (ctx === 'blocker') {
        buttons.push({ id: 'punch', label: 'Punch / Block', key: k(km.action), big: true });
      } else if (ctx === 'returner') {
        if (sim.kind === 'punt') buttons.push({ id: 'fair', label: 'Fair Catch', key: k(km.action), big: true });
      }
    }
    out.buttons = buttons;
    out.arcade = this.arcadeLive;
    out.userOnField = !!u;
    out.userSide = u ? u.side : null;
    out.charge = this.charge ? clamp(0.25 + (performance.now() - this.charge.t0) / 600, 0, 1) : 0;
    return out;
  }

  /** What a quarterback can read from the defensive alignment before the snap. */
  protected defenseRead(): string {
    const d = this.playDef;
    if (!d) return '';
    const shell = d.coverage === 'c2' || d.coverage === 'c4' || d.coverage === 'c2m' ? 'Two-high safety shell' : d.coverage === 'c0' ? 'No deep safety' : 'Single-high safety';
    const press = d.coverage === 'c0' || d.coverage === 'c1' || d.coverage === 'c2m' ? ', corners pressed' : ', corners off';
    const box = DEF_FORMATIONS[d.formation].name;
    const blitzLook = d.blitz.length && this.rng.chance(0.6) ? ' Linebackers creeping: possible blitz!' : '';
    return `Read: ${box}, ${shell}${press}.${blitzLook}`;
  }

  protected assignmentText(): string {
    const sim = this.sim;
    const u = sim?.user;
    if (!sim || !u) return '';
    const t = u.task;
    switch (t.k) {
      case 'route': return `Run a ${t.name} route${t.delay ? ' after chipping' : ''}. Press CATCH as the ball arrives.`;
      case 'passBlock': return 'Pass protect: stay between your man and the QB. Tap PUNCH when engaged.';
      case 'runBlock': return 'Run block: drive defenders away from the hole. Tap PUNCH to engage.';
      case 'lead': return 'Lead block through the hole and take on the first defender.';
      case 'runner': return u.slot === 'QB' ? 'Designed QB run: follow your blockers.' : 'Take the handoff and hit the hole. Use JUKE/SPIN/STIFF ARM to break tackles.';
      case 'fake': return 'Sell the play-action fake, then help in protection.';
      case 'qbPass': return `${this.readText} ${this.settings.passScheme === 'buttons' ? 'Hold a receiver button to charge a bullet, tap for touch.' : 'After the snap, drag toward a receiver and release to throw.'}`;
      case 'qbHand': return t.pa ? `Fake the handoff, then find an open receiver. ${this.readText}` : 'Hand the ball off, then carry out your fake.';
      case 'rush': return 'Rush the passer. Mash SHED when engaged; TACKLE when close.';
      case 'man': return `Man coverage on #${sim.agents[t.target].p.num}. Stay on their hip; SWAT when the ball arrives.`;
      case 'zone': return 'Zone coverage: guard your area (yellow ring), then break on the ball.';
      case 'returner': return 'Field the kick and find a lane.';
      case 'kick': return 'Kick!';
      default: return '';
    }
  }

  // --------------------------------------------------------------------------
  protected frame(dt: number) {
    const sim = this.sim;
    if (this.autoT > 0) {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        this.autoT = -1;
        if (this.mode === 'result') this.continueAfterResult();
        else if (this.mode === 'drive') this.continueFromDrive();
      }
    }
    if (this.playClock > 0 && this.mode === 'presnap') {
      this.playClock -= dt;
      if (this.playClock <= 0) {
        this.playClock = 0;
        this.delayOfGame();
      }
    }
    if (this.snapDelay > 0 && this.mode === 'presnap') {
      this.snapDelay -= dt;
      if (this.snapDelay <= 0) { this.snapDelay = -1; this.snap(); }
    }
    if (sim && this.mode === 'live') {
      const mv = this.fieldMove();
      if (this.arcadeLive) {
        const steering = !!this.steerFrom;
        sim.setInput({ mx: steering ? this.steer.mx : mv.x, my: steering ? this.steer.my : mv.y, sprint: true });
      } else sim.setInput({ mx: mv.x, my: mv.y, sprint: mv.sprint });
      // Time slows down while the quarterback is lining up a slingshot throw.
      const slowmo = this.aimFrom && this.settings.passScheme === 'sling' && sim.canThrow() ? 0.3 : 1;
      this.acc += dt * (this.settings.playSpeed || 1) * slowmo;
      const h = 1 / 60;
      let n = 0;
      while (this.acc >= h && n++ < 6) {
        sim.step(h);
        sim.rememberTarget();
        this.acc -= h;
        this.handleEvents(sim.drainEvents());
        if (sim.phase === 'done') break;
      }
      if (sim.phase === 'done' && sim.outcome) this.playFinished(sim.outcome);
    } else if (sim && sim.phase === 'dead') {
      sim.step(dt);
    }
    if (this.scene && sim) {
      let reads: { idx: number; label: string; open: number }[] | undefined;
      if (this.mode === 'live' && sim.user && sim.user.slot === 'QB' && sim.canThrow()) {
        const qb = sim.agents[sim.qb];
        reads = sim.receivers().map((r, i) => ({ idx: r.i, label: String(i + 1), open: sim.openness(qb, r) }));
      } else if (this.mode === 'presnap' && sim.user && sim.user.slot === 'QB') {
        reads = sim.receivers().map((r, i) => ({ idx: r.i, label: String(i + 1), open: 2 }));
      }
      const showLanding = (this.arcadeLive && sim.ball.kind === 'pass') || !!sim.user && (sim.ball.target === sim.user.i || sim.user.side === 'def' || sim.user.task.k === 'returner');
      this.scene.update(sim, dt, { userQbReads: reads, showLanding, aim: this.aimFrom ? this.aim : null, controlled: this.arcadeLive ? sim.controlled()?.i ?? -1 : -1 });
      this.scene.render();
    }
    this.hudT += dt;
    if (this.hudT > 0.1 && (this.mode === 'live' || this.mode === 'presnap')) {
      this.hudT = 0;
      this.emitHud();
    }
  }

  protected handleEvents(evs: SimEvent[]) {
    for (const e of evs) {
      switch (e.type) {
        case 'tackle': case 'sack': audio.hit(e.big || e.type === 'sack'); this.scene?.addShake(e.user ? 0.35 : 0.12); break;
        case 'catch': audio.catch(); break;
        case 'kick': audio.kick(); break;
        case 'td': audio.cheer(1.3); audio.jingle('td'); this.scene?.celebrate(); break;
        case 'int': case 'fumble': audio.cheer(0.8); this.scene?.addShake(0.2); break;
        case 'juke': case 'spin': case 'miss': if (e.user) audio.cheer(0.4); break;
        case 'whistle': audio.whistle(); break;
        case 'good': audio.cheer(1); break;
        case 'nogood': audio.groan(); break;
        case 'deflect': audio.hit(false); break;
      }
    }
  }

  protected playFinished(o: PlayOutcome) {
    const g = this.g;
    const sim = this.sim!;
    const userWasIn = !!sim.user;
    const prevScore = [g.score[0], g.score[1]];
    const prevPoss = g.poss;
    applyOutcome(g, o);
    updateOtSudden(g);
    if (userWasIn) {
      this.userSnaps++;
      this.gradeSum += o.grade ?? 0;
      for (const n of o.notes ?? []) if (/TOUCHDOWN|INTERCEPTION|SACK|FUMBLE|Pancake|Pinned|good/.test(n)) this.notes.push(n);
    }
    const userScored = g.score[this.userSideIdx] > prevScore[this.userSideIdx];
    const oppScored = g.score[1 - this.userSideIdx] > prevScore[1 - this.userSideIdx];
    let title = '';
    let tone: 'good' | 'bad' | 'neutral' | 'score' = 'neutral';
    const userTeamHadBall = prevPoss === this.userSideIdx;
    const gained = Math.round(o.endX - sim.los);
    if (o.td) { title = 'TOUCHDOWN!'; tone = userScored ? 'score' : 'bad'; }
    else if (o.safety) { title = 'SAFETY!'; tone = userScored ? 'good' : 'bad'; }
    else if (o.kind === 'fg' || o.kind === 'xp') { title = o.good ? 'IT’S GOOD!' : 'NO GOOD'; tone = (o.good === userTeamHadBall) ? 'good' : 'bad'; }
    else if (o.kind === 'interception') { title = 'INTERCEPTED!'; tone = userTeamHadBall ? 'bad' : 'good'; }
    else if (o.kind === 'fumble') { title = 'FUMBLE!'; tone = userTeamHadBall ? 'bad' : 'good'; }
    else if (o.kind === 'sack') { title = 'SACK!'; tone = userTeamHadBall ? 'bad' : 'good'; }
    else if (o.kind === 'incomplete') { title = 'Incomplete'; tone = userTeamHadBall ? 'neutral' : 'good'; }
    else if (o.kind === 'punt' || o.kind === 'kickoff') { title = o.touchback ? 'Touchback' : o.kind === 'punt' ? 'Punt' : 'Kickoff'; }
    else if (o.kind === 'twopt') { title = o.td ? '2-POINT GOOD' : '2-point failed'; tone = (o.td && userTeamHadBall) ? 'good' : 'neutral'; }
    else { title = gained > 0 ? `+${gained} yards` : gained === 0 ? 'No gain' : `Loss of ${-gained}`; tone = (gained >= 5) === userTeamHadBall ? 'good' : 'neutral'; }
    if (o.penalty) title = `FLAG: ${o.penalty.name}`;
    if (userScored && o.td) audio.cheer(1.5);
    if (oppScored) audio.groan();
    const sub = g.over ? 'Final' : g.phase === 'play' ? `${downLabel(g)} at ${fieldPosLabel(g)}` : g.phase === 'pat' ? 'Extra point attempt' : 'Kickoff';
    const gradeTxt = userWasIn && o.grade !== undefined ? ` • Play grade ${o.grade >= 0 ? '+' : ''}${o.grade.toFixed(1)}` : '';
    this.mode = 'result';
    this.hud.banner = { title, sub: `${sub}${gradeTxt}`, tone };
    this.autoT = this.settings.autoContinue ? (o.td || o.kind === 'interception' ? 2.6 : 1.7) : -1;
    this.updateScoreboard();
    this.emitHud({ lastPlay: o.desc });
  }

  protected delayOfGame() {
    const g = this.g;
    applyOutcome(g, { kind: 'run', endX: g.ballOn, holder: 'off', duration: 0, stats: [], desc: '', penalty: { name: 'Delay of Game', against: 'off', yards: 5, preSnap: true } });
    this.career.trust = Math.max(0, this.career.trust - 1);
    this.mode = 'result';
    this.hud.banner = { title: 'FLAG: Delay of Game', sub: `${downLabel(g)} at ${fieldPosLabel(g)}`, tone: 'bad' };
    this.autoT = 2;
    this.emitHud();
  }

  continueAfterResult() {
    if (this.mode !== 'result') return;
    this.hud.banner = null;
    if (this.g.over) { this.finishGame(); return; }
    this.advance();
  }

  protected finishGame() {
    if (this.finished) return;
    this.finished = true;
    const g = this.g;
    const played = this.userSnaps > 0;
    const statLine = g.box[this.user.id] ?? {};
    const playGrade = this.liveGrade();
    const sGrade = simGrade(this.user, statLine, this.career.role);
    const grade = played ? Math.round(playGrade * 0.6 + sGrade * 0.4) : sGrade;
    const anyStats = Object.keys(statLine).length > 0;
    const recap = completeUserGame(this.league, this.career, this.game, g, { grade, snaps: this.userSnaps + (anyStats ? 1 : 0), played: played || anyStats, notes: this.notes });
    this.mode = 'final';
    this.hud.recap = recap;
    if (recap.us > recap.them) { audio.jingle('win'); this.scene?.celebrate(); }
    this.updateScoreboard();
    this.emitHud({ final: true });
    dbgLog.length = 0;
  }

  finish() {
    if (this.hud.recap) this.onFinish(this.hud.recap);
  }

  protected updateScoreboard() {
    const g = this.g;
    this.scene?.updateScoreboard({
      home: TEAMS[g.home].abbr, away: TEAMS[g.away].abbr, hs: g.score[0], as: g.score[1], q: g.over ? 'FINAL' : g.quarter > 4 ? 'OT' : `Q${g.quarter}`,
      clock: fmtClock(g.clock), down: g.phase === 'play' ? downLabel(g) : '', homeColor: TEAMS[g.home].primary, awayColor: TEAMS[g.away].primary,
    });
  }

  get kickSpeed(): number {
    return this.userMods.kickMeter ?? 1;
  }
  get title(): string {
    if (this.opts.title) return this.opts.title;
    return this.game.preseason ? 'Preseason' : this.game.week > PLAYOFF_WEEK_BASE ? ['Wild Card', 'Divisional Round', 'Conference Championship', 'Crown Bowl'][this.game.week - PLAYOFF_WEEK_BASE - 1] : `Week ${this.game.week}`;
  }
  get userPos() {
    return this.user.pos;
  }
  get userSlotHint(): string {
    const map: Record<string, string> = { QB: 'QB', RB: 'RB', WR: 'X', TE: 'TE1', OL: this.career.olSlot === 'OT' ? 'LT' : 'LG' };
    return map[this.user.pos] ?? '';
  }
  isDrill = false;

  /** Expose for the HUD: agent under user control. */
  get userAgent(): SimAgent | null {
    return this.sim?.user ?? null;
  }
}
