# Story 9.14: Photoreal street props and vehicles in the game

Status: ready-for-dev

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

- [ ] T1 Offline renderer (AC 1, 2)
  - [ ] `tools/art/streetProps/` (or similar): run `pilot.ts` + `relief.ts` under Node (node canvas already used by raster tests: `@napi-rs/canvas`) to render the `ITEMS` rows (`pilot.ts:1053–1063`) into an atlas PNG/WebP + JSON (frame names = today's `ATLAS_DOWNTOWN` frames). Replace DOM-only bits (`document.createElement` → injected canvas; `ctx.filter` blur → box blur if node canvas lacks it; per-pixel `getImageData` rain-bead reads → read the alpha array). Deterministic output (seeded), an `npm run art:street-props` script, and a check test that the committed image matches the script's output hash (or at least frame names/sizes), so it can't drift silently.
  - [ ] Pick PNG vs WebP by size and Safari support (WebP is fine on iOS 14+); stay ≤ 2 MB.
- [ ] T2 Load and use (AC 1, 3)
  - [ ] Load the atlas in Preload (Phaser loader) under the existing key; keep a canvas copy for `CityView`/`drawCity.ts › drawFrame` (it reads `atlas.canvas`), registered through `addGeneratedTexture` with a paint that draws from the loaded image. Keep the plain code frames that are NOT replaced (other downtown frames) unchanged.
  - [ ] `drawCity.ts`: `coverPiece` / `drawOverlay` use the new frames; shorten or drop the code-drawn cover shadows where the picture now carries its own shading (no double shadow); keep `carStyle` / fire swap.
  - [ ] Rubble: Downtown rubble is drawn by `ruinsArt` (`rubbleOf`, drawCity.ts:884), not `prop_block_a`. Use the pilot block for the rubble boxes if it fits the boxes without stretching; otherwise keep `ruinsArt` and log a B-code (do not invent a new look).
- [ ] T3 Standing police lines (AC 4)
  - [ ] A pooled sprite view for police lines (extend `BuildingView` patterns or a small `PoliceLineView`), pictures baked from `barricadeArt.ts` police functions — these are code drawings: either pre-render them with T1's tool into the same image atlas (preferred, one path) or reuse 9.11's relit worker bake. Remove the flat sawhorse from the ground bake.
  - [ ] Drums at both line ends (B4); lamps/blinkers (`blinkerSpots`, drawCity.ts:984; CityView glow at 4.32) moved to the standing lamps and drawn above the standing sprites.
  - [ ] Silhouettes: add the police sprites to the walls list fed to `WallSilhouetteView` (GameScene.ts:355–366 — a few lines; GameScene is free now) and extend `wallOccluderX` (buildingsFrames.ts:228–234) for the police frames.
- [ ] T4 Gallery, docs, tests, perf (AC 5–7)
  - [ ] Gallery, manifest, review-page `SUPERSEDED`, architecture line, readability sheet, screenshots.
  - [ ] Tests: frame names/sizes of the loaded atlas match the old specs; police line layout (lengths 9.5 / 10 m → pieces cover exactly the box, drums at ends); silhouette occluder for police frames; restore repaint; map/digest unchanged.
  - [ ] Perf table in `docs/perf/epic-9-street-props.md` (city bake ms, FPS/p95 before/after, 1× and 4×, load).

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

### Debug Log References

### Completion Notes List

### File List
