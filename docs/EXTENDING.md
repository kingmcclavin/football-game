# Extending Retro Gridiron

The game is data-driven: teams, positions, archetypes, abilities and plays are plain TypeScript tables. Most additions need no engine changes.

## Teams

`src/data/teams.ts` holds the 32 franchises. Each entry has an `id` (0-31, also the index), city, name, abbreviation, conference (0/1), division (0-3), colours, stadium name, dome flag, emblem shape and glyph, offensive/defensive identity, history blurb, rivals and lighting (`day | dusk | night`).

- To restyle a team, edit its colours, emblem or stadium fields. Uniforms, end zones, stadium seating, scoreboards and UI accents all derive from these colours.
- The scheduler (`src/league/schedule.ts`) assumes 2 conferences x 4 divisions x 4 teams. Keep that shape (or update `buildRegularRounds`) if you add or remove teams.
- Team identity affects AI play calling (`src/game/engine/coachAI.ts`): `Power Run` runs more, `Air Raid` passes more, `Man Blitz` / `3-4 Pressure` blitz more.

## Players and ratings

- Name pools: `src/data/names.ts`.
- Attributes and their OVR weights per position: `POS_ATTRS` in `src/data/positions.ts`. `calcOvr` turns attributes into the 0-99 overall.
- Physical baselines for every position (used by the real-time play sim): `PHYS` in `src/league/players.ts`.
- Roster size per position: `ROSTER_TEMPLATE`; starters per position: `STARTERS`.
- Salary curve: `marketValue` in `src/league/players.ts`.
- League generation (team strength, depth targets, free agents): `src/league/generate.ts`.

## Archetypes and abilities

- Archetypes (`ARCHETYPES` in `src/data/positions.ts`) give attribute boosts and a list of `focus` attributes that are cheaper to upgrade.
- Abilities (`src/data/abilities.ts`) declare `effects` using keys from `AbilityEffect`. Existing keys are already read by the engine (see `mod(...)` calls in `src/game/engine/PlaySim.ts`). To add a new kind of effect: add the key to `AbilityEffect`, mark it multiplicative or additive in `buildMods` (`src/game/engine/mods.ts`), then read it in the simulation with `mod(agent.mods, 'yourKey', default)`.

## Plays

`src/data/playbook.ts`:

- **Formations** list offensive spots as `{ slot, dx, dy }` relative to the ball (dx negative = backfield, dy positive = offense's left).
- **Routes** (`ROUTES`) are waypoint lists in `(forward, outward)` yards. "Outward" flips automatically depending on which side the receiver lines up.
- **Offensive plays** (`OFF_PLAYS`) assign each slot a `route`, `block`, `lead`, `run` (with hole offset and style), `fake` or `checkRelease`, list a read `progression`, and carry `tags` the AI coach uses to pick plays (`run`, `pass`, `short`, `medium`, `deep`, `goal`, `shortyd`, `screen`, `pa`, `qbrun`, `hurry`).
- **Defensive plays** (`DEF_PLAYS`) choose a formation from `DEF_FORMATIONS`, a coverage (`c0`, `c1`, `c2`, `c2m`, `c3`, `c4`) and blitzers. Man matchups and zone landmarks are derived automatically by `PlaySim.buildScrimmage`.

- **Unlock levels**: `PLAY_UNLOCK` maps an offensive play id to the career level at which the user may call it. Plays not listed are open from level 1. The AI coach and the coach's suggested call are never restricted.

New plays immediately appear in the play-call screen, the Playbook screen (with an auto-generated diagram), the AI coach's pool (by tags) and the quick simulator.

## Positions

The engine supports all 12 positions. Career creation offers the subset in `CREATE_POS` (QB, RB, WR, TE, LB, DB, DL, K) with display names from `CREATE_LABEL`; add a position there to offer it. Adding a brand-new position touches:

1. `Pos` in `src/core/types.ts`, plus `POS_ATTRS`, `POS_LABEL`, `POS_BODY`, `ROSTER_TEMPLATE`, `STARTERS`, `PLAYABLE` and archetypes in `src/data/positions.ts`, and `PHYS` in `src/league/players.ts`.
2. Slot mappings in `src/data/playbook.ts` (`OFF_SLOT_POS` / `DEF_SLOT_POS`) and formations that use it.
3. Stat columns (`statColumns` in `src/ui/components/common.tsx`), objectives (`src/career/objectives.ts`), drill (`drillFor` in `src/game/DrillController.ts`) and award value (`playerValue` in `src/league/season.ts`).

## Gameplay engine

- `src/game/engine/rules.ts` is the only place that changes score, downs, possession and the clock (`applyOutcome`). Anything that produces a play result returns a `PlayOutcome` (`src/game/engine/types.ts`).
- `src/game/engine/PlaySim.ts` is the real-time play simulation. It is deterministic for a seed and DOM-free, so it can be tested headless (`tests/playsim.test.ts`). AI behaviours live in `aiDesire` and the helpers it calls (`routeAI`, `passBlockAI`, `manAI`, `zoneAI`, `runnerAI`, `pursue`, ...).
- `src/game/engine/quickSim.ts` resolves plays statistically for snaps without the user and for every other league game. Keep its distributions in line with the real-time sim if you rebalance.
- Difficulty parameters: `DIFFICULTY` in `src/game/engine/mods.ts`.

## Pixel art and rendering

- All art is drawn procedurally with `fillRect` at low resolution and upscaled by whole numbers (`src/game/pixel/`). There are no image assets.
- `sprites.ts`: team kits (`kitFor`), the player sprite (`drawPlayer`, poses `stand/stance/run/throw/catch/block/down/dive/celebrate/kick/juke/hold`), the ball, the 3x5 bitmap font (`drawText`), team logos rasterized from each team's emblem shape (`drawLogo`, `logoDataUrl`) and menu portraits (`portraitDataUrl`, `bodyDataUrl`). New appearance options go in the option arrays at the top and in `drawPlayer`/`drawPortrait`.
- `renderer.ts`: `Renderer2D` draws the field (cached), crowd, players sorted by depth, ball flight, routes, the aim line and confetti. Field coordinates map to screen with `sx/sy`; `toField` and `deltaToField` convert pointer positions for drag aiming. Camera zoom levels are the three `CamMode`s.
- Drag-to-aim lives in `GameController.aimBegin/aimMove/aimEnd` and calls `PlaySim.throwToPoint(x, y, power)`; tap-to-throw uses `PlaySim.throwTo`.

## Audio

`src/audio/audio.ts` synthesizes everything with WebAudio. Music tracks are step-sequenced note arrays in `SONGS` (MIDI note numbers, 16 steps per bar); add a track there and request it with `audio.music(name)`. Fanfares are in `jingle`.

## Tutorials

First-time tutorials are per position group in `TUTORIALS` (`src/ui/components/Tutorial.tsx`). Seen groups are stored in `settings.tutorialsSeen`; Settings can reset them and the pause menu replays them.

## Career features

- Weekly loop, XP, trust, roles, contracts and retirement: `src/career/career.ts`.
- XP curve, skill point costs and abilities: `src/career/progression.ts`.
- Objectives: `src/career/objectives.ts`. Career decision events: `src/career/events.ts` (add an object with choices and effects).
- Start modes (`rookie`, `established`, `undrafted`) are handled in `createCareer`.
- Awards and records: `src/league/season.ts` (the championship MVP is picked in `finalizeGame` for the final and awarded in `closeSeason`). Hall of Fame scoring: `legacyScore` in `src/league/offseason.ts` and `retire` in `src/career/career.ts`.

## Saves

Saves are versioned (`SAVE_VERSION` in `src/core/save.ts`). When you change the shape of `Career` or `League`, bump the version and add a migration step in `migrate()` so existing careers keep loading.
