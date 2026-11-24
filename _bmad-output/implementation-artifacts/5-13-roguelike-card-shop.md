# Story 5.13: Roguelike card shop

Status: ready-for-dev

## Story

As a player,
I want each build phase to offer me 6 random weapon and gear cards,
so that every build phase is a different choice.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full (builder **and** reviewer: check each line):
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
>
> Most relevant here: 2 (the offer is shared sim state: World → `shop.offered` message → NetSimHost → snapshot), 3 (fairness rules F1–F9 below), 4 ("Beat the rule" list below), 8 (only `shop:<slot>:<build>`; digest), 9 (6-wave liveness sim buys cards), 10 (prices, weights, reroll in `shop.json`), 11 (bandwidth estimate below), 14 (pending until the server's offer agrees; hidden tab; late scene start), 17 (guard bucket shared with Ready / place / repair), 18 (dev switch for a forced offer), 19.

**Depends on (all built before this story, per the Epic 5 plan):** 5.1 upgrades I–IV (always-available section), 5.2 Fire Axe / Chainsaw, 5.3 Shotgun / Assault Rifle, 5.4 Flamethrower and Gas torch, 5.5 Grenade Launcher (weapon cards), 5.9 spike trap / mine / metal-barricade upgrade, 5.10 med station and floodlight (build-bar tiles, not cards), 5.16 build bar (buildings left the shop), 5.11 gear (gear cards; tactical flashlight behind its flag), 5.12 consumables (always-available section). 4.4 seed streams (`shopStream`). 3.3 fixed shop (removed here), 3.4 placement, 3.7 repair. **Leaves the seam for** 7.3/7.4 (pool from unlocks, floor fallback), Epic 6 events (supply drop gives a weapon outside the shop) and Epic 8 (rejoin gets the stored offer; slot reuse).

## Item categories the shop draws from (after 5.1–5.12)

Read the real ids from balance after the merges (the ids below are the expected ones; if a story named an id differently, use the real one and say so in the Completion Notes).

| Section | Category | Items (GDD price) | Notes |
| --- | --- | --- | --- |
| **Cards** (6, random) | Weapons | Machete 150, SMG 200, Shotgun 250, Fire Axe 300, Hunting Rifle 350, Assault Rifle 450, Chainsaw 600, Gas torch 550, Flamethrower 700, Grenade Launcher 800 | `weapons.json › price`. **Pistol (price 0) is not a card** (D3). A weapon in either of my slots is never drawn. |
| **Cards** | Gear | `gear.json › items` (5.11): `body_armor_1` 150, `running_shoes` 150, `revive_kit` 150, `body_armor_2` 350; `tactical_flashlight` 120 has `inShop: false` (off until Story 6.3; dev `DEV_SHOP_ALL=1` + `?shopall=1` / `world.debug.shopAll`) | Owned gear is never drawn; Body armor I is not drawn once I own Body armor II (it is replaced by it, 5.11). |
| **Always available** | Consumables | Medkit 60, Grenades ×3 80, Molotovs ×2 100 | 5.12 rules (same type refills, other type replaces). |
| **Always available** | Weapon upgrades | One row per weapon I hold below level IV: next level at 60 % of base price (Pistol 60) | 5.1 rules; a dropped weapon's upgrades are lost. |
| **Always available** | Repairs | Hint row: "Repair: tap a building (50 % of its price)" | 3.7's tap-to-repair stays the only repair path (no list of buildings in the shop). |
| Not in the shop | Buildings: they come from the build bar (5.16; the shop opens from the bar's 🛒 tile). Barricade upgrades by tapping one of my barricades (+50 → reinforced, +70 → metal, 5.9). Supply-drop rare weapon (Epic 6), Behemoth, Training (Epic 7) | — | The pool function is the seam 7.4 replaces (`cardPool`). |

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each one is a test)

- **F1 My cards are mine.** Each player has their own 6 cards. Only I receive my offer (a direct `shop.offered` message to my client; never in the shared state) and only I can buy or reroll it. A teammate's purchases, rerolls, joins or leaves never change my cards or my stream.
- **F2 One draw per build phase.** My offer is drawn once, at the start of each build phase, from `shop:<mySlot>:<buildPhaseIndex>`. Opening/closing the shop, a late Game scene start, a hidden tab, a reload, a lost message or (Epic 8) a reconnect never redraws it: the server stores it and re-sends the stored offer. **Only a paid Reroll changes it.**
- **F3 Reroll.** Reroll costs the price shown on its button (20) and always replaces all 6 slots (sold ones included) with 6 new cards from the next draws of my stream, with the same floor and exclusions. A double tap or a laggy repeat never charges twice: a reroll names the offer it rerolls (`rev`) and a stale one is refused with no charge.
- **F4 A tap buys exactly what I see.** A purchase names the build, offer `rev`, card index and item; the server charges exactly that card's price (the number on the card, from the same shared function) or nothing. A bought card shows "Sold" and cannot be bought again; buying never refills a slot.
- **F5 Only in a build phase.** Outside a build phase every shop request is refused with no charge (`not_build`). When the wave starts the shop closes and the offer is dead; the next build draws a new one.
- **F6 The floor and no duplicates of what I own.** Every offer has at least 1 weapon card and at least 1 gear card whenever my pool still has one; never an item I own (either weapon slot; owned gear; Body armor I once II is owned) and never the same item twice. If the pool cannot fill a category or all 6 slots, the floor is filled as far as possible, the rest come from the other category, and any slot still left shows "—" (7.4's rule, applied now): fewer than 6 cards are shown, and Reroll is disabled when no new draw exists (designer, 2026-11-23, alignment Q13).
- **F7 Same odds for everyone.** Draw weights come only from `shop.json` (rarity by price tier, D2); no pity timer, no wave or wallet dependence, no hidden bias by player or slot. The card frame shows its rarity.
- **F8 Same seed + same actions → same cards** (replay digest; brief line 8).
- **F9 Prices shown = prices charged.** Card prices, reroll price and every always-available price are computed by one shared function each (integers, `Math.round` once if a scale is ever non-zero) that both the UI and the server call; the wallet shown is the server's.

### Functional

1. **Shop layout (FR46, FR47).** In a build phase the shop shows (a) 6 cards of weapons and gear drawn from my pool and a Reroll button with its price, and (b) the always-available section: consumables, upgrades for weapons I hold, the barricade-upgrade and repair hints (table above). Buildings are not in the shop (5.16 build bar). Items with `inShop: false` are never drawn; the Pistol is never a card. Until Epic 7 my pool is every card item whose balance flag allows it (`cardPool(world, playerId)`, the single function 7.4 replaces).
2. **Draw (FR47, FR65).** At every build start (also the first, before wave 1), after the decay steps of `startBuild`, the server/solo World draws each player's offer from `shopStream(world, slotOf(playerId))` (solo: slot 0). The draw consumes exactly 6 `next()` values per offer, so the k-th reroll of build b is a pure function of (seed, slot, b, k, my owned items).
3. **Stored offer.** `world.shop` keeps, per slot, the build index, `rev` (rerolls this build), the 6 item indices (`0xff` = sold / empty) in a preallocated `Uint8Array`, and the reroll count. It is in `snapshotWorld` / `worldDigest`.
4. **Messages.** C2S `shop.buy` payload becomes `{ build, rev, card: 0–5, item, slot? }` (type name kept, architecture: never rename); new C2S `shop.reroll { build, rev }`; new S2C `shop.offered { build, rev, cards: string[6] ("" = sold/empty), rerollPrice }` to the owner only, sent at every build start, after each successful buy or reroll, and on join (Epic 8 rejoin; today the join path for players already in the run). `shop.bought { item, card, slot? }` / `shop.refused { item, card, error }` (`item: "reroll"` for a reroll refusal). New `ShopError`s: `stale_offer` (build or rev mismatch), `not_in_offer` (sold, wrong item, bad index). Every handler through `this.net.guard` (bucket "other").
5. **Buying a card.** Server checks, in order: build phase, known player, standing (`not_alive`: a downed or out player can't buy, 5.11 M1), `build`/`rev` match, `cards[card] === item`, not owned, slot (weapons: 3.3's empty-slot / `slot_required` rule; gear: 5.11 rules), wallet (`spendMoney`). Success: item given (weapon full magazine, level I; gear applied), card marked sold, `shop.bought` + `shop.offered`. Refusal: nothing changes.
6. **Reroll.** Server checks build phase, known player, standing (`not_alive`), `build`/`rev` match, wallet ≥ `rerollPrice(balance, rerollsThisBuild)`; then charges, draws 6 new cards (rev + 1), sends `shop.offered`.
7. **Removed (epics AC).** The fixed weapon list (`shop.json › weapons`, `shopWeapons`, `shopPrice` as a weapon list, `buyWeapon`'s "for sale" check against the list) and any 5.11 fixed gear list are removed; the 3.3 shop sim and bot shopping move to cards (task 7).
8. **Client.** Solo reads `world.shop` directly; online, `RunInbox` keeps the latest `shop.offered` (highest (build, rev)), so a late Game scene start or a woken tab shows it; the shop shows cards only when `offer.build === buildPhaseIndex` of the state (`state.wave` in phase "build"), else "Loading cards…". A buy or reroll is **pending** (all cards and Reroll disabled, "Buying…"/"Rerolling…") until an offer with that card sold / a higher rev arrives, or a refusal, or `SHOP_PENDING_TIMEOUT_MS` (3 s; then the stored server offer wins). One request at a time (stays far under the ~10 msg/s guard).
9. **Phone touch UI (D9).** Landscape: a 3 × 2 card grid on the left, the always-available list on the right (scrolls), wallet + Reroll in the head row, Close top-right. Each card ≥ 96 × 112 CSS px (whole card is the touch target; ≥ 44 px rule met with margin), name ≥ 16 px, price ≥ 16 px, one stat line ≥ 14 px, category icon (weapon/gear), rarity frame (art pick), states: affordable / "Too dear" (dimmed price, still selectable) / "Owned" / "Sold" / pending. **Tap a card selects it** (lifts, shows "Buy $N" on the card); **a second tap on it buys** (D8); tapping elsewhere deselects. Fits 640 × 360 CSS px with safe areas and no page scroll of the card grid.
10. **Dev switch (brief line 18).** Server `DEV_SHOP_CARDS=flamethrower,revive_kit,...` (+ client `?shopcards=` for solo) forces the first offer of every build (filler from the stream for the rest; dev builds only, ignored in production like `DEV_STARTING_WALLET`).
11. **Tests (Vitest):** card floor, owned-item exclusion (weapons, gear, armor I/II), reroll (charges once, new cards, rev), same-seed reproducibility, F1–F9 each, the "Beat the rule" list, 6-wave liveness sim, bandwidth, client pending/late-start/hidden-tab; each new test fails under one named mutation (Completion Notes).

## Beat the rule (builder writes the test; reviewer re-tries each and records the result)

| # | Attempt | Rule that stops it | Test |
| --- | --- | --- | --- |
| B1 | **Reroll spam** (40 `shop.reroll` in one burst, same rev) | F3: rev must match → 1 charge, 1 new offer; the rest `stale_offer` or rate-dropped | `RunRoom.shop.test.ts` "a burst of 40 rerolls charges once" |
| B2 | **Reroll fishing** for one premium weapon | Costs 20 per try; odds from `shop.json` only | `shopCards.test.ts` "fishing cost table" (deterministic Monte Carlo over seeds 1–2000: expected rerolls and currency to see each item; printed and pinned loosely: Grenade Launcher ≥ 3 rerolls on average with the D2 weights) |
| B3 | **Buying during the wave** (send `shop.buy` / `shop.reroll` the tick after `wave.started`; a request queued under `?lag=150` that lands after the wave start) | F5: `not_build`, no charge; the offer is dead | shared `shopCards.test.ts` "only in a build phase"; room "a buy that lands after the wave start is refused" |
| B4 | **Two players racing for one card** (p0 and p1 both have a Shotgun card and buy in the same tick) | F1: offers are per player; both succeed, each from their own wallet; neither offer changes the other | room "two players buy the same item in the same tick" |
| B5 | **Lag double-buy** (two `shop.buy` for the same card before the first answer) | F4: the second finds the card sold → `not_in_offer`, charged once | shared + room "double buy of one card" |
| B6 | **Buy a card after a reroll replaced it** (tap sent with the old rev) | F4: `stale_offer`, no charge, even if the new offer has the same item at that index | shared "stale rev never buys" |
| B7 | **Refresh-on-reconnect fishing** (close/open shop, reload the tab, late scene start, a re-sent join; Epic 8 rejoin) | F2: the stored offer is re-sent, never redrawn; the stream is not advanced | shared "nothing but a reroll changes the offer" (open/close/sync paths call nothing that draws); room "the offer re-sent to a client equals the stored one"; NetSimHost "late subscribe shows the latest offer" |
| B8 | **Seed prediction** (the run seed is visible in the state and Results; the code is public, so a player can compute their own future offers and rerolls) | Accepted (D12): production seeds are random and cannot be chosen (`DEV_ALLOW_RUN_SEED` dev only); knowing the next reroll changes no one's odds and gives nothing against teammates in co-op | doc only; test "production ignores `DEV_SHOP_CARDS`" and the 4.4 production test still pass |
| B9 | **Teammate influence** (a teammate rerolls 10 times or buys first: does my offer move?) | F1: separate streams per slot | shared "p1's rerolls never change p0's offer" |
| B10 | **Buy-replace-rebuy** (buy SMG card into slot 2, then the same SMG again; or drop a weapon to make its card appear) | F6 + F4: the card is sold; the dropped weapon is not in this offer (exclusion is applied at draw time; a sold card never refills) | shared "a sold card never comes back this offer" |
| B11 | **Gear stacking** (Body armor I and II both bought; Revive kit twice) | 5.11: each gear once; armor II replaces I; armor I card while owning II → `already_owned` | shared "armor I after armor II is refused" |
| B12 | **Malformed / forged** (card 9, item not in the offer, negative rev, unknown item id, build of another phase) | schema + F4: dropped (invalid) or `not_in_offer` / `stale_offer`; connection kept | room "invalid shop messages are dropped" (extend the 3.3 test) |
| B13 | **Flood across buckets** (reroll + buy + place + repair + ready in one second, > 10) | Guard drops the excess silently; client pending timeout shows server truth | NetSimHost "a dropped request times out to the stored offer" |
| B14 | **Free money from rerolls under `?wallet=`** | dev switches need server `DEV_STARTING_WALLET` too (3.3); production ignores | existing 3.3 test still passes |

## Tasks / Subtasks

- [x] **T0 Art pick: done.** The designer picked **C3 police evidence tag** (E5D 5.13; all art is drawn in game code, E5D "Art method").
  - [ ] Build: draw the C3 frame and the rarity tapes (common white / rare blue / epic red-amber) and the category icons (weapon / gear) in code: CSS (the shop is Preact DOM), or Canvas registered through `addGeneratedTexture` if a texture is needed (brief line 20). No Meshy images, no 9-slice image sheet.
- [ ] **T1 Balance** (AC 1, 6, 9; F7, F9)
  - [ ] `shop.json` keeps 5.1's `upgrades` block and gets `{ "cards": 6, "floor": { "weapon": 1, "gear": 1 }, "reroll": { "price": 20, "stepPerReroll": 0 }, "priceScalePerBuild": 0, "rarity": [{ "id": "common", "maxPrice": 250, "weight": 3 }, { "id": "rare", "maxPrice": 500, "weight": 2 }, { "id": "epic", "maxPrice": null, "weight": 1 }], "excludeFromCards": ["pistol"] }` (values = designer decisions below). zod in `balanceSchema.ts` (`shopSchema`): cards 1–6, floor sum ≤ cards, weights > 0, tiers ascending, ids known; cross-file check in `balance.ts` (exclude ids are weapons or gear).
  - [ ] Remove `shop.json › weapons` and its cross-file check; `balance.version` changes (client and server deploy together).
  - [ ] Tests `config/balance.test.ts`: "shop.json: floor and tiers validated", "an unknown excluded id is refused".
- [ ] **T2 Shared card shop** `packages/shared/src/economy/shopCards.ts` (new) (AC 1–7; F1–F9)
  - [ ] `cardCatalog(balance)`: frozen list of card items `{ id, kind: "weapon" | "gear", name, price, rarity, weight }` in a fixed order (weapons by `weapons.json` order, then gear), cached per balance (WeakMap, like `shopWeapons`); items with `inShop: false` (gear; unless `world.debug.shopAll`) and `excludeFromCards` left out; gear is bought through 5.11's `buyGear` (its `already_owned` rule: bit set or armor tier ≤ owned tier).
  - [ ] `cardPool(world, playerId)`: **the Epic 7 seam**: today every catalog item; 7.4 intersects with the player's unlocks. Returns catalog indices into a preallocated scratch (no allocation in the draw).
  - [ ] `slotOf(playerId)`: `"p<N>"` → N, solo `"local"` → 0 (4.4: solo is slot 0); test.
  - [ ] `drawOffer(world, playerId)`: candidates = pool minus owned (weapon slots, owned gear, armor I if armor II); weighted pick of 1 weapon (if any), 1 gear (if any), then the rest from the union without replacement; exactly 6 `rng.next()` per offer (a slot with no candidate still consumes its draw); final order: weapons then gear, each in catalog order (no extra draw; see "Other decisions").
  - [ ] `world.shop` state (`createShopState()`, preallocated `Uint8Array(MAX_PLAYERS × 6)`, `Int16Array` build, `Uint16Array` rev); `startBuild` calls `drawAllOffers(world)` after the decay steps (the only change to `runStateMachine.ts`; 4.4 said `startBuild` was untouched: note it).
  - [ ] `buyCard(world, playerId, build, rev, card, item, slot)` → `Result<CardBought, ShopError>`; weapon path reuses 3.3's slot rule (`createSlot`, empty slot first, `slot_required`); gear path calls 5.11's gear function. `reroll(world, playerId, build, rev)` → `Result<Rerolled, ShopError>`. `cardPrice(balance, item, build)` and `rerollPrice(balance, rerollsThisBuild)` (integers; the UI calls the same).
  - [ ] Snapshot: `shop` (offers, build, rev) in `snapshotWorld`.
  - [ ] Tests `economy/shopCards.test.ts`: "every offer has ≥ 1 weapon and ≥ 1 gear (seeds 1–500 × builds 0–5 × 4 slots)", "never an owned weapon, owned gear or armor I after II", "no item twice in one offer", "floor filled as far as possible when all gear is owned; rest weapons; empty slots show none" (7.4 fallback), "reroll charges once, rev + 1, 6 new cards from the next draws", "stale rev never buys", "double buy of one card", "a sold card never comes back this offer", "armor I after armor II is refused", "only in a build phase (buy and reroll)", "p1's rerolls never change p0's offer", "same seed + same actions → same offers", "nothing but a reroll changes the offer" (open/close/sync/snapshot draw nothing: stream state equal), "exactly 6 draws per offer", "rarity weights follow shop.json (χ² over 20 000 seeded draws, loose)", "fishing cost table" (B2), "card price shown = charged (F9)", "no allocation in drawOffer" (heap-free check like 4.4's reseed test, or a counted-allocation spy).
- [ ] **T3 Messages and server** (AC 4–6; F1, F3–F5)
  - [ ] `net/messages.ts`: `shopBuySchema` → `{ build: int 0–255, rev: int 0–65535, card: int 0–5, item: id regex, slot? }`; `shopRerollSchema { build, rev }`; `C2S.SHOP_REROLL = "shop.reroll"`; `S2C.SHOP_OFFERED = "shop.offered"`; payload types; `ShopError` extended.
  - [ ] `RunController.buyCard` / `reroll` / `offerFor(playerId)`; `RunRoom.onShopBuy` / `onShopReroll` through `this.net.guard`; `shop.offered` sent to each player's own client after `startBuild` (hook the controller's build start: after the tick that emitted `build.started`, iterate members, `client.send` once each), after a success, and in `onJoin` for a member already in the run. Log `shop_bought` / `shop_rerolled` (info) and refusals (debug, like repair).
  - [ ] Tests `RunRoom.shop.test.ts` (rewrite for cards; `bootTestServer()`): "each client gets only its own offer at the build start", "buy a card: charged the card price, card sold, both clients see wallet and weapon", "a burst of 40 rerolls charges once", "two players buy the same item in the same tick", "a buy that lands after the wave start is refused", "double buy of one card", "the offer re-sent to a client equals the stored one", "invalid shop messages are dropped; the client stays connected", "DEV_SHOP_CARDS forces the first offer; production ignores it".
- [ ] **T4 Input log / replay** (AC 2; F8)
  - [ ] `replay/inputLog.ts`: `BuildCommand` kinds `buyCard { playerId, build, rev, card, item, slot }` and `reroll { playerId, build, rev }` replace `buy`; `botShop` records them.
  - [ ] `replay.test.ts`: "same seed + input log → same digest" now includes card buys and ≥ 1 reroll (assert both happened); "a log without the reroll diverges".
- [ ] **T5 Client host + inbox** (AC 8; F2, F4, F9)
  - [ ] `SimHost`: `buyCard(card, item, slot)`, `reroll()`, `shopOffer(): ShopOfferView | null` (solo: from `world.shop`; online: the inbox's latest), answers via `takeShopAnswer` (extended union).
  - [ ] `net/session.ts` `RunInbox`: parse `shop.offered` (malformed dropped), keep the highest (build, rev), deliver to a late subscriber; parse the new answers.
  - [ ] `NetSimHost` / `LocalSimHost` implement it. Tests `NetSimHost.shop.test.ts`: "buyCard sends one shop.buy with build, rev, card, item", "reroll sends one shop.reroll", "late subscribe shows the latest offer", "an older offer after a newer one is ignored", "a dropped request times out to the stored offer", "after dispose nothing is sent"; `LocalSimHost.test.ts` "solo draws from slot 0 and rerolls charge".
- [ ] **T6 Shop UI** (AC 1, 8, 9; F4, F9)
  - [ ] `ui/shopStore.ts`: state gets `offer` (build, rev, cards), `always` (sections), `selected` card, `pending` as `{ kind: "card" | "reroll", card, rev }`; `shopStep` inputs `offer`, `select`, `buyCard`, `reroll`; "Replace which?" kept for weapon cards with both slots full. Pending clears on: a matching answer, an offer with that card sold / rev > sent rev, or 3 s.
  - [ ] `ui/ShopScreen.tsx`: card grid + always-available column + Reroll; texts in `SHOP_TEXT` (`reroll: (n) => \`Reroll $${n}\``, `sold: "Sold"`, `tooDear: "Too dear"`, `loading: "Loading cards…"`, `rerolling: "Rerolling…"`). Card stat line from balance (e.g. Shotgun "8 × 4 dmg · 5 m"; gear its effect "+25 max HP"). CSS in `overlay.css` (`.shop__cards`, `.shop-card`, `.shop-card--<rarity>`, `--selected`, `--sold`, `--short`); sizes as constants in `ui/sizes.ts` (`CARD_MIN_W_CSS_PX = 96`, `CARD_MIN_H_CSS_PX = 112`, `CARD_GAP_CSS_PX = 8`).
  - [ ] `GameScene.updateShop`: open (from the build bar's 🛒 tile) with the host's offer and always-available lists (upgrades/consumables from 5.1/5.12 functions; no buildings); feed new offers; `shopAllowed` unchanged.
  - [ ] Tests `shopStore.test.ts`: "first tap selects, second tap buys (one effect)", "pending until the offer shows the card sold", "reroll pending until rev rises; a second tap while pending does nothing", "an offer of another build is not shown (Loading cards…)", "a late answer for an older request doesn't unlock a newer one" (3.3 review rule kept), "price on the card = cardPrice()". Shared + room: "downed in build: card buy and reroll refused, no charge".
  - [ ] Browser check (Playwright, Chromium): 640 × 360 and 844 × 390 landscape screenshots with safe-area insets; two pages under `?lag=150&jitter=20` (each sees only its own cards; double tap Reroll charges once); `window.__game.loop.sleep()` across a build start then `wake()` → the new build's cards; late Game scene start.
- [ ] **T7 Bots and 6-wave liveness sim** (AC 7, 11; brief lines 9, 15)
  - [ ] `bots/botShop.ts`: `botBuildPhase` buys cards: the first card in the offer whose item is on `bots.shoppingList` (in list order) and affordable, else the cheapest affordable weapon card the bot does not hold if it has a free slot, else up to `bots.maxRerollsPerBuild` (new, 2) rerolls while `wallet ≥ rerollPrice + cheapest list card`; buildings as today. `tools/bots/botClient.ts` the same over the wire (one request at a time, waits for `shop.offered`).
  - [ ] `economy/sixWaveSim.test.ts` (rename/extend `fiveWaveSim.test.ts`; `runWaves` is 6 after 5.8): seeds 1–6 × 2/3/4 bots: **every run ends ≥ 1 wave and reaches Results or a wipe; across each run, ≥ 1 card is bought in every build phase 1–5 that the team reaches (bots pooled), and ≥ 1 reroll happens per run**; build 0 asserts a 6-card floor-respecting offer for every bot (nothing affordable at 100 is allowed, D13). Print cards bought per build, rerolls, currency spent on rerolls.
  - [ ] Second liveness: `DEV`-style balance override `startingWallet: 400` → ≥ 1 card bought in every build 0–5 per bot.
  - [ ] `tools/sims/fiveWave.ts` → also prints cards/rerolls (rename to `sixWave.ts` only if 5.8 did not).
- [ ] **T8 Remove the fixed shop** (AC 7): delete `shopWeapons`/fixed-list paths in `economy/shop.ts` (keep `titleCase`, `weaponName`, `shopBuildings`, `owns`), `botShopPick`, `shopSim.test.ts` fixed-list cases (move the money-adds-up sim to cards), any 5.11 fixed gear list; grep for `shop.weapons`, `shopPrice`, `buyWeapon` and update every caller (DevCheats loadout stays a cheat).
- [ ] **T9 Bandwidth, perf, gates** (brief lines 11, 16, 1): `run/shopBandwidth.test.ts` "shop.offered ≤ 200 B per message, ≤ 12 per player per build"; report B/s; PERF_ASSERT tick test unchanged (draws are build-start only); `npm run typecheck && npm run lint && npm test && npm run build`; playtest readability sheet row "card rarity readable at arm's length" (brief line 13).
- [ ] **T10 Merge notes + Completion Notes** (mutations proven, what was not verified).

## Dev Notes

### Designer decisions to confirm (non-interactive; recommended values are built)

| # | Decision | Recommended (built) | Alternatives |
| --- | --- | --- | --- |
| D1 | Card count and floor | **6 cards; floor ≥ 1 weapon + ≥ 1 gear** (GDD, FR47) | — |
| D2 | Rarity weights | **By price tier: common ≤ 250 weight 3, rare 251–500 weight 2, epic > 500 weight 1** (common: Machete, SMG, Shotgun, armor I, shoes, revive kit; rare: Fire Axe, Hunting Rifle, AR, armor II; epic: Chainsaw, Gas torch, Flamethrower, Grenade Launcher). A given epic weapon shows in ≈ 1 offer in 5 | Uniform (all weight 1; epic in ≈ 1 in 3 offers) · steeper 4/2/1 |
| D3 | Reroll price | **20 flat** (GDD), `stepPerReroll: 0` | Escalating within a build: 20, 30, 40… (`stepPerReroll: 10`, resets each build) if 4.10/5.x playtests show fishing |
| D4 | Lock / hold a card to the next build | **No** (every build is a fresh choice; keeps the stream rule simple) | 1 free hold per build carried into the next offer (costs a design for how it counts toward the floor) |
| D5 | Upgrade cards | **No: upgrades stay in the always-available section** (FR46, FR17) | Upgrade cards as a 3rd card category |
| D6 | Price scaling per wave | **None (× 1.0 every build)**, `priceScalePerBuild: 0`; the economy target (2,500–3,000/run) is sized on fixed prices | +5 % per build (rounded once in `cardPrice`) |
| D7 | Pistol as a card | **No** (starting weapon, price 0; a free card would waste a slot) | Free Pistol card when not held |
| D8 | Buy gesture on phones | **Tap to select, tap again to buy** (cards up to 800: one mis-tap is a run) ; always-available list stays one tap (3.3) | One tap buys (3.3 style) |
| D9 | Card size / layout | **≥ 96 × 112 CSS px, 3 × 2 grid left, always-available list right, Reroll in the head row, Close top-right; fits 640 × 360** | 6 in one row (fits 844 wide only) |
| D10 | Card frame look | **C3 police evidence tag (decided, E5D 5.13)**: manila card, evidence-tape border, rarity tape white / blue / red-amber; drawn in code (CSS, since the shop is Preact DOM) | — |
| D11 | Wave gating of epic cards | **None** (price gates them: nobody affords 600–800 before ~build 3) | Epic cards only from build 2 |
| D12 | Seed prediction | **Accepted** (co-op PvE; production seeds random and not choosable) | Hide `runSeed` from clients until Results |
| D13 | Build 0 | Start wallet 100 < cheapest card 150: the first build buys buildings from the build bar or a medkit, not cards. **Keep** (GDD start 100) | Starting wallet 150 |

### Other decisions (builder)

- **Direct message, not `@view()`.** Schema 5.0.50 supports `.view()` (needs a `StateView` per client and per-view encoding of every patch, touching the 2.5/devThrottle/fakeRoom paths for 4–6 messages per build). A per-client `shop.offered` (~150 B) is simpler and private by construction; architecture §"Personal Shop" allows either.
- **Rev, not tokens.** Buys don't change `rev` (two quick buys of different cards both succeed); only a reroll does.
- **Exclusion at draw time.** Owned items are excluded when the offer is drawn; buying a card marks it sold; a card that becomes unusable within the offer (armor I after buying armor II) shows "Owned" and is refused.
- **Display order** weapons then gear, catalog order (no extra draw; draw positions don't leak which card was the floor).
- **Sibling stories already name the seams:** 5.11 `gear.json`, `buyGear`, gear bit mask on the player, Gear section of the fixed shop (removed here; gear becomes cards); 5.10/5.11 `inShop: false` + `DEV_SHOP_ALL` (cards respect it); 5.1 `shop.json › upgrades`, `upgradeWeapon`, `shopUpgrades` (kept, always-available). Read their story files' merge notes before starting.
- **Slot reuse (4.4 review L2).** `world.shop` is per slot like the stream. Joins happen only at a run start today; Epic 8 must reset `streams.shop[slot].buildPhaseIndex = -1` **and** clear `world.shop[slot]` on slot reassignment inside a build. Documented on `drawOffer`.

### Current state (read before changing)

- `packages/shared/src/economy/shop.ts`: 3.3 fixed list (`shopWeapons` from `shop.json › weapons`, `shopPrice`, `buyWeapon` with `not_build → unknown_player → not_for_sale → already_owned → slot_required → spendMoney`), `shopBuildings` (generic over `buildings.types`), `botShopPick`. After 5.1/5.11/5.12 expect upgrade, gear and consumable buy functions next to it: read them first.
- `config/balance/shop.json`: `{ "weapons": ["pistol","machete","smg","hunting_rifle"] }` (5.2–5.5/5.11 extended it); `shopSchema` in `balanceSchema.ts:316`; cross-file check `balance.ts:52`.
- `core/seedStreams.ts`: `shopStream(world, slot)` reseeds in place per build (`buildPhaseIndex = waves.number`), throws outside a build phase (4.4 L1); `snapshotSeedStreams` includes shop streams. **No user yet** except `replay.test.ts:85` (a fake roller).
- `run/runStateMachine.ts › startBuild`: phase = build → clear Ready → `decayMutate` → `returnOutPlayers` → `decayFinish` → `build.started`. Wave bonus is paid later in the same tick by the economy system (the draw doesn't read wallets).
- `economy/economy.ts › spendMoney`: integer, ≥ 0, `insufficient_funds`.
- Server: `RunRoom.onShopBuy` (`RunRoom.ts:434`) → `RunController.buyWeapon` → `shop.bought`/`shop.refused` to the sender; guard bucket "other" (10/s, `net/limits.ts`). Room state has **no** shop fields; nothing to add to the schema / `stateView` key lists for this story.
- Client: `ui/shopStore.ts` (pure `shopStep`, pending + 3 s timeout, late-answer rule), `ui/ShopScreen.tsx` (sections, `shop__item` ≥ 56 px tall), `GameScene.updateShop` (opens with `shopWeapons`/`shopBuildings`, feeds wallet/slots, closes when `shopAllowed` turns false), `SimHost.buyWeapon/takeShopAnswer`, `RunInbox.onShopAnswer` (`net/session.ts`), `scenes/readyRequest.ts` (the 3.1 pending-until-state-agrees pattern to copy).
- Bots: `bots/botShop.ts` (`botShopNext` over `shoppingList`, `buyWeapon`), `tools/bots/botClient.ts:352` (`shop.buy` over the wire), `bots.json › shoppingList`.
- Solo player id is `"local"` (`LocalSimHost.ts:28`): slot 0.

### Copies touched (brief line 2)

World (`world.shop`, `streams.shop` use) → **no schema field** (direct `shop.offered`) → syncState / `stateView` key lists / devThrottle: unchanged (say so) → `RunInbox` cache → NetSimHost / LocalSimHost `shopOffer()` → Predictor: unaffected (offers don't move bodies) → `snapshotWorld` (`shop`).

### Must be preserved

5.16 build-bar placement (the shop has no building action), 3.7 tap-to-repair, 5.1 upgrades, 5.12 consumables, 5.11 gear effects, the 3.3 "Replace which?" flow and late-answer rule, `shopAllowed` (survivor stands still, auto-close at wave start), 4.4 stream tests (reseed, L1 throw), replay digest tests, every balance number of other files.

### Bandwidth estimate (brief line 11)

`shop.offered` ≈ 6 ids (≤ 16 chars) + build/rev/price ≈ 130–170 B with Colyseus framing; sent 1× at the build start + 1× per buy or reroll. A busy build (3 buys + 3 rerolls) = 7 messages ≈ 1.2 KB per player per 30 s build ≈ **40 B/s per player in build phases, 0 B/s in waves**; C2S ≈ 50 B per request. Total stays far under 30 KB/s (waves unchanged). The test pins ≤ 200 B per message.

### Project Structure Notes

New: `packages/shared/src/economy/shopCards.ts` (+ test), `economy/sixWaveSim.test.ts`, `apps/server/src/run/shopBandwidth.test.ts`, `docs/art/5-13/README.md` + sheet, `apps/client/public/...` (frame sheet path per the 4.9 atlas convention). Updated: `config/balance/shop.json`, `config/balanceSchema.ts`, `config/balance.ts`, `config/balance/bots.json` (`maxRerollsPerBuild`), `economy/shop.ts`, `run/runStateMachine.ts`, `core/world.ts`, `core/worldSnapshot.ts`, `replay/inputLog.ts`, `bots/botShop.ts`, `net/messages.ts`, `index.ts`, server `RunRoom.ts` / `RunController.ts`, client `SimHost.ts`, `NetSimHost.ts`, `LocalSimHost.ts`, `net/session.ts`, `ui/shopStore.ts`, `ui/ShopScreen.tsx`, `ui/overlay.css`, `ui/sizes.ts`, `scenes/GameScene.ts`, `debug/urlOptions.ts` (`?shopcards`), `tools/bots/botClient.ts`, `tools/sims/*`.

### Project Context Rules

No `project-context.md`; HANDOFF §3 rules apply: timers in ticks, no per-tick/per-frame allocation (`shopStep` may allocate on input only), numbers in balance JSON, Colyseus `this.net.guard` (never zod in `onMessage`), `bootTestServer()`, exact version pins, Preact overlays with `pointer-events: none` except active screens, one test of a mechanic passes `systems: { waves: () => {} }`.

### Notes for the merge (brief line 19)

- `economy/shop.ts`, `shop.json`, `balanceSchema.ts`: 5.1/5.11/5.12 all touched the shop; merge 5.13 **last** and rebase onto them; the fixed weapon/gear lists go, their buy functions for upgrades/consumables stay.
- `run/runStateMachine.ts › startBuild`: one added line (`drawAllOffers` after the decay steps). Any Epic 6 event that fires at a build start goes before it if it changes loadouts.
- `net/messages.ts`: `shop.buy` payload changed (not renamed); clients older than this balance version are refused as `balance_mismatch`.
- `replay/inputLog.ts`: `buy` → `buyCard` + `reroll`; old recorded logs (if any are committed) are regenerated.
- `bots.json`: `maxRerollsPerBuild` added; `shoppingList` unchanged.
- No room-state schema change: the 4.x key-list compile checks are untouched.

### References

- `_bmad-output/planning-artifacts/epics.md` › Epic 5 intro, Story 5.13; Story 7.3, 7.4 (pool, floor fallback); FR46, FR47, FR65, FR79.
- GDD `gdds/gdd-topdown-shooter-2026-11-21/gdd.md` › Item and Upgrade System (roguelike shop, gear table), Buildings and Defenses, Economy and Resources (spending 150–800, reroll 20; target 2,500–3,000), Player Progression (starter pool); decision log 2026-11-21 (shop option B, card floor).
- `game-architecture.md` › Novel Patterns › 3. Personal Shop in a Shared Run; Randomness; Network messages naming.
- `HANDOFF.md` §3 (guard ~10 msg/s, BMAD loop, Playwright), §4.
- `epic-4-retro-2026-11-23.md` §11 (brief), §6 (4.4 slot reuse for Epic 8).
- Stories `3-3-fixed-list-shop.md` (review: sim liveness, late answers, `shopAllowed`), `3-1-build-phase-between-waves.md` (ReadyRequest), `4-4-named-seed-streams.md` (decisions 4, 6; review L1, L2), `docs/art/4-11/README.md` (art-pick process).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story created by the context engine (non-interactive) from epics, GDD, architecture, HANDOFF, the Epic 5 brief and the real code at `cdb9c6e`; Epic 5 stories 5.1–5.12 assumed merged (their ids to be checked at build time).

### File List
