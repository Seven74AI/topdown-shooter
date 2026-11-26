---
baseline_commit: d8ffaee
---

# Story 10.11: Admin players

Status: ready-for-dev

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

- [ ] **T1 Server: the flag (AC 1, 2)**
  - [ ] `apps/server/src/db/schema.ts` `accounts`: `isAdmin: boolean("is_admin").notNull().default(false)` (same pattern as `saveNudged`). `npm run db:generate -w @topdown/server` → `0007_*.sql` + snapshot + journal. Never rename a migration (Drizzle skips an older journal `when`); if master gains a `0007` first, regenerate on top of master.
  - [ ] `apps/server/src/db/accountsRepo.ts`: add `isAdmin` to `Account` (:28-32) and the `columns` select (:94); add `setAdmin(usernameLower, admin): Promise<{ accountId } | null>` and `listAdmins(): Promise<{ accountId, username }[]>`. Only this repo touches the table (`noDbImports.test.ts`).
  - [ ] Session builders: `saved()` in `apps/server/src/auth/guestSession.ts:139-146`, `sessionOf()` in `apps/server/src/auth/accountAuth.ts:130-138`, the logout guest at `accountAuth.ts:262` (`admin: false`), and the upgrade path. Rule: `admin = account.username !== null && account.isAdmin`.
  - [ ] `packages/shared/src/net/account.ts:50-69`: `account: { …, admin: z.boolean().optional() }` (covers session, device session, recover through `.options[0]` / `extend`).
- [ ] **T2 Server: the command (AC 1)**
  - [ ] `apps/server/src/db/adminCli.ts` shaped like `migrateCli.ts` (`databaseFromEnv`, `log.info`, `process.exitCode = 1` on error, `close()`); `"admin": "tsx src/db/adminCli.ts"` in `apps/server/package.json`. Usage text on a bad argument.
  - [ ] `docs/deploy.md` › "Database…" section: the VPS command, following `deploy.sh`'s migrate pattern: `docker compose -f deploy/docker-compose.yml run --rm --no-deps server node --import tsx apps/server/src/db/adminCli.ts add <username>` (with `GIT_SHA` from `deploy/.env` as the other compose commands). Say that the change shows on the player's next session fetch (opening the start screen or a reload).
- [ ] **T3 Client: knowing you're an admin (AC 2, 5)**
  - [ ] `apps/client/src/net/accountStore.ts`: `AccountSnapshot.admin: boolean`; `accept(username, admin)`. Callers: `accountSession()` in `apps/client/src/net/account.ts:83` and `adopt()` (:279-290), upgrade (:291-294). Missing field (older server) = false.
- [ ] **T4 Client: lazy admin panel (AC 3, 5, 7, 8)**
  - [ ] `apps/client/src/main.ts:266-275`: keep the DEV block (`__game`, `__gfx`, mount) as is. Add a production path: subscribe to `accountStore`; the first time `admin` is true, `import()` the panel and mount it; when it turns false, hide it (an `unmount`/`setVisible` export, or a prop/store the panel reads). Never import it for a non-admin.
  - [ ] Give the lazy chunk a **fixed neutral name** so the entry chunk's import/preload list doesn't carry "DevCheats" (e.g. a small entry module `debug/adminTools.ts` that re-exports the mount, plus `build.rollupOptions.output.chunkFileNames` / `manualChunks` in `apps/client/vite.config.ts` so it and `DevCheats.css` land in `assets/admin-tools-<hash>.{js,css}`). Check the real `dist/` output.
  - [ ] `DevCheats.tsx`: a `practiceOnlyOnline` flag (true in production, false in dev builds). When it's true and `scene.isOnline`, disable every control except Perf overlay and Collision / grid view, and show the one-line "Practice only" note. The existing per-control `online` guards (decay, blackout, seed) stay.
- [ ] **T5 Client: dev link switches for admins (AC 6)**
  - [ ] `urlOptions()` caches at boot (`urlOptions.ts:303-306`, first call `main.ts:68`), before the account is known, and `soloBalance()` caches too (`clientBalance.ts:31`). Add a solo-only read that re-parses at each solo start: `parseUrlOptions(location.search, import.meta.env.DEV || accountStore.get().admin)` and make `soloBalance()` / `soloOverrides` (`clientBalance.ts:15-29`) take that `dev` flag instead of `import.meta.env.DEV` (key any cache on it). Use it in GameScene's solo branch (`GameScene.ts:668-708`: `startWave` :675, `loot` :676, `practiceInit` :698, `shopCards` :702, boss/events :704-708, `devLooks` :847, `devLayer` :322).
  - [ ] Online stays `import.meta.env.DEV` only: `clientBalance()` online (:15, :37), `net/connection.ts:49`, `LobbyScreen.tsx:18`. Add a unit test proving a production-mode parse with `admin` on still leaves the online balance untouched.
- [ ] **T6 Tests (all ACs)**
  - [ ] Server (PGlite): CLI add/remove/list, unknown username, case-blind match, guest can't be named; session route returns `admin` true/false; login into an admin account → true; logout → new guest false; upgrade → false. A real-Postgres case in `realPostgresAccounts.test.ts` for the column default (runs in the CI `postgres` job).
  - [ ] Shared: schema accepts with and without `admin`.
  - [ ] Client unit: `accountStore` admin; `parseUrlOptions` with the admin flag (each AD-4 switch on for admin solo, off for non-admin); `soloBalance` admin vs non-admin; online balance unchanged.
  - [ ] `noCheatsInRelease.test.ts` (AC 8): exception for the named chunk only; liveness (chunk exists and contains "Spawn zombies"); entry chunk + `index.html` clean incl. "DevCheats". Prove once with `CHEAT_SCAN_DIR` on a doctored dist that a cheat string in another chunk still fails.
  - [ ] Browser (Playwright, preinstalled Chromium) against a **production build** (`vite build` + `vite preview` + a dev server on your own ports, AGENTS §6): (a) guest: no ⚙, no request for `admin-tools-*`; (b) admin (mark the account through the repo or the CLI on the test DB): ⚙ appears, Practice solo `Spawn 50 around me` really spawns (alive count goes up), god mode works, `?startwave=7` starts at wave 7; (c) admin online: only the two view checkboxes enabled, "Practice only" shown; (d) logout → ⚙ gone without reload. Screenshots at deviceScaleFactor 1 for your own check; say what wasn't verified.
- [ ] **T7 Hand-back** — `gate:fast`, plus `test:changed` for the touched DOM checks; branch `story-10-11`, PR "Story 10.11: Admin players"; record B-codes for anything you decided (AC 5 cleanup choice, chunk-naming method).

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

### Debug Log References

### Completion Notes List

- Story context created with `gds-create-story` (main session, 2026-11-26).

### File List
