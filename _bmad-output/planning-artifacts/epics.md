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
