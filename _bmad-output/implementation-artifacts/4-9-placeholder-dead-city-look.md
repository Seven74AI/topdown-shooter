# Story 4.9: Placeholder Dead City look

Status: done

## Story

As the designer,
I want Downtown to already look like a rainy city at night, even with placeholder art,
so that we judge the milestone on the right mood.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist. Lines 1 (own worktree/ports, gates), 9 (mutation-proven tests), 13 (no per-frame allocation; numbers in one named block), 17 (Phaser 4 ≠ 3: verify in `node_modules/phaser/types`), 18 (headless Chromium is slow: say what was not verified) and 19 (notes for the merge) apply most. This story is **client-only**: no sim, collision, network or balance change (lines 2–8, 14, 16 are untouched by construction; the map data is not edited, so `DistrictMap.version` and the join check are unchanged).

## Acceptance Criteria

1. **Night palette and light (FR82).** Given placeholder art, when Downtown is shown, it uses look **B "Dead City"** from `briefs/brief-topdown-shooter-2026-11-21/downtown-look-study.html` (designer's choice 2026-11-22, **no outline aid**): dark low-contrast wet asphalt with puddles, curbs and paver sidewalks, crosswalks, lane dashes; streetlight pools, warm shop-window glow, one flickering lamp; light rain and a vignette.
2. **Solid vs walkable at a glance.** Every obstacle casts a shadow from one light direction (upper-left), its length set by the object's height; raised tops are bevelled and lighter than the ground, with crisp dark edges; roofs carry rooftop details. Lit sidewalks never reach roof brightness: a unit test pins `roof lit luminance > worst lit sidewalk luminance + margin` for every roof colour (designer's weakness #1). Barrier and sandbags look low (short shadows). Debris props are flat (no shadow: they are walkable).
3. **Recognisable objects.** The bus reads as a bus (fleet number, window strips, roof hatches and AC unit, wheel arches, crushed front, tail lights, hazard blinkers). Cars have windshields, headlights and tail lights, with silhouettes close to their collision boxes (small corner radius; weakness #2). Gas pumps under a see-through canopy; the kiosk with its sign. The canopy frame never overlaps the gas-leak marker (weakness #3).
4. **Stage-aware.** Cover drawn = `world.obstacles.cover` (already filtered by `minStage`, and the list Story 4.5's mutations edit); hazard zones drawn only once the stage ≥ their `minStage`; stage props cumulative (`stage1..stageN`). One entry point redraws the static layers: `CityView.showStage(stage)`; the view also redraws by itself when `world.obstacles.stage/version` changes (the 4.2 dev cheat today, 4.5's `decay.stage_changed` later).
5. **Characters.** Survivors and zombies are top-down humanoids (shoulders, head, arms) from the prototype's character code; each zombie type in `zombies.json` (walker, runner, crawler) has a distinct silhouette (Walker arms reaching, Runner thin and leaning with a red shirt, Crawler long and low, darker, drawn beneath). The `satisfies Record<ZombieTypeId, …>` rule stays: a new type must add its look.
6. **Atlases.** Placeholder atlases follow the final atlas layout (`characters`, `downtown` (vehicles + props), `fx`, as in the architecture's `public/assets/atlases/`), every frame is named `category_name_variant` (snake case), each atlas ≤ 2048 × 2048, and the first-load download stays under 15 MB.
7. **Gameplay readability kept.** Slot-coloured rings, names, teammate arrows, rush chevrons, zombie hit flash, the downed UI, health bars, placement preview, building selection, the shop UI and the debug overlays (`?debug=1`, collision grid) stay clearly visible on the darker scene. Player barricades and turrets match the look (cast shadow + bevel).
8. **Phones.** Static layers are drawn once per stage (never per frame); rain is a small pooled set of sprites, lights are a few pre-drawn textures; no per-frame allocation. `?stress=150` FPS measured in headless Chromium before and after, with machine load.
9. **Night progression (designer, 2026-11-22; epics.md 4.9).** A run is one night, no day-night cycle: the light state follows the decay stage — stage 1 dusk (a little blue left in the sky, warm shop light), 2 full night, 3 deep night with full rain, 4–5 darker placeholders until Epic 6. Light drizzle at stages 1–2. Roofs readable at every stage; parameters per stage in one data table.
10. **Tests.** Unit tests for the pure helpers (frame naming, atlas packing ≤ 2048 and no overlap, palette contrast, stage filtering of hazards/props), each proven to fail under a mutation.

## Tasks / Subtasks

- [x] T1 Pure helpers in `apps/client/src/render/city/`: `atlasLayout.ts` (frame names, shelf packer), `palette.ts` (colours, light levels, `luminance`, `litLuminance`), `stageFilter.ts` (hazards/props by stage), `dressing.ts` (Downtown look data: heights, roofs, lamps, window spill, car styles, signs) + tests (AC 2, 4, 6, 9)
- [x] T2 `drawCity.ts`: canvas-2D port of the prototype (ground, wet layer, shadows, buildings, bus, cars, pumps, wall, canopy, barrier, sandbags, debris, hazards, lamp heads, lightmap, glow), weaknesses fixed (AC 1–4)
- [x] T3 `spriteAtlas.ts`: procedural atlases → Phaser canvas textures with named frames (`atlas_characters`, `atlas_downtown`, `atlas_fx`) (AC 5, 6)
- [x] T4 `CityView.ts`: static tiles (≤ 2048 each), lightmap (MULTIPLY) + glow (ADD), flicker lamp, bus blinkers, barrier lamps, rain + splashes (pooled), vignette; `showStage(stage)`; replaces `drawStreet` + `CoverView` in `GameScene` (AC 1, 4, 8)
- [x] T5 `ZombieView` / `PlayerView` on atlas frames; `BuildingView` / `TurretView` shadows + bevel (AC 5, 7)
- [x] T6 Browser check (Playwright, 1280×720 and 844×390): bus intersection, gas station, parking lot, wave with each zombie type, build phase with barricades + turret, stage-2 cheat; compare with `downtown-look-B-chosen.png`; FPS before/after (AC 1–8)
- [x] T7 Gates, bundle + first-load size, merge notes (AC 6, 8)
- [x] T9 Review fixes (part A): CanvasTexture pixel copy dropped; per-object random streams; contrast test on the real lightmap per stage; light state per stage (`NIGHT_BY_STAGE`); one-tile bake, tile culling, cached base layer, 12 % vignette bands; online first bake waits for the synced stage
- [x] T10 Reconcile with Story 4.5 (part B): walls from `obstacles.walls`, block mutations as props (`prop_dumpster_a`, `prop_block_a`), fires from `world.decay.fires`, swap-model stage groups, `DecayView`/`drawStreet` removed (banner kept), redraw on 4.5's real stage path solo and online
- [x] T8 (designer addition 2026-11-22) Revive zone: a circle of radius `balance.player.reviveRadiusM` (2.0 m after cfdab04, merged) around each downed player; faint idle, brighter and pulsing while a revive runs (AC 7)

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 Procedural, baked once per stage.** The static city (ground, shadows, buildings, cover, hazards, props, lamp heads) is drawn with Canvas 2D (the prototype's code, ported to TypeScript) into offscreen canvases at load and shown as Phaser canvas textures. It is redrawn only on a stage/obstacle change (`showStage`), never per frame. Zero image downloads.
- **D2 Bake resolution and tiles.** Bake density = the camera zoom (device px per metre) rounded, at least 32 px/m and at most what fits the whole map in ONE ≤ 2048 px tile (review: Downtown 48 m → 42 px/m, 2016 × 1344; a DPR-2 side-by-side against 64 px/m showed no visible loss at phone zoom ≈ 70, at half the memory and bake time). `tileRects` still splits a larger map into ≤ 2048 tiles; each tile draws only what meets its bounds + `CULL_MARGIN_PX` (96 map px: shadows, blur, skid marks). Grain/speckle uses small pre-drawn noise patterns. The stage-independent part (ground, wet layer, static walls' shadows, roofs, low walls, pumps) is cached per tile (`drawBase`, keyed by the drawn wall names) and the stage overlay (cover + shadows, blocks, hazards, fires, stage group, canopy, lamp heads) + light are redrawn on a stage change. Not re-baked on resize (a rotation keeps the first density; recorded).
- **D3 Atlases.** Three runtime atlases, laid out by a pure shelf packer (≤ 2048, 2 px padding) and named like the final files (`public/assets/atlases/characters|downtown|fx`): Phaser texture keys `atlas_characters`, `atlas_downtown`, `atlas_fx`, frames `category_name_variant` (`zombie_walker_a`, `survivor_body_a`, `vehicle_bus_a`, `vehicle_car_c`, `prop_pump_a`, `prop_barrier_a`, `prop_sandbags_a`, `fx_rain_a`, `fx_splash_a`, `fx_glow_a`, `fx_vignette_a`). Epic 9 replaces a frame by loading a real atlas under the same key and frame names; the code that draws (`ZombieView`, `PlayerView`, the bake's `drawImage` of vehicles/props) only knows the frame names. Buildings (roofs) are drawn to their exact boxes in the bake (static map art, not atlas frames).
- **D4 Light baked into the static tiles.** A lightmap (ambient + moonlit tops + lamp pools + window spill + canopy light + the running car's headlight cone) and a glow (lamp heads, halos, neon, spill) are drawn at 8 px/m and composited onto every static tile at bake time (`multiply`, then `lighter`). *Changed during the build:* the first version showed them as two full-screen Phaser layers (MULTIPLY/ADD); headless Chromium fell from 22 to 8.6 FPS at 1280×720 (CPU rasterizer, fill-bound), and since characters are drawn above the light anyway the layers only lit the street. Dynamic lights (the flickering lamp, the bus's hazard blinkers, the barrier's lamps when the barrier exists) are a handful of additive `fx_glow_a` images whose alpha changes per frame. Graphics-drawn barricades/turrets carry the night in their colours (`NIGHT_DARKEN` = 0.35).
- **D5 Depth order.** Lit street bake 0 · blood/trails 1 · barricades 3 · turret 3.5–4 · selection 4 · **dynamic lights 4.32 · revive zone 4.4** · crawler 4.5 · zombies 5–5.5 · FX 7 · projectiles 8 · rings 8.5 · downed ring 9 · survivors 10 · **rain 11.8, vignette 11.9** · chevrons/bars 12 · preview 13 · debug 1000. Characters, FX and UI are unlit, so the zombie hit flash (white FILL tint) stays full white and rings stay saturated; character sprites use a night-muted palette (prototype colours, slightly darker skins).
- **D6 Roofs are lit by a fixed "moonlight" level, not by streetlights** (lamps hang below roof height). With that, the contrast test is exact: `roofLit = roof × ROOF_LIGHT` vs `sidewalkWorst = sidewalk × min(1, AMBIENT + LAMP + SPILL) + glow tail`. Margin ≥ 18 (0–255 luma). Fixes weakness #1.
- **D7 Car silhouettes.** Car bodies inset 1 map-px (≈ 3 cm) with a 4 px (12 cm) corner radius (prototype: 4 px inset, 10 px radius); tyres stay inside the box. Fixes weakness #2.
- **D8 Gas-leak marker.** Hazard zones are a faint diagonal hatch with no outline and no label (labels were study annotations); the canopy keeps its red frame. Two shapes never share an outline. Fixes weakness #3. Hazards are drawn only when `stage ≥ minStage` (gas leak 2, car fires 3); fire visuals proper are Story 4.8's.
- **D9 Cover comes from `world.obstacles.cover`,** never `map.cover` filtered again: it is the stage-filtered list and the one 4.5 mutates (moved/added cars). Car styles are looked up by name; an unknown car (added by a mutation) gets a colour by name hash and a front by orientation. The bus is drawn from cover kind `bus` (its duplicate collision box `city_bus` is skipped).
- **D10 Stage groups swap (changed in review).** The architecture (§Decay Stage Engine: "DecayView … swaps Tiled visual layer groups (`stageN_*`)") and Story 4.5 use the swap model: stage 1's ground props are the base, stage N ≥ 2 shows `stageN_*` only (`stageGroupAt`). The first version drew them cumulatively. Stage-group props are flat rubble (no shadow: walkable).
- **D11 Rain.** Light drizzle at stages 1–2, full rain from stage 3 (GDD: "rain begins" at Breakdown); 128 pooled streak images placed relative to the camera view each frame (hash of index + time, no allocation) + 16 pooled splash rings. Strength per stage = `NIGHT_BY_STAGE[i].rain`.
- **D12 Players.** One survivor frame (`survivor_body_a`) for every slot (the ring tells players apart; per-character art is Epic 9). Downed and slowed are tints (MULTIPLY) of the sprite instead of the old body colours.
- **D13 Old views removed.** `render/StreetView.ts` and `render/CoverView.ts` are replaced by `CityView` (their only caller was `GameScene`). The debug collision grid is unchanged.
- **D14 Vignette as four edge bands in world space.** Four `fx_vignette_a` bands (20 % of the view's short side) placed around the camera view each frame; the centre is untouched. A single full-screen quad cost ~40 % of the headless frame rate (fill rate).
- **D15 Revive zone (designer addition).** `DownedView` draws, on a second Graphics at depth 4.4 (on the ground, below zombies), a circle of radius `world.balance.player.reviveRadiusM` (read every frame from balance, no literal; centre to centre, the line's outer edge at the radius) around each downed player: pale revive-green (`0x8ff0c0`), fill 0.05 / line 0.35 when idle; fill 0.12, a thicker line pulsing 0.6–0.95 with the 2.9 pulse while `reviverId !== null` (a teammate in reach and the revive running). Pure style helper `render/reviveZone.ts` (no allocation: writes into a reused object). Redrawn only while someone is downed, like the progress ring.
- **D17 Night per stage (designer, review).** `palette.ts › NIGHT_BY_STAGE` (index = stage − 1): `ambient`, `roofLight`, `topLightA`, `lampA`, `spillK`, `sky`/`skyA`, `rain`. Dusk 124,134,172 ambient + a blue sky glow 0.1, lamps 0.5, shop spill × 1.1; night 104,114,140; deep night 84,92,118, spill × 0.8, rain 1; late night 72,78,102 (× 0.6); before dawn 62,66,88 (× 0.45). Roof light stays 204–236 so roofs stay readable (tested per stage).
- **D18 Story 4.5 objects.** Walls come from `world.obstacles.walls` (`drawnWalls`: minus the bus's twin), so a removed bus disappears and the stage-2 dumpster (`dumpster_alley_3`, a `block` mutation) is drawn as `prop_dumpster_a` with a low (1.4 m) shadow; any other block gets `prop_block_a` (crates/rubble). Added/removed cars come with `obstacles.cover`. Fires: `world.decay.fires` only (the car chosen this run), drawn as scorch + static flames + a fire pool in the lightmap/glow + a flickering additive light; the map's `fire` hazard zones are not drawn (Story 4.8 does real fire).
- **D19 Memory.** `addCanvasTexture` drops the `CanvasTexture` constructor's `getImageData` copy (`imageData/data/pixels/buffer`; `refresh()` never reads it); canvases are sized to 0 on destroy (Safari).
- **D20 Late join.** `CityView.update(…, synced)`: online the first bake waits for `NetSimHost.decaySynced` (room `decayStage` ≥ 1 and the mirror's `decay.stage` equal to it), so a late join / late scene start bakes once, at the server's stage.
- **D16 Contrast numbers.** Roof colours are ~35 % brighter than the study's; streetlight core glow 22 px, tail 0.06, halo 0.07 (110 px), spill glow × 0.12. Review: the test now runs the REAL `drawLightmap` + `drawGlow` through a point-sampling canvas (`probeCanvas.ts`) at 25 points per roof and every 8 px of sidewalk (bulbs excluded, all decay variants on), per stage: darkest roof / brightest sidewalk luma = 118/78 (dusk), 111/70, 106/66, 101/58, 98/50 — margin ≥ 18 enforced.

### Current state (read before changing)

- `render/StreetView.ts › drawStreet(scene, map)`: one Graphics at depth 0, asphalt + 4 m grid + `stages[0]` props by kind + stage-1 hazards + every collision box (bus coloured). Static.
- `render/CoverView.ts`: Graphics at depth 1, redraws `world.obstacles.cover` (skips the bus) when `obstacles.version` changes.
- `render/ZombieView.ts`: one pooled `Image` per zombie slot; per-type textures `zombie_<type>_body` from Graphics `generateTexture`; `LOOKS satisfies Record<ZombieTypeId, ZombieLook>` (size in radii, depth, cue); flash = `setTint(0xffffff).setTintMode(FILL)`; shriek cue for Runners. Must keep: pooling, generation check, flash, cue, streamed heading.
- `render/PlayerView.ts`: ring Arc (8.5), body circle (10), facing tick (11); downed darker + pulsing ring, slowed green, out hidden. `x/y` read by the scene.
- `render/BuildingView.ts`: barricades as wood Graphics (depth 3), damage darkening/cracks, bars (12), preview (13). `TurretView`: plates (3.5), heads (4) rotating.
- `scenes/GameScene.ts › create`: `drawStreet`, `new CoverView`, … ; `update`: views updated after the sim, `updateRushMarkers` computes `hudModel.camX/camY/camZoom` (the view this frame). Camera zoom = `pixelsPerMeter` (device px per metre), bounds = the map.
- `debug/devCheatActions.ts › setDecayStageCheat` → `applyCoverStage(world)` bumps `world.obstacles.version` (solo).
- Phaser 4.2.1 (verified in `node_modules/phaser/types`): `textures.addCanvas(key, canvas)` → `CanvasTexture` (`refresh()` re-uploads), `Texture.add(name, sourceIndex, x, y, w, h)` for frames, `BlendModes.MULTIPLY/ADD`, `setTintMode(TintModes.FILL)`.

### Must preserve

Rings, names/arrows (HudScene, untouched), chevrons, flash, downed UI, placement preview, health bars, shop (DOM), debug overlays, the `?stress` scenario, solo pause, scene restart (Phaser reuses the scene object: textures persist at game level, views are rebuilt in `create`; the bake textures must be destroyed or reused).

### Testing

Vitest (`npm test`), pure helpers only (no Phaser in unit tests, like `buildingLook.ts`). Mutations to prove: frame-name regex, packer overlap/size check, palette margin (raise sidewalk / lower ROOF_LIGHT), stage filter `<=` → `<`.

### References

- Look reference: `_bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/downtown-look-study.html`, `downtown-look-B-chosen.png`
- Atlas rules: `game-architecture.md` §Game Assets (naming), §Directory Structure (`atlases/`), §Performance (≤ 2048, DPR ≤ 2, 15 MB)
- GDD › Art Style (readability rules, decay stages: rain from Breakdown)
- Cover/stage: `packages/shared/src/map/obstacles.ts`, `map/decayStage.ts`, Story 4.2 D1/D9

## Senior Developer Review (AI)

**Reviewer:** fresh review agent, 2026-11-22, on 90cbf3c. **Outcome:** approved with fixes; all fixed here.

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| 1 | M | `textures.addCanvas` keeps a full `getImageData` copy per texture (CanvasTexture.js:89): each bake held three times (~52 MB at DPR 1, ~75 MB on phones) | `canvasTexture.ts › addCanvasTexture` drops `imageData/data/pixels/buffer` (also for the three atlases); `releaseCanvas` zeroes canvases on destroy. Measured (Chromium `Runtime.getHeapUsage` backing store, solo, after GC): 53.9 → 33.8 MB at 1280×720 DPR 1, 61.8 → 33.8 MB at 844×390 DPR 2. Static bake memory (canvas + GPU + copy): 2 × 1272×1696 tiles ≈ 52 MB / 2 × 1536×2048 ≈ 75 MB → one 2016×1344 tile + its cached base ≈ 32 MB (canvas 10.8 + base 10.8 + GPU 10.8) at any DPR |
| 2 | L | Debris and buildings shared one `mulberry(23)` stream: stage debris moved the rooftop units | `rng(key)`: one stream per object name / fixed label (ground patches, cracks, litter, puddles, glass, each building, each prop, each fire); test: a key's stream is unaffected by other draws |
| 3 | L | The contrast test checked an analytic model: deleting the roof light fill in `drawLightmap` broke no test | `palette.test.ts` samples the real lightmap and glow through `probeCanvas.ts`, per stage; deleting the roof fill now fails 5 tests (all stages) |
| 4 | perf | Each tile drew the whole map; everything redrawn per stage; 20 % vignette bands; 2 tiles | tile culling; cached stage-independent base; 12 % bands; one tile at 42 px/m (see D2) |
| 5 | L | Online late join baked stage 1, then again when the real stage arrived | first bake waits for `NetSimHost.decaySynced` (D20); online check: 1 bake at stage 2 and at stage 3, also with the loop asleep across the Start |
| 6 | new | Designer: one night per run, light follows the stage | `NIGHT_BY_STAGE` (D17), screenshots per stage |
| 7 | 4.5 | Reconcile with the decay engine (walls, blocks, fires, stage groups, DecayView/drawStreet, real stage path) | D10, D18; `DecayView.ts` and `StreetView.ts` deleted, `stackBanner` kept; the redraw keys on `obstacles.stage/version` + fire count, which 4.5's `applyDecayStage` changes on every path (solo build start and cheat, the online mirror on any patch) |

**Numbers (headless Chromium, SwiftShader CPU raster, 2 cores, my browser in the load).**

| | before review (90cbf3c) | after |
| --- | --- | --- |
| `?stress=150` FPS 1280×720 | 15.8 / 14.9 / 14.2 (load 1.8–3.2) | 18.0 / 17.1 (load 0.8–1.7) |
| `?stress=150` FPS 844×390 | 47.6 / 44.7 | 50.4 |
| bake, first / stage change, 1280×720 | 214 / 151 ms (2 tiles, 53 px/m) | 104–173 / 43–46 ms (1 tile, 42 px/m) |
| bake, first / stage change, 844×390 | 75 / 70 ms | 76–86 / 33–35 ms |
| bake, DPR 2 phone size | 230–283 ms (2 tiles, 64 px/m) | 108–111 ms (1 tile) |
| JS backing store | 53.9 / 61.8 MB | 33.8 / 33.8 MB |

Pre-4.9 baseline for reference: 22 / 19 FPS and 58.7 FPS. Real phone still pending (4.10).

**Mutations proven to fail (review round):** roof light fill deleted (5 tests); fire zones drawn from hazards (`kind !== "fire"` removed); stage groups cumulative again; walls truncated to the map's first 10 (dumpster missing); stage 3 ambient brighter than stage 2; `staticKey` ignoring the fire count; stage 3 roof light lowered to 150,155,170 (contrast). Earlier round: frame regex, packer padding, revive active fill, hazards `<=`.

**Browser checks:** solo 1280×720 stage 1 (dusk), stage 2 (dumpster, abandoned car south, parked_car_3 gone, Panic banner), stage 3 (one burning car, sandbags, full rain, deep night) via the 4.5 build-phase cheat with variants 0b0110; online (server on 2649, `DEV_DECAY_STAGES=2` and `=3`, solo start): stage 2 with dumpster + abandoned car, stage 3 with the run's one fire (street_car_west in one run, parked_car_2 in another), one bake each, also with `loop.sleep()` across the Start. Best four in `/home/claude/proto/s49/`.

**Not verified:** a real phone; a hidden tab sleeping across a mid-run build start online (the same mirror path as the late start, not run end to end: it needs a cleared wave); Safari.

## Change Log

- 2026-11-22: Story written and built (look B, atlases, revive zone); status review (90cbf3c).
- 2026-11-22: Review fixes part A (memory, per-object streams, real-light contrast test, night per stage, one-tile cached bake, vignette 12 %, late-join bake); merged Story 4.5 and reconciled (walls, blocks, fires, swap-model stage groups, DecayView/StreetView removed); status done.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Implemented as D1–D16. Static city = Canvas 2D port of the study (look B), baked per stage into ≤ 2048 tiles with the light composited in; atlases `atlas_characters` (zombie_walker_a–d, zombie_runner_a–b, zombie_crawler_a–b, survivor_body_a), `atlas_downtown` (vehicle_bus_a, vehicle_car_a–e, prop_pump_a, prop_barrier_a, prop_sandbags_a), `atlas_fx` (fx_rain_a, fx_splash_a, fx_glow_a, fx_vignette_a). The bake draws vehicles/props from the downtown atlas canvas by frame name.
- Weaknesses fixed: roofs vs lit sidewalk (test-enforced margin), car body inset 1 px / radius 4 px, hazard hatch without outline (canopy frame alone), cover from `world.obstacles.cover` and hazards only at `stage ≥ minStage`; low cover has no contact band (short soft shadow).
- **FPS, `?stress=150`, headless Chromium (SwiftShader CPU rasterizer, 2 cores; my browser is part of the load):** before 22.0 / 19.0 FPS at 1280×720 and 58.7 at 844×390 (load 1.6–2.7). First version (two full-screen light layers + full-screen vignette): 8.8 / 8.5 and 28.9 (load 2.0–2.4). Final (light baked, edge vignette): 15.8, 14.9, 14.2 at 1280×720 and 47.6 / 44.7 at 844×390 (load 1.8–3.2). Probe at 1280×720: hiding the static tiles alone gave +8 FPS, rain ~0: the remaining cost is texture fill of the street tiles + bands, which a GPU does almost for free; **a real phone check is pending** (4.10).
- Bake time (static + light, once per stage): 214 ms first / 151 ms stage change at 53 px/m (1280×720, 2 tiles 1272×1696), 75 / 70 ms at 35 px/m (844×390, 1 tile) in headless Chromium. Phones at DPR 2 bake at 64 px/m (2 tiles 1536×2048): expect a one-off ~0.2–0.4 s hitch at a stage change (build start) — not measured on a phone.
- Bundle: main chunk 1,723.86 → 1,759.72 kB min (+35.9 kB), 469.36 → 481.48 kB gzip (+12.1 kB). First-load download ≈ 0.49 MB gzip (index.html 0.45 + css 2.0 + main 481.5 kB; the 24 kB map) — no image files at all (atlases are drawn at runtime); 15 MB budget untouched. `connection` chunk (online) unchanged.
- Tests: `atlasLayout.test.ts` (names, packing ≤ 2048 without overlap for all three atlases, every zombie type has frames, tiles), `palette.test.ts` (roof margin; the study's roofs fail it), `stageFilter.test.ts` (hazards by stage, cumulative props, cover by stage, bus duplicate, car styles), `reviveZone.test.ts`. Mutations proven to fail: ROOF_LIGHT darker; hazards `<=` → `<`; props non-cumulative; frame regex `{2,}` → `{1,}`; packer without padding (4 tests fail); revive active fill = idle. Full suite: 1282 passed, 3 skipped.
- Browser check (Python Playwright + Chromium, solo, `?zdmg=0&wallet=2000`): 1280×720 and 844×390 shots of the bus intersection, gas station, parking lot, a wave with walkers/runners/crawlers, a build phase with two barricades and a turret, the stage-2 and stage-3 cheats, the revive zone idle and reviving, and the collision-grid debug overlay over the art (boxes line up with the drawn bus, buildings, cars). Compared with `downtown-look-B-chosen.png`: same palette, pools, shop glow, crushed bus with 4217, puddles, rain. Best four in `/home/claude/proto/s49/`. Scene restart twice: old bake textures removed, atlases kept, no errors.
- **Not verified:** a real phone (FPS, bake hitch, memory of 2 × 1536×2048 tiles), online play (the view reads the mirror World's `obstacles` the same way, but no online run was made), the 4.5 `decay.stage_changed` path (only the 4.2 cheat), a DPR-2 desktop bake, rotation/resize after start (the bake keeps its first density), Safari canvas behaviour (`roundRect` avoided; `ellipse`, `shadowBlur`, `multiply` composite used).

### Notes for the merge

- **Stage entry point:** `apps/client/src/render/city/CityView.ts › CityView.showStage(world)` redraws the static layers and light for the World's decay state. `CityView.update` calls it whenever `world.obstacles.stage/version` or the fire count changes (4.5's `applyDecayStage` on every path). Story 4.8: give fires their real look on top of `drawCity.ts › scorch/flames` (or replace them); a fire that expires changes the fire count, which redraws.
- **Removed:** `render/StreetView.ts`, `render/CoverView.ts`, and (after merging 4.5) `render/DecayView.ts`; `GameScene.stackBanner` (4.5) kept. `NetSimHost.decaySynced` added (read-only getter).
- **GameScene:** imports, the `cityView` field, its creation right after `applyZoom()` (needs the zoom), destroy in SHUTDOWN, `update` call at the end of `update()`, `downedView.update(world, this.time.now)`.
- **Shared files:** none edited (no sim, collision, network, balance or map change; the map version is unchanged). Merged `claude/epic-2-continue` (cfdab04, revive radius 2.0 m) into the branch.
- **Other client files:** `ZombieView` (atlas frames, variants by slot), `PlayerView` (survivor sprite, tints), `BuildingView`/`TurretView` (shadow + bevel, night colours), `DownedView` (revive zone).

### File List

- `_bmad-output/implementation-artifacts/4-9-placeholder-dead-city-look.md` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/client/src/render/city/CityView.ts` (new)
- `apps/client/src/render/city/drawCity.ts` (new)
- `apps/client/src/render/city/spriteArt.ts` (new)
- `apps/client/src/render/city/spriteAtlas.ts` (new)
- `apps/client/src/render/city/atlasLayout.ts` (new) + `atlasLayout.test.ts`
- `apps/client/src/render/city/palette.ts` (new) + `palette.test.ts`
- `apps/client/src/render/city/stageFilter.ts` (new) + `stageFilter.test.ts`
- `apps/client/src/render/city/dressing.ts` (new)
- `apps/client/src/render/city/raisedLook.ts` (new)
- `apps/client/src/render/reviveZone.ts` (new) + `reviveZone.test.ts`
- `apps/client/src/render/ZombieView.ts`, `PlayerView.ts`, `BuildingView.ts`, `TurretView.ts`, `DownedView.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/render/StreetView.ts`, `apps/client/src/render/CoverView.ts`, `apps/client/src/render/DecayView.ts` (deleted)
- Review round: `apps/client/src/render/city/canvasTexture.ts`, `probeCanvas.ts`, `testScene.ts` (new); `apps/client/src/sim/NetSimHost.ts` (`decaySynced`)
