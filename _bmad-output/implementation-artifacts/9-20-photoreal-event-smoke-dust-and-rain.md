# Story 9.20: Photoreal event smoke, dust and rain

Status: ready-for-dev

<!-- Written 2026-11-28 with gds-create-story from the real code and the approved group-5 cards EV-R (matter.ts, with
     EV-A), RD-G, PD-G, RN-G (matter-g.ts, matter-g-tex.ts; RD-A's ash in matter.ts / matter-tex.ts). Correct-course:
     sprint-change-proposal-2026-11-28-photoreal-fx.md. After 9.6. -->

## Story

As a player,
I want event smoke, the ruins' dust, place dust and rain in the approved look,
so that the street feels alive without ever hiding a hazard or looking like one.

## Designer decisions — the source of truth

- **EV-R**: "EVA but with arrow for stampede, take inspiration of the boss warnings for the arrow". "Reco": **the
  stampede arrow replaces today's drifting chevrons, about 6 m long in the game**.
- **RD-G**; "Reco": **the falling-debris sound plays on landing, not on spawn**.
- **PD-G**, **RN-G**; "Reco": **rain drawn under acid, gas and spit**.
- **Proposal Q7 (open, recommendation followed):** rain at street level, under every body and effect (stills for the
  designer's look in this story).

## Acceptance Criteria

Textures from the `ambient` atlas (9.6), pooled sprites, deterministic (the views' LCGs), no allocation per frame, today's
look as the per-run fallback, **no sim number changed** (events.json, decay.json ruins, placeFeel timings, rain levels).

1. **EV-A event plumes** (kept whole in EV-R). Same emitters, rates and colours (gas leak vapour 22/s, life 2.2 s, the
   yellow-green; supply signal smoke 16/s, life 3 s, the approved mid-green `EVENT_SMOKE_RGB 70,190,90`; stampede dust
   24/s, life 1.6 s, warm), drawn as lit billows (bright toward the light, shadowed far side): the gas jet leaves fast and
   hangs, the smoke rises off the flare then bends with the wind, the dust kicks grit (≤ 24 chips). **The flare** is a
   dark stick with a white-hot green head and a small pool of green light (2 ADD, cropped; today a 32 × 16 domino).
   Caps unchanged (`events.json fx` 48 vapour / 48 smoke / 64 dust); **`?fx=low` halves all three** (today ignored by
   EventPickupsView and EventView).
2. **EV-R stampede arrow.** Goal: "the stampede: in 3 s a herd comes from THIS edge and runs THIS way along an 8 m lane at
   5 m/s". In amber (an event): a **start bar** of light across the lane's full 8 m width at the edge the herd comes from
   (brightens 55 → 100 % over the warning); a **stem** along the lane's centre line, faint from the start and lit from the
   bar to a bright front that reaches the head at exactly `warningS` 3 s (the clock); an **arrowhead** faint until the
   clock reaches it, full at 3 s; at 3 s bar, stem and head flare together for 0.15 s then fade in 0.3 s (the warnings'
   "release together"). The arrow is **about 6 m long** in the game (start bar to tip), above the darkness (`"marker"`,
   like today's chevrons), drawn over the dust. **Replaces the chevron rows** (`EventView.updateStampede` :213-272:
   `maxChevrons` 12, rows of 3 drifting at 3 m/s, alpha 0.55): the chevron pool and `event_chevron_a` are no longer drawn
   (keep the frame for the fallback). Lane data from `world.map.stampedeLanes[lane]` (dir, min/max: no new data). 5 ADD
   sprites during the warning (≈ 12 m² of faint ADD), the same with low (a marker, not a particle).
3. **RD-G Ruins falls.** Goal: "the ruins are still falling apart around you, and it never hurts". Per fall (every
   0.6–1.6 s at rubble in view, `decay.json ruins`): 3 big + 5 small chips fall first with their shadows closing in
   (0–0.4 s), land, hop once, rest and fade (today's 8 grit, 1.1 s); only then a low puff rises where each big chip hit
   (3 puffs, from the landing, today's 1.8 s life), stretched along the street's one wind (`fxKit.FX_WIND`, 0.15 m/s; today
   straight down the screen), peak alpha 0.36, in the material's own grey (`RUINS_MATS[look].dust`); never round, never
   crisp, no ADD, no colour. **`debris_fall` plays on the first big chip's landing** (today on spawn: DustView.ts:120;
   pan unchanged). The collapse `burst()` (stage-4 start, `ruins_rumble`) uses the same falls at its rate. Lit puffs are
   stretched, never turned. Fixes: `fx_grit_a` white specks → lit chips with a soft edge and shadow; grit accelerates as it
   falls (today ease-out from the top). Caps `maxDustSmoke` 40 / `maxDustGrit` 60 (+ chip shadows, off with low).
4. **RD-A ash (CO3).** The ash flakes tumble (face, edge, face) and drift, each with a faint shadow (≤ 128, shadows off
   with low); today a flat grey dot (`FX_ASH` 0.07 × 0.045 in CityView's rain pool).
5. **PD-G place dust.** Goal: "thud: your building is down, exactly on this footprint, and solid". The same 8 puffs,
   0.7 m/s slowing to 0, 0.4 s (`placeFeel.ts`), but **3 per long side and 1 per short side**, leaving from under each edge
   along its outward normal (none from corners or the inside), each flat and wide along its edge and **growing** as it thins
   (today 0.12 → 0.05 m shrinking), peak alpha 0.6 in the street's grey-brown; a contact shadow under the piece that
   relaxes in 0.25 s (100 × 60 picture); 2 chips skipping out from the long sides' middles, resting by 0.35 s. No light.
   11 sprites per placement (5 with `?fx=low`: 4 puffs, the shadow, no chips); cap `maxPlaceDust` 64 (`?fx=low` halves it:
   today ignored).
6. **RN-G rain.** Goal: "it's pouring (stage 3), and every hazard, warning, enemy and ring stays as readable as without
   rain". A wet, glossy, darker street with the lamp's streak in it (RN-B's two wet patches, 192 × 112, from the decay
   stage, not per drop); drops shorter and thinner (0.3 m, alpha 0.3; today 0.45 m, 0.28), same slant 0.22 and speeds
   12–18 m/s; hits are a dark wet dot + 2–3 beads for 0.3 s of each 0.625 s cycle (today's 16 × level, 1.6 / s) — **no
   expanding rings** (today's `FX_SPLASH` ellipse). Same counts (≤ 128 drops, ≤ 16 hits), the 10.1 Rain setting
   (`RAIN_LEVEL_K` full / light / off) and blackout dimming (`rainK` 0.35) kept; **`?fx=low` halves drops and hits**
   (today only the ash).
7. **Rain under the hazards** ("Reco"; Q7 A). `RAIN_DEPTH` 11.8 (above the acid puddles 1.55, the gas 6.6, the glob
   11.5, the darkness 11.7 and every above-dark slot) moves to street level, just above the static street and under
   every hazard and body: a slot above the baked street (0) and the wet patches, and below `FIRE_RING_DEPTH` 1.5 (the car
   fire's heat, 9.17) and the acid puddles 1.55, e.g. 1.45 (say which). Wet patches at the street's level. Stills of a
   stage-3 street with acid, gas, a glob and zombies for the designer (Q7).
8. **Perf.** `?stress=150&stressstage=3&stressfx=1` (rain) and `?stress=150&stressstage=4` (Ruins falls) and a stampede
   warning within 2 FPS and +1 ms p95 of master at 1× and 4× CPU; memory added recorded (EV ≈ 160 + 46 KB, RD ≈ 85 KB,
   RN ≈ 175 KB).

## Tasks / Subtasks

- [ ] T1 `docs/art/photoreal-5/src/atlas/ambient.atlas.ts` (EV-A's 12 textures + EV-R's 4, RD-G's, RD-A's ash, PD-G's,
  RN-G's); `npm run art:fx`.
- [ ] T2 Events (AC 1, 2): EventPickupsView plumes + flare; EventView dust + arrow (replacing the chevrons); `fxLow()`.
- [ ] T3 Ruins (AC 3): DustView falls, chips, shadows, drift, sound on landing.
- [ ] T4 Place dust (AC 5): `placeFxPools.ts DustPool` by edge normals; PlaceFxView sprites (today one Graphics).
- [ ] T5 Rain and ash (AC 4, 6, 7): CityView rain block, `rainLook.ts`, depth.
- [ ] T6 Tests, gallery, readability sheet 184–191, stills `docs/art/9-20/`, perf.

## Dev Notes

### The code today (read before touching)

- **`render/EventView.ts`** (309): pins, rings, the car-alarm arc, the edge arrow (screen-space: `eventArrow.ts`, keep),
  glows, **the stampede chevrons + start-edge dust** (`updateStampede` :213-272: `alongX` for e/w, chevron rows of 3,
  gap = max(3, (len − 2)/ceil(n/3)), drift (clock × 3) % gap, rot s 0 / n π / e −π/2 / w π/2; dust 24/s at the start
  edge, alpha 0.7(1 − u), size 2.2 × (0.6 + 0.8u), seeded LCG). Everything `aboveDarkness(…, "marker")` 11.76. Pools
  `fx.maxChevrons` 12, `fx.maxDustParticles` 64 (`events.json fx`). Ignores `?fx=low`. GameScene :807 / :2390.
- **`render/eventMarkers.ts`** (313, pure): stampede branch :152-156 (`chevrons = WARNING && lane ≥ 0`): the arrow reads
  the same flag and the warning's progress (`serverTick`, `events.json stampede.warningS` 3, `laneWidthM` 8,
  `speedMps` 5).
- **`render/EventPickupsView.ts`** (295): gas leak (tank, vapour `GAS_PER_S` 22 / `GAS_LIFE_S` 2.2, dashed ring, arc),
  supply drop (flare 0.6 × 0.3 m at depth 8.39, smoke `SMOKE_PER_S` 16 / 3 s, drift (0.35, −0.3) m/s), survivor; pools
  `maxGasParticles` / `maxFlareParticles` 48; `stepPuffs` :281-292. Ignores `?fx=low`.
- **`render/city/eventArt.ts`** (594): `event_atlas` (chevron `event_chevron_a` :429-443, dust a–c :446-466, vapour,
  smoke, flare, glow): fallback.
- **`render/city/DustView.ts`** (196): DUST_DEPTH 4.34, PUFF_SMOKE 3 / PUFF_GRIT 8, SMOKE_M 0.8 × (1 + 1.4u), life 1.8 s,
  alpha 0.5·sin(π·min(1, 1.4u))·(1 − u), GRIT 0.06 m, 1.1 s, drop 2 m; `atlas_fx` frames `fx_dust_a` (48², white radial)
  and `fx_grit_a` (8², white quad); tint `RUINS_MATS[look].dust` (default 0xb8b0a0); pools 40 / 60 (halved by low via
  `opts.lowFx`: 9.6 moves it to `fxLow()`); **`playSfx("debris_fall", pan)` at :120** on the spawn; `burst()` :71;
  GameScene :874 / :2365 / :2526. No test file: add `dustFalls.test.ts` (pure part).
- **`render/PlaceFxView.ts`** (170): one Graphics, `fillCircle` per particle (DUST_COLOR 0xa89c88), depths DOTS 3.2,
  TABS 3.25, DUST 3.3; `placed()` :55; tabs and dots stay as they are. **`render/placeFxPools.ts › DustPool`** :22-98
  (8 per puff from the footprint edge, seeded spin, cap max(8, floor(max/8)·8)); **`render/placeFeel.ts`** :16-23
  (DUST_PER_PUFF 8, LIFE 0.4, SPEED 0.7, SIZE 0.12 → 0.05, ALPHA 0.7). Tests `placeFxPools.test.ts`,
  `placeFeel.test.ts`, `scenes/placement.feel.test.ts`.
- **`render/city/CityView.ts`** (509): **the rain block** :414-451 (RAIN_POOL 128, RAIN_PER_M2 0.4, ALPHA 0.28, LEN
  0.45, W 0.035, speed 12 + 6, SLANT 0.22; splashes 16 × level, rate 1.6, w 0.45, alpha 0.5; CO3 ash `setAsh` :483-489,
  0.07 × 0.045, tint 0xb8b2a8, alpha 0.55; CO4 flood × 1.3); depths STATIC 0, FIRE_RING 1.5, DYN_LIGHT 4.32, **RAIN 11.8**,
  VIGNETTE 11.9; `NIGHT_BY_STAGE` rain [0.5, 0.5, 1, 1, 1] (`palette.ts:63-70`). **9.17 edits the fire-ring block**
  (:143-144, :343-358): keep to the rain block. `render/city/rainLook.ts` (24): `rainAlphaFor`, `hazardGhostFor`,
  `weatherDropCount`. Tests `rainLook.test.ts`, `settingsEffects.test.ts`.
- **Depth map** (rain must go under): acid puddle 1.55, glob shadow 1.56, bile splat 1.58, boss decals 1.6, gas 6.6 / ring
  6.7, glob 11.5, darkness 11.7, above-dark 11.705–11.77.

### Builder decisions (B-numbers; tell the reviewer)

- **B1 Rain depth** (AC 7): the slot chosen and why; in a blackout the rain is now under the darkness (it was above it
  at × 0.35): check it still reads in a lit spot, say so.
- **B2 The arrow's 6 m**: measured from the start bar's centre to the tip; on a lane shorter than 6 m it shrinks to the
  lane length − 1 m.
- **B3 Shared dust picture**: RD-G / PD-G use new `ambient` frames; `atlas_fx › fx_dust_a` is **not** repainted (the
  Behemoth's dust uses it until 9.21 switches to BD-R's own pictures).
- **B4 Sound on landing**: one `debris_fall` per fall on its first big chip's landing (not one per chip).
- **B5 Flare smoke wind**: the signal smoke keeps today's up-right drift (0.35, −0.3) only if EV-A's card does (EV-A
  kept the emitters; EV-G's one-wind rule was not picked): check the card and say which.

### Guardrails (AGENTS.md §5)

As 9.6. No sim change. Events stay above the darkness as markers. `fxLow()`.

### Testing

- Pure: arrow geometry per lane direction (bar across the full width, stem front at exactly `warningS`, flare at 3 s);
  falls: dust only after a chip landed, sound once on landing (a fake `playSfx`); PD-G 3 / 1 per side along the normals;
  rain counts halved with low; the chosen rain depth under every hazard depth (a test listing the depths).
- `settingsEffects.test.ts`, `rainLook.test.ts`, `eventMarkers.test.ts`, `eventPickups.test.ts`, placement tests kept
  green.
- Browser: a gas leak, a supply drop, a stampede warning (each lane direction), stage 4 falls, CO3 ash, a placement, stage-3
  rain over acid / gas / a glob / zombies, a blackout; stills beside the cards.

### Notes for the merge

- **Touches:** `render/EventView.ts`, `render/EventPickupsView.ts`, `render/eventMarkers.ts` (progress for the arrow, if
  needed), `render/city/DustView.ts`, `render/PlaceFxView.ts`, `render/placeFxPools.ts`, `render/placeFeel.ts`,
  `render/city/CityView.ts` (the rain / ash block and `RAIN_DEPTH` only), `render/city/rainLook.ts`,
  `render/fx/atlas/ambient.*`, `docs/art/photoreal-5/src/atlas/ambient.atlas.ts`, tests, gallery, readability sheet,
  perf doc.
- **Overlaps:** 9.17 (CityView fire-ring block); 9.21 (boss dust: B3).
- **Net kinds:** 96–97 (none expected). **Readability sheet:** 184–191.

### References

- `docs/art/photoreal-decisions.md` (EV-R, RD-G, PD-G, RN-G, items 7, 9, 10 of "Reco"); `docs/art/photoreal-5/src/matter.ts`
  (EV-A / EV-R, RD-A ash), `matter-tex.ts`, `matter-g.ts`, `matter-g-tex.ts` (RD-G, PD-G, RN-G);
  `.claude/skills/dead-city-model/fx.md`.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
