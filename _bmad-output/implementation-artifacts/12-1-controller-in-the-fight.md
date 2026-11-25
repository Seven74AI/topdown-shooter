# Story 12.1: Controller in the fight

Status: ready-for-dev

<!-- Epic 12 story 1 of 4. Story file 2026-11-25 (gds-create-story) from the real code on branch claude/lucid-lamport-r1st1y (27ee720). Sources: forge `_bmad-output/forge/controller-support/forged-idea.md`; `planning-artifacts/sprint-change-proposal-2026-11-25-controller.md`; epics.md Epic 12. Build after the Network pass, before 12.2 and before Epic 7's screen stories. Decisions D1–D6 accepted by the designer 2026-11-25 ("ok", all recommendations). -->

## Story

As a player with a Bluetooth Xbox or PlayStation controller paired to my phone,
I want to move, aim, fire, swap, use consumables and open the menu with it,
so that I can fight without touching the glass.

**Scope:** the fight only, in `apps/client`. Out of scope:
- menus, focus and text fields (12.2);
- HUD button prompts (12.3);
- build-phase actions such as picking a tile, placing and rotating (12.4).

In a build phase this story's moving, swapping and consumable buttons still work; holding a building still goes through `holdBuildingInput`.

## Acceptance Criteria

### Player-visible rules (each is a test)

- **P1 "The controller just works."** On Android Chrome 10+ and iOS Safari 16+ with an Xbox controller or a DualSense paired over Bluetooth, the first button press or stick push makes the controller the active device. There's no setup screen.
- **P2 "Same feel as the touch sticks."** The left stick moves with the touch stick's 10 % dead zone, and full speed is at the rim. The right stick aims, and past 30 % it fires, like the touch aim stick (GDD: fires automatically while aiming). Both values come from `balance.controls` (`moveDeadZone`, `aimDeadZone`), never new constants.
- **P3 "Aim assist helps me."** Controller input goes out with `isMouse=false`, so aim assist applies through `packages/shared/src/combat/firing.ts:218`. The shared code and the wire format are unchanged.
- **P4 "A stray tap doesn't steal control."** While the controller is active:
  - Tapping a HUD button (Phaser) presses that button, and the controller stays active.
  - Taps on DOM overlay screens never reach the router.
  - Only a touch on the game area that would start a touch stick hands control back to touch.
- **P5 "A dead battery doesn't kill me."** If the controller disconnects during a run with the menu closed, the in-run menu opens: solo pauses (2.11), and online the survivor stands still (`standsStill`). The menu stays open until I close it with Start on a reconnected controller, ☰, Esc, or a menu button.
- **P6 "Nothing is pressed twice or late."** Swap, consumable and menu are edges, once per press: holding a button doesn't repeat it, and a press made while the menu is open never acts after it closes (same latch rules as `KeyboardMouse`).

### Behaviour

1. **Reading the controller.** Once per frame, at the top of `GameScene.update` (before `router.build`), the scene passes `navigator.getGamepads()` to `router.pollPad(pads)`. Phaser's gamepad plugin stays off: `main.ts:52` sets only `activePointers`.
   - The router keeps a new pure class, `input/GamepadState.ts`. It has no DOM and takes a `GamepadLike` interface, so Vitest can test it in the `node` environment.
   - Only pads with `connected` and `mapping === "standard"` count.
   - With several pads, the one with the most recent meaningful input drives the survivor (D4).
   - If `navigator.getGamepads` is missing (insecure context, old browser), the router stays as today.
2. **Standard mapping** (W3C Gamepad "standard" layout):

   | Input | Index | Action |
   | --- | --- | --- |
   | Left stick | axes 0, 1 | move |
   | Right stick | axes 2, 3 | aim and fire |
   | Y / △ | button 3 | swap |
   | X / □ | button 2 | consumable |
   | Start / Options / Menu | button 9 | menu |

   - The ping button is reserved for Story 8.7 (D1) and not wired here.
   - A / ✕ (0), B / ○ (1), the shoulder buttons (4, 5), the triggers (6, 7) and the d-pad (12–15) are left for 12.2 and 12.4: they do nothing in the fight in this story.
3. **Dead zones and vectors.**
   - The stick vector uses the same radial rule as `stickVector` (`input/stick.ts`): below the dead zone it's zero, then it rescales linearly to 1 at the rim. Reuse the function (origin 0,0, position = the axes, radius 1) instead of copying the math.
   - The aim is the unit direction past `AIM_MIN_DEFLECTION`, the same rule as `TouchSticks` aim.
   - Fire = deflection past `aimDeadZone`.
   - The launcher and throwables get their lob length from `touchLobDistance(lob, deflection, aimDeadZone)` (`input/lobAim.ts`), exactly like the touch aim stick.
   - Screen +y is down, and so is the Gamepad API's axis +y: no flip.
4. **A third device.** `InputSource` becomes `"touch" | "mouse" | "gamepad"` (`selectSource.ts`), with a new `SourceEvent` `"padInput"`.
   - Meaningful controller input is any button's press edge (`pressed` going false → true), or a stick past its own dead zone. Stick drift inside the dead zone never switches.
   - `selectSource`:
     - `padInput` → `"gamepad"`.
     - `touchDown` → `"touch"` only for a touch that starts a stick. `InputRouter.pointerDown` with `onButton=true` doesn't switch while the source is `"gamepad"` (P4). From touch or mouse, today's behaviour is unchanged.
     - `key`, `mouseButton` and `mouseMove > MOUSE_SWITCH_PX` → `"mouse"`, unchanged.
   - Switching to the controller does `sticks.reset()` and `kbm.leftButton = false`.
   - Switching away from the controller makes the controller's latches empty and its stick vectors zero, so a held stick doesn't keep steering under touch.
5. **`InputRouter.build`.** It gets a controller branch next to the mouse branch:
   - move, aim, fire and lob come from `GamepadState`, and `isMouse` is false;
   - `out.swap = hudSwap || keySwap || padSwap`;
   - `out.consumable = hudConsumable || keyConsumable || padConsumable`;
   - the throw rules (`throwing`, review L5) apply unchanged.

   Keep one allocation-free path: `out` is reused, and `GamepadState` reuses its vectors.
6. **Menu.**
   - `GameScene.update:1892` reads `router.takeMenu()`, which merges `kbm.takeMenu()` with the controller's Start edge. Esc's rules then apply to Start: while I hold a building, Start puts it away first (5.23 D14), and Start closes the shop first (3.3).
   - Start is not "play": it never switches touch to the controller on its own. This mirrors the "Esc never switches to mouse" rule (`InputRouter.keyDown`).
7. **Disconnect.**
   - When the active pad disappears from `getGamepads()` or reports `connected=false`, while the source is `"gamepad"`, `uiStore` is `playing` with the menu closed, and the run is running and not over: the scene calls `onMenu("toggle")`. That path already does `router.releaseAll()` and `host.clearEdges()`.
   - The source stays `"gamepad"`, so the touch sticks don't pop up. A touch on the game area switches to touch as usual.
   - Also listen for `gamepaddisconnected` on `window`. Attach it next to `attachDesktopInput` and detach it on scene `SHUTDOWN`. Polling alone also works; the event only speeds things up.
8. **Releasing input.**
   - `releaseAll()` (window blur, hidden tab, menu open) also clears the controller's latches, and the next poll's state becomes the new baseline, so a button already held when the tab comes back is not a new edge (same rule as `KeyboardMouse.keyDown` with repeat).
   - Polling while the tab is hidden is pointless: Phaser stops `update`, so nothing extra is needed.
9. **HUD sticks.**
   - `HudScene.update:1824` draws the touch sticks only when `router.source === "touch"`; today it uses `!router.isMouse`. In controller mode, the floating stick bases and knobs are never drawn.
   - Every other `isMouse` check in the client stays mouse-only. Review each:
     - `GameScene.ts:1202-1209`: the cursor follow while placing;
     - `GameScene.ts:1883`: the cursor world point;
     - the `mouse-mode` class in `desktopInput.ts`.
10. **Android key events from the pad (check, then guard).**
    - Android can deliver controller d-pad and A/B presses to the page as `keydown` events (arrow keys, Enter, Escape), as well as to the Gamepad API.
    - Arrow keys are bound to movement (`keyMap.ts:41-44`), so such an event would switch the source to `"mouse"` and walk twice.
    - On the real Android phone, check whether this happens and record the result in `docs/qa/browsers.md`.
    - If it does: while the source is `"gamepad"` and a pad press happened within the last 100 ms, `attachDesktopInput` ignores keydown and keyup events for arrow keys, Enter, Escape and Space (D5).
11. **Real-phone test** (designer; this can't be tested in the cloud container).
    - Run on `https://hordes.sevend.io`. The Gamepad API needs a secure context, so the LAN `http://` dev URL won't expose the controller on a phone.
    - Test an Xbox controller and a DualSense, each on an Android phone and an iPhone, in solo and online. Check:
      - every mapping in AC 2;
      - the dead zones feel like the touch sticks;
      - aim assist bends shots;
      - a tap on the swap button keeps the controller active;
      - a tap on the game area switches to touch;
      - turning the controller off mid-wave opens the menu.
    - Record the results in a new `docs/qa/browsers.md` under a "Controller" heading. Story 10.5 adds the browser smoke test to the same file.

## Tasks / Subtasks

- [ ] **T1 `GamepadState`** (AC 1–3, 8; P2, P6). New `apps/client/src/input/GamepadState.ts` plus a test file. It contains:
  - `interface GamepadLike { index; id; connected; mapping; buttons: ReadonlyArray<{ pressed: boolean; value: number }>; axes: ReadonlyArray<number> }`.
  - `update(pads: ArrayLike<GamepadLike | null> | null): void`, which picks the active pad and works out edges.
  - Getters for `moveVector()` and `aim()`, which return `{ x, y, fire, deflection }`.
  - `takeSwap()`, `takeConsumable()` and `takeMenu()`.
  - `meaningful`: true for the frame when there was a press edge or a stick past its dead zone.
  - `disconnected`: true once when the active pad vanished.
  - `releaseAll()`.

  The dead zones come in through the constructor, like `TouchSticks`. Tests:
  - drift at 9 % is zero and not meaningful; 11 % moves; the rim is 1;
  - aim at 29 % gives no fire, 31 % fires, and the lob deflection passes through;
  - a held button is one edge, and the edge is not repeated across frames;
  - `releaseAll` with the button still held gives no new edge on the next poll;
  - a non-standard mapping is ignored; `null` entries and `null` input don't throw;
  - with two pads, the most recently active one wins (D4);
  - when the active pad vanishes, `disconnected` is set once and the vectors are zero.
- [ ] **T2 Source selection** (AC 4; P4). In `selectSource.ts`: add `"gamepad"` and `"padInput"`, and keep the function pure. In `InputRouter`: add `pad = new GamepadState(...)` and `pollPad(pads)`, which calls `pad.update`, then `apply("padInput")` if `pad.meaningful`. Also:
  - `pointerDown` with `onButton` while the source is `"gamepad"` presses the button without `apply("touchDown")`;
  - `apply` resets the sticks when switching to the controller, and calls `pad.releaseAll()` when switching away from it;
  - `releaseAll` also releases the pad.

  Extend `selectSource.test.ts`, and add `InputRouter.test.ts` with fake sticks and pads covering every switch in AC 4 and the HUD-button case.
- [ ] **T3 Build branch** (AC 5; P3). Add the controller branch in `InputRouter.build`, plus tests:
  - controller input gives `isMouse=false`;
  - swap and consumable come from the pad;
  - a throw drops fire and uses the throw's range (review L5);
  - with the launcher, the aim length equals `touchLobDistance` for the same deflection.
- [ ] **T4 Scene wiring** (AC 1, 6, 7, 9).
  - `GameScene.update`: `router.pollPad(navigator.getGamepads?.() ?? null)` first. Then the menu reads `router.takeMenu()`. Then, if `router.pad.disconnected` (taken once) and the AC 7 conditions hold, call `this.onMenu("toggle")`.
  - Add the `gamepaddisconnected` listener with detach on shutdown, and the `HudScene` stick-visibility change.
  - Guard `navigator.getGamepads` throwing: some browsers throw when blocked by a permissions policy, so catch it and treat it as null.
- [ ] **T5 Android key guard** (AC 10). Do this only if the device check shows key events. Implement it in `desktopInput.ts`, with a test in the style of the existing desktop input tests. If the check shows no key events, record that and skip the guard.
- [ ] **T6 Docs.**
  - Create `docs/qa/browsers.md` with the "Controller" table (phone × controller × check).
  - Add one line to the README "Playable link" section: a controller works on the deployed link (HTTPS), not on the LAN dev URL.
- [ ] **T7 Gates.** `npm test`, `npm run lint` (the `packages/shared` boundary is untouched), `npm run typecheck`, `npm run build`. Play solo once on desktop Chrome with a USB or Bluetooth controller, if there is one. Then hand AC 11 to the designer.

## Dev Notes

### Current state of the files this story changes

- **`input/InputRouter.ts`** (168 lines). It owns `TouchSticks` and `KeyboardMouse`. `source` is `"touch" | "mouse"`, and `apply(event)` changes it and calls `onSourceChange`. On a switch to mouse it does `sticks.reset()`; on a switch to touch it clears `kbm.leftButton` and re-anchors the mouse.
  - `pointerDown` always calls `apply("touchDown")` for touch, even with `onButton`. That is the line P4 changes, and only while the source is `"gamepad"`.
  - `keyDown` doesn't switch on the `menu` action.
  - `build()` has two branches, mouse and touch, which fill a reused `MutablePlayerInput`.
  - **Keep:** every mouse and touch behaviour, including the `throwing` / `throwLob` rules from Story 5.12 review L5, and `releaseAim()` from 5.15.
- **`input/selectSource.ts`.** A pure switch over `SourceEvent`. **Keep** `MOUSE_SWITCH_PX` and the existing cases. Its tests are in `selectSource.test.ts` (208 lines: follow their style).
- **`input/KeyboardMouse.ts`.** A latch pattern (`xLatched` plus `takeX()`), `releaseAll()`, and `heldCodes` with repeat handling. Copy this pattern for the pad's edges.
  - **Don't** route controller presses through `KeyboardMouse`: it would mark the source `"mouse"` and mix up held counts.
- **`input/TouchSticks.ts`.** Aim rules: `AIM_MIN_DEFLECTION = 0.05` (resting thumb = no aim), `fire` past `aimDeadZone`, and `deflection` as the raw value. The controller must match these.
- **`input/desktopInput.ts`.**
  - `inTextField` already ignores keys typed into inputs.
  - `onDomControl` lets focused buttons keep Space and Enter (5.23 review M1).
  - It owns the window listeners and their detach. Put the `gamepaddisconnected` listener and the AC 10 guard here, and keep the `attach…` / detach shape.
- **`scenes/GameScene.ts`.**
  - `:759-761` creates the sticks and router and calls `attachDesktopInput`. The detach is in the `SHUTDOWN` handler at `:763`.
  - `update` (`:1876`) calls `router.build` (`:1886`) and the menu latch (`:1892`). The Esc-while-holding rule is at `:1895-1899`, and shop-first at `:1900-1904`.
  - `standsStill` and `neutralizeInput` (`:1914`) make the survivor stand still with the menu or shop open, or in a vote.
  - `onMenu("toggle")` (`:924-935`) releases all input and clears host edges when it opens.
  - **Keep** that order: build → menu → shop → stand still → build keys.
- **`scenes/HudScene.ts:1824`.** Stick drawing is gated by `!this.router.isMouse && !this.model.voting`.
- **`ui/uiState.ts`.** `menuStep(state, "toggle")` opens or closes the menu. Solo pauses while it's open (designer decision 2026-11-21); online the run goes on.

### Why `isMouse` is enough

`isMouse` is on the wire (`packages/shared/src/net/input.ts:21`, zod-checked), and the only rule that reads it is aim assist (`combat/firing.ts:218`). Bots already send `false` (`bots/botPolicy.ts:170`). So a controller needs no shared or server change. This keeps the `packages/shared` boundary (ADR-03) and the input rate cap (25/s, `game-architecture.md:577`) as they are.

### Gamepad API facts the builder needs

- **Polling, not events.** `navigator.getGamepads()` returns a snapshot, so read it every frame. `gamepadconnected` fires only after the first button press (a privacy rule), so a controller is "seen" at its first press. That fits P1.
- **Secure context.** Both Chrome and Safari expose gamepads only over HTTPS. Test on the deployed link.
- **`standard` mapping.**
  - Buttons: 0 bottom (A / ✕), 1 right (B / ○), 2 left (X / □), 3 top (Y / △), 4 and 5 shoulders, 6 and 7 triggers (analog `value`), 8 Back/Share, 9 Start/Options, 10 and 11 stick clicks, 12–15 d-pad up/down/left/right, 16 Home.
  - Axes: 0 and 1 left stick, 2 and 3 right stick, in −1..1 with +y down.
  - Xbox controllers and DualSense report `standard` on current Android Chrome and iOS Safari; anything else is ignored (D3).
- **iOS.** The Home button (16) and the DualSense touchpad click may belong to the system. Never bind them.
- **Gestures.** Safari doesn't count controller presses as a user gesture (WebKit bug 217675). Nothing in 12.1 needs one: audio is already unlocked by the first tap on the start screen. Story 12.2 deals with the gesture question for text fields.

### Testing standards

- Vitest in the `node` environment (`vitest.config.ts:6`): no DOM, so keep `GamepadState` pure and pass fake `GamepadLike` objects.
- Tests sit next to the code (`*.test.ts` beside the file), in the existing style of `selectSource.test.ts`, `TouchSticks.test.ts` and `keyMap.test.ts`.
- Each P rule above is at least one named test.

### Project structure notes

- New files: `apps/client/src/input/GamepadState.ts`, `GamepadState.test.ts`, `InputRouter.test.ts`, and `docs/qa/browsers.md`.
- Architecture (`game-architecture.md`, updated 2026-11-25) puts controller input in `apps/client/src/input`. It uses the browser Gamepad API read once per frame, not Phaser's gamepad plugin.
- No variances.

### Project context rules

There's no `project-context.md`. Follow the README: dependencies pinned exactly (`npm i -E`), but this story adds none. ESLint enforces the `packages/shared` boundary.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 12.1]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-11-25-controller.md]
- [Source: _bmad-output/forge/controller-support/forged-idea.md]
- [Source: _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md#Controls and Input]
- [Source: _bmad-output/planning-artifacts/game-architecture.md (Input row; Client input)]
- [Source: _bmad-output/implementation-artifacts/2-11-in-run-menu.md; 1-10-keyboard-and-mouse-on-desktop.md; 5-23-placement-feel-and-owner-marks.md]
- [W3C Gamepad spec, standard mapping](https://w3c.github.io/gamepad/#remapping)
- [WebKit bug 217675: gamepad presses and user gestures](https://bugs.webkit.org/show_bug.cgi?id=217675)

## Decisions (accepted by the designer 2026-11-25: all recommendations are rules)

| # | Question | Decision |
| --- | --- | --- |
| D1 | Ping button (Story 8.7) | **D-pad up** (the common ping button in co-op shooters), reserved now and wired in 8.7. The menus use the d-pad only while a screen is open, so there's no clash |
| D2 | Should a trigger fire too? | **No.** Firing stays automatic while aiming, as on touch (GDD). The triggers are free for 12.4 (rotate) |
| D3 | Controllers that aren't standard-mapped (old or unknown) | **Ignored**: no guessing at layouts. Recorded in the QA file if one shows up |
| D4 | Two controllers on one phone | **The most recently active one drives.** No local split-screen |
| D5 | Android key events from the d-pad | **Check first.** Add the AC 10 guard only if they show up |
| D6 | Disconnect while the shop is open, or while holding a building | **Nothing extra.** The shop already makes the survivor stand still, and holding a building has no aim or fire. The menu opens only from a running wave or build phase with the menu closed |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Context analysis completed: a full developer guide was written from the real code.

### File List
