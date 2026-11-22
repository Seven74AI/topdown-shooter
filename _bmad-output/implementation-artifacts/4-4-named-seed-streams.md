# Story 4.4: Named seed streams

Status: done

## Story

As the designer,
I want each run's random choices to come from one run seed with separate streams,
so that we can replay a run exactly to test or fix it.

> **Decisions taken while writing this story (delegated to the session; the designer can change them):**
> 1. **Derivation.** Every stream is an `sfc32` (`core/rng.ts`) seeded with `streamSeed(runSeed, key) = fmix32(runSeed XOR imul(fnv1a32(key), 0x9e3779b1))`, then the usual splitmix32 expansion + warm-up of `createRng`. Both steps are bijections, so inside one run two different keys can never share a stream seed (a test checks every key a 4-player, 100-build run can use). Keys: `decay`, `events`, `spawns`, `combat`, `shop:<playerSlot>:<buildPhaseIndex>`.
> 2. **A fifth stream, `combat`.** The epic names four streams, but solo spread (the only other draw today) must come from somewhere. It gets its own stream so a shot never moves a spawn. Online spread is untouched: still `seqSpreadRoll(playerId, seq)` (Story 2.12), a pure function the client computes; it draws from no stream.
> 3. **Where the draws go.** Wave spawn-point pick + edge jitter (`waveDirector`) → `spawns`; dev-cheat `spawnRing` and `?stress` / "spawn in view" (`stressScenario`) → `spawns` (they spawn zombies; cheats are dev-only, a replay with cheats is not a goal). Offline spread (`firing.ts`) → `combat`. `decay` and `events` have no user yet (Stories 4.5 and Epic 5 draw from them). `world.rng` is **removed**, so new code cannot draw from an unnamed stream.
> 4. **Shop streams without per-tick allocation.** `World.streams.shop` holds one preallocated stream per slot (`MAX_PLAYERS`). `shopStream(world, slot)` reseeds that slot's stream in place (`Rng.reseed`) when the build phase index changed since its last use, so rerolls inside one build advance it and the next build starts fresh. `buildPhaseIndex = world.waves.number` during a build (0 before wave 1, …): no new run state, and a mid-run joiner (Epic 8) lands on the same key. No shop draws randomly yet (Epic 3's shop is a fixed list); the stream is ready for the card shop. Solo uses slot 0.
> 5. **Online "set run seed".** Server switch `DEV_ALLOW_RUN_SEED=1` (dev only: ignored with a `dev_run_seed_ignored` warning when `NODE_ENV=production`, like the other `DEV_*` switches) + client `?seed=<uint32>` (dev builds only, like `?wallet`) sent with the host's Create (`devRunSeed` join option). Every run of that room uses the seed (Back to lobby → Start replays it). Without the switch the option is ignored (warning), the run gets a random seed; no join refusal, because a different seed breaks nothing (the client never needs the seed to simulate). Solo keeps the dev cheat panel's "Restart with seed"; online the button is disabled with a hint.
> 6. **The seed is shown as server truth.** Schema `RunState.runSeed` (uint32, written by `syncState` only when it changes: once per run, ~0 B/s) → `RunStateView` / `RUN_STATE_FIELDS` → fake room → `?lag` copy (via the key list) → `NetSimHost.runSeed` (the mirror World keeps seed 0; it never draws). Results show "Run seed N" (decimal, the form the cheat accepts); the performance overlay shows `seed N`. Anyone in the room can see it; in a co-op game that is fine (it could predict spawn points and, later, team mates' shop cards).
> 7. **Replay.** A headless recorder (`replay/inputLog.ts`) logs every input copy and every build action (buy, place, Ready) with its tick while bots play a real run (`runHeadless` gains a `record` option; `botBuildPhase` an optional action sink). `replayRun` rebuilds the World from the seed and applies the log. Equality is `worldDigest(world)` = FNV-1a of the canonical JSON of `snapshotWorld`, which now includes every stream's state.

## Acceptance Criteria

1. **Streams (FR65).** Given a run seed, when the World is created, the `decay`, `events`, `spawns`, `combat` streams and the per-slot `shop:<playerSlot>:<buildPhaseIndex>` streams are derived from it. Drawing from one never changes another's sequence (test). Same seed → same sequences; different keys → different sequences.
2. **No unnamed randomness.** `world.rng` is gone; every existing draw is on the stream of decision 3. Online spread stays `seqSpreadRoll` (no stream, client-computable; the 2.12 tests pass unchanged). No allocation per tick (streams preallocated; shop reseeds in place).
3. **Snapshot.** `snapshotWorld` contains every stream's state (and each shop stream's build key); `worldDigest` hashes it.
4. **Results + overlay.** The Results screen (solo and online) and the `?debug=1` performance overlay show the run seed; online it is the server's.
5. **Set run seed (dev only).** Solo: the cheat panel's "Restart with seed" starts a run with that seed (overlay and Results show it). Online: `DEV_ALLOW_RUN_SEED=1` + host `?seed=N` → the room's runs use N; production ignores both.
6. **Headless replay (NFR10).** A bot run recorded with its input log and replayed from the same seed reaches the same `worldDigest`, including spawns, kills and wave outcomes; liveness: waves really ended, kills > 0, buildings placed and weapons bought. Draws from the `decay` stream during one replay change nothing but the decay stream's state. A different seed gives a different digest.
7. **Each new test fails under one mutation** (listed in Completion Notes).

## Tasks / Subtasks

- [x] **Task 1: Streams** (AC 1–3): `core/seedStreams.ts` (`streamSeed`, `createSeedStreams`, `shopStream`, `buildPhaseIndex`, `parseRunSeed`); `Rng.reseed`; `World.streams` replaces `World.rng`; snapshot + `worldDigest`.
- [x] **Task 2: Move the draws** (AC 2): waveDirector, spawnRing, stressScenario → spawns; firing offline spread → combat; determinism test probes a named stream.
- [x] **Task 3: Server seed** (AC 4, 5): `devRunSeed` join option; `pickRunSeed` (pure, production ignores); RunRoom stores it per room; schema `runSeed` + `syncState` + reset.
- [x] **Task 4: Client** (AC 4, 5): `RunStateView.runSeed`, `RUN_STATE_FIELDS`, fakeRoom, `NetSimHost.runSeed`, overlay line, Results line (solo + online), `?seed` (dev builds) on Create, cheat panel online hint.
- [x] **Task 5: Replay** (AC 6, 7): recorder + `replayRun`; tests with liveness and decay-independence; mutation proofs.
- [x] **Task 6: Verify**: gates; Playwright (Results, overlay, cheat); merge notes.

## Dev Notes

### Current state (read before changing)

- `core/rng.ts`: sfc32 seeded by splitmix32 + 12 warm-up draws; `Rng { next, int, range, pick, getState }`; `createRngFromState`.
- `core/world.ts`: `World.seed` (uint32) and `World.rng = createRng(seed)` — one stream for everything.
- Draws today: `waves/waveDirector.ts` `pickSpawnPoint` (`rng.int`) and `spawnWaveZombie` (`rng.range` jitter); `zombies/spawnRing.ts` (angle jitter; dev cheats); `apps/client/src/debug/stressScenario.ts` (`spawnInView`); `combat/firing.ts` offline spread (`rewindMaxTicks === 0`). Online (`rewindMaxTicks > 0`) uses `rotateBySeqSpread` → `seqSpreadRoll(playerId, seq)` (2.12, pure; NetSimHost and the netsim harness call it) — must stay.
- `core/worldSnapshot.ts` stores `rngState`; `core/determinism.test.ts` probes `w.rng`.
- Server: `RunRoom.startRun` → `randomUint32()` (node:crypto) → `RunController({ seed })`; `run_started` / `run_ended` log `runSeed`. Dev switches: `devAllowed = NODE_ENV !== "production"`; `DEV_STARTING_WALLET` + client `?wallet` (balance version must match); `ALLOW_TEST_SCENARIOS` + host's `?scenario` (`takeScenario` in `onCreate`).
- Client: `GameScene.create` seeds `LocalSimHost` from `data.seed` (cheat) or `newRunSeed()`; `restartRun(seed)` is solo-only. `DevCheats.tsx` "Run seed" field (`parseSeed`), shows `w.seed` (0 online: mirror World). `NetSimHost` mirror World `seed: 0`. Results: `ui/ResultsScreen.tsx` from `UiScreen.results` (solo `showSoloResults`, online `resultsFromState`). Overlay `debug/PerfOverlay.ts` lines from `perf` / `perf.net`.
- Schema: `RunState.ts` `runFields` must equal `RUN_STATE_FIELDS` (compile check); `devThrottle` copies `Object.keys(RUN_STATE_FIELDS)`; `fakeRoom.ts` mirrors the state for tests; `resetRunFields` on Back to lobby.
- Headless: `bots/headlessRun.ts` (`runHeadless`, Story 3.10) — bots on the real systems; `bots/botShop.ts` `botBuildPhase` (buyWeapon, placeBuilding, setBuildReady).

### Copies touched (brief line 2)

World (`streams`) → schema `RunState.runSeed` → `syncState` (+ `resetRunFields`) → `RunStateView` / `RUN_STATE_FIELDS` → `fakeRoom` → devThrottle (key list, no code) → mirror (`NetSimHost.runSeed`; mirror World unchanged) → Predictor (unchanged: it never draws) → `snapshotWorld` (`streams`).

### Guardrails

- No `Math.random` / `Date.now` in shared. No allocation per tick (the shop reseed allocates nothing; the key string is built once per build phase per player only when a shop draws).
- Balance frozen (brief 16): spawn sequences change for a given seed because the draws are split, so seeded test numbers may move; no balance value changes.
- Avoid map/collision files (Story 4.1 in parallel). `runStateMachine.startBuild` is not touched (the shop key is derived lazily).
- Tests of one mechanic keep `systems: { waves: () => {} }`.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.4; FR65; NFR10.
- `_bmad-output/planning-artifacts/game-architecture.md` › Randomness; Shop (`runSeed + playerSlot + buildPhaseIndex`); Dev cheats; Headless replay.
- `_bmad-output/implementation-artifacts/epic-3-retro-2026-11-22.md` §11 (EPIC 4 BRIEF, lines 2, 8, 9, 12, 18, 19).
- `combat/spread.ts` (Story 2.12), `bots/headlessRun.ts` (3.10).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (builder, worktree `story-4-4`).

### Debug Log References

- Baseline before the change: 1,134 passed / 3 skipped. After: **1,156 passed / 3 skipped** (159 files); typecheck, lint, build green.
- `PERF_ASSERT=1` tick-cost tests pass at load **1.47–1.51** (another builder running; above the brief's "< 1", so the numbers are indicative only): tick cost 4p + 150 Walkers mean 0.578 ms / p99 4.52 ms; flow-field added p99 0.58 ms; 3.8 added p99 1.01 ms. This story adds no per-tick work except one integer compare in `syncState` (the seed), and property lookups `world.streams.x` instead of `world.rng`.
- Bandwidth: `runSeed` is a uint32 written once per run (≈ 5 B per run, ~0 B/s).

### Completion Notes List

- **Stream design.** `streamSeed(runSeed, key) = fmix32(runSeed ^ imul(fnv1a32(key), 0x9e3779b1))` → `createRng`. Streams `decay`, `events`, `spawns`, `combat` precreated in `World.streams`; `shop:<slot>:<build>` = one preallocated stream per slot, reseeded in place (`Rng.reseed`, no allocation) the first time `shopStream(world, slot)` is called in a build phase; `buildPhaseIndex = waves.number`. `world.rng` removed.
- **Draws moved.** `waveDirector` spawn pick + jitter → `spawns`; `spawnRing` (cheat) → `spawns`; `stressScenario.spawnInView` → `spawns`; offline spread (`firing.ts`) → `combat`. Online spread unchanged (`seqSpreadRoll`, no stream). No `decay` / `events` / `shop` user yet.
- **Existing test numbers:** none changed. Every seeded assertion in the suite is a threshold or a property, so the split (which does change the spawn and solo-spread sequences for a given seed) moved no expectation. `tools/sims/fiveWave.ts` lines for a given seed will print different (equivalent) runs than before.
- **Online seed:** `DEV_ALLOW_RUN_SEED=1` (dev only) + host `?seed=` (dev builds only) → `devRunSeed` join option → `pickDevRunSeed` → `RunRoom.devRunSeed` → every run of that room. Production / switch off: ignored with `dev_run_seed_ignored`; a run with the dev seed logs `dev_run_seed`.
- **Replay:** `replay/inputLog.ts` (`createInputLog`, `createHeadlessWorld`, `applyCommand`, `replayRun`); `runHeadless({ record, onEnd })`; `botBuildPhase(..., record)`. `worldDigest` in `core/worldSnapshot.ts`. A full 5-wave 2-bot run (seed 1, held out, 300+ kills, buys + barricades/turrets) replays to the same digest in ~0.6 s.
- **Tests added** (22): `core/seedStreams.test.ts` (8), `replay/replay.test.ts` (5), `server run/devRunSeed.test.ts` (3), `rooms/RunRoom.seed.test.ts` (4), `syncState.test.ts` (+1), `NetSimHost.test.ts` (+1); assertions extended in `onlineFlow.test.ts`, `urlOptions.test.ts`.
- **Mutations proven (each makes the named test fail, then reverted):** 0 a stream seed that changes per call → "same run seed"; 1 `spawns` aliased to `events` → "never changes another's sequence"; 2 `streamSeed` ignores the key → "own sequence" (+ shop); 3 key hash truncated to 8 bits → "no two keys"; 4 `reseed` without warm-up → "reseed restarts"; 5 shop never rekeyed → "shop:<slot>"; 6 snapshot copies `events` as `decay` → "no unnamed rng / snapshot"; 7 no upper bound in `parseRunSeed` → "parses run seeds"; 8 build actions not recorded → "really happened"; 9 replay drops `swap` → "same digest"; 10 spawn jitter drawn from `decay` → "change nothing but those streams"; 11 replay ignores the seed → "different seed"; 12 digest of the tick only → "build commands matter"; 13 production check removed → "production ignores"; 14 room ignores `devRunSeed` → "DEV_ALLOW_RUN_SEED=1"; 15 `syncState` doesn't write the seed → "every client gets"; 16 loose schema → "malformed devRunSeed"; 17 reset keeps the seed → "resetRunFields clears it"; 18 mirror returns its own seed → NetSimHost "runSeed"; 19 Results seed 0 → onlineFlow results; 20 `?seed` not parsed → urlOptions.
- **Browser check (Python Playwright + Chromium, headless, desktop 1280×720, own ports 2622/5222):** solo `?solo&debug=1` overlay shows `seed <random>` = the World's; cheat panel "Run seed 4242 → Restart with seed" → World seed 4242 and overlay `seed 4242`; solo wipe → Results "Run seed 4242". Online with `DEV_ALLOW_RUN_SEED=1 DEV_ZOMBIE_DAMAGE_SCALE=10`, host `?seed=987654321&zdmg=10&debug=1`: overlay `seed 987654321`, cheat panel shows the server seed and "Restart with seed" is disabled with the hint, team wipe → Results "Run seed 987654321"; server logged `dev_run_seed` and `run_started { runSeed: 987654321 }`. No console errors.
- **Not verified:** a phone (touch layout of the new Results line), the `?lag` throttle path in a browser (covered only by the key-list type check), a 2+ player online room, a production build refusing `?seed` end to end (unit-tested via `pickDevRunSeed` and the `import.meta.env.DEV` guard), and tick timings at load < 1 (machine was busy). A replay with dev cheats used is not a goal (cheats draw from `spawns`).

### Notes for the merge (brief line 19)

- `packages/shared/src/core/world.ts`: `rng` → `streams`. Any branch drawing `world.rng.*` must pick a stream (4.1 map loader: none expected; 4.3 spawn points: `world.streams.spawns`; 4.5 decay: `world.streams.decay`).
- `packages/shared/src/core/worldSnapshot.ts`: `rngState` → `streams`; new `worldDigest`. Add new World state as before.
- `packages/shared/src/waves/waveDirector.ts`: only the two draw lines changed (`pickSpawnPoint`, `spawnWaveZombie`). Story 4.3 rewrites spawn picks: keep them on `streams.spawns`.
- `apps/server/src/rooms/schema/RunState.ts`, `syncState.ts`, `packages/shared/src/net/stateView.ts`, `apps/client/src/net/fakeRoom.ts`: new field `runSeed` appended at the end of the run fields / key list; take both sides if another story appends a field.
- `packages/shared/src/net/messages.ts`: `joinOptionsSchema.devRunSeed`.
- `apps/server/src/rooms/RunRoom.ts`: `devRunSeed` field, `takeDevRunSeed` in `onCreate`, `startRun` seed line.
- `packages/shared/src/bots/headlessRun.ts`: run start moved into `createHeadlessWorld` (replay/inputLog.ts); `record` / `onEnd` options. `bots/botShop.ts`: optional `record` sink.
- `apps/client/src/scenes/GameScene.ts`: `perf.soloSeed`, `runSeed` / `isOnline` getters, solo Results `seed`. `ui/uiState.ts` results screen gains `seed`.
- Not touched: map loader, collision, nav grid, `runStateMachine.startBuild`, balance JSON.
- After review: `shopStream` takes `world.run` too and throws outside a build phase (callers must be build-phase code: the card shop, Epic 6).

### Known properties (review notes)

- **Cross-run stream swap (review L4, harmless):** stream seeds are unique *within* a run, but two different run seeds can map one run's `decay` seed onto another run's `spawns` seed (`a ^ h(decay) = b ^ h(spawns)` for `b = a ^ h(decay) ^ h(spawns)`). Runs never share streams, so nothing depends on it.
- **Slot reuse inside one build phase (review L2, for Epic 8):** a new player in a reused slot continues the leaver's partly used `shop:<slot>:<build>` stream. Joins happen at a build start before any draw; if Epic 8 allows a join after a draw, set `world.streams.shop[slot].buildPhaseIndex = -1` on slot assignment (allocation-free, reseeds on the next draw). Documented on `shopStream`.

## Senior Developer Review (AI)

Fresh-agent review of dbb850f: **approved with small fixes**.

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| M1 | Medium | No test caught `combat` and `spawns` sharing a stream: solo spread (`firing.ts`) drawing from `streams.spawns` passed all tests. | New `core/streamIndependence.test.ts`: two solo runs from one seed, one firing SMG bursts during wave 1; every wave-1 spawn position must be equal (liveness: > 20 shots, 16 spawns). Fails under that exact mutation. |
| L1 | Low | `shopStream` keys on `waves.number`, which during wave n + 1 already equals the next build's index: a mid-wave draw would advance the next build's stream without reseeding. | `shopStream` throws outside a build phase (no new run state, `startBuild` untouched). Test "review L1". |
| L2 | Low | A slot reused in the same build phase continues the leaver's stream. | Documented for Epic 8 (on `shopStream` and in Known properties): joins happen at a build start, before any draw; the allocation-free fix is named. |
| L3 | Low (doc) | Two different run seeds can swap `decay`/`spawns` across runs. | Noted in Known properties (harmless). |

Mutations proven after the fixes (each fails its test, then reverted): 21 `firing.ts` spread from `streams.spawns` → streamIndependence; 22 phase guard removed → "review L1". The 21 earlier mutations (0–20) stand.

Gates after the fixes: typecheck, lint, test (1,158 passed, 3 skipped), build green (load ~1.6).

## Change Log

- 2026-11-22: Story built (dbb850f): named seed streams, run seed on Results and overlay, dev set-run-seed online, headless replay.
- 2026-11-22: Review fixes: M1 test (shots don't move spawns), L1 shop draws only in a build phase, L2/L3 documented. Status done.

### File List

New: `packages/shared/src/core/seedStreams.ts`, `packages/shared/src/core/streamIndependence.test.ts` (review), `packages/shared/src/core/seedStreams.test.ts`, `packages/shared/src/replay/inputLog.ts`, `packages/shared/src/replay/replay.test.ts`, `apps/server/src/run/devRunSeed.ts`, `apps/server/src/run/devRunSeed.test.ts`, `apps/server/src/rooms/RunRoom.seed.test.ts`, this story file.

Modified (shared): `core/rng.ts`, `core/world.ts`, `core/worldSnapshot.ts`, `core/determinism.test.ts`, `combat/firing.ts`, `combat/spread.ts` (comment), `waves/waveDirector.ts`, `zombies/spawnRing.ts`, `bots/headlessRun.ts`, `bots/botShop.ts`, `net/messages.ts`, `net/stateView.ts`, `index.ts`.
Modified (server): `rooms/RunRoom.ts`, `rooms/schema/RunState.ts`, `rooms/schema/syncState.ts`, `rooms/schema/syncState.test.ts`.
Modified (client): `debug/DevCheats.tsx`, `debug/PerfOverlay.ts`, `debug/perfStats.ts`, `debug/devCheatActions.ts`, `debug/stressScenario.ts`, `debug/urlOptions.ts`, `debug/urlOptions.test.ts`, `debug/netSummary.test.ts`, `net/connection.ts`, `net/fakeRoom.ts`, `net/onlineFlow.ts`, `net/onlineFlow.test.ts`, `net/lobbyStore.test.ts`, `scenes/GameScene.ts`, `sim/NetSimHost.ts`, `sim/NetSimHost.test.ts`, `ui/ResultsScreen.tsx`, `ui/overlay.css`, `ui/uiState.ts`, `ui/uiState.test.ts`.
Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`.
