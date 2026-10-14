// ---------------------------------------------------------------------------
// Renderer2D: a retro pixel-art view of the PlaySim. The field is drawn
// horizontally (offense attacking left or right) with a compressed vertical
// axis for a slightly angled look. Renders into a low-resolution canvas that
// is scaled up by an integer factor with nearest-neighbour filtering.
// ---------------------------------------------------------------------------
import type { Appearance } from '../../core/types';
import { TEAMS, type TeamDef } from '../../data/teams';
import type { PlaySim, SimAgent } from '../engine/PlaySim';
import {
  HAIR_COLORS, SKIN_TONES, VISOR_COLORS, drawBall, drawLogo, drawPlayer, drawText, glovesColor, kitFor, textWidth,
  type Kit, type PixelPose,
} from './sprites';

export type CamMode = 'broadcast' | 'chase' | 'wide';
const FIELD_W = 53.333;
const TOP_CROWD = 30;
const BOTTOM_CROWD = 18;

export interface PlayVisualInfo {
  offTeam: number;
  defTeam: number;
  homeTeam: number;
  dir: 1 | -1;
  userAppearance?: Appearance;
  userUniform?: 'home' | 'away' | 'alt';
  showRoutes: boolean;
  qbView: boolean;
}

export interface AimState {
  active: boolean;
  x: number; // field coords
  y: number;
  target: number; // agent index or -1
}

interface AgentLook {
  kit: Kit;
  skin: string;
  hairBack?: string;
  visor?: string;
  gloves?: string;
  sleeves?: number;
  big: number;
  dist: number;
}

export class Renderer2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 427;
  H = 240;
  scale = 3;
  ppx = 8; // pixels per yard along the field
  ppy = 3.2; // pixels per yard across the field (compressed)
  ppz = 5; // pixels per yard of height
  fieldTop = TOP_CROWD;
  camX = 0;
  dir: 1 | -1 = 1;
  camMode: CamMode = 'broadcast';
  private home: TeamDef;
  private fieldCache: HTMLCanvasElement | null = null;
  private looks: AgentLook[] = [];
  private routes: { pts: [number, number][]; user: boolean }[] = [];
  private zone: { x: number; y: number; r: number } | null = null;
  private shake = 0;
  private cheer = 0;
  private t = 0;
  private confetti: { x: number; y: number; vx: number; vy: number; c: string }[] = [];
  private scoreboard = { home: '', away: '', hs: 0, as: 0, q: '', clock: '' };

  constructor(canvas: HTMLCanvasElement, homeTeam: number, _quality?: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.home = TEAMS[homeTeam];
  }

  resize(cssW: number, cssH: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // integer up-scaling keeps pixels crisp
    const target = this.camMode === 'wide' ? 200 : this.camMode === 'chase' ? 300 : 240;
    this.scale = Math.max(1, Math.round((cssH * dpr) / target));
    this.H = Math.max(140, Math.ceil((cssH * dpr) / this.scale));
    this.W = Math.max(200, Math.ceil((cssW * dpr) / this.scale));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
    const fieldPx = this.H - TOP_CROWD - BOTTOM_CROWD;
    this.ppy = fieldPx / FIELD_W;
    this.ppx = this.camMode === 'wide' ? 6 : this.camMode === 'chase' ? 9 : 8;
    this.fieldCache = null;
  }

  /** world X (yards, -10..110 left->right on screen) for a field coordinate */
  private wx(x: number) {
    return this.dir === 1 ? x : 100 - x;
  }
  private wy(y: number) {
    return this.dir === 1 ? FIELD_W - y : y;
  }
  sx(x: number) {
    return (this.wx(x) + 12) * this.ppx - this.camX;
  }
  sy(y: number) {
    return this.fieldTop + this.wy(y) * this.ppy;
  }
  /** Screen pixel -> field coordinates (used by drag aiming). */
  toField(px: number, py: number): { x: number; y: number } {
    const wx = (px + this.camX) / this.ppx - 12;
    const wy = (py - this.fieldTop) / this.ppy;
    return { x: this.dir === 1 ? wx : 100 - wx, y: this.dir === 1 ? FIELD_W - wy : wy };
  }
  /** Convert a CSS-pixel delta into a field delta. */
  deltaToField(dxCss: number, dyCss: number): { dx: number; dy: number } {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const dx = (dxCss * dpr) / this.scale / this.ppx;
    const dy = (dyCss * dpr) / this.scale / this.ppy;
    return { dx: dx * this.dir, dy: -dy * this.dir };
  }
  cssToCanvas(cx: number, cy: number): { px: number; py: number } {
    const r = this.canvas.getBoundingClientRect();
    return { px: ((cx - r.left) / r.width) * this.W, py: ((cy - r.top) / r.height) * this.H };
  }

  /** Field directions for joystick input: screen up / screen right. */
  cameraFieldBasis(): { fx: number; fy: number; rx: number; ry: number } {
    return { fx: 0, fy: this.dir, rx: this.dir, ry: 0 };
  }

  private buildField() {
    const w = Math.ceil(124 * this.ppx);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = this.H;
    const g = c.getContext('2d')!;
    const ppx = this.ppx, ppy = this.ppy, top = this.fieldTop;
    const fx = (wx: number) => Math.round((wx + 12) * ppx);
    const fh = Math.round(FIELD_W * ppy);
    const home = this.home;
    // stands
    g.fillStyle = '#1b2236';
    g.fillRect(0, 0, w, this.H);
    const seat = shade(home.primary, -0.55);
    g.fillStyle = seat;
    g.fillRect(0, 0, w, top - 3);
    g.fillRect(0, top + fh + 3, w, this.H - top - fh - 3);
    // crowd pixels
    const crowdCols = [home.primary, home.secondary, '#f2f2f2', '#e7c9a5', '#8a5a3c', '#3a2a22', home.primary, '#d8c070'];
    let seed = home.id * 97 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 2; y < top - 5; y += 3) for (let x = (y % 2) * 2; x < w; x += 3) { g.fillStyle = crowdCols[Math.floor(rnd() * crowdCols.length)]; g.fillRect(x, y, 2, 2); }
    for (let y = top + fh + 6; y < this.H - 1; y += 3) for (let x = (y % 2) * 2; x < w; x += 3) { g.fillStyle = crowdCols[Math.floor(rnd() * crowdCols.length)]; g.fillRect(x, y, 2, 2); }
    // sideline strip
    g.fillStyle = '#2e5f2a';
    g.fillRect(0, top - 3, w, 3);
    g.fillRect(0, top + fh, w, 3);
    // grass stripes
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? '#3f8f3a' : '#47a042';
      g.fillRect(fx(-10 + i * 5), top, Math.ceil(5 * ppx), fh);
    }
    // end zones with team name
    for (const [x0, rot] of [[-10, -1], [100, 1]] as [number, number][]) {
      g.fillStyle = home.primary;
      g.fillRect(fx(x0), top, Math.ceil(10 * ppx), fh);
      const name = home.name.toUpperCase();
      const sc = 2;
      // vertical lettering, one letter per row
      const letters = name.replace(/ /g, '').slice(0, 10);
      const total = letters.length * 6 * sc - sc;
      let yy = top + Math.round((fh - total) / 2);
      const cx = fx(x0 + 5) - 3 * sc / 2;
      for (const ch of letters) {
        drawText(g, ch, cx + 1, yy + 1, '#00000055', sc);
        drawText(g, ch, cx, yy, home.secondary === home.primary ? '#ffffff' : home.secondary, sc);
        yy += 6 * sc;
      }
      void rot;
    }
    // lines
    g.fillStyle = '#f4f4f4';
    for (let yd = 0; yd <= 100; yd += 5) g.fillRect(fx(yd), top, yd % 10 === 0 || yd === 0 || yd === 100 ? 2 : 1, fh);
    g.fillRect(fx(-10), top, 1, fh);
    g.fillRect(fx(110), top, 1, fh);
    g.fillRect(fx(-10), top, Math.ceil(120 * ppx), 1);
    g.fillRect(fx(-10), top + fh - 1, Math.ceil(120 * ppx), 1);
    // hash marks
    for (let yd = 1; yd < 100; yd++) {
      if (yd % 5 === 0) continue;
      for (const hy of [1, 23.6, 29.75, FIELD_W - 1]) g.fillRect(fx(yd), top + Math.round(hy * ppy), 1, 1);
    }
    // numbers
    for (let yd = 10; yd <= 90; yd += 10) {
      const n = String(yd <= 50 ? yd : 100 - yd);
      for (const ny of [6, FIELD_W - 8]) drawText(g, n, fx(yd) - textWidth(n) / 2 + 1, top + Math.round(ny * ppy), '#f4f4f4');
    }
    // midfield logo
    drawLogo(g, home, fx(50) - 10, top + Math.round(fh / 2) - 10, 20);
    // goalposts (drawn as part of the background, stylized)
    for (const gx of [-10, 110]) {
      const x = fx(gx);
      const cy = top + Math.round((FIELD_W / 2) * ppy);
      g.fillStyle = '#f2cf3a';
      g.fillRect(x - 1, cy - 2, 3, 3);
      g.fillRect(x, cy - Math.round(3.1 * ppy) - 14, 1, Math.round(6.2 * ppy) + 14);
      g.fillRect(x - 1, cy - Math.round(3.1 * ppy) - 14, 3, 1);
    }
    this.fieldCache = c;
  }

  setPlay(sim: PlaySim, info: PlayVisualInfo) {
    this.dir = info.dir;
    const off = TEAMS[info.offTeam], def = TEAMS[info.defTeam];
    const homeIsOff = info.offTeam === info.homeTeam;
    this.looks = sim.agents.map((a, i) => {
      const team = a.side === 'off' ? off : def;
      let kind: 'home' | 'away' | 'alt' = (a.side === 'off') === homeIsOff ? 'home' : 'away';
      if (a.user && info.userUniform === 'alt' && kind === 'home') kind = 'alt';
      if (info.userUniform === 'alt' && kind === 'home' && sim.user && a.side === sim.user.side) kind = 'alt';
      const kit = kitFor(team, kind);
      const r = (n: number) => Math.abs(Math.sin((a.p.num + i) * 12.9898 + n * 78.233) * 43758.5453) % 1;
      const app = a.user ? info.userAppearance : undefined;
      const skin = app ? SKIN_TONES[app.skin] : SKIN_TONES[Math.floor(r(1) * SKIN_TONES.length)];
      return {
        kit, skin,
        hairBack: app ? (app.hair === 4 ? HAIR_COLORS[app.hairColor] : undefined) : r(2) < 0.15 ? HAIR_COLORS[0] : undefined,
        visor: app ? (app.visor ? VISOR_COLORS[app.visor] : undefined) : r(3) < 0.2 ? VISOR_COLORS[2] : undefined,
        gloves: app ? glovesColor(app, kit) : undefined,
        sleeves: app ? app.sleeves : 0,
        big: ['OL', 'DT', 'DE'].includes(a.p.pos) ? 1 : 0,
        dist: 0,
      };
    });
    this.routes = [];
    this.zone = null;
    if (info.showRoutes) {
      for (const a of sim.agents) {
        if (a.task.k !== 'route') continue;
        if (!a.user && !info.qbView) continue;
        this.routes.push({ pts: [[a.x, a.y], ...a.task.pts.map((p) => [p.x, p.y] as [number, number])], user: a.user });
      }
      const u = sim.user;
      if (u && u.task.k === 'runner') this.routes.push({ pts: [[u.x, u.y], [u.task.meshX, u.task.meshY], [sim.los + 3, u.task.holeY]], user: true });
      if (u && u.task.k === 'zone') { const L = sim.zoneLandmark(u.task.zone); this.zone = { x: L.x, y: L.y, r: L.r }; }
      if (u && u.task.k === 'man') { const t = sim.agents[u.task.target]; this.routes.push({ pts: [[u.x, u.y], [t.x, t.y]], user: true }); }
    }
    this.snapCamera(sim);
  }

  clearRoutes() {
    this.routes = [];
    this.zone = null;
  }

  private focusX(sim: PlaySim): number {
    const b = sim.ball;
    const c = sim.carrier();
    let fx = sim.phase === 'pre' ? sim.los : c ? c.x : b.x;
    const u = sim.user;
    if (u && c !== u && sim.kind === 'scrimmage' && sim.phase !== 'pre') fx = fx * 0.55 + u.x * 0.45;
    if (b.state === 'air' && b.kind === 'pass') fx = (b.x + b.tx) / 2;
    if (sim.phase === 'pre' && sim.kind === 'scrimmage') fx = sim.los + 6;
    if (sim.kind === 'kickoff' && sim.phase === 'pre') fx = sim.los + 18;
    return fx;
  }

  snapCamera(sim: PlaySim) {
    this.camX = this.camTarget(sim);
  }

  private camTarget(sim: PlaySim) {
    const fx = this.focusX(sim);
    // lead the camera in the direction of attack
    const lead = (this.W / this.ppx) * 0.12 * (this.dir === 1 ? 1 : -1) * (sim.carrier()?.side === 'def' ? -1 : 1);
    const target = (this.wx(fx) + 12) * this.ppx + lead * this.ppx - this.W / 2;
    const maxX = 124 * this.ppx - this.W;
    return Math.max(0, Math.min(Math.max(0, maxX), target));
  }

  addShake(v: number) {
    this.shake = Math.max(this.shake, v * 6);
  }

  celebrate() {
    this.cheer = 2.5;
    const cols = ['#ffd23f', '#ff5a5a', '#3ddc84', '#4aa3ff', '#ffffff'];
    for (let i = 0; i < 80; i++) this.confetti.push({ x: Math.random() * this.W, y: -Math.random() * 40, vx: (Math.random() - 0.5) * 20, vy: 20 + Math.random() * 40, c: cols[i % cols.length] });
  }

  update(sim: PlaySim, dt: number, opts: { userQbReads?: { idx: number; label: string; open: number }[]; showLanding: boolean; aim?: AimState | null }) {
    this.t += dt;
    if (!this.fieldCache) this.buildField();
    const target = this.camTarget(sim);
    this.camX += (target - this.camX) * Math.min(1, dt * 4.5);
    const g = this.ctx;
    const sh = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    this.shake = Math.max(0, this.shake - dt * 12);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#10131f';
    g.fillRect(0, 0, this.W, this.H);
    g.drawImage(this.fieldCache!, Math.round(-this.camX), sh);
    // cheering crowd: jitter rows
    if (this.cheer > 0) {
      this.cheer -= dt;
      g.fillStyle = 'rgba(255,255,255,0.06)';
      const off = Math.floor(this.t * 12) % 2;
      for (let x = off; x < this.W; x += 4) g.fillRect(x, 2 + (x % 3), 2, 2);
    }
    // LOS + first down
    if (sim.kind === 'scrimmage' || sim.kind === 'fg' || sim.kind === 'xp' || sim.kind === 'punt') {
      g.fillStyle = '#4aa3ff';
      g.fillRect(Math.round(this.sx(sim.los)), this.fieldTop, 1, Math.round(FIELD_W * this.ppy));
    }
    if (sim.kind === 'scrimmage' && sim.firstDownX < 100) {
      g.fillStyle = '#ffd23f';
      g.fillRect(Math.round(this.sx(sim.firstDownX)), this.fieldTop, 1, Math.round(FIELD_W * this.ppy));
    }
    // routes (dotted)
    for (const r of this.routes) {
      for (let k = 0; k < r.pts.length - 1; k++) this.dotted(r.pts[k][0], r.pts[k][1], r.pts[k + 1][0], r.pts[k + 1][1], r.user ? '#ffd23f' : 'rgba(255,255,255,0.75)');
    }
    if (this.zone) this.ring(this.zone.x, this.zone.y, this.zone.r, '#ffd23f');
    // landing marker
    const b = sim.ball;
    if (opts.showLanding && (b.state === 'air' || b.state === 'kicked') && b.kind !== 'snap') {
      const x = Math.round(this.sx(b.tx)), y = Math.round(this.sy(b.ty));
      g.fillStyle = Math.floor(this.t * 6) % 2 ? '#ffffff' : '#ffd23f';
      for (let i = -2; i <= 2; i++) { g.fillRect(x + i, y + i, 1, 1); g.fillRect(x + i, y - i, 1, 1); }
    }
    // players, sorted by screen y
    const order = sim.agents.map((a) => a.i).sort((p, q) => this.sy(sim.agents[p].y) - this.sy(sim.agents[q].y));
    for (const i of order) this.drawAgent(sim, sim.agents[i], this.looks[i], dt, sh);
    // ball (not while held: drawn in hands)
    const bx = this.sx(b.x), by = this.sy(b.y) + sh;
    if (b.state === 'held' && b.holder >= 0) {
      const h = sim.agents[b.holder];
      const face = this.facing(h);
      drawBall(g, this.sx(h.x) + face * 3, this.sy(h.y) + sh, h.down ? 2 : 8, 0);
    } else drawBall(g, bx, by, b.z * this.ppz, this.t * 14);
    // user indicator & QB reads
    if (opts.userQbReads) {
      for (const r of opts.userQbReads) {
        const a = sim.agents[r.idx];
        const x = Math.round(this.sx(a.x)), y = Math.round(this.sy(a.y)) - 24 + sh;
        const col = r.open > 3 ? '#3ddc84' : r.open > 1.5 ? '#ffd23f' : '#ff5a5a';
        g.fillStyle = '#0b1020';
        g.fillRect(x - 4, y - 1, 9, 8);
        g.fillStyle = col;
        g.fillRect(x - 3, y, 7, 6);
        drawText(g, r.label, x - 1, y + 1, '#0b1020');
      }
    }
    // aim line
    const aim = opts.aim;
    if (aim && aim.active && sim.qb >= 0) {
      const qb = sim.agents[sim.qb];
      this.dotted(qb.x, qb.y, aim.x, aim.y, '#ffffff');
      const x = Math.round(this.sx(aim.x)), y = Math.round(this.sy(aim.y));
      g.fillStyle = aim.target >= 0 ? '#3ddc84' : '#ffffff';
      g.fillRect(x - 3, y, 2, 1); g.fillRect(x + 2, y, 2, 1); g.fillRect(x, y - 3, 1, 2); g.fillRect(x, y + 2, 1, 2);
      if (aim.target >= 0) {
        const a = sim.agents[aim.target];
        this.ring(a.x, a.y, 1.6, '#3ddc84');
      }
    }
    // confetti
    if (this.confetti.length) {
      for (const c of this.confetti) {
        c.x += c.vx * dt; c.y += c.vy * dt;
        g.fillStyle = c.c;
        g.fillRect(Math.round(c.x), Math.round(c.y), 2, 2);
      }
      this.confetti = this.confetti.filter((c) => c.y < this.H);
    }
  }

  private facing(a: SimAgent): 1 | -1 {
    const fx = Math.cos(a.face) * this.dir;
    return fx >= 0 ? 1 : -1;
  }

  private drawAgent(sim: PlaySim, a: SimAgent, look: AgentLook | undefined, dt: number, sh: number) {
    if (!look) return;
    const sp = Math.hypot(a.vx, a.vy);
    look.dist += sp * dt;
    let pose: PixelPose = 'stand';
    const st = sim.phase === 'pre' ? (['LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'LDT', 'RDT', 'OL', 'R', 'LS'].includes(a.slot) ? 'stance' : 'stand') : a.anim;
    switch (st) {
      case 'stance': pose = 'stance'; break;
      case 'run': case 'stiff': pose = sp > 0.6 ? 'run' : 'stand'; break;
      case 'juke': case 'spin': pose = 'juke'; break;
      case 'throw': pose = 'throw'; break;
      case 'catch': case 'swat': case 'jump': pose = 'catch'; break;
      case 'block': pose = 'block'; break;
      case 'down': case 'tackle': case 'slide': pose = 'down'; break;
      case 'dive': pose = 'dive'; break;
      case 'celebrate': pose = 'celebrate'; break;
      case 'kick': pose = 'kick'; break;
      case 'hold': pose = 'hold'; break;
      default: pose = sp > 0.6 ? 'run' : 'stand';
    }
    const x = this.sx(a.x), y = this.sy(a.y) + sh;
    if (x < -20 || x > this.W + 20) return;
    if (a.user) {
      // blinking marker under the user's player
      const on = Math.floor(this.t * 4) % 2 === 0;
      this.ctx.fillStyle = on ? '#ffd23f' : '#ffffff';
      this.ctx.fillRect(Math.round(x) - 5, Math.round(y), 11, 1);
      this.ctx.fillRect(Math.round(x) - 6, Math.round(y) - 1, 1, 1);
      this.ctx.fillRect(Math.round(x) + 6, Math.round(y) - 1, 1, 1);
      // arrow above head
      this.ctx.fillRect(Math.round(x) - 1, Math.round(y) - 23, 3, 1);
      this.ctx.fillRect(Math.round(x), Math.round(y) - 22, 1, 1);
    }
    drawPlayer(this.ctx, x, y, {
      kit: look.kit, skin: look.skin, facing: this.facing(a), pose, frame: Math.floor(look.dist * 1.6) + (pose === 'celebrate' ? Math.floor(this.t * 6) : 0),
      hairBack: look.hairBack, visor: look.visor, gloves: look.gloves, sleeves: look.sleeves, big: look.big,
    });
  }

  private dotted(x0: number, y0: number, x1: number, y1: number, color: string) {
    const ax = this.sx(x0), ay = this.sy(y0), bx = this.sx(x1), by = this.sy(y1);
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.floor(len / 3);
    this.ctx.fillStyle = color;
    for (let i = 0; i <= n; i++) {
      const k = n ? i / n : 0;
      this.ctx.fillRect(Math.round(ax + (bx - ax) * k), Math.round(ay + (by - ay) * k), 1, 1);
    }
  }

  private ring(x: number, y: number, r: number, color: string) {
    this.ctx.fillStyle = color;
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      this.ctx.fillRect(Math.round(this.sx(x + Math.cos(a) * r)), Math.round(this.sy(y + Math.sin(a) * r)), 1, 1);
    }
  }

  updateScoreboard(s: { home: string; away: string; hs: number; as: number; q: string; clock: string; [k: string]: string | number }) {
    this.scoreboard = { ...this.scoreboard, ...s };
  }

  render() {
    /* drawing happens in update(); kept for API compatibility */
  }

  dispose() {
    this.fieldCache = null;
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
