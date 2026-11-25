# Story 6.14: Epic 6 tidy-up (review follow-ups)

Status: review

## Story

As the team,
I want the small follow-ups the Epic 6 reviews left open closed, each with a test that bites,
so that Epic 6 ends without known gaps.

Sources: the "Main session close-out" and last re-review sections of stories 6.6, 6.2, 6.11, 6.8 and 6.9; the main session's task list (items 7, 8). Every change is small; nothing is refactored. **[B]** = changes behaviour.

## Acceptance Criteria

1. **6.6 R2 / R3.** A test bumps a zombie slot's generation mid-rush and expects a second trample in the same charge (the `trampleGen` half of the once-per-zombie mark). `crossCheckBoss` counts a knock's ticks with `ticksFor` (as runtime / `knockStepMmOf` do), not `round(s × 20)`.
2. **6.2 R2.** The ten-wave sim's buried-mouth / breach check counts each tick's picks (the wave's `typeSpawned` total) and reads only that many newest ring entries; a tick with as many picks as the ring holds fails the test instead of reading nothing.
3. **6.11 RR3-L2 [B], N5, N6.** `VOTE_URGENT_GAP_MS` 250 → 100 ms; `VOTE_URGENT_DEBT` stays the rate bound. Frantic tapping over the last 1.5 s (1 s all-voted hold) loses ≤ ~2 % final choices (asserted ≤ 3 %) with 0 server drops, pongs included. A test proves `VOTE_URGENT_DEBT` bounds the borrowing (99 fails it). A source check proves GameScene sends through `pollVote` (bypassing it fails).
4. **6.11 RR3-L1 [B].** No late dawn when the vote → Results backlog lands > 1 s after an unlock: the dawn needs `now − voteSeenAtMs ≥ (resultsTick − voteTick) × 50 − 500 ms`. Test: locked from the build phase for 60 s, backlog 1.5 s after unlocking → straight to the card; a live 1 s hold seen 0.6 s apart still plays the dawn.
5. **6.8 follow-ups.** A resize / rotation mid-hold (844 × 390 → 800 × 360 and → 390 × 844, k 1 and 3, every 0.5°) leaves no edge arrow off screen or on a control (removing `legalAt(prev…)` from the hold fails it). The `reportHudTextWidths` doc says what is true (create only, and why that is enough).
6. **6.9 RR2-1 [B], RR4.** The survivor's flag arrow is never more than 30° off its bearing and never overlaps the NPC arrow: a beside spot over 30° is not taken; the flag then takes the nearest ray of its own ±30° fan (6.8's placement) whose spot keeps every rule and clears the NPC arrow (held while it still works). A stateful 0.01° sweep (NPC every 6°, flag ±40° both ways) checks it. A test puts a zombie (not only the Behemoth) behind the armed tank: the blast kills it (weapon `gas_leak`), never the bullet.
7. **Top-band HUD layout [B].** At 568 × 320 the HP bar no longer overlaps the wave line. The one HUD layout test (brief 31) checks the HP bar, the HP row at its widest, the money line, the wave line, the boss bar, ☰ and the centre banner (1–3 lines, with and without the boss bar) against each other and the safe area at 568 × 320, 640 × 360, 800 × 360 and 844 × 390.
8. **Dead CSS.** `.shop-card__glyph*` removed from `apps/client/src/ui/overlay.css`.

## Dev Agent Record

### Agent Model Used

Claude (builder, own cloud session), 2026-11-25.

### Completion Notes List

1. **AC 1.** `charge.test.ts` "story 6.14 (6.6 R2)": the trampled Brute's slot gets generation + 1 and full HP mid-rush, still under the body → trampled again (30), still the same charge. `balance.ts › crossCheckBoss` step = `round(m × 1000 / ticksFor(s))`; `balance.test.ts` adds a Brute knock of 1.875 m over 0.175 s (3 runtime ticks = 625 mm/tick, the charge's step; `round(0.175 × 20)` = 4 would miss it). `knockbackS` is not whole-ticks-refined in the schema, so the case is reachable by a balance edit.
2. **AC 2.** `tenWaveSim.test.ts` (a): `picks` = this tick's growth of Σ `waves.typeSpawned` (restarts each wave); asserts `picks < ring cap`, reads the `picks` newest entries back from `recentSpawnHead`, and asserts > 100 picks were read from wave 7. A pick whose spawn then fails (pool full) is remembered but not counted: at worst one older pick goes unread that tick.
3. **AC 3 [B].** `voteModel.ts`: gap 100 ms, doc updated (the debt is the rate bound, the gap only spaces two borrows). `voteModel.test.ts`: the N5 test (second borrow past the gap still refused while the bucket is below 0, then sent once a token is back) and the frantic-tap model (2000 seeded runs, taps every 50–450 ms from T − 1.5 s, urgent from T − 1 s, the server's `TokenBucket(10, 10)` and 1 pong/s modelled). Measured lost final choices in this model: gap 0 → 2.35 % (the debt's floor), **100 → 2.5 %**, 150 → 3.3 %, old 250 → 5.8 %; 0 server drops. The reviewer's model got 2.15 % at gap 0, so ours is a bit harsher; the assert is ≤ 3 %. `tools/checks/votePollWiring.test.ts` (N6). `tools/netsim/vote.test.ts`: the hold test's sleep now follows `VOTE_URGENT_GAP_MS` (+ 20 ms), so it lands ~200 ms before the 333 ms refill instead of ~60 ms (the re-review's host-stall worry).
4. **AC 4 [B].** `onlineFlow.ts`: `voteSeenAtMs` / `voteTick` recorded when the vote phase is first seen; `live` also needs `now − voteSeenAtMs ≥ (st.tick − voteTick) × 50 − VOTE_SEEN_SLACK_MS` (500). Two tests in `onlineFlow.test.ts`; the earlier RR2/M2/RL1/RL2 tests stay green.
5. **AC 5.** `hudLayout.test.ts` "a resize mid-hold at k 1 / k 3": place twice at 844 × 390 (held), then once at the new size with the same state; every drawn arrow inside the safe area, off every control, ≥ 48 px from the survivor (1,440 placements per k). `hudTopLayout.ts`: `reportHudTextWidths` doc = create only (system-ui, CSS px; a DPR change moves widths < 1 px).
6. **AC 6 [B].** `eventArrowPair.ts`: beside spot only if ≤ 30°; else `tryFan` over ±0.5° … ±30° rays (nearest first), each placed by `placeEventArrow` (fresh state) and accepted when the flag drawn there (tip along its true bearing) keeps every rule, is ≤ 30° off and clears the NPC arrow; `PairHold` gets `side 9` + `fanRad` for the hold. No allocation (module scratch). The sweep test logs max flag bearing error 30.00° at 568 × 320 (was 32.22°). `gasLeak.test.ts`: a walker 1.2 m past the tank on the bullet's line, pierce 5, 1000 damage → killed once, by `GAS_LEAK_WEAPON` (the blast is credited to the shooter, G2, so the weapon tells blast from bullet).
7. **AC 7 [B].** `hudTopLayout.ts`: `layoutHpBar`, `layoutHpRow`; `layoutWaveLine` starts 6 px right of the HP bar where centring would touch it and ends 6 px before ☰ at most; `placeWaveText` keeps the text centred when it fits and scales it down only if it is wider than that span (only long endless lines at 568 wide: ≈ 0.7 for the widest string, insets 44); `bannerWrapWidth` (inside the safe area, 8 px in; was 92 % of the width, past the side insets) and `layoutBanner` (32 % of the height, pushed below any top-band block it crosses: HP block, money line, wave line, and the boss bar while it shows). `bossBar.ts`: the bar sits below the HP block (6 px) where they share columns: **y 46 → 60 on every phone size** (the HP row's reserve, with five gear icons, reached under the name). HudScene: wave text placed / scaled by `placeWaveText`; the banner wraps at `bannerWrapWidth` and is placed by `layoutBanner` (re-placed when the boss bar shows or hides); scratch objects, no per-frame allocation. Browser check (Chromium, 568 × 320, `?solo=1&bosswave=1`, headless insets 0): wave line right of the HP bar, boss bar under the HP row / money, "Wave 1" banner unchanged.
8. **AC 8.** Removed (no other reference in the client or tools).

### Gate

One full gate on story-6-14-tidy (origin/master 62dd2ef already contained; fix-bloater-stall not on master yet): typecheck, lint, 394 files / 3,630 tests passed (3 skipped), build OK; load 0.60 → 2.83 (4 cores).

### Mutations (each applied alone, its tests run, reverted)

| AC | Mutation | Result |
|---|---|---|
| 1 | trample mark without the generation check | killed (charge.test "6.6 R2") |
| 1 | cross-check back to `round(s × 20)` | killed (balance.test) |
| 2 | `recentPicks` 6 → 2 (2 picks in one tick = ring size) | killed ("more picks in one tick than the ring holds") |
| 3 | `VOTE_URGENT_GAP_MS` 250 (old) | killed (N5 test + frantic test 5.8 %) |
| 3 | `VOTE_URGENT_GAP_MS` 150 | killed (frantic test 3.3 %) |
| 3 | `VOTE_URGENT_DEBT` 99 | killed (N5 test + RR2-L2 flood test) |
| 3 | `VOTE_URGENT_DEBT` 0 | killed (netsim vote hold test) |
| 3 | GameScene `voteSend.poll(…, false)` instead of `pollVote` | killed (votePollWiring) |
| 4 | `sawVoteRun` dropped from `live` | killed (onlineFlow "60 s lock") |
| 5 | hold without `legalAt(prev…)` | killed (resize test, k 1 and k 3) |
| 6 | beside spot without the 30° cap | killed (sweep test: 32.22°) |
| 6 | RR4 tank blocker off (`firing.ts`) | killed (new zombie test + the Behemoth test) |
| 7 | wave line centred again | killed (3 sizes) |
| 7 | boss bar not moved below the HP block | killed (4 sizes) |
| 7 | banner not pushed down | killed (4 sizes) |
| 7 | banner wrap back to 92 % of the width | killed (4 sizes) |
| 7 | banner ignores the boss bar | killed (4 sizes) |

### Not verified

- Real phones (Mi 11i) and real safe-area insets: the browser check ran headless with insets 0. The boss bar's new height (y 60) and a shrunk endless wave line at 568 / 640 are designer-visible; not shown to the designer.
- The frantic-tap numbers are from a model (60 fps frames, no network delay), like the re-reviewer's probe; not measured on a real socket.
- The 60 s-lock dawn case is a unit test of the phase handler, not a real locked phone.

### Notes for the merge

- `apps/client/src/scenes/hudTopLayout.ts`, `bossBar.ts`, `HudScene.ts` (drawWave): any story that moves the top band must keep the brief-31 "Story 6.14" top-band test green.
- `apps/client/src/render/eventArrowPair.ts`: `PairHold` has a new field `fanRad` (create it with `createPairHold`).
- `packages/shared/src/config/balance.ts`: `crossCheckBoss` imports `ticksFor` (`core/time`).
- No shared sim, schema, wire or balance JSON change.

### File List

- `_bmad-output/implementation-artifacts/6-14-epic-6-tidy-up.md` (new)
- `packages/shared/src/boss/charge.test.ts`
- `packages/shared/src/config/balance.ts`, `balance.test.ts`
- `packages/shared/src/economy/tenWaveSim.test.ts`
- `packages/shared/src/events/gasLeak.test.ts`
- `apps/client/src/ui/voteModel.ts`, `voteModel.test.ts`
- `apps/client/src/net/onlineFlow.ts`, `onlineFlow.test.ts`
- `apps/client/src/render/eventArrowPair.ts`
- `apps/client/src/scenes/hudLayout.test.ts`, `hudTopLayout.ts`, `hudTopLayout.test.ts`, `bossBar.ts`, `HudScene.ts`
- `apps/client/src/ui/overlay.css`
- `tools/checks/votePollWiring.test.ts` (new)
- `tools/netsim/vote.test.ts`

## Senior Developer Review (AI)

Reviewer: fresh-agent light review (one checker, time-boxed), 2026-11-25. Commit reviewed: `34dde4b` (diff `62dd2ef...34dde4b`).
**Outcome: Approve. No high findings; 1 medium (a test that doesn't catch a mutation), 5 low.**

### Run

`npm run typecheck` passed. Tests: `voteModel`, `onlineFlow`, `hudLayout`, `hudTopLayout`, `votePollWiring`, `tools/netsim/vote`, `gasLeak`: 7 files, 96 tests passed. I did not run the full gate. I also ran throwaway probes (deleted afterwards): the top-band layout at 7 sizes × insets 0/44/59, and a pair-arrow flicker/oscillation probe run at both 34dde4b and 62dd2ef.

### Findings

**Medium**

- **M1. The fan's NPC-clear rule is never tested.** `apps/client/src/render/eventArrowPair.ts:157` (`tryFan`: `if (overlapGrown(…, rn, gap)) return false;`). If I delete that line, all 38 `hudLayout.test.ts` tests still pass. The stateful 0.01° sweep reaches the fan in only 7 of its 960,120 frames at 568 × 320, and in none at 640 × 360 or 844 × 390. Those 7 frames happen to land on rays that don't overlap anyway. The "never overlaps the NPC arrow" clause of AC 6 holds in practice, but no test enforces it. *Fix:* add a direct case that forces the fan (beside spots blocked or > 30° off, e.g. NPC arrow tucked by a corner control), where the nearest fan ray would overlap the NPC arrow, and assert that ray is skipped.

**Low**

- **L1. The wave text can shrink below 11 px, and the test allows it.** `hudTopLayout.ts:152` (`placeWaveText`) and `hudLayout.test.ts` (`expect(at.scale).toBeGreaterThan(0.6)`). At 568 × 320 with 44 px insets, the widest endless line is drawn at scale 0.70, about 11.2 px, just over the 11 px floor. The test would accept 0.6 (9.6 px). With 59 px insets, which is not realistic at 568 wide, it reaches 9.5 px. *Fix:* assert `scale ≥ 11 / WAVE_TEXT_PX`.
- **L2. The wave line is now well off centre on small screens.** Designer-visible. "Wave 10 · Zombies 400" is centred at x 363 instead of 284 at 568 × 320 with insets 44 (+79 px). It is +51 at 640 × 360 and +37 at 667 × 375, and +43 at 568 × 320 with insets 0. Already listed under "Not verified"; show it to the designer together with the boss bar's new y of 60.
- **L3. The boss bar is still not a keep-off for the event arrow (not new in 6.14).** `render/eventArrow.ts:56-58` (`waveControlRects`). A single event arrow overlaps the boss-bar rect on 258 of 720 bearings at 568 × 320 (249 at 62dd2ef), 221 at 640 × 360 and 206 at 844 × 390 (unchanged). Arrows on the top edge sit just below the HP block and wave line, which is where the bar now is (y 60–85). This matters only if an event or rusher arrow can show during a boss wave. *Fix (if it can):* add the boss-bar rect to the keep-offs while it is visible.
- **L4. The fan-ray hold has no test.** `eventArrowPair.ts:105` (`if (hold.side === FAN && tryFan(…)) return true;`). Deleting the line passes every test. My probe found no new flicker: jumps > 12 px in the 0.01° sweep (196 / 195 / 173) and ±0.01° oscillating points (14 / 46 / 139) at 568 / 640 / 844 are identical before and after the change. But the hold itself is unguarded. *Fix:* add a ±0.01° jitter case in a spot where the fan is in use.
- **L5. Dawn rule: a live player can miss the dawn if the vote patch is processed late.** `net/onlineFlow.ts:122`. The rule compares the time between the vote and Results patches with their tick gap. So it fails a live player when the vote patch is processed more than 500 ms later (relative to the Results patch) than it should be: a main-thread stall or patch stall right as the vote starts, followed by an early all-voted end (1 s hold). A stall *during* the vote only widens the gap, so it is harmless. I could not build a case with a late dawn on a frozen tab: a backlog is processed in a burst, so `sawVoteRun` is false, and `ageMs` and `justShown` still guard a freeze that happens after the vote was seen. Cosmetic only (the card still shows). *Fix (optional):* note it, or use the larger of the measured gap and the patch inter-arrival.
- **L6. Merge risk with `claude/dazzling-meitner-zhu5p0`.** That branch is not reviewed here.
  - Its base is `58ab0b7`, older than master, and its diff against `62dd2ef` removes the top-layout code and tests, so it must be rebased onto master.
  - `HudScene.ts` will conflict textually.
  - In its `BossHud.ts` it places an element at `l.y + l.h + BANNER_GAP_CSS_PX × k` under the bar. With 6.14 that element moves 14 px down, and 6.14's `layoutBanner` doesn't know about it, so the centre banner may overlap it while the boss is visible. Re-run the brief-31 top-band test after the merge.

### Checked, no finding

- **Item 3 (vote).** The urgent gap is 100 ms and `VOTE_URGENT_DEBT` stays the rate bound: at most 3 + 3 + 1 sends in the first second, then 3/s, plus about 1 pong/s, inside the server's 10/s. The frantic model asserts 0 drops (pongs included), and the RM1 / RR2-L2 tests stay green. This is a model, not a socket (as the story says).
- **Item 7 (layout).** I checked 568 × 320, 640 × 360, 800 × 360, 844 × 390, 667 × 375, 740 × 360 and 915 × 412, with insets 0/44/59. Nothing overlaps; the boss bar is at y 60–85 (upper third); the 3-line banner with the boss bar is at y 91–224, inside the safe area. The banner, the wave text and its keep-off rect for the 6.8 arrow placement are re-placed on resize (`HudScene.ts:1725`). The keep-offs use the same shifted wave-line rect as the drawn text.
- **Item 6.** The 30° cap and fan fallback keep the bearing error ≤ 30°, and the jump/oscillation counts match master (see L4).

### Mutations (each applied alone, the named tests run, reverted)

| Mutation | Result |
|---|---|
| `VOTE_URGENT_DEBT` 1 → 2 | killed (N5 test) |
| urgent borrow without the debt check | killed (N5 test + RR2-L2 flood test) |
| `VOTE_SEEN_SLACK_MS` 500 → 0 | killed ("live 1 s hold seen 0.6 s apart") |
| `voteTick` always 0 | killed (4 onlineFlow tests) |
| GameScene `pollVote(…, 0, TICK_RATE_HZ, …)` instead of `run.voteTicksLeft` | killed (votePollWiring) |
| `tryFan` without the NPC-overlap check | **survived** (M1) |
| fan-ray hold line removed | **survived** (L4) |
| `placeWaveText` never scales | killed (Story 6.14 top-band test, 568 × 320) |

Not re-mutated (the dev's table covers them): AC 1, 2, 5, the gas-leak test, and the banner / boss-bar mutations of AC 7.

## Change Log

- 2026-11-25: story written and built (items 1–8); status review.
- 2026-11-25: Senior Developer Review (AI): approve; 1 medium, 6 low (test bite gaps, minor layout notes).
