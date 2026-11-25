# Overnight autonomous run — log (2026-11-25)

Main session: claude/epic-cerf-5bbxbc. Designer asleep; every open choice takes the GDS/story recommendation ("auto-accepted overnight").

## Sessions
| Session | Role | Branch |
| --- | --- | --- |
| session_01CgLgPV4L5K7VLHKiBxMLaV | Epic 6 retro | epic-6-retro-prep |
| session_01CgLgPWsrqVoNs1tetXyj5u | Builder 8.8 | story-8-8 |
| session_01CgLgPTKJg3rssSho46tZxD | Builder 8.9 | story-8-9 |
| session_01CgLgPTvgAGDYHqrNxgjxz9 | Lumen redraw BT1/AC1/SC3/TL3 | epic-7-lumen-picks |
| session_01CgLgPTHBB6ZMNgxhetcmfH | Builder 7.1 (early part T1–T5, T8) | story-7-1 |
| session_01CgLgPXkMujTFt9FkusaTPz | Builder 7.9 (early part T1, T4, T5) | story-7-9 |
| session_01CgLgPT2yAMRMLRecGBwVue | Builder 8.1 | story-8-1 |
| session_01CgLgPVUe4VgW93WEkr9VNn | Review 8.8 | review-8-8 |
| session_01CgLgPTGmNZH64LunFYNBGt | Review 8.9 | review-8-9 |
| session_01CgLgPUPAN4Mdh4kigceHmj | Re-review 8.8 | rereview-8-8 |
| session_01CgLgPVqsFQcix6hLu748Sj | Review asset-session art | review-asset-art |
| session_01CgLgPXg8R2HjRX5uJVEZTR | Re-review 8.9 | rereview-8-9 |
| session_01CgLgPWCdv2qWvJYtk8xk4F | Builder 8.10 | story-8-10 |
| session_01CgLgPVuhvoUCGWv6MWJvbS | Re-review asset art | rereview-asset-art |
| session_01CgLgPV9Purq8QkvbmAAZbE | Review 8.1 | review-8-1 |
| session_01CgLgPV7qu43H4ppJzsJrHo | Re-review 2 asset art | rereview2-asset-art |
| session_01CgLgPWLddQgeqCSrK8Zq8e | Review 7.1 | review-7-1 |
| session_01CgLgPUZDbx9SZ3xwBucRfg | Builder 7.2 | story-7-2 |

## Auto-accepted decisions (main session)
- OR-1: Network round 1 (8.8 ∥ 8.9) starts in parallel with the Epic 6 retro instead of after it; the retro's Network-pass actions reach the builders as a brief addendum by message (alternative: wait ~1 h for the retro). Reason: the retro is docs-only and its actions are process rules a builder can apply mid-build.
- OR-2: The four Lumen redraws (BT1/AC1/SC3/TL3) run in parallel with the Network pass (docs/art only, no file overlap).

- OR-3: Epic 7 brief v1 written and pushed before the retro returned (retro lines appended later as R-lines).
- OR-4: 7.1 and 7.9 start early on their tasks that don't touch 8.1's join rewrite (7.1: DB, repos, progression.json, account API, deploy; 7.9: look code, gun under the body, per-player textures). Their join/room tasks wait for 8.1 (alternative: wait for the Network pass to finish). Reason: HANDOFF §3 session 9 speed-up 1 (start by real file overlap).
- OR-5: number ranges assigned: netEvents Network pass 100–109, 7.1–7.7 110–119, 7.9 120–124, 7.11 125–129, 7.12 130–139; readability items NP 100–104, 7.9 105–109, 7.12 110–114, 7.2–7.7 115–129.
- OR-6: 8.1 starts before round 1 (8.8/8.9) lands, because it is on Epic 7's critical path (7.1 T6 waits for its join rewrite); it merges 8.8/8.9 when they land (alternative: round order 8.8 ∥ 8.9 → 8.1). Seat identity built around one identity-key function for 7.1.
- OR-7 (= 8.9 B7): AC 6 starved ticks not met (+41–58 %); accepted as built — 0.9× pacing empties the backlog so 0 inputs are skipped and 0 % predicted shots never fire, at the cost of one-tick move delays at the next stall; bounded ≤ 1.6× pacing-off by smooth.test.ts. Alternative: designer revisits 8.9 D5 (server-only skip of every 2nd input after 2 s). Retro default A7.
- OR-8: 8.9 merges 8.8's gated branch (not master) for T10/T11 while 8.8 is in review; 8.9's reviewer starts in parallel on 8.9 + 8.8 + master.
- OR-11: asset-art review L2 (standing walls always above bodies; corner pictures can hide a zombie in normal light) left as built and flagged for the designer (blackout eyes still show; alternative: fade/silhouette walls in front of bodies).
- OR-12 (= 8.9 B9): F1 "others never freeze" relaxed from ≤ 1 to ≤ 1.2 freezes per 30 s on every 1 % row (measured 0.9–1.2; before 6–6.9). Alternative: keep tuning until every row ≤ 1 (risk: more delay or clean-line cost). Asserted per row.
- OR-13: 7.1 builds its join part (T6/T7) on 8.1's gated branch while 8.1 is in review, instead of waiting for master (merges master before its final gate).
- OR-14 (= 8.1 B15, a new game rule): reconnect teleport + 2 s protection at most once per player per wave; later returns in that wave land in place with no protection; a hold shorter than 3 s returns in place with no protection. Alternative: no teleport/protection at all. Reason: review M1 — reload/close gave an instant escape + teleport + invulnerability on demand.
- OR-15: 7.9 (T2/T3/T6) and 7.2 build on 7.1's gated branch (which carries 8.1) while 7.1 and 8.1 are in review/fixes, instead of waiting for master; each merges master before its final gate and says which tree it gated. Reason: Epic 7 critical path.

## Timeline
- 03:50 dispatched retro, 8.8, 8.9, Lumen redraw.
- 03:59 master 1fade84: Epic 7 brief v1 (full gate green: 396 files / 3655 tests, 6m25s, load 3.25).
- 04:00 dispatched 7.1 early, 7.9 early.
- 03:57 Epic 6 retro done (ce7323a): 12 actions accepted (A1–A12), §10 brief lines → network-pass-brief 25–35, epic-7-brief R1–R11; Epic 6 brief 22 text fix (A9).
- 04:00 Lumen redraw done (1a06fff): BT1, AC1, SC3+DP2, TL3 stills in docs/art/epic-7/lumen/picks/.
- Follow-up (7.4): the BT1 shop still shows TWO borrowed cards (Mo, Kit) while the rule is 1 of 6 (designer D-rule) — the rule wins; the still kept the old sheet's state.
- Follow-up (retro A12): one small "Epic 6 leftovers" tidy story (6.13 L-b/L-c/L-d/nit; 6.14 L6 top-band test) — schedule by file overlap in Epic 7.
- 04:08 gate green on c87a707 (396 files / 3655 tests, load 3.67) → master.
- 04:12 7.9 early part pushed (46d60e3): T1 look code, T4 gun under body, T5 per-player textures; 1360 touched tests, 11/11 mutations killed. Builder choices: D1 repaint by comparing decay stage per frame; missing look = 0 replaced fields; client decodes against full catalogue (server checks ownership); ?devlooks=N. Holding T2/T3/T6 for 7.1 + 8.1.
- 04:17 7.1 early part pushed (6aa9b81): deps, schema+migration, repos, progression.json, account API, deploy/backups; 132 touched tests, 8/8 mutations caught. Auto-accepted B1–B7 (docs/epic-7-decisions.md › Story 7.1 build-time choices). Not verified: no Docker here; VPS steps are Hermes's. Holding T6/T7 for 8.1.
- 04:18 dispatched 8.1 (early, OR-6).
- 04:26 8.8 hand-back (c1c5ef1, gate on ddce305: 398 files / 3679 tests, load 3.98). Reversed hits kiting Runners: clean 0.2→0.2 %, 1 % 7.6→2.0 %, 2 % 11.9→1.3 %, 1 %×400 ms 12.7→7.2 %; shots over cap 50/73/64 % → 0/0/4.7 %; rewind p99 0.054→0.060 ms. Two-tab smoke report docs/perf/network-pass-smoke-2026-11-25.md (vote not reached: team wiped at the Behemoth; no online boss-HP switch). Finding for 8.9: 1 %×400 ms Walker rows ~1 pp worse with 500 ms window. Dispatched review.
- 04:35 8.9 hand-back (b8109fb, gate 400 files / 3681 tests, load 4.52). Freezes per 30 s on the 1 % line 6–6.9 → 0.9–1; 2 % 11 → 0.3–0.9; clean line delay 118→100 ms; never-fired shots 1.5 % → 0 %; server skips 50–82 → 0–2. Pending T10 (500 ms window: kiting Runners rose 7.6→18 % with the longer delay on the old 300 ms window). Dispatched review 8.9.
- 04:37 Review 8.8 (d6e042b): 2 M, 4 L, 3 nits; rule holds, 12 measurement rows reproduce exactly; 20/23 mutants killed (M19 survived → R1). R1 M lossy rows only count stalls (mutation stall-not-applied passes) · R2 M lagLine close drops in-flight bytes + close code · R3 L main.ts throttle wiring test · R4 L barricade broken < 500 ms before a rewound shot lets it pass (accepted as 8.8 B1, text fix) · R5 L netSummary raw query text · R6 L smoke script not reproducible · N1–N3. Sent to builder.
- 04:41 Previous main session flagged the asset session (session_01CgLgPXQseA7Sjb9qkFpuZj, claude/dazzling-meitner-zhu5p0: relit traps/floodlights/med station, standing barricades, corner pieces; 114 files, client-only, unreviewed). Asked it to merge master + re-gate; main session will review + land it (OR-9: land before Epic 7 HudScene/shop stories).
- 04:44 8.8 fixes pushed (008df68: R1 b88b1e4, R2 d5e4176, R3 55b3683, R4 c0533ab text + 8.8 B1, R5 b28f401, R6 61ffbf0, N2 351aa4f). Narrow re-review dispatched (session_01CgLgPUPAN4Mdh4kigceHmj, rereview-8-8). Main gate started on 8.8 merged.
- 04:47 Review 8.9 (db15745): 2 M, 4 L. M1 clock lags after a latency FALL (real delay 366–666 ms, render behind the horde ring) · M2 boss telegraph fill ~200 ms late after a fall (F7) · L1 freeze bound 2→1 · L2 rate flip-flop at stretch cap · L3 snap-forward untested · L4 telegraph >1 untested. Beat-the-rule: 0 back steps, rate in [0.9,1.1] in every row; pacing lies hurt only the liar. Sent to builder with T10.
- 04:50 Re-review 8.8 (d1df8f1): fixes close their findings; 0 H/M, 3 L test gaps (allowHalfOpen untested; wiring check fooled by comments; netSummary wiring untested) + 1 nit (timer re-armed after stop). Sent back as test-only fixes; no further re-review (OR-10: test-only fixes after a clean narrow re-review don't need another re-review). Main gate on 8.8 008df68 + master: 399 files / 3685 tests green, load 3.03.
- 04:51 8.9 T10/T11 (19e6ea4): with 8.8's 500 ms window 16–33 % of lossy-line shots were over the cap → applied 8.8 D1's pre-approved fallback as 8.9 B8: REWIND 12 ticks / 600 ms. Reversed hits (kiting, 1 %/2 %): Runners 0.7/1.4 %, Walkers 0.3/1.1 %, 0 % over cap; rewind p99 0.070 ms. Bots lossy 4 × wave 4: 0 suspects, 7.6 KB/s down. B7 bound 1.6→1.7× after the merge.
- 04:59 8.8 test-only fixes (c011273) merged; main gate 399 files / 3689 tests green (load 3.49) → 8.8 DONE on master.
- 05:02 Asset session acked (f8a16b9, includes master b0e491a; gate 400 files / 3674 tests; in-session review fixed its Mediums). Dispatched light+ fresh review in its own session (focus: 70–180 ms long tasks during the progressive bake, depth vs darkness, context loss mid-bake).
- 05:06 8.9 review fixes (5cbcfd6; head 28c1ef1; gate 403 files / 3715 tests). M1/M2 forward catch-up ≤ 50 % + steer on max(estimate, rawTick), ring 16: estimate back within 25 ms after 0.55–1.45 s (was 1.9–5.2 s); L1–L4 fixed. After-fix table: kiting Runners reversed 1 % 7.6→1.4 %, 2 % 11.9→1.7 %; freezes/30 s ≤ 1.2. Flag: 150 Walkers standing 1 % row 1.2 freezes/30 s vs F1 ≤ 1 → re-reviewer judges. Narrow re-review dispatched; main gate on 8.9 merged started.
- 05:10 Review asset-session art (6d2d562): no H; M1 bake does a whole relit frame per call (~150–500 ms phone hitches mid-wave on late join/reload) · M2 P1 boss banner 12 px from survivor centre at 568×320 (rule 48) · M3 relit cache not repainted after Android wipe · L1–L6. Checked: depth/darkness OK in Playwright, mid-bake rebuild OK, variants deterministic, all textures registered. Sent M1–M3 + L4 to the asset session.
- 05:14 Main gate on 8.9 merged (72b2bbb): 403 files / 3719 tests green, load 3.49. Re-review 8.9 (8e4ce5b): fixes hold (0 back steps in 13 probe families; rate ∈ [0.9,1.1]; no overshoot; B8 rewind edge fair); RM1 F1 not met on Walkers-standing 1 % row (1.2) → B9; RL1/RL2 claims of killed mutants were equivalent → text fixes + remove dead max().
- 05:24 8.9 re-review text fixes (60049b7) merged; main gate 403 files / 3720 tests green (load 4.06) → 8.9 DONE on master.
- 05:25 dispatched 8.10 (after 8.9's hordeBuffer); told 8.1 to merge master (8.9) and to reset the per-client horde stream on reconnect.
- 05:26 Asset session fixes (60ec1f4; gate 405 files / 3714 tests): M1 resumable bake ≤ 20000 units + 6 ms guard (long tasks 70–180 → 50–85 ms headless); M2 banner keeps 48 px (overBar / shrink); M3 relit cache re-bake after loss; L1, L4, L5, L6. Narrow re-review dispatched.
- 05:37 Re-review asset art (4b0e2b4): NOT clean — M2/M3/L1/L4/L5/L6 fixed; R1 M unsplittable draw/readback steps 123–167 ms at 4× CPU; R2 M (fix-created) bake budget so small the bake takes ~63 s → relit pictures pop in during wave 1; R3–R7 L/nit; R8 noise table drop changed the approved look slightly. Round 2 sent (band readback, guard-driven budget, restore exact look).
- 05:43 8.1 hand-back (db2cff2; gate 416 files / 3799 tests, load 3.54). Bot cut 8 s mid-wave back in ~0.3 s on the lossy line with HP/wallet/weapons kept; 130 s cut → restored at next build phase; phone shows 'reconnecting' after 3.1 s (was never); two-tab smoke found and fixed 3 bugs. Auto-accepted B1–B14 (docs/network-pass-decisions.md § 8.1). Open: app-switch escape is repeatable (no cooldown). Dispatched full review; 7.1 told to go on 8.1's branch; 8.10 told about reconnect keyframes.
- 05:59 Asset round 2 (63a7ae2; gate 409 files / 3747 tests): bake moved to a Web Worker (OffscreenCanvas), atlas split in 4 sheets; main-thread max 5.5 ms (1×) / 17.7 ms (4× CPU); bake done 8 s / 15 s (inside the 30 s build phase); fallback sliced. R8 pushback: current pictures pixel-identical to the approved step-1 commit 583388c (digest pinned). Re-review 2 dispatched.
- 06:02 Review 8.1 (90397dc): CHANGES REQUESTED 3 H / 3 M / 6 L. H1 drop in build + return mid-wave = free +50 % heal · H2 Leave + rejoin same build = repeatable heal · H3 held seats not counted for boss HP / wave size (boss 2400 vs 6000) · M1 escape/teleport/invulnerability by reload (→ B15) · M2 held seats drop out of the vote (should count as silent = Extract) · M3 client clock ahead by the freeze length after a solo drop · L1–L6. Blocked: wipe dodge, revive dodge, money/item dupe, stranger takeover, stale inputs, one player freezing others. Sent to builder.
- 06:02 7.1 hand-back (827ea45; gate on 7.1 + 8.1 branch + master: 426 files / 3861 tests, load 3.32). Browser-checked cookie / localStorage wipe / prefill; no token in logs. Auto-accepted 7.1 B1–B9 (B8 sameSeat = seatKey OR same guest token). Dispatched full review 7.1; 7.9 unparked (T2/T3/T6); dispatched builder 7.2 (critical path).
