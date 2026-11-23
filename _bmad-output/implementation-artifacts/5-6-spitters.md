# Story 5.6: Spitters

Status: ready-for-dev

## Story

As a player,
I want Spitters that hang back and spit acid,
so that camping behind turrets has a price.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full (builders and reviewers: check each line):
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
> Most relevant here: 3 (the puddle and dodge rules below), 5 (spit flies over barricades and sandbags, stops at cars/bus/buildings; the client's copy lands where the server's lands), 6 (acid on a per-body clock, like 4.8's fire), 7 (Spitters stand off: fuzz that waves still end), 9 (≥ 1 spit, ≥ 1 puddle hit in every sim), 10 (pooled spits and puddles, caps in balance), 11 (spits and puddles are events), 12 (`?stress` with spitters), 13 (silhouette with a glowing mouth), 14 (dodging under `?lag=150&jitter=20`), 15 (5- then 6-wave sim).

## Acceptance Criteria

### Gameplay (from `epics.md` › Story 5.6, GDD › Enemy Design and AI)

1. **Spitter type** (`zombies.json › types.spitter`): 12 HP, 1.5 m/s, 15 damage per spit, reward 5, radius 0.35 m (FR23). New fields in `zombieTypeSchema` (all with defaults so the old types are unchanged): a `spit` block — `rangeM` 6, `windupS` 0.6, `intervalS` 3, `speedMps` 9, `radiusM` 0.2, `puddleRadiusM` 1.0, `puddleS` 3, `puddleDamagePerS` 5, `puddlePulseS` 0.4 (`puddleDamagePerS × puddlePulseS` whole, `pulseS` whole ticks: the 4.8 refine pattern).
2. **Stand off and spit.** A Spitter walks like a Walker (chase field when blocked) until an alive player is within `rangeM` (centre to centre) with a clear line (`shotLineClear`: no car, bus or building in between). Then it stops, rears back with a glowing mouth for `windupS` (0.6 s, the telegraph, FR84), and spits a visible projectile at that player; then it waits `intervalS` (3 s from the spit) before the next windup. While it waits it keeps its spot (no closing in) as long as the target stays in range and in sight; otherwise it walks again.
3. **Spit.** The spit flies straight at `speedMps` from the mouth toward the target's position **at the moment of release**, up to `rangeM + puddleRadiusM`. It hits the first standing player whose body it touches (15 damage, any player, not only the target), or stops at a car / the bus / a building (4.2 shot blockers), or lands at its aim point. Barriers, sandbags and player buildings don't stop it (it arcs over them: lobbed look).
4. **Acid puddle.** Wherever the spit ends (player hit, cover face, landing point) it leaves an acid puddle of `puddleRadiusM` for `puddleS` (3 s) that deals `puddleDamagePerS` (5/s) to standing players inside it.
5. **Waves.** `waves.json › mix`: Spitters join in wave 4 (and stay in wave 5) (FR29); the GDD introduction order W4 +Spitters.
6. **Sound.** A placeholder gurgle (`zombie_spitter_gurgle`) plays during every windup the local player can see (and hear: positional fall-off like the Runner shriek, Story 3.8 `shriekCue.ts`).

### Fairness rules (brief line 3; player-visible, each is tested)

7. **F1 Every spit is announced.** No spit leaves a Spitter without a full 0.6 s windup (glowing mouth + gurgle) that every client in view sees (state in the horde stream). Knockback, damage or losing the target during the windup cancels nothing visible: if the target is out of sight or range at release, the spit is cancelled (no spit, the windup simply ends) and the Spitter may wind up again after `windupS`.
8. **F2 You can always dodge.** The spit aims at where you are at release, not where you will be. A survivor who starts moving sideways (4.5 m/s) when the windup starts is never hit at any range ≥ 2 m, including under `?lag=150&jitter=20` (netsim).
9. **F3 Cover rule.** A car, the bus or a building between you and the Spitter means no windup at all (no line), and a spit already flying stops at their face. Barricades, turrets, sandbags and barriers never protect you (the spit goes over them): this is the "camping has a price" rule.
10. **F4 Standing in acid always hurts at 5/s.** Each player has their own acid clock (ticks spent inside any puddle since their last acid hit, kept while outside, the 4.8 D3 rule): every 0.4 s of exposure costs 2 HP. Stepping in and out never dodges damage. Overlapping puddles don't stack. "Inside" = the body circle overlaps the puddle circle (strict), the same rule the client draws (a crisp edge ring at exactly `puddleRadiusM`: touching the ring = burning, 4.8 D16).
11. **F5 Acid only hurts standing players.** Downed and out players take no spit or acid damage (4.8 D4); zombies, buildings and turrets take none.
12. **F6 Spitters can't stall a wave.** A Spitter with no line keeps walking toward the players (field), attacks buildings in its way like every zombie, and at the wave's last rush (FR30) it is marked like the others. Every wave with Spitters ends in the sims (liveness).
13. **F7 Server truth.** Damage and HP come from the server; the client draws the spit's flight and the puddle where the server says (events), and the windup from the horde stream state.

### Netcode, perf, readability (brief lines 11–14)

14. **Bandwidth.** Windups travel in the horde stream's state nibble (0 B extra); spits and puddles are events (`spitter.spat`, `acid.splashed`); acid damage uses `player.damaged` with a distinct acid source. Added B/s measured and reported (estimate below).
15. **Caps.** `zombies.json › spit.maxLiveSpits` 24 and `maxLivePuddles` 32 (balance, zod): a spit over the cap is not spawned (the windup still plays: the Spitter re-arms); the oldest puddle ends when a new one would exceed the cap. Pools, no allocation per tick or frame.
16. **Phone FPS.** `?stress=150&wavemix=walker,spitter` (god mode: spits fly constantly) reports headless FPS before/after with load; spit and puddle sprites are atlased and pooled.
17. **Readability.** The Spitter has its own silhouette (hunched, swollen throat, glowing green mouth; GDD › readability rules), distinct from Walker/Runner/Crawler at a glance; the puddle reads as acid (green, bubbling, sharp edge). Added to `docs/playtests/milestone-1/readability-sheet.md` (+ answer key).
18. **Lifecycle.** A hidden tab that slept across a spit and a build start shows no stale spits or puddles; a late Game scene start draws only puddles still alive.

## Tasks / Subtasks

- [ ] **T0 Art pick first (AC 17)** — before client art (sim work may start in parallel)
  - [ ] 0.1 ~5 Meshy proposals each (`nano-banana-pro`, text to image; shared style line from `docs/art/4-11/README.md`: "strict top-down orthographic, gritty realistic, night, wet asphalt, cool streetlight from the upper left, muted, crisp silhouette, no text"): (a) the Spitter seen from directly above: hunched, bloated throat sac, mouth glowing acid green (idle and "rearing back" windup poses); (b) the spit blob in flight (glowing green glob with a short trail); (c) the acid puddle 2 m across (bubbling green, hissing smoke, a crisp edge). One private proposal Artifact page, like 4.11.
  - [ ] 0.2 Designer picks; save to `docs/art/5-6/` + `README.md` (file, use, footprint: body radius 0.35 m, puddle radius 1.0 m; prompt).
  - [ ] 0.3 Then draw: `render/city/spriteArt.ts › drawZombie` spitter + `CHAR_EXTENT_R.spitter`, frames `zombie_spitter_walk_*`, `zombie_spitter_windup`, `fx_spit_glob_01`, `fx_acid_puddle_01…` (≤ 2048² atlas, `category_name_variant`).
- [ ] **T1 Balance (AC 1, 5, 15)**
  - [ ] 1.1 `config/balanceSchema.ts › zombieTypeSchema`: optional `spit` block (strict, refines as in `decaySchema.fire`). Top-level `zombies.json › spitCaps { maxLiveSpits, maxLivePuddles }` (or inside `spit`; one place).
  - [ ] 1.2 `zombies.json`: `spitter` (hp 12, speedMps 1.5, damage = contact/building hit, see DD2, attackIntervalS 1.0, radiusM 0.35, reward 5, spit {…}).
  - [ ] 1.3 `zombies/zombieTypes.ts`: append `"spitter"` to `ZOMBIE_TYPES` (wire index 3; append-only) and `ZOMBIE_STATE.WINDUP = 3`, `RUSH_WINDUP = 4` (nibble ≤ 15; a rushing Spitter still winds up).
  - [ ] 1.4 `waves.json › mix`: wave 4 `{ walker 50, runner 25, crawler 17, spitter 8 }`, wave 5 `{ walker 45, runner 25, crawler 22, spitter 8 }` (DD3). `loadBalance` already checks mix types exist.
  - [ ] 1.5 Tests `config/balance.test.ts`: "spitter matches the GDD", "old types have no spit block", "refuses a spit pulse that is not whole ticks / not whole damage"; `waves/waveDirector.test.ts`: "wave 4 has spitters (exact share), waves 1–3 none".
- [ ] **T2 Spitter AI (AC 2, F1, F6)** in `zombies/zombieAi.ts` (pass 1) + new `zombies/spitter.ts`
  - [ ] 2.1 Per-zombie state in `zombies/zombiePool.ts`: `spitTicks: Uint16Array` (windup countdown, then cooldown), `spitTarget: Int8Array` (player index, −1). 0 on spawn.
  - [ ] 2.2 For types with `spit`: if cooling down → count down; if `d ≤ rangeM` to the nearest alive player and `shotLineClear(world, x, y, p.x, p.y)`: velocity 0 (crowd separation still applies), state WINDUP (or RUSH_WINDUP), `spitTicks = ticksFor(windupS)`; at 0: re-check range + line on the same target (F1) → spawn a spit (T3) and `spitTicks = ticksFor(intervalS − windupS)` cooldown (3 s from spit to spit includes the next windup: DD1); else cancel (state back, may re-arm next tick). Out of range / no line → walk as a Walker (chase field / straight).
  - [ ] 2.3 Buildings: a Spitter whose field leads into a building attacks it like any zombie (existing pass 4, `stats.damage`).
  - [ ] 2.4 Tests `zombies/spitter.test.ts` (new; `systems: { waves: () => {} }`): "walks in until 6 m, then stops", "no windup behind a car / the bus (F3)", "winds up behind a barricade and spits over it (F3)", "windup lasts exactly 12 ticks, then one spit", "3 s spit to spit", "target out of sight at release → no spit (F1)", "a downed target is never aimed at (F5)", "rushing Spitter still winds up and is marked".
- [ ] **T3 Spits (AC 3, F2, F3)** new `zombies/spitPool.ts` (SoA, pre-allocated `maxLiveSpits`, like `combat/projectilePool.ts`)
  - [ ] 3.1 Fields: x, y, dirX, dirY, rangeLeftM, owner zombie slot, damage (from the type). Spawn at mouth (`radiusM + 0.1` along the aim, reuse `MUZZLE_OFFSET_M`) toward the target's position at release; range = distance to that point (≤ `rangeM + puddleRadiusM`).
  - [ ] 3.2 Flight each tick (in the `zombies` slot after the AI, or the `specialEvents` slot: pick one, document in `core/systems.ts`; NOT predicted): swept segment vs `shotBlockT` (stop at the face) and vs every standing player circle grown by the spit radius (`segmentCircleT` from `math/sweep.ts`); first contact wins: player → `damagePlayer`-equivalent (15, source acid/spit) and puddle at the hit point; cover → puddle at the face point; range end → puddle at the aim point.
  - [ ] 3.3 Events: `spitter.spat { zombieId, x, y, toX, toY }` at release; `acid.splashed { puddleId, x, y, hitPlayerId | null }` at the end.
  - [ ] 3.4 Tests `zombies/spit.test.ts` (new): "flies at 9 m/s and lands at the release-time aim point", "a sidestepping player starting at the windup is never hit from ≥ 2 m (F2, all angles × ranges 2–6 m)", "hits the first player on its line, not only the target", "stops at a car face (F3)", "passes a barricade and sandbags (F3)", "cap: the 25th spit is not spawned, the Spitter re-arms (AC 15)".
- [ ] **T4 Acid puddles (AC 4, F4, F5)** new `hazards/acidPool.ts` (or `zombies/acid.ts`; see DD5: the area pool 5.8's gas cloud and 5.12's molotov can reuse)
  - [ ] 4.1 SoA pool (`maxLivePuddles`): x, y, radiusM, ticksLeft, id (u16 counter). Oldest-first replacement at the cap.
  - [ ] 4.2 Damage pass (the `decayTimers` slot next to `updateFires`, or the same slot as spit flight): per standing player, if inside any puddle (strict circle overlap, no stacking) `p.acidTicks++`; when it reaches `ticksFor(puddlePulseS)` → `puddleDamagePerS × puddlePulseS` damage (2), reset. Kept while outside (4.8 D3), reset at every build start (4.8 D19 `resetBurnClocks` pattern). Puddles count down and are freed at 0; all puddles and spits are cleared at a build start (no acid in the build phase: DD4).
  - [ ] 4.3 `player.damaged` source: today `sourceZombieId < 0` means fire (`apps/client/src/render/fireCue.ts › isFireHit`, wire encodes every negative as −1). Add a distinct source: `sourceZombieId` −2 = acid (spit and puddle) with the encode/decode in `net/netEvents.ts` keeping −1 / −2 apart; `isFireHit` checks `=== -1`. If Story 5.4 has landed its damage-source tags, use those instead (merge notes).
  - [ ] 4.4 Tests `hazards/acid.test.ts` (new): "5 damage per second of exposure (2 every 0.4 s)", "in 7 ticks, out 1, repeat: still 5/s (F4 dodge test)", "two overlapping puddles don't stack", "touching the edge ring counts, 1 cm outside doesn't (strict)", "downed / out players untouched (F5)", "zombies and buildings untouched", "puddle ends after 3 s", "build start clears puddles and spits and resets clocks", "cap replaces the oldest".
- [ ] **T5 Determinism and copies (brief 2, 8)**
  - [ ] 5.1 No randomness is needed (aim is the target's position). If any is added, only from `world.streams.combat` (or a new named stream `zombies` in `core/seedStreams.ts › STREAM_NAMES`: append-only).
  - [ ] 5.2 `core/worldSnapshot.ts`: spits, puddles, `spitTicks`, `spitTarget`, players' `acidTicks`. Replay test in `core/determinism.test.ts` or `replay/` with spitters: same seed + input log → same digest; ≥ 1 spit and ≥ 1 acid hit in the run (liveness).
- [ ] **T6 Network (AC 13, 14, 18)**
  - [ ] 6.1 `net/netEvents.ts`: new kinds `SPITTER_SPAT: 27`, `ACID_SPLASHED: 28` (check the highest number on the merged branch first: 5.3/5.4/5.5/5.8/5.9 add kinds too; never reuse) with round-trip tests in `net/netEvents.test.ts`.
  - [ ] 6.2 `apps/server/src/net/eventInterest.ts`: both are **local** events (the pattern of `turret.fired`): sent to a client whose view rect contains the spit's start or end point / the puddle (+ `HORDE_VIEW_MARGIN_M`); acid `player.damaged` stays global. Test in `eventInterest.test.ts`.
  - [ ] 6.3 `net/hordeFormat.ts`: the state nibble carries WINDUP / RUSH_WINDUP (no format change). `apps/server/src/net/hordeEncoder.ts`: verify the state is written as-is (test).
  - [ ] 6.4 Client: `apps/client/src/sim/NetSimHost.ts` keeps a cosmetic spit pool (flies from the event at the render tick toward `toX/toY`, stops on `acid.splashed` or at its end) and a cosmetic puddle pool (from `acid.splashed`, lifetime `puddleS` from the event tick; dropped on `build.started`). Solo (`LocalSimHost`) draws from the World's pools directly. Mirror (`net/mirrorZombies.ts`) copies the state nibble already.
  - [ ] 6.5 Bandwidth test `apps/server/src/run/spitBandwidth.test.ts` (new, the pattern of `turretBandwidth.test.ts`): a wave 4 with spitters (4 players) and a stress case (20 Spitters in range of one player, god mode): events B/s per client; assert ≤ estimate × 1.5. Liveness: ≥ 10 spits, ≥ 5 puddle hits.
  - [ ] 6.6 Netsim `tools/netsim/spit.test.ts` (new): `?lag=150&jitter=20` harness: server and client spit landing points agree within 1 cm; client HP == server HP; the F2 dodge (sidestep at windup start) is never hit on the server at ranges 2–6 m over 20 seeds; hidden tab slept across a spit and a build start → no stale spits/puddles (AC 18).
- [ ] **T7 Client look and sound (AC 6, 16, 17)**
  - [ ] 7.1 `render/ZombieView.ts › LOOKS`: `spitter` (depth like a Walker, cue `zombie_spitter_gurgle`); windup frame + a pulsing green mouth glow while the state is WINDUP/RUSH_WINDUP; the gurgle plays on the transition into WINDUP (shriek-cue pattern in `render/shriekCue.ts`, positional, one per windup).
  - [ ] 7.2 New `render/SpitView.ts` (pooled glob sprites, ≤ `maxLiveSpits`, a short arc offset for the lob look; the sim path stays straight) and `render/AcidView.ts` (pooled puddles ≤ `maxLivePuddles`, crisp edge ring at exactly `puddleRadiusM` like `render/city/fireRing.ts`; ring test "touching the ring ⇔ the sim's inside test" against the shared helper).
  - [ ] 7.3 HUD: the local player in acid sees an "Acid" hurt cue (green screen-edge tint + damage numbers), driven by `player.damaged` source −2, reusing 4.11's burning-cue/damage-number code (dependency) or `fireCue.ts`'s pattern if 4.11 isn't merged.
  - [ ] 7.4 `audio/placeholderSfx.ts`: `zombie_spitter_gurgle`, `zombie_spitter_spit`, `fx_acid_hiss` synth placeholders.
  - [ ] 7.5 `debug/stressScenario.ts`: honour `?wavemix=` for the stress crowd (e.g. `walker,spitter`) so spits fly at the god-mode player; test in `stressScenario.test.ts`.
- [ ] **T8 Fuzz, sims, perf, browser (brief 7, 9, 15, 16)**
  - [ ] 8.1 `zombies/downtown.fuzz.test.ts`: add Spitters to the fuzz mix (every stage, random barricades/turrets): no Spitter centre in a box; every layout ≥ 1 spit and ≥ 1 puddle; every wave with Spitters ends (all spawned zombies die or the test's bot kills them) — no Spitter waits forever without a line; spits never cross a shot blocker (independent segment test). Liveness counts printed.
  - [ ] 8.2 `economy/fiveWaveSim.test.ts` + `tools/sims/fiveWave.ts`: Spitters in waves 4–5 (6 once 5.8 is merged): every wave ended, ≥ 1 spit hit, earnings per wave reported against the 4.10 decision (kill reward 5).
  - [ ] 8.3 `apps/server/src/run/tickCostDowntown.test.ts`: a wave with 20 Spitters + 130 others (PERF_ASSERT=1), p99 and load recorded; budget part of the 2 ms total.
  - [ ] 8.4 `?stress=150&wavemix=walker,spitter` headless FPS before/after with load.
  - [ ] 8.5 Playwright: solo with `?wavemix=spitter` and `DEV_*`-free cheats: screenshot windup, spit in flight, puddle; online two tabs, `?lag=150&jitter=20`.
  - [ ] 8.6 Mutations (brief 9): e.g. "no windup", "aim leads the player", "shared pulse instead of per-body clock", "clock reset on leaving", "puddles stack", "spit ignores cars", "spit stops at barricades", "downed players take acid", "Spitter never walks when it lost the line" — each must fail a listed test.
- [ ] **T9 Gates, readability sheet, merge notes**: typecheck, lint, test, build merged with the work branch; sheet rows (Spitter, puddle); "Notes for the merge".

## Dev Notes

### Decisions (non-interactive; designer confirms the player-facing ones below)

- **D1 Spit flies straight, drawn as a lob.** A straight server path makes "over barricades, stopped by cars" a single `shotBlockT` test and keeps client and server identical; the client adds a visual arc only.
- **D2 Aim at the release-time position, no lead** (F2). At 6 m the flight takes 0.67 s; a sidestepping survivor moves 3 m: always clear. A standing camper is always hit.
- **D3 Events, not schema.** The architecture lists hazard zones in schema, but brief line 11 and the bandwidth goal favour events: puddles live ≤ 3 s, never across a build start (they are cleared), and no mid-wave joins exist (joins are build-phase only), so a late joiner never needs them. A late Game scene start mid-wave misses puddles spawned before it (≤ 3 s, cosmetic only: damage is server truth) — documented, tested as "draws only puddles still alive" from events received after start.
- **D4 Acid source on the wire:** `sourceZombieId` −2 (or 5.4's tag). Without it 4.8's `isFireHit` would show "Burning" for acid.
- **D5 One area pool.** The puddle pool is written generic (`hazards/areaPool.ts`: centre, radius, ticks left, kind, per-body clock rule) so 5.8's gas cloud (slow) and 5.12's molotov fire zone (8/s) reuse it. 4.8's car fires stay in `decay/fire.ts`.
- **D6 Windup state in the horde stream** (`ZOMBIE_STATE` nibble): the telegraph is visible to every client in view with no extra bytes, and it is exactly the server's windup.
- **D7 Spitter contact damage and building hits** use `stats.damage` like every zombie (DD2).

### Current state (read before changing)

- `zombies/zombieAi.ts › updateZombies`: pass 1 desired velocity (nearest alive player, LOS via `segmentHitsBuildings` + `segmentHitsFire`, flank/chase field), pass 2 move, pass 3 overlaps, pass 4 contact bite (`damagePlayer`: alive only, god mode, `player.damaged`, `downPlayer`), push-out, building attack. Nothing ranged exists.
- `zombies/zombieTypes.ts`: `ZOMBIE_TYPES = ["walker","crawler","runner"]` (append-only, wire index), `ZOMBIE_STATE { FREE, CHASE, RUSH }`.
- `net/hordeFormat.ts`: typeState byte = type (low nibble) | state (high nibble).
- `combat/cover.ts › shotBlockT / shotLineClear`: `world.obstacles.shotBlockers` (cars, bus, buildings of the map; not barriers/sandbags; not player buildings).
- `decay/fire.ts › updateFires` (the `decayTimers` slot): the per-body clock template (player `fireTicks`, 4.8 D3/D19).
- `apps/client/src/render/fireCue.ts › isFireHit`: `sourceZombieId < 0` (must become `=== -1`).
- `apps/server/src/net/eventInterest.ts`: local-event pattern for `turret.fired`.
- `waves.json › mix` index 3 (wave 4) `{ walker 55, runner 25, crawler 20 }`, `runWaves` 5 (5.8 makes it 6).

### Copies touched (brief line 2)

World (`zombies.spitTicks/spitTarget`, spit pool, puddle pool, players' `acidTicks`) → schema: none → syncState: none → stateView key lists: none → mirror: horde state nibble (existing), cosmetic spits/puddles from events in `NetSimHost` → Predictor: none (acid never slows; HP is server truth) → devThrottle: events pass through the throttle's event queue (verify spits are delayed like other events under `?lag`) → `snapshotWorld`: spits, puddles, clocks.

### Must be preserved

Walker/Runner/Crawler behaviour and every existing zombie test; 4.8 fire cue (fire hits still show "Burning"); horde frame size (8 B/record); 3.10 exact wave shares; the balance freeze for existing numbers (only wave 4–5 mixes gain spitters, decided here).

### Bandwidth estimate (AC 14)

- `spitter.spat` ≈ 14 B, `acid.splashed` ≈ 10 B → ~24 B per spit. Wave 4 at 4 players: 160 × 8 % ≈ 13 Spitters; if all were in range at once: 13 / 3 s ≈ 4.3 spits/s ≈ **105 B/s** (local events: only clients that see them).
- Acid and spit `player.damaged` ≈ 7 B: 2.5/s per player standing in acid ≈ 18 B/s each → ≤ 70 B/s for 4.
- Windups: 0 B (horde nibble). **Total ≈ 0.2 KB/s worst case**, far inside 30 KB/s.

### Phone FPS plan (AC 16)

Pools sized by the caps (24 spits, 32 puddles), one image each, created once; the puddle ring and bubbles are frames of one atlas (≤ 2048²), no per-frame Graphics redraw; the windup glow is a tint/scale tween on the existing zombie image (no new object). Measure `?stress=150&wavemix=walker,spitter` headless before/after with `uptime` load; the 4.10 phone floor (avg ≥ 50, worst second ≥ 30) must hold.

### Beat the rule (for the reviewer; list every attempt and its result)

1. Step in and out of a puddle on the pulse (in 7 ticks, out 1): any damage dodged? (F4)
2. Stand exactly on the edge ring: hurt? 1 cm outside: hurt? Does the drawn ring match? (F4)
3. Hide behind a barricade / turret wall / sandbags: does the spit still reach you? (it must; F3) Behind a car or the bus? (it must not)
4. Bait the windup, then duck behind a car before release: does it still spit? (no; F1) Does the Spitter get stuck forever outside range with no line? (F6)
5. Sidestep at windup start under `?lag=150&jitter=20`: ever hit? (F2)
6. Stack 10 Spitters on one corner: cap holds, frame rate holds, waves end?
7. Kill the Spitter during the windup: spit still comes? (no: a dead Spitter spits nothing; test)
8. Get downed in a puddle: does acid finish you / shorten the countdown? (no; F5) Revive inside acid: the reviver takes damage (yes, standing), the downed player doesn't.
9. Lure Spitter acid onto zombies or barricades: any damage? (no)
10. Hidden tab across a spit and a build start: stale glob/puddle on return?

### Dependencies on other Epic 5 stories

- **4.11** (being built on another branch): burning cues and damage numbers; acid's hurt cue reuses them. Merge after 4.11 or keep the cue behind the `fireCue.ts` pattern.
- **5.4 Flamethrower / friendly fire:** damage-source tags in the combat damage system; acid uses them if merged first (D4).
- **5.7 Brute, 5.8 Bloater:** also append `ZOMBIE_TYPES` and states (Bloater SWELL) and wave mixes; 5.8 adds the 6th wave (Spitters stay in it: full mix from W7 in Epic 6). 5.8's gas cloud reuses the area pool (D5).
- **5.12 Consumables:** the molotov fire zone reuses the area pool.
- **5.3 Shotgun:** knockback moves a Spitter during its windup; the windup is not cancelled (test in 5.3 or here, whichever merges second).

### Notes for the merge

| Shared file | What 5.6 changes | Likely conflicts |
| --- | --- | --- |
| `zombies/zombieTypes.ts` | appends `spitter`, states WINDUP/RUSH_WINDUP | 5.7 (brute), 5.8 (bloater, SWELL): append in merge order; indices go on the wire |
| `config/balance/zombies.json`, `config/balanceSchema.ts › zombieTypeSchema` | `spitter`, `spit` block, caps | 5.7 (`buildingDamageMult`, knockback resistance), 5.8 (`blast` block) |
| `config/balance/waves.json › mix` | waves 4–5 | 5.7 (Brute in 5), 5.8 (6 waves, Bloaters): re-derive the table at merge, keep every type's intro wave |
| `zombies/zombieAi.ts`, `zombies/zombiePool.ts` | spitter branch, per-zombie spit state | 5.3 (`knockShot`), 5.4 (ignite), 5.7, 5.8 |
| `core/systems.ts` | the slot that flies spits / ticks puddles (document it) | 5.4/5.5/5.8/5.12 area and projectile updates |
| `net/netEvents.ts`, `core/simEvents.ts` | 2 new kinds, acid source | every Epic 5 story adds kinds: take the next free numbers at merge |
| `apps/server/src/net/eventInterest.ts` | 2 local kinds | 5.5 (grenade lobs), 5.8 (blasts) |
| `apps/client/src/render/fireCue.ts`, `render/ZombieView.ts`, `render/city/spriteArt.ts` | acid ≠ fire, spitter look | 4.11 (fire cues, sprites), 5.7, 5.8 |
| `core/worldSnapshot.ts` | spits, puddles, clocks | every story adding sim state |

### Designer decisions to confirm

| # | Decision | Recommended |
| --- | --- | --- |
| DD1 | Spit rhythm | **3 s from spit to spit, the 0.6 s windup included** (2.4 s idle + 0.6 s windup) |
| DD2 | Spitter up close | **Weak bite 5 dmg / 1 s** and building hits 5 (so it can break through and waves end); no retreat/kiting in 5.6 |
| DD3 | How many | **8 % of waves 4–5** (≈ 13 of 160 at 4 players, ≈ 5 solo) |
| DD4 | Puddle size and timing | **Radius 1.0 m, 3 s, 5 dmg/s as 2 HP every 0.4 s**; direct hit 15; spit speed 9 m/s; cleared at every build start |
| DD5 | What the spit passes | **Over barricades, turrets, sandbags, barriers; stopped by cars, the bus, buildings** (the "camping costs" rule) |
| DD6 | Caps | **24 live spits, 32 live puddles** (oldest puddle ends first) |
| DD7 | Look | **Designer picks from ~5 Meshy proposals** each: Spitter (idle + windup), spit glob, acid puddle (T0) |

### References

- `_bmad-output/planning-artifacts/epics.md` › Epic 5 intro (6-wave temporary run), Story 5.6; GDD › Enemy Design and AI (table, Telegraphs, AI, Introduction order), Audio (Spitter gurgle), Art (readability rules: Spitter with a glowing mouth), Hazards (acid puddles).
- `game-architecture.md` › Other entities (hazard zones), naming (`zombie_spitter_*`), balance access.
- Story files 2.5 (horde stream), 3.8 (Runner shriek cue), 3.9 (Crawler: a new type end to end), 3.10 (wave mix), 4.2 (cover), 4.8 (per-body clock D3/D19, ring = rule D16, D4 downed spared).
- `HANDOFF.md` §3 (ticks; no per-tick allocation; the per-client guard; `systems: { waves: () => {} }`).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
