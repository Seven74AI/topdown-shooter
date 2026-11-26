---
baseline_commit: e13f439
---

# Story 12.3: Extraction cinematic camera

Status: ready-for-dev

<!-- Quick story 2026-11-25 from the party-mode session on cinematics. Needs 12.2 (the extraction phase). Client only. The camera director built here is meant to drive game-rendered trailers later (same shot data, offline render), so keep it data-driven. -->

## Story

As a player who just won a run,
I want the camera to frame our walk to the helicopter, then follow it over the horde into the sunrise,
so that the extraction plays like a short film.

## Acceptance Criteria

1. **A camera director.** `apps/client/src/render/cameraDirector.ts` (pure, no Phaser, preallocated): from the run timeline (`extract` start tick, boarding events, `liftedAtTick`, `run.extract_cut`) and the World positions, it returns the camera centre, zoom, letterbox height (fraction of the screen), fade (colour + alpha) and whether the HUD shows. `GameScene` applies it in place of the normal player-follow camera while it's active. The shots are data (a small shot list keyed to timeline events and seconds), not code branches, so a trailer tool can reuse the director later.
2. **The walk** (from `extract` start):
   - **Thin letterbox bars** (8% of the screen height, top and bottom) ease in over 0.6 s.
   - The camera frames every walking player plus the pad (bounding box + 3 m margin), easing between framings with no jumps.
   - The HUD hides, except pings.
3. **Last player boards** → the bars go **full** (12%) over 0.5 s.
4. **Timeout cut** (`run.extract_cut`): fade to black (0.3 s), hold, then fade back in with everyone aboard.
5. **Lift-off and fly-out** (`liftedAtTick`):
   - The camera lets go of the players and follows the helicopter's pose (`heliPose`, the 12.2 fly-out).
   - It **zooms out** to 0.6× over 3 s. It never zooms in past 1.0×: the sprites are drawn for the 24 m view.
   - Fog of war lifts so the horde mobbing the pad is visible.
6. **Dawn sweep.** During the fly-out, the dawn (the existing DW1 sunrise, `ui/dawnModel.ts`) comes in as a line of warm light sweeping **west across the map** from the east edge, the side the helicopter is flying toward. This is visual only; zombies aren't changed.
7. **Fade to white before the edge.** The screen fades to white before the camera's view reaches the map edge, so nothing beyond the map is ever shown. Then the Results card. This replaces the current 4 s dawn-then-Results for an extraction seen live.
8. **The crew.** When the helicopter lands, a crew sprite (code-drawn, one simple figure) steps out, "pulls in" out players and held seats (12.2 AC 7) and waves the others in. It climbs back aboard when everyone's in.
9. **Same on every phone.** Every timing comes from server ticks (12.2's stamps) and the frame clock, so all phones show the same shot at the same moment. A phone that wakes up after the fly-out shows Results directly, the way `dawnModel` handles a late phone today.
10. **No skip in v1.** The whole sequence is ≤ 20 s (walk ≤ 8 s + fly-out 8 s + fades).
11. **Screens.** Bars, framing and fade work at 568×320, 640×360, 800×360 and 844×390. Darkness and fog layers cover the zoomed-out view with no uncovered edges.
12. **Performance.** The zoomed-out fly-out over a full horde holds the frame budget on the Epic 10 reference phones. Measure it with the existing debug overlay.
13. **Tests.**
   - Pure director tests: framing, bar heights, zoom clamp, fade before the edge.
   - The wake-up-late path.
   - One Playwright run of a solo extraction with screenshots at walk, lift-off and fade, to look at by hand.

## Tasks

- [ ] `render/cameraDirector.ts` + tests (AC 1–7, 9).
- [ ] `scenes/GameScene.ts`: hand the camera to the director during `extract`; hide the HUD (AC 2).
- [ ] Letterbox and fade overlays in `HudScene`.
- [ ] Dawn sweep (AC 6), crew sprite (AC 8).
- [ ] Fog and darkness at zoom-out (AC 5, 11).
- [ ] Playwright screenshot script (AC 13).

## Dev Notes

- Today the camera is a fixed 24 × 13.5 m player-follow view (`render/camera.ts`). Camera shake goes through `shakeIntensityFor` (Phaser 4.2.1 zoom quirk).
- Zooming out is cheap; zooming in shows the sprite resolution. That's why AC 5 clamps the zoom.
- Later (no story yet): the same director plus headless Chromium (`tools/gallery/export.ts` already drives it) and ffmpeg can render trailers from a replay or a scripted scene.
