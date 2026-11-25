# Epic 8 saves: sizes and timings (Stories 8.4–8.6, T10)

Measured 2026-11-25 on the builder's cloud container (4 cores, load ≈ 0.2), Node 22, branch `story-8-4-5-6`.
Capture = `captureRunSave` + `JSON.stringify` (the part the tick pays); 20 warm-up captures, then 200 timed.

| Run at the save | Buildings | Save size | Capture + JSON p50 | p99 |
| --- | --- | --- | --- | --- |
| 2 players, after wave 3 | 12 | 16.2 KB | 0.89 ms | 1.49 ms |
| 4 players, after wave 10 (the vote) | 24 (the real cap, 6 each) | 23.5 KB | 1.10 ms | 1.66 ms |
| 4 players, after wave 10, `maxPerPlayer` 15 | 60 | 36.5 KB | 1.52 ms | 2.09 ms |

- Limit (AC 3): ≤ 64 KB for the 4-player wave-10 build with 60 buildings → 36.5 KB (test `runSave.test.ts`).
- Limit (AC 5): capture + JSON ≤ 3 ms p99 → 2.09 ms worst (test `run/roomSaves.test.ts`, asserted with `PERF_ASSERT=1`).
- Endless wave 15 was not measured separately: the save holds no per-wave lists that grow (the zombie pool and
  the other pools are counters only in a calm phase), so it is the wave-10 size plus a few counters.
- Writes on PGlite (dev server, file directory, 2 bots): `run_saved` 5.5–8.9 ms per write (12–15 KB), never on the
  tick (one write in flight per room; E8-S7). Production PostgreSQL was not measured (no VPS access from here).
- Cold first capture (JIT not warm) was ~5 ms once; a room captures twice per build, so only the first build pays it.
