# Story 7.11: Milestone items

Status: review (built in the merged story 7.7 + 7.11 + 7.12 on branch `story-7-12`; Dev Agent Record in `7-12-surprise-loot-bag.md`)

<!-- Story file 2026-11-25 from the real code on master 7385b47. Customization story 4 of 5 (7.8 done → 7.9 → 7.10 ∥ 7.11 → 7.12). Decisions to confirm: docs/epic-7-story-decisions-looks.md › 7.11. -->

## Story

As a player,
I want to earn special items by doing something memorable,
so that my survivor shows what I've done.

> **Brief.** Epic 7 has no brief of its own yet. EPIC 6 BRIEF lines that apply (`docs/epic-6-brief.md`), reviewers check each: **1** (own cloud session, branch `story-7-11`, one full gate), **2** (the per-run counters are server/solo World-derived: list where each is counted), **3/4** (rules below are tests; reviewers beat them, especially farming), **8** (no randomness here), **9** (liveness: the sims really reach wave 5 / 10 / extract / endless 15; each new test mutated once), **10** (counters count events, ticks only; thresholds in data, no inline numbers), **18**, **19**, **28** (one run flow: counters close at every ending — wipe, extract, endless loss, quit — and Results always show), **29**, **32**. NETWORK PASS BRIEF **18** (counters come only from the server's World, never from a client) and **21** (a short drop held by 8.1 is not a leave: the player's counters keep running).
>
> **Scope:** the `cosmetics` and `stats` columns; per-run counters per seat; milestone checks M1–M10 in Story 7.2's end-of-run transaction; the new-item line on Results; ownership extended for 7.9's join check and 7.10's editor; 7.6's merge lines. **No** loot (7.12), no new part (7.8 drew all ten items).

## Acceptance Criteria

1. **Migration.** This story's migration adds `progress.cosmetics` (text array of owned part keys `slot:id`, default empty) and `progress.stats` (JSON object of lifetime counters `{ revives, kills, barricades, runs }`, default all 0). Nothing else. Keys are `slot:id` because ids are unique per slot only (7.9 AC 4).
2. **Ownership everywhere.** 7.9's `ownedParts(cosmetics)` now gets the account's `cosmetics`: the join check (7.9 AC 5), the editor's tiles and Random (7.10 AC 6–7) and the look route (7.10 AC 8) all accept owned milestone parts. Only keys of real milestone or loot parts are ever written to `cosmetics` (a starter key is never stored).
3. **Per-run counters per seat (server).** For each seat (`playerId`) the run keeps, from World events only: `revives` (`player.revived` by `reviverId`, `simEvents.ts:70`), `kills` (the existing `RunController` count: own `zombie.killed`, not turret/mine kills, + 1 for finishing the Behemoth — `RunController.ts:565–578`; D6), `barricades` (wood barricades this player placed that are **still standing when the next wave starts**, D3), `downs` (`player.downed`), `wavesIn` (7.2's waves-this-player-was-in record), `bossKilledWhileIn`, `extractedStanding` (status `alive` at the extract tick). Kept next to 7.2's per-seat record; carried by Story 8.1's held seat; for Story 8.4's snapshot (note).
4. **Milestones (M1–M10)**, granted in **Story 7.2's end-of-run transaction** (the same database transaction that banks Supplies), each to every player who meets it, **once per account** (a part already in `cosmetics` is never added again, never listed again on Results):

   | # | Rule (data in `milestones.json`, shared with 7.10) | Item (`cosmetics.json`) |
   | --- | --- | --- |
   | M1 | Wave 5 ended while I was in the run (7.2's wave rule: playing, downed, out or held all count; D1) | `head:fire` Firefighter helmet |
   | M2 | The team extracted from **Downtown** while I was in the run | `head:riot` Riot helmet |
   | M3 | The Behemoth died while I was in the run (D1) | `head:gas` Gas mask |
   | M4 | Wave 15 ended while I was in the run (the 5th endless wave; D2) | `head:hockey` Hockey mask |
   | M5 | Lifetime revives ≥ 25 | `head:band` Headband |
   | M6 | Lifetime kills ≥ 1,000 | `top:camo` Camo coat |
   | M7 | Lifetime barricades ≥ 100 (D3) | `pack:planks` Plank bundle |
   | M8 | Extract with exactly 4 players in the run, all 4 standing at the extract tick (D5) | `head:laurel` Laurel wreath |
   | M9 | Lifetime runs ≥ 20 (a run counts when I was in it at the end of wave 1; D4) | `head:weld` Welding mask |
   | M10 | Wave 10 ended with me in every wave 1–10 and never downed in them (D7) | `pack:golf` Golf bag |

5. **Lifetime stats.** The same transaction adds this run's `revives`, `kills`, `barricades` and (when it counts) `runs` to `progress.stats` **as an increment in SQL** (`stats = stats + delta`, or a row lock `SELECT … FOR UPDATE`), never by writing back a copy read at join, so two runs ending at once on two devices both count. Lifetime milestones (M5, M6, M7, M9) are checked against the stats **after** the increment.
6. **Every ending.** Counters close and milestones are checked on every run end: wipe, extract, endless loss (6.12), and for a player who **quits** (Leave, or 8.1's hold running out) at the moment 7.2 banks them, with what they had then (waves ended before they left, kills so far). A short drop held by 8.1 keeps counting (NETWORK PASS BRIEF 21). A failed write is logged at `error` and retried once (7.2's rule); the retry neither double-counts stats nor double-grants items (idempotent per run id).
7. **Results.** Story 7.2's "Run rewards" panel gets one line per new item: **"New item: Riot helmet (first extraction)"** with a close-up drawing of the part (7.10's `partTileUrl` in the owner's colours, or the default colours), the reason from `milestones.json` (`howTo` in its past form, `resultLine`, e.g. "first extraction", "25 revives"). With D8, a **"Wear it"** button puts the part on my look and saves it (7.10's save path).
8. **Merge (Story 7.6).** 7.6's guest-into-account merge joins `cosmetics` (set union) and adds `stats` field by field; if 7.6 is already on master, this story adds those two lines to its merge function and its test; if not, 7.6 reads this rule (its story text already says so).
9. **Who earns at all.** Milestones and stats are banked exactly where Story 7.2 banks Supplies (server runs; Practice solo only if 7.2 makes practice solo bank). No client message can change a counter.
10. **Stats start at zero** when this story ships (there is no history to back-fill); M1–M4, M8 and M10 can be earned by the next qualifying run; nothing is granted retroactively.
11. **Tests** (Vitest; each mutated once): each milestone granted on its rule and not before (boundaries: wave 4 vs 5, 24 vs 25 revives, 999 vs 1,000 kills, 99 vs 100 barricades, 19 vs 20 runs, 3 players extracting for M8, a down in wave 9 for M10); no double grant across two runs; wipe, extract, endless loss and quit runs; a quitter's counters up to the leave; a held (8.1) player keeps counting; a late joiner (Epic 8's later joins) gets only their waves; a failed write retried once without double counting; two runs of one account ending in the same second both add their stats; ownership: a milestone part joins after it's granted; merge union/add; a bot run (`npm run bots`) to wave 5 grants M1 to every bot (liveness).

## Fairness / player-visible rules (each is a test)

- **M-F1 "Team moments are for the whole team."** M1, M3, M4 go to everyone who was in the run when it happened, downed or out too — the same rule as Supplies (D1, epic decision D2). Test: a player out since wave 3 gets M1 when the team clears wave 5.
- **M-F2 "You can't farm a milestone."** Barricades count only if still standing when the next wave starts (place-and-take-back in one build gives nothing); a run counts only if you were in it at the end of wave 1 (create-and-quit gives nothing); kills and revives come only from the server's World. Test: 100 place/take-back cycles in one build phase → +0 barricades; 20 runs quit in build 1 → +0 runs.
- **M-F3 "Earned once, kept forever."** An item is granted once per account, never taken away, never shown again as new. Test: two qualifying runs → one grant, one Results line.
- **M-F4 "A bad night doesn't lose it."** Milestones reached before a wipe or a quit are kept (they are checked at the end with what happened). Test: wave 5 cleared, wipe in wave 6 → M1 granted.
- **M-F5 "Your stats can't go backwards."** Two devices, two runs ending at once → both runs' stats added. Test as in AC 5.
- **M-F6 "Cosmetic only."** A milestone item changes nothing in play (7.8's catalogue has no gameplay field; the replay digest with any items = golden). Test: replay with every milestone item worn = golden digest.

## Tasks / Subtasks

- [x] **T1 Data** (AC 4) — `packages/shared/src/config/milestones.json` + `milestones.ts` (zod, strict): `m1`–`m10` `{ id, howTo, resultLine, rule: { kind, n?, district? } }` (table in 7.10's Dev Notes, plus `resultLine`). Cross check at load: each `mN` has exactly one part with `unlock: milestone:mN` in `cosmetics.json`. If 7.10 created the file, add `resultLine` only.
- [x] **T2 Migration + repository** (AC 1, 5) — Drizzle columns `cosmetics text[] not null default '{}'`, `stats jsonb not null default '{"revives":0,"kills":0,"barricades":0,"runs":0}'`; repository functions `grantCosmetics(tx, accountId, keys)` (union, returns the keys that were new), `addStats(tx, accountId, delta)` (SQL increment, returns the new totals). DB tests.
- [x] **T3 Per-run counters** (AC 3, M-F2) — in the server's per-seat run record (7.2's, next to `RunController`'s `PlayerSlot.kills`, `RunController.ts:144`): `revives`, `downs`, `barricadesPending` (ids placed this build by this player, wood barricades only), `barricades` (moved from pending to counted for every pending id still in `world.buildings` at `wave.started`; cleared at `build.started`), `bossKilledWhileIn`, `extractedStanding`, `inWaveOneEnd`. Counted in `RunController.step`'s event loop (`:563–579`), the same place kills are counted. Held seats (8.1) keep their record.
- [x] **T4 Milestone check** (AC 4–6, 9, 10) — `apps/server/src/meta/milestones.ts`: `milestonesReached(runRecord, statsAfter, run) → mN[]` (pure, table-driven from `milestones.json`), `milestoneParts(ids, owned) → new keys`. Called inside 7.2's banking transaction for each seat (and for a quitter at their bank point); idempotent per run id (7.2's retry key).
- [x] **T5 Ownership** (AC 2) — `ownedParts(progress.cosmetics)` in 7.9's `checkAuth` path and 7.10's look route; the session/progress response (7.1) includes `cosmetics` so the editor shows owned items.
- [x] **T6 Results line** ("Wear it" not built: needs 7.10's save path — B21) (AC 7) — 7.2's Run rewards panel: the "New item" line with the part tile and reason; with D8 the "Wear it" button (sets the part in my look, saves through 7.10's `saveLook`, works only for my own row). The server sends the new keys per player with 7.2's rewards message.
- [ ] **T7 Merge** (7.6 not on master: note left for 7.6 — B28) (AC 8) — 7.6's merge function: `cosmetics` union, `stats` added (+ its test), or a note for 7.6 if it isn't on master.
- [x] **T8 Tests + gate** (AC 11) — unit (rules, boundaries), DB (increment race, idempotent retry), room (bank on wipe / extract / quit / held), bots to wave 5 (M1 liveness), headless 10-wave sim with a never-downed bot for M10 (`tools/sims`), full gate, "Notes for the merge", "Not verified".

## Dev Notes

### What exists today (read before changing)

- **Events (shared sim):** `packages/shared/src/core/simEvents.ts` — `zombie.killed { killerId, buildingId? }` (`:32`), `player.downed { playerId }` and `player.revived { playerId, reviverId }` (`:69–70`, emitted in `player/downed.ts:92` and `:207`), `wave.started { number, size }` and `wave.ended { number }` (`:76–77`), `build.started { wave }` (`:80`), `building.placed { buildingId, buildingType, ownerId }` (`:84`, emitted only by `placeBuilding`, `buildings/buildings.ts:433`), `boss.killed { killerId }` (`:217`). Epic 6.11 adds `run.extracted { wave }` and `RunState.ending` (`"wiped" | "extracted" | "lost"`) — check at build time.
- **Kills:** `RunController.ts:144` `PlayerSlot.kills`, counted at `:565–578` (own `zombie.killed` with no `buildingId`; +1 for `boss.killed` by the finisher, Story 6.7 D5). `RunController.kills(playerId)` (`:489`). Results show it.
- **Barricades:** placements are always `wood_barricade` (reinforced and metal are upgrades of a placed barricade, Story 5.9: `buildings.json` `wood_barricade.upgradesTo → reinforced_barricade`). Story 5.20's take-back in the same build phase refunds 100 % (`paidThisBuild`, `sellRefund`), so counting placements would be farmable; counting "still standing at the next `wave.started`" isn't (D3). Moving a building (5.21/5.22) is not a placement (`building.placed` only comes from `placeBuilding`).
- **Run end:** `RunRoom.onTick` forwards `team.wiped` / `run.held_out` to `endRun` (`RunRoom.ts:770–771`, `endRun` at `:785`, logs `run_ended`). Story 6.11 replaces `run.held_out` with `run.extracted` and adds endless; Story 7.2 adds the banking transaction and per-seat wave records. This story plugs into 7.2's transaction, not into `endRun` directly.
- **Bots:** `packages/shared/src/bots/headlessRun.ts` already counts `revives` per bot (`:189`) — a good harness for the sims.
- **Ownership (7.9):** `ownedParts(cosmetics?)` builds the `slot:id` set; 7.9 calls it with nothing.

### Rules in detail

- **"In the run when it happened"** = 7.2's per-seat waves record (`wavesIn`): a player who joined late (Epic 8) or left before doesn't get it; downed, out and held (8.1) players do. M1 is "wave 5 in `wavesIn`", M4 "wave 15 in `wavesIn`".
- **M2 Downtown:** the run's district id from 7.7 (`downtown` until a second district exists; Epic 11's Random city is not Downtown → no M2 there; check at build time).
- **M3:** `boss.killed` while the seat is in the run (not only the finisher; D1).
- **M8:** at the extract tick: the World has exactly 4 players (held 8.1 seats are not in `world.players`, so a dropped teammate breaks it) and all 4 have status `alive`. Granted to all four.
- **M10:** `wavesIn` contains 1–10, `downs` during waves 1–10 is 0. Downs in endless after wave 10 don't matter (D7).
- **M9 runs:** `+1` when the seat's `wavesIn` contains wave 1 at the bank (D4).

### Check at build time

- Story **7.2** (other writer): the banking transaction function, its per-seat record, its retry/idempotency key, the "Run rewards" panel component and the rewards message — this story adds to all four. If 7.2's per-seat record already has `downs` or waves, reuse them.
- Story **6.11/6.12** (`run.extracted`, `ending`, endless waves numbering from 11), **6.9** (does the survivor NPC or supply crate emit anything that should count? no), **8.1** (held seats, `rememberedSeats`: counters ride with the seat), **7.7** (district id), **7.6** (merge function).
- Story **7.10**: `milestones.json`, `partTileUrl`, `saveLook` (D8).

### Architecture compliance

- Server only (architecture › Accounts and meta-progression: `apps/server/src/meta`); database through `apps/server/src/db` repositories; one transaction per run end (7.2).
- Shared data in `packages/shared/src/config/milestones.json` (thresholds are unlock data, not gameplay balance: not in `Balance`, no version bump).

### Files

- New: `packages/shared/src/config/milestones.json` + `milestones.ts` (+ test; unless 7.10 made them), `apps/server/src/meta/milestones.ts` (+ test), the 7.11 migration, DB tests.
- Changed: 7.1's progress repository (`cosmetics`, `stats`), 7.2's banking transaction and per-seat record, `apps/server/src/run/RunController.ts` (counters), `apps/server/src/rooms/RunRoom.ts` (bank call site if 7.2 put it there; ownership input to 7.9's check), 7.10's look route (`ownedParts(cosmetics)`), 7.1's session response, 7.2's Run rewards panel (client) and rewards message, 7.6's merge (if on master), `packages/shared/src/index.ts`.

## Test plan

| Area | Test | Mutation that must fail it |
| --- | --- | --- |
| Rules | each M1–M10 at its boundary; D1 out-player gets M1 | `>` instead of `>=` for M5 → 25-revive test fails |
| Farming | 100 place/take-back cycles → 0 barricades; 20 build-1 quits → 0 runs | count `building.placed` directly → farming test fails |
| Once | two qualifying runs → one grant | skip the owned check → double-grant test fails |
| Endings | wipe after wave 5 → M1; quit after wave 5 → M1; endless loss after wave 15 → M4 | check only on extract → wipe test fails |
| Stats | concurrent run ends add both; retry adds once | read-modify-write from join → race test fails |
| Ownership | granted part joins worn (7.9) and shows owned in the editor | ownedParts ignores cosmetics → join test fails |
| Results | "New item: Riot helmet (first extraction)" for the extracting players only | — |
| Liveness | bots to wave 5 → every bot has M1; sim to wave 10 with a never-downed bot → M10 | — |

## Beat the rule (reviewers: start here, then go further)

1. **Farming:** place/take back barricades; place barricades and sell them right after the wave starts (counted: they stood at the start — acceptable? they cost money each wave; note the cost); revive-farm (a friend stands in a crowd to go down, you revive; 25 revives over a few runs — accepted as co-op play); kill-farm in endless (accepted: playing is the cost); create solo online runs and quit in build 1 for M9 (gives nothing, D4); quit right after wave 1 ends 20 times (counts: each costs a real wave 1).
2. **Cheating:** a modified client sends fake `player.revived` / kill events — there is no such message; all counters come from the server's World. Check that no new message was added.
3. **Losing progress:** the database write fails once (retried), twice (logged; the next run's stats don't silently include the lost run's — the run's grant is lost; note it), the server restarts mid-run (7.2/8.4's rule: an unfinished run banks nothing; M-F4 covers only runs that end).
4. **Two devices:** the same account plays two runs on two phones at once; both end within a second → both stats added (AC 5), one grant per item.
5. **Edge of rules:** 4 players extract but one is held (dropped) at the extract tick → no M8 (only 3 standing in the World); a player downed in wave 10 then revived → no M10; endless loss at wave 15 before it ended → no M4.
6. **Offline:** Practice solo (LocalSimHost) → nothing banked unless 7.2 banks practice runs.

## Notes for the merge

- 7.2's banking transaction: one call per seat (`milestonesReached` + `grantCosmetics` + `addStats`) inside the same transaction; its retry key covers them.
- `RunController.ts`: the counters sit in the per-seat record beside `kills`; the event loop gains three cases.
- 7.2's Run rewards panel: one optional line per new item (7.12 adds its "Found in wave N" line next to it).
- `milestones.json`: shared with 7.10 (same table).
- For **7.12**: loot parts are written to the same `cosmetics` column with `grantCosmetics` (loot keys, same union).

## Decisions to confirm

Already decided (not asked again): the ten milestones and their items (customization proposal § 6, 7.8 picks); earned once, never bought (D3); granted in 7.2's transaction; a failed write retried once (7.2 rule); the merge rule (7.6 / epic D11).

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.11 D1 | Who earns the team moments (survive wave 5, kill the Behemoth, endless wave 15) | **Everyone in the run when it happens, downed or out too (same as Supplies)** (only players standing at that moment; the Behemoth only for the one who finished it) |
| 7.11 D2 | What "endless wave 15" means | **Clearing wave 15, the 5th endless wave** (clearing 15 endless waves, i.e. wave 25) |
| 7.11 D3 | Which barricades count toward 100 | **A barricade you placed that is still standing when the next wave starts; upgrades don't count** (every placement counts, even one taken back) |
| 7.11 D4 | What counts as a run for "20 runs" | **A run you were in when wave 1 ended** (every run you started) |
| 7.11 D5 | "Extract with all 4 alive" | **Exactly 4 players, all standing at the moment of extraction** (all players in the run standing, so 2- and 3-player teams can earn it too) |
| 7.11 D6 | Which kills count toward 1,000 | **Your own kills, as on Results (turret and mine kills don't count)** (turret and mine kills count too) |
| 7.11 D7 | "Wave 10 without going down" | **You were in every wave 1–10 and never went down in them** (never down while you were in the run, so a later joiner can earn it) |
| 7.11 D8 | The new item on Results | **Picture, name and reason, plus a "Wear it" button that puts it on** (picture, name and reason only; wear it from the editor) |

## Needs a look?

**Yes, small:** the **"New item" line in the Results "Run rewards" panel** (close-up drawing, name, reason, the "Wear it" button). It is part of Story 7.2's panel, whose layout is still open (readiness U3): draw it together with 7.2's panel proposals and 7.12's "Found in wave N" line, one pick for all three. The items themselves are already picked (7.8).

## Dependencies

- **Needs on master:** Story **7.2** (transaction, per-seat waves, Run rewards panel), **7.9** (`ownedParts`), **6.11/6.12** (extract, endless), **7.1** (database). **7.10** for `partTileUrl` / `saveLook` (D8) — or build the Results line with 7.9's `survivorPortraitUrl` and add "Wear it" after 7.10.
- **Parallel with 7.10** (overlap only `milestones.json`). **7.12** waits for this story's `cosmetics` column (or merges after it).
- **Other writer's stories:** 7.2 (banking, waves per seat, rewards panel), 7.6 (merge: `cosmetics` union, `stats` added), 7.7 (district id for M2; M2 and the district unlock fire from the same extract).
- **Epic 8:** Story 8.4's snapshot must carry the per-seat counters (note for 8.4's round-trip list).

## References

- `_bmad-output/planning-artifacts/epics.md` › Story 7.11, FR89; `sprint-change-proposal-2026-11-24-survivor-parts.md` (M5 headband, M7 planks, M8 laurel, M9 welding mask, M10 golf bag); `sprint-change-proposal-2026-11-24-epic-7-readiness.md` (Q2, Q6)
- `docs/ideas/customization/proposal.md` § 6, § 7; `docs/ideas/epic-7/proposal.md` § 0 D2, D11; `docs/epic-7-decisions.md` › Final catalogue
- `_bmad-output/implementation-artifacts/7-9-my-look-in-the-game.md`, `7-10-survivor-editor.md`, `8-1-reconnect-within-2-minutes.md`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story context created 2026-11-25 from master 7385b47: comprehensive developer guide, status ready-for-dev.

### File List

- 2026-11-25: built in the merged story 7.7 + 7.11 + 7.12 (branch `story-7-12`); the named tests per task, the Gate line, Notes for the merge and Not verified are in `7-12-surprise-loot-bag.md` › Dev Agent Record.
