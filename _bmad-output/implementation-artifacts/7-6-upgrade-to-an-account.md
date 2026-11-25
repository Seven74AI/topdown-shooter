# Story 7.6: Upgrade to an account

Status: review

<!-- Epic 7 progression story 6 of 7. Story file 2026-11-24 (gds-create-story, non-interactive) from the real code on master 7385b47. Designer decisions D9 (save nudge after the first run banking ≥ 200), D10 (username + password + one-time 12-character recovery code, no email) and D11 (logging in merges a device's guest progress) are rules here. Readiness U1/Q6/Q8 applied (entry points, merge of later fields, the Results nudge lives here). -->

## Story

As a player,
I want to turn my guest profile into an account with a username and password,
so that I keep my progress on a new phone.

> **Brief.** EPIC 6 BRIEF lines **1, 3, 4** (beat the rule: accounts are the first thing in the game worth stealing), **9, 17, 18** (say what wasn't verified: real phones' password managers), **19, 29, 31, 32**.

> **Scope:** account routes (save, log in, forgot password, log out), Argon2id hashes, the recovery code, merging a device's guest into an account, the start-screen and hub entry points, the one-time Results nudge. **Not here:** email, password change while logged in, deleting an account (open question), social login.

## Acceptance Criteria

### Fairness / player-visible rules (each is a test)

- **A1 "Saving never loses anything."** Turning my guest into an account keeps every bit of progress (same account row; only username and hashes are added) (FR77).
- **A2 "Logging in on a phone that has its own guest progress merges it."** Unlocks joined, Supplies and lifetime Supplies added, the higher level of each Training boost, districts joined; every later progress field by its story's rule (7.10: the account's look kept unless it is the default; 7.11: cosmetics joined, stats added); the guest is then retired (D11). Nothing paid for is lost (decisions 7.6 D1, D2).
- **A3 "Nobody can guess their way in."** At most 5 login / recovery attempts per IP per minute ("Too many attempts, try again in a minute", NFR12); errors never say which part was wrong ("Wrong username or password", "Wrong username or code"); passwords and recovery codes are stored only as Argon2id hashes.
- **A4 "Forgetting my password isn't the end."** Username + recovery code + a new password resets it; the old code stops working and a new code is shown once (D10).
- **A5 "My account is mine on every phone I log into."** After a login the phone's guest token (cookie and `localStorage`) points at the account; my progress loads; logging out turns that phone into a new, empty guest and never touches the account.

### Behaviour

1. **Migration 0003** (as built: Drizzle's own number, tag `*_accounts_devices`, decision 7.6 B9) (this story's own tables, readiness Q6): `device_tokens (token_hash PK, account_id FK, created_at, last_seen_at)` filled from `accounts.guest_token_hash`, which is then dropped (7.1's lookups move to `device_tokens`); `accounts` gains `username_lower` (unique, nullable), `merged_into` (nullable FK), `save_nudged` (bool false). One account can now have several devices.
2. **Save my progress** `POST /account/upgrade` `{ username, password }` (cookie = the guest): username 3–20 characters, letters, digits, `_`, `-`, `.`, unique ignoring case ("That name is taken"); password 8–128 characters. Hash with Argon2id (`@node-rs/argon2` 2.2, architecture; parameters 19 MiB memory, 2 passes, 1 lane — the OWASP minimum, decision 7.6 D4). Generates the recovery code: 12 characters from the 32-letter Crockford set (no 0/O, 1/I/L, U), shown `ABCD-EFGH-JKMN`, stored as an Argon2id hash. Response `{ ok, username, recoveryCode }`. Already a full account → 409.
3. **Recovery code screen** (shown once, after save and after a reset): the code big, "Screenshot this: it's the only way back in if you forget your password", a **Copy** button, and "I saved it" to close (decision 7.6 D3).
4. **Log in** `POST /account/login` `{ username, password }`: wrong → 401 "Wrong username or password". Right: if the device's current account (cookie/token) is a **guest** with any progress, merge it (AC 6) in one transaction; re-point the device's token row to the account (as built: a FRESH token row, the old one deleted, decision 7.6 B1); respond with the new session (`ticket`, `progress`, `account`). A device on another full account just switches (no merge).
5. **Forgot password** `POST /account/recover` `{ username, code, newPassword }`: input code case-insensitive, dashes optional; wrong → 401 "Wrong username or code"; right → new password hash, new code (shown once), old code dead; the device is logged in as after AC 4.
6. **Merge** (`apps/server/src/meta/merge.ts`, D11, A2): one transaction locking both progress rows (`FOR UPDATE`, account row first by id order to avoid deadlocks): `unlocks` union, and for every unlock both had, its price refunded into Supplies (D1); `supplies` and `lifetime_supplies` added; `training` the higher level per boost, and the Supplies the other side spent on that boost's lower levels refunded (D2); `districts` union; `run_rewards` rows re-pointed (as built: kept under the guest id, a late bank of the guest pays the account, decision 7.6 B2); the guest's `device_tokens` re-pointed; guest `merged_into = account`. A **merge-writers list** that 7.9/7.10 (look), 7.11 (cosmetics, stats) and Epic 8 (saved runs) add their own rule to; a test fails if a `progress` column has no merge rule (reads the Drizzle schema).
7. **Log out** `POST /account/logout`: confirm "This phone will play as a new guest. Your account is safe."; the server mints a new guest token + account for the device and sets the cookie; the client replaces its `localStorage` copy.
8. **Limits** (A3): one `SlidingWindowLimiter(5, 60_000, ipKey)` (`net/rateLimit.ts:50`) shared by login and recover, counting every attempt (right or wrong); upgrade and logout are cookie-bound and use 7.3's per-account limiter. Argon2 runs on the libuv thread pool (async API): never on the tick thread.
9. **Entry points** (readiness U1). Start screen (`StartScreen.tsx`): a guest sees **Save my progress** and **Log in** under the name field; a logged-in player sees "Logged in as mo_42" and **Log out**. The Progress hub header (7.3) has the same. The login form has **Forgot password**. Account actions are refused while the device is in a room (lobby or run) except **Save my progress** (the account id doesn't change), with "Leave the game first".
10. **Results nudge** (D9, the line 7.2 leaves for this story): after the first run that banks ≥ 200 Supplies for a guest, the Run rewards panel shows **Save my progress** once; `accounts.save_nudged` set when shown (server sends `nudge: true` in `run.rewards` and sets the flag in 7.2's transaction).
11. **Logs**: `account_upgraded`, `login_ok`, `login_failed {ip}`, `recover_ok`, `recover_failed {ip}`, `account_merged {guestId, accountId, refunded}`, `logout` — never a password, code or token.

## Tasks / Subtasks

- [x] **T1 Migration + repos** (AC 1): `drizzle/0002_accounts_devices.sql` (B9), `accountsRepo` (`findByUsernameLower`, `setCredentials`; device lookups through `device_tokens`), `deviceTokensRepo` (`logIn`, `logOut`), 7.1's session lookup moved to `device_tokens`.
  - `apps/server/src/db/deviceTokens.test.ts` > "brief 21: the 7.6 migration runs forward on a copy of the previous schema with guests in it: each token becomes a device row"
  - `apps/server/src/db/db.test.ts` > "the committed SQL creates exactly four tables …", "applies once, and a second run is a no-op …"
  - `apps/server/src/db/deviceTokens.test.ts` > "A1: saving a guest keeps the same account row and progress …", "AC 2: a username is unique ignoring case …"
- [x] **T2 Crypto** (AC 2, 5): `auth/passwords.ts` (Argon2id 19 MiB / 2 / 1, async; dummy verify for a missing name), `auth/recoveryCode.ts` (`crypto.randomInt`, Crockford 32), shared `normaliseRecoveryCode` / `formatRecoveryCode` / `isCompleteRecoveryCode`.
  - `apps/server/src/auth/accountAuth.test.ts` > "A1: the guest becomes an account in place …" (code format, password + code hashes verify)
  - `apps/server/src/auth/accountAuth.test.ts` > "A3: wrong name and wrong password give byte-identical answers; a missing name still runs one Argon2 verify"
  - `apps/server/src/auth/accountAuth.test.ts` > "A4: username + code (lower case, no dashes) + new password …"
- [x] **T3 Routes** (AC 2, 4, 5, 7, 8, 11): `auth/accountAuth.ts` + `accountRoutes.ts` (upgrade, login, recover, logout); `loginIpLimiter` 5/min/IP shared by login + recover, `loginNameLimiter` (B3), action limiters (B4); generic errors; logs; room guard (`auth/devicesInRooms.ts`, B12).
  - `apps/server/src/auth/accountAuth.test.ts` > "AC 2: taken (any case), already an account, bad name, bad password, no cookie"
  - `apps/server/src/auth/accountAuth.test.ts` > "A2 + A5: a guest phone with progress logs in: merged (refund), new token in the cookie, the old token is a stranger now"
  - `apps/server/src/auth/accountAuth.test.ts` > "A3 / AC 8: the 6th attempt in a minute from one IP gets 429, right or wrong; login and recover share the limit"
  - `apps/server/src/auth/accountAuth.test.ts` > "A3: six attempts from six addresses are all evaluated; brief 19: one name gets at most 10 a minute from anywhere"
  - `apps/server/src/auth/accountAuth.test.ts` > "AC 9: log in while the phone is in a lobby → 409 in_room (nothing changed); Save my progress is allowed there"
  - `apps/server/src/auth/accountAuth.test.ts` > "A5: the phone becomes a new empty guest (new cookie); the account still loads on a second phone; a guest can't log out"
  - `apps/server/src/auth/accountAuth.test.ts` > "logs account_upgraded, login_ok, login_failed {ip}, recover_ok, recover_failed {ip}, account_merged, logout, and never a secret"
- [x] **T4 Merge** (AC 6): `meta/merge.ts` (`MERGE_RULES` writers list, `mergeProgress`), `deviceTokensRepo.logIn` (one `boundedTransaction`, both rows locked in id order), the bank of a merged guest (`progressRepo.addSupplies`, B2), the nudge (AC 10).
  - `apps/server/src/db/mergeRules.test.ts` > "every progress column (read from the Drizzle schema) has a merge rule, and no rule names a missing column" (+ the compile-time check in `deviceTokensRepo.ts`)
  - `apps/server/src/db/mergeRules.test.ts` > "A2: the story's example: … = 770 …", "D2: …", "beat the rule 2: merged Supplies never exceed both sides' Supplies plus everything they spent …"
  - `apps/server/src/db/deviceTokens.test.ts` > "A2 / AC 6: logging in a guest device merges it in one transaction (770) …", "a guest is merged once …", "a device already on another FULL account just switches …", "a reset's credentials are written only if the recovery hash is still the verified one …", "A5 / AC 7: …", "beat the rule 4: a run that ends after its guest was merged pays the ACCOUNT …", "AC 10: a guest's first bank of ≥ 200 nudges once …"
  - `apps/server/src/db/realPostgresAccounts.test.ts` (real PostgreSQL 16, `TEST_DATABASE_URL`) > "10 guest phones logging into one account at once …", "merges in both id orders at once … never deadlock, ×10", "a bank of a guest and that guest's merge at the same moment … exactly once, ×20", "two banks of one guest at once, both ≥ 200: no deadlock on the nudge flag …", "two guests saving the same name (different case) at once: exactly one gets it", "two resets with the same recovery code at once: one wins …"
- [x] **T5 Client** (AC 3, 9, 10): `ui/AccountScreen.tsx` (Save / Log in / Forgot password forms with `autocomplete` username / new-password / current-password, recovery-code card, log-out confirm, `AccountLineView`), `ui/accountModel.ts`, `net/accountStore.ts`, `net/account.ts` calls (adopt the new session: token, ticket cache, account line, progress), StartScreen + hub header lines, the Results nudge (last row, brief 26 group 4).
  - `apps/client/src/ui/accountModel.test.ts` (7 tests: form rules, Next off until the code is complete, room guard, Back, account line, nudge)
  - `apps/client/src/net/accountActions.test.ts` > "A5: a login answer replaces the localStorage token, drops the cached ticket …", "refusals show the server's reason text …", "upgrade: …", "recover and logout adopt the new session …"
  - `tools/checks/accountWiring.test.ts` (R2: 5 source checks; each fails when its hookup line is deleted)
  - `tools/checks/accountDomLayout.test.ts` (R9 / brief 13: 9 screens × 4 sizes + the keyboard-open strip, 42 tests) and `tools/checks/resultsDomLayout.test.ts` > "… Story 7.6: a guest's first ≥ 200 bank with the Save my progress nudge …"
- [x] **T6 Tests + gate + hand-back.** Gate line below; screenshots `docs/art/epic-7/built/7-6-*.png`.

## Dev Notes

### Current state (read before changing)

- After 7.1: `accounts` (id, username, password_hash, recovery_code_hash, guest_token_hash, display_name, created_at), `progress` (supplies, lifetime_supplies, unlocks, training, districts); `POST /account/session` resolves the device by cookie `tdg` → `localStorage` token; session ticket in join options. 7.2 adds `run_rewards`, 7.3/7.5 the unlock/training routes with `requestId` and a per-account limiter, 7.7 writes `districts`.
- **Today (master):** none of it exists. HTTP is Colyseus `createRouter` (`app.ts:33`, `/health` only); bodies ≤ 2 KB (`net/httpGuard.ts:4`); `SlidingWindowLimiter` + `ipKey` (`net/rateLimit.ts:10-26, 50-92`; IPv6 by /64) and `roomCreateLimiter` (`:98-103`), reset in `test/bootTestServer.ts:21-29`; client IP from `X-Real-IP` set by Caddy from `Cf-Connecting-Ip` (`deploy/Caddyfile:32-44`).
- **Start screen** (`ui/StartScreen.tsx`): name in `localStorage` `topdown.name` (`:7-22`), Create (`:123`), Join (`:147`), Practice solo (`:161-168`); keyboard/gamepad menu navigation (`input/menuInput.ts`).

### What must keep working

7.1's P1–P5 (guests, cookie fallback, playing with the database down — account actions then show "Can't reach the save server, try later"), every room join (the ticket path is unchanged), 7.3/7.5 routes (account by device token row now), share-link focus on the name field.

### Testing (A1–A5 each a named test; PGlite)

- A1: guest with Supplies/unlocks/training → upgrade → same account id, same progress, username set, `password_hash` verifies, recovery hash verifies the shown code.
- A2: device guest (unlocks: mine; Supplies 120; training HP 2) logs into account (unlocks: mine, chainsaw; Supplies 400; HP 3): result unlocks {mine, chainsaw}, Supplies 400 + 120 + 100 (mine refunded) + 150 (guest's HP 1+2 refunded: 50 + 100) = 770, lifetime added, HP 3; guest `merged_into` set; the device's token now resolves to the account; the merge-rule test lists every `progress` column.
- A3: 6th attempt in a minute from one IP → 429 text; 6 attempts from 6 IPs → all evaluated; wrong username and wrong password give byte-identical answers; timing: a missing username still runs one Argon2 verify (against a fixed dummy hash) so it isn't faster.
- A4: reset → old password and old code fail, new ones work, a new code returned.
- A5: log out → the device has a new empty guest; the account still loads on a second device.
- Room guard: login while in a lobby → refused "Leave the game first"; Save while in a lobby → allowed.
- Nudge: first ≥ 200 bank for a guest → `nudge: true` once; second time false; full accounts never.
- Mutations: merge Supplies with `max` instead of `+` → A2 fails; drop the dummy verify → the timing test fails; count only failures in the limiter → A3 "right or wrong" test fails.

### Beat the rule (reviewer start list)

1. **Cheating / stealing:** brute-force a friend's password (5/min/IP; Argon2 cost); guess a recovery code (60 bits, 5/min/IP); enumerate usernames by login errors (identical) — **but** "That name is taken" on Save does reveal a name exists (accepted: names are shown in lobbies anyway; note it); log in as someone and merge your guest into them (only adds to their account: nothing lost, D11); replay a login body (needs the password anyway).
2. **Farming by merging:** farm Supplies on several guest phones, then merge them all into one account — allowed (each Supply was earned in a real run); training refunds can't create Supplies beyond what was spent (test: total after merge ≤ sum of both sides' supplies + spent).
3. **Losing progress:** merge fails mid-way → one transaction, nothing changed; log out by mistake → log in again (the account is untouched); forgot password and lost the code → no way back (accepted, D10 "no email"; the screen says so).
4. **Two devices:** both logged in, both bank runs at once (7.2 `FOR UPDATE`); log in on device B while device A is in a run → A's run banks to the account as normal.
5. **Offline:** account buttons say "Can't reach the save server"; nothing is half-done on the phone.
6. **Session hijack:** the cookie is HttpOnly; the `localStorage` copy is readable by anyone holding the unlocked phone (7.1 D5: a house key).

### Notes for the merge

- `apps/server/src/auth/*`, `app.ts` routes: 7.1 (session), 7.3 (unlock), 7.5 (training), **7.10** (other writer: look) add routes; keep one `routes` object.
- `meta/merge.ts` writers: **7.9/7.10** (`look`), **7.11** (`cosmetics`, `stats`), **8.4** (saved runs' player rows) each add a rule; the column test makes a missing rule fail.
- `StartScreen.tsx`: 7.1 (name prefill), 7.3 (Progress button).
- `ResultsScreen.tsx`: the nudge is the last line of 7.2's panel (after 7.11's item, 7.12's loot, 7.7's district).

### Dependencies

7.1 (accounts, cookie, session), 7.2 (Run rewards panel and transaction for the nudge), 7.3 (hub header). The merge rules for 7.9–7.12's fields are written by those stories (other writer), so 7.6 can ship before them. Independent of 7.4, 7.5 (only their columns are merged), 7.7.

### Decisions to confirm (recommended first, alternative after)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.6 D1 | Both the phone's guest and the account bought the same unlock | **Its price is refunded as Supplies** (nothing paid is wasted) (kept once, the guest's Supplies spent on it are lost) |
| 7.6 D2 | Both trained the same boost to different levels | **Keep the higher level and refund what the other side spent on that boost** (keep the higher level only) |
| 7.6 D3 | Closing the recovery-code screen | **Only with "I saved it"** (a Close button like any screen) |
| 7.6 D4 | Password hashing strength | **The OWASP minimum for Argon2id (19 MB, 2 passes): ≈ 50 ms per login on the VPS** (stronger: 64 MB, slower logins, more memory on a shared VPS) |
| 7.6 D5 | Logging out | **The phone becomes a new empty guest; the account is untouched** (no Log out button: only "Log in as someone else") |
| 7.6 D6 | Many wrong guesses at one username from many addresses | **Only the per-address limit (5 a minute)** (also lock a name for 10 minutes after 20 wrong tries: stops a big attack, but anyone could lock a friend out) |

### Needs a look?

**Yes: the account screens** — the start-screen account row (guest: "Save my progress · Log in"; logged in: "Logged in as mo_42 · Log out"), the same in the hub header, the Save / Log in / Forgot password forms on a landscape phone with the keyboard up (568 × 320 leaves little room: the form must scroll or sit beside the keyboard), the **recovery-code card**, the log-out confirm, and the Results "Save my progress" nudge line. The designer picks from code-drawn proposals before this story is built.

### References

- `epics.md` › Story 7.6; FR77; NFR12; GDD › Multiplayer Considerations (Accounts); `docs/ideas/epic-7/proposal.md` § 0 D9–D11, § 5; readiness report U1, Q6, Q8; architecture › Accounts, Security (line 576).

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, `gds-dev-story`), 2026-11-25 overnight run.

### Gate

GATE_LINE_PLACEHOLDER

### Debug Log References

- Mutations (each made, test run, file restored by copy): merge Supplies with `max` instead of `+` → `mergeRules.test.ts` 2 failed; dummy Argon2 verify removed → `accountAuth.test.ts` "A3 … one Argon2 verify" failed; login limiter counting only failed attempts → `accountAuth.test.ts` "A3 / AC 8 … right or wrong" failed.
- drizzle-kit 0.31 asks "rename or create?" on a TTY when one migration adds and drops text columns: generated in two passes and folded into one migration (B9; the generator script lives in the builder's scratchpad, the steps are in B9).
- Real PostgreSQL: a local PostgreSQL 16 cluster (`/usr/lib/postgresql/16`, port 2765), `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:2765/t76`; PG 16 has no `transaction_timeout`, so the pre-COMMIT budget path of `boundedTransaction` is the one exercised (production 18 adds the in-database cut).

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.6 D1–D6 accepted 2026-11-25 ("Okay, for all": D1 refund doubled unlocks, D2 higher Training + refund, D3 "I saved it" only, D4 OWASP-minimum Argon2id, D5 logout = new empty guest, D6 per-address limit).
- Build-time choices **7.6 B1–B17** in `docs/epic-7-decisions.md` (all "auto-accepted (designer: follow the GDS recommendation)"). The ones that change the story's text: B1 a fresh device token at login/reset (not the same row re-pointed), B2 `run_rewards` stay under the guest id (a late bank of the guest pays the account), B3 a per-username limit on top of the per-IP one (brief 19), B9 the migration number.
- **Token hand-over (7.1 M1).** The 7.1 ticket is bound to the token hash. After a login or reset the device has a NEW token (row → account), the response's ticket is signed for (account, new token), the server sets the new cookie and the client writes the new token to `localStorage` and drops its cached seat-recovery ticket (`forgetTicket`). An old ticket names the old token, which no longer exists, so it can't seat anyone as the account or as the retired guest. Logout does the same with a new guest. Save my progress keeps the token and the account id (tickets stay valid; allowed in a room).
- **Merge (D11, A2).** One `boundedTransaction`: device row FOR UPDATE → both `accounts` rows FOR UPDATE in id order (re-checks the guest is still an unsaved, unmerged guest) → both `progress` rows FOR UPDATE in id order → `mergeProgress` (writers list) → account row updated, guest's progress row deleted, `merged_into` set, guest's device rows deleted. The bank locks the seat's `accounts` row FOR NO KEY UPDATE first, so a bank and a merge of one guest serialize; a bank after the merge pays the account (B2). Real-PostgreSQL races (10 phones into one account, crossed id orders ×10, bank vs merge ×20 in both orders, two nudging banks, name race, code race) all pass.
- **Beat the rule (start list, results):** brute force — 5/min/IP shared by login + recover, 10/min per name from anywhere, Argon2id ≈ 13 ms/verify here; recovery code 60 bits under the same limits; username enumeration — byte-identical 401s, a missing or malformed name still runs one verify (test), but "That name is taken" on Save reveals a name (accepted, story); merging your guest into someone else's account only adds to it (D11); farming by merging — allowed, and the sum test proves refunds never create Supplies; a merge failing mid-way rolls back (one transaction); two devices banking at once — `FOR UPDATE` (7.2) + the new NKU lock, tested on real PG; a copied guest key after a login — dead (B1); a hand-made `accountId` in a body — 400 `invalid_body` (strict schemas); a client claiming "nudge shown" — not a client path (B13).
- **Privacy (brief 28):** no email, no IP in the database (IP only in rate-limit log lines, as 7.1); the username is never shown to other players (the lobby keeps the display name).
- Bandwidth: no in-run traffic added (HTTP only; `run.rewards` gains an optional `nudge` boolean once). No balance file change (progression.json is not in `balanceVersion`, 7.3 B14).

### Notes for the merge

- **Migration:** `apps/server/drizzle/0002_accounts_devices.sql` + `meta/0002_snapshot.json` + journal entry, generated on story-7-3 (7.1 + 7.2's `0001_run_rewards`). **7.9's look migration** (`progress.look`) lands before 7.6 on master: when it does, DELETE my `0002_accounts_devices.sql`, its snapshot and journal entry, merge master, and REGENERATE (B9 steps: two passes — first with `guest_token_hash` still in `schema.ts`, then without — folded into one file, then add the `INSERT INTO device_tokens … SELECT guest_token_hash, id, created_at, now() FROM accounts;` statement before the drop). Never rename a migration (Drizzle skips a migration whose journal `when` is older than the last applied).
- **`meta/merge.ts › MERGE_RULES` (writers list):** 7.9/7.10 add `look: (a, g) => a ?? g` ("the account's look kept unless it is the default"; null = default); **7.11 adds `cosmetics` (union, like `unlocks`) and `stats` (added per key)**; 8.4 adds saved runs' rows. A missing rule fails `db/mergeRules.test.ts` and the typecheck of `db/deviceTokensRepo.ts` (`everyColumnHasARule`). When 7.9 lands its `look` column, add the `look` rule in the same merge, and add `look: r.look` to `viewOf` in `db/deviceTokensRepo.ts` (7.9 adds `look` to `Progress`); 7.9's `look.db.test.ts` inserts `accounts (guest_token_hash, …)` on the pre-7.6 schema only (a migration test): check it still runs before my migration.
- **`db/progressRepo.ts › addSupplies`:** 7.6 adds the `accounts` row lock + `payee` (merged guest → account) + the nudge at the end; 7.7/7.11/7.12 writers inside the bank should write to `payee` (not the seat's `accountId`) for progress columns, and keep `run_rewards` keyed by the seat's id.
- **`db/accountsRepo.ts`:** `guestTokenHash` is gone from `accounts`; any branch that still inserts `accounts.guest_token_hash` (7.9's tests, 7.7+7.11+7.12 tests) must create guests through `accountsRepo.createGuest(tokenHash, name)` (it now writes `device_tokens`).
- **`auth/accountRoutes.ts` / `app.ts`:** one `routes` object: `createRouter({ health, accountSession, accountUnlock, accountUpgrade, accountLogin, accountRecover, accountLogout })`; 7.4+7.5 (training) and 7.10 (look) append theirs. `tools/checks/progressHubWiring.test.ts` now accepts appended routes.
- **`progression.json`:** new `training { maxLevel, costPerLevel }` (7.5 extends the object: keep both keys, its `boosts` go beside them) and `account { saveNudgeSupplies }`. `progression.test.ts` builds files with both keys.
- **`ResultsScreen.tsx`:** the nudge is the last row of `RunRewardsCard` (brief 26 group 4); 7.11 / 7.12 / 7.4 / 7.7 rows go ABOVE it (`rewardsWiring.test.ts` now accepts the extra prop).
- **`StartScreen.tsx`:** the account line is the first child of `.menu` (above the title); `ProgressScreen.tsx`: the compact line is the header's last child (7.10's tab bar is untouched).
- **`RunRoom.ts`:** two lines (register the room's device reader in `onCreate`, unregister in `onDispose`).
- **`net/account.ts`:** `accountSession` feeds `accountStore`; `progressStore` ↔ `account.ts` import each other (function declarations only at module scope; keep it that way).

### Not verified

- Real phones' password managers (Chrome Android / iOS Safari offering to save and fill: the fields carry `autocomplete="username"`, `"new-password"`, `"current-password"` in a `<form>`), the real landscape keyboard (the strip is emulated at 568×130 / 800×150), clipboard Copy on iOS Safari (try/catch; "Copy" stays if it fails).
- Argon2 timing on the VPS (≈ 13 ms per hash/verify on this container; D4 estimated ≈ 50 ms) and its memory under many parallel logins (19 MiB each on the libuv pool, 4 threads by default).
- The Alpine Docker image installing `@node-rs/argon2`'s musl binary (`npm ci` in the image can't run here: HANDOFF §9 TLS interception); CI builds the image.
- PostgreSQL 18 (`transaction_timeout`): the real-PG tests ran on PostgreSQL 16 (PGlite 18 for the rest).
- The migration on the production database copy (only on PGlite / PG 16 with rows).

### File List

- apps/server/drizzle/0002_accounts_devices.sql (new), apps/server/drizzle/meta/0002_snapshot.json (new), apps/server/drizzle/meta/_journal.json
- apps/server/package.json, package-lock.json (`@node-rs/argon2` 2.2.2)
- apps/server/src/db/schema.ts, accountsRepo.ts, progressRepo.ts, deviceTokensRepo.ts (new); tests db.test.ts, runRewards.test.ts, deviceTokens.test.ts (new), mergeRules.test.ts (new), realPostgresAccounts.test.ts (new)
- apps/server/src/meta/merge.ts (new), banking.ts, banking.test.ts
- apps/server/src/auth/accountAuth.ts (new), passwords.ts (new), recoveryCode.ts (new), devicesInRooms.ts (new), accountRoutes.ts, accountAuth.test.ts (new), guestSession.test.ts
- apps/server/src/app.ts, net/limits.ts, net/rateLimit.ts, rooms/RunRoom.ts, test/bootTestServer.ts
- packages/shared/src/net/account.ts, net/messages.ts, config/progression.json, config/progression.ts, config/progression.test.ts, index.ts
- apps/client/src/ui/AccountScreen.tsx (new), accountModel.ts (new), accountModel.test.ts (new), App.tsx, StartScreen.tsx, ProgressScreen.tsx, ResultsScreen.tsx, uiState.ts, overlay.css
- apps/client/src/net/account.ts, accountStore.ts (new), accountActions.test.ts (new)
- tools/checks/accountDomLayout.test.ts (new), accountWiring.test.ts (new), resultsDomLayout.test.ts, progressHubWiring.test.ts, rewardsWiring.test.ts
- docs/deploy.md, docs/epic-7-decisions.md, docs/art/epic-7/built/7-6-*.png (11 screenshots), _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: built (builder session, branch story-7-6); status review.
