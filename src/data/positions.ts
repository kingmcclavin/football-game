import type { Attr, Attrs, Pos } from '../core/types';

export const ATTR_LABEL: Record<Attr, string> = {
  spd: 'Speed', acc: 'Acceleration', agi: 'Agility', str: 'Strength', awr: 'Awareness', sta: 'Stamina',
  thp: 'Throw Power', sac: 'Short Accuracy', mac: 'Medium Accuracy', dac: 'Deep Accuracy', tor: 'Throw on the Run', tup: 'Throw Under Pressure',
  car: 'Carrying', btk: 'Break Tackle', jkm: 'Juke Move', spm: 'Spin Move', sfa: 'Stiff Arm',
  cth: 'Catching', cit: 'Catch in Traffic', rte: 'Route Running', rel: 'Release', jmp: 'Jumping',
  rbk: 'Run Block', pbk: 'Pass Block',
  tak: 'Tackle', pow: 'Hit Power', pur: 'Pursuit', prc: 'Play Recognition', bsh: 'Block Shedding', pmv: 'Power Moves', fmv: 'Finesse Moves', mcv: 'Man Coverage', zcv: 'Zone Coverage',
  kpw: 'Kick Power', kac: 'Kick Accuracy',
};

export const POS_LABEL: Record<Pos, string> = {
  QB: 'Quarterback', RB: 'Running Back', WR: 'Wide Receiver', TE: 'Tight End', OL: 'Offensive Line',
  DE: 'Edge Rusher', DT: 'Defensive Tackle', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', K: 'Kicker', P: 'Punter',
};

/** Attribute set + OVR weights per position. */
export const POS_ATTRS: Record<Pos, Partial<Record<Attr, number>>> = {
  QB: { thp: 3, sac: 3, mac: 3, dac: 2.5, tor: 1.5, tup: 2, awr: 3, spd: 0.8, acc: 0.6, agi: 0.6, sta: 0.3 },
  RB: { spd: 3, acc: 2.5, agi: 2, str: 1, car: 2, btk: 2, jkm: 1.5, spm: 1, sfa: 1, cth: 1, awr: 1, sta: 0.6 },
  WR: { spd: 3, acc: 2, rte: 3, cth: 3, cit: 1.5, rel: 1.5, jmp: 1, agi: 1.5, awr: 1, sta: 0.5 },
  TE: { cth: 2.5, cit: 2, rte: 2, rbk: 2, pbk: 1, spd: 1.5, str: 1.5, acc: 1, awr: 1, sta: 0.5 },
  OL: { pbk: 3, rbk: 3, str: 3, awr: 2, acc: 0.8, agi: 0.6, sta: 0.5 },
  DE: { pmv: 2.5, fmv: 2.5, bsh: 2, spd: 1.8, acc: 1.8, str: 1.5, tak: 1.5, pur: 1, prc: 1, sta: 0.5 },
  DT: { bsh: 3, str: 3, pmv: 2, tak: 2, prc: 1.5, fmv: 1, acc: 1, pur: 0.8, sta: 0.5 },
  LB: { tak: 3, pur: 2.5, prc: 2.5, zcv: 1.5, bsh: 1.5, spd: 1.5, pow: 1.5, mcv: 0.8, acc: 1, str: 1, sta: 0.5 },
  CB: { mcv: 3, zcv: 2.5, spd: 3, acc: 2, agi: 1.5, prc: 1.5, cth: 1, tak: 1, jmp: 1, sta: 0.5 },
  S: { zcv: 3, mcv: 1.5, prc: 2.5, spd: 2, tak: 2, pow: 1.5, pur: 1.5, cth: 1, acc: 1, sta: 0.5 },
  K: { kpw: 3, kac: 3, awr: 0.5 },
  P: { kpw: 3, kac: 3, awr: 0.5 },
};

/** Positions offered when creating a career (the engine supports every position). */
export const CREATE_POS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'LB', 'CB', 'DE', 'K'];
export const CREATE_LABEL: Partial<Record<Pos, string>> = { CB: 'Defensive Back', DE: 'Defensive Line' };
export const POS_LIST: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'];
export const OFFENSE_POS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL'];
export const DEFENSE_POS: Pos[] = ['DE', 'DT', 'LB', 'CB', 'S'];
export const isDefense = (p: Pos) => DEFENSE_POS.includes(p);
export const isSpecial = (p: Pos) => p === 'K' || p === 'P';

export function calcOvr(pos: Pos, a: Attrs): number {
  const w = POS_ATTRS[pos];
  let tot = 0;
  let wsum = 0;
  for (const k in w) {
    const key = k as Attr;
    tot += (a[key] ?? 50) * (w[key] as number);
    wsum += w[key] as number;
  }
  // Stretch the weighted average a bit so elite players land in the 90s.
  const avg = tot / wsum;
  return Math.max(30, Math.min(99, Math.round(avg * 1.12 - 8)));
}

export interface Archetype {
  id: string;
  pos: Pos;
  name: string;
  desc: string;
  /** Attribute deltas applied to the base template. */
  boosts: Partial<Record<Attr, number>>;
  /** Attributes that cost less SP to upgrade for this archetype. */
  focus: Attr[];
}

const A = (id: string, pos: Pos, name: string, desc: string, boosts: Partial<Record<Attr, number>>, focus: Attr[]): Archetype => ({ id, pos, name, desc, boosts, focus });

export const ARCHETYPES: Archetype[] = [
  A('qb_pocket', 'QB', 'Pocket Passer', 'Surgical accuracy and poise from the pocket.', { sac: 6, mac: 6, dac: 4, tup: 5, awr: 4, spd: -6, agi: -4 }, ['sac', 'mac', 'dac', 'tup', 'awr']),
  A('qb_scrambler', 'QB', 'Scrambler', 'Extends plays with legs; dangerous outside the pocket.', { spd: 10, acc: 8, agi: 8, tor: 6, mac: -3, dac: -4 }, ['spd', 'acc', 'agi', 'tor']),
  A('qb_dual', 'QB', 'Dual Threat', 'Balanced arm talent and running ability.', { thp: 4, spd: 5, tor: 4, acc: 3 }, ['thp', 'tor', 'spd']),
  A('rb_power', 'RB', 'Power Back', 'Runs through contact and wears down defenses.', { str: 10, btk: 9, sfa: 8, car: 5, spd: -3, jkm: -5 }, ['str', 'btk', 'sfa', 'car']),
  A('rb_elusive', 'RB', 'Elusive Back', 'Makes defenders miss in space.', { agi: 8, jkm: 9, spm: 8, acc: 5, str: -6, btk: -4 }, ['agi', 'jkm', 'spm', 'acc']),
  A('rb_receiving', 'RB', 'Receiving Back', 'A weapon out of the backfield on third down.', { cth: 12, rte: 10, agi: 4, str: -4, btk: -3 }, ['cth', 'agi', 'acc']),
  A('wr_deep', 'WR', 'Deep Threat', 'Elite speed that takes the top off a defense.', { spd: 8, acc: 5, jmp: 4, rte: -4, cit: -4 }, ['spd', 'acc', 'jmp']),
  A('wr_route', 'WR', 'Route Runner', 'Crisp breaks that create separation on every route.', { rte: 9, rel: 7, agi: 5, str: -3, jmp: -3 }, ['rte', 'rel', 'agi']),
  A('wr_possession', 'WR', 'Possession Receiver', 'Reliable hands in traffic and on third down.', { cth: 8, cit: 9, str: 5, spd: -5 }, ['cth', 'cit', 'str']),
  A('te_receiving', 'TE', 'Receiving Threat', 'A mismatch nightmare in the seams.', { cth: 7, rte: 8, spd: 5, rbk: -6, pbk: -4 }, ['cth', 'rte', 'spd', 'cit']),
  A('te_blocking', 'TE', 'Blocking Specialist', 'An extra lineman who can still catch it short.', { rbk: 10, pbk: 9, str: 7, spd: -4, rte: -5 }, ['rbk', 'pbk', 'str']),
  A('ol_pass', 'OL', 'Pass Protector', 'Keeps a clean pocket against elite rushers.', { pbk: 9, agi: 5, awr: 4, rbk: -4 }, ['pbk', 'agi', 'awr']),
  A('ol_power', 'OL', 'Road Grader', 'Mauls defenders in the run game.', { rbk: 9, str: 7, pbk: -4, agi: -3 }, ['rbk', 'str']),
  A('de_speed', 'DE', 'Speed Rusher', 'Bends the edge before tackles get set.', { fmv: 10, spd: 7, acc: 7, str: -5, pmv: -4 }, ['fmv', 'spd', 'acc']),
  A('de_power', 'DE', 'Power Rusher', 'Bull-rushes tackles straight into the quarterback.', { pmv: 10, str: 9, bsh: 5, spd: -5, fmv: -4 }, ['pmv', 'str', 'bsh']),
  A('dt_nose', 'DT', 'Run Stuffer', 'Clogs the middle and eats double teams.', { str: 9, bsh: 8, tak: 5, fmv: -5, spd: -3 }, ['str', 'bsh', 'tak']),
  A('dt_3tech', 'DT', 'Interior Rusher', 'Penetrates gaps to collapse the pocket.', { pmv: 7, fmv: 7, acc: 6, str: -4 }, ['pmv', 'fmv', 'acc']),
  A('lb_run', 'LB', 'Run Stopper', 'Downhill thumper who fills every gap.', { tak: 8, pow: 8, bsh: 7, str: 5, zcv: -6, mcv: -4 }, ['tak', 'pow', 'bsh']),
  A('lb_cover', 'LB', 'Coverage Specialist', 'Sideline-to-sideline range in the passing game.', { zcv: 10, mcv: 7, spd: 6, pow: -5, bsh: -5 }, ['zcv', 'mcv', 'spd']),
  A('cb_man', 'CB', 'Man Coverage', 'Shadows top receivers wherever they line up.', { mcv: 10, agi: 5, acc: 4, zcv: -5 }, ['mcv', 'agi', 'acc']),
  A('cb_zone', 'CB', 'Zone Coverage', 'Reads the quarterback and breaks on throws.', { zcv: 10, prc: 7, mcv: -5, spd: -2 }, ['zcv', 'prc']),
  A('cb_hawk', 'CB', 'Ball Hawk', 'Turns pass breakups into interceptions.', { cth: 14, jmp: 8, prc: 4, tak: -6, mcv: -3 }, ['cth', 'jmp', 'prc']),
  A('s_free', 'S', 'Free Safety', 'Centerfielder with range and instincts.', { zcv: 8, spd: 6, prc: 5, cth: 5, pow: -6, tak: -3 }, ['zcv', 'spd', 'cth']),
  A('s_strong', 'S', 'Strong Safety', 'An enforcer near the line of scrimmage.', { tak: 8, pow: 9, str: 6, zcv: -5, spd: -2 }, ['tak', 'pow', 'pur']),
  A('k_power', 'K', 'Power Kicker', 'A cannon leg for 55+ yard attempts.', { kpw: 10, kac: -5 }, ['kpw']),
  A('k_accuracy', 'K', 'Accuracy Specialist', 'Automatic inside 45 yards.', { kac: 10, kpw: -5 }, ['kac']),
  A('p_power', 'P', 'Big Leg', 'Booming punts that flip field position.', { kpw: 10, kac: -5 }, ['kpw']),
  A('p_directional', 'P', 'Directional Punter', 'Pins returners inside the 10.', { kac: 10, kpw: -5 }, ['kac']),
];

export const archetypesFor = (pos: Pos) => ARCHETYPES.filter((a) => a.pos === pos);
export const archetypeById = (id?: string) => ARCHETYPES.find((a) => a.id === id);

/** Typical body sizes (inches, lbs) per position for generation and creation defaults. */
export const POS_BODY: Record<Pos, { ht: [number, number]; wt: [number, number] }> = {
  QB: { ht: [72, 78], wt: [205, 240] },
  RB: { ht: [68, 73], wt: [190, 230] },
  WR: { ht: [69, 77], wt: [175, 225] },
  TE: { ht: [75, 79], wt: [240, 265] },
  OL: { ht: [75, 80], wt: [295, 340] },
  DE: { ht: [74, 79], wt: [245, 285] },
  DT: { ht: [73, 78], wt: [295, 340] },
  LB: { ht: [72, 76], wt: [225, 255] },
  CB: { ht: [69, 74], wt: [180, 205] },
  S: { ht: [70, 75], wt: [195, 220] },
  K: { ht: [69, 75], wt: [180, 215] },
  P: { ht: [71, 77], wt: [190, 225] },
};

/** Roster composition per team (counts). */
export const ROSTER_TEMPLATE: Record<Pos, number> = {
  QB: 3, RB: 3, WR: 6, TE: 3, OL: 8, DE: 4, DT: 4, LB: 6, CB: 5, S: 4, K: 1, P: 1,
};

/** Number of starters per position in base personnel. */
export const STARTERS: Record<Pos, number> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DE: 2, DT: 2, LB: 3, CB: 2, S: 2, K: 1, P: 1,
};

/** Which positions are fully playable in 3D, and how. */
export const PLAYABLE: Record<Pos, { ready: boolean; note: string }> = {
  QB: { ready: true, note: 'Full passing, scrambling and play-calling' },
  RB: { ready: true, note: 'Handoffs, cuts, jukes, spins, stiff arms, catches' },
  WR: { ready: true, note: 'Routes, catches, contested catches, YAC' },
  TE: { ready: true, note: 'Routes and catches on passes, blocking on runs' },
  OL: { ready: true, note: 'Simplified pass/run blocking with timing punches' },
  DE: { ready: true, note: 'Pass rush with shed moves, pursuit and tackling' },
  DT: { ready: true, note: 'Interior rush, block shedding and run stuffing' },
  LB: { ready: true, note: 'Run fits, zone/man coverage, blitzes, tackling' },
  CB: { ready: true, note: 'Man/zone coverage, swats, interceptions' },
  S: { ready: true, note: 'Deep coverage, run support, ball hawking' },
  K: { ready: true, note: 'Field goals, extra points and kickoffs with a kick meter' },
  P: { ready: true, note: 'Punts with a kick meter and directional aim' },
};
