---
baseline_commit: e2399a6ff7d2fe38b709c3b56827a90d2a3241e7
---

# Story 5.6: Spitters

Status: review

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

- [x] **T0 Art pick first (AC 17)** — before client art (sim work may start in parallel)
  - [x] 0.1 ~5 Meshy proposals each (`nano-banana-pro`, text to image; shared style line from `docs/art/4-11/README.md`: "strict top-down orthographic, gritty realistic, night, wet asphalt, cool streetlight from the upper left, muted, crisp silhouette, no text"): (a) the Spitter seen from directly above: hunched, bloated throat sac, mouth glowing acid green (idle and "rearing back" windup poses); (b) the spit blob in flight (glowing green glob with a short trail); (c) the acid puddle 2 m across (bubbling green, hissing smoke, a crisp edge). One private proposal Artifact page, like 4.11.
  - [x] 0.2 Designer picks; save to `docs/art/5-6/` + `README.md` (file, use, footprint: body radius 0.35 m, puddle radius 1.0 m; prompt).
  - [x] 0.3 Then draw: `render/city/spriteArt.ts › drawZombie` spitter + `CHAR_EXTENT_R.spitter`, frames `zombie_spitter_walk_*`, `zombie_spitter_windup`, `fx_spit_glob_01`, `fx_acid_puddle_01…` (≤ 2048² atlas, `category_name_variant`).
- [x] **T1 Balance (AC 1, 5, 15)**
  - [x] 1.1 `config/balanceSchema.ts › zombieTypeSchema`: optional `spit` block (strict, refines as in `decaySchema.fire`). Top-level `zombies.json › spitCaps { maxLiveSpits, maxLivePuddles }` (or inside `spit`; one place).
  - [x] 1.2 `zombies.json`: `spitter` (hp 12, speedMps 1.5, damage = contact/building hit, see DD2, attackIntervalS 1.0, radiusM 0.35, reward 5, spit {…}).
  - [x] 1.3 `zombies/zombieTypes.ts`: append `"spitter"` to `ZOMBIE_TYPES` (wire index 3; append-only) and `ZOMBIE_STATE.WINDUP = 3`, `RUSH_WINDUP = 4` (nibble ≤ 15; a rushing Spitter still winds up).
  - [x] 1.4 `waves.json › mix`: wave 4 `{ walker 50, runner 25, crawler 17, spitter 8 }`, wave 5 `{ walker 45, runner 25, crawler 22, spitter 8 }` (DD3). `loadBalance` already checks mix types exist.
  - [x] 1.5 Tests `config/balance.test.ts`: "spitter matches the GDD", "old types have no spit block", "refuses a spit pulse that is not whole ticks / not whole damage"; `waves/waveDirector.test.ts`: "wave 4 has spitters (exact share), waves 1–3 none".
- [x] **T2 Spitter AI (AC 2, F1, F6)** in `zombies/zombieAi.ts` (pass 1) + new `zombies/spitter.ts`
  - [x] 2.1 Per-zombie state in `zombies/zombiePool.ts`: `spitTicks: Uint16Array` (windup countdown, then cooldown), `spitTarget: Int8Array` (player index, −1). 0 on spawn.
  - [x] 2.2 For types with `spit`: if cooling down → count down; if `d ≤ rangeM` to the nearest alive player and `shotLineClear(world, x, y, p.x, p.y)`: velocity 0 (crowd separation still applies), state WINDUP (or RUSH_WINDUP), `spitTicks = ticksFor(windupS)`; at 0: re-check range + line on the same target (F1) → spawn a spit (T3) and `spitTicks = ticksFor(intervalS − windupS)` cooldown (3 s from spit to spit includes the next windup: DD1); else cancel (state back, may re-arm next tick). Out of range / no line → walk as a Walker (chase field / straight).
  - [x] 2.3 Buildings: a Spitter whose field leads into a building attacks it like any zombie (existing pass 4, `stats.damage`).
  - [x] 2.4 Tests `zombies/spitter.test.ts` (new; `systems: { waves: () => {} }`): "walks in until 6 m, then stops", "no windup behind a car / the bus (F3)", "winds up behind a barricade and spits over it (F3)", "windup lasts exactly 12 ticks, then one spit", "3 s spit to spit", "target out of sight at release → no spit (F1)", "a downed target is never aimed at (F5)", "rushing Spitter still winds up and is marked".
- [x] **T3 Spits (AC 3, F2, F3)** new `zombies/spitPool.ts` (SoA, pre-allocated `maxLiveSpits`, like `combat/projectilePool.ts`)
  - [x] 3.1 Fields: x, y, dirX, dirY, rangeLeftM, owner zombie slot, damage (from the type). Spawn at mouth (`radiusM + 0.1` along the aim, reuse `MUZZLE_OFFSET_M`) toward the target's position at release; range = distance to that point (≤ `rangeM + puddleRadiusM`).
  - [x] 3.2 Flight each tick (in the `zombies` slot after the AI, or the `specialEvents` slot: pick one, document in `core/systems.ts`; NOT predicted): swept segment vs `shotBlockT` (stop at the face) and vs every standing player circle grown by the spit radius (`segmentCircleT` from `math/sweep.ts`); first contact wins: player → `damagePlayer`-equivalent (15, source acid/spit) and puddle at the hit point; cover → puddle at the face point; range end → puddle at the aim point.
  - [x] 3.3 Events: `spitter.spat { zombieId, x, y, toX, toY }` at release; `acid.splashed { puddleId, x, y, hitPlayerId | null }` at the end.
  - [x] 3.4 Tests `zombies/spit.test.ts` (new): "flies at 9 m/s and lands at the release-time aim point", "a sidestepping player starting at the windup is never hit from ≥ 2 m (F2, all angles × ranges 2–6 m)", "hits the first player on its line, not only the target", "stops at a car face (F3)", "passes a barricade and sandbags (F3)", "cap: the 25th spit is not spawned, the Spitter re-arms (AC 15)".
- [x] **T4 Acid puddles (AC 4, F4, F5)** new `hazards/acidPool.ts` (or `zombies/acid.ts`; see DD5: the area pool 5.8's gas cloud and 5.12's molotov can reuse)
  - [x] 4.1 SoA pool (`maxLivePuddles`): x, y, radiusM, ticksLeft, id (u16 counter). Oldest-first replacement at the cap.
  - [x] 4.2 Damage pass (the `decayTimers` slot next to `updateFires`, or the same slot as spit flight): per standing player, if inside any puddle (strict circle overlap, no stacking) `p.acidTicks++`; when it reaches `ticksFor(puddlePulseS)` → `puddleDamagePerS × puddlePulseS` damage (2), reset. Kept while outside (4.8 D3), reset at every build start (4.8 D19 `resetBurnClocks` pattern). Puddles count down and are freed at 0; all puddles and spits are cleared at a build start (no acid in the build phase: DD4).
  - [x] 4.3 `player.damaged` source: today `sourceZombieId < 0` means fire (`apps/client/src/render/fireCue.ts › isFireHit`, wire encodes every negative as −1). Add a distinct source: `sourceZombieId` −2 = acid (spit and puddle) with the encode/decode in `net/netEvents.ts` keeping −1 / −2 apart; `isFireHit` checks `=== -1`. If Story 5.4 has landed its damage-source tags, use those instead (merge notes).
  - [x] 4.4 Tests `hazards/acid.test.ts` (new): "5 damage per second of exposure (2 every 0.4 s)", "in 7 ticks, out 1, repeat: still 5/s (F4 dodge test)", "two overlapping puddles don't stack", "touching the edge ring counts, 1 cm outside doesn't (strict)", "downed / out players untouched (F5)", "zombies and buildings untouched", "puddle ends after 3 s", "build start clears puddles and spits and resets clocks", "cap replaces the oldest".
- [x] **T5 Determinism and copies (brief 2, 8)**
  - [x] 5.1 No randomness is needed (aim is the target's position). If any is added, only from `world.streams.combat` (or a new named stream `zombies` in `core/seedStreams.ts › STREAM_NAMES`: append-only).
  - [x] 5.2 `core/worldSnapshot.ts`: spits, puddles, `spitTicks`, `spitTarget`, players' `acidTicks`. Replay test in `core/determinism.test.ts` or `replay/` with spitters: same seed + input log → same digest; ≥ 1 spit and ≥ 1 acid hit in the run (liveness).
- [x] **T6 Network (AC 13, 14, 18)**
  - [x] 6.1 `net/netEvents.ts`: new kinds `SPITTER_SPAT: 27`, `ACID_SPLASHED: 28` (check the highest number on the merged branch first: 5.3/5.4/5.5/5.8/5.9 add kinds too; never reuse) with round-trip tests in `net/netEvents.test.ts`.
  - [x] 6.2 `apps/server/src/net/eventInterest.ts`: both are **local** events (the pattern of `turret.fired`): sent to a client whose view rect contains the spit's start or end point / the puddle (+ `HORDE_VIEW_MARGIN_M`); acid `player.damaged` stays global. Test in `eventInterest.test.ts`.
  - [x] 6.3 `net/hordeFormat.ts`: the state nibble carries WINDUP / RUSH_WINDUP (no format change). `apps/server/src/net/hordeEncoder.ts`: verify the state is written as-is (test).
  - [x] 6.4 Client: `apps/client/src/sim/NetSimHost.ts` keeps a cosmetic spit pool (flies from the event at the render tick toward `toX/toY`, stops on `acid.splashed` or at its end) and a cosmetic puddle pool (from `acid.splashed`, lifetime `puddleS` from the event tick; dropped on `build.started`). Solo (`LocalSimHost`) draws from the World's pools directly. Mirror (`net/mirrorZombies.ts`) copies the state nibble already.
  - [x] 6.5 Bandwidth test `apps/server/src/run/spitBandwidth.test.ts` (new, the pattern of `turretBandwidth.test.ts`): a wave 4 with spitters (4 players) and a stress case (20 Spitters in range of one player, god mode): events B/s per client; assert ≤ estimate × 1.5. Liveness: ≥ 10 spits, ≥ 5 puddle hits.
  - [x] 6.6 Netsim `tools/netsim/spit.test.ts` (new): `?lag=150&jitter=20` harness: server and client spit landing points agree within 1 cm; client HP == server HP; the F2 dodge (sidestep at windup start) is never hit on the server at ranges 2–6 m over 20 seeds; hidden tab slept across a spit and a build start → no stale spits/puddles (AC 18).
- [x] **T7 Client look and sound (AC 6, 16, 17)**
  - [x] 7.1 `render/ZombieView.ts › LOOKS`: `spitter` (depth like a Walker, cue `zombie_spitter_gurgle`); windup frame + a pulsing green mouth glow while the state is WINDUP/RUSH_WINDUP; the gurgle plays on the transition into WINDUP (shriek-cue pattern in `render/shriekCue.ts`, positional, one per windup).
  - [x] 7.2 New `render/SpitView.ts` (pooled glob sprites, ≤ `maxLiveSpits`, a short arc offset for the lob look; the sim path stays straight) and `render/AcidView.ts` (pooled puddles ≤ `maxLivePuddles`, crisp edge ring at exactly `puddleRadiusM` like `render/city/fireRing.ts`; ring test "touching the ring ⇔ the sim's inside test" against the shared helper).
  - [x] 7.3 HUD: the local player in acid sees an "Acid" hurt cue (green screen-edge tint + damage numbers), driven by `player.damaged` source −2, reusing 4.11's burning-cue/damage-number code (dependency) or `fireCue.ts`'s pattern if 4.11 isn't merged.
  - [x] 7.4 `audio/placeholderSfx.ts`: `zombie_spitter_gurgle`, `zombie_spitter_spit`, `fx_acid_hiss` synth placeholders.
  - [x] 7.5 `debug/stressScenario.ts`: honour `?wavemix=` for the stress crowd (e.g. `walker,spitter`) so spits fly at the god-mode player; test in `stressScenario.test.ts`.
- [x] **T8 Fuzz, sims, perf, browser (brief 7, 9, 15, 16)**
  - [x] 8.1 `zombies/downtown.fuzz.test.ts`: add Spitters to the fuzz mix (every stage, random barricades/turrets): no Spitter centre in a box; every layout ≥ 1 spit and ≥ 1 puddle; every wave with Spitters ends (all spawned zombies die or the test's bot kills them) — no Spitter waits forever without a line; spits never cross a shot blocker (independent segment test). Liveness counts printed.
  - [x] 8.2 `economy/fiveWaveSim.test.ts` + `tools/sims/fiveWave.ts`: Spitters in waves 4–5 (6 once 5.8 is merged): every wave ended, ≥ 1 spit hit, earnings per wave reported against the 4.10 decision (kill reward 5).
  - [x] 8.3 `apps/server/src/run/tickCostDowntown.test.ts`: a wave with 20 Spitters + 130 others (PERF_ASSERT=1), p99 and load recorded; budget part of the 2 ms total.
  - [x] 8.4 `?stress=150&wavemix=walker,spitter` headless FPS before/after with load.
  - [x] 8.5 Playwright: solo with `?wavemix=spitter` and `DEV_*`-free cheats: screenshot windup, spit in flight, puddle; online two tabs, `?lag=150&jitter=20`.
  - [x] 8.6 Mutations (brief 9): e.g. "no windup", "aim leads the player", "shared pulse instead of per-body clock", "clock reset on leaving", "puddles stack", "spit ignores cars", "spit stops at barricades", "downed players take acid", "Spitter never walks when it lost the line" — each must fail a listed test.
- [x] **T9 Gates, readability sheet, merge notes**: typecheck, lint, test, build merged with the work branch; sheet rows (Spitter, puddle); "Notes for the merge".

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

Claude Opus 5.5 (claude-opus-5-5), builder in worktree `.claude/worktrees/story-5-6` (branch `story-5-6`), 2026-11-23. Ports: Vite 5637, server 4637 (a baseline copy was served on 5638 for a few minutes for the FPS "before").

### Debug Log References

- **Worktree setup gotcha (sent to the coordinator):** a worktree whose `node_modules` is a symlink to the main checkout resolves `@topdown/shared|client|server` to the MAIN checkout's packages (`node_modules/@topdown/*` are relative links), and shares `.vitest-cache`/`.vite`/`.vite-temp` with every other worktree. Server/client typechecks and tests ran against main's shared code and vitest served stale transformed modules ("isRushState is not a function"). Fixed here only: `node_modules` is now a real directory of links to the main entries except `@topdown` (local absolute links to this worktree) and the three cache dirs (local, empty). Other builders likely need the same.
- First full run after the shared changes: 7 failures, all from adding a 4th zombie type: the 4.5/4.7/4.8 "every type from every spawn reaches the team" tests and the 4.1 fuzz count a zombie as arrived within 3 m; a Spitter stops at 6 m. Rule added to those tests: a Spitter in its windup (in range, clear shot line) has reached the team. Wave-mix count tests updated to the new mix (DD3).
- Browser: the first look had the Spitter half a Walker's bulk (a dot) and clipped glow squares around the glob and the Spitter frames (glows larger than the frame). Fixed: `SPITTER_ART_SCALE` 1.6, every glow kept inside its frame, darker gowns so the green jaw carries the silhouette. Standing Spitters faced +x (no movement heading): a winding-up Spitter now faces the nearest standing player (client only).

### Completion Notes List

**What was built (all player rules F1–F7 are tests):**
- **Balance** (`zombies.json`, `balanceSchema.ts`): `spitter` (hp 12, 1.5 m/s, bite 5 / 1 s = DD2, radius 0.35, reward 5) with a `spit` block (range 6, windup 0.6, interval 3, 9 m/s, glob radius 0.2, damage 15, puddle 1 m / 3 s / 5 per s / pulse 0.4); refines: whole ticks, whole pulse damage, interval > windup. Caps `zombies.json › spitCaps` {24, 32}. `waves.json`: W4 {50/25/17/8}, W5 {45/25/22/8} (wave 4 at 4 players = 81/40/27/12 Spitters, solo 5).
- **Types/states**: `ZOMBIE_TYPES` + `spitter` (wire 3), `ZOMBIE_STATE.WINDUP 3`, `RUSH_WINDUP 4`; `isRushState`/`isWindupState` used by every rush check (wave rush keeps a windup as RUSH_WINDUP; flank-field liveness; horde rushers; HUD chevrons).
- **AI** (`zombies/spit.ts › spitterStep`, called in pass 1 of `updateZombies`): nearest standing player within range with `shotLineClear` → stop, windup 12 ticks (state streamed), release re-checks range + line on the same target (F1, else no spit), aim = the target's position at release (F2), cooldown so spit-to-spit is exactly 60 ticks, holds its spot while cooling with a target; otherwise walks like a Walker (field when blocked; bites and hits buildings like any zombie: F6). Dead Spitters spit nothing.
- **Spits** (`zombies/spitPool.ts`, dense SoA sized by the cap; `updateSpits` in the `zombies` slot after the AI): swept segment vs `shotBlockT` (cars, bus, map boxes stop it at the face; barricades/turrets/sandbags/barriers don't) and every standing player's circle grown by the glob radius; first contact wins: 15 damage (`player.damaged` source **−2**), puddle at the contact point; cover → puddle at the face; else the aim point. Over the cap: no spit, the Spitter re-arms.
- **Acid** (`hazards/areaPool.ts`, generic area pool for 5.8/5.12 (D5), oldest replaced at the cap; `updateAcid`): per-player `acidTicks` clock (4.8 D3 rule), strict circle overlap, no stacking, standing players only (F5), puddles live exactly 60 ticks; `clearAcid` at every build start (`startBuild`) clears spits, puddles and clocks (DD4).
- **Snapshot/determinism**: spits, areas, `spitTicks`, `spitTarget`, players' `acidTicks` in `snapshotWorld`. No randomness added. The 4.4 replay test now also asserts ≥ 1 spit, splash and acid hit with the same digest.
- **Wire** (`netEvents.ts`): `SPITTER_SPAT 27` `[27, netId, spitId, cm x, cm y, cm toX, cm toY]` (≤ 20 B msgpack), `ACID_SPLASHED 28` `[28, id, cm x, cm y, slot]` (≤ 13 B); `player.damaged` keeps −1 (fire) and −2 (acid) apart. Server `EventInterest`: both are local (spat: mouth or flight end in view; splash: centre). Windup = horde state nibble (0 B; test in `hordeEncoder.test.ts`).
- **Client**: `render/acidFx.ts` (cosmetic spits + puddles from events in both modes; build.started clears; late start sees only later puddles), `render/AcidView.ts` (pooled glob + shadow per spit slot, one puddle image per puddle slot; lob drawn as a scale/lift arc, the path stays straight; puddle frame's outer ring = the damage edge), `render/spitCue.ts` (gurgle on the windup transition, panned, rate-limited; windup pulse scale), `ZombieView` (spitter look, windup frame + pulse + facing), acid hurt cue (`isAcidHit`, `routeAcidHit`, green edge glow, "Acid" HP text, "-2" pops), `isFireHit` is now `=== -1`. Sounds: `zombie_spitter_gurgle`, `zombie_spitter_spit`, `fx_acid_hiss` (synth placeholders).
- **Art** (designer's art method: game code, T0 Meshy step skipped as instructed): `render/city/spitterArt.ts › drawSpitter` is a port of the **round-2 P2 "Spitter, thin woman"** (from the coordinator's scratchpad compare page) — one function, so the designer's final pick (P2 / P4) drops in there; frames `zombie_spitter_a|b`, `zombie_spitter_windup_a|b` (atlas_characters), `fx_spit_glob_01`, `fx_acid_puddle_01|02` (atlas_fx). Readability sheet rows 16 (Spitter) and 17 (acid puddle) + answer key.
- **Dev**: `?stress=N&wavemix=walker,spitter` puts the types in the stress crowd.

**Tests** (new/extended): `zombies/spitter.test.ts` (15), `zombies/spit.test.ts` (7, incl. F2 960 sidestep cases: 816 spits, 0 hits), `hazards/acid.test.ts` (9), `render/acidFx.test.ts` (7), `run/spitBandwidth.test.ts` (2), `tools/netsim/spit.test.ts` (3), plus additions in netEvents, eventInterest, hordeEncoder, stressScenario, replay, fiveWaveSim, downtown fuzz, tickCostDowntown, waveDirector. Full suite: **1,467 passed, 3 skipped** (201 files).

**Fuzz** (48 Downtown layouts, every stage, random barricades/turrets, Spitters in the random mix + a stray glob every 2 s from open street): 4,155 spits, 4,128 puddles, 2,309 spit hits, 576 spits stopped on cover; an independent sampled-segment check finds no spit crossing a car, the bus or a map box; every surviving Spitter reached the team (windup) and spat.

**Sims**: 5-wave bot sim (2/3/4 bots × 3 seeds): 9 runs reached wave 4: 36 spits, 35 spit hits, 199 puddle hits; held out 8/9 (2p seed 1 now wipes in W5; before the story 9/9). Earned per player mean 2p 619 → 610, 3p 558 → 577, 4p 530 → 542 (Spitter reward 5). 6-wave sim: not possible yet (`runWaves` is 5 until 5.8).

**Mutations** (each run once against its test; 20 mutants): killed — no windup; aim leads the player (spit.test F2 and netsim F2); shared pulse; clock reset on leaving; puddles stack; spit ignores cars (spit.test and, after adding stray globs, the fuzz: the first fuzz version did NOT kill it, Spitters never spit through cover by construction); spit stops at barricades; Spitter never walks without a line; no release re-check; no line check at windup; build start keeps puddles; cap refuses the new puddle; acid shown as fire; acid encoded as fire; spat sent to everyone; client glob not ended by its splash; stress wavemix ignored; no spit ever spawns (replay, bandwidth, five-wave, tick-cost liveness). **Survived (equivalent):** "downed players take acid" in `acidPlayer` (the same status guard sits in `acidDamage`); first cap mutant (`cap = capacity + 1`: the pool is sized to the cap, so it is equivalent; replaced by the "refuses the new one" mutant, killed).

**Beat the rule** (my attempts, for the reviewer to repeat): (1) in 7 / out 1 → 17 hits in 140 inside ticks = exactly 5/s (test); (2) edge ring: −1 mm inside hurts, +1 cm doesn't, drawn ring = `circleInAcid` (tests); (3) behind barricade / turret / sandbags / barrier → spit lands (test); behind car / bus → no windup (test), a glob already flying stops at the face (test); (4) duck behind a car mid-windup → no spit (test); a Spitter without a line walks round a bus wall and spits (test); (5) sidestep under `?lag=150&jitter=20` when the client sees the windup → 100 cases, 0 hits (netsim); standing still → always hit; (6) 20 Spitters on one player / 75 in `?stress` → caps hold (32 puddles, ≤ 24 globs), god mode holds, waves end in the sims; (7) kill during windup → no spit (test); (8) downed in a puddle → no damage, reviver standing in it takes acid (test); (9) acid on zombies, barricades, turrets → nothing (test); (10) hidden tab across a spit and a build start → no stale glob/puddle (netsim + acidFx test). Not tried: knockback during a windup (5.3 not merged; the windup keeps its own countdown and ignores position changes by design).

**Numbers**
- **Bandwidth** (per client, events only; windup 0 B): stress 20 Spitters on one god-mode player: 6.7 spits/s, **+192 B/s** (estimate 160); wave 4 Downtown, 4 players with their 12 Spitters standing in the open: 44 spits / 30 s, **+107 B/s** each (spits + splashes + acid damage). Far inside 30 KB/s.
- **Tick cost** (`tickCostDowntown`, PERF_ASSERT=1): 150 Walkers p99 0.677 ms vs 130 Walkers + 20 Spitters p99 0.708 ms (**+0.031 ms p99**, mean +0.000), 169 spits; load 2.31 (other builders on the box; > 1, so a noisy number).
- **Headless FPS** (Chromium SwiftShader, 844 × 390 DPR 2, rAF over 20 s after 5 s; the box was busy with other builders, load 3.4–7.2): before (base commit, `?stress=150`) 8.4 / 8.6 / 7.8 / 6.6; after, Walkers only 6.9 / 7.9; after, `?stress=150&wavemix=walker,spitter` (puddles at the 32 cap, globs flying) first version 5.3 / 7.5, then — after dropping a per-puddle ADD glow quad (fill-bound on the CPU rasterizer) — **8.8 / 11.3**. Within the noise of this box; no measurable loss. Not measured on a phone.
- `uptime` at the gate: see the commit message.

### Notes for the merge (builder)

| Shared file | What 5.6 changed (my blocks) | Merge with 5.3 / 5.9 / others |
| --- | --- | --- |
| `packages/shared/src/zombies/zombieTypes.ts` | `spitter` appended (index 3); `WINDUP 3`, `RUSH_WINDUP 4`; `isRushState`, `isWindupState` | append later types/states after these; keep every rush check on `isRushState` |
| `config/balance/zombies.json`, `config/balanceSchema.ts` | `types.spitter` (+ `spit` block), top-level `spitCaps`; `spitSchema`, `spitCapsSchema`, `SpitStats`; `zombiesSchema` gains `spitCaps` | other zombie fields (knockback resistance…) go beside `spit` |
| `config/balance/waves.json` | `mix[3]`, `mix[4]` | re-derive with 5.7/5.8's types; `waveDirector.test.ts` counts change with it |
| `core/world.ts` | `spits`, `areas` (+ imports) | 5.9 traps/mines may add pools: separate fields |
| `core/systems.ts` | `updateZombieSlot` = AI + `updateSpits` + `updateAcid` in the `zombies` slot (specialEvents untouched) | if 5.9 uses the zombies slot, chain inside `updateZombieSlot` |
| `core/simEvents.ts` | `DAMAGE_SOURCE_FIRE/ACID`, events `spitter.spat`, `acid.splashed` | 5.4's damage-source tags would replace the −2 constant |
| `net/netEvents.ts` (+ test) | kinds 27/28, encode/decode, damage source −1/−2 | **5.9 likely also took 27/28: renumber at merge (never reuse)**; update the round-trip list |
| `core/worldSnapshot.ts` | zombie `spitTicks`/`spitTarget`, `spits`, `areas` | add others beside |
| `zombies/zombieAi.ts` | `spitterStep` call in pass 1 (`holds`), `collectStanding`, `isRushState` | 5.3 knockback (`knockShot`) touches pass 2/4, not this block |
| `zombies/zombiePool.ts` | `spitTicks`, `spitTarget` (+ reset on spawn) | |
| `run/runStateMachine.ts` | `clearAcid(world)` in `startBuild` | |
| `player/player.ts` | `acidTicks` | |
| `index.ts` | exports at the end + `isRushState`, `isWindupState`, `DAMAGE_SOURCE_*` | union the export lists |
| `waves/waveDirector.ts`, `zombies/flowField.ts` | rush uses `isRushState` / RUSH_WINDUP | |
| `apps/server/src/net/eventInterest.ts` (+ test), `hordeEncoder.ts` (+ test) | 2 local kinds; rushers via `isRushState` | |
| `apps/client/src/render/ZombieView.ts`, `city/spriteArt.ts`, `city/spriteAtlas.ts` | spitter look, windup frames, `CHAR_EXTENT_R.spitter`, FX frames | 5.9 adds objects-atlas frames: different atlas |
| `apps/client/src/scenes/GameScene.ts`, `HudScene.ts`, `hudModel.ts` | AcidFx/AcidView, acid cue, green glow, "Acid" text, stress `wavemix` | |
| `render/fireCue.ts`, `burnCue.ts` | `isFireHit === -1`, `isAcidHit`, `ACID_CUE_MS`, `FireCue(cueMs)`, `routeAcidHit` | |
| tests touched for the 4th type | `decay.test`, `fire.test`, `panic.test`, `downtown.fuzz.test` (windup = reached; spit checks + stray globs), `slow.test` | 5.7/5.8 new types need the same "reached" rule if they stand off |

### Merge with the work branch (5.3 + 5.9), 2026-11-23

- **Event kinds renumbered:** 5.9 owns 27 (`building.upgraded`) and 28 (`mine.exploded`); Spitters now use **`SPITTER_SPAT 29`, `ACID_SPLASHED 30`**.
- **Damage source:** 5.9 took −2 for blasts (`DAMAGE_SOURCE_EXPLOSION`) and sends every negative source as-is. **Acid is now `DAMAGE_SOURCE_ACID = −3`**: fire is −1, blasts −2, acid −3; each has its own client cue (fire burns, acid shows "Acid" in green, blasts show no cue).
- **5.9 floor buildings:** spits fly over spike traps and mines like over barricades. Spits only test map shot blockers and standing players (test added). The windup's line check ignores player buildings too.
- **5.3 knockback during a windup (rule):** a knock moves the Spitter's body and cancels nothing. The windup plays out, and the release re-checks range and line from where the Spitter now stands. Knocked out of range or behind a car → no spit (F1); otherwise it spits from the new spot (test: pushed 0.5 m → spits, 2.5 m → none).
- **F6 with the 5 m Shotgun (new rule):** the 5.3 knockback fuzz (one Shotgun player standing still from wave 4) stalled. Spitters held 6 m, out of the Shotgun's 5 m range. Rule now: in the wave's last rush (FR30) a Spitter still winds up and spits, but **walks in between spits** instead of holding its spot, so the wave always ends (test added). Outside the rush it still holds 6 m.
- **Bots (merge):** `bots.json › closeInExtraM` 2 (new, schema default 0). A bot whose nearest zombie stands just beyond its weapon's range (≤ 2 m more) steps toward it. Without it, Shotgun bots never shot back at Spitters. The 5.3 gun sim now starts its bots with 500 (`economy.startingWallet` override in that test only): Spitters wipe the pistol bots in wave 4 before they can save 450 for the Assault Rifle. That test checks that the guns kill, not survival.
- **Readability sheet:** 5.3 has rows 16–17 and 5.9 has 18–21; Spitter and puddle are now rows **22–23** (`objects/23_spitter.png`, `24_acid_puddle.png`).
- **Zombie pool and snapshot:** all fields kept. 5.3 `knockShot`/`knockHead`, 5.9 `trapTicks`/`slowPct`, 5.6 `spitTicks`/`spitTarget`.

### Not verified

- **Phone FPS** (only headless SwiftShader on a busy box, load 3–7; the numbers are noise-level). The 4.10 phone floor must be rechecked with `?stress=150&wavemix=walker,spitter`.
- **Online with two tabs**: the browser check ran ONE online tab (server 4637, `DEV_WAVE_MIX=spitter,walker`, `?lag=150&jitter=20`): windups seen in the mirror, globs and puddles from events, the "Acid" cue and HP from the server, no page errors. The second tab's join (code scraping) failed in my script, so two-client visuals were not checked; the netsim covers two-way lag logic for one client.
- Sounds were not listened to (headless); the gurgle/spit/hiss are synth placeholders.
- Knockback during a windup (5.3 not merged). Late Game scene start was tested in the cosmetic model (unit test), not in a browser.
- The 6-wave sim (needs 5.8). Bot survival is not difficulty evidence; the 5-wave sim shows one more 2p wipe in W5.
- The designer's final Spitter pick (P2 vs P4) is open: P2 round 2 is ported; P4 would replace `drawSpitter`.

### File List

- `packages/shared/src/zombies/spit.ts` (new), `zombies/spitPool.ts` (new), `hazards/areaPool.ts` (new)
- `packages/shared/src/zombies/spitter.test.ts` (new), `zombies/spit.test.ts` (new), `hazards/acid.test.ts` (new)
- `packages/shared/src/config/balance/zombies.json`, `config/balance/waves.json`, `config/balanceSchema.ts`
- `packages/shared/src/core/simEvents.ts`, `core/systems.ts`, `core/world.ts`, `core/worldSnapshot.ts`, `index.ts`
- `packages/shared/src/net/netEvents.ts`, `net/netEvents.test.ts`
- `packages/shared/src/player/player.ts`, `player/slow.test.ts`
- `packages/shared/src/run/runStateMachine.ts`, `waves/waveDirector.ts`, `waves/waveDirector.test.ts`
- `packages/shared/src/zombies/zombieAi.ts`, `zombies/zombiePool.ts`, `zombies/zombieTypes.ts`, `zombies/flowField.ts`, `zombies/downtown.fuzz.test.ts`
- `packages/shared/src/decay/decay.test.ts`, `decay/fire.test.ts`, `decay/panic.test.ts`, `economy/fiveWaveSim.test.ts`, `replay/replay.test.ts`
- `apps/server/src/net/eventInterest.ts`, `net/eventInterest.test.ts`, `net/hordeEncoder.ts`, `net/hordeEncoder.test.ts`, `run/spitBandwidth.test.ts` (new), `run/tickCostDowntown.test.ts`
- `apps/client/src/render/acidFx.ts` (new), `render/acidFx.test.ts` (new), `render/AcidView.ts` (new), `render/spitCue.ts` (new), `render/city/spitterArt.ts` (new)
- `apps/client/src/render/ZombieView.ts`, `render/fireCue.ts`, `render/burnCue.ts`, `render/city/spriteArt.ts`, `render/city/spriteAtlas.ts`
- `apps/client/src/scenes/GameScene.ts`, `scenes/HudScene.ts`, `scenes/hudModel.ts`, `audio/placeholderSfx.ts`, `debug/stressScenario.ts`, `debug/stressScenario.test.ts`
- `tools/netsim/spit.test.ts` (new)
- `docs/art/epic-5/round-a/ingame/5-6-spitters-stress.png`, `5-6-acid-hurt-cue.png` (new)
- `docs/playtests/milestone-1/readability-sheet.md`, `readability-key.md`, `objects/17_spitter.png`, `objects/18_acid_puddle.png` (new)
- `_bmad-output/implementation-artifacts/5-6-spitters.md`

## Change Log

- 2026-11-23: Story 5.6 built (Spitters: AI, spits, acid puddles, wire events, client look/sound/cue, tests, fuzz, sims, bandwidth, browser check). Status → review.
