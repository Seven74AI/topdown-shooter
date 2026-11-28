# Story 9.16: Photoreal gunfire, hits and blood

Status: ready-for-dev

<!-- Written 2026-11-28 with gds-create-story from the real code and the approved group-5 page (docs/art/photoreal-5,
     family "gunfire": src/gunfire*.ts). Correct-course: sprint-change-proposal-2026-11-28-photoreal-fx.md. After 9.6. -->

## Story

As a player,
I want every shot, hit, kill, swing and building event drawn as the approved light and matter,
so that I read who fired, what I hit and from where, and what happened to my buildings, at a glance.

## Designer decisions — the source of truth

`docs/art/photoreal-decisions.md` › FX group 5: **MZ-A, SG-G, TR-G, HT-G, BL-G, BT-G, ML-A, CS-A (more blood), BF-G**.
- CS-A "id like more blood": 6 heavy drops per cut (3 with `?fx=low`), landing 0.5–1.2 m behind, the last 24 splats
  stay, a smear under the cut, a bigger mist.
- ML: the designer asked for a mix (ML-M) and then picked **ML-A** in round 3 (not ML-M).
- "Reco" 2026-11-28: **HT-G / BL-G: the hit direction is given to the client (display only)**; **BF-G: the destroyed
  wreck stays 4 s although the cell frees at once (visual only)**.
- Look code: `docs/art/photoreal-5/src/gunfire.ts` (A takes), `gunfire-art.ts`, `gunfire-g.ts` + `gunfire-g-art.ts`
  (G takes), `gunfire-r2*.ts` (ML-M, not picked). Each `Look` has `goalFirst` (goal / elements / composition / plan),
  `frames`, `perf`, `findings`: the AC numbers below are copied from them.

## Acceptance Criteria

Every look: textures from the `gunfire` atlas (9.6), composed with pooled sprites (`fxKit.SpritePool`), deterministic,
no allocation per frame or per event, today's look kept as the per-run fallback (9.6 B2). Timings are the game's.

1. **MZ-A muzzle flash.** Per gun a 3-frame flash over today's `MUZZLE_MS` 50 ms (pistol star, rifle brake jets,
   shotgun bloom, turret twin jets; `mz_<gun>_0..2`, 96 × 48, ADD), pointing down the barrel; a warm light pool 0.9 m
   (`mz_pool` 64², ADD, 80 ms); 2 gun-smoke wisps per shot drifting forward for 0.65 s (normal, lit upper-left). Size ×
   `muzzleScaleFor` (`weaponLook.ts:14`: shotgun 1.6, rifle 1.25, launcher 1.4, else 1). Fixes: the flash is additive
   (today a normal-blend disc), SMG / hunting rifle / turret get their gun's shape. New cap
   **`fx.maxGunSmoke` 24** (oldest reused; `?fx=low`: 1 wisp per shot, cap 12). Turret shots (`turret.fired`,
   FxView.ts:114) use the turret shape. The shotgun's own flash hands over to SG-G's bloom (AC 2).
2. **SG-G shotgun.** Goal: "read the spray: 8 pellets × 5 dmg over a 30° fan reaching 5 m". A muzzle bloom ≤ 0.9 m for
   110 ms (`BLAST_MS`, 3 frames 83 × 58 cropped, ADD) replacing both today's flash and the 2.4 m cone (`BLAST_M`,
   `weaponLook.ts:19`, and FxView `blast()` :248: removed); 8 pellet tracers (AC 3's head + a thinner tail) out to 5 m in
   83 ms; one lit dust kick where each pellet stops, 0.45 s (new pooled set **`fx.maxShotDust` 32**, low 4 per shot);
   a warm light on the shooter 90 ms; one smoke cloud at the gun drifting sideways (low 1). Nothing bright past 5 m;
   bloom and smoke within 1 m of the muzzle.
3. **TR-G rounds.** Goal: "where each round is, where it is going, whose it is". A white-hot head 0.09 m (≥ 3 px) at the
   interpolated position (`round_head` 16², ADD) + a thin tail one frame's travel long (speed / 60: 1 m for guns at
   60 m/s, **0.67 m for the turret at 40 m/s** (`buildings.json › auto_turret.turret.projectileSpeedMps`)), ≤ 0.05 m
   wide, cooling to nothing (`round_tail` 64 × 8, ADD); amber for players, cyan for the turret; pellets the same head
   with a thinner, dimmer tail. The tail never starts behind the muzzle (grows to full length in the first frame).
   `ProjectileView` gets 2 images per slot (head + tail; pool size = `PROJECTILE_POOL_CAPACITY` 512 slots, lazily made,
   as today).
4. **HT-G hit.** Goal: "I hit it, from this side, every hit (FR19), without losing the zombie's type during sustained
   fire". The flash keeps `FLASH_MS` 80 ms (`BRUTE_FLASH_MS` 160) but brightens the zombie's own picture toward white,
   more on the entry side, shape and type kept (no `TintModes.FILL`: ZombieView.ts:229-234 today; a tint toward white
   plus a front-weighted second additive copy of the same frame, or the tint alone: builder's call, B3); an exit jet of
   dark red-brown mist out the far side along the shot (±15°), 0.18 s, starting at the body's far edge (0.3 m); 3–4 drops
   landing 0.4–0.9 m behind on the shot's line at 0.12 s, staying 3 s (new pool **`fx.maxHitDrops` 64**, low 32; per hit
   ≤ 2 jet puffs (low 1) + 4 drops (low 2)). Additive layers are never tinted. The direction is `zombie.hit`'s
   `dirX/dirY` (on the wire today: `netEvents.ts:167-177`; FxView.ts:97 ignores it).
5. **BL-G kill blood.** Goal: "a zombie died here, this size, this way; and how long ago". On `zombie.killed`: a dark
   red-brown mist burst 0.3 s biased downrange (≤ 4 mist, low 2); 6 drops thrown downrange (±35°) 0.3–0.6 m (low 3)
   landing at 0.13 s as satellites of the pool; a pool spreading over 0.3 s, 1.3× longer along the shot and 0.12 m past
   the body's centre, sized by the zombie (× radius / 0.35: Walker 0.35, Bloater 0.5, Brute 0.6), 3 pool shapes; a weak
   cool gloss (ADD) on the rim facing the light that dries 0.8–5 s; the pool fades by 10 s (`SPLAT_FADE_MS`), ring of
   **`fx.maxBloodPools` 200** (today's `SPLAT_CAP`, now a cap; the drops either baked into the pool picture or a ring of
   300: builder's call, B4). Replaces the splat disc (#5a0f0f) and the red puff (#8a1c1c, close to the warning red).
   **Kill direction** (correct-course CC-B1): the last `zombie.hit` direction of that zombie slot in the same tick
   (typed array, reset on spawn); chainsaw kills use the swing direction (`applyZombieDamageQuiet`, no `zombie.hit`);
   other kills (traps, fire, Bloater swell, decay, cheats) take BL-A's seeded turn. One shared fade clock in the view
   (today 200 tweens).
6. **BT-G Crawler trail.** Goal: "a Crawler came this way, and it's at the shiny end". BT-A's torso smears (0.5 m,
   3 shapes, shaded, overlapping into one drag mark) + a hand print per 0.35 m step, left and right in turn, 0.22 m off the
   line, palm ahead and fingers dragged back (`hand_print_0/1`, 83 × 51), under the Crawler; gloss only on the freshest
   ~2 s (1.5 m); marks fade over 5 s (`FADE_MS`); spacing `SPACING_M` 0.35 unchanged; the ring of 400 holds 200 steps of
   smear + print (BloodTrailView.ts:16: `TRAIL_CAP` → 400 images, or 800 for 400 steps: say which). Fog rule kept (no
   mark from a hidden Crawler).
7. **ML-A melee sweep.** Goal: "which way the blade went and exactly what it could reach". The sim's sector (machete
   110° × 1.8 m, fire axe 140° × 2.2 m; F1: exactly the sector) swept in 4 frames (60 ms machete, 90 ms axe), a motion
   smear densest at the blade and toward the rim, a glint (48², ADD) riding the blade where the steel catches the light;
   fades out on today's ends (`SWING_MS` 120, `AXE_SWING_MS` 200). Fix ML-M's finding: the smear must stop at the range
   (ML-A's frames ran to 1.02 R); crop the frames to the sector (ML-G finding, halves memory). Same cap
   `fx.maxSwingArcs` 8; 1 image + 1 glint per swing (no Graphics path rebuilt per swing).
8. **CS-A chainsaw.** Goal: "feel the saw biting … blood when it cuts flesh, never a cloud that hides the target". Same
   spark pool numbers (`chainsawSparksPerHit` 4 steel, `maxChainsawSparks` 32, `chainsawSparkMs` 180) drawn as hot
   streaks cooling white-yellow → dull red (32 × 8, ADD, or lines in the one Graphics); a blade-light flicker per cut
   (48², ADD); **more blood**: per cut a dark red-brown mist and 6 heavy drops thrown away from the blade (3 with low)
   landing 0.5–1.2 m behind as splats that stay (the last 24: new ring **`fx.maxSawSplats` 24**) and a wet smear growing
   under the cut while the saw bites; the 60° × 1.5 m wedge stays (the sim's sector), a little fainter than #ffc98a at
   0.16. Today's blood spark #8a1010 joins the one blood palette.
9. **BF-G building events.** Goal: "what happened to which building, in its own shape", on today's times (repair /
   upgrade 450 ms, snap 180 ms, sold 200 ms, debris 450 ms):
   - repaired: a green band (#7cff8a family, ADD) on the footprint's outline spreading 1 → 1.25× and fading, + 4 motes;
   - upgraded: a steel-blue band clamping 1.3 → 1× onto the footprint, holding, fading, + a glint on the upper-left corner;
   - bear trap snapped: two toothed jaws fold and meet in 40 ms, a white glint where they meet, 2 dust kicks (the trap's
     circle kept: the jaws are round);
   - sold: the footprint lifts 0.15 m and fades (200 ms), a pale dust print stays 1.5 s;
   - destroyed: the barricade in two halves slumped to its ends, **staying 4 s** (visual only; the sim frees the cell at
     once), 6 lit splinters out of the two long faces (±35°, never along its length), landing and staying 4 s (ring
     **`fx.maxSplinters` 48**), sawdust along the footprint; **metal and police barricades throw metal / plastic pieces**
     (today brown wood puffs for every type: FxView.ts:185).
   `building.repaired` / `building.upgraded` carry x, y only: look the building up in the world (as debris and sold
   already get type and rotation). `?fx=low`: half the motes, dust and splinters.
10. **Perf.** Page peaks: MZ ≈ 4 flashes + 4 lights + 16 wisps per 4 guns; SG 1 bloom + 1 light + 8 tracers + 8 dust;
    TR 2 images per round; HT ≤ 8 per hit; BL ≤ 13 per kill; ML 2 per swing; CS ≤ 14 per cut + marks. `?stress=150`
    within 2 FPS and +1 ms p95 of master at 1× and 4× CPU, and a firefight scene (4 bots: SMG, shotgun, rifle, chainsaw
    on 150 Walkers, `?stress=150&stressfire=1` extended) measured and recorded in `docs/perf/epic-9-fx.md`.

## Tasks / Subtasks

- [ ] T1 `docs/art/photoreal-5/src/atlas/gunfire.atlas.ts`: imports the picked looks' bake, exports frames; `npm run art:fx`.
- [ ] T2 Muzzle + shotgun (AC 1, 2): FxView `muzzle()` / `blast()` → pooled sprites; smoke and dust pools; weaponLook.
- [ ] T3 Rounds (AC 3): ProjectileView head + tail; turret speed from `buildings.json`.
- [ ] T4 Hit + kill (AC 4, 5): ZombieView `flash()` (lit, not FILL), FxView exit jet, drops, pools; kill-direction array.
- [ ] T5 Trail (AC 6): BloodTrailView smears + prints.
- [ ] T6 Melee + saw (AC 7, 8): FxView swing → sweep frames; `meleeFx.ts SparkPool` drawn as streaks; saw blood.
- [ ] T7 Buildings (AC 9): outlines from footprints, jaws, print, halves, splinters by material.
- [ ] T8 Caps in `controls.json` + schema; `fxQuality.fxLow()` halving; tests; gallery; readability sheet 156–165;
  stills beside `compare.html` in `docs/art/9-16/`; perf.

## Dev Notes

### The code today (read before touching)

- **`render/FxView.ts`** (383 lines), the dispatcher. `handle(e)` :95-154: `zombie.hit` :97 (reads `zombieId` only →
  `zombies.flash`, `zombie_hit` sfx), `zombie.killed` :101 (x, y → `splat()` + `puff()`), `building.destroyed` :105
  (`debris()`), `weapon.fired` :109 (x, y, weapon, dirX, dirY, playerId → `muzzle(x, y, muzzleScaleFor(weapon))`,
  `blast()` if `blastLengthFor > 0`), `turret.fired` :114 (muzzle at scale 1), `melee.swung` :121 (`sawCut()` or
  `swing(…, heavy)`), `building.upgraded` :136, `bear_trap.snapped` :140, `building.sold` :144, `building.repaired` :148.
  Everything is Phaser shapes (no texture). Constants :8-50 (SPLAT_CAP 200, SPLAT_FADE_MS 10 000, SPLAT_RADIUS_M 0.35,
  BLOOD 0x5a0f0f, PUFF_MS 200, MUZZLE_MS 50, SWING_MS 120, AXE_SWING_MS 200, SAW_* , SPARK_*, DEBRIS 6 × 0x8b5a2b 450 ms,
  REPAIR 0.6 m 450 ms, SOLD 0.15 m 200 ms, SNAP 0.45 m 180 ms, BLAST_MS 110). Depths: splats 1, puffs / debris / sold
  6, swing 7, blast 8.6, sparks 8.8, muzzle / rings 9. Pools: splat ring 200; puffs, debris, sold, blast, muzzle use an
  **unbounded** `take()` (`Array.find` + push); swing arcs up to `fx.maxSwingArcs` with round-robin. Per event
  `tweens.add({...})` allocates. `destroy()` :372 never destroys `solds` / `snaps` (fix in passing, test). Wired at
  GameScene.ts:836-841, `handle` :2262, `update` :2375, destroy :1008. No unit test (parts in `meleeFx.test.ts`,
  `weaponLook.test.ts`).
- **`render/ProjectileView.ts`** (76): one Rectangle per slot, origin (1, 0.5), STREAK_M 0.6 × 0.07, gun #ffd27a, turret
  #6fe3ff × 0.7, pellet #ffe7b0 (× 0.5 via `streakScales`), depth 8; reads the `ProjectilePool` (solo: World's; online:
  the cosmetic pool `net/cosmeticProjectiles.ts`, fed by NetSimHost.ts:726-733 / `turretShot` :803-811). No allocation.
- **`render/ZombieView.ts`**: `FLASH_MS` 80 (:19), `BRUTE_FLASH_MS` 160 (:31), `flashUntil` Float64Array (:97), `flash(id)`
  :229-234 (white FILL on the image and the crossfade top), clear :356-361, new-zombie reset :306-307, top layer :438-440,
  the Bloater swell tint only when not flashing (:614, :633). Glow and sheen layers are not tinted (keep: 9.13 B27).
- **`render/meleeFx.ts`** (231, pure): `SparkPool` :78 (ring, LCG, spawn ±1.05 rad round the blade's side, 2–5 m/s, drag),
  `ChainsawCutFx` :50, `SawClock` :171. Tests `meleeFx.test.ts`.
- **`render/BloodTrailView.ts`** (147): ring of 400 images of `blood_trail` (32 × 20, two ellipses #4a0c0c, its own
  `addGeneratedTexture`), one per 0.35 m, 0.42 × 0.26 m, alpha 0.6 → 0 over 5 s, depth 1, own paused clock, fog rule;
  GameScene.ts:834; test `fog/fogViews.test.ts:89`.
- **`render/weaponLook.ts`** (48): `MUZZLE_SCALE`, `BLAST_M { shotgun: 2.4 }`, `streakScales`, `SWING_LOOK`. Test
  `weaponLook.test.ts` (:13 shotgun flash biggest, :17 blast only shotgun: update for SG-G).
- **Net**: `zombie.hit` = kind 2 `[2, zombieNetId, cm x, cm y, heading(dirX, dirY), tenths(dmg), weaponIdx, sourceSlot]`
  (decode :395-409 rebuilds dirX/dirY); emit `combat/damage.ts:102/:104` with the projectile's travel direction
  (`firing.ts:365`), the swinger → zombie vector (`melee.ts:80`), radial for blasts (`explosion.ts:201`); x, y are after
  pushback. `zombie.killed` = kind 1 `[1, zombieNetId, killerSlot, cm x, cm y, weaponIdx, (buildingId)]`, no direction,
  emitted by `zombiePool.ts › killZombie` :251-252 right after the hit (`damage.ts:107`). Quiet path
  `applyZombieDamageQuiet` (chainsaw `melee.ts:79`, player-weapon blasts `explosion.ts:200`) emits no `zombie.hit`.
  Server interest filter: `apps/server/src/net/eventInterest.ts:89-96` (probe: can a client get the kill without its hit?).
- **Caps today** (`controls.json › fx` :5-24): maxSwingArcs 8, maxChainsawSparks 32, chainsawSparksPerHit 4,
  chainsawSparksPerMiss 1, chainsawSparkMs 180, chainsawRevHoldMs 150 (schema `balanceSchema.ts:578-616`).
- **`render/buildingFx.ts`** is not the events file (relit buildings' glow / glint timing): don't touch.

### Builder decisions (B-numbers; tell the reviewer)

- **B1 Kill direction without bytes** (CC-B1). Add the optional heading byte at `zombie.killed` index 7 only if the
  probe of `eventInterest.ts` shows a kill can arrive without its hit; then kind 1 keeps its number, decode by length.
- **B2 New caps** (AC 1, 2, 4, 5, 8, 9): `maxGunSmoke` 24, `maxShotDust` 32, `maxHitDrops` 64, `maxBloodPools` 200,
  `maxSawSplats` 24, `maxSplinters` 48, all halved by `fxLow()`; `balance.version` changes (re-pin goldens, 9.13 B28).
- **B3 The lit hit flash**: the cheapest version that keeps the type readable at 12 hits/s (SMG); measure both (tint
  only vs + additive copy) and say which.
- **B4 Drops with the pool**: baked into the pool picture (no extra images) or a 300 ring; measure.
- **B5 The 9.5 overlap**: 9.5 (gore, later) raises the decal cap and adds dismemberment on `zombie.killed`; keep the
  pool and kill-direction code reusable (`bloodFx.ts` pure).
- **B6 One blood palette** from `fxKit.BLOOD` everywhere (pool, mist, drops, trail, saw blood, hand prints).

### Guardrails (AGENTS.md §5)

As 9.6: `addGeneratedTexture` (through 9.6's loader), no per-frame allocation (and none per event: no tween configs),
deterministic, Phaser 4 types checked, no sim change (no shared-package change except `controls.json` caps + schema),
own ports, `gate:fast` + `test:slow` for touched areas, a real-browser check, say what wasn't verified.

### Testing

- Pure tests: kill-direction bookkeeping (hit then kill same tick → that direction; quiet chainsaw → swing direction;
  trap kill → seeded turn; slot reuse resets), BL-G pool geometry (1.3× along the shot, scaled by radius), BT-G print
  alternation on the step counter, ML-A smear never past R (sample the frames' alpha beyond R = 0), TR-G tail length =
  speed / 60 (turret 0.67 m), BF-G splinters only through the long faces, wreck alive 4 s.
- Browser (Playwright, own port): solo run, every event fired through the dev panel; stills of each look at 844 × 390
  DPR 2 beside the `compare.html` column (`docs/art/9-16/`); `?fx=low` counts halved; hidden tab sleep / wake.
- Perf as AC 10.

### Notes for the merge

- **Touches:** `render/FxView.ts`, `render/ProjectileView.ts`, `render/ZombieView.ts` (`flash()` only),
  `render/meleeFx.ts`, `render/BloodTrailView.ts`, `render/weaponLook.ts`, new `render/bloodFx.ts` / `render/gunFx.ts`
  (pure), `render/fx/atlas/gunfire.*`, `docs/art/photoreal-5/src/atlas/gunfire.atlas.ts`,
  `packages/shared/src/config/balance/controls.json` + `balanceSchema.ts` (keep-both with other stories' keys),
  `scenes/GameScene.ts` (wiring, ≤ a few lines), tests, gallery, readability sheet, `docs/perf/epic-9-fx.md`.
- **Overlaps:** 9.22 reads ZombieView visibility but doesn't edit `flash()`; 9.17 owns ExplosionView (not FxView); 9.21
  owns BossView (the boss hit flash stays as is). Only `controls.json` / schema / GameScene merge, keep-both.
- **Net kinds:** 87–89 (only if B1 needs a byte: none). **Readability sheet:** 156–165.

### References

- `docs/art/photoreal-decisions.md` (FX group 5); `docs/art/photoreal-5/src/gunfire*.ts` (goalFirst, frames, perf,
  findings); `.claude/skills/dead-city-model/fx.md` (FX 2, FX 4, FX 7); 9.6 story file; 9.13 (B19, B27, B28).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
