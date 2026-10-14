// ---------------------------------------------------------------------------
// Shared data model for the league, career and save format.
// ---------------------------------------------------------------------------

export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DE' | 'DT' | 'LB' | 'CB' | 'S' | 'K' | 'P';

export type Attr =
  | 'spd' | 'acc' | 'agi' | 'str' | 'awr' | 'sta'
  | 'thp' | 'sac' | 'mac' | 'dac' | 'tor' | 'tup'
  | 'car' | 'btk' | 'jkm' | 'spm' | 'sfa'
  | 'cth' | 'cit' | 'rte' | 'rel' | 'jmp'
  | 'rbk' | 'pbk'
  | 'tak' | 'pow' | 'pur' | 'prc' | 'bsh' | 'pmv' | 'fmv' | 'mcv' | 'zcv'
  | 'kpw' | 'kac';

export type Attrs = Partial<Record<Attr, number>>;

export interface StatLine {
  gp?: number; gs?: number;
  passAtt?: number; passCmp?: number; passYds?: number; passTD?: number; passInt?: number; sacked?: number; passLong?: number;
  rushAtt?: number; rushYds?: number; rushTD?: number; rushLong?: number;
  targets?: number; rec?: number; recYds?: number; recTD?: number; drops?: number; recLong?: number;
  fumbles?: number; fumblesLost?: number;
  tackles?: number; tfl?: number; sacks?: number; ints?: number; pbu?: number; ff?: number; fr?: number; defTD?: number; intYds?: number;
  fgA?: number; fgM?: number; fgLong?: number; xpA?: number; xpM?: number;
  punts?: number; puntYds?: number; puntLong?: number; puntIn20?: number;
  kr?: number; krYds?: number; pr?: number; prYds?: number; retTD?: number;
  pancakes?: number; sacksAllowed?: number;
}
export type StatKey = keyof StatLine;

export interface Contract {
  years: number; // years remaining including current
  salary: number; // $M per season
  bonus: number; // signing bonus $M
  signed: number; // season signed
  incentive?: { stat: StatKey; target: number; bonus: number };
}

export type AwardKey =
  | 'MVP' | 'OPOY' | 'DPOY' | 'OROY' | 'DROY' | 'BEST_QB' | 'BEST_RB' | 'BEST_WR' | 'BEST_TE' | 'BEST_OL'
  | 'BEST_DL' | 'BEST_LB' | 'BEST_DB' | 'BEST_K' | 'ALLSTAR' | 'CHAMPION' | 'FINAL_MVP' | 'CONF_CHAMP';

export interface Award {
  key: AwardKey;
  season: number;
}

export interface Appearance {
  skin: number; // index into skin tones
  face: number;
  hair: number;
  hairColor: number;
  facialHair: number;
  body: number; // 0 slim .. 3 heavy
  helmet: number; // facemask style
  visor: number; // 0 none
  gloves: number; // color index
  cleats: number;
  sleeves: number; // 0 none, 1 short arm sleeve, 2 long sleeves
  accessories: { eyeBlack: boolean; wristbands: boolean; towel: boolean; neckRoll: boolean };
}

export interface Player {
  id: string;
  first: string;
  last: string;
  pos: Pos;
  age: number;
  num: number;
  ht: number;
  wt: number;
  attrs: Attrs;
  ovr: number;
  pot: number;
  teamId: number; // -1 = free agent
  contract: Contract;
  yearsPro: number;
  stats: Record<number, StatLine>;
  post: Record<number, StatLine>;
  awards: Award[];
  archetype?: string;
  user?: boolean;
  college?: string;
  draft?: { season: number; round: number; pick: number; teamId: number };
  injury?: number; // weeks remaining
  seasonsWith?: number[]; // team ids by career season (user)
}

export interface Game {
  id: string;
  season: number;
  week: number; // preseason weeks are negative, playoffs 101..104
  home: number;
  away: number;
  hs: number;
  as: number;
  played: boolean;
  ot?: boolean;
  round?: number; // playoff round 1..4
  preseason?: boolean;
  userGame?: boolean;
  topPerformers?: string[];
}

export interface NewsItem {
  id: number;
  season: number;
  week: number;
  title: string;
  body: string;
  kind: 'game' | 'user' | 'league' | 'award' | 'contract' | 'record' | 'draft';
}

export interface RecordEntry {
  value: number;
  playerId: string;
  name: string;
  teamId: number;
  season: number;
}
export type RecordScope = 'game' | 'season' | 'career' | 'playoffGame';
export interface Records {
  game: Partial<Record<StatKey, RecordEntry>>;
  season: Partial<Record<StatKey, RecordEntry>>;
  career: Partial<Record<StatKey, RecordEntry>>;
  playoffGame: Partial<Record<StatKey, RecordEntry>>;
  team: { mostWins?: RecordEntry; mostPointsGame?: RecordEntry };
}

export interface SeasonSummary {
  season: number;
  champion: number;
  runnerUp: number;
  awards: Partial<Record<AwardKey, string>>; // player id
  awardNames: Partial<Record<AwardKey, string>>;
  bestRecord: number;
}

export type DepthSlotKey =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'OT' | 'OG' | 'C' | 'DE' | 'DT' | 'LB' | 'CB' | 'S' | 'K' | 'P' | 'KR';

export interface TeamState {
  id: number;
  roster: string[];
  depth: Partial<Record<Pos, string[]>>;
  fanRep: number; // 0-100
  coach: string;
  history: { season: number; w: number; l: number; t: number; result: string }[];
  championships: number;
}

export type LeaguePhase = 'preseason' | 'regular' | 'playoffs' | 'offseason';

export interface League {
  version: number;
  season: number;
  seasonIndex: number;
  phase: LeaguePhase;
  week: number;
  players: Record<string, Player>;
  teams: TeamState[];
  schedule: Game[];
  records: Records;
  history: SeasonSummary[];
  news: NewsItem[];
  nextPid: number;
  nextNews: number;
  freeAgents: string[];
  hallOfFame: { id: string; name: string; pos: Pos; score: number; inducted: number }[];
  lastStandings?: number[][]; // final division ranks from previous season for scheduling
  seeds?: number[][]; // playoff seeds per conference (team ids, seed 1..7)
}

export type Difficulty = 'rookie' | 'pro' | 'allpro' | 'elite';
export type Role = 'PS' | 'BK' | 'RT' | 'ST';
export type CareerPhase =
  | 'combine'
  | 'draft'
  | 'season'
  | 'awards'
  | 'contract'
  | 'progression'
  | 'retired';

export interface Objective {
  id: string;
  text: string;
  stat: StatKey | 'win' | 'noTO' | 'cmpPct' | 'ypc' | 'grade';
  target: number;
  xp: number;
  trust: number;
  scope: 'game' | 'season';
  done?: boolean;
  failed?: boolean;
  progress?: number;
}

export interface ContractOffer {
  teamId: number;
  years: number;
  salary: number;
  bonus: number;
  projectedRole: Role;
  note: string;
  incentive?: Contract['incentive'];
}

export interface CareerEventChoice {
  label: string;
  detail: string;
  effects: { trust?: number; xp?: number; fatigue?: number; attr?: { attr: Attr; delta: number }; rep?: number; morale?: number };
}
export interface CareerEvent {
  id: string;
  title: string;
  body: string;
  choices: CareerEventChoice[];
}

export interface GameRecap {
  gameId: string;
  season: number;
  week: number;
  opp: number;
  home: boolean;
  us: number;
  them: number;
  line: StatLine;
  grade: number;
  xp: number;
  trustDelta: number;
  objectives: { text: string; done: boolean; xp: number }[];
  notes: string[];
  playoff?: boolean;
  preseason?: boolean;
  top?: { pid: string; name: string; team: number; pos: Pos; text: string }[];
  teamStats?: { us: { yds: number; pass: number; rush: number; to: number }; them: { yds: number; pass: number; rush: number; to: number } };
}

export interface Career {
  playerId: string;
  slot: number;
  created: number;
  startMode: 'rookie' | 'established';
  difficulty: Difficulty;
  quarterMinutes: number;
  level: number;
  xp: number;
  sp: number;
  abilities: string[];
  equipped: string[];
  trust: number;
  role: Role;
  reputation: number; // 0-100 league-wide reputation
  phase: CareerPhase;
  objectives: Objective[];
  seasonGoals: Objective[];
  trainingDoneWeek: number; // week index training last done (-999 none)
  appearance: Appearance;
  uniform: 'home' | 'alt' | 'classic';
  fatigue: number; // 0 fresh .. 100 exhausted
  morale: number;
  earnings: number;
  recaps: GameRecap[];
  decisions: { season: number; week: number; title: string; choice: string }[];
  pendingEvent?: CareerEvent;
  offers?: ContractOffer[];
  offerKind?: 'extension' | 'resign' | 'freeagency';
  milestones: string[];
  combineScore?: number;
  seasonLog: {
    season: number;
    teamId: number;
    age: number;
    ovr: number;
    role: Role;
    line: StatLine;
    post: StatLine;
    teamRecord: string;
    result: string;
    awards: AwardKey[];
    salary: number;
  }[];
  olSlot?: 'OT' | 'OG';
  retiredSummary?: RetirementSummary;
  wantsTeamId?: number;
  eventsSeen: string[];
}

export interface RetirementSummary {
  seasons: number;
  teams: number[];
  games: number;
  career: StatLine;
  awards: Award[];
  championships: number;
  earnings: number;
  records: string[];
  bestSeason: number;
  legacyScore: number;
  tier: string;
  finalOvr: number;
}

export interface Settings {
  difficulty: Difficulty;
  quarterMinutes: number;
  sound: boolean;
  volume: number;
  graphics: 'low' | 'medium' | 'high';
  camera: 'broadcast' | 'chase' | 'wide';
  controlScale: number;
  leftHanded: boolean;
  showGuide: boolean;
  keys: Record<string, string>;
  autoContinue: boolean;
  playSpeed: number;
}

export interface SaveFile {
  version: number;
  slot: number;
  updated: number;
  name: string;
  career: Career;
  league: League;
}
