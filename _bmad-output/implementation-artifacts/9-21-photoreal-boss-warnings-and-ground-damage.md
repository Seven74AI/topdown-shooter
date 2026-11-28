# Story 9.21: Photoreal Behemoth warnings and ground damage

Status: ready-for-dev

<!-- Written 2026-11-28 with gds-create-story from the real code and the approved group-5 cards SD-A, CL-A
     (telegraphs.ts, telegraphs-art.ts), TH-R, CR-R, GD-R (telegraphs-r2.ts, telegraphs-r2-art.ts), P1-G
     (telegraphs-g.ts, telegraphs-g-art.ts), BD-R (matter-r2.ts, matter-r2-tex.ts). Correct-course:
     sprint-change-proposal-2026-11-28-photoreal-fx.md. After 9.6. -->

## Story

As a player fighting the Behemoth,
I want its warnings drawn as light on the street and its damage as one kind of broken asphalt,
so that I read where, how long and when each attack lands, and the street keeps the mark.

## Designer decisions — the source of truth

- "**In.** I'm curious to see how they would look like. So add them too." (the warnings in group 5). Every take keeps what
  the warning tells, its size in metres, its timing and its colour (red = get out, amber = your window).
- **SD-A**, **CL-A**, **P1-G** kept as is (round 2).
- **TH-R**: "THA but the crater is bad, take inspiration from our other crater, you can do way better. Also use same
  clockwork as SDA". **Crater 6 m** (2 × the 3 m reach): "Yes".
- **GD-R**: "why slam cracks and craters are so different?" → one family from `drawGroundDamage`.
- **CR-R**: "CRA but no need to show CRASH, but we should show a stun icons". "Reco": **the 0.3 s amber flash at the wall is
  kept, with the stun icon** (the icon itself is Story 9.22).
- **BD-R**: "BDG but currently the dust seems to come from above his hands, whereas the dust come from the ground." "Reco":
  **the Behemoth's dust drawn under its body (a BossView change)**.

## Acceptance Criteria

Textures from the `boss` atlas (9.6) or the game's own builders where the page uses the game's code (GD-R's
`drawGroundDamage`, B1); pooled; deterministic; no allocation per frame; today's look as the per-run fallback; **every
sim number and timing unchanged** (`boss.json`: slam r 4.5 m, telegraph 1.2 s, 40 dmg; throw lift 1.0 s, flight 0.8 s,
r 3 m, 35 dmg; charge warning 1 s, lane 4.8 m, stun 2 s, × 1.5 damage; `TELEGRAPH_FADE_S` 0.3), progress from the server
ticks (`bossTelegraph.ts`), 9.15's `BOSS_DUST` and `bossAnim` timings kept.

1. **SD-A slam countdown.** The 4.5 m ring as light on the street: 8 rim segments (ADD, ≈ 1.8 × 3.9 m each, the 4 m hole and
   the inner disc not drawn) with red light spilling inward over the grain; the **72 ticks** lit to progress glowing like
   burning marks (one layer); a hot head on the rim lighting the ground round it (head + pool 0.55 m / 2 m); sparks as
   streaks (30 → 100, the view's own clock); on the hit everything flares in the same 0.15 s (a 9.5 m flash pool), the
   relit cracks land (AC 6). Replaces today's **9.1 m full-disc additive quad** (`boss_tele_disc`, 512 px, α 0.45 + 0.55p).
   ≈ 57 m² of ADD instead of ≈ 83.
2. **TH-R throw.** Goal: "a 1.3 m slab of road lands inside this 3 m circle 1.8 s after the lift starts". A rim of red light
   at 3 m from the first frame (8 ADD segments) + faint hatching (α 0.3); **SD-A's dial: 48 ticks** round the rim (the
   slam's 0.39 m spacing), fresh ones hot cooling to embers over ¼ turn, a major tick every 45°, lit over the whole 1.8 s
   (lift + flight) on the attack's progress; a hot head with its red pool (0.47 m / 1.7 m); release: rim + a 6.3 m pool
   flare 0.15 s; **TH-A's white closing ring cut** (`throwInnerRadius` no longer drawn); the chunk drawn as a real relit
   slab of road with its own shadow on the road (height from `throwChunkAt`, arc `CHUNK_ARC_M` 3); impact: ≤ 9 bits with
   shadows (0.5 s), ≤ 12 dust puffs (1 s), the crater (AC 6). Halved with `?fx=low`.
3. **CL-A charge lane.** The 14 × 4.8 m lane: its two edges as lines of red light on the asphalt (2 ADD strips, cropped,
   ≤ 14 × 0.9 m), the hatching kept faint, the fill as red light sweeping forward with a bright front (0.5 × 4.8 m) that
   reaches the end as the rush starts (`chargeLaneProgress`), ≤ 6 white light chevrons (0.9 m) with a wave running forward;
   on the rush start the edges flare. Rush dust: **9.15's rush trail is the rush dust** (B3; no second emitter).
4. **CR-R crash.** At the stop on a building: the amber bar of light at the wall (0.55 × 4.6 m, ADD), a 0.15 s amber flash
   (4–5 m pool) and the bar fading with the lane 0.3 s after the stop (today's timing, kept), ≤ 10–12 concrete bits and
   ≤ 12–16 dust puffs **at the wall** (today the dust ring is centred on the body); **no CRASH word** (today
   `boss_mark_crash_a` with "CRASH" rotated with the lane and hidden under the body); the stun is told by 9.22's icon over
   the boss (no BossView work for it). The red lane goes out as the amber comes in.
5. **P1-G warning display.** Brackets + tick ring + TARGET tag on the survivor, the edge panel and chevrons, the attack
   plate kept; **the failing-display flicker (`hudFlicker`) only while it walks**: during a warning the display is steady,
   building 80 → 100 %, and the brackets flash on the hit with the boss's 0.15 s flash; **a thin red time bar under the
   SLAM / CHARGE / THROW plate fills to the hit** (1 Graphics, ADD) during a warning; **the hazard bar under the lock is cut**.
   Plates baked as a real screen (P1-A's bloom, scanlines and sheen in the plates, no runtime filter). Check the "TARGE"
   clip the page found in `hudWarnArt` (the tag's last letter cut by its plate) and fix it if it is in the game.
6. **GD-R one family of damage.** Both marks from `groundDamageArt.drawGroundDamage`: the slam's `SLAM_DAMAGE` untouched
   but baked at **384 px for 9 m (43 px/m)** (today 256 px, 28 px/m, below the game's 36); the crater with its own
   `DamageLook` (`CRATER_DAMAGE`: bowl 1.7, cracks 5, soot 0.62, rays 0.8, debris 300, fine 3) **plus 6 heaved slabs and 6
   pieces of the thrown slab** (a slab pass as a `DamageLook` option), baked at 43 px/m into **256² for 6 m** (= 2 × the
   3 m reach; today `drawCrater`'s flat disc at 128 px for 3.2 m, `BOSS_CRATER_M`), relit by the same pass from the upper
   left. **Decals drawn unrotated** (today `(attackId × 2.39996) % 2π` from GameScene.ts:1981-1982, which turns the baked
   light); variety from 2–3 seeds picked by attack id. Decal pool `caps.maxDecals` 8 and the clear at build start kept.
   The mark lands with its attack's flash (SD-A 0.05 s, TH-R 0.04 s).
7. **BD-R dust under the body.** The dust slots one depth **under** the body (`BODY_DEPTH − 0.01` = 6.19, still above the
   decals 1.6; today `BODY_DEPTH + DUST_DZ` = 6.21), the grit slots above it (it falls from the shoulders); each ground
   billow low and wide across its motion (× 1.4) and short along it (× 0.85), top-lit, its own contact shadow baked under
   its down-right edge, never turned; **a flat skirt from under each fist** in the first 0.4 s of a slam (2 sprites, half
   hidden under the fist); BD-G's geometry: the burst throws only the half away from the body
   (`bossDust.ts › burst`: angle = outward ± 90° instead of hash × 2π) and a speed cap so no visible puff passes 4.2 m from
   the boss (inside the 4.5 m edge). 9.15's pool (48, 24 with low), counts, sizes, alpha 0.5, tint 0xb8ada0 and timing kept.
   Pictures: BD-R's own 3 ground billows (80², shadow baked) + a 24² grit; `atlas_fx › fx_dust_a` no longer used by the boss.
8. **Blackout.** Telegraphs, lane, ring, lock and tag stay above the darkness (`ABOVE_DARK.telegraph` / `marker`); decals
   and dust stay under it (as today).
9. **Perf.** `?stress=150` and a wave-10 boss scene (every attack in turn, `?boss` debug) within 2 FPS and +1 ms p95 of
   master at 1× and 4× CPU (9.15's boss-scene method: `docs/perf/epic-9-behemoth.md`), ADD area per warning recorded (SD-A
   ≈ 57 m², TH-R ≈ 29 m² + ticks, CL-A ≤ 34 m²); memory (slam decal 576 KB, crater 256 KB).

## Tasks / Subtasks

- [ ] T1 `docs/art/photoreal-5/src/atlas/boss.atlas.ts` (segments, ticks, heads, pools, slab, bits, CL strips, CR bar,
  BD-R billows, P1 plates); `npm run art:fx`.
- [ ] T2 `groundDamageArt.ts`: `CRATER_DAMAGE` + slab option; `bossAtlas.ts`: crack at 384 px, crater at 256 px / 6 m
  through `drawGroundDamage` (`drawCrater` kept only as the fallback, or removed: say which); unrotated decals (AC 6).
- [ ] T3 BossView slam / throw / lane / crash (AC 1–4).
- [ ] T4 P1-G: `hudWarnArt.ts`, BossView `drawLock`, `scenes/BossHud.ts` (AC 5).
- [ ] T5 BD-R: `bossDust.ts` geometry, BossView dust depth and pictures (AC 7).
- [ ] T6 Tests, gallery, readability sheet 192–201 (retake the boss warning items), stills `docs/art/9-21/`, perf.

## Dev Notes

### The code today (read before touching)

- **`render/BossView.ts`** (1084): depths BODY 6.2, DECAL 1.6, LAYER_DZ 0.0004, DUST_DZ 0.01 (dust 6.21, :278);
  `bodyTop` 11.732 (above its own lane / ring in the light); telegraph objects in `ABOVE_DARK.telegraph` 11.73, lock / tag
  in `marker` 11.76. Constants :84-125 (TICK_GLOW 0xff3c28, TICK_CORE 0xffebdc, SPARKS 30–100, LOCK_R_M 0.8,
  FILL_COLOR 0xff2828 / 0.38, RING_WHITE, PUFF_COLOR 0xb8ada0, ROAR_COLOR, …). Builders `ensureBossTextures(scene, 2/4.5)`
  :265, `ensureBossRelit` :266, `ensureHudWarnTextures` :280. Pools: 2 TeleSlots :284-296 (oldest by hitTick reused),
  1 LaneSlot :301-311, 1 RingSlot :312-325, 4 FxRings :327, decals 8 round-robin :298, dust 48 (24 low) :276-278.
  `onSlammed` :380-387 (crack 9 m, rotation), `onThrownImpact` :360-367 (crater 3.2 m, rotation; ring 0.5 → 3 m in 0.4 s;
  dust `throwLanding`), `onCrashed` :354 (ring r → r + 1.5 in 0.5 s, centred on the body), `onTelegraph` :399-421,
  `drawTelegraphs` :948-971, `drawCountdown` :1033-1070 (72 ticks two passes, head = 4 circles, sparks), `drawLane`
  :856-898, `drawRing` :900-936 (white inner ring 0.12 at 0.9α, chunk arc), `drawFx` :938-946, `drawLock` :978-1027
  (`hudFlicker`, brackets, 24-tick ring, hazard stripes, tag), `emitDust` :715-774, `drawDust` :776-787, `setDark`.
  Wiring GameScene.ts:806, :1981-1985 (boss events, the decal rotation), :1993-1998, :2325 (clear decals), :2353, :2356.
  No unit test: `tools/checks/bossBakeWiring.test.ts`, `bossTelegraph.test.ts`, `bossAnim.test.ts`.
- **`render/bossTelegraph.ts`** (151, pure): `telegraphProgress` :23, `slamFrameIndex`, `chargeLaneLook` :59,
  `chargeStopTick`, `chargeLaneProgress` :79, `throwInnerRadius` :94 (no longer drawn), `CHUNK_ARC_M` 3, `throwChunkAt`
  :117, `throwLiftProgress` :142.
- **`render/bossDust.ts`** (158, pure): `BOSS_DUST` :16-42 (slamFists 9 × 2 at speed 2.2 r 0.35 life 0.5, fistAhead 1.12,
  fistSide 0.5; slamGrit 6 every 0.07 s; rushTrail 1/26 s; crash 16; throwCrumbs 8; throwLanding 12; roar 22; death 24;
  alpha 0.5, grow 1.6, pool 48); `BossDust.burst` (angle from `dustHash × 2π`: BD-G changes it). No test: add one.
- **`render/city/bossAtlas.ts`** (485): `BOSS_FX_FRAMES` :41-49 (crack 256 px via `drawGroundDamage`, chunks 64 px, crater
  128 px via `drawCrater` :113-131, crash 256 px via `drawCrashMark` :138-156), `BOSS_CRATER_M` 3.2,
  `BOSS_CRACK_PX_PER_M` 256/9; `BOSS_TELE` (`drawTeleDisc` :277-331, `BOSS_TELE_RADIUS_PX` 252), `BOSS_RING`
  (`drawHatchDisc` :217-259), `BOSS_LANE` (`drawLane` :439-485, 24 px/m, 14 × 4.8 m); `ensureBossTextures` :365-398 (also
  called by BossHud :60). Tests `atlasLayout.test.ts`, `noUnregisteredTextures`.
- **`render/city/groundDamageArt.ts`** (211): `DamageLook` :53-67 {bowl, cracks, soot, rays, debris, fine, seed},
  `SLAM_DAMAGE` :70 = {1, 11, 0.6, 0.55, 260, 9, 7}, `drawGroundDamage(g, x0, y0, n, o, scratch)` :76 (height field lit
  from (−0.55, −0.83), fractures, gravel; the 256-px tuned unit is N/256). Only bossAtlas calls it. No test: add a raster
  test (crater fractures end within 3 m; unrotated light).
- **`render/city/hudWarnArt.ts`** (343): `BOSS_HUD` plates, `HUD_PLATES`, `drawHudPlate` :186, `ensureHudWarnTextures`
  :305-333, `hudFlicker(tS)` :341-343.
- **`scenes/BossHud.ts`** (191, in HudScene): `PANEL_SCALE` 0.75, the amber stun flash `BAR_FILL_STUN 0xffb52e` at 4 Hz
  (kept), banner, edge panel, plate `hudFlicker(t + 0.3)`; wired HudScene.ts:765 / :2123. Tests `hudLayout.test.ts`,
  `bossBar.test.ts`, `bossMarker.test.ts`, `tools/checks/bossBarHiddenWiring.test.ts`.
- **`render/bossAnim.ts`**: racing beats `slamRacing` [0, 0.458, 0.75, 0.917], `chargeRacing` [0, 0.4, 0.7, 0.9]; slam hit
  flash 0.15 s: the release moments to sync with.

### Builder decisions (B-numbers; tell the reviewer)

- **B1 Decals in game code**: GD-R is the game's own `drawGroundDamage`, so the decals are baked by `bossAtlas.ts` at load
  (registered through `addGeneratedTexture`), not in the offline atlas; measure the bake (384² + 256², one-off) against
  9.15's long-task budget (≤ 6 ms slices or the worker): split it if needed.
- **B2 Unrotated decals** with 2–3 seeds per mark kind (attack id picks the seed).
- **B3 Rush dust** = 9.15's `rushTrail` (CL-A's own dust not added).
- **B4 CRASH mark**: `drawCrashMark` / `boss_mark_crash_a` kept for the fallback only.
- **B5 P1-G time bar** reads the same progress as the plate (`bossAtkKind` + the attack's progress in the HudModel: add the
  field if missing).

### Guardrails (AGENTS.md §5)

As 9.6. No sim change; timings from `world.balance.boss` and the server ticks; the late-join rule (progress keys on the
server tick, a late join never shows a finished ring) kept; the boss body's dim and `bodyTop` rules (9.15) kept.

### Testing

- Pure: the dial's lit tick count = floor(p × 72) (slam) / floor(p × 48) (throw), head angle at p, release at the hit
  tick; no ADD sprite outside 4.5 m / 3 m (except the 0.3 m bloom); CL front at the end exactly when the rush starts; BD
  burst angles all within ± 90° of outward and no visible puff past 4.2 m (sample `BOSS_DUST` bursts × seeds); dust depth
  < body < grit; decals rotation 0.
- Raster: `drawGroundDamage` crater: fractures end inside 3 m of the 6 m picture's centre; same light direction as the slam.
- Browser: every attack solo with the boss forced, at night and in a blackout; stills beside the cards (SD, TH, CL, CR, P1,
  GD, BD).

### Notes for the merge

- **Touches:** `render/BossView.ts`, `render/bossTelegraph.ts` (if needed), `render/bossDust.ts`,
  `render/city/bossAtlas.ts`, `render/city/groundDamageArt.ts`, `render/city/hudWarnArt.ts`, `scenes/BossHud.ts`,
  `scenes/GameScene.ts` (the decal rotation at :1981-1982: one line), `render/fx/atlas/boss.*`,
  `docs/art/photoreal-5/src/atlas/boss.atlas.ts`, tests, gallery, readability sheet, perf doc.
- **Overlaps:** 9.22 draws the stun icon over the boss from boss state (no BossView edit); 9.20 leaves `fx_dust_a` as is.
  `behemothArt.ts` / `bossRelit.ts` untouched (the body is 9.15's).
- **Net kinds:** 98–99 (none expected). **Readability sheet:** 192–201.

### References

- `docs/art/photoreal-decisions.md` (warnings, TH-R, GD answer, CR-R, BD-R, "Reco" 5, 8); `docs/art/photoreal-5/src/telegraphs*.ts`,
  `matter-r2*.ts` (BD-R); 9.15 story file (B8 crop, B11 dust texture, B12 timings); `.claude/skills/dead-city-model/fx.md`
  (FX 2 "warnings: readability first", FX 5 lessons).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
