---
stepsCompleted: [1, 2, 3, 4]
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
FR4: On touch, projectiles bend up to 8° toward the nearest zombie inside the aim cone, only when the raw aim would miss, never toward a zombie behind a barricade; aim assist is off for mouse aim.
FR5: A swap button near the right thumb switches between the 2 weapon slots in 0.3 s.
FR6: Guns reload automatically when the magazine is empty; reserve ammo is unlimited.
FR7: Desktop fallback: WASD to move, mouse to aim, hold left click to fire, Q to swap.
FR8: A consumable button uses the single quick-use slot (medkit, grenades, molotovs); in build phases it and the swap button sit above the build bar's top-left (Story 5.12).

**Player**

FR9: A player has 100 HP, radius 0.4 m and move speed 4.5 m/s; zombies in contact hit once per second; no regeneration during a wave; each build phase heals 50% of max HP.
FR10: At 0 HP a player is downed; a standing teammate within 2.0 m (centre to centre) for 3 s revives them, the downed countdown pauses while someone revives, and the downed player's gun keeps reloading; after 20 s without revive they are out until the next build phase, when they return automatically.
FR11: The run is lost when no player is standing (everyone downed or out).
FR12: Each player carries 2 weapon slots in any combination; a run starts with a Pistol and 200 currency (designer 2026-11-24).

**Weapons and combat**

FR13: The 11 weapons (Pistol, Machete, Fire Axe, Chainsaw, Shotgun, Flamethrower, Gas torch, SMG, Assault Rifle, Hunting Rifle, Grenade Launcher) behave per the GDD weapon table (damage, rate, range/arc, magazine, reload, price).
FR14: Shots are visible travelling projectiles (bullets ~60 m/s, grenades lobbed); melee hits every zombie inside its arc instantly, except through barricades and shot-blocking map cover (walls, cars, bus, buildings); low cover (sandbags, barriers, traps, mines) doesn't block it. All melee weapons.
FR15: Each gun has a fixed spread; there is no recoil climb, no movement penalty, and no critical hits or weak points.
FR16: Weapon specials work: knockback (Fire Axe 1.5 m, Shotgun 0.5 m), Hunting Rifle pierces 5 zombies, Flamethrower and Gas torch ignite (+3 dmg/s for 3 s), Chainsaw slows its wielder 20%, Grenade Launcher hurts the shooter at 50%.
FR17: Weapons upgrade from level I to IV in the shop; each level adds +25% damage; each level costs 60% of the weapon's base price.
FR18: Friendly fire is off for bullets and melee and on at 50% for grenades, mines, molotovs and Flamethrower/Gas torch fire. Exception: a Bloater's blast does its full 30 to every player in range, whoever popped it. Bloater gas only slows.
FR19: Every hit flashes the zombie and pushes it back; heavy weapons (axe, hunting rifle, grenade launcher) add a short screen shake.

**Zombies**

FR20: Walker: 10 HP, 1.2 m/s, 10 per hit, walks straight at the nearest player, reward 2.
FR21: Runner: 6 HP, 4.0 m/s, 8 per hit, takes a flanking path around the front line, reward 3.
FR22: Crawler: 8 HP, 0.7 m/s, 12 per hit, low silhouette, bite slows the player 30% for 1 s, leaves a blood trail, reward 3.
FR23: Spitter: 12 HP, 1.5 m/s, stops at 6 m, spits every 3 s for 15 after a 0.6 s glowing-mouth telegraph, leaves an acid puddle (3 s, 5 dmg/s), reward 5. Spit flies over barricades and sandbags and is stopped by cars, the bus and buildings; acid doesn't hurt across walls, cars or buildings.
FR24: Bloater: 25 HP, 0.9 m/s, explodes on death or after a 1 s swell when touching a player; 2.5 m blast, 30 to every player in range (full, never halved), 40 to zombies; gas cloud slows for 4 s; reward 6.
FR25: Brute: 120 HP, 1.0 m/s, 35 per hit after a 0.5 s wind-up + 1.5 m knockback, reach 1.3 m (1.8 m into gaps it can't enter), 3× damage to buildings, barely affected by knockback, reward 25.
FR26: Zombies chase the nearest player, route around cover and obstacles, keep crowd separation, and attack any building blocking their path.
FR27: Zombie stats never change with waves; only counts, mix and spawn pressure grow (exception: endless beyond wave 15, +6% HP per wave).

**Waves and spawns**

FR28: Wave size (4 players) grows from ≈ 40 zombies in wave 1 by ≈ 40 per wave to ≈ 400 in wave 10, with at most 150 alive at once (110 while the Behemoth lives); the rest queue at spawn points.
FR29: Zombie types are introduced in order: W1 Walkers · W2 +Runners · W3 +Crawlers · W4 +Spitters · W5 first Brute · W6 +Bloaters · W7–9 full mix · W10 finale. Brutes are fixed, not scaled: 1 in W5–W6, 2 in W7–10.
FR30: A wave ends when all its zombies are dead; when 5 remain they are marked on screen and rush the players.
FR31: Zombie count and boss HP scale by player count: × 0.35 (solo zombie count, Epic 5 balance pass 2026-11-24; the solo Behemoth stays × 0.4, FR33), × 0.6 (2 players), × 0.8 (3), × 1.0 (4); a mid-run join rescales from the next wave. (Epic 5 balance pass B2, 2026-11-24: solo zombie count × 0.35, `waves.json › playerCountScale`; the Behemoth's solo HP stays × 0.4.) Solo is allowed, not balance-tuned.
FR32: Zombies spawn at district edges (alleys, manholes, broken shop windows); decay opens more spawn points. In Random city, stage 1 spawns only at the city edges and from stage 2 points near the group open too (FR93).

**The Behemoth (wave 10 boss)**

FR33: The Behemoth arrives when 50% of wave 10's zombies have spawned, with the horde still active: radius 2 m, 1.3 m/s, immune to knockback, 6,000 HP at 4 players (× 0.4 / 0.6 / 0.8 / 1.0); the alive cap is 110 while it lives.
FR34: Behemoth attacks with telegraphs: ground slam (picked when a standing player is within 4 m; 1.2 s, 4.5 m ring, 40 dmg), charge (1.0 s, 10 m line, 30 dmg, destroys buildings in its path), throw (1 s, picks up a wreck or rubble, 3 m impact, 35 dmg). Slam and throw ignore cover (the drawn zone is the promise). Crash stun: a charge that ends on hard cover (car, bus, building wall, rubble, map edge) stuns it 2 s and it takes ×1.5 damage.
FR35: At 50% HP the Behemoth enrages: +30% speed, attack cooldowns −30%, a Crawler drops off its back every 8 / 6 / 5 / 4 s (1–4 players); telegraph lengths never change.
FR36: The Behemoth's death calls the evacuation helicopter.

**Special events**

FR37: Always 2 special events per run, in two different waves of 3–8, never wave 5, never back-to-back, never the same event twice.
FR38: Car alarm: a parked car is armed for 20 s; when shot (or by itself after 20 s) its alarm draws all zombies within 15 m toward the car for 15 s.
FR39: Gas leak: a tank hisses for 10 s then explodes (6 m radius, kills zombies, the full 60 to every player in range, 150 to buildings; normal blast line-of-sight); shooting the tank after its first 3 s sets it off early.
FR40: Supply drop: a crate lands ≥ 12 m from the team and shows its weapon (Flamethrower, Gas torch, Grenade Launcher, Chainsaw or Assault Rifle); the first standing player to stand on it 1 s gets it at level II.
FR41: Stampede: a mass of Runners crosses the map in one direction for 10 s.
FR42: Power failure (waves 6–8 only): the current wave becomes a blackout wave.
FR43: Survivor: an NPC appears and must be escorted to a safe point for a big reward; it follows standing players only.

**Build phase, economy and shop**

FR44: A 30 s build phase opens the run and follows every wave; it ends early when every player taps Ready.
FR45: Each player has a personal wallet, earning kill rewards per zombie type, 50% of the reward for an assist, +25 per revive, 50% of the reward for kills by their own buildings, and a wave-clear bonus of 15 × wave number (Epic 5 balance pass 2026-11-24; was 10 × N) paid to every player (including downed and out players).
FR46: The shop offers consumables and upgrades for weapons the player owns, plus the 6 cards (FR47). Buildings come from the build bar (Story 5.16). A downed or out player can't buy.
FR47: Each build phase, each player sees their own 6 random weapon and gear cards drawn from their unlocked pool, with at least 1 weapon and 1 gear card; reroll costs 20. No locking, no upgrade cards, no Pistol card, items with `inShop:false` never drawn; rarity by price (≤ 250 common ×3, ≤ 500 rare ×2, epic ×1); no per-wave price scaling; card look C3. When the pool can't fill 6, fewer cards show and Reroll is disabled when no new draw exists.
FR48: Gear lasts the run: Body armor I/II (+25/+50 max HP, 150/300), Running shoes (+10% speed, 150), Revive kit (its owner revives teammates in 1.5 s instead of 3 s; the fastest standing reviver in the zone counts, no stacking, no effect on the owner's own revive; 150), Tactical flashlight (wider, longer cone in blackout, 120).
FR49: Consumables use one slot: Medkit (heals 50, 60), Grenades ×3 (40 dmg, 2.5 m, 80), Molotovs ×2 (3 m fire zone for 4 s, 8 dmg/s, 100). Grenades and molotovs are thrown 2–8 m on the Grenade Launcher's lob (over everything but buildings) and used in waves only; molotov fire needs a clear line from the zone centre, like acid.

**Buildings**

FR50: In a build phase, a player picks a building in the build bar, carries its ghost and drags to place it on a 0.5 m lattice (Stories 5.15–5.25, "B · Carry + drag"; picked from the hybrid Build button + last-placed quick tile, Story 10.10, layout B); the ghost turns red at once when blocked and green only after 250 ms clear; placement is refused where blocked.
FR51: Buildings persist until destroyed, can be repaired in a build phase for 50% of their price, and are capped at 6 per player (cap reviewed in the Epic 5 balance pass).
FR52: Building behaviors per the GDD table: Wood barricade (2 m wall, 200 HP, 40), Reinforced barricade upgrade (350 HP, +50), Metal barricade upgrade (600 HP, +70), Auto-turret (nearest zombie within 8 m, 3 dmg × 5/s, 300 HP, 250), Spike trap (2 × 2 m, 4 dmg/s and −40% speed, 300 HP, 80), Mine (proximity, 80 dmg in 2.5 m, single use, 35), Floodlight (4 m radius light, 6 m in blackout waves, 150 HP, 100; sold once Story 6.3 lands), Bear trap (Story 5.14), Med station (heals players within 2 m by 5 HP/s, 300 HP, 400).
FR53: Every barricade tier (wood/reinforced/metal) blocks zombies, players and every bullet (own, teammates', turrets'); aim assist and turret targeting skip zombies behind one. Turrets, sandbags, police barriers and floor buildings stop no bullets. Explosions, flames, melee, acid and gas keep their own rules; zombies attack buildings blocking their path; fires damage buildings inside them; rubble blocks placement; the Behemoth's charge destroys buildings.

**District, camera and cover**

FR54: Downtown (~48 × 32 m) is hand-made: central intersection, 2–3 alleys, gas station corner, crashed city bus, small parking lot, spawn points at the edges.
FR55: Each player's camera follows them, showing about 24 × 13.5 m; teammates off screen are shown by edge arrows; each player has a colored ground ring (blue, orange, green, purple).
FR56: Cars, bus, barriers and sandbags block movement for players and zombies; bullets pass over barriers and sandbags but not cars or the bus; buildings, gas pumps, the parking wall and the dumpster also stop bullets; player barricades stop bullets.
FR57: Hazards damage or slow what is inside them: fire zones (10 dmg/s to everything), acid puddles, gas leak, Bloater gas.

**City decay**

FR58: The district advances one decay stage every 2 waves; stage changes apply only at the start of a build phase, and buildings on newly blocked cells are destroyed. (Story 12.4, designer 2026-11-25 "bad luck": no refund; was "with a 50% refund".)
FR59: Stage 1 Evening (waves 1–2): dusk, open map, the brightest stage (it darkens each stage), parked cars along curbs, lit shops.
FR60: Stage 2 Panic (waves 3–4): 4 cars move into the road (new cover and choke points); police barriers block some paths.
FR61: Stage 3 Breakdown (waves 5–6): 2 car fires (2 m fire zones lasting 2 waves); free sandbag cover appears; heavy rain (drizzle since stage 1).
FR62: Stage 4 Ruins (waves 7–8): rubble closes one alley and blocks paths; streetlights flicker; collapsed walls open new spawn points.
FR63: Stage 5 Collapse (waves 9–10): power out; wave 9 is a blackout wave; fog limits vision to 10 m; wave 10 is dark too, lit only by fires, floodlights, flashlights and muzzle flashes.
FR64: In blackout, darkness covers the map except flashlight cones (aim direction), floodlights, fires and muzzle flashes; zombie eyes show through the dark.
FR65: Each run has a seed that drives its random choices (which cars burn, which alley collapses, events, shop cards), so a run can be reproduced. A Random city's layout comes from its own city seed (FR94).

**Win, evacuation and endless**

FR66: After the Behemoth dies, the team votes for 15 s: a majority of the connected, standing players wins; a tie or no counted votes means extract (Story 8.12: disconnected, downed and dead players don't count).
FR67: Extract wins the run and keeps all rewards (the helicopter lifts off into 4 s of dawn, then Results); Stay starts endless waves in the collapsed city.
FR68: Endless: blackout on odd waves, +40 zombies per wave up to 600 at wave 15 (still max 150 alive), then +6% zombie HP per wave; +1 Brute per wave (max 6 alive); a Behemoth every 5th wave before each evacuation vote (15, 20, 25…) with +25% HP each time; one event on each even endless wave without a Behemoth; a wipe before extracting loses rewards earned after wave 10.

**Multiplayer**

FR69: The host picks a district (Downtown or, from Epic 11, Random city) and gets a share link and a 4-letter code; 2–4 players join, tap Ready, and the host starts.
FR70: Players can play immediately as a guest with only a name.
FR71: All players see the same horde and the server decides hits; your own movement, aiming and muzzle flash respond instantly on your device.
FR72: Players can join mid-run during build phases only, starting with a Pistol and 100 + 60 % of the team's average earnings so far (designer D7, 2026-11-24; replaces "the team's average currency").
FR73: A disconnected player's character is removed safely; they can rejoin within 2 minutes with wallet and gear intact, and their seat is remembered for the rest of the run (D4).
FR74: If the host leaves or drops, host (Start, Save and quit, Remove player) moves at once to the longest-connected player (D8, D9).
FR75: During a build phase the host can Save and quit; the server keeps the run 7 days, and any account that was in the run can resume it (D13).
FR76: A ping button offers 4 quick messages (Help! · Over here · Big one! · Ready), each showing an icon on teammates' screens and edge arrows.

**Meta-progression**

FR77: A guest can upgrade to an account later and keep their progress.
FR78: Supplies are earned per run, even on a loss: +10 per wave survived (counted only for waves the player was in: every player in the run when the wave ends, downed or out, but not waves before a late join or after leaving), +50 for killing the wave 10 Behemoth (once per run), +100 for extracting, +20 per endless wave and +50 per endless Behemoth (both kept only if the team extracts); a player's Supplies are doubled while their lifetime Supplies are below 300 (rookie lift).
FR79: New players start with the starter pool (Pistol, Machete, Fire Axe, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Revive kit, Wood barricade, Auto-turret, Medkit, Grenades); other items are unlocked with Supplies on an unlock screen at the GDD prices, in any order, and unlocks add cards to that player's shop deck; one card per offer may be borrowed from a teammate's unlocks the player lacks.
FR80: Training offers 4 capped boosts with 5 levels each (max HP up to +10%, damage up to +5%, starting currency 200 → 250, reload speed up to +5%), each level costing 50 × level Supplies.
FR81: District 2 unlocks for a player after their first extraction from Downtown; the host can pick a district if anyone in the lobby has unlocked it (rule only; district 2 content is out of v1).

**Presentation, audio and settings**

FR82: Dead City art, made without hiring: photoreal looks the designer picks on proposal pages, put into the game as code drawings relit at load in a Web Worker or as atlases pre-rendered offline from the approved code (the code drawings stay the fallback); gritty, realistic, rainy night city; zombies read as people from above; each zombie type has a distinct silhouette; the district has 5 visual decay states.
FR83: Gore: heavy hits (axe, chainsaw, shotgun, explosions) dismember zombies, explosive kills burst them apart, and blood stays on the ground for the wave; a gore toggle switches to blood only.
FR84: Every special attack has a readable visual and audio warning; each special zombie has a signature sound (Spitter gurgle, Bloater swelling, Brute roar, Runner shriek).
FR85: Ambience follows the decay stage (5 loops); music intensity follows the number of zombies alive; a calmer build-phase track and a dedicated Behemoth track.
FR86: Each weapon has distinct firing and reload sounds; reloads are clearly audible. Sounds are procedural or from licensed/free libraries (no hired sound designer).
FR87: Quality settings can lower or turn off rain, fog visuals, screen shake, film grain and light glow, plus the gore toggle; blackout darkness and the 10 m fog vision limit cannot be turned off.
FR88: The game records simple run stats (district, or `random:<city code>`, wave reached, extracted, loadouts per player) for the success metrics.
FR89: Each player's survivor is built from code-drawn parts (51 parts in 5 slots: top, headgear, hair, backpack, skin; 31 starter, 10 milestone, 10 loot) and free colours they choose (cosmetic only, no gameplay effect) and is seen by the whole team; extra parts come from milestones earned once and from a rare per-run loot bag, never from Supplies (customization proposal D1–D7, O1–O6; part picks in `docs/epic-7-decisions.md` › Survivor parts (7.8)).

**Random city (Epic 11, post-v1; `sprint-change-proposal-2026-11-24-random-city.md`)**

FR90: Random city: each run the host can play a new 70 × 70 m city generated from rules (street plan, blocks, building footprints, curb cars, barriers) and landmark recipes (first: the gas station). It is open from the start with no unlock; FR81's District 2 rule is unchanged.
FR91: Every generated city passes checks A–G (A never seals off an area at any stage or variant; B every spawn reaches the players; C an open start area near the middle, buildable in wave 1 and never hit by decay; D no empty 15 × 15 m square without cover; E at least 2 choke points; F no spawn path that traps zombies; G streets at least 3 m wide) and the anchor check (4 main-street ends at least 4 m clear at every stage, the helicopter pad in the start area, event spots and stampede lanes reachable), or it is rejected and regenerated.
FR92: Random city decays by generic rules through all 5 stages (curb cars move into the road, police lines, cars burn, manholes and windows open, rubble closes 1 of 3 candidate side streets, 2 building walls open as breaches; stage 5 power out and fog), plus each landmark recipe's own stage events (gas station: gas leak from stage 2).
FR93: Random city spawns: stage 1 only from the city edges; from stage 2 also from generated points 15–35 m from the group, never within 6 m; fights stay as dense as Downtown's (150 alive cap unchanged).
FR94: A Random city extraction counts for the "first extraction" milestone item (M2, Story 7.11) but not for the District 2 unlock, which stays "from Downtown" (FR81; designer 2026-11-25). Results of a Random city run show a city code; the host can type it in the lobby to play the same layout again (decay picks, events and shop cards stay new); a code from an older generator is refused with "This city is from an older version"; a saved Random city run whose generator version is older can't be resumed: the Saved games list shows it with that message and only Delete (designer 2026-11-25).

### NonFunctional Requirements

NFR1: Frame rate 60 FPS target, never below 30 FPS sustained, on 2021 mid-range phones (iPhone 12, Pixel 5, Galaxy A52) and on the low-end floor, the Xiaomi Mi 11i, measured over a full wave 9 blackout with all 150 alive zombies in one player's view.
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
- **Shared simulation package (ADR-03):** engine-free TypeScript (no Phaser, Colyseus, DOM or Node imports); fixed 50 ms step (20 Hz); fixed system order per tick; struct-of-arrays pools for zombies and projectiles with generation-bit ids; uniform spatial hash grid (2 m cells); swept segment-vs-circle projectile collision; simulation timers count ticks, rates in SI units (meters, per second); no `Math.random()` or `Date.now()`.
- **Balance data:** typed JSON files in `packages/shared/src/config/balance/` (weapons, zombies, buildings, items, waves, economy, decay, events, boss) validated with zod into one `Balance` object; server sends the balance version on join and refuses mismatched clients ("Please refresh").
- **Seeded PRNG** per run with named sub-streams (events, decay, shop per player slot + build phase index).
- **Typed synchronous event bus** (`domain.past_tense` names, one `SimEvent` union), drained once per tick; the server forwards the events clients need as reliable messages.
- **Epic 1 local mode:** the client runs the shared World in the browser behind a `SimHost` interface; Epic 2 swaps in the networked host without changing scenes.
- **Server:** one Colyseus `RunRoom` per run owning the `Run` state machine (Lobby → Build → Wave → EvacVote → Endless ↔ EvacVote → Results; Paused side state) and the World; room id = random 4-letter code without ambiguous letters; share link `https://<subdomain>/j/<code>`; `maxClients = 4`; joins only in Lobby and Build; `hostSlot` reassigned to the longest-connected player.
- **Networking (ADR-01):** server-authoritative; client input sampled per 50 ms step with sequence numbers; local player predicted with shared movement code and reconciled; remote entities interpolated with an adaptive 100–150 ms delay; timers count ticks inside the World.
- **Horde stream (ADR-02):** per-client binary message per tick with zombies in the client's view + 4 m margin; 8-byte records (id u16, x u16, y u16 at 1 cm, heading u8, type+state u8) + header; freed ids held 1 s; client removes zombies missing from 3 snapshots; backpressure skips frames when `bufferedAmount` > 64 KB; budget horde ≤ 24 KB/s + schema/events ≤ 6 KB/s. (Updated by the Network pass: Story 8.9 removes a zombie after 150 ms of missing time instead of 3 snapshots; Story 8.10 sends a delta stream, ≈ 8 KB/s measured.)
- **Colyseus schema** for low-frequency state (players, wallets, loadouts, buildings, phase, timers, decay stage, votes, Behemoth, hazards, mines, Survivor, crate, aliveCount); personal shop offers sent only to their owner (`@view()` or direct message); purchases validated against the stored offer.
- **Hit validation:** server simulates all projectiles and melee; shots spawn at the shooter's position advanced by half RTT (capped 150 ms); projectiles are cosmetic on clients from `weapon.fired` events; the server rewinds zombies to what the shooter saw (≤ 12 ticks / 600 ms since Story 8.9; 500 ms in Story 8.8, 300 ms in Story 2.12; spread keyed to the input seq); boss hits are not rewound.
- **Pathfinding:** flow fields on a 0.5 m grid toward players, rebuilt (amortized) when buildings or decay change; Runners use a flanking field; separation forces on top.
- **Maps (ADR-05):** districts authored in Tiled (JSON export); layers `stage1_evening` … `stage5_collapse`, `collision`, `cover`, `spawns`, `hazards`; per-stage mutation sets (`add | remove | ignite | block`); `DecayTimeline` + `DecaySystem` in shared (`applyDecayStage` is the single path); the map is generated by `tools/maps/buildDowntown.ts`, and visuals are drawn by `apps/client/src/render/city/*` (`DecayView` is gone); client prediction applies decay to its own map; on resume, stages are re-applied without side effects.
- **Lighting:** darkness layer (as built in 6.3: not a RenderTexture, decision 6.3 DD1; see the architecture) at half resolution with lights cut out, rendered only when blackout is on; light state owned by the server.
- **UI:** in-combat HUD drawn by Phaser; menus (lobby, shop, evac vote, results, unlocks, settings) as Preact HTML overlays with `pointer-events: none` except on active screens.
- **Persistence (ADR-04):** PostgreSQL 18 + Drizzle ORM 0.45 + Drizzle Kit migrations; tables `accounts`, `progress`, `device_tokens` (7.6), `run_rewards` (7.2), `saved_runs` + `saved_run_players` (8.4) built; `progress.settings` (10.1), `problem_reports` (10.6), `run_results` + `run_result_players` (10.7) planned; DB accessed only from `apps/server/src/db` repositories.
- **Saved runs:** versioned JSON snapshot (including every PRNG state) autosaved at each Build phase for crash recovery; explicit Save and quit (or everyone leaving in a Build phase, or a server stop) makes it resumable for 7 days by any account that was in the run (Epic 8 D10–D13); graceful shutdown autosaves every room.
- **Reconnect:** Colyseus `allowReconnection` 120 s; slot, wallet and gear held in room state.
- **Accounts:** guest = random device token in a 1-year HttpOnly `__Host-tdg` cookie plus a localStorage copy (Epic 7 D9) → server session (stored hashed); upgrade to username + password (Argon2id via @node-rs/argon2).
- **Hosting:** Docker Compose on the designer's European VPS: HTTPS/WSS at the existing Cloudflare Tunnel, Caddy 2.11 behind it on plain HTTP at 127.0.0.1:8080 (static client, no-cache `index.html`, long-cache hashed assets), game server, PostgreSQL; the game is at https://hordes.sevend.io; Hermes deploys; WebSocket origin check; nightly `pg_dump` kept 14 days and copied off the VPS, restore tested once per milestone.
- **Security limits:** inbound message ≤ 1 KB, input rate cap 25/s per client, ping rate 1/s per player, login 5/min per IP, room creation 10/min per IP; zod validation on every client message.
- **Error handling:** `Result<T, E>` for expected failures; exceptions only for programmer errors; one global handler per room (saves the last Build snapshot if the simulation is corrupted); short player-facing messages.
- **Logging:** pino JSON to stdout with `roomId`/`runSeed`/`wave`/`playerId`; no logging in hot loops; client ring buffer of 200 lines attached by "Report a problem".
- **Debug tools:** performance overlay (FPS, ping, bandwidth, zombies alive/in view, tick time) also in release via Settings → Show performance; dev-only cheats (spawn, skip wave, give currency, set decay stage, trigger event, force blackout, set seed, god mode); release-safe switches: `?debug`, `?loadout`, `?lag`, and `?wallet` (solo only); collision/grid view; headless replay from seed + input log.
- **Testing:** Vitest unit tests with fixed seeds for every GDD mechanic in `shared`; headless bot clients in `tools/bots` for load tests.
- **Client platform budgets:** devicePixelRatio capped at 2; texture atlases ≤ 2048 × 2048; no per-frame allocation in render loops (Phaser object pools); stop rendering and audio on `visibilitychange`; web app manifest (fullscreen, landscape), `viewport-fit=cover`.
- **Assets:** art is drawn in game code (`render/city/*`) into atlases with `category_name_variant` frames, each registered through `addGeneratedTexture`; AI/vector images are references only. Exception since Story 9.14: street props and vehicles ship as an atlas pre-rendered offline from the approved code by a committed script (same frame names, repainted through `addGeneratedTexture`). SFX audio sprites, streamed music and ambience (procedural or licensed/free libraries).
- **Audio:** three buses (music, SFX, ambience); positional volume/pan for zombie cues.
- **Tooling:** Context7 MCP for current Phaser/Colyseus/Vite docs.

From the GDD epics outline (sequencing constraints):

- Epic 3 ships a fixed-list shop; the 6-card roguelike shop arrives in Epic 5 once the item pool is big enough.
- Milestone 1 = Epics 1–4: 2–4 players online in Downtown, 4 weapons (Pistol, SMG, Machete, Hunting Rifle), 3 zombie types, turret + barricade, shop, 5 waves (now 6 waves; 6.1 makes 10), 3 decay stages.
- Melee under twin-stick must be playtested on real phones in Epic 1 (open risk).
- All art is drawn in game code; sounds are procedural or from licensed/free libraries. Nobody is hired: Epic 9 is a polish pass of the code-drawn art and the audio (designer, 2026-11-23).

### UX Design Requirements

The building UX spec exists: `docs/ideas/building-ux/ux-spec.md` (designer picked "B · Carry + drag"), built as Stories 5.15–5.25; it replaces Story 3.4's placement input. Other menu, HUD and touch-control needs are covered by the functional requirements above (FR1–FR8, FR30, FR55, FR76, FR87) and the UI architecture notes. Touch zones, the in-run menu and minimum sizes are defined in Stories 1.8 and 2.11 (readiness review fixes). Story 10.10 (hybrid Build button, layout B picked 2026-11-25) replaces the 5.16 build bar. A `gds-ux` pass (HUD map at 568 × 320 and 844 × 390, Results, Settings, build-phase controls) is recommended before Stories 9.7 and 10.10 (readiness check 2026-11-25, U1–U6).

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
FR12: Epic 1 - Two slots, Pistol start (200 currency start in Epic 3; was 100 until 2026-11-24)
FR13: Epic 1 (Pistol, SMG, Machete, Hunting Rifle) · Epic 5 (other 7 weapons)
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
FR28: Epic 1 (simple growing waves) · Epic 3 (5-wave curve; now 6 waves, 6.1 makes 10) · Epic 6 (full 10-wave curve)
FR29: Epic 3 (W1–W3 order) · Epic 6 (full introduction order)
FR30: Epic 1 - Last 5 marked and rushing
FR31: Epic 3 - Player-count scaling (boss HP scaling in Epic 6)
FR32: Epic 4 - Spawn points at district edges, opened by decay (Random city spawns: Epic 11)
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
FR46: Epic 3 - Always-available shop items (fixed list) · Epic 5 (build bar takes the buildings, 5.16)
FR47: Epic 5 - 6-card roguelike shop with reroll and floor
FR48: Epic 5 - Gear
FR49: Epic 5 - Consumables
FR50: Epic 3 - Grid placement and rotation · Epic 5 (carry + drag, 5.15–5.25)
FR51: Epic 3 - Persistence, repairs, 6-building cap
FR52: Epic 3 (Wood barricade, Auto-turret) · Epic 5 (other buildings and barricade tiers)
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
FR65: Epic 4 - Run seed (seeded RNG core from Epic 1; city seed: Epic 11)
FR66: Epic 6 - Evacuation vote
FR67: Epic 6 - Extract or stay
FR68: Epic 6 - Endless mode
FR69: Epic 2 - Lobby, share link, 4-letter code (Random city card: Epic 11)
FR70: Epic 2 - Guest play with a name
FR71: Epic 2 - Shared horde, server hits, instant own feel
FR72: Epic 8 - Join mid-run at build phases
FR73: Epic 8 - 2-minute reconnect
FR74: Epic 8 - Host role and Remove player
FR75: Epic 8 - Save and quit, 7-day resume by anyone from the run
FR76: Epic 8 - Pings
FR77: Epic 7 - Guest-to-account upgrade
FR78: Epic 7 - Supplies earning
FR79: Epic 7 - Starter pool, unlocks, unlock screen
FR80: Epic 7 - Training boosts
FR81: Epic 7 - District 2 unlock rule
FR82: Epic 4 (code-drawn Dead City art) · Epic 9 (photoreal pass: relit code drawings and pre-rendered atlases, no hiring; correct-course 2026-11-26)
FR83: Epic 9 - Gore and dismemberment with toggle
FR84: Epic 5–6 (visual telegraphs, placeholder sounds) · Epic 9 (polished signature sounds)
FR85: Epic 9 - Ambience and adaptive music
FR86: Epic 9 - Weapon sounds (placeholder sounds from Epic 1; polished from procedural or licensed/free libraries)
FR87: Epic 10 - Quality settings
FR88: Epic 10 - Run stats
FR89: Epic 7 - Survivor customization, milestone items, loot bag (Stories 7.8–7.12)
FR90–FR94: Epic 11 - Random city (generator, checks, decay rules, spawns, city code)

**NFRs:** NFR1 measured from Epic 1, met in Epic 10 · NFR2 Epic 10 · NFR3–NFR5 Epic 2, hardened for lossy 4G by the Network pass (Stories 8.8–8.11) · NFR6–NFR8 Epic 10 · NFR9 Epics 2, 6, 8 (Story 8.1, built in the Network pass), 10 · NFR10 from Epic 1 · NFR11 Epics 2 and 5 · NFR12 Epic 2 (transport, input validation), Epic 7 (passwords) · NFR13 Epics 7 and 8 · NFR14 from Epic 1.

## Epic List

Eleven epics, each ending in something playable. Order: 1 → 2 → 3 → 4 (Milestone 1) → 5 → 6 → **Network pass** (the front of Epic 8: Stories 8.8–8.11 and 8.1; sprint change proposal 2026-11-24 network pass) → 7 → rest of 8 → 10 (v1) → **11 Random city (post-v1; sprint change proposal 2026-11-24 random city)**. Epic 9 can start after Epic 4 (Milestone 1) and runs alongside; **Story 10.1 (Settings) is built before Stories 9.5, 9.6 and 9.8**, which use its gore, quality and volume settings. Epic 8 needs Story 7.1 (accounts and database). No epic needs a later epic to work.

### Epic 1: Core combat on one phone
One player fights growing waves of Walkers on their phone with touch twin-stick controls and 4 weapons (one per range), and sees the frame rate with 150 Walkers. Includes the monorepo scaffold, the shared simulation core (World loop, seeded RNG, spatial grid, balance loading) in local SimHost mode, the performance overlay, and the melee playtest on real phones. *(Closed 2026-11-26, correct-course: 1.11 AC 3 is folded into 10.2 and 1.12 into the 10.9 game nights.)*
**FRs covered:** FR1–FR7, FR9, FR12, FR13 (4 weapons), FR14, FR15, FR16 (pierce), FR19, FR20, FR26 (chase, separation), FR27, FR28 (simple), FR30, FR55 (camera follow)

### Epic 2: Online co-op foundation
2–4 friends open a share link and fight the same horde together on 4G, with downed/revive, team wipe and an in-run menu to leave. Includes the Colyseus server, horde stream, prediction and interpolation, server-confirmed hits, an anonymous guest device ID (so the host is known), and the first deploy to the VPS (Docker Compose + Caddy, HTTPS/WSS) for the 4G latency test.
**FRs covered:** FR10, FR11, FR55 (rings, edge arrows), FR69, FR70, FR71

### Epic 3: Build phase and economy
A team plays 5 waves (now 6 waves; 6.1 makes 10) with build phases: earning into personal wallets, buying from a fixed-list shop, and placing Auto-turrets and Wood barricades on a grid. Runners and Crawlers join the horde; zombie count scales with player count.
**FRs covered:** FR9 (build heal), FR12 (start currency), FR21, FR22, FR26 (attack buildings, flow fields), FR28 (5-wave curve), FR29 (W1–W3), FR31, FR44, FR45, FR46, FR50, FR51, FR52 (2 buildings), FR53 (blocking)

### Epic 4: Downtown and city decay (Milestone 1)
2–4 players online in Downtown play 5 waves (now 6; 6.1 makes 10) through Evening → Panic → Breakdown: cars move into the road, barriers block paths, fires burn. Dead City art drawn in code, cover rules, spawn points and the run seed. *(Closed 2026-11-26, correct-course: the 4.10 playtest is folded into the 10.9 game nights.)*
**FRs covered:** FR26 (route around cover), FR32, FR53 (fire damage), FR54, FR56, FR57 (fire), FR58, FR59, FR60, FR61, FR65, FR82 (placeholder)

### Epic 5: Full arsenal and bestiary
Every weapon, upgrade, zombie, building, gear item and consumable from the GDD, plus the 6-card roguelike shop; every zombie type demands its own answer.
**FRs covered:** FR8, FR13 (7 weapons), FR14 (lobbed), FR16, FR17, FR18, FR23, FR24, FR25, FR47, FR48, FR49, FR52 (5 buildings), FR53, FR57 (acid, gas), FR84 (telegraphs)

### Epic 6: The full run: decay, boss, events, endless
A team plays from Evening to the Behemoth through Ruins and Collapse (blackout, fog), meets two special events, votes to extract or stay, and can go endless.
**FRs covered:** FR28 (full curve), FR29, FR31 (boss HP), FR33–FR43, FR53 (rubble, charge), FR57 (gas leak), FR62, FR63, FR64, FR66, FR67, FR68, FR84 (boss telegraphs)

### Epic 7: Accounts and meta-progression
Players keep progress between runs: a guest upgrades to an account, earns Supplies, unlocks items that then appear in their shop (plus one card borrowed from a teammate), and buys capped Training boosts; new friends catch up with a rookie lift and a bigger starter pool; each player makes their own survivor look, with milestone and loot parts. Story 7.13 (added 2026-11-26, retro E7-A6) holds the leftovers: the 7.6 B18/B19 account lines and the Results "Wear it" button.
**FRs covered:** FR77, FR78, FR79, FR80, FR81, FR89 · NFR12 (passwords), NFR13

### Epic 8: Real-life resilience
Real life doesn't break a run: a bad 4G line doesn't spoil hits or the picture (Network pass, built first, right after Epic 6: `docs/perf/network-audit-2026-11.md`), rejoin within 2 minutes with your gear, join mid-run at a build phase, a light host role with Remove player, Save and quit with 7-day resume by anyone from the run, and quick pings (decisions: `docs/ideas/epic-8/decisions.md`).
**FRs covered:** FR72, FR73, FR74, FR75, FR76

### Epic 9: Dead City art and audio
The game looks and sounds like Dead City: a photoreal pass of the art (district in 5 decay states, animations, a photoreal Behemoth, gore and dismemberment, effects, UI art), each group picked by the designer on a proposal page and put into the game through the 9.11–9.14 pipeline (relit code drawings baked in a worker, or a pre-rendered atlas), and of the audio (ambience per stage, adaptive music, weapon and zombie sounds). Nobody is hired: sounds are procedural or from licensed/free libraries (designer, 2026-11-23; photoreal direction 2026-11-26).
**FRs covered:** FR82, FR83, FR84 (polished sounds), FR85, FR86

### Epic 10: Performance and polish
Every technical target is met on the reference phones; quality settings, home-screen install and safe areas, run stats, a balance pass and friend-group playtests deliver v1.
**FRs covered:** FR87, FR88 · NFR1, NFR2, NFR3, NFR6, NFR7, NFR8, NFR9

#### Story 10.11: Admin players

(Added 2026-11-26, designer: "add Admin players. That would get the dev btn so he can do whatever we can do in dev mode but in production". Decisions AD-1…AD-4 all as recommended (designer "Ok with all your recommendation", 2026-11-26); story file `10-11-admin-players.md`. Online cheats are Story 10.12.)

As an admin (a registered account the operator marked as admin),
I want the dev ⚙ cheat panel and the dev link switches in the production game,
So that I can test any wave, weapon or event on a real phone without a dev build.

**Acceptance Criteria:**

**Given** an operator command on the VPS (`admin add|remove|list <username>`)
**When** it marks a registered account (never a guest) as admin
**Then** that account's session tells the client it is an admin, and no other account learns of it (AD-1 A)

**Given** an admin in a production build
**When** they start Practice solo
**Then** the ⚙ button and the full dev panel work as in a dev build, and the dev link switches (`?startwave`, `?shopall`, `?bosswave`, …) are honoured for that solo run (AD-2 A, AD-4 A); Practice still earns no rewards

**Given** an admin in an online game
**When** they open ⚙
**Then** only the view tools (perf overlay, collision / grid view) work; every other control is greyed with "Practice only" (AD-2 A; online cheats = Story 10.12)

**Given** a non-admin (or a logged-out guest) in a production build
**When** the game loads
**Then** nothing changes: no ⚙, the cheat code is never downloaded (the main bundle stays free of cheat strings), and the dev link switches stay ignored

### Story 10.12: Admin cheats online

(Added 2026-11-26 with 10.11; backlog. AD-3 A: when an admin uses a cheat online, nobody in that room earns rewards for the run and Results says "Admin cheats used".)

As an admin in an online game,
I want the cheat panel to work through the server,
So that I can test co-op situations in production.

**Acceptance Criteria:**

**Given** an admin (checked by the server, never trusted from the client) in an online room
**When** they use a cheat
**Then** the server applies it, the run is marked cheated, nobody in the room earns Supplies, loot or milestones for it, and Results says "Admin cheats used" (AD-3 A)

## Epic 11: Random city (post-v1)
The host can pick Random city: a new 70 × 70 m city generated from rules on every run (streets, blocks, plain buildings, cars, barriers and a gas station). It decays through all 5 stages by generic rules, always passes checks A–G and the anchor check, and can be replayed or shared by its city code. Open from the start (no unlock). Built after Epic 10.

### Epic 12: Extraction cinematic
A won run ends like a film: no building can seal a pocket of the map, decay losses are not refunded, and on Extract the survivors walk to the helicopter, board and fly out over the horde into the sunrise (party-mode session 2026-11-25, quick stories 12.1–12.4; with Story 8.12, only connected, standing players vote).
**FRs touched:** FR58 (no refund), FR66, FR67
**FRs covered:** FR32 (Random city spawns), FR65 (city seed), FR69 (Random city card), FR90, FR91, FR92, FR93, FR94

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

**Given** a push to any branch *(as built since 2026-11-25: CI runs on PRs and on pushes to master only; docs-only changes skip CI; see HANDOFF.md §3 and `docs/ci.md`)*
**When** GitHub Actions runs
**Then** typecheck, lint, tests and the client build all run and the job fails if any of them fails

**Given** a push to `master`
**When** the build succeeds
**Then** the static client build is published to GitHub Pages by a GitHub Actions workflow, at a URL that opens on a phone *(retired 2026-11-22: the game is served at https://hordes.sevend.io by the VPS stack, Story 2.2)*
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
**Then** their states are identical (Vitest test) (NFR10)
**And** the package contains no `Math.random()` or `Date.now()` calls (lint rule or test)

**Given** balance JSON files in `packages/shared/src/config/balance/` (starting with `weapons.json`, `zombies.json`, `waves.json`)
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
**Then** I can choose any 2 of the weapons that exist so far (Pistol, SMG, Hunting Rifle; later stories add theirs to the picker) for my two slots (FR12)

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

**Given** the swap button (the first HUD button) and every later HUD button (consumable, ping, menu, Shop, Ready)
**When** a touch starts on a button
**Then** it presses the button and never spawns a move or aim stick; a touch that starts outside every button spawns a stick as usual
**And** every button is at least 44 × 44 px and HUD text at least 14 px (at devicePixelRatio 1), placed inside the safe areas

### Story 1.9: Machete melee

As a player,
I want to swing a Machete that hits every zombie in front of me,
So that I can fight up close in the crowd.

**Acceptance Criteria:**

**Given** the Machete is added to the dev loadout picker and active (12 damage, 2.5 swings/s, 1.8 m reach, 110° arc)
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

*(Done 2026-11-26, folded into 10.2 (`sprint-change-proposal-2026-11-26-epic-9-photoreal.md`): AC 1 and 2 are built; AC 3's reference-phone rows (iPhone 12 class, Pixel 5 class) are measured by Story 10.2 on the same phones, which is parked (designer 2026-11-25: all real-phone testing is parked, HANDOFF §5.2).)*

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

*(Done 2026-11-26, folded into 10.9's game nights (`sprint-change-proposal-2026-11-26-epic-9-photoreal.md`): the controls feedback and the melee decision are collected in the first 10.9 game night.)*

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
**Then** Caddy serves the client build behind the existing Cloudflare Tunnel, which terminates HTTPS and WSS for `hordes.sevend.io` (designer decision 2026-11-21: Cloudflare edge certificates, no open ports)
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

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** solo waves are × 0.35 (Epic 5 balance pass), not × 0.4.

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
**When** every joined player is Ready and there is at least 1 player
**Then** the host's Start button is enabled; tapping it starts the run for everyone
**And** (designer, 2026-11-23) the host can start a real online run alone in every build; waves are sized for one player (× 0.4)

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

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** revive radius 2.0 m centre to centre (`player.json reviveRadiusM`), not 1.2 m; the downed countdown pauses while someone revives, and the downed player's gun keeps reloading (FR10). Revived players get 30 % of max HP (`reviveHpFrac`).

**Acceptance Criteria:**

**Given** a player at 0 HP
**When** they go down
**Then** they cannot move or fire, a 20 s countdown shows above them, and `player.downed` is emitted (FR10)
**And** zombies ignore downed players and target the nearest standing player

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
**Then** they have a colored ground ring by slot (blue, orange, green, purple) and their name above them (NFR11)

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

**Given** a simple bot policy in `packages/shared` (move toward the team's centre, aim at the nearest zombie and fire, revive a downed teammate in reach, tap Ready, and in later epics buy from a fixed shopping list)
**When** bots play in a headless World or a real room
**Then** they clear waves well enough to measure economy and load (used by Stories 3.10, 6.1 and 10.8)

### Story 2.11: In-run menu

As a player,
I want a menu during the run to leave the game,
So that I can quit cleanly without closing the browser.

**Acceptance Criteria:**

**Given** a run in progress
**When** I tap the ☰ button (top corner, inside the safe area; Esc on desktop)
**Then** an in-run menu opens over the game while the run keeps going (online games don't pause), with Resume and Leave game
**And** Epic 8 adds Save and quit (host only) and Epic 10 adds Settings to this menu

**Given** I tap Leave game and confirm
**When** I leave
**Then** I return to the start screen and my teammates see "<name> left"; the run goes on without me (no reconnect window for a deliberate leave)

### Story 2.12: Rewound hit testing

As a player shooting while I run,
I want my shots to hit the zombies I aimed at on my screen,
So that a hit I saw is not taken back by the server, even against fast Runners.

(Added 2026-11-22 as a follow-up to Story 2.10 AC 3: at 150 ms RTT the netsim measured 5.3 % reversed hits kiting Walkers and 28.9 % kiting Runners, above the architecture's 1-in-20 threshold for rewinding.)

**Acceptance Criteria:**

**Given** an online run and a player firing a gun or swinging melee
**When** the server tests the hit
**Then** it uses the zombie positions the shooter saw (server tick minus the shooter's view offset, capped at 300 ms), only zombie positions are rewound, and the 2.7 shot advance is not added when the rewind applies

**Given** a hit on a rewound position
**When** it lands
**Then** damage, pushback, kill and rewards apply to the present zombie; a zombie that is dead now, or a reused slot, is not hit

**Given** a solo run, or an input without a view tick
**When** the player fires
**Then** behaviour is unchanged from 2.7, and a client cannot rewind more than 300 ms or into the future

**Given** `tools/netsim/hits.test.ts` with the rewind on
**When** kiting Runners and Walkers at 150 ms RTT
**Then** fewer than 5 % of apparent hits are reversed, and the added tick cost (4 players firing SMGs + 150 zombies) has p99 ≤ 1 ms

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

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** a run starts with 200 (designer 2026-11-24), and the wave-clear bonus is 15 × N (Epic 5 balance pass).

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

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** placement is carry + drag on a 0.5 m lattice (Stories 5.15–5.19, then the 10.10 Build button), and every barricade tier **stops every bullet** (FR53, `stopsBullets`); projectiles no longer pass over it.

**Acceptance Criteria:**

**Given** a build phase and the Wood barricade (40 currency) in the shop
**When** I tap it and then tap the ground
**Then** placement mode starts: both sticks are turned off, a preview snaps to a 1 m grid where I tap (tapping again moves it), a ⟳ button rotates it in 90° steps, and the preview is green when valid and red when blocked (FR50)
**And** a ✓ button confirms and a ✕ button cancels; either ends placement mode and turns the sticks back on (placement mode also ends when the wave starts)

**Given** a valid preview
**When** I tap ✓
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

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** melee does **not** hit through barricades or shot-blocking cover (walls, cars, bus, buildings); low cover (sandbags, barriers, traps, mines) doesn't block it (FR14, `combat/cover.ts`).

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
**Then** the headless replay reaches the same state (decay choices, spawns, kills) (NFR10)

### Story 4.5: Decay stage engine

As a player,
I want the city to change between waves as the run goes on,
So that wave 5 doesn't play like wave 1.

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** `DecayView` is gone; decay visuals are drawn by `apps/client/src/render/city/*` (architecture, client decay visuals).

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
*(As built, Story 12.4, 2026-11-26: no refund; the building is simply lost and the owner sees "Lost to the collapse". Story 12.1 AC 6 also clears walls within 0.8 m of new cover.)*

**Given** `decay.stage_changed` on the client
**When** it arrives
**Then** `DecayView` swaps the visible `stageN_*` layer group and shows a banner with the stage name ("Panic")
**And** client prediction applies the same mutations to its own map

**Given** the decay engine
**When** Vitest runs
**Then** tests cover stage timing, each mutation action, building destruction with refund, and same-seed variation choices *(as built, Story 12.4: destruction with no refund)*

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

**Given** the night moving on with decay (designer, 2026-11-22: a run is one night, no day-night cycle)
**When** the decay stage changes
**Then** the light state follows a time of night per stage: stage 1 dusk (a little blue left in the sky, warm shop light), stage 2 full night, stage 3 deep night with rain; stages 4–5 are darker placeholders until Epic 6 (blackout and fog in 6.4)

### Story 4.10: Milestone 1 playtest

*(Done 2026-11-26, folded into 10.9's game nights (`sprint-change-proposal-2026-11-26-epic-9-photoreal.md`): its FPS / bandwidth / reversed-hit rows and its fun, difficulty, economy, building and decay feedback are collected in the first 10.9 game night, on the 10-wave game. The "go / fix-first for Epic 5" decision is moot: Epics 5–8 are done.)*

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

### Story 4.11: Stage-object readability pass

As a player,
I want the sandbags, the wood barricade and a burning car's fire to be recognisable at a glance, and to see clearly when I am burning,
So that I understand the street and react to fire without being told.

(Added by the designer on 2026-11-23 after playing the deployed build; prototype: `claude.ai/artifact/DD4ECzvpxW98HGW65b6oGZ`.)

**Acceptance Criteria:**

**Given** stage 3 sandbags
**When** they are drawn
**Then** they read as burlap sandbags (tan, pillow-shaped, tied ends, woven texture, brick stacking) and still look low (short shadow)

**Given** a wood barricade
**When** it is drawn
**Then** it reads as nailed wooden planks with a cross-brace, clearly different from sandbags, with the damage look and HP bar unchanged

**Given** a burning car
**When** a player approaches
**Then** the damage edge is shown by flames along the zone edge that pulse with the damage tick, exactly at the radius where damage starts

**Given** a survivor taking fire damage (server events)
**When** they burn
**Then** every player sees flames, embers and smoke on that survivor, and the burning player also sees an orange screen-edge glow and a "-5" damage number per fire tick

Designer picks (2026-11-23, references in `docs/art/4-11/`): sandbags **S2** (olive-drab military wall), wood barricade **B6** (sharpened palisade on struts, turns with placement), burning car **F6** (smoke, burning debris, glow, a circle of small fires at the damage edge); burning cues: all four. **B8** (upright pallets + barbed wire) is kept for a later barricade upgrade (Epic 5).

### Story 4.12: Stage objects in game code

As the designer,
I want every object in the game drawn in game code,
So that the art is consistent, free to change and ready for customization.

(Added 2026-11-23 after the designer chose game code for all art; mockups on the comparison page, "round 4" and "round 5" cards.)

**Acceptance Criteria:**

**Given** the wood barricade (B6), the sandbags (S2), the burning car (designer's pick from three code versions) and the burning-survivor flames/smoke
**When** they are drawn
**Then** they come from game-code drawing functions with the same look as the accepted mockups, the 4.11 rules still hold (flames' visible edge at the damage radius, smoke below characters, barricade rotation with a game-drawn shadow), and the Meshy `objects` atlas and its loader are removed

### Story 4.13: Survive losing the graphics

As a player on a phone,
I want the game to come back intact after I switch apps,
So that the street, cars, survivors and zombies don't vanish.

(Bug reported 2026-11-23 by the designer's friend: after switching apps and coming back, everything except the floor was invisible, and a page reload did not fix it.)

**Acceptance Criteria:**

**Given** the browser loses and restores the WebGL context (app switch, memory pressure)
**When** the game comes back
**Then** every generated texture (city tiles, character/zombie/building/fx atlases, fire particles, weapon art) is rebuilt and the game looks as before, solo and online

**Given** the browser starts the game without WebGL (Phaser falls back to the Canvas renderer, e.g. Chrome blocked WebGL for the site after a GPU crash)
**When** the game loads
**Then** it either renders correctly in Canvas mode or shows a clear message ("Graphics acceleration is off — fully close and reopen your browser"), never a silent floor-only screen; the debug overlay shows which renderer is active

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

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** the Fire Axe swings 1.4 /s (GDD, `weapons.json`), not 1.1.

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

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** Shotgun pellets deal 5 (8 × 5); the Assault Rifle deals 10 at 6 shots/s (GDD, `weapons.json`).

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

**Given** the Flamethrower (20 damage/s, 6 m FS1 fuel jet, 20° cone, 6 s of fuel, 3.0 s reload, 700) and the Gas torch (3 m FS2 cone, 60°, same burn and fuel rules, 550; designer, round C)
**When** I aim past the dead zone
**Then** it damages everything in the cone continuously and ignites zombies for +3 damage/s for 3 s (re-ignition refreshes the timer) (FR16)

**Given** a damage source tagged `fire` or `explosion`
**When** it hits a teammate or the shooter
**Then** they take 50% of its damage; bullets and melee never hurt players (FR18); the one exception is the Bloater blast, which does full damage to every player (5.8 D1)
**And** this rule lives in the combat damage system and applies to every later fire and explosion source

**Given** the friendly-fire rule
**When** Vitest runs
**Then** tests cover bullets (0%), melee (0%), fire (50%) and explosions (50%)

### Story 5.5: Grenade Launcher

As a player,
I want a Grenade Launcher that lobs explosive rounds,
So that I can blow apart packed crowds at a distance.

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** 2.5 m blast, price 700, 3–12 m lob with a landing ring; flies over cars, the bus, pumps, low walls, barriers, sandbags, barricades and turrets and is stopped only by buildings; cars and the bus still shield the blast (GDD, `weapons.json`).

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

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** the mine costs 35 (GDD, `buildings.json`).

**Acceptance Criteria:**

**Given** one of my wood barricades in a build phase
**When** I tap it and choose Upgrade (+50)
**Then** it becomes a reinforced barricade with 350 HP; upgrading again (+70) makes it a metal barricade with 600 HP (FR52)

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
**Then** it lights a 4 m radius (8 m across; 6 m in blackout waves, `light.blackoutRadiusM`) and is recorded as a light source in the server's light state (used by blackout waves in Epic 6)
**And** it stays out of the shop until Story 6.3 adds blackout (balance flag), so nobody pays for a light with no use

**Given** a med station (300 HP, 400)
**When** players stand within 2 m of it
**Then** they heal 5 HP/s up to their max HP (downed players are not healed)

### Story 5.11: Gear

As a player,
I want gear that changes how I play for the rest of the run,
So that my build is more than my weapons.

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** Body armor II costs 300 (GDD, `gear.json`).

**Acceptance Criteria:**

**Given** gear bought in the shop
**When** I own it
**Then** it lasts the whole run and shows as an icon in the HUD (FR48)

**Given** each gear item
**When** owned
**Then** Body armor I gives +25 max HP (150), Body armor II +50 (350, replaces armor I), Running shoes +10% speed (150), Revive kit: I revive teammates in 1.5 s (the fastest reviver in the zone counts; no stacking; no effect on my own revive) (150), Tactical flashlight is recorded for the blackout light cone in Epic 6 (120; kept out of the shop by a balance flag until Story 6.3)
**And** each item can be owned once

### Story 5.12: Consumables

As a player,
I want a quick-use slot for medkits, grenades and molotovs,
So that I have an emergency answer.

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** grenades and molotovs are thrown 2–8 m on the Grenade Launcher's lob (over everything but buildings), in waves only; a molotov's fire needs a clear line from the zone centre; the medkit also works in build phases (FR49).

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
**Then** I see an always-available section (consumables, upgrades for weapons I own; buildings are in the build bar, 5.16) and 6 cards of weapons and gear drawn from my pool (FR46, FR47)
**And** the offer always contains at least 1 weapon and 1 gear card; weapons and gear I already own are not drawn; items with `inShop:false` are never drawn; the Pistol is never a card
**And** when my pool can't fill 6 cards, fewer cards show, and Reroll is disabled when no new draw exists

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

### Story 5.14: Bear trap

As a player,
I want a bear trap that grabs a zombie and holds it in place for a few seconds,
So that I can stop a dangerous zombie at a choke point.

(Added by the designer on 2026-11-23 as a second trap type, recognisable at a glance without its name; art drawn in game code, designs on the comparison page.)

**Acceptance Criteria:**

**Given** a bear trap placed in the build phase (non-solid, like the 5.9 spike trap)
**When** a zombie steps on its plate
**Then** the jaws close and hold that zombie in place for a set time (balance JSON), then the trap must be re-armed or wears out; the closed trap looks different from the open one

**Given** a Brute or other heavy zombie
**When** it steps in
**Then** it is held half as long (1.5 s instead of 3 s) and the trap wears normally

**Designer decisions D1–D12 (2026-11-23, "okay with everything"; details in `5-14-bear-trap.md` and `docs/epic-5-decisions.md` › Bear trap):** $50, 1 × 1 m floor building, 0.35 m plate, 5 snap damage, holds 3 s ("caught by the leg": no movement or push, still bites/spits/swells), one zombie per trap, never catches in a build phase, players are never caught or blocked (a held zombie doesn't block players), any standing player re-arms it by standing on it 1 s, all traps re-arm at each build start, worn after 4 catches (25 of 100 HP each), repairable; fire wears it, mine and Bloater blasts don't. Non-solid: stops no bullets and no melee (like the 5.9 traps). World look B-T1 drawn in code (open and closed jaws); I1 build-bar icon (Story 5.27).

### Building UX rework (Stories 5.15–5.25)

(Added 2026-11-23 from the building-UX idea session; designer picked **B · Carry + drag**, decisions in `docs/ideas/building-ux/ux-spec.md` §15. 5.15–5.19 (BX-1–BX-5) are client-only and can run alongside other Epic 5 work; 5.20, 5.22 and 5.24 (BX-6, BX-8, BX-10) touch the server's building code: schedule them after 5.10 and 5.14 have merged. Every story inherits the EPIC 5 BRIEF.)

### Story 5.15: Carry the ghost and keep moving

(BX-1 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want to keep walking while I hold a building, so that I can put it exactly where I'm standing instead of freezing and tapping.

**Acceptance criteria**
1. **Given** a build phase, **when** I start placing a building, **then** the left stick still moves my survivor, the input sent is normal movement (not `neutralizeInput`), and the right stick doesn't fire (there is nothing to shoot; the right half is reserved for building in a build phase).
2. **Given** I'm holding a building and not pinned (BX-5), **then** the ghost's near edge sits **1.0 m** (`BUILD_CARRY_GAP_M`, balance/controls JSON) beyond my body along my facing: `centre = me + facing × (0.4 + 1.0 + half the footprint's extent along facing)`, its min corner snapped to the 0.5 m lattice with **0.1 m hysteresis**.
3. **Given** a non-square building, **then** it auto-rotates so its long side is across my facing; it changes only when facing passes a diagonal by more than **10°**. The two-sided barricade art puts its struts on my side.
4. **When** I press ⟳, **then** it turns 90° clockwise around its centre and auto-rotate is off for this held item (🔒 on the button).
5. The hand cluster replaces ⟳ ✓ ✕ in the bottom centre: **Place** 76 px at (92, 92), **⟳** 60 px at (190, 80), **✕** 48 px at (80, 196) (CSS px from the bottom-right safe-area corner; ux-spec §4). Ready moves 40 px left of centre.
6. **Place** sends `building.place` at once (no confirm step). The ghost stays in hand only after BX-4; until then Place ends holding (as ✓ does today).
7. Holding ends on ✕, the phase leaving the build, a new wave number, the menu opening, me being downed/out, or game over (today's rules, unchanged).
8. My own body never blocks the carried ghost at default settings (the 1.0 m gap); if a teammate does, the ghost is red (BX-3 says why).

**Fairness / beat the rule:** walking doesn't change what the server accepts (same `placementError`). Reviewers try: carry a ghost onto a teammate, onto a spawn's 2 m circle, off the map edge, through a wall corner; place while running at full speed under `?lag=150` (the spot sent = the spot shown at the press).

**Tests:** `placement.ts` unit tests for the carry centre per type and facing (barricade 1.65 m, turret 1.9 m, trap 2.4 m), the rotation hysteresis, the snap hysteresis; a browser check that the survivor moves while holding.

---

### Story 5.16: Build bar replaces the shop for buildings

> **Current rule (readiness check 2026-11-25):** Story 10.10 (done, PR #20) replaced this 4 × 2 grid with the quick tile + Build button + Shop chip and a 3 × 3 panel (layout B); the money, cap and refusal rules below are unchanged.

(BX-2 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want my buildings under my right thumb, so that I don't open a menu for every barricade.

**Acceptance criteria**
1. **Given** a build phase with empty hands and nothing selected, **then** the bottom-right shows a **4 × 2 grid of 56 px tiles** (8 px gaps, 16 px inset): every building where `forSale && inShop` (5.10's flag) in balance order, and **🛒 Shop** as the last tile. 5.14's bear trap appears without UI changes.
2. Each tile shows the building's I1 build-bar icon (Stories 5.26/5.27; the world art is the fallback) and price. **When** I can't afford it, **then** the tile is at 40 % opacity with a red price; **when** I'm at the cap, the count above the grid reads "6/6" in red.
3. **When** I tap an affordable tile, **then** that building is in my hands (BX-1) at once. **When** I tap an unaffordable tile or I'm at the cap, **then** nothing is picked and the reason toasts ("Need $250 (you have $180)", "Building limit reached (6)").
4. The Shop tile opens today's shop (weapons, upgrades, 5.13 cards). The shop no longer lists buildings, and the separate Shop button next to Ready is gone.
5. The grid is hidden while holding (hand cluster), while a building is selected (BX-7) and while I'm downed/out. While the grid shows, the swap and ammo buttons are hidden (5.16 D3); Story 5.12 moves the swap and consumable buttons above the grid's top-left in build phases.
6. More than 7 building types: the 7th tile becomes "More ▸" and pages. (Not needed today.)

**Tests:** tile list from balance (with `inShop: false` hidden), affordability and cap states, shop no longer lists buildings, a browser screenshot at 800 × 360 and 1024 × 768.

---

### Story 5.17: Why it's red

(BX-3 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want to know why I can't build somewhere and what's in the way, so that I fix it in one move.

**Acceptance criteria**
1. A shared, **client-used** `blockReason(world, ownerId, box, exceptId?)` next to `footprintBlocked` returns the first cause in this order with what caused it: off map → spawn clearance (which spawn) → map solid/cover (which object) → another building (which) → me → a teammate (who) → a zombie. `footprintBlocked` stays the server's check; a unit test proves `blockReason(...) !== null ⇔ footprintBlocked(...)` over random layouts (fuzz, brief 7).
2. The reason line above the hand cluster shows: "Off the street", "Too close to a zombie spawn (2 m)", "Blocked by the bus / a car / the sandbags / a wall" (from a name table for the Downtown objects), "Overlaps a building", "You're standing there", "Bo is standing there", "A zombie is in the way", "Need $X (you have $Y)", "Building limit reached (6)". The server's refusal codes don't change.
3. The culprit is outlined red in the world: the map box, the building, the spawn's 2 m circle, the player's ring.
4. While I hold anything, every spawn's 2 m no-build circle in view is drawn faint (red 12 % fill, dashed edge).
5. Blocked ghosts get a 45° hatch and a ✕ glyph as well as the red colour (colour-blind safe). Place turns grey with a red ring but still sends (the server judges, as today).
6. Range rings from balance: turret `rangeM`, mine trigger/blast (today), med station `heal.radiusM`, floodlight `light.radiusM`, bear trap plate.
7. Red is instant; the ghost turns valid only after 250 ms of continuous clear, and every blocked frame restarts the clock (no flicker while walking past a teammate; 5.17 review L1).

**Fairness / beat the rule:** the client explanation never disagrees with the server's accept/refuse for the same World (the fuzz test). Reviewers try a spot that's off-map *and* near a spawn (first cause wins, matching the order).

---

### Story 5.18: Place, place, place (chain and pending under lag)

(BX-4 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want to place several of the same building in a row and trust it under lag, so that I can build a wall in seconds.

**Acceptance criteria**
1. One Place = one building (designer: no hold-to-paint).
2. **Given** I place and can still afford another and I'm under the cap (counting pending), **then** the same building stays in my hands. Otherwise the hand empties with a toast ("Not enough money for another" / "Building limit reached (6)").
3. **Chain jump:** the next ghost appears **pinned one footprint further along its long side** (barricades end to end; square types one footprint toward the right of my facing; mines 1.0 m), toward the side of my last drag (BX-5) if any. If that spot is blocked, the ghost goes back to carry.
4. **Pending:** a sent placement is drawn as a dashed outline with a spinner tick; it counts as occupied for my next ghost; its price comes off the **shown** wallet (HUD, tiles, chip) until the answer.
5. On `building.placed` the pending box becomes the building. On `building.refused` (or no answer within **2 s**) it shakes 3 × 150 ms, fades in 300 ms, the reason toasts and the shown wallet goes back.
6. No more than `maxPerPlayer − owned − pending` placements are ever in flight; at most 4 sends per second from one client.
7. **Under `?lag=150&jitter=20`:** three quick Places give three buildings, no double charge, the HUD wallet never shows less than the server's final wallet for more than one round trip.

**Fairness / beat the rule (F1, F6):** reviewers try 10 taps in 1 s with $100 (only 2 barricades accepted, 2 charged), tapping Place at the build→wave edge (refused `not_build_phase`, nothing charged), a hidden tab across a build start with pending boxes (cleared on the new phase).

**Tests:** unit tests for the chain jump per type/rot, pending wallet maths; NetSimHost test at 150 ms; browser check of a 3-barricade wall.

---

### Story 5.19: Thumb drag to nudge and pin

(BX-5 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want to nudge the ghost with my right thumb without covering it, so that the last half-metre is easy.

**Acceptance criteria**
1. **Given** I'm holding a building, **when** a touch on the right half that didn't start on a button travels > **8 px**, **then** the ghost is **pinned** and moves by the finger's movement × **gain 1.0** (relative, never jumping under the finger). Snap with 0.1 m hysteresis.
2. The left stick keeps moving my survivor at the same time.
3. Pinned = the ghost stays in the world while I walk. The item chip shows "↩ carry" (orange border); tapping it carries it again. A pinned ghost that leaves the view returns to carry by itself.
4. The ghost is clamped to the view, 1 m in from the edges.
5. `controls.json` holds `buildDragGain`, `buildDragStartPx`; `?tune=1` exposes them (as the stick radius today).
6. The camera does **not** lead toward a pinned ghost (designer): it stays on the survivor as today.

**Tests:** placement unit tests for relative drag, pin/unpin; a browser check that a right-half drag doesn't fire or aim.

---

### Story 5.20: Take back, sell and undo

> **Current rule (readiness check 2026-11-25):** since Story 10.10 the undo chip ↶ has one spot in both modes, centre (164, 146) from the bottom-right safe-area corner (10.10-B2/B15), not "above the build bar's top-left".

(BX-6 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want to undo a misplaced building and sell old ones, so that a mistake costs nothing and I can rebuild my defence.

**Acceptance criteria**
1. **Server:** C2S `building.sell { id }` (int 1–65535, strict, `this.net.guard`). Shared `sellBuilding(world, playerId, id)` checks in order: unknown player → `not_alive` → not build phase → gone → not owner; refunds per F2, removes the building (`version++`, `wallVersion++` if solid), emits `building.sold { buildingId, ownerId, refund, x, y }` (new net event kind). Refusal S2C `building.sell_refused { id, reason }`. 5.20 also adds the same standing check (`not_alive`) to place, repair and upgrade (5.11 re-review R2), with tests for a downed and an out player in each.
2. **Server bookkeeping:** each building keeps `paid` (price + upgrades) and `paidThisBuild` (reset to 0 at every build start). Server-only: not synced, not in `snapshotWorld`'s client view; in `snapshotWorld` for determinism.
3. **Undo chip ↶** (48 px, above the build bar's top-left, so it never overlaps the slid Ready button; checked at 568 × 320 and 800 × 360 with ≥ 12 px gaps) for **10 s** (designer) after each placement, with a draining ring; pressing it sells that building (100 % refund). If the placement is still pending, the undo is sent as soon as it's placed.
4. The label reads **"Take back +$40"** for a building placed this build phase and **"Sell +$20"** otherwise (BX-7 shows it).
5. FX: the building lifts and fades in 200 ms, "+$40" floats up; coins sound; 12 ms haptic.

**Fairness / beat the rule:** reviewers try: sell a teammate's building (refused `not_owner`); sell in a wave (refused); upgrade then sell in the same phase (100 % of both); upgrade last phase, sell now (50 % of everything); sell a worn spike trap and rebuy (net = repair cost); spam sell with a crafted id flood (guard); a mine sold while a zombie stands on it in the build phase (no blast: removed in the build phase only).

**Copies (brief 2):** World (`paid`, `paidThisBuild` server-side) → `syncState` removes it → mirror → Predictor (collision follows the removal) → `devThrottle` → `snapshotWorld`.

---

### Story 5.21: Building action bar

(**Merged with Story 5.22** by the designer on 2026-11-24: one story, "Building action bar and move".)

(BX-7 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want the actions for a building under my right thumb, so that repairing, upgrading and selling are one tap away.

**Acceptance criteria**
1. **Given** a build phase with empty hands, **when** I tap a building (3.7's tap rule and 0.4 m tolerance, unchanged), **then** the bottom-right shows the action bar (buttons 78 × 56, 8 gap, right-aligned at 16, centre bottom 112): **✥ Move** (owner), **Upgrade $Y** (owner, has a next tier: 5.9), **Repair $X** (anyone; "full HP" and dimmed when full), **Take back / Sell +$Z** (owner), **✕**. Info line above: "Spike trap · Yours · HP 93/300". The bar is hidden while I'm downed/out. Sizes stay 78 × 56 at centre bottom 112 (not the spec's 64 × 56 @ 92); checked at 568 × 320 and 800 × 360 with ≥ 12 px gaps.
2. A teammate's building shows only Repair and ✕, with "Only Bo can move, upgrade or sell it".
3. This replaces 3.7's bottom-centre repair panel; `RepairPanel` keeps its logic (pending upgrade, wave-close rules).
4. **Long-press** (450 ms, ≤ 12 px) on my own building picks it up (BX-8); a ring fills from 150 ms.
5. The menu opens **only by tapping** a building (designer): no walk-up select.
6. A tap that lands on Ready **and** within a building's tap area selects the building instead of starting the wave (the menu has no other route). Other HUD buttons keep priority.

**Tests:** RepairPanel tests extended for the owner/teammate button sets; browser screenshots of both.

---

### Story 5.22: Move a building

(**Merged into Story 5.21** by the designer on 2026-11-24: built and reviewed together as "Building action bar and move".)

(BX-8 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want to pick up my building and put it somewhere else for free, so that I can fix a bad spot without losing money.

**Acceptance criteria**
1. **Server:** C2S `building.move { id, gx, gy, rot }` (strict, guard). Shared `moveBuilding(world, playerId, req)` checks: unknown player → `not_alive` → not build phase → gone → not owner → the new footprint with the building itself ignored (`footprintBlocked(world, box, exceptId)`, the existing rules otherwise). On success it updates gx/gy/rot and the footprint, `version++` (`wallVersion++` if solid), emits `building.moved { buildingId, gx, gy, rot }`. Refused → nothing changes, `building.move_refused { id, reason }`.
2. **Client:** Move ✥ or a long-press puts it in my hands: pinned at its current spot (carry mode: in front of me), its old spot drawn dashed (it still stands and blocks for everyone until the move is accepted). Place sends the move; ✕ puts it back (sends nothing). The Place label reads "MOVE", the reason line "Move Spike trap · free".
3. Pending move: dashed at the new spot until `building.moved`; refusal shakes it there and the building stays where it was.

**Fairness / beat the rule (F3, F5):** reviewers try: move a teammate's (refused); move during a wave (refused); move a damaged barricade (HP kept); move a worn spike trap (wear kept); move onto its own old footprint shifted 0.5 m (allowed: itself ignored); move into a spawn circle (refused); move a wall to seal a teammate in (same rule as placement: a footprint can't overlap a player).

**Copies (brief 2):** buildings are now movable, so `Building`'s readonly `gx, gy, rot, minX…maxY` become writable through `moveBuilding` only; check every cache that assumed "buildings never move" (BuildingView's sprite transform keyed by `version`; flow field via `wallVersion`; light list (5.10) and heal list rebuilt on `version`).

---

### Story 5.23: Placement feel and owner marks

(**Merged with Story 5.25** by the designer on 2026-11-24: one story incl. mouse and keys parity.)

(BX-9 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want placing to feel solid and to see whose buildings are whose, so that building with friends is readable.

**Acceptance criteria**
1. Pick: the ghost scales 0.8 → 1.0 in 120 ms; a soft click.
2. Placed (mine or a teammate's): 8 dust particles for 0.4 s, the building drops 0.15 m → 0 in 120 ms, a "thunk" (wood), "clank" (metal/turret) or "click" (mine/trap); my own: 12 ms haptic. A teammate's at > 12 m is quieter.
3. Refused: 30-40-30 ms haptic + a dull buzz.
4. For 3 s after placing, an L-shaped corner tab in the owner's ring colour (2.9 colours); during a build phase every building shows a 0.18 m owner dot at its min corner. Both hidden during waves.
5. Haptics follow the existing mute setting; every haptic has a visual twin. All effects pooled (brief 12).

---

### Story 5.24: Teammates' ghosts

(BX-10 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a player, I want to see what my teammates are about to build, so that we don't build on top of each other.

**Acceptance criteria**
1. C2S `building.ghost { type, gx, gy, rot }` (or `type: ""` for none), guarded, sent **only on change and at most 4 Hz**, build phase only. The server relays it to the other players (not stored in the schema, not in the World).
2. Others see it as a dashed outline in the sender's ring colour, 50 % alpha, with "Bo · Auto-turret" above it. Never coloured valid/blocked, never blocks anything (F7).
3. Ghosts vanish at the wave start, when the sender leaves, and after 1 s without an update.
4. Bandwidth: report the measured B/s (expected ≤ 0.4 KB/s for 30 s of build, 0 in waves; brief 11).

**Beat the rule:** reviewers try flooding ghosts (guard drops > 10/s silently), sending a ghost in a wave (dropped), a ghost onto a spawn (cosmetic only).

---

### Story 5.25: Mouse and keys parity (optional)

(**Merged into Story 5.23** by the designer on 2026-11-24: built and reviewed together with placement feel and owner marks.)

(BX-11 in `docs/ideas/building-ux/draft-stories.md`; design: `ux-spec.md`, prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR.)

As a desktop player, I want the same building flow with mouse and keys.

**Acceptance criteria:** the ghost follows the cursor (absolute) when a mouse moved last; `1`–`7` pick from the build bar; `R` / wheel rotates; left click / `Space` places; right click / `Esc` puts away; `Z` undoes; `M` picks up the selected building. Keys added to `keyMap.ts`.

### Story 5.26: Build-bar icons

(Added 2026-11-23: the designer decided in the 5.16 session that buildings get their own build-bar icons, separate from the top-down world art. Picks in `docs/epic-5-decisions.md` › Build-bar icons; code drawings in `docs/art/5-16/icons/index.html`, claude.ai/artifact/7kKW2xQre8zUWQZri7tWg3.)

As a player, I want each building tile in the build bar to show a clear, recognisable icon, so that I pick the right building at a glance.

**Acceptance criteria:** the build bar (5.16) draws code-drawn icons in style **I1** (low three-quarter tilted objects): wood barricade I1, spike trap I1, auto-turret **T1** sentry gun (T2 armoured dome drawn and kept for a later turret tier/skin), mine **M1** pressure mine. Icons are baked once through `addGeneratedTexture` into a HUD atlas (`icon_build_<type>_a`, ≤ 2048²), crisp at 56 CSS px tiles on dpr 2–3; any building type without an icon falls back to its world art (med station, floodlight, bear trap get I1 icons when their stories ask). Affordable / unaffordable / cap states unchanged. Browser screenshots at 800 × 360 and 568 × 320.

### Story 5.27: Build-bar icons for the floodlight, med station and bear trap

(Added 2026-11-23: designer approved I1-style icons in the build-icons session; page claude.ai/artifact/32iPpVeANTX8ipBPGk4Vqf, code `docs/art/5-27/icons.html` › `floodlightFL1`, `medStationMS10` (orange first-aid case with a big white cross on the left), `bearTrapBT1`.)

As a player, I want every building tile in the build bar to show the same kind of tilted icon, so that the bar reads as one set.

**Acceptance criteria:** the three drawings are ported into `render/city/buildIcons.ts` (same `(g, w, h)` form, 44×30 box, I1 palette) and mapped in `BUILD_ICONS` / `TYPE_FRAMES` (`floodlight`, `med_station`, `bear_trap`; the bear trap maps harmlessly until Story 5.14 adds the type); the 5.26 test asserts every shop building now has an icon; screenshots with `?shopall=1` at 800 × 360 and 568 × 320.

### Story 5.28: Early weapon card art

(Added 2026-11-24: the designer picked code-drawn shop art for the three Epic 1 weapons in the 5.13 follow-up session; picks in `docs/epic-5-decisions.md` › Early weapon card art, code in `docs/art/5-13/early-weapons.html` › `EARLY`.)

As a player, I want the SMG, Hunting Rifle and Machete cards to show the weapon like every other card, so that the shop reads as one set.

**Acceptance criteria:** `smgS1`, `rifleH1`, `macheteM1` are ported into `render/city/weaponArt.ts` (icon view only; ICON_Y 0.44 / 0.5 / 0.5) and the 5.13 card shop shows them in place of the generic `KindGlyph` pictogram (no shop weapon falls back to a pictogram; the in-hand art is unchanged); the kept variants S2/S3, H2/H3, M2/M3 wait for upgrade tiers or skins; screenshots at 800 × 360 and 568 × 320.

---

## Epic 6: The full run: decay, boss, events, endless

(Epic 6 stories revised 2026-11-23 from the Epic 6 idea session: `docs/ideas/epic-6/proposal.md`, designer decisions D1–D7; Behemoth prototype claude.ai/artifact/16PKRmcKLyK4qfoG9ghASM. Updated 2026-11-24 with the 110 story decisions the designer accepted (`docs/epic-6-decisions.md`); story files `_bmad-output/implementation-artifacts/6-*.md` hold the full detail.)

A team plays the full 10 waves from Evening to the Behemoth through Ruins and Collapse (blackout, fog), meets two special events, votes to extract or stay, and can go endless.

### Story 6.1: The full 10-wave curve

As a team,
I want the run to last 10 waves with the full zombie mix,
So that a run builds to a real climax.

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** solo waves are × 0.35 (Epic 5 balance pass); the solo Behemoth stays × 0.4.

**Acceptance Criteria:**

**Given** `waves.json`
**When** a run is played with 4 players
**Then** wave sizes are N × 40 (W10 = 400), at most 150 alive, × 0.4 / 0.6 / 0.8 / 1.0 by player count (FR28)
**And** waves 7–10 use this mix (walker / runner / crawler / spitter / bloater): W7 38/22/15/10/15, W8 35/24/15/11/15, W9 40/18/17/10/15, W10 38/22/15/10/15, with 2 fixed Brutes in each of waves 7–10 (not scaled by player count) (FR29)

**Given** the temporary 6-wave ending from Epic 5
**When** this story is done
**Then** it is removed; until Story 6.11 exists, clearing wave 10 shows the Results screen

**Given** a full 10-wave run with 4 bots
**When** the economy is logged
**Then** each player's earnings are compared with the 2,500–3,000 target and the result is written to the test output, and the sim asserts that all 10 waves were played


### Story 6.2: Ruins

(**Merged with Story 6.4** by the designer on 2026-11-24: one story, "Ruins and Collapse".)

As a player,
I want rubble to close an alley and new holes to open in the walls,
So that the map squeezes us as the city breaks.

**Acceptance Criteria:**

**Given** the build phase before wave 7
**When** stage 4 is applied
**Then** rubble closes one of alleys 1–3 (a decay variant picked by the `decay` stream), 3 rubble piles (≈ 2 × 1.5 m) appear in the streets as hard cover (they stop bullets and bodies), and 2 breach spawn points with `minStage: 4` open in building walls facing the intersection (FR62)
**And** cells covered by rubble refuse building placement ("Blocked by rubble", the 5.17 reason line; 6.2 D5), and buildings already there are destroyed with the usual 50 % refund (FR53) *(as built, Story 12.4, 2026-11-26: no refund, FR58)*
**And** rubble also stops melee and shields blasts (like cars); lobbed rounds (launcher, grenade, molotov) fly over it, because rubble is not `building: true`
**And** the "no area is ever enclosed" and spawn-clearance tests pass on every stage × variant combination

**Given** stage 4
**When** it plays
**Then** each streetlight drops out for 0.15–0.6 s every 4–10 s (seeded per lamp), shop glow is at 30 %, and the wind and falling-debris placeholder ambience plays (debris is sound and dust only, no damage: designer, D4)


### Story 6.3: Blackout lighting

As a player,
I want blackout waves where only flashlights, floodlights, fires and muzzle flashes light the dark,
So that light becomes something we fight for.

**Acceptance Criteria:**

**Given** the server's light state
**When** the blackout flag is on
**Then** the client draws a half-resolution darkness texture leaving unlit ground at 20 % light in a power-failure wave (waves 6–8), 10 % in wave 9 and 5 % in wave 10 and every endless blackout (designer look pick, 6.3 D1), and cuts out: each player's flashlight cone along their aim (60°, 8 m; Tactical flashlight 80°, 12 m), a 1.6 m glow round every survivor, floodlights (6 m radius in blackout: designer, D5), fire zones (4 m) and muzzle flashes (3 m for 100 ms) (FR64)
**And** teammates (with rings), zombie eyes within 14 m, event markers, pings (8.7) and anything Stories 6.5–6.10 mark "above the darkness" are drawn above it

**Given** the blackout flag is off
**When** the game renders
**Then** no darkness texture is drawn (no cost)

**Given** this story is done
**When** the build phase opens
**Then** `inShop` is true for both from wave 1 (balance flag from Stories 5.10 and 5.11): the Floodlight shows as a build-bar tile (5.16) and the Tactical flashlight can appear as a gear card (5.13)

**Given** quality settings
**When** a player looks for a way to turn darkness off
**Then** there is none: blackout darkness is gameplay (FR87)

**Given** the dev cheat "force blackout"
**When** used with 150 zombies in view on the reference phones
**Then** FPS is recorded in `docs/perf/epic-6-blackout.md`


### Story 6.4: Collapse

(**Merged into Story 6.2** by the designer on 2026-11-24.)

As a player,
I want the power to die, fog to roll in, and the last two waves to be fought in the dark,
So that the run hits its tension peak.

**Acceptance Criteria:**

**Given** the build phase before wave 9
**When** stage 5 is applied
**Then** the power is out (streetlights and shop glow removed from the light state) and waves 9 and 10 are blackout waves (FR63)

**Given** a wave at stage 5
**When** a zombie is more than 10 m from the local player
**Then** it is hidden on that player's screen unless it is inside a standing survivor's flashlight beam (which sees to its full length; 6.4 D2); zombies within 9 m are always shown and fade out by 10 m (6.4 D1), and aim assist never locks a zombie the fog hides (6.4 D4); fog vision cannot be turned off (only its visual quality can)

**Given** a build phase at stage 5
**When** it plays
**Then** the darkness is at half strength and fog opens to 14 m (planning is not done blind)

**Given** stage 5
**When** it plays
**Then** the near-silence placeholder ambience plays (growls and rain)


### Story 6.5: The Behemoth arrives

As a team,
I want a huge boss to crash into wave 10 while the horde is still coming,
So that the run ends with a fight we'll talk about.

**Acceptance Criteria:**

**Given** wave 10
**When** half of the wave's zombies have spawned
**Then** a 4 s warning plays (rumble, red edge marker, "Something big is coming"), then the Behemoth walks in from the main street end (west, east, north or south) farthest from the team (6.5 D2) and at least 14 m from every player: radius 2 m, 1.3 m/s, immune to knockback, 6,000 HP × 0.4 / 0.6 / 0.8 / 1.0 by player count (FR33, FR31)
**And** while it lives at most 110 zombies are alive (150 again after it dies), a boss bar with a 50 % notch shows at the top of the screen, and placeholder boss music starts
**And** it moves on its own flow field at boss size (inflated by 2 m) toward its target, rebuilt every 0.5 s; barricades and turrets are costed, not walls, and a building it walks into takes 100 damage per second (it pushes through slowly)
**And** its look is drawn in game code like the Brute, baked through `addGeneratedTexture` into a boss atlas with 5 poses (walk, slam, charge/rush, throw, stun/roar); in blackout its outline and eyes draw above the darkness (eyes red when enraged)

**Given** the Behemoth
**When** it picks a target
**Then** it chases the standing player who dealt it the most damage in the last 5 s (ties: nearest), switches at most once every 4 s, never targets a downed player, and the target shows a red skull to everyone

**Given** a standing player within 4.0 m of its centre and the slam ready
**When** it slams
**Then** it raises its arms for 1.2 s while a red hatched ring of 4.5 m from its centre fills, then players whose centre is inside 4.25 m (0.25 m edge grace) take 40 damage and are pushed 2 m out; 0.8 s recovery, cooldown 4 s (FR34, FR84)
**And** the slam ignores cover: walls, cars and barricades inside the ring don't shield anyone (the drawn zone is the promise)

**Given** any boss attack
**When** it is telegraphed
**Then** the danger zone is fixed at the telegraph's start, the start tick is sent reliably and the client draws the fill from that tick, hits use the player's newest server position (no rewind), only one boss attack runs at a time, and a gap of 2.8 / 2.2 / 1.8 / 1.5 s (1–4 players) follows each recovery
**And** telegraphs draw above zombies, darkness and fog (with a hole for the boss's body), and an edge marker with the next attack's icon shows when the boss is off screen

**Given** Vitest
**When** it runs
**Then** tests cover HP scaling, slam timing and radius, edge grace (just inside hit, just outside missed), the target rule, the alive cap and one-attack-at-a-time


### Story 6.6: Behemoth charge and throw

(**Merged with Story 6.7** by the designer on 2026-11-24: one story, "Behemoth charge, throw, enrage and end".)

As a team,
I want the Behemoth to charge through our defenses and throw wrecks at us,
So that we have to keep moving, and can bait it into a wall.

**Acceptance Criteria:**

**Given** its target 5–12 m away with at least 4 m of clear lane
**When** the Behemoth charges
**Then** it lowers its head for 1.0 s while a lane as wide as its body plus a survivor (4.8 m) is drawn to where it will stop, then rushes up to 10 m at 12 m/s; players it touches (0.25 m grace) take 30 damage and are shoved 2.5 m sideways, once per charge; every building in its path is destroyed; zombies in its path are trampled (FR34, FR53)
**And** the stop point is found at telegraph start by sweeping its body against static cover; if the lane ends on hard cover (car, bus, building, rubble, pumps, low walls, dumpster, sandbags, police barriers (6.6 D1), map edge) the lane shows a CRASH mark

**Given** a charge that ends on hard cover
**When** it crashes
**Then** it is stunned for 2 s and takes × 1.5 damage meanwhile (designer, D1); otherwise 1.0 s recovery; cooldown 7 s

**Given** a standing player more than 8 m away (4.5 m when the boss can't walk to that player: 6.6 D5) and the throw ready
**When** the Behemoth throws
**Then** it aims at the farthest such player's position at the telegraph start, lifts a chunk for 1 s (from the nearest rubble pile or burnt car within 6 m, else the road; visual only) while a 3 m ring shows at the landing spot, and the chunk flies 0.8 s: 35 damage within 3 m (0.25 m grace), a crater decal, no collision change; 0.6 s recovery, cooldown 6 s
**And** the throw ignores cover, like the slam (the drawn zone is the promise)

**Given** its attacks
**When** the gap ends
**Then** it picks slam if anyone is close, else charge if the target is in range with a clear lane, else throw, else it walks; cooldowns from `boss.json`


### Story 6.7: Enrage and the end of the Behemoth

(**Merged into Story 6.6** by the designer on 2026-11-24.)

As a team,
I want the Behemoth to get angrier when it's hurt, and its death to call the helicopter,
So that the last half of the fight is the hardest.

**Acceptance Criteria:**

**Given** the Behemoth at 50 % HP or less and not mid-attack
**When** it enrages
**Then** it roars for 1.5 s standing still (players within 5 m pushed 1.5 m, no damage), then moves 30 % faster, its cooldowns and gaps are 30 % shorter, and a Crawler drops off its back every 8 / 6 / 5 / 4 s (1–4 players) (FR35)
**And** telegraph lengths do not change (test)

**Given** the Behemoth dies
**When** `boss.killed` is emitted
**Then** every player gets 150, an "Evac inbound" banner shows, the alive cap returns to 150, and the remaining wave 10 zombies must still be cleared (the last-5 rule applies) before the helicopter lands (FR36)


### Story 6.8: Special events, car alarm and stampede

As a team,
I want surprises in the middle of the run,
So that no two runs play the same.

**Acceptance Criteria:**

**Given** a new run
**When** events are scheduled from the `events` seed stream
**Then** exactly 2 different events are placed in 2 different waves of 3–8, never wave 5, never in back-to-back waves (designer, D2), respecting each event's gate (gas leak: stage 2+; car alarm: a parked car still parked; power failure: waves 6–8) (FR37)
**And** each event starts at a random moment between 20 % and 60 % of its wave's spawns, with a banner, a sound and a map marker drawn above the darkness

**Given** the car alarm
**When** it triggers
**Then** a parked car blinks "armed" for 20 s; when a player's bullet reaches it (not turrets, melee, flames or blasts: 6.8 D2), or when the 20 s run out, its alarm sounds for 15 s and every zombie within 15 m heads to that car (FR38, designer D7)

**Given** the stampede
**When** it triggers
**Then** after a 3 s warning (rumble, dust at a map edge, arrows across the lane) 12 / 18 / 24 / 30 Runners (1–4 players, outside the wave count) cross in a straight 8 m lane at 5 m/s for 10 s without chasing, dealing 8 damage on contact; up to 30 may exceed the alive cap and normal spawns pause meanwhile (FR41)
**And** stampede Runners still on the map after the 10 s become normal Runners that count toward zombies remaining and the last-5 rule

**Given** a framework for events
**When** a new event is added
**Then** it is one module in `shared/events` with its data in `events.json`


### Story 6.9: Gas leak and supply drop

(**Merged with Story 6.10** by the designer on 2026-11-24: one story covering both event pairs.)

As a team,
I want a gas tank that explodes and a supply crate worth fighting for,
So that we have to choose between risk and reward.

**Acceptance Criteria:**

**Given** the gas leak
**When** it triggers
**Then** the gas station tank hisses for 10 s with a visible 6 m ring, then explodes: zombies within 6 m die, every player within 6 m takes the full 60, even when a teammate shot the tank early (same rule as the Bloater blast), buildings take 150 (FR39)
**And** the blast uses the normal blast line-of-sight (cars, the bus and buildings shield it)
**And** after the first 3 s any player's bullet can set the tank off at once (designer, D7); kills credit whoever set it off

**Given** the supply drop
**When** it triggers
**Then** a smoke flare marks a reachable spot at least 12 m from the team's centre (from the `events` stream), and 5 s later a crate lands there with a marker for all players showing the weapon inside (FR40, designer D7)
**And** the crate and its marker draw above the darkness
**And** the first standing player (downed and out players can't take it) to stand on it for 1 s gets that weapon at level II (Flamethrower, Gas torch, Grenade Launcher, Chainsaw or Assault Rifle) in an empty slot, otherwise in place of the active weapon (a warning shows before the 1 s completes); the crate stays until the wave ends


### Story 6.10: Power failure and survivor

(**Merged into Story 6.9** by the designer on 2026-11-24.)

As a team,
I want the lights to fail without warning and a survivor to need our help,
So that the run keeps asking for teamwork.

**Acceptance Criteria:**

**Given** the power failure (waves 6–8 only)
**When** it triggers
**Then** the streetlights flicker for 2 s, then the current wave becomes a blackout wave until it ends (FR42)

**Given** the survivor
**When** it triggers
**Then** an NPC with 50 HP appears at least 15 m from the team with a marker, and a safe-point marker appears at least 20 m from it; it follows the nearest standing player within 3 m at 4.0 m/s (downed and out players can't lead it), crouches when nobody is near, and zombies target it like a player; both markers and the NPC draw above the darkness (FR43)

**Given** the survivor reaches the safe point before the wave ends
**When** escorted
**Then** every player gets +100 currency; if it dies or the wave ends first, nobody gets the bonus


### Story 6.11: Evacuation vote

(**Merged with Story 6.12** by the designer on 2026-11-24: one story, "Evacuation vote and endless mode".)

As a team,
I want to vote to get out or stay after beating the Behemoth,
So that we choose together how much to risk.

**Acceptance Criteria:**

**Given** wave 10 cleared after the Behemoth's death
**When** the helicopter lands on the intersection (6 m pad, searchlight)
**Then** every player, downed and out players included, sees Extract and Stay buttons and a 15 s countdown, and every vote shows live in its slot colour; nothing else moves during the vote (FR66) *(as built by Story 8.12: downed and out players see the buttons disabled and their chip reads "not voting")*

**Given** the votes
**When** the countdown ends, or 1 s after everyone has voted (6.11 D3)
**Then** Stay wins only if more than half of the whole team voted Stay; silent players count as Extract, so a tie or no votes means Extract (6.11 D1) *(as built by Story 8.12: "the whole team" is the connected, standing players)*

**Given** Extract
**When** chosen
**Then** the helicopter lifts off, the first light of dawn rises over the district for 4 s (designer, 2026-11-22), then the run is won and the Results screen shows "Extracted" with wave reached, kills and money per player (FR67)

**Given** Stay
**When** chosen
**Then** a normal 30 s build phase for wave 11 starts


### Story 6.12: Endless mode

(**Merged into Story 6.11** by the designer on 2026-11-24.)

As a team,
I want to keep fighting in the collapsed city after wave 10,
So that we can push our luck for more rewards.

**Acceptance Criteria:**

**Given** Stay
**When** wave 11 and later run
**Then** each wave has 40 more zombies than the last at 4 players until 600 (wave 15), then stays at 600 and zombies get +6 % HP per wave after 15; still max 150 alive; × the player-count table (FR68, designer D3)
**And** each wave has 1 more Brute than the last (wave 11 = 3), at most 6 alive; blackout on odd waves (11, 13, 15…), even waves half dark (6.12 D3); odd waves use wave 9's mix, even waves wave 10's (6.12 D5); the map stays at stage 5 with fog

**Given** every 5th wave (15, 20, 25…)
**When** it runs
**Then** a Behemoth appears in it with +25 % HP per earlier endless Behemoth (× 1.25, × 1.5…), with the same telegraphs, and after that wave is cleared a new evacuation vote opens

**Given** an even endless wave without a Behemoth (12, 14, 16, 18, 22…)
**When** it is scheduled
**Then** one event that fits runs in it (designer, D3)

**Given** a team wipe in endless before extracting
**When** the run ends
**Then** the Results screen shows "Lost in the city" and the run records that rewards earned after wave 10 are lost (Supplies use this in Epic 7)

## Epic 7: Accounts and meta-progression

Players keep progress between runs: Supplies earned every run, unlocks that add cards to their own shop and tiles to their build bar, capped Training boosts, and an optional account so progress follows them to another device. New friends catch up fast (rookie lift, a bigger starter pool, borrowed cards). The database arrives here, with only the tables each story needs. All progression numbers live in `packages/shared` `progression.json` (balance JSON).

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
**Then** it creates only the `accounts` table (id, username nullable, password hash nullable, recovery code hash nullable, guest token hash, display name, created) and the `progress` table (account id, supplies, lifetime supplies, unlocks, training levels, districts)

**Given** a first visit
**When** the client has no guest token
**Then** the server issues a random 32-byte token, sets it as a first-party HttpOnly, Secure, SameSite=Lax cookie for 1 year (renewed on each visit), and the client also keeps a copy in `localStorage` (try/catch); either one is enough to find the account (designer D9: Safari clears script storage after 7 days without a visit)

**Given** a guest token on join (Story 2.3)
**When** no account matches its hash
**Then** a guest account and an empty progress row (starter pool only) are created; otherwise the existing account is loaded and its display name prefilled
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
**When** Supplies are computed for each player (server only, from the run result)
**Then** they get +10 per wave survived, +50 if the wave 10 Behemoth was killed (once per run), +100 if the team extracted, and +20 per endless wave and +50 per endless Behemoth only if the team extracted (FR78; `progression.json` `perEndlessWave`, `endlessBehemoth`)
**And** a wave counts only for players who were in it: in the run when it ends (playing, downed, out, or held during a short drop, Epic 8 D1); waves before a late joiner arrived, or after a player left or lost their seat, don't count; a player who quits banks the waves ended before they left (designer D2; Epic 8 note: no farming by joining at wave 9)
**And** the Behemoth and extract bonuses go to players in the run when the boss dies / the team extracts
**And** the waves each player was in are kept per seat in run state, so Epic 8 can carry them in its snapshot (note: in a run resumed on another night, Story 8.4/8.6 count each player's waves from every night once, at the run's end)
**And** after a wipe in endless, only waves 1–10 and the boss count

**Given** a player whose lifetime Supplies are below 300 before this run
**When** their Supplies are computed
**Then** the run's total is doubled (rookie lift, D3), and Results shows "Rookie bonus × 2"

**Given** the extract-or-stay vote (Story 6.11)
**When** it shows
**Then** it shows "Extract now: +100 · Stay: +20 a wave, lost if you wipe"

**Given** the Results screen
**When** it shows
**Then** each player sees a "Run rewards" panel: "+N Supplies" with the breakdown, their new total, and (added by later stories) a new milestone item, a loot item and the district unlock
**And** (added by Story 7.6) after the first run that banks ≥ 200 Supplies for a guest, it shows "Save my progress" once
**And** if the player used a supply-drop weapon they haven't unlocked, it shows "You used the <weapon>: unlock it for <price>"

**Given** the server
**When** Supplies are banked
**Then** they are written to `progress` (supplies and lifetime supplies) in one transaction per run; a failed write is logged at `error` and retried once

**Given** the Supplies rules
**When** Vitest runs
**Then** tests cover loss, extract, endless extract, endless wipe, a downed/out player at wave end, a quitter, the rookie lift crossing 300, and a solo run

### Story 7.3: Unlock screen

As a player,
I want to spend Supplies to unlock new weapons, buildings, gear and consumables,
So that my options grow over time.

**Acceptance Criteria:**

**Given** a new account
**When** its progress is created
**Then** its pool contains the starter items: Pistol, Machete, Fire Axe, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Revive kit, Wood barricade, Auto-turret, Medkit, Grenades (FR79, D4)

**Given** the start screen
**When** I tap "Progress"
**Then** a hub opens with my Supplies total at the top and an Unlocks tab; the Training (7.5) and Survivor (7.10) tabs are added by their stories

**Given** the Unlocks tab
**When** I open it
**Then** I see every item by category, unlocked ones marked, locked ones with their Supplies price and one plain line of what they do: Assault Rifle 200, Chainsaw 300, Gas torch 350, Flamethrower 400, Grenade Launcher 500; Spike trap 100, Bear trap 100, Mine 100, Floodlight 120, Barricade upgrades (reinforced + metal tiers, one unlock) 150, Med station 300; Tactical flashlight 100, Body armor II 250; Molotovs 150
**And** any locked item can be bought in any order (D5); one is marked "Good next pick": the cheapest locked item in the category where I own the fewest
**And** the header says "Unlocks add cards to your shop, not power"

**Given** I tap Unlock with enough Supplies
**When** the server validates it
**Then** the item joins my pool and the Supplies are spent in one transaction; otherwise "Not enough Supplies" and nothing changes; a double tap never charges twice

### Story 7.4: Shop deck from my unlocks

As a player,
I want my shop to offer only what I've unlocked, plus a chance to try a friend's,
So that unlocks change which choices I get and new friends can try the good stuff.

**Acceptance Criteria:**

**Given** a run
**When** my 6 cards are drawn (Story 5.13's `cardPool`, replaced here)
**Then** they come from my unlocked weapons and gear (FR47, FR79)
**And** the build bar shows only my unlocked buildings, and the shop's always-available section only my unlocked consumables
**And** the Epic 5 card rules stay: no Pistol card, `inShop:false` items never drawn, owned items never drawn, no upgrade cards, no locking

**Given** teammates in the room at build start who have unlocked weapons or gear I haven't
**When** my offer is drawn
**Then** one of my 6 slots is drawn from that "borrow list" and shows "Borrowed from <name>" (designer D7); I buy it with run money like any card; it counts toward the weapon/gear floor; my unlocks don't change
**And** the draw still uses only `shop:<slot>:<build>` with exactly 6 draws; a reroll redraws the borrowed slot the same way; a teammate joining or leaving mid-build changes nothing until the next draw (5.13 F1, F2)
**And** buildings and consumables are never borrowed

**Given** the supply drop event
**When** I grab the crate
**Then** its rare weapon is given even if I haven't unlocked it

**Given** a player whose pool can't fill the card floor
**When** cards are drawn
**Then** the floor is filled as far as possible and the rest are weapon cards; when fewer than 6 new items exist, fewer cards show, and Reroll is disabled when no new draw exists (alignment Q13)

**Given** the deck rules
**When** Vitest runs
**Then** tests cover: a new player's offer shows ≥ 2 different sets across rerolls (8-item starter pool), a borrowed card appears only when a teammate has something I lack, same seed + same room → same cards, a solo player never gets a borrowed card, a teammate's leave mid-build doesn't change my offer

### Story 7.5: Training boosts

As a player,
I want small, capped boosts I can train between runs,
So that I get a bit stronger without leaving new friends behind.

**Acceptance Criteria:**

**Given** the Training tab of the Progress hub
**When** I open it
**Then** I see 4 boosts with 5 levels each: max HP +2 % per level (max +10 %), damage +1 % per level (max +5 %), starting currency +10 per level (200 → 250, from `economy.json` `startingWallet`), reload speed +1 % per level (max +5 %) (FR80)

**Given** I buy the next level
**When** I have enough Supplies
**Then** it costs 50 × level (50, 100, 150, 200, 250; 750 per boost, 3,000 for all) and is saved to `progress`

**Given** a run starts (solo or online)
**When** my survivor is created
**Then** my own Training levels are applied in full, never scaled to the team (D6), and they are listed on the Results screen

### Story 7.6: Upgrade to an account

As a player,
I want to turn my guest profile into an account with a username and password,
So that I keep my progress on a new phone.

**Acceptance Criteria:**

**Given** a guest
**When** I choose "Save my progress" and enter a username (3–20 characters, unique) and a password (at least 8 characters)
**Then** my guest account becomes a full account, with the password hashed with Argon2id and all progress kept (FR77)
**And** I am shown a 12-character recovery code once (4-4-4, "Screenshot this: it's the only way back in if you forget your password"); only its hash is stored (D10)

**Given** "Forgot password"
**When** I enter my username, my recovery code and a new password
**Then** the password is replaced, the old code stops working and a new code is shown once

**Given** the start screen
**When** it shows
**Then** a guest sees "Save my progress" and "Log in" (the Progress hub header has the same two), and the login form has "Forgot password"; a logged-in player sees their username and "Log out" instead
**And** after the first run that banks ≥ 200 Supplies for a guest, Results shows "Save my progress" once (the line Story 7.2 leaves for this story)

**Given** another device
**When** I log in with my username and password
**Then** that device's guest token (cookie and `localStorage`) is linked to my account and my progress loads
**And** if that device's guest had its own progress, it is merged in: unlocks joined, Supplies and lifetime Supplies added, the higher level of each Training boost, and every later progress field merged by the rule its story gives (7.11: cosmetics joined, stats added; 7.10: the account's look kept unless it is the default); the guest account is then retired (D11)

**Given** login and recovery attempts
**When** one IP makes more than 5 per minute
**Then** further attempts are refused with "Too many attempts, try again in a minute" (NFR12)

**Given** wrong credentials or a wrong recovery code
**When** I submit
**Then** I see "Wrong username or password" (or "Wrong username or code") with no hint which one is wrong

### Story 7.7: District unlock rule

As a player,
I want to see that extracting from Downtown unlocks the next district,
So that I have a goal beyond one map.

**Acceptance Criteria:**

**Given** the host's district picker in the lobby
**When** it shows
**Then** Downtown is selectable, and district 2 is selectable when **any player in the lobby** has unlocked it (D12); otherwise it shows as locked with "Extract from Downtown to unlock"

**Given** a player's first extraction from Downtown
**When** progress is saved (Story 7.2's transaction)
**Then** district 2 is recorded as unlocked for that player, Results shows "Unlocked: district 2", and its card shows "Unlocked: coming soon" (FR81)

(Epic 11 adds a **Random city** card to this picker: open from the start, not an unlock; this rule is unchanged. `sprint-change-proposal-2026-11-24-random-city.md`.)

(Stories 7.1–7.7 revised 2026-11-24 from the Epic 7 idea session: `docs/ideas/epic-7/proposal.md`, designer decisions D1–D12.)

(Stories 7.8–7.12 added 2026-11-23 from the customization idea session: `docs/ideas/customization/proposal.md`, decisions D1–D7 and O1–O6 by the designer; cosmetic only, no bonuses; built with accounts.)

### Story 7.8: Survivor parts in game code

As a player,
I want my survivor to be built from parts I can swap,
So that customization is possible without new image files.

**Acceptance Criteria:**

**Given** the art pick
**When** the story starts
**Then** the designer picks part looks from a code-drawing page (starting point: `docs/ideas/customization/avatar-editor.html`) before any part is built, and every part passes the "no gameplay signal" check (no armor plates, red-cross bags, shoulder lights, zombie skin or Runner shirts); the picks are recorded in `docs/epic-7-decisions.md` › Survivor parts (7.8)

**Given** `drawSurvivor` in `apps/client/src/render/city/spriteArt.ts`
**When** it is split into part functions (top, headgear, hair, backpack, skin: five slots, no accent) (survivor-parts course correction 2026-11-24, `sprint-change-proposal-2026-11-24-survivor-parts.md`)
**Then** the default look draws today's survivor with only the cap redrawn (the designer's new default cap; pixel test against the current frames for everything else), and the held gun stays its own layer under the arms (Story 5.3 convention)

**Given** `packages/shared` `cosmetics.json`
**When** it is read
**Then** it lists 51 parts (31 starter, 10 milestone, 10 loot; `docs/epic-7-decisions.md` › Survivor parts (7.8)), each with id, slot, colour inputs (none / top / hair / accent; accent = the colour of hats and bags) and unlock rule (`starter`, `milestone:<id>`, `loot`), and no gameplay numbers

**Given** any chosen colour
**When** a part is drawn for the game
**Then** it is night-muted the same way as the `CHAR` colours (darker and slightly desaturated, more per decay stage), and the editor can show both versions

**Given** every part
**When** drawn at 35 px per metre (0.4 m body radius)
**Then** each non-"none" part changes at least 40 px² or the outline compared with "none" (automated pixel-count test)

**Given** a part that declares an animated layer (designer 2026-11-24: the propeller cap's propeller spins, the first one)
**When** the game draws it
**Then** the layer is its own small sprite on top of the survivor (texture through `addGeneratedTexture` with a redraw callback, pooled sprites, no per-frame allocation), turned every frame at the speed in `cosmetics.json`; the baked body leaves it out and still pictures draw it at a fixed angle; later animated parts follow the same rule

### Story 7.9: My look in the game

As a player,
I want my friends to see the survivor I made,
So that I can find myself and they can recognise me.

**Acceptance Criteria:**

**Given** this story's migration
**When** it runs
**Then** `progress` gets `look` (text, nullable = default look); Story 7.10 writes it

**Given** a join (Story 2.3)
**When** the client sends its join options
**Then** it includes the look code (≤ 96 characters, `v1|top:…|head:…|hair:…|pack:…|skin:N|c:rrggbb,rrggbb,rrggbb` — five slots, no `acc`; the colours are top, hair and accent = hats and bags) from the player's progress; the server checks each part exists and is owned by the account (until Story 7.11, owned = `STARTER_PARTS` from `packages/shared` `cosmetics.ts`), replaces any bad part with the default, and **never refuses a join because of a look** (survivor-parts course correction 2026-11-24, `sprint-change-proposal-2026-11-24-survivor-parts.md`)

**Given** the room state
**When** a player joins
**Then** their look is one string field set once; it costs nothing per tick

**Given** a player's look
**When** the Game scene creates their survivor
**Then** the body is drawn once into a per-player canvas texture (≤ 4 per run, ≤ ~2 ms total on the Xiaomi Mi 11i, the low-end floor), the gun image is drawn under it, and the downed view uses the same body
**And** the slot ring, name and edge arrows keep the slot colour (Story 2.9)
**And** a part with an animated layer (Story 7.8 rule; the propeller first) is baked without it, and the player's view shows the layer's pooled sprite on top (`PlayerView.setAnimatedLayer`), so later animated parts need no new code path

**Given** the lobby
**When** a player is in a slot
**Then** their slot card shows their survivor (close-up drawing); identical looks are allowed

**Given** `?stress=150`
**When** 4 custom survivors are on screen
**Then** phone FPS stays within 2 FPS of the latest recorded `?stress=150` baseline in `docs/perf/` and meets NFR1 (4.10 is deferred, so its numbers may not exist)

### Story 7.10: Survivor editor

As a player,
I want to make my survivor in under 30 seconds,
So that customizing is fun, not a chore.

**Acceptance Criteria:**

**Given** the start screen
**When** I tap "Survivor" (the Survivor tab of the Progress hub, Story 7.3) or my own card in the lobby
**Then** a Preact screen opens (the Survivor tab is added to the hub here) with tabs Top / Head / Hair / Pack / Skin (no Accent tab: the accent colour picker sits with the hats and bags that use it) (survivor-parts course correction 2026-11-24, `sprint-change-proposal-2026-11-24-survivor-parts.md`), a big rotating preview, and a **game-size preview** (35 px per metre on wet asphalt, slot ring, a few zombies and teammates around)

**Given** the tabs
**When** I pick a part or a colour
**Then** both previews update at once; colours use a free picker; the top colour shows the night-muted in-game swatch next to it

**Given** any colour, even one close to a slot ring colour or Runner red
**When** I pick it
**Then** it is accepted with no warning (designer decision O6)

**Given** a locked part
**When** it shows
**Then** a milestone item shows a lock and how to get it ("Extract from Downtown once"); a loot item shows only a silhouette and "Found during waves"; neither shows a price
**And** there is no shop view for items: they are never sold (D3); editor tiles are drawn from the part code (Story 7.8's part functions, zoomed on the slot)

**Given** I tap Random
**When** it runs
**Then** it picks only parts I own and random colours

**Given** I tap Done
**When** the server saves it
**Then** the look is written to my `progress` row (the `look` field from Story 7.9) and cached on the device (try/catch); it is used from my next join

**Given** the 30-second goal
**When** the designer's playtest runs
**Then** a first-time player makes and saves a look in under 30 s (timed, noted in `docs/playtests/`)

### Story 7.11: Milestone items

As a player,
I want to earn special items by doing something memorable,
So that my survivor shows what I've done.

**Acceptance Criteria:**

**Given** this story's migration
**When** it runs
**Then** `progress` gets `cosmetics` (owned item ids) and `stats` (lifetime counters: revives, kills, barricades built, runs played)
**And** Story 7.9's ownership check now also accepts parts in `cosmetics`; Story 7.6's merge joins `cosmetics` and adds `stats`

**Given** a run ends (Story 7.2's transaction)
**When** Supplies are banked
**Then** the same transaction updates the counters and grants every milestone reached (M1–M10; items per the designer's picks, `docs/epic-7-decisions.md` › Survivor parts (7.8): M1 firefighter helmet, M2 riot helmet, M3 gas mask, M4 hockey mask, M5 headband, M6 camo coat, M7 plank bundle, M8 laurel wreath, M9 welding mask, M10 golf bag); each is granted once (survivor-parts course correction 2026-11-24, `sprint-change-proposal-2026-11-24-survivor-parts.md`)

**Given** a new milestone item
**When** the Results screen shows
**Then** it shows "New item: Riot helmet (first extraction)" with a close-up drawing

**Given** the milestone rules
**When** Vitest runs
**Then** tests cover each milestone, no double grant, wipe and quit runs, and a failed write retried once (7.2 rule)

### Story 7.12: Surprise loot bag

As a player,
I want a rare bag to drop during a wave,
So that some runs end with a surprise.

**Acceptance Criteria:**

**Given** a run starts
**When** the `loot` seed stream is read (added to `STREAM_NAMES` by this story, alongside Story 4.4's streams; other streams don't change)
**Then** with chance `loot.runChance` = 0.2 (balance JSON) the run has one bag, at a chosen wave 3–10 and kill index in that wave; the rate doesn't depend on zombie or player count; solo runs too; endless adds none

**Given** that kill
**When** the zombie dies
**Then** a bag appears where it died, visible to all (glint, atlased, Dead City look) for 400 ticks (20 s), then disappears

**Given** a living player
**When** their centre comes within 0.6 m of the bag
**Then** the server gives the bag to them (first by tick order; ties to the lower slot); everyone sees a short "Bag found!" cue; downed or out players can't pick it up

**Given** the bag is picked up
**When** the item is chosen
**Then** it is a random loot item the player doesn't own (the 10 loot items: floral shirt, traffic cone, chef's hat, cooking pot, bunny beanie, viking helmet, propeller cap, teddy bear, cat in the backpack, potted plant; `docs/epic-7-decisions.md` › Survivor parts (7.8)); if they own all 10, they get "Collector" on Results and no item

**Given** the run ends (extract, wipe or quit)
**When** Results show
**Then** the finder sees "Found in wave N: <item>" and the item is banked in Story 7.2's transaction, even after a wipe or a quit

(Note for Epic 8: Story 8.4's snapshot carries the bag (position, ticks left) and a pending found item; its round-trip test covers them.)

**Given** the loot rules
**When** Vitest runs
**Then** a seeded sim over 1,000 run seeds gives 20 % ± 3 % runs with a bag, every bag at waves 3–10, the same seed gives the same bag, and the bag never spawns inside a solid

### Story 7.13: Epic 7 leftovers (B18/B19, Wear it)

(Added 2026-11-26: the designer's "ok" to retro E7-A6 (`sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6; answers in `docs/epic-7-decisions.md` › Designer answers 2026-11-26). No other story owns these: 7.12 B21 / B34 left "Wear it" as a follow-up. 7.3 F12 is kept as built and 7.4 B11 is dropped, so neither is in this story. The 7.10 AC 12 30-second check runs in 10.9's first game night. A small client-first story; the save path is 7.10's `POST /account/look`.)

As a player,
I want the account screens to tell me what happens to my progress, and to wear a new item straight from Results,
So that I never lose progress by surprise and a new item feels like a reward.

**Acceptance Criteria:**

**Given** 7.6 B18 ("That name is taken" on Save my progress, at 10 name checks per minute per address) and 7.6 B19 (the Log in form shows "This phone's guest progress will be added to that account." first when this phone's guest has progress)
**When** the story starts
**Then** the builder checks both against the code (as of 2026-11-26 both appear built: `packages/shared/src/net/account.ts` `name_taken`, `apps/server/src/net/limits.ts` / `rateLimit.ts`, `apps/client/src/ui/accountModel.ts` `mergeWarning`); any part not wired into `AccountScreen.tsx` or the server route is built
**And** each has a test: Save with a taken name shows the line and the 11th check in a minute from one address is refused; Log in with a guest that has progress shows the warning before the request, and a guest with no progress doesn't

**Given** a new item on the Results "Run rewards" lines (7.11 milestone item or 7.12 loot item; 7.11 D8)
**When** I tap **Wear it**
**Then** the item is put on in its slot through 7.10's save path (owned-part check on the server), my lobby card and next run show it, and the button changes to "Wearing"; offline or a refused save shows "Couldn't save · try in the editor" and nothing else changes
**And** the button is ≥ 44 × 44 px, fits the Results layout at 568 × 320 … 1920 × 1080 with and without insets (layout test), and practice solo / guests without a bank show no button

**Given** the gate
**When** it runs
**Then** nothing in gameplay, balance or net protocol changes (one new client call to an existing route at most), and the 7.10 / 7.11 / 7.12 tests stay green

---

## Epic 8: Real-life resilience

Real life doesn't break a run: rejoin within 2 minutes with your gear (your seat is kept for the whole run), join mid-run at a build phase, a light host role, autosave, Save and quit with 7-day resume by anyone from the run, and quick pings. Designer decisions D1–D15: `docs/ideas/epic-8/decisions.md` (accepted 2026-11-24). Depends on Epic 4 (named seed streams and decay engine) and on Story 7.1 (accounts and database: saved runs belong to the accounts that played them), so it comes after Epic 7 — **except the Network pass** (Stories 8.8–8.11 and 8.1), which is built right after Epic 6 and needs no accounts: 8.1 matches a returning phone by its guest token (Story 2.3) and gains account matching when Story 7.1 lands. Rule for every later epic: any new run state must be saved or excluded with a reason; the coverage test in Story 8.4 (`packages/shared/src/save/runSave.coverage.test.ts`) enforces it, and a changed save shape needs a `SAVE_SCHEMA_VERSION` bump with its migration (`save/migrations.test.ts`).

### Network pass (built first, right after Epic 6)

**As built (all Epic 8 stories done 2026-11-25; added by the readiness check 2026-11-26).** The story ACs below are the plan. The build changed or added these rules. Full list: `docs/epic-8-story-decisions.md` (E8-J/H/S/R/P, all accepted) and each story file's B-codes.
- **8.1:** close codes 4020 seat kept, 4021 taken over, 4022 removed, 4023 run saved (`packages/shared/src/net/reconnect.ts`). A returning player is teleported next to a teammate with 2 s protection at most once per wave; later returns land in place (8.1 B15 / OR-14). A dropped body stays 3 s, still and hittable, before the hold starts (B16 / OR-18). A held seat keeps the waves sized for it until the 120 s hold ends (OR-19).
- **8.2 + 8.3 (one story):** late money = max(own start, 100 + 60 % of the team average), where the average counts only seats in the fight (J1, J2). A removed player is banned from the room, and their buildings stay and pay nobody (H2, H3).
- **8.4–8.6 (one story):** the save is a separate versioned format (`SAVE_SCHEMA_VERSION`, `packages/shared/src/save/runSave.ts`, coverage test; S1). The evacuation vote is a calm phase too: it autosaves, Save and quit works there, and a resume opens into the vote (S12). Each account keeps its newest 3 saves (S11). After a server crash, open saves become resumable (S6).
- **8.7:** the ping wheel and chip block follow 8.7 B5 (2 × 2 chips, or one column while quick-use shows).
- **8.9:** the rewind window was raised to 600 ms / 12 ticks (T10).
- **8.10:** the 10 Hz far rule is off (B7); every zombie is refreshed at 20 Hz.
- **8.11:** wire format `NET_PROTOCOL_VERSION` 3, with a 14-byte binary input.
- **Still owed:** the RTT-based horde skip on a 64 kbit/s line (8.10 B6). 8.11 B2 left it out of 8.11's scope; since 2026-11-26 (correct-course) it is **Story 8.13**, a small story in the normal build order, landed before any real-device network test.


Designer decision 2026-11-24 (`sprint-change-proposal-2026-11-24-network-pass.md`), from the network audit `docs/perf/network-audit-2026-11.md` (measured: hits and picture break on a lossy 4G line; a dropped phone is out for the run). Build order: **8.8 ∥ 8.9** (different files) → **8.1** (below, extended) → **8.10** → **8.11** (optional). Numbered 8.8–8.11 so the existing 8.1–8.7 references stay valid. Then the designer's 4-phone 4G test (Story 2.10 plan) is the check, Wi-Fi phones with `&loss=1`.

### Story 8.8: My shots count on a bad 4G line

As a player on a phone with a poor signal,
I want my hits to count even when the connection hiccups,
So that I'm not cheated out of kills I clearly made.

**Acceptance Criteria:**

**Given** a dev/test "lossy line" switch
**When** the client is opened with `?lag=150&jitter=20&loss=1`, the bots run with `--lag 150 --jitter 20 --loss 1`, or the hits harness gets `loss: { pct: 1, stallMs: 200 }`
**Then** 1 % of messages (each direction) and every message behind them are held an extra 200 ms, in order (a TCP retransmit stall), like `tools/netaudit/lagProxy.ts`; release-safe like `?lag`; `tools/netaudit/hitsLossSim.ts` is merged back into `tools/netsim/hitsSim.ts` and the copy deleted

**Given** a player shoots at a zombie after a hiccup
**When** the server tests the shot
**Then** it rewinds zombies up to **500 ms** (`REWIND_MAX_TICKS` 6 → 10, `REWIND_CAP_MS` 300 → 500; zombies only, teammates are never rewound; boss hits stay unrewound)
**And** the hits harness at 150 ms ± 10 ms shows reversed hits **< 5 %** for kiting Runners at 1 % and 2 % loss (audit: 7.6 % and 11.9 % today, 2.0 % and 1.3 % with this change) and **≤ 0.5 %** on a clean line (no regression)
**And** the tick-cost and rewind tests still pass within budget, and `spread_cancel_suspect` / `seq_gap_suspect` telemetry is unchanged

### Story 8.9: Smooth through hiccups

As a player,
I want zombies and friends to keep moving smoothly when my connection stutters,
So that I never see things freeze and jump.

**Acceptance Criteria:**

**Given** the render delay (others and the horde are drawn this far behind)
**When** frames arrive late
**Then** it adapts between 100 and **250 ms** from how *late* frames arrive against the server clock (not from gaps alone, and not capped at 100 ms per sample), and a clean line still sits at 100–150 ms

**Given** a stall ends and several frames land at once
**When** the client catches up
**Then** it plays slightly faster (at most 1.1×) until back on its delay, instead of jumping; the server-clock estimate moves in small steps and **never backwards**
**And** a zombie missing from frames is removed after **150 ms** of missing time, not after 3 frames (a burst can't drop it early)

**Given** inputs piled up on the server after a stall
**When** the queue is above its target
**Then** the client runs its own steps slightly slower (at least 0.9×) for a moment so the queue empties without skipped inputs; the server's skip rule stays as the safety net (a 0.5 s skip delay was rejected in Story 2.4: +35 % starved ticks)
**And** on the lossy line (8.8): at most 1 visible freeze (render tick past the newest frame) per 30 s (audit: about one every 2 s), predicted shots that never fire on the server < 1 % (audit: 1.5–5.7 %), starved ticks no worse than today, and reversed hits still < 5 % with the longer delay (re-check the rewind window: 75 ms one-way + queue + 250 ms delay can pass 500 ms; raise it to 600 ms / 12 ticks if the harness says so)

### Story 8.10: Half-size horde stream

As a player on mobile data,
I want the zombie stream to use half the data,
So that big hordes, the stampede and the boss all fit on 4G.

**Acceptance Criteria:**

**Given** the horde frame sent to one phone each tick
**When** it is encoded
**Then** a zombie that was in this phone's previous frame is sent only if it moved or changed (slot + change mask + int8 cm move, full position if the move is over 1.27 m); one that left or died costs its slot; a new one costs a full record; heading is worked out on the phone from movement (kept when standing still)
**And** zombies farther than 8 m from the phone's player are refreshed every 2nd tick *(as built: turned off by decision 8.10 B7 / OR-16 — it stuttered on the clean line; every zombie is refreshed at 20 Hz, `HORDE_NEAR_M = Infinity`, horde ~8.2 KB/s on the audit replay)*
**And** a full frame goes out on join, after a skipped frame (backpressure) and once a second, so a decoding mistake can never last longer than 1 s

**Given** the audit's replay (`tools/netaudit/hordeEncodings.ts`, 150 alive, ~118 in view)
**When** it runs
**Then** the horde stream is **≤ 10 KB/s** (today 18.6) and the worst case of 180 in one view is **≤ 15 KB/s** (today 28.2, over the 24 KB/s budget)
**And** a fuzz test decodes every frame of a long replay to exactly the positions a full frame would give (within 1 cm), bots and the `?lag` throttle decode the new format, and the overlay's `horde N/s` still counts frames

**Given** the horde backpressure rule (skip at 64 KB unsent)
**When** a capped-bandwidth line is simulated
**Then** `framesSkipped` is logged against stall length and the result recorded in the story (change the rule only if stale frames really pile up)

### Story 8.11: One packet per tick (optional)

As a player on mobile data,
I want each server tick to arrive as one packet,
So that less of my data and battery goes on packet overhead.

**Acceptance Criteria:**

**Given** a server tick
**When** it ends
**Then** the state patch is sent from the tick itself (not its own 50 ms timer), so every patch carries exactly one tick, and the tick's horde frame, events and patch leave in one write
**And** the input message is a compact binary form (~14 B instead of ~116 B), decoded strictly like today's zod schema (exact length, seq integer ≥ 0, sticks in [−1, 1], flag bits only, `viewTick` in range; a malformed input is dropped and logged at `warn`, with a fuzz test), still under the 1 KB / 25 per second caps of Story 2.1
**And** `NET_PROTOCOL_VERSION` is bumped and checked on join, so a stale cached client is refused with "Please refresh"; bots and `tools/netsim` use the new form
**And** with 4 bots through the lossy-line proxy, down writes per phone are **≤ 25/s** (today 44–49) and input upload **≤ 0.6 KB/s** payload (today 2.1–2.5); nothing else changes (same tests green)

### Story 8.1: Reconnect within 2 minutes

As a player,
I want to get back into the run with my gear if my phone drops the connection,
So that a bad signal doesn't end my night.

**Acceptance Criteria:**

**Given** a player's connection drops (not a deliberate Leave)
**When** the server notices
**Then** their survivor vanishes safely from the World (not targeted, can't be hurt, not counted for a team wipe) and their seat is held for 120 s (Colyseus `allowReconnection`) (FR73, D1, D2)
**And** a player who was **downed** when they dropped counts as **out** for the rest of this wave (back at the next build phase, like any out player)
**And** teammates see a grey chip "<name> · reconnecting 1:43" in the team list, a toast when they're back, and no body on the map

**Given** the player's phone reconnects within 120 s
**When** it rejoins (matched by account / guest token)
**Then** everything is exactly as held: HP, wallet, earned, weapons, upgrades, gear, consumable count, ammo in the magazine (a reload in progress starts over), the current card offer and rerolls; a building they were carrying goes back to their hand (D3)
**And** mid-wave they appear next to a standing teammate; in a build phase where they were
**And** the client shows "Connection lost, reconnecting…" while it retries

**Given** 120 s pass
**When** the player hasn't returned
**Then** their slot is freed but their **seat is remembered for the whole run**: their stuff stays frozen and, if they come back at a later build phase with a slot free, they get it back (never the late-joiner money) (D4)

**Given** a player who dropped or left
**When** the run goes on
**Then** their buildings stay until destroyed and can be repaired by teammates; during the 120 s hold their turret kills keep paying into the held wallet, after that (or after a deliberate Leave) their buildings pay nobody

**Given** no player is connected (everyone dropped, or a solo player in a tunnel)
**When** the server notices
**Then** the whole World freezes (zombies, timers, everything) for up to 120 s; the first player back unfreezes it after a 3-2-1 count; after 120 s the room closes and the run follows Story 8.4's rules (lost mid-wave, saved in a build phase) (D5)

**Given** the tab is hidden (`visibilitychange`)
**When** the player switches apps
**Then** the client stops rendering and audio; the server keeps the player inside the reconnect window

**Given** the Network pass builds this story before Epic 7 (designer 2026-11-24)
**When** a returning phone is matched
**Then** it is matched by its guest token (Story 2.3); Story 7.1 adds account matching later

**Given** the phone has had no data from the server for **3 s** (even if the socket never reported a close)
**When** the watchdog notices
**Then** it shows "Connection lost, reconnecting…" and starts reconnecting itself; stale inputs queued while offline are dropped, not replayed

**Given** iOS Safari after the page was in the background for more than 10 s (WebKit bug 308073: a new WebSocket can hang in CONNECTING)
**When** a reconnect attempt hasn't opened within **5 s**
**Then** the page reloads straight back into the held seat

**Given** a short 4G dead spot
**When** the server's transport misses pongs
**Then** it waits about **12–15 s** before calling the socket dropped (Colyseus `pingInterval` 3 s × `pingMaxRetries` 4; today 2 retries ≈ 6–9 s), and the 120 s reconnect window covers anything longer
**And** a test cuts one bot's connection for 8 s mid-wave (lossy-line proxy) and the bot is back in its seat with its gear

### Story 8.2: Join mid-run at a build phase

As a friend arriving late,
I want to join a run that's already going,
So that I don't have to wait for the next one.

**Acceptance Criteria:**

**Given** a run in any build phase (endless included) with fewer than 4 players
**When** I open the link and I have no remembered seat in this run
**Then** I join with a Pistol and 100 + 60 % of the team's average `earned` so far, rounded down (about 640 at wave 5, about 1,400 at wave 9) (FR72, D7)
**And** my shop uses my own seed stream starting at the current build phase
**And** the build timer gains +15 s (at most once per build phase) (D6)

**Given** I have a remembered seat in this run (Story 8.1)
**When** I join at a build phase
**Then** I get my own seat back instead

**Given** a run in a wave
**When** I open the link
**Then** I see "Wave in progress, you'll join at the next build phase" and watch the fight

**Given** a mid-run join
**When** the next wave starts
**Then** its size uses the new player count multiplier (FR31)
**And** Supplies (Epic 7) count only the waves I was in

### Story 8.3: Host role and removing a player

As a team,
I want someone else to take over Start and Save if the host goes, and a way to remove a stranger,
So that the run goes on and a leaked link can't ruin it.

**Acceptance Criteria:**

**Given** the server runs the game, so "host" only means who may Start, Save and quit and Remove player
**When** the host drops or leaves
**Then** `hostSlot` moves **at once** to the longest-connected connected player, who sees "You are now the host" (FR74, D8); this already happens on leave today, this story adds drops and the toast
**And** it does not move back when the old host returns

**Given** the lobby or a build phase
**When** the host taps Remove on a player and confirms
**Then** that player is removed, sees "You were removed from this run", and can't rejoin this run (their seat is dropped) (D9)

### Story 8.4: Autosave at every build phase

As a team,
I want the run saved automatically at every build phase,
So that a server crash or update doesn't lose our run.

**Acceptance Criteria:**

**Given** the database from Story 7.1
**When** this story's migration runs
**Then** it creates only the `saved_runs` table (id, district, seed, snapshot JSON, schema version, created, expires, status) and a `saved_run_players` table (saved run id, account id)

**Given** a build phase
**When** it starts, and again on its last tick (the wave is about to begin) (D10)
**Then** a versioned JSON snapshot replaces the room's previous one: every seat by account (connected, held or remembered) with wallet, earned, loadout, upgrades, gear, consumable slot and count, current card offer (5.13); buildings with type, barricade tier, rotation, owner, HP, wear and `paid`; wave; decay stage, plan and variations; light and blackout state; event schedule; boss state; endless counters; loot bag and pending item (7.12); the waves each seat was in (7.2); the rewards-after-wave-10 flag (6.12); every PRNG stream state. Never zombies, shots, puddles or fires. About 50 KB

**Given** the room ends
**When** the cause is a server shutdown, a deploy or a programmer error that corrupts the simulation
**Then** the last snapshot becomes resumable like a Save and quit, and players see "Server restarting, your run is saved" (D11)
**And** when everyone leaves during a **build phase**, it counts as Save and quit
**And** when everyone leaves or times out **mid-wave**, the run is **lost** (Results "Lost in the city") and its snapshot is deleted: no retrying a wave by quitting before a wipe

**Given** snapshots
**When** Vitest runs
**Then** a test saves at a build phase, restores into a new World and checks the restored state equals the original

### Story 8.5: Save and quit

As a host,
I want to save the run during a build phase and quit,
So that we can finish it another night.

**Acceptance Criteria:**

**Given** a build phase
**When** the host taps Save and quit in the in-run menu (Story 2.11) and confirms
**Then** held ghosts are put away, pending placements resolve first, and the undo/take-back window closes (on resume, buildings count as placed in an earlier phase)
**And** the run is saved with `expires` = now + 7 days, every player sees "Run saved. Anyone from this run can resume it for 7 days.", and the room closes (FR75, D12)

**Given** a player who is not the host
**When** they open the in-run menu
**Then** they can Leave on their own at any time, but not Save and quit

**Given** a wave in progress
**When** the host looks for Save and quit
**Then** the button is disabled with "You can save during the build phase"

### Story 8.6: Resume a saved run

As a player,
I want to pick up a saved run with whoever is around,
So that we finish what we started.

> **Current rule (readiness check 2026-11-25; the code and the GDD follow it, the ACs below are kept as built history):** solo waves are × 0.35. A saved Random city run from an older generator version can't be resumed (Story 11.7).

**Acceptance Criteria:**

**Given** my account was in saved runs that haven't expired (at most 3 per account; a 4th drops the oldest)
**When** I open the start screen
**Then** a "Saved games" list shows each with district, wave, players and save date (D13)

**Given** I tap Resume
**When** the room is created
**Then** a new lobby with a new code opens, I am its host, any friends can join, and I start it (FR75)
**And** a run can be open in only one room at a time (a second Resume says "This run is already being played")

**Given** the resumed run starts
**When** the World is rebuilt
**Then** decay stages 1…N are re-applied to the map without side effects (no destruction, refunds or events), then buildings and seats are restored from the snapshot, and the run continues at the saved build phase with a fresh build timer
**And** returning accounts get their own seat back; newcomers join with Story 8.2's money; wave size uses the new player count (solo × 0.35, balance pass B2) (D14)
**And** missing players' seats wait in the save for a later night; their buildings stay and are repairable, but their turrets pay nobody

**Given** a snapshot from an older game version
**When** it is resumed
**Then** balance changes never block it; a snapshot whose schema version is older is migrated, and a test fails if the schema version is bumped without a migration

**Given** a run that ends (won, extracted, wiped)
**When** Results show
**Then** its save is deleted

### Story 8.7: Pings

As a player,
I want to send a quick message with a marker,
So that we can coordinate without voice chat.

**Acceptance Criteria:**

**Given** the ping button (top-right, clear of the build bar and hand cluster; hidden while I hold a building)
**When** I tap it
**Then** a small wheel offers Help! · Over here · Big one! · Ready (FR76, D15; "Big one!" covers the Brute and the Behemoth); on desktop the F key opens it; downed players can ping

**Given** I choose a ping
**When** it is sent (`ping.send`, max 1 per second per player)
**Then** every teammate sees its icon in my color pinned where I sent it for 4 s, with an edge arrow when off screen, and a short sound; a new ping replaces my previous one; pings draw above the blackout darkness

### Story 8.12: Only standing, connected players vote

(Quick story 2026-11-25, party-mode session, designer decision; story file `8-12-disconnected-players-dont-vote.md` is the full spec. Copied into epics.md by the correct-course of 2026-11-26 without scope change. It deliberately **reverses Story 8.1 review M2 / RR1-M1** (a held seat counted as a silent = Extract vote) and narrows 6.11's "whole team" count.)

As a player in a co-op run,
I want the evacuation vote to count only the players who are actually connected and standing,
So that a teammate who dropped can't tip the vote to Extract against the players who are still here.

**Acceptance Criteria:**

**Given** the vote resolves
**When** the votes are counted
**Then** only players who are connected (not in `world.heldPlayers`) and alive (`status === "alive"`) count; downed and out players don't; the count is taken at the resolving tick (status is frozen during the vote, so only holds and returns change who counts)
**And** `resolveEvacVote` uses `voteOutcome(t.stay, <counted players>)` and `countVotes` no longer adds held seats to `silent`; connected silent players still count as Extract (6.11 D1), a tie is Extract, and nobody counted means Extract
**And** the story's table holds, e.g. 4 seats, 1 held, 2 Stay + 1 Extract → Stay; 4 connected, 2 downed, 1 Stay + 1 Extract → Extract (tie)

**Given** every counted player has voted
**When** held, downed or out players have not
**Then** the vote still ends `allVotedHoldS` later (6.11 F4); a seat returning during the vote counts from that tick, starting silent

**Given** the vote panel
**When** it shows
**Then** downed and out players' chips read "not voting" with disabled buttons, held seats are hidden or dimmed "not voting" and left out of the result line, `allIn` and `voteUrgent`, and the result line matches the server's outcome
**And** `markHeldEvac` earnings are unchanged (8.1 M2's banking fix stays), and the replay digest test passes

**Given** the story lands (X1, designer "ok" 2026-11-26, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6)
**When** it merges
**Then** Story 6.11 in this file gets an as-built note ("since 8.12: only connected, standing players count; downed and out players see disabled buttons; held players see nothing") and FR66 is reworded to "a majority of the connected, standing players; a tie or no counted votes means Extract"
**And** the 8.1 M2 / RR1-M1 reversal is recorded in `docs/epic-8-story-decisions.md` › Designer review 2026-11-26 (E8-A9), next to 8.1 B15/B16/B19 (confirmed 2026-11-26)

### Story 8.13: Slow-line horde skip

(Added 2026-11-26, correct-course; named 8.12 by the designer and renumbered because 8.12 is the quick story "Disconnected players don't vote" `sprint-change-proposal-2026-11-26-epic-9-photoreal.md`: the owner of 8.10 B6 / retro E8-A4. A small story in the normal build order; land it before any real-device network test (real-phone testing is parked (designer 2026-11-25: all real-phone testing is parked, HANDOFF §5.2)). Source: the 8.10 backpressure table, `8-10-half-size-horde-stream.md` (64 kbit/s: 0 skips, frames wait up to 4,720 ms in the line, because the 64 KB socket rule cannot see a queue that sits in the network).)

As a player on a very slow mobile line,
I want to see where the horde is now, not where it was seconds ago,
So that a bad signal costs me detail, not my life.

**Acceptance Criteria:**

**Given** a per-phone latency signal on the server (the round trip of something the phone already answers, or a new tiny ack if none fits; a new message bumps `NET_PROTOCOL_VERSION` with the usual "please reload" path)
**When** the estimated age of the horde frames queued for that phone passes a threshold (a named constant, recorded with its measured reason)
**Then** the server skips the stale horde frames for that phone and sends a keyframe (full frame) once the line catches up, the same keyframe path as 8.10's join / skip / once-a-second rule
**And** only horde frames are skipped: state patches and events are never dropped

**Given** the 8.10 capped-line measurement (`tools/netaudit/lagLine.ts --kbps`, 4 bot phones, wave 4, stalls of 0.2, 0.4 and 1 s at 64 and 128 kbit/s; the 8.10 T8 table method)
**When** it runs with this change
**Then** at 64 kbit/s the longest wait of a horde frame in the capped queue is **≤ 1,000 ms** in every row (today 4,720 / 4,680 / 1,883 ms), with **0 decode errors**, and after each keyframe the phone's zombie positions match a full frame within 1 cm
**And** at 128 kbit/s and on a clean line `framesSkipped` stays **0** and the horde stream stays within **+5 %** of the 8.10 numbers (8.2 KB/s on the audit replay, ≤ 13.5 KB/s with the stampede's 180 in one view)
**And** the before / after table is recorded in the story file and in `docs/perf/network-pass-2026-11.md` § 8.10, and `deferred-work.md`'s 8.10 B6 line is closed

**Given** the existing net tests (hits harness, `smooth.test.ts`, `hordeEncoder.test.ts`, the 8.10 fuzz decode)
**When** the gate runs
**Then** they pass unchanged; the lossy-line numbers of 8.8 / 8.9 (reversed hits < 5 %, ≤ 1 visible freeze per 30 s) do not get worse

**Given** 8.10 B7 (the 10 Hz far rule is off, so every zombie is refreshed at 20 Hz; retro E8-A9, designer "ok" 2026-11-26: re-checked here instead of on phones, which are parked)
**When** the 64 and 128 kbit/s rows above are measured
**Then** the story file records whether B7 holds: if both rows meet their targets with the far rule off, B7 is confirmed in `docs/network-pass-decisions.md`; if not, this story's skip is the first lever, and turning the far rule back on (`HORDE_NEAR_M`) is tried only after it, with the numbers of both in the table

## Epic 9: Dead City art and audio

The game looks and sounds like Dead City. Can start after Epic 4 and runs alongside later epics. **No hiring (designer, 2026-11-23: "we won't hire anybody").** **Direction: photoreal (designer, 2026-11-26, correct-course `sprint-change-proposal-2026-11-26-epic-9-photoreal.md`; readiness Q1).** Stories 9.1–9.10 are re-based on the pipeline that 9.11–9.14 built (`docs/art/photoreal-decisions.md`):

- **Pick first.** Each art group gets a before/after proposal page (`docs/art/photoreal-<n>/compare.html` style). The designer picks; only the approved look is built. Meshy and vector images are references only; the two-pick rule (first = base look, second = upgrade/skin look) and every picked look id are kept.
- **Two ways into the game, chosen per group by the story:** (a) **worker relight**: today's code drawing, relit at load in a Web Worker (9.11 / 9.13: `render/city/relight.ts`, `*BakeWorker.ts`, main-thread sliced fallback, kept cache, graphics-restore re-bake), for anything animated or per-player; (b) **pre-rendered atlas**: rendered offline from the approved code into a lossless WebP atlas with a frame JSON and a drift hash (9.14: `npm run art:street-props`, `render/city/streetProps.webp`, `streetProps.json`), for static art. In both, the code drawing is the fallback and frame names stay `category_name_variant`.
- **Budgets for every Epic 9 art story** (the 9.13 / 9.14 measuring method): atlases ≤ 2048 × 2048; each pre-rendered atlas ≤ 2 MB and the first-load download < 15 MB in total (music streamed); main-thread long task from a bake ≤ 6 ms at 1× CPU (report 1× and 4×); a group's full bake done within 15 s at 4× CPU; with `?stress=150` at 844 × 390 DPR 2, average FPS within **2 FPS** of master and frame-time p95 within **+1 ms** of master, at 1× and 4× CPU; animated extras capped and pooled (`controls.fx` caps, `?fx=low` halves them), no per-frame allocation.
- **Gameplay unchanged:** no change to simulation, balance numbers (except new `controls.fx` caps), net messages, collision or the world digest.
- **Order and dependencies:** 9.1 first (the spec). 9.5, 9.6 and 9.8 read settings that **Story 10.1** adds, so 10.1 is built before them.

### Story 9.1: Art and audio asset spec

*(Re-based 2026-11-26, correct-course: the look ids stay; the photoreal pipeline and budgets are added.)*

As the designer,
I want a complete list of every image and sound the game has, with its pipeline, names, picked look and budget,
So that each photoreal group and each sound story knows exactly what exists, how it gets into the game and what it may cost.

**Acceptance Criteria:**

**Given** the code-drawn atlases, the 9.11 / 9.13 relit atlases, the 9.14 pre-rendered atlas, maps and sound code
**When** the spec is written to `docs/art/asset-spec.md` and `docs/audio/asset-spec.md`
**Then** it lists every generator (`render/city/*`), atlas and frame (`category_name_variant`), frame sizes, poses and frame counts, decay layer groups, and every picked look id (Spitter P4, Brute BR1–BR5, Bloater BL1–BL5, floodlight FL1/FL5, med station MS10, gear GR6, consumables CI4, hand grenade HG1, molotov MB1, cards C3, build-bar icons I1/T1/M1, fire-lab D, explosions EX1/EX2, flame streams FS1/FS2, photoreal take 4 grey outline, the approved street-props and police sets), the Dead City palette and mood references
**And** each art group has a pipeline line: **code only**, **worker relight** (bake worker, `controls.fx` caps) or **pre-rendered atlas** (build command, output file, frame JSON, drift hash), its photoreal state from `docs/art/photoreal-decisions.md` (approved and in game / not started) and the story that owns it (9.2–9.7, 9.11–9.14)
**And** the 12.3 helicopter crew sprite and the helicopter are listed as a photoreal group of their own (X9, designer "ok" 2026-11-26): code-drawn placeholders until then, picked with 9.4 (characters) or 9.2 (city)
**And** every sound is listed with its trigger, length, loop flag, bus (music, SFX, ambience) and source (procedural, or the licensed/free library and its licence)

**Given** the platform budgets
**When** the spec is reviewed
**Then** it states the Epic 9 budgets as numbers (atlases ≤ 2048 × 2048; each pre-rendered atlas ≤ 2 MB; first load < 15 MB; bake long task ≤ 6 ms at 1×; full bake ≤ 15 s at 4×; `?stress=150` within 2 FPS and +1 ms p95 of master; SFX in audio sprites; music streamed)
**And** it records today's measured spend against them (at least the 9.13 caps and bake times and the 9.14 atlas: 2032 × 536, 531 KB), so later stories know the headroom

### Story 9.2: Downtown in five decay states

*(Re-based 2026-11-26, correct-course: buildings, ground and decay props only. Cars in 3 conditions, the bus, barriers, police lines, sandbags, dumpster, gas pump and rubble boxes are done in 9.14.)*

As a player,
I want Downtown's buildings and streets to look real and fall apart stage by stage,
So that the decay tells the story of the run.

**Acceptance Criteria:**

**Given** a proposal page for the buildings, the ground and the remaining decay props (before/after per decay stage, Evening, Panic, Breakdown, Ruins, Collapse)
**When** the designer picks
**Then** the pick is recorded in `docs/art/photoreal-decisions.md`, and only the approved look is built
**And** the proposal page also shows each look at 12.3's 0.6× zoom-out (about 40 × 22.5 m) and it looks right there (X9, designer "ok" 2026-11-26)

**Given** the approved look
**When** the city is drawn
**Then** buildings (facades and roofs, lit shop fronts, damage per stage), ground (asphalt, sidewalks, road markings, puddles, cracks, the Ruins and Collapse ground) and the decay props not in 9.14 (fires and scorch, debris and loose rubble on the ground layer, vegetation at stages 4–5) use it in all 5 visual states (one night: dusk at stage 1, darker each stage, dawn only on Extract) (FR82)
**And** static art ships as a pre-rendered atlas (9.14 way: build command, frame JSON, drift hash, code fallback) and animated or lit parts as worker-relit frames; the story records which part took which way
**And** collision, cover and spawn layers are unchanged, and all map, decay and digest tests still pass

**Given** the Epic 9 budgets
**When** measured the 9.14 way
**Then** the new atlas(es) add ≤ 2 MB to the first load each (first load < 15 MB total), the slow-4G page-load-to-title time is no worse than +1 s against master, and `?stress=150` in a stage-3 rain wave and a stage-5 blackout stays within 2 FPS and +1 ms p95 of master at 1× and 4× CPU

### Story 9.3: Survivor animations

*(Re-based 2026-11-26, correct-course: weapon-family, reload and downed poses on the 9.13 relit bodies.)*

As a player,
I want my survivor to hold, fire and reload the weapon I carry and to look downed when I'm down,
So that I can read my teammates' roles and state at a glance.

**Acceptance Criteria:**

**Given** a proposal page of the poses on the 9.13 take-4 relit bodies (grey see-through outline kept)
**When** the designer picks
**Then** the pick is recorded in `docs/art/photoreal-decisions.md`, and only the approved poses are built

**Given** a survivor
**When** it is drawn
**Then** the body still comes from the player's look (Stories 7.8 / 7.9, per-player texture, relit in the worker as in 9.13); the slot colour shows only on the ring, name and edge arrows
**And** holding poses exist for each of the 6 weapon families (pistol, two-handed gun, melee, chainsaw, flamethrower / gas torch, launcher), each with walk, fire or swing, and reload, plus a downed pose that replaces today's tint (the ring stays) (FR82)

**Given** a player swaps or buys a weapon, reloads, or goes down
**When** the state changes
**Then** the pose changes on the next rendered frame, the reload pose lasts exactly the weapon's reload time, and revive returns to the holding pose

**Given** 4 survivors with 4 looks
**When** their poses are baked
**Then** a body's pose set bakes in the worker within 7.9's / 9.13's one-body-per-frame landing budget (main-thread long task ≤ 6 ms at 1×), `survivorParts.raster.test.ts` stays green, and `?stress=150` with 4 survivors stays within 2 FPS and +1 ms p95 of master at 1× and 4× CPU

### Story 9.4: Zombie and Behemoth animations

*(Re-based 2026-11-26, correct-course: attack and death animations, plus a photoreal Behemoth. Walk loops for Walker, Runner and Crawler, breathing, glow, Bloater veins and Spitter drips are done in 9.13.)*

As a player,
I want every zombie to attack and die visibly, and the Behemoth to match the rest,
So that I can read the fight in the crowd and the dark.

**Acceptance Criteria:**

**Given** proposal pages for the attack and death animations and for a photoreal Behemoth (relit like 9.13, keeping its silhouette and every telegraph)
**When** the designer picks
**Then** the picks are recorded in `docs/art/photoreal-decisions.md`, and only the approved looks are built

**Given** Walker, Runner, Crawler, Spitter, Bloater and Brute
**When** they attack or die
**Then** each has an attack animation and a death animation (≤ 0.8 s, then today's splat), keeping the picked looks and variants (Spitter P4; Brute BR1–BR5 and Bloater BL1–BL5 as random per-zombie variants) and the telegraph poses (Spitter rear-back with glowing mouth, Bloater swell, the Brute's 0.5 s wind-up with the arms under the clothes) (FR82, FR84)
**And** death animations are client-only, pooled and capped (a `controls.fx` cap, `?fx=low` halves it); beyond the cap a zombie vanishes with today's splat
**And** silhouettes follow the readability rules: Brute wide, Bloater round, Crawler long and low, Runner thin and leaning, Spitter glowing mouth (NFR11)

**Given** the Behemoth
**When** it is drawn
**Then** it uses the approved photoreal look (worker relight, code drawing as fallback) for its walk, slam, charge, throw, stun / roar and enrage poses, and its telegraphs (ring, hatching, P1 warning display) read the same as today on the readability sheet

**Given** 150 animated zombies in view, with deaths at the cap
**When** the `?stress=150` test runs the 9.13 way
**Then** average FPS is within 2 FPS and p95 within +1 ms of master at 1× and 4× CPU, and the world digest is unchanged

### Story 9.5: Gore and dismemberment

*(Re-based 2026-11-26, correct-course: photoreal style through the designer's proposal-page pick. **Depends on Story 10.1** (the gore setting).)*

As a player,
I want heavy hits to tear zombies apart,
So that the fight feels as brutal as Dead City should.

**Acceptance Criteria:**

**Given** a proposal page of photoreal gore (pieces and blood, matched to the 9.13 bodies)
**When** the designer picks
**Then** the pick is recorded in `docs/art/photoreal-decisions.md`, and only the approved look is built

**Given** a `zombie.killed` event with its weapon and damage type
**When** the killing hit was heavy (Fire Axe, Chainsaw, Shotgun) or an explosion
**Then** the client spawns dismemberment pieces in the approved look (arms, heads, torso halves; worker-relit or pre-rendered, frames per zombie type) for heavy hits, or bursts the zombie apart for explosive kills (FR83)
**And** gore is client-only and never affects the simulation or the digest

**Given** blood
**When** zombies are hit or die
**Then** blood decals stay on the ground until the wave ends, pooled and capped at 300 (today 200, `FxView.ts`; raise it only if the stress test holds, otherwise keep 200 and record why), so memory stays flat
**And** with the cap full and 150 zombies in view, `?stress=150` stays within 2 FPS and +1 ms p95 of master at 1× and 4× CPU

**Given** Story 10.1's gore setting set to "Blood only"
**When** zombies die
**Then** no dismemberment pieces spawn; blood still shows; the change applies without a reload

### Story 9.6: Effects

*(Re-based 2026-11-26, correct-course: photoreal style through the designer's proposal-page pick. **Depends on Story 10.1** (the quality settings).)*

As a player,
I want muzzle flashes, fire, acid, gas, explosions, rain and fog that look real,
So that the screen reads clearly even in chaos.

**Acceptance Criteria:**

**Given** a proposal page of photoreal effects (before/after, built from the picked looks: fire-lab D (4.12), EX1 (launcher) and EX2 (mine, hand grenade), the FS1 / FS2 flame streams)
**When** the designer picks
**Then** the pick is recorded in `docs/art/photoreal-decisions.md`, and only the approved looks are built

**Given** the approved look
**When** effects play
**Then** muzzle flashes, blood, fire, acid, gas, explosions, rain, fog, film grain, flashlight and floodlight light textures use it (pre-rendered frames or worker relight, code fallback)
**And** rain follows decay (drizzle from stage 1, heavy rain at stage 3) and fog comes at stage 5

**Given** effects
**When** they play
**Then** they come from Phaser object pools with no per-frame allocation, and rain, fog visuals, film grain and light glow read Story 10.1's quality settings and change without a reload; blackout darkness and the 10 m fog vision limit ignore them (FR87)
**And** at default settings `?stress=150` in a stage-3 rain wave with a flamethrower and a launcher firing stays within 2 FPS and +1 ms p95 of master at 1× and 4× CPU

### Story 9.7: UI art

*(Re-based 2026-11-26, correct-course: photoreal style through the designer's proposal-page pick. The Lumen LF5 UI style of Epic 7 is the starting point.)*

As a player,
I want menus, icons and the HUD to look like they belong to the photoreal Dead City,
So that the game feels finished.

**Acceptance Criteria:**

**Given** a proposal page per UI group (HUD and Build button, action bar and I1 build icons (5.16 / 5.21 / 5.26 / 5.27 / 10.10), C3 shop cards, GR6 gear and CI4 consumable icons, lobby, survivor editor (7.10), evacuation vote, ping icons, unlock and training screens), each showing today's Lumen LF5 look next to the photoreal proposal
**When** the designer picks
**Then** the pick is recorded in `docs/art/photoreal-decisions.md` (or `docs/art/epic-7/lumen/` for a Lumen change), and only the approved looks are built, keeping the picked looks' ids

**Given** the approved UI art
**When** applied
**Then** icons and card art ship as a pre-rendered atlas (9.14 way) or worker-relit frames, ≤ 2 MB per atlas, and the HTML overlays keep their Preact layouts
**And** the size rules from Story 1.8 still hold: text at least 14 px at devicePixelRatio 1 and every button at least 44 × 44 px, and `hudLayout.test.ts` passes at 568 × 320 … 1920 × 1080 with and without insets

**Given** the Results screen, which collects lines from many stories (3.10, 4.4 seed, 6.11, 6.12, 7.2 rewards and rookie bonus, 7.5 Training, 7.6 "Save my progress", 7.7 unlock, 7.11 milestone, 7.12 loot, 10.6 Report a problem, 11.7 city code)
**When** it is laid out
**Then** it has one fixed order (outcome and wave → Run rewards → new items and unlocks → per-player kills and money → seed / city code → Report a problem), fits 568 × 320 without overlap (scrolls if needed), and has a layout test like the HUD's

### Story 9.8: Ambience and audio buses

*(State on 2026-11-26, readiness check: per-stage procedural ambience with a 3 s crossfade already exists in `apps/client/src/audio/ambience.ts`, built by 4.6/4.7/6.2/6.4. Stage 3 reuses the Panic loop, and there is no Breakdown loop of its own. There are no buses: the ambience gain goes straight to the output, and the boss loop runs on the SFX master. The volume sliders need Story 10.1's settings screen.)*

*(Scope shrunk 2026-11-26, correct-course, readiness Q2: the per-stage loops are kept; this story adds the three buses, a Breakdown loop of its own, the rain beds and wires 10.1's volumes. **Depends on Story 10.1** (it stores the 3 volumes).)*

As a player,
I want the city's sound to change as it decays and each kind of sound on its own volume,
So that I can hear the run getting worse and set the mix I like.

**Acceptance Criteria:**

**Given** three audio buses (music, SFX, ambience) under one master
**When** the game plays
**Then** every sound goes through exactly one bus: the ambience player's gain feeds the ambience bus, the boss loop moves from the SFX master to the music bus, and every other cue feeds the SFX bus (a unit test checks the routing)
**And** each bus applies Story 10.1's saved volume (0–100 %) at start and within 100 ms of a slider change, with no reload

**Given** stage 3 (Breakdown)
**When** it becomes active
**Then** its own `breakdown` loop (heavy rain, crackling fire; procedural, appended to `AMBIENCE_LOOPS`) crossfades in over 3 s instead of the Panic loop (FR85)
**And** the other stages keep their loops (Evening, Panic, Ruins, Collapse / Collapse ash) and light drizzle is audible from stage 1, heavy rain from stage 3 (none for the ash style)

**Given** the audio spec (9.1)
**When** this story lands
**Then** every loop is listed with its bus and source (procedural, or a licensed/free library with its credit)
**And** the per-frame ambience step still allocates nothing (existing tests green)

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
**Then** the calmer build track plays (all music procedural or from licensed/free libraries, no hired composer)

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

**Given** about 30 weapon sounds (procedural or from licensed/free libraries)
**When** weapons fire or reload
**Then** each of the 11 weapons has a distinct fire and reload sound (the Gas torch distinct from the Flamethrower), grenades and molotovs have throw sounds, and reloads are clearly audible over the music (FR86)

**Given** about 20 zombie sounds
**When** special zombies act
**Then** each has a signature cue that also warns: Spitter gurgle (windup), Bloater swelling, Brute roar and its 0.5 s wind-up, Runner shriek, plus the Behemoth's telegraphs and the special-event cues (FR84)
**And** zombie sounds use positional volume and stereo pan relative to the listening player

**Given** many zombies at once
**When** sounds would overlap
**Then** a voice limit per sound type prevents clipping and keeps CPU use flat

### Photoreal pass (stories 9.11–9.14, added 2026-11-25)

The designer ran a photoreal art pass outside the story flow (the asset session, 2026-11-24/25): every look was picked by the designer on proposal pages, then the approved sets go into the game in game code. *(As built: 9.11 and 9.13 relight the code drawings at load in a Web Worker. 9.14 ships the street props and vehicles as one pre-rendered image atlas, `apps/client/src/render/city/streetProps.webp`, rendered offline from the approved code by `npm run art:street-props` (9.14 B1). The Behemoth, FX, icons, UI, buildings and ground are not reworked yet (`docs/art/photoreal-decisions.md`).)* Decisions: `docs/art/photoreal-decisions.md`; art direction: `docs/art/visual-direction.md`; the asset review page (https://claude.ai/artifact/Eznwmb2BbdSoogcXKKN4Ro, `docs/art/asset-review.md`) shows only accepted looks. These stories overlap 9.3 (survivor animations), 9.4 (zombie animations), 9.6 (effects) and 9.2 (Downtown look): since the 2026-11-26 correct-course, 9.1–9.7 are re-based on this pipeline and start from what is built and approved here.

### Story 9.11: Photoreal things you build (done)

As a player,
I want the things I build to look real and alive,
So that my base feels premium and readable.

**Acceptance Criteria:**

**Given** the traps, floodlights and med station
**When** they are placed
**Then** they use the approved relit look (volumes, materials, gloss) and animate: lamps flicker, the med cross beats, the mine's light blinks, glints run over steel

**Given** a wood, reinforced or metal barricade
**When** it is placed
**Then** it is drawn standing (raised-camera look, its own cast shadow), with one picture per rotation (rot 0 outside, rot 2 inside, rot 1 / 3 side views, braces inside), a variant fixed by its spot, sorted above the bodies; where two lines meet a corner piece closes the gap (visual only)

**Given** the game starts
**When** the relit pictures are prepared
**Then** a Web Worker bakes them (main-thread sliced fallback) so no frame stalls; the plain drawings show meanwhile; a graphics restore keeps or re-bakes them

### Story 9.12: Bodies behind walls (done)

As a player,
I want to see zombies and teammates standing behind a standing wall,
So that a barricade never hides a threat or a friend.

**Acceptance Criteria:**

**Given** a body just behind a standing wall or corner
**When** the wall covers it
**Then** the covered part shows through as a soft pulsing silhouette, zombies red (red = danger in play), survivors in their slot colour, cropped to the wall's solid part (never over open street), capped and pooled, off in a blackout, at no measurable FPS cost

### Story 9.13: Photoreal characters in the game (done)

As a player,
I want the approved photoreal survivors and zombies in the game, animated,
So that the characters match the premium look of the rest.

**Acceptance Criteria:**

**Given** the approved take 4 with today's grey see-through outline (`docs/art/photoreal-2/take4-grey.html`)
**When** the game draws survivors, Walkers, Runners, Crawlers, Spitters, Brutes and Bloaters
**Then** they use that relit look (prepared like 9.11, no stalls), with its animations: breathing and sway, the glow pulse, Bloater veins with travelling pulses and glossy acid sacs, Spitter drips, chainsaw shake, and the new Walker / Runner / Crawler walk loops, capped and pooled for 150 zombies at the phone FPS target; survivor looks (Story 7.8) keep working

(Readiness check 2026-11-25, after the build: memory was measured in `docs/perf/epic-9-characters.md` › Memory (83–111 MB JS heap on `?stress=150`, headless); the real iPhone 12 check for NFR2 stays with Story 10.3. The Behemoth's look stays with 9.4, per-weapon holding poses with 9.3, dismemberment pieces with 9.5; lobby / results / editor portraits stay plain.)

### Story 9.14: Photoreal street props and vehicles in the game (done)

As a player,
I want the approved photoreal cars, bus and street props in the city,
So that the whole street matches.

**Acceptance Criteria:**

**Given** the approved street props and vehicles (`docs/art/photoreal-1/compare.html`)
**When** the city is drawn
**Then** cars, burnt cars, the bus, dumpster, gas pump, rubble and sandbags use that look, and the police sawhorse barriers stand (approved police set in `barricadeArt.ts`, traffic-drum corners), sorted with the bodies like the barricades

(As built, story file `9-14-photoreal-street-props-in-game.md`: the props ship as an atlas pre-rendered offline from the approved code (B1); cars, the bus, dumpster, pump, rubble, sandbags and the concrete barrier stay flat in the baked ground; only the sawhorse police lines stand, with 9.12 silhouettes for bodies behind them (B3, B4). Frame names and sizes are unchanged (B2), so Story 11.6 can place them by kind.)

## Epic 10: Performance and polish

Every technical target is met on the reference phones; quality settings, home-screen install, problem reports, run stats, a balance pass and friend-group playtests deliver v1 for weekly game nights.

**Order (designer, 2026-11-26, correct-course):** **10.1 first**: 9.5, 9.6, 9.8 and 10.2 depend on its settings. Then 10.2–10.7 → 10.8 → 10.9. 10.2 absorbs 1.11 AC 3; 10.9's game nights absorb 1.12 and 4.10 (Epics 1 and 4 are closed). **All real-phone testing is parked (designer 2026-11-25: all real-phone testing is parked, HANDOFF §5.2)**: the phone ACs of 10.2, 10.3, 10.5 and 10.9 are kept but marked parked, no story waits on them, and the simulated or headless measures (`?stress=150`, CDP CPU and network throttling, Playwright browsers and device emulation) are the buildable part. Epic 12 (extraction cinematic) lands before 10.2, 10.8 and 10.9 (see Epic 12).

### Story 10.1: Settings screen

*(State on 2026-11-26: `apps/client/src/settings/settings.ts` already stores `screenShake`, `haptics` and `alwaysFullSpeed` in localStorage under `topdown-shooter.settings`. The in-run ☰ menu has a Settings view with the Always full speed toggle (`spec-always-full-speed-setting.md`). Quality, volumes, gore, aim assist, Show performance and account sync are not built; `progress` has no `settings` column. The only quality switch is the URL flag `?fx=low`. 9.5 (gore toggle), 9.6 (quality settings) and 9.8 (volume sliders) read settings this story adds.)*

*(Correct-course 2026-11-26: **built first in Epic 10**; 9.5, 9.6, 9.8 and 10.2 depend on it. Extends `settings/settings.ts` and the existing ☰ Settings view rather than replacing them. Retro E7-A8 adds the deletion AC below.)*

As a player,
I want to adjust quality, sound and controls,
So that the game runs and feels right on my phone.

**Acceptance Criteria:**

**Given** the Settings screen (start screen and the in-run menu from Story 2.11)
**When** I open it
**Then** I can turn down or off rain, fog visuals, screen shake, film grain and light glow; switch gore to "Blood only"; toggle aim assist (on by default); turn haptics off (the switch Stories 5.20 and 5.23 follow); set the 3 volumes; and turn on "Show performance" (FR87)
**And** this story is built before Stories 9.5, 9.6 and 9.8, which read these settings
**And** blackout darkness and the 10 m fog vision limit have no setting

**Given** I change a setting
**When** it is saved
**Then** it applies immediately, is stored in localStorage (wrapped in try/catch, with defaults if storage fails), and is synced to my account when I'm logged in
**And** account sync uses its own `settings` field in `progress`, added by this story's own migration (Story 7.1 doesn't create it)
**And** the Story 7.6 guest merge rule for `settings`: the account's settings are kept; the guest's are used only if the account has none
**And** after logging in on a device, the account's settings replace that device's local ones

**Given** the Settings screen, as a guest or logged in (retro E7-A8)
**When** I choose "Delete my progress" and confirm it on a second screen that names what goes (Supplies, unlocks, training, look, saved runs, the account if I have one)
**Then** the server deletes my `progress` row, my saved runs (or my seat in them), my `run_rewards` and `device_tokens` rows, and the account row with its username and password hash, in one transaction, and logs `account_deleted` with no personal data
**And** the device's guest token, cookie and stored settings are cleared, the next open starts a fresh guest with 0 Supplies, and a test proves that a deleted account's username can be registered again and its old token is refused
**And** the endpoint needs the current session (and the password for an account), is rate-limited, and works while the player is in no run

### Story 10.2: Frame-rate pass on reference phones

As a player,
I want the game smooth on my mid-range phone even in the worst wave,
So that nothing stutters when it matters.

**Acceptance Criteria:**

*(Correct-course 2026-11-26: the real-phone ACs below are **parked (designer 2026-11-25: all real-phone testing is parked, HANDOFF §5.2)**. The buildable part is the headless one: Chromium at 844 × 390 DPR 2 with CDP CPU throttling 1× and 4× (the Mi 11i stand-in used by 7.9 / 9.13), measured the 9.13 way.)*

**Given** headless Chromium at 844 × 390 DPR 2 with 1× and 4× CPU throttling
**When** `?stress=150` runs a wave 9 blackout with all 150 alive zombies in view at default settings (8 s warm-up, 12 s count, two rounds)
**Then** the average and 1 % low FPS and frame-time p95 are recorded in `docs/perf/epic-10-fps.md` with every optimization made, and at 4× the average is ≥ 30 FPS, or the bottleneck is named and the default quality settings for that class are lowered until it is

**Given** *(parked)* an iPhone 12, a Pixel 5 and a Galaxy A52 (or equivalents), and the low-end floor, the Xiaomi Mi 11i
**When** a full wave 9 blackout is played with all 150 alive zombies in one player's view at default settings
**Then** FPS averages 60 and never stays below 30 (NFR1)
**And** the measurements and every optimization made are recorded in `docs/perf/epic-10-fps.md`

**Given** a phone that misses the target
**When** quality settings are lowered
**Then** the target is met, and the default settings for that device class are adjusted if needed (this uses Story 10.1's quality settings: **depends on 10.1**)

**Given** *(parked)* god mode and 150 Walkers spawned inside the camera view (Story 1.11 AC 3, folded in here 2026-11-26)
**When** the scene runs for 60 s on the iPhone 12 class and Pixel 5 class phones
**Then** the average and minimum FPS fill the empty reference-phone rows of `docs/perf/epic-1-stress.md` (target 60 FPS, never below 30, NFR1), with the measured bottleneck (rendering vs simulation) for any miss

### Story 10.3: Memory and battery pass

As a player,
I want the game not to crash my browser or drain my phone,
So that we can play a whole evening.

**Acceptance Criteria:**

*(Correct-course 2026-11-26: the real-phone ACs below are **parked (designer 2026-11-25: all real-phone testing is parked, HANDOFF §5.2)**. The buildable part: a headless Chromium solo or bot run of all 10 waves.)*

**Given** headless Chromium running a full 10-wave solo run (bots or a scripted player) at 844 × 390
**When** the JS heap (CDP `Performance.getMetrics`) and GPU texture memory are sampled at each build phase
**Then** neither grows from wave to wave by more than 5 % after wave 2, the peak is recorded, and 4× CPU-throttled main-thread busy time per minute is recorded as the battery proxy, in `docs/perf/epic-10-memory-battery.md`

**Given** *(parked)* an iPhone 12 in Safari
**When** a full 10-wave run is played
**Then** the tab stays under 300 MB throughout, with no growth from wave to wave (NFR2)

**Given** *(parked)* the reference phones at 100% charge
**When** a 20-minute run is played at default settings
**Then** battery use is under 15% (NFR7)
**And** results are recorded in `docs/perf/epic-10-memory-battery.md`

### Story 10.4: Fast loading

As a player,
I want the game to open in seconds from a link,
So that a game night starts right away.

**Acceptance Criteria:**

**Given** a phone on 4G with an empty cache
**When** it opens the link
**Then** the game is playable in under 10 s and downloads under 15 MB, with a progress bar during loading (NFR6)

**Given** a return visit
**When** the phone opens the link again
**Then** the game is playable in under 3 s (hashed assets cached long-term)

**Given** music
**When** the game loads
**Then** it streams after the game starts

### Story 10.5: Home-screen install and every supported browser

*(State on 2026-11-26: safe areas are largely built: `viewport-fit=cover`, `display.ts › safeArea()`, HUD insets and `env(safe-area-inset-*)` in the overlays. `hudLayout.test.ts` checks them with a test inset whose top is 0 in most cases. There is no web app manifest, icon, apple-mobile-web-app meta or service worker yet, and `docs/qa/browsers.md` does not exist.)*

As a player,
I want to add the game to my home screen and have it fit my phone's screen,
So that it feels like an app.

**Acceptance Criteria:**

**Given** the web app manifest (fullscreen, landscape, icons)
**When** I choose "Add to Home Screen" on iOS or "Install" on Android
**Then** the game opens fullscreen in landscape from the icon

**Given** *(parked: parked (designer 2026-11-25: all real-phone testing is parked, HANDOFF §5.2))* a real phone with a notch or rounded corners
**When** the game runs
**Then** HUD and controls stay inside the safe areas (until then: the buildable check below)

**Given** the safe areas already built (Q4, designer "ok" 2026-11-26: this AC is narrowed to emulation and top-inset cases)
**When** the layout checks run
**Then** `hudLayout.test.ts` gains cases with a non-zero top inset (≥ 47 px) at 568 × 320 and 844 × 390, and one Playwright run with iPhone and Pixel device emulation (with insets) shows HUD and controls inside the safe areas
**And** the manifest, icons, Add to Home Screen and the browser matrix are the story's main work

**Given** current desktop Chrome, Firefox, Safari (WebKit) and Edge, run through Playwright now, and *(parked)* real Safari on iOS 16+ and Chrome on Android 10+
**When** a smoke test (lobby, one wave, shop, build) runs on each
**Then** it passes, and the results are recorded in `docs/qa/browsers.md` (NFR8)

### Story 10.6: Report a problem

As a player,
I want to send a bug report from inside the game,
So that the designer can fix what went wrong.

**Acceptance Criteria:**

**Given** the client
**When** it runs
**Then** it keeps the last 200 log lines in a ring buffer

**Given** I tap "Report a problem" (Settings or Results screen) and write an optional note
**When** I send it
**Then** the server stores the note, the log lines, the room id, run seed, wave, device and browser info in a `problem_reports` table (this story's own migration: id, account id nullable, created, note, payload JSON), and logs `problem_reported`
**And** the endpoint takes at most 64 KB per report and a note of at most 500 characters, and accepts at most 3 reports per minute per IP and 20 per day per account (refused with "Too many reports, try again later")
**And** reports are kept 30 days, then deleted by the nightly job; `npm run reports` lists the latest ones for the designer
**And** the Report screen says what is sent ("your note, the last 200 log lines, your device and browser")
**And** when an account is deleted (Story 10.1), its reports' account id is set to null in the same transaction

### Story 10.7: Run stats

As the designer,
I want simple stats about our runs,
So that I can check the success metrics.

**Acceptance Criteria:**

**Given** a migration creating only the `run_results` table (id, district, seed, player count, wave reached, extracted, started, ended, nights played) and a `run_result_players` table (run id, account id, slot, loadout, waves in)
**When** a run ends
**Then** a row is written per run and one per player who was in it (FR88)
**And** a run resumed over several nights writes one row when it ends (`started` = first night, `nights played` counted); a saved run that expires unresumed writes its row at expiry, marked `abandoned`; solo runs are recorded (player count 1); practice runs that earn nothing (7.2) are not
**And** when an account is deleted (Story 10.1), its `run_result_players` rows keep the run numbers but their account id is set to null in the same transaction
**And** kills during the `extract` phase (12.2's fly-out horde) are not counted in the run's stats (X8, designer "ok" 2026-11-26)

**Given** a stats script (`npm run stats`)
**When** I run it
**Then** it prints: runs per week, wave reached in each group's first 3 runs (a group = the set of accounts in a run), runs to first extraction per account, and the share of runs per loadout (flagging any loadout used in more than half of runs)

### Story 10.8: Balance pass

*(State on 2026-11-26: the balance files are in `packages/shared/src/config/balance/`. The balance version is a hash of the JSON (`config/balance.ts`), so every change bumps it. Story 9.13 changed it by adding 4 `controls.fx` caps (no gameplay number). `docs/balance/changelog.md` was created 2026-11-26 (Q5, designer "ok" 2026-11-26), back-filled with Epic 5 B1–B12 and 9.13 B28; every balance change adds a line. Already settled: wave bonus 15 × N (Epic 5 balance pass, `docs/epic-5-decisions.md`), `loot.runChance` 0.2 (`loot.json`), building cap `maxPerPlayer` 6 (`buildings.json`), solo × 0.35.)*

As the designer,
I want the economy and difficulty tuned from real runs,
So that the run feels like the GDD's curve.

**Acceptance Criteria:**

**Given** run stats, bot runs and playtest notes
**When** the balance is reviewed
**Then** it re-checks the wave bonus 15 × N, `loot.runChance` 0.2 and the cap of 6 buildings per player against real runs and bot runs (Q5, designer "ok" 2026-11-26), and changes any of them only with a reason line in `docs/balance/changelog.md`
**And** the re-check uses runs with 12.4's no-refund rule and 12.1's no-fort rule (12.4 lands before this story; 12.1's before/after bot-sim numbers are an input, X2, X4)
**And** earnings per player over a full run are 2,500–3,000 at 2, 3 and 4 players, and the difficulty curve matches the GDD table (relaxed W1–2 … climax W10)

**Given** balance changes
**When** they are made
**Then** they change only `packages/shared/src/config/balance/*.json` (NFR14), bump the balance version, and are listed with reasons in `docs/balance/changelog.md`

### Story 10.9: Friend-group playtests and v1

As the designer,
I want my friends to play v1 over real game nights,
So that we know it's ready for every week.

**Acceptance Criteria:**

*(Correct-course 2026-11-26: the per-phone measurements and phone-specific checks below (4.10's per-phone rows, 1.12 "on their own phones") are **parked (designer 2026-11-25: all real-phone testing is parked, HANDOFF §5.2)**; the game nights themselves run on whatever devices the group uses and are not held back.)*

**Given** the release build
**When** the friend group plays at least 3 game nights
**Then** at least one full 4-player run reaches wave 10 with no disconnect caused by the game and no disagreement between screens (NFR9, NFR3)
**And** feedback is written to `docs/playtests/v1.md`, with blocking issues fixed before release
**And** at least one first-time player is watched through their first build phase without help, and what they couldn't find (carry, drag-to-pin, long-press move, undo, the action bar, the Build panel) is noted; anything blocking becomes a hint story (readiness check 2026-11-25, U6)
**And** the first game night also runs the folded checks (correct-course 2026-11-26): **4.10**: *(per-phone rows parked)* FPS, bandwidth and reversed hits for each phone in `docs/perf/milestone-1.md` against NFR1, NFR3–NFR5, and feedback on fun, difficulty, economy, building and decay, from `docs/playtests/milestone-1.md` refreshed first to the 10-wave game (current earnings, the Behemoth, events, the evacuation vote, the Build button); **1.12**: at least 3 people's feedback on move stick, aim stick, auto-fire, aim assist, swap and melee in `docs/playtests/epic-1-controls.md`, with the melee-under-twin-stick decision (keep, tune or change) recorded and each issue fixed by tuning or turned into a story; **7.10 AC 12** (retro E7-A6, designer "ok" 2026-11-26): a first-time player is timed from opening the survivor editor to Done (target < 30 s), written in `docs/playtests/epic-7-customization.md`

**Given** every NFR
**When** the v1 checklist in `docs/qa/v1-checklist.md` is filled in
**Then** each one is marked met with its evidence (a doc or test), and the release is tagged `v1.0`

### Story 10.10: Build button (hybrid build-phase UI)

(Added 2026-11-25, designer decision "hybrid"; story file `10-10-build-button.md`; options `docs/art/build-ui/index.html`. Key auto-accepted: Epic 5 is closed, this is client-only UX polish. **Layout picked: BU-1 = B (designer 2026-11-25). Done: PR #20 merged 2026-11-25; build decisions 10.10-B1…B15 in the story file.**)

As a player in a build phase,
I want my last building one tap away and the rest behind a Build button,
So that repeat placements stay instant and the screen edge stays clear.

**Acceptance Criteria:**

**Given** a build phase with empty hands and nothing selected
**When** the HUD shows
**Then** the bottom-right shows a **Build** button and the **last-placed building** as a one-tap quick tile (today's 4 × 2 grid is gone), and Shop stays reachable (BU-2)
**And** tapping the quick tile starts the 5.15 hold with that type in one tap, with today's money/cap refusals and toasts (5.16/5.17 unchanged)
**And** the quick tile shows the type I last placed this run (a confirmed placement; moves, sells and take-backs don't change it). Before my first placement, and after a page reload, a reconnect, a resume or a late join, it shows the first unlocked type in balance order (BU-5). A type no longer in my unlock list falls back the same way

**Given** I tap Build
**When** the panel opens with every unlocked shop type and Shop
**Then** picking a type closes it and starts the hold; the panel never covers the survivor's 48 px zone or the ghost, and closes on Close, a tap outside, the ping wheel, the menu, the phase end, being downed

**Given** the layout tests
**When** they run at 568 × 320 … 1920 × 1080 with and without insets
**Then** every closed/open control is in the one HUD layout test, the 568/640 build-tile baseline breaches are gone, keys 1–7 still pick types directly, the cluster hides under the open ping wheel and while waiting (8.2), and nothing in gameplay, the server or balance changes

## Epic 11: Random city (post-v1)

The host can pick **Random city**: a new 70 × 70 m city generated from rules on every run, next to the hand-made Downtown. The generator lives in shared code and turns a city seed into a normal `DistrictMap` (solids, cover, spawns, hazards, events, decay groups with `pick N`), so `applyDecayStage`, the server, prediction and replays stay unchanged and nothing is downloaded. Every city passes checks A–G and the anchor check, or it is rejected and regenerated. Open from the start; Story 7.7's District 2 rule is unchanged.

Source: forge session `_bmad-output/forge/random-map-generator/` (`forged-idea.md`, HARDENED) and `sprint-change-proposal-2026-11-24-random-city.md` (designer 2026-11-24: Q1 generic rules for stages 4–5 and the Epic 6 anchors, Q2 post-v1, Q3 the city code brings back the layout only). **Built after Epic 10.** Depends on: Epic 6 (rubble, events layer, boss entries, evac pad), Story 7.7 (lobby picker), Story 8.4 (saved runs), Story 10.7 (run stats). Build order: 11.1 → 11.2 → (11.3 ∥ 11.4) → 11.5 → (11.6 ∥ 11.7). First version: generated streets, plain buildings, cars, barriers, generic decay and one landmark recipe (the gas station); more recipes later.

*(Readiness check 2026-11-26, dependencies the ACs don't name yet: (a) saved runs must store `citySeed` + `generatorVersion`. This is a save format change: bump `SAVE_SCHEMA_VERSION` (1 today, `packages/shared/src/save/runSave.ts`) with a migration step. Restore refuses a save whose `mapVersion` differs (`save/restore.ts`). (b) The new join fields need a `NET_PROTOCOL_VERSION` bump (4 since Story 8.13). (c) The join check is Downtown-only today: the client sends `DOWNTOWN_MAP.version` and the server maps only `downtown` (`RunRoom.ts` `DISTRICT_MAPS`). 11.7's generator-version + digest check replaces it. (d) Since 6.2, `legalDecayMasks` includes look bits, so 11.2's check A should use `gameplayDecayMasks`. (e) 11.6 predates the 9.14 pre-rendered street-props atlas: see the readiness report's needs-designer question.)*

### Story 11.1: A new city from a seed

As a player,
I want a city I have never seen before when we pick Random city,
So that every run asks us to read new streets.

**Acceptance Criteria:**

**Given** `packages/shared/src/map/gen/` and a `(citySeed, generatorVersion)` pair
**When** the generator runs
**Then** it returns a 70 × 70 m `DistrictMap`: a street plan from rules (avenue, T junction, parallel streets, dead end…), blocks of rule-made sizes, building footprints (collision boxes with `building`), curb cars and barriers as cover, spawn points and decay groups (FR90)
**And** it uses no randomness except its own `city` PRNG, and no `Math.random()` / `Date.now()` (architecture rules)
**And** it uses only integer or fixed-point maths, or the shared code's own lookup tables: no `Math.sin/cos/tan/atan2/exp/log/pow/hypot/sqrt` or other functions whose results JavaScript engines may round differently (an ESLint rule bans them in `map/gen/`), so V8 (server, Android) and JavaScriptCore (iOS Safari) build the same city (readiness check Q1)

**Given** the same `(citySeed, generatorVersion)`
**When** the server, a client and a test each generate the city
**Then** the three maps are byte-identical (same map digest)
**And** a committed fixture of digests for 50 seeds is checked in CI, and Story 10.5's browser smoke test generates the same 50 on iOS Safari and compares

**Given** any generated city
**When** check **G** runs
**Then** every street is at least 3 m wide (FR91)

**Given** the generator on the Xiaomi Mi 11i and on the server
**When** a city is built, retries included
**Then** it takes ≤ 150 ms on the phone and ≤ 20 ms on the server; at most 20 tries per seed, then the next value of the `city` stream is used

### Story 11.2: Every city is fair (checks A–G and anchors)

As a player,
I want every random city to be fair and playable,
So that a bad layout never ruins a run.

**Acceptance Criteria:**

**Given** `checkCity(map)`
**When** it runs on a generated city
**Then** each check is its own tested function (FR91):
- **A** no area is ever sealed off, at every stage × every legal variant mask (`legalDecayMasks`, the 4.5/6.2 pattern);
- **B** every spawn point reaches the players;
- **C** an open start area near the middle, buildable in wave 1 and never touched by any decay mutation;
- **D** no 15 × 15 m square without cover;
- **E** at least 2 choke points;
- **F** no spawn path traps zombies;
- **G** from Story 11.1;
- the players' start spots (run start, return after being out, late join) lie inside area C.

**Given** the Epic 6 content on the map
**When** the **anchor check** runs
**Then** the city has 4 main-street ends at least 4 m clear at every stage (Behemoth entries), an `evac_pad` point inside area C, and crate, survivor and safe spots plus stampede lanes on open road and reachable (Story 6.8's tests run on generated maps too)
**And** the `evac_pad` sits in the main walkable region, and Story 12.1's `seals_path` check runs on the generated map (X11, designer "ok" 2026-11-26)
**And** the boss entries are map data (`events` layer), no longer names in `boss.json › entryPoints`; Downtown gets its 4 street ends as map objects, with the same behaviour and tests

**Given** a city that fails any check
**When** the generator gets the result
**Then** that city is rejected and the next try is generated

**Given** a 1,000-seed test
**When** it runs
**Then** 100 % of the final maps pass every check, and the reject rate per check is reported

### Story 11.3: The city falls apart by rules

As a player,
I want a random city to decay like Downtown does,
So that wave 9 in a random city doesn't play like wave 1.

**Acceptance Criteria:**

**Given** the generic decay rules
**When** a city is generated
**Then** they emit decay groups with `pick N` that `applyDecayStage` already applies, with no new decay code path (ADR-05, FR92):
- stage 2: curb cars move into the road, police lines, manholes and windows open as spawns;
- stage 3: cars burn (4.8's fire rules);
- stage 4: rubble closes 1 of 3 candidate side streets or dead ends wall to wall, and 2 building walls open as breaches (6.2's "buried" and ≥ 6 m rules);
- stage 5: Story 6.4's power-out, fog and the run's weather style.

**Given** any generated city
**When** variant bits are counted
**Then** they stay ≤ `MAX_DECAY_VARIANTS` (32)

**Given** Downtown
**When** its tests and recorded seeds run
**Then** they are unchanged and green (its map files are not touched)

### Story 11.4: Landmark recipes: the gas station

As a player,
I want landmarks in a random city,
So that it has places to remember and fight around, not only streets.

**Acceptance Criteria:**

**Given** a recipe (a rule set that builds a landmark at any valid lot size and position, with its own stage events)
**When** the generator places it
**Then** it passes the same checks A–G and the anchor check

**Given** the **gas station** recipe
**When** a city is generated
**Then** the city has exactly one gas station: a kiosk building, 2–4 pumps, a canopy, and a `gas_leak` hazard from stage 2 (FR90, FR92)
**And** Story 6.9's gas leak event runs on it without changes

### Story 11.5: Spawns and balance for 70 × 70

As a player,
I want fights in a random city to feel as dense as in Downtown,
So that the bigger map doesn't make waves feel empty.

**Acceptance Criteria:**

**Given** a Random city run at stage 1
**When** zombies spawn
**Then** they come only from the city edges (FR93)

**Given** stage 2 or later
**When** a wave picks spawn points
**Then** generated points 15–35 m from the group are also used, never within 6 m of a living player (FR32, FR93)

**Given** `districts.json` (per-district balance overrides: spawn bands, pathing budget)
**When** Downtown runs
**Then** its values are unchanged; `waves.json › maxAlive` 150 and `boss.json › aliveCap` 110 stay global (NFR1)

**Given** the flow fields on a 70 × 70 m city (19,600 cells)
**When** they refresh
**Then** a refresh takes no more ticks than on Downtown, and the tick cost is measured (`PERF_ASSERT=1`, machine load recorded)

**Given** a sim of 8 seeds × 10 waves
**When** waves 1–2 are measured
**Then** the time to first contact and the zombies within 15 m of the team are within ± 20 % of Downtown's; if not, stage-1 edge spawns use the third of the edge nearest the team
**And** a full 10-wave bot run reaches the Behemoth and the evacuation vote

### Story 11.6: Art drawn by type

As a player,
I want a random city to look like Dead City,
So that it feels like the same game as Downtown.

**Acceptance Criteria:**

**Given** a generated city
**When** the client draws it
**Then** buildings, cars, barriers, the gas station and decay props are drawn **by kind and at any size**, with no lookups by object name (today `DOWNTOWN_DRESSING`, `d.canopy`, `bus_glass`); heights, shop lights and car colours come from the city's own seeded dressing
**And** street props, cars, barriers and the gas station reuse the 9.14 pre-rendered atlas frames, picked by kind without stretching (today `drawFrame` stretches); size variants a generated city needs are added with `npm run art:street-props`; only generated buildings and ground are code drawings, and once 9.2 lands its building and ground atlas is used the same way (Q8, designer "ok" 2026-11-26; the building and ground part follows 9.2's pick)

**Given** the ground bake on a 70 × 70 m city
**When** it is built
**Then** it stays within NFR2 and the 2048² atlas rule (chunked if needed), and every texture goes through `addGeneratedTexture`

**Given** Downtown
**When** screenshots of stages 1–5 are compared with before the story
**Then** they are pixel-identical (baseline taken from master right before this story starts, after Story 9.14's props)

**Given** the designer
**When** the look is proposed before the build
**Then** they see screenshots (9.14 atlas frames plus code drawings) of 3 seeds × 5 stages and pick

### Story 11.7: Pick Random city, share its code

As a host,
I want to pick Random city and share a city we liked,
So that we can play the same streets again or send them to friends.

**Acceptance Criteria:**

**Given** Story 7.7's district picker in the lobby
**When** it shows
**Then** it has a **Random city** card, always selectable and never locked, and **Downtown stays the default pick** (FR69, FR90)

**Given** a Random city run
**When** it starts
**Then** the server takes `citySeed` from the run seed's `city` stream (or from the code the host typed) and sends `{citySeed, generatorVersion}`; every client generates the city locally
**And** a client's join carries its generator version and map digest; a mismatch is refused with "Please refresh" (like the balance version)

**Given** Results of a Random city run
**When** shown
**Then** it shows the city code (e.g. "City K7QX": seed + generator version, 4–5 characters, no ambiguous letters) (FR94)
**And** `citySeed` is drawn from the code's seed space, and the code encodes the seed of the city that was actually used (after any 11.1 retries), so typing it back gives the same layout

**Given** the host types a city code in the lobby
**When** the run starts
**Then** the same layout is generated, and decay picks, events and shop cards come from the new run's seed (Q3)
**And** a code from an older generator shows "This city is from an older version"

**Given** a saved run (Story 8.4) and run stats (Story 10.7)
**When** a Random city run is saved or recorded
**Then** the snapshot stores `citySeed` + `generatorVersion` (the 8.4 round-trip test covers them) and the stats record `random:<code>` (FR88)

**Given** a saved Random city run whose `generatorVersion` is older than the server's (designer 2026-11-25)
**When** the Saved games list shows it
**Then** it reads "This city is from an older version", Resume is disabled and only Delete is offered; a test covers it

**Given** a Random city extraction (designer 2026-11-25)
**When** Story 7.2's transaction banks it
**Then** it grants the "first extraction" milestone item (M2: `milestones.json` rule widened from `district: "downtown"` to any district) but does not unlock District 2, which stays "from Downtown" (FR81, FR94)

## Epic 12: Extraction cinematic

(Added to epics.md by the correct-course of 2026-11-26 from the story files written in the party-mode session of 2026-11-25 (designer decisions; PR #25, `9bf596bf`). The story files are the full spec; the ACs below are copied without scope change. The clashes with the rest of the plan (X1–X11, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6) were resolved by the designer "ok" 2026-11-26: their lines are added to 8.12, 12.1–12.4, 9.1, 9.2, 10.7 and 11.1 below and to the story files.)

A won run ends like a film: buildings can never seal a pocket of the map (no forts), decay losses are not refunded, and when Extract wins the survivors walk to the helicopter, board and fly out over the horde into the sunrise. Build order: **8.12** (vote counting) → **12.1** → **12.2** → **12.3**; **12.4** with or right after 12.1 (12.1 AC 6 already assumes no refund). Epic 12 runs after or alongside 10.1 and lands **before 10.2** (the frame-rate pass measures the fly-out), **10.8** (12.4 moves the money) and **10.9** (the playtests play the final ending); Epic 9 has no hard tie (12.3 uses placeholders); Epic 11 needs 12.1's check on generated maps (X11). Changes FR58 (no refund, 12.4) and FR66 / FR67 (who votes, 8.12; the extraction walk and fly-out replace "4 s of dawn, then Results", 12.2 / 12.3).

### Story 12.1: Buildings never close a path (no forts)

(Story file `12-1-buildings-never-close-a-path.md`, ready-for-dev.)

As a player,
I want the game to refuse a building that would wall off part of the map,
So that my team can't build a sealed fort, and there's always a way through for every survivor.

**Acceptance Criteria:**

**Given** a placement or a move (5.24) of a wall-type building
**When** the shared check runs (a flood fill on the 0.5 m nav grid at player clearance, `player.radiusM` 0.4 m)
**Then** it is refused with `"seals_path"` if any free cell would no longer connect to the main walkable region (the one holding `evac_pad`); a gap narrower than a player counts as closed; floor types (spike trap, mine, bear trap) are never refused
**And** walls stay solid for players, zombies and bullets; chained and pending placements (5.18) are checked in arrival order; the client ghost and the server agree (fuzz test); the ghost shows "Leave a way through" and highlights the pocket it would close
**And** the check allocates nothing per call, is cached on the client per (cell, rotation, `buildings.version`), and costs < 1 ms per check on Downtown, measured headless at 4× CPU throttle, with the time on a 140 × 140-cell grid recorded for Epic 11's 70 × 70 m maps (X10; the reference-phone wording stays, parked)
**And** `pathOpen.ts` uses the same grid and clearance helper as `pushOutOfBuildings › escapeInside` (or the flow-field rasteriser), so the two never disagree about a gap; the sealed-fort escape tests stay, and a new test shows a placement this check accepts never makes a pocket the escape would call sealed (X3)
**And** the 10-wave bot sim (bots build around the pad) is run before and after the story, recording wall damage taken, zombies through gaps and team wipes for 10.8, and a 6.13 wide-body test "Brute at a 0.8 m forced gap" is added (X4)
**And** the `?stress=5&stressbuild=fort` dev fort stays as a debug-only layout that bypasses the check (it never reaches the server), with a comment pointing to AC 10 of the story file (X5)

**Given** a decay stage adds solid cover (4.2 `minStage`, a 4.8 wreck or rubble)
**When** `destroyBlockedBuildings` runs at the build start
**Then** every wall-type building closer than 0.8 m (one player body) to the new cover is destroyed with no refund (12.4), in building-id order, with the owner toast "Your barricade was cleared by the collapse"
**And** a decay stage re-checks paths; walls that now seal are cleared (review H1, designer-decided 2026-11-26: A): a spot that was in the main region before the stage, is still free and is now cut off by walls (the map alone still joins it) gets the walls nearest it cleared, highest id first, same cause, toast and no refund
**And** saves and replays that already hold a sealed fort still load; bots handle `"seals_path"`

### Story 12.2: Extraction: walk to the helicopter and lift off

(Story file `12-2-extraction-walk-and-lift-off.md`, ready-for-dev. Needs 12.1 and 8.12.)

As a team that just voted to extract,
I want our survivors to walk to the helicopter on their own, climb in and fly off over the horde,
So that the end of a won run feels like an ending, not a cut to a menu.

**Acceptance Criteria:**

**Given** Extract wins the vote (any way, after wave 10 or an endless evacuation)
**When** `resolveEvacVote` decides it
**Then** the run enters a new phase `"extract"` between `vote` and `results` (`run.ending` is still fixed at the vote); player inputs except pings are dropped, every player is protected, and fire, acid and spit pools are cleared
**And** each standing player is walked by a sim autopilot at walk speed to the pad along a pad-seeded flow field (buildings as walls); downed players stand up and walk; out players and held seats board at the phase start

**Given** the helicopter has landed
**When** a player is within `evac.padRadiusM` (3 m) of the pad
**Then** they board (`player.boarded`); after `evac.walkTimeoutS` (8 s) the rest are boarded with `run.extract_cut`

**Given** everyone has boarded
**When** a 0.5 s beat has passed
**Then** `run.lifted` is emitted, the sim keeps stepping for `evac.flyOutS` (8 s) while an extraction horde (`evac.flyOutHorde.count`, `.perS`; not a wave, no bounty, no stats) runs at the pad and the helicopter flies to the east edge (`heliPose`, from `liftedAtTick`), then `endRun` (extracted) banks rewards and Results show
**And** joiners are not admitted and nothing is saved during `extract`; solo runs the same phase; `run.phase`, `boarded` and `liftedAtTick` go through the full copy chain; replay digest and bots handle the phase
**And** `NET_PROTOCOL_VERSION` is bumped for the new phase and fields (an old tab gets "please reload"); 8.13 took protocol 4; the next of 12.2 or Epic 11 takes 5 (X6)
**And** when the story lands, FR67 is reworded to "Extract wins the run: the survivors walk to the helicopter and fly out (≤ 20 s), then Results" and Story 6.11 gets an as-built note (X6)
**And** `runSave.coverage.test.ts` excludes `boarded` and `liftedAtTick` with the reason "phase extract is never saved"; a save taken in the vote and resumed still runs the extraction; the three synced fields get E8-A2 "sent, changed, synced" copy-chain tests (X7)
**And** a test shows milestone counters do not move during `extract` (X8; 10.7 does not count those kills either)

### Story 12.3: Extraction cinematic camera

(Story file `12-3-extraction-cinematic-camera.md`, ready-for-dev. Needs 12.2. Client only.)

As a player who just won a run,
I want the camera to frame our walk to the helicopter, then follow it over the horde into the sunrise,
So that the extraction plays like a short film.

**Acceptance Criteria:**

**Given** the `extract` phase
**When** it plays
**Then** a pure, data-driven camera director (`render/cameraDirector.ts`, shot list keyed to timeline events) replaces the player-follow camera: 8 % letterbox bars ease in over 0.6 s, the camera frames all walkers plus the pad (3 m margin) with no jumps, the HUD hides except pings, the bars go to 12 % when the last player boards, and a timeout cut fades through black (0.3 s)
**And** at lift-off the camera follows the helicopter and zooms out to 0.6× over 3 s (never past 1.0×), fog lifts, the DW1 dawn sweeps west from the east edge, a crew sprite helps boarding, and the screen fades to white before the view reaches the map edge, then Results

**Given** any phone
**When** it plays or wakes late
**Then** every timing comes from server ticks, a late phone goes straight to Results, the sequence is ≤ 20 s with no skip, bars and fades work at 568×320, 640×360, 800×360 and 844×390, darkness and fog cover the zoomed-out view, and the fly-out holds the frame budget (debug overlay)
**And** the frame budget is measured headless with `?stress=150` at 4× CPU during the fly-out: within 2 FPS and +1 ms p95 of a normal wave (the 9.x budget); the reference-phone wording stays, parked (X10)
**And** the crew sprite and the helicopter stay code-drawn placeholders; they are a photoreal group in 9.1's inventory, picked with 9.4 or 9.2 (X9)

### Story 12.4: No refund for buildings lost to decay

(Story file `12-4-no-refund-for-decay-losses.md`, ready-for-dev. Changes FR58 and Story 6.2 review L4.)

As the designer,
I want buildings destroyed by the city's decay to be simply lost,
So that building next to crumbling parts of the city is a real gamble.

**Acceptance Criteria:**

**Given** the decay system destroys a building (new stage cover, FR58; a fire lit at the build start, 4.8 M2; within 0.8 m of new cover, 12.1 AC 6)
**When** it is destroyed
**Then** `building.destroyed` is emitted and no money goes back (no `refundMoney`, no `money.earned` reason `refund` from decay), and the owner sees "Lost to the collapse" or "Lost to the fire" with no amount
**And** `decay.buildingRefundShare` is removed from `balanceSchema.ts` and `decay.json` (the schema rejects an old override), selling / take-back (5.20) is unchanged, economy sims and bot seeds are re-checked, and any end-of-run money change is noted for 10.8
**And** the doc update covers every place the 50 % refund is written (X2, designer "ok" 2026-11-26): FR58, as-built notes on Stories 4.5 and 6.2 (its rubble AC), the `game-architecture.md` rule line and the HANDOFF Epic 4 summary
**And** the story lands **before 10.8**, and the end-of-run money change is logged with its reason in `docs/balance/changelog.md` (X2)
