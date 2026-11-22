# Story 3.10: Five-wave run with player-count scaling

Status: ready-for-dev

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

- [ ] **Task 1: Balance schema + JSON** (AC 1, 2, 7): `wavesSchema` gains `runWaves` (int ≥ 1), `playerCountScale` (4 numbers in (0, 1]), `mix` (array ≥ 1 of `record<balanceId, int ≥ 0>`, each with a positive total). `loadBalance` checks every mix type is a zombie type with balance. `waves.json` gets the values of decisions 1–3.
- [ ] **Task 2: Wave director** (AC 1–3): `waveSize(balance, n, players)` scales; `WaveState` gains preallocated `typeTarget` / `typeSpawned` (`Uint16Array(ZOMBIE_TYPES.length)`), filled in `beginWave`; `waveZombieType` picks the type furthest behind its share (dev mix overrides). No allocation per tick. `snapshotWorld` copies the two arrays.
- [ ] **Task 3: Run end** (AC 4): `RunState.heldOut`; `endWave` ends the run after wave `runWaves` (`run.held_out { wave }` after `wave.ended`, then `endRun`), else `startBuild`. Sim event + net kind 25 `[25, wave]` (encode/decode).
- [ ] **Task 4: Server** (AC 4, 5): `RunRoom.onTick` handles `run.held_out` → `endRun(controller, wave, true)`; schema `RunState.resultHeldOut: boolean` (+ `stateView`, `RUN_STATE_FIELDS`, `resetRunFields`, fake room, devThrottle via the key list); `run_ended` logs `heldOut`, `kills`, `earned`.
- [ ] **Task 5: Client Results** (AC 4): `ResultRow.earned`, `UiScreen.results.heldOut`; `resultsFromState` reads `resultHeldOut` and `earned`; `ResultsScreen` title and Earned column; solo `GameScene` shows Results on `run.held_out` (and the wipe) with earned.
- [ ] **Task 6: Bot shop policy** (AC 6): shared `bots/botShop.ts`: `botShopNext` (pure: next list entry to buy, or none), `botWeaponSlot`, `botPlaceCandidate` (fixed candidate spots around the bot), and `botBuildPhase(world, id, list)` for headless runs (real `buyWeapon` / `placeBuilding`). `tools/bots` does the same over the wire (`shop.buy`, `building.place`, one try per step, refusals move on), swaps to a new weapon, and its summary prints per-player kills, earned, wallet, purchases and buildings. `bots.json › shoppingList` set from the sims.
- [ ] **Task 7: Five-wave sim** (AC 5, 7, 8): `economy/fiveWaveSim.test.ts` (2/3/4 bots × seeds, real balance, real systems, bots Ready at once after shopping) with the anti-silent-pass assertions; the old 3.2/3.3 sims keep running (updated for the run end).
- [ ] **Task 8: Measurements** (AC 9): `run/economyBandwidth.test.ts` (money patches + events in a 4-player wave; `buildTicksLeft` in a build); a real 4-bot run with `tools/bots` (numbers in Completion Notes).
- [ ] **Task 9: Tests and checks** (AC 10): see Testing; browser check solo through W2 (Runners) with `?zdmg=`, the "You held out!" screen (dev skip), screenshots under `/tmp/s310/`.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-22: Story created (gds-create-story, from the real code).
