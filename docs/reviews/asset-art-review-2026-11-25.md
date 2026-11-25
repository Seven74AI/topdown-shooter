# Review: asset session "photoreal things you build" (2026-11-25)

- Branch reviewed: `claude/dazzling-meitner-zhu5p0` @ f8a16b9, merged with `origin/master` on branch `review-asset-art` (merge commit 40f3865). **The merge was clean: no conflicts.**
- Kind: light review (one checker), client-only. Read: HANDOFF §3, Epic 6 brief 12/13/20/24/31, Epic 7 brief 8/12/13/R2/R11.
- **Verdict: no high findings. 2 medium (phone hitches from the bake during a late join; the arrival banner 12 px from the survivor at 568×320) and 1 medium-or-low (relit cache not covered when Android empties canvases). Fix the two mediums before master; the rest can wait.**

## What I checked

| Check | Result |
|---|---|
| `npm run typecheck` | green |
| Touched tests: standingWalls, wallCorners, buildingFx, hudLayout, hudTopLayout, urlOptions, bossCue, mineLook, objectArt, `tools/checks/noUnregisteredTextures` | 10 files, 109 tests, all green |
| Mutations (each run once, then restored) | 4 of 4 caught: corner kind swapped (wallCorners: 2 fail); "occupied square" check removed (wallCorners: 1 fail); `standDepth` order reversed (standingWalls: 1 fail); mine blink flattened (buildingFx: 2 fail) |
| Headless Playwright, Vite :5895, 800×360, DPR 1, `?stress=5&stressbuild=fort` (+ `&blackout=5`) | Fort draws correctly; corners close the lines; zombie eyes and HP bars show above the blackout; walls stay under the darkness |
| Context loss halfway through the bake (`textureRegistry.rebuildAll()` at 3.3 s, 35 textures rebuilt) | Atlas repaints (relit frames + plain fallbacks), bake carries on into the same canvas and texture, final picture correct. The rebuild itself was a 709 ms long task (whole registry, expected) |
| Long tasks (PerformanceObserver, headless desktop, load ≈ 0) | After boot (one ~1.4–1.7 s long task, the city bake as before): **13–17 tasks of 50–150 ms between ~2.7 s and ~5.8 s**, in all 3 runs (the progressive bake) |
| Atlas size | ≤ 2048² test still green (`standingWalls.test.ts`) |
| Per-frame allocation in `BuildingView.animate` / `buildingFx` | None found: fixed glint pool (24), glow images made once per sprite slot, scratch point reused, pure maths in `glowLevel`/`glintAlpha` |
| Variant randomness | `wallVariant(minX, minY)` is an integer hash of the footprint corner: cosmetic, no seed stream, **the same picture on every phone** for the same spot (also after a reload). OK |
| Darkness/fog (brief 24) | Walls are 10.45–10.6, darkness 11.7: a wall never hides the above-dark slots (eyes 11.71, boss 11.72, telegraphs 11.73, teammates 11.74, …). Bars (12), placement ghost (13) above. Selection outline moved to 10.62 (above walls, under darkness, as it was under darkness before at 4). OK |

Not done: no `?stress=150` FPS before/after (light review, not asked); no real-phone timing; I could not simulate Android emptying the cached canvases (finding 3 is from reading the code).

## Findings

### M1 (medium): the progressive bake causes 50–150 ms frame hitches (desktop), likely 150–500 ms on a Mi 11i, and they can land mid-wave
- Where: `apps/client/src/render/city/buildingsAtlas.ts:245` (`do { … } while (… < budgetMs)`, at least ONE frame per call), called each frame from `apps/client/src/render/BuildingView.ts:179`; the queue is filled at `buildingsAtlas.ts:323` when `GameScene.create` builds the `BuildingView` (`GameScene.ts:686`).
- Why: the 6 ms budget only decides whether to start ANOTHER frame. One relit frame (src canvas at 192–384 px/m, `getImageData` over the whole source, several blurred `shrink` passes) costs 50–150 ms on its own on the headless desktop, so every call overruns the budget 10–25×. 43 frames → ~3 s of long tasks.
- When it hits: at a fresh run start this is the build phase (fine). But the bake runs once per **page load**, starting at the first `GameScene.create`: a **late joiner** (supported: `onlineFlow.ts:68`, `CityView.ts:359`), a reload/rejoin, or a run started straight into combat (`?startwave`, events) gets ~3 s (phone: up to ~6–10 s) of 150–500 ms stalls during a wave. Context loss does NOT re-bake (it repaints from the cache), so that path is fine.
- Fix (minimal): (a) start the bake before the run: call `ensureBuildingsAtlas` + pump from the menu/lobby scene (idle time) so a run usually finds it done; and/or (b) while a wave is active, pump only when `requestIdleCallback`/a frame-time check says there is headroom, or only frames actually shown on screen. Real fix for the ≤ 8 ms per frame budget: make `relight` resumable (process the source in row bands across frames) or run it in a worker with `OffscreenCanvas`. Add a test that `pumpBuildingsAtlas(budget)` processes one *slice*, not one whole frame.

### M2 (medium): the P1 arrival banner ends 12 px from the survivor at 568×320 (rule: 48 px) and is not in the per-mode HUD layout check
- Where: `apps/client/src/scenes/bossBar.ts:68` (banner at bar bottom + 8 px, 226.8 × 54.6 CSS px at scale 0.7); test at `apps/client/src/scenes/hudLayout.test.ts` (the Story 6.14 top-band test only).
- Measured (probe with the test's insets 44/0/44/21, K = 1): 568×320 → banner y 93.2–147.8, **centre gap 12.2 px**; 640×360 and 800×360 → 32.2 px. The test only asserts "no overlap with the top band" and "bottom < h/2", so it passes. Brief 31: every on-screen element is in the ONE layout test with 48 px clearance round the survivor at the centre.
- Scenario: wave 10 starts, the Behemoth's warning shows for its duration + 1.5 s: on a 568×320 phone the plate sits right over the zombies closing on the survivor, exactly when the boss arrives.
- Fix: in `layoutBossBanner` shrink the scale so `y + h ≤ h/2 − 48` (pass the screen height), or place it above the boss bar on short screens; add `boss_arrival_banner` to the per-mode list so the centre-gap rule checks it (no new baseline line).

### M3 (medium-or-low): the relit pictures live in a module cache of canvases the texture registry doesn't know about
- Where: `apps/client/src/render/city/buildingsAtlas.ts:334` (repaint draws `relitCache.get(...).base`), and the glow repaint in `ensureBuildingsAtlas` (draws `relitCache.get(...).bloom`); `relitCache` holds the `relight` output canvases (`relight.ts › shrink`, made without `willReadFrequently`, 18–37 k px each: above Chrome's accelerated-canvas size, so likely GPU-backed).
- Why: the registry doc (`textureRegistry.ts:5-8`) says Android may empty GPU-backed canvases in the background; the project's other helper-canvas caches register a `RebuildPhase.cache` entry (`lightStamps.ts:154`, `FogView.ts:133`). If Android empties these, the atlas repaint copies empty canvases: **every barricade, trap, floodlight and med station becomes invisible after an app switch** (the probe then reports the atlas as not intact and the registry repaints the same blank result again).
- Not reproduced (can't emulate the Android wipe headless). Severity medium if those canvases really get emptied, low otherwise.
- Fix: register `relitCache` in `RebuildPhase.cache`: clear `relitCache` and `FX`, re-queue every relit frame into `bake.queue`; the atlas repaint then draws the plain fallbacks and the pump re-bakes them (or keep the outputs in canvases created with `willReadFrequently: true`, which stay in CPU memory). Add a test that a cache-phase rebuild re-queues the bake.

### L1 (low): corner pieces don't follow wall wear
- Where: `apps/client/src/render/BuildingView.ts:268`: the corner tint is set only in `layCorners` (on a re-lay); wear alone (`BuildingView.ts:365`) re-tints the wall sprites but not the corners.
- Scenario: zombies chew a fort's west wall to 20 %: the wall goes dark, its corner post stays new until something is built or removed.
- Fix: re-tint the corners on the wear path too (store each corner's two wall ids, or recompute the `wear` min when `key` changes).

### L2 (low): walls always draw above every body, not "y-sorted with characters"
- Where: `apps/client/src/render/barricadeLook.ts:123` (10.45–10.6 vs bodies 10, zombies 4.5–5.8, Behemoth 6.2).
- Effect: correct for anyone behind (north of) a wall, which is the intended look; but a picture also reaches up to 0.1 m below the footprint (the standingWalls test allows it) and the side pictures rise 0.8 m north of the footprint's end, so a zombie standing just north of a fort corner or side line's end is fully covered in normal light (visible in the screenshot of the fort's north wall). In the blackout the eyes still show (above-dark slot), so brief 24 holds.
- Fix (optional, designer call): fade a wall picture (alpha ~0.5) while a living body's centre is inside its picture rect north of the footprint, or draw a dim silhouette of occluded survivors. At least add one line to the readability sheet (L3).

### L3 (low): readability sheet not updated for the standing barricades (brief 13)
- `docs/playtests/milestone-1/readability-sheet.md:77,94,97` still shows the old top-down wood/reinforced/metal pictures. The new pictures read as tall walls (clearly "stops bullets" vs the low sandbags/police barriers), but the sheet should show them, incl. the side views and a corner.

### L4 (low): no wiring test for the bake pump (Epic 7 R2)
- Deleting `pumpBuildingsAtlas()` at `BuildingView.ts:179` leaves the atlas on the plain drawings forever and no test fails. Same for the half-baked-atlas + repaint path. Add a small `tools/checks` source check or a unit test with a fake canvas.

### L5 (low, known): BossHud edge panel clamp ignores the left/right/bottom safe insets
- `apps/client/src/scenes/BossHud.ts:145-146`: x clamps to 4 px from the screen edge, y to the bottom edge; only `insets.top` is used. On a notched phone in landscape the DANGER panel can sit under the notch (44 px). Fix: clamp with `insets.left/right/bottom * k`.

### L6 (low): glints are not culled
- `BuildingView.ts:232`: the 24 shared glints go to sprites in list order, on screen or not; with a big base off screen, the on-screen buildings can show none. Cheap fix: skip sprites outside the camera's worldView.

## Things that are fine
- Every new texture (`atlas_buildings`, `atlas_buildings_glow`, `fx_glint`, `hud_*` boss HUD atlas) goes through `addGeneratedTexture` with a repaint; the scan test is green; the bake keeps drawing into the same canvas/texture after a repaint (checked live).
- Depth vs darkness, ghost (13), selection outline (above walls), bars (12): correct.
- The arrival banner is clear of the whole top band and inside the safe area at all four sizes (R11 top-band test extended).
- Variants: deterministic per spot, identical on every client.
