# Story 6.5: The Behemoth arrives

Status: done

## Story

As a team,
I want a huge boss to crash into wave 10 while the horde is still coming,
so that the run ends with a fight we'll talk about.

> **EPIC 6 BRIEF** (`docs/epic-6-brief.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
> EPIC 6 BRIEF (from the Epic 4 retro's EPIC 5 BRIEF + Epic 6 specifics; reviewers: check each line)
> 1. Builders run in their own CLOUD SESSION (branch story-6-x, one container each; HANDOFF §3 Session 6 rules). Never `npm run dev` with fixed ports; assigned ports only; stop processes by PID. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current master. While building run only the touched areas' tests; ONE full gate at the end.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo (LocalSimHost), NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → fakeRoom → mirror → Predictor → devThrottle → snapshotWorld). Boss, events, vote and light state are server truth; the client only draws.
> 3. FAIRNESS RULE FIRST: each mechanic's player-visible rule is written in the story ACs before building, and each rule is a test.
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (the story's "Beat the rule" list is the start, not the end) and list every attempt and its result.
> 5. Cover: bullets stop at map cover (cars, bus, buildings, pumps, parking wall, dumpster), at every barricade tier and at Ruins rubble. Lobbed rounds (launcher, hand grenade, molotov) fly over everything except real buildings (`building: true`); rubble is NOT `building: true`. Spit, flames, blasts, acid, gas and fire zones: cars, the bus, buildings and rubble stop or shield them (clear line from the centre). Sandbags, police barriers, turrets and floor buildings (traps, mines) stop bodies only. Melee is stopped by barricades, shot-blocking map cover and rubble. Behemoth slam and throw IGNORE cover ("the drawn zone is the promise"); the gas-leak blast uses the normal blast line of sight. Server and the client's cosmetic copy agree; rewound (2.12) hits for players' shots only.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged. Boss hits resolve once, on the tick the telegraph ends.
> 7. Spatial code (rubble, breaches, the Behemoth body and charge, shoves, the survivor NPC, the helicopter pad, crate spots) gets a builder-written fuzz test: random layouts × every stage × variant × many ticks; no body inside a box, no stall, zombies and the boss reach a player, flow fields rebuild only at build start (the boss field is its own, on its own clock).
> 8. Randomness only from named seed streams (`decay` for variants/looks, `events` for event schedule/spots/weapons, `spawns`, `combat`); same seed + input log → same snapshotWorld digest, including boss and event state.
> 9. Liveness: every sim/replay/integration test asserts something really happened (all 10 waves played, the boss spawned/attacked/crashed/died, each event triggered, a vote resolved, ≥ 1 endless wave). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks (1.2 s = 24 ticks); no per-tick/per-frame allocation (pool stamps, decals, markers, particles); every number in balance JSON (`waves.json`, `decay.json`, `boss.json`, `events.json`, …), no inline literals.
> 11. Bandwidth: telegraphs, event starts/ends and effects go out as reliable events (kind + start tick + fixed zone), not per-tick state; one boss record in the room state; report added B/s; total ≤ 30 KB/s per phone (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled and capped (max live decals/particles in balance JSON). The reference low-end phone is the Xiaomi Mi 11i (designer 2026-11-24; the Honor 10 is not a test phone). Run ?stress=150 with the story's effects active; report headless FPS before/after with load; the latest recorded ?stress=150 baseline in docs/perf/ is the floor.
> 13. Readability: every new object must read at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet (`docs/playtests/milestone-1/readability-sheet.md`).
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start AND across a boss telegraph / event start / vote, on a late Game scene start and a reconnect; client shows server truth (pending until state agrees).
> 15. Balance: earnings stay as built until the Epic 5 balance pass settles them; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 10-wave sim and assert all waves ended. Solo is "allowed, not tuned" and scales × 0.4 (Behemoth HP too).
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added server p99 ≤ 2 ms total budget for Epic 6 (boss field + events + vote).
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently (votes and pings are inputs to budget for).
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix, ?seed, the decay-stage cheat, new: force blackout, start at wave N, force event X, spawn Behemoth), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master. Each story goes to master as soon as its review (and re-reviews) is clean.
> 20. Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss (`tools/checks/noUnregisteredTextures.test.ts` must stay green). That includes the darkness texture, light stamps, boss atlas, decals, markers and dawn.
>
> EPIC 6 SPECIFICS
> 21. BOSS FAIRNESS (each is a test): (a) every danger zone (slam centre, charge lane + stop point, throw landing spot) is fixed when its telegraph starts; (b) the client draws the telegraph's progress from the server's start tick, never from when the message arrived, and the fill always ends on the hit; (c) edge grace 0.25 m: a hit lands only when the player's centre is 0.25 m inside the drawn edge; (d) boss hits use the player's newest server position, no rewind; (e) telegraph lengths never shorten (enrage, endless, player count); (f) one boss attack at a time, then recovery, then the per-player-count gap; (g) a downed player is never targeted or hit again.
> 22. CAP 110 WHILE THE BEHEMOTH LIVES: at most 110 zombies alive while it is alive (D6), back to 150 the tick it dies; the boss itself does not count; enrage Crawlers respect the cap; the stampede's +30 over-cap allowance is counted against the cap that applies.
> 23. EVENT FAIRNESS: every event announces itself (banner + sound + map marker above the darkness) before it can hurt anyone; the schedule comes only from the `events` stream (2 different events, 2 different waves of 3–8, never 5, never back-to-back); a lever (shoot the armed car, shoot the gas tank after 3 s) works the same for every player and credits whoever pulled it; only standing players take the crate or lead the survivor; the gas blast hurts every player in range in full (as Bloaters) and is shielded by the normal blast line of sight.
> 24. BLACKOUT READABILITY: darkness and fog vision can't be turned off (FR87); quality settings only change their look. Always above the darkness: teammates with rings, zombie eyes within 14 m (or the fog edge), the boss's outline and eyes, every boss telegraph, event markers, the crate, the survivor and the safe point, pings. Colour rule: red = boss danger only, amber = an event you can use, yellow-green = gas, white = pick-ups and people. No hot beam core, no lens flare; rain sparkles inside beams. Check at 568 × 320 and 800 × 360.
> 25. ENDLESS PERFORMANCE: nothing grows without a cap over 20+ endless waves (alive 150 / 110, wave size 600, Brutes ≤ 6 alive, decals, craters, markers, event records, kill logs); a 20-wave endless sim records server tick p99 and memory and asserts they stay flat; FPS recorded with blackout + fog + Behemoth + 150 zombies (`docs/perf/epic-6-blackout.md`).
> 26. LIGHT IS SERVER TRUTH: the light state (stage, blackout flag, power out, flicker seeds, build-phase half darkness) is part of the world and replays; a client that joins or wakes mid-wave draws the same darkness as everyone else; fog hides zombies only on the local screen, never in the sim (aim assist and turrets keep their own rules; aim assist never locks a target your screen hides).
> 27. DO NOT TOUCH EPIC 5 WORK IN PROGRESS: 5.13 card shop and 5.20–5.25 building UX are being built in other sessions (shop, build bar, carry/drag UI); Epic 6 changes there go through their balance flags (`inShop`) or a "Notes for the merge" line, not edits to their UI.
> 28. ONE RUN FLOW: the run phase machine (lobby → build → wave → … → vote → extract/endless → results) has one owner per change (6.1 removes the 6-wave ending, 6.11 adds the vote, 6.12 adds endless); every phase change is a tested transition, and Results always show (no stuck run).
> ```
>
> Most relevant here: **21 (all seven boss fairness rules: this story builds the telegraph framework every boss attack uses)**, **22 (cap 110 while it lives)**, 2 (the boss record is server truth on every copy; the Predictor needs its body), 5 (slam ignores cover), 6 (boss hits resolve once, on the telegraph's last tick), 7 (a 4 m body, its own flow field: fuzz), 8 (entry side and look from named streams), 9 (the boss really spawned, slammed and was hurt by every damage source), 10 (ticks: 1.2 s = 24 ticks; every number in `boss.json`), 11 (one boss record + reliable telegraph events), 12 (boss atlas ≤ 2048², pooled decals), 14 (hidden tab / late start / reconnect mid-telegraph), 16 (a 4th flow field inside the budget), 20 (boss atlas, hatch texture, marker icons via `addGeneratedTexture`), 24 (telegraphs above zombies and darkness; red = boss danger only).

## Acceptance Criteria

### Fairness rules (player-visible; brief lines 3 and 21; each is tested)

- **F1 "You always see it coming."** The Behemoth never appears on top of you: a **4 s warning** (`boss.json › warningS`) plays first (rumble, a red edge marker with a skull at its entry point, banner "Something big is coming"), then it walks in from the entry point **farthest from the team, at least 14 m from every standing player** (`entryMinPlayerDistanceM`). The entry is chosen at the start of the warning and does not change.
- **F2 "The ring you see is the hit."** A slam's danger ring (4.5 m from the boss's centre, `slam.radiusM`) is fixed the tick its telegraph starts (the boss stands still while it winds up). Only players whose centre is **inside 4.25 m** (ring − `edgeGraceM` 0.25 m) when the 1.2 s telegraph ends take the hit. A player whose centre is at 4.26 m or more is never hit.
- **F3 "The fill tells you when."** Your phone draws the ring's fill from the server's **start tick** (not from when the message arrived): a late message shows a ring already partly filled; the fill always reaches the edge on the tick the hit happens. A woken tab or a late Game scene never shows a fill for a telegraph that is already over.
- **F4 "No rewind against you."** Boss hits use each player's **newest server position** (no 2.12 rewind). Your own shots at the boss DO get the normal rewind (you hit what you aim at).
- **F5 "One thing at a time."** At most **one boss attack** runs at once. After every attack: its recovery (slam 0.8 s), then a **gap** of 2.8 / 2.2 / 1.8 / 1.5 s (1 / 2 / 3 / 4 players, `gapS`) before it may start the next one.
- **F6 "The warning never gets shorter."** Telegraph lengths are read from `boss.json` at the telegraph's start and never scaled (not by enrage, endless, player count or lag). A test sweeps every modifier and asserts the tick counts.
- **F7 "It goes after whoever hurts it."** Its target is the **standing** player who dealt it the most damage in the **last 5 s** (`target.threatWindowS`), ties and no damage → the nearest standing player. It switches target at most once every **4 s** (`target.switchMinS`), except at once when its target goes down or leaves. It never targets a downed or out player. Everyone sees a **red skull** over the target.
- **F8 "The slam ignores cover"** (alignment Q8, "the drawn zone is the promise"): walls, cars, barricades and turrets inside the ring shield no one.
- **F9 "Downed is safe from it."** A downed or out player is never targeted and never hit by a boss attack (the existing `damagePlayerBy` rule: only `alive` players take damage).
- **F10 "Same boss for everyone in a run."** HP = **6,000 × 0.4 / 0.6 / 0.8 / 1.0** (1–4 players in the World when it walks in, i.e. at the end of its warning; solo × 0.4: designer 2026-11-24): 2,400 / 3,600 / 4,800 / 6,000. Fixed at its arrival.
- **F11 "The wave isn't over while it lives."** Wave 10 cannot end while the Behemoth is warning or alive, even when every other zombie is dead.

### Behaviour

1. **Balance: `boss.json`** (new file, `config/balance/boss.json`, schema `bossSchema` in `balanceSchema.ts`, loaded in `balance.ts` like `decay.json`):
   `bossWaves [10]`, `arriveAtFraction 0.5`, `warningS 4`, `radiusM 2.0`, `speedMps 1.3`, `hp 6000` (× `waves.playerCountScale`), `aliveCap 110`, `entryMinPlayerDistanceM 14`, `entryPoints ["street_west","street_east","street_north","street_south"]`, `buildingDps 100`, `edgeGraceM 0.25`, `gapS [2.8, 2.2, 1.8, 1.5]`, `firstGapS 1.0`, `target { threatWindowS 5, switchMinS 4 }`, `slam { triggerM 4.0, telegraphS 1.2, radiusM 4.5, damage 40, pushM 2.0, pushS 0.2, recoverS 0.8, cooldownS 4, zombieDamage 40 }`, `bodyPushPlayers true`, `pathing { inflateM 1.65, rebuildEveryS 0.5, buildingSlowPct 25 }`, `caps { maxDecals 8 }`. 6.6 adds `charge`, `throw`; 6.7 adds `enrage`, `killPay`. `crossCheck`: `slam.radiusM − edgeGraceM > slam.triggerM` is NOT required (the trigger may be inside the ring); `telegraphS × 20` is an integer number of ticks; `entryPoints` name real `map.spawnPoints`; `aliveCap ≤ waves.maxAlive`.
2. **The boss record** (`packages/shared/src/boss/bossState.ts`, `world.boss: BossState`, preallocated, no allocation per tick): `state` (u8 `BOSS_STATE`: `NONE 0, WARNING 1, WALK 2, TELEGRAPH 3, RUSH 4, RECOVER 5, STUN 6, ROAR 7, DEAD 8`; 6.6/6.7 use 4, 6, 7), `x, y, facing` (radians in the sim; `quantizeHeading` on the wire), `hp, maxHp`, `number` (Behemoths this run: 1 in wave 10; 6.12 counts endless ones), `look` (u8), `stateTicks` (ticks in the current state), `gapTicks`, `cooldown { slam, charge, throw }` (ticks), `targetId | null`, `lastSwitchTick`, `threat` (per flame/player slot: a ring of 10 half-second buckets of damage dealt = 5 s, `Float32Array(MAX_PLAYERS × 10)`), `attack` (the current telegraph: `id` u16, `kind` (`BOSS_ATTACK`: SLAM 1, CHARGE 2, THROW 3), `startTick`, `hitTick`, `cx, cy, radiusM`, and 6.6's `dirX, dirY, lenM, widthM, crash, src`), `entry { x, y, name }`, `enraged` (6.7), `history` (boss x/y for the last `ZOMBIE_HISTORY_TICKS` ticks: shots rewind to it, D3). In `snapshotWorld` (all of it, incl. threat and history) and `worldDigest`.
3. **Arrival (FR33).** The `boss` system slot (`core/systems.ts`, today `noop`) runs `updateBoss` (`boss/behemoth.ts`) on server and solo. In a wave listed in `bossWaves` (one shared helper `isBossWave(balance, wave, endless)` in `boss/bossState.ts`, which 6.12 extends for endless), when `waves.size − waves.queued ≥ round(size × arriveAtFraction)` and `boss.state === NONE`: pick the entry (D2) and go to WARNING for `ticksFor(warningS)` = 80 ticks, emitting `boss.warning { x, y, hitTick }` (all clients: rumble, edge marker, banner). At the end: `state = WALK` at the entry (centre clamped `radiusM` inside the map), `maxHp = hp = round(boss.hp × playerCountScale[n − 1])`, `look = behemothLookIndex(…)` (D7), `gapTicks = ticksFor(firstGapS)`, cooldowns 0 (6.6 sets its initial ones), emitting `boss.arrived { x, y, maxHp, look }` (banner "THE BEHEMOTH" 2 s, roar, boss music starts).
4. **Alive cap 110 (D6, brief 22).** `updateWaves` reads `maxAliveNow(world)` = `boss.aliveCap` while `boss.state` is WARNING…ROAR, else `waves.maxAlive`. The boss is not in the zombie pool and does not count. Zombies alive above 110 when it arrives are not killed: no new spawns until the count drops below 110.
5. **Wave end (F11).** `updateWaves` returns "cleared" only when `remaining === 0 && queued === 0` **and** the boss is NONE or DEAD. 6.7 owns what happens at death.
6. **Moving.** In WALK it steers by its own flow field toward its target (T3, DD2) at `speedMps` (× 1.3 enraged, 6.7), facing its move direction. Its body (2 m) is pushed out of map solids by the normal `pushOutOfBuildings` with its radius **but player buildings are not solid to it**: a building its body overlaps takes `buildingDps` × 0.05 = **5 HP per tick** (`damageBuilding`), and the boss moves at **25 %** speed while overlapping one (`pathing.buildingSlowPct 25`: it "pushes through slowly"). Zombies overlapping its body are pushed out of it (zombies only; the boss is never pushed). Players overlapping its body are pushed out of it (D1, `bodyPushPlayers`), in `movePlayers` so the Predictor does the same.
7. **Targeting (F7).** Every hit on the boss by a player adds the damage to that player's current threat bucket (`recordBossThreat`). `pickBossTarget` runs every tick in WALK: keep the current target if it is standing, still in the World and `world.tick − lastSwitchTick < ticksFor(switchMinS)`; else the standing player with the largest 5 s sum (ties → smaller distance → lower slot). On a change: `boss.target_changed { playerId }` (all clients: skull moves; the new target's phone vibrates 3 × 40 ms where `navigator.vibrate` exists and vibration is not turned off).
8. **The attack framework (F2–F6).** `startBossAttack(world, kind, zone)` (`boss/telegraph.ts`) is the only way an attack begins: it requires `state === WALK && gapTicks === 0 && cooldown[kind] === 0`, sets `attack.id++`, `startTick = world.tick`, `hitTick = startTick + ticksFor(<kind>.telegraphS)` (never scaled: F6), the zone fields, `state = TELEGRAPH`, and emits `boss.telegraph { attackId, kind, startTick, hitTick, cx, cy, radiusM, … }`. On `world.tick === hitTick` the kind's resolver runs once; then `RECOVER` for `<kind>.recoverS`, then `gapTicks = ticksFor(gapS[n − 1])` (6.7: × 0.7 enraged), then WALK. The kind's cooldown starts at the hit tick. Zone tests live here and are the only ones the resolvers use: `inSlamZone(world, x, y)` = `dist(centre) ≤ radiusM − edgeGraceM`.
9. **Pick order (6.5 part).** `pickBossAttack(world)` (`boss/behemoth.ts`): when the gap is over and the boss is in WALK: (1) slam if its cooldown is 0 and any standing player's centre is within `slam.triggerM` 4.0 m of the boss's centre; (2)–(3) charge and throw are 6.6's branches (a stub returns "none" until then); else keep walking.
10. **Slam (FR34, FR84).** Telegraph 1.2 s = **24 ticks**, the boss stands still, the zone = its centre and 4.5 m. At the hit tick: every **standing** player with `inSlamZone` takes **40** (`damagePlayerBy(world, p, 40, "boss", null)`, new `DamageTag "boss"`) and is pushed **2 m** straight out from the centre over **0.2 s** (4 ticks) through the existing knockback (`knockPlayerBy`, DD5: stops at cover, at the map edge and at a fire edge). Players in the ring are hit through cover (F8). Every zombie whose centre is inside the ring takes `slam.zombieDamage` 40 (no pay, no assist: killer null; a Bloater killed this way bursts as usual). Emits `boss.slammed { attackId, x, y }` (crack decal, dust, camera shake within 12 m). Recovery 0.8 s, cooldown 4 s.
11. **Hurting the boss.** One shared helper `applyBossDamage(world, amount, playerId | null, weapon, tag)` (`boss/bossDamage.ts`): × `charge.stunDamageMult` while STUN (6.6), records threat, emits `boss.hit { amount, weapon, sourceId }` (the hit flash; batched per tick per source: at most one event per player per tick, DD9), and at 0 HP calls `killBoss` (6.7; until 6.7 merges: `state = DEAD`, nothing else). **Every damage source that hurts zombies hurts the boss** (D4) by calling it: bullets/pellets (`updateProjectiles`: a segment-vs-circle test against the boss, rewound to `boss.history` like the zombies; a bullet stops at the boss: no pierce through it), melee (`swingMelee`: in the arc within reach + 2 m, with `meleeLineClear`), flames (`flameTick`: the cone test against its circle, the normal flame pulse; it never catches fire), explosions (`explode()`: within radius + 2 m, the normal blast line of sight to its nearest point; full damage), turret shots (`updateTurrets` may pick it: D6), mines (a mine under its body goes off as for a zombie). Not: fire zones (car fires, molotov), acid, Bloater gas, spike and bear traps (it ignores them and is never held). Aim assist (`assistAim`) can pick the boss (its circle) under the existing 8° rule.
12. **Network.** Room state gains a nested `boss: BossState` schema (`apps/server/src/rooms/schema/RunState.ts`): `state u8, x f32, y f32, heading u8, hp u32, maxHp u32, number u8, look u8, target u8 (slot, 255 none), enraged bool, atkId u16, atkKind u8, atkStart u32, atkHit u32, atkX f32, atkY f32, atkR f32` (6.6 adds lane fields). `BossStateView` + `BOSS_STATE_FIELDS` in `net/stateView.ts` with the compile-time key check; `syncState` writes it on change; reset in `resetRunFields`. New sim events with net kinds (next free numbers at merge, never reuse; 42+ today): `boss.warning`, `boss.arrived`, `boss.telegraph`, `boss.slammed`, `boss.target_changed`, `boss.hit`; all **global** in `eventInterest.ts` (the team cue), except `boss.hit` which is local to the boss's position (hit flashes only matter on screen).
13. **Client: drawing.**
    - `render/BossView.ts`: the body from the boss atlas (`boss_<look>_<pose>` frames, D7), pose from the state (WALK walk cycle; TELEGRAPH/slam arms rising by fill progress; RECOVER after slam = slamHit; STUN/ROAR for 6.6/6.7), position from the interpolated mirror (render tick), hit flash on `boss.hit`, depth above zombies.
    - `render/bossTelegraph.ts` (pure, tested): `telegraphProgress(nowServerTick, startTick, hitTick)` with `nowServerTick` = the host's **estimated server tick** (`NetSimHost`'s `clock.estimateTick`, solo: `world.tick`), clamped 0–1; fades 0.3 s after the hit; `visible = false` when `nowServerTick > hitTick + fade` (woken tab, late start).
    - `render/BossTelegraphView.ts`: red fill growing with progress + **white diagonal hatching** (a 64 px tile texture `boss_hatch`) + solid red edge + dashed white inner edge (prototype `drawTele`); drawn above zombies and above the darkness through 6.3's API (`render/darkness/aboveDark.ts › aboveDarkness(obj, ABOVE_DARK.telegraph)`, above `DARKNESS_DEPTH` 11.7); a hole the size of the boss's body is cut from the fill so the pose stays visible. Pooled: at most 2 telegraph graphics (one attack + the fading one).
    - Blackout (6.3): the boss's outline + eyes frame is drawn with `aboveDarkness(sprite, ABOVE_DARK.boss)` whenever `isBlackout(world)` (or `darknessAlpha(world) > 0`), so its pose reads in the dark; **eyes red when enraged** (this story's frame, 6.7 sets the flag). The edge marker and the target skull use `ABOVE_DARK.marker`. 6.3's `EyesView` draws only zombie eyes (`decay.json › blackout.eyesM` 14 m); the boss's eyes are this story's, never limited by range.
    - Edge marker (`render/bossMarker.ts`, pure, reuses `edgeArrow`): while the boss (or the warning's entry point) is off screen, a red disc with a skull at the screen edge, pulsing during WARNING and TELEGRAPH, with an icon for the coming attack (rings = slam, arrow = charge, rock = throw).
    - Red skull over the target survivor (`render/PlayerView.ts` / `teammateMarkers.ts`; on your own survivor too).
    - **Boss bar** (HudScene, top centre, not over the thumbs): name "THE BEHEMOTH", HP fill, a **gold notch at 50 %**, red when enraged (6.7). ≥ 220 px wide at 568 × 320, ≥ 12 px from the ping button / wave label (alignment Q4/Q14 gaps).
    - Slam decal: a crack decal pool (`caps.maxDecals` 8, oldest reused), cleared at build start.
14. **Client: sound.** `audio/placeholderSfx.ts`: `boss_rumble` (warning), `boss_roar` (arrival), `boss_slam`; a placeholder boss loop (`audio/ambience.ts` music bus: a low drum + drone) from `boss.arrived` until the boss dies or the run ends.
15. **Dev switches (brief 18).** Server `DEV_BOSS_WAVES=3` (+ `DEV_DECAY_STAGES`) / solo `?bosswave=3` overrides `bossWaves` (world.debug, never JSON); dev cheat "Spawn Behemoth" (build-free: starts the WARNING now, any wave); `?bosshp=` scale for tests only in dev builds.
16. **Tests (Vitest).** HP per player count (2,400 / 3,600 / 4,800 / 6,000); arrival at 50 % of wave 10's spawns and not before; entry farthest from the team and ≥ 14 m from everyone (every stage × variant, every team position grid); warning 80 ticks; slam telegraph 24 ticks, radius 4.5, edge grace (4.24 m hit, 4.26 m missed; across 360° step 5°); slam through a car/barricade still hits; downed never hit; target rule (most damage in 5 s, ties nearest, switch ≤ every 80 ticks, immediate on down); one attack at a time; gap per player count; alive cap 110 ↔ 150; wave 10 never ends while the boss lives; each damage source hurts it (table test); no damage from fire/acid/gas/traps; replay digest stable with the boss.

## Tasks / Subtasks

- [x] **T0 Art (from the picks; no new pick).** `render/city/behemothArt.ts`: port `drawBehemothG` and its four looks **BH1 prototype, BH2 site worker, BH3 overgrowth, BH4 riot cop** from `docs/art/epic-6/looks.html` (section 4, lines ~875–960) into game code, poses `walk` (2 frames), `slam` (arms rising, 3 frames by progress), `slamHit`, `charge`, `rush`, `throw`, `stun`, `roar`, plus an "eyes + outline" overlay frame per look, normal and enraged (red eyes), drawn above the darkness via `aboveDarkness(obj, ABOVE_DARK.boss)` (6.3). Bake into a boss atlas (`boss_<look>_<pose>`; 4 looks × ~10 frames at 2 × 2 m × `CHAR_R_PX`; `atlasLayout.test.ts` ≤ 2048², split into two atlases if needed) through `addGeneratedTexture` with its redraw callback. Tells from the same page: red + white hatching, dashed edge, hole for the body, skull on the target, boss bar with the gold 50 % notch, edge-marker icons. All four looks used as random variants (designer pick). Add the boss to the readability sheet (brief 13). (AC 13)
- [x] **T1 Balance + schema** (AC 1): `boss.json`, `bossSchema` (strict, every field), `balance.ts` import + `crossCheck`, `DamageTag "boss"` in `simEvents.ts › DAMAGE_TAGS` (+ net encoding), `config/balance.test.ts` (+ `boss.json matches the GDD`, `bad entry point refused`).
- [x] **T2 Boss state + system** (AC 2, 3, 5, 6): `boss/bossState.ts` (`createBossState`, `BOSS_STATE`, `BOSS_ATTACK`, `resetBoss` at run start), `boss/behemoth.ts` (`updateBoss`: arrival, warning, walk, state clock), `world.boss` in `createWorld`, `DEFAULT_SYSTEMS.boss = updateBoss` (NO/PREDICTION systems stay noop), `snapshotWorld` + `worldDigest`; `waveDirector.ts › updateWaves` (cap + wave-end rule). Tests `boss/behemoth.test.ts`.
- [x] **T3 Boss pathing** (AC 6; DD2): `boss/bossPathing.ts`: a boss NavGrid (`createNavGrid(map, boss.pathing.inflateM)`: every map box grown by 1.65 m; player buildings costed with `buildingCostM`, not walls) and a single-target `bossChase` FlowField toward the target's cell, rebuilt from scratch every `rebuildEveryS` 0.5 s (10 ticks) inside the shared round-robin (`flowField.ts`: the active fields take ticks in turn; the boss field only while the boss walks). Walls rewritten only at build starts (`setNavWalls` from `applyCoverStage`, like the wide grid). A target the field cannot reach (an alley narrower than 4 m) → it walks to the reachable cell nearest the target (the field's lowest-cost cell within 8 m of the target, else it stands and lets 6.6's throw handle it). `snapshotPathing` includes the boss grid/field hashes. Tests `boss/bossPathing.test.ts` (+ `a 4 m body never routes through a 3 m alley`, `boss field idles without a boss`, `walls rebuilt only at build starts`, `pushes through a barricade at 5 HP/tick at 25 % speed`).
- [x] **T4 Target + threat** (AC 7; F7): `boss/target.ts` (`recordBossThreat`, `pickBossTarget`, the 10-bucket ring per player slot advanced every 10 ticks, cleared for a slot on leave). Tests: every case in F7, plus a player who leaves mid-fight.
- [x] **T5 Telegraph framework + slam** (AC 8–10; F2–F6, F8, F9): `boss/telegraph.ts` (`startBossAttack`, `resolveBossAttack`, `inSlamZone`), the slam resolver, `player/knockback.ts › knockPlayerBy(p, fromX, fromY, distM, durS)` (generalising `knockPlayer`; the Brute calls it with its stats), zombie damage in the ring (`applyZombieDamage`, killer null). Tests `boss/slam.test.ts`: 24 ticks; grace sweep; through cover; downed; push stops at a car/edge/fire; zombies in the ring hurt; the modifier sweep for F6 (player counts 1–4, enraged flag, `number` 1–5: telegraph ticks unchanged).
- [x] **T6 Damage into the boss** (AC 11; D3, D4, D6, DD9): `boss/bossDamage.ts` (`applyBossDamage`, `bossCircleHitBySegment`, `bossInArc`, `bossInCircle`, `rewoundBossPos`), hooks in `combat/firing.ts › updateProjectiles`, `combat/melee.ts › swingMelee`, `combat/flame.ts › flameTick`, `combat/explosion.ts › explode`, `buildings/turret.ts › updateTurrets` (target choice), `buildings/mine.ts › updateMines` (trigger), `combat/aimAssist.ts › assistAim`. Table test `boss/bossDamage.test.ts`: each source hurts it (and the amount), the others don't; a bullet stops at it; rewound shot hits where the shooter saw it; one `boss.hit` per source per tick.
- [x] **T7 Network + mirror + Predictor** (AC 12; D1): schema `boss` (+ `BossStateView`, `BOSS_STATE_FIELDS`, compile-time `SameKeys` check), `syncState` (on change; `heading` quantised), `resetRunFields`, `fakeRoom`, devThrottle key list, `NetSimHost` mirror (`world.boss` copied from state; position into a 2-snapshot interpolation buffer like `snapshots.ts`), Predictor (`world.boss.x/y/state` from the newest state, so `movePlayers`' body push matches the server), `netEvents.ts` encode/decode + round-trip tests for the six events, `eventInterest.ts`. Tests: `syncState.test.ts` (+ boss fields synced and reset), `NetSimHost.boss.test.ts` (new: telegraph progress from startTick with a 150 ms late event; a woken tab past the hit tick draws nothing; a late scene start mid-telegraph draws the right fill from state), `prediction.test.ts` (+ `walking into the boss: 0 corrections in the open under ?lag=150`), `tools/netsim/boss.test.ts` (new: `?lag=150&jitter=20`, slam on the bot player 10×: hit only inside 4.25 m by the server position).
- [x] **T8 Client** (AC 13, 14; T0): `BossView`, `bossTelegraph.ts`, `BossTelegraphView`, `bossMarker.ts`, target skull, boss bar (`hudModel` fields `bossVisible, bossHpFrac, bossEnraged, bossName`), crack decals, banners ("Something big is coming", "THE BEHEMOTH"), sounds, boss loop, vibration on target. Unit tests for the pure parts (`bossTelegraph.test.ts`, `bossMarker.test.ts`, boss bar layout at 568 × 320 and 800 × 360).
- [x] **T9 Dev switches** (AC 15): `DEV_BOSS_WAVES`, `?bosswave=`, "Spawn Behemoth" cheat (`DevCheats.tsx`, `devCheatActions.ts`, release-stripped: `noCheatsInRelease.test.ts`).
- [x] **T10 Fuzz, perf, bandwidth, sims** (brief 7, 9, 11, 12, 16): `boss/behemoth.fuzz.test.ts`: random barricade/turret layouts × stages 3–5 × every variant mask × ≥ 3,000 ticks with the boss + 110 zombies + 4 bots: no boss centre inside a map box (its true radius), no player inside a box after a slam push, no stall (the boss reaches a player or a building it breaks within 30 s), boss field walls only at build starts; liveness ≥ 1 slam hit, ≥ 1 building broken, ≥ 1 target switch. Tick cost (`tickCostBoss.test.ts`, `PERF_ASSERT=1`): 110 zombies + boss + 4 fields, added p99 with load (≤ 1 ms of the Epic 6 2 ms budget). Bandwidth (`bossBandwidth.test.ts`): boss record + events at 20 Hz. 10-wave sim (or `?bosswave=` in the 6-wave sim until 6.1): boss arrived, slammed, took damage from ≥ 3 sources.
- [x] **T11 Gates.** Mutations (grace removed → grace test; fill from arrival time instead of startTick → `bossTelegraph` test; rewind used for boss hits → netsim test; cap 110 not applied → cap test; wave ends with the boss alive → F11 test; telegraph scaled by player count → F6 test) and which tests failed. Browser check (Playwright): solo `?bosswave=1&wallet=5000&loadout=assault_rifle:3,shotgun`, online two tabs with `?lag=150&jitter=20`: warning + marker, arrival banner, boss bar + notch, slam ring fills from the start tick, push, skull on the target, a hidden tab woken mid-telegraph. Screenshots at 568 × 320 and 800 × 360. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.5 D1 — Players can't walk through the Behemoth.** Its 4 m body pushes survivors out (as walls do), so you can't stand "inside" it where the slam always hits. Alternative: walk through it like through zombies today. **Recommended: its body pushes you out.**
2. **6.5 D2 — Where it comes in.** From one of the four main street ends (west, east, north, south: the 4 m-wide openings), the one farthest from the team that is ≥ 14 m from everyone; if none is 14 m away, the farthest one. Alternative: any spawn point (alleys are too narrow for it). **Recommended: the four street ends.**
3. **6.5 D3 — Your shots hit it where your screen shows it** (the same up-to-0.3 s lag allowance zombies get, Story 2.12). Its attacks on you get no lag allowance (F4). **Recommended: yes.**
4. **6.5 D4 — Everything that hurts zombies hurts the Behemoth**: guns, melee, flamethrower and gas torch, grenades, mines and turrets; car fires, molotov fire, acid, Bloater gas and floor traps don't (it doesn't catch fire, traps can't hold it). A Bloater blast next to it does hurt it. **Recommended: as listed.**
5. **6.5 D5 — Its slam also hits zombies in the ring** (40 damage: Walkers, Runners, Crawlers, Spitters die, a Bloater bursts), with no money for anyone. Alternative: zombies are unharmed. **Recommended: zombies get hit too** (the slam clears space: a small reward for drawing it into the horde).
6. **6.5 D6 — Turrets shoot the Behemoth** when it is the nearest target in range. Alternative: turrets ignore it (only players fight the boss). **Recommended: turrets shoot it.**
7. **6.5 D7 — Look per fight:** one of the four looks (BH1–BH4) at random per Behemoth from the run seed; a later Behemoth never repeats the previous look (endless, 6.12). **Recommended: yes** (as the designer's pick says).
8. **6.5 D8 — Barricades slow it, they don't stop it.** Walking into a barricade or turret it deals 100 HP per second to it and moves at a quarter of its speed until it breaks through (a wood barricade lasts 2 s, metal 6 s). **Recommended: 100 HP/s, 25 % speed.**
9. **6.5 D9 — The boss bar** sits at the top centre with the name, a gold notch at 50 % and turns red when enraged. **Recommended: yes** (as drawn on the looks page).
10. **6.5 D10 — The target's phone gives a short buzz** (3 × 40 ms) when the Behemoth picks you, and a red skull shows over you for everyone. **Recommended: yes**, off when the player turns vibration off.
11. **6.5 D11 — When the 110 alive cap starts** (readiness check 2026-11-24). Recommended: **with the 4 s warning** (WARNING…ROAR, as AC 4 says), so the horde thins before it walks in. Alternative: only once it walks in.

### Decisions (developer guidance)

- **DD1 A separate boss record, not a zombie type.** A 2 m radius in the zombie pool would grow every grid query margin (`maxZombieRadius` → 2 m) and every per-zombie loop would need a boss exception (bear-trap hold, fire avoidance, knockback share, flame ignite, horde nibble, fog hiding). One `world.boss` with one damage helper called from each source is a short, explicit list (AC 11) and a table test proves it. The architecture already reserves `packages/shared/src/boss`, the `boss` system slot and "the Behemoth lives in Colyseus schema".
- **DD2 Its own flow field.** 4 m wide does not fit the 0.5 m nav grid's clearance rule; grow every map box by `radiusM − MAX_PATHING_ZOMBIE_RADIUS_M` = 1.65 m on a third grid (the 5.7 wide-grid pattern). Single source (its target), rebuilt every 10 ticks inside the existing round-robin budget (`rebuildCellsPerTick` 2048: a full 6,144-cell field in 3 ticks). Player buildings are costed, never walls.
- **DD3 Zones are numbers, fixed at start.** The resolver never reads the boss's live position (it stands still during a slam anyway). Test with a boss moved after the start (it can't, but the test proves the resolver reads `attack.cx/cy`).
- **DD4 Hit tick, not progress.** The server resolves on `world.tick === attack.hitTick`; the client's fill uses `(estimatedServerTick − startTick) / (hitTick − startTick)`. Never seconds, never arrival time.
- **DD5 The knockback is the Brute's** (`knockPlayerBy` over the existing `knockTicks/knockDx/knockDy/knockStepMm` fields, already on the wire and predicted). 2 m / 4 ticks = 500 mm per tick (fits `knockStepMm` u16).
- **DD6 Body push of players in `movePlayers`** after the input move: if `world.boss.state` is WALK…ROAR and the player's circle overlaps the boss's, move the player out along the centre line (sqrt only, no trig: prediction rule). The Predictor reads the newest boss position from state (≤ 1 tick older than the server's at 1.3 m/s = 6.5 cm): corrections stay under the 2.6 reconcile threshold; the charge (12 m/s) shoves players anyway (6.6).
- **DD7 Threat in buckets**: 10 × 0.5 s buckets per player slot, the head advances every 10 ticks (no per-hit allocation; float sums).
- **DD8 Kill credit for zombies the boss kills: none.** `killerId null`, `weapon "boss"`.
- **DD9 `boss.hit` once per source per tick** (the chainsaw/flame quiet-hit lesson, 5.2/5.4): accumulate per player slot in the tick, emit at the end of the boss system.
- **DD10 The boss isn't in the horde stream**, so 6.4's fog never hides it (it draws its outline and eyes above the darkness: `aboveDarkness(obj, ABOVE_DARK.boss)`; telegraphs `ABOVE_DARK.telegraph`; marker and skull `ABOVE_DARK.marker`).

### Current state (read before changing)

- `core/systems.ts`: `SYSTEM_ORDER` already has `"boss"` (after `zombies`, before `waves`) and `"specialEvents"`; both are `noop` in `DEFAULT_SYSTEMS`, `NO_SYSTEMS`; `PREDICTION_SYSTEMS` runs only `input` + `player`.
- `core/world.ts › World`: no boss state; `createWorld` builds every pool once; `step()` → systems → `recordZombieHistory` → `events.flush()`.
- `waves/waveDirector.ts › updateWaves`: `room = b.maxAlive − world.zombies.aliveCount`; cleared = `remaining === 0 && queued === 0`; `beginWave` counts players (the HP scale uses the same count).
- `run/runStateMachine.ts › endWave`: `number >= waves.runWaves` → `run.held_out` → Results (6.1 sets 10, 6.11 adds the vote).
- `zombies/brute.ts › announceSpawn`, `bruteLookIndex` (look from `streamSeed(runSeed, "look:brute:<netId>")`: the pattern for `behemothLookIndex`).
- `player/knockback.ts › knockPlayer` (ZombieTypeStats-based), `stepKnock` (push-out + fire edge stop; shared with the Predictor).
- `zombies/flowField.ts`: chase / flank / wide fields on two NavGrids sharing `rebuildCellsPerTick` by round-robin; `createNavGrid(map, inflateM)`, `setNavWalls`, `rasterizeBuildings` (grown by `nav.inflateM`).
- `combat/damage.ts › damagePlayerBy(world, target, amount, tag, sourcePlayerId, sourceZombieId)` (only `alive` players, god mode), `applyZombieDamage`; `combat/rewind.ts` (zombie history 300 ms; boss hits must not use it, shots at the boss should).
- `economy/economy.ts › payKill` (per zombie type reward), `MONEY_REASONS` (6.7 adds `"boss"`).
- `net/netEvents.ts › NET_EVENT_KIND` (last used: 41 `BEAR_TRAP_SNAPPED`); `apps/server/src/net/eventInterest.ts` (global by default; local kinds listed).
- `apps/server/src/rooms/schema/RunState.ts` (`runFields`, `playerFields`, `buildingFields` + compile-time `SameKeys` checks against `net/stateView.ts` key lists); `syncState.ts`.
- Client: `render/edgeArrow.ts` (pure edge point), `render/teammateMarkers.ts` (2.9), `scenes/GameScene.ts › showBanner/stackBanner` and the event switch (~line 1350), `scenes/hudModel.ts`, `render/ZombieView.ts` (looks by stream), `render/city/bruteArt.ts` (the drawing style to match), `render/city/canvasTexture.ts › addGeneratedTexture`, `net/serverClock.ts` (`estimateTick`), `net/eventQueue.ts` (events drain at the render tick: a telegraph arrives ~100 ms after its estimated start: the fill must not start from arrival), `audio/placeholderSfx.ts`, `audio/ambience.ts`.
- Prototype `docs/ideas/epic-6/behemoth-prototype.html`: `F` (fixed rules), `pickTarget`, `startAttack`, `tryAttack`, `resolveSlam`, `updateBoss`, `drawTele`, `hatchFill`, `drawSkull` — the reference behaviour and drawing.

### Must be preserved

Zombie behaviour bit-for-bit when no boss is alive (no new branch runs; the 4th flow field idles); the 150 alive cap outside the boss fight; Brute knockback (now through `knockPlayerBy`, same numbers); 2.12 rewind for zombies; wave flow and Results for runs without a boss wave (waves 1–9, the 6-wave run until 6.1); prediction = server (0 corrections in the open); replay digests of existing recorded logs (the boss state is NONE in them: `snapshotWorld` must hash it so old digests change once, then are re-recorded: say so in the merge notes).

### Copies touched (brief 2)

World (`world.boss` + `pathing.boss` grid/field) → schema (`boss` nested: 17 fields) → `syncState` (+ `resetRunFields`) → `BossStateView` / `BOSS_STATE_FIELDS` → `fakeRoom` → devThrottle (key list) → mirror (`NetSimHost`: `world.boss` from state, interpolation buffer) → Predictor (boss body for `movePlayers`) → `snapshotWorld` / `worldDigest` (boss state, threat, history, attack, boss pathing hashes). Plus the six damage-source hooks (AC 11) and `netEvents` / `eventInterest`.

### Beat the rule (for the reviewer; brief 4)

1. Stand exactly on the ring's edge (4.25–4.5 m): ever hit? Step out on the last tick: hit? (Only inside 4.25 m by the server position.)
2. With `?lag=300`: does the fill end before or after the hit on your screen? Can a laggy player dodge "late"? (No rewind: the server position decides.)
3. Hide behind a car / barricade inside the ring: shielded? (No: F8.)
4. Go down inside the ring on the hit tick: hit again? (No.)
5. Keep the boss's target by doing tiny damage every 4 s while a teammate deals more: does the switch rule hold? Pass the target back and forth to make it walk in circles (allowed: that's the 4 s rule; record how far it gets).
6. Hide in a 3 m alley: does it get stuck at the mouth, clip in, or stand still forever? (It waits at the nearest reachable cell; 6.6's throw handles you.)
7. Wall it in with barricades on arrival: how long until it's through (100 HP/s, 25 % speed)?
8. Shoot it through a car: does the bullet still stop at the car? Melee it through a barricade? (Cover rules hold for damage TO the boss.)
9. Kill every other zombie of wave 10 before it arrives: does the wave end without a boss? (No: F11; the arrival trigger counts spawns, not alive zombies.)
10. Hide the tab during the warning and wake after the slam: banner late, fill drawn for a finished slam? (Neither.)
11. Solo: 2,400 HP, gap 2.8 s.
12. Damage it with a molotov / car fire / spike trap: hurt? (No.)

### Bandwidth (brief 11)

Boss record: position 8 B + heading 1 B changing every tick at 20 Hz ≈ **200–250 B/s** while it walks (Colyseus patch overhead included); hp patches on hits (4 B, ≤ 20/s ≈ 80 B/s); attack fields once per attack (~30 B). Events: `boss.telegraph` ~25 B per attack (≤ 1 per 2 s), `boss.hit` ≤ 4 per tick local ≈ ≤ 400 B/s on screen worst case (cap it at one batched event per tick if the test shows more). Total added ≲ 0.8 KB/s; the horde stream shrinks (110 instead of 150 zombies: −~1 KB/s). Assert in `bossBandwidth.test.ts` and report.

### Phone FPS / Perf

Boss atlas (4 looks × ~10 frames + outline/eyes) baked at load, ≤ 2048² per atlas; one sprite; ≤ 2 telegraph graphics (filled by a hatch tile, not a per-frame path of 200 lines: draw the hatch as a tiled texture masked by the circle/rect); ≤ 8 crack decals; one edge marker. Wave 10 has 110 instead of 150 zombies alive, which should more than pay for it. Run `?stress=150` and the boss scene (`?bosswave=1`) headless before/after with load; the boss scene with 110 zombies must not be slower than `?stress=150` without it. Server: the 4th field shares the budget; `tickCostBoss` asserts added p99 ≤ 1 ms at load < 1.

### Art

From `docs/epic-6-decisions.md` › Epic 6 looks, section 4 Behemoth: **all four (BH1 prototype, BH2 site worker, BH3 overgrowth, BH4 riot cop)**, one random look per Behemoth; tells as drawn (red + white hatching, dashed edge, hole for the body, CRASH mark (6.6), skull on the target, boss bar with gold 50 % notch). Source drawings: `docs/art/epic-6/looks.html` (`drawBehemothG`, the tells section) and the prototype's `drawBehemoth`, `drawTele`, `drawSkull`; screenshots `docs/art/epic-6/ingame/bh-*.png`, `tells-*.png`. Colour rule: red is boss danger only (no other new object may use red + hatching). Every texture through `addGeneratedTexture` (boss atlases, `boss_hatch`, marker icons, skull, crack decals).

### Dependencies

- **Soft on 6.1** (10 waves): build and test with `DEV_BOSS_WAVES` / `?bosswave=` in the 6-wave run; when 6.1 lands, wave 10 is real.
- **6.3** owns the above-the-darkness layer (`render/darkness/aboveDark.ts`: `DARKNESS_DEPTH` 11.7, `aboveDarkness(obj, slot)`, slots `ABOVE_DARK.boss / telegraph / marker`) and the light state (`world.lights`, `isBlackout(world)`, `darknessAlpha(world)`, wire `RunState.blackoutPct`). If 6.5 is built before 6.3 merges: draw at a depth above zombies behind a one-line `aboveDarkness` shim in `render/darkness/aboveDark.ts` with the same signature (merge note: 6.3's file wins). The boss outline + eyes frame (red eyes when enraged) is this story's; 6.3's `EyesView` draws zombie eyes only.
- **6.2** adds rubble: rubble is a map solid (the boss grid grows it at build start; the throw's source list in 6.6). The entry points must stay 4 m clear at every stage (6.2's spawn-clearance test should include `boss.entryPoints` with the boss radius: merge note to 6.2).
- **6.6 and 6.7** extend this story's files (charge/throw resolvers, enrage, death): they wait for 6.5.
- **Epic 5 in progress (5.13, 5.20–5.25):** no overlap (shop and build-bar UI). The HUD boss bar must keep ≥ 12 px from 5.20's undo chip and the ping button position (Q14).

### Notes for the merge (brief 19)

- `core/systems.ts`: only `DEFAULT_SYSTEMS.boss` changes; 6.8 sets `specialEvents`. No reorder.
- `core/world.ts` / `worldSnapshot.ts`: `boss` added after `lights`; snapshot digest changes once (re-record replay logs in the same PR).
- `config/balanceSchema.ts` / `balance.ts`: new `bossSchema` + import; 6.8 adds `events.json` the same way; 6.1 edits `waves.json` (no conflict: `boss.json` is separate).
- `waves/waveDirector.ts › updateWaves`: the cap line and the cleared condition. **6.8 (stampede +30 over the cap) and 6.12 (endless Brutes) touch the same function**: whoever merges second keeps both (`maxAliveNow` is the single place the base cap is decided; 6.8 reads it as the base of its stampede allowance, `maxAliveNow + overCap` for stampede Runners only, and pauses normal spawns, so `maxAliveNow` itself never includes the +30).
- `zombies/flowField.ts`: the round-robin gains the boss field after `wide`; keep `flowSharedMaxAgeTicks` honest (4 fields: 8P).
- `player/knockback.ts`: `knockPlayer` keeps its signature (calls `knockPlayerBy`).
- `player/movement.ts`: the boss body push after the input move; 6.10's survivor NPC is not a player (no conflict).
- `combat/firing.ts`, `melee.ts`, `flame.ts`, `explosion.ts`, `buildings/turret.ts`, `buildings/mine.ts`, `combat/aimAssist.ts`: one boss branch each, behind `world.boss.state` being alive (no cost otherwise). 6.9's gas-leak blast uses `explode()` and so hurts the boss too (intended).
- `net/netEvents.ts`: kinds 42–47 if free at merge (6.8–6.11 add theirs too: renumber, never reuse). `simEvents.ts › DAMAGE_TAGS` + `"boss"`.
- Schema / stateView / fakeRoom / devThrottle: the `boss` nested schema is new; 6.8–6.11 add event/vote state as their own nested schemas.
- `GameScene.ts` / `HudScene.ts` / `hudModel.ts`: boss bar, banners and event handling appended; 6.8–6.11 add banners in the same switch.
- `audio/placeholderSfx.ts` / `ambience.ts`: append keys; 6.4 changes the stage-5 ambience (the boss loop plays on the music bus over it).

### Suggested build round

**Round 1** (`docs/epic-6-decisions.md` › Build rounds), built on the dev switch `?bosswave=` / `DEV_BOSS_WAVES`, so it needn't wait for 6.1. Runs in parallel with **6.1** (shares `waveDirector.ts`: this story's cap and cleared lines, 6.1's `beginWave`/`waveZombieType`), **6.2** (map data, decay mutations, flicker: different files apart from `flowField.ts`'s wall rebuild, which this story only reads) and **6.3** (both touch `GameScene` depths: use 6.3's `aboveDark.ts`, landed early, or the shim; merge notes). **6.8** (round 2) reads `maxAliveNow`. **6.6 and 6.7 wait for 6.5**; 6.6 and 6.7 can then run one after the other (both edit `boss/behemoth.ts` and `telegraph.ts`: not in parallel). The riskiest story of the epic: fresh-agent review + re-review of every high/medium fix.

### References

- `epics.md` › Epic 6, Story 6.5; FR31, FR33, FR34, FR84.
- `docs/ideas/epic-6/proposal.md` §1.1–1.3, §1.5 (fairness at 150 ms), §1.6 (readability), §1.7, §9 (architect notes); designer decisions D1, D6.
- `docs/ideas/epic-6/party-notes.md` rounds 1–4; `docs/ideas/epic-6/behemoth-prototype.html`.
- GDD › Enemy Wave Design (Wave 10 boss), Buildings (decay interaction), Audio (boss track).
- `game-architecture.md` › Hit validation (boss hits not rewound), Other entities (Behemoth in schema), project tree (`shared/src/boss`, `boss.json`), System order.
- `docs/epic-5-decisions.md` › Alignment answers Q8 (slam/throw ignore cover), 2026-11-24 (solo Behemoth HP × 0.4); `docs/epic-6-decisions.md` › Behemoth looks.
- Story files 2.7 (server-confirmed hits), 2.9 (edge arrows), 2.12 (rewind), 3.5 (flow fields), 5.7 (Brute: windup, knockback, wide grid, fixed counts), 5.8 (swell state + event pattern), 4.13 (`addGeneratedTexture`).

## Dev Agent Record

### Agent Model Used

Claude (claude-code builder session for Story 6.5, cloud session; branch `story-6-5`).

### Debug Log References

- Full gate on `story-6-5` merged with origin/master `4f4cffd` (includes Story 6.1 `9849071`): `npm run typecheck` 0 errors, `npm run lint` clean, `npm test` 336 files / 2,748 tests passed (3 skipped, 1 file skipped as before), `npm run build` OK; `REQUIRE_DIST=1 noCheatsInRelease` 3/3. Load (`uptime`): 0.90 at the start of the tests, 3.85 at the end (4 cores).
- `PERF_ASSERT=1 tickCostBoss`: base p99 0.809 ms (110 zombies, 4 players) → 1.083 ms with the walking, slamming boss and its 4th field (**+0.27 ms p99** of the 1 ms budget), mean 0.597 → 0.576 ms, 71 boss-field rebuilds in 600 ticks; load 0.35.
- `bossBandwidth`: boss record ≤ 181 B/s (incl. the tick field), events 376 B/s with 4 players hitting it every tick (4,800 `boss.hit` in 60 s = 4 per tick, the DD9 maximum), total **≤ 557 B/s per client** (story estimate ≲ 0.8 KB/s).
- Headless Chromium FPS (Playwright, 800 × 360, DPR 1, load 1.84): `?stress=150` **34.8 avg / 15.0 min**; boss scene (`?solo=1&bosswave=1`, 110 zombies alive under the boss cap, boss walking + slamming) **42.0 avg / 20.0 min**: the boss scene is not slower than `?stress=150` (brief 12, Phone FPS). Headless Chromium is slow (8–26 fps class); phone numbers not measured.
- Mutations (brief 9 / T11), each applied, the target tests run, then reverted:
  - grace removed (`radiusM − edgeGraceM` → `radiusM`) → `slam.test.ts` 2 failed;
  - fill from arrival time instead of startTick → `bossTelegraph.test.ts` + `NetSimHost.boss.test.ts` 5 failed;
  - cap 110 not applied (`maxAliveNow` → 150) → `behemoth.test.ts` 2 failed;
  - wave ends with the boss alive (cleared condition without the boss) → `behemoth.test.ts` 2 failed;
  - telegraph scaled by player count → `slam.test.ts` 2 failed (F6 sweep);
  - boss hit on an older position (`p.prevX/prevY`, a rewind stand-in) → survived at first; added "F4: walks out on the hit tick itself" → now 1 failed;
  - downed hit (`status === "out"` only in the slam resolver) → **survived**: `damagePlayerBy` refuses non-alive players too (F9 is enforced twice; the downed test proves the rule, not this line).

### Completion Notes List

- **Shared sim (AC 1–11).** `boss.json` + strict `bossSchema` (every number in balance; `crossCheckBoss`: aliveCap ≤ waves.maxAlive, inflate covers the radius); `boss/bossState.ts` (record, `isBossWave`, `bossActive`, `bossMaxHp`, history for rewound shots, `pushPlayerOutOfBoss`, snapshot), `boss/behemoth.ts` (`updateBoss`: arrival at 50 % of spawns, entry D2, warning 80 ticks, walk, push-through D8, attack pick), `boss/telegraph.ts` (the framework F2–F6: `startBossAttack` only way in, resolve once on `hitTick`, `inSlamZone` with the 0.25 m grace, slam resolver F8/F9/D5, recovery + gap), `boss/target.ts` (F7, 10 × 0.5 s buckets), `boss/bossDamage.ts` (D4 table: bullets incl. rewind D3 and stop-at-body, melee with the line rule, both flamers on their own pulse clock, explosions by blast line of sight to its nearest point, turrets D6, mines; not fire zones, acid, gas, traps). `updateWaves`: `maxAliveNow` (the single base-cap line) + F11 cleared condition (also "never before its boss came", `bossPending`). `DEFAULT_SYSTEMS.boss = updateBoss`. Snapshot + digest include the boss and its grid/field.
- **Pathing (DD2).** A third NavGrid grown by 1.65 m and a single-target `bossChase` field in the shared round-robin (last slot; only while its body is on the map and it has a target; a finished field restarts after `rebuildEveryS` 10 ticks; a target change restarts it at once). Walls only from `applyDecayStage` (build starts). Player buildings are costs, not walls (D8); the boss's push-out ignores them (`pushOutOfBuildings(..., withBuildings=false)`).
- **Found while building — Downtown is tight for a 4 m body.** At stage 1 the west street's parked cars leave gaps under 4 m, so `street_west` opens into a pocket the boss could never leave. `pickBossEntry` therefore skips an entry whose street is a pocket (`bossEntryOpen`: a flood on the boss grid reaching ≥ ¼ of its free cells) while another is open; tested on Downtown (west closed, east/north/south open) and over a grid of team positions.
- **Merge-time fixes with Story 6.1 (the real wave 10).** 6.1's bot sims reached the real wave-10 Behemoth and some runs stalled (brief 28: no stuck run). Three causes, three fixes:
  1. *Unreachable target → the boss stood still forever.* New fallback: when a finished normal field doesn't reach it, the next build is seeded by walking distance round the target (`FlowField.seedFar`; review H1 reworked it, see the review section), so it walks to the nearest spot it can reach (`bossPathing.test.ts`). 6.6's throw is what punishes a camp it can't reach.
  2. *Zombies jammed behind a standing boss in a chokepoint* (AC 6's push-out made them press into it forever). `boss.json › bodyPushZombies` = **false** by default: zombies walk under it (it is drawn over them); the push-out code stays behind the flag (tested on). **OPEN FOR DESIGNER (1).**
  3. *The bots never shot it* (they aimed at zombies only). `botPolicy`: the boss is a target measured to its body's edge, hunted like the last rushers along a nav-grid path (one shared BFS per tick, a 4-cell carrot), and never backed off from (the 2.5 m keep-distance rule is for zombie bites). Bot code only; 6.1's ten-wave, six-wave and five-wave sims all pass with the real boss.
  Two 6.1 wave-flow unit tests that clear wave 10 by hand now say `world.debug.bossWaves = []` (they test the spawn order / the run end alone; the boss's wave-10 rule is F11 in `behemoth.test.ts`).
- **HP (F10).** `hp × playerCountScale[n−1]`, solo × `soloHpScale` 0.4 (B2 left the solo wave size at 0.35; the Behemoth's own 0.4 is a separate number in `boss.json`), players in the World **when it walks in** (AC 3; F10's "when wave 10 starts" differs only if someone leaves during the first half of wave 10). OPEN FOR DESIGNER (2) only if the designer wants the wave-start count.
- **Network (AC 12).** Nested `boss` schema (17 fields, on change only), `BossStateView` / `BOSS_STATE_FIELDS` with the compile-time `SameKeys` / `Assignable` checks, `syncState` + `resetRunFields`, `fakeRoom` (`fakeBoss`), devThrottle (copies the nested record), NetSimHost mirror (`mirrorBoss` + a two-position `BossTrack` drawn at the render tick), Predictor (`syncBoss` before every reconcile). Net kinds **44–49** (42/43 were taken by 5.20/5.22). `boss.hit` is local at the boss's position; the rest are global. `SimHost.serverTick` = `clock.estimateTick` online (not the delayed render tick), `world.tick − 1 + alpha` solo; telegraphs fill from it (F3, DD4).
- **Client (AC 13–14, T0).** `behemothArt.ts` ports `drawBehemothG` and all four looks (BH1–BH4) onto the Brute's helpers (`bruteArt.ts` now exports them as `artKit` + `setArtPixel`, append-only); `bossAtlas.ts`: 4 looks × 13 frames (walk ×2, slam ×3, slamHit, charge, rush, throw, stun, roar, outline+eyes normal/enraged) in one ≤ 2048² atlas, the FX texture (skull, marker disc, 3 icons, crack decal) and the baked telegraph disc (red + white hatching, red edge, dashed inner edge, body hole) — all through `addGeneratedTexture`. `BossView` (body above zombies, outline above the darkness when `setDark(true)`, telegraph pool of 2, target skull, 8 pooled crack decals cleared at build start, hit flash), `BossHud` (boss bar top centre with the gold 50 % notch, red when enraged; edge marker disc with pulsing and the attack icon), banners "Something big is coming" / "THE BEHEMOTH", sounds `boss_rumble` / `boss_roar` / `boss_slam`, a placeholder boss loop (`startBossLoop` / `stopBossLoop`, follows the state), the target buzz 3 × 40 ms through the haptics door. A woken tab's backlog plays no late banner or sound (`ageS`, `bossCue`).
- **Telegraph texture.** The story suggested a 64 px `boss_hatch` tile drawn through a mask; Phaser 4 masks are filters, so the hatch is baked once into the 512 px disc texture instead (no per-frame path; the live fill is one stroked ring). Same look as `teleRing`/`hatch`.
- **Dev switches (AC 15).** Server `DEV_BOSS_WAVES` (dev only, `pickDevBossWaves`, logged), solo `?bosswave=` / `?bosshp=` (dev builds only), cheat "Spawn Behemoth" (release-stripped, in `noCheatsInRelease` strings). `runHeadless` gained an append-only `setup(world)` hook.
- **6.3 (merged, master 603099b).** The shim is gone: 6.3's real `render/darkness/aboveDark.ts` is used. `GameScene.updateBoss` sets `BossView.setDark(darknessAlpha(world) > 0)`, so the outline + eyes frame draws above the darkness in a blackout. The boss record sits after 6.3's `blackoutPct`/`halfDark` in RunState / RunStateView / fakeRoom.
- **HUD layout test (brief 31).** The boss bar is a normal checked control in 6.3's `scenes/hudLayout.test.ts` (wave mode; not in `KNOWN_LIST`). `scenes/bossBar.test.ts` keeps only the bar's own numbers (≥ 220 px, ≥ 12 px from ☰, the wave line and the health bar, at 568 × 320, 640 × 360 and 800 × 360).
- **Readability (brief 13).** Sheet entries 47 (warning + edge marker) and 48 (telegraph + target skull; 46 is 6.3's) with screenshots in `docs/art/6-5/`.

#### OPEN FOR DESIGNER

1. **Zombies walk under the Behemoth** (`boss.json › bodyPushZombies: false`) instead of AC 6's "zombies overlapping its body are pushed out": pushed out, a standing Behemoth in a chokepoint jammed the horde behind it for good (a stuck wave 10 in the 10-wave sim). One flag flips it back.
2. **HP counts the players in the World when it walks in** (AC 3; F10's wording now says so — review). Same number as "when wave 10 starts" unless a player leaves during wave 10's first half.
3. **Downtown is tight for a 4 m body:** at stage 1 the west street (parked cars) is a pocket it can't use, so it never enters from `street_west` while another end is open; teams camping in spaces narrower than 4 m are reached only by the fallback (it comes to the nearest spot) until 6.6's throw. 6.2 should keep the entry streets 4 m clear at every stage (merge note below).

#### Not verified

- Real phones (Mi 11i): no device here; FPS above is headless Chromium only.
- Online two-tab browser check under `?lag=150&jitter=20` (no server run in this session): covered by `NetSimHost.boss.test.ts` (late event, woken tab, late scene start, Predictor body) and `tools/netsim/boss.test.ts` (slams under 75 ± 10 ms each way: 17 hits / 1 miss, every one decided by the server position at the hit tick); not seen in a browser.
- A hidden tab woken mid-telegraph in a real browser (unit-tested only).
- The boss outline + eyes above real darkness in a browser (wired to 6.3's `darknessAlpha`; not seen in a blackout screenshot).
- Sounds and the boss loop by ear (placeholders; headless has no audio).
- Haptic buzz on a phone.
- The look of the enraged body (6.7 sets `enraged`; only the red-eyes overlay frame exists here).

#### Notes for the merge (brief 19)

- `core/systems.ts`: only `DEFAULT_SYSTEMS.boss` (+ its import). No reorder.
- `core/world.ts` / `worldSnapshot.ts`: `boss` appended after `shop` in World and after `flameSlots` in the snapshot; `debug.bossWaves` / `debug.bossHpScale` appended. Every digest changes once (no committed digest fixtures broke in this gate).
- `config/balanceSchema.ts` / `balance.ts`: `bossSchema` + `boss` file appended; `crossCheckBoss` appended. Tests that build their own raw balance list must add `boss` (8 test files updated here).
- `waves/waveDirector.ts`: the cap line (`maxAliveNow`) and the cleared condition only; merged cleanly with 6.1's `beginWave`/`waveZombieType`. 6.8's stampede reads `maxAliveNow` as its base; 6.12 extends `isBossWave` (one helper in `boss/bossState.ts`).
- `zombies/flowField.ts`: `PathingState.boss` / `bossChase` / `bossActive`, `FlowField.seedOnly` / `seedRings` / `seedFar`, the boss slot last in the round-robin, `snapshotPathing` boss fields. `flowSharedMaxAgeTicks` already scales with `activeFields` (now up to 4).
- `decay/applyDecayStage.ts`: the boss grid's walls set with the other two (build starts only); 6.2's rubble reaches it the same way.
- `player/knockback.ts`: `knockPlayerBy` added; `knockPlayer` keeps its signature (calls it). `player/movement.ts`: the boss body push (`bossPush`) after the move and for an idle survivor. `player/player.ts`: `removePlayer` clears the leaver's threat.
- `buildings/collision.ts`: `pushOutOfBuildings` gained an optional `withBuildings = true` parameter.
- `combat/firing.ts`, `melee.ts`, `flame.ts`, `explosion.ts`, `buildings/turret.ts`, `buildings/mine.ts`, `combat/aimAssist.ts`: one boss branch each behind `bossBodyOn` (no cost without a boss). 6.9's gas-leak blast through `explode()` hurts the boss (intended).
- `net/netEvents.ts`: kinds **44–49** (`BOSS_WARNING … BOSS_HIT`); 6.8–6.11 take the next free numbers. `simEvents.ts › DAMAGE_TAGS` + `"boss"` (appended: the wire sends the index).
- `apps/server/src/net/eventInterest.ts`: `boss.hit` local at the boss's position.
- Schema / stateView / fakeRoom / devThrottle: the `boss` nested schema is new (`RunStateView.boss` optional: absent in a lobby state); `RUN_STATE_FIELDS` excludes `boss` like `players`/`buildings`. The boss record sits after 6.3's `blackoutPct`/`halfDark` (merged).
- `RunRoom.ts` / `RunController.ts`: `DEV_BOSS_WAVES` next to 6.1's `DEV_START_WAVE` (merged here).
- `bots/botPolicy.ts` / `headlessRun.ts`: the bots fight the boss (target, hunt path, no back-off) and `setup(world)`; 6.1's `god` option kept.
- `render/darkness/aboveDark.ts`: 6.3's file (merged); `GameScene.updateBoss` calls `BossView.setDark(darknessAlpha(world) > 0)`.
- `GameScene.ts` / `HudScene.ts` / `hudModel.ts`: `BossView` made with the zombie view, `updateBoss` each frame, the boss events in the event switch, `bossHud` drawn after the rush arrows, `boss*` model fields appended. 6.8–6.11 add their banners in the same switch.
- `audio/placeholderSfx.ts`: three keys + the boss loop appended. `ui/sizes.ts`: `BOSS_BAR_*` appended.
- `render/city/bruteArt.ts`: append-only export of its helpers (`artKit`, `setArtPixel`).
- `scenes/hudLayout.test.ts` (6.3): the boss bar added to the wave mode as a checked control.
- **6.2:** keep `boss.entryPoints` 4 m clear at every stage (spawn-clearance test with the boss radius); the boss grid gets rubble through `applyDecayStage`.
- **6.6:** throw is what reaches a camp the boss can't walk to (the fallback only brings it to the nearest spot); `pickBossAttack` has the charge/throw branches marked; `telegraphTicks` / `updateBossAttack` take new kinds.

### File List

- `apps/client/src/audio/placeholderSfx.ts`
- `apps/client/src/debug/DevCheats.tsx`
- `apps/client/src/debug/devCheatActions.test.ts`
- `apps/client/src/debug/devCheatActions.ts`
- `apps/client/src/debug/urlOptions.test.ts`
- `apps/client/src/debug/urlOptions.ts`
- `apps/client/src/net/devThrottle.ts`
- `apps/client/src/net/fakeRoom.ts`
- (new) `apps/client/src/net/mirrorBoss.ts`
- `apps/client/src/net/prediction.test.ts`
- `apps/client/src/net/prediction.ts`
- (new) `apps/client/src/render/BossView.ts`
- (new) `apps/client/src/render/bossCue.test.ts`
- (new) `apps/client/src/render/bossCue.ts`
- (new) `apps/client/src/render/bossMarker.test.ts`
- (new) `apps/client/src/render/bossMarker.ts`
- (new) `apps/client/src/render/bossTelegraph.test.ts`
- (new) `apps/client/src/render/bossTelegraph.ts`
- `apps/client/src/render/city/atlasLayout.test.ts`
- (new) `apps/client/src/render/city/behemothArt.ts`
- (new) `apps/client/src/render/city/bossAtlas.ts`
- `apps/client/src/render/city/bruteArt.ts`
- (new) `apps/client/src/render/darkness/aboveDark.ts`
- (new) `apps/client/src/scenes/BossHud.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/scenes/HudScene.ts`
- (new) `apps/client/src/scenes/bossBar.test.ts`
- (new) `apps/client/src/scenes/bossBar.ts`
- `apps/client/src/scenes/hudModel.ts`
- `apps/client/src/sim/LocalSimHost.ts`
- (new) `apps/client/src/sim/NetSimHost.boss.test.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `apps/client/src/sim/SimHost.ts`
- `apps/client/src/ui/sizes.ts`
- `apps/server/src/net/eventInterest.ts`
- `apps/server/src/rooms/RunRoom.ts`
- `apps/server/src/rooms/schema/RunState.ts`
- `apps/server/src/rooms/schema/syncState.test.ts`
- `apps/server/src/rooms/schema/syncState.ts`
- `apps/server/src/run/RunController.ts`
- (new) `apps/server/src/run/bossBandwidth.test.ts`
- (new) `apps/server/src/run/devBossWaves.test.ts`
- (new) `apps/server/src/run/devBossWaves.ts`
- (new) `apps/server/src/run/tickCostBoss.test.ts`
- (new) `docs/art/6-5/6-5-568x320-arrived.png`
- (new) `docs/art/6-5/6-5-568x320-telegraph.png`
- (new) `docs/art/6-5/6-5-568x320-warning.png`
- (new) `docs/art/6-5/6-5-800x360-arrived.png`
- (new) `docs/art/6-5/6-5-800x360-telegraph.png`
- (new) `docs/art/6-5/6-5-800x360-warning.png`
- `docs/playtests/milestone-1/readability-sheet.md`
- (new) `packages/shared/src/boss/behemoth.fuzz.test.ts`
- (new) `packages/shared/src/boss/behemoth.test.ts`
- (new) `packages/shared/src/boss/behemoth.ts`
- (new) `packages/shared/src/boss/bossDamage.test.ts`
- (new) `packages/shared/src/boss/bossDamage.ts`
- (new) `packages/shared/src/boss/bossPathing.test.ts`
- (new) `packages/shared/src/boss/bossRunSim.test.ts`
- (new) `packages/shared/src/boss/bossState.ts`
- (new) `packages/shared/src/boss/slam.test.ts`
- (new) `packages/shared/src/boss/target.ts`
- (new) `packages/shared/src/boss/telegraph.ts`
- (new) `packages/shared/src/boss/testBoss.ts`
- `packages/shared/src/bots/botPolicy.test.ts`
- `packages/shared/src/bots/botPolicy.ts`
- `packages/shared/src/bots/headlessRun.ts`
- `packages/shared/src/buildings/collision.ts`
- `packages/shared/src/buildings/mine.ts`
- `packages/shared/src/buildings/turret.ts`
- `packages/shared/src/combat/aimAssist.test.ts`
- `packages/shared/src/combat/aimAssist.ts`
- `packages/shared/src/combat/explosion.ts`
- `packages/shared/src/combat/firing.test.ts`
- `packages/shared/src/combat/firing.ts`
- `packages/shared/src/combat/flame.ts`
- `packages/shared/src/combat/melee.test.ts`
- `packages/shared/src/combat/melee.ts`
- `packages/shared/src/combat/swap.test.ts`
- `packages/shared/src/config/balance.test.ts`
- `packages/shared/src/config/balance.ts`
- (new) `packages/shared/src/config/balance/boss.json`
- `packages/shared/src/config/balanceSchema.ts`
- `packages/shared/src/core/simEvents.ts`
- `packages/shared/src/core/systems.ts`
- `packages/shared/src/core/world.ts`
- `packages/shared/src/core/worldSnapshot.ts`
- `packages/shared/src/decay/applyDecayStage.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/net/netEvents.test.ts`
- `packages/shared/src/net/netEvents.ts`
- `packages/shared/src/net/stateView.ts`
- `packages/shared/src/player/knockback.ts`
- `packages/shared/src/player/movement.ts`
- `packages/shared/src/player/player.ts`
- `packages/shared/src/run/runStateMachine.test.ts`
- `packages/shared/src/waves/spawnPoints.test.ts`
- `packages/shared/src/waves/waveDirector.test.ts`
- `packages/shared/src/waves/waveDirector.ts`
- `packages/shared/src/zombies/flowField.ts`
- `packages/shared/src/zombies/zombieAi.test.ts`
- `tools/checks/noCheatsInRelease.test.ts`
- (new) `tools/netsim/boss.test.ts`
- `_bmad-output/implementation-artifacts/6-5-the-behemoth-arrives.md`

## Senior Developer Review (AI)

Fresh-agent review of `3702a1a` (main session, 2026-11-24): merge clean; 1 high, 2 medium, 6 low. All fixed on `story-6-5`; high/medium go to a fresh re-review.

| # | Finding | Fix | Test |
| --- | --- | --- | --- |
| H1 | `seedFar` latched for the rest of the fight (cleared only on a target change), and the fallback was a Chebyshev ring with no line check: the boss walked greedily into dead ends (16 of 40 Downtown pairs the normal field reaches were never reached). Exploit: step into a 3 m alley once, step out: boss dumb all fight (endless: survived `resetBoss`). | Decided per build, never latched (`updateFallback`): only a finished NORMAL build that doesn't reach the boss switches the next build to the fallback; in the fallback the normal field is tried again at once when the target moves `pathing.fallbackMoveM` (1 m) or every `pathing.fallbackRetryS` (2 s). The fallback seeds by WALKING distance from the target (a BFS over the normal nav grid's walls and closed edges, up to `pathing.fallbackSeedM` 40 m; scratch on `world.pathing`), not Chebyshev. `resetBossField` clears `seedOnly` / `seedFar` / the front at arrival and at a build start (a new Behemoth starts clean). `FAR_SEED_RINGS` gone. | `bossPathing.test.ts`: hide in the NW alley 10 s (fallback seen), then step out to three open spots: reached each time, front back to normal; the fallback brings it ≥ 5 m closer by walking distance; fuzz still green. |
| M1 | The boss's flame clock reset to 0 every tick outside the cone: sweeping on/off gave 2.5× the flamer's DPS. | The clock only advances in the cone and never resets on leaving it (the zombies' 5.4 per-body exposure rule); reset only when a new player claims the slot. | `bossDamage.test.ts` "review M1" (both flamers): wiggle DPS ≤ steady DPS; the old reset fails it. |
| M2 | With `bodyPushZombies` off, a zombie whose centre is under the body was unshootable (the bullet stopped at the circle's entry) and drawn hidden under the body. | Shots: a zombie under the body (centre inside its circle, before any cover) is hit, before the boss (`zombieUnderBoss`); the body still stops the shot for what is behind it. Readability: `BossView` draws the body at 0.55 alpha while any zombie stands under it (`zombiesUnderBoss`; no new colour). Walk-under itself stays (designer being asked; recommendation keep). | `bossDamage.test.ts`: a zombie under the body is shot and the round stops in it (the boss takes 0); one behind is not; `zombiesUnderBoss` counts. Removing the rule fails it. |
| L1 | "a bullet stops at it" had no zombie behind (a `blockT = coverT` mutation survived). | A Walker stands behind it now and keeps its HP. | The mutation fails it. |
| L2 | No cover case for the explosion's line of sight to the body (removing `shotLineClear` survived). | Downtown: a blast south of `curb_car_west_n`, the boss north of it: no damage; the same blast beside the car: 90. | The mutation fails it. |
| L3 | The netsim test doesn't catch a slam on `prevX/prevY`. | Noted in the test: `slam.test.ts` › "F4: walks out on the hit tick itself" pins the newest position (it fails that mutation). | — |
| L4 | `target.threatWindowS` read nowhere (10 × 10 hard-coded); `FAR_SEED_RINGS` inline. | `crossCheckBoss` requires `threatWindowS = THREAT_BUCKETS × THREAT_BUCKET_TICKS` ticks (5 s); the fallback's numbers are in `boss.json` (`fallbackSeedM`, `fallbackRetryS`, `fallbackMoveM`). | `config/balance.test.ts` green. |
| L5 | The target buzz played for a woken tab's stale `boss.target_changed`. | `ageS` on the event (NetSimHost backlog), the buzz is gated on not stale. | `bossCue.test.ts`. |
| L6 | A survivor pinned between the walking boss and a map box ended the tick inside its body (probe: 9 mm; the player system runs before the boss's). | The boss never takes a step that pushes deeper into a standing survivor (they block it like a wall and stand in slam range). | `bossPathing.test.ts` "review L6": pressed against the bus by the boss for 20 s: never inside its body or the bus. |

Story text: F10 now says HP counts the players when it walks in.

### Re-review of 2b2ad6f (main session, 2026-11-24)

H1, M1, M2, L1, L2, L5 verified. One new medium (from the L6 fix) and lows, all fixed:

| # | Finding | Fix | Test |
| --- | --- | --- | --- |
| M-new-1 | L6's `stepsIntoPlayer` refused the whole step whenever a standing survivor touched its front: a dodging non-target "tank" cut its progress 36 m → 12.4 m in 60 s; a survivor touching its flank froze it. | The boss takes its step and pushes every survivor it overlaps out along the centre line, then out of the obstacles, in the boss system the same tick (D1); the step is rolled back (and the survivors put back) only if one would still overlap the body (truly pinned against a map box). + − × ÷ and sqrt only. | `bossPathing.test.ts` "review M-new-1": the dodging tank (back 4.8 m at every telegraph, then into its face): progress > 55 % of the tank-free walk in 20 s (the rest is the slams it draws: 1.2 s telegraph + 0.8 s recovery each, by design); a flank touch: it walks > 5 m in 10 s; never inside its body. The L6 bus test stays green. |
| L-a | `zombieUnderBoss` tested a rewound zombie against the live boss. | It takes the shot's rewind tick and uses the boss history (`rewoundBossPos`), like `bossCircleHitBySegment`. | — (same path as the rewound-shot test) |
| L-b | The body's dim snapped 1 ↔ 0.55 and counted zombies the client may hide. | `bossBodyAlpha` fades over 0.25 s; only zombies `ZombieView.drawn` shows count (6.4's fog will hide some). | `bossTelegraph.test.ts` "review L-b". |
| L-c | The fallback seeded nothing for a target walled in beyond 40 m of walking. | If the capped pass seeds nothing, a second, uncapped pass runs. | — |
| L-d | `Math.hypot` in the push code. | The new push uses + − × ÷ and sqrt (the L6 helper is gone). | — |
| L-e | Survived mutations. | New tests: a 1 m move retries the normal field before the 2 s timer; the walking distance goes round walls (east of the apartments > straight + 10 cells); a second Behemoth starts with a clean field; a zombie under the body behind a barricade inside the body is not shot; the boss's flame clock restarts on a slot claim (rejoin); `threatWindowS` 6 is refused. Each fails its mutation. | `bossPathing.test.ts`, `bossDamage.test.ts`, `config/balance.test.ts` |

### Re-review of 0c36d31 (main session, 2026-11-24)

M-new-1 verified. Four lows, all fixed:

| # | Finding | Fix | Test |
| --- | --- | --- | --- |
| LOW-1 | A survivor walking into its face in front of a player barricade line got the step rolled back nearly every tick: the boss was held and the barricade took no crush damage (D8 "slows, not stops" broken). | While a survivor is pinned, each solid building that survivor overlaps at its pushed-to spot takes `buildingDps` × dt (the boss crushes it through the survivor). The step is still rolled back, so the survivor never ends up inside a box. | `bossPathing.test.ts` "LOW-1": a tank steering at the boss centre every tick in front of a 16-piece metal line. The boss is held for more than 20 ticks, a barricade breaks, and the boss passes the line. Fails with the crush removed. |
| LOW-2 | `bossPush` followed by the obstacle push could leave a survivor inside the body (survivors wedged between the boss and a barricade line, up to 0.107 m). | If the survivor still overlaps the body after both pushes and did not overlap it at its pre-move position, it snaps back to that position. | "LOW-2": two survivors walk along the line's face into a 0.5 m wedge. They never end a tick inside the body. Fails with the snap-back removed (0.04 m inside at t 4). |
| LOW-3 | The flank test was tangent. | The tank now sits at y = 16 + R + r − 0.3 (a real overlap), and the test asserts the boss walks more than 5 m. | Fails with the flank push removed. |
| LOW-4 | Survived mutations. | New tests: (1) a rolled-back step puts back a survivor that had already been pushed (it is pushed first, then the other is found pinned against the bus); (2) a rewound shot at a zombie under the body after the boss has moved; (3) a target walled in beyond `fallbackSeedM` of walking still gets a far field (uncapped pass). Each fails its mutation. | `bossPathing.test.ts`, `bossDamage.test.ts` |

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
- 2026-11-24: built (gds-dev-story, Story 6.5 builder session): shared sim, pathing, network, client, dev switches, tests (fairness F1–F11, fuzz, tick cost, bandwidth, run sim, netsim); merged with Story 6.1 (the real wave 10: unreachable-target fallback, zombies walk under it behind a flag, bots fight it); status → review.
- 2026-11-24: merged master 603099b (Story 6.3): 6.3's aboveDark.ts replaces the shim, the boss outline follows `darknessAlpha`, the boss bar is in the HUD layout test.
- 2026-11-24: review fixes H1, M1, M2, L1–L6 (see Senior Developer Review (AI)).
- 2026-11-24: re-review fixes M-new-1, L-a…L-e.
- 2026-11-24: re-review 2 fixes LOW-1…LOW-4.
