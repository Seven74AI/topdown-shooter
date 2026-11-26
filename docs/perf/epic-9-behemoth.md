# Epic 9 photoreal Behemoth: frame rate, bake time, main thread (Story 9.15)

Story 9.15 draws the Behemoth with the approved take C model, relit in a Web Worker (the look in play only, predicted
from the run seed and baked after the characters' bake), with its layers: the roar's crossfade picture, the vein +
split glow (enraged), the sheen (walk frames), two eye sprites, and a 40-particle dust pool (`?fx=low`: no sheen, 20).

## Method

As `epic-9-characters.md`: dev build (Vite) on this builder's own port (5391), master `d8ffaee` from its own worktree
on 5392; Playwright Chromium (headless, SwiftShader CPU renderer) at 844 × 390, DPR 2; CPU throttle via CDP; steady
state (warm-up starts once the characters' bake and, on the branch, the boss bake have landed); 8 s warm-up, then a
12 s `requestAnimationFrame` count; p95 from the same frames (60 Hz buckets: 66.7 / 83.3 / 100 / 116.7 / 133.3 ms);
load = 1-min load average (start/end mean), 4 cores, 2026-11-26. Compare columns, not absolutes.

Three scenes:
- **`?stress=150`** (AC gate): 150 Walkers, no Behemoth on the street (the branch still bakes the predicted look in
  the background, ~3.5 s after the characters' bake).
- **Boss fight** `?solo=1&bosswave=1&zdmg=0`: the real wave-1 Behemoth (sim running) moved next to the player; every
  run is a different fight (attacks, zombies), so it is noisy.
- **Boss scene, controlled**: the same page, sim paused, the ENRAGED Behemoth walking back and forth in view, driven
  identically on both builds (the worst case for the layers: enraged picture + vein glow + sheen + eyes).

## Results

| scene | build | FPS per round | mean | vs master | p95 ms per round | load |
| --- | --- | --- | --- | --- | --- | --- |
| stress=150, 1× | master | 11.9 / 12.7 | 12.3 | — | 100 / 100 | 0.8–0.9 |
| stress=150, 1× | branch | 12.0 / 13.0 | 12.5 | **+0.2** | 100 / 100 | 0.5–1.2 |
| stress=150, 4× | master | 8.8 / 9.0 | 8.9 | — | 133 / 150 | 1.4–1.5 |
| stress=150, 4× | branch | 9.2 / 8.8 | 9.0 | **+0.1** | 133 / 150 | 1.2–1.5 |
| boss fight, 1× | master | 13.0 / 13.8 / 13.5 / 13.0 | 13.3 | — | 100 / 83 / 83 / 100 | 1.1–1.5 |
| boss fight, 1× | branch (before the crop) | 12.7 / 12.6 / 13.4 / 11.6 | 12.6 | −0.7 | 100 / 100 / 83 / 117 | 1.1–1.5 |
| controlled boss, 1× | master | 14.7 / 15.2 / 14.4 | 14.8 | — | 83 / 83 / 83 | 0.7–1.3 |
| controlled boss, 1× | branch (shipped: cropped layers) | 14.3 / 13.8 / 14.0 | 14.0 | **−0.8** | 83 / 100 / 100 | 0.7–1.3 |
| controlled boss, 1× | branch before the crop | 13.7 / 11.5 / 12.3 / 12.7 / 13.0 | 12.6 | −2.2 | 100 / 133 / 100 / 100 / 117 | 1.0–1.5 |

- `?stress=150` is within AC 8 (≤ 2 FPS, p95 same bucket) at 1× and 4×.
- With the Behemoth on screen the layers cost fill in the software renderer: −2.2 FPS before, −0.8 FPS after cropping
  every relit picture to its opaque box (B8: the 7 m frame is mostly empty; the vein glow and sheen were drawn as full
  additive quads). The p95 is one 60 Hz bucket (16.7 ms) up in 2 of 3 controlled rounds: 3 extra additive draws (vein,
  sheen, eyes) in the CPU renderer. A probe with the layers switched off measured 13.9 vs 12.6 FPS before the crop.
  On a real GPU these are 3 small draws; the Mi 11i check is the designer's (not verified here).

## Bake

| | 1× | 4× |
| --- | --- | --- |
| look bake (30 jobs: 16 calm, 13 enraged, the death glow), worker | 2.9–3.9 s | 4.1–5.4 s |
| main thread, one sheet made (12 sheets, one a frame, nothing else that frame) | ≤ 4–10 ms | ≤ 16–22 ms |
| main thread, a landing (pixels into a sheet) | ≤ 2–9 ms | ≤ 9 ms |
| main thread, one sheet upload (512²) | ≤ 4–11 ms | ≤ 14–24 ms |

Before the sheets were paged in first, one landing could make up to three sheets at once (43 ms at 4×). The worker's
own draw + relight is ~126 ms per frame on an idle page (504² source).

Memory: 11 sheets of 512² + one 1008 × 504 sheen sheet ≈ 13.5 MB of GPU texture for the look in play (the plain atlas
stays 2048², 16 MB, as before); no kept CPU copies (B7: a wiped sheet re-bakes, the plain atlas shows meanwhile).
