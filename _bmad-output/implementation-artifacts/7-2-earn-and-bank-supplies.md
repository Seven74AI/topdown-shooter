---
baseline_commit: 827ea4519356d752dee65d26cb932cffbdbc4ae4
---
# Story 7.2: Earn and bank Supplies

Status: review

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
- **S7 "Solo online pays the same."** A one-player online run earns exactly what a team run would. Practice solo (offline, on the phone) banks nothing — no Supplies, milestone items or loot — and says so (decision 7.2 D1; 7.11 and 7.12 follow this rule).

### Behaviour

1. **Run record in the World** (`packages/shared`). `PlayerState` (`player/player.ts:12-116`) gains `wavesIn` (u8, waves 1–`runWaves` that ended while present), `endlessWavesIn` (u16), `bossesIn` (u8: Behemoths killed while present, wave 10's included) and `endlessBossesIn` (u8). The economy system already reacts to `wave.ended` for every player in the World (`economy/economy.ts:21,170`); the same handler increments the counters for every player in `world.players` **and** in 8.1's `world.heldPlayers`; `team.wiped` during a wave (`downed.ts:171-178`) does the same once for the wave the team fell in (decision 7.2 D8; a wipe in a build phase adds nothing). `boss.killed` (`boss/death.ts:33`) increments `bossesIn` (and `endlessBossesIn` when the wave is past `runWaves`) for the same set. A late joiner (8.2) starts at 0; a leaver's `PlayerState` is gone (`player.ts:174-181`) after the room has read it (AC 4).
2. **Supplies function** `packages/shared/src/meta/supplies.ts`: `runSupplies(record, ending, lifetimeBefore, progression)` → `{ waves, boss, extract, endless, endlessBoss, rookie: boolean, total }`. `ending` ∈ `"wiped" | "extracted" | "lost" | "quit"` (6.11/6.12's `run.ending`, plus `quit` for a leaver). Rules: `waves = wavesIn × perWave`; `boss = min(bossesIn − endlessBossesIn, 1) × behemoth`; `extract = ending === "extracted" ? extract : 0`; `endless` and `endlessBoss` only when `extracted`; `rookie = lifetimeBefore < rookieLift.belowLifetime`; `total = sum × (rookie ? 2 : 1)`. `progression.json › supplies`: `{ perWave: 10, behemoth: 50, extract: 100, perEndlessWave: 20, endlessBehemoth: 50, rookieLift: { belowLifetime: 300, multiplier: 2 } }`. Integer only.
3. **Who gets the extract.** Players in the World (or held) on the tick of `run.extracted` (6.11). A player who left before it: `quit`.
4. **Banking (server).** `apps/server/src/meta/banking.ts`, called from `RunRoom.endRun` (`RunRoom.ts:785-796`) for every member with an `accountId` (7.1) and from `onLeave` (`RunRoom.ts:389-409`) for a consented Leave mid-run (before `controller.removePlayer` at `:396` deletes the state). For 8.1's remembered seats (dropped > 120 s, may still return), banking waits for the run end (their `PlayerState` is still held). Each bank is one transaction: insert `run_rewards (run_id, account_id, supplies, breakdown jsonb, created_at)` with primary key `(run_id, account_id)` (decision 7.2 D3) — a duplicate key means "already banked", nothing else happens — then `UPDATE progress SET supplies = supplies + n, lifetime_supplies = lifetime_supplies + n` with `lifetimeBefore` read **inside** the transaction (`SELECT … FOR UPDATE`). `run_id` is a UUID made when the run starts (`RunRoom` at Start). A failed write is logged `supplies_bank_failed {runId, accountId, err}` at `error`, retried once after 2 s; the second failure is logged again and the player's panel says "Couldn't save this run" (no third try, AC from epics). Never awaited in `onTick` (7.1 AC 9).
5. **Results "Run rewards" panel** (`apps/client/src/ui/ResultsScreen.tsx`). The server sends the owner `S2C.RUN_REWARDS = "run.rewards"` `{ status: "saved" | "failed" | "not_saved", lines: { waves, boss, extract, endless, endlessBoss }, rookie, total, newTotal }` after the bank (or at once with `not_saved` for a member without an account). Until it arrives the panel shows "Saving…". Lines, in order: "+N Supplies" (big), the breakdown ("Waves 9 × 10 = 90 · Behemoth +50 · Extract +100"), "Rookie bonus × 2" when it applies, "Total: 1,240 Supplies". `not_saved`: "Not saved (playing offline from your progress)". Practice solo: "Practice runs don't earn rewards" (S7). The table (name, kills, earned) stays.
   **Panel rows (fixed order; later stories append rows, never reorder):**
   1. **Supplies** (this story): "+N Supplies" (big), the breakdown line, the "Rookie bonus × 2" badge, "Total: 1,240 Supplies"; or the status text (Saving… / Not saved / Couldn't save this run / Practice runs don't earn rewards).
   2. **Items** (one row per item, each with its close-up drawing on the left and one text line): 7.11 "New item: Riot helmet (first extraction)" (one row per milestone reached, in M1–M10 order), then 7.12 "Found in wave N: <item>" or "Collector" (at most one).
   3. **Unlocks**: 7.4 "You used the <weapon>: unlock it for <price>"; 7.7 "Unlocked: District 2 · coming soon".
   4. **Nudge**: 7.6 "Save my progress" (button, once).
   The panel is one scrollable column (max height = the Results card minus title and table), so 4 items + 3 lines still fit at 568 × 320; an empty row group takes no space. All rows come from the one `run.rewards` message (each story adds its field), so they appear together once saved.
6. **Leaver's view.** A player who Leaves sees on the start screen, once, "+40 Supplies banked from your last run" (decision 7.2 D4) (from the bank result kept in `localStorage`, try/catch; no extra request).
7. **Vote line** (6.11's `ui/EvacVote.tsx`): under the buttons, "Extract now: +100 · Stay: +20 a wave, lost if you wipe", numbers from `progression.json`.
8. **Logs.** `run_ended` (`RunRoom.ts:785-796`) gains per player `supplies`, `rookie`; `supplies_banked {runId, accountId, total, ms}`.

## Tasks / Subtasks

- [x] **T1 Counters** (AC 1; S2): `PlayerState` fields + every copy (EPIC 6 brief 2: `snapshotWorld`, 8.1's hold round-trip test, `createPlayer` defaults). They are server bookkeeping: **not** in the Colyseus schema (no bytes), not mirrored. Tests in `economy.test.ts` / new `meta/runRecord.test.ts`.
- [x] **T2 `progression.json › supplies` + `runSupplies`** (AC 2; S1, S4, S5): table-driven tests for every row of the test plan.
- [x] **T3 Migration 0002** `run_rewards` (AC 4) + `meta/banking.ts` + `progressRepo.addSupplies` (transaction, `FOR UPDATE`, duplicate key = no-op).
- [x] **T4 Room** (AC 3, 4, 8): `runId` at Start; `endRun` banks all members with accounts; `onLeave` banks a consented leaver first; send `run.rewards` to each owner; logs. Message constant + type in `packages/shared/src/net/messages.ts` (S2C list near `:85`).
- [x] **T5 Client** (AC 5, 6, 7): `uiState.ts` results gains `rewards` (`ResultRow`/screen type at `uiState.ts:8-24, 58-64`); `onlineFlow.ts` stores the `run.rewards` message (it may arrive before or after the phase change: handle both orders); `ResultsScreen` panel; solo practice line (`GameScene.showSoloResults`, `GameScene.ts:979-984`); start-screen "banked" line; EvacVote line.
- [x] **T6 Sims** (brief 9): the 10-wave sim (`economy/tenWaveSim.test.ts` / `tools/sims`) records each bot's `wavesIn` and `runSupplies` and asserts they match the waves that really ended (≥ 1 run wiping, ≥ 1 run extracting once 6.11 is in).
- [x] **T7 Gate + hand-back.**

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
| 7.2 D1 | Practice solo (the offline run on the phone) | **Banks nothing: no Supplies, no milestone items (7.11), no loot bag (7.12); says "Practice runs don't earn rewards"**; a one-player online game earns everything in full (practice pays too: anyone could edit their phone to win) |
| 7.2 D2 | A player who quits before the extract | **Keeps the waves and boss they were there for, not the +100** (gets the +100 too if the team extracts later) |
| 7.2 D3 | A safety record per run so a retry can't pay twice | **Yes, a small "run rewards" table, one line per player per run** (no table: a retry could pay twice) |
| 7.2 D4 | A player who quits doesn't see Results | **The start screen shows "+40 Supplies banked from your last run" once** (nothing shown) |
| 7.2 D5 | Behemoths in endless (waves 15, 20, …) | **+50 each, kept only if the team extracts** (like endless waves) (only the wave-10 Behemoth pays) |
| 7.2 D6 | "You used the Grenade Launcher: unlock it for 500" on Results | **Built in 7.4** (it needs 7.3's prices and 7.4's unlock check) (here, with a hard-coded price list) |
| 7.2 D8 | The wave the team dies in | **Counts** (a wipe in wave 5 pays 50, as the accepted pacing and simulator assumed: first wanted weapon in run 3) (doesn't count, reading FR78's "survived" strictly: a wipe in wave 5 pays 40 and the first 300-Supply weapon slips to run 4) |
| 7.2 D7 | The server crashes mid-run | **Nothing is banked for that run** (Epic 8's autosave will resume it) (bank after every wave: safer, but a run then pays in many small writes) |

### Needs a look?

**Yes: the Results "Run rewards" panel** (readiness U3): where it sits on Results at 568 × 320 and 800 × 360, the big "+N Supplies" line, the breakdown line, the rookie badge, the four row groups of AC 5 (Supplies with breakdown and rookie badge; item rows with a close-up drawing for 7.11's "New item" and 7.12's "Found in wave N"; unlock lines for 7.4 and 7.7; 7.6's nudge), the "Saving… / Not saved / Couldn't save" states, and how it scrolls when full. The designer picks it from code-drawn proposals before this story is built. The vote line (AC 7) is plain text inside 6.11's picked EX1 layout (no new look).

### References

- `epics.md` › Story 7.2; FR78; `docs/epic-7-decisions.md`; `docs/ideas/epic-7/proposal.md` § 0 D1–D3, § 1 (example runs), § 6 (one Run rewards panel); `implementation-readiness-report-2026-11-24-epic-7.md` U3, Q3, Q8; `sprint-change-proposal-2026-11-24-epic-8.md` (D2 note).
- `6-11-evacuation-vote.md` AC 4, 5, 8, 11; `6-12-endless-mode.md` F7, AC 11; `8-1-reconnect-within-2-minutes.md` T1, AC 9, 11.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, `gds-dev-story`), branch `story-7-2`.

### Debug Log References

- Early start (brief 29): branched from `story-7-1` 827ea45 (7.1 + 8.1, neither on master yet); before the gate merged `origin/story-7-1` 7519791 (7.1 review fixes: tickets bound to the guest token, 8.1 `HeldPlayer {buildIdx, atTick}`, `protectedReturnWave`) and `origin/master` 02e7d8c (asset session art). Conflicts: `player.ts` / `hold.test.ts` / `app.ts` (both sides additive, kept both), `.gitignore` and `hudLayout.test.ts` imports (7.1 vs master, kept both).
- Epic 6's 6.11 + 6.12 (vote, extract, endless, `run.ending`) and 8.1's hold were already on the base: built against the real `run.extracted` / `RunEnding`, no `heldOut` mapping.
- `boss.killed.number` is the Behemoth COUNT, not the wave (B2): endless Behemoths are counted by `waves.number > runWaves`.
- The economy system runs after the run system: on a wipe tick `endRun` has already set phase "results" when the economy reads `team.wiped`, so the D8 wave is counted in `checkTeamWipe` (B1).
- Browser (Chromium, server 2721 with PGlite in the scratchpad, Vite 5721 with `VITE_SERVER_URL`): Create → solo Start → wiped in wave 1 after 47 s → panel "+20 Supplies · Waves 1 × 10 +10 · Rookie bonus × 2 · Total 20"; log `run_ended {runId}`, `supplies_banked {total 20, ms 6.8}`, `run_supplies`. In-run menu Leave → the phone sent `run.leave`, `supplies_banked {ms 4.5}`, then `player_left` 15 ms later (code 4000). Start screen with a stored bank → "+40 Supplies banked from your last run", gone on the next load.
- R9 layout, real DOM at 568×320, 640×360, 800×360, 844×390 with insets 44/21, states saved / endless / wipe / saving / failed / not_saved / practice (28 shots): both cards inside the safe area, no horizontal overflow in any card, smallest text 11 px, button 160 × 44, no panel scroll needed for 5 breakdown rows. Card rects equal `layoutResults` exactly (568: team x 44 w 236 h 291, rewards x 288).
- The start menu already scrolled 25 px at 568×320 before this story; the one-time banked line makes it 63 px (menu is `overflow-y: auto`).
- Mutations (brief 6), 8 of 9 caught: count only alive players (2 failed), skip held players (3), D8 wipe wave not counted (1), no duplicate-key guard (2), no bank on a consented `onLeave` (1), no retry delay (1), rookie at exactly 300 (3), Leave without `run.leave` (1). **Survived: dropping `FOR UPDATE`** — PGlite has one connection, so transactions serialize anyway (see Not verified).

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.2 D1–D8 accepted by the designer 2026-11-25 ("ok" for all, `docs/epic-7-story-decisions-progress.md`).
- **Practice solo earns nothing** (decision 7.2 D1): no Supplies, no milestone items (7.11), no loot bag (7.12); Results says "Practice runs don't earn rewards". A one-player ONLINE game earns in full (S7). 7.11 and 7.12 follow this rule.
- **T1:** `PlayerState.wavesIn / endlessWavesIn / bossesIn / endlessBossesIn` (defaults 0 in `addPlayer`; kept by the hold; in `snapshotWorld` via the player spread, held players too). Not in the schema (0 bytes on the wire). Counting in `meta/runRecord.ts` (players AND `heldPlayers`), called from `economy.ts` (`wave.ended`, `boss.killed`) and `downed.ts › checkTeamWipe` (D8).
- **T2:** `progression.json › supplies` {10, 50, 100, 20, 50, rookie 300 × 2} (zod, integers, frozen; not in `balanceVersion`: no bump); `meta/supplies.ts › runSupplies` + `suppliesEnding`.
- **T3:** migration `apps/server/drizzle/0001_run_rewards.sql` (the story's "0002": Drizzle numbering, 7.1 B1): `run_rewards (run_id, account_id → accounts, supplies ≥ 0, breakdown jsonb, created_at)`, primary key (run_id, account_id). `progressRepo.addSupplies(runId, accountId, pay)`: one transaction — empty progress row if missing (B13), `SELECT … FOR UPDATE`, `pay(lifetimeBefore)`, insert … on conflict do nothing (duplicate = "already banked", returns the earlier row), then `supplies` / `lifetime_supplies` += n. `apps/server/src/meta/banking.ts › RunBank`: once per seat per run, `not_saved` without an account, one retry after 2 s, `failed` after two, `supplies_banked` / `supplies_bank_failed` / `run_supplies` logs.
- **T4:** `RunBank` made at Start (`runId` = random UUID); `endRun` → ONE call `bank.bankRunEnd(world, members, rememberedSeats)` (members in the World or held get the run's ending, remembered seats `quit`); `onLeave` code 4000 → `bankLeaver` before `finalLeave`; new C2S `run.leave` (guarded, `{}` only) → `bankLeaver` (B4); `run_abandoned` banks remembered seats (B6); a seat attaching on Results gets its rewards again. `S2C.RUN_REWARDS`, `C2S.RUN_LEAVE`, `runRewardsSchema` (passthrough) in `messages.ts`.
- **T5:** `net/rewardsStore.ts` (latest message, matched by seed: both arrival orders, B8; the Leave's result kept in localStorage for the start screen, try/catch); `RunInbox` → store; `lobbyStore.leave` → `leaveAfterRewards` (sends `run.leave`, leaves after the answer or 1.5 s); `ui/rewardsModel.ts` (panel view + `layoutResults`); `ResultsScreen` in RW1 / Lumen LF5 (team card + Run rewards card, CSS only, fixed row groups of brief 26); start-screen line; vote line `voteStakesLine()` above the vote buttons (B3).
- **T6:** ten-wave sim (a): every god-mode bot `wavesIn` 10, `bossesIn` 1, 250 Supplies extracted; (b): every mortal run, every bot `wavesIn` = waves ended + the wave a wipe fell in, and its Supplies; endless sim (a): `[1, 20, 5, 4]` and 760 extracted; (b): endless lost on a wipe after Stay.
- Build-time choices 7.2 B1–B15: `docs/epic-7-decisions.md` › Story 7.2 build-time choices (auto-accepted overnight (designer: follow the GDS recommendation)).
- Bandwidth: `run.rewards` once per player per run (~300 B), `run.leave` once per Leave: ≈ 0 B/s added. No new sprites or textures (CSS only).

### Review follow-ups (2026-11-25, review `review-7-2` @ 2a4c7c5: changes requested, 1 M + 5 L + 1 N)

- ✅ **M1 [Medium]** a timed-out bank committed later (told "failed", paid anyway): `db/progressRepo.ts › addSupplies` now opens with `SET LOCAL lock_timeout` / `statement_timeout` = `BANK_LOCK_TIMEOUT_MS` 1500 and, on PostgreSQL ≥ 17, `transaction_timeout` = `BANK_TX_TIMEOUT_MS` 1800 (both under `DB_TIMEOUT_MS` 2000), so PostgreSQL rolls back before the caller gives up; `supplies_bank_failed` carries `handGrant: HAND_GRANT_NOTE`; `docs/deploy.md` › Database: check `run_rewards (run_id, account_id)` before a hand grant, and grant in one transaction. Test: `apps/server/src/db/realPostgres.test.ts` > "M1: a row locked 5.5 s → failed, and the money matches what the player was told" (failed AND unpaid, 0 rows) and > "M1: a row locked 3 s → saved …" (paid once). Mutation: without the `SET LOCAL` lines the 5.5 s case fails (paid 1050). Run on a real PostgreSQL 16 here (`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:2722/t72`, scratch cluster): 6/6.
- ✅ **L1 [Low]** opt-in real-PostgreSQL test, skipped unless `TEST_DATABASE_URL`: `realPostgres.test.ts` > "L1 (FOR UPDATE): two runs ending at once around lifetime 250 → only one doubled (400, never 450), 10 tries"; > "20 runs ending at once …"; > "a concurrent double-submit of ONE (run, account) ×10 pays once"; > "a brand-new account …". Mutation: without `.for("update")` the L1 test fails on real PostgreSQL.
- ✅ **L2 [Low]** long names / big numbers: `.results__table` `table-layout: fixed` with Kills / Earned columns, names in `.rw-name__text` with ellipsis, Kills / Earned ellipsis, the table in a scrolling `.rw-table-wrap` (the button never leaves the card), `.rw-big` wraps, `--long` sizes for a 7+ character headline (28 px) and an 8+ character total (16 px). Test: `tools/checks/resultsDomLayout.test.ts` (real Chromium, the four R9 sizes × short names and the worst case: 4 × 16-character wide names, 5-digit kills, $9,999,999, +1,311,900, total 1,234,567, every line, rookie, YOU): 8/8. Mutation: without `table-layout: fixed`, 4 worst-case sizes fail.
- ✅ **L3 [Low]** three tests: `apps/client/src/ui/rewardsModel.test.ts` > "review L3 (B9): a saved run with 0 waves still lists the Waves line …"; `apps/client/src/net/rewardsStore.test.ts` > "review L3 (B11): a message with fields from a later story is accepted …"; `apps/server/src/rooms/RunRoom.rewards.test.ts` > "review L3: a seat dropped mid-wave (held) is banked at the run end, and when it comes back on Results it gets run.rewards again" (mutation: without the resend in `attachClient` it fails).
- ✅ **L4 [Low]** `run.rewards` gains `ending` and `leftWave` (passthrough-safe, optional); a Leave's bank carries the wave; the panel reads "Banked when you left (wave N)". Tests: `banking.test.ts` > "review L4: a Leave's bank says ending quit and the wave it was made in …"; `rewardsModel.test.ts` > "review L4 (B5) …"; room test "S3/D4 …" now also checks `ending: "quit", leftWave: 1`; `resultsDomLayout.test.ts` checks the note on screen.
- ✅ **L5 [Low]** `rewardsStore.startRun()` at every new run (`onlineFlow`): the previous run id is marked stale and a late message of it ignored (B18). Tests: `rewardsStore.test.ts` > "review L5: a new run forgets the previous run's rewards …"; wiring `tools/checks/rewardsWiring.test.ts` > "review L5 / N1: a new run clears the rewards store; the Results get this phone's slot".
- ✅ **N1 [Nit]** RW1: own row highlighted with a white keyline and a white "YOU" (not the orange accent, 7-UI-4) from `mySlot` (online: `run.joined`'s slot; practice: 0), Earned with thousands separators ($1,840), the wave number top right (not on a wipe, whose title already says it; "Lost in the city" keeps "Rewards after wave 10 lost"). Screenshots refreshed: `docs/art/epic-7/built/7-2-results.png`, `7-2-results-states.png`.
- Merge: origin/master f67154d (8.10 on master): join options need `netProtocolVersion` → added to the room/account test option helpers in `RunRoom.rewards`, `RunRoom.reconnect`, `RunRoom.account` and `accountRoutes` tests (the last three are 8.1 / 7.1 files: the same one-line change will be needed when they land). Conflicts between story-7-1 and master resolved here: `JoinRefusal` (both `seat_kept` and `update_required`), client `connection.ts` join options (ticket AND `netProtocolVersion`), `tools/bots/run.ts` flags (both), `NetSimHost.ts` (8.1's rebase kept, its old `receiveHorde` dropped: 8.10 replaced it with the decoder callback), `docs/perf/network-pass-2026-11.md` (both sections), sprint-status (8.1 review, 8.10 done), `docs/epic-7-decisions.md` (7.1 B12 row + this story's table).

### Test evidence per task (brief R1: file > test name)

- **T1:** `packages/shared/src/meta/runRecord.test.ts` > "S2: every ended wave counts once for each player in the run, alive, downed and out"; > "S2: a player downed on wave 3's last tick still has wavesIn 3 …"; > "D8: a team wipe during wave 5 counts wave 5; a wipe in the build phase after wave 4 adds nothing"; > "S3: a player who leaves after wave 4 keeps 4 waves in their state; the team's counters are not touched"; > "S2 (8.1): a held player across a wave end is counted; after returning the count goes on"; > "a late joiner starts at 0 and counts only the waves after joining"; > "S1/S4: the wave-10 Behemoth counts in bossesIn only; endless waves and an endless Behemoth count apart"; > "S2 (mutation guard): the counters read no status …"; > "brief 2: the counters are in snapshotWorld (players and held players) …". `packages/shared/src/player/hold.test.ts` (round-trip lists the four fields "kept").
- **T2:** `packages/shared/src/meta/supplies.test.ts` > the 15 table rows (wipe in wave 5 / 9 / build after 4, wave-10 extract 250, endless extract 310, endless wipe 150, wave-15 Behemoth extract / wipe, quitter during wave 6, quitter after the boss, rookie 290 → 200, rookie exactly 300, new player wave-5 wipe, wave-1 wipe, nothing); > "S1 Every run pays, even a loss …"; > "S4 Staying is a bet …"; > "S5 New friends catch up …"; > "S7 Solo online pays the same …"; > "every number comes from progression.json …"; > "garbage counters … count as 0". `packages/shared/src/config/progression.test.ts` > "Story 7.2: supplies are the FR78 / D1 / D3 / D5 numbers, integers only, all present".
- **T3:** `apps/server/src/db/runRewards.test.ts` > "banks once: Supplies and lifetime grow, one run_rewards row; the same (run, account) again pays nothing"; > "the payout sees lifetime Supplies read inside the transaction …"; > "brief 18: two rooms ending at once for one account both bank and add up; a concurrent double-submit of ONE run pays once"; > "an account with no progress row gets one …"; > "a negative payout is clamped to 0 …"; > "brief 21: migration 0001 runs forward on a copy of the 0000 schema with rows in it (rows kept)". `apps/server/src/db/db.test.ts` > "the committed SQL creates exactly three tables …". `apps/server/src/meta/banking.test.ts` > "S6: banks a seat with the server's record …"; > "S5: a rookie …"; > "each seat banks once per run …"; > "AC 4: a failed write is logged and retried once after BANK_RETRY_MS (2 s) → saved"; > "AC 4: two failures → logged twice, no third try, status failed …"; > "a retry after a write that DID commit … paid once"; > "no account (unsaved play) or no database → not_saved …"; > "AC 3: at the run end, members in the World or held get the run's ending; remembered seats bank quit; run_supplies logged"; > "the record is copied when the bank starts …".
- **T4:** `apps/server/src/rooms/RunRoom.rewards.test.ts` > "S1/S6: a wipe in wave 1 banks each member once from the server's record (rookie × 2), sends run.rewards, wallets untouched" (also the double `endRun` → one row, `run_ended {runId}`, `run_supplies`); > "a member without an account gets not_saved at once; the account member is saved"; > "S3/D4: run.leave mid-wave banks at once (quit) and the reply reaches the leaver; after the Leave the run end banks nothing more for them"; > "S3: a consented Leave without run.leave still banks at once …"; > "run.leave outside a run (lobby) or from a client with a garbage body does nothing"; > "the database down at the run end: retried once, then failed (Couldn't save), nothing banked, the room carries on".
- **T5:** `apps/client/src/net/rewardsStore.test.ts` > "keeps the latest valid message, tells listeners, and matches it to a run by seed (either arrival order)"; > "ignores garbage …"; > "D4: a Leave's saved bank becomes the start screen's line once, then is gone"; > "D4: nothing to show for a failed / unsaved / empty bank, or an ordinary run end"; > "storage that throws …"; > "mid-run: sends run.leave, keeps the socket until run.rewards arrives, then the consented leave"; > "mid-run with no answer: leaves after the wait anyway"; > "lobby or Results: leaves at once, sends nothing". `apps/client/src/ui/rewardsModel.test.ts` > "saved: +N headline, the breakdown rows …"; > "S5: the rookie badge …"; > "endless lines appear …"; > "states: Saving…, Couldn't save, Not saved, Practice"; > "S7 / D1: practice solo never shows Supplies …"; > "brief 26: the row groups are in the fixed order …"; > the four R9 size tests "568×320 / 640×360 / 800×360 / 844×390: both cards inside the safe area …"; > "a fine width sweep (1 px, 568 → 1400) …"; > "text ≥ 11 px everywhere …"; > "reads 'Extract now: +100 · Stay: +20 a wave, lost if you wipe' from progression.json". `tools/checks/resultsLayoutCss.test.ts` (CSS twin of the layout numbers, no font < 11 px). Wiring (R2): `tools/checks/rewardsWiring.test.ts` > "the RunInbox hands run.rewards to the rewards store"; > "a Leave goes through leaveAfterRewards …"; > "Results reads the store and draws the panel from rewardsView"; > "the start screen shows the Leave line … and the vote shows the stakes"; > "practice solo Results stay offline …". `tools/checks/evacVoteCss.test.ts` and `apps/client/src/scenes/hudLayout.test.ts` unchanged and green (the vote buttons did not move).
- **T6:** `packages/shared/src/economy/tenWaveSim.test.ts` > "(a) god-mode bots, 4 players, seeds 1–3 …" (wavesIn 10, bossesIn 1, 250 each); > "(b) mortal bots …" (every bot's wavesIn and Supplies; ≥ 1 wiped run); `packages/shared/src/economy/endlessSim.test.ts` > "(a) flow …" ([1, 20, 5, 4], 760); > "(b) wipe …" (endless lost).
- **T7:** gate below; screenshot `docs/art/epic-7/built/7-2-results.png` (568 × 320, deviceScaleFactor 2) and `7-2-results-states.png` (all states + 800 × 360).

### Gate (brief R6)

- **FULL GATE after the review fixes ✅** `npm run typecheck && npm run lint && npm test && npm run build` on `story-7-2` fee1ae1 = story-7-2 merged with origin/story-7-1 `e1f97a39` (7.1 + re-review fixes, 8.1 inside) AND origin/master `f67154d7` (8.10): 450 test files passed / 2 skipped (realPostgres without `TEST_DATABASE_URL`, + the existing skip), 4054 tests passed / 9 skipped, build OK; load 1.78 → 3.82 (2026-11-25 07:30–07:38). Separately: `TEST_DATABASE_URL` real PostgreSQL 16 run of `realPostgres.test.ts` 6/6.
- **FULL GATE ✅** `npm run typecheck && npm run lint && npm test && npm run build` on `story-7-2` 9c451d5 = story-7-2 merged with origin/story-7-1 `7519791` (7.1 + its review fixes, 8.1 inside) AND origin/master `02e7d8c`: 443 test files passed / 1 skipped, 4005 tests passed / 3 skipped, build OK; load 1.89 at start → 3.71 at end (2026-11-25 06:45–06:52).
- First gate run on 1587e3f found 3 failures, fixed before this one: `noDbImports` (the room test imported drizzle-orm: now `db/testQueries.ts`), and two lobbyStore tests (a Leave while 8.1 is reconnecting now leaves at once; a live Leave mid-run waits for `run.rewards`, test updated).

### Notes for the merge

- `apps/server/src/rooms/RunRoom.ts`: `endRun` gains ONE call (`void this.bank?.bankRunEnd(controller.world, this.members.values(), this.rememberedSeats.values())`) and `runId` in the `run_ended` line — 8.1's review fixes adding held players' kills/earnings to `run_ended` touch the lines above it; keep the call last. `onLeave`: one line before `finalLeave` (`if (code === CloseCode.CONSENTED) this.bankLeaver(member)`); `finalLeave`'s `run_abandoned` branch: one line. New: `bank`, `bankRetryMs`, `bankLeaver`, `onRunLeave`, `deliverRewards`, a `run.rewards` resend in `attachClient`, `this.bank = new RunBank(…)` in `startRun`, `this.bank = null` in `onLobbyReturn`. 8.2 (late joins): a new seat reusing a leaver's player id would be found "already banked" by `RunBank` — key it by seat then.
- `apps/server/src/meta/banking.ts`: 7.7 (district), 7.11 (milestones), 7.12 (loot) add their writes to `progressRepo.addSupplies`'s transaction (pass writers into the repo, `db/` only: brief 21) and their fields to `run.rewards` / `breakdown`.
- `apps/server/src/db/{schema,progressRepo}.ts`, `drizzle/0001_run_rewards.sql` + `meta/0001_snapshot.json` + `_journal.json`: the next migration is 0002.
- `apps/server/src/auth/roomAccounts.ts` (`progress`), `apps/server/src/app.ts` (`progress: progressRepo(database)` in `setRoomAccounts`).
- `packages/shared/src/player/player.ts`: four fields after 8.1's `protectedReturnWave`; `hold.test.ts` lists them. 6.12 / 7.4 / 7.5 add more: additive.
- `packages/shared/src/economy/economy.ts`: `wave.ended` handler counts beside the money; new `boss.killed` case. `player/downed.ts › checkTeamWipe`: one line.
- `packages/shared/src/net/messages.ts`: `C2S.RUN_LEAVE`, `S2C.RUN_REWARDS`, `runLeaveSchema`, `runRewardsSchema`; `index.ts` exports. No netEvents kind used (110–119 untouched); no readability-sheet item.
- `packages/shared/src/config/progression.{json,ts}`: `supplies` key (7.3 adds `unlocks`, 7.5 `training`): different keys. Balance version: unchanged (progression.json is not in it).
- `apps/client/src/ui/ResultsScreen.tsx` / `overlay.css` (`.rw*` block at the end): later stories append rows inside `RunRewardsCard` after the supplies group, in brief 26's order; 7.5 adds the TL3 Training column to the team table (room left: the table is full-width of its card). 6.11/6.12's title / sub lines kept.
- `apps/client/src/net/lobbyStore.ts` (`leave` → `leaveAfterRewards`), `net/session.ts` (one handler), `ui/StartScreen.tsx` (one effect + one line; 7.3 Progress button, 7.6 account row elsewhere), `ui/EvacVote.tsx` (one line above the buttons).
- `.gitignore` / `apps/client/src/scenes/hudLayout.test.ts`: merge conflicts between `story-7-1` and master resolved here (both kept); the main session will see the same when 7.1 lands.

### Not verified

- ~~`FOR UPDATE` under real PostgreSQL~~ — verified after the review on a local PostgreSQL **16** (`realPostgres.test.ts`, opt-in). Not run on **18**: the `transaction_timeout` line (PostgreSQL ≥ 17 only) never executed here; PGlite and PG 16 take the lock/statement timeouts only. The default gate skips `realPostgres.test.ts` (no `TEST_DATABASE_URL`).
- `resultsDomLayout.test.ts` runs only where Chromium + Playwright exist (cloud sessions); elsewhere it is skipped.
- The `pg` driver path of `addSupplies` (PostgreSQL 18) never ran here; the timeout path is the shared `withDbTimeout`.
- A bank whose first attempt times out but commits later: covered with a fake repository (the retry finds the row); not reproduced on a real slow database.
- Real phones / iOS Safari: the panel at 568 × 320 is Chromium with injected 44/21 paddings (env insets can't be emulated headless). The "Saving…" → saved transition was seen live; the 2 s retry → "Couldn't save" only in tests.
- `?lag=150&jitter=20&loss=1`, a hidden tab and a reconnect across the run end (brief 9): not run in a browser. By construction `run.rewards` is resent to a seat that attaches on Results, and the client matches by seed; the bank itself is server-side (once per run whatever the line does).
- A remembered seat (hold ran out) banked at the run end and the abandoned-run bank are tested at the `RunBank` level (and wired by one line each), not through a full 120 s room hold.
- Endless extract in a real room: covered by `RunBank` (held + extracted) and the endless sim, not by a room test through the vote.
- The start-screen line after a REAL Leave with Supplies > 0 (my browser Leave was in wave 1 with 0 Supplies, so no line, as designed); the line itself was checked with a stored bank.

### File List

- `packages/shared/src/meta/{runRecord,supplies}.ts`, `packages/shared/src/meta/{runRecord,supplies}.test.ts`
- `packages/shared/src/player/player.ts`, `packages/shared/src/player/downed.ts`, `packages/shared/src/player/hold.test.ts`, `packages/shared/src/economy/economy.ts`
- `packages/shared/src/config/progression.{json,ts,test.ts}`, `packages/shared/src/net/messages.ts`, `packages/shared/src/index.ts`
- `packages/shared/src/economy/{tenWaveSim,endlessSim}.test.ts`
- `apps/server/src/db/schema.ts`, `apps/server/src/db/progressRepo.ts`, `apps/server/src/db/runRewards.test.ts`, `apps/server/src/db/db.test.ts`
- `apps/server/drizzle/0001_run_rewards.sql`, `apps/server/drizzle/meta/0001_snapshot.json`, `apps/server/drizzle/meta/_journal.json`
- `apps/server/src/meta/banking.ts`, `apps/server/src/meta/banking.test.ts`
- `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/rooms/RunRoom.rewards.test.ts`, `apps/server/src/auth/roomAccounts.ts`, `apps/server/src/app.ts`
- `apps/client/src/net/rewardsStore.ts`, `apps/client/src/net/rewardsStore.test.ts`, `apps/client/src/net/lobbyStore.ts`, `apps/client/src/net/session.ts`
- `apps/client/src/ui/rewardsModel.ts`, `apps/client/src/ui/rewardsModel.test.ts`, `apps/client/src/ui/ResultsScreen.tsx`, `apps/client/src/ui/StartScreen.tsx`, `apps/client/src/ui/EvacVote.tsx`, `apps/client/src/ui/overlay.css`
- `tools/checks/resultsLayoutCss.test.ts`, `tools/checks/rewardsWiring.test.ts`
- `docs/art/epic-7/built/7-2-results.png`, `docs/art/epic-7/built/7-2-results-states.png`
- `docs/epic-7-decisions.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Merges: `.gitignore`, `apps/client/src/scenes/hudLayout.test.ts` (conflicts between story-7-1 and master)

## Senior Developer Review (AI)

**Reviewer:** fresh reviewer cloud session (`gds-code-review`, three layers: Blind Hunter / Edge Case Hunter / Acceptance Auditor + beat the rule), 2026-11-25. **Tree:** `review-7-2` = `origin/story-7-2` 7401f6d + `origin/master` 02e7d8c (clean merge, no conflicts). Scope: 7.2's own commits only (`origin/story-7-1..origin/story-7-2`); 7.1 / 8.1 code not reviewed.

**Outcome: CHANGES REQUESTED — 1 medium, 5 low, 1 nit.** The money core is right: the counters are only ever written by server sim events, the client sends no amount, `(run_id, account_id)` makes every repeat a no-op, and **`FOR UPDATE` was checked under a real PostgreSQL 16** (installed here): it works, and taking it out really does break the rookie rule (see M-probe below). The one medium is a bank that times out but commits later.

### Findings

| ID | Sev | Where | Scenario | Minimal fix |
| --- | --- | --- | --- | --- |
| **M1** | Medium | `apps/server/src/db/progressRepo.ts:82-127` with `db/timeout.ts:21-36`; `apps/server/src/meta/banking.ts:173-188` | `withDbTimeout` only stops *waiting*. The transaction keeps running on its pool connection. **Reproduced on real PostgreSQL**: the progress row was locked by another session for 5.5 s. Both bank attempts timed out at 2 s each, and the player got `run.rewards {status:"failed", total:0}` ("Couldn't save this run"), plus two `supplies_bank_failed` lines carrying the full breakdown. Afterwards **both transactions committed: `run_rewards` row written, +50 Supplies paid**. So (a) the panel lies (brief 20: "honest, nothing invented later"), and (b) the log line exists *so the run can be granted by hand* (AC 4 / Beat the rule 3), so an operator following it pays the run a second time (brief 18). With a 3 s lock the retry found the late row, and the result was `saved` and correct. | Make a timed-out bank unable to commit: start the transaction with `SET LOCAL lock_timeout = '1500ms'` and `SET LOCAL statement_timeout = '1500ms'` (Postgres only; both under `DB_TIMEOUT_MS`), so Postgres rolls back before the caller gives up. **And** make `supplies_bank_failed` / the hand-grant note in `docs/deploy.md` say "check `run_rewards (run_id, account_id)` first". Test: the realPostgres probe's 5.5 s case must end with `failed` **and** supplies unchanged. |
| L1 | Low | `apps/server/src/db/runRewards.test.ts` ("two rooms ending at once…") | The committed concurrency test runs on PGlite (one connection), so it passes without the lock. The builder flagged this. On **real PostgreSQL**, with `.for("update")` removed, two runs ending together at lifetime 250 **both got the rookie ×2: lifetime 450 instead of 400, 10 of 10 tries**. With the lock: 400 every time. Plain sums stay right either way (`supplies + n` is atomic); only the rookie read needs the lock. | Commit an opt-in real-PG test, skipped unless `TEST_DATABASE_URL` is set, so CI or the VPS can run it. A ready test is in `7-2-review-probes/realPostgres.probe.ts.txt`: rookie race, 20 runs at once, 10× double-submit of one run, new-account race, late-commit cases. |
| L2 | Low | `apps/client/src/ui/overlay.css:431` (`.results__name`), `:1528` (`.rw-total__n`) | At 568×320, a 16-character name made of wide letters (`WWWWWWWWWWWWWWWW`, allowed by `NAME_MAX` 16) pushes Kills / Earned off the right edge of the team card (table scrollWidth 378 > card 268; also at 844×390). An account total of 7+ digits (`1,234,567`) is clipped in the rewards card (scrollWidth 132 > 123). Realistic names (`Alexandra_Smith1`) and totals up to 5 digits fit. The R9 sweep only used short names. | `.results__name` gets `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` with a max width; `.rw-total__n` gets `min-width:0` plus a smaller font (or ellipsis) past 6 digits. Add a 16×"W" name and a 7-digit total to the R9 layout test. |
| L3 | Low | `rewardsModel.test.ts`, `rewardsStore.test.ts`, `RunRoom.rewards.test.ts` | Three mutations survived (list below). (a) Hiding the Waves line at 0 waves (B9 says Waves is always shown). (b) `runRewardsSchema` `.passthrough()` → `.strict()`. That is B11's forward-compatibility promise: with it broken, a tab one version behind would drop 7.4/7.11's richer message and show "Saving…" forever. (c) Removing the `run.rewards` resend in `attachClient` (a reconnect on Results). It works live (room probe P2) but no test fails without it. | One test each: a 0-wave saved view still lists "Waves 0 × 10"; the client store accepts a message with an extra unknown field; a held seat that rejoins on Results receives `run.rewards`. |
| L4 | Low | `ResultsScreen.tsx` / `rewardsModel.ts` (B5) | Leave mid-run (banked as `quit`, e.g. 3 waves = +60), then come back through the remembered seat and play to the end. Results shows the old **+60** with no explanation (room probe P1: one row, 60). Nothing is paid twice (right per B5), but the player can't tell why a full run paid 3 waves. | Add `ending` to `run.rewards` (passthrough-safe) and, when it is `quit` on a Results the seat is present for, a status line under the Supplies, e.g. "Banked when you left (wave N)". |
| L5 | Low | `apps/client/src/ui/rewardsModel.ts:55`, `net/rewardsStore.ts:43` | The rewards are matched to Results by **seed**, not run id. With the dev fixed seed (`DEV_ALLOW_RUN_SEED=1` + `?seed=`), Back to lobby → next run → wipe shows the **previous run's** numbers at once instead of "Saving…" until the new message lands. Production risk is 1 in 2³² per pair of runs. | Put `runId` in the Results screen (schema string or the `run.rewards` already-received id) and match on it, or clear `rewardsStore` at `RUN_STARTED` / phase "build". |
| N1 | Nit | `ResultsScreen.tsx` vs `docs/art/epic-7/lumen/results.jpg` (RW1) | Built panel vs the picked sheet: no "YOU" marker or highlight on your own row, Earned shows `$1840` where the sheet has `$1,840`, and the wave number is not at the top right. Kicker "Run report" is an accepted B15 change, and the Training column is 7.5's TL3. Otherwise a faithful LF5 build (bevelled frames, amber accent, white numerals, rookie badge, crate + TOTAL). | Optional: own-row highlight + "YOU" (the screen knows the local slot), and `formatSupplies`-style grouping on Earned. |

### Beat the rule — every attempt

| # | Attempt (player / cheater / two tabs) | Result |
| --- | --- | --- |
| 1 | Cheater sends `run.rewards`-like or amount-carrying messages | No C2S handler for amounts. `run.leave {supplies:99999}` is refused by the strict guard (existing test) ✔ |
| 2 | `run.leave` spam ×30 mid-wave (probe P3) | 1 row, 9 replies (message guard bucket), player still in the World. It only banks the cheater early as `quit` (self-harm only) ✔ |
| 3 | Bank twice: same `endRun` twice; `run.leave` twice; Leave → remembered seat → rejoin in build → play to run end (B5, probe P1) | Always **one** `run_rewards` row, paid once. The rejoined seat keeps its own counters (`wavesIn` 3), same playerId ✔ (L4 = the UX) |
| 4 | Retry after 2 s + late commit after a timeout (real PG, locked row 3 s) | Retry finds the late row → `saved`, paid once ✔ |
| 5 | Same, but the lock lasts 5.5 s (both attempts time out) | Told **failed**, yet paid later ✘ → **M1** |
| 6 | Concurrent double-submit of one (run, account) ×10, real PG | 1 banked, 9 duplicates, paid once ✔ |
| 7 | Two rooms / 20 runs ending at once for one account, real PG | Sum exact ✔. Rookie race at lifetime 250: only one run doubled (400) ✔. Without `FOR UPDATE`: 450 ✘ (L1: test only) |
| 8 | Brand-new account with no progress row, two banks at once (real PG) | Both fulfilled, 10 ✔ |
| 9 | Drop mid-wave (held) → team wipes → reconnect by token on Results (probe P2) | No bank at the drop (brief 17) ✔. Held seat banked at run end with the run's ending, 2 waves + the D8 wipe wave = 3 → 60 (rookie) ✔. The rejoin receives `run.rewards` again ✔ |
| 10 | Two runs in one room (Back to lobby, start again, probe P4) | Different runIds and seeds, 2 rows, 100 + 60 = 160 (the second run's rookie read sees lifetime 100) ✔ |
| 11 | Earn while held, quiet-held, downed or out | Counted by design (S2, 8.1). A remembered seat stops counting. Code + `runRecord.test` ✔ |
| 12 | Inflate waves / bosses | Counters come only from `wave.ended` / `team.wiped` / `boss.killed` in the server sim, capped u8/u16, and `runSupplies` clamps garbage to 0. Same-tick wipe + clear can't double count: the player system (`checkTeamWipe`) runs before the waves system, and `updateRun` returns at `teamWiped` before `endWave` ✔. Dev switches (`DEV_START_WAVE`, `DEV_BOSS_WAVES`) are refused in production ✔ |
| 13 | Farm by Leave-and-rejoin each wave | Same room: same playerId and the DB key `(run, account)` → paid once. New room: new run from wave 1, so nothing gained ✔ |
| 14 | Rookie ×2 crossing 300 mid-run; exactly 300 | Doubled when lifetime before < 300, read inside the locked transaction; 300 → not doubled (supplies.test) ✔ |
| 15 | Practice solo vs online solo | Practice never talks to the server; the panel says "Practice runs don't earn rewards" (wiring + model tests) ✔. Online solo = the 4-player numbers (S7 test) ✔ |
| 16 | Endless (B2) / D8 / B6 endings | Endless Behemoth counted only when wave > `runWaves` (not via `boss.killed.number`). Wipe after Stay keeps waves 1–10 + the wave-10 boss. Wipe in a build phase adds nothing. Abandon banks remembered seats `quit` (unit) ✔ |
| 17 | Negative / overflow integers | DB CHECK ≥ 0, payout clamp, schema 0…1e9, u8/u16 caps match the schema ✔ |
| 18 | Database down | No repo → `not_saved`. Repo failing → retried once → `failed`, nothing banked (room test) ✔. Slow but alive → M1 |
| 19 | Server restart mid-bank | One transaction: all or nothing. The run itself is lost (D7, accepted) ✔ |
| 20 | Leave while the link is reconnecting (`lobbyStore.leave`, linkDown) / deliberate tab close before the extract | The server sees a **drop**: the seat is held up to 120 s, keeps counting waves, and gets the +100 if the team extracts inside that time. That is 8.1's "a drop is not a leave" (brief 17), not a 7.2 bug. Info for the designer ⚠ |
| 21 | Account appears mid-run (7.1 B8: unsaved seat adopts a ticket later) after an unsaved Leave-bank | The in-memory bank is keyed by playerId, so the run stays `not_saved` for that seat (nothing paid). Honest, edge case, info ⚠ |
| 22 | Results panel at 568×320: all 7 states, long names, big numbers (real DOM via a Vite harness, Chromium) | All states inside the cards, no page scroll. Realistic names and totals fit. Worst-case glyphs overflow → L2 |
| 23 | Row order for later stories (brief 26) | One `rw-body` column, the supplies group first; groups 2–4 go after it (comment + model `REWARD_GROUPS` test) ✔ |
| 24 | Vote line text and place (B3) | "Extract now: +100 · Stay: +20 a wave, lost if you wipe" from `progression.json` ✔, above the buttons (button rects unchanged per `evacVoteCss` / `hudLayout`). The chips row moves up by one 16 px line: **not verified in a live vote at 568×320** |

### Mutations (brief 6: each new test file mutated once)

| Mutation | Tests | Result |
| --- | --- | --- |
| M1 a quitter also gets the extract (`supplies.ts`) | supplies + runRecord | caught (2 failed) |
| M2 endless Behemoths never counted apart (`runRecord.ts`) | runRecord + endlessSim | caught (2) |
| M3 no retry (`banking.ts` attempt ≤ 1) | banking + room | caught (3) |
| M4 a repeat bank doesn't re-deliver | banking + room | caught (2) |
| M5 no `run.rewards` resend on a Results rejoin (`RunRoom.attachClient`) | room rewards + reconnect | **survived** (the 1 failure, the 8.1 "quiet seat 120 s clock" test, also fails unmutated under load: unrelated, timing) → L3 |
| M6 a leaver banks `extracted` instead of `quit` | room rewards | caught (2) |
| M7 Leave never sends `run.leave` (`lobbyStore`) | lobbyStore + rewardsStore | caught (2) |
| M8 rewards not matched by seed (`rewardsStore.forSeed`) | rewardsStore + rewardsModel | caught (1) |
| M9 Waves line hidden at 0 (`rewardsModel`) | rewardsModel | **survived** → L3 |
| M10 `runRewardsSchema` strict instead of passthrough | rewardsStore + rewardsModel | **survived** → L3 |
| M11 smallest panel font 11 → 10 px (`overlay.css`) | resultsLayoutCss | caught (1) |
| M12 drop `FOR UPDATE` (real PG probe) | review probe | caught by the probe (450 ≠ 400); the committed PGlite test survives (L1) |

### Brief lines checked

1 ✔ (gate line, ports, PID stop) · 2 ✔ (four counters in `PlayerState`, `addPlayer`, hold round trip, `snapshotWorld`; deliberately not in the schema, so no wire copy) · 3 ✔ S1–S7 each a named test · 4 ✔ above · 5 ✔ meta never changes the sim · 6 ✔ above · 7 ✔ every Supplies number in `progression.json` (retry/wait timings are plumbing, like `DB_TIMEOUT_MS`) · 8 ✔ ≈ 0 B/s, CSS only · 9 partly (reconnect across run end probed in a room; lag/loss/hidden tab not run, as the builder says) · 10 ✔ never awaited in the tick · 14 ✔ Notes for the merge · 15 ✔ · 17 ✔ (row 20 info) · **18 ✘ M1** (late commit) · 19 n/a · **20 ✘ M1** (panel says failed, money paid) · 21 ✔ (`db/` only, `testQueries.ts`, migration forward test on rows) · 22 ✔ D1 practice earns nothing · 24 ✔ LF5 (N1) · 26 ✔ · 28 ✔ no PII in `breakdown` · R1 ✔ (11 named tests spot-opened) · R2 ✔ `rewardsWiring` · R6 ✔ gate line present · R8 ✔ · R9 ✔ four sizes + insets in `rewardsModel.test` (L2 = name/number widths) · R10 ✔ this review.

### Evidence kept

`_bmad-output/implementation-artifacts/7-2-review-probes/`: `realPostgres.probe.ts.txt` (run against `postgres://…:5731`, PostgreSQL 16, as `apps/server/src/db/*.test.ts`), `roomProbes.probe.ts.txt` (P1–P4, as `apps/server/src/rooms/*.test.ts`), `resultsHarness.probe.tsx.txt` (Vite page for the panel states). Typecheck ✔ (`npm run typecheck`, exit 0). The full gate was not run (reviewer rule).

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: built on `story-7-2` (early start from `story-7-1`): T1–T7; build-time choices B1–B15; full gate green; status review.
- 2026-11-25: Addressed code review findings - 7 items resolved (M1, L1–L5, N1); B16–B18; merged origin/master (8.10) and origin/story-7-1 (re-review fixes).
- 2026-11-25: Senior Developer Review (AI): changes requested — M1 (timed-out bank commits later), L1–L5, N1.
