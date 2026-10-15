# Retro Gridiron

> **Game Boy Advance version:** this repository also contains **Pixel Pigskin**, a separate, original GBA football career game written in C. The ROM is at [`gba/build/RetroFootball.gba`](gba/build/RetroFootball.gba) and it runs in Delta on iPhone and iPad. See [`gba/README.md`](gba/README.md) for how to play, how to import it into Delta, and how to build it.


A retro, pixel-art American football **career game** for the browser, inspired by the feel of classic arcade football. Create a player, go through the draft (or go undrafted), fight for snaps, throw with drag-to-aim, level up, sign contracts, win the Crown Bowl and build a Hall of Fame career across as many seasons as you like.

It is a static web app (TypeScript + React + HTML Canvas 2D, built with Vite). There is no 3D engine, no backend, no account and no paid API. All art, logos, music and sound effects are generated in code, so there are no external assets to go missing. Saves live in the browser (IndexedDB). It runs in Safari on iPhone and iPad and in desktop browsers.

All 32 teams, players, logos and names are fictional. Cities and colour palettes are familiar, but there are no real-league trademarks, logos or likenesses.

---

## Quick start

Requirements: Node.js 18+ (20 or 22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the static site into `dist/` |
| `npm run preview` | Serves the production build locally (port 4173) |
| `npm test` | Runs the unit/integration test suite (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run e2e` | Browser smoke test with Playwright (needs `npm run preview` running) |

### Playing on an iPhone or iPad during development

Run `npm run dev -- --host` and open the printed network URL in Safari on a device on the same Wi-Fi. Use "Share → Add to Home Screen" for full screen, and play in landscape.

---

## Deploying

The build output in `dist/` is a fully static site with relative asset paths, so it works from any domain or sub-path.

- **Vercel:** import the repository (`vercel.json` sets `npm run build` and `dist`), or run `npx vercel`.
- **Netlify:** import the repository (`netlify.toml` sets the build), or drag `dist/` into the Netlify dashboard.
- **GitHub Pages / any static host:** run `npm run build` and upload the contents of `dist/`.

No environment variables or server configuration are needed. Fonts (Press Start 2P, VT323) are bundled from npm, so the game makes no third-party requests.

---

## How to play

1. **Create a player.** Pick QB, RB, WR, TE, LB, Defensive Back, Defensive Line or Kicker, an archetype, a pixel look (skin, face, hair, facial hair, body type, helmet, visor, gloves, cleats, sleeves, accessories), number, height and weight. *Quick Start* skips straight to an established prospect.
2. **Choose your start.** *Rookie Prospect* runs a combine drill that sets your draft slot. *Established Prospect* starts as a high pick close to a starting job. *Undrafted Free Agent* starts on a one-year minimum deal near the bottom of the depth chart. Pick your preferred team or let the draft (or best camp invite) decide.
3. **The weekly loop.** The career hub always shows what's next: optional training (a scored drill or a recovery day), then game day. Decision events pop up between some weeks, including asking for a trade when you are stuck on the bench.
4. **Game day.** Call the coin toss, then play. Offensive careers (QB, RB, WR, TE) play arcade-style: on every offensive snap your player is in for, you pick a simple call, throw every pass with the slingshot and steer whoever has the ball, while your defense is simulated and summarized. Defensive careers play their own defensive snaps and kickers use the kick meter. Your snap count depends on your role (Practice Squad, Backup, Rotation, Starter). Default quarters are 3 minutes.
5. **Progress.** XP from games, objectives, drills and awards gives levels and skill points for attributes (0-99) and abilities. Coach trust moves you up the depth chart and unlocks audibles (QB) and play requests. New plays unlock for your own calls as your level rises.
6. **Seasons.** 3 preseason games, 17 regular-season weeks, a 14-team playoff and the **Crown Bowl**, with a trophy celebration and a Crown Bowl MVP. Awards are based on real stats and team success.
7. **Offseason.** Extensions, re-signing or free agency with competing offers. The league ages, retires players, drafts rookies and builds a new schedule. Retire whenever you like for a career retrospective and Hall of Fame verdict.

**Exhibition Game** (main menu) plays a single, unsaved game for practice or testing: pick a position, a rating (62 / 73 / 88), your team, an opponent, home or away, difficulty and quarter length. You are in on every snap your unit plays, and you return to the setup screen with your stat line afterwards.

A short first-time tutorial appears the first time you play each position group. Replay it from the pause menu, or reset all tutorials in Settings.

### Controls

**Touch (defensive careers):** drag on the left side of the screen for a floating joystick (push fully to sprint). Context buttons appear on the right (Tackle, Swat, Shed...).

**Slingshot passing (the default):** after the snap, press anywhere and pull back, away from where you want the ball to go. An arc shows the throw and an X marks where it lands; pull farther to throw farther, and time slows down while you aim. A light magnet pulls the aim onto a receiver who will get there (green ring). Release to throw: the ball goes where the arc shows, with only a small ratings-based error. Tap a receiver for a quick pass. Defenders can still break up or intercept balls thrown into coverage. Settings also offers "drag toward the target" and receiver-button schemes.

**Running (arcade offense):** whoever has the ball runs for the end zone automatically. Drag up or down anywhere to steer (pull back to slow down), swipe quickly up or down to juke, and tap Spin, Stiff Arm or Dive.

**Play calls:** before each snap pick Quick Pass, Deep Shot, Play Action, Screen, Run Inside, Run Outside (and Hail Mary at the end of a half) or the Coach's Call. Each call picks a fitting play from your unlocked playbook.

**Mouse and keyboard:** click, pull back and release anywhere on the field to throw; arrow keys steer the ball carrier. WASD / arrows move, Shift sprints, Space snaps / continues / locks the kick meter, 1-5 throw to receivers, J juke, K spin, L stiff arm, U dive, R protect, E context action, Q swat, T throw away, C camera zoom, Esc pause. Every key can be remapped.

**Settings:** pass scheme, aim sensitivity, movement sensitivity, control size, left-handed layout, auto-sprint, difficulty, quarter length, game speed, camera zoom, sound effects, chiptune music, volume.

---

## Implemented features

**Retro presentation:** integer-scaled pixel rendering with no smoothing; pixel players with team uniforms (home, away, alternate), helmets, numbers and animation frames (stance, run, throw, catch, block, dive, tackle, juke, kick, celebrate); a field with yard lines, numbers, hash marks, team-coloured end zones with the team name, line of scrimmage and first-down markers; animated crowds; pixel team logos; ball flight with height and shadow; landing markers; screen shake on big hits; confetti and a fanfare on touchdowns and wins; a pixel trophy screen for champions; a retro UI with pixel fonts and borders; synthesized chiptune menu music and sound effects.

**Football:** downs and distance, first downs, touchdowns, extra points and 2-point tries, field goals, punts, kickoffs and touchbacks, safeties, turnovers on downs, interceptions, fumbles, out of bounds, the game clock with two-minute warning and timeouts, halftime, overtime, and common penalties (false start, offside, holding, pass interference). A 25-second play clock with delay of game.

**Positions:** QB (most polished: drag-to-aim passing, scrambling, reads, throw-aways, audibles), RB (handoffs, cuts, jukes, spins, stiff arms, dives, ball security, catches), WR and TE (routes, catches at the catch point, yards after catch, TE blocking), LB and DB (man and zone coverage, swats, interceptions, tackles), DL (pass rush, block shedding, run stops) and K (kick meter for field goals, extra points and kickoffs). The engine also supports OL, S and P for league simulation.

**Playbook:** shotgun, singleback, I-form, pistol, empty and goal-line formations with slants, curls, mesh, smash, verticals, deep posts, screens, bubbles, crossing routes, play action, bootlegs, inside and outside runs, draws, counters, sneaks and a Hail Mary, plus a defensive playbook (Cover 0-4, man, zone, blitzes, prevent, goal line). Play diagrams are generated from the data, and plays unlock with career level.

**AI:** AI quarterbacks read progressions; AI coaches call plays by down, distance, field position, score and clock and handle fourth downs, 2-point tries, kneels and timeouts. Difficulty changes reactions, pursuit, coverage, tackling and decision quality rather than inflating ratings.

**Career:** archetypes, XP and levels, position attributes on a 0-99 scale, abilities with real gameplay effects, coach trust, reputation, fatigue, weekly and season objectives, decision events, trade requests, milestones, depth-chart competition, contracts with salary, bonuses, extensions, re-signing and free agency, aging, retirement, legacy tiers and a Hall of Fame.

**League:** 32 fictional teams in 2 conferences and 8 divisions with colours, logos, stadiums, coaches, rivals and histories; persistent players with ratings, ages, potential, contracts and stats; full-season simulation; standings with tiebreakers; playoff bracket; awards (MVP, OPOY, DPOY, rookies of the year, position awards, All-Stars, Crown Bowl MVP); records; news; offseason development, retirements, draft and free agency.

**Saves:** versioned save format in IndexedDB (localStorage fallback), three slots, continue / new / delete with confirmation, export and import as JSON, migration hook and graceful handling of corrupt saves. The game saves after every game, training session, decision and season transition.

---

## Project structure

```
src/
  core/          types, seeded RNG, utilities, save system
  data/          teams, names, positions/archetypes/attributes, abilities, playbook (with unlock levels)
  league/        league generation, schedule, standings, season sim, awards, records, offseason
  career/        creation, weekly loop, XP/progression, objectives, events, contracts
  game/
    engine/      rules (GameState), PlaySim (real-time play simulation), quick sim, AI coach, lineups, game loop
    pixel/       procedural pixel sprites, logos, font and the Canvas 2D renderer
    input/       unified keyboard + touch input
    GameController.ts   one career game (live snaps, drag-to-aim, simulated snaps, HUD state)
    DrillController.ts  position drills and the combine
  audio/         synthesized SFX and chiptune music
  ui/            React screens, components (HUD, tutorial, trophy), store
tests/           Vitest suites
scripts/e2e.mjs  Playwright browser smoke test
docs/EXTENDING.md   adding teams, players, plays, abilities, positions, art and music
```

The simulation core (`src/game/engine`, `src/league`, `src/career`) has no DOM dependencies and is tested headless. The real-time play simulation and the statistical quick sim both produce a `PlayOutcome`, and `rules.ts` is the single authority on scoring, downs, possession and the clock.

## Testing

```bash
npm test
```

Covers the rules engine, the play simulation (pass/run distributions, kicks, drag-to-aim completion and interception rates), full simulated games with stat consistency checks, schedule validity, multi-season standings/playoffs/awards (including the Crown Bowl MVP), rookie, established and undrafted career paths through contracts and retirement, save validation, and headless full games through the game controller for several positions plus every drill.

Browser smoke test (plays a full RB game on a phone-sized touch viewport, then starts a QB career, checks the first-time tutorial and throws with drag-to-aim, failing on any runtime error):

```bash
npm run build && npm run preview &
npx playwright install chromium      # first time only
npm run e2e
```

## Known limitations

- The arcade offense is inspired by the feel of classic arcade football games; all code, art and names are original.
- Pixel sprites use a handful of animation frames; facial details show mainly in menu portraits.
- Kick and punt returns are live only when your player is the returner; other special-teams plays are simulated.
- Onside kicks, laterals, fake punts and replay review are not implemented. Penalties are limited to the common fouls listed above.
- Career creation offers 8 positions; OL, S and P exist in the league simulation but are not offered for new careers.
- Injuries are not modeled; fatigue and recovery are.
- Music is a few short synthesized loops; there is no in-game soundtrack beyond crowd noise and fanfares.
- The league simulation tracks every player, but box scores are kept only for your games.
