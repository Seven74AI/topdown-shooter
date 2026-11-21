---
title: topdown-shooter (working title) — Game Design Document
game_type: shooter (with roguelike run structure and tower-defense building)
platforms: [mobile web browser, desktop web browser]
status: draft
created: 2026-11-21
updated: 2026-11-21
source_brief: ../../briefs/brief-topdown-shooter-2026-11-21/brief.md
---

# topdown-shooter (working title) — Game Design Document

## Executive Summary
### Core Concept
A 2D top-down co-op horde shooter for 2–4 friends, played in a phone browser from a shared link. Over 10 waves the district the players picked decays from a normal evening into total collapse while the horde grows. Between waves the team spends currency on weapons, gear and defenses. Surviving wave 10 wins the run; the team can then push on into endless waves. Unlocks carry over between runs.

**Core fantasy:** *You and your friends hold out together while your city falls around you, one wave at a time.*

### Target Audience
_From brief — to refine._ The designer's friend group: 2–4 players, each on their own phone with an account; sessions of 15–25 minutes per run.

### Unique Selling Points (USPs)
_From brief — to refine._ Online co-op on phones from a link with no install; building between waves; a city that decays over the run and changes how it plays.

## Goals and Context
### Project Goals
_TBD_
### Background and Rationale
_TBD_

## Core Gameplay
### Game Pillars
Each pillar is a decision rule. When a feature or tuning choice is unclear, these settle it.

1. **Horde chaos.** Difficulty comes from **more zombies, not tougher ones**. A single zombie is never a threat; the crowd is. Target: about 150 zombies on screen at once by wave 10. Zombie health does not scale with waves.
2. **Build your stand.** Currency never covers everything, so every build phase is a real choice. Defenses buy time; they never win a wave on their own.
3. **A city that falls.** Every decay stage changes **how the map plays** (cover, paths, light, hazards), not only how it looks.
4. **Better together.** No single build handles every zombie type. A player who wanders off alone feels it. Helping teammates (reviving, covering, combining roles) is core play.

**Cut test:** without horde chaos it is a slow tactical shooter; without building, a pure arena shooter; without decay, wave 1 and wave 10 feel the same; without teamwork, there is no reason to play together.
### Core Gameplay Loop
1. **Build phase (30 s, ends early when every player taps Ready).** Spend your personal currency on weapons, upgrades, gear and buildings. A build phase also opens the run, before wave 1. *(Build your stand)*
2. **Wave.** Twin-stick combat until every zombie in the wave is dead. When 5 remain, they are marked on screen and rush the players, so waves never end in a hunt for stragglers. *(Horde chaos, Better together)*
3. **Earn.** Kills, assists, revives and your buildings' kills fill your wallet. *(Build your stand)*
4. **Decay.** About every 2 waves the district moves one decay stage further, changing cover, paths, light and hazards. *(A city that falls)*
5. Back to 1, with a bigger wave.

**Run timing:** wave 1 ≈ 40 zombies (~1 min); wave 10 ≈ 400 zombies (~3 min), up to 150 on screen at once. Ten waves plus build phases ≈ **20 minutes**.

**Why the hundredth loop still pulls:** each build phase is a different choice (pillar 2), every run's decay changes the map under the team (pillar 3), and unlocks change which items can appear.
### Win/Loss Conditions
- **Loss:** every player is down at the same time. The run ends.
- **Downed state:** a player at 0 HP goes down. A teammate standing next to them for **3 s** revives them. If no one does within **20 s**, they are out until the next build phase, when they return automatically.
- **Win:** survive wave 10. An evacuation helicopter arrives and the team votes:
  - **Extract:** the run is won; all rewards are kept.
  - **Stay:** endless waves in the collapsed city. A new evacuation comes every 5 waves (15, 20, 25…). If the team is wiped before extracting, it loses the rewards earned after wave 10 and keeps everything from waves 1–10.

## Game Mechanics
### Primary Mechanics
_TBD_
### Controls and Input
- **Orientation:** landscape only.
- **Move:** floating joystick on the left half of the screen (appears where the thumb lands; dead zone 10%, full speed at 100%).
- **Aim and fire:** floating joystick on the right half. Pushing past a 30% dead zone aims; the equipped weapon **fires automatically** while aiming.
- **Aim assist:** projectiles bend up to **8°** toward the nearest zombie inside the aim cone. Off on desktop mouse aim.
- **Swap weapon:** button near the right thumb (swap time 0.3 s).
- **Reload:** automatic when the magazine is empty.
- **Desktop (bonus):** WASD to move, mouse to aim, hold left click to fire, Q to swap.
- **Build phase:** tap a shop item, then tap the ground to place a building (grid snap 1 m); drag to rotate. Details in *Buildings and Defenses*.

## Shooter Specific Design
### Weapon Systems
**Units:** distances in meters. The camera shows about **24 m × 13.5 m** in landscape. Player radius 0.4 m, move speed **4.5 m/s**.

**Loadout:** 2 weapon slots, any combination (two melee, a shotgun and a rifle…). A player's role comes only from what they carry.
**Ammo:** unlimited reserve; every gun has a magazine and a reload time. Reloading at the wrong moment is the risk.
**Upgrades:** each weapon has levels **I to IV** bought in the shop; each level adds **+25% damage** (level IV = 175%). Upgrade price = 60% of the weapon's base price per level.

| Weapon | Role | Damage | Rate | Range / area | Special | Mag / reload | Price |
|---|---|---|---|---|---|---|---|
| Pistol | Mid | 5 | 3 /s | 9 m | Starter weapon | 12 / 1.0 s | free |
| Machete | Melee | 12 | 2.5 /s | 1.8 m, 110° arc | Hits every zombie in the arc | — | 150 |
| Fire Axe | Melee | 30 | 1.1 /s | 2.2 m, 140° arc | Knockback 1.5 m | — | 300 |
| Chainsaw | Melee | 6 per tick | 10 ticks/s | 1.5 m, 60° arc | Continuous; wielder moves 20% slower | — | 600 |
| Shotgun | Short | 8 pellets × 4 | 1.2 /s | 5 m, 30° spread | Knockback 0.5 m | 6 / 2.5 s | 250 |
| Flamethrower | Short | 20 /s | continuous | 4 m, 35° cone | Ignites: +3 dmg/s for 3 s | 6 s of fuel / 3.0 s | 700 |
| SMG | Mid | 4 | 12 /s | 8.5 m, 8° spread | — | 40 / 1.6 s | 200 |
| Assault Rifle | Mid-long | 7 | 8 /s | 11 m, 4° spread | — | 30 / 2.0 s | 450 |
| Hunting Rifle | Long | 35 | 1.2 /s | 17 m | Pierces 5 zombies | 5 / 2.5 s | 350 |
| Grenade Launcher | Long | 40 | 0.8 /s | 12 m lob, 2 m blast | Area damage; also hurts the shooter at 50% | 4 / 3.0 s | 800 |

**Feel:** every hit flashes the zombie and pushes it back; heavy weapons (axe, hunting rifle, grenade launcher) add a short screen shake; each weapon has its own firing sound. *(Screen shake is optional in settings.)*
**Balance intent:** melee has the best damage per second but puts you in the crowd; long range is safe but weak against swarms; area weapons are expensive and can hurt teammates and yourself.
### Aiming and Combat Mechanics
- **Aiming:** twin-stick (see Controls), with 8° aim assist on touch.
- **Shots are visible projectiles** that travel (bullets ~60 m/s, grenades lobbed). Melee hits everything inside its arc instantly.
- **Accuracy:** each gun has a fixed spread (table above). No recoil climb, no movement penalty: on a phone, aim should feel reliable.
- **No critical hits or weak points** in v1. Top-down zombies have no readable head; damage is what the table says.
- **Friendly fire:** off for bullets and melee; **on at 50%** for explosions and fire (grenade launcher, flamethrower burn, bloater gas), so area weapons need care.
- **Player health:** 100 HP. Details in *Enemy Design and AI*.
### Enemy Design and AI
**Player health:** 100 HP. Zombies in contact hit once per second. No regeneration during a wave; each build phase heals **50% of max HP**; medkits are sold in the shop.

| Zombie | HP | Speed (m/s) | Damage | Behavior | Reward |
|---|---|---|---|---|---|
| Walker | 10 | 1.2 | 10 / hit | Walks straight at the nearest player | 2 |
| Runner | 6 | 4.0 | 8 / hit | Nearly player speed; paths around the front line to flank | 3 |
| Crawler | 8 | 0.7 | 12 / hit | Low silhouette; a bite slows the player 30% for 1 s | 3 |
| Spitter | 12 | 1.5 | 15 / spit | Stops at 6 m, spits every 3 s; leaves an acid puddle (3 s, 5 dmg/s) | 5 |
| Bloater | 25 | 0.9 | 30 blast | Explodes on death **or** after a 1 s swell when touching a player; 2.5 m blast; also deals 40 to zombies; gas cloud slows for 4 s | 6 |
| Brute | 120 | 1.0 | 35 / hit + 1.5 m knockback | Deals 3× damage to buildings; barely affected by knockback | 25 |

**Telegraphs:** Spitter rears back with a glowing mouth for **0.6 s** before spitting; Bloater swells for **1 s** before a contact explosion; every special attack has a readable warning.
**AI:** zombies chase the nearest player; Runners take a flanking path; Spitters keep their distance; all zombies attack buildings that block their path.
**Introduction order:** W1 Walkers · W2 +Runners · W3 +Crawlers · W4 +Spitters · W5 first Brute (mini-boss moment) · W6 +Bloaters · W7–9 full mix · W10 finale.
**Spawns:** at district edges from alleys, manholes and broken shop windows; decay opens more spawn points (collapsed walls, fallen fences).
**Difficulty scaling:** zombie stats never change with waves (pillar 1); only counts, mix and spawn pressure grow.
**Open roster:** the roster is designed to grow. Candidate types after launch: Screamer (calls extra zombies), Riot zombie (armored from the front), Zombie dog (fast pack hunter).
### Arena and Level Design
**District 1 — Downtown** (~48 m × 32 m, about 2 × 2.5 screens). Hand-made layout:
- **Central intersection:** open kill zone, long sightlines (long-range weapons shine).
- **2–3 alleys:** narrow choke points for barricades and melee.
- **Gas station corner:** hazard area; home of the gas leak event.
- **Crashed city bus:** permanent solid cover mid-map.
- **Small parking lot:** parked cars as obstacles; car alarm event spot.
- **Spawn points** at map edges (alleys, manholes, shop windows); more open with decay.

**Camera:** each player's camera follows them; teammates off screen are shown by edge arrows. Splitting up is allowed but costly (pillar 4).
**Cover:** cars, bus, barriers and sandbags block movement for players and zombies; bullets pass over barriers and sandbags but not cars or the bus.
**Hazards:** fire zones (10 dmg/s to everything), acid puddles, gas leak, Bloater gas.
### Multiplayer Considerations
- **Mode:** online co-op, 2–4 players, each on their own device. No local split-screen.
- **Lobby:** the host picks a district and gets a **share link** and a **4-letter code**; players join, tap Ready, the host starts.
- **Accounts:** play immediately as a **guest** (name only); upgrade to an account later to keep progress.
- **Join mid-run:** allowed during build phases only; the newcomer starts with the team's average currency; the next wave rescales.
- **Disconnects:** a disconnected player's character is removed safely; they can rejoin within **2 minutes** with wallet and gear intact. Host leaving → host migrates to another player.
- **Pause and resume:** during a build phase the host can **Save and quit**; the run is stored on the server for **7 days** and can be resumed by any group that includes the host [ASSUMPTION: host required to resume].
- **Communication:** a ping button with 4 quick messages (Help! · Over here · Brute! · Ready), each showing an icon on teammates' screens and edge arrows. No voice or text chat in v1.
- **Fairness:** all players see the same horde; hits are confirmed by the server so a laggy player cannot see a different fight.
- **Not in v1:** matchmaking with strangers, voice chat, PvP (parked for a later mode).

## Run Structure and Building (roguelike + tower-defense elements)
### Run Structure
- **Pick a district → lobby (2–4 players) → build phase → 10 waves → evacuation vote → extract or endless.**
- A run is ≈ 20 minutes to wave 10.
- **Permadeath is per run:** when the team is wiped, the run ends; meta-progression (see Player Progression) persists.
- **Pause and resume:** the host can pause the run during a build phase; the run state is kept on the server and resumed later by the same group [details in Multiplayer Considerations].
- **Seeds:** every run has a seed that drives its random choices (events, decay variations, shop cards) for reproducible testing.
### Item and Upgrade System
**Roguelike shop.** Each build phase shows:
- **Always available:** all buildings, consumables, repairs, and upgrades for weapons you own.
- **6 random cards** of weapons and gear drawn from the player's **unlocked pool** (each player sees their own cards). **Reroll: 20** currency.

**Gear (permanent for the run):**
| Item | Effect | Price |
|---|---|---|
| Body armor I / II | +25 / +50 max HP | 150 / 350 |
| Running shoes | +10% move speed | 150 |
| Revive kit | Revive time 3 s → 1.5 s | 150 |
| Tactical flashlight | Wider, longer light cone in blackout | 120 |

**Consumables (one slot, used with a button):** Medkit (heals 50) 60 · Grenades ×3 (40 dmg, 2.5 m) 80 · Molotovs ×2 (fire zone 3 m for 4 s, 8 dmg/s) 100.
### Buildings and Defenses
Placed during build phases on a 1 m grid; they persist until destroyed and can be repaired in a build phase for 50% of their price. Zombies attack any building blocking their path. **Cap: 6 buildings per player.**

| Building | Effect | HP | Price |
|---|---|---|---|
| Barricade (wood) | 2 m wall, blocks zombies (players can't pass; bullets pass) | 200 | 40 |
| Metal barricade | Upgrade of a wood barricade | 600 | +120 |
| Auto-turret | Shoots the nearest zombie within 8 m, 3 dmg × 5/s | 300 | 250 |
| Spike trap | 2 × 2 m floor; 4 dmg/s and −40% speed to zombies on it | 300 | 80 |
| Mine | Proximity, 80 damage in 2.5 m, single use | — | 60 |
| Floodlight | Lights an 8 m circle; key in blackout waves | 150 | 100 |
| Med station | Heals players within 2 m by 5 HP/s | 300 | 400 |

**Decay interaction:** fires damage buildings inside them; rubble blocks placement; the Behemoth's charge destroys buildings. Brutes deal 3× damage to buildings.
### Enemy Wave Design
**Wave size (4 players):** wave 1 ≈ 40 zombies, growing by ≈ 40 per wave to ≈ 400 in wave 10; at most ≈ 150 alive at once (the rest queue at spawn points).
**Player-count scaling:** zombie count and boss HP × **0.6** (2 players), **0.8** (3), **1.0** (4). A mid-run join rescales from the next wave. Solo (1 player) is not a target mode [NOTE FOR DESIGNER: solo testing could use × 0.4].

**Wave 10 boss: The Behemoth.** Arrives mid-wave with the horde still active.
- Size 5× a walker (radius 2 m); speed 1.3 m/s; immune to knockback. HP 2,000 at 4 players (scaled).
- **Ground slam:** 1.2 s telegraph (arms raised), 4 m radius, 40 damage.
- **Charge:** 1.0 s telegraph (head lowered), 10 m straight line, 30 damage, destroys buildings in its path.
- **Throw:** picks up a wreck or rubble from the decayed map and throws it at a player (1 s telegraph, 3 m impact, 35 damage).
- **Enrage at 50% HP:** +30% speed, attack cooldowns −30%, Crawlers drop off its back every 4 s.
- Its death calls the evacuation helicopter (extract-or-stay vote).

**Special events:** 1–2 per run, random, in waves 3–9, never in the same wave as the first Brute.
| Event | What happens | Team decision |
|---|---|---|
| Car alarm | A car alarm draws all zombies within 15 m toward the car for 15 s | Use it to pull or bunch the horde |
| Gas leak | A gas tank hisses for 10 s, then explodes: 6 m radius, kills zombies, 60 damage to players | Lure zombies in, stay out |
| Supply drop | A crate lands at a random spot; the first player to reach it gets a rare weapon | Risk the crowd for loot |
| Stampede | A mass of Runners crosses the map in one direction for 10 s | Dodge or hold a line |
| Power failure | Lights die one wave early: a surprise blackout wave | Floodlights and flashlights matter |
| Survivor | An NPC appears and must be escorted to a safe point | Big reward vs. splitting the team |

District-specific events are planned per district later (e.g. hospital quarantine breach).

## Progression and Balance
### Player Progression
**In a run:** weapons, upgrades (I–IV), gear and buildings bought with personal currency; all lost at the end of the run.

**Between runs — Supplies** (account currency, earned even on a loss):
| Source | Supplies |
|---|---|
| Each wave survived | +10 |
| Behemoth killed | +50 |
| Extract (run won) | +100 |
| Each endless wave | +20, kept only if the team extracts |

**Starter pool:** Pistol, Machete, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Wood barricade, Auto-turret, Medkit, Grenades.
**Unlocks (Supplies):**
- Weapons: Fire Axe 150 · Assault Rifle 200 · Chainsaw 300 · Flamethrower 400 · Grenade Launcher 500
- Buildings: Spike trap 100 · Mine 100 · Floodlight 120 · Metal barricade 150 · Med station 300
- Gear: Revive kit 100 · Tactical flashlight 100 · Molotovs 150 · Body armor II 250

Unlocks add cards to the player's shop deck: more options, not more power.
**Training (capped boosts, 5 levels each):** max HP up to +10% · damage up to +5% · starting currency 100 → 150 · reload speed up to +5%. Caps keep a new friend viable next to a veteran (pillar 4).
**Pacing:** everything unlocked after ≈ 15–20 runs (≈ 6 hours). **District 2 unlocks** after the first extraction from Downtown.
### Difficulty Curve
| Waves | Feel | Why |
|---|---|---|
| 1–2 | Relaxed | Learn the map and the first build phase |
| 3–4 | First pressure | Runners flank, cars change the map |
| 5 | Spike | First Brute: focus fire and buildings get tested |
| 6 | Chaos | Bloaters punish tight crowds and careless melee |
| 7–8 | Squeeze | Rubble tightens the map, more spawn points |
| 9 | Tension peak | Blackout wave |
| 10 | Climax | The Behemoth plus the biggest horde |
Build phases are the breathers between waves. Difficulty grows through zombie count, mix, map changes and darkness, never through zombie stats (pillar 1).
### Economy and Resources
- **Personal wallets.** Each player earns and spends their own currency.
- **Anti-snowball rules:** an assist (damaging a zombie a teammate kills) pays 50% of the kill reward; a revive pays +25; kills by your buildings go to your wallet; a player joining mid-run starts with the team's average currency.
- **Start of run:** pistol + 100 currency.
- **Earning:** kill rewards per zombie type (see Enemy table) + a **wave-clear bonus of 20 × wave number** to every living or downed player.
- **Target:** ≈ **2,500 currency per player** over a full 10-wave run at 4 players: enough for one premium weapon, a few upgrades and some buildings, never everything (pillar 2).
- **Spending:** weapons 150–800, upgrades 60% of base price per level, gear 120–350, buildings 40–400, consumables 60–100, reroll 20.

## Level Design Framework
### Level Types
**Districts** are hand-made maps. Players pick one at the start of a run; it decays around them over the run. v1 ships **Downtown**. Later candidates [NOTE FOR DESIGNER: pick order later]: Hospital, Suburbs, Port, Subway station, Shopping mall, Military checkpoint. Each future district brings its own landmarks and 1–2 district events.
### Level Progression
Decay advances one stage every 2 waves and changes play, not only looks (pillar 3):

| Waves | Stage | Gameplay change |
|---|---|---|
| 1–2 | Evening | Open map, full lighting; parked cars along curbs are obstacles |
| 3–4 | Panic | 4 cars move into the road (new cover and choke points); police barriers block some paths |
| 5–6 | Breakdown | 2 car fires (fire zones, 2 m radius, last 2 waves); free sandbag cover appears; rain begins (visual) |
| 7–8 | Ruins | Rubble closes one alley and blocks paths; streetlights flicker; collapsed walls open new spawn points |
| 9–10 | Collapse | Power out. **Wave 9 is a blackout wave**; fog limits vision to 10 m; wave 10 (boss) lit only by fires and floodlights |
| 11+ | Collapse (endless) | Blackout every other wave |

**Run-to-run variety:** which cars burn, which alley collapses, the special events and the shop cards are random per run. Each run has a **seed** so a run can be reproduced for testing.

## Art and Audio Direction
### Art Style
**Dead City:** 2D top-down, gritty and realistic, muted colors, rainy city streets at night. Chosen through three rounds of playable probes (see the brief addendum).
- **Characters:** survivors and zombies read as people seen from above (shoulders, head, arms). Zombies wear torn civilian clothes in muted tones; wounds and blood are visible.
- **Readability rules:** each player has a colored ground ring (blue, orange, green, purple); every zombie type has a distinct silhouette (Brute wide, Bloater round, Crawler long and low, Runner thin and leaning, Spitter with a glowing mouth).
- **Decay is the art's story:** the same district has 5 visual states (Evening → Collapse): lights, cars, debris, fires, weather and vegetation change stage by stage.
- **Lighting:** streetlights, shop glow, fires, muzzle flashes, flashlights and floodlights are the main light sources; blackout waves leave only those.
- **Tone:** tense and grim; blood stays on the ground for the wave. [NOTE FOR DESIGNER: gore level still open — blood only, or dismemberment?]
### Audio and Music
- **Ambience follows decay:** Evening = traffic, distant music and voices · Panic = sirens, car alarms, shouting · Breakdown = rain, crackling fires · Ruins = wind, falling debris · Collapse = near silence, only growls and rain.
- **Music:** tension music whose intensity follows the number of zombies alive; a calmer track in build phases; a dedicated boss track for the Behemoth.
- **Weapons:** each weapon has a distinct firing and reload sound; reload sounds must be audible, since a reload is a moment of danger.
- **Zombie cues:** each special zombie has a signature sound that also works as a warning (Spitter gurgle, Bloater swelling, Brute roar, Runner shriek), essential in blackout waves.

## Technical Specifications
### Performance Requirements
- **Frame rate:** 60 FPS target, never below 30 FPS sustained, on a 2021 mid-range phone (e.g. iPhone 12, Pixel 5, Galaxy A52), measured over a full wave 9 (blackout) with 150 zombies on screen.
- **Network:** fully playable on 4G at up to 150 ms latency; no visible disagreement between players about what happened.
- **Load time:** first load under 10 s on 4G; later loads under 3 s.
- **Battery:** a 20-minute run uses under 15% battery on the reference phones.
- **Quality settings:** rain, screen shake and lighting effects can be lowered or turned off.
### Platform-Specific Details
- **Mobile browsers (primary):** Safari on iOS 16+, Chrome on Android 10+. Landscape only; respects notches and safe areas; can be added to the home screen.
- **Desktop browsers (bonus):** current Chrome, Firefox, Safari, Edge with keyboard and mouse.
- **No native app** and no app store in v1.
### Asset Requirements (v1)
- **District:** Downtown in 5 decay states, plus decay props (cars in 3 conditions, barriers, sandbags, rubble, fires, vegetation).
- **Characters:** survivor body with 4 color variants, holding poses per weapon type; 6 zombie types + the Behemoth, each with walk, attack and death animations.
- **Weapons & buildings:** 10 weapons, 7 buildings (with damaged states), consumables.
- **Effects:** muzzle flashes, blood, fire, acid, gas, explosions, rain, fog, flashlight and floodlight light.
- **UI:** HUD, shop cards, lobby, evacuation vote, pings, unlock screen.
- **Audio:** ~30 weapon sounds, ~20 zombie sounds, 5 ambience loops (one per decay stage), 3 music tracks (wave, build, boss).
- **Budget:** total download for first play under 15 MB.
[NOTE FOR DESIGNER: how the art and audio will be produced — commissioned artist, asset packs, AI-assisted, or a mix — is open.]

## Development Epics
### Epic Structure
Detailed breakdown in [epics.md](epics.md). Every epic ends in something playable.

| # | Epic | Playable result |
|---|---|---|
| 1 | Core combat on one phone | Solo twin-stick horde fight on a phone |
| 2 | Online co-op foundation | 2–4 friends share a wave from a link |
| 3 | Build phase and economy | 5 waves with shop, turrets and barricades |
| 4 | Downtown and city decay (first slice) | **Milestone 1:** online, Downtown, 3 decay stages |
| 5 | Full arsenal and bestiary | All weapons, zombies, buildings, gear |
| 6 | The full run | Evening to the Behemoth, extract or endless |
| 7 | Accounts and meta-progression | Unlocks carry between runs |
| 8 | Real-life resilience | Join mid-run, reconnect, save and resume |
| 9 | Dead City art and audio | Final look and sound |
| 10 | Performance and polish | v1 for weekly game nights |

**Sequence:** 1 → 2 → 3 → 4 (Milestone 1) → 5 → 6 → 7 → 10. Epic 8 can start after 2 and run alongside 5–7; Epic 9 runs alongside from Epic 4.

## Success Metrics
This is a game for a group of friends, so success is simple and honest.
### Technical Metrics
- The performance targets above are met on the reference phones.
- A full 4-player run reaches wave 10 with no disconnect caused by the game and no disagreement between players' screens.
### Gameplay Metrics
- **The real test:** the friend group asks to play again the following week. *(All pillars)*
- New groups reach at least wave 6 in their first 3 runs; first extraction happens within the first 5–8 runs. *(Difficulty curve)*
- Players use different builds across runs (no single loadout in more than half of runs). *(Pillars 2 and 4)*
- Players talk about decay moments ("the alley collapsed on us"). *(Pillar 3)*

## Out of Scope
**Not in v1 (deferred):** PvP mode · districts beyond Downtown (district 2 follows v1) · new zombie types (Screamer, Riot, Dog) · optional wave modifiers / difficulty settings · cosmetics · matchmaking with strangers · voice and text chat · solo mode as a supported target · native apps.
**Not planned:** monetization (it is a game for friends) · story campaign · controller support.

## Assumptions and Dependencies
- **A game server is required** (real-time co-op, saved runs, accounts); hosting has an ongoing cost [ASSUMPTION: acceptable given the budget].
- Mobile browsers on the reference phones can run 150 animated zombies with lighting at the target frame rate; the first milestone must prove it.
- Art and audio production method is open (see Asset Requirements).
- Development is done by the designer with AI assistance through BMAD.
