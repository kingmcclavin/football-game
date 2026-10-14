import type { Objective, Player, Role, StatLine } from '../core/types';
import { Rng } from '../core/rng';

type Tpl = Omit<Objective, 'id' | 'scope'>;

const GAME_OBJ: Record<string, Tpl[]> = {
  QB: [
    { text: 'Complete 62% of your passes', stat: 'cmpPct', target: 62, xp: 120, trust: 3 },
    { text: 'Throw 2 touchdown passes', stat: 'passTD', target: 2, xp: 150, trust: 3 },
    { text: 'Protect the football: no turnovers', stat: 'noTO', target: 0, xp: 130, trust: 4 },
    { text: 'Throw for 225+ yards', stat: 'passYds', target: 225, xp: 120, trust: 2 },
  ],
  RB: [
    { text: 'Rush for 70+ yards', stat: 'rushYds', target: 70, xp: 130, trust: 3 },
    { text: 'Average 4.5 yards per carry', stat: 'ypc', target: 4.5, xp: 120, trust: 3 },
    { text: 'No fumbles', stat: 'noTO', target: 0, xp: 110, trust: 4 },
    { text: 'Score a touchdown', stat: 'rushTD', target: 1, xp: 150, trust: 2 },
  ],
  WR: [
    { text: 'Catch 5 passes', stat: 'rec', target: 5, xp: 120, trust: 3 },
    { text: 'Gain 70+ receiving yards', stat: 'recYds', target: 70, xp: 130, trust: 3 },
    { text: 'No drops', stat: 'drops', target: 0, xp: 100, trust: 3 },
    { text: 'Score a receiving touchdown', stat: 'recTD', target: 1, xp: 150, trust: 2 },
  ],
  TE: [
    { text: 'Catch 4 passes', stat: 'rec', target: 4, xp: 120, trust: 3 },
    { text: 'Gain 45+ receiving yards', stat: 'recYds', target: 45, xp: 120, trust: 3 },
    { text: 'No drops', stat: 'drops', target: 0, xp: 100, trust: 3 },
    { text: 'Earn a 70+ game grade', stat: 'grade', target: 70, xp: 120, trust: 3 },
  ],
  OL: [
    { text: 'Allow zero sacks', stat: 'sacksAllowed', target: 0, xp: 150, trust: 4 },
    { text: 'Earn a 70+ game grade', stat: 'grade', target: 70, xp: 140, trust: 3 },
    { text: 'Record a pancake block', stat: 'pancakes', target: 1, xp: 120, trust: 2 },
  ],
  DL: [
    { text: 'Record a sack', stat: 'sacks', target: 1, xp: 160, trust: 3 },
    { text: 'Make 4 tackles', stat: 'tackles', target: 4, xp: 120, trust: 3 },
    { text: 'Record a tackle for loss', stat: 'tfl', target: 1, xp: 130, trust: 3 },
  ],
  LB: [
    { text: 'Make 6 tackles', stat: 'tackles', target: 6, xp: 130, trust: 3 },
    { text: 'Record a tackle for loss', stat: 'tfl', target: 1, xp: 130, trust: 3 },
    { text: 'Earn a 70+ game grade', stat: 'grade', target: 70, xp: 120, trust: 3 },
  ],
  DB: [
    { text: 'Break up a pass', stat: 'pbu', target: 1, xp: 130, trust: 3 },
    { text: 'Make 4 tackles', stat: 'tackles', target: 4, xp: 120, trust: 3 },
    { text: 'Record an interception', stat: 'ints', target: 1, xp: 180, trust: 3 },
    { text: 'Earn a 70+ game grade', stat: 'grade', target: 70, xp: 120, trust: 3 },
  ],
  K: [
    { text: 'Make every kick', stat: 'fgM', target: -1, xp: 150, trust: 4 },
    { text: 'Make a 40+ yard field goal', stat: 'fgLong', target: 40, xp: 150, trust: 3 },
  ],
  P: [
    { text: 'Pin a punt inside the 20', stat: 'puntIn20', target: 1, xp: 140, trust: 3 },
    { text: 'Average 44+ yards per punt', stat: 'puntYds', target: 44, xp: 140, trust: 3 },
  ],
};

const SEASON_OBJ: Record<string, Tpl[]> = {
  QB: [{ text: 'Throw for 3,500 yards', stat: 'passYds', target: 3500, xp: 1500, trust: 8 }, { text: 'Throw 25 touchdown passes', stat: 'passTD', target: 25, xp: 1500, trust: 8 }],
  RB: [{ text: 'Rush for 1,000 yards', stat: 'rushYds', target: 1000, xp: 1500, trust: 8 }, { text: 'Score 10 rushing touchdowns', stat: 'rushTD', target: 10, xp: 1300, trust: 6 }],
  WR: [{ text: 'Gain 1,000 receiving yards', stat: 'recYds', target: 1000, xp: 1500, trust: 8 }, { text: 'Catch 8 touchdown passes', stat: 'recTD', target: 8, xp: 1300, trust: 6 }],
  TE: [{ text: 'Gain 650 receiving yards', stat: 'recYds', target: 650, xp: 1400, trust: 8 }, { text: 'Catch 6 touchdown passes', stat: 'recTD', target: 6, xp: 1200, trust: 6 }],
  OL: [{ text: 'Allow 3 or fewer sacks', stat: 'sacksAllowed', target: 3, xp: 1500, trust: 8 }, { text: 'Start 14 games', stat: 'gs', target: 14, xp: 1200, trust: 6 }],
  DL: [{ text: 'Record 8 sacks', stat: 'sacks', target: 8, xp: 1500, trust: 8 }, { text: 'Make 12 tackles for loss', stat: 'tfl', target: 12, xp: 1200, trust: 6 }],
  LB: [{ text: 'Make 100 tackles', stat: 'tackles', target: 100, xp: 1500, trust: 8 }, { text: 'Force 3 turnovers', stat: 'ff', target: 3, xp: 1200, trust: 6 }],
  DB: [{ text: 'Intercept 4 passes', stat: 'ints', target: 4, xp: 1500, trust: 8 }, { text: 'Break up 10 passes', stat: 'pbu', target: 10, xp: 1200, trust: 6 }],
  K: [{ text: 'Make 85% of field goals', stat: 'fgM', target: 85, xp: 1500, trust: 8 }],
  P: [{ text: 'Pin 20 punts inside the 20', stat: 'puntIn20', target: 20, xp: 1400, trust: 8 }],
};

export const objGroup = (p: Player) => (['DE', 'DT'].includes(p.pos) ? 'DL' : ['CB', 'S'].includes(p.pos) ? 'DB' : p.pos);

export function makeGameObjectives(rng: Rng, p: Player, role: Role): Objective[] {
  const pool = GAME_OBJ[objGroup(p)] ?? [];
  const pick = rng.shuffle(pool.slice()).slice(0, 2);
  const scale = role === 'ST' ? 1 : role === 'RT' ? 0.6 : 0.35;
  const out: Objective[] = pick.map((t, i) => ({
    ...t,
    id: `g${i}`,
    scope: 'game',
    target: ['passYds', 'rushYds', 'recYds', 'rec', 'tackles'].includes(t.stat as string) ? Math.max(1, Math.round(t.target * scale)) : t.target,
  }));
  out.push({ id: 'win', text: 'Win the game', stat: 'win', target: 1, xp: 100, trust: 2, scope: 'game' });
  return out;
}

export function makeSeasonGoals(p: Player): Objective[] {
  return (SEASON_OBJ[objGroup(p)] ?? []).map((t, i) => ({ ...t, id: `s${i}`, scope: 'season' }));
}

/** Evaluate a game objective against a stat line. */
export function evalObjective(o: Objective, line: StatLine, ctx: { won: boolean; grade: number; played: boolean }): boolean {
  if (!ctx.played && o.stat !== 'win') return false;
  const v = (k: keyof StatLine) => (line[k] as number | undefined) ?? 0;
  switch (o.stat) {
    case 'win': return ctx.won;
    case 'grade': return ctx.grade >= o.target;
    case 'noTO': return v('passInt') + v('fumblesLost') === 0 && (v('passAtt') + v('rushAtt') + v('rec') > 0);
    case 'cmpPct': return v('passAtt') >= 8 && (v('passCmp') / v('passAtt')) * 100 >= o.target;
    case 'ypc': return v('rushAtt') >= 6 && v('rushYds') / v('rushAtt') >= o.target;
    case 'drops': return v('drops') === 0 && v('targets') >= 2;
    case 'sacksAllowed': return v('sacksAllowed') <= o.target;
    case 'fgM': return o.target < 0 ? v('fgA') + v('xpA') > 0 && v('fgM') === v('fgA') && v('xpM') === v('xpA') : v('fgM') >= o.target;
    case 'puntYds': return v('punts') > 0 && v('puntYds') / v('punts') >= o.target;
    default: return v(o.stat as keyof StatLine) >= o.target;
  }
}

export function seasonProgress(o: Objective, line: StatLine): number {
  const v = (k: keyof StatLine) => (line[k] as number | undefined) ?? 0;
  if (o.stat === 'fgM') return v('fgA') ? Math.round((v('fgM') / v('fgA')) * 100) : 0;
  if (o.stat === 'sacksAllowed') return v('sacksAllowed');
  return v(o.stat as keyof StatLine);
}

export function seasonGoalMet(o: Objective, line: StatLine): boolean {
  const v = seasonProgress(o, line);
  if (o.stat === 'sacksAllowed') return (line.gs ?? 0) >= 10 && v <= o.target;
  if (o.stat === 'fgM') return (line.fgA ?? 0) >= 15 && v >= o.target;
  return v >= o.target;
}
