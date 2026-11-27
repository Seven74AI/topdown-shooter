# Epic 1 stress test: 150 Walkers in view (NFR1)

Story 1.11. This note records whether 2021 mid-range phones can run the Epic 1 horde. Story 1.12 and Epic 10 follow up on any misses.

## Target (NFR1)

- **Average 60 FPS**, and **never below 30 FPS**, on the reference phones: iPhone 12 class (Safari) and Pixel 5 class (Chrome).
- The full NFR1 check (a wave 9 blackout with 150 alive zombies in one player's view) comes in Epic 10. Epic 1 measures the same zombie count with the content that exists now: 150 Walkers inside the camera view.

## Method

1. Open the published link with `?stress=150`, for example `https://<pages-host>/topdown-shooter/?stress=150`. It works in release builds; no dev build is needed.
2. The scenario is fixed:
   - a new run with the Pistol;
   - god mode on (the survivor takes no damage);
   - the wave director paused;
   - 150 Walkers placed at seeded random points inside the camera view, at least 2.5 m from the survivor;
   - the performance overlay on.

   The Walkers close in at once and crowd the survivor, so all 150 stay in view, pushing against each other (crowd separation and overlap resolution run every tick).
3. Hold the phone in landscape. Don't touch the screen; touching is allowed but adds firing cost. Keep the tab in front and the screen awake.
4. Timing starts after a 2-s warm-up (scene creation, texture upload) and runs for **60 s**. The overlay counts down (`stress 150: 37 s left`).
5. A summary then appears, with a **Copy results** button. Paste the copied text (it includes a ready-made table row) into the table below, and replace `(device)` with the phone model.

### What the numbers mean

| Field | Meaning |
|---|---|
| avg FPS | frames ÷ measured time (1000 / mean frame interval) |
| min FPS | 1000 / the longest single frame of the run (the strictest reading of "never below 30") |
| worst second | fewest frames in any whole second of the run |
| % < 30 | share of frames longer than 33.3 ms |
| tick avg / max | duration of one 20 Hz simulation step (`step()` in `LocalSimHost`, timed with `performance.now()`) |
| render | Phaser's render pass, CPU side (POST_STEP → POST_RENDER). With WebGL, the GPU works after this, so GPU cost shows up as frame time that isn't update + render. |
| update | input, scene updates and the simulation steps of the frame (PRE_STEP → POST_STEP) |
| bottleneck | `none` when the target is met; otherwise `simulation` if tick avg > 8 ms, else `rendering/GPU`. Both numbers are printed so the call can be checked. |

The frame interval runs from one Phaser `PRE_STEP` to the next. Gaps over 1 s (a hidden tab) are not counted.

### Other tools

- **Overlay:** `?debug=1`, or a **three-finger tap** (3 touches within 300 ms) to toggle it in any build. It shows FPS (current and 1-s minimum), zombies alive and in view, tick time (average and max) and render time.
- **Dev cheats** (dev builds only, `npm run dev`): the ⚙ button or the backtick key. They can spawn N (1–200) zombies of a type around the survivor or inside the view, skip the wave, leave the wave's last 5 (starts the rush), toggle god mode, toggle the overlay, and restart with a typed seed. Release builds don't contain them; CI checks the built JS (`tools/checks/noCheatsInRelease.test.ts`, run after `npm run build` with `REQUIRE_DIST=1`).
- **`window.__game`** (dev builds only) is the Phaser game, for automated browser checks. For example:
  - `__game.scene.getScene('Game').debugWorld` is the running World;
  - `.debugView({x:0,y:0,w:0,h:0})` is the camera rectangle in meters;
  - `.restartRun(seed)` restarts the run with a seed.

## Results

| device | browser | avg FPS | min FPS | worst second | % < 30 | tick avg / max ms | render ms | bottleneck | target |
|---|---|---|---|---|---|---|---|---|---|
| **Headless desktop, not a reference phone.** Linux container, Xeon, 4 vCPU, SwiftShader software GL, 844×390 @ DPR 2 | HeadlessChrome 157 (Playwright), release build (`vite preview`) | 27.1 | 16.9 | 23 | 92.74 | 0.19 / 1.80 | 0.23 | rendering/GPU | missed |
| **iPhone 15 Pro** (designer, 2026-11-21; above the iPhone 12 reference class), 958×401 @ DPR 2, iOS 18.7 | Brave (WebKit, Safari engine) | 60.0 | 38.5 | 59 | 0.00 | 0.56 / 2.00 | 0.79 | none | **met** |
| *iPhone 12 class* (designer) | Safari | parked (designer 2026-11-25; Story 10.2 AC 8) | | | | | | | |
| **Honor 10** (designer, 2026-11-21; 2018 Kirin 970, older than the Pixel 5 reference class), 808×332 @ DPR 2, Android 10 | Chrome 156 | 58.3 | 6.3 | 39 | 0.49 | 0.91 / 2.50 | 1.67 | rendering/GPU | missed (single-frame hitches) |
| *Pixel 5 class* (designer) | Chrome | parked (designer 2026-11-25; Story 10.2 AC 8) | | | | | | | |

### Headless desktop, for reference (2026-11-21)

These runs show where the cost is. They say nothing about phones: the GPU is a software rasterizer on the CPU.

| run | avg FPS | min FPS | worst second | % < 30 | tick avg / max ms | render ms | update ms |
|---|---|---|---|---|---|---|---|
| `?stress=150`, DPR 2 (1688×780 canvas) | 27.1 | 16.9 | 23 | 92.74 | 0.19 / 1.80 | 0.23 | 0.29 |
| `?stress=150`, DPR 1 (844×390 canvas) | 58.4 | 22.3 | 45 | 0.11 | 0.16 / 2.70 | 0.18 | 0.11 |
| `?stress=1` (1 Walker), DPR 2 | 43.3 | 26.6 | 37 | 0.15 | 0.03 / 1.40 | 0.16 | 0.09 |

**Reading:**

- The simulation costs about 0.2 ms per step for 150 crowding Walkers, 40× under the 8-ms line. It is not the bottleneck.
- Frame time is almost all GPU fill. Even with 1 Walker, the software rasterizer manages only 43 FPS at DPR 2, and quartering the pixels (DPR 1) brings 150 Walkers to 58 FPS.
- On a real phone GPU the fill cost is far lower, but DPR 2 at full screen is still the first thing to watch. Epic 10 levers, not applied here:
  - render-scale or DPR cap below 2;
  - fewer overdraw layers (street grid, blood decals);
  - texture atlas.

### Reading of the phone results (2026-11-21)

- **iPhone 15 Pro: target met** (60 FPS average, slowest frame 38.5 FPS).
- **Honor 10: smooth on average but hitches.** The average is 58.3 FPS and the worst whole second is still 39 FPS, above 30. About 0.5 % of frames (≈ 17 in 60 s) took longer than 33 ms, and the single worst frame was ~160 ms.
  - Cause: rendering-side hitches, not the simulation (0.9 ms per tick). Garbage collection or a GPU stall are the likely causes; we haven't confirmed which.
  - It is a 2018 phone, below the 2021 reference class.
- **Follow-up:** Story 10.2 (frame-rate pass) profiles these hitches on Android. Suspects:
  - per-frame allocation on the render path (HUD text updates, tween objects);
  - the first frames after a texture first appears;
  - Chrome's GC on a 4 GB device.
  - A cheap check before then: rerun with the performance overlay hidden (it re-renders text 4×/s).
- Still wanted: a 2020–2021 mid-range Android (Pixel 5 / Galaxy A52 class).

## Human step (designer)

Run `?stress=150` on the published link on an iPhone 12-class and a Pixel 5-class phone, press **Copy results**, and fill in the two phone rows above. If a phone misses the target, keep the bottleneck label and both numbers for follow-up in Epic 10. Story 1.11 is done when these rows are filled, or when the designer agrees to defer them to Story 1.12 (real-phone playtest).
