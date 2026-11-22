# Story 3.7: Repair buildings

Status: done

## Story

As a player,
I want to repair my damaged buildings (and my teammates') during the build phase,
so that a defense that held can keep holding.

> **Epic 2 retro (2026-11-22): the "EPIC 3 BRIEF" is this story's checklist** (lines 2, 3, 5, 7, 8, 9, 12, 20 in particular; Completion Notes say how each was met). Line 8 is central: the server validates every repair (phase, building, damage, wallet) and returns a `Result` error that the client shows.

> **Parallel story 3.5** (zombies damage and destroy buildings, health bars, damaged look, `building.destroyed`) is built at the same time. On this branch nothing damages buildings yet: tests damage them directly in the World, browser checks use a dev cheat (solo) and a dev server switch (online). HP stays in `building.hp` / `maxHp` only; this story builds **no** health bar (the repair panel shows the HP as text). Edits to the shared building files are additive (the repair rules live in a new file).

> **Decisions made while writing this story (2026-11-22, no designer questions asked; change any of them freely):**
> 1. **Cost = a full repair, always 50 % of the building's price (FR51, AC 1), rounded up:** `repairCost = ceil(price × buildings.repairShare)` with `repairShare: 0.5` in `buildings.json` (own key). Wood barricade 40 → **20**, Auto-turret (3.6) 250 → **125**. Not proportional to the damage: the AC and the GDD both say "50 % of their price" with no damage scaling; a scratched barricade costs the same 20 as a broken one (so players repair when it matters, which fits pillar 2, "every build phase is a real choice"). Rounding up (`ceil`) so a repair is never free for a cheap building; for today's prices both give the same integer.
> 2. **Who and where:** anyone in the run may repair any standing, damaged building (mine or a teammate's, AC 3), paying from their own wallet. No range limit (the GDD names none; you tap what you see on screen). Status is not checked (like placement: in a build phase everybody is back up).
> 3. **Tap to select (touch sticks stay on).** In a build phase, with no placement mode, no shop and no menu, a **short tap** (pointer down → up within 300 ms and ≤ 12 CSS px of travel) on a building selects it. The sticks still spawn on touch-down as before (a 300 ms tap barely nudges the survivor; nothing about the twin-stick feel changes), and the tap is recognised on release. A touch that starts on a HUD button is never a tap. The hit test is the building's footprint grown by **0.4 m** on each side (a 0.5 m barricade is thin under a finger); the nearest centre wins among overlaps. A tap that hits no building closes the panel. Mouse clicks work the same way (a click also fires the gun, as any click does in a build phase).
> 4. **The repair panel** (HUD, bottom centre, one row above Ready / Shop): a **"Repair $20"** button and a **✕** button, with the info right of ✕ on two lines ("Wood barricade · Bo's" / "HP 100 / 200") and the reason in red above it, so the texts stay clear of the survivor at the screen centre. The selected building gets a white outline in the world. The button is dimmed and says why when this device's World predicts a refusal ("Nothing to repair", "Not enough money"); a press still sends (the server is the judge, like 3.4's ✓) and closes the panel. The panel also closes on ✕, a tap on empty ground, the shop opening, placement starting, the menu opening, the phase leaving "build", game over, and when the building is gone (destroyed meanwhile: Story 3.5).
> 5. **Server rules (shared `repairBuilding`, applied between ticks like `placeBuilding`):** order unknown player → not a build phase → building gone → full HP (`hp >= maxHp`) → money (`spendMoney`). On success `hp = maxHp`, the wallet is charged and `building.repaired { buildingId, playerId, cost, gx, gy }` is emitted (delivered with the next tick's events). Nothing changes on a refusal.
> 6. **Net contract:** C2S `building.repair { id }` (int 1–65535, strict) through `this.net.guard` (shared "other" bucket, 10/s). Refusal: S2C `building.repair_refused { id, reason: RepairError }` to the sender only. Success needs no reply: HP and wallet come in the next patch (existing `BuildingState.hp` and `PlayerState.wallet`, synced on change), the event goes to everyone for FX.
> 7. **Refusal texts:** `money` → "Not enough money", `full_hp` → "Nothing to repair", `not_build_phase` → "Only during the build phase" (same text as 3.4's placement refusal, for consistency; the prompt's "Only during the build"), `gone` → "That building is gone", `unknown_player` → "Can't repair that".
> 8. **FX:** `building.repaired { buildingId, playerId, cost, x, y }` (x, y = the footprint box's centre in metres, sent in cm; not gx/gy, so it survives the 3.4b grid change) → a green ring at the building and (for my own repair) two hammer knocks. Net event kind **24** (`BUILDING_REPAIRED`); 22 and 23 are left for 3.5 / 3.6 so parallel branches don't pick the same number.
> 9. **Dev switches for checks** (dev builds / non-production servers only, never balance JSON): solo dev cheat "Damage nearest building 50 %"; server `DEV_PLACED_BUILDING_HP=0.5` makes every newly placed building start at that fraction of its HP (a `RunController` option; production ignores it). Neither changes `balance.version`.
> 10. No repair entry in the shop yet (FR46 lists repairs in the shop; the AC asks for tap-to-repair). Epic 5's roguelike shop can list damaged buildings later.

## Acceptance Criteria

1. **Tap → Repair with cost (FR51).** In a build phase (not placing, shop and menu closed), tapping one of my damaged buildings selects it: a panel shows its name and HP, and a Repair button with the cost of a full repair = 50 % of its price (Wood barricade: $20). The cost comes from `buildings.json` (`repairShare`, rounded up).
2. **Repair (server).** Tapping Repair with enough money: the server restores the building to full HP and charges the cost from my wallet; every client sees the HP and wallet change; `building.repaired` is emitted.
3. **A teammate's building.** Tapping a teammate's damaged building works the same; I pay from my wallet, the owner's wallet is untouched, the owner stays the owner.
4. **Refusals.** Not enough money → "Not enough money"; a building at full HP → "Nothing to repair"; outside a build phase → "Only during the build phase"; a building that was destroyed meanwhile (or never existed) → "That building is gone". Nothing changes on a refusal; the sender sees the text as a toast.
5. **Guards.** `building.repair` goes through `this.net.guard(schema, …)` (shared "other" bucket); malformed messages are dropped; a burst over 25/s neither crashes nor charges more than one repair per damage (the second is refused as full HP).
6. **Panel lifetime.** The panel closes on ✕, a tap on empty ground, Repair, opening the shop, starting placement, opening the menu, the wave starting, game over, and when the building disappears. Tapping another building switches the selection.
7. **Tests.** Vitest covers cost and rounding, each refusal and its order, charging the repairer (not the owner), the full-HP repeat, the net event round trip, the message schema, the room integration (two clients, a teammate's repair, refusals to the sender only, burst), the tap detector, building hit test and panel state.

## Tasks / Subtasks

- [x] **Task 1: Balance** (AC 1)
  - [x] `buildings.json` `repairShare: 0.5`; `buildingsSchema` `repairShare: z.number().min(0).max(1)`.
- [x] **Task 2: Shared repair rules** (AC 1–4) — new `packages/shared/src/buildings/repair.ts`
  - [x] `repairCost(balance, type)`, `RepairError`, `repairError(world, playerId, id)`, `repairBuilding(world, playerId, id): Result<{ cost }, RepairError>` (`spendMoney`, `hp = maxHp`, event), `buildingAtPoint(world, x, y, tolM)`.
  - [x] SimEvent `building.repaired`; net event 24 + round trip; index exports.
- [x] **Task 3: Net contract** (AC 4, 5)
  - [x] `C2S.BUILDING_REPAIR`, `S2C.BUILDING_REPAIR_REFUSED`, `buildingRepairSchema`, `BuildingRepairRefused`.
- [x] **Task 4: Server** (AC 2–5)
  - [x] `RunController.repairBuilding` (+ `devPlacedHpFraction` option applied in `placeBuilding`); `RunRoom.onRepairBuilding` (guard; refusal to the sender; logs); `DEV_PLACED_BUILDING_HP` parsed only when not production.
  - [x] `RunRoom.repair.test.ts`.
- [x] **Task 5: Client hosts** (AC 2, 4)
  - [x] `SimHost.repairBuilding(id)` / `takeRepairRefusal()`; `LocalSimHost` runs the shared function; `NetSimHost` sends `building.repair`, refusals via `RunInbox.onRepairRefused`.
- [x] **Task 6: Client UI** (AC 1, 3, 4, 6)
  - [x] `input/tapDetector.ts` (pure) + tests; HudScene feeds it and writes `model.worldTap*`.
  - [x] `scenes/repairPanel.ts` (pure state, texts, refusal text) + tests; GameScene `updateRepair`.
  - [x] HudScene: panel (info line, Repair, ✕); `render/BuildingSelectView.ts` outline; FxView green ring + `playSfx("building_repaired")`.
  - [x] Dev cheat "Damage nearest building 50 %".
- [x] **Task 7: Checks** (AC 7)
  - [x] `typecheck && lint && test && build` on the branch merged with `claude/epic-2-continue`.
  - [x] Browser: solo + two pages (guest `?lag=150&jitter=20`), screenshots `/tmp/s37/`.

## Dev Notes

### Current state (read before changing)

- **Buildings (3.4):** `packages/shared/src/buildings/buildings.ts` — `Building { id, type, ownerId, gx, gy, rot, hp, maxHp, minX..maxY }`, `world.buildings.list` sorted by id, `buildingById`, `buildingStats`, `placementError`/`placeBuilding` (pattern to copy: shared check → `spendMoney` → mutate → emit). `maxHp` comes from the type's `hp`.
- **Wallet:** `spendMoney(world, id, amount)` (economy/economy.ts) is the only spend path; returns `Result`.
- **Schema / sync:** `BuildingState.hp` (uint16) is synced **on change only** as `Math.ceil(b.hp)` (`syncState.syncBuildings`). The client mirror (`net/mirrorBuildings.ts`) copies HP; `devThrottle` copies buildings; `snapshotWorld` includes them. A repair changes only `hp` and a wallet, both already in every copy, so **no new schema field** (brief line 3: verified, no new copy needed).
- **Messages:** `C2S.BUILDING_PLACE` → `RunRoom.onPlaceBuilding` (guard, `controller.placeBuilding`, `building.refused` to sender). `RunInbox` (net/session.ts) parses refusals into sinks; `NetSimHost` latches them; `GameScene` drains `takePlaceRefusal()` into the toast queue.
- **Input:** `HudScene` routes pointers: buttons first (`HudButtons`), placement mode next, else `hudPointerDown` → sticks / mouse. `hudModel` is the scene↔HUD mailbox (flags set by the HUD, consumed by GameScene each frame).
- **GameScene order per frame:** menu → `updateShop` → `updatePlacement` → `updateReady` → host input → host.update → refusals → events → views. The repair step goes after placement (it needs `placement.active` and `shopOpen`).
- **Events emitted between ticks** are delivered with the next tick (`EventBus.flush` in `step`); the server forwards them as net events to every client.

### What must be preserved

- Twin-stick input: the tap detector only observes pointer down/up; it never claims a pointer or blocks a stick.
- Placement mode (3.4) and the shop (3.3, `shopAllowed`) behave exactly as before; the panel yields to both.
- 3.5 will damage HP (possibly fractional) and remove buildings with `removeBuilding`: the repair check uses `hp < maxHp` on the server's World, and a missing id is the `gone` refusal.

### Rules

- No per-frame allocation: panel strings are rebuilt only when what they show changes (key of id, hp, cost, error); the tap detector is a fixed set of fields; the selection outline redraws only on change.
- Never trust the client: the message carries only the building id; the server looks up the type, price, damage and wallet itself.
- Numbers: `repairShare` in balance JSON. Tap timing/slop and the hit tolerance are input/presentation constants (client code, like `PREVIEW_AHEAD_M`).
- Phaser 4: Graphics/Text APIs as already used in HudScene (`fillRoundedRect`, `setStroke`, `setFontSize`); scene objects are re-created in `create` and state reset in `init`.

### Testing

- Shared: `buildings/repair.test.ts` (cost, ceil, order of refusals, charge, full-HP repeat, teammate, event, hit test). `net/netEvents.test.ts` round trip for kind 24. Message schema test.
- Server: `rooms/RunRoom.repair.test.ts` with `bootTestServer()` (two clients, damage in the server World, repair, teammate, refusals, guard burst, a destroyed building).
- Client: `input/tapDetector.test.ts`, `scenes/repairPanel.test.ts`, `sim/NetSimHost.repair.test.ts` (send, refusal latch) and LocalSimHost.

### Project Structure Notes

- New: `packages/shared/src/buildings/repair.ts` (+ test), `apps/client/src/input/tapDetector.ts` (+ test), `apps/client/src/scenes/repairPanel.ts` (+ test), `apps/client/src/render/BuildingSelectView.ts`, `apps/server/src/rooms/RunRoom.repair.test.ts`, `apps/client/src/sim/NetSimHost.repair.test.ts`.
- Matches the architecture's `shared/buildings/` ("placement grid, building behaviors, repairs").

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 3.7, FR46, FR51.
- GDD › Buildings and Defenses ("can be repaired in a build phase for 50% of their price").
- `3-4-place-a-wood-barricade.md` › decisions, "Fit with Stories 3.5–3.7", "Notes for the merge".
- `epic-2-retro-2026-11-22.md` › EPIC 3 BRIEF; `HANDOFF.md` §3.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), BMAD gds-create-story + build, 2026-11-22.

### Debug Log References

- `npm run typecheck && npm run lint && npm test && npm run build` pass on `story-3-7` merged with `claude/epic-2-continue` (9824807, Story 3.3 review fixes; no newer commit at finish): 132 test files, 964 passed (3 skipped).
- Brief line 15: removing the full-HP check in `repairError` fails 4 tests (2 shared: repeat refused / refusal order; 2 room: refusals, burst of 40).
- Bandwidth: a repair changes one `BuildingState.hp` (uint16) and one wallet in the next patch (a few bytes, once); `building.repaired` is 6 ints, ≤ 12 B msgpack. Idle cost 0 B/s; no new schema field.
- Browser (Playwright, headless Chromium, 844 × 390 @2x, touch; server :5367 with `DEV_NO_WAVES=1 DEV_PLACED_BUILDING_HP=0.5`, Vite :7873), screenshots `/tmp/s37/`, logs `solo-log.txt`, `online-log.txt`:
  - solo (01–09): dev cheat damages the barricade to 100/200; a tap 0.3 m off the barricade opens the panel ("Repair $20"); Repair → HP 200, $60 → $40, panel closed; full HP → panel "Nothing to repair" (dimmed) and Repair → toast "Nothing to repair"; $5 → "Not enough money" panel and toast, nothing changed; a tap on empty ground, ✕, opening the shop each close it; in placement mode a tap on a building moves the preview and opens nothing; a drag over a building (a stick) is not a tap; the wave starting closes it; a late request in the wave → toast "Only during the build phase".
  - two pages, guest with `?lag=150&jitter=20` (20–26): host places two half-HP barricades; the lagged guest taps one → "Wood barricade · Ana's / HP 100 / 200", Repair → HP 200 on both pages, guest $100 → $80, host still $20; host repairs its own (→ $0); guest presses Repair on a full building → server refusal toast "Nothing to repair" (wallet unchanged); host ($0) on Bo's half-HP barricade → panel and server toast "Not enough money"; after a hidden tab on the guest (`loop.sleep()/wake()`) the guest repairs its own barricade. 0 page errors.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Shared: new `buildings/repair.ts` (`repairCost` = ceil(price × `repairShare`), `repairError` in the order unknown player → phase → gone → full HP → money, `repairBuilding` via `spendMoney`, `buildingAtPoint` on the footprint boxes), SimEvent + net event 24, `building.repair` / `building.repair_refused` contract.
- Server: `RunController.repairBuilding`, guarded `RunRoom.onRepairBuilding` (refusal to the sender, logs), dev switch `DEV_PLACED_BUILDING_HP` (RunController option, read per run, ignored in production).
- Client: `SimHost.repairBuilding / takeRepairRefusal` (solo at once; online via `RunInbox.onRepairRefused`), `TapDetector` (watches pointers, never claims them), `RepairPanel` state + texts, HUD panel (Repair / ✕ / info / reason), `BuildingSelectView` outline, FX ring + sound, dev cheat "Damage nearest building 50 %".
- Coordinator note (3.4b geometry, 0.5 m grid with min-corner anchoring): everything here works from the footprint box (`minX..maxY`): hit test, outline, event position, dev cheat; tests are written relative to the boxes. Nothing uses gx/gy as a centre.
- **Epic 3 brief:**
  - L2: git status clean; typecheck + lint + test + build pass on the branch merged with the current `claude/epic-2-continue`.
  - L3 (all copies): no new schema field or phase. A repair changes `Building.hp` and `PlayerState.wallet`, which already travel World → schema (`syncBuildings`, HP on change) → `syncState` → `BuildingStateView` → `NetSimHost` mirror (`mirrorBuildings`) → devThrottle (buildings map) → `snapshotWorld`. Predictor: not affected (HP doesn't change movement). Checked by `NetSimHost.repair.test.ts` (HP and wallet arrive from the state) and the room test.
  - L5: no new phase; the panel follows the existing "build" phase: closes when it leaves, checked under `?lag=150&jitter=20` and after a hidden tab.
  - L7: one Repair press → one request (the panel closes on press, `press()` returns the id once); a repeat is refused as `full_hp`, so it never charges twice (tests).
  - L8: the server recomputes everything from the id (phase, building, damage, price, wallet via `spendMoney`) and returns a `Result` error shown as a toast; the client never sends a price.
  - L9: `this.net.guard(buildingRepairSchema, …)` in the shared "other" bucket; burst of 40 → one repair, wallet exact, ≤ 11 handled; malformed (id 0, 1.5, extra key, empty) dropped.
  - L12: `repairShare: 0.5` in `buildings.json` (own key, schema-validated). Tap time/slop and hit tolerance are input constants (client).
  - L20: see Notes for the merge.
- **Unverified:** feel on a real phone (headless Chromium ~14 fps); the panel layout on very narrow phones (texts right of ✕ may run under the weapon panel area below 700 CSS px width; not checked); "That building is gone" in the browser (no destruction before 3.5; covered by shared and room tests).
- **Deviations:** "Only during the build phase" instead of the prompt's "Only during the build" (same text as 3.4's placement refusal). No repair entry in the shop (FR46), tap-to-repair only. Status (downed/out) is not checked for the repairer (as placement), but the client offers taps only to a standing survivor.

### Notes for the merge (brief line 20)

- `buildings.json` + `balanceSchema.ts`: `repairShare` (required) next to `maxPerPlayer`. 3.6 adding a turret type: no conflict beyond adjacent lines. Changes `balance.version`.
- `core/simEvents.ts`: `building.repaired` appended after `building.placed`. `net/netEvents.ts`: kind **24** (22/23 left for 3.5/3.6); renumber freely if another story took 24. `net/messages.ts`: `BUILDING_REPAIR`, `BUILDING_REPAIR_REFUSED`, `buildingRepairSchema` after the shop entries. `index.ts`: one export line for `buildings/repair`.
- Server: `RunController` (`repairBuilding`, `devPlacedHpFraction` option, `parseDevHpFraction`; `placeBuilding` applies the dev HP share), `RunRoom` (guard line after `SHOP_BUY`, `onRepairBuilding` after `onPlaceBuilding`, option in `startRun`).
- Client: `SimHost`/`LocalSimHost`/`NetSimHost` (repair methods next to placement), `session.ts` (`onRepairRefused`, `parseRepairRefused`), `GameScene` (`updateRepair` right after `updatePlacement`; refusal toast after the placement one; `selectView` after `buildingView`), `HudScene` (tap detector in the pointer handlers, panel objects/buttons, `layoutRepairPanel`, `drawRepair`), `hudModel` (fields after the shop ones), `FxView` (+ `building.repaired` case), `placeholderSfx` (`building_repaired`), `DevCheats`/`devCheatActions`.
- **For 3.5:** HP may be fractional: the server rule is `hp < maxHp`; the client panel sees `ceil(hp)` (so a 199.5 HP building reads "Nothing to repair" locally, but the server accepts and charges). Your health bars go in `BuildingView`; I did not touch it (the outline is a separate `BuildingSelectView`). A destroyed building closes an open panel (it looks up the id every frame) and a late request gets `gone`. Remove the `DEV_PLACED_BUILDING_HP` switch and the cheat when zombies damage buildings, if you like.
- **For 3.4b (0.5 m grid, min-corner anchoring):** nothing to change here; all repair code uses the footprint boxes.
- **For 3.6:** turret repair costs ceil(250 × 0.5) = 125 automatically.

### File List

- New: `packages/shared/src/buildings/repair.ts`, `packages/shared/src/buildings/repair.test.ts`, `apps/server/src/rooms/RunRoom.repair.test.ts`, `apps/client/src/input/tapDetector.ts`, `apps/client/src/input/tapDetector.test.ts`, `apps/client/src/scenes/repairPanel.ts`, `apps/client/src/scenes/repairPanel.test.ts`, `apps/client/src/render/BuildingSelectView.ts`, `apps/client/src/sim/NetSimHost.repair.test.ts`.
- Changed (shared): `config/balance/buildings.json`, `config/balanceSchema.ts`, `core/simEvents.ts`, `net/{messages,netEvents}.ts`, `net/{messages,netEvents}.test.ts`, `index.ts`.
- Changed (server): `rooms/RunRoom.ts`, `run/RunController.ts`, `run/RunController.test.ts`.
- Changed (client): `sim/{SimHost,LocalSimHost,NetSimHost}.ts`, `net/session.ts`, `scenes/{GameScene,HudScene,hudModel}.ts`, `render/FxView.ts`, `audio/placeholderSfx.ts`, `ui/sizes.ts`, `debug/{DevCheats.tsx,devCheatActions.ts,devCheatActions.test.ts}`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, this file.

## Senior Developer Review (AI)

- **Date:** 2026-11-22 · **Reviewer:** independent review agent (fresh context; full suite, touched suites 4×, 11 mutations caught, browser: solo and two pages under `?lag=150&jitter=20`, synthetic multi-touch). **Outcome:** no high findings.
- [x] [Med] Fractional HP: the server repaired at `hp < maxHp` while the client shows `ceil(hp)` (charge $20 for 0.5 HP while the panel said "Nothing to repair"). `isDamaged` now uses `ceil(hp) < maxHp` (and 3.5 keeps HP whole). Test.
- [x] [Low] The panel survived a hidden tab that slept through a whole wave: it remembers the wave number it opened in and closes when it changes. Test.
- [x] [Low] `DEV_PLACED_BUILDING_HP` logged nothing: it now warns when applied and logs `dev_placed_building_hp_ignored` when ignored (production).
- Noted: a quick move-stick nudge (≤ 300 ms, ≤ 12 px) with the panel open closes it, and a tap is lost if a second finger lands on the stick during it (the detector follows the latest touch-down) — accepted for now, revisit with the phone playtest; refusals use an S2C message like 3.4's placement (not `ServerError(526)`, which is for joins).

## Change Log

- 2026-11-22: Review fixes (ceil HP rule, panel per wave, dev switch logs). Story done.

- 2026-11-22: Story written (gds-create-story), status ready-for-dev.
- 2026-11-22: Built: shared repair rules, guarded `building.repair` with refusals, tap-to-select panel, FX, dev switches; repair code made geometry-agnostic (footprint boxes) per the coordinator's 3.4b note; merged `claude/epic-2-continue`; status review.
