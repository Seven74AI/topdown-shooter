---
baseline_commit: 09b5f6d2
---

# Story 10.7: Run stats

Status: review

(Written 2026-11-27 with `gds-create-story` from the real code at `09b5f6d2`. **Awaiting designer Q-codes 10.7-Q1…Q4.** None of them is a look, and none blocks the server work: T1–T4 can start at once, and only the stats script's output (T5) waits on Q1–Q3. **Migration order:** **10.6 lands first** (`0008_*`). This story **regenerates its migration on top of master** (it becomes `0009_*`; never rename one: Drizzle skips an older journal `when`, AGENTS §2). If 10.7 happens to be ready first, it takes `0008` and 10.6 regenerates instead. The main session decides at merge time.)

## Story

As the designer,
I want simple stats about our runs,
so that I can check the success metrics.

## Decision log

| # | Decision | Status |
| --- | --- | --- |
| 10.7-Q1 | **What "loadout" means** (for "share of runs per loadout", flagging any above 50 %). Every run starts with the Pistol alone (`combat/loadout.ts › STARTING_WEAPON`), so the start tells nothing. **A** The **two weapons held at the run's end**, sorted, levels ignored (e.g. `pistol+smg`, `shotgun+fire_axe`; one slot empty = `pistol+—`). **B** The player's **most-used weapon** (the one with the most own kills). **C** **Every weapon bought** during the run (a set; a run counts once for each). **Recommendation: A.** It is cheap, exact, and shows what people settle on. B needs per-weapon kill counts per seat the server doesn't keep today. | **C** every weapon bought, share of runs per weapon (designer 2026-11-27, after "All counts" was clarified) |
| 10.7-Q2 | **Saved runs abandoned unresumed** (written at expiry, marked `abandoned`) in the printed numbers. **A** Counted in "runs per week" as their own column ("12 runs · 2 abandoned"), and **left out** of the first-3-runs, runs-to-first-extraction and loadout numbers. **B** Counted everywhere like a lost run. **C** Left out everywhere (stored, never printed). **Recommendation: A.** | **A** own column in runs/week, left out of the other 3 stats (designer 2026-11-27) |
| 10.7-Q3 | **Where `npm run stats` puts its output.** It runs on the VPS (the database is there), so Hermes runs it for you. **A** Plain text tables in the terminal, which Hermes pastes into its report. **B** A, plus `--md` writes `docs/stats/stats-YYYY-MM-DD.md` on the VPS for Hermes to send. **C** A, plus `--json` for a later dashboard. **Recommendation: A** (B and C are one flag each, later). | **A** terminal text (designer 2026-11-27) |
| 10.7-Q4 | **Kills per player.** The AC's table lists no kills column, and X8 says fly-out kills are not counted. **A** No kills column (as the AC; X8 holds because there's nothing to count, and a test still shows the recorded numbers don't move during `extract`). **B** Add `kills` to `run_result_players` (own kills, the 7.11 milestone counter, frozen at `extract` start) for a future "kills per run" line. **Recommendation: A** (YAGNI; a later migration can add it). | **B** kills per player, frozen at `extract` start (designer 2026-11-27) |
| 10.7-B1 | **The row is created at run start and finished at run end.** `run_results.id` = the run's id (`RunBank.runId`, already kept across resumes by E8-S3). `RunRoom.startRun` inserts the row (`started_at = now()`, `ended_at` null, `nights_played = 1`). A successful resume claim adds 1 to `nights_played`. `RunRoom.endRun` **finishes** it (`UPDATE … WHERE id = $1 AND ended_at IS NULL`) and inserts the player rows in the same transaction. This is the simplest way to know `started` = the first night and to count nights without changing the save format (`RunSave` stays at its `SAVE_SCHEMA_VERSION`; no shape-hash bump). The stats script reads **only finished rows** (`ended_at IS NOT NULL`), so "a row is written when it ends" holds for everything the designer sees. | auto (technical) |
| 10.7-B2 | **Which endings write what.** `endRun` with `keepSave = false` finishes the row: `extracted` = `run.ending === "extracted"`, `ending` = `wiped` / `extracted` / `lost` (all-left mid-wave, or a team that quit), `wave_reached` = `state.resultWave` (endless included: wave 13 = 3 endless waves), `endless` = `run.endless`. `endRun` with `keepSave = true` (everyone left in a calm phase → saved, `RunRoom.ts:1243-1252`) and a shutdown save (`room_closed_saved`) **don't** finish it: the run continues another night. A resumed run that ends finishes the same row. | auto (technical) |
| 10.7-B3 | **Expiry → `abandoned` (needs a job: there is none today).** Saved runs expire after 7 days (`SAVE_KEEP_MS`) and are only deleted lazily by `pruneAccount` at the next save of a linked account. This story adds a step to the **housekeeping job** (`ops/housekeeping.ts`, created by 10.6's B5, or by this story if it lands first: same contract). The step finishes every open `run_results` row whose saved run is `status = 'saved'` and `expires_at < now()`: `ending = 'abandoned'`, `ended_at = expires_at`, `extracted = false`, and player rows from the save's `seats` (the snapshot's `SavedSeat`: account id, slot, `player.wavesIn`, the loadout). Then it deletes that saved run (the same delete `pruneAccount` does). It also finishes as `abandoned` every open row older than **8 days** with **no** saved-run row at all (a crash mid-wave before any autosave, or a lost row); those have no player rows. The step runs at boot + every 24 h, so an expired run is written at most ~24 h after its expiry. The AC's "at expiry" is read as "by the next daily job". | auto (technical) |
| 10.7-B4 | **Race-safe finish.** Both writers (room end, expiry step) use `UPDATE run_results … WHERE id = $1 AND ended_at IS NULL RETURNING id`, then insert the player rows only if a row came back, in **one** `boundedTransaction`. Exactly one wins. A resumed room can't be playing an expired save (`claim` refuses `expires_at <= now()`), and the step only takes saves still `'saved'`, so the room's finish and the step can't both be legitimate. The test still races them. | auto (technical) |
| 10.7-B5 | **Account ids and deletion.** `run_result_players.account_id` references `accounts(id)` **`ON DELETE SET NULL`**: 10.1's `deleteAccount` transaction nulls them in the same statement that deletes the account (and its merged guests), with no code change there. The run numbers stay. Inserting player rows takes `FOR KEY SHARE` on the named account rows first, and an id whose account is gone is written as null. A finish never fails on a foreign key (23503). Add the table to the LOCK ORDER comment in `accountsRepo.ts` (it takes lock 2 only, after the `run_results` row). A seat with no account (no DB at join, a dev guest) is stored with a null account id. | auto (technical) |
| 10.7-B6 | **Merged guests count as their account.** A guest who later logs in has its rows under the guest id (`accounts.merged_into` points at the account). The stats script maps each id through `coalesce(merged_into, id)` before grouping ("a group = the set of accounts in a run", "runs to first extraction per account"). A null (deleted) id is its own anonymous member: such a run's group is unique and never matched to another. | auto (technical) |
| 10.7-B7 | **What is not recorded.** Practice runs (client-only solo, `LocalSimHost`: the server never sees them, 7.2 "Practice runs don't earn rewards"), and rooms with no database (`roomProgressRepo` null). Runs on a dev server with `DEV_*` switches **are** recorded (the stats are read on the VPS, which runs none). 10.12's admin-cheated online runs: when 10.12 lands, it adds a `cheated` flag here and the script leaves those rows out (noted for 10.12, not built here). | auto (technical) |
| 10.7-B8 | **Never in the tick.** Like the bank (7.1 AC 9), every write is fire-and-forget from the room: one retry after `BANK_RETRY_MS`, then `run_result_failed { runId, why }` (no names). A failed start insert just means the end does an upsert (`INSERT … ON CONFLICT (id) DO UPDATE … WHERE run_results.ended_at IS NULL`), so B1 never loses a run because the start write failed. `started_at` is then the end time minus the duration the room knows. | auto (technical) |

## Acceptance Criteria

1. **Migration (only these two tables).** One Drizzle migration (generated, never hand-edited) creates `run_results`: `id` uuid PK (= run id), `district` text, `seed` bigint, `player_count` int, `wave_reached` int, `extracted` boolean, `ending` text check in (`wiped`, `extracted`, `lost`, `abandoned`), `endless` boolean, `started_at` timestamptz, `ended_at` timestamptz null, `nights_played` int default 1. It also creates `run_result_players`: `run_id` uuid → `run_results(id)` on delete cascade, `account_id` uuid null → `accounts(id)` **on delete set null** (B5), `slot` int, `loadout` text, `waves_in` int, PK (`run_id`, `slot`). Indexes on `run_results(ended_at)` and `run_result_players(account_id)`. The epic's "abandoned" marking is `ending = 'abandoned'`. `migrationJournal.test.ts` is green; **it regenerates on top of 10.6's migration** (see the header).
2. **One row per run, one per player (FR88).** When an online run ends (wipe, extract, lost), one `run_results` row is finished and one `run_result_players` row is written for each seat that was in the run: members in the World, held seats, remembered seats (8.1 F8), and seats that left mid-run with a consented Leave. It is the same set `bankRunEnd` and `bank` paid, in `RunBank` (`meta/banking.ts:288-305`). A seat that rejoined and left again (8.2 top-up) is **one** row with its final numbers. Late joiners still **waiting** at the end (played nothing, `nothingFor`) get **no** row. `player_count` = the number of player rows. `waves_in` = `PlayerState.wavesIn` (+ `endlessWavesIn` if endless). `slot` = the seat's slot. `loadout` per Q1.
3. **Solo online runs are recorded** with player count 1. **Practice runs** (offline, B7) are not, by construction: a test asserts the client's practice path makes no request to the server that could write one.
4. **Several nights (B1, B2).** A run saved and resumed writes **one** row when it finally ends: `started_at` = the first night's start, `nights_played` = 1 + the number of successful resumes. A test plays night 1 → Save and quit → resume → Save and quit → resume → extract, and finds one row with `nights_played = 3`, and `started_at` before the first save.
5. **Expiry (B3).** A saved run that expires unresumed is written by the housekeeping step as `ending = 'abandoned'`, `ended_at = expires_at`, with player rows from its saved seats, and the saved run is deleted. A test backdates `expires_at`, runs the step, and checks the row and seats. A save that hasn't expired is untouched, and so is a run open in a room.
6. **Account deletion (10.1; B5).** When an account is deleted, its `run_result_players` rows keep `slot`, `loadout` and `waves_in`, and their `account_id` becomes null **in the same transaction**. Merged guests' rows too. The `run_results` row is unchanged.
7. **Fly-out kills are not counted (X8).** Kills during the `extract` phase (12.2's fly-out horde) are not counted in the run's stats. No kills can happen there (12.2 D-12.2-3: no combat system runs), and the table has no kills column (Q4 A). A test drives a run into `extract` and to its end, and asserts that every recorded per-player number (`waves_in`, loadout, and kills if Q4 is B) equals the value at the tick `extract` began.
8. **`npm run stats` (Q1–Q3).** `npm run stats -w @topdown/server -- [--since 2026-11-01]` reads finished rows only and prints:
   - **runs per week** (ISO week of `ended_at`, Monday-based, the server's time zone; abandoned per Q2);
   - **wave reached in each group's first 3 runs** (group = the sorted set of accounts in a run, after B6; one line per group with ≥ 1 run: the group size and its 3 first waves, e.g. `4 players · 6, 8, 10✓`, where ✓ = extracted; names are never printed, only the group size and a short hash of the set);
   - **runs to first extraction per account** (the count of that account's finished runs up to and including its first extracted one; "not yet (n runs)" otherwise; printed as a distribution: `1 run: 3 accounts · 2 runs: 1 · not yet: 2`);
   - **share of runs per loadout** (Q1; each loadout's share of player rows, sorted, with `⚠ over half` next to any above 50 %).
   It exits 0 on an empty database with "No finished runs yet". `docs/deploy.md` › Database gets the VPS command (the compose form of 10.11's `admin`).
9. **Nothing in play changes.** No room messages, netEvents kinds, client code, balance numbers or tick work (B8). The `run_ended` log line is unchanged.

## Tasks / Subtasks

- [x] **T1 DB (AC 1, 6; B5)**: `schema.ts` `runResults`, `runResultPlayers`. Migration (regenerate on top of master after 10.6 merges). New `apps/server/src/db/runResultsRepo.ts`: `start(run)`, `resumed(runId)`, `finish(runId, result, players)` (B4/B5 transaction, upsert per B8), `expireAbandoned(now, batch)` (B3; reads `saved_runs` through its own query in this repo: only repos touch tables, `noDbImports.test.ts`), `statsRows(since)`. LOCK ORDER comment in `accountsRepo.ts`.
- [x] **T2 Room hooks (AC 2–4; B1, B2, B8)** in `apps/server/src/rooms/RunRoom.ts`:
  - [x] `startRun` right after `this.bank = new RunBank(…)` (:1865): `start()` for a fresh run; for a resume, `resumed(runId)` only after the claim succeeded (`claim` at :2271 → `"claimed"`).
  - [x] Collect the per-seat rows at each seat's **bank** (consented Leave → `bank`, end → `bankRunEnd`): a small `RunResultSeats` map keyed by **seat id** (8.3 H1: a reused player id is a new seat), overwritten on a top-up bank (8.2 `reopen`). Build it from the same `PlayerState` copy the bank takes, never from a later state.
  - [x] `endRun` (:2015): when `keepSave` is false, `finish()` fire-and-forget (B8). Do nothing when `keepSave` is true.
  - [x] A pure helper `apps/server/src/meta/runResult.ts` (`loadoutKey(loadout)`, `resultRow(world, ending)`, `seatRow(player, slot, accountId)`) so the numbers are unit-tested without a room.
- [x] **T3 Expiry step (AC 5; B3)**: add `expireAbandonedRuns` to `ops/housekeeping.ts` (create the file per 10.6-B5 if 10.6 hasn't merged). Seats come from the snapshot through `migrateRunSave` (`packages/shared/src/save/migrations.ts`), so an older save still reads. An unreadable snapshot → a row with no player rows and a `run_result_unreadable_save` warn. If you touch `savedRunsRepo.ts`, also do deferred-work **D8** (remove the dead `releaseOpenOnBoot` parameter).
- [x] **T4 X8 test (AC 7)**: in `apps/server/src/run/` (a RunController-level test is enough: `playToBuild`-style helpers, `systems` as needed).
- [x] **T5 Stats script (AC 8; Q1–Q3)**: `apps/server/src/db/statsCommand.ts` (pure: rows in → text out, unit-tested with fixture rows) + `statsCli.ts`, the `"stats"` script in `apps/server/package.json`, `docs/deploy.md`.
- [x] **T6 Tests**: see the test plan.
- [x] **T7 Hand-back**: `gate:fast` + `test:changed` (RunRoom tests are in the slow areas: `test:slow` for `apps/server/src/rooms`). Branch `story-10-7`, PR "Story 10.7: Run stats".

## Dev Notes

### What exists today (read before changing)

- **Run start:** `RunRoom.startRun` creates `this.bank = new RunBank(this.runSeed, { …, district, ...(resume ? { runId, resumed: true } : {}) })` (:1865) and broadcasts `RUN_STARTED { runId }` (:1878). The run id is a fresh `randomUUID()` (`banking.ts:213`) or the save's id.
- **Run end:** `endRun(controller, wave, keepSave = false, dropWhy)` (:2015-2038) logs `run_ended`, calls `bankRunEnd(world, bankMembers(), bankRemembered())` (fire-and-forget), and drops the save unless `keepSave`. It is called on `team.wiped` and `run.extract_done` (:1986-1987), when only waiting joiners are left (:1243-1252, `keepSave` in a calm phase), and when everyone left (:1253-1265 → `saveAllLeft` or `dropSave("lost")`: read that branch; it calls `bankNow` without `endRun` in one case, so hook the finish where the run is really over, not only in `endRun`).
- **Per-seat numbers:** `PlayerState.wavesIn` / `endlessWavesIn` (`meta/runRecord.ts:22-25`), `waveMask`, `kills` (7.11 counters), `loadout.slots` (`combat/loadout.ts`). `BankSeat` (`banking.ts:33-54`) is the bank's copy. Consented Leave → `bank()` (seat state taken before it leaves the World).
- **Resume:** `claim(id, accountId, code)` (:2271, `savedRunsRepo.claim`: one wins, S3). 8.6's restore and `bankSavedRun` (`meta/saveBank.ts`).
- **Saved-run expiry:** `SAVE_KEEP_MS` 7 days (`savedRunsRepo.ts:19`); `pruneAccount` deletes expired saves lazily (:208-210); `releaseSavesOnBoot` (`run/roomSaves.ts:106-123`) re-opens crashed saves at boot. **No timed job exists** (B3).
- **Extract (12.2):** phase `"extract"`; no combat, buildings, hazards, decay or loot system runs (D-12.2-3); joins are refused (D-12.2-6); a Leave during `extract` banks `extracted` (D-12.2-7, `RunRoom.ts:1084-1085`), so its player row is written with the run's final ending.
- **Practice:** client-only (`LocalSimHost`); no server room.
- **10.1 delete:** `accountsRepo.deleteAccount` (:134-198) + `realPostgresDelete.test.ts`. LOCK ORDER at the top of `accountsRepo.ts`.

### Code rules (AGENTS §5)

No per-tick allocation and no DB call from the tick (B8). The seat map is filled at bank time, not per tick. No gameplay numbers inline (8 days in B3 = `SAVE_KEEP_MS` + 1 day, derived, not a new constant). Tests of one mechanic pass `systems: { waves: () => {} }`. Every sim test asserts something happened (a run really reached `extract`; a row really exists). Colyseus: `bootTestServer()`. Exact version pins.

### Testing standards

PGlite repo tests. Real-PostgreSQL tests skip without `TEST_DATABASE_URL` (CI `postgres` job, `--no-file-parallelism`). No test over 30 s (split the multi-night room test per night if needed). Whole-run sims: expect the end of the run to matter (6.1 lesson).

### Project Structure Notes

- New: `apps/server/drizzle/0009_*.sql` (+ snapshot, journal; number per the header), `apps/server/src/db/runResultsRepo.ts`, `apps/server/src/db/statsCommand.ts`, `apps/server/src/db/statsCli.ts`, `apps/server/src/meta/runResult.ts`, tests (`runResults.test.ts`, `realPostgresRunResults.test.ts`, `runResult.test.ts`, `statsCommand.test.ts`, an X8 test).
- Changed: `apps/server/src/db/schema.ts`, `accountsRepo.ts` (comment only), `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/ops/housekeeping.ts` (or new, see B3), `apps/server/src/index.ts` (only if housekeeping is new here), `apps/server/package.json`, `docs/deploy.md`, `realPostgresDelete.test.ts` (+ case).

## Notes for the merge (files this story touches)

- **Overlap with 10.6 (server):** `schema.ts`, `drizzle/**` (**10.7 merges second and regenerates its migration on top**), `ops/housekeeping.ts` (10.6 creates it, 10.7 adds a step), `index.ts`, `apps/server/package.json` scripts, `realPostgresDelete.test.ts`, `accountsRepo.ts` LOCK ORDER comment, `docs/deploy.md`. All are keep-both. **They can be built in parallel.**
- **`RunRoom.ts`:** the big shared file. It overlaps **10.12 (admin cheats online)** (the same `startRun` / `endRun` area: 10.12 adds a cheated flag that this table should carry, B7), **8.x / 12.x follow-ups** if any are open, and **D3** (two-seat under-pay, the next `banking.ts` change). Don't run 10.7 and 10.12 in parallel.
- **`savedRunsRepo.ts`:** only if the builder chooses to put the expiry query there (T1 says `runResultsRepo`); if touched, fold in D8.
- **No client, shared, netEvents or readability-sheet changes.** Runs in parallel with 10.5 and with 10.6's client half.

## Test plan

| What | How | Where |
| --- | --- | --- |
| `loadoutKey`, `resultRow`, `seatRow` (endless waves, empty second slot, levels ignored) | unit | `meta/runResult.test.ts` |
| Repo: start → finish, finish without start (B8 upsert), double finish = one row, waiting joiner gets no row | PGlite | `db/runResults.test.ts` |
| Room: wipe / extract / lost-all-left each finish one row with the right ending; calm all-left (saved) finishes none; a Leave-then-rejoin seat = one row with final numbers; a reused player id = 2 rows (seat ids) | `bootTestServer()` + test rooms | `rooms/runResults.room.test.ts` |
| Multi-night: 3 nights → one row, `nights_played = 3`, `started_at` = night 1 | room test with saves (PGlite) | same file, split per night if > 30 s |
| X8: numbers at the end = numbers at `extract` start | RunController run into `extract` | `run/runResultX8.test.ts` |
| Expiry step: expired → abandoned + seats + save deleted; not expired / open untouched; 8-day orphan finished with no seats; old-version snapshot read through `migrateRunSave` | PGlite | `ops/housekeeping.test.ts` |
| **Finish vs expiry race (real PG):** an open row + an expired saved run; the room's `finish` and the step at once, ×20 rounds → exactly one wins (`ended_at` set once, player rows from one writer only, never both sets, no error) | real PostgreSQL | `realPostgresRunResults.test.ts` |
| **Resume count under a race (real PG):** 8 claims of one save at once (S3 pattern) + each winner calling `resumed` → `nights_played` +1 exactly | real PostgreSQL | same file |
| **Finish vs account delete race (real PG):** for 10 rounds, a 4-seat finish and `deleteAccount` of one seat's account at once → the finish commits (4 player rows; the deleted one's `account_id` null), the delete returns `deleted`, no 23503, no 503 | real PostgreSQL | `realPostgresDelete.test.ts` (+ case) |
| Delete nulls in the same transaction, merged guest included; run numbers kept | real PostgreSQL + PGlite | `realPostgresDelete.test.ts`, `accountDelete.test.ts` |
| Stats output on fixture rows: weeks, groups (merged guests mapped, deleted ids alone), first extraction, loadout > 50 % flagged, empty DB | unit on `statsCommand` | `db/statsCommand.test.ts` |

### References

- epics.md › Story 10.7 (:3681), X8 (`sprint-change-proposal-2026-11-26-epic-9-photoreal.md:252`), 12.2 AC 19 + D-12.2-3/6/7 (`12-2-extraction-walk-and-lift-off.md:65,114-122`).
- [Source: apps/server/src/rooms/RunRoom.ts#1084,1243-1265,1865-1878,1986-1987,2015-2038,2271], [Source: apps/server/src/meta/banking.ts#33-58,186-305,366], [Source: apps/server/src/db/savedRunsRepo.ts#19,208-210], [Source: apps/server/src/run/roomSaves.ts#100-123], [Source: apps/server/src/db/accountsRepo.ts#13-25,134-198], [Source: packages/shared/src/meta/runRecord.ts#20-26], [Source: packages/shared/src/combat/loadout.ts], [Source: packages/shared/src/save/runSave.ts#90-130], [Source: AGENTS.md §2, §5].

## Dev Agent Record

### Agent Model Used

Builder session (gds-dev-story), 2026-11-27.

### Debug Log References

- First gate:fast: 6 room test files red because every Start now wrote a `run_results` row through the test server's
  lazy in-memory PGlite (opened + migrated mid-run: CPU, timing asserts). Fix: `createGameServer({ recordRunStats })`
  (default true); `bootTestServer` passes `recordRunStats: options.database !== undefined` (only tests that pass their
  own database record). `RunRoom.account.test` forbids `.then(` in RunRoom: the finish chains through
  `recordRunResult(…, after)` instead. `carCorner.test` GOLDEN_DIGEST re-pinned (the snapshot holds the new empty
  `weaponsBought`; simulation unchanged).
- Real PostgreSQL 16 run locally (scratch cluster, `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/t107`):
  `realPostgres* --no-file-parallelism` 45/45, three runs of `realPostgresRunResults` green.

### Implementation Plan / decisions (B-codes)

- **I1 (Q1 = C needs a record that didn't exist):** `PlayerState.weaponsBought: string[]` (shared, server bookkeeping,
  not mirrored), pushed once per id in `buyCard` on a weapon card (never the start Pistol, a crate or a supply drop).
  The story said "no shared changes", written before Q1 was picked; C can't be done without it. PlayerState is saved
  whole, so the save shape changes: **`SAVE_SCHEMA_VERSION` 1 → 2**, step `1: (s) => s`, `SHAPES[2]`; a v1 seat gets
  `weaponsBought = []` in `restoreRunSave` AFTER the digest check (the v1 digest was taken without it). A rollback to
  an older server refuses v2 saves as `newer` (the documented 8.4 behaviour: released untouched).
- **I2 (deviation from AC 1's PK):** `run_result_players` PK is (`run_id`, `seat`) with a `seat` text column (the seat id
  `playerId#gen`), not (`run_id`, `slot`): 8.3's removed seat and the newcomer in its slot are two seats in one slot
  (the test plan's "reused player id = 2 rows"). `slot` is still stored. Plus `kills` int (Q4 = B).
- **I3:** `run_results.ending` is null while the row is open (check: null or the 4 values); `wave_reached`,
  `player_count`, `extracted`, `endless` default 0/false until the finish.
- **I4 (lock order):** both finishers take the seats' accounts FOR KEY SHARE (id order) FIRST, then the run row (new LOCK
  ORDER entry 5 in `accountsRepo.ts`), like `savedRunsRepo` put (2 → 4); the expiry step is 2 → 4 (it deletes the save
  while still expired `'saved'`) → 5. B5 put the run row first; this order matches the existing doc and can't cycle
  with `deleteAccount` (2 → 4 → its ON DELETE SET NULL on 5).
- **I5 (seat rows):** `RunBank` keeps a `resultRows` map by seat id, filled at each `bank()` from `BankSeat.result`
  (built by the room from the same PlayerState the bank reads: `bankLeaver`, `removeRemembered`) and in `bankRunEnd`
  for every seat not already banked (its banks may wait on the loot finder's). A `reopen`ed seat (8.2 top-up) is
  overwritten by its end bank. `nothingFor` (waiting joiners) adds none.
- **I6 (where the finish happens):** `endRun` with `keepSave = false` (wipe, extract_done, waiting-only with no save →
  `lost`) and `finalLeave`'s `bankNow` (everyone gone mid-wave, or the calm save failed → `lost`). Nothing on a saved
  end. Start / resumed at `startRun` (resumed only after a successful claim + Start). All fire and forget through
  `run/roomRunResults.ts` (one retry after `BANK_RETRY_MS`, then `run_result_failed {runId, op, why}`).
- **I7 (housekeeping):** built before 10.6 merged: `ops/housekeeping.ts` + `db/housekeepingCli.ts` created with 10.6's exact
  contract (steps list, `runHousekeeping`, `startHousekeeping` 5 min then 24 h, unref'd) holding only this story's
  `expireAbandonedRuns` step; keep-both at the merge. B3 said "at boot": the 10.6 contract's 5-min first run is kept.
- **I8 (orphans):** open rows older than `ORPHAN_RUN_MS` (= `SAVE_KEEP_MS` + 1 day, derived) with no `saved_runs` row
  are finished `abandoned`, `ended_at = now()`, no seats.
- **I9 (stats text):** a group line is `N players · group <sha256[:6]> · 6, 8, 10✓`; first extraction is the
  distribution line of AC 8; weapons: each weapon's share of played player rows plus a `(none)` line.
- **Known gaps (not built, for the reviewer):** (a) a seat the host REMOVED on an earlier night of a multi-night run has
  no row at the end (its bank was in an earlier room; removed seats aren't in the save); (b) a run whose save is pruned
  by `pruneAccount` (lazy expiry delete, keep-3) or a room disposed mid-run without a stored save is finished by the
  orphan rule with no seats; (c) the waiting-only all-left path (`keep = true`) whose `makeResumable` then fails leaves
  the row open → orphan rule.

### Completion Notes List

- Story context created with `gds-create-story` (story writer session, 2026-11-27).
- T1: migration `0009_run_results` (first generated as 0008; regenerated on top of 10.6's `0008_problem_reports` after PR #40 merged), `runResultsRepo` (start, resumed,
  finish, expireAbandoned, statsRows), `savedSeats` (snapshot → seats through `migrateRunSave`), LOCK ORDER entry 5,
  `ACCOUNT_TABLE_MERGES.runResultPlayers`, db.test table list.
- T2: room hooks (`startRun`, `bankLeaver`, `removeRemembered`, `bankMembers` + slot, `endRun`, `finalLeave` bankNow),
  pure `meta/runResult.ts`, `RunBank.resultSeats`, `run/roomRunResults.ts`, `app.ts` wiring.
- T3: `expireAbandonedRuns` housekeeping step (B3), `index.ts` schedule, `npm run housekeeping`.
- T4: `run/runResultX8.test.ts`: a 3-player run voted into `extract`, stepped to Results with the fly-out horde
  really spawned; seat rows (waves in, loadout, kills) at the end = at extract start, through `RunBank.bankRunEnd`.
- T5: `statsCommand.ts` (pure) + `statsCli.ts`, `npm run stats`, docs/deploy.md › Database "Run stats". Checked by hand on
  real PostgreSQL: the tables print; an empty database prints "No finished runs yet" (exit 0); a bad `--since` exits 2.
- T6 tests: `meta/runResult.test.ts`, `db/runResults.test.ts` (PGlite: migration, start/finish, B8 upsert, double finish,
  3 nights, deleted/made-up account, reused slot, account delete + merged guest nulling, expiry + orphan + unreadable
  save), `db/statsCommand.test.ts`, `rooms/RunRoom.runResults.test.ts` (wipe, all-left lost, solo, Save and quit = open,
  Leave-then-rejoin = one row, removed seat + newcomer = 2 rows with a waiting joiner getting none, 3 nights), `run/runResultX8.test.ts`,
  `realPostgresRunResults.test.ts` (finish vs expiry ×20 with both outcomes asserted; 8 claims + resumed ×5),
  `realPostgresDelete.test.ts` (+ finish vs delete ×10), `tools/checks/practiceNoRunResults.test.ts` (AC 3),
  shared: `shopCards.test.ts` (+ weaponsBought), `migrations.test.ts` (v2 shape, v1 restores with `[]`).
- **Deferred D2 folded in:** `realPostgresSaves.test.ts` "deferred D2" case (×10: bank 20, then 3 × 35 + 2 × 50 top-ups at
  once → one row of 50, Supplies and lifetime +50, runs +1 once). Green on real PostgreSQL 16 locally; the CI postgres
  job runs it.
- AC 4 note: the room's 3-night test ends with a wipe, not an extract (a room extraction is a ~20 s walk + fly-out); the
  extract ending is covered by the X8 test through the same `RunBank` path.

### File List

- New: `apps/server/drizzle/0009_run_results.sql`, `apps/server/drizzle/meta/0009_snapshot.json`,
  `apps/server/src/db/runResultsRepo.ts`, `apps/server/src/db/statsCommand.ts`, `apps/server/src/db/statsCli.ts`,
  `apps/server/src/meta/runResult.ts`,
  `apps/server/src/run/roomRunResults.ts`; tests `apps/server/src/db/runResults.test.ts`,
  `apps/server/src/db/realPostgresRunResults.test.ts`, `apps/server/src/db/statsCommand.test.ts`,
  `apps/server/src/meta/runResult.test.ts`, `apps/server/src/rooms/RunRoom.runResults.test.ts`,
  `apps/server/src/run/runResultX8.test.ts`, `tools/checks/practiceNoRunResults.test.ts`.
- Changed: `apps/server/drizzle/meta/_journal.json`, `apps/server/package.json`, `apps/server/src/app.ts`,
  `apps/server/src/index.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/db/accountsRepo.ts` (comment),
  `apps/server/src/db/testQueries.ts`, `apps/server/src/db/db.test.ts`, `apps/server/src/ops/housekeeping.ts` (+ step 2),
  `apps/server/src/ops/housekeeping.test.ts` (deps stub), `apps/server/src/db/housekeepingCli.ts` (+ runResults), `apps/server/src/db/realPostgresDelete.test.ts`,
  `apps/server/src/db/realPostgresSaves.test.ts`, `apps/server/src/meta/banking.ts`, `apps/server/src/meta/merge.ts`,
  `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/test/bootTestServer.ts`, `packages/shared/src/player/player.ts`,
  `packages/shared/src/economy/shopCards.ts`, `packages/shared/src/save/runSave.ts`, `packages/shared/src/save/migrations.ts`,
  `packages/shared/src/save/restore.ts`, tests `packages/shared/src/economy/shopCards.test.ts`,
  `packages/shared/src/player/hold.test.ts`, `packages/shared/src/save/migrations.test.ts`,
  `packages/shared/src/save/runSave.coverage.test.ts`, `packages/shared/src/zombies/carCorner.test.ts`, `docs/deploy.md`,
  `_bmad-output/implementation-artifacts/deferred-work.md` (D2 closed), this file.

### Change Log

- 2026-11-27: story file written (ready-for-dev, awaiting 10.7-Q1…Q4).
- 2026-11-27: built (gds-dev-story): run_results tables + repo, room hooks, expiry housekeeping step, `npm run stats`,
  `PlayerState.weaponsBought` + save v2, deferred D2 test; Status → review.
- 2026-11-27: merged master after PR #40 (10.6): migration regenerated as 0009, keep-both in schema, index, package.json,
  accountsRepo LOCK ORDER, merge.ts, db.test, testQueries, realPostgresDelete, deploy.md; housekeeping step 2.
