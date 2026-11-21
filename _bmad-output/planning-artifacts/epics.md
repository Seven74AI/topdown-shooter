---
stepsCompleted: [1]
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

{{requirements_coverage_map}}

## Epic List

{{epics_list}}
