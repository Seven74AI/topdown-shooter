---
baseline_commit: d8ffaee
---

# Story 10.11: Admin players

Status: review

(Added 2026-11-26. Designer: "I'd like to add Admin players. That would get the dev btn so he can do whatever we can do in dev mode but in production." The four decisions AD-1…AD-4 were proposed with a recommendation and the designer answered "Ok with all your recommendation" (2026-11-26), so every one is **A**. Online cheats are a separate story, **10.12** (backlog). Written with `gds-create-story` from the real code at `d8ffaee`.)

## Story

As an admin (a registered account the operator marked as admin),
I want the dev ⚙ cheat panel and the dev link switches in the production game,
so that I can test any wave, weapon, boss or event on a real phone without a dev build.

## Decision log

| # | Decision | Status |
| --- | --- | --- |
| AD-1 | **Who is an admin:** an `is_admin` mark on the `accounts` row, set by an operator command run on the VPS (`admin add / remove / list`). **Registered accounts only** (a `username`); a guest can never be one. Not a username list in env (a deleted account's name could be re-registered by someone else). | **designer 2026-11-26: A** |
| AD-2 | **Where the ⚙ works:** the full panel in **Practice solo**. In an online game only the view tools (Perf overlay, Collision / grid view) work; every other control is greyed with the note "Practice only". Online cheats through the server = Story 10.12. | **designer 2026-11-26: A** |
| AD-3 | (For Story 10.12, not built here) an admin cheat used online → nobody in that room earns rewards for the run; Results says "Admin cheats used". | **designer 2026-11-26: A** |
| AD-4 | **Dev link switches** (`?startwave`, `?bosswave`, `?bosshp`, `?events`, `?shopcards`, `?loot`, `?shopall`, `?zdmg`, `?unlocks`, `?training`, `?devlayer`, `?devlooks`) are honoured for an admin's **Practice solo** runs. Online they stay dev-build-only (they need matching server env and change `balance.version`). | **designer 2026-11-26: A** |
| AD-5 | **No new look.** The admin gets the same ⚙ button and panel as a dev build. No "ADMIN" tag (the designer was offered one and didn't ask for it). | auto (follows the proposal) |

## Acceptance Criteria

1. **DB + command (AD-1).** A new Drizzle migration `0007_<name>.sql` adds `accounts.is_admin boolean NOT NULL DEFAULT false` (generated with `npm run db:generate`, never hand-edited; `migrationJournal.test.ts` stays green). A server command `npm run admin -w @topdown/server -- add <username>` / `remove <username>` / `list` marks, unmarks and lists admins by **case-blind username** (`username_lower`). `add` refuses an unknown username and exits non-zero; a guest row (no username) can't be named, so it can't become admin. Each change logs one line `account_admin { accountId, admin }` (no username, no IP in logs: brief 28 privacy). It is documented in `docs/deploy.md` (the Database section) with the exact VPS command.
2. **Session says it (AD-1).** `POST /account/session` and every route that returns a session (login, recover, logout, upgrade) include `account.admin: boolean`: true only for a registered account with `is_admin`. A guest, an unsaved session and the new guest after a logout get `false`. The field is **optional** in the shared zod schema (`packages/shared/src/net/account.ts`) so an older server still validates. The flag is never put in room state, lobby data, netEvents or anything another player receives.
3. **Panel in production for admins (AD-2).** In a **production build**, once the client's account session says `admin: true`, the client downloads the cheat panel and shows the ⚙ (same place, same backtick key, still hidden on the lobby screen). In **Practice solo** every control works exactly as in a dev build (spawn, skip wave, leave last 5, Behemoth, force events, dev loadout, +500 money, damage building, god mode, perf overlay, grid view, decay stage, blackout, restart with seed). Practice still earns no rewards (unchanged: `rewardsModel.ts` "Practice runs don't earn rewards").
4. **Online: view tools only (AD-2).** In a production build, in an online run, the Perf overlay and Collision / grid view checkboxes work; every other control is `disabled` and the panel shows "Practice only" once at the top (one short line, not per control). Nothing the panel does online changes the client's world or sends a message. **Dev builds keep today's online behaviour** (dev servers use the `DEV_*` env switches; don't regress dev workflows).
5. **Losing admin.** A logout, a login to a non-admin account, or a session that now says `admin: false` (operator ran `remove`, next session fetch) hides the ⚙ and closes the panel on that tab without a reload. God mode / grid view / perf overlay that were on stay as they are until the run ends (they only affect that phone) — or the builder turns them off; record the choice as a B-code.
6. **Dev link switches for admins (AD-4).** In a production build, an admin's Practice solo run honours the dev-only switches listed in AD-4, through the existing solo paths (`GameScene` `!session` branch, `soloBalance()` / `soloOverrides`, `practiceInit`). For a non-admin they stay ignored exactly as today. Online paths stay gated on `import.meta.env.DEV` only: `clientBalance()`'s online use, `?seed` in `net/connection.ts`, `ALLOW_SOLO_START` in `LobbyScreen.tsx`.
7. **Non-admins see and download nothing new.** For a guest or a non-admin account in a production build: no ⚙, no backtick panel, and the browser **never requests** the cheat chunk (checked in a real browser: no network request for it). The entry chunk and `index.html` contain none of `CHEAT_STRINGS`, and not the cheat module's file name.
8. **Release cheat scan updated, not weakened.** `tools/checks/noCheatsInRelease.test.ts` still scans every built file and fails on any cheat string, **except** the one lazy admin chunk (and its CSS), which it finds by a fixed neutral name (e.g. `assets/admin-tools-<hash>.js`). It also asserts that chunk exists (liveness: the panel really is in the build) and that the entry chunk does not contain the strings or the old `DevCheats` name. `__game` and `__gfx` stay **dev-only** (never on `window` in production, even for admins).
9. **Nothing changes for gameplay, the server sim, balance JSON or other players.** No netEvents kinds, no room messages, no balance numbers.

## Tasks / Subtasks

- [x] **T1 Server: the flag (AC 1, 2)**
  - [x] `apps/server/src/db/schema.ts` `accounts`: `isAdmin: boolean("is_admin").notNull().default(false)` (same pattern as `saveNudged`). `npm run db:generate -w @topdown/server` → `0007_*.sql` + snapshot + journal. Never rename a migration (Drizzle skips an older journal `when`); if master gains a `0007` first, regenerate on top of master.
  - [x] `apps/server/src/db/accountsRepo.ts`: add `isAdmin` to `Account` (:28-32) and the `columns` select (:94); add `setAdmin(usernameLower, admin): Promise<{ accountId } | null>` and `listAdmins(): Promise<{ accountId, username }[]>`. Only this repo touches the table (`noDbImports.test.ts`).
  - [x] Session builders: `saved()` in `apps/server/src/auth/guestSession.ts:139-146`, `sessionOf()` in `apps/server/src/auth/accountAuth.ts:130-138`, the logout guest at `accountAuth.ts:262` (`admin: false`), and the upgrade path. Rule: `admin = account.username !== null && account.isAdmin`.
  - [x] `packages/shared/src/net/account.ts:50-69`: `account: { …, admin: z.boolean().optional() }` (covers session, device session, recover through `.options[0]` / `extend`).
- [x] **T2 Server: the command (AC 1)**
  - [x] `apps/server/src/db/adminCli.ts` shaped like `migrateCli.ts` (`databaseFromEnv`, `log.info`, `process.exitCode = 1` on error, `close()`); `"admin": "tsx src/db/adminCli.ts"` in `apps/server/package.json`. Usage text on a bad argument.
  - [x] `docs/deploy.md` › "Database…" section: the VPS command, following `deploy.sh`'s migrate pattern: `docker compose -f deploy/docker-compose.yml run --rm --no-deps server node --import tsx apps/server/src/db/adminCli.ts add <username>` (with `GIT_SHA` from `deploy/.env` as the other compose commands). Say that the change shows on the player's next session fetch (opening the start screen or a reload).
- [x] **T3 Client: knowing you're an admin (AC 2, 5)**
  - [x] `apps/client/src/net/accountStore.ts`: `AccountSnapshot.admin: boolean`; `accept(username, admin)`. Callers: `accountSession()` in `apps/client/src/net/account.ts:83` and `adopt()` (:279-290), upgrade (:291-294). Missing field (older server) = false.
- [x] **T4 Client: lazy admin panel (AC 3, 5, 7, 8)**
  - [x] `apps/client/src/main.ts:266-275`: keep the DEV block (`__game`, `__gfx`, mount) as is. Add a production path: subscribe to `accountStore`; the first time `admin` is true, `import()` the panel and mount it; when it turns false, hide it (an `unmount`/`setVisible` export, or a prop/store the panel reads). Never import it for a non-admin.
  - [x] Give the lazy chunk a **fixed neutral name** so the entry chunk's import/preload list doesn't carry "DevCheats" (e.g. a small entry module `debug/adminTools.ts` that re-exports the mount, plus `build.rollupOptions.output.chunkFileNames` / `manualChunks` in `apps/client/vite.config.ts` so it and `DevCheats.css` land in `assets/admin-tools-<hash>.{js,css}`). Check the real `dist/` output.
  - [x] `DevCheats.tsx`: a `practiceOnlyOnline` flag (true in production, false in dev builds). When it's true and `scene.isOnline`, disable every control except Perf overlay and Collision / grid view, and show the one-line "Practice only" note. The existing per-control `online` guards (decay, blackout, seed) stay.
- [x] **T5 Client: dev link switches for admins (AC 6)**
  - [x] `urlOptions()` caches at boot (`urlOptions.ts:303-306`, first call `main.ts:68`), before the account is known, and `soloBalance()` caches too (`clientBalance.ts:31`). Add a solo-only read that re-parses at each solo start: `parseUrlOptions(location.search, import.meta.env.DEV || accountStore.get().admin)` and make `soloBalance()` / `soloOverrides` (`clientBalance.ts:15-29`) take that `dev` flag instead of `import.meta.env.DEV` (key any cache on it). Use it in GameScene's solo branch (`GameScene.ts:668-708`: `startWave` :675, `loot` :676, `practiceInit` :698, `shopCards` :702, boss/events :704-708, `devLooks` :847, `devLayer` :322).
  - [x] Online stays `import.meta.env.DEV` only: `clientBalance()` online (:15, :37), `net/connection.ts:49`, `LobbyScreen.tsx:18`. Add a unit test proving a production-mode parse with `admin` on still leaves the online balance untouched.
- [x] **T6 Tests (all ACs)**
  - [x] Server (PGlite): CLI add/remove/list, unknown username, case-blind match, guest can't be named; session route returns `admin` true/false; login into an admin account → true; logout → new guest false; upgrade → false. A real-Postgres case in `realPostgresAccounts.test.ts` for the column default (runs in the CI `postgres` job).
  - [x] Shared: schema accepts with and without `admin`.
  - [x] Client unit: `accountStore` admin; `parseUrlOptions` with the admin flag (each AD-4 switch on for admin solo, off for non-admin); `soloBalance` admin vs non-admin; online balance unchanged.
  - [x] `noCheatsInRelease.test.ts` (AC 8): exception for the named chunk only; liveness (chunk exists and contains "Spawn zombies"); entry chunk + `index.html` clean incl. "DevCheats". Prove once with `CHEAT_SCAN_DIR` on a doctored dist that a cheat string in another chunk still fails.
  - [x] Browser (Playwright, preinstalled Chromium) against a **production build** (`vite build` + `vite preview` + a dev server on your own ports, AGENTS §6): (a) guest: no ⚙, no request for `admin-tools-*`; (b) admin (mark the account through the repo or the CLI on the test DB): ⚙ appears, Practice solo `Spawn 50 around me` really spawns (alive count goes up), god mode works, `?startwave=7` starts at wave 7; (c) admin online: only the two view checkboxes enabled, "Practice only" shown; (d) logout → ⚙ gone without reload. Screenshots at deviceScaleFactor 1 for your own check; say what wasn't verified.
- [x] **T7 Hand-back** — `gate:fast`, plus `test:changed` for the touched DOM checks; branch `story-10-11`, PR "Story 10.11: Admin players"; record B-codes for anything you decided (AC 5 cleanup choice, chunk-naming method).

## Dev Notes

### What exists today (read before changing)

- **Cheat panel** `apps/client/src/debug/DevCheats.tsx` (304 lines, Story 1.11 and later). A Preact panel mounted by `mountDevCheats(game)` into `#ui`. It reads `GameScene.debugWorld` / `debugView` / `isOnline` / `runSeed` / `restartRun` and mutates the local world (`spawnRing`, `skipWave`, `forceEvent`, `setLoadout`, `wallet +=`, `world.debug.godMode`, …). It hides the gear on the lobby screen (:58-59); backtick toggles it (:64-70). **None of what it uses is DEV-stripped**: GameScene's debug getters (:1019-1044), `LocalSimHost`, `perf`, `CollisionGridView` and `devCheatActions` are ordinary code, so the panel works in a production bundle once it's imported.
- **Mount** `apps/client/src/main.ts:266-275`: `if (import.meta.env.DEV) { __game, __gfx, import("./debug/DevCheats") }`. Vite drops the block and the chunk in production.
- **Online today:** the panel acts on the client's mirror world, which the server overwrites (that's why decay, blackout and seed are already disabled online). In production that's misleading, hence AC 4.
- **Solo = Practice solo.** `GameSceneData` `{ mode?: "solo" } | { mode: "online", session }` (GameScene.ts:194-201); `this.mode = session ? "online" : "solo"` (:662); `isOnline` getter (:1034). No separate "practice" flag. Solo starts from StartScreen `startSolo` → `BootScene.startSolo()` (:91-106), or directly from `?solo/?stress/?loadout/?tune` links (`skipsStartScreen`, BootScene.ts:78) **before** the account session is known.
- **Session:** `POST /account/session` (`accountRoutes.ts:73-89` → `resolveGuestSession`, `guestSession.ts:51`), fetched on StartScreen mount (`StartScreen.tsx:71`) and before each Create/Join (`account.ts:105`). Validated with `accountSessionResponseSchema.safeParse` (`apps/client/src/net/account.ts:78`). The schema isn't strict, so adding a field is safe.
- **Merge / delete:** guest→account merge (`deviceTokensRepo.ts:77-98`, `meta/merge.ts`) only merges `progress` columns; the flag lives on `accounts`, follows a login and dies with a delete. Nothing to add there.

### Known limit (record as B-code if you keep it)

A direct `?solo&startwave=7` link starts before the session fetch, so the first run from such a link has the switches off for an admin. Starting Practice from the start screen, or Restart, picks them up. Don't delay the boot for everyone to fix this; an acceptable fix is a short await of the session only when the URL has a dev switch.

### Security notes

- The real protection is that nothing an admin can do from the panel pays rewards (Practice earns nothing) or reaches another player (no messages). The cheat chunk itself is public once downloaded; that's fine.
- Never trust a client claim of admin anywhere on the server; this story adds no server-side admin action (10.12 will check `is_admin` on the server).
- The flag is only in the player's **own** session response.

### Code rules (AGENTS §5)

No per-frame allocation, no gameplay numbers inline, Phaser 4 types, exact version pins (no new deps expected). Every texture through `addGeneratedTexture` (the panel draws none). Ports: never `npm run dev`; own client/server ports; stop processes by PID.

### Testing standards

`gate:fast` + `test:changed`; no test over 30 s; PGlite repo tests like `db.test.ts`; real-Postgres tests skip without `TEST_DATABASE_URL` (CI `postgres` job runs them). The release check runs with `REQUIRE_DIST=1` after a fresh build (`npm run release:check`).

### Project Structure Notes

- New: `apps/server/src/db/adminCli.ts`, `apps/server/drizzle/0007_*.sql` (+ meta), `apps/client/src/debug/adminTools.ts` (neutral lazy entry).
- Changed: `schema.ts`, `accountsRepo.ts`, `guestSession.ts`, `accountAuth.ts`, `packages/shared/src/net/account.ts`, `accountStore.ts`, `account.ts` (client), `main.ts`, `DevCheats.tsx`, `clientBalance.ts`, `urlOptions.ts`, `GameScene.ts` (solo branch only), `vite.config.ts`, `noCheatsInRelease.test.ts`, `docs/deploy.md`.

### References

- Designer request and AD-1…AD-4: this session, 2026-11-26; epics.md › Story 10.11 / 10.12.
- [Source: apps/client/src/debug/DevCheats.tsx], [Source: apps/client/src/main.ts#266], [Source: tools/checks/noCheatsInRelease.test.ts], [Source: apps/client/src/debug/urlOptions.ts#185-306], [Source: apps/client/src/debug/clientBalance.ts], [Source: apps/server/src/db/schema.ts#accounts], [Source: apps/server/src/auth/guestSession.ts#139], [Source: apps/server/src/auth/accountAuth.ts#130], [Source: packages/shared/src/net/account.ts#50], [Source: docs/deploy.md#Database], [Source: AGENTS.md §2–§6].

## Dev Agent Record

### Agent Model Used

Claude (builder session, `gds-dev-story`), 2026-11-26.

### Debug Log References

- `npm run gate:fast` on the merged tree (story + master 71bbe8e): typecheck + lint + unit 512 files / 4937 tests passed, `release:check` 5/5 passed.
- `npm run test:changed`: 585 files / 5677 tests passed.
- Real PostgreSQL 16 (local, `TEST_DATABASE_URL`, `--no-file-parallelism`): `realPostgres*` + `realPg` 5 files / 42 tests passed (incl. the new is_admin case).
- Release scan proof: `CHEAT_SCAN_DIR` on a copy of `dist/` with `/* Spawn zombies */` appended to `urlOptions-*.js` → the scan fails naming that file; the real dist passes.
- Browser (Playwright + preinstalled Chromium, production `vite build` + `vite preview` on :4611 with an `/api` proxy, server on :2611 on a local PostgreSQL; processes stopped by PID): see Completion Notes.

### Implementation Plan / decisions (B-codes)

- **B1 (chunk naming):** `src/debug/adminTools.ts` re-exports the panel's mount; `vite.config.ts` `build.rollupOptions.output.chunkFileNames` / `assetFileNames` functions name that chunk and its CSS `assets/admin-tools-<hash>.{js,css}`; every other file keeps Vite's default name (checked: same names as before). Dev builds load the same entry at boot.
- **B2 (AC 5 cleanup):** when the admin mark goes, the ⚙ and the backtick key go, the open panel closes, and the panel turns OFF what it turned on for this phone: Collision / grid view and god mode (on the current world). The Perf overlay is left as it is (it is also a release feature through `?debug=1`).
- **B3 (unsaved reply):** a `saved: false` session reply (save server down) drops the admin mark (`accountStore.dropAdmin()`), as AC 2 says an unsaved session is never an admin; a failed / offline fetch (no reply) changes nothing.
- **B4 (direct links, the Dev Notes "known limit" fixed):** a production direct solo link (`?solo` / `?stress` / `?loadout` / `?tune`) that ALSO names one of the AD-4 switches waits for the session fetch (≤ 3 s, its own timeout) before starting, so an admin's first run honours it. Every other link starts at once as before; dev builds never wait.
- **B5 (online lock):** in a production online run every control except Perf overlay and Collision / grid view is `disabled` and its handler also returns early; one "Practice only" line at the top; the three existing "Online: … DEV_* on a dev server" hints are hidden in that mode (they describe dev servers). Dev builds keep today's online panel.
- **B6 (repo shape):** the admin reads/writes are a separate `adminsRepo()` in `accountsRepo.ts` (only the CLI uses it), so the `AccountsRepo` interface and its test fakes are unchanged; `Account.isAdmin` is optional (absent in fakes = false) and only `isAdminAccount()` reads it (`username !== null && isAdmin`).
- **B7 (CLI exit codes):** unknown username → exit 1 (`no registered account named "…"`); bad arguments → usage, exit 2; database error → `admin_command_failed`, exit 1. `list` prints usernames to the operator's terminal only (never logged).

### Completion Notes List

- Story context created with `gds-create-story` (main session, 2026-11-26).
- T1/T2: migration `0007_admin.sql` (generated: `ALTER TABLE "accounts" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL`); `npm run admin -w @topdown/server -- add|remove|list`; `account_admin {accountId, admin}` log; docs/deploy.md › Database "Admins (Story 10.11)" with the VPS compose command.
- Session replies: `/account/session` (`guestSession.saved`), login / recover (`sessionOf`), logout's new guest (`admin: false`) carry `account.admin`; the shared schema field is optional. Upgrade answers no session; the client sets admin false there.
- Client: `accountStore.admin`; `debug/adminGate.ts` (production) loads `adminTools` on the first admin answer, shows/hides it after; `main.ts` keeps `__game` / `__gfx` dev-only.
- AD-4: `debug/soloDevSwitches.ts` (`soloDevAllowed()`, `soloUrlOptions()`), `soloBalance(dev)` cached per flag; GameScene's solo branch, `?devlayer` (now a per-run field) and `?devlooks` read it; online keeps `urlOptions()` / `clientBalance()` / `connection.ts` / `LobbyScreen` on `import.meta.env.DEV` only (unit test in production mode: an admin's solo balance changes, `clientBalance()` stays the bundled version, `urlOptions()` still ignores the switches).
- Tests added: `apps/server/src/auth/adminSession.test.ts` (6: CLI add/remove/list case-blind, log fields, unknown name, usage, guest never matched, session/login/recover/logout flags, no leak to another device), real-PostgreSQL case in `realPostgresAccounts.test.ts`, `packages/shared/src/net/accountAdmin.test.ts`, `apps/client/src/debug/adminPlayers.test.ts` (8), `noCheatsInRelease.test.ts` (+2: chunk liveness incl. "Practice only" and no `__game`/`__gfx`; entry chunk + index.html clean). Existing exact-shape asserts updated for the new field.
- Browser, production build: (a) guest: no ⚙ on start screen or in a Practice run, backtick opens nothing, **0 requests** for `admin-tools-*`; (b) after `upgrade` + `admin add <NAME in upper case>` + reload with `?startwave=7`: the browser requested `admin-tools-*.js` + `.css`, ⚙ shown; Practice solo: HUD "Wave 7 in 25 s", "Spawn 50 around me" → alive 0 → 50, god mode stays checked (world flag), 0 controls locked except the build-phase decay select; (c) admin hosts online with a second (guest) player, both Ready, Start: no ⚙ in the lobby; in the run only "Perf overlay" and "Collision / grid view" are enabled (19 disabled), one "Practice only" line; both view tools toggled on/off; (d) admin tab with the panel open → Log out through the account screen → ⚙ and panel gone, backtick opens nothing, no navigation/reload.
- Not verified: a real phone; `admin remove` seen by a tab mid-run (covered by the unit test of the gate: a session saying `admin: false` hides it; the change shows at the next session fetch, which happens on the start screen / before Create or Join); the docker/VPS form of the command (CI's docker job builds the image; the compose command mirrors deploy.sh's migrate line); sprint-status.yaml left for the main session (docs-only commit at merge, AGENTS §2).

### File List

- New: `apps/server/drizzle/0007_admin.sql`, `apps/server/drizzle/meta/0007_snapshot.json`, `apps/server/src/db/adminCli.ts`, `apps/server/src/db/adminCommand.ts`, `apps/server/src/auth/adminSession.test.ts`, `packages/shared/src/net/accountAdmin.test.ts`, `apps/client/src/debug/adminTools.ts`, `apps/client/src/debug/adminGate.ts`, `apps/client/src/debug/soloDevSwitches.ts`, `apps/client/src/debug/adminPlayers.test.ts`
- Changed: `apps/server/drizzle/meta/_journal.json`, `apps/server/package.json`, `apps/server/src/db/schema.ts`, `apps/server/src/db/accountsRepo.ts`, `apps/server/src/db/deviceTokensRepo.ts`, `apps/server/src/auth/guestSession.ts`, `apps/server/src/auth/accountAuth.ts`, `packages/shared/src/net/account.ts`, `apps/client/src/net/accountStore.ts`, `apps/client/src/net/account.ts`, `apps/client/src/main.ts`, `apps/client/src/debug/DevCheats.tsx`, `apps/client/src/debug/clientBalance.ts`, `apps/client/src/scenes/GameScene.ts`, `apps/client/src/scenes/BootScene.ts`, `apps/client/vite.config.ts`, `tools/checks/noCheatsInRelease.test.ts`, `docs/deploy.md`
- Tests updated for the new field / code shape: `apps/server/src/auth/accountAuth.test.ts`, `apps/server/src/auth/accountDelete.test.ts`, `apps/server/src/auth/accountRoutes.test.ts`, `apps/server/src/db/db.test.ts`, `apps/server/src/db/deviceTokens.test.ts`, `apps/server/src/db/realPostgresAccounts.test.ts`, `apps/client/src/net/accountActions.test.ts`, `apps/client/src/net/accountGone.test.ts`, `apps/client/src/scenes/lookWiring.test.ts`, `tools/checks/accountUpgradeWiring.test.ts`

### Change Log

- 2026-11-26: Story 10.11 built (status → review).
- 2026-11-26: Review fixes (test-only + one mount option): L1 `mountDevCheats(game, { visible, practiceOnlyOnline })` (default: production yes, dev no) + `tools/checks/adminPanelDomLayout.test.ts` (real Chromium: online → only Perf overlay + Collision / grid view enabled, one "Practice only"; solo → nothing locked; proven to fail with the lock removed); L2 the real-PostgreSQL case now adds the admin through `runAdminCommand` with the upper-case name; N1 the release scan exempts `admin-tools-*` only directly in `DIST/assets` (a nested copy now fails, checked on a doctored dist).

## Senior Developer Review (AI)

**Reviewer:** fresh cloud session, `gds-code-review` (Blind Hunter, Edge Case Hunter, Acceptance Auditor), 2026-11-26.
**Tree:** `story-10-11` @ `d49685f` merged locally with master `4362482` (not pushed). Clean merge.
**Verdict: APPROVED.** No high and no medium findings. Two lows (test coverage) and one nit, none blocking. None changes behaviour.

### Checks run

- `npm run release:check` on the merged tree: build + scan 5/5 passed.
- `npm run test:changed` (3 workers): 588 files / 5704 tests passed, 6 files / 47 tests skipped (real-PG without `TEST_DATABASE_URL`, release scan without `REQUIRE_DIST`). The real-PostgreSQL case is left to the CI `postgres` job.
- `drizzle-kit generate` on the merged tree: "No schema changes" (0007 matches `schema.ts`). Journal `when` values increase (…398855 → 1795702746683); `0007_snapshot.prevId` = `0006_snapshot.id`; snapshot has `is_admin boolean NOT NULL DEFAULT false`.
- Release scan probes (`CHEAT_SCAN_DIR` on copies of the real dist): `/* God mode */` added to `consumableIcons-*.js` → "contains none … outside the admin-tools chunk" fails and names that file. Deleting `admin-tools-*.js` → the liveness test fails. The real dist passes.
- `apps/client/dist` by hand: `admin-tools-ex9huHj7.js` (9.9 KB) + `admin-tools-CpbeoIXb.css` are the only files that hold cheat strings. `grep -r "__game\|__gfx" dist` finds nothing. `index.html` doesn't name `admin-tools`. `main-*.js` reaches it only through `import("./admin-tools-….js")` inside `installAdminGate`'s loader (dynamic import, no static import or modulepreload). The admin chunk imports from `main-*` / `urlOptions-*`, never the other way.
- No browser run: the builder's Playwright checks (a)–(d) cover it, and the code paths below confirm them statically.

### Security / boundary probes (E8-A3: each claim checked against the diff)

| Claim | Evidence |
| --- | --- |
| `admin` only in the player's own session replies | `grep -rln "isAdmin\|is_admin\|\.admin\b" apps/server/src packages/shared/src` (non-test): only `schema.ts`, `accountsRepo.ts`, `deviceTokensRepo.ts` (select columns), `guestSession.ts` `saved()`, `accountAuth.ts` `sessionOf()` + logout. No hit in `run/`, rooms, lobby or netEvents. No `...account` spread or account object logged anywhere in `apps/server/src`. Test "never in another device's session" (`adminSession.test.ts:132`). |
| Guest can never be admin | `isAdminAccount` = `username !== null && isAdmin === true` (`accountsRepo.ts`). `setAdmin` filters `isNotNull(username)`. Logout guest is hard-coded `admin: false` (`accountAuth.ts:262`). Client `accept()` forces false without a username (`accountStore.ts`). Upgrade → `accept(name, false)`. |
| A forged or old client gains nothing | The server never reads a client admin claim (no route takes it). The shared schema field is optional (`account.ts` shared), so an old server's reply → `undefined` → false. A client that forces its own store only unlocks Practice-only tools: Practice pays nothing, and no message is sent. |
| Online lock (B5) | Every control except Perf overlay and Collision / grid view gets `disabled={locked}`, and each handler checks `!locked`: spawn ×2, skip wave, leave last 5, Behemoth, 2× force event, loadout, +money, damage building, god mode, seed input. Decay, blackout and Restart were already `online`-disabled. Backtick only toggles `open`. `PRACTICE_ONLY_ONLINE = !import.meta.env.DEV`, so dev builds are unchanged. |
| Losing admin (B2/B3) | `adminGate.apply` → `panel.setVisible(false)` → the panel renders `null`, the key listener is removed (effect on `[visible]`), `setOpen(false)` runs and `dropCheatState` turns off grid view + god mode. Logout/login go through `adopt()`. `saved:false` → `dropAdmin()`. Failed fetch / non-200 → `return null` before any store write (no change, as B3 says). Account delete reloads the page (`deleteProgress.ts`). Race test `adminPlayers.test.ts:81`. |
| AD-4 solo only | `GameScene.create` (one synchronous call): `soloDev = !session && soloDevAllowed()`; online uses `urlOptions()` + `clientBalance()`. `connection.ts:45-48` and `LobbyScreen` are untouched (still `urlOptions()` = `import.meta.env.DEV`). `soloBalance` cache is a `Map<boolean, Balance>` keyed on `dev`. `soloUrlOptions` returns `urlOptions()` when `!dev`. `practicePool.ts:32-33` reads `opts.unlocks/training` from the solo opts. Test `adminPlayers.test.ts:148`. |
| B4 wait | Only `!DEV && skipsStartScreen && urlHasDevSwitch(search)`. `accountSession()` never throws (everything sits inside `try`, the 3 s `AbortController` also covers `res.json()`), so `.finally(startSolo)` always runs within ~3 s, offline too. `startGame` keeps its `this.starting` guard. Normal players (no dev key in the URL) and dev builds take the old path unchanged. |
| CLI / privacy | `account_admin {accountId, admin}` is the only log line. `admin_command_failed {err}` holds a DB error message (no player data). Usernames go only to the operator's stdout. Exit 1 for an unknown name, 2 for usage. The docs command mirrors `deploy.sh:69`'s migrate line (`run --rm --no-deps server node --import tsx …`; `deploy/.env` supplies `GIT_SHA`). |

### Findings

1. **[low] No automated test of the production online lock (AC 4 / B5).** `apps/client/src/debug/DevCheats.tsx:51` `PRACTICE_ONLY_ONLINE = !import.meta.env.DEV` is always false under vitest, and no test renders the panel with `locked`. *Failure scenario:* a later story adds a panel control without `disabled={locked}` and a `!locked` guard. Admins can then use it online against the mirror world, and only a manual browser check would catch it. *Minimal fix:* let `mountDevCheats(game, visible, { practiceOnlyOnline = !import.meta.env.DEV } = {})` pass the flag as a prop, then add a DOM test with a fake online Game scene. The test asserts that every `button/select/input` in `.dev-cheats` is disabled except the two view checkboxes, and that "Practice only" shows once.
2. **[low] The real-PG case's "case-blind" step is a no-op.** `apps/server/src/db/realPostgresAccounts.test.ts:139` passes `n.toUpperCase().toLowerCase()`, which equals `n`. Case-blind matching is really done (and tested) in `runAdminCommand` (PGlite, `adminSession.test.ts:66`). *Fix:* pass `n` and drop "case-blind" from the test title, or have the case call `runAdminCommand(["add", n.toUpperCase()], adminsRepo(database), …)`.
3. **[nit] `ADMIN_CHUNK` exempts any `assets/admin-tools-*` path at any depth** (`tools/checks/noCheatsInRelease.test.ts:42`, `(^|[\\/])assets[\\/]`). Today only the root `assets/` holds such files. If you want it tighter, anchor it to `join(DIST, "assets")`. Optional.

No other issue found. AC 1–9 are met (AC 7's browser part rests on the builder's Playwright run plus the static check above).
