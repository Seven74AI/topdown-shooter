# Story 6.4: Collapse

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

## Story

As a player,
I want the power to die, fog to roll in, and the last two waves to be fought in the dark,
so that the run hits its tension peak.

> **EPIC 6 BRIEF** (`docs/epic-6-brief.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
> EPIC 6 BRIEF (from the Epic 4 retro's EPIC 5 BRIEF + Epic 6 specifics; reviewers: check each line)
> 1. Builders run in their own CLOUD SESSION (branch story-6-x, one container each; HANDOFF §3 Session 6 rules). Never `npm run dev` with fixed ports; assigned ports only; stop processes by PID. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current master. While building run only the touched areas' tests; ONE full gate at the end.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo (LocalSimHost), NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → fakeRoom → mirror → Predictor → devThrottle → snapshotWorld). Boss, events, vote and light state are server truth; the client only draws.
> 3. FAIRNESS RULE FIRST: each mechanic's player-visible rule is written in the story ACs before building, and each rule is a test.
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (the story's "Beat the rule" list is the start, not the end) and list every attempt and its result.
> 5. Cover: bullets stop at map cover (cars, bus, buildings, pumps, parking wall, dumpster), at every barricade tier and at Ruins rubble. Lobbed rounds (launcher, hand grenade, molotov) fly over everything except real buildings (`building: true`); rubble is NOT `building: true`. Spit, flames, blasts, acid, gas and fire zones: cars, the bus, buildings and rubble stop or shield them (clear line from the centre). Sandbags, police barriers, turrets and floor buildings (traps, mines) stop bodies only. Melee is stopped by barricades, shot-blocking map cover and rubble. Behemoth slam and throw IGNORE cover ("the drawn zone is the promise"); the gas-leak blast uses the normal blast line of sight. Server and the client's cosmetic copy agree; rewound (2.12) hits for players' shots only.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged. Boss hits resolve once, on the tick the telegraph ends.
> 7. Spatial code (rubble, breaches, the Behemoth body and charge, shoves, the survivor NPC, the helicopter pad, crate spots) gets a builder-written fuzz test: random layouts × every stage × variant × many ticks; no body inside a box, no stall, zombies and the boss reach a player, flow fields rebuild only at build start (the boss field is its own, on its own clock).
> 8. Randomness only from named seed streams (`decay` for variants/looks, `events` for event schedule/spots/weapons, `spawns`, `combat`); same seed + input log → same snapshotWorld digest, including boss and event state.
> 9. Liveness: every sim/replay/integration test asserts something really happened (all 10 waves played, the boss spawned/attacked/crashed/died, each event triggered, a vote resolved, ≥ 1 endless wave). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks (1.2 s = 24 ticks); no per-tick/per-frame allocation (pool stamps, decals, markers, particles); every number in balance JSON (`waves.json`, `decay.json`, `boss.json`, `events.json`, …), no inline literals.
> 11. Bandwidth: telegraphs, event starts/ends and effects go out as reliable events (kind + start tick + fixed zone), not per-tick state; one boss record in the room state; report added B/s; total ≤ 30 KB/s per phone (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled and capped (max live decals/particles in balance JSON). The reference low-end phone is the Xiaomi Mi 11i (designer 2026-11-24; the Honor 10 is not a test phone). Run ?stress=150 with the story's effects active; report headless FPS before/after with load; the latest recorded ?stress=150 baseline in docs/perf/ is the floor.
> 13. Readability: every new object must read at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet (`docs/playtests/milestone-1/readability-sheet.md`).
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start AND across a boss telegraph / event start / vote, on a late Game scene start and a reconnect; client shows server truth (pending until state agrees).
> 15. Balance: earnings stay as built until the Epic 5 balance pass settles them; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 10-wave sim and assert all waves ended. Solo is "allowed, not tuned" and scales × 0.4 (Behemoth HP too).
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added server p99 ≤ 2 ms total budget for Epic 6 (boss field + events + vote).
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently (votes and pings are inputs to budget for).
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix, ?seed, the decay-stage cheat, new: force blackout, start at wave N, force event X, spawn Behemoth), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master. Each story goes to master as soon as its review (and re-reviews) is clean.
> 20. Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss (`tools/checks/noUnregisteredTextures.test.ts` must stay green). That includes the darkness texture, light stamps, boss atlas, decals, markers and dawn.
>
> EPIC 6 SPECIFICS
> 21. BOSS FAIRNESS (each is a test): (a) every danger zone (slam centre, charge lane + stop point, throw landing spot) is fixed when its telegraph starts; (b) the client draws the telegraph's progress from the server's start tick, never from when the message arrived, and the fill always ends on the hit; (c) edge grace 0.25 m: a hit lands only when the player's centre is 0.25 m inside the drawn edge; (d) boss hits use the player's newest server position, no rewind; (e) telegraph lengths never shorten (enrage, endless, player count); (f) one boss attack at a time, then recovery, then the per-player-count gap; (g) a downed player is never targeted or hit again.
> 22. CAP 110 WHILE THE BEHEMOTH LIVES: at most 110 zombies alive while it is alive (D6), back to 150 the tick it dies; the boss itself does not count; enrage Crawlers respect the cap; the stampede's +30 over-cap allowance is counted against the cap that applies.
> 23. EVENT FAIRNESS: every event announces itself (banner + sound + map marker above the darkness) before it can hurt anyone; the schedule comes only from the `events` stream (2 different events, 2 different waves of 3–8, never 5, never back-to-back); a lever (shoot the armed car, shoot the gas tank after 3 s) works the same for every player and credits whoever pulled it; only standing players take the crate or lead the survivor; the gas blast hurts every player in range in full (as Bloaters) and is shielded by the normal blast line of sight.
> 24. BLACKOUT READABILITY: darkness and fog vision can't be turned off (FR87); quality settings only change their look. Always above the darkness: teammates with rings, zombie eyes within 14 m (or the fog edge), the boss's outline and eyes, every boss telegraph, event markers, the crate, the survivor and the safe point, pings. Colour rule: red = boss danger only, amber = an event you can use, yellow-green = gas, white = pick-ups and people. No hot beam core, no lens flare; rain sparkles inside beams. Check at 568 × 320 and 800 × 360.
> 25. ENDLESS PERFORMANCE: nothing grows without a cap over 20+ endless waves (alive 150 / 110, wave size 600, Brutes ≤ 6 alive, decals, craters, markers, event records, kill logs); a 20-wave endless sim records server tick p99 and memory and asserts they stay flat; FPS recorded with blackout + fog + Behemoth + 150 zombies (`docs/perf/epic-6-blackout.md`).
> 26. LIGHT IS SERVER TRUTH: the light state (stage, blackout flag, power out, flicker seeds, build-phase half darkness) is part of the world and replays; a client that joins or wakes mid-wave draws the same darkness as everyone else; fog hides zombies only on the local screen, never in the sim (aim assist and turrets keep their own rules; aim assist never locks a target your screen hides).
> 27. DO NOT TOUCH EPIC 5 WORK IN PROGRESS: 5.13 card shop and 5.20–5.25 building UX are being built in other sessions (shop, build bar, carry/drag UI); Epic 6 changes there go through their balance flags (`inShop`) or a "Notes for the merge" line, not edits to their UI.
> 28. ONE RUN FLOW: the run phase machine (lobby → build → wave → … → vote → extract/endless → results) has one owner per change (6.1 removes the 6-wave ending, 6.11 adds the vote, 6.12 adds endless); every phase change is a tested transition, and Results always show (no stuck run).
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
   - CO3 ash: the rain pool draws ash flakes (slower, drifting, grey) instead of rain; an orange sky glow along one map edge (baked). CO4 flood: dark glossy puddles in the gutters (baked at stage 5) with baked fire reflections; heavy rain. Flood puddles are visual only (no slow, D11).
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
- **One full-screen pass at most.** In blackout waves the fog rides in 6.3's darkness texture. Outside a drawn darkness (stage-5 waves, build phases and endless waves all draw it, 6.12 D3; so in practice only a dev cheat with the blackout forced off) draw only beyond `clearM` (on a 24 × 13.5 m landscape view that is just the left/right ends).
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
- Later readers: 6.5 (Behemoth never hidden by fog: it must not call `fogVisibility` for the boss), 6.8–6.10 (markers via `aboveDarkness`, not fogged), 6.11 (no fog during vote/dawn: `fogRadiiOf` returns Infinity in those phases — 6.11 adds its phase to that check), 6.12 (fog every endless wave; even waves are half dark (6.12 D3), so the fog rides in the darkness texture there too).

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

**Round 2**, after 6.2 and 6.3 are on master. Can run alongside 6.6 (boss) and 6.8 (events framework): no shared files except `GameScene.ts` (append-only lines) and `decay.json` (different blocks). Not alongside 6.10 (both touch `refreshBlackout`) or 6.11 (both touch the phase → fog check, `CityView`).

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
