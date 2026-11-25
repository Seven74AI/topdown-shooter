# Story 7.6: Upgrade to an account

Status: ready-for-dev

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

1. **Migration 0003** (this story's own tables, readiness Q6): `device_tokens (token_hash PK, account_id FK, created_at, last_seen_at)` filled from `accounts.guest_token_hash`, which is then dropped (7.1's lookups move to `device_tokens`); `accounts` gains `username_lower` (unique, nullable), `merged_into` (nullable FK), `save_nudged` (bool false). One account can now have several devices.
2. **Save my progress** `POST /account/upgrade` `{ username, password }` (cookie = the guest): username 3–20 characters, letters, digits, `_`, `-`, `.`, unique ignoring case ("That name is taken"); password 8–128 characters. Hash with Argon2id (`@node-rs/argon2` 2.2, architecture; parameters 19 MiB memory, 2 passes, 1 lane — the OWASP minimum, decision 7.6 D4). Generates the recovery code: 12 characters from the 32-letter Crockford set (no 0/O, 1/I/L, U), shown `ABCD-EFGH-JKMN`, stored as an Argon2id hash. Response `{ ok, username, recoveryCode }`. Already a full account → 409.
3. **Recovery code screen** (shown once, after save and after a reset): the code big, "Screenshot this: it's the only way back in if you forget your password", a **Copy** button, and "I saved it" to close (decision 7.6 D3).
4. **Log in** `POST /account/login` `{ username, password }`: wrong → 401 "Wrong username or password". Right: if the device's current account (cookie/token) is a **guest** with any progress, merge it (AC 6) in one transaction; re-point the device's token row to the account; respond with the new session (`ticket`, `progress`, `account`). A device on another full account just switches (no merge).
5. **Forgot password** `POST /account/recover` `{ username, code, newPassword }`: input code case-insensitive, dashes optional; wrong → 401 "Wrong username or code"; right → new password hash, new code (shown once), old code dead; the device is logged in as after AC 4.
6. **Merge** (`apps/server/src/meta/merge.ts`, D11, A2): one transaction locking both progress rows (`FOR UPDATE`, account row first by id order to avoid deadlocks): `unlocks` union, and for every unlock both had, its price refunded into Supplies (D1); `supplies` and `lifetime_supplies` added; `training` the higher level per boost, and the Supplies the other side spent on that boost's lower levels refunded (D2); `districts` union; `run_rewards` rows re-pointed; the guest's `device_tokens` re-pointed; guest `merged_into = account`. A **merge-writers list** that 7.9/7.10 (look), 7.11 (cosmetics, stats) and Epic 8 (saved runs) add their own rule to; a test fails if a `progress` column has no merge rule (reads the Drizzle schema).
7. **Log out** `POST /account/logout`: confirm "This phone will play as a new guest. Your account is safe."; the server mints a new guest token + account for the device and sets the cookie; the client replaces its `localStorage` copy.
8. **Limits** (A3): one `SlidingWindowLimiter(5, 60_000, ipKey)` (`net/rateLimit.ts:50`) shared by login and recover, counting every attempt (right or wrong); upgrade and logout are cookie-bound and use 7.3's per-account limiter. Argon2 runs on the libuv thread pool (async API): never on the tick thread.
9. **Entry points** (readiness U1). Start screen (`StartScreen.tsx`): a guest sees **Save my progress** and **Log in** under the name field; a logged-in player sees "Logged in as mo_42" and **Log out**. The Progress hub header (7.3) has the same. The login form has **Forgot password**. Account actions are refused while the device is in a room (lobby or run) except **Save my progress** (the account id doesn't change), with "Leave the game first".
10. **Results nudge** (D9, the line 7.2 leaves for this story): after the first run that banks ≥ 200 Supplies for a guest, the Run rewards panel shows **Save my progress** once; `accounts.save_nudged` set when shown (server sends `nudge: true` in `run.rewards` and sets the flag in 7.2's transaction).
11. **Logs**: `account_upgraded`, `login_ok`, `login_failed {ip}`, `recover_ok`, `recover_failed {ip}`, `account_merged {guestId, accountId, refunded}`, `logout` — never a password, code or token.

## Tasks / Subtasks

- [ ] **T1 Migration + repos** (AC 1): 0003, `accountsRepo` (`findByUsernameLower`, `setCredentials`, `setRecoveryHash`), `deviceTokensRepo`, 7.1's session lookup moved to `device_tokens`.
- [ ] **T2 Crypto** (AC 2, 5): `auth/passwords.ts` (Argon2id hash/verify with the D4 parameters), `auth/recoveryCode.ts` (generate with `crypto.randomInt`, normalise, format).
- [ ] **T3 Routes** (AC 2, 4, 5, 7, 8, 11): upgrade, login, recover, logout; limiter; generic errors; logs.
- [ ] **T4 Merge** (AC 6): `meta/merge.ts` + writers list + the "every column has a rule" test.
- [ ] **T5 Client** (AC 3, 9, 10): `ui/AccountScreen.tsx` (Save / Log in / Forgot password forms, `autocomplete="username"`, `"new-password"`, `"current-password"` so phone password managers offer to save), the recovery-code card, StartScreen + hub header rows, the Results nudge line, `net/account.ts` calls, refresh the session after login/logout.
- [ ] **T6 Tests + gate + hand-back.**

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

### Debug Log References

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.6 D1–D6 pending.

### File List

## Change Log

- 2026-11-24: story file created (ready-for-dev).
