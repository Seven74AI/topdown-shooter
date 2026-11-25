---
stepsCompleted: [1, 2, 3, 4, 5, 6]
filesIncluded:
  - _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md
  - _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/epics.md
  - _bmad-output/planning-artifacts/game-architecture.md
  - _bmad-output/planning-artifacts/epics.md
contextFiles:
  - _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/decision-log.md
  - _bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/addendum.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-*.md
---
# Implementation Readiness Assessment Report

**Date:** 2026-11-25
**Project:** topdown-shooter

## 1. Document Inventory

| Type | Format | File | Size | Modified |
|---|---|---|---|---|
| GDD | Folder (gdd.md + epics summary + decision log) | `gdds/gdd-topdown-shooter-2026-11-21/` | 40 KB / 8.5 KB / 8 KB | 2026-11-25 / 2026-11-24 |
| Architecture | Whole | `game-architecture.md` | 52 KB | 2026-11-25 |
| Epics & Stories | Whole | `epics.md` (Epics 1–11, 141 stories) | 213 KB | 2026-11-25 |
| UX Design | — | **Not found** | — | — |

**Issues:**
- No duplicates. The GDD-folder `epics.md` is the GDD's epic summary (a source document), not a duplicate of the story breakdown.
- ⚠️ No UX design document; UX alignment will be assessed against UI content in the GDD and stories.
- Context: brief + addendum, GDD decision log, 7 sprint change proposals, earlier readiness reports (2026-11-21, 2026-11-24 epic 6, 2026-11-24 epic 7).

## 2. GDD Analysis

The GDD (`gdd.md`, updated 2026-11-23/25) has no numbered requirements of its own. The canonical numbering is the Requirements Inventory in `epics.md` (FR1–FR94, NFR1–NFR14), derived from the GDD and architecture. It is reproduced verbatim below as the extraction baseline, then checked line by line against the current GDD text.

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
FR31: Zombie count and boss HP scale by player count: × 0.4 (solo), × 0.6 (2 players), × 0.8 (3), × 1.0 (4); a mid-run join rescales from the next wave. Solo is allowed, not balance-tuned.
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
FR45: Each player has a personal wallet, earning kill rewards per zombie type, 50% of the reward for an assist, +25 per revive, 50% of the reward for kills by their own buildings, and a wave-clear bonus of 10 × wave number paid to every player (including downed and out players).
FR46: The shop offers consumables and upgrades for weapons the player owns, plus the 6 cards (FR47). Buildings come from the build bar (Story 5.16). A downed or out player can't buy.
FR47: Each build phase, each player sees their own 6 random weapon and gear cards drawn from their unlocked pool, with at least 1 weapon and 1 gear card; reroll costs 20. No locking, no upgrade cards, no Pistol card, items with `inShop:false` never drawn; rarity by price (≤ 250 common ×3, ≤ 500 rare ×2, epic ×1); no per-wave price scaling; card look C3. When the pool can't fill 6, fewer cards show and Reroll is disabled when no new draw exists.
FR48: Gear lasts the run: Body armor I/II (+25/+50 max HP, 150/350), Running shoes (+10% speed, 150), Revive kit (its owner revives teammates in 1.5 s instead of 3 s; the fastest standing reviver in the zone counts, no stacking, no effect on the owner's own revive; 150), Tactical flashlight (wider, longer cone in blackout, 120).
FR49: Consumables use one slot: Medkit (heals 50, 60), Grenades ×3 (40 dmg, 2.5 m, 80), Molotovs ×2 (3 m fire zone for 4 s, 8 dmg/s, 100). Grenades and molotovs are thrown 2–8 m on the Grenade Launcher's lob (over everything but buildings) and used in waves only; molotov fire needs a clear line from the zone centre, like acid.

**Buildings**

FR50: In a build phase, a player picks a building in the build bar, carries its ghost and drags to place it on a 0.5 m lattice (Stories 5.15–5.25, "B · Carry + drag"); the ghost turns red at once when blocked and green only after 250 ms clear; placement is refused where blocked.
FR51: Buildings persist until destroyed, can be repaired in a build phase for 50% of their price, and are capped at 6 per player (cap reviewed in the Epic 5 balance pass).
FR52: Building behaviors per the GDD table: Wood barricade (2 m wall, 200 HP, 40), Reinforced barricade upgrade (350 HP, +50), Metal barricade upgrade (600 HP, +70), Auto-turret (nearest zombie within 8 m, 3 dmg × 5/s, 300 HP, 250), Spike trap (2 × 2 m, 4 dmg/s and −40% speed, 300 HP, 80), Mine (proximity, 80 dmg in 2.5 m, single use, 60), Floodlight (4 m radius light, 6 m in blackout waves, 150 HP, 100; sold once Story 6.3 lands), Bear trap (Story 5.14), Med station (heals players within 2 m by 5 HP/s, 300 HP, 400).
FR53: Every barricade tier (wood/reinforced/metal) blocks zombies, players and every bullet (own, teammates', turrets'); aim assist and turret targeting skip zombies behind one. Turrets, sandbags, police barriers and floor buildings stop no bullets. Explosions, flames, melee, acid and gas keep their own rules; zombies attack buildings blocking their path; fires damage buildings inside them; rubble blocks placement; the Behemoth's charge destroys buildings.

**District, camera and cover**

FR54: Downtown (~48 × 32 m) is hand-made: central intersection, 2–3 alleys, gas station corner, crashed city bus, small parking lot, spawn points at the edges.
FR55: Each player's camera follows them, showing about 24 × 13.5 m; teammates off screen are shown by edge arrows; each player has a colored ground ring (blue, orange, green, purple).
FR56: Cars, bus, barriers and sandbags block movement for players and zombies; bullets pass over barriers and sandbags but not cars or the bus; buildings, gas pumps, the parking wall and the dumpster also stop bullets; player barricades stop bullets.
FR57: Hazards damage or slow what is inside them: fire zones (10 dmg/s to everything), acid puddles, gas leak, Bloater gas.

**City decay**

FR58: The district advances one decay stage every 2 waves; stage changes apply only at the start of a build phase, and buildings on newly blocked cells are destroyed with a 50% refund.
FR59: Stage 1 Evening (waves 1–2): dusk, open map, the brightest stage (it darkens each stage), parked cars along curbs, lit shops.
FR60: Stage 2 Panic (waves 3–4): 4 cars move into the road (new cover and choke points); police barriers block some paths.
FR61: Stage 3 Breakdown (waves 5–6): 2 car fires (2 m fire zones lasting 2 waves); free sandbag cover appears; heavy rain (drizzle since stage 1).
FR62: Stage 4 Ruins (waves 7–8): rubble closes one alley and blocks paths; streetlights flicker; collapsed walls open new spawn points.
FR63: Stage 5 Collapse (waves 9–10): power out; wave 9 is a blackout wave; fog limits vision to 10 m; wave 10 is dark too, lit only by fires, floodlights, flashlights and muzzle flashes.
FR64: In blackout, darkness covers the map except flashlight cones (aim direction), floodlights, fires and muzzle flashes; zombie eyes show through the dark.
FR65: Each run has a seed that drives its random choices (which cars burn, which alley collapses, events, shop cards), so a run can be reproduced. A Random city's layout comes from its own city seed (FR94).

**Win, evacuation and endless**

FR66: After the Behemoth dies, the team votes for 15 s: majority wins; a tie or no votes means extract.
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
FR78: Supplies are earned per run, even on a loss: +10 per wave survived (counted only for waves the player was in: every player in the run when the wave ends, downed or out, but not waves before a late join or after leaving), +50 for killing the Behemoth, +100 for extracting, +20 per endless wave (kept only if the team extracts); a player's Supplies are doubled while their lifetime Supplies are below 300 (rookie lift).
FR79: New players start with the starter pool (Pistol, Machete, Fire Axe, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Revive kit, Wood barricade, Auto-turret, Medkit, Grenades); other items are unlocked with Supplies on an unlock screen at the GDD prices, in any order, and unlocks add cards to that player's shop deck; one card per offer may be borrowed from a teammate's unlocks the player lacks.
FR80: Training offers 4 capped boosts with 5 levels each (max HP up to +10%, damage up to +5%, starting currency 200 → 250, reload speed up to +5%), each level costing 50 × level Supplies.
FR81: District 2 unlocks for a player after their first extraction from Downtown; the host can pick a district if anyone in the lobby has unlocked it (rule only; district 2 content is out of v1).

**Presentation, audio and settings**

FR82: Dead City art, drawn in game code: gritty, realistic, rainy night city; zombies read as people from above; each zombie type has a distinct silhouette; the district has 5 visual decay states.
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
FR94: Results of a Random city run show a city code; the host can type it in the lobby to play the same layout again (decay picks, events and shop cards stay new); a code from an older generator is refused with "This city is from an older version".

**Total FRs: 94**

### Non-Functional Requirements

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

**Total NFRs: 14**

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
- **Horde stream (ADR-02):** per-client binary message per tick with zombies in the client's view + 4 m margin; 8-byte records (id u16, x u16, y u16 at 1 cm, heading u8, type+state u8) + header; freed ids held 1 s; client removes zombies missing from 3 snapshots; backpressure skips frames when `bufferedAmount` > 64 KB; budget horde ≤ 24 KB/s + schema/events ≤ 6 KB/s.
- **Colyseus schema** for low-frequency state (players, wallets, loadouts, buildings, phase, timers, decay stage, votes, Behemoth, hazards, mines, Survivor, crate, aliveCount); personal shop offers sent only to their owner (`@view()` or direct message); purchases validated against the stored offer.
- **Hit validation:** server simulates all projectiles and melee; shots spawn at the shooter's position advanced by half RTT (capped 150 ms); projectiles are cosmetic on clients from `weapon.fired` events; the server rewinds zombies to what the shooter saw (≤ 10 ticks / 500 ms since Story 8.8; 300 ms in Story 2.12; spread keyed to the input seq); boss hits are not rewound.
- **Pathfinding:** flow fields on a 0.5 m grid toward players, rebuilt (amortized) when buildings or decay change; Runners use a flanking field; separation forces on top.
- **Maps (ADR-05):** districts authored in Tiled (JSON export); layers `stage1_evening` … `stage5_collapse`, `collision`, `cover`, `spawns`, `hazards`; per-stage mutation sets (`add | remove | ignite | block`); `DecayTimeline` + `DecaySystem` in shared (`applyDecayStage` is the single path); the map is generated by `tools/maps/buildDowntown.ts`, and visuals are drawn by `apps/client/src/render/city/*` (`DecayView` is gone); client prediction applies decay to its own map; on resume, stages are re-applied without side effects.
- **Lighting:** darkness render texture at half resolution with lights cut out, rendered only when blackout is on; light state owned by the server.
- **UI:** in-combat HUD drawn by Phaser; menus (lobby, shop, evac vote, results, unlocks, settings) as Preact HTML overlays with `pointer-events: none` except on active screens.
- **Persistence (ADR-04):** PostgreSQL 18 + Drizzle ORM 0.45 + Drizzle Kit migrations; tables `accounts`, `progress`, `saved_runs`, `run_results`; DB accessed only from `apps/server/src/db` repositories.
- **Saved runs:** versioned JSON snapshot (including every PRNG state) autosaved at each Build phase for crash recovery; explicit Save and quit makes it resumable for 7 days by the host only; graceful shutdown autosaves every room.
- **Reconnect:** Colyseus `allowReconnection` 120 s; slot, wallet and gear held in room state.
- **Accounts:** guest = random device token in localStorage → server session (stored hashed); upgrade to username + password (Argon2id via @node-rs/argon2).
- **Hosting:** Docker Compose on the designer's European VPS: HTTPS/WSS at the existing Cloudflare Tunnel, Caddy 2.11 behind it on plain HTTP at 127.0.0.1:8080 (static client, no-cache `index.html`, long-cache hashed assets), game server, PostgreSQL; the game is at https://hordes.sevend.io; Hermes deploys; WebSocket origin check; nightly `pg_dump` kept 14 days and copied off the VPS, restore tested once per milestone.
- **Security limits:** inbound message ≤ 1 KB, input rate cap 25/s per client, ping rate 1/s per player, login 5/min per IP, room creation 10/min per IP; zod validation on every client message.
- **Error handling:** `Result<T, E>` for expected failures; exceptions only for programmer errors; one global handler per room (saves the last Build snapshot if the simulation is corrupted); short player-facing messages.
- **Logging:** pino JSON to stdout with `roomId`/`runSeed`/`wave`/`playerId`; no logging in hot loops; client ring buffer of 200 lines attached by "Report a problem".
- **Debug tools:** performance overlay (FPS, ping, bandwidth, zombies alive/in view, tick time) also in release via Settings → Show performance; dev-only cheats (spawn, skip wave, give currency, set decay stage, trigger event, force blackout, set seed, god mode); release-safe switches: `?debug`, `?loadout`, `?lag`, and `?wallet` (solo only); collision/grid view; headless replay from seed + input log.
- **Testing:** Vitest unit tests with fixed seeds for every GDD mechanic in `shared`; headless bot clients in `tools/bots` for load tests.
- **Client platform budgets:** devicePixelRatio capped at 2; texture atlases ≤ 2048 × 2048; no per-frame allocation in render loops (Phaser object pools); stop rendering and audio on `visibilitychange`; web app manifest (fullscreen, landscape), `viewport-fit=cover`.
- **Assets:** art is drawn in game code (`render/city/*`) into atlases with `category_name_variant` frames, each registered through `addGeneratedTexture`; AI/vector images are references only. SFX audio sprites, streamed music and ambience (procedural or licensed/free libraries).
- **Audio:** three buses (music, SFX, ambience); positional volume/pan for zombie cues.
- **Tooling:** Context7 MCP for current Phaser/Colyseus/Vite docs.

From the GDD epics outline (sequencing constraints):

- Epic 3 ships a fixed-list shop; the 6-card roguelike shop arrives in Epic 5 once the item pool is big enough.
- Milestone 1 = Epics 1–4: 2–4 players online in Downtown, 4 weapons (Pistol, SMG, Machete, Hunting Rifle), 3 zombie types, turret + barricade, shop, 5 waves (now 6 waves; 6.1 makes 10), 3 decay stages.
- Melee under twin-stick must be playtested on real phones in Epic 1 (open risk).
- All art is drawn in game code; sounds are procedural or from licensed/free libraries. Nobody is hired: Epic 9 is a polish pass of the code-drawn art and the audio (designer, 2026-11-23).

### GDD ↔ Requirements Inventory drift (checked against the GDD text and the live balance JSON)

The current GDD and `packages/shared/src/config/balance/*.json` agree with each other; the epics inventory is behind on these:

| # | Where (epics.md) | Inventory says | GDD + balance JSON say | Source of the change |
|---|---|---|---|---|
| D1 | FR31, Story 2.3 (l.757), Story 8.6 (l.2977) | solo × 0.4 zombie count | × **0.35** (`waves.json playerCountScale[0]`) | Epic 5 balance pass, 2026-11-24 |
| D2 | FR45, Story 3.2 AC (l.1040) | wave-clear bonus 10 × N | **15 × N** (`economy.json waveClearBonusPerWave: 15`) | Epic 5 balance pass, 2026-11-24 |
| D3 | FR48, Story 5.11 AC (l.1737) | Body armor II costs 350 | **300** (`gear.json`) | GDD gear table |
| D4 | FR52, Story 5.9 AC (l.1701) | Mine costs 60 | **35** (`buildings.json`) | GDD building table |

(FR33's solo Behemoth HP × 0.4 is correct: the GDD Open Items keep it separate, and `boss.json soloHpScale: 0.4`.)

### Inconsistencies inside the GDD

- **G1 Mid-run join money.** *Multiplayer Considerations* says 100 + 60 % of the team's average earnings (Epic 8 D7); *Economy › Anti-snowball rules* still says "a player joining mid-run starts with the team's average currency".
- **G2 Solo scale wording.** *Enemy Wave Design* says "zombie count and boss HP × … solo × 0.35", but the boss stays × 0.4 (Open Items). The sentence reads as if the boss were × 0.35 too.
- **G3 Spending range.** *Economy › Spending* says weapons 150–800; the most expensive weapon is 700.
- **G4 Front-matter date.** `updated: 2026-11-23`, but the body records decisions from 2026-11-24 (balance pass, Epic 8 decisions, start money).
- **G5 Build UI.** *Controls* describes only "B · Carry + drag"; Story 10.10 (Build button, hybrid build-phase UI) is in the backlog and not reflected in the GDD.
- **G6 Win trigger.** *Win/Loss* says "survive wave 10", while *Wave 10 boss* and FR36/FR66 say the Behemoth's death calls the helicopter. The GDD doesn't say what happens to the wave 10 zombies still alive when the Behemoth dies (vote during combat? auto-clear?).
- **G7 GDD rules with no FR line.** These exist only in the GDD prose and need checking against the stories in step 3: join gives +15 s build time once per phase; turret kills keep paying a disconnected player's held wallet for 2 min; a player who drops while downed is out for that wave; the fight freezes for up to 2 min when nobody is connected; at most 3 saves per account; everyone leaving mid-wave loses the run; a quitter keeps the Supplies they earned; Training is never scaled; a downed or out player can't place, move, sell, repair or upgrade buildings; only standing players take the crate or lead the survivor.

### GDD Completeness Assessment

The GDD is thorough and decision-rich: every mechanic has numbers, pillars act as decision rules, and late decisions are dated and linked. Weaknesses: (1) it has picked up decisions from 2026-11-24 without its own header date and with two stale sentences left behind (G1, G2); (2) several network and resilience rules (G7) live only in GDD prose, so the epics inventory doesn't carry them as FRs; (3) the requirements inventory in `epics.md` was not refreshed after the Epic 5 balance pass (D1–D4). Missing UX doc: the building UX spec (`docs/ideas/building-ux/ux-spec.md`) covers building only.

**Resolution of G7:** every rule listed in G7 *is* carried by a story AC (8.2 +15 s; 8.1 held-wallet turret pay, downed-drop = out, world freeze; 8.6 max 3 saves; 8.4 mid-wave leave loses; 7.2 quitter keeps; 7.5 Training never scaled; 5.20 `not_alive` on place/move/sell/repair/upgrade; 6.9/6.10 standing-only crate and survivor). They just have no FR number.

## 3. Epic Coverage Validation

Source: the FR Coverage Map and per-epic "FRs covered" lines in `epics.md`, cross-checked against every story's acceptance criteria (all 141 stories read) and, where a story AC disagreed with the FR, against `packages/shared` code and balance JSON.

### Coverage Matrix

Legend: ✓ covered by a done story · ◐ covered, but the story AC text contradicts the FR (code follows the FR) · ○ covered only by backlog / in-progress stories · ❌ missing

| FR | Requirement (short) | Stories | Status |
|---|---|---|---|
| FR1 | Landscape only, rotate overlay | 1.1 | ✓ |
| FR2 | Floating move stick | 1.3 | ✓ |
| FR3 | Aim stick, auto-fire past 30 % | 1.5 | ✓ |
| FR4 | 8° aim assist, not behind barricades, off for mouse | 1.6, 2.7, 6.4 (fog) | ✓ |
| FR5 | Swap 0.3 s | 1.8 | ✓ |
| FR6 | Auto reload, unlimited reserve | 1.5 | ✓ |
| FR7 | WASD + mouse | 1.10, 5.23/5.25 | ✓ |
| FR8 | Consumable button, above build bar in build | 5.12, 5.16 | ✓ |
| FR9 | 100 HP, 4.5 m/s, contact dmg, build heal 50 % | 1.3, 1.4, 3.1 | ✓ |
| FR10 | Downed, revive 2.0 m / 3 s, countdown pauses, gun reloads, out 20 s | 2.8, 3.1 | ◐ 2.8 AC says 1.2 m and has no pause/reload rule (`player.json reviveRadiusM: 2`, pause in `balanceSchema.ts`) |
| FR11 | Team wipe loss | 2.8 | ✓ |
| FR12 | 2 slots, Pistol + 200 start | 1.8, 3.2 | ◐ 3.2 AC says 100 |
| FR13 | 11 weapons per GDD table | 1.5, 1.8, 1.9, 5.2–5.5 | ◐ 1.5 Pistol 5 (GDD 6), 5.2 Axe 1.1/s (1.4), 5.3 Shotgun 8×4 (8×5), AR 7 dmg 8/s (10, 6/s), 5.5 GL 2 m blast / 800 (2.5 m / 700); `weapons.json` follows the GDD |
| FR14 | Projectiles; melee blocked by shot-blocking cover | 1.5, 1.9, 5.5 | ◐ 4.2 AC says "melee ignores cover in v1"; `combat/cover.ts` implements the FR |
| FR15 | Fixed spread, no recoil, no crits | 1.5 | ✓ |
| FR16 | Weapon specials | 1.8, 5.2–5.5 | ✓ |
| FR17 | Upgrades I–IV | 5.1 | ✓ |
| FR18 | Friendly fire 50 % for area, Bloater full | 5.4, 5.8 | ✓ |
| FR19 | Hit flash, push, shake | 1.5, 1.8, 1.9, 5.2 | ✓ |
| FR20–FR22 | Walker, Runner, Crawler | 1.4, 3.8, 3.9 | ✓ |
| FR23–FR25 | Spitter, Bloater, Brute | 5.6, 5.8, 5.7 | ✓ (Spitter cover rules and Brute reach 1.8 m live only in the FR text) |
| FR26 | Chase, route, separation, attack buildings | 1.4, 3.5, 4.7, 6.13 | ✓ |
| FR27 | Fixed zombie stats | 1.4, 6.12 | ✓ |
| FR28 | Wave sizes, 150 cap, 110 with boss | 1.7, 3.10, 6.1, 6.5 | ✓ |
| FR29 | Introduction order, fixed Brutes | 3.10, 5.6–5.8, 6.1 | ✓ |
| FR30 | Last 5 marked and rushing | 1.7 | ✓ |
| FR31 | Player-count scaling | 3.10, 2.3, 6.1, 8.2, 8.6 | ◐ FR31 and 2.3/6.1/8.6 say solo × 0.4; GDD + `waves.json` say 0.35 (D1) |
| FR32 | Edge spawns, decay opens more | 4.3, 6.2, 11.5 | ✓ / ○ (Random city part) |
| FR33–FR36 | Behemoth body, attacks, enrage, death → evac | 6.5, 6.6, 6.7 | ✓ |
| FR37–FR43 | Special events | 6.8, 6.9, 6.10 | ✓ |
| FR44 | 30 s build phase, Ready | 3.1 | ✓ |
| FR45 | Wallets and rewards | 3.2, 3.6 | ◐ FR45 and 3.2 say 10 × N; GDD + `economy.json` say 15 × N (D2) |
| FR46 | Always-available shop, downed can't buy | 5.13, 5.16 | ✓ (the "downed can't buy" rule is only in the FR; code enforces `not_alive`) |
| FR47 | 6-card shop | 5.13, 7.4 | ✓ |
| FR48 | Gear | 5.11 | ◐ FR48 and 5.11 say Body armor II 350; GDD + `gear.json` say 300 (D3) |
| FR49 | Consumables (medkit usable in build, molotov line rule, lob) | 5.12 | ◐ 5.12 AC says "up to 8 m in the aim direction", no 2 m minimum, no lob or clear-line rule, no build-phase medkit; these exist only in the FR |
| FR50 | Carry + drag placement on a 0.5 m lattice | 3.4, 5.15–5.19, 10.10 ○ | ✓ (3.4's 1 m grid and ✓/✕ flow are superseded, see below) |
| FR51 | Persist, repair 50 %, cap 6 | 3.4, 3.7, 5.21 | ✓ |
| FR52 | Building table | 3.4, 3.6, 5.9, 5.10, 5.14 | ◐ FR52 and 5.9 say Mine 60; GDD + `buildings.json` say 35 (D4) |
| FR53 | Barricades stop every bullet; building interactions | 3.5, 4.5, 4.8, 6.2, 6.6 | ◐ 3.4 AC says "projectiles pass over it"; code (`stopsBullets`) follows the FR |
| FR54 | Downtown layout | 4.1 | ✓ |
| FR55 | Camera, edge arrows, rings | 1.3, 2.9 | ✓ |
| FR56 | Cover and bullet rules | 4.2 | ✓ |
| FR57 | Hazards | 4.8, 5.6, 5.8, 6.9 | ✓ |
| FR58–FR61 | Decay engine, stages 1–3 | 4.5–4.8 | ✓ |
| FR62–FR64 | Stages 4–5, blackout | 6.2, 6.4, 6.3 | ✓ |
| FR65 | Run seed, named streams | 1.2, 4.4, 7.12 | ✓ (city seed ○ 11.7) |
| FR66–FR68 | Vote, extract/stay, endless | 6.11, 6.12 | ✓ |
| FR69 | Lobby, link, code, district pick | 2.1, 2.3, 7.7, 11.7 ○ | ✓ / ○ |
| FR70 | Guest with a name | 2.3, 7.1 | ✓ |
| FR71 | Shared horde, server hits, own feel | 2.4–2.7, 2.12, 8.8, 8.9 | ✓ |
| FR72–FR75 | Join mid-run, reconnect, host, save/resume | 8.1–8.6 | ✓ |
| FR76 | Pings | 8.7 | ✓ |
| FR77–FR81 | Account, Supplies, unlocks, Training, district rule | 7.1–7.7 | ✓ |
| FR82 | Dead City art in code, 5 visual states | 4.9, 4.12, 9.2 ○, 9.11, 9.12, 9.13 ○, 9.14 ○ | ✓ placeholder / ○ polish |
| FR83 | Gore with toggle | 9.5, 10.1 | ○ |
| FR84 | Telegraphs and signature sounds | 5.6–5.8, 6.5 (visual ✓) · 9.10 ○ (sounds) | ✓ / ○ |
| FR85 | Ambience per stage, adaptive music | 9.8, 9.9 | ○ (placeholder ambience ✓ in 4.6–4.8, 6.2, 6.4) |
| FR86 | Weapon sounds | 9.10 | ○ (placeholders ✓) |
| FR87 | Quality settings | 10.1 | ○ |
| FR88 | Run stats | 10.7, 11.7 | ○ |
| FR89 | Survivor customization | 7.8–7.12 | ✓ |
| FR90–FR94 | Random city | 11.1–11.7 | ○ |

NFRs: NFR1 (1.11, 6.3, 7.9, 9.x, 10.2 ○), NFR2 (10.3 ○, 11.6 ○), NFR3–NFR5 (2.10 review, 8.8–8.10 ✓), NFR6 (10.4 ○), NFR7 (10.3 ○), NFR8 (10.5 ○), NFR9 (8.1 ✓, 10.9 ○), NFR10 (1.2, 4.4 ✓), NFR11 (2.9, 9.4 ○), NFR12 (2.1, 2.2, 7.6 ✓; at risk in 8.11, see §5), NFR13 (7.1, 8.4 ✓), NFR14 (1.2, 10.8 ○). All 14 have a story.

### Missing Requirements

**No FR is missing from the epics.** Every FR1–FR94 maps to at least one story, and the GDD-only rules (G7) are carried by story ACs.

What *is* wrong is traceability text, not coverage:

- **High: requirements inventory out of date (D1–D4).** FR31, FR45, FR48 and FR52 contradict the current GDD and the shipped balance. Anyone writing a new story from `epics.md` (e.g. Story 10.8's balance targets, Epic 11's solo sim) will start from the wrong numbers. Fix the FR lines; leave the done stories' history alone, or add a "superseded" note.
- **Medium: done-story ACs that contradict their FR (◐ rows: FR10, FR12, FR13, FR14, FR49, FR53).** The code follows the FR and the GDD, so nothing needs building. But `epics.md` is the file agents read for context, and Stories 2.8, 3.2, 3.4, 4.2, 5.2, 5.3, 5.5 and 5.12 now describe behaviour the game doesn't have (e.g. "melee ignores cover in v1", "projectiles pass over" barricades). Add a one-line "Superseded by …" note under each, the way 5.21/5.22 already note their merges.
- **Low: per-epic NFR lines.** The Epic 10 header lists NFR1, 2, 6, 7, 8, but Story 10.9 also closes NFR3 and NFR9 (the NFR summary line says so; the header doesn't).

### Coverage Statistics

- Total GDD FRs: 94 (plus 14 NFRs)
- FRs traced to at least one story: **94 / 94 (100 %)**; NFRs: 14 / 14
- FRs fully delivered by done stories: 81 / 94 (86 %); the other 13 (FR83, FR85–FR88, FR90–FR94, plus the polish halves of FR82/FR84) are in backlog stories in Epics 9–11
- FR lines with stale numbers: 4 (FR31, FR45, FR48, FR52); done-story ACs that contradict their FR: 8 stories across 6 FRs

## 4. UX Alignment Assessment

### UX Document Status

**Not found** in `planning_artifacts`. UI is clearly implied: it is a player-facing phone game with a HUD, touch controls, a build bar, a shop, a lobby, a Progress hub, a survivor editor, a vote, Results and Settings. Partial UX sources exist:
- `docs/ideas/building-ux/ux-spec.md` ("B · Carry + drag"), the source for Stories 5.15–5.25;
- `docs/art/build-ui/index.html`, the layout options A–D for Story 10.10 (BU-1, not yet picked);
- HUD rules scattered across story ACs: 1.8 (44 px buttons, 14 px text, touch-zone priority), 2.11 (menu), 5.16/5.20/5.21 (build bar, undo chip, action bar), 6.14 (top HUD band), 8.7 (ping button), 10.10 (Build button).

### Alignment Issues

- **U1 Story 10.10 vs the building UX spec and the GDD.** 10.10 replaces the 4 × 2 build bar (5.16, ux-spec §4) with a Build button plus a quick tile. Neither `ux-spec.md` nor the GDD's *Controls* section mentions the hybrid, so after 10.10 the only written UX source describes a UI that no longer exists. Story 9.7 (UI art) still lists "build bar" art.
- **U2 Story 10.10's "last-placed building" is undefined at the edges.** What does the quick tile show in the first build phase of a run, after a resume (8.6) or reconnect (8.1), after a late join (8.2), when the last type is now unaffordable or at the cap, or when it was the bear trap that just wore out? Does a *move* (5.22) count as "placed"? Does a sold or undone building (5.20) still count?
- **U3 Ping button placement (8.7).** "Top-right or by the minimap": the game has no minimap (none in the GDD or architecture).
- **U4 The Results screen collects lines from about 10 stories** (3.10, 4.4 seed, 6.11, 6.12, 7.2 rewards/rookie/"Save my progress"/locked weapon, 7.5 Training list, 7.7 unlock, 7.11 milestone, 7.12 loot, 10.6 Report a problem, 11.7 city code). No story owns its layout or priority on a 568 × 320 screen.
- **U5 Settings (10.1) is missing two toggles that other stories assume:** haptics (5.20, 5.23 say "haptics follow the existing mute setting"; no mute/haptics switch is listed) and nothing says where Stories 9.6/9.8 read their settings before 10.1 exists (see §5, forward dependency).
- **U6 No first-run guidance.** The GDD assumes players know twin-stick games, but the build phase now has carry, thumb-drag pin, long-press move, undo and an action bar (5.15–5.24, 10.10), and nothing teaches them. Story 7.10 times a first-time player for the editor only. Consider one hint line per build action in the first build phase, or a note in 10.9's playtest to measure it.

### Architecture ↔ UX

- The architecture supports the UI split (Phaser HUD, Preact overlays with `pointer-events: none`) and the safe-area/manifest needs (10.5). Player settings (volumes, quality, gore, aim assist) are listed in *Cross-cutting Concerns*, but haptics are not.
- The architecture's lighting/darkness texture and the 9.12 silhouettes are client-only; 9.13's photoreal zombies must still show the 6.3 "zombie eyes within 14 m above the darkness" rule (not restated in 9.13, see §5).

### Warnings

- ⚠️ No consolidated HUD/UX spec. With Epic 9's UI art (9.7) and 10.10 still to come, a short `gds-ux` pass (HUD layout map at 568 × 320 and 844 × 390, Results, Settings, build-phase controls) would stop each story re-deciding positions. The epics doc already says "a `gds-ux` pass remains optional before Epic 9"; given U1–U5 it is now **recommended before 9.7 and 10.10**.

## 5. Epic Quality Review

Scope note: per `sprint-status.yaml`, Epics 1–7 are done (except the human playtests 1.11, 1.12, 2.10 and 4.10), Epic 8 is done apart from 8.11 (in progress, optional), and Epic 9 has 9.11–9.12 done and 9.13 in progress. Epics 10 and 11 are backlog, with 10.10 ready-for-dev. Findings on **unbuilt stories** are what can still change outcomes, so they come first. Findings on done stories are documentation hygiene.

### Epic structure

| Epic | Player value | Independent of later epics | Notes |
|---|---|---|---|
| 1–7 | ✓ | ✓ | Built. Epic 1 starts with the hand-scaffold story (no starter template, as the architecture says) ✓ |
| 8 | ✓ | ✓ (needs 7.1, an earlier epic) | Network pass (8.8–8.11, 8.1) built before Epic 7 by design; documented |
| 9 | ✓ | ❌ **needs Epic 10** (Q3) | Runs "alongside from Epic 4", but 9.5, 9.6 and 9.8 assume the 10.1 Settings screen |
| 10 | ◐ "Performance and polish" is borderline technical, saved by 10.1, 10.5, 10.6 and 10.9 being player-facing | ✓ | |
| 11 | ✓ | ✓ (needs 6, 7.7, 8.4, 10.7) | Post-v1, ordered last ✓ |

### 🔴 Critical / High (fix before the story is built)

**Q1 Story 11.1/11.7: "byte-identical" generated maps across JavaScript engines is not guaranteed.** The server (Node/V8), Android Chrome (V8) and iOS Safari (JavaScriptCore) must produce the same map digest, or every iPhone gets "Please refresh" on join. `Math.sin/cos/atan2/exp/pow/hypot` and friends are not required by the spec to return identical results across engines, and the architecture's determinism rule only bans `Math.random()`/`Date.now()`.
*Fix:* add an 11.1 AC: the generator uses only integer or fixed-point maths (or the shared code's own trig tables), plus an ESLint rule banning transcendental `Math.*` in `map/gen/`, and a CI test that checks the digest against a fixture generated once (so a JavaScriptCore run can be compared on 10.5's browser matrix).

**Q2 Story 11.7 vs 8.6: a saved Random city run can't be resumed after a generator update.** 8.6 says "balance changes never block [a resume]" and older snapshots are migrated. 11.7 refuses city codes "from an older version", and the snapshot stores only `citySeed + generatorVersion`. After a deploy that bumps the generator, a team's 7-day save either regenerates a different city (buildings inside walls) or can't be resumed at all. Nothing specifies which.
*Fix:* decide one rule and write it into 11.7 and 8.6: (a) keep old generator versions runnable (`gen/v1`, `gen/v2`), (b) store the generated `DistrictMap` (or its decay plan) in the snapshot, or (c) mark such saves "This city is from an older version" in the Saved games list and let the team discard them.

**Q3 Forward dependency, Epic 9 → Story 10.1 (Settings).** 9.5 needs the gore toggle ("Blood only"), 9.6 needs the rain/fog/grain/glow quality settings, and 9.8 needs "the Settings screen" with 3 volume sliders. None of these exist until 10.1, and Epic 9 is planned to run *before* Epic 10.
*Fix:* move 10.1 into Epic 9's front (or make it a dependency of 9.5/9.6/9.8), or have each Epic 9 story add its own setting to the in-run menu, with 10.1 later gathering them into one screen.

**Q4 Story 9.14: standing photoreal props will hide bodies, and no story covers it.** 9.14 makes cars, the bus, the dumpster, pumps, rubble and police barriers "stand" (raised-camera look, sorted with the bodies, like the 9.11 barricades). 9.12's see-through silhouettes are written only for "a standing wall or corner" (barricades). Zombies, a downed teammate, a bear trap, a mine, an acid puddle or the Crawler (low silhouette, FR22) behind a standing car or the bus would then vanish on screen, which breaks NFR11 and the pillar "a single zombie is never a threat; the crowd is".
*Fix:* add a 9.14 AC extending 9.12's silhouette rule to every standing prop (or keep props flat where they cover the street), and add a check that the drawn top of a standing prop never suggests cover the collision box doesn't have (a bullet that visibly "hits" a car roof but flies on).

**Q5 Story 8.11 conflicts with the architecture's security rule.** 8.11 adds a "compact binary input" message. The architecture says "clients never send binary" (input hardening), and NFR12 / the architecture require "zod validation on every client message". 8.11's ACs don't say how the binary input is validated (length, ranges, sequence numbers), how the 1 KB / 25-per-second caps apply, or how an old client still cached after a deploy is refused. Only the balance version is checked on join, not the wire protocol.
*Fix:* add 8.11 ACs: a strict decoder with range checks and a fuzz test, the same drop-and-log rules as 2.1, and a protocol version in the join options ("Please refresh" on mismatch). Then update the architecture's input-hardening line.

### 🟠 Major

**Q6 Story 9.13 (in progress) leaves out cases that already exist in the game:**
- the **Behemoth** (6.5 look) isn't in the list, so the boss would stay in the old style next to photoreal zombies;
- **blackout**: 6.3 draws zombie eyes within 14 m above the darkness and the Behemoth's outline/eyes (red when enraged) above it. 9.13 doesn't say the relit look keeps these;
- **survivor states and poses**: downed body (7.9), burning/acid cues (4.11), holding poses per weapon family (9.3), the bear-trap "held" pose (5.14) and the Brute wind-up (9.4);
- **custom survivors**: how the relit look applies to 51 parts × free colours with 7.8's night-muting, and whether the per-player bake still fits 7.9's "≤ ~2 ms total on the Xiaomi Mi 11i";
- **budgets**: no memory figure for the worker-baked frames (NFR2: < 300 MB on iPhone 12) and no named device or doc for the FPS check.

*Fix:* add these as ACs, or write "out of scope, owned by 9.3 / 9.4" for each, so nothing falls between 9.3/9.4 and 9.13.

**Q7 Story 9.14: decay and event states of the props aren't covered.** Cars in 3 conditions (9.2), the stage-2 cars moved into the road (4.7: are their angles limited to the 4 rotations the barricades use?), stage-3 burning cars and their fire edge at the damage radius (4.11 rule), the car-alarm "armed" blink (6.8), the gas-leak ring on the pump (6.9), Behemoth throw chunks "from burnt cars" (6.6), and how 11.6's "drawn by kind at any size" reuses these pictures. Add ACs, or say which are deliberately unchanged.

**Q8 Story 10.7 (Run stats) can't compute two of its own outputs.** "Wave reached in each group's first 3 runs" and "runs to first extraction" need to know *who* played. The `run_results` table (10.7 and the architecture) has no player or account ids. Also unspecified: a resumed run played over several nights (one row? `started` of night 1?), a saved run that expires unresumed (never written, so a failing run vanishes from stats), and whether solo and "practice" runs count (7.2 mentions practice runs earn nothing).
*Fix:* add a `run_result_players` (run id, account id, slot, loadout, waves in) table and the edge rules.

**Q9 Story 10.1: the guest → account merge rule for `settings` is missing.** 7.6 requires that "every later progress field [is] merged by the rule its story gives". 10.1 adds `progress.settings` without one. *Fix:* e.g. "the logged-in account's settings win; the device's local settings are kept only if the account has none". Also add the haptics toggle that 5.20/5.23 assume (U5).

**Q10 Story 10.10 is "ready-for-dev" but blocked**, waiting on the designer's BU-1 layout pick (A/B/C/D). Its ACs also don't cover the quick tile's edge cases (U2). *Fix:* mark it blocked in sprint status until BU-1 is decided, and add the U2 cases.

**Q11 Story 10.6: where reports are stored is undefined.** "The server stores the note, the log lines…": no table (the architecture's table list has none), no retention, no way for the designer to read them, and "rate-limited and size-limited" has no numbers (compare 2.1/2.2/7.6, which give exact limits). The log ring buffer may hold player names; say how long reports are kept.

**Q12 Random city vs extraction rewards is ambiguous.** FR81 unlocks district 2 on "first extraction **from Downtown**", and milestone items (7.11) include "first extraction". Does a Random city extraction grant the milestone? Does it count toward District 2 (FR90 says the District 2 rule is "unchanged", which reads as "no")? Write the answer into 11.7 so Story 7.2's transaction does the right thing.

**Q13 Stale cross-cutting rules inside `epics.md` › Additional Requirements** (agents read this block as context):
- "explicit Save and quit makes it resumable for 7 days **by the host only**". GDD, architecture and 8.5/8.6 say *any account from the run*.
- Rewind "≤ 10 ticks / 500 ms since Story 8.8": 8.9 raised it to 600 ms / 12 ticks.
- Horde stream "client removes zombies missing from 3 snapshots" and the 24 KB/s budget: 8.9 changed removal to 150 ms of missing time, and 8.10 replaced the format with the delta stream.

### 🟡 Minor

- **Q14 Duplicate Epic 5/6 headings.** In *Epic List*, Epics 5 and 6 use `##` instead of `###` (`epics.md` lines 341, 345), so the file has two `## Epic 5:` and two `## Epic 6:` headings. Tools that parse epics by heading (sprint planning) may see duplicates.
- **Q15 Status labels in headings drift from `sprint-status.yaml`.** "Story 9.13 … (backlog)" is in progress; 4.10 is marked in the epic as the Milestone 1 playtest, but it is deferred.
- **Q16 AC format.** 5.15–5.28, 9.11–9.14 and 10.10 use numbered lists or one paragraph instead of Given/When/Then, and 5.25–5.28 have no "As a / I want / So that" split. That's acceptable given their linked story files, but 9.13/9.14's one-AC form is what hides Q4, Q6 and Q7.
- **Q17 Superseded text in done stories** (from §3): 2.8 (revive 1.2 m, 30 % HP), 3.2 (100 start, 10 × N), 3.4 (1 m grid, ✓/✕ confirm, bullets pass over barricades), 4.2 (melee ignores cover), 4.5 (`DecayView`), 5.2/5.3/5.5 (weapon numbers), 5.9 (mine 60), 5.11 (armor II 350), 5.12 (throw rules), 2.3/6.1/6.5/8.6 (solo × 0.4). Add "Superseded by …" lines.
- **Q18 Story 10.8 is partly decided already.** It says the earnings model is still open ("fallback wave bonus 15 × N"), but the GDD records 15 × N as decided (Epic 5 balance pass, 2026-11-24) and the 6-building cap as kept. Reword it as "re-check" rather than "settle".
- **Q19 Story 7.2: endless Behemoths.** "+50 if the Behemoth was killed": once per run, or per Behemoth (waves 15, 20…)? Code decides today; write it down.
- **Q20 Story 11.2 anchor check** doesn't name where survivors start (run start, return after being out). Add "player start inside area C".
- **Q21 Story 11.6's "Downtown pixel-identical"** baseline must be taken just before 11.6, since 9.14 changes Downtown's props first.

### Data and dependency checks

- Tables are created by the story that first needs them (7.1 `accounts`/`progress`, 7.9 `look`, 7.11 `cosmetics`/`stats`, 8.4 `saved_runs`, 10.1 `settings`, 10.7 `run_results`) ✓. Exception: 10.6 names no storage (Q11).
- Within-epic order: no story needs a later story in its own epic, except the noted Epic 9 → 10.1 (Q3). Additive references ("Epic 8 adds Save and quit to this menu", 7.2's "added by later stories" lines) are fine.
- Merged stories (5.21+5.22, 5.23+5.25, 6.2+6.4, 6.6+6.7, 6.9+6.10, 6.11+6.12, 7.4+7.5, 7.7+7.11+7.12, 8.2+8.3, 8.4–8.6) are all labelled in the epic text ✓.

## 6. Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK**, for the unbuilt stories only. Epics 1–8 are built, and the code matches the current GDD. Requirement coverage is complete (94/94 FRs, 14/14 NFRs). The remaining stories in Epics 9, 10 and 11 can start, but five of them carry gaps that would ship bugs or force rework if built as written.

| Area | Ready? |
|---|---|
| 8.11 (optional, in progress) | ⚠️ settle Q5 (binary input vs security rule) first |
| 9.13 (in progress), 9.14 | ⚠️ add Q4, Q6, Q7 ACs before building / reviewing |
| 9.1–9.10 | ⚠️ resolve the 10.1 forward dependency (Q3) |
| 10.1, 10.6, 10.7 | ⚠️ Q8, Q9, Q11 |
| 10.10 | ⛔ blocked on BU-1; add U2 edge cases |
| 10.2–10.5, 10.8, 10.9 | ✓ (10.8 wording, Q18) |
| Epic 11 | ⛔ Q1 and Q2 must be decided before 11.1 / 11.7 |

### Critical Issues Requiring Immediate Action

1. **Q1** Cross-engine determinism for the Random city generator (iPhones would fail the map-digest check).
2. **Q2** Saved Random city runs vs generator version bumps: pick keep-old-versions, store-the-map, or discard-with-message.
3. **Q4** Standing photoreal props (9.14) hide zombies, traps and downed teammates; extend 9.12's silhouettes.
4. **Q5** 8.11's binary input breaks "clients never send binary" and has no validation or protocol-version AC.
5. **Q3** Epic 9 needs Story 10.1's settings but is scheduled before Epic 10.

### Recommended Next Steps

1. **Refresh the requirements inventory** in `epics.md`: FR31 (solo × 0.35), FR45 (15 × N), FR48 (armor II 300), FR52 (mine 35); fix the three stale *Additional Requirements* lines (Q13); fix the two `##` headings (Q14). A `gds-correct-course` pass or a direct edit works.
2. **Patch the GDD's own leftovers**: G1 (mid-run join money in *Economy*), G2 (solo boss × 0.4 wording), G3 (weapons 150–700), G4 (header date), G5 (mention Story 10.10's hybrid build UI once BU-1 is picked), G6 (wave 10 survivors must still be cleared after the Behemoth dies, as in 6.7).
3. **Add the missing ACs to 9.13 and 9.14** (Q4, Q6, Q7), or explicitly hand each case to 9.3/9.4/9.2.
4. **Decide Q1, Q2 and Q12** and write the answers into 11.1, 11.7, 8.6 and the architecture's ADR-06 before Epic 11 starts.
5. **Re-order or split 10.1** so Epic 9's settings exist (Q3); add the `settings` merge rule and a haptics toggle (Q9, U5).
6. **Fix 10.7's schema** (a per-player table) and **10.6's storage and limits** (Q8, Q11).
7. **Pick BU-1** and add 10.10's quick-tile edge cases (Q10, U2); mark 10.10 blocked until then.
8. **Run a short `gds-ux` pass** before 9.7/10.10 to pin the HUD map, Results and Settings layouts (U1–U6).
9. Optional hygiene: add "Superseded by …" lines to the done stories listed in Q17.

### Final Note

This assessment found **37 issues across 4 categories**: 4 inventory-drift items (D1–D4), 6 GDD inconsistencies (G1–G6), 6 UX gaps (U1–U6) and 21 epic/story quality findings (Q1–Q21: 5 critical/high, 8 major, 8 minor). No requirement is missing. The risk is concentrated in the stories still to come: the photoreal pass, Epic 10's data stories, 8.11 and Random city. Address the critical items before building those stories; the rest can be fixed as they come up, or you can choose to proceed as-is.

*Assessor: GDS implementation-readiness workflow (Game Producer / Scrum Master role), 2026-11-25. Inputs read in full: `gdd.md`, `epics.md` (all 141 stories), relevant sections of `game-architecture.md`, `sprint-status.yaml`, and spot checks of `packages/shared` balance JSON and code.*

## 7. Fixes applied (2026-11-25, same session)

Designer decisions taken for this pass: **Q2** a saved Random city run from an older generator is shown as "This city is from an older version" with Delete only; **Q12** a Random city extraction grants the "first extraction" milestone (M2) but not District 2; **Q3** Story 10.1 is built before 9.5, 9.6 and 9.8.

**Corrections to this report:** Q10/U2 were partly wrong. The 10.10 story file already records BU-1 = **B** (designer, 2026-11-25), and BU-5 covers the quick tile before the first placement; only `epics.md` and a comment in `sprint-status.yaml` were stale. Q5 was also mostly covered: the 8.11 story file already has strict decoding (F2) and a `NET_PROTOCOL_VERSION` bump. Only the `epics.md` AC and the architecture's "clients never send binary" line lagged.

| Finding | Fixed in |
|---|---|
| D1–D4, Q19 | `epics.md` FR31, FR45, FR48, FR52, FR78, Story 7.2 |
| G1–G6 | `gdd.md` (economy join money, solo boss wording, 150–700, header date, Build button in *Controls*, wave 10 clear before the helicopter); Supplies table gains endless Behemoths |
| Q1, Q2, Q12, Q20, Q21 | `epics.md` 11.1, 11.2, 11.6, 11.7, FR94; `gdd.md` *Level Types*/*Pacing*; architecture ADR-06 |
| Q3 | `epics.md` epic order line, Epic 9 intro, 9.5, 9.6, 9.8, 10.1; `sprint-status.yaml` comments |
| Q4, Q7 | `epics.md` 9.14 (silhouettes for every standing prop, drawn top vs collision, decay and event states, FPS/memory) |
| Q5 | `epics.md` 8.11; architecture input hardening |
| Q6 | `epics.md` 9.13 and story file AC 9 (blackout eyes, holds, memory, scope to 9.3/9.4/9.5); heading now "(in progress)" |
| Q8, Q9, Q11 | `epics.md` 10.7, 10.1, 10.6; architecture tables and settings row |
| Q10, U2 | `epics.md` 10.10 (B recorded, quick-tile fallback rules); 10.10 story file completion note |
| Q13, Q14 | `epics.md` Additional Requirements (resume by anyone, 600 ms rewind, Network-pass stream changes); Epic 5/6 headings |
| Q15 | 9.13 heading |
| Q17 | "Current rule" notes on Stories 2.3, 2.8, 3.2, 3.4, 4.2, 4.5, 5.2, 5.3, 5.5, 5.9, 5.11, 5.12, 6.1, 8.6 |
| Q18 | `epics.md` 10.8 reworded to "re-check" |
| U1 | `ux-spec.md` note, 9.7 build cluster, UX Design Requirements line |
| U3 | 8.7 (no minimap) |
| U4 | 9.7 Results layout AC |
| U5 | 10.1 haptics toggle |
| U6 | 10.9 first-time build-phase observation; GDD open item |
| Epic 10 NFR line | NFR3, NFR9 added |

**Designer follow-ups:** the 10.10 BU-1 lines (story file opening line, task checkbox, sprint-status comment) were updated to B with the designer's go-ahead. The recommended `gds-ux` pass is a separate workflow and was not run.

## 8. Re-check after merging master (2026-11-25, end of session)

Master had built 8.11 ([PR #19](https://github.com/Seven74AI/topdown-shooter/pull/19)), 9.13 ([PR #16](https://github.com/Seven74AI/topdown-shooter/pull/16)) and 10.10 ([PR #20](https://github.com/Seven74AI/topdown-shooter/pull/20)) during this session, plus two fixes ([PR #18](https://github.com/Seven74AI/topdown-shooter/pull/18), [PR #21](https://github.com/Seven74AI/topdown-shooter/pull/21)). Checked against the planning docs:

- **Balance JSON** unchanged: solo 0.35, wave bonus 15 × N, start 200, armor II 300, revive 2 m. Matches the fixed FRs.
- **8.11** built with strict binary decoding and a protocol version check; the architecture already describes it. Consistent.
- **10.10** built as B; its B9 rule ("last confirmed `building.placed`, reset per run, unlocked fallback") matches the epics AC. New: 5.16 and 5.20 got "Current rule" notes (grid replaced; ↶ moved to one fixed spot, 10.10-B2/B15).
- **9.13** done; memory was measured (`docs/perf/epic-9-characters.md` › Memory, 83–111 MB JS heap headless). Heading and AC updated; the real-iPhone NFR2 check stays with 10.3. The follow-up AC 9 in the story file was re-ordered after AC 8 and marked as a post-build check.
- **9.14 story file** (written on master) differs from what this report assumed: props ship as a **pre-rendered image atlas** (B1), and only the sawhorse police lines stand; cars and the bus stay flat. The epics 9.14 ACs from §7 were rewritten to match, and the art rule in the GDD (*Production*), FR82 and *Additional Requirements › Assets* now names this exception. The architecture's asset-loading row is left to the 9.14 builder (its AC 2 updates it).

No other new inconsistencies found.
