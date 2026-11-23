# Story 5.16: Build bar replaces the shop for buildings

Status: review

(Building UX rework BX-2. Design: `docs/ideas/building-ux/ux-spec.md` §2–§4, §7.2, §9, §15 (designer: **B · Carry + drag**), `draft-stories.md` › BX-2, feel: `prototype.html` / claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR (`drawNewHUD` › build bar). Spine-wins rule: where the spec and the prototype disagree, the spec wins. Builds on Story 5.15 (`stepPlacement`, the hand cluster).)

## Story

As a player,
I want my buildings under my right thumb,
so that I don't open a menu for every barricade.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full (paste it into the builder and the reviewer prompt too):
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies; server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the 4.10 phone numbers are the floor, not to be lost.
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: start from the 4.10 earnings decision; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> 20. (added 2026-11-23, Story 4.13) Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss.
> ```
>
> Most relevant here: **2** (nothing new is simulated: a tile tap starts the unchanged 5.15 hold; the server still judges every Place with `placementError`; no message, schema, server, mirror or Predictor change), **3/4** (fairness ACs 8–10 and "Beat the rule"), **10** (the bar is drawn on change only: no allocation per frame; layout sizes in `ui/sizes.ts` as 5.15 did; prices and the cap come from `buildings.json`), **14** (the bar shows the wallet and the count as this device's World has them: server truth online), **17** (Phaser 4 Graphics/Image/Text), **20** (no new texture: the tile icons are Images of the existing `atlas_buildings` frames (registered through `addGeneratedTexture` in 5.9/4.12) and, for the turret, Graphics). Lines 5–9, 11–13, 15–16 have nothing to act on (client-only presentation, no new object, no sim change, 0 B/s added).

## Acceptance Criteria

1. **The bar.** **Given** a build phase with empty hands, no building selected, the shop and the menu closed, **then** the bottom-right safe-area corner shows the **build bar**: a 4 × 2 grid of **56 × 56 px tiles, 8 px gaps, 16 px inside the right and bottom insets** (grid 248 × 120 CSS px, × `dpr()`; ux-spec §4). The count line **"k/6"** (my buildings / `buildings.maxPerPlayer`) is right-aligned above the grid's top-right.
2. **Tiles from balance.** The building tiles are `shopBuildings(balance)` in balance order (today: Wood barricade $40, Auto-turret $250, Spike trap $80, Mine $60), with any type whose `inShop` is `false` left out (5.10's flag, read generically: tolerated, not added here). They fill the slots row by row from the top-left; **🛒 Shop is always the bottom-right slot** (under the thumb). Empty slots draw nothing. A new type (5.10's med station, 5.14's bear trap) appears with no UI change.
3. **More than 7 types** (not needed today): slots 0–5 show one page of six types, slot 6 is **"More ▸"** (turns the page, wraps to the first), slot 7 stays Shop.
4. **Each tile** shows the building's icon (the same code-drawn art as in the world: the `atlas_buildings` frame for barricade, spike trap, mine; the turret's plate + head for the turret; a plank box for a type with no art) and its price (`$40`, 14 px, yellow).
5. **Affordability and cap shown before the pick.** **When** my wallet (as this device's World has it: server truth online) is below a type's price, **then** that tile is drawn at **40 % opacity with its price in red**. **When** I own `maxPerPlayer` buildings, **then** the count reads **"6/6" in red** and every building tile is drawn at 40 % (prices stay yellow). The Shop tile is never dimmed.
6. **Tap → in my hands.** **When** I tap an affordable tile under the cap, **then** that building is in my hands at once (Story 5.15's hold starts on that frame: carry, keep walking, hand cluster); the bar hides.
7. **Tap refused.** **When** I tap a tile while at the cap, **then** nothing is picked and **"Building limit reached (6)"** toasts; **when** I can't afford it, **"Need $250 (you have $180)"** toasts. The cap is checked first (`placementError`'s order and ux-spec §7.2).
8. **Fairness: the server decides (F1).** A tile pick charges nothing and sends nothing; only Place sends (`building.place`, judged by the unchanged `placementError` on the server; solo: the same function). The bar's dimming and the pick refusal are predictions from the same numbers (`price`, `wallet`, `ownedCount`, `maxPerPlayer`).
9. **Fairness: no way round the cap or the price by the bar.** A pick refused here can't be forced by a second tap, a double tap, or a tap during the frame the wallet changes: every pick reads the World of this frame; a pick that the server would refuse at Place still toasts there (unchanged 3.4 path).
10. **Fairness: build phase only (F4).** The bar exists only while `shopAllowed` holds (a build phase, a run on screen, no menu, not leaving, not under `?stress`) and I'm alive; it hides the frame that stops holding; a tap on a tile that has just hidden does nothing.
11. **Shop tile.** Tapping 🛒 Shop opens today's shop (weapons, upgrades; later 5.13's cards). **The shop no longer lists buildings** (no "Buildings" section, no building action), and the separate Shop button next to Ready is gone.
12. **Hidden** while holding (the hand cluster), while a building is selected (the repair panel today, BX-7's action bar later), while the shop or the menu is open, and outside a build phase. While the bar shows, the swap button and the ammo lines are hidden (they sit under the grid; nothing to shoot in a build phase; `Q` still swaps on keys).
13. **Ready** stays at the bottom (168 × 52, 24 px up), centred 40 px left of the screen centre (5.15), and slides further left if needed so its right edge stays **≥ 12 px** left of the grid (568 × 320: Ready's centre at 208 px instead of 244). Every target ≥ 48 px and ≥ 12 px apart; nothing overlaps ☰ / ⚙ at 568 × 320.
14. **Numbers (brief 10).** Tile size, gap, inset, columns/rows, count text, the Ready gap: `ui/sizes.ts` (CSS px, layout only, like 5.15's hand cluster). Prices and the cap: `buildings.json` (unchanged). No allocation per frame: the tiles redraw only when their state key (page, each tile's short/cap bit, count, cap) changes.
15. **Tests:** `buildBar.test.ts` — the tile list from balance (today's four, an `inShop: false` type left out, upgrade-only tiers left out, a new type appears), the slots (Shop last, empties, paging with More at > 7 types and its wrap), the layout (exact tile rects with insets at dpr 1–3, ≥ 48 px, ≥ 12 px apart from Ready, nothing past the safe area), the pick (cap before money, the toast texts), the tile states (short, cap); `shopStore.test.ts` — the shop has no building action; a browser check at **800 × 360, 568 × 320 and 1024 × 768**: the bar, a short tile, the cap state, tap → building in hand, the Shop tile opens the shop without buildings. Screenshots in `docs/art/5-16/`.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | Tap a tile I can't afford | Nothing in hand; "Need $X (you have $Y)" toast; nothing sent |
| B2 | At 6/6, tap any tile | Nothing in hand; "Building limit reached (6)" toast |
| B3 | Tap a tile twice fast / two tiles in the same frame | One hold (the first pick of the frame); the second tap lands on the hand cluster or nothing |
| B4 | Pick a turret with $250, then spend money (buy a weapon in the shop? the shop closes the hold) / be charged while holding | Holding ends when the shop opens (5.15 rule); Place with too little money is refused by the server (`money` toast) |
| B5 | Tap a tile in the frame the wave starts | The bar is hidden by `shopAllowed`; nothing picked |
| B6 | Tap the bar area while downed / out | No bar while not alive; nothing picked |
| B7 | Online with a stale wallet (money arrives a tick later) | The tile shows server truth; a pick refused locally can be retried after the state arrives; a pick allowed locally but refused at Place toasts the server's reason |
| B8 | Look for buildings in the shop | None; the shop has weapons and upgrades only |
| B9 | A building under the bar (camera keeps me centred) | The tile wins (HUD buttons first, as for Ready today); the building can be tapped once I step away (ux-spec §13 keeps that rule for Ready only) |

## Tasks / Subtasks

- [x] **T1 Pure bar model (AC 1–3, 5, 7, 13, 14).** New `scenes/buildBar.ts`: `buildBarItems(balance)` (cached, `shopBuildings` minus `inShop: false`), `buildBarSlots(count, page, out)` (Shop last, More ▸ past 7), `layoutBuildBar(w, h, insetR, insetB, k, out)`, `readyLeftX(...)`, `pickError(owned, cap, wallet, price)` + `pickRefusalText`, `tileShort`. Sizes in `ui/sizes.ts`.
- [x] **T2 Shop without buildings (AC 11).** `shopStore.ts`: drop `buildings`, the `building` action and the `startPlacement` effect; `ShopScreen.tsx`: drop the Buildings section; `uiState.ts`: drop the `startPlacement` request; `GameScene.updateShop` opens without buildings.
- [x] **T3 GameScene (AC 6–10, 12).** `hudModel`: `buildBar`, `buildItems`, `buildOwned`, `buildCap`, `buildPick`; `shopButton` gone. The frame's decision is the pure `stepBuildBar(model, frame, out)` in `buildBar.ts` (testable, 5.15 review M1 lesson); `GameScene.updateBuildBar` (after the repair panel) fills one reused frame and acts on the answer: the bar shows iff `shopAllowed` && alive && not holding && no selection && shop closed; a pick runs `pickError` on this frame's World → toast, or `startPlacement` (5.15) + hold input on this frame.
- [x] **T4 HUD (AC 1, 4, 5, 12, 13).** `HudScene`: the 8 tiles (Graphics + icon Image/Graphics + price/label Text), the count line, redraw on key change; tile buttons `tile0..7`; More turns the page; the Shop tile sets `shopPressed`; the old Shop button removed; swap + ammo hidden while the bar shows; Ready slides left of the bar. `TurretView.ts › drawTurretIcon` (the same plate + head look in HUD px).
- [x] **T5 Tests + browser check (AC 15).**
- [x] **T6 Gate + record.** `npm run typecheck && npm run lint && npm test && npm run build`; Dev Agent Record; status `review`.

## Dev Notes

### Decisions (taken here, recommended values; the ux-spec already decided everything else)

- **D1 Shop tile fixed at the bottom-right slot** (prototype: index 7), the buildings fill from the top-left. Under the resting thumb and never moves when 5.10/5.14 add types.
- **D2 At the cap every building tile dims to 40 % too** (the spec only reddens the count): one look for "can't pick this now"; prices stay yellow so "too expensive" and "at the cap" stay distinguishable.
- **D3 Swap button and ammo lines hidden while the bar shows** (as 5.15 D4 while holding): they sat exactly under the grid, and there is nothing to shoot in a build phase. Keys: `Q` still swaps. If the designer wants swap in a build phase, it can move above the grid's left edge (not built).
- **D4 Ready slides left only when it would come within 12 px of the grid** (needed below 640 px wide: 568 × 320 → centre 208 px). At 800 × 360 and wider it stays where 5.15 put it.
- **D5 The bar needs me alive** (`canPlace`'s rule): a downed/out player sees neither the bar nor the Shop tile. Today an out player could still open the shop; in practice nobody is out in a build phase (downed players are returned at the build start).
- **D6 The tap toasts instead of picking** for money/cap (ux-spec: "you can't be surprised… after carrying a turret across the street"). Off-map/spawn/blocked reasons stay with the ghost (5.17).
- **D7 `inShop` tolerated client-side**: `buildBarItems` skips `inShop === false`. When 5.10 merges, its `shopBuildings(balance, shopAll)` does this in shared code; pass `world.debug.shopAll` there and drop the client filter (merge note).
- **D8 Keys `1`–`7` for tiles: not here** (BX-11, Story 5.25, optional). A mouse click on a tile works like a tap.

### Current state (read before changing)

- `ui/ShopScreen.tsx` + `ui/shopStore.ts` (3.3/3.4): the shop lists weapons, upgrades and buildings; a building tap returns the `startPlacement` effect, `GameScene.shopInput` sends `uiStore.request("startPlacement", id)` → `GameScene.startPlacement(type)` (5.15: carry, `releaseAim`).
- `GameScene.updateShop`: `shopAllowed(...)` decides; `m.shopButton` shows the Shop button beside Ready; `m.shopPressed` opens it (`releaseAll`, `clearEdges`).
- `HudScene`: Ready + Shop pair (`layoutReadyButton`, `SHOP_BUTTON_W/GAP`), 40 px left of centre (5.15); swap button at (right 24, bottom 120, 64 px), ammo at margin 24; `drawWeapon`'s `hidden` flag (5.15 D4).
- `shared/economy/shop.ts › shopBuildings(balance)`: every priced type except `forSale: false`, cached per balance; `buildings.ts › ownedCount`, `placementError` (cap `limit` before `money`).
- `render/city/buildingsAtlas.ts › buildingFrame(type)`: atlas frames for wood barricade, reinforced, metal, spike trap, mine (registered via `addGeneratedTexture`); turrets are Graphics (`TurretView`).

### Copies touched (brief line 2)

None. World, schema, syncState, state views, NetSimHost mirror, Predictor, devThrottle, snapshotWorld, server: unchanged. No shared file changes. `balance.version` unchanged.

### Must be preserved

5.15's hold (carry, `stepPlacement` order, hand cluster, hint line), placement refusals and toasts (3.4), the repair panel and world taps (3.7), upgrades (5.9), Ready (3.1), the shop's weapons/upgrades/replace flow (3.3/5.1), Esc/☰ closing the shop first, edge flags once per seq, every existing test.

### References

- `docs/ideas/building-ux/ux-spec.md` §2–§4, §7.2, §9, §13, §15; `draft-stories.md` BX-2; `epics.md` › Story 5.16; story files 3-3 (shop), 3-4 (placement), 5-15 (hold).

## Notes for the merge (brief line 19)

- **5.10 (floodlight, `inShop`)**: `scenes/buildBar.ts › buildBarItems` skips `inShop === false` itself. After 5.10 merges, call 5.10's `shopBuildings(balance, world.debug.shopAll)` there (so `?shopall=1` shows the floodlight tile) and drop the local filter. If 5.10 adds atlas frames for the floodlight / med station in `buildingFrame`, the tiles use them automatically; otherwise they show the plank-box icon.
- **5.12 (consumables)**: its consumable button (64 px left of swap) must also hide while the bar shows (it would sit under the grid): use `drawWeapon`'s `hidden` flag (now `placementActive || buildBar`).
- **5.13 (card shop)**: the shop has no buildings any more; keep `inShop: false` out of the card pool (5.10's note).
- **5.17–5.19**: the bar is the "hands empty" state of the right-thumb cluster; 5.18's chain keeps the hand (the bar stays hidden), 5.18's pending wallet should feed `buildBar`'s shown wallet (`hudModel.money` today).
- `ui/sizes.ts`: `SHOP_BUTTON_W/GAP` removed; `BUILD_BAR_*`, `READY_BAR_GAP_CSS_PX` added.
- `hudModel.ts`: `shopButton` removed; `buildBar`, `buildItems`, `buildOwned`, `buildCap`, `buildPick` added. `uiState.ts`: the `startPlacement` request is gone.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, 2026-11-23). Baseline: master `3b62074` (5.15 merged).

### Debug Log References

- Browser check (`require('playwright')`, headless Chromium, `isMobile`, `hasTouch`, dpr 2, Vite on its own port 5391, stopped by PID; solo practice): at 800 × 360, 568 × 320 and 1024 × 768 with `?wallet=100` — bar shown, owned 0/6; tap turret → not holding, toast "Need $250 (you have $100)"; tap barricade → holding `wood_barricade`, bar hidden, toast withdrawn; ✕ → bar back; Shop tile → `.shop` open, sections ["Upgrades", "Weapons"], no building names. With `?wallet=5000`: six mines placed (walking between) → owned 6/6, count red, tiles dimmed; tap barricade → not holding, "Building limit reached (6)". Swap button hidden while the bar shows. No console or page errors.
- First browser run found the refusal toast still on screen while holding on 568 × 320, overlapping the 5.15 hint line ("Need $250 (you have $…)" under "Wood barricade · $40"). Fixed: `ToastQueue.withdraw` removes the bar's refusal once a pick succeeds; `pushUnique` keeps repeated refused taps from queueing 4 × 3 s of the same line.

### Completion Notes List

- **Build bar** (`scenes/buildBar.ts`, pure): tiles from `shopBuildings` minus `inShop: false` (cached per balance, with the turret flag and footprint for the icon); 8 slots, Shop fixed bottom-right (D1), More ▸ paging past 7 types; layout 56 px tiles / 8 px gaps / 16 px inset from the bottom-right safe-area corner, count line 4 px above; `readyLeftX` (Ready ≥ 12 px left of the grid, D4); `pickError` (cap, then money) and the toasts; `tileState`; `stepBuildBar` (the per-frame decision).
- **HUD** (`HudScene`): 8 tiles (rounded Graphics, icon = `atlas_buildings` frame Image or turret/plank Graphics, price/label, glyph 🛒 / ▸) and the count line; redrawn only when slots or the state key change (no per-frame allocation); short tiles 40 % + red price, at the cap every building tile 40 % + red count (D2); old Shop button removed; swap + ammo hidden while the bar shows (D3).
- **GameScene**: `updateBuildBar` after the repair panel; a successful pick starts the 5.15 hold this frame and clears this frame's aim/fire (`holdBuildingInput`); the Shop tile opens the shop only if the bar was on screen. `uiStore`'s `startPlacement` request removed.
- **Shop**: no buildings (state, open input, action, effect, Buildings section); `shopStep` returns the state unchanged for an unknown action.
- **Icons**: `BuildingView.drawPlankIcon`, `TurretView.drawTurretIcon` (world colours, Graphics only). No new texture (brief 20: the atlas is the existing 5.9/4.12 one).
- **Copies (brief 2)**: none. No message, schema, server, shared, mirror or Predictor change; 0 B/s.
- **Tests**: `buildBar.test.ts` (36: items incl. `inShop: false` + a new type, slots incl. paging/wrap, exact layout with insets × dpr, 18 size × dpr layout checks vs Ready and ☰, pick rule + texts, tile states, `stepBuildBar` pick/refusals/hidden states/stale tap/unknown id); `toastQueue.test.ts` (+1: pushUnique, withdraw); `shopStore.test.ts` (building test replaced: no buildings, an old "building" action does nothing).
- **Mutations (brief 9)**, one each, all **killed**: inShop filter dropped, Shop not last, money before cap, pick ignores "was on screen", pick ignores holding, Ready never slides, right inset ignored, short bit `<=`, `withdraw` no-op, `pushUnique` stacks, shop default case removed.
- **Full gate** on `story-5-16`: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **252 files passed / 1 skipped, 2,069 tests passed / 3 skipped**; build OK. Load average 1.3 at the start, 2.9 at the end (4-core container, this builder alone). (A first gate run stopped at lint on one unused import; fixed and re-run.)
- **Not verified**: a real phone (headless Chromium only); online play (no game server started: the bar reads the World, which online is the state mirror, but a stale-wallet pick under `?lag=150&jitter=20` was not tried); a tab slept across a build start with the bar up; More ▸ paging in the browser (only 4 types exist; unit-tested); mouse clicks on tiles (HudButtons handles mouse as for every HUD button, not clicked in this check); notched-phone safe-area insets (unit-tested maths only); the turret / plank fallback icons at dpr 3.

### File List

- `_bmad-output/implementation-artifacts/5-16-build-bar-replaces-the-shop-for-buildings.md` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/client/src/scenes/buildBar.ts` (new), `buildBar.test.ts` (new)
- `apps/client/src/scenes/GameScene.ts`, `HudScene.ts`, `hudModel.ts`, `toastQueue.ts`, `toastQueue.test.ts`
- `apps/client/src/ui/shopStore.ts`, `shopStore.test.ts`, `ShopScreen.tsx`, `uiState.ts`, `sizes.ts`
- `apps/client/src/render/BuildingView.ts` (`drawPlankIcon`), `TurretView.ts` (`drawTurretIcon`)
- `docs/art/5-16/README.md` + 10 screenshots (new)

### Change Log

- 2026-11-23: Story written (gds-create-story). Status → in-progress.
- 2026-11-23: Built (gds-dev-story): build bar, shop without buildings, toast withdraw/pushUnique. Status → review.
