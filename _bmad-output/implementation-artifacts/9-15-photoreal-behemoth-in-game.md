# Story 9.15: Photoreal Behemoth in game

Status: in-progress

<!-- Written 2026-11-26 by the 9.15 builder (gds-create-story) from the real code, the approved proposal
     (docs/art/photoreal-4) and the parent session's brief. Epic 9 is photoreal; the Behemoth part of 9.4 moved here. -->

## Story

As a player fighting the Behemoth (wave 10),
I want the boss drawn in the approved photoreal "one model" look, alive (breathing, sheen, a heartbeat glow when
enraged) and acting out each attack with its pose, glow, eyes and dust coordinated on one timeline,
so that I read every attack earlier and feel its weight, and see at a glance when it is enraged, helpless or dead.

## Designer decisions (2026-11-26) — the source of truth

`docs/art/photoreal-decisions.md`, row "Behemoth (group 4)": **take C, G2 A, G3 E2, G4 A** ("Take C / G2 A / G3 E2 / G4 A"),
and "ok" to the whole **action plan** (`docs/art/photoreal-4/src/boss4.ts › PLAN` + `RULES`).

- **Take C** = `docs/art/photoreal-4/src/behemoth5.ts` (one model: "a body that grew too fast for its skin"; muscle
  masses, splits fed by veins, clothes torn where the body burst out, concrete in the front of the shoulders, grit in
  the knuckles, per-look identity BH1–BH4). Pose geometry, frame size, poses, outline + eyes frames, warnings and
  tells unchanged.
- **G2 A**: show the charge and throw poses during their warnings, by progress.
- **G3 E2**: enraged body frames; the vein + split glow (from the magenta marker, as `boss4.ts › markerPulse`) is its
  own additive layer, the eye glow another; in the game the vein glow pulses on the heartbeat, enraged eyes never
  below 75 % (`EYE_FLOOR`).
- **G4 A**: idle breathing and sheen like the zombies (Story 9.13).
- **Action plan**: per action its goal, its real length (balance `boss.json`) and each part's job (see AC 6).
- **Bug fixes** found in the decomposition: walk frames baked at phases 0 / 0.5 (identical: `sin` swing is 0 at both)
  → 0.25 / 0.75; death frames' `shade(skin, -0.3k)` returns `rgb()` which `shade()` can't read → black head and spine
  (take C converts to hex with `hexOf`).

## Acceptance Criteria

1. **Take C in the game.** `render/city/behemothArt.ts` draws `behemoth5.ts`'s model (the page-only `setHighlight`
   inspector dropped). `BH_R_M`, `BH_FRAME_HALF_M`, `BOSS_FRAME_PX = 252`, `BOSS_PX_PER_M = 36`, every pose's geometry,
   the outline + eyes frames and every telegraph / lane / ring / CRASH / HUD warning are unchanged. A side-by-side
   still against `docs/art/photoreal-4/compare.html` (take C column) reads as the same model.
2. **Relit like the characters (9.13).** The body frames are relit with `charRelight.ts › relightCharSteps` (×2
   supersampled, the page's volume scale `RF = 0.7`, seed `901 + look × 7`) in a Web Worker (main-thread resumable
   fallback under `BAKE_MS_PER_FRAME`), the plain take C drawing showing first and the relit pictures replacing it as
   they land (one sheet upload per frame, landing at most half the frame budget); no blank frame ever (a frame not
   landed shows its plain picture); every sheet ≤ 2048²; kept pictures as pixels with a sentinel restore check, layers
   re-baked after a lost context (9.13 B18 / B26).
3. **Bug fixes, tested.** (a) `walk_a` / `walk_b` baked at phases 0.25 / 0.75 and a test proves the two pictures
   differ (and differ only around the arms); (b) the death frames have no black head / spine: a test reads the head
   and spine pixels of `dead_a…c` and finds skin colour, and `hexOf(shade(...))` round-trips.
4. **G2 A.** During a charge warning the body shows `charge_b` (new, `charge` k 0.5) for the first half of the
   telegraph and `charge_a` (k 1) for the second; during a throw lift `throw_b` (new, `throw` k 0.5) then `throw_a`.
   By the start-tick progress (`telegraphProgress`), like the slam's three frames.
5. **G3 E2 enraged frames.** Every pose except death has an enraged frame (skin `#7d6a5e`, marker cores); its vein +
   split glow is its own additive picture (marker pixels → dark red in the relit body, a red glow with a soft halo as
   an ADD layer); the eye glow is another ADD layer. While enraged the vein layer pulses on the heartbeat (whole-layer
   alpha; the travelling wave is optional — say which), eyes never below 75 % when enraged.
6. **The action plan** (`PLAN`, `RULES`), from the balance timings (`boss.json`) and a client visual config (no
   inline numbers; not in the balance JSON, so `balance.version` does not change):
   - **Walk**: breath rides the steps (dip ~1 % at each footfall, rise through the step); enraged beat on every 3rd
     footfall (≈ 1.15 s); standing still, the beat keeps the 1.2 s clock.
   - **Slam**: breath held through the warning, the heart races (beats at 0, 0.55, 0.9, 1.1 s of the 1.2 s warning,
     i.e. at those fractions of `slam.telegraphS`), glow building 0.4 → 0.8, eyes 75 → 100 %; on the hit everything
     peaks together (glow, eyes, dust puff from the fists, grit off the shoulders after it) then exhales back over
     `slam.recoverS`.
   - **Charge + stun**: breath held, the heart races through the warning, eyes 100 %, steady 60 % glow through the
     rush with a dust trail; crash burst; stun: vein glow OFF, eyes 30 %, slow heavy breaths.
   - **Throw**: normal beat during the lift, a beat ON the release, crumbs falling from the chunk while lifted.
   - **Roar**: eyes snap red at 0.3 s, veins light and the skin crossfades calm → enraged over 0.3–1.5 s
     (`enrage.roarS`), roar dust 0.3–0.8 s, big inhale 0–0.3 s.
   - **Death**: a last weak beat, glow out by 0.4 s, eyes out first, big dust puff as it hits the ground (2nd half of
     `death.collapseS`).
   - Dust FX are pooled sprites from a code texture through `addGeneratedTexture`; deterministic (no `Math.random`).
   - The view never touches the simulation (no sim, net, balance or digest change).
7. **G4 A idle.** Breathing on every non-dead state as the plan says; the sheen drifts over glossy parts on the walk
   frames (9.13's `sheenStep`); additive layers (eyes, veins, sheen, dust) are never tinted by the hit flash; every
   layer dims with the body (`bossBodyAlpha`, `BOSS_DIM_ALPHA` while a zombie is under it), goes above the lane / ring
   with `bodyTop`, and is hidden in the dead state except the death glow / puff.
8. **Checks.** Gallery covers every new texture (`ensure…` builders, the relit sheet baked on the spot); readability
   sheet: Behemoth pictures retaken (new items from 147 up); `noUnregisteredTextures` green; no per-frame allocation;
   `?stress=150` within 2 FPS and +1 ms p95 of master, plus a wave-10 boss scene measurement, machine load recorded.

## Tasks / Subtasks

- [ ] T1 Art (AC 1, 3): port `behemoth5.ts` into `behemothArt.ts` (no inspector; `GLOW_MARKER` exported; `hexOf`);
  export the eye positions per pose (`behemothEyes(pose, k)`) for the eye layer; an option to draw a body frame without
  the eye glow halo (the eye layer draws it); outline frames unchanged.
- [ ] T2 Frames (AC 2, 4, 5): `bossAtlas.ts › POSE_FRAMES` walk phases 0.25 / 0.75, new `charge_b`, `throw_b`; the
  plain atlas keeps 16 body frames per look (4 × 16 = 64 = 8 × 8 in 2048²) — the two outline frames per look move to
  their own small texture `boss_outline` (8 frames).
- [ ] T3 Bake (AC 2, 5): `render/city/bossFrames.ts` (pure, worker-safe: the relit frame list of one look, `bakeSteps`:
  draw ×2 → marker → relight → vein glow + sheen), `bossBakeWorker.ts`, `bossRelit.ts` (one sheet `boss_relit` for the
  look in play, kept pixels, pump, worker timeout / fallback, restore registration, landed set per look).
- [ ] T4 View (AC 4–7): `BossView` frame choice by progress for charge / throw; a second body image for the roar
  crossfade; layers (eyes ×2, veins, sheen) pooled; `bossAnim.ts` (pure: breath, beat scheduler, eye / glow levels per
  state and time; the visual config); dust pool (`bossDust.ts`, pure state + one Graphics-free sprite pool).
- [ ] T5 Tests: art (walk frames differ, death colours), frames list (no blank frame, sheet ≤ 2048²), anim levels per
  plan moment, beat on every 3rd footfall, dust determinism, bake pump (worker fallback, restore), wiring check.
- [ ] T6 Gallery, readability sheet, stills of every action in the game in `docs/art/9-15/`, perf note
  `docs/perf/epic-9-behemoth.md`, decisions doc and skill updated.

## Dev Notes

### The code today (read before touching)

- `render/city/behemothArt.ts` (366 lines): today's drawing on `bruteArt.ts › artKit`; `drawBehemoth(c, pxPerM,
  variant, pose | "outline", k, enraged, ph)`; poses walk / slam / slamHit / charge / rush / throw / stun / roar / dead;
  `BEHEMOTH_LOOK_IDS`, `BH_R_M = 2`, `BH_FRAME_HALF_M = 3.5`. Its death skin is `shade(skin, -0.3 * k)` → `rgb()`
  (the black-head bug). `docs/art/photoreal-4/src/behemoth4.ts` is a copy of it with take B's switches.
- `render/city/bossAtlas.ts`: `BOSS_ATLAS` (4 looks × 16 frames, `POSE_FRAMES` with walk phases 0 / 0.5 — the
  identical-walk bug), `BOSS_FRAME` indices, `BOSS_FX` (crack, chunks, crater, CRASH), `BOSS_TELE` (slam disc),
  `BOSS_RING`, `BOSS_LANE`; all through `addGeneratedTexture`. Plain canvas, not relit. `ensureBossTextures` is called
  by `BossView`, `BossHud` and the gallery (`gallery/collect.ts:54`).
- `render/BossView.ts`: one `body` image (depth 6.2), `bodyTop` (above its own lane / ring in the light), `outline`
  (above the darkness), the slam telegraph, lane, ring, decals, rings FX (`fxG`). Frame choice (`update`): walk by
  distance (`WALK_STEP_M = 0.65`), slam by progress, `slamHit` 0.5 s in RECOVER, stun, roar, rush; **charge and throw
  warnings hold the walk frame** (G2). Death: `drawDead` (3 frames over `death.collapseS`, DEAD_TINT). Hit flash =
  `setTint(HIT_TINT)` 0.08 s. Dim: `bossBodyAlpha` toward `BOSS_DIM_ALPHA` 0.55 while a drawn zombie is under it.
- Sim facts the view relies on: ROAR lasts `enrage.roarS` with `enraged = false` until its end
  (`shared/src/boss/enrage.ts`); the throw releases at `hitTick − flightS × 20` (`onRing`); the look is
  `behemothLookIndex(seed, number, prev)` set at arrival (`shared/src/boss/behemoth.ts:180`), from the run seed.
- 9.13's pipeline to mirror: `charRelight.ts` (`relightCharSteps`, `sheenStrip`, `sheenStep`, `rowBoxBlurSteps`),
  `charactersBakeWorker.ts` (pooled OffscreenCanvas, pixels posted back), `charactersAtlas.ts` (kept pixels, sentinel,
  pump with landing budget and one upload per frame, worker timeout 20 s, frozen tab, generations, restore
  registration via `textureRegistry`).

### Builder decisions (B-numbers; tell the reviewer)

- **B1 One look baked.** Only one Behemoth is on the street at a time; its look comes from the run seed. The relit
  sheet holds the look in play only (predicted from the run seed for the next Behemoth: `behemothLookIndex`; a wrong
  or missing prediction re-bakes at arrival). The bake starts after the characters' bake is done (or a fallback
  delay), long before wave 10; until it lands the plain take C frames show (no blank frame).
- **B2 Sheets.** Plain `boss_atlas`: 4 looks × 16 body frames (14 + `charge_b`, `throw_b`) = 64 = 8 × 8 at 252 px in
  2048²; the 8 outline frames move to `boss_outline`. Relit `boss_relit` (one look): 16 calm + 13 enraged bodies + 13
  vein glows + 1 death glow + sheen strips for the four walk frames (calm / enraged), ≤ 2048².
- **B3 Eyes as sprites.** The body frames are baked with the eye cores but no eye halo; the eye glow (core + halo) is
  two pooled ADD sprites at the pose's eye positions (`behemothEyes`), so the plan's eye levels (30 % stunned, out at
  death, snap red at the roar) are exact. The outline frames keep their own eyes.
- **B4 Vein glow.** One glow picture per enraged frame (whole-layer alpha on the beat). The travelling wave is not
  baked (8 steps × 13 frames ≈ 26 MB): reported as not done unless memory allows a cheap version.
- **B5 Visual config.** Every animation number (breath amplitude and timings, beat times, glow / eye levels, dust
  counts and lives) lives in `render/bossAnim.ts › BOSS_ANIM`; durations of the actions come from `world.balance.boss`.
  Not in `boss.json`: a balance change would change `balance.version` (9.13 B28) for numbers that never touch play.
- **B6 Sheen on the walk frames only** (the idle state; the attacks are short and show no sheen).

### Guardrails (AGENTS.md § 5)

- Every code texture through `addGeneratedTexture`; `tools/checks/noUnregisteredTextures.test.ts`.
- No per-frame / per-tick allocation in the view; deterministic (no `Math.random`); pools.
- Phaser 4: `setTint` + `setTintMode`, `BlendModes.ADD` = 1 (the view imports types only); objects reset in `create`.
- No gameplay change: no sim, server, net, balance or world digest change.
- Builders never run `npm run dev` (own ports, PID-only kills); `gate:fast` + touched slow tests, not the full gate.
- Readability sheet numbers: master's last item is 146 → new items from **147**.

### Testing

- Raster tests run in vitest with the node canvas used by the 9.13 raster tests (`charRelight.raster.test.ts`).
- Browser check (Playwright, preinstalled Chromium, own Vite port + `/api` proxy): every action in a solo run with
  the boss forced (`?boss` debug or the test boss), stills into `docs/art/9-15/`.

### References

- `docs/art/photoreal-decisions.md` (Behemoth row); `.claude/skills/dead-city-model/SKILL.md` §§ 4–7;
  `docs/art/photoreal-4/src/{behemoth5,boss4}.ts`; `_bmad-output/implementation-artifacts/9-13-photoreal-characters-in-game.md`
  (B17–B28); `packages/shared/src/config/balance/boss.json`; `apps/client/src/render/{BossView,bossTelegraph}.ts`.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
