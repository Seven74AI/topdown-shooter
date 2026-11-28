# Story 9.6: Effects foundation

Status: ready-for-dev

<!-- Written 2026-11-28 with gds-create-story from the real code, the approved group-5 page (docs/art/photoreal-5) and
     the correct-course sprint-change-proposal-2026-11-28-photoreal-fx.md. 9.6 keeps its key and becomes the foundation
     of the photoreal effects; the looks themselves are built in 9.16–9.22. -->

## Story

As a builder of the effects stories (and, through them, a player),
I want one way to get the approved effect pictures into the game, one low-effects switch, shared pooled parts and one
perf harness,
so that 9.16–9.22 can be built in parallel and every effect stays inside the phone budget.

## Designer decisions — the source of truth

- `docs/art/photoreal-decisions.md` › "FX (photoreal group 5)": every card picked (2026-11-28): MZ-A, SG-G, TR-G, HT-G,
  BL-G, BT-G, ML-A, CS-A (more blood), BF-G, EX1-G, EX2-A (grey shock ring), GR-R, MO-R, FI-R, FS-A, BX-G, AC-N, GA-M,
  EV-R, RD-G, PD-G, RN-G, BD-R, SD-A, TH-R (crater 6 m), CL-A, CR-R, P1-G, GD-R, ST-A.
- The designer's go (2026-11-28): "Reco" to writing the build story with gds-create-story; "use gds create story to
  create all the stories needed. And maybe a correct course before? As needed." → the split in
  `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-28-photoreal-fx.md`.
- **Proposal Q1 (open, recommendation followed):** the pictures are drawn offline from the approved page code and
  shipped as image atlases (9.14's way), not baked on the phone. If the designer picks B (bake at load), T1–T3 change to
  a worker bake (9.13's way); the rest of this story stands.

## What this story does NOT do

No visible change in the game: no look is swapped here. 9.16–9.22 each add their family's atlas page and switch their
views. Fog visuals, film grain, flashlight and floodlight light textures stay as today (not on the page; proposal Q6).

## Acceptance Criteria

1. **Offline FX atlas tool.** `npm run art:fx` (`tools/art/fx.ts`) finds every `docs/art/photoreal-5/src/atlas/*.atlas.ts`
   by glob (no shared list to edit: each family story adds one file), bundles it with esbuild (the page's
   `textureShim.ts` swap as in `build.mjs`), runs it in the preinstalled headless Chromium (9.14 B9: the page code uses
   `ctx.filter` blur, which node canvas lacks), and writes `apps/client/src/render/fx/atlas/<family>.webp` (lossless) +
   `<family>.json` (frames `{name: {x, y, w, h, ox, oy}}`, `sourcesHash` from the esbuild metafile inputs minus
   `node_modules` and `packages/shared` (9.14 B22), `imageSha`, the Chromium version). Deterministic for a given Chromium
   (seeded). Each atlas ≤ 2048 × 2048 and ≤ 2 MB; the tool fails if not. An atlas page exports
   `export const frames: Record<string, HTMLCanvasElement>` (names `fx_<family>_<name>_<variant>`, snake case) after
   awaiting the approved looks' own `bake()`.
2. **Drift check.** `tools/checks/fxAtlases.test.ts` globs the JSON files and fails when an atlas's `sourcesHash` or
   `imageSha` no longer matches (rebuilds the input list with esbuild, like `streetPropsAtlas.test.ts`), or a frame is
   over its atlas bounds. Proven here on a test fixture family under `tools/art/fx/fixture/` (not shipped).
3. **Loader and fallback.** `render/fx/fxAtlases.ts`: `import.meta.glob("./atlas/*.json", {eager: true})` + the matching
   `?url` WebP; the Boot scene starts every download in the background in `create()` (9.14 B26: never block the start).
   A landed image is drawn into a canvas registered through `addGeneratedTexture` (key `fx_<family>`, frames added from
   the JSON) so an Android wipe or lost context repaints it. API: `fxAtlasReady(scene, family): boolean` and
   `fxFrame(family, name)`. A view decides **once, when it is created for the run**, whether it uses the new look; a run
   whose family atlas has not landed draws today's effect for the whole run (no texture swapped mid-run, no blank
   effect). Failure: one `console.warn`, today's effects.
4. **One quality source.** `render/fx/fxQuality.ts`: `fxLow()` merges `urlOptions().lowFx` and the solo
   `soloUrlOptions(soloDev).lowFx` (today DustView and the rest read two different sources: GameScene.ts:693 / :874 vs
   :916), plus `halfCap(cap)`; and readers for Story 10.1's `rain` / `glow` settings (`RAIN_LEVEL_K`, `GLOW_LEVEL_K`,
   `settings.ts › getSettings / subscribeSettings`) so a change applies without a reload. Existing readers move to it
   (DustView, CityView, BurnView, FlameView, BossView, ZombieView caps, BeamSparkleView, FogView): same behaviour,
   tested.
5. **Shared kit.** `render/fx/fxKit.ts` (Phaser types only; pure parts in `fxKitCore.ts`):
   - `SpritePool(scene, cap, texture, depth, blend)`: images made up front or lazily up to the cap, `take()` reuses the
     oldest when full (no `Array.find` closure, no tween configs per event: today's `FxView.take()` and `tweens.add`
     allocate per event), `releaseAll()`, `live`;
   - `FX_WIND = (0.55, 0.32)` (`fireParticles.ts WIND_X / WIND_Y`: the street's one wind; the flare smoke's own
     (0.35, −0.3) goes in 9.20) and `KEY_LIGHT` upper-left (−0.55, −0.83) (`groundDamageArt.ts`);
   - `BLOOD` one palette (BL-A's dark red-brown; replaces `#5a0f0f`, `#8a1c1c`, `#4a0c0c`, `#8a1010` in 9.16);
   - a seeded `fxRand` (mulberry32, like `FxRandom`) for views (no `Math.random`);
   - `cropToOpaque` metadata in the atlas JSON (`ox, oy`) so additive sprites are drawn cropped (9.15 B8).
6. **Perf harness.** `?stress=150&stressstage=3&stressfx=1` (`debug/stressScenario.ts`, release-safe like `?stress`):
   the stage-3 rain wave, one bot-driven flamethrower and one grenade launcher firing at the crowd through the run
   (`stressFireInput` extended), every FX view on. `tools/perf/fxCompare.cjs` runs it on master and the branch at
   844 × 390 DPR 2, 1× and 4× CPU (CDP throttle), 3 rounds, and prints average FPS, frame-time p95 and the machine load
   (`uptime`, cores). `docs/perf/epic-9-fx.md` holds the method, the master baseline and a results table each later story
   appends to.
7. **Coverage hooks.** `gallery/collect.ts` loads every FX atlas found (after the image lands) and cuts its frames into the
   gallery; `tools/checks/galleryCoversAllArt.test.ts` covers `fx_*` atlases; `noUnregisteredTextures` green.
   `.claude/skills/dead-city-model/fx.md` gets an "FX 8. Into the game" section (atlas pages, frame names, the per-run
   fallback, caps and `fxLow()`).
8. **Budget.** No measurable change: `?stress=150` and the new harness within 2 FPS and +1 ms p95 of master at 1× and
   4× CPU (the loader only); first-load download change recorded (should be 0 here: no family atlas ships in 9.6).

## Tasks / Subtasks

- [ ] T1 `tools/art/fx.ts` + `package.json` script `art:fx`; the atlas page contract (AC 1); a fixture family.
- [ ] T2 `tools/checks/fxAtlases.test.ts` (AC 2).
- [ ] T3 `render/fx/fxAtlases.ts` + Boot hook (AC 3); test the per-run decision (ready at creation → new; landing later →
  next run) and the failure path with a fake loader.
- [ ] T4 `render/fx/fxQuality.ts` and the move of today's readers (AC 4); `settingsEffects.test.ts` still green.
- [ ] T5 `render/fx/fxKit.ts` / `fxKitCore.ts` (AC 5) + unit tests (pool reuse order, no allocation after warm-up:
  count objects across 10 000 `take()` calls).
- [ ] T6 `?stressfx=1`, `tools/perf/fxCompare.cjs`, `docs/perf/epic-9-fx.md` with the master baseline (AC 6).
- [ ] T7 Gallery hook, skill section, readability-sheet items 153–155 only if something visible is added (else none).

## Dev Notes

### The code today (read before touching)

- **Atlases are code-drawn at load**: `render/city/spriteAtlas.ts › ensureAtlases` (`atlas_fx`: rain, splash, glow,
  dust, grit, ash, spit glob, acid puddles, gas clouds; `drawFxFrame` :297-405; `register` :413 → `addGeneratedTexture`,
  `canvasTexture.ts:36`), `city/blastFxAtlas.ts › ensureBlastFxAtlas` (`atlas_blastfx`), `city/fireFxAtlas.ts ›
  ensureFireFxAtlas` (`atlas_firefx`), `city/throwArt.ts › ensureThrowFxAtlas` (`atlas_throwfx`), `city/eventArt.ts ›
  ensureEventTextures` (`event_atlas`), `city/bossAtlas.ts › ensureBossTextures`. These stay: they are the fallback.
- **9.14's image path to mirror**: `tools/art/streetProps.ts` (esbuild + Chromium, ~4 s), `render/city/streetProps.webp`
  + `streetProps.json` (`sourcesHash`, `imageSha`), `tools/checks/streetPropsAtlas.test.ts`, the Boot download
  (B24–B26: start in `create()`, never wait; the city view rebuilds `atlas_downtown` once per run from the landed image:
  remove, unregister, release the code canvas, `addGeneratedTexture`).
- **The page's bake contract** (`docs/art/photoreal-5/src/kit.ts`, `fx5.ts`): each `Look` has `bake()` (textures once)
  and `draw(t, stage)` (composes sprites only). `build.mjs` swaps `render/city/canvasTexture.ts` for `textureShim.ts`.
  The atlas pages import the picked looks' bake and read their canvases; `draw()` is what each family story re-creates
  with pooled Phaser sprites.
- **`?fx=low`**: `debug/urlOptions.ts:116/:230` (`lowFx`); consumers GameScene.ts:861 (BeamSparkleView), :870 (FogView),
  :874 (DustView via `opts`), :888 (BurnView), :889 (FlameView), :916 (CityView), ZombieView.ts:202, BossView.ts:256 /
  :276 / :674. **Ignored by** FxView, ProjectileView, BloodTrailView, ExplosionView, GrenadeView, MolotovView (always
  low: MolotovView.ts:34), BloaterView, AcidView, EventView, EventPickupsView, PlaceFxView, CityView rain splashes. Each
  family story fixes its own; 9.6 gives the one accessor.
- **10.1 settings**: `packages/shared/src/config/playerSettings.ts:16-79` (`rain`, `fog`, `glow`, `filmGrain` hidden,
  `gore` hidden; `RAIN_LEVEL_K`, `GLOW_LEVEL_K`); client `settings/settings.ts` :58 / :90; readers CityView.ts:314 /
  :386 / :418, FogView.ts:246 / :344. There is no generic "effects" setting; don't add one (not asked).
- **Stress**: `debug/stressScenario.ts` (`?stress=N`, `?stressstage`, `?stressfire=1` :184-232, the 60 s measurement and
  report :234-338), `docs/perf/epic-1-stress.md`, `docs/perf/epic-10-fps.md` (10.2's frame-rate script).

### Builder decisions (B-numbers; tell the reviewer)

- **B1 Atlases offline** (proposal Q1 A): exact approved pixels, no phone bake, no worker. If Q1 = B, swap T1–T3 for a
  worker bake and keep AC 4–8.
- **B2 Per-run switch**: a view picks new vs today's look at creation (9.14 B26), so no live texture changes under
  pooled sprites.
- **B3 One family per story** (correct-course CC-B4): `gunfire` 9.16, `fire` 9.17, `molotov` 9.18, `matter` 9.19,
  `ambient` 9.20, `boss` 9.21, `status` 9.22. A story never edits another family's atlas page.
- **B4 Today's FX code stays** as the fallback until Epic 10 decides otherwise; each family story keeps its old path
  behind the switch and tests both.
- **B5 New caps** go into `controls.json › fx` with schema ranges (`balanceSchema.ts › fxSchema` :578-616, `.strict()`);
  any new key changes `balance.version` (9.13 B28): re-pin golden world digests (e.g. `carCorner.test.ts`) and say so.

### Guardrails (AGENTS.md §5)

- Every code texture through `addGeneratedTexture`; `tools/checks/noUnregisteredTextures.test.ts`; every `ensure…()`
  covered by the gallery.
- No per-frame / per-tick allocation; deterministic (no `Math.random`); pools; timers in ticks in the sim (none here).
- Phaser 4 ≠ 3: check `node_modules/phaser/types` (`setTint` + `setTintMode`, `BlendModes.ADD`); reset state in
  `create` (scene restart reuses objects).
- No gameplay numbers inline in sim code; visual numbers in client config, not the balance JSON (9.15 B5), except caps.
- Builders never run `npm run dev` (own ports, Vite config merged with a `/api` proxy; PID-only kills); `gate:fast` +
  touched slow tests; CI is the full gate. Exact version pins.
- Verify in a real browser (Playwright + preinstalled Chromium); say what wasn't verified.

### Testing

- Unit: the tool's frame packing (pure part), the drift check on the fixture, the loader's per-run decision, `fxLow()`
  merging, the pool's reuse order and zero allocation after warm-up.
- Browser: Boot with the fixture atlas: the download starts, the title shows at once, a run after landing reports
  `fxAtlasReady`; a run before landing uses today's look; `window.__game.loop.sleep()/wake()` (hidden tab) keeps the
  texture.
- Perf: the harness's master baseline at 1× and 4× (3 rounds), machine load recorded.

### Notes for the merge

- **Touches:** `tools/art/fx.ts` (new), `tools/art/fx/fixture/*` (new), `tools/checks/fxAtlases.test.ts` (new),
  `tools/perf/fxCompare.cjs` (new), `apps/client/src/render/fx/{fxAtlases,fxQuality,fxKit,fxKitCore}.ts` (new),
  `scenes/BootScene.ts` (download hook, a few lines), `scenes/GameScene.ts` (`fxLow()` instead of the two `lowFx`
  sources: one-line changes at :693, :861, :870, :874, :888, :889, :916), `debug/stressScenario.ts`,
  `gallery/collect.ts`, `tools/checks/galleryCoversAllArt.test.ts`, `package.json` (script), `docs/perf/epic-9-fx.md`,
  `.claude/skills/dead-city-model/fx.md`.
- **Every later story rebases on this.** 9.18's sim part and 9.22's status model don't need it.
- **Net kinds:** 85–86 (none expected). **Readability sheet:** 153–155.

### References

- `docs/art/photoreal-decisions.md` (FX group 5); `docs/art/photoreal-5/src/{build.mjs,kit.ts,fx5.ts,textureShim.ts}`;
  `.claude/skills/dead-city-model/SKILL.md` §7 and `fx.md`; `_bmad-output/implementation-artifacts/9-14-photoreal-street-props-in-game.md`
  (B1, B9, B22, B24–B26); `9-13-…` (B19 caps, B28 balance.version); `9-15-…` (B5, B8);
  `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-28-photoreal-fx.md`.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
