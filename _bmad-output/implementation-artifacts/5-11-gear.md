---
baseline_commit: 6d563bce3a20c15567c757a3b6c63af49dc039ef
---

# Story 5.11: Gear

Status: review

## Story

As a player,
I want gear that changes how I play for the rest of the run,
so that my build is more than my weapons.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full (paste it into the builder and the reviewer prompt too):
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies; server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the 4.10 phone numbers are the floor, not to be lost.
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: start from the 4.10 earnings decision; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> ```
>
> Most relevant here: 2 (running shoes change **predicted** movement: the gear must reach the Predictor, or own-survivor prediction drifts), 3/4 (fairness ACs and "Beat the rule"), 8 (gear in `snapshotWorld`; same seed + log → same digest), 9 (liveness), 10 (gear numbers in a new `gear.json`; integer percents), 14 (shop shows server truth; pending until state agrees), 15 (6-wave sim with bots buying gear), 17 (one more non-input message type within the guard), 18 (`?shopall=1` for the hidden flashlight).

## Acceptance Criteria

1. **Gear in the shop (FR48).** A **Gear** section in the build-phase shop (the fixed-list shop of 3.3; 5.13 turns it into cards later) lists, from a new `gear.json`: **Body armor I** (150), **Body armor II** (350), **Running shoes** (150), **Revive kit** (150); **Tactical flashlight** (120) has `"inShop": false` and is hidden (and refused) until Story 6.3 (dev: `DEV_SHOP_ALL=1` + `?shopall=1`, Story 5.10's switch). Bought only in a build phase, server-validated (solo: the shared function), wallet charged once.
2. **Owned for the run.** Gear is stored on the player as a bitmask `PlayerState.gear` (bit = index in `gear.json` key order), kept through downed, out, return and every build start until the run ends (lobby return clears it: `resetRunFields`). Each item can be owned once: buying an owned item is refused `already_owned` (nothing changes).
3. **HUD icons.** The HUD shows one small icon per owned gear item (fixed order, beside the HP text), from the server's state online. The shop marks owned gear "Owned" (disabled).
4. **Fairness rule: body armor.** Body armor I gives **+25 max HP**; Body armor II gives **+50 max HP and replaces armor I** (buying II while owning I clears bit I; II owned ⇒ I is refused `already_owned`: "armor II covers it"). Max HP = `player.maxHp + bonus of the best armor owned` (never both). On purchase the player's **current HP rises by the max-HP increase** (100/100 → 125/125; I → II: +25); never above the new max. Every heal cap (build heal, revive HP fraction, Story 5.10 med station, Story 5.12 medkit) uses this max. Revive HP = `ceil(maxHp × reviveHpFrac)` of the new max.
5. **Fairness rule: running shoes.** **+10 % move speed**, integer percent, applied in `movePlayers` (server **and** the client Predictor) as `base × (100 + bonusPct) / 100`, then the slow (`× (100 − slowPct) / 100`, 3.9) — bonus and slows **multiply**, never add: a Crawler-slowed shoe wearer moves at 4.5 × 1.1 × 0.7 m/s. Story 5.2's Chainsaw −20 % and 5.8's gas −30 % are slows and follow the same rule. Prediction stays bit-identical to the server (same integer expression on both sides).
6. **Fairness rule: revive kit (D1).** The kit belongs to the **reviver**: a teammate who owns it revives a downed player in **1.5 s** instead of 3 s (`gear.json › revive_kit.reviveS`). The time needed each tick is the **fastest need among all standing teammates in reach** (review L1, main session decision, "Better together": a kit owner in the 2 m zone counts even when a plain teammate stands nearer; the nearest is still the reviver shown); progress ticks are kept when revivers change, so a kit owner stepping in to a half-done revive finishes as soon as progress ≥ their 30 ticks. Two revivers still count as one (no stacking: two kits = 30 ticks). A downed kit owner gains nothing from their own kit.
7. **Tactical flashlight** is only recorded (the bit, synced) for 6.3's blackout cone; no gameplay effect and not for sale yet (AC 1).
8. **Server truth and pending.** Online the shop sends `shop.buy_item { item }` (new message, contract shared with Story 5.12) and shows "Waiting…" until `shop.bought_item` / `shop.refused_item` arrives or the state shows the bit (3.3's pending + 3 s timeout); HUD icons, max HP and speed follow the synced `gear` field, never the tap.
9. **Network.** New player schema field `gear` (uint8), in `PlayerStateView`/`PLAYER_STATE_FIELDS`, written on change only; `maxHp` already synced. The Predictor reads `gear` from each state (rebase on `ackSeq` like `slowTicks`). Bandwidth: one 2–3 B patch per purchase; 0 B/s otherwise.
10. **Tests:** each item's effect; armor I→II replacement and refusal order; current-HP rise; caps everywhere; speed product with slows; prediction = server with shoes (and with shoes + Crawler slow); revive kit timing (kit reviver, non-kit reviver, takeover, downed kit owner); flashlight refused / allowed with shopAll; purchase refusals (not build, money, owned, unknown item, hidden); persistence through out/return and build starts, cleared on lobby return; snapshot digest; 6-wave bot sim buys gear and the run ends (liveness); each new test fails under one mutation.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| G1 | Buy armor I twice / armor I after II | `already_owned` both, wallet unchanged |
| G2 | Buy II while owning I, expecting +75 | Max HP 150 (+50 total), HP +25 |
| G3 | Buy armor at 10 HP to "heal" | HP +25 (the bonus only); build heal already ran at build start |
| G4 | Spam `shop.buy_item` under `?lag=150&jitter=20` (double tap) | One purchase; the second is `already_owned` (or not sent while pending) |
| G5 | Craft `shop.buy_item {item:"tactical_flashlight"}` | `not_for_sale` (unless `DEV_SHOP_ALL=1`) |
| G6 | Buy gear in a wave / while downed / out | Wave: `not_build`. Downed / out in a build phase (a fire can down someone after the build start): `not_alive` (review M1; weapons too) |
| G7 | Shoes + Crawler bite + Chainsaw | Speed = base × 1.1 × 0.7 (strongest slow only, 3.9) — never faster than base × 1.1 |
| G8 | Make prediction drift with shoes (lag, slept tab, late join) | Predictor rebases with `gear` at `ackSeq`: no snap after the first state |
| G9 | Two kit owners reviving together | 1.5 s, not faster |
| G10 | Kit owner steps in at progress 31/60 | Revive completes that tick (accepted, D1) |
| G11 | Downed kit owner | Revived in 3 s by a non-kit teammate |
| G12 | Leave and rejoin to keep/duplicate gear | Leaving removes the player (Epic 8 adds rejoin-with-gear); no duplication |
| G13 | Exceed message guard by tapping fast | ≤ 1 purchase in flight per player (client); server guard drops bursts > ~10/s silently: no partial state |

## Tasks / Subtasks

- [x] **T0 Art pick (first; AC 3).** *(Overridden by the orchestrator: art is game code, Canvas 2D. Designer picked **GR6** during the build; ported from looks.html.)* ~5 Meshy proposals per **gear icon set** (one consistent style for all 5: armor I vest, armor II heavy vest/plates, running shoes, revive kit (medic bag + syringe/defib), tactical flashlight) — HUD icons at 24–32 CSS px must read on a phone at a glance, Dead City palette, no text. One private proposal page; the designer picks one set (or mixes); save to `docs/art/5-11/` + `README.md` (4.11 format). Build atlas frames `icon_gear_armor1_a`, `icon_gear_armor2_a`, `icon_gear_shoes_a`, `icon_gear_revivekit_a`, `icon_gear_flashlight_a` (HUD atlas ≤ 2048², category_name_variant). No HUD drawing before the pick.
- [x] **T1 Balance `gear.json` (AC 1, 4–7).**
  - [x] `balanceSchema.ts`: `gearSchema = z.object({ items: z.record(balanceId, gearItemSchema) }).strict()`, `gearItemSchema = { name, price int ≥ 0, inShop default true, maxHpBonus? int ≥ 0, armorTier? int 1–2, speedBonusPct? int 0–50, reviveS? > 0, light? (reserved: omit) }`; refine ≤ 8 items (uint8 mask). Register `gear: gearSchema` in `balanceFileSchemas`.
  - [x] `gear.json`: `body_armor_1` {name "Body armor I", price 150, maxHpBonus 25, armorTier 1}, `body_armor_2` {"Body armor II", 350, 50, tier 2}, `running_shoes` {150, speedBonusPct 10}, `revive_kit` {150, reviveS 1.5}, `tactical_flashlight` {120, inShop false}. `balance.version` changes.
  - [x] Tests: `config/balance.test.ts` › "gear validates; > 8 items refused; unknown fields refused".
- [x] **T2 Shared gear rules — new `packages/shared/src/economy/gear.ts` (AC 2, 4–7).**
  - [x] `gearIds(balance)` (cached key order), `gearBit(balance, id)`, `owns(p, id)`, `armorBonus(balance, mask)` (best tier), `speedBonusPct(balance, mask)`, `reviveTicksFor(balance, reviverMask)` (`ticksFor(revive_kit.reviveS)` if owned else `ticksFor(player.reviveS)`), `effectiveMaxHp(balance, mask)`.
  - [x] `buyGear(world, playerId, item): Result<{ item }, ShopError>` — order: `not_build` → `unknown_player` → `not_for_sale` (unknown id or `inShop: false` without `debug.shopAll`) → `already_owned` (bit set, or armor tier ≤ owned tier) → `spendMoney`; then set the bit (armor II clears I), `maxHp = effectiveMaxHp`, `hp += newMax − oldMax`.
  - [x] `player/player.ts`: `gear: number` (0) in `PlayerState` + `addPlayer`.
  - [x] Tests `economy/gear.test.ts`: every refusal in order, wallet unchanged on refusal; I→II; II then I refused; HP rise and cap; flashlight hidden/allowed.
- [x] **T3 Effects in the sim (AC 4–6).**
  - [x] `player/slow.ts › playerSpeed(baseMps, p, bonusPct = 0)`: `base × (100 + bonusPct) / 100` then the slow expression (one formula, used by server and Predictor); `movement.ts` passes `speedBonusPct(world.balance, p.gear)`.
  - [x] `player/downed.ts › updateDowned`: required ticks = `reviveTicksFor(balance, reviver.gear)` per downed player per tick (replace the single `reviveTicks` constant); keep "progress kept while any reviver is in reach".
  - [x] Every heal cap already reads `p.maxHp`: verify `returnOutPlayers`/build heal (`downed.ts` lines ~97/149), revive (`Math.ceil(p.maxHp × reviveHpFrac)`), and 5.10/5.12 if merged.
  - [x] `apps/server/src/rooms/schema/syncState.ts`: `reviveProgress` = `reviveTicks / reviveTicksFor(reviver)` (the current reviver's need; `pass.reviveTicks` constant goes) — `NetSimHost` line ~679 reconstructs ticks with the same rule (it knows `reviverId` via `findReviver` and every player's `gear`).
  - [x] Tests: `player/movement.test.ts` › "shoes: 4.95 m/s; shoes + 30 % slow = 4.5 × 1.1 × 0.7"; `player/downed.test.ts` › "kit reviver 30 ticks; plain reviver 60; takeover at 31 completes; downed kit owner 60; two kit revivers 30"; `player/slow.test.ts` › "bonus and slow multiply in integers, bit-identical to the Predictor's call".
- [x] **T4 Network (AC 8, 9).**
  - [x] `net/messages.ts`: `C2S.SHOP_BUY_ITEM = "shop.buy_item"`, `shopBuyItemSchema = z.object({ item: balanceId-like regex, max 32 }).strict()`; `S2C.SHOP_BOUGHT_ITEM` `{ item }`, `S2C.SHOP_REFUSED_ITEM` `{ item, error: ShopError }`. **Story 5.12 uses the same message** for consumables (one dispatcher, `buyItem(world, playerId, item)` in `economy/shop.ts`: gear id → `buyGear`, consumable id → 5.12's `buyConsumable`; unknown → `not_for_sale`). (5.1's `shop.upgrade` is weapon-only; do not overload it.)
  - [x] `RunRoom.ts`: `this.onMessage(C2S.SHOP_BUY_ITEM, this.net.guard(shopBuyItemSchema, (c, m) => this.onShopBuyItem(c, m.item)))` → `RunController.buyItem` → reply to the sender only (3.3 pattern).
  - [x] Schema `playerFields.gear: t.uint8().default(0)`; `PlayerStateView.gear`; `PLAYER_STATE_FIELDS.gear`; `syncState.visitPlayer` writes on change; `resetRunFields` zeroes it; `fakeRoom` + devThrottle via the key list (compile check in `RunState.ts`).
  - [x] Mirror: `NetSimHost.applyState` copies `gear` and `maxHp` to the mirror player; Predictor: `reconcile(ackSeq, x, y, status, slowTicks, slowPct, gear)` sets the predicted player's `gear` before replaying.
  - [x] `core/worldSnapshot.ts`: player `gear`.
  - [x] Tests: `net/messages.test.ts` (schema refusals); `RunRoom.shop.test.ts` › "buy_item gear: bought to the buyer only, state gear bit + maxHp, wallet; refusals"; `syncState.test.ts` › "gear on change only; reset on lobby return"; `apps/client/src/net/prediction.test.ts` › "shoes: predicted = server over 200 ticks incl. a bite slow; a state with new gear rebases without a snap"; `NetSimHost.shop.test.ts` › "mirror gear/maxHp from state"; `core/determinism.test.ts`/replay › "same seed + log with gear purchases → same digest".
- [x] **T5 Client UI (AC 1, 3, 8)** — after T0.
  - [x] `ui/shopStore.ts`: `ShopAction` `{ type: "item"; item }`, state `gear: readonly ShopGear[]`, `owned` mask from sync; pending/timeout as weapons; `SHOP_TEXT.gear`, `already_owned` text ("Owned"), armor II note "Replaces Body armor I".
  - [x] `ui/ShopScreen.tsx`: a Gear section (name, price, Owned/short states).
  - [x] `sim/SimHost.ts › buyItem(item)`; `LocalSimHost` runs `buyItem` on the World; `NetSimHost` sends `shop.buy_item`; answers into `ShopAnswer`.
  - [x] HUD: `hudModel.gearMask`; `HudScene` draws up to 5 pooled icon images beside the HP text (redraw on mask change only).
  - [x] Tests: `ui/shopStore.test.ts` › "gear buy → pending → bought; refused; timeout; owned disabled"; `scenes/hudModel` gear mask from state (`playerInfo.test.ts` pattern).
- [x] **T6 Bots + balance sim (brief 15).** `bots/botShop.ts`: `shoppingList` ids may be gear ids (bought with `buyItem`); add e.g. `body_armor_1`, `running_shoes` to a test list (not the default JSON unless the designer agrees). Run `tools/sims/fiveWave.ts` (6 waves after 5.8) with gear: assert ≥ 1 gear purchase per bot and that waves ended; report earnings spent on gear. Bot survival is not difficulty evidence.
- [x] **T7 Lag/lifecycle + browser (brief 14, 18).** `?lag=150&jitter=20`: buy shoes, walk: no rubber-banding; buy armor: HP text 125/125 after the state; slept tab across a build start keeps gear; late Game scene start shows the icons. Screenshots of the shop and HUD icons on a phone-size viewport.
- [x] **T8 Gates, mutations, merge notes.**

## Dev Notes

### Designer decisions to confirm (decided here non-interactively; recommended values)

- **D1 Revive kit helps the reviver** (the kit owner revives others in 1.5 s). Pillar "Better together": the buyer helps the team. Alternative: the kit owner is revived faster (protects yourself). Also: a takeover finishes at the kit's 30 ticks (no restart).
- **D2 Armor raises current HP by the bonus on purchase** (100/100 → 125/125). Alternative: max only (100/125, the next build heal fills it).
- **D3 Armor II costs the full 350**, no trade-in for armor I (GDD prices). Alternative: 350 − 150 = 200 upgrade price when I is owned.
- **D4 Shoes multiply with slows** (×1.1 then ×(1 − slow)); integer percents for prediction.
- **D5 Gear is a uint8 bitmask** (≤ 8 items; GDD has 5).
- **D6 Flashlight hidden by `inShop: false`** until 6.3 (same flag and dev switch as 5.10's floodlight); the cone numbers are 6.3's.
- **D7 HUD icons beside the HP text**, 24 CSS px, no labels (long-press/hover shows the name: optional).

### Current state (read before changing)

- `player/player.ts`: `PlayerState` (`hp`, `maxHp` floats, `slowTicksLeft`, `slowPct`, `wallet`); `addPlayer` sets `maxHp` from `balance.player.maxHp`.
- `player/slow.ts › playerSpeed(baseMps, p)`: integer-percent slow; `movement.ts › movePlayers` (server **and** Predictor, `PREDICTION_SYSTEMS`) calls it with `balance.player.speedMps`.
- `player/downed.ts › updateDowned`: one `reviveTicks = ticksFor(stats.reviveS)` for everybody; `findReviver` = nearest standing teammate within `reviveRadiusM`; revive HP `ceil(maxHp × reviveHpFrac)`; build heal `min(maxHp, hp + maxHp × buildHealFrac)`.
- `economy/shop.ts`: `buyWeapon` refusal order (`not_build` → `unknown_player` → `not_for_sale` → `already_owned` → slot → money); `ShopError`; `shopWeapons`/`shopBuildings` cached per balance.
- `net/messages.ts`: `C2S.SHOP_BUY` `{ weapon, slot? }`, `S2C.SHOP_BOUGHT`/`SHOP_REFUSED`.
- `apps/server/src/rooms/schema/RunState.ts`: `playerFields` (+ compile-time `SameKeys` with `PLAYER_STATE_FIELDS`); `syncState.ts › visitPlayer` (`reviveProgress` from the fixed `pass.reviveTicks`, `maxHp` ceil).
- Client: `net/prediction.ts › reconcile(ackSeq, x, y, status, slowTicks, slowPct)`; `sim/NetSimHost.ts` (`applyState` ~620, reviveTicks reconstruction ~679, latches); `ui/shopStore.ts`/`ShopScreen.tsx`; `scenes/HudScene.ts` (HP text, buttons), `scenes/hudModel.ts`.

### Copies touched (brief line 2)

World (`PlayerState.gear`, `maxHp`) → schema `PlayerState.gear` → `syncState` (+ `resetRunFields`) → `PlayerStateView` / `PLAYER_STATE_FIELDS` → `fakeRoom` → devThrottle (key list) → mirror (`NetSimHost.applyState`: gear, maxHp; reviveTicks reconstruction) → Predictor (`reconcile(... gear)`; `movePlayers` speed) → `snapshotWorld` (player `gear`).

### Must be preserved

Prediction bit-identity (2.6, 3.9 tests), revive rules (countdown pauses while reviving, nearest reviver), weapon shop flow and messages, balance freeze of existing numbers (only new files/blocks), all existing tests.

### Dependencies

- **5.1 (round B)** adds `C2S.SHOP_UPGRADE` (`shop.upgrade` → `shop.upgraded` / `shop.upgrade_refused`, `upgradeWeapon(world, playerId, weapon)`, `shopUpgrades`) for weapon upgrades only: keep it; `shop.buy_item` follows the same reply-to-buyer + pending pattern (one purchase in flight per player in `shopStore`, weapons, upgrades and items together).
- **5.2 (round B)** Chainsaw −20 % while active and **5.8 (round C)** gas −30 %: must be slows through `playerSpeed` (AC 5); check how they were built and keep one formula.
- **5.10 (same round)** `inShop` flag + `DEV_SHOP_ALL` / `?shopall=1`; med station cap uses `maxHp`.
- **5.12 (same round)** shares `shop.buy_item` / `buyItem` (see T4 contract); build both against it.
- **5.13** turns gear into cards (owned gear never drawn; `inShop: false` never drawn).
- **Epic 8 (8.1 rejoin)** must keep `gear` with the player.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 5.11 (FR48); GDD › Item and Upgrade System (gear table), Player health; `game-architecture.md` › Client input / prediction (ADR-01); story files 2.6 (prediction), 2.8 (revive), 3.3 (shop pending), 3.9 (integer slow).

## Notes for the merge (brief line 19)

- `balanceSchema.ts` + `balanceFileSchemas`: new `gear` file; `config/balance.ts` loads it (check the file list there and in the client's `clientBalance`).
- `player/player.ts`: `gear` field (every literal `PlayerState` in tests: `lobbyStore.test.ts`-style literals need it).
- `player/slow.ts`: `playerSpeed` gains `bonusPct` — 5.2/5.8 callers keep working with the default 0 but movement must pass the bonus.
- `player/downed.ts`: per-reviver ticks; `syncState.ts`/`NetSimHost.ts`: revive progress denominator.
- `net/messages.ts`: `SHOP_BUY_ITEM`, `SHOP_BOUGHT_ITEM`, `SHOP_REFUSED_ITEM` (shared with 5.12: one definition after the merge).
- `economy/shop.ts`: `buyItem` dispatcher (5.12 adds its branch).
- `RunState.ts` `playerFields.gear` (append; schema field order matters for Colyseus: append at the end).

## Dev Agent Record

### Agent Model Used

Claude (builder session, story-5-11)

### Debug Log References

- Gate log and browser script: builder scratchpad (`check.cjs`, `mutate.py`); results copied below and in `docs/art/5-11/README.md`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Built:** `gear.json` + `gearSchema` (≤ 8 items, integers, armor needs `maxHpBonus` + `armorTier`); `economy/gear.ts` (cached per-balance tables, `buyGear`, `armorBonus` best tier only, `speedBonusPct`, `reviveTicksFor`, `effectiveMaxHp`, `shopGear`/`allGear`); `buyItem` dispatcher in `economy/shop.ts` (5.12 adds its consumable branch there); `PlayerState.gear`; `playerSpeed(base, p, wieldPct, bonusPct)`; per-reviver revive ticks in `updateDowned`; `shop.buy_item` / `shop.bought_item` / `shop.refused_item`; schema `gear` (uint8, appended last), `PlayerStateView`/`PLAYER_STATE_FIELDS`, `syncState` (on change; revive progress over the current reviver's need), `resetRunFields`; NetSimHost mirror (`gear`, `maxHp`, revive ticks from the reviver's kit), Predictor `reconcile(…, gear)`; `DownedView` ring uses the reviver's need; shop store + `ShopScreen` Gear section (self-contained `GearSection`); HUD icons beside the HP text (pooled, redrawn on change only); bots (headless + wire bot client) buy gear ids from a shopping list; replay log `item` command; `?shopall=1` / `DEV_SHOP_ALL=1`.
- **Fairness rules as built:** armor I +25 / II +50, never summed, II clears I, II owned ⇒ I `already_owned`; current HP rises by the max increase on purchase (D2), never above max; all heal caps read `p.maxHp` (build heal, return HP, revive `ceil(maxHp × reviveHpFrac)` — verified by tests); shoes `base × 110 / 100` then every slow multiplies (bite 30 %, Chainsaw 20 %: 4.5 × 1.1 × 0.7 × 0.8 when both); revive kit belongs to the reviver (30 ticks), progress kept on a takeover, two kit owners = 30 ticks, a downed kit owner = 60 ticks.
- **Art: GR6** (designer pick, sent by the main session mid-build): GR4 painted objects on the GR2 steel tag, ported from `docs/art/epic-5/round-d/looks.html` (`makePainter('real'/'tag'/'realtag')`, `ICONS`, `bakeIcon`) into `apps/client/src/render/city/itemIcons.ts` — reusable `realPainter`, `drawSteelTag`, `bakeItemIcon({ tag, designPx })`, `ITEM_ICONS` (5.12 adds the CI4 medkit/grenade/molotov drawings there and bakes with `tag: false`). `gearIcons.ts` bakes the atlas `hud_gear` (5 × 96 px frames + 4 px gaps, 96 = 32 CSS px at dpr 3; frames `icon_gear_<name>_a`) through `addGeneratedTexture`; the DOM shop uses `gearIconUrl` (same bake, data URL). Checked at dpr 2 and 3 (screens).
- **Tests (all new ones mutation-checked, 17/17 mutations killed):** `economy/gear.test.ts` (refusal order, wallet unchanged, I→II, II then I, HP rise/cap incl. G3, heal caps, flashlight hidden / sold with shopAll, persistence through downed/out/return/build starts), `config/balance.test.ts` gear block, `player/slow.test.ts` + `movement.test.ts` (4.95 m/s, product with slows, G7), `player/downed.test.ts` (kit 30, plain 60, takeover at 31 → done, downed kit owner 60, two kits 30, revive HP of 125), `net/messages.test.ts`, `syncState.test.ts` (on change only, < 12 B per gear patch, < 20 B with HP/maxHp, reset; revive progress with a kit), `RunRoom.shop.test.ts` (round trip to the buyer only; refusals incl. double tap, hidden, unknown, money, wave, malformed dropped), `prediction.test.ts` (shoes + bite over 200 ticks: 0 snaps, ≤ 2 corrections, end error < 10 µm; without gear in reconcile > 10 corrections), `NetSimHost.shop.test.ts` (send, answers, mirror gear/maxHp from state not from the answer, kit revive ticks), `shopStore.test.ts` (rows, Owned/covered, pending until state bit, state-first unlock, refusal, timeout, owned sends nothing), `gearIcons.test.ts`, `replay.test.ts` (same seed + log with gear → same digest; without item commands → different), `fiveWaveSim.test.ts` gear sim.
- **6-wave sim with gear** (list `body_armor_1, running_shoes, smg, revive_kit, body_armor_2, wood_barricade`; 2p and 4p × seeds 1–2): every run reached Results (wiped in W4, cleared 3 — Pistol-only bots that spent on gear first; bot survival is not difficulty evidence), every bot bought ≥ 1 gear item, 21 items, $3150 on gear; maxHp 125 for armor-I owners.
- **Browser (headless Chromium, 800 × 360):** shop + HUD screenshots in `docs/art/5-11/`. Online with `?lag=150&jitter=20`: "Buying…" then "Bought Running shoes"; state gear 5, HP 125/125, wallet 700; predictor over 6 s walking with shoes: 0 corrections, 0 snaps; slept tab 3 s → gear kept (state, mirror, HUD).
- **Bandwidth:** one uint8 patch per purchase (< 12 B; < 20 B with HP + maxHp for armor); 0 B/s otherwise.
- **Decisions taken while building:** (1) `?shopall=1` / `DEV_SHOP_ALL=1` implemented in the minimal form (5.10 not merged): `loadDevBalance({ shopAll })` sets every gear item's `inShop` to true, changing `balance.version` like the other dev switches; `?shopall` is dev-build-only (release solo drops it). (2) G7 says "strongest slow only, 3.9", but the code since 5.2 multiplies the Chainsaw's wielder slow with a bite slow; kept the existing formula and multiplied the shoes bonus in front (never faster than base × 1.1). (3) The shop shows "Buying…" (3.3's existing word) while pending, not "Waiting…". (4) Bots buy gear only from a test shopping list; `bots.json` unchanged.
- **Not verified:** real phones; `?stress=150` FPS with the new HUD icons (3–5 static images, redrawn only on a change — no per-frame cost expected, but not measured); a late Game scene start specifically (the HUD reads the mirror's `gear` every frame, so it should show at once); the 6-wave sim beyond 2/4 players × 2 seeds; PERF_ASSERT tick timing (gear adds a few integer ops per player per tick, no allocation).

### Notes for the merge (brief line 19)

- `config/balanceSchema.ts` / `config/balance.ts`: new `gear` file (`gearSchema`, `GearItemStats`); every test that builds a balance from the JSON imports (`aimAssist`, `firing`, `melee`, `swap`, `zombieAi`, `waveDirector`, `spawnPoints`, `balance.test`) now lists `gear`.
- `config/devBalance.ts`: `shopAll` option + `parseDevShopAll`. **5.10 owns this switch**: if 5.10 also adds it, keep one option that flips both the floodlight's and gear's `inShop` (server `DEV_SHOP_ALL`, client `?shopall`, `urlOptions.shopAll`, `clientBalance`/`soloOverrides`).
- `player/player.ts`: `gear` field (0). Any `PlayerState` literal elsewhere needs it.
- `player/slow.ts`: `playerSpeed(baseMps, p, wieldPct = 0, bonusPct = 0)` — 5.2/5.8 callers unchanged; `movement.ts` passes `speedBonusPct(balance, p.gear)`.
- `player/downed.ts`: per-reviver ticks (`reviveTicksFor(balance, reviver.gear)`); `syncState.ts` and `NetSimHost.writeReviver` use the same rule for `reviveProgress`; `DownedView` ring too. 5.10's med station heal must cap at `p.maxHp` (already armored).
- `net/messages.ts`: `SHOP_BUY_ITEM`, `SHOP_BOUGHT_ITEM`, `SHOP_REFUSED_ITEM`, `shopBuyItemSchema` — **shared with 5.12**: one definition after the merge. `economy/shop.ts › buyItem`: 5.12 adds `if (isConsumable(...)) return buyConsumable(...)` at the marked line; the client's `SimHost.buyItem`, `ShopAnswer kind: "item"`, `parseShopBoughtItem/RefusedItem`, the shop store's `item` action/effect, the bots' `kind: "item"` replay command are all item-generic.
- `RunState.ts`: `playerFields.gear` appended last; `stateView.ts` `gear`; `fakeRoom.ts` `gear: 0`.
- `prediction.ts`: `reconcile(…, knockStepMm, gear)` — new last parameter.
- `ui/shopStore.ts` / `ShopScreen.tsx` (**5.16 overlap**): Gear state is `gear`, `gearMask`, `awaitGear`; the screen's section is the separate `GearSection` component inserted before Buildings — when 5.16 removes Buildings, keep the `<GearSection>` line.
- `render/city/itemIcons.ts` (**5.12**): the CI4 consumable icons belong in `ITEM_ICONS` with the same painter (`bakeItemIcon(..., { tag: false, designPx: 40 })`).
- `scenes/HudScene.ts` (**5.16 overlap**): gear icons are created after `ensureAtlases(this)` and drawn from `drawHealth()` → `drawGear()`; `hudModel` gains `gearMask`, `gearIds`.
- `bots/botShop.ts` / `headlessRun.ts` / `tools/bots/botClient.ts`: gear ids in a shopping list; `BotShopResult.gear`, `HeadlessRunLog.gear/gearSpent/gearMask/maxHp`.
- `replay/inputLog.ts`: `BuildCommand kind: "item"` (5.12 consumables reuse it).

### File List

- `packages/shared/src/config/balance/gear.json` (new)
- `packages/shared/src/economy/gear.ts` (new)
- `packages/shared/src/economy/gear.test.ts` (new)
- `packages/shared/src/config/balanceSchema.ts`
- `packages/shared/src/config/balance.ts`
- `packages/shared/src/config/balance.test.ts`
- `packages/shared/src/config/devBalance.ts`
- `packages/shared/src/economy/shop.ts`
- `packages/shared/src/economy/fiveWaveSim.test.ts`
- `packages/shared/src/player/player.ts`
- `packages/shared/src/player/slow.ts`
- `packages/shared/src/player/slow.test.ts`
- `packages/shared/src/player/movement.ts`
- `packages/shared/src/player/movement.test.ts`
- `packages/shared/src/player/downed.ts`
- `packages/shared/src/player/downed.test.ts`
- `packages/shared/src/net/messages.ts`
- `packages/shared/src/net/messages.test.ts`
- `packages/shared/src/net/stateView.ts`
- `packages/shared/src/bots/botShop.ts`
- `packages/shared/src/bots/headlessRun.ts`
- `packages/shared/src/replay/inputLog.ts`
- `packages/shared/src/replay/replay.test.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/combat/aimAssist.test.ts`, `firing.test.ts`, `melee.test.ts`, `swap.test.ts`; `zombies/zombieAi.test.ts`; `waves/waveDirector.test.ts`, `spawnPoints.test.ts` (balance file list)
- `apps/server/src/rooms/RunRoom.ts`
- `apps/server/src/rooms/RunRoom.shop.test.ts`
- `apps/server/src/rooms/schema/RunState.ts`
- `apps/server/src/rooms/schema/syncState.ts`
- `apps/server/src/rooms/schema/syncState.test.ts`
- `apps/server/src/run/RunController.ts`
- `apps/client/src/render/city/gearIcons.ts` (new)
- `apps/client/src/render/city/itemIcons.ts` (new: GR6 / CI4 painters)
- `apps/client/src/render/city/gearIcons.test.ts` (new)
- `apps/client/src/render/DownedView.ts`
- `apps/client/src/net/prediction.ts`
- `apps/client/src/net/prediction.test.ts`
- `apps/client/src/net/session.ts`
- `apps/client/src/net/fakeRoom.ts`
- `apps/client/src/sim/SimHost.ts`
- `apps/client/src/sim/LocalSimHost.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `apps/client/src/sim/NetSimHost.shop.test.ts`
- `apps/client/src/ui/shopStore.ts`
- `apps/client/src/ui/shopStore.test.ts`
- `apps/client/src/ui/ShopScreen.tsx`
- `apps/client/src/ui/overlay.css`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/scenes/HudScene.ts`
- `apps/client/src/scenes/hudModel.ts`
- `apps/client/src/debug/urlOptions.ts`
- `apps/client/src/debug/urlOptions.test.ts`
- `apps/client/src/debug/clientBalance.ts`
- `apps/client/src/debug/clientBalance.test.ts`
- `tools/bots/botClient.ts`
- `docs/art/5-11/` (README + 8 screenshots, new)
- `_bmad-output/implementation-artifacts/5-11-gear.md`, `sprint-status.yaml`

### Senior Developer Review (AI)

Fresh-agent review (main session), 2026-11-23: **1 medium, 3 low, 2 mutation survivors**; gate passed. All fixed on `story-5-11`:

- [x] **M1 (medium) — G6 beatable:** a downed or out player could buy in a build phase (fire hurts in build: `decay/fire.ts`), e.g. armor raised HP 0 → 25 while downed. Fix: new `ShopError` **`not_alive`**, checked right after `unknown_player` in `buyGear`, `buyItem` (so 5.12 inherits it) and `buyWeapon` (the same pre-existing gap). Client: error list + text "You can't shop while down". Tests: downed-in-build and out-in-build for gear, `buyItem` and weapons (`gear.test.ts`), round trip `RunRoom.shop.test.ts`. Story G6 row corrected. *(Needs the fresh re-review.)* Not changed: `upgradeWeapon` (a downed player can still upgrade a weapon in a build phase; harmless, no HP/position effect — say if it should refuse too).
- [x] **L1 — kit ignored behind a nearer plain teammate:** the need is now the fastest kit among all revivers in reach (`findReviver` ORs every in-reach reviver's gear; `reviveTicksFor` of that). AC 6 text updated; test "kit owner in reach counts when a plain teammate stands nearer".
- [x] **L2 — client ring re-derived the denominator from interpolated positions:** new `PlayerState.reviveNeedTicks` (World truth), synced as schema `reviveNeed` (uint8, appended, written on change only: at most a byte per revive start/stop), `PlayerStateView`/`PLAYER_STATE_FIELDS`/`fakeRoom`/`resetRunFields`; `syncState` progress = `reviveTicks / reviveNeedTicks`; the mirror and `DownedView` divide by the synced need. Tests in `syncState.test.ts` and `NetSimHost.shop.test.ts` (the nearest mirrored teammate has no kit, the ring still uses the server's 30).
- [x] **L3 — line widths designed for 32 px, shown at 24:** `designPx: 24` (bake still 96 px for dpr 3). Fresh dpr-2 shot `docs/art/5-11/5-11-hud-24px-dpr2-crop.png`.
- [x] **Mutation survivors:** `botShop.test.ts` "skips armor I when II is owned"; `gear.test.ts` "buy shoes twice → already_owned".
- [x] **Designer:** armor II's "Replaces Body armor I" note is neutral grey (`.shop__gear-note`, #bbb), shot `5-11-shop-owned-note-grey-800x360.png`.
- [x] **5.12 hook:** the shop store's unlock-on-state test is one function, `itemArrived` (`ui/shopStore.ts`), with a comment saying where 5.12's consumable count goes.

Mutation check of the fixes: 8/8 killed (M1 gear, M1 weapon ×2 incl. the room test, L1, L2 sync, L2 mirror, bot covered armor, shoes twice).

### Change Log

- 2026-11-23: Review fixes (M1 not_alive, L1 fastest kit in reach, L2 synced revive need, L3 24 px lines, 2 survivor tests, grey note, 5.12 hook).
- 2026-11-23: Story 5.11 built (gear: shared rules, network, shop, HUD with GR6 icons, bots, sims); status review.
