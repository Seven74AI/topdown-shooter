# Story 12.2: Menus with the controller

Status: ready-for-dev

<!-- Epic 12 story 2 of 4. Story file 2026-11-25 (gds-create-story) from the real code on branch claude/lucid-lamport-r1st1y (27ee720). Depends on 12.1 (GamepadState, the "gamepad" source). Build before Epic 7's screen stories (7.3, 7.6, 7.10 join this focus system). Sources: forge `_bmad-output/forge/controller-support/forged-idea.md`; `planning-artifacts/sprint-change-proposal-2026-11-25-controller.md`. Decisions D1–D7 accepted by the designer 2026-11-25 ("ok", all recommendations). -->

## Story

As a player with a controller,
I want to use every screen with it,
so that I never need to touch the phone except to type.

**Scope:** the Preact (DOM) screens. The HUD is Phaser and has no DOM focus. These HUD buttons are 12.3/12.4's:
- build bar, repair/action bar, undo chip;
- build-phase Ready.

The in-run ☰ button is covered: Start opens the menu (12.1).

## Acceptance Criteria

### Player-visible rules (each is a test)

- **P1 "I can always see where I am."**
  - While the controller is the active device, exactly one control on the top screen shows a clear focus ring.
  - In touch or mouse mode there is no ring, and today's look is unchanged.
- **P2 "Moving focus is predictable."**
  - The d-pad, or the left stick pushed past half way, moves focus to the nearest control in that direction (spatial navigation). The shop's 3 × 2 card grid works like a grid.
  - Holding a direction repeats after 400 ms, then every 150 ms.
  - At an edge, focus stays where it is (no wrap).
- **P3 "A / ✕ does what a tap does."**
  - Pressing A / ✕ on a control runs the same code path as tapping it: the same handler, the same guards, the same sound.
  - This includes controls that act on `pointerdown` today:
    - EvacVote's EXTRACT / STAY;
    - the Results dawn skip;
    - the GfxNotice reload.
- **P4 "B / ○ backs out, never destroys."**
  - B / ○ closes or backs out of the top screen:
    - in-run menu → closes it (or, from Leave confirm, returns to the menu);
    - shop → deselects a selected card first, then closes the shop; in "Replace which?", Cancel;
    - ServerNotice → Back to start;
    - GfxNotice banner → OK.
  - B never leaves a lobby, never leaves a run, never buys anything, and does nothing on the start screen, lobby, Results or vote (D3).
- **P5 "Typing works on both phones."**
  - A / ✕ on a text field calls `focus()` on it inside the same frame the controller was read.
  - On Android Chrome the phone keyboard should open.
  - On iPhone Safari (no gamepad user activation) the field shows a **"Tap to type"** hint. One tap opens the keyboard, and the controller stays the active device (12.1 P4).
  - The hint disappears on the first input, on blur, or when the keyboard is seen to open (AC 6).
- **P6 "Nothing leaks into the fight."**
  - While a DOM screen has the controller focus, the controller's menu presses don't also act in the game.
  - The fight is already frozen by `standsStill` when the in-run menu, shop or vote is open.
  - An A press that closes a screen doesn't also count as a game press in the same frame.

### Behaviour

1. **Spike first (T0, designer on real phones).**
   - The question: does `input.focus()` called from inside a `requestAnimationFrame` callback, right after `navigator.getGamepads()` reported A pressed, open the soft keyboard?
     - On Android Chrome: expected yes, since Chrome counts a `getGamepads()` read with a button pressed more than 50 % as user activation.
     - On iPhone Safari: expected no.
   - Use a throwaway page on `https://hordes.sevend.io/?padspike=1`, a dev-only route or a release-safe query flag; remove it afterwards.
   - Record the result in `docs/qa/browsers.md` ("Controller" section from 12.1).
   - If Android doesn't open the keyboard either, AC 6's hint is shown on both phones. Nothing else changes.
2. **A menu loop outside the Game scene.**
   - The start screen and lobby show while no Game scene runs: `BootScene` starts `Game` only for a run (`BootScene.ts:69,76`).
   - So menu navigation gets its own loop:
     - `ui/focusNav.ts` exports `startFocusNav(win, doc)`.
     - `main.ts` starts it once, after `render(h(App…))` at `main.ts:170`.
     - It runs `requestAnimationFrame`, reads `navigator.getGamepads()` into its own `GamepadState` from 12.1, and acts only while a pad layer (AC 3) is visible.
   - Two readers are fine: `getGamepads()` is a snapshot, and each `GamepadState` keeps its own edges.
   - The loop stops polling when the tab is hidden; on return, the next poll is the new edge baseline, as in 12.1 AC 8.
3. **Pad layers.**
   - Each screen root that the controller can use gets `data-pad-layer` with a priority number. The highest visible layer owns the controller.

   | Priority | Layer |
   | --- | --- |
   | 90 | ServerNotice |
   | 80 | GfxNotice |
   | 70 | InRunMenu |
   | 60 | Shop |
   | 50 | EvacVote |
   | 40 | Results |
   | 30 | Lobby |
   | 20 | Start |

   - RotateOverlay (portrait, no controls) and the debug overlays are not layers.
   - "Visible" means mounted, in the document, and not `display: none`.
   - Screens mount and unmount through their own stores, so the layer set is read from the DOM on each frame that has controller input. Don't mirror all four stores:
     - `uiStore` (`ui/uiState.ts`);
     - `shopStore` (`ui/ShopScreen.tsx:30-32`);
     - `voteStore` (`ui/EvacVote.tsx:19-21`);
     - `serverNotice`, `gfxStatus`.
   - Inside a layer, the focusable controls are the enabled `button`, `input` and `[data-pad-focus]` elements. Disabled buttons are skipped.
   - The back control is the element marked `data-pad-back`, or the layer's `onPadBack` function from the AC 5 registry.
   - **Future screens join by adding the same attributes.** This is what Epic 7's notes in 7.3, 7.6 and 7.10 refer to.
4. **Focus rules.**
   - When a layer becomes top, focus goes to its first control. An existing `autofocus` wins:
     - InRunMenu: the first item (`InRunMenu.tsx:48`) and Cancel in confirm (`:23-27`);
     - Shop: the first slot in replace (`ShopScreen.tsx:71`).
   - When the focused control disappears (the shop rerenders, or a card becomes empty), focus moves to the nearest remaining control.
   - The pure core lives in `ui/focusMath.ts` and is unit tested:
     - `nextFocus(rects, current, dir)`: nearest centre in the half-plane, weighted toward the axis;
     - `pickLayer(layers)`;
     - `repeatTimer` for P2.
   - The DOM adapter stays thin.
5. **Activation (P3).**
   - A / ✕ on a control:
     - **text input** → `el.focus()` (P5, AC 6);
     - an element with a registered pad handler → that handler;
     - otherwise `el.click()`.
   - Register pad handlers in a small `WeakMap<Element, () => void>` (`ui/padPress.ts`), filled with a `ref` callback:
     - **EvacVote** (`EvacVote.tsx:43-80`): its buttons act on `onPointerDown` with `preventDefault`, so a synthetic click would not run the tap. Register `() => voteStore.tap(...)`, the same call as the pointer path.
     - **Results dawn** (`ResultsScreen.tsx:39`): a `div` with `onPointerDown`. Register the skip and mark the div `data-pad-focus` while the dawn shows.
     - **GfxNotice reload** (`GfxNotice.tsx:15-18`): the click is on the parent div, so `click()` on the Reload button bubbles to it. A plain `click()` is enough; just make sure the button is focusable.
   - Shop cards keep their two-step rule (`ShopScreen.tsx:165, 174-210`): the first A selects, the second A buys, like taps.
   - Never change the touch handlers themselves: today's pointer behaviour must stay byte-for-byte the same.
6. **Text fields (P5).**
   - On A / ✕ over `#start-name` or `#start-code`, call `el.focus()` synchronously in the poll callback.
   - The fields already scroll themselves into view on focus (`StartScreen.tsx:27,115,144`), and Enter already submits (`:78-87`).
   - **"Tap to type" hint:**
     - Shown under a field focused by the controller.
     - On iPhone it's always shown.
     - On Android it's shown unless `visualViewport.height` drops by more than 25 % within 500 ms (the keyboard opened). Then it's hidden.
     - It goes away on the first `input` event or on `blur`.
     - It's plain text in the field's existing style.
   - **Leaving the field:**
     - B or d-pad down while a text field has focus calls `blur()` (the keyboard closes) and moves controller focus to the next control.
     - D-pad left and right stay with the field, so the caret can move.
   - Typing goes through the native input and its existing filter (`codeInput.ts`), and the game ignores keys from text fields (`desktopInput.ts:23-26`). No change is needed there.
7. **Focus ring (P1).**
   - While the controller is the active device, `document.body` gets the class `pad-focus`.
   - `overlay.css` adds `.pad-focus [data-pad-layer] :focus { outline: 3px solid …; outline-offset: 2px }`, with colour and width from the existing button tokens and visible on the dark Dead City UI.
   - `overlay.css` has no `:focus` rules today, so nothing conflicts.
   - Without the class there is no ring, and touch looks exactly as today.
   - Who sets it:
     - in a run, 12.1's `InputRouter.onSourceChange`;
     - on the menus, a controller press in the menu loop turns it on;
     - a mouse move or key press (desktop) turns it off;
     - a touch on the game area turns it off, through the router.
   - Touch taps on DOM controls do not turn it off (12.1 P4).
   - Keep the state in one small store, `input/padMode.ts`, read by both the router and the menu loop. The router stays the authority during a run.
8. **One owner per frame (P6).** While a pad layer is top:
   - The Game scene's `router.build` still runs. The fight is neutral through `standsStill`, and on Start/Lobby/Results there is no fight.
   - Start keeps 12.1's meaning: it toggles the in-run menu through `router.takeMenu()`. The menu loop ignores Start, so it never acts twice.
   - A and B belong to the menu loop only. In 12.1 they do nothing in the fight, so there is no clash. Story 12.4 must take this into account.
9. **Accessibility unchanged.** Keyboard Tab order, `role="dialog"` and the `aria-*` attributes stay as they are. The controller moves real DOM focus, so screen readers follow it.

## Tasks / Subtasks

- [ ] **T0 Spike** (AC 1). Build a throwaway test page, have the designer try it on both phones, record the results in `docs/qa/browsers.md`, then delete the page.
- [ ] **T1 Pure focus core** (AC 4; P2). `ui/focusMath.ts` with tests:
  - the grid: 3 × 2 cards, all 4 directions, edges stay put;
  - a list: the menu items and the shop's upgrade rows;
  - the nearest control when the current one is gone;
  - `pickLayer` by priority;
  - repeat timing: 400 ms, then 150 ms; releasing resets it.
- [ ] **T2 Menu loop** (AC 2, 3, 5, 8). Inputs are `win`/`doc`, injected for tests:
  - `ui/focusNav.ts`: `startFocusNav(win, doc)` with the rAF loop, own `GamepadState`, layer discovery, focus, and A/B/direction dispatch.
  - `ui/padPress.ts`: the handler registry.
  - `input/padMode.ts`: the store from AC 7.

  Tests run in `node` with fake element objects (rects, `focus()`/`click()` spies). Don't add jsdom, so the test environment doesn't change for one story.
- [ ] **T3 Screens join** (AC 3, 4, 5; P3, P4):
  - Add `data-pad-layer` to each screen root in AC 3.
  - Add `data-pad-back`:
    - InRunMenu: Resume, or Cancel in confirm;
    - Shop: Close, or Cancel in replace (plus a registered back that deselects a card first);
    - ServerNotice: its button;
    - GfxNotice banner: OK.
  - Register pad handlers for EvacVote and the Results dawn.
  - No touch handler changes.
- [ ] **T4 Text fields** (AC 6): synchronous `focus()`, the hint component, the `visualViewport` check, and the B/down blur. Test the hint logic as a pure function: platform × viewport change × events → shown or hidden.
- [ ] **T5 Ring** (AC 7): the `pad-focus` class with its CSS, and padMode wiring in the router (`onSourceChange`) and in the menu loop.
- [ ] **T6 Gates.** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- [ ] **T7 Real-phone test** (designer). Do this with an Xbox controller and a DualSense, on Android and iPhone:
  1. Start: type a name, enter a code, Join.
  2. Lobby: Ready, then Start (as host).
  3. Wave: Start opens the in-run menu; Resume; Leave → Cancel.
  4. Build phase: once 12.4 lands, open the shop with the controller. Until then, open it by touch, then buy, reroll, replace and close with the controller.
  5. Vote: EXTRACT / STAY.
  6. Results: skip the dawn, then Back to lobby.
  7. ServerNotice: kill the server to make it show.

  Record the results in `docs/qa/browsers.md`.

## Dev Notes

### Current state (from the code survey, 2026-11-25)

- **Mounting.**
  - `App` mounts every screen at all times, and each screen decides whether to render (`ui/App.tsx:20-37`).
  - `uiStore` holds `start | lobby | playing{menu} | results` (`ui/uiState.ts:9-26`).
  - Shop, EvacVote, ServerNotice and GfxNotice have their own stores, so several layers can show at once: shop or vote over `playing`, ServerNotice over anything. That's why AC 3 uses priorities.
- **Pointer events.** `#ui` is `pointer-events: none` (`index.html:28-29`). Each overlay turns them on itself (`overlay.css`):
  - `.menu`: 186;
  - `.in-run-menu`: 466;
  - `.shop`: 513;
  - `.evac__btn`: 1052;
  - `.dawn`: 1092;
  - `.game-over`: 34.
- **Keyboard today.** No component has `tabIndex`, `onKeyDown` or Escape handling. The only `autofocus` uses are InRunMenu and the shop's replace step, and the only `focus()` call is the share-link focus in `StartScreen.tsx:55-60`. Esc for the menu and shop goes through `KeyboardMouse` and `GameScene.update:1891-1904`. Keep that path; Start uses it (12.1).
- **Screens and their controls:**
  - **StartScreen.**
    - Name form: `#start-name` and Create (`type="button"`).
    - Code form: `#start-code` and Join (`type="submit"`).
    - Refresh inside error text; Practice solo.
  - **LobbyScreen:** Copy, Share, Ready, Start (host), Leave. **Leave is not the back control** (P4).
  - **InRunMenu:** Resume and Leave game; the confirm step has Leave and Cancel.
  - **Shop.**
    - The root `onClick` deselects the card (`:40`).
    - Reroll and Close.
    - Cards are `button[aria-pressed]` in a 3 × 2 group; empty cards are `div`s, which are not focusable, and correctly so.
    - Upgrade rows, consumable rows, and the replace step.
  - **Results:** the dawn `div` acts on `pointerdown`; then one button, Back to lobby or Restart.
  - **EvacVote:** EXTRACT / STAY act on `pointerdown` with `preventDefault`. A keyboard or `click()` would do nothing today, hence the registry.
  - **ServerNotice:** one button.
  - **GfxNotice:** the reload click is on the parent div; the banner has OK.
- **No DevCheats in production** (`main.ts:172-181`); not a layer.

### Guardrails

- **Don't reimplement focus.** Move real DOM focus with `el.focus({ preventScroll: true })` everywhere except text fields, which keep their own scroll-into-view. A fake "selected" highlight would break keyboard and screen-reader users.
- **Don't change touch paths.** The 2-step shop buy, the vote's `pointerdown` and the dawn skip were each tuned for phones in earlier stories (3.3, 5.13, 6.11, 6.12). Pad activation goes beside them.
- **Don't add jsdom** just for this story. The core is pure, and the adapter takes `win`/`doc`, as `attachDesktopInput` does.
- **Frame and activation.** `focus()` for text fields must run synchronously inside the same callback that read the press from `getGamepads()`. Chrome's activation comes from that read, so don't defer it to a microtask, a Preact effect or a `setTimeout`.
- **Epic 7 hook.** 7.3 (Progress hub and unlocks), 7.6 (account forms: username and password fields get AC 6 for free because they're inputs) and 7.10 (editor tabs, part tiles, swatches) join through AC 3's attributes. Their story files already say so (2026-11-25 correct course).

### Testing standards

- Vitest in `node` (`vitest.config.ts:6`); tests sit next to the code.
- Each P rule has at least one named test.
- The real-phone checks (T0, T7) are the designer's: iPhone can't be tested in the cloud container.

### Project structure notes

- New files: `apps/client/src/ui/focusMath.ts` (+ test), `ui/focusNav.ts` (+ test), `ui/padPress.ts`, `ui/TapToType.tsx` (or inline in `StartScreen`), `input/padMode.ts`.
- Updated: every screen in AC 3, `overlay.css`, `main.ts` (start the loop), and `InputRouter` (padMode).
- No `packages/shared` or server change.

### Project context rules

There's no `project-context.md`. Follow the README conventions: exact dependency pins (this story adds none), and the lint boundary for `packages/shared`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 12.2]
- [Source: _bmad-output/implementation-artifacts/12-1-controller-in-the-fight.md]
- [Source: _bmad-output/forge/controller-support/forged-idea.md (text-field lock)]
- [Source: _bmad-output/implementation-artifacts/2-11-in-run-menu.md; 3-3-fixed-list-shop.md; 5-13-roguelike-card-shop.md; 6-11-evacuation-vote.md]
- [WebKit bug 217675: Safari has no gamepad user gesture](https://bugs.webkit.org/show_bug.cgi?id=217675)
- [W3C: iOS needs user activation to show the keyboard](https://lists.w3.org/Archives/Public/public-webapps-github/2021Aug/0238.html)

## Decisions (accepted by the designer 2026-11-25: all recommendations are rules)

| # | Question | Decision |
| --- | --- | --- |
| D1 | Focus movement | **Spatial (nearest control in that direction)**, not a fixed tab order. It works for the shop grid and for future screens without per-screen lists |
| D2 | Wrap at edges | **No wrap**. Focus stops at the edge, so you always know where you are |
| D3 | B on the start screen, lobby, Results, vote | **Does nothing**. Leaving a lobby or a run must be a deliberate A on Leave |
| D4 | Left stick in menus | **Yes, past 50 %**, with the same repeat timing as the d-pad |
| D5 | "Tap to type" on Android | **Shown unless the keyboard is seen to open** (viewport shrinks). After T0, if Android always opens it, the hint is iPhone-only |
| D6 | Ring style | **3 px outline in the UI accent colour, 2 px offset**, controller mode only |
| D7 | Focus memory | **Each layer starts at its first control (or `autofocus`)**; no memory between openings in v1 |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Context analysis completed: a full developer guide was written from the real code.

### File List
