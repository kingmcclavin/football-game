import * as THREE from 'three';
import { TEAMS, type TeamDef } from '../../data/teams';

/** Path for an emblem shape in a 100x100 box (used by both SVG and canvas). */
export function emblemPath(shape: TeamDef['emblem']['shape']): string {
  switch (shape) {
    case 'shield': return 'M50 4 L92 18 L88 58 Q80 84 50 97 Q20 84 12 58 L8 18 Z';
    case 'circle': return 'M50 4 A46 46 0 1 1 49.9 4 Z';
    case 'diamond': return 'M50 2 L96 50 L50 98 L4 50 Z';
    case 'hex': return 'M50 3 L92 26 L92 74 L50 97 L8 74 L8 26 Z';
    case 'star': return 'M50 3 L62 36 L97 37 L69 58 L79 93 L50 72 L21 93 L31 58 L3 37 L38 36 Z';
    case 'chevron': return 'M8 10 L50 30 L92 10 L92 62 L50 96 L8 62 Z';
  }
}

export function drawEmblem(ctx: CanvasRenderingContext2D, team: TeamDef, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 100, size / 100);
  const p = new Path2D(emblemPath(team.emblem.shape));
  ctx.fillStyle = team.primary;
  ctx.fill(p);
  ctx.lineWidth = 6;
  ctx.strokeStyle = team.secondary;
  ctx.stroke(p);
  ctx.fillStyle = team.accent === team.primary ? '#ffffff' : team.accent;
  ctx.font = `900 ${team.emblem.glyph.length > 1 ? 38 : 52}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(team.emblem.glyph, 50, team.emblem.shape === 'star' ? 56 : 54);
  ctx.restore();
}

const FIELD_W = 53.333;

/** Field texture: 120 x 53.3 yards (end zones included). */
export function makeFieldTexture(home: TeamDef, quality: 'low' | 'medium' | 'high'): THREE.CanvasTexture {
  const ppy = quality === 'high' ? 20 : quality === 'medium' ? 14 : 9; // pixels per yard
  const W = Math.round(120 * ppy), H = Math.round(FIELD_W * ppy);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  // grass stripes every 5 yards
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = i % 2 ? '#2f7d32' : '#33873a';
    ctx.fillRect(i * 5 * ppy, 0, 5 * ppy, H);
  }
  // end zones
  const ez = (x0: number, flip: boolean) => {
    ctx.fillStyle = home.primary;
    ctx.fillRect(x0 * ppy, 0, 10 * ppy, H);
    ctx.save();
    ctx.translate((x0 + 5) * ppy, H / 2);
    ctx.rotate(flip ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = home.secondary === home.primary ? '#ffffff' : home.secondary;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = ppy * 0.35;
    ctx.font = `900 ${Math.round(ppy * 6.2)}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const txt = home.name.toUpperCase();
    ctx.strokeText(txt, 0, 0);
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  };
  ez(0, false);
  ez(110, true);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  // sidelines & end lines
  ctx.lineWidth = ppy * 0.4;
  ctx.strokeRect(ppy * 0.2, ppy * 0.2, W - ppy * 0.4, H - ppy * 0.4);
  // yard lines
  for (let yd = 10; yd <= 110; yd += 5) {
    ctx.lineWidth = yd === 10 || yd === 110 ? ppy * 0.45 : ppy * 0.22;
    ctx.beginPath();
    ctx.moveTo(yd * ppy, 0);
    ctx.lineTo(yd * ppy, H);
    ctx.stroke();
  }
  // hash marks every yard
  const hashY = [FIELD_W - 23.583, FIELD_W - 29.75];
  for (let yd = 11; yd < 110; yd++) {
    if (yd % 5 === 0) continue;
    for (const hy of [0.6, ...hashY, FIELD_W - 0.6]) {
      ctx.fillRect(yd * ppy - ppy * 0.08, hy * ppy - ppy * 0.33, ppy * 0.16, ppy * 0.66);
    }
  }
  // numbers
  ctx.font = `bold ${Math.round(ppy * 2)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let yd = 20; yd <= 100; yd += 10) {
    const n = yd <= 60 ? yd - 10 : 110 - yd;
    for (const [ny, rot] of [[12, Math.PI], [FIELD_W - 12, 0]] as [number, number][]) {
      ctx.save();
      ctx.translate(yd * ppy, ny * ppy);
      ctx.rotate(rot);
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }
  }
  // two point lines
  ctx.fillRect(12 * ppy - ppy * 0.1, H / 2 - ppy * 0.5, ppy * 0.2, ppy);
  ctx.fillRect(108 * ppy - ppy * 0.1, H / 2 - ppy * 0.5, ppy * 0.2, ppy);
  // midfield emblem
  ctx.globalAlpha = 0.9;
  drawEmblem(ctx, home, 60 * ppy, H / 2, ppy * 9);
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = quality === 'high' ? 8 : 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const numCache = new Map<string, THREE.CanvasTexture>();
export function numberTexture(num: number, fg: string, outline: string): THREE.CanvasTexture {
  const key = `${num}|${fg}|${outline}`;
  const hit = numCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '900 44px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = outline;
  ctx.strokeText(String(num), 32, 35);
  ctx.fillStyle = fg;
  ctx.fillText(String(num), 32, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  numCache.set(key, t);
  return t;
}

let shadowTex: THREE.CanvasTexture | null = null;
export function blobShadowTexture(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export function crowdTexture(primary: string, secondary: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1a1f2b';
  ctx.fillRect(0, 0, 256, 64);
  const cols = [primary, secondary, '#ffffff', '#d9c7a3', '#5b3a29', '#222', primary, '#888'];
  for (let y = 0; y < 64; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      ctx.fillRect(x + Math.random(), y + Math.random(), 3, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function teamById(id: number) {
  return TEAMS[id];
}
