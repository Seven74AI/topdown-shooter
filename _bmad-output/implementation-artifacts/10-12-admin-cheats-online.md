---
baseline_commit: 4ee22a7
---

# Story 10.12: Admin cheats online

Status: ready-for-dev

(Added 2026-11-26 with 10.11. AD-3 A (designer 2026-11-26): an admin cheat used online → **nobody in that room earns rewards for the run**, and Results says **"Admin cheats used"**. Written with `gds-create-story` from the real code at `4ee22a7` (10.7 run stats merged). The designer picks 10.12-Q1…Q6 below before the build. B-codes are technical choices made here; the builder adds its own.)

## Story

As an admin in an online game,
I want the ⚙ cheat panel to work through the server,
so that I can test co-op situations (waves, the Behemoth, events, downs) in production.

## Designer choices (pick a letter each; ★ = recommendation)

| # | Question | Options | ★ |
| --- | --- | --- | --- |
| **10.12-Q1** | **Which cheats work online?** (Today's panel has 15 controls; Perf overlay and Collision / grid view stay phone-only view tools in every option.) | **A** 12 world cheats: Spawn N (type, 1–200) around me / in view, Skip wave, Leave last 5, Spawn Behemoth, Force car alarm, Force stampede, Dev loadout (own), +500 money (own), Damage building 50 %, God mode, Decay stage (build phase only), Force blackout. Only "Restart with seed" stays off (Practice only). · **B** 7 fight cheats only: Spawn, Skip wave, Leave last 5, Behemoth, 2 events, God mode. · **C** B + money + loadout (9). | **A** (everything that makes sense in a shared world; restart would reset friends' run) |
| **10.12-Q2** | **When do teammates learn a cheat was used?** | **A** at once: the first cheat puts one small line "Admin cheats used — no rewards this run" under the wave line on **every** phone for the rest of the run, plus Results. · **B** Results only. · **C** a 3 s toast at **each** cheat ("Ana used: Spawn 50") + Results. | **A** (friends know before they keep playing for nothing; one line, not a stream) |
| **10.12-Q3** | **Cheated runs in `npm run stats`?** | **A** recorded with `cheated = true`, left out of every number; one extra line "Cheated runs left out: N". · **B** not recorded at all. · **C** counted like any run. | **A** (the 10.7 note planned this; the row still helps debugging) |
| **10.12-Q4** | **God mode online: who is safe?** | **A** the whole team (today's world flag, no sim change). · **B** the admin only (a per-player flag; 5 damage sites read it). | **B** (lets you test a teammate going down / revive while you stay up) |
| **10.12-Q5** | **What was paid BEFORE the first cheat?** (a Leaver who left earlier, an earlier night of a resumed run, a save top-up) | **A** kept; nothing more is paid after the cheat. · **B** clawed back from the accounts (can go below what they have spent). | **A** (can't un-pay safely; AD-3 is about the run's rewards from then on) |
| **10.12-Q6** | **Confirm before the first cheat?** | **A** once per run: "Using a cheat stops rewards for everyone in this room. Use it?" [Use cheats] [Cancel]. · **B** no confirm. | **A** (one mis-tap costs three friends their run) |

## Acceptance Criteria

1. **Server decides who is an admin (never the client).** A new client message `admin.cheat` (`C2S.ADMIN_CHEAT`, strict zod schema through `this.net.guard`, shared "other" bucket ~10/s) is applied only when the sender's seat has an account that is **admin on the server**: `isAdminAccount()` (`accountsRepo.ts:41`) read from the database for that seat's `accountId`. No client field claims admin; the 10.11 session flag only decides whether the client shows the panel.
2. **A non-admin is refused and logged.** A guest, a non-admin account, a seat with no database, or an admin whose mark was removed: the message changes nothing (no state, no cheated mark), nothing is sent back, and the server logs `admin_cheat_refused { roomId, playerId, accountId|null, cheat }` (at most once per seat per 10 s: B4). An invalid payload is dropped by the guard as today.
3. **The cheats (Q1).** The allowed cheats are applied **by the server on its World** at the next tick (B2), through the same shared functions the solo panel uses (`spawnRing`, `skipWave`, `leaveLast` (moved to shared), `startBossWarning`, `forceEvent`, `setLoadout`, wallet +, `damageNearestBuilding` (moved to shared), god mode per Q4, `changeDecayStage` (build phase only, like `decayCheatAllowed`), `setForcedBlackout`). "Around me / in view / nearest building / own loadout / own money" use the **admin's own player** on the server. Every value is clamped on the server (count 1–200, `MAX_SPAWN`; stage 1–`MAP_STAGE_COUNT`; known zombie types, weapons, events, blackout levels only). Numbers come from existing constants or balance JSON, not inline.
4. **The run is marked cheated, once and for good.** The first applied cheat sets `cheated` on the run (room + `RunBank`), logs `admin_cheat_used { runId, accountId, cheat, wave }` (each applied cheat, B4 rate rule), and it never clears until the room starts a new run. A refused message never marks it.
5. **Nobody earns (AD-3 A; Q5).** From the moment the run is cheated, **every bank path pays 0 Supplies, no loot item, no milestone/district/stats writes**: run end (`bankRunEnd`: members, held seats, remembered seats), a consented Leave (`bankLeaver`), a host remove (RunRoom.ts:1193), a late joiner's `nothingFor`, extract, endless, a save top-up (`bankSavedRun` in `saveBank.ts`: save & quit, all-left `makeResumable`, the boot release in `index.ts:57`, the "too old" path at RunRoom.ts:2351). One choke point: `RunBank.run()` returns without touching the repo when the bank is cheated (B1). What was banked **before** the first cheat stays (Q5 A).
6. **Saved and resumed stays cheated.** `RunSave` gets `cheated: boolean`; `SAVE_SCHEMA_VERSION` 2 → **3** with a migration step (v2 → v3: `cheated: false`) in `save/migrations.ts`. A resumed cheated run starts cheated (banner on, banks 0); a resumed clean run is clean until a cheat.
7. **Results says it.** Each seat's `run.rewards` for a cheated run is `status: "not_saved"`, totals 0, plus a new optional `cheated: true` (B3); `rewardsModel.ts` shows **"Admin cheats used"** as the status line (no Supplies rows, no item rows, no nudge) for every player in the room, admin included. Teammates see the in-run line per Q2.
8. **Run stats.** Migration **`0010_*`** (generated after 10.7's `0009_run_results`, `npm run db:generate`, never hand-edited) adds `run_results.cheated boolean NOT NULL DEFAULT false`. It is set at the first cheat (fire-and-forget `markCheated(runId)` through `recordRunResult`) and by `finish`; `expireAbandoned` keeps it. `npm run stats` behaves per Q3.
9. **The panel online (production + dev).** For an admin in an online run, the Q1 controls send `admin.cheat` instead of touching the mirror world; Perf overlay and Collision / grid view stay local; the rest stay greyed "Practice only". Q6 confirm before the first send. Solo / Practice is unchanged (still local, still no rewards). Non-admins still never download the cheat chunk (`noCheatsInRelease.test.ts` stays green: the new message name and cheat ids must not be CHEAT_STRINGS in the main bundle, or live only in the admin chunk).
10. **Nothing else changes.** A clean run banks exactly as today (every existing banking, save and run-stats test unchanged). The `DEV_*` server switches stay as they are. `NET_PROTOCOL_VERSION` 5 → 6 if the room state schema gains the `cheated` field (B5).

## Tasks / Subtasks

- [ ] **T1 Shared (AC 3, 6, 7)**
  - [ ] `packages/shared/src/net/messages.ts`: `C2S.ADMIN_CHEAT = "admin.cheat"`; `adminCheatSchema` = strict discriminated union on `cheat` (`spawn {type, count, where: "ring"|"view"}`, `skip_wave`, `leave_last`, `behemoth`, `event {kind}`, `loadout {w0, w1|null}`, `money`, `damage_building`, `god {on}`, `decay {stage}`, `blackout {pct}`), limited to the Q1 pick. `runRewardsSchema`: `cheated: z.boolean().optional()`.
  - [ ] Move `leaveLast` and `damageNearestBuilding` from `apps/client/src/debug/devCheatActions.ts` into shared (e.g. `packages/shared/src/debug/adminCheats.ts`) with one `applyAdminCheat(world, playerId, cheat)` the server calls; the client panel imports the same helpers (solo path unchanged).
  - [ ] Q4 B: `PlayerState.god` (or a `Set` on `world.debug`) read at the 5 god-mode sites: `combat/damage.ts:34`, `zombies/spit.ts:277`, `zombies/zombieAi.ts:143`, `decay/fire.ts:96`, `events/stampede.ts:347`. Keep `world.debug.godMode` for solo / bots / `?stress`. If it is a `PlayerState` field it is saved (`PLAYER_SAVE_PLAN` saves every field) and hits the digest: decide and record (B6).
  - [ ] `save/runSave.ts`: `RunSave.cheated`, `SaveMeta.cheated`, captured in `captureRunSave`; `SAVE_SCHEMA_VERSION = 3`; `migrations.ts` step 2 → 3; restore returns it.
- [ ] **T2 Server: admin check + apply (AC 1–4)**
  - [ ] `RunRoom.ts` `onCreate` handler list (:572-600): `this.onMessage(C2S.ADMIN_CHEAT, this.net.guard(adminCheatSchema, (c, m) => this.onAdminCheat(c, m)))`.
  - [ ] `onAdminCheat`: only in a run (`inRun()`), only for a member with a live player. Admin check B7: on the first cheat of a seat, `roomAccountsRepo().findByTokenHash(auth.guestTokenHash)` → `isAdminAccount(acc) && acc.id === member.accountId`; cache the yes/no per seat id for this run (a reconnect / takeover re-checks). Never awaited by the tick: queue the cheat after the check resolves; the tick drains the queue (B2).
  - [ ] Mark: `this.cheated = true`; `this.bank.markCheated()`; room state `cheated = true` (Q2 A banner); `recordRunResult(runId, "cheated", (r) => r.markCheated(runId), log)`; logs per AC 4. Reset in `startRun` (fresh run); set from `resume.save.cheated` on a resumed Start (RunRoom.ts:1885 area).
- [ ] **T3 Server: banking 0 (AC 5)**
  - [ ] `meta/banking.ts`: `RunBankDeps.cheated?: boolean` + `markCheated()`; in `run(seat)` before the repo: if cheated → `message(..., "not_saved", zeros, 0)` + `cheated: true`, no `writes`, no `teamLoot` line, log `supplies_cheated { runId, accountId }`. `nothingFor` adds `cheated` too. A bank already settled before the mark keeps its result (Q5 A) — but a seat that `reopen`s after the mark banks 0 (no top-up).
  - [ ] `meta/saveBank.ts` `bankSavedRun`: if `save.cheated` → bank nothing (return zero results, log `save_banked { …, cheated: true }`), covering all four callers.
  - [ ] Results: the room's results/rewards path delivers per seat as today; check a seat reconnecting on Results gets the cheated result again (`resultFor`).
- [ ] **T4 Server: run stats (AC 8)**
  - [ ] `db/schema.ts` `runResults.cheated`; `npm run db:generate -w @topdown/server` → `0010_*.sql` + snapshot + journal (if master gains a 0010 first, regenerate on top; never rename).
  - [ ] `db/runResultsRepo.ts`: `markCheated(runId)` (guarded upsert like `start`: a lost start row is inserted), `RunEndRow.cheated`, `finish` sets it (never clears it), `StatsRun.cheated` or a filter in the stats read; `statsCommand.ts › formatStats` per Q3 (+ test).
- [ ] **T5 Client (AC 7, 9)**
  - [ ] `debug/DevCheats.tsx`: online + admin → the Q1 controls call `session.send(C2S.ADMIN_CHEAT, …)` (through the client's session in `net/session.ts`), keep `disabled` for the rest; Q6 confirm once per run (B8 text in the admin chunk only). Dev builds online use the same send path (a dev server honours it only for admins too, or with `DEV_ADMIN_CHEATS=1` outside production: B9).
  - [ ] Q2 banner: HUD line from room state `cheated` (`net/syncState` / `stateView.ts`), Lumen style, under the wave line, not red (red = boss danger).
  - [ ] `ui/rewardsModel.ts`: `REWARDS_TEXT.cheated = "Admin cheats used"`, state `cheated` when `rewards.cheated`; `ResultsScreen.tsx` draws it; `tools/checks/resultsLayoutCss.test.ts` stays green.
- [ ] **T6 Tests** — see Test plan. **T7 Hand-back** — `gate:fast` + `test:changed` (RunRoom, banking, save, DOM checks), `test:slow` for the RunRoom suites touched; real-PG case runs in CI's `postgres` job; branch `story-10-12`, PR "Story 10.12: Admin cheats online"; record B-codes.

## Test plan

- **Admin check (server, never the client):** an admin account (PGlite, `adminsRepo().setAdmin`) sends `admin.cheat spawn 50` → alive count +50 on the server World. Same message from: a guest, a non-admin account, a seat whose account was admin and then `remove`d before its first cheat, a room with no database → nothing changes, `cheated` stays false, `admin_cheat_refused` logged once (a burst of 20 logs one line). A client that forces its own `accountStore.admin = true` gains nothing (same test as non-admin). Out-of-range values (count 10 000, stage 9, unknown type/weapon/event) are refused by the schema or clamped.
- **Every bank path pays 0 for a cheated run** (each its own test, `RunRoom.rewards`/`.leave`/`.resume`/`.save`-style with `bootTestServer()`, asserting `addSupplies` is **never called** and no milestone/loot rows exist): run end wiped; extract (the `extracted` ending); endless (stay after the vote, lose in endless); a member held (8.1) at the end; a remembered seat; a consented Leave **after** the cheat; a host remove after the cheat; a late joiner waiting; the loot bag found (no item, no team line); a milestone that would trigger (first extraction) → not granted; save & quit after the cheat → `bankSavedRun` pays nothing; all-left resumable; boot release; resume of a cheated save → banner on, end banks 0.
- **Before the cheat (Q5 A):** a Leaver who left in wave 3, cheat in wave 5 → the Leaver keeps its wave-3 bank; that seat rejoins and plays on → its top-up is 0. A resumed run: night 1 clean (save banked), cheat on night 2 → night-1 Supplies stay, night 2 pays nothing.
- **Save format:** a v2 save migrates to v3 with `cheated: false`; a cheated save round-trips `cheated: true`; `saveDigest` stable; existing save fixtures pass.
- **Run stats:** `run_results.cheated` true after the first cheat (also when the start row was lost), `finish` keeps it, `expireAbandoned` keeps it; `npm run stats` per Q3 (cheated runs left out, the count line). Real-PostgreSQL case for the column default (`realPostgresRunResults.test.ts`). `migrationJournal.test.ts` green.
- **Clean runs unchanged:** the existing banking, saves, run stats, X8 and RunRoom suites pass untouched (no assert edits except exact-shape ones for the new optional fields).
- **Client:** `rewardsModel` cheated state; DevCheats online sends one message per click, view tools stay local, confirm shown once; `noCheatsInRelease` green and the new strings only in `admin-tools-*`.
- **Browser (Playwright, production build, own ports, AGENTS §6):** admin hosts + a guest joins, Start; admin confirms, Spawn 50 → both phones see the zombies; the guest sees the banner (Q2 A); team wipes → both Results say "Admin cheats used", no Supplies. Screenshots at deviceScaleFactor 1 for your own check; say what wasn't verified.

## B-codes (technical, made here)

- **10.12-B1** One choke point: `RunBank.run()` (all live bank paths) + `bankSavedRun` (all save paths). No per-caller checks.
- **10.12-B2** Cheats are applied by the tick from a queue (like inputs), never inside the message handler, so the sim stays one-threaded and the tick order is stable. Cheated runs don't need replay determinism (4.4 input log): log the cheat; no replay support.
- **10.12-B3** Results keep `status: "not_saved"` + a new optional `cheated: true` (an older client that missed the reload still shows a sane "Not saved").
- **10.12-B4** Logs: `admin_cheat_used` and `admin_cheat_refused` at most once per seat per 10 s per cheat kind (plus the first one always); ids only, no usernames (brief 28).
- **10.12-B5** The banner reads a room-state boolean `cheated` (late joiners and reconnects get it for free), not a netEvent; bump `NET_PROTOCOL_VERSION` 5 → 6 if the state schema change needs it (check how 12.2 bumped to 5).
- **10.12-B6** (builder) where per-player god lives and whether it is saved.
- **10.12-B7** Admin read once per seat per run from the database (`findByTokenHash` + id match), cached; an `admin remove` takes effect for that seat at the next run. No admin flag in room state, lobby data or netEvents (10.11 AC 2).
- **10.12-B8** Confirm text and panel strings live in the admin chunk only.
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

- **Overlaps:** `apps/server/src/rooms/RunRoom.ts` (handler list, startRun/resume, endRun, bank callers), `meta/banking.ts`, `meta/saveBank.ts`, `packages/shared/src/save/*` (**save v3**: any other story bumping the save format must go after and regenerate its step), `net/messages.ts` (C2S + run.rewards), `db/schema.ts` + **migration 0010** (any other migration story regenerates on top), `runResultsRepo.ts`, `statsCommand.ts`, `DevCheats.tsx` / `devCheatActions.ts`, `rewardsModel.ts` / `ResultsScreen.tsx`, the 5 god-mode sim sites (Q4 B), `NET_PROTOCOL_VERSION` (B5).
- **In flight now:** 10.2 (frame rate, client render) and 10.5 (install / browsers, client shell) touch different code — fine in parallel; check HUD files if 10.2 touches the HUD (banner). **Don't run in parallel** with deferred D3 (two-seat under-pay, the next `banking.ts` change) or any story touching RunRoom start/end or the save format. 10.3 (memory/battery) is client-side: fine.
- Hermes: deploy must run migration 0010; no operator step beyond 10.11's `admin add`.

### References

- epics.md › Story 10.11 / 10.12 (AD-1…AD-4); `10-11-admin-players.md` (B1–B7, Security notes); `10-7-run-stats.md` (B7, Notes for the merge); AGENTS.md §2–§6; files cited above.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story context created with `gds-create-story` (story writer session, 2026-11-27). Q1–Q6 await the designer.

### File List
