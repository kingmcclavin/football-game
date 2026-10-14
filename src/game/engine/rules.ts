import type { StatLine } from '../../core/types';
import { TEAMS } from '../../data/teams';
import type { PlayLog, PlayOutcome, StatEvent } from './types';

export type GamePhase = 'kickoff' | 'play' | 'pat' | 'final';

export interface GameState {
  home: number;
  away: number;
  score: [number, number];
  quarter: number;
  clock: number;
  quarterLen: number;
  poss: 0 | 1; // 0 = home has the ball (or is kicking during kickoff)
  ballOn: number;
  down: number;
  toGo: number;
  hashY: number;
  phase: GamePhase;
  clockRunning: boolean;
  timeouts: [number, number];
  openingKicker: 0 | 1;
  twoMinWarned: boolean;
  kickFrom: number; // kickoff spot (kicking team coords)
  playoff: boolean;
  ot: { active: boolean; possStarted: number; possEnded: [number, number]; sudden: boolean };
  log: PlayLog[];
  box: Record<string, StatLine>;
  over: boolean;
  drive: { team: 0 | 1; start: number; plays: number; yards: number; startClock: number; startQ: number };
  lastDrives: { team: number; plays: number; yards: number; result: string; time: number }[];
  quarterScores: [number[], number[]];
}

export const FIELD_W = 53.333;
export const HASH_L = 29.75;
export const HASH_R = 23.583;
export const MID_Y = FIELD_W / 2;

export function newGame(home: number, away: number, quarterMinutes: number, playoff: boolean, openingKicker: 0 | 1): GameState {
  return {
    home, away,
    score: [0, 0],
    quarter: 1,
    clock: quarterMinutes * 60,
    quarterLen: quarterMinutes * 60,
    poss: openingKicker,
    ballOn: 35,
    down: 1,
    toGo: 10,
    hashY: MID_Y,
    phase: 'kickoff',
    clockRunning: false,
    timeouts: [3, 3],
    openingKicker,
    twoMinWarned: false,
    kickFrom: 35,
    playoff,
    ot: { active: false, possStarted: 0, possEnded: [0, 0], sudden: false },
    log: [],
    box: {},
    over: false,
    drive: { team: openingKicker === 0 ? 1 : 0, start: 25, plays: 0, yards: 0, startClock: quarterMinutes * 60, startQ: 1 },
    lastDrives: [],
    quarterScores: [[0], [0]],
  };
}

export const teamOf = (g: GameState, side: 0 | 1) => (side === 0 ? g.home : g.away);
export const possTeam = (g: GameState) => teamOf(g, g.poss);
export const defTeam = (g: GameState) => teamOf(g, (1 - g.poss) as 0 | 1);
export const sideOfTeam = (g: GameState, teamId: number): 0 | 1 => (g.home === teamId ? 0 : 1);

export function addStats(box: Record<string, StatLine>, events: StatEvent[]) {
  for (const e of events) {
    const line = (box[e.pid] ??= {});
    const cur = (line[e.key] as number | undefined) ?? 0;
    (line as Record<string, number>)[e.key] = e.max ? Math.max(cur, e.v) : cur + e.v;
  }
}

export function fieldPosLabel(g: GameState, ballOn = g.ballOn): string {
  const off = TEAMS[possTeam(g)].abbr;
  const def = TEAMS[defTeam(g)].abbr;
  if (ballOn === 50) return 'MID 50';
  return ballOn < 50 ? `${off} ${Math.round(ballOn)}` : `${def} ${Math.round(100 - ballOn)}`;
}

export function downLabel(g: GameState): string {
  if (g.phase === 'kickoff') return 'Kickoff';
  if (g.phase === 'pat') return 'PAT';
  const d = ['1st', '2nd', '3rd', '4th'][g.down - 1] ?? `${g.down}th`;
  const togo = g.ballOn + g.toGo >= 100 ? 'Goal' : g.toGo < 1 ? 'Inches' : `${Math.round(g.toGo)}`;
  return `${d} & ${togo}`;
}

export const isTwoMinute = (g: GameState) => (g.quarter === 2 || g.quarter === 4) && g.clock <= 120;
const isLateHalf = (g: GameState) => (g.quarter === 2 && g.clock <= 120) || (g.quarter >= 4 && g.clock <= 300);

/** Seconds that run off between plays when the clock is running. */
export function runoffSeconds(g: GameState, hurry: boolean): number {
  if (!g.clockRunning) return 0;
  return hurry ? 12 : 31;
}

/** Called right before the snap: run the clock between plays. */
export function applyRunoff(g: GameState, hurry: boolean) {
  if (g.phase !== 'play') return;
  let r = runoffSeconds(g, hurry);
  // Two-minute warning stops the clock.
  if ((g.quarter === 2 || g.quarter === 4) && !g.twoMinWarned && g.clock > 120 && g.clock - r <= 120) {
    r = g.clock - 120;
    g.twoMinWarned = true;
    g.clock -= r;
    g.clockRunning = false;
    pushLog(g, 'Two-minute warning.');
    return;
  }
  g.clock = Math.max(0, g.clock - r);
}

export function callTimeout(g: GameState, side: 0 | 1): boolean {
  if (g.timeouts[side] <= 0 || !g.clockRunning) return false;
  g.timeouts[side]--;
  g.clockRunning = false;
  pushLog(g, `Timeout, ${TEAMS[teamOf(g, side)].name}.`);
  return true;
}

function pushLog(g: GameState, text: string, scoring = false) {
  g.log.push({ q: g.quarter, clock: g.clock, poss: possTeam(g), down: g.down, toGo: g.toGo, ballOn: g.ballOn, text, scoring, score: [g.score[0], g.score[1]] });
  if (g.log.length > 400) g.log.shift();
}

function addScore(g: GameState, side: 0 | 1, pts: number) {
  g.score[side] += pts;
  const qi = Math.min(g.quarter, 5) - 1;
  while (g.quarterScores[side].length <= qi) g.quarterScores[side].push(0);
  g.quarterScores[side][qi] += pts;
}

function endDrive(g: GameState, result: string) {
  const d = g.drive;
  const elapsed = d.startQ === g.quarter ? d.startClock - g.clock : d.startClock + (g.quarterLen - g.clock);
  g.lastDrives.push({ team: teamOf(g, d.team), plays: d.plays, yards: d.yards, result, time: Math.max(0, elapsed) });
  if (g.lastDrives.length > 40) g.lastDrives.shift();
  if (g.ot.active) {
    g.ot.possEnded[d.team]++;
  }
}

function startDrive(g: GameState, side: 0 | 1) {
  g.drive = { team: side, start: g.ballOn, plays: 0, yards: 0, startClock: g.clock, startQ: g.quarter };
  if (g.ot.active) g.ot.possStarted++;
}

function setFirstDown(g: GameState) {
  g.down = 1;
  g.toGo = Math.min(10, 100 - g.ballOn);
}

function setHash(g: GameState, y?: number) {
  if (y === undefined) return;
  g.hashY = Math.min(HASH_L, Math.max(HASH_R, y));
}

/** Check OT end conditions after a possession ends or points are scored. */
function checkOtEnd(g: GameState): boolean {
  if (!g.ot.active) return false;
  if (g.score[0] === g.score[1]) return false;
  const bothHad = g.ot.possEnded[0] >= 1 && g.ot.possEnded[1] >= 1;
  if (bothHad || g.ot.sudden) {
    g.over = true;
    g.phase = 'final';
    pushLog(g, 'Game over in overtime.', true);
    return true;
  }
  return false;
}

/**
 * Apply a play outcome to the game state: scoring, downs, possession,
 * clock and logging. This is the single authority on football rules.
 */
export function applyOutcome(g: GameState, o: PlayOutcome): void {
  if (g.over) return;
  const offSide = g.poss;
  const defSide = (1 - offSide) as 0 | 1;
  addStats(g.box, o.stats);

  // Clock: live action time.
  g.clock = Math.max(0, g.clock - o.duration);

  // ----- Penalties -----
  if (o.penalty && o.kind !== 'kickoff' && o.kind !== 'punt') {
    const p = o.penalty;
    const name = TEAMS[teamOf(g, p.against === 'off' ? offSide : defSide)].abbr;
    if (p.against === 'off') {
      const yards = Math.min(p.yards, Math.floor(g.ballOn / 2));
      g.ballOn -= yards;
      g.toGo += yards;
      pushLog(g, `PENALTY ${name}: ${p.name}, ${yards} yards. Replay ${['1st', '2nd', '3rd', '4th'][g.down - 1]} down.`);
    } else {
      let target = p.spot !== undefined ? Math.max(p.spot, g.ballOn + 1) : g.ballOn + p.yards;
      const maxGain = (100 - g.ballOn) / 2;
      if (p.spot === undefined && p.yards > maxGain) target = g.ballOn + maxGain;
      if (target >= 99) target = 99;
      const gained = target - g.ballOn;
      g.ballOn = target;
      if (p.autoFirst || gained >= g.toGo) setFirstDown(g);
      else g.toGo -= gained;
      pushLog(g, `PENALTY ${name}: ${p.name}, ${Math.round(gained)} yards.${p.autoFirst ? ' Automatic first down.' : ''}`);
    }
    g.clockRunning = false;
    checkQuarterEnd(g);
    return;
  }

  if (g.phase === 'pat') {
    if (o.kind === 'xp') {
      if (o.good) addScore(g, offSide, 1);
      pushLog(g, o.desc, !!o.good);
    } else {
      if (o.td && o.holder === 'off') {
        addScore(g, offSide, 2);
        pushLog(g, `${o.desc} Two-point conversion is GOOD.`, true);
      } else if (o.td && o.holder === 'def') {
        addScore(g, defSide, 2);
        pushLog(g, `${o.desc} Defensive two-point return!`, true);
      } else pushLog(g, `${o.desc} Two-point attempt fails.`);
    }
    if (checkOtEnd(g)) return;
    g.phase = 'kickoff';
    g.kickFrom = 35;
    g.clockRunning = false;
    checkQuarterEnd(g);
    return;
  }

  if (o.kind === 'kickoff' || o.kind === 'punt') {
    const kicker = offSide;
    const receiver = defSide;
    if (o.kind === 'punt') {
      g.drive.plays++;
      endDrive(g, 'Punt');
    }
    if (o.holder === 'def') {
      if (o.td) {
        g.poss = receiver;
        addScore(g, receiver, 6);
        startDrive(g, receiver);
        endDrive(g, 'Return TD');
        pushLog(g, o.desc, true);
        if (checkOtEnd(g)) return;
        g.phase = 'pat';
        g.ballOn = 98;
        g.hashY = MID_Y;
        g.clockRunning = false;
        return;
      }
      g.poss = receiver;
      g.ballOn = o.touchback ? (o.kind === 'kickoff' ? 30 : 20) : Math.min(99, Math.max(1, 100 - o.endX));
      setHash(g, o.endY !== undefined ? FIELD_W - o.endY : undefined);
      setFirstDown(g);
      g.phase = 'play';
      startDrive(g, receiver);
      pushLog(g, o.desc);
      if (o.kind === 'punt' && checkOtEnd(g)) return;
    } else {
      // Kicking team recovered (muff / onside).
      g.poss = kicker;
      g.ballOn = Math.min(99, o.endX);
      setFirstDown(g);
      g.phase = 'play';
      startDrive(g, kicker);
      pushLog(g, `${o.desc} Recovered by the kicking team!`);
    }
    g.clockRunning = o.kind === 'kickoff' ? false : !o.stopClock && !o.touchback;
    checkQuarterEnd(g);
    return;
  }

  if (o.kind === 'fg') {
    g.drive.plays++;
    if (o.good) {
      addScore(g, offSide, 3);
      endDrive(g, 'Field Goal');
      pushLog(g, o.desc, true);
      if (checkOtEnd(g)) return;
      if (g.ot.active && g.ot.sudden) return;
      g.phase = 'kickoff';
      g.kickFrom = 35;
    } else {
      endDrive(g, 'Missed FG');
      pushLog(g, o.desc);
      g.poss = defSide;
      g.ballOn = Math.max(20, 100 - (g.ballOn - 7));
      setFirstDown(g);
      startDrive(g, defSide);
      if (checkOtEnd(g)) return;
    }
    g.clockRunning = false;
    checkQuarterEnd(g);
    return;
  }

  if (o.kind === 'kneel' || o.kind === 'spike') {
    g.drive.plays++;
    if (o.kind === 'kneel') {
      g.ballOn = Math.max(1, g.ballOn - 1);
      g.toGo += 1;
      g.clockRunning = true;
    } else g.clockRunning = false;
    g.down++;
    pushLog(g, o.desc);
    if (g.down > 4) turnoverOnDowns(g);
    checkQuarterEnd(g);
    return;
  }

  // ----- Scrimmage plays -----
  g.drive.plays++;
  const startBall = g.ballOn;

  if (o.safety) {
    // Ball carrier downed in their own end zone.
    const conceding = o.holder === 'off' ? offSide : defSide;
    const scoring = (1 - conceding) as 0 | 1;
    addScore(g, scoring, 2);
    endDrive(g, 'Safety');
    pushLog(g, `${o.desc} SAFETY!`, true);
    if (checkOtEnd(g)) return;
    g.poss = conceding;
    g.phase = 'kickoff';
    g.kickFrom = 20;
    g.clockRunning = false;
    checkQuarterEnd(g);
    return;
  }

  if (o.td) {
    const scoring = o.holder === 'off' ? offSide : defSide;
    addScore(g, scoring, 6);
    if (o.holder === 'off') g.drive.yards += 100 - startBall;
    endDrive(g, o.holder === 'off' ? 'Touchdown' : o.kind === 'interception' ? 'Interception' : 'Fumble');
    pushLog(g, `${o.desc} TOUCHDOWN ${TEAMS[teamOf(g, scoring)].name}!`, true);
    g.poss = scoring;
    if (checkOtEnd(g)) return;
    g.phase = 'pat';
    g.ballOn = 98;
    g.down = 1;
    g.toGo = 2;
    g.hashY = MID_Y;
    g.clockRunning = false;
    return;
  }

  if (o.holder === 'def') {
    // Turnover during the play.
    endDrive(g, o.kind === 'interception' ? 'Interception' : 'Fumble');
    g.poss = defSide;
    if (o.endX >= 100 || o.touchback) g.ballOn = 20;
    else g.ballOn = Math.min(99, Math.max(1, 100 - o.endX));
    setHash(g, o.endY !== undefined ? FIELD_W - o.endY : undefined);
    setFirstDown(g);
    startDrive(g, defSide);
    g.clockRunning = false;
    pushLog(g, o.desc);
    if (checkOtEnd(g)) return;
    checkQuarterEnd(g);
    return;
  }

  const newBall = Math.min(99.5, o.endX);
  const gained = newBall - startBall;
  g.drive.yards += gained;
  g.ballOn = Math.max(0.5, newBall);
  setHash(g, o.endY);
  const timeoutClockStop = o.stopClock || (o.oob && isLateHalf(g));
  g.clockRunning = !timeoutClockStop;
  if (gained >= g.toGo - 1e-6) {
    setFirstDown(g);
    pushLog(g, `${o.desc} FIRST DOWN.`);
  } else {
    g.down++;
    g.toGo = Math.max(0.5, g.toGo - gained);
    pushLog(g, o.desc);
    if (g.down > 4) turnoverOnDowns(g);
  }
  checkQuarterEnd(g);
}

function turnoverOnDowns(g: GameState) {
  endDrive(g, 'Downs');
  const off = g.poss;
  g.poss = (1 - off) as 0 | 1;
  g.ballOn = Math.min(99, Math.max(1, 100 - g.ballOn));
  setFirstDown(g);
  startDrive(g, g.poss);
  g.clockRunning = false;
  pushLog(g, 'Turnover on downs.');
  checkOtEnd(g);
}

/** Handles quarter/half/game transitions when the clock reads 0:00. */
export function checkQuarterEnd(g: GameState) {
  if (g.over || g.clock > 0) return;
  if (g.phase === 'pat') return; // try is still attempted
  const q = g.quarter;
  if (q === 1 || q === 3) {
    g.quarter++;
    g.clock = g.quarterLen;
    g.twoMinWarned = false;
    pushLog(g, `End of ${q === 1 ? '1st' : '3rd'} quarter.`);
    return;
  }
  if (q === 2) {
    endDrive(g, 'End of Half');
    g.quarter = 3;
    g.clock = g.quarterLen;
    g.twoMinWarned = false;
    g.timeouts = [3, 3];
    g.phase = 'kickoff';
    g.kickFrom = 35;
    g.poss = (1 - g.openingKicker) as 0 | 1;
    g.clockRunning = false;
    pushLog(g, 'Halftime.');
    return;
  }
  // End of regulation or an overtime period.
  if (g.score[0] !== g.score[1] || (!g.playoff && q >= 5)) {
    if (g.phase === 'play') endDrive(g, 'End of Game');
    g.over = true;
    g.phase = 'final';
    pushLog(g, g.score[0] === g.score[1] ? 'Final: the game ends in a tie.' : 'Final.', true);
    return;
  }
  // Overtime.
  g.quarter++;
  const otLen = g.playoff ? g.quarterLen : Math.round((g.quarterLen * 2) / 3);
  g.clock = otLen;
  g.twoMinWarned = true;
  g.timeouts = [2, 2];
  g.phase = 'kickoff';
  g.kickFrom = 35;
  g.poss = q === 4 ? g.openingKicker : ((1 - g.poss) as 0 | 1);
  g.clockRunning = false;
  if (!g.ot.active) {
    g.ot = { active: true, possStarted: 0, possEnded: [0, 0], sudden: false };
  } else g.ot.sudden = true;
  pushLog(g, 'Overtime!');
}

/** Called after OT possessions to flip into sudden death once both have had the ball. */
export function updateOtSudden(g: GameState) {
  if (g.ot.active && g.ot.possEnded[0] >= 1 && g.ot.possEnded[1] >= 1) g.ot.sudden = true;
}
