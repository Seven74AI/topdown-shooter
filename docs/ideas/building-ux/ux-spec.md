---
title: Building UX rework: placing, moving, selling, repairing
status: draft (for the designer's pick; then gds-correct-course)
updated: 2026-11-23
scope: build phase only (placement, building actions, their HUD); weapons/gear shop and the wave HUD unchanged
sources:
  - docs/ideas/building-ux/party-notes.md (the roundtable and its decisions)
  - apps/client/src/scenes/placement.ts, render/BuildingView.ts, scenes/HudScene.ts, scenes/GameScene.ts, scenes/repairPanel.ts
  - packages/shared/src/buildings/buildings.ts, upgrade.ts, repair.ts; config/balance/buildings.json
  - stories 3-1, 3-4, 3-5, 3-6, 3-7, 5-9, 5-10; epics.md 5.14
prototype: docs/ideas/building-ux/prototype.html
---

# Building UX rework: spec

> **Spine-wins rule:** where this spec and the prototype disagree, this spec wins. The prototype is there to feel the numbers on a phone. Values tagged `[ASSUMPTION]` are first guesses for the playtest to tune.

## 1. Foundation

- **Form factor:** phone, landscape, browser. Reference screen **800 × 360 CSS px** (6.5" Android), safe-area insets respected. Also 4:3 tablets and desktop (mouse + keys, §9).
- **Scale:** the game camera shows 24 m across (`pixelsPerMeter`), so the reference phone is ≈ 33 px/m. The prototype defaults to **48 px/m** (your request) with a toggle for the real camera. All world sizes here are in **metres**; HUD sizes in **CSS px** (× `dpr()` in canvas space, as `sizes.ts` does).
- **Input:** twin-stick touch. Left half = floating move stick (always). Right half = aim/fire in a wave, **the builder's thumb in a build phase** (new).
- **Engine/UI:** Phaser 4 canvas HUD (`HudScene`, `HudButtons`), React only for the shop/menu screens. Nothing in this spec needs DOM UI.
- **Authority:** the server judges every place / move / sell / repair / upgrade with the shared rules. The client only colours, explains and predicts.

## 2. What changes, in one table

| Today | New |
| --- | --- |
| Buy in the shop → shop closes → placement mode | **Build bar** on the right thumb: tap a tile, the ghost is in your hands |
| Survivor frozen, both sticks off | **Keep moving**: the left stick works, the ghost is carried in front of you |
| Ghost centred under the finger (absolute) | **Carry** at a fixed offset + **relative drag** with the right thumb (never under the finger) |
| ⟳ ✓ ✕ bottom centre, ✓ ends the mode | **Place / Rotate / Put away** where the right thumb rests; Place doesn't end the mode (chain) |
| "Can't build here" for everything | **The reason** + the **culprit highlighted** + spawn no-build circles + range rings |
| No undo, no sell, no move | **Undo chip**, **Take back** (100 % this phase), **Sell** (50 %), **Move** (long-press or the Move button) |
| Repair panel bottom centre | **Action bar** on the right thumb (Move · Upgrade · Repair · Sell · ✕) |
| Buildings pop in | **Placement thunk**, owner pips; teammates' ghosts (last story) |

## 3. Information architecture: the right-thumb cluster

In a build phase the bottom-right quadrant holds **one cluster with three states**. The right thumb never has to look somewhere new.

```
                 ┌─────────────── 800 × 360 CSS px (landscape) ───────────────┐
                 │ HP ▮▮▮▮▮▮      WAVE 3 · BUILD 0:21           $380   ☰     │
                 │                                                            │
                 │                         [survivor]                         │
                 │                            ▢ ghost                         │
                 │   (move stick                                [reason line] │
                 │    anywhere                                  ✕             │
                 │    on the left)            ┌──────────┐   ↶     ⟳     ( PLACE )
                 │                            │  READY   │                    │
                 └────────────────────────────┴──────────┴────────────────────┘
```

| State | When | Contents (right-thumb cluster) |
| --- | --- | --- |
| **Build bar** | Build phase, hands empty, nothing selected | 4 × 2 tiles: barricade, turret, spike trap, mine, bear trap, med station, floodlight*, **🛒 Shop** (weapons/gear/cards) |
| **Hand** | Holding a ghost (new or picked up) | **Place**, **Rotate**, **Put away ✕**, **Undo ↶** (5 s after a place), item chip (name · price · "↩ carry" when pinned), reason line |
| **Action bar** | A building is selected | **Move ✥**, **Upgrade $Y**, **Repair $X**, **Sell +$Z / Take back +$Z**, **✕**, info line |

\* only when the type's `inShop` is true (5.10 keeps the floodlight hidden until blackout). Tiles come from `shopBuildings(balance)`, so 5.14's bear trap appears without UI work. If a later epic needs more than 7 types, the 7th tile becomes "More ▸" and opens a second page. `[ASSUMPTION]`

Outside these: **Ready** stays at the bottom (168 × 52), shifted **40 px left of centre** so its right edge never meets the cluster on an 800 px screen. The old **Shop** button next to Ready moves into the build bar's 8th tile. The shop screen loses its buildings section.

## 4. Sizes and positions (CSS px, from the bottom-right safe-area corner)

Positions are the button **centres**, measured as (from right, from bottom).

| Element | Size | Centre (right, bottom) | Notes |
| --- | --- | --- | --- |
| Place | 76 circle | (92, 92) | Primary. Green when valid, grey + red ring when blocked (still sends: the server judges) |
| Rotate ⟳ | 60 circle | (190, 80) | 🔒 badge once pressed (auto-rotate off for this held item) |
| Put away ✕ | 48 circle | (80, 196) | Reach up on purpose: rare |
| Undo ↶ | 48 circle | (270, 64) holding; (300, 64) with empty hands (left of the build bar) | Shown 5 s after each placement; a 5 s ring drains around it |
| Item chip | 160 × 32 | right edge at 16, bottom 250 | "Turret · $250 · ×1 left". Tap = ↩ carry when pinned |
| Reason line | text 17 px | right-aligned at 16, just above the item chip (bottom ≈ 280) | White when valid ("Place Wood barricade · $40"), red with the reason when blocked. Must clear the wallet / count lines at the top-right on a 360 px-tall screen |
| Build bar tiles | 56 × 56, 8 gap | grid 248 × 120, inset 16 | Icon + price (14 px). Unaffordable: 40 % opacity, red price. Count "4/6" top-right of the grid |
| Action bar buttons | 64 × 56, 8 gap | one row, right-aligned at 16, bottom 92 | Info line above: "Auto-turret · Bo's · HP 210/300" |

Minimums: every target ≥ **48 px** (the 44 px floor in `sizes.ts` stays the hard floor), ≥ **12 px** between targets, ≥ **16 px** inside the safe-area inset (Android back-swipe and case lips).

## 5. Interaction primitives (numbers)

| Primitive | Value | Where it comes from |
| --- | --- | --- |
| Tap | down → up ≤ **300 ms** and ≤ **12 px** travel | 3.7 (unchanged) |
| Long-press (pick up own building) | ≥ **450 ms**, ≤ **12 px** travel; a ring fills from 150 ms | new `[ASSUMPTION]` |
| Drag start (right half, holding) | travel > **8 px** | new |
| Drag gain | **1.0**: the ghost moves 1 m per 48 px of finger at 48 px/m (in-game: 1 m per ≈ 33 px) | new `[ASSUMPTION]` |
| Snap | 0.5 m lattice (`BUILD_GRID_M`), min corner (`cornerForCentre`); **0.1 m hysteresis** so the ghost doesn't jitter on a boundary | 3.4 + new |
| Building tap tolerance | footprint + **0.4 m** each side, nearest centre wins | 3.7 (unchanged) |
| Undo window | **5 s** chip; take-back stays possible in the action bar for the whole build phase | new |
| Pending timeout | **2 s** without `building.placed` / `refused` → treated as refused ("No answer from the server") | new `[ASSUMPTION]` |
| Chain rate | ≤ **4** placements/s from one client (the guard allows 10/s) | new |

## 6. The hand: carrying, dragging, rotating, placing

### 6.1 Carry (the default)

- The ghost's **near edge sits 1.0 m beyond the survivor's body** along the facing direction:
  `centre = survivor + facing × (0.4 body radius + 1.0 gap + half the footprint's extent along facing)`
  then snapped. That gives a barricade across your path 1.65 m, a turret / med station / floodlight / bear trap 1.9 m, a spike trap 2.4 m, a mine 1.65 m. `[ASSUMPTION]`, tuned in the prototype ("Carry gap").
- **Facing** in a build phase = the move direction (the aim stick is free); when the stick is released the last facing stays.
- **Auto-rotate:** the long side goes **across the facing** (facing north/south → rot 0/2, east/west → rot 1/3). The two-sided barricade art puts its **struts on the builder's side**. Rot changes only when facing crosses a 45° diagonal by more than **10°** (hysteresis). Square footprints don't rotate on their own.
- One press of ⟳ turns auto-rotate **off** for this held item (🔒 on the button); each press turns 90° clockwise around the ghost's centre.

### 6.2 Drag / pin (precision)

- A touch on the **right half** that starts on no button and travels > 8 px **pins** the ghost and moves it **relatively** (gain 1.0). The ghost never sits under the finger.
- Pinned = stays put in the world while you walk. The chip shows "↩ carry": tap it to carry again. A pinned ghost that leaves the screen (inset 1 m) returns to carry by itself.
- The left stick keeps working while the right thumb drags: walk and nudge at once.
- The ghost is clamped to the view, 1 m in from the edges.
- **Camera lead** (switch, default off `[ASSUMPTION]`): the camera eases toward a pinned ghost by 35 % of the survivor→ghost offset, max 3 m, over 200 ms.

### 6.3 Place

- **Place sends at once**: no ✓ step. If the client predicts a refusal, the button is grey with a red ring, but a press still sends (the server is the judge, like 3.4), shakes the ghost and buzzes.
- **Chain:** after a place, the **same item stays in hand** if the shown wallet still covers the price and you're under the cap; otherwise the hand empties and the reason toasts ("Not enough money for another", "Building limit reached (6)").
- **Next-ghost jump:** the next ghost is pinned **one footprint further along its long side** (barricades end to end, so three Places = a 6 m wall), toward the side the last drag went or, by default, the right of your facing. Square types jump one footprint width; mines 1.0 m. If that spot is blocked, the ghost goes back to carry.
- ✕ = **put away** (nothing is charged for an unplaced ghost, as today). The build bar is hidden while holding, so the hand cluster is the only thing under the thumb.
- The hand empties when the phase leaves the build, a new wave number starts, the menu opens, the survivor is downed/out, or the run ends (today's rules).

### 6.4 Pending (lag)

- A sent placement is drawn as a **dashed outline** of the footprint with a spinner tick at its corner.
- It **counts as occupied** for the next ghost's check, and its price comes off the **shown** wallet (build bar, chip, reason line) until the answer.
- `building.placed` → becomes the real building (thunk, §10).
- `building.refused` (or the 2 s timeout) → the dashed box shakes 3 × (±0.1 m, 150 ms), fades in 300 ms, the reason toasts and the price is shown back.
- Never more than `maxPerPlayer − owned − pending` in flight.

## 7. Feedback: valid, blocked, and why

### 7.1 The ghost

| | Valid | Blocked |
| --- | --- | --- |
| Fill | green `#4caf50` 45 % (art types: 22 % over the 70 % art ghost, as today) | red `#e53935` 45 % + **45° hatch** (white 25 %, 0.25 m spacing) |
| Outline | 0.08 m solid, same colour | 0.08 m, red |
| Glyph | none | ✕ in the centre, 0.4 m |
| Lattice | ±4 cells, white 18 % (today) | same |
| Range ring | turret 8 m (`turret.rangeM`), mine 1 m / 2.5 m (today), med station 2 m (`heal.radiusM`), floodlight 4 m (`light.radiusM`), bear trap plate | same, dimmed |

### 7.2 The reason and the culprit

The server's code stays one `blocked`. A **client-only** `blockReason(world, ownerId, box)` next to `footprintBlocked` returns the **first** cause, in this order, plus what to highlight:

| Order | Cause | Reason line | Highlight in the world |
| --- | --- | --- | --- |
| 1 | cap | "Building limit reached (6)" | the count on the bar pulses |
| 2 | money | "Need $250 (you have $180)" | price on the chip red |
| 3 | off map | "Off the street" | ghost edge past the map edge |
| 4 | spawn clearance | "Too close to a zombie spawn (2 m)" | that spawn's **2 m circle** red, 2 px dashed |
| 5 | map solid / cover | "Blocked by the car" / "the bus" / "a wall" / "the sandbags" | that box's outline red, 0.06 m |
| 6 | building | "Overlaps a building" | that building's outline red |
| 7 | me | "You're standing there" | my ring red |
| 8 | teammate | "Bo is standing there" | Bo's ring red |
| 9 | zombie | "A zombie is in the way" | its body red-tinted |

Map object names come from the Tiled objects (`city_bus`, `parked_car_1`, `sandbags_south`…) through a small name → word table. `[ASSUMPTION]`

- While holding anything, **every spawn's no-build circle** in view is drawn faint (red 12 % fill, dashed edge), so players learn the no-go zones.
- **Build-bar tiles** show money and cap before you pick: you can't be surprised by "Not enough money" after carrying a turret across the street.

### 7.3 Accessibility floor

- Valid vs blocked never relies on colour alone: hatch + ✕ glyph + the Place button's state + text.
- Reason text ≥ 16 px (min 14 px from `sizes.ts`), black 4 px stroke as the HUD's other text.
- Haptics optional (settings mute); every haptic has a visual twin.
- One-handed fallback: on a tablet or with one thumb, carry + Place works with the right thumb alone if the "Carry follows the right thumb" setting is on `[ASSUMPTION]` (later; not in the first stories).

## 8. Selecting a building: move, upgrade, repair, sell

| Action | Who | When | Server rule |
| --- | --- | --- | --- |
| **Select** (tap) | anyone | build phase, hands empty, no shop/menu | client only (3.7 tap rule) |
| **Pick up** (long-press 450 ms on my building, or Move ✥) | owner | build phase | client only until Place |
| **Move** (Place while carrying a picked-up building) | owner | build phase | `building.move {id, gx, gy, rot}`, atomic, free, keeps HP/tier/paid; the new footprint is checked with this building ignored; refused → it stays where it was |
| **Repair $X** | anyone (3.7) | build phase | unchanged: `ceil(price × 0.5)`, full HP |
| **Upgrade $Y** | owner (5.9) | build phase | unchanged |
| **Take back +$Z** | owner | build phase, building placed **this** build phase | `building.sell {id}`: refund = everything paid for it this phase (price + upgrades), 100 % |
| **Sell +$Z** | owner | build phase, older building | `building.sell {id}`: refund = `floor(0.5 × everything paid for it)` (+ 100 % of upgrades bought this phase) |

- Picking up draws the original as a **dashed outline** (it still stands and blocks for everyone until the move is accepted). ✕ while carrying a picked-up building puts it back (sends nothing).
- Teammates' buildings show Repair only (+ the info line). Move/Upgrade/Sell are absent, not greyed: less to read.
- **Proximity select** (stretch, switch `[ASSUMPTION]`): with empty hands, standing with the body edge within 0.8 m of a **damaged** building for 0.3 s selects it.

### Fairness rules (write these into the stories' ACs)

1. **The server decides.** Every place / move / sell / repair / upgrade is validated by shared code on the server (solo: the same functions). Client colours, reasons and pending boxes are predictions.
2. **No money loop.** Take-back this phase = 100 %. Sell later = 50 % of what was paid, so selling and rebuilding costs exactly a repair (repair = 50 % of the tier's price). Checked for the barricade ladder: wood 40 → sell 20 / repair 20; metal (paid 160) → sell 80 / repair 80.
3. **Owner only** for move, sell, upgrade. **Anyone** repairs. Nobody can move, sell or take back a teammate's building.
4. **Build phase only** for every action (today's `not_build_phase`).
5. **Moving never repairs, never resets wear** (spike trap wear, 5.9), never changes the owner, tier or kill credit.
6. **Mines and traps** move like any building (same rules); a mine can't be moved onto a spawn's clearance (same `footprintBlocked`).
7. **Cosmetic is cosmetic:** teammate ghosts never block anything and are never sent outside a build phase.
8. **Cap:** placed + pending never exceed `maxPerPlayer`; a move doesn't change the count.

## 9. Input schemes

| Action | Touch | Mouse + keys |
| --- | --- | --- |
| Pick an item | tap a build-bar tile | `1`–`7`, or click the tile |
| Move while holding | left stick | WASD |
| Position precisely | right-half drag (relative) | the ghost follows the **cursor** (absolute; the mouse isn't a thumb) |
| Rotate | ⟳ | `R` / mouse wheel |
| Place | Place | left click / `Space` |
| Put away | ✕ | right click / `Esc` / the same number key again |
| Undo | ↶ | `Ctrl+Z` / `Z` |
| Select a building | tap | click |
| Pick up my building | long-press / Move ✥ | `M` with it selected, or drag it with the mouse |

## 10. Game feel and juice

| Moment | Visual | Audio | Haptic (Android) |
| --- | --- | --- | --- |
| Pick an item | ghost scales 0.8 → 1.0 in 120 ms | soft click | — |
| Snap to a new lattice point | — (no tick: walking would spam it) | — | — |
| Turn valid ↔ blocked | colour cross-fade 80 ms | — | — |
| Place accepted | dust puff (8 particles, 0.4 s), building drops 0.15 m → 0 in 120 ms, owner-colour corner tab for 3 s | "thunk" (wood), "clank" (metal/turret), "click" (mine/trap) | 12 ms |
| Place refused | dashed box shakes 3 × 150 ms, fades | dull buzz | 30-40-30 ms |
| Take back / sell | building lifts and fades 200 ms, "+$40" floats up 0.6 m in 600 ms | coins | 12 ms |
| Move | old spot fades, new one drops (as a place) | thunk | 12 ms |
| Teammate places | same puff + thunk at their spot (quieter beyond 12 m), their corner tab | same | — |

Owner pips: during a build phase every building shows a 0.18 m dot in its owner's ring colour (2.9 colours) at its min corner. Hidden in a wave (readability: Dead City look, brief 13).

## 11. What teammates see (network)

- Placed / moved / sold buildings: through the existing `buildings` map + events (`building.placed`, new `building.moved`, `building.sold`), with FX at the spot.
- **Teammate ghosts** (last story): `building.ghost {type, gx, gy, rot}` or `{type: ""}`, sent **only on change**, at most **4 Hz**, build phase only, relayed to the others; drawn as a **dashed outline in the owner's colour + their name**, 50 % alpha, never coloured valid/blocked (we don't know their wallet). Budget: ≤ 4 × 4 Hz × ~8 B × 3 ≈ **0.4 KB/s for 30 s**, 0 B/s in waves.

## 12. Key flows

### Kev's wall (the climax: a 6 m wall in four seconds)
1. Build phase, 0:28 left, Kev has $260. The build bar is under his right thumb.
2. He taps **Barricade**. The palisade ghost appears 1.65 m ahead, across his path, struts toward him.
3. He walks to the alley mouth with his left thumb; the ghost slides with him and snaps every 0.5 m.
4. It's red: *"Too close to a zombie spawn (2 m)"*, and the spawn's circle lights up. He steps back one stride: green.
5. He nudges it 0.5 m right with a tiny right-thumb drag so it's flush with the dumpster.
6. **Place, Place, Place.** Each next ghost jumps end-to-end. 6 m of wall, $120, about 4 s.
7. The 4th would overlap the wall: *"Blocked by a wall"*, red outline on the building. He puts the barricade away with a tap on its tile.

### Ana's turret (precision under lag, ?lag=150)
1. Ana taps **Turret** ($250 of her $300). The 8 m range ring shows.
2. She walks behind the bus, drags the ghost so the ring covers both lanes, presses Place.
3. A dashed box with a spinner appears for ~200 ms, then the turret drops with a clank. Her shown wallet went to $50 at the press, not after the answer.
4. The chain ghost appears next to it, but the reason line reads *"Need $250 (you have $50)"* and the hand empties.

### Bo fixes a mistake (move, take back, repair)
1. Bo placed a spike trap where the horde doesn't walk. He long-presses it: after 450 ms it lifts into his hands, its old spot dashed.
2. He walks 6 m, places it. It moves, free, same wear.
3. He taps Ana's damaged barricade: the action bar shows only *Repair $20*. He taps it.
4. He taps his own mine from this build phase: *Take back +$60*. He takes it back and buys a turret instead.

## 13. What the prototype taught us (headless run, 800 × 360)

- **A building under a HUD button can't be tapped**: a spike trap below the survivor sat under Ready, and the tap pressed Ready. The camera keeps the survivor centred, so with buildings near the bottom edge this will happen. Mitigation: the action bar can also be reached by long-pressing (own buildings) and by proximity select; Ready asks "Start the wave now?" only if a building tap was ambiguous. `[ASSUMPTION]` (needs a phone playtest).
- **The 8 m turret ring is bigger than the 48 px/m view's height** (13.5 m at most in the real camera). It reads as two arcs. It's still useful, but a filled 15 % disc may read better than a line. Playtest.
- **Auto-rotate + end-to-end chain** made a 6 m wall in 3 taps without touching ⟳ once.
- **Teammate collision while carrying:** a ghost carried past a teammate flickers red ("Bo is standing there") for a frame. That's correct, but the reason line should hold a reason for ≥ 250 ms before switching back to valid, so it doesn't flash. `[ASSUMPTION]`

## 14. Inspiration and anti-patterns

- **Do:** carry-to-place (survival builders), relative-drag precision (mobile RTS cursor), "why it's blocked" with the culprit lit up, instant place + undo instead of confirm dialogs.
- **Don't:** freeze the survivor; put the ghost under the finger; confirm dialogs for a $40 plank; a modal shop between every building; colour-only validity; hide prices until after the purchase.

## 15. Open questions for the designer

1. **Carry only, or carry + drag?** (the prototype's mode switch; the room recommends carry + drag)
2. **Hold-to-paint walls** (hold Place and walk, ≤ 4/s)? Recommended: not in v1.
3. **Proximity select** for repairs? Recommended: stretch, after the action bar.
4. **Camera lead** toward a pinned ghost? Recommended: off, try it in the prototype.
5. **Sell refund 50 %**: OK, or would you rather have no sell (only take-back this phase)?
6. **Teammate ghosts**: worth a story now, or after the other stories?
