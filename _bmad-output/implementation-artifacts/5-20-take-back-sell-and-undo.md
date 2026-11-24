---
baseline_commit: a1611410a4fae055a16af1e06efeac14e4243714
---

# Story 5.20: Take back, sell and undo

Status: review

(Building UX rework BX-6. Design: `docs/ideas/building-ux/ux-spec.md` §3 (the hand state's Undo ↶), §4 (Undo 48 px; alignment Q4: above the build bar's top-left), §5 (undo window **10 s**), §8 (Take back / Sell rows + fairness rules F1–F9), §9 (`Z` / `Ctrl+Z`), §10 (lift-and-fade 200 ms, "+$40" floats 0.6 m in 600 ms, coins, 12 ms haptic), §11 (`building.sold`), §15 (designer: **sell 50 %**, **undo 10 s**); `draft-stories.md` › BX-6; prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR. Builds on 5.15 (carry, hand cluster), 5.16 (build bar), 5.17 (reason line), 5.18 (chain, `pendingPlacements.ts`, `pendingFlow.ts › runPendingFrame`), 5.19 (item chip), 5.9 (upgrade ladder, floor buildings), 5.10 (med station, floodlight), 5.14 (bear trap), 5.11 (`not_alive`). **This story changes the server:** a new C2S message `building.sell`, a new S2C refusal, a new net event kind and two server-only building fields.)

Main-session decisions carried in (2026-11-24): **(a)** the "you can't act while down" rule extends to buildings: place, repair, upgrade, sell (take back is a sell) refuse **`not_alive`** for a downed or out player (5.11 re-review R2, deferred to here); tests for a downed and an out player in each. **(b)** Q4 small-phone layout: the undo chip sits **above the build bar's top-left**; every new control checked at **568 × 320 and 800 × 360 with ≥ 12 px gaps**. Story 5.12 (in review in parallel on `story-5-12`) puts the consumable + swap row above the bar's top-left in build phases (`consumableButton.ts › layoutRightButtons`: 64 px buttons at `gridLeft` and `gridLeft + 76`, 12 px above the tiles); the undo chip must never overlap it (D4). **(c)** F2 money: take-back in the same build phase refunds 100 % of what was paid this phase; selling later refunds `floor(50 % × paid before this phase)` + 100 % of this phase's spend; repairs never refunded; no money loop (sell + rebuild = a repair); F3 owner only; F4 build phase only.

## Story

As a player,
I want to undo a misplaced building and sell old ones,
so that a mistake costs nothing and I can rebuild my defence.

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

## Acceptance Criteria

1. **Server message.** C2S **`building.sell { id }`** (`buildingSellSchema`: int 1–65535, `.strict()`), registered with **`this.net.guard`** (the shared ~10 non-input msgs/s bucket; a flood beyond it is dropped silently). Refusal goes to the sender only as S2C **`building.sell_refused { id, reason: SellError }`**; success is logged `building_sold` (info), refusals at debug.
2. **Shared rule** `sellBuilding(world, playerId, id)` / `sellError(...)` in `packages/shared/src/buildings/sell.ts` (server, solo and the client panel run it) checks **in this order**: `unknown_player` → **`not_alive`** (downed or out) → `not_build_phase` → `gone` → `not_owner`. null = the server accepts. On success: refund per AC 3 through `refundMoney` (wallet +refund, `money.earned { reason: "refund" }`, never counted in `earned`), the building is removed with `removeBuilding` (`version++`; `wallVersion++` only if `solid`; a holding bear trap lets go), and **`building.sold { buildingId, ownerId, refund, x, y }`** (footprint centre, m) is emitted — a **new net event kind `BUILDING_SOLD = 42`** (39/40 are 5.12's, 41 is 5.14's) with a round-trip test. On any error nothing changes.
3. **F2 money (no money loop).** Each building keeps **`paid`** (price + every upgrade step bought) and **`paidThisBuild`** (what was paid for it in the **current** build phase; reset to 0 for every building at **every build start**). `refund = paidThisBuild + floor(buildings.sellShare × (paid − paidThisBuild))`, `sellShare = 0.5` in `buildings.json` (zod 0–1). So: placed this phase → **100 %** ("take back"); placed earlier → 50 % rounded down ("sell"), plus 100 % of upgrades bought this phase. **Repairs never add to `paid`** (never refunded). Checked: wood 40 placed now → 40; wood 40 from last phase → 20 (= its repair cost 20); metal (paid 160) from last phase → 80 (= repair 80); old wood upgraded now (+50) → 20 + 50 = 70; spike trap / any odd price p from last phase: sell `floor(p/2)` + rebuy p = `ceil(p/2)` = its repair cost.
4. **Bookkeeping is server-only.** `paid` / `paidThisBuild` live on the shared `Building` (so solo and the server's World have them, and `snapshotWorld` includes them via its building copy for determinism) but are **not in the schema** (`BuildingState`), not synced, not in `stateView`. The client mirror's copies stay at their defaults (`paid` = the tier price, `paidThisBuild` 0) and are never read for money.
5. **Standing only (decision (a), F9).** `placementError`, `repairError`, `upgradeError` gain **`not_alive`** right after `unknown_player` (downed or out → refused, nothing charged). The new reason is in `PlaceError`/`RepairError`/`UpgradeError` (+ `REPAIR_ERRORS`, `UPGRADE_ERRORS`, the client's `PLACE_ERRORS`) and has player text ("Not while you're down"). Tests: a downed and an out player for place, repair, upgrade and sell (shared) and one server round trip for sell.
6. **Undo chip ↶.** After each Place (5.18's press), a **48 px** round chip ↶ shows for **`controls.build.undoWindowMs` = 10 000 ms** (zod int 1000–60 000) with a **draining ring** (full → empty over the window). It sits **above the build bar's top-left**, row-aligned with 5.12's consumable/swap row, **never overlapping** it, Ready, the hand cluster, the item chip, the reason line or ☰, with **≥ 12 px** gaps at **568 × 320 and 800 × 360** (D4). Pressing it (or `Z` / `Ctrl+Z` on a keyboard) **sells that building** (it was placed this phase: 100 % back) and hides the chip. A newer Place replaces the chip's target and restarts the 10 s.
7. **Undo under lag.** If the placement is **still pending** (5.18 box, no answer yet) when ↶ is pressed, the chip shows it's armed and the sell is sent **as soon as the box becomes my building** (matched by `PendingPlacements`), even if that is after the 10 s; if the box is refused or times out, nothing is sent and the chip goes. The chip also goes when the build phase ends, a new wave number starts, I'm downed/out, the run ends, or the building is gone. A sell is never sent outside a build phase by the client (the server refuses it anyway).
8. **Sell for older buildings.** Until 5.21's action bar, the 3.7 repair panel shows a **Sell button for my own buildings** (owner only, absent on a teammate's), labelled **"Take back +$40"** for a building placed this build phase and **"Sell +$20"** otherwise (the AC 3 refund the client predicts, D7). It sends `building.sell`; the panel closes. The label function (`sellLabel`) is exported for 5.21.
9. **FX.** On `building.sold`: the footprint lifts **0.15 m** and fades in **200 ms** (pooled), **"+$N"** (the server's `refund`) floats up **0.6 m in 600 ms** at the building (pooled HUD text), a **coins** placeholder sound for the owner, a **12 ms** haptic (`navigator.vibrate`, Android; silently absent elsewhere) for the owner. Teammates see the lift-and-fade (the building goes for them too).
10. **Copies.** World (`paid`, `paidThisBuild`, server-side) → `syncState` removes the sold building (existing version path) → mirror removes it (`mirrorBuildings`) → Predictor's collision follows (same mirror) → `devThrottle` delays `building.sell` like any non-input message (no code) → `snapshotWorld` copies the new fields.
11. **Tests:** `sell.test.ts` (order of checks, every refusal, refund cases of AC 3, `paidThisBuild` reset at build start, repairs not refunded, money-loop check over the ladder, mine sold with a zombie on it in a build phase = no blast, bear trap holding released, wall vs floor `wallVersion`, event emitted, nothing changes on error); `netEvents` round trip; `messages` schema; not_alive tests for place/repair/upgrade; `RunRoom.sell.test.ts` (round trip: sell → wallet + schema removal; teammate → `not_owner`; wave → `not_build_phase`; double sell → `gone`, refunded once); `undoChip.test.ts` (window, replace, pending → send on match, refused → gone, phase/wave/downed hide, never sends outside build); `undoLayout` test at 568 × 320 / 800 × 360 / 1024 × 768 against 5.12's row, Ready, the hand cluster and ☰; `repairPanel` sell label/owner tests; `session` parse test; `LocalSimHost`/`NetSimHost` sell wiring. Mutation per new test (brief 9). Netsim at `?lag=150&jitter=20`: sell spam, undo at the build→wave edge, never double-refunded. Browser screenshots in `docs/art/5-20/`.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | Sell a teammate's building (crafted `building.sell`) | `not_owner`, nothing changes |
| B2 | Sell in a wave | `not_build_phase` |
| B3 | Upgrade then sell in the same phase | 100 % of both (price + step) |
| B4 | Upgrade last phase, sell now | 50 % of everything paid, rounded down |
| B5 | Sell a worn spike trap / damaged wall and rebuy | net cost = its repair cost (no free repair beyond the normal one, no profit) |
| B6 | Spam sell with a crafted id flood | the guard drops > ~10/s; every valid one refunds once, the rest `gone` |
| B7 | Sell a mine while a zombie stands on it in the build phase | removed, no blast (removal only; mines only fire in waves) |
| B8 | Press ↶ right at the build→wave edge under `?lag=150` | either sold in the build (refund) or refused `not_build_phase`; never refunded twice, never sold in a wave |
| B9 | Sell while downed / out (and place, repair, upgrade) | `not_alive` |
| B10 | Sell + rebuy every phase to reset wear / HP | costs the repair price each time (= repairing) |
| B11 | Undo a placement the server refused | nothing sent, chip gone, wallet unchanged |
| B12 | Sell a bear trap holding a zombie (only possible if it were held in a build: never) | removal releases the slot (`removeBuilding`) |

## Tasks / Subtasks

- [x] **T1 Numbers**: `buildings.sellShare` (0.5), `controls.build.undoWindowMs` (10 000) with schema defaults; `balance.test.ts`.
- [x] **T2 Shared sell** (`buildings/sell.ts`): `SellError`, `SELL_ERRORS`, `sellRefund`, `sellError`, `sellBuilding`; `Building.paid/paidThisBuild` (set in `addBuildingAt`, `placeBuilding`, `upgradeBuilding`; reset in `startBuild`); `building.sold` SimEvent + net kind 42; exports; tests.
- [x] **T3 not_alive** in place/repair/upgrade + texts + parsers + tests.
- [x] **T4 Server**: schema + `S2C.BUILDING_SELL_REFUSED`, `RunController.sellBuilding`, `RunRoom.onSellBuilding` via `net.guard`; eventInterest note (global); `RunRoom.sell.test.ts`.
- [x] **T5 Client host**: `SimHost.sellBuilding/takeSellRefusal`, LocalSimHost, NetSimHost, `RunInbox.onSellRefused` + parser; tests.
- [x] **T6 Undo model** (`scenes/undoChip.ts`, Phaser-free) + `PendingPlacements.add` returning its order + `buildingIdFor(order)` / `isWaiting(order)`; `spendTracker` for the label; tests.
- [x] **T7 HUD**: undo chip (circle + ↶ + ring redrawn on quantized change), layout `undoChipLayout` (pure, tested), repair-panel Sell button, sold "+$N" pops; GameScene wiring (Z key), FxView lift-fade, sfx `building_sold`, haptic.
- [x] **T8 Browser check** (own ports, solo `?wallet=5000` and online with `?lag=150&jitter=20`), screenshots `docs/art/5-20/`; netsim check.
- [x] **T9 Gate + mutations + record.**

## Dev Notes

### Decisions (taken here, recommended values)

- **D1 Refund formula** `paidThisBuild + floor(sellShare × (paid − paidThisBuild))` — the only reading of F2 without a loop: applying 50 % to this phase's upgrade too and adding it back 100 % would pay 125 % of an upgrade (old wood 40 + upgrade 50 → 95 > 70).
- **D2 `paid` is stored**, although by the 5.9 ladder rule it always equals the tier's `price` (40 / 90 / 160); the decay refund (4.5) keeps using `price × buildingRefundShare` (equal). The client predicts with the tier price.
- **D3 Refund goes through `refundMoney`** (one wallet path; the HUD's "+N" by the wallet shows it as today's decay refunds do) and `building.sold` carries the amount for the FX.
- **D4 Undo chip position** (alignment Q4 + 5.12 coordination; changed during the build, see the Debug Log). **With the build bar up** (empty hands, Ready shown and slid left): above the bar's top-left, centred on 5.12's consumable/swap row (64 px buttons, bottom 12 px above the tiles), in the row's **third slot** `gridLeft + 2 × (64 + 12)` — right of 5.12's consumable and swap, still above the grid's 248 px width, so it never meets 5.12's buttons, Ready or the tiles. **While holding** (Ready, the bar and 5.12's row are all hidden): the ux-spec §4 hand spot, **centre (270, 64)** from the bottom-right safe-area corner, left of ⟳. The first build put it at the grid's top-left in the hand state too; the 568 × 320 screenshot showed it covering the just-placed barricade and the chain ghost next to the survivor, and the spec keeps (270, 64) while holding (alignment Q4's move answers the slid Ready, which is hidden while holding). Checked by a pure layout test at 568 × 320, 800 × 360 and 1024 × 768 (both 5.12 slots, Ready, the hand cluster, the item chip, the count line, ☰).
- **D5 The 10 s start at the Place press** (what the player perceives); a still-pending undo pressed inside the window is honoured whenever its building appears (AC 7).
- **D6 Sell for older buildings lives in the 3.7 repair panel** (one row above Upgrade, same width; the first build put it right of Upgrade, where it crowded ✕'s info column at 568 × 320) until 5.21 replaces the panel with the action bar; owner only (F3: absent for teammates, "less to read").
- **D7 The client's label** comes from a small event tracker (`spendTracker.ts`): my own `building.placed` (tier price) and `building.upgraded` (cost) since the last `build.started`, by building id — the same events in solo and online, no schema field (AC 4). The server's `building.sold.refund` is what floats up and what lands in the wallet; a stale label after a slept tab can only be wrong in text, never in money.
- **D8 Lift-and-fade** draws a pooled translucent footprint box (the building's sprite is already gone with the World's removal), not the building's art; 200 ms, rises 0.15 m.
- **D9 Keyboard: deferred to 5.25 (BX-11, optional).** `Z` needs a new `KeyAction` in `keyMap.ts` / `KeyboardMouse.ts`, which Story 5.12 also edits (`KeyE`); `keyVector.test.ts` asserts `KeyZ` is unbound; and `KeyZ` is the physical W-key on AZERTY. Touch is the target; desktop can press ↶ with the mouse.
- **D10 Mines/traps sold** are just removed (F6: no blast in a build; mines can't fire in a build phase).

### Current state (read before changing)

- `shared/buildings/buildings.ts`: `Building`, `addBuildingAt`, `removeBuilding` (releases a held bear-trap zombie), `placeBuilding` (spendMoney + `building.placed`), `placementError` (unknown_player → not_build_phase → type → for sale → limit → money → blocked).
- `shared/buildings/upgrade.ts`, `repair.ts`: the error-order pattern to copy; `REPAIR_ERRORS` / `UPGRADE_ERRORS` arrays feed the client parsers.
- `shared/run/runStateMachine.ts › startBuild`: the build-start hook (reset `paidThisBuild` there).
- `shared/economy/economy.ts › refundMoney`; `shared/core/simEvents.ts`; `shared/net/netEvents.ts` (kinds up to 41; 39/40 reserved by 5.12); `shared/net/messages.ts` (C2S/S2C + zod schemas).
- `server/rooms/RunRoom.ts` (`onMessage(..., this.net.guard(schema, ...))`, `onUpgradeBuilding` pattern), `server/run/RunController.ts`.
- `client/sim/{SimHost,LocalSimHost,NetSimHost}.ts`, `client/net/session.ts` (`RunInbox` sinks, parsers).
- `client/scenes/pendingPlacements.ts` (`add`, `matchBuildings`), `pendingFlow.ts`, `repairPanel.ts`, `HudScene.ts` (`layoutBuildBar`, `layoutHandCluster`, `layoutRepairPanel`), `hudModel.ts`, `GameScene.ts` (`updateRepair`, event loop), `render/FxView.ts`, `audio/placeholderSfx.ts`.

### Copies touched (brief line 2)

World (`Building.paid`, `paidThisBuild`) → schema: **no field** (server-only) → `syncState`: unchanged (removal via `version`) → stateView key lists: unchanged → mirror: `addBuildingAt` defaults → Predictor: follows the mirror's removal → devThrottle: no change (delays `building.sell` with other non-input C2S) → `snapshotWorld`: building spread copy includes the fields (determinism digest changes by field set, not by run).

### Must be preserved

5.18's pending order (`runPendingFrame`), cap and shown wallet; 5.19's chip and drag; 3.7 repair and 5.9 upgrade flows; 4.5 decay refund; 5.14 bear-trap release; every existing test (tests that list error arrays are updated).

### References

`docs/ideas/building-ux/ux-spec.md` §3–§5, §8, §9, §10, §11, §15; `draft-stories.md` BX-6; `epics.md` › Story 5.20; `docs/epic-5-decisions.md` › Alignment answers (Q1, Q4); story files 5-9, 5-11, 5-14, 5-18, 5-19; `origin/story-5-12:apps/client/src/scenes/consumableButton.ts`.

## Notes for the merge (brief line 19)

- **Story 5.12 (`story-5-12`, in review in parallel) — the layout:** 5.12's `consumableButton.ts › layoutRightButtons` puts the consumable at `gridLeft` and swap at `gridLeft + 76` (64 px, 12 px above the tiles) while the build bar is up. 5.20's ↶ takes the **third slot** of that row (`gridLeft + 152`, centred on it) and, while holding, the hand spot (270, 64) where 5.12 shows nothing (its buttons hide while placing). No overlap in either state (`undoChip.test.ts` replicates 5.12's two rects at 568 × 320 / 800 × 360 / 1024 × 768). At the merge, replace `UNDO_ROW_BUTTON_CSS_PX` / `UNDO_ABOVE_BAR_GAP_CSS_PX` in `ui/sizes.ts` with 5.12's `RIGHT_BUTTON_CSS_PX` / `ABOVE_BAR_GAP_CSS_PX` (same values), and point the test at `layoutRightButtons`. If 5.12's row grows a third button, move ↶ to slot 3.
- **5.12 — net event kinds:** 39/40 are 5.12's; `BUILDING_SOLD = 42` (41 = 5.14). `netEvents.test.ts` gets both stories' sample events.
- `packages/shared/src/buildings/buildings.ts`: `Building.paid`, `paidThisBuild` (set in `addBuildingAt` / `placeBuilding`); `PlaceError` gains `not_alive` (2nd check); `resetBuildSpend(world)`. `upgrade.ts` / `repair.ts`: `not_alive` 2nd in the check order and in `UPGRADE_ERRORS` / `REPAIR_ERRORS`; an upgrade adds its step to `paid` / `paidThisBuild`. New `sell.ts` (`sellBuilding`, `sellError`, `sellRefund`, `sellRefundFor`, `SELL_ERRORS`).
- `run/runStateMachine.ts › startBuild`: `resetBuildSpend` right after the Ready clear (before decay). 5.22 (move) must keep `paid` / `paidThisBuild` on the moved building.
- `core/simEvents.ts`, `net/netEvents.ts`: `building.sold { buildingId, buildingType, ownerId, rot, refund, x, y }` → `[42, id, ownerSlot, refund, xCm, yCm, typeIdx, rot]`; global (not in `eventInterest`'s local kinds).
- `net/messages.ts`: `C2S.BUILDING_SELL`, `S2C.BUILDING_SELL_REFUSED`, `buildingSellSchema`, `BuildingSellRefused`. `config`: `buildings.sellShare` 0.5, `controls.build.undoWindowMs` 10 000 (both with zod defaults; the balance version changes).
- Server: `RunController.sellBuilding`, `RunRoom.onSellBuilding` (via `this.net.guard`, the shared "other" bucket). No schema field.
- Client: `SimHost` gains `sellBuilding` / `takeSellRefusal` (Local/Net hosts, `RunInbox.onSellRefused`, `parseSellRefused`); `PendingPlacements.lastOrder`, `builtId(order)`, `waiting(order)`; `RepairPanel` gains `sellShown`, `sellLabelText`, `sellReason`, `sellErrorNow`, `pressSell()`, and `update(…, spentOn)`; exported `sellLabel`, `sellRefusalText`, `NOT_ALIVE_TEXT` (placement.ts). **5.21's action bar** reuses `sellLabel` + `RepairPanel`'s sell fields and replaces the panel's Sell button (HudScene `sell` button, one row above Upgrade). `hudModel`: `sell*`, `undo*`, `soldPop*`. `PopPool` takes an optional life (ms).
- `GameScene`: `updateUndo` runs after the refusals (after `runPendingFrame`); `buildSpend.handle` per event; `onSold` subtracts the refund from `moneyGain` (the sold pop replaces the wallet pop for my own sells).

## Senior Developer Review (AI)

(pending: fresh-agent review by the main session)

## Dev Agent Record

### Agent Model Used

Claude (cloud builder session for Story 5.20).

### Debug Log References

- Browser: own server (port 25620, `DEV_STARTING_WALLET=5000`, `ALLOW_SOLO_START=1`) and own Vite (port 5320, config in the session scratchpad), both stopped by PID; headless Chromium with mobile emulation and CDP touch; numbers and shots in `docs/art/5-20/README.md`.
- Layout change during the build: the first hand-state ↶ spot (the grid's top-left, pushed below the item chip) covered the just-placed barricade at 568 × 320 → moved to the spec's (270, 64) (D4). The first Sell spot (right of Upgrade) crowded the info column at 568 × 320 → one row above Upgrade (D6). The sold "+$40" pop duplicated the wallet's "+40" → the wallet pop is suppressed for my own sells.
- Mutations (one per new test, each reverted): 20 run, 20 killed after one fix (M10 "an armed undo sent after the wave" first survived: the test used a building id that didn't exist, so the chip cleared for the wrong reason; the test now places a real building). List: refund ignores this phase · sell skips not_alive · no build-start reset · upgrade not counted this phase · place / repair skip not_alive · no owner check (server test) · decode drops rot · schema not strict · undo sends after the wave · armed undo dropped at the window · layout slot 1 (overlaps 5.12's swap) · builtId not recorded · take-back label inverted · BuildSpend ignores upgrades · NetSimHost doesn't send · armed undo never sent (netsim) · server double refund (netsim) · haptic not called · sellShare bound.
- Full gate (one run, at the end): `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **284 test files passed, 1 skipped; 2367 tests passed, 3 skipped**; build OK (the existing > 1600 kB chunk warning). Load 0.85 → 3.7 during the test run.

### Completion Notes List

- Shared `sellBuilding` (server, solo, panel prediction) with F2 refunds (`paidThisBuild + floor(0.5 × the rest)`), F3 owner, F4 build phase, F9 standing; `building.sold` net event 42; repairs never refunded; sell + rebuild = a repair (tested over every building type).
- `not_alive` added to place, repair and upgrade (decision (a)), tested for downed and out.
- Server: `building.sell` through `this.net.guard`, refusals to the sender; `RunRoom.sell.test.ts` round trips (take back, `gone` on repeat, `not_owner`, `not_alive`, `not_build_phase`, malformed dropped).
- Client: undo chip ↶ (10 s, draining ring, armed while pending, sent on match), Sell / Take back in the 3.7 panel, lift-and-fade + "+$N" + coins + 12 ms haptic. Netsim at 150 ± 20 ms: armed undo, sell spam (refunded once), build → wave edge (never sold in a wave, both outcomes reached), armed undo landing at the wave start.
- Bandwidth: one 8-int `building.sold` per sell (a few bytes, only on a sell); no per-tick state. Perf: no per-frame allocation in the undo/sell path (the ring redraws on 1/120 steps, ≈ 12 times/s while shown; strings only on a change or a sell). No new textures (Graphics/Text only), so nothing for `addGeneratedTexture`.
- Not done here: the `Z` shortcut (D9 → 5.25). Not verified: a real phone (thumb reach of (270, 64), Android haptic), the placeholder coins sound by ear, `?stress=150` (no effect added to the wave; the sold FX only runs in build phases).

### File List

- `_bmad-output/implementation-artifacts/5-20-take-back-sell-and-undo.md` (new), `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/shared/src/buildings/sell.ts` (new), `sell.test.ts` (new), `buildings.ts`, `upgrade.ts`, `repair.ts`
- `packages/shared/src/run/runStateMachine.ts`, `core/simEvents.ts`, `net/netEvents.ts`, `net/netEvents.test.ts`, `net/messages.ts`, `net/messages.test.ts`, `index.ts`
- `packages/shared/src/config/balanceSchema.ts`, `config/balance.test.ts`, `config/balance/buildings.json`, `config/balance/controls.json`
- `apps/server/src/rooms/RunRoom.ts`, `rooms/RunRoom.sell.test.ts` (new), `run/RunController.ts`, `net/eventInterest.ts`
- `apps/client/src/sim/SimHost.ts`, `LocalSimHost.ts`, `NetSimHost.ts`, `NetSimHost.sell.test.ts` (new), `NetSimHost.undo.test.ts` (new)
- `apps/client/src/net/session.ts`
- `apps/client/src/scenes/undoChip.ts` (new), `undoChip.test.ts` (new), `buildSpend.ts` (new), `buildSpend.test.ts` (new), `pendingPlacements.ts`, `pendingPlacements.test.ts`, `repairPanel.ts`, `repairPanel.test.ts`, `placement.ts`, `hudModel.ts`, `HudScene.ts`, `GameScene.ts`
- `apps/client/src/input/haptic.ts` (new), `haptic.test.ts` (new); `apps/client/src/render/FxView.ts`, `render/burnCue.ts`; `apps/client/src/audio/placeholderSfx.ts`; `apps/client/src/ui/sizes.ts`
- `docs/art/5-20/` (12 screenshots + README)

### Change Log

- 2026-11-24: Story file created (gds-create-story) and built (gds-dev-story): `building.sell` + shared `sellBuilding` (F2/F3/F4/F9), `not_alive` for place/repair/upgrade, undo chip ↶, Sell / Take back in the panel, sold FX; netsim and browser checks; full gate green. Status → review.
