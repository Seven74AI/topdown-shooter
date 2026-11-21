---
stepsCompleted: [step-01-document-discovery, step-02-gdd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
documentsIncluded:
  gdd: gdds/gdd-topdown-shooter-2026-11-21/gdd.md
  gddEpicOverview: gdds/gdd-topdown-shooter-2026-11-21/epics.md
  architecture: game-architecture.md
  epics: epics.md
  ux: null
  supporting:
    - briefs/brief-topdown-shooter-2026-11-21/brief.md
    - gdds/gdd-topdown-shooter-2026-11-21/decision-log.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-11-21
**Project:** topdown-shooter

## Document Inventory

| Type | File | Size |
| --- | --- | --- |
| GDD | `gdds/gdd-topdown-shooter-2026-11-21/gdd.md` | 31.5 KB |
| GDD epic overview | `gdds/gdd-topdown-shooter-2026-11-21/epics.md` | 8.1 KB |
| Architecture | `game-architecture.md` | 46.7 KB |
| Epics & stories | `epics.md` | 119.7 KB |
| UX design | none | — |

**Duplicates:** none in whole-vs-sharded form. The GDD folder's `epics.md` is the GDD's high-level epic overview; the root `epics.md` (100 stories) is the authoritative breakdown.

**Missing:** no standalone UX/HUD spec. UX requirements will be checked against the GDD and the epics instead.

## GDD Analysis

The GDD (`gdd.md`, final v1.0) was read in full. The requirements inventory in `epics.md` was checked line by line against it: every mechanic, number and rule in the GDD appears in it, and its numbering is reused below so both documents share one set of IDs.

### Functional Requirements

FR1: The game runs in landscape only; in portrait a "rotate your phone" overlay is shown.  
FR2: A floating move joystick appears where the thumb lands on the left half of the screen (dead zone 10%, full speed at 100% deflection).  
FR3: A floating aim joystick on the right half aims past a 30% dead zone; the equipped weapon fires automatically while aiming.  
FR4: On touch, projectiles bend up to 8° toward the nearest zombie inside the aim cone; aim assist is off for mouse aim.  
FR5: A swap button near the right thumb switches between the 2 weapon slots in 0.3 s.  
FR6: Guns reload automatically when the magazine is empty; reserve ammo is unlimited.  
FR7: Desktop fallback: WASD to move, mouse to aim, hold left click to fire, Q to swap.  
FR8: A consumable button uses the single quick-use slot (medkit, grenades, molotovs).  
FR9: A player has 100 HP, radius 0.4 m and move speed 4.5 m/s; zombies in contact hit once per second; no regeneration during a wave; each build phase heals 50% of max HP.  
FR10: At 0 HP a player is downed; a teammate standing next to them for 3 s revives them; after 20 s without revive they are out until the next build phase, when they return automatically.  
FR11: The run is lost when no player is standing (everyone downed or out).  
FR12: Each player carries 2 weapon slots in any combination; a run starts with a Pistol and 100 currency.  
FR13: The 10 weapons (Pistol, Machete, Fire Axe, Chainsaw, Shotgun, Flamethrower, SMG, Assault Rifle, Hunting Rifle, Grenade Launcher) behave per the GDD weapon table (damage, rate, range/arc, magazine, reload, price).  
FR14: Shots are visible travelling projectiles (bullets ~60 m/s, grenades lobbed); melee hits every zombie inside its arc instantly.  
FR15: Each gun has a fixed spread; there is no recoil climb, no movement penalty, and no critical hits or weak points.  
FR16: Weapon specials work: knockback (Fire Axe 1.5 m, Shotgun 0.5 m), Hunting Rifle pierces 5 zombies, Flamethrower ignites (+3 dmg/s for 3 s), Chainsaw slows its wielder 20%, Grenade Launcher hurts the shooter at 50%.  
FR17: Weapons upgrade from level I to IV in the shop; each level adds +25% damage; each level costs 60% of the weapon's base price.  
FR18: Friendly fire is off for bullets and melee and on at 50% for explosions and fire (grenade launcher, flamethrower burn, Bloater gas, molotovs).  
FR19: Every hit flashes the zombie and pushes it back; heavy weapons (axe, hunting rifle, grenade launcher) add a short screen shake.  
FR20: Walker: 10 HP, 1.2 m/s, 10 per hit, walks straight at the nearest player, reward 2.  
FR21: Runner: 6 HP, 4.0 m/s, 8 per hit, takes a flanking path around the front line, reward 3.  
FR22: Crawler: 8 HP, 0.7 m/s, 12 per hit, low silhouette, bite slows the player 30% for 1 s, leaves a blood trail, reward 3.  
FR23: Spitter: 12 HP, 1.5 m/s, stops at 6 m, spits every 3 s for 15 after a 0.6 s glowing-mouth telegraph, leaves an acid puddle (3 s, 5 dmg/s), reward 5.  
FR24: Bloater: 25 HP, 0.9 m/s, explodes on death or after a 1 s swell when touching a player; 2.5 m blast, 30 damage to players, 40 to zombies; gas cloud slows for 4 s; reward 6.  
FR25: Brute: 120 HP, 1.0 m/s, 35 per hit + 1.5 m knockback, 3× damage to buildings, barely affected by knockback, reward 25.  
FR26: Zombies chase the nearest player, route around cover and obstacles, keep crowd separation, and attack any building blocking their path.  
FR27: Zombie stats never change with waves; only counts, mix and spawn pressure grow.  
FR28: Wave size (4 players) grows from ≈ 40 zombies in wave 1 by ≈ 40 per wave to ≈ 400 in wave 10, with at most 150 alive at once; the rest queue at spawn points.  
FR29: Zombie types are introduced in order: W1 Walkers · W2 +Runners · W3 +Crawlers · W4 +Spitters · W5 first Brute · W6 +Bloaters · W7–9 full mix · W10 finale.  
FR30: A wave ends when all its zombies are dead; when 5 remain they are marked on screen and rush the players.  
FR31: Zombie count and boss HP scale by player count: × 0.6 (2 players), × 0.8 (3), × 1.0 (4); a mid-run join rescales from the next wave.  
FR32: Zombies spawn at district edges (alleys, manholes, broken shop windows); decay opens more spawn points.  
FR33: The Behemoth arrives mid-wave 10 with the horde still active: radius 2 m, 1.3 m/s, immune to knockback, 6,000 HP at 4 players (scaled by player count).  
FR34: Behemoth attacks with telegraphs: ground slam (1.2 s, 4 m radius, 40 dmg), charge (1.0 s, 10 m line, 30 dmg, destroys buildings in its path), throw (1 s, picks up a wreck or rubble, 3 m impact, 35 dmg).  
FR35: At 50% HP the Behemoth enrages: +30% speed, attack cooldowns −30%, a Crawler drops off its back every 4 s.  
FR36: The Behemoth's death calls the evacuation helicopter.  
FR37: 1–2 random special events happen per run in waves 3–9, never in the same wave as the first Brute.  
FR38: Car alarm: draws all zombies within 15 m toward the car for 15 s.  
FR39: Gas leak: a tank hisses for 10 s then explodes (6 m radius, kills zombies, 60 damage to players).  
FR40: Supply drop: a crate lands at a random spot; the first player to reach it gets a rare weapon.  
FR41: Stampede: a mass of Runners crosses the map in one direction for 10 s.  
FR42: Power failure: the current wave becomes a blackout wave.  
FR43: Survivor: an NPC appears and must be escorted to a safe point for a big reward.  
FR44: A 30 s build phase opens the run and follows every wave; it ends early when every player taps Ready.  
FR45: Each player has a personal wallet, earning kill rewards per zombie type, 50% of the reward for an assist, +25 per revive, 50% of the reward for kills by their own buildings, and a wave-clear bonus of 10 × wave number paid to every player (including downed and out players).  
FR46: The shop always offers all unlocked buildings and consumables, repairs, and upgrades for weapons the player owns.  
FR47: Each build phase, each player sees their own 6 random weapon and gear cards drawn from their unlocked pool, with at least 1 weapon and 1 gear card; reroll costs 20.  
FR48: Gear lasts the run: Body armor I/II (+25/+50 max HP, 150/350), Running shoes (+10% speed, 150), Revive kit (revive 3 s → 1.5 s, 150), Tactical flashlight (wider, longer cone in blackout, 120).  
FR49: Consumables use one slot: Medkit (heals 50, 60), Grenades ×3 (40 dmg, 2.5 m, 80), Molotovs ×2 (3 m fire zone for 4 s, 8 dmg/s, 100).  
FR50: In a build phase, a player taps a building in the shop, then taps the ground to place it on a 1 m grid and drags to rotate; placement is refused where blocked.  
FR51: Buildings persist until destroyed, can be repaired in a build phase for 50% of their price, and are capped at 6 per player.  
FR52: Building behaviors per the GDD table: Wood barricade (2 m wall, 200 HP, 40), Metal barricade upgrade (600 HP, +120), Auto-turret (nearest zombie within 8 m, 3 dmg × 5/s, 300 HP, 250), Spike trap (2 × 2 m, 4 dmg/s and −40% speed, 300 HP, 80), Mine (proximity, 80 dmg in 2.5 m, single use, 60), Floodlight (8 m light circle, 150 HP, 100), Med station (heals players within 2 m by 5 HP/s, 300 HP, 400).  
FR53: Barricades block zombies and players but not bullets; zombies attack buildings blocking their path; fires damage buildings inside them; rubble blocks placement; the Behemoth's charge destroys buildings.  
FR54: Downtown (~48 × 32 m) is hand-made: central intersection, 2–3 alleys, gas station corner, crashed city bus, small parking lot, spawn points at the edges.  
FR55: Each player's camera follows them, showing about 24 × 13.5 m; teammates off screen are shown by edge arrows; each player has a colored ground ring (blue, orange, green, purple).  
FR56: Cars, bus, barriers and sandbags block movement for players and zombies; bullets pass over barriers and sandbags but not cars or the bus.  
FR57: Hazards damage or slow what is inside them: fire zones (10 dmg/s to everything), acid puddles, gas leak, Bloater gas.  
FR58: The district advances one decay stage every 2 waves; stage changes apply only at the start of a build phase, and buildings on newly blocked cells are destroyed with a 50% refund.  
FR59: Stage 1 Evening (waves 1–2): open map, full lighting, parked cars along curbs, lit shops.  
FR60: Stage 2 Panic (waves 3–4): 4 cars move into the road (new cover and choke points); police barriers block some paths.  
FR61: Stage 3 Breakdown (waves 5–6): 2 car fires (2 m fire zones lasting 2 waves); free sandbag cover appears; rain begins.  
FR62: Stage 4 Ruins (waves 7–8): rubble closes one alley and blocks paths; streetlights flicker; collapsed walls open new spawn points.  
FR63: Stage 5 Collapse (waves 9–10): power out; wave 9 is a blackout wave; fog limits vision to 10 m; wave 10 is lit only by fires and floodlights.  
FR64: In blackout, darkness covers the map except flashlight cones (aim direction), floodlights, fires and muzzle flashes; zombie eyes show through the dark.  
FR65: Each run has a seed that drives its random choices (which cars burn, which alley collapses, events, shop cards), so a run can be reproduced.  
FR66: After the Behemoth dies, the team votes for 15 s: majority wins; a tie or no votes means extract.  
FR67: Extract wins the run and keeps all rewards; Stay starts endless waves in the collapsed city.  
FR68: Endless: blackout every other wave, +40 zombies per wave (still max 150 alive), +1 Brute per wave, a Behemoth every 5th wave before each evacuation vote (15, 20, 25…); a wipe before extracting loses rewards earned after wave 10.  
FR69: The host picks a district and gets a share link and a 4-letter code; 2–4 players join, tap Ready, and the host starts.  
FR70: Players can play immediately as a guest with only a name.  
FR71: All players see the same horde and the server decides hits; your own movement, aiming and muzzle flash respond instantly on your device.  
FR72: Players can join mid-run during build phases only, starting with the team's average currency.  
FR73: A disconnected player's character is removed safely; they can rejoin within 2 minutes with wallet and gear intact.  
FR74: If the host leaves, host migrates to another player (the longest-connected).  
FR75: During a build phase the host can Save and quit; the server keeps the run 7 days, and any group that includes the host can resume it.  
FR76: A ping button offers 4 quick messages (Help! · Over here · Brute! · Ready), each showing an icon on teammates' screens and edge arrows.  
FR77: A guest can upgrade to an account later and keep their progress.  
FR78: Supplies are earned per run, even on a loss: +10 per wave survived, +50 for killing the Behemoth, +100 for extracting, +20 per endless wave (kept only if the team extracts).  
FR79: New players start with the starter pool (Pistol, Machete, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Wood barricade, Auto-turret, Medkit, Grenades); other items are unlocked with Supplies on an unlock screen at the GDD prices, and unlocks add cards to that player's shop deck.  
FR80: Training offers 4 capped boosts with 5 levels each (max HP up to +10%, damage up to +5%, starting currency 100 → 150, reload speed up to +5%), each level costing 50 × level Supplies.  
FR81: District 2 unlocks after the first extraction from Downtown (rule only; district 2 content is out of v1).  
FR82: Dead City art: gritty, realistic, rainy night city; zombies read as people from above; each zombie type has a distinct silhouette; the district has 5 visual decay states.  
FR83: Gore: heavy hits (axe, chainsaw, shotgun, explosions) dismember zombies, explosive kills burst them apart, and blood stays on the ground for the wave; a gore toggle switches to blood only.  
FR84: Every special attack has a readable visual and audio warning; each special zombie has a signature sound (Spitter gurgle, Bloater swelling, Brute roar, Runner shriek).  
FR85: Ambience follows the decay stage (5 loops); music intensity follows the number of zombies alive; a calmer build-phase track and a dedicated Behemoth track.  
FR86: Each weapon has distinct firing and reload sounds; reloads are clearly audible.  
FR87: Quality settings can lower or turn off rain, fog visuals, screen shake, film grain and light glow, plus the gore toggle; blackout darkness and the 10 m fog vision limit cannot be turned off.  
FR88: The game records simple run stats (district, wave reached, extracted, loadouts per player) for the success metrics.  

**Total FRs: 88**

### Non-Functional Requirements

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

**Total NFRs: 14**

### Additional Requirements

- Architecture constraints (monorepo, engine-free shared simulation at 20 Hz, seeded PRNG streams, zod-validated balance JSON, Colyseus room/state machine, binary horde stream, flow fields, Tiled decay layers, PostgreSQL + Drizzle, Docker Compose + Caddy on the VPS, security limits, logging, debug tools, client budgets) are listed under "Additional Requirements" in `epics.md` and are reflected in story acceptance criteria.
- Sequencing constraints from the GDD: fixed-list shop in Epic 3 and card shop in Epic 5; Milestone 1 = Epics 1–4; melee playtest in Epic 1; placeholder art until Epic 9.
- External dependencies: VPS subdomain + deploy key (before Story 2.2), GitHub Pages availability (Story 1.1), reference phones for performance stories, hired artist and sound designer (Epic 9).

### GDD Completeness Assessment

The GDD is complete and unusually precise: nearly every mechanic has numbers. A few values are not specified in the GDD and were set by the stories. They are reasonable but are design decisions the designer should know about:

| Value | Set in story | Value chosen |
| --- | --- | --- |
| HP after revive, revive range | 2.8 | 30% max HP, 1.2 m |
| Default flashlight cone (no gear) / Tactical flashlight | 6.3 | 60° × 8 m / 80° × 12 m |
| Survivor escort reward | 6.10 | +100 currency to every player |
| Supply-drop "rare weapon" | 6.9 | Flamethrower, Grenade Launcher, Chainsaw or AR at level II, into the active slot |
| Mine trigger distance | 5.9 | 1 m |
| Grenade (consumable) throw range | 5.12 | 8 m |
| Event timing in a wave | 6.8 | 20–60% of the wave's spawns |
| Behemoth arrival | 6.5 | when half of wave 10 has spawned |

Small GDD/story wording differences (not defects): wave 10 lighting includes flashlights in Story 6.4 (the GDD says "fires and floodlights"; flashlights are always on, so the story is the sensible reading); Story 10.1 adds an aim-assist toggle and Story 5.12 an `E` key, neither in the GDD.


## Epic Coverage Validation

### Coverage Matrix

The coverage map in `epics.md` was verified against the story acceptance criteria themselves, not just the map. Story references below are where each FR is actually implemented.

| FR | Requirement (short) | Stories | Status |
| --- | --- | --- | --- |
| FR1 | The game runs in landscape only; in portrait a "rotate your phone" overlay is shown. | 1.1 | ✓ |
| FR2 | A floating move joystick appears where the thumb lands on the left half of the screen… | 1.3 | ✓ |
| FR3 | A floating aim joystick on the right half aims past a 30% dead zone; the equipped… | 1.5 | ✓ |
| FR4 | On touch, projectiles bend up to 8° toward the nearest zombie inside the aim cone; aim… | 1.6, 2.7 | ✓ |
| FR5 | A swap button near the right thumb switches between the 2 weapon slots in 0.3 s. | 1.8 | ✓ |
| FR6 | Guns reload automatically when the magazine is empty; reserve ammo is unlimited. | 1.5 | ✓ |
| FR7 | Desktop fallback: WASD to move, mouse to aim, hold left click to fire, Q to swap. | 1.10 | ✓ |
| FR8 | A consumable button uses the single quick-use slot (medkit, grenades, molotovs). | 5.12 | ✓ |
| FR9 | A player has 100 HP, radius 0.4 m and move speed 4.5 m/s; zombies in contact hit once… | 1.4, 3.1 | ✓ |
| FR10 | At 0 HP a player is downed; a teammate standing next to them for 3 s revives them;… | 2.8, 3.1 | ✓ |
| FR11 | The run is lost when no player is standing (everyone downed or out). | 2.8 | ✓ |
| FR12 | Each player carries 2 weapon slots in any combination; a run starts with a Pistol and… | 1.8, 3.2 | ✓ |
| FR13 | The 10 weapons (Pistol, Machete, Fire Axe, Chainsaw, Shotgun, Flamethrower, SMG,… | 1.5, 1.8, 1.9, 5.2–5.5 | ✓ |
| FR14 | Shots are visible travelling projectiles (bullets ~60 m/s, grenades lobbed); melee… | 1.5, 1.9, 5.5 | ✓ |
| FR15 | Each gun has a fixed spread; there is no recoil climb, no movement penalty, and no… | 1.5 | ✓ |
| FR16 | Weapon specials work: knockback (Fire Axe 1.5 m, Shotgun 0.5 m), Hunting Rifle pierces… | 1.8, 5.2–5.4 | ✓ |
| FR17 | Weapons upgrade from level I to IV in the shop; each level adds +25% damage; each… | 5.1 | ✓ |
| FR18 | Friendly fire is off for bullets and melee and on at 50% for explosions and fire… | 5.4, 5.5, 5.12 | ✓ |
| FR19 | Every hit flashes the zombie and pushes it back; heavy weapons (axe, hunting rifle,… | 1.5, 1.8, 1.9, 5.2 | ✓ |
| FR20 | Walker: 10 HP, 1.2 m/s, 10 per hit, walks straight at the nearest player, reward 2. | 1.4 | ✓ |
| FR21 | Runner: 6 HP, 4.0 m/s, 8 per hit, takes a flanking path around the front line, reward 3. | 3.8 | ✓ |
| FR22 | Crawler: 8 HP, 0.7 m/s, 12 per hit, low silhouette, bite slows the player 30% for 1 s,… | 3.9 | ✓ |
| FR23 | Spitter: 12 HP, 1.5 m/s, stops at 6 m, spits every 3 s for 15 after a 0.6 s… | 5.6 | ✓ |
| FR24 | Bloater: 25 HP, 0.9 m/s, explodes on death or after a 1 s swell when touching a… | 5.8 | ✓ |
| FR25 | Brute: 120 HP, 1.0 m/s, 35 per hit + 1.5 m knockback, 3× damage to buildings, barely… | 5.7 | ✓ |
| FR26 | Zombies chase the nearest player, route around cover and obstacles, keep crowd… | 1.4, 3.5, 4.2 | ✓ |
| FR27 | Zombie stats never change with waves; only counts, mix and spawn pressure grow. | 1.4 | ✓ |
| FR28 | Wave size (4 players) grows from ≈ 40 zombies in wave 1 by ≈ 40 per wave to ≈ 400 in… | 1.7, 3.10, 6.1 | ✓ |
| FR29 | Zombie types are introduced in order: W1 Walkers · W2 +Runners · W3 +Crawlers · W4… | 3.10, 5.6–5.8, 6.1 | ✓ |
| FR30 | A wave ends when all its zombies are dead; when 5 remain they are marked on screen and… | 1.7 | ✓ |
| FR31 | Zombie count and boss HP scale by player count: × 0.6 (2 players), × 0.8 (3), × 1.0… | 3.10, 6.5, 8.2 | ✓ |
| FR32 | Zombies spawn at district edges (alleys, manholes, broken shop windows); decay opens… | 4.3, 6.2 | ✓ |
| FR33 | The Behemoth arrives mid-wave 10 with the horde still active: radius 2 m, 1.3 m/s,… | 6.5 | ✓ |
| FR34 | Behemoth attacks with telegraphs: ground slam (1.2 s, 4 m radius, 40 dmg), charge (1.0… | 6.5, 6.6 | ✓ |
| FR35 | At 50% HP the Behemoth enrages: +30% speed, attack cooldowns −30%, a Crawler drops off… | 6.7 | ✓ |
| FR36 | The Behemoth's death calls the evacuation helicopter. | 6.7 | ✓ |
| FR37 | 1–2 random special events happen per run in waves 3–9, never in the same wave as the… | 6.8 | ✓ |
| FR38 | Car alarm: draws all zombies within 15 m toward the car for 15 s. | 6.8 | ✓ |
| FR39 | Gas leak: a tank hisses for 10 s then explodes (6 m radius, kills zombies, 60 damage… | 6.9 | ✓ |
| FR40 | Supply drop: a crate lands at a random spot; the first player to reach it gets a rare… | 6.9 | ✓ |
| FR41 | Stampede: a mass of Runners crosses the map in one direction for 10 s. | 6.8 | ✓ |
| FR42 | Power failure: the current wave becomes a blackout wave. | 6.10 | ✓ |
| FR43 | Survivor: an NPC appears and must be escorted to a safe point for a big reward. | 6.10 | ✓ |
| FR44 | A 30 s build phase opens the run and follows every wave; it ends early when every… | 3.1 | ✓ |
| FR45 | Each player has a personal wallet, earning kill rewards per zombie type, 50% of the… | 3.2, 3.6 | ✓ |
| FR46 | The shop always offers all unlocked buildings and consumables, repairs, and upgrades… | 3.3, 5.1, 5.13 | ✓ |
| FR47 | Each build phase, each player sees their own 6 random weapon and gear cards drawn from… | 5.13, 7.4 | ✓ |
| FR48 | Gear lasts the run: Body armor I/II (+25/+50 max HP, 150/350), Running shoes (+10%… | 5.11 | ✓ |
| FR49 | Consumables use one slot: Medkit (heals 50, 60), Grenades ×3 (40 dmg, 2.5 m, 80),… | 5.12 | ✓ |
| FR50 | In a build phase, a player taps a building in the shop, then taps the ground to place… | 3.4 | ✓ |
| FR51 | Buildings persist until destroyed, can be repaired in a build phase for 50% of their… | 3.4, 3.6, 3.7 | ✓ |
| FR52 | Building behaviors per the GDD table: Wood barricade (2 m wall, 200 HP, 40), Metal… | 3.4, 3.6, 5.9, 5.10 | ✓ |
| FR53 | Barricades block zombies and players but not bullets; zombies attack buildings… | 3.4, 3.5, 4.8, 6.2, 6.6 | ✓ |
| FR54 | Downtown (~48 × 32 m) is hand-made: central intersection, 2–3 alleys, gas station… | 4.1 | ✓ |
| FR55 | Each player's camera follows them, showing about 24 × 13.5 m; teammates off screen are… | 1.3, 2.9 | ✓ |
| FR56 | Cars, bus, barriers and sandbags block movement for players and zombies; bullets pass… | 4.2 | ✓ |
| FR57 | Hazards damage or slow what is inside them: fire zones (10 dmg/s to everything), acid… | 4.8, 5.6, 5.8, 6.9 | ✓ |
| FR58 | The district advances one decay stage every 2 waves; stage changes apply only at the… | 4.5 | ✓ |
| FR59 | Stage 1 Evening (waves 1–2): open map, full lighting, parked cars along curbs, lit shops. | 4.6 | ✓ |
| FR60 | Stage 2 Panic (waves 3–4): 4 cars move into the road (new cover and choke points);… | 4.7 | ✓ |
| FR61 | Stage 3 Breakdown (waves 5–6): 2 car fires (2 m fire zones lasting 2 waves); free… | 4.8 | ✓ |
| FR62 | Stage 4 Ruins (waves 7–8): rubble closes one alley and blocks paths; streetlights… | 6.2 | ✓ |
| FR63 | Stage 5 Collapse (waves 9–10): power out; wave 9 is a blackout wave; fog limits vision… | 6.4 | ✓ |
| FR64 | In blackout, darkness covers the map except flashlight cones (aim direction),… | 6.3 | ✓ |
| FR65 | Each run has a seed that drives its random choices (which cars burn, which alley… | 4.4 | ✓ |
| FR66 | After the Behemoth dies, the team votes for 15 s: majority wins; a tie or no votes… | 6.11 | ✓ |
| FR67 | Extract wins the run and keeps all rewards; Stay starts endless waves in the collapsed… | 6.11, 6.12 | ✓ |
| FR68 | Endless: blackout every other wave, +40 zombies per wave (still max 150 alive), +1… | 6.12 | ✓ |
| FR69 | The host picks a district and gets a share link and a 4-letter code; 2–4 players join,… | 2.1, 2.3, 7.7 | ✓ |
| FR70 | Players can play immediately as a guest with only a name. | 2.3 | ✓ |
| FR71 | All players see the same horde and the server decides hits; your own movement, aiming… | 2.4–2.7 | ✓ |
| FR72 | Players can join mid-run during build phases only, starting with the team's average… | 8.2 | ✓ |
| FR73 | A disconnected player's character is removed safely; they can rejoin within 2 minutes… | 8.1 | ✓ |
| FR74 | If the host leaves, host migrates to another player (the longest-connected). | 8.3 | ✓ |
| FR75 | During a build phase the host can Save and quit; the server keeps the run 7 days, and… | 8.5, 8.6 | ✓ |
| FR76 | A ping button offers 4 quick messages (Help! · Over here · Brute! · Ready), each… | 8.7 | ✓ |
| FR77 | A guest can upgrade to an account later and keep their progress. | 7.6 | ✓ |
| FR78 | Supplies are earned per run, even on a loss: +10 per wave survived, +50 for killing… | 7.2 | ✓ |
| FR79 | New players start with the starter pool (Pistol, Machete, Shotgun, SMG, Hunting Rifle,… | 7.3, 7.4 | ✓ |
| FR80 | Training offers 4 capped boosts with 5 levels each (max HP up to +10%, damage up to… | 7.5 | ✓ |
| FR81 | District 2 unlocks after the first extraction from Downtown (rule only; district 2… | 7.7 | ✓ |
| FR82 | Dead City art: gritty, realistic, rainy night city; zombies read as people from above;… | 4.9, 9.2–9.4 | ✓ |
| FR83 | Gore: heavy hits (axe, chainsaw, shotgun, explosions) dismember zombies, explosive… | 9.5 | ✓ |
| FR84 | Every special attack has a readable visual and audio warning; each special zombie has… | 5.6–5.8, 6.5, 6.6, 9.4, 9.10 | ✓ |
| FR85 | Ambience follows the decay stage (5 loops); music intensity follows the number of… | 9.8, 9.9 | ✓ |
| FR86 | Each weapon has distinct firing and reload sounds; reloads are clearly audible. | 1.5, 9.10 | ✓ |
| FR87 | Quality settings can lower or turn off rain, fog visuals, screen shake, film grain and… | 6.3, 6.4, 10.1 | ✓ |
| FR88 | The game records simple run stats (district, wave reached, extracted, loadouts per… | 10.7 | ✓ |

| NFR | Stories | Status |
| --- | --- | --- |
| NFR1 | 1.11, 6.3, 9.2, 9.4, 10.2 | ✓ |
| NFR2 | 10.3 | ✓ |
| NFR3 | 2.6, 2.10, 4.10, 10.9 | ✓ |
| NFR4 | 2.5, 2.10 | ✓ |
| NFR5 | 2.7, 2.10 | ✓ |
| NFR6 | 4.9, 9.9, 10.4 | ✓ |
| NFR7 | 10.3 | ✓ |
| NFR8 | 1.1, 10.5 | ✓ |
| NFR9 | 10.9 | ✓ |
| NFR10 | 1.2, 4.4 | ✓ |
| NFR11 | 2.9, 3.8, 9.4 | ✓ |
| NFR12 | 2.1, 2.2, 2.3, 7.6, 8.7 | ✓ |
| NFR13 | 7.1, 8.4 | ✓ |
| NFR14 | 1.2, 10.8 | ✓ |

### Missing Requirements

None. Every FR and NFR is implemented by at least one story with an acceptance criterion that names it. No story implements something that contradicts the GDD.

### Coverage Statistics

- Total GDD FRs: 88
- FRs covered in stories: 88
- Coverage: **100%** (NFRs: 14/14)


## UX Alignment Assessment

### UX Document Status

**Not found.** This is a player-facing game with many screens (start, lobby, shop, placement, HUD, evac vote, results, unlocks, training, settings). The UX need is real. It is partly covered by the FRs (FR1–FR8, FR30, FR55, FR76, FR87) and by the architecture's UI split: Phaser draws the in-combat HUD, and Preact HTML overlays use `pointer-events: none` except on the active screen. The architecture supports every UI element the stories need.

### Alignment Issues

- **U1: Touch zones vs buttons (major).** The left and right halves of the screen spawn floating sticks (Stories 1.3, 1.5). Buttons also sit in those halves: swap (1.8), consumable (5.12), ping (8.7), Shop and Ready (3.1, 3.3). No acceptance criterion says that a touch starting on a button never spawns a stick, and none says where the buttons go.
- **U2: Placement input in the build phase (major).** Story 3.4 says "tap the item, tap the ground, drag to rotate, confirm". In the build phase, a tap on the left half would spawn the move stick, and a drag competes with the aim stick. The confirm and cancel controls are never defined.
- **U3: No in-run menu (major).** Story 10.1 refers to a "pause menu", Story 8.3 to the host "leaving on purpose" and Story 8.5 to a Save and quit button. No story creates the in-run menu that would hold Leave game, Settings and Save and quit. An online run cannot pause, so "pause menu" is also the wrong name.
- **U4: Minimum sizes arrive late (minor).** The rules "buttons ≥ 44 × 44 px, text ≥ 14 px" appear only in Story 9.7 (Epic 9). Phones are the primary platform, so these rules should apply from Epic 1.

### Warnings

- `epics.md` recommends a `gds-ux` pass "before Epic 9". **Recommendation: hold a short HUD and touch-layout pass before Epic 3**, when the number of buttons grows. Alternatively, fix U1–U4 directly in the stories (see the proposed fixes below), which is enough for v1.

## Epic Quality Review

### Epic structure

| Epic | Player value | Independent of later epics | Notes |
| --- | --- | --- | --- |
| 1 Core combat | ✓ solo fight on a phone | ✓ | 1.1, 1.2 are setup stories "as the designer"; acceptable for greenfield |
| 2 Online co-op | ✓ | ✓ | 2.2 infra story, needed for the 4G test |
| 3 Build & economy | ✓ | ✓ | Fixed shop by design, replaced in 5.13 |
| 4 Downtown & decay | ✓ Milestone 1 | ✓ | |
| 5 Arsenal & bestiary | ✓ | ✓ (with forward hooks, see Q7) | |
| 6 Full run | ✓ | ✓ | |
| 7 Meta-progression | ✓ | ✓ | |
| 8 Resilience | ✓ | ✗ **needs Story 7.1** (see Q1) | |
| 9 Art & audio | ✓ | ✓ | Depends on hired artist and sound designer (external) |
| 10 Polish | ✓ | ✓ | |

Greenfield checks: no starter template. Story 1.1 hand-scaffolds the project, sets up CI and publishes a playable link ✓. Database tables are created by the story that needs them (7.1, 8.4, 10.7) ✓. Acceptance criteria are Given/When/Then, testable and numeric throughout, with error cases ("Not enough money", "Can't build here", "Game not found", "This game is full") ✓. Temporary rules that later stories replace (1.7 pause → 3.1, 2.8 return → 3.1, 3.3 shop → 5.13, 5.8 6-wave run → 6.1) are each explicitly removed by the replacing story ✓.

### 🔴 Critical Violations

None.

### 🟠 Major Issues

- **Q1: Epic 8 needs Story 7.1 (accounts).** Epic 8 says it "can be built before or after Epics 5–7". But Story 8.4's `saved_runs` stores a *host account id*, and Story 8.6 lists saved games for "the host's account" and gives returning players their slot back "by account". Before Story 7.1, a guest exists only in server memory (Story 2.3), so there is no account to link a save to. **Fix:** declare Story 7.1 a prerequisite of Story 8.4 (and drop 8.4's "set up the DB if missing" clause), or schedule Epic 7 before Epic 8. The recommended order already does the latter.
- **Q2: The bots in Stories 3.10 and 6.1 can't play.** Both stories check the economy with "a full run with 4 bots", but Story 2.10 only builds bots that *fill a room* for load tests. No story makes bots move, shoot, ready up or buy. **Fix:** add to Story 2.10 (or 3.10) a simple bot policy that runs headless in `shared`: move toward the team centre, aim at the nearest zombie and fire, tap Ready, buy by a fixed script. It is cheap and reusable for balance (10.8).
- **Q3: The stampede acceptance criterion is ambiguous (6.8).** It says "then leaves or keeps fighting", and doesn't say whether stampede Runners count toward the wave end or the last-5 rule. **Fix:** stampede Runners leave by the far edge after 10 s, and any still alive then join the wave count normally.
- **Q4: U1–U3 from the UX section** (touch zones, placement input, in-run menu). U3 needs a new story.
- **Q5: External blockers.** Story 1.1 needs GitHub Pages enabled (the repo is private, so this needs a paid plan or a public repo). Story 2.2 needs the subdomain name and a VPS deploy key. Neither is a document defect, but both stop the sprint if left until the day.

### 🟡 Minor Concerns

- **Q6:** The GDD's sequencing note says Epic 8 can start after Epic 3. `epics.md` says after Epic 4, because Epic 8 needs the seed streams and the decay engine. `epics.md` is right; update the GDD note.
- **Q7:** Items with no effect until a later epic. The floodlight (5.10) and the Tactical flashlight (5.11) can be bought in Epic 5 but only matter once blackout exists in Epic 6. Acceptable for a dev build, but take them out of the shop until Story 6.3.
- **Q8:** Downed players: no story says whether zombies keep attacking them. **Proposal:** zombies ignore downed players and go for the nearest standing one (Story 2.8).
- **Q9:** Buildings of a player who leaves: no story says whether they stay. **Proposal:** they stay until destroyed and no longer pay rewards (Stories 8.1, 8.3).
- **Q10:** Desktop has no ping key (Story 8.7). **Proposal:** the `F` key opens the ping wheel.
- **Q11:** Reference phones: Stories 1.11, 10.2 and 10.3 need an iPhone 12, a Pixel 5 and a Galaxy A52 class. Confirm which phones the group actually owns and record them as the reference set.
- **Q12:** Human-only stories (playtests 1.12, 4.10, 10.9; asset spec 9.1; all of Epic 9 depends on the hires). Mark them in sprint tracking so the dev agent doesn't try to "implement" a playtest.
- **Q13:** Large stories to split at `gds-create-story` time if needed: 1.1 (scaffold + CI + Pages), 1.2, 2.5, 2.6, 3.5, 4.5, 8.4, 8.6.

## Summary and Recommendations

### Overall Readiness Status

**READY**: Epic 1 can start now. The fixes below are small story edits plus one new story, and should land before Epic 2 (blockers) and Epic 3 (touch/placement UX).

### Critical Issues Requiring Immediate Action

None are critical. The highest-priority items:

1. **Q5:** decide on GitHub Pages for Story 1.1 now, and the subdomain + deploy key before Story 2.2.
2. **Q1:** order Epic 7 before Epic 8 (or make Story 7.1 a prerequisite of Story 8.4).
3. **U1–U3:** add touch-zone and placement-input criteria to Stories 1.8 and 3.4, and a new story "In-run menu: leave game and settings" (proposed as Story 2.11).
4. **Q2:** give the bots a simple play policy, so the economy checks in 3.10 and 6.1 can run.

### Recommended Next Steps

1. Apply the proposed story edits (U1–U4, Q1–Q3, Q7–Q10) to `epics.md` and add Story 2.11.
2. Run `gds-sprint-planning` to generate `sprint-status.yaml`, marking human-only stories (Q12).
3. Resolve Q5 (Pages) before running `gds-create-story` for Story 1.1.

### Final Note

This assessment found **17 issues in 3 categories** (UX alignment 4, epic quality 13: 0 critical, 5 major, 8 minor; U1–U3 are counted under both UX and Q4). Requirement coverage is complete: 88/88 FRs and 14/14 NFRs. Address the major issues before the epics they affect; Epic 1 is not blocked.

_Assessed 2026-11-21 by the implementation readiness workflow (Game Producer / Scrum Master role)._
