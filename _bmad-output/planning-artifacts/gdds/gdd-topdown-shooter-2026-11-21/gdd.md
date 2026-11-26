---
title: topdown-shooter (working title) — Game Design Document
game_type: shooter (with roguelike run structure and tower-defense building)
platforms: [mobile web browser, desktop web browser]
status: final
created: 2026-11-21
updated: 2026-11-23
source_brief: ../../briefs/brief-topdown-shooter-2026-11-21/brief.md
---

# topdown-shooter (working title) — Game Design Document

## Executive Summary
### Core Concept
A 2D top-down co-op horde shooter for 2–4 friends, played in a phone browser from a shared link. Over 10 waves the district the players picked decays from a normal evening into total collapse while the horde grows. Between waves the team spends currency on weapons, gear and defenses. Surviving wave 10 wins the run; the team can then push on into endless waves. Unlocks carry over between runs.

**Core fantasy:** *You and your friends hold out together while your city falls around you, one wave at a time.*

**What players walk away with:** the panic of a screen full of zombies, the pride of a defense that held, and the story of *that* run ("the bloater took out our whole barricade on wave 9").

### Target Audience
The designer's friend group: 2–4 players, each on their own phone (guest or account); sessions of about 20 minutes per run, longer in endless. Comfortable with twin-stick games; not looking for a competitive esport.

### Unique Selling Points (USPs)
1. **Online co-op on phones from a link, no install:** a game night starts in seconds.
2. **Build your stand:** building and buying between waves under real scarcity.
3. **A city that falls:** the district decays over the run and changes how it plays, ending in blackout waves and a boss.

## Goals and Context
### Project Goals
1. A game the designer's friend group wants to play every week.
2. A complete v1: one district, the full 10-wave run with boss, endless mode, meta-progression.
3. Proof that a big-horde co-op shooter meets the performance targets (see Technical Specifications) in a phone browser (Milestone 1).
### Background and Rationale
A passion project for the designer and their friends. Phones are what everyone always has, and a browser link removes installs and app stores, so starting a game night takes seconds. The co-op horde genre is proven (see the brief's references), but we found no game that combines online phone co-op from a link, building between waves, and a city that decays over the run.

## Core Gameplay
### Game Pillars
Each pillar is a decision rule. When a feature or tuning choice is unclear, these settle it.

1. **Horde chaos.** Difficulty comes from **more zombies, not tougher ones**. A single zombie is never a threat; the crowd is. Target: up to 150 zombies alive at once by wave 10. Zombie health does not scale with waves (exception: endless beyond wave 15, +6% HP per wave).
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

**Run timing:** wave 1 ≈ 40 zombies (~1 min); wave 10 ≈ 400 zombies (~3 min), up to 150 alive at once. Ten waves plus build phases ≈ **20–25 minutes**.

**Why the hundredth loop still pulls:** each build phase is a different choice (pillar 2), every run's decay changes the map under the team (pillar 3), and unlocks change which items can appear.
### Win/Loss Conditions
- **Loss:** no player is standing (everyone is downed or out). The run ends.
- **Downed state:** a player at 0 HP goes down. A standing teammate within **2.0 m** (centre to centre) for **3 s** revives them; the downed countdown pauses while someone revives, and the downed player's gun keeps reloading. If no one does within **20 s**, they are out until the next build phase, when they return automatically.
- **Win:** survive wave 10. An evacuation helicopter arrives and the team votes:
  - **Vote rules:** 15 s to vote; majority wins; a tie or no votes means extract.
  - **Extract:** the run is won; all rewards are kept. The helicopter lifts off into 4 s of dawn, then Results.
  - **Stay:** endless waves in the collapsed city. A new evacuation comes every 5 waves (15, 20, 25…). If the team is wiped before extracting, it loses the rewards earned after wave 10 and keeps everything from waves 1–10.

## Game Mechanics
### Primary Mechanics
| Mechanic | What the player does | Serves |
|---|---|---|
| Twin-stick combat | Move and aim with two thumbs; weapons fire while aiming | Horde chaos |
| Two-slot loadout | Carry any 2 weapons; role comes from gear | Better together |
| Revive | Stand 3 s within 2.0 m of a downed teammate | Better together |
| Build phase | Spend personal currency on weapons, gear, buildings in 30 s | Build your stand |
| Building placement | Place barricades, turrets, traps, lights on a 0.5 m lattice | Build your stand |
| Consumables | One quick-use slot (medkit, grenades, molotovs) | Horde chaos |
| Pings | 4 quick messages with map markers | Better together |
| Decay | The district changes every 2 waves (cover, paths, fire, darkness) | A city that falls |
| Evacuation vote | Extract or stay for endless after wave 10 | Build your stand (risk) |
Numbers for each are in the sections below.
### Controls and Input
- **Orientation:** landscape only.
- **Move:** floating joystick on the left half of the screen (appears where the thumb lands; dead zone 10%, full speed at 100%).
- **Aim and fire:** floating joystick on the right half. Pushing past a 30% dead zone aims; the equipped weapon **fires automatically** while aiming.
- **Aim assist:** projectiles bend up to **8°** toward the nearest zombie inside the aim cone, only when the raw aim would miss, never toward a zombie behind a barricade. Off on desktop mouse aim.
- **Swap weapon:** button near the right thumb (swap time 0.3 s).
- **Reload:** automatic when the magazine is empty.
- **Open risk:** melee under twin-stick worked in browser probes but needs a playtest on real phones (Epic 1).
- **Desktop (bonus):** WASD to move, mouse to aim, hold left click to fire, Q to swap.
- **Build phase:** pick a building (since Story 10.10: the bottom-right **Build** button opens a panel of every unlocked type, and the last-placed building sits next to it as a one-tap quick tile; layout BU-1 = B), carry its ghost carry its ghost and drag to place it ("B · Carry + drag", 0.5 m lattice); the ghost turns red at once when blocked and green only after 250 ms clear. Weapons, upgrades, gear and consumables come from the shop. Details in *Buildings and Defenses* and `docs/ideas/building-ux/ux-spec.md`.

## Shooter Specific Design
### Weapon Systems
**Units:** distances in meters. The camera shows about **24 m × 13.5 m** in landscape. Player radius 0.4 m, move speed **4.5 m/s**.

**Loadout:** 2 weapon slots, any combination (two melee, a shotgun and a rifle…). A player's role comes only from what they carry.
**Ammo:** unlimited reserve; every gun has a magazine and a reload time. Reloading at the wrong moment is the risk.
**Upgrades:** each weapon has levels **I to IV** bought in the shop; each level adds **+25% damage** (level IV = 175%). Upgrade price = 60% of the weapon's base price per level (Pistol: 60 per level). Because zombie HP is fixed, upgrades matter most where they cross a breakpoint (e.g. SMG level III kills a Runner in 1 hit); tune base damage with breakpoints in mind.

| Weapon | Role | Damage | Rate | Range / area | Special | Mag / reload | Price |
|---|---|---|---|---|---|---|---|
| Pistol | Mid | 6 | 3 /s | 9 m | Starter weapon | 12 / 1.0 s | free |
| Machete | Melee | 12 | 2.5 /s | 1.8 m, 110° arc | Hits every zombie in the arc | — | 150 |
| Fire Axe | Melee | 30 | 1.4 /s | 2.2 m, 140° arc | Knockback 1.5 m | — | 300 |
| Chainsaw | Melee | 6 per tick | 10 ticks/s | 1.5 m, 60° arc | Continuous; wielder moves 20% slower | — | 600 |
| Shotgun | Short | 8 pellets × 5 | 1.2 /s | 5 m, 30° spread | Knockback 0.5 m | 6 / 2.5 s | 250 |
| Flamethrower | Short | 20 /s | continuous | 6 m fuel jet, 20° cone | Ignites: +3 dmg/s for 3 s | 6 s of fuel / 3.0 s | 700 |
| Gas torch | Short | 20 /s | continuous | 3 m, 60° cone | Same burn and fuel rules as the Flamethrower | 6 s of fuel / 3.0 s | 550 |
| SMG | Mid | 4 | 12 /s | 8.5 m, 8° spread | — | 40 / 1.6 s | 200 |
| Assault Rifle | Mid-long | 10 | 6 /s | 11 m, 4° spread | — | 30 / 2.0 s | 450 |
| Hunting Rifle | Long | 35 | 1.2 /s | 17 m | Pierces 5 zombies | 5 / 2.5 s | 350 |
| Grenade Launcher | Long | 40 | 0.8 /s | 3–12 m lob with a landing ring, 2.5 m blast | Area damage; also hurts the shooter at 50%. Flies over cars, the bus, pumps, low walls, barriers, sandbags, barricades and turrets; only buildings stop it, at their face. Aimed onto a car roof it lands at the car's near face. The blast is still shielded by cars and the bus | 4 / 3.0 s | 700 |

**Feel:** every hit flashes the zombie and pushes it back; heavy weapons (axe, hunting rifle, grenade launcher) add a short screen shake; each weapon has its own firing sound. *(Screen shake is optional in settings.)*
**Balance intent:** melee has the best damage against a crowd (its arc hits many zombies) but puts you in the crowd; long range is safe and the Hunting Rifle punches lines of zombies, but it fires slowly and struggles against Runners and swarms coming from several sides; area weapons are expensive and can hurt teammates and yourself. The Hunting Rifle's 17 m range reaches beyond the screen edge (12 m) on purpose: it hits zombies before you see them.
### Aiming and Combat Mechanics
- **Aiming:** twin-stick (see Controls), with 8° aim assist on touch.
- **Shots are visible projectiles** that travel (bullets ~60 m/s, grenades lobbed). Melee hits everything inside its arc instantly, except through barricades and shot-blocking map cover (walls, cars, bus, buildings); low cover (sandbags, barriers, traps, mines) doesn't block it. All melee weapons.
- **Accuracy:** each gun has a fixed spread (table above). No recoil climb, no movement penalty: on a phone, aim should feel reliable.
- **No critical hits or weak points** in v1. Top-down zombies have no readable head; damage is what the table says.
- **Friendly fire:** off for bullets and melee; **on at 50%** for grenades, mines, molotovs and flamethrower/gas-torch fire, so area weapons need care. Exception: a Bloater's blast does its full 30 to every player in range, whoever popped it. Bloater gas only slows.
- **Player health:** 100 HP. Details in *Enemy Design and AI*.
### Enemy Design and AI
**Player health:** 100 HP. Zombies in contact hit once per second. No regeneration during a wave; each build phase heals **50% of max HP**; medkits are sold in the shop.

| Zombie | HP | Speed (m/s) | Damage | Behavior | Reward |
|---|---|---|---|---|---|
| Walker | 10 | 1.2 | 10 / hit | Walks straight at the nearest player | 2 |
| Runner | 6 | 4.0 | 8 / hit | Nearly player speed; paths around the front line to flank | 3 |
| Crawler | 8 | 0.7 | 12 / hit | Low silhouette, easy to miss in the chaos; a bite slows the player 30% for 1 s; leaves a blood trail | 3 |
| Spitter | 12 | 1.5 | 15 / spit | Stops at 6 m, spits every 3 s; leaves an acid puddle (3 s, 5 dmg/s); punishes players who camp behind turrets. Spit flies over barricades and sandbags and is stopped by cars, the bus and buildings; acid doesn't hurt across walls, cars or buildings | 5 |
| Bloater | 25 | 0.9 | 30 blast to every player in 2.5 m (full, never halved) | Explodes on death **or** after a 1 s swell when touching a player; 2.5 m blast; also deals 40 to zombies; gas cloud slows for 4 s | 6 |
| Brute | 120 | 1.0 | 35 / hit + 1.5 m knockback | 0.5 s wind-up before each hit; reach 1.3 m (1.8 m into gaps it can't enter); deals 3× damage to buildings; barely affected by knockback. Fixed, not scaled: 1 in waves 5–6, 2 in waves 7–10 | 25 |

**Telegraphs:** Spitter rears back with a glowing mouth for **0.6 s** before spitting; Bloater swells for **1 s** before a contact explosion; every special attack has a readable warning.
**AI:** zombies chase the nearest player; Runners take a flanking path; Spitters keep their distance; all zombies attack buildings that block their path.
**Introduction order:** W1 Walkers · W2 +Runners · W3 +Crawlers · W4 +Spitters · W5 first Brute (mini-boss moment; Brutes are fixed, not scaled by player count) · W6 +Bloaters · W7–9 full mix · W10 finale.
**Spawns:** at district edges from alleys, manholes and broken shop windows; decay opens more spawn points (collapsed walls, fallen fences).
**Difficulty scaling:** zombie stats never change with waves (pillar 1); only counts, mix and spawn pressure grow. Exception: endless beyond wave 15 adds +6% zombie HP per wave.
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
**Cover:** cars, bus, barriers and sandbags block movement for players and zombies; bullets pass over barriers and sandbags but not cars or the bus; buildings, gas pumps, the parking wall and the dumpster also stop bullets; player barricades stop bullets.
**Hazards:** fire zones (10 dmg/s to everything), acid puddles, gas leak, Bloater gas.
### Multiplayer Considerations
- **Mode:** online co-op, 2–4 players, each on their own device. No local split-screen.
- **Lobby:** the host picks a district (Downtown, or Random city from Epic 11) and gets a **share link** and a **4-letter code**; players join, tap Ready, the host starts.
- **Accounts:** play immediately as a **guest** (name only); upgrade to an account later to keep progress.
- **Join mid-run:** allowed during build phases only (endless too); the newcomer starts with a Pistol and max(their own start money, 100 + 60 % of the team's average earnings so far), where the average counts only seats in the fight (E8-J1, E8-J2), and the build timer gains +15 s once per phase; the next wave rescales (Epic 8 decisions, 2026-11-24: `docs/ideas/epic-8/decisions.md`).
- **Disconnects:** a disconnected player's character is removed safely; they can rejoin within **2 minutes** with wallet and gear intact. Their turrets' kills keep paying into the held wallet during those 2 minutes, then stop. A player who drops while downed is out for that wave. After 2 minutes their seat is still remembered for the rest of the run. If nobody is connected, the fight freezes for up to 2 minutes. Host (Start, Save and quit, Remove player) moves at once to the longest-connected player when the host leaves or drops.
- **Pause and resume:** during a build phase or the evacuation vote (E8-S12) the host can **Save and quit**; the run is stored on the server for **7 days** and can be resumed by any account that was in the run (at most 3 saves per account). Everyone leaving mid-wave loses the run; a server restart or everyone leaving in a build phase keeps it.
- **Communication:** a ping button with 4 quick messages (Help! · Over here · Big one! · Ready), each showing an icon on teammates' screens and edge arrows. No voice or text chat in v1.
- **Fairness and feel:** all players see the same horde; the server decides hits. Your own movement, aiming and muzzle flash respond instantly on your device; at 150 ms latency, fewer than 1 shot in 20 that looks like a hit on your screen is reversed.
- **Not in v1:** matchmaking with strangers, voice chat, PvP (parked for a later mode).

## Run Structure and Building (roguelike + tower-defense elements)
### Run Structure
- **Pick a district → lobby (2–4 players) → build phase → 10 waves → evacuation vote → extract or endless.**
- A run is ≈ 20–25 minutes to wave 10.
- **Permadeath is per run:** when the team is wiped, the run ends; meta-progression (see Player Progression) persists.
- **Pause and resume:** the host can pause the run during a build phase; the run state is kept on the server and resumed later by any account that was in the run [details in Multiplayer Considerations].
- **Seeds:** every run has a seed that drives its random choices (events, decay variations, shop cards) for reproducible testing.
### Item and Upgrade System
**Roguelike shop.** Each build phase shows:
- **Always available:** *unlocked* consumables and upgrades for weapons you own. Buildings come from the build bar, not the shop. A downed or out player can't buy.
- **6 random cards** of weapons and gear drawn from the player's **unlocked pool** (each player sees their own cards; one may be borrowed from a teammate's unlocks). **Reroll: 20** currency. Every offer contains **at least 1 weapon and 1 gear card**. No locking cards, no upgrade cards, no Pistol card; items hidden from the shop (`inShop: false`) are never drawn. Rarity by price (≤ 250 common ×3, ≤ 500 rare ×2, above epic ×1); no price scaling per wave. Card look C3 "police evidence tag". When too few new items exist, the offer shows fewer cards and Reroll is disabled.

**Gear (permanent for the run):**
| Item | Effect | Price |
|---|---|---|
| Body armor I / II | +25 / +50 max HP | 150 / 300 |
| Running shoes | +10% move speed | 150 |
| Revive kit | The owner revives teammates in 1.5 s instead of 3 s (the fastest reviver in the 2 m zone counts; no stacking; no effect on the owner's own revive) | 150 |
| Tactical flashlight | Wider, longer light cone in blackout | 120 |

**Consumables (one slot, used with a button):** Medkit (heals 50) 60 · Grenades ×3 (40 dmg, 2.5 m) 80 · Molotovs ×2 (fire zone 3 m for 4 s, 8 dmg/s) 100. Grenades and molotovs are thrown 2–8 m on the Grenade Launcher's lob (over everything but buildings), in waves only; a molotov's fire needs a clear line from the zone centre (like acid). The medkit also works in build phases.
### Buildings and Defenses
Placed during build phases on a 0.5 m lattice (anchored by the building's min corner) from the build bar; they persist until destroyed and can be repaired in a build phase for 50% of their price. Zombies attack any building blocking their path. **Cap: 6 buildings per player** (kept; reviewed in the Epic 5 balance pass). A downed or out player can't place, move, sell, repair or upgrade.

| Building | Effect | HP | Price |
|---|---|---|---|
| Barricade (wood) | 2 m wall; blocks zombies, players and all bullets | 200 | 40 |
| Reinforced barricade | Upgrade of a wood barricade (tap it in a build phase) | 350 | +50 |
| Metal barricade | Upgrade of a reinforced barricade | 600 | +70 |
| Auto-turret | Shoots the nearest zombie within 8 m, 3 dmg × 5/s | 300 | 250 |
| Spike trap | 2 × 2 m floor; 4 dmg/s and −40% speed to zombies on it | 300 | 80 |
| Bear trap | 1 × 1 m floor trap; holds one zombie 3 s (a Brute 1.5 s); closed after a catch until any player stands on it 1 s, and every trap re-arms at build start; worn out after 4 catches; stops no bullets and no melee | 100 | 50 |
| Mine | Proximity, 80 damage in 2.5 m, single use | — | 35 |
| Floodlight | 4 m radius light (6 m in blackout waves); key in blackout waves; sold once Story 6.3 lands | 150 | 100 |
| Med station | Heals players within 2 m by 5 HP/s | 300 | 400 |

**Decay interaction:** fires damage buildings inside them; rubble blocks placement; the Behemoth's charge destroys buildings. Brutes deal 3× damage to buildings.
### Enemy Wave Design
**Wave size (4 players):** wave 1 ≈ 40 zombies, growing by ≈ 40 per wave to ≈ 400 in wave 10; at most ≈ 150 alive at once (110 while the Behemoth lives; the rest queue at spawn points).
**Player-count scaling:** zombie count and boss HP × **0.6** (2 players), **0.8** (3), **1.0** (4). A mid-run join rescales from the next wave. **Solo (1 player) online runs are allowed** (designer, 2026-11-23): × **0.35** (Epic 5 balance pass, 2026-11-24; was 0.4); going down alone ends the run (team wipe). Balance targets stay tuned for 2–4.

**Wave 10 boss: The Behemoth.** Arrives when 50% of wave 10's zombies have spawned, with the horde still active.
- Size 5× a walker (radius 2 m); speed 1.3 m/s; immune to knockback. HP **6,000** at 4 players (≈ 40 s of focused team fire; scaled by player count).
- **Ground slam:** picked when a player is within 4 m; 1.2 s telegraph (arms raised), 4.5 m ring, 40 damage. Ignores cover (the drawn zone is the promise).
- **Charge:** 1.0 s telegraph (head lowered), 10 m straight line, 30 damage, destroys buildings in its path. **Crash stun:** a charge that ends on hard cover stuns it 2 s and it takes ×1.5 damage (the co-op hook).
- **Throw:** picks up a wreck or rubble from the decayed map and throws it at a player (1 s telegraph, 3 m impact, 35 damage). Ignores cover.
- **Enrage at 50% HP:** +30% speed, attack cooldowns −30%, a Crawler drops off its back every 8 / 6 / 5 / 4 s (1–4 players).
- Its death calls the evacuation helicopter (extract-or-stay vote).

**Special events:** always 2 per run, in two different waves of 3–8, never wave 5, never back-to-back, never the same event twice. Only standing players can take the supply crate or lead the survivor.
| Event | What happens | Team decision |
|---|---|---|
| Car alarm | A parked car is armed for 20 s; a shot (or the timer) starts its alarm, which draws all zombies within 15 m toward the car for 15 s | Use it to pull or bunch the horde |
| Gas leak | A gas tank hisses for 10 s, then explodes: 6 m radius, kills zombies, the full 60 damage to every player in range (like the Bloater blast), with the normal blast line of sight (cars, the bus and buildings shield). It can be shot early after its first 3 s | Lure zombies in, stay out |
| Supply drop | A crate lands at a random spot and shows its weapon (Flamethrower, Gas torch, Grenade Launcher, Chainsaw or Assault Rifle, at level II); a standing player who stands on it 1 s takes it | Risk the crowd for loot |
| Stampede | A mass of Runners crosses the map in one direction for 10 s | Dodge or hold a line |
| Power failure | The current wave (waves 6–8 only) becomes a surprise blackout wave | Floodlights and flashlights matter |
| Survivor | An NPC appears and must be escorted to a safe point (it follows the nearest standing player) | Big reward vs. splitting the team |

District-specific events are planned per district later (e.g. hospital quarantine breach).

**Wave modifiers (post-v1):** blackout is the first modifier; candidates for endless and later runs: fog waves, fast-zombie waves, boss waves, double-special waves.

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

A wave counts for every player still in the run when it ends, downed or out, and only waves the player was in (none before a late join or after leaving); a quitter keeps what they earned. **Rookie lift:** a player's Supplies are doubled while their lifetime Supplies are below 300 (about the first 3 runs).

**Starter pool:** Pistol, Machete, Fire Axe, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Revive kit, Wood barricade, Auto-turret, Medkit, Grenades.
**Unlocks (Supplies):**
- Weapons: Assault Rifle 200 · Chainsaw 300 · Gas torch 350 · Flamethrower 400 · Grenade Launcher 500
- Buildings: Spike trap 100 · Bear trap 100 · Mine 100 · Floodlight 120 · Barricade upgrades (reinforced + metal) 150 · Med station 300
- Gear: Tactical flashlight 100 · Body armor II 250
- Consumables: Molotovs 150

Unlocks are bought in any order and add cards to the player's shop deck and tiles to their build bar: more options, not more power. **Borrowed card:** when a teammate in the room has unlocked weapons or gear the player hasn't, one of the player's 6 cards is drawn from those and marked "Borrowed from <name>" (bought with run money, gone after the run).
**Training (capped boosts, 5 levels each):** max HP up to +10% · damage up to +5% · starting currency +50 (200 → 250) · reload speed up to +5%. Each level costs **50 × level** Supplies (50, 100, 150, 200, 250). Caps keep a new friend viable next to a veteran (pillar 4); Training always applies in full and is never scaled to the team.
**Pacing:** the first weapon a player wants (≈ 300) after ≈ 3 runs, a few favourites (≈ 1,000) after ≈ 10. Unlocking everything is a long-term goal, not the target: not everyone wants every weapon (designer, 2026-11-24). **District 2 unlocks** for a player after their first extraction from Downtown; the host can pick a district if anyone in the lobby has it.
**Survivor look (cosmetic only):** each player builds their survivor from code-drawn parts and free colours; extra parts come from 10 milestones (earned once) and a rare loot bag (1 run in 5), never from Supplies (FR89; `docs/ideas/customization/proposal.md`).
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
Build phases are the breathers between waves. Difficulty grows through zombie count, mix, map changes and darkness, never through zombie stats (pillar 1; only endless beyond wave 15 adds HP).
### Economy and Resources
- **Personal wallets.** Each player earns and spends their own currency.
- **Anti-snowball rules:** an assist (damaging a zombie a teammate kills) pays 50% of the kill reward; a revive pays +25; kills by your buildings pay **50%** of the kill reward to your wallet; a player joining mid-run starts with the team's average currency.
- **Start of run:** pistol + 200 currency (designer 2026-11-24, with the card shop).
- **Earning:** kill rewards per zombie type (see Enemy table) + a **wave-clear bonus of 15 × wave number** (Epic 5 balance pass; was 10 × N) to every player in the run, including downed and out players.
- **Target:** ≈ **2,500–3,000 currency per player** over a full 10-wave run at any player count (bot sims, 10 waves: kill + assist money ≈ 1,470 (4p) to 1,910 (2p) per player + 825 wave bonus + 200 start; human assists add more): enough for one premium weapon, a few upgrades and some buildings, never everything (pillar 2).
- **Earnings decision (Epic 5 balance pass, designer 2026-11-24):** wave bonus **15 × N** (the long-standing fallback), start money stays 200. Seeded 10-wave bot runs then give ≈ 2,500 (4p), 2,710 (3p), 2,930 (2p) per player, inside the target; before, 3–4 players were 2–11 % short. Re-check with Story 6.1's 10-wave sim. Details: `docs/balance/epic-5-balance-pass.md`.
- **Spending:** weapons 150–800, upgrades 60% of base price per level, gear 120–350, buildings 40–400, consumables 60–100, reroll 20.

## Level Design Framework
### Level Types
**Districts** are hand-made maps. Players pick one at the start of a run; it decays around them over the run. v1 ships **Downtown**. Later candidates [NOTE FOR DESIGNER: pick order later]: Hospital, Suburbs, Port, Subway station, Shopping mall, Military checkpoint. Each future district brings its own landmarks and 1–2 district events. Unused art probes can return as special content: a **CCTV-footage intro** and a **Blood Moon cemetery** special district.

**Random city** (Epic 11, post-v1; `sprint-change-proposal-2026-11-24-random-city.md`): a new 70 × 70 m city generated from rules on every run (street plan, blocks, building footprints, cars, barriers, and landmark recipes, first the gas station), open from the start with no unlock. It decays by generic rules through all 5 stages, every city passes fairness checks A–G and the anchor check, and Results shows a city code that replays the layout (FR90–FR94). It is not a district unlock: the District 2 rule is unchanged.
### Level Progression
Decay advances one stage every 2 waves and changes play, not only looks (pillar 3):

| Waves | Stage | Gameplay change |
|---|---|---|
| 1–2 | Evening (dusk) | Open map, the brightest stage (it darkens each stage; light drizzle); parked cars along curbs are obstacles; lit shops mark good spots to build |
| 3–4 | Panic | 4 cars move into the road (new cover and choke points); police barriers block some paths |
| 5–6 | Breakdown | 2 car fires (fire zones, 2 m radius, last 2 waves); free sandbag cover appears; heavy rain (drizzle since stage 1; visual) |
| 7–8 | Ruins | Rubble closes one alley and blocks paths (rubble stops bullets, bodies, melee and blasts; lobbed rounds fly over it); streetlights flicker as a warning of the coming blackout; collapsed walls open new spawn points |
| 9–10 | Collapse | Power out. **Wave 9 is a blackout wave**; fog limits vision to 10 m; wave 10 (boss) dark too, lit only by fires, floodlights, flashlights and muzzle flashes |
| 11+ | Collapse (endless) | Blackout on odd waves; +40 zombies per wave up to 600 at wave 15 (still max 150 alive), then +6% zombie HP per wave; +1 Brute per wave (max 6 alive); a Behemoth every 5th wave, before each evacuation, with +25% HP each time; one event on each even wave without a Behemoth |

**Run-to-run variety:** which cars burn, which alley collapses, the special events and the shop cards are random per run. Each run has a **seed** so a run can be reproduced for testing. In Random city the streets, blocks and buildings are new too; its city code replays the layout (decay picks, events and shop cards stay new).

## Art and Audio Direction
### Art Style
**Dead City:** 2D top-down, gritty and realistic, muted colors, rainy city streets at night. Chosen through three rounds of playable probes (see the brief addendum).
- **Characters:** survivors and zombies read as people seen from above (shoulders, head, arms). Zombies wear torn civilian clothes in muted tones; wounds and blood are visible.
- **Readability rules:** each player has a colored ground ring (blue, orange, green, purple); every zombie type has a distinct silhouette (Brute wide, Bloater round, Crawler long and low, Runner thin and leaning, Spitter with a glowing mouth).
- **Decay is the art's story:** the same district has 5 visual states (dusk Evening → Collapse) across one night, with dawn only on Extract: lights, cars, debris, fires, weather and vegetation change stage by stage.
- **Lighting:** streetlights, shop glow, fires, muzzle flashes, flashlights and floodlights are the main light sources; blackout waves leave only those.
- **Tone and gore:** tense and grim. **Blood and dismemberment:** zombies lose limbs from heavy hits (axe, chainsaw, shotgun, explosions) and burst apart on explosive kills; blood stays on the ground for the wave. A gore toggle (blood only) is in the quality settings.
### Audio and Music
- **Ambience follows decay:** Evening = traffic, distant music and voices · Panic = sirens, car alarms, shouting · Breakdown = rain, crackling fires · Ruins = wind, falling debris · Collapse = near silence, only growls and rain.
- **Music:** tension music whose intensity follows the number of zombies alive; a calmer track in build phases; a dedicated boss track for the Behemoth.
- **Weapons:** each weapon has a distinct firing and reload sound; reload sounds must be audible, since a reload is a moment of danger.
- **Zombie cues:** each special zombie has a signature sound that also works as a warning (Spitter gurgle, Bloater swelling, Brute roar, Runner shriek), essential in blackout waves.

## Technical Specifications
### Performance Requirements
- **Frame rate:** 60 FPS target, never below 30 FPS sustained, on a 2021 mid-range phone (e.g. iPhone 12, Pixel 5, Galaxy A52; low-end floor: Xiaomi Mi 11i), measured over a full wave 9 (blackout) in the worst case: all 150 alive zombies inside one player's view.
- **Memory:** under 300 MB per browser tab on iPhone 12 (Safari closes heavy tabs).
- **Network:** fully playable on 4G at up to 150 ms latency; no visible disagreement between players about what happened. Each phone receives at most **~30 KB/s** with 150 zombies alive (≈ 40 MB per 20-minute run); proving this is Milestone 1's first goal.
- **Load time:** first load under 10 s on 4G; later loads under 3 s.
- **Battery:** a 20-minute run uses under 15% battery on the reference phones.
- **Quality settings:** rain, fog, screen shake, film grain and light glow can be lowered or turned off. **Blackout darkness is gameplay and cannot be turned off.** A gore toggle (blood only) is available.
### Platform-Specific Details
- **Mobile browsers (primary):** Safari on iOS 16+, Chrome on Android 10+. Landscape only; respects notches and safe areas; can be added to the home screen.
- **Desktop browsers (bonus):** current Chrome, Firefox, Safari, Edge with keyboard and mouse.
- **No native app** and no app store in v1.
### Asset Requirements (v1)
- **District:** Downtown in 5 decay states, plus decay props (cars in 3 conditions, barriers, sandbags, rubble, fires, vegetation).
- **Characters:** survivor body drawn from each player's look (customization, Stories 7.8–7.9; slot colour only on the ring, name and edge arrows), holding poses per weapon family incl. the Gas torch; 6 zombie types + the Behemoth, each with walk, attack and death animations, plus dismemberment pieces (arms, heads, torso halves).
- **Weapons & buildings:** 11 weapons, 7 building types (barricade in 3 tiers: wood, reinforced, metal; auto-turret; spike trap; bear trap; mine; floodlight; med station; with damaged states), consumables.
- **Effects:** muzzle flashes, blood, fire, acid, gas, explosions, rain, fog, flashlight and floodlight light.
- **UI:** HUD, shop cards, lobby, evacuation vote, pings, unlock screen.
- **Audio:** ~30 weapon sounds, ~20 zombie sounds, 5 ambience loops (one per decay stage), 3 music tracks (wave, build, boss).
- **Budget:** total download for first play under 15 MB; music streams after the game starts.
**Production:** all art is drawn in game code (Canvas 2D, baked into atlases with `category_name_variant` frames, each texture registered through `addGeneratedTexture`); AI and vector images are references only. Sound comes from code/procedural generation or licensed/free libraries. **Nobody is hired:** Epic 9 is a polish pass of the code-drawn art and of the audio, done without a hired artist or sound designer. *(Photoreal pass, designer 2026-11-24/25, `docs/art/photoreal-decisions.md`: the things you build (9.11) and the characters (9.13) are the code drawings, relit at load in a Web Worker. The street props and vehicles (9.14) are rendered offline from the approved code into one pre-made image atlas, with the code drawings as the fallback. Red marks danger in play: the boss and zombie silhouettes behind walls (9.12).)*

## Development Epics
### Epic Structure
Detailed breakdown in [epics.md](epics.md). Every epic ends in something playable.

| # | Epic | Playable result |
|---|---|---|
| 1 | Core combat on one phone | Solo twin-stick horde fight on a phone |
| 2 | Online co-op foundation | 2–4 friends share a wave from a link |
| 3 | Build phase and economy | 5 waves with shop, turrets and barricades (now 6 waves; 6.1 makes 10) |
| 4 | Downtown and city decay (first slice) | **Milestone 1:** online, Downtown, 3 decay stages, one weapon per range |
| 5 | Full arsenal and bestiary | All weapons, zombies, buildings, gear |
| 6 | The full run | Evening to the Behemoth, extract or endless |
| 7 | Accounts and meta-progression | Unlocks carry between runs |
| 8 | Real-life resilience | Join mid-run, reconnect, save and resume |
| 9 | Dead City art and audio | Polished code-drawn look and sound (no hiring) |
| 10 | Performance and polish | v1 for weekly game nights |
| 11 | Random city (post-v1) | A new generated city every run, next to Downtown |

**Sequence:** 1 → 2 → 3 → 4 (Milestone 1) → 5 → 6 → 7 → 10 (v1) → 11 (post-v1). Epic 8 can start after 3 and run alongside 5–7; Epic 9 runs alongside from Epic 4.

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
**Not in v1 (deferred):** PvP mode · districts beyond Downtown (district 2 follows v1; **Random city is planned post-v1 as Epic 11**) · new zombie types (Screamer, Riot, Dog) · optional wave modifiers (fog, fast zombies, boss waves) and difficulty settings · CCTV intro and Blood Moon special district · matchmaking with strangers · voice and text chat · native apps. **Solo** online runs are allowed (× 0.35) but not balance-tuned.
**Not planned:** monetization (it is a game for friends) · story campaign · controller support.

## Assumptions and Dependencies
- **A game server is required** (real-time co-op, saved runs, accounts); hosting has an ongoing cost [ASSUMPTION: acceptable given the budget].
- Mobile browsers on the reference phones can run 150 animated zombies with lighting at the target frame rate; the first milestone must prove it.
- No artist or sound designer is hired. Art is drawn in game code and sound comes from code/procedural generation or licensed/free libraries; Epic 9 polishes both. (Since 9.14 the street props are a pre-rendered image made from the approved code; see *Production* above.)
- Development is done by the designer with AI assistance through BMAD.

## Open Items Index
- [ASSUMPTION] Server hosting cost is acceptable given the budget (Assumptions and Dependencies).
- ~~[NOTE FOR DESIGNER] Solo testing could use × 0.4 zombie scaling~~ Decided 2026-11-23: solo online runs at × 0.4, allowed, not balance-tuned (Enemy Wave Design). Solo Behemoth HP = × 0.4 (designer 2026-11-24); the solo zombie count became × 0.35 in the Epic 5 balance pass, the Behemoth's number stays its own.
- [NOTE FOR DESIGNER] Pick order of future districts (Level Types).
- [NOTE FOR DESIGNER] New players may skip Downtown, the hand-made first city, since Random city is open from the start: Downtown is the default pick (Story 11.7); revisit after playtests.
- Working title.
