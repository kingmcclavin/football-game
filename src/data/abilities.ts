import type { Attr, Pos } from '../core/types';

/**
 * Abilities are unlockable perks with clear, measurable effects. Each effect
 * key is read by the gameplay engine (see game/engine/mods.ts).
 */
export type AbilityEffect =
  | 'pressureAcc' // multiplier on accuracy penalty while pressured
  | 'deepAcc' // multiplier on deep-ball error
  | 'runAcc' // multiplier on throw-on-run error
  | 'releaseTime' // multiplier on throw wind-up time
  | 'throwSpeed' // multiplier on ball velocity
  | 'escape' // bonus chance to escape a sack
  | 'breakTackle' // added to break-tackle chance
  | 'jukeBonus' // added juke success
  | 'spinBonus' // added spin success
  | 'stiffBonus'
  | 'fumbleMult' // multiplier on fumble chance
  | 'sprintSpeed' // multiplier on top speed
  | 'separation' // seconds added to defender reaction delay
  | 'dropMult' // multiplier on drop chance
  | 'contested' // added contested catch chance
  | 'pursuit' // multiplier on pursuit speed
  | 'intBonus' // added interception chance
  | 'reaction' // seconds removed from own reaction delay
  | 'shedMult' // multiplier on block-shed speed
  | 'tackleBonus'
  | 'forceFumble'
  | 'blockHold' // multiplier on blocker hold strength
  | 'kickPower'
  | 'kickMeter' // multiplier on kick meter speed (lower = easier)
  | 'puntAim'
  | 'catchRadius';

export interface Ability {
  id: string;
  name: string;
  desc: string;
  positions: Pos[];
  cost: number;
  minLevel: number;
  req?: { attr: Attr; min: number };
  effects: Partial<Record<AbilityEffect, number>>;
  tier: 'bronze' | 'silver' | 'gold';
}

const AB = (id: string, name: string, desc: string, positions: Pos[], cost: number, minLevel: number, effects: Ability['effects'], tier: Ability['tier'], req?: Ability['req']): Ability => ({ id, name, desc, positions, cost, minLevel, effects, tier, req });

export const ABILITIES: Ability[] = [
  // Quarterback
  AB('poise', 'Pocket Poise', 'Accuracy penalty from pressure is cut in half.', ['QB'], 3, 2, { pressureAcc: 0.5 }, 'silver'),
  AB('dimes', 'Deep Dimes', 'Deep throws (20+ air yards) are 30% more accurate.', ['QB'], 3, 3, { deepAcc: 0.7 }, 'silver', { attr: 'dac', min: 70 }),
  AB('onthemove', 'On The Move', 'Throw-on-the-run accuracy penalty reduced by 50%.', ['QB'], 2, 2, { runAcc: 0.5 }, 'bronze'),
  AB('quickdraw', 'Quick Draw', 'Throwing motion is 35% faster.', ['QB'], 3, 4, { releaseTime: 0.65 }, 'gold'),
  AB('gunslinger', 'Gunslinger', 'Passes travel 10% faster, giving defenders less time to react.', ['QB'], 3, 5, { throwSpeed: 1.1 }, 'gold', { attr: 'thp', min: 80 }),
  AB('escape', 'Escape Artist', '+20% chance to slip out of a sack attempt.', ['QB', 'RB'], 2, 2, { escape: 0.2 }, 'bronze'),
  // Ball carriers
  AB('bruiser', 'Bruiser', '+12% break-tackle chance on every contact.', ['RB', 'TE', 'QB'], 3, 2, { breakTackle: 0.12 }, 'silver'),
  AB('jukebox', 'Juke Box', 'Jukes are 18% more likely to make defenders miss.', ['RB', 'WR', 'QB'], 3, 2, { jukeBonus: 0.18 }, 'silver'),
  AB('spincycle', 'Spin Cycle', 'Spin moves are 18% more effective.', ['RB', 'WR'], 2, 3, { spinBonus: 0.18 }, 'bronze'),
  AB('stiffarm', 'Stiff Arm Pro', 'Stiff arms are 20% more effective.', ['RB', 'TE', 'WR'], 2, 3, { stiffBonus: 0.2 }, 'bronze'),
  AB('security', 'Ball Security', 'Fumble chance reduced by 60%.', ['RB', 'WR', 'TE', 'QB'], 2, 1, { fumbleMult: 0.4 }, 'bronze'),
  AB('afterburner', 'Afterburner', 'Top sprint speed increased by 3%.', ['RB', 'WR', 'CB', 'S', 'QB'], 4, 6, { sprintSpeed: 1.03 }, 'gold', { attr: 'spd', min: 85 }),
  // Receivers
  AB('technician', 'Route Technician', 'Defenders react 0.12s later to your breaks.', ['WR', 'TE', 'RB'], 3, 2, { separation: 0.12 }, 'silver'),
  AB('velcro', 'Velcro Hands', 'Drop chance reduced by 50%.', ['WR', 'TE', 'RB'], 2, 1, { dropMult: 0.5 }, 'bronze'),
  AB('highpoint', 'High Point', '+15% contested catch chance.', ['WR', 'TE'], 3, 3, { contested: 0.15 }, 'silver', { attr: 'jmp', min: 70 }),
  AB('wingspan', 'Wingspan', 'Catch radius increased by 20%.', ['WR', 'TE', 'CB', 'S'], 3, 4, { catchRadius: 1.2 }, 'gold'),
  AB('yac', 'YAC Machine', '+8% break-tackle chance and better jukes after the catch.', ['WR', 'TE'], 2, 3, { breakTackle: 0.08, jukeBonus: 0.08 }, 'bronze'),
  // Defense
  AB('pursuit', 'Relentless Pursuit', 'Move 5% faster while chasing a ball carrier.', ['DE', 'DT', 'LB', 'CB', 'S'], 2, 2, { pursuit: 1.05 }, 'bronze'),
  AB('ballhawk', 'Ballhawk', '+12% interception chance on contested throws.', ['CB', 'S', 'LB'], 3, 3, { intBonus: 0.12 }, 'silver'),
  AB('lockdown', 'Lockdown', 'React 0.1s faster to receiver breaks.', ['CB', 'S', 'LB'], 3, 3, { reaction: 0.1 }, 'silver', { attr: 'mcv', min: 70 }),
  AB('edge', 'Edge Threat', 'Shed blocks 25% faster on pass rushes.', ['DE', 'DT', 'LB'], 3, 2, { shedMult: 1.25 }, 'silver'),
  AB('sure', 'Sure Tackler', '+12% tackle success.', ['LB', 'S', 'CB', 'DE', 'DT'], 2, 1, { tackleBonus: 0.12 }, 'bronze'),
  AB('hitstick', 'Hit Stick', 'Forced-fumble chance doubled on hard hits.', ['LB', 'S', 'DE', 'DT', 'CB'], 3, 4, { forceFumble: 2 }, 'gold', { attr: 'pow', min: 75 }),
  // Linemen
  AB('anchor', 'Anchor', 'Hold blocks 25% longer.', ['OL', 'TE'], 2, 1, { blockHold: 1.25 }, 'bronze'),
  AB('wall', 'Brick Wall', 'Hold blocks 25% longer (stacks with Anchor).', ['OL'], 3, 4, { blockHold: 1.25 }, 'gold', { attr: 'pbk', min: 75 }),
  // Kickers
  AB('cannon', 'Cannon Leg', '+6% kick distance.', ['K', 'P'], 3, 2, { kickPower: 1.06 }, 'silver'),
  AB('icevein', 'Ice in the Veins', 'Kick meter moves 20% slower.', ['K', 'P'], 3, 3, { kickMeter: 0.8 }, 'gold'),
  AB('coffin', 'Coffin Corner', 'Punt aim error reduced by 40%.', ['P'], 2, 2, { puntAim: 0.6 }, 'bronze'),
];

export const abilitiesFor = (pos: Pos) => ABILITIES.filter((a) => a.positions.includes(pos));
export const abilityById = (id: string) => ABILITIES.find((a) => a.id === id);
export const abilitySlots = (level: number) => Math.min(5, 2 + Math.floor(level / 5));
