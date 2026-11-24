# Epic 6 blackout: frame rate (Story 6.3)

The blackout darkness (Story 6.3) is the biggest new per-frame cost of Epic 6: one darkness canvas
at half the game canvas, ≤ 48 light stamps erased into it and one texture upload per frame, plus
≤ 150 zombie-eye images and ≤ 160 rain sparkles inside the beams. Nothing of it runs while there is
no blackout (F9: the image is hidden, never painted, never uploaded; the eyes and sparkles are
hidden). Story 6.4 (fog), 6.5 (Behemoth) and 6.12 (endless) add their rows here (brief 25:
blackout + fog + Behemoth + 150 zombies).

## Headless (Playwright + SwiftShader, this container)

Setup: solo dev build (Vite, own port), `?stress=150` (150 Walkers in view, god mode, waves paused),
viewport 844 × 390 at DPR 2 (the Mi 11i's CSS size), 8 s warm-up, then a 12 s `requestAnimationFrame`
count; frame ms p95 from the same frames; load = 1-min load average (mean of start and end) of the
container (4 cores, no other builder in it). Two rounds, the configurations alternated.

2026-11-24, branch `story-6-3`, load 2.6–3.7 (1-min average; the builder's own browser + Vite only):

| configuration | round 1 FPS (load) | round 2 FPS (load) | mean FPS | vs. off | frame ms p95 | stamps / eyes / sparkles drawn |
| --- | --- | --- | --- | --- | --- | --- |
| `?stress=150` (no blackout) | 12.1 (2.6) | 12.8 (3.6) | 12.4 | — | 100 | 0 / 0 / 0 (darkness hidden, 0 uploads) |
| `?stress=150&blackout=5` (BL3 pitch) | 9.0 (2.8) | 9.4 (3.4) | 9.2 | −26 % | 117–133 | 2 / 150 / 30 |
| `?stress=150&blackout=5&fx=low` | 8.9 (3.0) | 9.0 (3.3) | 9.0 | −28 % | 133–150 | 2 / 150 / 30 |
| `?stress=150&blackout=20` (BL2 moonlit) | 9.5 (3.7) | 10.0 (3.0) | 9.7 | −22 % | 117–133 | 2 / 150 / 30 |

(The stress scene has only my survivor and no lights in view: 2 stamps, my glow and cone. Headless
Chromium is slow here, 9–13 fps; earlier stories measured 8–26 fps in other containers. Compare
the columns, not the absolute numbers. The latest phone floor in `docs/perf/` stays the 4.10 /
Epic 1 rows; nobody has measured the blackout on a phone yet.)

What the numbers say:

- The darkness costs about a quarter of the headless frame rate. **The fallback did not help**: a
  quarter-size darkness canvas (DD2 fallback) measured the same drop (12.8 → 9.3 fps, −27 %), and a
  probe that drew the darkness image without painting or uploading anything (a static texture)
  measured 13.7 → 9.1 fps, the same as the full repaint (9.9 fps). So the headless cost is
  SwiftShader (the CPU renderer) filling one more full-screen blended layer, not the canvas paint,
  the stamps or the upload. Fewer stamps or a smaller canvas cannot remove it; any darkness overlay
  (a GPU mask included) blends the whole screen once. On a phone GPU one full-screen blend is a
  small fixed cost (well under 1 ms on an Adreno 650 class GPU), so the headless drop overstates it.
  **Shipped: half resolution, 48 stamps** (the story's DD2 default). The phone rows below decide.
- The zombie eyes (150 small images) cost about 1 fps of the 9–10 headless (a probe without them:
  8.0 → 9.2 fps in one round).
- `?fx=low` changes only the sparkles (half), so it costs the same (F6: low quality never lightens
  the dark).
- 20 % (BL2 moonlit, soft beams) and 5 % (BL3 pitch, crisp beams) cost the same: the look is only
  the fill colour and the stamp set.

## Phones (to fill: the designer's friends)

Nobody has run these yet. Steps, on each phone, Chrome, landscape, after the next deploy:

1. Open `https://hordes.sevend.io/?stress=150&debug=1`, wait for the 60 s run, note **FPS avg / min**
   from the results (Copy results).
2. Open `https://hordes.sevend.io/?stress=150&blackout=5&debug=1`, the same.
3. Optional: `&blackout=20` and `&blackout=5&fx=low`.

| phone | browser | `?stress=150` FPS avg / min | `&blackout=5` FPS avg / min | `&blackout=20` | `&blackout=5&fx=low` | notes |
| --- | --- | --- | --- | --- | --- | --- |
| Xiaomi Mi 11i (reference) | | | | | | |
| a 2021 mid-range phone | | | | | | |

Target: the blackout costs ≤ 15 % on the Mi 11i. If it costs more, the levers are, in order: the
eyes (fewer, or only the nearest 60), the darkness at quarter size (DD2), stamps 32; tell the main
session.
