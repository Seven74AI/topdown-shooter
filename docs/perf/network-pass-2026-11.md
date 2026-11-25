# Network pass 2026-11: before/after measurements

One section per story (brief 13: same seeds, same line, same load; "before" on the master the story branched from). Audit: `docs/perf/network-audit-2026-11.md`.

## § 8.9 Smooth through hiccups

**Method.** `npx tsx tools/netsim/smoothRun.ts 60 3`: the netsim harness (`tools/netsim/hitsSim.ts`, the real server `RunController` + the real client `ServerClock`, `AdaptiveDelay`, `StepPacing`, Predictor, fire clock), Pistol, 150 ms RTT ± 10 ms, 3 seeds × 60 s per row, counters from second 2 on. Lossy = TCP loss as head-of-line stalls both ways (`loss: { pct, stallMs }`, the audit's model; 8.8 owns the option). The harness has one down message per tick (20 msg/s), so its stalls are rarer than a real phone's (~46 msg/s, audit §3.3).
**Before:** master `c57c1cc` with the same harness file patched to the old API (`snapshot`/`frame`/`renderTick`, no pacing), load 0.2–0.4. **After:** branch `story-8-9`, load 0.3–0.8.

| Case | Line | Freezes /30 s | Frozen frames | Delay p50 | Delay p95 | Back steps (render/est) | Never fired | Starved ticks | Server skips | Reversed |
|---|---|---|---|---|---|---|---|---|---|---|
| 150 walkers, standing | clean | 0 → 0 | 0 → 0 | 118 → 100 | 125 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0 % → 0 % |
| 150 walkers, standing | 1% x 200 ms | 6.7 → 1.2 | 325 → 35 | 119 → 250 | 130 → 252 | 0/0 → 0/0 | 1.3 % → 0 % | 81 → 124 | 74 → 0 | 1.1 % → 0 % |
| 150 walkers, standing | 2% x 200 ms | 12.6 → 1.2 | 607 → 38 | 120 → 250 | 137 → 252 | 0/0 → 0/0 | 1.5 % → 0 % | 96 → 154 | 89 → 0 | 1.1 % → 0.3 % |
| 150 walkers, kiting | clean | 0 → 0 | 0 → 0 | 118 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0.2 % → 0.2 % |
| 150 walkers, kiting | 1% x 200 ms | 6.7 → 1.2 | 329 → 38 | 119 → 250 | 129 → 253 | 0/0 → 0/0 | 1.3 % → 0 % | 81 → 107 | 74 → 0 | 1.9 % → 5.3 % |
| 150 walkers, kiting | 2% x 200 ms | 12.8 → 1 | 613 → 40 | 121 → 250 | 138 → 252 | 0/0 → 0/0 | 1.5 % → 0 % | 96 → 166 | 89 → 0 | 3.1 % → 7.7 % |
| 20 runners, kiting | clean | 0 → 0 | 0 → 0 | 117 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 1 → 1 | 0 → 0 | 0.2 % → 0.2 % |
| 20 runners, kiting | 1% x 200 ms | 6.7 → 0.9 | 321 → 29 | 119 → 250 | 129 → 252 | 0/0 → 0/0 | 1.7 % → 0 % | 82 → 104 | 73 → 0 | 13.3 % → 19.7 % |
| 20 runners, kiting | 2% x 200 ms | 12.8 → 1.4 | 605 → 41 | 120 → 250 | 139 → 253 | 0/0 → 0/0 | 2 % → 0 % | 100 → 151 | 91 → 0 | 15.4 % → 23.1 % |
| 20 runners, kiting | 1% x 200 ms + 150 ms step | 7.2 → 2.2 | 673 → 67 | 119 → 250 | 129 → 251 | 3/3 → 0/0 | 1.5 % → 0.2 % | 88 → 124 | 69 → 3 | 41.9 % → 38.6 % |

- **Freezes** = episodes of the render tick past the newest frame (others and the horde hold still). Frozen frames fell ~10×: what is left is mostly the first stall after > 10 s of calm (the delay is back at 100 ms there, F4) and a stall right after the eased-down hold.
- **Delay:** clean lines sit at exactly 100 ms (before: 110–125, jitter-driven); lossy lines at 250 ms (cap, D1), up to 260 while a frame is overdue (stall stretch ≤ 25 ms).
- **Never-fired predicted shots** 1.3–2.0 % → 0 %: the client's 0.9× steps empty the backlog, the server's skip rule now almost never fires (0–3 skips vs 69–91).
- **Starved ticks +30–60 % (AC "± 10 %" NOT met).** Cause, measured: with the server drain, a post-stall backlog of ~5 inputs sits 2 s as cover for the next stall; the pacing empties it in ~2 s gradually, so the next stall finds less cover (Story 2.4's trade-off). Two variants tried (make up exactly the reported excess; leave one extra) gave 114–131 starved, no better. A starved tick delays one of my moves by a tick; a skipped input (before) loses it.
- **Reversed hits on kiting rows rose** (Runners 13 → 20 % at 1 %): the shots are 100–150 ms older with the 250 ms delay and today's rewind window is 300 ms. Story 8.8's 500 ms window is the fix; re-measure after 8.8 (T10).
- **Latency step row:** the old clock stepped back 3 times (audit F5); now 0. Its reversed % is a harness artefact (`setRtt` stays at 150 ms after the step).
- **Bandwidth:** `inputQueued` changes 0–10 times/s per player (harness count) at ~2 B per change in a patch the player is already in → ≤ 0.1 KB/s per phone with 4 players.
- **Tuning runs** (1 % × 200 ms, 12 × 60 s, 20 Walkers standing + 20 Runners kiting): ease-down 20 ms/s → 2.1 freezes/30 s, 10 → 1.6, 5 → 1.0 (chosen); p99 instead of p95 for the target: no better; without the overdue slowdown 3.0 (with: 1.0).
