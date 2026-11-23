# Story 5.11: Gear

Status: ready-for-dev

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
6. **Fairness rule: revive kit (D1).** The kit belongs to the **reviver**: a teammate who owns it revives a downed player in **1.5 s** instead of 3 s (`gear.json › revive_kit.reviveS`). The time needed each tick is that of the current reviver (the nearest standing teammate in reach, 2.8's rule); progress ticks are kept when the reviver changes, so a kit owner taking over a half-done revive finishes as soon as progress ≥ their 30 ticks. Two revivers still count as one (no stacking). A downed kit owner gains nothing from their own kit.
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
| G6 | Buy gear in a wave / while downed / out | `not_build` (only in build phases; everyone stands at a build start) |
| G7 | Shoes + Crawler bite + Chainsaw | Speed = base × 1.1 × 0.7 (strongest slow only, 3.9) — never faster than base × 1.1 |
| G8 | Make prediction drift with shoes (lag, slept tab, late join) | Predictor rebases with `gear` at `ackSeq`: no snap after the first state |
| G9 | Two kit owners reviving together | 1.5 s, not faster |
| G10 | Kit owner steps in at progress 31/60 | Revive completes that tick (accepted, D1) |
| G11 | Downed kit owner | Revived in 3 s by a non-kit teammate |
| G12 | Leave and rejoin to keep/duplicate gear | Leaving removes the player (Epic 8 adds rejoin-with-gear); no duplication |
| G13 | Exceed message guard by tapping fast | ≤ 1 purchase in flight per player (client); server guard drops bursts > ~10/s silently: no partial state |

## Tasks / Subtasks

- [ ] **T0 Art pick (first; AC 3).** ~5 Meshy proposals per **gear icon set** (one consistent style for all 5: armor I vest, armor II heavy vest/plates, running shoes, revive kit (medic bag + syringe/defib), tactical flashlight) — HUD icons at 24–32 CSS px must read on a phone at a glance, Dead City palette, no text. One private proposal page; the designer picks one set (or mixes); save to `docs/art/5-11/` + `README.md` (4.11 format). Build atlas frames `icon_gear_armor1_a`, `icon_gear_armor2_a`, `icon_gear_shoes_a`, `icon_gear_revivekit_a`, `icon_gear_flashlight_a` (HUD atlas ≤ 2048², category_name_variant). No HUD drawing before the pick.
- [ ] **T1 Balance `gear.json` (AC 1, 4–7).**
  - [ ] `balanceSchema.ts`: `gearSchema = z.object({ items: z.record(balanceId, gearItemSchema) }).strict()`, `gearItemSchema = { name, price int ≥ 0, inShop default true, maxHpBonus? int ≥ 0, armorTier? int 1–2, speedBonusPct? int 0–50, reviveS? > 0, light? (reserved: omit) }`; refine ≤ 8 items (uint8 mask). Register `gear: gearSchema` in `balanceFileSchemas`.
  - [ ] `gear.json`: `body_armor_1` {name "Body armor I", price 150, maxHpBonus 25, armorTier 1}, `body_armor_2` {"Body armor II", 350, 50, tier 2}, `running_shoes` {150, speedBonusPct 10}, `revive_kit` {150, reviveS 1.5}, `tactical_flashlight` {120, inShop false}. `balance.version` changes.
  - [ ] Tests: `config/balance.test.ts` › "gear validates; > 8 items refused; unknown fields refused".
- [ ] **T2 Shared gear rules — new `packages/shared/src/economy/gear.ts` (AC 2, 4–7).**
  - [ ] `gearIds(balance)` (cached key order), `gearBit(balance, id)`, `owns(p, id)`, `armorBonus(balance, mask)` (best tier), `speedBonusPct(balance, mask)`, `reviveTicksFor(balance, reviverMask)` (`ticksFor(revive_kit.reviveS)` if owned else `ticksFor(player.reviveS)`), `effectiveMaxHp(balance, mask)`.
  - [ ] `buyGear(world, playerId, item): Result<{ item }, ShopError>` — order: `not_build` → `unknown_player` → `not_for_sale` (unknown id or `inShop: false` without `debug.shopAll`) → `already_owned` (bit set, or armor tier ≤ owned tier) → `spendMoney`; then set the bit (armor II clears I), `maxHp = effectiveMaxHp`, `hp += newMax − oldMax`.
  - [ ] `player/player.ts`: `gear: number` (0) in `PlayerState` + `addPlayer`.
  - [ ] Tests `economy/gear.test.ts`: every refusal in order, wallet unchanged on refusal; I→II; II then I refused; HP rise and cap; flashlight hidden/allowed.
- [ ] **T3 Effects in the sim (AC 4–6).**
  - [ ] `player/slow.ts › playerSpeed(baseMps, p, bonusPct = 0)`: `base × (100 + bonusPct) / 100` then the slow expression (one formula, used by server and Predictor); `movement.ts` passes `speedBonusPct(world.balance, p.gear)`.
  - [ ] `player/downed.ts › updateDowned`: required ticks = `reviveTicksFor(balance, reviver.gear)` per downed player per tick (replace the single `reviveTicks` constant); keep "progress kept while any reviver is in reach".
  - [ ] Every heal cap already reads `p.maxHp`: verify `returnOutPlayers`/build heal (`downed.ts` lines ~97/149), revive (`Math.ceil(p.maxHp × reviveHpFrac)`), and 5.10/5.12 if merged.
  - [ ] `apps/server/src/rooms/schema/syncState.ts`: `reviveProgress` = `reviveTicks / reviveTicksFor(reviver)` (the current reviver's need; `pass.reviveTicks` constant goes) — `NetSimHost` line ~679 reconstructs ticks with the same rule (it knows `reviverId` via `findReviver` and every player's `gear`).
  - [ ] Tests: `player/movement.test.ts` › "shoes: 4.95 m/s; shoes + 30 % slow = 4.5 × 1.1 × 0.7"; `player/downed.test.ts` › "kit reviver 30 ticks; plain reviver 60; takeover at 31 completes; downed kit owner 60; two kit revivers 30"; `player/slow.test.ts` › "bonus and slow multiply in integers, bit-identical to the Predictor's call".
- [ ] **T4 Network (AC 8, 9).**
  - [ ] `net/messages.ts`: `C2S.SHOP_BUY_ITEM = "shop.buy_item"`, `shopBuyItemSchema = z.object({ item: balanceId-like regex, max 32 }).strict()`; `S2C.SHOP_BOUGHT_ITEM` `{ item }`, `S2C.SHOP_REFUSED_ITEM` `{ item, error: ShopError }`. **Story 5.12 uses the same message** for consumables (one dispatcher, `buyItem(world, playerId, item)` in `economy/shop.ts`: gear id → `buyGear`, consumable id → 5.12's `buyConsumable`; unknown → `not_for_sale`). (5.1's `shop.upgrade` is weapon-only; do not overload it.)
  - [ ] `RunRoom.ts`: `this.onMessage(C2S.SHOP_BUY_ITEM, this.net.guard(shopBuyItemSchema, (c, m) => this.onShopBuyItem(c, m.item)))` → `RunController.buyItem` → reply to the sender only (3.3 pattern).
  - [ ] Schema `playerFields.gear: t.uint8().default(0)`; `PlayerStateView.gear`; `PLAYER_STATE_FIELDS.gear`; `syncState.visitPlayer` writes on change; `resetRunFields` zeroes it; `fakeRoom` + devThrottle via the key list (compile check in `RunState.ts`).
  - [ ] Mirror: `NetSimHost.applyState` copies `gear` and `maxHp` to the mirror player; Predictor: `reconcile(ackSeq, x, y, status, slowTicks, slowPct, gear)` sets the predicted player's `gear` before replaying.
  - [ ] `core/worldSnapshot.ts`: player `gear`.
  - [ ] Tests: `net/messages.test.ts` (schema refusals); `RunRoom.shop.test.ts` › "buy_item gear: bought to the buyer only, state gear bit + maxHp, wallet; refusals"; `syncState.test.ts` › "gear on change only; reset on lobby return"; `apps/client/src/net/prediction.test.ts` › "shoes: predicted = server over 200 ticks incl. a bite slow; a state with new gear rebases without a snap"; `NetSimHost.shop.test.ts` › "mirror gear/maxHp from state"; `core/determinism.test.ts`/replay › "same seed + log with gear purchases → same digest".
- [ ] **T5 Client UI (AC 1, 3, 8)** — after T0.
  - [ ] `ui/shopStore.ts`: `ShopAction` `{ type: "item"; item }`, state `gear: readonly ShopGear[]`, `owned` mask from sync; pending/timeout as weapons; `SHOP_TEXT.gear`, `already_owned` text ("Owned"), armor II note "Replaces Body armor I".
  - [ ] `ui/ShopScreen.tsx`: a Gear section (name, price, Owned/short states).
  - [ ] `sim/SimHost.ts › buyItem(item)`; `LocalSimHost` runs `buyItem` on the World; `NetSimHost` sends `shop.buy_item`; answers into `ShopAnswer`.
  - [ ] HUD: `hudModel.gearMask`; `HudScene` draws up to 5 pooled icon images beside the HP text (redraw on mask change only).
  - [ ] Tests: `ui/shopStore.test.ts` › "gear buy → pending → bought; refused; timeout; owned disabled"; `scenes/hudModel` gear mask from state (`playerInfo.test.ts` pattern).
- [ ] **T6 Bots + balance sim (brief 15).** `bots/botShop.ts`: `shoppingList` ids may be gear ids (bought with `buyItem`); add e.g. `body_armor_1`, `running_shoes` to a test list (not the default JSON unless the designer agrees). Run `tools/sims/fiveWave.ts` (6 waves after 5.8) with gear: assert ≥ 1 gear purchase per bot and that waves ended; report earnings spent on gear. Bot survival is not difficulty evidence.
- [ ] **T7 Lag/lifecycle + browser (brief 14, 18).** `?lag=150&jitter=20`: buy shoes, walk: no rubber-banding; buy armor: HP text 125/125 after the state; slept tab across a build start keeps gear; late Game scene start shows the icons. Screenshots of the shop and HUD icons on a phone-size viewport.
- [ ] **T8 Gates, mutations, merge notes.**

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
