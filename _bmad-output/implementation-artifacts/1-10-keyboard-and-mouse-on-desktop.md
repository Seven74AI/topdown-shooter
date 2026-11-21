# Story 1.10: Keyboard and mouse on desktop

Status: ready-for-dev

## Story

As a player on a computer,
I want to play with WASD and the mouse,
so that I can test or play without a phone.

## Acceptance Criteria

1. **WASD.** In a desktop browser, pressing W, A, S, D moves the survivor at full speed in the combined direction (diagonals normalized).
2. **Mouse (FR7).** The survivor aims at the cursor; holding left click fires; Q swaps weapons. Input is sent with `isMouse: true`, so aim assist is off.
3. **Switching.** On a device with both touch and mouse, the last-used input method takes over without a reload.

## Tasks / Subtasks

- [ ] **Task 1: Keyboard/mouse source** (AC 1, 2) — `apps/client/src/input/KeyboardMouse.ts`: WASD (use `event.code` `KeyW/KeyA/KeyS/KeyD` so AZERTY and other layouts work by key position) plus the arrow keys as an alias; vector normalized to length 1 (no dead zone, full speed); aim = unit vector from the **local survivor's interpolated screen position** to the cursor (convert with the zoomed camera: `camera.getWorldPoint(pointer.x, pointer.y)`), updated even when the mouse doesn't move but the survivor does; `fire = leftButtonDown`; `Q` → one-sample `swap: true`; `isMouse: true`
- [ ] **Task 2: Input router** (AC 3) — `apps/client/src/input/InputRouter.ts` owns both sources and builds the one `PlayerInput` per frame: the source of the most recent *meaningful* event wins (touch: `pointerdown` with `pointer.wasTouch`; mouse/keyboard: a key press, a mouse button, or mouse movement > 4 px). Switching to touch sets `isMouse: false` immediately. Pure selection logic in `selectSource()` with a unit test
- [ ] **Task 3: Cursor and focus** — show a crosshair cursor over the canvas in mouse mode (CSS `cursor: crosshair` on `#game`), default cursor in touch mode; on window `blur`, release all held keys and the mouse button (otherwise the survivor keeps walking after Alt-Tab); prevent the browser context menu on right-click over the canvas
- [ ] **Task 4: Release sticks** — in mouse mode, `TouchSticks` hides its drawings; HUD buttons stay clickable with the mouse through the same `HudButtons` routing (1.8), and a click on a button does not fire
- [ ] **Task 5: Tests and verify** — unit tests: WASD combinations → normalized vectors (W+D = (0.707, −0.707) with +y down), opposite keys cancel; `selectSource` switching; aim vector from screen center to a cursor point. Headless desktop check: W moves up, holding the mouse fires toward the cursor, Q swaps; then a touch event switches to sticks without reload

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
