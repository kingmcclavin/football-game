// XP, levels, attribute upgrades and abilities for the user's player.
import type { Attr, Career, Player } from '../core/types';
import { clamp } from '../core/util';
import { ABILITIES, abilitySlots, type Ability } from '../data/abilities';
import { POS_ATTRS, archetypeById, calcOvr } from '../data/positions';

export const xpForLevel = (level: number) => 900 + level * 300;
export const SP_PER_LEVEL = 3;
export const MAX_LEVEL = 60;

/** Add XP; returns the number of levels gained. */
export function addXp(c: Career, xp: number): number {
  c.xp += Math.max(0, Math.round(xp));
  let gained = 0;
  while (c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level)) {
    c.xp -= xpForLevel(c.level);
    c.level++;
    c.sp += SP_PER_LEVEL + (c.level % 5 === 0 ? 2 : 0);
    gained++;
  }
  return gained;
}

/** Attributes the user can train for their position (OVR attributes first). */
export function trainableAttrs(p: Player): Attr[] {
  const w = POS_ATTRS[p.pos];
  const main = (Object.keys(w) as Attr[]).sort((a, b) => (w[b] as number) - (w[a] as number));
  const extra = (Object.keys(p.attrs) as Attr[]).filter((a) => !main.includes(a) && ['spd', 'acc', 'agi', 'str', 'awr', 'car', 'cth', 'btk', 'jkm', 'tak'].includes(a));
  return [...main, ...extra];
}

export function upgradeCost(p: Player, attr: Attr): number {
  const v = p.attrs[attr] ?? 50;
  let cost = v < 65 ? 1 : v < 75 ? 2 : v < 85 ? 3 : v < 92 ? 4 : 6;
  const arch = archetypeById(p.archetype);
  if (arch?.focus.includes(attr)) cost = Math.max(1, cost - 1);
  // Physical ceilings: speed is hard to build
  if (attr === 'spd' || attr === 'acc') cost += 1;
  return cost;
}

export function canUpgrade(c: Career, p: Player, attr: Attr): boolean {
  return (p.attrs[attr] ?? 50) < 99 && c.sp >= upgradeCost(p, attr);
}

export function upgradeAttr(c: Career, p: Player, attr: Attr): boolean {
  if (!canUpgrade(c, p, attr)) return false;
  c.sp -= upgradeCost(p, attr);
  p.attrs[attr] = clamp((p.attrs[attr] ?? 50) + 1, 20, 99);
  p.ovr = calcOvr(p.pos, p.attrs);
  return true;
}

export function abilityStatus(c: Career, p: Player, a: Ability): 'owned' | 'available' | 'locked' {
  if (c.abilities.includes(a.id)) return 'owned';
  if (c.level < a.minLevel) return 'locked';
  if (a.req && (p.attrs[a.req.attr] ?? 0) < a.req.min) return 'locked';
  return 'available';
}

export function buyAbility(c: Career, p: Player, id: string): boolean {
  const a = ABILITIES.find((x) => x.id === id);
  if (!a || abilityStatus(c, p, a) !== 'available' || c.sp < a.cost) return false;
  c.sp -= a.cost;
  c.abilities.push(id);
  if (c.equipped.length < abilitySlots(c.level)) c.equipped.push(id);
  return true;
}

export function toggleEquip(c: Career, id: string): boolean {
  if (!c.abilities.includes(id)) return false;
  if (c.equipped.includes(id)) {
    c.equipped = c.equipped.filter((x) => x !== id);
    return true;
  }
  if (c.equipped.length >= abilitySlots(c.level)) return false;
  c.equipped.push(id);
  return true;
}

/** Aging for the user: physical decline after 29, slight awareness growth. */
export function ageUser(p: Player) {
  p.age += 1;
  p.yearsPro += 1;
  for (const k in p.attrs) {
    const key = k as Attr;
    let d = 0;
    if (['spd', 'acc', 'agi'].includes(key) && p.age >= 30) d = -Math.min(4, p.age - 29);
    else if (p.age >= 32 && key !== 'awr' && key !== 'prc' && key !== 'kac') d = -Math.min(3, Math.floor((p.age - 30) / 2));
    if ((key === 'awr' || key === 'prc') && p.age <= 32) d += 1;
    p.attrs[key] = clamp((p.attrs[key] ?? 50) + d, 20, 99);
  }
  p.ovr = calcOvr(p.pos, p.attrs);
}
