// ---------------------------------------------------------------------------
// Data-driven playbook. Coordinates are offense-relative:
//   dx: yards relative to the line of scrimmage (negative = backfield)
//   dy: yards relative to the ball, positive = offense's left
// Route points are (forward, outward) where "outward" points to the sideline
// on the side the player aligned (or `side` if specified).
// ---------------------------------------------------------------------------

export type OffSlot = 'QB' | 'RB' | 'FB' | 'TE1' | 'TE2' | 'X' | 'Z' | 'SL' | 'SL2' | 'LT' | 'LG' | 'C' | 'RG' | 'RT';
export type DefSlot = 'LE' | 'RE' | 'LDT' | 'RDT' | 'NT' | 'WLB' | 'MLB' | 'SLB' | 'LB4' | 'CB1' | 'CB2' | 'NCB' | 'DCB' | 'FS' | 'SS';

export interface Spot<S extends string> {
  slot: S;
  dx: number;
  dy: number;
}

export interface Formation {
  id: string;
  name: string;
  personnel: string;
  spots: Spot<OffSlot>[];
  underCenter: boolean;
}

export const OL_SPOTS: Spot<OffSlot>[] = [
  { slot: 'LT', dx: -0.6, dy: 2.5 },
  { slot: 'LG', dx: -0.5, dy: 1.25 },
  { slot: 'C', dx: -0.4, dy: 0 },
  { slot: 'RG', dx: -0.5, dy: -1.25 },
  { slot: 'RT', dx: -0.6, dy: -2.5 },
];

const F = (id: string, name: string, personnel: string, underCenter: boolean, spots: Spot<OffSlot>[]): Formation => ({
  id, name, personnel, underCenter, spots: [...OL_SPOTS, ...spots],
});

export const FORMATIONS: Record<string, Formation> = {
  gun: F('gun', 'Shotgun Doubles', '11', false, [
    { slot: 'QB', dx: -5, dy: 0 },
    { slot: 'RB', dx: -5, dy: -1.3 },
    { slot: 'TE1', dx: -0.8, dy: -3.8 },
    { slot: 'X', dx: -0.4, dy: 14 },
    { slot: 'SL', dx: -1.2, dy: 7 },
    { slot: 'Z', dx: -1.2, dy: -13 },
  ]),
  singleback: F('singleback', 'Singleback Ace', '11', true, [
    { slot: 'QB', dx: -1.1, dy: 0 },
    { slot: 'RB', dx: -6.5, dy: 0 },
    { slot: 'TE1', dx: -0.8, dy: -3.8 },
    { slot: 'X', dx: -0.4, dy: 14 },
    { slot: 'SL', dx: -1.2, dy: 7.5 },
    { slot: 'Z', dx: -1.2, dy: -12.5 },
  ]),
  iform: F('iform', 'I-Form Pro', '21', true, [
    { slot: 'QB', dx: -1.1, dy: 0 },
    { slot: 'FB', dx: -4, dy: 0 },
    { slot: 'RB', dx: -6.8, dy: 0 },
    { slot: 'TE1', dx: -0.8, dy: -3.8 },
    { slot: 'X', dx: -0.4, dy: 13 },
    { slot: 'Z', dx: -1.2, dy: -12 },
  ]),
  empty: F('empty', 'Spread Empty', '10', false, [
    { slot: 'QB', dx: -5, dy: 0 },
    { slot: 'X', dx: -0.4, dy: 15 },
    { slot: 'SL', dx: -1.2, dy: 8 },
    { slot: 'RB', dx: -1.2, dy: 4.2 },
    { slot: 'SL2', dx: -1.2, dy: -8 },
    { slot: 'Z', dx: -0.4, dy: -15 },
  ]),
  goalline: F('goalline', 'Goal Line', '13', true, [
    { slot: 'QB', dx: -1.1, dy: 0 },
    { slot: 'FB', dx: -3.6, dy: 0 },
    { slot: 'RB', dx: -6, dy: 0 },
    { slot: 'TE1', dx: -0.8, dy: -3.8 },
    { slot: 'TE2', dx: -0.8, dy: 3.8 },
    { slot: 'Z', dx: -0.4, dy: -10 },
  ]),
  pistol: F('pistol', 'Pistol Strong', '12', false, [
    { slot: 'QB', dx: -3.8, dy: 0 },
    { slot: 'RB', dx: -6.6, dy: 0 },
    { slot: 'TE1', dx: -0.8, dy: -3.8 },
    { slot: 'TE2', dx: -1.6, dy: -5.2 },
    { slot: 'X', dx: -0.4, dy: 13 },
    { slot: 'Z', dx: -1.2, dy: -13 },
  ]),
};

export type RouteName =
  | 'slant' | 'out' | 'in' | 'curl' | 'comeback' | 'post' | 'corner' | 'go' | 'flat' | 'wheel' | 'shallow'
  | 'deepcross' | 'seam' | 'hitch' | 'swing' | 'screen' | 'drag' | 'stick' | 'fade' | 'bubble' | 'arrow';

export interface RouteDef {
  pts: [number, number][];
  stop?: boolean; // settles at end (curl/hitch)
  depth: 'short' | 'medium' | 'deep';
}

export const ROUTES: Record<RouteName, RouteDef> = {
  slant: { pts: [[2, 0], [7, -5], [14, -11]], depth: 'short' },
  out: { pts: [[6, 0], [6.5, 8], [6.5, 20]], depth: 'short' },
  in: { pts: [[10, 0], [10.5, -10], [10.5, -25]], depth: 'medium' },
  curl: { pts: [[11, 0], [9.5, -1.2]], stop: true, depth: 'medium' },
  comeback: { pts: [[15, 0], [13, 3]], stop: true, depth: 'medium' },
  post: { pts: [[11, 0], [26, -9], [45, -16]], depth: 'deep' },
  corner: { pts: [[11, 0], [24, 9], [32, 14]], depth: 'deep' },
  go: { pts: [[6, 0.5], [50, 1.5]], depth: 'deep' },
  fade: { pts: [[4, 1.5], [50, 4]], depth: 'deep' },
  flat: { pts: [[1.5, 3], [3, 11], [3.5, 22]], depth: 'short' },
  wheel: { pts: [[1, 5], [5, 9], [30, 11]], depth: 'deep' },
  shallow: { pts: [[3, 0], [4.5, -10], [5, -30]], depth: 'short' },
  deepcross: { pts: [[9, 0], [15, -10], [18, -30]], depth: 'medium' },
  seam: { pts: [[10, 0], [45, -1]], depth: 'deep' },
  hitch: { pts: [[5.5, 0], [4.5, -0.5]], stop: true, depth: 'short' },
  swing: { pts: [[-1.5, 4], [0.5, 9], [3, 16]], depth: 'short' },
  screen: { pts: [[-1.8, 3], [-2, 4.5]], stop: true, depth: 'short' },
  drag: { pts: [[2, 0], [2.5, -12], [3, -30]], depth: 'short' },
  stick: { pts: [[6, 0], [6, -1.5]], stop: true, depth: 'short' },
  bubble: { pts: [[-1, 2], [0, 5]], stop: true, depth: 'short' },
  arrow: { pts: [[2, 4], [5, 12], [6, 22]], depth: 'short' },
};

export type Assignment =
  | { kind: 'route'; route: RouteName; side?: 1 | -1; delay?: number }
  | { kind: 'block' }
  | { kind: 'lead'; side?: 1 | -1 } // lead blocker through the hole
  | { kind: 'run'; hole: number; style: 'inside' | 'outside' | 'draw' | 'sneak' } // ball carrier
  | { kind: 'fake'; hole: number } // play-action fake path
  | { kind: 'checkRelease'; route: RouteName; side?: 1 | -1 };

export type PlayTag = 'run' | 'pass' | 'short' | 'medium' | 'deep' | 'goal' | 'shortyd' | 'screen' | 'pa' | 'qbrun' | 'hurry' | 'special';

export interface OffPlay {
  id: string;
  name: string;
  formation: string;
  type: 'run' | 'pass';
  tags: PlayTag[];
  assign: Partial<Record<OffSlot, Assignment>>;
  progression: OffSlot[];
  carrier?: OffSlot; // run plays
  dropback?: number; // yards
  desc: string;
}

const R = (route: RouteName, side?: 1 | -1, delay?: number): Assignment => ({ kind: 'route', route, side, delay });
const BLK: Assignment = { kind: 'block' };

export const OFF_PLAYS: OffPlay[] = [
  // ---------------- Shotgun Doubles ----------------
  { id: 'gun_slants', name: 'Double Slants', formation: 'gun', type: 'pass', tags: ['pass', 'short', 'hurry'], dropback: 2,
    assign: { X: R('slant'), Z: R('slant'), SL: R('flat'), TE1: R('stick'), RB: { kind: 'checkRelease', route: 'flat', side: -1 } },
    progression: ['X', 'Z', 'TE1', 'SL', 'RB'], desc: 'Quick slants on both sides with a flat outlet. Beats off coverage and the blitz.' },
  { id: 'gun_curls', name: 'Curl Flats', formation: 'gun', type: 'pass', tags: ['pass', 'medium'], dropback: 3,
    assign: { X: R('curl'), Z: R('curl'), SL: R('flat'), TE1: R('drag'), RB: R('swing', -1) },
    progression: ['X', 'SL', 'Z', 'TE1', 'RB'], desc: 'Curls outside paired with the flat. A classic zone beater.' },
  { id: 'gun_verts', name: 'Four Verticals', formation: 'gun', type: 'pass', tags: ['pass', 'deep', 'hurry'], dropback: 5,
    assign: { X: R('go'), Z: R('go'), SL: R('seam'), TE1: R('seam'), RB: { kind: 'checkRelease', route: 'flat', side: 1 } },
    progression: ['SL', 'TE1', 'X', 'Z', 'RB'], desc: 'Stretch every deep zone. Look to the seams against two-deep safeties.' },
  { id: 'gun_mesh', name: 'Mesh Dig', formation: 'gun', type: 'pass', tags: ['pass', 'short', 'medium'], dropback: 3,
    assign: { X: R('in'), SL: R('shallow'), TE1: R('shallow', 1), Z: R('post'), RB: R('flat', -1) },
    progression: ['SL', 'TE1', 'X', 'Z', 'RB'], desc: 'Crossing routes that rub man coverage, with a dig behind them.' },
  { id: 'gun_smash', name: 'Smash', formation: 'gun', type: 'pass', tags: ['pass', 'medium'], dropback: 3,
    assign: { X: R('hitch'), SL: R('corner'), Z: R('hitch'), TE1: R('drag'), RB: BLK },
    progression: ['SL', 'X', 'Z', 'TE1'], desc: 'Hitch underneath a corner route. High-low the cornerback.' },
  { id: 'gun_post', name: 'Deep Post Shot', formation: 'gun', type: 'pass', tags: ['pass', 'deep'], dropback: 5,
    assign: { X: R('post'), Z: R('in'), SL: R('out'), TE1: R('curl'), RB: BLK },
    progression: ['X', 'Z', 'TE1', 'SL'], desc: 'A max-protect deep post. Wait for it to develop.' },
  { id: 'gun_iz', name: 'Inside Zone', formation: 'gun', type: 'run', tags: ['run', 'shortyd'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: 1.5, style: 'inside' }, X: BLK, Z: BLK, SL: BLK, TE1: BLK },
    progression: [], desc: 'Downhill run between the guards. Read the cutback.' },
  { id: 'gun_draw', name: 'HB Draw', formation: 'gun', type: 'run', tags: ['run'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: -1.2, style: 'draw' }, X: R('go'), Z: R('go'), SL: BLK, TE1: BLK },
    progression: [], desc: 'Show pass, then hand it off late as the rush flies upfield.' },
  { id: 'gun_screen', name: 'HB Screen', formation: 'gun', type: 'pass', tags: ['pass', 'short', 'screen'], dropback: 5,
    assign: { RB: { kind: 'route', route: 'screen', side: -1, delay: 0.9 }, X: R('go'), Z: R('go'), SL: R('in'), TE1: BLK },
    progression: ['RB', 'SL'], desc: 'Let the rush come, then dump it to the back behind a wall of blockers.' },
  { id: 'gun_qbdraw', name: 'QB Draw', formation: 'gun', type: 'run', tags: ['run', 'qbrun'], carrier: 'QB',
    assign: { QB: { kind: 'run', hole: 0.6, style: 'draw' }, RB: { kind: 'lead', side: 1 }, X: R('go'), Z: R('go'), SL: BLK, TE1: BLK },
    progression: [], desc: 'Quarterback keeps it up the middle after a pass set.' },
  // ---------------- Singleback ----------------
  { id: 'sb_dive', name: 'HB Dive', formation: 'singleback', type: 'run', tags: ['run', 'shortyd'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: -1.3, style: 'inside' }, X: BLK, Z: BLK, SL: BLK, TE1: BLK },
    progression: [], desc: 'Hit the A-gap fast. Reliable short yardage.' },
  { id: 'sb_stretch', name: 'Outside Stretch', formation: 'singleback', type: 'run', tags: ['run'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: -6, style: 'outside' }, X: BLK, Z: BLK, SL: BLK, TE1: BLK },
    progression: [], desc: 'Stretch the defense to the edge and cut up when the lane opens.' },
  { id: 'sb_pacross', name: 'PA Deep Cross', formation: 'singleback', type: 'pass', tags: ['pass', 'deep', 'pa'], dropback: 6,
    assign: { RB: { kind: 'fake', hole: -1.3 }, X: R('deepcross'), Z: R('post'), TE1: R('flat'), SL: R('corner') },
    progression: ['X', 'SL', 'Z', 'TE1'], desc: 'Fake the dive to pull linebackers up, then hit the deep crosser.' },
  { id: 'sb_outs', name: 'Double Outs', formation: 'singleback', type: 'pass', tags: ['pass', 'short', 'hurry'], dropback: 3,
    assign: { X: R('out'), Z: R('out'), SL: R('in'), TE1: R('curl'), RB: BLK },
    progression: ['Z', 'X', 'TE1', 'SL'], desc: 'Timing outs to the sideline. Great for stopping the clock.' },
  { id: 'sb_corner', name: 'Corner Strike', formation: 'singleback', type: 'pass', tags: ['pass', 'deep'], dropback: 5,
    assign: { X: R('corner'), Z: R('post'), SL: R('out'), TE1: R('stick'), RB: { kind: 'checkRelease', route: 'flat', side: 1 } },
    progression: ['X', 'Z', 'TE1', 'SL', 'RB'], desc: 'Corner and post combo designed to beat cover 3.' },
  { id: 'sb_bubble', name: 'Slot Bubble', formation: 'singleback', type: 'pass', tags: ['pass', 'short', 'screen'], dropback: 1,
    assign: { SL: R('bubble'), X: BLK, Z: R('slant'), TE1: BLK, RB: BLK },
    progression: ['SL', 'Z'], desc: 'Instant throw to the slot with the outside receiver blocking.' },
  // ---------------- I-Form ----------------
  { id: 'i_power', name: 'Power O', formation: 'iform', type: 'run', tags: ['run', 'shortyd'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: -2.6, style: 'inside' }, FB: { kind: 'lead', side: -1 }, X: BLK, Z: BLK, TE1: BLK },
    progression: [], desc: 'Downhill power with the fullback leading through the hole.' },
  { id: 'i_toss', name: 'Toss Sweep', formation: 'iform', type: 'run', tags: ['run'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: 7, style: 'outside' }, FB: { kind: 'lead', side: 1 }, X: BLK, Z: BLK, TE1: BLK },
    progression: [], desc: 'Pitch it outside and race the defense to the corner.' },
  { id: 'i_boot', name: 'PA Bootleg', formation: 'iform', type: 'pass', tags: ['pass', 'medium', 'pa'], dropback: 5,
    assign: { RB: { kind: 'fake', hole: -2.6 }, FB: R('flat', 1), TE1: R('deepcross'), X: R('comeback'), Z: R('post') },
    progression: ['TE1', 'X', 'FB', 'Z'], desc: 'Run fake one way, roll the pocket the other. Throw on the move.' },
  { id: 'i_iso', name: 'Iso', formation: 'iform', type: 'run', tags: ['run', 'shortyd'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: 1.3, style: 'inside' }, FB: { kind: 'lead', side: 1 }, X: BLK, Z: BLK, TE1: BLK },
    progression: [], desc: 'Fullback isolates the linebacker. Find the crease.' },
  // ---------------- Goal line ----------------
  { id: 'gl_sneak', name: 'QB Sneak', formation: 'goalline', type: 'run', tags: ['run', 'shortyd', 'goal', 'qbrun'], carrier: 'QB',
    assign: { QB: { kind: 'run', hole: 0, style: 'sneak' }, RB: BLK, FB: BLK, TE1: BLK, TE2: BLK, Z: BLK },
    progression: [], desc: 'Push the pile for a yard.' },
  { id: 'gl_power', name: 'Goal Line Power', formation: 'goalline', type: 'run', tags: ['run', 'shortyd', 'goal'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: -2.6, style: 'inside' }, FB: { kind: 'lead', side: -1 }, TE1: BLK, TE2: BLK, Z: BLK },
    progression: [], desc: 'Heavy personnel, everybody blocks, pound it in.' },
  { id: 'gl_paflat', name: 'PA TE Flat', formation: 'goalline', type: 'pass', tags: ['pass', 'goal', 'pa', 'short'], dropback: 4,
    assign: { RB: { kind: 'fake', hole: -2.6 }, FB: BLK, TE1: R('flat'), TE2: R('corner'), Z: R('fade') },
    progression: ['TE1', 'TE2', 'Z'], desc: 'Sell the run and leak the tight end into the flat.' },
  // ---------------- Pistol ----------------
  { id: 'p_counter', name: 'Counter', formation: 'pistol', type: 'run', tags: ['run'], carrier: 'RB',
    assign: { RB: { kind: 'run', hole: 3, style: 'inside' }, TE2: { kind: 'lead', side: 1 }, X: BLK, Z: BLK, TE1: BLK },
    progression: [], desc: 'Misdirection: step one way, cut back behind the pulling tight end.' },
  { id: 'p_seams', name: 'TE Seams', formation: 'pistol', type: 'pass', tags: ['pass', 'medium', 'deep'], dropback: 4,
    assign: { TE1: R('seam'), TE2: R('flat'), X: R('curl'), Z: R('comeback'), RB: BLK },
    progression: ['TE1', 'X', 'Z', 'TE2'], desc: 'Attack the middle of the field with the tight end.' },
  // ---------------- Empty ----------------
  { id: 'e_stick', name: 'Spread Stick', formation: 'empty', type: 'pass', tags: ['pass', 'short', 'hurry'], dropback: 2,
    assign: { X: R('go'), SL: R('stick'), RB: R('arrow'), SL2: R('stick'), Z: R('go') },
    progression: ['SL', 'SL2', 'RB', 'X', 'Z'], desc: 'Quick sticks from the slots. Ball out in under two seconds.' },
  { id: 'e_verts', name: 'Spread Verticals', formation: 'empty', type: 'pass', tags: ['pass', 'deep', 'hurry'], dropback: 5,
    assign: { X: R('go'), SL: R('seam'), RB: R('hitch'), SL2: R('seam'), Z: R('go') },
    progression: ['SL', 'SL2', 'X', 'Z', 'RB'], desc: 'Five out, everybody vertical. Pick a matchup.' },
  { id: 'e_hail', name: 'Hail Mary', formation: 'empty', type: 'pass', tags: ['pass', 'deep', 'special'], dropback: 7,
    assign: { X: R('go'), SL: R('go'), RB: R('go'), SL2: R('go'), Z: R('go') },
    progression: ['SL', 'X', 'Z', 'SL2', 'RB'], desc: 'Throw it up and pray.' },
];

export const offPlayById = (id: string) => OFF_PLAYS.find((p) => p.id === id)!;

// ---------------------------------------------------------------------------
// Defense
// ---------------------------------------------------------------------------
export type Coverage = 'c0' | 'c1' | 'c2' | 'c3' | 'c4' | 'c2m';

export interface DefFormation {
  id: string;
  name: string;
  slots: DefSlot[];
}

export const DEF_FORMATIONS: Record<string, DefFormation> = {
  base: { id: 'base', name: '4-3 Base', slots: ['LE', 'LDT', 'RDT', 'RE', 'WLB', 'MLB', 'SLB', 'CB1', 'CB2', 'FS', 'SS'] },
  nickel: { id: 'nickel', name: 'Nickel 4-2-5', slots: ['LE', 'LDT', 'RDT', 'RE', 'WLB', 'MLB', 'CB1', 'CB2', 'NCB', 'FS', 'SS'] },
  dime: { id: 'dime', name: 'Dime 4-1-6', slots: ['LE', 'LDT', 'RDT', 'RE', 'MLB', 'CB1', 'CB2', 'NCB', 'DCB', 'FS', 'SS'] },
  goalline: { id: 'goalline', name: 'Goal Line 4-4', slots: ['LE', 'LDT', 'RDT', 'RE', 'WLB', 'MLB', 'SLB', 'LB4', 'CB1', 'CB2', 'SS'] },
};

export interface DefPlay {
  id: string;
  name: string;
  formation: string;
  coverage: Coverage;
  blitz: DefSlot[];
  tags: ('run' | 'pass' | 'blitz' | 'goal' | 'prevent' | 'base')[];
  desc: string;
}

export const DEF_PLAYS: DefPlay[] = [
  { id: 'b_c3', name: 'Cover 3 Sky', formation: 'base', coverage: 'c3', blitz: [], tags: ['base', 'run'], desc: 'Three deep, four under. Sound against everything.' },
  { id: 'b_c2', name: 'Cover 2 Zone', formation: 'base', coverage: 'c2', blitz: [], tags: ['base', 'pass'], desc: 'Two safeties split the deep field; corners squat on the flats.' },
  { id: 'b_c1', name: 'Cover 1 Man', formation: 'base', coverage: 'c1', blitz: [], tags: ['base'], desc: 'Man across the board with a single-high free safety.' },
  { id: 'b_runstop', name: 'Run Stop Buzz', formation: 'base', coverage: 'c3', blitz: ['SLB'], tags: ['run', 'blitz'], desc: 'Eight in the box with the strongside backer firing.' },
  { id: 'b_mike', name: 'Mike Blitz', formation: 'base', coverage: 'c1', blitz: ['MLB'], tags: ['blitz'], desc: 'Middle linebacker shoots the A-gap behind man coverage.' },
  { id: 'n_c2', name: 'Nickel Cover 2', formation: 'nickel', coverage: 'c2', blitz: [], tags: ['pass'], desc: 'Extra defensive back in a two-deep shell.' },
  { id: 'n_c4', name: 'Nickel Quarters', formation: 'nickel', coverage: 'c4', blitz: [], tags: ['pass'], desc: 'Four deep defenders take away vertical routes.' },
  { id: 'n_man', name: 'Nickel 2-Man', formation: 'nickel', coverage: 'c2m', blitz: [], tags: ['pass'], desc: 'Tight man underneath with two safeties over the top.' },
  { id: 'n_fire', name: 'Nickel Fire Zone', formation: 'nickel', coverage: 'c3', blitz: ['NCB'], tags: ['blitz', 'pass'], desc: 'Slot corner blitz with three-deep zone behind it.' },
  { id: 'n_c0', name: 'Cover 0 Blitz', formation: 'nickel', coverage: 'c0', blitz: ['WLB', 'MLB'], tags: ['blitz'], desc: 'Send the house. No safety help.' },
  { id: 'd_prevent', name: 'Dime Prevent', formation: 'dime', coverage: 'c4', blitz: [], tags: ['prevent', 'pass'], desc: 'Keep everything in front. Give up the short stuff.' },
  { id: 'g_man', name: 'Goal Line Man', formation: 'goalline', coverage: 'c0', blitz: ['SLB', 'LB4'], tags: ['goal', 'run'], desc: 'Fill every gap and play tight man in the end zone.' },
  { id: 'g_zone', name: 'Goal Line Zone', formation: 'goalline', coverage: 'c2', blitz: [], tags: ['goal', 'pass'], desc: 'Soft zone at the goal line to defend play action.' },
];

export const defPlayById = (id: string) => DEF_PLAYS.find((p) => p.id === id)!;

/** Which roster position fills each defensive slot. */
export const DEF_SLOT_POS: Record<DefSlot, 'DE' | 'DT' | 'LB' | 'CB' | 'S'> = {
  LE: 'DE', RE: 'DE', LDT: 'DT', RDT: 'DT', NT: 'DT', WLB: 'LB', MLB: 'LB', SLB: 'LB', LB4: 'LB',
  CB1: 'CB', CB2: 'CB', NCB: 'CB', DCB: 'CB', FS: 'S', SS: 'S',
};
export const OFF_SLOT_POS: Record<OffSlot, 'QB' | 'RB' | 'WR' | 'TE' | 'OL'> = {
  QB: 'QB', RB: 'RB', FB: 'RB', TE1: 'TE', TE2: 'TE', X: 'WR', Z: 'WR', SL: 'WR', SL2: 'WR',
  LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
};
/** depth index used for each slot (0 = starter at that position) */
export const OFF_SLOT_DEPTH: Record<OffSlot, number> = {
  QB: 0, RB: 0, FB: 1, TE1: 0, TE2: 1, X: 0, Z: 1, SL: 2, SL2: 3, LT: 0, LG: 1, C: 2, RG: 3, RT: 4,
};
export const DEF_SLOT_DEPTH: Record<DefSlot, number> = {
  LE: 0, RE: 1, LDT: 0, RDT: 1, NT: 2, WLB: 0, MLB: 1, SLB: 2, LB4: 3, CB1: 0, CB2: 1, NCB: 2, DCB: 3, FS: 0, SS: 1,
};
