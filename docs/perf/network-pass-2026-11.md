# Network pass 2026-11: before/after measurements

One section per story (network pass brief line 13: same line, same seeds, same load; "before" on the master the story branched from). Audit: [`network-audit-2026-11.md`](network-audit-2026-11.md).

## 8.8 My shots count on a bad 4G line

Branched from master `c57c1cc`. Change: rewind window 300 → 500 ms (`REWIND_MAX_TICKS` 6 → 10, `REWIND_CAP_MS` 300 → 500, 12 history rows for zombies and the Behemoth); the lossy line in the dev throttle (`?lag=150&jitter=20&loss=1`), the bots (`npm run bots -- --lag 150 --jitter 20 --loss 1`) and the harness (`Options.loss`).

### Reversed hits (harness)

`npx tsx tools/netaudit/runHits.ts 60 3`: 150 ms ± 10 ms, Pistol, seeds 1–3 × 60 s, the real server `RunController` + client Predictor / fire clock / `ServerClock` / `AdaptiveDelay` (`tools/netsim/hitsSim.ts`; the audit's copy `hitsLossSim.ts` is merged back and deleted). Before on master `c57c1cc` (identical to the audit's table), after on `story-8-8`. Load 0.1–0.6 (4 cores) for both. "Over cap" = shots whose asked view was older than the server's cap (6 ticks before, 10 after).

| Case | Line | Before reversed | After reversed | Over cap before → after | Server / local shots before → after |
| --- | --- | --- | --- | --- | --- |
| 20 Runners kiting | clean | 0.2 % (1/446) | 0.2 % (1/446) | 0 → 0 % | 459/459 → 459/459 |
| | 1 % × 200 ms | **7.6 %** (31/410) | **2.0 %** (8/406) | 50 → 0 % | 451 → 453 / 459 |
| | 2 % × 200 ms | **11.9 %** (48/404) | **1.3 %** (5/398) | 73.3 → 0 % | 452 → 447 / 459 |
| | 1 % × 400 ms (record) | 12.7 % | 7.2 % | 64.3 → 4.7 % | 434 → 432 / 459 |
| 150 Walkers kiting | clean | 0.2 % | 0.2 % | 0 → 0 % | 459 → 459 |
| | 1 % × 200 ms | 2.3 % | 1.8 % | 38.6 → 0 % | 451 → 447 |
| | 2 % × 200 ms | 3.5 % | 2.1 % | 61.7 → 0 % | 452 → 446 |
| | 1 % × 400 ms (record) | 10.0 % | 12.6 % | 45.1 → 3.8 % | 433 → 429 |
| 150 Walkers standing | clean | 0.0 % | 0.0 % | 0 → 0 % | 459 → 459 |
| | 1 % × 200 ms | 1.6 % | 2.2 % | 38.2 → 0 % | 451 → 446 |
| | 2 % × 200 ms | 1.8 % | 2.0 % | 65.5 → 0 % | 446 → 449 |
| | 1 % × 400 ms (record) | 6.3 % | 8.9 % | 47.2 → 2.8 % | 437 → 429 |

Asserted in `tools/netsim/hits.test.ts › Story 8.8: lossy line` (Runners and 150 Walkers kiting: clean ≤ 0.5 %, 1 % and 2 % × 200 ms < 5 %, stalls > 0 both ways, apparent hits > 300, < 5 % of shots over the cap). Stalls injected per 3 × 60 s row: 29–42 up / 28–42 down at 1 %, 61–67 / 67–70 at 2 %.

**1 % × 400 ms, 10 more seeds (4–13), cap 6 vs cap 10 on the same branch:** Runners kiting 10.4 → 6.7 %; 150 Walkers kiting 10.3 → 11.7 %; 150 Walkers standing 6.5 → 7.2 %. With 400 ms stalls the input queue overflows (92–106 overflow drops per row) and some shots ask for more than 500 ms anyway; in a dense Walker crowd the longer window costs about 1 pp there. Not an AC (recorded only); Story 8.9's queue work (input backlog, catch-up) is where those rows move. "Predicted shots that never fired on the server" (local − server shots: 6–30 per 459) also stays Story 8.9's number.

### Tick cost (rewind budget)

See the story file's measurement table (`PERF_ASSERT=1 npx vitest run apps/server/src/run/tickCostRewind.test.ts`, before on master, after on the branch, same load).

### Bots on the lossy line

Liveness only (review N3: the before and after lines differ, so these runs are not a before/after measurement). See the story file (T8): 4 bots, `--scenario net150 --until-wave 5 --hold-fire 45`; before = master's `lagProxy.ts` (server→client stalls only, `--stall-prob 0.01 --stall-ms 200`), after = `--lag 150 --jitter 20 --loss 1` (in-process `lagLine.ts`, both directions).

## 8.9 Smooth through hiccups

**Method.** `npx tsx tools/netsim/smoothRun.ts 60 3`: the netsim harness (`tools/netsim/hitsSim.ts`, the real server `RunController` + the real client `ServerClock`, `AdaptiveDelay`, `StepPacing`, Predictor, fire clock), Pistol, 150 ms RTT ± 10 ms, 3 seeds × 60 s per row, counters from second 2 on. Lossy = TCP loss as head-of-line stalls both ways (`loss: { pct, stallMs }`, the audit's model; 8.8 owns the option). The harness has one down message per tick (20 msg/s), so its stalls are rarer than a real phone's (~46 msg/s, audit §3.3).
**Before:** master `c57c1cc` with the same harness file patched to the old API (`snapshot`/`frame`/`renderTick`, no pacing). **After:** branch `story-8-9`.

**Final table (after the review fixes M1/M2/L2 and T10's 600 ms window, story-8-8 008df68 merged; load 1.1):**

| Case | Line | Freezes /30 s | Frozen frames | Delay p50 | Delay p95 | Back steps (render/est) | Never fired | Starved ticks | Server skips | Reversed |
|---|---|---|---|---|---|---|---|---|---|---|
| 150 walkers, standing | clean | 0 → 0 | 0 → 0 | 118 → 100 | 125 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0 % → 0 % |
| 150 walkers, standing | 1% x 200 ms | 6 → 1.2 | 278 → 31 | 119 → 250 | 129 → 253 | 0/0 → 0/0 | 1.5 % → 0 % | 55 → 89 | 50 → 0 | 1.6 % → 0 % |
| 150 walkers, standing | 2% x 200 ms | 11 → 0.2 | 505 → 8 | 119 → 250 | 136 → 254 | 1/0 → 0/0 | 2.6 % → 0 % | 86 → 120 | 82 → 0 | 1.8 % → 0 % |
| 150 walkers, kiting | clean | 0 → 0 | 0 → 0 | 118 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0.2 % → 0.2 % |
| 150 walkers, kiting | 1% x 200 ms | 6.9 → 0.9 | 327 → 26 | 119 → 250 | 134 → 253 | 0/0 → 0/0 | 1.5 % → 0 % | 60 → 84 | 54 → 0 | 2.3 % → 0.3 % |
| 150 walkers, kiting | 2% x 200 ms | 11.2 → 0.3 | 523 → 10 | 121 → 250 | 139 → 254 | 0/0 → 0/0 | 1.3 % → 0 % | 84 → 129 | 78 → 0 | 3.5 % → 0.5 % |
| 20 runners, kiting | clean | 0 → 0 | 0 → 0 | 117 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 1 → 1 | 0 → 0 | 0.2 % → 0.2 % |
| 20 runners, kiting | 1% x 200 ms | 6.6 → 0.9 | 314 → 31 | 118 → 250 | 133 → 254 | 0/0 → 0/0 | 1.5 % → 0 % | 64 → 78 | 57 → 0 | 7.6 % → 1.4 % |
| 20 runners, kiting | 2% x 200 ms | 11.2 → 1.2 | 517 → 34 | 121 → 250 | 140 → 253 | 0/0 → 0/0 | 1.3 % → 0 % | 83 → 128 | 76 → 0 | 11.9 % → 1.7 % |
| 20 runners, kiting | 1% x 200 ms + 150 ms step | 6.9 → 1 | 665 → 38 | 120 → 250 | 134 → 253 | 3/3 → 0/0 | 0.7 % → 0 % | 66 → 94 | 54 → 2 | 36.5 % → 14.7 % |

**First after-table (before the review fixes, 300 ms window): Story 8.8's harness loss (commit df00ed48, cherry-picked; stalls drawn from the shared RNG, as the audit).** Before = c57c1cc + df00ed48 (load 1.1–2.3), after = story-8-9 + df00ed48 (load 1.0).

| Case | Line | Freezes /30 s | Frozen frames | Delay p50 | Delay p95 | Back steps (render/est) | Never fired | Starved ticks | Server skips | Reversed |
|---|---|---|---|---|---|---|---|---|---|---|
| 150 walkers, standing | clean | 0 → 0 | 0 → 0 | 118 → 100 | 125 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0 % → 0 % |
| 150 walkers, standing | 1% x 200 ms | 6 → 1 | 278 → 34 | 119 → 250 | 129 → 252 | 0/0 → 0/0 | 1.5 % → 0 % | 55 → 87 | 50 → 1 | 1.6 % → 0 % |
| 150 walkers, standing | 2% x 200 ms | 11 → 0.3 | 505 → 9 | 119 → 250 | 136 → 253 | 1/0 → 0/0 | 2.6 % → 0 % | 86 → 119 | 82 → 0 | 1.8 % → 0 % |
| 150 walkers, kiting | clean | 0 → 0 | 0 → 0 | 118 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0.2 % → 0.2 % |
| 150 walkers, kiting | 1% x 200 ms | 6.9 → 1 | 327 → 29 | 119 → 250 | 134 → 252 | 0/0 → 0/0 | 1.5 % → 0 % | 60 → 92 | 54 → 0 | 2.3 % → 5.2 % |
| 150 walkers, kiting | 2% x 200 ms | 11.2 → 0.5 | 523 → 11 | 121 → 250 | 139 → 252 | 0/0 → 0/0 | 1.3 % → 0 % | 84 → 133 | 78 → 0 | 3.5 % → 6.6 % |
| 20 runners, kiting | clean | 0 → 0 | 0 → 0 | 117 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 1 → 1 | 0 → 0 | 0.2 % → 0.2 % |
| 20 runners, kiting | 1% x 200 ms | 6.6 → 0.9 | 314 → 34 | 118 → 250 | 133 → 252 | 0/0 → 0/0 | 1.5 % → 0 % | 64 → 90 | 57 → 0 | 7.6 % → 18.1 % |
| 20 runners, kiting | 2% x 200 ms | 11.2 → 0.9 | 517 → 31 | 121 → 250 | 140 → 253 | 0/0 → 0/0 | 1.3 % → 0 % | 83 → 130 | 76 → 0 | 11.9 % → 21.5 % |
| 20 runners, kiting | 1% x 200 ms + 150 ms step | 6.9 → 1.2 | 665 → 43 | 120 → 250 | 134 → 252 | 3/3 → 0/0 | 0.7 % → 0 % | 66 → 94 | 54 → 2 | 36.5 % → 37.8 % |

First pass (my local copy of the loss model with its own RNG; same story code): freezes 0.9–1.4 / 30 s at 1 %, starved 81–82 → 104–124: same picture, the RNG only moves which messages stall.

- **Freezes** = episodes of the render tick past the newest frame (others and the horde hold still). Frozen frames fell ~10×: what is left is mostly the first stall after > 10 s of calm (the delay is back at 100 ms there, F4) and a stall right after the eased-down hold.
- **Delay:** clean lines sit at exactly 100 ms (before: 110–125, jitter-driven); lossy lines at 250 ms (cap, D1), up to 260 while a frame is overdue (stall stretch ≤ 25 ms).
- **Never-fired predicted shots** 1.3–2.0 % → 0 %: the client's 0.9× steps empty the backlog, the server's skip rule now almost never fires (0–3 skips vs 69–91).
- **Starved ticks +41–58 % on 8.8's loss (AC "± 10 %" NOT met).** Cause, measured: with the server drain, a post-stall backlog of ~5 inputs sits 2 s as cover for the next stall; the pacing empties it in ~2 s gradually, so the next stall finds less cover (Story 2.4's trade-off). Two variants tried (make up exactly the reported excess; leave one extra) gave 114–131 starved, no better. A starved tick delays one of my moves by a tick; a skipped input (before) loses it.
- **Reversed hits on kiting rows rose** (Runners 7.6 → 18.1 % at 1 %): the shots are 100–150 ms older with the 250 ms delay and today's rewind window is 300 ms. Story 8.8's 500 ms window is the fix; re-measure after 8.8 (T10).
- **Latency step row:** the old clock stepped back 3 times (audit F5); now 0. Its reversed % is a harness artefact (`setRtt` stays at 150 ms after the step).
- **Bandwidth:** `inputQueued` changes 0–10 times/s per player (harness count) at ~2 B per change in a patch the player is already in → ≤ 0.1 KB/s per phone with 4 players.
- **Tuning runs** (1 % × 200 ms, 12 × 60 s, 20 Walkers standing + 20 Runners kiting): ease-down 20 ms/s → 2.1 freezes/30 s, 10 → 1.6, 5 → 1.0 (chosen); p99 instead of p95 for the target: no better; without the overdue slowdown 3.0 (with: 1.0).

### 8.9 T10: rewind window with the 250 ms lossy-line delay (after merging story-8-8 c1c5ef1)

`tools/netsim/hits.test.ts` › Story 8.8 lossy rows (150 ms ± 10, Pistol, kiting, seeds 1–3 × 60 s), load 1.0–1.5:

| Case | Line | 8.8 alone (500 ms, 8.8's numbers) | 8.8 + 8.9 at 500 ms | 8.8 + 8.9 at 600 ms (B8, applied) |
|---|---|---|---|---|
| 20 Runners | 1 % × 200 ms | 2.0 % reversed | 1.8 %, 16.0 % of shots over the 10-tick cap | **0.7 %**, 0 % over the 12-tick cap |
| 20 Runners | 2 % × 200 ms | 1.3 % | 4.2 %, 32.7 % over | **1.4 %**, 0 % over |
| 150 Walkers | 1 % × 200 ms | — | 0.3 %, 17.9 % over | **0.3 %**, 0 % over |
| 150 Walkers | 2 % × 200 ms | — | 0.5 %, 29.4 % over | **1.1 %**, 0 % over |

View offset p95 11.4–11.7 ticks with the 250 ms delay (one-way + queue + delay), so 8.8 D1's fallback (600 ms / 12 ticks, history 14 rows) was applied. Clean rows unchanged (0.2 %). Tick cost (`PERF_ASSERT=1 tickCostRewind.test.ts`, load 1.1): rewind adds mean 0.011 / p99 0.070 ms. `smoothRun.ts 60 3` after the merge (load 1.4): freezes/30 s 0.9–1.2 at 1 %, 0.3–1.2 at 2 %; never fired 0 %; starved 75–98 at 1 % (B7); 0 back steps.

Bots on the lossy line (`npm run bots -- --count 4 --scenario net150 --until-wave 4 --lag 150 --jitter 20 --loss 1`): wave 4 played, 173 kills, 48 stalls up / 106 down, 7.6 KB/s down avg (peak 19.8), 2.2 up, RTT 147–210 ms; 0 `seq_gap_suspect` / `spread_cancel_suspect`.

### 8.9 review fixes (2026-11-25)

- M1/M2: the server estimate catches up forward at ≤ 1.5× (`CLOCK_SLEW_FORWARD_FRACTION` 0.5; back stays 0.9×); the render clock steers against max(estimate, measurement); horde ring 8 → 16 frames. `adaptiveDelay.test.ts` › "review M1/M2…" (1 ms frames): estimate back within 25 ms of the server after 548 ms (−200 ms fall; was ~1.9 s), 564 ms lossy, 1448 ms for −500 ms (was ~5.2 s); real delay = the old delay + the fall at most, back within the target + 25 ms after 1.9 / 2.0 / 5.2 s (the 1.1× limit, D2: the picture never jumps forward); the render tick at most 5.8 / 8.7 / 11.6 ticks behind the newest frame (ring 16).
- L2: rate held at 1× at the stretch cap while overdue; rate slew ≤ 4/s; `FRAME_OVERDUE_MS` 15 → 10 to keep F1 (2/s with 15 ms: 1.03 freezes/30 s; 4/s with 10 ms: 0.86).
