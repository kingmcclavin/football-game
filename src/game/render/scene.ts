// ---------------------------------------------------------------------------
// Three.js scene: stadium, 22 player models, ball, field overlays, camera.
// Reads PlaySim state every frame; never mutates it.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Appearance } from '../../core/types';
import { TEAMS, type TeamDef } from '../../data/teams';
import { buildStadium, type StadiumParts } from './stadium';
import { PlayerModel, type Uniform } from './playerModel';
import type { PlaySim, SimAgent } from '../engine/PlaySim';

export type CamMode = 'broadcast' | 'chase' | 'wide';
const FIELD_W = 53.333;

function lum(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function uniformFor(t: TeamDef, kind: 'home' | 'away' | 'alt'): Uniform {
  const light = lum(t.primary) > 0.55;
  const helmet = lum(t.primary) > 0.8 ? t.secondary : t.primary;
  if (kind === 'away') {
    return { jersey: '#f3f3f3', pants: lum(t.primary) > 0.6 ? t.secondary : t.primary, helmet, number: light ? t.secondary : t.primary, outline: t.secondary === '#FFFFFF' ? '#222' : t.secondary, socks: t.primary, stripe: t.primary, teamColor: t.primary };
  }
  if (kind === 'alt') {
    const sl = lum(t.secondary) > 0.55;
    return { jersey: t.secondary, pants: t.secondary, helmet, number: sl ? t.primary : '#ffffff', outline: sl ? '#ffffff' : t.primary, socks: t.secondary, stripe: t.primary, teamColor: t.secondary };
  }
  return { jersey: t.primary, pants: lum(t.secondary) < 0.85 && t.secondary !== t.primary ? '#f1f1f1' : t.secondary, helmet, number: light ? '#111111' : '#ffffff', outline: t.secondary, socks: t.primary, stripe: t.secondary === t.primary ? '#ffffff' : t.secondary, teamColor: t.primary };
}

function badgeTexture(label: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#0b1220';
  ctx.stroke();
  ctx.fillStyle = '#0b1220';
  ctx.font = '900 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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

export class Scene3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  models: PlayerModel[] = [];
  ball: THREE.Mesh;
  ballShadow: THREE.Mesh;
  losLine: THREE.Mesh;
  fdLine: THREE.Mesh;
  landMarker: THREE.Mesh;
  badges: THREE.Sprite[] = [];
  badgeTex: Record<string, THREE.CanvasTexture> = {};
  routeGroup = new THREE.Group();
  stadium: StadiumParts;
  dir: 1 | -1 = 1;
  camMode: CamMode = 'broadcast';
  camPos = new THREE.Vector3(0, 20, 30);
  camLook = new THREE.Vector3();
  private crowdT = 0;
  private shake = 0;
  quality: 'low' | 'medium' | 'high';
  homeId: number;

  constructor(canvas: HTMLCanvasElement, homeTeam: number, quality: 'low' | 'medium' | 'high') {
    this.quality = quality;
    this.homeId = homeTeam;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const home = TEAMS[homeTeam];
    const night = home.lighting === 'night' && !home.dome;
    this.scene.background = new THREE.Color(home.dome ? '#2a2f3a' : night ? '#0a1024' : home.lighting === 'dusk' ? '#e89a6a' : '#8ec5ff');
    this.scene.fog = new THREE.Fog(this.scene.background as THREE.Color, 140, 320);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);
    this.stadium = buildStadium(home, quality);
    this.scene.add(this.stadium.group);
    for (let i = 0; i < 22; i++) {
      const m = new PlayerModel();
      this.models.push(m);
      this.scene.add(m.root);
    }
    const ballGeo = new THREE.SphereGeometry(0.16, 10, 8);
    ballGeo.scale(1, 1, 1.7);
    this.ball = new THREE.Mesh(ballGeo, new THREE.MeshLambertMaterial({ color: '#7a3d1a' }));
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    const lineGeo = new THREE.PlaneGeometry(0.25, FIELD_W);
    this.losLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: '#3d8bff', transparent: true, opacity: 0.85, depthWrite: false }));
    this.losLine.rotation.x = -Math.PI / 2;
    this.losLine.position.y = 0.03;
    this.scene.add(this.losLine);
    this.fdLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.9, depthWrite: false }));
    this.fdLine.rotation.x = -Math.PI / 2;
    this.fdLine.position.y = 0.035;
    this.scene.add(this.fdLine);
    this.landMarker = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
    this.landMarker.rotation.x = -Math.PI / 2;
    this.landMarker.position.y = 0.05;
    this.landMarker.visible = false;
    this.scene.add(this.landMarker);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      s.scale.set(1.1, 1.1, 1);
      s.visible = false;
      s.renderOrder = 10;
      this.badges.push(s);
      this.scene.add(s);
    }
    this.scene.add(this.routeGroup);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = w < h ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  /** Field (play-relative) coords -> world X/Z. */
  toWorld(x: number, y: number): [number, number] {
    const wx = this.dir === 1 ? x : 100 - x;
    const wy = this.dir === 1 ? y : FIELD_W - y;
    return [wx - 50, wy - FIELD_W / 2];
  }

  /** Field-relative direction of the camera's forward (for input mapping). */
  cameraFieldBasis(): { fx: number; fy: number; rx: number; ry: number } {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    f.y = 0;
    f.normalize();
    // world -> field: X = (x - 50) * dir ... direction only
    const fx = f.x * this.dir, fy = f.z * this.dir;
    // right vector = forward rotated -90deg in the XZ plane (screen right)
    const r = new THREE.Vector3(-f.z, 0, f.x);
    return { fx, fy, rx: r.x * this.dir, ry: r.z * this.dir };
  }

  setPlay(sim: PlaySim, info: PlayVisualInfo) {
    this.dir = info.dir;
    const off = TEAMS[info.offTeam], def = TEAMS[info.defTeam];
    const homeIsOff = info.offTeam === info.homeTeam;
    const offKind = homeIsOff ? 'home' : 'away';
    const defKind = homeIsOff ? 'away' : 'home';
    sim.agents.forEach((a, i) => {
      const m = this.models[i];
      m.root.visible = true;
      const team = a.side === 'off' ? off : def;
      let kind: 'home' | 'away' | 'alt' = a.side === 'off' ? offKind : defKind;
      if (info.userUniform && info.userUniform !== 'home' && kind === 'home' && ((a.side === 'off' && sim.user?.side === 'off') || (a.side === 'def' && sim.user?.side === 'def'))) kind = info.userUniform === 'alt' ? 'alt' : 'home';
      m.setUniform(uniformFor(team, kind), a.p.num);
      m.setAppearance(a.user ? info.userAppearance : undefined, a.p.num * 13 + i, true, a.p.ht, a.p.wt);
      m.marker.visible = a.user;
      m.spin = 0;
    });
    for (let i = sim.agents.length; i < this.models.length; i++) this.models[i].root.visible = false;
    // LOS / first down
    const [lx] = this.toWorld(sim.los, 0);
    this.losLine.position.x = lx;
    const showFd = sim.kind === 'scrimmage' && sim.firstDownX < 100;
    this.fdLine.visible = showFd;
    if (showFd) this.fdLine.position.x = this.toWorld(sim.firstDownX, 0)[0];
    this.losLine.visible = sim.kind !== 'kickoff';
    this.buildRoutes(sim, info);
    this.snapCamera(sim);
  }

  private buildRoutes(sim: PlaySim, info: PlayVisualInfo) {
    this.routeGroup.clear();
    if (!info.showRoutes) return;
    const matUser = new THREE.LineBasicMaterial({ color: '#ffd23f' });
    const matOther = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 });
    for (const a of sim.agents) {
      if (a.task.k !== 'route') continue;
      if (!a.user && !info.qbView) continue;
      const pts = [new THREE.Vector3(...this.v3(a.x, a.y, 0.06))];
      for (const p of a.task.pts) pts.push(new THREE.Vector3(...this.v3(p.x, p.y, 0.06)));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), a.user ? matUser : matOther);
      this.routeGroup.add(line);
    }
    // defensive user: show zone or man responsibility
    const u = sim.user;
    if (u && u.side === 'def') {
      if (u.task.k === 'zone') {
        const L = sim.zoneLandmark(u.task.zone);
        const ring = new THREE.Mesh(new THREE.RingGeometry(L.r - 0.3, L.r, 32), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.45, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        const [x, z] = this.toWorld(L.x, L.y);
        ring.position.set(x, 0.05, z);
        this.routeGroup.add(ring);
      } else if (u.task.k === 'man') {
        const t = sim.agents[u.task.target];
        const pts = [new THREE.Vector3(...this.v3(u.x, u.y, 0.06)), new THREE.Vector3(...this.v3(t.x, t.y, 0.06))];
        this.routeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matUser));
      }
    }
    if (u && u.task.k === 'runner') {
      const pts = [new THREE.Vector3(...this.v3(u.x, u.y, 0.06)), new THREE.Vector3(...this.v3(u.task.meshX, u.task.meshY, 0.06)), new THREE.Vector3(...this.v3(sim.los + 2, u.task.holeY, 0.06))];
      this.routeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matUser));
    }
  }

  private v3(x: number, y: number, h: number): [number, number, number] {
    const [X, Z] = this.toWorld(x, y);
    return [X, h, Z];
  }

  clearRoutes() {
    this.routeGroup.clear();
  }

  private camGoal(sim: PlaySim): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const b = sim.ball;
    const u = sim.user;
    const carrier = sim.carrier();
    // focus point
    let fx = b.x, fy = b.y, fz = 0;
    if (sim.phase === 'pre') { fx = sim.los; fy = b.y; }
    else if (carrier) { fx = carrier.x; fy = carrier.y; }
    else if (b.state === 'air' || b.state === 'kicked') { fx = b.x; fy = b.y; fz = Math.min(b.z, 8) * 0.4; }
    // keep the user's player in frame when they are away from the ball
    let spread = 0;
    if (u && carrier !== u && sim.kind === 'scrimmage' && u.slot !== 'QB' && this.camMode === 'broadcast') {
      const w = sim.phase === 'pre' ? 0.4 : 0.5;
      spread = Math.abs(u.y - fy);
      fx += (u.x - fx) * w * 0.5;
      fy += (u.y - fy) * w;
    }
    // perspective side: offense looks downfield (+x), user defenders look at the offense
    const viewSign = u && u.side === 'def' && sim.kind === 'scrimmage' ? -1 : 1;
    const look = new THREE.Vector3(...this.v3(fx + viewSign * 6, fy, fz));
    const pos = new THREE.Vector3();
    const mode = this.camMode;
    if (mode === 'wide') {
      const [X, Z] = this.toWorld(fx, fy);
      pos.set(X - this.dir * viewSign * 4, 30, Z + (this.dir === 1 ? 1 : -1) * 34);
      look.set(X, 0, Z);
    } else if (mode === 'chase' && u && !u.down && sim.phase !== 'pre') {
      const [UX, UZ] = this.toWorld(u.x, u.y);
      const sp = Math.hypot(u.vx, u.vy);
      let ang = sp > 1.5 ? Math.atan2(u.vy, u.vx) : viewSign > 0 ? 0 : Math.PI;
      if (this.dir === -1) ang += Math.PI;
      const fwdX = Math.cos(ang), fwdZ = Math.sin(ang);
      pos.set(UX - fwdX * 7.5, 4.8, UZ - fwdZ * 7.5);
      look.set(UX + fwdX * 6, 1, UZ + fwdZ * 6);
    } else {
      const portrait = this.camera.aspect < 1;
      const back = ((sim.phase === 'pre' ? 14 : 15) + spread * 0.22) * (portrait ? 1.45 : 1);
      const height = ((sim.kind === 'kickoff' || sim.kind === 'punt' ? 13 : 9.5) + spread * 0.14) * (portrait ? 1.5 : 1);
      const [X, Z] = this.toWorld(fx - viewSign * back, fy);
      // keep the camera a bit closer to the middle of the field for context
      const zMid = Z * 0.65;
      pos.set(X, height, zMid);
      if (b.state === 'air' && b.kind === 'pass') {
        // pull back and look toward the landing point while the pass is in flight
        const [TX, TZ] = this.toWorld(b.tx, b.ty);
        look.lerp(new THREE.Vector3(TX, 1, TZ), 0.5);
        pos.y += 3;
      }
    }
    return { pos, look };
  }

  snapCamera(sim: PlaySim) {
    const g = this.camGoal(sim);
    this.camPos.copy(g.pos);
    this.camLook.copy(g.look);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  addShake(v: number) {
    this.shake = Math.max(this.shake, v);
  }

  update(sim: PlaySim, dt: number, opts: { userQbReads?: { idx: number; label: string; open: number }[]; showLanding: boolean }) {
    const agents = sim.agents;
    for (let i = 0; i < agents.length; i++) {
      const a: SimAgent = agents[i];
      const m = this.models[i];
      const [X, Z] = this.toWorld(a.x, a.y);
      let face = a.face;
      if (this.dir === -1) face += Math.PI;
      // field (x,y) -> world (X,Z): yaw = atan2(dirX, dirZ)
      const yaw = Math.atan2(Math.cos(face), Math.sin(face));
      m.setPose(X, Z, yaw);
      const sp = Math.hypot(a.vx, a.vy);
      const anim = sim.phase === 'pre' ? (a.slot === 'C' || a.slot === 'LS' ? 'snap' : a.slot === 'H' ? 'hold' : 'stance') : a.anim;
      const stance3 = ['LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'LDT', 'RDT', 'OL', 'R'].includes(a.slot);
      m.animate(anim, a.animT, sp, dt, { stance3, side: a.moveDir || 1 });
      m.marker.visible = a.user;
      if (a.user) {
        const mm = m.marker.material as THREE.MeshBasicMaterial;
        mm.opacity = 0.6 + Math.sin(performance.now() / 200) * 0.3;
      }
    }
    // Ball
    const b = sim.ball;
    const [BX, BZ] = this.toWorld(b.x, b.y);
    this.ball.position.set(BX, Math.max(0.15, b.z), BZ);
    if (b.state === 'air' || b.state === 'kicked') {
      const vx = b.vx * this.dir, vz = b.vy * this.dir;
      this.ball.rotation.set(0, Math.atan2(vx, vz), 0);
      this.ball.rotateX(-Math.atan2(b.vz, Math.hypot(b.vx, b.vy)));
      if (b.kind === 'punt' || b.kind === 'kickoff' || b.kind === 'kick') this.ball.rotateX(performance.now() / 60);
    } else if (b.state === 'held' && b.holder >= 0) {
      const h = agents[b.holder];
      let f = h.face;
      if (this.dir === -1) f += Math.PI;
      this.ball.rotation.set(0.6, Math.atan2(Math.cos(f), Math.sin(f)), 0);
    } else if (b.state === 'pre' || b.state === 'snap') {
      this.ball.rotation.set(0, 0, 0);
    }
    this.ballShadow.position.set(BX, 0.025, BZ);
    this.ballShadow.visible = b.z > 0.3;
    // Landing marker for passes and kicks
    const showLand = opts.showLanding && (b.state === 'air' || b.state === 'kicked') && b.kind !== 'snap';
    this.landMarker.visible = showLand;
    if (showLand) {
      const [TX, TZ] = this.toWorld(b.tx, b.ty);
      this.landMarker.position.set(TX, 0.05, TZ);
      const s = 1 + Math.sin(performance.now() / 120) * 0.12;
      this.landMarker.scale.set(s, s, s);
    }
    // QB read badges
    this.badges.forEach((s) => (s.visible = false));
    if (opts.userQbReads) {
      opts.userQbReads.forEach((r, k) => {
        const a = agents[r.idx];
        if (!a || k >= this.badges.length) return;
        const color = r.open > 3 ? '#3ddc84' : r.open > 1.5 ? '#ffd23f' : '#ff5a5a';
        const key = `${r.label}${color}`;
        const tex = (this.badgeTex[key] ??= badgeTexture(r.label, color));
        const s = this.badges[k];
        (s.material as THREE.SpriteMaterial).map = tex;
        (s.material as THREE.SpriteMaterial).needsUpdate = true;
        const [X, Z] = this.toWorld(a.x, a.y);
        s.position.set(X, 2.9, Z);
        s.visible = true;
      });
    }
    // Camera
    const g = this.camGoal(sim);
    const k = 1 - Math.pow(0.0015, dt);
    this.camPos.lerp(g.pos, k);
    this.camLook.lerp(g.look, Math.min(1, k * 1.6));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(this.camLook);
    // crowd sway
    this.crowdT += dt;
    for (const c of this.stadium.crowd) c.position.y += Math.sin(this.crowdT * 6 + c.id) * 0.002;
  }

  updateScoreboard(lines: { home: string; away: string; hs: number; as: number; q: string; clock: string; down: string; homeColor: string; awayColor: string }) {
    const { canvas, tex } = this.stadium.scoreboard;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '900 54px "Arial Black", Impact, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = lines.awayColor;
    ctx.fillRect(10, 14, 240, 90);
    ctx.fillStyle = lines.homeColor;
    ctx.fillRect(262, 14, 240, 90);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(lines.away, 22, 60);
    ctx.fillText(lines.home, 274, 60);
    ctx.textAlign = 'right';
    ctx.fillText(String(lines.as), 240, 60);
    ctx.fillText(String(lines.hs), 492, 60);
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.fillText(`${lines.q}  ${lines.clock}  ${lines.down}`, 256, 150);
    tex.needsUpdate = true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(m.geometry as THREE.BufferGeometry & { _shared?: boolean })._shared) m.geometry.dispose?.();
    });
  }
}
