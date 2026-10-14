// ---------------------------------------------------------------------------
// Modular, low-poly football player built from primitives. Equipment and
// appearance pieces are separate meshes so they can be swapped without
// rebuilding the model. One unit = one yard.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Appearance } from '../../core/types';
import { numberTexture, blobShadowTexture } from './textures';
import type { AnimState } from '../engine/PlaySim';

export const SKIN_TONES = ['#f6d7c3', '#eac0a0', '#d9a37f', '#b97d57', '#9a6340', '#7a4a2e', '#5c3520', '#3f2416'];
export const HAIR_COLORS = ['#141010', '#3b2416', '#6b4423', '#c9a26b', '#9c3d1d', '#9a9a9a'];
export const HAIR_STYLES = ['Bald', 'Short', 'Buzz', 'Afro', 'Locs', 'Mohawk'];
export const FACIAL_HAIR = ['None', 'Stubble', 'Goatee', 'Full Beard', 'Mustache'];
export const FACE_PRESETS = ['Classic', 'Focused', 'Friendly', 'Intense', 'Veteran'];
export const BODY_TYPES = ['Slim', 'Standard', 'Muscular', 'Heavy'];
export const HELMET_STYLES = ['Standard Mask', 'Open (QB) Mask', 'Lineman Cage', 'Speed Mask'];
export const VISORS = ['None', 'Clear', 'Smoke', 'Gold', 'Blue'];
export const VISOR_COLORS = ['', '#cfe8ff', '#1b1f24', '#d9a521', '#2f6fd6'];
export const GLOVE_COLORS = ['Team', 'Black', 'White', 'Gold', 'Red'];
export const CLEAT_COLORS = ['Black', 'White', 'Team', 'Gold', 'Neon'];
export const SLEEVES = ['None', 'Arm Sleeve', 'Long Sleeves'];

export interface Uniform {
  jersey: string;
  pants: string;
  helmet: string;
  number: string;
  outline: string;
  socks: string;
  stripe: string;
  teamColor: string;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g as T;
}
const box = (w: number, h: number, d: number) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r1: number, r2: number, h: number, s = 7) => geo(`c${r1},${r2},${h},${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));
const sph = (r: number, ws = 10, hs = 8) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));

function mat(color: string, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

export class PlayerModel {
  root = new THREE.Group();
  body = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  shoulderL = new THREE.Group();
  shoulderR = new THREE.Group();
  elbowL = new THREE.Group();
  elbowR = new THREE.Group();
  hipL = new THREE.Group();
  hipR = new THREE.Group();
  kneeL = new THREE.Group();
  kneeR = new THREE.Group();
  mats: Record<string, THREE.MeshLambertMaterial> = {};
  numFront: THREE.Mesh;
  numBack: THREE.Mesh;
  helmetGroup = new THREE.Group();
  hairGroup = new THREE.Group();
  faceGroup = new THREE.Group();
  visor: THREE.Mesh;
  facemasks: THREE.Group[] = [];
  sleeveL: THREE.Mesh;
  sleeveR: THREE.Mesh;
  bands: THREE.Mesh[] = [];
  towel: THREE.Mesh;
  neckRoll: THREE.Mesh;
  eyeBlack: THREE.Group;
  shadow: THREE.Mesh;
  marker: THREE.Mesh;
  phase = Math.random() * 6;
  spin = 0;
  private num = -1;
  private appearanceKey = '';

  constructor() {
    const m = (k: string, c: string, o?: Partial<THREE.MeshLambertMaterialParameters>) => (this.mats[k] = mat(c, o));
    m('jersey', '#ffffff');
    m('pants', '#dddddd');
    m('helmet', '#cccccc');
    m('skin', SKIN_TONES[3]);
    m('socks', '#222222');
    m('glove', '#222222');
    m('cleat', '#111111');
    m('mask', '#dddddd');
    m('stripe', '#ffffff');
    m('hair', HAIR_COLORS[0]);
    m('sleeve', '#111111');
    m('band', '#ffffff');
    m('dark', '#1a1a1a');
    m('visor', '#1b1f24', { transparent: true, opacity: 0.8 });

    const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, mk: string, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(g, this.mats[mk]);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    this.root.add(this.body);
    // Legs
    for (const [hip, knee, side] of [[this.hipL, this.kneeL, 1], [this.hipR, this.kneeR, -1]] as [THREE.Group, THREE.Group, number][]) {
      hip.position.set(0.12 * side, 0.93, 0);
      this.body.add(hip);
      add(hip, cyl(0.1, 0.085, 0.47), 'pants', 0, -0.235, 0);
      knee.position.set(0, -0.47, 0);
      hip.add(knee);
      add(knee, cyl(0.075, 0.055, 0.42), 'socks', 0, -0.21, 0);
      add(knee, box(0.12, 0.08, 0.26), 'cleat', 0, -0.44, 0.05);
    }
    // Pelvis
    add(this.body, box(0.38, 0.2, 0.25), 'pants', 0, 0.98, 0);
    this.towel = add(this.body, box(0.1, 0.2, 0.01), 'band', 0.1, 0.85, 0.13);
    // Torso
    this.torso.position.set(0, 1.07, 0);
    this.body.add(this.torso);
    add(this.torso, box(0.46, 0.5, 0.28), 'jersey', 0, 0.25, 0);
    add(this.torso, box(0.7, 0.17, 0.36), 'jersey', 0, 0.47, 0);
    add(this.torso, box(0.71, 0.03, 0.37), 'stripe', 0, 0.4, 0);
    const plane = geo('numplane', () => new THREE.PlaneGeometry(0.3, 0.3));
    this.numFront = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ transparent: true }));
    this.numFront.position.set(0, 0.24, 0.145);
    this.torso.add(this.numFront);
    this.numBack = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ transparent: true }));
    this.numBack.position.set(0, 0.28, -0.145);
    this.numBack.rotation.y = Math.PI;
    this.torso.add(this.numBack);
    // Neck & head
    add(this.torso, cyl(0.07, 0.08, 0.12), 'skin', 0, 0.6, 0);
    this.neckRoll = add(this.torso, geo('neckroll', () => new THREE.TorusGeometry(0.11, 0.04, 6, 10)), 'jersey', 0, 0.58, 0);
    this.neckRoll.rotation.x = Math.PI / 2;
    this.head.position.set(0, 0.76, 0);
    this.torso.add(this.head);
    add(this.head, sph(0.12), 'skin');
    this.head.add(this.faceGroup);
    this.head.add(this.hairGroup);
    this.head.add(this.helmetGroup);
    // Helmet
    const shell = add(this.helmetGroup, geo('helmet', () => new THREE.SphereGeometry(0.165, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)), 'helmet', 0, 0.02, -0.01);
    shell.rotation.x = -0.25;
    add(this.helmetGroup, box(0.03, 0.03, 0.3), 'stripe', 0, 0.175, -0.02);
    add(this.helmetGroup, box(0.25, 0.08, 0.16), 'helmet', 0, -0.07, -0.04);
    // Facemask variants
    for (let style = 0; style < 4; style++) {
      const fm = new THREE.Group();
      const bars = style === 1 ? 2 : style === 2 ? 4 : 3;
      for (let b = 0; b < bars; b++) {
        const bar = add(fm, box(0.24, 0.018, 0.02), 'mask', 0, -0.03 - b * (style === 3 ? 0.035 : 0.045), 0.17 - b * 0.005);
        if (style === 3) bar.scale.x = 0.8 + b * 0.1;
      }
      add(fm, box(0.018, bars * 0.045 + 0.02, 0.02), 'mask', 0, -0.03 - bars * 0.02, 0.172);
      if (style === 2) { add(fm, box(0.018, 0.18, 0.02), 'mask', 0.06, -0.1, 0.172); add(fm, box(0.018, 0.18, 0.02), 'mask', -0.06, -0.1, 0.172); }
      this.helmetGroup.add(fm);
      this.facemasks.push(fm);
    }
    this.visor = add(this.helmetGroup, box(0.22, 0.07, 0.01), 'visor', 0, 0.03, 0.155);
    // Face details
    const eyeGeo = sph(0.018, 6, 5);
    add(this.faceGroup, eyeGeo, 'dark', 0.045, 0.02, 0.11);
    add(this.faceGroup, eyeGeo, 'dark', -0.045, 0.02, 0.11);
    add(this.faceGroup, box(0.03, 0.05, 0.03), 'skin', 0, -0.02, 0.12);
    this.eyeBlack = new THREE.Group();
    add(this.eyeBlack, box(0.04, 0.012, 0.01), 'dark', 0.045, -0.015, 0.117);
    add(this.eyeBlack, box(0.04, 0.012, 0.01), 'dark', -0.045, -0.015, 0.117);
    this.faceGroup.add(this.eyeBlack);
    // Arms
    for (const [sh, el, side] of [[this.shoulderL, this.elbowL, 1], [this.shoulderR, this.elbowR, -1]] as [THREE.Group, THREE.Group, number][]) {
      sh.position.set(0.32 * side, 0.43, 0);
      this.torso.add(sh);
      add(sh, cyl(0.075, 0.065, 0.32), 'skin', 0, -0.16, 0);
      add(sh, cyl(0.085, 0.08, 0.12), 'jersey', 0, -0.04, 0);
      el.position.set(0, -0.32, 0);
      sh.add(el);
      add(el, cyl(0.06, 0.05, 0.28), 'skin', 0, -0.14, 0);
      add(el, sph(0.055, 6, 5), 'glove', 0, -0.3, 0);
      const band = add(el, cyl(0.062, 0.062, 0.06), 'band', 0, -0.24, 0);
      this.bands.push(band);
    }
    this.sleeveR = add(this.shoulderR, cyl(0.078, 0.068, 0.3), 'sleeve', 0, -0.17, 0);
    this.sleeveL = add(this.shoulderL, cyl(0.078, 0.068, 0.3), 'sleeve', 0, -0.17, 0);
    // Shadow & marker
    this.shadow = new THREE.Mesh(geo('shadow', () => new THREE.PlaneGeometry(1.2, 1.2)), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.root.add(this.shadow);
    this.marker = new THREE.Mesh(geo('marker', () => new THREE.RingGeometry(0.55, 0.7, 24)), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.04;
    this.marker.visible = false;
    this.root.add(this.marker);
    this.setAppearance(undefined);
  }

  setUniform(u: Uniform, num: number) {
    this.mats.jersey.color.set(u.jersey);
    this.mats.pants.color.set(u.pants);
    this.mats.helmet.color.set(u.helmet);
    this.mats.socks.color.set(u.socks);
    this.mats.stripe.color.set(u.stripe);
    this.mats.mask.color.set(u.number === '#ffffff' ? '#e8e8e8' : '#d0d0d0');
    if (this.num !== num || (this.numFront.material as THREE.MeshBasicMaterial).userData.key !== `${u.number}${u.outline}`) {
      const t = numberTexture(num, u.number, u.outline);
      for (const n of [this.numFront, this.numBack]) {
        const mm = n.material as THREE.MeshBasicMaterial;
        mm.map = t;
        mm.userData.key = `${u.number}${u.outline}`;
        mm.needsUpdate = true;
      }
      this.num = num;
    }
    this.mats.glove.userData.team = u.teamColor;
    this.mats.cleat.userData.team = u.teamColor;
  }

  /** Apply appearance; `undefined` gives a randomized generic look based on number. */
  setAppearance(a: Appearance | undefined, seed = 0, showHelmet = true, heightIn = 74, weightLb = 220) {
    const key = JSON.stringify([a, seed, showHelmet, heightIn, weightLb]);
    if (key === this.appearanceKey) return;
    this.appearanceKey = key;
    const r = (n: number) => Math.abs(Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1;
    const app: Appearance = a ?? {
      skin: Math.floor(r(1) * SKIN_TONES.length), face: Math.floor(r(2) * 5), hair: Math.floor(r(3) * 6), hairColor: Math.floor(r(4) * 3), facialHair: Math.floor(r(5) * 5),
      body: 1, helmet: Math.floor(r(6) * 4), visor: r(7) < 0.3 ? 2 : r(7) < 0.4 ? 1 : 0, gloves: Math.floor(r(8) * 3), cleats: Math.floor(r(9) * 3), sleeves: r(10) < 0.25 ? 1 : 0,
      accessories: { eyeBlack: r(11) < 0.4, wristbands: r(12) < 0.3, towel: r(13) < 0.25, neckRoll: false },
    };
    this.mats.skin.color.set(SKIN_TONES[app.skin % SKIN_TONES.length]);
    this.mats.hair.color.set(HAIR_COLORS[app.hairColor % HAIR_COLORS.length]);
    const team = (this.mats.glove.userData.team as string) ?? '#333';
    this.mats.glove.color.set([team, '#151515', '#f2f2f2', '#d9a521', '#c8102e'][app.gloves % 5]);
    this.mats.cleat.color.set(['#111', '#f4f4f4', team, '#d9a521', '#7cff3a'][app.cleats % 5]);
    this.facemasks.forEach((f, i) => (f.visible = showHelmet && i === app.helmet % 4));
    this.helmetGroup.visible = showHelmet;
    this.visor.visible = showHelmet && app.visor > 0;
    if (app.visor > 0) this.mats.visor.color.set(VISOR_COLORS[app.visor]);
    this.mats.visor.opacity = app.visor === 1 ? 0.35 : 0.85;
    this.sleeveR.visible = app.sleeves >= 1;
    this.sleeveL.visible = app.sleeves >= 2;
    this.mats.sleeve.color.set(app.sleeves === 2 ? '#151515' : '#f2f2f2');
    for (const b of this.bands) b.visible = app.accessories.wristbands;
    this.towel.visible = app.accessories.towel;
    this.neckRoll.visible = app.accessories.neckRoll;
    this.eyeBlack.visible = app.accessories.eyeBlack;
    this.faceGroup.visible = !showHelmet || app.visor !== 2;
    // Face preset: subtle variation in eye spacing / brow
    this.faceGroup.scale.set(1 + (app.face - 2) * 0.03, 1, 1);
    // Hair
    this.hairGroup.clear();
    const hm = this.mats.hair;
    const addH = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(g, hm);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      this.hairGroup.add(mesh);
      return mesh;
    };
    if (!showHelmet) {
      switch (app.hair) {
        case 1: addH(sph(0.126, 10, 6), 0, 0.03, -0.01, 1, 0.8, 1); break;
        case 2: addH(sph(0.123, 10, 6), 0, 0.02, -0.01, 1, 0.75, 1); break;
        case 3: addH(sph(0.17, 10, 8), 0, 0.06, -0.03); break;
        case 4: addH(sph(0.127, 10, 6), 0, 0.03, -0.01, 1, 0.8, 1); for (let i = 0; i < 6; i++) addH(cyl(0.02, 0.02, 0.22, 4), -0.08 + i * 0.032, -0.08, -0.1); break;
        case 5: addH(box(0.04, 0.06, 0.22), 0, 0.12, -0.02); break;
      }
    } else if (app.hair === 4) {
      for (let i = 0; i < 6; i++) addH(cyl(0.02, 0.02, 0.24, 4), -0.08 + i * 0.032, -0.14, -0.13);
    }
    // facial hair (visible under the facemask too)
    switch (app.facialHair) {
      case 1: addH(box(0.17, 0.06, 0.06), 0, -0.07, 0.07, 1, 1, 1).material = new THREE.MeshLambertMaterial({ color: hm.color, transparent: true, opacity: 0.45 }); break;
      case 2: addH(box(0.06, 0.07, 0.04), 0, -0.1, 0.1); break;
      case 3: addH(box(0.19, 0.1, 0.1), 0, -0.08, 0.06); break;
      case 4: addH(box(0.08, 0.015, 0.02), 0, -0.035, 0.12); break;
    }
    // Body proportions
    const hs = heightIn / 74;
    const ws = Math.max(0.85, Math.min(1.35, 0.8 + (weightLb - 180) / 450)) * [0.93, 1, 1.07, 1.13][app.body % 4];
    this.root.scale.set(ws, hs, ws);
  }

  /**
   * Procedural animation. `speed` is in yards/second, `t` is time in the state.
   */
  animate(state: AnimState, t: number, speed: number, dt: number, extra: { stance3?: boolean; side?: number } = {}) {
    const b = this.body;
    b.position.y = 0;
    b.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    let lean = 0;
    const reset = () => {
      for (const j of [this.shoulderL, this.shoulderR, this.elbowL, this.elbowR, this.hipL, this.hipR, this.kneeL, this.kneeR]) j.rotation.set(0, 0, 0);
      this.shoulderL.rotation.z = 0.12;
      this.shoulderR.rotation.z = -0.12;
    };
    reset();
    const run = (s: number) => {
      this.phase += dt * (4 + s * 1.05);
      const amp = Math.min(1, s / 7) * 0.95 + 0.05;
      const sw = Math.sin(this.phase) * amp;
      this.hipL.rotation.x = -sw;
      this.hipR.rotation.x = sw;
      this.kneeL.rotation.x = Math.max(0, Math.sin(this.phase + 1.2)) * 1.3 * amp + 0.1;
      this.kneeR.rotation.x = Math.max(0, Math.sin(this.phase + 1.2 + Math.PI)) * 1.3 * amp + 0.1;
      this.shoulderL.rotation.x = sw * 0.9;
      this.shoulderR.rotation.x = -sw * 0.9;
      this.elbowL.rotation.x = -0.9 * amp - 0.3;
      this.elbowR.rotation.x = -0.9 * amp - 0.3;
      b.position.y = Math.abs(Math.cos(this.phase)) * 0.05 * amp;
      lean = Math.min(0.35, s * 0.035);
    };
    switch (state) {
      case 'stance': {
        if (extra.stance3) {
          lean = 1.05;
          b.position.y = -0.35;
          this.hipL.rotation.x = -1.4; this.hipR.rotation.x = -1.0;
          this.kneeL.rotation.x = 1.6; this.kneeR.rotation.x = 1.4;
          this.shoulderR.rotation.x = -1.2;
          this.shoulderL.rotation.x = -0.4;
        } else {
          lean = 0.35;
          b.position.y = -0.12;
          this.hipL.rotation.x = -0.5; this.hipR.rotation.x = -0.5;
          this.kneeL.rotation.x = 0.8; this.kneeR.rotation.x = 0.8;
          this.shoulderL.rotation.x = -0.5; this.shoulderR.rotation.x = -0.5;
          this.elbowL.rotation.x = -0.6; this.elbowR.rotation.x = -0.6;
        }
        break;
      }
      case 'idle':
        this.phase += dt * 2;
        b.position.y = Math.sin(this.phase) * 0.01;
        this.elbowL.rotation.x = -0.3; this.elbowR.rotation.x = -0.3;
        break;
      case 'run':
        run(speed);
        break;
      case 'throw': {
        run(speed * 0.5);
        const k = Math.min(1, t / 0.3);
        this.shoulderR.rotation.x = k < 0.6 ? 2.6 * (k / 0.6) : 2.6 - (k - 0.6) / 0.4 * 4.2;
        this.shoulderR.rotation.z = -0.4;
        this.elbowR.rotation.x = -0.8;
        this.shoulderL.rotation.x = -1.2;
        this.torso.rotation.y = k < 0.6 ? 0.5 : 0.5 - (k - 0.6) * 2.2;
        break;
      }
      case 'catch':
        run(speed * 0.6);
        this.shoulderL.rotation.x = -2.4; this.shoulderR.rotation.x = -2.4;
        this.elbowL.rotation.x = -0.3; this.elbowR.rotation.x = -0.3;
        break;
      case 'block':
        run(speed * 0.4);
        lean = 0.45;
        this.shoulderL.rotation.x = -1.45; this.shoulderR.rotation.x = -1.45;
        this.elbowL.rotation.x = -0.4; this.elbowR.rotation.x = -0.4;
        break;
      case 'juke':
        run(speed);
        b.rotation.z = (extra.side ?? 1) * 0.35 * Math.sin(Math.min(1, t / 0.35) * Math.PI);
        break;
      case 'spin':
        run(speed * 0.7);
        b.rotation.y = Math.min(1, t / 0.45) * Math.PI * 2;
        break;
      case 'stiff':
        run(speed);
        this.shoulderL.rotation.x = -1.5;
        this.elbowL.rotation.x = 0;
        break;
      case 'swat':
      case 'jump':
        this.shoulderL.rotation.x = -3; this.shoulderR.rotation.x = -3;
        b.position.y = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.45;
        break;
      case 'dive':
      case 'tackle': {
        const k = Math.min(1, t / 0.35);
        b.rotation.x = k * 1.35;
        b.position.y = -k * 0.55;
        this.shoulderL.rotation.x = -2.6; this.shoulderR.rotation.x = -2.6;
        this.hipL.rotation.x = 0.3; this.hipR.rotation.x = 0.3;
        break;
      }
      case 'down':
      case 'slide': {
        const k = Math.min(1, t / 0.35);
        b.rotation.x = state === 'slide' ? -k * 1.2 : k * 1.45;
        b.position.y = -k * (state === 'slide' ? 0.5 : 0.75);
        this.shoulderL.rotation.x = -1.2; this.shoulderR.rotation.x = -0.6;
        break;
      }
      case 'kick': {
        const k = Math.min(1, t / 0.35);
        this.hipR.rotation.x = k < 0.4 ? k * 2 : 0.8 - (k - 0.4) * 4;
        this.kneeR.rotation.x = k < 0.4 ? 1.4 : 0.2;
        this.shoulderL.rotation.x = -1.2;
        this.shoulderR.rotation.z = -1;
        break;
      }
      case 'celebrate':
        this.phase += dt * 8;
        this.shoulderL.rotation.x = -2.9; this.shoulderR.rotation.x = -2.9;
        b.position.y = Math.abs(Math.sin(this.phase)) * 0.3;
        break;
      case 'hold':
        lean = 0.3; b.position.y = -0.5; this.kneeL.rotation.x = 2; this.hipL.rotation.x = -1.4; this.kneeR.rotation.x = 2.2; this.hipR.rotation.x = -0.6;
        this.shoulderL.rotation.x = -1; this.shoulderR.rotation.x = -1;
        break;
      case 'snap':
        lean = 1; b.position.y = -0.35; this.shoulderR.rotation.x = -0.4;
        break;
    }
    this.torso.rotation.x += lean;
  }

  setPose(x: number, z: number, yaw: number) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
  }
}
