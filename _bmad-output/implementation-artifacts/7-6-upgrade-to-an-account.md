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
- **A4 "Forgetting my password isn't the end."** Username + recovery code + a new password resets it; the old code stops working and a new code is shown once (D10); every other phone on the account is logged out (review M2: the card says so).
- **A5 "My account is mine on every phone I log into."** After a login the phone's guest token (cookie and `localStorage`) points at the account; my progress loads; logging out turns that phone into a new, empty guest and never touches the account.

### Behaviour

1. **Migration 0003** (as built: Drizzle's own number, tag `*_accounts_devices`, decision 7.6 B9) (this story's own tables, readiness Q6): `device_tokens (token_hash PK, account_id FK, created_at, last_seen_at)` filled from `accounts.guest_token_hash`, which is then dropped (7.1's lookups move to `device_tokens`); `accounts` gains `username_lower` (unique, nullable), `merged_into` (nullable FK), `save_nudged` (bool false). One account can now have several devices.
2. **Save my progress** `POST /account/upgrade` `{ username, password }` (cookie = the guest): username 3–20 characters, letters, digits, `_`, `-`, `.`, unique ignoring case ("That name is taken"); password 8–128 characters. Hash with Argon2id (`@node-rs/argon2` 2.2, architecture; parameters 19 MiB memory, 2 passes, 1 lane — the OWASP minimum, decision 7.6 D4). Generates the recovery code: 12 characters from the 32-symbol Crockford set (digits 0–9 and the letters without I, L, O, U; review L3: a typed O reads as 0, I and L as 1), shown `ABCD-EFGH-JKMN`, stored as an Argon2id hash. Response `{ ok, username, recoveryCode }`. Already a full account → 409.
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
  - `tools/checks/accountUpgradeWiring.test.ts` (R2: 5 source checks; each fails when its hookup line is deleted)
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

1. **Cheating / stealing:** brute-force a friend's password (5/min/IP; Argon2 cost); guess a recovery code (60 bits, 5/min/IP); enumerate usernames by login errors (identical) — **but** "That name is taken" on Save does reveal a name exists (kept at 10 checks/min/address, decision 7.6 B18 — usernames are NOT shown to other players, brief 28); log in as someone and merge your guest into them (only adds to their account: nothing lost, D11); replay a login body (needs the password anyway).
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

Gate after the review fixes (2026-11-25, full, builder): commit f140d789 = story-7-6 merged with master 99ac898f (7.1, 7.2, 7.9, 7.3 landed) — typecheck ✓, lint ✓, test ✓ 480 files passed / 1 skipped, 4407 tests passed / 3 skipped (TEST_DATABASE_URL = local PostgreSQL 16: realPostgres + realPostgresAccounts ran), build ✓; 487.6 s of tests; load 1.11 at start, 4.84 at end (4-core container, this builder alone).

First gate (superseded): Gate (2026-11-25, full, builder): commit e43ab3f7 = story-7-6 (on story-7-3 18a328ad) merged with master c26d1bcf (7.1 + 7.2 landed) — typecheck ✓, lint ✓, test ✓ 467 files passed / 1 skipped, 4277 tests passed / 3 skipped (with TEST_DATABASE_URL = local PostgreSQL 16: 7.2/7.3 realPostgres + 7.6 realPostgresAccounts ran), build ✓; 476.7 s of tests; load 1.49 at start, 3.07 at end (4-core container, this builder alone).

### Debug Log References

- Mutations (each made, test run, file restored by copy): merge Supplies with `max` instead of `+` → `mergeRules.test.ts` 2 failed; dummy Argon2 verify removed → `accountAuth.test.ts` "A3 … one Argon2 verify" failed; login limiter counting only failed attempts → `accountAuth.test.ts` "A3 / AC 8 … right or wrong" failed.
- drizzle-kit 0.31 asks "rename or create?" on a TTY when one migration adds and drops text columns: generated in two passes and folded into one migration (B9; the generator script lives in the builder's scratchpad, the steps are in B9).
- Real PostgreSQL: a local PostgreSQL 16 cluster (`/usr/lib/postgresql/16`, port 2765), `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:2765/t76`; PG 16 has no `transaction_timeout`, so the pre-COMMIT budget path of `boundedTransaction` is the one exercised (production 18 adds the in-database cut).

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.6 D1–D6 accepted 2026-11-25 ("Okay, for all": D1 refund doubled unlocks, D2 higher Training + refund, D3 "I saved it" only, D4 OWASP-minimum Argon2id, D5 logout = new empty guest, D6 per-address limit).
- Build-time choices **7.6 B1–B17** in `docs/epic-7-decisions.md` (all "auto-accepted (designer: follow the GDS recommendation)"). The ones that change the story's text: B1 a fresh device token at login/reset (not the same row re-pointed), B2 `run_rewards` stay under the guest id (a late bank of the guest pays the account), B3 a per-username limit on top of the per-IP one (brief 19), B9 the migration number.
- **Token hand-over (7.1 M1).** The 7.1 ticket is bound to the token hash. After a login or reset the device has a NEW token (row → account), the response's ticket is signed for (account, new token), the server sets the new cookie and the client writes the new token to `localStorage` and drops its cached seat-recovery ticket (`forgetTicket`). Review L1: an old ticket is still a valid signature for ≤ 10 min, so a join re-checks that the ticket's token row still names its account (`RunRoom.ticketStillCurrent`, ≤ 1 s, save server down → the ticket as before); an old ticket after a log in, a reset or a log out seats unsaved. Logout does the same with a new guest. Save my progress keeps the token and the account id (tickets stay valid; allowed in a room).
- **Merge (D11, A2).** One `boundedTransaction`: device row FOR UPDATE → both `accounts` rows FOR UPDATE in id order (re-checks the guest is still an unsaved, unmerged guest) → both `progress` rows FOR UPDATE in id order → `mergeProgress` (writers list) → account row updated, guest's progress row deleted, `merged_into` set, guest's device rows deleted. The bank locks the seat's `accounts` row FOR NO KEY UPDATE first, so a bank and a merge of one guest serialize; a bank after the merge pays the account (B2). Real-PostgreSQL races (10 phones into one account, crossed id orders ×10, bank vs merge ×20 in both orders, two nudging banks, name race, code race) all pass.
- **Beat the rule (start list, results):** brute force — 5/min/IP shared by login + recover, 10/min per name from anywhere, Argon2id ≈ 13 ms/verify here; recovery code 60 bits under the same limits; username enumeration — byte-identical 401s, a missing or malformed name still runs one verify (test), but "That name is taken" on Save reveals a name (accepted, story); merging your guest into someone else's account only adds to it (D11); farming by merging — allowed, and the sum test proves refunds never create Supplies; a merge failing mid-way rolls back (one transaction); two devices banking at once — `FOR UPDATE` (7.2) + the new NKU lock, tested on real PG; a copied guest key after a login — dead (B1); a hand-made `accountId` in a body — 400 `invalid_body` (strict schemas); a client claiming "nudge shown" — not a client path (B13).
- **Privacy (brief 28):** no email, no IP in the database (IP only in rate-limit log lines, as 7.1); the username is never shown to other players (the lobby keeps the display name).
- Bandwidth: no in-run traffic added (HTTP only; `run.rewards` gains an optional `nudge` boolean once). No balance file change (progression.json is not in `balanceVersion`, 7.3 B14).

### Notes for the merge

- **Migration:** `apps/server/drizzle/0003_accounts_devices.sql` + `meta/0003_snapshot.json` + journal entry, regenerated after 7.9's `0002_look` (fresh `when`). Since review ops (B23) it no longer drops `accounts.guest_token_hash` (nullable, unused), so `drizzle-kit generate` runs in one pass; the data copy `INSERT INTO device_tokens … SELECT guest_token_hash, id, created_at, now() FROM accounts WHERE guest_token_hash IS NOT NULL ON CONFLICT DO NOTHING;` is appended by hand. If another migration lands first (7.7+7.11+7.12), delete mine, merge, regenerate the same way. Never rename one. 7.9's `look.db.test.ts` now keeps only the migrations BEFORE `0002_look` for its forward run.
- **`meta/merge.ts › MERGE_RULES` (writers list):** 7.9/7.10 add `look: (a, g) => a ?? g` ("the account's look kept unless it is the default"; null = default); **7.11 adds `cosmetics` (union, like `unlocks`) and `stats` (added per key)**; 8.4 adds saved runs' rows. A missing rule fails `db/mergeRules.test.ts` and the typecheck of `db/deviceTokensRepo.ts` (`everyColumnHasARule`). Done after 7.9 landed: `look: account ?? guest` in `MERGE_RULES`, `look` in `viewOf`; login / reset / logout answers carry `progress.look` like the session reply, and the phone's look copy (`deviceLook`) follows.
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

## Senior Developer Review (AI)

Reviewer: fresh reviewer cloud session (`gds-code-review`, three layers + beat the rule), 2026-11-25. Tree: `story-7-6` 10ad0adc merged with master c26d1bcf (already up to date, no conflicts); 7.6's own changes = `git diff origin/story-7-3...origin/story-7-6`. Checks run: `npm ci`, `npm run typecheck` ✓; probed/mutated tests only (no full gate, HANDOFF §3). Probes ran against a real server on port 5766 (`node --import tsx src/index.ts`, real PostgreSQL 16 on 2766, migrated) and throw-away vitest probes (PGlite + real PG, deleted after; kept in the reviewer's scratchpad).

**Verdict: changes requested — 2 medium, 7 low, 4 nits.** The core is solid: byte-identical and timing-identical login errors, Argon2id at the OWASP minimum off the tick with bounded memory, the merge is one bounded transaction that holds up under real-PG races, bank-vs-merge pays exactly once, the migration copies rows safely, and every mutation was caught. The two mediums are identity holes: a username can be locked out by two IPs (the exact harm D6 rejected), and a password reset doesn't log out the device of someone who stole the password.

### Findings

| ID | Sev | Where | Scenario | Minimal fix |
| --- | --- | --- | --- | --- |
| **M1** | Medium | `apps/server/src/auth/accountAuth.ts:137` (`precheck`), `net/limits.ts` `MAX_LOGIN_ATTEMPTS_PER_NAME_PER_MIN` (B3) | **Anyone can lock any account out of login AND recovery.** Measured on the live server: 2 IPs × 5 wrong guesses at `own_…` in one minute → the owner then types the RIGHT password from their own IP → `429 rate_limited`; recover (any case of the name) → `429` too. Two IPs (or one IPv6 /48) repeating it every minute keep the name locked indefinitely, at 10 Argon2 verifies a minute. This is precisely the harm D6 gave for rejecting a per-name lock ("anyone could lock a friend out"); B3's "one minute only, no lock-out" doesn't hold against a rolling attacker. | Keep the name budget but count it only on WRONG answers and check it after the verify: over the budget, refuse (429) every request whose `ipKey` already failed for this name in the window, but let a request from an IP with no failure for this name be evaluated (the attacker's IPs are the failing ones; the owner's is clean). Over the budget an attacker gets ~1 evaluated guess per fresh IP per minute (tighter than the 5/IP limit), and the owner is never locked out. Or go back to D6 (per-IP only) and log it as a designer call. Add a test: name over budget from IPs A, B → right password from C → 200. |
| **M2** | Medium | `apps/server/src/db/deviceTokensRepo.ts:97-123` (`logIn` with `credentials`) | **A password reset does not revoke other devices.** Live probe: owner saves; attacker learns the password and logs in on their phone (200); owner resets with the recovery code on another phone (200, new password, new code); the attacker's cookie then still resolves to the account (`/account/session` → `saved: true`, username, a fresh ticket) and keeps cookie-bound actions (`/account/unlock` reaches the purchase logic) for the cookie's 1 year. Forgot password is the only recovery path in a no-email design (D10), so it must evict a thief. | In the `credentials` branch, `DELETE FROM device_tokens WHERE account_id = $accountId` before the new row is inserted (same transaction); say so on the recovery-code card / story ("every other phone is logged out"). Test: device A logged in → reset from B → A's token resolves to nothing (a new guest). |
| L1 | Low | `apps/server/src/auth/ticket.ts` `verifyTicket` (pure), used at `rooms/RunRoom.ts:335`; claim in B1 + Completion notes "Token hand-over" | **Old tickets still work for 10 minutes; B1's text says they don't.** Probe: guest token + its ticket fetched before a login → after the login, `create` with the OLD token + OLD ticket seats with `accountId` = the retired guest (its banks then pay the account by B2). After a LOGOUT, the old token + cached ticket still seat as the full ACCOUNT for ≤ 10 min. Impact is small (earnings only flow into the account; spending is cookie-bound through `device_tokens`), but the story and the decision log state a guarantee the code doesn't give (R8). | Either check in `onAuth` (async, off the tick) that `device_tokens[tokenHash].account_id` still equals the ticket's account (DB down → today's behaviour), or correct B1 / the Completion notes to "an old ticket stays valid until it expires (≤ 10 min); its banks reach the account". |
| L2 | Low | `apps/server/src/auth/accountAuth.ts:143` vs `:162`/`:190` | **AC 9's room guard is check-then-act.** The room check runs before the Argon2 verify and the merge transaction. Probe: one device fires `/account/login` and a room `create` (old token + ticket) at once: **10/10 logins succeeded while that device was seated** as the guest. Result: a seated guest merged and its token rotated under it (its seat can no longer be recovered by the phone's new token/ticket on a drop; banks still pay the account). Needs two actions at once (the client blocks the form in a room), so low. | Re-check `deviceInRoom(oldHash)` right before `devices.logIn` (after the verify), and in `RunRoom.onAuth` refuse a token hash that is in a small "login in progress" set the auth code holds for the duration of the call. |
| L3 | Low | `packages/shared/src/net/account.ts:99-105`; story AC 2 text | **Recovery-code input doesn't do Crockford decoding.** The alphabet has `0` and `1` (the story says "no 0/O, 1/I/L" — 32 symbols can't exclude both), and `normaliseRecoveryCode` doesn't map `O→0`, `I/L→1`. A player who reads `E08N` from a screenshot and types `E O 8 N` gets "Next" disabled (`isCompleteRecoveryCode` false) or a wrong code. That code is the only way back in. | In `normaliseRecoveryCode` map `O→0` and `I`,`L→1` (Crockford decode); fix the AC 2 text (R8). |
| L4 | Low | `apps/server/src/db/deviceTokensRepo.ts:97-111` | **Deadlock on one device: a reset and a login at the same moment.** The `credentials` UPDATE locks the account row before the device row; a plain login locks the device row first and then the account. Real PG: 3 of 5 rounds `deadlock detected`, one side `503` after 1 s (the other side succeeded, nothing lost). Self-inflicted double-submit, so low. | Lock the device row first (move the `credentials` UPDATE after the device `SELECT … FOR UPDATE`). |
| L5 | Low (pre-existing pattern, now reaching 7.6 data) | `apps/server/src/db/boundedTx.ts:94`, `db/timeout.ts:38` | `db_error` logs `e.message.slice(0, 200)`, and Drizzle's message is `Failed query: … params: …`. Captured on real PG (the L4 deadlock): `"err":"Failed query: select \"account_id\" from \"device_tokens\" where … = $1 for update\nparams: a776de0f…"`, i.e. a device token hash; a failing reset UPDATE would log the head of the new Argon2 hash. `docs/deploy.md` and the story say logs carry "never a … hash"; `timeout.ts` itself says "never the arguments: they may hold token hashes". | Cut the logged message at `"\nparams:"` (both helpers); add one assertion to the logs test. |
| L6 | Low (designer) | `apps/server/src/auth/accountAuth.ts:105-107` | **Save my progress enumerates usernames** (`409 name_taken` for an existing name, any case; measured), at 30 names/min/IP with no Argon2 cost. The accepted reason ("names are shown in lobbies anyway") is not true: brief 28 and the Completion notes say a username is never shown to other players (the lobby shows the display name). Brief 19: "error texts never say whether a username exists". | Re-confirm with the designer with the correct reason; if kept, lower the name-check budget (e.g. 10/min/IP) and note that a known name makes M1 / brute force targetable. |
| L7 | Low (designer) | `apps/client/src/ui/AccountScreen.tsx` login form; D11 | **Logging in on someone else's phone silently absorbs that phone's guest progress, irreversibly.** Showing my account on a friend's phone (or an attacker with the victim's unlocked phone logging into their own account) moves the friend's Supplies/unlocks into my account; after Log out the friend has a new empty guest. D11 makes the device's guest merge, so this is by design, but the player gets no warning. | When the device is a guest with progress, show one line before Log in: "This phone's 340 Supplies and 2 unlocks will move into this account." (copy for the designer). |
| N1 | Nit | `packages/shared` `passwordSchema` | `12345678` is accepted (measured). With 10 guesses/min/name (~14 k/day) the most common passwords fall in minutes. | A small top-N common-password list check on Save / reset. |
| N2 | Nit | `deviceTokensRepo.ts:123`; B16 | A double-submitted login leaves orphan `device_tokens` rows (real PG: 3 rows after 2 logins from one phone, one never held by anyone) and `last_seen_at` is never refreshed, so no later cleanup can tell live rows from dead ones. | Accept; or touch `last_seen_at` on session calls at most once a day. |
| N3 | Nit | `apps/server/src/auth/passwords.ts:29` | The dummy hash is built on the first missing-name login after boot (that one answer costs a hash + a verify). | Build it at startup. |
| N4 | Nit | `apps/client/src/ui/AccountScreen.tsx:187` | `autocomplete="one-time-code"` on the recovery code makes iOS offer the last SMS code. | `autocomplete="off"`. |

Also R8: `docs/deploy.md:204` still says "each Epic 7 migration only adds"; 7.6's migration drops `accounts.guest_token_hash` (`drizzle/0002_accounts_devices.sql:20`), so `deploy/rollback.sh` to a 7.1–7.3 sha after this migration ran would break every session lookup and 7.1's guest insert (all players unsaved). Only matters if a pre-7.6 Epic 7 sha is ever deployed; fix the sentence (and/or keep the column nullable one release, drop later). Counted under L-level ops text, not a separate finding.

### Beat the rule (every attempt)

| # | Attempt | Result |
| --- | --- | --- |
| 1 | Username enumeration by login error bytes / status: existing, missing, malformed name | Held: all `401 {"message":"wrong_login"}`, byte-identical |
| 2 | Enumeration by timing (36 pairs, fresh IPs, real server) | Held: median 12.63 vs 12.64 ms and 10.05 vs 10.06 ms (exist vs missing); the dummy verify works |
| 3 | Enumeration by the per-name limiter (counts missing names?) | Held: missing names are counted the same (429 after 10) |
| 4 | Enumeration through Save's "That name is taken" | **Leaks** (accepted by the story, on a wrong reason) → L6 |
| 5 | Brute force: 6 names from one IP | Held: 5×401 then 429; recover from the same IP → 429 (shared) |
| 6 | IPv6 rotation inside one /64 | Held: 5×401 then 429 |
| 7 | IPv6 across six /64s | Bypasses the per-IP limit (by design); the per-name 10/min still caps one target |
| 8 | `X-Forwarded-For` rotation with a fixed `X-Real-IP` | Held: 429 on the 6th; Caddy overwrites `X-Real-IP` from `Cf-Connecting-Ip` and Node is not published |
| 9 | Lock the owner out with 2 IPs × 5 wrong guesses | **Owner's right password → 429; recover → 429** → M1 |
| 10 | Recovery-code brute force | Held: 60 bits under 5/min/IP + 10/min/name (≈ 10^14 years); code stored as Argon2id |
| 11 | Recovery code typed with letter O for zero | Fails (no Crockford decode) → L3 |
| 12 | Account takeover via reset, then the thief's device | **Thief stays logged in after the owner's reset** → M2 |
| 13 | Two resets with one code at once (builder's real-PG test) | Held: one wins, other 401 (re-ran: 6/6 real-PG tests pass) |
| 14 | Login while seated in a lobby | Held when sequential (409 in_room, test) |
| 15 | Login racing a room join on one device | **10/10 logins succeed while seated** → L2 |
| 16 | Double-submit login from one device (real PG ×10) | Held: merged exactly once, Supplies 107 every time; orphan device row → N2 |
| 17 | Double-submit upgrade | Held: conditional UPDATE, second → 409 already_account |
| 18 | Reset + login at once from one device (real PG ×5) | Deadlock 3/5, one side 503, nothing lost → L4 |
| 19 | Bank of a guest racing its merge, 250 Supplies (real PG ×10) + retry of the same run | Held: paid once (account 100 → 350), retry `banked:false`, guest row gone, nudge once; builder's ×20 test also passes |
| 20 | Late bank of a merged guest (B2) | Held: pays `merged_into` once (deviceTokens test + mutation M4) |
| 21 | Merge rules: Supplies added, unlock union + D1 refund, Training max + D2 refund, districts union, refunds to Supplies only (B7) | Held (mergeRules tests + mutation M1); lifetime never gets refunds (code read) |
| 22 | Old guest token + old ticket after login | **Still seats (as the retired guest) for ≤ 10 min**, B1 says not → L1 |
| 23 | Old token + cached ticket after logout | **Still seats as the account for ≤ 10 min** → L1 (can't spend) |
| 24 | A copied guest token after login (`/account/session`) | Held: an unknown token becomes a new empty guest |
| 25 | Logout on a guest | Held: 409 not_logged_in (B6, test) |
| 26 | Hand-made `accountId` / extra fields in bodies | Held: strict schemas → 400 invalid_body |
| 27 | Secrets in logs (462 live log lines grepped for the passwords, codes, cookie, `token`, `argon2`) | Held in the auth lines; `db_error` lines carry query params → L5 |
| 28 | Login flood: 200 concurrent logins from 200 IPs with 256-char passwords | Held: all 401, 702 ms total (~285 verifies/s, 4 libuv threads), p99 663 ms, `/health` during the flood 35 ms, peak RSS 131 → 213 MiB (+82 MiB ≈ 4 × 19 MiB: memory is bounded by the pool, not by the request count; server `mem_limit` 768m) |
| 29 | Database killed mid-probe (it happened: PG went down) | Held: every account call answered `503 save_unavailable`, sessions `saved:false`, server kept running and recovered when PG came back (P3) |
| 30 | Migration on real PostgreSQL 16 with rows: 0000+0001, 5000 guests + progress, then 0002 | Held: 5000 device rows, all joined to their account, Supplies sum unchanged, `guest_token_hash` gone; the `INSERT … SELECT` can't collide (column was `NOT NULL UNIQUE`) |
| 31 | An attacker logging into their account on the victim's phone | Works: victim's guest progress moves into the attacker's account (D11: the phone's holder decides). Needs the unlocked phone (7.1 D5 house key) → L7 asks for a warning line |
| 32 | AC1 forms at 568×320 + keyboard strip, autocomplete attributes, nudge position | Held: `accountDomLayout` 42/42 (R9 four sizes, insets 44/21, ≥ 44 px, ≥ 11 px, strip 568×130 / 800×150); `username` / `current-password` / `new-password` in a `<form>`; Results nudge is the last row (`7-6-results-nudge.png`, test). Real phones' password managers not verified (as the builder said) |

### Mutations (each new test file mutated once, restored with `git checkout`)

| Mutation | Test | Result |
| --- | --- | --- |
| M1 D2 Training refund not added to the total (`merge.ts`) | `db/mergeRules.test.ts` | 3 failed ✓ |
| M2 `merged_into` not set (`deviceTokensRepo.ts`) | `db/deviceTokens.test.ts` | 3 failed ✓ |
| M3 per-name limiter switched off (`accountAuth.ts`) | `auth/accountAuth.test.ts` | 1 failed ✓ |
| M4 bank's `FOR NO KEY UPDATE` on the seat's account removed (`progressRepo.ts`) | `db/realPostgresAccounts.test.ts` (real PG 16) | 2 failed ✓ |
| M5 `forgetTicket()` dropped from `adopt` (`net/account.ts`) | `net/accountActions.test.ts` | 1 failed ✓ |
| M6 Results no longer counts as "in a room" (`accountModel.ts`) | `ui/accountModel.test.ts` | 1 failed ✓ |
| M7 nudge prop unwired in `ResultsScreen.tsx` | `tools/checks/accountWiring.test.ts` + `rewardsWiring` | 1 failed ✓ |
| M8 `.ac-link` min-height 44 → 30 px | `tools/checks/accountDomLayout.test.ts` | 24 failed ✓ |

The builder's own three mutations (max instead of +, no dummy verify, limiter counting only failures) are listed in the Debug Log; not repeated.

### Brief / R-lines checked

R1 ✓ (every `[x]` task names tests; 14 named tests opened and found). R6 ✓ (Gate line: e43ab3f7 on story-7-3 18a328ad + master c26d1bcf, 467 files / 4277 tests, load 1.49→3.07). R8 ✗ (B1 ticket claim → L1; "no 0/O, 1/I/L" → L3; deploy.md "only adds"). Brief 15 ✓ (no client report changes progress; nudge flag is server-set, B13). 18 ✓ (merge and bank in `boundedTransaction`, real-PG races pass). 19 partly: argon2id ✓, hashed codes ✓, per-IP + per-account limits ✓ but M1, errors don't reveal a name on login/recover ✓ but Save does (L6), no secret in auth logs ✓ but `db_error` params (L5). 20 ✓ (DB down → 503 / unsaved, observed live). 21 ✓ (repositories only; migration forward on rows, PGlite test + real PG probe). 24 ✓ (AC1 header button + scrolling form, LF5 colours; screenshots match the `ac1.png` account line). 28 ✓ (no email, no IP in the DB, username not shown to others). R9 ✓ (`accountDomLayout`, four sizes + keyboard strip).

### Not verified by the reviewer

Real phones (password-manager save/fill, the real landscape keyboard, iOS clipboard); PostgreSQL 18 `transaction_timeout`; Argon2 timing on the VPS; the Alpine image's musl binary for `@node-rs/argon2`.

### Review fixes (builder, 2026-11-25)

| ID | Fix | Test (file > test name) |
| --- | --- | --- |
| M1 | `net/rateLimit.ts › NameFailureLimiter`: only WRONG answers count per name; over 10 a minute only an address that already failed for the name is refused (B3 amended) | `auth/accountAuth.test.ts` > "review M1: 2 addresses × 5 wrong guesses can't lock the owner out …", "A3: six attempts from six addresses are all evaluated; brief 19: …" (mutation: refuse every address → M1 test fails) |
| M2 | `deviceTokensRepo.logIn` with `credentials`: every device row of the account deleted in the reset transaction; the code card says "Every other phone on this account was logged out." Follow-up B24: a login that verified the old password and commits after the reset is stale | `auth/accountAuth.test.ts` > "review M2: a reset logs out every other phone …"; `db/deviceTokens.test.ts` > "review M2: a reset deletes every device row …", "a login whose verified password hash changed meanwhile …"; `db/realPostgresAccounts.test.ts` > "review M2 race: …" |
| L1 | `RunRoom.onAuth` → `ticketStillCurrent`: a valid ticket counts only while its token's device row names that account (≤ 1 s; DB down → as before); B1 / notes text corrected | `auth/accountAuth.test.ts` > "after a log in, the old guest token + its ticket seat unsaved …", "after a log out, …", "P3: the save server down or slow …" (mutation: trust every ticket → 3 fail) |
| L2 | `devicesInRooms` switch marks; `switching()` re-checks the room after the mark, right before the transaction; `onAuth` and `onJoin` refuse a marked token (B20) | `auth/accountAuth.test.ts` > "a token in the middle of a switch is refused at join …", "the room is re-checked right before the transaction …" (mutation: drop the re-check → fails) |
| L3 | `normaliseRecoveryCode`: O→0, I/L→1; AC 2 text | `ui/accountModel.test.ts` > "review L3: …"; `auth/accountAuth.test.ts` > "A4: …" (O/L typed for 0/1) |
| L4 | `deviceTokensRepo.logIn`: device row, then the account row, then the guest (one order) | `db/realPostgresAccounts.test.ts` > "review L4: a reset and a login from ONE device at the same moment never deadlock (both settle, ×10)" |
| L5 | `db/timeout.ts › dbErrText` cuts at "\nparams:" (both helpers + `supplies_bank_failed`) | `db/db.test.ts` > "never carries a query's parameters …" |
| L6 | B18: 10 name checks / min / address on Save; reason text corrected | `auth/accountAuth.test.ts` > "10 name checks a minute from one address, then 429 …" |
| L7 | B19: Log in warns "This phone's guest progress will be added to that account." for a guest with progress | `ui/accountModel.test.ts` > "review L7: …"; `tools/checks/accountUpgradeWiring.test.ts` |
| N1 | B22: common passwords refused (server + form) | `auth/accountAuth.test.ts` > "AC 2: …", "a too-short new password …"; `ui/accountModel.test.ts` |
| N2 | B16 amended: `touchDevice` once a day; cleanup SQL in deploy.md | `db/deviceTokens.test.ts` > "review N2: …" |
| N3 | `warmDummyHash()` at server start | `auth/accountAuth.test.ts` > "A3: …" (`dummyHashStarted`) |
| N4 | recovery field `autocomplete="off"` | `tools/checks/accountUpgradeWiring.test.ts` |
| Ops | B23: `guest_token_hash` kept nullable (no drop); deploy.md rollback sentence | `db/deviceTokens.test.ts` > "brief 21: the 7.6 migration runs forward …" (column nullable) |
| — | `tools/checks/accountWiring.test.ts` (7.1's) had been overwritten by mine: restored; 7.6's checks are `tools/checks/accountUpgradeWiring.test.ts` | both files run |

### Re-review (narrow) 1

Reviewer: fresh re-reviewer cloud session, 2026-11-25. Tree: `story-7-6` b37b3618 merged with master db0beb7 (no conflicts) on branch `rereview-7-6`; looked only at the fix commits (`git log --no-merges 10ad0adc..origin/story-7-6`: 107a0a1d M1, 449e8a4c M2/L4, cce34c04 L1/L2, e0aeb4a9 + f140d789 migration/look, plus the small L3/L5/L6/N fixes). `npm ci`, `npm run typecheck` ✓; touched tests (accountAuth, deviceTokens, realPostgresAccounts, look.db, mergeRules, db, guestSession, lookSession, RunRoom.account, RunRoom.rewards, accountWiring, accountUpgradeWiring) 113/113 ✓ with `TEST_DATABASE_URL` on a real PostgreSQL 16 (port 5767). Exploits ran as throw-away vitest probes over real HTTP + Colyseus against a server on real PostgreSQL (deleted after). No full gate.

**Verdict: fixes hold — M1, M2 (+ B24), L1, L2 do what they say on the direct paths; 2 low, 3 nits, none blocking.** RR1 is the accepted cost of the M1 design; RR2 is a ≤ 15 s window that both L1 and L2 miss.

| ID | Sev | Where | Scenario | Minimal fix |
| --- | --- | --- | --- | --- |
| RR1 | Low (designer, accepted trade-off of M1) | `net/rateLimit.ts › NameFailureLimiter` (keys addresses by `ipKey`, IPv6 /64) | The per-name budget no longer caps distributed guessing: a clean address is always evaluated once. Probe E1: 300 wrong guesses at one name from 300 /64s inside ONE /48 (`2001:db8:k:i::1`) → 300/300 evaluated (401), 0 refused; the owner from a clean address still 200. A single /48 (65 536 /64s, cheap on VPS hosts) gives ~65 k evaluated guesses/min/name vs 10/min before the fix. M1's own minimal fix predicted this ("~1 guess per fresh IP per minute"), so not a regression of the fix, but brief 19's "one name, few guesses" is now only as strong as the attacker's address count. | Key the NAME limiter's addresses coarser for IPv6 (e.g. /48 or /56 instead of `ipKey`'s /64), so a /48 counts as one failing address; or record it in B3 as accepted. |
| RR2 | Low | `rooms/RunRoom.ts` `onAuth` (`ticketStillCurrent`, `isSwitching`) vs `onJoin` (only `isSwitching`, sync); `auth/devicesInRooms.ts` (`deviceInRoom` sees members, not reserved seats) | **Both L1 and L2 can be stepped around through the seat reservation (Colyseus default 15 s).** E5 (real PG): the thief who logged in with the stolen password POSTs `/matchmake/create/run` with its token + ticket (onAuth passes, seat reserved), the owner resets (200, every device row deleted), the thief connects 3 s later (`consumeSeatReservation`) → seated with `accountId` = the owner, and `saveDisplayName` renamed the OWNER's display name to the thief's "PWNED". E7: a guest reserves a seat, then logs in on the same device (200: the room re-check sees no member, the mark is gone before the socket arrives) → seated with the dead old token + the retired guest id (the case L2 meant to close). Impact small (banks only pay the account / redirect; spending stays cookie-bound), but B20/B1 text says no seat can attach to the old token/ticket. | In `onJoin` also re-check the row (Colyseus allows an async `onJoin`; mark-check after the await) or keep the ticket's token hash in a "reserved" set from `onAuth` until join/expiry and let `deviceInRoom` read it; at least don't `saveDisplayName` from a ticket whose row is gone. Or narrow the B1/B20 wording to "not after the seat is reserved". |
| RR3 | Nit (P3, accepted) | `RunRoom.ticketStillCurrent`, `db/client.ts` pool `max: 5` | E6b: 5 pool connections held 1.5 s (`pg_sleep`) → the row check waits the full 1 s and the old ticket counts (fallback). So anyone who can keep the 5-connection pool busy > 1 s (general DB load; logins alone are rate-limited per address and their Argon2 runs off the pool and off the loop) keeps a ≤ 10 min old ticket seating. Same impact class as RR2. E6: DB answering in 1.9 s → join takes 1007 ms, seated with the account, never refused (P3 holds; the 1 s is added join latency only when the DB is slow). | None needed; mention in B21/P3 that the fallback is load-triggerable. |
| RR4 | Nit (pre-existing pattern) | `NameFailureLimiter.prune` | Memory is bounded by the window (40 k random names → 27.5 MB heap, 0 entries one window later: no unbounded growth), but `prune` walks every name on every call: 20 k `fail()` calls took 4.2 s, the next 20 k 9.5 s (~0.5 ms/call at 40 k entries). A /48 at 5 tries/min per /64 can hold ~330 k entries → several ms of event-loop time per login request. `SlidingWindowLimiter` has the same per-call prune. | Prune at most once per second (or keep a time-ordered queue), as for the other limiters when they're next touched. |
| RR5 | Nit (test) | `auth/accountAuth.test.ts` > "a token in the middle of a switch is refused at join (onAuth) …" | Mutation: delete the `isSwitching` refusal in `checkAuth` (onAuth) → the test still passes (the `onJoin` copy refuses instead). The onAuth check is untested on its own. | Assert on `RunRoom.onAuth(...)` directly, or rename the test. |

Not findings: E4 — a thief already SEATED when the owner resets keeps the owner's account on that seat for the run (takeover / held seat keep `old.accountId`, 7.1 D5); leaving and rejoining with the old ticket seats unsaved (L1 ✓). Gift-only (banks), noted for the designer.

**Attempts (all real PostgreSQL unless marked):**
- E1 M1 rotating addresses: 60 × 5 /64s of one /48 → 300 evaluated, 0 refused; owner (clean IPv4) 200 → owner not locked ✓ (RR1 for the guessing side).
- E1b owner typed one wrong password, then attackers pushed the name over budget → the owner's own address 429 until its failure ages out (≤ 60 s): acceptable as briefed.
- E2 memory DoS with random names (unit, fake clock): bounded by the window ✓; CPU per call grows with entries (RR4).
- E3 repo-level reset vs login (old password) on ANOTHER device ×20: outcomes `ok/ok` 18, `stale_credentials/ok` 2 (both orders hit); every round only the resetter's row names the account, the thief's new row and the old row gone ✓ (B24 + M2).
- E3b same race over HTTP ×20 (`/account/login` vs `/account/recover`): 20 × 200/200, the thief's new cookie never names the account afterwards ✓.
- E4 reset while the thief is seated (lobby): seat keeps the account; rejoin with the old ticket → unsaved ✓.
- E5 reset while the thief holds a seat RESERVATION → seated as the owner + display name renamed (RR2).
- E6 DB slow 1.9 s at join → 1007 ms, ticket kept, no refusal ✓. E6b pool saturated → fallback (RR3).
- E7 L2 join between mark and transaction: login while the device's seat is reserved → 200 and the seat attaches to the dead token (RR2). Crash mid-switch: the mark is an in-memory map released in `finally` (a throw inside `run()` clears it; a process crash clears it with the process); the switch's transaction is bounded (`boundedTx`, ≈ 1.8 s + 3 s query timeout), so a stale mark lasts at most that long ✓.
- Migration `0003_accounts_devices` forward on a DB with 0000+0001+0002 applied and 50 guests (+ progress, half with a look): 50 device rows copied, `guest_token_hash` nullable (B23), looks kept, 4 migrations recorded, second run a no-op, `findByTokenHash` works ✓; journal `when` strictly after 0002_look; 0003 snapshot `prevId` = 0002's id ✓. MERGE_RULES `look` (account's look unless null, then the guest's) and the look.db.test change (keep only migrations before 0002_look) read correct.

**Mutations (each restored after):** M1 refuse every address over budget → 1 fail ✓; M1 count right answers too → 1 fail ✓; M2 drop the delete-all → 2 fail ✓; B24 drop the hash re-check → PGlite "a login whose verified password hash changed …" fails ✓ and real-PG "review M2 race" fails ✓; L1 trust every ticket → 3 fail ✓; L1 timeout refuses → 1 fail ✓; L2 drop the onAuth mark check → **survives** (RR5); L2 drop the onJoin mark check → wiring check fails ✓; L2 drop the re-check in `switching()` → 1 fail ✓; look merge rule guest-first → mergeRules fails ✓.

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: built (builder session, branch story-7-6); status review.
- 2026-11-25: fresh review (AI): changes requested — M1 per-name lock-out, M2 reset keeps other devices logged in, L1–L7, N1–N4.
- 2026-11-25: narrow re-review 1: fixes hold; RR1–RR2 low, RR3–RR5 nits (none blocking).
