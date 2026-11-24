# Epic 6 retrospective: evidence pack

- **Written:** 2026-11-24 (late), for the `gds-retrospective` run that follows once the last Epic 6 stories land. Docs only; no code changed.
- **Snapshot:** `origin/master` at `da82847` (2026-11-24 23:00:46) plus the in-flight branches as fetched at about 23:15: `story-6-8` `9743f51`, `story-6-9` `ef109d3`, `story-6-11` `3008990`, `review-6-11` `aaf1099`.
- **Sources:** the Epic 6 story files (`6-*.md` on master; 6.8, 6.9 and 6.11 read from their branches), `docs/epic-6-brief.md`, `docs/epic-6-decisions.md`, `HANDOFF.md` §3, `epic-5-retro-2026-11-24.md` §10–11, `docs/perf/epic-6-*.md`, `apps/client/src/scenes/hudLayout.test.ts`, and `git log --all` commit times (all UTC, 2026-11-24).
- **Grades:** **[V]** checked in files or git. **[R]** reported only in session messages, not checkable in the repo. **[I]** my inference, labelled as such. Wall-clock times are differences between commit times. A commit marks when work was pushed, not when it started, so each stage time is an upper bound for the stage that ended at that commit.

## 0. Status at the snapshot

| Story (as built) | Keys | Status | On master |
| --- | --- | --- | --- |
| 6.1 Full 10-wave curve | 6.1 | done | `9849071` 17:33 |
| 6.3 Blackout lighting | 6.3 | done | `603099b` 18:35 |
| 6.5 The Behemoth arrives | 6.5 | done | `a52c7b9` 20:01 |
| 6.6+6.7 Charge, throw, enrage, end | 6.6, 6.7 | done | `c818231` 22:13 / `efbe4ad` 22:18 |
| 6.2+6.4 Ruins and Collapse | 6.2, 6.4 | done | `9c540b3` 22:43 |
| 6.8 Events: car alarm, stampede | 6.8 | **in flight**: built, story says `Status: review`, no review on any branch yet | no |
| 6.9+6.10 Gas leak, supply drop, power failure, survivor | 6.9, 6.10 | **in flight**: one build commit `ef109d3` (sim and wire), Dev Agent Record still empty | no |
| 6.11+6.12 Vote and endless | 6.11, 6.12 | **in flight**: reviewed (`aaf1099`), fixes pushed (`13f7711`), **re-review not yet on any branch** | no |

So 8 of 12 keys are on master; 4 are in flight.

## 1. Timeline per story

### 1a. Commit times per stage

"Hand-back" is the builder's last record or gate commit before the review. The `send_message` hand-back itself is not in git **[R]**. "Start" for round 1 is the dispatch commit `8704bbd` 16:48:24 ("Epic 6 round 1: 6.1, 6.3, 6.5 in progress"). Round 2+ has no dispatch commit, so its start is unknown; the first build commit is given instead.

| Story | Start / first build commit | Hand-back | Review result | Fixes pushed | Re-review | On master |
| --- | --- | --- | --- | --- | --- | --- |
| 6.1 | 16:48 dispatch; `3c614f0` 17:08 | `5f9c063` 17:17 (gate) | no review commit; review recorded with the fixes | `2b876df` 17:32 (lows) | none needed (0 H/M) | `9849071` 17:33 |
| 6.3 | 16:48 dispatch (`4d5abfa` aboveDark early 16:48) | `9fa5a1e` 17:55 (re-gate after 6.1) | review on merged 9849071; relayed by the main session | `4a13032` 18:05; B3 built `4b74c2b` 18:16; gate `c51d307` 18:22 | on `c51d307`: clean; lows `a2ea078` 18:34 | `603099b` 18:35 |
| 6.5 | 16:48 dispatch; `2d4ff7a` 17:18 | `3702a1a` 18:44 (record + merge of 6.3) | review of `3702a1a` (main session) | `2b2ad6f` 19:05 | RR1 → `0c36d31` 19:26; RR2 → `1c92977` 19:53 | `a52c7b9` 20:01 |
| 6.6+6.7 | after 6.5 (20:01); first commit `821a427` 21:06 | `194d1d8` 21:16 | `3db05c7` 21:28 (cloud reviewer, full gate) | `96777a8` 21:36; text `f91058c` 21:43; perf `fd84265` 22:00 | `0836e4a` 22:12 (narrow) | `c818231` 22:13, `efbe4ad` 22:18 |
| 6.2+6.4 | first commit `d1f6d5f` 21:19 | `e84ab07` 21:38 | `df48a5a` 22:07 (cloud reviewer, full gate 469 s) | `6c88186` 22:23; gate `1e1f037` 22:33 | `0b78931` 22:42 (narrow) | `9c540b3` 22:43 |
| 6.11+6.12 *(in flight)* | branched from `story-6-6`; master merged `db17082` 21:50; build `e80f7d6` 22:30 | `132c90d` 22:32 | `aaf1099` 22:52 (no full gate) | `13f7711` 23:09 | **pending** | — |
| 6.8 *(in flight)* | `a8a70cd` 22:32, started before 6.6+6.7 was on master | `a788312` 23:04 ("status review") | **pending** | — | — | — |
| 6.9+6.10 *(in flight)* | branched from `a8a70cd` (story-6-8); `ef109d3` 23:14 | — | — | — | — | — |

### 1b. Wall-clock per stage (minutes, from the commit times above)

| Story | Build (start → hand-back) | Review + fixes | Re-review(s) + fixes | Close-out | Hand-back → master | Start → master |
| --- | --- | --- | --- | --- | --- | --- |
| 6.1 | 29 | 16 | — | 1 | 16 | 45 |
| 6.3 | 67 | 27 (incl. the B3 decision and build) | 13 | 1 | 40 | 107 |
| 6.5 | 116 | 21 | 21 + 27 | 8 | 77 | 193 |
| 6.6+6.7 | ≤ 75 (start not in git) | 12 review, then 32 fixes | 12 | 1–6 | 62 | ≤ 137 |
| 6.2+6.4 | start not in git | 29 review, then 26 fixes and gate | 9 | 1 | 65 | — |
| 6.11+6.12 | start not in git (≤ 21:50) | 20 review, then 17 fixes | pending | — | ≥ 43 so far | — |

### 1c. Round 1 (session 8) vs round 2+ before and after the session-9 speed-up

The speed-up rules landed in `e2e5e8f` at 21:49:17 (HANDOFF §3, "Session 9 speed-up").

| | Session 8, round 1 (16:48 → 20:01) | Session 9, before 21:49 | Session 9, after 21:49 |
| --- | --- | --- | --- |
| Builders at once | 3 (6.1, 6.3, 6.5) [V] | 3 (6.6+6.7, 6.2+6.4, 6.11+6.12 from ≤ 21:50) [V] | 4 by 22:32: 6.2+6.4 fixes, 6.11+6.12, 6.8, then 6.9+6.10 from 6.8's first commit [V] |
| Parallel start on file overlap | no; by round [V] | 6.11+6.12 branched from `story-6-6` before 6.6 landed [V] | 6.8 started before 6.6+6.7 landed (HANDOFF §3 rule 1); 6.9+6.10 branched from 6.8's first commit [V] |
| Reviewer runs the full gate | 6.3, 6.5: not stated; 6.1: review on merged tree, gate by builder [V] | 6.6: yes, full gate (3db05c7) [V] | 6.2: **yes, full gate, 469 s**, although after 21:49 (dispatched before the rule [I]); 6.11: **no**, typecheck + probed tests [V] |
| Re-review scope | 6.3: fresh agent; 6.5: two full passes in the main session [V] | — | narrow: 6.6 (typecheck + 7 probed files, 12 min) and 6.2 (typecheck + 8 files, 9 min) [V] |
| Review time (hand-back → review commit) | 6.1 ≤ 16, 6.3 ≤ 10, 6.5 ≤ 21 incl. fixes | 6.6: 12 | 6.2: 29 (full gate), 6.11: 20 (no gate) |
| Re-review time | 6.3: 13; 6.5: 21 and 27 | — | 6.6: 12; 6.2: 9 |
| Hand-back → master | 16 / 40 / 77 | — | 6.6+6.7: 62; 6.2+6.4: 65 |
| Keys on master | 3 in 3.2 h | 4 keys (6.2, 6.4, 6.6, 6.7) between 22:13 and 22:43 | |

Observations, all **[I]** from the table:

- Narrow re-reviews were faster (9–12 min vs 13–27 min) and still found new issues (6.6 R1, R2; 6.2 R1). Dropping the reviewer's full gate saved about the gate time (6.2's full gate alone was 469 s ≈ 8 min).
- Hand-back → master did not get shorter for the merged pairs (62–65 min vs 6.5's 77). The fix stage stayed the biggest single block (6.6: 32 min including a perf run; 6.2: 26 min including a merge and a full gate).
- 6.5 took the three passes the Epic 5 retro predicted (§9 R1: "expect 3 passes"). 6.6+6.7 took two passes, with no high or medium about fairness.

## 2. Findings table

Counts come from each story's "Senior Developer Review (AI)" and re-review sections. "Brief line" is the line the finding broke, as cited by the reviewer or as read from the finding text (marked [I]).

| Story | Pass | H | M | L | Nit | Brief lines broken | Behaviour-changing fixes | New issues found by the re-review | Surviving mutations (first time) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 6.1 | review | 0 | 0 | 4 | 0 | 9 (L1, L2 survivors), 32 (L3 story ×0.4 vs B2 ×0.35), 19/16 (L4 baseline note) | none | n/a | builder: god-mode off (survived, then fixed); review: "no clamp", `fixedAtList → []` |
| 6.3 | review | 1 | 2 | 8 | 0 | H1: 24/26 (a release switch could LIGHTEN a dark wave) [I]; M1: 24 (lit strip under camera shake); M2: 31 (baseline matched id + rule only); L3 → 6.4 D4; L6: 10; L7: 32 | H1, M1, L1, L2, L8, B3 | re-review: 0 H/M, 6 lows (pad, glow, B3 wiring, forced 100 lit a blackout) | builder: `lowFx` lowers alpha (needed a source guard); review: BL3 hard cone, rain dim |
| 6.5 | review | 1 | 2 | 6 | 0 | H1: 7 (boss reaches a player; latched fallback) [I]; M1: 6 (per-body clock); M2: 13 (zombie under the body unshootable and hidden); L4: 10 | H1, M1, M2, L6 | **RR1: M-new-1 (medium) created by the L6 fix** + L-a…L-e; **RR2: LOW-1 (D8 "slows, not stops" broken by the M-new-1 fix)**, LOW-2…4 | builder: rewind position (survived, then killed), downed hit (equivalent: enforced twice); review: L1, L2; RR1 L-e list |
| 6.6+6.7 | review | 0 | 1 | 4 | 2 | M1: 12 (no `?stress=150` FPS); L1: 21(f)/once-per-charge (16 hits on a slot-less survivor); L2: 10 (literal 20); L3: 9; L4: 21(f) | L1, L2, L4, N2 | **R1 (low): the L1 fix shifts a slot-less bit when a player leaves → 2 hits**; R2 (test gap in N2's fix), R3, R4 | builder: segment→point, downed hit (both equivalent); review: M19, M21, M22, M24; re-review: N2 generation (R2), R4 (equivalent) |
| 6.2+6.4 | review | 0 | 3 | 6 | 0 | M1: 2/26 (Predictor aim-assist parity; T3 marked [x]); M2: 7 (boss fuzz never at stages 4–5); M3: 9 (ten-wave sim: no stage-4 liveness; T6 marked [x]); L1: 3; L4: (5.20 refund rule); L5: 24/26 [I] | L4 (same numbers today), L5 | R1 (low): GameScene fog wiring still untested; R2 (nit) | review: M7, M16, M17, M18, M19; re-review: GameScene drops `zombieView.fog` (R1) |
| 6.11+6.12 *(in flight)* | review | 0 | 3 | 10 | 2 | M1: 17, 30 (vote flood drops the last tap); M2: 14 (late dawn after a frozen tab; AC 10); M3: 25 (endless sim never asserts "flat"); L1: 31; L2: 31 (EXTRACT exemption); L3, L4: 9; L5: config; L6: 14; L8: 10; L9: 32 (story ×0.4 again); L10: 22 wording vs 6.5 AC 4 | M1, M2, L7 (dev only) | re-review **pending** | review: `clearGrenades` removed, light-list leak, Brute cap off, `half = 0` |
| 6.8 *(in flight)* | builder only | — | — | — | — | — | — | — | builder: "over-cap ignored" and "cap ignores the boss" survived first, then killed |

**Totals on master (5 stories, first reviews):** 2 high, 8 medium, 28 low, 2 nits [V]. Re-reviews on master added **1 medium** (6.5 M-new-1) and about 18 lows [V]. With 6.11+6.12's first review: 2 high, 11 medium [V].

**Session 8 lesson 1 ("re-review fixes for real"):** every re-review on master found something [V]. In 6.5 and 6.6 the new issue came **from a fix** (6.5 L6 → M-new-1 → LOW-1; 6.6 L1 → R1). In 6.3 the H1 fix led to the "forced 100 lights a blackout" low.

## 3. Repeat offenders (patterns in more than one story)

| Pattern | Examples (file:line or commit) | Stories |
| --- | --- | --- |
| **Task marked done, test missing** | 6.2 M1: story T3 "server and Predictor give the same assisted aim" [x], no test (`apps/client/src/sim/NetSimHost.ts:815-821`). 6.2 M3: T6 "assert the alley closed, a breach used" [x], `tenWaveSim.test.ts` untouched. 6.2 M2: `boss/behemoth.fuzz.test.ts:21` comment "6.2 adds 4–5" not done. 6.11 L6: the D-B Predictor-in-vote netsim test the story asked for was missing. 6.11 L1: T4 layout checks missing. | 6.2, 6.11 |
| **Client wiring untested** (the pure model is tested, the hookup is not) | 6.2 L1 / R1: `apps/client/src/scenes/GameScene.ts:670-671` (deleting the fog line passes 940 tests). 6.6 L3: `boss.crashed` missing from NetSimHost's `ageS` list survived (M21); RunController +1 kill survived (M22). 6.11 M2: `onlineFlow.ts:75` tested only through `dawnModel` with a hand-set flag. 6.3 re-review: B3 ghost wiring, padded plan view. 6.5 L5: stale target buzz. | 6.2, 6.3, 6.5, 6.6, 6.11 |
| **Tests that cannot fail** (liveness or bounds that never bite) | 6.11 M3: `endlessSim.test.ts:131-141` logs p99, masks growable lists. 6.11 L3: `evacVote.test.ts:73` asserts no grenades when none was thrown. 6.11 L4: `tickCostEndless.test.ts:58` never reaches 7 Brutes. 6.1: god mode off survived the ten-wave sim. 6.2 R2: `tenWaveSim.test.ts:41-44` ring read. | 6.1, 6.2, 6.11 |
| **Perf not measured or accepted above budget** | 6.6 M1 (brief 12: no `?stress=150`; fixed in `docs/perf/epic-6-boss.md`). 6.11: FPS not run. 6.3 B2: −26 % headless vs ≤ 15 % target, accepted pending the Mi 11i. `docs/perf/epic-6-blackout.md:85-88`: the Mi 11i row is empty. | 6.3, 6.6, 6.11 (+ every Not verified list) |
| **Story or brief text vs the code** | ×0.4 solo after balance pass B2 (`1ad557d`, ×0.35): 6.1 L3, 6.12 L9. 6.5 F10 reworded (HP counted when it walks in, B2). 6.6 L4: AC 5 / DD4 rewritten (`f91058c`). 6.11 L10: brief 22 says "at most 110 alive" but 6.5 AC 4 lets the horde stay above 110 (probe: 125 at endless wave 15, 139 at wave 10). 6.11 L2: EXTRACT exemption not in the decision log (→ 6.11 B1). | 6.1, 6.5, 6.6, 6.11, 6.12 |
| **A fix creates the next finding** | 6.5 L6 → M-new-1 → LOW-1/LOW-2 (`2b2ad6f` → `0c36d31` → `1c92977`). 6.6 L1 → R1 (`packages/shared/src/boss/charge.ts:145`, `MAX_PLAYERS + order`). 6.3 H1 → forced 100 lights a blackout. | 6.3, 6.5, 6.6 |
| **Whole-run sims break when a mechanic lands at the run's end or changes the map** | 6.5 + 6.1: wave-10 boss stalled the sims (`e81a61e`). 6.2: pile P3 closed the boss's only 4 m way (decision 6.2 B2). 6.8: cross-street lanes capped at stage 3 after 6.2's rubble (`7826ef9`). | 6.2, 6.5, 6.8 |
| **Merge-only work** (needed only after merging a neighbour) | 6.5 merge fixes with 6.1 (`e81a61e`). 6.2 × 6.6: `behemoth.fuzz.test.ts` conflict resolved at `c0945e2`. 6.11 × 6.4: `decay.json › blackout` conflict. 6.8: map regenerated twice (`a002b8c`, `7826ef9`). | 6.2, 6.5, 6.8, 6.11 |
| **Edge input payload / message budget** (A4 family) | 6.11 M1: every vote tap sent in the shared 10/s bucket, last tap dropped; fix latches on the tap and paces sends (`13f7711`). | 6.11 |
| **Equivalent "enforced twice" mutants** (not a defect) | 6.5 and 6.6: removing the downed check in a resolver survives because `damagePlayerBy` refuses non-alive players too. | 6.5, 6.6 |

## 4. Epic 5 retro actions A1–A10 and brief lines 29–32

| # | Action | Status | Evidence |
| --- | --- | --- | --- |
| A1 / brief 29 | Builder hand-back via `send_message @parent`; archive sessions | **partly** | The messages are not in git **[R]**. The 6.8 record says "Gate result with load: the hand-back message" (story-6-8, Dev Agent Record): the gate result is in the message only, not in the story file, so the repo loses it [V]. Archiving is not checkable here [R]. |
| A2 / brief 32 | Every push to `master` passes typecheck + lint, docs included | **partly / not proven** | Close-outs record a main-session full gate for 6.6+6.7 and 6.2+6.4 [V]. Docs-only master commits (`09c41a0`, `e2e5e8f`, `b9c87e5`, `da82847`) carry no recorded gate. `npm run lint` on `da82847`: see §8. |
| A3 / brief 32 | Decisions newer than the story forwarded; no story text fixed after its build | **partly** | 6.1 L3 and 6.12 L9: story text still said ×0.4 after B2 (`1ad557d`, 16:25), which is newer than both story files [V]. 6.1's builder did read the balance pass (Debug Log) and used ×0.35 in code [V]. |
| A4 / brief 30 | Latch the payload with the edge; no latch medium | **partly** | One medium in the family: 6.11 M1 (vote flood, brief 17/30) [V]. 6.8 and 6.9+6.10 (lever, crate, survivor lead) are not reviewed yet. |
| A5 / brief 31 | One HUD layout test, new HUD added to it | **partly** | Created by 6.3 (`2c6c5ad`); boss bar added by 6.5; vote row by 6.11 [V]. Accepted exemptions: 15 as-built lines (6.3 B1) and the EXTRACT button (6.11 B1). **Not in the test:** the HP bar and the wave line (6.11 Not verified: "the HP bar covers the start of the top wave line" at 568×320); event banners; 6.8's edge arrows (drawn in world space, 6.8 Not verified) [V: `hudLayout.test.ts:41-54` lists menu, swap, consumable, boss_bar, tiles, ready, undo, place/rotate/cancel, chip, action buttons]. |
| A6 | Two reviewers (sim fairness + client/lag) for 6.5 and 6.6+6.7, in cloud sessions | **not kept** | 6.5: one fresh-agent review and both re-reviews "main session" (6-5 story, review headers) [V]. 6.6+6.7: one cloud reviewer (`review-6-6`) plus one narrow re-reviewer [V]. The second re-review A6 budgeted did happen for 6.5. |
| A7 | Mi 11i FPS check, recorded in `docs/perf/` before 6.3's review | **not done** | `docs/perf/epic-6-blackout.md:76-88` "Nobody has run these yet"; the Mi 11i row is empty [V]. |
| A8 | Balance answers B1–B12 merged before 6.1's earnings check | **kept** | `1ad557d` 16:25 + merge `8f81792` 16:31; 6.1's gate 17:17 on 8f81792 [V]. |
| A9 / brief 19 | Fixes made at the merge get a re-review | **kept** [I] | 6.5's merge fixes with 6.1 (`e81a61e`) were made before its review and reviewed (H1 came from that fallback) [V]. No main-session code fix at a merge is recorded in Epic 6 [V: close-outs list gates only]. |
| A10 / brief 32 | Review the merged tree; every review names its merged base | **kept** | 6.1 5f9c063 + 8f81792; 6.3 merged 9849071; 6.5 `3702a1a`; 6.6 `194d1d8` (+ eb3b991); 6.2 `e84ab07`; 6.11 `132c90d`; re-reviews `c51d307`, `c0646ec`, `1e1f037` [V]. |

## 5. Designer touch points

Times come from the commit that raised the question (record or proposal) and the commit that recorded the answer.

| Question | Raised | Answered | Wait | Blocked the story? | Would a better default have avoided it? [I] |
| --- | --- | --- | --- | --- | --- |
| 6.3 B1: brief 31 rules vs the Epic 5 HUD as built (15 breaks) | 6.3 record, `9fa5a1e` 17:55 | `20c5a9a` 17:57 | ~2 min | no | **Yes.** Brief 31 could have said "the Epic 5 HUD as built is the baseline; only new breaks fail". The designer picked exactly that. |
| 6.3 B2: blackout −26 % headless vs ≤ 15 % | same | `20c5a9a` 17:57 | ~2 min | no | Partly. A default of "headless over budget → accept pending the Mi 11i" matches what Epic 5 did twice (5.10, 5.12). |
| 6.3 B3: acid and gas in the dark (review L5) | proposal `a455c6f` 18:06 | `4f4cffd` 18:14 | 8 min | briefly (built at 18:16) | No: a new look, so it needs a pick under the look rule. |
| 6.5 B1–B3: walk-under, HP count, tight Downtown | 6.5 record `426254d` 18:39 | `9d52871` 19:47 | 68 min | no (re-reviews ran meanwhile; master 20:01) | B1 no (a sim-found conflict with AC 6). B2/B3 yes: wording and "accepted for now" notes the builder could log. |
| 6.2 B1–B3: rubble look, P3 moved, breach spots | 6.2 record `e84ab07` 21:38 | `09c41a0` 21:44 | 6 min | no | B2/B3 yes: position fixes inside the designer's own D3/D4 walls, which a "move within the picked area, log it" default covers. B1 no (look). |
| Session 9 speed-up rules | — | `e2e5e8f` 21:49 ("ok for all, now") | — | — | — |
| Random city course correction (touched the 6.11 pad) | `ae13a24` 21:21 | `b9c87e5` 21:24 | 3 min | no | — (not an Epic 6 story question) |
| 6.11 B1: EXTRACT in the move-stick half (review L2) | `aaf1099` 22:52 | `da82847` 23:00 | 9 min | no (fixes went on in parallel) | **Yes.** EX1 was already picked with that layout; the look pick could carry a layout-test exemption. |
| 6.8 B1: stampede horde 28.2 KB/s vs 24 KB/s | measured `3105c89` 22:47 | `da82847` 23:00 | ~13 min | no | Partly. Brief 11's budget has no clause for the brief-22 +30 over-cap allowance; a "bounded burst, owed to 8.10" default would cover it. |
| 6.6 L4: throw recovery vs brief 21(f) — the reviewer suggested asking the designer | `3db05c7` 21:28 | not asked; the builder changed behaviour and the story text (`96777a8`, `f91058c`) | — | no | — (decided inside the story; no designer line in `docs/epic-6-decisions.md`) |
| 6.11 L10: brief 22 "at most 110" vs 6.5 AC 4 | `aaf1099` 22:52 | **open** (flagged "for the main session only") | open | no | Yes: fix the brief's wording to 6.5 AC 4 ("no new spawns above 110"). |

Every answered question in the epic came back in ≤ 68 min, and most in ≤ 13 min. None stopped a builder [V from the times above].

## 6. Open follow-ups and repeated "Not verified" items

### 6a. Follow-ups left in close-outs and reviews

| Item | Source | What must happen | Who |
| --- | --- | --- | --- |
| 6.6 R2: N2's `trampleGen` half untested | 6-6 re-review; `packages/shared/src/boss/charge.ts:226` | Test that bumps a slot's generation mid-rush and expects a second trample. | a later boss story or a small test task |
| 6.6 R1: slot-less bit moves when a player leaves (2 hits) | 6-6 re-review; `charge.ts:145` | Accepted (room cap 4). Revisit only if `MAX_PLAYERS` or the spectator rules change. | — |
| 6.6 R3: `crossCheckBoss` uses `round(s·20)`, runtime uses `ticksFor` | `packages/shared/src/config/balance.ts:286-289` | Call `knockStepMmOf` in the cross-check (one source). | small task |
| 6.2 R1: GameScene fog hookups untested | 6-2 re-review; `GameScene.ts:670-671` | Wiring test or a `?startwave=9` browser smoke asserting `zombieView.fogHidden > 0`. The close-out names 6.9+6.10 or this retro. | 6.9+6.10 builder or retro |
| 6.2 R2: ten-wave ring read assumes < 6 picks per tick | `tenWaveSim.test.ts:41-44` | Count picks with a counter, or assert `spawnPerInterval < recentPicks`. | small task |
| 6.3 L3: aim assist beyond 14 m in the dark | 6.3 review (deferred to 6.4) | 6.4 D4 covers the **fog** (stage 5). Whether power-failure waves without fog (6.10) still lock a zombie the dark hides is not shown closed [I]. Check it in 6.9+6.10's review. | 6.9+6.10 reviewer |
| HUD 568×320: HP bar covers the start of the wave line | 6.11 Not verified ("pre-existing") | Add the HP bar and wave line to `hudLayout.test.ts`; fix the overlap or add a KNOWN_LIST line by decision. | next HUD story / Epic 10 polish |
| 6.11 L10: brief 22 wording | 6.11 review | Align brief 22 with 6.5 AC 4, or change the cap rule. | main session + designer |
| 6.11+6.12 re-review of M1, M2, L7 (behaviour changes) | 6.11 review fixes `13f7711` | Narrow re-review before master. | main session |
| 6.11 `endlessEventCandidates` returns `[]` | 6.11 Notes for the merge | Hook up at the 6.8 merge (6.12 D6 power failure included). | 6.8 / 6.9+6.10 merge |
| 6.8 B1: stampede horde 28.2 KB/s | decision 6.8 B1 | Story 8.10 (half-size horde stream) owes it; the test bounds it at ≤ 28.5 KB/s. | Story 8.10 |
| 6.3 B2 / 6.6 M1: FPS budgets | `docs/perf/epic-6-blackout.md`, `epic-6-boss.md:53` | Mi 11i rows (blackout, boss run). | designer (phone) |
| 6.5 B3: Downtown tight for a 4 m body | decision 6.5 B3 | "Accepted for now". Re-run the boss sims at stages 4–5 after any map change (6.2 merge note). | any map story |
| 6.6: bots never charge in the 10-wave sim | 6-6 Not verified | Charges are covered only by the fuzz and unit tests. | bot work (optional) |
| 6.1 balance watch items: 2p up to 3,200; turret kills ≈ ⅓ at 4p | 6-1 Completion Notes | Human playtest or the next balance pass. | designer |

### 6b. "Not verified" items that repeat across stories

| Item | Stories that list it | What a human or a later story must do |
| --- | --- | --- |
| Real phone FPS (Xiaomi Mi 11i) | 6.1 (no render change), 6.3, 6.5, 6.6, 6.2+6.4, 6.8, 6.11 | Fill the Mi 11i rows of `docs/perf/epic-6-blackout.md` after the next deploy: `?stress=150`, `&blackout=5/20`, `&fx=low`, plus a boss run (`epic-6-boss.md:53`). The 5.10/5.12 check (Epic 5 A7) is still open too. |
| Online two-tab run under `?lag=150&jitter=20` in a browser | 6.5, 6.6, 6.2+6.4, 6.11 (done by 6.1, 6.3, and 6.8 partly) | One browser session after Epic 6 lands: two tabs, real server, lag on, through a boss wave, a stage-4/5 build start, an event and a vote. |
| A hidden tab across the event in a real browser | 6.1 (wave-10 clear), 6.5 (telegraph), 6.6 (rush, death), 6.2+6.4 (collapse burst heuristic), 6.11 (vote) | Same session: `window.__game.loop.sleep()/wake()` across each. |
| Sounds by ear (placeholders) | 6.5, 6.6, 6.8 | Designer listen pass when real sounds exist. |
| Haptic buzz on a phone | 6.5 | Phone check. |
| Reconnect | 6.3 | Story 8.1 (pulled forward in the network pass). |
| Late Game-scene start mid-event in a browser | 6.8 | Same browser session. |

## 7. DRAFT candidate action items for the retro

**DRAFT: for discussion in `gds-retrospective`, not accepted.**

| # | DRAFT action | Owner | How to check it |
| --- | --- | --- | --- |
| D-1 | **No [x] without a named test.** A builder marks a task done only with the test's file:name in the Dev Agent Record. The reviewer opens each one (6.2 M1/M3, 6.11 L6). | builders, reviewers | No Epic 7 medium of the form "task marked done, test missing". |
| D-2 | **Wiring test per new client hookup.** Each `GameScene`/`NetSimHost` line that connects a tested view or model gets a test that deleting it breaks (6.2 R1, 6.6 M21/M22, 6.11 M2). Close 6.2 R1 first. | builders | Reviewer mutation "delete the hookup line" is killed in every story. |
| D-3 | **Phone FPS session.** The designer (or a friend) runs the Mi 11i rows once after Epic 6 is deployed: Epic 5 pools and molotovs, the blackout, and a boss run. | designer, main session (sheet) | Rows filled in `docs/perf/epic-6-blackout.md`. |
| D-4 | **One browser smoke after Epic 6.** Two tabs, lag 150/20, a hidden tab across a boss telegraph, a stage-4/5 build start, an event and the vote; it replaces the repeated "Not verified" lines. | main session | A dated report in `docs/playtests/` or `docs/perf/`. |
| D-5 | **HUD layout test covers every HUD element.** Add the HP bar, wave line, event banners and edge arrows; resolve the 568×320 HP-bar overlap. | next HUD story | `hudLayout.test.ts` lists them; the overlap is fixed or in KNOWN_LIST by decision. |
| D-6 | **Re-review every behaviour-changing fix with "exploit the fix".** Keep session-8 lesson 1 as a hard rule. In 6.5 and 6.6 the fix was the source of the next finding. | main session | Every re-review lists an exploit attempt per behaviour-changing fix. |
| D-7 | **Defaults that skip designer questions.** Brief lines for (a) "the as-built HUD is the baseline" (6.3 B1, 6.11 B1), (b) "headless over budget → accept pending the Mi 11i" (6.3 B2), (c) "move a spot inside the picked area and log it" (6.2 B2/B3), (d) burst bandwidth over budget → owed to 8.10 (6.8 B1). | main session (brief) | Fewer B-codes per story in Epic 7; each remaining one is a real look or rule choice. |
| D-8 | **Gate result in the story file, not only in the message.** The hand-back message may carry the gate, but the Dev Agent Record must too (6.8). | builders | Every story record has a "Gate" line with commit and load. |
| D-9 | **Brief text sweep at epic end.** Fix brief 22 vs 6.5 AC 4 (6.11 L10); check the story texts for the ×0.4 → ×0.35 class (6.1 L3, 6.12 L9). | main session | Alignment check or a grep before Epic 7 starts. |
| D-10 | **Behemoth review split (A6) or drop it.** A6 was not done. Decide whether boss-class stories get two reviewers, or record that one reviewer plus a narrow re-review is the rule. | main session + designer | A line in the Epic 7 brief either way. |
| D-11 | **Close the small follow-ups:** 6.6 R2 (trampleGen test), 6.6 R3 (one tick source), 6.2 R2 (ring counter). | one small story | Tests merged; mutations killed. |

## 8. Gate for this file

- Docs only (this file). After `npm ci`, `npm run lint` (`eslint .`) on this branch (master `da82847` + this file): **clean, no output**. So `da82847`, the newest master commit (docs-only), lints clean (A2 evidence for that one commit only).
