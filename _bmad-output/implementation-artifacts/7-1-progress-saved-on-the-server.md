---
baseline_commit: 1fade848628c7738a860d491f1ca3e9ccdfb744f
---

# Story 7.1: Progress saved on the server

Status: in-progress

<!-- Epic 7 progression story 1 of 7 (7.1–7.7). Story file 2026-11-24 (gds-create-story, non-interactive) from the real code on master 7385b47. Designer decisions D1–D12 (docs/epic-7-decisions.md, docs/ideas/epic-7/proposal.md § 0) are rules here, not questions. New decisions: "Decisions to confirm" below and docs/epic-7-story-decisions-progress.md. Order of work: Epic 6 (landing) → Network pass (8.8, 8.9, 8.1, 8.10, 8.11) → Epic 7. -->

## Story

As a player,
I want the game to remember me on my phone without signing up,
so that my progress is kept from my very first run.

> **Brief.** Epic 7 has no brief of its own yet (open question in `docs/epic-7-story-decisions-progress.md`). These lines of the EPIC 6 BRIEF (`docs/epic-6-brief.md`) apply as written; reviewers check each one: **1** (own cloud session, branch `story-7-1`, assigned ports, one full gate at the end), **3** (each fairness rule below is a test), **4** (beat the rule), **9** (every new test is mutated once), **17** (Colyseus: `ServerError(526)` for join refusals, `this.net.guard`), **18** (dev switches; say plainly what was not verified: the VPS steps run on the VPS, by Hermes), **19** (Notes for the merge), **29** (hand-back with `send_message` to `@parent`), **32** (read decision lines newer than this file; merge master before the final gate).

> **Scope:** the database arrives (PostgreSQL 18, Drizzle), two tables, a guest account per device, the guest token in a 1-year server cookie next to the `localStorage` copy, a small account HTTP API, a short-lived **session ticket** in the Colyseus join options, nightly backups. **No** Supplies, unlocks or screens (7.2–7.7). In play nothing changes for the player except their name being remembered across devices' storage wipes.

## Acceptance Criteria

### Fairness / player-visible rules (each is a test)

- **P1 "I never have to sign up to keep my progress."** The first online visit makes a guest account and an empty progress row by itself; no form, no extra tap.
- **P2 "Safari's 7-day wipe doesn't lose me."** With `localStorage` cleared but the cookie kept, the device finds the same account; with the cookie gone but `localStorage` kept, the same account too (designer D9). Both are written back after either one finds it.
- **P3 "If the save server is down, we still play."** When the database can't be reached, Create / Join / Practice still work; the run is marked "not saved" (7.2 shows it on Results). A database outage never refuses a join and never stops a tick.
- **P4 "Nobody can be me by guessing."** The guest token is 128 random bits (`crypto.getRandomValues`), only its SHA-256 is stored, the cookie is HttpOnly (page scripts can't read it), and the room trusts only a server-signed ticket, never an account id sent by the client.
- **P6 "One identity for everything I keep."** The account found from the guest token (cookie or `localStorage`) owns all saved progress: Supplies, unlocks, Training, districts, and the other writer's look (7.9/7.10), milestone items and stats (7.11) and loot items (7.12). No story keeps its own device-side identity; a device without an account (database down) keeps nothing.
- **P5 "A restart or a deploy never loses progress."** Progress lives in PostgreSQL on a named volume; a server restart (test: two test servers on one database, one after the other) finds the same account; a nightly backup keeps 14 days, with copies off the VPS (NFR13).

### Behaviour

1. **Database in dev and deploy.** `deploy/docker-compose.yml` gains a `postgres` service (PostgreSQL 18, exact image tag, named volume `pgdata`, not published to the host, `POSTGRES_PASSWORD` from `deploy/.env`, a healthcheck; `server` `depends_on` it healthy). The server connects with Drizzle ORM (`pg` driver) from `DATABASE_URL`. `npm run db:migrate` applies versioned Drizzle Kit migrations (`apps/server/drizzle/`). Without `DATABASE_URL` outside production the server uses an embedded PGlite database (decision 7.1 D1), so `npm run dev`, builders and Vitest need no Docker; in production a missing `DATABASE_URL` stops the server at start with a clear log line.
2. **Migration 0001** creates only `accounts` (id, username nullable, password_hash nullable, recovery_code_hash nullable, guest_token_hash unique, display_name, created_at) and `progress` (account_id PK/FK, supplies int 0, lifetime_supplies int 0, unlocks jsonb `[]`, training jsonb `{}`, districts jsonb `[]`, updated_at). `unlocks` holds only **bought** unlock ids; the starter pool is data in `progression.json` (decision 7.1 D4), so a new progress row is "starter pool only" by definition.
3. **`progression.json`** (`packages/shared/src/config/progression.json` + `progression.ts`, zod-validated, beside `cosmetics.json`) starts with `starterPool` (the 13 FR79 ids: `pistol, machete, fire_axe, shotgun, smg, hunting_rifle, body_armor_1, running_shoes, revive_kit, wood_barricade, auto_turret, medkit, grenades`) and a test that each id exists in `weapons.json` / `gear.json` / `buildings.json` / `consumables.json`. Later stories add `supplies` (7.2), `unlocks` (7.3), `training` (7.5), `districts` (7.7).
4. **Account HTTP API** (`apps/server/src/auth/`, routes on the existing `createRouter` in `app.ts:33`): `POST /account/session` (body `{ deviceToken?: string }`, the `localStorage` copy). The server reads the `tdg` cookie first, then `deviceToken`; the first that matches an account wins (decision 7.1 D3); if neither matches, it keeps the valid presented token (an existing phone keeps the identity it already has from Story 2.3 / 8.1) or mints a new one, creates the guest account + progress row. It responds with `Set-Cookie: tdg=<token>; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=31536000` (renewed on every call) and `{ deviceToken, ticket, account: { displayName, username|null }, saved: true }`. The browser path is `/api/account/session` (Caddy and Vite strip `/api`, `deploy/Caddyfile` `handle_path /api/*`; the server sees `/account/session`).
5. **Session ticket.** `ticket` = `base64url(accountId.expiresAtMs).HMAC-SHA256(SESSION_SECRET)`, valid **10 min** (decision 7.1 D2). The client calls `/account/session` before every Create / Join (and on start-up) and puts `ticket` in the join options; `joinOptionsSchema` (`packages/shared/src/net/messages.ts:148`) gains `ticket: z.string().max(200).optional()`. `RunRoom.checkAuth` (`RunRoom.ts:239`) verifies it (bad or expired → no account, **not** a refusal: P3) and `RunAuth` (`RunRoom.ts:124`) gains `accountId: string | null`; `Member` (`run/lobby.ts:10`) too. `SESSION_SECRET` is required in production (deploy/.env, generated by `deploy.sh` on first run), random per start in dev.
6. **Seat identity.** A member's identity key is `acct:<accountId>` with a valid ticket, else `guest:<guestTokenHash>` (today's `guestTokenHash`, kept for unsaved play). The `already_joined` check (`RunRoom.ts:332`) and, once 8.1 has landed, its takeover and `rememberedSeats` use this key (check at build time). A token copied from another device = that account (decision 7.1 D5).
7. **Display name.** The start screen's name field (`StartScreen.tsx:7`, `topdown.name` in `localStorage`) is prefilled from `account.displayName` when empty; the name used at a successful join is saved as `display_name` (server side, in `onJoin`, async, best effort).
8. **Database only through repositories** in `apps/server/src/db/` (`schema.ts`, `client.ts`, `accountsRepo.ts`, `progressRepo.ts`, `migrate.ts`); rooms and routes never import Drizzle tables directly (a lint rule or a test that greps imports).
9. **No stall.** All database calls are `async` off the tick: `RunRoom.onTick` never awaits; `onAuth` awaits the ticket check only (pure HMAC, no database). Every repository call has a **2 s** timeout and logs `db_error {op}` at `error` level.
10. **Limits.** `POST /account/session` creating a **new** guest: at most **20 per IP per hour** (`SlidingWindowLimiter`, `net/rateLimit.ts:50`; decision 7.1 D6), beyond it the device plays unsaved. Bodies stay under the 2 KB guard (`net/httpGuard.ts:4`). `/account/*` POSTs check the `Origin` header with `originAllowed` (`net/origin.ts:35`) when `PUBLIC_ORIGIN` is set (CSRF).
11. **Backups (VPS, by Hermes).** `deploy/backup.sh`: `pg_dump -Fc` from the postgres container into `/root/backups/topdown/YYYY-MM-DD.dump`, deletes files older than 14 days, copies the new file off the VPS (target: decision 7.1 D7); a cron line at 03:30 Europe time; `deploy/restore.sh` restores a dump into a scratch database and prints row counts. `docs/deploy.md` gains "Database: first start, migrations, backups, restore test"; `deploy.sh` runs `db:migrate` in a one-off container **before** `up -d`. Hermes runs the restore test once and records the result in the doc (the builder can't reach the VPS: say so in the hand-back).

## Tasks / Subtasks

- [x] **T1 Dependencies** (AC 1): `drizzle-orm` 0.45, `pg` 8.23 (architecture › Persistence), `drizzle-kit`, `@electric-sql/pglite` (dev/test), exact pins (`.npmrc save-exact`), versions at least two weeks old. Root scripts `db:generate`, `db:migrate`; `apps/server/drizzle.config.ts`.
- [x] **T2 Schema + migration** (AC 2): `apps/server/src/db/schema.ts`, migration 0001 generated by Drizzle Kit and committed; `migrate.ts` (programmatic migrator for both drivers).
- [x] **T3 Repositories** (AC 8, 9): `accountsRepo` (`findByTokenHash`, `createGuest(tokenHash, name)`, `setDisplayName`), `progressRepo` (`get(accountId)`, `createEmpty`), the 2 s timeout wrapper, `db_error` log; a test that no file outside `src/db/` imports `drizzle-orm` or `db/schema`.
- [x] **T4 progression.json** (AC 3): file, zod schema, `progression.ts` export (`PROGRESSION`, `starterPool`), id-exists test. Not part of `balanceVersion` until a story puts a gameplay number in it (7.5 does: see its notes).
- [x] **T5 Account HTTP API** (AC 4, 5, 10): `auth/guestSession.ts` (cookie/token resolution, D3), `auth/ticket.ts` (sign/verify, constant-time compare), route `POST /account/session` in `app.ts` (verify `createEndpoint`'s cookie and header API in `node_modules/@colyseus/core` / better-call before writing it), the new-guest limiter (reset in `test/bootTestServer.ts:21-29`), Origin check.
- [ ] **T6 Room** _(HELD: early start, waits for 8.1 on master, brief 29)_ (AC 5, 6, 7): `joinOptionsSchema.ticket`; `checkAuth` → `accountId`; `Member.accountId` + identity key; `already_joined` by key; display name save in `onJoin`; logs `join_account {accountId|null}` (never the token).
- [ ] **T7 Client** _(HELD: early start, waits for 8.1 on master)_ (AC 4, 5, 7; P2, P3): `apps/client/src/net/account.ts` (`fetch("/api/account/session", { method: "POST", credentials: "same-origin" })`, 3 s timeout, try/catch; on failure join without a ticket), `guestToken.ts` keeps its key and format and writes back the server's `deviceToken`; `connection.ts options()` (`connection.ts:39-48`) adds `ticket`; `StartScreen` name prefill. Base URL: same as `serverUrl()` (`connection.ts:27`).
- [x] **T8 Deploy + backups** (AC 1, 11): compose service, `deploy.sh` (password + secret generation, migrate step), `backup.sh`, `restore.sh`, `docs/deploy.md` section, `docs/hermes-go-live.md` "Every later release" gains "first Epic 7 deploy" steps.
- [ ] **T9 Tests** (below) + full gate + hand-back.

## Dev Notes

### Current state (read before changing)

- **No database, no cookie, no body parsing, no `fetch`.** No `pg`/Drizzle/argon2 in any `package.json`; no `apps/server/src/{db,auth,meta}`. `deploy/docker-compose.yml:3` says "PostgreSQL joins in Epic 7 (Story 7.1)".
- **HTTP:** `apps/server/src/app.ts:29-47` `createGameServer()` = Colyseus `defineServer({ rooms, routes: createRouter({ health }), transport: WebSocketTransport({ server: createGuardedHttpServer(), maxPayload, beforeUpgrade }) })`. `/health` (`ops/health.ts:4`, `createEndpoint`) is the only route. `createGuardedHttpServer` (`net/httpGuard.ts:24-42`) refuses bodies > 2 KB (413) and chunked bodies without length (411) before Colyseus. Origin check is used for WebSocket upgrades only (`app.ts:37-41`).
- **Proxies:** Caddy `handle_path /api/*` strips `/api`, caps bodies at 8 KB, sets `X-Real-IP` from `Cf-Connecting-Ip` (`deploy/Caddyfile:32-44`); Vite proxies `/api` with `ws: true` and strips it (`apps/client/vite.config.ts:11-13`). Dev and production are same-origin, so a first-party cookie needs no CORS.
- **Guest token today:** `apps/client/src/net/guestToken.ts` — key `topdown.guestToken`, **16 random bytes as hex** (32 hex chars, regex `^[0-9a-f]{32}$`), made by the client, kept in `localStorage` with try/catch (memory fallback). Sent in join options (`connection.ts:39-48`); `guestTokenSchema` (`messages.ts:126`). Server: `hashGuestToken` = unsalted SHA-256 hex (`run/lobby.ts:43-45`); `RunAuth { name, ip, guestTokenHash }` (`RunRoom.ts:124-129`); `onAuth`/`checkAuth` (`RunRoom.ts:229-264`); `join()` refuses `run_started` outside the lobby (`:329`) and `already_joined` for the same hash (`:332`), then `Member` + `state.players.set(..., name)` (`:336-348`). `roomCreateLimiter` 10/min per IP (`net/rateLimit.ts:98-103`, `SlidingWindowLimiter` `:50-92`, `ipKey` `:10-26`).
- **Env:** `apps/server/src/index.ts` reads `PORT`, `HOST`, `LOG_LEVEL`, `ALLOW_SOLO_START`, `ALLOW_TEST_SCENARIOS`, `PUBLIC_ORIGIN`, `GIT_SHA`; dev switches are read in `RunRoom.ts` behind `NODE_ENV !== "production"` (`:102`).
- **Deploy:** compose has `server` (`read_only`, `tmpfs /tmp`, `mem_limit 768m`, `cap_drop ALL`, healthcheck `/health`) and `web` (Caddy on 127.0.0.1:8080). `deploy.sh` builds, `up -d`, polls `/api/health` 30 s; no migration step. `server.Dockerfile` CMD `node --import tsx apps/server/src/index.ts`. `docs/deploy.md` has no database section.
- **Architecture** (`game-architecture.md:162-165, 199-200, 341-343, 576, 594`): PostgreSQL 18 · pg 8.23 · Drizzle 0.45; guest token in a 1-year HttpOnly cookie + `localStorage`, stored hashed; account HTTP API in `app.ts`; the client gets a short-lived session ticket and sends it in the join options; folders `auth/`, `db/`, `meta/`; local Postgres by `docker compose -f deploy/docker-compose.yml up -d postgres`.
- **Proposal vs code:** the proposal says "random 32 bytes"; the real token is 16 bytes and already the identity 8.1 relies on. Keeping it is decision 7.1 D4b (128 bits can't be guessed; changing the length would orphan every phone that played before 7.1).

### What must keep working

Create / Join / Ready / Start / Leave / Back to lobby; solo practice (never touches the server); `?lag`/dev throttle (wraps the room, not `fetch`); the 1 KB join-options limit (`RunRoom.ts:240-246`: a ticket of ≤ 200 chars fits); `balance_mismatch` refusals; every `bootTestServer()` test (it must start with PGlite in memory and reset the new limiter); 8.1's reconnect by `reconnectionToken` (unchanged) and guest takeover (now by identity key).

### Network pass: check at build time

8.1 (`8-1-reconnect-within-2-minutes.md` AC 6, 9; Beat the rule 6) matches a returning phone by `guestTokenHash` and keys `rememberedSeats` by it, and flags: **"the guest token is the identity until 7.1: anyone with a copied token could take the seat"**. This story: (a) switches both to the identity key (`acct:` first), (b) keeps sending the raw token in join options (the unsaved fallback, AC 6) but never logs it; (c) the cookie copy is HttpOnly, so page scripts can't steal it; the `localStorage` copy still can be copied by someone holding the phone. Decision 7.1 D5 accepts that ("a house key"); 7.6's password is the stronger lock. Check the 8.1 code for every `guestTokenHash` read (`grep -rn guestTokenHash apps/server`).

### Testing

- Vitest with PGlite in memory (one fresh database per file, migrations applied): repos round-trip; `/account/session` P1 (new device → account + progress row with `unlocks [] supplies 0`), P2 (cookie only; token only; both agree; both disagree → cookie wins and both are rewritten), P3 (repository throws / times out → 200 `{ saved: false }` with no ticket, join still accepted, `accountId null`), P4 (forged, expired, other-secret tickets → `accountId null`; ticket compare is constant-time; token never in logs: spy on the logger), P5 (two `bootTestServer` in a row on one PGlite file → same account id).
- Limits: the 21st new guest from one IP in an hour → `saved: false`; an existing account from the same IP still resolves. Body > 2 KB → 413. Foreign `Origin` → 403.
- Room: join with a valid ticket → `Member.accountId` set; two joins with the same account → `already_joined` (or the 8.1 takeover once 8.1 is in); join without a ticket → identity `guest:` as today.
- Client: `account.ts` with a fake `fetch` (timeout → join without a ticket; `deviceToken` written back; storage throwing → memory).
- Migrations: `db:migrate` twice is a no-op; a test that the generated SQL creates exactly two tables.
- Liveness (brief 9): the P5 test asserts the second server really read the row (count 1, same id), not that "no error happened".
- Manual (dev): `npm run dev` with no `DATABASE_URL` works; DevTools → Application → delete `localStorage` → reload → same display name prefilled.

### Beat the rule (reviewer start list)

1. **Cheating:** send a hand-made `ticket` (other account id, far-future expiry) → `accountId null`. Send `accountId` in join options → `invalid_options` (strict schema). Replay yesterday's ticket → expired.
2. **Farming / spam:** a script calling `/account/session` without cookies 1,000 times → 20 accounts then `saved: false`; database row count stays small. Huge `deviceToken` → schema refuses.
3. **Losing progress:** clear `localStorage` (P2); clear cookies (P2); private window (new guest: expected, documented); database down mid-session (P3); server restart mid-lobby (P5); deploy with a new migration while a run is on (the migrate step runs before `up -d`: the old server keeps running until replaced).
4. **Two devices:** phone and tablet are two guests until 7.6 (expected); copying the token to the tablet = the same account (D5) — check both can't sit in one room twice (`already_joined` / 8.1 takeover).
5. **Offline:** no network at start → the start screen still works, Practice solo plays, Create shows the existing error path.
6. Mutate: drop the cookie read → P2 cookie-only test fails; accept expired tickets → P4 test fails; await the database inside `onTick`… (there should be nothing to mutate: assert by a test that `onTick` has no `await`/repository import).

### Notes for the merge

- `apps/server/src/app.ts`: 8.1 sets `pingMaxRetries: 4` on the transport (`app.ts:34`); this story adds routes to `createRouter({ health, ... })` — different lines.
- `RunRoom.ts` `checkAuth`/`join`: 8.1 rewrites `join()` (takeover) and adds `rememberedSeats`; whoever lands second wires the identity key into both. 7.2–7.7 read `Member.accountId`.
- `packages/shared/src/net/messages.ts` `joinOptionsSchema`: 7.9 adds the look code here; 8.10 adds a version check (8.10 D5) — additive fields.
- `deploy/docker-compose.yml`, `deploy.sh`, `docs/deploy.md`: only this story in Epic 7 touches them (7.6 adds no new service).
- `StartScreen.tsx`: 7.3 adds the Progress button, 7.6 the account row.

### Dependencies

Needs nothing from Epic 7. Lands after the Network pass (8.1 must be on master: this story finishes its identity work). Every other Epic 7 story needs it: 7.2–7.7 here, and the other writer's **7.9** (the `look` column and the account behind it), **7.10**, **7.11**, **7.12**. Epic 8's saved runs (8.4) belong to the accounts made here.

### Decisions to confirm (recommended first, alternative after)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.1 D1 | A computer without Docker (dev, builders, tests) | **The server uses a built-in small database (PGlite) when no database address is set, outside production** (every builder needs Docker and a running Postgres) |
| 7.1 D2 | How long a join ticket lives | **10 minutes**, fetched fresh before each Create/Join (1 minute: tighter, more refetches on slow phones) |
| 7.1 D3 | Cookie and phone storage point at two different players | **The cookie wins**; both are rewritten to it (the phone-storage copy wins) |
| 7.1 D4 | Where the starter pool lives | **In `progression.json` only; a player's row stores what they bought** (copy the 13 starter ids into every new row: a later change to the pool would need a data fix) |
| 7.1 D4b | Guest key length | **Keep today's 128-bit key** (existing phones keep their identity) (a new 256-bit key: every phone that played before becomes a new player) |
| 7.1 D5 | Someone copies my guest key to another device | **It's the same player, like a house key; Story 7.6's password is the real lock** (tie the key to one device: breaks the Safari cookie fallback) |
| 7.1 D6 | New guest profiles from one internet address | **At most 20 an hour**, then play goes on unsaved (no limit) |
| 7.1 D7 | Where backup copies go off the VPS | **A Cloudflare R2 bucket** (the site already runs behind Cloudflare; free under 10 GB) (copied to the designer's own computer each night) |
| 7.1 D8 | Database down at the start of a night | **Play anyway, Results says "Not saved"** (refuse to start runs until it's back) |

### Needs a look?

No. Nothing new on screen (the name field is prefilled; the "Not saved" line is 7.2's).

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 7.1; FR77, NFR12, NFR13; `game-architecture.md` › Persistence, Accounts, Security (lines 162–165, 199–200, 576, 594).
- `docs/epic-7-decisions.md`; `docs/ideas/epic-7/proposal.md` § 0 (D9), § 5; `implementation-readiness-report-2026-11-24-epic-7.md` Q5, Q11; `sprint-change-proposal-2026-11-24-epic-7-readiness.md` (session ticket in join options).
- `_bmad-output/implementation-artifacts/8-1-reconnect-within-2-minutes.md` AC 6, 9, Beat the rule 6; `docs/network-pass-decisions.md` › Open questions.
- Story 2.3 (guest token, join options), 2.1/2.2 (HTTP guard, origin, Caddy).

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, `gds-dev-story`), branch `story-7-1`.

### Debug Log References

- Early start (brief 29): T1–T5 + T8 built first on master `1fade84`; T6 (room), T7 (client), T9 (full gate, hand-back) wait for 8.1 on master.
- PGlite opens + migrates in ~1 s (load ~1): the database handle is lazy, so room tests that never touch accounts pay nothing.
- pino's level setter replaces the log methods: a `vi.spyOn(log, …)` must be made AFTER `bootTestServer()` (which sets the level).
- Colyseus' router answers with `Access-Control-Allow-Origin: *` + `Allow-Credentials: true`; browsers refuse to expose a credentialed response under `*`, the cookie is SameSite=Lax (not sent on cross-site POSTs) and the Origin check refuses foreign origins when `PUBLIC_ORIGIN` is set.
- No Docker daemon in the builder container: compose validated with `docker compose config -q` only.

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.1 D1–D8 accepted by the designer 2026-11-25 ("Okay, for all").
- **T1:** `drizzle-orm 0.45.4`, `pg 8.23.1` (server deps); `drizzle-kit 0.31.11`, `@electric-sql/pglite 0.5.16`, `@types/pg 8.23.1` (server devDeps; the Docker image installs dev deps today, production never loads PGlite). All ≥ 2 weeks old, exact pins; no existing package changed version in the lockfile. Scripts `db:generate`, `db:migrate` (root + server), `apps/server/drizzle.config.ts`.
- **T2:** `db/schema.ts` (accounts, progress; B2: username unique, supplies CHECK ≥ 0), migration `drizzle/0000_init.sql` (B1), `db/migrate.ts` (both drivers), `db/migrateCli.ts` (`npm run db:migrate`), `db/client.ts` (`openPostgres`, lazy `openPglite`, `databaseFromEnv`: production without `DATABASE_URL` throws), `db/paths.ts`.
- **T3:** `accountsRepo` (`findByTokenHash`, `createGuest` = account + empty progress row in one transaction, conflict-safe for two tabs at once, `setDisplayName`), `progressRepo` (`get`, `createEmpty`), `withDbTimeout` (2 s, `db_error {op, reason}` at error, never the arguments), `noDbImports.test.ts`.
- **T4:** `progression.json` (13 FR79 ids) + `progression.ts` (zod, frozen `PROGRESSION`, `starterPool`), exported from `@topdown/shared`; id-exists test against weapons/gear/buildings/consumables.
- **T5:** `auth/ticket.ts` (HMAC-SHA256, base64url, constant-time compare, 10 min), `auth/guestSession.ts` (D3 cookie → deviceToken → keep presented → mint; new-guest limiter D6; any repository failure → `saved:false`), `auth/accountRoutes.ts` (`POST /account/session` on `createRouter`, Origin check, cookie `tdg` HttpOnly/Secure/SameSite=Lax/Path=/api/1 year, `cache-control: no-store`), `packages/shared/src/net/account.ts` (request/response schemas), `newGuestLimiter` (reset in `bootTestServer`), `createGameServer({ database, sessionSecret })`, `index.ts` refuses production starts without `DATABASE_URL` or a ≥ 32-char `SESSION_SECRET`.
- **T8:** compose `postgres` service (B4) + `pgdata` volume, server `DATABASE_URL`/`SESSION_SECRET`/`depends_on` healthy; `deploy.sh` (`ensure_secret`, `env_set` keeps other `.env` lines, migrate in a one-off container before `up -d`, skipped for pre-7.1 shas), `backup.sh` (B5), `restore.sh` (scratch database + row counts), `docs/deploy.md` › Database, `docs/hermes-go-live.md` › First Epic 7 deploy; `.gitignore` / `.dockerignore` gain `.data` and `deploy/backup.env`.
- Manual (dev, port 2711): server starts with PGlite in a directory; `POST /account/session` → 200, cookie and ticket; restart → the cookie resolves to the same account id; production without `DATABASE_URL` / `SESSION_SECRET` → fatal log line, exit 1; `npm run db:migrate` twice → no-op.
- Mutations (brief 6), each made a test fail: no cookie read (4 failed), accept expired tickets (1), no new-guest limit (1), localStorage wins over the cookie (1), no progress row (3), 5 s timeout (1), no Origin check (1), cookie not HttpOnly (1).
- Build-time choices 7.1 B1–B7: `docs/epic-7-decisions.md` › Story 7.1 build-time choices (auto-accepted overnight (designer: follow the GDS recommendation)).

### Test evidence per task (brief R1: file > test name)

- **T1:** `apps/server/src/db/db.test.ts` > "applies once, and a second run is a no-op …" (drivers load, migrator runs); lockfile check: no existing package changed version (manual, Debug Log).
- **T2:** `apps/server/src/db/db.test.ts` > "the committed SQL creates exactly two tables: accounts and progress"; > "applies once, and a second run is a no-op (same tables, one recorded migration, rows kept)"; > "a balance can't go below 0 (check constraint)".
- **T3:** `apps/server/src/db/db.test.ts` > "createGuest makes an account and an empty progress row; find and setDisplayName round-trip"; > "two createGuest calls for one token at once give one account"; > "progress.createEmpty is idempotent …"; > "P5: a second database opened on the same PGlite directory finds the same account"; > "a call that never answers fails after the timeout with db_error {op}"; > "the default timeout is 2 s"; > "a failing database (unreachable Postgres) rejects as DbUnavailableError"; > "production without DATABASE_URL refuses; dev falls back to PGlite"; `apps/server/src/db/noDbImports.test.ts` > "no file outside src/db imports drizzle-orm, pg, PGlite or db/schema".
- **T4:** `packages/shared/src/config/progression.test.ts` > "starts with exactly the 13 FR79 starter ids"; > "every starter id exists in weapons / gear / buildings / consumables"; > "refuses duplicates, bad ids, extra keys and an empty pool"; > "is frozen".
- **T5:** `apps/server/src/auth/ticket.test.ts` > "a fresh ticket verifies to its account until it expires (10 min)"; > "refuses another secret's ticket"; > "refuses a hand-made ticket …"; > "refuses garbage …"; > "refuses a correctly signed payload that is not <uuid>.<ms>". `apps/server/src/auth/accountRoutes.test.ts` > "P1: a new device gets a guest account and an empty progress row with no form"; > "keeps a valid presented token that has no account yet"; > "P2: localStorage cleared (cookie only) and cookie gone (token only) …"; > "P2 / D3: cookie and localStorage disagree → the cookie wins …"; > "P4: never logs the token, its hash or the ticket"; > "limits: the 21th new guest from one IP …"; > "refuses a body over 2 KB (413), a malformed or oversized token or extra fields (400)"; > "refuses a foreign or missing Origin with 403 …"; > "P3 … answers 200 saved:false with no ticket …"; > "P5 … two test servers one after the other on one PGlite directory …". `apps/server/src/auth/guestSession.test.ts` > "a database that times out gives saved:false …"; > "a failing createGuest … is unsaved too …"; > "ignores malformed cookie values …"; > "mints distinct 32-hex tokens".
- **T8:** no automated test (no Docker daemon here): `docker compose -f deploy/docker-compose.yml config -q` passed; `bash -n` on deploy.sh / backup.sh / restore.sh; production start without `DATABASE_URL` / `SESSION_SECRET` exits 1 (manual, port 2713). Runs on the VPS: Hermes.

### Gate (brief R6)

- Early part (not the full gate): `npm run typecheck` ✅, `npm run lint` ✅ (whole repo), touched tests 132/132 ✅, load 1.17 (2026-11-25 04:16). Full gate after T6/T7.

### File List

- `package.json`, `package-lock.json`, `.gitignore`, `.dockerignore`
- `apps/server/package.json`, `apps/server/drizzle.config.ts`, `apps/server/drizzle/0000_init.sql`, `apps/server/drizzle/meta/_journal.json`, `apps/server/drizzle/meta/0000_snapshot.json`
- `apps/server/src/db/{schema,client,migrate,migrateCli,paths,timeout,accountsRepo,progressRepo}.ts`, `apps/server/src/db/{db,noDbImports}.test.ts`
- `apps/server/src/auth/{ticket,guestSession,accountRoutes}.ts`, `apps/server/src/auth/{ticket,guestSession,accountRoutes}.test.ts`
- `apps/server/src/app.ts`, `apps/server/src/index.ts`, `apps/server/src/net/limits.ts`, `apps/server/src/net/rateLimit.ts`, `apps/server/src/test/bootTestServer.ts`
- `packages/shared/src/config/progression.{json,ts,test.ts}`, `packages/shared/src/net/account.ts`, `packages/shared/src/index.ts`
- `deploy/docker-compose.yml`, `deploy/deploy.sh`, `deploy/backup.sh`, `deploy/restore.sh`
- `docs/deploy.md`, `docs/hermes-go-live.md`, `docs/epic-7-decisions.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: early part (T1–T5, T8) built on `story-7-1`; T6, T7, T9 held until 8.1 is on master.
