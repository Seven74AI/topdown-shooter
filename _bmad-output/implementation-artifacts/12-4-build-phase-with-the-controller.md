# Story 12.4: Build phase with the controller

Status: ready-for-dev

<!-- Epic 12 story 4 of 4. Story file 2026-11-25 (gds-create-story) from the real code on branch claude/lucid-lamport-r1st1y. Depends on 12.1 (GamepadState, source) and 12.2 (pad layers: A/B belong to a DOM screen when one is on top). It uses 12.3's binding table and badges if 12.3 is built first; otherwise it creates the table itself and 12.3 adds the badges. Sources: forge `_bmad-output/forge/controller-support/forged-idea.md`; `planning-artifacts/sprint-change-proposal-2026-11-25-controller.md`. Decisions D1–D8 accepted by the designer 2026-11-25 ("Okay", all recommendations). -->

## Story

As a player with a controller,
I want to pick, carry, rotate and place buildings with it, and repair, upgrade, sell, undo and get ready,
so that the build phase doesn't need the screen.

**Scope:** every build-phase action the HUD offers to touch today:
- the build bar (tiles, Shop, More ▸);
- the hand cluster (⟳, Place, ✕);
- the pinned-ghost chip;
- the action bar for a selected building (Move · Upgrade · Repair · Sell · ✕);
- the undo chip ↶;
- Ready.

The shop's own screen is DOM and already works through 12.2.

## Acceptance Criteria

### Player-visible rules (each is a test)

- **P1 "Everything a thumb can do in a build phase, the controller can do."** With the controller only, I can play a build phase from start to finish:
  - pick each of the 7 building types;
  - open the shop;
  - place a chain of buildings;
  - rotate both ways;
  - cancel, take back with undo;
  - select my building or a teammate's;
  - move, upgrade, repair and sell my building;
  - press Ready.
- **P2 "Same rules as touch and keys."** Every controller action goes through the HUD's existing press fields and pick paths, so caps, money, red-ghost reasons, pending under lag and the undo window stay exactly as they are today:
  - press fields: `hudModel.*Pressed`, `buildPick`;
  - pick paths: `keyPick`, `pickUpSelected`, `repairPanel.*`.
- **P3 "I can hit the spot I want."**
  - Walking carries the ghost in front of me (5.15).
  - The d-pad nudges a held ghost by exactly one 0.5 m grid step. The first nudge pins it, like 5.19's drag; walking again past the dead zone returns it to carry, like 5.19's "↩ carry".
- **P4 "I always know what A will do."**
  - Hands empty, a candidate building in reach: it gets the selection outline's lighter "candidate" look and an A/✕ badge (12.3). A selects it.
  - No candidate: A presses the focused build-bar tile, which has a focus ring and an A/✕ badge.
  - Never both at once.
- **P5 "Menus win."** While a 12.2 pad layer is on top (the shop, the in-run menu, the vote), none of these buttons acts in the build phase.

### Behaviour

1. **Build-phase mapping** (added to `PAD_BINDINGS`, with a `build` context; the fight mapping from 12.1 is unchanged).

   **Hands empty, no building selected:**

   | Button | Action |
   | --- | --- |
   | LB / L1, RB / R1 | Move the build bar focus left or right over all 8 slots, including Shop and More ▸ (no wrap) |
   | A / ✕ | Select the candidate building (AC 3) if there is one, else press the focused tile (`pressTile`, `HudScene.ts:1525-1538`) |
   | D-pad down | Ready (`readyPressed`), only while the Ready button shows (`GameScene.ts:1077`) |
   | View / Create | Undo (`undoPressed`, the 5.20 chip path) |

   **Holding a building:**

   | Button | Action |
   | --- | --- |
   | A / ✕ | Place (`confirmPressed`; 5.18's chain is kept) |
   | B / ○ | Cancel (`cancelPressed`) |
   | RT / R2 | Rotate clockwise (`rotatePressed`) |
   | LT / L2 | Rotate counter-clockwise (`rotateCcwPressed`, 5.23) |
   | LB / L1, RB / R1 | The previous or next building type: put this one away and pick that one, through `keyPick` (`GameScene.ts:1351`), which already does that for the keys 1–7 |
   | D-pad | Nudge one grid step (AC 4) |
   | View / Create | Undo |

   **Building selected (action bar open):**

   | Button | Action |
   | --- | --- |
   | D-pad left / right, or LB/RB | Move focus over the shown action buttons |
   | A / ✕ | Press the focused action: `movePressed`, `upgradePressed`, `repairPressed`, `sellPressed`, or close |
   | B / ○ | Close (`repairClosePressed`) |

   Swap (Y/△), the consumable (X/□), Start, and both sticks keep their fight meaning in every state. Holding a building still clears aim and fire (`holdBuildingInput`).
2. **Routing.** A new pure `routePadBuild(pad, model, state, out)` in `scenes/padBuild.ts`, the controller twin of `routeBuildKeys` (`scenes/buildKeys.ts`). It is called next to it in `GameScene.buildKeys` (`:1335`), with the same `blocked` flag (menu or shop open), plus `padLayerTop` from 12.2 (P5).
   - Every latch is taken every frame, so a press made under a menu never fires later (the same rule as 5.23).
   - It only sets existing `hudModel` fields, plus three new ones:
     - `padTileStep` (−1, 0 or +1);
     - `padTilePress`;
     - `padActionStep` and `padActionPress`.
   - The HUD applies them, because the HUD owns the bar's `barSlots` and page (`HudScene.ts:332`) and the action buttons' order.
3. **Candidate building** (P4).
   - In a build phase, with hands empty and no selection, the candidate is the nearest building whose footprint is within **1.5 m** of my survivor, preferring the one in my facing direction (aim if aiming, else the walk direction).
   - Anyone's building counts: the action bar already shows each player what they may do.
   - The pure `padCandidate(world, x, y, facingX, facingY)` in `scenes/padBuild.ts` is tested.
   - A on a candidate calls `repairPanel.tap(world, b.centreX, b.centreY)` (`repairPanel.ts:184`), the same path a world tap takes (`GameScene.updateRepair`). There's no new selection logic.
   - The candidate look reuses `BuildingSelectView` (`GameScene.ts:494, 710, 2104`) in a dimmer "candidate" style.
4. **Nudge** (P3).
   - Each d-pad press while holding a building calls `placement.drag(±BUILD_GRID_M, 0 | ±BUILD_GRID_M, view bounds…, began)`. The first press passes `began = true` (`placement.ts:474`): the same path as 5.19's thumb drag, so pinning, clamping to the view (`PIN_VIEW_INSET_M`) and avoiding teammates' ghosts are inherited.
   - Moving the left stick past its dead zone calls `placement.unpin()` (`:591`), which returns to carry.
   - Holding a d-pad direction repeats with 12.2's timing (400 ms, then 150 ms).
5. **Badges and focus ring.**
   - If 12.3 is in, show badges on:
     - the bar's left and right edges (LB and RB, or L1 and R1);
     - the focused tile (A/✕);
     - the hand cluster (RT/R2 on ⟳, A/✕ on Place, B/○ on cancel);
     - the focused action button (A/✕) and close (B/○);
     - the undo chip (View/Create);
     - Ready (d-pad down).
   - The focused tile and action button get a 3 px ring in the 12.2 ring colour, drawn in the HUD's Graphics on change only.
   - No ring and no badges unless `router.source === "gamepad"`.
6. **Focus defaults.**
   - The bar focus starts on slot 0 at each build phase, and is kept across picks within a phase.
   - The action bar focus starts on its first shown button each time it opens.
   - After the More ▸ page flip, focus goes to slot 0 of the new page.
7. **The ping button (8.7).** D-pad up stays reserved (12.1 D1). In a build phase with hands empty it does nothing until 8.7. While I hold a building, d-pad up is a nudge: 8.7's ping button is hidden while holding, so there's no clash.
8. **Real-phone playtest** (designer; AC "Given a real-phone playtest" in epics.md). On an Android phone and an iPhone, with an Xbox controller and a DualSense, play two build phases controller-only:
   - place a wall line along a 0.5 m grid edge next to an existing barricade, using carry plus nudge;
   - place a turret behind it;
   - move one building, upgrade one, sell one, undo once;
   - open the shop and buy something;
   - Ready.

   Record the time taken and anything awkward in `docs/qa/browsers.md`. If carry plus nudge can't hit a chosen spot, that's a fail to fix before done.

## Tasks / Subtasks

- [ ] **T1 Bindings** (AC 1). Add the `build` context entries to `PAD_BINDINGS`, or create the table if 12.3 isn't built (see 12.3 AC 1). Test: no clashes within each context (hands empty, holding, selected).
- [ ] **T2 `routePadBuild`** (AC 2; P2, P5). In `scenes/padBuild.ts`, with tests in the style of `buildKeys.test.ts`:
  - each state's buttons set the right fields;
  - `blocked` and `padLayerTop` take the latches and set nothing;
  - holding + LB/RB calls the slot path with ±1, clamped to the list;
  - Ready only when the Ready button shows.
- [ ] **T3 Candidate** (AC 3; P4). `padCandidate` with tests:
  - nearest wins;
  - facing breaks a tie;
  - nothing beyond 1.5 m;
  - teammates' buildings count;
  - nothing while holding or while the panel is open.

  Also add the "candidate" style to `BuildingSelectView`.
- [ ] **T4 Nudge** (AC 4; P3). Wire the d-pad to `placement.drag` and the stick to `unpin`. Tests through `placement.test.ts`'s existing helpers: one nudge is exactly 0.5 m on the grid, the first nudge pins, a stick move unpins, and clamping at the view edge is inherited.
- [ ] **T5 HUD focus** (AC 5, 6). `HudScene` applies `padTileStep`/`padTilePress` (bar focus and `pressTile(focus)`) and `padActionStep`/`padActionPress`, and draws the ring. Put the pure focus-index helpers (step with no wrap, reset rules, skipping hidden action buttons) in `scenes/padBuild.ts`, with tests.
- [ ] **T6 Gates.** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Then a desktop Chrome run with a controller if one is available: a full solo build phase without the mouse.
- [ ] **T7 Playtest** (designer): AC 8.

## Dev Notes

### Current state

- **Desktop building keys** (5.23).
  - `routeBuildKeys(kb, m, holding, blocked, out)` (`scenes/buildKeys.ts`) takes every latch each frame. R and Space press ⟳ and Place only while holding; Z or Ctrl+Z press undo; digits and M are handed back.
  - `GameScene.buildKeys` (`:1335-1339`) calls it and runs `keyPick(host, slot, blocked)` (`:1351`): put away or swap the held type, following the bar's cap and money rules.
  - `onPickUpKey` → `pickUpSelected()` (the ✥ Move path).
  - **Mirror this shape**; don't reach into placement directly except for the nudge.
- **Build bar** (5.16).
  - 8 slots (4 × 2; `BUILD_BAR_SLOTS`). Slot values: an item index, `SLOT_SHOP` (−2) or `SLOT_MORE` (−3); `PAGE_ITEMS = 6` when paging.
  - `HudScene.pressTile(s)` (`:1525`) sets `buildPick` or `shopPressed`, or flips the page.
  - The HUD owns `barSlots` and `barPage`.
- **Hand cluster** (3.4/5.15): `PLACE_IDS = ["rotate", "confirm", "cancel"]` (`HudScene.ts:167`), wired to `rotatePressed`, `confirmPressed` and `cancelPressed`. The mouse wheel up sets `rotateCcwPressed`.
- **Action bar** (5.21/5.22):
  - `ACTION_BUTTON_IDS = ["move", "upgrade", "repair", "sell", "repairClose"]` (`:204`). Some are hidden per building (`moveShown`, `upgradeShown`, `sellShown`).
  - `GameScene.updateRepair` reads `worldTap`, `repairPressed`, `repairClosePressed`, `upgradePressed`, `sellPressed`, `movePressed` and the long press (`:1386-1455`).
  - Selection is `repairPanel.tap(world, x, y)` from a world tap.
- **Pinning** (5.19): `placement.drag(dxM, dyM, bounds…, began, avoid, avoidCount)` (`placement.ts:474`) and `unpin(resetSide)` (`:591`). The chip's "↩ carry" is `chipPressed`.
- **Ready** (3.1): `readyPressed`, shown when `m.readyButton` (`GameScene.ts:1077`) is true.
- **Undo** (5.20): `undoPressed`; its own path checks that the chip is shown.
- **Scene order.** Phaser updates Boot, then Game, then Hud (`main.ts:53`). So the HUD applies `padTile*` and `padAction*` in the same frame after the Game scene sets them, and the Game scene reads the HUD's resulting `buildPick`, `shopPressed` and action presses on the next frame. That is exactly how touch presses flow today.

### Guardrails

- No new build rules: every action ends in a path that touch or keys already use (P2). The only new behaviours are the candidate and the bar or action focus.
- Do not use 12.2's DOM focus loop for the HUD: the HUD is Phaser.
- Keep `holdBuildingInput` (`input/menuInput.ts`): holding still clears aim and fire.
- In a build phase, A and B belong to 12.2 whenever a pad layer is on top (P5). The shop opened from the Shop tile becomes a layer, and from then on the controller is in the shop.
- `packages/shared` stays untouched: `BUILD_GRID_M` and `buildingAtPoint` are only imported.

### Testing standards

Vitest in `node`; pure helpers in `padBuild.ts`; reuse the `placement.test.ts` and `buildKeys.test.ts` styles. Each P rule has a named test. The feel is checked by the playtest (AC 8).

### Project structure notes

- New files: `scenes/padBuild.ts` and its test.
- Updated: `input/padBindings.ts`, `scenes/GameScene.ts` (`buildKeys`, `updateRepair` candidate), `scenes/HudScene.ts` (focus, ring, badges), `scenes/hudModel.ts` (the new fields and their reset defaults), and `BuildingSelectView`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 12.4]
- [Source: _bmad-output/implementation-artifacts/5-15-carry-the-ghost-and-keep-moving.md; 5-16-build-bar-replaces-the-shop-for-buildings.md; 5-18-place-place-place-chain-and-pending-under-lag.md; 5-19-thumb-drag-to-nudge-and-pin.md; 5-20-take-back-sell-and-undo.md; 5-21-building-action-bar.md; 5-23-placement-feel-and-owner-marks.md]
- [Source: docs/ideas/building-ux/ux-spec.md]
- [Source: _bmad-output/implementation-artifacts/12-1-…, 12-2-…, 12-3-… story files]

## Decisions (accepted by the designer 2026-11-25: all recommendations are rules)

| # | Question | Decision |
| --- | --- | --- |
| D1 | How to pick a building type | **LB/RB move the bar focus; A picks**. Holding a building, LB/RB switch type directly (like the keys 1–7) |
| D2 | Rotate | **RT clockwise, LT counter-clockwise** |
| D3 | Fine placement | **The d-pad nudges one 0.5 m step (it pins); the stick returns to carry**: in from the start, not only if the playtest fails |
| D4 | Selecting a building | **The nearest within 1.5 m (facing breaks ties), shown as a candidate with an A badge**; no cursor |
| D5 | Ready | **D-pad down** |
| D6 | Undo | **View / Create** |
| D7 | Teammates' buildings as candidates | **Yes**: anyone can repair them (3.7), and the action bar shows only what I may do |
| D8 | Bar focus memory | **Kept within a build phase, reset to slot 0 at the next one** |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Context analysis completed: a full developer guide was written from the real code.

### File List
