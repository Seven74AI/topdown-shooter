---
baseline_commit: a06c9cf
---

# Story 10.10: Build button (hybrid build-phase UI)

Status: review

(Waiting on the designer's layout pick, **Decision BU-1** below. Building UX follow-up to Stories 5.15–5.21. Designer decision 2026-11-25: "hybrid" — a **Build** button plus the **last-placed building** as a one-tap quick tile; Build opens the full grid as a panel and a pick closes it. Options page: `docs/art/build-ui/index.html`. Written with `gds-create-story` (+ `gds-ux` for the layout thinking), headless.)

## Story

As a player in a build phase,
I want my last building one tap away and the rest of the list behind a Build button,
so that repeat placements stay instant and the right edge of the screen stays clear to see the street.

## Decision log (auto-accepted, 2026-11-25)

| # | Decision | Status |
| --- | --- | --- |
| BU-0 | **Story key `10-10-build-button`, Epic 10 (Performance and polish).** Epic 5 (where the building UX lives, 5.15–5.28) is `done` with its retro closed; Epic 10 is the open polish epic and still `backlog`, so a client-only UX polish story belongs there without reopening a closed epic. Builds any time after the designer picks BU-1 (no dependency on 10.1–10.9). | auto-accepted |
| BU-1 | **Layout (designer pick, A / B / C / D)** — see "Decision BU-1 (designer pick)" below. Recommended: **B**. | **designer 2026-11-25: B** |
| BU-2 | Where Shop lives. Recommended: a round 48 px Shop chip above Build when closed (B), and the panel's last tile when open. | auto-accepted (follows B) |
| BU-3 | Only 1–2 shop types unlocked (every new account, Story 7.4). Recommended: no Build button and no panel — the 1–2 tiles sit where quick tile + Build would be (zero extra taps, same footprint); Build appears from the 3rd unlocked type. | **designer 2026-11-25: as recommended** |
| BU-4 | Where the panel opens. Recommended: over the thumb corner, Close on Build's own spot, the same 3 × 3 cells on every phone; never inside the survivor's 48 px, never over Ready's row on the left of it, never within 12 px of ping / ☰. | auto-accepted (follows B) |
| BU-5 | The quick tile's states. Recommended: today's tile rules unchanged (below, AC 4). Before the first placement of the run it shows the first unlocked type in balance order. | auto-accepted |

## Decision BU-1 (designer pick)

Stills at 568 × 320 and 844 × 390 (dpr 2), panel closed and open, on a real build-phase screenshot: `docs/art/build-ui/build-ui-<A|B|C|D>-<568|844>-<closed|open>.png`; today for comparison: `docs/art/build-ui/build-ui-today-<568|844>.png`; all side by side on `docs/art/build-ui/index.html`.

| Code | Closed | Open | + | – |
| --- | --- | --- | --- | --- |
| **A** Corner pair, Shop in the panel | quick tile + Build in the corner, count above | 3 × 3 panel over the corner, Close on Build's spot, Shop = last tile | clearest edge (two controls) | Shop becomes two taps |
| **B** Corner pair + Shop chip — **recommended** | quick tile + Build (count badge on Build), 48 px round Shop chip above Build, ↶ above the quick tile | same 3 × 3 panel as A (Shop inside too) | repeat and Shop both one tap; same panel on every phone, clear of the survivor | three controls closed (still about half of today's footprint) |
| **C** Bottom shelf | Shop chip, quick tile, Build in one bottom row | one-row shelf across the bottom (7 types + Shop + Close), Ready hidden while open | always far from the survivor and the ghost | covers Ready and the move-stick half while open; 52 px tiles at 568 |
| **D** Thumb arc | as A | tiles fan round Build in two rings (inner r 96: cheap traps; outer r 168: the rest + Shop) | every tile one thumb sweep | new pattern; tops out at 8 tiles; ragged edge |

Why B: the designer's two goals are "repeat placements stay one tap" and "the screen edge stays clearer"; B keeps both one-tap paths the player uses every phase (repeat, Shop — the 5.13 cards are bought every build) and the open panel is the only option that is identical on every phone size, sits wholly in the thumb corner and removes today's 568 × 320 baseline breaches (tile 0 is 3 px and tile 1 is 40 px from the survivor's centre; `hudLayout.test.ts` `KNOWN_AS_BUILT`).

## Acceptance Criteria

The layout numbers below are for the recommended **B**; when the designer picks another code the builder swaps in that option's geometry from `docs/art/build-ui/src/mock.html` (same ACs otherwise).

1. **Closed cluster.** In a build phase with empty hands and nothing selected (the exact `stepBuildBar` show rule: `can && !holding && !selected`), the bottom-right shows, from the safe-area corner with the 16 px inset: **Build** (56 × 56, hammer glyph + "Build", the count "n/6" as a badge on its top-right corner), the **quick tile** 8 px to its left (56 × 56, today's tile: 5.26/5.27 icon + price, a small ↻ "again" mark), and **Shop** as a 48 px round chip 12 px above Build (gold edge, as today's Shop tile). Today's 4 × 2 grid is gone.
2. **One-tap repeat placement.** The quick tile is the **type I last placed** this run (a confirmed send — the 5.18 chain counts each placement), client-side only. One tap on it = exactly what tapping that tile in today's grid does (`stepBuildBar` → `pickError` → the 5.15 hold with that type), with no panel in between. While holding, the 5.18 chain keeps working as today (Place, Place, Place with the same type).
3. **Build → panel → pick closes it.** Tapping Build opens the panel: the shop types in balance order (`buildBarItems(balance, unlocks)`, Epic 7 unlock mask) + Shop in a 3 × 3 grid of 56 px cells (8 px gaps) over the corner, the bottom-right cell = **Close** on Build's own spot (tap Build/Close again → closed). Picking a type closes the panel and starts the hold in the same frame; picking Shop closes it and opens today's shop. More than 8 cells → the 8th becomes "More ▸" (today's paging rule, `buildBarSlots`). With 1–2 unlocked types, BU-3 applies.
4. **Affordability, cap and "why it's red" (5.16/5.17 unchanged).** On the quick tile and on every panel tile: short of money → 40 % opacity + red price (the only red, as built; colour rule: in play red = danger, these prices are the agreed 5.16 exception); at the cap → 40 % and the count badge reads "6/6" in today's `COUNT_FULL` colour; a refused tap toasts the same text (`pickRefusalText`: "Need $250 (you have $180)", "Building limit reached (6)") and picks nothing. Once holding, 5.17's reason line, culprit outline and hatch work exactly as today.
5. **The panel never covers the survivor or the ghost.** Every panel cell and the card behind it keep ≥ 48 px from the screen centre (`rectCentreGap` ≥ `CENTRE_CLEAR_CSS_PX`), sit inside the safe area, keep ≥ 12 px from ping and ☰, and are centred in the right half. The panel is only open with empty hands, and a pick closes it before the ghost appears, so the panel and the ghost are never on screen together; while holding, the closed cluster is replaced by the 5.15 hand cluster as today.
6. **What closes the panel:** Close/Build, a pick, Shop, a tap anywhere outside it (consumed: it neither moves nor selects a building that frame), the ping wheel opening, the in-run menu (☰ / Esc), the build phase ending, being downed, a building getting selected. It reopens closed (never remembered open across phases).
7. **Waiting and the ping wheel.** A waiting joiner (8.2, `m.watching`) sees no cluster and no panel. While the ping wheel is open (8.7) the cluster and the panel are hidden exactly like today's bar (`drawBuildBar`: `m.buildBar && !this.pingHud.wheelOpen`); the quick-use button keeps 8.7 B5 (it stays). Ping arrows stay drawn under the HUD (B16, no keep-offs to add).
8. **Neighbours re-anchor to the smaller cluster.** 5.12's swap and consumable buttons (`layoutRightButtons`), 5.20's ↶ (`layoutUndoChip`) and the count take the closed cluster's box instead of the grid's (`gridLeft/gridTop/gridRight`); Ready uses `readyLeftX` with the cluster's left edge, so at 568 × 320 it can return toward 40 px left of centre. 5.21's action bar (selected) and the hand cluster (holding) are unchanged and replace the cluster as today.
9. **Keyboard.** `Digit1`–`Digit7` / `Numpad1`–`Numpad7` keep picking type 1–7 directly (`keyPick`, item index, panel open or not) — unchanged. **B** (`KeyB`, free today) toggles the panel; Esc closes it before it opens the menu. Mouse: click = tap.
10. **No gameplay change.** No change to `packages/shared`, the server, balance, prices, the cap, the 5.15/5.18 placement rules or any message; `npm run release:check`'s cheat scan unchanged. Online and solo behave the same.
11. **Layout tests (the one HUD layout test).** Pure `layoutBuildCluster` / `layoutBuildPanel` (no Phaser, written into reused objects, `buildBar.ts`) tested at **568 × 320, 640 × 360, 800 × 360, 844 × 390, 1024 × 768 and 1920 × 1080**, with and without insets 44/21: closed and open modes join `hudLayout.test.ts` (no overlap, inside the safe area, ≥ 48 px from the centre, nothing pressable in the move-stick half, ≥ 12 px between separate controls); the `568x320 build tile0/tile1` and `640x360 build tile0` baseline lines are **deleted** (they no longer happen — the test demands it). Plus unit tests: the quick tile's type (first unlocked before any placement; last placed after; survives a phase change; a type no longer in the unlock list falls back), a pick closes the panel, every close cause in AC 6, hidden under the wheel and while watching, BU-3's ≤ 2-types layout.
12. **Browser stills** (Playwright, preinstalled Chromium, dpr 2, no videos): closed, open, short of money, at the cap, the ≤ 2-types layout, at 568 × 320 and 844 × 390, saved in `docs/art/10-10/` with a README; compare with the BU-1 stills.

## Tasks / Subtasks

- [x] Designer picks BU-1 (and answers BU-3 / BU-5); copy the pick into this file's decision log, then set `ready-for-dev` (AC all)
- [x] `buildBar.ts`: `quickType(items, lastPlaced)`; `layoutBuildCluster` + `layoutBuildPanel` (pure, reused out objects); `buildPanelSlots` (reuse `buildBarSlots` with 9 cells: 8 + Close); keep `stepBuildBar`/`pickError`/`tileState` as they are (AC 1–5, 11)
- [x] `ui/sizes.ts`: `BUILD_BTN_*`, `SHOP_CHIP_*`, `BUILD_PANEL_*` constants; remove the 4 × 2 constants only if nothing else reads them (AC 1, 3)
- [x] `HudScene.ts`: replace the 8-slot grid drawing (`barTiles`, `layoutBuildBar`, `drawBuildBar`, `placeBarSlots`, `pressTile`) with the cluster + panel; button ids `build`, `quick`, `shopchip`, `ptile0…8`; the state-key redraw stays on-change only, no per-frame allocation (AC 1–7)
- [x] `HudModel`: `buildPanelOpen`, `buildQuick` (type id); `GameScene`: set `lastPlaced` on a confirmed placement send; close causes (AC 2, 6)
- [x] `consumableButton.ts` / `undoChip.ts` / `readyLeftX`: take the cluster box (AC 8)
- [x] `keyMap.ts` / `KeyboardMouse.ts` / `buildKeys.ts`: `KeyB` → toggle; Esc closes the panel first (AC 9)
- [x] `hudLayout.test.ts`: closed + open modes at every size, baseline lines removed; `buildBar.test.ts` unit tests (AC 11)
- [x] Browser stills `docs/art/10-10/` (AC 12)

## Dev Notes

### What exists today (read before changing)

- **`apps/client/src/scenes/buildBar.ts`** (Story 5.16, 222 lines): `buildBarItems(balance, unlocks)` (cached per balance and mask; `shopBuildings` → `inPoolOnly`, Epic 7 K5), `buildBarSlots(count, page, out)` (8 slots, Shop last, "More ▸" past 7), `layoutBuildBar` (4 × 2 × 56 px, 8 px gaps, 16 px inset), `readyLeftX`, `pickError` (cap before money), `pickRefusalText`, `tileState` (`TILE_SHORT`, `TILE_CAP`), `stepBuildBar` (consumes `buildPick` only if the bar was shown last frame and still may show; `quiet` = 5.18's `barQuietMs`). **Keep** `stepBuildBar`'s rules: a quick-tile tap and a panel pick both go through `buildPick` so AC 10 of 5.16 (a pick counts only if it was on screen) and 5.18 Q2 (quiet window) still hold.
- **`HudScene.ts`**: `layoutBuildBar()` (~l. 1528), `pressTile()` (~l. 1555: building → `buildPick`, Shop → `shopPressed`, More → page), `drawBuildBar()` (~l. 1574: hidden under the open ping wheel; redraws on a state key only; dims the whole tile incl. price at `TILE_DIM_ALPHA`; red price `TILE_PRICE_SHORT`; count `COUNT_FULL` at the cap), `placeBarSlots()`. Hide rules elsewhere: l. 2131 `hidden = m.placementActive || m.buildBar || m.repairOpen || m.voting || m.watching` (the swap/ammo lines); l. 1189 consumable (stays under the wheel, hidden while voting/watching).
- **`GameScene.ts`**: `keyPick(host, slot, menuOpen)` (~l. 1491) — digits pick item index `slot` of `buildBarItems` (not a grid slot), cancel + same-type toggle, `pickError` with pending count, `startPlacement`. The quick tile's "last placed" belongs here (set on the placement send; `this.pending` is 5.18's pending list).
- **Sizes** (`ui/sizes.ts`): `BUILD_TILE_CSS_PX 56`, `BUILD_TILE_GAP_CSS_PX 8`, `BUILD_BAR_INSET_CSS_PX 16`, `BUILD_COUNT_*`, `READY_BAR_GAP_CSS_PX 12`, `UNDO_CHIP_CSS_PX 48`, `PING_BUTTON_CSS_PX 48`, `MENU_BUTTON_*`; `consumableButton.ts`: `RIGHT_BUTTON_CSS_PX 64`, `ABOVE_BAR_GAP_CSS_PX 12`, `CENTRE_CLEAR_CSS_PX 48`, `rectCentreGap`.
- **Shop types today:** 7 (`shopBuildings` with every unlock: wood barricade $40, auto-turret $250, spike trap $80, mine $35, floodlight $100, med station $400, bear trap $50 — the other 2 of the 9 building types are upgrade-only tiers). A new account has 2 (wood barricade, auto-turret). So 7 + Shop = 8 cells + Close = the 3 × 3 panel with no paging today.
- **Measured** (dev server, `DEV_NO_WAVES=1`, `docs/art/build-ui/src/hud-*.json`, CSS px): 568 × 320 — ping 448,12 48², ☰ 508,12 48², Ready 124,244 168 × 52, grid 304…552 × 184…304; 844 × 390 — ping 724,12, ☰ 784,12, Ready 298,314, grid 580…828 × 254…374.
- **B's geometry at 568 × 320** (from `mock.html`): Build 496,248; quick 432,248; Shop chip 500,188 (48); ↶ 436,188; panel cells 368…552 × 120…304, card 360…560 × 88…312 → centre gap ≥ 76 px, 28 px below ping. At 844 × 390: Build 772,318; panel 644…828 × 190…374.

### Related stories (interplay)

5.12 quick-use + swap above the bar (re-anchor, AC 8) · 5.15 carry the ghost (the hold the pick starts) · 5.17 why it's red (unchanged once holding; tile red prices as built) · 5.18 place-place-place chain + quiet window (keep `quiet`) · 5.20 undo chip (re-anchor) · 5.21 building action bar (replaces the cluster when a building is selected; unchanged) · 5.26/5.27 icons (reused on the quick tile and panel) · 7.4 unlock mask (the panel's list; BU-3) · 8.2 waiting HUD (no cluster) · 8.7 ping button + wheel (hidden under the open wheel; arrows under the HUD, B16).

### Guardrails (lessons the reviews keep finding)

- No per-frame allocation; redraw only on a state-key change (as `drawBuildBar`). Every texture drawn in code goes through `addGeneratedTexture` (4.13). Phaser 4 ≠ 3 (check `node_modules/phaser/types`). Phaser reuses scene objects on restart: reset `buildPanelOpen` / quick type in `create`.
- EPIC 6 BRIEF line 31: every on-screen control is in the ONE HUD layout test; add the new modes there, don't check them story by story. Baseline lines may not get worse — here they must disappear.
- Light review (one checker) is enough: a visual, client-only story (Session 9 speed-up, rule 5) — but a narrow re-review for any behaviour-changing fix.
- Fast local loop `npm run gate:fast` + `npm run test:changed`; CI on the PR is the full gate (HANDOFF §3).

### References

- `_bmad-output/implementation-artifacts/5-16-build-bar-replaces-the-shop-for-buildings.md` (ACs, D1–D4), `5-17-why-it-s-red.md`, `5-18-place-place-place-chain-and-pending-under-lag.md`, `5-20-take-back-sell-and-undo.md`, `5-21-building-action-bar.md`, `8-7-pings.md` (B5, B16), `8-2-3-join-mid-run-and-host-role.md`
- `docs/ideas/building-ux/ux-spec.md` §2–§4, §7.2, §9
- `apps/client/src/scenes/hudLayout.test.ts` (`KNOWN_AS_BUILT`)
- `docs/art/build-ui/index.html` (BU-1 options)

## Dev Agent Record

### Agent Model Used

Claude Code (gds-dev-story, autonomous builder session).

### Completion Notes List

- 2026-11-25: story written (gds-create-story, headless); status `backlog` until the designer picks BU-1.
- 2026-11-25 (build): BU-1 = B as picked; BU-2 / BU-4 / BU-5 as recommended; BU-3 as recommended (designer). Client UI only: no change to `packages/shared`, the server, balance, prices, the cap, the 5.15 / 5.18 placement rules or any message.
  - `buildBar.ts`: `quickType`, `panelAllowed` (BU-3), `layoutBuildCluster`, `layoutBuildPanel` (pure, reused out objects), `panelStaysOpen` (AC 6), `panelTapOutside` (AC 6), `togglePanelKey` (AC 9); `buildBarSlots` reused for the panel's first 8 cells (`PANEL_CELLS` = 9, the 9th = Close); `stepBuildBar` / `pickError` / `tileState` / `pickRefusalText` unchanged (quick tile and panel picks both go through `buildPick`, so 5.16 AC 10 and 5.18 Q2 still hold). The 4 × 2 `layoutBuildBar` and `BUILD_BAR_COLS/ROWS` are gone (nothing else read them).
  - `HudScene.ts`: the 8-slot grid became 10 tile objects (`ptile0…7` panel cells, `quick`, `quick2`) + Build / Close (`build`), the Shop chip (`shopchip`), the count badge / header, the card, the ↻ mark. Redrawn only on a mode / slot / state-key change (no per-frame allocation). Hidden under the open ping wheel exactly like the old bar (`barMode()`); consumable, swap and ↶ hide under the open card.
  - `GameScene.ts`: `lastPlacedType` (set in `queuePlace`, reset per run) → `m.buildQuick`; the close causes via `panelStaysOpen` right after `m.buildBar` is set; B via `routeBuildKeys` → `togglePanelKey`; Esc closes the panel before the menu.
  - Neighbours (AC 8): 5.12's row via `layoutRowAboveCluster` (right-aligned 12 px above the Shop chip); 5.20's ↶ above the quick tile (`layoutUndoChip` now takes the cluster box); Ready via `readyLeftX` against the open card's left edge.
  - Tests: `hudLayout.test.ts` — `build` (closed), `build_short` (BU-3), `build_open` modes; the `568x320 build tile0/tile1` and `640x360 build tile0` baseline lines deleted; Ready's baseline lines improved (568: 120 → 46, 640: 84 → 40; the same Ready in the new modes); a new block checks closed + open at 568 × 320, 640 × 360, 800 × 360, 844 × 390, 1024 × 768, 1920 × 1080 with and without insets 44/21 (safe area, ≥ 48 px from the centre, right half, no overlap, ≥ 12 px between separate controls, 8 px inside a tile group, card ≥ 12 px from ping / ☰ / Ready). `buildBar.test.ts` (cluster / panel geometry vs mock.html, quick type incl. fallback, BU-3, every close cause, tap outside, B), `buildKeys.test.ts` (B), `consumableButton.test.ts`, `undoChip.test.ts` re-anchored to the cluster.
  - Stills: `docs/art/10-10/` (closed, open, short of money, at the cap closed + open, ≤ 2 types; 568 × 320 and 844 × 390; README + `stills.cjs`). Measured hit rects equal B's mock.
  - `npm run gate:fast`: typecheck, lint, 4677 unit tests, release:check all green. No slow test is affected by the changed files (`vitest --project slow --changed origin/master`: none).
- B-codes (autonomous build, auto-accepted; the designer can overturn any):
  - **10.10-B1** Shop stays in the open panel as its 8th cell (BU-2) and the 5.16 paging rule ("More ▸" past 7 types) is kept unchanged in the panel.
  - **10.10-B2** (revised after review 1, 2) ↶ sits 12 px left of the quick tile, centred on its row: outside the hand cluster's Place and ✕ (B's still had it above the quick tile, inside Place's footprint). 5.12's consumable + swap row sits left of ✕ and above Place, 12 px clear of both, wherever the survivor's 48 px allows (800 × 360 and up, 640 × 360 without insets); on 568 × 320 and 640 × 360 with insets it stays right-aligned 12 px above the Shop chip, under ✕'s spot, and its presses are dropped in 5.18's quiet window.
  - **10.10-B3** The panel's cells shrink (never below 48 px) only where 3 × 56 px plus the card would come within 48 px of the survivor (of the tested sizes only 568 × 320 with 44 px side insets: 50 px cells), or the card would come within 12 px of ping / ☰ (review 7: a short screen with a top inset; 568 × 320 with insets 44/21 and top 20: 49 px). Icons and labels scale with the cell (review 6). Close stays the 9th cell on Build's corner.
  - **10.10-B4** (accepted) Ready keeps 12 px from the open card's left edge and from ↶'s spot, whichever is further left (fixed per layout), so it never jumps when the panel or ↶ appears; without insets that is "40 px left of centre" at every size; at 568 × 320 with insets its move-stick-half baseline is 52 px (was 120).
  - **10.10-B5** While the panel is open, 5.12's consumable / swap and 5.20's ↶ hide (they would sit under the card); they return when it closes.
  - **10.10-B6** (revised after review 4, 5) A touch while the panel is open: on the card itself (header, padding, an empty cell) it is consumed and the panel stays open; in the move-stick half it closes the panel and still starts the stick; on another HUD button (Ready, ping, ☰) the panel closes and that button still gets the press; anything else (a right-half touch, a world tap, a mouse click) closes it and is consumed.
  - **10.10-B7** BU-3 layout: 1 type → its tile on Build's spot; 2 types → balance order left to right on the quick tile's and Build's spots; the count badge on the corner tile; Shop chip above; no ↻ mark (they are not "again" tiles).
  - **10.10-B8** Button ids: one `build` id for Build and Close (the press goes through the model, so the quiet window gates it), `quick`, `quick2` (BU-3's 2nd tile), `shopchip`, `ptile0…7`; the story's `ptile8` (Close) is `build`.
  - **10.10-B9** (revised after review 3) "Last placed" = the type of my last **confirmed** building: the server's (solo: the sim's) `building.placed` event for my building, never the Place itself, so a refused Place never becomes the quick tile. Reset per run, kept across phases; a type no longer unlocked falls back to the first.
  - **10.10-B10** B does nothing while holding a building or while blocked (wave, menu, shop); Esc closes the panel before it opens the menu (like the ping wheel).
  - **10.10-B11** Build's hammer and Close's ✕ are drawn with Graphics (no emoji font); the Shop chip reuses the 5.16 Shop tile's 🛒 glyph.
  - **10.10-B12** (kept, review 10) The count badge (a dark pill) uses today's `COUNT_OK` / `COUNT_FULL` colours as AC 4 says; `COUNT_FULL` (#ff8a80) carries over 5.16's agreed exception.
  - **10.10-B13** (review 9) The open panel's cell on the quick tile's own spot (cell 7) holds the quick type, so the same spot repeats the last building whether the panel is open or not; the other types fill cells 0–5 in balance order and Shop takes cell 6 (bottom left). More than 6 other types would page five at a time with "More ▸" in cell 5.
  - **10.10-B14** (review 1, 2) In 5.18's quiet window (`barQuietMs`, 300 ms after Place / ✕ empties my hands) presses on ↶, swap, quick-use and Build are dropped (`dropQuietPresses`), as the tiles' and the Shop chip's already were. The tiles (quick, Build, Shop chip) still overlap Place's footprint, as the 5.16 grid did; the cross-mode test lists exactly which closed-cluster controls may overlap Place / ✕.

- 2026-11-25 (review fixes, PR #20 review of 816bd2f): 1 ↶ out of Place's footprint + quiet gate; 2 the row left of ✕ where it fits + quiet gate for swap / quick-use / Build; cross-mode test (holding Place / ✕ vs the closed cluster, every size and inset); 3 the quick tile from the confirmed `building.placed`; 4 a move-stick-half touch closes the panel and still walks; 5 the card itself keeps the panel open; 6 icons / labels scale with a shrunk cell; 7 the cells shrink for a top inset (test); 8 historical notes on the BU-1 option scripts, `BUILD_BADGE_TEXT_CSS_PX` removed, test box `ptile8` → `build`; 9 B13 (the quick type on the quick tile's spot in the panel; repeat stills); 10 B12 kept, B4 accepted. Wiring test `tools/checks/buildButtonWiring.test.ts`.

### File List

- apps/client/src/input/KeyboardMouse.ts
- apps/client/src/input/keyMap.ts
- apps/client/src/scenes/GameScene.ts
- apps/client/src/scenes/HudScene.ts
- apps/client/src/scenes/buildBar.ts
- apps/client/src/scenes/buildBar.test.ts
- apps/client/src/scenes/buildKeys.ts
- apps/client/src/scenes/buildKeys.test.ts
- apps/client/src/scenes/consumableButton.ts
- apps/client/src/scenes/consumableButton.test.ts
- apps/client/src/scenes/hudLayout.test.ts
- apps/client/src/scenes/hudModel.ts
- apps/client/src/scenes/undoChip.ts
- apps/client/src/scenes/undoChip.test.ts
- apps/client/src/ui/sizes.ts
- tools/checks/buildButtonWiring.test.ts
- docs/art/10-10/README.md, docs/art/10-10/stills.cjs, docs/art/10-10/10-10-{568,844}-{closed,open,money,cap,cap-open,short,repeat,repeat-open}.png
- docs/art/build-ui/src/tile-crops.cjs, docs/art/build-ui/src/base-shots.cjs (historical notes)
- _bmad-output/implementation-artifacts/10-10-build-button.md, _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-11-25: implemented (BU-1 = B): Build cluster + 3 × 3 panel replace the 4 × 2 build bar; B toggles the panel; layout tests at six sizes; stills in docs/art/10-10/. Status → review.
