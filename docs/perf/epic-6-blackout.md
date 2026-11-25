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

Note (review M1, after these measurements): the darkness now reaches 3 % past each screen edge (so a
camera shake never opens a lit strip), which makes the darkness canvas and its upload about 12 %
bigger. Not re-measured headless (the headless cost is the full-screen fill, which the pad barely
changes); include it in the Mi 11i check below.

## Stories 6.2 + 6.4: Ruins and Collapse (headless)

2026-11-24, branch `story-6-2`, same setup (solo dev build, `?stress=150`, 844 × 390 at DPR 2, 4 s
after the switch, then a 12 s `requestAnimationFrame` count). The stage and the blackout are set
through the dev cheats (`setDecayStageCheat`, `setForcedBlackoutCheat`) in the stress scene's build
phase, so the build-phase fog (13 → 14 m) is on at stage 5. Load 0.8–2.2 (only this builder's Vite
and browser). Two rounds:

| configuration | round 1 FPS | round 2 FPS | mean | note |
| --- | --- | --- | --- | --- |
| stage 1, no blackout | 16.0 | 16.9 | 16.5 | baseline |
| stage 4 (rubble baked, lamp flicker, dust puffs) | 16.3 | 15.8 | 16.1 | −2 % (noise): rubble is in the bake; ≤ 11 drop-out discs, ≤ 100 dust particles |
| stage 3 + blackout 10 % (no fog) | 12.1 | 12.1 | 12.1 | 6.3's darkness alone |
| stage 5 + blackout 10 % + fog CO1 haze | 11.2 | 11.2 | 11.2 | fog in the darkness texture: −7 % vs the blackout alone |
| stage 5 + blackout 10 % + fog CO2 bank | 11.3 | 10.9 | 11.1 | the two noise layers cost about nothing |
| stage 5 + blackout + fog, `?fx=low` | 11.9 | 11.0 | 11.5 | |

Bake time at stage 4 (`CityView.bakeMs`, one bake per stage, headless): 180–220 ms with the rubble
and roofs (a stage 1–3 bake was not timed in these runs to compare); a style or material switch rebakes once (98–124 ms
when only the overlay changes). Not measured on a phone; the Mi 11i rows above decide (the fog adds
one half-resolution canvas fill and composite per frame on the CPU, no extra full-screen GPU layer).

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

## Story 6.11 + 6.12: endless (server tick, memory)

Headless container (4 vCPU), `npx vitest run`, Node, no phone.

| Case | Load (1 min) | Tick p99 | Mean | Notes |
| --- | --- | --- | --- | --- |
| Wave 10, 4 players, 150 alive (real mix, no Behemoth: `bossWaves = []`) | 0.47 | 1.125 ms | 0.653 ms | `apps/server/src/run/tickCostEndless.test.ts` baseline |
| Wave 19 endless, 4 players, 600 zombies (wave 9's mix, 11 Brutes ≤ 6 alive, HP × 1.24), 150 alive | 0.47 | 1.837 ms | 0.787 ms | +0.71 ms p99 over wave 10 (Brutes + more Bloaters/Spitters alive at the cap); well inside the 50 ms tick |
| 20-wave endless flow sim (waves 11–30, every real system, kills by hand) | 0.64 | 0.571 ms | — | `packages/shared/src/economy/endlessSim.test.ts`; heap 41.2 MB at wave 11 → 38.5 MB at wave 30 (flat); pooled sizes equal at 11 and 30 |

Not measured: the wave-25 Behemoth wave at 110 alive with blackout + fog on a phone, and headless FPS for
it (`?startwave=25`): the darkness/fog FPS case is 6.3/6.4's, the Behemoth's 6.5's; the vote itself
is an HTML overlay and one helicopter sprite on a cleared map.
