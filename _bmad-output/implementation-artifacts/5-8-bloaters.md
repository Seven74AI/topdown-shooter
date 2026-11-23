# Story 5.8: Bloaters

Status: ready-for-dev

## Story

As a player,
I want swollen Bloaters that explode,
so that tight crowds and careless melee become dangerous.

> **EPIC 5 BRIEF** (§11 of `_bmad-output/implementation-artifacts/epic-4-retro-2026-11-23.md`), quoted in full. It is this story's checklist and every line applies. Builders and reviewers check each line.
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies; server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the 4.10 phone numbers are the floor, not to be lost.
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: start from the 4.10 earnings decision; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> ```
>
> Most relevant here: 3 and 4 (the swell is a promise: once it starts it always ends in a blast; chain explosions; Bloaters at spawns; blasts behind cars), 5 (the blast and the gas respect cover), 6 (the gas slow is per body, refreshed every tick inside), 7 (fuzz: blasts, gas, knockback), 9 ("≥ 1 explosion", "≥ 1 chain"), 10 (pooled clouds), 11 (swell and blast as events, the gas cloud from the blast event, no per-tick cloud state), 12 (gas/explosion particles capped), 13 (the Bloater must read as round and swollen at a glance), 15 (the 6-wave sim).

## Acceptance Criteria

### Fairness rules (written first, brief line 3; each is a test)

- **FR-A The swell is a promise.** When a standing Bloater's body touches a standing player (the bite contact of `zombieAi.ts` pass 4: `d ≤ rz + rp + CONTACT_EPS_M`), it stops and swells for exactly `swellS` 1.0 s (20 ticks), with a visible growth and an audible cue that start on that tick. At the end it **always** explodes where it stands, even if the player moved away (FR24). It never bites. While swelling it does not move, is not pushed by the crowd (other zombies flow round it), and keeps its knockback rules for hits. Killing it during the swell explodes it at once (one blast, never two).
- **FR-B Death = blast, from any cause.** A Bloater at 0 HP explodes where it died: bullets, melee, flames and ignite (5.4), grenades (5.5), car fire (4.8), mines/spikes (5.9), turrets, another Bloater's blast. One blast per Bloater, ever. A Bloater removed without dying (dev clear, wipe, Results) does not explode.
- **FR-C The blast numbers.** Players whose body overlaps the 2.5 m circle (`d < blastRadiusM + rp`) take **30**. Zombies (`d < blastRadiusM + rz`) take **40** (other Bloaters included). Buildings whose footprint overlaps it take `buildingDamage` (D3). Downed/out players take 0, and god mode is respected. A Bloater's blast is the Bloater's attack: it is **not** halved by friendly fire, whoever killed it (tag `explosion`, no source player; D1).
- **FR-D Cars, the bus and buildings stop the blast and the gas; barriers, sandbags and barricades don't.** A body is hit only if the line from the blast centre to its centre crosses no shot blocker (`shotLineClear`, 4.2: the same rule as 5.5's grenades, through the shared `explode()`). The gas slows a player only with that same line of sight to the cloud's centre (it doesn't seep through a car).
- **FR-E Chains are visible and bounded.** A Bloater killed by a blast explodes on the **next** tick (50 ms per link), never in the same tick. A chain therefore ripples outwards and can be read, and the tick cost is bounded: at most `maxBlastsPerTick` (8) blasts per tick, with the rest queued in order for later ticks (FIFO, deterministic). No Bloater explodes twice. Kill credit flows down the chain (D2).
- **FR-F Gas slows, it does not hurt.** Each blast leaves a gas cloud of radius `gasRadiusM` 2.5 for `gasS` 4.0 s (80 ticks). A standing player whose body overlaps a cloud (with line of sight, FR-D) is slowed `gasSlowPct` 30 % on every tick inside, through Story 3.9's `slowPlayer` (never stacking: the stronger percent and the longer remaining time win), with `gasLingerS` 0.25 s after leaving. Zombies are not slowed. The client draws the cloud at exactly its radius and fades it out on its last second.
- **FR-G No Bloater pops on a player at spawn.** Bloaters spawn under the same `spawnMinPlayerDistanceM` (6 m) as every zombie, which is more than the 2.5 m blast plus a body, so a fresh spawn can never blast a player. A blast at a spawn point is allowed and only hits what is there.

### Mechanics

1. **Zombie type (FR24).** `zombies.json › types.bloater`: `hp` 25, `speedMps` 0.9, `damage` 0 (it never bites), `attackIntervalS` 1.0, `radiusM` 0.5 (round and wide: D5), `reward` 6, and a new optional block `"explodes": { "swellS": 1.0, "blastRadiusM": 2.5, "playerDamage": 30, "zombieDamage": 40, "buildingDamage": 40, "pushM": 0.5, "gasRadiusM": 2.5, "gasS": 4.0, "gasSlowPct": 30, "gasLingerS": 0.25 }` (zod: whole-tick durations, `gasSlowPct` an integer percent as in 3.9). `zombies.json › blasts: { "maxBlastsPerTick": 8, "queueCapacity": 64, "maxGasClouds": 24 }`. `ZOMBIE_TYPES` gains `"bloater"` (**append only**: after 5.6's spitter and 5.7's brute, in merge order; the index goes on the wire). A new `ZOMBIE_STATE.SWELL` (next free value ≤ 7; 5.4 reserves bit 3 for "burning"). `maxZombieRadius` grows to 0.5, so check every query margin and the 4.8 nav fire cost (`MAX_PATHING_ZOMBIE_RADIUS_M`), and re-run 4.5's reachability and the spawn-clearance tests at 0.5 m.
2. **AI (`zombies/bloater.ts`, called from `zombieAi.ts`).** Chase like a Walker (the chase field, no flank). In pass 4, on contact with a standing player and with no swell running: `state = SWELL`, `swellTicks[id] = ticksFor(swellS)`, emit `bloater.swell_started { zombieId }`. A swelling Bloater gets velocity 0 in pass 1, is skipped as a mover in the separation pass (others separate from it), and never calls `damagePlayer`. At `swellTicks` 0 → `killZombie(world, id, null, "bloater_swell")` → the death blast (one path). `ZombiePool` gains `swellTicks: Uint8Array` (reset in `spawnZombie`).
3. **The death blast (`bloater.ts › onZombieKilled`).** A blast is triggered by `killZombie` of a Bloater (one hook in `zombiePool.ts › killZombie` that checks the type, no event-bus listener, so the order is deterministic). It queues `{ x, y, creditPlayerId }` into `world.blasts` (a preallocated ring, `queueCapacity`). It runs at the start of the zombies system (`processBlasts`: up to `maxBlastsPerTick`, oldest first) through 5.5's `explode(world, { kind: "bloater", radiusM 2.5, zombieDamage 40, playerDamage 30, buildingDamage 40, pushM 0.5, sourcePlayerId: null, creditPlayerId, weapon: "bloater_blast" })` (5.5's spec gains `creditPlayerId` for kill credit, separate from `sourcePlayerId`, which drives friendly fire). The 0.5 m push goes through 5.3's swept `applyKnockback` inside `explode()`. Then it spawns a gas cloud in `world.gas` (SoA pool `maxGasClouds`: x, y, endTick; the oldest is replaced when full). Timing: a Bloater killed in the combat system (bullets, melee, flames, grenades) blasts in the same tick's zombies system (`processBlasts` runs at its start); a Bloater killed **by a blast** is queued and blasts on the next tick (FR-E); a swell that ends in pass 4 explodes at once on that tick (exactly 20 ticks after it started, D6) through the same `explode()` call, without the queue. **Queue overflow:** a full queue processes the oldest at once (never drops a blast). Assert in tests that it never happens at `queueCapacity` 64 with 150 Bloaters.
4. **Gas (`bloater.ts › updateGas`, in the zombies system after `processBlasts`).** For each standing player and each live cloud: overlap + line of sight → `slowPlayer(p, gasSlowPct, ticksFor(gasLingerS))`. Expired clouds are freed. The slow is the existing synced `slowTicks`/`slowPct` (3.9), so the client's prediction moves at the server's speed once the patch arrives. It is the same latency the Crawler bite has (measure the corrections; if they are worse than the bite's, add the clouds to the Predictor from the blast events: D7).
5. **Kill credit (D2).** A Bloater killed by player X: its blast's kills and damage credit X (`zombie.killed` killer X, weapon `bloater_blast`; assists per 3.2) and pay rewards. A swell blast (nobody killed it) and a blast from a Bloater killed by fire/nobody credit nobody (like 4.8 D5). A chain passes the credit down. Turret-killed Bloaters credit the turret owner at the building share (3.6).
6. **Waves (FR29).** `waves.json`: `runWaves` 5 → **6** (if 5.7 has not already done it), a 6th `mix` entry with Bloaters (recommended `{ "walker": 40, "runner": 20, "crawler": 15, "spitter": 10, "bloater": 15 }`, reusing 5.6/5.7's keys; the Brute rule from 5.7 stays). The sizes (`waveSize`) give 240 × player scale at wave 6. `decay.json › stageByWave` already covers wave 6 (stage 3, the car fires still burn). Everything that assumed 5 waves follows `runWaves`: `RunRoom.3-10.test.ts`, `runStateMachine.test.ts`, `waveDirector.test.ts`, `config/balance.test.ts`, `decay/fire.test.ts` ("in a 5-wave run the fires burn to the end" becomes the expiry at wave 7, which never comes: they still burn to the end), `economy/fiveWaveSim.test.ts` (rename to `sixWaveSim.test.ts` or parametrise; assert every run reaches Results or a wipe, ≥ 1 wave-6 Bloater blast, and log earnings), `bots/headlessRun.ts`. Epic 6 later sets 10.
7. **Network (brief 11).** New event kinds (next free numbers): `BLOATER_SWELL_STARTED` `[k, zombieNetId]` (3–4 B) and the shared `EXPLOSION_HAPPENED` with kind `bloater` (5.5; the client spawns the gas cloud for `gasS` from it, so there is no cloud state). Non-killing blast hits on zombies are quiet (5.4). Kills, `player.damaged` (tag explosion, no source) and building HP are as usual. The swell is also visible in the horde stream as the zombie's state nibble (`SWELL`), so a client that missed the event still draws it swelling. Expected: **< 50 B/s** averaged over wave 6, with bursts ≈ 15 B × blasts in a chain tick. Report the measured numbers.
8. **Client.** (a) **Bloater look:** a round, swollen body (wider than every other type), distinct from the Brute (wide shoulders), with its own frames in `ATLAS_CHARACTERS` (`zombie_bloater_body_a/b`), `ZombieView.LOOKS.bloater` (depth, cue `zombie_bloater_gurgle` when it first enters view). (b) **Swell:** from the state nibble or the event, the sprite scales 1.0 → 1.35 over `swellS` with a pulsing sickly-green tint and a rising placeholder sound `zombie_bloater_swell`, plus a ring at the exact blast radius that fills as the fuse burns (the danger edge, like 4.8's fire ring). (c) **Blast:** 5.5's `ExplosionView` with a green-yellow variant plus gore burst (Epic 9 refines). (d) **Gas cloud:** pooled translucent cloud sprites (`fx_gas_cloud_a…`) at the exact radius, drifting slightly, fading in the last 1 s; the local player slowed by gas gets a light green screen-edge tint (4.11's screen-glow module, recoloured). (e) Readability sheet entry (brief 13).
9. **Fuzz (brief 7).** `zombies/bloater.fuzz.test.ts`: random Downtown layouts × decay stages 1–3 × 4 players × ~40 Bloaters in crowds × 4,000 ticks, killing them at random (bullets, blasts, fire): (i) every Bloater that died exploded exactly once and none that was cleared did; (ii) every swell that started ended in a blast within `swellTicks` (+ 1 queued tick); (iii) every blast hit set = an independent rewrite of overlap + line of sight; (iv) no body inside a box after the blast push; (v) no stall: zombies still reach a player; (vi) no flow-field rebuild outside a build start; (vii) the queue never overflowed; (viii) gas slowed only players with line of sight. It also runs in the existing `zombies/downtown.fuzz.test.ts` mix (add `bloater` to its type rotation).
10. **Perf and phone FPS.** Tick p99 with 4 players + 150 zombies of which 40 Bloaters, a forced 20-Bloater chain in one crowd (`PERF_ASSERT=1`, load recorded; ≤ 8 blasts per tick keeps a chain tick bounded). `?stress=150` with `?wavemix=bloater,walker` (solo override) and the stress bots firing: headless FPS before/after with load, gas clouds capped by `maxGasClouds` (24) and particles by `combat.json › fx.maxExplosionParticles` (5.5).

### Tests (Vitest)

11. `zombies/bloater.test.ts`: **both triggers** (the contact swell then a blast after exactly 1 s even though the player walked 3 m away; the death blast for each cause: bullet, melee, flame, grenade, car fire, turret, another Bloater); one blast per Bloater (killed mid-swell → one blast); **damage per target** (player 30 at 2.89 m centre-to-centre and 0 at 2.91 m for a 0.4 m body; zombie 40 with the edge per radius; another Bloater 40 → chain; building 40; downed/out 0; god mode; no FF halving when a player killed it); **gas slow** (30 % for every tick inside, 0.25 s linger, refreshing not stacking with a Crawler bite, none behind a car, zombies unaffected, gone after 4 s); cover (a car between the blast and the player: no damage; sandbags/barricade: damage); a swelling Bloater doesn't move, doesn't bite, isn't pushed; spawn distance > blast; kill credit (shot by X → its blast kills pay X; swell → nobody; chain passes credit); the queue order and the per-tick cap; same seed + input log → same digest (`snapshotWorld` gains `swellTicks`, `blasts` queue, `gas` pool).
12. Waves: wave 6 contains Bloaters at the mix share; `runWaves` 6 → `run.held_out` after wave 6; the 6-wave sim asserts waves ended (brief 15) and ≥ 1 Bloater blast in wave 6 (liveness).
13. Network: round trip for `bloater.swell_started`, the `bloater` explosion kind, `SWELL` in the state nibble with the burning bit (5.4); `sim/NetSimHost.bloater.test.ts` (swell drawn from state only, cloud from the event, removed after `gasS`); `tools/netsim/bloater.test.ts` under `?lag=150&jitter=20` (client HP = server HP after a blast, the gas slow's prediction corrections counted and reported, hidden tab across a build start: no ghost clouds, the queue and clouds cleared at the build start, late Game scene start).
14. Liveness and mutations (brief 9): M1 the swell bites instead, M2 no blast when the player leaves, M3 a double blast when killed mid-swell, M4 a chain in the same tick, M5 blasts ignore cover, M6 gas through cars, M7 friendly fire halves Bloater blasts, M8 the gas slow stacks, M9 zombies slowed, M10 the blast queue drops overflow, M11 `runWaves` stays 5. Each new test fails under at least one.

## Designer decisions to confirm

| # | Decision | Recommended | Numbers / alternative |
|---|---|---|---|
| D1 | Is a Bloater blast friendly fire (halved) when a player killed it? | **No: 30 to every player in range**, whoever killed it (it's the Bloater's attack) | The GDD's friendly-fire line lists "bloater gas". Alternative: 15 when a player triggered it. Our gas only slows, it does no damage. |
| D2 | Kill credit for blast kills | **The player who killed the Bloater** (passed down a chain); swell or fire → nobody | Alternative: nobody ever (Bloater kills as free cleanup). |
| D3 | Blast vs player buildings | **40 damage** (GDD story: "the bloater took out our whole barricade") | Alternative: 0, or 3× like the Brute. |
| D4 | Chain timing | **Next tick per link, ≤ 8 blasts per tick** | Same-tick chains are instant but unreadable and unbounded. |
| D5 | Bloater body radius | **0.5 m** (round, wider; readability) | 0.35 m like the others keeps the 4.5 reachability unchanged. |
| D6 | Swell length incl. the queue tick | **Blast lands exactly 20 ticks after the swell starts** (the swell blast runs immediately, not queued) | Queued = 21 ticks (1.05 s). |
| D7 | Gas slow prediction | **Use 3.9's synced slow** (same latency as a Crawler bite); add clouds to the Predictor only if corrections are worse | — |
| D8 | Swelling Bloater movement | **Stands still** (you can outrun it: 4.5 m/s × 1 s > 2.5 m + body) | Alternative: keeps walking at 0.9 m/s. |
| D9 | Wave 6 mix | **walker 40 / runner 20 / crawler 15 / spitter 10 / bloater 15** (+ 5.7's Brute rule) | Bloater 15 % of 240 = 36 at 4 players. |
| D10 | Art pick | One of ~5 Meshy proposals (T0) | — |

## Beat the rule (reviewers: try each, record the result)

1. **Outrun the swell:** touch a Bloater, then run. Expected: the blast always happens 1 s later; at 4.5 m/s you clear the 2.9 m danger edge in time. Check the ring shows it.
2. **Bait it into the crowd:** let a Bloater swell in a crowd. Expected: 40 to every zombie in range, chains to other Bloaters one tick per link, no double blasts.
3. **Kill it in a teammate's face:** shoot a Bloater next to a teammate. Expected: 30 to the teammate (D1). Is that griefing? Record it and let the designer decide D1.
4. **Hide behind a car:** expected: no damage and no gas through the car; the blast hits through sandbags/barricades.
5. **Melee a Bloater:** expected: the Machete/Axe kill blasts you for 30 (the "careless melee" lesson). With the 5.2 Fire Axe knockback of 1.5 m, does the knocked-back Bloater still catch you? Record the distances.
6. **Bloaters at spawns:** stand 6 m from a spawn, then 5 m with a grenade. Expected: fresh Bloaters never blast you on spawn (FR-G); blasting the spawn is allowed.
7. **Chain overload:** 40 Bloaters packed and one grenade. Expected: the chain takes ⌈40 / 8⌉ ≥ 5 ticks or more by links, with no tick over budget and no blast lost.
8. **Gas + Crawler:** expected: the slow is max(30 %, 30 %), not 60 %, and the timer refreshes.
9. **Swell while downed/out:** a Bloater touching a downed player. Expected: no swell (contact is with standing players only).
10. **Event loss / lag:** drop `bloater.swell_started`. Expected: the swell is still drawn from the state nibble. Drop `explosion.happened`: no cloud is drawn, but the server slow still applies; record the readability cost.

## Tasks / Subtasks

- [ ] **T0 Art pick first:** ~5 Meshy proposals (`nano-banana-pro`, the 4.11 style line) for (a) the Bloater seen from directly above (round, swollen, torn shirt stretched over a bloated belly, sickly skin, clearly wider than a Walker and different from a Brute), (b) its swollen state (the same, close to bursting, glowing veins), (c) the gas cloud (a low yellow-green fog disc on wet asphalt) and the blast (a gory burst with a gas puff). Publish a private proposal page and **wait for the designer's pick**. Record it in `docs/art/5-8/README.md` (4.11 format). Frames: `zombie_bloater_body_a/b`, `zombie_bloater_swell_a`, `fx_gas_cloud_a…`, `fx_explosion_bloater_a`.
- [ ] **T1 Balance + schema (AC 1, 6):** the `explodes` block in `zombieTypeSchema` (optional, refines), `zombies.json › blasts`, `bloater` type, `waves.json` (`runWaves` 6, mix row 6), `ZOMBIE_TYPES`/`ZOMBIE_STATE` append, `loadBalance` checks (mix ids exist). Tests: `balance.test.ts`.
- [ ] **T2 AI + swell (AC 2):** `zombies/bloater.ts`, hooks in `zombieAi.ts` (passes 1, 2, 4), `swellTicks` in `zombiePool.ts`. Tests in `bloater.test.ts`.
- [ ] **T3 Blasts + chain + credit (AC 3, 5):** the `killZombie` hook, the `world.blasts` ring, `processBlasts` at the start of the zombies system, the 5.5 `explode()` call with `kind: "bloater"` (append it to `EXPLOSION_KINDS`) and `creditPlayerId`. Tests.
- [ ] **T4 Gas (AC 4):** `world.gas` pool, `updateGas`, the 3.9 slow. Tests.
- [ ] **T5 Waves (AC 6, 12):** update every 5-wave assumption (list above); the 6-wave sim with liveness.
- [ ] **T6 Copies (brief 2):** World (`blasts`, `gas`, pool `swellTicks`) → `snapshotWorld` → schema (none; `slowTicks`/`slowPct` already synced) → `syncState` (none) → key lists (none) → mirror (`mirrorZombies`: `SWELL` state; `NetSimHost` cosmetic clouds from events) → Predictor (none, D7) → devThrottle (none). `netEvents.ts` (swell kind; explosion kind index), `hordeFormat.ts` (state value ≤ 7 test).
- [ ] **T7 Client (AC 8):** `ZombieView` look + swell animation + fuse ring, `render/GasView.ts` (pooled clouds), the bloater variant of `ExplosionView`, the gas screen tint, sounds, the readability sheet.
- [ ] **T8 Network tests (AC 13).**
- [ ] **T9 Fuzz + mutations (AC 9, 14).**
- [ ] **T10 Bandwidth + perf + phone FPS (AC 7, 10):** extend `weaponBandwidth.test.ts` (or a new `bloaterBandwidth.test.ts`), `tickCostDowntown.test.ts` (40 Bloaters + a forced chain), `?stress=150&wavemix=bloater,walker`.
- [ ] **T11 Browser + gates + merge notes:** Playwright solo `?wavemix=bloater` (touch → swell → blast after 1 s; a chain; gas slow on the HUD), online 2 players under lag.

## Dev Notes

### Current state (read before changing)

- `zombies/zombieTypes.ts`: `ZOMBIE_TYPES = ["walker", "crawler", "runner"]` (5.6 and 5.7 append theirs first), `ZOMBIE_STATE = { FREE, CHASE, RUSH }` (5.6 likely adds `WINDUP`), `maxZombieRadius` cached per Balance.
- `zombies/zombieAi.ts`: pass 4 holds the contact + `damagePlayer(world, target, stats, id)` (to be `damagePlayerBy` after 5.4) with the attack cooldown; the separation pass; `steerByField`; `hasBuildings` push-out (`pushOutOfBuildings`). A Bloater must branch **before** `damagePlayer` in pass 4.
- `zombies/zombiePool.ts › killZombie(world, id, killerId, weapon, buildingId)` frees the slot (held `ZOMBIE_SLOT_HOLD_TICKS`) and emits `zombie.killed`. **Read the position before freeing** for the blast; the queued blast stores x/y, not the id.
- `player/slow.ts › slowPlayer(p, pct, ticks)` (max pct, max ticks; synced `slowTicks`/`slowPct`, uint8), `movePlayers` uses `playerSpeed`.
- `waves/waveDirector.ts › waveSize`, `waves.json › mix` (5 rows; later waves use the last row), `runWaves` 5 (`runStateMachine.ts:90`).
- `combat/cover.ts › shotLineClear` (4.2). `decay/fire.ts` (4.8): car fire kills credit nobody (`killZombie(world, id, null, "fire")`), so a Bloater killed by car fire blasts with no credit.
- Client: `ZombieView.LOOKS` is `satisfies Record<ZombieTypeId, …>` (a new type must add its look), `spriteAtlas.ts › ZOMBIE_VARIANTS / ZOMBIE_FRAMES`, `spriteArt.ts › drawZombie` + `CHAR_EXTENT_R`, `shriekCue.ts` (3.8 signature cue pattern: reuse it for the gurgle).

### Round C interface contract (identical in 5.4, 5.5, 5.8)

- `combat/damage.ts` (owner 5.4): `DAMAGE_TAGS`, `damagePlayerBy(world, target, amount, tag, sourcePlayerId, sourceZombieId = -1)` (no `sourcePlayerId` → no friendly-fire scaling), `applyZombieDamage(…, opts?: { quiet?: boolean })`.
- `combat/explosion.ts` (owner 5.5): `EXPLOSION_KINDS` (5.8 appends `"bloater"`), `ExplosionSpec` (5.8 adds `creditPlayerId?: string | null`, which defaults to `sourcePlayerId`), `explode(world, spec)`, which is cover-checked, hits each body once and emits one `explosion.happened`.
- `player.damaged` = `{ playerId, amount, sourceZombieId, tag, sourcePlayerId }`.
- If 5.8 starts before 5.5 lands: write against this exact `explode` signature with a local stub and take 5.5's at merge. Never keep two blast functions.

### Copies touched (brief 2)

World (`blasts` ring, `gas` pool, `ZombiePool.swellTicks`) → `snapshotWorld` (all three) → schema / `syncState` / `stateView` key lists / `fakeRoom` / devThrottle: none (the slow is already synced) → mirror: `mirrorZombies` (the state nibble `SWELL`), `NetSimHost` cosmetic clouds → Predictor: none (D7). Events: `netEvents.ts`.

### Must be preserved

The 4.5 reachability (every stage × variant) and spawn clearance at the new max radius; the 3.4/3.5 push-out and building attack; the 3.9 slow semantics; the 4.8 fire tests (with 6 waves); horde record size (8 B); `SYSTEM_ORDER`; balance frozen except the new entries and `runWaves`.

### Dependencies

- **5.5** (round C): `explode()`, `ExplosionView`. **5.4** (round C): `damagePlayerBy`, quiet hits, the burning bit (the state values must stay ≤ 7).
- **5.6** (round A): Spitter appended to `ZOMBIE_TYPES`, its state (windup), its mix key; the first zombie with a special state. Follow its pattern.
- **5.7** (round B): the Brute, the wave-5 rule, possibly `runWaves` 6 already, the knockback factor (Brute × 0.2 for blast pushes).
- **5.9** (round A): mines/spikes kill Bloaters → blasts (no special code needed; add a test row).
- **5.2 / 5.3** (round B/A): knockback from melee and pellets can push a Bloater out of contact. The swell keeps going once started (FR-A).
- **3.9** (slow), **4.2** (cover), **4.8** (fire kills), **4.11** (screen-edge glow and damage numbers: reuse them, recoloured green for gas).

### Phone FPS plan

Bloaters are one more character frame set in `ATLAS_CHARACTERS` (no extra draw calls). The swell is a scale + tint tween on the existing sprite plus one pooled fuse ring per swelling Bloater (≤ 16). Gas clouds are 2 pooled sprites each, capped by `maxGasClouds` 24. Blasts reuse 5.5's pooled `ExplosionView` with particles capped by `fx.maxExplosionParticles`. Chain ticks spawn ≤ 8 explosions per tick, so the effect cost is bounded too.

### Notes for the merge

- `zombies/zombieTypes.ts`: `"bloater"` appended (resolve the order against 5.6/5.7: **append order = merge order**, never reorder) and `SWELL` appended.
- `zombies/zombiePool.ts`: `swellTicks`, the blast hook in `killZombie`. `zombies/zombieAi.ts`: Bloater branches in passes 1/2/4. New `zombies/bloater.ts`.
- `combat/explosion.ts`: `bloater` kind, `creditPlayerId`.
- `core/world.ts`: `blasts`, `gas`. `core/worldSnapshot.ts`: the three new parts (digests change).
- `config/balance/waves.json` (`runWaves`, mix row 6), `zombies.json` (type + `blasts`), `balanceSchema.ts`.
- Tests that assume 5 waves (listed in AC 6). `net/netEvents.ts` (+1 kind).
- Client: `ZombieView.ts`, `spriteAtlas.ts`/`spriteArt.ts`, new `GasView.ts`, `ExplosionView.ts` variant, readability sheet.

### References

- `planning-artifacts/epics.md` › Epic 5 intro ("the temporary run grows to 6 waves… Bloaters (W6)"), Story 5.8; FR24, FR29, FR57 (Bloater gas), FR84 (telegraphs).
- GDD › Enemy table (Bloater row), Telegraphs ("swells for 1 s"), Introduction order (W6 +Bloaters), Difficulty curve (wave 6 "Chaos"), Readability rules ("Bloater round"), Zombie cues ("Bloater swelling"), Friendly fire line; `gdds/.../decision-log.md` 2026-11-21 (explodes on death AND contact).
- Architecture › Entity Patterns (`swell` state in the pool, factories + pools), `bloater.test.ts` named as the example test, Networking (events: explosions, telegraphs).
- Story files 3.8 (Runner cue), 3.9 (slow), 4.2, 4.5 (reachability), 4.8 (fire credit, fairness model), 5.4, 5.5; `docs/art/4-11/README.md`.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
