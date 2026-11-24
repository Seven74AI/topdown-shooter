# Story 6.1: The full 10-wave curve

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

## Story

As a team,
I want the run to last 10 waves with the full zombie mix,
so that a run builds to a real climax.

{{BRIEF}}

Most relevant here: 3/4 (fairness rules, "Beat the rule"), 8 (no new randomness: wave types are not drawn), 9 (the 10-wave sim must prove all 10 waves were played), 10 (every number in `waves.json`), 12/16 (wave 10 = 400 zombies queued behind the 150 cap: tick and FPS floor), 15 (earnings logged against the GDD, not tuned), 18 (a "start at wave N" dev switch), **28 (6.1 owns the run's end until 6.11: clearing wave 10 must always reach Results)**.

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "Each wave is exactly as big as the table says."** Wave N has `N × 40` zombies at 4 players, × 0.4 / 0.6 / 0.8 / 1.0 for 1–4 players (rounded): wave 7 = 280 / 224 / 168 / 112 (4 → 1 players), wave 8 = 320 / 256 / 192 / 128, wave 9 = 360 / 288 / 216 / 144, wave 10 = 400 / 320 / 240 / 160. Never more than 150 alive at once; the rest wait in the queue (FR28, FR31).
- **F2 "The new waves have the full bestiary, in exact numbers."** Waves 7–10 use the mix (walker / runner / crawler / spitter / bloater) W7 38/22/15/10/15, W8 35/24/15/11/15, W9 40/18/17/10/15, W10 38/22/15/10/15 as exact shares (Story 3.10's rule, no random draw). Example at 4 players, wave 10: 150 Walkers, 88 Runners, 60 Crawlers, 40 Spitters, 60 Bloaters, 2 Brutes (table in Dev Notes).
- **F3 "Exactly 2 Brutes in each of waves 7–10, whatever the party size, and never in the opening burst."** The Brutes are part of the wave size (taken off the Walkers), and each waits for its own point in the wave (6.1 D1: the first after 25 % of the wave has spawned, the second after 65 %).
- **F4 "Zombies never get tougher, only more."** HP, damage and speed of every type are the same in wave 10 as in wave 1 (pillar 1; only endless beyond wave 15 changes HP, Story 6.12).
- **F5 "The last 5 always rush."** In every wave 7–10, when 5 wave zombies are left (queue empty) they rush the nearest player, as today (a winding-up Spitter / swelling Bloater keeps its move).
- **F6 "A run always ends on a Results screen."** Clearing wave 10 shows Results "You held out!" with "Wave reached 10" (until Story 6.11 adds the vote); a wipe in any wave shows "Wave reached N". No run ever stops between phases (the 10-wave sim asserts it never hits its tick limit).

### Behaviour

1. **Balance (`waves.json`).** `runWaves` 6 → **10**. `mix` gains entries 7–10 (F2). `fixed` gains entries 7–10: `{ "brute": 2 }` each. New key `fixedAtFractions` (6.1 D1): the spawn point of the i-th fixed zombie of a wave as a fraction of the wave, `[0.25, 0.65]` (the existing `fixedAtFraction` 0.25 stays as the default for a list shorter than the fixed count; or replace it, see Decisions D-A). `decay.json › stageByWave` already has 10 entries `[1, 1, 2, 2, 3, 3, 4, 4, 5, 5]` (no change).
2. **Fixed zombies spread through the wave.** `waveZombieType` today serves every fixed zombie at once as soon as `fixedAt` wave zombies have spawned (`size − queued ≥ fixedAt`), so wave 7's two Brutes would arrive back to back. With `fixedAtFractions` the k-th fixed zombie of the wave (counting over all fixed types in `ZOMBIE_TYPES` order) waits until `round(size × fixedAtFractions[k])` have spawned. Waves 5–6 (one Brute) are unchanged (0.25).
3. **The 6-wave ending is removed.** `endWave` already ends the run after wave `runWaves`; setting 10 is the whole change in the state machine. Every comment and test that says "6 waves" / `runWaves 6` is updated (11 test files read `runWaves`; see Current state). Until Story 6.11, `run.held_out` + Results "You held out!" after wave 10 stays the ending.
4. **Wave 10 banner.** No new banner text ("Wave 10" as every wave). Stage banners "Ruins" (wave 7) and "Collapse" (wave 9) already come from `decay.json › stageNames`.
5. **Ten-wave sim (AC 3 of the epic).** A new `economy/tenWaveSim.test.ts` (or `fiveWaveSim.test.ts` renamed `runSim.test.ts`; D-B):
   - **(a) economy run:** 4 bots, seeds 1–3, the real balance, bots in god mode (`world.debug.godMode = true`, the `net150` pattern) so every run plays all 10 waves (6.1 D2). It asserts `wavesCleared === 10` and `heldOut` for every run, logs each player's earnings next to the GDD target **2,500–3,000 per player** and the gap in %, and asserts the money adds up (wallet = 100 + earned − spent), ≥ 1 Brute spawned in each of waves 7–10, ≥ 1 Bloater burst in wave 10.
   - **(b) survival run:** 2/3/4 bots × seeds 1–3 without god mode: every run ends in Results (held out or wiped, never the tick limit), survival by wave logged. Bot survival is not difficulty evidence (brief 15).
   - `runHeadless` gets `maxTicks` large enough for 10 waves (today's default is 20 min of game time; wave 10 alone needs ≥ 50 s of spawning: 400 zombies at 2 per 0.25 s) — default 40 min, and a `god?: boolean` option.
   - The existing 6-wave checks (Spitter, Bloater, trap/mine liveness) keep running by passing a balance override `runWaves 6` (`withOverrides`), so the test time stays inside the 180 s budget.
6. **Dev switch "start at wave N"** (brief 18; 6.1 D4): server `DEV_START_WAVE=7` (dev only, like `DEV_DECAY_STAGES`, refused in production) and solo `?startwave=7` (dev builds only): the World's `waves.number` is set to N − 1 before the first build phase (the `applyTestScenario` / `NET150_START_WAVE` pattern), so the first build applies wave N's decay stage (all mutations of stages 1..stage) and the wave that follows is wave N. Combine with `?wallet=` for money.
7. **Balance check.** `loadBalance › crossCheck` already refuses fixed counts above the smallest wave; add: `fixedAtFractions` ascending, each in [0, 1), and at least as long as the biggest fixed count of any wave (or the default applies). The biggest-wave check (`runWaves × zombiesPerWave` ≤ 65,535) passes (400).
8. **Tests:** `waveDirector.test.ts` (+ `waves 7–10 sizes at 1–4 players` (F1 table), `waves 7–10 exact type counts` (Dev Notes table), `2 Brutes in each of waves 7–10 at every party size`, `the second Brute waits for 65 %`, `waves 5–6 unchanged: one Brute at 25 %`, `no zombie stat changes with the wave` (F4: spawn wave 1 and wave 10 Walkers, same HP/speed/damage), `last-5 rush in wave 10`); `runStateMachine.test.ts` (+ `wave 10 cleared → results, heldOut`; `wave 9 cleared → build`); `RunRoom.3-10.test.ts` (wave counts updated: Results after wave 10); `balance.test.ts` (+ `fixedAtFractions validated`); the sims (5).

## Tasks / Subtasks

- [ ] **T0 Art.** No new art: waves 7–10 use existing zombie looks. Stages 4–5 look as today ("late night" / "before dawn" in `NIGHT_BY_STAGE`) until Stories 6.2 and 6.4 land; say so in the Completion Notes.
- [ ] **T1 Balance** (AC 1, 7)
  - [ ] `waves.json`: `runWaves` 10; `mix[6..9]`; `fixed[6..9] = { "brute": 2 }`; `fixedAtFractions: [0.25, 0.65]`.
  - [ ] `balanceSchema.ts › wavesSchema`: `fixedAtFractions: z.array(z.number().min(0).lt(1)).default([])` (ascending refine); comment on `runWaves` updated ("Epic 6: 10; Story 6.11 opens the vote after it").
  - [ ] `balance.ts › crossCheck` (AC 7). Tests in `config/balance.test.ts`.
- [ ] **T2 Fixed zombies spread** (AC 2; F3)
  - [ ] `waves/waveDirector.ts`: `WaveState.fixedAt` (one number) → per-wave thresholds for each fixed zombie (a small preallocated `Uint16Array fixedAtList` of length `MAX_FIXED_PER_WAVE` (balance-checked, e.g. 8 for endless Brutes, Story 6.12), filled by `beginWave`), plus `fixedServed` (how many fixed zombies have spawned this wave). `waveZombieType` serves the next fixed zombie only when `size − queued ≥ fixedAtList[fixedServed]`. No allocation, no RNG draw.
  - [ ] `snapshotWorld` (`core/worldSnapshot.ts`): the new arrays (`Array.from`, as `typeTarget`).
  - [ ] Tests (AC 8).
- [ ] **T3 Remove the 6-wave ending** (AC 3; F6)
  - [ ] Update every reader of `runWaves` and every "6 waves" comment: `runStateMachine.ts` (header), `balanceSchema.ts`, `fiveWaveSim.test.ts`, `tools/sims/fiveWave.ts` (help text; the per-wave table uses `runWaves`), `ResultsScreen.tsx` header comment, the 11 test files that read `runWaves` (`grep -rln runWaves --include=*.test.ts`) — most pass `runWaves` through `withOverrides` and keep working; fix the ones that assume 6.
  - [ ] `RunRoom.3-10.test.ts`: the held-out path now needs 10 waves (use a `runWaves` override for speed, plus one real-balance check that `runWaves === 10`).
- [ ] **T4 Ten-wave sim** (AC 5; brief 9, 15)
  - [ ] `bots/headlessRun.ts`: `maxTicks` default 40 min; `god` option (`world.debug.godMode`, as `applyTestScenario`); the log keeps `waves[]` per wave.
  - [ ] `economy/tenWaveSim.test.ts` (a) and (b); 6-wave checks moved to a `runWaves 6` override.
  - [ ] `tools/sims/fiveWave.ts` → accepts `--waves 10` (default `runWaves`) and `--god`; output prints the GDD target 2,500–3,000.
  - [ ] Record the earnings result (mean, range, gap to the target, by player count) in the Completion Notes and in `docs/epic-5-decisions.md`-style one line for the Epic 5 balance pass (do not change prices: brief 15).
- [ ] **T5 Dev switch** (AC 6; brief 18)
  - [ ] Server: `apps/server/src/run/devStartWave.ts` (new, the `devDecayStages.ts` pattern: parse, refuse outside dev, log `dev_start_wave`); `RunController` option `startWave`; `RunRoom` passes it.
  - [ ] Solo: `?startwave=` read where `?wavemix` is (dev builds only), passed to `LocalSimHost`.
  - [ ] Tests: `devStartWave.test.ts` (parse, refused in production, the first wave is N, its stage is applied).
- [ ] **T6 Gates.** Mutations (e.g. `fixedAtFractions` ignored → "second Brute waits" fails; `runWaves` back to 6 → state machine test fails; god mode off in (a) → `wavesCleared === 10` fails; mix entry 9 removed → exact-count test fails) and which tests failed. Browser check: solo `?startwave=9&wallet=3000` (wave 9 and 10, Results "You held out!" after wave 10), online two tabs with `DEV_START_WAVE=10`. Record `?stress=150` is not affected (no render change) — skip with a note. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.1 D1 — When the two Brutes of waves 7–10 come.** Recommended: **the first after 25 % of the wave, the second after 65 %** (never together, and in wave 10 the second comes after the Behemoth's entry at 50 %, not with it). Alternative: both right after 25 % (today's code would do that: two Brutes side by side).
2. **6.1 D2 — How the earnings check is measured.** Recommended: **with bots that can't die**, so every check run really plays all 10 waves (normal bots rarely reach wave 10, and a short run under-reports money). A second set of normal runs only logs how far bots get. Alternative: normal bots only (the money number then mixes in early wipes).
3. **6.1 D3 — If earnings miss 2,500–3,000 per player.** Recommended: **log it only; no price or reward change in this story** (the Epic 5 balance pass decides; Epic 3's runs were 4–19 % below target). Alternative: raise the wave-clear bonus here.
4. **6.1 D4 — A dev switch to start at wave N** (`?startwave=7` solo, `DEV_START_WAVE=7` server; dev builds only). Recommended: **yes** (testing waves 7–10 otherwise takes 15 minutes per try). Alternative: none.

### Decisions (developer guidance)

- **D-A Keep `fixedAtFraction` as the fallback.** `fixedAtFractions[k]` when present, else `fixedAtFraction` for every fixed zombie (so waves 5–6 and any test override keep working). Do not delete the old key in this story (merge risk with 5.x branches).
- **D-B Sim file name.** Keep `fiveWaveSim.test.ts` for the 6-wave override checks (renaming touches open Epic 5 branches); add `tenWaveSim.test.ts`. Rename in Epic 6's retro if wanted.
- **D-C No new randomness.** Types per wave stay exact shares in a fixed order (3.10); Brute timing is a fraction, not a draw. The replay digest test must still pass with the new arrays in `snapshotWorld`.
- **D-D Stage 4–5 placeholders are fine.** Waves 7–10 at stages 4–5 work today (no mutations for those stages yet; `applyDecayStage` handles them; the night look clamps to `NIGHT_BY_STAGE[3..4]`). 6.2 and 6.4 add Ruins and Collapse later.
- **D-E Endless later.** `waveMixOf` already reuses the last entry for waves past the list (W10's mix for 11+), and `fixed` returns none past the list: Story 6.12 adds endless Brutes. Leave both behaviours.

### Current state (read before changing)

- `packages/shared/src/config/balance/waves.json`: `runWaves 6`, `mix` (6 entries), `fixed [{}, {}, {}, {}, {brute:1}, {brute:1}]`, `fixedAtFraction 0.25`, `maxAlive 150`, `lastRushCount 5`, `spawnIntervalS 0.25`, `spawnPerInterval 2`, `playerCountScale [0.4, 0.6, 0.8, 1.0]`.
- `packages/shared/src/waves/waveDirector.ts`: `waveSize` (N × `zombiesPerWave` × scale, rounded, ≥ 1), `waveMixOf` (clamps to the last entry), `waveTypeCounts` (exact shares, leftovers in `ZOMBIE_TYPES` order), `applyFixedCounts` (fixed taken off Walkers first; none past the list), `beginWave` (sets `fixedAt = min(size − fixedTotal, round(size × fixedAtFraction))`), `waveZombieType` (fixed first once `size − queued ≥ fixedAt`), `spawnWaveZombie` (`streams.spawns` jitter only), `updateWaves` (spawn batches under `maxAlive`, `remaining`, last-5 rush → `wave.rush_started`).
- `ZOMBIE_TYPES` (`zombies/zombieTypes.ts`) = `["walker", "crawler", "runner", "spitter", "brute", "bloater"]` (wire indexes; append-only).
- `packages/shared/src/run/runStateMachine.ts`: `startBuild` (decay mutate, clears acid/grenades/molotov/blasts, `returnOutPlayers`, `build.started`), `startWave`, `endWave` (`wave.ended`; `number ≥ runWaves` → `heldOut`, `run.held_out`, `endRun`), `endRun`, `updateRun` (wipe → `endRun`; build countdown / all Ready → `startWave`; wave tick → `endWave`).
- `apps/server/src/rooms/RunRoom.ts › onTick` forwards `run.held_out` → `endRun(controller, wave, true)` → `state.resultHeldOut`; client `ResultsScreen.tsx` / `uiState.resultsTitle` show "You held out!".
- `packages/shared/src/economy/fiveWaveSim.test.ts` (3.10 + 5.x liveness, `runHeadless`, 180 s timeout), `bots/headlessRun.ts` (`maxTicks` default 20 × 60 × 20 ticks = 20 min), `tools/sims/fiveWave.ts`.
- `packages/shared/src/net/testScenarios.ts › applyTestScenario` (`waves.number = NET150_START_WAVE − 1`): the start-at-wave pattern.
- `apps/server/src/run/devDecayStages.ts`: the dev-switch pattern (parse, refuse in production, warn log).
- `core/worldSnapshot.ts › snapshotWorld`: copies `world.waves` (typed arrays via `Array.from`).
- Economy: `economy.json` (`waveClearBonusPerWave 10` → 550 over 10 waves per player, as the GDD's 2,500–3,000 assumes).

Exact counts the tests assert (from the real `waveTypeCounts` + `applyFixedCounts`):

| Wave | Players | Size | Walker | Runner | Crawler | Spitter | Bloater | Brute |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 4 / 3 / 2 / 1 | 280 / 224 / 168 / 112 | 105 / 84 / 62 / 41 | 61 / 49 / 37 / 25 | 42 / 34 / 26 / 17 | 28 / 22 / 16 / 11 | 42 / 33 / 25 / 16 | 2 |
| 8 | 4 / 3 / 2 / 1 | 320 / 256 / 192 / 128 | 111 / 88 / 66 / 43 | 76 / 61 / 46 / 30 | 48 / 39 / 29 / 20 | 35 / 28 / 21 / 14 | 48 / 38 / 28 / 19 | 2 |
| 9 | 4 / 3 / 2 / 1 | 360 / 288 / 216 / 144 | 143 / 114 / 85 / 56 | 64 / 52 / 39 / 26 | 61 / 49 / 37 / 25 | 36 / 28 / 21 / 14 | 54 / 43 / 32 / 21 | 2 |
| 10 | 4 / 3 / 2 / 1 | 400 / 320 / 240 / 160 | 150 / 120 / 90 / 59 | 88 / 70 / 52 / 35 | 60 / 48 / 36 / 24 | 40 / 32 / 24 / 16 | 60 / 48 / 36 / 24 | 2 |

### Must be preserved

Waves 1–6 bit for bit (sizes, exact counts, the wave-5/6 Brute at 25 %; replay digests of existing recorded logs change only through the new snapshot fields — regenerate fixtures only if a test pins a digest, and say so); 4.3 spawn rules; last-5 rush; 150-alive cap; the build phase between every wave; Results after a wipe.

### Copies touched (brief 2)

World (`WaveState.fixedAtList`, `fixedServed`) → no schema change (the wave number/remaining are already synced) → no `syncState` change → no stateView change → mirror: none (NetSimHost reads `wave`/`remaining`) → Predictor: none → devThrottle: none → `snapshotWorld` (new wave arrays). Server: `RunController` option `startWave`, `RunRoom` dev switch. Solo: `LocalSimHost` start wave.

### Beat the rule (for the reviewer; brief 4)

1. Solo wave 7 (112 zombies): still exactly 2 Brutes, and never both at once?
2. Kill zombies as fast as they spawn: can the second Brute's 65 % point be skipped (it must come once 65 % have *spawned*, not been killed)?
3. Wipe on the last zombie of wave 10 on the same tick it dies: Results show held out or wiped? (One ending only; the 3.10 rule: the wipe is checked first in `updateRun`.)
4. Hidden tab across the wave-10 clear: Results shown once, with the right title.
5. `?startwave=10` online without `DEV_START_WAVE`: refused / ignored (no client-side wave skip online).
6. A build phase "Ready" spam during wave 10's build: no double wave start.
7. Does any type get more HP in wave 10 than wave 1 (F4)?

### Bandwidth

None added (the horde stream already carries every type; wave 10's 400 zombies are 150 alive at most).

### Phone FPS / Perf

No render change. Server: wave 10 at 150 alive with 60 Bloaters and 40 Spitters is the heaviest wave yet: record `tickCost` p99 for a wave-10 mix at 150 alive (`PERF_ASSERT=1`, load < 1) in the Completion Notes; it is the baseline Stories 6.3–6.7 add to.

### Art

None (T0).

### Dependencies

- Needs nothing from other 6.x stories. Epic 5 work in progress (5.13 card shop, 5.20–5.25) does not touch `waves.json` or `waveDirector.ts`.
- 6.5 (Behemoth, wave 10 at 50 %) and 6.12 (endless Brutes, HP) build on `waveDirector.ts` after this story: they must reuse `fixedAtList`.
- 6.11 replaces this story's ending (Results after wave 10) with the vote.

### Notes for the merge (brief 19)

- `waves.json`: 6.1 owns `runWaves`, `mix[6..9]`, `fixed[6..9]`, `fixedAtFractions`; 6.12 adds an `endless` block; 6.5 may add the boss trigger fraction in `boss.json`, not here.
- `waveDirector.ts`: 6.5 (alive cap 110 while the boss lives: the `maxAlive` read in `updateWaves`), 6.8 (stampede pauses normal spawns), 6.12 (endless sizes, Brute cap, HP) all edit `updateWaves`/`beginWave`: keep each change behind its own small helper so merges are line-local.
- `runStateMachine.ts`: 6.11 adds the vote phase in `endWave`; this story changes no code there (only `runWaves` data and comments).
- `headlessRun.ts`: 6.11 adds a bot vote; 6.12 adds "stay N endless waves". Keep options additive.

### Suggested build round

**Round 1**, first of Epic 6. Can run in parallel with 6.2, 6.3 and 6.8 (different files: decay/map, render/lighting, new `shared/events`). Overlaps 6.5 and 6.12 in `waveDirector.ts` (they come later anyway). Small story (~1 day).

### References

- `epics.md` › Story 6.1; FR28, FR29, FR31. GDD › Level Progression, Economy (2,500–3,000 per player), Difficulty Curve. `docs/ideas/epic-6/proposal.md` §2 (the 10-wave curve). Stories 3.10 (wave sizes, exact mix, sims), 5.7 (fixed counts), 5.8 (6-wave run).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
