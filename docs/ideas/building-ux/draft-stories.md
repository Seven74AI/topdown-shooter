# Building UX rework: draft stories

**Status:** draft for the main session's `gds-correct-course` → `gds-create-story` → its usual build/review loop.
**Source:** `ux-spec.md` (numbers, flows), `party-notes.md` (why), `prototype.html` (feel; live copy: claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR).
**Numbering:** `BX-1`… are placeholders. Correct-course picks the real numbers (e.g. a short "Epic 5b: Building UX" after round C, or slots in Epic 5).

**Every story inherits the Epic 5 brief** (§11 of `epic-4-retro-2026-11-23.md`). The lines that matter most here:
- **2**: anything the server judges is shared code with every copy listed: World → schema → `syncState` → state-view key lists → `NetSimHost` mirror → `Predictor` → `devThrottle` → `snapshotWorld`.
- **3**: the fairness rules below go into the ACs **before** building.
- **4**: reviewers try to beat each rule (listed per story).
- **14**: test under `?lag=150&jitter=20`, after a hidden tab slept across a build start, on a late scene start.
- **17**: new C2S messages go through `this.net.guard` (shared "other" bucket, ~10/s).

**Fairness rules (shared by every story here):**
- **F1 Server decides:** every place / move / sell / repair / upgrade is validated by shared code on the server (solo: the same functions). Client colours, reasons and pending boxes are predictions only.
- **F2 No money loop:** take-back in the same build phase refunds 100 % of what was paid for that building this phase; selling later refunds `floor(50 % × paid)` (+ 100 % of what was paid this phase). Selling and rebuilding costs exactly a repair. Repairs are never refunded.
- **F3 Owner only** for move, sell, take-back, upgrade. **Anyone** repairs (3.7, unchanged).
- **F4 Build phase only** for every building action (`not_build_phase`).
- **F5 Moving keeps everything:** HP, wear (5.9 spike trap), tier, owner and kill credit. It never repairs.
- **F6 Cap:** placed + pending ≤ `maxPerPlayer`; a move doesn't change the count.
- **F7 Cosmetic is cosmetic:** teammate ghosts never block, never leave the build phase.

**Suggested order and size** (S ≈ 1 build/review loop, M ≈ 2):

| Order | Story | Size | Server change? | Depends on |
| --- | --- | --- | --- | --- |
| 1 | BX-1 Carry the ghost and keep moving | M | no | — |
| 2 | BX-2 Build bar replaces the shop for buildings | S | no | BX-1 |
| 3 | BX-3 Why it's red | S | no | BX-1 |
| 4 | BX-4 Place, place, place (chain + pending under lag) | M | no | BX-1 |
| 5 | BX-5 Thumb drag to nudge and pin | S | no | BX-1 |
| 6 | BX-6 Take back, sell and undo | M | **yes** (`building.sell`) | BX-4 |
| 7 | BX-7 Building action bar | S | no | BX-6 |
| 8 | BX-8 Move a building | M | **yes** (`building.move`) | BX-7 |
| 9 | BX-9 Placement feel and owner marks | S | no | BX-1 |
| 10 | BX-10 Teammates' ghosts | S | **yes** (relay) | BX-1 |
| — | BX-11 Mouse and keys parity (optional) | S | no | BX-1, BX-5 |

BX-1 to BX-5 are **client-only**: they change no message, no schema and no server code, so they can run alongside Epic 5's server work. BX-6, BX-8 and BX-10 touch the server; schedule them after 5.10 and 5.14 have merged so the building files aren't contended.

---

## BX-1 Carry the ghost and keep moving

As a player, I want to keep walking while I hold a building, so that I can put it exactly where I'm standing instead of freezing and tapping.

**Acceptance criteria**
1. **Given** a build phase, **when** I start placing a building, **then** the left stick still moves my survivor, the input sent is normal movement (not `neutralizeInput`), and the right stick doesn't fire (there is nothing to shoot; the right half is reserved for building in a build phase).
2. **Given** I'm holding a building and not pinned (BX-5), **then** the ghost's near edge sits **1.0 m** (`BUILD_CARRY_GAP_M`, balance/controls JSON) beyond my body along my facing: `centre = me + facing × (0.4 + 1.0 + half the footprint's extent along facing)`, its min corner snapped to the 0.5 m lattice with **0.1 m hysteresis**.
3. **Given** a non-square building, **then** it auto-rotates so its long side is across my facing; it changes only when facing passes a diagonal by more than **10°**. The two-sided barricade art puts its struts on my side.
4. **When** I press ⟳, **then** it turns 90° clockwise around its centre and auto-rotate is off for this held item (🔒 on the button).
5. The hand cluster replaces ⟳ ✓ ✕ in the bottom centre: **Place** 76 px at (92, 92), **⟳** 60 px at (190, 80), **✕** 48 px at (80, 196) (CSS px from the bottom-right safe-area corner; ux-spec §4). Ready moves 40 px left of centre.
6. **Place** sends `building.place` at once (no confirm step). The ghost stays in hand only after BX-4; until then Place ends holding (as ✓ does today).
7. Holding ends on ✕, the phase leaving the build, a new wave number, the menu opening, me being downed/out, or game over (today's rules, unchanged).
8. My own body never blocks the carried ghost at default settings (the 1.0 m gap); if a teammate does, the ghost is red (BX-3 says why).

**Fairness / beat the rule:** walking doesn't change what the server accepts (same `placementError`). Reviewers try: carry a ghost onto a teammate, onto a spawn's 2 m circle, off the map edge, through a wall corner; place while running at full speed under `?lag=150` (the spot sent = the spot shown at the press).

**Tests:** `placement.ts` unit tests for the carry centre per type and facing (barricade 1.65 m, turret 1.9 m, trap 2.4 m), the rotation hysteresis, the snap hysteresis; a browser check that the survivor moves while holding.

---

## BX-2 Build bar replaces the shop for buildings

As a player, I want my buildings under my right thumb, so that I don't open a menu for every barricade.

**Acceptance criteria**
1. **Given** a build phase with empty hands and nothing selected, **then** the bottom-right shows a **4 × 2 grid of 56 px tiles** (8 px gaps, 16 px inset): every building where `forSale && inShop` (5.10's flag) in balance order, and **🛒 Shop** as the last tile. 5.14's bear trap appears without UI changes.
2. Each tile shows the building's icon (the same code-drawn art as in the world) and price. **When** I can't afford it, **then** the tile is at 40 % opacity with a red price; **when** I'm at the cap, the count above the grid reads "6/6" in red.
3. **When** I tap an affordable tile, **then** that building is in my hands (BX-1) at once. **When** I tap an unaffordable tile or I'm at the cap, **then** nothing is picked and the reason toasts ("Need $250 (you have $180)", "Building limit reached (6)").
4. The Shop tile opens today's shop (weapons, upgrades, 5.13 cards). The shop no longer lists buildings, and the separate Shop button next to Ready is gone.
5. The grid is hidden while holding (hand cluster) and while a building is selected (BX-7).
6. More than 7 building types: the 7th tile becomes "More ▸" and pages. (Not needed today.)

**Tests:** tile list from balance (with `inShop: false` hidden), affordability and cap states, shop no longer lists buildings, a browser screenshot at 800 × 360 and 1024 × 768.

---

## BX-3 Why it's red

As a player, I want to know why I can't build somewhere and what's in the way, so that I fix it in one move.

**Acceptance criteria**
1. A shared, **client-used** `blockReason(world, ownerId, box, exceptId?)` next to `footprintBlocked` returns the first cause in this order with what caused it: off map → spawn clearance (which spawn) → map solid/cover (which object) → another building (which) → me → a teammate (who) → a zombie. `footprintBlocked` stays the server's check; a unit test proves `blockReason(...) !== null ⇔ footprintBlocked(...)` over random layouts (fuzz, brief 7).
2. The reason line above the hand cluster shows: "Off the street", "Too close to a zombie spawn (2 m)", "Blocked by the bus / a car / the sandbags / a wall" (from a name table for the Downtown objects), "Overlaps a building", "You're standing there", "Bo is standing there", "A zombie is in the way", "Need $X (you have $Y)", "Building limit reached (6)". The server's refusal codes don't change.
3. The culprit is outlined red in the world: the map box, the building, the spawn's 2 m circle, the player's ring.
4. While I hold anything, every spawn's 2 m no-build circle in view is drawn faint (red 12 % fill, dashed edge).
5. Blocked ghosts get a 45° hatch and a ✕ glyph as well as the red colour (colour-blind safe). Place turns grey with a red ring but still sends (the server judges, as today).
6. Range rings from balance: turret `rangeM`, mine trigger/blast (today), med station `heal.radiusM`, floodlight `light.radiusM`, bear trap plate.
7. A reason stays on screen ≥ 250 ms before switching back to valid (no flicker while walking past a teammate).

**Fairness / beat the rule:** the client explanation never disagrees with the server's accept/refuse for the same World (the fuzz test). Reviewers try a spot that's off-map *and* near a spawn (first cause wins, matching the order).

---

## BX-4 Place, place, place (chain and pending under lag)

As a player, I want to place several of the same building in a row and trust it under lag, so that I can build a wall in seconds.

**Acceptance criteria**
1. **Given** I place and can still afford another and I'm under the cap (counting pending), **then** the same building stays in my hands. Otherwise the hand empties with a toast ("Not enough money for another" / "Building limit reached (6)").
2. **Chain jump:** the next ghost appears **pinned one footprint further along its long side** (barricades end to end; square types one footprint toward the right of my facing; mines 1.0 m), toward the side of my last drag (BX-5) if any. If that spot is blocked, the ghost goes back to carry.
3. **Pending:** a sent placement is drawn as a dashed outline with a spinner tick; it counts as occupied for my next ghost; its price comes off the **shown** wallet (HUD, tiles, chip) until the answer.
4. On `building.placed` the pending box becomes the building. On `building.refused` (or no answer within **2 s**) it shakes 3 × 150 ms, fades in 300 ms, the reason toasts and the shown wallet goes back.
5. No more than `maxPerPlayer − owned − pending` placements are ever in flight; at most 4 sends per second from one client.
6. **Under `?lag=150&jitter=20`:** three quick Places give three buildings, no double charge, the HUD wallet never shows less than the server's final wallet for more than one round trip.

**Fairness / beat the rule (F1, F6):** reviewers try 10 taps in 1 s with $100 (only 2 barricades accepted, 2 charged), tapping Place at the build→wave edge (refused `not_build_phase`, nothing charged), a hidden tab across a build start with pending boxes (cleared on the new phase).

**Tests:** unit tests for the chain jump per type/rot, pending wallet maths; NetSimHost test at 150 ms; browser check of a 3-barricade wall.

---

## BX-5 Thumb drag to nudge and pin

As a player, I want to nudge the ghost with my right thumb without covering it, so that the last half-metre is easy.

**Acceptance criteria**
1. **Given** I'm holding a building, **when** a touch on the right half that didn't start on a button travels > **8 px**, **then** the ghost is **pinned** and moves by the finger's movement × **gain 1.0** (relative, never jumping under the finger). Snap with 0.1 m hysteresis.
2. The left stick keeps moving my survivor at the same time.
3. Pinned = the ghost stays in the world while I walk. The item chip shows "↩ carry" (orange border); tapping it carries it again. A pinned ghost that leaves the view returns to carry by itself.
4. The ghost is clamped to the view, 1 m in from the edges.
5. `controls.json` holds `buildDragGain`, `buildDragStartPx`; `?tune=1` exposes them (as the stick radius today).
6. Optional switch (default **off**): the camera leads toward a pinned ghost by 35 % of the offset, max 3 m, 200 ms ease.

**Tests:** placement unit tests for relative drag, pin/unpin; a browser check that a right-half drag doesn't fire or aim.

---

## BX-6 Take back, sell and undo

As a player, I want to undo a misplaced building and sell old ones, so that a mistake costs nothing and I can rebuild my defence.

**Acceptance criteria**
1. **Server:** C2S `building.sell { id }` (int 1–65535, strict, `this.net.guard`). Shared `sellBuilding(world, playerId, id)` checks in order: unknown player → not build phase → gone → not owner; refunds per F2, removes the building (`version++`, `wallVersion++` if solid), emits `building.sold { buildingId, ownerId, refund, x, y }` (new net event kind). Refusal S2C `building.sell_refused { id, reason }`.
2. **Server bookkeeping:** each building keeps `paid` (price + upgrades) and `paidThisBuild` (reset to 0 at every build start). Server-only: not synced, not in `snapshotWorld`'s client view; in `snapshotWorld` for determinism.
3. **Undo chip ↶** (48 px at (270, 64), or (300, 64) with empty hands) for **5 s** after each placement, with a draining ring; pressing it sells that building (100 % refund). If the placement is still pending, the undo is sent as soon as it's placed.
4. The label reads **"Take back +$40"** for a building placed this build phase and **"Sell +$20"** otherwise (BX-7 shows it).
5. FX: the building lifts and fades in 200 ms, "+$40" floats up; coins sound; 12 ms haptic.

**Fairness / beat the rule:** reviewers try: sell a teammate's building (refused `not_owner`); sell in a wave (refused); upgrade then sell in the same phase (100 % of both); upgrade last phase, sell now (50 % of everything); sell a worn spike trap and rebuy (net = repair cost); spam sell with a crafted id flood (guard); a mine sold while a zombie stands on it in the build phase (no blast: removed in the build phase only).

**Copies (brief 2):** World (`paid`, `paidThisBuild` server-side) → `syncState` removes it → mirror → Predictor (collision follows the removal) → `devThrottle` → `snapshotWorld`.

---

## BX-7 Building action bar

As a player, I want the actions for a building under my right thumb, so that repairing, upgrading and selling are one tap away.

**Acceptance criteria**
1. **Given** a build phase with empty hands, **when** I tap a building (3.7's tap rule and 0.4 m tolerance, unchanged), **then** the bottom-right shows the action bar (buttons 78 × 56, 8 gap, right-aligned at 16, centre bottom 112): **✥ Move** (owner), **Upgrade $Y** (owner, has a next tier: 5.9), **Repair $X** (anyone; "full HP" and dimmed when full), **Take back / Sell +$Z** (owner), **✕**. Info line above: "Spike trap · Yours · HP 93/300".
2. A teammate's building shows only Repair and ✕, with "Only Bo can move, upgrade or sell it".
3. This replaces 3.7's bottom-centre repair panel; `RepairPanel` keeps its logic (pending upgrade, wave-close rules).
4. **Long-press** (450 ms, ≤ 12 px) on my own building picks it up (BX-8); a ring fills from 150 ms.
5. Optional switch (default off): with empty hands, standing with my body edge within 0.8 m of a damaged building for 0.3 s selects it.
6. A tap on a building drawn under a HUD button presses the button (unchanged). Playtest whether the long-press / walk-up routes are enough.

**Tests:** RepairPanel tests extended for the owner/teammate button sets; browser screenshots of both.

---

## BX-8 Move a building

As a player, I want to pick up my building and put it somewhere else for free, so that I can fix a bad spot without losing money.

**Acceptance criteria**
1. **Server:** C2S `building.move { id, gx, gy, rot }` (strict, guard). Shared `moveBuilding(world, playerId, req)` checks: unknown player → not build phase → gone → not owner → the new footprint with the building itself ignored (`footprintBlocked(world, box, exceptId)`, the existing rules otherwise). On success it updates gx/gy/rot and the footprint, `version++` (`wallVersion++` if solid), emits `building.moved { buildingId, gx, gy, rot }`. Refused → nothing changes, `building.move_refused { id, reason }`.
2. **Client:** Move ✥ or a long-press puts it in my hands: pinned at its current spot (carry mode: in front of me), its old spot drawn dashed (it still stands and blocks for everyone until the move is accepted). Place sends the move; ✕ puts it back (sends nothing). The Place label reads "MOVE", the reason line "Move Spike trap · free".
3. Pending move: dashed at the new spot until `building.moved`; refusal shakes it there and the building stays where it was.

**Fairness / beat the rule (F3, F5):** reviewers try: move a teammate's (refused); move during a wave (refused); move a damaged barricade (HP kept); move a worn spike trap (wear kept); move onto its own old footprint shifted 0.5 m (allowed: itself ignored); move into a spawn circle (refused); move a wall to seal a teammate in (same rule as placement: a footprint can't overlap a player).

**Copies (brief 2):** buildings are now movable, so `Building`'s readonly `gx, gy, rot, minX…maxY` become writable through `moveBuilding` only; check every cache that assumed "buildings never move" (BuildingView's sprite transform keyed by `version`; flow field via `wallVersion`; light list (5.10) and heal list rebuilt on `version`).

---

## BX-9 Placement feel and owner marks

As a player, I want placing to feel solid and to see whose buildings are whose, so that building with friends is readable.

**Acceptance criteria**
1. Pick: the ghost scales 0.8 → 1.0 in 120 ms; a soft click.
2. Placed (mine or a teammate's): 8 dust particles for 0.4 s, the building drops 0.15 m → 0 in 120 ms, a "thunk" (wood), "clank" (metal/turret) or "click" (mine/trap); my own: 12 ms haptic. A teammate's at > 12 m is quieter.
3. Refused: 30-40-30 ms haptic + a dull buzz.
4. For 3 s after placing, an L-shaped corner tab in the owner's ring colour (2.9 colours); during a build phase every building shows a 0.18 m owner dot at its min corner. Both hidden during waves.
5. Haptics follow the existing mute setting; every haptic has a visual twin. All effects pooled (brief 12).

---

## BX-10 Teammates' ghosts

As a player, I want to see what my teammates are about to build, so that we don't build on top of each other.

**Acceptance criteria**
1. C2S `building.ghost { type, gx, gy, rot }` (or `type: ""` for none), guarded, sent **only on change and at most 4 Hz**, build phase only. The server relays it to the other players (not stored in the schema, not in the World).
2. Others see it as a dashed outline in the sender's ring colour, 50 % alpha, with "Bo · Auto-turret" above it. Never coloured valid/blocked, never blocks anything (F7).
3. Ghosts vanish at the wave start, when the sender leaves, and after 1 s without an update.
4. Bandwidth: report the measured B/s (expected ≤ 0.4 KB/s for 30 s of build, 0 in waves; brief 11).

**Beat the rule:** reviewers try flooding ghosts (guard drops > 10/s silently), sending a ghost in a wave (dropped), a ghost onto a spawn (cosmetic only).

---

## BX-11 Mouse and keys parity (optional)

As a desktop player, I want the same building flow with mouse and keys.

**Acceptance criteria:** the ghost follows the cursor (absolute) when a mouse moved last; `1`–`7` pick from the build bar; `R` / wheel rotates; left click / `Space` places; right click / `Esc` puts away; `Z` undoes; `M` picks up the selected building. Keys added to `keyMap.ts`.

---

## Notes for correct-course

- **Retires:** 3.4's ⟳ ✓ ✕ layout and the frozen survivor; 3.3's buildings section of the shop; 3.7's bottom-centre repair panel. Their server rules all stay.
- **Docs to touch when it's adopted:** the GDD's building section (sell/move are new mechanics), the UX doc's HUD section, `epics.md` (new stories), and `sprint-status.yaml`. This branch doesn't touch any of them.
- **Open designer decisions** (ux-spec §15): carry-only vs carry + drag, hold-to-paint walls, walk-up select, camera lead, the 50 % sell refund, teammate ghosts now or later.
