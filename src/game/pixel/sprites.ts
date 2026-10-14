// ---------------------------------------------------------------------------
// Procedural pixel art: players, ball, a tiny bitmap font, team logos and
// portraits. Everything is drawn with fillRect so there are no image assets.
// ---------------------------------------------------------------------------
import type { Appearance } from '../../core/types';
import { TEAMS, type TeamDef } from '../../data/teams';

export const SKIN_TONES = ['#f6d1b4', '#e8b48f', '#d39a6f', '#b47a4e', '#93603a', '#74472a', '#5a341e', '#3e2414'];
export const HAIR_COLORS = ['#1a1412', '#3b2416', '#6b4423', '#d6b06b', '#a8441f', '#9a9a9a'];
export const HAIR_STYLES = ['Bald', 'Short', 'Buzz', 'Afro', 'Locs', 'Mohawk'];
export const FACIAL_HAIR = ['None', 'Stubble', 'Goatee', 'Full Beard', 'Mustache'];
export const FACE_PRESETS = ['Classic', 'Focused', 'Friendly', 'Intense', 'Veteran'];
export const BODY_TYPES = ['Slim', 'Standard', 'Muscular', 'Heavy'];
export const HELMET_STYLES = ['Classic Mask', 'Open Mask', 'Cage Mask', 'Speed Mask'];
export const VISORS = ['None', 'Clear', 'Smoke', 'Gold', 'Blue'];
export const VISOR_COLORS = ['', '#bfe2ff', '#23272e', '#e0ad2a', '#3a7be0'];
export const GLOVE_COLORS = ['Team', 'Black', 'White', 'Gold', 'Red'];
export const CLEAT_COLORS = ['Black', 'White', 'Team', 'Gold', 'Neon'];
export const SLEEVES = ['None', 'Arm Sleeve', 'Long Sleeves'];

export interface Kit {
  jersey: string;
  pants: string;
  helmet: string;
  stripe: string;
  number: string;
  socks: string;
  mask: string;
}

function lum(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export function kitFor(t: TeamDef, kind: 'home' | 'away' | 'alt'): Kit {
  const helmet = lum(t.primary) > 0.8 ? t.secondary : t.primary;
  const light = lum(t.primary) > 0.6;
  if (kind === 'away') return { jersey: '#f2f2f2', pants: light ? t.secondary : t.primary, helmet, stripe: t.secondary, number: light ? t.secondary : t.primary, socks: t.primary, mask: '#cfcfcf' };
  if (kind === 'alt') return { jersey: t.secondary, pants: t.primary, helmet, stripe: t.primary, number: lum(t.secondary) > 0.55 ? t.primary : '#ffffff', socks: t.secondary, mask: '#cfcfcf' };
  return { jersey: t.primary, pants: lum(t.secondary) > 0.85 || t.secondary === t.primary ? '#e8e8e8' : t.secondary, helmet, stripe: t.secondary, number: light ? '#111111' : '#ffffff', socks: t.primary, mask: '#d8d8d8' };
}

// ------------------------------- Bitmap font -------------------------------
// 3x5 glyphs, rows top->bottom, '1' = pixel on.
const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'], A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'], G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'], M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'], Q: ['010', '101', '101', '110', '011'],
  R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'], W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'], Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  ' ': ['000', '000', '000', '000', '000'], '-': ['000', '000', '111', '000', '000'], '.': ['000', '000', '000', '000', '010'],
  '!': ['010', '010', '010', '000', '010'], '&': ['010', '101', '010', '101', '011'], "'": ['010', '010', '000', '000', '000'],
};

export function textWidth(s: string, scale = 1): number {
  return s.length * 4 * scale - scale;
}

export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1) {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === '1') ctx.fillRect(cx + c * scale, Math.round(y) + r * scale, scale, scale);
    cx += 4 * scale;
  }
}

// --------------------------------- Players ---------------------------------
export type PixelPose = 'stand' | 'stance' | 'run' | 'throw' | 'catch' | 'block' | 'down' | 'dive' | 'celebrate' | 'kick' | 'juke' | 'hold';

export interface PlayerDraw {
  kit: Kit;
  skin: string;
  facing: 1 | -1;
  pose: PixelPose;
  frame: number; // run cycle 0..3
  hairBack?: string; // locs color
  visor?: string;
  gloves?: string;
  sleeves?: number;
  big?: number; // width bonus for linemen (0..2)
}

/** Draws a ~9x16 player with feet at (x, y). */
export function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, d: PlayerDraw) {
  const k = d.kit;
  const f = d.facing;
  x = Math.round(x);
  y = Math.round(y);
  const px = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    // mirror around x for facing left
    const rx = f === 1 ? x + dx : x - dx - w + 1;
    ctx.fillRect(rx, y + dy, w, h);
  };
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x - 4, y - 1, 9, 2);
  if (d.pose === 'down' || d.pose === 'dive') {
    const lift = d.pose === 'dive' ? -4 : 0;
    // horizontal body, head in facing direction
    px(-6, -4 + lift, 3, 2, d.kit.socks);
    px(-6, -2 + lift, 2, 1, '#151515');
    px(-3, -5 + lift, 3, 3, k.pants);
    px(0, -6 + lift, 5, 4, k.jersey);
    px(1, -5 + lift, 3, 1, k.stripe);
    px(5, -7 + lift, 4, 4, k.helmet);
    px(8, -6 + lift, 1, 2, k.mask);
    if (d.pose === 'dive') px(9, -6 + lift, 2, 1, d.skin);
    return;
  }
  const w = d.big ?? 0;
  const crouch = d.pose === 'stance' || d.pose === 'hold' ? 2 : d.pose === 'block' ? 1 : 0;
  const jump = d.pose === 'celebrate' ? (d.frame % 2 ? 2 : 0) : 0;
  const by = -jump;
  // legs
  const legA = d.pose === 'run' || d.pose === 'juke' ? [0, 1, 0, -1][d.frame % 4] : 0;
  const kick = d.pose === 'kick';
  px(-2 + legA, -4 + by, 2, 3, k.socks);
  px(1 - legA + (kick ? 2 : 0), -4 + by - (kick ? 2 : 0), 2, 3, k.socks);
  px(-2 + legA, -1 + by, 2, 1, '#141414');
  px(1 - legA + (kick ? 3 : 0), -1 + by - (kick ? 2 : 0), 2, 1, '#141414');
  // pants
  px(-2 - (w ? 1 : 0), -7 + by + crouch, 5 + (w ? 2 : 0), 3, k.pants);
  // torso
  px(-3 - w, -12 + by + crouch, 7 + w * 2, 5, k.jersey);
  px(-3 - w, -12 + by + crouch, 7 + w * 2, 1, k.stripe);
  // arms
  const arm = d.sleeves === 2 ? '#1b1b1b' : d.skin;
  const glove = d.gloves ?? d.skin;
  if (d.pose === 'throw') {
    px(-4 - w, -11 + by, 1, 3, arm);
    px(4 + w, -16 + by, 1, 5, arm);
    px(4 + w, -17 + by, 1, 1, glove);
  } else if (d.pose === 'catch' || d.pose === 'celebrate') {
    px(-4 - w, -17 + by, 1, 6, arm);
    px(4 + w, -17 + by, 1, 6, arm);
    px(-4 - w, -18 + by, 1, 1, glove);
    px(4 + w, -18 + by, 1, 1, glove);
  } else if (d.pose === 'block' || d.pose === 'stance') {
    px(4 + w, -10 + by + crouch, 2, 1, arm);
    px(6 + w, -10 + by + crouch, 1, 1, glove);
    px(-4 - w, -11 + by + crouch, 1, 3, arm);
  } else {
    const sw = d.pose === 'run' ? [0, 1, 0, -1][d.frame % 4] : 0;
    px(-4 - w, -11 + by + sw, 1, 3, arm);
    px(4 + w, -11 + by - sw, 1, 3, arm);
    px(-4 - w, -8 + by + sw, 1, 1, glove);
    px(4 + w, -8 + by - sw, 1, 1, glove);
  }
  // neck + helmet
  px(-1, -13 + by + crouch, 3, 1, d.skin);
  px(-2, -17 + by + crouch, 5, 4, k.helmet);
  px(-1, -18 + by + crouch, 3, 1, k.helmet);
  px(0, -18 + by + crouch, 1, 1, k.stripe);
  px(2, -16 + by + crouch, 1, 2, d.skin);
  px(3, -16 + by + crouch, 1, 3, k.mask);
  if (d.visor) px(2, -16 + by + crouch, 1, 1, d.visor);
  if (d.hairBack) px(-3, -15 + by + crouch, 1, 3, d.hairBack);
}

export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, spin: number) {
  x = Math.round(x);
  y = Math.round(y);
  const h = Math.round(z);
  if (h > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x - 1, y, 3, 1);
  }
  ctx.fillStyle = '#7a3b12';
  if (Math.floor(spin) % 2) ctx.fillRect(x - 1, y - h - 2, 3, 2);
  else ctx.fillRect(x - 1, y - h - 3, 2, 3);
  ctx.fillStyle = '#f0e6d6';
  ctx.fillRect(x, y - h - 2, 1, 1);
}

// ------------------------------- Team logos --------------------------------
const logoCache = new Map<string, string>();

function emblemPath(shape: TeamDef['emblem']['shape']): string {
  switch (shape) {
    case 'shield': return 'M50 4 L92 18 L88 58 Q80 84 50 97 Q20 84 12 58 L8 18 Z';
    case 'circle': return 'M50 4 A46 46 0 1 1 49.9 4 Z';
    case 'diamond': return 'M50 2 L96 50 L50 98 L4 50 Z';
    case 'hex': return 'M50 3 L92 26 L92 74 L50 97 L8 74 L8 26 Z';
    case 'star': return 'M50 3 L62 36 L97 37 L69 58 L79 93 L50 72 L21 93 L31 58 L3 37 L38 36 Z';
    case 'chevron': return 'M8 10 L50 30 L92 10 L92 62 L50 96 L8 62 Z';
  }
}

/** Rasterize a team emblem into a crisp 20x20 pixel logo. */
export function drawLogo(ctx: CanvasRenderingContext2D, t: TeamDef, ox: number, oy: number, size = 20) {
  if (typeof Path2D === 'undefined') return;
  const path = new Path2D(emblemPath(t.emblem.shape));
  const probe = document.createElement('canvas').getContext('2d')!;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && probe.isPointInPath(path, ((x + 0.5) / size) * 100, ((y + 0.5) / size) * 100);
  const accent = t.accent === t.primary ? '#ffffff' : t.accent;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      ctx.fillStyle = edge ? t.secondary : t.primary;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  const g = t.emblem.glyph;
  const sc = g.length > 1 || size < 18 ? 1 : 2;
  const tw = textWidth(g, sc);
  drawText(ctx, g, ox + Math.floor((size - tw) / 2), oy + Math.floor((size - 5 * sc) / 2) + 1, '#111', sc);
  drawText(ctx, g, ox + Math.floor((size - tw) / 2), oy + Math.floor((size - 5 * sc) / 2), accent, sc);
}

export function logoDataUrl(id: number): string {
  const key = `logo${id}`;
  const hit = logoCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 20;
  c.height = 20;
  const ctx = c.getContext('2d')!;
  drawLogo(ctx, TEAMS[id], 0, 0, 20);
  const url = c.toDataURL();
  logoCache.set(key, url);
  return url;
}

// -------------------------------- Portraits --------------------------------
/** 32x32 pixel bust of the player for menus. */
export function drawPortrait(ctx: CanvasRenderingContext2D, app: Appearance | undefined, kit: Kit, num: number | undefined, helmet: boolean) {
  const P = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const skin = SKIN_TONES[app?.skin ?? 3];
  const hair = HAIR_COLORS[app?.hairColor ?? 0];
  const dark = '#1a1410';
  ctx.clearRect(0, 0, 32, 32);
  // shoulders / jersey
  const wide = [0, 1, 2, 3][app?.body ?? 1];
  P(4 - wide, 22, 24 + wide * 2, 10, kit.jersey);
  P(4 - wide, 22, 24 + wide * 2, 2, kit.stripe);
  P(13, 22, 6, 2, skin);
  if (num !== undefined) {
    const s = String(num);
    drawText(ctx, s, 16 - textWidth(s) / 2, 25, kit.number);
  }
  // neck & head
  P(13, 19, 6, 4, skin);
  P(10, 8, 12, 12, skin);
  P(9, 11, 1, 4, skin);
  P(22, 11, 1, 4, skin);
  // eyes / brows by face preset
  const face = app?.face ?? 0;
  P(12, 12, 2, 2, '#ffffff'); P(18, 12, 2, 2, '#ffffff');
  P(13, 12, 1, 2, dark); P(18, 12, 1, 2, dark);
  if (face === 1 || face === 3) { P(12, 10, 3, 1, dark); P(17, 10, 3, 1, dark); }
  else P(12, 10, 2, 1, hair), P(18, 10, 2, 1, hair);
  P(15, 14, 2, 2, '#00000022');
  if (face === 2) P(13, 17, 6, 1, '#7a2a1a'), P(12, 16, 1, 1, '#7a2a1a'), P(19, 16, 1, 1, '#7a2a1a');
  else P(13, 17, 6, 1, '#6a2a1a');
  if (face === 4) P(11, 9, 3, 1, '#00000033');
  if (app?.accessories.eyeBlack) { P(12, 14, 2, 1, dark); P(18, 14, 2, 1, dark); }
  // facial hair
  switch (app?.facialHair ?? 0) {
    case 1: P(11, 16, 10, 4, hair + '55'); break;
    case 2: P(14, 18, 4, 2, hair); break;
    case 3: P(10, 15, 12, 5, hair); P(13, 17, 6, 1, '#6a2a1a'); break;
    case 4: P(13, 16, 6, 1, hair); break;
  }
  if (helmet) {
    P(8, 5, 16, 8, kit.helmet);
    P(9, 4, 14, 1, kit.helmet);
    P(15, 3, 2, 10, kit.stripe);
    P(8, 13, 3, 6, kit.helmet);
    P(21, 13, 3, 6, kit.helmet);
    // facemask
    const v = app?.visor ?? 0;
    if (v) P(11, 11, 10, 3, VISOR_COLORS[v] + (v === 1 ? '88' : ''));
    P(10, 15, 12, 1, kit.mask);
    P(11, 18, 10, 1, kit.mask);
    P(15, 14, 1, 6, kit.mask);
  } else {
    switch (app?.hair ?? 1) {
      case 1: P(10, 6, 12, 3, hair); P(9, 8, 2, 3, hair); P(21, 8, 2, 3, hair); break;
      case 2: P(10, 7, 12, 2, hair + 'cc'); break;
      case 3: P(7, 2, 18, 8, hair); P(7, 9, 3, 5, hair); P(22, 9, 3, 5, hair); break;
      case 4: P(9, 5, 14, 4, hair); for (let i = 0; i < 4; i++) P(8 + i * 0.5, 9 + i, 2, 10 - i, hair), P(22 - i * 0.5, 9 + i, 2, 10 - i, hair); break;
      case 5: P(14, 3, 4, 6, hair); break;
    }
  }
}

export function portraitDataUrl(app: Appearance | undefined, teamId: number, num: number | undefined, helmet = true, kind: 'home' | 'alt' = 'home'): string {
  if (typeof document === 'undefined') return '';
  const key = JSON.stringify([app, teamId, num, helmet, kind]);
  const hit = logoCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const t = TEAMS[teamId] ?? { ...TEAMS[0], primary: '#3b4a6b', secondary: '#c9d2e3', accent: '#ffffff' };
  drawPortrait(c.getContext('2d')!, app, kitFor(t, kind), num, helmet);
  const url = c.toDataURL();
  if (logoCache.size > 300) logoCache.clear();
  logoCache.set(key, url);
  return url;
}

/** Full-body sprite (for the creation preview). */
export function bodyDataUrl(app: Appearance, teamId: number, kind: 'home' | 'away' | 'alt', frame: number, facing: 1 | -1): string {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 24;
  const ctx = c.getContext('2d')!;
  const t = TEAMS[teamId] ?? { ...TEAMS[0], primary: '#3b4a6b', secondary: '#c9d2e3', accent: '#ffffff' };
  const kit = kitFor(t, kind);
  drawPlayer(ctx, 12, 22, {
    kit, skin: SKIN_TONES[app.skin], facing, pose: frame >= 0 ? 'run' : 'stand', frame: Math.max(0, frame),
    hairBack: app.hair === 4 ? HAIR_COLORS[app.hairColor] : undefined, visor: app.visor ? VISOR_COLORS[app.visor] : undefined,
    gloves: glovesColor(app, kit), sleeves: app.sleeves, big: app.body >= 3 ? 1 : 0,
  });
  return c.toDataURL();
}

export function glovesColor(app: Appearance, kit: Kit): string {
  return [kit.jersey, '#151515', '#f2f2f2', '#d9a521', '#c8102e'][app.gloves % 5];
}

export { lum };
