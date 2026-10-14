import type { Attr, Attrs, Player, Pos } from '../core/types';
import { Rng } from '../core/rng';
import { clamp } from '../core/util';
import { ARCHETYPES, POS_ATTRS, POS_BODY, archetypesFor, calcOvr } from '../data/positions';
import { COLLEGES, FIRST_NAMES, LAST_NAMES } from '../data/names';

/** Baseline physical / universal attributes every player carries (used by the 3D sim). */
const PHYS: Record<Pos, Partial<Record<Attr, number>>> = {
  QB: { spd: 70, acc: 74, agi: 72, str: 60, awr: 68, sta: 80, car: 70, btk: 45, jkm: 50, tak: 30, cth: 45 },
  RB: { spd: 86, acc: 86, agi: 84, str: 68, awr: 65, sta: 82, cth: 64, rte: 55, tak: 35, pbk: 45 },
  WR: { spd: 87, acc: 86, agi: 84, str: 55, awr: 66, sta: 82, car: 66, btk: 52, jkm: 64, tak: 30 },
  TE: { spd: 76, acc: 76, agi: 70, str: 72, awr: 66, sta: 82, car: 68, btk: 64, tak: 35 },
  OL: { spd: 55, acc: 64, agi: 58, str: 80, awr: 66, sta: 82, tak: 40, cth: 25, car: 40 },
  DE: { spd: 76, acc: 78, agi: 70, str: 76, awr: 64, sta: 80, cth: 40, car: 45, mcv: 40, zcv: 45, pow: 72 },
  DT: { spd: 62, acc: 70, agi: 60, str: 84, awr: 64, sta: 80, cth: 35, car: 40, mcv: 30, zcv: 35, pow: 74 },
  LB: { spd: 78, acc: 80, agi: 74, str: 72, awr: 66, sta: 82, cth: 55, car: 50, pmv: 60, fmv: 60 },
  CB: { spd: 89, acc: 88, agi: 86, str: 55, awr: 66, sta: 84, cth: 62, car: 55, pow: 55, bsh: 45, pur: 70 },
  S: { spd: 85, acc: 85, agi: 80, str: 62, awr: 68, sta: 84, cth: 60, car: 55, bsh: 50, jmp: 72 },
  K: { spd: 60, acc: 62, agi: 60, str: 45, awr: 60, sta: 70, tak: 25, cth: 40 },
  P: { spd: 60, acc: 62, agi: 60, str: 45, awr: 60, sta: 70, tak: 25, cth: 40 },
};

export function makeName(rng: Rng): { first: string; last: string } {
  return { first: rng.pick(FIRST_NAMES), last: rng.pick(LAST_NAMES) };
}

const NUM_RANGES: Record<Pos, [number, number][]> = {
  QB: [[1, 19]], RB: [[20, 39], [1, 9]], WR: [[10, 19], [80, 89], [1, 9]], TE: [[80, 89], [40, 49]],
  OL: [[60, 79]], DE: [[90, 99], [50, 59]], DT: [[90, 99], [70, 79]], LB: [[40, 59]], CB: [[20, 39], [1, 9]],
  S: [[20, 49]], K: [[1, 19]], P: [[1, 19]],
};
export function randomNumber(rng: Rng, pos: Pos, taken?: Set<number>): number {
  for (let i = 0; i < 40; i++) {
    const r = rng.pick(NUM_RANGES[pos]);
    const n = rng.int(r[0], r[1]);
    if (!taken || !taken.has(n)) return n;
  }
  return rng.int(1, 99);
}

/** Build an attribute set that lands near a target overall. */
export function buildAttrs(rng: Rng, pos: Pos, targetOvr: number, archetypeId?: string): Attrs {
  const arch = archetypeId ? ARCHETYPES.find((a) => a.id === archetypeId) : undefined;
  const a: Attrs = {};
  const weights = POS_ATTRS[pos];
  for (const k in PHYS[pos]) {
    const key = k as Attr;
    a[key] = clamp(Math.round((PHYS[pos][key] as number) + (targetOvr - 70) * 0.35 + rng.normal(0, 4)), 20, 99);
  }
  for (const k in weights) {
    const key = k as Attr;
    a[key] = clamp(Math.round(targetOvr + rng.normal(0, 5)), 25, 99);
  }
  if (arch) for (const k in arch.boosts) {
    const key = k as Attr;
    a[key] = clamp((a[key] ?? 60) + (arch.boosts[key] as number), 20, 99);
  }
  // iterate to land near target overall
  for (let i = 0; i < 4; i++) {
    const diff = targetOvr - calcOvr(pos, a);
    if (Math.abs(diff) < 1) break;
    for (const k in weights) {
      const key = k as Attr;
      a[key] = clamp(Math.round((a[key] as number) + diff / 1.12), 20, 99);
    }
  }
  return a;
}

const POS_SAL_MAX: Record<Pos, number> = { QB: 55, WR: 34, DE: 32, OL: 26, CB: 24, DT: 26, TE: 18, LB: 20, S: 18, RB: 16, K: 6, P: 4 };

/** Fair-market annual salary ($M) for a player. */
export function marketValue(pos: Pos, ovr: number, age: number, reputationBonus = 0): number {
  const f = Math.pow(clamp((ovr - 58) / 41, 0, 1), 2.3);
  let v = 0.9 + POS_SAL_MAX[pos] * f;
  if (age >= 31) v *= 1 - (age - 30) * 0.07;
  v *= 1 + reputationBonus;
  return Math.max(0.85, Math.round(v * 100) / 100);
}

export function makePlayer(
  rng: Rng,
  id: string,
  pos: Pos,
  targetOvr: number,
  teamId: number,
  season: number,
  opts: { age?: number; rookie?: boolean } = {},
): Player {
  const { first, last } = makeName(rng);
  const arches = archetypesFor(pos);
  const arch = arches.length ? rng.pick(arches) : undefined;
  const age = opts.age ?? (opts.rookie ? rng.int(21, 23) : clamp(Math.round(rng.normal(26.5, 3.2)), 21, 37));
  const attrs = buildAttrs(rng, pos, targetOvr, arch?.id);
  const ovr = calcOvr(pos, attrs);
  const youth = clamp(29 - age, 0, 8);
  const pot = clamp(Math.round(ovr + youth * rng.range(0.6, 2.2)), ovr, 99);
  const body = POS_BODY[pos];
  const yearsPro = opts.rookie ? 0 : clamp(age - 22 + rng.int(-1, 0), 0, 16);
  const yrs = opts.rookie ? 4 : rng.int(1, 4);
  return {
    id,
    first,
    last,
    pos,
    age,
    num: randomNumber(rng, pos),
    ht: rng.int(body.ht[0], body.ht[1]),
    wt: Math.round(rng.range(body.wt[0], body.wt[1]) / 5) * 5,
    attrs,
    ovr,
    pot,
    teamId,
    contract: { years: yrs, salary: marketValue(pos, ovr, age) * rng.range(0.8, 1.1), bonus: 0, signed: season },
    yearsPro,
    stats: {},
    post: {},
    awards: [],
    archetype: arch?.id,
    college: rng.pick(COLLEGES),
  };
}

export const fullName = (p: Player) => `${p.first} ${p.last}`;
export const shortName = (p: Player) => `${p.first[0]}. ${p.last}`;

export function recalcOvr(p: Player) {
  p.ovr = calcOvr(p.pos, p.attrs);
}
