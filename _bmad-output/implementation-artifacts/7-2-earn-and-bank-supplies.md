# Story 7.2: Earn and bank Supplies

Status: ready-for-dev

<!-- Epic 7 progression story 2 of 7. Story file 2026-11-24 (gds-create-story, non-interactive) from the real code on master 7385b47. Designer decisions D1–D3 (earnings, who counts, rookie lift) are rules here. Epic 6 stories 6.9 (supply drop) and 6.11+6.12 (vote, endless) are not built yet: their hooks are "check at build time". -->

## Story

As a player,
I want to earn Supplies at the end of every run, even when we lose,
so that every run moves me forward.

> **Brief.** EPIC 6 BRIEF (`docs/epic-6-brief.md`) lines **1, 2** (the new per-player counters are World state: every copy, incl. 8.1's hold and the replay digest), **3** (each rule below is a test), **4**, **8/9** (sims assert waves really ended and Supplies really banked), **10** (every number in `progression.json`), **15** (solo earns the same as co-op: proposal § 7), **17**, **19**, **28** (one run flow: banking never blocks Results), **29**, **32**.

> **Scope:** per-player "was I there" counters in the shared sim, one pure Supplies function, banking in one database transaction per player per run (server only), the Results "Run rewards" panel, the vote line. **Not here:** the "Save my progress" nudge (7.6), the supply-drop unlock hint (moved to 7.4, decision 7.2 D6), milestone items (7.11), loot (7.12), district unlock line (7.7) — each adds its own line to this story's panel and its own write to this story's transaction.

## Acceptance Criteria

### Fairness / player-visible rules (each is a test)

- **S1 "Every run pays, even a loss."** +10 per wave survived (waves 1–10), +50 for the Behemoth, +100 for extracting, +20 per endless wave only if the team extracts (FR78, D1). A wipe in wave 5 = 50 (the wave the team falls in counts too, decision 7.2 D8, as the accepted pacing assumed); a wave-10 extract with the boss killed = 100 + 50 + 100 = 250.
- **S2 "I get the waves I was in, downed or out too."** A wave counts for a player who is in the run when it ends — cleared, or lost in a team wipe (D8) — alive, downed, out, or held by a short drop (8.1). Not before a late join, not after leaving or losing the seat (D2).
- **S3 "Quitting keeps what I earned."** A player who Leaves mid-run banks at once the waves that ended while they were there (and the boss if it died while they were there); never the extract bonus (decision 7.2 D2).
- **S4 "Staying in endless is a bet, and the game says so."** The vote shows "Extract now: +100 · Stay: +20 a wave, lost if you wipe". A wipe after Stay keeps waves 1–10 and the wave-10 Behemoth; endless waves and endless Behemoths are lost.
- **S5 "New friends catch up."** If my lifetime Supplies were below 300 before this run, the whole run's Supplies are doubled ("Rookie bonus × 2"); the run that crosses 300 is still doubled (D3).
- **S6 "Only the server pays."** Supplies are computed on the server from the server's run record; the client never sends an amount; a retry never pays twice.
- **S7 "Solo online pays the same."** A one-player online run earns exactly what a team run would. Practice solo (offline, on the phone) earns nothing and says so (decision 7.2 D1).

### Behaviour

1. **Run record in the World** (`packages/shared`). `PlayerState` (`player/player.ts:12-116`) gains `wavesIn` (u8, waves 1–`runWaves` that ended while present), `endlessWavesIn` (u16), `bossesIn` (u8: Behemoths killed while present, wave 10's included) and `endlessBossesIn` (u8). The economy system already reacts to `wave.ended` for every player in the World (`economy/economy.ts:21,170`); the same handler increments the counters for every player in `world.players` **and** in 8.1's `world.heldPlayers`; `team.wiped` during a wave (`downed.ts:171-178`) does the same once for the wave the team fell in (decision 7.2 D8; a wipe in a build phase adds nothing). `boss.killed` (`boss/death.ts:33`) increments `bossesIn` (and `endlessBossesIn` when the wave is past `runWaves`) for the same set. A late joiner (8.2) starts at 0; a leaver's `PlayerState` is gone (`player.ts:174-181`) after the room has read it (AC 4).
2. **Supplies function** `packages/shared/src/meta/supplies.ts`: `runSupplies(record, ending, lifetimeBefore, progression)` → `{ waves, boss, extract, endless, endlessBoss, rookie: boolean, total }`. `ending` ∈ `"wiped" | "extracted" | "lost" | "quit"` (6.11/6.12's `run.ending`, plus `quit` for a leaver). Rules: `waves = wavesIn × perWave`; `boss = min(bossesIn − endlessBossesIn, 1) × behemoth`; `extract = ending === "extracted" ? extract : 0`; `endless` and `endlessBoss` only when `extracted`; `rookie = lifetimeBefore < rookieLift.belowLifetime`; `total = sum × (rookie ? 2 : 1)`. `progression.json › supplies`: `{ perWave: 10, behemoth: 50, extract: 100, perEndlessWave: 20, endlessBehemoth: 50, rookieLift: { belowLifetime: 300, multiplier: 2 } }`. Integer only.
3. **Who gets the extract.** Players in the World (or held) on the tick of `run.extracted` (6.11). A player who left before it: `quit`.
4. **Banking (server).** `apps/server/src/meta/banking.ts`, called from `RunRoom.endRun` (`RunRoom.ts:785-796`) for every member with an `accountId` (7.1) and from `onLeave` (`RunRoom.ts:389-409`) for a consented Leave mid-run (before `controller.removePlayer` at `:396` deletes the state). For 8.1's remembered seats (dropped > 120 s, may still return), banking waits for the run end (their `PlayerState` is still held). Each bank is one transaction: insert `run_rewards (run_id, account_id, supplies, breakdown jsonb, created_at)` with primary key `(run_id, account_id)` (decision 7.2 D3) — a duplicate key means "already banked", nothing else happens — then `UPDATE progress SET supplies = supplies + n, lifetime_supplies = lifetime_supplies + n` with `lifetimeBefore` read **inside** the transaction (`SELECT … FOR UPDATE`). `run_id` is a UUID made when the run starts (`RunRoom` at Start). A failed write is logged `supplies_bank_failed {runId, accountId, err}` at `error`, retried once after 2 s; the second failure is logged again and the player's panel says "Couldn't save this run" (no third try, AC from epics). Never awaited in `onTick` (7.1 AC 9).
5. **Results "Run rewards" panel** (`apps/client/src/ui/ResultsScreen.tsx`). The server sends the owner `S2C.RUN_REWARDS = "run.rewards"` `{ status: "saved" | "failed" | "not_saved", lines: { waves, boss, extract, endless, endlessBoss }, rookie, total, newTotal }` after the bank (or at once with `not_saved` for a member without an account). Until it arrives the panel shows "Saving…". Lines, in order: "+N Supplies" (big), the breakdown ("Waves 9 × 10 = 90 · Behemoth +50 · Extract +100"), "Rookie bonus × 2" when it applies, "Total: 1,240 Supplies". Below the panel, room for later lines in this order: 7.11 new milestone item, 7.12 loot item, 7.7 "Unlocked: district 2", 7.6 "Save my progress". `not_saved`: "Not saved (playing offline from your progress)". Practice solo: "Practice runs don't earn Supplies" (S7). The table (name, kills, earned) stays.
6. **Leaver's view.** A player who Leaves sees on the start screen, once, "+40 Supplies banked from your last run" (decision 7.2 D4) (from the bank result kept in `localStorage`, try/catch; no extra request).
7. **Vote line** (6.11's `ui/EvacVote.tsx`): under the buttons, "Extract now: +100 · Stay: +20 a wave, lost if you wipe", numbers from `progression.json`.
8. **Logs.** `run_ended` (`RunRoom.ts:785-796`) gains per player `supplies`, `rookie`; `supplies_banked {runId, accountId, total, ms}`.

## Tasks / Subtasks

- [ ] **T1 Counters** (AC 1; S2): `PlayerState` fields + every copy (EPIC 6 brief 2: `snapshotWorld`, 8.1's hold round-trip test, `createPlayer` defaults). They are server bookkeeping: **not** in the Colyseus schema (no bytes), not mirrored. Tests in `economy.test.ts` / new `meta/runRecord.test.ts`.
- [ ] **T2 `progression.json › supplies` + `runSupplies`** (AC 2; S1, S4, S5): table-driven tests for every row of the test plan.
- [ ] **T3 Migration 0002** `run_rewards` (AC 4) + `meta/banking.ts` + `progressRepo.addSupplies` (transaction, `FOR UPDATE`, duplicate key = no-op).
- [ ] **T4 Room** (AC 3, 4, 8): `runId` at Start; `endRun` banks all members with accounts; `onLeave` banks a consented leaver first; send `run.rewards` to each owner; logs. Message constant + type in `packages/shared/src/net/messages.ts` (S2C list near `:85`).
- [ ] **T5 Client** (AC 5, 6, 7): `uiState.ts` results gains `rewards` (`ResultRow`/screen type at `uiState.ts:8-24, 58-64`); `onlineFlow.ts` stores the `run.rewards` message (it may arrive before or after the phase change: handle both orders); `ResultsScreen` panel; solo practice line (`GameScene.showSoloResults`, `GameScene.ts:979-984`); start-screen "banked" line; EvacVote line.
- [ ] **T6 Sims** (brief 9): the 10-wave sim (`economy/tenWaveSim.test.ts` / `tools/sims`) records each bot's `wavesIn` and `runSupplies` and asserts they match the waves that really ended (≥ 1 run wiping, ≥ 1 run extracting once 6.11 is in).
- [ ] **T7 Gate + hand-back.**

## Dev Notes

### Current state (read before changing)

- **Run end:** `endWave` (`run/runStateMachine.ts:101-114`) clears the wave, emits `wave.ended { number }`, and at `number >= waves.runWaves` (10, `waves.json:11`) sets `heldOut`, emits `run.held_out`, calls `endRun` (`:117-125`, no event of its own). A wipe: `checkTeamWipe` (`player/downed.ts:171-178`) emits `team.wiped { wave }` once; `updateRun` (`:160-163`) calls `endRun`. **No `wave.ended` for the wave the team died in**, so the count = the `wave.ended` events a player was present for, plus one for a `team.wiped` during a wave (D8; a wipe in a build phase, e.g. fire, adds nothing).
- **Wave money today:** `economy.ts:21,170` pays the wave-clear bonus to every player in the World (downed and out too) on `wave.ended` — the same "who is here" rule S2 needs.
- **Boss:** `killBoss` (`boss/death.ts:18-34`) pays `boss.killPay` to every player (downed/out too) and emits `boss.killed { killerId, weapon, x, y, number }`; no lasting flag survives to run end (`world.boss.state` resets at the build start).
- **Server:** `RunRoom.onTick` (`RunRoom.ts:755-775`) calls `this.endRun` on `team.wiped` / `run.held_out` (`:770-771`); `endRun` (`:785-796`) sets `state.phase = "results"`, `resultWave`, `resultHeldOut` (`schema/RunState.ts:149-151`), logs `run_ended` with kills and earned. **No Results message exists**: Results come from the schema (`kills`/`earned` per player, `RunState.ts:54,61`; `syncState.ts:144,160,171`). `onLeave` (`:389-409`) deletes the player from members, state and the World (`controller.removePlayer` → `player.ts:174-181`) and broadcasts `PLAYER_LEFT`. Joins happen only in the lobby today (`:328-329`; 8.2 opens build-phase joins).
- **Client:** `ResultsScreen.tsx` reads `uiStore` (`screen.kind === "results"`): title from `resultsTitle` (`uiState.ts:67-69`), a Player/Kills/Earned table, run seed, Back to lobby / Restart. Online results: `resultsFromState` (`net/onlineFlow.ts:29-34`), set on phase "results" (`:61-62`). Solo: `GameScene.ts:1887-1888` → `showSoloResults` (`:979-984`); solo never talks to the server.
- **No extract, vote, endless or supply drop in the code yet** (only comments: `runStateMachine.ts:22-23`, `ResultsScreen.tsx:11`, `bossState.ts:212-213`); they arrive with 6.9 and 6.11+6.12.
- **Online solo** exists: `MIN_PLAYERS_TO_START = 1` (`messages.ts:123`), `startBlocker` (`net/lobbyRules.ts:15-20`).

### Epic 6: check at build time

- **6.11 + 6.12 (vote and endless; ready-for-dev):** `RunState.ending: "none" | "wiped" | "extracted" | "lost"` replaces `heldOut` (6.11 AC 4); events `run.vote_resolved`, `run.extracted`; `run.endless`; 6.12 stores `PlayerState.earnedAtEvac` and logs `endlessWaves`, `earnedBeforeEndless` (6.12 AC 11). Read `ending` from there. If this story lands first, map `heldOut → "extracted"` is **wrong** (wave 10 cleared ≠ extracted): wait for 6.11 or treat `heldOut` as `"wiped"`-plus-nothing and add the extract bonus when 6.11 lands. Recommended: build after 6.11+6.12.
- **6.11's EvacVote** (`ui/EvacVote.tsx`, look EX1) gets AC 7's line: place it inside EX1's layout, check 568 × 320 (EPIC 6 brief 31's layout test).
- **Endless Behemoths** (every 5th wave, 6.12 AC on waves 15, 20…): `boss.killed` with `waves.number > runWaves` → `endlessBossesIn`.

### Network pass: check at build time

- **8.1 hold:** `world.heldPlayers` (8.1 T1) — counters must be counted for held players (S2: "held during a short drop") and must survive 8.1's field-by-field hold round-trip test (add the four fields; the test fails otherwise, by design). After 120 s the seat is "remembered" (8.1 AC 9): no more waves count (it's no longer in `heldPlayers`); bank at run end from the remembered state.
- **8.2 (Epic 8, later):** a late joiner's counters start at 0 — nothing to do now; note it in 8.2.
- **8.4 (Epic 8, later):** the snapshot carries the four counters ("waves each seat was in", already listed in 8.4 by the readiness fixes).

### Testing (Vitest; S1–S7 each a named test)

- `runSupplies` table: wipe in wave 5 (50), wipe in wave 9 (90), wipe in a build phase after wave 4 (40), wave-10 extract with boss (250), endless extract after 3 endless waves (310), endless wipe after 3 endless waves (150: waves 1–10 + boss), endless extract with a wave-15 Behemoth (+50 endlessBehemoth, decision 7.2 D5), quitter during wave 6 (50: the wave they left doesn't count), downed at wave end (counted), out at wave end (counted), rookie 290 lifetime + 100 run → 200 (crosses 300, still doubled), rookie exactly 300 → not doubled, solo online = 4-player numbers.
- World: a player downed during wave 3's last tick → `wavesIn` 3; a leaver after wave 4 → bank 40 and the remaining team's counters unaffected; a held (8.1) player across a wave end → counted.
- Server (`bootTestServer()` + PGlite): run end banks each member once; the same `endRun` twice → one row (duplicate key); a forced failure on the first write → retried once, success (`saved`); two failures → `failed`; a member without an account → `not_saved`; a consented Leave mid-wave → banked at once with `quit`, nothing again at run end; money (`wallet`) never touched.
- Client: `run.rewards` before and after the phase change; "Saving…" then values; practice line; leaver line shown once.
- Liveness: the sim asserts `wave.ended` count == `wavesIn` for every bot and that `progress.supplies` grew by the sum of `run_rewards`.
- Mutations: count only `alive` players → the downed test fails; drop `FOR UPDATE` → a concurrent-bank test (two runs ending at once for one account) fails; forget the duplicate key → the double `endRun` test fails.

### Beat the rule (reviewer start list)

1. **Cheating:** send a fake `run.rewards`-like message from the client (ignored: no C2S handler); change Supplies in DevTools (only the server value counts); join with another player's ticket (7.1 P4).
2. **Farming — late join:** join at wave 9 (8.2 later): counters from 0 → 10 (+ boss). Farming — AFK: stand still all run: 8.1's quiet rule holds you mid-wave after 3 s (still counted as "held"), after 120 s you're out of the World and stop counting. Farming — Leave/rejoin: banked once per run id; a rejoin through 8.2 starts at 0 (no double count). Farming — solo online runs that wipe at wave 1 on purpose: 0 Supplies (no wave ended). Farming — two tabs in one room: `already_joined`/takeover (7.1 AC 6).
3. **Losing progress:** server crash mid-run → nothing banked (accepted until 8.4 autosave; decision 7.2 D7 asks about banking each wave); database down at run end → retried once, then "Couldn't save this run" (logged with the full breakdown so it can be granted by hand); Back to lobby before "Saving…" ends → the bank still completes (server-side, not tied to the client).
4. **Two devices:** the same account ends two runs at the same moment (two rooms) → both banked, totals add up (`FOR UPDATE`).
5. **Offline:** practice solo earns nothing and says so; an unsaved guest (database down at Create) sees "Not saved".

### Notes for the merge

- `packages/shared/src/player/player.ts` (`PlayerState`): 8.1 adds hold fields, 6.12 `earnedAtEvac`, 7.5 Training fields, 7.4 an unlock mask — all additive; the 8.1 round-trip test lists every field.
- `economy/economy.ts` `wave.ended` handler: shared with the wave-clear money; keep both in one place.
- `RunRoom.endRun` / `onLeave`: 8.1 rewrites `onLeave` (drop vs consented leave): bank only on the **consented** path. 7.7 and 7.11/7.12 add writes to `meta/banking.ts`'s transaction (one transaction for all of them: pass a list of writers).
- `ResultsScreen.tsx` / `uiState.ts`: 6.11/6.12 change the title and sub line; this story adds the panel below the title; 7.5 adds a Training line per row; 7.6, 7.7, 7.11, 7.12 add lines inside the panel.

### Dependencies

7.1 (accounts, database, `Member.accountId`). Epic 6: 6.11+6.12 (endings, extract, endless), 6.5 (`boss.killed`, already on master). Network pass: 8.1 (held players count). Needed by: 7.3 (Supplies to spend), 7.5, 7.7 (district write in this transaction), **7.11** and **7.12** (other writer: milestone counters and loot are banked in this transaction and add lines to this panel).

### Decisions to confirm (recommended first, alternative after)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.2 D1 | Practice solo (the offline run on the phone) | **Earns no Supplies, says "Practice runs don't earn Supplies"**; a one-player online game earns in full (practice pays too: anyone could edit their phone to win) |
| 7.2 D2 | A player who quits before the extract | **Keeps the waves and boss they were there for, not the +100** (gets the +100 too if the team extracts later) |
| 7.2 D3 | A safety record per run so a retry can't pay twice | **Yes, a small "run rewards" table, one line per player per run** (no table: a retry could pay twice) |
| 7.2 D4 | A player who quits doesn't see Results | **The start screen shows "+40 Supplies banked from your last run" once** (nothing shown) |
| 7.2 D5 | Behemoths in endless (waves 15, 20, …) | **+50 each, kept only if the team extracts** (like endless waves) (only the wave-10 Behemoth pays) |
| 7.2 D6 | "You used the Grenade Launcher: unlock it for 500" on Results | **Built in 7.4** (it needs 7.3's prices and 7.4's unlock check) (here, with a hard-coded price list) |
| 7.2 D8 | The wave the team dies in | **Counts** (a wipe in wave 5 pays 50, as the accepted pacing and simulator assumed: first wanted weapon in run 3) (doesn't count, reading FR78's "survived" strictly: a wipe in wave 5 pays 40 and the first 300-Supply weapon slips to run 4) |
| 7.2 D7 | The server crashes mid-run | **Nothing is banked for that run** (Epic 8's autosave will resume it) (bank after every wave: safer, but a run then pays in many small writes) |

### Needs a look?

**Yes: the Results "Run rewards" panel** (readiness U3): where it sits on Results at 568 × 320 and 800 × 360, the big "+N Supplies" line, the breakdown line, the rookie badge, the "Saving… / Not saved / Couldn't save" states, and the space reserved below it for the milestone item, loot item, district unlock and "Save my progress" lines (7.11, 7.12, 7.7, 7.6). The designer picks it from code-drawn proposals before this story is built. The vote line (AC 7) is plain text inside 6.11's picked EX1 layout (no new look).

### References

- `epics.md` › Story 7.2; FR78; `docs/epic-7-decisions.md`; `docs/ideas/epic-7/proposal.md` § 0 D1–D3, § 1 (example runs), § 6 (one Run rewards panel); `implementation-readiness-report-2026-11-24-epic-7.md` U3, Q3, Q8; `sprint-change-proposal-2026-11-24-epic-8.md` (D2 note).
- `6-11-evacuation-vote.md` AC 4, 5, 8, 11; `6-12-endless-mode.md` F7, AC 11; `8-1-reconnect-within-2-minutes.md` T1, AC 9, 11.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.2 D1–D7 pending.

### File List

## Change Log

- 2026-11-24: story file created (ready-for-dev).
