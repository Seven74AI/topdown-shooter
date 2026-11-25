# Epic 7 survivor looks: frame rate, bake time, bandwidth (Story 7.9)

Story 7.9 draws each player's survivor from their own look: one per-player body texture (`survivorlook_<id>`, 2
frames: with and without the pack) baked at the Game scene start and repainted at a build start (D1 stage dim), with
the held gun as a shared atlas frame under it (D2). Nothing is drawn, created or uploaded per frame.

## Headless frame rate (AC 14)

Setup as `epic-6-blackout.md`: solo dev build (Vite, own port), `?stress=150` (150 Walkers in view, god mode, waves
paused), viewport 844 × 390 at DPR 2 (the Mi 11i's CSS size), 8 s warm-up, then a 12 s `requestAnimationFrame`
count; frame ms p95 from the same frames; load = 1-min load average (mean of start and end), 4 cores, only this
builder's Vite + Chromium. "master" is `origin/master` d8d44d0 served from its own worktree on another port; two
rounds, the order reversed in round 2.

2026-11-25, branch `story-7-9` (story-7-1 @ 827ea45 merged), load 0.5–1.3:

| configuration | round 1 FPS (load) | round 2 FPS (load) | mean FPS | vs. master | frame ms p95 | look textures |
| --- | --- | --- | --- | --- | --- | --- |
| master `?stress=150` | 20.7 (0.5) | 21.8 (1.2) | 21.2 | — | 50 | 0 |
| branch `?stress=150` | 21.0 (0.7) | 20.0 (1.3) | 20.5 | −0.7 | 50–67 | 1 |
| branch `?stress=150&devlooks=4` (4 survivors, random starter looks) | 19.1 (0.8) | 20.3 (0.8) | 19.7 | −1.5 | 67 | 4 |

Within AC 14's 2 FPS of the "before" on the same load. The extra cost of `devlooks=4` is mostly the 3 extra
survivors themselves (3 × body + gun + ring sprites), not the looks: a survivor is 2 sprites (body + gun) instead of 1.
(Headless Chromium here is the CPU renderer; compare the columns, not the absolute numbers. Epic 6's baseline in the
same setup was 12.4 FPS in another, busier container.)

## Bake time (AC 9)

The 4 bodies × 2 frames painted into canvases in the browser (`drawSurvivorBody` from each resolved look, the same
calls `SurvivorLookTextures` makes; the texture upload is not included), 7 repetitions, median (min–max):

| CPU | 4 bodies (8 frames) | load |
| --- | --- | --- |
| headless, no throttle | 1.9 ms (1.7–4.3) | 1.2 |
| headless, 4× CPU throttle (the story's Mi 11i stand-in) | 9.1 ms (8.5–20.8) | 1.2 |

**Over AC 9's "≤ ~2 ms total" with the 4× throttle.** What ships instead:

- The first bake happens in the Game scene's first frames, **one body per frame** (review L7: the same budget as the
  repaints), and online only once the server's decay stage is in the mirror (no stage-1 bake followed by a repaint).
  A survivor shows the default atlas picture until its body is baked (≤ 3 frames for a 4-player run), so a
  mid-wave reload (8.1 return) never paints 4 bodies in one frame.
- The repaint at a build start (D1) is spread: **one body per frame** (`SurvivorLookTextures.beginFrame`), so a build
  start costs ≤ ~2.3 ms per frame for 4 frames (4× throttled), ~0.5 ms unthrottled, never during a wave.
- Further cut if the phone shows a hitch: bake the `nopack` frame only when a weapon with a back piece is first held
  (halves every bake). Not done: the Mi 11i itself has not been measured (see "Not verified").

## Bandwidth (AC 6, L4)

The look is one string on the player state, set once at join: the canonical code is ≤ 94 characters (the longest
legal look; the default look is 77), plus the schema's string header — **≤ 100 B per player, once**. Nothing about it
changes per tick: `RunRoom.look.test.ts` › "L4" measures the bytes per tick of the same run with 4 custom looks and 4
default looks (equal within ping/timing jitter). **Added per phone: 0 B/s.** The join options carry the same ≤ 94
characters once (under the 1 KB options cap).

## Not verified here

- The Xiaomi Mi 11i itself (bake time, build-start repaint, `?stress=150&devlooks=4`), iOS Safari.
