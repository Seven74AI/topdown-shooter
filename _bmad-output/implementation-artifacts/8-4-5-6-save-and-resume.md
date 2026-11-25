---
baseline_commit: 0ee0d6db
---

# Story 8.4+8.5+8.6 (merged): Autosave at every build phase · Save and quit · Resume a saved run

Status: review

<!-- Merged story (designer 2026-11-25, docs/story-merges-2026-11-25.md): one save format, one storage table, one restore path; ONE builder, ONE full fresh review (≤ 2 narrow re-reviews, then main-session checks). Story file 2026-11-25 (gds-create-story, autonomous) from the real code on master 0ee0d6db and the Epic 7 branches story-7-1 / story-7-2 (NOT on master yet: this story starts only after 7.1 and 7.2 are on master). Epic 8 D10–D14 are RULES. New decisions: docs/epic-8-story-decisions.md (codes S…, R…), "recommended, to accept". -->

## Story

**8.4** As a team, I want the run saved automatically at every build phase, so that a server crash or update doesn't lose our run.
**8.5** As a host, I want to save the run during a build phase and quit, so that we can finish it another night.
**8.6** As a player, I want to pick up a saved run with whoever is around, so that we finish what we started.

> **BRIEF**: paste `docs/epic-7-brief.md` verbatim (lines 18–21 bind hardest: banked once, identity by server ticket, the save server can be down, database only through repositories in `apps/server/src/db/`), plus this file, `docs/ideas/epic-8/decisions.md` and `docs/epic-8-story-decisions.md`. Also: brief 2 — every World / `PlayerState` field is either in the save or on the save's written exclusion list (a test enforces it), brief 5 (a restored run replays deterministically from its save), brief 10 (the tick never awaits the database), R1, R3, R8.

## Acceptance Criteria

### Fairness / player-visible rules (brief 3; each is a test)

- **S1 "A save is the build phase, exactly."** Restoring a save gives every seat exactly what it had: HP, wallet, earned (and 7.2's `wavesIn`… counters), weapons, upgrades, gear, consumable slot and count, the current card offer with rev and rerolls (5.13), and every building (type, tier, rotation, owner, HP, wear, `paid`); the wave number, decay stage, variations and the car fires still burning (4.8 records: decay state, not effects), light/blackout, event schedule, boss and endless counters, the 6.12 rewards flag, 7.12's bag/pending item (if on master), every PRNG stream. Round-trip test: save in a build phase → restore into a new World → `snapshotWorld` of both equal except the written exclusion list (D10, decision E8-S1).
- **S2 "Quitting before a wipe doesn't save you."** Everyone leaving or timing out **mid-wave** loses the run (Results "Lost in the city" for anyone still watching; the save row deleted); a resumable save is only ever a **build phase** state (or the vote, E8-S12): Save and quit, everyone leaving in a build phase, or the server stopping (D11). A server stop mid-wave resumes from the **last tick of the previous build phase** (all purchases made; the wave replays from its start: accepted, D11).
- **S3 "Nobody plays the same save twice."** A saved run can be open in one room only; a second Resume says "This run is already being played"; a finished run (won, extracted, wiped) deletes its save (D13).
- **S4 "Supplies are banked once, across nights."** The run id (7.2's `runId`) is the save id and survives resumes; every resumable save tops up each linked account's Supplies for the waves played so far (no extract bonus), and the final Results top up the rest — the total over all nights equals one uninterrupted run (decisions E8-S3, E8-S4; uses 8.2+8.3's top-up, E8-J6).
- **S5 "My seat waits for me."** Returning accounts get their own seat; a missing player's seat waits in the save (and is a remembered seat tonight, so they can still join at a build phase); their buildings stay and are repairable, their turrets pay nobody while they are away; a newcomer gets 8.2's late-join money; wave size uses tonight's seat count (D14).
- **S6 "Updates never kill a save."** A save from an older game version always resumes: balance changes never block it; a save with an older `schemaVersion` is migrated step by step; a test fails if `SAVE_SCHEMA_VERSION` changes without a migration; an id the new balance no longer knows is dropped with its `paid` refunded (E8-S9) (D14).
- **S7 "Only the host saves, only in the build phase."** Save and quit is host only, build phases only, with a confirm; during a wave it is greyed with "You can save during the build phase"; anyone can Leave at any time (D12).
- **S8 "A failed save never ends the night."** If the save write fails, the room stays open, the host sees "Couldn't save the run. Try again." and play goes on (decision E8-S8). The tick never waits for the database (brief 10/20).
- **S9 "Removed stays removed."** 8.3's banned seats are in the save; a removed player can't come back by resuming (E8-S10).

### Behaviour (numbers are tests)

1. **Migration 0002** (or the next free number when this lands; 7.2 left 0001). `apps/server/src/db/schema.ts` + `apps/server/drizzle/NNNN_saved_runs.sql` (generated, committed): `saved_runs (id uuid PK = runId, district text, seed bigint, snapshot jsonb, schema_version int, wave int, names jsonb, status text check in ('open','saved'), room_code text null, created_at, updated_at, expires_at timestamptz null)` and `saved_run_players (saved_run_id uuid → saved_runs.id cascade, account_id uuid → accounts.id cascade, seat_key text, PK (saved_run_id, account_id))`; index on `saved_run_players(account_id)`. Only these two tables (epics 8.4 AC 1, decision E8-S5 for the extra columns). The migration runs forward on a copy of the 0001 schema with rows in it (brief 21).
2. **Repository** `apps/server/src/db/savedRunsRepo.ts` (nothing else touches SQL; `noDbImports.test.ts` stays green): `upsertOpen(save)`, `markSaved(id, expiresAt)`, `deleteRun(id)`, `listForAccount(accountId)` (not expired, status 'saved', newest first, max 3), `claim(id, accountId, roomCode)` (one `UPDATE … SET status='open' WHERE id=$1 AND status='saved' AND expires_at > now() AND EXISTS(link) RETURNING snapshot` — the only way to open a save: S3), `releaseOpenOnBoot()` (E8-S6), `pruneAccount(accountId, keep = 3)`. Every write through 7.2's `boundedTransaction` (`db/boundedTx.ts`), reads through `withDbTimeout` (`db/timeout.ts`, 2 s).
3. **The save format** `packages/shared/src/save/runSave.ts` (pure, no Node): `captureRunSave(world, seats, meta) → RunSave` and `restoreRunSave(save, balance, map) → { world, seats }`; `RunSave = { schemaVersion, balanceVersion, mapVersion, runId, seed, district, wave, phase: "build" | "vote", world: {…}, seats: SavedSeat[], bannedSeats: string[] }`; `SavedSeat = { seatKey, accountId, name, slot, playerId, player: PlayerState (minus runtime fields), kills, buildIdx }`. Plain JSON (no typed arrays: arrays of numbers), ≤ **64 KB** stringified for a 4-player wave-10 build with 60 buildings (test; D10 "about 50 KB"). `SAVE_SCHEMA_VERSION = 1`; `packages/shared/src/save/migrations.ts` `SAVE_MIGRATIONS: Record<number, (s) => s>`; `migrateRunSave(raw)` refuses (logs, never throws into the room) a version newer than the code.
4. **Coverage test** (brief 2): `runSave.coverage.test.ts` lists every key of `World`, `PlayerState`, `Building`, `RunState`, `BossState`, `SpecialEventState`, `DecayState`, `LightState`, `ShopOffers`, `SeedStreams` as **saved** or **excluded with a reason** (zombies, projectiles, spits, areas, grenades, blasts, gas, molotovs, inputs, zombieHistory, pathing buffers (rebuilt), flameSlots (re-claimed), lights.list (derived)); a new field in any of them fails the test until it is classified. (This replaces the "rule for every later epic" in epics.md › Epic 8.)
5. **Autosave** (8.4, D10). `RunRoom.onTick`: on `build.started` (after the tick's events) and on the tick where the build ends (`buildEndsThisTick(world)`: shared pure predicate checked **before** `controller.tick()`, true when `buildTicksLeft ≤ 1` or everyone is Ready, decision E8-S2) the room captures a `RunSave` and hands the JSON to `SaveWriter` (`apps/server/src/run/saveWriter.ts`): one write in flight per room, a newer save replaces a queued older one, results logged `run_saved {runId, bytes, ms, kind}` / `run_save_failed`, never awaited by the tick (E8-S7). Capture + stringify ≤ **3 ms** p99 at load < 1 (PERF_ASSERT). Autosaves are `status = 'open'` (not resumable by anyone). Vote opening captures too (E8-S12). No database (7.1 P3: unreachable) → saves are skipped and logged once per run; play goes on.
6. **Linked accounts.** The save's `saved_run_players` are the seats with an account (7.1 `accountId`: `acct:` keys) — present, held, remembered and (on a resumed run) still-missing saved seats. `guest:` seats (database down at their join) are saved as seats but can't resume (no account to list it for). After each `markSaved`, `pruneAccount` keeps each account's newest 3 resumable saves (an older link is removed; a run with no link left is deleted) (D13, decision E8-S11).
7. **When a run becomes resumable** (D11, S2). `markSaved(runId, now + 7 days)` after writing the current build-phase save when: Save and quit (AC 9); the last member leaves or the last hold runs out **in a build phase or vote** (`finalLeave`, `RunRoom.ts:670-673` "run_abandoned" today); `onBeforeShutdown` (`:1340`) in a build phase or vote. **Mid-wave**: `onBeforeShutdown` and the tick-error close (`onUncaughtException`, `:1325-1338`, "the simulation is corrupted") mark the **last autosave** (the previous build's last tick) saved; everyone leaving / timing out mid-wave → `deleteRun` (lost). Shutdown: `onBeforeShutdown` broadcasts "Server restarting, your run is saved" (new text when a save exists; today `SERVER_RESTARTING_MESSAGE`), waits for the write (bounded by `BANK_TX_BUDGET_MS`-style budget, ≤ 5 s; Colyseus waits for every room to dispose, compose `stop_grace_period: 20s`), then disconnects.
8. **Boot sweep** (E8-S6). Server start (`apps/server/src/index.ts`, after migrations): `releaseOpenOnBoot()` turns every `'open'` row into `'saved'` with `expires_at = now + 7 days` (a process that died without a clean shutdown = "the server stopping": its last autosave is the save). Logged `saved_runs_released {count}`.
9. **Save and quit** (8.5, D12, S7). `C2S.RUN_SAVE_QUIT {}` (guard, "other" bucket). Server: host member, phase `build` (or vote), database reachable → (a) messages already received were applied (Colyseus handles them in order; the client sends Save only when its own pending placements are settled: the button waits for `pendingPlacements === 0`), (b) `resetBuildSpend` semantics: in the save every building counts as placed in an earlier phase (no take-back/undo on resume), (c) capture + write + `markSaved`; on success `S2C.RUN_SAVED { expiresAt }` to all and close every socket with **4023** (`CLOSE_RUN_SAVED`, terminal: no reconnect, no hold); on failure `S2C.RUN_SAVE_FAILED` to the host and nothing else changes (S8). Every phone shows **"Run saved. Anyone from this run can resume it for 7 days."** with OK → start screen; carried ghosts are dropped client-side (nothing was placed).
10. **Menu** (8.5). `ui/menuItems.ts`: "Save and quit" `visible: (c) => c.online && c.isHost`, enabled only in a build phase/vote, else greyed with "You can save during the build phase"; confirm state `confirmSave` in `ui/uiState.ts` ("Save and quit? The run ends for everyone tonight. Anyone from this run can resume it for 7 days." Save / Cancel); while saving the button shows "Saving…" and ignores taps (one request). Non-hosts see only Resume and Leave. In the menu layout test (R9).
11. **Saved games list** (8.6, D13). `GET /api/saved-runs` (new route in `apps/server/src/auth/accountRoutes.ts` style, authenticated exactly like 7.1's account routes — the guest cookie/ticket, never an account id from the client) → `[{ id, district, wave, names: [{name, slot}], savedAt, expiresAt }]` (≤ 3). `ui/StartScreen.tsx` shows **"Saved games"** between the Join form and Practice solo (or inside the 7.x hub PH1 if it is on master; Lumen LF5 rows, decision E8-R5): "Downtown · Wave 6 · Ana, Bo, Theo · saved 2 days ago" + **Resume** (≥ 44 px). Database down → "Couldn't load saved games" + Retry; Create/Join/Practice still work (brief 20). No list without an account (guest without database): nothing shown.
12. **Resume** (8.6). Join options `intent: "resume", savedRunId` (zod, `joinOptionsSchema`) + the 7.1 ticket. `onAuth` checks the ticket; `onCreate` calls `claim(savedRunId, accountId, code)` (async before the room opens: allowed, `onCreate` is async) → refused `ServerError(526, "save_busy")` "This run is already being played" or `"save_gone"` "This saved game is no longer available" (expired, deleted, not yours). The room opens a **lobby** with a new code, the resumer as host, `state.resume = { district, wave }` shown as "Resuming · Downtown · wave 6" (LobbyScreen); anyone with the link can join the lobby (4 max). Host taps Start → `startRun` builds the World with `restoreRunSave` instead of `new RunController({ players })`.
13. **Restore** (8.6, architecture › decay line 459). `restoreRunSave`: `createWorld` with the save's seed; `applyDecayStage(world, stage, variants, firesOut)` for stages 1…N **without side effects** (no destruction, refunds, banners or events: the restore uses the mutation-only path, no `decayMutate`), the car fire records set from the save, then buildings, the economy/shop/boss/special/run/light/stream states, then the seats; flow fields rebuilt; phase `build` (or `vote`) with a **fresh** `buildPhaseS` timer (or vote timer); no `build.started` heal or offer redraw (the saved offer stays). Seats: a lobby member whose `seatKey` matches a saved seat gets it (its own slot; a newcomer whose lobby slot collides is moved to a free slot first, J3); newcomers enter by 8.2's late-join rule (money from the returning seats' average; no +15 s in a fresh timer, E8-R4); saved seats with no member become **remembered seats** (they can join at a build phase tonight) and stay in the next save. The phones get the late-scene-start path (8.1) with the restored decay stage (client applies the same `applyDecayStage`).
14. **End** (S3). `endRun` (won/extracted/wiped) → `deleteRun(runId)` after the 7.2 bank; a lobby return starts a new run id. The Results screen of a resumed run shows the whole run's totals (the seats carry `earned`, kills from the save).
15. **Logs**: `run_saved`, `run_save_failed`, `run_resumable {runId, why: "save_quit"|"all_left"|"shutdown"|"tick_error"}`, `run_resumed {runId, wave, seatsBack, newcomers}`, `run_save_deleted {why: "lost"|"ended"|"pruned"}`; never a token or account id in a player-visible place.

## Tasks / Subtasks

- [x] **T1 Fairness tests first** (S1–S9): `packages/shared/src/save/runSave.test.ts` (round trip, size), `runSave.coverage.test.ts`, `migrations.test.ts`; `apps/server/src/rooms/RunRoom.save.test.ts` (autosave twice per build, Save and quit, mid-wave leave = lost, shutdown in build/wave, tick-error), `RunRoom.resume.test.ts` (claim twice, returning/newcomer/missing seats, wave size, bans); `apps/server/src/db/savedRunsRepo.test.ts` (PGlite) + a `realPostgres.test.ts` case (two concurrent claims → one wins).
- [x] **T2 Save format + restore** (AC 3, 4, 13): `packages/shared/src/save/{runSave,migrations,restore}.ts`; small per-system helpers next to their owners (`buildings/`, `economy/shopCards.ts` `restoreShop`, `boss/bossState.ts`, `events/eventState.ts`, `core/seedStreams.ts` `restoreSeedStreams` from `RngState` (`rng.ts` `createRngFromState`), `decay/applyDecayStage.ts` no-side-effect use), exported from `packages/shared/src/index.ts`.
- [x] **T3 Database** (AC 1, 2, 8): `apps/server/src/db/schema.ts`, `drizzle/NNNN_saved_runs.sql` + meta, `db/savedRunsRepo.ts`, boot sweep in `apps/server/src/index.ts` / `app.ts` (`setRoomAccounts`-style injection: `setRoomSaves(repo)` in `auth/roomAccounts.ts` or a sibling `run/roomSaves.ts`).
- [x] **T4 Autosave + resumable rules** (AC 5, 6, 7): `apps/server/src/run/saveWriter.ts`, `RunRoom.ts` (`onTick`, `finalLeave`, `onBeforeShutdown`, `onUncaughtException`), `buildEndsThisTick` in `packages/shared/src/run/runStateMachine.ts`.
- [x] **T5 Save and quit** (AC 9, 10): `messages.ts` (`RUN_SAVE_QUIT`, `RUN_SAVED`, `RUN_SAVE_FAILED`), `net/limits.ts` `CLOSE_RUN_SAVED = 4023`, `RunRoom.onSaveQuit`; client `ui/menuItems.ts`, `ui/uiState.ts`, `ui/InRunMenu.tsx`, `net/linkMonitor.ts`/`connection.ts` (4023 terminal), a saved screen (`ui/ConnectionOverlay.tsx` or a small `ui/RunSavedScreen.tsx`).
- [x] **T6 Supplies across nights** (AC S4): `apps/server/src/meta/banking.ts` — ending `"saved"` (no extract bonus) at every `markSaved`, top-up at the end (8.2+8.3's E8-J6; if T9 of 8.2+8.3 was not built, build it here first).
- [x] **T7 Saved games + resume** (AC 11, 12, 13): route `GET /api/saved-runs`; `joinOptionsSchema` `intent: "resume"`, `savedRunId`; `RunRoom.onCreate` claim; `startRun` restore branch (`RunController` gains `fromSave(save)` static); `JoinRefusal` `save_busy`, `save_gone`; client `ui/StartScreen.tsx`, `net/` fetch, `net/joinErrors.ts`, `ui/LobbyScreen.tsx` resume line.
- [x] **T8 Bots/tools**: `npm run bots -- --save-quit-at 3` then `--resume <id>` (bots resume and finish the run) with a liveness test (saved, claimed, restored digest == saved digest, waves continued, Results, row deleted).
- [x] **T9 Docs**: `docs/deploy.md` + `docs/hermes-go-live.md` (migration NNNN runs in `deploy.sh`; saves survive deploys; rollback note: an older server image ignores `saved_runs`), `epics.md` Epic 8 intro sentence → "the coverage test in Story 8.4" (R8).
- [x] **T10 Gate** (R6) + measurements: save bytes (2p wave 3, 4p wave 10 + 60 buildings, endless 15), capture ms p99, write ms on PGlite; dated report `docs/perf/epic-8-saves.md`.

## Dev Notes

### Current state (read before changing)

- **Nothing is saved today.** `RunRoom.onBeforeShutdown` (`RunRoom.ts:1340-1344`) broadcasts "Server restarting" and disconnects ("Autosave is Epic 8"); `onUncaughtException` closes after 20 failed ticks ("saving a snapshot is Epic 8"); `finalLeave` logs `run_abandoned` when the last seat goes (`:670-673`, "Story 8.4 saves build phases").
- **`snapshotWorld` is a digest view, not a save** (`packages/shared/src/core/worldSnapshot.ts`): it hashes evolved buffers (pathing, zombieHistory) and copies everything else; reuse its per-system `snapshot*` helpers as the model and use `snapshotWorld` as the round-trip judge, but the save is its own format (S1 needs restore, not hashes).
- **World build** (`RunController` constructor, `RunController.ts:333-362`): `createWorld` → debug switches → `addPlayer` per member at `teamSpawnPoint` → `startBuild`. A restore must not call `startBuild` (heal, offer draw, decay mutate, events) — it sets the run state directly.
- **Decay:** `applyDecayStage(world, stage, variants, firesOut)` (`decay/applyDecayStage.ts:28`) is the one path used by server, solo, mirror and Predictor; `decayMutate` (`decaySystem.ts:248`) is the in-run path with destruction/refunds. Car fires: `world.decay.fires`, `firesOut`, `fireEndWave`, `burnTicks` — saved (they burn 2 waves).
- **Streams:** `createSeedStreams` / `snapshotSeedStreams`, `createRngFromState` (`core/rng.ts:112`).
- **Identity:** on story-7-1 `seatKey` = `acct:<accountId>` when the join carries a valid ticket, `guest:<hash>` otherwise; `Member.accountId`, `RememberedSeat.accountId`; `sameSeat(seat, auth)`. Ticket from `POST /api/account/session` (`auth/guestSession.ts`), checked in `RunRoom.checkAuth` via `auth/roomAccounts.ts` `ticketAccountId`.
- **Database (story-7-1/7-2):** `db/client.ts` lazy `Database` (PGlite dev/tests, Postgres prod), `db/boundedTx.ts` `boundedTransaction(database, op, body)` (lock 1.5 s, statement 1.5 s, budget 1.8 s; resolves only on a final commit outcome), `db/timeout.ts` `withDbTimeout` (2 s), `noDbImports.test.ts` (no drizzle/pg outside `src/db/`), migrations `apps/server/drizzle/NNNN_*.sql` (7.2 ends at `0001_run_rewards`).
- **Banking (7.2):** `meta/banking.ts` `RunBank` with `runId = randomUUID()` at Start (broadcast `S2C.RUN_STARTED`), `bank(seat)` once per player per run keyed `(run_id, account_id)`; endings today: extracted / wiped / quit. A crash mid-run banks nothing (7.2 D7, "Epic 8's autosave will resume it").
- **Client:** start screen `ui/StartScreen.tsx` (name, Create, Join, Practice solo); in-run menu `ui/InRunMenu.tsx`, `ui/menuItems.ts` (Save and quit already planned in the comment), `ui/uiState.ts`; close codes 4020/4021 handled in `net/linkMonitor.ts` / `connection.ts`.

### Developer guidance

- One restore path: `restoreRunSave` is used by the resume and by the round-trip test; never a second "load" function.
- The save is taken only between ticks or right after a tick's events (never mid-system); capture copies, never references World arrays.
- Don't save what a build phase can't have; assert it: capture throws in a test build (and logs + skips in production) if zombies, shots, puddles, grenades, blasts or molotov zones are non-empty.
- Keep `saved_runs.snapshot` opaque to SQL (jsonb only for size/inspection; never queried by field except `wave`, `names` columns).
- Dev switches: `DEV_SAVE_EVERY_TICK=0`… not needed; use `DEV_START_WAVE` + bots to reach late builds.

### Beat the rule (reviewer start list; brief 4)

1. Everyone closes the app mid-wave just before a wipe, then resumes (S2: lost). Variant: one player stays connected and alive while the others leave, then leaves at the build phase (fine: that's a real build-phase save after a survived wave).
2. Kill the server mid-wave (crash) to retry the wave: possible only by crashing the server — boot sweep resumes from the previous build's last tick. Can a client crash the room on purpose (malformed message → tick error)? The guard drops malformed messages; a tick error from a client action is a bug to report.
3. Resume the same save in two rooms at once (two phones, same account; two accounts) → `claim` is one conditional UPDATE: one wins.
4. Resume someone else's run with a hand-made request (id guessing, another account's id): the link check in `claim`; the list never shows foreign runs; ids are UUIDs.
5. Save and quit, resume alone, sell everything / buy, quit without saving, resume again (the save is the last Save and quit or build-phase save: a build-phase leave **is** a save — accepted, it's the D11 rule; selling refunds are already capped by 5.20's earlier-phase rule because resume counts everything as placed earlier).
6. Farm Supplies by Save and quit + resume repeatedly (S4: top-ups pay only new waves).
7. A newcomer on resume gets late-join money and then a returning seat leaves → can the newcomer's seat later get a second late-join bonus? (No: their seat is remembered/saved like any seat.)
8. Edit the snapshot? (Server-only; never sent to a client; the list shows only display columns.)
9. Old save after a balance change (a weapon removed, a building price changed): resumes, item dropped with refund, logged.
10. Removed player resumes (S9), or joins the resumed lobby (banned `seatKey`s refuse `removed`).
11. Database down during Save and quit (S8), during autosave (play goes on), during resume list (Retry), during claim (refused, "Couldn't open the saved game").

### Files (expected)

Shared: `save/runSave.ts`, `save/restore.ts`, `save/migrations.ts` (+ tests), helpers in `economy/shopCards.ts`, `boss/bossState.ts`, `events/eventState.ts`, `core/seedStreams.ts`, `buildings/buildings.ts`, `run/runStateMachine.ts`, `net/messages.ts`, `index.ts`. Server: `db/schema.ts`, `drizzle/NNNN_saved_runs.sql` (+ meta), `db/savedRunsRepo.ts`, `run/saveWriter.ts`, `run/RunController.ts` (`fromSave`), `rooms/RunRoom.ts`, `rooms/schema/RunState.ts` (`resume` line), `net/limits.ts`, `meta/banking.ts`, `auth/accountRoutes.ts` (or `routes/savedRuns.ts`), `index.ts`/`app.ts`. Client: `ui/StartScreen.tsx`, `ui/LobbyScreen.tsx`, `ui/InRunMenu.tsx`, `ui/menuItems.ts`, `ui/uiState.ts`, `ui/RunSavedScreen.tsx` (new), `net/joinErrors.ts`, `net/linkMonitor.ts`, `net/connection.ts`, `net/savedRuns.ts` (new fetch). Tools: bots flags. Docs: `docs/deploy.md`, `docs/hermes-go-live.md`, `docs/perf/epic-8-saves.md`.

### File overlap and build order

- **Needs 7.1 and 7.2 on master** (accounts, tickets, `seatKey` acct:, repositories, `boundedTransaction`, `RunBank`). Also after 7.3–7.7/7.11/7.12 if possible: each adds run state (deck, Training, district, items, bag) that the coverage test (AC 4) will force into the save — landing after them means one classification pass; landing before means each later story classifies its own fields (the test makes that mandatory either way).
- **After 8.2+8.3** (uses `lateJoinWallet`, banned seats, the bank top-up, `Member.waiting`): build order **8.2+8.3 → 8.4–8.6**. 8.7 is independent (pings are never saved).
- Overlaps: `RunRoom.ts` (everyone), `messages.ts`, `menuItems.ts`/`uiState.ts`/`InRunMenu.tsx` (8.2+8.3 adds "Players"), `StartScreen.tsx`/hub (Epic 7 hub PH1), `db/schema.ts` + migration numbering (any Epic 7 story adding a migration: take the next free number at merge time and re-generate).
- netEvents kinds: **145–149** reserved (none expected). Migration: next free number.

### Effort and review

- **Effort: XL** (≈ 10–14 h for one builder: save format + restore + coverage ≈ 5 h, database + writer + rules ≈ 3 h, menu/list/resume UI ≈ 2.5 h, bots + measurements + gate ≈ 2 h). Consider building T2 (format + round trip, pure shared) first and pushing it for an early look.
- **Review: full** (three layers, beat the rule, real-Postgres concurrency): saves are the first run state that outlives a room; a hole is a wipe-dodge or a lost night.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 8.4, 8.5, 8.6; FR75; Epic 8 intro (snapshot rule).
- `docs/ideas/epic-8/decisions.md` D10–D14 (+ abuse table); `docs/epic-8-story-decisions.md` E8-S1…S12, E8-R1…R5.
- `_bmad-output/planning-artifacts/game-architecture.md` lines 163 (Saved runs), 199 (tables), 225 (programmer errors), 459 (decay re-apply), 558 (host/resume), 579 (deploys).
- `docs/epic-7-brief.md` lines 18–21; `7-1-progress-saved-on-the-server.md`; `7-2-earn-and-bank-supplies.md` (D7 crash, S3 quit banking, line 81: the snapshot carries the four counters).
- `docs/epic-6-brief.md` line 28 (one run flow: every phase change is a tested transition, Results always show).

## Dev Agent Record

### Agent Model Used

Claude (Claude Code, cloud session), gds-dev-story, autonomous overnight build.

### Gate

- `npm run gate:fast` at hand-back: see the PR body (the PR's CI `gate` is the full gate).
- Real PostgreSQL (opt-in, CI skips it: no `TEST_DATABASE_URL`): `realPostgresSaves.test.ts` 2/2 and the existing `realPostgres*.test.ts` green against a local PostgreSQL 16 (`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/t86`).
- Browser: `tools/checks/saveMenuDomLayout.test.ts` (20) + `playersMenuDomLayout.test.ts` (20) green locally.

### Debug Log References

- Real CLI run on a dev server (PGlite dir): `npm run bots -- --count 2 --save-quit-at 1` → `bots_saved {runId}`; `npm run bots -- --count 2 --resume <runId> --until-wave 3` → `run_resumed {seatsBack: 2, digestChecked: true}`, waves 2–3 played, Supplies 20 → 60 per account (top-up), the build-phase leave made it resumable again.
- A second server process started on the same PGlite directory released the first one's open run (`saved_runs_released {count: 1}`, `save_banked`): the boot sweep and its top-up on real data (not a clean kill -9 test).

### Completion Notes List

- **Save format** (`packages/shared/src/save/`): `captureRunSave` / `restoreRunSave` / `resumeSavedRun`, generic plain-JSON capture (`toPlain` / `hydrate`: typed arrays → number arrays, Maps/Sets → sorted entries) for the run's records, custom paths for streams, decay (mutation-only `applyDecayStage`), pools (counters; shots in flight sparse, 8.4-B2), seats (present, held, remembered). `saveDigest` checked on restore (8.4-B1). `WORLD_SAVE_PLAN` + `runSave.coverage.test.ts` classify every World / PlayerState / Building / RunState / BossState / SpecialEventState / DecayState / LightState / ShopOffers / SeedStreams / WaveState / LootState key. `SAVE_SCHEMA_VERSION = 1`, `migrateRunSave`, a committed v1 fixture and a shape test (a shape change without a version bump fails). E8-S9 drops unknown ids with refunds.
- **Database**: migration `0005_saved_runs` (generated by drizzle-kit on master), `savedRunsRepo` (bounded transactions; `claim` is one conditional UPDATE), brief-21 forward test on the 0004 schema with rows, PGlite tests, real-PG races (8 claims → 1, ×10; 6 concurrent save banks → 1 row, one run's Supplies).
- **Room**: autosaves (first tick, build start, build's last tick via `buildEndsThisTick`, vote), `SaveWriter` (one write in flight, newest queued wins), Save and quit (host, build/vote, ticks paused while writing, 4023, S8 failure path), everyone-left (calm → resumable, wave → lost), shutdown (calm → save now, wave → last autosave), tick-error close (last autosave), finished run deletes its save, boot sweep, resume claim in `onCreate`, resume lobby (own slots, newcomer slots, bans, district fixed), restore at Start (returning seats, remembered away seats, newcomers with late-join money and no +15 s), every bank of a resumed run a top-up (S4), prune to 3 per account.
- **Client**: Save and quit (menu item, greyed note, confirm, "Saving…", failed text, waits for my pending placements), the 4023 "Run saved" notice, Saved games on the start screen (Retry on failure), `resumeGame`, the lobby's "Resuming · Downtown · wave N" line, join texts.
- **PR #9 review L1** fixed: `teamLoot.seatId` + `PlayerState.seat`; Results match on the seat ("A teammate" when gone); `loot_finder_unknown` error log (nit). Tests: `bankingMeta.test.ts`, `rewardsMeta.test.ts`.
- **Bots**: `--account`, `--tokens`, `--save-quit-at W`, `--resume <runId>`; liveness `tools/bots/saveResume.test.ts`.
- B-codes 8.4-B1…B4, 8.5-B1…B3, 8.6-B1…B7 in `docs/epic-8-story-decisions.md` (auto-accepted).
- Not verified: production PostgreSQL write times; a real phone; the client's late-scene start on a resumed run in a real browser (covered by the bots and room tests only).

### File List

- `.gitignore`
- `_bmad-output/implementation-artifacts/8-4-5-6-save-and-resume.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `apps/client/src/main.ts`
- `apps/client/src/net/connection.ts`
- `apps/client/src/net/fakeRoom.ts`
- `apps/client/src/net/joinErrors.ts`
- `apps/client/src/net/lobbyLost.test.ts`
- `apps/client/src/net/lobbyStore.test.ts`
- `apps/client/src/net/lobbyStore.ts`
- `apps/client/src/net/onlineFlow.ts`
- `apps/client/src/net/savedRuns.test.ts`
- `apps/client/src/net/savedRuns.ts`
- `apps/client/src/net/serverNotice.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/ui/InRunMenu.tsx`
- `apps/client/src/ui/LobbyScreen.tsx`
- `apps/client/src/ui/ResultsScreen.tsx`
- `apps/client/src/ui/ServerNotice.tsx`
- `apps/client/src/ui/StartScreen.tsx`
- `apps/client/src/ui/menuItems.test.ts`
- `apps/client/src/ui/menuItems.ts`
- `apps/client/src/ui/overlay.css`
- `apps/client/src/ui/pendingPlacements.ts`
- `apps/client/src/ui/rewardsMeta.test.ts`
- `apps/client/src/ui/rewardsModel.ts`
- `apps/client/src/ui/uiState.ts`
- `apps/server/drizzle/0005_saved_runs.sql`
- `apps/server/drizzle/meta/0005_snapshot.json`
- `apps/server/drizzle/meta/_journal.json`
- `apps/server/src/app.ts`
- `apps/server/src/auth/savedRunsRoute.ts`
- `apps/server/src/db/db.test.ts`
- `apps/server/src/db/deviceTokensRepo.ts`
- `apps/server/src/db/mergeRules.test.ts`
- `apps/server/src/db/metaBank.test.ts`
- `apps/server/src/db/progressRepo.ts`
- `apps/server/src/db/realPostgres.test.ts`
- `apps/server/src/db/realPostgresAccounts.test.ts`
- `apps/server/src/db/realPostgresSaves.test.ts`
- `apps/server/src/db/savedRunsRepo.test.ts`
- `apps/server/src/db/savedRunsRepo.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/index.ts`
- `apps/server/src/meta/banking.ts`
- `apps/server/src/meta/bankingMeta.test.ts`
- `apps/server/src/meta/merge.ts`
- `apps/server/src/meta/saveBank.ts`
- `apps/server/src/net/limits.ts`
- `apps/server/src/net/rateLimit.ts`
- `apps/server/src/rooms/RunRoom.resume.test.ts`
- `apps/server/src/rooms/RunRoom.save.test.ts`
- `apps/server/src/rooms/RunRoom.saveReview.test.ts`
- `apps/server/src/rooms/RunRoom.ts`
- `apps/server/src/rooms/schema/RunState.ts`
- `apps/server/src/run/RunController.ts`
- `apps/server/src/run/roomSaves.test.ts`
- `apps/server/src/run/roomSaves.ts`
- `apps/server/src/test/saveKit.ts`
- `docs/deploy.md`
- `docs/epic-8-story-decisions.md`
- `docs/hermes-go-live.md`
- `docs/perf/epic-8-saves.md`
- `packages/shared/src/index.ts`
- `packages/shared/src/net/messages.ts`
- `packages/shared/src/net/reconnect.ts`
- `packages/shared/src/net/stateView.ts`
- `packages/shared/src/run/buildEndsThisTick.test.ts`
- `packages/shared/src/run/runStateMachine.ts`
- `packages/shared/src/save/fixtures/runSave.v1.json`
- `packages/shared/src/save/migrations.test.ts`
- `packages/shared/src/save/migrations.ts`
- `packages/shared/src/save/plain.ts`
- `packages/shared/src/save/restore.ts`
- `packages/shared/src/save/runSave.coverage.test.ts`
- `packages/shared/src/save/runSave.test.ts`
- `packages/shared/src/save/runSave.ts`
- `packages/shared/src/save/saveFixtures.ts`
- `tools/bots/botClient.ts`
- `tools/bots/run.ts`
- `tools/bots/saveResume.test.ts`
- `tools/checks/accountUpgradeWiring.test.ts`
- `tools/checks/lateJoinHostWiring.test.ts`
- `tools/checks/metaWiring.test.ts`
- `tools/checks/saveMenuDomLayout.test.ts`
- `tools/checks/survivorEditorWiring.test.ts`

### Review round 1 (parent's review of 4dd949e: 1 H / 6 M / ~12 L) — fixes

- **H1** one bag pays once: `RunSave.lootFinderSeat` noted by `bankSavedRun` and the resumed RunBank; a removed finder's find is cleared (`afterRemove`); the bank transaction strips a find another account of the run already holds (`progressRepo.oneBagPerRun`, advisory lock). Tests: room find → remove → reused p1 → save → resume → wipe (one owner); PGlite + real-PG race ×10.
- **M1** vote-resume newcomers wait (8.2 path) and enter at the build start (test).
- **M2** shutdown / tick-error saves await the Supplies top-up inside the bounded wait (test); the boot sweep also banks resumable saves with no `run_rewards` row (`listUnbanked`, test).
- **M3** 8.6-B8: `codeVersion` + `mapVersion` check; cross-build best-effort restore; another map → `save_too_old`, row deleted, waves paid once (tests, shared + room).
- **M4** every refused Save and quit answers `run.save_failed {reason}`; the client times out after 8 s; Cancel stays usable; "Saving…" in the layout test (tests).
- **M5** no 'open' row outlives its room: all-left failure → last stored autosave, else delete (8.4-B5); delete retried; onDispose settles a held row; a resumed run's claimed row counts as its last save (early tick errors mark it). Tests.
- **M6** a guest's saved runs follow the merge (`saved_run_players` re-pointed; a resume maps `acct:<guest>` seats by `mergedInto`); `ACCOUNT_TABLE_MERGES` + schema test (tests).
- **Lows**: Remove refused while saving; Remove in a build autosaves at once (unlinks the account, no resurrection by an older autosave); `lastSave` only after the write; per-run token; a resumed lobby needs one of its own seats (the last one leaving releases the save); `saved_at` column (0005 regenerated, unreleased); away seats' flags reset; `seatCounter` saved; boot sweep uses the district map; a lost run logs "lost"; `run_save_failed` once per run on a dead database; route rate key (8.6-B11); tests for S1 extras (fires, boss record, endless, blackout, bag), the shape check (version-keyed hashes with value types), the resume wave size, "Couldn't load saved games" layout, the endless wave-15 size (23.6 KB).
- **Nits**: realPostgres files documented for `--no-file-parallelism`; spec names: C2S `run.save_quit` / S2C `run.saved` / `run.save_failed` as specified; the list is `POST /api/saved-runs` (8.6-B2, story said GET); the refusal set adds `save_unavailable` and `save_too_old` to the story's two.

### Review round 2 (re-review of 6b38bad: 1 H + 3 L) — fixes

- **H** a merged guest paid twice on resume: the bank transaction finds the run's earlier row on the payee OR any account merged into it (or the payee when a merged guest's seat banks): a top-up raises that row, a first bank pays nothing again; `listUnbanked` counts such a row as banked. The resume keeps mapping the seat (key and account) to the merged account so the save stays listed for it (part (a) "keep the original accountId" would unlink the save from the account for seats still away; the bank-side lookup covers both directions instead). Tests: room (guest banks wave 1 → merge → resume → Save and quit: 20 stays 20, one row), PGlite and real PG (×5 concurrent top-ups).
- **L2** the Start restore passes `codeVersion` (same as the claim's trial).
- **L3** a removed finder's `foundBy` is kept (the noted seat + `oneBagPerRun` decide); teammates' Results keep the "found" line with the finder's seat id (test).
- **L4** the boot sweep's expiry is `SAVE_KEEP_MS` after the row's last write (D13: 7 days in the story; the review note said 14, the story's 7 kept), never a claim's old expiry (test).

### Change Log

- 2026-11-25: Stories 8.4+8.5+8.6 implemented (save format, saved_runs, autosave, Save and quit, resume, Saved games, bots, docs) + PR #9 review L1.
