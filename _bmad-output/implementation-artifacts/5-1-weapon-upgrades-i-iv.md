# Story 5.1: Weapon upgrades I–IV

Status: ready-for-dev

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

- [ ] **T0 Art pick (first, before any build; brief 13).** Like 4.11 (`docs/art/4-11/README.md`): generate ~5 Meshy proposals (`nano-banana-pro`, text to image; shared style line from 4.11's README) for the **upgrade tier mark** I–IV, shown on the HUD weapon panel (and in the shop row): e.g. **U1** roman numerals in a stamped steel plate, **U2** 1–4 brass chevrons, **U3** coloured grip tape steel → bronze → silver → gold, **U4** 1–4 notches cut in a dog tag, **U5** a small weapon silhouette with 1–4 glowing pips. Put them on one private proposal page (Artifact), the designer picks; record picks + prompts in `docs/art/5-1/README.md` and the reference images in `docs/art/5-1/`. Build nothing visual before the pick. (AC 6)
- [ ] **T1 Balance** (AC 2, 4)
  - [ ] `shop.json › upgrades`: `{ "maxLevel": 4, "damagePerLevel": 0.25, "priceShare": 0.6 }` (zod in `balanceSchema.ts › shopSchema`; `maxLevel` int 1–15 (fits the uint8 and a nibble), `damagePerLevel` ≥ 0, `priceShare` > 0).
  - [ ] `weapons.json › pistol.upgradeBasePrice: 100` (`common` in `balanceSchema.ts`: optional int ≥ 0). Cross-check in `balance.ts › crossCheck`: every weapon's upgrade price ≥ 1 (a free upgrade is a balance bug).
  - [ ] Tests in `config/balance.test.ts`: `upgrades block is validated`, `pistol upgrade base is 100`, `every weapon has a non-zero upgrade price`.
- [ ] **T2 Shared rules** (AC 3, 4, 7; F2, F3, F4, F5)
  - [ ] `combat/loadout.ts`: `WeaponSlot.level: number` (1–maxLevel); `createSlot` → `level: 1`; `setLoadout(balance, loadout, weapons, levels?)` takes optional levels (dev switch).
  - [ ] `combat/weapons.ts`: `weaponDamage(balance, weapon, level)` and `upgradePrice(balance, weapon)` (pure, no allocation; cached per balance is fine).
  - [ ] `combat/firing.ts › tryFire`: `spawn.damage = weaponDamage(world.balance, slot.weapon, slot.level)`; `combat/melee.ts › swingMelee` gains a `damage` parameter (the caller passes `weaponDamage(...)`); 5.3's pellets and 5.2's axe/chainsaw use the same.
  - [ ] `economy/shop.ts`: `upgradeWeapon(world, playerId, weapon): Result<Upgraded, UpgradeError>`; `ShopError`-style union `UpgradeError = "not_build" | "unknown_player" | "not_owned" | "max_level" | SpendError`; `shopUpgrades(balance, loadout)` → rows `{ weapon, name, slot, level, nextPrice | null }` (shop UI + bots).
  - [ ] `core/simEvents.ts`: `weapon.upgraded { playerId, weapon, slot, level }`; `net/netEvents.ts`: encode/decode (own player only is enough; it is cheap to send to all).
  - [ ] Export from `index.ts`.
  - [ ] Tests: `combat/upgrades.test.ts` (new): `damage per level for every weapon (I–IV exact)`, `prices per level for every weapon (Pistol 60)`, `SMG level III kills a Runner with one bullet, level II needs two` (real `step`, real projectile, 1 Runner, assert `zombie.killed` after exactly 1 `weapon.fired`), `Hunting Rifle IV kills a 120 HP target in 2 shots` (Brute-ready breakpoint, uses a balance override if 5.7 is not merged), `melee level scales the swing`, `nothing but damage changes` (rate, ammo, reload ticks, cooldown, spread rolls identical between level I and IV over 200 ticks with a fixed seed). `economy/shop.test.ts`: `upgradeWeapon refusals in order`, `upgrade charges exactly the shown price`, `max level refused at IV`, `replace loses levels`, `swap keeps both levels`, `levels survive downed → out → return and a decay stage change` (`changeDecayStage`).
- [ ] **T3 Every copy (brief 2)** (AC 5, 6)
  - [ ] Schema `apps/server/src/rooms/schema/RunState.ts › PlayerState`: `level0`, `level1` (`t.uint8().default(0)`); `syncState.ts › syncPlayer` (write on change), `resetRunFields` (→ 0).
  - [ ] `packages/shared/src/net/stateView.ts`: `PlayerStateView.level0/level1` + `PLAYER_STATE_FIELDS` (the compile-time check in RunState.ts catches a miss); `apps/client/src/net/fakeRoom.ts` defaults; devThrottle copies via the key list (nothing to write, verify by test).
  - [ ] Mirror: `apps/client/src/sim/NetSimHost.ts › syncSlot` copies the level into the client World's slot (HUD reads the World as today).
  - [ ] Predictor: nothing (levels don't affect movement). LocalFire (`net/localFire.ts`): nothing (cosmetic shots have no damage); say so in the merge notes.
  - [ ] `snapshotWorld`: covered by the slot spread; add `level` to the digest test expectation.
  - [ ] Server: `messages.ts › C2S.SHOP_UPGRADE`, `shopUpgradeSchema`, `S2C.SHOP_UPGRADED`, `S2C.SHOP_UPGRADE_REFUSED`; `RunRoom.onShopUpgrade` (mirrors `onShopBuy`, logs `shop_upgraded` / `shop_upgrade_refused`); `RunController.upgradeWeapon`.
  - [ ] Client: `SimHost.upgradeWeapon(weapon)`; `LocalSimHost` (shared rule at once) and `NetSimHost` (send + answers queue like `buyWeapon`).
  - [ ] Tests: `syncState.test.ts` (+ `levels are synced and reset`), `RunRoom.shop.test.ts` (+ `upgrade round trip: wallet, level0, answer to the sender only`, `upgrade refused in a wave`, `10 rapid taps cannot overspend`), `NetSimHost.shop.test.ts` (+ `level shown from state only`, `?lag throttle copies level0/level1`).
- [ ] **T4 Shop UI and HUD** (AC 1, 6, 7; F1)
  - [ ] `apps/client/src/ui/shopStore.ts`: `upgrade` input → `{ type: "upgrade", weapon }` effect; pending rule as for buy; answers `upgraded` / `upgrade_refused` (texts in `SHOP_TEXT`: "SMG upgraded to III", refusal texts per error); `replace` dialog adds "Its upgrades are lost." when the replaced slot's level > 1.
  - [ ] `apps/client/src/ui/ShopScreen.tsx`: "Upgrades" section above Weapons, one row per owned weapon (`shopUpgrades`), disabled at Max or when short of money (the `--short` style).
  - [ ] HUD: `scenes/hudModel.ts` gets `weaponLevel` / `otherWeaponLevel`; `HudScene.drawWeapon` draws the picked tier mark (T0) after the names; redraw only on change (the existing `shown*` guards).
  - [ ] `scenes/GameScene.ts`: `e.type === "upgrade"` effect → `host.upgradeWeapon`.
  - [ ] Tests: `shopStore.test.ts` (+ `upgrade pending until the answer`, `max row disabled`, `replace warns when levels would be lost`), `hudModel` test for the roman mark (I shows nothing).
- [ ] **T5 Bots, replay, dev switch** (AC 8, 9, 10)
  - [ ] `replay/inputLog.ts`: `kind: "upgrade"` → `upgradeWeapon`; test `replay with an upgrade gives the same digest` (assert the level really rose: liveness).
  - [ ] `bots/botShop.ts`: `upgrade:<id>` shopping entries; `botShop.test.ts` (+ `bot upgrades its SMG twice when it can afford it`).
  - [ ] `scenes/validLoadout.ts` + its test: `id:level` parsing (`smg:3` → level 3; `smg:9` → 1; `smg:x` → 1).
- [ ] **T6 Sims and balance evidence** (brief 15, 9)
  - [ ] `economy/fiveWaveSim.test.ts` (or the 6-wave version once 5.8 sets `runWaves` 6): a bot list with upgrades; assert waves ended, ≥ 1 upgrade bought, ≥ 1 kill by an upgraded weapon (count `zombie.killed` whose killer's slot level > 1 at that tick).
  - [ ] Run `npx tsx tools/sims/fiveWave.ts --players 2,3,4 --seeds 1-6 --list smg,upgrade:smg,upgrade:smg,wood_barricade` and record per-player spend in the story (not difficulty evidence, brief 15).
- [ ] **T7 Gates.** Mutations (brief 9): list in the Completion Notes (e.g. `damagePerLevel` applied to rate; level reset on swap; upgrade allowed in wave; price uses `price` for the Pistol) and which tests failed. Browser check (Playwright): solo `?wallet=500&loadout=smg`, upgrade twice, HUD shows III, a Runner dies to one bullet; online two tabs, the other tab sees nothing change but my HUD does after state. `typecheck && lint && test && build`. Merge notes.

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
