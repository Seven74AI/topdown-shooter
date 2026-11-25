---
baseline_commit: c57c1ccfe57699f257eb8637ba14bf0c20d66172
---

# Story 8.9: Smooth through hiccups

Status: review

<!-- Network pass story 2 of 5 (designer 2026-11-24). Story file 2026-11-24 from the real code on master da82847; decisions pending (docs/network-pass-decisions.md). -->

## Story

As a player,
I want zombies and friends to keep moving smoothly when my connection stutters,
so that I never see things freeze and jump.

> **NETWORK PASS BRIEF** (`docs/network-pass-brief.md`): paste it verbatim into the builder and reviewer prompts. Most relevant here: 3/4, 5 (no sim change), 7 (client timing in ms of the frame clock, no per-frame allocation), 9 (hidden tab, late scene start), 13 (before/after), 14 (lossy line from 8.8), **16 (nothing drawn ever goes backwards)**, **17 (clean lines don't pay)**, 18 (the queue-depth number comes from the server, not from the client), 20 (the harness imports the real clock/delay/pacing).

## Acceptance Criteria

### Fairness / player-visible rule (brief 3; each is a test)

- **F1 "Others never freeze on a normal 4G hiccup."** On the lossy line (1 % × 200 ms stalls, both ways) the picture runs past the newest frame (a freeze: teammates and zombies hold still) **at most once per 30 s** (audit: about once every 2 s, 45–62 per ~111 s).
- **F2 "Time never runs backwards on my screen."** The render tick (what others and the horde are drawn at) and the server-tick estimate never decrease from one frame to the next, whatever the line does (cell handover, bufferbloat, a burst after a stall).
- **F3 "Catching up never looks like fast-forward."** After a stall the picture plays at most **1.1×** speed (and slows to at least **0.9×** while the buffer refills) until it is back on its delay; nothing teleports.
- **F4 "A clean line feels exactly as today."** On a clean 150 ms ± 10 ms line the delay stays **100–150 ms** (today's range), no freezes, reversed hits ≤ 0.5 %.
- **F5 "A zombie at the screen edge doesn't blink out in a burst."** A zombie missing from frames disappears after **150 ms** of missing *render* time, not after 3 frames (3 frames can land in one burst).
- **F6 "My survivor never moves a step I didn't make, and my shots are not lost."** After a stall the input backlog on the server empties without skipped inputs in normal play: predicted shots that never fire on the server **< 1 %** (audit 1.5–5.7 %); while the backlog empties my survivor runs at no less than **0.9×** of its speed for at most a few seconds.
- **F7 "Boss warnings stay honest."** Every Behemoth telegraph fill still starts from the server's start tick and ends exactly on the hit (EPIC 6 brief 21b), with the new clock.

### Behaviour

1. **Delay from lateness.** The render delay adapts between **100 and 250 ms** (`RENDER_DELAY_MAX_MS` 150 → 250) from how **late** snapshots arrive against the server clock: per patch and per horde frame, `lateMs = (arrivalMs − tick × 50) − clock offset` (0 for the least-delayed packet). Target = `RENDER_DELAY_MIN_MS` (100) **+ the p95 lateness over the last 10 s + one tick (50 ms) of margin**, clamped to 100–250. No per-sample cap like today's `JITTER_SAMPLE_CAP_MS` (100), except that a hidden-tab gap (frame clock paused > 1 s) is skipped, not counted. (Today: jitter = EWMA of *gap* deviation, capped 100 ms per sample, so a 300 ms stall barely moves it: audit F3.)
2. **A render clock that stretches, never jumps.** `renderTick` becomes its own clock: each frame it advances by `dt × rate`, with `rate` in **[0.9, 1.1]** steering `serverEstimate − renderTick` toward the target delay (rising delay → slower, falling → faster; at most ±10 % of real time, so ±100 ms of delay per second; today ±20 ms/s). It is clamped never to decrease. The delay **rises fast** (at 0.9× from the first late sample) and **falls slowly**: it starts falling only after **5 s** without a sample over the current target (decision 8.9 D3).
3. **A server clock that never runs backwards.** `ServerClock` keeps the min-offset-over-2 s measurement, but the estimate it hands out moves toward that measurement in small steps (at most **10 % of elapsed time** per frame, both ways) and never decreases: when latency rises (the min jumps up), the estimate slows down instead of stepping back (audit F5).
4. **Missing zombies by time.** `hordeBuffer.ts`: a slot absent from a frame is dropped once the render tick is **3 ticks (150 ms) past the first frame that lacked it** (`HORDE_MISSING_LIMIT` becomes `HORDE_MISSING_TICKS = 3`, compared with the render tick, not counted per arriving frame). The kill rule (`markDead`, pending kills) is unchanged.
5. **Gentler backlog recovery.** The server tells each player how many of their inputs are queued (`PlayerState.inputQueued`, u8, set by `syncState` from `RunController.queued(id)`; changes only when the depth changes). When my queue is above `INPUT_QUEUE_TARGET` (2) for **3 ticks** in a row, `NetSimHost.stepInputs` runs its 50 ms steps at **0.9×** (one step per 55.6 ms of frame time) until it is back at the target; it never runs faster than 1×. The server's skip rule (`INPUT_DRAIN_AFTER_TICKS` 40, every 2nd tick) stays as the safety net, unchanged (a 0.5 s skip delay was rejected in Story 2.4: +35 % starved ticks).
6. **Harness and numbers (the `epics.md` ACs).** On the lossy line (8.8's `loss`), 150 ms ± 10 ms, 3 seeds × 60 s:
   - freezes (render tick past the newest horde frame for ≥ 1 frame, counted once per episode) **≤ 1 per 30 s** (before ≈ 15 per 30 s);
   - predicted shots that never fire on the server **< 1 %** of shots (before 1.5–5.7 %);
   - starved ticks **no worse** than before (± 10 % relative);
   - reversed hits still **< 5 %** for kiting Runners and Walkers at 1 % and 2 % (with 8.8's 500 ms window; if not, raise to **600 ms / 12 ticks** per 8.8 D1's note and record it: 75 ms one-way + ~200 ms queue + 250 ms delay can pass 500 ms);
   - on the clean line: delay p50/p95 **within 100–150 ms**, 0 freezes, reversed ≤ 0.5 %.
7. **Overlay.** `?debug=1` shows `delay 140 ms (target 160) · late p95 60 · rate 1.00× · freezes 0 · queue 2`.

## Tasks / Subtasks

- [x] **T1 Before numbers** (brief 13): merge 8.8 first if it is on master (needs `loss`); otherwise branch and cherry-pick only its harness `loss` option for the measurement. Add to `tools/netsim/hitsSim.ts` (or a sibling `smoothSim.ts` that imports the same modules) the counters: freezes, render-tick monotonic violations, delay p50/p95, starved ticks, never-fired predicted shots (already in `Result.drops`). Run before on master's client code.
- [x] **T2 Lateness + target** (AC 1, F1, F4): rewrite `apps/client/src/net/adaptiveDelay.ts` around a preallocated ring of lateness samples (10 s × ~40 samples/s; patches + horde frames) and a p95 (sort-free: a fixed histogram of 5 ms buckets 0–500 ms is enough and allocation-free). Netcode constants in `netConfig.ts` with "Story 8.9" comments: `RENDER_DELAY_MAX_MS 250`, `LATENESS_WINDOW_MS 10_000`, `LATENESS_PERCENTILE 0.95`, `DELAY_MARGIN_MS 50`, `DELAY_FALL_AFTER_MS 5_000`, `PLAYBACK_RATE_MIN 0.9`, `PLAYBACK_RATE_MAX 1.1`; delete `JITTER_*` and `RENDER_DELAY_SLEW_MS_PER_S` / `RENDER_DELAY_JITTER_GAIN` once nothing reads them (the overlay's "jitter" becomes "late p95").
- [x] **T3 Render clock** (AC 2, F2, F3): `AdaptiveDelay.renderTick(estimate)` becomes stateful (`advance(frameDtS, estimate)` returning the new render tick, monotonic). Unit tests with a fake frame clock: a 300 ms stall → rate goes to 0.9× until the target is reached, then 1.0×; a burst → ≤ 1.1×; the render tick never decreases over 10,000 random frames (property test with a seeded random line: stalls, bursts, a +150 ms lasting latency step, a hidden-tab gap).
- [x] **T4 Server clock** (AC 3, F2): `serverClock.ts` gains a slewed, monotonic `estimateTick(nowMs)` (keep the raw min as `rawOffsetMs` for tests and the overlay). Tests: a lasting +150 ms latency rise → the estimate never decreases and converges within ~2 s; a fall → converges at ≤ 1.1×; first sample → snaps (no slew from NaN).
- [x] **T5 Missing by time** (AC 4, F5): `hordeBuffer.ts` keeps per slot the tick of the first frame that missed it; `sample(renderTick)` drops it once `renderTick ≥ firstMissTick + HORDE_MISSING_TICKS`. Change `HORDE_MISSING_LIMIT` in `packages/shared/src/net/hordeFormat.ts` to `HORDE_MISSING_TICKS = 3` (bots use the constant: check `tools/bots/botClient.ts`). Tests in `hordeBuffer.test.ts`: three frames without a margin zombie landing in one task don't remove it until the render tick is 150 ms past; a zombie really gone is removed 150 ms after; a kill still hides it at once.
- [x] **T6 Queue depth from the server** (AC 5, F6; brief 2): `inputQueued` (u8) on `PlayerState` in `apps/server/src/rooms/schema/RunState.ts`, `syncState.ts` (assign only on change), `packages/shared/src/net/stateView.ts` (`PLAYER_STATE_FIELDS`), `fakeRoom.ts`, the dev throttle `StateCopy` (follows the key list: check its compile-time test), `snapshotWorld` (not world state: exclude, it is room-only). Solo (`LocalSimHost`) never slows. Bandwidth: report B/s (expected ≤ 0.1 KB/s per phone: 1 field × 4 players × a few changes/s).
- [x] **T7 Client step pacing** (AC 5, F6): `NetSimHost.stepInputs` takes a `stepRate` (1.0 or 0.9) from my `inputQueued` (over target 3 patches in a row → 0.9; at or under target → 1.0); `accumulatorS += frameDtS × stepRate`. The Predictor sees the same steps (nothing else changes: own survivor simply makes 10 % fewer steps per second). Edge flags and their latched payloads (EPIC 6 brief 30) still go out on the next step. Tests in a NetSimHost test with a fake room: queue 4 → 0.9×; queue 2 → 1×; hidden tab (`accumulatorS %= TICK_DT_S`) unchanged.
- [x] **T8 Harness pacing** (brief 20): `hitsSim.ts` uses the same pacing rule (import the pure function, don't copy) and the new delay/clock; the server side is the real `RunController`, so `inputQueued` is read from `ctrl.queued(ID)` delayed by the down link.
- [x] **T9 Telegraph check** (F7): `apps/client/src/render/bossTelegraph.ts` reads `serverTick` (the estimate): add a test that with the slewed clock the fill is 0 at the start tick and 1 exactly at `hitTick`, never above 1, and never shrinks (monotonic estimate).
- [ ] **T10 After numbers + rewind re-check** (AC 6): run every row before/after; if kiting Runners exceed 5 % at 2 %, apply the 600 ms fallback (constants as in 8.8) and re-run; record.
- [ ] **T11 Bots and the 2.10 overlay**: bots have no renderer; confirm `npm run bots -- --lag 150 --jitter 20 --loss 1` still plays (the server change is a schema field) and `seq_gap_suspect` / `spread_cancel_suspect` don't rise (the client slowdown sends fewer inputs, never skips seqs).
- [x] **T12 Docs + gate + hand-back**: `docs/perf/network-pass-2026-11.md` § 8.9; `game-architecture.md` note already says "adapt 100–250 ms"; HANDOFF §4 netcode line (delay, clock, pacing).

## Dev Notes

### Current state (read before changing)

- **One render tick per frame** (`apps/client/src/sim/NetSimHost.ts:410-431`): `delay.frame(dt)`, `serverTickNow = clock.estimateTick(t0)`, `renderTickNow = delay.renderTick(serverTickNow)`; horde, teammates (`snapshots.sample`), events (`eventQueue.drain(renderTick)`), cosmetics all sample it. `viewTick` for shots = `viewTickOf(renderTickNow)` (`NetSimHost.ts:719`): **a longer delay makes shots older** (the 8.8 window must cover it).
- **Clock and delay are fed from state patch arrivals only** (`NetSimHost.ts:986-987`: `clock.sample(now, state.tick)`, `delay.snapshot(now, state.tick)`), after the dev throttle. Horde frames are not fed today; feeding them too doubles the samples and makes the lateness estimate see the horde stream (the biggest) directly (recommended; 8.11 later makes patches carry exactly one tick).
- **`AdaptiveDelay`** (`apps/client/src/net/adaptiveDelay.ts`, 62 lines): jitter = EWMA(|gap − 50 × Δticks|, α 0.1), each sample capped at 100 ms; target = clamp(100 + 2 × jitter, 100, 150); slews ≤ 20 ms/s. Constants in `netConfig.ts:29-39`.
- **`ServerClock`** (`apps/client/src/net/serverClock.ts`, 57 lines): `offset = min(arrival − tick × 50)` over a 2 s ring (64), `estimateTick = (now − minOffset) / 50`, unslewed: when a lasting latency rise pushes the old minimum out of the window, the estimate steps back by the rise (audit F5).
- **Past the newest frame nothing is extrapolated**: horde (`hordeBuffer.ts sample`, the "hold the last sampled pose" branch) and teammates (`snapshots.ts:80-83` "past the newest, the newest") hold. This story doesn't add extrapolation; it keeps the render tick behind the newest frame instead.
- **Missing-3 rule** (`hordeBuffer.ts:52,137-150`): counted in `end()` at frame **arrival**; `HORDE_MISSING_LIMIT = 3` (`packages/shared/src/net/hordeFormat.ts:28`).
- **Input pacing** (`NetSimHost.ts:701-738`): one `input.send` per 50 ms of frame time via `accumulatorS`, ≤ `MAX_CATCHUP_STEPS` (5) per frame, the remainder dropped after a hidden tab. The server applies one input per tick (`RunController.ts` ~500-540): queue ring `INPUT_QUEUE_MAX` 6, target 2, drain after 40 ticks over target by skipping every 2nd tick; a starved tick holds still and pauses the weapon (`weaponsPaused`), `weaponDebt` gives dry weapon ticks for skipped inputs (2.4 re-review MED-A). `RunController.queued(id)` (line ~471) already returns the depth.
- **Telegraphs** (`apps/client/src/render/bossTelegraph.ts`, `SimHost.ts:49`): drawn from `serverTick` (the estimate, NOT the render tick), so a boss warning is never delayed by the render delay; it must stay monotonic (F7).
- **Harness** `tools/netsim/hitsSim.ts` imports `AdaptiveDelay`, `ServerClock`, `viewTickOf`, the Predictor and the real `RunController`; it has its own frame loop (`dtMs`) and input step: keep it calling the real modules.

### What must be preserved

- Prediction of my own survivor (2.6): unchanged apart from fewer steps per second while the queue drains (F6). `PREDICTION_*` constants untouched.
- Events line up with their zombie (2.4/2.6: events wait for the render tick): the event queue keeps draining at the render tick.
- `STALE_COSMETIC_TICKS` (10) after a hidden-tab backlog: unchanged.
- Hidden tab: the frame clock stops; when it wakes, the render clock must not play 5 s at 1.1× — on a wake (frame gap > 1 s) the render clock re-anchors to `estimate − target` once (that is not "backwards" if the estimate moved on; assert it in the property test).
- Solo: `LocalSimHost` has no delay, no clock, no pacing change.
- Simulation: no change (brief 5); the schema field is room state, not World state.

### Decisions to confirm (designer: "ok" or by code; recommended value first)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.9 D1 | The most the game may draw others behind on a bad line | **250 ms** (hides the measured 240–290 ms hiccups; only while the line is bad) (200 ms: a bit snappier, but about a third of 4G hiccups still freeze for a moment) |
| 8.9 D2 | How fast the picture may catch up or slow down | **0.9×–1.1×** (a 10 % change is hard to see; Unity uses 0.85–1.1×) (0.8×–1.25×: recovers twice as fast but zombies visibly speed up after a hiccup) |
| 8.9 D3 | How long the extra delay stays after the line clears | **5 s calm, then it eases back down** (avoids pumping up and down on a train) (ease down at once: snappier between hiccups, more freezes on the next one) |
| 8.9 D4 | A zombie at the edge of your screen that stops being sent | **Removed after 150 ms of missing time** (removed after 250 ms: never blinks, but a zombie that really left lingers a little longer) |
| 8.9 D5 | After a hiccup, how your own survivor helps the server catch up | **Your survivor runs at 90 % speed for about 2 s** (the server's backlog empties without dropping a move or a shot) (server only: after 2 s it skips every second input; your survivor may jump back a little and a shot may vanish) |
| 8.9 D6 | How the phone knows the backlog size | **The server sends it** (one small number per player, ≈ 0.1 KB/s) (the phone guesses from its own acks: no bytes, but a wrong guess slows you for nothing) |
| 8.9 D7 | Feed the clock from horde frames too | **Yes, patches and horde frames** (twice the samples, sees the biggest stream) (patches only, as today) |

### Beat the rule (reviewer start list; brief 4)

1. Property test: random stalls 0–600 ms, bursts, latency steps ±200 ms, hidden-tab gaps: the render tick and estimate never decrease; rate always in [0.9, 1.1].
2. A lasting +200 ms latency step (cell handover): does anything (teammates, zombies, telegraph fill, `viewTick`) visibly rewind?
3. A modified client that ignores `inputQueued` and never slows: it only keeps its own backlog (server skip still drains it); nobody else is affected.
4. A modified client that slows to 0.5× on purpose: fewer inputs/s → the server starves → its survivor holds still and its weapon pauses (2.4 rule); no speed-up, no extra shots.
5. Burst of 3 frames without a margin zombie: does it blink? A zombie really leaving: does it linger > 150 ms + delay?
6. Boss slam telegraph during a stall: fill monotonic, ends on the hit, never "jumps back"?
7. Delay at 250 ms: are reversed hits still < 5 % (rewind window)? Do teammates' revives/pings look late enough to confuse (record, don't fix)?
8. Clean line regression: delay p95 > 150 ms anywhere? Any freeze?
9. Mutate: `PLAYBACK_RATE_MAX` 1.1 → 2 must fail a test; `RENDER_DELAY_MAX_MS` back to 150 must fail the freeze AC on the lossy line; remove the monotonic clamp → the property test must fail.

### Measurements (brief 13) — fill in

| Metric (150 ms ± 10 ms, 3 × 60 s) | Line | Before | After target | After (measured, 2026-11-25) |
| --- | --- | --- | --- | --- |
| Freezes per 30 s | clean | ~0 | 0 | **0** (all 3 cases) |
| | 1 % × 200 ms | ~15 (audit: a stall every ~2 s) | ≤ 1 | **0.9–1.0** (before **6.0–6.9**), frozen frames 278–327 → 29–34 (8.8's loss; first pass on my own loss copy: 0.9–1.2) |
| | 2 % × 200 ms | record | record (≤ 2) | **0.3–0.9** (before 11.0–11.2) |
| Render delay p50 / p95 | clean | 100–140 | 100–150 | **100 / 100** (before 110–118 / 115–125) |
| | 1 % × 200 ms | ≤ 150 (capped) | ≤ 250 | **250 / 251–253** (max 261: the ≤ 25 ms stall stretch) |
| Backwards steps of the render tick | lossy + latency step | > 0 (F5) | 0 | **0** render, 0 estimate on every row (before 3 / 3 on the step row, 1 render step on the 2 % Walker row) |
| Predicted shots never fired on the server | 1 % × 200 ms | 1.5–5.7 % | < 1 % | **0 %** (before 1.5 %; 2 %: 1.3–2.6 % → 0 %) |
| Starved ticks | 1 % × 200 ms | record | ≤ before + 10 % | **NOT MET: 87–92 vs 55–64 (+41–58 %)**; 2 %: 119–133 vs 83–86 (see Completion Notes) |
| Server input skips (drain) | 1 % × 200 ms | 50–57 | — | 0–1 |
| Reversed hits, kiting Runners | 1 % / 2 % | (after 8.8) | < 5 % | **pending 8.8's 500 ms window** (T10). With today's 300 ms window: 7.6 → 18.1 % / 11.9 → 21.5 % |
| Horde-frame gap p99 at the phone | 1 % × 200 ms | 239–248 ms (audit) | unchanged (the line) — the delay now covers it | not re-measured (the line, no code change) |

Full table and method: `docs/perf/network-pass-2026-11.md` § 8.9 (`npx tsx tools/netsim/smoothRun.ts 60 3` on 8.8's harness loss, commit df00ed48 cherry-picked; before = master c57c1cc + df00ed48 with the harness patched to the old API, load 1.1–2.3; after load 1.0).

### Files (expected)

- `apps/client/src/net/adaptiveDelay.ts` (+ test), `serverClock.ts` (+ test), `netConfig.ts`, `hordeBuffer.ts` (+ test), `snapshots.ts` (only if it reads the missing rule; it doesn't today), `apps/client/src/sim/NetSimHost.ts`, `apps/client/src/debug/PerfOverlay.ts` / `netSummary.ts`
- `packages/shared/src/net/hordeFormat.ts` (`HORDE_MISSING_TICKS`), `packages/shared/src/net/stateView.ts`
- `apps/server/src/rooms/schema/RunState.ts`, `apps/server/src/rooms/schema/syncState.ts`, `apps/client/src/net/fakeRoom.ts`, `apps/client/src/net/devThrottle.ts` (StateCopy follows the keys)
- `tools/netsim/hitsSim.ts`, `tools/netsim/hits.test.ts` (or a new `tools/netsim/smooth.test.ts`), `tools/bots/botClient.ts` (missing rule constant)

**Not touched (8.8 owns):** `REWIND_*` constants (except the 600 ms fallback, coordinated), `devThrottle.ts` loss code, `urlOptions.ts`, `tools/bots/run.ts`, `lagLine.ts`.

### Epic 6: check at build time (brief 22)

- 6.8–6.10 events: their banners/markers are event-queue items drawn at the render tick: with a delay up to 250 ms they appear up to 100 ms later than today on a bad line; their fairness rule ("announces itself before it can hurt", EPIC 6 brief 23) is measured in server ticks, so still holds — check any test that assumes a 150 ms max delay (`grep -rn "RENDER_DELAY_MAX_MS\|150" apps/client/src/**/event*`).
- 6.11 vote timer and 6.12 endless: any countdown drawn from `serverTick` must stay monotonic (F7 applies).
- If Epic 6 added new `PlayerState` fields, the `inputQueued` addition follows the same copy list.

### Notes for the merge (brief 12)

- `hordeBuffer.ts`: 8.10 rewrites the decoder side (delta frames) and touches this file after you; keep the missing-by-time logic in one small function so 8.10 keeps it.
- `NetSimHost.ts`: 8.1 adds a watchdog and reconnect handling (different methods: `update` gains a watchdog check; `stepInputs` is yours).
- `RunState.ts` / `syncState.ts` / `stateView.ts`: 8.1 adds hold fields to `PlayerState`; one field each, merge trivially.
- `hitsSim.ts`: on top of 8.8's `loss`.

### Dependencies

8.8's lossy line for the final measurement (merge it before T10; build in parallel). 8.10 waits for this story (`hordeBuffer.ts`).

### Suggested build round

Round 1, in parallel with 8.8. Effort M (≈ one builder session). Risk medium (feel): give the designer a before/after `?lag=150&jitter=20&loss=1` link pair in the hand-back if a preview deploy exists (else say "not verified on a phone").

### References

- `docs/perf/network-audit-2026-11.md` §2 (client timeline), §3.3 (frame gaps), §3.5 (never-fired shots), F2–F5, H3, §5 Timing (Unity ClientTickRate, Overwatch), §6 #3, #5
- `_bmad-output/planning-artifacts/epics.md` › Story 8.9; Story 2.4 (`2-4-the-server-runs-the-fight.md`: input queue and drain review), Story 2.6 (`2-6-instant-feel-for-my-own-survivor.md`: adaptive delay)
- `docs/network-pass-brief.md`, `docs/network-pass-decisions.md`

## Dev Agent Record

### Agent Model Used

Claude (claude-code-remote builder session, gds-dev-story), 2026-11-25 overnight run.

### Debug Log References

- Before: master c57c1cc, `smoothRun.ts 60 3` on a worktree with the new harness patched to the old API (load 0.19–0.37). After: `story-8-9` (load 0.34–0.81). Raw lines in the hand-back; table in `docs/perf/network-pass-2026-11.md` § 8.9.
- Tuning probes (not committed): ease-down 20/10/5 ms/s → 2.11/1.59/1.03 freezes per 30 s (12 × 60 s, 1 % × 200 ms); p99 instead of p95 → 3.15/2.63/2.28 (no better, noisy); overdue slowdown off → 3.02 (on: 1.03). Pacing variants: "until reported ≤ 2" 117 starved / 0 skips; "make up exactly the reported excess, then wait 1 s" 131; "excess − 1" 114 / 23 skips; pacing off 81 / 74 skips (1 % × 200 ms, 150 Walkers, 3 × 60 s).

### Gate

- Full gate on `2981875` (master `b0e491a` merged): `npm run typecheck && npm run lint && npm test && npm run build` green: 400 test files passed (1 skipped), 3681 tests passed (3 skipped), build ok; load 0.43 at start, 4.52 at the end (one builder plus the parallel 8.8 session's container is separate).
- After cherry-picking 8.8's harness `loss` (`3d430fc`) and the docs update: `npm run typecheck` ok, `npm run lint` ok, tests in `tools/netsim`, `tools/netaudit`, `tools/checks`, `apps/client/src/net`, `apps/client/src/sim`: 70 files / 427 tests passed (3 skipped); load 0.5–2.4. No full gate re-run (harness-only change).

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.9 D1–D7 accepted by the designer 2026-11-24 (all 29, `docs/network-pass-decisions.md`).
- Tasks and their named tests (brief R1):
  - T1/T8: `tools/netsim/hitsSim.ts` (Story 8.9 `loss` copy of the audit model with its own loss RNG, `latencyStep`, `pacing`, `stepRate`, `Result.smooth` counters, real `StepPacing`/`AdaptiveDelay.advance`/`ServerClock`, `inputQueued` from `ctrl.queuedAtTick`), `tools/netsim/smoothRun.ts`. Tests: `tools/netsim/smooth.test.ts` › "F4: a clean 150 ms ± 10 ms line feels as today…", "F1, F6: on the lossy line…", "F2 (audit F5): a lasting +150 ms latency step…", "beat the rule 3…", "beat the rule 4…".
  - T2/T3: `apps/client/src/net/adaptiveDelay.ts` rewritten. Tests: `adaptiveDelay.test.ts` › "a clean line (± 10 ms) stays at 100 ms and plays at 1×", "a 300 ms stall: the delay target rises at once…", "falls only after 5 s without a late sample, at ≤ 1.1×", "the target covers the p95 lateness plus one tick", "on the lossy line (200 ms stalls)…", "property: the render tick never decreases…", "R3 fine sweep: 1 ms frames…", "after a hidden tab the render clock re-anchors once…", "a woken tab never moves the render clock backwards…", "lateness samples that waited out a paused frame clock are skipped".
  - T4: `serverClock.ts` slewed monotonic `estimateTick`, `rawOffsetMs`, `rawTick`. Tests: `serverClock.test.ts` › "Story 8.9: the first estimate snaps…", "…a lasting +150 ms latency rise never moves the estimate back…", "…a latency fall converges at ≤ 1.1×", "…after a hidden-tab gap the estimate snaps forward, never back".
  - T5: `hordeBuffer.ts` `dropMissing` (one function, for 8.10), `HORDE_MISSING_TICKS = 3` (`hordeFormat.ts`; bots never used the constant). Tests: `hordeBuffer.test.ts` › "Story 8.9 (D4): holds a zombie missing…", "Story 8.9 (F5): three frames without a margin zombie landing in one burst…", "Story 8.9: a zombie really gone leaves 150 ms…"; kill rule unchanged (existing kill tests pass).
  - T6: `PlayerState.inputQueued` (u8, appended last) — RunState → syncState (on change) → stateView `PLAYER_STATE_FIELDS` → fakeRoom → devThrottle StateCopy (follows the key list; its compile-time `SameKeys` check passes) — not World state, so not in snapshotWorld / Predictor / mirror; bots ignore it. It is `RunController.queuedAtTick(id)` (new: the depth when the last tick started, the one the drain rule compares), not `queued(id)` (after the tick took one: one lower, so the client would stop slowing while the server still counts "over target"). `INPUT_QUEUE_TARGET` moved to `packages/shared/src/config/constants.ts` (RunController re-exports it). Test: `syncState.test.ts` › "Story 8.9: inputQueued is my queue depth when the last tick started…". Bandwidth: 0–10 changes/s per player (harness count) × ~2 B → ≤ 0.1 KB/s per phone with 4 players.
  - T7: `apps/client/src/net/stepPacing.ts` (`StepPacing`), `NetSimHost.stepInputs` `accumulatorS += frameDtS × pacing.frame()`. Tests: `stepPacing.test.ts` (both), `NetSimHost.test.ts` › "Story 8.9 (D5): steps at 0.9× while the server reports my queue over its target…", "Story 8.9: a hidden tab while slowed still never bursts". Edge flags untouched (existing swap/consumable tests pass).
  - Wiring (brief R2), each fails when its line is deleted (checked): `NetSimHost.test.ts` › "Story 8.9 (D7, wiring): horde frames feed the clock and the lateness too…", "Story 8.9 (F1, wiring): an overdue horde frame slows the render clock…; … counts one freeze", the D5 pacing test (onPatch and the accumulator), `tools/checks/delayLineWiring.test.ts` (overlay), `apps/client/src/debug/delayLine.test.ts` (AC 7 text).
  - T9: `bossTelegraph.test.ts` › "Story 8.9 (F7): … 0 at the start tick, 1 exactly at the hit, never above 1, never shrinks".
  - T11 (part): `npm run bots -- --url http://localhost:2691 --count 4 --scenario net150 --until-wave 4` on this branch: wave 4 played (188 kills, 5.9 KB/s down avg), 0 `seq_gap_suspect` / `spread_cancel_suspect` in the server log. The `--lag/--jitter/--loss` run waits for 8.8 (bots have no line on master).
  - T12: `docs/perf/network-pass-2026-11.md` § 8.9 (new file), `game-architecture.md` interpolation line, HANDOFF §4 netcode line.
  - **Open: T10** (after-numbers on the real 8.8 loss + rewind re-check, 600 ms fallback if Runners > 5 %) and the lossy bots line of T11 — after 8.8 lands on master (main session tells me).
- Builder decisions (no designer question needed: inside D1–D7; auto-accepted overnight, designer: follow the GDS recommendation), each with the alternative:
  - B1 Target formula: `clamp(max(p95 + 50, held), 100, 250)` where `held` = the last sample's lateness + 50 that was over the target, held 5 s then easing down. The story's literal "100 + p95 + 50" would put a clean line at ≥ 150–170 ms (fails F4); "p95 alone" never covers a 1 % stall (they are < 5 % of samples): measured. Alternative: the literal formula.
  - B2 Ease-down 5 ms/s after the 5 s calm (`DELAY_FALL_MS_PER_S`; 250 → 100 in 30 s). D3 says "5 s calm, then it eases back down" without a speed; 20 ms/s gave 2.1 freezes/30 s, 5 gives 1.0. Alternative: 20 ms/s (back to 100 in 7.5 s, twice the freezes).
  - B3 Overdue slowdown: when the next horde frame is > p95 + 15 ms past its cadence, the render clock plays at 0.9× at once, and may stretch up to 25 ms past the 250 ms cap (`FRAME_OVERDUE_MS`, `STALL_STRETCH_MAX_MS`). A 200 ms stall + jitter needs 270 ms of delay; without this rule 3.0 freezes/30 s, with it 1.0. Max delay seen 261 ms. Alternative: hard 250 ms cap (every stall at the cap freezes for ~1 frame).
  - B4 Clock and render clock run on the host's `now()` (ms), `advance(nowMs, estimate, newestTick)`, not `advance(frameDtS, estimate)` as written in T3: the server clock already runs on `now()`, the hidden-tab gap is then visible even if Phaser caps `delta`, and the existing timing tests (which move `now`) keep working. A wake also re-anchors when the delay is > 1 s past the cap.
  - B5 `inputQueued` = depth at tick start (`queuedAtTick`), see T6. Alternative: `queued(id)` as written (off by one against the drain rule).
  - B6 Pacing rule exactly as AC 5 ("until back at the target"); two smarter variants measured no better (Debug Log).
- **AC misses (for the main session / reviewer):**
  - **Starved ticks +41–58 % on the 1 % line (8.8's loss; +27–53 % on my first loss copy) (AC 6 "no worse ± 10 %": NOT met).** Cause measured: with the server drain, the post-stall backlog (~5 inputs) sat 2 s as cover for the next stall; the 0.9× pacing empties it gradually, so the next stall finds 1–2 queued instead of 5 (Story 2.4's trade-off, the reason the drain waits 2 s). A starved tick delays one move by a tick; before, the drain skipped 73–91 inputs per 3 min (lost moves/shots). The test bounds it (`smooth.test.ts` › beat the rule 3: ≤ 1.6 × pacing-off) so it can't get worse unseen. Options: accept (F6's "no lost input" over cover); or slow only after ~1 s of backlog (then the server's 40-tick skip races it); or designer revisit of D5.
  - Freezes: 0.9–1.0 per 30 s on every 1 % row on 8.8's loss (AC ≤ 1 met; 1.2 for the Walker rows on my first loss copy). What remains is mostly the first stall after > 10 s of calm (the delay is back at 100 ms, F4). The harness sends one down message per tick (20/s), so its stalls are ~2× rarer and more isolated than on a phone (~46 msg/s, audit §3.3), which makes this the harder case.
  - Reversed hits rose on kiting rows with today's 300 ms window (older shots at 250 ms delay) — 8.8's 500 ms window is the planned fix; T10 measures it.
- Brief lines 25–35 (Epic 6 retro addendum, landed on master during the build) applied: R1 named tests above; R2 wiring tests; R3 1 ms sweep; R6 Gate line; R8 text checked (story text still says `advance(frameDtS, …)`, `HORDE_MISSING_TICKS` compared with the render tick — B4 records the difference); R9: vote urgent sends, crate cancel window and dawn rule don't read the render clock and the pacing only ever sends fewer inputs; their tests pass in the gate; lossy-line re-measure of them waits for 8.8's browser line (R10 two-tab smoke is the main session's).

### Notes for the merge (brief 12)

- `tools/netsim/hitsSim.ts`: 8.8's harness `loss` commit df00ed48 is cherry-picked here (conflicts resolved: 8.8's loss semantics and `stalls`, plus my `latencyStep` on `Link`, `pacing`, `stepRate`, `queued`, `Smooth`). When 8.8 lands, the merge should be clean or keep both sides of `Link`/`Result`. `tools/netaudit/hitsLossSim.ts`: deleted by that commit.
- `docs/perf/network-pass-2026-11.md`: new file with a header and § 8.9; if 8.8 also creates it, keep both sections.
- `apps/client/src/net/netConfig.ts`: 8.8 keeps its constants out of it; 8.1 may add a watchdog constant: append.
- `NetSimHost.ts`: `update` (clock/advance/countFreeze), `stepInputs` (pacing), `receiveHorde`/`sampleClock`/`countFreeze` (new private methods after `receiveState`), `takeSnapshot` (`pacing.onPatch`), netStats fields. 8.1's watchdog goes in `update`: put it before the clock lines.
- `RunState.ts` / `syncState.ts` / `stateView.ts` / `fakeRoom.ts`: `inputQueued` appended last; 8.1's hold fields append after it.
- `hordeBuffer.ts`: the missing rule is `dropMissing(renderTick)` + `firstMissTick` set in `end()`/cleared in `record()`; 8.10's delta decoder keeps both.
- `packages/shared/src/config/constants.ts`: `INPUT_QUEUE_TARGET` appended at the end (8.8 edits `REWIND_MAX_TICKS` higher up).

### Not verified

- Real phones, real 4G, iOS Safari (brief 23): the feel of 0.9–1.1× playback and of a 250 ms delay; no preview deploy, so no `?lag=150&jitter=20&loss=1` before/after link pair (not verified on a phone).
- The browser dev throttle line `&loss=1` (8.8's) with this clock: not run (8.8 not on master).
- T10 (after numbers on 8.8's loss, rewind re-check) and bots with `--lag 150 --jitter 20 --loss 1`: waiting for 8.8.
- Epic 6 timers (vote urgent sends, crate cancel window, dawn) re-measured on the lossy line in a browser (brief R9/R10): their unit tests pass, no lossy browser run.
- Hidden tab across a build start / late Game scene start in a real browser: covered only by unit tests (fake clocks).

### File List

- `_bmad-output/implementation-artifacts/8-9-smooth-through-hiccups.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/game-architecture.md`, `HANDOFF.md`, `docs/perf/network-pass-2026-11.md` (new)
- `apps/client/src/net/adaptiveDelay.ts`, `adaptiveDelay.test.ts`, `serverClock.ts`, `serverClock.test.ts`, `netConfig.ts`, `hordeBuffer.ts`, `hordeBuffer.test.ts`, `fakeRoom.ts`, `stepPacing.ts` (new), `stepPacing.test.ts` (new)
- `apps/client/src/sim/NetSimHost.ts`, `NetSimHost.test.ts`, `NetSimHost.flame.test.ts`
- `apps/client/src/debug/perfStats.ts`, `PerfOverlay.ts`, `netSummary.test.ts`, `delayLine.test.ts` (new)
- `apps/client/src/render/bossTelegraph.test.ts`
- `apps/server/src/run/RunController.ts`, `apps/server/src/rooms/schema/RunState.ts`, `syncState.ts`, `syncState.test.ts`
- `packages/shared/src/config/constants.ts`, `packages/shared/src/index.ts`, `packages/shared/src/net/hordeFormat.ts`, `packages/shared/src/net/stateView.ts`
- `tools/netsim/hitsSim.ts`, `hits.test.ts`, `smooth.test.ts` (new), `smoothRun.ts` (new), `tools/netaudit/hitsLossSim.ts`, `tools/checks/delayLineWiring.test.ts` (new)

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending).
- 2026-11-25: built (lateness delay, 0.9–1.1× render clock, monotonic server clock, missing by time, queue-depth pacing, harness counters); status review; T10 and the lossy bots run open until 8.8 lands.

## Senior Developer Review (AI)

Reviewer: fresh reviewer session (gds-code-review, three layers: blind / edge-case / acceptance), 2026-11-25. Tree: `review-8-9` = `origin/story-8-9` b8109fb + `origin/master` (already merged, "up to date"). **8.8 (`origin/story-8-8` c1c5ef1) does NOT merge cleanly**: conflicts in `tools/netsim/hitsSim.ts` (5 hunks: `Options`/`Smooth`, `Result.smooth`, `Link` ctor `latencyStep`, `send` due line), `tools/netsim/hits.test.ts` (2), `docs/perf/network-pass-2026-11.md` (1), `apps/client/src/debug/PerfOverlay.ts` (1), `sprint-status.yaml` (1). All look like "keep both sides" (8.9 already carries 8.8's harness `loss` as 3d430fc), but per the brief I reviewed 8.9 + master only, so the 500 ms rewind window is NOT in this review. No T10 commit appeared on `origin/story-8-9` while I reviewed (still b8109fb).

Checked without running the full gate: `npm ci`, `npm run typecheck` ok; tests probed/mutated: `apps/client/src/net/*` (adaptiveDelay, serverClock, stepPacing, hordeBuffer), `NetSimHost.test.ts`, `bossTelegraph.test.ts`, `syncState.test.ts`, `tools/netsim/smooth.test.ts`, `tools/checks/delayLineWiring.test.ts` — all green unmutated. Load 0.0–0.5.

**Verdict: findings (2 medium, 4 low).** The core rule holds: in every probe the render tick and the estimate never went backwards and the rate never left [0.9, 1.1]. The mediums are about the slewed server clock lagging *behind* the real server time after a latency FALL, which no test covers (every new test steps latency up).

### Findings

**M1 (medium) — after a latency fall the slewed estimate lags real server time and the delay controller cannot see it: the real delay passes the 250 ms cap, the render tick falls out of the 8-frame horde ring (zombies step at 20 Hz, no interpolation) and shots get older.**
- Where: `apps/client/src/net/serverClock.ts:86` (forward error corrected at ≤ 10 %/s, up to `CLOCK_SNAP_AHEAD_MS` 1000 ms) + `apps/client/src/net/adaptiveDelay.ts:112-126` (steers `estimate − renderTick`, not the measured clock) + `apps/client/src/net/hordeBuffer.ts:4` (`HORDE_RING_SIZE = 8`, comment still "covers Story 2.6's 150 ms delay": brief 32).
- Scenario (stateful probe, real `ServerClock` + `AdaptiveDelay`, ordered line, 60 fps and 1 ms frames): one-way 275 → 75 ms at 20 s (bufferbloat clears / handover to a better cell). The raw min drops at once, the estimate catches up at 1.1× for ~2 s; meanwhile `delayMs` reads ≤ 250 but the real delay (true server tick − render tick, minus the 68 ms minimum one-way) is **366 ms** clean, **526 ms** with 1 % × 200 ms stalls, **666 ms** for a −500 ms fall. The render tick was older than the oldest kept horde frame (`newest − 7`) for **34 frames** (lossy + −200), **133 frames ≈ 2.2 s** (−500), **497 of 3591 frames** on a bufferbloat saw (75→475 ms over 4 s, then drop). `hordeBuffer.sample` then takes the `ai < 0` branch: the oldest frame, no lerp — the horde moves in 50 ms jumps. `viewTickOf(renderTick)` shots are as old as that real delay (outside 8.8's 500 ms window in the −500 case). Before 8.9 the estimate followed the min at once (no lag after a fall). The harness never sees it: `Smooth.delayP95` is `estimate − renderTick` and the tests only use `addMs > 0`.
- Minimal fix: steer the render clock against a forward-only reference that cannot lag the measurement, e.g. `advance(t0, Math.max(estimate, clock.rawTick(t0)), newest)` (the render clock then catches up at ≤ 1.1× like any delay fall; still monotonic), or let the estimate correct FORWARD faster than backward (forward is never "backwards"; bound it, e.g. ≤ 50 %/s, because the telegraph reads it, see M2). Size `HORDE_RING_SIZE` for 275 ms + slew + one tick (e.g. 12) and fix its comment. Add a test: −200 ms step on the lossy line, assert real delay ≤ 275 + one-way and render tick ≥ oldest ring frame.

**M2 (medium) — F7: after a latency fall the boss telegraph fill ends after the hit (by the size of the fall, up to ~1 s).**
- Where: `apps/client/src/net/serverClock.ts:86` (same lag), read by `bossTelegraph.ts` via `serverTickNow` (`NetSimHost.ts:435`); test `apps/client/src/render/bossTelegraph.test.ts:143` only has a +200 ms rise.
- Scenario: same −200 ms fall: `estimate − true server tick` goes from −68 ms (one-way, as designed) to **−266 ms** and recovers over ~2 s; a slam whose `hitTick` lands in that window fills to 1 about 200 ms after the server applied the hit, while my HP/knockback arrive in the patch ~75 ms after it — the warning is still filling when I'm already hit (E6 21b / brief 16 "ends exactly on the hit"). −500 ms: ~500 ms late. Before 8.9: no lag after a fall.
- Minimal fix: the forward-correction change of M1 (bounded forward catch-up, monotonic); extend the F7 test with a −200 ms fall and assert `|estimate − (trueTick − minOneWay)| ≤` a small bound at every hit tick.

**L1 (low) — F1 test bound is 2× the AC.** `tools/netsim/smooth.test.ts:76` asserts `freezesPer30s ≤ 2`; AC 6 / F1 say **≤ 1 per 30 s** (measured 0.86). The Debug Log's 20 ms/s ease-down (2.1 freezes / 30 s) or a 10 ms/s one (1.6) would pass this test; my `DELAY_FALL_MS_PER_S 5 → 20` mutation was caught only by other tests. Fix: `≤ 1` on this row (or ≤ 1.2 with the measured margin written beside it) — the AC number, per brief 27.

**L2 (low) — bang-bang playback rate at the stretch cap and at the end of an overdue period.** `adaptiveDelay.ts:125-126`: when a stall outlasts the stretch (`delayNow` crosses 275 ms while still overdue), the rate alternates **0.9 / 1.10 every frame** (trace: 20433 ms 1.10, 20450 0.90, 20467 1.10 …; 110 flips > 0.1 per 60 s on 2 % × 500 ms; 42 on 1 % × 200 ms at 60 fps, mostly 0.9 → 1.07 in one frame when the late frame lands). Mostly while already frozen (invisible), but the 1.1× frames run the picture into the freeze sooner and the 0.9→1.07 step at stall end is a 19 % speed change in one frame (D2 bounds speed, not its change). Fix: at the cap while overdue hold `rate = 1` (don't steer) and/or limit the rate change to e.g. 0.01 per frame.

**L3 (low) — the wake test never covers a wake after a latency rise; the "never back" branch is untested.** `serverClock.ts:83` `if (raw > next) next = raw` mutated to `next = raw` (snap may go backwards) survives all serverClock / telegraph / smooth tests: `serverClock.test.ts:86` wakes with "same latency" only. A phone pocketed during a handover (latency +300 ms while hidden) is exactly the case. Fix: add "hidden 6 s, latency +300 ms meanwhile → estimate after wake ≥ before + 6 s − 0 and never decreases".

**L4 (low) — F7 test's "never above 1" is vacuous.** `bossTelegraph.test.ts:168` skips every frame with `est > startTick + SPAN`, so the loop never samples past the hit; mutating `bossTelegraph.ts:31` `Math.min(1, …)` → `Math.min(2, …)` survives the whole file. Fix: let the loop run a few frames past `hitTick` and assert `progress === 1`.

### Recorded, not findings

- **+200 ms lasting rise (handover to a worse cell) freezes the picture ~0.8 s per event** (harness 20 Runners kiting, 3 × 40 s: 35 freeze episodes / 235 frozen frames; probe 60 fps: 15 episodes / 87 frames). Inherent to D2 (the delay can rise only at 0.9×, 100 ms/s); before: ~2 s hold then a step back (audit F5). Better than before; worth one line in the story's Not verified / designer notes.
- **Starved ticks bound (B7, accepted):** real. Same seeds: pacing on 87 vs off 66 (×1.32 ≤ 1.6); mutations `INPUT_SLOW_STEP_RATE 0.9 → 0.5` and `≥ target` fail "beat the rule 3".
- Sub-frame freezes: at 1 ms frames the lossy row counts 6 freeze episodes / 60 s (16 ms each) vs 2 at 60 fps; at 120 Hz phones the AC count would be ~2× the 60 fps harness number. Note only.

### Beat the rule (brief 4, 27) — attempts and results

Stateful probe (real `ServerClock` + `AdaptiveDelay`, state kept between frames, ordered line with HOL stalls, 60 s, 1 ms AND 16.67 ms frames; plus 0–40 ms frame jitter):

| # | Attempt | Result |
| --- | --- | --- |
| 1 | Clean 75 ± 10 ms | 0 back steps, rate 1.0, 0 freezes, delay 100 (F4 ok) |
| 2 | Lossy 1 % × 200 ms | 0 back, rate in range; 2 freezes/60 s at 60 fps (6 sub-frame at 1 ms) |
| 3 | +200 ms lasting step (handover) | 0 back; ~1.4 s frozen in 15 episodes (recorded, D2-inherent) |
| 4 | +500 ms lasting step | 0 back; 287 frozen frames (4.8 s) — beyond D1 by design |
| 5 | −200 ms step (clean) | 0 back; real delay 366 ms (> cap) — **M1** |
| 6 | Lossy + −200 ms step | 0 back; real delay 526 ms, 34 frames before the oldest horde frame — **M1**; telegraph 200 ms late — **M2** |
| 7 | −500 ms step (bufferbloat clears) | 0 back; real delay 666 ms, 133 frames (2.2 s) before oldest — **M1/M2** |
| 8 | Bufferbloat saw 75→475 over 4 s, drop, repeat | 0 back; 497/3591 frames before oldest — **M1** |
| 9 | Oscillating latency 75/175 ms every 6 s (across the 5 s hold) and every 3 s | 0 back; target eases only 5 ms/s, so no pumping (amplitude ≤ 5 ms/period); 16 / 12 freeze episodes per 60 s (each rise) |
| 10 | Long stalls 2 % × 500 ms | 0 back, rate in range; rate flips 0.9↔1.1 per frame at the cap — **L2** |
| 11 | Hidden tab 5 s (messages keep arriving) | 0 back; one forward re-anchor (5 s) as designed; samples skipped |
| 12 | Paused frame clock 0.9 s (just under WAKE_GAP) | 0 back; one 0.9 s forward step (a frame-clock gap, expected) |
| 13 | Frame jitter 0–40 ms + lossy | 0 back, rate in range |
| 14 | Wake after a latency rise (code read + mutation) | real code forward-only; untested — **L3** |
| 15 | Modified client ignores `inputQueued` (harness `pacing:false`) | only its own backlog: server drain skipped 57 inputs, never-fired 2.2 %; others unaffected (server stays the truth) |
| 16 | Modified client at 0.5× (harness `stepRate`) | 894 starved ticks, survivor holds still, no extra/unpredicted shots, 0 overflow/drain |
| 17 | Client at 0.9× forever | same as 16 at 10 %: starves its own survivor every ~10th tick; no new advantage over master (a client could always under-send) |
| 18 | Lie about queue depth | not possible: `inputQueued` is server → client only, no new client message (brief 18 ok) |
| 19 | Burst of 3 frames without a margin zombie | held until render tick ≥ first miss + 3 (`hordeBuffer.test` F5); really gone: leaves 150 ms of render time after (tests + mutations below) |
| 20 | Clean line pays? (F4, brief 17) | harness clean: delay 100/100 (before 107–118 / 115–123), 0 freezes, 0 slowed frames, reversed 1/446; `inputQueued` 3.4 changes/s ≈ ≤ 60 B/s per phone with 4 players |
| 21 | Epic 6 timers (brief 33) | crate cancel prompt reads latest state, not the render clock; vote/dawn on the frame clock; unaffected by code read |

Before/after re-run (brief 13), same seeds 1–3 × 60 s, 150 ms ± 10 ms, load 0.3–0.5; before = master's `AdaptiveDelay`/`ServerClock` shimmed into this harness, pacing off:

| Row | Before | After |
| --- | --- | --- |
| clean, 20 Runners kiting | delay p50/p95 107–117 / 115–123, 0 freezes | 100/100, 0 freezes |
| 1 % × 200, Runners kiting | 38 freezes (6.6 / 30 s), never fired 7/459, starved 64, drained 57, reversed 31/410 (7.6 %) | 5 freezes (0.86 / 30 s), never fired 0/446, starved 90, drained 0, reversed 58/321 (18 %, 300 ms window: T10) |
| 1 % × 200, 150 Walkers standing | 35 freezes, starved 55, drained 50 | 6 freezes, starved 87 (+58 %), drained 1 |

Matches the story's table.

### Mutations (brief 6; one per new test, reverted after)

Killed (a test failed): `PLAYBACK_RATE_MAX 1.1 → 2` (R3 sweep, F1, F2); `RENDER_DELAY_MAX_MS → 150` (F1); `CLOCK_SLEW_FRACTION 0.1 → 1` (serverClock rise/fall); estimate = raw (unslewed, master-like) (serverClock ×3, F7, F2); `DELAY_FALL_AFTER_MS → 0`; `DELAY_FALL_MS_PER_S 5 → 20`; overdue rule off (NetSimHost wiring, adaptiveDelay lossy, F1); hidden-tab sample skip off; `LATENESS_PERCENTILE → 0.5`; `DELAY_MARGIN_MS → 0`; `STALL_STRETCH_MAX_MS → 0`; `HORDE_MISSING_TICKS 3 → 1`; drop at first miss (no render wait); first-miss tick overwritten per frame; `dropMissing` not called; `INPUT_SLOW_AFTER_PATCHES 3 → 1`; `INPUT_SLOW_STEP_RATE → 1` and `→ 0.5`; pacing `>` → `>=`; NetSimHost pacing ignored / `onPatch` removed / horde not fed to the clock / `newestTick` not passed; syncState `queued()` instead of `queuedAtTick()`; `inputQueued` never set; `depthAtTick` never set; overlay `delayLine` removed (`tools/checks`).

Survived: render monotonic clamp removed (`adaptiveDelay.ts` last `if`) and re-anchor `max(rt, anchor)` → `anchor` — **equivalent mutants** (rate ≥ 0.9 and a wake always has `anchor > rt`), so the clamp is belt-and-braces, not a bug; clock monotonic clamp removed — equivalent (every non-snap step is ≥ 0.9 × dt); clock snap `if (raw > next)` removed — **real gap, L3**; telegraph `Math.min(1 → 2)` — **real gap, L4**.

### Brief lines checked

1 (gate: builder full gate on 2981875; b8109fb partial, harness-only — the main session's gate covers it), 2 (copy list complete: RunState → syncState → `PLAYER_STATE_FIELDS` → fakeRoom → devThrottle by keys; not World/snapshotWorld/Predictor; bots ignore), 5 (no sim change), 6 (liveness asserts present in every new netsim test), 7 (preallocated rings/histogram; ms of the host clock; constants in netConfig with story comments), 8 (bandwidth ok), 9 (hidden tab/late start unit-only: listed Not verified), 12 (Notes for the merge present), 13 (re-run matches), 14 (lossy line used), 16 (**M1/M2**: monotonic yes; "ends exactly on the hit" not after a fall), 17 (clean line pays nothing), 18 (ok), 20 (harness imports the real StepPacing/AdaptiveDelay/ServerClock; HordeBuffer is not in the harness, which is why M1's ring overflow is invisible there), 25 (every [x] task's named tests exist — all 26 names grepped, found), 27 (1 ms stateful sweep exists in `adaptiveDelay.test.ts`; but no oscillation/fall case: M1/M2), 30 (Gate line present), 32 (`HORDE_RING_SIZE` comment stale: M1), 33 (ok).
