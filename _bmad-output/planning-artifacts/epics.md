---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md
  - _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/epics.md
  - _bmad-output/planning-artifacts/game-architecture.md
contextDocuments:
  - _bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/brief.md
  - _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/decision-log.md
---

# topdown-shooter - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for topdown-shooter, decomposing the requirements from the GDD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Controls and input**

FR1: The game runs in landscape only; in portrait a "rotate your phone" overlay is shown.
FR2: A floating move joystick appears where the thumb lands on the left half of the screen (dead zone 10%, full speed at 100% deflection).
FR3: A floating aim joystick on the right half aims past a 30% dead zone; the equipped weapon fires automatically while aiming.
FR4: On touch, projectiles bend up to 8° toward the nearest zombie inside the aim cone; aim assist is off for mouse aim.
FR5: A swap button near the right thumb switches between the 2 weapon slots in 0.3 s.
FR6: Guns reload automatically when the magazine is empty; reserve ammo is unlimited.
FR7: Desktop fallback: WASD to move, mouse to aim, hold left click to fire, Q to swap.
FR8: A consumable button uses the single quick-use slot (medkit, grenades, molotovs).

**Player**

FR9: A player has 100 HP, radius 0.4 m and move speed 4.5 m/s; zombies in contact hit once per second; no regeneration during a wave; each build phase heals 50% of max HP.
FR10: At 0 HP a player is downed; a teammate standing next to them for 3 s revives them; after 20 s without revive they are out until the next build phase, when they return automatically.
FR11: The run is lost when no player is standing (everyone downed or out).
FR12: Each player carries 2 weapon slots in any combination; a run starts with a Pistol and 100 currency.

**Weapons and combat**

FR13: The 10 weapons (Pistol, Machete, Fire Axe, Chainsaw, Shotgun, Flamethrower, SMG, Assault Rifle, Hunting Rifle, Grenade Launcher) behave per the GDD weapon table (damage, rate, range/arc, magazine, reload, price).
FR14: Shots are visible travelling projectiles (bullets ~60 m/s, grenades lobbed); melee hits every zombie inside its arc instantly.
FR15: Each gun has a fixed spread; there is no recoil climb, no movement penalty, and no critical hits or weak points.
FR16: Weapon specials work: knockback (Fire Axe 1.5 m, Shotgun 0.5 m), Hunting Rifle pierces 5 zombies, Flamethrower ignites (+3 dmg/s for 3 s), Chainsaw slows its wielder 20%, Grenade Launcher hurts the shooter at 50%.
FR17: Weapons upgrade from level I to IV in the shop; each level adds +25% damage; each level costs 60% of the weapon's base price.
FR18: Friendly fire is off for bullets and melee and on at 50% for explosions and fire (grenade launcher, flamethrower burn, Bloater gas, molotovs).
FR19: Every hit flashes the zombie and pushes it back; heavy weapons (axe, hunting rifle, grenade launcher) add a short screen shake.

**Zombies**

FR20: Walker: 10 HP, 1.2 m/s, 10 per hit, walks straight at the nearest player, reward 2.
FR21: Runner: 6 HP, 4.0 m/s, 8 per hit, takes a flanking path around the front line, reward 3.
FR22: Crawler: 8 HP, 0.7 m/s, 12 per hit, low silhouette, bite slows the player 30% for 1 s, leaves a blood trail, reward 3.
FR23: Spitter: 12 HP, 1.5 m/s, stops at 6 m, spits every 3 s for 15 after a 0.6 s glowing-mouth telegraph, leaves an acid puddle (3 s, 5 dmg/s), reward 5.
FR24: Bloater: 25 HP, 0.9 m/s, explodes on death or after a 1 s swell when touching a player; 2.5 m blast, 30 damage to players, 40 to zombies; gas cloud slows for 4 s; reward 6.
FR25: Brute: 120 HP, 1.0 m/s, 35 per hit + 1.5 m knockback, 3× damage to buildings, barely affected by knockback, reward 25.
FR26: Zombies chase the nearest player, route around cover and obstacles, keep crowd separation, and attack any building blocking their path.
FR27: Zombie stats never change with waves; only counts, mix and spawn pressure grow.

**Waves and spawns**

FR28: Wave size (4 players) grows from ≈ 40 zombies in wave 1 by ≈ 40 per wave to ≈ 400 in wave 10, with at most 150 alive at once; the rest queue at spawn points.
FR29: Zombie types are introduced in order: W1 Walkers · W2 +Runners · W3 +Crawlers · W4 +Spitters · W5 first Brute · W6 +Bloaters · W7–9 full mix · W10 finale.
FR30: A wave ends when all its zombies are dead; when 5 remain they are marked on screen and rush the players.
FR31: Zombie count and boss HP scale by player count: × 0.6 (2 players), × 0.8 (3), × 1.0 (4); a mid-run join rescales from the next wave.
FR32: Zombies spawn at district edges (alleys, manholes, broken shop windows); decay opens more spawn points.

**The Behemoth (wave 10 boss)**

FR33: The Behemoth arrives mid-wave 10 with the horde still active: radius 2 m, 1.3 m/s, immune to knockback, 6,000 HP at 4 players (scaled by player count).
FR34: Behemoth attacks with telegraphs: ground slam (1.2 s, 4 m radius, 40 dmg), charge (1.0 s, 10 m line, 30 dmg, destroys buildings in its path), throw (1 s, picks up a wreck or rubble, 3 m impact, 35 dmg).
FR35: At 50% HP the Behemoth enrages: +30% speed, attack cooldowns −30%, a Crawler drops off its back every 4 s.
FR36: The Behemoth's death calls the evacuation helicopter.

**Special events**

FR37: 1–2 random special events happen per run in waves 3–9, never in the same wave as the first Brute.
FR38: Car alarm: draws all zombies within 15 m toward the car for 15 s.
FR39: Gas leak: a tank hisses for 10 s then explodes (6 m radius, kills zombies, 60 damage to players).
FR40: Supply drop: a crate lands at a random spot; the first player to reach it gets a rare weapon.
FR41: Stampede: a mass of Runners crosses the map in one direction for 10 s.
FR42: Power failure: the current wave becomes a blackout wave.
FR43: Survivor: an NPC appears and must be escorted to a safe point for a big reward.

**Build phase, economy and shop**

FR44: A 30 s build phase opens the run and follows every wave; it ends early when every player taps Ready.
FR45: Each player has a personal wallet, earning kill rewards per zombie type, 50% of the reward for an assist, +25 per revive, 50% of the reward for kills by their own buildings, and a wave-clear bonus of 10 × wave number paid to every player (including downed and out players).
FR46: The shop always offers all unlocked buildings and consumables, repairs, and upgrades for weapons the player owns.
FR47: Each build phase, each player sees their own 6 random weapon and gear cards drawn from their unlocked pool, with at least 1 weapon and 1 gear card; reroll costs 20.
FR48: Gear lasts the run: Body armor I/II (+25/+50 max HP, 150/350), Running shoes (+10% speed, 150), Revive kit (revive 3 s → 1.5 s, 150), Tactical flashlight (wider, longer cone in blackout, 120).
FR49: Consumables use one slot: Medkit (heals 50, 60), Grenades ×3 (40 dmg, 2.5 m, 80), Molotovs ×2 (3 m fire zone for 4 s, 8 dmg/s, 100).

**Buildings**

FR50: In a build phase, a player taps a building in the shop, then taps the ground to place it on a 1 m grid and drags to rotate; placement is refused where blocked.
FR51: Buildings persist until destroyed, can be repaired in a build phase for 50% of their price, and are capped at 6 per player.
FR52: Building behaviors per the GDD table: Wood barricade (2 m wall, 200 HP, 40), Metal barricade upgrade (600 HP, +120), Auto-turret (nearest zombie within 8 m, 3 dmg × 5/s, 300 HP, 250), Spike trap (2 × 2 m, 4 dmg/s and −40% speed, 300 HP, 80), Mine (proximity, 80 dmg in 2.5 m, single use, 60), Floodlight (8 m light circle, 150 HP, 100), Med station (heals players within 2 m by 5 HP/s, 300 HP, 400).
FR53: Barricades block zombies and players but not bullets; zombies attack buildings blocking their path; fires damage buildings inside them; rubble blocks placement; the Behemoth's charge destroys buildings.

**District, camera and cover**

FR54: Downtown (~48 × 32 m) is hand-made: central intersection, 2–3 alleys, gas station corner, crashed city bus, small parking lot, spawn points at the edges.
FR55: Each player's camera follows them, showing about 24 × 13.5 m; teammates off screen are shown by edge arrows; each player has a colored ground ring (blue, orange, green, purple).
FR56: Cars, bus, barriers and sandbags block movement for players and zombies; bullets pass over barriers and sandbags but not cars or the bus.
FR57: Hazards damage or slow what is inside them: fire zones (10 dmg/s to everything), acid puddles, gas leak, Bloater gas.

**City decay**

FR58: The district advances one decay stage every 2 waves; stage changes apply only at the start of a build phase, and buildings on newly blocked cells are destroyed with a 50% refund.
FR59: Stage 1 Evening (waves 1–2): open map, full lighting, parked cars along curbs, lit shops.
FR60: Stage 2 Panic (waves 3–4): 4 cars move into the road (new cover and choke points); police barriers block some paths.
FR61: Stage 3 Breakdown (waves 5–6): 2 car fires (2 m fire zones lasting 2 waves); free sandbag cover appears; rain begins.
FR62: Stage 4 Ruins (waves 7–8): rubble closes one alley and blocks paths; streetlights flicker; collapsed walls open new spawn points.
FR63: Stage 5 Collapse (waves 9–10): power out; wave 9 is a blackout wave; fog limits vision to 10 m; wave 10 is lit only by fires and floodlights.
FR64: In blackout, darkness covers the map except flashlight cones (aim direction), floodlights, fires and muzzle flashes; zombie eyes show through the dark.
FR65: Each run has a seed that drives its random choices (which cars burn, which alley collapses, events, shop cards), so a run can be reproduced.

**Win, evacuation and endless**

FR66: After the Behemoth dies, the team votes for 15 s: majority wins; a tie or no votes means extract.
FR67: Extract wins the run and keeps all rewards; Stay starts endless waves in the collapsed city.
FR68: Endless: blackout every other wave, +40 zombies per wave (still max 150 alive), +1 Brute per wave, a Behemoth every 5th wave before each evacuation vote (15, 20, 25…); a wipe before extracting loses rewards earned after wave 10.

**Multiplayer**

FR69: The host picks a district and gets a share link and a 4-letter code; 2–4 players join, tap Ready, and the host starts.
FR70: Players can play immediately as a guest with only a name.
FR71: All players see the same horde and the server decides hits; your own movement, aiming and muzzle flash respond instantly on your device.
FR72: Players can join mid-run during build phases only, starting with the team's average currency.
FR73: A disconnected player's character is removed safely; they can rejoin within 2 minutes with wallet and gear intact.
FR74: If the host leaves, host migrates to another player (the longest-connected).
FR75: During a build phase the host can Save and quit; the server keeps the run 7 days, and any group that includes the host can resume it.
FR76: A ping button offers 4 quick messages (Help! · Over here · Brute! · Ready), each showing an icon on teammates' screens and edge arrows.

**Meta-progression**

FR77: A guest can upgrade to an account later and keep their progress.
FR78: Supplies are earned per run, even on a loss: +10 per wave survived, +50 for killing the Behemoth, +100 for extracting, +20 per endless wave (kept only if the team extracts).
FR79: New players start with the starter pool (Pistol, Machete, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Wood barricade, Auto-turret, Medkit, Grenades); other items are unlocked with Supplies on an unlock screen at the GDD prices, and unlocks add cards to that player's shop deck.
FR80: Training offers 4 capped boosts with 5 levels each (max HP up to +10%, damage up to +5%, starting currency 100 → 150, reload speed up to +5%), each level costing 50 × level Supplies.
FR81: District 2 unlocks after the first extraction from Downtown (rule only; district 2 content is out of v1).

**Presentation, audio and settings**

FR82: Dead City art: gritty, realistic, rainy night city; zombies read as people from above; each zombie type has a distinct silhouette; the district has 5 visual decay states.
FR83: Gore: heavy hits (axe, chainsaw, shotgun, explosions) dismember zombies, explosive kills burst them apart, and blood stays on the ground for the wave; a gore toggle switches to blood only.
FR84: Every special attack has a readable visual and audio warning; each special zombie has a signature sound (Spitter gurgle, Bloater swelling, Brute roar, Runner shriek).
FR85: Ambience follows the decay stage (5 loops); music intensity follows the number of zombies alive; a calmer build-phase track and a dedicated Behemoth track.
FR86: Each weapon has distinct firing and reload sounds; reloads are clearly audible.
FR87: Quality settings can lower or turn off rain, fog visuals, screen shake, film grain and light glow, plus the gore toggle; blackout darkness and the 10 m fog vision limit cannot be turned off.
FR88: The game records simple run stats (district, wave reached, extracted, loadouts per player) for the success metrics.

### NonFunctional Requirements

NFR1: Frame rate 60 FPS target, never below 30 FPS sustained, on 2021 mid-range phones (iPhone 12, Pixel 5, Galaxy A52), measured over a full wave 9 blackout with all 150 alive zombies in one player's view.
NFR2: Memory under 300 MB per browser tab on iPhone 12.
NFR3: Fully playable on 4G at up to 150 ms latency, with no visible disagreement between players about what happened.
NFR4: Each phone receives at most ~30 KB/s with 150 zombies alive (≈ 40 MB per 20-minute run); proving this is Milestone 1's first goal.
NFR5: At 150 ms latency, fewer than 1 shot in 20 that looks like a hit on your screen is reversed.
NFR6: First load under 10 s on 4G with under 15 MB total download; later loads under 3 s; music streams after the game starts.
NFR7: A 20-minute run uses under 15% battery on the reference phones.
NFR8: Supported browsers: Safari iOS 16+, Chrome Android 10+ (primary); current desktop Chrome, Firefox, Safari, Edge (bonus); respects notches and safe areas; can be added to the home screen.
NFR9: A full 4-player run reaches wave 10 with no disconnect caused by the game.
NFR10: Runs are deterministic for a given seed and input log (reproducible for testing).
NFR11: Readability: each player and zombie type is identifiable at a glance on a phone, including in the crowd and in blackout.
NFR12: Security: HTTPS/WSS only, hashed passwords and guest tokens, rate-limited login and room creation, all client input validated.
NFR13: Durability: account progress and saved runs survive server restarts and deploys; nightly backups kept 14 days.
NFR14: Balance is data-driven: every gameplay number can be changed without code changes.

### Additional Requirements

From the architecture document:

- **No starter template (Epic 1 Story 1):** the project is a hand-scaffolded TypeScript npm-workspaces monorepo (`apps/client`, `apps/server`, `packages/shared`) using Phaser 4.2, @colyseus/sdk 0.18, Preact 11, Vite 8, Colyseus 0.18, @colyseus/schema 5, TypeScript 6.0 (pinned, not 7.0), tsx, Node.js 26 LTS. Scripts `dev`, `test` (Vitest 5), `lint` (ESLint + typescript-eslint), `typecheck`, `build`; CI on GitHub Actions runs typecheck, lint, tests and build.
- **Shared simulation package (ADR-03):** engine-free TypeScript (no Phaser, Colyseus, DOM or Node imports); fixed 50 ms step (20 Hz); fixed system order per tick; struct-of-arrays pools for zombies and projectiles with generation-bit ids; uniform spatial hash grid (2 m cells); swept segment-vs-circle projectile collision; times in seconds, distances in meters; no `Math.random()` or `Date.now()`.
- **Balance data:** typed JSON files in `packages/shared/src/config/balance/` (weapons, zombies, buildings, items, waves, economy, decay, events, boss) validated with zod into one `Balance` object; server sends the balance version on join and refuses mismatched clients ("Please refresh").
- **Seeded PRNG** per run with named sub-streams (events, decay, shop per player slot + build phase index).
- **Typed synchronous event bus** (`domain.past_tense` names, one `SimEvent` union), drained once per tick; the server forwards the events clients need as reliable messages.
- **Epic 1 local mode:** the client runs the shared World in the browser behind a `SimHost` interface; Epic 2 swaps in the networked host without changing scenes.
- **Server:** one Colyseus `RunRoom` per run owning the `Run` state machine (Lobby → Build → Wave → EvacVote → Endless ↔ EvacVote → Results; Paused side state) and the World; room id = random 4-letter code without ambiguous letters; share link `https://<subdomain>/j/<code>`; `maxClients = 4`; joins only in Lobby and Build; `hostSlot` reassigned to the longest-connected player.
- **Networking (ADR-01):** server-authoritative; client input sampled per 50 ms step with sequence numbers; local player predicted with shared movement code and reconciled; remote entities interpolated with an adaptive 100–150 ms delay; timers count ticks inside the World.
- **Horde stream (ADR-02):** per-client binary message per tick with zombies in the client's view + 4 m margin; 8-byte records (id u16, x u16, y u16 at 1 cm, heading u8, type+state u8) + header; freed ids held 1 s; client removes zombies missing from 3 snapshots; backpressure skips frames when `bufferedAmount` > 64 KB; budget horde ≤ 24 KB/s + schema/events ≤ 6 KB/s.
- **Colyseus schema** for low-frequency state (players, wallets, loadouts, buildings, phase, timers, decay stage, votes, Behemoth, hazards, mines, Survivor, crate, aliveCount); personal shop offers sent only to their owner (`@view()` or direct message); purchases validated against the stored offer.
- **Hit validation:** server simulates all projectiles and melee; shots spawn at the shooter's position advanced by half RTT (capped 150 ms); projectiles are cosmetic on clients from `weapon.fired` events; upgrade path keeps 300 ms of zombie position history for rewind if > 1 in 20 hits are reversed.
- **Pathfinding:** flow fields on a 0.5 m grid toward players, rebuilt (amortized) when buildings or decay change; Runners use a flanking field; separation forces on top.
- **Maps (ADR-05):** districts authored in Tiled (JSON export); layers `stage1_evening` … `stage5_collapse`, `collision`, `cover`, `spawns`, `hazards`; per-stage mutation sets (`add | remove | ignite | block`); `DecayTimeline` + `DecaySystem` in shared, `DecayView` on the client; client prediction applies decay to its own map; on resume, stages are re-applied without side effects.
- **Lighting:** darkness render texture at half resolution with lights cut out, rendered only when blackout is on; light state owned by the server.
- **UI:** in-combat HUD drawn by Phaser; menus (lobby, shop, evac vote, results, unlocks, settings) as Preact HTML overlays with `pointer-events: none` except on active screens.
- **Persistence (ADR-04):** PostgreSQL 18 + Drizzle ORM 0.45 + Drizzle Kit migrations; tables `accounts`, `progress`, `saved_runs`, `run_results`; DB accessed only from `apps/server/src/db` repositories.
- **Saved runs:** versioned JSON snapshot (including every PRNG state) autosaved at each Build phase for crash recovery; explicit Save and quit makes it resumable for 7 days by the host only; graceful shutdown autosaves every room.
- **Reconnect:** Colyseus `allowReconnection` 120 s; slot, wallet and gear held in room state.
- **Accounts:** guest = random device token in localStorage → server session (stored hashed); upgrade to username + password (Argon2id via @node-rs/argon2).
- **Hosting:** Docker Compose on the designer's European VPS: Caddy 2.11 (HTTPS/WSS + static client, no-cache `index.html`, long-cache hashed assets), game server, PostgreSQL; subdomain on `sevend.io`; WebSocket origin check; nightly `pg_dump` kept 14 days and copied off the VPS, restore tested once per milestone.
- **Security limits:** inbound message ≤ 1 KB, input rate cap 25/s per client, ping rate 1/s per player, login 5/min per IP, room creation 10/min per IP; zod validation on every client message.
- **Error handling:** `Result<T, E>` for expected failures; exceptions only for programmer errors; one global handler per room (saves the last Build snapshot if the simulation is corrupted); short player-facing messages.
- **Logging:** pino JSON to stdout with `roomId`/`runSeed`/`wave`/`playerId`; no logging in hot loops; client ring buffer of 200 lines attached by "Report a problem".
- **Debug tools:** performance overlay (FPS, ping, bandwidth, zombies alive/in view, tick time) also in release via Settings → Show performance; dev-only cheats (spawn, skip wave, give currency, set decay stage, trigger event, force blackout, set seed, god mode); collision/grid view; headless replay from seed + input log.
- **Testing:** Vitest unit tests with fixed seeds for every GDD mechanic in `shared`; headless bot clients in `tools/bots` for load tests.
- **Client platform budgets:** devicePixelRatio capped at 2; texture atlases ≤ 2048 × 2048; no per-frame allocation in render loops (Phaser object pools); stop rendering and audio on `visibilitychange`; web app manifest (fullscreen, landscape), `viewport-fit=cover`.
- **Assets:** texture atlases per district and character set, SFX audio sprites, streamed music and ambience; placeholder/AI art uses the final atlas layout and naming (`category_name_variant`) so Epic 9 swaps files without code changes.
- **Audio:** three buses (music, SFX, ambience); positional volume/pan for zombie cues.
- **Tooling:** Context7 MCP for current Phaser/Colyseus/Vite docs.

From the GDD epics outline (sequencing constraints):

- Epic 3 ships a fixed-list shop; the 6-card roguelike shop arrives in Epic 5 once the item pool is big enough.
- Milestone 1 = Epics 1–4: 2–4 players online in Downtown, 4 weapons (Pistol, SMG, Machete, Hunting Rifle), 3 zombie types, turret + barricade, shop, 5 waves, 3 decay stages.
- Melee under twin-stick must be playtested on real phones in Epic 1 (open risk).
- Placeholder/AI art and free sound libraries for Epics 1–8; hired artist and sound designer for Epic 9.

### UX Design Requirements

No UX design document exists yet. Menu, HUD and touch-control needs are covered by the functional requirements above (FR1–FR8, FR30, FR55, FR76, FR87) and the UI architecture notes. A `gds-ux` pass is recommended before Epic 9.

### FR Coverage Map

FR1: Epic 1 - Landscape only, rotate overlay
FR2: Epic 1 - Floating move stick
FR3: Epic 1 - Floating aim stick with auto-fire
FR4: Epic 1 - 8° aim assist on touch
FR5: Epic 1 - Weapon swap 0.3 s
FR6: Epic 1 - Auto reload, unlimited reserve
FR7: Epic 1 - Desktop keyboard and mouse fallback
FR8: Epic 5 - Consumable button
FR9: Epic 1 - Player HP, speed, contact damage (build-phase heal in Epic 3)
FR10: Epic 2 - Downed, revive, out
FR11: Epic 2 - Team wipe loss (Epic 1: solo death ends the game)
FR12: Epic 1 - Two slots, Pistol start (100 currency start in Epic 3)
FR13: Epic 1 (Pistol, SMG, Machete, Hunting Rifle) · Epic 5 (other 6 weapons)
FR14: Epic 1 - Visible projectiles, instant melee arcs (lobbed grenades in Epic 5)
FR15: Epic 1 - Fixed spread, no recoil, no crits
FR16: Epic 1 (Hunting Rifle pierce) · Epic 5 (other weapon specials)
FR17: Epic 5 - Upgrades I–IV
FR18: Epic 5 - Friendly fire for explosions and fire
FR19: Epic 1 - Hit flash, pushback, screen shake
FR20: Epic 1 - Walker
FR21: Epic 3 - Runner
FR22: Epic 3 - Crawler
FR23: Epic 5 - Spitter
FR24: Epic 5 - Bloater
FR25: Epic 5 - Brute
FR26: Epic 1 (chase, separation) · Epic 3 (attack buildings, flow fields) · Epic 4 (route around cover)
FR27: Epic 1 - Fixed zombie stats
FR28: Epic 1 (simple growing waves) · Epic 3 (5-wave curve) · Epic 6 (full 10-wave curve)
FR29: Epic 3 (W1–W3 order) · Epic 6 (full introduction order)
FR30: Epic 1 - Last 5 marked and rushing
FR31: Epic 3 - Player-count scaling (boss HP scaling in Epic 6)
FR32: Epic 4 - Spawn points at district edges, opened by decay
FR33: Epic 6 - Behemoth body and arrival
FR34: Epic 6 - Behemoth slam, charge, throw
FR35: Epic 6 - Behemoth enrage
FR36: Epic 6 - Behemoth death calls evacuation
FR37: Epic 6 - Event scheduling
FR38: Epic 6 - Car alarm
FR39: Epic 6 - Gas leak
FR40: Epic 6 - Supply drop
FR41: Epic 6 - Stampede
FR42: Epic 6 - Power failure
FR43: Epic 6 - Survivor escort
FR44: Epic 3 - 30 s build phase with Ready
FR45: Epic 3 - Personal wallets and rewards
FR46: Epic 3 - Always-available shop items (fixed list)
FR47: Epic 5 - 6-card roguelike shop with reroll and floor
FR48: Epic 5 - Gear
FR49: Epic 5 - Consumables
FR50: Epic 3 - Grid placement and rotation
FR51: Epic 3 - Persistence, repairs, 6-building cap
FR52: Epic 3 (Wood barricade, Auto-turret) · Epic 5 (other 5 buildings)
FR53: Epic 3 (blocking, zombie attacks) · Epic 4 (fire damage) · Epic 6 (rubble, Behemoth charge)
FR54: Epic 4 - Downtown layout
FR55: Epic 1 (camera follow) · Epic 2 (player rings, teammate edge arrows)
FR56: Epic 4 - Cover and bullet rules
FR57: Epic 4 (fire zones) · Epic 5 (acid, Bloater gas) · Epic 6 (gas leak)
FR58: Epic 4 - Decay stage engine and build-phase timing
FR59: Epic 4 - Stage 1 Evening
FR60: Epic 4 - Stage 2 Panic
FR61: Epic 4 - Stage 3 Breakdown
FR62: Epic 6 - Stage 4 Ruins
FR63: Epic 6 - Stage 5 Collapse
FR64: Epic 6 - Blackout lighting
FR65: Epic 4 - Run seed (seeded RNG core from Epic 1)
FR66: Epic 6 - Evacuation vote
FR67: Epic 6 - Extract or stay
FR68: Epic 6 - Endless mode
FR69: Epic 2 - Lobby, share link, 4-letter code
FR70: Epic 2 - Guest play with a name
FR71: Epic 2 - Shared horde, server hits, instant own feel
FR72: Epic 8 - Join mid-run at build phases
FR73: Epic 8 - 2-minute reconnect
FR74: Epic 8 - Host migration
FR75: Epic 8 - Save and quit, 7-day resume with host
FR76: Epic 8 - Pings
FR77: Epic 7 - Guest-to-account upgrade
FR78: Epic 7 - Supplies earning
FR79: Epic 7 - Starter pool, unlocks, unlock screen
FR80: Epic 7 - Training boosts
FR81: Epic 7 - District 2 unlock rule
FR82: Epic 4 (placeholder Dead City art) · Epic 9 (final art)
FR83: Epic 9 - Gore and dismemberment with toggle
FR84: Epic 5–6 (visual telegraphs, placeholder sounds) · Epic 9 (final signature sounds)
FR85: Epic 9 - Ambience and adaptive music
FR86: Epic 9 - Weapon sounds (placeholder sounds from Epic 1)
FR87: Epic 10 - Quality settings
FR88: Epic 10 - Run stats

**NFRs:** NFR1 measured from Epic 1, met in Epic 10 · NFR2 Epic 10 · NFR3–NFR5 Epic 2 · NFR6–NFR8 Epic 10 · NFR9 Epics 2, 6, 10 · NFR10 from Epic 1 · NFR11 Epics 2 and 5 · NFR12 Epic 2 (transport, input validation), Epic 7 (passwords) · NFR13 Epics 7 and 8 · NFR14 from Epic 1.

## Epic List

Ten epics, each ending in something playable. Order: 1 → 2 → 3 → 4 (Milestone 1) → 5 → 6 → 7 → 10. Epic 8 can start after Epic 3 and Epic 9 after Epic 4; both run alongside. No epic needs a later epic to work.

### Epic 1: Core combat on one phone
One player fights growing waves of Walkers on their phone with touch twin-stick controls and 4 weapons (one per range), and sees the frame rate with 150 Walkers. Includes the monorepo scaffold, the shared simulation core (World loop, seeded RNG, spatial grid, balance loading) in local SimHost mode, the performance overlay, and the melee playtest on real phones.
**FRs covered:** FR1–FR7, FR9, FR12, FR13 (4 weapons), FR14, FR15, FR16 (pierce), FR19, FR20, FR26 (chase, separation), FR27, FR28 (simple), FR30, FR55 (camera follow)

### Epic 2: Online co-op foundation
2–4 friends open a share link and fight the same horde together on 4G, with downed/revive and team wipe. Includes the Colyseus server, horde stream, prediction and interpolation, server-confirmed hits, an anonymous guest device ID (so the host is known), and the first deploy to the VPS (Docker Compose + Caddy, HTTPS/WSS) for the 4G latency test.
**FRs covered:** FR10, FR11, FR55 (rings, edge arrows), FR69, FR70, FR71

### Epic 3: Build phase and economy
A team plays 5 waves with build phases: earning into personal wallets, buying from a fixed-list shop, and placing Auto-turrets and Wood barricades on a grid. Runners and Crawlers join the horde; zombie count scales with player count.
**FRs covered:** FR9 (build heal), FR12 (start currency), FR21, FR22, FR26 (attack buildings, flow fields), FR28 (5-wave curve), FR29 (W1–W3), FR31, FR44, FR45, FR46, FR50, FR51, FR52 (2 buildings), FR53 (blocking)

### Epic 4: Downtown and city decay (Milestone 1)
2–4 players online in Downtown play 5 waves through Evening → Panic → Breakdown: cars move into the road, barriers block paths, fires burn. Placeholder Dead City art, cover rules, spawn points and the run seed.
**FRs covered:** FR26 (route around cover), FR32, FR53 (fire damage), FR54, FR56, FR57 (fire), FR58, FR59, FR60, FR61, FR65, FR82 (placeholder)

### Epic 5: Full arsenal and bestiary
Every weapon, upgrade, zombie, building, gear item and consumable from the GDD, plus the 6-card roguelike shop; every zombie type demands its own answer.
**FRs covered:** FR8, FR13 (6 weapons), FR14 (lobbed), FR16, FR17, FR18, FR23, FR24, FR25, FR47, FR48, FR49, FR52 (5 buildings), FR53, FR57 (acid, gas), FR84 (telegraphs)

### Epic 6: The full run: decay, boss, events, endless
A team plays from Evening to the Behemoth through Ruins and Collapse (blackout, fog), meets the special events, votes to extract or stay, and can go endless.
**FRs covered:** FR28 (full curve), FR29, FR31 (boss HP), FR33–FR43, FR53 (rubble, charge), FR57 (gas leak), FR62, FR63, FR64, FR66, FR67, FR68, FR84 (boss telegraphs)

### Epic 7: Accounts and meta-progression
Players keep progress between runs: a guest upgrades to an account, earns Supplies, unlocks items that then appear in their shop, and buys capped Training boosts.
**FRs covered:** FR77, FR78, FR79, FR80, FR81

### Epic 8: Real-life resilience
Real life doesn't break a run: rejoin within 2 minutes with your gear, join mid-run at a build phase, host migration, Save and quit with 7-day resume, and quick pings.
**FRs covered:** FR72, FR73, FR74, FR75, FR76

### Epic 9: Dead City art and audio
The game looks and sounds like Dead City: final district art in 5 decay states, animations, gore and dismemberment, effects, UI art, ambience per stage, adaptive music, weapon and zombie sounds. Non-code checklist item: hire the artist and sound designer.
**FRs covered:** FR82, FR83, FR84 (final sounds), FR85, FR86

### Epic 10: Performance and polish
Every technical target is met on the reference phones; quality settings, home-screen install and safe areas, run stats, a balance pass and friend-group playtests deliver v1.
**FRs covered:** FR87, FR88 · NFR1, NFR2, NFR6, NFR7, NFR8

## Epic 1: Core combat on one phone

One player fights growing waves of Walkers on their phone with touch twin-stick controls and 4 weapons (one per range), and sees the frame rate with 150 Walkers. The game runs entirely in the browser (local `SimHost` mode); networking arrives in Epic 2. Placeholder art and sounds only.

### Story 1.1: Project scaffold with a playable link

As the designer,
I want the project set up with its three parts (client, server, shared rules) and an automatic build I can open on my phone,
So that every later story lands in a clean, checked codebase and I can try each change from a link.

**Acceptance Criteria:**

**Given** a fresh clone
**When** I run `npm install` then `npm run dev`
**Then** the client opens in a browser and shows a Phaser scene with the text "topdown-shooter"
**And** the workspaces `apps/client`, `apps/server`, `packages/shared` exist as in the architecture directory structure, with `tsconfig.base.json` and the scripts `dev`, `test`, `lint`, `typecheck`, `build`

**Given** the pinned stack
**When** I check `package.json` files and the lockfile
**Then** Phaser 4.2.x, Preact 11.x, Vite 8.x, TypeScript 6.0.x (not 7.x), Vitest 5.x, ESLint with typescript-eslint, zod 4.x are installed at exact versions
**And** `packages/shared` has an ESLint rule that forbids imports from `phaser`, `colyseus`, `@colyseus/*`, DOM globals and Node built-ins

**Given** a push to any branch
**When** GitHub Actions runs
**Then** typecheck, lint, tests and the client build all run and the job fails if any of them fails

**Given** a push to `master`
**When** the build succeeds
**Then** the static client build is published to GitHub Pages by a GitHub Actions workflow, at a URL that opens on a phone
**And** if Pages is unavailable for the repository (private repo on a free plan), the story stops and reports it so the designer can decide (make the repo public, upgrade, or move the link to the VPS)
**And** the page is landscape-ready: `viewport-fit=cover`, devicePixelRatio capped at 2, and a "rotate your phone" overlay in portrait (FR1)

### Story 1.2: Shared simulation core

As the designer,
I want the game rules to run in one engine-free package with a fixed 20 Hz step, seeded randomness and data-driven numbers,
So that the same rules can later run on the server and the phone, and every run can be reproduced.

**Acceptance Criteria:**

**Given** `packages/shared`
**When** I create a World with `createWorld({ balance, seed })` and call `step(world, 0.05)`
**Then** the systems run in the fixed order from the architecture and the tick counter advances by 1

**Given** two Worlds created with the same seed and fed the same input log
**When** both run 1,000 ticks
**Then** their states are identical (Vitest test)
**And** the package contains no `Math.random()` or `Date.now()` calls (lint rule or test)

**Given** balance JSON files in `config/balance/` (starting with `weapons.json`, `zombies.json`, `waves.json`)
**When** `loadBalance()` runs
**Then** they are validated with zod into one typed `Balance` object
**And** an invalid value (e.g. negative damage) makes loading throw with the file and key named

**Given** a system emits `world.events.emit({ type: "zombie.killed", ... })` during a tick
**When** the tick ends
**Then** subscribers receive the events in emission order exactly once, and the payload is typed by the `SimEvent` union

**Given** the client
**When** a Game scene starts
**Then** it runs the World through a `SimHost` interface (local implementation stepping at 20 Hz) and renders by interpolating between steps

### Story 1.3: Move with a floating stick

As a player,
I want to move my survivor with a joystick that appears under my left thumb,
So that controls feel natural on any phone size.

**Acceptance Criteria:**

**Given** the game in landscape on a touch device
**When** I touch anywhere on the left half of the screen
**Then** a move stick appears centered where my thumb landed and disappears when I lift it

**Given** the move stick
**When** I push it less than 10% of its radius
**Then** the survivor does not move
**And** between 10% and 100% speed scales linearly up to 4.5 m/s (from balance) in the stick's direction

**Given** a placeholder street of 48 × 32 m with solid edges
**When** I move toward an edge
**Then** the survivor (radius 0.4 m) stops at it and cannot leave the map

**Given** the survivor moves
**When** I watch the screen
**Then** the camera follows the survivor and shows about 24 × 13.5 m of the map, clamped to the map edges (FR55)
**And** touches on the left half never trigger anything on the right half (multi-touch is tracked per pointer)

### Story 1.4: Walkers chase and hurt the player

As a player,
I want Walkers to shamble toward me as a crowd and hurt me when they reach me,
So that I feel the pressure of the horde.

**Acceptance Criteria:**

**Given** the World
**When** a Walker is spawned
**Then** it is stored in a pre-allocated struct-of-arrays pool (no per-spawn allocation) with stats from `zombies.json`: 10 HP, 1.2 m/s, 10 damage per hit, reward 2 (FR20, FR27)

**Given** Walkers on the map
**When** they move
**Then** each walks straight toward the nearest player
**And** separation forces using a 2 m spatial hash grid keep them from stacking on one spot (a crowd of 50 spreads into a visible mass)

**Given** a Walker touching the player
**When** it stays in contact
**Then** it deals 10 damage once per second
**And** the player has 100 HP, shown as a health bar in the HUD, with no regeneration (FR9)

**Given** the player reaches 0 HP
**When** the death happens
**Then** a "Game over" screen shows the wave reached and a Restart button that starts a new run with a new seed

**Given** the Walker AI
**When** Vitest runs with a fixed seed
**Then** tests cover chase direction, separation, contact damage timing and pool reuse

### Story 1.5: Aim and shoot the Pistol

As a player,
I want to aim with my right thumb and have my Pistol fire automatically,
So that I can fight the horde with two thumbs and no fire button.

**Acceptance Criteria:**

**Given** a touch on the right half of the screen
**When** I push the aim stick past 30% of its radius
**Then** the survivor faces that direction and the Pistol fires automatically at 3 shots/s while I hold it (FR3)
**And** below 30% the survivor aims but does not fire

**Given** the Pistol (5 damage, 9 m range, magazine 12, reload 1.0 s, from `weapons.json`)
**When** it fires
**Then** a visible projectile travels at 60 m/s with a fixed spread and no recoil climb, and disappears at 9 m (FR14, FR15)
**And** hits are found with swept segment-vs-circle tests so a projectile cannot pass through a zombie between ticks

**Given** the magazine is empty
**When** I keep aiming
**Then** the Pistol reloads automatically in 1.0 s with a visible reload indicator, then resumes firing; reserve ammo is unlimited (FR6)

**Given** a projectile hits a Walker
**When** damage is applied
**Then** the Walker flashes and is pushed back slightly (FR19); at 0 HP it plays a placeholder death and blood splat and emits `zombie.killed`
**And** a placeholder fire sound plays per shot and a reload sound plays on reload

### Story 1.6: Aim assist on touch

As a player on a phone,
I want my shots to bend slightly toward the nearest zombie,
So that aiming with a thumb feels reliable in a crowd.

**Acceptance Criteria:**

**Given** touch aiming
**When** a shot is fired and a zombie within the weapon's range is within 8° of the aim direction
**Then** the shot direction is turned toward the nearest such zombie (by distance), by at most 8° (FR4)

**Given** no zombie within 8° of the aim direction
**When** a shot is fired
**Then** it flies exactly along the aim direction (plus the weapon's normal spread)

**Given** mouse aiming (`isMouse` flag in the input)
**When** a shot is fired
**Then** no aim assist is applied

**Given** aim assist
**When** Vitest runs
**Then** tests cover the 8° limit, nearest-target choice, range limit and the mouse exception

### Story 1.7: Growing waves of Walkers

As a player,
I want waves of Walkers that grow each time, with a short breather between them and no hunt for the last stragglers,
So that the fight builds up the way a run should.

**Acceptance Criteria:**

**Given** a new run
**When** wave N starts
**Then** the wave spawns N × 40 Walkers (from `waves.json`) from spawn points at the map edges, with at most 150 alive at once and the rest queued (FR28)

**Given** a wave in progress
**When** only 5 of its zombies remain (alive plus queued)
**Then** those 5 are marked on screen (marker above each, edge arrows when off screen) and head straight for the nearest player from wherever they are, without any stat change (FR30, pillar 1)

**Given** the last zombie of the wave dies
**When** the wave ends
**Then** a "Wave N cleared" banner shows and the next wave starts after a 5 s pause (the build phase replaces this pause in Epic 3)
**And** the HUD shows the current wave number and zombies remaining

**Given** the wave director
**When** Vitest runs with a fixed seed
**Then** tests cover wave sizes, the 150-alive cap, queueing, the last-5 rule and wave end

### Story 1.8: Two weapon slots, SMG and Hunting Rifle

As a player,
I want to carry two weapons and swap between them, including an SMG and a Hunting Rifle,
So that I can pick a role and react to the situation.

**Acceptance Criteria:**

**Given** the start of a run in Epic 1
**When** the dev loadout picker is shown (temporary until the shop exists)
**Then** I can choose any 2 of Pistol, SMG, Machete (once 1.9 is done), Hunting Rifle for my two slots (FR12)

**Given** two weapons equipped
**When** I tap the swap button near my right thumb
**Then** the other weapon becomes active after 0.3 s, during which neither fires (FR5)

**Given** the SMG (4 damage, 12 shots/s, 8.5 m, 8° spread, magazine 40, reload 1.6 s)
**When** it fires
**Then** it behaves per the weapon table

**Given** the Hunting Rifle (35 damage, 1.2 shots/s, 17 m, magazine 5, reload 2.5 s)
**When** a shot crosses a line of zombies
**Then** it damages up to 5 zombies in order and then stops (FR16)
**And** each shot gives a short screen shake (FR19)

**Given** weapons in the HUD
**When** I play
**Then** the HUD shows both slots, the active weapon, and its magazine count

### Story 1.9: Machete melee

As a player,
I want to swing a Machete that hits every zombie in front of me,
So that I can fight up close in the crowd.

**Acceptance Criteria:**

**Given** the Machete is active (12 damage, 2.5 swings/s, 1.8 m reach, 110° arc)
**When** I aim past the dead zone
**Then** it swings automatically and instantly damages every zombie whose body overlaps the arc in the aim direction (FR14)
**And** a placeholder swing effect and sound play; there is no magazine or reload

**Given** a Machete hit
**When** it lands
**Then** each zombie hit flashes and is pushed back (FR19)

**Given** melee hits
**When** Vitest runs
**Then** tests cover arc angle, reach (measured to the zombie's edge), multi-hit and rate

### Story 1.10: Keyboard and mouse on desktop

As a player on a computer,
I want to play with WASD and the mouse,
So that I can test or play without a phone.

**Acceptance Criteria:**

**Given** a desktop browser
**When** I press W, A, S, D
**Then** the survivor moves at full speed in the combined direction (diagonals normalized)

**Given** the mouse
**When** I move it
**Then** the survivor aims at the cursor; holding left click fires; Q swaps weapons (FR7)
**And** input is sent with `isMouse: true` so aim assist is off

**Given** a device with both touch and mouse
**When** I switch between them
**Then** the last-used input method takes over without a reload

### Story 1.11: Performance overlay and 150-Walker stress test

As the designer,
I want an on-screen readout of frame rate and load, and a way to spawn 150 Walkers in view,
So that we know early whether phones can handle the horde.

**Acceptance Criteria:**

**Given** `?debug=1` in the URL or a three-finger tap
**When** the overlay is on
**Then** it shows FPS (current and 1-second minimum), zombies alive and in view, and simulation tick time

**Given** a development build
**When** I open the dev cheats
**Then** I can spawn N zombies of a type around me, skip the wave, toggle god mode and set the run seed
**And** these cheats are absent from the release build

**Given** god mode and 150 Walkers spawned inside the camera view
**When** the scene runs for 60 s on the reference phones (iPhone 12 class, Pixel 5 class)
**Then** the average and minimum FPS are recorded in `docs/perf/epic-1-stress.md`, against the target of 60 FPS and never below 30 (NFR1)
**And** if a phone misses the target, the note lists the measured bottleneck (rendering vs simulation) for follow-up

### Story 1.12: Melee and controls playtest on real phones

As the designer,
I want my friends and me to try the controls on our own phones,
So that we fix the feel (especially melee under twin-stick) before building on top of it.

**Acceptance Criteria:**

**Given** the published build
**When** at least 3 people play 3 waves each with Pistol + Machete and with SMG + Hunting Rifle on their own phones
**Then** their feedback on move stick, aim stick, auto-fire, aim assist, swap and melee is written to `docs/playtests/epic-1-controls.md`

**Given** the feedback
**When** it is reviewed with the designer
**Then** each issue is either fixed by tuning balance or control values (dead zones, aim-assist angle, melee arc), or turned into a new story
**And** the decision on melee under twin-stick (keep as is, tune, or change) is recorded

## Epic 2: Online co-op foundation

2–4 friends open a share link and fight the same horde together on 4G, with downed/revive and team wipe. The server runs the shared rules (authority); each phone predicts its own player and receives the horde through the compact horde stream. From Story 2.2 the game is served from the designer's VPS, which replaces the GitHub Pages link.

### Story 2.1: Game server and a room code

As a host,
I want to tap "Create game" and get a 4-letter code and a share link,
So that I can invite my friends.

**Acceptance Criteria:**

**Given** `apps/server`
**When** I run `npm run dev`
**Then** a Colyseus 0.18 server starts alongside the client, logs `server_started` as pino JSON, and answers `GET /health` with 200

**Given** the client's start screen (Preact overlay)
**When** I enter a name (1–16 characters) and tap "Create game"
**Then** a `RunRoom` is created whose id is a random 4-letter code without ambiguous letters (no I, O, 0, 1)
**And** the lobby shows the code and the link `https://<host>/j/<code>` with a Copy / Share button (Web Share API where available)

**Given** a client joins
**When** its balance version differs from the server's
**Then** it is refused with "Please refresh"

**Given** any client message
**When** it reaches the server
**Then** it is validated with its zod schema from `packages/shared/src/net`; messages over 1 KB, invalid messages and more than 25 inputs/s per client are dropped and logged at `warn`

### Story 2.2: Deploy to the VPS

As the designer,
I want the game running on my server under my subdomain with HTTPS,
So that my friends and I can test online co-op on real phones over 4G.

**Acceptance Criteria:**

**Given** `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/server.Dockerfile`
**When** the stack starts on the VPS
**Then** Caddy serves the client build and terminates HTTPS and WSS for the chosen subdomain of `sevend.io` with automatic certificates
**And** `index.html` is served with no-cache and hashed assets with a long cache

**Given** a WebSocket connection
**When** its origin is not the game's subdomain
**Then** it is refused

**Given** room creation
**When** one IP creates more than 10 rooms per minute
**Then** further creations are refused with a short message

**Given** a merge to `master`
**When** CI passes
**Then** a documented deploy command (or workflow) rebuilds and restarts the stack, and `docs/deploy.md` explains setup, deploy and rollback
**And** the server shuts down gracefully (rooms are closed with a "Server restarting" message)

### Story 2.3: Join by link, get ready, start

As a friend,
I want to open the link (or type the code), pick a name and tap Ready,
So that I join my friends' game in seconds.

**Acceptance Criteria:**

**Given** a share link `/j/<code>` or a code typed on the start screen
**When** I open it and enter a name
**Then** I join that room's lobby and see every player's name, color and Ready state

**Given** a device opening the game for the first time
**When** it connects
**Then** it creates a random guest token stored in localStorage (try/catch) and sends it on join; the server keeps it hashed in memory as the player's identity for the session

**Given** a lobby with 4 players
**When** a 5th tries to join
**Then** they see "This game is full"
**And** a wrong or expired code shows "Game not found"

**Given** the lobby
**When** every joined player is Ready and there are at least 2 players
**Then** the host's Start button is enabled; tapping it starts the run for everyone
**And** in development builds the host can start alone (for testing)

**Given** players in the lobby
**When** each joins
**Then** they get a stable slot 0–3 with a ring color (blue, orange, green, purple)

### Story 2.4: The server runs the fight

As a player,
I want the server to run one shared fight that all our phones show,
So that we all play the same game.

**Acceptance Criteria:**

**Given** a started run
**When** the room runs
**Then** it steps the shared World at 20 Hz and is the only writer of game state (architecture boundary 2)

**Given** each client
**When** it plays
**Then** it sends one input message per 50 ms step (move vector, aim vector, fire held, swap, `isMouse`, sequence number)
**And** the server applies the latest input per player each tick

**Given** players in the run
**When** they move
**Then** every phone shows all players moving, from Colyseus schema state (players, HP, loadouts, phase, wave, aliveCount)

**Given** the client
**When** online
**Then** the Game scene uses a networked `SimHost` implementation with no changes to scenes (the local one remains for tests and dev)

**Given** a tick slower than 40 ms on the server
**When** it happens
**Then** it is logged at `warn` with `roomId` and tick time

### Story 2.5: Horde stream

As a player,
I want to see the whole horde move smoothly on my phone over 4G,
So that big hordes work online.

**Acceptance Criteria:**

**Given** the server each tick
**When** it sends horde data to a client
**Then** it sends one binary message with header `[tick u32][count u16]` and 8-byte records `[id u16][x u16][y u16][heading u8][typeState u8]` for zombies inside that client's view plus a 4 m margin (found with the spatial grid)

**Given** zombie ids
**When** a zombie dies
**Then** its pool slot is held 1 s before reuse and carries a generation bit, so a new zombie never interpolates from a dead one

**Given** the client
**When** horde messages arrive
**Then** it keeps the last 3 snapshots and renders zombies ~100 ms behind with interpolation
**And** a zombie missing from 3 consecutive snapshots is removed from view; deaths come as reliable `zombie.killed` events so the death plays exactly once

**Given** a client whose socket `bufferedAmount` exceeds 64 KB
**When** a new horde frame is due
**Then** it is skipped for that client (never queued) until the buffer drains

**Given** the encoder and decoder
**When** Vitest runs
**Then** round-trip tests cover quantization (1 cm), clamping, generation bits and empty frames
**And** a test with 150 zombies in view measures ≤ 24 KB/s per client at 20 Hz

### Story 2.6: Instant feel for my own survivor

As a player,
I want my own movement and aim to respond instantly even with 150 ms of lag,
So that the game feels good on 4G.

**Acceptance Criteria:**

**Given** the local player
**When** I move or aim
**Then** the client applies my input immediately to a predicted copy of my survivor using the shared movement code

**Given** a server snapshot for my player
**When** it arrives
**Then** the client replays my unacknowledged inputs (by sequence number) from the server state; small errors are smoothed, large ones snap

**Given** remote players and zombies
**When** they are rendered
**Then** they use an interpolation delay that adapts between 100 and 150 ms from measured jitter

**Given** a simulated 150 ms latency with 20 ms jitter (dev network throttle)
**When** I move in a circle for 30 s
**Then** my survivor shows no visible rubber-banding

### Story 2.7: Server-confirmed hits

As a player,
I want shots to look instant on my screen while the server decides what they hit,
So that all of us agree on what happened.

**Acceptance Criteria:**

**Given** a player fires
**When** the server processes the shot
**Then** it simulates the projectile or melee arc itself, spawning it at the shooter's position advanced by half the round-trip time (capped at 150 ms)
**And** aim assist is applied on the server using server zombie positions

**Given** a shot
**When** the server emits `weapon.fired`
**Then** other clients draw a cosmetic projectile; the shooter's own muzzle flash, sound and projectile appear instantly from local input

**Given** hits and kills
**When** the server confirms them
**Then** clients play hit flashes, pushback and deaths only from server events; the client never removes a zombie on its own

**Given** development builds
**When** a local shot looks like a hit but the server reports a miss
**Then** a "reversed hit" counter increments and is shown in the performance overlay (used by Story 2.10)

### Story 2.8: Downed, revive and team wipe

As a player,
I want to go down instead of dying, and be revived by a teammate,
So that we survive by helping each other.

**Acceptance Criteria:**

**Given** a player at 0 HP
**When** they go down
**Then** they cannot move or fire, a 20 s countdown shows above them, and `player.downed` is emitted (FR10)

**Given** a downed player
**When** a standing teammate stays within 1.2 m of them for 3 s (progress ring shown; moving away resets it)
**Then** the player is revived with 30% of max HP and `player.revived` is emitted

**Given** the 20 s run out
**When** no one has revived the player
**Then** they are out: they spectate a teammate until the next wave starts, then return at full position next to a standing teammate with 50% HP (the build phase takes over this return in Epic 3)

**Given** no player is standing (everyone downed or out)
**When** that happens
**Then** the run ends for everyone with a Results screen (wave reached, kills per player) and a "Back to lobby" button (FR11)

**Given** downed, revive and wipe rules
**When** Vitest runs
**Then** tests cover timers in ticks, revive reset, out/return and wipe detection

### Story 2.9: Player rings and teammate arrows

As a player,
I want to see who is who and where my teammates are when they're off screen,
So that we can stick together.

**Acceptance Criteria:**

**Given** each player
**When** rendered
**Then** they have a colored ground ring by slot (blue, orange, green, purple) and their name above them

**Given** a teammate outside my camera view
**When** I play
**Then** an arrow in their color at the screen edge points toward them, showing a downed icon if they are down

**Given** a downed teammate
**When** they are on or off screen
**Then** their marker pulses so the revive opportunity is obvious

### Story 2.10: 4-phone 4G test

As the designer,
I want to play a full wave with 4 phones on 4G and measure it,
So that we prove online co-op with big hordes works (Milestone 1's first goal).

**Acceptance Criteria:**

**Given** the performance overlay
**When** online
**Then** it also shows ping and bandwidth in and out (KB/s)

**Given** 4 phones on 4G (or a 150 ms throttle) playing a wave with 150 Walkers alive
**When** the wave ends
**Then** each phone's average download is ≤ 30 KB/s (NFR4), reversed hits are < 1 in 20 (NFR5), FPS is recorded, and the players report no visible disagreement (NFR3)
**And** results are written to `docs/perf/epic-2-network.md`

**Given** the results
**When** reversed hits are ≥ 1 in 20
**Then** a follow-up story is created to enable hit testing against 300 ms of rewound zombie positions (architecture upgrade path)
**And** headless bot clients in `tools/bots` can fill a room with up to 4 fake players for repeatable load tests

## Epic 3: Build phase and economy

A team plays 5 waves with build phases: earning into personal wallets, buying from a fixed-list shop, and placing Auto-turrets and Wood barricades on a grid. Runners and Crawlers join the horde, zombies path around and break buildings, and zombie count scales with player count. The 6-card roguelike shop replaces the fixed list in Epic 5.

### Story 3.1: Build phase between waves

As a player,
I want a 30-second build phase before the first wave and after every wave, which ends early when we're all ready,
So that we have a breather to prepare.

**Acceptance Criteria:**

**Given** the server
**When** a run starts
**Then** it follows an explicit run state machine (`run/runStateMachine.ts`): Lobby → Build → Wave → Build → … → Results, with transitions only through named functions (`startBuild`, `startWave`, `endWave`, `endRun`)

**Given** a build phase
**When** it starts (including before wave 1)
**Then** a 30 s countdown (counted in ticks) and a Ready button show to every player, and no zombies spawn
**And** the phase ends when the countdown reaches 0 or every connected player has tapped Ready (FR44)

**Given** a build phase starts
**When** players are standing, downed or out
**Then** every player is healed by 50% of max HP (capped at max), and downed or out players return standing next to a teammate (replacing the Story 2.8 return rule) (FR9, FR10)

**Given** the wave pause from Story 1.7
**When** this story is done
**Then** the 5 s pause is removed; the build phase replaces it

### Story 3.2: Personal wallets and rewards

As a player,
I want to earn my own money from kills, assists, revives and cleared waves,
So that what I buy reflects how I played and helps the team.

**Acceptance Criteria:**

**Given** a new run
**When** it starts
**Then** each player has a personal wallet of 100 currency (from `economy.json`), shown in the HUD and the shop (FR12)

**Given** a zombie is killed by a player
**When** `zombie.killed` is processed by the economy system
**Then** the killer gets the type's reward (Walker 2, Runner 3, Crawler 3…), and every other player who damaged that zombie gets 50% of it as an assist, rounded down (FR45)

**Given** a revive completes
**When** `player.revived` is processed
**Then** the reviver gets +25

**Given** wave N ends
**When** the wave-clear bonus is paid
**Then** every player in the run, including downed and out players, gets 10 × N

**Given** money is earned
**When** it lands
**Then** a small "+N" pops up near the player; the wallet lives in schema state and only the server changes it

**Given** the reward rules
**When** Vitest runs
**Then** tests cover kill, assist split, revive and wave bonus amounts

### Story 3.3: Fixed-list shop

As a player,
I want to buy weapons from a shop during the build phase,
So that I can change my loadout as the run goes on.

**Acceptance Criteria:**

**Given** a build phase
**When** I tap the Shop button
**Then** a Preact shop screen opens listing Machete 150, SMG 200, Hunting Rifle 350 (the Pistol is free and owned), with prices from balance data
**And** the shop overlay leaves the screen's touch zones usable when closed (`pointer-events: none`)

**Given** I buy a weapon with enough money
**When** both slots are full
**Then** I choose which slot it replaces; the replaced weapon is lost (no selling)

**Given** I tap an item I can't afford
**When** the server validates the purchase
**Then** it returns a `Result` error and the shop shows "Not enough money"; nothing changes

**Given** a wave starts
**When** the shop is open
**Then** it closes automatically

**Given** the dev loadout picker from Story 1.8
**When** this story is done
**Then** it moves to the dev cheats; normal runs start with Pistol only

### Story 3.4: Place a wood barricade

As a player,
I want to place barricades on a grid during the build phase,
So that I can close paths and shape the fight.

**Acceptance Criteria:**

**Given** a build phase and the Wood barricade (40 currency) in the shop
**When** I tap it and then tap the ground
**Then** a preview snaps to a 1 m grid near that point; dragging rotates it in 90° steps; the preview is green when valid and red when blocked (FR50)

**Given** a valid preview
**When** I confirm
**Then** the server places a 2 m × 0.5 m barricade with 200 HP, charges me 40, and emits `building.placed`

**Given** a blocked spot (map edge, another building, a player standing there)
**When** I try to confirm
**Then** the server refuses with "Can't build here"

**Given** I already own 6 buildings
**When** I try to buy another
**Then** it is refused with "Building limit reached (6)" (FR51)

**Given** a placed barricade
**When** players and zombies move
**Then** neither can pass it; projectiles pass over it (FR53)
**And** it persists across waves until destroyed

### Story 3.5: Zombies path around and break buildings

As a player,
I want zombies to find their way around obstacles and smash through barricades that block them,
So that defenses buy time without making us invincible.

**Acceptance Criteria:**

**Given** the World
**When** buildings are placed or destroyed
**Then** a flow field on a 0.5 m grid toward the nearest player is rebuilt (amortized over several ticks, at most one rebuild per tick)
**And** zombies follow the field instead of walking straight, with separation still applied (FR26)

**Given** a zombie whose path to the player is blocked by a building
**When** it reaches the building
**Then** it attacks the building with its normal damage and attack rate

**Given** a building at 0 HP
**When** it is destroyed
**Then** it is removed, `building.destroyed` is emitted, and the flow field is rebuilt

**Given** a building
**When** it is damaged
**Then** a health bar and a damaged look show on it

**Given** flow fields
**When** Vitest runs with a fixed seed
**Then** tests cover routing around a wall, a fully closed path leading to building attacks, and rebuild after destruction
**And** a benchmark shows a full-map rebuild for 48 × 32 m fits in the tick budget when amortized

### Story 3.6: Auto-turret

As a player,
I want to buy an auto-turret that shoots nearby zombies,
So that I can hold a spot or cover a flank.

**Acceptance Criteria:**

**Given** a build phase
**When** I buy and place an Auto-turret (250 currency) using the same placement rules as barricades (1 × 1 m footprint)
**Then** it has 300 HP and counts toward my 6-building cap

**Given** a wave
**When** a zombie is within 8 m of the turret
**Then** it turns to the nearest zombie and shoots 5 times/s for 3 damage per shot (visible placeholder projectiles)

**Given** my turret kills a zombie
**When** the reward is paid
**Then** I get 50% of the kill reward, rounded down (FR45)

**Given** zombies blocked by or next to a turret
**When** it blocks their path
**Then** they attack it like any building

### Story 3.7: Repair buildings

As a player,
I want to repair my damaged buildings during the build phase,
So that a defense that held can keep holding.

**Acceptance Criteria:**

**Given** a build phase and one of my damaged buildings
**When** I tap it
**Then** a Repair button shows the cost of a full repair: 50% of the building's price (FR51)

**Given** I tap Repair with enough money
**When** the server validates it
**Then** the building returns to full HP and I'm charged

**Given** a teammate's building
**When** I tap it
**Then** I can repair it too, paying from my wallet

### Story 3.8: Runners flank

As a player,
I want fast Runners that go around our front line,
So that we have to watch our sides.

**Acceptance Criteria:**

**Given** a Runner (6 HP, 4.0 m/s, 8 damage per hit, reward 3, from `zombies.json`)
**When** it chases
**Then** it follows a second flow field that penalizes cells in front of players (within ±45° of their aim direction), so it tends to arrive from the side or behind (FR21)

**Given** a thin, leaning placeholder silhouette and a shriek sound
**When** a Runner appears
**Then** players can tell it apart from Walkers at a glance

**Given** Runner behavior
**When** Vitest runs with a fixed seed
**Then** a test shows Runners reach a player's flank more often than Walkers in the same setup

### Story 3.9: Crawlers slow you down

As a player,
I want low Crawlers that are easy to miss and slow me when they bite,
So that the crowd has hidden dangers.

**Acceptance Criteria:**

**Given** a Crawler (8 HP, 0.7 m/s, 12 damage per hit, reward 3)
**When** it bites a player
**Then** the player is slowed by 30% for 1 s (refreshes, doesn't stack) (FR22)

**Given** a Crawler moves
**When** rendered
**Then** it has a long, low silhouette drawn beneath other zombies and leaves a blood trail that fades after 5 s

### Story 3.10: Five-wave run with player-count scaling

As a team,
I want a 5-wave run that grows the horde and adds Runners and Crawlers, sized to how many of us play,
So that the run feels right with 2, 3 or 4 players.

**Acceptance Criteria:**

**Given** `waves.json`
**When** waves 1–5 run with 4 players
**Then** sizes are ≈ 40, 80, 120, 160, 200 zombies; W1 Walkers only, W2 adds Runners, W3 adds Crawlers, W4–W5 mix all three (Spitters and the first Brute come in Epic 5) (FR28, FR29)

**Given** 2 or 3 players at the start of a wave
**When** the wave size is computed
**Then** it is multiplied by 0.6 (2 players) or 0.8 (3 players) (FR31)

**Given** the team clears wave 5
**When** the run ends
**Then** a temporary "You held out!" Results screen shows wave reached, kills and money earned per player (the full 10-wave run arrives in Epic 6)

**Given** a full 5-wave run with 4 bots
**When** the economy is logged
**Then** each player's total earnings are written to the test output so the economy can be compared with the GDD target (≈ 2,500–3,000 over 10 waves)

## Epic 4: Downtown and city decay (Milestone 1)

2–4 players online in Downtown play 5 waves through Evening → Panic → Breakdown: cars move into the road, police barriers block paths, cars burn. Placeholder Dead City art, cover rules, spawn points and named seed streams. The epic ends with the Milestone 1 playtest.

### Story 4.1: Downtown map

As a player,
I want to fight in a hand-made Downtown with an open intersection, narrow alleys and landmarks,
So that the map gives us places to hold and choices to make.

**Acceptance Criteria:**

**Given** `tools/maps/downtown.tmx` authored in Tiled and exported to `apps/client/public/assets/maps/downtown.tmj`
**When** I open it
**Then** it is ~48 × 32 m with a central intersection, 3 alleys, a gas station corner, a crashed city bus mid-map and a small parking lot (FR54)
**And** it has the layers `collision`, `cover`, `spawns`, `hazards` and visual layer groups `stage1_evening` … `stage5_collapse` (stages 4–5 may stay empty until Epic 6)

**Given** `packages/shared/src/map`
**When** a run starts in Downtown
**Then** the district is loaded from the Tiled JSON into the World's collision grid, replacing the placeholder street
**And** the server and the client load the same map data, so prediction collides like the server

**Given** the map loader
**When** Vitest runs
**Then** tests load `downtown.tmj` and check map size, collision cells and named objects

### Story 4.2: Cover and bullet rules

As a player,
I want cars and the bus to stop bullets while barriers and sandbags only stop bodies,
So that cover works the way it looks.

**Acceptance Criteria:**

**Given** cover objects with a `kind` property in the `cover` layer (`car`, `bus`, `barrier`, `sandbags`)
**When** players or zombies move
**Then** all four kinds block movement and are part of the flow-field obstacles (FR56)

**Given** a projectile
**When** it reaches a `car` or `bus`
**Then** it stops
**And** it passes over `barrier` and `sandbags` (like over player barricades)

**Given** melee
**When** a zombie is behind a car
**Then** melee arcs still hit within reach (melee ignores cover in v1)

**Given** cover rules
**When** Vitest runs
**Then** tests cover each kind for movement and projectiles

### Story 4.3: Spawn points

As a player,
I want zombies to pour in from alleys, manholes and broken shop windows,
So that the horde feels like it comes out of the city.

**Acceptance Criteria:**

**Given** spawn objects in the `spawns` layer with a `minStage` property
**When** a wave spawns
**Then** zombies come only from spawn points active at the current decay stage (FR32)

**Given** a spawn point within 6 m of any player
**When** spawning
**Then** it is skipped for that spawn so zombies don't appear on top of players

**Given** several active spawn points
**When** the wave director picks one
**Then** the choice uses the run's seeded RNG and spreads spawns across the map edges

**Given** the collision and grid view (dev)
**When** turned on
**Then** spawn points are drawn with their stage and active state

### Story 4.4: Named seed streams

As the designer,
I want each run's random choices to come from one run seed with separate streams,
So that we can replay a run exactly to test or fix it.

**Acceptance Criteria:**

**Given** a run seed
**When** the run starts
**Then** named sub-streams are derived for `decay`, `events`, `spawns` and `shop:<playerSlot>:<buildPhaseIndex>` (FR65)
**And** drawing from one stream never changes another's sequence

**Given** the Results screen and the performance overlay
**When** shown
**Then** they display the run seed

**Given** the dev cheat "set run seed"
**When** I start two runs with the same seed and a recorded input log
**Then** the headless replay reaches the same state (decay choices, spawns, kills)

### Story 4.5: Decay stage engine

As a player,
I want the city to change between waves as the run goes on,
So that wave 5 doesn't play like wave 1.

**Acceptance Criteria:**

**Given** `decay.json` (waves 1–2 → stage 1, 3–4 → stage 2, 5–6 → stage 3, 7–8 → stage 4, 9–10 → stage 5)
**When** a build phase starts and the stage for the next wave differs from the current one
**Then** `DecaySystem` applies that stage's mutation set from the map (`add | remove | ignite | block`), rebuilds collision and flow fields, and emits `decay.stage_changed` (FR58)
**And** decay never changes mid-wave

**Given** random variations (e.g. which cars move or burn)
**When** a run starts
**Then** `DecayTimeline` picks them once from the `decay` seed stream

**Given** a building on a cell that becomes blocked
**When** the stage is applied
**Then** the building is destroyed and its owner is refunded 50% of its price

**Given** `decay.stage_changed` on the client
**When** it arrives
**Then** `DecayView` swaps the visible `stageN_*` layer group and shows a banner with the stage name ("Panic")
**And** client prediction applies the same mutations to its own map

**Given** the decay engine
**When** Vitest runs
**Then** tests cover stage timing, each mutation action, building destruction with refund, and same-seed variation choices

### Story 4.6: Evening

As a player,
I want the run to start on a normal evening with parked cars and lit shops,
So that I know the city before it falls.

**Acceptance Criteria:**

**Given** stage 1 (waves 1–2)
**When** the run starts
**Then** the map is open with full lighting, parked cars along the curbs act as cover (`car`), and lit shop fronts mark good spots to build (FR59)
**And** a placeholder ambience loop (traffic, distant music) plays

### Story 4.7: Panic

As a player,
I want cars to end up in the road and police barriers to block streets,
So that the map gives new cover and new choke points.

**Acceptance Criteria:**

**Given** the build phase before wave 3
**When** stage 2 is applied
**Then** 4 cars (picked by the `decay` stream from candidates in the map) move from the curb into the road, and police barriers (`barrier`) close some paths (FR60)
**And** the sirens/car-alarm placeholder ambience replaces the evening loop

**Given** the new layout
**When** zombies path
**Then** the flow fields route around the new cars and barriers

### Story 4.8: Breakdown and car fires

As a player,
I want burning cars, sandbags and rain as things break down,
So that fire becomes a danger and a tool.

**Acceptance Criteria:**

**Given** the build phase before wave 5
**When** stage 3 is applied
**Then** 2 cars (picked by the `decay` stream) ignite into fire zones of 2 m radius that last 2 waves, free sandbag cover appears, and placeholder rain starts (FR61)

**Given** a fire zone
**When** a player, zombie or building is inside it
**Then** it takes 10 damage per second (FR57, FR53)

**Given** fire zones
**When** zombies path
**Then** the flow field treats fire cells as very costly, so zombies avoid them unless there's no other way

**Given** fire zones
**When** Vitest runs
**Then** tests cover damage to each target type and expiry after 2 waves

### Story 4.9: Placeholder Dead City look

As the designer,
I want Downtown to already look like a rainy city at night, even with placeholder art,
So that we judge the milestone on the right mood.

**Acceptance Criteria:**

**Given** placeholder art (AI-assisted or reused from `style-lab-r3.html`)
**When** Downtown is shown
**Then** it uses a muted night palette with streetlight and shop glow, top-down humanoid survivors and zombies, and distinct silhouettes per zombie type (FR82)

**Given** placeholder atlases
**When** they are loaded
**Then** they follow the final atlas layout and `category_name_variant` naming, are ≤ 2048 × 2048, and the first-load download stays under 15 MB

### Story 4.10: Milestone 1 playtest

As the designer,
I want my friends and me to play the Milestone 1 build online,
So that we know big-horde co-op works on our phones before building more.

**Acceptance Criteria:**

**Given** the deployed build
**When** 2–4 friends play full 5-wave runs in Downtown on their own phones over 4G
**Then** FPS, bandwidth and reversed hits are recorded for each phone in `docs/perf/milestone-1.md` against NFR1, NFR3–NFR5

**Given** the playtest
**When** it ends
**Then** feedback on fun, difficulty, economy, building and decay is written to `docs/playtests/milestone-1.md`
**And** the designer records a go / fix-first decision for starting Epic 5, with any fixes turned into stories

## Epic 5: Full arsenal and bestiary

Every weapon, upgrade, zombie, building, gear item and consumable from the GDD, plus the 6-card roguelike shop. Every zombie type demands its own answer. Until Epic 6 the temporary run grows to 6 waves so Spitters (W4), the first Brute (W5) and Bloaters (W6) all appear. Until Epic 7 every player's pool contains every item.

### Story 5.1: Weapon upgrades I–IV

As a player,
I want to upgrade the weapons I own,
So that my favourite gun keeps up as the horde grows.

**Acceptance Criteria:**

**Given** the shop in a build phase
**When** I own a weapon below level IV
**Then** an Upgrade item for it is always available at 60% of the weapon's base price per level (Pistol 60 per level) (FR17, FR46)

**Given** I buy an upgrade
**When** the server validates it
**Then** the weapon's level rises by 1 and its damage becomes base × (1 + 0.25 × (level − 1)) (level IV = 175%)
**And** the HUD slot shows the level (I–IV)

**Given** I replace an upgraded weapon with another
**When** the old one is dropped
**Then** its upgrades are lost with it

**Given** upgrades
**When** Vitest runs
**Then** tests cover damage per level and prices, including the SMG level III one-hit Runner breakpoint

### Story 5.2: Fire Axe and Chainsaw

As a player,
I want heavy melee options,
So that I can carve through the crowd up close.

**Acceptance Criteria:**

**Given** the Fire Axe (30 damage, 1.1 swings/s, 2.2 m, 140° arc, 300)
**When** it hits
**Then** every zombie in the arc takes damage and is knocked back 1.5 m, and a short screen shake plays (FR13, FR16, FR19)

**Given** the Chainsaw (6 damage per tick, 10 ticks/s, 1.5 m, 60° arc, 600)
**When** I aim past the dead zone
**Then** it damages continuously every zombie in the arc and I move 20% slower while it is active (FR16)

**Given** both weapons
**When** Vitest runs
**Then** tests cover arcs, knockback distance, tick rate and the speed penalty

### Story 5.3: Shotgun and Assault Rifle

As a player,
I want a short-range Shotgun and a mid-long Assault Rifle,
So that I have more ways to fill my role.

**Acceptance Criteria:**

**Given** the Shotgun (8 pellets × 4 damage, 1.2 shots/s, 5 m, 30° spread, knockback 0.5 m, magazine 6, reload 2.5 s, 250)
**When** it fires
**Then** 8 pellets fly in a 30° spread, each a projectile; a zombie hit by pellets is knocked back 0.5 m once per shot

**Given** the Assault Rifle (7 damage, 8 shots/s, 11 m, 4° spread, magazine 30, reload 2.0 s, 450)
**When** it fires
**Then** it behaves per the weapon table

### Story 5.4: Flamethrower and fire friendly fire

As a player,
I want a Flamethrower that sets the crowd alight,
So that I can hold a choke point, while being careful of my friends.

**Acceptance Criteria:**

**Given** the Flamethrower (20 damage/s, 4 m, 35° cone, 6 s of fuel, 3.0 s reload, 700)
**When** I aim past the dead zone
**Then** it damages everything in the cone continuously and ignites zombies for +3 damage/s for 3 s (re-ignition refreshes the timer) (FR16)

**Given** a damage source tagged `fire` or `explosion`
**When** it hits a teammate or the shooter
**Then** they take 50% of its damage; bullets and melee never hurt players (FR18)
**And** this rule lives in the combat damage system and applies to every later fire and explosion source

**Given** the friendly-fire rule
**When** Vitest runs
**Then** tests cover bullets (0%), melee (0%), fire (50%) and explosions (50%)

### Story 5.5: Grenade Launcher

As a player,
I want a Grenade Launcher that lobs explosive rounds,
So that I can blow apart packed crowds at a distance.

**Acceptance Criteria:**

**Given** the Grenade Launcher (40 damage, 0.8 shots/s, 12 m lob, 2 m blast, magazine 4, reload 3.0 s, 800)
**When** it fires
**Then** a visible lobbed round lands at the aim point (capped at 12 m) and explodes, damaging every zombie within 2 m, with a screen shake (FR14)

**Given** the shooter or a teammate within the blast
**When** it explodes
**Then** they take 50% damage (Story 5.4 rule)

### Story 5.6: Spitters

As a player,
I want Spitters that hang back and spit acid,
So that camping behind turrets has a price.

**Acceptance Criteria:**

**Given** a Spitter (12 HP, 1.5 m/s, 15 damage per spit, reward 5)
**When** a player is within 6 m with line of sight
**Then** it stops, rears back with a glowing mouth for 0.6 s, then spits a visible projectile at the player, every 3 s (FR23, FR84)

**Given** a spit lands
**When** it hits the ground or a player
**Then** it leaves an acid puddle for 3 s that deals 5 damage/s to players inside it

**Given** `waves.json`
**When** wave 4 runs
**Then** Spitters join the mix (FR29)
**And** a placeholder gurgle sound plays during the windup

### Story 5.7: The first Brute

As a team,
I want a Brute to show up in wave 5 as a mini-boss,
So that we learn to focus fire and protect our buildings.

**Acceptance Criteria:**

**Given** a Brute (120 HP, 1.0 m/s, 35 damage per hit + 1.5 m knockback on the player, reward 25)
**When** it hits a building
**Then** it deals 3× damage (FR25)
**And** knockback from player weapons moves it only 20% of the normal distance

**Given** wave 5
**When** the first Brute spawns
**Then** a roar plays and a short "Brute!" banner shows (mini-boss moment)
**And** later waves may contain more Brutes per `waves.json`

### Story 5.8: Bloaters

As a player,
I want swollen Bloaters that explode,
So that tight crowds and careless melee become dangerous.

**Acceptance Criteria:**

**Given** a Bloater (25 HP, 0.9 m/s, reward 6)
**When** it touches a player
**Then** it swells for 1 s (visible and audible telegraph) and then explodes, even if the player moved away (FR24, FR84)

**Given** a Bloater dies or explodes
**When** the blast happens
**Then** players within 2.5 m take 30 damage, zombies within 2.5 m take 40, and a gas cloud of 2.5 m radius stays for 4 s, slowing players inside it by 30%

**Given** `waves.json`
**When** the temporary run is played
**Then** it now lasts 6 waves and Bloaters join in wave 6 (FR29)

**Given** Bloater rules
**When** Vitest runs
**Then** tests cover both explosion triggers, damage values per target and the gas slow

### Story 5.9: Metal barricade, spike trap and mine

As a player,
I want stronger walls and traps,
So that my defenses can grow with the waves.

**Acceptance Criteria:**

**Given** one of my wood barricades in a build phase
**When** I tap it and choose Upgrade (+120)
**Then** it becomes a metal barricade with 600 HP (FR52)

**Given** a spike trap (2 × 2 m floor, 300 HP, 80)
**When** zombies walk on it
**Then** they take 4 damage/s and move 40% slower; players can walk on it unharmed; it doesn't block paths

**Given** a mine (60, single use)
**When** a zombie comes within 1 m
**Then** it explodes for 80 damage within 2.5 m (players in range take 50%) and is removed
**And** mines count toward the 6-building cap until they explode

### Story 5.10: Floodlight and med station

As a player,
I want lights and healing I can build,
So that we have a safe spot to fall back to.

**Acceptance Criteria:**

**Given** a floodlight (150 HP, 100)
**When** placed
**Then** it lights an 8 m circle and is recorded as a light source in the server's light state (used by blackout waves in Epic 6)

**Given** a med station (300 HP, 400)
**When** players stand within 2 m of it
**Then** they heal 5 HP/s up to their max HP (downed players are not healed)

### Story 5.11: Gear

As a player,
I want gear that changes how I play for the rest of the run,
So that my build is more than my weapons.

**Acceptance Criteria:**

**Given** gear bought in the shop
**When** I own it
**Then** it lasts the whole run and shows as an icon in the HUD (FR48)

**Given** each gear item
**When** owned
**Then** Body armor I gives +25 max HP (150), Body armor II +50 (350, replaces armor I), Running shoes +10% speed (150), Revive kit cuts my revive time from 3 s to 1.5 s (150), Tactical flashlight is recorded for the blackout light cone in Epic 6 (120)
**And** each item can be owned once

### Story 5.12: Consumables

As a player,
I want a quick-use slot for medkits, grenades and molotovs,
So that I have an emergency answer.

**Acceptance Criteria:**

**Given** a consumable button near my right thumb (and E on desktop)
**When** I tap it
**Then** the item in my single slot is used (FR8, FR49)

**Given** the consumables
**When** used
**Then** Medkit (60) heals 50 instantly; Grenades ×3 (80) throw one grenade up to 8 m in the aim direction for 40 damage in 2.5 m; Molotovs ×2 (100) throw one that makes a 3 m fire zone for 4 s at 8 damage/s
**And** grenades and molotovs follow the 50% friendly-fire rule

**Given** I buy a consumable
**When** my slot holds the same type
**Then** it refills to the pack size; a different type replaces it

### Story 5.13: Roguelike card shop

As a player,
I want each build phase to offer me 6 random weapon and gear cards,
So that every build phase is a different choice.

**Acceptance Criteria:**

**Given** a build phase
**When** I open the shop
**Then** I see an always-available section (buildings, consumables, repairs, upgrades for weapons I own) and 6 cards of weapons and gear drawn from my pool (FR46, FR47)
**And** the offer always contains at least 1 weapon and 1 gear card; weapons and gear I already own are not drawn

**Given** the draw
**When** it is made
**Then** it uses my `shop:<playerSlot>:<buildPhaseIndex>` seed stream, and only I receive my offer (schema `@view()` or a direct message)

**Given** I tap Reroll (20)
**When** I can afford it
**Then** I get 6 new cards from the next draws of my stream

**Given** I buy a card
**When** the server validates it
**Then** it checks the item is in my stored offer, then removes it from the offer

**Given** the card draw
**When** Vitest runs
**Then** tests cover the card floor, owned-item exclusion, reroll and same-seed reproducibility
**And** the fixed-list shop from Story 3.3 is removed

## Epic 6: The full run: decay, boss, events, endless

A team plays the full 10 waves from Evening to the Behemoth through Ruins and Collapse (blackout, fog), meets the special events, votes to extract or stay, and can go endless.

### Story 6.1: The full 10-wave curve

As a team,
I want the run to last 10 waves with the full zombie mix,
So that a run builds to a real climax.

**Acceptance Criteria:**

**Given** `waves.json`
**When** a run is played with 4 players
**Then** wave sizes grow by ≈ 40 per wave from ≈ 40 (W1) to ≈ 400 (W10), still at most 150 alive, and the mix follows the introduction order: W7–9 full mix, W10 finale with the largest horde (FR28, FR29)
**And** the 0.6 / 0.8 player-count multipliers still apply

**Given** the temporary 6-wave ending from Epic 5
**When** this story is done
**Then** it is removed; until Story 6.11 exists, clearing wave 10 shows the Results screen

**Given** a full 10-wave run with 4 bots
**When** the economy is logged
**Then** each player's earnings are compared with the 2,500–3,000 target and the result is written to the test output

### Story 6.2: Ruins

As a player,
I want rubble to close an alley and new holes to open in the walls,
So that the map squeezes us as the city breaks.

**Acceptance Criteria:**

**Given** the build phase before wave 7
**When** stage 4 is applied
**Then** rubble closes one alley (picked by the `decay` stream) and blocks other paths, collapsed walls activate new spawn points (`minStage: 4`), and streetlights start flickering (FR62)
**And** cells covered by rubble refuse building placement ("Can't build here") (FR53)

**Given** stage 4
**When** it plays
**Then** the wind and falling-debris placeholder ambience plays

### Story 6.3: Blackout lighting

As a player,
I want blackout waves where only flashlights, floodlights, fires and muzzle flashes light the dark,
So that light becomes something we fight for.

**Acceptance Criteria:**

**Given** the server's light state
**When** the blackout flag is on
**Then** the client draws a darkness render texture at half resolution over the map, cutting out each player's flashlight cone along their aim (60°, 8 m; Tactical flashlight 80°, 12 m), floodlight circles (8 m), fire zones and muzzle flashes (FR64)
**And** zombie eyes are drawn above the darkness

**Given** the blackout flag is off
**When** the game renders
**Then** no darkness texture is drawn (no cost)

**Given** quality settings
**When** a player looks for a way to turn darkness off
**Then** there is none: blackout darkness is gameplay (FR87)

**Given** the dev cheat "force blackout"
**When** used with 150 zombies in view on the reference phones
**Then** FPS is recorded in `docs/perf/epic-6-blackout.md`

### Story 6.4: Collapse

As a player,
I want the power to die, fog to roll in, and wave 9 to be fought in the dark,
So that the run hits its tension peak.

**Acceptance Criteria:**

**Given** the build phase before wave 9
**When** stage 5 is applied
**Then** the power is out (streetlights and shop glow removed from the light state), wave 9 is a blackout wave, and fog limits vision to 10 m (FR63)

**Given** fog
**When** a zombie is more than 10 m from the local player
**Then** it is hidden by the fog on that player's screen; fog vision cannot be turned off (only its visual quality can)

**Given** wave 10
**When** it plays
**Then** it is also dark, lit only by fires, floodlights, flashlights and muzzle flashes
**And** the near-silence placeholder ambience plays (growls and rain)

### Story 6.5: The Behemoth arrives

As a team,
I want a huge boss to crash into wave 10 while the horde is still coming,
So that the run ends with a fight we'll talk about.

**Acceptance Criteria:**

**Given** wave 10
**When** half of the wave's zombies have spawned
**Then** the Behemoth enters from a spawn point: radius 2 m, 1.3 m/s, immune to knockback, 6,000 HP × the player-count multiplier (0.6 / 0.8 / 1.0) (FR33, FR31)
**And** a boss health bar appears at the top of the screen and placeholder boss music starts

**Given** the Behemoth near players
**When** it uses ground slam
**Then** it raises its arms for 1.2 s, then hits everything within 4 m for 40 damage (FR34)

**Given** the Behemoth
**When** Vitest runs
**Then** tests cover HP scaling, slam telegraph timing and damage

### Story 6.6: Behemoth charge and throw

As a team,
I want the Behemoth to charge through our defenses and throw wrecks at us,
So that we have to keep moving.

**Acceptance Criteria:**

**Given** a player 5–10 m away in a straight line
**When** the Behemoth charges
**Then** it lowers its head for 1.0 s, then rushes 10 m in a straight line, dealing 30 damage to players it hits and destroying every building in its path (FR34, FR53)

**Given** a player more than 8 m away
**When** the Behemoth throws
**Then** it picks up the nearest wreck or rubble piece (or tears up a chunk of road if none is near), telegraphs for 1 s, and throws it at the player's position: 35 damage within 3 m of the impact

**Given** its attacks
**When** they cool down
**Then** the Behemoth chooses between slam, charge and throw by distance, with cooldowns from `boss.json`

### Story 6.7: Enrage and the end of wave 10

As a team,
I want the Behemoth to get angrier when it's hurt, and its death to call the helicopter,
So that the last half of the fight is the hardest.

**Acceptance Criteria:**

**Given** the Behemoth at 50% HP or less
**When** it enrages
**Then** it moves 30% faster, its attack cooldowns are 30% shorter, and a Crawler drops off its back every 4 s (FR35)

**Given** the Behemoth dies
**When** `boss.killed` is emitted
**Then** an "Evac inbound" banner shows, and the remaining wave 10 zombies must still be cleared (the last-5 rule applies) before the helicopter lands (FR36)

### Story 6.8: Special events, car alarm and stampede

As a team,
I want surprises in the middle of the run,
So that no two runs play the same.

**Acceptance Criteria:**

**Given** a new run
**When** events are scheduled from the `events` seed stream
**Then** 1 or 2 events are placed in waves 3–9, never in wave 5 (the first Brute's wave), at most one per wave (FR37)
**And** each event starts at a random moment between 20% and 60% of its wave's spawns, with a banner and sound

**Given** the car alarm
**When** it triggers
**Then** a parked car's alarm sounds and all zombies within 15 m head toward that car for 15 s (FR38)

**Given** the stampede
**When** it triggers
**Then** a mass of Runners (outside the wave count) enters from one map edge and crosses the map in one direction for 10 s, then leaves or keeps fighting (FR41)

**Given** a framework for events
**When** a new event is added
**Then** it is one module in `shared/events` with its data in `events.json`

### Story 6.9: Gas leak and supply drop

As a team,
I want a gas tank that explodes and a supply crate worth fighting for,
So that we have to choose between risk and reward.

**Acceptance Criteria:**

**Given** the gas leak
**When** it triggers
**Then** the gas station tank hisses with a visible warning radius for 10 s, then explodes: zombies within 6 m die and players within 6 m take 60 damage (FR39)

**Given** the supply drop
**When** it triggers
**Then** a crate lands at a random reachable spot (from the `events` stream) with a marker for all players (FR40)
**And** the first player to touch it gets a rare weapon (Flamethrower, Grenade Launcher, Chainsaw or Assault Rifle at level II) in their active slot

### Story 6.10: Power failure and survivor

As a team,
I want the lights to fail without warning and a survivor to need our help,
So that the run keeps asking for teamwork.

**Acceptance Criteria:**

**Given** the power failure
**When** it triggers
**Then** the current wave becomes a blackout wave until it ends (FR42)

**Given** the survivor
**When** it triggers
**Then** an NPC with 50 HP appears with a marker and a safe-point marker elsewhere on the map; it follows the nearest player within 3 m and zombies target it like a player (FR43)

**Given** the survivor reaches the safe point alive
**When** escorted
**Then** every player gets +100 currency; if it dies, nobody gets the bonus

### Story 6.11: Evacuation vote

As a team,
I want to vote to get out or stay after beating the Behemoth,
So that we choose together how much to risk.

**Acceptance Criteria:**

**Given** wave 10 cleared after the Behemoth's death
**When** the helicopter lands
**Then** every player sees Extract and Stay buttons and a 15 s countdown (FR66)

**Given** the votes
**When** the countdown ends or everyone has voted
**Then** the majority wins; a tie or no votes means Extract

**Given** Extract
**When** chosen
**Then** the run is won and the Results screen shows "Extracted" with wave reached, kills and money per player (FR67)

### Story 6.12: Endless mode

As a team,
I want to keep fighting in the collapsed city after wave 10,
So that we can push our luck for more rewards.

**Acceptance Criteria:**

**Given** Stay
**When** wave 11 and later run
**Then** each wave has 40 more zombies than the last (still max 150 alive) and 1 more Brute, blackout happens on every other wave (11, 13, 15…), and the map stays at stage 5 (FR68)

**Given** every 5th wave (15, 20, 25…)
**When** it runs
**Then** a Behemoth appears in it, and after it is cleared a new evacuation vote opens

**Given** a team wipe in endless before extracting
**When** the run ends
**Then** the Results screen shows "Lost in the city" and the run records that rewards earned after wave 10 are lost (Supplies use this in Epic 7)

## Epic 7: Accounts and meta-progression

Players keep progress between runs: Supplies earned every run, unlocks that add cards to their own shop, capped Training boosts, and an optional account so progress follows them to another device. The database arrives here, with only the tables each story needs.

### Story 7.1: Progress saved on the server

As a player,
I want the game to remember me on my phone without signing up,
So that my progress is kept from my very first run.

**Acceptance Criteria:**

**Given** the deploy stack and local development
**When** they start
**Then** a PostgreSQL 18 service runs (Docker Compose), the server connects with Drizzle ORM, and `npm run db:migrate` applies versioned Drizzle Kit migrations

**Given** this story's migration
**When** it runs
**Then** it creates only the `accounts` table (id, username nullable, password hash nullable, guest token hash, display name, created) and the `progress` table (account id, supplies, unlocks, training levels, districts)

**Given** a guest token sent on join (Story 2.3)
**When** no account matches its hash
**Then** a guest account and an empty progress row are created; otherwise the existing account is loaded and its display name prefilled
**And** the database is reached only through repositories in `apps/server/src/db`

**Given** the VPS
**When** a night passes
**Then** a `pg_dump` backup runs, 14 days are kept, and copies go off the VPS (target documented in `docs/deploy.md`); a restore is tested once and the result noted (NFR13)

### Story 7.2: Earn and bank Supplies

As a player,
I want to earn Supplies at the end of every run, even when we lose,
So that every run moves me forward.

**Acceptance Criteria:**

**Given** a run ends (extract, wipe or quit)
**When** Supplies are computed for each player
**Then** they get +10 per wave survived while in the run, +50 if the Behemoth was killed, +100 if the team extracted, and +20 per endless wave only if the team extracted (FR78)
**And** after a wipe in endless, only waves 1–10 and the boss count

**Given** the Results screen
**When** it shows
**Then** each player sees "+N Supplies" with the breakdown and their new total

**Given** the server
**When** Supplies are banked
**Then** they are written to `progress` in one transaction per run; a failed write is logged at `error` and retried once

**Given** the Supplies rules
**When** Vitest runs
**Then** tests cover loss, extract, endless extract and endless wipe

### Story 7.3: Unlock screen

As a player,
I want to spend Supplies to unlock new weapons, buildings, gear and consumables,
So that my options grow over time.

**Acceptance Criteria:**

**Given** a new account
**When** its progress is created
**Then** its pool contains the starter items: Pistol, Machete, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Wood barricade, Auto-turret, Medkit, Grenades (FR79)

**Given** the Unlocks screen (from the start screen)
**When** I open it
**Then** I see every locked item with its Supplies price: Fire Axe 150, Assault Rifle 200, Chainsaw 300, Flamethrower 400, Grenade Launcher 500; Spike trap 100, Mine 100, Floodlight 120, Metal barricade 150, Med station 300; Revive kit 100, Tactical flashlight 100, Body armor II 250; Molotovs 150

**Given** I tap Unlock with enough Supplies
**When** the server validates it
**Then** the item joins my pool and the Supplies are spent; otherwise "Not enough Supplies"

### Story 7.4: Shop deck from my unlocks

As a player,
I want my shop to offer only what I've unlocked,
So that unlocks change which choices I get.

**Acceptance Criteria:**

**Given** a run
**When** my 6 cards are drawn
**Then** they come only from my unlocked weapons and gear (FR47, FR79)
**And** the always-available section shows only my unlocked buildings and consumables

**Given** teammates with different unlocks
**When** we play together
**Then** each of us sees our own pool; a teammate's unlocks never appear in my shop

**Given** the supply drop event
**When** I grab the crate
**Then** its rare weapon is given even if I haven't unlocked it

**Given** a player whose pool can't fill the card floor (no gear unlocked beyond what they own)
**When** cards are drawn
**Then** the floor is filled as far as possible and the rest are weapon cards

### Story 7.5: Training boosts

As a player,
I want small, capped boosts I can train between runs,
So that I get a bit stronger without leaving new friends behind.

**Acceptance Criteria:**

**Given** the Training screen
**When** I open it
**Then** I see 4 boosts with 5 levels each: max HP +2% per level (max +10%), damage +1% per level (max +5%), starting currency +10 per level (100 → 150), reload speed +1% per level (max +5%) (FR80)

**Given** I buy the next level
**When** I have enough Supplies
**Then** it costs 50 × level (50, 100, 150, 200, 250) and is saved to `progress`

**Given** a run starts
**When** my survivor is created
**Then** my Training levels are applied and visible on the Results screen

### Story 7.6: Upgrade to an account

As a player,
I want to turn my guest profile into an account with a username and password,
So that I keep my progress on a new phone.

**Acceptance Criteria:**

**Given** a guest
**When** I choose "Save my progress" and enter a username (3–20 characters, unique) and a password (at least 8 characters)
**Then** my guest account becomes a full account, with the password hashed with Argon2id and all progress kept (FR77)

**Given** another device
**When** I log in with my username and password
**Then** that device's guest token is linked to my account and my progress loads

**Given** login attempts
**When** one IP makes more than 5 per minute
**Then** further attempts are refused with "Too many attempts, try again in a minute" (NFR12)

**Given** wrong credentials
**When** I log in
**Then** I see "Wrong username or password" with no hint which one is wrong

### Story 7.7: District unlock rule

As a player,
I want to see that extracting from Downtown unlocks the next district,
So that I have a goal beyond one map.

**Acceptance Criteria:**

**Given** the host's district picker in the lobby
**When** it shows
**Then** Downtown is selectable and district 2 shows as locked with "Extract from Downtown to unlock"

**Given** a player's first extraction from Downtown
**When** progress is saved
**Then** district 2 is recorded as unlocked for that player and its card shows "Unlocked: coming soon" (FR81)

## Epic 8: Real-life resilience

Real life doesn't break a run: rejoin within 2 minutes with your gear, join mid-run at a build phase, host migration, autosave, Save and quit with 7-day resume, and quick pings. Depends on Epic 3; can be built before or after Epics 5–7.

### Story 8.1: Reconnect within 2 minutes

As a player,
I want to get back into the run with my gear if my phone drops the connection,
So that a bad signal doesn't end my night.

**Acceptance Criteria:**

**Given** a player's connection drops
**When** the server notices
**Then** their character is removed from the World safely (no longer targeted, not counted for a team wipe), and their slot, wallet, loadout, upgrades and gear are held for 120 s (Colyseus `allowReconnection`) (FR73)
**And** teammates see "<name> reconnecting…"

**Given** the player's phone reconnects within 120 s
**When** it rejoins
**Then** they return with everything held: mid-wave next to a standing teammate with the HP they had, or at their position in a build phase
**And** the client shows "Connection lost, reconnecting…" while it retries

**Given** 120 s pass
**When** the player hasn't returned
**Then** their slot is freed and a later return counts as a new join

**Given** the tab is hidden (`visibilitychange`)
**When** the player switches apps
**Then** the client stops rendering and audio; the server keeps the player inside the reconnect window

### Story 8.2: Join mid-run at a build phase

As a friend arriving late,
I want to join a run that's already going,
So that I don't have to wait for the next one.

**Acceptance Criteria:**

**Given** a run in a build phase with fewer than 4 players
**When** I open the link
**Then** I join with a Pistol and currency equal to the team's average wallet (rounded down) (FR72)
**And** my shop uses my own seed stream starting at the current build phase

**Given** a run in a wave
**When** I open the link
**Then** I see "Wave in progress, you'll join at the next build phase" and wait in a spectator view

**Given** a mid-run join
**When** the next wave starts
**Then** its size uses the new player count multiplier (FR31)

### Story 8.3: Host migration

As a team,
I want someone else to become host if the host leaves,
So that the run goes on without them.

**Acceptance Criteria:**

**Given** the host disconnects or leaves
**When** their reconnect window ends or they leave on purpose
**Then** `hostSlot` moves to the longest-connected remaining player, who sees "You are now the host" (FR74)
**And** host-only actions (start, Save and quit) move with it

**Given** the host reconnects within 120 s
**When** they return
**Then** they get host back only if it hasn't migrated yet

### Story 8.4: Autosave at every build phase

As a team,
I want the run saved automatically at every build phase,
So that a server crash or update doesn't lose our run.

**Acceptance Criteria:**

**Given** the database
**When** this story runs and it isn't set up yet
**Then** it sets up PostgreSQL and Drizzle as in Story 7.1; its own migration creates only the `saved_runs` table (id, host account id, district, seed, snapshot JSON, schema version, created, expires)

**Given** a build phase starts
**When** the snapshot is taken
**Then** a versioned JSON snapshot of the run (players by slot with wallets, loadouts, upgrades, gear; buildings; wave; decay stage and plan; event schedule; every PRNG stream state) is saved for that room

**Given** a server shutdown or a programmer error that corrupts the simulation
**When** the room closes
**Then** the last build snapshot is kept and becomes resumable like a Save and quit, and players see "Server restarting, your run is saved"

**Given** snapshots
**When** Vitest runs
**Then** a test saves at a build phase, restores into a new World and checks the restored state equals the original

### Story 8.5: Save and quit

As a host,
I want to save the run during a build phase and quit,
So that we can finish it another night.

**Acceptance Criteria:**

**Given** a build phase
**When** the host taps Save and quit and confirms
**Then** the run is saved with `expires` = now + 7 days, every player sees "Run saved, the host can resume it for 7 days", and the room closes (FR75)

**Given** a wave in progress
**When** the host looks for Save and quit
**Then** the button is disabled with "You can save during the build phase"

### Story 8.6: Resume a saved run

As a host,
I want to pick up a saved run with whoever is around,
So that we finish what we started.

**Acceptance Criteria:**

**Given** the host's account has saved runs that haven't expired
**When** the host opens the start screen
**Then** a "Saved games" list shows each with district, wave and save date

**Given** the host taps Resume
**When** the room is created
**Then** a new lobby with a new code opens; any friends can join; only the host's account can start it (FR75)

**Given** the resumed run starts
**When** the World is rebuilt
**Then** decay stages 1…N are re-applied to the map without side effects (no destruction, refunds or events), then buildings and players are restored from the snapshot, and the run continues at the saved build phase
**And** returning players get their saved slot back by account; new players join with the team's average currency; wave size uses the new player count

**Given** a snapshot whose schema version is older than the server's
**When** it is resumed
**Then** it is migrated if a migration exists, or the host sees "This save is from an older version and can't be resumed"

### Story 8.7: Pings

As a player,
I want to send a quick message with a marker,
So that we can coordinate without voice chat.

**Acceptance Criteria:**

**Given** the ping button
**When** I tap it
**Then** a small wheel offers Help! · Over here · Brute! · Ready (FR76)

**Given** I choose a ping
**When** it is sent (`ping.send`, max 1 per second per player)
**Then** every teammate sees its icon and my color at my position for 4 s, with an edge arrow when off screen, and a short sound

## Epic 9: Dead City art and audio

The game looks and sounds like Dead City. Can start after Epic 4 and runs alongside later epics. Final assets replace placeholders in the same atlas layout and names, so swaps need no gameplay code changes.

**Prerequisite checklist (designer, not a code story):** hire an artist and a sound designer; agree scope, budget and delivery format using the asset spec from Story 9.1.

### Story 9.1: Art and audio asset spec

As the designer,
I want a complete list of every image and sound the game needs, with sizes and names,
So that I can brief and pay the artist and sound designer for exactly the right work.

**Acceptance Criteria:**

**Given** the current placeholder atlases, maps and sound files
**When** the spec is written to `docs/art/asset-spec.md` and `docs/audio/asset-spec.md`
**Then** it lists every atlas and frame (`category_name_variant`), frame sizes, animation names and frame counts, Tiled tile sets and decay layer groups, the Dead City palette and mood references (style labs), and every sound with its trigger, length and loop flag

**Given** the platform budgets
**When** the spec is reviewed
**Then** it states the limits: atlases ≤ 2048 × 2048, first-load download < 15 MB (music streamed), SFX in audio sprites

### Story 9.2: Downtown in five decay states

As a player,
I want Downtown to look like a real city that falls apart stage by stage,
So that the decay tells the story of the run.

**Acceptance Criteria:**

**Given** the final district art
**When** it replaces the placeholders
**Then** Downtown has 5 visual states (Evening, Panic, Breakdown, Ruins, Collapse) in the `stageN_*` layer groups, with decay props: cars in 3 conditions, barriers, sandbags, rubble, fires and vegetation (FR82)
**And** collision, cover and spawn layers are unchanged, and all map tests still pass

**Given** a full run
**When** played on the reference phones
**Then** FPS stays within NFR1 and the first-load size stays under 15 MB

### Story 9.3: Survivor animations

As a player,
I want my survivor to look like a person seen from above holding the weapon I carry,
So that I can read my teammates' roles at a glance.

**Acceptance Criteria:**

**Given** the survivor atlas
**When** it is loaded
**Then** it has 4 color variants (blue, orange, green, purple) and, per weapon type (pistol, two-handed gun, melee, chainsaw, flamethrower, launcher), walk, fire or swing, reload and downed animations (FR82)

**Given** a player swaps or buys a weapon
**When** the active weapon changes
**Then** the survivor's holding pose changes to match

### Story 9.4: Zombie and Behemoth animations

As a player,
I want every zombie type to look and move differently,
So that I can spot the dangerous ones in the crowd and the dark.

**Acceptance Criteria:**

**Given** the zombie atlas
**When** it is loaded
**Then** Walker, Runner, Crawler, Spitter, Bloater, Brute and the Behemoth each have walk, attack and death animations, plus telegraph poses (Spitter rear-back with glowing mouth, Bloater swell, Behemoth arms raised, head lowered and pick-up) (FR82, FR84)
**And** silhouettes follow the readability rules: Brute wide, Bloater round, Crawler long and low, Runner thin and leaning, Spitter glowing mouth

**Given** 150 animated zombies in view
**When** the stress test from Story 1.11 runs
**Then** FPS still meets NFR1

### Story 9.5: Gore and dismemberment

As a player,
I want heavy hits to tear zombies apart,
So that the fight feels as brutal as Dead City should.

**Acceptance Criteria:**

**Given** a `zombie.killed` event with its weapon and damage type
**When** the killing hit was heavy (Fire Axe, Chainsaw, Shotgun) or an explosion
**Then** the client spawns dismemberment pieces (arms, heads, torso halves) for heavy hits, or bursts the zombie apart for explosive kills (FR83)
**And** gore is client-only and never affects the simulation

**Given** blood
**When** zombies are hit or die
**Then** blood decals stay on the ground until the wave ends, pooled and capped at 300 so memory stays flat

**Given** the gore toggle set to "Blood only"
**When** zombies die
**Then** no dismemberment pieces spawn; blood still shows

### Story 9.6: Effects

As a player,
I want muzzle flashes, fire, acid, gas, explosions, rain and fog that look the part,
So that the screen reads clearly even in chaos.

**Acceptance Criteria:**

**Given** the effects atlas
**When** effects play
**Then** muzzle flashes, blood, fire, acid, gas, explosions, rain, fog, flashlight and floodlight light textures use final art

**Given** effects
**When** they play
**Then** they come from Phaser object pools with no per-frame allocation, and rain, fog visuals, film grain and light glow read their quality settings

### Story 9.7: UI art

As a player,
I want menus and the HUD to look like they belong to Dead City,
So that the game feels finished.

**Acceptance Criteria:**

**Given** the UI art
**When** applied
**Then** the HUD, shop cards, lobby, evacuation vote, ping icons, unlock and training screens use it
**And** text stays readable on a 2021 phone screen in landscape (minimum 14 px at devicePixelRatio 1), and every button is at least 44 × 44 px

### Story 9.8: Ambience and audio buses

As a player,
I want the city's sound to change as it decays,
So that I can hear the run getting worse.

**Acceptance Criteria:**

**Given** three audio buses (music, SFX, ambience)
**When** the Settings screen is open
**Then** each has its own volume slider, saved in player settings

**Given** each decay stage
**When** it becomes active
**Then** its ambience loop crossfades in over 3 s: Evening (traffic, distant music, voices), Panic (sirens, car alarms, shouting), Breakdown (rain, crackling fire), Ruins (wind, falling debris), Collapse (near silence, growls, rain) (FR85)

### Story 9.9: Adaptive music

As a player,
I want the music to rise with the horde and calm down between waves,
So that I feel the tension build.

**Acceptance Criteria:**

**Given** the wave music
**When** zombies are alive
**Then** its intensity (layers or volume) follows the number of zombies alive, from calm at 0 to full at 150 (FR85)

**Given** a build phase
**When** it starts
**Then** the calmer build track plays

**Given** the Behemoth
**When** it appears
**Then** the boss track takes over until it dies

**Given** music files
**When** the game loads
**Then** music is streamed after the game starts and is not part of the first-load budget

### Story 9.10: Weapon and zombie sounds

As a player,
I want every weapon and zombie to sound different, with warnings I can hear,
So that I can fight by ear in the dark.

**Acceptance Criteria:**

**Given** about 30 weapon sounds
**When** weapons fire or reload
**Then** each weapon has a distinct fire and reload sound, and reloads are clearly audible over the music (FR86)

**Given** about 20 zombie sounds
**When** special zombies act
**Then** each has a signature cue that also warns: Spitter gurgle (windup), Bloater swelling, Brute roar, Runner shriek (FR84)
**And** zombie sounds use positional volume and stereo pan relative to the listening player

**Given** many zombies at once
**When** sounds would overlap
**Then** a voice limit per sound type prevents clipping and keeps CPU use flat
