# Story 5.26: Build-bar icons

Status: review

(Added 2026-11-23 from the 5.16 session. Designer picks: `docs/epic-5-decisions.md` › Build-bar icons. Code drawings: `docs/art/5-16/icons/index.html`, claude.ai/artifact/7kKW2xQre8zUWQZri7tWg3. Builds on Story 5.16 (`scenes/buildBar.ts`, `HudScene` build bar) and the icon-bake pattern of Story 5.11 (`render/city/gearIcons.ts` / `itemIcons.ts`).)

## Story

As a player,
I want each building tile in the build bar to show a clear, recognisable icon,
so that I pick the right building at a glance.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) applies in full. Most relevant here: **12** (atlased, `category_name_variant`, ≤ 2048²), **20** (every code-drawn texture through `addGeneratedTexture`, redraw tested), **10** (no per-frame allocation), **9** (mutate each new test once), **18** (say what was not verified), **19** (merge notes). Nothing is simulated: no message, schema, server, shared, mirror or Predictor change (brief 2: no copies touched); 0 B/s (brief 11).

## Acceptance Criteria

1. **Icons, the designer's picks.** The build bar's tiles show code-drawn icons in style **I1** (low three-quarter tilted objects), ported from `docs/art/5-16/icons/index.html` with the same shapes, colours and proportions: wood barricade **I1**, spike trap **I1**, auto-turret **T1** sentry gun, mine **M1** pressure mine. **T2** armoured dome is drawn and baked too, kept for a later turret tier or skin (no building type maps to it).
2. **One HUD atlas, registered.** The icons are baked once per game into one atlas texture `hud_build`, frames `icon_build_<name>_<variant>` (`icon_build_barricade_a`, `_spiketrap_a`, `_turret_a` (T1), `_turret_b` (T2), `_mine_a`), ≤ 2048², through `addGeneratedTexture` (repainted by the texture registry after a lost context; `tools/checks/noUnregisteredTextures.test.ts` passes).
3. **Crisp at 56 px tiles on dpr 2–3.** Each icon sits in the mockup's 44 × 30 CSS px box (clip margins 2 px left/right, 4 px above, 2 px below: a 48 × 36 CSS px frame), centred on the tile's icon anchor; the bake is 1:1 with screen pixels at the game's render dpr (`MAX_DPR` = 2; dpr 3 renders at 2).
4. **Fallback.** A building type with no icon (Story 5.10's floodlight and med station, a later bear trap, upgrade-only tiers) shows its world art exactly as in 5.16 (the `atlas_buildings` frame, else the turret / plank Graphics).
5. **States unchanged.** Affordable / unaffordable (40 % + red price) / cap (40 % + red count) look and rules are 5.16's; the icon dims with its tile.
6. **No per-frame work.** Icons are set only when the slots change (`placeBarSlots`), as in 5.16; no allocation per frame.
7. **Browser shots** at 800 × 360 and 568 × 320, dpr 2 and 3, affordable / unaffordable / cap, in `docs/art/5-26/`.

## Tasks / Subtasks

- [x] **T1 Icons module** (`render/city/buildIcons.ts`, new): the five drawings (port), `BUILD_ICONS` (frame → drawing), `buildIconFrame(type)` (type → frame or null; own-property lookup), `buildIconsLayout()` (pure), `paintBuildIcon` (scale, box offset, clip, save/restore), `ensureBuildIcons(scene, makeCanvas?)` via `addGeneratedTexture`. (AC 1–3)
- [x] **T2 HUD** (`HudScene`): `ensureBuildIcons` in `create`; `placeBarSlots` tries `buildIconFrame` first (texture, origin = box centre, 48 × 36 CSS px × dpr), else the 5.16 path (origin reset to 0.5); `drawBuildBar`'s Image-vs-Graphics visibility uses `hasBarImage` (icon or world-art frame). (AC 3–6)
- [x] **T3 Tests** (`buildIcons.test.ts`, new): every shop building has its icon; fallback types / prototype keys → null; T2 baked, unmapped; frame names, gaps, ≤ 2048²; frame = box + margins, origin = box centre; each drawing inside its frame clip, ≥ 60 % box width / ≥ 50 % height; bake via `addGeneratedTexture`, idempotent, repainted by `textureRegistry.rebuildAll()`. `recordCanvas.ts`: unrotated ellipses get their exact box (was a circle of the larger radius). (AC 1–3, brief 9, 20)
- [x] **T4 Browser shots + record** (`docs/art/5-26/`), gate, Dev Agent Record, status `review`. (AC 7)

## Dev Notes

- The mockup's `tile()` draws each icon at `translate((56 − 44)/2, 21 − 15)` with the clip `rect(−2, −4, 48, 36)`; the HUD keeps 5.16's icon anchor (`TILE_ICON_Y_PX` = 22, 1 px lower than the mockup's 21) so the price line and the fallback art are unchanged.
- The mockup's line widths scale with the box (`w × 0.02` ≈ 0.9 CSS px), what the designer approved at phone size; kept as drawn.
- `roundRect` (T1's gun body) is replaced by an `arcTo` path (older Safari lacks `CanvasRenderingContext2D.roundRect`).
- Bake scale: 5.11 bakes gear icons at 96 px for "dpr 3", but the game clamps its render dpr to `MAX_DPR` = 2 (`display.ts`), so a ×3 bake would always be downscaled 1.5×. `BUILD_ICON_BAKE_SCALE = MAX_DPR` gives 1:1 pixels (atlas 496 × 72).

### Notes for the merge

- **`HudScene.ts`** (Story 5.18 and 5.10 touch it): this story changes only (a) one import line, (b) `ensureBuildIcons(this)` next to `ensureBuildingsAtlas(this)` in `create`, (c) the `framed` line in `drawBuildBar` (`hasBarImage(...)` instead of `buildingFrame(...) !== null`), (d) the icon branch at the top of the per-item block in `placeBarSlots` (icon first, then the unchanged world-art branch with `.setOrigin(0.5)` added), (e) the `hasBarImage` helper at the end of the file. Money/count, state key, tile looks and placement code are untouched: on a conflict with 5.18, keep 5.18's lines and re-apply (c)/(d).
- **Story 5.10** (floodlight, med station): nothing to do; they have no `buildIconFrame` entry, so they show their world art. When the designer asks for their I1 icons: add a drawing to `BUILD_ICONS` and a line to `TYPE_FRAMES` in `buildIcons.ts`.
- **`recordCanvas.ts`** (test helper): `ellipse` now records an unrotated ellipse's exact box; `objectArt.test.ts` (its other user) passes unchanged.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, 2026-11-23). Baseline: `3bbb955` (master with 5.16 and 5.17 merged).

### Debug Log References

- Browser (`docs/art/5-26/shots.cjs`, `require('playwright')`, headless Chromium, `isMobile` + `hasTouch`, Vite on port 5426 stopped by PID; solo practice `?solo&zdmg=0`): 800 × 360 and 568 × 320 at dpr 2 and 3 with `?wallet=5000` (all affordable) and `?wallet=100` (turret short: alpha 0.4, red `$250`); cap: six mines placed via the HUD's tile and confirm handlers (walking between) → "6/6" red, all tiles 0.4. Every visible icon reported as `hud_build:icon_build_<name>_a`, 96 × 72 canvas px. No page errors or console errors.
- First shot run showed the icon at 96 × 72 on dpr 3 too: the render dpr is clamped to 2, so the ×3 bake was changed to `MAX_DPR` (1:1).
- First cap run stopped at 4–5 mines (placements too close together were refused); the script now walks 600 ms between mines in a cycle of directions.

### Completion Notes List

- New `render/city/buildIcons.ts`: I1 barricade, I1 spike trap, T1 sentry gun, T2 armoured dome (kept), M1 pressure mine; atlas `hud_build` (5 frames of 96 × 72, 496 × 72) through `addGeneratedTexture`; `buildIconFrame(type)` maps wood_barricade / spike_trap / auto_turret / mine.
- `HudScene`: icon first, world art as fallback; states unchanged; still drawn only on slot change.
- **Tests**: `buildIcons.test.ts` (7). **Mutations** (one per test, all **killed**): auto_turret → T2 (2 tests fail), lookup without the own-property check (`toString` → fails), no frame gap, pad top 4 → 3, no clip in `paintBuildIcon`, drawing at half box size, bake through a direct unregistered `addCanvas` (registry repaint test fails).
- **Full gate** on `story-5-26`: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **260 files passed / 1 skipped, 2,156 tests passed / 3 skipped**; build OK. Load average 3.4 at the end (4-core container, this builder alone).
- **Not verified**: a real phone (headless Chromium only, dpr 3 is emulated and rendered at 2); a real WebGL context loss in the browser with the icon atlas (unit-tested through `textureRegistry.rebuildAll()` with a recording canvas, not reproduced with `reproduce-context-loss.cjs`); online play (no server started; the change is HUD drawing only); the fallback path with a real 5.10 type (5.10 not merged; covered by `buildIconFrame` → null and the unchanged 5.16 branch); More ▸ paging (only 4 types).

### File List

- `_bmad-output/implementation-artifacts/5-26-build-bar-icons.md` (new), `sprint-status.yaml`
- `apps/client/src/render/city/buildIcons.ts` (new), `buildIcons.test.ts` (new), `recordCanvas.ts`
- `apps/client/src/scenes/HudScene.ts`
- `docs/art/5-26/` (new): `README.md`, `shots.cjs`, 12 screenshots

### Change Log

- 2026-11-23: Story created and built (I1/T1/T2/M1 icons, `hud_build` atlas, HUD lookup with world-art fallback). Status → review.
