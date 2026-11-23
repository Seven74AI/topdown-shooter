# Story 4.12: Story 4.11 objects redrawn in game code

Status: review

## Story

As the designer,
I want every object in the game drawn in game code,
so that the art is consistent, free to change and ready for customization.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist. Quoted in full (builders and reviewers: check each line):
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies; server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the 4.10 phone numbers are the floor, not to be lost.
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: start from the 4.10 earnings decision; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> ```
>
> **How it applies.** This story is **client rendering only**: no sim, collision, network, map or balance change, so lines 2, 5–8, 11, 15 and 16 hold by construction (the fire numbers — `decay.json › fire.radiusM`, `pulseS` — are only *read*; no event or state is added: 0 B/s). Lines that apply: **1** (worktree `story-4-12`, ports server 4127 / client 5127; gates), **3** (the player-visible rules below: AC 3's edge rule is THE fairness rule of this story), **4** (reviewers: try to stand where flames are drawn and not burn, or burn where none are drawn), **9** (every new test mutated once), **10** (no per-frame allocation: fixed typed-array particle pools; see D7 for where the caps live), **12** (atlased, pooled, capped; `?stress=150` before/after with load), **13** (the objects stay recognisable), **14** (hidden tab: a woken tab is one capped step; late start: nothing until real events; scene restart rebuilds the pools), **17** (Phaser 4: `setTint` multiply + `BlendModes.ADD` checked in `node_modules/phaser/types`), **18** (`?fx=low` switch; what was not verified), **19** (notes for the merge).

## Acceptance Criteria

The epics entry (`epics.md › Story 4.12`) asks for the accepted mockups in code, the 4.11 rules kept, and the Meshy `objects` atlas and its loader removed. The designer's final decisions (2026-11-23, recorded in Dev Notes) fix the picks: **B6** and **S2** from the "round 4" code drawings (`docs/art/4-12/mockups.html`), and the fire = **fire-lab panel "D — fuel flames, no pool"** (`docs/art/4-12/fire-lab.html`) plus the lab's **"Burning survivor"** panel.

1. **Wood barricade (B6), game code.** The player-built wood barricade is drawn by `drawWoodBarricade` (port of round-4 `drawB6`): a palisade of 14 sharpened planks seen strictly from above (four lit faces per point, nails on a rail) propped by four diagonal struts to the back; its height shows only in the **game-drawn shadow** (cast from the plank row, 1.6 m) and the lit tops — no shadow in the art. It keeps 4.11's rotation (`barricadeTransform`, rot 0–3, struts N/E/S/W), the damage look (darkening tint + cracks per lost quarter), the HP bar and the placement ghost, and joins the 5.9 ladder in the same code atlas (`atlas_buildings`: B6 → B8 reinforced → M1c metal).
2. **Sandbags (S2), game code.** Stage-3 sandbags are drawn by `drawSandbags` (port of round-4 `drawS2`): olive-drab canvas bags in brick-offset rows, a second layer on top, spilled sand; baked with the city as before; LOW — only the game's short cover shadow (`HEIGHT_BY_KIND.sandbags`), no ground shadow in the art.
3. **Burning car + fire zone (fire-lab D), game code.** Particle flames (pre-rendered soft sprites, additive), smoke (normal blending, **below zombies and survivors**), embers, the scorch and a soft flickering ground light; no lava pool; the car itself in the game's own `drawCar` style, **charred**. **Fairness rule (4.11, kept): the visible bright flame (alpha > 50 %) never passes the damage radius R (`fireRingRadiusM` = the sim's `circleInFire` edge) — every drawn flame's outer bright edge ≤ R + 0.02 m — and a clear ring of flames marks the edge (bright edges reach R in every direction), so "your body touches the flames = you burn".** The thin ring line stays exactly at R.
4. **Burning survivor.** The lab's particle flames, smoke and embers on the body (and its warm light), for every survivor the server reports burning (`FireCue` from `player.damaged` fire events, online and solo), dying down ~0.9 s after the cue ends; my survivor's screen-edge glow and "-N" numbers unchanged.
5. **Pools and caps.** Fixed pools per fire (lab D: 130 flames + 44 smoke + 24 embers = 198 ≈ 200) and per survivor (28 + 10 + 14); a **low-quality half cap** the game can use (`?fx=low`: half of every cap and spawn rate); no allocation per frame; a woken tab is one capped step; a fire out of view is not simulated or drawn.
6. **Meshy atlas removed.** `apps/client/public/assets/atlases/objects.png/.json`, its loader (`BootScene.preload`), its fallback (`objectsAtlas.ts`) and `tools/art/build_sprites.py` + `prompts.json` are gone; the build output ships no `objects.png`.
7. **Tests** (each mutation-proven once): the edge rule on the drawn particles (≤ R + 0.02 m over many seeds, radii, car facings and both qualities), the ring at the edge (every direction), touch ⇔ burn against `circleInFire`, the flame sprite's core fraction, caps (and half caps), the woken-tab step, culling, the body fire's life cycle, the B6/S2 drawings' layout (inside the footprint, plank tops in the front band, struts reaching the planks, no baked ground shadow, brick offset), the palisade's shadow band per rotation, atlas rules for the new atlases.
8. **Verified in a real browser** (Playwright, solo dev build, 844 × 390 at DPR 2, stage 3 via the build-phase Decay cheat): screenshots in `docs/art/4-12/ingame/` (sandbags, barricades in all rotations, burning car, survivor burning, wide); `?stress=150` FPS next to both fires before (4.11 sprite fire) / after, with `uptime` load.

## Tasks / Subtasks

- [x] T1 Story file from the real code (this file).
- [x] T2 Fire particles (AC 3, 5): pure `fireSprites.ts` (lab masks, ramp, palettes, core fraction) + `fireParticles.ts` (pools, `CarFire`, `BodyFire`, draw rules incl. THE edge rule, culling) + `fireFxAtlas.ts` (one canvas atlas) + `FireView.ts` (pooled images per fire) wired into `CityView` (old ring flames / car flames / smoke / sparks / ember dots / flicker light removed; ring line kept + a soft glow band inside it).
- [x] T3 Charred car (AC 3): `drawCharredCar` + `vehicle_carburnt_*` frames; the bake draws a fire's target car charred; 4.11's static baked flames removed.
- [x] T4 Burning survivor (AC 4): `BurnView` rewritten on `BodyFire` (slots bound per player while burning + dying down).
- [x] T5 B6 + S2 (AC 1, 2): `objectArt.ts` (ports + the mockups' `part`/`woodTex`/`clothTex`), `FRAME_WOOD` in `atlas_buildings`, palisade shadow band, sandbags frame drawn in code.
- [x] T6 Remove the Meshy atlas, loader, fallback and tools (AC 6).
- [x] T7 Tests + mutations (AC 7).
- [x] T8 Browser check, screenshots, FPS before/after with load; gates; story record (AC 8).

## Dev Notes

### Designer decisions (2026-11-23, final)

- **ALL game art is game code.** Replace the Meshy-made 4.11 sprites (`apps/client/public/assets/atlases/objects.png/.json`) with code.
- **Wood barricade B6:** port the "round 4" B6 code drawing (`mockups.html › drawB6`): palisade of sharpened planks + struts, strictly top-down, height via game-drawn shadow + lit tops; keep rotation, damage darkening/cracks, HP bar, the 5.9 upgrade ladder (B8 reinforced and M1c metal already code in 5.9 — keep them consistent).
- **Sandbags S2:** port the round-4 S2 code drawing (`drawS2`: olive-drab bags, brick offset, low, short shadow) into the city bake.
- **Burning car + fire zone:** fire-lab panel **D — fuel flames, no pool**: particle flames (pre-rendered soft particle sprites stamped with additive blending), smoke (normal blending, BELOW zombies and survivors as 4.11's review required), embers, scorch + soft flickering ground light, no lava pool; the car in the game's own `drawCar` style, charred. Keep the 4.11 rules: the visible bright flame edge lies ON the 2 m damage radius (`fireRingRadiusM` / `circleInFire`), a clear ring of flames at the edge, the edge tests adapted to particles (outer bright edge ≤ R + 0.02 m), pooled particles with a fixed cap per fire (lab: ~200, a "low quality" half cap the game can use), no per-frame allocation.
- **Burning survivor:** port the fire-lab "Burning survivor" panel (particle flames + smoke + embers on the body) into `BurnView`, driven by the same server fire-damage events (`FireCue`); own-player screen-edge glow and "-N" numbers unchanged.
- **Remove** the objects atlas, its loader and fallback, and `tools/art/build_sprites.py` (nothing else uses it); the build output must not ship `objects.png`.

### Decisions made while writing the story (non-interactive)

- **D1 Particles in pure code + pooled images.** The lab's simulation (spawn rules, buoyancy/turbulence/wind, life curves, colour ramp, smoke palettes) is ported 1:1 into `render/city/fireParticles.ts` (no Phaser, no DOM): structure-of-arrays typed pools (`ParticlePool`), a seeded `FxRandom` per emitter (cosmetic: no sim stream, nothing reads it back), `flameDraw` / `smokeDraw` / `emberDraw` turn one particle into what the view puts on an image. `FireView` (Phaser) owns one image per pool slot (flames ADD, smoke NORMAL, embers ADD) and copies those numbers each frame. Tests run the same functions the view uses.
- **D2 Sprites: white masks + tint.** The lab pre-tints 16 colour steps × 4 flame shapes; the game stores the 4 flame and 3 smoke masks once, white with the shape in alpha (`atlas_firefx`, made from the pure masks on first use), and multiplies each image by its ramp / palette colour (`setTint`, Phaser 4 multiply) — the same pixels, 1/16 of the texture.
- **D3 THE edge rule in `flameDraw`.** With `fitR` = R: the flame's bright core (`flameCoreFrac() × L / 2`, L ≥ H the stretched length) must end at R at most: shrunk to fit, not drawn under 2.5 cm of room (the lab's rule). `flameCoreFrac` = the measured radius of every alpha ≥ 0.5 texel over the four masks + 0.02 (filtering margin). 60 % of zone flames spawn right at the edge (`R − core·s/2 − rnd·6 cm`): the ring of flames.
- **D4 Car facing.** The lab's car-shaped spawn areas (engine bay / cabin, smoke, embers) are turned to the burning car's `carStyle().front` (`FireView.setFires(…, carAngle)`).
- **D5 Charred car = frames in the downtown atlas.** `drawCharredCar` = `drawCar` + the lab's `bakeCar` charring (`source-atop` darkening, engine/cabin blots, soot), one `vehicle_carburnt_<v>` frame per colour variant; `coverPiece` picks it for a car that is a fire's `target`. The baked 4.11 static flames (`drawCity.flames`) are removed; scorch and the lightmap glow stay.
- **D6 Ring.** The 2 px ring line at R stays (pinned by `strokeFireRings` tests); the lab's soft 5 px additive band is added just inside it (outer edge on R), pulsing with the damage tick. The 4.11 ember dots on the ring and the 4 m flicker light are replaced by the particle embers and the lab's ground light (2R wide: no light past the zone).
- **D7 Caps live as named client constants, not in balance JSON.** Brief line 12 asks for caps in balance JSON; these are cosmetic client caps (no sim reads them), and 4.11/5.6 kept theirs as named constants. Moving them into `packages/shared` balance (schema + JSON) would add a shared-file change for three parallel builders with no gameplay effect: kept in `fireParticles.ts` (`FIRE_*_MAX`, `BODY_*_MAX`) — **reviewer: flag if you disagree**.
- **D8 `?fx=low`** (release-safe, `urlOptions.lowFx`): halves every cap and spawn rate (lab's "slow phone mode"), particles ×1.15 bigger. Default is full quality (the designer's pick).
- **D9 Body fire slots.** `BurnView.draw(id, x, y, r, burning)` is called for every alive survivor; a burning one takes a free slot (≤ 4) and keeps it until its flames have died down (`BodyFire.idle()`), so flames fade instead of popping off; particles are in world metres (they trail a running survivor). Body smoke sits below zombies and survivors like the car's (D: "smoke below characters").
- **D10 Culling (perf).** A fire whose zone + 6 m (smoke drift) is outside the camera view is neither simulated nor drawn (`fireInView`).
- **D11 B6/S2 as code frames.** `objectArt.ts` holds the round-4 ports and their helpers (`part`, `woodTex`, `clothTex`, `softShade`), drawing in metres around the frame centre with no ground shadow. B6 axes follow 4.11 (planks along +x, struts toward −y): the mockup's y is mirrored. B6 = `building_barricade_wood` in `atlas_buildings` (96 px/m) next to B8/M1c; S2 = the downtown `prop_sandbags_a` frame (64 px/m). B6's tall shadow is cast from the plank row's band (`frameBandBox`), not the whole footprint (the struts are low).

### Current state (read before changing)

- `render/city/objectsAtlas.ts` (4.11): `atlas_objects` loaded in `BootScene.preload`, procedural fallback, frames `prop_sandbags_a`, `building_barricade_a`, `fx_flame_a–d`, `fx_smoke_a–d`; `spriteAtlas.ensureAtlases` copies its sandbags into the downtown atlas; `buildingsAtlas` maps `wood_barricade` to it; `CityView` and `BurnView` use its flame/smoke frames; `fireRing.test.ts` reads `objects.json › meta.coreFrac`.
- `render/city/CityView.ts`: per fire (≤ `FIRE_LIGHTS` 4): ring flames (`ringFlameSpot` etc.), 4 car flames, 6 smoke puffs (depth 4.38), 10 sparks, 8 ember dots, a 4 m flicker light; the 2 px ring line.
- `render/BurnView.ts`: per burning survivor 3 flames, 3 smoke puffs, 5 embers on loops (`burnCue.ts › BODY_*`, `bodyFlameSpot`); `GameScene.syncPlayerView` calls `draw` only while `FireCue.burning`.
- `render/BuildingView.ts`: pooled barricade images (`barricadeTransform`), shadow by height (`castShadow` on the footprint), cracks, HP bar, ghost. 5.9: `atlas_buildings` (`buildingArt.ts`: B8, M1c, spike trap, mine).
- `render/city/drawCity.ts`: `coverPiece` (car frames by `carStyle`), `scorch`, static `flames` per fire.

### Must preserve

The edge tests' meaning (touch ⇔ burn, ring at R, glow inside), smoke below zombies/survivors, barricade rotation + damage look + HP bar + ghost + `BuildingSelectView`, the 5.9 ladder, the cover shadows (low sandbags short), bake once per stage, `?stress`, scene restart (pools rebuilt in `create`), online/solo parity (cues from events only), HUD "Burning", edge glow and "-N".

### Testing

Vitest, pure helpers (no Phaser in unit tests); a recording 2D-context stand-in (`recordCanvas.ts`) for the code drawings. Mutation-test each new test once.

### Project Structure Notes

- Client rendering only: `apps/client/src/render` (+ `render/city/*`), `scenes/GameScene.ts`, `scenes/BootScene.ts`, `debug/urlOptions.ts`. No `packages/shared` change.

### References

- `docs/art/4-12/mockups.html` (round 4: `drawB6`, `drawS2`, helpers), `docs/art/4-12/fire-lab.html` (panel D, "Burning survivor"), `epics.md › Story 4.12`, Story 4.11 (rules, review M/L3), Story 5.9 (`atlas_buildings`, ladder), `epic-4-retro-2026-11-23.md` §11.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `story-4-12`.

### Debug Log References

- Gate on `story-4-12` (not yet merged with the work branch — the main session does that): `npm run typecheck && npm run lint && npm test && npm run build` green — **215 files passed (1 skipped), 1,607 tests passed (3 skipped)**. `uptime` load 11.62 before, 8.38 after (three other builders running browsers/tests on the box).
- Build output: `apps/client/dist` contains no `objects.*` (checked with `find`); the 4.11 dist did ship `assets/atlases/objects.png/.json`.
- Phaser 4.2.1 checked in `node_modules/phaser/types`: `setTint(topLeft…)` multiplies by default (`setTintMode` separate), `BlendModes.ADD`, `Image.setFrame/setDisplaySize/setRotation`.
- Headless dev builds for FPS: `vite build --mode development` keeps `import.meta.env.DEV` false; `NODE_ENV=development vite build --mode development` keeps the dev cheats (the Decay cheat) — used for the before/after builds served on 4127 (before, stash of the change) and 5127 (after).
- `FireView.update` JS cost measured in the browser: **0.36 ms / frame** for two fires (~330 live particles): the FPS cost is fill (big soft quads on SwiftShader), not CPU.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Fire (lab D):** `fireSprites.ts` (the lab's noise, 4 ragged flame masks, 3 smoke masks, ramp, palettes, measured core fraction), `fireParticles.ts` (typed-array pools, `CarFire` = panel D's spawn/motion/life rules, `BodyFire` = the survivor panel's, `flameDraw` with THE edge rule, `smokeDraw`, `emberDraw`, `fireInView`), `fireFxAtlas.ts` (`atlas_firefx`: `fx_fireflame_a–d`, `fx_firesmoke_a–c`, `fx_fireember_a`, `fx_firelight_a`, 96–128 px, white masks tinted per particle), `FireView.ts` (≤ 4 fires × 198 pooled images + a 2R ground light; flames/embers ADD, smoke NORMAL at depth 4.36 under zombies 4.5+ and survivors 10, flames 4.38, embers 11.6). Car flames follow the car's facing. `CityView` lost 4.11's ring flames, car flames, smoke, sparks, ember dots and flicker light; keeps the 2 px ring at R and adds the lab's 5 px soft band just inside it (pulsing with `pulseS`).
- **Charred car:** `drawCharredCar` (drawCar + the lab's charring) as `vehicle_carburnt_a–e` in the downtown atlas; the bake draws a fire's target car from it. 4.11's baked static flames removed (scorch and baked warm light kept).
- **Burning survivor:** `BurnView` rewritten on `BodyFire` (≤ 4 slots, 28 flames + 10 puffs + 14 sparks + a warm light each); `draw(id, x, y, r, burning)` is called for every survivor (burning = alive && `FireCue.burning`), flames die down ~0.9 s after the last server fire hit, then the slot frees. Edge glow, "-N" and HUD "Burning" untouched. Body smoke moved below zombies/survivors (4.39) like the car's.
- **B6 / S2:** `objectArt.ts` ports `drawB6` / `drawS2` and the mockups' `part`, `woodTex`, `clothTex`, `castShadow` (as `softShade`, Safari-safe). B6 = `building_barricade_wood` in `atlas_buildings` beside B8/M1c; its tall shadow is cast from the plank row (`frameBandBox`). Sandbags = the downtown `prop_sandbags_a` frame drawn in code. Two small fits to the box: B6 strut feet at −0.215 m (the 6.5 cm bar stayed inside 0.5 m); S2 spilled sand spread 2.9 m instead of 3.2 m (the frame would have clipped it anyway); the end bags' ties may jut 2.5 cm past the short sides (clipped, as in the mockup).
- **Removed:** `objectsAtlas.ts` (+ test), `public/assets/atlases/objects.png/.json`, `BootScene.preload`, `tools/art/build_sprites.py`, `tools/art/prompts.json`, `burnCue.BODY_*`/`bodyFlameSpot`, `fireRing` ring-flame and ember-dot helpers.
- **`?fx=low`** (release-safe): half caps and spawn rates (lab's slow-phone mode); default full.
- **Tests (new / rewritten, all mutation-proven):** `fireParticles.test.ts` (14: core fraction covers every ≥ 50 % texel; edge ≤ R + 0.02 m over 2 qualities × 3 radii × 4 seeds/facings × 240 frames (> 100 k flames); ring reaches R in all 16 sectors ≥ 75 % of frames; touch ⇔ burn vs `circleInFire`; ramp; ground light ends at its edge; caps/half caps; woken tab/paused; clear; smoke/embers; culling; body life cycle; never-burning; body half caps), `objectArt.test.ts` (6, on `recordCanvas.ts`), `barricadeLook.test.ts` (+1 band per rot), `fireRing.test.ts` (glow band + pulse), `bakeTiles.test.ts` (charred frame, no baked flames), `atlasLayout.test.ts` (+ buildings and firefx atlases), `urlOptions.test.ts` (`fx=low`), `mineLook.test.ts` (B6 in `atlas_buildings`).
- **Mutations (script `scratchpad/b412/mut.py`, each restored):** M1 no edge fit (2 fail), M2 core fraction × 0.8 (2), M3 no edge flames (2), M4 edge flames 30 cm in (2), M5 low = full caps, M6 no dt clamp, M7 cull margin 0, M8 body slot frees with particles alive (survived at first → test strengthened with `count() === 0` → killed), M9 struts float behind the planks, M10 no brick offset, M11 a ground shadow under the sandbags, M12 band ignores rotation, M13 glow band centred on R, M14 glow ignores the pulse, M15 burning car not charred, M16 B6 deeper than its footprint — **all 16 killed**.
- **Browser (Playwright, solo dev build, 844 × 390 DPR 2, `?solo&zdmg=0&wallet=2000`, stage 3 via the Decay cheat):** no page errors (only Chromium "GPU stall due to ReadPixels" driver notes from screenshots); `atlas_objects` absent and no `objects.*` request; barricades in rot 0–3 all `atlas_buildings:building_barricade_wood`; two fires, ~330 live particles; **on-screen edge check: the drawn flame images' bright reach minus R = 4e-16 m (≤ 0)**; standing in the zone: HP 100 → 75, body particles ~30, edge glow 0.55, "Burning". Screenshots in `docs/art/4-12/ingame/`: `sandbags-stage3.png`, `barricade-rot0-rot1.png` (rot 0–3, two damaged with bars), `burning-car.png`, `survivor-burning.png`, `wide.png` (camera × 0.55). Side-by-side with the lab's panel D and survivor panel (`scratchpad/b412/lab-4.png`, `lab-5.png`): same flames, edge ring and charred car; the black smoke reads fainter on the game's darker street.
- **FPS, `?stress=150`, stage 3, survivor next to the burning cars, headless Chromium (SwiftShader) 844 × 390 DPR 2, interleaved dev builds (load = `/proc/loadavg` 1-min, before → after each run):**

  | Run | 4.11 sprite fire (before) | Code fire (after) | `?fx=low` |
  | --- | --- | --- | --- |
  | 1 | 7.4 / 7.8 / 7.1 (6.4 → 7.8) | 6.3 / 5.3 / 4.5 (7.8 → 10.2) | — |
  | 2 | 8.4 / 6.9 / 6.6 (10.2 → 8.9) | (lost: the output file was truncated) | — |
  | 3 | 14.4 / 10.4 / 7.1 (9.1 → 8.2) | 7.0 / 8.4 / 6.7 (8.2 → 7.5) | 6.3 / 3.7 / 3.9 (7.5 → 9.9) |
  | 4 | 5.9 / 5.3 / 5.3 (9.9 → 10.4) | 4.9 / 4.7 / 4.7 (10.4 → 12.1) | 6.5 / 4.6 / 4.4 (12.1 → 12.7) |
  | dev server, earlier | 12.4 / 12.0 / 12.7; 14.6 / 12.8 / 12.3 (1.8 → 3.2) | 6.5 / 4.6 / 4.2; 5.8 / 4.7 / 5.0 (5.4 → 8.4) | 7.2 / 5.5 / 7.5 (8.4 → 7.9) |

  The box was saturated by the other builders (load 6–12), so the numbers are noisy; read as roughly **−1 to −2 FPS (~15–30 %) near two fires on the CPU rasterizer**, from fill (44 smoke puffs up to 3.5 m + ~130 additive flames per fire vs 4.11's 41 small sprites), not JS (0.36 ms/frame). Which cars burn is random per run (some "after" runs had only one fire on screen). `?fx=low` did not measure better under this load. Culling keeps the cost at zero when no fire is in view. **Needs a phone check (4.10 floor).**

### Notes for the merge

- **Shared files: none** (`packages/shared` untouched; `decay.json › fire` only read).
- `apps/client/src/scenes/GameScene.ts`: `syncPlayerViews(world, dtS)` (new arg; the call in `update` passes `0` while paused), `syncPlayerView` calls `burnView.draw(id, x, y, r, burning)` for every survivor, `new BurnView(this, urlOptions().lowFx)`, `new CityView(…, urlOptions().lowFx)`. 5.1/5.2/5.7 may touch the same file (different lines expected).
- `apps/client/src/scenes/BootScene.ts`: `preload()` removed (and its import).
- `apps/client/src/debug/urlOptions.ts` (+ test): new `lowFx` field (`?fx=low`); the test's full-object `toEqual` gained `lowFx: false` — merge with any other new field.
- `render/city/buildingsAtlas.ts` / `render/BuildingView.ts` (5.9 files): `FRAME_WOOD` + `inFrame` per art spec; `wood_barricade` → `atlas_buildings`; BuildingView no longer touches `atlas_objects`, casts the wood barricade's shadow from `frameBandBox`. `mineLook.test.ts` now lists `wood_barricade` in the atlas check.
- `render/city/spriteAtlas.ts`, `spriteArt.ts`, `drawCity.ts`: `CAR_BURNT_FRAMES` (+5 downtown frames), sandbags drawn by `objectArt.drawSandbags`, old `spriteArt.drawSandbags` and `drawCity.flames` removed.
- `render/city/CityView.ts`, `fireRing.ts`, `BurnView.ts`, `burnCue.ts`: 4.11 sprite fire code replaced (see Completion Notes). Anything else that imported `objectsAtlas`, `FLAME_FRAMES`, `SMOKE_FRAMES`, `ringFlame*`, `emberSpot`, `BODY_*` or `bodyFlameSpot` must move to `fireFxAtlas` / `fireParticles` (none on this branch).
- `docs/art/4-11/ingame/*` kept as the 4.11 record; the 4.12 shots are in `docs/art/4-12/ingame/`.

### Not verified

- **Real phones:** FPS with ~400 additive/soft particles next to two fires (the 4.10 floor), DPR 3, Safari/iOS (canvas `source-atop` charring, `shadowBlur` soft shade, `putImageData` masks). Only headless Chromium (SwiftShader) on a heavily loaded box.
- **Online:** no server run; the body fire uses the same `player.damaged` events as 4.11 (NetSimHost fire tests cover delivery), but several players burning at once, a teammate's flames and `?lag=150&jitter=20` were not seen in a browser.
- Hidden tab across a build start and a late Game scene start were not re-run in a browser for this story (unit tests: a woken 5 s frame is one 0.05 s step; pools are rebuilt with the views on restart; `FireView.setFires` follows each bake).
- The black smoke is faint on the night street (true to lab D's palette); the barricade still reads small at in-game size and its shadow is short (1.6 m → 0.28 m, the game's light): a designer look is the real check.
- Brief line 12's "caps in balance JSON" (D7) — kept as client constants on purpose; reviewer to confirm.

### File List

- `_bmad-output/implementation-artifacts/4-12-stage-objects-in-game-code.md` (new)
- `apps/client/src/render/city/fireSprites.ts`, `fireParticles.ts` + `fireParticles.test.ts`, `fireFxAtlas.ts`, `FireView.ts` (new)
- `apps/client/src/render/city/objectArt.ts` + `objectArt.test.ts`, `recordCanvas.ts` (new, test helper)
- `apps/client/src/render/city/CityView.ts`, `fireRing.ts` + `fireRing.test.ts`, `drawCity.ts`, `spriteArt.ts`, `spriteAtlas.ts`, `buildingsAtlas.ts`, `atlasLayout.test.ts`, `bakeTiles.test.ts`
- `apps/client/src/render/BurnView.ts`, `BuildingView.ts`, `barricadeLook.ts` + `barricadeLook.test.ts`, `burnCue.ts` + `burnCue.test.ts`, `mineLook.test.ts`
- `apps/client/src/scenes/GameScene.ts`, `BootScene.ts`; `apps/client/src/debug/urlOptions.ts` + `urlOptions.test.ts`
- Deleted: `apps/client/src/render/city/objectsAtlas.ts`, `objectsAtlas.test.ts`, `apps/client/public/assets/atlases/objects.png`, `objects.json`, `tools/art/build_sprites.py`, `tools/art/prompts.json`
- `docs/art/4-12/ingame/*.png` (new: 5 screenshots)
- `docs/art/4-12/img/objects.png` (review fix L4: the fire lab's reference image)

## Review fixes (2026-11-23)

Fresh reviewer on d42d2e2: one medium (fairness), four lows. All fixed on `story-4-12`, keeping fire D's look.

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| M1 | M | The flame ring was gappy INSIDE R: within 15 cm of R only 17–40 % of directions had bright flame (12–24 % with `?fx=low`); the nearest bright pixel was a median 0.64 m inside R, so a body touching R could burn with no flame under it. The fit shrank every flame by the largest of the four shapes' cores, and buoyancy carried edge flames up until they were culled. | **Fixed edge slots** (`fireParticles.ts › CarFire.edgeN`, `edgeFlameDraw`): one flame per 0.3 m of circumference (R = 2 m: 42; ≤ 80; size and spacing scale down below R = 2 m), **the same in `?fx=low`**. No buoyancy: they only sway a little along the ring and flicker in size, shape and colour. Each is drawn with its −y side facing outward. Its centre sits so its OWN shape's reach toward that side ends on R (`flameReachUpOf`: texels ≥ `EDGE_REACH_ALPHA` 0.15, + 0.02). Because additive halos stack, edge flames are placed by their 15 % halo rather than their 50 % core. Alpha is 0.8–0.95 with an orange ramp start, so the overlapping ring reads flame-coloured, not white. Free flames now use their own shape's core (`flameCoreFracOf`) and are fitted to R − 8 cm (`freeFlameFitR`), so their halos don't stack past R with the ring's. **Edge coverage** (summed alpha × mask, 180 rays, frames 1–5 s, 3 seeds): R = 2 m full, **every frame ≥ 98.3 % of directions bright within 0.1 m inside R** (mean 99.8 %; median nearest bright point 0.06 m inside R, p95 0.08 m); `?fx=low` same (98.3 % / 99.8 %); R = 3.5 m 91.7 % / 91.1 % (low); R = 1 m 100 %. Summed bright past R + 0.02 m: max 0.33 (< 0.5). The screen check gives a bright reach minus R of 2e-15 m. |
| L1 | L | The ~0.9 s body-fire die-down was not pinned (a "burn → 0 instantly" mutation survived). | Test: burn is 1 while burning, 0.4–0.6 with flames still showing 0.45 s after the cue ends, and 0 at 0.95 s. The slot frees only when every particle is gone. |
| L2 | L | `?fx=low` halving the spawn rate was untested. | Test: in the first 0.1 s (below every cap), low has 35–65 % of full's flames. |
| L3 | L | GPU fill. | Smoke cap 44 → 26, smoke end size ≤ 2.2 m (was ≤ 3.5), smoke hidden under alpha 0.04 (car and body), `LOW_FX_SIZE` = 1 (low mode no longer enlarges particles; test). Free flames 130 → 110 (with the edge slots: 110 + 42 + 26 + 24 = 202 per fire at R = 2 m). Not done: trimming the flame frames' transparent corners — they're square textures and Phaser Images draw quads, so it would need a mesh or other geometry. |
| L4 | L | `docs/art/4-12/fire-lab.html` loads `img/objects.png`, which wasn't in git. | Copied to `docs/art/4-12/img/objects.png` (the lab's "Today (4.11)" panel reference). |

**New tests, mutation-proven once:** N1 low halves the edge slots (2 fail), N2 edge flames placed by their 50 % core (2), N3 edge flames 5 cm out (2), N4 free flames not inset (survived at first → the free-flame test now asserts their cores end ≥ 6 cm inside R → killed), N5 edge spacing 0.6 m (2), N6 body fire off instantly, N7 low doesn't halve rates, N8 edge flames pulled 30 cm in, N9 low enlarges particles — **all 9 killed**. The outside rule test is kept: free flames ≤ R − 0.06 m, and an exact texel test for edge flames (every ≥ 50 % texel ≤ R + 0.02 m for every shape and flicker at R = 1, 2, 3.5).

**FPS, `?stress=150` at stage 3 next to the fires, headless Chromium (SwiftShader) 844 × 390 DPR 2, interleaved dev builds** (1-min load before → after):

| Run | 4.11 sprite fire | After fixes (full) | After fixes (`?fx=low`) |
| --- | --- | --- | --- |
| 1 | 6.9 / 6.5 / 6.3 (5.3 → 7.0) | 6.1 / 5.4 / 5.0 (7.0 → 8.1) | 6.3 / 5.2 / 6.7 (8.1 → 8.7) |
| 2 | 11.3 / 7.1 / 6.5 (8.7 → 7.9) | 12.3 / 12.0 / 11.5 (7.9 → 7.4) | 13.1 / 12.4 / 7.6 (7.4 → 6.0) |
| 3 | 8.5 / 6.2 / 5.6 (8.2 → 8.6) | 6.4 / 5.1 / 6.2 (8.6 → 9.2) | 11.3 / 9.9 / 8.6 (9.2 → 8.2) |

The box stayed at load 5–9, so the numbers are noisy. The fixed full fire is about level with the 4.11 baseline. `?fx=low` is ≥ baseline in two of three runs. Which cars burn is random per run (some runs had one fire on screen). Phones are still the real check.

Screenshots re-taken: `docs/art/4-12/ingame/burning-car.png` and `survivor-burning.png` (the edge ring is a continuous band of flames now).

**Gate** (`--testTimeout=30000`): typecheck, lint, test (215 files passed, 1 skipped; 1,610 tests passed, 3 skipped), build green; load 4.66 before, 8.69 after.

## Change Log

- 2026-11-23: Story written (gds-create-story, non-interactive, designer decisions recorded).
- 2026-11-23: Built (gds-dev-story): fire-lab D particle fire + charred car, burning-survivor particles, B6 and S2 in code, Meshy objects atlas/loader/fallback/tools removed, `?fx=low`, culling; tests + 16 mutations; browser screenshots; FPS before/after with load. Status review.
- 2026-11-23: Review fixes: fixed edge-flame slots so a body touching R stands in visible flame (M1); body die-down and low spawn-rate tests (L1, L2); smoke cap/size/cull and no enlarged low particles (L3); fire-lab reference image added (L4); 9 mutations; FPS and two screenshots re-taken. Status review.
