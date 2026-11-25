---
title: 'Always full speed: a move-stick setting in the in-run menu'
type: 'feature'
created: '2026-11-25'
status: 'done'
baseline_commit: '2a88929d9a1c248b20e5cdb88900eaa0955504d8'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On touch, how fast the survivor moves depends on how far the move stick is dragged (FR2: linear from the 10 % dead zone to full speed at the rim). Some players want to move at full speed all the time, whatever the drag.

**Approach:** Add a player setting `alwaysFullSpeed` (default off). When on, any move-stick drag past the dead zone moves at full speed in the stick's direction. Add a **Settings** item to the in-run ☰ menu that opens a small Settings view with this one toggle (Story 10.1 adds the other options to the same view later).

## Boundaries & Constraints

**Always:** Default off (today's analog stick stays the default). Stored with the other player settings in localStorage via `settings.ts` (try/catch, defaults on failure). Applies immediately, the next input built after the change. The dead zone is unchanged: inside it the survivor still stands still. Direction is unchanged. Keyboard/mouse is unaffected (WASD is already full speed). The setting is client-only: the input still carries a move vector of length ≤ 1, so the server and the shared sim need no change.

**Ask First:** Showing the Settings view on the start screen too; adding any other setting to the view; account sync of settings.

**Never:** No server/shared/wire changes. Don't build the rest of Story 10.1 (quality, sound, aim assist, account sync, migration). Don't change the aim stick.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Off, half drag | `alwaysFullSpeed: false`, stick at 50 % of the radius | magnitude as today (≈ 0.44), direction kept | N/A |
| On, half drag | `alwaysFullSpeed: true`, stick at 50 % | unit vector in the drag direction, magnitude 1 | N/A |
| On, inside dead zone | on, stick at 5 % | zero vector, magnitude 0 | N/A |
| On, past rim | on, stick at 200 % | magnitude 1 | N/A |
| Storage broken | localStorage throws | setting reads off; toggling still works for the session | existing try/catch |
| Old saved settings | stored JSON without the key | reads off (defaults merge) | N/A |

</frozen-after-approval>

## Code Map

- `apps/client/src/settings/settings.ts` -- `PlayerSettings` + `DEFAULTS`; add the field.
- `apps/client/src/input/stick.ts` -- pure `stickVector` math (dead zone, linear rescale).
- `apps/client/src/input/TouchSticks.ts` -- `moveVector()` calls `stickVector` for the move thumb.
- `apps/client/src/input/InputRouter.ts` -- copies `moveVector()` into `out.moveX/moveY` (touch branch).
- `apps/client/src/ui/uiState.ts` -- `MenuState`, `MenuAction`, `menuStep` state machine.
- `apps/client/src/ui/menuItems.ts` -- `MENU_ITEMS`, `MENU_TEXT`.
- `apps/client/src/ui/InRunMenu.tsx` -- renders each menu state (Players list is the pattern for a sub-view with Back).
- `apps/client/src/ui/overlay.css` -- `.in-run-menu__*` styles.

## Tasks & Acceptance

**Execution:**
- [x] `apps/client/src/settings/settings.ts` -- add `alwaysFullSpeed: boolean` (doc comment), default `false` -- the stored setting.
- [x] `apps/client/src/input/stick.ts` -- add an optional last parameter `fullSpeed = false` to `stickVector` (after `out`, so existing call sites keep working): when true and outside the dead zone, output the unit direction with magnitude 1 -- keeps the math pure and testable.
- [x] `apps/client/src/input/TouchSticks.ts` -- `moveVector()` passes `getSettings().alwaysFullSpeed` -- read each call so a change applies at once.
- [x] `apps/client/src/ui/uiState.ts` -- add `"settings"` to `MenuState` and `MenuAction`; `menuStep`: `open` + `settings` → `settings`; `settings` + `back`/`cancel` → `open`; toggle/resume close it as for other states.
- [x] `apps/client/src/ui/menuItems.ts` -- add a secondary `settings` item (always visible) between Players and Leave game; texts `settings: "Settings"`, `alwaysFullSpeed: "Always full speed"`, `alwaysFullSpeedHint: "Move at full speed however far you drag the stick"`.
- [x] `apps/client/src/ui/InRunMenu.tsx` -- `settings` view: title, one labelled switch (`role="switch"`, `aria-checked`) bound to `getSettings().alwaysFullSpeed` / `saveSettings`, hint line, Back button (autofocus) -- same dialog structure as Players.
- [x] `apps/client/src/ui/overlay.css` -- style the toggle row to match the menu (thumb-sized hit target ≥ 44 px).
- [x] Tests: `stick.test.ts` (matrix rows), `settings.test.ts` (default off, old JSON without key), `uiState.test.ts` (settings transitions), `menuItems.test.ts` (updated item order).

**Acceptance Criteria:**
- Given a run on a phone, when I open ☰, then I see Settings between Players (if shown) and Leave game.
- Given the Settings view, when I tap the "Always full speed" switch, then it flips, is saved, and survives a reload.
- Given the switch is on, when I drag the move stick a little past the dead zone, then my survivor moves at the same speed as a full drag.
- Given the Settings view, when I tap Back, then I return to the menu; Esc / ☰ close the menu.

## Design Notes

Calling `getSettings()` per frame is cheap (cached object). Putting the flag into `stickVector` (not `InputRouter`) keeps `magnitude` consistent for any other reader of the move vector.

## Verification

**Commands:**
- `npx vitest run apps/client/src/input apps/client/src/ui apps/client/src/settings` -- expected: all pass
- `npm run gate` -- expected: green (lint, types, tests, no-cheats scan)

**Manual checks (if no CLI):**
- `npm run dev`, phone emulation in Chromium: toggle on, small drag moves at full speed; toggle off restores analog.

## Suggested Review Order

**Full-speed move math**

- Entry point: one flag forces magnitude 1 past the dead zone; direction and dead zone unchanged.
  [`stick.ts:34`](../../apps/client/src/input/stick.ts#L34)

- Setting read every frame, strict `=== true` so a hand-edited value counts as off.
  [`TouchSticks.ts:125`](../../apps/client/src/input/TouchSticks.ts#L125)

- New stored setting, default off; old saved JSON merges to off.
  [`settings.ts:11`](../../apps/client/src/settings/settings.ts#L11)

**Settings view in the in-run menu**

- State machine: open → settings; Back/Cancel → open; Esc/☰/Resume close.
  [`uiState.ts:109`](../../apps/client/src/ui/uiState.ts#L109)

- Menu item between Players and Leave game, plus wording.
  [`menuItems.ts:32`](../../apps/client/src/ui/menuItems.ts#L32)

- Switch reads the stored value at render (single source of truth), saves on tap.
  [`InRunMenu.tsx:68`](../../apps/client/src/ui/InRunMenu.tsx#L68)

- Switch styles: 48 px row, yellow when on.
  [`overlay.css:438`](../../apps/client/src/ui/overlay.css#L438)

**Tests**

- Wiring: half drag goes full speed when on, analog when off.
  [`TouchSticks.test.ts:10`](../../apps/client/src/input/TouchSticks.test.ts#L10)

- Matrix rows on the pure math.
  [`stick.test.ts:34`](../../apps/client/src/input/stick.test.ts#L34)

- Menu transitions.
  [`uiState.test.ts:69`](../../apps/client/src/ui/uiState.test.ts#L69)
