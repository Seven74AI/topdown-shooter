# Story 7.4: Shop deck from my unlocks

Status: done

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

- [x] **T1 Shared** (AC 1, 3, 4, 7–9): `PlayerState.unlocks`, `lockedUsed`; `addPlayer` options; `cardPool`; the borrow draw + snapshot; `shopOffers` fields; `not_unlocked` in `ShopError` / placement / upgrade / consumable errors; `meta/pool.ts` helpers from 7.3. Tests in `shopCards.test.ts` (`setup` helper `:17-23` gains per-player masks), `buildings/*.test.ts`, `consumables.test.ts`.
- [x] **T2 Wire** (AC 1, 5): schema field, every copy (brief 2), message fields, `offerFor`/`readOffer`.
- [x] **T3 Server** (AC 2, 10): `startRun` progress load (shared with 7.5), "Starting…" state, dev switches, logs `run_started {players: [{accountId, unlocks}]}`.
- [x] **T4 Client** (AC 6–8, 11): card tag, build bar + consumable filters, action-bar hide, red-chip reason, Results line, practice pool, `?unlocks`.
- [x] **T5 Sims**: bots and `tenWaveSim` keep `ALL_UNLOCKED` (assert it, so a sim can't silently change); one new sim with starter-only bots runs 10 waves (liveness: waves ended, cards bought).
- [x] **T6 Gate + hand-back.**

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

**One record for the merged story 7.4+7.5** (designer 2026-11-25, `docs/story-merges-2026-11-25.md`); the 7.5 file points here. Built with `gds-dev-story` on branch `story-7-4-5` (from `story-7-3` + master), 7.4 first, then 7.5.

### Agent Model Used

Claude (cloud builder session, story-7-4-5).

### Gate

**Gate (R6):** commit `1d7a1c18` (branch `story-7-4-5` = story-7-3 `18a328ad` + this story, merged with master `c26d1bcf`: 7.1 + 7.2 + 8.1) — `npm run typecheck && npm run lint && npm test && npm run build` all green: **466 test files / 4,238 tests passed, 3 files / 23 tests skipped** (opt-in real-PostgreSQL and the other env-gated files), build ok; 8 min 14 s wall, load average 1.9 → 3.1 on 4 cores (no other job). The commit after it only fills this line (docs).

**Gate after the 7.3+7.9 merge (landing gate):** commit `62c817f8` (review fixes c345d13e + master `99ac898f`: 7.3 merged with 7.9) — typecheck, lint, test, build all green: **480 test files / 4,361 tests passed, 3 files / 23 tests skipped**, build ok; 8 min 23 s, load average 1.9 → 4.3 on 4 cores (no other job). Merge notes: `look` (7.9) first, then `unlocks` + the four Training fields in RunState / stateView / fakeRoom; the session's one `progress` object carries `training` next to `look`; the lobby keeps 7.9's SC3 layout with "Starting…" folded into its Start button.

### Tasks → tests (R1: "file > test name")

7.4
- **T1 Shared** — `packages/shared/src/economy/shopUnlocks.test.ts` > "K1 … 200 seeds × starter/all/random masks …", "exactly shop.json › cards rng.next() per offer, with and without a borrow list", "owned items are never drawn …"; "K2 … me starter + Mo with the Chainsaw → exactly one borrowed card …", "never more than one borrowed card, and only items some teammate has and I lack (200 seeds, random masks)"; "K3 … same seed + same masks → identical offers", "the lender leaves mid-build → … my reroll still borrows from the build-start snapshot", "a teammate joining mid-build changes nothing until the next build", "a held teammate (8.1) still lends", "a reroll that could change only the borrowed slot is still a new draw (canReroll)"; "K4 … (200 seeds)"; "K5 placement … not_unlocked", "buying a locked consumable → not_unlocked", "upgrading a wood barricade without Barricade upgrades → not_unlocked; with it → ok (decision 7.4 D2)", "the build bar list for the starter mask = wood barricade + auto-turret …"; "K6 … ≥ 2 different offers over 5 rerolls and Reroll starts enabled"; "K7 a crate Grenade Launcher to a starter player → given, lockedUsed set …"; "Q13 fewer than 6 candidates → fewer cards and Reroll off"; "defaults (T5) addPlayer without options = ALL_UNLOCKED". `packages/shared/src/player/hold.test.ts` > the field table (unlocks, lockedUsed kept across a hold).
- **T2 Wire** — `tools/checks/progressionWiring.test.ts` > "the schema copies (syncState, NetSimHost mirror) carry unlocks and the four Training levels"; `apps/client/src/ui/unlocksTraining.test.ts` > "shop.offered carries borrowed / lender / lenderName; an older server's message reads as none"; `apps/server/src/rooms/RunRoom.progress.test.ts` > "K8 + T5 … the schema carries both"; `apps/server/src/run/shopBandwidth.test.ts` (offer message with the new fields).
- **T3 Server** — `apps/server/src/rooms/RunRoom.progress.test.ts` > "K8 + T5: an unlock and a Training level bought in the LOBBY count …", "decision 7.4 D3: the progress read fails at Start → the run starts anyway with the starter pool and Training 0 (logged)", "K2 + AC 5: Mo (starter) gets one card borrowed from Ana's unlocks, named \"Ana\" in shop.offered", "K7 + decision 7.4 D4: a supply-drop Grenade Launcher … run.rewards says \"unlock it for 500\""; `apps/server/src/rooms/RunRoom.test.ts` > "refuses a start while someone isn't Ready, and starts when everyone is" (`run_started {players: [{accountId, unlocks, training, source}]}`); `apps/client/src/ui/unlocksTraining.test.ts` > "\"Starting…\" … for STARTING_MS after the tap, then back to Start".
- **T4 Client** — `apps/client/src/ui/unlocksTraining.test.ts` > "starter = wood barricade + auto-turret; all = every shop building; cached per mask", "cached unlocks and Training apply; none → starter and 0; ?unlocks / ?shopall / ?training override …", "the cache reader never throws …", "dev switches: ?unlocks=all|starter and ?training=a,b,c,d in dev builds only", "\"You used the Grenade Launcher: unlock it for 500\" when lockedUsed is set …"; `tools/checks/progressionWiring.test.ts` > "GameScene: practice solo starts from my cached progress; the build bar and the shop consumables use my unlocks", "the shop card draws the borrowed tag; Results draws … the unlock line; …" (incl. the action-bar hide in `repairPanel.ts`); `tools/checks/resultsDomLayout.test.ts` > every case now asserts the unlock line (R9, 4 sizes).
- **T5 Sims** — `packages/shared/src/economy/tenWaveSim.test.ts` (asserts the 4 bots keep `ALL_UNLOCKED`); `packages/shared/src/economy/starterBotsSim.test.ts` > "4 bots on the starter pool play all 10 waves (god mode) and buy only starter cards".
- **T6 Gate + hand-back** — the Gate line above; hand-back message to `@parent`.

7.5 (tasks in `7-5-training-boosts.md`)
- **T1 Data + helpers** — `packages/shared/src/meta/training.test.ts` > "max HP 102/104/106/108/110; money 210…250; damage × 1.01…1.05; costs 50…250; level 6 clamps to 5", "the reload tick table for every ammo weapon at levels 0–5 (decision 7.5 D4 …)", "the progression schema refuses a training block out of order …", "Training numbers are part of the balance version (decision 7.5 D3)"; `packages/shared/src/config/progression.test.ts`.
- **T2 Sim** — `packages/shared/src/meta/training.test.ts` > "p0 at 5/5/5/5, p1 at 0: p0 trained, p1 untouched", "level 0 keeps the 5.1 damage table exactly (every weapon × level)", "armor adds on top, unscaled (decision 7.5 D1): Training 5 + Armor II = 160; Training 3 + Armor I bought mid-run = 131"; `tools/checks/progressionWiring.test.ts` > "every player-weapon damage read goes through playerWeaponDamage …", "no team-scaled Training code path exists …", "every reload start in firing.ts uses reloadSecondsFor (5 sites …)".
- **T3 Wire + server** — `apps/server/src/auth/trainRoute.test.ts` > "T3: levels 1–5 cost 50, 100, 150, 200, 250 …; level 6 → maxed …", "beat the rule: { level: 5 } at level 0 → already_trained …; a cost in the body → 400", "not enough → not_enough with need …", "T3 brief 18: the same requestId twice at once → one charge; two devices training the same level at once → one level", "two concurrent trains with Supplies for one → exactly one wins …", "the session reply carries progress.training", "no cookie → 401; the database down → 503 …"; `apps/server/src/rooms/RunRoom.progress.test.ts` > "K8 + T5 …", "T5: a Training level bought DURING the run … is not applied until the next Start".
- **T4 Client** — `apps/client/src/ui/unlocksTraining.test.ts` > "the hub's second tab is Training", "rows: Now / Next with the price, short with need, MAXED at 5 …", "Train → Confirm 50 (3 s) → sending; …", "\"3/20\" with four bars; MAX at 20/20 …"; `apps/client/src/net/localFire.test.ts` > "Story 7.5 (AC 4): the predicted reload at Training reload 5 matches the server" (pistol, shotgun, smg; mutation-checked: a view without `trainReload` fails 3 of them); `tools/checks/hubTrainingDomLayout.test.ts` (R9: 3 cases × 4 sizes); `tools/checks/resultsDomLayout.test.ts` (Train column on every row, 4 sizes).
- **T5 Tests + gate + hand-back** — the Gate line; `packages/shared/src/economy/starterBotsSim.test.ts` > "Training 5 vs 0 on the same seed (log only, brief 15)".

### Debug Log References

- The first master merge (8.1 landed, master force-updated) conflicted in `hudLayout.test.ts`, `RunRoom.reconnect.test.ts`, `sprint-status.yaml`: master's side taken (comments only); a duplicate `NET_PROTOCOL_VERSION` import in `RunRoom.reconnect.test.ts` removed.
- The second master merge (7.1 landed) conflicted in `accountRoutes.test.ts` (join options formatting: master's side) and `sprint-status.yaml`.
- Mutation checks run while building: the predicted reload test with `trainReload` 0 in the view → 3 failures; the K-tests check every borrowed card against "not in my pool" (a borrow drawn from my own pool fails K2).

### Completion Notes List

- Story files written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.4 D1–D5 and 7.5 D1–D5 accepted 2026-11-25.
- **Unlock mask in the World** (`PlayerState.unlocks`, u32, set once) and the pool check `need === 0 || (mask & need) !== 0` from a per-catalog `Uint32Array` (no allocation in the draw). `cardPool` is the 5.13 seam, now my pool.
- **Borrowed card** (D7): `drawAllOffers` snapshots `world.shop.teamMasks` / `present` (players + 8.1 held) at the build start; the first real draw picks from the borrow list (same rarity weights, still one `rng.next()`), counts toward the floor, `world.shop.borrowed/lender` mark it; rerolls read the snapshot. `shop.offered` gains `borrowed`, `lender`, `lenderName` (the run-start name).
- **`not_unlocked`** in placement (placer's mask), consumables and barricade upgrades (payer = owner, D2); the 5.17 chip text "Locked: unlock it in Progress"; the action bar hides Upgrade for a player without the unlock.
- **Supply drop** gives its weapon whatever the mask; `lockedUsed` (also after buying a borrowed card, D4) → `run.rewards.lockedUsed` → Results group 3 "You used the Grenade Launcher: unlock it for 500".
- **Run-start read** (`meta/runStart.ts`, shared by 7.4 and 7.5): parallel `progressRepo.get` at Start, 2 s each; a failed read plays starter / Training 0 (D3, logged `run_progress_read_failed`); `run_started` logs each player's accountId, unlocks, training and source. Dev: `DEV_UNLOCKS=all|starter` (dev only; `DEV_SHOP_ALL` implies all), client `?unlocks=`, `?training=`.
- **Training** (D6: in full, only to its owner): `progression.json › training` folded into `balanceVersion` (one bump, `760b0734`); max HP and start money at creation, `effectiveMaxHp(balance, mask, trainHp)` (armor on top, D1), `playerWeaponDamage` at melee / bullets / flames / launcher (D2), `reloadSecondsFor` at the five reload starts and in the client's predicted reload (D4: whole ticks). `POST /account/training` (one conditional update in `boundedTransaction`, request-id memo, limits); session reply carries `progress.training`.
- **Client**: BT1 tag on the 5.13 card tape, build bar / consumables of my unlocks, Practice solo from the cached progress (D1, T2), TR1 Training tab (pips, Now/Next · price, Train → Confirm → spinner, MAXED, offline line), TL3 "Train" column on Results, "Starting…" on the host's Start.
- **Bandwidth**: `unlocks` (u32) + 4 × u8 written once at run start (≈ 0 B/s); `shop.offered` grows by three small fields (≈ 25 B per offer, a few per build phase).
- Screenshots (568×320 @2×): `docs/art/epic-7/built/7-4-5-shop-borrowed.png`, `7-4-5-training-tab.png`, `7-4-5-results-training.png`.
- Build-time choices 7.4 B1–B10 and 7.5 B1–B8: `docs/epic-7-decisions.md › Story 7.4+7.5 build-time choices`, each "auto-accepted (designer: follow the GDS recommendation)".

### Notes for the merge

- **Balance version bumped once** (7.5 D3): `bbdd6c4d` → `760b0734` (Training numbers in the hash; `config/balance.ts` now imports `PROGRESSION`). Clients and server must deploy together; a stale tab sees "Please reload".
- **No migration** (`progress.training` jsonb is in 7.1's `0000_init`); 7.9's 0002 is untouched.
- `player/player.ts › addPlayer(world, id, x, y, init?)` and `PlayerInit` — 7.6 / 7.10 / 8.2 add fields to the same object. Six new `PlayerState` fields (`unlocks`, `lockedUsed`, `trainHp/Dmg/Money/Reload`); `hold.test.ts` field table updated.
- `RunRoom.ts`: `onStart` now calls `loadAndStart()` (async: Start → read → `startRun(inits)`); `startRun` builds players with masks + Training; `runNames`; `sendOffer` adds the lender's name; the quit bank passes `lockedUsed`. Tests that need every item in a room set `DEV_UNLOCKS=all` (buildings / shop / upgrade room tests).
- Schema `PlayerState` appends `unlocks` (u32) and `trainHp`, `trainDmg`, `trainMoney`, `trainReload` (u8) after `protectTicks`; `syncState`, `resetPlayer`, `stateView` keys, `fakeRoom`, NetSimHost mirror updated (devThrottle copies by the key list).
- `economy/shopCards.ts`, `shopOffers.ts`: `world.shop` gains `borrowed`, `lender`, `teamMasks`, `present`; `snapshotShop` includes them (8.4 snapshots `world.shop`). `ShopOfferView` / `ShopOffered` gain `borrowed`, `lender`, `lenderName`.
- `ShopError`, `PlaceError`, `UpgradeError` gain `not_unlocked` (client lists in `net/session.ts`, texts in `placement.ts`, `repairPanel.ts`, `shopStore.ts`).
- `combat/weapons.ts › playerWeaponDamage`, `reloadSecondsFor`: any NEW player-weapon damage or reload site must use them (`tools/checks/progressionWiring.test.ts` greps).
- `economy/gear.ts › effectiveMaxHp(balance, mask, trainHp = 0)`.
- `net/account.ts` (shared): `progressViewSchema.training` (optional record), `ACCOUNT_TRAINING_PATH`, `trainRequestSchema`, `trainResponseSchema`. `run.rewards` schema gains optional `lockedUsed`.
- `auth/unlock.ts`: `RequestMemo<T>` is generic; `toView` adds `training` (all four boosts). `/account/unlock` route tests expect `training` in `progress`.
- Client: `hubModel.ts › HUB_TABS` has Training second (7.10 adds Survivor third); `ProgressScreen.tsx` tab switching; `ResultsScreen.tsx` Train column (4th `col`) and group 3 unlock line (7.7 appends its line after it, brief 26); `buildBarItems(balance, unlocks)`; `GameScene.localUnlocks`.
- `replay/inputLog.ts`: `InputLog.inits?`, `createHeadlessWorld(…, map, inits?)`; `runHeadless({ inits })`.
- Stories that depend on borrowed cards / Training: 8.2 (mid-run joiner: Training start money vs "100 + 60 % of the team average" is 8.2's call).

### Not verified

- Real phones (Xiaomi Mi 11i, iOS Safari), the VPS / PostgreSQL 18 (only PGlite here); the opt-in real-PostgreSQL test file (`realPostgres.test.ts`, `TEST_DATABASE_URL`) has no Training case yet.
- `?stress=150` before/after and `PERF_ASSERT=1` tick asserts were not re-run for this story (the draw runs only at build start / reroll; no per-tick code added except the unchanged-cost `playerWeaponDamage` multiply).
- `?lag=150&jitter=20&loss=1`, hidden-tab sleep and a reconnect during the run-start read were not tried in a browser (the hold round-trip of the new fields is unit-tested).
- The shop with a borrowed card is not in a DOM layout test (only the screenshot at 568×320); the TR1 tab and the TL3 column are (4 sizes).

### File List

- `_bmad-output/implementation-artifacts/7-4-shop-deck-from-my-unlocks.md` (modified)
- `_bmad-output/implementation-artifacts/7-5-training-boosts.md` (modified)
- `apps/client/src/debug/urlOptions.test.ts` (modified)
- `apps/client/src/debug/urlOptions.ts` (modified)
- `apps/client/src/net/account.ts` (modified)
- `apps/client/src/net/fakeRoom.ts` (modified)
- `apps/client/src/net/localFire.test.ts` (modified)
- `apps/client/src/net/localFire.ts` (modified)
- `apps/client/src/net/onlineFlow.test.ts` (modified)
- `apps/client/src/net/onlineFlow.ts` (modified)
- `apps/client/src/net/practicePool.ts` (new)
- `apps/client/src/net/progressStore.test.ts` (modified)
- `apps/client/src/net/session.ts` (modified)
- `apps/client/src/scenes/GameScene.ts` (modified)
- `apps/client/src/scenes/buildBar.ts` (modified)
- `apps/client/src/scenes/placement.ts` (modified)
- `apps/client/src/scenes/repairPanel.ts` (modified)
- `apps/client/src/sim/NetSimHost.shop.test.ts` (modified)
- `apps/client/src/sim/NetSimHost.ts` (modified)
- `apps/client/src/ui/LobbyScreen.tsx` (modified)
- `apps/client/src/ui/ProgressScreen.tsx` (modified)
- `apps/client/src/ui/ResultsScreen.tsx` (modified)
- `apps/client/src/ui/ShopScreen.tsx` (modified)
- `apps/client/src/ui/hubModel.test.ts` (modified)
- `apps/client/src/ui/hubModel.ts` (modified)
- `apps/client/src/ui/overlay.css` (modified)
- `apps/client/src/ui/rewardsModel.ts` (modified)
- `apps/client/src/ui/shopStore.test.ts` (modified)
- `apps/client/src/ui/shopStore.ts` (modified)
- `apps/client/src/ui/startButton.ts` (new)
- `apps/client/src/ui/uiState.ts` (modified)
- `apps/client/src/ui/unlocksTraining.test.ts` (new)
- `apps/server/src/app.ts` (modified)
- `apps/server/src/auth/accountRoutes.ts` (modified)
- `apps/server/src/auth/guestSession.ts` (modified)
- `apps/server/src/auth/train.ts` (new)
- `apps/server/src/auth/trainRoute.test.ts` (new)
- `apps/server/src/auth/unlock.ts` (modified)
- `apps/server/src/auth/unlockRoute.test.ts` (modified)
- `apps/server/src/db/progressRepo.ts` (modified)
- `apps/server/src/meta/banking.ts` (modified)
- `apps/server/src/meta/runStart.ts` (new)
- `apps/server/src/net/limits.ts` (modified)
- `apps/server/src/net/rateLimit.ts` (modified)
- `apps/server/src/rooms/RunRoom.buildings.test.ts` (modified)
- `apps/server/src/rooms/RunRoom.progress.test.ts` (new)
- `apps/server/src/rooms/RunRoom.reconnect.test.ts` (modified)
- `apps/server/src/rooms/RunRoom.shop.test.ts` (modified)
- `apps/server/src/rooms/RunRoom.test.ts` (modified)
- `apps/server/src/rooms/RunRoom.ts` (modified)
- `apps/server/src/rooms/RunRoom.upgrade.test.ts` (modified)
- `apps/server/src/rooms/schema/RunState.ts` (modified)
- `apps/server/src/rooms/schema/syncState.ts` (modified)
- `apps/server/src/run/RunController.ts` (modified)
- `apps/server/src/run/shopBandwidth.test.ts` (modified)
- `docs/art/epic-7/built/7-4-5-results-training.png` (new)
- `docs/art/epic-7/built/7-4-5-shop-borrowed.png` (new)
- `docs/art/epic-7/built/7-4-5-training-tab.png` (new)
- `docs/epic-7-decisions.md` (modified)
- `packages/shared/src/bots/botShop.test.ts` (modified)
- `packages/shared/src/bots/headlessRun.ts` (modified)
- `packages/shared/src/buildings/buildings.ts` (modified)
- `packages/shared/src/buildings/upgrade.ts` (modified)
- `packages/shared/src/combat/firing.ts` (modified)
- `packages/shared/src/combat/flame.ts` (modified)
- `packages/shared/src/combat/grenades.ts` (modified)
- `packages/shared/src/combat/weapons.ts` (modified)
- `packages/shared/src/config/balance.ts` (modified)
- `packages/shared/src/config/progression.json` (modified)
- `packages/shared/src/config/progression.test.ts` (modified)
- `packages/shared/src/config/progression.ts` (modified)
- `packages/shared/src/economy/consumables.ts` (modified)
- `packages/shared/src/economy/gear.ts` (modified)
- `packages/shared/src/economy/shop.ts` (modified)
- `packages/shared/src/economy/shopCards.ts` (modified)
- `packages/shared/src/economy/shopOffers.ts` (modified)
- `packages/shared/src/economy/shopUnlocks.test.ts` (new)
- `packages/shared/src/economy/starterBotsSim.test.ts` (new)
- `packages/shared/src/economy/tenWaveSim.test.ts` (modified)
- `packages/shared/src/index.ts` (modified)
- `packages/shared/src/meta/pool.ts` (modified)
- `packages/shared/src/meta/training.test.ts` (new)
- `packages/shared/src/meta/training.ts` (new)
- `packages/shared/src/net/account.ts` (modified)
- `packages/shared/src/net/messages.ts` (modified)
- `packages/shared/src/net/stateView.ts` (modified)
- `packages/shared/src/player/hold.test.ts` (modified)
- `packages/shared/src/player/player.ts` (modified)
- `packages/shared/src/replay/inputLog.ts` (modified)
- `tools/checks/hubTrainingDomLayout.test.ts` (new)
- `tools/checks/progressHubWiring.test.ts` (modified)
- `tools/checks/progressionWiring.test.ts` (new)
- `tools/checks/resultsDomLayout.test.ts` (modified)

## Senior Developer Review (AI)

**Reviewer:** fresh cloud reviewer session (`gds-code-review`, full three layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor + beat the rule), 2026-11-25. **Tree:** `review-7-4-5` = `origin/story-7-4-5` 8d1afe21 merged with master (clean). **Own changes reviewed:** `git diff origin/story-7-3...origin/story-7-4-5` (7.3 and the 8.1 hunks from the master merge not reviewed). **Checks run (no full gate, HANDOFF §3):** `npm ci`, `npm run typecheck` green; the story's tests (`shopUnlocks`, `training`, `trainRoute`, `localFire`, `progressionWiring`, `unlocksTraining`, `hubTrainingDomLayout`, `resultsDomLayout`, `RunRoom.progress`, `replay`, `starterBotsSim`) green; `realPostgres.test.ts` + `realPg.test.ts` on a real PostgreSQL 16 (`TEST_DATABASE_URL`) 20/20 green; reviewer probes in `_bmad-output/implementation-artifacts/7-4-5-review-probes/` (shared 9, room 4, real PostgreSQL 6: all green; mutation script `mutations.py.txt`). Load ≈ 1–2 on 4 cores.

### Verdict

**Approved — no high, no medium.** The rules hold under every exploit tried: at most one borrowed card per offer, only from the build-start snapshot (incl. 8.1 holds), never something nobody present has; the server refuses locked buildings, consumables and barricade upgrades (placer / payer = owner); Training is bought exactly once per level on real PostgreSQL under races, applied in full, only to its owner, never to turrets; replays with `inits` reach the same digest. Nine lows / nits below (four are test gaps found by surviving mutations, one is a small HUD bug). Per the re-review cap these go to the main session (one-line or test-only fixes; L5 is a one-line client fix).

### Findings

| ID | Sev | Where | Scenario | Minimal fix |
| --- | --- | --- | --- | --- |
| L1 | Low (test) | `packages/shared/src/economy/shopUnlocks.test.ts:195-201` | "a reroll that could change only the borrowed slot is still a new draw (canReroll)" is vacuous: the starter pool still has 2 unshown items, so `canReroll` is true without the borrow block. Mutation M3 (`if (false && fillBorrow(...))` in `rerollHasNew`) **survives** the story's tests. The code is right (probe P9: pool spent, only the borrow list has something new → `canReroll` true; M3 kills P9). | Replace the test body with probe P9 (`shared.probe.ts.txt`: pistol + SMG carried, Armor I / shoes / revive kit owned, Mo has chainsaw + assault rifle → 5 cards, `canReroll` true). |
| L2 | Low (test) | `packages/shared/src/replay/inputLog.ts:123` (B10) | No test replays a log with `inits`. Mutation M20 (`replayRun` ignores `log.inits`) **survives** `replay.test.ts` + `starterBotsSim.test.ts`; brief 5 says a Training run must replay to the same digest. Probe P6: Training 5 + starter vs all-unlocked recording replays to the same digest with `inits`, and a different one without (kills M20). | Add P6 to `replay.test.ts`. |
| L3 | Low (test) | `apps/server/src/auth/train.ts:68` | The request memo key is `accountId:requestId` (correct, curl-verified: the same id from account B is a new purchase). Mutation M18 (key = `requestId` only) **survives** `trainRoute.test.ts`; that regression would hand account B account A's answer (A's Supplies and levels: a privacy leak) and skip B's purchase. | One route test: two accounts, one `requestId` → both charged, each sees its own progress. |
| L4 | Low (test) | `apps/server/src/rooms/RunRoom.ts` `startRun` (B6) | `DEV_STARTING_WALLET` zeroes Training start money on the server; mutation M23 (keep Training money) **survives** every test (the client side, `practicePool.ts:34`, is tested). Dev-only, so low. | A unit test of the init mapping (extract `playerInitsFor(members, inits, devMask, devWallet)` or a room test with the env set). |
| L5 | Low | `apps/client/src/scenes/GameScene.ts:2198` | The HUD reload ring's total is the **untrained** `ticksFor(stats.reloadS)` while the server/predicted reload is trained (`reloadSecondsFor`). At Training reload 5 a 1.5 s reload is 29 ticks of 30: the ring starts at ~3–5 % and jumps; no gameplay effect, but it is the one reload read the "every reload site uses reloadSecondsFor" rule missed (`progressionWiring` greps `firing.ts` only). | `ticksFor(reloadSecondsFor(player, stats))`, and add `GameScene.ts` to the reload grep. |
| L6 | Low (rule to confirm) | `packages/shared/src/economy/shopCards.ts:268-275` (D7) | Probe P2: buy the borrowed card, reroll, buy the next borrowed card → in **30/30 seeds** a starter player bought ≥ 2 borrowed items in one build (a loadout can end up entirely borrowed). The code meets the letter of D7/K2 ("one of my 6 cards", per offer; each reroll costs money); the proposal's "each build, 1 of your 6 cards" can also be read per build. | No code change unless the designer wants "one borrowed purchase per build"; log as a B-code (R7) so the reading is explicit. |
| L7 | Low (visual) | `apps/client/src/ui/ShopScreen.tsx:204`, `overlay.css:877-896` | A lender in slot 2 (orange `#ff8a1f`) gets an orange badge on the amber tape (`#f59a23`): only a 1 px shadow separates them (visible in `7-4-5-shop-borrowed.png`, "2 FROM MO"). Brief 24: the orange player slot must not be confused with the orange accent. | A dark 2 px ring (or charcoal inset) around `.shop-card__lender`. |
| L8 | Low (test / R9) | shop card, BT1 | The borrowed card is in no DOM layout test (Dev Agent Record "Not verified"); only the screenshot at 568×320. A 16-character lender name ellipsizes (`.shop-card__from`), unchecked at 640/800/844. | Add a borrowed-card case (16-char name) to the shop's DOM layout test at the four R9 sizes. |
| N1 | Nit (docs) | `docs/art/epic-7/lumen/picks/bt1.png` | The BT1 pick sheet still shows **two** borrowed cards ("FROM MO" + "FROM KIT"); the rule is 1 (D7). The build is right (one). | Annotate or redraw the pick sheet so later builders don't copy the 2. |
| N2 | Nit (visual) | `ProgressScreen.tsx` Training rows vs TR1 | "Next: +8 % max HP · 200" has no Supplies icon (TR1 and the Unlocks rows have one); the boost's line is a tooltip only (B5, accepted). | Add the Supplies icon before the price. |
| N3 | Nit | `apps/server/src/auth/train.ts:66` | A replayed `requestId` with a different boost/level returns the first answer (`boost: "damage"` for a `max_hp` body). Same as 7.3's memo; only a modified client can hit it; nothing is charged. | None (or key the memo by the body too). |

### Beat the rule (every attempt, result)

| # | Attempt | Result |
| --- | --- | --- |
| 1 | More than one borrowed card: 20 seeds × 30 rerolls, three teammates with different extras (P1) | ≤ 1 per offer always; every borrowed card is a lender's extra and not in my pool; lender slot right (2 for the AR, 1 for Mo's) — **held** |
| 2 | Two borrowed cards by code (M10: borrow on draws 0 and 1) | caught by 3 story tests — **held** |
| 3 | Lender held at build start, returns mid-build (P3) | my offer unchanged; the lender's own offer borrows nothing — **held** |
| 4 | I am held at build start, return mid-build: lazy offer (P4) | borrows from the snapshot, exactly 1 — **held** |
| 5 | Lender leaves the room mid-build, I reroll (room probe RP3) | the reroll still borrows; `lenderName` still "Ana" — **held** (K3) |
| 6 | Teammate joins mid-build | no change until the next build (story test) — **held** |
| 7 | Borrow something nobody present owns | `fillBorrow` reads only snapshot slots; P1 + M9 (held players dropped from the snapshot) caught — **held** |
| 8 | Reroll to farm borrowed cards (P2) | each reroll costs its price; one borrowed card per offer; a second borrowed buy per build is possible → **L6** (rule reading) |
| 9 | Modified client: `shop.buy_item` molotovs, `building.place` spike trap, `shop.buy` chainsaw not on offer (RP4, with a positive control: wood barricade + medkit accepted) | all refused, wallet unchanged — **held** |
| 10 | Upgrade a barricade without Barricade upgrades / a teammate's barricade | `not_unlocked` (payer = owner, D2/B5) / `not_owner`; Upgrade hidden in the action bar — **held** |
| 11 | Supply drop locked weapon → Results line | `lockedUsed` set, `run.rewards.lockedUsed` "unlock it for 500" (room test); passed on the quit bank and the held-seat bank too — **held** |
| 12 | `POST /account/training` by curl on real PostgreSQL: level 5 at 0; cost in body; unknown boost; level 0 / −1 / 1.5 / 11 / "1"; no / bad cookie | `already_trained` (nothing charged); 400 ×7; 401 ×2 — **held** |
| 13 | Same `requestId` ×5 at once | one charge (600 → 550), five identical answers — **held** |
| 14 | Same `requestId` from a second account | its own purchase (key includes the account) — **held** (untested → L3) |
| 15 | Level 9 at 0; maxed at 5 (R6) | `maxed`, never charged — **held** |
| 16 | 25 calls/min on one account | 19 answers then 429 (20/min), one `train_rate_limited` log line; no token in the log — **held** |
| 17 | Real PostgreSQL races (R1–R5, ×10 each): 10 same-level trains; 4 boosts with Supplies for one; 4 boosts with Supplies for all (jsonb_set on the re-checked row keeps all four); train + unlock with Supplies for one; levels 1–5 at once | exactly one / one / all four kept / one / only level 1 — **held** |
| 18 | Run-start read hangs (RP1) | run starts after 2.06 s with starter + Training 0; a second Start during the read ignored; one read — **held** (D3) |
| 19 | Run-start read slow 1.5 s (RP2) | the real unlocks are used — **held** |
| 20 | Training applied in full, only to me (P7, story tests; M14 "team lowest" caught) | 4 × max: 110 HP (160 with Armor II), $250, ×1.05 damage, ×0.95 reload each; a level-0 teammate untouched — **held** |
| 21 | Bad saved levels (99, −3, 7.9, NaN) (P8) | clamped to 5/0/5/0 — **held** |
| 22 | Turrets / traps / mines / thrown items trained? | turret damage reads `stats.damage`; no Training — **held** (D2) |
| 23 | Every damage / reload site (grep + M11, M12 caught) | melee, bullets, flame (incl. ignite share), launcher, 5 reload starts — **held**; HUD reload ring missed → **L5** |
| 24 | Predicted reload vs server (M19 caught by `localFire.test.ts`) | same ticks at Training 5; `?lag=150&loss=1` in a browser **not run** (unit-level only) |
| 25 | `DEV_STARTING_WALLET` / `?wallet` vs Training money | server and practice zero Training money (dev wins, B6); server path untested → **L4** |
| 26 | Replay with `inits` (P6) | same digest with inits, different without — **held** (untested in the story → **L2**) |
| 27 | TR1 tab / TL3 column at 568×320 + 3 sizes | layout tests green and mutation-checked — **held** |

### Mutations (each new test once)

M1 borrow from my own pool — killed · M2 reroll reads the live room — killed · **M3 canReroll ignores the borrow list — survived the story's tests (L1)**, killed by P9 · M4 placement skips `not_unlocked` — killed · M5 upgrade skips it — killed · M6 consumable skips it — killed · M7 crate never sets `lockedUsed` — killed · M8 borrowed buy never sets it — killed · M9 snapshot skips held players — killed · M10 two borrowed cards — killed · M11 damage ignores Training — killed · M12 swap reload site untrained — killed (wiring grep) · M13 armor buy drops the trained base — killed · M14 team-lowest Training — killed · M15 start money ignores the level — killed · M16 train SQL without the level guard — killed · M17 without the Supplies guard — killed · **M18 memo key without the account — survived (L3)** · M19 predicted reload untrained — killed · **M20 replay ignores `inits` — survived the story's tests (L2)**, killed by P6 · M21 failed read → all unlocked — killed · M22 empty `lenderName` — killed · **M23 dev wallet keeps Training money — survived (L4)** · M24 action bar shows Upgrade without the unlock — killed · M25 build bar ignores my mask — killed · CSS: Training pips 56 → 156 px — 12/12 layout cases failed (killed) · Train column 12 → 9 px — 8/8 failed (killed).

### Brief lines checked

2 (all six fields: schema, syncState, stateView keys, fakeRoom, mirror, hold round trip; `progressionWiring` + `hold.test.ts`), 5 (replay with inits, L2), 7 (numbers in `progression.json`), 15 (route + room server truth), 16 (balance version bumped once `bbdd6c4d` → `760b0734`, `training.test.ts`), 18 (one bounded transaction, races on real PostgreSQL), 20 (2 s, off the tick, starter on failure), 22 (one borrowed card per offer; Training in full; L6 reading), 24 (BT1 / TR1 / TL3 vs picks: L7, N1, N2), R1 (every ticked task names tests; opened), R6 (Gate line present), R9 (TR1/TL3 in layout tests; the borrowed shop card is not: L8).

### Not verified by the reviewer

A real browser under `?lag=150&jitter=20&loss=1`, hidden tab, real phones / iOS Safari, `?stress`, PostgreSQL 18 (16 used).

### Review fixes (round 1, builder; checked by the main session under the re-review cap)

| Finding | Fix | Test (file > test name) |
| --- | --- | --- |
| L1 vacuous canReroll borrowed-slot test | replaced by the reviewer's probe P9 (my pool spent except what is on offer; only the borrow list has more) | `packages/shared/src/economy/shopUnlocks.test.ts` > "a reroll that could change only the borrowed slot is still a new draw (canReroll; review L1 = probe P9)" |
| L2 no replay test for `inits` | probe P6 added | `shopUnlocks.test.ts` > "a Training 5 + starter recording replays to the same digest with its inits, and differs without them" |
| L3 two accounts, one requestId on `/account/training` | test added (the memo key is `accountId:requestId`; no code change) | `apps/server/src/auth/trainRoute.test.ts` > "review L3: accounts A and B sending the SAME requestId → each gets its own answer and is charged once" |
| L4 `DEV_STARTING_WALLET` zeroing Training money untested | the init mapping extracted to `meta/runStart.ts › runPlayers` (RunRoom calls it) | `apps/server/src/meta/runStart.test.ts` > "DEV_STARTING_WALLET zeroes Training's start money only (decision 7.5 B6); DEV_UNLOCKS replaces every mask" (+ the mapping and `pickDevUnlocks` cases) |
| L5 the HUD reload ring divided by the untrained reload | `GameScene.ts` uses `ticksFor(reloadSecondsFor(player, stats))` | `tools/checks/progressionWiring.test.ts` > "every reload start in firing.ts uses reloadSecondsFor …" (now also greps GameScene: no raw `ticksFor(stats.reloadS)`) |
| L6 a second borrowed purchase via a paid reroll | no code change: recorded as **7.4 B11** (≤ 1 borrowed card per offer, the letter of D7), auto-accepted, designer may override | — (decision log) |
| L7 orange slot-2 badge melts into the amber tape (7-UI-4) | dark 2 px ring on `.shop-card__lender`; `7-4-5-shop-borrowed.png` refreshed | `tools/checks/shopBorrowedDomLayout.test.ts` (screenshot checked by eye) |
| L8 borrowed card not in a DOM layout test | new real-browser test, 2 cases (Mo; a 16-character lender) × the 4 R9 sizes | `tools/checks/shopBorrowedDomLayout.test.ts` > "… the tag inside its card's tape, text ≥ 11 px" |
| N1 BT1 still shows two borrowed cards | note in `docs/art/epic-7/README.md` ("the rule is 1 borrowed card of 6") | — |
| N2 no Supplies icon on the Training "Next" price | `.tr-next .rw-crate` gets a box (inline span) | `tools/checks/hubTrainingDomLayout.test.ts` (re-run, 12 passed); `7-4-5-training-tab.png` refreshed |
| N3 | left as is (the 7.3 pattern) | — |

Checks after the fixes: `npm run typecheck`, `eslint` clean; touched tests green (shopUnlocks 21, trainRoute, runStart, RunRoom.progress, RunRoom, progressionWiring, the three hub/shop DOM layout tests, `apps/client/src/ui`: 20 files / 221 tests). No full gate yet (main session: after 7.3 lands).

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: built with 7.5 (merged story) on `story-7-4-5`; status review.
- 2026-11-25: Senior Developer Review (AI): approved, 8 lows + 3 nits (no high/medium); probes in `7-4-5-review-probes/`.
- 2026-11-25: review round 1 (approved, lows only): L1–L5, L7, L8, N1, N2 fixed with a test each; L6 recorded as 7.4 B11.
