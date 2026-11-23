---
baseline_commit: 26bab2b35529f809ccc2f4ea27e00412bee05c31
---
# Story 5.1: Weapon upgrades I–IV

Status: review

## Story

As a player,
I want to upgrade the weapons I own,
so that my favourite gun keeps up as the horde grows.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`), pasted verbatim. Every line applies; reviewers check each one.
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
> Most relevant here: 2 (level is a new loadout field: every copy), 3/4 (fairness rules below, "Beat the rule" list), 8 (an upgrade is a replay command), 9 (liveness: kills with an upgraded weapon), 10 (multipliers and prices in balance), 14 (shop shows server truth), 15 (6-wave sim with upgrades bought), 18 (`?loadout=smg:3`), 19.
>
> **Note on line 15:** the 4.10 playtest is deferred ("way, way later", sprint-status). There is no earnings decision yet: start from the current numbers (`economy.json`, earnings 4–19 % below the GDD target per HANDOFF §4) and record what the sim says.

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "What you see is what you pay."** The upgrade row in the shop shows the weapon, its current and next level and the exact price; tapping it charges exactly that price, once. A second tap while the first is pending sends nothing (the 3.3 pending rule). A refused upgrade costs nothing and says why.
- **F2 "An upgrade only ever adds +25 % of the weapon's base damage."** Level L deals `base × (1 + 0.25 × (L − 1))` per bullet / pellet / swing / chainsaw tick: I = 100 %, II = 125 %, III = 150 %, IV = 175 %. Nothing else about the weapon changes (rate, range, spread, magazine, reload, knockback, pierce, arc, speed penalty). No hidden caps or rounding: a zombie at 6 HP hit by 6.0 dies.
- **F3 "Your upgrades belong to that weapon in your hands."** Swapping slots keeps both weapons' levels. Replacing a weapon (buying another into its slot) loses that weapon's levels; buying the same weapon type again later starts at I. Being downed, out, returning at a build start, or a decay stage change never changes a level.
- **F4 "Upgrades only in the build phase, only with your own wallet."** Nobody can upgrade during a wave, in the lobby, or in Results; nobody can upgrade or pay for another player's weapon.
- **F5 "Upgrades are the same for everyone."** Damage per level comes from one shared function the server, solo, the bots and the replay all use; the client never decides damage.

### Behaviour

1. **Shop row (FR17, FR46).** In a build phase, for each weapon I own below level IV, the shop's always-available section shows an Upgrade row: "SMG II → III · $120". At level IV the row reads "SMG IV · Max" and is disabled. Rows follow my slots (slot 0 first). A weapon I don't own has no row.
2. **Price.** Price per level = `round(upgrades.priceShare × upgradeBase)` where `upgradeBase` = the weapon's `upgradeBasePrice` if set, else its `price`; `priceShare` = 0.6. Every level costs the same (GDD: "60 % of the weapon's base price per level"). Table (current balance + Round A + 5.2):

   | Weapon | Base price | Upgrade base | Per level | I → IV total |
   | --- | --- | --- | --- | --- |
   | Pistol | 0 (free) | **100** (`upgradeBasePrice`) | **60** | 180 |
   | Machete | 150 | 150 | 90 | 270 |
   | SMG | 200 | 200 | 120 | 360 |
   | Shotgun (5.3) | 250 | 250 | 150 | 450 |
   | Fire Axe (5.2) | 300 | 300 | 180 | 540 |
   | Hunting Rifle | 350 | 350 | 210 | 630 |
   | Assault Rifle (5.3) | 450 | 450 | 270 | 810 |
   | Chainsaw (5.2) | 600 | 600 | 360 | 1,080 |

   Every weapon in `weapons.json` is upgradable (no list to keep in sync); a test iterates `weaponIds(balance)` so 5.4/5.5's weapons inherit it.
3. **Buy.** `upgradeWeapon(world, playerId, weapon)` (shared, `economy/shop.ts`) checks in order: build phase → known player → weapon is in one of the player's slots → level < `upgrades.maxLevel` (4) → `spendMoney`. On success the slot's `level` rises by 1, `weapon.upgraded { playerId, weapon, slot, level }` is emitted; nothing else in the slot changes (ammo, reload, cooldown, active slot). On any error nothing changes (`Result` error: `not_build`, `unknown_player`, `not_owned`, `max_level`, or the `SpendError`).
4. **Damage.** `weaponDamage(balance, weapon, level)` = `stats.damage × (1 + upgrades.damagePerLevel × (level − 1))` is the only damage source for player weapons: `firing.ts › tryFire` (`spawn.damage`), `melee.ts › swingMelee` (the swing's damage), 5.3's shotgun pellets, 5.2's chainsaw ticks and axe swings. Turrets are not weapons (unchanged).
5. **Network (online).** New `C2S.SHOP_UPGRADE` `{ weapon }` (zod via `this.net.guard`, same `^[a-z][a-z0-9_]*$` id rule, shared "other" bucket 10/s). The sender alone gets `shop.upgraded { weapon, slot, level }` or `shop.upgrade_refused { weapon, error }`. The level reaches every client through two new schema fields `level0` / `level1` (uint8, 0 = empty slot). The client shows the level only from state (pending until state agrees, brief 14).
6. **HUD (FR17 "the HUD slot shows the level").** The weapon panel shows the roman level after the name for both slots: "▶ SMG III 32/40 · Machete II". Level I shows no mark (clean default). The tier mark style comes from the Art pick (T0).
7. **Replace loses levels.** `buyWeapon` into an occupied slot creates a fresh slot (`createSlot` → `level: 1`). The "Replace which weapon?" dialog adds the line "Its upgrades are lost." when the replaced weapon is above I.
8. **Bots and sims.** `bots.json › shoppingList` accepts `upgrade:<weaponId>` entries (bought with the same `upgradeWeapon`); the 6-wave sim (`tools/sims/fiveWave.ts`, waves from `waves.json › runWaves`) runs with upgrades bought and asserts waves ended (brief 15).
9. **Replay.** `BuildCommand` gains `{ kind: "upgrade"; playerId; weapon }`; same seed + log → same `snapshotWorld` digest with an upgrade in the log (the slot spread in `snapshotWorld` already copies `level`).
10. **Dev switch.** `?loadout=smg:3,machete:2` (solo; levels 1–4, anything else → 1) through `validLoadout`; online the server's dev loadout path (if any) takes the same `id:level` form. No hand-edited JSON (brief 18).
11. **Tests (Vitest):** damage per level for every weapon (I–IV, exact values), prices per level for every weapon (incl. Pistol 60), the **SMG level III one-hit Runner** breakpoint (4 × 1.5 = 6 = Runner HP: one bullet kills, level II does not), refusals, replace loses levels, swap keeps levels, levels survive downed/out/return/decay stage change, server round trip, client shows server truth under `?lag=150&jitter=20`, replay digest, 6-wave sim liveness.

## Tasks / Subtasks

- [x] **T0 Art pick (first, before any build; brief 13).** Like 4.11 (`docs/art/4-11/README.md`): generate ~5 Meshy proposals (`nano-banana-pro`, text to image; shared style line from 4.11's README) for the **upgrade tier mark** I–IV, shown on the HUD weapon panel (and in the shop row): e.g. **U1** roman numerals in a stamped steel plate, **U2** 1–4 brass chevrons, **U3** coloured grip tape steel → bronze → silver → gold, **U4** 1–4 notches cut in a dog tag, **U5** a small weapon silhouette with 1–4 glowing pips. Put them on one private proposal page (Artifact), the designer picks; record picks + prompts in `docs/art/5-1/README.md` and the reference images in `docs/art/5-1/`. Build nothing visual before the pick. (AC 6)
- [x] **T1 Balance** (AC 2, 4)
  - [x] `shop.json › upgrades`: `{ "maxLevel": 4, "damagePerLevel": 0.25, "priceShare": 0.6 }` (zod in `balanceSchema.ts › shopSchema`; `maxLevel` int 1–15 (fits the uint8 and a nibble), `damagePerLevel` ≥ 0, `priceShare` > 0).
  - [x] `weapons.json › pistol.upgradeBasePrice: 100` (`common` in `balanceSchema.ts`: optional int ≥ 0). Cross-check in `balance.ts › crossCheck`: every weapon's upgrade price ≥ 1 (a free upgrade is a balance bug).
  - [x] Tests in `config/balance.test.ts`: `upgrades block is validated`, `pistol upgrade base is 100`, `every weapon has a non-zero upgrade price`.
- [x] **T2 Shared rules** (AC 3, 4, 7; F2, F3, F4, F5)
  - [x] `combat/loadout.ts`: `WeaponSlot.level: number` (1–maxLevel); `createSlot` → `level: 1`; `setLoadout(balance, loadout, weapons, levels?)` takes optional levels (dev switch).
  - [x] `combat/weapons.ts`: `weaponDamage(balance, weapon, level)` and `upgradePrice(balance, weapon)` (pure, no allocation; cached per balance is fine).
  - [x] `combat/firing.ts › tryFire`: `spawn.damage = weaponDamage(world.balance, slot.weapon, slot.level)`; `combat/melee.ts › swingMelee` gains a `damage` parameter (the caller passes `weaponDamage(...)`); 5.3's pellets and 5.2's axe/chainsaw use the same.
  - [x] `economy/shop.ts`: `upgradeWeapon(world, playerId, weapon): Result<Upgraded, UpgradeError>`; `ShopError`-style union `UpgradeError = "not_build" | "unknown_player" | "not_owned" | "max_level" | SpendError`; `shopUpgrades(balance, loadout)` → rows `{ weapon, name, slot, level, nextPrice | null }` (shop UI + bots).
  - [x] `core/simEvents.ts`: `weapon.upgraded { playerId, weapon, slot, level }`; `net/netEvents.ts`: encode/decode (own player only is enough; it is cheap to send to all).
  - [x] Export from `index.ts`.
  - [x] Tests: `combat/upgrades.test.ts` (new): `damage per level for every weapon (I–IV exact)`, `prices per level for every weapon (Pistol 60)`, `SMG level III kills a Runner with one bullet, level II needs two` (real `step`, real projectile, 1 Runner, assert `zombie.killed` after exactly 1 `weapon.fired`), `Hunting Rifle IV kills a 120 HP target in 2 shots` (Brute-ready breakpoint, uses a balance override if 5.7 is not merged), `melee level scales the swing`, `nothing but damage changes` (rate, ammo, reload ticks, cooldown, spread rolls identical between level I and IV over 200 ticks with a fixed seed). `economy/shop.test.ts`: `upgradeWeapon refusals in order`, `upgrade charges exactly the shown price`, `max level refused at IV`, `replace loses levels`, `swap keeps both levels`, `levels survive downed → out → return and a decay stage change` (`changeDecayStage`).
- [x] **T3 Every copy (brief 2)** (AC 5, 6)
  - [x] Schema `apps/server/src/rooms/schema/RunState.ts › PlayerState`: `level0`, `level1` (`t.uint8().default(0)`); `syncState.ts › syncPlayer` (write on change), `resetRunFields` (→ 0).
  - [x] `packages/shared/src/net/stateView.ts`: `PlayerStateView.level0/level1` + `PLAYER_STATE_FIELDS` (the compile-time check in RunState.ts catches a miss); `apps/client/src/net/fakeRoom.ts` defaults; devThrottle copies via the key list (nothing to write, verify by test).
  - [x] Mirror: `apps/client/src/sim/NetSimHost.ts › syncSlot` copies the level into the client World's slot (HUD reads the World as today).
  - [x] Predictor: nothing (levels don't affect movement). LocalFire (`net/localFire.ts`): nothing (cosmetic shots have no damage); say so in the merge notes.
  - [x] `snapshotWorld`: covered by the slot spread; add `level` to the digest test expectation.
  - [x] Server: `messages.ts › C2S.SHOP_UPGRADE`, `shopUpgradeSchema`, `S2C.SHOP_UPGRADED`, `S2C.SHOP_UPGRADE_REFUSED`; `RunRoom.onShopUpgrade` (mirrors `onShopBuy`, logs `shop_upgraded` / `shop_upgrade_refused`); `RunController.upgradeWeapon`.
  - [x] Client: `SimHost.upgradeWeapon(weapon)`; `LocalSimHost` (shared rule at once) and `NetSimHost` (send + answers queue like `buyWeapon`).
  - [x] Tests: `syncState.test.ts` (+ `levels are synced and reset`), `RunRoom.shop.test.ts` (+ `upgrade round trip: wallet, level0, answer to the sender only`, `upgrade refused in a wave`, `10 rapid taps cannot overspend`), `NetSimHost.shop.test.ts` (+ `level shown from state only`, `?lag throttle copies level0/level1`).
- [x] **T4 Shop UI and HUD** (AC 1, 6, 7; F1)
  - [x] `apps/client/src/ui/shopStore.ts`: `upgrade` input → `{ type: "upgrade", weapon }` effect; pending rule as for buy; answers `upgraded` / `upgrade_refused` (texts in `SHOP_TEXT`: "SMG upgraded to III", refusal texts per error); `replace` dialog adds "Its upgrades are lost." when the replaced slot's level > 1.
  - [x] `apps/client/src/ui/ShopScreen.tsx`: "Upgrades" section above Weapons, one row per owned weapon (`shopUpgrades`), disabled at Max or when short of money (the `--short` style).
  - [x] HUD: `scenes/hudModel.ts` gets `weaponLevel` / `otherWeaponLevel`; `HudScene.drawWeapon` draws the picked tier mark (T0) after the names; redraw only on change (the existing `shown*` guards).
  - [x] `scenes/GameScene.ts`: `e.type === "upgrade"` effect → `host.upgradeWeapon`.
  - [x] Tests: `shopStore.test.ts` (+ `upgrade pending until the answer`, `max row disabled`, `replace warns when levels would be lost`), `hudModel` test for the roman mark (I shows nothing).
- [x] **T5 Bots, replay, dev switch** (AC 8, 9, 10)
  - [x] `replay/inputLog.ts`: `kind: "upgrade"` → `upgradeWeapon`; test `replay with an upgrade gives the same digest` (assert the level really rose: liveness).
  - [x] `bots/botShop.ts`: `upgrade:<id>` shopping entries; `botShop.test.ts` (+ `bot upgrades its SMG twice when it can afford it`).
  - [x] `scenes/validLoadout.ts` + its test: `id:level` parsing (`smg:3` → level 3; `smg:9` → 1; `smg:x` → 1).
- [x] **T6 Sims and balance evidence** (brief 15, 9)
  - [x] `economy/fiveWaveSim.test.ts` (or the 6-wave version once 5.8 sets `runWaves` 6): a bot list with upgrades; assert waves ended, ≥ 1 upgrade bought, ≥ 1 kill by an upgraded weapon (count `zombie.killed` whose killer's slot level > 1 at that tick).
  - [x] Run `npx tsx tools/sims/fiveWave.ts --players 2,3,4 --seeds 1-6 --list smg,upgrade:smg,upgrade:smg,wood_barricade` and record per-player spend in the story (not difficulty evidence, brief 15).
- [x] **T7 Gates.** Mutations (brief 9): list in the Completion Notes (e.g. `damagePerLevel` applied to rate; level reset on swap; upgrade allowed in wave; price uses `price` for the Pistol) and which tests failed. Browser check (Playwright): solo `?wallet=500&loadout=smg`, upgrade twice, HUD shows III, a Runner dies to one bullet; online two tabs, the other tab sees nothing change but my HUD does after state. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values are in the ACs)

1. **Pistol upgrade base = 100 → 60 per level** (GDD names "Pistol: 60 per level" but the Pistol is free). Recommended: `upgradeBasePrice: 100` on the Pistol only.
2. **Same price every level** (60 % × base for I→II, II→III and III→IV). GDD wording "60 % per level". Alternative: rising (60 / 90 / 120 % of base). Recommended: flat.
3. **Upgrades change damage only** (no reload/rate perks). Recommended: damage only (GDD).
4. **Level I shows no mark; II–IV show the picked tier mark** in HUD and shop. Teammates don't see your levels in the world (survivor sprites are ~40 px on a phone; a mark would be noise). Recommended: HUD + shop only.
5. **Losing upgrades on replace is warned** in the "Replace which weapon?" dialog ("Its upgrades are lost."). Recommended: yes.
6. **Fractional damage is kept exactly** (8.75 for Pistol IV; zombie HP is float). Recommended: exact, no rounding (F2).
7. **Upgrade art style** (T0): U1–U5 above; recommended starting point **U1** (stamped roman plate: readable at 12 px, fits Dead City).

### Current state (read before changing)

- `combat/loadout.ts`: `WeaponSlot { weapon, ammo, reloadTicks, cooldownS }`, `createSlot`, `setLoadout`. No level.
- `combat/firing.ts › tryFire` sets `spawn.damage = stats.damage` (one place); `melee.ts › swingMelee` calls `applyZombieDamage(world, id, stats.damage, …)` (one place). Turret shots are in `buildings/turret.ts` (untouched).
- `economy/shop.ts`: fixed-list shop (Story 3.3), `buyWeapon` (phase → player → for sale → owned → slot → `spendMoney`), `shopWeapons`, `shopPrice`, `owns`, `botShopPick`. Replacing a weapon calls `createSlot` (so levels reset for free once `createSlot` sets level 1).
- `shop.json` is `{ "weapons": [...] }` (Round A adds `shotgun`, `assault_rifle`; 5.2 adds `fire_axe`, `chainsaw`). 5.13 replaces the list with cards later; upgrades stay in its always-available section (GDD › Item and Upgrade System).
- Server: `RunRoom.onShopBuy` → `RunController.buyWeapon`; schema `PlayerState.weapon0/1`, `ammo0/1`, `reloadTicks0/1`; `syncState.ts` writes on change; `resetRunFields` clears.
- Client: `ShopScreen.tsx` + `shopStore.ts` (pure state machine, pending + answers), `HudScene.drawWeapon` (`m.weaponName`, `m.otherWeaponName`), `NetSimHost.syncSlot` copies weapon/ammo/reload into the client World.
- `core/worldSnapshot.ts` spreads each slot (`{ ...s }`), so `level` joins the digest automatically.
- Damage on the wire: `zombie.hit` sends `tenths(damage)` (8.75 → 88 tenths; the number floaters show 8.8). Fine.

### Must be preserved

Story 3.3 shop rules and tests; 2.7 local fire clock and confirmation; 2.12 spread keyed to the seq (an upgrade must not consume an RNG draw); 4.4 replay digest; every existing number (no balance change besides the new fields).

### Copies touched (brief 2)

World (`WeaponSlot.level`) → schema (`level0`, `level1`) → `syncState` (+ `resetRunFields`) → `PlayerStateView` / `PLAYER_STATE_FIELDS` → `fakeRoom` → devThrottle (key list, automatic) → mirror (`NetSimHost.syncSlot`) → Predictor (none: movement unaffected) → `snapshotWorld` (slot spread).

### Beat the rule (for the reviewer; brief 4 — try each, record the result)

1. Tap Upgrade 10× in 100 ms online (guard bucket 10/s): pays more than once? Level skips?
2. Upgrade at the last tick of the build phase / first tick of the wave (phase race on the server).
3. Upgrade, then replace the weapon, then buy it back: does it come back upgraded?
4. Swap slots mid-swap and upgrade; upgrade while reloading: does ammo/reload change?
5. Send `shop.upgrade` for a weapon in a teammate's hands / a weapon not owned / a made-up id / uppercase id.
6. Upgrade while downed or out in the build phase (allowed: wallet is yours; confirm it is the intended rule and the level survives return).
7. Use `?loadout=smg:9` / `?wallet` online without `DEV_STARTING_WALLET` (must be refused as today).
8. Compare damage of level IV vs I over 1,000 ticks: is anything but damage different (rate, spread roll sequence)?
9. Hidden tab across a build start with a pending upgrade: does the HUD show the server's level when it wakes?
10. Damage number rounding: Pistol IV (8.75) vs a Walker (10 HP): exactly 2 hits; a Crawler (8 HP): 1 hit.

### Bandwidth (brief 11)

`level0/level1` change only on an upgrade or a buy: a few bytes per build phase per player (~0 B/s). `weapon.upgraded`: one small event per upgrade (~15 B). `zombie.hit` damage values are unchanged in size. Added: **≈ 0 B/s**. Report it with `economyBandwidth.test.ts` style measurement (+1 case).

### Phone FPS (brief 12)

Only the HUD tier mark is new: a few frames in the existing UI atlas or a text glyph; drawn only on change. No per-frame cost. Run `?stress=150` once with an upgraded loadout and report headless FPS before/after with the machine load.

### Testing standards

Vitest beside the code; one mechanic per test with `systems: { waves: () => {} }` where waves would interfere; integration via `bootTestServer()`; no timing asserts outside `PERF_ASSERT=1`; every sim/replay test asserts something happened (an upgrade bought, a kill by an upgraded weapon).

### Dependencies

- **Round A 5.3 (Shotgun, Assault Rifle)** must be merged first: their pellets/bullets take `weaponDamage(...)`; the price table includes them. If 5.3 builds pellets in its own function, route its damage through `weaponDamage` there.
- **5.2 (Fire Axe, Chainsaw)** runs in parallel with this story (same round): whoever merges second routes the axe swing / chainsaw tick damage through `weaponDamage` (and `swingMelee`'s new `damage` parameter). The "every weapon" tests iterate `weaponIds(balance)`, so they cover 5.2 automatically.
- **5.7 (Brute)** parallel: no code overlap; the Hunting Rifle IV two-shot test uses a 120 HP override until the Brute exists.
- **5.13 (card shop)** later: keep `upgradeWeapon` and `shopUpgrades` independent of the fixed list.

### Notes for the merge (brief 19)

- `combat/loadout.ts` (`WeaponSlot.level`): 5.2/5.3 may add slot fields (fuel, chainsaw state); keep `level` and `createSlot` → 1.
- `combat/melee.ts` (`swingMelee(…, damage)` signature): 5.2 extends the same function for knockback / continuous; resolve by keeping one function with both parameters.
- `combat/firing.ts` (`spawn.damage`): 5.3 adds pellet loops here; each pellet's damage = `weaponDamage`.
- `economy/shop.ts`, `shop.json`: 5.2 and 5.3 append weapon ids; keep the `upgrades` block.
- `balanceSchema.ts › common`: 5.2 adds `wielderSlowPct` etc., 5.3 may use `knockbackM`; add `upgradeBasePrice` beside them.
- Schema / stateView / fakeRoom: 5.2 may add nothing; 5.7 nothing; Round A 5.6/5.9 may add fields: append both, regenerate nothing by hand.
- `messages.ts`: new C2S/S2C names appended (no renumbering; messages are strings).
- `replay/inputLog.ts` `BuildCommand`: 5.9 may add building commands; append.

### References

- `_bmad-output/planning-artifacts/epics.md` › Epic 5 intro, Story 5.1; FR17, FR46.
- GDD (`planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md`) › Weapon Systems (Upgrades, weapon table), Item and Upgrade System, Economy (spending: "upgrades 60 % of base price per level").
- `game-architecture.md` (shared sim, balance JSON, server-authoritative).
- Story files 3.3 (shop), 3.2 (wallets), 2.7 (local fire), 4.4 (replay), 3.10 (bots, sims).
- HANDOFF.md §3 (lessons), §4 (balance frozen until 4.10; 4.10 now deferred).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), builder in worktree `.claude/worktrees/story-5-1` (branch `story-5-1`), method `gds-dev-story`.

### Debug Log References

- T0: the Meshy "Art pick" step was skipped on instruction. The designer already chose in round B (`docs/epic-5-decisions.md`): upgrade mark **U1** (stamped roman-numeral plate); Shotgun icon **G1 → G3** and Assault Rifle **R2 → R1** at levels III–IV. All three were ported from the code drawings (`docs/art/epic-5/round-b/looks.html › plateU1, drawG3`, `docs/art/epic-5/round-a/code-drawings.html › drawR1`) into game code (`render/city/weaponArt.ts`). No `docs/art/5-1/` folder (no Meshy references).
- Online browser check, first run: one tap seemed to upgrade twice (I → III). Cause: my script's second, forced click came after the first answer had cleared `pending` (150 ms lag), so it was a real second tap. Re-checked with three clicks in the same instant (`b.click(); b.click(); b.click()` before any re-render or answer): exactly one upgrade (III → IV, $380 → $320). No code change.
- Mutation M14 (HUD marks level I) survived at first: the mutation was equivalent (the numeral table had "" at index 1). Re-run with a real mutation ("I" at index 1): killed.

### Completion Notes List

**What was built**

- **Balance** (`shop.json › upgrades { maxLevel 4, damagePerLevel 0.25, priceShare 0.6 }`, `weapons.json › pistol.upgradeBasePrice 100`), validated in `balanceSchema.ts` (`shopSchema.upgrades` strict, `common.upgradeBasePrice` optional int ≥ 0). `crossCheck` refuses any weapon whose upgrade price rounds to 0.
- **The one damage helper:** `weaponDamage(balance, weapon, level)` in `packages/shared/src/combat/weapons.ts` = `damage × (1 + damagePerLevel × (level − 1))`, exact, no rounding. `upgradePrice(balance, weapon)` beside it. `tryFire` sets `spawn.damage` from it (bullets and every Shotgun pellet); `swingMelee` gained a `damage` parameter (after `stats`) and the caller passes `weaponDamage(…, slot.level)`.
- **Loadout:** `WeaponSlot.level` (1–4); `createSlot` → 1 (so a replace or a re-buy starts at I); `setLoadout(…, levels?)` and `validLevel` for the dev switch. Swaps, downs, outs, returns and decay changes never touch it.
- **Shop rule:** `upgradeWeapon(world, playerId, weapon)` in `economy/shop.ts`: build phase → known player → in one of *my* slots → below max → `spendMoney`; on success only `level` rises and `weapon.upgraded { playerId, weapon, slot, level }` is emitted. Error union `WeaponUpgradeError` (named apart from 5.9's `UpgradeError`). `shopUpgrades` (rows), `upgradePriceTable`, `romanLevel`.
- **Every copy (brief 2):** World `WeaponSlot.level` → schema `PlayerState.level0/level1` (uint8, 0 = empty slot) → `syncState` (on change) + `resetRunFields` → `PlayerStateView` + `PLAYER_STATE_FIELDS` → `fakeRoom` → devThrottle (key list, tested) → mirror `NetSimHost.syncSlot` (copies the level) → Predictor: nothing (movement unaffected) → LocalFire: nothing (cosmetic shots carry no damage) → `snapshotWorld` (slot spread; tested).
- **Network:** `C2S.SHOP_UPGRADE { weapon }` (zod via `this.net.guard`, shared "other" bucket), `S2C.SHOP_UPGRADED { weapon, slot, level }` / `S2C.SHOP_UPGRADE_REFUSED { weapon, error }` to the sender only; `RunRoom.onShopUpgrade` → `RunController.upgradeWeapon`; logs `shop_upgraded` / `shop_upgrade_refused`. Net event kind `WEAPON_UPGRADED: 31` (5 small ints).
- **Client:** `SimHost.upgradeWeapon` (Local: shared rule at once; Net: send). `ShopAnswer` gained `kind: "upgrade"` variants; `session.ts` parses both answers. `shopStore`: `upgrade` action → one effect, `pending = "upgrade:<id>"` (one purchase at a time, the 3.3 rule); levels come from `sync` (the World; online the state); texts "SMG upgraded to III", refusals per error; `replaceWarning` ("Its upgrades are lost."). `ShopScreen`: an **Upgrades** section above Weapons, one row per owned weapon (slot 0 first) with the weapon's icon at its current level, U1 plates "I → II" and the price; at IV "Max", disabled; short money uses the `--short` style.
- **Art (game code):** `drawTierPlate` (U1) + `tierMarkUrl` (shop) and FX-atlas frames `fx_tiermark_b/c/d` (II–IV, 3× scale) for the HUD; `drawShotgunTactical` (G3) and `drawAssaultRifleModern` (R1) side-view icons, used by `weaponIconUrl(weapon, level)` from level III (`UPGRADE_LOOK_LEVEL`, presentation only). The held top-down sprites are unchanged (designer decision 4: teammates don't see levels in the world).
- **HUD:** `hudModel.weaponLevel / otherWeaponLevel`; `HudScene.drawWeapon` lays each line out right to left (count, U1 plate, name); level I shows no plate (`hudTierMark`); redrawn only on change (the existing `shown*` guards + `shownLevel/shownOtherLevel`).
- **Bots, replay, dev switch:** `bots.json › shoppingList` accepts `upgrade:<id>` (k-th entry = "level ≥ k + 1"; not held → next; too dear → stop), through the same `upgradeWeapon`, recorded as `BuildCommand { kind: "upgrade" }`; `tools/bots/botClient.ts` does the same over the wire. `headlessRun` logs `upgrades[]` and `upgradedKills`. `?loadout=smg:3,machete:2` (solo; bad level → 1) via `validLoadout(entries, known, maxLevel)`.

**Fairness rules → tests**

| Rule | Tests |
| --- | --- |
| F1 what you see is what you pay | `shop.test › upgrade charges exactly the shown price…`, `shopStore.test › upgrade pending until the answer…`, `› max row disabled…`, `RunRoom.shop.test › 10 rapid taps cannot overspend`, browser triple tap |
| F2 +25 % of base per level, nothing else | `upgrades.test › damage per level for every weapon (I–IV exact)`, `› SMG level III kills a Runner with one bullet…`, `› Hunting Rifle IV kills a 120 HP target in 2 shots`, `› melee level scales the swing`, `› Shotgun pellets carry the upgraded damage`, `› nothing but damage changes … over 200 ticks` |
| F3 belongs to that weapon in your hands | `shop.test › replace loses levels…`, `› swap keeps both levels`, `› levels survive downed → out → return and a decay stage change` |
| F4 build phase, own wallet only | `shop.test › upgradeWeapon refusals in order…` (incl. a teammate asking for my weapon), `RunRoom.shop.test › upgrade round trip…` (guest's request for the host's SMG refused `not_owned`), `› upgrade refused in a wave…` |
| F5 same for everyone | one `weaponDamage` used by `step` (server, solo, bots, replay); `replay.test › Story 5.1: replay with an upgrade gives the same digest`; client mirror only copies `level0/level1` |

**Beat the rule (brief 4) — my attempts**

1. 10 taps in 100 ms online: server test sends 10 `shop.upgrade` at once with $150 → exactly II and III bought ($120), the rest `insufficient_funds`; no level skipped. Browser: 3 synchronous clicks → one upgrade. **Holds.**
2. Upgrade on the first wave tick: `upgradeWeapon` reads `world.run.phase` between ticks on the server; `startWave` then upgrade → `not_build`, wallet unchanged (`RunRoom.shop.test`). **Holds.**
3. Upgrade, replace, buy back: comes back at I (`shop.test › replace loses levels`). **Holds.**
4. Upgrade while reloading / mid-swap: ammo 7, reloadTicks 5, cooldown, active slot unchanged (`shop.test › upgrade charges exactly…`); swap keeps levels. Swapping is impossible in a build anyway (no fire input matters). **Holds.**
5. Teammate's weapon / not owned / made-up / uppercase id: `not_owned` (made-up, teammate's) and dropped by zod (uppercase, extra `level` field). **Holds.**
6. Upgrade while downed/out in a build: allowed (own wallet; `startBuild` returns everyone first, so in practice nobody is downed in a build); level survives the return (tested). **Holds (intended).**
7. `?loadout=smg:9` / online: `validLoadout` maps 9 → 1; online `?loadout` is ignored (solo only, unchanged); `?wallet` online still needs `DEV_STARTING_WALLET` (balance version check, unchanged). **Holds.**
8. Level IV vs I over 200 ticks with a fixed seed: identical ammo/reload/cooldown traces and spread directions (`upgrades.test`). An upgrade draws no random number. **Holds.**
9. Hidden tab across a pending upgrade: the guest's loop slept 1 s and woke; it showed the host's level from state, its own HUD unchanged (browser). Not tested: a sleep across a build start with a pending upgrade (the 3 s pending timeout clears it; the level is read from the World every frame).
10. Pistol IV (8.75) vs Walker 10 HP → 2 hits; vs Crawler 8 HP → 1 hit (exact damage, no rounding: `weaponDamage` spot values; HP is float). **Holds.**

**Mutations (brief 9), each new test mutated once — all killed**

M1 `damagePerLevel` applied to the fire rate → `nothing but damage changes`. M2 level reset on swap → `swap keeps both levels`. M3 upgrade allowed in a wave → `refusals in order`, `upgrade refused in a wave`. M4 Pistol price from `price` → `prices per level`, `charges exactly the shown price`. M5 bullets ignore the level → SMG III Runner, Rifle IV 120 HP, pellets. M6 melee ignores `damage` → `melee level scales the swing`. M7 replace keeps the old level → `replace loses levels`. M8 `syncState` never writes `level1` → `levels are synced…`. M9 levels written every tick (no change guard) → four `syncState` change-guard tests. M10 mirror doesn't copy the level → `level shown from state only`. M11 upgrade tap sets no pending → `upgrade pending until the answer`. M12 replay ignores upgrade commands → replay digest test. M13 bots skip upgrade entries → 2 botShop tests + the 5-wave upgrade sim. M14 HUD marks level I → hudModel test (see Debug Log). M15 `?loadout` levels ignored → validLoadout test. M16 wire event drops the slot → netEvents round trip. M17 snapshot drops the level → snapshot test. M18 max level off by one → 3 tests. M19 upgrade doesn't charge → 4 tests. M20 zero-price cross-check removed → `every weapon has a non-zero upgrade price`.

**Liveness (brief 9):** the Runner/Rifle tests assert the kill and the shot count; the replay test asserts ≥ 2 upgrade commands and a level > 1 after replay; the sim asserts ≥ 1 upgrade bought and ≥ 1 kill by an upgraded weapon; the swap test asserts the swap happened; the 200-tick test asserts > 40 shots and a reload; the bandwidth test asserts 8 upgrade events.

**Sims (brief 15; not difficulty evidence).** `npx tsx tools/sims/fiveWave.ts --players 2,3,4 --seeds 1-6 --list smg,upgrade:smg,upgrade:smg,wood_barricade` (5 waves: `runWaves` is still 5 until 5.8): 2p held out 4/6 (2 wiped in W5), earned mean 612 (492–722); 3p held out 6/6, mean 578 (446–655); 4p held out 6/6, mean 547 (438–705). Spend per player 320–480 (SMG 200 + one or two upgrades at 120); most bots afford upgrade 1 in W4–W5 and upgrade 2 in W5. The test version (2p/4p × seeds 1–2): 21 upgrades, 852 kills by an upgraded weapon, every run ended.

**Bandwidth (brief 11):** `economyBandwidth.test › Story 5.1`: 8 upgrades (4 players × 2) cost a 16 B `level0/level1` patch once and 8 `weapon.upgraded` events, 48 B in total (6 B each); 0.0 B/s during the following wave. Added: **≈ 0 B/s**.

**Phone FPS (brief 12)** — headless Chromium (SwiftShader), dev server, 844 × 390 @ DPR 2, `?stress=150&stressfire=1`, 30 s each, interleaved, machine load climbing from other builders: `loadout=smg` (I, no mark) 15.3 avg / worst 11.9 fps at load 2.3→3.8; `smg:4` (IV, U1 plate shown) 12.3 / 9.2 at load 3.8→5.3; `smg` 8.8 / 6.6 at load 5.3→7.0; `smg:4` 8.5 / 6.1 at load 7.0→8.3. The drop follows the load (each run is slower than the one before it, whatever the level); between neighbours at the same load (runs 3/4) the difference is noise. New per-frame cost: none (the plate is 3 atlas frames, set only on change; shop icons are cached data URLs).

**Perf (brief 16):** the only sim change per tick is one multiply per shot/swing in `weaponDamage` (no allocation). Tick-cost asserts not run at load < 1 (the box never got below 2 during this session).

**Gate:** `npm run typecheck && npm run lint && npm test && npm run build` green — 216 test files passed (1 skipped), 1,633 tests passed (3 skipped); `uptime` load 8.0 → 9.1 during the gate (other builders running). The work branch (`claude/gracious-turing-0db3j6`) has only doc commits since this base; `git merge-tree` says it merges cleanly.

**Browser check (Playwright, dev build):** solo `?solo=1&wallet=500&loadout=smg,shotgun:2`: shop rows "SMG I → II $120", "Shotgun II → III $150"; two taps → SMG III, wallet 500 → 260, message "SMG upgraded to III"; the replace dialog warns "Its upgrades are lost." on both upgraded slots; HUD shows the III plate after SMG and II after Shotgun; a Runner spawned 4 m away died to **one** SMG bullet (damage 6). `loadout=shotgun:3,assault_rifle:4`: G3 and R1 icons, "Assault Rifle IV · Max" disabled. Online (server :4517, `DEV_STARTING_WALLET=500 DEV_NO_WAVES=1`, both tabs `?lag=150&jitter=20`): the row shows "Buying…" and is disabled until the answer; my level changes only when the state does; the guest sees p0's level in its mirror but its own HUD stays at I; three synchronous taps → one upgrade; guest loop sleep/wake → still server truth. No page errors. Screenshots: `docs/art/epic-5/round-b/ingame/5-1-shop-upgrades.png`, `5-1-hud-mark.png`, `5-1-shop-tier-looks.png`.

### Notes for the merge (brief 19)

- **Damage helper for 5.2 (axe swing, chainsaw tick):** `weaponDamage(balance, weapon, level)` in `packages/shared/src/combat/weapons.ts` (exported from `@topdown/shared`). Pass the wielder's `slot.level` (`activeSlot(p.loadout).level`). `swingMelee` now takes `damage` as its 5th parameter (after `stats`, before `dirX`); `firing.ts` passes `weaponDamage(world.balance, slot.weapon, slot.level)`. If 5.2 adds knockback/continuous parameters to `swingMelee`, keep one function with both. The chainsaw tick must also take its per-tick damage from `weaponDamage` (5.2's "6 per tick" is the level-I value).
- `combat/loadout.ts`: `WeaponSlot.level` + `createSlot → level: 1` + `setLoadout(…, levels?)` + `validLevel`. 5.2 may add slot fields (fuel, chainsaw state): keep both.
- `combat/firing.ts`: one line each (`spawn.damage = weaponDamage(…)`, the `swingMelee` call).
- `economy/shop.ts`: new block at the end (`upgradeWeapon`, `WeaponUpgradeError`, `WeaponUpgraded`, `shopUpgrades`, `upgradePriceTable`, `romanLevel`); `shop.json` gained `upgrades` (5.2 appends weapon ids to `weapons`: keep both). 5.2's new weapons need no upgrade work: every weapon in `weapons.json` is upgradable and the tests iterate `weaponIds(balance)` (the price test already expects Fire Axe 180 and Chainsaw 360 when they exist).
- `config/balanceSchema.ts › common`: `upgradeBasePrice` added after `name` (5.2 adds `wielderSlowPct` etc.: keep both). `shopSchema.upgrades` and `botsSchema.shoppingList` (now accepts `upgrade:<id>`). `config/balance.ts › crossCheck`: one block after the shop-id check.
- `core/simEvents.ts`: `weapon.upgraded` appended before `test.ping`. `net/netEvents.ts`: `WEAPON_UPGRADED: 31` — if 5.2 or 5.7 also took 31, renumber one of them (never reuse); encode/decode cases appended.
- `net/messages.ts`: `C2S.SHOP_UPGRADE`, `S2C.SHOP_UPGRADED`, `S2C.SHOP_UPGRADE_REFUSED`, `shopUpgradeSchema`, `ShopUpgraded`, `ShopUpgradeRefused` appended (strings, no renumbering).
- Schema / stateView / fakeRoom: `level0`, `level1` after `swapTicks` (append alongside any other new fields).
- `replay/inputLog.ts › BuildCommand`: `{ kind: "upgrade" }` appended. `bots/botShop.ts`: `BotShopSelf.level0/level1` (optional), `upgrades` in `BotShopResult`, `UPGRADE_ENTRY_PREFIX`/`upgradeEntryWeapon`. `bots/headlessRun.ts`: `upgrades`, `upgradedKills` in the log.
- `index.ts`: `validLevel`, `upgradePrice`, `weaponDamage` on the existing loadout/weapons export lines; a new Story 5.1 export line after the shop block; `shopUpgradeSchema` + types in the messages block; `UPGRADE_ENTRY_PREFIX`, `upgradeEntryWeapon` in the botShop block.
- Client: `render/city/weaponArt.ts` (helpers `rivet(hex)`, `polyTex(check)`, `part({ lit, stroke })` extended without changing old output; new block before `WEAPON_ART`; `weaponIconUrl(weapon, level = 1)`). `render/city/spriteAtlas.ts`: `FX_TIER_MARKS` frames in the FX atlas. `HudScene.drawWeapon` now uses two texts per line (name + count) plus a plate image. `ShopAnswer` (SimHost.ts) has optional `kind`. `GameScene`: the `upgrade` effect, the shop `open`/`sync` inputs, the HUD levels, the `?loadout` call.
- LocalFire / Predictor: untouched (cosmetic shots carry no damage; levels don't affect movement).

### Not verified

- Real phones (FPS, plate readability at 12 px on a 6" screen); headless Chromium only, ~8–15 fps under a machine load of 2–8.
- Tick cost at load < 1 (`PERF_ASSERT=1`): the box stayed at load ≥ 2.
- A hidden tab that sleeps *across a build start* with an upgrade pending (only a 1 s sleep within the build phase was checked).
- A late Game scene start with upgraded levels in the state (covered in principle by `syncSlot` reading every patch; not run in a browser).
- The 6-wave sim: `runWaves` is still 5 (5.8 makes it 6); the 5-wave sim ran.
- The held top-down G3/R1 sprites: not drawn (icons only); the designer's "III–IV look" was applied to the shop icons.
- During cleanup I ran `pkill -f "tsx src/index.ts"` to stop my :4517 server; that pattern would also have stopped another builder's dev server if one was running at that moment.

### File List

- `_bmad-output/implementation-artifacts/5-1-weapon-upgrades-i-iv.md`
- `packages/shared/src/config/balance/shop.json`, `packages/shared/src/config/balance/weapons.json`
- `packages/shared/src/config/balanceSchema.ts`, `packages/shared/src/config/balance.ts`, `packages/shared/src/config/balance.test.ts`
- `packages/shared/src/combat/loadout.ts`, `packages/shared/src/combat/weapons.ts`, `packages/shared/src/combat/firing.ts`, `packages/shared/src/combat/melee.ts`, `packages/shared/src/combat/upgrades.test.ts` (new)
- `packages/shared/src/economy/shop.ts`, `packages/shared/src/economy/shop.test.ts`, `packages/shared/src/economy/fiveWaveSim.test.ts`
- `packages/shared/src/core/simEvents.ts`, `packages/shared/src/net/netEvents.ts`, `packages/shared/src/net/netEvents.test.ts`, `packages/shared/src/net/messages.ts`, `packages/shared/src/net/stateView.ts`
- `packages/shared/src/bots/botShop.ts`, `packages/shared/src/bots/botShop.test.ts`, `packages/shared/src/bots/headlessRun.ts`
- `packages/shared/src/replay/inputLog.ts`, `packages/shared/src/replay/replay.test.ts`
- `packages/shared/src/index.ts`
- `apps/server/src/rooms/schema/RunState.ts`, `apps/server/src/rooms/schema/syncState.ts`, `apps/server/src/rooms/schema/syncState.test.ts`
- `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/rooms/RunRoom.shop.test.ts`, `apps/server/src/run/RunController.ts`, `apps/server/src/run/economyBandwidth.test.ts`
- `apps/client/src/sim/SimHost.ts`, `apps/client/src/sim/LocalSimHost.ts`, `apps/client/src/sim/NetSimHost.ts`, `apps/client/src/sim/NetSimHost.shop.test.ts`
- `apps/client/src/net/session.ts`, `apps/client/src/net/fakeRoom.ts`
- `apps/client/src/ui/shopStore.ts`, `apps/client/src/ui/shopStore.test.ts`, `apps/client/src/ui/ShopScreen.tsx`, `apps/client/src/ui/overlay.css`
- `apps/client/src/scenes/GameScene.ts`, `apps/client/src/scenes/HudScene.ts`, `apps/client/src/scenes/hudModel.ts`, `apps/client/src/scenes/hudModel.test.ts` (new)
- `apps/client/src/scenes/validLoadout.ts`, `apps/client/src/scenes/validLoadout.test.ts`
- `apps/client/src/debug/urlOptions.ts`, `apps/client/src/debug/urlOptions.test.ts`
- `apps/client/src/render/city/weaponArt.ts`, `apps/client/src/render/city/spriteAtlas.ts`
- `tools/bots/botClient.ts`
- `docs/art/epic-5/round-b/ingame/5-1-shop-upgrades.png`, `5-1-hud-mark.png`, `5-1-shop-tier-looks.png` (new)

### Review fixes (2026-11-23)

- **MEDIUM (F1, brief 12/14) fixed:** an accepted upgrade answer could arrive before the state patch, so `pending` cleared while the row still showed the old level and wallet; a quick second tap bought a second upgrade from a stale "I → II" row. `shopStore` now keeps an accepted upgrade pending (`awaitLevel { slot, level }`) until a `sync` shows `levels[slot] >= level` (as `botClient` does); the 3 s timeout stays as the fallback and clears it too. Solo is unaffected (the answer and the sync land in the same frame). Tests: `shopStore.test › upgrade pending until the answer…` now asserts the answer alone keeps it pending and a wallet-only sync too; new `› review probe: open → upgrade → ok answer → upgrade with no sync between sends ONE effect` (plus the honest next tap after the sync, and the timeout fallback). This explains the browser observation in the Debug Log ("one tap seemed to upgrade twice") as the same race, not only a script artefact.
- **LOW 1 fixed:** `shop.json › upgrades.maxLevel` is capped at 4 in the schema (levels I–IV are the design; the HUD marks and `fx_tiermark_b/c/d` cover II–IV). `balance.test › upgrades block is validated` refuses 5.
- **LOW 2 accepted (no change):** the shop's "I → II" row shows a U1 plate with "I" for the current level (the HUD shows no mark at I).
- Mutations of the new/changed tests, all killed: R1 ok answer unlocks at once (the old bug) → both pending tests; R2 sync never unlocks → both; R3 any sync unlocks → the pending test; R4 timeout keeps `awaitLevel` → the probe; R5 `maxLevel` up to 15 → the schema test.
- Files: `apps/client/src/ui/shopStore.ts`, `apps/client/src/ui/shopStore.test.ts`, `packages/shared/src/config/balanceSchema.ts`, `packages/shared/src/config/balance.test.ts`, this story file.
- Gate (load 4 → 16, other builders running): typecheck, lint and build green; `npm test` 7 tests in `replay.test`, `tickCostFlowField.test` and `waveDirector.test` hit the 5 s default timeout at load 15.9 (TestTimeoutError, no assertion failed; the work branch raised the replay timeout to 30 s); re-run with `--testTimeout=60000` at load 16: those 3 files, 33/33 passed. All other files passed.

### Change Log

- 2026-11-23: Story 5.1 built: weapon upgrades I–IV (shared rule, damage helper, balance, schema/mirror copies, shop Upgrades section, U1 HUD/shop marks, G3/R1 tier icons, bots, replay, `?loadout=id:level`), tests and mutations, browser check, sims, bandwidth. Status → review.
- 2026-11-23: Review fixes: upgrade stays pending until the state shows the level (MEDIUM); maxLevel capped at 4 (LOW 1); LOW 2 noted.
