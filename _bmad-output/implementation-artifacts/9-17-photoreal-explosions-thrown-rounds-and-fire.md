# Story 9.17: Photoreal explosions, thrown rounds and fire

Status: ready-for-dev

<!-- Written 2026-11-28 with gds-create-story from the real code and the approved group-5 page (family "fire":
     src/fire*.ts). Correct-course: sprint-change-proposal-2026-11-28-photoreal-fx.md. After 9.6. -->

## Story

As a player,
I want blasts, rounds and thrown items in flight, burning cars and flame streams in the approved look,
so that I read where it burst, how far it reached, where a throw will land and where fire hurts.

## Designer decisions — the source of truth

`docs/art/photoreal-decisions.md` › FX group 5: **EX1-G, EX2-A, GR-R, FI-R, FS-A**; and the bottle's flight from
**MO-R** (its zone is Story 9.18).
- "Reco" 2026-11-28: **EX2-A's shock ring becomes pale concrete grey** (white = pick-ups / people).
- FI: "The fire cant be a circle if the car is a rectangle. Circle may represent the heat" → FI-B; then "FIB is good but
  I'd like to improve the circle, it's too much contrasting" → **FI-R**.
- GR: "GR shadows are strange, they more look like mirrored images" → **GR-R** (a flat blob, not a copy).
- EX1-G answered the amber-ring question by colour meaning: no ring (amber = events you can use).
- Look code: `docs/art/photoreal-5/src/fire.ts` (A takes: EX2-A, FS-A), `fire-kit.ts`, `fire-g.ts` + `fire-gkit.ts`
  (EX1-G), `fire-r2.ts` (GR-R, MO-R), `fire-car.ts` (FI-B and FI-R), `fire-gmo.ts` (MO-G/MO-R bottle), `carburnt_a.png`.

## Acceptance Criteria

Every look: textures from the `fire` atlas (9.6), pooled sprites, deterministic, no allocation per frame, today's look as
the per-run fallback (9.6 B2), **no sim number changed** (blast radius, damage, timings, flight, fire zone).

1. **EX1-G launcher blast.** Goal: "it burst HERE, it reached THIS far (2.5 m), and it is over". Flash 0.08 s (white-hot
   core, the brightest thing); a blast front of light reaching exactly R at 0.12 s and cooling white → orange →
   red-brown out by 0.4 s (3 temperatures, 256² each; replaces the amber edge ring `EDGE_RING_FIREBALL 0xffb060`);
   26 fireball flames inside the front (bright part stops 5 cm inside R), cooling by temperature, 0.35–0.7 s; a light
   pool to R for 0.5 s; 6 chunks hopping out, landing on their own shadows inside R; soot rising from the centre 0.1–3.2 s
   (may drift past R); a scorch whose rays end at R with embers dying in 1.5 s, staying 30 s (`SCORCH_FADE_S`) or to the
   next build. **Flying sparks cut.** Peak ≈ 51 sprites (30 ADD); `?fx=low` 13 flames, 4 smoke (≈ 37). By 0.7 s no
   light is left.
2. **EX2-A mine / hand grenade.** EX2-A's look: a harder, whiter flash 0.12 s; the dust ring as lit concrete dust (tan
   tops lit upper-left, shaded undersides) rolling out to exactly 2.5 m in 0.32 s; 18 chunks relit with shadows that meet
   them on landing; 14 short sparks; a lighter scorch with fewer embers; **the shock ring (today `EDGE_RING_SHOCK
   0xf2eee6`, grows to R in 0.25 s, fades 0.45 s) in pale concrete grey** (pick the grey from the page's dust palette,
   e.g. the lit top of the dust; say which). Same counts as today + ≤ 18 shadows + 1 ember sprite; `?fx=low` halves
   flames and dust puffs.
3. **Explosions honour `?fx=low`** (today `ExplosionView` always uses the full 96-particle pool): `fxLow()` halves the
   per-blast counts in `grenadeFx.ts › BlastParticles.burst`. **Debris has shadows** (today it floats).
4. **GR-R rounds and thrown items in flight.** Goal: "something is flying to THAT spot and bursts there in a moment; its
   shadow on the ground says where and how soon". The game's own round and hand grenade relit (GR-A: metal volume, a
   glint upper-left), sizes, arc (1.5 m, `lobArcM`), tumble (2.2 turns hand grenade, 1.6 bottle) unchanged; the launcher
   round's thin grey propellant trail (5 puffs, gone in 0.2 s; not on thrown items). The shadow is a **flat dark blob**
   of the item's footprint (sized from the relit body, the pin ring adds nothing), cool near-black (6, 8, 12): crisp and
   dark on the ground (alpha 0.80, penumbra 12 %), 38 % wider, soft and pale (≈ 0.4) at the top of the arc, two blobs
   cross-faded by height (no step), offset (0.35, 0.45) m per metre (today's), meeting the item on landing. No additive
   sprite. **The Molotov bottle** uses the same blob rule, and **its rag flame is tinted orange** (today an untinted white
   fire mask: `GrenadeView` rag, `RAG_FLAME_HZ` 14) and lights the bottle from the front (a small warm pool 0.9 m, MO-A /
   MO-R's "the rag is the only light in the air").
5. **FI-R car fire.** Goal: "this car is burning, and inside this 2 m circle you get hurt (10 damage/s in 0.5 s pulses)".
   Flames on the car's own fuel (cabin tallest 18, engine 14, tyres 8, a fuel pool under the rear 14), leaning
   downwind, never a circle; 12 embers from the cabin downwind; black smoke from cabin + engine, born downwind of the
   flames (14); soot burnt into the asphalt under the car + the fuel stain; a flickering car light; **the circle only from
   heat**: a ground glow strongest at the car, 0.24 + 0.06 × flicker, fading over its last 0.3 m inside 2 m; a heat line
   as a soft pale haze (255, 170, 110), ≈ 0.17 m wide, its peak 0.12 m inside R, 5 % at R, alpha 0.22 at rest / 0.40 on
   each 0.5 s damage tick, broken by a slow shimmer (0.55–1). Bumpers stick out 0.25 m: their flames are held inside R.
   **This replaces CityView's car-fire ring** (`updateFireRing` :343-358, the 2 px orange line + 5 px ADD glow at depth
   1.5) and the ring of edge flames (Story 4.11's edge rule) for cars. Peak 78 sprites (61 ADD), half with `?fx=low`
   (today ≈ 200). Burning survivors / zombies (BurnView, FlameView.zombies) keep today's look (not on the page).
6. **FS-A flame streams.** Same rays, reach and cones (FS1 jet 6 m × 20°, FS2 torch 3 m × 60°; `flameJet.ts STYLE`):
   FS1's fuel burns white at the core cooling to amber and red-brown at the tips (24 flame steps); FS2 keeps a
   blue-white core (its own texture, today a flat `TORCH_BLUE` tint) then amber; a pilot light at each nozzle (0.45 m,
   ADD); the floor glow a warm pool; up to 6 thin soot wisps per flamer rising from the stream's end and drifting off for
   0.8 s after release. Pools as today (`maxFlameParticles` 96, `flameParticlesPerS` 90, halved with low).
7. **Perf.** `?stress=150&stressfx=1` (launcher + flamethrower) and a scene with 4 burning cars and 8 blasts in 2 s within
   2 FPS and +1 ms p95 of master at 1× and 4× CPU; texture memory added recorded (EX1 set ≈ 2.4 MB + front 768 KB,
   FS-A ≈ 1.5 MB, FI-R ≈ 470 KB, GR-R 137 KB); additive sprites cropped to their visible circle (9.15 B8).

## Tasks / Subtasks

- [ ] T1 `docs/art/photoreal-5/src/atlas/fire.atlas.ts`; `npm run art:fx` (split into two atlases if > 2 MB: `fire`,
  `fire2`, both this story's).
- [ ] T2 Explosions (AC 1–3): `ExplosionView` + `grenadeFx.ts` (BlastParticles counts per look, front sprite, shadows,
  `fxLow`), EX2's grey ring.
- [ ] T3 Flight (AC 4): `GrenadeView` relit items, blob shadows, launcher trail, rag tint + light.
- [ ] T4 Car fire (AC 5): `city/FireView.ts` car mode + `fireParticles.ts` car emitters by part; CityView ring → heat
  glow + line (`fireRing.ts` keeps `damageTickPulse`).
- [ ] T5 Streams (AC 6): `FlameView` / `flameJet.ts` pictures, pilot, soot.
- [ ] T6 Tests, gallery, readability sheet 166–173, stills in `docs/art/9-17/`, perf.

## Dev Notes

### The code today (read before touching)

- **`render/ExplosionView.ts`** (172): `explosion.happened` (kind, x, y, radiusM, ageS ≤ 0.5) and `build.started`
  (fade scorches); `blast(look, x, y, r, nowS)` :79 is the browser-check entry; depths SCORCH 0.95, GLOW 4.33, SMOKE
  4.37, FLAME 9.55, FLASH 9.6, RING 9.62, EMBER 11.62; `atlas_blastfx` (`ensureBlastFxAtlas`); pools from `combat.json ›
  explosion.fx` (maxExplosionParticles 96, maxLiveExplosions 8, maxScorchDecals 16); one Graphics for the rings; flash
  (2.2 / 2.6)·R; ignores `?fx=low`.
- **`render/grenadeFx.ts`** (612, pure) holds **both** `GrenadeFlights` (:28-179; `pose()` :163: z = 4·arcM·u(1−u)) and
  `BlastParticles` (:242; per burst fireball 34 flame / 10 smoke / 16 ember / 6 debris, shockwave 8 / 24 dust / 18 debris
  / 14 ember / 4 smoke; FLAME_CORE_FRAC 0.62), `BLAST_TIMES` :499, `Explosions` :510 (scorch ring, `ring()`),
  `blastLookFor` :207 (grenade, gas_leak → fireball; mine, bloater, hand_grenade → shockwave), `STALE_EXPLOSION_S` 0.5
  (GameScene :113 imports it). It also handles `molotov.ignited` (`burstAt`, ends the bottle's flight): **9.18 doesn't
  touch this file**. Tests `grenadeFx.test.ts`, `NetSimHost.grenade.test.ts`, `NetSimHost.consumables.test.ts`.
- **`render/GrenadeView.ts`** (207): rounds + thrown items + the landing markers (`drawMarker`, `drawThrowMarker`;
  **9.18 changes `drawThrowMarker` for the Molotov teardrop**: leave it to 9.18 or land your change first and say so).
  Depths ROUND 11.5 (rag 11.51), SHADOW 4.2, MARKER 4.25; ROUND_READ_SCALE 3, HAND 2.2, BOTTLE 1.5; HAND_TURNS 2.2,
  BOTTLE_TURNS 1.6; RAG_FLAME_M 0.26 at 14 Hz, ADD, alpha 0.85; shadow `fx_grenadeshadow_a` in `atlas_blastfx`
  (32 × 16 black ellipse at 0.55, `blastFxAtlas.ts:23 / :192-197`), offset 0.35 / 0.45 per m; items from `atlas_throwfx`
  (`city/throwArt.ts`).
- **`render/city/FireView.ts`** (313) is shared: car mode (CityView, 4 slots, `setFires` at bake) and **pool mode**
  (MolotovView, `CarFire.setPool`). Depths LIGHT 4.32, SMOKE 4.36, FLAME 4.38, EMBER 11.6. **Keep pool mode working**
  until 9.18 lands (9.18 stops using it; whichever of 9.17 / 9.18 lands second deletes the dead path).
- **`render/city/fireParticles.ts`** (725): caps FIRE_FLAMES_MAX 110, SMOKE 26, EMBERS 24, EDGE_* (the ring of edge
  flames), WIND (0.55, 0.32), `CarFire` (setCar, setPool …), `BodyFire` (BurnView: keep). `halfCap(cap, low)`.
- **`render/city/fireRing.ts`** (70): FIRE_RING_WIDTH_PX 2, COLOR 0xff7828, ALPHA 0.55, GLOW 5 px / 0.1 / pulse 0.08,
  `damageTickPulse` (exp(−5·phase)), `SCORCH_FULL_FRAC` 0.9 (drawCity). Used by CityView (ring), FireView (radius),
  MolotovView (colour), drawCity.
- **CityView** owns the car ring: `CityView.ts:22`, :143-144 (`fireRing`, `fireRingGlow` ADD, depth 1.5), :343-358
  `updateFireRing`, :411 / :412 update; `FIRE_LIGHTS` 4. **9.20 edits CityView's rain block** (:414-451): keep to the
  fire-ring block.
- **`render/FlameView.ts`** (188) + **`render/flameJet.ts`** (219): JET lifeS 0.42–0.55, bloom 0.85; TORCH 0.3–0.42,
  blueFrac 0.28, `TORCH_BLUE` 0x9cc4ff; glow tint 0xff9a40 at 0.38 × flicker; MAX_FLAMERS 4; burning zombies ZFLAMES 2
  (max 40): keep.
- Sim numbers (unchanged): `weapons.json grenade_launcher` 40 dmg, 2.5 m, push 0.6, lob 20 m/s (min 0.25 s);
  `consumables.json` grenades 40 / 2.5 m / 12 m/s; `buildings.json mine` 80 (players × 0.5), 2.5 m; `decay.json fire`
  radius 2 m, 10/s, pulse 0.5 s; flamethrower 6 m × 20°, gas torch 3 m × 60°.

### Builder decisions (B-numbers; tell the reviewer)

- **B1 Two atlases if needed** (EX1 + FS-A ≈ 4 MB RGBA): split `fire` / `fire2` to stay ≤ 2 MB each (both this story's).
- **B2 Grey shock ring**: the colour chosen and why (from the dust palette).
- **B3 Car flames by part**: the car's rectangle and angle come from `FireRecord` + `carAngle` (FireView `setFires`);
  the part layout (cabin, engine, tyres, rear pool) is the page's `fire-car.ts` scaled to the car.
- **B4 Fire ring**: the new heat glow and line live in FireView (one per car slot) and CityView drops its two Graphics;
  `damageTickPulse` and `decay.fire.pulseS` stay the clock.
- **B5 BurnView / burning zombies unchanged** (not on the page): say so in the hand-back.

### Guardrails (AGENTS.md §5)

As 9.6. No change to `packages/shared` except `controls.json` caps if any (+ schema). `?fx=low` through `fxLow()`.

### Testing

- Pure: EX1-G front radius = R at 0.12 s and no bright pixel past R (sample the composed draw list); EX2 ring colour;
  `BlastParticles` low counts halved; GR-R shadow offset 0 at height 0, alpha 0.8 → ≈ 0.4 at 1.5 m, continuous (no
  step: sweep u at 0.001); FI-R no flame core past R, heat line peak 0.12 m inside, tick on the 0.5 s pulse.
- `grenadeFx.test.ts`, `fireParticles.test.ts`, `fireRing.test.ts`, `flameJet.test.ts`, `atlasLayout.test.ts` kept green
  (update where the look changed, say why).
- Browser: dev panel blasts of every kind, a thrown grenade and Molotov, a burning car at stage 3, both flamers; stills
  beside `compare.html`; `?fx=low`.

### Notes for the merge

- **Touches:** `render/ExplosionView.ts`, `render/grenadeFx.ts`, `render/GrenadeView.ts` (not `drawThrowMarker`),
  `render/city/FireView.ts` (car mode), `render/city/fireParticles.ts` (car emitters), `render/city/fireRing.ts`,
  `render/city/CityView.ts` (the fire-ring block only), `render/FlameView.ts`, `render/flameJet.ts`,
  `render/city/blastFxAtlas.ts` / `fireFxAtlas.ts` (fallback untouched unless needed), `render/fx/atlas/fire*.*`,
  `docs/art/photoreal-5/src/atlas/fire.atlas.ts`, tests, gallery, readability sheet, perf doc.
- **Overlaps:** 9.18 (MolotovView, molotovFx, `drawThrowMarker`, sim): no shared lines except FireView's pool mode
  (above). 9.20 (CityView rain block). 9.16 (FxView): none.
- **Net kinds:** 90–91 (none expected). **Readability sheet:** 166–173.

### References

- `docs/art/photoreal-decisions.md` (FX group 5); `docs/art/photoreal-5/src/fire*.ts`; `.claude/skills/dead-city-model/fx.md`
  (FX 4 lessons: additive light saturates; separate the read from the thing); 9.6 story file; 9.15 (B8 crop).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
