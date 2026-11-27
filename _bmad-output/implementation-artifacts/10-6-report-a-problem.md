---
baseline_commit: 09b5f6d2
---

# Story 10.6: Report a problem

Status: review

(Written 2026-11-27 with `gds-create-story` from the real code at `09b5f6d2`. **Awaiting designer Q-codes 10.6-Q1…Q3.** Q1 is a new screen layout and needs Lumen LF5 proposal stills before the client UI is built. The server half (T1–T4) and the ring buffer (T5) can start at once. **Migration order:** this story lands **first** and takes the next free number (today `0008_*`). 10.7 regenerates its migration on top (AGENTS §2: never rename).)

## Story

As a player,
I want to send a bug report from inside the game,
so that the designer can fix what went wrong.

## Decision log

| # | Decision | Status |
| --- | --- | --- |
| 10.6-Q1 | **Report screen layout** (a new look in Lumen LF5: proposal stills at 568 × 320 and 844 × 390 before the build). **RP1** one centred modal card, like 10.1's Delete confirm (`st-modal` / `ac-card`): title "Report a problem", one line "What is sent: your note, the last 200 log lines, your device and browser", a note box with a `0 / 500` counter, then **Send** (amber) and **Cancel**. **RP2** a bottom sheet over the current screen (Results stays visible above it), with the same parts in one row: the note on the left, Send on the right, and the "what is sent" line under it. **RP3** the RP1 card plus a collapsed "Show what is sent" disclosure that lists the log lines in a scrolling monospace box. **Recommendation: RP1.** It reuses the Delete confirm's card, focus trap and keyboard behaviour, and fits 568 × 320 with the phone keyboard open. RP3 is more honest about the data but its log box is unreadable on a phone. | **awaiting designer** — stills at `docs/art/report-screen/` (RP1 built; RP3 = `REPORT_LAYOUT.showLog`) |
| 10.6-Q2 | **Where the button sits.** **A** Settings main view, a neutral `btn` row **above** "Delete my progress" (so it reaches the start screen and the in-run ☰ → Settings), **and** a small text button "Report a problem" under the Results team card's buttons. **B** Settings only. **C** A plus a "Report a problem" item directly in the ☰ in-run menu list. **Recommendation: A** (the AC's two places; C adds a 6th ☰ item on small phones). | **B Settings only** (designer 2026-11-27) |
| 10.6-Q3 | **What the player sees after Send.** **A** "Sent. Thank you." for 2 s, then the card closes. **B** "Sent: report **K7QF**" plus a Close button. The 4-character code (A–Z without I/O, 2–9) is stored with the report, so a friend can say "I sent K7QF" and `npm run reports -- --code K7QF` finds it. **C** B, plus a "Copy code" button. **Recommendation: B.** It is one extra column and makes "the bug I told you about" findable in a 30-day list. | **B** "Sent: report K7QF" (designer 2026-11-27) |
| 10.6-B1 | **One server route** `POST /account/report` (path constant in `packages/shared/src/net/report.ts`, zod `reportRequestSchema`). The body is `{ note: string ≤ 500, code?: never, payload: { lines: string[] ≤ 200, each ≤ 300 chars, roomId?, runSeed?, wave?, phase?, device: {…}, build? } }`. The server checks the **serialized** body size again (≤ 64 KB), not only the header. Origin check and `guard(ctx)` the same as the other `/account/*` routes. | auto (technical) |
| 10.6-B2 | **Body size:** today every request body over **2 KB** is refused by `net/httpGuard.ts` (`MAX_HTTP_BODY_BYTES = 2048`) and Caddy caps `/api/*` at **8 KB** (`deploy/Caddyfile`). Both get a **per-path exception for `/account/report` only, 64 KB** (`refuseReason` gains the request URL; Caddy gets a `handle /api/account/report` block with `max_size 64KB` before the general one). Every other path keeps its cap. A test proves a 3 KB body to another path is still refused with 413. | auto (technical) |
| 10.6-B3 | **Who may report:** any device with a session cookie, guests included (a guest has an `accounts` row). No cookie, or an unknown token → 401 `no_account` (the client fetches a session first, as Create/Join do). The limits are **3 per minute per IP** (`SlidingWindowLimiter`, in memory, like the others) and **20 per 24 h per account**. The daily limit is counted **in the database** inside the insert transaction, under a lock on the account row, so it holds across restarts and racing requests (see the test plan). Over a limit → 429, and the client shows "Too many reports, try again later". | auto (technical) |
| 10.6-B4 | **Account deletion:** `problem_reports.account_id` references `accounts(id)` **`ON DELETE SET NULL`**. 10.1's `accountsRepo.deleteAccount` transaction deletes the account row (and its merged guests), so PostgreSQL nulls the reports' account id **inside that same transaction** with no code change there. The insert locks the account row `FOR KEY SHARE` first: a report and a delete serialize, and a report never fails with a foreign-key error. If the account is already gone → 401 `no_account`, never a stored orphan. Add the table to the LOCK ORDER comment in `accountsRepo.ts` (it takes only lock 2). | auto (technical) |
| 10.6-B5 | **Housekeeping job.** No server-side nightly job exists today (the only "nightly" thing is `deploy/backup.sh` by cron at 03:30; saved runs expire lazily in `pruneAccount`). This story adds `apps/server/src/ops/housekeeping.ts`: `runHousekeeping(deps)` runs the steps in order, logs one `housekeeping_done { step: count }` line, and catches and logs each step's error alone (`housekeeping_step_failed`). `index.ts` (never `createGameServer`, so tests stay clean) starts it 5 min after boot, then every 24 h on an `unref()`'d timer, and stops it on shutdown. Step 1: delete `problem_reports` older than 30 days in batches of 1000. `npm run housekeeping -w @topdown/server` runs it once by hand. **10.7 adds its own step to this file**: whichever story lands first creates it. | auto (technical) |
| 10.6-B6 | **Client ring buffer** `apps/client/src/debug/clientLog.ts`: a fixed 200-slot array of strings, plus head and count (no growth, no per-frame work: it is written only on events). Each line is `HH:MM:SS.mmm level text`, cut to 300 characters. Sources: (1) `console.warn` / `console.error` / `console.info` wrapped (the original still runs); (2) `window` `error` and `unhandledrejection` (message + first 3 stack lines); (3) `clientLog.note(kind, fields)` called at the existing net and run seams: connection state and close codes (`net/session.ts` onLeave / close code, `serverNotice.lostReason`), the link watchdog going quiet or back (`linkMonitor.ts` store), room join and leave, phase changes, `run.started` id, join refusals (`joinErrors.ts`), the WebGL context lost or restored and texture rebuild (`render/gfx/textureRegistry.ts`). **No per-tick netEvents** (zombie kills, hits): a minute of play would push out everything useful. It is never sent except by a report. | auto (technical) |
| 10.6-B8 | *(build time)* **The daily-count lock is `FOR NO KEY UPDATE`, not `FOR KEY SHARE`.** Two `KEY SHARE` locks don't block each other, so two racing reports both counted 19 and both inserted (probe: the 25-report race stored 21 with `KEY SHARE`). `NO KEY UPDATE` serializes one account's reports and still waits on 10.1's delete (`FOR UPDATE`); it doesn't block other tables' FK checks (`KEY SHARE`). Still lock 2 only in the LOCK ORDER. | auto (technical) |
| 10.6-B9 | *(build time)* **The run probe is read at report time**, never per frame: the seed and wave from the Results screen or the Game scene (`reportWorld()`), the WebGL renderer string from the game's own context once (never a new context: on a phone one more context can push the game's out). The room id and phase come from the lobby store's join / phase seams. Housekeeping is stopped on SIGINT / SIGTERM, not `server.onShutdown` (Colyseus keeps ONE such callback: app.ts's database close). | auto (technical) |
| 10.6-B10 | *(main session, review M3)* **Storage caps:** besides 3 / min per IP and 20 / 24 h per account, at most **30 reports per IP per 24 h** (in memory, `reportIpDayLimiter`, like the minute limit) and **2,000 reports per 24 h from everyone** (counted in the database inside the insert transaction, an index range count, not locked: a few over in a race is fine). Both answer 429 "Too many reports, try again later". | main session |
| 10.6-B7 | **Privacy (brief 28):** the payload carries no player names, usernames, guest token, cookie or IP. Log lines from `clientLog.note` use ids, codes and numbers only, and a test greps the notes' field names. The server stores the note as typed (the player wrote it to us) and logs `problem_reported { reportId, code, bytes, lines }`: no note text, no account id, no IP. `npm run reports` prints to the operator's terminal only. | auto (technical) |

## Acceptance Criteria

1. **Ring buffer (B6).** The client keeps the last 200 log lines from boot in every build (dev and production). A unit test pushes 450 lines and reads back exactly the last 200, in order, each ≤ 300 characters. Wrapping `console` keeps the original output. An error thrown in a Preact handler and an unhandled promise rejection each land as one line. Nothing is allocated per frame (no call from a render or tick path: the existing `tools/checks/*NoAlloc*` patterns or a grep test prove `clientLog` is not imported by `render/` or `sim/` per-frame code, except the texture-rebuild notice, which is an event).
2. **Report screen (Q1, Q2).** "Report a problem" opens from the places Q2 picks. The screen says what is sent, in exactly these words: "your note, the last 200 log lines, your device and browser". The note is optional, at most 500 characters, and the counter turns amber at 450. Send is disabled while sending (`aria-busy`). Cancel and Esc go back to where the player came from (Settings main, or Results). It works on the start screen, in the in-run menu (the run keeps going online; solo is paused as today) and on Results, for guests and accounts.
3. **What is sent (B1, B7).** The note; the ring buffer's lines; the room id (online), the run seed, the wave and phase (if in a run or on its Results), the client's net protocol version; device and browser info: `navigator.userAgent`, the `userAgentData` brands and platform when present, screen and viewport size, `devicePixelRatio`, the safe-area insets, touch or mouse mode, the graphics tier and WebGL renderer string (as `?debug=1` shows it), `navigator.language`, whether the game is installed (`display-mode` media query), and the 10.1 settings that change rendering (quality fields only). Nothing from B7's "no" list.
4. **Server stores it (B1, B3).** `POST /account/report` stores one `problem_reports` row: `id` uuid, `account_id` uuid **nullable** (B4), `created_at`, `note` text, `payload` jsonb, plus the Q3 `code` if Q3 is B or C (text, indexed, not unique: a code plus its date is enough). It logs `problem_reported` (B7). It answers 200 `{ ok: true, code? }`, 400 for a bad body (wrong types, note over 500, over 200 lines, a line over 300 characters, a serialized body over 64 KB), 401 `no_account`, 403 for a foreign Origin, 413 for a body over 64 KB by its header (B2), 429 `rate_limited` (3 / min / IP; 20 / 24 h / account, B3), and 503 `save_unavailable`. The client maps 429 to "Too many reports, try again later", and 503 or offline to "Couldn't send. Try again later." The note stays in the box after a failure.
5. **Migration.** This story's own Drizzle migration (`npm run db:generate -w @topdown/server`, never hand-edited) creates only `problem_reports`, with an index on `created_at` and one on `(account_id, created_at)` (used by the daily count). `migrationJournal.test.ts` stays green.
6. **Kept 30 days (B5).** The housekeeping job deletes reports older than 30 days. A test backdates rows (31 d and 29 d) and runs the step: only the old ones go, and the count is logged.
7. **`npm run reports` (B7).** `npm run reports -w @topdown/server -- [--limit 20] [--code K7QF] [--id <uuid>] [--full]` lists the newest reports: created time, code, account kind (guest / account / deleted), wave, room id, browser short name, the note's first 80 characters. `--full` (or `--id`/`--code`) prints one report's note, device info and every log line. It reads `DATABASE_URL` like `migrateCli.ts` / `adminCli.ts`. `docs/deploy.md` › Database gets the VPS command (the `docker compose … run --rm --no-deps server node --import tsx apps/server/src/db/reportsCli.ts` form 10.11 used), so Hermes can run it for the designer.
8. **Account deletion (10.1; B4).** When an account is deleted, its reports stay and their `account_id` is set to null **in the same transaction** as the delete. Merged guests' reports are nulled too. A real-PostgreSQL test proves it, plus the race in the test plan. 10.1's `account_deleted` log line is unchanged.
9. **Nothing else changes.** No room messages, no netEvents kinds, no balance numbers, no change to other `/account/*` routes or their body caps.

## Tasks / Subtasks

- [x] **T1 Shared contract (AC 3, 4)**: `packages/shared/src/net/report.ts` (path, zod request and response schemas, limit constants `REPORT_MAX_BYTES = 65536`, `REPORT_NOTE_MAX = 500`, `REPORT_LINES_MAX = 200`, `REPORT_LINE_MAX = 300`), exported from the shared index. These are protocol limits, not gameplay numbers (no balance JSON).
- [x] **T2 DB (AC 5, 8; B4)**: `schema.ts` `problemReports` (`accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" })`), migration, new `apps/server/src/db/reportsRepo.ts` (`insert(accountTokenHash…)` in one `boundedTransaction`: lock the account `FOR KEY SHARE` → count the last 24 h → insert or `limited`; `list`, `byCode`, `byId`, `deleteOlderThan(days, batch)`). Only repos touch tables (`noDbImports.test.ts`). LOCK ORDER comment in `accountsRepo.ts`.
- [x] **T3 Route + limits (AC 4; B1–B3)**: `apps/server/src/auth/reportRoute.ts` (the `createEndpoint` pattern of `accountRoutes.ts:256`), wired in `app.ts` `createRouter`; `reportIpLimiter` in `net/rateLimit.ts`; `net/httpGuard.ts` per-path 64 KB; `deploy/Caddyfile` per-path `max_size 64KB`.
- [x] **T4 Housekeeping + CLI (AC 6, 7; B5)**: `ops/housekeeping.ts`, start/stop in `index.ts`, `db/housekeepingCli.ts`, `db/reportsCli.ts`, scripts `housekeeping` and `reports` in `apps/server/package.json`, `docs/deploy.md`.
- [x] **T5 Client log (AC 1; B6)**: `debug/clientLog.ts`, installed first thing in `main.ts`, plus `note()` calls at the B6 seams (one line each, no new behaviour).
- [x] **T6 Client UI (AC 2, 3; Q1–Q3; after the designer's pick)**: `ui/ReportScreen.tsx` (+ CSS in `overlay.css`), `uiState.ts` screen kind (`{ kind: "report"; from: "settings" | "results" }` or a `settings` view `"report"`, whichever keeps Back correct), `net/report.ts` (collects the payload, posts with `credentials: "include"` through the same `/api` base as `net/account.ts`), buttons in `SettingsScreen.tsx` and `ResultsScreen.tsx`. Add the screen to the one Lumen layout test (Epic 7 R9: 568 × 320, 640 × 360, 800 × 360, 844 × 390, insets 44 / 21, no overlaps, text ≥ 11 px) and a `tools/checks/reportDomLayout.test.ts` (Chromium).
- [x] **T7 Tests**: see the test plan.
- [x] **T8 Hand-back**: `gate:fast` + `test:changed`, and the real-PostgreSQL files locally if you have a PostgreSQL (else CI's `postgres` job). Branch `story-10-6`, PR "Story 10.6: Report a problem".

## Dev Notes

### What exists today (read before changing)

- **Client logging is almost nil:** 3 `console.*` calls in `apps/client/src` (`CityView.ts:190`, `streetPropsAtlas.ts:43`, `textureRegistry.ts:142`). The ring buffer's value comes from the B6 `note()` seams. Read `net/session.ts` (close codes 4001 / 4020 / 4021, `onLeave` :505–589), `net/serverNotice.ts:24 lostReason`, `net/linkMonitor.ts:38 linkStore`, `net/joinErrors.ts` before adding notes.
- **`EventQueue`** (`net/eventQueue.ts`) is the per-tick sim-event queue (capacity 2048): **not** a log. Don't tap it (B6).
- **Run context on the client:** `GameScene.runSeed` (:1076), the wave from the mirror world, the room id from the session, the phase from the room state.
- **Routes:** `apps/server/src/auth/accountRoutes.ts` (createEndpoint, `guard(ctx)` = Origin + IP, `badBody`, limiter + `rateLimitLogGate` warn pattern in `accountDelete.ts:44-54`). `app.ts:62-87` builds and registers them.
- **Body caps:** `net/httpGuard.ts:4` (2 KB for every request, before Colyseus buffers it) and `deploy/Caddyfile:32-36` (8 KB for `/api/*`). Both must change for this path only (B2).
- **10.1 delete:** `accountsRepo.deleteAccount` (:134–198) deletes merged guests, then the account. FK cascades remove `progress`, `run_rewards`, `device_tokens`, `saved_run_players`. With `ON DELETE SET NULL` the reports are nulled by that same statement (B4). Its real-PostgreSQL tests are in `apps/server/src/db/realPostgresDelete.test.ts`: add the cases there.
- **Settings screen:** `ui/SettingsScreen.tsx` (main + `view: "delete"` confirm card, `uiStore` `{ kind: "settings"; view }` in `uiState.ts:34`). **Results:** `ui/ResultsScreen.tsx` (team card buttons :121–135, RW1 layout in Lumen LF5, red allowed in menus). Copy the Delete card's modal and focus handling for RP1.
- **CLIs:** `db/migrateCli.ts`, `db/adminCli.ts` + `adminCommand.ts` (10.11: testable command function, exit codes, `docs/deploy.md` compose form).

### Code rules (AGENTS §5)

No per-frame allocation (the buffer is preallocated; lines are built only on events). No gameplay numbers inline (the limits are protocol constants in shared). Exact version pins (no new dependency). Ports: never `npm run dev`; use your own client and server ports; stop processes by PID. The client fetch must not block anything: a report in flight never delays a menu or a run.

### Testing standards

PGlite repo tests like `db.test.ts`. Real-PostgreSQL tests skip without `TEST_DATABASE_URL` (CI `postgres` job, `--no-file-parallelism`). No test may take over 30 s. Every race test **asserts** what happened (rows counted, statuses checked), as E8 asks.

### Project Structure Notes

- New: `packages/shared/src/net/report.ts`, `apps/server/drizzle/0008_*.sql` (+ snapshot, journal), `apps/server/src/db/reportsRepo.ts`, `apps/server/src/db/reportsCli.ts`, `apps/server/src/db/housekeepingCli.ts`, `apps/server/src/ops/housekeeping.ts`, `apps/server/src/auth/reportRoute.ts`, `apps/client/src/debug/clientLog.ts`, `apps/client/src/net/report.ts`, `apps/client/src/ui/ReportScreen.tsx`, tests.
- Changed: `apps/server/src/db/schema.ts`, `accountsRepo.ts` (comment only), `app.ts`, `index.ts`, `net/httpGuard.ts`, `net/rateLimit.ts`, `apps/server/package.json`, `deploy/Caddyfile`, `docs/deploy.md`, `packages/shared/src/index.ts`, `apps/client/src/main.ts`, `SettingsScreen.tsx`, `ResultsScreen.tsx`, `uiState.ts`, `overlay.css`, plus the `note()` seams (`session.ts`, `linkMonitor.ts`, `joinErrors.ts`, `textureRegistry.ts`, …).

## Notes for the merge (files this story touches)

- **Overlap with 10.7 (server):** `apps/server/src/db/schema.ts` (both add a table: keep both), `apps/server/drizzle/**` (**10.6 lands first**; 10.7 regenerates its migration on top of master, never renames), `apps/server/src/ops/housekeeping.ts` (10.6 creates it; 10.7 adds a step), `apps/server/src/index.ts` (the start line, once), `apps/server/package.json` scripts, `realPostgresDelete.test.ts` (each adds its own `it`), `docs/deploy.md` › Database (keep both). All are keep-both conflicts. **10.6 and 10.7 can be built in parallel**, as long as 10.7 merges second and regenerates its migration.
- **Overlap with 10.5:** `deploy/Caddyfile` (different blocks).
- **Client:** `SettingsScreen.tsx`, `ResultsScreen.tsx`, `uiState.ts`, `overlay.css`, `main.ts`. These overlap **7.13** ("Wear it" on Results) and any 9.x story that adds a Settings row (9.5 gore, 9.6 quality, 9.8 volumes all read 10.1's settings and may add rows to `settingsRows.ts`, not `SettingsScreen.tsx`). Check them before starting in parallel.
- **netEvents / room messages:** none. **Readability sheet numbers:** none (no in-play art).

## Test plan

| What | How | Where |
| --- | --- | --- |
| Ring buffer keeps the last 200 in order, line cut at 300, console still prints, error + rejection captured | unit (jsdom / happy-dom as the client tests use) | `debug/clientLog.test.ts` |
| Notes carry no names / tokens (B7) | unit: every `note()` call site's field names against a deny list (`name`, `username`, `token`, `cookie`, `ip`) | `tools/checks/clientLogPrivacy.test.ts` |
| Route: 200, 400 (each limit), 401, 403, 413 by header, 429 IP and day, 503 | PGlite + `bootTestServer()` | `auth/reportRoute.test.ts` |
| Other paths still capped at 2 KB / 8 KB | unit on `refuseReason` + one route call | `net/httpGuard.test.ts` |
| **Daily limit under a race (real PG):** one account sends 25 reports at once over separate connections (IP limiter disabled in the test) → **exactly 20 rows** in 24 h, 5 answers `limited`. ×5 rounds | real PostgreSQL | `realPostgresReports.test.ts` |
| **Report vs account delete race (real PG):** for 10 rounds, start `deleteAccount` and 5 report inserts for that account at once → the delete returns `deleted`; every stored report has `account_id` null or the row didn't exist (the insert answered `no_account`); **no** FK error (23503), no 503, no row naming a missing account | real PostgreSQL | `realPostgresDelete.test.ts` (+ case) |
| Delete nulls in the same transaction: an account with 2 reports + a merged guest with 1 → after the delete all 3 rows have null `account_id`; `progress` etc. gone as before | real PostgreSQL + PGlite | `realPostgresDelete.test.ts`, `accountDelete.test.ts` |
| Housekeeping: 31 d rows go, 29 d stay, batches (2500 rows → 3 batches), a failing step doesn't stop the next | PGlite | `ops/housekeeping.test.ts` |
| `npm run reports` list / `--code` / `--full`, exit codes | PGlite through the command function | `db/reportsCommand.test.ts` |
| Report screen in Lumen layout test sizes, Send → server row exists, 429 text shown, note kept after failure | Chromium DOM check against a production build + test server | `tools/checks/reportDomLayout.test.ts` |
| Browser: a real report from Results after a solo online run carries room id, seed, wave and ≥ 1 note line | Playwright (by hand, in the hand-back) | Completion Notes |

### References

- epics.md › Story 10.6 (:3661); Story 10.1 deletion AC (:3555).
- [Source: apps/server/src/auth/accountDelete.ts], [Source: apps/server/src/db/accountsRepo.ts#13-25,134-198], [Source: apps/server/src/db/schema.ts], [Source: apps/server/src/net/httpGuard.ts#4], [Source: deploy/Caddyfile#30-42], [Source: deploy/backup.sh#1-4], [Source: apps/server/src/app.ts#62-87], [Source: apps/server/src/auth/accountRoutes.ts#250-266], [Source: apps/client/src/ui/SettingsScreen.tsx], [Source: apps/client/src/ui/ResultsScreen.tsx#121-135], [Source: apps/client/src/ui/uiState.ts#34], [Source: docs/epic-7-brief.md#24 (Lumen LF5), R9 (layout test)], [Source: AGENTS.md §2 (migrations), §5].

## Dev Agent Record

### Agent Model Used

Claude (builder session, 2026-11-27).

### Debug Log References

- Lock probe: `reportsRepo.insert` with `FOR KEY SHARE` → `realPostgresReports` stored 21 of 25 (fails); with `FOR NO KEY UPDATE` exactly 20, ×5 (B8).

### Implementation Plan / decisions (B-codes)

B8 and B9 added to the decision log. Q2 B: a "Help" group with "Report a problem" above Delete my progress on the start-screen Settings, and a "Report a problem" row in the ☰ → Settings view (`menu: "report"`; Back / Cancel / Esc return to Settings). Q3 B: "Sent: report K7QF" + Close; the code is stored (`problem_reports.code`, indexed). Q1: RP1 built (centred `ac-card` like the Delete confirm); RP3 is the same card with `REPORT_LAYOUT.showLog = true` (a `<details>` log box), kept switchable only until the pick.

### Completion Notes List

- Story context created with `gds-create-story` (story writer session, 2026-11-27).
- Q1 stills (real component, Lumen LF5, DPR 2, 44/21 insets) committed to master as docs-only `4dcb8e6`: `docs/art/report-screen/{rp1,rp3}-{empty,typed,sent[,failed]}-{844x390,568x320}.png`.
- AC 1: `debug/clientLog.ts` (200 slots, head + count, lines cut at 300), installed right after main.ts's imports; console info / warn / error wrapped (original still prints), window `error` + `unhandledrejection`; notes at boot, room join / leave, phase, `run.started`, connection lost, link status, join refused, WebGL lost / restored, texture rebuild. `clientLogPrivacy.test.ts`: deny-listed field names, every call site a literal, not imported by `render/` or `sim/` except the two WebGL event files.
- AC 2: `reportDomLayout.test.ts` (4 screens × 4 sizes, insets; counter amber at 450, `aria-busy`, note kept after a 429, Close / Cancel / Esc → Settings). In a real browser by hand (Playwright, dev client + real server on my own ports): solo ☰ → Settings → Report: typing "wasd" in the note doesn't drive the game, Esc → Settings view, Send → "Sent: report FWJR"; an online solo run (room JLMA, build phase of wave 1) → "Sent: report FSD6"; `npm run reports` lists both, `--code FSD6` shows room JLMA, seed 564094454, phase build, wave 0, device + 4 log lines.
- AC 3: payload = note, lines, room id, seed, wave, phase, protocol, build mode, device (UA, brands, platform, mobile, screen, viewport, dpr, safe-area insets, touch / mouse, gfx line, WebGL renderer, language, installed, quality settings). Strict zod schema with no name / token / cookie / IP field.
- AC 4: `reportRoute.test.ts` (11): 200 + row + log line fields, account kind, 400 per limit (and the limits themselves pass), 401 ×3, 403 foreign Origin, 30 KB passes, > 64 KB by header 413, another path's 3 KB still 413, 429 IP (3/min) and day (20 in DB, backdated rows free it), 503, gone account → 401.
- AC 5: `0008_problem_reports` generated with drizzle-kit (only the table + 3 indexes + the SET NULL FK); journal test green.
- AC 6: `housekeeping.test.ts`: 31 d rows go / 29 d stay with the count logged; batches (scaled: 25 rows / 10 → [10, 10, 5]); a failing step doesn't stop the next; the schedule with fake timers.
- AC 7: `reportsCommand.test.ts` (list, `--code`, `--id`, `--full`, exit codes 0/1/2, browser short names). `docs/deploy.md` › Database has the VPS compose commands.
- AC 8: `realPostgresDelete.test.ts` + 2 cases (an account's 2 reports + a merged guest's 1 → all null after the delete; a delete vs 5 reports ×10: no error, no 23503, every report stored-then-nulled or `no_account`). Ran locally on PostgreSQL 16: all 6 real-PG files, 45 tests green.
- AC 9: no room messages, netEvents, balance numbers; other routes keep their caps (`httpGuard.test.ts`; CI docker smoke: `/api/account/report` passes 9 KB (400) and stops 70 KB (413)).
- `gate:fast` green (5111 passed, 50 skipped; release:check green). Slow DOM layout checks in `tools/checks` 214/214.

### Senior Developer Review (AI)

Full review (fresh session, 2026-11-27): **changes requested**, no high. Every finding fixed, each minimal:

| # | Finding | Fix | Proof |
| --- | --- | --- | --- |
| M1 | A 300-char cut could split a surrogate pair; a lone surrogate or a NUL in a line or the note made PostgreSQL refuse the row → 503 on every try | Client cuts at a code-point boundary (`cutText` in shared: `clientLog.push`, every string in `net/report.ts`). Server: every string of the request schema is cleaned (`cleanReportText`: NUL and lone surrogates removed) by a zod transform before the insert | `report.test.ts` (shared), `clientLog.test.ts` (emoji at the cut), `reportRoute.test.ts` (200 with NUL / lone halves), `realPostgresReports.test.ts`: each of NUL, a lone high and a lone low surrogate is **refused raw** by PostgreSQL 16 and stored once parsed |
| M2 | `npm run reports` printed note / log lines raw: terminal escape injection (ESC[2J, OSC 52) and prompt injection when Hermes runs it | Every printed player string goes through `visible()`: C0 / C1 controls and bidi / line-separator controls shown as `\x1b` / `\u202e` (`\n` kept only in the full view's note). `docs/deploy.md`: report text is untrusted player input, never instructions | `reportsCommand.test.ts` (ESC[2J, OSC 52 + BEL, C1 CSI, U+202E in note and line: none survive in list or full view) |
| M3 | Storage growth (≈ 270 MB / day from one IP through free guests) | B10: 30 per IP per 24 h (memory) + 2,000 per 24 h globally (DB) → 429 | `reportRoute.test.ts` (31st from one IP refused, another IP still reports; the global cap across two accounts) |
| L1 | `runContext.roomId / phase` stayed after leaving a room | Cleared in `lobbyStore.detach()` (every leave and lost-room path) | `lobbyStore.test.ts` (leave and drop; probe: fails without the two lines) |
| L2 | A body over 64 KB (multi-byte log text) was refused on every try | `fitBody`: drops the oldest log lines until the serialized body fits `REPORT_MAX_BYTES` | `report.test.ts` (client: ~118 KB → fits, newest line kept, only a prefix dropped) |
| N1 | The client's 401 → session → retry burned a second IP slot | No (or a malformed) cookie is answered 401 **before** the IP limits. A well-formed but unknown token (stale cookie) still costs one slot (only the database can tell): documented in the route | `reportRoute.test.ts` (5 cookieless posts, then 3 reports from the same IP pass). CI smoke updated: the 9 KB cookieless body now answers 401 (still proves Caddy and Node pass it) |
| N2 | "installed first thing" was after main.ts's imports | `debug/clientLogBoot.ts`, imported first in `main.ts` (ES modules evaluate in import order) | wiring by reading; `reportDomLayout` still sees the boot note |
| N3 | wave 0 unexplained | `docs/deploy.md`: `w0` = before wave 1, `w-` = not in a run | — |
| N4 | T6 / T8 unticked | ticked | — |

Q1 stays with the designer: RP1 built, `REPORT_LAYOUT.showLog` toggle kept until the pick.

### File List

- New: `packages/shared/src/net/report.ts`, `apps/server/drizzle/0008_problem_reports.sql`, `apps/server/drizzle/meta/0008_snapshot.json`, `apps/server/src/db/reportsRepo.ts`, `apps/server/src/db/reportsCommand.ts`, `apps/server/src/db/reportsCli.ts`, `apps/server/src/db/housekeepingCli.ts`, `apps/server/src/ops/housekeeping.ts`, `apps/server/src/auth/reportRoute.ts`, `apps/client/src/debug/clientLog.ts`, `apps/client/src/net/report.ts`, `apps/client/src/ui/ReportScreen.tsx`, `docs/art/report-screen/*.png`
- New tests: `apps/server/src/auth/reportRoute.test.ts`, `apps/server/src/ops/housekeeping.test.ts`, `apps/server/src/db/reportsCommand.test.ts`, `apps/server/src/db/realPostgresReports.test.ts`, `apps/client/src/debug/clientLog.test.ts`, `apps/client/src/net/report.test.ts`, `tools/checks/clientLogPrivacy.test.ts`, `tools/checks/reportDomLayout.test.ts`
- Changed: `packages/shared/src/index.ts`, `apps/server/src/db/schema.ts`, `apps/server/drizzle/meta/_journal.json`, `apps/server/src/db/accountsRepo.ts` (LOCK ORDER comment), `apps/server/src/db/testQueries.ts`, `apps/server/src/meta/merge.ts` (merge rule entry), `apps/server/src/app.ts`, `apps/server/src/index.ts`, `apps/server/src/net/httpGuard.ts`, `apps/server/src/net/limits.ts`, `apps/server/src/net/rateLimit.ts`, `apps/server/package.json`, `deploy/Caddyfile`, `.github/workflows/ci.yml` (smoke checks), `docs/deploy.md`, `apps/client/src/main.ts`, `apps/client/src/scenes/GameScene.ts` (`reportWorld()`), `apps/client/src/ui/{SettingsScreen,InRunMenu}.tsx`, `apps/client/src/ui/{uiState,settingsRows}.ts`, `apps/client/src/ui/overlay.css`, note seams in `apps/client/src/net/{session,lobbyStore,linkMonitor,joinErrors}.ts` and `apps/client/src/render/gfx/{textureRegistry,graphicsGuard}.ts`
- Changed tests: `apps/server/src/net/httpGuard.test.ts`, `apps/server/src/db/db.test.ts`, `apps/server/src/db/realPostgresDelete.test.ts`, `apps/client/src/ui/uiState.test.ts`, `tools/checks/{accountUpgradeWiring,survivorEditorWiring}.test.ts`

### Change Log

- 2026-11-27: story file written (ready-for-dev, awaiting 10.6-Q1…Q3).
- 2026-11-27: built (Q2 B, Q3 B; Q1 RP1 built with RP3 switchable pending the pick); status review.
- 2026-11-27: review fixes M1–M3, L1, L2, N1–N4 (B10 recorded). New: `packages/shared/src/net/report.test.ts`, `apps/client/src/debug/clientLogBoot.ts`.
