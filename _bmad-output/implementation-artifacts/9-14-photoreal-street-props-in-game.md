# Story 9.14: Photoreal street props and vehicles in the game

Status: review

## Story

As a player,
I want the approved photoreal cars, bus and street props in the city,
so that the whole street matches.

Approved look (designer 2026-11-25): `docs/art/photoreal-1/compare.html` (source `docs/art/photoreal-1/src/pilot.ts`, renderer `src/relief.ts`, build `src/build.mjs`): cars on a real-sedan body, burnt cars without rust, sharp dumpster, pump, rubble, sandbags, both barriers. Police standing set approved in `apps/client/src/render/city/barricadeArt.ts:1080–1226` (`drawPoliceFront`, `drawPoliceSide`, `drawPoliceCorner` = traffic drum; page `docs/art/photoreal-3/compare.html`). Decisions: `docs/art/photoreal-decisions.md` ("these need the switch to pre-made image files"; "the police barricade is a street prop baked into the city's ground: it gets the standing look with the street props' rollout").

## Acceptance Criteria

1. **The look.** Cars (5 colours, b and d wrecked), burnt cars, the bus, dumpster, gas pump, rubble block and sandbags in the city use the pilot's look (frames `vehicle_car_a…e`, `vehicle_carburnt_a…e`, `vehicle_bus_a`, `prop_dumpster_a`, `prop_pump_a`, `prop_block_a`, `prop_sandbags_a`; same names and pixel sizes, 64 px/m), at every decay stage where they appear (curb cars stage 1, moved cars stage 2, burning cars stage 3, buried dumpster stage 4). Fire still swaps a car to its burnt frame. A still at 844×390 DPR 2 next to `compare.html` reads as the same look.
2. **Pre-made image files (B1).** The pictures are rendered offline by a committed tool script from the approved pilot code and shipped as image files loaded by the Phaser loader under the same texture key / frame names. The game does not run the relief renderer. The architecture line "no character/district PNGs" (`game-architecture.md` asset loading row + project tree :321) is updated to say street props / vehicles ship as pre-rendered atlases (story 9.14); characters stay code-baked (9.13). The download added is ≤ 2 MB and the first-load budget (15 MB / 10 s on 4G) still holds.
3. **Survives graphics loss.** After an Android app switch / context loss the props come back (the loaded image re-uploads, or the canvas copy CityView reads is repainted from it through `addGeneratedTexture`). `noUnregisteredTextures` stays green.
4. **Police sawhorse lines stand.** The sawhorse police lines (stage 2 Panic: `police_line_lot` 9.5 m, `police_line_gas` 10 m N–S, and any other line `barrierStyle` makes a sawhorse) are drawn with the approved standing police set (front / side pictures repeated along the line's length, a part-picture or trimmed spacing at the end — no gaps, no overhang beyond the map box), sorted like the 9.11 barricades (`barricadeLook.ts › standDepth`), with a traffic drum at each line end (B4). Bodies behind them show the 9.12 silhouette (red zombies, slot-colour survivors), cropped to the solid part (`wallOccluderX` extended). The barrier lamps / blinkers move onto the standing pictures and stay visible above them. The concrete police barrier (`police_barrier_north`, B3 look) stays flat on the ground with the pilot's `barrierConcrete` frame (B3).
5. **Gameplay unchanged.** Collision and cover boxes come from the map, not the art: no change to `packages/shared` map data, cover rules (4.2), flow fields or the world digest. Where the new art sits inside its box (sedan ~15 cm short per side, dumpster 1.41 m in 1.5 m), it is centred so the gap is even; note any visible gap in the readability sheet.
6. **Performance.** City bake time and `?stress=150` FPS / p95 at 844×390 DPR 2 at 1× and 4× CPU within 2 FPS / +1 ms of master (7.9 method, `docs/perf/epic-7-looks.md`); the standing police sprites add at most a few sprites (pooled); no per-frame allocation.
7. **Coverage + docs.** Gallery shows the new frames (`gallery/collect.ts` loads the image atlas before cutting), `galleryCoversAllArt` green, `tools/gallery/manifest.json` updated, street props removed from the "approved, not in game" export (`tools/gallery/review-page.html` `SUPERSEDED`, `tools/gallery/export.ts`), per `docs/art/asset-review.md` (the orchestrator republishes the review page). Readability-sheet items continue after 9.13's last item (check the file; 9.13 used 134–141). Screenshots in `docs/art/9-14/` at DPR 2: 844×390, 568×320, desktop 1280×720 — stage 1 street, stage 2 police lines with a zombie behind one, stage 3 burning cars in rain, stage 4 rubble, side-by-side with `compare.html`.

## Tasks / Subtasks

- [x] T1 Offline renderer (AC 1, 2)
  - [x] `tools/art/streetProps/` (or similar): run `pilot.ts` + `relief.ts` under Node (node canvas already used by raster tests: `@napi-rs/canvas`) to render the `ITEMS` rows (`pilot.ts:1053–1063`) into an atlas PNG/WebP + JSON (frame names = today's `ATLAS_DOWNTOWN` frames). Replace DOM-only bits (`document.createElement` → injected canvas; `ctx.filter` blur → box blur if node canvas lacks it; per-pixel `getImageData` rain-bead reads → read the alpha array). Deterministic output (seeded), an `npm run art:street-props` script, and a check test that the committed image matches the script's output hash (or at least frame names/sizes), so it can't drift silently.
  - [x] Pick PNG vs WebP by size and Safari support (WebP is fine on iOS 14+); stay ≤ 2 MB.
- [x] T2 Load and use (AC 1, 3)
  - [x] Load the atlas in Preload (Phaser loader) under the existing key; keep a canvas copy for `CityView`/`drawCity.ts › drawFrame` (it reads `atlas.canvas`), registered through `addGeneratedTexture` with a paint that draws from the loaded image. Keep the plain code frames that are NOT replaced (other downtown frames) unchanged.
  - [x] `drawCity.ts`: `coverPiece` / `drawOverlay` use the new frames; shorten or drop the code-drawn cover shadows where the picture now carries its own shading (no double shadow); keep `carStyle` / fire swap.
  - [x] Rubble: Downtown rubble is drawn by `ruinsArt` (`rubbleOf`, drawCity.ts:884), not `prop_block_a`. Use the pilot block for the rubble boxes if it fits the boxes without stretching; otherwise keep `ruinsArt` and log a B-code (do not invent a new look).
- [x] T3 Standing police lines (AC 4)
  - [x] A pooled sprite view for police lines (extend `BuildingView` patterns or a small `PoliceLineView`), pictures baked from `barricadeArt.ts` police functions — these are code drawings: either pre-render them with T1's tool into the same image atlas (preferred, one path) or reuse 9.11's relit worker bake. Remove the flat sawhorse from the ground bake.
  - [x] Drums at both line ends (B4); lamps/blinkers (`blinkerSpots`, drawCity.ts:984; CityView glow at 4.32) moved to the standing lamps and drawn above the standing sprites.
  - [x] Silhouettes: add the police sprites to the walls list fed to `WallSilhouetteView` (GameScene.ts:355–366 — a few lines; GameScene is free now) and extend `wallOccluderX` (buildingsFrames.ts:228–234) for the police frames.
- [x] T4 Gallery, docs, tests, perf (AC 5–7)
  - [x] Gallery, manifest, review-page `SUPERSEDED`, architecture line, readability sheet, screenshots.
  - [x] Tests: frame names/sizes of the loaded atlas match the old specs; police line layout (lengths 9.5 / 10 m → pieces cover exactly the box, drums at ends); silhouette occluder for police frames; restore repaint; map/digest unchanged.
  - [x] Perf table in `docs/perf/epic-9-street-props.md` (city bake ms, FPS/p95 before/after, 1× and 4×, load).

## Dev Notes

### Decisions taken for you (B-codes; log new ones in the Dev Agent Record)

- **B1 Pre-made image files.** The designer's direction (photoreal-decisions.md; orchestrator brief) is the switch to pre-made image files for street props. The relief renderer is ~3.8 M source px with heavy noise per pixel (≈ 6–10 s on a phone) and the city bakes props into the ground, so a runtime bake would mean a late ground rebake. ~0.53 M output px ≈ 1–1.6 MB PNG / 0.3–0.5 MB WebP, well inside the 15 MB budget. Update the architecture line (AC 2).
- **B2 Same frame names and sizes** (64 px/m = `DOWNTOWN_ATLAS_SCALE`), so map code and `drawCity.ts` keep working.
- **B3 Concrete police barrier stays flat** (pilot `barrierConcrete`, 384×32 fits its 6 m exactly). Only sawhorse lines stand (AC wording).
- **B4 Drums at both ends of each sawhorse line.** Downtown's police lines never meet, so 9.11's `findCorners` rule never fires; the approved "traffic-drum corners" become line-end drums.
- **B5 Light** stays the pilot's top-left key light (agrees with `palette.ts › LIGHT_DIR`); props don't rotate except by `front`, so this is exact.
- **B6** No new animation; existing blinkers / fires keep working.

### Today's pipeline (survey 2026-11-25, origin/master 83e9e110)

- Everything is baked into the ground: `CityView.ts` (:19–31, :176–183) bakes static tiles at depth 0 (Downtown ~42 px/m, one 2016×1344 tile), re-baked per stage / version / fire count (:363–366). `drawCity.ts › drawFrame` (:675–687) copies atlas frames into boxes facing `front`; `drawBase` (:815–826) pumps + shadows; `drawOverlay` (:844–867) cover shadows (`carShadow` :143, `castBoxShadow` bus), scorch, dumpster / `PROP_BLOCK` (:861), `coverPiece` (:689–710: car frame from `carStyle`, `CAR_BURNT_FRAMES` when on fire, bus, sandbags). Barriers call `drawBarrier` at real length (:698–707), style by name hash (`dressing.ts:236 barrierStyle`).
- Atlas: `spriteAtlas.ts` downtown specs / `drawDowntownFrame` (:271–292), `ensureAtlases` (:410–433), `ATLAS_DOWNTOWN`. **Story 9.13 also edits `spriteAtlas.ts` (characters) — branch from master after 9.13 has merged and keep the downtown changes separate.**
- Stage changes (`downtown.tmj.json`): stage 2 removes `parked_car_3`, 4 of 6 `panic_cars_moved` pairs, `dumpster_alley_3`, `police_barrier_north` (concrete), `police_line_lot` / `police_line_gas` (sawhorse); stage 3 `sandbags_south`, 2 of 3 car fires; stage 4 rubble, dumpster buried.
- Collision: map boxes only (`obstacles.ts:1–30`, `districtMap.ts:32–42`). Art can't change collision.
- Precedent: Story 7.12 copied the relief renderer into game code (`lootObjects.ts`); `groundDamageArt.ts:12–43` has the same `fbm`/`hash2`.
- 9.11 standing walls: `standDepth(y) = 10.45 + y/1000 × 0.15` (barricadeLook.ts:123–127) — above all bodies; 9.12 silhouettes compensate.

### Testing / performance / rules

- `npm run gate:fast` + touched slow tests (DOM checks must PASS, gallery coverage, raster tests, `test:changed`); not the full gate locally; the PR's CI `gate` is the gate. 2–3 workers.
- Perf method as 9.13 (`docs/perf/epic-9-characters.md`): own ports, `?stress=150`, 844×390 DPR 2, CDP CPU throttle 4×, two rounds reversed, load recorded.
- HANDOFF §3 lessons: every canvas texture via `addGeneratedTexture`; no per-frame allocation; Phaser 4 APIs; exact version pins (if a node image encoder is added, pin it); no gameplay numbers inline. Never `bmad-build`.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 9.14; `docs/art/photoreal-decisions.md`; `docs/art/visual-direction.md`; `docs/art/asset-review.md`
- `_bmad-output/implementation-artifacts/9-11-*.md`, `9-12-*.md`, `9-13-*.md`
- `_bmad-output/planning-artifacts/game-architecture.md` (asset loading, Client Platform Budgets)

## Dev Agent Record

### Agent Model Used

Claude (builder session for Story 9.14, gds-dev-story flow).

### Decisions taken while building (B7+)

- **B7 Rubble keeps the Ruins art.** The stage 4 rubble boxes are 2 × 1.5, 1.5 × 2 and 3 × 10 m; the pilot block is 1.5 × 1.5 m (`prop_block_a`, 96 px). It can't fill them without stretching, so per T2 the rubble keeps `ruinsArt` (`rubbleOf`). `prop_block_a` is the pilot picture wherever a generic `block` mutation uses it (none in Downtown today).
- **B8 Fallback.** If the image fails to download, `ensureAtlases` uses today's code drawings (same frame names) and the sawhorse lines lie flat as before. `isPhotoAtlas` (the atlas has `prop_policedrum_a`) picks the path.
- **B9 Offline renderer in headless Chromium, not node canvas.** The pilot and the police drawings use `ctx.filter` blur, which `@napi-rs/canvas` lacks. The Chromium Playwright build is the browser the designer saw the approved pages in. `tools/art/streetProps.ts` (`npm run art:street-props`) bundles `docs/art/photoreal-1/src/atlas.ts` (imports the approved `pilot.ts › ITEMS` unchanged, plus the game's police drawings and relight) with esbuild and runs it on a blank page. It takes about 4 s. The output is seeded and deterministic for a given Chromium. A byte-for-byte re-render can't be a CI check, because Chromium builds differ. Drift is caught instead: `streetProps.json` records `sourcesHash` (the 8 drawing source files) and `imageSha`. `tools/checks/streetPropsAtlas.test.ts` fails when either no longer matches. Nothing new was installed (esbuild and the preinstalled Playwright were already there).
- **B10 Lossless WebP**, 2032 × 536, 531 KB. PNG would be 892 KB. Lossy WebP q90 is 129 KB, but it would re-encode the approved pixels, so it was not used. Chromium writes VP8X + ICC + VP8L; iOS 14+ decodes it.
- **B11 One texture key.** The image comes in through the Boot scene's Phaser loader (`street_props_src`). `ensureAtlases` paints `atlas_downtown` from it: a canvas laid out like the image, registered with `addGeneratedTexture`, so a lost context repaints it from the image (AC 3). Then it removes the loader texture, which leaves one GPU copy. The gallery's Collect scene loads the image the same way before cutting frames.
- **B12 Police pictures in the same image**, at the standing barricades' 96 px/m. They are relit with the game's `bakeSteps` / `relight.ts` (amber lamps emissive), and the bloom is composited the same way as the approved page's stills. Frames: `prop_policefront_{1,2,3}{a,b}` (`drawPoliceFront` gained `units`, default 3: the first sawhorses only, identical to the full picture), `prop_policeside_{a,b}`, `prop_policedrum_a`.
- **B13 Line layout** (`streetPropsFrames.ts › policeLineLayout`). Front lines: sawhorses = ceil(L / ⅔ m), in pieces of 3 with one shorter piece at the end. The joins close up evenly, so the run starts at one end of the box and stops at the other: overlap, never a gap or overhang. For 9.5 m that is 15 sawhorses in 5 pieces, with a 0.125 m overlap per join. Side lines: ceil(L / 2 m) pieces spread end to end (10 m: 5 pieces, exact). The drum is centred 0.23 m inside each end. Variants are fixed by the line's name.
- **B14 Blinkers.** Each standing line's two alternating blinkers now sit on its drums' lamps (the same count as before; the pool of 8 still fits 6), drawn just over the drum (`standDepth + 2e-4`). The lamps on the sawhorses stay as baked, lit pictures. The concrete barrier keeps its two flat lamps.
- **B15 Shadows.** Box and car shadows are replaced by the picture's own silhouette, smeared 4 times along `LIGHT_DIR` over the same length, plus a lighter contact shadow (the pictures carry their own edge shading). This covers cars, bus, sandbags (lighter), dumpster, block and pumps. A standing line adds no ground shadow; its picture has one.
- **B16 Concrete barrier.** The pilot's 6 m picture is drawn at the line's depth and repeated, clipped, along a longer line. Downtown's `police_barrier_north` is exactly 6 m, so it is one copy.
- **B17** The pilot's flat sawhorse `prop_barrier_a` stays in the atlas (frame names unchanged, gallery), but the game no longer uses it.
- **B18 Silhouette occluders** (`policeOccluderX`): a front piece's sawhorses (units ⅓ of the width each), a side piece ±0.22 m about its middle, the drum ±0.23 m.
- **B20 Shadow stamps.** The first perf run had the city bake +30 ms per stage change at 1× (+120 ms at 4×) because every bake blurred every picture's shadow. Each blurred shadow is now cached as a stamp (picture, facing, box, bake density) and dropped after a lost context. Stage changes now bake as fast as master; the first bake at load is +28 ms at 1× (+44–160 ms at 4×), once.
- **B19 Perf at stage 2 too.** `?stress=150` runs at stage 1, which has no police line, so the table adds a stress row forced to stage 2 (`applyDecayStage`) on both trees.

### Debug Log References

- `npm run art:street-props`: "rendered in 3.7 s (Chromium 158.0.8127.36); atlas 2032 × 536: PNG 892 KB, WebP lossless 531 KB, WebP q90 129 KB; 26 frames".

### Completion Notes List

- AC 1: stills in `docs/art/9-14/` (stage 1 street, stage 2 police lot line with zombies behind it, stage 2 gas line + concrete barrier, stage 3 burning car in the rain, stage 4 rubble; 844 × 390, 568 × 320, 1280 × 720, DPR 2; `shots.cjs`), plus a side-by-side with `compare.html`.
- AC 2: architecture asset-loading row and project tree updated. Download added: 531 KB.
- AC 3: `streetPropsAtlas.test.ts` checks that the atlas is registered and that a repaint draws it from the image again. `noUnregisteredTextures` is green.
- AC 4: standing lines, drums, blinkers and silhouettes (`streetPropsFrames.test.ts`, `PoliceLineView`, GameScene `joinWalls`).
- AC 5: no `packages/shared` change. Readability key 142 notes the sedan's 15 cm gap per end (centred).
- AC 6: `docs/perf/epic-9-street-props.md`.
- AC 7: gallery loads the image before cutting. `SUPERSEDED` drops `atlas_downtown`. The export no longer adds `photoreal-1`. Manifest refreshed. Readability items 142–146.

### File List

- `apps/client/src/render/city/streetProps.webp`, `streetProps.json` (new, generated)
- `apps/client/src/render/city/streetPropsAtlas.ts`, `streetPropsFrames.ts`, `PoliceLineView.ts` (new)
- `apps/client/src/render/city/streetPropsAtlas.test.ts`, `streetPropsFrames.test.ts` (new); `bakeTiles.test.ts`
- `apps/client/src/render/city/spriteAtlas.ts`, `drawCity.ts`, `CityView.ts`, `buildingsFrames.ts`, `barricadeArt.ts`
- `apps/client/src/scenes/BootScene.ts`, `GameScene.ts`; `apps/client/src/gallery/collect.ts`
- `tools/art/streetProps.ts`, `tools/checks/streetPropsAtlas.test.ts` (new); `tools/gallery/export.ts`, `review-page.html`, `manifest.json`; `package.json`
- `docs/art/photoreal-1/src/atlas.ts` (new), `pilot.ts` (exports + main guard only)
- `docs/art/9-14/*`, `docs/perf/epic-9-street-props.md`, `docs/art/9-14/perf.cjs`, `docs/art/asset-review.md`, `docs/art/photoreal-decisions.md`, `docs/playtests/milestone-1/readability-{sheet,key}.md`, `_bmad-output/planning-artifacts/game-architecture.md`
