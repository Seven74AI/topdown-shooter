# Epic 6 — special events (Story 6.8: car alarm, stampede)

Brief lines 11, 12, 16. Measured 2026-11-24 in the builder's cloud container (4 cores; my own Vite
server and browser only).

## Headless FPS (Playwright + SwiftShader)

`?stress=150` (150 Walkers in view, god mode, waves paused), viewport 844 × 390 at DPR 2 (the Mi 11i's
CSS size), 8 s warm-up, then a 12 s `requestAnimationFrame` count; frame p95 from the same frames. The
event is forced draw-only from the page (the sim's state set every 100 ms): the stampede's warning
(12 chevrons + 64 pooled dust puffs down the main street, the "!" pin, the edge arrow) and a sounding
car alarm (4 blinking hazard glows, the bell pin). Load 1.2–1.9 (1-min average at start / end).

| run | fps | frame p95 (ms) |
| --- | --- | --- |
| `?stress=150`, no event | 15.9 / 16.0 / 16.1 / 16.3 | 67–83 |
| + stampede warning (chevrons + dust) | 15.1 / 15.2 / 15.6 / 15.7 | 83 |
| + sounding car alarm (glows + pin) | 15.9 / 17.0 | 67–83 |

Stampede warning ≈ −3 % (within the run-to-run noise of ±0.5 fps), car alarm ≈ 0. The latest floor
(`epic-6-boss.md`: 16.8–17.8 fps master) is the same order; compare columns, not absolute numbers
(headless Chromium here runs 13–20 fps). The warning lasts 3 s, twice a run at most.

## Server tick (`apps/server/src/run/tickCostEvents.test.ts`, `PERF_ASSERT=1`)

4 players + 150 zombies on Downtown, 14 s measured after a warm-up of every path:

| run | p99 | added p99 |
| --- | --- | --- |
| no event | 0.95 ms (mean 0.57) | — |
| stampede (174 alive at most, 30 Runners) | 1.12 ms | +0.17 ms |
| car alarm (2 lure fields built in the round-robin, 15 s of 150 lured zombies) | 0.65 ms | ≈ 0 |

Load 0.82. The first run of a new code path alone costs ~1 ms of p99 (JIT), so the test warms each path
once. Within the Epic 6 2 ms budget (boss field + events + vote).

## Bandwidth (`apps/server/src/run/eventBandwidth.test.ts`)

- Events (`event.*`, ≤ 4 per event) + the room-state event record (on change only): 61 B + ≤ 80 B over a
  car alarm and a stampede (48 s) → **≤ 3 B/s** per client.
- **Open (designer question A/B, network audit F8):** the stampede's worst horde frame, 150 alive + 30
  Runners in one view: 6 + 8 × 180 = 1,446 B → **28.2 KB/s** while it lasts (≤ 13 s, ≤ 2× per run), over
  the 24 KB/s horde budget (150 in view = 23.6 KB/s). Built as A: accepted until Story 8.10's half-size
  horde stream (B would cap a view at 150 during a stampede, hiding real zombies).

Not measured: a real phone (the Mi 11i), sound by ear.
