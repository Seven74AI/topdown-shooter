# Story 5.23: Placement feel and owner marks (merged with 5.25: Mouse and keys parity)

Status: done

(Building UX rework **BX-9 + BX-11**, merged by the designer on 2026-11-24: one story, one review. Design: `docs/ideas/building-ux/ux-spec.md` §9 (input schemes), §10 (game feel and juice), §6.3 (chain), §15; `draft-stories.md` › BX-9, BX-11; feel: `prototype.html` / claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR. Spine-wins rule: where the spec and the prototype disagree, the spec wins. Builds on 5.15 (carry, `stepPlacement`, hand cluster, Place = the spot shown last frame), 5.16 (build bar), 5.17 (reason line, culprit, 250 ms hold), 5.18 (chain, pending boxes, `pendingFlow.ts › runPendingFrame`), 5.19 (thumb drag, pin, item chip), 5.26/5.27 (build-bar icons), 5.12 (consumable buttons, `E`). **Client-only: no message, schema or server change** (one client-only optional `ageS` on the `building.placed` SimEvent type, set by NetSimHost on drain like the acid/explosion events; never on the wire).

Carried-in items (main session, 2026-11-24): **(a)** 5.18 Q1 — a blocked chain spot sends the ghost back to the hand where it sits red on the barricade just placed: polish it here (D10). **(b)** 5.19 L5 — the chip's "↩ carry" keeps the old drag side: decide (D11). **(c)** 5.20 moved the **Z / Ctrl+Z undo shortcut** here; it must work on AZERTY and not clash with 5.12's `E` (D15, D17). **(d)** Mouse: the ghost follows the cursor when a mouse moved last, `1`–`7` pick, `R` / wheel rotate, left click / `Space` place, right click / `Esc` put away, `M` picks up the selected building (5.21 not merged: `M` is a no-op hook with a TODO, D16). Parallel work: 5.20 (sell/undo + undo chip, branch `story-5-20`) is landing; 5.21+5.22 (action bar + move) come after it — **keep away from selection / action-bar code**.)

## Story

As a player,
I want placing to feel solid and to see whose buildings are whose, and — on a desktop — the same building flow with mouse and keys,
so that building with friends is readable and quick on any device.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies (full text in the 5.19 story file and the retro). Most relevant here: **2** (no sim copy is touched: effects read `building.placed` events and the World; the request is the unchanged `building.place`), **3/4** (fairness ACs 14–16 and "Beat the rule"), **9** (mutate each new test once), **10/12** (no allocation per frame: dust, tabs and dots are pooled, caps `controls.fx.maxPlaceDust` / `maxOwnerTabs` in balance JSON), **14** (a woken tab's backlog of `building.placed` plays no sound / haptic / dust), **17** (Phaser 4: `Graphics.setScale`/`setPosition`, the `wheel` input event, checked in `node_modules/phaser/types`), **20** (no new texture: dust, tabs and dots are Graphics). Lines 5–8, 11, 13, 15, 16: nothing to act on (0 B/s added: every effect comes from existing events/state).

## Acceptance Criteria

### Placement feel (BX-9)

1. **Pick.** When a building goes into my hands from the build bar (tile or `1`–`7`), the ghost scales **0.8 → 1.0 in 120 ms** (ease-out) around its centre, and a **soft click** plays. A chain re-pin after a Place is not a pick (no pop, no click).
2. **Placed (mine or a teammate's).** On each `building.placed` event: **8 dust particles for 0.4 s** around the footprint, the building's art **drops 0.15 m → 0 in 120 ms** (its shadow stays on the ground), and a sound by kind: **"thunk"** (wood / reinforced barricade), **"clank"** (metal barricade, turret, floodlight, med station), **"click"** (spike trap, mine, bear trap: the floor types). My own: a **12 ms** haptic. A teammate's more than **12 m** from my survivor is quieter (× 0.4) and panned to its side.
3. **Refused.** A refusal of my placement (the server's / solo's answer, a 2 s "No answer" timeout, or a Place this device turns down because the answer is certain: 5.18's gate) gives a **30-40-30 ms** haptic and a **dull buzz**; the visual twin is 5.18's shaking dashed box / the toast.
4. **Owner marks.** For **3 s** after a building is placed, an **L-shaped corner tab** in its owner's ring colour (2.9 slot colours) sits on its min corner; during a build phase **every** building shows a **0.18 m owner dot** in its owner's colour at its min corner (grey when the owner left). Both are **hidden during waves** (a tab still running at the wave start is cleared).
5. **Haptics and pools.** Haptics follow a player setting (`PlayerSettings.haptics`, default on: no mute setting exists yet; Story 10.1's settings screen shows it) and the browser's `navigator.vibrate` (none on iOS / desktop: nothing happens); **every haptic has a visual twin**. Dust and tabs are pooled (caps `controls.fx.maxPlaceDust` = 64 particles, `maxOwnerTabs` = 12; the oldest reused); nothing allocates per frame.
6. **Stale events.** A `building.placed` older than **1 s** (`ageS`, a woken tab's backlog) or while the tab is hidden makes no sound, haptic or dust; its owner tab still shows for what is left of its 3 s.
7. **The blocked chain (5.18 Q1).** When the chain's next spot is blocked and the ghost goes back to carry, it sits **faded** (white, 35 %, no red, hatch, ✕ or culprit outline; the reason line shows the item's label) while the only thing blocking it is a building (my pending box or the one just built); the first frame it is clear or blocked by anything else, the normal look comes back for the rest of the hold. Place still sends (the server judges).
8. **"↩ carry" (5.19 L5).** Tapping the chip's "↩ carry" also resets the hold's drag side: the next chain jump goes to the right of my facing again (the automatic back-to-carry cases keep it).

### Mouse and keys parity (BX-11)

9. **Cursor follow.** In mouse mode, once the mouse has moved since the pick or the last Place, the ghost's **centre follows the cursor** (absolute, the cursor's world point; min corner snapped with the 0.1 m hysteresis; kept 1 m inside the view). Picked by a key, the ghost is carried (5.15) until the mouse moves; after a Place the chain's spot holds until the mouse moves. The chip shows the carry text while following (it isn't "pinned").
10. **Keys.** `1`–`7` (top row or numpad) pick build-bar tile 1–7 (same cap / money rules and toasts as a tap; no 300 ms quiet window for keys); the **same number again puts it away**, another number swaps to that item. `R` rotates 90° clockwise; the **mouse wheel** rotates one step per notch (down clockwise, up counter-clockwise; ≤ 1 step / 150 ms). **Left click** (not on a HUD button) or **`Space`** places; **right click** or **`Esc`** puts away (Esc while holding never opens the menu; the next Esc does). Keys only act in a build phase while placing is possible.
11. **Undo.** **`Ctrl+Z` / `Cmd+Z`** (by the layout's letter Z, so AZERTY works) and a **plain `Z`** where that key isn't already a game key (QWERTY `KeyZ`, QWERTZ `KeyY`; on AZERTY the Z key is `KeyW` = walk up, so plain Z walks there and Ctrl+Z undoes) press **5.20's undo chip ↶** (`hudModel.undoPressed`; the chip ignores it when nothing can be undone). (Main session 2026-11-24: 5.20 landed on master `a94f15e` during the build; merged, the first no-op hook replaced.)
12. **`M`** (by the layout's letter M) picks up the selected building: 5.21 isn't merged, so it reaches a no-op hook `GameScene.onPickUpKey()` with a TODO for 5.21.
13. **Key map.** Every new binding is in `keyMap.ts` (by `event.code`, plus the letter bindings by `event.key` for Z and M); no binding collides with WASD/arrows, `Q` swap, **`E` consumable (5.12)** or `Esc` menu on QWERTY, AZERTY or QWERTZ (table test). `Space` and digits prevent the browser default (page scroll) only when bound.

### Fairness

14. **Feel changes nothing the server judges.** No effect delays or changes a send; the placed feel plays on the server's `building.placed` (online) / the sim's event (solo), never on the press (the pending box covers the press, 5.18).
15. **The cursor can't reach more than the thumb.** The cursor-followed ghost is clamped 1 m inside the view like the drag (5.19 AC 6); the spot sent is the spot shown last frame (5.15 AC 10); a left click that lands on a HUD button presses that button (never both).
16. **Keys can't place outside a build.** `Space`, click, digits, `R`, wheel do nothing in a wave (holding is impossible there; nothing else is bound to them); Esc keeps opening the menu in a wave.

### Tests and checks

17. **Tests:** `placeFeel.test.ts` (sound kind per type; pick-pop scale curve; drop offset curve; quiet beyond 12 m; stale `ageS`; owner colour for a left player), `placeFx.test.ts`-style pool tests for dust and tabs (cap, oldest reused, 0.4 s / 3 s lifetimes, cleared in a wave), `haptics.test.ts` (setting off, no `vibrate`, patterns), `keyMap.test.ts` (new codes, letter bindings, the AZERTY / QWERTZ / QWERTY table, no collision with `E`), `KeyboardMouse` latches (rotate, place, build n, undo, pick-up; repeat ignored), `wheelRotate.test.ts`, `placement.test.ts` (cursor follow + hysteresis + clamp, ccw rotate, resting look after a blocked chain and its end, chip resets the drag side), `stepPlacement` with the refusal callback, `desktopInput` Ctrl+Z pass-through. Browser check (Playwright + preinstalled Chromium, own Vite port, solo `?wallet=5000`): touch via CDP at **800 × 360** and **568 × 320** (pick pop, place dust + drop + tab, owner dots, resting ghost after a blocked chain), and mouse + keyboard at **1280 × 720** (cursor follow, `1`, `R`, wheel, click place, right click, Esc, `Space`); screenshots in `docs/art/5-23/`.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | Move the cursor off the map edge / onto a spawn circle / the bus and click | Red with 5.17's reason (clamped 1 m inside the view); the click sends; the server refuses; buzz + shake; nothing charged |
| B2 | Click on Place / ⟳ / ✕ / Ready while holding | That button is pressed once; no second Place from the same click |
| B3 | Hold `Space` (auto-repeat) | One Place per press (repeat ignored) |
| B4 | Spin the wheel fast / a trackpad's tiny deltas | ≤ 1 rotation / 150 ms; tiny deltas accumulate to a notch |
| B5 | Press `1` during a wave / while dead / with the menu open | Nothing |
| B6 | Press `Esc` while holding, then again | First puts away, second opens the menu |
| B7 | AZERTY: walk with ZQSD while holding, press Ctrl+Z | Walking never undoes; Ctrl+Z reaches the undo hook |
| B8 | Hide the tab while teammates build, come back | No burst of thunks or dust; tabs only for what is left of 3 s |
| B9 | Chain into a wall end | Back in hand, faded while on the just-built box; clear → normal look |
| B10 | 4 players place at once | ≤ 64 dust particles, ≤ 12 tabs, one sound per type per frame at most |

## Tasks / Subtasks

- [x] **T1 Numbers + settings.** `controls.fx.maxPlaceDust` (64), `maxOwnerTabs` (12) with defaults; `PlayerSettings.haptics` (default true); `balance.test.ts`.
- [x] **T2 Pure feel helpers** (`render/placeFeel.ts`): sound kind, curves, quiet rule, stale rule; `audio/haptics.ts`; new SFX in `placeholderSfx.ts` (pick click, thunk, clank, click, buzz; `volume` param); tests.
- [x] **T3 `render/PlaceFxView.ts`**: pooled dust + owner tabs + owner dots (one Graphics each, redrawn only while live / on change), drop offsets for `BuildingView`, pick pop for the preview; tests of the pools.
- [x] **T4 Placement** (`placement.ts`): `pointAt` (cursor follow), `rotate(ccw)`, `resting` (blocked chain), chip unpin resets the drag side, `PlacementHud.rotateCcwPressed`, `PlacementFrame.cursorX/Y` + `refused` callback; tests.
- [x] **T5 Keys** (`keyMap.ts`, `KeyboardMouse.ts`, `InputRouter.ts`, `desktopInput.ts`, `wheelRotate.ts`): codes + letters, latches, Ctrl/Cmd+Z pass-through, wheel; tests incl. layout table.
- [x] **T6 Wiring** (`GameScene.ts`, `HudScene.ts`, `NetSimHost.ts` `ageS`, `BuildingView.ts`, `BlockReasonView`): events → feel, refusals → buzz, keys → placement / bar, mouse click/right click in the hand, Esc order, undo / pick-up hooks.
- [x] **T7 Browser check** at 800 × 360 / 568 × 320 (touch, CDP) and 1280 × 720 (mouse + keys); screenshots `docs/art/5-23/`.
- [x] **T8 Gate + mutations + record.**

## Dev Notes

### Decisions (recommended values; the ux-spec decided the rest)

- **D1 Pick pop**: ease-out cubic, 0.8 → 1.0 over 120 ms around the ghost's centre (Graphics `setScale` + compensating `setPosition`; the ghost image's display size × s). Only on a fresh pick (bar tile, key), not a chain re-pin or a key swap's put-away. Click: short 1.9 kHz tick, quiet.
- **D2 Placed feel on the event, not the press** (fairness AC 14): `building.placed` for every owner. My own building's haptic is on that event too (the server's yes), not on the press.
- **D3 Sound kind** (`placeSoundKind`): `solid: false` → click; `wood_barricade`, `reinforced_barricade` → thunk; every other solid type → clank. A new type falls into one of the three without code.
- **D4 Teammates**: beyond 12 m from my survivor → volume × 0.4; pan by screen x (as the blast). At most one placed sound per kind per frame (four players at once).
- **D5 Drop**: art sprites only (every type with an atlas frame: barricades, traps, mine, floodlight, med station, bear trap): the image is drawn 0.15 m higher, easing in (quadratic) to 0 over 120 ms; the shadow stays (reads as landing). The turret's plank plate is part of the shared Graphics layer and doesn't drop; its dust, tab and clank still play. At most 8 drops at once (the dust pool's puffs).
- **D6 Dust**: 8 particles per puff around the footprint's edge, moving outward 0.7 m/s and slowing, size 0.12 → 0.05 m, alpha 0.7 → 0 over 0.4 s, colour 0xa89c88 (wet dust under the Dead City night: a light grey-brown). 64 particles = 8 puffs; a 9th reuses the oldest.
- **D7 Tab and dot**: the tab is an L on the min corner (arms 0.4 m, 0.08 m thick, on the footprint edge), full alpha for 2.6 s then fading 0.4 s; the dot (0.18 m, dark 0.03 m outline) centred 0.2 m inside the min corner. Dots redraw only when the building version, the owners' slots or the phase change. Owner left (slot −1) → grey 0x9e9e9e.
- **D8 Refused**: buzz = 110 Hz square through a 600 Hz low-pass, 0.18 s; haptic `[30, 40, 30]`. Fires once per refusal (server, timeout, or the local certain refusal in `stepPlacement`); a chain that just ends (money / cap for the next) is not a refusal.
- **D9 Haptics setting**: `PlayerSettings.haptics` (default true). `vibrate` called only when both the setting and `navigator.vibrate` exist; errors swallowed.
- **D10 Blocked chain (5.18 Q1)**: options were (i) carry from the survivor (it is already: the carry spot is right where the building was placed), (ii) keep it pinned red at the blocked spot, (iii) **faded until it's clear — recommended and built**: `Placement.resting` set when `chain` falls back to carry; it stays while `error === "blocked"` and the cause is a building (pending overlap or `reason.cause === "building"`); otherwise cleared for the hold. Drawn white 35 %, no hatch/✕, no culprit outline; the reason line shows the label; Place's red ring stays off.
- **D11 "↩ carry" resets the drag side** (`lastDragX/Y = 0`): the chip means "start over". The view-leave and blocked-chain returns keep it (automatic; the player didn't ask).
- **D12 Cursor follow**: `InputRouter.mouseMoves` counts real mouse moves; the scene stores the count at a pick and at every Place; follow = mouse mode, a known cursor, and the count changed. Follow replaces the carry for that frame (`Placement.pointAt`): the ghost isn't pinned, so the chip reads the carry text; no hand-cluster avoid (the cursor over a button is a hover on it).
- **D13 Mouse buttons**: while holding, a left press that misses the HUD buttons = Place (on press, like the buttons); right press = put away. 5.19's mouse press-drag (its D2) is replaced by the absolute follow; touch drags are unchanged.
- **D14 Esc / number order**: Esc while holding = put away (like the shop closing first); the same number again = put away; another number = put away + pick (cap/money toast if it fails; nothing is held then).
- **D15 Undo keys**: Ctrl/Cmd + letter z (any code) → undo; plain letter z → undo only if its `code` isn't bound in `KEY_MAP`. `desktopInput` lets Ctrl/Cmd+Z through (every other Ctrl/Cmd/Alt shortcut stays the browser's).
- **D16 `M`**: letter m with an unbound code → pick-up latch → `onPickUpKey()` no-op (TODO 5.21: pick up the selected building as the action bar's Move ✥).
- **D17 `E` stays the consumable** (code `KeyE`; AZERTY and QWERTZ have E there too). The new keys use `KeyR`, `Space`, `Digit1–7`, `Numpad1–7` and the letters z/m; none is E or Q; the table test proves it for three layouts.
- **D18 Wheel**: accumulate `deltaY` (pixel mode; line mode × 40: Firefox's 3 lines per notch make one step), one step per 100 accumulated, ≤ 1 step / 150 ms, the remainder dropped after a step (a flick = one turn); reset when holding ends.

### Current state (read before changing)

- `scenes/placement.ts`: `Placement` (`carry`, `rotate`, `drag`, `unpin`, `chain` — blocked → `unpin` + `carry`, `check`, `explain`), `stepPlacement` (cancel rules → hold input → ✕ → Place (gate → toast + cancel, or send + chain) → chip unpin → view unpin → ⟳ → carry → drag → check → explain → HUD).
- `scenes/GameScene.ts`: `startPlacement`, `updatePlacement` (fills `placeFrame`), `updateBuildBar` (`stepBuildBar` → `startPlacement`), `update` (router.build, Esc / ☰ → shop close or menu, `runPendingFrame`, the event loop, views), `pendingScene.toast`.
- `scenes/HudScene.ts`: `down` while `placementActive`: chip → `ThumbDrag` (chip), left-half touch → sticks, else buttons, else `ThumbDrag` (mouse too).
- `input/keyMap.ts` (by code), `KeyboardMouse.ts` (latches swap / consumable / menu), `InputRouter.ts` (source, cursor), `desktopInput.ts` (drops every Ctrl/Meta/Alt key).
- `render/BuildingView.ts`: sprites re-laid only on `version`; preview redrawn on its key.
- `audio/placeholderSfx.ts`: `playSfx(name, pan)` (Web Audio placeholders; Epic 9 swaps them).

### Copies touched (brief line 2)

None of the sim copies. `controls.json › fx` gains two client-only caps. `SimEvent["building.placed"]` gains the client-only `ageS?` (never encoded).

### Must be preserved

5.15 carry / hold input / Place = last frame's spot; 5.16 bar; 5.17 reason + hold + culprit; 5.18 chain / pending / gate / view rule; 5.19 touch drag / chip / avoid; 5.12 `E`, consumable buttons; 1.10 mouse aim and source switching; 2.11 Esc menu in waves.

### References

`ux-spec.md` §6.3, §9, §10, §15; `draft-stories.md` BX-9, BX-11; `epics.md` › Stories 5.23, 5.25; story files 5-18 (Q1), 5-19 (L5, D2); `docs/epic-5-decisions.md`.

## Notes for the merge (brief line 19)

- **5.20** (merged, master `a94f15e`): Z / Ctrl+Z set `hudModel.undoPressed` through `scenes/buildKeys.ts › routeBuildKeys` (the undo chip's own path runs). The undo chip's layout isn't touched here.
- **5.21/5.22**: `GameScene.onPickUpKey()` → the action bar's Move ✥ for the selected building. A picked-up building may reuse `Placement.pointAt` for the mouse.
- `controls.json › fx`: `maxPlaceDust`, `maxOwnerTabs` appended (5.20 edits `controls.json › build`: different block).
- `scenes/placement.ts`: `Placement.pointAt`, `rotate(ccw)`, `resting`; `PlacementHud.rotateCcwPressed?`; `PlacementFrame.cursorX?/cursorY?/refused?`.
- `input/keyMap.ts`: new actions `rotate`, `place`, `build`, `undo`, `pickUp`; `buildSlot(code)`; `letterAction(key, code)`.

## Senior Developer Review (AI)

Fresh-agent review by the main session on `36fd9dc` (2026-11-24): **3 medium, 11 low, no high**. Verified sound: feel on server truth (`building.placed`, never the press), pools and caps, key map / layouts, stale-event rules. Fixed on `story-5-23` after merging master.

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| M1 | Medium | `Space` (and `R`, `1`–`7`) were prevented on focused DOM buttons (in-run menu, shop, results), so Space couldn't press them. | `desktopInput`: when the target is a `BUTTON`, `SELECT`, `A` or `[role=button]`, the building keys (place, rotate, build) neither act nor prevent the default; movement, Q, E, Esc unchanged. Test (`keyMap.test.ts`: four control kinds, WASD still walks, Space on the canvas still places). |
| M2 | Medium | The resting (faded) ghost could hide a teammate / zombie in it and rested on any building. | `Placement` remembers the footprint just sent (`restBox`); `resting` lasts only while the ghost overlaps it, the spot is my pending box or my building there, and `blockReason` with that building excepted finds nothing else (a body, another building, a spawn…). Tests: teammate in the ghost (pending and built), carried onto an older building, onto another of my pending boxes; the built spot still rests. |
| M3 | Medium | 5.20's sell / undo haptic (`input/haptic.ts`) ignored the haptics setting. | The sell haptic goes through `audio/haptics.ts › vibrate`; the old helper and its test are deleted; `tools/checks/oneHapticsDoor.test.ts` fails if any client file calls the vibration API elsewhere. |
| L1 | Low | Mouse: "↩ carry" was overridden by the cursor follow at once. | The chip re-anchors the follow (it waits for the next mouse move). |
| L2 | Low | A teammate's placed sound could take the frame's slot from mine; a missing survivor view meant full volume. | `PlacedSoundPicker`: one sound per kind per frame, mine wins, else the loudest, played after the event loop; no view → a teammate's is quiet. Tests. |
| L3 | Low | Owner tabs outlived a sold / destroyed building. | `TabPool.dropMissing` on a building-list change frees a tab whose building was seen and is gone (an online tab whose building hasn't arrived yet stays). Test. |
| L4 | Low | Pause timing of cosmetic effects. | Accepted (cosmetic). |
| L5 | Low | `M` wasn't gated. | `onPickUpKey()` only runs when placing is possible (`canPlace`). **5.21**: also require a selected building of mine. |
| L6 | Low | The wheel's partial notch survived the end of a hold; story said × 33. | The HUD resets the wheel whenever it isn't placing; story text fixed (× 40). |
| L7 | Low | `1`–`7` ignore build-bar paging. | Accepted while ≤ 7 types (today 7); a paged bar must map digits to the shown page (note for the story that adds an 8th type). |
| L8 | Low | A Space / R in the same frame as a number-key swap pressed the new item. | `keyPick` clears `confirmPressed` / `rotatePressed` when it puts the old item away. |
| L9 | Low | Switching from touch to mouse snapped the ghost to the cursor at once. | A source change to the mouse re-anchors the follow. |
| L10 | Low | Non-Latin layouts (Russian, Greek) send a non-ASCII `key`: no Ctrl+Z / M. | `desktopInput` falls back to the US letter of `code` (`KeyZ` → z) when `key` is a single non-ASCII character. Test. |
| L11 | Low | (main session) | Accepted. |

Mutations of the fix tests: **10/10 killed** (control-keeps rule, `role=button`, Latin fallback, M2 other-blocker check, M2 rest-box overlap, M2 built-id exception, direct vibrate in GameScene, mine-wins rule, unknown-view volume, `seen` guard). Two M2 mutations first survived; the built-spot + teammate and other-pending-box tests were added for them.

### Re-review (fresh agent, main session, 2026-11-24)

Re-review of `57a0dd2`: **clean** (M1, M2, M3 and the lows verified). Two optional nits, done:
- `placeFxPools.test.ts`: a full pool with every tab seen; a new tab over the wrapped slot whose building hasn't arrived yet survives `dropMissing` (pins `seen[i] = 0` on reuse; mutation killed).
- `tools/checks/oneHapticsDoor.test.ts` also catches `navigator.vibrate.call/apply/bind(…)`, bracket access `navigator["vibrate"](…)` and destructuring `{ vibrate } = navigator` (self-check cases added; an `import { vibrate }` line is not flagged).

Status → **done**.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, 2026-11-24).

### Debug Log References

- Full gate (`npm run typecheck && npm run lint && npm test && npm run build`) on `story-5-23` (master `47240f7` + this story): exit 0, **293 test files passed, 1 skipped; 2444 tests passed, 3 skipped**; build OK (load 1.3 → 4.1). After the gate only two test files gained a case each (mutation survivors below); both re-run green, lint + client typecheck OK.
- Mutations (brief 9), one per new test / hook, each run against its test file: **21/21 killed** (`placeSoundKind` floor rule, pick-pop curve, puff count, a stale tab taking a slot*, haptics setting, wheel gap, code-before-letter precedence, auto-repeat edge, Ctrl+Shift+Z, `mouseMoves` on the same spot, `pointAt` continuous clamp*, `resting` set, `resting` clear rule, chip side reset, follow skipped in the Place frame, the local refusal hook, ccw turn, timeout buzz, NetSimHost `ageS`, placed-sound rate limit, `maxPlaceDust` schema default). *First survived (a second mechanism covered them); a test reaching each was added: a full tab pool keeps its live tabs; a cursor far outside the view still lands 1 m inside.
- Browser check (own Vite :5323, solo `?wallet=5000`): touch (CDP) at 800 × 360 and 568 × 320, mouse + keys at 1280 × 720; numbers and screenshots in `docs/art/5-23/README.md`; no console or page errors.

- After merging master `ddcb1cf` (5.20) and wiring undo: full gate exit 0, **301 test files passed, 1 skipped; 2494 tests passed, 3 skipped**, build OK (load 2.7 → 3.6); `buildKeys.test.ts` mutation (undo while blocked) killed (22/22); browser: Z and Ctrl+Z each took back the building just placed (1 → 0).

- Review fixes (M1–M3, L1–L3, L5, L6, L8–L10) after merging master `4159b78`: full gate exit 0, **301 test files passed, 1 skipped; 2504 tests passed, 3 skipped**, build OK (load 1.0 → 3.3); fix-test mutations 10/10 killed.

### Completion Notes List

- **Feel (BX-9):** `render/placeFeel.ts` (rules and curves), `render/placeFxPools.ts` (dust 64 / tabs 12, typed arrays, oldest reused), `render/PlaceFxView.ts` (dust, 3 s owner tabs, build-phase owner dots; one Graphics each, redrawn only while live / on change). `BuildingView` lifts a placed sprite 0.15 m → 0 in 120 ms (shadow stays; turret plate doesn't drop, D5), scales the preview 0.8 → 1 in 120 ms on a pick, and draws the resting ghost. Feel plays on `building.placed` (server / sim), never on the press; a teammate's beyond 12 m at × 0.4, panned; at most one placed sound per kind per frame (and per 50 ms in the audio module). New placeholder sounds through the one audio module: pick click, thunk, clank, click, buzz (`playSfx` gained a `volume`).
- **Haptics:** `audio/haptics.ts` + `PlayerSettings.haptics` (default on; no mute setting existed). 12 ms on my placed event; 30-40-30 on a refusal (server answer, timeout, or 5.18's certain local refusal), each with its visual twin (drop + dust; shaking box / toast).
- **Stale events:** NetSimHost sets the client-only `ageS` on `building.placed` (type-only addition in `simEvents.ts`; never encoded). > 1 s or a hidden tab: no sound / haptic / dust; the tab shows for what is left of its 3 s.
- **5.18 Q1 (D10):** `Placement.resting` — after a blocked chain the carried ghost is faded white while only a building / my pending box blocks it (no red, hatch, ✕, culprit; label on the reason line; Place's ring stays normal); first clear or other-cause frame ends it for the hold.
- **5.19 L5 (D11):** "↩ carry" resets the drag side; automatic returns keep it.
- **Mouse + keys (BX-11):** `keyMap.ts` (R, Space, Digit/Numpad 1–7; letters z/m by `event.key` only when the code is free), `KeyboardMouse` latches, `desktopInput` lets Ctrl/Cmd+Z through (not Shift), `wheelRotate.ts`, HudScene (left press off the buttons = Place, right = put away, wheel), GameScene (`buildKeys`, `keyPick` with same-key put-away / swap, Esc puts away first, cursor follow via `InputRouter.mouseMoves` + `Placement.pointAt`). Z / Ctrl+Z press 5.20's undo chip (`routeBuildKeys` → `hudModel.undoPressed`; merged master `a94f15e`); `onPickUpKey()` stays a no-op hook (5.21 not merged). E stays the consumable (layout table test: QWERTY, AZERTY, QWERTZ).
- **Copies (brief 2):** no sim copy touched; 0 B/s added (brief 11). Brief 12: pools capped from `controls.json › fx`; no per-frame allocation (typed arrays, reused scratch). Brief 20: no new texture.
- Not verified: a real phone (haptics, finger feel), sounds by ear, an online teammate's placement (shared event path, unit-tested), real AZERTY/QWERTZ keyboards (unit-tested with their code/key pairs). The `building.placed` age test sits in `NetSimHost.brute.test.ts` (it reuses that file's room rig).

### File List

- `_bmad-output/implementation-artifacts/5-23-placement-feel-and-owner-marks.md` (new), `sprint-status.yaml`
- `packages/shared/src/config/balance/controls.json`, `balanceSchema.ts`, `balance.test.ts`; `core/simEvents.ts`
- `apps/client/src/render/placeFeel.ts` (+test), `placeFxPools.ts` (+test), `PlaceFxView.ts` (new); `BuildingView.ts`, `BlockReasonView.ts`
- `apps/client/src/audio/haptics.ts` (+test), `placeSfx.test.ts` (new), `placeholderSfx.ts`; `settings/settings.ts`
- `apps/client/src/input/keyMap.ts` (+`keyMap.test.ts` new), `KeyboardMouse.ts`, `InputRouter.ts`, `desktopInput.ts`, `wheelRotate.ts` (+test)
- `apps/client/src/scenes/buildKeys.ts` (+test, new), `placement.ts`, `placement.feel.test.ts` (new), `pendingFlow.ts` (+test), `GameScene.ts`, `HudScene.ts`, `hudModel.ts`
- `apps/client/src/sim/NetSimHost.ts`, `NetSimHost.brute.test.ts`
- `docs/art/5-23/` (README + 11 screenshots)

### Change Log

- 2026-11-24: Story file written (5.23 + 5.25 merged), ready-for-dev.
- 2026-11-24: Re-review clean; nits done (reused tab slot test, wider vibration-API scan); status → done.
- 2026-11-24: Review fixes M1–M3 and lows (L4, L7, L11 accepted); merged master `4159b78`; gate green; status stays review (the mediums get a re-review).
- 2026-11-24: Merged master `ddcb1cf` (5.20 take back / sell / undo, Epic 8 docs); Z / Ctrl+Z wired to 5.20's undo chip via `scenes/buildKeys.ts` (+test; mutation killed); full gate re-run on the merged tree (see Debug Log).
- 2026-11-24: Built (feel, owner marks, resting chain ghost, chip side reset, mouse + keys, undo / pick-up hooks); gate green; 21/21 mutations killed; browser check at 800 × 360, 568 × 320, 1280 × 720. Status → review.
