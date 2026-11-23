# Building UX roundtable: party notes

**Date:** 2026-11-23 · **Format:** BMAD party mode (session) · **Branch:** `claude/idea-building-ux` (ideas only, no game code touched)

**At the table**

| | Who | Seat |
| --- | --- | --- |
| 🎲 | **Samus Shepard** | Game designer: feel, "a series of interesting decisions" |
| 🎨 | **Sally** | UX designer: flows, thumbs, feedback |
| 🏛️ | **Cloud Dragonborn** | Game architect: authority, network, sim copies |
| 🕹️ | **Link Freeman** | Game developer: what it costs in `placement.ts` / `HudScene.ts` |
| 👍 | **Kev** (new face) | Plays on a 6.5" Android in landscape (≈ 800 × 360 CSS px), thumbs ≈ 18 mm wide (≈ 65 CSS px). Plays on the bus, one-handed sometimes. |

**What we read first (today's flow, from the code):**

- Shop (`ShopScreen.tsx`, `shopStore.ts`) → tap a building → `uiStore.request("startPlacement", id)` → shop closes.
- `Placement.start` puts the ghost's **centre 2 m ahead** of the survivor (`PREVIEW_AHEAD_M`), centred on the finger, min corner rounded to the **0.5 m lattice** (`cornerForCentre`).
- **Both sticks are off** while placing (`neutralizeInput`, `hudPointerReset`): the survivor freezes. Any touch that isn't a button moves the ghost to the finger (absolute position, under the thumb).
- ⟳ ✓ ✕ are **64 px squares, 20 px apart, bottom centre**. ✓ sends `building.place {type, gx, gy, rot}` and **always ends placement mode**: one building per trip to the shop.
- Green/red = the shared `placementError` run on the client's World. The hint line says *"Can't build here"* for **every** spot problem (off map, a spawn's 2 m clearance, a car, a building, a player, a zombie).
- Repair/upgrade (3.7, 5.9): a short tap (≤ 300 ms, ≤ 12 px) on a building (+0.4 m tolerance) opens a bottom panel with Repair $X / Upgrade $Y / ✕. There is no **sell, undo or move**.
- Limits: 6 buildings per player, $40 barricade (2 × 0.5 m), $250 turret (1 × 1), $80 spike trap (2 × 2), $60 mine (0.5 × 0.5), and next the floodlight and med station (1 × 1, 5.10) and a bear trap (5.14). The build phase lasts **30 s**.
- The camera shows 24 m across, so on Kev's phone that's ≈ 33 px/m. The prototypes use 48 px/m, with a toggle for the real camera.

(We couldn't open hordes.sevend.io from here because it sits behind a Cloudflare Access login, so this is all from the code and the story files.)

---

## Round 1: what hurts

👍 **Kev:** OK so, the turret. I buy it, the shop closes, and I'm *stuck*. My guy's a statue. The green box shows up two metres ahead of me, and I wanted it by the bus, so I tap by the bus and my thumb is literally on top of the box. Is it green? Is it red? No idea, my thumb's covering it. I lift, it's red, and the text just says "can't build here". Why though?

🎨 **Sally:** That's the whole scene in one breath. Three failures. **One:** the mode is a freeze-frame, so you lose the most natural tool you have, which is walking over to the spot. **Two:** absolute positioning puts the ghost under the thumb, the worst place on the screen. **Three:** the feedback says *that* it failed, never *why*.

🎲 **Samus:** And a fourth that's mine: **one building per shop trip.** The build phase is 30 seconds. A four-barricade wall costs four shop opens, four freezes, four ✓s. The interesting decision should be "where does the wall go?" Right now it's "can I get through the menus before the timer runs out?"

🕹️ **Link Freeman:** For the record, the freeze is deliberate: `updatePlacement` calls `neutralizeInput` because every touch that isn't a button goes to the ghost. Turn the sticks back on and the left thumb would move the ghost *and* the survivor. That's the knot we have to untie, not a bug.

🏛️ **Cloud Dragonborn:** And before anyone gets excited, the part that's *good* today: the client runs the exact shared `placementError`, the server re-runs it, and refusals come back as codes. Whatever we design keeps that. The client colours the ghost and the server decides. I'm not moving on that.

👍 **Kev:** Fine, I don't care who decides as long as I'm not standing there like a lamp post.

---

## Round 2: where does the ghost live?

🎨 **Sally:** Four candidates on the board:
**A. Carry:** the ghost floats a fixed distance in front of you and you *walk* it into place.
**B. Drag:** the ghost stays where you put it and the right thumb drags it like a trackpad (relative, never under the finger).
**C. Hybrid:** you carry it by default, and touching it with the right thumb pins it and nudges it.
**D. Today:** freeze and tap.

🎲 **Samus:** A. Carry, all day. It's how you'd build a barricade in real life: you hold a plank, you face the street, you drop it. And it **auto-rotates**: facing up the street, the wall goes across the street. Ninety percent of barricades are "across the way I'm looking". Rotate becomes the exception.

🕹️ **Link Freeman:** Carry is cheap, too. `Placement.start` already takes facing. Every frame: centre = survivor + facing × offset, `cornerForCentre`, done. Offset per type, so the ghost's near edge sits **1.0 m beyond your body**: centre distance = 0.4 m body radius + 1.0 m + half the footprint along the facing. That's 1.65 m for a barricade across your path, 1.9 m for a turret, 2.4 m for a spike trap.

👍 **Kev:** Wait, why not closer? I want to put it right on the line.

🏛️ **Cloud Dragonborn:** Because your own body blocks it. `footprintBlocked` checks every non-out player, you included. If the ghost touches your circle it goes red with you as the reason. 1.0 m of gap also means the box isn't under your survivor's sprite, so you can see it.

🎨 **Sally:** I'll push back on pure carry, though. Precision. The lattice is 0.5 m and walking moves you 4.5 m/s, that's nine lattice steps a second. Kev, try lining a barricade up flush against a car just by walking.

👍 **Kev:** …yeah, I'd overshoot, back up, overshoot. I do that with doors in every game.

🎲 **Samus:** Then tap the stick gently, it's a floating stick, small push = slow walk.

👍 **Kev:** Samus, I play on a bus. There is no "gently".

*(laughter; Samus concedes the point with a shrug)*

🎨 **Sally:** So: **C, Hybrid.** Carry gets you *near*: big, cheap, natural. The right thumb, which does nothing during a build phase because there's nobody to shoot, gets the *last metre*. Any drag on the right half of the screen that doesn't start on a button **pins** the ghost and moves it **relatively**: finger moves 48 px, ghost moves 1 m (gain 1.0 at 48 px/m). The ghost never goes under your thumb because your thumb isn't anywhere near it.

🕹️ **Link Freeman:** That unties my knot. Left half = move stick, always. Right half in a build phase = builder's thumb. During a wave the right half goes back to being the aim stick. No touch ever means two things.

🏛️ **Cloud Dragonborn:** And none of this reaches the server. It still gets `{type, gx, gy, rot}`.

🎲 **Samus:** I'll take hybrid *if* carry is the default and it auto-rotates. If the first thing a new player sees is a trackpad, we've lost.

🎨 **Sally:** Agreed: carry first, drag is the precision tool. And while the ghost is pinned, walking doesn't yank it back. Tap the item chip ("↩ carry") to pick it back up, or it comes back by itself if it leaves the screen.

👍 **Kev:** And if I let go of the drag, does it stay?

🎨 **Sally:** It stays. Pinned means pinned.

---

## Round 3: confirm, rotate, cancel. Where do thumbs go?

🎨 **Sally:** Today ⟳ ✓ ✕ are bottom **centre**. That's no-man's-land between the thumbs. In a build phase the right thumb is the free one, so the **hand cluster** goes where the right thumb already rests, where the fire stick usually spawns:

- **Place**: 76 px circle, centre 92 px from the right and 92 px from the bottom of the safe area.
- **Rotate ⟳**: 60 px, centre 190 px from the right, 80 px from the bottom (one thumb roll to the left).
- **Put away ✕**: 48 px, centre 80 px from the right, 196 px from the bottom (a stretch up, on purpose, because you rarely need it).
- **Undo ↶**: 48 px chip, for 5 s after each placement, 270 px from the right, 64 px from the bottom.

👍 **Kev:** 76 is good. I miss 64 px buttons when I'm walking. And keep stuff off the very right edge, my case's lip and Android's back-swipe live there.

🕹️ **Link Freeman:** Everything ≥ 16 px inside the safe-area inset, gaps ≥ 12 px. The 44 px minimum from `sizes.ts` stays a floor: Place 76, Rotate 60, others 48–56.

🎲 **Samus:** Do we need ✓ at all? Today ✓ is "are you sure?" I want **Place to just place**. No confirm step. If you got it wrong, undo.

🏛️ **Cloud Dragonborn:** Then undo has to be real money-wise, or people won't trust Place. A **take-back** in the same build phase refunds 100 %. That's a server message. I'm fine adding one: `building.sell {id}`, guarded like the others.

🎨 **Sally:** And that kills the ✓ ✕ pair completely. You place with one tap, undo with another, and ✕ just means "put it away, I'm done holding it".

👍 **Kev:** What about rotate? I'll forget the button exists.

🎲 **Samus:** That's why carry auto-rotates. The moment you press ⟳ once, auto-rotate is **off** for that held item (a small 🔒 on the button) so the game doesn't fight you.

🕹️ **Link Freeman:** Auto-rotate needs hysteresis or the barricade flips every frame when you face 45°. Switch only when facing passes 45° ± 10°.

🏛️ **Cloud Dragonborn:** Two-sided art: the B6 palisade has struts on one side (rot 0 vs 2 differ). Auto-rotate puts the **struts on the builder's side**, so the flat face points where you're looking (at the zombies).

---

## Round 4: the shop is the wrong door

🎲 **Samus:** Buildings shouldn't live in the shop at all. The shop is about *decisions* (5.13's cards: weapons, gear). Buildings are *tools*: you need them under your thumb, 7 of them once 5.10 and 5.14 land.

🎨 **Sally:** **Build bar.** In a build phase with empty hands, the right-thumb area shows a **4 × 2 grid of 56 px tiles** (8 px gaps, 16 px inset from the bottom-right safe area): barricade, turret, spike trap, mine, bear trap, med station, floodlight (when `inShop` allows) and the 8th tile is **🛒 Shop** for everything else. Tap a tile and the ghost is in your hands, already carried. Tap the same tile again: put away. Tap another tile while holding: swap.

👍 **Kev:** Show me the price on the tile and grey it out if I'm broke. And how many I've got left of my 6.

🕹️ **Link Freeman:** Tile: icon, price underneath; unaffordable = 40 % opacity + red price; at the cap every tile shows "6/6" and a pressed tile says *"Building limit reached (6)"*. That's the existing `placeRefusalText`, just shown before you pick, not after.

🏛️ **Cloud Dragonborn:** 5.13 changes the shop into cards. Does it touch buildings?

🕹️ **Link Freeman:** 5.13's decisions are weapons and gear cards; buildings stay a fixed list. The bar is that fixed list. The shop's buildings section goes away when the bar ships. One entry point, not two.

🎲 **Samus:** And the cluster swaps in place: build bar when your hands are empty, hand cluster when you're holding something, action bar when you've selected a building. **The right thumb never has to look somewhere new.**

---

## Round 5: "why is it red?"

👍 **Kev:** This is my real one. Red with no reason is the worst thing in the game.

🎨 **Sally:** Three layers. **Colour + pattern:** valid = green fill 45 % + solid outline; blocked = red fill + 45° hatching + ✕ glyph in the middle. Colour-blind safe and readable under a thumb's edge. **The reason, in words, right above the hand cluster**, not bottom centre. **And the culprit lit up in the world:** the car's box gets a red outline, the spawn's 2 m no-build circle appears, the teammate who's standing there gets a red ring.

🕹️ **Link Freeman:** The server error stays one code, `blocked`. The *why* is a client-only function next to `footprintBlocked`, returning the first reason in this order: off the map → near a spawn → wall/car/cover → another building → you → a teammate → a zombie. No wire change. The texts:

| Reason | Text |
| --- | --- |
| off map | "Off the street" |
| spawn | "Too close to a zombie spawn (2 m)" |
| map solid | "Blocked by the car" / "the bus" / "a wall" (from the map object's name) |
| building | "Overlaps a building" |
| me | "You're standing there" |
| teammate | "Bo is standing there" |
| zombie | "A zombie is in the way" |
| money | "Need $250 (you have $180)" |
| limit | "Building limit reached (6)" |

🎲 **Samus:** And while you're holding *anything*, draw **every spawn's no-build circle** in view, faint red. People learn the map's no-go zones in one build phase instead of by trial and error.

🏛️ **Cloud Dragonborn:** And range rings: turret 8 m, mine trigger 1 m / blast 2.5 m (already drawn), med station 2 m, floodlight 4 m. Those are real numbers from balance, so the preview tells the truth.

👍 **Kev:** Buzz my phone when it fails.

🕹️ **Link Freeman:** `navigator.vibrate`: 12 ms on a place, 30-40-30 on a refusal. Android only (iOS Safari ignores it), behind the existing settings mute.

---

## Round 6: lag, teammates, and what stays on the server

🏛️ **Cloud Dragonborn:** ?lag=150 means a round trip of 150 ms plus up to a tick. With Place = instant send and the ghost carrying on, the client must not double-spend. So: a **pending** building, drawn as a dashed outline in place with a spinner tick, counts as occupied for the next ghost's check and its price is taken off the *shown* wallet. When `building.placed` arrives it becomes real; on `building.refused` it shakes 3 × (150 ms), fades, and the reason toasts.

🕹️ **Link Freeman:** And a cap: never more than `maxPerPlayer − owned − pending` in flight. The guard bucket is 10/s, and we're nowhere near it.

🎲 **Samus:** Teammates. Today a building just pops in. I want a **thunk**: a dust puff, and for 3 s a corner tab in the owner's ring colour (the 2.9 player-ring colours). During a build phase every building keeps a small owner pip so I know what's mine to move or sell.

🎨 **Sally:** And teammates' *ghosts*: Bo carrying a turret should show as a faint outline in Bo's colour with "Bo" on it, so we don't both build in the same spot.

🏛️ **Cloud Dragonborn:** That's the one that costs bandwidth: `building.ghost {type, gx, gy, rot}` (or `{none}`) relayed at **≤ 4 Hz, only when it changes, build phase only**. About 8 bytes each, worst case 4 players × 4 Hz × 8 B × 3 receivers ≈ 400 B/s for 30 s. Cosmetic: it never blocks anything. I'd ship it **last**, as its own story.

👍 **Kev:** Can my mate move my turret?

🏛️ **Cloud Dragonborn:** No. **Move and sell: owner only.** **Repair: anyone** (unchanged from 3.7). **Upgrade: owner only** (unchanged from 5.9). Otherwise someone sells your $250 turret for $125 as a joke.

🎲 **Samus:** Fairness, then, written as rules before anyone builds (the Epic 5 brief, line 3):
1. **Take-back:** a building placed *this* build phase refunds **100 %** of what you paid for it this phase (price + upgrades).
2. **Sell** anything older: **50 %** of what was paid, rounded down. That makes sell + rebuild cost exactly what repair costs (repair = 50 % of the current tier's price), so there's no loop to farm.
3. **Move:** free, build phase only, keeps HP, tier and owner, one atomic server step. If the new spot is refused, it stays where it was. Moving never repairs.
4. Nothing is placeable, movable or sellable outside the build phase.

🏛️ **Cloud Dragonborn:** And `building.move {id, gx, gy, rot}` validates the new footprint with the building itself ignored (`footprintBlocked(world, box, exceptId)`), `wallVersion++` only if it's a wall. Same copies list as 3.4.

🕹️ **Link Freeman:** For rule 1 we need `paid` and `paidThisBuild` on the building. That's server-side, so it isn't synced, and both reset at the build start.

---

## Round 7: move, sell, repair by touching a building

🎨 **Sally:** Today: tap → bottom-centre panel. Proposal: tap → the **right-thumb cluster becomes the action bar** for that building: **Move ✥ · Upgrade $50 · Repair $20 · Sell +$20 (or "Take back +$40") · ✕**. The selected building gets the white outline (exists), plus its name, owner and HP on one line above the bar.

👍 **Kev:** Tap a 0.5 m barricade at 33 px/m. That's 16 px. I won't hit it.

🕹️ **Link Freeman:** 3.7's tolerance already grows it by 0.4 m each side, so 1.3 m ≈ 43 px. And the nearest centre wins. Fine.

🎲 **Samus:** **Long-press your own building (450 ms) = pick it up.** It turns into the ghost in your hands, in drag mode (pinned where it was), the original goes dashed. Place = move. ✕ = put it back where it was. That's the most direct thing in the whole design.

🎨 **Sally:** And with nothing held, walking up to a damaged building (body edge within 0.8 m for 0.3 s) could select it automatically. I'm half on that one.

👍 **Kev:** I'd love it. Walk up, big Repair button under my thumb.

🏛️ **Cloud Dragonborn:** It's a client-only nicety. Fine as a stretch, behind the tap selection.

🎲 **Samus:** Stretch. Don't let it block the main stories.

---

## Round 8: several in a row

🎲 **Samus:** The wall. After a Place, the **same item stays in your hands** if you can still afford it and you're under the cap. For a barricade, the next ghost **jumps end-to-end** to the next slot along its long side (on the side you last nudged, or the right of your facing by default), pinned. Place, place, place = a 6 m wall in three taps.

🕹️ **Link Freeman:** For a 1 × 1 or 2 × 2 thing: jump one footprint sideways. A mine: jump 1 m (trigger rings shouldn't overlap much). If the jump spot is blocked, the ghost goes back to carry.

👍 **Kev:** Can I hold Place and walk to paint a wall?

🏛️ **Cloud Dragonborn:** Hold-to-paint means placing every time the ghost reaches a fresh valid slot. Rate-limited to 4/s it's safe. But it's the easiest way to spend $240 by accident.

🎨 **Sally:** Not for v1. Chain-tap first. Paint is a playtest question.

---

## Where the room landed

| # | Decision | Detail | Who argued it |
| --- | --- | --- | --- |
| 1 | **Hybrid ghost** (carry + right-thumb drag) | Carry at 1.0 m beyond your body, auto-rotated across your facing; right-half drag pins and nudges (relative, gain 1.0) | Sally, Kev (Samus: carry must stay the default) |
| 2 | **Sticks stay on** while holding | Left = move always; right half = builder's thumb in the build phase | Link |
| 3 | **Place places** (no ✓ step) | Undo chip for 5 s; take-back refunds 100 % in the same build phase | Samus, Cloud |
| 4 | **Right-thumb cluster** with three states | Build bar (4 × 2 tiles) / hand cluster (Place 76, Rotate 60, ✕ 48, Undo 48) / action bar | Sally |
| 5 | **Build bar replaces the shop for buildings** | Price, affordability, cap on each tile; 8th tile opens the shop | Samus |
| 6 | **Why-red reasons + culprit highlight** | Client-only reason function; spawn circles while holding; range rings; hatch for blocked | Kev, Sally, Link |
| 7 | **Chain placing** | Item stays in hand, next ghost end-to-end | Samus |
| 8 | **Pending under lag** | Dashed pending, predicted wallet, shake on refusal | Cloud |
| 9 | **Move/sell owner-only, repair anyone** | Atomic `building.move`, `building.sell`; 100 % / 50 % rule | Cloud, Samus |
| 10 | **Long-press to pick up** your building | 450 ms, ✕ puts it back | Samus |
| 11 | **Teammate awareness** | Placement thunk + owner pips now; teammate ghosts (≤ 4 Hz relay) last | Samus, Cloud |

**Still open (the room disagrees, so we're leaving it to the designer and the prototype):**
- **Hold-to-paint walls**: Kev wants it, Sally says playtest first, Cloud warns about accidental spending.
- **Proximity auto-select**: Kev loves it, Sally is half on it, Samus says stretch.
- **Pure carry vs hybrid**: Samus still thinks carry alone might be enough for most players. The prototype has both modes so you can feel the difference on your phone.
- **Camera lead toward a pinned ghost** (35 % of the offset, max 3 m): Link likes it, Sally worries it'll feel floaty. It's a switch in the prototype.
