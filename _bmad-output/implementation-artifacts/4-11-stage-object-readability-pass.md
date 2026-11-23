# Story 4.11: Stage-object readability pass

Status: review

## Story

As a player,
I want the sandbags, the wood barricade and a burning car's fire to be recognisable at a glance, and to see clearly when I am burning,
so that I understand the street and react to fire without being told.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist. This story is **client-only** (rendering + one loaded atlas): no sim, collision, network, map or balance change, so lines 2–8, 14 and 16 are untouched by construction (the fire numbers are *read* from `decay.json › fire`, never changed). Lines that apply: 1 (own worktree `story-4-11`, ports client 5957 / server 2657; gates), 9 (each new test mutation-proven once), 10 (player-visible properties as tests: "your body touches the flames = you burn", "a turned barricade still covers its footprint"), 11 (hidden tab / late Game scene start / effects close when the wave or stage changes), 12 (client shows server truth: burning cues and "-5" only from the server's `player.damaged` fire events; the number uses the HP display's rounding, `Math.ceil`), 13 (no per-frame allocation: pooled flames, smoke, embers, numbers; caps as named constants), 15 (FPS with load), 17 (Phaser 4 ≠ 3: verify in `node_modules/phaser/types`), 18 (headless Chromium is slow: say what was not verified), 19 (notes for the merge). HANDOFF §3 "Lessons the reviews keep finding" applies (no per-frame allocation; Phaser reuses scene objects on restart: reset in `create`).

## Acceptance Criteria

The epics entry was written before the designer's picks; where they differ, **the picks (2026-11-23, `docs/art/4-11/README.md`) win** (e.g. sandbags are olive-drab military canvas S2, not tan burlap; the barricade is the B6 palisade, not "planks with a cross-brace").

1. **Sandbags (S2).** Stage-3 sandbags (map cover kind `sandbags`, 3 × 1 m, horizontal or vertical) read as olive-drab military canvas sandbags in neat brick-offset rows at in-game size, and still look LOW: a short shadow drawn by the game (`HEIGHT_BY_KIND.sandbags` = 0.6 m, no contact band), none baked into the sprite.
2. **Wood barricade (B6).** The player-built wood barricade (2 × 0.5 m) is a tall upright palisade of sharpened stakes held by diagonal struts; it turns with placement (`rot` 0–3: the art's long side follows the footprint's long side, struts on the back), looks like a standing obstacle (cast shadow by height from `raisedLook`, the same light direction at every rotation), and keeps the damage look (darkening + cracks per lost quarter) and the HP bar. B8 is not used.
3. **Burning car (F6).** Thick smoke, burning debris, orange heat glow, and a **circle of small animated flames placed by code exactly at the damage edge** (`fireRingRadiusM(f)` = the zone radius; rule "your body touches the flames = you burn", the sim's `circleInFire`). The flames flicker and pulse with the damage tick (`decay.json › fire.pulseS`, 0.5 s). The burnt car under it keeps its existing art.
4. **Burning survivor (server truth).** Driven only by the server's fire-damage events (`player.damaged` with `sourceZombieId < 0`, `FireCue`, `FIRE_CUE_MS` = 0.7 s after the last hit), for every player online and solo: (1) animated flames on the body, (2) smoke puffs and rising embers; for **your own survivor only**: (3) an orange pulsing screen-edge glow and (4) a small orange "-N" (the event's amount, `Math.ceil` like the HP display: "-5") floating up per fire hit. The old body tint `BURNING_TINT` is removed (the flames replace it); the HUD "Burning" text stays.
5. **Art direction.** Gritty realistic Dead City, no outline aid; shadows drawn by the game, not baked into sprites.
6. **Assets.** Game-ready sprites made from the references (Meshy text-to-image → chroma/alpha key → exact footprint), rebuilt by a committed script (`tools/art/`), served by Vite from `public/assets/atlases/` and loaded with the Phaser Loader; atlas rules kept (≤ 2048², `category_name_variant` frames, first-load total < 15 MB). A missing file falls back to procedural frames (the game never shows Phaser's missing-texture box).
7. **Phones / lifecycle.** No per-frame allocation; every pool has a named cap; effects come only from events and `world.decay.fires`, stop when a fire goes out (stage/wave change), reset on scene restart, survive a hidden tab (a burst after waking is capped) and a late join (nothing is shown until real events arrive).
8. **Tests.** Ring flames at exactly the zone radius (and the touch ⇔ burn property against `circleInFire`); barricade rotation draws inside the footprint with struts on the back; burning cue / damage number logic (event → label, own-player-only glow and numbers, cue expiry); pool caps; asset naming and size. Each new test fails under one mutation.
9. **Verified in a real browser** (Playwright, solo dev build, 844 × 390 at DPR 2, HUD visible): screenshots in `docs/art/4-11/ingame/` (sandbags at stage 3, a barricade in both rotations, the burning car with its flame circle, my survivor burning in the zone with flames/smoke/glow/-5, one wide shot); `?stress=150` FPS before/after at stage 3 with `uptime` load.

## Tasks / Subtasks

- [x] T1 Assets (AC 5, 6): Meshy references → `tools/art/build_sprites.py` + `tools/art/prompts.json` → `apps/client/public/assets/atlases/objects.png/.json` (frames `prop_sandbags_a`, `building_barricade_a`, `fx_flame_a–d`, `fx_smoke_a–d`); raw outputs only in the session scratchpad.
- [x] T2 Loading (AC 6, 7): `BootScene.preload` loads `atlas_objects`; `objectsAtlas.ts` registers procedural fallback frames when it is missing; the downtown atlas's `prop_sandbags_a` is drawn from the loaded frame (so the bake's `drawFrame` path is unchanged).
- [x] T3 Barricade (AC 2): `BuildingView` draws each barricade as a pooled `Image` (`building_barricade_a`) placed by a pure `barricadeTransform` (rot 0–3), night + damage tint, shadow (raisedLook), cracks + HP bar on Graphics; the placement preview shows the turned sprite as a ghost.
- [x] T4 Burning car (AC 3): `CityView` pools ring flames (`ringFlameSpot` at `fireRingRadiusM`), car flames, smoke puffs and sparks per fire; flicker + damage-tick pulse; caps as constants.
- [x] T5 Burning survivor (AC 4): `render/burnCue.ts` (pure: labels, glow alpha, pop pool, body-flame spots), `BurnView` (pooled body flames / smoke / embers per burning player, own-player edge glow), HudScene "-N" pops from `hudModel` (fixed queue), `PlayerView` loses `BURNING_TINT`; cue + pops cleared on scene restart and when the wave/build starts.
- [x] T6 Tests + mutations (AC 8).
- [x] T7 Browser check, screenshots, FPS before/after with load; gates; story record (AC 9).

## Dev Notes

### Designer decisions (2026-11-23, final; recorded verbatim in substance)

- **Sandbags = S2** (`docs/art/4-11/sandbags_s2.jpg`): olive-drab military canvas sandbags, neat brick-offset rows. Footprint 3 × 1 m (cover kind `sandbags`, horizontal or vertical). Reads as sandbags at in-game size and still looks LOW (bullets pass over; short shadow).
- **Wood barricade = B6** (`barricade_b6.jpg`): tall upright palisade of sharpened planks held by diagonal struts. Footprint 2 × 0.5 m; MUST rotate with placement (rot 0/1, and 2/3 which the placement also allows) and look standing, not lying on the ground. Keep damage look (darkening + cracks) and HP bar. **B8 not now** (kept for an Epic 5 upgrade).
- **Burning car = F6** (`car_fire_f6.jpg`): thick smoke, burning debris, orange heat glow, small fires in a circle marking the danger zone, EXACTLY at the damage edge (`fireRingRadiusM` = zone radius; "your body touches the flames = you burn", same as `circleInFire`), placed by code, animated (flicker), pulsing with the 0.5 s damage tick welcome. The car can keep the existing burnt car art.
- **Burning survivor:** all four cues, driven only by server fire-damage events (`FireCue`, 0.7 s after the last hit), for every player online and solo: (1) flames on the body, (2) smoke puffs + rising embers, (3) own survivor only: orange pulsing screen-edge glow, (4) a small orange "-5" (real amount, rounded like the HP display) floating up per fire hit. Remove `BURNING_TINT` or keep only if it helps: **removed** (the flames read better; a tint under ADD flames only muddied the sprite).
- **Art direction:** gritty realistic Dead City, no outline aid, shadows by height drawn by the game (`raisedLook`), never baked into a sprite.

### Decisions made while writing the story (non-interactive)

- **D1 One loaded atlas `atlas_objects`** (`public/assets/atlases/objects.png/.json`, Phaser JSON-hash), the architecture's loader path (§Asset loading: "Phaser Loader (atlases …)", §Directory `atlases/`). Loaded in `BootScene.preload` (Boot always runs first, also for `?solo`/`?stress`; textures outlive scene restarts). Vite serves `public/` at `BASE_URL` (`/` on the VPS, a subpath on Pages): the URL is built with `import.meta.env.BASE_URL`.
- **D2 Sandbags stay in the bake.** The downtown canvas atlas draws `prop_sandbags_a` from the loaded frame when present (procedural `drawSandbags` otherwise), so `drawCity.coverPiece → drawFrame` and the lightmap multiply stay as they are (the sprite is lit like the rest of the street). True colours in the PNG; the bake darkens it.
- **D3 Barricade as pooled Images** (cap = `MAX_BARRICADE_IMAGES`, 4 players × `maxPerPlayer` 6 = 24, checked at construction against balance), placed by pure `barricadeTransform(b, out)`: centre of the footprint, angle `rot × 90°`, display size `widthM × depthM` in the art's own frame. Art: stakes along +x, struts toward −y (the back). Tint = night (`NIGHT_DARKEN`) + damage darkening; shadow = `castShadow` on a Graphics under the images (height `BARRICADE_HEIGHT_M`, raised to 1.6 m for a palisade); cracks + bevel-free outline on a Graphics above; HP bar unchanged (depth 12).
- **D4 Ring flames** (`fireRing.ts › ringFlameSpot(f, i, n, out)`, `ringFlameCount(r)`): centred exactly on the circle of radius `fireRingRadiusM(f)`, evenly spaced (`RING_FLAME_SPACING_M`), cap `RING_FLAMES_MAX` per fire; frames `fx_flame_a–d` with ADD blending; flicker = frame/scale/alpha changes from a hash of time (no allocation); pulse = a brightness kick at each `pulseS` boundary of the view's clock (cosmetic: the server's per-body burn clocks are not synced). The crisp 2 px ember ring line stays (it is the exact edge).
- **D5 Smoke and debris over the car:** pooled smoke puffs (`fx_smoke_*`, NORMAL blend, dark tint) rising and drifting toward the lower right (the light's shadow side), growing and fading on a loop; animated car flames (ADD) over the car body; sparks reuse the ember dots.
- **D6 Burning survivor:** `BurnView` holds per-player pools (body flames, smoke, embers; ≤ `MAX_BURNING_PLAYERS` = 4); positions from the drawn `PlayerView` x/y; visible only while `FireCue.burning`. Own-player edge glow: four `fx_edge_a` bands (new white-gradient frame in `atlas_fx`) tinted orange, ADD, around the camera view at depth 11.95, alpha pulsing at the damage tick. "-N" pops: HudScene (screen space, crisp outlined text like the money pops), pool `FIRE_POP_POOL`, strings cached per integer (no string per frame), queued through a fixed array in `hudModel`.
- **D8 (during the build) Flames use normal blending.** The flame PNG carries full-strength colour with alpha from brightness; additive blending saturated to yellow-green over the lit car. Smoke is a light warm grey (`0x9a8f86`): a dark tint vanished on the night street.
- **D9 (during the build) Two zones side by side:** a ring flame strictly inside another burning zone is hidden (`ringFlameMarksEdge`), so the flames outline the union — the edge that actually burns. The 2 px ring line still draws both circles.
- **D10 (during the build) Barricade art = a 9-stake slice of the raw palisade** (`cropX` in `prompts.json`): the full 16-stake image squashed into 2 × 0.5 m read as a comb; 9 thick stakes (~22 cm) with two strut tips behind read as a palisade. Shadow height raised to 1.6 m (tall palisade). The placement preview shows the turned art as a ghost under a lighter coloured box.
- **D7 Lifecycle:** `FireCue.clear()` + pops cleared on `create` (restart) and on `build.started` / `wave.started` (a build start can put a fire out; the next real hit relights the cue within 0.5 s). Pops after a hidden tab: the pool reuses the oldest slot, so a burst never grows anything.

### Current state (read before changing)

- `render/city/spriteArt.ts › drawSandbags(g, w, h)`: two rows of khaki ellipses (19.2 map px bags) — the procedural fallback after this story. `spriteAtlas.ts` builds three canvas atlases (`atlas_characters`, `atlas_downtown`, `atlas_fx`) via `packAtlas` (≤ 2048, 2 px padding), frames named by `frameName` (`category_name_variant`); `PROP_SANDBAGS` native 96 × 32 map px at `DOWNTOWN_ATLAS_SCALE` 2 (64 px/m). `ensureAtlases` registers once per game; the bake draws from the downtown atlas canvas.
- `render/city/drawCity.ts › drawOverlay`: cover shadows (`castBoxShadow(…, contact=false)` for low cover, length `shadowLenPx(HEIGHT_BY_KIND)`), scorch, cover pieces (`coverPiece → drawFrame(PROP_SANDBAGS, horiz ? "right" : "down")`), static `flames()` over each fire.
- `render/BuildingView.ts`: one Graphics (depth 3) per redraw: `castShadow(BARRICADE_HEIGHT_M 1.2)`, a wood rect with plank seams along the long side (so `rot` only shows as w ≥ h), damage darkening (`DAMAGE_DARKEN` 0.45 at 0 HP), `drawCracks` (2 per lost quarter, hashed by id), `raisedBevel`, outline; HP bar on its own Graphics (depth 12) along the long side; redraws on `buildings.version` or `hpChecksum` change; preview Graphics (depth 13) with a 0.5 m lattice. Turrets are drawn by `TurretView` (unchanged).
- `render/city/CityView.ts`: fires from `world.decay.fires` on `showStage`; per frame: flickering fire light (`FIRE_LIGHTS` 4), the 2 px ember ring (`strokeFireRings` at `fireRingRadiusM`), 8 ember dots per fire (`emberSpot`). `fireRing.ts` pins the ring radius = zone radius (test vs `circleInFire`).
- `render/fireCue.ts › FireCue` (`hit`, `burning`, `clear`, `FIRE_CUE_MS` 700), `isFireHit`. `GameScene` feeds it from `host.drainEvents()`; `PlayerView.update(…, burning)` tints `BURNING_TINT` 0xff8a4a; `hudModel.burning` → HudScene "HP n / m   Burning".
- Fire damage (`shared/decay/fire.ts`): pulse = `round(damagePerS × pulseS)` = 5 every 0.5 s per body; no event in god mode (dev cheat) — screenshots need god mode **off** (use `?zdmg=0`).

### Must preserve

Bake once per stage; `fireRing` tests; cover shadows short for low cover; barricade damage look + HP bar + selection (`BuildingSelectView`) + placement preview; `?stress`; scene restart (textures persist, views rebuilt in `create`); HUD "Burning" text; online/solo parity (events only).

### Testing

Vitest, pure helpers only (no Phaser in unit tests). New: `fireRing.test.ts` (ring flames on the radius, count/cap, touch ⇔ burn), `barricadeLook.test.ts` (transform per rot, inside footprint, struts on the back), `burnCue.test.ts` (label rounding + cache, own-only glow, cue expiry, pop pool cap/oldest reuse), `objectsAtlas.test.ts` (the committed PNG/JSON: names, ≤ 2048, frames inside the image, sizes match footprints, first-load size). Mutations once each.

### Project Structure Notes

- Client rendering in `apps/client/src/render` (+ `render/city/*`); assets in `apps/client/public/assets/atlases/` (architecture §Directory Structure); art tools in `tools/art/` (Python + PIL; not part of typecheck/lint).

### References

- `docs/art/4-11/README.md` and the four reference images; `_bmad-output/planning-artifacts/epics.md` › Story 4.11; `game-architecture.md` §Asset loading, §Directory Structure, §Performance (≤ 2048, 15 MB).
- Story 4.8 (D3 burn clocks, D13 cue = server truth, D16 ring at the exact edge, re-review L3 `strokeFireRings`), Story 4.9 (D1–D5 bake, atlases, depth order, `NIGHT_DARKEN`).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `story-4-11`.

### Debug Log References

- Baseline gate before the story: not re-run (branch tip cdb9c6e = the designer's commit on a green tip). After: **194 files passed (1 skipped), 1,415 tests passed (3 skipped)**; typecheck, lint, build green. Load (`uptime`): 2.27 before the gate, 2.97 after (my headless browser runs just before).
- Phaser 4.2.1 checked in `node_modules/phaser/types`: `LoaderPlugin.atlas(key, textureURL, atlasURL)`, `Texture.has/get`, `Frame.cutX/cutY/cutWidth/cutHeight`, `Frame.source.image`, `setTint` (multiply by default), `BlendModes.ADD`.
- The client tsconfig has no Node types: `objectsAtlas.test.ts` loads `node:fs` with a typed dynamic import (`@vite-ignore`), like a DOM-only file would.
- Screenshots of a burning survivor need god mode OFF (`fire.ts` skips god mode): `?zdmg=0` instead. Downtown cars are 4.5 m long, so a survivor put on the car's short side is pushed out of the car box (and out of the zone): the scripts stand on the long side.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Sandbags (S2):** the downtown canvas atlas's `prop_sandbags_a` is now copied from the loaded frame (olive-drab canvas bags, three brick-offset rows, tied ends) and baked/lit with the city as before; shadow unchanged (0.6 m, no contact band). Procedural `drawSandbags` is the fallback.
- **Wood barricade (B6):** pooled `Image`s (`MAX_BARRICADE_SPRITES` 24, checked against `maxPerPlayer × MAX_PLAYERS`), placed by `barricadeTransform` (rot 0–3: long side on the footprint's long side, struts north/east/south/west), tint = night + damage darkening, cracks on a Graphics above, HP bar unchanged, game-drawn shadow (1.6 m). Other building types keep the plank box (the turret draws its plate on it). The placement preview shows the turned art.
- **Burning car (F6):** per fire (≤ 4): ring flames exactly on `fireRingRadiusM` (spacing 0.75 m, ≤ 24; 17 at r 2 m), flickering (4 frames, size/alpha hash at 8 Hz) and swelling with the 0.5 s damage tick (`damageTickPulse`, `pulseS` read from balance); 4 flames over the car; 6 smoke puffs drifting lower-right; 10 rising sparks. The 2 px ember ring and its embers, the scorch and the baked glow stay. The car keeps its 4.9 art.
- **Burning survivor:** `BurnView` (≤ 4 survivors: 3 flames, 3 smoke puffs, 5 embers each) for every survivor `FireCue.burning` (server `player.damaged` with no zombie source, 0.7 s); my survivor only: four orange additive edge bands in the HUD (`fx_edge_a`, alpha pulsing with the damage tick, `edgeGlowAlpha`) and a small orange "-N" per fire hit (`fireDamageLabel` = ceil like the HP text, cached strings; `PopPool` of 6, oldest reused; `hudModel.fireHitAmounts` queue of 4 per frame). **`BURNING_TINT` removed** (the flames read better; the tint under them only muddied the sprite). The HUD "Burning" text stays. "-N" is shown for MY hits only (the epics AC groups it with the glow; teammates show flames/smoke/embers).
- **Lifecycle:** cues and pops come only from drained events; `FireCue` cleared on scene create and on `build.started` / `wave.started`; pops/queue capped (a woken tab: checked, 1 pop + glow after a 3 s sleep, no errors); scene restart rebuilds every pool (no leftover burning cue); fire effects follow `world.decay.fires` (a fire going out re-bakes and `placeFireFx` hides its pool).
- **Asset pipeline:** Meshy text-to-image (`nano-banana-pro`) on pure magenta (objects) / pure black (VFX) → `tools/art/build_sprites.py` (soft magenta key + despill, crop, exact footprint resize, olive grade for the sandbags; black VFX: alpha from brightness, 2 × 2 sheets split) → `apps/client/public/assets/atlases/objects.png` (460 × 328, 164 KB) + `objects.json` (Phaser JSON hash, 10 frames). Prompts and parameters in `tools/art/prompts.json`; raw outputs only in the session scratchpad (`b411/raw_*.png`). Loaded in `BootScene.preload`; missing file → procedural stand-ins under the same key (checked by aborting the PNG request: canvas texture, 10 frames, no errors).
- **Meshy:** 10 images (2 sandbags, 5 barricade, 2 flames — the first came on white, unusable — and 1 smoke), 90 credits (9 per image; balance 544 → 454 over my calls; the account's balance dropped further later from other use). Used: sandbags #2, barricade #2 (sliced), flames #2, smoke #1.
- **Tests (21 new/extended, all mutation-proven once):** `fireRing.test.ts` (+5: ring flames on the radius and evenly spread; touch a flame ⇔ `circleInFire` for players and every zombie size; count/cap; overlap hiding; damage-tick pulse), `barricadeLook.test.ts` (3: footprint covered at rot 0–3; struts N/E/S/W; tint), `burnCue.test.ts` (6: ceil label + cache; own-only numbers, bites ignored; queue cap; cue expiry + own glow; pop pool cap/oldest/free/clear; body flames on the body), `objectsAtlas.test.ts` (4: PNG header = JSON size ≤ 2048; exact frame set, names, sizes, inside, no overlap; footprint proportions = the downtown frame and the balance footprint; < 1 MB and < 15 MB). Mutations (script in the scratchpad, each restored): M1 ring flames +0.2 m off the radius (2 tests fail); M2 overlap never hides; M3 no width/depth swap when turned; M4 rot 2/3 not flipped; M5 numbers for every player; M6 label rounds instead of ceil; M7 pool reuses the newest; M8 glow while not burning; M9 tint ignores damage; M10 frame size drift (2); M11 queue uncapped; M12 pulse never fades — all 12 fail.
- **FPS, `?stress=150`, headless Chromium 844 × 390 DPR 2 (SwiftShader; my browser is the load), stage 3 via the dev cheat:** centre of the map (no fire in view): before 13.5 / 13.8 / 13.4 (load 0.09 → 1.92), after 13.8 / 13.9 / 14.0 (load 0.96 → 1.69). Next to the burning cars (both fires in view, 150 walkers around): before 14.9 / 13.5 / 13.0 (load 1.62 → 2.79) and 16.1 / 14.5 / 13.7 (re-run on a stash of the change, load 1.58 → 2.69); after 12.6 / 12.5 / 12.2 (load 1.69 → 2.39): about −1.5 FPS (~10 %) on the CPU rasterizer near two fires (large smoke quads are fill-bound there; a GPU should not care). Not measured on a phone.
- **Screenshots** (`docs/art/4-11/ingame/`, 844 × 390 at DPR 2, HUD visible, solo dev build): `sandbags-stage3.png`, `barricade-rot0-rot1.png` (rot 0, rot 1 and a damaged rot 0 with its bar), `burning-car-flame-circle.png`, `survivor-burning.png` (flames, smoke, edge glow, two "-5", HUD "Burning"), `wide.png` (camera zoomed out × 0.5: both kinds of fire ring, sandbags, barricades).

### Notes for the merge

- **Shared files:** none (no sim, collision, network, map or balance change; `decay.json › fire.pulseS` is only read).
- `apps/client/src/scenes/BootScene.ts`: new `preload()` (the first loaded asset in the game). `GameScene.ts`: `BurnView` field + create/destroy, `routeFireHit` replaces the `isFireHit` line, `FireCue.clear()` on `build.started` / `wave.started`, `hudModel.burnGlow`, `new BuildingView(this, balance)`, `burnView.begin/end` around `syncPlayerView`. `hudModel.ts`: `burnGlow`, `fireHitAmounts`, `fireHitCount`. `HudScene.ts`: `drawBurn()` (fire pops + edge glow), resize of the pop font.
- `render/city/spriteAtlas.ts`: `ensureAtlases` first calls `ensureObjectsAtlas`; new fx frame `fx_edge_a`; the downtown sandbags frame is copied from the loaded atlas. `render/city/CityView.ts`: fire effect pools (`placeFireFx`, `updateFireFx`). `render/city/fireRing.ts`: ring-flame helpers. `render/PlayerView.ts`: `update()` lost its `burning` argument (BURNING_TINT removed). `render/fireCue.ts`: `sinceLastHit`. `render/BuildingView.ts`: constructor takes the balance; barricade sprites.
- **Assets:** `apps/client/public/assets/atlases/objects.{png,json}` are generated: never hand-edit; rebuild with `python3 -I tools/art/build_sprites.py <raw_dir>` (raw Meshy images are not in git: regenerate them from `tools/art/prompts.json`, or keep the committed PNG).

### Not verified

- **Real phones** (FPS with the fire effects, the ~165 KB atlas download on 4G, how the 2 × 0.5 m barricade reads at real phone zoom and in sunlight) — only headless Chromium (SwiftShader, ~13–16 FPS).
- **Online:** no server run. The cues use the same `player.damaged` events online (the netsim/NetSimHost fire tests of 4.8 cover their delivery), but several players burning at once and a teammate's flames were not seen in a browser; `?lag=150` not run.
- The barricade still reads small at in-game size (a 0.5 m deep footprint); a designer look is the real check. Its shadow is subtle on the dark street.
- The ring flames' damage-tick pulse uses the view's own clock (the server's per-body burn clocks are not synced), so it matches the rhythm, not the exact moment of a hit; the edge glow's pulse is keyed to my last real hit.
- Safari / iOS canvas behaviour of the fallback atlas; a DPR-3 phone.

### File List

- `_bmad-output/implementation-artifacts/4-11-stage-object-readability-pass.md` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/client/public/assets/atlases/objects.png`, `objects.json` (new, generated)
- `apps/client/src/render/BurnView.ts` (new)
- `apps/client/src/render/burnCue.ts` + `burnCue.test.ts` (new)
- `apps/client/src/render/barricadeLook.ts` + `barricadeLook.test.ts` (new)
- `apps/client/src/render/city/objectsAtlas.ts` + `objectsAtlas.test.ts` (new)
- `apps/client/src/render/city/fireRing.ts`, `fireRing.test.ts`, `CityView.ts`, `spriteAtlas.ts`
- `apps/client/src/render/BuildingView.ts`, `PlayerView.ts`, `fireCue.ts`
- `apps/client/src/scenes/BootScene.ts`, `GameScene.ts`, `HudScene.ts`, `hudModel.ts`
- `tools/art/build_sprites.py`, `tools/art/prompts.json` (new)
- `docs/art/4-11/ingame/*.png` (new: 5 screenshots)

## Change Log

- 2026-11-23: Story written (gds-create-story, designer decisions recorded) and built: Meshy sprites + `atlas_objects` (sandbags S2, barricade B6, flames, smoke), turned barricade sprites, F6 fire ring/flames/smoke/sparks, burning-survivor cues (flames, smoke, embers, my edge glow and "-N"), BURNING_TINT removed; tests + 12 mutations; browser screenshots; FPS before/after. Status review.
