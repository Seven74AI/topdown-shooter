---
baseline_commit: a94f15e97b9c66f55c15d77a1969dd22df10f6d7
---

# Story 5.21: Building action bar and move (5.21 merged with 5.22)

Status: review

(Building UX rework **BX-7 + BX-8**, merged by the designer on 2026-11-24: one story, one review. Design: `docs/ideas/building-ux/ux-spec.md` §3 (the right-thumb cluster's third state), §4 (action bar **78 × 56**, 8 gap, right-aligned at 16, centre bottom **112**; alignment Q4), §5 (tap 300 ms / 12 px, **long-press 450 ms / 12 px, ring from 150 ms**, tap tolerance 0.4 m), §8 (select, pick up, move, repair, upgrade, take back / sell + fairness rules F1–F9), §9 (`M` picks up the selected building: Story 5.23's key), §11 (`building.moved`), §12 (Bo fixes a mistake), §13 (a building under Ready), §15 (tap-only menu); `draft-stories.md` › BX-7, BX-8; `epics.md` › Stories 5.21 and 5.22; prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR. Builds on 3.7 (tap select, `RepairPanel`), 5.9 (upgrade ladder, floor buildings), 5.10 (med station, floodlight), 5.12 (consumable / swap row above the bar), 5.14 (bear trap), 5.15–5.19 (carry, build bar, reason line, chain + pending, drag/pin/chip), 5.20 (sell, `sellLabel`, `paid` / `paidThisBuild` / `usedThisBuild`, `not_alive`). **This story changes the server:** a new C2S message `building.move`, a new S2C refusal, a new net event kind, and buildings become movable (shared `moveBuilding`).)

Main-session brief carried in (2026-11-24): one story, one review; the server's `building.move` uses the shared validation (`footprintBlocked` with the moved building ignored); small-phone layout rule (designer Q4): action-bar buttons 78 × 56 at centre bottom 112, every control checked at 568 × 320 and 800 × 360 with ≥ 12 px gaps; reuse the carry / pending flow for a move; Story 5.23 (branch `story-5-23`, in parallel) owns the `M` key: expose a clean "pick up the selected building" entry point; resolve 5.20's open "Ready vs a building tap at 568 × 320" question.

## Story

As a player,
I want the actions for a building under my right thumb, and to pick my building up and put it somewhere else for free,
so that repairing, upgrading, selling and fixing a bad spot are one tap away and a mistake costs nothing.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full:
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Cover (updated 2026-11-23, PR #5 lob-over + PR #6 barricades stop bullets): bullets stop at map cover (cars, bus, buildings, pumps, parking wall, dumpster) and at every barricade tier. Lobbed rounds (launcher, hand grenade, molotov) fly over everything except real buildings (`building: true`), which stop them at the face. Spit, flames, blasts, acid and gas: cars, the bus and buildings stop or shield them. Sandbags, police barriers, turrets and floor buildings (traps, mines) stop bodies only. Melee is stopped by barricades and shot-blocking map cover. Server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the latest recorded ?stress=150 baseline in docs/perf/ is the floor, not to be lost (4.10 is deferred).
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: earnings stay as built (4.10 deferred); the Epic 5 balance pass after round E settles them; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> 20. (added 2026-11-23, Story 4.13) Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss.
> ```

## Fairness rules first (brief line 3; ux-spec §8)

- **F1 The server decides.** Every move (and repair / upgrade / sell) is validated by shared code on the server's World (solo: the same function). The client's colours, reasons, dashed boxes and button states are predictions.
- **F3 Owner only.** Only the builder moves, upgrades or sells a building; anyone repairs. A teammate's building shows Repair only (Move / Upgrade / Sell absent, not greyed).
- **F4 Build phase only.** A move during a wave (or lobby / results) is refused `not_build_phase`; the client never sends one outside a build phase.
- **F5 A move changes the spot and nothing else.** Same id, type, tier, owner (kill credit), HP / max HP (never repairs), wear, `paid` / `paidThisBuild` / `usedThisBuild` (5.20's money rules: a building placed this phase and moved can still be taken back for 100 %; one that already healed someone can't), fire burn clock (`fireTicks`: moving out of a car fire and back never dodges a pulse, brief 6), turret cooldown and aim, a bear trap's jaws (a closed trap stays closed).
- **F6 Same placement rules for the new spot.** `footprintBlocked(world, box, exceptId)`: off the map, a spawn's 2 m clearance (every stage), map solids / cover, another building, any standing or downed player (me too), a zombie — with the moved building itself ignored (so a 0.5 m shuffle onto its own old footprint is allowed). Mines and traps move by the same rules.
- **F8 The cap and the wallet don't change.** A move is free and is not a placement: the owned count stays, nothing is charged or refunded.
- **F9 Standing only.** A downed or out player's move is refused `not_alive`.
- **Atomic.** A refused move changes nothing (the building stays where it was, for everyone); until the server accepts, the building still stands and blocks at its old spot.

## Acceptance Criteria

### Action bar (5.21)

1. **Select.** In a build phase with empty hands (no shop / menu, standing), a **tap** (3.7: ≤ 300 ms, ≤ 12 px) on a building (footprint + 0.4 m, nearest centre wins) shows the **action bar** in the bottom-right: one row of **78 × 56** buttons, **8 px** apart, right-aligned **16 px** inside the right safe-area inset, centre **112 px** above the bottom safe-area inset. Left → right: **✥ Move** (owner), **Upgrade $Y** (owner, has a next tier: 5.9), **Repair $X** (anyone; reads **"full HP"** and is dimmed when full), **Take back / Sell +$Z** (owner; 5.20's `sellLabel`), **✕**. Absent buttons close up to the right. An **info line** above, right-aligned at 16 px: "Spike trap · Yours · HP 93/300" (a teammate's: "Auto-turret · Bo's · HP 210/300"); a second line for a pending upgrade's next tier ("→ Reinforced barricade · 350 HP") and a red reason line for the most relevant refusal (money, "Moving…").
2. **Teammate's building:** only Repair and ✕, and the line "Only Bo can move, upgrade or sell it".
3. The bar **replaces 3.7's bottom-centre repair panel** (Repair / ✕ / Upgrade / Sell rows above Ready are gone). `RepairPanel` keeps its logic (pending upgrade "Upgrading…", the wave-number close, the closes when phase / building / standing go) and gains the Move fields.
4. While the bar is up, the **build bar, Ready, Story 5.12's consumable / swap row and the undo chip ↶ are hidden** (D3: with the bar at centre bottom 112, Ready's top edge would be only 8 px below it at 800 × 360 and 568 × 320). ✕ closes the bar and brings them back. The bar is hidden while I'm downed / out, holding, in the shop or menu.
5. **Layout check:** a pure `layoutActionBar` is tested at **568 × 320, 800 × 360 and 1024 × 768** (with and without safe-area insets): every button ≥ 48 px, ≥ 12 px from ☰, the info / reason lines, the screen edges (16 px inset) and the survivor's centre clearance; buttons inside the bar are 8 px apart (the designer's bar size; the ≥ 12 px rule applies between separate controls).
6. **Tap only** (designer): the bar opens only by tapping a building; no walk-up select.
7. **Ready vs a building tap** (AC 6 of 5.21, 5.20's open question): a touch that lands on **Ready** *and* within a building's tap area (any building) does **not** press Ready; it is watched as a tap / long-press on that building (no stick spawns). Every other HUD button (build-bar tiles, ☰, ↶, 5.12's row, the hand cluster) keeps priority (D8).

### Move (5.22)

8. **Server.** C2S **`building.move { id, gx, gy, rot }`** (`buildingMoveSchema`: id int 1–65535, gx / gy int 0–255, rot int 0–3, `.strict()`) registered with **`this.net.guard`** (the shared ~10 non-input msgs/s bucket). Refusal to the sender only: S2C **`building.move_refused { id, reason: MoveError }`**; success logged `building_moved` (info), refusals at debug.
9. **Shared rule** `moveError(world, playerId, req)` / `moveBuilding(world, playerId, req)` in `packages/shared/src/buildings/move.ts`, checks **in this order**: `unknown_player` → `not_alive` → `not_build_phase` → `gone` → `not_owner` → `blocked` (bad rotation / non-integer corner / the new footprint fails `footprintBlocked(world, box, id)`). On success (F5): `gx`, `gy`, `rot` and the cached footprint change (`relocateBuilding`), `version++`, `wallVersion++` only if `solid`, a bear trap's re-arm clock resets (a holding trap — impossible in a build phase — lets go and is shut), and **`building.moved { buildingId, buildingType, ownerId, gx, gy, rot }`** is emitted: a **new net event kind `BUILDING_MOVED = 43`**, global (money / HUD class), with a round-trip test. A move to the spot it already has is accepted and changes nothing (no version bump, no event). On any error nothing changes.
10. **`footprintBlocked(world, box, exceptId = 0)`** gains the building to ignore; `blockReason`'s equivalence fuzz (5.17) covers `exceptId`.
11. **Pick up.** ✥ Move on the bar, or a **long-press** (≥ **450 ms**, ≤ 12 px; `controls.build.longPressMs`) on **my own** building, puts it in my hands: **pinned at its current spot**, rotation as it stands; "↩ carry" brings it in front of me (5.15 carry), drags nudge it (5.19). A ring fills around the finger from **150 ms** (`controls.build.longPressRingMs`) to 450 ms; on a teammate's building no ring and nothing happens. Its **old spot is drawn dashed** while I hold it (it still stands and blocks for everyone until the move is accepted).
12. **The hand while moving.** Place reads **"MOVE"**, the reason line "Move Spike trap · free" (white when valid; red with the 5.17 reason when blocked — the building itself never blocks its own move), the chip "Spike trap · moving". **Place sends `building.move`** and empties the hand (no chain, no undo chip); placing it where it already stands just empties the hand (nothing sent). **✕ puts it back** (nothing sent). The hand also empties on today's rules (phase, wave number, menu, downed / out, run end) and when the building is gone or no longer mine.
13. **Pending move.** After Place the building stays drawn where it is and a **dashed box with the spinner** (5.18's look) shows at the new spot until the World (online: the state) shows the building there. On `building.move_refused` (or no answer within `controls.build.pendingTimeoutMs` = 2 s) the box shakes and fades (5.18's refusal look), the reason toasts and the building stays. One move in flight per building; the bar's Move reads "Moving…" (dimmed) meanwhile.
14. **Entry point for Story 5.23's `M` key:** `GameScene.pickUpSelected(): boolean` picks up the building selected in the bar (the same path as ✥ Move; false when nothing is selected, it isn't mine, or a move is pending). 5.23 binds `M` to it (no key added here).
15. **Copies (brief line 2).** World (`gx`, `gy`, `rot`, footprint writable through `relocateBuilding` only) → schema: no new field (`gx`/`gy`/`rot` exist) → `syncState` assigns them when they change on a version change → stateView key lists: unchanged → mirror (`mirrorBuildings` relocates when they differ) → Predictor (same mirror: collision follows) → `devThrottle` delays `building.move` like every non-input C2S (no code) → `snapshotWorld` copies the building (fields unchanged). Caches that assumed "buildings never move": BuildingView / TurretView / MineView / MedStationView / BuildingSelectView redraw on `version`; the flow field on `wallVersion`; the light list (`updateLightState`) on `version`; heal and trap checks read the live footprint each tick.
16. **Tests:** `move.test.ts` (order of checks, every refusal, F5 kept fields incl. `paid`/`paidThisBuild`/`usedThisBuild`/`fireTicks`/HP/tier/owner/trap state, shift 0.5 m onto its own footprint, spawn clearance, a player in the way, wall vs floor `wallVersion`, the same spot = no change, event); `footprintBlocked`/`blockReason` fuzz with `exceptId`; `netEvents` round trip; `messages` schema; `RunRoom.move.test.ts` (round trip: move → schema gx/gy; teammate → `not_owner`; wave → `not_build_phase`; blocked; malformed dropped); `mirrorBuildings` relocation; `NetSimHost` move send + refusal; `repairPanel` owner / teammate button sets and labels; `actionBar` layout at three sizes; `longPress` detector; `pendingMove` model; `placement` move mode; `readyYield`. Mutation per new test (brief 9). Netsim at `?lag=150&jitter=20`: move spam, move at the build → wave edge. Browser screenshots in `docs/art/5-21/` at 800 × 360 and 568 × 320.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | Move a teammate's building (crafted `building.move`) | `not_owner`, nothing changes |
| B2 | Move during a wave (e.g. to dodge a zombie hitting it) | `not_build_phase`; no move in waves at all |
| B3 | Move a barricade onto a zombie spawn's 2 m circle | `blocked` (every stage's spawns, as placement) |
| B4 | Move a wall onto a teammate (seal them in) / onto myself | `blocked` (a footprint can't overlap a player) |
| B5 | Move a damaged barricade / a worn spike trap to "reset" it | HP and wear kept (F5); repair still costs the repair price |
| B6 | Move a building placed this phase, then take it back | still 100 % (`paidThisBuild` kept); a med station that healed: 50 % (`usedThisBuild` kept) |
| B7 | Move a closed (sprung) bear trap to re-arm it | stays closed (`trapState` kept); re-arming still needs a player on it 1 s |
| B8 | Move a mine / bear trap in a build phase with a zombie on it | no zombies are alive in a build; the rule is only the footprint check (zombie in the way → `blocked`) |
| B9 | Move a building in and out of a car fire to dodge its burn pulse | the burn clock (`fireTicks`) is kept, so time in fire still adds up (brief 6) |
| B10 | Move spam under `?lag=150` (crafted flood) | the guard drops > ~10/s silently; each accepted move is a real spot change; no money changes ever |
| B11 | Move at the build → wave edge under lag | accepted in the build or refused `not_build_phase`; never applied in a wave |
| B12 | Move while downed / out | `not_alive` |
| B13 | Move a building 0.5 m so it overlaps its own old footprint | allowed (itself ignored) |
| B14 | Move it onto another of my buildings / a pending box of mine | `blocked` (server) / predicted blocked (client) |
| B15 | Move to beat the cap (move = new building?) | the count never changes |
| B16 | Move off the map / onto a wire index > 255 | `blocked` by the schema (0–255) or the map edge |

## Tasks / Subtasks

- [x] **T1 Numbers**: `controls.build.longPressMs` (450), `controls.build.longPressRingMs` (150), zod defaults; `balance.test.ts`.
- [x] **T2 Shared move** (`buildings/move.ts`): `MoveError`, `MOVE_ERRORS`, `MoveRequest`, `moveError`, `moveBuilding`; `relocateBuilding` + writable `gx`/`gy`/`rot`/footprint in `buildings.ts`; `footprintBlocked(…, exceptId)`; `building.moved` SimEvent + net kind 43; exports; tests (+ fuzz with `exceptId`).
- [x] **T3 Server**: `buildingMoveSchema`, `C2S.BUILDING_MOVE`, `S2C.BUILDING_MOVE_REFUSED`, `RunController.moveBuilding`, `RunRoom.onMoveBuilding` via `net.guard`; `syncState` assigns gx/gy/rot; `RunRoom.move.test.ts`.
- [x] **T4 Client host + mirror**: `mirrorBuildings` relocates; `SimHost.moveBuilding/takeMoveRefusal`; LocalSimHost, NetSimHost, `RunInbox.onMoveRefused` + `parseMoveRefused`; tests.
- [x] **T5 Models** (Phaser-free): `Placement.startMove` + move-mode `check` / `confirm`; `stepPlacement` routes a move Place to `sendMove`; `pendingMove.ts`; `longPress.ts`; `readyYield`; `RepairPanel` move fields + teammate line + "full HP"; `actionBar.ts › layoutActionBar`; tests.
- [x] **T6 HUD + scene**: the action bar replaces the repair panel's buttons; Ready / 5.12 row / ↶ hidden while it is up; long-press ring; MOVE label; GameScene wiring (`pickUpSelected`, pending move frame, refusals, toasts); MoveView (old spot dashed + pending box).
- [x] **T7 Browser + netsim checks** (own ports), screenshots `docs/art/5-21/`.
- [x] **T8 Gate + mutations + record.**

## Dev Notes

### Decisions (taken here, recommended values)

- **D1 One shared rule** `moveBuilding` in `buildings/move.ts` (server, solo, and the client's hand on its mirror World), check order as AC 9, `blocked` for every spot problem (the 5.17 `blockReason` gives the player the cause). The refusal names stay few: the client explains.
- **D2 What a move keeps / resets** (F5): keeps everything but `gx`, `gy`, `rot` and the footprint. Resets only a bear trap's **re-arm clock** (`rearmTicks`, `rearmPlayer`: whoever stood on the old spot is not on the new one). A trap holding a zombie (impossible in a build phase: traps never catch then and all re-arm at build start) lets it go and is shut, like `removeBuilding`'s release. `fireTicks` is **kept** (brief 6: no dodging a burn pulse by moving).
- **D3 Ready, 5.12's row and ↶ hide while the bar is up.** The designer kept 78 × 56 at centre bottom 112: its bottom edge is 84 px up, Ready's top 76 px (bottom 24 + 52): an 8 px gap, below the 12 px rule, and at 568 × 320 the 422 px bar leaves no room beside Ready. The bar is the right-thumb cluster's third state (ux-spec §3) like the hand, which also hides Ready. ✕ (or a tap on empty ground) closes it.
- **D4 Labels on two lines** at 78 px: "✥\nMove", "Upgrade\n$50", "Repair\n$20" / "Repair\nfull HP", "Take back\n+$40" / "Sell\n+$20", "✕". The 5.20 `sellLabel` text is reused (split at the space before "+$").
- **D5 Net event `BUILDING_MOVED = 43`**: `[43, id, ownerSlot, gx, gy, rot, typeIdx]` (42 = 5.20's sold; renumber at merge if 5.23 takes 43, never reuse). Global (as placed / sold).
- **D6 Pending move** (`pendingMove.ts`, Phaser-free): at most one per building, tracked by id; done when the World shows the building at the target (server truth online, the same frame solo); refused by id (`building.move_refused` carries it) or after `pendingTimeoutMs` of running time (5.18's capped clock) → the 5.18 refusal look (`pendingLook`) and a toast. A phase change / new wave clears it. It never changes the World.
- **D7 Same-spot Place** empties the hand and sends nothing (the server would accept it as a no-op).
- **D8 Tap priority (5.20's open question, resolved):** Ready yields to a building under it (AC 7); the build-bar tiles, ↶, 5.12's row, ☰ and the hand cluster keep priority. Reason: Ready is the only big bottom-centre button and starting the wave by accident is costly; the build bar is the right thumb's main control and a building under it comes out from under it with one step (the camera follows the survivor). Applies to long-press too.
- **D9 Long-press** detection is client-only (`input/longPress.ts`), on the same pointer the tap detector follows; it fires once at 450 ms if the finger stayed within 12 px; the HUD draws the ring at the finger only while the press is on my own building (GameScene answers "mine under this point?" once per frame). It never fires on a teammate's building (no ring, nothing happens) and a fired long-press is not also a tap.
- **D10 Picked-up rotation:** the ghost starts pinned with the building's own rotation; auto-rotate applies only once "↩ carry" puts it in front of me (5.15's hand rules otherwise unchanged).
- **D11 `pickUpSelected()`** is the single entry point (✥ Move and 5.23's `M`). The long-press goes through the same `pickUp(id)`.
- **D12 The dashed old spot** and the pending box are drawn by a small `MoveView` (Graphics only, no texture: brief 20 N/A), reusing `dashes.ts` and `pendingLook`.
- **D13 (taken during the build) Short-screen fallbacks.** (a) The row keeps its top ≥ 12 px below the screen centre (the survivor): only hit at 568 × 320 with a 21 px bottom inset, where centre-112 would sit on the survivor; it then moves down (still ≥ 16 px above the inset). (b) The info lines wrap 24 px right of the screen centre, and below 700 px width they use the 14 px floor so the tallest block (a teammate's building + a refusal line) still clears ☰ (measured 30 px at 568 × 320); "or sell it" uses no-break spaces so a wrapped line never leaves "it" alone.
- **D14 (taken during the build) No move sound / FX yet.** Story 5.23 (placement feel) owns the thunk / dust; a move only changes the spot (teammates see the building jump, `building.moved` is on the wire for 5.23's FX).

### Current state (read before changing)

- `shared/buildings/buildings.ts`: `Building` (`gx`/`gy`/`rot`/`min*`/`max*` were readonly: "buildings never move"), `footprintBlocked(world, box)`, `blockReason(…, exceptId)` (5.17 already reserved `exceptId` for the move), `placementError`, `addBuildingAt`, `removeBuilding`.
- `shared/buildings/sell.ts` / `upgrade.ts` / `repair.ts`: the error-order pattern; `SELL_ERRORS`-style arrays feed the client's parsers.
- `shared/net/messages.ts` (C2S / S2C, zod schemas), `net/netEvents.ts` (kinds to 42), `core/simEvents.ts`.
- `server/rooms/RunRoom.ts` (`onSellBuilding` pattern), `run/RunController.ts`, `rooms/schema/syncState.ts` (`syncBuildings`: adds / removes / retypes on a version change; HP per tick).
- `client/net/mirrorBuildings.ts`, `net/session.ts`, `sim/{SimHost,LocalSimHost,NetSimHost}.ts`.
- `client/scenes/placement.ts` (`Placement`, `stepPlacement`), `repairPanel.ts`, `pendingPlacements.ts` / `pendingFlow.ts`, `undoChip.ts`, `consumableButton.ts › layoutRightButtons`, `HudScene.ts` (`down`/`up` pointer routing, `layoutRepairPanel`, `drawRepair` / `drawUpgrade` / `drawSell`), `hudModel.ts`, `GameScene.ts` (`updateRepair`, `beforeHostStep`), `input/tapDetector.ts`, `render/PendingView.ts`, `render/pendingLook.ts`.

### Must be preserved

5.18's pending placements and chain; 5.19's drag / pin / chip; 5.20's sell / take back money (`paid`, `paidThisBuild`, `usedThisBuild`), undo chip and its layout vs 5.12; 3.7 repair and 5.9 upgrade flows ("Upgrading…" until the tier shows); 5.17's reason line; every existing test (tests that list error arrays or the panel's rows are updated).

### References

`docs/ideas/building-ux/ux-spec.md` §3–§5, §8, §9, §11–§13, §15; `draft-stories.md` BX-7, BX-8; `epics.md` › Stories 5.21, 5.22; `docs/epic-5-decisions.md` › Alignment answers Q4; story files 5-15 … 5-20.

## Notes for the merge (brief line 19)

- **Story 5.23 + 5.25 — the `M` key (wired at the master merge: `onPickUpKey()` → `pickUpSelected()`):** `GameScene.pickUpSelected(): boolean` (public; the same path as ✥ Move: owner, build phase, standing, empty hands, no move of it waiting). No key was added here (`keyMap.ts` untouched). 5.23's feel can hang its "pick" scale-in on `Placement.startMove` (the hand starts pinned at the building) and its thunk on `building.moved` (net kind 43).
- **Net event kinds:** `BUILDING_MOVED = 43` (42 = 5.20's sold). If 5.23 or 5.24 also took 43, renumber the later one; never reuse. `netEvents.test.ts` has the sample event.
- `packages/shared/src/buildings/buildings.ts`: `Building.gx/gy/rot/minX/minY/maxX/maxY` are no longer `readonly` (changed only by the new `relocateBuilding`); `footprintBlocked(world, box, exceptId = 0)`; `relocateBuilding(world, b, gx, gy, rot)` (version +1, wallVersion +1 for a wall, bear-trap re-arm clock reset, a holding trap released and shut). New `buildings/move.ts` (`moveBuilding`, `moveError`, `MOVE_ERRORS`, `MoveRequest`, `MoveError`); exports in `index.ts`.
- `core/simEvents.ts`: `building.moved { buildingId, buildingType, ownerId, gx, gy, rot }`; `net/netEvents.ts`: `[43, id, ownerSlot, gx, gy, rot, typeIdx]`, global (not in `eventInterest`'s local kinds).
- `net/messages.ts`: `C2S.BUILDING_MOVE`, `S2C.BUILDING_MOVE_REFUSED`, `buildingMoveSchema` (strict; id 1–65535, gx/gy 0–255, rot 0–3, seq 0–65535 — review L3), `BuildingMoveRefused { id, reason, seq }`. `config`: `controls.build.longPressMs` 450, `longPressRingMs` 150 (zod defaults; the balance version changes).
- Server: `RunController.moveBuilding`, `RunRoom.onMoveBuilding` (via `this.net.guard`, the shared "other" bucket); `syncState.syncBuildings` assigns gx / gy / rot on a version change. No schema field.
- Client: `mirrorBuildings` relocates (Predictor follows); `SimHost.moveBuilding` / `takeMoveRefusal` (+ `MOVE_REFUSALS_MAX`), `RunInbox.onMoveRefused`, `parseMoveRefused`, `MoveRefusal` (session.ts). `Placement.startMove` / `moveRequest` / `atMoveOrigin` / `moveId` / `moveLost`; `stepPlacement` routes a move Place to `PlacementFrame.sendMove` (`MOVE_LOST_TEXT`); `PlacementHud.placementMoving`. New `pendingMove.ts`, `actionBar.ts` (`layoutActionBar`, `actionLabel`), `input/longPress.ts` (`LongPress`, `longPressRing`, `readyYields`), `render/MoveView.ts`; `HudButtons.hit` / `claim`; `ChipText.get(…, moving)`; `pendingLook` takes any `{ live, counted, refusedMs }`.
- `repairPanel.ts`: the info line format changed ("Name · Yours · HP a/b", teammate: "· Bo's ·" + "Only Bo can move, upgrade or sell it"); new `moveShown`, `moveErrorNow`, `movePending`, `moveLabel`, `moveReason`, `barReason`, `pressMove()`, `update(…, moving)`; `moveRefusalText`, `onlyOwnerText`, `MOVING_TEXT`. 5.20's `sellLabel` is reused (split onto two lines by `actionLabel`).
- `HudScene.ts`: 3.7's repair panel rows (Repair / ✕ / Upgrade / Sell above Ready) are replaced by the action bar (button ids kept: `repair`, `repairClose`, `upgrade`, `sell`, + `move`); the sizes `REPAIR_BUTTON_W_CSS_PX`, `REPAIR_CLOSE_CSS_PX`, `REPAIR_ROW_GAP_CSS_PX` are removed from `ui/sizes.ts` (new `ACTION_BAR`, `ACTION_LABEL_CSS_PX`, `ACTION_INFO_*`, `LONG_PRESS_RING_*`). Ready / 5.12's consumable + swap / the ammo text / ↶ hide while the bar is up (`readyButton`, `consumableIn.placement`, `drawWeapon`). Pointer down: Ready yields to a building under it (`readyYields`).
- `GameScene.ts`: `pendingMoves` updated after the host step (timeouts → "No answer from the server"), move refusals by id → toast; `pickUp(host, id)`, `pickUpSelected()`, `queueMove`; the long-press ring (`pressRing`) and pick-up in `updateRepair`; `hudModel.buildingAt` set after the model reset.

## Senior Developer Review (AI)

Fresh-agent review by the main session (2026-11-24): **no high, 1 medium, 4 low.** The server and shared move rules were sound: every beat-the-rule attempt (B1–B16) held. Fixed on `story-5-21` before the master merge.

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| M1 | Medium | The long-press was armed for left-half touches too: a left thumb resting on the floating move stick over my own building picked it up after 450 ms. | `longPressArmed(wasTouch, x, width)` (`input/longPress.ts`): only a right-half touch or a mouse press arms it (the Ready-yield path keeps it: no stick spawns there). Test in `longPress.test.ts`. |
| L1 | Low | At 568 × 320 the 5-button bar (422 px) reaches into the move stick's half. | Main-session decision: below 700 px CSS width the bar has no ✕ (a tap on the ground closes it; `ACTION_BAR.noCloseBelowCss`). **Not enough to keep the row in the right half:** an owner's 4 buttons are 336 px, and only 3 fit at 568 × 320 / 640 × 360 (none with a 44 px inset at 568). Asked the main session; recommended option (a), accept the remaining spill (a touch on a bar button never spawns a stick), built. Options (b) two rows below 700 px and (c) 62 px buttons are in the message. Tests: ✕ absent below 700 px and the row's left edge moves 86 px right; a teammate's bar is Repair alone. |
| L2 | Low | `actionLabel(...)` allocated strings every frame while the bar was open. | Labels are cached per button by their source text (and Repair's full-HP flag); rebuilt only on change. |
| L3 | Low | A late refusal of a timed-out move could shake a newer move of the same building. | `building.move` carries a client `seq` (0–65535, strict), echoed in `building.move_refused`. `PendingMoves.add` returns it, and `refuse(id, seq)` matches both. Tests: `pendingMove.test.ts` (late refusal of move 1 leaves move 2 waiting), schema, `RunRoom.move.test.ts` (seq echoed), `NetSimHost.move.test.ts` (seq sent; a refusal without seq dropped). |
| L4 | Low | No test for a rotation-only move (`mirrorBuildings` and `pendingMove` rot terms). | `NetSimHost.move.test.ts` (rot-only state change relocates the mirror's footprint, wallVersion +1) and `pendingMove.test.ts` (waits until the World shows the new rot). |
| Info | — | Move / sell / repair / upgrade are not in the replay input log (pre-existing, all building actions). | For the Epic 5 balance pass / retro. |

Fix-round mutations: 7/7 killed (long-press armed on the left half · ✕ kept below 700 px · seq ignored by `refuse` · seq not sent · seq not echoed by the server · mirror rot term · pendingMove rot term).

**Master merged** (`origin/master` with 5.23 + 5.25 placement feel / mouse and keys, 5.13 card shop, start money 200). Hand merges:
- `GameScene.ts`: both view sets.
- `HudScene.ts`: 5.23's wheel reset and resting look kept, plus the MOVE glyph.
- `placement.ts`: 5.23's resting / picks / places / cursor follow kept next to the move fields; `endHold` also clears `placementResting`.
- `SimHost.ts`: `buyCard` / `reroll` / `shopOffer` plus the move methods.
- `RunRoom.ts` / `RunController.ts`: 5.13's card shop plus `onMoveBuilding`.
- `sizes.ts`: both.

5.23's `onPickUpKey()` (the M key) now calls `pickUpSelected()`. A move start goes through `Placement.start`, so 5.23's pick pop plays on a pick-up too. No test assumed the old 100 start money. After the merge the browser checks were re-run at both sizes, M key included. **Full gate on the merged tree:** exit 0, 311 test files passed (1 skipped), 2600 tests passed (3 skipped), build OK (load 1.6 → 2.4).

## Dev Agent Record

### Agent Model Used

Claude (cloud builder session for Story 5.21 + 5.22).

### Debug Log References

- Browser: own server (port 25621, `DEV_STARTING_WALLET=5000`, `ALLOW_SOLO_START=1`) and own Vite (port 5321, a git-excluded local config `apps/client/vite.5321.local.mjs` with the `/api` proxy), both stopped by PID; headless Chromium, mobile emulation, CDP touch; numbers and shots in `docs/art/5-21/README.md`.
- Found by the browser check and fixed during the build: (1) the panel's texts didn't rebuild when the building's owner flipped (only reachable through the dev hack, but the info line and Upgrade label went stale) → `shownMine` in the rebuild key; (2) at 568 × 320 the info lines ran over the survivor → wrapped 24 px right of the centre, 14 px text below 700 px width, no-break "or sell it" (D13); (3) with a 21 px bottom inset at 568 × 320 the row would sit on the survivor → the centre fallback (D13, found by the layout test).
- Online at `?lag=150&jitter=20` (two clients): a first drag went 2 m onto Bo's survivor → the server refused `blocked` and the box shook (the rule working); the check then dragged 3 m up. The headless pages run at a few fps, so a first tap sometimes landed between frames and the script retries the select tap (not a game issue: the same tap opened the bar on retry).
- Mutations (one per new test, each reverted by the runner): **26 run, 26 killed** — move: no owner check · itself not ignored · wave allowed · not_alive skipped; relocate: burn clock reset · wallVersion not bumped; footprintBlocked: exceptId ignored; syncState: gx not synced; room: refusal not sent; netEvents: rot dropped; schema: not strict; mirror: no relocation; NetSimHost: move not sent; LocalSimHost: refusal lost; placement: Place at its own spot sends · pending ignored · lost move kept; pendingMove: never matched · uncapped clock; panel: teammate gets Move · pending move still picks up; layout: 12 px gap · no centre fallback; longPress: fires twice; readyYields: any button; config: longPress bound.
- Full gate (one run, at the end): `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **299 test files passed, 1 skipped; 2501 tests passed, 3 skipped**; build OK (the existing > 1600 kB chunk warning). Load 1.1 → 3.5 during the run.

### Completion Notes List

- Shared `moveBuilding` (server, solo, the hand's prediction): owner (F3), build phase (F4), standing (F9), the new spot by `footprintBlocked` with itself ignored (F6); changes the spot and nothing else (F5: HP, tier, owner, `paid` / `paidThisBuild` / `usedThisBuild`, burn clock, turret aim, trap jaws kept; re-arm clock restarts); free, count unchanged (F8). `building.move` through `this.net.guard`, refusals to the sender with the id; `building.moved` net event 43.
- Buildings are movable everywhere: `relocateBuilding` is the one path (server, solo, mirror); every renderer, the flow field and the light list follow `version` / `wallVersion` (checked: BuildingView, TurretView, MineView, MedStationView, BuildingSelectView, lightState, flowField).
- Client: the action bar replaces 3.7's panel (Move · Upgrade · Repair · Take back / Sell · ✕, teammate: Repair + ✕ and "Only Bo can …"), 78 × 56 at centre bottom 112, checked at 568 × 320 / 800 × 360 / 1024 × 768 with and without insets; Ready, 5.12's row, the ammo text and ↶ hide under it (D3). Pick up by ✥ Move or a 450 ms long-press (ring from 150 ms); the ghost starts pinned on the building, its old spot dashed; MOVE sends, ✕ puts back; pending move box with 5.18's look, refusal / timeout shake + toast. 5.20's question resolved: Ready yields to a building under it (D8). `pickUpSelected()` for 5.23's `M`.
- Bandwidth: one 7-int `building.moved` per move (only on a move; nothing per tick). Perf: no per-frame allocation in the new paths (layouts reuse objects; texts rebuilt only on change; the ring redraws in 1/30 steps while a press is held). No new textures (Graphics / Text only): `addGeneratedTexture` N/A.
- Not done here: a dedicated `NetSimHost` lag unit test for moves (the online browser run at 150 ± 20 ms, `RunRoom.move.test.ts` and the shared build → wave edge test cover spam, refusals and the edge); a move sound / FX (5.23). Not verified: a real phone (thumb reach of the bar, long-press feel), `?stress=150` (nothing added to waves: the bar and moves exist only in build phases).

### File List

- `_bmad-output/implementation-artifacts/5-21-building-action-bar.md` (new), `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/shared/src/buildings/move.ts` (new), `move.test.ts` (new), `buildings.ts`, `blockReason.test.ts`
- `packages/shared/src/core/simEvents.ts`, `net/netEvents.ts`, `net/netEvents.test.ts`, `net/messages.ts`, `net/messages.test.ts`, `index.ts`
- `packages/shared/src/config/balanceSchema.ts`, `config/balance.test.ts`, `config/balance/controls.json`
- `apps/server/src/rooms/RunRoom.ts`, `rooms/RunRoom.move.test.ts` (new), `rooms/schema/syncState.ts`, `run/RunController.ts`, `net/eventInterest.ts`
- `apps/client/src/net/mirrorBuildings.ts`, `net/session.ts`; `sim/SimHost.ts`, `LocalSimHost.ts`, `NetSimHost.ts`, `NetSimHost.move.test.ts` (new)
- `apps/client/src/scenes/actionBar.ts` (new), `actionBar.test.ts` (new), `pendingMove.ts` (new), `pendingMove.test.ts` (new), `placement.ts`, `placement.test.ts`, `repairPanel.ts`, `repairPanel.test.ts`, `chipText.ts`, `hudModel.ts`, `HudScene.ts`, `GameScene.ts`
- `apps/client/src/input/longPress.ts` (new), `longPress.test.ts` (new), `HudButtons.ts`; `apps/client/src/render/MoveView.ts` (new), `render/pendingLook.ts`; `apps/client/src/ui/sizes.ts`
- `docs/art/5-21/` (18 screenshots + README)

### Change Log

- 2026-11-24: Story 5.21 + 5.22 built (action bar, move, long-press, Ready yield); status → review.
- 2026-11-24: Review fixes M1, L1 (option a, question to the main session), L2, L3 (move seq), L4; master merged (5.23 + 5.25, 5.13); M key wired; status stays review.
