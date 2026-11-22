# Story 3.3: Fixed-list shop

Status: review

## Story

As a player,
I want to buy weapons from a shop during the build phase,
so that I can change my loadout as the run goes on.

> **Decisions taken while writing this story (no designer questions; recorded here, the designer can change them):**
> - **D1 Price source.** Weapon prices stay where they already are (`weapons.json › <id>.price`: Pistol 0, Machete 150, SMG 200, Hunting Rifle 350). The new balance block `shop.json` only lists **which** weapons the fixed shop offers and in which order (`{ "weapons": ["pistol", "machete", "smg", "hunting_rifle"] }`). One number, one place. `loadBalance` refuses a shop id that is not a weapon.
> - **D2 Pistol.** Listed first, price 0, shown as **Owned** while it is in a slot. A player who replaced it can take it back for free (into an empty slot, or replacing a weapon, which is then lost). No exploit: it only ever costs a slot.
> - **D3 Slots.** A purchase fills the empty second slot first. Only when both slots are full does the shop ask "Replace which?" (the two weapons, plus Cancel). The replaced weapon is lost (no selling). A weapon already in a slot can't be bought again (`already_owned`).
> - **D4 The new weapon** comes with a full magazine and no cooldown. It takes the slot it replaces; the active slot index does not change (replacing the weapon in my hands puts the new one in my hands). A swap in progress is left alone.
> - **D5 Messages.** C2S `shop.buy { weapon, slot? }`; the server answers the sender only with S2C `shop.bought { weapon, slot }` or `shop.refused { weapon, error }`. Wallet and weapons come back through the existing schema fields (`wallet`, `weapon0/1`, `ammo0/1`): **no new schema field**.
> - **D6 While the shop is open** my survivor stands still (input neutralised, as under the in-run menu); online the run goes on, solo practice is **not** paused (the build countdown keeps going, as online). Ready and Shop HUD buttons are hidden; the countdown stays. Esc, ☰ or the shop's Close button close it.
> - **D7 One purchase in flight.** While a purchase waits for its answer, the item buttons are disabled (edge action fires once per tap); the wait ends with the answer, or after 3 s without one.
> - **D8 Dev loadout.** The Story 1.8 start-of-run picker is removed. Dev cheats (⚙, solo) get a **Loadout** row (two selects + Set) and **+500 money**. Online checks use a new dev balance switch `startingWallet` (`DEV_STARTING_WALLET` on the server, `?wallet=` on a dev client, same `balance.version`), like `?zdmg` (retro A5 / brief line 19). `?loadout=a,b` (solo, release-safe) stays.
> - **D9 Shop button**: "Shop", 120 × 52 CSS px, to the right of Ready (gap 12 px); the pair is centred at the bottom.
> - **D10 Display names** (added while building): weapons get an optional `name` in `weapons.json` ("SMG", "Hunting Rifle"…; not a gameplay number); `weaponName()` falls back to the id in Title Case. Buildings use the same rule (3.4 contract).

## Acceptance Criteria

1. **Shop opens in a build phase only.** Given a build phase, when I tap **Shop**, a Preact shop screen opens listing Pistol (Owned / free), Machete 150, SMG 200, Hunting Rifle 350, with prices read from balance data, and my wallet. Outside a build there is no Shop button and the shop can't open. [epics › 3.3 AC 1]
2. **Touch zones.** The shop overlay leaves the screen's touch zones usable when closed: nothing of it is in the DOM (or it is `pointer-events: none`) while closed; `#ui` stays `pointer-events: none`. [AC 1]
3. **Buying.** Buying a weapon with enough money puts it in my loadout and takes its price from my wallet (server-validated online; the same shared function solo). An empty second slot is filled first. When both slots are full I choose which slot it replaces; the replaced weapon is lost. [AC 2]
4. **Refusal.** Tapping an item I can't afford sends the purchase; the server validates it and returns a `Result` error (`insufficient_funds`); the shop shows **"Not enough money"** and nothing changes. Other refusals show short texts (already owned, shop closed). [AC 3]
5. **Auto-close.** When a wave starts (phase leaves `build`) the open shop closes by itself (also on Results, leaving, and a late or restarted Game scene). [AC 4]
6. **Dev loadout.** The dev loadout picker moves to the dev cheats; normal runs (dev and release) start with the Pistol only. [AC 5]
7. **Buildings (contract with 3.4).** The shop lists, below the weapons, every building type of `balance.buildings` if that block exists (each with `price` and a display name); until 3.4 adds it the section is not shown. Tapping a building does **not** buy it: it calls `uiStore.request("startPlacement", buildingTypeId)` and closes the shop.
8. **Server rules (retro brief 7–9).** `shop.buy` goes through `this.net.guard(schema, handler)` (the shared "other" rate bucket); a burst of > 25 messages/s never spends more than the wallet nor buys a weapon twice; every refusal is a `Result` error sent back to the sender.

## Tasks / Subtasks

- [x] **Task 1: Balance** (AC 1, 7)
  - [x] `config/balance/shop.json` `{ "weapons": ["pistol", "machete", "smg", "hunting_rifle"] }`; `shopSchema` (strict, non-empty array of balance ids, no duplicates); `shop` in `balanceFileSchemas` and `BUNDLED`.
  - [x] Cross-file check in `loadBalance`: every `shop.weapons` id exists in `weapons` (else `BalanceError` "shop.json: weapons.N: unknown weapon x").
  - [x] Dev switch `startingWallet` in `devBalance.ts` (`parseDevWallet`, `DEV_STARTING_WALLET`, `?wallet=`).
- [x] **Task 2: Shared shop rules** `packages/shared/src/economy/shop.ts` (AC 3, 4, 7, 8)
  - [x] `shopWeapons(balance)` → `{ id, price }[]` (cached per balance, frozen).
  - [x] `shopBuildings(balance)` → `{ id, name, price }[]` from `balance.buildings` if present (generic read; `name` field if it's a string, else the id in Title Case).
  - [x] `buyWeapon(world, playerId, weapon, slot): Result<{ slot }, ShopError>` with `ShopError = "not_build" | "unknown_player" | "not_for_sale" | "already_owned" | "slot_required" | SpendError`. Checks in this order: phase build → player → for sale → owned → slot (empty slot 1 first; both full needs slot 0/1) → `spendMoney` → `createSlot` into the slot.
  - [x] Bot hook: `botShopPick(balance, wallet, loadout, list)` → first weapon of the list that is for sale, not owned and affordable (or null). Not wired into bots (3.10).
- [x] **Task 3: Net contract** (AC 4, 8): `C2S.SHOP_BUY`, `S2C.SHOP_BOUGHT`, `S2C.SHOP_REFUSED`, `shopBuySchema` (`weapon` balance id ≤ 32 chars, `slot` 0 | 1 optional), payload types.
- [x] **Task 4: Server** (AC 3, 4, 8): `RunRoom.onShopBuy` via `net.guard`; `RunController.buyWeapon`; answer to the sender; log `shop_bought` / `shop_refused` at info.
- [x] **Task 5: Client hosts** (AC 3, 4): `SimHost.buyWeapon(weapon, slot)` + `takeShopAnswer()`; `LocalSimHost` calls the shared function; `NetSimHost` sends `shop.buy` and gets the answer from `RunInbox.onShopAnswer` (listened from the join, like `player.left`).
- [x] **Task 6: Shop UI** (AC 1, 2, 4, 5, 7): `ui/shopStore.ts` (open, wallet, slots, pending, choose-slot step, message; pure `shopStep` reducer, tested), `ui/ShopScreen.tsx`, texts in `ui/shopText.ts`, CSS in overlay.css; `UiRequests.shop` (actions) and `UiRequests.startPlacement`.
- [x] **Task 7: HUD + GameScene** (AC 1, 5): Shop button beside Ready; GameScene opens/closes the shop, feeds the store only on change, neutralises input while open, closes it on any phase other than build, Results, menu, leave, shutdown.
- [x] **Task 8: Dev loadout → dev cheats** (AC 6): remove `LoadoutPicker`, the `loadoutPicker` screen and the `startRun` request; DevCheats Loadout row and +500 money.
- [x] **Task 9: Tests** (all ACs): shared `shop.test.ts`, `shopSim` (A10), balance cross-check, devBalance; server `RunRoom.shop.test.ts` (buy, refusal, slot replacement, not in a wave, burst fuzz); client `shopStore.test.ts`, `RunInbox` shop answer, `LocalSimHost` buy.
- [x] **Task 10: Browser checks** (solo + two pages, also `?lag=150&jitter=20`), screenshots under `/tmp/s33/`.

## Dev Notes

### Contract with Story 3.4 (built in parallel: barricade placement)

- The shop lists (a) weapons from `shop.json` (prices from `weapons.json`) and (b) buildings from `balance.buildings` **if that block exists**. 3.4 adds `buildings.json` (e.g. `wood_barricade` with `price: 40`). Each building type needs a numeric `price`; a string `name` is used as the display name when present, else the id in Title Case. Until then the building section is empty and hidden.
- Tapping a building item does **not** buy it: the shop calls `uiStore.request("startPlacement", buildingTypeId)` and closes. 3.4 registers that handler (GameScene) and implements placement mode and the server-validated placement and charging.
- `UiRequests.startPlacement: (buildingTypeId: string) => void` is declared by 3.3 (3.4 may declare it too: same signature, keep one).
- Weapons are bought through `shop.buy`, validated on the server (phase build, price, wallet via `spendMoney`, slot choice when both slots are full; the replaced weapon is lost). A `Result` error comes back as `shop.refused { error }`; `insufficient_funds` → "Not enough money".
- The shop closes automatically when the wave starts.

### Current state of the code this story touches (read before changing)

- **Run state machine** (`packages/shared/src/run/runStateMachine.ts`, 3.1): `world.run.phase` is `lobby | build | wave | results`; Story 3.3 acts only while `phase === "build"`. Unchanged here.
- **Economy** (`economy/economy.ts`, 3.2): `spendMoney(world, id, amount): Result<number, SpendError>` is the only spender; `earned` is never reduced. Wallet is in the schema (`wallet`, `earned`), never predicted.
- **Loadout** (`combat/loadout.ts`): `slots: [WeaponSlot, WeaponSlot | null]`, `createSlot` gives a full magazine. `setLoadout` resets the active slot (used by `?loadout=` and the dev cheat, not by the shop: D4).
- **Schema** (`RunState.ts`): `weapon0/1`, `ammo0/1`, `reloadTicks0/1`, `active`, `wallet` already exist and `syncState` copies them on change. `NetSimHost.syncSlot` rebuilds a slot when its weapon changes; `LocalFireClock.syncSlot` resets the predicted cooldown for a changed weapon ("shop" is already named there). So **no schema field, no `PLAYER_STATE_FIELDS`/`RUN_STATE_FIELDS` change, no devThrottle change**.
- **HUD** (`HudScene.ts`): Ready button at bottom centre (`READY_BUTTON_*_CSS_PX` in `ui/sizes.ts`), its hit rect in `HudButtons` (a touch on it never starts a stick); the comment "Story 3.3 adds Shop beside it" marks the spot. `hudModel.readyButton` / `readyPressed` pattern.
- **Preact UI** (`ui/`): `uiStore` (screens + requests), `InRunMenu.tsx` pattern (renders null when closed: AC 2 for free), `overlay.css` (`#ui` is `pointer-events: none`; each visible overlay sets `pointer-events: auto`).
- **Dev loadout picker** (`debug/LoadoutPicker.tsx`, `UiScreen.loadoutPicker`, `UiRequests.startRun`, GameScene `running = false` until picked): removed by this story.
- **In-run menu** (2.11, `GameScene.onMenu`): Esc and ☰ toggle it; while open `neutralizeInput` and `clearEdges`. The shop reuses the same calls.

### Rules

- **Authority:** online only the server changes wallet and loadout. The client sends a request and shows the answer; it never deducts money or changes a slot locally.
- **Edge action once:** one tap → at most one `shop.buy`; buttons disabled while pending (D7). Server side the rules themselves make repeats harmless (owned / wallet), and the shared rate bucket caps messages at 10/s.
- **No allocation per frame:** GameScene writes the shop store only when the shop is open and a shown value (wallet, weapon ids, phase) changed; closed, it does nothing per frame.
- **No inline gameplay numbers:** prices and the item list come from balance. UI sizes live in `ui/sizes.ts` / the HUD constants (not gameplay).

### Testing

- Shared (one mechanic per test, seeded, `systems: { waves: () => {} }` where needed): every `buyWeapon` branch; the order of checks; nothing changes on an error; wallet exact; slot 1 filled first; replacement; Pistol re-take; `shopBuildings` with and without a `buildings` block; `botShopPick`.
- A10 bot sim (`economy/shopSim.test.ts`): 2/3/4 players, Pistol starts, real balance, every build phase each bot buys `botShopPick` from a fixed test list (SMG, then Hunting Rifle); log survival by wave, earnings and first purchase per player. Assertions: invariants (wallet = start + earned − spent; no negative wallet).
- Server (`RunRoom.shop.test.ts`, `bootTestServer`, `DEV_NO_WAVES`): buy charges + state; refusal → `shop.refused` and nothing changes; slot replacement; refused during a wave; burst of 40 messages.
- Client: `shopStore` reducer (open/close/pending/choose slot/answer/timeout/phase close); `RunInbox` routes shop answers; `LocalSimHost.buyWeapon`.

### Project Structure Notes

- New: `packages/shared/src/economy/shop.ts` (+ test), `packages/shared/src/config/balance/shop.json`, `apps/client/src/ui/ShopScreen.tsx`, `ui/shopStore.ts` (+ test), `ui/shopText.ts`, `apps/server/src/rooms/RunRoom.shop.test.ts`.
- Architecture naming: messages `shop.buy` (imperative) / `shop.bought`, `shop.refused` (past tense); component `ShopScreen.tsx` (architecture › project structure lists `ui/Shop`).

### Project Context Rules

- No `project-context.md` exists; the rules are HANDOFF.md §3 and the Epic 3 brief (retro §10): ticks not seconds, no per-tick allocation, `net.guard`, `ServerError(526)` refusals, `bootTestServer`, balance JSON only, exact pins, Phaser 4 APIs checked in `node_modules/phaser/types`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3: Fixed-list shop]
- [Source: _bmad-output/planning-artifacts/game-architecture.md#Error Handling] (`Result`, "Not enough money")
- [Source: _bmad-output/planning-artifacts/game-architecture.md#Naming Conventions] (`shop.buy`)
- [Source: _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md#Item and Upgrade System] (the roguelike shop of Epic 5 replaces this fixed list, epics › 5.x "the fixed-list shop from Story 3.3 is removed")
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-11-22.md#EPIC 3 BRIEF], A10, R4, R5
- [Source: _bmad-output/implementation-artifacts/3-1-build-phase-between-waves.md], [3-2-personal-wallets-and-rewards.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), story writer + builder in worktree `story-3-3`.

### Debug Log References

- `npm run typecheck && npm run lint && npm test && npm run build`: all pass (120 files, 882 tests, 3 skipped); `REQUIRE_DIST=1` noCheatsInRelease: pass ("Dev loadout" stays dev-only).
- Mutations proved: removing the `already_owned` check fails `shop.test.ts › already owned`; removing the `pending` guard in `shopStep` fails `shopStore.test.ts › … disables further taps until the answer`.
- Browser (Python Playwright, Chromium, 844 × 390, server :4867 with `DEV_STARTING_WALLET=400 DEV_ZOMBIE_DAMAGE_SCALE=0`, Vite :7373, client `?wallet=400&zdmg=0`): scripts `/tmp/s33scripts/{solo,online,hidden,cheats}.py`, screenshots `/tmp/s33/`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Built:** shared `economy/shop.ts` (`shopWeapons`, `shopBuildings`, `buyWeapon`, `botShopPick`, `weaponName`), `shop.json` + `shopSchema` + cross-file check, `shop.buy` / `shop.bought` / `shop.refused`, `RunRoom.onShopBuy` (guarded), `RunController.buyWeapon`, `SimHost.buyWeapon/takeShopAnswer` (solo: shared rules at once; online: message + `RunInbox.onShopAnswer`), `shopStore` (pure `shopStep`), `ShopScreen.tsx`, HUD Shop button, GameScene shop flow, dev loadout + "+500 money" in dev cheats, dev switch `startingWallet`.
- **Browser checks (all passed):**
  - Solo: Ready + Shop at the bottom in the build (`solo-1`); shop not in the DOM while closed; opens on tap (`solo-2`); D held while open: 0 m moved; SMG bought → $400 → $200, slot 2 (`solo-3`); Hunting Rifle with both slots full → "Replace which weapon?" (`solo-4`), Cancel works, then "Not enough money", nothing changed (`solo-5`); Machete replacing the Pistol → $50, Pistol row shows "Free"; Esc closes the shop (menu stays closed); shop open at wave start → closed (`solo-6`); a touch drag on the left half after closing moves the survivor (4.9 m); Shop tap in a wave does nothing.
  - Two pages, guest with `?lag=150&jitter=20`: both see 400/Pistol; guest buys SMG (answer in ~0.66 s headless), both pages see wallet 200 + SMG (`online-2`); Rifle into slot 2 → "Not enough money" (`online-3`); Machete replacing Pistol → both pages see machete/smg/$50; every item disabled while a purchase is in flight; the Pistol taken back free; host shop open (`online-4`) and guest shop both closed when the countdown started wave 1 (`online-5`, `online-6`); Shop tap in the wave: nothing. No console errors.
  - Hidden tab (host with `?lag=150`): shop open + SMG tapped, `loop.sleep()`, wave started, `wake()` → shop closed, phase wave; the purchase reached the server only after the wave began (the dev throttle's outgoing queue is pumped by the game loop) and was refused (`not_build`), so wallet and loadout stayed 400/Pistol: correct, nothing half-applied (`online-7`).
  - Dev cheats: a normal dev run starts with $100 and the Pistol, no picker; Dev loadout SMG + Hunting Rifle and +500 money work (`solo-7`).
- **A10 bot sim (`economy/shopSim.test.ts`, 2.10 bot policy, Pistol starts, list SMG → Hunting Rifle, swap to what was bought):**

  | Players | Seed 1 | Seed 2 | Seed 3 | First purchase | Earned per player (5 waves) |
  |---|---|---|---|---|---|
  | 2 | wiped in W2 (no purchase) | alive after W5 | wiped in W5 | SMG at W3 build | 101–1020 |
  | 3 | alive after W5 | wiped in W5 | alive after W5 | SMG at W3 build | 494–702 |
  | 4 | alive after W5 | alive after W5 | alive after W5 | SMG at W3–W4 build | 428–510 |

  Nobody reached the Hunting Rifle (350) within 5 waves; with 4 players the SMG comes a wave later (more players share the kills). Numbers for 3.10 to tune; no balance changed here.
- **Found and fixed:** the Story 3.2 economy sim had silently stopped running after 3.1 (the World starts in the lobby; every seed "reached wave 0" and its invariants held trivially). It now calls `startBuild` and asserts that a run really ran.
- **Epic 3 brief, lines asked for:**
  - **2** — git status clean before the report; typecheck, lint, test and build pass on `story-3-3` merged with the current `claude/epic-2-continue` (already contained at 9499428).
  - **3** — no new schema field, phase or entity: the purchase writes the existing `wallet`, `weapon0/1`, `ammo0/1`, `reloadTicks0/1` (World → `syncState` → schema → `stateView` → NetSimHost `applyPlayer/syncSlot` → `LocalFireClock.syncSlot` resets the predicted cooldown of a changed slot; devThrottle copies every field already; `snapshotWorld` already covers wallet and loadout). `PLAYER_STATE_FIELDS` / `RUN_STATE_FIELDS` unchanged.
  - **7** — one tap → at most one `shop.buy`: `shopStep` disables every item while a purchase is pending (test + browser check under lag); the "Replace which?" step sends once; opening the shop releases held input and `clearEdges()` like the menu; answers after close are dropped.
  - **8** — the server validates every purchase (`buyWeapon`: phase, player, for sale, owned, slot, wallet via `spendMoney`) and answers with the `Result` error; the client never deducts money or changes a slot; prices come from the server's balance, never from the message (`shopBuySchema` is strict: a `price` field is dropped as invalid).
  - **9** — `this.net.guard(shopBuySchema, …)` on the shared "other" bucket (10/s); `RunRoom.shop.test.ts` bursts 40 messages: ≤ 11 answered, exactly two purchases (SMG, then Machete replacing it), wallet 50, never negative, client still connected.
  - **12** — the item list is `shop.json`, prices `weapons.json › price`, the starting wallet `economy.json`; UI sizes in `ui/sizes.ts` (not gameplay). No inline gameplay number.
  - **20** — Notes for the merge below.
- **Bandwidth (line 11):** nothing per tick. Per purchase: `shop.buy` ~30 B up, `shop.bought`/`refused` ~35 B down to the buyer, and one patch of the changed fields (wallet, weapon, ammo) to everyone.
- **Not verified:** real phones (touch layout of the Ready + Shop pair on a notched phone); feel at real latency beyond the dev throttle; the late Game scene start with the shop open is covered by code (`shopStore.set(CLOSED_SHOP)` in `create` and at shutdown) but not driven in a browser.

### Notes for the merge (shared files touched; brief line 20)

- **Balance:** new `shop.json` + `shopSchema`, `shop` in `balanceFileSchemas`, `BUNDLED`, and `crossCheck()` in `loadBalance`. **3.4** adds `buildings` on the same lines (`balance.ts` imports/BUNDLED, `balanceSchema.ts` map, and the explicit `{ weapons, zombies, …, bots, shop }` lists in 7 test files: `firing`, `aimAssist`, `melee`, `swap`, `balance`, `waveDirector`, `zombieAi`): keep both keys. `weaponSchema` gained optional `name`; `weapons.json` has names → `balance.version` changed.
- **3.4 contract:** `UiRequests.startPlacement(buildingTypeId)` is declared in `ui/uiState.ts` (3.4 may declare it too: keep one); 3.4 registers it in GameScene. `shopBuildings()` reads `balance.buildings` generically (flat record or `{ types: {...} }`), any entry with a numeric `price`, `name` if a string. Once `buildings` is in `Balance` the cast in `shopBuildings` still compiles.
- **Messages:** `C2S.SHOP_BUY`, `S2C.SHOP_BOUGHT/SHOP_REFUSED` appended (3.4's placement messages append next to them).
- **RunRoom.ts:** one `onMessage` line + `onShopBuy`; `serverBalance` now also reads `DEV_STARTING_WALLET`. **RunController.ts:** `buyWeapon` method. No change to the state machine, the system order, `syncState`, the schema or NetSimHost mirroring.
- **GameScene.ts:** the dev picker block is gone (`running = true` always); new `updateShop` / `shopInput`; `neutralizeInput` and `updateReady` now take `menuOpen || shopOpen`; Esc / ☰ close the shop first. 3.4's placement mode will also hide Ready/Shop and turn the sticks off: add it next to `shopOpen`.
- **HudScene.ts:** `layoutReadyButton` lays out Ready + Shop as a centred pair; `drawShop()`. **uiState.ts:** `loadoutPicker` screen and `startRun` request removed.

### File List

- New: `packages/shared/src/economy/shop.ts`, `packages/shared/src/economy/shop.test.ts`, `packages/shared/src/economy/shopSim.test.ts`, `packages/shared/src/config/balance/shop.json`, `apps/server/src/rooms/RunRoom.shop.test.ts`, `apps/client/src/ui/ShopScreen.tsx`, `apps/client/src/ui/shopStore.ts`, `apps/client/src/ui/shopStore.test.ts`, `apps/client/src/sim/NetSimHost.shop.test.ts`
- Deleted: `apps/client/src/debug/LoadoutPicker.tsx`
- Modified (shared): `config/balance.ts`, `config/balanceSchema.ts`, `config/balance/weapons.json`, `config/devBalance.ts`, `config/devBalance.test.ts`, `config/balance.test.ts`, `economy/economySim.test.ts`, `net/messages.ts`, `index.ts`, `combat/{firing,aimAssist,melee,swap}.test.ts`, `waves/waveDirector.test.ts`, `zombies/zombieAi.test.ts`
- Modified (server): `rooms/RunRoom.ts`, `run/RunController.ts`
- Modified (client): `scenes/GameScene.ts`, `scenes/HudScene.ts`, `scenes/hudModel.ts`, `sim/SimHost.ts`, `sim/LocalSimHost.ts`, `sim/LocalSimHost.test.ts`, `sim/NetSimHost.ts`, `net/session.ts`, `ui/App.tsx`, `ui/uiState.ts`, `ui/overlay.css`, `ui/sizes.ts`, `debug/DevCheats.tsx`, `debug/clientBalance.ts`, `debug/urlOptions.ts`, `debug/urlOptions.test.ts`
- Docs: `_bmad-output/implementation-artifacts/3-3-fixed-list-shop.md`, `sprint-status.yaml`

## Change Log

- 2026-11-22: Story 3.3 implemented: fixed-list shop (weapons from `shop.json`, prices from `weapons.json`), server-validated `shop.buy` with `Result` answers, slot replacement, auto-close at wave start, Shop button beside Ready, dev loadout moved to the dev cheats (normal runs: Pistol only), dev switch `startingWallet`, 3.4 building contract, A10 shop bot sim; fixed the 3.2 economy sim that had stopped running. 882 tests passing. Status → review.
- 2026-11-22: Story created from the epics, GDD, architecture and the real code (3.1, 3.2, 3.9, 2.10 merged).
