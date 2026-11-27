---
baseline_commit: e13f439
---

# Story 12.3: Extraction cinematic camera

Status: done

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

Added 2026-11-26 (clashes X9, X10; designer "ok" 2026-11-26, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6).

14. **AC 12 measured headless (X10).** Reference phones are parked: run `?stress=150` at 4× CPU throttle in headless Chromium during the fly-out; average FPS within 2 FPS and frame-time p95 within +1 ms of a normal wave (the 9.x budget). The reference-phone wording of AC 12 stays, parked.
15. **Placeholders now, photoreal later (X9).** The crew sprite and the helicopter stay code-drawn placeholders in this story. They are listed in 9.1's inventory as a photoreal group, picked with 9.4 (characters) or 9.2 (city); 9.2's proposal page checks its looks at this story's 0.6× zoom-out.

## Tasks

- [x] `render/cameraDirector.ts` + tests (AC 1–7, 9).
- [x] `scenes/GameScene.ts`: hand the camera to the director during `extract`; hide the HUD (AC 2).
- [x] Letterbox and fade overlays in `HudScene`.
- [x] Dawn sweep (AC 6), crew sprite (AC 8).
- [x] Fog and darkness at zoom-out (AC 5, 11).
- [x] Playwright screenshot script (AC 13).
- [x] Headless 4× CPU fly-out measure (AC 14).

## Dev Notes

- Today the camera is a fixed 24 × 13.5 m player-follow view (`render/camera.ts`). Camera shake goes through `shakeIntensityFor` (Phaser 4.2.1 zoom quirk).
- Zooming out is cheap; zooming in shows the sprite resolution. That's why AC 5 clamps the zoom.
- Later (no story yet): the same director plus headless Chromium (`tools/gallery/export.ts` already drives it) and ffmpeg can render trailers from a replay or a scripted scene.

## Dev Agent Record

### Baseline re-check (2026-11-26)

The story's baseline (`e13f439`) predates 12.2. Re-checked on master `50fb597` (12.2 merged as PR #36, `e5aef083`; 9.15 and
10.10 landed). Hooks used, from 12.2's "Notes for the merge": phase `extract` start (`world.extract.startTick`, online
`extractStartTick`), `boarded`, `cut`, `liftedAtTick`, `padX/padY` (online mirror in `NetSimHost`), `heliPose` /
`flyOutDxM`, `HeliView.left` off `liftedAtTick`, `hudModel.extracting`, and the GameScene camera block marked
"Story 12.2: aboard" (replaced). 9.15 (Behemoth) and 10.10 (Build button) touch nothing here; 10.10's Build button is a
HudScene object, so it hides with the rest of the HUD.

### Implementation plan (as built)

- **Director** (`render/cameraDirector.ts`, pure, preallocated). Inputs: the server tick now (fractional
  `host.serverTick`), the extraction's start / lift-off ticks, `cut`, "everyone aboard", the walkers and the helicopter as
  drawn, the screen and the normal px/m. Output: centre, zoom (× the 24 m view), bars, fade colour + alpha, HUD shown,
  fog lift, dawn line x + strength, phase. The shots are data (`EXTRACT_SHOTS`); the `CameraDirector` constructor takes
  another shot list (a trailer tool can pass its own).
  - Every timed value (bars, fades, zoom-out, fog, dawn, white) is a pure function of the server tick, so every phone
    agrees and a late phone jumps to the right shot. Only the walk's framing is smoothed with the frame clock
    (time constant 0.35 s; a frame gap over 0.25 s snaps). The fly-out is exact (follow the drawn helicopter, zoom from
    1× to 0.6× over 3 s), blended over 0.6 s from wherever the walk left the camera (a late phone: no offset).
  - The view is clamped to the map like the Phaser camera bounds (never shows past the map).
  - "Everyone aboard" = the lift-off tick − `liftBeatS` when known (server truth), else the cut tick, else the first
    frame no walker is left.
  - The cut's black is timed to be full ON the cut tick (start + `walkTimeoutS`, deterministic), so the bodies vanish
    under black; held 0.4 s, back in 0.3 s. If everyone boards inside the 0.3 s lead-in, the black returns from where it
    was (no pop).
- **GameScene** `directCamera` (once per frame, before the camera block): fills the inputs, applies the zoom
  (`ppm × zoom`; back to the normal view when it lets go), the centre (in place of the player follow), the crew, the dawn,
  the darkness's dawn lift and the HUD flags. It writes no World state (reads `world.extract`, `world.players`).
- **HUD** (`HudScene.drawCinema`, `scenes/cinemaHud.ts`): letterbox (one Graphics, redrawn only when its pixel height
  or the screen changes) and a full-screen fade rectangle, above every HUD object; every other HUD object is hidden with
  Phaser's camera filter bit (`cameraFilter`, what `camera.ignore` sets), so no draw method needed changing; the debug
  overlay stays on (AC 12's measure). HUD taps are ignored while hidden. Pings stay: they are drawn in the world (GameScene).
- **Fog / darkness**: `ScreenFog.update(…, lift)` (visibility blends to 1, `on` false at 1); `FogView` fades its
  geometry / in-darkness paint by `1 − lift`. At stage 5 the blackout darkness is on during the extraction, so the dawn
  also lifts the darkness east of its line (`DarknessView.liftDawn`: a ramp strip drawn once, scaled over the soft edge,
  then a fill east; `DAWN_LIFT` 0.9). Darkness and fog already size to the camera's view each frame: at 0.6× they cover
  the 40 m view (checked in the stills at 568×320 and 844×390, no uncovered edges).
- **Dawn sweep** (`render/DawnSweepView.ts`): one Graphics drawn once (soft leading edge, the line, the lit side, DW1's
  colours, ADD), moved and faded each frame; at depth 4.31 (with the city's lights, under zombies and survivors), so the
  horde reads as dark figures on the lit street.
- **Crew** (`render/crewPose.ts` pure + `render/CrewView.ts`): placeholder figure (X9), two Graphics drawn once.
  Steps out of the side door (0.5 s) once the helicopter is down and the walk has begun, a reach-in "pull" (0.8 s) at
  each boarding (the out players and held seats board at the start), waves the others in, climbs back (0.4 s, inside the
  0.5 s beat) when everyone is aboard. Under the helicopter body in depth (it vanishes into the door).
- **12.2's leftover**: a boarded body casts no fog beam (`ScreenFog`) and no blackout glow / cone (`planDarkness`).
- **Results** (AC 7): the fly-out replaces the 4 s dawn. Solo: `showSoloResults` plays no dawn after an extraction
  (`!world.extract.started`); online: `onlineFlow` plays it only for Results straight from the vote (the old path; the
  reviewed live-ness rules stay), never after the `extract` phase. The white is held behind the card.

### Decisions

- **Auto-accepted (designer 2026-11-26: follow recommendations):**
  1. Walk framing zoom clamped to [0.6×, 1×] (the AC's 1× ceiling; the floor = the fly-out's 0.6×, the zoom the fog,
     darkness and sprites are checked at).
  2. Smoothing of the walk framing: time constant 0.35 s, a frame gap over 0.25 s snaps (a woken phone).
  3. The cut's black lands ON the cut tick (lead-in 0.3 s before it), so nobody is seen vanishing.
  4. "Pings" kept = the world ping markers and arrows (drawn by GameScene); the ping button / wheel hide with the HUD
     (the full bars would cover them).
  5. HUD taps are ignored while the HUD is hidden; Esc still opens the menu.
  6. The dawn line also lifts the blackout darkness (stage 5 is a blackout during the extraction: without it the dawn
     and the horde were invisible).
  7. Results after an extraction: no 4 s dawn on top (solo and online), white held behind the card.
- **For the designer (feel: built as below, stills in `docs/playtests/12-3-extraction/`, numbers in `EXTRACT_SHOTS`):**
  - **F1 — when the white comes.** Downtown is 48 m wide and the 0.6× view is 40 m, so a camera following the
    helicopter touches the east edge after ~4 m. Built (recommended): the camera follows, stops at the map edge (nothing
    past the map is ever shown), the helicopter flies out of frame, white is full when it crosses the east edge
    (5.7 s after lift-off), held 2.3 s, then Results. The strict reading of AC 7 ("before the camera's view reaches the
    edge", `whiteAt: "viewEdge"`) would be full white 2.3 s after lift-off: the dawn sweep would barely show.
  - **F2 — the dawn's look** (a new look: line colour, lit-side strength 0.3 ADD, sweep 6 s across the map, light in 0.8 s).
  - **F3 — the crew placeholder** (X9: photoreal later with 9.4).
  - **F4 — bars over the white**: the fade covers the bars (the bars turn white too); alternative: bars stay black.
  - Timings as built: bars 8 % in 0.6 s, 12 % in 0.5 s; cut black 0.3 + 0.4 + 0.3 s; zoom 0.6× over 3 s; fog lifts in 1.5 s; white 0.8 s.

### Seconds timeline (Downtown, survivor starting 15 m from the pad; `docs/playtests/12-3-extraction/log-*.json`)

| t (s from the extract start) | shot |
|---|---|
| 0 → 0.6 | thin bars (8 %) ease in; HUD hides; camera frames walker + pad (zoom ~0.7–0.8×); crew steps out |
| 0 → ~4.3 | the walk (≤ 8 s cap); framing eases as the box shrinks |
| ~4.3 → 4.8 | last aboard: bars to 12 %; crew climbs back (0.4 s); camera eases to the pad at 1× |
| ~4.8 (= aboard + 0.5) | lift-off: camera blends onto the helicopter (0.6 s), fog lifts (1.5 s), dawn line enters from the east (0.8 s in) |
| lift + 0 → 3 | zoom out 1× → 0.6× |
| lift + 0 → 6 | dawn line sweeps west across the map; the night lifts behind it |
| lift + 4.9 → 5.7 | fade to white (full as the helicopter crosses the east edge) |
| lift + 8 | Results card over the held white |
| timeout cut | 7.7 → 8.0 black in, 8.0 → 8.4 hold, 8.4 → 8.7 back in (lift-off at 8.5, under the black) |

Longest sequence: walk 8 s + beat 0.5 s + fly-out 8 s = 16.5 s (≤ 20 s, AC 10). The cut run measured 17.0 s to Results.

### Performance (AC 14, X10)

Headless Chromium (SwiftShader), 844×390 @2×, `?stress=150`, dev server, 4 cores; the stress scene ("a normal wave":
150 Walkers in view) vs. the extraction fly-out driven in the same page (150 + the 40-Walker fly-out horde, zoomed out
to 0.6×), 8 s warm, 7 s of rAF frames each (`_bmad-output/implementation-artifacts/12-3-stills/flyout-perf.cjs`):

| CPU | round | wave FPS / p95 ms (load) | fly-out FPS / p95 ms (load) | Δ FPS | Δ p95 |
|---|---|---|---|---|---|
| 4× | 1 | 9.4 / 133.4 (1.41) | 10.6 / 116.7 (1.42) | +1.2 | −16.7 |
| 4× | 2 | 9.6 / 133.3 (1.88) | 10.4 / 116.6 (1.85) | +0.8 | −16.7 |
| 1× | 1 | 14.0 / 83.4 (1.50) | 15.0 / 83.3 (1.44) | +1.0 | −0.1 |
| 1× | 2 | 15.1 / 83.3 (1.40) | 14.7 / 83.4 (1.33) | −0.4 | +0.1 |

Within 2 FPS and +1 ms p95 of the wave at both throttles (the fly-out is no slower: nothing fires). Absolute numbers
are SwiftShader's; reference phones stay parked (X10).

### Verification

- `npm run gate:fast`: green (typecheck, lint, 5073 unit tests, build + cheat scan). `vitest --changed origin/master`:
  49 files / 429 tests green.
- Browser (Playwright + Chromium, solo `?startwave=10`): stills of every shot at 844×390 and 568×320, and the cut at
  844×390, in `docs/playtests/12-3-extraction/` (script `_bmad-output/implementation-artifacts/12-3-stills/extract-stills.cjs`;
  the game loop is frozen for each still so the image matches the logged shot). Not verified: online play with two real
  phones (the online path is covered by the director's tick tests and the onlineFlow test), real phones (X10).

### Notes for the merge

- Client only. New files: `render/cameraDirector.ts`, `render/crewPose.ts`, `render/CrewView.ts`,
  `render/DawnSweepView.ts`, `scenes/cinemaHud.ts`. Touched: GameScene (camera block, `directCamera`), HudScene
  (`drawCinema`, a guard in the pointer-down handler), hudModel (4 `cinema*` fields), ScreenFog / FogView (`lift`),
  DarknessView (`dawnX/dawnK`), darknessPlan + ScreenFog (boarded bodies skipped), HeliView (`drawnX/Y`, `landedAtS`,
  `flyOutDxM`), PerfOverlay (`gameObject`), onlineFlow (no dawn after `extract`).
- No net kinds, no readability sheets, no balance keys. Shot numbers live in `EXTRACT_SHOTS` (client look data).

### File List

- `apps/client/src/render/cameraDirector.ts` (new)
- `apps/client/src/render/cameraDirector.test.ts` (new)
- `apps/client/src/render/crewPose.ts` (new)
- `apps/client/src/render/crewPose.test.ts` (new)
- `apps/client/src/render/CrewView.ts` (new)
- `apps/client/src/render/DawnSweepView.ts` (new)
- `apps/client/src/scenes/cinemaHud.ts` (new)
- `apps/client/src/scenes/cinemaHud.test.ts` (new)
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/scenes/HudScene.ts`
- `apps/client/src/scenes/hudModel.ts`
- `apps/client/src/render/HeliView.ts`
- `apps/client/src/render/fog/screenFog.ts`
- `apps/client/src/render/fog/FogView.ts`
- `apps/client/src/render/fog/fog.test.ts`
- `apps/client/src/render/darkness/DarknessView.ts`
- `apps/client/src/render/darkness/darknessPlan.ts`
- `apps/client/src/render/darkness/darknessView.test.ts`
- `apps/client/src/debug/PerfOverlay.ts`
- `apps/client/src/net/onlineFlow.ts`
- `apps/client/src/net/onlineFlow.test.ts`
- `_bmad-output/implementation-artifacts/12-3-stills/extract-stills.cjs` (new)
- `_bmad-output/implementation-artifacts/12-3-stills/flyout-perf.cjs` (new)
- `docs/playtests/12-3-extraction/*` (new: stills and shot logs)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Senior Developer Review (AI)

**Light review** (2026-11-26, parent session `session_01CgLgPXDq7yDzkuhpu4JMQB`, on `f991dd0`): no high or medium findings;
no sim side effects. L2 (pings) and F1–F4 are with the designer (unchanged).

| # | Sev | Finding | Fix | Check |
|---|-----|---------|-----|-------|
| L1 | low | Phones couldn't reach ☰ (menu / Leave) during the extraction: every HUD tap was dropped and ☰ hidden. | ☰ is in `cinemaKeep` (drawn between the bars and the fades, depth 2000.5 while the cinematic is on); the down handler lets a tap through when `buttons.hit(…) === "menu"` (`cinemaTapPasses`), every other HUD tap is still dropped. | `cinemaHud.test.ts` › "review L1" (real `HudButtons`: ☰ presses, Ready doesn't). Browser (`12-3-stills/menu-check.cjs`): at 844×390 and 568×320 ☰ shows above the bars, a tap elsewhere leaves the menu closed, a tap on ☰ opens it. Stills `*-review-L1-menu-above-bars.png`, `*-review-L1-menu-open.png`. |
| N1 | nit | GameScene fog-lift comment ("last frame's shot"). | Reworded: the director's previous frame (it runs later in the frame). | — |
| N2 | nit | cameraDirector comment said an endless run extracts again. | Reworded: an extraction ends its run. | — |

## Change Log

- 2026-11-26: Story 12.3 built (camera director, letterbox / fade / HUD hide, crew placeholder, dawn sweep with the
  night lifting, fog lift, boarded bodies' light removed, Results without the 4 s dawn after an extraction). Status → review.
- 2026-11-26: Light review fixes: L1 (☰ reachable during the cinematic), N1, N2.

## Main session close-out (2026-11-27)
- Light review + no-sim check: no high or medium; L1 (☰ unreachable during the cinematic) fixed in 610b47a, checked by the main session. CI green. Merged as 10387c0b (PR #37).
- **Open with the designer (one setting each, tunable later):** F1 white timing, F2 dawn look, F3 crew placeholder, F4 bars at the fade, L2 pings hidden during the extraction (conflicts with 12.2 AC 3: designer call). Merged as built.

- **Designer 2026-11-27:** F1 kept (full white 5.7 s after lift-off). Fly-out horde raised to 150 (12.2 follow-up, PR #38).
