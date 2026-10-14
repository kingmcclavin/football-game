import type { StatKey } from '../../core/types';

export interface StatEvent {
  pid: string;
  key: StatKey;
  v: number;
  /** For "long" keys: value is max'ed rather than summed. */
  max?: boolean;
}

export type OutcomeKind =
  | 'run' | 'pass' | 'sack' | 'incomplete' | 'interception' | 'fumble'
  | 'punt' | 'fg' | 'xp' | 'kickoff' | 'kneel' | 'spike' | 'twopt';

export interface Penalty {
  name: string;
  against: 'off' | 'def';
  yards: number;
  autoFirst?: boolean;
  /** Spot fouls are enforced from `spot` (offense coords) instead of the previous spot. */
  spot?: number;
  preSnap?: boolean;
}

/**
 * The result of a single play, produced either by the 3D simulation or the
 * statistical quick sim. All x coordinates use the coordinate system of the
 * team that had the ball when the play started (0 = own goal line, 100 =
 * opponent goal line).
 */
export interface PlayOutcome {
  kind: OutcomeKind;
  /** Spot where the ball became dead (offense coordinates). */
  endX: number;
  /** Which side holds the ball when the play ends. */
  holder: 'off' | 'def';
  td?: boolean;
  safety?: boolean;
  touchback?: boolean;
  oob?: boolean;
  /** Pass incomplete / spike: clock stops. */
  stopClock?: boolean;
  duration: number;
  good?: boolean; // fg / xp
  penalty?: Penalty;
  stats: StatEvent[];
  desc: string;
  /** Lateral ball position (0..53.3) where the play ended, used for the next spot. */
  endY?: number;
  /** Notable flags for presentation & XP. */
  bigPlay?: boolean;
  userInvolved?: boolean;
  airYards?: number;
  /** Per-play grade for the user's player (-3..+3) and notes. */
  grade?: number;
  notes?: string[];
}

export interface PlayLog {
  q: number;
  clock: number;
  poss: number; // team id
  down: number;
  toGo: number;
  ballOn: number;
  text: string;
  scoring?: boolean;
  score: [number, number];
}
