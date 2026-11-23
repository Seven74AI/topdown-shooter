# Epic 6, the full run: proposal

Idea work, 2026-11-23, branch `claude/idea-epic-6`. Inputs: the roundtable (`party-notes.md`), the designer's answers in the narrowing step (forge log in `forge/.memlog.md`), and the playable boss mock (`behemoth-prototype.html`, published at claude.ai/artifact/16PKRmcKLyK4qfoG9ghASM). Revised story texts: `revised-stories.md`. Nothing here changes game code or planning files; the main session applies the stories with `gds-correct-course`.

Every number below is a starting value for the balance JSON (`boss.json`, `events.json`, `waves.json`, `decay.json`), not code.

## 0. Designer decisions (2026-11-23)

The designer picked the recommended option on every question.

| # | Question | Decision |
| --- | --- | --- |
| D1 | Behemoth co-op hook | **Crash stun only.** A charge that ends on hard cover stuns it 2 s and it takes ×1.5 damage. No back weak spot in v1 (kept as an endless idea). |
| D2 | Events per run | **Always 2**, in two different waves of 3–8, never wave 5, never back-to-back, never the same event twice. |
| D3 | Endless growth | **+40 zombies per wave up to 600 (wave 15), then +6 % zombie HP per wave.** +1 Brute per wave (max 6 alive), blackout on odd waves, a Behemoth every 5th wave with +25 % HP each time, one event on each even endless wave without a Behemoth. |
| D4 | Falling debris in Ruins | **Ambience only** (dust and sound, no damage). |
| D5 | Floodlight in blackout | **6 m light radius** during blackout waves (Epic 5 built 4 m). |
| D6 | Alive cap during the boss | **110 while the Behemoth lives**, back to 150 when it dies. |
| D7 | Event levers | **Kept:** the car alarm is armed and started by a shot, the gas tank can be shot early, the supply crate shows its weapon. |

Changes to existing documents these decisions imply (for gds-correct-course): GDD "1–2 events" → 2; GDD endless "+40 per wave" → capped at 600; Story 5.10 Floodlight 4 m → 6 m in blackout; the supply-drop weapon list gains the Gas torch (Epic 5 round C).

## 1. The Behemoth

### 1.1 Body and arrival

| Value | Number | Note |
| --- | --- | --- |
| Radius | 2.0 m | GDD |
| Walk speed | 1.3 m/s (enraged 1.69) | GDD |
| Knockback | immune | GDD |
| HP | **6,000 × 0.4 / 0.6 / 0.8 / 1.0** (1–4 players) = 2,400 / 3,600 / 4,800 / 6,000 | the player-count table the game already uses |
| Arrives | when 50 % of wave 10's zombies have spawned | GDD |
| Entry | 4 s warning (rumble, red edge marker with a skull, "Something big is coming"), then it walks in from the **street edge farthest from the team, ≥ 14 m from every player** | |
| Alive cap while it lives | 110 (D6) | |
| Buildings it walks into | take 100 damage per second (it pushes through barricades slowly) | |
| Kill pay | 150 to every player; `boss.killed` → "Evac inbound" | economy |

### 1.2 Who it goes after

- **Target = the player who dealt it the most damage in the last 5 s**; ties go to the nearest. It changes target **at most once every 4 s** and never targets a downed player.
- The target gets a **red skull over their survivor** (everyone sees it) and a short vibration on Android.
- Slam hits anyone close; throw aims at the **farthest** standing player. So rifles at the back draw the charge and the throw, melee up close draws the slam.

### 1.3 Attacks

After each attack: a recovery, then a **gap** before it may pick the next one. One attack at a time, never overlapping.

| Attack | When it picks it | Telegraph (fixed at the start) | Hit | Then |
| --- | --- | --- | --- | --- |
| **Slam** | any standing player within 4.0 m of its centre | **1.2 s**: arms rise over its head, chest swells; **ring 4.5 m from its centre** fills | 40 damage, pushed 2 m outward; kills Walkers inside | 0.8 s recovery, cooldown 4 s |
| **Charge** | the target 5–12 m away, ≥ 4 m of clear lane | **1.0 s**: head drops, arms back, feet scrape; **lane 4.8 m wide** (its body + yours) drawn to where it will stop, with a **CRASH** mark if it ends on cover | rushes up to 10 m at **12 m/s**; 30 damage + shoved 2.5 m sideways (once per charge); destroys every building in its path; tramples zombies | ends on hard cover (car, bus, building wall, rubble, map edge) → **crash: stunned 2 s, takes ×1.5 damage**; otherwise 1.0 s recovery. Cooldown 7 s |
| **Throw** | the farthest standing player beyond 8 m | **1.0 s lift**: tears a chunk off the nearest rubble pile or burnt car within 6 m (or the road); **ring 3 m** at where that player stood at the start, an inner ring shrinks to impact | flies **0.8 s**, 35 damage, no knockback; leaves a crater **decal** (no collision change) | 0.6 s recovery, cooldown 6 s |

**Gap between attacks**: 2.8 / 2.2 / 1.8 / 1.5 s for 1 / 2 / 3 / 4 players (fewer players are attacked less often each).

### 1.4 Enrage at 50 %

- **Roar 1.5 s**: it stands still (free damage), pushes everyone within 5 m out by 1.5 m (no damage), the bar turns red, banner "ENRAGED".
- Then: **+30 % speed, cooldowns and gaps × 0.7**, a **Crawler drops off its back** every 8 / 6 / 5 / 4 s (1–4 players).
- **Telegraph lengths never change.** The warning is a promise.

### 1.5 Fairness at 150 ms

Budget: the phone sees the boss ~175 ms late (75 ms one way + 100 ms interpolation) and its input reaches the server 75 ms late, so a telegraph of length T gives the player about **T − 0.25 s**. With 0.25 s reaction, the slam leaves ~0.7 s of running (3.1 m at full speed, 2.2 m bitten by a Crawler). Escaping the slam from chainsaw range takes ~1.6 m; the charge lane up to 2.15 m (plus travel time for anyone more than 5 m away); the throw ring up to 2.75 m with 1.55 s left. All escapable when slowed.

Rules (each one is a test):

1. **Danger zones are fixed when the telegraph starts**: slam centre, charge lane and stop point, throw landing spot.
2. **The client draws the telegraph's progress from the server's start tick**, not from when the message arrived (late messages show a ring already partly filled; the fill always ends on the hit). The prototype's Tune drawer has a switch to see the difference.
3. **Edge grace 0.25 m**: the server hits only when the player's centre is 0.25 m inside the drawn edge (charge: body contact minus 0.25 m).
4. **Boss hits use the player's newest server position**; no rewind (rewind stays for players' shots, 2.12).
5. **Telegraphs never shorten** (enrage, endless, player count).
6. **One boss attack at a time.**

### 1.6 Readable on a 24 × 13.5 m screen

- **Danger = red with white diagonal hatching and a dashed white edge.** Nothing else in the game uses hatching (fire is orange, acid green).
- Telegraph decals draw **above zombies, darkness and fog**, with a hole where the boss's body is so its pose stays visible.
- **Boss edge marker** when it is off screen (it often is: the view is only 6.75 m tall each way, the throw starts at 8 m): a red disc with a skull, pulsing during a telegraph, its icon showing what's coming (rings = slam, arrow = charge, rock = throw). The throw ring is under you, so it is always on your screen.
- **Boss bar** at the top centre (thumbs are at the bottom) with a gold notch at 50 % and the name.
- In blackout the boss's **outline and eyes** draw above the darkness (eyes turn red when enraged).

### 1.7 What the prototype showed

Bots playing every survivor, Assault Rifle III, light horde, 150 ms, seeded:

| Players | HP | Fight length | Enraged at | Crashes into cover |
| --- | --- | --- | --- | --- |
| 4 | 6,000 | 57 s | 41 s | 3 |
| 3 | 4,800 | 70 s | 47 s | 2 |
| 2 | 3,600 | 80 s | 40 s | 3 |
| 1 | 2,400 | the bot went down at 65 s, boss above 50 % | – | 0 |

Smaller teams take longer, as the HP table means. 55–80 s for 2–4 players fits "the fight we'll talk about". **Solo is hard** (a bot reacts late 15 % of the time and nobody revives it); solo is "allowed, not tuned" (GDD), so the table stays and the Milestone playtest decides whether solo gets 0.3.

## 2. The full 10-wave curve (6.1)

Sizes at 4 players: N × 40 (W10 = 400), × 0.4 / 0.6 / 0.8 / 1.0. Mix for the new waves (W1–W6 as built):

| Wave | Stage | Walker | Runner | Crawler | Spitter | Bloater | Fixed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 4 Ruins | 38 | 22 | 15 | 10 | 15 | 2 Brutes |
| 8 | 4 Ruins | 35 | 24 | 15 | 11 | 15 | 2 Brutes |
| 9 | 5 Collapse (blackout) | 40 | 18 | 17 | 10 | 15 | 2 Brutes |
| 10 | 5 Collapse (dark) | 38 | 22 | 15 | 10 | 15 | 2 Brutes + the Behemoth |

Wave 9 has fewer Runners: in the dark, a Runner is only its shriek and its eyes. Brutes stay fixed (not scaled), as Epic 5 decided.

## 3. Stage 4, Ruins (waves 7–8)

Built with the existing mutation system (no new engine):

- **Rubble closes one alley** (alley 1, 2 or 3, a decay variant picked by the `decay` stream).
- **3 rubble piles** land in the streets (≈ 2 × 1.5 m each): hard cover (stop bullets and bodies), no building on them ("Can't build here"), throw ammo for the boss.
- **2 breach spawn points** (`minStage: 4`) open in building walls facing the intersection.
- **Streetlights flicker**: each lamp drops out for 0.15–0.6 s every 4–10 s; shop glow at 30 %.
- Falling debris: dust and sound only (D4). Ambience: wind and debris.
- The "no area is ever enclosed" test runs on every stage × variant combination.

## 4. Stage 5, Collapse (waves 9–10)

- **Power out**: streetlights and shop glow removed from the light state.
- **Wave 9 is a blackout wave; wave 10 is dark too** (lit by fires, floodlights, flashlights, muzzle flashes, the helicopter's searchlight at the end).
- **Fog in waves**: zombies more than **10 m** from you are hidden on your screen, except inside your flashlight beam, which sees to its full length. On a landscape phone this only bites at the left and right ends (the view is 6.75 m tall each way).
- **Build phases at stage 5 are half dark** (moonlight) with fog at 14 m: the fight is dark, the planning is not.
- Fog vision cannot be turned off; only its visual quality can. Ambience: near silence, growls, rain.

## 5. Blackout lighting (6.3)

| Light | Size |
| --- | --- |
| Unlit ground | 10 % of normal light (buildings faintly there) |
| Personal glow round every survivor | 1.6 m |
| Flashlight (everyone, free) | 60°, 8 m |
| Tactical flashlight | 80°, 12 m |
| Muzzle flash | 3 m for 100 ms |
| Fire zone | 4 m |
| Floodlight | **6 m** in blackout (D5) |

- One half-resolution darkness texture with light shapes erased from it (pooled stamps, no allocation); none drawn when the blackout is off.
- Always above the darkness: teammates with rings, zombie eyes within 14 m (or the fog edge), the boss's outline and eyes, every boss telegraph, event markers, the supply crate, the survivor NPC.
- **Floodlight and Tactical flashlight join the shop from wave 1** once 6.3 lands (a power failure can hit early).
- Blackout darkness can't be turned off. FPS recorded with the "force blackout" cheat and 150 zombies in view.

## 6. Special events (6.8–6.10)

**Schedule:** at run start, the `events` stream picks **2 different events for 2 different waves in 3–8** (never 5, never back-to-back), each starting at a random point between 20 % and 60 % of its wave's spawns, with a banner, a sound and a map marker. Stage gates: gas leak needs the gas station zone (stage 2+), car alarm needs a parked car still parked, power failure only waves 6–8. One module per event in `shared/events`, data in `events.json`.

| Event | What happens | Lever | Numbers |
| --- | --- | --- | --- |
| **Car alarm** | a parked car blinks "armed"; when shot (or by itself after 20 s) its alarm pulls every zombie within 15 m to it | shoot it when the horde is where you want it | armed 20 s, alarm 15 s, radius 15 m |
| **Stampede** | 3 s warning (rumble, dust at a map edge, arrows across the lane), then Runners cross in a straight lane, not chasing | dodge or hold a line | 12 / 18 / 24 / 30 Runners (1–4 players), lane 8 m wide, 5 m/s, 10 s, 8 damage on contact; up to +30 above the alive cap, normal spawns pause meanwhile; survivors after 10 s become normal Runners counted in the wave |
| **Gas leak** | the gas station tank hisses with a visible ring, then explodes | lure zombies in; **shoot the tank to set it off early** (after its first 3 s) | 10 s, 6 m: zombies die, players take 60 (friendly fire, like Bloaters), buildings take 150 |
| **Supply drop** | a smoke flare marks the spot 5 s before the crate lands | **the crate shows its weapon**: the team decides who runs | ≥ 12 m from the team's centre, always reachable; stand on it 1 s; weapon at level II into an empty slot, else replaces the active one (warned); Flamethrower, Gas torch, Grenade Launcher, Chainsaw or Assault Rifle; stays until the wave ends |
| **Power failure** | lamps flicker 2 s, then the wave is a blackout until it ends | buy light | waves 6–8 only |
| **Survivor** | an NPC appears with a marker; a safe-point marker appears elsewhere | split the team or not | 50 HP, ≥ 15 m from the team, safe point ≥ 20 m from it, follows the nearest player within 3 m at 4.0 m/s, crouches when alone, zombies target it like a player; reach the safe point before the wave ends: **+100 to every player** |

## 7. The evacuation vote (6.11)

- After the Behemoth dies, the rest of wave 10 is still cleared (last-5 rule), then the helicopter lands on the intersection (6 m pad, searchlight).
- **Extract / Stay** buttons and a **15 s** countdown for everyone; **every vote shows live in its slot colour**; downed and out players vote. Majority wins; tie or no vote = Extract. Nothing else moves during the vote.
- **Extract**: the helicopter lifts off, **4 s of dawn**, then Results "Extracted" (wave reached, kills, money per player).
- **Stay**: straight into a normal 30 s build phase for wave 11.

## 8. Endless (6.12)

- Map stays at stage 5. **Blackout on odd waves** (11, 13, 15…); fog always.
- Size: **+40 per wave up to 600 at 4 players (wave 15)**, × player count; after that, **+6 % zombie HP per wave** (wave 16 = +6 %, wave 20 = +30 %).
- **+1 Brute per wave** (wave 11 = 3), at most 6 alive.
- **A Behemoth every 5th wave** (15, 20, 25…) with **+25 % HP each time** (×1.25, ×1.5…); its telegraphs stay the same. After that wave is cleared, a new evacuation vote.
- **One event on each even endless wave without a Behemoth** (12, 14, 16, 18, 22…), any of the six that fits.
- Team wipe before extracting: Results "Lost in the city"; the run records that rewards earned after wave 10 are lost (Supplies use this in Epic 7).

## 9. Notes for the architect and builders

- **Boss pathing**: its own flow field at boss size (inflated by 2 m), toward its target, rebuilt every 0.5 s (48 × 32 m at 0.5 m = 6,144 cells). Barricades and turrets are costed, not walls (it pushes through them).
- **Charge**: sweep the 2 m body along the lane once at telegraph start against the static cover; the stop point and the crash flag go on the wire with the telegraph event.
- **Wire**: one boss record in the room state (position, facing, HP, state, enraged) plus a reliable telegraph event `{kind, startTick, centre/lane/target, stopLen, crash}`. The client draws progress from `startTick`.
- **Throws never change collision.** No flow-field rebuild mid-boss from a throw.
- **Timers count ticks** (1.2 s = 24 ticks), no gameplay numbers inline, `addGeneratedTexture` for the boss atlas (5 poses: walk, slam, charge/rush, throw, stun/roar), the boss look drawn in code like the Brute.
- **Tests**: HP per player count, each telegraph's length and radius, edge grace (just inside hit, just outside missed), lane stop + crash at the bus, one attack at a time, telegraphs unchanged by enrage, target switch at most every 4 s, Crawler interval, alive cap 110 ↔ 150.
- **Order**: 6.1 → 6.2 → 6.3 → 6.4 can run alongside 6.5; 6.6 and 6.7 after 6.5; 6.8 (framework) before 6.9 and 6.10; 6.11 after 6.7; 6.12 last. The boss stories are the riskiest: give each a fresh-agent review and re-review every high/medium fix.
