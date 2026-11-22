# Story 3.8: Runners flank

Status: done

## Story

As a player,
I want fast Runners that go around our front line,
so that we have to watch our sides.

> **Epic 2 retro (2026-11-22): the "EPIC 3 BRIEF" is this story's checklist** (lines 2, 3, 6, 10, 11, 12, 14, 15, 18, 20 apply most). Line 10 is central again: a **second** flow field joins the one from Story 3.5. Its goal (the players) moves every tick **and so does its penalty** (the players' aim). State the cadence and the shared rebuild budget, benchmark 4 players + 150 zombies (Walkers + Runners) + 24 buildings with **added tick p99 ≤ 2 ms**, and have a stale test for the flank field.

## Acceptance Criteria

1. **Stats (FR21).** A Runner zombie type exists with 6 HP, 4.0 m/s, 8 damage per hit (one hit per second, like every zombie), reward 3. Every number comes from `zombies.json` (NFR14), none inline.
2. **Flank field (FR21, architecture › Zombie Pathfinding).** The World keeps a second flow field (`world.pathing.flank`) on Story 3.5's nav grid. When a rebuild starts, its penalty layer marks every cell within `flank.coneRadiusM` of an alive player and within ±`flank.coneHalfAngleDeg` (45°) of that player's aim direction (`facingX/Y`; apex `coneApexBackM` behind the player, D1b); entering a marked cell costs `flank.penaltyM` extra (several players: the union of their cones — a cell in two cones costs the same as in one). Buildings cost the same as in the chase field, so Runners also route around and break buildings.
3. **Cadence and budget (brief line 10).** The two fields share Story 3.5's budget: while at least one flanking zombie is alive, ticks alternate (even ticks advance the chase field, odd ticks the flank field), each settling at most `pathing.rebuildCellsPerTick` cells; with no flanker alive the chase field gets every tick (Story 3.5 unchanged) and the flank field pauses. A full refresh of one field takes P ticks of its own (P = 3), so while flankers are alive each field is at most **4P = 12 ticks (600 ms)** old; when flankers reappear the flank rebuild restarts from fresh aims. Runners never read a flank field older than 4P (they behave like Walkers until it is fresh). Stale test.
4. **Runner steering.** A Runner walks straight at its nearest alive player when it is within `flank.directWithinM`, or when it is **outside** that player's current front cone (angle to the aim > 45°) and no building is in the way; otherwise it follows the flank field (look-ahead and building targeting as in 3.5). A rushing Runner (the last zombies of a wave, FR30) heads straight in like a Walker. Separation, the overlap rule, the player and building push-outs and the attack rules apply unchanged.
5. **Flanking works (epics AC 3).** A seeded Vitest shows Runners reach a player's flank (first contact more than 45° from the player's aim) more often than Walkers in the same setup (one player and a two-player front line).
6. **Look and sound (epics AC 2, readability rule, FR84).** A Runner is drawn with a thin, leaning silhouette in a paler colour than a Walker, above Walkers in a crowd; a placeholder shriek (`zombie_runner_shriek`, Web Audio like the other placeholder sounds) plays when a Runner first enters my view (once per Runner, rate-limited, panned left/right by its screen position). Solo and online.
7. **Online.** No new wire field: the type travels in the horde stream's type nibble (index 2). A Runner at 4 m/s is drawn smoothly from the horde stream (interpolation test) and hits on Runners at 150 ms RTT are reported by the netsim hits harness.
8. **Dev hooks.** `?wavemix=walker,runner` (solo) and `DEV_WAVE_MIX=walker,runner` (server) already work for any balance type; the dev cheat panel lists Runner. `waves.json` is unchanged (3.10).
9. **Tests and numbers.** Determinism with Runners (`snapshotWorld` covers the flank field), stale test, flank-vs-Walker test, benchmark (added p99 ≤ 2 ms), added bandwidth reported.

## Tasks / Subtasks

- [x] **T1 Balance** (AC 1, 2, 3, 4)
  - [x] `zombies.json › types.runner { hp 6, speedMps 4.0, damage 8, attackIntervalS 1.0, radiusM 0.35, reward 3, flanks: true }`.
  - [x] `zombieTypeSchema.flanks: z.boolean().default(false)` (Walkers/Crawlers keep their JSON).
  - [x] New block `zombies.flank { coneHalfAngleDeg 45, coneRadiusM 10, coneApexBackM 0.5, penaltyM 1.0, directWithinM 1.0, maxFlankS 2.5, closingSpeedFrac 0.5 }` (the last two from the review, H1) + `flankSchema` (strict).
- [x] **T2 Type**: append `"runner"` to `ZOMBIE_TYPES` (index 2, after `"crawler"`). No horde format change.
- [x] **T3 Flank field (shared, `zombies/flowField.ts`)** (AC 2, 3)
  - [x] `PathingState.flank = createFlowField(nav, fillFlankPenalty)` and `flankActive` (mutable flag); module-level `fillFlankPenalty` (no closure, no allocation): zero the layer, then for each alive player mark the cone cells in its bounding box.
  - [x] `updatePathing`: rasterize on version change; count alive flankers (`balance.zombies.types[type].flanks`, cached per Balance as a type-index mask); none → chase every tick (`flankActive = false`); some → on the first such tick restart the flank rebuild; even tick chase, odd tick flank.
  - [x] `flowSharedMaxAgeTicks(world)` = 4P; `flowFieldMaxAgeTicks` stays 2P (chase alone). `snapshotPathing` gains `flankActive` and the flank digest.
- [x] **T4 Runner steering (`zombies/zombieAi.ts`)** (AC 4): `steerByField(world, field, …)` takes the field; pass 1 picks the Runner rule (direct / outside-cone straight / flank field, fresh gate), RUSH → Walker rule. Allocation-free.
- [x] **T5 Client look and shriek** (AC 6)
  - [x] `ZombieView.LOOKS.runner` (thin, leaning, pale; depth 5.5) and a per-look `cue` (`"zombie_runner_shriek"` for Runners, null otherwise).
  - [x] New `render/shriekCue.ts` (`ShriekCues`: per-slot generation already cued, view test, global min interval, pan from screen x); `ZombieView` calls it with the camera's `worldView` (no allocation).
  - [x] `audio/placeholderSfx.ts`: `zombie_runner_shriek` (rising-falling screech: detuned saw/square sweep + band-passed noise, ~0.35 s) and an optional pan argument (StereoPanner when available).
- [x] **T6 Online checks** (AC 7): `hordeBuffer.test.ts` Runner at 4 m/s sampled per 60 Hz frame (even steps); `tools/netsim/hitsSim.ts` gains a `zombieType` option and `hits.test.ts` a Runner case (reported).
- [x] **T7 Tests** (AC 5, 9): see Dev Notes › Testing.
- [x] **T8 Benchmark** (AC 3, 9): `tickCostFlowField.test.ts` gains a mixed case (100 Walkers + 50 Runners) with both fields; flank max age reported.
- [x] **T9 Browser checks** solo `?wavemix=walker,runner` and online `DEV_WAVE_MIX=walker,runner` with `?lag=150&jitter=20`; screenshots `/tmp/s38/`.

## Dev Notes

### Decisions (made while writing the story; non-interactive)

- **D1 Penalty size and radius** (`zombies.flank`, balance): cone ±45° (the epics' number), radius **10 m** (a bit less than the 12 m screen edge: the cone covers what a player can see and shoot in front of them), **1.0 m extra per penalized cell** (a cell in the cone costs 3× a free one: 0.5 m step + 1 m), so cutting through 10 m of cone costs +20 m and every detour round its edge (≤ +0.77 × radius) is cheaper. `directWithinM` **1.0 m** (contact is at 0.75 m): within it a Runner goes straight in (it must eventually bite; the field is up to 600 ms old near a moving player).
- **D1b (found while building) Apex 0.5 m behind the player** (`flank.coneApexBackM`): with the apex at the player's centre, Runners walked in along the cone's 45° edge and touched at 44.98° (the first test run: 0/12 "flank" contacts) — the front diagonal, not the side. With the apex 0.5 m behind along the aim, the cone is already body-wide where it starts (the cell in front and the front diagonals are in it, the cell behind is not), far out it is still ≈ ±45° (±47° at 10 m), and Runners finish 58–102° off the aim (tests and browser). The same shape is used for the steering rule's cone check.
- **D2 Several players:** the penalty layer is the **union** (max, not sum) of the cones of every **alive** player (downed and out players don't aim). The field is multi-source to every alive player, like the chase field, so a Runner heads for the nearest player by path cost, and the cones of a front line make it go round the line's ends or behind.
- **D3 Refresh with aim changing every tick:** the penalty is filled once per rebuild, with the aims of the tick the rebuild starts (the same moment as its sources), so the field is consistent with one moment. Refreshing it every tick is not affordable; instead the **current** aim is used in the steering rule (D5), so a Runner already outside your cone comes straight at you with no staleness, and the field is only needed while it is in front.
- **D4 Shared budget:** alternate ticks while a flanker is alive (cost per tick unchanged from 3.5: one slice of ≤ 2048 cells), chase every tick otherwise (all 3.5 behaviour, tests and hashes unchanged without Runners). Bound: each field ≤ 4P = 12 ticks old while shared; 2P otherwise. The flank rebuild restarts when flankers come back after a pause, and Runners ignore a flank field older than 4P (fall back to the Walker rule) — no Runner ever follows a stale field.
- **D5 Open ground vs 3.5's D3** (Walkers walk straight when the line is clear): Runners must flank in the open, so the clear-line rule becomes "clear line **and** outside the target's angular front cone" for them (an infinite cone: a Runner 20 m straight ahead still swings wide). Walking straight from outside the cone keeps the Runner on its side; near the player the offset apex widens the cone, so it is pushed further round until it is within `directWithinM`.
- **D6 Shriek trigger:** on the client, when a Runner **first enters my camera view** (once per zombie generation; a Runner leaving the horde margin and coming back is the same generation and stays quiet), at most one shriek per 0.3 s (a wave of Runners doesn't stack shrieks), panned by its screen x (FR84: the cue tells you which side). It works the same solo and online, needs no event or bytes, and a teammate's Runner far away doesn't shriek on my phone. Uses the existing `playSfx` placeholder synth (Story 9.10 swaps the recording by name).
- **D7 No wire change:** the behaviour is server-side; the client needs the type only (horde type nibble index 2). No `FLANK` state in `ZOMBIE_STATE` (no client use).
- **D9 (review H1, decided by the main session) Flanking is a time-limited commitment:** a per-zombie flank timer in ticks (`flank.maxFlankS` = 2.5 s). It counts the ticks a Runner, while eligible to flank (not rushing, farther than `directWithinM`), gets closer to its target by less than `closingSpeedFrac` (0.5) × its speed per tick: circling the cone's rim, or held up. When it runs out the Runner goes straight in (Walker rule, like RUSH) until it bites (reset) or dies (a new generation starts over). Counting "not closing in" rather than "following the field" keeps the detour round the cone free (that path closes at ≥ 0.75 × speed), so the flank-vs-Walker numbers are unchanged. Stored in `pathing.progress` (`flankTicks`, `flankLastD`, `flankGen`; in `snapshotPathing`).
- **D8 Look:** thin and leaning (GDD readability: "Runner thin and leaning"): narrow shoulders, head pushed forward past the shoulders, arms swept back, one leg stretched behind; pale ochre-grey skin and a dark-red shirt so it pops among the green-grey Walkers; drawn at 2.8 × 1.6 radii, depth 5.5 (above Walkers: readable in a crowd). Collision radius 0.35 m like every zombie (crowd packing and the 0.5 m lattice slot rule unchanged); thinness is visual only.

### Current state (read before changing)

- `zombies/flowField.ts` (3.5): `NavGrid`, `FlowField` with `penalty: Uint16Array` + `fillPenalty` hook called in `startRebuild` (before seeding), `updatePathing`, `flowNextCell` adds `penalty[n]` like `enterCost`, `snapshotPathing`. The 3.5 test "a second field on the same grid can add a penalty layer" shows the hook.
- `zombies/zombieAi.ts`: pass 1 → `nearestAlivePlayer`, line of sight `segmentHitsBuildings(…, r + LOS_MARGIN_M)` only when `hasBuildings`, `steerByField` reads `world.pathing.chase` and writes `targetBuilding[id]`. Pass 4 attacks unchanged.
- `zombieTypes.ts` `ZOMBIE_TYPES = ["walker", "crawler"]`; `ZOMBIE_STATE.RUSH` (FR30) set by the wave director.
- `player.ts`: `facingX/Y` = the aim (or the move direction without aim), on the server and solo every tick.
- Client: `ZombieView.LOOKS` `satisfies Record<ZombieTypeId, ZombieLook>` (compile error until the Runner has one), reveal per `generation`; `audio/placeholderSfx.ts` `playSfx(name)`; the cheat panel lists all balance types; `parseWaveMix` accepts any balance type.

### Rules

- Timers in ticks; no per-tick allocation (typed arrays, module scratch, module-level fill function); no inline gameplay numbers (balance `zombies.flank`, `types.runner`); deterministic (fixed loops, players in Map order).
- Tests of one mechanic pass `systems: { waves: () => {} }`, fixed seeds.

### Testing

- `zombies/runner.test.ts`: Runner numbers and schema defaults (`flanks` false for Walker/Crawler); a Runner runs at 4.0 m/s in the open (outside the cone); penalty layer marks the ±45° × 10 m cone only (cells at 40° in, 50° out, 11 m out, own cell free) and the union for two players; downed players have no cone; cadence: alternate ticks only with a flanker alive, chase every tick without; **STALE TEST**: aim spinning and player moving, every tick `tick − flank.sourceTick ≤ 4P` and the penalty at the field's source tick matches that tick's aim; restart on resume; **flank vs Walker** (one player, 12 seeded spawn positions in front: Runners' flank share > Walkers', and a two-player front line); RUSH Runner goes straight; Runners route around a wall with buildings; determinism (two worlds with Runners + buildings → equal `snapshotWorld`).
- `flowField.test.ts`: snapshot includes the flank digest.
- `hordeBuffer.test.ts`: 4 m/s Runner sampled at 60 Hz, steps equal within 1 mm.
- `tools/netsim/hits.test.ts`: Runner case reported.
- `tickCostFlowField.test.ts`: mixed case.
- Make the new tests fail once (brief line 15): flank field never rebuilt → stale test; penalty filled empty → flank-vs-Walker test.

### Project Structure Notes

- New: `packages/shared/src/zombies/runner.test.ts`, `apps/client/src/render/shriekCue.ts` (+ test).
- Modified: `zombies.json`, `balanceSchema.ts`, `zombieTypes.ts`, `flowField.ts`, `zombieAi.ts`, `index.ts`; client `ZombieView.ts`, `placeholderSfx.ts`, `hordeBuffer.test.ts`; server `tickCostFlowField.test.ts`; tools `hitsSim.ts`, `hits.test.ts`.

### References

- [Source: epics.md#Story 3.8: Runners flank], FR21, FR84 (Runner shriek)
- [Source: gdds/…/gdd.md#Enemy Design and AI] (bestiary: 6 HP, 4.0 m/s, 8/hit, reward 3; readability "Runner thin and leaning"; zombie cues)
- [Source: game-architecture.md › Zombie Pathfinding] ("Runners follow a second field that penalizes cells near other players' facing directions"), Lag compensation note (Runners 4 m/s)
- [Source: 3-5-zombies-path-around-and-break-buildings.md › D1, D3, D7, Notes for the merge (For 3.8)]
- [Source: 3-9-crawlers-slow-you-down.md › how a type is added, Notes for the merge]
- [Source: epic-2-retro-2026-11-22.md › EPIC 3 BRIEF], HANDOFF.md §3

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (builder agent, worktree `story-3-8`)

### Debug Log References

- First flank test run: Runners touched at 44.98° off the aim (0/12 > 45°): they walked in along the edge of a cone whose apex was the player's centre → D1b (apex 0.5 m behind). Then 12/12.
- The benchmark failed twice at first (added p99 3–7 ms, **also the unchanged 3.5 Walker-only case**): the 2-core machine was running other agents' Chromium + eslint (load 5.6). Re-run when quiet: passes (numbers below). The test keeps the lower p99 of two interleaved runs per case, like 3.5's.
- **Merged `claude/epic-2-continue` at 501457e** (Story 3.6 auto-turret, 3.4/3.7 re-review fixes): conflicts in `placeholderSfx.ts` (both sounds kept), `tickCostFlowField.test.ts` (`measure(withBuildings, turrets, runners)`; the 3.8 case now runs with the 4 firing turrets) and `sprint-status.yaml`. After the merge: `npm run typecheck && npm run lint && npm test && npm run build` pass (142 files, **1042 passed**, 3 skipped). One earlier full-suite run failed only the two timing cases of `tickCostFlowField.test.ts` (the unchanged 3.5 case too: other heavy test files run beside it on 2 cores); the file alone and the next full run pass.
- Benchmark after the merge (file alone): 3.8 case with 4 turrets + 100 Walkers + 50 Runners + both fields **added p99 0.75–0.78 ms**; max age chase 10 / flank 10 (bound 12); 3.5 case 0.41–0.48 ms; 3.6 case 0.40–0.45 ms.
- Browser re-check after the merge (server restarted on merged code): solo Runners 13/13 first contacts from the flank (mean 104°), cone time 0 %; online `?lag=150&jitter=20` 9/10 (81°) and 8/8 (122°), Predictor 0 corrections / 0 snaps, no page errors (`merged-*.png`). One online run showed a single 0.54 m drawn Runner step (the others ≤ 0.20 m; 2 of 1,476 steps > 0.15 m): most likely a ~135 ms headless frame stall (at 4 m/s any stall shows as distance; the interpolation itself is even per `hordeBuffer.test.ts`). Not verified on a phone.
- Online check needed `?zdmg=0.05` on the page to match the server's `DEV_ZOMBIE_DAMAGE_SCALE=0.05` (balance hash check refused the join otherwise; as designed).

### Completion Notes List

- **Balance (AC 1, 2):** `zombies.json › types.runner { hp 6, speedMps 4.0, damage 8, attackIntervalS 1, radiusM 0.35, reward 3, flanks: true }`; `zombieTypeSchema.flanks` (default false). New block `zombies.flank { coneHalfAngleDeg 45, coneRadiusM 10, coneApexBackM 0.5, penaltyM 1.0, directWithinM 1.0 }`, `flankSchema` strict and bounded (penalty fits the Uint16 layer). `ZOMBIE_TYPES = ["walker", "crawler", "runner"]` (index 2).
- **Flank field (AC 2, 3), `zombies/flowField.ts`:** `PathingState.flank = createFlowField(nav, fillFlankPenalty)` + `flankActive`. `fillFlankPenalty` (module-level, allocation-free): zero the layer, then per alive player (Map order) mark the cone cells in its bounding box with `max` (union). The penalty is now **double-buffered with the field** (`penalty` for the rebuild in progress, `frontPenalty` swapped in with `front`), so the next-cell choice reads the penalty the front was built with (3.5 read the in-progress one; equal for the chase field). `updatePathing`: rasterize; no flanker alive (type bit mask cached per Balance, one scan of the alive list) → chase every tick; flankers → restart the flank rebuild on the first such tick, then even ticks chase / odd ticks flank, one slice of `rebuildCellsPerTick` per tick either way. `flowSharedMaxAgeTicks` = 4P = 12; `inFlankCone` (same shape) exported. `snapshotPathing` gains `flankActive` and the flank digest (+ penalty hashes).
- **Steering (AC 4), `zombieAi.ts`:** `steerByField(world, field, …)`. A `flanks` type that is not rushing, farther than `directWithinM`, and either blocked by a building or inside its target's current cone follows the flank field if it is ≤ 4P old; otherwise the 3.5 rule (straight, or the chase field when blocked). Building targeting/attacks unchanged for both fields.
- **Look and sound (AC 6):** `ZombieView.LOOKS.runner` (narrow red torso, pale head pushed out front, arms swept back, trailing leg; 2.8 × 1.6 radii; depth 5.5) and a per-look `cue`. `render/shriekCue.ts` `ShriekCues`: once per slot generation when the drawn position enters `camera.worldView`, ≥ 0.3 s apart (later ones in that window stay quiet), pan from screen x. `placeholderSfx`: `zombie_runner_shriek` (two detuned saws sweeping 900→1500→620 Hz with a 23 Hz vibrato and band-passed hiss, 0.42 s) and `playSfx(name, pan = 0)` through a StereoPanner.
- **Epic 3 brief:**
  - L2: git status clean; typecheck + lint + test (1042 passed) + build pass on the branch merged with the current `claude/epic-2-continue` (501457e, incl. Story 3.6).
  - L3 (all copies): new World state `pathing.flank`, `pathing.flankActive` → server/solo only (derived, never synced: not schema/stateView/NetSimHost/Predictor/devThrottle by design) → `snapshotPathing` (counters + hashes of front/back/penalty layers). The Runner type travels in the existing horde type nibble (index 2) → `HordeBuffer`/`mirrorZombies` copy it unchanged (test). No player-state or schema field; the Predictor is untouched (Runners don't change my movement or weapons).
  - L6: timers in ticks (attack cooldown as every zombie); no per-tick allocation: typed layers sized once, module-level fill callback and scratch record, cached type mask; `ShriekCues` uses one Int32Array; ZombieView reads `camera.worldView` (no object per frame). Audio nodes are created per shriek only (≤ 1 per 0.3 s).
  - L10: cadence: one slice of 2048 cells per tick shared by the two fields; P = 3; with flankers each field ≤ 4P = 12 ticks (600 ms) old, measured max 10; without, chase ≤ 2P as in 3.5 (measured 5). Aim changes every tick: the cone is taken when a rebuild starts (same tick as its sources), and the steering rule uses the current aim. Benchmark (4 players + 100 Walkers + 50 Runners + 24 buildings, both fields): **added p99 0.42–0.81 ms** (3.5 case 0.38–0.45 ms) ≤ 2 ms. Stale test: `runner.test.ts › STALE TEST` (aim spinning a full turn every ~2 s, player crossing the map): every tick the flank field is ≤ 4P old, its zero is the player's cell at its source tick and its front penalty is that tick's cone; proven by mutation.
  - L11: Runners add **0 B/s** of their own: no new schema field or event, the horde record is fixed-size (type in the existing nibble), the shriek is client-side. The benchmark's patches 1,809 → 1,920 B/s and events 409 → 431 B/s are the 24 buildings' HP/re-adds (3.5), the same as the Walker-only case; events 392 → 409 B/s between the mixes is kill events (6 HP Runners die faster).
  - L12: every number in `zombies.json` (`types.runner`, `flank`); the 0.3 s shriek spacing is a presentation constant in `shriekCue.ts`, synth parameters in `placeholderSfx.ts` (like the other placeholder sounds).
  - L14: one mechanic per test (`systems: { waves: () => {} }`), seeded; no new room integration (no server-room change).
  - L15: proven by mutation: (1) penalty layer left empty → 7 tests fail (cone, union, STALE, swing wide, all three flank-vs-Walker tests); (2) flank field never rebuilt after its first build → 7 fail (alternation, STALE, swing wide, flank-vs-Walker ×3, determinism).
  - L18: feel judged with tests/netsim; browser used for looks, wiring, shriek nodes and counts.
  - L20: see Notes for the merge.
- **Flank vs Walker (AC 5, `runner.test.ts`, fixed seeds):** one player, 12 spawns in front (±40°, 13–16 m) one at a time: **Runners 12/12 from the flank (mean 58° off the aim), Walkers 0/12 (mean 26°)**; the same 12 at once (crowd; first contacts): Runners 6/6 (mean 70°), Walkers 1/6 (40°); a two-player front line: Runners 12/12 (60°), Walkers 0/12 (14°).
- **Online (AC 7):** `hordeBuffer.test.ts`: a Runner streamed at 4 m/s and sampled at 60 Hz moves 0.0667 m every frame (within 1 mm) and keeps type 2. Netsim hits (`hits.test.ts`, 20 Runners, 75 ± 10 ms one way): standing 0/77 reversed (0 %); **kiting 22/76 reversed (28.9 %)** vs Walkers kiting 1.4 % — see Findings.
- **Browser (Python Playwright + Chromium 844 × 390; server 5767 `DEV_WAVE_MIX=walker,runner DEV_ZOMBIE_DAMAGE_SCALE=0.05 ALLOW_SOLO_START=1`, Vite 8273 via a temporary config, deleted):**
  - solo `?solo&wavemix=walker,runner`, god mode, aiming east, standing: first contacts **Runners 12/13 from the flank (mean 84°)**; time inside my front cone at 2–10 m: Runners 0.7 % of samples, Walkers 20 %; 20 Runners cued, **10 shrieks** built (2 saws + a panner each; pans −1 … +0.42; the rest fell in the 0.3 s quiet window); ~58 fps; no page errors. Screenshots `solo-runners-0..3.png`, `solo-closeup.png` (red/pale Runners vs green Walkers), `solo-end.png`.
  - solo "front" scene (every zombie put 11–13 m in front of me, ±35°): `front-sequence.png` / `front-0..9.png`: Walkers come straight on, Runners stream round the cone's edges and wrap round behind; Runner first contacts 9/12 flank (72°); cone time Runners 7.7 % vs Walkers 58 %.
  - online (Create → Ready → Start, `?lag=150&jitter=20&zdmg=0.05`): Runner first contacts **9/9 from the flank (mean 102°)**; cone time Runners 0.3 % vs Walkers 26 %; 12 shrieks; a moving Runner's drawn step 0.068 m/frame (sd 0.011) ≈ 4 m/s at 60 fps; Predictor 0 corrections, 0 snaps; no page errors. Screenshots `online-runners-0..2.png`, `online-end.png`.
- **Not verified:** the shriek heard by a person (headless: the audio graph was built and started, not listened to; iOS unlock path unchanged); real phones (readability at phone size, feel at 4 m/s; designer playtest); 3–4 players online with different aims (covered by the union test only); a hidden tab / late scene start (no new phase or client state beyond `ShriekCues`, which is per ZombieView and recreated in `create`); Runners vs turrets in the browser (merged and benchmarked together; not watched).
- **Findings:**
  - **Hits on Runners while kiting at 150 ms RTT: 28.9 % reversed** (Walkers 1.4 %, standing Runners 0 %). The architecture's trigger ("if more than 1 in 20 apparent hits reversed (Runners move 4 m/s), hits are tested against rewound positions") is met in that case. Not fixed here (lag compensation is outside this story); recommend a follow-up story/decision (server rewind with the 300 ms position history, or a client "hit marker only on confirm" for fast types).
  - With many Runners the contact ring fills and some end up in front (crowd overlap pushes them round), as seen in `solo-closeup.png`; the flank shows in where they *arrive*.
- **Deviations:** the cone's apex is 0.5 m behind the player (D1b; still ±45° around the aim). The 3.5 penalty layer is now double-buffered (`frontPenalty`). No horde/schema change. `waves.json` unchanged.

### Notes for the merge (brief line 20)

- `zombies.json`: `types.runner` after `crawler`, new top-level `flank` block (after `pathing`). `balanceSchema.ts`: `flanks` at the end of `zombieTypeSchema`, new `flankSchema`, `zombiesSchema` gains `flank`. Any test fixture that builds a `zombies` balance object by hand needs `flank` (none in the repo now).
- `zombieTypes.ts`: `ZOMBIE_TYPES` = `["walker", "crawler", "runner"]`; the next type (Epic 5) appends after `"runner"`; its look goes into `ZombieView.LOOKS` (now with a `cue` field: `null` or an `SfxName`).
- `flowField.ts`: `PathingState` has `flank` + `flankActive`; `FlowField` has `frontPenalty` (swapped in `advanceFlowField`); `updatePathing` alternates when a `flanks` type is alive. **3.6 (merged here):** `updateBuildings` = `updatePathing` then `updateTurrets`, unchanged; turrets are buildings, so both fields route round / break them alike.
- `zombieAi.ts`: pass 1 only (Runner rule before the 3.5 blocked rule); `steerByField` takes the field.
- `index.ts`: exports `flowSharedMaxAgeTicks`, `fillFlankPenalty`, `inFlankCone`, `zombieTypeIndex`.
- Client: `ZombieView.ts` (LOOKS + cue + `ShriekCues`), `audio/placeholderSfx.ts` (`SfxName` union + `playSfx(name, pan = 0)`; 3.6 adding a turret sound adds its own case), new `render/shriekCue.ts`.
- Tests/tools: `tickCostFlowField.test.ts` (`measure(withBuildings, runners)` + a 3.8 case), `tools/netsim/hitsSim.ts` (`zombieType` option), `hits.test.ts`, `hordeBuffer.test.ts` (`type` in the frame helper), `player/slow.test.ts` (type count map gains `runner`).
- **For 3.10:** put Runners into `waves.json` from wave 2 (FR29); the dev mix (`?wavemix`, `DEV_WAVE_MIX`) already accepts `runner`. Rushing Runners (last 5, FR30) go straight like Walkers. Balance the flank with `flank.*` (e.g. `coneRadiusM`, `penaltyM`) if Runners feel too predictable.

### File List

- New: `packages/shared/src/zombies/runner.test.ts`, `apps/client/src/render/shriekCue.ts`, `apps/client/src/render/shriekCue.test.ts`, `_bmad-output/implementation-artifacts/3-8-runners-flank.md`
- Modified (shared): `config/balance/zombies.json`, `config/balanceSchema.ts`, `zombies/zombieTypes.ts`, `zombies/flowField.ts`, `zombies/zombieAi.ts`, `index.ts`, `player/slow.test.ts`
- Modified (client): `render/ZombieView.ts`, `audio/placeholderSfx.ts`, `net/hordeBuffer.test.ts`
- Modified (server): `run/tickCostFlowField.test.ts`
- Modified (tools): `tools/netsim/hitsSim.ts`, `tools/netsim/hits.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Senior Developer Review (AI)

Review by a fresh agent at 4c524bf; fixes on branch `story-3-8b` (from `claude/epic-2-continue` d5d58d2, with the 3.5 review fixes: pinches, stuck safety net, `PERF_ASSERT`).

- [x] **H1 (High): a Runner the player keeps aiming at never attacked** (it circled just outside the 10 m cone rim and the pistol's 9 m range). Fix (main session's decision, D9): per-zombie flank timer, new balance keys `zombies.flank.maxFlankS` (2.5 s) and `closingSpeedFrac` (0.5); after 2.5 s of not closing in, the Runner goes straight in until it bites or dies (`zombieAi.ts` `flankTimeSpent` / `resetFlankTime`; state in `pathing.progress`, hashed in `snapshotPathing`). Tests: an aim tracking the Runner every tick from 20 m → **contact after 7.25 s** (bound maxFlankS + travel 5 s + 1 s = 8.5 s; min distance 0.75 m); the bite resets the timer and a new zombie in the slot starts over. Flank-vs-Walker re-measured, **unchanged**: one player one at a time Runners 12/12 (mean 58°) vs Walkers 0/12 (26°); crowd of 12 Runners 6/6 (70°) vs 1/6 (40°); two-player line 12/12 (60°) vs 0/12 (14°). Browser (solo, the mouse moved onto the Runner ~20×/s, `/tmp/s38b/track-*.png`): it held at 10.2–10.9 m while the timer counted to 50 ticks, then came straight in: **contact 6.65 s** of game time after being placed 18 m in front; no page errors. Mutation (timer disabled) fails both H1 tests.
- [x] **M2: restart and age gate untested.** The restart test now asserts `flank.buildSourceTick ≥ comeback` on the first odd tick after the comeback (an unfinished rebuild was left before the pause); new gate test: the old front is older than 4P when a Runner returns straight ahead in the aim — it walks straight (y unchanged) every tick until the new field swaps in, then goes off to the side. Mutations: removing `flank.building = false` fails the restart test; removing the `≤ flankMaxAge` gate fails the gate test.
- [x] **M3: snapshot coverage and front penalty untested.** New tests: two worlds differing only in the aim (so only the flank field differs; zombie-progress hashes left out) → equal chase digests, different pathing digests (fails without the flank digest); `flowNextCell` keeps choosing the west neighbour after the in-progress `penalty` layer marks it 60,000 (fails when it reads `f.penalty`).
- [x] **L4:** `flankerAlive` skips RUSH-state flankers (test: a rushing Runner alone → `flankActive` false, no flank rebuild, chase ≤ 2P; fails under the mutation).
- [x] **L5:** T1 now says `directWithinM 1.0` (and lists the review keys).
- [x] **L7:** `ShriekCues` rate-limits **per screen side** (left / right of the centre), and a Runner that enters in its side's quiet window is not marked: it cues on a later frame once the window is over (if still in view). Tests: a right-side Runner in the window cues after it; ten from the right don't silence one from the left.
- [x] **Benchmark / bandwidth (with 3.6's turrets):** `PERF_ASSERT=1 npx vitest run apps/server/src/run/tickCostFlowField.test.ts --silent=false`. The machine was never fully quiet (other agents; load 1.4–6.7). The two runs at the lowest load (≈ 1.4–1.7) passed every timing assert: 3.8 case (100 Walkers + 50 Runners, 24 buildings incl. 4 firing turrets, both fields) **added p99 0.94–1.16 ms** (mean added 0.43–0.48 ms), max age chase 10 / flank 10 ticks (bound 12); full rebuild 0.82 ms (0.27 ms/tick). A third run as the load rose (baseline p99 4.1 ms by itself) failed the asserts in all three cases, the unchanged 3.5 one included: machine noise. Without `PERF_ASSERT` the suite passes. **Bandwidth split** (deterministic, new `[bandwidth 3.8]` line): same room (24 buildings, 4 turrets), 150 Walkers → 100 Walkers + 50 Runners: patches 1,964 → 1,970 B/s (+6), events 713 → 708 B/s (−5) — **Runners ≈ 0 B/s** (no field of their own; the type rides in the horde nibble). The jump from 409 → 708 B/s events against the no-building baseline is the turrets' `turret.fired` + hits/kills (3.6: 428 → 713 B/s), and patches 1,809 → 1,970 B/s are building HP/re-adds plus turret kills' wallet changes.
- Netsim, hits: unchanged code paths (Runner reversed-hit finding is now Story 2.12, rewound hit testing).

## Change Log

- 2026-11-22: Review fixes (story-3-8b): flank timer (H1, `maxFlankS`), restart/gate/snapshot/front-penalty tests (M2, M3), RUSH skip (L4), spec text (L5), per-side shriek window (L7), bandwidth split with turrets; status done.

- 2026-11-22: Story created from the real code (Stories 3.1–3.5, 3.7, 3.9 merged), status ready-for-dev.
- 2026-11-22: Merged `claude/epic-2-continue` (501457e: Story 3.6, 3.4/3.7 re-review fixes); benchmark with turrets; checks and browser re-run.
- 2026-11-22: Built: Runner type (6 HP, 4.0 m/s, 8 dmg, reward 3), flank field (±45° cones, union, apex 0.5 m behind, double-buffered penalty) sharing the 3.5 budget on alternate ticks (≤ 4P), Runner steering, thin leaning look, positional placeholder shriek on first sight; tests (flank vs Walker, stale, cadence, determinism, horde 4 m/s, netsim Runner hits), benchmark, browser checks solo + online; status review.
