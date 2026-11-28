# Story 9.19: Photoreal acid, Bloater burst and gas

Status: ready-for-dev

<!-- Written 2026-11-28 with gds-create-story from the real code and the approved group-5 cards AC-N, BX-G, GA-M
     (docs/art/photoreal-5/src/matter-ac-n*.ts, fire-g.ts BX-G, matter.ts GA-M, matter-g*.ts GA-G). Correct-course:
     sprint-change-proposal-2026-11-28-photoreal-fx.md. After 9.6. -->

## Story

As a player,
I want Spitter acid, the Bloater's burst and its gas cloud in the approved look,
so that I see a glob coming and exactly where not to stand, and for how long.

## Designer decisions — the source of truth

- **AC-N** (built per FX 6 after "AC are not photoreal" and "how is it possible ACR ressemble exactly the other AC?");
  "ACN is good but the circle is way to clean try to make it blend a bit more" → the wet patch thins unevenly from
  0.5–0.8 R to R, some outer plates stay dry, the charred mark fades the same way; **only the acid in the cracks ends at
  exactly R**. Picked with the recommendations ("I'll follow your reco"): **Q1** 0.24 m crack plates; **Q2** each froth bead
  on its own 0.4 s cycle; **Q3** the acid runs out to 1 m in 0.11 s; **Q4** puddles stop turning (2 lit variants) and the
  skid is baked in 8 headings (+260 KB); the glob may turn.
- **BX-G**: one front, blast reach = gas zone; both rings cut; bile matte (BX-B's glow not taken).
- **GA-M** ("just superpose the A fog to G"); "Reco": **GA-A's fog at full strength**.
- **Proposal Q5 (open, recommendation followed):** the blackout copy of the cloud is GA-G's rim at the hazard ghost
  strength (no ring).

## Acceptance Criteria

Textures from the `matter` atlas (9.6); pooled sprites; deterministic; no allocation per frame; today's look as the
per-run fallback; **no sim number changed** (spit 15 dmg at 9 m/s up to 6 m; puddle r 1 m, 3 s, 2 HP per 0.4 s per body;
Bloater blast 2.5 m, 30 to players; gas 2.5 m, 4 s, slow 30 % + 0.25 s).

1. **AC-N glob in flight.** A thick glowing lump wobbling (stretched along the flight then squashed, 0.2 s per wobble;
   4 frames 40², may turn), the brightest thing on screen, no strings; its own small green light running on the street
   under it, tighter and brighter as it comes down, landing with it (replaces the black-dot shadow, AcidView
   `SHADOW_M 0.28` at 0.35). 3 sprites in flight.
2. **AC-N splash and zone.** On `acid.splashed`: a skid (the glob's body, a ridge at the front, a thin tail back toward
   the Spitter, tongues into the nearest cracks), inside 0.45 m, baked in **8 headings** (Q4), its 0.15 s flare; the acid
   runs into the asphalt's crazed net (0.24 m plates, Q1) out to **exactly 1 m in 0.11 s** (Q3: the glob's speed; the sim
   damages the whole 1 m from the splash tick, so the outer cracks light 0.06 s late: accepted on the card); the cracks
   glow steadily from 0.11 s to 3.00 s, brightest at the crossings; a wet, darker, glossier sheet between them that
   **thins unevenly from 0.5–0.8 R to R with some dry outer plates** (the blended edge); pale froth beads at the crossings
   each swelling and bursting **on its own 0.4 s cycle** (Q2; never a puddle-wide pulse: the damage clock is per body,
   `spit.ts › acidTicks`); thin pale vapour strands off the skid and crossings leaning downwind (`fxKit.FX_WIND`), the only
   thing allowed past R. **No pool, no glowing fill, no ring, no splash drops.** Puddles do not turn (2 unturned lit
   variants; today `id × 1.3`).
3. **AC-N end.** At 3 s: the cracks go out in 0.08 s, the froth collapses, the skid is gone in 0.25 s, the vapour dies
   in 0.4 s, a charred black crazed scar fades over 0.6 s (blended like the wet sheet). Fixes today's pop (alpha
   `min(1, (3 − age) / 0.6 + 0.35)` still 0.35 at its last frame, AcidView.ts ~:99) and the turning highlight.
4. **AC-N caps.** Per puddle ≤ 14 sprites (10 with `?fx=low`); froth and vapour only on the **8 nearest puddles**
   (5 sprites on the others); no large additive quad (the zone is a normal-blend picture; the only ADD is the skid glow
   0.8 × 0.46 m and, in flight, the glob's bloom and light). New cap `fx.maxAcidFroth` 8 (puddles with froth; low 4).
5. **AC-N blackout.** The ghost above the darkness (`aboveDarkness(…, "hazard")` at `hazardGhostFor`, 0.1) is the zone
   picture (the net shows in the dark as the zone); the charred mark has no ghost. Fog hides globs (today's rule).
6. **BX-G burst.** Goal: "it popped HERE (2.5 m blast), and this 2.5 m cloud slows you for 4 s: stay out until it
   clears". A short yellow-green flash 0.1 s (the only light); the gas thrown out to R in 0.1 s (16 rim puffs) = the
   blast's reach, becoming the cloud's rolled rim (GA-M's, AC 7); 12 bile drops (round in flight, with shadows; today the
   flat splat picture flies) landing inside R as matte splats with darker rims that leave with the cloud; 3 cloth scraps
   in the Bloater's colours fluttering down. **The shock ring and the gas edge ring are cut** (BloaterView `SHOCK`,
   `GAS_EDGE`). Draw order: splats under the cloud, drops and scraps over it. Peak ≈ 46 sprites, 1 ADD; `?fx=low` 8 puffs,
   6 drops, 2 scraps (≈ 26). **The Bloater pool honours `?fx=low`** (today GameScene passes `maxBloaterParticles` as is).
   The fuse rings while swelling stay as today (not on the page).
7. **GA-M cloud.** Goal: "the exact edge of the slow zone, the body of a dense rolling cloud, and an end you can trust".
   GA-G whole: a rolling rim whose outside face is exactly 2.5 m (lit on its faces toward the key light, shadowed
   down-right), full size from the burst (fades in over 0.1 s), a thin inside; **GA-A's two fog layers at full strength**
   (alphas 0.62 / 0.38, turning +0.05 / −0.08 rad/s) drawn **under** G's front and scaled to 0.96 R / 0.9 R so no fog
   passes the edge, on G's clock (in over 0.4 s, thin over 3.6–4.0 s); the rim breaks at exactly 4.0 s and its wisps drift
   out by 4.2 s (only then may gas cross R). No ring, no glow. 6 sprites per cloud (G's 2 rims + 2 inside + A's 2 fog),
   peak 10 at the break-up (4 wisps with low); normal blend only. Cap `blasts.maxGasClouds` 24 unchanged.
8. **GA-M blackout** (Q5): the copy above the darkness is G's rim texture at the hazard ghost alpha, no ring.
9. **HUD glow** (`bloaterFx.inCloud`, GameScene :2472) and every gameplay read unchanged.
10. **Perf.** `?stress=150&wavemix=walker,spitter,bloater` with 32 puddles and 24 clouds at the caps within 2 FPS and +1 ms
    p95 of master at 1× and 4× CPU; memory added recorded (AC-N ≈ 580 KB + skid headings 260 KB; GA-M ≈ 700 KB; BX-G gas
    body 256 KB).

## Tasks / Subtasks

- [ ] T1 `docs/art/photoreal-5/src/atlas/matter.atlas.ts` (AC-N without the 2 run-out frames: −415 KB; skid × 8 headings;
  BX-G; GA-M); `npm run art:fx`.
- [ ] T2 AcidView + acidFx (AC 1–5): flight light, skid by heading, zone, froth phases, vapour, scar; caps.
- [ ] T3 BloaterView + bloaterFx (AC 6): flash, gas front = rim, drops with shadows, scraps; rings cut; `fxLow()`.
- [ ] T4 GA-M (AC 7, 8) in BloaterView.
- [ ] T5 Tests, gallery, readability sheet 178–183, stills `docs/art/9-19/`, perf.

## Dev Notes

### The code today (read before touching)

- **`render/AcidView.ts`** (113): depths PUDDLE 1.55, GLOB 11.5, GLOB_SHADOW 1.56; GLOB_M 0.45, LOB_GROW 0.7,
  LOB_LIFT_M 0.35, SHADOW_M 0.28 at 0.35; PUDDLE_FADE_IN_S 0.12 / OUT_S 0.6 (the pop bug ~:99); `atlas_fx` frames
  `fx_spit_glob_01` 48 px, `fx_acid_puddle_01/02` 128 px (`city/spitterArt.ts`), shadow = `FX_GLOW` tinted black;
  puddle size 2 × `puddleRadiusM`; rotation id × 1.3; `darkGhost` copies; `fog` hides globs.
- **`render/acidFx.ts`** (160, pure): `AcidFx(maxGlobs 24, maxPuddles 32, speed 9, puddleS 3)`; `spitter.spat`
  {spitId, x, y, toX, toY, ageS}, `acid.splashed` {puddleId, x, y, ageS}; `globProgress`; oldest replaced.
  The splash heading = spat (x, y) → (toX, toY) (keep per spit id for the skid's heading).
- **`render/BloaterView.ts`** (198): depths SPLAT 1.58, CLOUD 6.6, RING 6.7, AIR 11.6; CLOUD_ALPHA 0.42 / 0.22,
  CLOUD_SPIN 0.05 (and −0.08 on the second), PUFF_TINT 0xb9c65e, SCRAP_TINTS, FUSE_* (keep), SHOCK 0xe4f0a0, GAS_EDGE
  0xcde178 at 0.45; `atlas_fx` frames `FX_GAS_CLOUDS` (160 px), `FX_EXPLOSION_BLOATER`, `FX_BILE_SPLATS`,
  `FX_CLOTH_SCRAP`, `FX_GLOW`; pools `maxGasClouds` 24, `maxBloaterParticles` 240, `maxFuseRings` 16; ghosts.
- **`render/bloaterFx.ts`** (282, pure): BURST_DROPS 14, SCRAPS 5, PUFFS 8; FLASH 0.14 s, RING 0.1 s + fade 0.6 s,
  CLOUD fade in 0.25 / out 1 s; GRAVITY 9; `bloater.burst` {x, y, chain, ageS}; `inCloud` (HUD). **GA-M changes the
  clock** (in 0.1 / 0.4 s, thin 3.6–4.0 s, break at 4.0 s): `cloudAlpha` / `inCloud` must keep `inCloud` exactly the
  sim's 4 s (the HUD glow is a gameplay read: test).
- **`city/bloaterFxArt.ts`** (144): today's draw functions (fallback).
- Wiring GameScene.ts:895-903 (construction), :2273 / :2278 (events), :2398-2411 (updates, `hazardGhostFor`).
- Tests: `acidFx.test.ts`, `bloaterFx.test.ts`, `fog/fogViews.test.ts`, `darkness/darknessView.test.ts`,
  `NetSimHost.acid.test.ts`, `NetSimHost.bloater.test.ts`.
- Rain is drawn above the puddles today (CityView RAIN_DEPTH 11.8); 9.20 moves it under: nothing to do here.

### Builder decisions (B-numbers; tell the reviewer)

- **B1 Skid headings**: 8 baked headings (45° apart), the nearest picked from the spit's direction.
- **B2 Froth phases**: each bead's phase from a seeded hash of (puddle id, bead index).
- **B3 Two clocks for the cloud**: the look's clock (GA-M) vs the sim's 4 s for `inCloud`; tested apart.
- **B4 New cap** `fx.maxAcidFroth` 8 (+ schema; `balance.version` changes: re-pin goldens).

### Guardrails (AGENTS.md §5)

As 9.6. No sim change. Fog / blackout rules kept. `fxLow()` for every halving.

### Testing

- Pure: AC-N net cut at exactly R (no crack pixel past R; the wet sheet's alpha at R ≤ the card's), froth phases
  distinct, light steady 0.11–3.00 s, off by 3.08 s; skid heading pick; BX-G rim at R at 0.1 s, nothing past R while live;
  GA-M fog ≤ 0.96 R, `inCloud` true for exactly the sim's 4 s; `?fx=low` counts.
- Browser: spitters and bloaters at stage 3 and in a blackout; stills of glob / splash / zone / end, burst / cloud /
  break-up beside the cards.

### Notes for the merge

- **Touches:** `render/AcidView.ts`, `render/acidFx.ts`, `render/BloaterView.ts`, `render/bloaterFx.ts`,
  `render/fx/atlas/matter.*`, `docs/art/photoreal-5/src/atlas/matter.atlas.ts`, `controls.json` + schema (keep-both),
  `scenes/GameScene.ts` (low cap, one line), tests, gallery, readability sheet, perf doc.
- **Overlaps:** none with other stories' view files (9.20 owns CityView's rain; 9.17 owns explosions; the Bloater's
  shake / sound in GameScene untouched).
- **Net kinds:** 94–95 (none expected). **Readability sheet:** 178–183.

### References

- `docs/art/photoreal-decisions.md` (AC-N, AC-N blend, Q1–Q4, GA-M, BX-G); `docs/art/photoreal-5/src/matter-ac-n.ts`,
  `matter-ac-n-tex.ts`, `matter.ts` (GA-M, with GA-A), `matter-g.ts` / `matter-g-tex.ts` (GA-G), `matter-tex.ts`,
  `fire-g.ts` (BX-G); `.claude/skills/dead-city-model/fx.md` FX 5–6.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
