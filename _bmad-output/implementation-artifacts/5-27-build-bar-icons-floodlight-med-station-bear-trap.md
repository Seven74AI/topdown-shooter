# Story 5.27: Build-bar icons for the floodlight, med station and bear trap

Status: review

(Added 2026-11-23: designer approved I1-style icons in the build-icons session; page claude.ai/artifact/32iPpVeANTX8ipBPGk4Vqf, code `docs/art/5-27/icons.html` › `floodlightFL1`, `medStationMS10`, `bearTrapBT1`. Builds on Story 5.26, `render/city/buildIcons.ts`.)

## Story

As a player,
I want every building tile in the build bar to show the same kind of tilted icon,
so that the bar reads as one set.

> EPIC 5 BRIEF applies; most relevant: **12** (atlas ≤ 2048², `category_name_variant`), **20** (through `addGeneratedTexture`), **9** (mutate each new test once), **18** (say what was not verified). HUD drawing only: no message, schema, server or shared change; 0 B/s.

## Acceptance Criteria

1. The three drawings are ported into `render/city/buildIcons.ts` in the same `(g, w, h)` form, 44 × 30 box, I1 palette: same shapes, colours and proportions as `icons.html`.
2. Baked into the `hud_build` atlas as `icon_build_floodlight_a`, `icon_build_medstation_a`, `icon_build_beartrap_a` (8 frames, 796 × 72, ≤ 2048²), still through `addGeneratedTexture`.
3. Mapped in `TYPE_FRAMES`: `floodlight`, `med_station`, `bear_trap` (the bear trap maps harmlessly until Story 5.14 adds the type).
4. The 5.26 test asserts every shop building has an icon (with `?shopall` / dev balance: the floodlight too).
5. Screenshots with `?shopall=1` at 800 × 360 and 568 × 320 in `docs/art/5-27/`.

## Tasks / Subtasks

- [x] **T1 Port** `floodlightFL1`, `medStationMS10` (+ helpers `box3`, `cross`, `handlePath`), `bearTrapBT1` into `buildIcons.ts`; append to `BUILD_ICONS`, map in `TYPE_FRAMES`. (AC 1–3)
- [x] **T2 Tests** (`buildIcons.test.ts`): every shop building (bundled and `loadDevBalance({ shopAll: true })`) has an icon; every mapped frame (incl. `bear_trap`) is baked; the 7 type → frame pins; the fallback test keeps upgrade tiers / unknown / prototype keys → null. The existing bounds test now covers the three new drawings. (AC 4)
- [x] **T3 Shots** (`docs/art/5-27/shots.cjs`, `README.md`, 8 PNGs), gate, record. (AC 5)

## Dev Notes

- Port is line-for-line; only TS-isms: the medkit handle (drawn twice in the page) is one `handlePath` helper, the tooth's `ix` inlined, the chain link rotation hoisted. No `roundRect` (uses the existing `arcTo` path).
- `HudScene.ts` untouched (Story 5.18 is changing it in parallel): 5.26's icon branch already picks up any type with a `buildIconFrame`, so the fallback world-art path is no longer used by any shop building (it stays for upgrade-only tiers).
- 5.26 review "Low: fallback tiles at 28 × 28 vs 48 × 36" is resolved for the floodlight and med station.

### Notes for the merge

- Touches only `buildIcons.ts` and its test. If Story 5.14 lands first with a different type id than `bear_trap`, change the one `TYPE_FRAMES` line; the test's `"bear_trap"` literal pins the mapping.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, 2026-11-23). Baseline: `3dab0ac`.

### Debug Log References

- Browser: `docs/art/5-27/shots.cjs` (preinstalled Playwright, headless Chromium, `isMobile` + `hasTouch`, Vite on port 5427 stopped by PID), `?solo&zdmg=0&shopall=1&wallet=5000|100` at 800 × 360 and 568 × 320, dpr 2. Bar items: wood_barricade, auto_turret, spike_trap, mine, floodlight, med_station; every visible icon `hud_build:icon_build_<name>_a@96x72`; `wallet=100` → turret and med station alpha 0.4. No page or console errors.

### Completion Notes List

- **Mutations** (one per new/changed test check, all **killed** after one fix): no floodlight mapping → killed; no med_station mapping → killed; bear trap not baked → **survived** at first (bear_trap is not a shop building yet), test now also checks `bear_trap`'s frame is baked → killed; lookup without own-property check → killed; med station drawn at half size → killed (bounds test); bear-trap stake moved outside the frame → killed (bounds test).
- **Full gate** on `story-5-27`: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **268 files passed / 1 skipped, 2,207 tests passed / 3 skipped**; build OK. (A colyseus "Max payload size exceeded" log line during the server tests is an expected-refusal test log, not a failure.)
- **Not verified**: the bear trap in the real bar (type arrives with 5.14; unit-tested bake + mapping only, designer's render in `icons.html`); dpr 3 and a real phone (headless dpr 2 only); real WebGL context loss (registry repaint unit test, unchanged path); cap state not re-shot (rules unchanged from 5.26).

### File List

- `apps/client/src/render/city/buildIcons.ts`, `buildIcons.test.ts`
- `_bmad-output/implementation-artifacts/5-27-build-bar-icons-floodlight-med-station-bear-trap.md` (new), `sprint-status.yaml`
- `docs/art/5-27/`: `shots.cjs`, `README.md`, 8 screenshots (new)

### Change Log

- 2026-11-23: Story built (FL1, MS10, B-T1 icons baked and mapped). Status → review.
