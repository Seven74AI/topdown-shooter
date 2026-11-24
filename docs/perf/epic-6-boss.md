# Epic 6 Behemoth: frame rate with the charge and the throw (Stories 6.6 + 6.7)

Brief line 12: `?stress=150` with the story's effects active, headless FPS before / after with load.
Asked by the 6.6+6.7 review (M1).

## Headless (Playwright + SwiftShader, this container)

Setup, as `epic-6-blackout.md`: solo dev build (Vite on its own port; master in a separate worktree
on another port), `?stress=150` (150 Walkers in view, god mode, waves paused), viewport 844 × 390 at
DPR 2 (the Mi 11i's CSS size), 8 s warm-up, then a 12 s `requestAnimationFrame` count; frame ms p95
from the same frames; load = mean of the 1-min load average at the start and the end (4 cores, my own
browser + 2 Vite servers only).

The Behemoth is placed by the page through its own `@topdown/shared` module (the stress scene has no
wave 10): the run phase is set to `wave`, the boss stands 8 m (charge) or 10 m (throw) from my
survivor with the slam parked, and after each attack both are put back (the next attack starts at once:
6–8 telegraphs in the 20 s, i.e. a lane or a ring on screen most of the measured time — far denser than
a real fight). A top-up keeps 150 Walkers alive (the boss's attacks kill some).

- **master `eb3b991` (before)**: 6.5's Behemoth, no charge or throw. "boss" = it is re-placed every
  100 ms, so it walks (never reaches slam range).
- **branch `story-6-6` (after)**: the same walking boss, then charges every cooldown, then throws.

2026-11-24, load 0.8–1.4:

| configuration | round 1 FPS (load) | round 2 FPS (load) | frame ms p95 (r1 / r2) | telegraphs |
| --- | --- | --- | --- | --- |
| master, `?stress=150`, no boss | 16.8 (0.82) | 17.8 (1.01) | 83 / 67 | 0 |
| branch, `?stress=150`, no boss | 17.2 (0.97) | 17.5 (1.00) | 67 / 67 | 0 |
| master, boss walking | 17.2 (1.05) | 16.1 (1.04) | 67 / 83 | 0 |
| branch, boss walking | 18.0 (1.04) | 16.8 (1.40) | 67 / 83 | 0 |
| branch, **charges** back to back | 13.3 (1.02) | 13.8 (1.34) | 83 / 83 | 6 |
| branch, **throws** back to back | 12.8 (1.02) | 14.4 (1.30) | 100 / 83 | 7 |

What costs the ~20 %? Probes, one 20 s run each (branch):

| probe | FPS (load) | note |
| --- | --- | --- |
| charges, lane / ring / rings **not drawn** (`BossView.drawLane/drawRing/drawFx` stubbed) | 14.2, 14.3 (0.4–0.7) | the telegraph graphics are not it |
| throws, not drawn | 13.8, 14.1 (0.6–0.8) | |
| charges / throws with **WebAudio removed** | 15.0 / 15.4 (0.8–1.0) vs walking 19.9 | not the placeholder sounds |
| sim step time (host `stats.stepMs`): walking / charges / throws | 0.55 / 0.51 / 0.53 ms mean, p95 0.8–0.9 | not the sim |
| **zombies made unkillable** (hp 1e6 each 100 ms): walking / charges / throws | **18.4 / 17.7 / 16.9** (0.9–1.05), 0 kills | **the drop is the zombie deaths** |
| charges, normal | 14.6 (1.04), **528 zombie kills in 20 s** | |

So in this scene the charge and throw cost **−4 % / −8 %** headless (17.7 / 16.9 vs 18.4 fps) when they
kill nothing. The rest is the harness: forced back to back into a packed crowd of 150, each trample /
impact kills dozens of Walkers (528 in 20 s), whose death effects (gore, corpses, kill feed) plus the
top-up's respawns cost the frames. In a real wave 10 the boss attacks every few seconds, not into a
packed 150, and the horde is ≤ 110 while it lives (D6). The latest `docs/perf/` `?stress=150` rows are
the floor; headless Chromium is slow here (13–20 fps): compare the columns, not the absolute numbers.

Not measured: a real phone (the Mi 11i rows of `epic-6-blackout.md` should add a boss run:
`?solo=1&bosswave=1`, bait charges and throws, note FPS avg / min).
