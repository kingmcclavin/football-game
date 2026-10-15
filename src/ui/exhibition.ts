import type { Career, Difficulty, Game, League, Pos } from '../core/types';

/** The throwaway league/career/game used by an exhibition. Never saved. */
export interface ExhibitionSetup { pos: Pos; team: number; opp: number; home: boolean; level: 'rookie' | 'pro' | 'star'; difficulty: Difficulty; quarterMinutes: number }

export const exhibition: { league: League | null; career: Career | null; game: Game | null; setup: ExhibitionSetup | null } = { league: null, career: null, game: null, setup: null };
