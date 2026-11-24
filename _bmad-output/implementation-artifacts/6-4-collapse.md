# Story 6.4: Collapse

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

## Story

As a player,
I want the power to die, fog to roll in, and the last two waves to be fought in the dark,
so that the run hits its tension peak.

> **EPIC 6 BRIEF** (`docs/epic-6-brief.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
@@BRIEF@@
> ```
>
> Most relevant here: 2 (power out and the stage-5 blackout are derived from the synced stage / wave / phase through 6.3's `refreshBlackout`; the fog rule is one shared function used by the client and by aim assist), 3/4 (fairness rules, "Beat the rule"), 8 (the Collapse style comes from the `decay` stream), 10 (fog radii and darkness levels in `decay.json`), 12 (fog must not add a full-screen pass when the darkness layer is already drawn), 14 (late join / hidden tab at the wave-9 build start), 18 (decay-stage cheat + `DEV_DECAY_STAGES=5`, 6.3's force-blackout cheat), 20 (fog and ash textures registered), **24 (darkness and fog vision can't be turned off; above-the-darkness list; colour rule)**, 25 (fog + blackout + 150 zombies FPS), **26 (fog hides zombies only on the local screen, never in the sim; aim assist never locks a target your screen hides)**.

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "The power dies between waves, never mid-fight."** Stage 5 is applied only at the build start before wave 9 (`decay.json › stageByWave[8] = 5`). From then on streetlights, shop glow, neon, the gas canopy light and the running car's headlights are off on every phone ("Collapse" banner; the existing `decay.stage_changed`).
- **F2 "Waves 9 and 10 are fought in the dark, the plan is not."** Waves 9 and 10 are blackout waves: unlit ground keeps **10 %** of its light in wave 9 and **5 %** in wave 10 (`decay.json › blackout.lightPctByWave`, the look pick "20 % → 10 % → 5 %"). Build phases at stage 5 are **half as dark** as the wave that follows (`halfDarkInBuild: true`, `halfDarkK 0.5`). The darkness is the same on every phone (server truth, 6.3).
- **F3 "Anything within 9 m of you is always shown."** In a wave at stage 5 a zombie whose centre is ≤ **9 m** from your survivor is always drawn; between 9 and 10 m it fades out; beyond **10 m** it is hidden on your screen, **unless** it is inside a standing survivor's flashlight beam (D2), which shows it out to the beam's full length (8 m × 60°, Tactical 12 m × 80°: `flashlightOf`, `inFlashlightCone`). In a build phase at stage 5 the same rule uses 13 → 14 m (D1).
- **F4 "Fog never changes the fight, only what you see."** Hidden zombies still move, bite, take bullets and count; turrets, bots and the server don't use the fog. The only gameplay effect: **touch aim assist never snaps to a zombie your fog hides** (shared rule, so the server and your phone agree: brief 26).
- **F5 "Fog and darkness can't be switched off."** No setting, URL option or quality level turns off the darkness or the fog's hiding rule (FR87). `?fx=low` only simplifies how the fog looks (D8).
- **F6 "The big things always show."** Fog never hides teammates (with rings and edge arrows), the Behemoth (body, outline, eyes: 6.5), boss telegraphs, event markers, the crate, the survivor and the safe point, pings, buildings, fires, puddles and gas clouds. It hides only zombies (incl. their eyes) and Spitter spit in flight (D3).

### Behaviour

1. **Power out (FR63).** `decay.json › collapse: { "powerOutFromStage": 5, "fog": { "fromStage": 5, "waveClearM": 9, "waveRadiusM": 10, "buildClearM": 13, "buildRadiusM": 14 } }`. Shared pure `decay/collapse.ts › isPowerOut(world)` = `world.decay.stage ≥ powerOutFromStage`. Client: `dressing.ts` gains `powerOff(d)` (lamps, spill, shop light, neon, canopy, running car removed: the look lab's `power: "off"` dressing in `docs/art/epic-6/src/cityEntry.ts › dressingFor`), used by the bake when `isPowerOut`; `NIGHT_BY_STAGE[4]` keeps ambient/rain/roof values (darkness itself comes from 6.3's layer). Floodlights (5.10) and fires stay lit (they are in `world.lights`).
2. **Blackout waves 9–10 (FR63, F2).** Data only, in 6.3's block: `decay.json › blackout.lightPctByWave` gets wave 9 → 10 and wave 10 → 5; `blackout.halfDarkInBuild` → `true`. `refreshBlackout(world)` (6.3, the ONLY writer of `world.lights.blackoutPct` / `halfDark`, called at `startBuild`/`startWave`) then gives `blackoutPct 10` in wave 9, `5` in wave 10, and `halfDark` in the build phases before them. If 6.3's `refreshBlackout` does not yet apply `halfDarkInBuild` to "the build phase whose next wave is a blackout wave", this story adds that case there (with a test) — never a second writer. Endless waves (6.12) add their own entries/rule.
3. **Fog rule (shared, pure).** `decay/collapse.ts`:
   - `fogRadiiOf(world, out)` → `{ clearM, radiusM }` for the current phase (wave: 9/10 m; build: 13/14 m) or `radiusM = Infinity` when `stage < fog.fromStage` (no fog). Vote/extract/dawn phases (6.11) report no fog.
   - `fogVisibility(world, viewerX, viewerY, x, y, beams)` → 0…1: 1 within `clearM`, linear to 0 at `radiusM`, 0 beyond; 1 if `(x, y)` is inside any beam in `beams` (each `{ x, y, facingX, facingY, cone }` from `flashlightOf(balance, gearMask)`; `inFlashlightCone`). No allocation (beams in a caller-owned scratch array).
   - Beams for the screen (D2): every **standing** survivor's beam (teammates at their drawn, interpolated position and heading). Beams for aim assist (F4): the shooter's own beam only (deterministic on server and client).
4. **Aim assist (F4).** `combat/aimAssist.ts › assistAim` skips a candidate whose `fogVisibility` from the shooter (own beam only) is 0. Server, solo and the Predictor use the same function, so a hidden zombie is never assisted on any copy. Weapons with range ≤ 9 m (most) are unaffected; Hunting Rifle (17 m), Assault Rifle (12 m) and the 11 m weapon are.
5. **Client hiding.** `render/ZombieView.ts › update`: per zombie, alpha × `fogVisibility` from the camera's survivor (yours; when you are out, the teammate the camera spectates: `spectateTarget`, D10). Alpha 0 → `setVisible(false)` (no draw). The eye glints above the darkness (6.3 `ABOVE_DARK.eyes`, ≤ 14 m) use the same visibility (brief 24: "eyes within 14 m or the fog edge"). Spitter spit in flight (`render/ProjectileView.ts` / the spit view) hidden the same way. Per frame: one distance + at most 4 cone tests per zombie, no allocation.
6. **Fog look (D7, D8).** CO1 **dead grid** always at stage 5: dead lamp heads, black shop windows, a fallen streetlight across the north-west crosswalk (visual prop in `stage5_props`, no collision), fire as the only warm light, the apartments' caved south-east roof corner and two flat debris spills (visual only, D6). Plus **one weather style per run** from the `decay` stream (variant group `collapse_style`, `pick 1`, stage 5, `look` objects from 6.2: `collapse_haze` CO1 haze, `collapse_fog_bank` CO2, `collapse_ash` CO3, `collapse_flood` CO4); endless rotates one step per wave (`collapseStyleAt(world)`: wave ≤ 10 the run's pick, wave ≥ 11 `(pick + wave − 10) mod 4`).
   - The fog ring: transparent inside `clearM`, the style's colour fading in to `radiusM`, opaque beyond (haze `30,35,45`, bank `44,50,60` + two drifting noise layers, ash `40,33,28`, flood `70,78,90`; values from `docs/art/epic-6/src/main2.js › fogLayer`). **When 6.3's darkness texture is drawn this frame, the fog is painted into that same half-resolution texture** (no second full-screen pass); otherwise it is drawn as geometry covering only the area beyond `clearM` (a ring mesh / edge quads, like the vignette's bands), never a full-screen alpha quad (4.9 review: −40 % FPS).
   - CO3 ash: the rain pool draws ash flakes (slower, drifting, grey) instead of rain; an orange sky glow along one map edge (baked). CO4 flood: dark glossy puddles in the gutters (baked at stage 5) with baked fire reflections; heavy rain. Flood puddles are visual only (no slow, D12).
   - `?fx=low` (D8): fog bank → plain haze gradient; ash flakes halved; puddles without reflections. The hiding rule is identical (test).
   - Fog draws below the darkness (`DARKNESS_DEPTH` 11.7) and below every `aboveDarkness` slot, above zombies and the city.
7. **Ambience (D9).** `audio/ambience.ts`: loop `collapse` (near silence: low wind, rain — no rain bed with CO3 ash — and a distant growl every 6–14 s), `ambienceLoopForStage(5) = "collapse"`.
8. **Shared helpers for later stories:** `isPowerOut` (6.10's power failure doesn't need it; 6.11 dawn turns the sky, not the power), `fogRadiiOf` (6.11 reports no fog during the vote/dawn; 6.12 endless keeps stage-5 fog every wave), `collapseStyleAt` (6.12).
9. **Tests:** power-out dressing at stage 5 only; `refreshBlackout` gives 10 / 5 % in waves 9 / 10 and half dark in their build phases (and nothing at stages 1–4 without an event); `fogVisibility` table (8.9 m → 1, 9.5 m → 0.5, 10.1 m → 0, 11 m in a Tactical beam → 1, 11 m in a teammate's beam → 1 on screen, 13 m in an 8 m beam → 0, build 13.5 m → 0.5); aim assist skips a 12 m zombie at stage 5 without a beam and assists it inside the shooter's Tactical beam (server = Predictor); fog never changes any sim number (a 10-wave run digest with and without the client is unaffected — the sim never calls `fogVisibility` outside aim assist); `?fx=low` same visibility; `collapseStyleAt` rotation; ambience stage 5 → collapse.

## Tasks / Subtasks

- [ ] **T0 Art (from the picks; no new pick).** `docs/epic-6-decisions.md` › section 2 Collapse: **all four**: CO1's dead grid always; the fog/weather style CO1 haze / CO2 fog bank / CO3 ash / CO4 flood one per run from the `decay` stream, rotating in endless. Port `buildFogTex`, `deadLampHead`, `fallenLamp`, `collapseExtra`, `fogLayer`, `ashFall`, `floodPuddles` from `docs/art/epic-6/src/main2.js` (and `dressingFor(power: "off")` from `cityEntry.ts`) into game code: `apps/client/src/render/city/collapseArt.ts` (bake painters) and `apps/client/src/render/FogView.ts` (the runtime ring). The fog-bank noise and the ash flake are textures made through `addGeneratedTexture` (FX atlas frames or their own registered key) with a redraw test (Story 4.13). Screenshots of the four styles at 1240 and 390 px (like `docs/art/epic-6/ingame/co-*.png`) for the designer's review.
- [ ] **T1 Balance + shared rule** (AC 1–3, 8)
  - [ ] `decay.json › collapse` + `balanceSchema.ts` (strict; `clearM < radiusM`; `fromStage` 1–5); `blackout.lightPctByWave` 9 → 10, 10 → 5; `blackout.halfDarkInBuild: true` (6.3's block).
  - [ ] `decay/collapse.ts` (new, exported from `index.ts`): `isPowerOut`, `fogRadiiOf`, `fogVisibility`, `collapseStyleAt`.
  - [ ] `refreshBlackout` (6.3's `decay/lightState.ts`): the "build before a blackout wave → `halfDark`" case if 6.3 didn't ship it (one writer).
  - [ ] Tests `decay/collapse.test.ts` (new): AC 9's tables; `run/runStateMachine` integration: a run forced through waves 8 → 9 → 10 (`decayStageByWave` override or 6.1's 10 waves) shows `blackoutPct` 0 → (build 9: halfDark) → 10 → (build 10: halfDark) → 5.
- [ ] **T2 Map data** (AC 6)
  - [ ] `tools/maps/buildDowntown.ts`: the `collapse_style` group (4 `look` objects, stage 5) appended after 6.2's objects; `stage5_props`: the fallen streetlight, two debris spills, the stage-4 loose debris repeated (swap model: stage 5 shows only `stage5_*`); regenerate the three map files. Variant bits: 15 + 4 = 19 ≤ 32.
  - [ ] Tests: `downtown.test.ts` (+ 4 collapse styles, one picked per run; old seeds keep bits 0–8 and 6.2's bits), `legalDecayMasks(…, { gameplayOnly })` count unchanged (looks excluded).
- [ ] **T3 Aim assist** (AC 4; F4)
  - [ ] `combat/aimAssist.ts`: fog filter (shooter's own beam; `fogRadiiOf` once per call, not per candidate).
  - [ ] Tests `aimAssist.test.ts` (+ stage 5 hidden zombie not assisted; inside own Tactical beam assisted; stage 4 unchanged), `net/prediction.test.ts` or the firing replay (+ server and Predictor give the same assisted aim at stage 5).
- [ ] **T4 Client: power out, hiding, fog look** (AC 1, 5, 6)
  - [ ] `dressing.ts › powerOff`, `drawCity.ts` (lightmap/glow without lamps, spill, neon, canopy, headlights at stage 5; dead lamp heads; fallen lamp; Collapse bake painters; CO4 puddles, CO3 sky glow); `stageFilter.ts › staticKey` includes the collapse style (endless rotation rebakes once per build start).
  - [ ] `ZombieView.ts`: fog alpha; eye glints (6.3's `ABOVE_DARK.eyes` objects) follow it; spit view hidden beyond the fog.
  - [ ] `FogView.ts` (new): reads `fogRadiiOf` + `collapseStyleAt` each frame; paints into 6.3's darkness texture when it is active (a hook in 6.3's darkness view: `paintFog(ctx, …)`), else ring geometry beyond `clearM`; ash flakes swap the rain frame in `CityView`'s rain pool; `?fx=low` path.
  - [ ] `GameScene.ts`: create/update `FogView`; the viewer is the camera's survivor (`spectateTarget` when out).
  - [ ] Tests (pure): fog alpha per zombie for the viewer/spectator; `powerOff` keeps floodlights and fires; staticKey changes with the style; `?fx=low` keeps visibility.
- [ ] **T5 Ambience** (AC 7): `collapse` loop synth + `ambienceLoopForStage(5)`; ash style mutes the rain bed; `ambience.test.ts` (+ stage 5 → collapse; crossfade from ruins).
- [ ] **T6 Perf + lifecycle** (brief 12, 14, 25)
  - [ ] FPS: `?stress=150` at stage 5 in a blackout wave (decay cheat 5 + 6.3's force-blackout) with each style (haze, bank, ash, flood) and `?fx=low`; headless FPS before/after with load; add the stage-5 rows to `docs/perf/epic-6-blackout.md` (6.3 creates it). Bank and flood must not drop below haze by more than the budget; if they do, say so (the designer's fallback is CO1 haze on phones).
  - [ ] Late join / hidden tab: wake after the wave-9 build start → power off, half dark, fog on, the run's style; join mid-wave 10 → 5 % light and fog immediately (browser check).
  - [ ] Readability sheet: "a zombie fading at the fog edge", "the fallen streetlight (no cover)", CO4 puddles (no effect).
- [ ] **T7 Gates.** Mutations (e.g. fog clear radius 9 → 10 → fade test; teammates' beams ignored → beam test; aim-assist filter removed → aim test; `halfDarkInBuild` false → blackout test; power-out from stage 4 → dressing test; full-screen fog quad while darkness is on → a draw-count test in `FogView`) and which tests failed. Browser check (Playwright): solo decay cheat 5 + `?wavemix=walker,runner` in waves (fog edge, beam reveal, Tactical flashlight via `?loadout`/gear cheat), online two tabs with `DEV_DECAY_STAGES=5`, `?lag=150&jitter=20`: same darkness, same style, a zombie in a teammate's beam visible on both. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.4 D1 Fog edge:** a zombie within 9 m of you is always shown, it fades out between 9 and 10 m, beyond 10 m it is hidden (build phases: 13 → 14 m). Alternative: a hard cut at 10 m (zombies pop in and out). Recommended: the 1 m fade.
2. **6.4 D2 Whose flashlight sees through the fog:** any standing survivor's beam shows the zombies in it on your screen too (teamwork: "light that way!"). Alternative: only your own beam (the epic's text), so a teammate's lit beam can show nothing on your screen. Recommended: any survivor's beam.
3. **6.4 D3 What fog hides:** only zombies (and their eyes) and Spitter spit in flight. Never teammates, the Behemoth, boss warnings, event markers, crates, the survivor NPC, pings, buildings, fires, puddles or gas. Alternative: also hide spit puddles and gas clouds. Recommended: zombies + spit only.
4. **6.4 D4 Aim assist in fog:** touch aim assist never snaps to a zombie the fog hides from you (only the rifles reach past 9 m). Alternative: keep assisting (you'd shoot at things you can't see). Recommended: no assist into the fog.
5. **6.4 D5 How dark:** wave 9 keeps 10 % light, wave 10 keeps 5 % (pitch black but for your lights); build phases at stage 5 are half as dark. (The look pick "20 → 10 → 5 %"; the epic said 10 % for all blackouts.) Recommended: 10 % / 5 %, half in builds.
6. **6.4 D6 No new cover at stage 5:** the apartments' collapsed roof corner and the extra debris are flat, visual only. Alternative: 2 more hard-cover piles in the north street. Recommended: visual only (stage 4 already squeezed the map).
7. **6.4 D7 Weather style:** CO1's dead grid always, plus one of haze (CO1), rolling fog bank (CO2), ash fall (CO3) or flooded street (CO4) per run at random; in endless the style changes every wave in that order. Recommended: yes.
8. **6.4 D8 Low quality (`?fx=low`):** the fog bank becomes plain haze, half the ash, puddles without reflections; what you can see is exactly the same. Recommended: yes.
9. **6.4 D9 Sound:** near silence — low wind, rain (no rain with ash), a distant growl every 6–14 s. Recommended: yes.
10. **6.4 D10 When you are out (spectating):** the fog centres on the teammate you are watching. Recommended: yes.
11. **6.4 D11 Flood puddles:** visual only (no slowing, no splash damage). Recommended: visual only.

### Decisions (developer guidance)

- **Power out is derived, not synced.** `isPowerOut` reads the synced stage; the blackout values come from 6.3's synced `blackoutPct`/`halfDark` (one writer: `refreshBlackout`). This story only adds data and, if missing, one case inside `refreshBlackout`.
- **Fog is a view rule with exactly one sim consumer (aim assist).** Put the rule in shared code so both agree; aim assist uses the shooter's own beam only (teammates' headings differ between server and client by interpolation; their beams are a screen-only reveal).
- **One full-screen pass at most.** In blackout waves the fog rides in 6.3's darkness texture. Outside blackout (endless even waves, 6.12) draw only beyond `clearM` (on a 24 × 13.5 m landscape view that is just the left/right ends).
- **Styles are `look` variants** (6.2's no-op action) on the synced `decayVariants`: no schema change; `collapseStyleAt` handles endless rotation from the synced wave number.
- **No new solids at stage 5** (D6): `applyDecayStage` at stage 5 changes only what stage 4 already placed (plus the expired fires); the enclosure tests stay at 135 gameplay masks.

### Current state (read before changing)

- `packages/shared/src/config/balance/decay.json`: `stageByWave` ends `…, 4, 4, 5, 5` (waves 9–10 already stage 5), `stageNames[4] = "Collapse"`. 6.3 adds the `blackout` block (all `lightPctByWave` 0, `halfDarkInBuild` false).
- `packages/shared/src/decay/lightState.ts`: today `world.lights` = derived list of floodlights (5.10 `light.radiusM`, `blackoutRadiusM` = Epic 6 D5's 6 m) and burning fires; `lightsOf(world)`. 6.3 adds `blackoutPct`, `halfDark`, `powerFailure`, `forcedPct`, `isBlackout`, `darknessAlpha`, `lightRadiusOf`, `refreshBlackout`, `setForcedBlackout`.
- `packages/shared/src/player/flashlight.ts` (6.3): `flashlightOf(balance, gearMask)`, `inFlashlightCone(px, py, facingX, facingY, cone, x, y)`; `player.json › flashlight { coneDeg 60, rangeM 8 }`, Tactical 80°/12 m (`gear.json › tactical_flashlight`, `inShop` false until 6.3).
- `packages/shared/src/combat/aimAssist.ts › assistAim`: candidates within `rangeM` + max radius from `queryRadius` (world grid or the client's view grid), within `controls.aimAssistDeg` 8°, only when the raw aim misses. Weapon ranges in `weapons.json`: 1.5 – 17 m (three above 10 m).
- `packages/shared/src/player/player.ts`: `facingX`/`facingY`; on the wire `heading` (`quantizeHeading`, `apps/server/src/rooms/schema/syncState.ts`).
- Client: `render/ZombieView.ts › update(world, alpha)` (per-zombie sprites), `render/city/CityView.ts` (bake per `staticKey`; rain pool `RAIN_POOL` 128 using `nightAt(stage).rain`; vignette as 4 edge bands, not a full-screen quad, with the 4.9 review's −40 % FPS note), `render/city/drawCity.ts › drawLightmap`/`drawGlow` (lamps, spill, neon, canopy, running car from the dressing), `render/city/palette.ts › NIGHT_BY_STAGE[4]` "before dawn" (lampA 0.58, spillK 0.45, rain 1), `render/city/dressing.ts`, `scenes/GameScene.ts` (`spectateTarget` for out players, ~l. 1448; `decay.stage_changed` banner, ~l. 1390), `debug/urlOptions.ts › lowFx` (`?fx=low`).
- Look lab: `docs/art/epic-6/src/cityEntry.ts › dressingFor(power)` ("off": no lamps, shops, neon, canopy, headlights), `main2.js › fogLayer` (inner = R − 1.6 m in the lab; this story uses a 1 m fade from 9 m, D1).
- `apps/client/src/audio/ambience.ts`: `evening`, `panic` (+ 6.2's `ruins`).

### Must be preserved

Stages 1–4 light and look; floodlights and fires lit at stage 5; 6.3's darkness (one writer, synced); the sim's determinism (fog never feeds anything but aim assist); aim assist at stages 1–4 bit-for-bit; teammate rings/arrows; Story 4.13 redraws; `?fx=low` behaviour elsewhere.

### Copies touched (brief 2)

World: none new (fog and power out derived; `blackoutPct`/`halfDark` are 6.3's). Schema / `syncState` / stateView / fakeRoom / devThrottle: **none** beyond 6.3's (`RunState.blackoutPct`, `RunState.halfDark`). Mirror: applies the stage (already) and 6.3's two fields. Predictor: aim assist runs there with the same `fogVisibility` (stage from the mirror, facing and gear mask are the local player's). `snapshotWorld`: unchanged (fog is derived; aim-assisted shots already end up in the projectile/digest state, so replays still prove server = solo).

### Beat the rule (for the reviewer; brief 4)

1. Stand 9.9 m from a Runner and wiggle: does it flicker in and out? (It fades; never pops.)
2. Buy the Tactical flashlight and sweep it: do zombies at 11–12 m show only inside the cone, the same on a teammate's phone when you point at them?
3. Hunting Rifle on touch at stage 5: does aim assist ever turn toward a zombie you can't see? Mouse/desktop: unchanged (no assist).
4. Look for a quality setting, URL flag or the in-run menu that removes the fog or the darkness.
5. Join late into wave 10, or wake a tab that slept across the wave-9 build start: same darkness %, same style, fog on?
6. Go out (die) and spectate: whose fog? Does it follow the teammate?
7. Use a floodlight or a fire: does fog lift there? (No: only beams; check it's the rule, and that the fire still glows through the fog.)
8. Spit from a hidden Spitter at 11 m: do you see the glob before it lands within 9 m? (Hidden until it enters the visible ring.) Is that fair? Report.
9. CO4 puddles: any slow or damage? (None.)

### Bandwidth (brief 11)

0 B/s added (stage, wave, phase and 6.3's two fields are already on the wire; styles ride on `decayVariants`).

### Phone FPS / Perf (brief 12, 16, 25)

Server: aim assist adds one `fogRadiiOf` per assisted shot and one distance (+ ≤ 1 cone) per candidate: negligible; measure with `tickCost` at stage 5 (`PERF_ASSERT=1`, load). Client: ≤ 150 distance + ≤ 600 cone tests per frame (4 beams), fog painted into the darkness texture (0 extra full-screen passes in blackout waves); outside blackout only the ring beyond 9 m. CO2's noise is two pattern fills inside the half-res darkness texture; CO3 reuses the rain pool; CO4 is baked. Record `?stress=150` FPS per style with blackout on in `docs/perf/epic-6-blackout.md`; the latest baseline in `docs/perf/` is the floor; say plainly that the Mi 11i itself was not measured.

### Art

From `docs/epic-6-decisions.md` § 2 Collapse (designer, 2026-11-24): all four, CO1's dead grid always, one fog/weather style per run (decay stream), rotating in endless; § 3 Blackout: 20 % → 10 % → 5 % (wave 9 = 10 %, wave 10 = 5 %; build phases half). Reference code: `docs/art/epic-6/src/main2.js` (`COS`, `collapseExtra`, `fogLayer`, `buildFogTex`, `ashFall`, `floodPuddles`, `deadLampHead`, `fallenLamp`), `cityEntry.ts` (`power: "off"`), screenshots `docs/art/epic-6/ingame/co-1240.png` / `co-390.png`. Colour rule (brief 24): fog stays cold grey-blue (ash brown-grey); no red, no amber. All game code; every texture through `addGeneratedTexture` or the registered city bake.

### Dependencies

- **6.3 Blackout lighting (hard):** `world.lights.blackoutPct`/`halfDark`, `refreshBlackout`, the darkness texture and its view (fog paints into it), `ABOVE_DARK.eyes`, `player/flashlight.ts`.
- **6.2 Ruins (hard, files):** the `look` decay action, the map generator's stage-4 objects (append after them), `palette.ts`/`drawCity.ts`/`ambience.ts` changes.
- **6.1** for a natural 10-wave run (until then: the decay cheat, `DEV_DECAY_STAGES=5`, `decayStageByWave` override).
- Later readers: 6.5 (Behemoth never hidden by fog: it must not call `fogVisibility` for the boss), 6.8–6.10 (markers via `aboveDarkness`, not fogged), 6.11 (no fog during vote/dawn: `fogRadiiOf` returns Infinity in those phases — 6.11 adds its phase to that check), 6.12 (fog every endless wave; even waves without blackout use the ring path).

### Notes for the merge (brief 19)

- `decay.json`: `collapse` is new; inside 6.3's `blackout` only the wave 9/10 entries and `halfDarkInBuild` change (6.12 appends endless rules).
- `decay/lightState.ts` (6.3's file): at most one added case in `refreshBlackout`; no new writer.
- `combat/aimAssist.ts`: one filter line + a scratch; 6.5 may make the boss a candidate (then exempt it from the fog filter: F6).
- `tools/maps/buildDowntown.ts` + generated maps: after 6.2's objects; regenerate.
- `render/ZombieView.ts`: 6.3 adds eye glints, 6.5 may add the boss view: fog alpha is one multiply in the per-zombie loop.
- `render/city/CityView.ts`, `drawCity.ts`, `palette.ts`, `dressing.ts`, `stageFilter.ts`: shared with 6.2/6.3/6.11; keep changes behind `isPowerOut` / style id.
- `audio/ambience.ts`: append `collapse`.
- `scenes/GameScene.ts`: one `FogView` create/update/destroy (Phaser reuses scenes: reset in `create`).

### Suggested build round

**Round 2**, after 6.2 and 6.3 are on master. Can run alongside 6.6/6.7 (boss) and 6.8 (events framework): no shared files except `GameScene.ts` (append-only lines) and `decay.json` (different blocks). Not alongside 6.10 (both touch `refreshBlackout`) or 6.11 (both touch the phase → fog check, `CityView`).

### References

- `epics.md` › Story 6.4 (FR63, FR87); GDD › Decay table (Collapse row: "fog limits vision to 10 m"), Quality settings ("Blackout darkness is gameplay and cannot be turned off"), Audio ("Collapse = near silence, only growls and rain").
- `docs/ideas/epic-6/proposal.md` § 4 Collapse, § 5 Blackout; `docs/epic-6-decisions.md` § 2 Collapse, § 3 Blackout, colour rule.
- `game-architecture.md` › Blackout Lighting, Rendering.
- Story files 4.9 (bake, palette, vignette perf note), 4.12/4.13 (game-code art, texture registry), 5.10 (floodlight light state), 5.11 (Tactical flashlight gear), 1.6 (aim assist), 6.2, 6.3.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
