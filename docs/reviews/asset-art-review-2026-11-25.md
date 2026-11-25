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

## Re-review (narrow) 1 — fix commit 60ec1f4 (2026-11-25)

- Branch `rereview-asset-art` = `origin/claude/dazzling-meitner-zhu5p0` @ 60ec1f4 merged with `origin/master` @ d8d44d0 (8.8 + 8.9): **clean, no conflicts.** Looked only at 60ec1f4 (the one fix commit after f8a16b9).
- **Verdict: not clean. 2 medium (M1 only partly fixed: big single steps remain, and the bake now runs ~60 s, into wave 1 of every run), 4 low, 2 nits. M2, M3, L1, L4, L5, L6: fixed as claimed (M3 at the price of R3).**

### What I ran

| Check | Result |
|---|---|
| `npm run typecheck` | green |
| Touched tests: buildingsBake.raster, hudLayout, hudTopLayout, buildingsBakeWiring, noUnregisteredTextures, standingWalls, wallCorners, buildingFx | 8 files, 74 tests, green |
| Mutations (each once, restored) | **6 of 6 caught**: units budget ignored in `pumpBake` (raster: 1 fail); `rebakeAfterCacheLoss` queues nothing (raster: 1); cache-phase callback emptied (wiring: 1); `pumpBuildingsAtlas()` removed from `update` (wiring: 1); banner clamp off (hudLayout: 4); banner scale capped at 0.3 (hudLayout: 4). **Extra, not caught:** removing `|| (showBanner && br.overBar)` (bar hide) → `apps/client/src/scenes` + `tools/checks` 296 green (R6) |
| Step timing, headless Chromium (Vite :5896), real canvases, `pumpBake(b, 1, ∞)` = one step per call, all 43 relit frames | CPU ×1: max step **40 ms**, 29 steps > 6 ms, 5 > 16 ms. CPU ×4 (`Emulation.setCPUThrottlingRate`): max step **175 ms**, 68 > 6 ms, 37 > 16 ms |
| Default budgets `pumpBake(b, 20000, 6)` until done | ×1: **3 538 calls**, median 0.10 ms, max 43.8 ms, 4 calls > 16 ms. ×4: 3 590 calls, median 0.5 ms, max 168 ms, 37 calls > 16 ms, 6 > 50 ms (big calls at indices 0–500 are 120–175 ms; 16–57 ms ones go on up to call 3 253) |
| In-game, `?stress=5&stressbuild=fort`, 800×360, headless | Frames ready every 7 s: 4, 9, 15, 20, 26, 32, 36, 40, **43 at ~63 s** (build phase is 30 s, `waves.json buildPhaseS`). Long tasks > 50 ms after 3 s: 2 (max 101 ms), was 13–17 |
| Picture vs pre-fix (node, `@napi-rs/canvas`, same source drawn, old `relight` from f8a16b9 vs new `relightSteps`) | Different on every frame: mean abs diff 0.03–3.0 levels/channel, max 67 (spike trap 3.0, floodlight_b 1.2, med station 1.0); glint spot counts differ on 8 frames by ±1–2. Total relight CPU 1.53 s vs 1.17 s (+30 %) (R8) |
| M3 live: `textureRegistry.rebuildAll()` mid-bake (1/43 ready) and after a forced full bake | Both: 36 rebuilt, 0 failed; buildingFx 0/43 after; buildings drawn (plain fallbacks, screenshot), never blank; bake resumes once (no double queue); 1 canvas in the DOM. After a completed bake the whole 43-frame bake starts again (R3) |
| M2 probe: `layoutBossBanner` at 568×320, 640×360, 800×360, 844×390 (+568×300, 480×270), insets 44/0/44 and 0/0/0 and 44/20/44, k 1 and 2 | 48 px kept everywhere; **`overBar` true at every size** (R5); top inset 20 shrinks to 41 % at 568×320 (R7) |

### Findings

#### R1 (medium): M1 partly fixed — two indivisible steps per picture still cost 30–175 ms
- Where: `apps/client/src/render/city/buildingsAtlas.ts:172` (the whole source drawing happens before the first yield) and `apps/client/src/render/city/relight.ts:124` (`getImageData` of the whole source in one step). The 6 ms guard is only checked *between* steps.
- Measured: source draw 30–56 ms at ×4 on fronts/corners; readback of the wood side walls (192×538) 123–167 ms at ×4 (≈ 40 ms at ×1). That is 37 frames > 16 ms and 6 > 50 ms per bake on a ×4 phone, the worst (120–175 ms) in the first ~500 pump calls.
- Scenario: late joiner / reload into a wave on a Mi 11i-class phone: six 120–175 ms stalls in the first ~8 s, then ~30 stalls of 16–57 ms.
- Minimal fix: draw the source in row bands (clip + translate, yield per band) and read it back in bands (`getImageData(0, y, W, band)`, yield per band), or move the relight to a worker with `OffscreenCanvas`. Weight these steps by real cost in the test (the raster test counts them as `W·H/8` units, the cheapest per-unit-time rating of all, see R2).

#### R2 (medium, new): the bake now takes ~3 500 frames (~60 s at 60 fps), so every run's wave 1 gets the pop-in and the remaining spikes
- Where: `buildingsAtlas.ts:247` `BAKE_UNITS_PER_FRAME = 20000`; units are a row (= W) for every row pass, but a row costs ~0.005 ms on desktop, so the units budget ends a call after ~0.1 ms (×1) / 0.5 ms (×4) — the 6 ms guard almost never acts.
- Measured: 3 538 calls (×1); in-game 43/43 at ~63 s; build phase is 30 s.
- Scenario: a fresh solo/online run: barricades, floodlights, med stations show the plain drawings through the whole build phase and switch to the relit look one by one during wave 1 (on a 30 fps phone during wave 2); the R1 spikes after call ~1 800 land in wave 1 for every player, not only late joiners (what the original M1 was about).
- Minimal fix: let time drive the slice: `BAKE_UNITS_PER_FRAME` ≥ ~400 000 (or `Infinity`, keeping the 6 ms guard) — ≈ 240 frames (4 s) desktop, ≈ 1 050 frames at ×4 — together with R1's banding so no single step exceeds the guard; keep the "many calls per picture" raster test with its small budget.

#### R3 (low): every graphics restore now throws the whole relit cache away and re-bakes 43 pictures
- Where: `buildingsAtlas.ts:381` (cache-phase entry, no intact check) → `rebakeAfterCacheLoss` `buildingsAtlas.ts:307`. The registry runs every entry on each restore, which on Android is every app switch (`textureRegistry.ts:5`).
- Verified live: full bake done → `rebuildAll()` → buildingFx 0/43, pump running again. With R2 that means another ~60 s of plain drawings + R1 spikes after each app switch, even when Android kept the canvases (before the fix: an instant repaint from the cache).
- Buildings never vanish (plain fallbacks), no double bake, no extra DOM canvases: the M3 goal itself is met.
- Minimal fix: pass an `isIntact`-style check in the callback (read 1 px of a few cached `base` canvases; re-queue only when they read back empty), or keep the outputs on `willReadFrequently: true` canvases (CPU-backed, not wiped) and drop the re-bake.

#### R4 (low): a restore mid-bake drops the running job without releasing its canvases
- Where: `buildingsAtlas.ts:311` `b.job = null`. The job's source canvas is zeroed only after the last step (`buildingsAtlas.ts:174`), the relight's scratch canvases only in `release()` at the end (`relight.ts:283/304`).
- Scenario: Safari/iOS, restore during the bake: up to ~6 canvases (source 192×538…512×512 + shrink scratches) keep their backing store, the very leak `relight.ts:282` says it avoids.
- Minimal fix: `try { … } finally { release(); }` in `relightSteps` (and zero `src` in a `finally` in `bakeSteps`), and call `b.job?.steps.return()` before dropping the job.

#### R5 (low): the banner takes the bar's place on every screen, not only short ones
- Where: `apps/client/src/scenes/bossBar.ts:84`. Under the bar the banner ends at 147.8 px; at 844×390 the limit is 147.0 (misses by 0.8 px), so `overBar` is true at all four target sizes and the "under the bar" branch never runs on a landscape phone. Comment/commit say "short screens".
- Boss HP readability (brief 21/24 question): the bar is visible only from WALK on (`GameScene.ts:1783`), and the banner is held 1.5 s after WARNING (`BossHud.ts:30`), so the bar is missing for **the first 1.5 s of the fight only**, boss at full HP. It never vanishes for longer than the banner. Acceptable.
- No overlap: the banner box (60.2–114.8 at 640×360) is clear of the top band and wave line at all sizes (hudLayout assertion + probe).
- Minimal fix (optional): drop the banner (or the hide) as soon as the boss leaves WARNING, so the bar is never hidden during the fight; fix the comment.

#### R6 (low): the bar hide in BossHud has no test (Epic 7 R2)
- Where: `apps/client/src/scenes/BossHud.ts:87` `|| (showBanner && br.overBar)`. Mutation: removed → the banner draws over the boss bar at every size; 296 scene/check tests stay green.
- Minimal fix: one line in `tools/checks/buildingsBakeWiring.test.ts`-style source check (or a BossHud unit with a fake scene) that the bar is hidden while `overBar` banners show.

#### R7 (nit): with a top inset the banner shrinks below the 60 % floor the test asserts
- `bossBar.ts:85`: `Math.max(0.05, …)`; 568×320 with `insets.top` 20 → 41 % of the art width, 480×270 → 9 %. The test only runs top = 0 (landscape phones usually report 0, so rare). Fix: floor at 0.6 and drop the 8 px gap / move the banner over the wave line's band instead, or add a top-inset case.

#### R8 (nit): the relit pictures changed (noise table dropped), not re-approved
- Mean abs diff up to 3.0 levels/channel (spike trap), max 67; glint counts ±1–2 on 8 frames; +30 % relight CPU. Same look family; the table was not the cause of the long steps. Either keep the table or note the change in `docs/art/photoreal-decisions.md` for the designer.

### Sanity (fixed as claimed)
- **L1**: `tintCorners` runs on every draw-key change (wear alone too), no allocation; only when the key changes (`drawPlaced` early return), O(corners × buildings).
- **L4**: wiring test catches a removed pump / removed gallery bake / emptied cache entry (mutations above).
- **L5**: `BossHud.ts:149-150` clamps with `insets.left/right/bottom`.
- **L6**: `BuildingView.ts:234` skips sprites outside `worldView` ± 2 m, before the glint loop; glow pulse still runs for all (fine).
- Per-frame allocation in the generator path: one iterator result per step (~66 per frame at default budgets), plus the per-picture typed arrays as before. Negligible.
- Starvation: impossible (each call does ≥ 1 step); the slowness is R2, not the guard.

## Re-review (narrow) 2 — fix commit 63a7ae2 (2026-11-25)

- Branch `rereview2-asset-art` = `origin/claude/dazzling-meitner-zhu5p0` @ 63a7ae2 merged with `origin/master`: **already up to date, no conflicts.** Looked only at 63a7ae2 (the one asset commit in `60ec1f4..63a7ae2`; the rest are master merges / 8.8–8.9).
- **Verdict: clean for the main path (no medium or higher). R1, R2, R3, R5, R7, R8 fixed as claimed; R4 fixed (half-tested); R6 only half fixed. 4 low, 3 nits, all on edge paths (fallback, restore timing, tests).**

### What I ran

| Check | Result |
|---|---|
| `npm run typecheck` | green |
| `npm run build` | green; emits `dist/assets/buildingsBakeWorker-BmAoRs4f.js` (45 kB, self-contained IIFE: no chunk imports, no DOM use on the worker path); main bundle references it as `new URL("/assets/buildingsBakeWorker-….js", import.meta.url)`, `{type: "module"}` |
| Touched tests + checks: buildingsBake.raster, objectArt, standingWalls, mineLook, hudLayout, hudTopLayout, buildingsBakeWiring, noUnregisteredTextures, buildingFx | 9 files, 86 tests, green |
| Production build (`vite preview` :5899) at `/j/ABCD/?stress=5&stressbuild=fort`, headless Chromium | worker URL `/assets/buildingsBakeWorker-….js` (absolute, base `/`), 1 worker, 43/43 pictures posted back in 2.0 s, no errors. `deploy/Caddyfile`: no CSP header (nothing to block a worker); `/assets/*` is served by `file_server` (JS MIME, immutable cache) → same behind the Cloudflare tunnel |
| Worker failure (dev :5898, route override of the worker script): 404 / throws on first message / HTML instead of JS / never answers | 404, throw, HTML: `error` fires → main-thread fallback bakes all 43 (done ~5 s after start), no stall. **Never answers: no timeout, the relit look never comes (L2)**; plain drawings stay, pump cost 0.1 ms |
| In-game main-thread pump time (`pumpBuildingsAtlas` wrapped in dev via route), 800×360, `Emulation.setCPUThrottlingRate` | **Worker ×1**: max **3.6 ms**, 0 calls > 6 ms, bake done 2.4 s after the first pump. **Worker ×4**: max **16.5 ms** (claim 17.7), 34 calls > 8 ms, 1 > 16 ms; done 4.9 s after the first pump (CDP throttles the page's main thread, not the worker: a real ×4 phone's worker is slower, the claim's ~15 s is plausible). Long tasks > 50 ms after 3 s: 3 (61–92 ms at 7.7–7.9 s, before the first picture landed: scene start, not the bake) |
| Fallback forced (`OffscreenCanvas` removed before load) | ×1: max pump **44.7 ms**, 10 calls > 16 ms, done ~4.9 s. ×4: max **59.8 ms**, 44 calls > 16 ms, done ~18.7 s; 19 long tasks 51–83 ms during the bake (L1) |
| Fallback steps attributed (gallery page, ×4, each `bakeSteps().next()` timed) | step 0 (the drawing): max 61 ms. **step 1 (the first 32-row readback band): 115–168 ms on the wood side walls** — Chrome records the drawing lazily and the first `getImageData` pays for it (L1) |
| Graphics restore (`textureRegistry.rebuildAll()` live, worker ×4) before the first picture / after 10 / after all 43 | 39 rebuilt, 0 failed, 1 canvas in the DOM, 1 worker, buildings never blank in every case. After 10 or 43: **intact, nothing re-baked (R3 fixed)**, 43/43 in the end. **Before the first picture: the worker bakes the whole set twice** (86 messages, gen 0 dropped), done at 19.6 s instead of ~12 s (L3) |
| R8: 583388c's own pipeline (worktree, its `relitOf`, node `@napi-rs/canvas`) vs current `bakeSteps`, FNV-1a of base (and bloom) | mine `2def4a61` = `2def4a61` (= the pinned digest), bloom equal; bear trap open/closed, floodlight a/b, med station: **identical** base and bloom. Spike trap differs (`812b1b08` → `f7d68776`): its `srcPxPerM: 256` came with step 2 (95cca5b), not with these fixes (N1) |
| Mutations (each once, restored) | Caught: `bossBarHidden` → `!bossVisible \|\| bannerShown` (hudLayout 4 fail); banner 12 px lower floor (hudLayout 1); sentinel check ignored (raster 1); `intact` always false (raster 1); `src.width = 0` in `bakeSteps` finally removed (raster 1). **Not caught**: BossHud calls `!m.bossVisible` instead of `bossBarHidden(…)` → `apps/client/src/scenes` + `tools/checks` 296 green (L4 = R6 again); `release()` in `relightSteps`' finally removed → raster green (N2); worker `onerror` no longer re-queues the in-flight frames → `apps/client/src/render` + `tools/checks` 770 green (N3) |
| `atlas_buildings` callers (grep across `apps/client`, `tools`) | every `add.image` / `setTexture` takes the key from `textureOfFrame` / `buildingFrame` / `standingFrame` / `cornerFrame`: BuildingView pool + ghost + placed + corners, HudScene build-bar icons; no BuildSelectView / shop card uses the atlas; gallery iterates every texture key (the three new sheets appear as their own groups). No missed caller |
| ImageBitmaps | closed after the copy (`buildingsAtlas.ts:144-145`) and on a stale generation (`:212-213`); in the worker the sources go through `bakeSteps`' / `relightSteps`' finally |
| Scene restart | textures are game-wide and `ensureBuildingsAtlas` is idempotent (`:280`): a restarted GameScene reuses the sheets and the one worker; results land in live canvases; no second worker |

### Findings

#### L1 (low): the fallback still has 60–170 ms stalls at ×4 — the banded readback doesn't bound the first band
- Where: `apps/client/src/render/city/relight.ts:130` (first `getImageData` band) after `apps/client/src/render/city/buildingsFrames.ts:171` (the drawing, one step).
- Measured: ×4, first band 115–168 ms on wood side walls (it flushes the recorded drawing), drawing step up to 61 ms; in-game ×4 fallback max pump 59.8 ms, 44 calls > 16 ms, 19 long tasks > 50 ms over ~12 s.
- Scenario: only where there is no `OffscreenCanvas.transferToImageBitmap` (iOS ≤ 16.3) or the worker fails: wave-1 hitches as in R1 before. The worker path (every current browser) is clean.
- Minimal fix: draw the source in row bands (clip per band, read that band right after it is drawn), or accept and note it as the old-browser path.

#### L2 (low): a worker that never answers leaves the relit look missing for the whole session
- Where: `buildingsAtlas.ts:217` handles `error` only; no timeout, no `messageerror`.
- Scenario: the OS kills or hangs the worker without an `error` event (memory pressure on a phone): plain drawings forever, `pumpBake` returns true forever (cheap, 0.1 ms).
- Minimal fix: if no result arrived N s (e.g. 20 s) after the last post, terminate and move `inFlight` back to `queue` (the same code as `onerror`).

#### L3 (low): a restore before the first picture lands makes the worker bake everything twice
- Where: `buildingsAtlas.ts:239` `let intact = relitCache.size > 0` → an empty cache counts as lost → `gen++` and a second full job is posted (`:260`) behind the running one, whose 43 results are then dropped.
- Measured: ×4, restore at 8.1 s → 86 messages, done 19.6 s instead of ~12 s.
- Minimal fix: in worker mode, an empty cache with frames in flight is intact (nothing was kept, so nothing was lost): `let intact = relitCache.size > 0 || (b?.worker !== null && b?.inFlight.length > 0)`.

#### L4 (low): R6 only half fixed — BossHud's use of the helper is untested
- Where: `apps/client/src/scenes/BossHud.ts:87`. The new `bossBarHidden` truth table is tested, but replacing the call with `!m.bossVisible` (the R6 regression) keeps all 296 scene/check tests green.
- Minimal fix: a one-line source check in `tools/checks` (like `buildingsBakeWiring.test.ts`) that BossHud hides the bar via `bossBarHidden(…, showBanner, br.overBar)`.

#### N1 (nit): R8 holds for 6 of 7 frames; the spike trap differs from step 1
- Its relight source went from 384 to 256 px/m in step 2 (95cca5b), so it is not the picture on the approval page bit-for-bit. Not caused by these fixes; worth one line in `docs/art/photoreal-decisions.md`, or pin its digest too so the next change is seen.

#### N2 (nit): R4's `release()` in `relightSteps` has no test
- Removing `relight.ts:314` keeps the raster suite green (the R4 test checks only the source canvas). Fix: in the R4 test, also check that every canvas `make` created after the source is width 0 after `return()`.

#### N3 (nit): worker-side code paths have no tests
- `onerror` re-queue, stale-generation drop and bitmap close are browser-only; mutating the re-queue stays green. A small fake-`Worker` unit test of `sendToWorker`'s handlers would cover them. Also: the worker stays alive (idle) after the bake; harmless, can be `terminate()`d when `inFlight` empties and re-made on a restore.

### R7 note
- Floor 35 % under a 20 px top inset justified by the plate's 34 px type → ≥ 11.9 px at the floor vs the boss bar's 11 px name; tightest real case 41 % (568×320). `K = 1` in the test, so the ratio check is honest. Accepted.
