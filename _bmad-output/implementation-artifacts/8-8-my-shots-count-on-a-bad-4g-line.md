# Story 8.8: My shots count on a bad 4G line

Status: review

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

- [x] **T1 Before numbers** (AC 5; brief 13): on the master you branched from, run `npx tsx tools/netaudit/runHits.ts 60 3` (it already has the loss model) and keep the table. Record load.
- [x] **T2 Harness loss model** (AC 3): add `loss` to `tools/netsim/hitsSim.ts` (the diff against `hitsLossSim.ts` is ~6 lines: `Options.loss`, the `Link` constructor arg, the `stall` term in `due`); switch `runHits.ts` to it; delete `hitsLossSim.ts`; update `tools/netaudit/README.md`. Existing `tools/netsim/hits.test.ts` runs unchanged (no `loss` = today).
- [x] **T3 Rewind 500 ms** (AC 4, F1–F4): the two constants + comments; update `RunController.test.ts:536` (`REWIND_CAP_TICKS` 6 → 10) and `tools/netsim/hits.test.ts:122` (view-offset p95 < 6 → < 10, comment: "fits the 500 ms cap"). Grep for other pins: `grep -rn "REWIND_MAX_TICKS\|REWIND_CAP\|toBe(6)" packages apps tools` (rewind, spread, shotgun, flame, cosmeticProjectiles tests use the constant, not the number: they follow).
- [x] **T4 New netsim tests** (AC 5, F1, F5; brief 6): in `tools/netsim/hits.test.ts` a `describe("Story 8.8: lossy line")` with the Runner 1 % / 2 %, Walker 1 % / 2 % and clean rows asserting the numbers above; liveness: stalls injected > 0 per run, apparent hits > 300 per row, and over-cap shots (shots whose asked view was older than the cap) are reported and **fewer** than before. Mark the 2 % rows `.concurrent` only if the file already does; keep the `testTimeout` budget (30 s per test; split seeds if needed).
- [x] **T5 Fairness tests** (F2–F4): in `packages/shared/src/combat/rewind.test.ts`: a `viewTick` 12 ticks old is clamped to 10; a teammate standing where a zombie was 8 ticks ago is not hit by the rewound shot; a zombie killed 3 ticks ago is not hit at its 8-ticks-ago spot; a shot rewound 9 ticks still stops at a barricade present now (cover is tested as it is now; review R4: buildings CAN break mid-wave, so a barricade broken in the last 500 ms no longer blocks a rewound shot — decision 8.8 B1); the Behemoth is hit at its 8-ticks-ago position (boss history row) when the view says so.
- [x] **T6 Dev throttle `&loss`** (AC 1): `urlOptions.ts › parseThrottle` reads `loss` (0–20, one decimal) and `stall` (0–1000 ms, default 200); `DevThrottleOptions` gains `lossPct`, `stallMs`; in `DevThrottle` both directions draw `random() * 100 < lossPct` per message and add `stallMs` to that message's `dueFrom`; the ordered `max(lastDue, …)` makes everything behind it wait (that IS the head-of-line model: no extra code). Count `stallsIn`/`stallsOut`; overlay text. Tests in `devThrottle.test.ts` with an injected `random`/`now`: a stall delays the stalled message and the next ones, order kept, a 128-queue overflow still delivers the oldest early (hidden tab), `loss=0` is today's behaviour bit for bit.
- [x] **T7 Bots `--lag/--jitter/--loss/--stall`** (AC 2): move `lagProxy.ts`'s proxy core (ordered delay + stall, no stream parsing) into `tools/netaudit/lagLine.ts` (exported `startLagLine({ listen: 0, target, rttMs, jitterMs, lossPct, stallMs })` → `{ port, stats(), close() }`), with stalls in **both** directions (today only server→client); `lagProxy.ts` keeps its CLI and report on top of it; `tools/bots/run.ts` adds the four flags to `FLAGS`, starts the line on an ephemeral port in front of a localhost `--url` and points the bots at it. A small test (`tools/netaudit/lagLine.test.ts`) pipes bytes through it: order kept, a forced stall delays later chunks, close frees the port.
- [x] **T8 Bot run on the lossy line** (brief 13, 14): 4 bots, `--scenario net150 --until-wave 5 --hold-fire 45 --lag 150 --jitter 20 --loss 1`, before and after: record `net_stats`, `horde_stats` (`framesSkipped`) and the server's `spread_cancel_suspect` / `seq_gap_suspect` counts (must not rise). Bots don't count reversed hits (the harness does); this run proves the switch works end to end.
- [x] **T9 Docs** : `docs/perf/network-pass-2026-11.md` § 8.8 (before/after table, load, commands); `game-architecture.md` lag-compensation line already has a Network pass note: change "300 ms" to "500 ms (Story 8.8)"; HANDOFF §2 "What the game does today" online line: `?lag=&jitter=&loss=`.
- [x] **T10 Gate + hand-back** (brief 1, 12).

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

All five accepted by the designer on 2026-11-24 ("I'm okay with everything", `docs/network-pass-decisions.md`): built with the recommended values.

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.8 D1 | How far back the server may look for a shot | **500 ms** (measured: Runners 7.6 → 2.0 %, 11.9 → 1.3 %); Story 8.9 may raise it to 600 ms if its longer render delay needs it (600 ms now, before 8.9 measures) |
| 8.8 D2 | What one "lost packet" costs in the test switch | **200 ms stall** (about one 4G retransmit, the audit's main rows); `&stall=400` for the worse case (400 ms as the default) |
| 8.8 D3 | The Behemoth with the longer window | **Same 500 ms as zombies** (it's a target, players are never the victim) (keep the boss at 300 ms) |
| 8.8 D4 | Who can turn on `&loss` | **Anyone, release builds too, like `?lag`** (it only hurts the phone that turns it on; Wi-Fi testers in your 4-phone test need it on hordes.sevend.io) (dev builds only) |
| 8.8 D5 | The bots' bad line | **Built into `npm run bots` (`--lag --jitter --loss`)**, stalls both ways (keep the separate proxy command, one direction) |
| 8.8 B1 | A barricade broken (0 HP, mid-wave) within the 500 ms window before a rewound shot | **The shot passes where it stood** (cover tested as it is now; team-only gain; existed at 300 ms) — **auto-accepted overnight (designer: follow the GDS recommendation)**, review R4 (strict: remember the break tick and block older rewound shots) |

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
Measured 2026-11-25, `npx tsx tools/netaudit/runHits.ts 60 3`; before on master `c57c1cc` (identical to the audit's numbers), after on `story-8-8`; load 0.1–0.6 on 4 cores both times. Full table: `docs/perf/network-pass-2026-11.md` § 8.8.

| Case (150 ms ± 10 ms, Pistol, 3 × 60 s) | Line | Before (master c57c1cc) | After (story-8-8) |
| --- | --- | --- | --- |
| 20 Runners kiting | clean | 0.2 % | **0.2 %** |
| | 1 % × 200 ms | 7.6 % | **2.0 %** |
| | 2 % × 200 ms | 11.9 % | **1.3 %** |
| | 1 % × 400 ms | 12.7 % | 7.2 % (record) |
| 150 Walkers kiting | clean / 1 % / 2 % | 0.2 / 2.3 / 3.5 % | **0.2 / 1.8 / 2.1 %** |
| | 1 % × 400 ms | 10.0 % | 12.6 % (record; see Completion Notes) |
| 150 Walkers standing | clean / 1 % / 2 % | 0.0 / 1.6 / 1.8 % | 0.0 / 2.2 / 2.0 % (record) |
| | 1 % × 400 ms | 6.3 % | 8.9 % (record) |
| Shots over the cap | 1 % × 200 ms Runners | 50 % (cap 6) | **0 %** (cap 10); 2 %: 73.3 → 0 %; 1 % × 400: 64.3 → 4.7 % |
| tickCostRewind added work p99 (`PERF_ASSERT=1`) | — | 0.054 ms (load 0.01) | **0.060 ms** (load 0.01); rewind ON p99 0.674 → 0.771 ms vs OFF 0.681 → 0.719 ms (noise ±0.1) |
| Bots, 4 × net150 waves 4–5, lossy line | — | master `lagProxy.ts` 1 % × 200 ms server→client only: 299 stalls; 0 `spread_cancel_suspect`, 0 `seq_gap_suspect`, `framesSkipped` 0 | `--lag 150 --jitter 20 --loss 1`: 97 up / 236 down stalls; 0 / 0 suspect logs, `framesSkipped` 0 |
| History memory | — | 8 rows ≈ 16 KB / room | 12 rows ≈ 24 KB / room (256 × 12 × 2 × 4 B) + 12 boss rows |

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

Claude (builder cloud session, `gds-dev-story` flow), 2026-11-25 overnight autonomous run.

### Gate

`npm run typecheck && npm run lint && npm test && npm run build` on `ddce305` (story-8-8 merged with master b0e491a): **green** — 398 test files passed (1 skipped), 3679 tests passed (3 skipped), build OK; load 0.34 at start, 3.98 at the end (4 cores, nothing else running). Only docs (this story file, sprint-status) changed after the gate.

### Tasks → tests (brief line 25)

- **T1** before table: `npx tsx tools/netaudit/runHits.ts 60 3` on master c57c1cc (load 0.12), identical to the audit's §3.5 numbers; in the measurement table above and `docs/perf/network-pass-2026-11.md`.
- **T2** harness loss model: `tools/netsim/hitsSim.ts` (`Options.loss`, `Link(…, loss)`, `Result.stalls`); `tools/netaudit/hitsLossSim.ts` deleted; `runHits.ts` imports the real harness + `REWIND_CAP_TICKS`. Tests: `tools/netsim/hits.test.ts` › every existing test unchanged (no `loss` = no extra rng draw); merged harness reproduces the copy's 12 rows bit for bit (checked by diff of the two JSON outputs). Commit df00ed4 pushed early for 8.9.
- **T3** rewind 500 ms: `constants.ts` `REWIND_MAX_TICKS` 10, `limits.ts` `REWIND_CAP_MS` 500. Tests: `apps/server/src/run/RunController.test.ts` › "lag compensation is on by default: history recorded, rewind capped at 500 ms; off: neither (Story 2.12)" (`REWIND_CAP_TICKS` 10); `tools/netsim/hits.test.ts` › "kiting 20 Runners at 150 ms RTT: the rewind brings reversed hits under 5 %…" (view offset p95 < 10); `packages/shared/src/combat/rewind.test.ts` › "the rewind is clamped to the cap; …", "past the cap, the rest of the view offset is the 2.7 shot advance …", "is deterministic with the real zombie AI …" (rows = `ZOMBIE_HISTORY_TICKS`) — each updated with a Story 8.8 comment.
- **T4** netsim lossy line: `tools/netsim/hits.test.ts` › describe "Story 8.8: lossy line (1 % / 2 % × 200 ms head-of-line stalls)" › "20 Runners kiting: clean line ≤ 0.5 % …", "20 Runners kiting: 1 % × 200 ms stalls < 5 % reversed (the 500 ms window)", "… 2 % …", and the same three for "150 Walkers kiting" (liveness: stalls up/down > 10 × pct, apparent > 300, over-cap < 5 %).
- **T5** fairness: `packages/shared/src/combat/rewind.test.ts` › describe "Story 8.8: the 500 ms rewind window is fair" › "the window is 10 ticks (500 ms); a view 12 ticks old (or tick 0) is clamped to 10, never more" (F4), "an 8-tick-old view hits the zombie where it was; a teammate standing on that spot now is not hurt" (F2), "a zombie killed 3 ticks ago is not hit at its 8-ticks-ago spot; a slot reused since is not hit either" (F3), "a shot rewound 9 ticks still stops at a barricade standing there now (buildings are never rewound)" (F3), "the Behemoth is hit where it was 8 ticks ago (its own 12-row history); without a view tick it is missed" (F2 / D3).
- **T6** dev throttle `&loss`: `apps/client/src/net/devThrottle.test.ts` › describe "DevThrottle: Story 8.8 lossy line (&loss, &stall)" › "a stalled incoming message waits the extra 200 ms, and every message behind it waits too, in order", "outgoing inputs stall the same way (both directions), with &stall=400", "a full queue still delivers its oldest at once while stalled (hidden tab)", "loss 0 is the Story 2.6 throttle bit for bit: same arrivals, same random draws", "the overlay suffix shows the line and counts the stalls; nothing when off"; `apps/client/src/debug/urlOptions.test.ts` › "parseUrlOptions: Story 8.8 lossy line" › "reads &loss (0–20, one decimal) and &stall (0–1000 ms, default 200)", "a bad &loss is off (0); a bad &stall is the default; &stall alone turns nothing on". Wiring (`main.ts › throttled()` passes `lossPct`/`stallMs` and sets `activeThrottle`; `PerfOverlay` reads it): checked live in the two-tab smoke (overlay `loss 1 % × 200 (stalls ↓19 ↑5)`); no unit test fails if the `main.ts` line is deleted (main.ts is the app entry, not unit-testable here) — listed under Not verified.
- **T7** bots line: `tools/netaudit/lagLine.ts` (+ `lagProxy.ts` on top), `tools/bots/run.ts` flags, `tools/bots/lineArgs.ts`. Tests: `tools/netaudit/lagLine.test.ts` › "keeps the byte order with jitter (never a reorder, never a lost byte), delayed by about half the RTT", "a forced stall delays that chunk and every later one, in each direction, in order", "close frees the port and drops the connections"; `tools/bots/lineArgs.test.ts` › "off without --lag/--jitter/--loss; …", "reads the lossy line (default stall 200 ms)", "refuses a remote --url with a clear message, and out-of-range values". End to end: T8 runs.
- **T8** bots on the lossy line, before (master lagProxy, down-only stalls) / after (`--lag 150 --jitter 20 --loss 1`): measurement table above (0 suspect logs both, framesSkipped 0 both, stalls 299 down vs 97 up / 236 down).
- **T9** docs: `docs/perf/network-pass-2026-11.md` § 8.8 (new file), `game-architecture.md` (two lines), `HANDOFF.md` (two lines), `epics.md` (one line), `tools/netaudit/README.md`; smoke report `docs/perf/network-pass-smoke-2026-11-25.md` (brief line 34).
- **T10** gate + hand-back: see Gate.

### Debug Log References

- Mutation (brief 6): `REWIND_MAX_TICKS` 6 + `REWIND_CAP_MS` 300 → all 4 Story 8.8 fairness tests and all 4 lossy netsim rows fail (Runners on reversed %, Walkers on over-cap/the cap assert); loss pct 0 in a lossy row → the stalls > 0 assertion fails (by construction).
- First smoke try refused with `balance_mismatch`: a server dev balance override (`DEV_ZOMBIE_DAMAGE_SCALE`) needs the client's `&zdmg` and the bots can't send it; ran without it.

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.8 D1–D5 accepted by the designer 2026-11-24 (all recommended values). No new decision was needed while building (nothing auto-accepted).
- Harness after: Runners 7.6 → 2.0 % (1 %), 11.9 → 1.3 % (2 %); Walkers kiting 2.3 → 1.8 %, 3.5 → 2.1 %; clean rows unchanged (0.0–0.2 %); shots over the cap 50–73 % → 0 %.
- **Finding for 8.9 (recorded rows, not ACs):** with 1 % × **400 ms** stalls the longer window helps Runners (10.4 → 6.7 %, 10 extra seeds) but costs dense Walker crowds about 1 pp (kiting 10.3 → 11.7 %, standing 6.5 → 7.2 %). Those rows have 92–106 input overflow drops each and some shots still ask for > 500 ms; the input backlog/catch-up work in 8.9 is where they move. Standing Walkers at 1 % × 200 ms also read 1.6 → 2.2 % (record row, within noise of 7–10 hits per 450).
- Beat the rule (self-check before review): 1 viewTick 0 / 12 ticks old → clamped to 10 (test); 2 cover: barricade test, map boxes use the same `bulletBlockT` (present geometry); 3 reused slot: generation test at 8 ticks; 4 teammate: bullets never test players, test asserts HP and no `player.damaged`; 5 touch aim assist: `assistAim` keeps `isZombieAlive` (present) and `bulletLineClear` (present cover) against the rewound position (unchanged code); 6 Behemoth: rewound for shots (test), boss attacks untouched (`bossState.ts` F4 code unchanged); 7 input flood: the seq rule and input bucket are untouched; 8 `&loss=20&stall=1000` only changes that tab's `DevThrottle` (client only); 9 mutations above.
- Bandwidth (brief 8): no wire change; the throttle / bots line add 0 B/s.
- Epic 6 check (brief 22): grep of merged master for rewound targets / `REWIND_CAP_TICKS` numeric pins: none beyond the ones updated; 6.8/6.9 levers (armed car, gas tank) are static (not rewound), stampede Runners are ordinary zombies.
- Brief addendum (Epic 6 retro, lines 25–35) acknowledged and applied: 25 (named tests above), 30 (gate line), 32 (HANDOFF/epics/architecture text), 33 (no pacing / budget / clock change; vote/crate/boss tests in the gate), 34 (two-tab smoke report).

### Notes for the merge

- `packages/shared/src/config/constants.ts`, `apps/server/src/net/limits.ts`: two numbers + comments; every test reading the constants follows. 8.9 may raise the window to 600 ms (decision 8.8 D1 note): change both together (`REWIND_CAP_TICKS` = min of both).
- `tools/netsim/hitsSim.ts`: additive (`Options.loss`, `Result.stalls`); no `loss` = no extra rng draw. 8.9 adds playback rate / queue slow-down here: merge 8.8 first (or cherry-pick df00ed4).
- `tools/netsim/hits.test.ts`: `runSeeds` now also sums `serverShotSeqs`, `localShotSeqs`, `stalls`; new describe at the end; one assert 6 → 10.
- `apps/client/src/net/devThrottle.ts`: additive options (`lossPct`, `stallMs`), new exports `DEFAULT_STALL_MS`, `MAX_THROTTLE_LOSS_PCT`, `MAX_THROTTLE_STALL_MS`, `activeThrottle`, `throttleLossText`; constants kept out of `netConfig.ts` (8.9 / 8.10 own it).
- `apps/client/src/debug/urlOptions.ts`: `throttle` gains `lossPct`, `stallMs`; `parseThrottle`/`parseLossPct` exported. Anyone constructing `UrlOptions.throttle` by hand must add the two fields.
- `apps/client/src/main.ts` (`throttled()`: 3 lines), `apps/client/src/debug/PerfOverlay.ts` (1 import, 1 line), `apps/client/src/debug/netSummary.ts` (throttle string).
- `tools/bots/run.ts`: four flags + `startLine`; `tools/bots/lineArgs.ts` new. 8.1's `--drop-after/--drop-for` cut switch belongs on `lagLine.ts` (per-connection hooks `onConnection` are there for it).
- `tools/netaudit/lagProxy.ts`: same CLI and report; stalls now both directions (report adds `stallsUp`).
- Docs: `docs/perf/network-pass-2026-11.md` is new with § 8.8 only — 8.9 adds its own section (append, don't rewrite).

### Not verified

- Real phones, real 4G, iOS Safari (brief 23): the lossy line is a model (ordered HOL stalls); the designer's 4-phone test decides.
- The evacuation vote on the lossy line in a browser: the smoke could not reach it (team wiped before beating the Behemoth in all three tries); vote tests ran in the gate.
- A unit test that fails when the `main.ts › throttled()` line passing `lossPct`/`stallMs` is deleted (brief 26): main.ts is the app entry; checked live in the smoke only.
- Feel of the 500 ms window with a human (headless smoke has no aiming player).
- 1 % × 400 ms rows (see Completion Notes): longer window slightly worse for Walker crowds; left to 8.9.

### File List

- `packages/shared/src/config/constants.ts`, `apps/server/src/net/limits.ts`
- `packages/shared/src/combat/rewind.test.ts`, `apps/server/src/run/RunController.test.ts`
- `tools/netsim/hitsSim.ts`, `tools/netsim/hits.test.ts`
- `tools/netaudit/hitsLossSim.ts` (deleted), `tools/netaudit/runHits.ts`, `tools/netaudit/README.md`, `tools/netaudit/lagLine.ts` (new), `tools/netaudit/lagLine.test.ts` (new), `tools/netaudit/lagProxy.ts`
- `tools/bots/run.ts`, `tools/bots/lineArgs.ts` (new), `tools/bots/lineArgs.test.ts` (new)
- `apps/client/src/net/devThrottle.ts`, `apps/client/src/net/devThrottle.test.ts`, `apps/client/src/debug/urlOptions.ts`, `apps/client/src/debug/urlOptions.test.ts`, `apps/client/src/main.ts`, `apps/client/src/debug/PerfOverlay.ts`, `apps/client/src/debug/netSummary.ts`
- `docs/perf/network-pass-2026-11.md` (new), `docs/perf/network-pass-smoke-2026-11-25.md` (new) + 2 screenshots, `_bmad-output/planning-artifacts/game-architecture.md`, `_bmad-output/planning-artifacts/epics.md`, `HANDOFF.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, this story file

## Senior Developer Review (AI)

Reviewer: fresh reviewer cloud session (gds-code-review: Blind Hunter / Edge Case Hunter / Acceptance Auditor passes run inline), 2026-11-25. Reviewed the merged tree `review-8-8` = `origin/story-8-8` c1c5ef1 + `origin/master` b0e491a (already contained: "Already up to date"), diff `git diff origin/master...HEAD` (31 files). `npm ci`, `npm run typecheck` green; probed/mutated tests only (no full gate, HANDOFF §3).

**Verdict: findings (2 medium, 4 low, 3 nits).** The rule itself holds: the 500 ms window is clamped, only zombies and the Behemoth are rewound, present cover/death/generation rules are kept, and the measurements reproduce bit for bit. The mediums are in the test evidence and the shared test line, not in the game rule.

### Findings

| Id | Sev | File:line | Failure scenario | Suggested minimal fix |
| --- | --- | --- | --- | --- |
| R1 | medium | `tools/netsim/hits.test.ts:177-183` (liveness), `tools/netsim/hitsSim.ts:149-151` | The lossy rows' liveness only checks that stalls were *counted*. Mutation M19 (stall counted but not added to `due`, i.e. the lossy line silently becomes the clean line) leaves all 6 Story 8.8 rows green: reversed < 5 % and over-cap < 5 % are both true on a clean line. If 8.9 (which edits this harness next) breaks the stall term, the AC 5 rows keep passing while measuring nothing (brief 6). | In each lossy row also assert the stalls really hurt the shots, e.g. `viewOffsets.filter(v => v > 6).length / viewOffsets.length > 0.2` (before evidence: 38–73 % asked past 300 ms) or lossy p95 view offset ≥ clean p95 + 2 ticks. |
| R2 | medium | `tools/netaudit/lagLine.ts:154-160` (`close`) | When either side closes, `close()` destroys both sockets and `stop()` clears both queues: every byte still in flight is lost, contradicting "never a lost byte". Probe: target server `s.end("bye-from-server")`, client `c.end("bye-from-client")`, rtt 200 → client received `""`, server received `""`. A server's last frames + WebSocket close frame (close code/reason) never reach the bot → it sees 1006. Brief 14 makes this THE test line and the story puts 8.1's drop/leave cut switch on it (brief 21: drop vs leave is decided by close codes); 8.10/8.11 `update_required` closes would be mis-measured. (Master's `lagProxy.ts` had the same flaw; now it's the shared line.) | Half-close in order: on `end` of a side, push an end marker into that direction's `OrderedDelay` and call `dest.end()` when it is delivered; only `destroy` on `error` or `LagLine.close()`. Add a `lagLine.test.ts` case: server writes then ends → client gets the bytes, then `end`, after ~rtt/2. |
| R3 | low | `apps/client/src/main.ts:133-134` | Brief 26 (wiring test per hookup): deleting `lossPct: o.lossPct, stallMs: o.stallMs` (or `activeThrottle.current = throttle`) fails no test; `&loss=1` would silently run a clean line on the designer's Wi-Fi phones (the overlay would only lose its suffix). Self-declared under Not verified. | A `tools/checks/throttleWiring.test.ts` source check (like `fogWiring.test.ts`) for both lines in `throttled()`. |
| R4 | low | `packages/shared/src/combat/rewind.test.ts` (barricade test comment) / story T5 / `buildings/buildings.ts:444-450` | T5's premise "buildings only change in a build phase, so now and then agree mid-wave" is false: `damageBuilding` removes a barricade at 0 HP mid-wave (mines are removed too). A rewound shot (now up to 500 ms, was 300) fired just after a barricade broke passes where the barricade was and hits the zombie at its old spot behind it, though the shooter's screen still drew the barricade (brief 15 "never pass through cover the shooter saw"). Gain: only against zombies, for the team; existed at 300 ms. | Fix the text (comment + story: "cover is tested as it is now; a barricade broken in the last 500 ms no longer blocks a rewound shot") and log it as accepted; no code change unless the designer wants strictness. |
| R5 | low | `apps/client/src/debug/netSummary.ts:190` | The net-summary line (bug reports, the 4-phone test sheet) prints the raw query: `?loss=abc` (parsed off) reports `&loss=abc&stall=200`; `?loss=99` reports 99 though 20 is applied; `?loss=1&stall=x` reports `stall=x` though 200 is used. The report can claim a line that isn't the one running. | Build the string from `urlOptions().throttle` (parsed values). |
| R6 | low | `docs/perf/network-pass-smoke-2026-11-25.md` (Setup) | "Script: kept out of the repo (scratch), the story file says how to rebuild it" — the story file does not say how; the two-tab smoke (brief 34) can't be re-run by 8.1, which must repeat it. | Commit the smoke script under `tools/` (or `docs/perf/…/smoke.py`) or write its steps in the report. |
| N1 | nit | `rewind.test.ts` › "…a teammate standing on that spot now is not hurt" | The teammate assertion cannot fail: bullets have no player-hit code path at all, so it doesn't test "players are never rewound". Harmless documentation. | Say so in the test comment. |
| N2 | nit | `tools/bots/lineArgs.ts:12-14`, `tools/bots/run.ts` `startLine` | Caps 20 / 1000 / 2000 duplicated from `devThrottle.ts`/`urlOptions.ts` (brief 7/20 "one place"); an `https://localhost` `--url` through the line is rewritten to `127.0.0.1` → TLS hostname mismatch. | Import the client constants (or a shared one); keep the hostname for https. |
| N3 | nit | T8 table row | Before (master `lagProxy`, stalls down only) and after (in-process line, both ways) are not the same line (brief 13). Fine as liveness evidence only; label it so. | Label "different line, liveness only". |

### Beat the rule (brief 4)

| # | Attempt (player / modified client) | Result |
| --- | --- | --- |
| 1 | `viewTick` = 0, 12 ticks old, or 2^31 (future) | Clamped to 10 / 0 (`rewindTicksFor`, test F4; M2 kills it). Not logged: no telemetry for a clamped view (story asked "Logged?": no; F4 doesn't require it). Shot advance past the cap still ≤ `SHOT_ADVANCE_CAP_MS` (unchanged formula `firing.ts:244`). |
| 2 | Shoot from behind a car at where a zombie was 450 ms ago | Blocked: `bulletBlockT` / gas tank / map boxes use present geometry (M5 kills the barricade test). |
| 2b | Shoot through a barricade that broke < 500 ms ago at a zombie behind it (old view) | **Passes** (R4): present cover = no barricade. Team-only gain. |
| 3 | Zombie dies; slot reused within 500 ms; old-view shot | Not hit: `rewoundView` includes only zombies alive *now* whose history generation matches (M4 kills it). Removing the projectile's own `isZombieAlive` guard (M3) changes nothing — the view already excludes dead ones (equivalent second guard). |
| 4 | Shoot at a teammate's 400 ms-old spot where a zombie was | No damage: bullets never test players (N1), FF 50 % is explosion-only/present. |
| 5 | Rewound touch aim assist onto a zombie now dead / behind cover | Not locked: `assistAim` keeps `isZombieAlive` + `bulletLineClear` (present cover) against the rewound view (code unchanged). |
| 6 | Behemoth: shoot where it was 8–10 ticks ago mid-charge | Hit (D3, M6/M7 kill the test); present `bossBodyOn` still required (a dead/leaving boss is not hit at its old spot: `bossCircleHitBySegment` checks it first). Boss attacks use live positions (untouched). |
| 7 | Flood inputs during a stall to fit more shots in the window | Bounded: seq+1 rule, input bucket, `INPUT_QUEUE_MAX` 6 unchanged; harness lossy rows show overflow drops, not extra shots (server shots ≤ local shots in every row). |
| 8 | `&loss=20&stall=1000` in a release build | Only that tab's `DevThrottle` changes (client only, no new message, 0 B/s); its inputs arrive in bursts → its own overflow drops; other players see that player stutter exactly as with `?lag` today. Server tick unaffected. |
| 9 | Melee / flamer with a 500 ms-old view | Reaches zombies where they were up to 500 ms ago (a Runner ~3 m back): team-only gain, as accepted in D1. |
| 10 | Kill-steal: old view kills a zombie a teammate is shooting now | Same as at 300 ms (both hit the present zombie; first kill wins); no new harm to a player. |
| 11 | Event objects (armed car 6.8, gas tank 6.9), stampede Runners, survivor NPC | Levers static, not rewound; stampede = ordinary zombies; no NPC hit path in `firing.ts`/`aimAssist.ts`. |
| 12 | `?loss=abc` / `?loss=1.25` / `?stall=-3` / `?stall=400` alone | Off / off / default 200 / nothing on (tests); only the net-summary text lies (R5). |
| 13 | Bots `--loss 1 --url https://hordes.sevend.io/api` | Refused with a clear message (M13 kills the test). |

### Mutations (brief 6: each new test mutated once, reverted after)

| Id | Mutation | Result |
| --- | --- | --- |
| M1 | `REWIND_MAX_TICKS` 10 → 6 | 4 / 4 Story 8.8 fairness tests fail |
| M2 | drop the clamp in `rewindTicksFor` | 3 fail (F4 + two 2.12 tests) |
| M3 | drop `isZombieAlive` in `updateProjectiles` | **survives** — equivalent (rewoundView holds alive-now zombies only) |
| M4 | drop the generation check in `rewoundView` | 1 fails (the 2.12 generation test); the new 8.8 "slot reused since" case does **not** catch it on its own (low value, covered by 2.12) |
| M5 | rewound shots ignore `bulletBlockT` | 1 fails (barricade test) |
| M6 | boss tested at its live position | 1 fails (Behemoth test) |
| M7 | boss history 8 rows | 1 fails (Behemoth test) |
| M8 / M22 | throttle counts but doesn't add the stall (out / in) | 1 fails each |
| M9 | loss draw even at `lossPct` 0 | 1 fails (bit-for-bit test) |
| M10 | throttle incoming without `max(lastDue, …)` | **survives** — equivalent (the FIFO ring's pump already holds later messages behind the head) |
| M11 / M20 / M21 | lag line: no up stall / up stall counted not delayed / down stall counted not delayed | 1 fails each |
| M12 | lag line without `max(lastAt, …)` | **survives** — equivalent (FIFO queue, head-only scheduling) |
| M13 | remote `--url` accepted | 1 fails |
| M14 / M16 | `&loss` two decimals / no 20 % cap | 1 fails each |
| M15 | default stall 400 | 4 fail |
| M17 | `REWIND_MAX_TICKS` 6, netsim lossy rows | 4 / 4 lossy rows fail (Runners on reversed %, Walkers on over-cap / the cap pin); clean rows pass (correct) |
| M18 | loss pct 0 in the lossy rows | 4 / 4 fail (stalls > 0) |
| M19 | harness stall counted but not applied | **survives — all 6 rows pass (R1)** |
| M23 | `REWIND_CAP_MS` 300 | RunController cap test fails |

### Measurements re-run (brief 13)

`npx tsx tools/netaudit/runHits.ts 60 3`, before on `origin/master` b0e491a (worktree), after on `review-8-8`, run side by side, load 0.1–0.6 (4 cores): **all 12 rows reproduce exactly** the story's table (e.g. Runners 1 % × 200: 7.6 % (31/410) → 2.0 % (8/406); 2 %: 11.9 % (48/404) → 1.3 % (5/398); Walkers kiting 2.3 / 3.5 → 1.8 / 2.1 %; clean 0.2 / 0.2; over-cap 50 / 73.3 → 0 / 0 %; 1 % × 400 Walkers kiting 10.0 → 12.6 % recorded). `PERF_ASSERT=1 tickCostRewind.test.ts`: passes, added work p99 0.066 ms (load ≈ 3 at the time, a background job of mine: not a clean-load number; builder's 0.060 ms at 0.01 stands).

### Brief check (network pass brief lines)

1 ok (ports, gate on merge) · 2 n/a (no state/wire field) · 3 ok (F1–F5 each a test) · 4 above · 5 ok (no sim change; boss history length follows the constant, same-build digests) · 6 **R1** · 7 ok (constants.ts / limits.ts with story comments; throttle caps in devThrottle.ts by the story's instruction; N2) · 8 ok (0 B/s) · 9 ok (smoke on lossy line; vote/reconnect not reached, declared) · 10 ok (recorded with load) · 11 ok (Not verified lists phones / 4G / iOS) · 12 ok (Notes for the merge) · 13 ok (reproduced; N3) · 14 ok, but **R2** for the line's close · 15 ok except **R4** (broken barricades) · 16–19, 21 n/a · 17 ok (clean rows unchanged) · 18 ok (no new client message) · 20 ok (hitsLossSim deleted, runHits imports the real harness and `REWIND_CAP_TICKS`) · 22 ok (6.8/6.9 levers static; no numeric 6-tick pins left: grep) · 23 ok · 24 ok (overlay suffix only) · **25** ok: every [x] task names tests that exist (T1/T8/T9/T10 are measurement/doc tasks with evidence; T6's `main.ts` wiring has none → R3) · 26 **R3** · 30 ok (Gate line: ddce305, master b0e491a, 398 files / 3679 tests, load 0.34–3.98) · 32 ok (HANDOFF, epics, architecture say 500 ms / 12 rows) · 33 ok (no pacing change) · 34 partial (vote, reconnect not reached; R6).

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending).
- 2026-11-25: built (500 ms rewind, lossy line in harness / dev throttle / bots, fairness and lossy netsim tests, two-tab smoke); status review.
- 2026-11-25: Senior Developer Review (AI): findings (2 medium, 4 low, 3 nits); status stays review.
