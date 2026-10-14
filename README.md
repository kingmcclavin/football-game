# Gridiron Legacy

A browser-based American football **career mode** game. Create a player, get drafted, fight for a roster spot, play your own snaps in real-time 3D, develop your skills, sign contracts and chase a Hall of Fame career across as many seasons as you like.

It is a static web app (TypeScript + React + Three.js, built with Vite). There is no backend, no account and no paid API. Saves live in the browser (IndexedDB). It runs in Safari on iPhone and iPad as well as on desktop browsers.

All 32 teams, players, logos and names are fictional. Cities and colour palettes are familiar, but there are no real-league trademarks, logos, likenesses or copied assets.

---

## Quick start

Requirements: Node.js 18+ (20 or 22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the static site into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm test` | Runs the unit/integration test suite (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run e2e` | Browser smoke test with Playwright (needs a running `npm run preview` or `npm run dev`; see below) |

### Playing on an iPhone or iPad during development

Run `npm run dev -- --host`, then open the printed network URL (for example `http://192.168.1.20:5173`) in Safari on a device on the same Wi-Fi network. For the best experience, use "Share → Add to Home Screen" so the game runs full screen, and play in landscape.

---

## Deploying

The build output is a fully static site in `dist/` with relative asset paths, so it can be hosted from any domain or sub-path.

**Vercel:** import the repository; `vercel.json` already sets `npm run build` and `dist`. Or run `npx vercel` from the project folder.

**Netlify:** import the repository; `netlify.toml` sets the build command and publish directory. Or drag-and-drop the `dist/` folder into the Netlify dashboard.

**GitHub Pages / any static host:** run `npm run build` and upload the contents of `dist/`.

No environment variables or server configuration are needed.

---

## How to play

1. **Create a player.** Choose one of 12 positions and an archetype, customize your look and gear in a live 3D preview, set height, weight and number. *Quick Start* skips straight to an established prospect.
2. **Start your career.** *Rookie Prospect* runs a combine drill that decides your draft slot and starts you near the bottom of the depth chart. *Established Prospect* starts closer to a starting job. Pick your team or enter a randomized draft.
3. **The weekly loop.** The career hub always shows the next activity: optional weekly training (a short, scored 3D drill or a recovery day), then game day. Career decision events pop up between some weeks.
4. **Game day.** You play your own snaps in 3D. Snaps when you are on the sideline are simulated and summarized. How many snaps you get depends on your role (Practice Squad, Backup, Rotation, Starter), garbage time and preseason auditions.
5. **Progress.** Games, objectives, drills, milestones and awards give XP. Levels give skill points for attributes and unlockable abilities. Coach trust (performance, ball security, objectives, wins) moves you up the depth chart, unlocks audibles (QB, trust 60+) and play requests (trust 70+).
6. **Seasons.** 3 preseason games, a 17-week regular season against a real divisional formula, a 14-team playoff bracket and the **Crown Bowl**. Awards are computed from real stats and team success.
7. **Offseason.** Contract extensions, re-signing or free agency with competing offers (salary, bonus, projected role, team quality, scheme, incentives). The league ages, retires players, drafts rookies and builds a new schedule. Play as many seasons as you like, then retire for a career retrospective and Hall of Fame verdict.

### Controls

**Touch (phones / tablets):** touch and drag anywhere on the left side of the screen for a floating joystick (push fully to sprint). Contextual buttons appear on the right. As QB, each eligible receiver has a coloured button (green = open, yellow = tight, red = covered): tap for a touch pass, hold to charge a bullet; push the stick while releasing to lead the receiver. Kicks use a three-tap meter (aim, power, accuracy). Control size and a left-handed layout are in Settings. Browser scrolling and zooming are disabled during play.

**Keyboard:** WASD / arrows move, Shift sprints, Space snaps/continues/locks the kick meter, 1-5 (hold and release) throw to receivers, J juke, K spin, L stiff arm, U dive, R protect the ball, E context action (catch / tackle / shed / punch / fair catch), Q swat, T throw away, C camera, Esc pause. Every key can be remapped in Settings.

---

## Implemented features

**Football gameplay (real-time 3D)**
- Regulation field with yard lines, numbers, hash marks, end zones painted with the home team name, goalposts, line of scrimmage and first-down line.
- 22 animated, low-poly players (run, stance, throw, catch, block, juke, spin, stiff arm, dive, tackle, celebrate) and a physical ball with real projectile flight.
- Full rules engine: downs and distance, first downs, touchdowns, PATs and 2-point tries, field goals, safeties (and the free kick), punts, kickoffs and touchbacks, interceptions, fumbles and recoveries, out of bounds, turnover on downs, game clock with accelerated runoff, two-minute warning, timeouts, halftime, overtime (both teams guaranteed a possession, playoff OT continues), and penalties (false start, offside, holding, defensive holding, pass interference).
- Passing model: throw power and arm-strength range, touch vs bullet, lead placement, accuracy by distance (short/medium/deep ratings), pressure and throwing-on-the-run penalties, receiver separation, contested catches, drops, deflections and interceptions.
- Running: hole-based run plays, cutbacks, acceleration and agility-limited cuts, break-tackle checks, jukes/spins/stiff arms with timing windows, ball protection, fumbles.
- Blocking: pass protection assignments matched to rushers, run blocking that drives defenders away from the hole, lead blockers, double teams, pancakes; rushers shed blocks based on power/finesse vs blocking ratings.
- Defense: man coverage with reaction lag, zone coverage (Cover 0/1/2/2-Man/3/4) with landmarks, play-action bites, run reads, pursuit angles, dive tackles, hit-stick forced fumbles.
- Special teams: field goals and extra points with a kick meter, punts with directional aim, kickoffs, live kick and punt returns, fair catches, muffs, touchbacks.
- Pre-snap: play-call screen with formation filters and auto-generated play diagrams, coach's suggested call, play flipping, a defensive-shell read for quarterbacks (one/two-high safeties, press or off corners, blitz looks), audibles at the line (trust-gated), and a 25-second play clock with delay-of-game penalties.
- Cameras: broadcast (frames both the ball and your player), behind-the-player and wide, with ball tracking on passes. Halftime summary and drive summaries for snaps you sit out.

**Positions:** QB, RB, WR, TE, OL (guard or tackle), DE, DT, LB, CB, S, K and P are all playable in 3D, each with its own controls, objectives, drills and statistics. QB/RB/WR are the most polished.

**AI and difficulty:** AI quarterbacks read progressions and feature the user's receiver; AI coaches call plays by down, distance, field position, score, clock and team identity, decide fourth downs, two-point tries, kneels, spikes and timeouts. Difficulty (Rookie / Pro / All-Pro / Elite) changes reaction time, pursuit angles, coverage cushion, tackling technique, ball skills, block shedding and decision quality rather than inflating ratings.

**Career:** player creation with modular 3D appearance and gear (skin, face, hair, facial hair, body type, helmet/facemask, visor, gloves, cleats, sleeves, eye black, wristbands, towel, neck roll) that can be revisited later; 28 archetypes; XP, levels, position-specific attributes on a 0-99 scale, 28 abilities with measurable effects and limited equip slots; coach trust; reputation; fatigue; weekly and season objectives; career decision events (including requesting a trade when stuck on the bench); milestones; depth-chart competition; contracts with salary, bonuses, incentives, extensions, re-signing and free agency; aging and decline; retirement with legacy tiers and a Hall of Fame.

**League:** 32 fictional teams in 2 conferences and 8 divisions with colours, emblems, stadiums (dome/open, day/dusk/night lighting, team-coloured seating and end zones), coaches, identities, histories and rivals; persistent players with ratings, ages, potential, contracts and stats; full-season simulation of every other game with consistent box scores; standings with tiebreakers; playoff seeding and bracket; awards (MVP, OPOY, DPOY, offensive/defensive ROY, position awards, All-Stars); single-game, single-season, career, playoff-game and team records; league news; player development, retirement, draft and free agency every offseason.

**Saves:** versioned save format in IndexedDB (localStorage fallback), three slots, continue / new / delete with confirmation, export and import as JSON, migration hook for future versions and graceful handling of corrupt or newer saves. The game saves after every game, training session, decision and season transition.

---

## Project structure

```
src/
  core/          types, seeded RNG, utilities, save system
  data/          teams, names, positions/archetypes/attributes, abilities, playbook
  league/        league generation, schedule, standings, season sim, awards, records, offseason
  career/        career layer: creation, weekly loop, XP/progression, objectives, events, contracts
  game/
    engine/      rules (GameState), PlaySim (3D play simulation), quick sim, AI coach, lineups, game loop
    render/      Three.js scene, stadium, field textures, modular player model
    input/       unified keyboard + touch input
    GameController.ts   one career game (3D snaps + simulated snaps + HUD state)
    DrillController.ts  position drills and the combine
  audio/         synthesized sound effects (no asset files)
  ui/            React screens, components, store
tests/           Vitest suites (rules, play sim, full games, seasons, careers, saves)
scripts/e2e.mjs  Playwright browser smoke test
docs/EXTENDING.md   how to add teams, players, plays, positions and career features
```

The simulation core (`src/game/engine`, `src/league`, `src/career`) has no DOM dependencies and is covered by headless tests. Both the 3D play simulation and the statistical quick sim produce the same `PlayOutcome`, and `rules.ts` is the single authority on scoring, downs, possession and the clock.

## Testing

```bash
npm test
```

The suite covers the rules engine (downs, scoring, safeties, touchbacks, clock, quarters), the 3D play simulation (pass and run distributions, kicks), full simulated games with stat consistency checks, 17-week schedule validity across seasons, standings/playoffs/awards over multiple seasons, the career path (combine, draft, training, seasons, contracts, retirement) and save validation.

Browser smoke test (creates a career, plays a game and checks for runtime errors):

```bash
npm run build && npm run preview &   # serves on http://localhost:4173
npx playwright install chromium      # first time only
npm run e2e
```

## Known limitations

- Player models are stylized low-poly primitives with procedural animation, not motion-captured characters.
- Kick and punt returns are live in 3D only when your player is the returner; other special-teams plays are simulated.
- Onside kicks, laterals, fake punts and replay review are not implemented. Penalties are limited to the common fouls listed above.
- The offensive line and defensive tackle experiences are deliberately simplified (positioning plus timed punch/shed inputs).
- Injuries are not modeled; fatigue and recovery are.
- The league simulation tracks every player, but box scores are kept only for your games.
