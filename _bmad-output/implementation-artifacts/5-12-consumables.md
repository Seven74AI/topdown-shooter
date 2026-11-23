# Story 5.12: Consumables

Status: review

## Story

As a player,
I want a quick-use slot for medkits, grenades and molotovs,
so that I have an emergency answer.

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
> Most relevant here: 3/4 (fairness ACs and "Beat the rule": spam under lag, downed use, double use), 5 (thrown grenades and molotov fire respect 4.2 cover; the client's cosmetic arc agrees with the server), 6 (molotov fire per-body burn clock, as 4.8), 7 (fuzz for the fire zones), 9 (liveness: ≥ 1 throw, ≥ 1 blast kill, ≥ 1 molotov burn), 10 (cooldown in ticks; pooled areas; numbers in `consumables.json`), 11 (throws as events), 12 (molotov fire visuals pooled and capped), 14 (edge flag once per seq; HUD pending until the state's count agrees).

## Acceptance Criteria

1. **The button (FR8).** A round **consumable button** (64 × 64 CSS px, like swap) sits near the right thumb, left of / above the swap button (exact spot in D5), showing the item's icon and its count; **E** on desktop (`keyMap.ts` `KeyE → "consumable"`, latched once per press like `swap`, no auto-repeat). It is hidden with an empty slot, while downed/out, in placement mode and with the shop or menu open. **(Main-session decision 2026-11-23, after 5.16 D3:) while the build bar is up (a build phase), the consumable button and swap sit in a row above the build bar's top-left edge (12 px gaps; checked at 568×320 / 800×360 / 1024×768), so the medkit is reachable on touch; both still hide while holding a building.** Tapping sets the input's edge flag `consumable` (already in `playerInputSchema`): exactly one input seq carries it; `LocalSimHost`/`NetSimHost` latch it; `applyInputs` (`core/systems.ts`) clears it on a repeated seq; `RunController` carries it across a dropped/skipped input (all existing; extend their tests).
2. **One slot (FR49).** `PlayerState.consumable` (id or null) and `consumableCount`. Buying a consumable (build phase, `shop.buy_item { item }` — the message and `buyItem` dispatcher of Story 5.11): same type in the slot → **refills to the pack size** (refused `already_full` when already full: no money taken); a different type → **replaces it** (the rest is lost; the shop says "Replaces Grenades ×2"); empty → fills. Packs and prices in a new `consumables.json`: **Medkit** 1 for 60, **Grenades** 3 for 80, **Molotovs** 2 for 100.
3. **Fairness rule: one tap = at most one use.** A use happens on the tick the flagged input is applied, from the player's server position and that input's aim, and only if: the player is **alive**, the slot has ≥ 1, the use cooldown is over (`useCooldownS` 0.5 s = 10 ticks, counted in ticks, from the last use), and the item's own rule allows it (AC 4–6). Otherwise **nothing is consumed**. Two taps within the cooldown use one item. A dropped input never loses or doubles a use (RunController carry, 2.4/2.7). Downed, out or in a phase where it is not allowed: no use, no count change.
4. **Medkit.** Heals **50 HP instantly**, capped at the player's max HP (Story 5.11 armor included); **not used at full HP** (count unchanged; the HUD button greys out at full HP). Usable in **build and wave** phases.
5. **Grenades.** Thrown at the aim point by Story 5.5's rules (`combat/grenades.ts`, pool `world.grenades`; 5.5 FR-A/D1: mouse = cursor distance, touch = aim-stick deflection; the aim vector's length carries the distance while a throwable is in the slot), clamped to [`minThrowM` 2, `throwRangeM` **8**] m (no aim input → facing direction at 8 m); ~~5.5 FR-B: the ground track is stopped at the face of a car, the bus or a map building~~ **(updated at build, PR #5 / designer 2026-11-23 "Grenade Launcher lobs over obstacles"): the throw flies over cars, the bus, gas pumps, low walls, barriers, sandbags, barricades and turrets; only real map buildings (`building: true`) stop it at their face; aimed onto a car roof it lands at the car's near face (FR-B2)**; it flies over zombies. On landing `explode(world, spec)` (5.5's `combat/explosion.ts`): **40 damage within 2.5 m**, one hit per body (5.5 FR-E), zombies full, **players (teammates and the thrower) 50 %** through 5.4's `damagePlayerBy(…, "explosion", thrower)`, buildings 0 (5.5 D4), `shotLineClear(centre → body)` cover check. While the slot holds a throwable, 5.5's landing marker (exact blast radius) shows at the throw point (D11). Wave phase only (D3).
6. **Molotovs.** Thrown like a grenade (same `grenades.ts` round, same clamp and the same lob rule — only buildings stop it, max 8 m); on landing makes a **fire zone of radius 3 m** (D2) that burns **4 s**: every body overlapping it (strict circle overlap, 4.8 D7) **with a clear line from the zone's centre (main-session decision 2026-11-23, the 5.6 acid rule: walls, cars, the bus and buildings shield; barricades and sandbags don't; a zone lit at a car's face never burns behind the car)** takes **8 damage/s** — zombies full, players 50 % (tag `fire`, 5.4 rule) — on a **per-body burn clock** (4.8 D3: each body counts its own ticks inside; a pulse every `pulseS` 0.5 s = 4 damage to zombies, 2 to players; stepping out on a pulse tick dodges nothing; clocks are per area and reset when the area ends). Overlapping molotov zones and car fires **do not stack** on one body (one fire hit per pulse). Molotov fire does **not** damage buildings (D4) and is **not** in the nav grid (no flow-field rebuild mid-wave; zombies walk through and burn). It is drawn exactly at its damage edge (4.8 D16 ring). Wave phase only (D3). Kills credit the thrower (a player-caused kill: reward + assists as a weapon kill; weapon id `molotov`), unlike car fires.
7. **Server truth and pending (brief 14).** The HUD count is the server's (`consumableCount` from state; solo the World's). After a tap the button shows "pending" (dimmed) and ignores further taps until the synced count drops or the use is refused/ignored by the server (1 s timeout) — no optimistic use, so lag never shows a throw that did not happen. Medkit HP comes from state.
8. **Network (brief 11).** Schema player fields `consumable` (uint8 index, 255 = empty) and `consumableCount` (uint8), in `PlayerStateView`/`PLAYER_STATE_FIELDS`, on change only. A use emits `consumable.used { playerId, item }` (new net event kind, ~3 B: HUD/sound) plus 5.5's `grenade.launched` for throws (the client draws the arc from it; ~12 B), 5.5's `explosion.happened` for the blast and 5.6's area-spawn event for the molotov zone — no per-tick state. Report B/s for a grenade, a molotov, and 4 players throwing everything in 2 s.
9. **Pools and caps (brief 10, 12).** Molotov zones live in the shared area pool (Story 5.6 acid puddles / 5.8 gas): capacity and `maxLiveMolotovZones` (recommended 8) in `consumables.json`; a 9th replaces the oldest. Client fire visuals reuse 4.8's ring + ember images and a pooled fire glow (`FIRE_LIGHTS`-style, capped), atlased; no allocation per frame/tick.
10. **Readability (brief 13).** In the hand/in flight: a grenade and a bottle with a burning rag; on the ground: the molotov zone looks like the 4.8 car fire's ground fire (F6 pick) with the ember ring at the damage edge; a grenade blast is 5.5's. Rows in the readability sheet.
11. **Tests:** input path (tap → exactly one use; repeated seq; dropped/skipped input carry; cooldown; downed/out/empty/full HP/phase refusals); shop slot rules (fill, refill, `already_full`, replace); medkit heal/cap; grenade range cap, damage per target, 50 % self/team, cover stops the blast, liveness (≥ 1 kill); molotov zone radius, duration in ticks, per-body clock (step out on the pulse tick still burns), no stacking with a car fire, no building damage, credit to the thrower, cap of live zones; NetSimHost/netsim client–server agreement; Downtown fuzz with molotov zones; bandwidth; perf; snapshot digest (cooldown, count, zones); each new test fails under one mutation.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| C1 | Tap 5× fast under `?lag=150&jitter=20` | One use per cooldown window; the HUD never shows more uses than the server made; count from state |
| C2 | Flood inputs / drop the flagged seq (`seq_gap`) to dupe a throw | Carried once (RunController); never two uses from one tap |
| C3 | Tap while downed (to save it) / while out | Not used, count unchanged |
| C4 | Medkit at full HP / at 99 HP | Not used at full; at 99 → 100 (50 is a cap, not a refund) |
| C5 | Buy Grenades when holding 2 grenades (refill for 80) | Refills to 3 for 80 (the rule); at 3 refused `already_full` |
| C6 | Buy Medkit to replace 3 grenades by accident | Replaced; the shop note warned before the tap |
| C7 | Throw a grenade through a bus/car at zombies behind it | (PR #5 rule) aimed past the bus it lobs over and lands at the aim point; aimed onto the roof it lands at the near face; either way the BLAST is shielded by the bus (FR-C): bodies behind it take nothing (AC 5) |
| C8 | Throw at a teammate / at your own feet | 50 % (20) to each player in 2.5 m incl. self: can down a 20-HP player (intended) |
| C9 | Stand in two molotov zones + a car fire | One fire hit per pulse (no stacking) |
| C10 | Step out of a molotov exactly on the pulse tick | Still burns (per-body clock, AC 6) |
| C11 | Burn the team's barricades / turret with a molotov | No building damage (D4) |
| C12 | Molotov on a spawn point | Allowed: zombies spawning into it burn; nav unchanged (flow field not rebuilt) |
| C13 | Grenades in the build phase to hurt teammates | Not usable in build (D3) |
| C14 | 4 players × 2 molotovs at once for FPS | ≤ 8 live zones, visuals capped; FPS within budget |
| C15 | Throw farther than 8 m with mouse far away / at your own feet | Capped at 8 m / at least 2 m (PR #5: a car 1 m ahead is flown over; a BUILDING 1 m ahead stops the round at its face: 20 to you) |
| C16 | Swap/reload while throwing | Consumables do not touch weapon timers; allowed (D6) |

## Tasks / Subtasks

- [ ] **T0 Art pick (first; AC 1, 10).** ~5 Meshy proposals each for: **consumable icons** (medkit, grenade, molotov — one consistent HUD set, legible at 40 px on the button), **thrown molotov bottle** (top-down, burning rag; the grenade body is 5.5's sprite unless the designer wants a hand grenade look: include 5 options), and **molotov ground fire** (top-down spreading liquid fire on wet asphalt with a clear edge; compare with the F6 car-fire pick so they match). One private proposal page; designer picks; save to `docs/art/5-12/` + `README.md` (4.11 format). Atlas frames `icon_consumable_medkit_a`, `icon_consumable_grenade_a`, `icon_consumable_molotov_a`, `fx_molotov_bottle_a`, `fx_molotov_fire_a` (≤ 2048²). No drawing before the pick.
- [ ] **T1 Balance `consumables.json` (AC 2–6, 9).**
  - [ ] `balanceSchema.ts › consumablesSchema`: `{ useCooldownS (whole ticks), maxLiveMolotovZones int 1–32, items: record(id, { name, price, pack int 1–9, inShop default true, kind: "heal" | "grenade" | "molotov", healHp?, minThrowM?, throwRangeM?, damage?, radiusM?, durationS? (whole ticks), damagePerS?, pulseS? (whole ticks; damagePerS × pulseS × 0.5 whole) }) }`, ≤ 8 items (uint8 index). Register in `balanceFileSchemas`.
  - [ ] `consumables.json`: `useCooldownS 0.5`, `maxLiveMolotovZones 8`; `medkit` {60, pack 1, heal, healHp 50}; `grenades` {80, pack 3, grenade, throwRangeM 8, damage 40, radiusM 2.5}; `molotovs` {100, pack 2, molotov, throwRangeM 8, radiusM 3, durationS 4, damagePerS 8, pulseS 0.5}. Friendly-fire share comes from 5.4's balance (not duplicated).
  - [ ] Tests `config/balance.test.ts` › "consumables validate; fractional tick durations refused; > 8 items refused".
- [ ] **T2 Slot + shop (AC 2).** `PlayerState.consumable: string | null`, `consumableCount`, `consumableCooldownTicks` (+ `addPlayer`); new `packages/shared/src/economy/consumables.ts › buyConsumable(world, playerId, item)` (order: `not_build` → `unknown_player` → `not_for_sale` → `already_full` → money → fill/refill/replace); branch in 5.11's `buyItem`. Tests `economy/consumables.test.ts` (every rule + refusal leaves wallet and slot unchanged).
- [ ] **T3 Use system (AC 3–6).** New `packages/shared/src/combat/consumables.ts › useConsumables(world, dtS)`, called at the **start of `updateCombat`** (after the grid rebuild, before `updatePlayerWeapon`, so a grenade spawned this tick flies in this tick's `updateProjectiles` like a shot). Per player in id order: count down `consumableCooldownTicks` every tick (not paused by `weaponsPaused`? — D7: counts applied inputs only, like the weapon); if `inputs.get(id)?.consumable` and AC 3 holds → medkit heal / spawn a 5.5 round in `world.grenades` with a `kind` (`launcher` | `hand_grenade` | `molotov`) and the consumable's numbers (5.5 keeps the API weapon-agnostic for this; emits 5.5's `grenade.launched`) → count−−, cooldown = ticks, emit `consumable.used`; empty count → slot null. On landing (`grenades.ts › updateGrenades`): hand grenade → `explode(world, spec)` with radius 2.5, damage 40, tag `explosion`, source the thrower, weapon id `grenades`; molotov → spawn a fire area in 5.6's area pool (`kind: "fire"`, radius, `durationTicks`, owner, damage per pulse, per-body clocks).
  - [ ] Molotov damage: in the area system (5.6's slot), per body clock per area (zombie pool + players), 5.4 FF share for players, no buildings, `killZombie(world, id, ownerId, "molotov")` (credit), and the "no stacking with car fires" rule: a body that took a fire hit this pulse from `decay/fire.ts › updateFires` or another molotov is not hit again (shared `lastFireHitTick` per body, or a single fire pass that loops car fires + molotov zones — pick one, document it).
  - [ ] Tests `combat/consumables.test.ts` (systems `{ waves: () => {} }`): "one tap → one use; same seq repeated → no second use"; "two taps 5 ticks apart → one use; 10 ticks → two"; "downed/out/empty → nothing consumed"; "medkit 30 → 80; 90 → 100 (125 with armor I); full HP → not used"; "grenade at 20 m aim lands at 8 m; at 0.5 m lands at 2 m"; "a car 1 m ahead stops the round at its face"; "grenade 40 to zombies in 2.5 m, 20 to thrower and teammate, 0 beyond"; "bus between blast and zombie → no damage"; "sandbags between → damage"; "≥ 1 kill (liveness)"; "molotov: 3 m radius strict overlap; 80 ticks; zombie in 4 s takes 32; player 16"; "step out on the pulse tick still burns"; "car fire + molotov on one body = one hit per pulse"; "barricade in a molotov: HP unchanged"; "molotov kill pays the thrower"; "9th zone replaces the oldest"; "build phase: throwables refused, medkit works".
- [ ] **T4 Input + HUD (AC 1, 7).**
  - [ ] `input/keyMap.ts`: `KeyE: "consumable"` (+ `KeyAction`); `KeyboardMouse.ts` `consumableLatched` like `swapLatched`; `InputRouter.build(out, hudSwap, hudConsumable, …)` sets `out.consumable`; `GameScene` consumes `hudModel.consumablePressed` (swap pattern, line ~817).
  - [ ] `HudScene.ts`: the button (pooled circle + icon image + count text), `buttons.set({ id: "consumable", … })`, layout next to swap with safe areas (D5); visibility per AC 1; pending dim + 1 s timeout in `hudModel` (`consumablePending`, cleared when the synced count changes).
  - [ ] Tests: `input/keyVector.test.ts`/`menuInput.test.ts` pattern for E (one edge per press, no repeat); `LocalSimHost.test.ts` and `NetSimHost.test.ts` latch (extend the existing swap+consumable cases); `apps/server/src/run/RunController.test.ts` carry tests (existing; add: "consumable on a skipped input reaches the use system exactly once"); `input/HudButtons.test.ts`/`routePointer.test.ts`: the new rect does not steal the aim stick.
- [ ] **T5 Network (AC 8).** Schema `playerFields.consumable: t.uint8().default(255)`, `consumableCount: t.uint8().default(0)` (append); views + key lists; `syncState` on change, `resetRunFields`; mirror copies to the mirror player; Predictor: nothing (not predicted). `simEvents.ts` `consumable.used`; `netEvents.ts` next free kind (after rounds A–C's kinds; never reuse) with a round-trip test; client 5.5's `GrenadeView` draws the arc from `grenade.launched` (bottle sprite for `molotov`); `consumable.used` carries no position (no duplicate data). `snapshotWorld`: consumable, count, cooldown, molotov zones (5.6 pool snapshot).
  - [ ] Tests: `net/netEvents.test.ts` round trip; `syncState.test.ts`; `NetSimHost.consumables.test.ts` ("count and slot from state; arc from the event; molotov zone mirrored"); `netsim` client–server agreement for a molotov (zone set, damage from the server only).
- [ ] **T6 Shop UI (AC 2).** `shopStore`/`ShopScreen`: an always-available **Consumables** section (icon, name ×pack, price, "Full", "Replaces …" note); `buyItem` via 5.11's `SimHost.buyItem`.
- [ ] **T7 Visuals (AC 9, 10)** — after T0. `render/ConsumableFxView.ts`: pooled bottle/grenade sprites along the arc (from events), molotov zones drawn with `fireRing.ts` (`strokeFireRings` at the zone radius) + pooled ember images + a capped pooled fire glow (≤ 8), `fx_molotov_fire_a` sprite scaled to the zone; nothing allocated per frame.
- [ ] **T8 Fuzz (brief 7).** Extend `zombies/downtown.fuzz.test.ts` (or a new `combat/consumables.fuzz.test.ts`): bots throw molotovs/grenades at random points × decay stages × variants × many ticks: no body inside a box, no stall, zombies reach a player, `pathing` rebuilds only at build starts (assert the flow-field build counter does not move mid-wave), ≥ 1 molotov burn and ≥ 1 blast kill (liveness).
- [ ] **T9 Bots + 6-wave sim (brief 15).** `bots/botPolicy.ts`: use a medkit below 40 % HP; throw a grenade at the densest zombie cluster within 8 m when ≥ 5 are within 2.5 m of it (deterministic, no randomness outside streams); `shoppingList` may contain consumable ids. Run the 6-wave sim: assert waves ended, ≥ 1 use of each type; report.
- [ ] **T10 Bandwidth + perf (brief 11, 12, 16).** `apps/server/src/run/consumableBandwidth.test.ts`: B/s for one grenade, one molotov, 4 players × all; tick cost with 8 live molotov zones + 150 Walkers (`PERF_ASSERT=1`, load recorded, added p99 ≤ 0.3 ms); browser `?stress=150` with 8 zones burning: headless FPS before/after + load.
- [ ] **T11 Lag/lifecycle + browser (brief 14, 18).** `?lag=150&jitter=20`: tap spam → one throw per cooldown, the count never jumps back; a hidden tab slept across a build start keeps slot and count; a late Game scene start shows the button. Dev: `?wallet=` + `DEV_STARTING_WALLET` to buy; screenshots of button, throw, zone, blast.
- [ ] **T12 Readability sheet, gates, mutations, merge notes.**

## Dev Notes

### Designer decisions to confirm (decided here non-interactively; recommended values)

- **D1 Use cooldown 0.5 s** (10 ticks) between consumable uses: stops a double tap from wasting a second grenade under lag. Alternative: none (one use per tap only).
- **D2 Molotov "3 m fire zone" = radius 3 m** (same convention as the grenade's "2.5 m" and 5.5's "2 m blast": radius). Alternative: radius 1.5 m (3 m across) if 3 m clears too much of a 48 × 32 m map.
- **D3 Grenades and molotovs only in waves; the medkit also in build phases.** No team griefing or wasted throws in the build phase.
- **D4 Molotov fire does not hurt buildings** (unlike car fires) and is not a nav cost (zombies walk through). Alternative: burn buildings like 4.8 (FR53 "fires damage buildings").
- **D5 Button spot:** 64 × 64 CSS px, 16 px left of the swap button at the same height (right thumb arc); count badge bottom-right. To verify in the 4.10/Epic 5 playtest.
- **D6 Using a consumable does not interrupt firing, reloading or swapping.**
- **D7 The cooldown counts applied inputs** (paused on a starved tick, like the weapon, 2.7): no "free" uses from input floods.
- **D8 Medkit not used at full HP** (button greys out); refill at full refused `already_full` (no money taken).
- **D9 Molotov kills pay the thrower** like a weapon kill (it is a player's attack; car-fire kills stay unpaid, 4.8 D5).
- **D11 Throw distance and marker follow 5.5** (cursor distance / stick deflection, clamp 2–8 m, landing ring shown while a throwable is in the slot and you aim). Alternative: always full 8 m in the aim direction (simpler on touch, no marker).
- **D10 Same-type refill costs the full pack price** (GDD "refills to the pack size"). Alternative: pay per missing item.

### Current state (read before changing)

- `net/input.ts`: `consumable` edge flag exists ("Story 5.12; always false until then").
- `core/systems.ts › applyInputs`: clears `swap`/`consumable` on a repeated seq.
- `apps/client/src/sim/LocalSimHost.ts` (~137, ~163) and `NetSimHost.ts` (~352, ~480): `latchedConsumable` already latches and sends once; `SimHost.ts` docs the drop on menu open.
- `apps/server/src/run/RunController.ts` (~137–160, ~335–357, ~458): dropped/skipped inputs carry `consumable` to the next input; tests in `RunController.test.ts` (~130, ~508).
- `apps/client/src/net/prediction.ts` (~335): the Predictor clears edge flags (never predicts a use — keep).
- `input/keyMap.ts`: comment reserves `KeyE`; `KeyboardMouse.ts` latches swap/menu; `InputRouter.build(out, hudSwap, …)`; `HudScene.ts` swap button (~321–333, layout ~549); `hudModel.swapPressed`.
- `combat/firing.ts › updateCombat`: grid rebuild → per-player weapon → `updateProjectiles`.
- `decay/fire.ts › updateFires` (per-body `fireTicks` clocks, `pulseS`, no stacking among car fires) in the `decayTimers` slot.
- `render/city/fireRing.ts` (ring at the damage edge), `CityView` fire lights pool.
- Shop: `economy/shop.ts`, 5.11's `buyItem` + `shop.buy_item`.

### Copies touched (brief line 2)

World (`PlayerState.consumable`, `consumableCount`, `consumableCooldownTicks`; area pool molotov zones; lob projectiles via 5.5) → schema (`consumable`, `consumableCount`) → `syncState` (+ reset) → `PlayerStateView` / `PLAYER_STATE_FIELDS` → `fakeRoom` → devThrottle (key list) → mirror (`NetSimHost.applyState` slot/count; zones + arcs from events) → Predictor (none: edge flag cleared, not predicted) → `snapshotWorld` (slot, count, cooldown, zones, lobs).

### Must be preserved

Edge-flag semantics (once per seq), RunController carry tests, swap button behaviour and HUD routing (no stick stolen), 4.8 car fire rules (D3, D7, D16, D19 clock reset at build starts — molotov zones never survive a build start: waves only), 5.4 friendly-fire rule, 5.5 lob/explosion rules, all existing tests.

### Dependencies

- **5.4 (round C)** friendly fire 50 % for `fire`/`explosion` tags in `combat/damage.ts` — required.
- **5.5 (round C)** `combat/grenades.ts` (pooled rounds, landing at `landTick`, track stopped at cover faces, aim distance from the aim vector length, `grenade.launched`), `combat/explosion.ts › explode(world, spec)` (one hit per body, `explosion.happened`), `GrenadeView`/`ExplosionView` — required; consumables add round kinds with their own numbers (5.5 notes: "5.12 will reuse grenades.ts and explode(); keep the API weapon-agnostic"). The aim-distance encoding (aim length < 1) must also apply while the slot holds a throwable and the button is pressed (AC 5).
- **5.6 (round A)** shared area pool (acid puddles; per-body clocks, events, caps) — molotov zones are a `fire` kind there; **5.8** gas clouds share it too.
- **4.8** car fires (no-stacking with molotov; ring visuals).
- **5.11 (same round)** `shop.buy_item` / `buyItem` / `SimHost.buyItem`, armor max HP for the medkit cap.
- **5.13** keeps consumables in the always-available section (not cards).

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 5.12 (FR8, FR49); GDD › Consumables line, Controls (consumable button); `game-architecture.md` › Client input (consumable flag), Event System; story files 2.4/2.7 (input carry), 2.11 (latch drop on menu), 4.8 (D3/D7/D16/D19), HANDOFF §3 ("edge flags fire once per input seq and LocalSimHost latches them").

## Notes for the merge (brief line 19)

- `balanceSchema.ts` + `balanceFileSchemas`: new `consumables` file; `balance.version` changes.
- `player/player.ts`: three new fields (test literals).
- `combat/firing.ts › updateCombat`: `useConsumables` first (after the grid rebuild).
- `core/simEvents.ts` / `net/netEvents.ts`: `consumable.used`, next free kind after A–C (check the final table; never reuse numbers).
- `RunState.ts` `playerFields`: append `consumable`, `consumableCount` after 5.11's `gear`.
- `input/keyMap.ts`, `KeyboardMouse.ts`, `InputRouter.ts`, `HudScene.ts`, `hudModel.ts`, `GameScene.ts` (input build call).
- 5.6's area pool / 5.5's lob: only add the `molotov`/`grenade` kinds and the landing hook; do not fork them.
- `decay/fire.ts`: the shared "one fire hit per pulse per body" rule with molotov zones.

## Dev Agent Record

### Agent Model Used

Claude (builder session, cloud).

### Decisions taken while building (plain English)

- **New lob rule (PR #5) replaces the story's "stopped at a car/bus face".** Thrown grenades and molotovs use 5.5's
  `lobTarget` unchanged: they fly over cars, the bus, barricades and turrets; only real buildings stop them; a roof
  aim lands at the car's near face. The blast is still shielded by cars and the bus. ACs 5/6 and C7/C15 updated.
- **One fire clock per body for car fires and molotov zones** (the story's "single fire pass" option): `updateFires`
  (`decay/fire.ts`) counts one `fireTicks` per body over both; at its pulse the body takes ONE hit — the stronger of
  the car fire's (no credit, full to players) and the molotov's (credit to the thrower; players the friendly-fire
  half). Pulse = the shorter of the fires it stands in (both 0.5 s today). So C9 (two molotovs + a car fire) = one
  hit per pulse, and a molotov on a car fire never lowers what a player takes there.
- **Molotov kills are paid inside the fire pass** (`payKill`): the economy system runs earlier in the tick and would
  never see a kill from `decayTimers` (car-fire kills were never paid, so nobody noticed). Credited weapon id = the
  consumable id `molotovs` (hand grenades: `grenades`).
- **Molotov fire respects cover (main-session decision 2026-11-23, the 5.6 acid rule):** a body burns only with a
  clear line from the zone's centre (`molotovZoneAt` → `shotBlockT`; walls, cars, the bus, buildings shield;
  barricades and sandbags don't); `consumables.json › fireFaceToleranceM` 0.02 lets a zone lit at a face burn its own
  side. The drawn circle stays whole (as acid's): the shielded part behind a car is drawn but doesn't burn.
- **Use and buy follow 5.11's `not_alive` order:** `buyItem` → `buyConsumable` refuses `not_build` → `unknown_player`
  → `not_alive` first; a use needs a standing player (no count, cooldown or event otherwise).
- **Molotov zones are their own area pool** (`world.molotovs`, 5.6's `areaPool` with kind FIRE, cap 8, a 9th replaces
  the oldest), like 5.8's gas — not inside the acid pool. Cleared at every build start and at the run's end.
- **Aim distance (D11):** the aim length is a fraction of the throw's 8 m range; while a launcher is in hand the
  client sends the launcher's encoding and the server decodes with the launcher's range (`throwAimLength`, also used
  by the client's ring). No aim (touch, aim stick released) → facing direction at 8 m.
- **Look variants are picked from the landing point** (`throwVariant`, whole centimetres), not from a simulation
  stream: every client and solo draw the same bottle/grenade and spread, and the run's seeded randomness is untouched.
- **Network:** `consumable.used` (kind 39) and `molotov.ignited` (kind 40, the zone; the client draws it for its life
  and applies the same cap) are new; `grenade.launched` appends the item (index 9) only for thrown consumables (a
  launcher round's tuple is unchanged); `explosion.happened` kind 3 = `hand_grenade` (EX2 look).
- **HUD:** the button is 16 px left of swap at the same height (D5). Main-session decision (2026-11-23, 5.16 D3):
  while the build bar is up, the consumable button and swap sit in a row above the grid's top-left edge (12 px
  gaps, `layoutRightButtons`, tested at 568×320 / 800×360 / 1024×768 and dpr 1–2 against the tiles, the count line,
  Ready and ☰), so the medkit stays usable on touch in a build phase; both hide while holding a building. Greyed when it
  can't be used now (medkit at full HP, a throwable in a build phase), dimmed while pending (AC 7: until the synced
  count moves, 1 s timeout).
- **Fire visuals budget:** the 8-zone worst case cost ~45 % of the headless frame rate at first; the pool fire now
  has its own budget in `consumables.json › fx` (particle/smoke share, ring-flame spacing, and caps over ALL live zones).
- **Bots:** medkit below 40 % HP; a throw at the densest zombie within reach when ≥ 5 stand in its radius (numbers
  in `bots.json`). The default `shoppingList` is unchanged (consumable ids are accepted).

### Debug Log References

- Gate: `npm run typecheck && npm run lint && npm test && npm run build` (see the final message for the result).
- Bandwidth (`consumableBandwidth.test.ts`): one grenade 53 B (used + launched + blast), one molotov 51 B (used +
  launched + ignited); 4 players × 4 throws in 2 s: 681 B (≈ 341 B/s over those 2 s, worst tick 109 B). Schema: 2
  uint8 fields on change only.
- Tick cost (`tickCostConsumables.test.ts`, load 0.17): 150 Walkers p99 0.908 ms → with 8 burning zones + a grenade
  every 2 s p99 1.051 ms: **+0.143 ms** (budget 0.3).
- 6-wave sim (3 bots, 2 seeds per type, wallet 300): medkit 4 heals, grenades 73 blasts (blast kills ≥ 1), molotovs
  48 zones / 391 burns; 5 of 6 runs held out, 1 wiped in W5.
- Fuzz: (A) 5,524 throws on 24 layouts, 1,294 stopped at a building face, none inside cover, none through a
  building; (B) 6 layouts × 900 ticks: 999 throws, 660 zones, 16,578 burns, 137 blast kills; no zombie in a box, no
  stray nav rebuild.
- Follow-up (main-session alignment): cover test (zone at a car's face: behind the car 0 damage, in front 32,
  past sandbags burns) and the above-the-bar layout test (6 cases); a mutation of each fails its test.
- Mutations: 18 source mutations, one per new test, all killed (cooldown, full-HP medkit, stacking, unpaid kills,
  zone ageing, refill at full, item on the wire, client cap, pending, shop Full, E latch, use event, slot mirror,
  burn liveness, bot heal, lob through buildings, repeated-seq edge flag, snapshot of zones).
- Browser (`docs/art/5-12/README.md`): online `?lag=150&jitter=20` 5 taps → 1 use; `?stress=150` headless 34.5/35.1 →
  23.2/24.8 fps with 8 zones (load 1.8–2.7).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Built: consumables.json + schema; slot (`PlayerState.consumable`, `consumableCount`, `consumableCooldownTicks`);
  `buyConsumable` (fill / refill / replace / `already_full`) through 5.11's `buyItem`; `useConsumables` (start of the
  combat system); thrown items in 5.5's pool (`item`) with `landConsumable` (hand-grenade blast / molotov zone);
  molotov zones and the shared fire pass; schema, sync, views, mirror, snapshot; events; client E key, HUD button
  with pending, throw ring, flights with HG/MB art, the molotov fire view, CI4 icons, shop section; bots; fuzz, sims,
  bandwidth, perf, readability rows 39–42.
- Not verified: real phones; a hidden tab asleep across a BUILD START (the online check slept mid-wave); a late
  Game scene start with a slot; touch throwing on a real device (aim stick held with one finger, button with another).

### Notes for the merge (brief line 19)

- `balanceSchema.ts` / `balance.ts`: new file `consumables` (with `fx`); `bots` gains `medkitBelowHpFrac`,
  `throwClusterMin` (defaults); `balance.version` changes. Test fixtures that list the balance files now import
  `consumables.json` (aimAssist, melee, firing, swap, balance, zombieAi, waveDirector, spawnPoints tests).
- `player/player.ts`: three new fields (test literals that build a `PlayerState` by hand need them).
- `combat/firing.ts › updateCombat`: `useConsumables` first, after the grid rebuild.
- `combat/grenades.ts`: pool field `item`; `throwConsumable`; `landConsumable`; `LobRange`/`LobFlight` types.
- `combat/explosion.ts`: `EXPLOSION_KINDS` appends `hand_grenade` (index 3).
- `decay/fire.ts`: `updateFires` now also burns molotov zones (one clock per body) and ages them; buildings are
  burnt by car fires only. 5.10 (med station) does not touch it as far as known.
- `core/simEvents.ts` / `net/netEvents.ts`: `consumable.used` = 39, `molotov.ignited` = 40 — **5.10 is built in
  parallel: if it took 39/40, renumber these at the merge (never reuse a number)**. `grenade.launched` index 9 = item.
- `RunState.ts` `playerFields`: `consumable`, `consumableCount` appended after `reviveNeed`; `syncState`, `resetPlayer`,
  `PlayerStateView`/`PLAYER_STATE_FIELDS`, `fakeRoom`, devThrottle (key list, automatic), mirror (`NetSimHost.applyPlayer`).
- `economy/shop.ts`: `ShopError` gains `already_full`; `BoughtItem.replaced`; `buyItem` dispatches consumables.
  **5.13 (card shop):** keep consumables in the always-available section (`shopConsumables`, ShopScreen's
  `ConsumableSection`, shopStore `consumableRows`).
- `world.ts`: `world.molotovs`; `runStateMachine.ts`: `clearMolotovZones` at build start and run end;
  `worldSnapshot.ts`: `molotovs` + the grenade `item`.
- Client: `keyMap` (KeyE), `KeyboardMouse`, `InputRouter.build(…, hudConsumable)` (trailing param), `HudScene`
  (button + layout above the build bar), `hudModel`, `GameScene` (gate, ring, MolotovView, shop sync),
  `GrenadeView`/`grenadeFx` (item, HG/MB sprites, `burstAt`), `FireView`/`fireParticles` (pool mode), `itemIcons`
  (CI4 drawings + `flame` painter), `ShopScreen`/`shopStore`, `session.ts` (`already_full`), `urlOptions`
  (`?stressbuild=molotov`), `stressScenario` (`keepStressMolotovs`).

### File List

New: `packages/shared/src/config/balance/consumables.json`, `packages/shared/src/economy/consumables.ts`,
`packages/shared/src/economy/consumables.test.ts`, `packages/shared/src/combat/consumables.ts`,
`packages/shared/src/combat/consumables.test.ts`, `packages/shared/src/combat/consumables.fuzz.test.ts`,
`packages/shared/src/hazards/molotov.ts`, `apps/server/src/run/consumableBandwidth.test.ts`,
`apps/server/src/run/tickCostConsumables.test.ts`, `apps/client/src/scenes/consumableButton.ts`,
`apps/client/src/scenes/consumableButton.test.ts`, `apps/client/src/render/molotovFx.ts`,
`apps/client/src/render/molotovFx.test.ts`, `apps/client/src/render/MolotovView.ts`,
`apps/client/src/render/city/consumableIcons.ts`, `apps/client/src/render/city/throwArt.ts`,
`apps/client/src/render/city/throwArt.test.ts`, `apps/client/src/sim/NetSimHost.consumables.test.ts`,
`docs/art/5-12/*` (README + 13 screenshots).

Changed: see `git show --stat` of the story commit (shared: balance, player, world, grenades, explosion, firing,
fire, shop, netEvents, simEvents, stateView, worldSnapshot, runStateMachine, areaPool, bots, index; server: RunState,
syncState, RunController.test; client: input, HUD, GameScene, views, shop, session, debug), readability sheet/key,
sprint-status.
