# Story 9.12: Bodies behind walls

Status: done

## Story

As a player,
I want to see zombies and teammates standing behind a standing wall,
so that a barricade never hides a threat or a friend.

Recorded after the fact (2026-11-25): designer pick C ("silhouette") of six options on `docs/art/occlusion/compare.html`; colour confirmed on `docs/art/occlusion/colours.html` ("red is better: red is the colour for danger", so red = danger in play, not boss-only).

## Acceptance Criteria (as built)

1. A body just north of a standing wall or corner, under its picture, shows its covered part as a soft silhouette over the wall, alpha 0.5 ± 0.08 pulsing: zombies red (0xff5c48), survivors in their slot colour (`SLOT_COLORS`).
2. It is cropped to the solid part of the covering picture (front: full width; side: the 0.14 m strip; corner: the 0.18 m post), never over open street; the copy turns in quarter turns (≤ 45° off the body) so the crop is exact. No mask filter (it cost ~25 % FPS).
3. Capped (`controls.fx.maxWallSilhouettes` = 24), pooled, shrinks after 5 s idle; skipped while the darkness is up; under the selection outline.
4. No measurable FPS cost at `?stress=20&stressbuild=fort`, CPU 4× (branch = master).

## Dev Agent Record

- Files: `apps/client/src/render/wallSilhouette.ts` (pure: covering wall, crop), `WallSilhouetteView.ts`; hooks in `BuildingView.standingSprites`, `ZombieView.shownImages`, `PlayerView.bodyImage`, `GameScene.updateWallSilhouettes`; `buildingsFrames.wallOccluderX`. Tests: `wallSilhouette.test.ts`, `standingWalls.test.ts`, `tools/checks/wallSilhouetteWiring.test.ts`.
- Review: the main session's light review (1 medium perf, lows) fixed; landed on master (db0beb7).
