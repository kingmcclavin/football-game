// ---------------------------------------------------------------------------
// PlaySim: real-time simulation of a single football play.
//
// Coordinates are relative to the team that snaps (or kicks) the ball:
//   x: 0 = own goal line, 100 = opponent goal line (end zones extend to -10/110)
//   y: 0..53.33 across the field (+y = offense's left)
// The sim is deterministic for a given seed and runs headless (used by tests,
// drills and the 3D game). The renderer only reads agent/ball state.
// ---------------------------------------------------------------------------
import type { Attrs, Pos } from '../../core/types';
import { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import {
  DEF_FORMATIONS, FORMATIONS, ROUTES,
  type Assignment, type DefPlay, type DefSlot, type OffPlay, type OffSlot, type RouteName,
} from '../../data/playbook';
import { DIFFICULTY, TEAMMATE, mod, type DiffParams, type Mods } from './mods';
import type { PlayOutcome, StatEvent, OutcomeKind, Penalty } from './types';

export const FIELD_W = 53.333;
export const MID_Y = FIELD_W / 2;
const G = 10.72; // gravity in yd/s^2
const CATCH_H = 1.55;

export type Side = 'off' | 'def';

export interface SimPlayer {
  pid: string;
  name: string;
  num: number;
  pos: Pos;
  attrs: Attrs;
  ht: number;
  wt: number;
  user?: boolean;
  mods?: Mods;
}

export type AnimState =
  | 'stance' | 'idle' | 'run' | 'throw' | 'catch' | 'block' | 'tackle' | 'dive' | 'down' | 'juke' | 'spin' | 'stiff'
  | 'kick' | 'celebrate' | 'hold' | 'snap' | 'slide' | 'swat' | 'jump';

type Task =
  | { k: 'none' }
  | { k: 'route'; pts: { x: number; y: number }[]; idx: number; stop: boolean; delay: number; depth: 'short' | 'medium' | 'deep'; name: RouteName }
  | { k: 'passBlock' }
  | { k: 'runBlock'; holeY: number }
  | { k: 'lead'; holeY: number }
  | { k: 'runner'; holeY: number; style: 'inside' | 'outside' | 'draw' | 'sneak'; meshX: number; meshY: number }
  | { k: 'fake'; holeY: number }
  | { k: 'qbPass'; drop: number; setX: number; setY: number }
  | { k: 'qbHand'; meshX: number; meshY: number; pa: boolean; drop: number }
  | { k: 'rush' }
  | { k: 'man'; target: number }
  | { k: 'zone'; zone: string }
  | { k: 'kick' }
  | { k: 'hold' }
  | { k: 'returner'; fair: boolean }
  | { k: 'cover' }
  | { k: 'retBlock' }
  | { k: 'idle' };

export interface SimAgent {
  i: number;
  p: SimPlayer;
  side: Side;
  slot: string;
  x: number; y: number;
  vx: number; vy: number;
  face: number;
  top: number; acc: number; agi: number;
  task: Task;
  user: boolean;
  userActive: boolean; // user has taken manual control this play
  engaged: number;
  engT: number;
  shed: number;
  noEngage: number;
  stun: number;
  down: boolean;
  downT: number;
  anim: AnimState;
  animT: number;
  hist: { x: number; y: number; vx: number; vy: number }[];
  pursuing: boolean;
  readT: number; // time when this defender reacts to run/catch (-1 not yet)
  moveT: number; // last special move time
  move: '' | 'juke' | 'spin' | 'stiff' | 'truck' | 'dive' | 'swat' | 'hitstick';
  moveDir: number;
  tackleCd: number;
  diff: DiffParams;
  mods: Mods;
  startX: number; startY: number;
  stat: { blockWin: number; pancake: boolean };
  slow: number; // seconds of slowdown (jam / broken tackle)
  manDef?: number; // index of defender guarding (for receivers)
  ballChance: boolean; // has had their one chance at the current pass
  protect: boolean;
  blockTarget: number;
}

export type BallState = 'pre' | 'snap' | 'held' | 'air' | 'loose' | 'dead' | 'kicked';

export interface Ball {
  state: BallState;
  holder: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  tx: number; ty: number; // landing / catch point
  target: number;
  thrower: number;
  t0: number;
  tArrive: number;
  kind: 'pass' | 'snap' | 'fumble' | 'kick' | 'punt' | 'kickoff';
  bounced: number;
  touchedBy: Side | null;
}

export interface SimEvent {
  type:
    | 'snap' | 'throw' | 'catch' | 'drop' | 'int' | 'deflect' | 'tackle' | 'td' | 'fumble' | 'recover' | 'sack' | 'whistle'
    | 'juke' | 'spin' | 'stiff' | 'miss' | 'kick' | 'handoff' | 'oob' | 'incomplete' | 'shed' | 'pancake' | 'good' | 'nogood'
    | 'firstdown' | 'hit' | 'flag' | 'touchback' | 'faircatch';
  x?: number; y?: number;
  text?: string;
  big?: boolean;
  user?: boolean;
}

export interface UserInput {
  mx: number;
  my: number;
  sprint: boolean;
}

export interface KickParams {
  power: number; // 0..1
  accuracy: number; // -1..1 (0 perfect)
  aim: number; // -1..1 lateral aim
}

export interface ScrimmageSetup {
  kind: 'scrimmage';
  los: number;
  hashY: number;
  toGo: number;
  down: number;
  off: Partial<Record<OffSlot, SimPlayer>>;
  def: Partial<Record<DefSlot, SimPlayer>>;
  offPlay: OffPlay;
  defPlay: DefPlay;
  userSide: Side | null;
  oppDiff: DiffParams;
  seed: number;
  twoPoint?: boolean;
  penalties?: boolean;
  /** AI QB preference for the user target (0..1). */
  featureUser?: number;
  /** Mirror the play left/right. */
  flip?: boolean;
  drill?: boolean;
}

export interface KickSetup {
  kind: 'fg' | 'xp' | 'punt' | 'kickoff';
  los: number; // spot of the snap / kickoff tee
  hashY: number;
  kicker: SimPlayer;
  kickTeam: SimPlayer[]; // other 10 players of the kicking team
  retTeam: SimPlayer[]; // receiving / rushing team (first = returner for punt/kickoff)
  userSide: Side | null;
  userRole?: 'K' | 'P' | 'KR' | 'PR';
  kick?: KickParams;
  oppDiff: DiffParams;
  seed: number;
  wind?: { x: number; y: number };
  drill?: boolean;
}

export type SimSetup = ScrimmageSetup | KickSetup;

// ---------------------------------------------------------------------------
const rating = (a: Attrs, k: keyof Attrs, d = 50) => (a[k] ?? d);
const topSpeed = (a: Attrs) => 4.6 + rating(a, 'spd') * 0.058;
const accelOf = (a: Attrs) => 6 + rating(a, 'acc') * 0.09;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

export class PlaySim {
  readonly setup: SimSetup;
  readonly kind: SimSetup['kind'];
  rng: Rng;
  agents: SimAgent[] = [];
  ball: Ball;
  t = 0;
  phase: 'pre' | 'live' | 'dead' | 'done' = 'pre';
  deadT = 0;
  los: number;
  firstDownX: number;
  user: SimAgent | null = null;
  input: UserInput = { mx: 0, my: 0, sprint: false };
  events: SimEvent[] = [];
  outcome: PlayOutcome | null = null;
  // bookkeeping
  qb = -1;
  carrierSince = 0;
  passThrown = false;
  passComplete = false;
  handedOff = false;
  qbCrossed = false;
  throwWind = -1; // time when wind-up ends
  pending: { target: number; power: number; leadX: number; leadY: number; away?: boolean } | null = null;
  airYards = 0;
  catchX = 0;
  turnover = false;
  intBy = -1;
  fumbleBy = -1;
  recoveredBy = -1;
  tackler = -1;
  sackBy = -1;
  pbuBy = -1;
  dropped = false;
  catchPressed = -10;
  actionQueue: string[] = [];
  userGrade = 0;
  notes: string[] = [];
  kickResult: { good?: boolean; touchback?: boolean; fair?: boolean; muff?: boolean; downed?: boolean; blocked?: boolean; dist?: number; landX?: number; oob?: boolean } = {};
  kickFired = false;
  playAction = false;
  defenseKnowsRun = -1;
  deadReason = '';
  scramble = false;
  penalty: Penalty | undefined;
  missedTackles = 0;
  fumbleX = 0;
  private wind = { x: 0, y: 0 };
  private lastWhistleText = '';

  constructor(setup: SimSetup) {
    this.setup = setup;
    this.kind = setup.kind;
    this.rng = new Rng(setup.seed);
    this.los = setup.los;
    this.firstDownX = setup.kind === 'scrimmage' ? Math.min(100, setup.los + setup.toGo) : setup.los;
    this.ball = { state: 'pre', holder: -1, x: setup.los, y: setup.hashY, z: 0.2, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, target: -1, thrower: -1, t0: 0, tArrive: 0, kind: 'snap', bounced: 0, touchedBy: null };
    if (setup.kind === 'scrimmage') this.buildScrimmage(setup);
    else this.buildKick(setup);
    this.user = this.agents.find((a) => a.user) ?? null;
  }

  // =========================================================================
  // Setup
  // =========================================================================
  private addAgent(p: SimPlayer, side: Side, slot: string, x: number, y: number, task: Task, diff: DiffParams): SimAgent {
    const a: SimAgent = {
      i: this.agents.length, p, side, slot, x, y, vx: 0, vy: 0,
      face: side === 'off' ? 0 : Math.PI,
      top: topSpeed(p.attrs) * mod(p.mods, 'sprintSpeed', 1),
      acc: accelOf(p.attrs),
      agi: 0.55 + rating(p.attrs, 'agi') * 0.005,
      task, user: !!p.user, userActive: false,
      engaged: -1, engT: 0, shed: 0, noEngage: 0, stun: 0, down: false, downT: 0,
      anim: 'stance', animT: 0, hist: [], pursuing: false, readT: -1, moveT: -10, move: '', moveDir: 0,
      tackleCd: 0, diff, mods: p.mods ?? {}, startX: x, startY: y, stat: { blockWin: 0, pancake: false }, slow: 0,
      ballChance: false, protect: false, blockTarget: -1,
    };
    this.agents.push(a);
    return a;
  }

  private diffFor(side: Side, userSide: Side | null): DiffParams {
    if (userSide === null) return TEAMMATE;
    return side === userSide ? TEAMMATE : (this.setup as ScrimmageSetup).oppDiff ?? DIFFICULTY.pro;
  }

  private buildScrimmage(s: ScrimmageSetup) {
    const form = FORMATIONS[s.offPlay.formation];
    const los = s.los;
    const hy = s.hashY;
    const fl = s.flip ? -1 : 1;
    const offAgents: Partial<Record<OffSlot, SimAgent>> = {};
    for (const spot of form.spots) {
      const pl = s.off[spot.slot];
      if (!pl) continue;
      const y = clamp(hy + spot.dy * fl, 1.5, FIELD_W - 1.5);
      const a = this.addAgent(pl, 'off', spot.slot, los + spot.dx, y, { k: 'none' }, this.diffFor('off', s.userSide));
      offAgents[spot.slot] = a;
      if (spot.slot === 'QB') this.qb = a.i;
    }
    // Offensive assignments
    const play = s.offPlay;
    this.playAction = play.tags.includes('pa');
    for (const slot of Object.keys(offAgents) as OffSlot[]) {
      const a = offAgents[slot]!;
      const asg: Assignment | undefined = play.assign[slot];
      if (slot === 'QB') {
        if (play.type === 'run' && play.carrier !== 'QB') {
          const rb = offAgents[play.carrier ?? 'RB'];
          const runAsg = play.assign[play.carrier ?? 'RB'];
          const holeY = runAsg && runAsg.kind === 'run' ? hy + runAsg.hole * fl : hy;
          const meshX = form.underCenter ? los - 3 : los - 4.6;
          const meshY = rb ? (a.y + (holeY - a.y) * 0.25) : a.y;
          a.task = { k: 'qbHand', meshX, meshY, pa: false, drop: 2 };
        } else if (play.type === 'run' && play.carrier === 'QB' && asg?.kind === 'run') {
          a.task = { k: 'runner', holeY: hy + asg.hole * fl, style: asg.style, meshX: a.x, meshY: a.y };
        } else if (this.playAction) {
          const fakeAsg = Object.values(play.assign).find((x) => x?.kind === 'fake') as { kind: 'fake'; hole: number } | undefined;
          a.task = { k: 'qbHand', meshX: los - 3.2, meshY: hy + (fakeAsg ? fakeAsg.hole * 0.3 * fl : 0), pa: true, drop: play.dropback ?? 5 };
        } else {
          const drop = play.dropback ?? 3;
          a.task = { k: 'qbPass', drop, setX: Math.max(los - 9, a.x - (form.underCenter ? drop + 1 : drop * 0.5)), setY: a.y };
        }
        continue;
      }
      if (['LT', 'LG', 'C', 'RG', 'RT'].includes(slot)) {
        a.task = play.type === 'run' ? { k: 'runBlock', holeY: this.holeY(play, hy) } : { k: 'passBlock' };
        continue;
      }
      if (!asg) { a.task = play.type === 'run' ? { k: 'runBlock', holeY: this.holeY(play, hy) } : { k: 'passBlock' }; continue; }
      switch (asg.kind) {
        case 'route':
        case 'checkRelease': {
          const side = asg.side !== undefined ? asg.side * fl : (a.y >= hy ? 1 : -1);
          const r = ROUTES[asg.route];
          const pts = r.pts.map(([f, o]) => ({ x: Math.min(108, a.x + f), y: clamp(a.y + o * side, 3.5, FIELD_W - 3.5) }));
          a.task = { k: 'route', pts, idx: 0, stop: !!r.stop, delay: asg.kind === 'checkRelease' ? 1.1 : asg.delay ?? 0, depth: r.depth, name: asg.route };
          break;
        }
        case 'block':
          a.task = play.type === 'run' ? { k: 'runBlock', holeY: this.holeY(play, hy) } : { k: 'passBlock' };
          break;
        case 'lead':
          a.task = { k: 'lead', holeY: this.holeY(play, hy) + (asg.side ?? 0) * 0.5 * fl };
          break;
        case 'run': {
          const holeY = hy + asg.hole * fl;
          const qbA = offAgents.QB;
          const meshX = form.underCenter ? los - 3 : los - 4.6;
          const meshY = qbA ? qbA.y + (holeY - qbA.y) * 0.25 : a.y;
          a.task = { k: 'runner', holeY, style: asg.style, meshX, meshY };
          break;
        }
        case 'fake':
          a.task = { k: 'fake', holeY: hy + asg.hole * fl };
          break;
      }
    }

    // Defense alignment
    const dform = DEF_FORMATIONS[s.defPlay.formation];
    const eligible = this.agents.filter((a) => a.side === 'off' && ['X', 'Z', 'SL', 'SL2', 'TE1', 'TE2', 'RB', 'FB'].includes(a.slot));
    const wides = eligible.filter((a) => ['X', 'Z', 'SL', 'SL2'].includes(a.slot)).sort((a, b) => b.y - a.y);
    const leftWide = wides[0];
    const rightWide = wides.length > 1 ? wides[wides.length - 1] : undefined;
    const slots = wides.slice(1, wides.length - 1);
    const te = eligible.find((a) => a.slot === 'TE1') ?? eligible.find((a) => a.slot === 'TE2');
    const rb = eligible.find((a) => a.slot === 'RB');
    const fb = eligible.find((a) => a.slot === 'FB');
    const strongY = te ? (te.y >= hy ? 1 : -1) : -1;
    const cov = s.defPlay.coverage;
    const isBlitz = (slot: DefSlot) => s.defPlay.blitz.includes(slot);
    // Man matching: corners take the widest receivers, then the remaining
    // eligibles are matched to the best available cover players by priority.
    const manMap: Partial<Record<DefSlot, SimAgent | undefined>> = { CB1: leftWide, CB2: rightWide };
    {
      const present = new Set(dform.slots.filter((sl) => s.def[sl] && !s.defPlay.blitz.includes(sl)));
      const coverPri: DefSlot[] = ['NCB', 'DCB', 'SS', 'SLB', 'WLB', 'LB4', 'MLB'];
      const pool = coverPri.filter((sl) => present.has(sl));
      const toCover: SimAgent[] = [...slots, ...(te ? [te] : []), ...eligible.filter((e) => e.slot === 'TE2' && e !== te), ...(rb ? [rb] : []), ...(fb ? [fb] : [])];
      for (const r of toCover) {
        // backs are covered by linebackers when possible
        const isBack = r.slot === 'RB' || r.slot === 'FB';
        const idx = isBack ? pool.findIndex((sl) => sl.includes('LB')) : 0;
        const pick = pool.splice(idx >= 0 ? idx : 0, 1)[0];
        if (!pick) break;
        manMap[pick] = r;
      }
    }
    const zoneMap = (slot: DefSlot): string => {
      const z: Record<string, Partial<Record<DefSlot, string>>> = {
        c2: { CB1: 'flatL', CB2: 'flatR', FS: 'deepL', SS: 'deepR', WLB: 'hookL', MLB: 'hookM', SLB: 'hookR', NCB: 'curlL', DCB: 'curlR', LB4: 'hookM' },
        c3: { CB1: 'deep3L', CB2: 'deep3R', FS: 'deep3M', SS: strongY > 0 ? 'curlL' : 'curlR', WLB: strongY > 0 ? 'curlR' : 'curlL', MLB: 'hookM', SLB: strongY > 0 ? 'hookL' : 'hookR', NCB: strongY > 0 ? 'flatL' : 'flatR', DCB: 'hookM', LB4: 'hookM' },
        c4: { CB1: 'deepQ1', CB2: 'deepQ4', FS: 'deepQ2', SS: 'deepQ3', WLB: 'flatL', MLB: 'hookM', SLB: 'flatR', NCB: 'flatL', DCB: 'flatR', LB4: 'hookM' },
      };
      return (z[cov] ?? z.c3)[slot] ?? 'hookM';
    };
    const dlY: Partial<Record<DefSlot, number>> = { LE: 3.3, LDT: 0.9, RDT: -0.9, RE: -3.3, NT: 0 };
    for (const slot of dform.slots) {
      const pl = s.def[slot];
      if (!pl) continue;
      let x = los + 1;
      let y = hy;
      let task: Task = { k: 'rush' };
      const manT = manMap[slot];
      if (slot in dlY) {
        x = los + 0.9;
        y = hy + (dlY[slot] as number) + (te && Math.sign(dlY[slot] as number) === strongY && Math.abs(dlY[slot] as number) > 2 ? strongY * 1.3 : 0);
        task = { k: 'rush' };
      } else {
        // Second level and secondary alignment
        switch (slot) {
          case 'WLB': x = los + 4.5; y = hy - strongY * 3.5; break;
          case 'MLB': x = los + 5; y = hy; break;
          case 'SLB': x = los + 4.2; y = hy + strongY * 3.8; break;
          case 'LB4': x = los + 3.5; y = hy - strongY * 1.5; break;
          case 'CB1': x = los + (cov === 'c0' || cov === 'c2m' || cov === 'c1' ? 1.6 : 6.5); y = leftWide ? leftWide.y - 0.6 : hy + 12; break;
          case 'CB2': x = los + (cov === 'c0' || cov === 'c2m' || cov === 'c1' ? 1.6 : 6.5); y = rightWide ? rightWide.y + 0.6 : hy - 12; break;
          case 'NCB': x = los + 4.5; y = slots[0] ? slots[0].y - 0.6 * Math.sign(slots[0].y - hy) : hy + 7; break;
          case 'DCB': x = los + 5.5; y = slots[1] ? slots[1].y : hy - 7; break;
          case 'FS': x = los + (cov === 'c2' || cov === 'c2m' || cov === 'c4' ? 12 : 13.5); y = cov === 'c2' || cov === 'c2m' || cov === 'c4' ? hy + 8 : hy; break;
          case 'SS': x = los + (cov === 'c2' || cov === 'c2m' || cov === 'c4' ? 12 : 7.5); y = cov === 'c2' || cov === 'c2m' || cov === 'c4' ? hy - 8 : hy + strongY * 5; break;
        }
        if (isBlitz(slot)) task = { k: 'rush' };
        else if (cov === 'c0' || cov === 'c1' || cov === 'c2m') {
          if (manT) task = { k: 'man', target: manT.i };
          else if (cov === 'c1' && slot === 'FS') task = { k: 'zone', zone: 'deep3M' };
          else if (cov === 'c2m' && (slot === 'FS' || slot === 'SS')) task = { k: 'zone', zone: slot === 'FS' ? 'deepL' : 'deepR' };
          else if (slot === 'MLB') task = { k: 'zone', zone: 'robber' };
          else task = { k: 'zone', zone: 'hookM' };
          if (cov === 'c2m' && (slot === 'FS' || slot === 'SS')) task = { k: 'zone', zone: slot === 'FS' ? 'deepL' : 'deepR' };
        } else task = { k: 'zone', zone: zoneMap(slot) };
        if (task.k === 'man' && manT) {
          // align over the man
          if (slot.startsWith('CB') || slot === 'NCB' || slot === 'DCB') y = manT.y + (manT.y > hy ? -0.6 : 0.6);
          else if (slot === 'SS') { x = los + 5; y = manT.y + (manT.y > hy ? -1 : 1); }
        }
      }
      if (s.drill && task.k === 'zone' && Object.keys(s.def).length <= 2) {
        // drills with a lone defender always play man on the nearest receiver
        const near = eligible.slice().sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
        if (near) task = { k: 'man', target: near.i };
      }
      y = clamp(y, 1, FIELD_W - 1);
      const ag = this.addAgent(pl, 'def', slot, x, y, task, this.diffFor('def', s.userSide));
      ag.face = Math.PI;
      if (task.k === 'man') this.agents[task.target].manDef = ag.i;
    }
    // ball on the spot, center holds it
    const c = this.agents.find((a) => a.slot === 'C');
    this.ball.x = los;
    this.ball.y = c ? c.y : hy;
    this.ball.z = 0.15;
  }

  private holeY(play: OffPlay, hy: number): number {
    const asg = play.assign[play.carrier ?? 'RB'];
    const fl = (this.setup as ScrimmageSetup).flip ? -1 : 1;
    return asg && asg.kind === 'run' ? hy + asg.hole * fl : hy;
  }

  private buildKick(s: KickSetup) {
    const los = s.los;
    const hy = s.hashY;
    const kd = this.diffFor('off', s.userSide);
    const rd = this.diffFor('def', s.userSide);
    this.wind = s.wind ?? { x: 0, y: 0 };
    if (s.kind === 'fg' || s.kind === 'xp') {
      const k = this.addAgent(s.kicker, 'off', 'K', los - 9.5, hy + 1.2, { k: 'kick' }, kd);
      k.anim = 'stance';
      const line = [-3.75, -2.5, -1.25, 0, 1.25, 2.5, 3.75];
      s.kickTeam.slice(0, 9).forEach((p, idx) => {
        if (idx < 7) this.addAgent(p, 'off', idx === 3 ? 'LS' : 'OL', los - 0.5, hy + line[idx], { k: 'passBlock' }, kd);
        else if (idx === 7) this.addAgent(p, 'off', 'H', los - 7, hy, { k: 'hold' }, kd);
        else this.addAgent(p, 'off', 'W', los - 1.5, hy + 5, { k: 'passBlock' }, kd);
      });
      s.retTeam.slice(0, 9).forEach((p, idx) => {
        const y = hy + (idx - 4) * 1.3;
        this.addAgent(p, 'def', 'R', los + 1, y, { k: 'rush' }, rd);
      });
      this.ball.x = los; this.ball.y = hy;
    } else if (s.kind === 'punt') {
      this.addAgent(s.kicker, 'off', 'P', los - 14, hy, { k: 'kick' }, kd);
      const line = [-2.5, -1.25, 0, 1.25, 2.5, 3.75, -3.75];
      s.kickTeam.slice(0, 10).forEach((p, idx) => {
        if (idx < 7) this.addAgent(p, 'off', idx === 2 ? 'LS' : 'OL', los - 0.5, hy + line[idx], { k: 'passBlock' }, kd);
        else if (idx < 9) this.addAgent(p, 'off', 'GUN', los - 0.5, idx === 7 ? 4 : FIELD_W - 4, { k: 'cover' }, kd);
        else this.addAgent(p, 'off', 'PP', los - 5, hy + 1, { k: 'passBlock' }, kd);
      });
      const [ret, ...rest] = s.retTeam;
      const expected = Math.min(97, los + 40 + rating(s.kicker.attrs, 'kpw') * 0.08);
      this.addAgent(ret, 'def', 'PR', expected, hy, { k: 'returner', fair: false }, rd);
      rest.slice(0, 10).forEach((p, idx) => {
        if (idx < 6) this.addAgent(p, 'def', 'R', los + 1, hy + (idx - 2.5) * 1.6, { k: 'rush' }, rd);
        else if (idx < 8) this.addAgent(p, 'def', 'VISE', los + 2, idx === 6 ? 5 : FIELD_W - 5, { k: 'retBlock' }, rd);
        else this.addAgent(p, 'def', 'RB2', los + 12 + idx, hy + (idx === 8 ? 6 : -6), { k: 'retBlock' }, rd);
      });
      this.ball.x = los; this.ball.y = hy;
    } else {
      // kickoff from `los` (normally 35)
      this.addAgent(s.kicker, 'off', 'K', los - 6, MID_Y, { k: 'kick' }, kd);
      s.kickTeam.slice(0, 10).forEach((p, idx) => {
        const y = idx < 5 ? 4 + idx * 4.6 : FIELD_W - 4 - (idx - 5) * 4.6;
        this.addAgent(p, 'off', 'KC', los - 5, y, { k: 'cover' }, kd);
      });
      const [ret, ...rest] = s.retTeam;
      this.addAgent(ret, 'def', 'KR', 97, MID_Y, { k: 'returner', fair: false }, rd);
      rest.slice(0, 10).forEach((p, idx) => {
        const row = idx < 5 ? los + 12 : idx < 8 ? los + 25 : los + 40;
        const n = idx < 5 ? 5 : idx < 8 ? 3 : 2;
        const k = idx < 5 ? idx : idx < 8 ? idx - 5 : idx - 8;
        const y = 8 + (k + 0.5) * ((FIELD_W - 16) / n);
        this.addAgent(p, 'def', 'KRB', row, y, { k: 'retBlock' }, rd);
      });
      this.ball.x = los; this.ball.y = MID_Y; this.ball.z = 0.3;
    }
    for (const a of this.agents) a.face = a.side === 'off' ? 0 : Math.PI;
  }

  // =========================================================================
  // Public controls
  // =========================================================================
  snap() {
    if (this.phase !== 'pre') return;
    this.phase = 'live';
    this.t = 0;
    this.emit({ type: 'snap' });
    for (const a of this.agents) a.anim = 'run';
    if (this.kind === 'scrimmage') {
      const qb = this.agents[this.qb];
      const form = FORMATIONS[(this.setup as ScrimmageSetup).offPlay.formation];
      if (qb) {
        if (form.underCenter || qb.x > this.los - 2) {
          this.ball.state = 'held';
          this.ball.holder = qb.i;
        } else {
          this.ball.state = 'snap';
          this.ball.kind = 'snap';
          this.ball.t0 = 0;
          this.ball.tArrive = 0.38;
          this.ball.target = qb.i;
        }
      }
      // pass protection assignments: match rushers to blockers by lane
      this.assignProtection();
      // presses / jams
      for (const d of this.agents) {
        if (d.side !== 'def' || d.task.k !== 'man') continue;
        const r = this.agents[d.task.target];
        if (dist(d.x, d.y, r.x, r.y) < 2.4) {
          const win = rating(r.p.attrs, 'rel') + this.rng.normal(0, 12) - (rating(d.p.attrs, 'mcv') * 0.6 + rating(d.p.attrs, 'str') * 0.4);
          if (win < 0) r.slow = 0.35 + Math.min(0.4, -win * 0.01);
        }
      }
    } else {
      this.ball.state = 'snap';
      this.ball.kind = 'snap';
      this.ball.t0 = 0;
      const tgt = this.agents.find((a) => a.slot === 'H' || a.slot === 'P');
      this.ball.target = tgt ? tgt.i : -1;
      this.ball.tArrive = this.kind === 'punt' ? 0.75 : 0.4;
      if (this.kind === 'kickoff') { this.ball.state = 'pre'; this.ball.target = -1; }
    }
  }

  private assignProtection() {
    const rushers = this.agents.filter((a) => a.side === 'def' && a.task.k === 'rush').sort((a, b) => b.y - a.y);
    const blockers = this.agents.filter((a) => a.side === 'off' && a.task.k === 'passBlock');
    const free = new Set(blockers);
    // most dangerous rushers (closest to the QB lane) get picked up first
    const qb = this.agents[this.qb];
    const order = rushers.slice().sort((a, b) => (qb ? dist(a.x, a.y, qb.x, qb.y) - dist(b.x, b.y, qb.x, qb.y) : 0));
    for (const r of order) {
      let best: SimAgent | null = null;
      let bs = 1e9;
      for (const b of free) {
        const sc = Math.abs(b.y - r.y) + Math.abs(b.x - r.x) * 0.4 + (['RB', 'FB'].includes(b.slot) ? 1.5 : 0);
        if (sc < bs) { bs = sc; best = b; }
      }
      if (!best || bs > 9) continue;
      best.blockTarget = r.i;
      free.delete(best);
    }
  }

  setInput(i: UserInput) {
    this.input = i;
  }

  /** Queue a discrete action from the user (juke, catch, swat ...). */
  action(name: string) {
    this.actionQueue.push(name);
  }

  /** User QB throw. power 0..1 (touch .. bullet); lead is a placement nudge. */
  throwTo(targetIdx: number, power: number, leadX = 0, leadY = 0) {
    const qb = this.agents[this.qb];
    if (!qb || this.ball.state !== 'held' || this.ball.holder !== qb.i || this.passThrown || this.pending) return false;
    if (qb.x > this.los + 0.3) return false;
    this.pending = { target: targetIdx, power, leadX, leadY };
    this.throwWind = this.t + 0.24 * mod(qb.mods, 'releaseTime', 1);
    qb.anim = 'throw';
    qb.animT = 0;
    return true;
  }

  throwAway() {
    const qb = this.agents[this.qb];
    if (!qb || this.ball.state !== 'held' || this.ball.holder !== qb.i || this.passThrown || this.pending) return false;
    if (qb.x > this.los + 0.3) return false;
    this.pending = { target: -1, power: 0.8, leadX: 0, leadY: 0, away: true };
    this.throwWind = this.t + 0.2;
    qb.anim = 'throw';
    qb.animT = 0;
    return true;
  }

  canThrow(): boolean {
    const qb = this.agents[this.qb];
    return !!qb && this.ball.state === 'held' && this.ball.holder === qb.i && !this.passThrown && !this.pending && qb.x <= this.los + 0.3 && this.phase === 'live' && !qb.down;
  }

  /** Eligible receivers for the passing HUD, in progression order. */
  receivers(): SimAgent[] {
    if (this.kind !== 'scrimmage') return [];
    const play = (this.setup as ScrimmageSetup).offPlay;
    const order = play.progression.length ? play.progression : (['X', 'Z', 'SL', 'TE1', 'RB'] as OffSlot[]);
    const out: SimAgent[] = [];
    for (const s of order) {
      const a = this.agents.find((g) => g.side === 'off' && g.slot === s);
      if (a && a.task.k === 'route') out.push(a);
    }
    for (const a of this.agents) {
      if (a.side === 'off' && a.task.k === 'route' && !out.includes(a)) out.push(a);
    }
    return out.slice(0, 5);
  }

  carrier(): SimAgent | null {
    if (this.ball.state === 'held' && this.ball.holder >= 0) return this.agents[this.ball.holder];
    return null;
  }

  // =========================================================================
  // Main loop
  // =========================================================================
  step(dt: number) {
    if (this.phase === 'pre' || this.phase === 'done') return;
    if (this.phase === 'dead') {
      this.deadT -= dt;
      for (const a of this.agents) {
        a.vx *= 0.9; a.vy *= 0.9;
        a.x += a.vx * dt; a.y += a.vy * dt;
        a.animT += dt;
      }
      if (this.ball.state === 'air' || this.ball.state === 'loose' || this.ball.state === 'kicked') this.integrateBallFree(dt, true);
      if (this.deadT <= 0) this.phase = 'done';
      return;
    }
    this.t += dt;
    for (const a of this.agents) {
      a.hist.push({ x: a.x, y: a.y, vx: a.vx, vy: a.vy });
      if (a.hist.length > 50) a.hist.shift();
      a.animT += dt;
      if (a.stun > 0) a.stun -= dt;
      if (a.noEngage > 0) a.noEngage -= dt;
      if (a.tackleCd > 0) a.tackleCd -= dt;
      if (a.slow > 0) a.slow -= dt;
      if (a.down && a.downT > 0) {
        a.downT -= dt;
        if (a.downT <= 0) { a.down = false; a.anim = 'run'; }
      }
    }
    this.processActions();
    if (this.kind === 'scrimmage') this.scrimmageBall(dt);
    else this.kickBall(dt);
    if (this.phase !== 'live') return;
    this.think(dt);
    this.engagements(dt);
    this.integrate(dt);
    this.collisions();
    this.ballFollow(dt);
    if (this.phase !== 'live') return;
    this.tackles();
    this.boundaries();
    if (this.t > 25 && this.phase === 'live') {
      const c = this.carrier();
      if (c) this.endPlayDown(c, c.x, 'tackle');
      else this.endPlayDead(this.ball.x, this.ball.y, 'Play blown dead.', false, 'fumbler');
    }
  }

  private emit(e: SimEvent) {
    this.events.push(e);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // =========================================================================
  // User actions
  // =========================================================================
  private processActions() {
    const u = this.user;
    while (this.actionQueue.length) {
      const act = this.actionQueue.shift()!;
      if (!u || u.down) continue;
      const carrier = this.carrier();
      const isCarrier = carrier === u;
      switch (act) {
        case 'juke':
        case 'spin':
        case 'stiff':
        case 'truck':
          if (isCarrier && this.t - u.moveT > 0.6) {
            u.move = act as SimAgent['move'];
            u.moveT = this.t;
            u.anim = act === 'truck' ? 'run' : (act as AnimState);
            u.animT = 0;
            if (act === 'juke') {
              const dir = this.input.my !== 0 ? Math.sign(this.input.my) : this.nearestThreatSide(u);
              u.moveDir = dir;
              const fwd = this.fwdOf(u);
              u.vy += dir * 4.5;
              u.vx *= 0.75;
              u.vx += fwd * 0.5;
            }
            if (act === 'spin') { u.vx *= 0.85; u.vy *= 0.85; }
            this.emit({ type: act === 'truck' ? 'hit' : (act as 'juke'), user: true });
          }
          break;
        case 'protect':
          u.protect = true;
          break;
        case 'dive':
          if (isCarrier || (u.side !== this.carrierSide() && carrier)) {
            if (this.t - u.moveT > 0.5) {
              u.move = 'dive';
              u.moveT = this.t;
              u.anim = 'dive';
              u.animT = 0;
              const sp = Math.hypot(u.vx, u.vy) + 2.2;
              let ang = Math.atan2(u.vy, u.vx);
              if (!isCarrier && carrier) ang = Math.atan2(carrier.y - u.y, carrier.x - u.x);
              u.vx = Math.cos(ang) * sp; u.vy = Math.sin(ang) * sp;
            }
          } else if (this.ball.state === 'air') {
            u.move = 'dive'; u.moveT = this.t; u.anim = 'dive'; u.animT = 0;
            this.catchPressed = this.t;
          }
          break;
        case 'slide':
          if (isCarrier && u.slot === 'QB' && u.x > this.los) {
            u.anim = 'slide';
            this.emit({ type: 'whistle', text: 'QB slides.' });
            this.endPlayDown(u, u.x, 'slide');
          }
          break;
        case 'catch':
          this.catchPressed = this.t;
          u.anim = 'catch';
          u.animT = 0;
          break;
        case 'swat':
          if (this.t - u.moveT > 0.5) {
            u.move = 'swat';
            u.moveT = this.t;
            u.anim = 'swat';
            u.animT = 0;
            this.catchPressed = this.t;
          }
          break;
        case 'tackle':
          if (carrier && carrier.side !== u.side) {
            const d = dist(u.x, u.y, carrier.x, carrier.y);
            if (d < 3.2 && this.t - u.moveT > 0.5) {
              u.move = Math.hypot(u.vx, u.vy) > u.top * 0.8 ? 'hitstick' : 'dive';
              u.moveT = this.t;
              u.anim = 'dive';
              u.animT = 0;
              const ang = Math.atan2(carrier.y + carrier.vy * 0.2 - u.y, carrier.x + carrier.vx * 0.2 - u.x);
              const sp = Math.max(Math.hypot(u.vx, u.vy), 3) + 2.5;
              u.vx = Math.cos(ang) * sp; u.vy = Math.sin(ang) * sp;
            }
          } else if (this.ball.state === 'air') {
            this.catchPressed = this.t;
          }
          break;
        case 'shed':
          if (u.engaged >= 0 && u.side !== this.blockingSide()) {
            const pr = Math.max(rating(u.p.attrs, 'pmv'), rating(u.p.attrs, 'fmv'), rating(u.p.attrs, 'bsh'));
            u.shed += 0.2 * (0.55 + pr / 220) * mod(u.mods, 'shedMult', 1);
            u.anim = 'block';
            u.animT = 0;
          }
          break;
        case 'punch':
          if (u.engaged >= 0) {
            const d = this.agents[u.engaged];
            d.shed = Math.max(0, d.shed - 0.3 * mod(u.mods, 'blockHold', 1));
            u.stat.blockWin += 0.3;
            u.anim = 'block';
            u.animT = 0;
          } else {
            const target = this.nearestOpp(u, 2.2, true);
            if (target && target.engaged < 0) this.engage(u, target);
          }
          break;
        case 'fair':
          if (u.task.k === 'returner' && (this.ball.state === 'kicked')) {
            u.task.fair = true;
            this.emit({ type: 'faircatch', user: true });
          }
          break;
        case 'kneel':
          if (isCarrier && u.side === 'def' && u.x >= 100) {
            this.kickResult.touchback = true;
            this.emit({ type: 'touchback' });
            this.endPlayDead(u.x, u.y, 'Touchback.');
          }
          break;
      }
    }
  }

  private nearestThreatSide(a: SimAgent): number {
    const opp = this.nearestOpp(a, 8, false);
    if (!opp) return 1;
    return opp.y > a.y ? -1 : 1;
  }

  private nearestOpp(a: SimAgent, maxD: number, freeOnly: boolean): SimAgent | null {
    let best: SimAgent | null = null;
    let bd = maxD;
    for (const o of this.agents) {
      if (o.side === a.side || o.down) continue;
      if (freeOnly && o.engaged >= 0) continue;
      const d = dist(a.x, a.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** +1 if the agent's goal is +x, -1 otherwise. */
  fwdOf(a: SimAgent): number {
    return a.side === 'off' ? 1 : -1;
  }

  carrierSide(): Side | null {
    const c = this.carrier();
    return c ? c.side : null;
  }

  /** Side that is currently blocking (team with the ball, or offense pre-snap). */
  blockingSide(): Side {
    const c = this.carrier();
    if (c) return c.side;
    if (this.ball.state === 'kicked' || (this.ball.state === 'air' && this.ball.kind !== 'pass')) return 'def';
    return 'off';
  }

  // =========================================================================
  // Ball handling for scrimmage plays
  // =========================================================================
  private scrimmageBall(dt: number) {
    const b = this.ball;
    const s = this.setup as ScrimmageSetup;
    if (b.state === 'snap') {
      const qb = this.agents[b.target];
      const k = Math.min(1, this.t / b.tArrive);
      b.x = this.los + (qb.x - this.los) * k;
      b.y = b.y + (qb.y - b.y) * k;
      b.z = 0.4 + 0.7 * k;
      if (k >= 1) { b.state = 'held'; b.holder = qb.i; }
      return;
    }
    // Handoff
    if (b.state === 'held' && s.offPlay.type === 'run' && !this.handedOff) {
      const qb = this.agents[this.qb];
      const runner = this.agents.find((a) => a.task.k === 'runner');
      if (runner && qb && runner !== qb && b.holder === qb.i) {
        const tk = runner.task as Extract<Task, { k: 'runner' }>;
        const minT = tk.style === 'draw' ? 0.95 : tk.style === 'outside' ? 0.45 : 0.55;
        if ((this.t >= minT && dist(qb.x, qb.y, runner.x, runner.y) < 1.4) || this.t > 1.7) {
          b.holder = runner.i;
          this.handedOff = true;
          this.carrierSince = this.t;
          this.emit({ type: 'handoff' });
          this.revealRun();
        }
      } else if (runner && runner === qb && b.holder === qb.i && !this.handedOff) {
        this.handedOff = true;
        this.carrierSince = this.t;
        const tk = runner.task as Extract<Task, { k: 'runner' }>;
        if (this.t > (tk.style === 'draw' ? 0.9 : 0.3)) this.revealRun();
        else this.handedOff = false;
      }
    }
    // Pending throw
    if (this.pending && this.t >= this.throwWind) {
      const qb = this.agents[this.qb];
      if (b.state === 'held' && b.holder === qb.i && !qb.down) this.releasePass(qb, this.pending);
      this.pending = null;
    }
    // QB scramble past LOS
    if (b.state === 'held' && b.holder === this.qb && !this.qbCrossed) {
      const qb = this.agents[this.qb];
      if (qb.x > this.los + 0.5) {
        this.qbCrossed = true;
        this.scramble = s.offPlay.type === 'pass';
        this.carrierSince = this.t;
        this.revealRun();
      }
    }
    if (b.state === 'air') this.passFlight(dt);
    else if (b.state === 'loose') this.integrateBallFree(dt, false);
  }

  /** Defenders begin reacting to a run/carrier after their individual read delay. */
  private revealRun() {
    if (this.defenseKnowsRun >= 0) return;
    this.defenseKnowsRun = this.t;
    const carrier = this.carrier();
    for (const d of this.agents) {
      if (carrier && d.side === carrier.side) continue;
      const prc = rating(d.p.attrs, 'prc', 60);
      let delay = d.diff.react * 0.6 + (100 - prc) * 0.003 + this.rng.range(0, 0.08);
      if (d.task.k === 'zone' && /deep/.test(d.task.zone)) delay += 0.3;
      if (d.task.k === 'man') delay += 0.12;
      if (d.user) delay = 0;
      // defenders already tracking a thrown ball react to the catch quickly
      if (this.passThrown && d.readT >= 0) d.readT = Math.min(Math.max(d.readT, this.t), this.t + 0.12);
      else d.readT = this.t + delay;
    }
  }

  private releasePass(qb: SimAgent, p: { target: number; power: number; leadX: number; leadY: number; away?: boolean }) {
    const a = qb.p.attrs;
    const power = clamp(p.power, 0, 1);
    const thp = rating(a, 'thp', 60);
    const speed = (16 + thp * 0.12) * (0.72 + 0.36 * power) * mod(qb.mods, 'throwSpeed', 1);
    let tx: number, ty: number, T: number;
    if (p.away || p.target < 0) {
      // Throw it out of bounds near the closest sideline.
      ty = qb.y > MID_Y ? FIELD_W + 3 : -3;
      tx = Math.max(this.los + 3, qb.x + 8);
      const d = dist(qb.x, qb.y, tx, ty);
      T = d / speed;
      this.launchBall(qb, tx, ty, T, -1, 'pass');
      this.passThrown = true;
      this.notes.push('Threw it away');
      this.emit({ type: 'throw' });
      return;
    }
    const r = this.agents[p.target];
    // Predict receiver position along route (two iterations).
    let px = r.x, py = r.y;
    T = dist(qb.x, qb.y, px, py) / speed;
    for (let k = 0; k < 3; k++) {
      const pr = this.predict(r, T);
      px = pr.x; py = pr.y;
      T = dist(qb.x, qb.y, px, py) / speed;
    }
    // Lead / placement nudge (in yards).
    px += clamp(p.leadX, -1, 1) * 2.2;
    py += clamp(p.leadY, -1, 1) * 2.2;
    // Arm strength limits how far the ball can travel in the air.
    const maxD = this.maxThrow(qb);
    let airDist = dist(qb.x, qb.y, px, py);
    if (airDist > maxD) {
      px = qb.x + ((px - qb.x) / airDist) * maxD;
      py = qb.y + ((py - qb.y) / airDist) * maxD;
      airDist = maxD;
    }
    // Accuracy
    const air = px - this.los;
    let acc = air < 10 ? rating(a, 'sac') : air < 20 ? rating(a, 'mac') : rating(a, 'dac');
    let sigma = (100 - acc) * 0.0012 + 0.006;
    if (air >= 20) sigma *= mod(qb.mods, 'deepAcc', 1);
    // pressure
    let pressure = 0;
    for (const d of this.agents) {
      if (d.side === 'off' || d.engaged >= 0 || d.down) continue;
      const dd = dist(d.x, d.y, qb.x, qb.y);
      if (dd < 2.5) pressure = Math.max(pressure, 1 - dd / 2.5);
    }
    if (pressure > 0) {
      sigma *= 1 + pressure * 1.3 * (1 - rating(a, 'tup') / 150) * mod(qb.mods, 'pressureAcc', 1);
      if (qb.user) this.notes.push('Under pressure');
    }
    const qbSpeed = Math.hypot(qb.vx, qb.vy);
    if (qbSpeed > 2.5) sigma *= 1 + (qbSpeed / 8) * (1 - rating(a, 'tor') / 120) * mod(qb.mods, 'runAcc', 1);
    if (power > 0.92) sigma *= 1.08;
    if (qb.user) sigma *= (this.setup as ScrimmageSetup).oppDiff.userAcc;
    const errPerp = this.rng.normal(0, sigma * airDist);
    const errAlong = this.rng.normal(0, sigma * airDist * 0.6);
    const ux = (px - qb.x) / (airDist || 1), uy = (py - qb.y) / (airDist || 1);
    tx = px + ux * errAlong - uy * errPerp;
    ty = py + uy * errAlong + ux * errPerp;
    // Recompute flight time for perturbed target
    T = dist(qb.x, qb.y, tx, ty) / speed;
    // Touch passes take a higher arc (slower horizontal speed)
    if (power < 0.45) T *= 1.12;
    this.airYards = Math.round(px - this.los);
    this.launchBall(qb, tx, ty, T, r.i, 'pass');
    this.passThrown = true;
    for (const ag of this.agents) ag.ballChance = false;
    this.emit({ type: 'throw', user: qb.user });
    // Receivers and defenders read the throw
    for (const d of this.agents) {
      if (d.side !== 'def') { d.readT = this.t + 0.12; continue; }
      const awr = rating(d.p.attrs, 'awr', 60);
      d.readT = this.t + (d.user ? 0 : d.diff.react * 0.6 + (100 - awr) * 0.003 + this.rng.range(0, 0.1));
    }
  }

  private launchBall(from: SimAgent, tx: number, ty: number, T: number, target: number, kind: Ball['kind']) {
    const b = this.ball;
    b.state = 'air';
    b.kind = kind;
    b.x = from.x + Math.cos(from.face) * 0.3;
    b.y = from.y + Math.sin(from.face) * 0.3;
    b.z = 2.0;
    T = Math.max(0.25, T);
    b.vx = (tx - b.x) / T;
    b.vy = (ty - b.y) / T;
    b.vz = (CATCH_H - b.z) / T + 0.5 * G * T;
    b.tx = tx; b.ty = ty;
    b.target = target;
    b.thrower = from.i;
    b.t0 = this.t;
    b.tArrive = this.t + T;
    b.holder = -1;
    b.touchedBy = null;
    if (target >= 0) this.ballTargetMemo = target;
  }

  /** Predict where an agent will be in T seconds by stepping its route with the movement model. */
  predict(a: SimAgent, T: number): { x: number; y: number } {
    if (a.task.k === 'route' && !a.userActive) {
      const tk = a.task;
      let x = a.x, y = a.y, vx = a.vx, vy = a.vy, idx = tk.idx;
      const dt = 1 / 30;
      const top = a.top * 0.97;
      for (let t = 0; t < T; t += dt) {
        let dvx = 0, dvy = 0, sp = top;
        if (this.t + t < tk.delay) { sp = 0; }
        else if (idx < tk.pts.length) {
          const p = tk.pts[idx];
          const d = dist(x, y, p.x, p.y);
          if (d < (idx === tk.pts.length - 1 ? 0.7 : 1.1)) idx++;
          dvx = p.x - x; dvy = p.y - y;
        } else if (tk.stop) { sp = 0; }
        else {
          const p1 = tk.pts[tk.pts.length - 2] ?? { x: a.startX, y: a.startY };
          const p2 = tk.pts[tk.pts.length - 1];
          dvx = p2.x - p1.x; dvy = p2.y - p1.y;
          if (y < 3.2 && dvy < 0) dvy = 0;
          if (y > FIELD_W - 3.2 && dvy > 0) dvy = 0;
          if (x > 106) dvx = 0;
        }
        const n = Math.hypot(dvx, dvy);
        const tx = n > 0.05 ? (dvx / n) * sp : 0, ty = n > 0.05 ? (dvy / n) * sp : 0;
        let ax = tx - vx, ay = ty - vy;
        let maxA = a.acc * dt;
        const cs = Math.hypot(vx, vy);
        if (cs > 3 && Math.hypot(tx, ty) > 0.5 && Math.abs(angDiff(Math.atan2(ty, tx), Math.atan2(vy, vx))) > 0.6) maxA *= a.agi;
        const m = Math.hypot(ax, ay);
        if (m > maxA) { ax = (ax / m) * maxA; ay = (ay / m) * maxA; }
        vx += ax; vy += ay;
        x += vx * dt; y += vy * dt;
      }
      return { x, y: clamp(y, 0.5, FIELD_W - 0.5) };
    }
    return { x: a.x + a.vx * T, y: clamp(a.y + a.vy * T, 0.5, FIELD_W - 0.5) };
  }

  private passFlight(dt: number) {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.vz -= G * dt;
    b.x += this.wind.x * dt * 0.2;
    // Who can play the ball?
    if (b.z < 3.3) {
      const cands: { a: SimAgent; d: number }[] = [];
      for (const a of this.agents) {
        if (a.down || a.ballChance || a.stun > 0.2 || a.slot === 'QB') continue;
        if (a.side === 'off' && a.i !== b.target && a.task.k !== 'route') continue;
        const reachZ = 2.6 + rating(a.p.attrs, 'jmp', 60) * 0.006 + (a.move === 'dive' && this.t - a.moveT < 0.6 ? -0.8 : 0);
        if (b.z > reachZ) continue;
        let radius = (a.side === 'off' ? (a.i === b.target ? 1.4 : 1.1) : 1.05) * mod(a.mods, 'catchRadius', 1);
        if (a.move === 'dive' && this.t - a.moveT < 0.6) radius += 0.7;
        if (a.move === 'swat' && this.t - a.moveT < 0.6) radius += 0.35;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < radius) cands.push({ a, d });
      }
      if (cands.length) {
        // Resolve the defender(s) first if they are closer, otherwise the receiver.
        cands.sort((p, q) => p.d - q.d);
        for (const c of cands) {
          c.a.ballChance = true;
          const res = c.a.side === 'def' ? this.defendPass(c.a, c.d, cands) : this.attemptCatch(c.a, c.d, cands);
          if (res) return;
        }
      }
    }
    if (b.z <= 0.05) {
      b.z = 0;
      this.incomplete(b.target >= 0 && b.target !== -1 ? 'Pass falls incomplete.' : 'Thrown away.');
    } else if (b.x > 112 || b.y < -4 || b.y > FIELD_W + 4) {
      this.incomplete('Pass sails out of bounds.');
    }
  }

  private defendPass(d: SimAgent, dd: number, cands: { a: SimAgent; d: number }[]): boolean {
    const r = cands.find((c) => c.a.i === this.ball.target);
    const recvCloser = r ? r.d < dd - 0.25 : false;
    const ball = rating(d.p.attrs, 'cth', 45);
    const cov = Math.max(rating(d.p.attrs, 'mcv', 50), rating(d.p.attrs, 'zcv', 50));
    const userBoost = d.user && this.t - this.catchPressed < 0.6 ? 0.25 : 0;
    const swat = d.move === 'swat' && this.t - d.moveT < 0.6;
    let pInt = (0.06 + (ball - 50) * 0.0045 + mod(d.mods, 'intBonus', 0)) * d.diff.intel;
    let pBreak = 0.22 + (cov - 60) * 0.006 + userBoost;
    if (recvCloser) { pInt *= 0.35; pBreak *= 0.5; }
    if (!r) { pInt *= 1.6; pBreak += 0.15; }
    if (swat) { pInt *= 0.5; pBreak += 0.3; }
    if (d.user) { pInt += userBoost * 0.5; if (!(this.t - this.catchPressed < 0.6)) { pInt *= 0.6; pBreak *= 0.6; } }
    const roll = this.rng.next();
    if (roll < pInt) {
      this.interception(d);
      return true;
    }
    if (roll < pInt + pBreak) {
      this.pbuBy = d.i;
      this.emit({ type: 'deflect', user: d.user, x: d.x, y: d.y });
      if (d.user) { this.userGrade += 1.5; this.notes.push('Pass breakup'); }
      // ball is batted down
      this.ball.vx *= 0.25; this.ball.vy *= 0.25; this.ball.vz = 2;
      this.ball.target = -2;
      this.ball.touchedBy = 'def';
      this.incomplete('Pass broken up.');
      return true;
    }
    return false;
  }

  private attemptCatch(r: SimAgent, dr: number, cands: { a: SimAgent; d: number }[]): boolean {
    const b = this.ball;
    const cth = rating(r.p.attrs, 'cth', 50);
    const cit = rating(r.p.attrs, 'cit', 50);
    let p = 0.84 + (cth - 70) * 0.006;
    // Contested?
    let contest = 99;
    for (const a of this.agents) {
      if (a.side === r.side || a.down) continue;
      contest = Math.min(contest, dist(a.x, a.y, r.x, r.y));
    }
    if (contest < 1.4) {
      const c = 0.66 + (cit - 60) * 0.006 + mod(r.mods, 'contested', 0) + (r.user && this.t - this.catchPressed < 0.7 ? 0.12 : 0);
      p *= clamp(c, 0.3, 1);
    }
    if (dr > 0.8) p -= (dr - 0.8) * 0.2;
    const bspeed = Math.hypot(b.vx, b.vy);
    if (bspeed > 22 && b.tArrive - b.t0 < 0.6) p -= 0.08;
    if (r.move === 'dive' && this.t - r.moveT < 0.6) p -= 0.1;
    if (r.user) {
      const timed = this.t - this.catchPressed < 0.7;
      p += (this.setup as ScrimmageSetup).oppDiff.catchHelp;
      if (!timed) p *= 0.72;
      else p += 0.05;
    }
    // Drop chance reduction from ability
    const dropMult = mod(r.mods, 'dropMult', 1);
    p = 1 - (1 - clamp(p, 0.02, 0.985)) * dropMult;
    // Out of bounds catches don't count
    const inBounds = r.y > 0.1 && r.y < FIELD_W - 0.1 && r.x < 110;
    if (this.rng.next() < p) {
      if (!inBounds) {
        this.incomplete('Caught out of bounds.');
        return true;
      }
      // Complete!
      b.state = 'held';
      b.holder = r.i;
      this.passComplete = true;
      this.catchX = r.x;
      this.carrierSince = this.t;
      r.anim = 'catch';
      r.animT = 0;
      r.task = { k: 'none' };
      this.emit({ type: 'catch', user: r.user, x: r.x, y: r.y, big: contest < 1.2 });
      if (r.user) { this.userGrade += contest < 1.4 ? 1.5 : 1; }
      this.revealRun();
      if (r.x >= 100) this.touchdown(r);
      return true;
    }
    if (b.target === r.i) {
      if (contest > 1.6 && dr < 0.9) {
        this.dropped = true;
        this.emit({ type: 'drop', user: r.user, x: r.x, y: r.y });
        if (r.user) { this.userGrade -= 1.5; this.notes.push('Dropped pass'); }
      }
      b.vx *= 0.3; b.vy *= 0.3; b.vz = 1.5;
      b.target = -2;
      this.incomplete(this.dropped ? 'Dropped!' : 'Pass incomplete, contested at the catch point.');
      return true;
    }
    return false;
  }

  private interception(d: SimAgent) {
    const b = this.ball;
    b.state = 'held';
    b.holder = d.i;
    this.turnover = true;
    this.intBy = d.i;
    this.carrierSince = this.t;
    d.anim = 'catch';
    d.animT = 0;
    d.task = { k: 'none' };
    this.emit({ type: 'int', user: d.user, x: d.x, y: d.y, big: true });
    if (d.user) { this.userGrade += 3; this.notes.push('INTERCEPTION'); }
    const qb = this.agents[this.qb];
    if (qb?.user) { this.userGrade -= 2.5; this.notes.push('Threw an interception'); }
    // Everyone switches: offense pursues, defense blocks.
    for (const a of this.agents) {
      a.engaged = -1;
      a.readT = a.side === 'off' ? this.t + 0.25 + this.rng.range(0, 0.3) : this.t;
    }
  }

  private incomplete(text: string) {
    const b = this.ball;
    if (b.target >= 0) {
      const r = this.agents[b.target];
      if (r && r.manDef !== undefined && !this.dropped) {
        const d = this.agents[r.manDef];
        if (d.user && dist(d.x, d.y, r.x, r.y) < 2) { this.userGrade += 0.5; }
      }
    }
    // Defensive pass interference check
    const s = this.setup as ScrimmageSetup;
    if (s.penalties && b.target >= 0 && b.kind === 'pass' && this.airYards > 8) {
      const r = this.agents[b.target];
      for (const d of this.agents) {
        if (d.side !== 'def') continue;
        if (dist(d.x, d.y, r.x, r.y) < 0.65 && dist(r.x, r.y, b.tx, b.ty) < 2 && this.rng.chance(0.25)) {
          this.penalty = { name: 'Defensive Pass Interference', against: 'def', yards: Math.round(b.tx - this.los), spot: Math.min(99, Math.round(b.tx)), autoFirst: true };
          this.emit({ type: 'flag', text: 'Pass interference!' });
          if (d.user) { this.userGrade -= 1.5; this.notes.push('Pass interference'); }
          break;
        }
      }
    }
    this.emit({ type: 'incomplete', text });
    b.state = 'loose';
    this.whistle(text, true);
    this.finishScrimmage('incomplete', this.los, this.ball.y);
  }

  private integrateBallFree(dt: number, deadFlight: boolean) {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.vz -= G * dt;
    if (b.z <= 0.12) {
      b.z = 0.12;
      if (Math.abs(b.vz) > 1.5) {
        b.vz = -b.vz * 0.38;
        b.vx *= 0.65; b.vy *= 0.65;
        b.bounced++;
        b.vx += this.rng.normal(0, 1.2); b.vy += this.rng.normal(0, 1.2);
      } else {
        b.vz = 0;
        b.vx *= 1 - 2.5 * dt;
        b.vy *= 1 - 2.5 * dt;
      }
    }
    if (deadFlight) return;
    if (b.state === 'loose') {
      // Recover fumbles
      for (const a of this.agents) {
        if (a.down || a.stun > 0) continue;
        if (dist(a.x, a.y, b.x, b.y) < 0.9 && b.z < 1.2) {
          const p = 0.12 + rating(a.p.attrs, 'awr', 60) * 0.002;
          if (this.rng.next() < p) {
            b.state = 'held';
            b.holder = a.i;
            this.recoveredBy = a.i;
            this.carrierSince = this.t;
            a.task = { k: 'none' };
            if (a.side === 'def') this.turnover = true;
            else this.turnover = false;
            this.emit({ type: 'recover', user: a.user, x: a.x, y: a.y, big: a.side === 'def' });
            if (a.user) { this.userGrade += a.side === 'def' ? 2 : 1; this.notes.push('Fumble recovery'); }
            for (const o of this.agents) { o.engaged = -1; o.readT = this.t + 0.2; }
            // A player who recovers on the ground is down by contact
            if (this.rng.chance(0.65)) this.endPlayDown(a, a.x, 'recovered');
            return;
          }
        }
      }
      if (b.y < 0 || b.y > FIELD_W) {
        this.emit({ type: 'oob' });
        // Out of bounds fumble: possession stays with the team that fumbled
        this.endPlayDead(b.x, clamp(b.y, 0.5, FIELD_W - 0.5), 'Fumble rolls out of bounds.', undefined, 'fumbler');
      } else if (b.x > 110 || b.x < -10) {
        this.endPlayDead(b.x, b.y, 'Ball out of the end zone.', undefined, 'fumbler');
      }
    }
  }

  // =========================================================================
  // Kicks
  // =========================================================================
  private kickBall(dt: number) {
    const s = this.setup as KickSetup;
    const b = this.ball;
    const kicker = this.agents.find((a) => a.task.k === 'kick')!;
    if (b.state === 'snap') {
      const tgt = this.agents[b.target];
      const k = Math.min(1, this.t / b.tArrive);
      b.x = this.los + (tgt.x - this.los) * k;
      b.y = b.y + (tgt.y - b.y) * k;
      b.z = 0.3 + 0.6 * k;
      if (k >= 1) { b.state = 'held'; b.holder = tgt.i; }
      return;
    }
    const kickT = s.kind === 'punt' ? 1.85 : s.kind === 'kickoff' ? 0.9 : 1.25;
    if (!this.kickFired && this.t >= kickT && (b.state === 'held' || s.kind === 'kickoff')) {
      this.kickFired = true;
      kicker.anim = 'kick';
      kicker.animT = 0;
      if (s.kind === 'punt') { b.x = kicker.x + 0.5; b.y = kicker.y; }
      if (s.kind === 'fg' || s.kind === 'xp') {
        // chance of a block: unblocked rusher near the holder
        const blocked = this.agents.some((a) => a.side === 'def' && a.engaged < 0 && dist(a.x, a.y, this.los - 7, s.hashY) < 2.2);
        if (blocked && this.rng.chance(0.55)) {
          this.kickResult.blocked = true;
          this.emit({ type: 'nogood', text: 'BLOCKED!' });
          b.state = 'loose'; b.vx = this.rng.normal(-2, 2); b.vy = this.rng.normal(0, 3); b.vz = 3;
          this.whistle('Kick is blocked!', true);
          this.finishKick();
          return;
        }
      }
      this.launchKick(s, kicker);
      this.emit({ type: 'kick', user: kicker.user });
    }
    if (b.state === 'kicked' || (b.state === 'loose' && this.ball.kind !== 'snap')) {
      this.kickFlight(dt, s);
    }
  }

  private kickParams(s: KickSetup, kicker: SimAgent): KickParams {
    if (s.kick) return s.kick;
    // AI kick: rating-based power & accuracy
    const kac = rating(kicker.p.attrs, 'kac', 70);
    let power = clamp(this.rng.normal(0.82, 0.08), 0.6, 1);
    if (s.kind === 'fg' || s.kind === 'xp') {
      const distYds = 100 - this.los + 17;
      const maxR = 55 + (rating(kicker.p.attrs, 'kpw', 70) - 60) * 0.45;
      power = clamp(((distYds + 9) / maxR - 0.55) / 0.45 + this.rng.normal(0.06, 0.05), 0.2, 1);
    }
    if (s.kind === 'punt') power = clamp(0.92 + this.rng.normal(0, 0.05), 0.6, 1);
    const accuracy = this.rng.normal(0, (100 - kac) * 0.0065 + 0.02);
    return { power: clamp(power, 0, 1), accuracy: clamp(accuracy, -1, 1), aim: 0 };
  }

  private launchKick(s: KickSetup, kicker: SimAgent) {
    const kp = this.kickParams(s, kicker);
    const b = this.ball;
    const kpw = rating(kicker.p.attrs, 'kpw', 70);
    const maxRange = (55 + (kpw - 60) * 0.45) * mod(kicker.mods, 'kickPower', 1);
    b.state = 'kicked';
    b.kind = s.kind === 'punt' ? 'punt' : s.kind === 'kickoff' ? 'kickoff' : 'kick';
    b.holder = -1;
    b.z = 0.3;
    if (s.kind === 'fg' || s.kind === 'xp') {
      const angle = (38 * Math.PI) / 180;
      const range = maxRange * (0.55 + 0.45 * kp.power);
      const v = Math.sqrt((range * G) / Math.sin(2 * angle));
      // aim at the middle of the uprights
      const gx = 110, gy = MID_Y;
      const baseYaw = Math.atan2(gy - b.y, gx - b.x);
      const kac = rating(kicker.p.attrs, 'kac', 70);
      const yawErr = (kp.accuracy * 5.5 + this.rng.normal(0, 0.6 + (100 - kac) * 0.05)) * (Math.PI / 180);
      const yaw = baseYaw + yawErr;
      b.vx = Math.cos(yaw) * Math.cos(angle) * v;
      b.vy = Math.sin(yaw) * Math.cos(angle) * v;
      b.vz = Math.sin(angle) * v;
      this.kickResult.dist = Math.round(100 - this.los + 17);
    } else if (s.kind === 'punt') {
      const angle = (52 * Math.PI) / 180;
      const range = maxRange * (0.55 + 0.45 * kp.power);
      const v = Math.sqrt((range * G) / Math.sin(2 * angle));
      const aimErr = (kp.accuracy * 6 + this.rng.normal(0, 2)) * mod(kicker.mods, 'puntAim', 1);
      const yaw = (kp.aim * 14 + aimErr) * (Math.PI / 180);
      b.vx = Math.cos(yaw) * Math.cos(angle) * v;
      b.vy = Math.sin(yaw) * Math.cos(angle) * v;
      b.vz = Math.sin(angle) * v;
    } else {
      const angle = (44 * Math.PI) / 180;
      const range = (maxRange * 1.18) * (0.55 + 0.45 * kp.power);
      const v = Math.sqrt((range * G) / Math.sin(2 * angle));
      const yaw = (kp.aim * 12 + kp.accuracy * 5) * (Math.PI / 180);
      b.vx = Math.cos(yaw) * Math.cos(angle) * v;
      b.vy = Math.sin(yaw) * Math.cos(angle) * v;
      b.vz = Math.sin(angle) * v;
    }
    b.t0 = this.t;
    // returner target
    const flight = (2 * b.vz) / G;
    b.tx = b.x + b.vx * flight;
    b.ty = b.y + b.vy * flight;
    b.tArrive = this.t + flight;
    this.kickResult.landX = b.tx;
  }

  private kickFlight(dt: number, s: KickSetup) {
    const b = this.ball;
    const prevX = b.x, prevZ = b.z;
    b.x += (b.vx + this.wind.x * 0.4) * dt;
    b.y += (b.vy + this.wind.y * 0.4) * dt;
    b.z += b.vz * dt;
    b.vz -= G * dt;
    if (s.kind === 'fg' || s.kind === 'xp') {
      if (prevX < 110 && b.x >= 110) {
        const zAt = prevZ + (b.z - prevZ) * ((110 - prevX) / (b.x - prevX || 1));
        const good = Math.abs(b.y - MID_Y) < 3.08 && zAt > 3.33;
        this.kickResult.good = good;
        this.emit({ type: good ? 'good' : 'nogood', big: true });
        this.whistle(good ? 'The kick is GOOD!' : 'The kick is NO GOOD.', true);
        this.finishKick();
        return;
      }
      if (b.z <= 0.1 && b.vz < 0) {
        this.kickResult.good = false;
        this.emit({ type: 'nogood', big: true });
        this.whistle('The kick falls short. NO GOOD.', true);
        this.finishKick();
      }
      return;
    }
    // Punts & kickoffs
    const ret = this.agents.find((a) => a.task.k === 'returner');
    if (b.state === 'kicked' && ret && b.z < 2.6 && b.vz < 0) {
      const d = dist(ret.x, ret.y, b.x, b.y);
      if (d < 1.3) {
        // Fair catch decision (AI): nearest coverage within 5 yards
        let near = 99;
        for (const a of this.agents) if (a.side === 'off') near = Math.min(near, dist(a.x, a.y, ret.x, ret.y));
        const task = ret.task as Extract<Task, { k: 'returner' }>;
        if (!ret.user && s.kind === 'punt' && near < 6) task.fair = true;
        const muff = this.rng.next() < 0.03 + (70 - rating(ret.p.attrs, 'cth', 65)) * 0.001;
        if (muff) {
          this.kickResult.muff = true;
          b.state = 'loose';
          b.vz = 2; b.vx = this.rng.normal(0, 3); b.vy = this.rng.normal(0, 3);
          this.emit({ type: 'fumble', text: 'Muffed!' });
          return;
        }
        b.state = 'held';
        b.holder = ret.i;
        this.carrierSince = this.t;
        ret.anim = 'catch'; ret.animT = 0;
        this.emit({ type: 'catch', user: ret.user });
        if (task.fair) {
          this.kickResult.fair = true;
          this.emit({ type: 'faircatch' });
          this.endPlayDead(ret.x, ret.y, 'Fair catch.');
          return;
        }
        // Kickoff caught deep in the end zone: AI takes a knee
        if (s.kind === 'kickoff' && ret.x > 103 && !ret.user) {
          this.kickResult.touchback = true;
          this.emit({ type: 'touchback' });
          this.endPlayDead(ret.x, ret.y, 'Touchback.');
          return;
        }
        for (const a of this.agents) a.readT = this.t + (a.side === 'off' ? 0.1 : 0);
        return;
      }
    }
    if (b.z <= 0.12 && b.state === 'kicked') {
      // ball lands untouched
      if (b.x >= 100) {
        this.kickResult.touchback = true;
        this.emit({ type: 'touchback' });
        this.endPlayDead(100, b.y, 'Touchback.');
        return;
      }
      b.state = 'loose';
      b.kind = s.kind === 'punt' ? 'punt' : 'kickoff';
    }
    if (b.state === 'loose') {
      this.integrateBallFree(dt, true);
      if (b.y < 0 || b.y > FIELD_W) {
        this.kickResult.oob = true;
        this.endPlayDead(b.x, clamp(b.y, 0.5, FIELD_W - 0.5), 'Out of bounds.');
        return;
      }
      if (b.x >= 100) {
        this.kickResult.touchback = true;
        this.endPlayDead(100, b.y, 'Touchback.');
        return;
      }
      // Kicking team downs it / receiving team picks it up
      for (const a of this.agents) {
        if (a.down) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < 1 && b.z < 1) {
          if (a.side === 'off' && (s.kind === 'punt' && !this.kickResult.muff)) {
            this.kickResult.downed = true;
            this.endPlayDead(b.x, b.y, 'Downed by the coverage team.');
            return;
          }
          if (this.rng.chance(0.2)) {
            b.state = 'held';
            b.holder = a.i;
            this.carrierSince = this.t;
            if (a.side === 'off') {
              this.turnover = true;
              this.emit({ type: 'recover', big: true });
              this.endPlayDown(a, a.x, 'recovered');
            }
            return;
          }
        }
      }
      if (Math.hypot(b.vx, b.vy) < 0.4 && Math.abs(b.vz) < 0.5 && this.t - b.t0 > 1) {
        this.kickResult.downed = true;
        this.endPlayDead(b.x, b.y, 'Ball comes to rest.');
      }
    }
  }

  // =========================================================================
  // AI
  // =========================================================================
  private think(dt: number) {
    const carrier = this.carrier();
    for (const a of this.agents) {
      if (a.down) { a.vx *= 0.85; a.vy *= 0.85; const sd = a as SimAgent & { dvx: number; dvy: number }; sd.dvx = 0; sd.dvy = 0; continue; }
      let dx = 0, dy = 0, speed = 0;
      if (a.user && this.userControlled(a)) {
        const m = Math.min(1, Math.hypot(this.input.mx, this.input.my));
        const target = m * (this.input.sprint ? a.top : a.top * 0.86) * (a.protect ? 0.9 : 1);
        if (m > 0.05) { dx = this.input.mx / m; dy = this.input.my / m; }
        speed = target;
      } else {
        const d = this.aiDesire(a, carrier);
        dx = d.dx; dy = d.dy; speed = d.speed;
      }
      if (a.slow > 0) speed *= 0.55;
      if (a.stun > 0) speed *= 0.15;
      if (carrier === a) speed *= 0.97;
      const n = Math.hypot(dx, dy);
      const st = a as SimAgent & { dvx: number; dvy: number };
      st.dvx = n > 1e-6 ? (dx / n) * speed : 0;
      st.dvy = n > 1e-6 ? (dy / n) * speed : 0;
    }
    void dt;
  }

  private userControlled(a: SimAgent): boolean {
    if (a.userActive) return true;
    if (Math.hypot(this.input.mx, this.input.my) > 0.2) {
      a.userActive = true;
      return true;
    }
    return false;
  }

  private aiDesire(a: SimAgent, carrier: SimAgent | null): { dx: number; dy: number; speed: number } {
    const tk = a.task;
    const b = this.ball;
    // Ball carrier logic (a quarterback in the pocket keeps running his task)
    const qbPocket = a.i === this.qb && !this.qbCrossed && (tk.k === 'qbPass' || tk.k === 'qbHand') && !this.passThrown;
    if (carrier === a && !qbPocket) return this.runnerAI(a);
    // Pass in the air: react
    if (b.state === 'air' && b.kind === 'pass' && this.t >= a.readT && a.readT >= 0) {
      if (a.side === 'off' && a.i === b.target) return this.toward(a, b.tx, b.ty, a.top, 0.25);
      if (a.side === 'def') {
        const tLeft = b.tArrive - this.t;
        const dLand = dist(a.x, a.y, b.tx, b.ty);
        if (dLand < a.top * (tLeft + 0.35) + 1.2) return this.toward(a, b.tx, b.ty, a.top, 0.1);
        const r = b.target >= 0 ? this.agents[b.target] : null;
        if (r) return this.pursue(a, r);
      }
    }
    // Kicks in the air
    if (b.state === 'kicked' || (b.state === 'loose' && (b.kind === 'punt' || b.kind === 'kickoff'))) {
      if (tk.k === 'returner') {
        return this.toward(a, b.state === 'kicked' ? b.tx : b.x, b.state === 'kicked' ? b.ty : b.y, a.top, 0.2);
      }
      if (a.side === 'off' && this.kind !== 'fg' && this.kind !== 'xp') {
        const ret = this.agents.find((g) => g.task.k === 'returner');
        const tx = b.state === 'kicked' ? b.tx - 4 : b.x, ty = b.state === 'kicked' ? b.ty : b.y;
        if (ret && a.task.k !== 'kick') return this.toward(a, tx + (a.i % 3 - 1) * 1.5, ty + ((a.i % 5) - 2) * 2.2, a.top, 0);
      }
      if (a.side === 'def' && this.kind !== 'fg' && this.kind !== 'xp' && b.state === 'kicked') {
        const ret = this.agents.find((g) => g.task.k === 'returner');
        if (ret) return this.escortAI(a, ret);
      }
    }
    // Loose ball: nearest players go for it
    if (b.state === 'loose' && b.kind !== 'snap' && b.kind !== 'kick') {
      if (dist(a.x, a.y, b.x, b.y) < 10) return this.toward(a, b.x, b.y, a.top, 0);
    }
    // Carrier exists on the other side: pursue after read delay
    if (carrier && carrier.side !== a.side) {
      const qbInPocket = carrier.i === this.qb && !this.qbCrossed && !this.handedOff && b.state === 'held';
      if (qbInPocket) {
        // Pass rush / coverage continue; rushers target the QB
        if (tk.k === 'rush') return this.rushAI(a, carrier);
      } else if (a.readT >= 0 && this.t >= a.readT) {
        if (a.engaged >= 0) return { dx: carrier.x - a.x, dy: carrier.y - a.y, speed: a.top };
        return this.pursue(a, carrier);
      } else if (this.kind !== 'scrimmage' && a.side === 'off' && this.ball.state === 'held') {
        return this.pursue(a, carrier);
      }
    }
    // Carrier on my side: block for him
    if (carrier && carrier.side === a.side && carrier !== a) {
      const qbInPocket = carrier.i === this.qb && !this.qbCrossed && !this.handedOff && b.state === 'held';
      if (!qbInPocket && (this.t - this.carrierSince > 0.3 || this.kind !== 'scrimmage')) {
        if (tk.k !== 'passBlock' && tk.k !== 'runBlock' && tk.k !== 'lead' || this.passComplete || this.turnover || this.kind !== 'scrimmage' || this.scramble) {
          return this.escortAI(a, carrier);
        }
      }
    }
    switch (tk.k) {
      case 'route': return this.routeAI(a, tk);
      case 'passBlock': return this.passBlockAI(a);
      case 'runBlock': return this.runBlockAI(a, tk.holeY);
      case 'lead': return this.leadAI(a, tk.holeY);
      case 'runner': return this.toMesh(a, tk);
      case 'fake': {
        if (this.t < 0.9) return this.toward(a, this.los - 2, tk.holeY, a.top * 0.85, 0);
        return this.toward(a, this.los + 1, tk.holeY, a.top * 0.5, 0.5);
      }
      case 'qbPass': {
        if (this.t < 1.2) return this.toward(a, tk.setX, tk.setY, a.top * 0.75, 0.2);
        return this.pocketAI(a);
      }
      case 'qbHand': {
        if (this.handedOff && !tk.pa) {
          // carry out the fake bootleg
          return this.toward(a, this.los - 6, a.startY - Math.sign(tk.meshY - a.startY || 1) * 6, a.top * 0.6, 0.5);
        }
        if (tk.pa) {
          if (this.t < 0.65) return this.toward(a, tk.meshX, tk.meshY, a.top * 0.7, 0.1);
          if (this.t < 1.6) return this.toward(a, tk.meshX - tk.drop * 0.6, a.startY, a.top * 0.75, 0.2);
          return this.pocketAI(a);
        }
        return this.toward(a, tk.meshX, tk.meshY, a.top * 0.65, 0.05);
      }
      case 'rush': return this.rushAI(a, carrier ?? this.agents[this.qb] ?? null);
      case 'man': return this.manAI(a, this.agents[tk.target]);
      case 'zone': return this.zoneAI(a, tk.zone);
      case 'returner': return this.toward(a, a.x, a.y, 0, 0);
      case 'cover': {
        if (this.kind === 'punt' && !this.kickFired) {
          if (this.t < 0.3) return { dx: 0, dy: 0, speed: 0 };
        }
        const ret = this.agents.find((g) => g.task.k === 'returner');
        if (!ret) return { dx: 1, dy: 0, speed: a.top };
        if (this.kind === 'kickoff' && !this.kickFired) return { dx: 1, dy: 0, speed: a.top * 0.5 };
        const lane = a.startY + (ret.y - a.startY) * clamp((a.x - this.los) / 50, 0, 1);
        return this.toward(a, ret.x - 6, lane, a.top, 0);
      }
      case 'retBlock': {
        // set up a wall then pick off coverage players
        const opp = this.nearestOpp(a, 7, true);
        if (opp && (this.ball.state === 'held' || dist(a.x, a.y, opp.x, opp.y) < 3)) return this.toward(a, opp.x, opp.y, a.top, 0);
        const ret = this.agents.find((g) => g.task.k === 'returner');
        if (ret) return this.toward(a, ret.x - 10, a.startY * 0.7 + ret.y * 0.3, a.top * 0.7, 0.5);
        return { dx: 0, dy: 0, speed: 0 };
      }
      case 'kick': {
        if (this.kind === 'kickoff' && !this.kickFired) return { dx: 1, dy: 0, speed: 6 };
        if (this.kickFired) {
          const c = this.carrier();
          if (c && c.side !== a.side && this.t - this.carrierSince > 0.5) return this.pursue(a, c);
        }
        return { dx: 0, dy: 0, speed: 0 };
      }
      case 'hold': return { dx: 0, dy: 0, speed: 0 };
      default: return { dx: 0, dy: 0, speed: 0 };
    }
  }

  private toward(a: SimAgent, tx: number, ty: number, speed: number, arrive: number) {
    const dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return { dx: 0, dy: 0, speed: 0 };
    let s = speed;
    if (arrive > 0 && d < 2) s = Math.min(speed, d * (3 / Math.max(arrive, 0.05)) * 0.6 + 0.3);
    return { dx, dy, speed: s };
  }

  private routeAI(a: SimAgent, tk: Extract<Task, { k: 'route' }>) {
    if (this.t < tk.delay) {
      // check-release: block first
      if (this.t < tk.delay - 0.1) return this.passBlockAI(a);
    }
    if (this.passThrown && this.ball.target !== a.i && this.ball.state === 'air') {
      return { dx: a.vx, dy: a.vy, speed: Math.hypot(a.vx, a.vy) * 0.9 };
    }
    // QB scrambling: work back to the QB
    const qb = this.agents[this.qb];
    if (qb && this.ball.holder === qb.i && Math.abs(qb.y - qb.startY) > 5 && this.t > 2.5 && tk.idx >= tk.pts.length - 1) {
      return this.toward(a, Math.max(this.los + 3, a.x - 2), qb.y + (a.y > qb.y ? 6 : -6), a.top * 0.8, 0.5);
    }
    if (tk.idx < tk.pts.length) {
      const p = tk.pts[tk.idx];
      const d = dist(a.x, a.y, p.x, p.y);
      if (d < (tk.idx === tk.pts.length - 1 ? 0.7 : 1.1)) { tk.idx++; }
      return this.toward(a, p.x, p.y, a.top * 0.97, 0);
    }
    if (tk.stop) {
      // settle and come back toward the QB slightly
      const q = this.agents[this.qb];
      if (q) return this.toward(a, a.x - 0.2, a.y + (q.y - a.y) * 0.02, 0.6, 0.5);
      return { dx: 0, dy: 0, speed: 0 };
    }
    // keep running in the final direction until near the boundary
    const p1 = tk.pts[tk.pts.length - 2] ?? { x: a.startX, y: a.startY };
    const p2 = tk.pts[tk.pts.length - 1];
    let dx = p2.x - p1.x, dy = p2.y - p1.y;
    if (a.y < 3.2 && dy < 0) dy = 0;
    if (a.y > FIELD_W - 3.2 && dy > 0) dy = 0;
    if (a.x > 106) dx = 0;
    if (Math.hypot(dx, dy) < 0.1) return { dx: 0, dy: 0, speed: 0 };
    return { dx, dy, speed: a.top * 0.95 };
  }

  private passBlockAI(a: SimAgent) {
    if (a.engaged >= 0) return { dx: 0, dy: 0, speed: 0 };
    const qb = this.agents[this.qb] ?? this.agents.find((g) => g.slot === 'H' || g.slot === 'P' || g.slot === 'K');
    // stick with the assigned rusher, otherwise help on the most dangerous one
    let best: SimAgent | null = null;
    let bs = 1e9;
    const assigned = a.blockTarget >= 0 ? this.agents[a.blockTarget] : null;
    if (assigned && !assigned.down && (assigned.engaged < 0 || assigned.engaged === a.i)) { best = assigned; bs = -1; }
    for (const d of this.agents) {
      if (bs < 0) break;
      if (d.side === a.side || d.down) continue;
      if (d.task.k !== 'rush' && !(d.readT >= 0 && this.t > d.readT)) continue;
      const lane = Math.abs(d.y - a.startY);
      const dd = dist(a.x, a.y, d.x, d.y);
      const engagedPenalty = d.engaged >= 0 ? 6 : 0;
      const score = dd + lane * 0.8 + engagedPenalty;
      if (score < bs && dd < 7) { bs = score; best = d; }
    }
    if (!best || !qb) {
      return this.toward(a, a.startX - 1.2, a.startY, 2.5, 0.5);
    }
    const px = best.x + best.vx * 0.3, py = best.y + best.vy * 0.3;
    const ux = qb.x - px, uy = qb.y - py;
    const n = Math.hypot(ux, uy) || 1;
    const tx = px + (ux / n) * 1.0, ty = py + (uy / n) * 1.0;
    if (dist(a.x, a.y, best.x, best.y) < 1.35 && best.noEngage <= 0) this.engage(a, best);
    return this.toward(a, tx, ty, a.top * 0.92, 0.2);
  }

  private runBlockAI(a: SimAgent, holeY: number) {
    if (a.engaged >= 0) {
      // drive the defender away from the hole
      const d = this.agents[a.engaged];
      const away = Math.sign(d.y - holeY) || (a.startY > holeY ? 1 : -1);
      return { dx: 1, dy: away * 0.8, speed: 2 };
    }
    let best: SimAgent | null = null;
    let bs = 1e9;
    for (const d of this.agents) {
      if (d.side === a.side || d.down || d.engaged >= 0) continue;
      const lateral = Math.abs(d.y - a.startY);
      const depth = d.x - this.los;
      if (depth > 9) continue;
      const score = lateral * 1.2 + depth * 0.6 + (this.blockersOn(d) * 3);
      if (score < bs) { bs = score; best = d; }
    }
    if (!best) return this.toward(a, a.x + 3, a.y, a.top * 0.6, 0);
    if (dist(a.x, a.y, best.x, best.y) < 1.1 && best.noEngage <= 0) this.engage(a, best);
    return this.toward(a, best.x - 0.6, best.y + (holeY - best.y) * 0.15, a.top * 0.85, 0);
  }

  private blockersOn(d: SimAgent): number {
    let n = 0;
    for (const a of this.agents) if (a.engaged === d.i && a.side !== d.side) n++;
    return n;
  }

  private leadAI(a: SimAgent, holeY: number) {
    if (a.engaged >= 0) return { dx: 1, dy: 0, speed: 2 };
    if (a.x < this.los + 0.5) {
      const near = this.nearestOpp(a, 2.2, true);
      if (near && near.noEngage <= 0) this.engage(a, near);
      return this.toward(a, this.los + 1, holeY, a.top * 0.9, 0);
    }
    const target = this.nearestOpp(a, 6, true);
    if (target) {
      if (dist(a.x, a.y, target.x, target.y) < 1.1 && target.noEngage <= 0) this.engage(a, target);
      return this.toward(a, target.x, target.y, a.top, 0);
    }
    return this.toward(a, a.x + 3, holeY, a.top * 0.7, 0);
  }

  private escortAI(a: SimAgent, carrier: SimAgent) {
    if (a.engaged >= 0) return { dx: this.fwdOf(a), dy: 0, speed: 1.5 };
    // pick the closest threat to the carrier that I can get to
    let best: SimAgent | null = null;
    let bs = 1e9;
    for (const d of this.agents) {
      if (d.side === a.side || d.down || d.engaged >= 0) continue;
      const dc = dist(d.x, d.y, carrier.x, carrier.y);
      const da = dist(a.x, a.y, d.x, d.y);
      if (dc > 14 || da > 9) continue;
      const score = dc + da * 0.8;
      if (score < bs) { bs = score; best = d; }
    }
    if (!best) {
      return this.toward(a, carrier.x + this.fwdOf(carrier) * 4, carrier.y + (a.y - carrier.y) * 0.5, a.top * 0.85, 0);
    }
    if (dist(a.x, a.y, best.x, best.y) < 1.1 && best.noEngage <= 0) this.engage(a, best);
    // get between defender and carrier
    const tx = best.x + (carrier.x - best.x) * 0.25, ty = best.y + (carrier.y - best.y) * 0.25;
    return this.toward(a, tx, ty, a.top, 0);
  }

  private toMesh(a: SimAgent, tk: Extract<Task, { k: 'runner' }>) {
    if (a.slot === 'QB') {
      // QB designed run: sit for draw, then go
      if (tk.style === 'draw' && this.t < 0.9) return this.toward(a, a.startX - 1.5, a.startY, 3, 0.3);
      return this.toward(a, this.los + 1, tk.holeY, a.top, 0);
    }
    if (tk.style === 'draw' && this.t < 0.75) return this.toward(a, a.startX, a.startY, 0, 0);
    return this.toward(a, tk.meshX, tk.meshY, a.top * 0.75, 0);
  }

  private pocketAI(a: SimAgent) {
    // AI quarterback reading the progression
    const s = this.setup as ScrimmageSetup;
    const qb = a;
    // pressure
    let pressure = 99;
    let presser: SimAgent | null = null;
    for (const d of this.agents) {
      if (d.side === 'off' || d.engaged >= 0 || d.down) continue;
      const dd = dist(d.x, d.y, qb.x, qb.y);
      if (dd < pressure) { pressure = dd; presser = d; }
    }
    const canThrow = this.canThrow();
    if (canThrow && !qb.user) {
      const recs = this.receivers();
      const awr = rating(qb.p.attrs, 'awr', 65);
      const readSpeed = 0.55 - awr * 0.0025;
      const tSet = 1.15 + (s.offPlay.dropback ?? 3) * 0.06;
      let best: { r: SimAgent; open: number } | null = null;
      const userRec = recs.find((r) => r.user);
      for (let k = 0; k < recs.length; k++) {
        const r = recs[k];
        if (this.t < tSet + k * readSpeed && !(pressure < 2.2)) break;
        const open = this.openness(qb, r);
        if (!best || open > best.open) best = { r, open };
        const need = (r.task.k === 'route' && r.task.depth === 'deep' ? 3.2 : 2.3) / (s.oppDiff === TEAMMATE ? 1 : 1) * (1.15 - qb.diff.qbRead * 0.2);
        if (open > need && this.rng.chance(0.85 * qb.diff.qbRead)) {
          return this.aiThrow(qb, r, open);
        }
      }
      // Feature the user's receiver when open enough
      if (userRec && this.t > tSet + 0.3 && s.featureUser && this.openness(qb, userRec) > 1.6 && this.rng.chance(s.featureUser * 0.08)) {
        return this.aiThrow(qb, userRec, this.openness(qb, userRec));
      }
      if (this.t > 3.4 || pressure < 1.6) {
        if (best && best.open > 1.1) return this.aiThrow(qb, best.r, best.open);
        if (pressure < 1.4 && rating(qb.p.attrs, 'spd') > 78 && this.rng.chance(0.4)) {
          // scramble
          const side = presser && presser.y > qb.y ? -1 : 1;
          return this.toward(qb, this.los + 3, qb.y + side * 5, qb.top, 0);
        }
        if (this.t > 4 || pressure < 1.0) {
          if (this.rng.chance(0.5)) { this.throwAway(); }
          else if (best) return this.aiThrow(qb, best.r, best.open);
        }
      }
    }
    // Step up / slide away from pressure
    if (presser && pressure < 3.5) {
      const ax = qb.x - presser.x, ay = qb.y - presser.y;
      const n = Math.hypot(ax, ay) || 1;
      const tx = clamp(qb.x + (ax / n) * 1.5 + 0.8, this.los - 9, this.los - 1.5);
      return this.toward(qb, tx, qb.y + (ay / n) * 1.5, qb.top * 0.5, 0.2);
    }
    return { dx: 0, dy: 0, speed: 0 };
  }

  private aiThrow(qb: SimAgent, r: SimAgent, open: number) {
    const deep = r.task.k === 'route' && r.task.depth === 'deep';
    const power = deep ? 0.62 : 0.88;
    // place the ball away from the nearest defender
    let nd: SimAgent | null = null;
    let ndd = 99;
    for (const d of this.agents) {
      if (d.side !== 'def') continue;
      const dd = dist(d.x, d.y, r.x, r.y);
      if (dd < ndd) { ndd = dd; nd = d; }
    }
    let lx = 0, ly = 0;
    if (nd && open < 4) {
      lx = clamp((r.x - nd.x) / (ndd || 1), -1, 1) * 0.35;
      ly = clamp((r.y - nd.y) / (ndd || 1), -1, 1) * 0.35;
    }
    this.throwTo(r.i, power, lx, ly);
    return { dx: 0, dy: 0, speed: 0 };
  }

  maxThrow(qb: SimAgent): number {
    return 42 + rating(qb.p.attrs, 'thp', 60) * 0.26;
  }

  /** Separation metric (yards) for a receiver at the predicted catch point. */
  openness(qb: SimAgent, r: SimAgent): number {
    const speed = 24;
    let T = dist(qb.x, qb.y, r.x, r.y) / speed;
    const p = this.predict(r, T);
    T = dist(qb.x, qb.y, p.x, p.y) / speed;
    if (dist(qb.x, qb.y, p.x, p.y) > this.maxThrow(qb) - 2) return -5;
    let m = 99;
    for (const d of this.agents) {
      if (d.side !== 'def' || d.down) continue;
      if (d.task.k === 'rush' && d.x - this.los < 2) continue;
      const dp = { x: d.x + d.vx * T * 0.6, y: d.y + d.vy * T * 0.6 };
      const dd = dist(dp.x, dp.y, p.x, p.y) - T * 1.2;
      m = Math.min(m, dd);
    }
    // throwing lane: defenders between qb and target
    for (const d of this.agents) {
      if (d.side !== 'def' || d.down) continue;
      const t = ((d.x - qb.x) * (p.x - qb.x) + (d.y - qb.y) * (p.y - qb.y)) / ((p.x - qb.x) ** 2 + (p.y - qb.y) ** 2 || 1);
      if (t > 0.15 && t < 0.92) {
        const cx = qb.x + (p.x - qb.x) * t, cy = qb.y + (p.y - qb.y) * t;
        const ld = dist(cx, cy, d.x, d.y);
        if (ld < 1.2) m = Math.min(m, ld);
      }
    }
    const edge = Math.min(p.y, FIELD_W - p.y);
    if (edge < 1.5) m = Math.min(m, edge * 1.5 - 0.5);
    if (p.x > 108) m -= 2;
    if (r.x < this.los - 1 && r.task.k === 'route' && r.task.name !== 'screen' && r.task.name !== 'swing' && r.task.name !== 'bubble') m -= 1;
    return m;
  }

  private rushAI(a: SimAgent, target: SimAgent | null) {
    if (a.engaged >= 0) {
      const t = target ?? this.agents[this.qb];
      if (!t) return { dx: 0, dy: 0, speed: 0 };
      return { dx: t.x - a.x, dy: t.y - a.y, speed: a.top };
    }
    if (!target) return { dx: -1, dy: 0, speed: a.top };
    // Edge rushers keep contain slightly outside the QB
    let ty = target.y;
    const edge = a.slot === 'LE' || a.slot === 'RE';
    const d = dist(a.x, a.y, target.x, target.y);
    if (edge && d > 3) ty += Math.sign(a.startY - target.startY || 1) * Math.min(2.5, d * 0.35);
    // read run: chase carrier (after delay)
    return this.toward(a, target.x + target.vx * 0.2, ty + target.vy * 0.2, a.top, 0);
  }

  private pursue(a: SimAgent, c: SimAgent) {
    let lead = a.diff.lead;
    const speed = a.top * (a.pursuing ? mod(a.mods, 'pursuit', 1) : 1);
    a.pursuing = true;
    // Intercept point
    const rx = c.x - a.x, ry = c.y - a.y;
    const vv = c.vx * c.vx + c.vy * c.vy - speed * speed;
    const bb = 2 * (rx * c.vx + ry * c.vy);
    const cc = rx * rx + ry * ry;
    let t = Math.sqrt(cc) / speed;
    const disc = bb * bb - 4 * vv * cc;
    if (Math.abs(vv) > 1e-6 && disc >= 0) {
      const t1 = (-bb - Math.sqrt(disc)) / (2 * vv);
      const t2 = (-bb + Math.sqrt(disc)) / (2 * vv);
      const tt = [t1, t2].filter((x) => x > 0).sort((p, q) => p - q)[0];
      if (tt !== undefined) t = tt;
    }
    t = Math.min(t, 2.5);
    if (Math.sqrt(cc) < 2) lead *= 0.4;
    return { dx: c.x + c.vx * t * lead - a.x, dy: c.y + c.vy * t * lead - a.y, speed };
  }

  private manAI(a: SimAgent, r: SimAgent) {
    if (!r) return { dx: 0, dy: 0, speed: 0 };
    let react = a.diff.react * 0.7 - (rating(a.p.attrs, 'mcv', 60) - 60) * 0.004 + mod(r.mods, 'separation', 0) - mod(a.mods, 'reaction', 0) + (rating(r.p.attrs, 'rte', 60) - 60) * 0.003;
    react = clamp(react, 0.04, 0.6);
    const lagFrames = Math.round(react * 60);
    const h = r.hist[Math.max(0, r.hist.length - 1 - lagFrames)] ?? { x: r.x, y: r.y, vx: r.vx, vy: r.vy };
    const lead = react + 0.12;
    let px = h.x + h.vx * lead;
    let py = h.y + h.vy * lead;
    // Leverage: cushion depends on route depth & difficulty
    const depth = r.x - this.los;
    const cushion = (depth > 12 ? 0.9 : 0.4) * a.diff.cover;
    px += cushion;
    const inside = Math.sign(MID_Y - r.y) || 1;
    py += inside * 0.45 * a.diff.cover;
    if (this.t < 0.25) { px = Math.max(px, a.x); }
    return this.toward(a, px, py, a.top, 0.08);
  }

  private zoneAI(a: SimAgent, zone: string) {
    const L = this.zoneLandmark(zone);
    // Play-action: linebackers bite on the fake
    if (this.playAction && this.t < 0.55 + (100 - rating(a.p.attrs, 'prc', 60)) * 0.006 && (a.slot.includes('LB') || a.slot === 'SS')) {
      return this.toward(a, this.los + 2, a.y, a.top * 0.6, 0);
    }
    // QB scramble threat
    const qb = this.agents[this.qb];
    let threat: SimAgent | null = null;
    let ts = 1e9;
    for (const r of this.agents) {
      if (r.side !== 'off' || r.task.k !== 'route') continue;
      const d = dist(r.x, r.y, L.x, L.y);
      if (d > L.r + 3) continue;
      if (r.x < this.los + 0.5 && !L.deep) continue;
      const score = d - (L.deep ? (r.x - this.los) * 0.3 : 0);
      if (score < ts) { ts = score; threat = r; }
    }
    let tx = L.x, ty = L.y;
    if (threat) {
      tx = L.deep ? Math.max(threat.x + Math.max(0, threat.vx) * 0.45 + 1 + a.diff.cover, L.x - 1) : Math.max(this.los + 2.5, threat.x - 0.6 * a.diff.cover);
      ty = threat.y + (L.deep ? 0 : Math.sign(MID_Y - threat.y) * 0.6);
      const dx = tx - L.x, dy = ty - L.y;
      const d = Math.hypot(dx, dy);
      const maxR = L.r + 1.5;
      if (d > maxR) { tx = L.x + (dx / d) * maxR; ty = L.y + (dy / d) * maxR; }
    } else if (qb) {
      ty += clamp(Math.sin(qb.face) * 3, -3, 3);
    }
    const speed = this.t < 1.4 ? a.top * 0.9 : a.top;
    return this.toward(a, tx, ty, speed, 0.3);
  }

  zoneLandmark(zone: string): { x: number; y: number; r: number; deep: boolean } {
    const los = this.los;
    const s = this.setup as ScrimmageSetup;
    const hy = s.hashY ?? MID_Y;
    const cap = (x: number) => Math.min(x, 108);
    switch (zone) {
      case 'deepL': return { x: cap(los + 15), y: 40, r: 12, deep: true };
      case 'deepR': return { x: cap(los + 15), y: 13.3, r: 12, deep: true };
      case 'deep3L': return { x: cap(los + 14), y: 45, r: 8, deep: true };
      case 'deep3M': return { x: cap(los + 16), y: MID_Y, r: 9, deep: true };
      case 'deep3R': return { x: cap(los + 14), y: 8.3, r: 8, deep: true };
      case 'deepQ1': return { x: cap(los + 12), y: 46, r: 7, deep: true };
      case 'deepQ2': return { x: cap(los + 13), y: 33, r: 7, deep: true };
      case 'deepQ3': return { x: cap(los + 13), y: 20, r: 7, deep: true };
      case 'deepQ4': return { x: cap(los + 12), y: 7.3, r: 7, deep: true };
      case 'flatL': return { x: cap(los + 4), y: 46, r: 6, deep: false };
      case 'flatR': return { x: cap(los + 4), y: 7.3, r: 6, deep: false };
      case 'curlL': return { x: cap(los + 7), y: 41, r: 9, deep: false };
      case 'curlR': return { x: cap(los + 7), y: 12.3, r: 9, deep: false };
      case 'hookL': return { x: cap(los + 6), y: hy + 5, r: 5, deep: false };
      case 'hookR': return { x: cap(los + 6), y: hy - 5, r: 5, deep: false };
      case 'robber': return { x: cap(los + 9), y: hy, r: 6, deep: false };
      default: return { x: cap(los + 6), y: hy, r: 5, deep: false };
    }
  }

  private runnerAI(a: SimAgent): { dx: number; dy: number; speed: number } {
    const fwd = this.fwdOf(a);
    const tk = a.task;
    // Early run path through the hole
    if (tk.k === 'runner' && this.t - this.carrierSince < 0.9 && a.x < this.los + 0.5) {
      if (tk.style === 'outside' && Math.abs(a.y - tk.holeY) > 1.5) return this.toward(a, this.los - 0.5, tk.holeY, a.top, 0);
      if (tk.style === 'sneak') return { dx: 1, dy: 0, speed: a.top };
      return this.toward(a, this.los + 1.5, tk.holeY, a.top, 0);
    }
    // Returner in the end zone holds or runs
    // Direction sampling
    let bestAng = 0;
    let bestScore = -1e9;
    const curAng = Math.atan2(a.vy, a.vx * fwd);
    for (let k = -6; k <= 6; k++) {
      const ang = (k / 6) * 1.45;
      const ux = Math.cos(ang) * fwd, uy = Math.sin(ang);
      let danger = 0;
      for (const d of this.agents) {
        if (d.side === a.side || d.down) continue;
        const dpx = d.x + d.vx * 0.25, dpy = d.y + d.vy * 0.25;
        for (const L of [2.5, 5]) {
          const px = a.x + ux * L, py = a.y + uy * L;
          const dd = dist(dpx, dpy, px, py);
          const w = Math.max(0, (4.2 - dd) / 4.2);
          danger += w * w * (d.engaged >= 0 ? 0.15 : d.stun > 0 ? 0.3 : 1) * (L === 2.5 ? 1.3 : 0.8);
        }
      }
      const py5 = a.y + uy * 5;
      let side = 0;
      if (py5 < 1.2 || py5 > FIELD_W - 1.2) side = 2.5;
      const score = Math.cos(ang) * 1.2 - danger * 1.6 - side - Math.abs(angDiff(ang, curAng)) * 0.12;
      if (score > bestScore) { bestScore = score; bestAng = ang; }
    }
    return { dx: Math.cos(bestAng) * fwd, dy: Math.sin(bestAng), speed: a.top };
  }

  // =========================================================================
  // Blocking engagements
  // =========================================================================
  private engage(blocker: SimAgent, def: SimAgent) {
    if (blocker.engaged >= 0 || blocker.down || def.down || blocker.stun > 0) return;
    blocker.engaged = def.i;
    blocker.engT = 0;
    if (def.engaged < 0) { def.engaged = blocker.i; def.engT = 0; def.shed = 0; }
    blocker.anim = 'block';
    def.anim = 'block';
  }

  private disengage(def: SimAgent, winner: 'def' | 'blk') {
    for (const b of this.agents) {
      if (b.engaged === def.i && b.side !== def.side) {
        b.engaged = -1;
        if (winner === 'def') { b.stun = 0.35; b.anim = 'run'; }
      }
    }
    def.engaged = -1;
    def.shed = 0;
    def.noEngage = winner === 'def' ? 0.8 : 0.3;
    def.anim = 'run';
  }

  private engagements(dt: number) {
    for (const d of this.agents) {
      if (d.engaged < 0) continue;
      const b0 = this.agents[d.engaged];
      // only process from the defender's (non-blocking side) perspective
      if (d.side === this.blockingSide()) continue;
      const blockers = this.agents.filter((b) => b.engaged === d.i && b.side !== d.side && !b.down);
      if (!blockers.length || !b0 || b0.down) { this.disengage(d, 'def'); continue; }
      d.engT += dt;
      const isRun = this.handedOff || this.passComplete || this.turnover || this.kind !== 'scrimmage' || this.qbCrossed;
      const pa = d.p.attrs;
      const sD = isRun ? rating(pa, 'bsh') * 0.6 + rating(pa, 'str') * 0.4 : Math.max(rating(pa, 'pmv') * 0.65 + rating(pa, 'str') * 0.35, rating(pa, 'fmv') * 0.65 + rating(pa, 'agi') * 0.35);
      let sB = 0;
      for (const [k, b] of blockers.entries()) {
        const ba = b.p.attrs;
        const v = (isRun ? rating(ba, 'rbk', 40) : rating(ba, 'pbk', 40)) * 0.7 + rating(ba, 'str') * 0.3;
        sB += k === 0 ? v : 18;
        b.engT += dt;
      }
      let hold = 1;
      for (const b of blockers) hold *= mod(b.mods, 'blockHold', 1);
      let rate = clamp(0.32 + (sD - sB) * 0.016, 0.06, 1.3) * d.diff.shed * mod(d.mods, 'shedMult', 1) / hold;
      if (d.user) rate *= 0.55; // user DL relies on the shed button
      if (blockers.some((b) => b.user)) rate *= 1.15; // user OL relies on punches
      d.shed += rate * dt;
      // movement of the pile
      const st = d as SimAgent & { dvx: number; dvy: number };
      const want = Math.hypot(st.dvx || 0, st.dvy || 0);
      let ux = want > 0 ? st.dvx / want : -this.fwdOf(d), uy = want > 0 ? st.dvy / want : 0;
      if (d.user && Math.hypot(this.input.mx, this.input.my) > 0.2) { ux = this.input.mx; uy = this.input.my; }
      const v = clamp(0.25 + (sD - sB) * 0.05, -1.6, 1.8);
      d.vx = ux * v; d.vy = uy * v;
      for (const b of blockers) {
        b.vx = d.vx; b.vy = d.vy;
        const nx = b.x - d.x, ny = b.y - d.y;
        const n = Math.hypot(nx, ny) || 1;
        b.x = d.x + (nx / n) * 0.8;
        b.y = d.y + (ny / n) * 0.8;
        b.face = Math.atan2(-ny, -nx);
        if (v < -0.6 && b.engT > 1.2 && !b.stat.pancake && this.rng.chance(dt * 0.6)) {
          b.stat.pancake = true;
          d.down = true; d.downT = 1.2; d.anim = 'down';
          this.emit({ type: 'pancake', user: b.user });
          if (b.user) { this.userGrade += 1; this.notes.push('Pancake block'); }
          this.disengage(d, 'blk');
          break;
        }
      }
      if (d.shed >= 1) {
        this.disengage(d, 'def');
        this.emit({ type: 'shed', user: d.user });
        if (d.user) this.userGrade += 0.3;
        if (blockers.some((b) => b.user)) { this.userGrade -= 0.6; }
      }
    }
    // stray engagements (blocker referencing defender who's not engaged back)
    for (const b of this.agents) {
      if (b.engaged >= 0) {
        const d = this.agents[b.engaged];
        if (!d || d.down || dist(b.x, b.y, d.x, d.y) > 2.5) b.engaged = -1;
      }
    }
  }

  // =========================================================================
  // Movement
  // =========================================================================
  private integrate(dt: number) {
    for (const a of this.agents) {
      if (a.engaged >= 0) {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        continue;
      }
      const st = a as SimAgent & { dvx: number; dvy: number };
      const dvx = st.dvx ?? 0, dvy = st.dvy ?? 0;
      let ax = dvx - a.vx, ay = dvy - a.vy;
      const sp = Math.hypot(a.vx, a.vy);
      let maxA = a.acc * dt;
      // cutting penalty: sharp changes of direction at speed cost more
      if (sp > 3 && Math.hypot(dvx, dvy) > 0.5) {
        const turn = Math.abs(angDiff(Math.atan2(dvy, dvx), Math.atan2(a.vy, a.vx)));
        if (turn > 0.6) maxA *= a.agi;
      }
      if (a.down) maxA *= 0.3;
      const m = Math.hypot(ax, ay);
      if (m > maxA) { ax = (ax / m) * maxA; ay = (ay / m) * maxA; }
      a.vx += ax; a.vy += ay;
      // diving momentum
      if (a.move === 'dive' && this.t - a.moveT < 0.45) {
        a.vx *= 0.995; a.vy *= 0.995;
      } else if (a.move === 'dive' && this.t - a.moveT >= 0.45 && this.t - a.moveT < 0.5 && !a.down) {
        a.down = true; a.downT = 0.9; a.anim = 'down';
        if (a === this.carrier()) {
          this.endPlayDown(a, a.x, 'dive');
          return;
        }
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      const s2 = Math.hypot(a.vx, a.vy);
      if (s2 > 0.4) {
        const target = Math.atan2(a.vy, a.vx);
        a.face += angDiff(target, a.face) * Math.min(1, dt * 10);
      } else if (this.phase === 'live') {
        // face the ball
        const tx = this.ball.x, ty = this.ball.y;
        const target = Math.atan2(ty - a.y, tx - a.x);
        a.face += angDiff(target, a.face) * Math.min(1, dt * 4);
      }
      if (a.anim !== 'throw' && a.anim !== 'catch' && a.anim !== 'kick' && a.anim !== 'juke' && a.anim !== 'spin' && a.anim !== 'stiff' && a.anim !== 'dive' && a.anim !== 'swat' && a.anim !== 'block' && a.anim !== 'slide' || a.animT > 0.6) {
        if (!a.down) a.anim = s2 > 0.6 ? 'run' : 'idle';
      }
    }
  }

  private collisions() {
    const n = this.agents.length;
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      if (a.down) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.agents[j];
        if (b.down) continue;
        if (a.engaged === b.i || b.engaged === a.i) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minD = 0.72;
        if (d2 < minD * minD && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (minD - d) / 2;
          const wa = a.p.wt, wb = b.p.wt;
          const fa = wb / (wa + wb), fb = wa / (wa + wb);
          a.x -= (dx / d) * push * fa * 2;
          a.y -= (dy / d) * push * fa * 2;
          b.x += (dx / d) * push * fb * 2;
          b.y += (dy / d) * push * fb * 2;
        }
      }
    }
  }

  private ballFollow(dt: number) {
    const b = this.ball;
    if (b.state === 'held' && b.holder >= 0) {
      const h = this.agents[b.holder];
      const k = h.anim === 'throw' ? 0.1 : 0.35;
      b.x = h.x + Math.cos(h.face) * k;
      b.y = h.y + Math.sin(h.face) * k;
      b.z = h.down ? 0.3 : 1.15;
    } else if (b.state === 'pre' && this.kind === 'kickoff') {
      b.x = this.los; b.y = MID_Y; b.z = 0.3;
    }
    void dt;
  }

  // =========================================================================
  // Tackling
  // =========================================================================
  private tackles() {
    const c = this.carrier();
    if (!c || c.down || this.phase !== 'live') return;
    if (this.t - this.carrierSince < 0.05 && this.kind === 'scrimmage' && c.i !== this.qb) return;
    const near: SimAgent[] = [];
    for (const d of this.agents) {
      if (d.side === c.side || d.down || d.stun > 0 || d.tackleCd > 0) continue;
      if (d.engaged >= 0 && d.engT < 99) {
        // engaged defenders can still make arm tackles at very close range
        if (dist(d.x, d.y, c.x, c.y) > 0.75) continue;
      }
      const reach = d.move === 'dive' && this.t - d.moveT < 0.5 ? 1.5 : 0.95;
      if (dist(d.x, d.y, c.x, c.y) < reach) near.push(d);
    }
    if (!near.length) return;
    const t = near[0];
    const ta = t.p.attrs, ca = c.p.attrs;
    const isQbSack = c.i === this.qb && !this.qbCrossed && !this.handedOff && !this.passThrown && this.kind === 'scrimmage';
    // Special move check
    const since = this.t - c.moveT;
    let moveWin = false;
    if (c.move && since < 0.45) {
      const relAng = Math.abs(angDiff(Math.atan2(t.y - c.y, t.x - c.x), c.face));
      let p = 0;
      if (c.move === 'juke') p = 0.42 + (rating(ca, 'jkm') - rating(ta, 'tak')) * 0.008 + mod(c.mods, 'jukeBonus', 0);
      if (c.move === 'spin') p = 0.4 + (rating(ca, 'spm') - rating(ta, 'tak')) * 0.008 + mod(c.mods, 'spinBonus', 0);
      if (c.move === 'stiff') p = (relAng < 1.6 ? 0.45 : 0.2) + (rating(ca, 'sfa') - rating(ta, 'str')) * 0.008 + mod(c.mods, 'stiffBonus', 0);
      if (c.move === 'truck') p = 0.3 + (rating(ca, 'btk') + rating(ca, 'str') - rating(ta, 'tak') - rating(ta, 'str')) * 0.005;
      if (c.move === 'dive') p = -1;
      p -= t.diff.tackle;
      if (p > 0 && this.rng.next() < clamp(p, 0.05, 0.85)) moveWin = true;
    }
    if (moveWin) {
      t.stun = 0.9;
      t.down = true;
      t.downT = 0.8;
      t.anim = 'down';
      t.tackleCd = 1;
      this.missedTackles++;
      this.emit({ type: 'miss', user: c.user, x: c.x, y: c.y });
      if (c.user) this.userGrade += 0.8;
      if (t.user) { this.userGrade -= 0.8; this.notes.push('Missed tackle'); }
      return;
    }
    let p = 0.84 + (rating(ta, 'tak', 50) - 65) * 0.006 + t.diff.tackle + mod(t.mods, 'tackleBonus', 0);
    const btk = c.i === this.qb ? rating(ca, 'str') * 0.6 + rating(ca, 'agi') * 0.2 : rating(ca, 'btk', 55);
    p -= (btk - 65) * 0.005 + mod(c.mods, 'breakTackle', 0);
    p += (near.length - 1) * 0.18;
    if (t.move === 'dive' || t.move === 'hitstick') p += 0.08;
    if (isQbSack) p += 0.12 - mod(c.mods, 'escape', 0);
    if (c.user && c.move && since < 0.45) p += 0.08; // failed move leaves you exposed
    if (t.user) p += 0.06;
    // speed/angle: head-on tackles are surer; arm tackles from behind weaker
    const hitAng = Math.abs(angDiff(Math.atan2(c.y - t.y, c.x - t.x), Math.atan2(c.vy, c.vx)));
    if (hitAng < 1.2 && Math.hypot(c.vx, c.vy) > 4) p -= 0.04;
    if (t.engaged >= 0) p -= 0.3;
    if (this.rng.next() < clamp(p, 0.08, 0.97)) {
      this.tackler = t.i;
      // forward progress
      const mom = (c.p.wt * Math.hypot(c.vx, c.vy)) / 2200;
      const hit = (t.p.wt * Math.hypot(t.vx, t.vy)) / 2200;
      const fwd = this.fwdOf(c);
      const fallX = c.x + fwd * clamp(0.6 + (mom - hit) * 0.5, 0, 1.4);
      // fumble?
      let pf = (0.012 + (rating(ta, 'pow', 60) - 60) * 0.0004) * (100 - rating(ca, 'car', 70)) / 30;
      pf *= mod(c.mods, 'fumbleMult', 1) * (t.move === 'hitstick' ? 2.2 : 1) * mod(t.mods, 'forceFumble', 1);
      if (c.protect) pf *= 0.35;
      if (isQbSack) pf *= 1.6;
      this.emit({ type: isQbSack ? 'sack' : 'tackle', user: t.user || c.user, x: c.x, y: c.y, big: t.move === 'hitstick' });
      if (t.user) { this.userGrade += isQbSack ? 2 : c.x < this.los && this.kind === 'scrimmage' && c.side === 'off' ? 1.2 : 0.6; this.notes.push(isQbSack ? 'SACK' : 'Tackle'); }
      if (this.rng.next() < pf) {
        this.fumble(c, t);
        return;
      }
      if (isQbSack) this.sackBy = t.i;
      c.down = true;
      c.anim = 'down';
      t.down = true;
      t.downT = 0.8;
      t.anim = 'tackle';
      this.endPlayDown(c, fallX, 'tackle');
    } else {
      // broken tackle
      t.stun = 0.6;
      t.down = true;
      t.downT = 0.7;
      t.anim = 'down';
      t.tackleCd = 0.8;
      c.slow = 0.25;
      this.missedTackles++;
      this.emit({ type: 'miss', user: c.user || t.user, x: c.x, y: c.y });
      if (c.user) this.userGrade += 0.6;
      if (t.user) { this.userGrade -= 0.8; this.notes.push('Missed tackle'); }
    }
  }

  private fumble(c: SimAgent, t: SimAgent) {
    this.fumbleBy = c.i;
    this.fumbleX = c.x;
    const b = this.ball;
    b.state = 'loose';
    b.kind = 'fumble';
    b.holder = -1;
    b.vx = c.vx * 0.5 + this.rng.normal(0, 2.5);
    b.vy = c.vy * 0.5 + this.rng.normal(0, 2.5);
    b.vz = 2.5;
    b.z = 1;
    c.down = true; c.downT = 0.9; c.anim = 'down';
    t.downT = 0.5; t.down = true;
    this.tackler = t.i;
    this.emit({ type: 'fumble', user: c.user || t.user, x: c.x, y: c.y, big: true });
    if (c.user) { this.userGrade -= 2.5; this.notes.push('FUMBLE'); }
    if (t.user) { this.userGrade += 2; this.notes.push('Forced fumble'); }
    (this as unknown as { ff: number }).ff = t.i;
  }

  private boundaries() {
    const c = this.carrier();
    if (!c || this.phase !== 'live') return;
    if (c.y < 0 || c.y > FIELD_W) {
      this.emit({ type: 'oob', x: c.x, y: c.y });
      this.endPlayDown(c, c.x, 'oob');
      return;
    }
    if (c.side === 'off' && c.x >= 100 && this.kind === 'scrimmage') { this.touchdown(c); return; }
    if (c.side === 'def' && c.x <= 0) { this.touchdown(c); return; }
    if (this.kind !== 'scrimmage' && c.side === 'off' && c.x >= 100) { this.touchdown(c); return; }
    if (c.x > 110 || c.x < -10) this.endPlayDown(c, c.x, 'oob');
  }

  private touchdown(c: SimAgent) {
    this.emit({ type: 'td', user: c.user, big: true, x: c.x, y: c.y });
    c.anim = 'celebrate';
    c.animT = 0;
    if (c.user) { this.userGrade += 2; this.notes.push('TOUCHDOWN'); }
    this.whistle('Touchdown!', false);
    if (this.kind === 'scrimmage') this.finishScrimmage('td', c.side === 'off' ? 100 : 0, c.y);
    else this.finishKick();
  }

  private endPlayDown(c: SimAgent, x: number, how: string) {
    if (this.phase !== 'live') return;
    this.whistle(how === 'oob' ? 'Out of bounds.' : how === 'slide' ? 'Slide.' : 'Down.', false);
    if (this.kind === 'scrimmage') this.finishScrimmage(how, x, c.y);
    else this.finishKick();
  }

  private endPlayDead(x: number, y: number, text: string, touchback?: boolean, possession?: 'fumbler') {
    if (this.phase !== 'live') return;
    this.whistle(text, true);
    if (touchback) this.kickResult.touchback = true;
    if (this.kind === 'scrimmage') this.finishScrimmage(touchback ? 'touchback' : possession === 'fumbler' ? 'fumble-oob' : 'dead', x, y);
    else this.finishKick();
  }

  private whistle(text: string, _stop: boolean) {
    if (this.phase !== 'live') return;
    this.phase = 'dead';
    this.deadT = 1.1;
    this.lastWhistleText = text;
    this.emit({ type: 'whistle', text });
  }

  // =========================================================================
  // Outcome construction
  // =========================================================================
  private finishScrimmage(how: string, x: number, y: number) {
    if (this.outcome) return;
    const s = this.setup as ScrimmageSetup;
    const stats: StatEvent[] = [];
    const add = (a: SimAgent | undefined | null, key: StatEvent['key'], v = 1, max = false) => {
      if (a) stats.push({ pid: a.p.pid, key, v, max });
    };
    const qb = this.agents[this.qb];
    const c = this.carrier() ?? (this.fumbleBy >= 0 ? this.agents[this.fumbleBy] : null);
    let kind: OutcomeKind = 'run';
    let holder: 'off' | 'def' = 'off';
    let td = false, safety = false, touchback = false, oob = how === 'oob';
    let endX = x;
    const desc: string[] = [];
    const name = (a: SimAgent | null | undefined) => (a ? `${a.p.name}` : '');

    if (how === 'incomplete') {
      kind = 'incomplete';
      endX = this.los;
      add(qb, 'passAtt');
      const tgt = this.lastTarget >= 0 ? this.agents[this.lastTarget] : null;
      if (tgt) add(tgt, 'targets');
      if (this.dropped && tgt) add(tgt, 'drops');
      if (this.pbuBy >= 0) add(this.agents[this.pbuBy], 'pbu');
      desc.push(`${name(qb)} pass incomplete${tgt ? ` intended for ${name(tgt)}` : ''}.`);
      if (this.pbuBy >= 0) desc.push(`Broken up by ${name(this.agents[this.pbuBy])}.`);
      if (this.dropped) desc.push('Dropped.');
    } else {
      // possession determination
      const holderAgent = this.ball.state === 'held' && this.ball.holder >= 0 ? this.agents[this.ball.holder] : null;
      if (how === 'fumble-oob') holder = this.fumbleBy >= 0 ? this.agents[this.fumbleBy].side : 'off';
      else if (holderAgent) holder = holderAgent.side;
      else holder = this.turnover ? 'def' : 'off';
      const isPass = this.passComplete || this.intBy >= 0;
      const isSack = this.sackBy >= 0;
      if (isSack) {
        kind = 'sack';
        add(qb, 'sacked');
        add(this.agents[this.sackBy], 'sacks');
        add(this.agents[this.sackBy], 'tackles');
        add(this.agents[this.sackBy], 'tfl');
        desc.push(`${name(qb)} sacked by ${name(this.agents[this.sackBy])} for a loss of ${Math.max(0, Math.round(this.los - x))}.`);
        if (qb?.user) { this.userGrade -= 1; this.notes.push('Sacked'); }
        // sack allowed by the user's blocker?
        for (const b of this.agents) {
          if (b.user && (b.task.k === 'passBlock') && dist(b.x, b.y, this.agents[this.sackBy].x, this.agents[this.sackBy].y) < 4) {
            add(b, 'sacksAllowed');
            this.userGrade -= 1.5;
            this.notes.push('Allowed a sack');
          }
        }
      } else if (this.intBy >= 0) {
        kind = 'interception';
        add(qb, 'passAtt');
        add(qb, 'passInt');
        add(this.agents[this.intBy], 'ints');
        const tgt = this.lastTarget >= 0 ? this.agents[this.lastTarget] : null;
        if (tgt) add(tgt, 'targets');
        desc.push(`${name(qb)} pass INTERCEPTED by ${name(this.agents[this.intBy])}!`);
        const retY = Math.max(0, Math.round(this.catchXForInt() - x));
        add(this.agents[this.intBy], 'intYds', retY);
      } else if (isPass) {
        kind = 'pass';
        const rec = this.agents[this.lastTarget];
        const yds = Math.round((holder === 'off' ? Math.min(100, x) : this.catchX) - this.los);
        add(qb, 'passAtt'); add(qb, 'passCmp'); add(qb, 'passYds', yds); add(qb, 'passLong', yds, true);
        add(rec, 'targets'); add(rec, 'rec'); add(rec, 'recYds', yds); add(rec, 'recLong', yds, true);
        desc.push(`${name(qb)} pass complete to ${name(rec)} for ${yds} yard${Math.abs(yds) === 1 ? '' : 's'}.`);
        if (qb?.user) this.userGrade += yds >= 20 ? 1.5 : yds >= s.toGo ? 1 : 0.4;
      } else {
        kind = 'run';
        const runner = this.runnerAgent();
        const yds = Math.round((holder === 'off' ? Math.min(100, x) : this.fumbleX) - this.los);
        add(runner, 'rushAtt'); add(runner, 'rushYds', yds); add(runner, 'rushLong', yds, true);
        desc.push(`${name(runner)} ${this.scramble ? 'scrambles' : 'runs'} for ${yds} yard${Math.abs(yds) === 1 ? '' : 's'}.`);
        if (runner?.user) this.userGrade += yds >= 10 ? 1.2 : yds >= 4 ? 0.6 : yds <= 0 ? -0.6 : 0.1;
      }
      if (this.fumbleBy >= 0) {
        const f = this.agents[this.fumbleBy];
        add(f, 'fumbles');
        const ff = (this as unknown as { ff?: number }).ff;
        if (ff !== undefined) add(this.agents[ff], 'ff');
        if (holder === 'def') {
          add(f, 'fumblesLost');
          if (this.recoveredBy >= 0) add(this.agents[this.recoveredBy], 'fr');
          desc.push(`FUMBLE! Recovered by ${name(this.recoveredBy >= 0 ? this.agents[this.recoveredBy] : null)}.`);
          kind = 'fumble';
        } else desc.push('Fumble, recovered by the offense.');
      }
      if (this.tackler >= 0 && !isSack && how !== 'oob') {
        const tk = this.agents[this.tackler];
        add(tk, 'tackles');
        if (holder === 'off' && x < this.los && tk.side === 'def') add(tk, 'tfl');
        desc.push(`Tackled by ${name(tk)}.`);
      }
      if (how === 'oob') desc.push('Out of bounds.');
      if (how === 'td') {
        td = true;
        if (holder === 'off') {
          endX = 100;
          if (kind === 'pass') { add(qb, 'passTD'); add(this.agents[this.lastTarget], 'recTD'); }
          else if (kind === 'run') add(this.runnerAgent(), 'rushTD');
          else if (kind === 'fumble') {/* offensive recovery TD */}
        } else {
          endX = 0;
          const scorer = c;
          add(scorer, 'defTD');
        }
      } else if (holder === 'off' && x <= 0 && !this.turnover) {
        safety = true;
      } else if (holder === 'def' && x >= 100) {
        touchback = true;
      }
      if (how === 'touchback') touchback = true;
      if (kind === 'interception' && this.ball.state === 'held') endX = x;
    }
    // Offensive holding (random, only on positive plays)
    let penalty = this.penalty;
    if (!penalty && s.penalties && !td && holder === 'off' && kind !== 'incomplete' && endX - this.los > 3) {
      const longBlocks = this.agents.filter((a) => a.side === 'off' && a.engT > 1.5 && ['LT', 'LG', 'C', 'RG', 'RT', 'TE1', 'TE2'].includes(a.slot));
      if (longBlocks.length && this.rng.chance(0.035)) {
        const culprit = this.rng.pick(longBlocks);
        penalty = { name: `Offensive Holding (#${culprit.p.num})`, against: 'off', yards: 10 };
        this.emit({ type: 'flag', text: 'Holding!' });
        if (culprit.user) { this.userGrade -= 1.5; this.notes.push('Holding penalty'); }
      }
    }
    // OL participation grade
    for (const a of this.agents) {
      if (a.user && (a.task.k === 'passBlock' || a.task.k === 'runBlock' || a.task.k === 'lead')) {
        if (a.engT > 2) this.userGrade += 0.5;
        if (a.stat.pancake) stats.push({ pid: a.p.pid, key: 'pancakes', v: 1 });
      }
    }
    const big = (kind === 'pass' || kind === 'run') && endX - this.los >= 20;
    this.outcome = {
      kind,
      endX: td ? (holder === 'off' ? 100 : 0) : endX,
      holder,
      td, safety, touchback, oob,
      stopClock: kind === 'incomplete',
      duration: Math.max(2, Math.round(this.t * 10) / 10),
      penalty,
      stats,
      desc: desc.join(' '),
      endY: clamp(y, 0.5, FIELD_W - 0.5),
      bigPlay: big || kind === 'interception' || kind === 'fumble' || td,
      userInvolved: !!this.user,
      airYards: this.airYards,
      grade: clamp(this.userGrade, -4, 4),
      notes: this.notes.slice(),
    };
    if (s.twoPoint) this.outcome.kind = 'twopt';
  }

  private catchXForInt(): number {
    return this.intBy >= 0 ? this.ball.tx : this.los;
  }

  get lastTarget(): number {
    return this.ball.target >= 0 ? this.ball.target : this.ballTargetMemo;
  }
  private ballTargetMemo = -1;

  private runnerAgent(): SimAgent | null {
    const c = this.carrier();
    if (c && c.side === 'off') return c;
    if (this.fumbleBy >= 0) return this.agents[this.fumbleBy];
    return this.agents.find((a) => a.task.k === 'runner') ?? this.agents[this.qb] ?? null;
  }

  private finishKick() {
    if (this.outcome) return;
    const s = this.setup as KickSetup;
    const kicker = this.agents.find((a) => a.task.k === 'kick')!;
    const stats: StatEvent[] = [];
    const add = (a: SimAgent | undefined | null, key: StatEvent['key'], v = 1, max = false) => { if (a) stats.push({ pid: a.p.pid, key, v, max }); };
    const t = Math.max(1.5, Math.round(this.t * 10) / 10);
    if (s.kind === 'fg' || s.kind === 'xp') {
      const good = !!this.kickResult.good;
      const d = Math.round(100 - this.los + 17);
      if (s.kind === 'fg') { add(kicker, 'fgA'); if (good) { add(kicker, 'fgM'); add(kicker, 'fgLong', d, true); } }
      else { add(kicker, 'xpA'); if (good) add(kicker, 'xpM'); }
      if (kicker.user) { this.userGrade += good ? (d >= 50 ? 2.5 : d >= 40 ? 1.5 : 1) : -1.5; this.notes.push(good ? `${d}-yard kick is good` : 'Missed kick'); }
      this.outcome = {
        kind: s.kind, endX: this.los, holder: 'off', good, duration: t, stats,
        desc: `${kicker.p.name} ${d}-yard ${s.kind === 'xp' ? 'extra point' : 'field goal'} is ${good ? 'GOOD' : this.kickResult.blocked ? 'BLOCKED' : 'NO GOOD'}.`,
        grade: this.userGrade, notes: this.notes.slice(), userInvolved: !!this.user, bigPlay: s.kind === 'fg' && d >= 50 && good,
      };
      return;
    }
    // Punts & kickoffs
    const holderA = this.ball.state === 'held' && this.ball.holder >= 0 ? this.agents[this.ball.holder] : null;
    const ret = this.agents.find((a) => a.task.k === 'returner')!;
    let holder: 'off' | 'def' = 'def';
    let endX: number;
    let td = false;
    let touchback = !!this.kickResult.touchback;
    let desc = '';
    if (s.kind === 'punt') {
      const gross = Math.round((this.kickResult.landX ?? this.ball.x) - this.los);
      add(kicker, 'punts');
      add(kicker, 'puntYds', Math.max(0, gross));
      add(kicker, 'puntLong', Math.max(0, gross), true);
      desc = `${kicker.p.name} punts ${Math.max(0, gross)} yards.`;
    } else desc = `${kicker.p.name} kicks off.`;
    if (holderA && holderA.side === 'off') {
      holder = 'off';
      endX = holderA.x;
      desc += ' Recovered by the kicking team!';
    } else if (touchback) {
      endX = 100;
      desc += ' Touchback.';
    } else if (this.kickResult.fair) {
      endX = ret.x;
      desc += ` Fair catch by ${ret.p.name}.`;
    } else if (holderA && holderA === ret || holderA?.side === 'def') {
      const r = holderA!;
      const caught = this.ball.tx;
      endX = r.x;
      if (r.x <= 0) { td = true; endX = 0; }
      else if (r.x >= 100) { touchback = true; endX = 100; }
      const yds = Math.round(Math.max(caught, Math.min(100, caught)) - Math.max(0, r.x));
      if (s.kind === 'punt') { add(r, 'pr'); add(r, 'prYds', Math.max(0, yds)); }
      else { add(r, 'kr'); add(r, 'krYds', Math.max(0, yds)); }
      if (td) add(r, 'retTD');
      if (this.tackler >= 0) add(this.agents[this.tackler], 'tackles');
      desc += ` ${r.p.name} returns it ${Math.max(0, yds)} yards${td ? ' for a TOUCHDOWN!' : '.'}`;
      if (r.user) this.userGrade += td ? 3 : yds >= 25 ? 1.5 : yds >= 12 ? 0.6 : 0;
      if (s.kind === 'punt' && kicker.user) this.userGrade += 0;
    } else {
      endX = this.ball.x;
      if (endX >= 100) { touchback = true; endX = 100; desc += ' Touchback.'; }
      else desc += ' Downed.';
    }
    if (s.kind === 'punt') {
      const net = (touchback ? 80 : Math.min(100, endX)) - this.los;
      if (!touchback && endX >= 80 && holder === 'def') add(kicker, 'puntIn20');
      if (kicker.user) { this.userGrade += net >= 42 ? 1.2 : net >= 35 ? 0.5 : -0.5; if (endX >= 90 && !touchback) { this.userGrade += 1; this.notes.push('Pinned them deep'); } }
    } else if (kicker.user) {
      this.userGrade += touchback ? 0.6 : 0.2;
    }
    this.outcome = {
      kind: s.kind, endX, holder, td, touchback, duration: t, stats, desc, oob: this.kickResult.oob,
      endY: clamp(this.ball.y, 0.5, FIELD_W - 0.5), grade: this.userGrade, notes: this.notes.slice(), userInvolved: !!this.user,
      bigPlay: td,
    };
  }

  /** Text describing why the play ended. */
  get whistleText() {
    return this.lastWhistleText;
  }

  /** Force-finish a play (used when skipping). */
  forceFinish() {
    while (this.phase === 'live' || this.phase === 'dead') this.step(1 / 30);
  }

  /** Memo the pass target so stats survive ball resets. */
  rememberTarget() {
    if (this.ball.target >= 0) this.ballTargetMemo = this.ball.target;
  }
}

/** Utility for tests & drills: run a sim with AI only until finished. */
export function runToEnd(sim: PlaySim, maxT = 30) {
  sim.snap();
  let t = 0;
  while (sim.phase !== 'done' && t < maxT) {
    sim.step(1 / 60);
    sim.rememberTarget();
    t += 1 / 60;
  }
  return sim.outcome;
}
