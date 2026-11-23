# Story 5.10: Floodlight and med station

Status: ready-for-dev

## Story

As a player,
I want lights and healing I can build,
so that we have a safe spot to fall back to.

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
> Most relevant here: 2 (light state and healing are shared sim; the light list is *derived* on every copy), 3/4 (fairness ACs 5–9 and the "Beat the rule" list below), 7 (fuzz with the two new footprints), 9 (liveness: HP really rises), 11 (≈ 0 B/s for the floodlight, small for healing), 12 (the floodlight light must stay cheap: 4.9's light layers cost 22 → 8.6 headless FPS), 13 (readable at a glance, does it stop bullets?), 18 (the shop flag is a switch, not a JSON edit).

## Acceptance Criteria

1. **Floodlight (FR52).** A building type `floodlight` in `buildings.json`: **150 HP, price 100**, footprint **1 × 1 m** (D2), with a `light` block `{ radiusM: 4 }` (D1: "lights an 8 m circle" = 8 m across). Once placed it is a normal building: it blocks bodies and the nav grid like a turret (3.4/3.5), zombies attack it when it is in their way, it can be repaired (3.7) and burns in a car fire (4.8). Bullets pass it (like every player building today; 4.2 cover unchanged).
2. **Server light state.** Every copy of the World (server, solo, NetSimHost mirror) holds the same **light-source list** `world.lights` (new `decay/lightState.ts`, architecture › Blackout Lighting: "the server owns the light state … which light sources exist"): one entry per standing building whose type has a `light` block (`kind: "floodlight"`, centre, `radiusM`, building id) plus one per burning decay fire (`kind: "fire"`, from `world.decay.fires`, radius = the fire's). It is **derived**, never synced: rebuilt only when `buildings.version` or the fire list changes (one compare per tick, no allocation per tick). No blackout flag yet (Story 6.3 adds it and reads this list).
3. **Kept out of the shop.** The floodlight carries `"inShop": false` (new optional building-type field, default `true`). `shopBuildings` does not list it and `placementError` refuses it with a new `PlaceError` `"not_for_sale"` (a crafted `building.place` cannot buy it). Dev switch (brief 18): server `DEV_SHOP_ALL=1` + client `?shopall=1` (a `world.debug.shopAll` flag, outside balance, so `balance.version` and the join check do not change). Story 6.3 flips the JSON flag when blackout exists.
4. **Med station (FR52).** A building type `med_station`: **300 HP, price 400**, footprint **1 × 1 m**, with a `heal` block `{ radiusM: 2, hpPerS: 5 }`. Blocks bodies and nav like the floodlight; in the shop.
5. **Fairness rule: who heals.** A player heals when **their body circle overlaps the heal circle** (radius 2 m round the station's centre; strict `d < 2 + r_body`, the 4.8 D7 "touch the ring" rule), is **"alive"**, and the run phase is **build or wave** (not lobby, not results, not after a team wipe). **Downed and out players are never healed** (a downed player stays at 0 HP; their countdown is untouched).
6. **Fairness rule: how much.** A healed player gains exactly `hpPerS × TICK_DT_S` (0.25 HP) per tick, capped at **their** `maxHp` (Story 5.11's armor raises it). Continuous per-body accrual (brief 6): there is no pulse to dodge and no clock to farm. Stepping in for 1 s always gives 5 HP (± one tick); 10 s at 50/100 HP gives exactly +50 (100 cap).
7. **Fairness rule: no stacking.** Two or more med stations reaching a player heal at **5 HP/s total**, not 10 (one heal per player per tick, whichever stations reach). A station heals every player in reach at once (up to 4 at full rate each).
8. **Fairness rule: no line-of-sight.** Healing is an aura: walls, cars and barricades between the station and the player do not block it (readable: "inside the green ring = healing"). Fire still hurts while healing (4.8 fire 10/s vs heal 5/s: standing in fire is a net loss).
9. **Server truth.** HP is the server's (solo: the World's). The client shows `player.hp` from state (ceil rule of 3.7); no prediction of healing. A heal cue (D6) appears only when that player's synced HP rose while they stand in a mirror station's ring.
10. **Readability (brief 13).** At a glance: the floodlight reads as a lamp mast/head on a small base, casting a visible warm-white pool of 4 m radius on the street; the med station reads as a medical crate/kiosk (white with a red or green cross) with a **soft green ring at exactly the heal radius** (ring drawn where a body touching it heals, like 4.8 D16's fire ring). Both look like obstacles (they stop bodies) and not like cover: bullets pass them. Both added to `docs/playtests/milestone-1/readability-sheet.md` (+ answer key) as "what is this? does it stop bullets?" rows. Damaged look and HP bar as every building (3.5).
11. **Phone FPS (brief 12; D4).** The floodlight's light is **one pooled ADD-blended `FX_GLOW` image** per floodlight in view (+ a 2 m margin), at most `FLOOD_LIGHTS_MAX` = 8 drawn (nearest the camera centre), strength per decay stage from a new `NightLight.floodA` column in `NIGHT_BY_STAGE`. **No re-bake** of the city tiles or the lightmap when a floodlight is placed or destroyed, no full-screen layer, no render texture. The med station ring is one Graphics redrawn on zoom or list change only (4.8 `fireRing` pattern). `?stress=150` with 8 floodlights and 4 med stations in view: headless FPS before/after reported with machine load; drop ≤ 10 % headless (else the fallback in D4).
12. **Network (brief 11).** No new schema field: both buildings ride the existing `buildings` map (+ `building.placed` event). Added bandwidth reported: floodlight 0 B/s after placement; healing ≈ 5 HP-field patches/s per healing player (≈ 15–25 B/s each).
13. **Tests:** placement + shop flag + crafted refusal; light list on server, solo and mirror equal (and after destroy, after a fire goes out, after a hidden-tab build start); heal rate, cap, downed/out excluded, phases, no stacking, through walls, armor cap (if 5.11 merged); Downtown fuzz with the new footprints; bandwidth; perf; liveness; each new test fails under one mutation.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | Build 3 med stations in a triangle and stand in all rings | 5 HP/s, not 15 (AC 7) |
| B2 | Stand a downed teammate in the ring to "heal them up" before a revive | Stays 0 HP; revive gives `reviveHpFrac` as today (AC 5) |
| B3 | Revive inside the ring | Revive HP 30, then +5/s from the next tick (alive) |
| B4 | Step in and out every tick to beat a pulse | No pulse: 0.25 HP per tick inside, exactly (AC 6) |
| B5 | Heal behind a barricade wall / through a car | Heals (aura, AC 8): intended and readable |
| B6 | Stand in a car fire next to a med station | Net −5 HP/s (fire 10, heal 5) |
| B7 | Heal in the lobby / on Results / after a wipe | No change (AC 5) |
| B8 | Heal above max HP (e.g. buy then lose armor) | Never above `maxHp` (AC 6) |
| B9 | Send a crafted `building.place {type:"floodlight"}` | `building.refused` `not_for_sale`, wallet unchanged (AC 3) |
| B10 | Use `?shopall=1` without the server switch | Item shows, the server refuses `not_for_sale` (visible refusal) |
| B11 | Place a med station within 2 m of a spawn / boxed in a fire / on a stage-change solid | Spawn clearance refuses; fire: burns (4.8 D6); stage solid: destroyed + 50 % refund (4.5) |
| B12 | Use stations as a cheap wall | 400 for a 1 × 1 m block: worse than wood barricades; zombies break it (3.5) |
| B13 | Place 24 floodlights in one spot to tank phone FPS | ≤ 8 drawn (AC 11); FPS within budget |
| B14 | Make the client light list disagree (late join, slept tab, `?lag=150&jitter=20`) | Derived from the synced buildings and fires: equal after the next state (AC 2) |
| B15 | Heal zombies standing in the ring / heal buildings | Never (players only) |

## Tasks / Subtasks

- [ ] **T0 Art pick (first, before any drawing code; AC 10).** Make ~5 Meshy proposals each (`nano-banana-pro`, text to image, the 4.11 shared style line: strict top-down orthographic, gritty realistic, night, wet asphalt, cool streetlight from the upper left, muted, crisp silhouette, no text) for (a) the **floodlight** (1 × 1 m base, lamp head, its light pool on wet asphalt) and (b) the **med station** (1 × 1 m medical crate/kiosk, cross mark, a hint of the 2 m green ring). Put them on one private proposal page (Artifact), the designer picks one each; save the picks as `docs/art/5-10/floodlight_<pick>.jpg`, `med_station_<pick>.jpg` with a `docs/art/5-10/README.md` like `docs/art/4-11/README.md` (file, use, footprint, prompts). Build sprites from the picks into the downtown atlas (`prop_floodlight_a`, `prop_medstation_a`, ≤ 2048², `spriteArt.ts`/`spriteAtlas.ts` pattern). **Do not start T5 until the pick is recorded.**
- [ ] **T1 Balance (AC 1, 3, 4).**
  - [ ] `balanceSchema.ts › buildingTypeSchema`: optional `inShop: z.boolean().default(true)`, optional `light: { radiusM > 0, ≤ 16 }`, optional `heal: { radiusM > 0, ≤ 8, hpPerS > 0 }` (strict); refine: a type has at most one of `turret` / `light` / `heal` (and 5.9's `trap`/`mine` blocks, whatever 5.9 named them).
  - [ ] `buildings.json`: `floodlight` (name "Floodlight", price 100, 1 × 1, hp 150, `inShop: false`, `light.radiusM 4`), `med_station` (name "Med station", price 400, 1 × 1, hp 300, `heal { radiusM 2, hpPerS 5 }`). `balance.version` changes.
  - [ ] Tests: `config/balance.test.ts` › "building blocks: light/heal validate; two behaviour blocks refused; inShop defaults true".
- [ ] **T2 Shop flag + placement refusal (AC 3).**
  - [ ] `economy/shop.ts › shopBuildings(balance, shopAll = false)`: skip `inShop === false` unless `shopAll` (the cache keys by balance; keep two cached lists).
  - [ ] `buildings/buildings.ts › placementError`: after `unknown_type`, `if (!stats.inShop && !world.debug.shopAll) return "not_for_sale"`; `PlaceError` gains `"not_for_sale"`; client `placeRefusalText` gets a line ("Not for sale yet").
  - [ ] `world.ts › WorldDebug.shopAll` (default false); server `DEV_SHOP_ALL=1` (dev only, beside `DEV_STARTING_WALLET` in `RunRoom.ts`); client `?shopall=1` in `debug/urlOptions.ts` sets the solo World's flag and the shop list.
  - [ ] Tests: `economy/shop.test.ts` › "floodlight is not listed; listed with shopAll"; `buildings/buildings.test.ts` › "a floodlight placement is refused not_for_sale, wallet unchanged; accepted with debug.shopAll"; `RunRoom.buildings.test.ts` › "crafted floodlight place → building.refused not_for_sale".
- [ ] **T3 Light state (AC 2).**
  - [ ] New `packages/shared/src/decay/lightState.ts`: `interface LightSource { kind: "floodlight" | "fire"; x; y; radiusM; buildingId (0 for fires) }`; `LightState { list: LightSource[]; buildingsVersion; firesKey }`; `updateLightState(world)` rebuilds the list (reusing entry objects; fires first in map order, then floodlights in building-id order) only when `buildings.version` or the fire list identity/length changed. Add `lights: LightState` to `World` (`createWorld`).
  - [ ] Call `updateLightState` at the end of `updateBuildings` (server/solo) **and** wherever the mirror applies buildings/decay (`net/mirrorBuildings.ts`, `net/mirrorDecay.ts`, i.e. `NetSimHost.applyState`) so all three copies agree without a system running on the client. Also after `applyDecayStage` (fires lit/out at a build start) on every path.
  - [ ] Not in `snapshotWorld` (derived; say so in a comment) — but the snapshot digest test must still pass with floodlights placed.
  - [ ] Tests: `decay/lightState.test.ts` › "a placed floodlight is one light at its centre with radius 4"; "destroyed → gone"; "stage-3 fires are lights; out at expiry → gone"; "no rebuild when nothing changed (same array identity, no allocation)"; `apps/client/src/sim/NetSimHost.lights.test.ts` › "mirror light list equals the server's after place / destroy / fire out / a slept tab across a build start / a late join".
- [ ] **T4 Med station healing (AC 4–9).**
  - [ ] New `packages/shared/src/buildings/medStation.ts › updateMedStations(world, dtS)`, called in `updateBuildings` after `updateTurrets` (the `buildings` slot; server and solo only, never `PREDICTION_SYSTEMS`). For each player in id order (reuse `collectInIdOrder` style, no allocation): skip unless `status === "alive"` and phase is build/wave and `!world.teamWiped`; if any building with a `heal` block has `dist(centre, player) < heal.radiusM + p.radiusM` → `p.hp = Math.min(p.maxHp, p.hp + heal.hpPerS × dtS)` once (no stacking; if two types differ in rate, the highest rate wins). No event per tick.
  - [ ] Tests (`buildings/medStation.test.ts`, systems `{ waves: () => {} }` where the run must not advance): "50 → 100 in exactly 200 ticks, then stays 100" (liveness); "just outside the ring (d = 2 + r) no heal, just inside heals"; "downed and out: no heal, countdown unchanged"; "lobby/results/wiped: no heal"; "two and three stations: 0.25 per tick"; "heals through a barricade and a car box"; "4 players at once"; "fire + heal = −5/s (stage-3 fire)"; "maxHp 125 (5.11 armor, if merged) caps at 125"; "zombies and buildings never healed".
- [ ] **T5 Client views (AC 9–11)** — after T0.
  - [ ] `render/FloodlightView.ts`: lamp sprite from the atlas over `BuildingView`'s base (TurretView pattern: drawn on `buildings.version` change, pooled), and the light pool: pool of `FLOOD_LIGHTS_MAX` glow images (`ATLAS_FX`/`FX_GLOW`, `BlendModes.ADD`, warm-white tint, display size 2 × radius, depth `DYN_LIGHT_DEPTH` 4.32 from `CityView`), positioned from `world.lights` (kind floodlight) each frame with in-view culling + nearest-first selection via a pure helper `pickDrawnLights(lights, viewX, viewY, viewW, viewH, max, out)` (no allocation).
  - [ ] `render/city/palette.ts`: `NightLight.floodA` per stage (recommended 0.22, 0.28, 0.32, 0.36, 0.4) — `palette.test.ts` contrast checks still pass.
  - [ ] `render/MedStationView.ts`: crate sprite + one Graphics ring at exactly `heal.radiusM + 0` m round the centre (the "touch the ring heals" line; label the radius maths in a pure `medRing.ts` with a test like `fireRing.test.ts`: a body at d = r + r_body − ε heals, at d = r + r_body does not), ~2 px at any zoom, soft green; redrawn on zoom or list change only.
  - [ ] Heal cue (D6): `PlayerView` shows a short green "+" tint when the player's HP (from state; solo from the World) rose since last frame **and** the player overlaps a mirror station's ring; no event.
  - [ ] Shop: the med station appears in the Buildings section (existing `ShopScreen` path); the floodlight only with `?shopall=1`.
  - [ ] Tests: `render/floodlightLook.test.ts` › `pickDrawnLights` caps at 8, nearest first, culls out-of-view (+ margin), ties stable by building id; `render/medRing.test.ts`.
- [ ] **T6 Fuzz (brief 7).** Extend `zombies/downtown.fuzz.test.ts`: random layouts now also place floodlights and med stations (1 × 1) with the barricades/turrets, × every decay stage × variants, many ticks: no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start; assert ≥ 1 heal happened and the light list length = floodlights + burning fires in every layout (liveness).
- [ ] **T7 Bandwidth + perf (brief 11, 12, 16).**
  - [ ] `apps/server/src/run/medStationBandwidth.test.ts` (pattern `turretBandwidth.test.ts`): idle floodlight → 0 B/s added after placement; one player healing → report B/s (expected ≈ 15–25); 4 players → report.
  - [ ] Tick cost (`PERF_ASSERT=1`, `tickCostDowntown.test.ts` pattern): 4 players + 150 Walkers + 6 med stations + 6 floodlights: report p99 before/after and machine load; added p99 ≤ 0.2 ms.
  - [ ] Browser: `?stress=150` with 8 floodlights + 4 med stations in view (`?shopall=1`, dev cheats): headless FPS before/after + load; screenshots of both buildings at stages 1, 2, 3.
- [ ] **T8 Lag/lifecycle (brief 14).** Online at `?lag=150&jitter=20`: place both, stand in the ring while hurt (dev `?zdmg=`), HP rises in steps of the server; a tab slept across a build start shows the same lights; a late Game scene start draws both.
- [ ] **T9 Readability sheet + gates + merge notes.** Rows in `docs/playtests/milestone-1/readability-sheet.md` and `readability-key.md`; `npm run typecheck && npm run lint && npm test && npm run build`; mutation list; merge notes.

## Dev Notes

### Designer decisions to confirm (decided here non-interactively; recommended values)

- **D1 Floodlight radius: 4 m (8 m across).** The GDD/epic text "lights an 8 m circle" reads as the circle's size; 4 m radius is a lit area of ~50 m² (a fallback spot for 2–4 players) and costs a quarter of the fill rate of an 8 m radius (16 m across ≈ a third of Downtown's width). Alternative: 8 m radius (if 6.3's blackout feels too dark). Gameplay effect only from 6.3.
- **D2 Footprints: both 1 × 1 m** (like the turret; tappable on a phone, fit the 0.5 m lattice). Alternative: floodlight 0.5 × 0.5 m (a pole) — harder to tap/repair.
- **D3 Med station heals in build and wave phases**, players only, no line of sight, highest rate wins (no stacking). Alternative: wave only (the build heal already gives 50 %).
- **D4 Cheap floodlight light:** a pooled additive glow sprite per floodlight in view, ≤ 8 drawn, per-stage strength `floodA`; never a re-bake, render texture or full-screen layer (4.9 lesson). Fallback if the headless drop is > 10 %: cap 4 and a 0.5× glow texture. The darkness render texture with cut-out circles is 6.3's (architecture › Blackout Lighting), drawn only when the blackout flag is on.
- **D5 Floodlight stays out of the shop** with `inShop: false` until 6.3 (epics AC); dev switch `DEV_SHOP_ALL=1` + `?shopall=1`. 5.13's card shop must respect the same flag (gear flashlight too: Story 5.11).
- **D6 Heal cue from state, not events:** green "+" tint when the synced HP rose inside a ring (0 B/s). Alternative: a `player.healed` event once per second (~6 B/s per player).
- **D7 Med station price 400, HP 300; floodlight price 100, HP 150** (GDD table; the GDD's "Floodlight 120 / Med station 300" are Supply unlock costs for Epic 7, not shop prices).

### Current state (read before changing)

- `packages/shared/src/buildings/buildings.ts`: `Building` (box min corner on the 0.5 m lattice, `hp`, `fireCooldownS`, `fireTicks`, `aimX/Y`), `placementError` order (unknown player → not build → unknown type → limit → money → blocked), `addBuildingAt`, `damageBuilding`, `buildingTypeIds` (net index of types: **append new types at the end** of `buildings.json` so existing indices stay).
- `buildings/turret.ts`: the pattern for a "powered" building: a behaviour block on the type (`turretStats(balance, type)`), `updateTurrets` iterates the sorted list in the `buildings` slot, `buildingCentreX/Y`.
- `buildings/buildingSystem.ts › updateBuildings`: `updatePathing` → `updateTurrets`. Add `updateMedStations` and `updateLightState` here.
- `core/systems.ts`: fixed `SYSTEM_ORDER`; `PREDICTION_SYSTEMS` = input + movePlayers (healing is never predicted).
- `player/player.ts`: `hp`/`maxHp` floats; schema sends `hp` as `ceil` uint16 (`syncState.visitPlayer`).
- `decay/fire.ts`/`decayState.ts`: `world.decay.fires` (`FireRecord` x, y, radius, index) — the fire half of the light list.
- `economy/shop.ts › shopBuildings`: lists every type with a numeric `price` (cached per balance).
- Client: `render/BuildingView.ts` (base, damage look, HP bar; redraw on `version`/`hpChecksum`), `render/TurretView.ts` (pooled heads over the base), `render/city/CityView.ts` (`glowImg` = `FX_GLOW` ADD images at `DYN_LIGHT_DEPTH`; `FIRE_LIGHTS` pooled fire lights; the lightmap is baked into tiles at stage change only — do not touch it), `render/city/palette.ts › NIGHT_BY_STAGE`/`nightAt(stage)`, `render/city/fireRing.ts` (ring-at-the-damage-edge helper).
- Network: `BuildingStateView`/`BUILDING_STATE_FIELDS` (type, owner, gx, gy, rot, hp), `syncBuildings` in `syncState.ts`, `net/mirrorBuildings.ts`.

### Copies touched (brief line 2)

World (`lights`, `debug.shopAll`) → schema: none (buildings map unchanged) → syncState: none → stateView key lists: none → mirror (`mirrorBuildings`/`mirrorDecay` call `updateLightState`) → Predictor: none (healing and lights are not predicted; buildings already mirrored for collision) → devThrottle: none → snapshotWorld: none (lights derived; no new timer state — healing has no clock).

### Must be preserved

Turret behaviour and tests, building placement rules (spawn clearance, lattice), 4.5 build-start order (destroy on new solids + refund), 4.8 fire on buildings, 4.9 bake (no extra bakes: assert `CityView.bakeCount` unchanged after placing a floodlight), prediction = server, all existing tests.

### Dependencies

- **5.9 (round A)** extends `buildingTypeSchema` (metal upgrade, spike trap, mine: non-blocking floor buildings, single-use) and `BuildingView`; build on its schema shape (one behaviour block per type) and its fuzz additions. Merge conflict expected in `buildings.json`, `balanceSchema.ts`, `buildingSystem.ts`, `BuildingView.ts`, `downtown.fuzz.test.ts`.
- **5.11 (same round)**: armor raises `maxHp` — the heal cap test uses it if merged, otherwise sets `p.maxHp = 125` directly.
- **5.13**: must keep `inShop: false` items out of the card pool.
- **6.3**: adds the blackout flag and the darkness render texture reading `world.lights`.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 5.10; GDD › Buildings and Defenses (table), Level Progression (W9 blackout, W10 lit by fires and floodlights); `game-architecture.md` › Novel Patterns › 4. Blackout Lighting, Lighting row of the tech table.
- Story files 3.6 (turret pattern), 3.5 (damage look, nav), 4.8 (D7 strict overlap, D16 ring = edge), 4.9 (light baked in tiles, perf lesson); `docs/art/4-11/README.md` (art pick format); HANDOFF §3 lessons.

## Notes for the merge (brief line 19)

- `buildings.json`: append `floodlight`, `med_station` **after** 5.9's types (type index on the wire = key order).
- `balanceSchema.ts › buildingTypeSchema`: new optional `inShop`, `light`, `heal`; one-behaviour refine must include 5.9's blocks.
- `buildings.ts`: `PlaceError` + `"not_for_sale"` (client `placeRefusalText` and any exhaustive switch).
- `buildingSystem.ts`: order `updatePathing → updateTurrets → (5.9 traps/mines) → updateMedStations → updateLightState`.
- `world.ts`: `lights`, `debug.shopAll`. `shop.ts`: `shopBuildings(balance, shopAll)` signature (callers: `ShopScreen` open path, `botShop.ts`).
- `palette.ts`: `NightLight.floodA` column (every row).
- `RunRoom.ts`: `DEV_SHOP_ALL` next to the other dev switches.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

## Change from the Epic 6 design session (designer, 2026-11-23)

Decision D5 (`docs/ideas/epic-6/proposal.md`): the floodlight's light radius is **6 m during blackout waves** (Epic 6, Story 6.3), 4 m otherwise. Put both radii in balance JSON (e.g. `floodlight.lightRadiusM` 4 and `floodlight.blackoutLightRadiusM` 6) so 6.3 only switches between them.
