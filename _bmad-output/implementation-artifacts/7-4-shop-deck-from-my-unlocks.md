# Story 7.4: Shop deck from my unlocks

Status: ready-for-dev

<!-- Epic 7 progression story 4 of 7. Story file 2026-11-24 (gds-create-story, non-interactive) from the real code on master 7385b47. Designer decision D7 (borrowed card: 1 of 6 from a teammate's unlocks I lack) and D8 (no turning unlocks off) are rules here. Replaces Story 5.13's `cardPool` seam. -->

## Story

As a player,
I want my shop to offer only what I've unlocked, plus a chance to try a friend's,
so that unlocks change which choices I get and new friends can try the good stuff.

> **Brief.** EPIC 6 BRIEF lines **1, 2** (the unlock mask is World + schema state: every copy), **3, 4**, **8** (the draw uses only `shop:<slot>:<build>`; same seed + same room = same cards), **9, 10** (no per-tick allocation: the draw stays allocation-free, `shopCards.ts:146-148`), **11** (one u32 per player, set once: ≈ 0 B/s), **17, 19, 27** (RESPECT THE DONE EPIC 5 UI: the card shop and build bar change through their data hooks and one badge, not a rewrite), **29, 31, 32**.

> **Scope:** per-player unlock masks in the World, `cardPool` = my pool, the borrowed slot, build bar / consumables / barricade upgrades filtered and checked on the server, the "Borrowed from <name>" tag, the supply-drop unlock hint on Results (moved here from 7.2, decision 7.2 D6). **Not here:** buying unlocks (7.3), Training (7.5).

## Acceptance Criteria

### Fairness / player-visible rules (each is a test)

- **K1 "My cards come from my unlocks."** Every card I'm offered is a weapon or gear item in my pool (starter + my unlocks), except the one borrowed card. The 5.13 rules stay: no Pistol card, `inShop: false` never drawn, owned items never drawn, no upgrade cards, no locking, exactly `shop.json › cards` (6) draws.
- **K2 "A friend's unlock can show up for me, one card at most."** If a teammate in the room **at build start** has unlocked weapons or gear I haven't (and don't own in this run), exactly one of my 6 cards is drawn from those and tagged "Borrowed from Mo"; I buy it with run money like any card; it counts toward the 1-weapon / 1-gear floor; my unlocks don't change (D7).
- **K3 "Nobody changes my offer mid-build."** A teammate joining, leaving, buying or rerolling never changes my cards; a reroll redraws the borrowed slot from the build-start room (5.13 F1, F2). Same seed + same room → the same cards.
- **K4 "Solo, nothing is borrowed."** A one-player run never has a borrowed card.
- **K5 "Only my unlocked buildings and consumables."** The build bar shows only my unlocked buildings; the always-available section only my unlocked consumables; the server refuses a locked building, consumable or barricade upgrade (`not_unlocked`), never borrowing them.
- **K6 "A new player's shop is a real choice."** With the 13-item starter pool, the offer shows at least 2 different sets across rerolls and Reroll starts enabled (8 card items: Machete, Fire Axe, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Revive kit).
- **K7 "The supply drop gives its weapon even if it's locked,"** and Results tells me: "You used the Grenade Launcher: unlock it for 500".
- **K8 "Unlocks I buy in the lobby count for the run I start."** Progress is read when the host taps Start, not at join.

### Behaviour

1. **Unlock mask per player.** `PlayerState.unlocks` (u32, bit i = `progression.json › unlocks[i]`, 7.3's `unlockMask`). `addPlayer` (`player/player.ts:119-168`) takes an optional `{ unlocks }`; the default for tests, bots and sims is `ALL_UNLOCKED` (every bit; bots keep buying their `bots.json › shoppingList`), and the server always passes the real mask. Schema `PlayerState.unlocks` (u32, set once at run start; `syncState`, stateView key lists, `fakeRoom`, devThrottle StateCopy, NetSimHost mirror), so the client's World knows every player's mask (for the build bar and solo-like reads). 8.1's hold round-trip test covers it.
2. **Run-start progress read** (K8). `RunRoom.onStart` → `startRun` (`RunRoom.ts:656-692`) first loads every member's progress (`progressRepo.get`, in parallel, 2 s timeout) into `RunPlayerInit { playerId, slot, unlocks, training? }`, then builds the `RunController` (`RunController.ts:298-300` passes them to `addPlayer`). A member with no account or a failed read gets the starter mask (0) and the run is still started (decision 7.4 D3). The Start button shows "Starting…" while it loads (≤ 2 s). 7.5 reads Training in the same load.
3. **`cardPool(world, playerId, out)`** (`economy/shopCards.ts:154-158`, the seam): `out[i] = 1` when catalog item `i` is in the player's pool (starter or an unlock whose `items` include it). Precompute per balance+progression a `Uint32Array` "unlock bit needed" per catalog index (0 = starter) so the pool check is `need === 0 || (mask & need) !== 0` — no allocation.
4. **Borrowed slot** (K2, K3, K4). At `drawAllOffers` (build start, `shopCards.ts:256`) snapshot the room: `world.shop.teamMasks` (`Uint32Array(MAX_PLAYERS)`, each present slot's mask) and `world.shop.present` (bitmask of slots in `world.players` + 8.1's held players). In `drawOffer`, **draw 0** is the borrow draw when my borrow list (weapon/gear catalog items in some other present slot's pool, not in mine, not owned) is not empty: a weighted `pick` (same rarity weights) among them; the card is marked borrowed and the lender is the lowest present slot whose pool has it. Otherwise draw 0 is a normal draw. Draws 1–5 as today. Still exactly 6 `rng.next()`. Rerolls (`reroll`, `:391`) use the snapshot, not the live room. `world.shop` gains `borrowed: Uint8Array(MAX_PLAYERS)` (bit c = card c borrowed) and `lender: Uint8Array(MAX_PLAYERS)` (slot, 255 none) in `economy/shopOffers.ts:15-33`. Owned and floor rules count the borrowed card like any other.
5. **Offer message.** `ShopOffered` (`net/messages.ts:355-362`) and `ShopOfferView` (`shopCards.ts:272-282`) gain `borrowed: number` and `lenderName: string` ("" none; the name at build start, so it survives the lender leaving). `rerollHasNew` (`:285-300`) also counts the borrow list (a reroll that could change only the borrowed slot is a new draw).
6. **Card tag** (`ui/ShopScreen.tsx` `Card`, `:174-210`; `CardView` `ui/shopStore.ts:232, 256`): a borrowed card shows "Borrowed from Mo" in its tape row (`:199-202`) — the look is the designer's pick (see "Needs a look?").
7. **Build bar** (K5): `buildBarItems(balance)` (`scenes/buildBar.ts:49-61`, via `shopBuildings`, `economy/shop.ts:59`) gains the player's pool; `GameScene.ts:1273, 1584` pass the local player's mask. Server: `placementError` (`buildings/buildings.ts:320-333`) gains `not_unlocked` (after `unknown_type`/`not_for_sale`) using the **placing** player's mask; `upgradeBuilding` (`buildings/upgrade.ts:59`, `upgradeError` `:33`) refuses `not_unlocked` when the **paying** player lacks `barricade_upgrades` (decision 7.4 D2), and the 5.21 action bar hides the upgrade button for them. Reason text for 5.17's "why it's red" chip: "Locked: unlock it in Progress".
8. **Consumables** (K5): `shopConsumables(balance)` (`economy/consumables.ts:172`; client list `GameScene.ts:1516`; `ShopScreen.tsx:132, 218+`) filtered by pool; `buyConsumable` (`:197-209`) refuses `not_unlocked`.
9. **Supply drop** (K7, 6.9): `giveCrateWeapon` gives the weapon whatever the mask. If the weapon is not in the taker's pool, `PlayerState.lockedUsed` (u8 unlock index, 255 none; the last one) is set; 7.2's `run.rewards` message carries `lockedUsed: { name, price } | null`; Results adds "You used the Grenade Launcher: unlock it for 500" in the Run rewards panel. A borrowed card bought counts too (decision 7.4 D4).
10. **Dev switches.** Server `DEV_UNLOCKS=all|starter` (dev only, beside `DEV_SHOP_ALL`, `run/devShopAll.ts`); client `?unlocks=all|starter` for Practice solo. `DEV_SHOP_ALL` / `?shopall` also implies all unlocked.
11. **Practice solo** pool: the cached progress from 7.3 (`localStorage`), starter if none (decision 7.4 D1). No borrowing (K4).

## Tasks / Subtasks

- [ ] **T1 Shared** (AC 1, 3, 4, 7–9): `PlayerState.unlocks`, `lockedUsed`; `addPlayer` options; `cardPool`; the borrow draw + snapshot; `shopOffers` fields; `not_unlocked` in `ShopError` / placement / upgrade / consumable errors; `meta/pool.ts` helpers from 7.3. Tests in `shopCards.test.ts` (`setup` helper `:17-23` gains per-player masks), `buildings/*.test.ts`, `consumables.test.ts`.
- [ ] **T2 Wire** (AC 1, 5): schema field, every copy (brief 2), message fields, `offerFor`/`readOffer`.
- [ ] **T3 Server** (AC 2, 10): `startRun` progress load (shared with 7.5), "Starting…" state, dev switches, logs `run_started {players: [{accountId, unlocks}]}`.
- [ ] **T4 Client** (AC 6–8, 11): card tag, build bar + consumable filters, action-bar hide, red-chip reason, Results line, practice pool, `?unlocks`.
- [ ] **T5 Sims**: bots and `tenWaveSim` keep `ALL_UNLOCKED` (assert it, so a sim can't silently change); one new sim with starter-only bots runs 10 waves (liveness: waves ended, cards bought).
- [ ] **T6 Gate + hand-back.**

## Dev Notes

### Current state (read before changing)

- **The seam:** `cardPool` (`shopCards.ts:150-158`) writes 1 for every catalog index (`void playerId`). Called by `drawOffer` (`:198`) and `rerollHasNew` (`:291`); both then drop owned items (`ownsIndex` `:130-137`).
- **Catalog** (`:66-92`): weapons minus `shop.excludeFromCards` (`["pistol"]`), then gear with `inShop` true; cached per balance (WeakMap `:55`); index < `NO_CARD` (255).
- **Draw** (`drawOffer`, `:189-253`): `slotOf` (`:119-127`: `"local"`→0, `"p0".."p3"`), `shopStream(world, slot)` (`core/seedStreams.ts:91-104`, throws outside a build phase), dev forced cards first (rev 0, `world.debug.shopCards`), exactly `cards` draws; the floor (`:215-227`): weapon while weapons < floor, then gear, else any; a floor kind with no candidate counts as met and the same random number picks from any kind (the "7.4 fallback" comment, `:215`); no candidate → empty slot (`:228-230`). Sorted in catalog order, empties last; writes `world.shop.cards/build/rev/sold`.
- **Server:** `sendOffer` (`RunRoom.ts:596-600`) via `controller.offerFor` (`RunController.ts:364`), after a buy (`:567`), a reroll (`:587`), and on `build.started` (`sendOffers`, `:603-606`, `:772`). Message `S2C.SHOP_OFFERED` (`messages.ts:85`), owner only.
- **World identity:** `world.players: Map<string, PlayerState>` (`core/world.ts:68`), keys `"p<slot>"` online, `"local"` solo. **No per-player join data reaches the sim today**: `RunController` gets `opts.players = [{ playerId, slot }]` (`RunRoom.ts:676`) and calls `addPlayer` (`RunController.ts:298-300`); `addPlayer` takes `(world, id, x, y)`.
- **Build bar / placement:** `buildBarItems` = `shopBuildings` (skips `forSale: false` and `inShop: false`, `shop.ts:59-70`); `placementError` (`buildings.ts:320-333`): `unknown_type`, `not_for_sale`; `placeBuilding` `:416`; RunRoom `BUILDING_PLACE` `:290` → `controller.placeBuilding` `:434`; `BUILDING_UPGRADE` `:294` → `onUpgradeBuilding` `:470` → `upgradeBuilding` (`upgrade.ts:59`, `upgradeStep` `:25`, `upgradeError` `:33`).
- **Consumables:** `buyConsumable` (`consumables.ts:197-209`) refuses `!inShop` (`not_for_sale`); dispatcher `buyItem` (`shop.ts:190`).
- **Dev:** `DEV_SHOP_ALL` (`devShopAll.ts:9-16`) → `loadDevBalance({ shopAll })` sets `inShop = true` on every gear item and building (`config/devBalance.ts:74-78`; changes the balance version); `DEV_SHOP_CARDS` → `world.debug.shopCards`. Client `?shopall` (`debug/urlOptions.ts:175`, `debug/clientBalance.ts:14-38`).
- **Names on the client:** `NetSimHost.playerInfo(id)` (`sim/NetSimHost.ts:343-349`); a leaver's entry is removed from `state.players`, hence `lenderName` in the message.
- **Tests:** `shopCards.test.ts:17-23` `setup(players, seed, balance)`; `shopCards.testkit.ts:10` `buyForced`.

### Epic 6: check at build time

- **6.9 supply drop** (ready-for-dev): `giveCrateWeapon(world, playerId, weapon, level)` in `economy/shop.ts` beside `buyWeapon` (6.9 AC 5); hook `lockedUsed` there. Its weapon list (`events.json › supplyDrop.weapons`: flamethrower, gas_torch, grenade_launcher, chainsaw, assault_rifle) is all unlockables — the hint will show often for new players, as intended ("try before you unlock").
- **Floodlight** `inShop` (5.10/6.3 flags): the pool filter is an AND with the existing flags, never a replacement.

### Network pass: check at build time

- 8.1's `heldPlayers`: a held teammate counts as present for the borrow snapshot (they're still in the run); their mask is on the held `PlayerState`.
- 8.10/8.11 change `RunRoom` tick/patch code, not the shop path.

### Testing (K1–K8 each a named test)

- K1: 200 seeds × masks (starter, all, random) — every non-borrowed card in the pool, never pistol / `inShop:false` / owned; exactly 6 `rng.next()` (spy on the stream) with and without a borrow list.
- K2: me starter + teammate with Chainsaw → exactly one borrowed card (Chainsaw or another of theirs), `lenderName` "Mo"; it satisfies the weapon floor (no second forced weapon); buying it charges `cardPrice`; my mask unchanged.
- K3: same seed + same masks → identical offers (incl. borrowed bit and lender); teammate removed mid-build → my reroll still borrows from the snapshot; teammate added mid-build → no change until the next build.
- K4: 1-player world → `borrowed === 0` over 200 seeds.
- K5: placement of a locked building → `not_unlocked`; consumable → `not_unlocked`; upgrading a wood barricade without `barricade_upgrades` → `not_unlocked`, with it → ok; build bar list for the starter mask = wood barricade + auto-turret.
- K6: starter mask → ≥ 2 different offers over 5 rerolls; `canReroll` true at the build start.
- K7: crate weapon to a starter player → given, `lockedUsed` set, Results line.
- K8 (server, PGlite): unlock in the lobby, then Start → the run's mask has it.
- Q13 (alignment): a pool that can't fill the gear floor → weapons fill; fewer than 6 items → fewer cards and Reroll off.
- Mutations: draw the borrow card from my own pool → K2 fails; read the live room in `reroll` → K3 fails; skip the server check → K5 fails.

### Beat the rule (reviewer start list)

1. **Cheating:** send `shop.buy` for a locked item not on my offer (`not_in_offer`); place a locked building by message (`not_unlocked`); buy molotovs by message (`not_unlocked`); claim a borrowed card for a different item (`not_in_offer`).
2. **Farming borrowed cards:** a veteran friend joins only to feed a newcomer's shop — allowed (that's the point of D7); a newcomer rerolls to fish for the borrowed Chainsaw — costs reroll money like any reroll. Join/leave a veteran mid-build to change the borrow list → snapshot (K3).
3. **Losing progress:** the database read at Start fails → starter pool tonight (D3), logged; nothing is lost from the account.
4. **Two devices:** unlock on the tablet while the phone is in a run → not in that run (read at Start), next run yes.
5. **Offline:** practice solo uses the cached pool (D1), no borrowing.
6. **Upgrades:** a player without `barricade_upgrades` can't upgrade any barricade (D2), but the barricade's owner (or any teammate with the unlock) still can.

### Notes for the merge

- `shopCards.ts` / `shopOffers.ts`: only this story in Epic 7 changes the draw. 8.4 (Epic 8) snapshots `world.shop` incl. the new arrays.
- `player.ts` `addPlayer` options: 7.5 adds `training` to the same options object; 7.2 adds counters, 8.1 hold fields. One `RunPlayerInit` type shared by 7.4 and 7.5.
- `RunRoom.startRun`: the progress load is written once here (or in 7.5, whichever lands first) and reused by the other.
- `ShopScreen.tsx`: the tag is the only change in the card; 5.28 card art untouched.
- `GameScene.ts` build bar call sites `:1273, :1584`, consumables `:1516`.

### Dependencies

7.1 (accounts), 7.3 (unlock list, `meta/pool.ts`). 7.2 for the Results line (its `run.rewards` message). Epic 6: 6.9 (supply drop) for K7. Network pass: 8.1 (held players in the snapshot). Independent of 7.5 and 7.6 except the shared `startRun` load. No dependency on 7.9–7.12.

### Decisions to confirm (recommended first, alternative after)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.4 D1 | Practice solo's shop | **Your own unlocks (from the phone's last copy)** so you can practise with them (starter items only) |
| 7.4 D2 | Upgrading a barricade without the Barricade-upgrades unlock | **Whoever pays needs the unlock** (even on a teammate's barricade) (anyone may upgrade a barricade whose owner has the unlock) |
| 7.4 D3 | The save server can't be read when the host taps Start | **Play with the starter items tonight, start anyway** (wait up to 2 s, then refuse to start) |
| 7.4 D4 | Results' "unlock it for 500" line | **After a supply-drop weapon or a bought borrowed card** (both are "try before you unlock") (supply drop only) |
| 7.4 D5 | Where the borrowed card sits | **Always the first draw, then sorted with the others (catalog order)** (always shown last) |

### Needs a look?

**Yes: the "Borrowed from <name>" tag on a shop card** (on the 5.13 "police evidence tag" card, C3, in the tape row or as a second tag; must read at 568 × 320 next to the WPN/GEAR label and the 5.28 card art), and the **"Locked: unlock it in Progress"** chip text uses the existing 5.17 chip (no new look). The designer picks the tag from code-drawn proposals before this story is built.

### References

- `epics.md` › Story 7.4; FR47, FR79; GDD › Item and Upgrade System; `docs/ideas/epic-7/proposal.md` § 0 D7, D8, § 4; party notes Round 2–3; Story 5.13 (`5-13-roguelike-card-shop.md`, F1–F9); `6-9-gas-leak-and-supply-drop.md` AC 4–5; alignment Q13.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.4 D1–D5 pending.

### File List

## Change Log

- 2026-11-24: story file created (ready-for-dev).
