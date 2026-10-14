import * as THREE from 'three';
import type { TeamDef } from '../../data/teams';
import { crowdTexture, drawEmblem, makeFieldTexture } from './textures';

export interface StadiumParts {
  group: THREE.Group;
  scoreboard: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  crowd: THREE.Mesh[];
  lights: THREE.Light[];
}

/**
 * Builds a stadium for the home team. Stadiums share modular parts but vary
 * in seat colour, tiers, roof (dome) and lighting so each venue feels unique.
 */
export function buildStadium(home: TeamDef, quality: 'low' | 'medium' | 'high'): StadiumParts {
  const group = new THREE.Group();
  // Field (120 x 53.33 yards), centered at origin. World X = field x - 50, Z = y - 26.67.
  const fieldTex = makeFieldTexture(home, quality);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(120, 53.333), new THREE.MeshLambertMaterial({ map: fieldTex }));
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, 0, 0);
  group.add(field);
  // Surrounding turf / track
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(150, 85), new THREE.MeshLambertMaterial({ color: '#285e2a' }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.02, 0);
  group.add(apron);
  const track = new THREE.Mesh(new THREE.PlaneGeometry(170, 110), new THREE.MeshLambertMaterial({ color: '#3a3d45' }));
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, -0.04, 0);
  group.add(track);

  // Goalposts at the end lines (field x = -10 and 110)
  const postMat = new THREE.MeshLambertMaterial({ color: '#f2d33a' });
  for (const gx of [-60, 60]) {
    const x = gx;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.33, 8), postMat);
    base.position.set(x + Math.sign(gx) * 0.8, 1.66, 0);
    group.add(base);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.15), postMat);
    arm.position.set(x + Math.sign(gx) * 0.0, 3.33, 0);
    group.add(arm);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.17, 8), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, 3.33, 0);
    group.add(bar);
    for (const z of [-3.08, 3.08]) {
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 10, 8), postMat);
      up.position.set(x, 3.33 + 5, z);
      group.add(up);
    }
  }
  // Sideline benches & team areas
  const benchMat = new THREE.MeshLambertMaterial({ color: home.secondary });
  for (const z of [-31, 31]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 1.2), benchMat);
    bench.position.set(0, 0.25, z);
    group.add(bench);
  }

  // Stands: tiers of sloped seating around the field
  const tiers = home.dome ? 3 : quality === 'low' ? 1 : 2;
  const seatColor = new THREE.Color(home.primary).lerp(new THREE.Color('#202430'), 0.55);
  const crowd: THREE.Mesh[] = [];
  const crowdTex = crowdTexture(home.primary, home.secondary);
  const standMat = new THREE.MeshLambertMaterial({ color: seatColor });
  const crowdMat = new THREE.MeshLambertMaterial({ map: crowdTex });
  const addStand = (cx: number, cz: number, len: number, rotY: number, tier: number) => {
    const depth = 14;
    const h = 9;
    const g = new THREE.Group();
    const slope = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, Math.hypot(depth, h)), standMat);
    slope.rotation.x = Math.atan2(h, depth);
    slope.position.set(0, h / 2 + tier * 10, depth / 2);
    g.add(slope);
    const people = new THREE.Mesh(new THREE.PlaneGeometry(len, Math.hypot(depth, h) * 0.95), crowdMat);
    const tex = crowdTex.clone();
    tex.repeat.set(len / 12, 3);
    tex.needsUpdate = true;
    people.material = new THREE.MeshLambertMaterial({ map: tex });
    people.rotation.x = -Math.PI / 2 + Math.atan2(h, depth);
    people.position.set(0, h / 2 + tier * 10 + 0.35, depth / 2);
    g.add(people);
    crowd.push(people);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 2 + tier * 10, 0.5), new THREE.MeshLambertMaterial({ color: home.primary }));
    wall.position.set(0, (2 + tier * 10) / 2, -0.2);
    g.add(wall);
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    group.add(g);
  };
  for (let t = 0; t < tiers; t++) {
    const off = 36 + t * 14;
    addStand(0, off, 130 + t * 20, 0, t);
    addStand(0, -off, 130 + t * 20, Math.PI, t);
    if (t === 0 || home.dome) {
      addStand(72 + t * 14, 0, 70 + t * 20, -Math.PI / 2, t);
      addStand(-72 - t * 14, 0, 70 + t * 20, Math.PI / 2, t);
    }
  }
  // Scoreboard
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 512;
  sbCanvas.height = 192;
  const sbTex = new THREE.CanvasTexture(sbCanvas);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(32, 12), new THREE.MeshBasicMaterial({ map: sbTex }));
  board.position.set(92, 26, 0);
  board.rotation.y = -Math.PI / 2;
  group.add(board);
  const board2 = board.clone();
  board2.position.set(-92, 26, 0);
  board2.rotation.y = Math.PI / 2;
  group.add(board2);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 13, 33), new THREE.MeshLambertMaterial({ color: '#111' }));
  frame.position.set(92.6, 26, 0);
  group.add(frame);
  const frame2 = frame.clone();
  frame2.position.set(-92.6, 26, 0);
  group.add(frame2);

  // Lighting
  const lights: THREE.Light[] = [];
  const night = home.lighting === 'night' && !home.dome;
  const dusk = home.lighting === 'dusk' && !home.dome;
  const hemi = new THREE.HemisphereLight(night ? '#8fa6d6' : dusk ? '#ffd2a8' : '#ffffff', '#3b5d3b', home.dome ? 0.95 : night ? 0.75 : 1.0);
  group.add(hemi);
  lights.push(hemi);
  const sun = new THREE.DirectionalLight(night ? '#f0f4ff' : dusk ? '#ffb070' : '#fff6e5', night ? 1.4 : dusk ? 1.6 : 1.9);
  sun.position.set(-30, 60, night ? 0 : 40);
  group.add(sun);
  lights.push(sun);
  if (night || home.dome) {
    const amb = new THREE.AmbientLight('#ffffff', 0.35);
    group.add(amb);
    lights.push(amb);
  }
  if (!home.dome) {
    // light towers
    const towerMat = new THREE.MeshLambertMaterial({ color: '#9aa0aa' });
    const lampMat = new THREE.MeshBasicMaterial({ color: night ? '#ffffff' : '#d9dde5' });
    for (const [x, z] of [[-50, 62], [50, 62], [-50, -62], [50, -62]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 42, 6), towerMat);
      pole.position.set(x, 21, z);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 1), lampMat);
      lamp.position.set(x, 43, z);
      lamp.lookAt(0, 0, 0);
      group.add(lamp);
    }
  } else {
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 2, 24, 1, true), new THREE.MeshLambertMaterial({ color: '#cfd4dc', side: THREE.DoubleSide }));
    roof.position.set(0, 48, 0);
    roof.scale.set(1, 1, 0.75);
    group.add(roof);
    const top = new THREE.Mesh(new THREE.CircleGeometry(120, 24), new THREE.MeshLambertMaterial({ color: '#e7eaef', side: THREE.DoubleSide }));
    top.rotation.x = Math.PI / 2;
    top.position.set(0, 49, 0);
    top.scale.set(1, 0.75, 1);
    group.add(top);
  }
  // Team banners on the end walls
  const bannerC = document.createElement('canvas');
  bannerC.width = 256;
  bannerC.height = 128;
  const bctx = bannerC.getContext('2d')!;
  bctx.fillStyle = home.primary;
  bctx.fillRect(0, 0, 256, 128);
  drawEmblem(bctx, home, 64, 64, 100);
  bctx.fillStyle = '#fff';
  bctx.font = '900 30px "Arial Black", Impact, sans-serif';
  bctx.fillText(home.abbr, 130, 76);
  const bTex = new THREE.CanvasTexture(bannerC);
  bTex.colorSpace = THREE.SRGBColorSpace;
  for (const x of [-35, 35]) for (const z of [-35.7, 35.7]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({ map: bTex }));
    banner.position.set(x, 1.6, z);
    banner.rotation.y = z > 0 ? Math.PI : 0;
    group.add(banner);
  }
  return { group, scoreboard: { canvas: sbCanvas, tex: sbTex }, crowd, lights };
}
