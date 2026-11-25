# Story 8.8: My shots count on a bad 4G line

Status: ready-for-dev

<!-- Network pass story 1 of 5 (designer 2026-11-24). Story file 2026-11-24 from the real code on master da82847; decisions pending (docs/network-pass-decisions.md). -->

## Story

As a player on a phone with a poor signal,
I want my hits to count even when the connection hiccups,
so that I'm not cheated out of kills I clearly made.

> **NETWORK PASS BRIEF** (`docs/network-pass-brief.md`): paste it verbatim into the builder and reviewer prompts. Most relevant here: 3/4 (fairness rule, beat the rule), 5 (no sim change: replays stay green), 6 (liveness: stalls really injected), 13 (before/after on the same seeds), 14 (this story CREATES the lossy line), 15 (zombies are the only rewound targets), 17 (clean lines don't pay), 20 (one harness, no copies), 22 (Epic 6 still landing).

## Acceptance Criteria

### Fairness / player-visible rule (brief 3; each is a test)

- **F1 "A hit I see on a hiccuping line counts."** A shot fired at a zombie the shooter's screen showed in the line of fire is tested against where that zombie was on the shooter's screen, up to **500 ms** back (today 300 ms). On the lossy line (1 % and 2 % × 200 ms stalls), kiting Runners show **< 5 %** reversed hits.
- **F2 "Only zombies are rewound."** Teammates, buildings and turret shots are never rewound; the Behemoth's position is rewound for players' shots exactly like a zombie's (it is a target, Story 6.5 D3); boss attacks on players always use the player's newest server position (EPIC 6 brief 21d).
- **F3 "A longer rewind never shoots through what I saw."** A rewound shot still stops at cover and barricades as they are now (they don't move), and never hits a zombie that is dead on the server, or a new zombie in a reused slot (2.12 rules unchanged).
- **F4 "Claiming an old view buys nothing extra."** A client that sends a `viewTick` older than 500 ms gets exactly 500 ms (clamped), never more; `spread_cancel_suspect` / `seq_gap_suspect` telemetry and the seq rules are unchanged.
- **F5 "A clean line is not changed."** On a clean 150 ms ± 10 ms line reversed hits stay **≤ 0.5 %** (today 0.0–0.2 %).

### Behaviour

1. **Lossy-line switch, client.** `?lag=150&jitter=20&loss=1` adds to the dev throttle (Story 2.6): with probability `loss` / 100 per message, in each direction, that message **and every message behind it** waits an extra **200 ms** (`&stall=<ms>` overrides it, 0–1000), in order (a TCP retransmit stall: never a reorder, never a dropped message). `loss` accepts 0–20 with one decimal (e.g. `0.5`). Release-safe like `?lag` (it only hurts the device that turns it on). `&loss` without `&lag` works (lag 0 + stalls). The `?debug=1` overlay line `ping … · delay … · jitter …` gains `· loss 1 % × 200` while it is on, and counts stalls injected.
2. **Lossy-line switch, bots.** `npm run bots -- --lag 150 --jitter 20 --loss 1 [--stall 200]` puts the same line between the bots and `--url` (an in-process TCP line built from `tools/netaudit/lagProxy.ts`'s proxy, stalls in **both** directions, ordered), localhost targets only (refused for a remote `--url` with a clear message). The bots' summary prints stalls injected per direction.
3. **Lossy-line switch, harness.** `tools/netsim/hitsSim.ts` gains `Options.loss?: { pct: number; stallMs: number }` (the audit's model, both directions); `tools/netaudit/hitsLossSim.ts` is merged back and **deleted**, `tools/netaudit/runHits.ts` imports `tools/netsim/hitsSim.ts`, and `tools/netaudit/README.md` says so.
4. **Rewind window 500 ms.** `REWIND_MAX_TICKS` 6 → **10** (`packages/shared/src/config/constants.ts`) and `REWIND_CAP_MS` 300 → **500** (`apps/server/src/net/limits.ts`), moved together (audit H1: the cap is `min` of both, `RunController.ts:66`). `ZOMBIE_HISTORY_TICKS` follows (12 rows) and so do the Behemoth's history rows (`boss/bossState.ts` uses the same constant). Comments in both files say "Story 8.8, network audit §3.5".
5. **Harness numbers (the ACs from `epics.md`).** At 150 ms ± 10 ms, Pistol, 3 seeds × 60 s:
   - kiting 20 Runners, 1 % × 200 ms: reversed **< 5 %** (audit before: 7.6 %; one-off after: 2.0 %);
   - kiting 20 Runners, 2 % × 200 ms: **< 5 %** (before 11.9 %; one-off after 1.3 %);
   - kiting 150 Walkers, 1 % and 2 % × 200 ms: **< 5 %** (before 2.3 % / 3.5 %);
   - clean line, all three cases: **≤ 0.5 %** (before 0.0–0.2 %);
   - recorded but not asserted: the 1 % × 400 ms rows (before 6.3–12.7 %) and "predicted shots that never fired on the server" (before 7–26 per 459: Story 8.9 owns that number).
6. **Budgets.** `tickCostRewind.test.ts` (rewind adds ≤ 1 ms p99, `PERF_ASSERT=1`) still passes with the 12-row history; record before/after p99 and load. History memory: 256 slots × 12 rows × 2 × 4 B ≈ 24 KB per room (was 16 KB).
7. **No sim change.** Solo never records history (unchanged); the replay digest tests (Story 4.4), every sim test and every netsim test stay green; only tests that pin the old window (`REWIND_CAP_TICKS` = 6, view offset p95 < 6 ticks) are updated, each with a comment naming this story.

## Tasks / Subtasks

- [ ] **T1 Before numbers** (AC 5; brief 13): on the master you branched from, run `npx tsx tools/netaudit/runHits.ts 60 3` (it already has the loss model) and keep the table. Record load.
- [ ] **T2 Harness loss model** (AC 3): add `loss` to `tools/netsim/hitsSim.ts` (the diff against `hitsLossSim.ts` is ~6 lines: `Options.loss`, the `Link` constructor arg, the `stall` term in `due`); switch `runHits.ts` to it; delete `hitsLossSim.ts`; update `tools/netaudit/README.md`. Existing `tools/netsim/hits.test.ts` runs unchanged (no `loss` = today).
- [ ] **T3 Rewind 500 ms** (AC 4, F1–F4): the two constants + comments; update `RunController.test.ts:536` (`REWIND_CAP_TICKS` 6 → 10) and `tools/netsim/hits.test.ts:122` (view-offset p95 < 6 → < 10, comment: "fits the 500 ms cap"). Grep for other pins: `grep -rn "REWIND_MAX_TICKS\|REWIND_CAP\|toBe(6)" packages apps tools` (rewind, spread, shotgun, flame, cosmeticProjectiles tests use the constant, not the number: they follow).
- [ ] **T4 New netsim tests** (AC 5, F1, F5; brief 6): in `tools/netsim/hits.test.ts` a `describe("Story 8.8: lossy line")` with the Runner 1 % / 2 %, Walker 1 % / 2 % and clean rows asserting the numbers above; liveness: stalls injected > 0 per run, apparent hits > 300 per row, and over-cap shots (shots whose asked view was older than the cap) are reported and **fewer** than before. Mark the 2 % rows `.concurrent` only if the file already does; keep the `testTimeout` budget (30 s per test; split seeds if needed).
- [ ] **T5 Fairness tests** (F2–F4): in `packages/shared/src/combat/rewind.test.ts`: a `viewTick` 12 ticks old is clamped to 10; a teammate standing where a zombie was 8 ticks ago is not hit by the rewound shot; a zombie killed 3 ticks ago is not hit at its 8-ticks-ago spot; a shot rewound 9 ticks still stops at a barricade present now (buildings only change in a build phase, so "now" and "then" agree mid-wave); the Behemoth is hit at its 8-ticks-ago position (boss history row) when the view says so.
- [ ] **T6 Dev throttle `&loss`** (AC 1): `urlOptions.ts › parseThrottle` reads `loss` (0–20, one decimal) and `stall` (0–1000 ms, default 200); `DevThrottleOptions` gains `lossPct`, `stallMs`; in `DevThrottle` both directions draw `random() * 100 < lossPct` per message and add `stallMs` to that message's `dueFrom`; the ordered `max(lastDue, …)` makes everything behind it wait (that IS the head-of-line model: no extra code). Count `stallsIn`/`stallsOut`; overlay text. Tests in `devThrottle.test.ts` with an injected `random`/`now`: a stall delays the stalled message and the next ones, order kept, a 128-queue overflow still delivers the oldest early (hidden tab), `loss=0` is today's behaviour bit for bit.
- [ ] **T7 Bots `--lag/--jitter/--loss/--stall`** (AC 2): move `lagProxy.ts`'s proxy core (ordered delay + stall, no stream parsing) into `tools/netaudit/lagLine.ts` (exported `startLagLine({ listen: 0, target, rttMs, jitterMs, lossPct, stallMs })` → `{ port, stats(), close() }`), with stalls in **both** directions (today only server→client); `lagProxy.ts` keeps its CLI and report on top of it; `tools/bots/run.ts` adds the four flags to `FLAGS`, starts the line on an ephemeral port in front of a localhost `--url` and points the bots at it. A small test (`tools/netaudit/lagLine.test.ts`) pipes bytes through it: order kept, a forced stall delays later chunks, close frees the port.
- [ ] **T8 Bot run on the lossy line** (brief 13, 14): 4 bots, `--scenario net150 --until-wave 5 --hold-fire 45 --lag 150 --jitter 20 --loss 1`, before and after: record `net_stats`, `horde_stats` (`framesSkipped`) and the server's `spread_cancel_suspect` / `seq_gap_suspect` counts (must not rise). Bots don't count reversed hits (the harness does); this run proves the switch works end to end.
- [ ] **T9 Docs** : `docs/perf/network-pass-2026-11.md` § 8.8 (before/after table, load, commands); `game-architecture.md` lag-compensation line already has a Network pass note: change "300 ms" to "500 ms (Story 8.8)"; HANDOFF §2 "What the game does today" online line: `?lag=&jitter=&loss=`.
- [ ] **T10 Gate + hand-back** (brief 1, 12).

## Dev Notes

### Current state (read before changing)

- **Rewind (Story 2.12).** `packages/shared/src/combat/rewind.ts`: the server records every zombie slot's position per tick into `world.zombieHistory` (rows = `ZOMBIE_HISTORY_TICKS` = `REWIND_MAX_TICKS + 2` = 8 today); `rewindTicksFor(world, p, input)` returns how far back this input's shots look (`0` when `p.rewindMaxTicks <= 0` = solo or `DEV_NO_REWIND`, or the history doesn't reach); `rewoundView` gives positions at a fractional tick. `firing.ts` uses it for shots, swings and touch aim assist. Only positions are rewound; damage, push-back and kills apply to the present zombie (dead now = not hit; reused slot = not hit). Buildings, players and turret shots are never rewound (comment at `rewind.ts:8-15`).
- **The cap.** `apps/server/src/run/RunController.ts:66` `REWIND_CAP_TICKS = Math.min(REWIND_MAX_TICKS, floor(REWIND_CAP_MS / 50))` → 6; set per player at `RunController.ts:300` (`addPlayer(...).rewindMaxTicks = lagComp ? REWIND_CAP_TICKS : 0`). Raising only `REWIND_CAP_MS` does nothing (audit H1, refuted by measurement).
- **Boss.** `packages/shared/src/boss/bossState.ts:111,152-154`: `histX/histY/histTick` with `ZOMBIE_HISTORY_TICKS` rows; shots rewind to it (6.5 D3); boss attacks never rewind (6.5 F4, `bossState.ts:253`). Both follow the constant: no code change, one test (T5).
- **Why the longer window is safe** (audit F1): `limits.ts:35-40` says the 300 ms cap is "the rewind an honest 300 ms-ping player gets"; rewind caps elsewhere protect the player being shot (Valorant, audit [14]); here the targets are zombies, so nobody is wronged. A cheater claiming an old view gains at most 500 ms of "aim at where it was" against zombies: it only helps their team, and the seq rules (2.12 re-review M-A) still stop seq picking.
- **Why after a stall shots are old** (audit F1): a 200 ms TCP stall holds every later input; the server applies one input per tick, so ~4 extra inputs queue (`INPUT_QUEUE_MAX` 6, `INPUT_DRAIN_AFTER_TICKS` 40 = 2 s before the drain); during that time a shot's view is RTT/2 + queue + render delay ≈ 75 + 200 + 140 ms > 300 ms. Story 8.9 shrinks the queue part; this story widens the window.
- **Harness.** `tools/netsim/hitsSim.ts` (467 lines) runs the real server `RunController` + the real client Predictor, fire clock, `ServerClock`, `AdaptiveDelay`, `viewTickOf` in virtual time over an ordered `Link` (one-way ± jitter). `tools/netaudit/hitsLossSim.ts` is a copy with one addition (diff: `Options.loss`, `Link(…, loss)`, `stall` term). `tools/netsim/hits.test.ts` holds the 2.7/2.12 assertions (`pct(on) < 5` for kiting Runners on a clean line; `offs p95 < 6` at line 122).
- **Dev throttle.** `apps/client/src/net/devThrottle.ts` (356 lines): `DevThrottle` wraps the room (`throttled()` in `apps/client/src/main.ts:120`), pooled 128-entry queues per direction (`THROTTLE_QUEUE_SIZE`), ordered (`due = max(lastDue, now + lag/2 + u)`), pumped from the game loop's `PRE_STEP`; a full queue delivers its oldest at once. `?lag/&jitter` parsing: `apps/client/src/debug/urlOptions.ts:193-202` (`parseMs`, caps `MAX_THROTTLE_LAG_MS` 2000, `MAX_THROTTLE_JITTER_MS` 1000).
- **Bots.** `tools/bots/run.ts` (flags list at line ~39: unknown flags are refused); `tools/bots/botClient.ts` connects with `@colyseus/sdk` `Client` straight to `--url`. No throttle today (audit F10).
- **Lag proxy.** `tools/netaudit/lagProxy.ts` (311 lines): CLI TCP proxy, ordered delay, `--stall-prob/--stall-ms` **server→client only** today, plus WebSocket frame parsing for the audit's report. This story extracts the line part and adds client→server stalls.

### What must be preserved

- Solo records nothing and rewinds nothing; `DEV_NO_REWIND=1` still turns it off.
- `SHOT_ADVANCE_CAP_MS` (150) is a different rule (first sweep advance): unchanged.
- The input seq rules, `INPUT_SEQ_RESYNC_AFTER`, `spread_cancel_suspect` / `seq_gap_suspect` logging: unchanged.
- `?lag=&jitter=` without `&loss` behaves bit for bit as today (test with a fixed `random`).
- The audit's `lagProxy.ts` CLI and JSON report keep working (other tools and the audit's §8 commands use it).

### Decisions to confirm (designer: "ok" or by code; recommended value first)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.8 D1 | How far back the server may look for a shot | **500 ms** (measured: Runners 7.6 → 2.0 %, 11.9 → 1.3 %); Story 8.9 may raise it to 600 ms if its longer render delay needs it (600 ms now, before 8.9 measures) |
| 8.8 D2 | What one "lost packet" costs in the test switch | **200 ms stall** (about one 4G retransmit, the audit's main rows); `&stall=400` for the worse case (400 ms as the default) |
| 8.8 D3 | The Behemoth with the longer window | **Same 500 ms as zombies** (it's a target, players are never the victim) (keep the boss at 300 ms) |
| 8.8 D4 | Who can turn on `&loss` | **Anyone, release builds too, like `?lag`** (it only hurts the phone that turns it on; Wi-Fi testers in your 4-phone test need it on hordes.sevend.io) (dev builds only) |
| 8.8 D5 | The bots' bad line | **Built into `npm run bots` (`--lag --jitter --loss`)**, stalls both ways (keep the separate proxy command, one direction) |

### Beat the rule (reviewer start list; brief 4)

1. Send `viewTick` = 0 or a huge old value from a modified client: clamped to 10 ticks? Logged?
2. Stand behind a car, wait until a zombie walks past the gap, shoot "into the past" at where it was 450 ms ago: does the shot stop at the car (cover is the same now and then)?
3. A zombie dies, its slot is reused within 500 ms by a new zombie at a different spot: can an old-view shot hit the new one?
4. Shoot at a teammate's position from 400 ms ago where a zombie was: no friendly-fire on the rewound position (friendly fire 50 % uses present positions; Story 5.4).
5. Rewound touch aim assist: does it lock a zombie that is now behind cover or dead?
6. Behemoth: shoot where it was 480 ms ago mid-charge: hit counts (D3), but its charge still hits you at your newest position.
7. Flood inputs during a stall to push more shots into the window: input bucket 25/s and the seq rule still bound it (2.12).
8. `&loss=20&stall=1000` on a phone: does anything other than that phone suffer (server tick, other players' bytes)?
9. Mutate: set `REWIND_MAX_TICKS` back to 6 → the lossy Runner rows must fail; set the loss pct to 0 in the test → the liveness assertion (stalls > 0) must fail.

### Measurements (brief 13) — fill in

| Case (150 ms ± 10 ms, Pistol, 3 × 60 s) | Line | Before (master) | After |
| --- | --- | --- | --- |
| 20 Runners kiting | clean | (audit 0.2 %) | ≤ 0.5 % |
| | 1 % × 200 ms | (audit 7.6 %) | < 5 % (one-off 2.0 %) |
| | 2 % × 200 ms | (audit 11.9 %) | < 5 % (one-off 1.3 %) |
| | 1 % × 400 ms | (audit 12.7 %) | record |
| 150 Walkers kiting | clean / 1 % / 2 % | (0.2 / 2.3 / 3.5 %) | ≤ 0.5 / < 5 / < 5 % |
| 150 Walkers standing | clean / 1 % / 2 % | (0.0 / 1.6 / 1.8 %) | record |
| Shots over the cap | 1 % × 200 ms Runners | (audit 50 %) | record (lower) |
| tickCostRewind p99 added | — | record | ≤ 1 ms |

### Files (expected)

- `packages/shared/src/config/constants.ts` (REWIND_MAX_TICKS), `apps/server/src/net/limits.ts` (REWIND_CAP_MS), `apps/server/src/run/RunController.test.ts`, `packages/shared/src/combat/rewind.test.ts`
- `tools/netsim/hitsSim.ts`, `tools/netsim/hits.test.ts`, delete `tools/netaudit/hitsLossSim.ts`, `tools/netaudit/runHits.ts`, `tools/netaudit/README.md`, new `tools/netaudit/lagLine.ts` (+ test), `tools/netaudit/lagProxy.ts`
- `apps/client/src/net/devThrottle.ts` (+ test), `apps/client/src/debug/urlOptions.ts` (+ test), `apps/client/src/main.ts` (`throttled()` passes the new options), `apps/client/src/debug/PerfOverlay.ts` (one line)
- `tools/bots/run.ts`
- docs: `docs/perf/network-pass-2026-11.md` (new), `game-architecture.md`, `HANDOFF.md` (one line)

**Not touched (8.9 owns):** `adaptiveDelay.ts`, `serverClock.ts`, `netConfig.ts` (keep loss constants in `devThrottle.ts`/`urlOptions.ts`, not `netConfig.ts`, so 8.9 runs in parallel without conflicts), `hordeBuffer.ts`, `snapshots.ts`, `NetSimHost.ts`, `INPUT_DRAIN_*`.

### Epic 6: check at build time (brief 22)

- 6.8 (car alarm "shoot the armed car", stampede Runners), 6.9 (gas tank "shoot after 3 s"): levers are static map objects (not rewound) and stampede Runners are zombies (rewound like any). Grep the merged 6.8/6.9 code for any new rewound target or a test that pins 6 rewind ticks.
- If 6.9–6.12 add new tests that use `REWIND_CAP_TICKS` numerically, update them here.

### Notes for the merge (brief 12)

- `constants.ts` / `limits.ts`: two numbers; every test that read the constant follows.
- `hitsSim.ts`: additive option; 8.9 will add its playback-rate and queue-slow-down to the same harness (merge 8.8 first).
- `devThrottle.ts`: additive options; 8.10 later changes `THROTTLE_BYTES_MAX` in `netConfig.ts` (no overlap).
- `tools/bots/run.ts`: four flags; 8.1 adds a `--drop-after/--drop-for` cut switch (T of 8.1) on the same line module.

### Dependencies

None before it. 8.9 (parallel) uses the `loss` option of the harness and the throttle for its final measurement: 8.9 merges 8.8 before its last run. 8.1, 8.10, 8.11 test on this line.

### Suggested build round

Round 1, in parallel with 8.9 (different files; see `docs/network-pass-decisions.md` › Build rounds). Effort S (≈ half a builder session).

### References

- `docs/perf/network-audit-2026-11.md` §2 (rewind), §3.5 (table and one-off), §4 F1, F2, F10, H1, H2, §6 #1, #2, §8 (commands)
- `_bmad-output/planning-artifacts/epics.md` › Epic 8 › Story 8.8; `sprint-change-proposal-2026-11-24-network-pass.md`
- Story 2.12 file `_bmad-output/implementation-artifacts/2-12-*.md` (rewind design, re-review M-A seq rule); Story 6.5 D3 (boss rewind)
- `docs/network-pass-brief.md`, `docs/network-pass-decisions.md`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.8 D1–D5 pending.

### File List

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending).
