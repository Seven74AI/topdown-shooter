---
baseline_commit: 4ee22a7
---

# Story 10.12: Admin cheats online

Status: done

(Added 2026-11-26 with 10.11. AD-3 A (designer 2026-11-26): an admin cheat used online → **nobody in that room earns rewards for the run**, and Results says **"Admin cheats used"**. Written with `gds-create-story` from the real code at `4ee22a7` (10.7 run stats merged). The designer picks 10.12-Q1…Q6 below before the build. B-codes are technical choices made here; the builder adds its own.)

> **Designer decisions 2026-11-27 (these SUPERSEDE AD-3 A and every Q-code below; the builder rewrites the tasks to match first):**
> - **Q1: every cheat works online, "Restart with seed" included** (it restarts the room's run for everyone, like the solo cheat). The view tools (perf overlay, collision / grid view) stay local to the admin's phone.
> - **AD-3 reversed: cheats cost nobody rewards.** Cheated runs bank Supplies, loot, milestones and districts exactly like clean runs. There is no zero-pay path, no "Admin cheats used" on Results, and no `run.rewards` change. (Q5 has nothing left to decide.)
> - **Q2: teammates are not told.** No banner, no toast, no Results line.
> - **Q3 A:** the run is still marked `cheated` in `run_results` (migration after 0009). `npm run stats` leaves cheated runs out of every number and prints one line, "Cheated runs left out: N". So the run must stay marked through save and resume (save format v2 → v3, or the flag lives only in `run_results`, which the builder decides as a B-code).
> - **Q4 B:** online god mode protects the admin's own survivor only (a per-player flag).
> - **Q6 B: no confirm step.**
> - Unchanged: the server checks admin itself (never trusts the client). A non-admin's cheat message is refused and logged.


## Story

As an admin in an online game,
I want the ⚙ cheat panel to work through the server,
so that I can test co-op situations (waves, the Behemoth, events, downs) in production.

## Designer choices (asked 2026-11-26; SUPERSEDED by the 2026-11-27 block above, kept as the record)

| # | Question | Options | ★ |
| --- | --- | --- | --- |
| **10.12-Q1** | **Which cheats work online?** (Today's panel has 15 controls; Perf overlay and Collision / grid view stay phone-only view tools in every option.) | **A** 12 world cheats: Spawn N (type, 1–200) around me / in view, Skip wave, Leave last 5, Spawn Behemoth, Force car alarm, Force stampede, Dev loadout (own), +500 money (own), Damage building 50 %, God mode, Decay stage (build phase only), Force blackout. Only "Restart with seed" stays off (Practice only). · **B** 7 fight cheats only: Spawn, Skip wave, Leave last 5, Behemoth, 2 events, God mode. · **C** B + money + loadout (9). | **A** (everything that makes sense in a shared world; restart would reset friends' run) |
| **10.12-Q2** | **When do teammates learn a cheat was used?** | **A** at once: the first cheat puts one small line "Admin cheats used — no rewards this run" under the wave line on **every** phone for the rest of the run, plus Results. · **B** Results only. · **C** a 3 s toast at **each** cheat ("Ana used: Spawn 50") + Results. | **A** (friends know before they keep playing for nothing; one line, not a stream) |
| **10.12-Q3** | **Cheated runs in `npm run stats`?** | **A** recorded with `cheated = true`, left out of every number; one extra line "Cheated runs left out: N". · **B** not recorded at all. · **C** counted like any run. | **A** (the 10.7 note planned this; the row still helps debugging) |
| **10.12-Q4** | **God mode online: who is safe?** | **A** the whole team (today's world flag, no sim change). · **B** the admin only (a per-player flag; 5 damage sites read it). | **B** (lets you test a teammate going down / revive while you stay up) |
| **10.12-Q5** | **What was paid BEFORE the first cheat?** (a Leaver who left earlier, an earlier night of a resumed run, a save top-up) | **A** kept; nothing more is paid after the cheat. · **B** clawed back from the accounts (can go below what they have spent). | **A** (can't un-pay safely; AD-3 is about the run's rewards from then on) |
| **10.12-Q6** | **Confirm before the first cheat?** | **A** once per run: "Using a cheat stops rewards for everyone in this room. Use it?" [Use cheats] [Cancel]. · **B** no confirm. | **A** (one mis-tap costs three friends their run) |

## Acceptance Criteria

(Rewritten 2026-11-27 by the builder to match the designer decisions above. The Q-code table stays only as the record of what was asked.)

1. **Server decides who is an admin (never the client).** A new client message `admin.cheat` (`C2S.ADMIN_CHEAT`, strict zod schema through `this.net.guard`, shared "other" bucket ~10/s) is applied only when the sender's seat has an account that is **admin on the server**: `findByTokenHash(member.guestTokenHash)` → same id as the seat's `accountId` and `isAdminAccount()` (B7). No client field claims admin; the 10.11 session flag only decides whether the client shows the panel.
2. **A non-admin is refused and logged.** A guest, a non-admin account, a seat with no database, or an admin whose mark was removed before the seat's first cheat: the message changes nothing (no state, no cheated mark), nothing is sent back, and the server logs `admin_cheat_refused { roomId, playerId, accountId|null, cheat }` (B4 rate rule). An invalid payload is dropped by the guard as today.
3. **Every cheat works online (Q1).** Spawn N (type, 1–200) around me / in view, Skip wave, Leave last 5, Spawn Behemoth, Force car alarm, Force stampede, Dev loadout (own), +500 money (own), Damage nearest building 50 %, God mode (own, AC 5), Decay stage (build phase only, like `decayCheatAllowed`), Force blackout, and **Restart with seed** (AC 6). Applied **by the server on its World** in the next tick (B2) through the same shared functions the solo panel uses (moved to `packages/shared/src/debug/adminCheats.ts`). "Around me / in view / nearest building / own loadout / own money" use the **admin's own player** on the server. Every value is checked on the server (count 1–200; stage 1–`MAP_STAGE_COUNT`; known zombie types, weapons, events, blackout levels only; uint32 seed). Perf overlay and Collision / grid view stay local to the admin's phone.
4. **Cheats cost nobody rewards (AD-3 reversed).** A cheated run banks Supplies, loot, milestones and districts exactly like a clean run: no banking, save-bank, `run.rewards` or Results change at all (B1). **Teammates are not told (Q2):** no banner, toast, Results line, room-state field or netEvent for a cheat.
5. **God mode protects the admin only (Q4 B).** A per-player flag (B6) read at the 5 damage sites (`combat/damage.ts`, `zombies/spit.ts`, `zombies/zombieAi.ts`, `decay/fire.ts`, `events/stampede.ts`); teammates still take damage, go down, get revived. The world-wide `world.debug.godMode` stays for solo / bots / `?stress`.
6. **Restart with seed online** restarts the room's run for everyone (B3): the current run ends as if everyone left at once (each seat banks what it earned so far, ending `quit`, no extract bonus: same rewards rule), its save is dropped, its stats row is finished (cheated), then the same members start a fresh run with that seed through the normal Start path (progress reads; no Ready step). A resumed run's restart is a fresh run.
7. **Run stats (Q3 A).** Migration **`0010_*`** (generated after `0009_run_results`, never hand-edited) adds `run_results.cheated boolean NOT NULL DEFAULT false`. The first applied cheat of a run marks its row (`markCheated`, a sticky upsert; a lost start row is inserted), fire and forget after the run's earlier writes; `finish` and `expireAbandoned` never clear it. The flag lives only in `run_results` (B8): a resumed run keeps its run id, so its row stays cheated (no save format change). `npm run stats` leaves cheated runs out of every number and prints **"Cheated runs left out: N"**. The room logs `admin_cheat_used { runId, accountId, cheat, wave }` (B4).
8. **No confirm (Q6 B).** The panel sends at once.
9. **The panel online (production + dev).** For an admin in an online run, every control sends `admin.cheat` instead of touching the mirror world; the "Practice only" lock goes. Solo / Practice is unchanged (still local). Non-admins still never download the cheat chunk (`noCheatsInRelease.test.ts` green: the panel strings stay in `admin-tools-*`; the message name is not a cheat string).
10. **Nothing else changes.** A clean run plays and banks exactly as today. The `DEV_*` server switches stay. `NET_PROTOCOL_VERSION` 5 → 6 (a new client message, B5).

## Tasks / Subtasks

- [x] **T1 Shared (AC 3, 5)**
  - [x] `net/messages.ts`: `C2S.ADMIN_CHEAT = "admin.cheat"`; `adminCheatSchema` = strict discriminated union on `cheat` (`spawn {type, count, where: "ring"|"view", view?}`, `skip_wave`, `leave_last`, `behemoth`, `event {kind}`, `loadout {w0, w1|null}`, `money`, `damage_building`, `god {on}`, `decay {stage}`, `blackout {pct}`, `restart {seed}`); `NET_PROTOCOL_VERSION = 6`.
  - [x] `debug/adminCheats.ts`: `leaveLast`, `damageNearestBuilding`, `clampSpawnCount`, `decayCheatAllowed`, constants (ring radius, leave count, money, building damage), and `applyAdminCheat(world, playerId, cheat)` for every world cheat (not restart: the room's). The client panel imports the same helpers (solo path unchanged).
  - [x] Per-player god (B6): `world.debug.godPlayers: Set<string>` + `isGodFor(world, p)` at the 5 sites.
- [x] **T2 Server (AC 1–3, 6, 7)**
  - [x] `RunRoom.ts`: handler through `this.net.guard`; `onAdminCheat` (in a run, member with a player; admin check B7 cached per seat for the run, async; the cheat is queued after the check and the tick drains the queue before `controller.tick()`, B2); refused / used logs (B4); `DEV_ADMIN_CHEATS=1` outside production (B9).
  - [x] Restart (B3): `endRun` with the run's ending "none" → everyone banks `quit`; back to the lobby state (shared with `onLobbyReturn`), resume cleared; `loadAndStart` with the seed, no Ready check.
  - [x] Mark: first applied cheat → `this.cheated`, `recordRunResult(runId, "cheated", markCheated)` after the earlier writes; `finish` passes `cheated`. Reset per run.
- [x] **T3 Run stats (AC 7)**: `db/schema.ts` `runResults.cheated`; `npm run db:generate` → `0010_*`; `runResultsRepo.markCheated`, `RunEndRow.cheated?`, finish never clears, `StatsRun.cheated`; `statsCommand.formatStats` filter + line.
- [x] **T4 Client (AC 8, 9)**: `DevCheats.tsx` online → `admin.cheat` through the online session (no confirm), solo unchanged; the panel's state readouts (god) follow the server where it matters.
- [x] **T5 Tests** (Test plan). **T6 Hand-back**: `gate:fast` + `test:changed`, PR "Story 10.12: Admin cheats online", CI green, B-codes recorded.

## Test plan

- **Admin check (server, never the client):** an admin account (PGlite, `setAdmin`) sends `admin.cheat spawn 50` → alive +50 on the server World, `run_results.cheated` true. The same message from a guest, a non-admin account, a seat whose admin mark was removed before its first cheat, a room with no database → nothing changes, not marked, `admin_cheat_refused` logged (a burst logs one line). Invalid payloads (count 10 000, stage 9, unknown type / weapon / event, extra fields) are dropped by the guard.
- **Each cheat on the server** (shared `applyAdminCheat` unit tests + one room test per family): spawn ring / view near the admin; skip wave; leave last; Behemoth; both events; own loadout; own money (+500, others unchanged); damage nearest building; god for the admin only (a teammate still takes damage); decay only in build; blackout; restart with seed (new run, seed in force, everyone banked `quit` like a Leave, the old save dropped).
- **Rewards unchanged:** a cheated run's end banks exactly what the same clean run would (`addSupplies` called with the normal numbers); no `cheated` in `run.rewards`.
- **Run stats:** `markCheated` marks (also when the start row was lost), `finish` keeps it, `expireAbandoned` keeps it, a resumed run's row stays cheated; `formatStats` leaves cheated runs out of every number + the count line. Real-PostgreSQL case for the column (CI `postgres` job). `migrationJournal.test.ts` green.
- **Client:** DevCheats online sends one message per click (no confirm), view tools stay local; `noCheatsInRelease` green.
- **Browser (Playwright, production build, own ports):** admin hosts + a guest joins, Start; admin Spawn 50 → both phones see the zombies; no banner on the guest. Screenshots at deviceScaleFactor 1; say what wasn't verified.

## B-codes (technical, made here)

- **10.12-B1** (replaces the old B1/B3) No reward path changes: AD-3 is reversed, so banking, saves and Results are untouched.
- **10.12-B2** Cheats are applied by the tick from a queue (a reused array), never inside the message handler; cheated runs don't need replay determinism (4.4 input log): the cheat is logged, no replay support.
- **10.12-B3** (builder) Online "Restart with seed" = the run ends like everyone leaving at once (ending "none" → every seat banks `quit`: its waves so far, no extract bonus; the save dropped; stats row finished), then the room's lobby reset and the normal Start path with the seed for the same members (Ready skipped). Clients see lobby → build as at any Start.
- **10.12-B4** Logs `admin_cheat_used` / `admin_cheat_refused`: at most once per seat per 10 s per cheat kind; ids only, no usernames.
- **10.12-B5** (builder) No room-state field (teammates not told); `NET_PROTOCOL_VERSION` 5 → 6 for the new C2S message (Epic 11 now takes 7).
- **10.12-B6** (builder) Per-player god lives in `world.debug.godPlayers` (a Set of player ids): not in `PlayerState`, so not saved and not in the digest; a resume or restart starts without it (re-tick it).
- **10.12-B7** Admin read once per seat per run from the database (`findByTokenHash` + id match), cached; an `admin remove` takes effect for that seat at the next run. No admin flag in room state, lobby data or netEvents (10.11 AC 2).
- **10.12-B8** (builder, the designer's "your B-code on how") The cheated mark lives only in `run_results` (no save format v3): a resume keeps the run id, so the row stays marked; `markCheated` is a sticky upsert and `finish` ORs the room's own flag in.
- **10.12-B9** Dev servers: same admin rule; `DEV_ADMIN_CHEATS=1` (ignored when `NODE_ENV=production`, logged like the other `DEV_*` switches) lets any seat cheat for local testing.

## Dev Notes

### What exists today (read before changing)

- **10.11 plumbing:** `accounts.is_admin` (migration 0007), `isAdminAccount()` (`apps/server/src/db/accountsRepo.ts:41`, `username !== null && isAdmin`), session replies carry `account.admin`; client `accountStore.admin`, lazy `debug/adminGate.ts` → `debug/adminTools.ts` → `DevCheats.tsx`. Online in production the panel is locked to Perf overlay + Collision / grid view with one "Practice only" line (`practiceOnlyOnline && online`, DevCheats.tsx:103-105; B5 of 10.11). The server has **no** admin action yet (10.11 Security notes: "10.12 will check `is_admin` on the server").
- **Seat auth:** `RunAuth { name, ip, guestTokenHash, accountId, … }` (RunRoom.ts:176); `accountId` from the HMAC ticket (`ticketAccountId`, `auth/roomAccounts.ts:33`), re-checked by `ticketStillCurrent` (RunRoom.ts:306). `roomAccountsRepo()` is null without a database. `AccountsRepo` has `findByTokenHash` (returns `Account` with `isAdmin`), no find-by-id.
- **Message guard:** `apps/server/src/net/messageGuard.ts`: buckets `input`, `ghost`, `ping`, and one shared `other` (~10 msgs/s, bucket 10); bursts dropped silently. Never pass zod to `onMessage` directly.
- **Cheats (solo):** `devCheatActions.ts` (`leaveLast`, `damageNearestBuilding`, `setDecayStageCheat`/`decayCheatAllowed`, `setForcedBlackoutCheat`, `spawnBehemothCheat`) plus shared `spawnRing` (`zombies/spawnRing.ts:14`), `skipWave` (`run/runStateMachine.ts:409`), `forceEvent` (`events/specialEvents.ts:140`), `setLoadout` (`combat/loadout.ts:56`), wallet `+= CHEAT_MONEY`, `world.debug.godMode` (world-wide).
- **Banking:** `meta/banking.ts` `RunBank` (one per run, made at RunRoom.ts:1885; `resumed` for a resumed run). Callers: `bankRunEnd` (RunRoom.ts:1278 all-left / 2060 endRun), `bankLeaver` (:1094), host remove (:1193), `nothingFor`. Saves: `meta/saveBank.ts › bankSavedRun` (RunRoom.ts:2351, :2545; `index.ts:57` boot release). Milestones (7.11), loot (7.12), districts (7.7) and stats deltas are all `writes` inside `repo.addSupplies` → skipping the repo call skips all of them.
- **Run stats (10.7):** `db/runResultsRepo.ts` (`start`, `resumed`, `finish`, `expireAbandoned`, stats reads), room side `run/roomRunResults.ts › recordRunResult` (fire and forget, one retry), `meta/runResult.ts › resultRow/seatRow`, `db/statsCommand.ts › formatStats`. 10.7-B7 reserved the `cheated` flag for this story.
- **Saves:** `packages/shared/src/save/runSave.ts` (`SAVE_SCHEMA_VERSION = 2` since 10.7, `captureRunSave` at RunRoom.ts:2451), `save/migrations.ts`, `save/restore.ts`.
- **Results:** `apps/client/src/ui/rewardsModel.ts` (`REWARDS_TEXT`, `RewardsState`), `ResultsScreen.tsx`, `net/rewardsStore.ts`; `runRewardsSchema` is `.passthrough()` but `status` is a strict enum (hence B3).

### Code rules (AGENTS §5)

Ticks count ticks; no per-tick allocation (the cheat queue is a reused array); no inline gameplay numbers; Colyseus: `this.net.guard`, `bootTestServer()`; Phaser 4 types; exact pins (no new deps). Tests of one mechanic pass `systems: { waves: () => {} }`. Every sim test asserts something happened. No test over 30 s. Never `npm run dev`; own ports; stop by PID.

### Notes for the merge

(Rewritten by the builder 2026-11-27 for what was really built.)

- **Overlaps:** `apps/server/src/rooms/RunRoom.ts` (handler list; `step()` drains the cheat queue before the tick; `startRun` seed + cheat reset; `loadAndStart(force)`; `onLobbyReturn` body moved into `toLobby()`; `RunResultRun.cheated`), `packages/shared/src/net/messages.ts` (`C2S.ADMIN_CHEAT`, `adminCheatSchema`, **`NET_PROTOCOL_VERSION` 5 → 6**: Epic 11 now takes 7), `db/schema.ts` + **migration `0010_run_results_cheated`** (any other migration story regenerates on top; never rename), `runResultsRepo.ts` (`markCheated`, `RunEndRow.cheated`, `StatsRun.cheated`), `statsCommand.ts` (new line 2 "Cheated runs left out: N" on every non-empty output), `core/world.ts` (new World key `godPlayers`, classified in `WORLD_SAVE_PLAN` as excluded), the 5 god-mode sites (now `isGodFor(world, p)` from `core/god.ts`), `zombies/spawnRing.ts` (`spawnInView` moved here from the client's `stressScenario.ts`, which re-exports it), new `debug/adminCheats.ts` (the client's `devCheatActions.ts` re-exports `leaveLast`/`damageNearestBuilding`/`decayCheatAllowed`/`setDecayStageCheat`/`clampSpawnCount`), `DevCheats.tsx` (the 10.11 `practiceOnlyOnline` option and "Practice only" line are gone), `GameScene.sendAdminCheat`, `NetSimHost.sendAdminCheat`, `tools/checks/adminPanelDomLayout.test.ts` + `noCheatsInRelease.test.ts` (one assert).
- **No banking, save or Results change** (AD-3 reversed): `meta/banking.ts`, `meta/saveBank.ts`, `save/*` format and `rewardsModel.ts` are untouched (save format stays v2). Deferred D3 (banking) no longer conflicts.
- **10.3 overlap:** if 10.3 touched `zombieAi.ts` / `spit.ts` / `fire.ts` / `damage.ts` / `stampede.ts`, the conflict is one `world.debug.godMode` → `isGodFor(world, p)` per line plus an import.
- Hermes: the deploy must run migration 0010 (the usual `db:migrate` step). Nothing else: admins are 10.11's `admin add`.

### References

- epics.md › Story 10.11 / 10.12 (AD-1…AD-4); `10-11-admin-players.md` (B1–B7, Security notes); `10-7-run-stats.md` (B7, Notes for the merge); AGENTS.md §2–§6; files cited above.

## Senior Developer Review (AI)

**Full review (fresh agent, relayed by the main session, 2026-11-27): CHANGES REQUESTED** — 1 medium, 4 lows, no high; nits N1, N2 to do, N3–N5 no change.

### Action Items

- [x] **M1** `world.godPlayers` keyed by player id was never cleaned: a late joiner who got a freed slot was invulnerable. Fix: the two shared exits from the World drop the id: `removePlayer` (host remove, consented Leave, final leave) and `releaseHeldPlayer` (a hold that ran out → remembered seat). A temporary hold keeps it (the same seat comes back). A restart builds a new World, which starts empty. Tests: `adminCheats.test.ts` "M1" (removePlayer, then a re-added p0 is not god; a hold keeps it, its release drops it); `RunRoom.adminCheats.test.ts` "review M1" (god admin removed by the host → late joiner Cy gets p1 → `isGodFor` false; a god admin's Leave drops it).
- [x] **L1** A spawn view off the map (the schema allows ±1000 m) put zombies outside the map. Fix: `spawnInView` returns 0 when the view, clamped to the map, is empty. Test: three off-map views spawn nothing; a view that is partly on the map spawns only inside the map.
- [x] **L2** The online Force blackout select read the mirror's `lights.forcedPct` (never sent), so it snapped back to "off" and "off" could not be sent. Fix: online, the select shows the level this phone set in this run (keyed by the run seed) and no longer needs a mirror World. Test: `adminPanelDomLayout.test.ts`: picking 10 then off sends both, and the select reads "10" then "-1".
- [x] **L3** Restart dropped held teammates (`toLobby` → `clearHolds`). Main-session decision: AC 6 means "the same members". Fix: the holds are kept through the restart (their 120 s clocks keep running) and every still-held seat is held again in the new World (`reholdAfterRestart`: `controller.holdPlayer`, the remaining `heldUntilTick`). Held seats still bank `quit` for the old run (`bankRunEnd` already covers held seats). Test: "review L3 + L4": Bo is held, the admin restarts, Bo is held in the new World with a chip, then reconnects into it.
- [x] **L4** `loadAndStart(true)` read progress before the old run's banks were written. Fix: `restartWhenBanked` awaits `runBanked` (like the lobby's reload) before the Start. Test: with the old run's bank held back, the room stays in the lobby with no controller, and starts once the banks settle.
- [x] **N1** `dev_admin_cheats` / `dev_admin_cheats_ignored` are logged at each Start, like the other `DEV_*` switches (test "review N1").
- [x] **N2** A failed admin read now refuses and is cached for 10 s (`CHEAT_LOG_EVERY_MS`), then read again (`adminCheatGate.test.ts`).
- N3–N5: no change (main session).

**Re-review round 1 (main session relay, 2026-11-27): APPROVED**, with one last low (checked by the main session):

- [x] **L5** After Restart with seed using the SAME seed, the online God box and blackout select kept stale state (keyed by the seed). Fix: both are keyed by the run id from `run.started` (`rewardsStore.currentRunId`; the seed only before the first one arrives). Test: `adminPanelDomLayout.test.ts`: God on + 5 % in run 1; a new run id with the same seed (7) → box unchecked, select "off".

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, `gds-dev-story`), 2026-11-27.

### Debug Log References

- gate:fast first run: 1 failure, `RunRoom.account.test.ts` "the tick never waits for the database" (no `.then(` in the room): the admin read now settles in an `async` helper (`afterAdminRead`), still off the tick.
- gate:fast (head after the master merge): typecheck + lint + 551 files / 5276 tests passed (58 skipped) + release:check (build + cheat scan) green. `vitest --changed origin/master --project slow`: 65 files / 548 tests passed. Load: 4-core container, this builder alone, VITEST_MAX_WORKERS=3.
- Browser (Playwright + Chromium, PRODUCTION client build via `vite preview` on :5913, server on :2913 with its own PGlite, stopped by PID): account `ana_admin` registered through `/api/account/upgrade`, marked with `npm run admin -- add` (server stopped meanwhile); Ana creates, Bo (a guest) joins, Start. Ana's ⚙ shows (Bo has none), no "Practice only" line; "Spawn 50 around me" → a ring of 50 around Ana on BOTH phones; "+500 money" → Ana $700, Bo $200; Bo's page has no cheat text (Q2). "Restart with seed 424242" → both phones in a fresh build phase (wave 1 in 24 s, $200 each), the panel reads seed 424242. Server log: `admin_cheat_used` (spawn, money, restart), `run_ended`, `admin_restart`, `run_started`. Screenshots at deviceScaleFactor 1 (own check). **Not verified in a browser:** the other cheats one by one online (they are covered by the shared unit tests, the room tests and the DOM check of the sent messages), a real phone, a dev-build online panel.

### Completion Notes List

- Story context created with `gds-create-story` (story writer session, 2026-11-27). Q1–Q6 then superseded by the designer decisions 2026-11-27; the builder rewrote ACs / tasks / test plan first (commit `c2fda6b`).
- **Shared:** `adminCheatSchema` (strict discriminated union, every panel cheat incl. `restart {seed}`), `C2S.ADMIN_CHEAT`, `NET_PROTOCOL_VERSION` 6. `debug/adminCheats.ts › applyAdminCheat` (the server's path; the solo panel uses the same helpers). Per-player god: `world.godPlayers` + `isGodFor` at the 5 damage sites (B6: not saved, not in the digest). `spawnInView` moved to shared.
- **Server:** `AdminCheatGate` (B7 admin read from the database once per seat per run, never cached on a DB error; B9 `DEV_ADMIN_CHEATS`; B4 log rate). `RunRoom.onAdminCheat` → queue → `applyCheats` at the start of `step()` (B2). First applied cheat → `markRunCheated` (`run_results.cheated`, after the run's earlier writes). Restart (B3): `endRun` (ending none → every seat banks `quit`), `toLobby()`, `loadAndStart(force)` with the seed; the new run is cheated too.
- **Stats:** migration `0010_run_results_cheated`, `markCheated` (sticky upsert), `finish` ORs the room's flag, `expireAbandoned` keeps it; `formatStats` leaves cheated runs out and prints "Cheated runs left out: N" as line 2.
- **Client:** the panel's `act()` sends online / runs locally solo; online god box tracks the run seed; the 10.11 `practiceOnlyOnline` lock removed.
- **Rewards untouched** (AD-3 reversed): no banking, save, `run.rewards` or Results change; a room test checks a cheated run's wipe still banks Supplies.
- Sprint-status left to the main session (AGENTS §2).

### File List

- `_bmad-output/implementation-artifacts/10-12-admin-cheats-online.md`
- `apps/client/src/debug/DevCheats.tsx`
- `apps/client/src/debug/devCheatActions.ts`
- `apps/client/src/debug/stressScenario.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `apps/server/drizzle/0010_run_results_cheated.sql`
- `apps/server/drizzle/meta/0010_snapshot.json`
- `apps/server/drizzle/meta/_journal.json`
- `apps/server/src/db/realPostgresRunResults.test.ts`
- `apps/server/src/db/runResults.test.ts`
- `apps/server/src/db/runResultsRepo.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/db/statsCommand.test.ts`
- `apps/server/src/db/statsCommand.ts`
- `apps/server/src/rooms/RunRoom.adminCheats.test.ts`
- `apps/server/src/rooms/RunRoom.ts`
- `apps/server/src/run/adminCheatGate.ts`
- `packages/shared/src/combat/damage.ts`
- `packages/shared/src/core/god.ts`
- `packages/shared/src/core/world.ts`
- `packages/shared/src/debug/adminCheats.test.ts`
- `packages/shared/src/debug/adminCheats.ts`
- `packages/shared/src/decay/fire.ts`
- `packages/shared/src/events/stampede.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/net/messages.ts`
- `packages/shared/src/save/runSave.ts`
- `packages/shared/src/zombies/spawnRing.ts`
- `packages/shared/src/zombies/spit.ts`
- `packages/shared/src/zombies/zombieAi.ts`
- `tools/checks/adminPanelDomLayout.test.ts`
- `tools/checks/noCheatsInRelease.test.ts`
- `apps/server/src/run/adminCheatGate.test.ts`
- `apps/client/src/net/rewardsStore.ts`
- `packages/shared/src/player/player.ts`
- `packages/shared/src/player/hold.ts`

### Change Log

- 2026-11-27: story rewritten for the designer decisions; built (T1–T6); status → review.
- 2026-11-27: full review fixes M1, L1–L4, N1, N2 (see Senior Developer Review).
- 2026-11-27: re-review round 1 approved; L5 fixed.

## Main session close-out (2026-11-27)

- Designer decisions 2026-11-27 (top of this file) reversed AD-3 A. Full review (1 medium, 4 lows, nits) → fix round (main-session decision on L3: held seats survive a restart, per AC 6) → narrow re-review 1 APPROVED (new L5) → main-session check of 40dd70f (panel state keyed by the run id from `run.started`; DOM test with the same seed). CI green on 40dd70f.
- PR #44 merged efb31a1c. NET_PROTOCOL_VERSION is now 6. Deploy: migration 0010 (`run_results.cheated`).
