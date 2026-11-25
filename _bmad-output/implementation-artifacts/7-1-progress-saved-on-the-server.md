---
baseline_commit: 1fade848628c7738a860d491f1ca3e9ccdfb744f
---

# Story 7.1: Progress saved on the server

Status: review

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
- [x] **T6 Room** (AC 5, 6, 7): `joinOptionsSchema.ticket`; `checkAuth` → `accountId`; `Member.accountId` + identity key; `already_joined` by key; display name save in `onJoin`; logs `join_account {accountId|null}` (never the token).
- [x] **T7 Client** (AC 4, 5, 7; P2, P3): `apps/client/src/net/account.ts` (`fetch("/api/account/session", { method: "POST", credentials: "same-origin" })`, 3 s timeout, try/catch; on failure join without a ticket), `guestToken.ts` keeps its key and format and writes back the server's `deviceToken`; `connection.ts options()` (`connection.ts:39-48`) adds `ticket`; `StartScreen` name prefill. Base URL: same as `serverUrl()` (`connection.ts:27`).
- [x] **T8 Deploy + backups** (AC 1, 11): compose service, `deploy.sh` (password + secret generation, migrate step), `backup.sh`, `restore.sh`, `docs/deploy.md` section, `docs/hermes-go-live.md` "Every later release" gains "first Epic 7 deploy" steps.
- [x] **T9 Tests** (below) + full gate + hand-back.

#### Review Follow-ups (AI)

- [x] [AI-Review][Medium] M1 ticket bound to its guest token (`auth/ticket.ts` payload `<accountId>.<tokenHash32>.<exp>`, `verifyTicket(…, guestTokenHash)`, `checkAuth`) — `RunRoom.account.test.ts` > "review M1: my OWN valid ticket + someone's copied token … never re-labels it"; > "review M1: account A's ticket + Bo's token never takes Ana's (A's) seat"; > "review M1: a leaked ticket with any other token can't take the account's seat"; `ticket.test.ts` > "review M1: a valid ticket with ANOTHER guest token names no account".
- [x] [AI-Review][Low] L1 seat re-keyed to `acct:` when it gains an account (`takeOver`, `restoreRemembered`) — `RunRoom.account.test.ts` > "review L1: a seat that gained an account is re-keyed …".
- [x] [AI-Review][Low] L2 canonical 43-char signature — `ticket.test.ts` > "review L2: only the canonical signature verifies".
- [x] [AI-Review][Low] L3 one 2 s deadline per call — `guestSession.test.ts` > "review L3: one 2 s deadline for the whole call …"; > "the default deadline is the 2 s repository timeout".
- [x] [AI-Review][Low] L4 30 calls/min/IP before any DB work, warnings once per window — `guestSession.test.ts` > "review L4: over 30 calls a minute …"; > "review L4: new_guest_rate_limited is logged once per IP per window".
- [x] [AI-Review][Low] L5 cookie `__Host-tdg`, Path=/, no Domain — `accountRoutes.test.ts` > "P1 …" (name, Path=/, no Domain); > "review L5: a cookie under the old name `tdg` … is not read".
- [x] [AI-Review][Low] L6 `cache-control: no-store` asserted — `accountRoutes.test.ts` > "P1 …".
- [x] [AI-Review][Nit] N1 off-VPS retention 14 dumps, N2 restore.sh trap (globals), N3 docs line — `tools/checks/backupScripts.test.ts` > "N1 …", "N2 …"; `docs/deploy.md` › Database (N3).
- [x] [AI-Review][Low] L-R1 (re-review 1) off-VPS retention back to `--min-age "${keep}d"` (rclone 1.68.2 keeps 14 with it) — `tools/checks/backupScripts.test.ts` > "N1: local and off-VPS copies keep the same 14 dumps".
- [x] [AI-Review][Nit] N-R1 restore-path re-key asserted — `RunRoom.account.test.ts` > "re-review N-R1: a remembered unsaved seat restored with a ticket is re-keyed to acct: …" (mutation `seatKey: key` → 1 failed).
- [x] [AI-Review][Nit] N-R2 deadline with no presented token — `guestSession.test.ts` > "re-review N-R2: past the deadline with NO presented token …" (mutation `presented ?? mintGuestToken()` → 1 failed).
- [x] [AI-Review][Nit] N-R3 seat recovery reuses a ticket < 9 min old (B12) — `account.test.ts` > "re-review N-R3: 10 seat-recovery attempts make at most 1 /account/session call …"; `tools/checks/accountWiring.test.ts` > "every join path in connection.ts fetches the ticket right before joining" (rejoinGame → recoveryTicket). Mutation (no reuse) → 1 failed. Waits in `RunRoom.account.test.ts` raised to 5 s (a 1 s default flaked once under parallel load).
- [x] [AI-Review][Medium] (found by the 7.2 / 7.3 re-reviewers on real PostgreSQL) a checked-out `pg` client whose backend dies mid-transaction emitted an unhandled `error` → the game server shut down. `db/client.ts createPool`: `pool.on("connect", c => c.on("error", … db_error {op:"client"}))` + `keepAlive: true` — `db.test.ts` > "a checked-out client losing its backend mid-transaction logs db_error and never crashes the process" (mutation: listener removed → 1 failed); opt-in `db/realPg.test.ts` (`TEST_DATABASE_URL`, pg_terminate_backend mid-transaction) — NOT run here (no PostgreSQL in this container).

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

- **Review fixes (2026-11-25):** M1, L1–L6, N1–N3 (Review Follow-ups above). AC 4/5 text is superseded where the review changed it (brief R8): the cookie is `__Host-tdg` with `Path=/` (not `tdg`, `Path=/api`), and the ticket payload is `<accountId>.<tokenHash32>.<expiresAtMs>` (bound to the guest token). Mutations: M1 binding off → 5 failed; L2 canonical check off → 1; L1 re-key off → 1; L3 race off → 1; L4 limiter off → 1; L4 log gate off → 1; L6 header off → 1; L5 `Path=/api` → 0 failed (equivalent: better-call forces Path=/, Secure, no Domain on any `__Host-` cookie, `cookies.mjs resolveCookie`). Flake note: "copied guest token" failed once right after a container restart (vi.waitFor's 1 s default); takeover waits now use 5 s.

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
- **T6:** ticket verified in the static `checkAuth` (pure HMAC via `auth/roomAccounts.ts`, B9); `Member`/`RememberedSeat.accountId`; `seatKey` acct:/guest:, seat matches by `sameSeat` (B8); display name saved async in `onJoin`; `join_account {accountId}` log.
- **T7:** `net/account.ts` (3 s timeout, never throws, writes back `deviceToken`), `guestTokenStore` with `set`, `net/serverUrl.ts`, ticket in every join path (`createGame`, `joinGame`, `rejoinGame`), StartScreen prefill on start-up.
- Build-time choices 7.1 B1–B9: `docs/epic-7-decisions.md` › Story 7.1 build-time choices (auto-accepted overnight (designer: follow the GDS recommendation)).

### Test evidence per task (brief R1: file > test name)

- **T1:** `apps/server/src/db/db.test.ts` > "applies once, and a second run is a no-op …" (drivers load, migrator runs); lockfile check: no existing package changed version (manual, Debug Log).
- **T2:** `apps/server/src/db/db.test.ts` > "the committed SQL creates exactly two tables: accounts and progress"; > "applies once, and a second run is a no-op (same tables, one recorded migration, rows kept)"; > "a balance can't go below 0 (check constraint)".
- **T3:** `apps/server/src/db/db.test.ts` > "createGuest makes an account and an empty progress row; find and setDisplayName round-trip"; > "two createGuest calls for one token at once give one account"; > "progress.createEmpty is idempotent …"; > "P5: a second database opened on the same PGlite directory finds the same account"; > "a call that never answers fails after the timeout with db_error {op}"; > "the default timeout is 2 s"; > "a failing database (unreachable Postgres) rejects as DbUnavailableError"; > "production without DATABASE_URL refuses; dev falls back to PGlite"; `apps/server/src/db/noDbImports.test.ts` > "no file outside src/db imports drizzle-orm, pg, PGlite or db/schema".
- **T4:** `packages/shared/src/config/progression.test.ts` > "starts with exactly the 13 FR79 starter ids"; > "every starter id exists in weapons / gear / buildings / consumables"; > "refuses duplicates, bad ids, extra keys and an empty pool"; > "is frozen".
- **T5:** `apps/server/src/auth/ticket.test.ts` > "a fresh ticket verifies to its account until it expires (10 min)"; > "refuses another secret's ticket"; > "refuses a hand-made ticket …"; > "refuses garbage …"; > "refuses a correctly signed payload that is not <uuid>.<ms>". `apps/server/src/auth/accountRoutes.test.ts` > "P1: a new device gets a guest account and an empty progress row with no form"; > "keeps a valid presented token that has no account yet"; > "P2: localStorage cleared (cookie only) and cookie gone (token only) …"; > "P2 / D3: cookie and localStorage disagree → the cookie wins …"; > "P4: never logs the token, its hash or the ticket"; > "limits: the 21th new guest from one IP …"; > "refuses a body over 2 KB (413), a malformed or oversized token or extra fields (400)"; > "refuses a foreign or missing Origin with 403 …"; > "P3 … answers 200 saved:false with no ticket …"; > "P5 … two test servers one after the other on one PGlite directory …". `apps/server/src/auth/guestSession.test.ts` > "a database that times out gives saved:false …"; > "a failing createGuest … is unsaved too …"; > "ignores malformed cookie values …"; > "mints distinct 32-hex tokens".
- **T6:** `apps/server/src/rooms/RunRoom.account.test.ts` > "a valid ticket sets Member.accountId and the acct: identity key"; > "no ticket: accountId null and today's guest: key"; > "P4: a forged, expired or other-secret ticket is accepted as a join but names no account"; > "an accountId (or an over-long ticket) in the join options is refused as invalid_options"; > "logs join_account with the account id, never the ticket or the token"; > "lobby: a second join of the same account (another guest token) is already_joined"; > "lobby: the same guest token with and without a ticket is one seat …"; > "two different accounts in one lobby both get seats"; > "started run: the same account from another device … takes the seat over (8.1 D5)"; > "started run: a copied guest token (7.1 D5 …) behaves exactly the same"; > "started run: a seat that joined unsaved takes the account of a later valid ticket …"; > "started run: another account (new token) is still run_started"; > "saves the name used at a successful join (async, best effort)"; > "P3: with the database down a ticketed join is still accepted …"; > "onTick has no await and the room reaches the database only through roomAccountsRepo in saveDisplayName". 8.1's `RunRoom.reconnect.test.ts` unchanged and green.
- **T7:** `apps/client/src/net/account.test.ts` > "posts the localStorage token same-origin to /api/account/session and writes the server's token back (P2)"; > "sessionTicket: the ticket when saved, undefined when the server says not saved (P3)"; > "a timeout (3 s), a network error, a 5xx and a malformed reply all give null and keep the token"; > "storage throwing: the server's token lives in memory for this page"; > "prefillName: …". `apps/client/src/net/connection.account.test.ts` > "createGame, joinGame and rejoinGame each send the ticket fetched just before"; > "no ticket (save server down): the join goes ahead without the field (P3)". `apps/client/src/net/guestToken.test.ts` > "set stores a valid token, ignores a malformed one, and falls back to memory when storage throws". Wiring (R2): `tools/checks/accountWiring.test.ts` > "the start screen asks for the account on start-up and prefills the name through prefillName (AC 7)"; > "account.ts posts to serverUrl() + /account/session"; > "every join path in connection.ts fetches the ticket right before joining".
- **T9:** full gate below; mutations: T6 5/5 caught (seatKey guest-only 3 failed, sameSeat key-only 2, no ticket verify 8, no name save 1, takeover keeps null 1), T7 4/4 (no prefill 1, no ticket 1, no write-back 3, no timeout 1). Browser (Chromium, server 2711 + Vite 5711, dev PGlite): first visit empty name; Create "Kai" → `join_account {accountId: <uuid>}`; cookie `tdg` HttpOnly Path=/api equals the localStorage token, `document.cookie` can't see it; localStorage wiped → reload → name "Kai" prefilled, same token written back; cookie wiped → reload → name "Kai", cookie rewritten to the same token; no 32-hex token or ticket in the server log.
- **T8:** no automated test (no Docker daemon here): `docker compose -f deploy/docker-compose.yml config -q` passed; `bash -n` on deploy.sh / backup.sh / restore.sh; production start without `DATABASE_URL` / `SESSION_SECRET` exits 1 (manual, port 2713). Runs on the VPS: Hermes.

### Gate (brief R6)

- Early part: typecheck ✅, lint ✅, touched tests 132/132 ✅, load 1.17 (04:16).
- **FULL GATE ✅** `npm run typecheck && npm run lint && npm test && npm run build` on story-7-1 merged with origin/master `d8d44d0` AND origin/story-8-1 `83761d2` (8.1 not on master yet): 426 test files passed / 1 skipped, 3861 tests passed / 3 skipped, build OK; load 0.92 at start → 3.32 at end (2026-11-25 05:54–06:01).
- **FULL GATE after the review fixes ✅** on story-7-1 `54d8d96` = fixes + origin/master `d8d44d0` + origin/story-8-1 `a4c802c` (8.1 with its review fixes; still not on master): 428 files passed / 1 skipped, 3895 tests passed / 3 skipped, build OK; load 1.33 → 2.99 (06:24–06:31).

### Notes for the merge

- `apps/server/src/run/lobby.ts`: `seatKey` (acct:/guest:) + new `sameSeat`; `Member.accountId`. 8.1's other lines untouched.
- `apps/server/src/rooms/RunRoom.ts`: `RunAuth.accountId`, `RememberedSeat.accountId`, `checkAuth` ticket, `onJoin` → `saveDisplayName`, `join()` seat matches via `sameSeat`, `takeOver` / `restoreRemembered` carry `accountId`. 7.2–7.7 read `Member.accountId` (null = unsaved).
- `apps/server/src/app.ts`: `database` / `sessionSecret` options, `setRoomAccounts`, `createRouter({ health, accountSession })`, `onShutdown` db close — next to 8.1's ping lines.
- `apps/server/src/net/limits.ts`: 7.1 constants appended AFTER 8.1's (merge conflict resolved here, both kept).
- `packages/shared/src/net/messages.ts` `joinOptionsSchema`: `ticket` added after `devRunSeed` (7.9 look code, 8.10 version check: additive).
- `packages/shared/src/index.ts`: two export blocks (progression after cosmetics, account after messages).
- `apps/client/src/net/connection.ts`: `serverUrl` moved to `net/serverUrl.ts` (re-exported); `options(intent, name, ticket?)`; every join path awaits `sessionTicket()`.
- `apps/client/src/ui/StartScreen.tsx`: one start-up effect (7.3 Progress button, 7.6 account row go elsewhere in the file).
- `deploy/*`, `docs/deploy.md`, `docs/hermes-go-live.md`: this story only. Balance version: unchanged (progression.json is not in it).
- `tools/bots/botClient.ts`: no ticket (bots play unsaved, as intended).

### Not verified

- No Docker daemon here: the compose `postgres` service, `deploy.sh`'s migrate step, `backup.sh`, `restore.sh` never ran (compose checked with `docker compose config -q`, scripts with `bash -n`). PostgreSQL itself never ran: all DB tests use PGlite (same SQL dialect; the `pg` driver path is tested only for "unreachable → DbUnavailableError").
- VPS: first Epic 7 deploy, R2 bucket + rclone, cron, restore test — Hermes (`docs/hermes-go-live.md` › First Epic 7 deploy).
- Real phones / iOS Safari (the 7-day storage wipe, Secure cookie on the real domain): only Chromium on localhost.
- Gated with 8.1 from its branch (`83761d2`), not from master: merge master again once 8.1's review fixes land.

### File List

- `package.json`, `package-lock.json`, `.gitignore`, `.dockerignore`
- `apps/server/package.json`, `apps/server/drizzle.config.ts`, `apps/server/drizzle/0000_init.sql`, `apps/server/drizzle/meta/_journal.json`, `apps/server/drizzle/meta/0000_snapshot.json`
- `apps/server/src/db/{schema,client,migrate,migrateCli,paths,timeout,accountsRepo,progressRepo}.ts`, `apps/server/src/db/{db,noDbImports}.test.ts`
- `apps/server/src/auth/{ticket,guestSession,accountRoutes}.ts`, `apps/server/src/auth/{ticket,guestSession,accountRoutes}.test.ts`
- `apps/server/src/auth/roomAccounts.ts`, `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/rooms/RunRoom.account.test.ts`, `apps/server/src/run/lobby.ts`, `packages/shared/src/net/messages.ts`
- `apps/client/src/net/{account,serverUrl}.ts`, `apps/client/src/net/{account,connection.account}.test.ts`, `apps/client/src/net/{connection,guestToken}.ts`, `apps/client/src/net/guestToken.test.ts`, `apps/client/src/ui/StartScreen.tsx`, `tools/checks/accountWiring.test.ts`
- `apps/server/src/app.ts`, `apps/server/src/index.ts`, `apps/server/src/net/limits.ts`, `apps/server/src/net/rateLimit.ts`, `apps/server/src/test/bootTestServer.ts`
- `packages/shared/src/config/progression.{json,ts,test.ts}`, `packages/shared/src/net/account.ts`, `packages/shared/src/index.ts`
- `deploy/docker-compose.yml`, `deploy/deploy.sh`, `deploy/backup.sh`, `deploy/restore.sh`
- `docs/deploy.md`, `docs/hermes-go-live.md`, `docs/epic-7-decisions.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: early part (T1–T5, T8) built on `story-7-1`; T6, T7, T9 held until 8.1 is on master.
- 2026-11-25: merged origin/story-8-1; T6 (room), T7 (client), T9 done; full gate green; status review.
- 2026-11-25: Senior Developer Review (AI) changes requested; addressed code review findings - 10 items resolved (M1, L1–L6, N1–N3).

## Senior Developer Review (AI)

**Reviewer:** fresh reviewer cloud session (`gds-code-review`, three layers + beat the rule; brief R10 full review), 2026-11-25. **Tree:** `review-7-1` = `origin/story-7-1` 827ea45 merged with `origin/master` d8d44d0 (already contained, no conflicts). 7.1's own diff = `git diff origin/story-8-1...origin/story-7-1` (8.1's code not reviewed). **Checks run:** `npm ci`; `npm run typecheck` ✅; the 12 touched test files (82 tests) ✅ plus `RunRoom.reconnect.test.ts` ✅; live probes on a dev server (port 2761, PGlite; 2762 with an unreachable `DATABASE_URL`; 2765 on a real **PostgreSQL 16** cluster at port 2764: no PG 18 here); load ≈ 0.1–1. Full gate not run (reviewer rule).

**Verdict: changes requested — 1 medium, 6 low, 3 nits.** The core is sound: HMAC tickets with a constant-time compare and an expiry, strict join and body schemas, HttpOnly/Secure/SameSite=Lax cookie, only SHA-256 of a 128-bit token stored, a lazy database with a 2 s timeout that never reaches the tick, honest `saved:false`, a production start that refuses without `DATABASE_URL` / `SESSION_SECRET`, clean logs. The one medium is B8 combined with a ticket that is not tied to the guest token.

### Findings

- **M1 (medium) — the ticket is not bound to the guest token it was issued for, and B8's `sameSeat` matches by that token, so a seat can be re-labelled to another account.** `apps/server/src/rooms/RunRoom.ts:308` (`ticketAccountId(parsed.data.ticket)` ignores `parsed.data.guestToken`), `apps/server/src/rooms/RunRoom.ts:447` (`takeOver`: `old.accountId ?? client.auth?.accountId`), `apps/server/src/run/lobby.ts:74` (`sameSeat` token branch), `apps/server/src/auth/ticket.ts:21` (payload has no token). Scenario (probed with a temporary room test, then removed): Bo's seat joined unsaved (save server down, or over the new-guest limit) with token T; someone holding a copy of T joins the started run with T **and a valid ticket for their own account B** → takeover, the seat's `accountId` becomes B (`seatKey` stays `guest:…`): from 7.2 on, Bo's run earnings bank into B, not into the account T resolves to. 7.1 D5 says "a copied token = THAT account", not "any account". Also: a ticket of account A paired with Bo's token took over **Ana's** (host) seat in the started run (first seat by `seatKey`, PROBE E), and a leaked ticket alone (it is in the response body, readable by page JS, valid 10 min) plus any token takes over the account's seat. **Minimal fix:** put the guest-token hash (e.g. its first 32 hex) in the signed payload (`signTicket(accountId, tokenHash, …)`; ≈ 200 chars still fits — check the 200 limit) and in `checkAuth` return `accountId` only when it equals `hashGuestToken(parsed.data.guestToken)`, else `null` (no refusal, P3). The server already knows which token the ticket was issued for (`resolveGuestSession` signs right after resolving it). Test: "a valid ticket with another guest token names no account / doesn't re-label an unsaved seat".
- **L1 (low) — a seat that gains an account in `takeOver` keeps its `guest:` `seatKey`.** `apps/server/src/rooms/RunRoom.ts:447-448`. Scenario (PROBE G): unsaved seat (token T) → same phone rejoins with a ticket for A (seat now `accountId A`, `seatKey guest:…`) → the same account from its other device (new token, ticket A) gets `run_started` instead of the 8.1 D5 takeover the test "same account from another device" promises. **Fix:** set `seatKey: seatKey({ guestTokenHash: old.guestTokenHash, accountId })` in `takeOver` / `restoreRemembered` when the account was gained (and re-key `rememberedSeats` on drop, which already uses `member.seatKey`).
- **L2 (low) — ticket signatures are malleable.** `apps/server/src/auth/ticket.ts:38` (`Buffer.from(sigPart, "base64url")` ignores the 2 spare bits of the 43rd char). Probe: for a real ticket, 3 other last characters (`J`,`K`,`L` in the probe) verify too, so a ticket string is not unique. Harmless today; it bites the moment 7.2+ uses the ticket string as a replay/idempotency key. **Fix:** require `sigPart.length === 43` and `given.toString("base64url") === sigPart` (canonical form) before the compare.
- **L3 (low) — the server can take ~6 s while the client gives up at 3 s.** `apps/server/src/auth/guestSession.ts:52-69`: up to three sequential repository calls (cookie lookup, device lookup, `createGuest`) each get their own 2 s timeout. Probe (fake repo answering in 1.9 s): `saved:true` after **5 708 ms**; the client aborted at 3 000 ms, joined unsaved, and the `Set-Cookie` was dropped. No progress is lost (the presented token got the account, a later call finds it), but on a slow database every Create/Join waits 3 s and plays unsaved. **Fix:** one 2 s deadline for the whole resolution (or a single `WHERE guest_token_hash IN (cookie, device)` query), so the server always answers before the client's 3 s.
- **L4 (low) — `/account/session` has no per-request limit; only NEW guests are limited, and the lookups run before the limiter.** `apps/server/src/auth/guestSession.ts:55-66`. Probe: 6 000 POSTs with random tokens from one `X-Real-IP` → 20 accounts, then 5 980 × (two DB lookups + one `new_guest_rate_limited` warn line). Legit requests stayed fast at curl's rate (PK lookups are cheap), so not an outage, but brief 15 ("anything new a client sends is guarded, rate-limited") and the 10 MB × 5 json-file log rotation (a flood pushes real logs out). **Fix:** a per-IP `SlidingWindowLimiter` for the route (e.g. 30/min, checked before any DB call, over it → `saved:false` without DB work) and log `new_guest_rate_limited` once per IP per window.
- **L5 (low) — the guest cookie can be planted from a sibling subdomain, and the cookie wins (D3).** `apps/server/src/auth/accountRoutes.ts:38` (cookie name `tdg`). Any `*.sevend.io` host that serves attacker-influenced content can set `tdg=<attacker token>; Domain=.sevend.io; Path=/api`; the game then resolves the victim's phone to the attacker's account (session fixation: the victim's progress lands in an account the attacker holds the key to; with 7.6 the attacker can later lock it with a password). **Fix:** name the cookie `__Host-tdg` (browser refuses Domain= and non-Secure sets; requires `Path=/`, so drop `Path=/api` — the cookie is then also sent with static file requests, ~50 bytes), or document the accepted risk in decisions.
- **L6 (low) — `cache-control: no-store` is untested.** `apps/server/src/auth/accountRoutes.ts:46`: deleting the line keeps `accountRoutes.test.ts` green (mutation survived). The response carries the ticket and the token; a cached copy in a shared proxy would leak them. **Fix:** assert the header in the P1 test.
- **N1 (nit) — off-VPS copies keep 15 days, local 14.** `deploy/backup.sh:51` `find -mtime +13` keeps 14 dumps (checked with 21 dated files: 14 left), `rclone delete --min-age 14d` keeps the 15th. Use `--min-age 13d` or say "14–15 days" in docs.
- **N2 (nit) — `restore.sh` leaves `topdown_restore_test` behind when `pg_restore` fails** (`set -e` exits before the final DROP). A `trap` that drops it on exit. Harmless (the next run drops it first).
- **N3 (nit) — the `Secure` cookie isn't stored on a phone testing over `http://<LAN-IP>:5173` in dev** (only `localhost` counts as secure), so P2's cookie half can't be tried on a real phone in dev. Docs line only.

### Beat the rule (every attempt and its result)

| # | Attempt | Result |
| --- | --- | --- |
| 1 | Forge a ticket: other account id with the real signature | `null` (probe script) ✅ |
| 2 | Extend expiry (re-encode payload, keep signature) | `null` ✅ |
| 3 | Replay an expired ticket (`now = exp`) | `null` ✅ |
| 4 | Another secret's ticket; empty/truncated sig; `=` padding; standard base64 `+/`; 201 chars; a number | all `null` ✅ |
| 5 | Signature last-char variants | **3 variants verify** → L2 |
| 6 | HMAC compare | `timingSafeEqual` after a length check ✅ |
| 7 | `accountId` in join options / over-long ticket | `invalid_options` (existing test) ✅ |
| 8 | Ticket for MY account + someone's copied token, unsaved seat in a started run | **seat becomes my account** → M1 |
| 9 | Ticket of account A + Bo's token in a started run | **takes over Ana's (A's) seat** → M1 |
| 10 | Lobby: ticket A + T1, then ticket B + T1 | `already_joined` ✅ |
| 11 | Same token with and without ticket in the lobby (B8) | one seat, `already_joined` ✅ |
| 12 | Held/seated account seat, different account's ticket, no token copy | `run_started` ✅ |
| 13 | Seat gains an account, then same account from another device | `run_started` (not takeover) → L1 |
| 14 | Guess a guest token | 128 bits from `crypto.getRandomValues` (client and server); only unsalted SHA-256 stored ✅ (fine at 128-bit entropy) |
| 15 | Read the cookie from page JS | `HttpOnly` (Set-Cookie seen: `Max-Age=31536000; Path=/api; HttpOnly; Secure; SameSite=Lax`) ✅ |
| 16 | CSRF: no Origin / foreign Origin with `PUBLIC_ORIGIN` set | 403 / 403 ✅; `text/plain` form-style body → 400 (body arrives as a string) ✅ |
| 17 | `PUBLIC_ORIGIN` unset in production | compose defaults it to `https://hordes.sevend.io`; without it a cross-site non-credentialed fetch could only mint a guest (limited) and read its own ticket — acceptable ✅ |
| 18 | Plant the cookie from a sibling subdomain | possible (not run in a browser) → L5 |
| 19 | 23 new guests from one `X-Real-IP` | 20 `saved:true`, 3 `saved:false` ✅; existing account from that IP still `saved:true` ✅; `X-Real-IP` with a comma list / `::ffff:` form → same key ✅ |
| 20 | Spoof `X-Real-IP` / `X-Forwarded-For` | direct to Node: bypass (expected); in production Caddy overwrites `X-Real-IP` from `Cf-Connecting-Ip` and Node isn't published ✅ |
| 21 | Limiter reset | per process, reset only by restart / `bootTestServer` ✅ |
| 22 | Flood 6 000 random tokens | no outage; 2 lookups + 1 warn line each → L4 |
| 23 | Body 3 KB / malformed JSON / `[]` / `null` / extra field / uppercase token / garbage cookies | 413 / 400 / 400 / 200 (treated as `{}`) / 400 / 400 / ignored, new guest ✅ |
| 24 | Database unreachable | 200 `saved:false`, presented token kept, `db_error {op, reason}` logged, no token in the log; `/health` fine ✅ |
| 25 | Database slow (1.9 s per call) | 5.7 s server vs 3 s client → L3 |
| 26 | Tick awaits the database | no (`onTick` grep test; `saveDisplayName` fire-and-forget) ✅ |
| 27 | Real PostgreSQL (16) vs PGlite | `db:migrate` twice → 1 recorded migration, 2 tables ✅; 10 parallel `createGuest` same hash → one account ✅; empty progress row ✅; SQL-ish display name stored as text ✅ |
| 28 | Backup prune + restore | `find -mtime +13` keeps 14 ✅; `pg_dump -Fc` → restore.sh's exact `psql`/`pg_restore --no-owner --exit-on-error` into a scratch DB → counts 1/1/1, scratch dropped ✅ (PG 16 tools; PG 18 container not run: no Docker daemon) |
| 29 | Repositories-only import rule | the grep test is real (mutation: `drizzle-orm` import in RunRoom.ts → fails) ✅ |
| 30 | Tokens/tickets/cookies in logs | 0 hits for 32-hex tokens, `ticket`, `tdg` in the server logs after all probes ✅ |
| 31 | Display name injection | join name goes through `playerNameSchema` (length + filter); prefill re-validates ✅ |
| 32 | Production without `DATABASE_URL` / `SESSION_SECRET` / short / 40 spaces | `database_url_missing` / `session_secret_missing` ×3, exit 1 ✅ |
| 33 | Secrets in git | none committed; `.env*`, `backup.env`, `.data` ignored in git and Docker; `openssl rand -hex`, `mktemp` (0600), `chmod 600 deploy/.env` ✅ |

### Mutations (one per new test file)

| Mutation | Test | Result |
| --- | --- | --- |
| ticket: drop the expiry check | `ticket.test.ts` | 1 failed ✅ |
| guestSession: unsaved path mints instead of keeping the presented token | `guestSession.test.ts` | 1 failed ✅ |
| routes: cookie `Path=/` | `accountRoutes.test.ts` | 1 failed ✅ |
| routes: no `cache-control: no-store` | `accountRoutes.test.ts` | **0 failed** → L6 |
| db: `createGuest` without `onConflictDoNothing` | `db.test.ts` | 1 failed ✅ |
| `drizzle-orm` import in RunRoom.ts | `noDbImports.test.ts` | 1 failed ✅ |
| `sameSeat` by key only | `RunRoom.account.test.ts` | 2 failed ✅ |
| progression.json without `grenades` | `progression.test.ts` | 2 failed ✅ |
| client `credentials: "omit"` | `account.test.ts` | 1 failed ✅ |
| `rejoinGame` without the ticket | `connection.account.test.ts` | 1 failed ✅ |
| `guestTokens.set` without the format check | `guestToken.test.ts` | 1 failed ✅ |
| account URL hard-coded (not `serverUrl()`) | `accountWiring.test.ts` | 1 failed ✅ |

### Brief checks

- **R1:** every named test in "Test evidence per task" exists (grepped); T8 honestly has none (no Docker). ✅ **R6:** Gate line present (commit, master + 8.1 merged, 426 files / 3861 tests, load). ✅
- **15** server truth: only the ticket names an account ✅, but see M1 (ticket not tied to the identity it was issued for); rate limit only on new guests (L4). **17** remembered seats keep `accountId` ✅. **18** concurrent `createGuest` → one account (PGlite and PG) ✅. **19** 128 bits, SHA-256 only, constant-time, nothing logged ✅. **20** 2 s timeout per call, tick never waits, `saved:false` honest ✅ (L3 on the total). **21** repositories only (real grep test), committed Drizzle migration, PGlite dev / PG 18 compose ✅. **28** no email/IP in the DB, names filtered ✅. **31** refuses to start without secrets, clear lines ✅; VPS steps are Hermes's.
- **B8 judged:** matching a seat by the same guest token is right for its purpose (a phone whose ticket comes and goes never sits twice and finds its own seat), and it adds no power D5 didn't already give a copied token **once the ticket is bound to the token (M1)**. Without that binding it lets a ticket re-label a seat. Keep B8, fix M1 and L1.
- Not verified here: PostgreSQL 18 and the compose stack (no Docker daemon; PG 16 tools used), real phones / iOS Safari, cookie planting in a browser (L5 is by spec), the VPS.

### Re-review (narrow) 1 — 2026-11-25

Scope: the fix commits only (f7b290c M1+L2, e8c59f5 L1, 5ebf14e L3+L4, f618c9a L5, 7dda73e L6, b9fe33f + 8bcdef7 N1–N3), on `rereview-7-1` = origin/story-7-1 @ 7519791 + origin/master 02e7d8c. The merge had 2 trivial union conflicts (`.gitignore`, `hudLayout.test.ts` imports), resolved by keeping both sides. Typecheck: OK. Touched tests (accountRoutes, guestSession, ticket, RunRoom.account, backupScripts): 47/47 passed.

**Verdict: changes requested (one Low regression in N1). Everything else is clean.**

#### Findings

- **L-R1 (Low, introduced by the N1 fix): the off-VPS copy now keeps 13 dumps, not 14.** `deploy/backup.sh:54` `rclone delete --min-age "$((keep - 1))d"`. rclone deletes files older than 13 days. Cron runs `rclone delete` after the upload, so on day n the dump from day n−13 is already 13 days plus the upload time old, and it goes. That leaves days n−12..n, which is 13 dumps. Checked with rclone v1.68.2 on 21 files aged k×24h + 30 s: `--min-age 13d` left 13, and the original `--min-age 14d` left **14**. `find -mtime +13` on the same ages (+2 s) left 14. So the original N1 ("remote keeps 15") was itself wrong. It came from dated midnight files, where both commands keep 14. The fix breaks a setting that was correct. Minimal fix: go back to `--min-age "${keep}d"`, update the comment, and pin that string in `tools/checks/backupScripts.test.ts:13`. That test currently locks in the off-by-one: mutating the script back to `${keep}d` fails it. One more note: `find -mtime +13` keeps 15 on a night when today's dump finishes faster than the one 14 days ago. That flap is harmless; at most say "14 (sometimes 15) locally" in the docs.
- **N-R1 (Nit, test gap): the L1 re-key on the restore path has no test.** `apps/server/src/rooms/RunRoom.ts:496`. Mutating it back to `seatKey: key` leaves 47/47 green. It can't be observed in 7.1, because one account has exactly one `guest_token_hash` (unique) and `sameSeat` also matches by token. It becomes observable once a second device can hold the same account (a later login story). Fix: one assertion in the remembered-seat test that `seatKey === acct:…` after a restore with a ticket.
- **N-R2 (Nit, test gap): "one token for every outcome" (L3) is only tested with a presented token.** `apps/server/src/auth/guestSession.ts:96`. Mutating `const token = fallback` to `presented ?? mintGuestToken()` stays green. The difference only shows with no valid token (a late create would mint a second token that nobody holds, leaving an orphan guest row). A real client always sends its localStorage token, so the impact is a stray DB row. Fix: a deadline test with `{cookieToken: null, deviceToken: null}` that asserts the late-created hash equals `hashGuestToken(response.deviceToken)`.
- **N-R3 (Nit, no change needed now): rejoins spend the per-IP session budget.** `SeatRecovery` calls `sessionTicket()` on every takeover attempt: every 1 s on `network`, every 3 s on `seat_kept`, which is 20/min per phone. Two phones in `seat_kept` on one Wi-Fi reach the 30/min limit. A third phone's fresh Create/Join from that IP in the same minute then plays unsaved. Account seats lose nothing: `takeOver` and `restoreRemembered` keep `old.accountId`, and `sameSeat` matches by token. Optional later: skip the ticket fetch on `seat_kept` retries, or reuse a ticket younger than about 9 min.

#### Exploit attempts (each one tried against the fix)

| # | Attempt | Result |
|---|---|---|
| M1-a | Own valid ticket A + a copied token B on B's unsaved seat | `verifyTicket(tA→tB)` = null, so the join is a guest join with no account and can't re-label B's seat. **Holds.** |
| M1-b | Ticket A + Bo's token against Ana's seat | Same as above: tokenPart ≠ hash(Bo's token)[0..32], so null. **Holds.** |
| M1-c | Leaked ticket + any other token | Bound to its own token hash, so only the token it was issued for works. Ticket + token both leaked = that device (D5 "house key"). **Holds.** |
| M1-d | Prefix/collision on tokenHash32 (128 bits) | The attacker controls the token, not the hash. Matching needs a second preimage of a 128-bit truncated SHA-256 (2^128). The comparison is constant-time over exactly 32 hex. `HEX32` rejects other lengths and uppercase. An uppercase variant of the token hashes to something different, so null. **Holds.** |
| M1-e | Copied-token holder with **no** ticket takes over an account seat and banks | Yes: `sameSeat` matches by token, and `takeOver` keeps `old.accountId`, so the bank goes to the original account. That is decision 7.1 D5 + 8.1 D5 ("the token is the house key; copied token = that player"). By design, not a finding. |
| L1-a | Can re-keying move a seat between accounts? | No. `accountId = old.accountId ?? client.auth.accountId`, so an account seat never changes account. An unsaved seat gains an account only from a joiner that matched it (same token), and M1 binds that ticket to the same token. **Holds.** |
| L1-b | A later device of the same account after the re-key | Not possible in 7.1 (one token hash per account, unique column). The seat keeps the original `guestTokenHash`, so the original ticket-less device still finds it. Latent for a future multi-device story: two seats of one account in a run (one joined unsaved, the other with a ticket) would both be `acct:X`, and `join()` takes the first match in Map order. Worth a note for that story. Not a 7.1 finding. |
| L2-a | 63 other last characters of the 43-char signature | 0 accepted. |
| L2-b | `=` padding / length 42 / length 44 / standard base64 `+/` / padding on the payload | All null. The `+/` rewrite was tried on 137 tickets that contained `-`/`_`: 0 accepted. |
| L2-c | Non-canonical last character of the **payload** part | 63 variants, 0 accepted (the MAC covers the payload string itself). |
| L3-a | DB create lands after the 2 s deadline | The response and the late create use the same `fallback` token, so the next call finds that account. No second account and no cookie/token mismatch. A parallel retry during the in-flight create hits the unique `guest_token_hash` and plays unsaved. `work.catch` swallows a late rejection. **Holds.** (Gap: N-R2.) |
| L4-a | Limiter keyed by `ipKey` of X-Real-IP | Caddy sets it from `Cf-Connecting-Ip`; the server port is `expose` only (compose:46), so it can't be spoofed from outside. Refused calls are not recorded, so a phone isn't locked out forever. **Holds.** |
| L4-b | Shared NAT, 4 friends + reloads | Normal use is about 2 calls per phone per Create/Join or reload, far under 30/min. Only the `seat_kept` polling adds up (N-R3). |
| L5-a | `__Host-tdg` on every request (assets, WS upgrade) | About 45 bytes. No server path reads cookies except `/account/session`. Set-Cookie only comes on a `no-store` response, so CDN caching is unaffected. |
| L5-b | Page JS reading it | Still HttpOnly. |
| L5-c | Caddy `handle_path /api/*` strip | The browser matches Path=/ against `/api/account/session`, so it still sends the cookie. The tests round-trip it. **Holds.** |
| L5-d | Old `tdg` cookies in production | 7.1 isn't on master (`guestSession.ts` is absent from origin/master), so it was never deployed and no legacy cookie exists. |
| N2 | `restore.sh` trap | `scratch` is global and the trap is single-quoted, so it expands at exit. `psql()` is a global function, and the trap is set before CREATE. `exit 1` (no dump) happens before the trap. **OK.** |
| N1 | Retention | **L-R1** above. |

#### Mutations (one per fix, touched tests)

M1 binding off → 5 failed. L2 canonical check off → 1. L1 takeover re-key off → 1. **L1 restore re-key off → 0 (N-R1).** L3 race off → 1. **L3 shared fallback off → 0 (N-R2).** L4 limiter off → 1. L4 log gate off → 1. L5 name `tdg` → 8. L6 no-store off → 1. N1 back to `${keep}d` → 1 (the test pins the wrong value: L-R1). N2 trap off → 1.
