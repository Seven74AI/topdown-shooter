# Story 5.10: Floodlight and med station

Status: review

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

- [x] **T0 Art pick (first, before any drawing code; AC 10).** Make ~5 Meshy proposals each (`nano-banana-pro`, text to image, the 4.11 shared style line: strict top-down orthographic, gritty realistic, night, wet asphalt, cool streetlight from the upper left, muted, crisp silhouette, no text) for (a) the **floodlight** (1 × 1 m base, lamp head, its light pool on wet asphalt) and (b) the **med station** (1 × 1 m medical crate/kiosk, cross mark, a hint of the 2 m green ring). Put them on one private proposal page (Artifact), the designer picks one each; save the picks as `docs/art/5-10/floodlight_<pick>.jpg`, `med_station_<pick>.jpg` with a `docs/art/5-10/README.md` like `docs/art/4-11/README.md` (file, use, footprint, prompts). Build sprites from the picks into the downtown atlas (`prop_floodlight_a`, `prop_medstation_a`, ≤ 2048², `spriteArt.ts`/`spriteAtlas.ts` pattern). **Do not start T5 until the pick is recorded.**
- [x] **T1 Balance (AC 1, 3, 4).**
  - [x] `balanceSchema.ts › buildingTypeSchema`: optional `inShop: z.boolean().default(true)`, optional `light: { radiusM > 0, ≤ 16 }`, optional `heal: { radiusM > 0, ≤ 8, hpPerS > 0 }` (strict); refine: a type has at most one of `turret` / `light` / `heal` (and 5.9's `trap`/`mine` blocks, whatever 5.9 named them).
  - [x] `buildings.json`: `floodlight` (name "Floodlight", price 100, 1 × 1, hp 150, `inShop: false`, `light.radiusM 4`), `med_station` (name "Med station", price 400, 1 × 1, hp 300, `heal { radiusM 2, hpPerS 5 }`). `balance.version` changes.
  - [x] Tests: `config/balance.test.ts` › "building blocks: light/heal validate; two behaviour blocks refused; inShop defaults true".
- [x] **T2 Shop flag + placement refusal (AC 3).**
  - [x] `economy/shop.ts › shopBuildings(balance, shopAll = false)`: skip `inShop === false` unless `shopAll` (the cache keys by balance; keep two cached lists).
  - [x] `buildings/buildings.ts › placementError`: after `unknown_type`, `if (!stats.inShop && !world.debug.shopAll) return "not_for_sale"`; `PlaceError` gains `"not_for_sale"`; client `placeRefusalText` gets a line ("Not for sale yet").
  - [x] `world.ts › WorldDebug.shopAll` (default false); server `DEV_SHOP_ALL=1` (dev only, beside `DEV_STARTING_WALLET` in `RunRoom.ts`); client `?shopall=1` in `debug/urlOptions.ts` sets the solo World's flag and the shop list.
  - [x] Tests: `economy/shop.test.ts` › "floodlight is not listed; listed with shopAll"; `buildings/buildings.test.ts` › "a floodlight placement is refused not_for_sale, wallet unchanged; accepted with debug.shopAll"; `RunRoom.buildings.test.ts` › "crafted floodlight place → building.refused not_for_sale".
- [x] **T3 Light state (AC 2).**
  - [x] New `packages/shared/src/decay/lightState.ts`: `interface LightSource { kind: "floodlight" | "fire"; x; y; radiusM; buildingId (0 for fires) }`; `LightState { list: LightSource[]; buildingsVersion; firesKey }`; `updateLightState(world)` rebuilds the list (reusing entry objects; fires first in map order, then floodlights in building-id order) only when `buildings.version` or the fire list identity/length changed. Add `lights: LightState` to `World` (`createWorld`).
  - [x] Call `updateLightState` at the end of `updateBuildings` (server/solo) **and** wherever the mirror applies buildings/decay (`net/mirrorBuildings.ts`, `net/mirrorDecay.ts`, i.e. `NetSimHost.applyState`) so all three copies agree without a system running on the client. Also after `applyDecayStage` (fires lit/out at a build start) on every path.
  - [x] Not in `snapshotWorld` (derived; say so in a comment) — but the snapshot digest test must still pass with floodlights placed.
  - [x] Tests: `decay/lightState.test.ts` › "a placed floodlight is one light at its centre with radius 4"; "destroyed → gone"; "stage-3 fires are lights; out at expiry → gone"; "no rebuild when nothing changed (same array identity, no allocation)"; `apps/client/src/sim/NetSimHost.lights.test.ts` › "mirror light list equals the server's after place / destroy / fire out / a slept tab across a build start / a late join".
- [x] **T4 Med station healing (AC 4–9).**
  - [x] New `packages/shared/src/buildings/medStation.ts › updateMedStations(world, dtS)`, called in `updateBuildings` after `updateTurrets` (the `buildings` slot; server and solo only, never `PREDICTION_SYSTEMS`). For each player in id order (reuse `collectInIdOrder` style, no allocation): skip unless `status === "alive"` and phase is build/wave and `!world.teamWiped`; if any building with a `heal` block has `dist(centre, player) < heal.radiusM + p.radiusM` → `p.hp = Math.min(p.maxHp, p.hp + heal.hpPerS × dtS)` once (no stacking; if two types differ in rate, the highest rate wins). No event per tick.
  - [x] Tests (`buildings/medStation.test.ts`, systems `{ waves: () => {} }` where the run must not advance): "50 → 100 in exactly 200 ticks, then stays 100" (liveness); "just outside the ring (d = 2 + r) no heal, just inside heals"; "downed and out: no heal, countdown unchanged"; "lobby/results/wiped: no heal"; "two and three stations: 0.25 per tick"; "heals through a barricade and a car box"; "4 players at once"; "fire + heal = −5/s (stage-3 fire)"; "maxHp 125 (5.11 armor, if merged) caps at 125"; "zombies and buildings never healed".
- [x] **T5 Client views (AC 9–11)** — after T0.
  - [x] `render/FloodlightView.ts`: lamp sprite from the atlas over `BuildingView`'s base (TurretView pattern: drawn on `buildings.version` change, pooled), and the light pool: pool of `FLOOD_LIGHTS_MAX` glow images (`ATLAS_FX`/`FX_GLOW`, `BlendModes.ADD`, warm-white tint, display size 2 × radius, depth `DYN_LIGHT_DEPTH` 4.32 from `CityView`), positioned from `world.lights` (kind floodlight) each frame with in-view culling + nearest-first selection via a pure helper `pickDrawnLights(lights, viewX, viewY, viewW, viewH, max, out)` (no allocation).
  - [x] `render/city/palette.ts`: `NightLight.floodA` per stage (recommended 0.22, 0.28, 0.32, 0.36, 0.4) — `palette.test.ts` contrast checks still pass.
  - [x] `render/MedStationView.ts`: crate sprite + one Graphics ring at exactly `heal.radiusM + 0` m round the centre (the "touch the ring heals" line; label the radius maths in a pure `medRing.ts` with a test like `fireRing.test.ts`: a body at d = r + r_body − ε heals, at d = r + r_body does not), ~2 px at any zoom, soft green; redrawn on zoom or list change only.
  - [x] Heal cue (D6): `PlayerView` shows a short green "+" tint when the player's HP (from state; solo from the World) rose since last frame **and** the player overlaps a mirror station's ring; no event.
  - [x] Shop: the med station appears in the Buildings section (existing `ShopScreen` path); the floodlight only with `?shopall=1`.
  - [x] Tests: `render/floodlightLook.test.ts` › `pickDrawnLights` caps at 8, nearest first, culls out-of-view (+ margin), ties stable by building id; `render/medRing.test.ts`.
- [x] **T6 Fuzz (brief 7).** Extend `zombies/downtown.fuzz.test.ts`: random layouts now also place floodlights and med stations (1 × 1) with the barricades/turrets, × every decay stage × variants, many ticks: no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start; assert ≥ 1 heal happened and the light list length = floodlights + burning fires in every layout (liveness).
- [x] **T7 Bandwidth + perf (brief 11, 12, 16).**
  - [x] `apps/server/src/run/medStationBandwidth.test.ts` (pattern `turretBandwidth.test.ts`): idle floodlight → 0 B/s added after placement; one player healing → report B/s (expected ≈ 15–25); 4 players → report.
  - [x] Tick cost (`PERF_ASSERT=1`, `tickCostDowntown.test.ts` pattern): 4 players + 150 Walkers + 6 med stations + 6 floodlights: report p99 before/after and machine load; added p99 ≤ 0.2 ms.
  - [x] Browser: `?stress=150` with 8 floodlights + 4 med stations in view (`?shopall=1`, dev cheats): headless FPS before/after + load; screenshots of both buildings at stages 1, 2, 3.
- [x] **T8 Lag/lifecycle (brief 14).** Online at `?lag=150&jitter=20`: place both, stand in the ring while hurt (dev `?zdmg=`), HP rises in steps of the server; a tab slept across a build start shows the same lights; a late Game scene start draws both.
- [x] **T9 Readability sheet + gates + merge notes.** Rows in `docs/playtests/milestone-1/readability-sheet.md` and `readability-key.md`; `npm run typecheck && npm run lint && npm test && npm run build`; mutation list; merge notes.

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

Builder in its own cloud session (container), branch `story-5-10` from the work branch `claude/awesome-fermat-1o1lbk` (`6d563bc`: master + round D looks). Own ports: client 5310, server 4810. Story 5.11 and 5.16 built in parallel elsewhere.

### Debug Log References

- **Gate** (`npm run typecheck && npm run lint && npm test && npm run build`): green on `story-5-10` (work branch `6d563bc` + this story; MS10 docs from `d526464`): **258 files passed (1 skipped), 2,078 tests passed (3 skipped)**, build OK. Load 2.32 before, 3.99 after (this container only).
- **Tick cost** (`tickCostDowntown.test.ts › Story 5.10`, `PERF_ASSERT=1`, 4 players + 150 Walkers on Downtown, each case twice interleaved, lower p99 kept): Downtown p99 1.094 ms (mean 0.667) → + 6 med stations healing (every player held at 50 HP: worst case) + 6 floodlights p99 1.213 ms (mean 0.726): **added p99 0.120 ms, mean 0.059 ms** (budget 0.2 ms); 250.8 HP healed, 6 lights; load 0.29.
- **Bandwidth** (`medStationBandwidth.test.ts`, 4 clients, 15 s, everything to everyone): baseline 100 B/s; **4 floodlights +0 B/s**; 4 idle med stations +0 B/s; **1 player healing +35 B/s** (the story estimated 15–25: `ceil(hp)` changes 5×/s and each HP patch costs ~7 B with the player's patch header); 4 players healing +110 B/s. No new event (the heal cue comes from state). Totals stay far below the 30 KB/s budget.
- **Headless FPS, `?stress=150`, 844 × 390 DPR 2, SwiftShader, own container** (no other builders here; load from `os.loadavg()`, a 12 s rAF count after 8 s warm-up):
  - First build (8 pools, `FX_GLOW`): before 12.5 / 13.0, after (`&stressbuild=lights`: 8 floodlights + 4 med stations round the survivor) 8.2 / 8.5 (load 0.1 → 2.8): **−35 %**. Isolation in one page: all on 8.4 → pools hidden 11.7 → + rings hidden 12.0 → + sprites/shadows hidden 13.0: the pools are the cost (fill rate: each 8 m disc covers ~¼ of the 24 × 11 m view, 8 of them ≈ 2 screens of additive blending on a CPU rasterizer).
  - D4 fallback applied (cap 4) → 9.6 / 9.9 vs 12.9 (−24 %); + merge (a lamp within 4 m of a drawn pool shares it: 8 → 4 pools in the stress layout, 24 stacked → 1) and the FL1 pool frame: **final 9.7 / 9.7 / 9.2 vs 12.1 / 11.4 (≈ −20 %, load 3.0 → 3.8)**. Still above the 10 % target: an open question for the designer (below). The "0.5× glow texture" half of D4 was not done: the texture's size does not change the screen pixels blended, which is the cost here.
- **Browser, solo** (`?solo&loadout=pistol&shopall=1&wallet=3000`): floodlight + med station placed through the host's real `placeBuilding` (wallet 3000 → 2500, so the floodlight went through `debug.shopAll`); the survivor at 40 HP standing in the ring healed and showed the green "+"; screenshots at stages 1–3 (stage cheat); no page errors.
- **Browser, online** (server `DEV_SHOP_ALL=1 DEV_STARTING_WALLET=2000 DEV_ZOMBIE_DAMAGE_SCALE=0.5`, two contexts `?lag=150&jitter=20&shopall=1&wallet=2000&zdmg=0.5`): host sent med station + floodlight; right after the send the mirror had 0 buildings (pending), both seen after 360 ms; the guest's light list equalled the host's; the guest slept (`loop.sleep()`) across the build start, woke 3 s into the wave: lists still equal. In the wave the host's synced HP (sampled every 0.25 s) rose by +1/+2 between bites while standing in the ring (5 rises), then the host went down at 0 and stayed at 0 (downed never healed, B2 online). No page errors.
- Phaser 4.2.1 checked in `node_modules/phaser/types` for `Image.setBlendMode`, `setDisplaySize`, `Graphics.fillCircle/strokeCircle/lineStyle`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Balance (T1):** `buildingTypeSchema` gains `inShop` (default true), `light {radiusM, blackoutRadiusM}` (Epic 6 D5: 4 m / 6 m; `blackoutRadiusM ≥ radiusM`), `heal {radiusM, hpPerS}`; `loadBalance`'s "one behaviour block" rule now counts turret / trap / mine / light / heal (and the upgrade "same kind" check knows light/heal). `buildings.json` appends `floodlight` (100, 1 × 1, 150 HP, `inShop: false`, light 4 / 6 m) and `med_station` (400, 1 × 1, 300 HP, heal 2 m, 5 HP/s) after 5.9's types (wire indices unchanged). `controls.json › fx` gains `maxFloodLights` 4, `floodLightViewMarginM` 2, `floodLightMergeM` 4 (client caps in balance, brief 10/12). `balance.version` changes.
- **`inShop` vs `forSale`:** 5.9's `forSale: false` (upgrade-only tiers) is refused `unknown_type` and never placeable; `inShop: false` is placeable but not offered: `shopBuildings(balance, shopAll)` skips it (two caches), `placementError` refuses `not_for_sale` (new `PlaceError`, client text "Not for sale yet", session's refusal list) unless `world.debug.shopAll`. Dev switch: server `DEV_SHOP_ALL=1` (dev only, read per run, next to `DEV_WAVE_MIX`) → `RunController({ shopAll })`; client `?shopall=1` → solo World's flag + the shop list. Online with `?shopall=1` but no server switch, the item shows and the server refuses it visibly (B10).
- **Light state (T3, `decay/lightState.ts`):** `world.lights` (list + keys + rebuild counter + entry pool) DERIVED on every copy, never synced or snapshotted (comment in `snapshotWorld`). `updateLightState` rebuilds only when `buildings.version` or the burning-fire set (bit mask of fire indexes + count) changed; fires first (map order), then floodlights (building-id order), entry objects reused. Called at the end of `updateBuildings`, at the end of `applyDecayStage` (every path: build start, cheat, mirror, Predictor), at the end of `mirrorBuildings`; `lightsOf(world)` brings it up to date before reading.
- **Med stations (T4, `buildings/medStation.ts`):** `updateMedStations` in the buildings slot after traps/mines (server + solo only; never predicted). Fairness rules exactly as ACs 5–8: strict `d < heal.radiusM + p.radiusM`, alive only, build/wave only, not after a wipe, `hpPerS × dt` per tick capped at the player's own `maxHp`, one heal per player per tick at the highest rate in reach (no stacking), no line of sight, players only. No allocation (module pass record + `forEach`), no event, no clock (nothing to snapshot). `inHealReach` shared for the client's cue.
- **Client (T5):** art in `render/city/propArt.ts` (FL1 + FL5 ported from looks.html; the med station started as an isolated placeholder in `drawMedStation` and now draws the designer's pick **MS10**, ported from `drawMS10` when the main session sent it) → buildings atlas frames `prop_floodlight_a/b`, `prop_medstation_a` (`addGeneratedTexture`); `BuildingView` draws them like every atlased building (damage tint, HP bar, rotation). Floodlight casts no box shadow (the FL1 art keeps its own soft tripod shadow), the med station a 0.9 m crate's. MS10's green LED panel gets a small pooled ADD glow (`FX_GLOW`, 0.9 m, one per station, ≤ 24, placed on a list change only). `FloodlightView`: pooled ADD images of the new `fx_floodpool_a` frame (the FL1 card's flat 4 m disc) at depth 4.32, ≤ `maxFloodLights`, nearest the camera centre, in view + 2 m, lamps within `floodLightMergeM` share a pool (`floodlightLook.ts › pickDrawnLights`, pure, no allocation), alpha `NightLight.floodA` (0.22 → 0.40 by stage). No re-bake, no render texture. `MedStationView`: one Graphics ring at exactly the heal radius (`medRing.ts`) in the MS10 card's style (2 px line on the edge, a 6 px soft band inside it, a faint wash), redrawn on list or zoom change only. Heal cue (D6): `HealCue` + `PlayerView.healCue` — green "+" for 450 ms when the player's HP from state rose while their body touches a mirror station's ring.
- **Stress switch:** `?stress=150&stressbuild=lights` lays 8 floodlights + 4 med stations round the survivor (invulnerable, so the benchmark keeps all 12).
- **Tests added:** `buildings/medStation.test.ts` (12: rate/cap liveness 50 → 100 in 200 ticks, strict edge, downed/out + countdown untouched + revive, phases incl. results and wipe, no stacking ×2/×3, no pulse (step in/out), aura through a barricade and a car, 4 players, fire + heal = −5/s on a real stage-3 car fire, maxHp 125 cap, zombies/buildings never healed); `decay/lightState.test.ts` (6); `balance.test.ts` (+1); `shop.test.ts` (+1, list updated); `buildings.test.ts` (+1, type ids/defaults updated); `RunRoom.buildings.test.ts` (+2: crafted floodlight → `not_for_sale`, wallet unchanged; `DEV_SHOP_ALL=1` places it and it becomes a server light); `NetSimHost.lights.test.ts` (3: place/destroy/fires lit/out, slept tab across a build start, late join); `downtown.fuzz.test.ts` (floodlights and med stations in the random layouts, a station beside p0 at the stage-3 build start; every tick checks the light list = burning fires + standing floodlights and every heal = exactly 0.25 HP; 48 layouts: 52 floodlights + 85 med stations standing at the end, 10,707 heal ticks in 32 layouts, 74,882 light-list checks); `medStationBandwidth.test.ts`; `tickCostDowntown.test.ts` (+1); client `floodlightLook.test.ts` (6), `medRing.test.ts` (3, incl. heal cue), `city/propArt.test.ts` (7: inside the footprint, FL1 glass on the front, MS10's LED cross where the game's glow sits, frames, shadows), `urlOptions.test.ts` (+1), `stressScenario.test.ts` (+1); `zombieAi.test.ts` debug snapshot updated (`shopAll`).
- **Mutation per new test (each run once, then reverted): all killed.** heal `<` → `<=` (edge test); no status check (downed test); heal ×2 (9 tests, and the fuzz); phase check removed (phases); wipe check removed (phases); stations summed (no-stacking test — the plain `best +=` alone is masked by the highest-rate shortcut, an equivalent mutant; with the shortcut removed too it fails); light list always rebuilds (no-rebuild test); fires not added (fire test); fires key ignored (all 3 mirror tests); every 2nd floodlight dropped (fuzz); `not_for_sale` removed (buildings + RunRoom tests); `inShop` ignored by the shop (shop tests); light/heal not counted as behaviour blocks (balance test); merge removed / cull removed (`pickDrawnLights` tests); ring radius + body radius (`medRing`); heal cue without the ring check (cue test); glass strip moved to the back (prop art); MS10 LED cross moved off the panel (prop art); floodlight box shadow back (prop art); stress buildings not invulnerable (stress test); `?shopall` ignored (URL test); `updateMedStations` removed (bandwidth liveness, tick-cost liveness); `DEV_SHOP_ALL` ignored (RunRoom test).
- **Beat the rule (builder's own attempts):** B1 triangle of 3 → 0.25/tick (test); B2 downed in ring → 0 HP, countdown unchanged (test + online); B3 revive in ring → heals from the next tick (test); B4 step in/out each tick → exactly 0.25 per tick inside (test); B5 behind a barricade / through a car → heals (test); B6 car fire + station → −5/s (test); B7 lobby / results / wipe → none (test); B8 maxHp 125 → caps at 125; above a lowered cap never raised (test); B9 crafted floodlight → `not_for_sale`, wallet unchanged (RunRoom test); B10 `?shopall` without the server switch → shows, server refuses (by construction: the server's World flag is false; refusal path tested in B9); B11 spawn clearance / fire / stage solid: the shared placement and 4.5/4.8 rules apply unchanged (not separately re-tested); B12 400 for a 1 × 1 block: by price; B13 24 stacked floodlights → 1 pool (merge test); B14 late join / slept tab / lag → lists equal (mirror tests + online run); B15 zombies/buildings never healed (test).

### File List

- `packages/shared/src/config/balanceSchema.ts`, `config/balance.ts`, `config/balance/buildings.json`, `config/balance/controls.json`, `config/balance.test.ts`
- `packages/shared/src/buildings/buildings.ts`, `buildings/buildingSystem.ts`, `buildings/medStation.ts` (new), `buildings/medStation.test.ts` (new), `buildings/buildings.test.ts`
- `packages/shared/src/decay/lightState.ts` (new), `decay/lightState.test.ts` (new), `decay/applyDecayStage.ts`
- `packages/shared/src/core/world.ts`, `core/worldSnapshot.ts`, `economy/shop.ts`, `economy/shop.test.ts`, `index.ts`, `zombies/downtown.fuzz.test.ts`, `zombies/zombieAi.test.ts`
- `apps/server/src/rooms/RunRoom.ts`, `rooms/RunRoom.buildings.test.ts`, `run/RunController.ts`, `run/medStationBandwidth.test.ts` (new), `run/tickCostDowntown.test.ts`
- `apps/client/src/render/FloodlightView.ts` (new), `render/MedStationView.ts` (new), `render/floodlightLook.ts` (new) + test, `render/medRing.ts` (new) + test, `render/healCue.ts` (new), `render/city/propArt.ts` (new) + test, `render/city/buildingsAtlas.ts`, `render/city/spriteAtlas.ts`, `render/city/palette.ts`, `render/city/recordCanvas.ts`, `render/mineLook.ts`, `render/PlayerView.ts`
- `apps/client/src/scenes/GameScene.ts`, `scenes/placement.ts`, `net/session.ts`, `net/mirrorBuildings.ts`, `sim/NetSimHost.lights.test.ts` (new), `debug/urlOptions.ts` + test, `debug/stressScenario.ts` + test
- `docs/art/5-10/` (README + 5 screenshots), `docs/epic-5-decisions.md` and `docs/art/epic-5/round-d/looks.html` (from the work branch, unchanged), `docs/playtests/milestone-1/readability-sheet.md`, `readability-key.md`, `objects/38_floodlight.png`, `objects/39_med_station.png`
- `_bmad-output/implementation-artifacts/5-10-floodlight-and-med-station.md`, `sprint-status.yaml`

### Decisions taken by the builder (plain English)

1. **Art:** the floodlight is the designer's FL1 tripod (FL5 drawn too, unused). The med station is the designer's MS10 case stack (it was a temporary crate until the pick arrived mid-build); its green LED panel gets a small extra glow in game, as the main session suggested.
2. **Light pool performance:** 8 overlapping light pools cost about a third of the headless frame rate. I applied the story's fallback (at most 4 pools on screen) and added one thing: lamps standing inside an already-drawn pool share it (so stacking many lamps in one spot never costs more). Result: about −20 % headless instead of −35 %. Still above the 10 % target: see open questions.
3. **Pool look:** instead of the generic glow sprite I added a pool sprite with the FL1 card's flat 4 m disc, so the lit area actually reads as 4 m (the generic glow faded out by ~2 m). Same cost.
4. **Shadows:** the tripod keeps its own soft leg shadow and the game casts none for it (a box shadow under a tripod looked like a wall); the med station casts a low crate's shadow.
5. **`inShop` is separate from 5.9's `forSale`:** `forSale: false` = upgrade-only, never placeable; `inShop: false` = placeable but hidden until 6.3 (dev switch unlocks it).
6. **Both light radii are in balance** (`light.radiusM` 4, `light.blackoutRadiusM` 6) per the Epic 6 note; the light list carries both, so 6.3 only switches.

### Not verified

- Phone FPS (headless SwiftShader only; no device here). The −20 % is a CPU-rasterizer number; a phone GPU may lose less, but the 4.10 phone floor was not re-measured.
- B11's spawn/fire/stage-solid cases were not re-tested for the new types (they use the unchanged shared placement and decay rules).
- An Android app switch (texture loss) with the new atlas frames (they go through `addGeneratedTexture` like every other frame).

### Open questions for the designer

1. **Floodlight pools vs phone FPS — ACCEPTED AS IS (designer via the main session, 2026-11-23):** 4 pools + sharing stays; the floodlight stays out of the shop until 6.3, which re-measures on phones. Original question: with 8 lamps on screen the pools still cost ~20 % headless (target 10 %). Options: (a) keep 4 pools + merging (now); (b) 2 pools on screen (≈ −10 % headless, lamps beyond the nearest two look unlit); (c) smaller pools; (d) leave it until 6.3, which redoes the lighting for the blackout anyway (darkness layer with cut-outs). The cap and the merge distance are balance values (`controls.json › fx`), so any of these is a one-line change.

## Notes for the merge (builder)

- `buildings.json`: `floodlight`, `med_station` appended after 5.9's types (type ids: … `mine`, `floodlight`, `med_station`). 5.11 / 5.14 append after these.
- `balanceSchema.ts › buildingTypeSchema`: new `inShop`, `light`, `heal`; `balance.ts › buildingKind` and the exclusivity count include them. `controls.fx` gains three keys (schema defaults match the JSON).
- `buildings.ts`: `PlaceError` + `"not_for_sale"` (handled in `placement.ts › placeRefusalText` and `session.ts › PLACE_ERRORS`; 5.16's build bar should show the same text).
- `buildingSystem.ts`: `updatePathing → updateTurrets → updateTraps → updateMines → updateMedStations → updateLightState`.
- `world.ts`: `lights` (derived). (No `debug.shopAll` any more: the shop-all switch is the dev balance, see the 5.11 merge note.)
- `shop.ts`: `shopBuildings` skips `inShop: false` (the dev balance sets every `inShop` true). `devBalance.ts`: `shopAll` also unhides building types.
- `applyDecayStage.ts` and `mirrorBuildings.ts` call `updateLightState` at their end.
- `palette.ts`: `NightLight.floodA` on every row. `spriteAtlas.ts`: new FX frame `fx_floodpool_a`. `buildingsAtlas.ts`: three new frames. `recordCanvas.ts`: `bezierCurveTo`.
- `mineLook.ts › buildingShadowHeightM`: light → 0, heal → 0.9 m.
- `RunRoom.ts`: `devShopAll = pickDevShopAll(process.env).shopAll` feeds `loadDevBalance` (one switch with 5.11).
- `PlayerView.ts`: `healCue(on)` + a small Graphics per player. `GameScene.ts`: two views, the heal cue in `syncPlayerView`, `?shopall` for solo and the shop list, `?stressbuild=lights`.
- `docs/epic-5-decisions.md` and `docs/art/epic-5/round-d/looks.html` were checked out from the work branch tip `d526464` (MS10 pick) unchanged, so they merge cleanly.

## Senior Developer Review (AI)

Fresh-agent review by the main session (2026-11-23): **no high, 2 medium (both only after merging master), 5 low, 1 nit.** First, `origin/master` (`4258175`: 5.15 carry, 5.16 build bar, PR #5 grenade lob-over / camera / downed alert; barricades stop bullets) merged into `story-5-10`; conflicts: `GameScene.ts` shop `open` line (took master's: buildings now come from the build bar), `buildings.test.ts` (both `stopsBullets` and `inShop`), `balance.ts` cross-check (both the five-block exclusivity and master's `stopsBullets` checks). The floodlight and med station default `stopsBullets: false` (bullets pass, AC 1/10).

| # | Finding | Fix |
| --- | --- | --- |
| M1 | master's `buildBar.test.ts` pinned the old building list | `med_station` added (`["med_station","Med station",400,false,1,1]`, before `bear_trap` in the extra-types case); the "today's four types" test renamed. |
| M2 | after the merge `?shopall` / `DEV_SHOP_ALL` could not show the floodlight anywhere (the build bar dropped `inShop: false` unconditionally) | `buildBarItems(balance, shopAll = false)` lists through `shopBuildings(balance, shopAll)` with a second cache; the extra filter is gone; `GameScene.updateBuildBar` passes `urlOptions().shopAll`. Test: with the switch the floodlight is a tile between mine and med station, cached per flag; without it, not. Browser: `?shopall=1` build bar = wood, turret, spikes, mine, floodlight, med station. |
| L1 | heal cap untested | `medStation.test.ts`: maxHp − 0.1 → exactly maxHp after one tick, for 100 and an armored 125; mutation "no cap" fails it. |
| L2 | `updateLightState` calls in `mirrorBuildings` / `applyDecayStage` untested (the test read through `lightsOf`, which refreshes) | `NetSimHost.lights.test.ts` now reads `host.world.lights.list` directly after the state is applied; removing either call fails it (mutations run). `lightState.ts` notes that 6.3 must read through `lightsOf` (the server's list lags one tick after a combat-tick destroy). |
| L3 | client `?shopall` not gated to dev builds; server production guard untested | `parseUrlOptions(search, dev = import.meta.env.DEV)` ignores `?shopall` in a release build (tested with `dev = false`); the server reads the switch through a pure `pickDevShopAll(env)` (`run/devShopAll.ts`, production → ignored + `dev_shop_all_ignored` log; tested). |
| L4 | `floodLightMergeM` schema default 2 vs `controls.json` 4 | default 4. |
| L5 | no test that placing a floodlight / med station leaves the city bake alone | `floodlightLook.test.ts`: CityView's bake key (`staticKey(stage, obstacles.version, fires)`) unchanged through placing both, 20 ticks of healing and a destroy. Browser: `CityView.bakeCount` 1 → 1 after placing both → 1 after removing the floodlight. |
| nit | `inHealReach` at exactly d = r + r_body | exact-in-binary case (0.5 m body, 2.5 m) is outside; 2⁻²⁰ inside is in. |

Floodlight FPS (≈ −20 % headless): accepted as is by the designer (see open question 1).

**Merge of Story 5.11 (master `71b73fd`) — ONE shop-all switch.** 5.11 had added a minimal `?shopall` / `DEV_SHOP_ALL` that builds a dev balance with every gear `inShop` true (changes `balance.version`). The two switches are now one, on 5.11's mechanism: `loadDevBalance({ shopAll: true })` sets `inShop: true` on gear AND building types, so the floodlight and the tactical flashlight unhide together. Removed this story's parallel path: `world.debug.shopAll`, `RunController({ shopAll })`, the per-run room pick, and the `shopAll` parameters of `shopBuildings` / `buildBarItems` (they read `inShop` from the balance, so M2 now holds by construction: the dev balance lists the floodlight in the build bar). Guards kept: client `parseUrlOptions(…, dev = import.meta.env.DEV)` ignores `?shopall` in a release build; the server computes the switch with the tested `pickDevShopAll(env)` (production → ignored, logged by `dev_balance_override_ignored`). Deviation from AC 3's "outside balance": the version now changes, so a client with `?shopall` against a server without `DEV_SHOP_ALL` is refused at join (visible) instead of per placement (B10). Heal-cap tests now use real body armor I (`buyGear` → maxHp 125). PR #6's `stopsBullets`: the floodlight and med station stay `false` (obstacles, not cover).

**Gate on the merged tree** (master `71b73fd` + this story + fixes): green, **262 files passed (1 skipped), 2,171 tests passed (3 skipped)**, build OK; load 0.96 before, 4.10 after.


**Gate after the merge + fixes** (`typecheck && lint && test && build` on `story-5-10` = master `4258175` + this story): green, **260 files passed (1 skipped), 2,129 tests passed (3 skipped)**, build OK; load 0.16 before, 4.48 after. Story 5.11 not merged yet at that point (see below).

## Change from the Epic 6 design session (designer, 2026-11-23)

Decision D5 (`docs/ideas/epic-6/proposal.md`): the floodlight's light radius is **6 m during blackout waves** (Epic 6, Story 6.3), 4 m otherwise. Put both radii in balance JSON (e.g. `floodlight.lightRadiusM` 4 and `floodlight.blackoutLightRadiusM` 6) so 6.3 only switches between them.
