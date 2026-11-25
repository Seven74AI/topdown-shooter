# Story 12.3: Controller prompts on the HUD

Status: ready-for-dev

<!-- Epic 12 story 3 of 4. Story file 2026-11-25 (gds-create-story) from the real code on branch claude/lucid-lamport-r1st1y. Depends on 12.1 (GamepadState, the "gamepad" source). Can be built before or after 12.4. If it comes first, 12.4 adds its bindings to the table this story creates. Sources: forge `_bmad-output/forge/controller-support/forged-idea.md` (HUD lock); `planning-artifacts/sprint-change-proposal-2026-11-25-controller.md`. Decisions D1–D6 at the end: pending the designer's approval. -->

## Story

As a player,
I want the HUD to show my controller's buttons,
so that I press the right one in a fight.

**Scope:** the Phaser HUD (`scenes/HudScene.ts`) and one shared binding table. The DOM screens' focus ring is Story 12.2's. Ping prompts are added when Story 8.7 is built.

## Acceptance Criteria

### Player-visible rules (each is a test)

- **P1 "The HUD speaks my controller's language."**
  - While the controller is the active device, every HUD button that a controller button does something to shows a small **prompt badge** for that button, in the controller's family:
    - **Xbox:** A, B, X, Y, LB, RB, LT, RT, View, Menu.
    - **PlayStation:** ✕, ○, □, △, L1, R1, L2, R2, Create, Options.
  - Without a controller (touch, mouse) there are no badges, and today's HUD is unchanged.
- **P2 "A badge only shows what really works."**
  - Badges come from one binding table, which is also what the input code reads (AC 1), so a badge can never show a button that does nothing.
  - A HUD button whose action isn't bound yet shows no badge. Until 12.4, that is the build bar, the hand cluster, the action bar and undo.
- **P3 "✕ never means two things."**
  - On a PlayStation controller ✕ is the confirm button (Place, A-equivalent).
  - So the hand cluster's cancel button and the action bar's close button change their ✕ glyph to **○**, with a ○ badge.
  - On Xbox, and on touch or mouse, they keep ✕ (an Xbox badge would show B).
- **P4 "It follows the controller in my hands."**
  - The family comes from the active pad's `gamepad.id` (AC 2). Switching controllers (12.1 D4) switches the family on the next frame.
  - An unknown id gets Xbox prompts.
- **P5 "Prompts never block play."**
  - Badges sit on the button's corner and add no hit area: `HudButtons` rects are unchanged.
  - They respect the 9.7 size rule: badge text at least 14 px at dpr 1.

### Behaviour

1. **One binding table.** New `apps/client/src/input/padBindings.ts`:
   - `PAD_BINDINGS: Readonly<Record<PadAction, number>>`, mapping each action to a standard-mapping button index.
   - Actions: `swap: 3`, `consumable: 2`, `menu: 9`. 12.4 adds the build actions, and 8.7 adds `ping`.
   - 12.1's `GamepadState` reads the button indices from this table instead of literals, so input and prompts share one source.
   - The table lives in `apps/client` (not `packages/shared`): it's client input, like `keyMap.ts`.
2. **Controller family.** `padFamily(id: string): "xbox" | "playstation"` in `input/padFamily.ts`, a pure function with tests:
   - `/054c|dualsense|dualshock|playstation|wireless controller/i` → PlayStation. Sony's USB vendor id is 054c; on iOS a DualSense reports "DualSense Wireless Controller", and on Android "Wireless Controller" with vendor 054c.
   - Everything else → Xbox. That includes Microsoft's vendor id 045e and "Xbox Wireless Controller".
   - `GamepadState` exposes `activeId` (the string of the pad that drives), and the HUD reads `padFamily(router.pad.activeId)` only when the id changes.
3. **Badge art** (code-drawn, like every other HUD art; no new image files):
   - One reusable `PadBadge`: a Phaser Container with a Graphics disc and a Text or shape, created once per HUD button and then only shown, hidden or restyled (no allocation per frame).
   - **Xbox:**
     - A green `#3dbb4c`, B red `#e04a3b`, X blue `#3a7bd5`, Y yellow `#f2c12e`: white letter on the coloured disc.
     - LB, RB, LT, RT, View and Menu: a dark pill with a white label.
   - **PlayStation:** a dark disc with the shape drawn in Graphics, not as a Unicode glyph, because fonts on iOS and Android differ:
     - ✕ blue `#7ca8ff`, two crossed strokes;
     - ○ red `#ff6f6f`, a ring;
     - □ pink `#f59fd5`, a square outline;
     - △ green `#4fd6b0`, a triangle outline.
     - L1, R1, L2, R2, Create and Options: a dark pill with a white label.
   - **Size:** a 20 CSS px disc × dpr (pills are 20 px tall). Labels and shape strokes follow `outlinedStyle`'s dpr scaling.
   - **Placement:** the badge sits on the top-left corner of its button, inset 4 CSS px, inside the safe area (`HudScene` `insets`).
4. **Badges in this story:**

   | HUD button | Prompt | Notes |
   | --- | --- | --- |
   | Swap (`HudScene.ts:576`) | Y / △ | |
   | Consumable (`:591`) | X / □ | Shown only when the consumable button shows |
   | ☰ menu (`:596`) | Menu / Options | |

   12.4 adds the build bar edges (LB/RB and L1/R1), the focused tile (A/✕), the hand cluster (⟳ RT/R2, Place A/✕, cancel B/○), the action bar (focused button A/✕, close B/○), undo (View/Create) and Ready (d-pad down). For those, this story supplies `PadBadge`, the family state and the ✕ → ○ glyph rule (AC 5), ready for 12.4 to use.
5. **The ✕ → ○ rule.**
   - The hand cluster's cancel glyph comes from `PLACE_GLYPHS[2]` (`HudScene.ts:168`, `"✕"`).
   - The action bar's close label is `"✕"` (`:1272-1277`).
   - Both read a `cancelGlyph()` that returns `"○"` when the source is gamepad and the family is PlayStation, and `"✕"` otherwise.
   - The text is set only when it changes. The `shownActLabel` cache (review L2) already does this for the action bar; give the hand cluster the same cache.
   - The cancel button's red fill (`PLACE_CANCEL`) stays the same: only the glyph changes.
6. **When the badges show.** All of these must hold:
   - `router.source === "gamepad"`;
   - the button itself is visible;
   - no 12.2 pad layer is on top (a DOM screen over the HUD has its own focus ring).

   A badge is hidden the frame its button hides, so no stray badges are left behind when the vote, the menu or the shop is open.

## Tasks / Subtasks

- [ ] **T1 Binding table** (AC 1; P2). Create `input/padBindings.ts` and move 12.1's literal indices into it. Add `padBindings.test.ts`: no two actions share a button within one context (fight vs build; 12.4 adds the contexts), and every badge entry has a binding.
- [ ] **T2 Family** (AC 2; P4). Create `input/padFamily.ts` and its test, using the real `id` strings:
  - Android Chrome: `"Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"`, and `"Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"` for a DualSense.
  - iOS Safari: `"Xbox Wireless Controller Extended Gamepad"` and `"DualSense Wireless Controller Extended Gamepad"`.
  - An empty string, which falls back to Xbox.

  Add `activeId` to `GamepadState`.
- [ ] **T3 `PadBadge`** (AC 3; P5). Create `scenes/padBadge.ts`, holding the Phaser drawing plus a pure `badgeSpec(family, action)` that returns `{ shape | label, colour }` and is unit tested. Draw nothing per frame: restyle only on a family change.
- [ ] **T4 HUD wiring** (AC 4–6; P1, P3). In `HudScene`: create the badges, add a `drawBadges()` that runs from `update()` after the buttons draw and lays them out in `layoutButtons` (`:1019`), add `cancelGlyph()`, and gate everything on AC 6. Visibility logic gets a pure helper with tests: source × button shown × layer top → shown.
- [ ] **T5 Gates.** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Then a desktop Chrome check with a controller if one is available: the badges appear on the first press and vanish on a mouse move.
- [ ] **T6 Real-phone check** (designer). An Xbox controller and a DualSense, each on an Android phone and an iPhone: the family is right, the badges are readable in a blackout wave, and the PlayStation cancel shows ○. Record the results in `docs/qa/browsers.md`.

## Dev Notes

### Current state

- **HUD buttons** are Phaser `Graphics` and `Text` objects, hit-tested by the `HudButtons` rect registry on pointerdown (`input/HudButtons.ts:7-18`). They are laid out in `layoutButtons` (`HudScene.ts:1019`) inside the safe-area `insets`.
- **Draw-on-change** is the HUD's rule: `shownPlacement`, `shownPlaceValid`, `shownActLabel` (review L2), `barSlotsDirty`. The badges must follow it too: no `setText` and no Graphics `clear()` per frame.
- **Labels and glyphs:**
  - `PLACE_GLYPHS = ["⟳", "Place", "✕"]` (`:168`), with sizes from `PLACE_GLYPH_PX`.
  - The action bar's label is built at `:1271-1281`, where `"✕"` is the close label.
  - The undo chip glyph `"↶"` is at `:660`.
- **Source.** After 12.1, `router.source` is `"touch" | "mouse" | "gamepad"`. Stick drawing already reads it (`:1824`). Use the same source check; don't read the pad directly from the HUD.
- **Text styles.** `this.outlinedStyle(px)` scales by dpr. Reuse it for the badge labels.

### Guardrails

- Prompts are display only: never add a `HudButtons` rect for a badge.
- Don't add image or atlas files. Epic 9 (9.7) restyles them later, and its AC already lists the controller prompt icons.
- The family is per controller, not per platform: an Xbox controller on an iPhone shows Xbox prompts.
- Keep `packages/shared` untouched.

### Testing standards

Vitest in `node`, with pure helpers (`padFamily`, `badgeSpec`, badge visibility, `cancelGlyph`) tested next to their files. Don't test Phaser drawing in Vitest; check it on screen (T5, T6).

### Project structure notes

- New files: `input/padBindings.ts`, `input/padFamily.ts`, `scenes/padBadge.ts`, plus their tests.
- Updated: `input/GamepadState.ts` (the bindings and `activeId`) and `scenes/HudScene.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 12.3]
- [Source: _bmad-output/implementation-artifacts/12-1-controller-in-the-fight.md (mapping, source)]
- [Source: _bmad-output/implementation-artifacts/12-2-menus-with-the-controller.md (pad layers, ring)]
- [Source: _bmad-output/implementation-artifacts/5-21-building-action-bar.md; 5-15-carry-the-ghost-and-keep-moving.md; 9.7 UI art (epics.md)]

## Decisions (pending the designer)

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Badge position | **The button's top-left corner**, small: the button's own icon stays readable |
| D2 | Badge colours | **The controllers' familiar colours** (Xbox's coloured letters, PlayStation's coloured shapes): recognised at a glance in a fight |
| D3 | Unknown controller | **Xbox prompts** (the most common standard layout) |
| D4 | Cancel glyph on PlayStation | **○ in place of ✕** on the cancel and close buttons; the red fill is kept |
| D5 | Badges in the dark (blackout wave) | **Drawn above the darkness**, like the rest of the HUD; no dimming |
| D6 | A "controller connected" toast | **No**: the badges appearing is the signal |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Context analysis completed: a full developer guide was written from the real code.

### File List
