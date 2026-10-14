import type { Difficulty } from '../../core/types';
import { abilityById, type AbilityEffect } from '../../data/abilities';

export type Mods = Partial<Record<AbilityEffect, number>>;

/** Combine equipped abilities into a single modifier table. */
export function buildMods(abilityIds: string[]): Mods {
  const m: Mods = {};
  for (const id of abilityIds) {
    const a = abilityById(id);
    if (!a) continue;
    for (const k in a.effects) {
      const key = k as AbilityEffect;
      const v = a.effects[key] as number;
      const isMult = ['pressureAcc', 'deepAcc', 'runAcc', 'releaseTime', 'throwSpeed', 'fumbleMult', 'sprintSpeed', 'dropMult', 'pursuit', 'shedMult', 'blockHold', 'kickPower', 'kickMeter', 'puntAim', 'catchRadius', 'forceFumble'].includes(key);
      if (isMult) m[key] = (m[key] ?? 1) * v;
      else m[key] = (m[key] ?? 0) + v;
    }
  }
  return m;
}

export const mod = (m: Mods | undefined, k: AbilityEffect, def: number) => (m && m[k] !== undefined ? (m[k] as number) : def);

/**
 * Difficulty changes AI *behaviour* (reaction time, pursuit angles, coverage
 * tightness, tackling technique, decision quality) rather than inflating
 * ratings. These parameters apply to the AI opponents of the user's team.
 */
export interface DiffParams {
  react: number; // base reaction delay (s)
  lead: number; // pursuit lead factor 0..1
  tackle: number; // additive tackle success
  cover: number; // coverage cushion multiplier (lower = tighter)
  intel: number; // interception / ball skills multiplier
  shed: number; // block shed rate multiplier
  qbRead: number; // AI QB read quality
  userAcc: number; // multiplier on user passing error
  catchHelp: number; // additive catch chance for the user
}

export const DIFFICULTY: Record<Difficulty, DiffParams> = {
  rookie: { react: 0.42, lead: 0.35, tackle: -0.12, cover: 1.35, intel: 0.55, shed: 0.75, qbRead: 0.65, userAcc: 0.75, catchHelp: 0.08 },
  pro: { react: 0.32, lead: 0.55, tackle: -0.04, cover: 1.12, intel: 0.8, shed: 0.92, qbRead: 0.85, userAcc: 0.92, catchHelp: 0.03 },
  allpro: { react: 0.25, lead: 0.75, tackle: 0.0, cover: 1.0, intel: 1.0, shed: 1.05, qbRead: 1.0, userAcc: 1.05, catchHelp: 0 },
  elite: { react: 0.19, lead: 0.9, tackle: 0.05, cover: 0.88, intel: 1.15, shed: 1.15, qbRead: 1.12, userAcc: 1.15, catchHelp: -0.03 },
};

/** Behaviour of AI on the user's own team (fixed baseline). */
export const TEAMMATE: DiffParams = DIFFICULTY.allpro;

export const DIFF_LABEL: Record<Difficulty, string> = { rookie: 'Rookie', pro: 'Pro', allpro: 'All-Pro', elite: 'Elite' };
