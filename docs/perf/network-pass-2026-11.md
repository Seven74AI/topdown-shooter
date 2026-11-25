# Network pass 2026-11: before/after measurements

One section per story (brief 13: same seeds, same line, same load; "before" on the master the story branched from). Audit: `docs/perf/network-audit-2026-11.md`.

## § 8.9 Smooth through hiccups

**Method.** `npx tsx tools/netsim/smoothRun.ts 60 3`: the netsim harness (`tools/netsim/hitsSim.ts`, the real server `RunController` + the real client `ServerClock`, `AdaptiveDelay`, `StepPacing`, Predictor, fire clock), Pistol, 150 ms RTT ± 10 ms, 3 seeds × 60 s per row, counters from second 2 on. Lossy = TCP loss as head-of-line stalls both ways (`loss: { pct, stallMs }`, the audit's model; 8.8 owns the option). The harness has one down message per tick (20 msg/s), so its stalls are rarer than a real phone's (~46 msg/s, audit §3.3).
**Before:** master `c57c1cc` with the same harness file patched to the old API (`snapshot`/`frame`/`renderTick`, no pacing). **After:** branch `story-8-9`.

**Main table: Story 8.8's harness loss (commit df00ed48, cherry-picked; stalls drawn from the shared RNG, as the audit).** Before = c57c1cc + df00ed48 (load 1.1–2.3), after = story-8-9 + df00ed48 (load 1.0).

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
