// 32 original fictional franchises. Cities and colour palettes evoke the
// familiar pro-football map; names, emblems and identities are original.

export type EmblemShape = 'shield' | 'circle' | 'diamond' | 'hex' | 'star' | 'chevron';

export interface TeamDef {
  id: number;
  city: string;
  name: string;
  abbr: string;
  conf: 0 | 1; // 0 = Liberty Conference, 1 = Frontier Conference
  div: 0 | 1 | 2 | 3; // East, North, South, West
  primary: string;
  secondary: string;
  accent: string;
  stadium: string;
  dome: boolean;
  emblem: { shape: EmblemShape; glyph: string };
  offense: 'Air Raid' | 'West Coast' | 'Power Run' | 'Spread' | 'Pro Style' | 'Option';
  defense: '4-3 Attack' | '3-4 Pressure' | 'Cover 2' | 'Cover 3' | 'Man Blitz';
  history: string;
  rivals: number[];
  lighting: 'day' | 'dusk' | 'night';
}

export const CONFERENCES = ['Liberty Conference', 'Frontier Conference'];
export const CONF_ABBR = ['LC', 'FC'];
export const DIVISIONS = ['East', 'North', 'South', 'West'];
export const LEAGUE_NAME = 'American Gridiron League';
export const LEAGUE_ABBR = 'AGL';
export const CHAMPIONSHIP_NAME = 'Crown Bowl';

const T = (
  id: number, city: string, name: string, abbr: string, conf: 0 | 1, div: 0 | 1 | 2 | 3,
  primary: string, secondary: string, accent: string, stadium: string, dome: boolean,
  shape: EmblemShape, glyph: string, offense: TeamDef['offense'], defense: TeamDef['defense'],
  history: string, rivals: number[], lighting: TeamDef['lighting'] = 'day',
): TeamDef => ({ id, city, name, abbr, conf, div, primary, secondary, accent, stadium, dome, emblem: { shape, glyph }, offense, defense, history, rivals, lighting });

export const TEAMS: TeamDef[] = [
  // Liberty East
  T(0, 'Buffalo', 'Blizzard', 'BUF', 0, 0, '#00338D', '#C60C30', '#FFFFFF', 'Lakeshore Field', false, 'shield', 'B', 'Pro Style', '4-3 Attack',
    'Born in the snow belt, the Blizzard built a reputation for playing their best football when the weather turns brutal.', [1, 2]),
  T(1, 'Miami', 'Riptide', 'MIA', 0, 0, '#008E97', '#FC4C02', '#FFFFFF', 'Biscayne Bowl', false, 'circle', 'R', 'Spread', 'Cover 3',
    'Fast, flashy and sun-soaked, the Riptide pride themselves on speed at every position.', [0, 3], 'night'),
  T(2, 'New England', 'Colonials', 'NE', 0, 0, '#002244', '#C60C30', '#B0B7BC', 'Harborview Stadium', false, 'star', 'C', 'Pro Style', 'Cover 2',
    'A disciplined, no-nonsense franchise whose fans expect nothing less than playoff football.', [3, 0]),
  T(3, 'New York', 'Knights', 'NYK', 0, 0, '#125740', '#FFFFFF', '#000000', 'Meadowlands Arena', false, 'shield', 'K', 'West Coast', 'Man Blitz',
    'The Knights have spent decades chasing the glory of one legendary title run.', [1, 2], 'dusk'),
  // Liberty North
  T(4, 'Baltimore', 'Nightwings', 'BAL', 0, 1, '#241773', '#000000', '#9E7C0C', 'Inner Harbor Field', false, 'diamond', 'N', 'Option', '3-4 Pressure',
    'Known for punishing defenses and a quarterback room that can beat you with its legs.', [7, 5], 'night'),
  T(5, 'Cincinnati', 'Prowlers', 'CIN', 0, 1, '#FB4F14', '#000000', '#FFFFFF', 'Riverfront Den', false, 'hex', 'P', 'Air Raid', 'Cover 3',
    'The striped Prowlers turned a long rebuild into one of the most explosive offenses in the league.', [4, 6]),
  T(6, 'Cleveland', 'Hounds', 'CLE', 0, 1, '#311D00', '#FF3C00', '#FFFFFF', 'Lakefront Kennel', false, 'circle', 'H', 'Power Run', '4-3 Attack',
    'The Hounds have the loudest, most loyal fan base in the league, through every lean year.', [7, 5]),
  T(7, 'Pittsburgh', 'Ironmen', 'PIT', 0, 1, '#101820', '#FFB612', '#FFFFFF', 'Three Rivers Yard', false, 'hex', 'I', 'Power Run', '3-4 Pressure',
    'Blue-collar football forged in steel country. Defense first, defense always.', [4, 6], 'dusk'),
  // Liberty South
  T(8, 'Houston', 'Comets', 'HOU', 0, 2, '#03202F', '#A71930', '#FFFFFF', 'Launchpad Dome', true, 'star', 'C', 'Spread', 'Cover 2',
    'A young franchise with a sky-high ceiling and a roof to keep out the humidity.', [9, 11]),
  T(9, 'Indianapolis', 'Thunder', 'IND', 0, 2, '#002C5F', '#A2AAAD', '#FFFFFF', 'Crossroads Dome', true, 'chevron', 'T', 'West Coast', 'Cover 2',
    'Precision passing and a crowd that rattles the dome on third down.', [8, 10]),
  T(10, 'Jacksonville', 'Barracudas', 'JAX', 0, 2, '#006778', '#D7A22A', '#101820', 'Riverside Reef', false, 'diamond', 'J', 'Spread', 'Man Blitz',
    'Teal-and-gold upstarts with an aggressive identity on both sides of the ball.', [11, 9], 'night'),
  T(11, 'Tennessee', 'Sentinels', 'TEN', 0, 2, '#0C2340', '#4B92DB', '#C8102E', 'Cumberland Field', false, 'shield', 'S', 'Power Run', '4-3 Attack',
    'Hard-nosed, physical, and built around a bell-cow running game.', [8, 10]),
  // Liberty West
  T(12, 'Denver', 'Stampede', 'DEN', 0, 3, '#FB4F14', '#002244', '#FFFFFF', 'Summit Field', false, 'chevron', 'S', 'West Coast', '3-4 Pressure',
    'Mile-high air, thin oxygen and a defense that runs opponents into the ground.', [13, 14]),
  T(13, 'Kansas City', 'Blaze', 'KC', 0, 3, '#E31837', '#FFB81C', '#FFFFFF', 'Plains Stadium', false, 'circle', 'B', 'Air Raid', 'Cover 3',
    'The loudest open-air stadium in the league and a dynasty-minded front office.', [12, 14, 15], 'night'),
  T(14, 'Las Vegas', 'High Rollers', 'LV', 0, 3, '#000000', '#A5ACAF', '#FFFFFF', 'Desert Jewel Dome', true, 'diamond', 'HR', 'Pro Style', 'Man Blitz',
    'Silver and black renegades who embrace the villain role wherever they travel.', [13, 12], 'night'),
  T(15, 'Los Angeles', 'Surf', 'LAS', 0, 3, '#0080C6', '#FFC20E', '#FFFFFF', 'Pacific Coast Park', false, 'chevron', 'LA', 'Spread', 'Cover 3',
    'Powder blue and lightning-quick, the Surf play a breezy, high-flying brand of football.', [13, 12], 'dusk'),
  // Frontier East
  T(16, 'Dallas', 'Wranglers', 'DAL', 1, 0, '#003594', '#869397', '#FFFFFF', 'Lone Star Palace', true, 'star', 'W', 'Pro Style', '4-3 Attack',
    'The richest, most-watched franchise in the league. Expectations are always sky high.', [17, 18, 19]),
  T(17, 'New York', 'Empire', 'NYE', 1, 0, '#0B2265', '#A71930', '#FFFFFF', 'Meadowlands Arena', false, 'shield', 'E', 'Pro Style', '4-3 Attack',
    'Old-school football royalty with a trophy case to match.', [16, 18]),
  T(18, 'Philadelphia', 'Founders', 'PHI', 1, 0, '#004C54', '#A5ACAF', '#000000', 'Liberty Bell Field', false, 'hex', 'F', 'Option', 'Man Blitz',
    'A rowdy, demanding city that loves its football gritty and its players fearless.', [16, 17, 19], 'night'),
  T(19, 'Washington', 'Statesmen', 'WAS', 1, 0, '#5A1414', '#FFB612', '#FFFFFF', 'Capitol Field', false, 'circle', 'W', 'West Coast', 'Cover 2',
    'Burgundy-and-gold tradition from the nation’s capital, now in the middle of a resurgence.', [16, 18]),
  // Frontier North
  T(20, 'Chicago', 'Gales', 'CHI', 1, 1, '#0B162A', '#C83803', '#FFFFFF', 'Lakefront Yard', false, 'chevron', 'G', 'Power Run', '4-3 Attack',
    'Wind off the lake, hard hits and defensive legends: that is Gales football.', [23, 22]),
  T(21, 'Detroit', 'Mechanics', 'DET', 1, 1, '#0076B6', '#B0B7BC', '#FFFFFF', 'Motor City Dome', true, 'hex', 'M', 'Power Run', 'Man Blitz',
    'A blue-collar rebuild that turned the Mechanics into one of the toughest outs in football.', [20, 22]),
  T(22, 'Green Bay', 'Lumberjacks', 'GB', 1, 1, '#203731', '#FFB612', '#FFFFFF', 'Frozen Pines Field', false, 'circle', 'L', 'West Coast', '3-4 Pressure',
    'Small market, giant legacy. Lumberjacks fans own a piece of the team and never let you forget it.', [20, 23]),
  T(23, 'Minnesota', 'Voyageurs', 'MIN', 1, 1, '#4F2683', '#FFC62F', '#FFFFFF', 'Northern Lights Dome', true, 'diamond', 'V', 'Air Raid', 'Cover 3',
    'Purple-clad explorers who play in the loudest dome north of the river.', [22, 20]),
  // Frontier South
  T(24, 'Atlanta', 'Firebirds', 'ATL', 1, 2, '#A71930', '#000000', '#A5ACAF', 'Peachtree Dome', true, 'star', 'F', 'Spread', 'Cover 3',
    'Rising from every setback, the Firebirds have an offense built for fireworks.', [26, 25]),
  T(25, 'Carolina', 'Copperheads', 'CAR', 1, 2, '#0085CA', '#101820', '#BFC0BF', 'Piedmont Pit', false, 'diamond', 'C', 'Pro Style', '4-3 Attack',
    'Coiled and dangerous, the Copperheads strike fast and rely on a ferocious pass rush.', [24, 27]),
  T(26, 'New Orleans', 'Krewe', 'NO', 1, 2, '#101820', '#D3BC8D', '#FFFFFF', 'Bayou Superdome', true, 'shield', 'K', 'West Coast', 'Man Blitz',
    'Every home game is a parade. Every road game is an invasion.', [24, 27], 'night'),
  T(27, 'Tampa Bay', 'Tarpons', 'TB', 1, 2, '#D50A0A', '#34302B', '#FF7900', 'Gulf Coast Stadium', false, 'hex', 'T', 'Air Raid', '3-4 Pressure',
    'The Tarpons leap and fight like the fish they are named for.', [26, 25]),
  // Frontier West
  T(28, 'Arizona', 'Scorpions', 'ARI', 1, 3, '#97233F', '#000000', '#FFB612', 'Sonoran Dome', true, 'chevron', 'S', 'Air Raid', 'Man Blitz',
    'Desert-tough and venomous on defense, with an offense that loves to sling it.', [30, 31]),
  T(29, 'Los Angeles', 'Stars', 'LAX', 1, 3, '#003594', '#FFA300', '#FFFFFF', 'Hollywood Park', false, 'star', 'LA', 'West Coast', '4-3 Attack',
    'Showtime football with a celebrity crowd and a habit of big fourth-quarter moments.', [31, 30], 'night'),
  T(30, 'San Francisco', 'Prospectors', 'SF', 1, 3, '#AA0000', '#B3995D', '#FFFFFF', 'Golden Gate Field', false, 'shield', 'P', 'West Coast', '4-3 Attack',
    'Gold-rush grit and a passing tradition that changed the sport.', [31, 29], 'dusk'),
  T(31, 'Seattle', 'Squall', 'SEA', 1, 3, '#002244', '#69BE28', '#A5ACAF', 'Puget Sound Field', false, 'circle', 'S', 'Spread', 'Cover 3',
    'Rain-soaked and deafening. Visiting offenses dread false-start city.', [30, 29], 'dusk'),
];

export const teamName = (id: number) => (id >= 0 ? `${TEAMS[id].city} ${TEAMS[id].name}` : 'Free Agent');
export const teamAbbr = (id: number) => (id >= 0 ? TEAMS[id].abbr : 'FA');
export const teamsInDiv = (conf: number, div: number) => TEAMS.filter((t) => t.conf === conf && t.div === div).map((t) => t.id);

export const COACH_FIRST = ['Bill', 'Andy', 'Sean', 'Kyle', 'Mike', 'John', 'Dan', 'Pete', 'Ron', 'Matt', 'Kevin', 'Todd', 'Brian', 'Frank', 'Doug', 'Gary', 'Hank', 'Lou', 'Vince', 'Wade', 'Raheem', 'DeMeco', 'Jerod', 'Antonio', 'Marcus', 'Luis', 'Curtis', 'Nate', 'Ray', 'Tom', 'Joe', 'Walt'];
export const COACH_LAST = ['Hollis', 'Barrett', 'McCarran', 'Shandler', 'Doyle', 'Haverford', 'Kincaid', 'Rowe', 'Pemberton', 'Galloway', 'Stroud', 'Whitlock', 'Ashby', 'Delacroix', 'Fairbanks', 'Mercer', 'Okafor', 'Brandt', 'Calloway', 'Vance', 'Thibodeaux', 'Ramsey', 'Easton', 'Lockhart', 'Quinlan', 'Sutter', 'Marlowe', 'Hightower', 'Corbin', 'Dunmore', 'Ellison', 'Whitaker'];
