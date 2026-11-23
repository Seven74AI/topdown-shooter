---
baseline_commit: e2399a6ff7d2fe38b709c3b56827a90d2a3241e7
---

# Story 5.9: Metal barricade, spike trap and mine

Status: review

## Story

As a player,
I want stronger walls and traps,
so that my defenses can grow with the waves.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full (builders and reviewers: check each line):
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
> Most relevant here: 2 (buildings live in World → schema `state.buildings` → `syncBuildings` → `mirrorBuildings` → Predictor collision → `snapshotWorld`), 3/4 (trap, mine, upgrade rules below; "stack traps, place mines on spawns" are the reviewer's own examples), 5 (the mine blast respects cover), 6 (spike damage on a per-zombie clock), 7 (floor buildings change what blocks: fuzz), 9, 10, 11 (mine blast is an event), 12 (static sprites, no per-tick redraw), 13 (each piece readable; walls vs floor), 14, 15 (6-wave sim, prices vs the 4.10 earnings decision), 17 (one more message type through `this.net.guard`).

## Acceptance Criteria

### Gameplay (from `epics.md` › Story 5.9, GDD › Buildings and Defenses)

1. **Barricade upgrade ladder (FR52, + designer's B8).** In a build phase I tap one of **my** wood barricades and choose Upgrade: wood barricade (B6 look, 200 HP, 40) → **reinforced barricade** (B8 look: upright pallets + barbed wire, `docs/art/4-11/barricade_upgrade_b8.jpg`; **350 HP, +50**) → **metal barricade** (**600 HP, +70**; total upgrade cost wood → metal = +120, the GDD's number). Same footprint (2 × 0.5 m), same place, same id; the building gets the new type's full HP (DD2). The upgrade-only types are not on sale as new buildings. (If the designer prefers the epics' single step, DD1 option B: wood → metal +120 directly and reinforced is skipped.)
2. **Spike trap** (`buildings.json › spike_trap`): 2 × 2 m floor, 300 HP, 80. Zombies on it take 4 damage/s and move 40 % slower; players walk on it unharmed and unslowed; it does not block anyone's path (players, zombies, flow fields) and zombies never attack it.
3. **Mine** (`buildings.json › mine`): 60, single use, 0.5 × 0.5 m floor (DD5). When a zombie comes within 1 m it explodes for 80 damage to every zombie within 2.5 m; players in range take 50 % (40); then it is removed. It counts toward the 6-building cap until it explodes.
4. **Kill credit.** Trap and mine kills pay the owner like turret kills (`economy.buildingKillShare`, Story 3.6 M1 rule: the owner's own damage makes it their kill).

### Fairness rules (brief line 3; player-visible, each is tested)

5. **F1 Floor is floor.** Spike traps and mines never block a body, a bullet, a spit or a flow field, and zombies never target them; only walls (barricades of every tier, turrets) block. A trap can't be used to wall a street.
6. **F2 On the trap = hurt and slowed, per body.** A zombie whose body circle overlaps the trap square (strict) moves at 60 % speed that tick and fills its own spike clock: every 0.5 s of time on any trap = 2 damage (= exactly 4/s of exposure; the 4.8 D3 per-body rule: walking on and off never dodges). Two overlapping or touching traps don't stack (max one slow, one clock).
7. **F3 Traps wear.** Each spike hit on a zombie costs the trap 1 HP (DD3): 300 HP ≈ 60 Walkers walking across; the HP bar shows it; a worn-out trap is removed like a broken barricade (`building.destroyed`).
8. **F4 The mine's two circles are drawn.** In a build phase every player sees a placed mine's trigger circle (1 m) and blast circle (2.5 m) faintly, and during waves the mine blinks a small red light. "Within 1 m" = the zombie's body circle overlaps the 1 m circle round the mine's centre; "within 2.5 m" = a body (zombie or player) overlaps the 2.5 m circle. The client draws the circles at exactly these radii.
9. **F5 The blast respects cover.** A zombie or player whose centre is hidden from the mine's centre by a car, the bus or a building (4.2 shot blockers, `shotLineClear`) takes no blast damage; barricades, turrets, sandbags and barriers don't shield (they only stop bodies). Buildings take no mine damage (DD6).
10. **F6 Friendly fire is the 5.4 rule.** Standing players (the owner too) in the blast take 50 % (40) through Story 5.4's `explosion` damage path; downed and out players take none (4.8 D4). Mines are triggered by zombies only: walking over a mine never sets it off.
11. **F7 One trigger, one blast, same tick.** A mine explodes on the tick a zombie first overlaps its trigger circle (no fuse, DD4) and never twice; mines don't set off other mines (no chains, DD7).
12. **F8 Mines can't seal spawns.** The existing `buildings.spawnClearM` (2 m from every spawn point of every stage) applies to traps and mines too; the reviewer checks what a mine at 2 m does to fresh spawns (allowed, single use).
13. **F9 Upgrades are honest.** Only the owner can upgrade (anyone can still repair: Story 3.7); only in a build phase; the price is charged once (a repeated request is refused as `max_tier` / `not_upgradable`); the panel shows the next tier's HP and price before tapping; a decay refund (4.5: 50 %) and a repair (3.7: 50 %) use the tier's **total** price (wood 40, reinforced 90, metal 160).

### Netcode, perf, readability (brief lines 11–14)

14. **Bandwidth.** Buildings stay schema state (placement, HP on change, **type on upgrade**); one new event `mine.exploded` (local, view-filtered). Added B/s measured and reported (estimate below).
15. **Flow fields rebuild only when walls change.** Placing, wearing out or exploding a floor building never invalidates the nav grid (`nav.version` follows a wall-only counter); an upgrade (same footprint) doesn't either.
16. **Phone FPS.** Traps and mines are static sprites in the buildings layer; a trap being worn does not redraw the whole buildings layer every tick (redraw keyed by damage stage, not raw HP). `?stress=150` with 24 traps/mines placed reports headless FPS before/after with load.
17. **Readability.** Designer picks every look (T0); the reinforced tier uses the already-picked B8. Each tier reads as a wall (stops bodies, not bullets); traps and mines read as floor. All four added to `docs/playtests/milestone-1/readability-sheet.md` (+ key): "what is this? does it stop bullets? can you walk on it?".
18. **Lag/lifecycle.** Under `?lag=150&jitter=20` the client shows the upgrade only when the state says so (pending until then), a mine vanishes when the server's event/state says it exploded; a hidden tab across a build start shows the right tiers and no exploded mines.

## Tasks / Subtasks

- [x] **T0 Art pick first (AC 17)** — before client art (sim work may start in parallel; depends on 4.11's sprite pipeline for buildings)
  - [x] 0.1 ~5 Meshy proposals each (`nano-banana-pro`, text to image; the shared style line of `docs/art/4-11/README.md`): (a) **metal barricade** 2 × 0.5 m from above (welded steel plates / corrugated sheet on I-beam feet, rivets, rust streaks); (b) **spike trap** 2 × 2 m floor (a board of rusty nails / rebar spikes, low, flat shadow); (c) **mine** 0.5 m (a dented landmine/pressure plate with a red light); (d) explosion FX frames. The **reinforced barricade is already picked: B8** (`docs/art/4-11/barricade_upgrade_b8.jpg`) — no new proposals, only the sprite cut from it (fit to 2 × 0.5 m, turns with rot 0/1 like B6). One private proposal Artifact page.
  - [x] 0.2 Designer picks; save to `docs/art/5-9/` + `README.md` (file, use, footprint, prompt), and add B8's "now used by 5.9" note to `docs/art/4-11/README.md` (designer-approved doc edit, in this story's branch).
  - [x] 0.3 Then draw frames `building_barricade_reinforced`, `building_barricade_metal`, `building_spike_trap`, `building_mine`, `fx_mine_blast_01…` (≤ 2048² atlas, `category_name_variant`), in 4.11's BuildingView sprite path.
- [x] **T1 Balance (AC 1–3, 9)**
  - [x] 1.1 `config/balanceSchema.ts › buildingTypeSchema` (all with defaults so the old types are unchanged): `solid: z.boolean().default(true)` (false = floor), `forSale: z.boolean().default(true)` (false = upgrade-only), `upgradesTo: z.object({ type, price }).strict().optional()` (price = the step's cost), `trap: z.object({ damagePerS, pulseS, slowPct (int), wearPerHit (int) }).strict().optional()` (4.8's whole-number/whole-tick refines), `mine: z.object({ triggerRadiusM, blastRadiusM, damage, playerShare }).strict().optional()`. `loadBalance` cross-checks: `upgradesTo.type` exists, has the same footprint, `forSale: false`, its `price` = this price + step price (the "total price" rule, F9); no upgrade cycles; `turret`/`trap`/`mine` mutually exclusive; floor types have no `upgradesTo`.
  - [x] 1.2 `buildings.json › types` (append; type index goes on the wire): `wood_barricade` + `upgradesTo { type: "reinforced_barricade", price: 50 }`; `reinforced_barricade` (name "Reinforced barricade", price 90, 2 × 0.5, hp 350, forSale false, upgradesTo { metal_barricade, 70 }); `metal_barricade` (price 160, 2 × 0.5, hp 600, forSale false); `spike_trap` (price 80, 2 × 2, hp 300, solid false, trap { damagePerS 4, pulseS 0.5, slowPct 40, wearPerHit 1 }); `mine` (price 60, 0.5 × 0.5, hp 1, solid false, mine { triggerRadiusM 1, blastRadiusM 2.5, damage 80, playerShare 0.5 }).
  - [x] 1.3 `economy/shop.ts › shopBuildings`: skip `forSale: false`. `repair.ts › repairCost` and decay refunds (`decay/decaySystem.ts › destroyBlockedBuildings`) already use `stats.price` → total price per tier for free; floor buildings: repair allowed for traps (worn), not for mines (hp 1, never damaged).
  - [x] 1.4 Tests `config/balance.test.ts`: "the ladder 40 → 90 → 160, 200 → 350 → 600", "refuses an upgrade to an unknown/for-sale type, a footprint change, a cycle, a price that isn't the sum", "old types: solid, for sale, no trap/mine"; `economy/shop.test.ts`: "upgrade-only types are not in the shop; spike_trap 80 and mine 60 are".
- [x] **T2 Walls vs floor: every building loop (AC 5, 15, F1)** — the riskiest part; list each site in the PR
  - [x] 2.1 `buildings/buildings.ts`: `Building.solid` (cached from stats at `addBuildingAt`), `BuildingState.wallVersion` (+1 on add/remove of a **solid** building only); `version` keeps counting everything (renderers, sync).
  - [x] 2.2 Skip non-solid buildings in: `buildings/collision.ts › hasObstacles` (count solids only), `circleHitsBuilding`, `settle`/`pushOutOfBuildings`, `segmentHitsBuildings`; `zombies/flowField.ts › rasterizeBuildings` and the `nav.version` checks (use `wallVersion`, lines ~396/609/723); `zombies/zombieAi.ts › touchingBuilding`, `steerByField` (via nav: automatic); `player/freeSpot.ts` (via `circleHitsBuilding`: a player may be placed on a trap/mine). Keep non-solid buildings in: `footprintBlocked` (no building on another), `waves/spawnPick.ts › blockedByBuilding` (DD8), `decay/decaySystem.ts › destroyBlockedBuildings` (a new solid on a trap destroys and refunds it), `decay/fire.ts` (fire damages traps; mines immune: DD6).
  - [x] 2.3 Tests `buildings/floor.test.ts` (new): "players and zombies walk over a trap and a mine (no push-out)", "zombie LOS straight across a trap", "a trap never changes the flow field (wallVersion unchanged, field identical)", "zombies never attack a trap", "no building may overlap a trap", "decay solid on a trap destroys it with the 50 % refund", "a returning player may be placed on a trap".
- [x] **T3 Spike trap (AC 2, F2, F3)** new `buildings/trap.ts`, called from `updateBuildings` (`buildings/buildingSystem.ts`, after turrets) or the zombies slot (DD: document; it must run before `updateZombies` reads the slow)
  - [x] 3.1 Zombie pool (`zombies/zombiePool.ts`): `trapTicks: Uint16Array` (spike clock, 0 on spawn), `slowPct: Uint8Array` (this tick's slow). For each alive zombie: overlap with any trap box (strict circle–box, `circleOverlapsBox`) → `slowPct = trap.slowPct` (max over traps, no stacking), `trapTicks++`; at `ticksFor(pulseS)` → `applyZombieDamage(world, id, damagePerS × pulseS, 0, 0, 0, owner, type, building.id)` (no pushback; turret-style credit) and `damageBuilding(world, trap, wearPerHit)`; clock reset. Clock kept while off the trap (4.8 D3), zeroed at every build start (4.8 D19 `resetBurnClocks`: add `trapTicks`).
  - [x] 3.2 `zombies/zombieAi.ts` pass 1: desired speed × (100 − slowPct) / 100 (integer math, like `player/slow.ts › playerSpeed`).
  - [x] 3.3 Zombie hit events: none per pulse (4.8 D8 pattern; kills are normal `zombie.killed` with the building id). Cost: ≤ 24 traps × 150 zombies box tests per tick (bounded; measure).
  - [x] 3.4 Tests `buildings/trap.test.ts` (new, `systems: { waves: () => {} }`): "4 dmg per second of exposure", "in 9 ticks out 1 repeat: still 4/s (F2)", "60 % speed on the trap, full speed off it", "overlapping traps: one slow, one clock", "players unharmed and unslowed", "wear: 1 HP per hit, removed at 0 with building.destroyed", "kill pays the owner the building share; the owner's own damage makes it theirs (3.6 M1)", "fire wears a trap (4.8)".
- [x] **T4 Mine (AC 3, F4–F8)** new `buildings/mine.ts` + shared `combat/explosion.ts`
  - [x] 4.1 `combat/explosion.ts › explode(world, x, y, radiusM, zombieDamage, playerShare, killerId, weapon, buildingId)`: every alive zombie whose body overlaps the circle and has `shotLineClear` from the centre → `applyZombieDamage` (push outward 0: no knockback, or 5.2/5.3's `applyKnockback` if designer wants, DD9); every standing player overlapping and in line → 5.4's explosion damage (50 %). Allocation-free (grid query `queryRadius`). **Shared with 5.5 (grenade launcher), 5.8 (Bloater), 5.12 (grenades)**: whoever lands first creates it (merge notes).
  - [x] 4.2 Trigger pass (waves only; same slot as traps): per mine, any alive zombie overlapping the trigger circle (grid query) → `explode(...)`, emit `mine.exploded { buildingId, x, y }`, `removeBuilding` (cap freed; `version++`, `wallVersion` untouched). No chains: a blast never checks other mines (DD7).
  - [x] 4.3 Tests `buildings/mine.test.ts` (new): "a Walker overlapping the 1 m circle sets it off the same tick (F7)", "a player on the mine never does (F6)", "80 to every zombie within 2.5 m, none at 2.51 m + radius", "a car between the mine and a zombie shields it; sandbags and a barricade don't (F5)", "a standing player in range takes 40, the owner too; downed/out none (F6)", "single use: removed, cap freed, never twice", "no chain: two mines 1 m apart, one zombie triggers one", "build phase: no trigger", "kills pay the owner the building share", "placement 2 m clear of spawns (F8)". Liveness: ≥ 1 explosion and ≥ 1 kill asserted in each.
- [x] **T5 Upgrade (AC 1, F9)** new `buildings/upgrade.ts` (the pattern of `buildings/repair.ts`)
  - [x] 5.1 `UpgradeError` = `"unknown_player" | "not_build_phase" | "gone" | "not_owner" | "not_upgradable" | "money"`; `upgradeError(world, playerId, id)` (shared: the client panel runs it on the mirror), `upgradeBuilding(world, playerId, id)`: `spendMoney(step price)`, `setBuildingType(world, b, newType)` (mutable `type`, `maxHp`; `hp = maxHp` (DD2); `version++`, `wallVersion` unchanged), emit `building.upgraded { buildingId, playerId, cost, toType, x, y }`.
  - [x] 5.2 Message `BUILDING_UPGRADE: "building.upgrade"` `{ id }` + `BUILDING_UPGRADE_REFUSED { id, reason }` in `net/messages.ts` (zod shape, like `building.repair`); `apps/server/src/rooms/RunRoom.ts` handler via `this.net.guard` (shared "other" bucket), `RunController.upgradeBuilding`; solo `apps/client/src/sim/LocalSimHost.ts › upgradeBuilding`, online `NetSimHost.upgradeBuilding`, `SimHost.ts` interface.
  - [x] 5.3 `apps/server/src/rooms/schema/syncState.ts › syncBuildings`: on a version change, also assign `s.type` when it differs (today only adds/removes); `apps/client/src/net/mirrorBuildings.ts › visit`: `b.type !== s.type` → `setBuildingType` on the mirror (Predictor World too: same footprint, collision unchanged).
  - [x] 5.4 Client panel: `apps/client/src/scenes/repairPanel.ts` grows an Upgrade line ("Upgrade → Reinforced barricade · 350 HP · $50", reason text per `UpgradeError`), shown only on the owner's upgradable buildings; `HudScene.ts` button; pending until the state shows the new type (brief 14). `render/BuildingSelectView.ts` unchanged.
  - [x] 5.5 Bots: `bots/botShop.ts` may list `upgrade:wood_barricade` later; not required (note only).
  - [x] 5.6 Tests `buildings/upgrade.test.ts` (new): "wood → reinforced → metal, prices 50 / 70, HP 350 / 600 full", "metal is the last tier (not_upgradable)", "not the owner → not_owner; a teammate can still repair", "build phase only", "money", "double request charges once", "repair cost after upgrade 45 / 80; decay refund 45 / 80 (F9)", "upgrade does not touch wallVersion / the flow field"; `apps/server/src/rooms/RunRoom.upgrade.test.ts` (new, `bootTestServer()`): upgrade round trip, refusal message, schema type change seen by a second client; `apps/client/src/sim/NetSimHost.buildings.test.ts` (+ upgrade mirrored, pending until state), `apps/server/src/rooms/schema/syncState.test.ts` (+ type change synced), `scenes/repairPanel.test.ts` (+ upgrade line and texts).
- [x] **T6 Network (AC 14, 18)**
  - [x] 6.1 `net/netEvents.ts`: `BUILDING_UPGRADED`, `MINE_EXPLODED` (next free kind numbers at merge; never reuse) + round-trip tests.
  - [x] 6.2 `apps/server/src/net/eventInterest.ts`: `mine.exploded` local (view rect + margin); `building.upgraded` global (money/HUD).
  - [x] 6.3 Bandwidth test `apps/server/src/run/buildingBandwidth.test.ts` (new, pattern of `turretBandwidth.test.ts`): 4 players × 6 floor buildings (24 traps/mines) through a crowded wave: schema HP patches + events B/s per client; assert ≤ estimate × 1.5; liveness: ≥ 1 mine explosion, ≥ 100 trap pulses, ≥ 1 trap worn out.
  - [x] 6.4 Netsim `tools/netsim/barricade.test.ts` (extend): `?lag=150&jitter=20`: upgrade shows only after the state agrees; predicted player walks over a trap with 0 corrections; mine explosion seen once; hidden tab across a build start and an explosion.
- [x] **T7 Client look (AC 8, 16, 17)** — after 4.11's `BuildingView` rework
  - [x] 7.1 `render/BuildingView.ts`: per-type frame (B6 wood from 4.11, B8 reinforced, metal, spike trap, mine); floor types drawn below bodies with a flat (or no) shadow (`castShadow` height 0.05 m); redraw key = (`version`, per-building damage stage) instead of raw `hpSum` (a worn trap must not redraw every tick); HP bar width quantised.
  - [x] 7.2 Mine circles (F4): faint 1 m and 2.5 m rings in the build phase (all players), blinking light during waves (one pooled image per mine, ≤ 24), drawn at exactly the sim radii (test against the shared helper, the `render/city/fireRing.test.ts` pattern).
  - [x] 7.3 `render/FxView.ts`: mine blast FX (pooled; reuse/extend 5.5's explosion FX if merged) + screen shake when the local player is within 6 m; `audio/placeholderSfx.ts`: `building_mine_blast`, `building_upgraded`, `building_trap_hit` (rate-limited).
  - [x] 7.4 Placement preview (`BuildingView.drawPreview`): floor types preview with their trigger/blast rings (mine) and the 2 × 2 square (trap).
- [x] **T8 Fuzz, sims, perf, browser (brief 7, 9, 15, 16)**
  - [x] 8.1 **Fuzz** `zombies/downtown.fuzz.test.ts` (extend): random legal layouts (every stage, `legalDecayMasks`) × random placement-validated mixes of barricades (all three tiers), turrets, traps (incl. stacked/adjacent traps across a choke) and mines × 2,000 ticks of waves: no body centre in a wall box; no body pushed by a floor building; zombies reach a player in every layout; no stall (every wave ends with a god-mode bot shooting); `nav` rebuilt only at build starts / wall changes (count `wallVersion` bumps; mines exploding and traps wearing out bump only `version`). Liveness: ≥ 1 mine explosion, ≥ 1 trap kill, ≥ 1 trap worn out, ≥ 1 upgraded wall broken.
  - [x] 8.2 `economy/fiveWaveSim.test.ts` / `tools/sims/fiveWave.ts` (6 waves once 5.8 is merged): a test-local shopping list with traps/mines/upgrades (`bots.json` stays untouched): every wave ended; earnings vs spend reported against the 4.10 earnings decision.
  - [x] 8.3 `apps/server/src/run/tickCostDowntown.test.ts`: 24 traps/mines + 150 zombies (PERF_ASSERT=1), p99 and load recorded.
  - [x] 8.4 `?stress=150` with 24 floor buildings placed via a dev switch (e.g. `?stressbuild=traps`, `debug/stressScenario.ts`), headless FPS before/after with load.
  - [x] 8.5 Playwright: solo (`?wallet=` + `DEV_STARTING_WALLET`): place each, upgrade twice, watch a mine blast and a trap wear; online two tabs with `?lag=150&jitter=20`.
  - [x] 8.6 Mutations (brief 9): "traps block movement", "traps in the nav grid", "shared pulse instead of per-zombie clock", "slow stacks", "mine ignores cover", "mine chains", "players trigger mines", "upgrade by a teammate", "upgrade keeps old maxHp", "refund uses step price", "wallVersion bumped by mines" — each must fail a listed test.
- [x] **T9 Gates, readability sheet, merge notes**: typecheck, lint, test, build merged with the work branch; sheet rows; "Notes for the merge".

## Dev Notes

### Decisions (non-interactive; designer confirms the player-facing ones below)

- **D1 Upgrade = type change in place** (same id, same footprint): the flow field, collision and every copy need no rebuild; only the schema `type` and HP change. `Building.type`/`maxHp` become mutable through `setBuildingType` only.
- **D2 Tier price = total paid** (40 / 90 / 160), so 3.7's repair (`ceil(price × 0.5)`) and 4.5's decay refund (`floor(price × 0.5)`) are fair without new code.
- **D3 `solid` flag + `wallVersion`.** Every loop over `world.buildings.list` assumes a wall today (collision, LOS, nav, attack targets); F1 needs each one to skip floor types. The separate counter keeps brief line 7's "flow fields rebuild only at build start" true when mines explode mid-wave (today a mid-wave building removal re-rasterizes the nav grid).
- **D4 Traps tick in the buildings slot** (before combat and zombies), so the slow written this tick is read by this tick's zombie movement; deterministic, server and solo only (not predicted: zombies are never predicted).
- **D5 Explosion helper is shared** (`combat/explosion.ts`): one cover rule, one friendly-fire path (5.4), one event shape for 5.5/5.8/5.9/5.12.
- **D6 Floor buildings in the cap**: they are buildings, so `ownedCount` counts them (the mine "counts until it explodes" for free).

### Current state (read before changing)

- `buildings/buildings.ts`: `Building` (readonly `type`, `maxHp`; `fireCooldownS`, `fireTicks`, aim), `BuildingState { list, nextId, version }`, `footprintBlocked`, `placementError`, `addBuildingAt`, `removeBuilding`, `placeBuilding`, `damageBuilding` (whole HP, `building.destroyed`), `buildingTypeIds` (wire index = balance order).
- `buildings/repair.ts`: the model for `upgrade.ts` (errors list, `repairError`, `repairBuilding`, `buildingAtPoint`).
- `buildings/collision.ts`: `hasObstacles`, `circleHitsBuilding`, `pushOutOfBuildings/settle`, `segmentHitsBuildings` — all iterate every building.
- `zombies/flowField.ts › rasterizeBuildings` (all buildings → `buildingAt`, `enterCost`), `nav.version = world.buildings.version` (lines ~396, 609, 723).
- `zombies/zombieAi.ts`: pass 1 speed = `stats.speedMps`; pass 4 `touchingBuilding` and the field's target building.
- `waves/spawnPick.ts › blockedByBuilding` (spawn blocked by any building near it), `decay/decaySystem.ts › destroyBlockedBuildings`, `decay/fire.ts` (fire damages every overlapping building).
- `economy/economy.ts`: a `zombie.killed` with `buildingId` pays `killerId` the building share (3.6 M1 rule) — works for traps and mines (the owner id travels in `killerId`; the mine may already be removed).
- `economy/shop.ts › shopBuildings`: every type with a price is on sale (must skip `forSale: false`).
- Server: `RunRoom.ts` repair handler (line ~409) is the model; `rooms/schema/syncState.ts › syncBuildings` adds/removes on version change and syncs HP per tick; `RunState.ts › BuildingState` has `type, owner, gx, gy, rot, hp`.
- Client: `net/mirrorBuildings.ts` (adds/removes by id, copies HP), `render/BuildingView.ts` (planks placeholder, redraw on `version`/`hpSum`; **4.11 replaces the look with the B6 sprite** on branch `story-4-11`), `render/TurretView.ts`, `scenes/repairPanel.ts`, `render/BuildingSelectView.ts`.

### Copies touched (brief line 2)

World (`Building.solid/type/maxHp`, `wallVersion`, zombie `trapTicks/slowPct`) → schema `BuildingState.type` now changes after creation (no new field) → `syncState › syncBuildings` (type) → `stateView` `BuildingStateView` (unchanged shape) → `mirrorBuildings` (type change) → Predictor (`movePlayers` collides with solids only, through shared `collision.ts`) → devThrottle (no new keys) → `snapshotWorld` (`buildings.list` copies the new fields; add `wallVersion`, `trapTicks`, `slowPct`).

### Must be preserved

Every 3.4–3.7 behaviour (placement lattice, cap, repair by anyone, turret kills), 4.3 spawn clearance, 4.5 decay destroy/refund order, 4.8 fire on buildings, the 3.5 reachability and fuzz results, and the Predictor = server movement (0 corrections walking past buildings).

### Bandwidth estimate (AC 14)

- Placement / upgrade: one schema entry or one `type` patch (~10–20 B) per action, build phase only.
- Trap wear: HP patch (~4 B) on at most one tick in ten per trampled trap (1 HP per pulse per zombie, pulses every 0.5 s per zombie) → ≤ 20 patches/s × 4 B ≈ **80 B/s per busy trap**; worst case 24 busy traps ≈ 1.9 KB/s (unlikely; measured in 6.3). If too high: sync trap HP rounded to 5 (quantise in `syncBuildings` for floor types).
- `mine.exploded` ≈ 10 B once per mine + its `zombie.killed`/`zombie.hit` events (existing sizes; up to ~10 zombies × 14 B).
- Typical total < 0.5 KB/s; worst case ≈ 2 KB/s, inside 30 KB/s.

### Phone FPS plan (AC 16)

Static frames in the buildings layer (one atlas ≤ 2048²); redraw only on `version` or a damage-stage change; mine lights one pooled image each (≤ 24, `maxPerPlayer × 4`); blast FX pooled with a cap (shared with 5.5's explosions). Measure `?stress=150&stressbuild=traps` headless before/after with load; the 4.10 floor (avg ≥ 50, worst second ≥ 30) must hold.

### Beat the rule (for the reviewer; list every attempt and its result)

1. Wall a street with spike traps (zombies must walk through; F1). Stack 4 traps in a corridor: one slow, one clock (F2)?
2. Step zombies on/off a trap on the pulse (knockback a zombie off with the 5.3 Shotgun just before each pulse): damage dodged? (F2)
3. Mines on a spawn: place at exactly `spawnClearM`; does the fresh spawn die before it is visible? (allowed; report)
4. Trigger a mine yourself by walking on it (must not; F6); kill your downed teammate with it (must not); damage the owner (40, yes).
5. Blast through a car / the bus corner (must not; F5); through sandbags/barricades (must).
6. Chain 6 mines (no chain; F7). Explode a mine in the build phase (no).
7. Upgrade a teammate's wall; upgrade twice in one tap burst (charge once; F9); upgrade, then let decay destroy it: refund 50 % of the total?
8. Upgrade mid-wave via a crafted message (refused); upgrade during the last build-phase tick.
9. Place a mine under a zombie corpse spot / under a player standing still (placement rules).
10. Use a trap to make a returning player spawn inside a wall (freeSpot ignores floor, walls still blocked).
11. Repair a mine (refused: full HP) or a worn trap (allowed at 40).

### Dependencies on other Epic 5 stories

- **4.11** (being built on branch `story-4-11`): BuildingView sprites (B6 wood barricade), the B8 pick, burning cues. **Merge 5.9's client part after 4.11.**
- **5.4 Flamethrower / friendly fire:** the 50 % explosion rule for players (F6). If 5.4 isn't merged, 5.9 implements the rule where 5.4 specifies (combat damage system, tag `explosion`) and 5.4 takes it over.
- **5.5 Grenade Launcher / 5.8 Bloater / 5.12 Consumables:** share `combat/explosion.ts` and blast FX.
- **5.3 Shotgun / 5.2 Fire Axe:** knockback must stop at walls only (floor buildings are no obstacle for `applyKnockback`): use the shared `solid` check.
- **5.7 Brute:** 3× damage to buildings applies to every tier (metal 600 = 200 effective vs a Brute).
- **5.10 Floodlight and med station:** reuse `solid` (med station and floodlight: solid walls? decide there) and `forSale`.
- **5.13 Card shop:** "always available: buildings, repairs, upgrades" — the building upgrade is a panel action, not a card; spike trap and mine are buildings in the always-available section.

### Notes for the merge

| Shared file | What 5.9 changes | Likely conflicts |
| --- | --- | --- |
| `config/balance/buildings.json`, `config/balanceSchema.ts › buildingTypeSchema` | 4 types, `solid`, `forSale`, `upgradesTo`, `trap`, `mine` | 5.10 (floodlight, med station), 5.7 (building damage mult): append types in merge order (wire index) |
| `buildings/buildings.ts`, `buildings/collision.ts` | `solid`, `wallVersion`, `setBuildingType`, loops skip floor | 5.2/5.3 knockback sweep, 5.7 Brute building damage, 5.10 |
| `zombies/flowField.ts`, `zombies/zombieAi.ts`, `zombies/zombiePool.ts` | `wallVersion`, floor skipped, zombie slow, trap clock | 5.3 (`knockShot`), 5.4 (ignite), 5.6 (spitter), 5.7, 5.8 |
| `combat/explosion.ts` (new or existing) | mine blast | 5.5, 5.8, 5.12: one helper |
| `net/messages.ts`, `net/netEvents.ts`, `core/simEvents.ts` | upgrade message, 2 event kinds | every Epic 5 story adds kinds: next free numbers at merge |
| `apps/server/src/rooms/RunRoom.ts`, `run/RunController.ts`, `rooms/schema/syncState.ts` | upgrade handler, type sync | 5.12/5.13 messages |
| `apps/client/src/net/mirrorBuildings.ts`, `sim/SimHost.ts`, `LocalSimHost.ts`, `NetSimHost.ts` | type change, `upgradeBuilding` | 5.10, 5.12 |
| `apps/client/src/render/BuildingView.ts`, `render/FxView.ts`, `scenes/repairPanel.ts`, `HudScene.ts` | tiers, floor look, mine rings, upgrade button | **4.11** (BuildingView rework), 5.5 (blast FX), 5.10 |
| `economy/shop.ts` | `forSale` filter | 5.13 rewrites the shop |
| `decay/decaySystem.ts`, `decay/fire.ts` | clock reset adds `trapTicks`; mines fire-immune | 5.4 (ignite clocks) |
| `core/worldSnapshot.ts` | new fields | every story adding sim state |

### Designer decisions to confirm

| # | Decision | Recommended |
| --- | --- | --- |
| DD1 | Barricade ladder | **A: wood (200 HP, 40) → reinforced B8 (350 HP, +50) → metal (600 HP, +70)**, total +120 as in the GDD; B: wood → metal +120 in one step (B8 unused) |
| DD2 | HP after an upgrade | **Full HP of the new tier** (the step price is above a repair) |
| DD3 | Spike trap wear | **1 HP per spike hit on a zombie** (300 HP ≈ 60 Walkers crossing); zombies never attack it; fire wears it too |
| DD4 | Mine fuse | **None: explodes the tick a zombie touches the 1 m circle**, red blinking light while armed |
| DD5 | Mine footprint | **0.5 × 0.5 m** (one lattice cell), no HP bar, immune to fire and zombies |
| DD6 | Mine vs buildings | **No damage to buildings** (barricades don't shield either) |
| DD7 | Mine chains | **No chains** (a blast never sets off another mine) |
| DD8 | Floor buildings near spawns | **Same 2 m clearance as walls** (`spawnClearM`) |
| DD9 | Mine knockback | **None** (damage only); option: 1 m outward push via the shared knockback |
| DD10 | Who can upgrade | **Owner only** (anyone can still repair) |
| DD11 | Zombies and traps | **Zombies don't path around traps** (they walk straight in) |
| DD12 | Looks | **Designer picks** metal barricade, spike trap, mine, blast FX from ~5 Meshy proposals each; reinforced = **B8** (already picked) |

### References

- `_bmad-output/planning-artifacts/epics.md` › Epic 5 intro, Story 5.9, Story 4.11 designer picks (B8 kept for an Epic 5 barricade upgrade); GDD › Buildings and Defenses (table, decay interaction), Player Progression (unlock costs: spike trap 100, mine 100, metal barricade 150 Supplies — Epic 7), Shooter (friendly fire 50 % for explosions).
- `game-architecture.md` › Other entities (mines live in Colyseus schema: here as `state.buildings` entries).
- `docs/art/4-11/README.md` (B8 prompt, footprint 2 × 0.5 m, the Meshy process).
- Story files 3.4 (placement, lattice), 3.5 (flow field, attack rule), 3.6 (turret kill credit M1), 3.7 (repair panel), 4.3 (spawn clearance), 4.5 (refunds), 4.8 (per-body clock D3/D19, ring = rule D16).
- `HANDOFF.md` §3 (per-client guard ~10 msgs/s; `this.net.guard`; ticks; no per-tick allocation) and §4 (Epic 3 decisions: barricades on a 0.5 m lattice anchored by the min corner).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `.claude/worktrees/story-5-9` (branch `story-5-9`), ports client 5737 / server 4737.

### Debug Log References

- **Environment (found mid-story, coordinator's fix applied):** the worktree's `node_modules` was a symlink to the main checkout's, whose `@topdown/*` links resolve to the MAIN `packages/shared`: apps/tests in the worktree were compiled against the main checkout's shared code. Replaced with a real `node_modules/` directory linking every main entry except `@topdown` (linked to this worktree) and `.vite` / `.vite-temp` / `.vitest-cache` (real, empty). `readlink -f node_modules/@topdown/shared` → the worktree. All numbers below are after the fix.
- **Gate** (`npm run typecheck && npm run lint && npm test && npm run build`, on `story-5-9` = the work branch tip `e2399a6` + this story): green. **202 files passed (1 skipped), 1,478 tests passed (3 skipped)**; 61 new `it(...)` tests. `uptime` load: 6.15 before the gate, 4.94 after (two other builders running).
- **Tick cost** (`tickCostDowntown.test.ts`, `PERF_ASSERT=1`): Downtown + 4 players + 150 Walkers p99 1.107 ms (mean 0.500) → + 24 traps/mines p99 0.821 ms (mean 0.510): added p99 within noise (−0.29 ms), mean +0.009 ms; 858 spike hits, 12 mines exploded; load 4.59. The trap + mine passes alone (24 floor buildings, 150 Walkers): 0.0385 ms per tick (load 3.90).
- **Bandwidth** (`buildingBandwidth.test.ts`, 4 clients, 12 traps × 3 Walkers standing on them + 12 mines set off one by one, 30 s, interest filter on): 2,000 trap pulses, 1 trap worn out, 12 mines exploded; patches 100 → 218 B/s; **added per client 143 B/s** (estimate 2 KB/s, assert ≤ 3 KB/s). An upgrade patch (type + HP + wallet): < 40 B once (`syncState.test.ts`). `mine.exploded` ≈ 10 B, local.
- **Headless FPS, `?stress=150`, 844 × 390 DPR 2, SwiftShader (CPU), load from `/proc/loadavg`**: the box was shared with two other builders (load 3–10), so the numbers move ±50 % run to run. Before (no floor buildings): 14.7 / 14.8 / 15.1 (load 3.65 → 3.83); 5.8 / 6.2 / 5.7 (8.4 → 9.1); 4.7 / 10.4 / 12.0 (10.5 → 10.2); 12.0 / 11.7 / 11.8 (6.0 → 5.6); 5.3 / 5.3 / 5.9 (7.9 → 9.6). After (`&stressbuild=traps`: 12 traps + 12 mines, 150 Walkers that can't die on the spikes): 5.2 / 5.3 / 5.3 (9.1 → 9.9); 12.3 / 12.4 / 13.0 (9.5 → 7.6); 7.0 / 6.5 / 6.0 (5.6 → 6.2, BEFORE the redraw split below); 6.6 / 6.0 / 5.6 (6.6 → 7.9, after it). Interleaved pairs at similar load show no measurable difference after the fix; one pair before it showed ~−45 %, traced to the buildings layer re-laying shadows on every bar step of 12 trampled traps: fixed (structural redraw only on `version`, wear redraws only tints/cracks/bars: measured 0 full re-lays/s and 0.2 wear redraws/s in the stress scene). **Not a phone number**: the 4.10 phone floor was not re-measured.
- Phaser 4.2.1 checked in `node_modules/phaser/types` for `Image.setTexture(key, frame)`, `Graphics.strokeCircle`, `BlendModes.ADD`, `cameras.main.shake(duration, intensity)`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Balance (T1):** `buildingTypeSchema` gains `solid` (default true), `forSale` (default true), `upgradesTo {type, price}`, `trap {damagePerS, pulseS, slowPct, wearPerHit}` (whole-number / whole-tick refines), `mine {triggerRadiusM, blastRadiusM, damage, playerShare}`; `loadBalance` cross-checks the ladder (target exists, upgrade-only, same footprint and kind, price = this price + step, no cycles), floor types never upgrade, traps/mines are floor, turret/trap/mine exclusive. `buildings.json` appends `reinforced_barricade` (90, 350 HP, upgrade-only), `metal_barricade` (160, 600 HP, upgrade-only), `spike_trap` (80, 2 × 2, 300 HP), `mine` (60, 0.5 × 0.5, 1 HP); wood gets `upgradesTo {reinforced, 50}`. The shop skips `forSale: false`; placement refuses it (`unknown_type`).
- **Walls vs floor (T2), every site:** `Building.solid` (cached at `addBuildingAt`), `BuildingState.wallVersion` (+1 only on add/remove of a wall), `Building.type/maxHp` mutable only via `setBuildingType`. Skipped for floor: `collision.ts › hasObstacles` (walls only), `circleHitsBuilding` (→ `freeSpot`, `downed` returns, decay relocation), `settle` push and the stuck check (→ `pushOutOfBuildings`: players, Predictor, zombies), `segmentHitsBuildings` (zombie LOS); `flowField.ts › rasterizeBuildings` (both loops) and the three `nav.version` checks now follow `wallVersion`; `zombieAi.ts › touchingBuilding` (stuck safety net; exported for the test); `steerByField` via the nav grid. Kept for floor: `footprintBlocked` (no overlap, spawn clearance), `spawnPick › blockedByBuilding` (DD8), `destroyBlockedBuildings` (a new decay solid destroys and refunds a trap), `fire.ts` (fire wears traps; mines immune, DD6), turrets loop (unchanged). Bullets never hit buildings (unchanged), so nothing to skip there.
- **Spike trap (T3, `buildings/trap.ts`, buildings slot after turrets):** per alive zombie, strict circle–box overlap with any trap → `slowPct` (max, no stacking) and its own `trapTicks` clock; every `pulseS` of exposure: `round(damagePerS × pulseS)` = 2 damage (no `zombie.hit` event, 4.8 D8), 1 HP wear on the lowest-id trap under the body; kills are `zombie.killed` with the owner + trap id (3.6 credit, M1 rule via economy). Clock kept off the trap, zeroed at build start (`resetBurnClocks`) and on spawn. `zombieAi` pass 1 uses `speed × (100 − slowPct) / 100` for the desired velocity, the crowd speed cap and the flank budget.
- **Mine (T4, `buildings/mine.ts` + shared `combat/explosion.ts › explode`):** waves only; the tick an alive zombie's body overlaps the 1 m circle: removed (cap freed, `wallVersion` untouched), `mine.exploded`, blast. `explode` checks every alive zombie on its current position (linear, the grid may be a tick old) and every standing player: body overlaps the circle AND `shotLineClear` from the centre (cars/bus/map buildings shield; barricades/turrets/sandbags/barriers don't); zombies take 80 (a `zombie.hit` each, push 0); standing players (owner included) 40 through `damagePlayerByExplosion` (`player.damaged` with `sourceZombieId = DAMAGE_SOURCE_EXPLOSION` = −2, not the fire cue's −1; god mode spares); downed/out none; buildings none; no chains. `explode` is the helper 5.5/5.8/5.12 should reuse; `damagePlayerByExplosion` stands in for 5.4's friendly-fire function.
- **Upgrade (T5, `buildings/upgrade.ts`):** `upgradeError` (unknown_player → not_build_phase → gone → not_owner → not_upgradable → money) shared by server, solo and the client panel; `upgradeBuilding` charges the step, `setBuildingType` (full new HP, `version` +1), emits `building.upgraded`. Message `building.upgrade {id}` / `building.upgrade_refused {id, reason}` through `this.net.guard` (shared "other" bucket); `RunController.upgradeBuilding`; `SimHost.upgradeBuilding/takeUpgradeRefusal` in `LocalSimHost` and `NetSimHost`; `session.onUpgradeRefused`. `syncBuildings` retypes the same schema entry; `mirrorBuildings` calls `setBuildingType` (mirror + Predictor). Panel: an Upgrade button one row above Repair on MY upgradable buildings ("Upgrade $50"), the next tier's name and HP as the info's third line, a refusal text left of the button, "Upgrading…" until the World shows the new tier (pending; a refusal toast clears it).
- **Network (T6):** event kinds `BUILDING_UPGRADED` 27, `MINE_EXPLODED` 28 (+ round trips); negative `player.damaged` sources now travel as is (−1 fire, −2 blast); `EventInterest`: `mine.exploded` local at its centre, `building.upgraded` global (mines' non-killing hits are local like turret hits).
- **Client look (T7):** code-drawn art in `render/city/buildingArt.ts` (ONE function per object): `drawReinforcedBarricade` (B8: upright pallets, struts behind, barbed-wire coil along the top), `drawMetalBarricade` (designer pick **M1c**, round 3: riveted plates between four hazard-striped post caps, strictly top-down), `drawSpikeTrap` (pick **T1** nail board), `drawMine` (pick **N6** pressure-plate mine, red light in the centre). Baked once per game into `atlas_buildings` (4 frames, a ≈ 636 × 196 px canvas, `category_name_variant`); `BuildingView` draws every type with art as pooled sprites placed by 4.11's `barricadeTransform` (rotate with placement), game-drawn shadows by kind (walls 1.6 m, trap 0.05 m, mine none), floor sprites at depth 2.95 (under walls' shadows and bodies), cracks on walls only, no HP bar on mines; redraw key = per-building bar step (20 steps) and wear no longer re-lays the shadow layer. `MineView`: both rings at the balance radii in build phases (all players), a pooled blinking red glow per mine in waves. `FxView`: pooled blast (flash, fireball, ring growing to the blast radius, smoke) and an upgrade ring; camera shake ≤ 6 m; placeholder sfx `building_mine_blast` (rate-limited) and `building_upgraded`. Placement preview: the ghost of every art type and the mine's two rings.
- **Dev switch:** `?stress=150&stressbuild=traps` lays 12 traps + 12 mines round the survivor (release-safe like `?stress`), Walkers made unkillable so the crowd stays 150.
- **Fuzz (T8.1, builder-written `buildings/floor.fuzz.test.ts`):** 24 random legal Downtown layouts (variant masks round robin, stage 1–3) × random placement-validated mixes (three wall tiers, ≤ 1 turret, traps incl. a row of 2–3 adjacent traps, mines) × 2,000 ticks of real waves with god-mode bots holding their ground (weak guns): no zombie/player body inside a wall or map solid, `nav.version` never changes on a tick without a wall change, a zombie reached a player in every layout, every started wave but the running last one ended. Liveness over the run: 145 mines exploded, 4,203 spike hits, 778 trap kills, 9 traps worn out, 2 upgraded walls broken, 46,064 body-ticks on floor buildings (bodies really stood on them). The existing `zombies/downtown.fuzz.test.ts` was left unchanged (still green with walls only).
- **Six-wave sim (T8.2):** only 5 waves exist on this branch (5.8 not merged): `fiveWaveSim.test.ts` adds a test-local list (`smg, spike_trap, mine, spike_trap, mine, wood_barricade ×2`; `bots.json` untouched): 4/4 runs held out (2p and 4p, seeds 1–2), 43 buildings placed, 3 mines exploded, 3 spike hits / 1 trap kill (bots place round themselves and kite: traps see little traffic). Earnings per player 475–677 over 5 waves (GDD target cut to 5 waves ≈ 650–790; the 4.10 earnings decision is still open); team spend 960–1,740. A trap (80) ≈ 13–16 % of one player's run earnings, a mine (60) ≈ 10 %, wood → metal +120.
- **Netsim (T6.4):** `tools/netsim/barricade.test.ts` + walking straight across a trap and a mine at 150 ms RTT ± 20: 0 snaps, 0 corrections (liveness: > 10 ticks on floor); an upgrade of the wall I press on: the Predictor shows the new tier only once a snapshot carries it (≥ upgrade + one-way − jitter), 0 snaps.
- **Browser (T8.5), Playwright headless Chromium, dev build:** solo `?solo&wallet=3000`: placed wood ×4, a trap, a mine; upgraded to reinforced and metal (a rot-1 metal wall shows the turned art), panel with Upgrade $70 / "→ Metal barricade · 600 HP"; wave: a Walker next to the mine set it off (blast FX, the owner standing 2.5 m away took 40: friendly fire as specified), Walkers on the trap wore it (140 → 131). Online, two browser contexts with `?lag=150&jitter=20` (server 4737, `DEV_STARTING_WALLET=2000`): create/join/ready/start; host placed a wood barricade, sent Upgrade: right after the send the host still showed wood (pending), host saw `reinforced_barricade` after ~585 ms and the guest after ~625 ms (polling through `page.evaluate` on a loaded box); the guest saw the trap at 300 HP. No page errors. Screenshots (844 × 390, DPR 2): `docs/art/epic-5/round-a/ingame/5-9-build-phase.png` (tiers, trap, mine rings, upgrade panel), `5-9-closeup.png` (zoomed: wood / reinforced B8 / metal M1c, a turned metal wall, the trap), `5-9-wave-blast.png` (a mine going off; HP 100 → 60).
- **Mutations (T8.6), each applied once and reverted by a script (all 19 failed ≥ 1 test):** M1 floor cached as solid (20 tests fail); M2 traps in the nav grid (floor test); M3 shared pulse instead of per-zombie clock (3); M4 slow stacks; M5 mine ignores cover; M6 mine chains (mineLook trigger test); M7 players trigger mines (after making the test's trigger pass actually run: a far zombie added); M8 upgrade by a teammate; M9 upgrade keeps old maxHp; M10 repair/refund uses the step price; M11 wallVersion bumped by mines (fuzz + mine test); M12 zombies attack floor (after exporting `touchingBuilding` and testing it); M13 floor blocks zombie LOS; M14 mine triggers in a build phase; M15 mines burn in fire; M16 downed players take blast damage (after asserting "no `player.damaged` event", not only HP); M17 blast never hurts players; M18 redraw key on raw HP; M19 rings at a copied radius (2). First pass: M2, M7, M12, M16 survived → tests strengthened, re-run killed.
- **Beat the rule (builder's own attempts):** (1) wall a street with traps: zombies walk straight through (floor test, fuzz: 46k body-ticks on floor, nav unchanged); stacking 2–4 touching traps: one slow, one clock (trap test; fuzz rows). (2) on/off the pulse: 9 in / 1 out still exactly 4/s (trap test). (3) mines on spawns: placement keeps the 2 m spawn clearance for traps and mines (mine test); a mine at exactly 2 m + its half cell still lets a fresh spawn walk into its 1 m trigger at once (allowed, single use, as the story says). (4) walk on a mine: never triggers; the owner and teammates in range take 40; a downed teammate takes nothing (mine tests). (5) blast through a car: shielded; through sandbags / a barricade: hits (mine test). (6) chain 6 mines: no chain (a blast never looks at mines); build-phase blast: none. (7) upgrade a teammate's wall: `not_owner`; a 3-tap burst: charged once per tier, the third refused `not_upgradable` (RunRoom test); upgrade then decay destroy: 45 / 80 refund (upgrade test). (8) mid-wave crafted message: `not_build_phase` (RunRoom test). (9) a mine under a standing player / zombie: placement refuses (bodies block footprints, unchanged 3.4 rule). (10) a returning player on a trap: allowed (floor test), never in a wall. (11) repair a mine: refused `full_hp` (1 HP, never damaged); a worn trap: repairable for 40.
- **Bots (5.5):** not taught to upgrade (note only, as allowed).

### Notes for the merge

| Shared file | What 5.9 changes | Merge hint |
| --- | --- | --- |
| `config/balance/buildings.json` | appends `reinforced_barricade`, `metal_barricade`, `spike_trap`, `mine`; `wood_barricade.upgradesTo` | type index is on the wire: append other stories' types AFTER these (or renumber nothing: keep balance order = merge order) |
| `config/balanceSchema.ts › buildingTypeSchema` | `solid`, `forSale`, `upgradesTo`, `trap`, `mine` (+ `trapSchema`, `mineSchema`, `TrapStats`, `MineStats`) | 5.10 should reuse `solid`/`forSale` |
| `config/balance.ts` | `crossCheckBuildingTypes` called at the end of `crossCheck` | own function; keep the call |
| `buildings/buildings.ts` | `Building.type/maxHp` mutable, `solid`, `BuildingState.wallVersion`, `setBuildingType`, placement refuses `forSale: false` | 5.2/5.3 knockback: stop at `b.solid` boxes only; 5.7: building damage unchanged |
| `buildings/collision.ts` | every building loop skips `!b.solid` | any new sweep (knockback) must do the same |
| `buildings/buildingSystem.ts` | `updateTraps`, `updateMines` after turrets | keep order (before combat/zombies) |
| `zombies/flowField.ts` | `nav.version` follows `wallVersion`; floor skipped in `rasterizeBuildings` | 5.7 wide grid: keep the `wallVersion` checks |
| `zombies/zombieAi.ts` | slowed speed from `pool.slowPct`; `touchingBuilding` exported + skips floor | 5.3 `knockShot`, 5.6/5.7/5.8 edits nearby: keep the `speedMps` local |
| `zombies/zombiePool.ts` | `trapTicks`, `slowPct` (reset on spawn) | 5.4 ignite clocks: add next to them |
| `combat/explosion.ts` (new) | `explode`, `damagePlayerByExplosion`, `blastResult` | **5.5/5.8/5.12 reuse it**; 5.4 owns the final friendly-fire function: replace `damagePlayerByExplosion` there |
| `core/simEvents.ts` | `DAMAGE_SOURCE_FIRE/EXPLOSION`, `building.upgraded`, `mine.exploded` | append-only union |
| `net/netEvents.ts` | kinds 27 `BUILDING_UPGRADED`, 28 `MINE_EXPLODED`; negative damage sources pass through | **next free numbers at merge** (5.3/5.6 add kinds too) — renumber the later-merged story |
| `net/messages.ts` | `BUILDING_UPGRADE`, `BUILDING_UPGRADE_REFUSED`, `buildingUpgradeSchema` | 5.12/5.13 add messages |
| `core/worldSnapshot.ts` | zombies `trapTicks`, `slowPct`; buildings `wallVersion` | every story adds fields |
| `decay/fire.ts` | `resetBurnClocks` zeroes `trapTicks`; mines fire-immune; uses `DAMAGE_SOURCE_FIRE` | 5.4 |
| `economy/shop.ts` | skips `forSale: false` | 5.13 rewrites the shop: keep the filter |
| `index.ts` | 5.9 export block after the repairs line (+ `TrapStats`, `MineStats`, damage-source constants, upgrade schema/types) | union of export lists |
| `apps/server/src/rooms/RunRoom.ts`, `run/RunController.ts`, `rooms/schema/syncState.ts`, `net/eventInterest.ts` | upgrade handler/controller method; retype on version change; `mine.exploded` local | other stories' handlers alongside |
| `apps/client/src/net/session.ts`, `net/mirrorBuildings.ts`, `sim/SimHost.ts`, `LocalSimHost.ts`, `NetSimHost.ts` | upgrade send/refusal; mirror retype | 5.10/5.12 |
| `apps/client/src/render/BuildingView.ts` | art for every type with a frame (`buildingFrame`), floor depth, shadow by kind, two-level redraw | 5.10 adds frames in `buildingsAtlas.ts` |
| `apps/client/src/render/FxView.ts`, `audio/placeholderSfx.ts` | blast + upgrade FX; 2 sfx | 5.5 blast FX: share or merge with `blast()` |
| `apps/client/src/render/fireCue.ts` | fire cue only for source −1 | 5.6 acid cue: own source number |
| `apps/client/src/scenes/GameScene.ts`, `HudScene.ts`, `hudModel.ts`, `repairPanel.ts` | MineView, mine shake, upgrade button/panel, `?stressbuild` | other stories' HUD rows |
| `apps/client/src/debug/urlOptions.ts`, `stressScenario.ts` | `stressBuild` | |
| `tools/netsim/barricade.test.ts`, `apps/server/src/run/tickCostDowntown.test.ts`, `economy/fiveWaveSim.test.ts` | extended (own `it`/`describe` blocks) | |

### Not verified

- No phone FPS (headless SwiftShader only, on a box with load 3–10 from other builders: before/after numbers are noisy; no measurable difference in interleaved pairs after the redraw fix).
- Hidden tab across a build start and a late Game scene start with mines/upgrades (brief 14): not exercised in a browser; the mirror follows schema add/remove/retype (unit tests), and nothing is predicted.
- `?lag` online: checked the upgrade pending-until-state and the guest's view of a trap; a mine blast seen once online and its FX under lag were not watched.
- `building_trap_hit` sfx not added (spike hits send no event by design; only kills do).
- The art is code-drawn per the designer's picks (B8, M1c, T1, N6) but not yet reviewed by the designer in game; the story's Meshy step and `docs/art/5-9/README.md` were replaced by the Epic 5 code-art method (coordinator instruction); the B8 "now used by 5.9" note in `docs/art/4-11/README.md` was not added.
- 6-wave sim: only 5 waves exist on this branch (5.8 not merged).
- The readability sheet rows 16–19 are added (pictures cropped from the browser shots; #19 shows part of the HUD text "PIS…") but not playtested.

### File List

New:
- `packages/shared/src/buildings/trap.ts`, `trap.test.ts`
- `packages/shared/src/buildings/mine.ts`, `mine.test.ts`
- `packages/shared/src/buildings/upgrade.ts`, `upgrade.test.ts`
- `packages/shared/src/buildings/floor.test.ts`, `floor.fuzz.test.ts`
- `packages/shared/src/combat/explosion.ts`
- `apps/server/src/rooms/RunRoom.upgrade.test.ts`
- `apps/server/src/run/buildingBandwidth.test.ts`
- `apps/client/src/render/city/buildingArt.ts`, `apps/client/src/render/city/buildingsAtlas.ts`
- `apps/client/src/render/MineView.ts`, `mineLook.ts`, `mineLook.test.ts`, `mineBlast.ts`
- `docs/art/epic-5/round-a/ingame/5-9-build-phase.png`, `5-9-closeup.png`, `5-9-wave-blast.png`
- `docs/playtests/milestone-1/objects/17_reinforced_barricade.png`, `18_metal_barricade.png`, `19_spike_trap.png`, `20_mine.png`

Modified:
- `packages/shared/src/config/balance/buildings.json`, `config/balanceSchema.ts`, `config/balance.ts`, `config/balance.test.ts`
- `packages/shared/src/buildings/buildings.ts`, `buildings.test.ts`, `collision.ts`, `buildingSystem.ts`, `repair.test.ts`
- `packages/shared/src/zombies/flowField.ts`, `zombieAi.ts`, `zombiePool.ts`
- `packages/shared/src/core/simEvents.ts`, `core/worldSnapshot.ts`, `decay/fire.ts`, `economy/shop.ts`, `economy/shop.test.ts`, `economy/fiveWaveSim.test.ts`
- `packages/shared/src/net/netEvents.ts`, `net/netEvents.test.ts`, `net/messages.ts`, `index.ts`
- `apps/server/src/rooms/RunRoom.ts`, `rooms/schema/syncState.ts`, `rooms/schema/syncState.test.ts`, `run/RunController.ts`, `run/tickCostDowntown.test.ts`, `net/eventInterest.ts`, `net/eventInterest.test.ts`
- `apps/client/src/net/session.ts`, `net/mirrorBuildings.ts`, `sim/SimHost.ts`, `sim/LocalSimHost.ts`, `sim/NetSimHost.ts`, `sim/NetSimHost.buildings.test.ts`
- `apps/client/src/render/BuildingView.ts`, `render/buildingLook.ts`, `render/FxView.ts`, `render/fireCue.ts`, `audio/placeholderSfx.ts`
- `apps/client/src/scenes/GameScene.ts`, `scenes/HudScene.ts`, `scenes/hudModel.ts`, `scenes/repairPanel.ts`, `scenes/repairPanel.test.ts`
- `apps/client/src/debug/urlOptions.ts`, `debug/urlOptions.test.ts`, `debug/stressScenario.ts`, `debug/stressScenario.test.ts`
- `tools/netsim/barricade.test.ts`
- `docs/playtests/milestone-1/readability-sheet.md`, `docs/playtests/milestone-1/readability-key.md`
- (merge) `packages/shared/src/combat/damage.ts` (knockback stops at walls only), `docs/art/4-11/README.md` (B8 note); sheet pictures renumbered to `docs/playtests/milestone-1/objects/19_reinforced_barricade.png` … `22_mine.png`
- `_bmad-output/implementation-artifacts/5-9-metal-barricade-spike-trap-and-mine.md`

### Review fixes (2026-11-23)

- **M1** (`render/BuildingView.ts`): the shadow layer re-lays only when `version` or the new `boxDrawKey` (bar steps of plank-box buildings = turrets only) changes; trap/wall wear redraws only tints, cracks and bars. Test `mineLook.test.ts › review M1` (turret + 12 wearing traps: re-lay key constant; the turret's own wear changes it). Re-measured `?stress=150&stressbuild=traps` headless, DPR 2: with a turret placed 12.6 / 11.5 / 12.8 FPS, 8 full re-lays in 24 s (traps wearing out = list changes, and the turret's own wear), load 4.02 → 4.40; without a turret 9.7 / 10.4 / 12.1, 7 re-lays, load 4.40 → 4.47 (before the fix: ~5 re-lays/s with a turret).
- **L1** (F7 "same tick"): `updateZombies` ends with `updateMines` on the zombies' new positions (the buildings-slot pass stays for bodies already in the circle; a mine is removed when it fires, so never twice; same order, higher id first). Test `mine.test.ts › review L1`: a walking Walker's first overlapping tick = the blast tick.
- **L2** (`combat/explosion.ts`): `explode` collects targets in its own `blastTargets` buffer, never the shared `zombieCandidates`. Test: a blast inside a loop over `zombieCandidates` leaves it intact.
- **L3** tests: a player whose body edge (centre outside) is inside the blast circle takes 40, just beyond takes 0; a trap worn out by the first pulse of a tick neither hurts nor slows the second zombie that tick.
- **L4** (`config/balance.ts`): an upgrade must keep the building kind (turret / trap / mine / barricade). Test: a reinforced tier with a turret block is refused.
- Mutations (each once, reverted): box key over every building; no trigger after zombies move; blast on the shared buffer; player blast by centre distance; a worn trap still working that tick; no kind check — all 6 fail a new test.
- Gate: 207 files passed (1 skipped), 1,539 tests passed (3 skipped); typecheck, lint, build green; load 3.87 before, 7.51 after (other builders).

### Change Log

- 2026-11-23: Story 5.9 built (builder, worktree `story-5-9`): wall/floor flag + wall-only flow-field counter across every building loop; spike trap (per-body clock, slow, wear); mine (trigger, shared cover-respecting blast, 50 % to standing players); barricade ladder wood → reinforced (B8) → metal (M1c) with owner-only upgrade message, schema retype, pending panel; code-drawn art (B8, M1c, T1, N6) in one atlas; mine rings and lights; blast FX; `?stressbuild=traps`; tests incl. fuzz, bandwidth, tick cost, netsim, mutations; readability sheet rows. Status → review.
- 2026-11-23: Merged the work branch (`claude/gracious-turing-0db3j6`: Story 5.3 Shotgun/Assault Rifle + review fixes). Conflicts resolved by keeping both sides (zombie pool/snapshot fields, FxView constants and pools: 5.9's mine blast method renamed `mineBlast` next to 5.3's pellet `blast`; stress switches `?stressfire` + `?stressbuild`; `tickCostDowntown.measure(map, stage, firesOut, weapon, floor)`; five-wave sims). 5.3 added no net event kinds, so 5.9 keeps 27/28; building-type balance order unchanged. 5.3's `applyKnockback` now stops only at WALL buildings (`b.solid`); new floor tests: a knocked zombie slides over a trap and a mine and stops at a barricade (mutation-proven), Shotgun pellets fly over a trap, a mine and a barricade (pellets, like bullets, never test buildings). Readability sheet: 5.3's rows 16–17 first, 5.9's renumbered 18–21 (pictures `19_…`–`22_…`). `docs/art/4-11/README.md`: B8 "now used by Story 5.9". Gate on the merge: 207 files passed (1 skipped), 1,534 tests passed (3 skipped); typecheck, lint, build green; load 4.26 before, 3.37 after.
- 2026-11-23: Review fixes M1, L1–L4 (see "Review fixes (2026-11-23)").
- 2026-11-23: Designer art change: the metal barricade (M1c) loses its yellow plate; the post caps keep diagonal stripes in steel tones. Screenshots and the readability picture re-taken; typecheck, lint, client render tests (20 files, 96 tests) green.
