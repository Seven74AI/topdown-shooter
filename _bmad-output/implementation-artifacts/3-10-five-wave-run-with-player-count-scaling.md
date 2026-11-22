# Story 3.10: Five-wave run with player-count scaling

Status: review

## Story

As a team,
I want a 5-wave run that grows the horde and adds Runners and Crawlers, sized to how many of us play,
so that the run feels right with 2, 3 or 4 players.

> **Decisions taken while writing this story (no designer questions; recorded here, the designer can change them in `waves.json` / `bots.json`):**
> 1. **Wave size** stays `wave N × zombiesPerWave` (40) at 4 players: 40 / 80 / 120 / 160 / 200 (FR28). The run is **5 waves** (`waves.runWaves`); clearing wave 5 ends it with "You held out!" (Epic 6 sets 10 and adds the boss).
> 2. **Composition per wave** is a list of integer weights per zombie type in `waves.json › mix` (index = wave − 1; waves past the list use the last entry). Proposed: W1 Walkers only · W2 80 % Walkers / 20 % Runners · W3 65 / 20 / 15 Crawlers · W4 55 / 25 / 20 · W5 50 / 25 / 25. The counts per type are exact (`floor` of the share, the remainder handed out one by one in type order), and the types are **spread evenly through the wave** (each spawn takes the type that is furthest behind its share; ties in `ZOMBIE_TYPES` order). No RNG draw, so a wave's composition never depends on the seed.
> 3. **Player-count scaling** (FR31): `waves.playerCountScale = [0.4, 0.6, 0.8, 1.0]` for 1–4 players; size = `round(N × 40 × scale)`, at least 1. 2 players: 24/48/72/96/120; 3 players: 32/64/96/128/160. **Solo × 0.4** follows the GDD's designer note ("solo testing could use × 0.4"; solo is not a target mode): 16/32/48/64/80.
> 4. **"Players at the start of a wave"** = every player in the World when `beginWave` runs. A build phase always comes first and returns downed/out players standing (3.1), and players who left were removed (2.8), so this is "the players still in the run" (FR31's mid-run rescale falls out of it for Story 8.2).
> 5. **Alive cap and 200-zombie waves** (FR30): unchanged rules. At most `maxAlive` (150) are alive; the rest stay queued and leave the queue as room frees up (2 per 0.25 s). The last-5 rush starts only when the queue is empty and ≤ 5 remain, whatever their types. Wave 5 at 4 players queues ≥ 50 at its peak.
> 6. **The dev wave mix stays** as an override (`?wavemix=`, `DEV_WAVE_MIX`): when set, it replaces the composition (for type-specific checks); otherwise the real composition runs. It is no longer "temporary".
> 7. **Results:** one screen for both endings. Held out: title "You held out!", line "Wave reached 5"; wipe: title "Wave reached N" as before. Both show per player: color dot, name, kills and **earned** (`PlayerState.earned`, money earned this run, the starting 100 not included). Temporary until Epic 6's full Results.
> 8. **Bots buy and build:** `bots.json › shoppingList` (the Story 2.10 hook) is wired: in each build phase a bot walks the list in order, buys the first item it doesn't have yet, and **stops at the first item it can't afford** (it saves up rather than spending on what comes later). A weapon replaces the slot not in hands (or fills the empty slot) and the bot swaps to it; a building entry means "own this many of that type" (two `wood_barricade` entries = two barricades) and is placed on the first free spot from a fixed list of candidates around the bot (the server validates each try).
> 9. **Balance levers** (retro brief line 13): revive stays 3 s / full damage. Only prices, the build heal, the wave-clear bonus, rewards and wave size/mix are tuned, each change backed by the seeded bot sims (table in Completion Notes).

## Acceptance Criteria

1. **Wave curve and composition (FR28, FR29).** With 4 players, waves 1–5 have 40, 80, 120, 160 and 200 zombies. Wave 1 is Walkers only; wave 2 adds Runners; wave 3 adds Crawlers; waves 4–5 mix all three. The counts per type follow the `waves.json` weights exactly and the types are spread through the wave. Every number is in `waves.json`.
2. **Player-count scaling (FR31).** With 2 or 3 players in the run when a wave starts, its size is × 0.6 or × 0.8 (rounded); 4 players × 1.0; solo × 0.4 (decision 3). A player who leaves during a build makes the next wave smaller.
3. **Alive cap and rush (FR30).** Waves larger than the alive cap (150) queue the rest; never more than 150 alive; the last-5 rush still starts only after the queue has emptied.
4. **The run ends at wave 5.** Clearing wave 5 (the wave-clear bonus paid) ends the run: phase `results`, a `run.held_out` event, no further build phase. Online every client shows the temporary **"You held out!"** Results with wave reached, kills and money earned per player; solo shows the same for the one player. A wipe still shows "Wave reached N" (now also with money earned). Back to lobby / Restart work as before.
5. **Earnings logged.** A full 5-wave run with 4 bots writes each player's total earnings (and kills, purchases, buildings) to the test output (the seeded headless sim) and to the log of a real run (server `run_ended` with `heldOut`, and `tools/bots`' summary), for comparison with the GDD target (≈ 2,500–3,000 over 10 waves; the 5-wave share is worked out in Dev Notes).
6. **Bots shop and build.** In each build phase the bots buy from `bots.json › shoppingList` (weapons and buildings) through the real shop and placement rules, both headless and over the wire (`tools/bots`).
7. **Balance pass.** Seeded bot sims with 2/3/4 bots, several seeds, record survival by wave, earnings and purchases. Any balance change is justified by them in Completion Notes (revive stays 3 s / full damage).
8. **The sims cannot pass without running.** Each sim run must end in `results` (held out or wiped, never the tick limit), every run must have ended ≥ 1 wave, and bots must have bought weapons and placed buildings.
9. **Measured (NFR4, retro R3/A8).** A real 4-bot 5-wave run against a local server records per-client download KB/s per wave, tick cost (avg/max) and per-player earnings. Story 3.2's money bandwidth and Story 3.1's `buildTicksLeft` line are measured with the `tickCost` approach.
10. **Tests.** Vitest covers the sizes and scaling, the composition counts and spread, the dev-mix override, the end of the run at `runWaves` (no build after it, bonus paid first, wipe unchanged), the net event round trip, the room (`RunRoom.3-10.test.ts`: phase `results` + `resultHeldOut` + earned over the wire), the Results model (title, earned), the bot shop policy, and determinism.

## Tasks / Subtasks

- [x] **Task 1: Balance schema + JSON** (AC 1, 2, 7): `wavesSchema` gains `runWaves` (int ≥ 1), `playerCountScale` (4 numbers in (0, 1]), `mix` (array ≥ 1 of `record<balanceId, int ≥ 0>`, each with a positive total). `loadBalance` checks every mix type is a zombie type with balance. `waves.json` gets the values of decisions 1–3.
- [x] **Task 2: Wave director** (AC 1–3): `waveSize(balance, n, players)` scales; `WaveState` gains preallocated `typeTarget` / `typeSpawned` (`Uint16Array(ZOMBIE_TYPES.length)`), filled in `beginWave`; `waveZombieType` picks the type furthest behind its share (dev mix overrides). No allocation per tick. `snapshotWorld` copies the two arrays.
- [x] **Task 3: Run end** (AC 4): `RunState.heldOut`; `endWave` ends the run after wave `runWaves` (`run.held_out { wave }` after `wave.ended`, then `endRun`), else `startBuild`. Sim event + net kind 25 `[25, wave]` (encode/decode).
- [x] **Task 4: Server** (AC 4, 5): `RunRoom.onTick` handles `run.held_out` → `endRun(controller, wave, true)`; schema `RunState.resultHeldOut: boolean` (+ `stateView`, `RUN_STATE_FIELDS`, `resetRunFields`, fake room, devThrottle via the key list); `run_ended` logs `heldOut`, `kills`, `earned`.
- [x] **Task 5: Client Results** (AC 4): `ResultRow.earned`, `UiScreen.results.heldOut`; `resultsFromState` reads `resultHeldOut` and `earned`; `ResultsScreen` title and Earned column; solo `GameScene` shows Results on `run.held_out` (and the wipe) with earned.
- [x] **Task 6: Bot shop policy** (AC 6): shared `bots/botShop.ts`: `botShopNext` (pure: next list entry to buy, or none), `botWeaponSlot`, `botPlaceCandidate` (fixed candidate spots around the bot), and `botBuildPhase(world, id, list)` for headless runs (real `buyWeapon` / `placeBuilding`). `tools/bots` does the same over the wire (`shop.buy`, `building.place`, one try per step, refusals move on), swaps to a new weapon, and its summary prints per-player kills, earned, wallet, purchases and buildings. `bots.json › shoppingList` set from the sims.
- [x] **Task 7: Five-wave sim** (AC 5, 7, 8): `economy/fiveWaveSim.test.ts` (2/3/4 bots × seeds, real balance, real systems, bots Ready at once after shopping) with the anti-silent-pass assertions; the old 3.2/3.3 sims keep running (updated for the run end).
- [x] **Task 8: Measurements** (AC 9): `run/economyBandwidth.test.ts` (money patches + events in a 4-player wave; `buildTicksLeft` in a build); a real 4-bot run with `tools/bots` (numbers in Completion Notes).
- [x] **Task 9: Tests and checks** (AC 10): see Testing; browser check solo through W2 (Runners) with `?zdmg=`, the "You held out!" screen (dev skip), screenshots under `/tmp/s310/`.

## Dev Notes

### Scope and prerequisites

- Read first: `waves/waveDirector.ts` (`beginWave`, `updateWaves`, `waveZombieType`), `run/runStateMachine.ts` (`endWave`, `endRun`), `economy/economy.ts` (the bonus is paid from `wave.ended` in the economy slot of the same tick), `economy/shopSim.test.ts` (A10 sim), `bots/botPolicy.ts`, `tools/bots/*`, `apps/server/src/rooms/RunRoom.ts` (`onTick`, `endRun`), `apps/client/src/net/onlineFlow.ts`, `ui/ResultsScreen.tsx`, `scenes/GameScene.ts` (`showSoloResults`).
- **Out of scope:** the 10-wave curve, Spitters/Brutes, the boss and the evac vote (Epics 5–6); the full Results (Epic 6/10.7); mid-run joins (8.2).
- **Parallel:** 3.5's gap fix and Story 2.12 (rewind) are built at the same time; both touch combat/pathing, not the wave director or Results. Merge `claude/epic-2-continue` at the end.

### The GDD target, cut to 5 waves

GDD: ≈ 2,500–3,000 per player over 10 waves (100 start + 550 wave bonus + ≈ 1,850–2,350 from kills and assists). Kill money scales with the zombies faced: waves 1–5 are 600 of the 2,200 zombies of a 10-wave run (27 %). So the 5-wave equivalent is ≈ 100 + 150 (bonus 10 × (1+…+5)) + 0.27 × (1,850–2,350) ≈ **750–890 in the wallet, i.e. `earned` ≈ 650–790 per player**. The sims compare `earned` against that band (log only, not an assertion: the AC is "written to the output").

### Composition (decision 2)

`mix` weights → counts for size S: `count_t = floor(S × w_t / W)`, the leftover `S − Σ count_t` handed out one each in `ZOMBIE_TYPES` order among types with `w_t > 0`. Spawn pick: among types with `spawned_t < count_t`, the smallest `(spawned_t + 1) / count_t` (compared as cross products in integers); ties go to the earlier type. A Runner-heavy share therefore comes evenly, not in a block at the end.

### Run end (decision 1, AC 4)

`endWave`: `clearWave` → `wave.ended` (economy pays N × 10 the same tick) → if `waves.number >= runWaves`: `heldOut = true`, `run.held_out { wave }`, `endRun` (phase `results`) — else `startBuild`. `updateRun` returns at once in `results`. The server ends the run on `run.held_out` like on `team.wiped`, so `run_ended` carries the paid bonus.

### Bot shop (decision 8)

- Weapons: entry owned → next; affordable → buy (replace the slot not in hands, fill an empty slot first) then swap to it; not affordable → stop.
- Buildings: the k-th entry of a type wants k of that type owned; owned enough → next; affordable → place at the first candidate the rules accept (8 directions × 2 radii around the bot, rotation facing the bot); no spot → next; not affordable → stop.
- Headless: all purchases on the first build tick, then Ready. Over the wire: one action per 50 ms step (shares the "other" bucket: ≤ 10/s with pongs and Ready), Ready once the list is done.

### Testing (Vitest, fixed seeds)

- `waveDirector.test.ts`: sizes 4p/3p/2p/1p; composition counts per wave (exact) and spread (no type in a block); dev mix overrides; 200 at 4 players never > 150 alive, rush after the queue empties.
- `runStateMachine.test.ts`: W5 clear → `results`, `heldOut`, `run.held_out` after `wave.ended`, bonus paid; no build after; a wipe gives `heldOut` false.
- `netEvents.test.ts`: kind 25 round trip.
- `botShop.test.ts`: order, saving up, owned skip, building counts, slot choice, candidates.
- `RunRoom.3-10.test.ts` (bootTestServer, `balance` override with tiny waves): a run to W5 → `results`, `resultHeldOut`, earned > 0 over the wire; `run_ended` logged.
- `onlineFlow.test.ts` / Results model: title and earned.
- `fiveWaveSim.test.ts`: the sweep (AC 7, 8).

### Project Structure Notes

- New: `packages/shared/src/bots/botShop.ts` (+ test), `packages/shared/src/economy/fiveWaveSim.test.ts`, `apps/server/src/rooms/RunRoom.3-10.test.ts`, `apps/server/src/run/economyBandwidth.test.ts`.
- Changed: balance (`waves.json`, `bots.json`, maybe `economy.json`/prices), `balanceSchema.ts`, `balance.ts`, `waveDirector.ts`, `runStateMachine.ts`, `simEvents.ts`, `netEvents.ts`, `worldSnapshot.ts`, server schema/sync/room, client Results/flow/GameScene, `tools/bots`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md › Story 3.10; FR28–FR31]
- [Source: _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md › Enemy Wave Design, Economy and Resources, Enemy table]
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-11-22.md › §7 risks R3, R5; §10 brief]
- [Source: 3-2 (money bandwidth open item), 3-3 (shop sim table), 3-6 (turret kill pay), 3-8, 3-9 (dev wave mix), 3-1 (`buildTicksLeft` line)]

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), story writer and builder in worktree `story-3-10`.

### Debug Log References

- Sims: `npx tsx tools/sims/fiveWave.ts --players 2,3,4 --seeds 1-6 [--list …] [--set file.path=value]` (outputs kept under `/tmp/s310/m-*.txt`, not committed).
- Real bot runs: `tools/bots/run.ts --url http://localhost:6167 --count 4` against `PORT=6167 node --import tsx src/index.ts` (server log `/tmp/s310/server-bots.log`), and `--scenario net150 --hold-fire 25` with `ALLOW_TEST_SCENARIOS=1` (`/tmp/s310/server-net150.log`).
- Browser: `/tmp/s310-tools/check.py`, `check2.py` (Playwright, Chromium headless, temporary Vite config on :8673, deleted after).

### Completion Notes List

- **Built:** `waves.json` gains `runWaves: 5`, `playerCountScale: [0.4, 0.6, 0.8, 1.0]` and `mix` (per-wave integer weights, decision 2) with schema + cross-file check; `waveSize` scales by players at the wave start; `waveTypeCounts` / `waveMixOf` give exact counts; `WaveState.typeTarget/typeSpawned` (preallocated `Uint16Array`s) and `waveZombieType` spread the types evenly (no RNG draw, no allocation per tick; `snapshotWorld` copies both arrays); the dev wave mix stays as an override. `endWave` after wave `runWaves`: `wave.ended` → `run.held_out` → `endRun` (`world.run.heldOut`); net kind 25. Server: `RunState.resultHeldOut`, `endRun(…, heldOut)`, `run_ended` logs `heldOut` + kills + earned. Client: `ResultRow.earned`, `UiScreen.results.heldOut`, `resultsTitle`, "You held out!" + "Wave reached N" + Earned column; solo shows it on `run.held_out` (earned read from the World after the step, so the last bonus is in). Bots: shared `bots/botShop.ts` (`botShopNext`, `botWeaponSlot`, `botPlaceCandidate`, `botBuildPhase`), `bots/headlessRun.ts` (`runHeadless`, `formatRunLine`), `tools/bots` shops/builds over the wire and prints `bots_economy`; `tools/sims/fiveWave.ts` sweep. `bots.json`: `shoppingList: [smg, wood_barricade, wood_barricade, auto_turret]`, `buildRadiiM: [2.5, 4]`.
- **Balance decisions (AC 7, brief line 13; revive untouched at 3 s / full damage).** Changed: only the deliverable keys (`waves.json` curve/mix/scale/runWaves, `bots.json` list). **No price, heal, bonus or reward change**, for these reasons (seeded sims on the merged tip, 6 seeds per team size):

  | Bots | Shopping | Held out | Cleared by wave (W1/W2/W3/W4/W5) | Earned / player, mean (min–max) | Weapons | Downs |
  |---|---|---|---|---|---|---|
  | 2 | none (Pistol only) | 1/6 | 6/6/6/4/1 | 479 (282–724) | – | wipes in W3–W5 |
  | 3 | none | 4/6 | 6/6/6/5/4 | 548 (274–692) | – | |
  | 4 | none | 2/6 | 6/6/6/6/2 | 504 (436–602) | – | |
  | 2 | `bots.json` list | **6/6** | 6/6/6/6/6 | **625** (599–668) | SMG at W3 build (all) | 0 |
  | 3 | list | **6/6** | 6/6/6/6/6 | **553** (482–644) | SMG at W3–W4 build | 0 |
  | 4 | list | **6/6** | 6/6/6/6/6 | **529** (485–577) | SMG at W3–W4 build | 0 |

  - Survival: the retro risk ("all Pistol runs wipe in W2") is gone with the player-count scale; Pistol-only teams now reach W3–W5 and hold out in 7/18 runs, while every team that buys the SMG holds out (18/18, no downs). So the shop is what decides the run (pillar 2) and no lever needs moving to make 5 waves survivable. Each bot also places 2 barricades; turrets come only in 2 runs (W5 build, 31 and 57 turret kills): the 250 price is out of reach before W5 with the SMG first. Nobody buys the Hunting Rifle (not on the list).
  - Earnings vs the GDD (5-wave share ≈ 650–790 earned per player, Dev Notes): 2 players 625 (just under), 3 players 553, 4 players 529 (−19 %). Team money splits kill/assist/revive/wave as e.g. 1430/87/0/600 at 4 players: kill money is fixed by the composition (every zombie dies), the gap is **assists** (bots: ~6 % of kill money; the GDD's breakdown assumes ~50 %: 750 assists vs 1,500 kills). The levers that would close it are GDD numbers (FR45 bonus 10 × N, the enemy-table rewards), so they stay and the designer decides. Measured options: Walker reward 2 → 3 gives 704/626/604 (2/3/4 bots); wave bonus 10 → 15 × N gives 683/609/596 (3 seeds each); neither changes survival.
  - Flag for the designer: bots with SMGs never go down in 5 waves (perfect 360° awareness, aim assist, kiting); real players will find it harder. Difficulty grows in Epics 4–6 (decay, Spitters, Brutes).
- **Real 4-bot run (local server, `tools/bots`, normal run, bots shop and build): held out, wave 5.**
  - Earned: Bot 1 525, Bot 2 538, Bot 3 512, Bot 4 549 (kills 147/157/137/159; SMG at W3–W4 build; 2 barricades each; wallets 332–369). `run_ended {wave: 5, heldOut: true}` logged.
  - Per client download (avg / busiest second), by wave: W1 3.1 / 5.9 KB/s, W2 4.6 / 8.9, W3 4.8 / 8.9, W4 5.1 / 10.3, W5 5.7 / 10.9 (horde 1.9–3.8 KB/s of it). Upload ~1.9 KB/s. Peak alive 40/65/82/87/91 (the bots thin it fast). Tick avg 0.86–1.21 ms, max 10–32 ms, 0 slow ticks; patch avg ≤ 0.35 ms.
  - Worst case (`--scenario net150 --hold-fire 25`, god mode, W4 160 + W5 200 mixed, **150 alive reached**): per client avg 6.8–9.2 KB/s, busiest second 19.9 KB/s (horde avg 5.1–7.5, the rest ≈ 1.7 KB/s) → inside the 30 KB/s budget (horde ≤ 24 + rest ≤ 6). Tick avg 1.0 ms, max 51–62 ms (1 slow tick per wave; load average ~5 from other agents on this 2-core box). Earned there 316–366 (two waves only).
- **Bandwidth measured with the tickCost approach (`run/economyBandwidth.test.ts`, 3.2's and 3.1's open items):** wave 3 with 4 bots fighting: `wallet`/`earned` patches **48 B/s**, `money.earned` events **20 B/s** per client (162 events in 40 s; patches + events total 1.13 KB/s, horde not included). Build phase: `buildTicksLeft` **60 B/s** per client. Story 3.10's own additions: `resultHeldOut` once per run, `run.held_out` ≈ 3 B once; the composition adds nothing (the type nibble already exists).
- **Browser checks (solo, `?solo=1&zdmg=0.02`, headless Chromium 1280 × 720, ~14–17 fps), screenshots in `/tmp/s310/`:** build phase (`solo-1-build.png`); W1 16 Walkers (× 0.4) played and cleared by aiming at the nearest zombie with the mouse (`solo-2`, `solo-3`); **W2 32 = 26 Walkers + 6 Runners**, a Runner on screen (`solo-4-wave2-runners.png`, `solo-4b`), W2 cleared for real (earned 132, `solo-5`); W3 started with Crawlers + Runners; then the dev cheat panel's **Skip wave** to W5 → **"You held out!" / Wave reached 5 / You 48 kills $252** (`solo-6-you-held-out.png`); Restart → a fresh build phase with $100 (`solo-7-restart.png`). No console errors.
- **Proved the new tests can fail (brief line 15, done here too):** the spread test fails with the "furthest behind" comparison removed; the run-end tests (2) fail with `>` instead of `>=`; 5 wave tests fail without the player scale; the "saves up" bot test fails with `continue` instead of `return -1`; the five-wave sim fails without `startBuild` (runs never start) and without `botBuildPhase` (no purchases).
- **Epic 3 brief, lines asked for:**
  - **2** — `git status` clean; `npm run typecheck && npm run lint && npm test && npm run build` pass on `story-3-10` merged with `claude/epic-2-continue` (4a5dcd7): 148 files, 1,097 passed, 3 skipped.
  - **3** — new state through every copy: `world.run.heldOut` (World) → `RunState.resultHeldOut` (schema, set by the room's `endRun` like `resultWave`; `syncState.resetRunFields` clears it) → `RunStateView.resultHeldOut` + `RUN_STATE_FIELDS` (so the `?lag` devThrottle copies it; compile-time key check) → `NetSimHost` mirror (`world.run.heldOut`) → no Predictor impact (not movement/weapon) → `snapshotWorld` (`run` spread). `WaveState.typeTarget/typeSpawned`: World only (server/solo), copied in `snapshotWorld`; never synced (clients don't need them). New event `run.held_out` → net kind 25 (encode/decode, global in the 3.6 event-interest filter). `FakeRoom` state gains the field.
  - **11** — see bandwidth lines above (money 68 B/s, build timer 60 B/s, real-run KB/s, 150-alive worst case 19.9 KB/s peak).
  - **12** — every number in balance JSON: wave curve/mix/scale/run length in `waves.json`, shopping list and build radii in `bots.json`; the 8 candidate directions are a bot search pattern (constant in `botShop.ts`), not gameplay.
  - **13** — revive untouched; the sim table above is the evidence; no economy lever changed (reasons and measured options above).
  - **14** — one mechanic per test (`systems: { zombies: () => {} }` where kills are by hand), seeded, `bootTestServer()` in `RunRoom.3-10.test.ts`.
  - **15** — mutations above.
  - **20** — Notes for the merge below.
- **Not verified:** the online "You held out!" in a browser (covered by `RunRoom.3-10.test.ts` over the wire and `onlineFlow.test.ts`; the screen component is the same as solo); real phones; feel of Runners/Crawlers in a full 4-player browser run; whether human teams match the bots' assist share (the earnings gap depends on it).

### Notes for the merge (shared files touched; brief line 20)

- `waves.json` / `balanceSchema.ts` (`wavesSchema` gains `runWaves`, `playerCountScale`, `mix`; `botsSchema` gains `buildRadiiM`, `shoppingList` max 31) / `balance.ts` (mix types cross-check) / `bots.json`: the balance version changes (clients and server must match).
- `run/runStateMachine.ts`: `RunState.heldOut`; `endWave` may now go to Results. Any story that adds a transition after `endWave` must keep the `runWaves` check (Epic 6 sets 10).
- `waves/waveDirector.ts`: `waveZombieType` returns a type **index**; `spawnWaveZombie` counts `typeSpawned`. Stories adding zombie types (Epic 5) only add weights to `mix`.
- `core/simEvents.ts` + `net/netEvents.ts`: `run.held_out`, kind **25** (next free: 26).
- Server `RunRoom.ts` (`onTick` handles `run.held_out`; `endRun(controller, wave, heldOut)`), `schema/RunState.ts` (`resultHeldOut`), `syncState.ts` (reset). Client `onlineFlow.ts`, `ResultsScreen.tsx`, `uiState.ts` (`ResultRow.earned`, `results.heldOut`), `GameScene.ts` (`showSoloResults(host, wave, heldOut)`), `NetSimHost.ts` (mirror), `fakeRoom.ts`.
- Tests whose expectations moved with the scale: `runStateMachine.test.ts` (2 players: W1 24), `slow.test.ts` (solo W1 16), `economy.test.ts` (2 players pinned at × 1.0 by override), `waveDirector.test.ts` (old one-player tests pin the scale at 1.0; new block uses the real one).
- Merged `claude/epic-2-continue` at 4a5dcd7 (3.5/3.6/3.8 review fixes): no conflicts. The sim table and bot numbers above are from the merged tip (3.5's clearance-aware field made Pistol-only teams a little weaker than before the merge; shopping teams unchanged at 18/18).

### File List

- New: `packages/shared/src/bots/botShop.ts`, `packages/shared/src/bots/botShop.test.ts`, `packages/shared/src/bots/headlessRun.ts`, `packages/shared/src/economy/fiveWaveSim.test.ts`, `apps/server/src/rooms/RunRoom.3-10.test.ts`, `apps/server/src/run/economyBandwidth.test.ts`, `tools/sims/fiveWave.ts`, this file.
- Modified (shared): `config/balance/waves.json`, `config/balance/bots.json`, `config/balanceSchema.ts`, `config/balance.ts`, `waves/waveDirector.ts`, `waves/waveMix.ts`, `run/runStateMachine.ts`, `core/simEvents.ts`, `core/world.ts`, `core/worldSnapshot.ts`, `net/netEvents.ts`, `net/stateView.ts`, `net/testScenarios.ts`, `bots/botPolicy.ts`, `economy/shop.ts`, `index.ts`; tests `waves/waveDirector.test.ts`, `run/runStateMachine.test.ts`, `net/netEvents.test.ts`, `economy/economy.test.ts`, `player/slow.test.ts`.
- Modified (server): `rooms/RunRoom.ts`, `rooms/schema/RunState.ts`, `rooms/schema/syncState.ts`, `run/RunController.ts` (comment).
- Modified (client): `net/onlineFlow.ts`, `net/fakeRoom.ts`, `sim/NetSimHost.ts`, `ui/ResultsScreen.tsx`, `ui/uiState.ts`, `ui/overlay.css`, `scenes/GameScene.ts`, `debug/urlOptions.ts` (comment); tests `net/onlineFlow.test.ts`, `net/lobbyStore.test.ts`, `ui/uiState.test.ts`, `sim/NetSimHost.downed.test.ts`.
- Modified (tools): `tools/bots/botClient.ts`, `tools/bots/run.ts`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Change Log

- 2026-11-22: Story created (gds-create-story, from the real code).
- 2026-11-22: Built: 5-wave curve with per-wave mix and player-count scale, run end with "You held out!" Results (kills + earned), bots shop and build (headless and `tools/bots`), five-wave sim, economy bandwidth test, room test; balance pass (no economy lever changed, evidence in Completion Notes); real 4-bot runs; browser checks; merged `claude/epic-2-continue`. Status → review.
