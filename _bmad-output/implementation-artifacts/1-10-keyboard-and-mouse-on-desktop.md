---
baseline_commit: 4bf25f670c972bf9928565a6d007f3850e0c56d1
---

# Story 1.10: Keyboard and mouse on desktop

Status: review

## Story

As a player on a computer,
I want to play with WASD and the mouse,
so that I can test or play without a phone.

## Acceptance Criteria

1. **WASD.** In a desktop browser, pressing W, A, S, D moves the survivor at full speed in the combined direction (diagonals normalized).
2. **Mouse (FR7).** The survivor aims at the cursor; holding left click fires; Q swaps weapons. Input is sent with `isMouse: true`, so aim assist is off.
3. **Switching.** On a device with both touch and mouse, the last-used input method takes over without a reload.

## Tasks / Subtasks

- [x] **Task 1: Keyboard/mouse source** (AC 1, 2) — `apps/client/src/input/KeyboardMouse.ts`: WASD (use `event.code` `KeyW/KeyA/KeyS/KeyD` so AZERTY and other layouts work by key position) plus the arrow keys as an alias; vector normalized to length 1 (no dead zone, full speed); aim = unit vector from the **local survivor's interpolated screen position** to the cursor (convert with the zoomed camera: `camera.getWorldPoint(pointer.x, pointer.y)`), updated even when the mouse doesn't move but the survivor does; `fire = leftButtonDown`; `Q` → one-sample `swap: true`; `isMouse: true`
- [x] **Task 2: Input router** (AC 3) — `apps/client/src/input/InputRouter.ts` owns both sources and builds the one `PlayerInput` per frame: the source of the most recent *meaningful* event wins (touch: `pointerdown` with `pointer.wasTouch`; mouse/keyboard: a key press, a mouse button, or mouse movement > 4 px). Switching to touch sets `isMouse: false` immediately. Pure selection logic in `selectSource()` with a unit test
- [x] **Task 3: Cursor and focus** — show a crosshair cursor over the canvas in mouse mode (CSS `cursor: crosshair` on `#game`), default cursor in touch mode; on window `blur`, release all held keys and the mouse button (otherwise the survivor keeps walking after Alt-Tab); prevent the browser context menu on right-click over the canvas
- [x] **Task 4: Release sticks** — in mouse mode, `TouchSticks` hides its drawings; HUD buttons stay clickable with the mouse through the same `HudButtons` routing (1.8), and a click on a button does not fire
- [x] **Task 5: Tests and verify** — unit tests: WASD combinations → normalized vectors (W+D = (0.707, −0.707) with +y down), opposite keys cancel; `selectSource` switching; aim vector from screen center to a cursor point. Headless desktop check: W moves up, holding the mouse fires toward the cursor, Q swaps; then a touch event switches to sticks without reload

## Dev Notes

- Builds on 1.3 (`TouchSticks`), 1.5 (aim and fire), 1.6 (`isMouse`), 1.8 (swap edge, `HudButtons`). Read their records and code.
- The aim vector sent over the wire is a unit vector (`aimX`, `aimY`), not a cursor position, so Story 2.4 needs no change. Distance to the cursor doesn't matter (guns fire to their own range; the Grenade Launcher's "lands at the aim point" in 5.5 will add an aim distance field then).
- Keyboard shortcuts added later share this module: E consumable (5.12), F ping (8.7), Esc menu (2.11). Leave a small key-map table so they slot in.
- No gameplay numbers here; dead zones don't apply to keys.

### Project Structure Notes

New: `apps/client/src/input/{KeyboardMouse.ts, InputRouter.ts, selectSource.ts, selectSource.test.ts, keyVector.test.ts}`.
Modified: `TouchSticks.ts`, `GameScene.ts` (uses `InputRouter`), `index.html` or `overlay.css` (cursor), `HudButtons.ts` (mouse clicks).

### References

- [Source: epics.md#Story 1.10: Keyboard and mouse on desktop]
- [Source: gdd.md#Controls and Input] (desktop bonus, aim assist off for mouse)
- Platforms: [Source: gdd.md#Platform-Specific Details]

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- Phaser 4 checks (against `node_modules/phaser`): `Pointer.wasTouch` exists (true on touch events, false on mouse); `pointer.button` holds the pressed/released button; `leftButtonDown()` reads `buttons & 1`; `Camera.getWorldPoint(x, y, output)` takes an output vector and inverts `matrixCombined`, which is the matrix of the last rendered frame.
- Aim consistency: `getWorldPoint` uses the matrix built at last render from that frame's `centerOn` target, so the aim origin is the survivor's position drawn in that same frame (`PlayerView.x/y`); cursor and origin always come from the same frame.
- Browser check (Playwright, Vite dev server, 1280×720 with `hasTouch`, swiftshader):
  - Before any mouse use the cursor is `auto`. After a mouse move of more than 4 px it is `crosshair`.
  - Holding W for 3 s moves the survivor from y 360 to y 156 CSS px, past the camera clamp at the top of the map.
  - Holding the left button with the cursor to the right fires SMG streaks to the right (40 → 30). With the cursor below the survivor, the streaks go down (→ 21).
  - Q swaps to the Hunting Rifle (HUD "▶ HUNTING RIFLE 5 / 5", "SMG 20 / 40").
  - The `contextmenu` event on the canvas is cancelled.
  - A CDP touch drag on the left half shows the move stick, the cursor returns to `auto`, and the survivor walks up to the map edge.
  - A mouse click on the ⇄ button swaps the weapon and fires nothing (SMG stays 40 / 40).
  - Holding S and then a window `blur` stops the survivor (the same y 800 ms later).
  - No console errors.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:**
  - **Key map:** `input/keyMap.ts` is the `KEY_MAP` table keyed by `event.code`: WASD, the arrow keys as aliases, and `KeyQ` → swap. Comments mark where E (5.12), F (8.7) and Esc (2.11) go.
  - **Move vector:** `input/keyVector.ts` is pure. Opposite keys cancel, and diagonals are normalized to length 1.
  - **Keyboard + mouse state:** `input/KeyboardMouse.ts` has no Phaser and no DOM. It counts held codes per action, so W and ArrowUp can be held together. It also tracks the left button, latches Q (auto-repeat never adds an edge), and computes the aim as a unit vector from the survivor to the cursor. If the cursor sits on the survivor, the last aim is kept.
  - **Source choice:** `input/selectSource.ts` is pure. A touch-down picks touch. A key, a mouse button, or a mouse move of more than `MOUSE_SWITCH_PX` (4) picks mouse.
  - **Router:** `input/InputRouter.ts` owns `TouchSticks` and `KeyboardMouse`. The HUD scene feeds it pointer events tagged with `pointer.wasTouch`, so a mouse pointer never creates a stick. It builds the one reused `PlayerInput` each frame: from the sticks with `isMouse: false`, or from keys and mouse with `isMouse: true`. Switching to mouse resets the sticks; switching to touch drops the mouse button. The swap edge is the HUD button OR'ed with Q, and LocalSimHost still latches it.
  - **DOM wiring:** `input/desktopInput.ts`:
    - listens for `keydown`/`keyup` on the window, ignoring Ctrl/Meta/Alt combinations and text fields, and calls `preventDefault` only for bound keys;
    - releases everything on window `blur` and when the tab is hidden;
    - cancels `contextmenu` on `#game`;
    - toggles the `mouse-mode` class on `#game`, which `index.html` turns into `cursor: crosshair`.
    - It returns a detach function, which the scene calls on shutdown.
  - **Scenes (kept small for merging with 1.11):** `GameScene` creates the router, attaches the DOM layer and builds the input through `router.build(...)` with a reused `Phaser.Math.Vector2` for the cursor's world point. `HudScene` sends pointer events to the router after `HudButtons`. In mouse mode it draws no sticks. A mouse click on a HUD button presses it and does not fire.
- **Deviations:**
  - `TouchSticks.ts` and `HudButtons.ts` were not modified. The mouse/touch split lives in `InputRouter`, which takes the HUD-button claim as a flag. Stick drawings are hidden in `HudScene.update` (the drawings live there, not in `TouchSticks`).
  - The cursor CSS is in `index.html` (`#game.mouse-mode`).
  - The router test lives in `selectSource.test.ts`, and the `KeyboardMouse` and key-map tests live in `keyVector.test.ts`. That keeps the planned file names; there is no separate `InputRouter.test.ts`.
  - The mouse must move more than 4 px from where it was when touch took over (or from where it was first seen) before it takes over. The page starts in touch mode, so stray synthetic moves after a tap don't flip the mode.
- **Tests:** 211 passing (+20): keyVector/key map/KeyboardMouse 9, selectSource/InputRouter/desktopInput 11.
- **Verification:** typecheck 0 errors, lint 0 problems, `npm test` 211/211, build ok.

### File List

- `apps/client/src/input/keyMap.ts` (new)
- `apps/client/src/input/keyVector.ts` (new)
- `apps/client/src/input/keyVector.test.ts` (new)
- `apps/client/src/input/KeyboardMouse.ts` (new)
- `apps/client/src/input/selectSource.ts` (new)
- `apps/client/src/input/selectSource.test.ts` (new)
- `apps/client/src/input/InputRouter.ts` (new)
- `apps/client/src/input/desktopInput.ts` (new)
- `apps/client/src/scenes/GameScene.ts` (modified: input through `InputRouter`, DOM input attach/detach)
- `apps/client/src/scenes/HudScene.ts` (modified: pointer events through the router, sticks hidden in mouse mode)
- `apps/client/index.html` (modified: crosshair cursor in mouse mode)
- `_bmad-output/implementation-artifacts/1-10-keyboard-and-mouse-on-desktop.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-21: Story 1.10 implemented: WASD/arrows by key position, mouse aim and fire with `isMouse: true`, Q swap, input router (the last-used device takes over), crosshair cursor, release on blur, no context menu, mouse never drives the touch sticks. 211 tests passing.
