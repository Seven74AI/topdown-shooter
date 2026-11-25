# Investigation: Bloaters wedged in car corners

## Hand-off Brief

A body whose **centre** is inside the junction of two touching thick solids (the Downtown L/T of `curb_car_west_n_in_road` + `curb_car_west_s_in_road`, decay stage 2+) never leaves. `pushOutOfBuildings` bounces it between the two boxes' nearest-face pushes, gives up (PUSH_STUCK) and returns `from`, the same spot inside the car, every tick. The dev spawn cheats put centres inside solids. In normal play, hit pushback stacked in one tick (it was not swept against solids) could do it; the parent's review probes showed this is not limited to co-op. Real spawns are guarded. The fix has two parts:
- FX-B1 sweeps hit pushback, which removes the normal-play trigger. It changes normal play: headless digests differ from master.
- The push-out gets an opt-in escape that never crosses another box, which recovers dev-spawned bodies. Decay relocation is unchanged.

## Case Info

- Reported: designer, 2026-11-25, dev build: ~200 Bloaters spawned round the player with the dev cheats; some stuck in the inside corner where a horizontal car meets the end of a vertical car, partly inside the horizontal car.
- Branch: `fix-bloater-car-corner` from origin/master `388b584`.
- Status: **Concluded** (confidence **High**: confirmed root cause, deterministic repro).

## Problem Statement

Is the body pushed into the solid (crowd vs. resolve, or two boxes' resolves fighting), spawned inside, or outside but unable to path out? Can normal play hit it?

## Evidence Inventory

| Evidence | Status |
| --- | --- |
| Designer screenshot (described in the report) | Partial (description only) |
| Code: `buildings/collision.ts`, `zombies/zombieAi.ts` pass 2–4, `zombies/spawnRing.ts`, `apps/client/src/debug/stressScenario.ts › spawnInView`, `combat/damage.ts › hurt` | Available |
| Story 6.13 file + wide-body fuzz/testkit | Available |
| Headless probes (below) | Available |

## Confirmed Findings

### Finding 1: the L exists on Downtown at stage 2+
In the decay variants that move both west curb cars into the road: `curb_car_west_n_in_road` [14, 14.5]–[18.5, 16.5] (horizontal) and `curb_car_west_s_in_road` [15.5, 16.5]–[17.5, 21] (vertical). The vertical car's end touches the horizontal car's long face (a T with two inside corners). Probe over all 135 gameplay masks × stages 1–5; also asserted in `packages/shared/src/zombies/carCorner.test.ts`.

### Finding 2: the dev spawns place centres inside solids
`spawnRing` (`packages/shared/src/zombies/spawnRing.ts:14`) and `spawnInView` (`apps/client/src/debug/stressScenario.ts:40`) call `spawnZombie` with no solid check. 200 Bloaters round a player at the corner: 60–75 centres start inside a solid.

### Finding 3: a centre in the junction is frozen by the push-out (root cause)
`pushOutOfBuildings` (`packages/shared/src/buildings/collision.ts:127`). For a centre inside the horizontal car near its bottom face, `pushBox`'s centre-inside branch picks the nearest face, i.e. the join. That lands the centre inside the vertical car, which sends it back. Four passes don't settle, the per-axis fallback doesn't either, and the result is PUSH_STUCK with `pushed` = `from`. `from` is the start of the tick (`zombieAi.ts:235`), the same spot inside the car, so it repeats forever. Measured on the unfixed tree: 270 of 1,800 start spots inside either car stay inside (r 0.5); 278/1,800 at r 0.35–0.4; 370/1,800 at r 0.6. In the 200-Bloater sim, 2 Bloaters (seed 1) and 1 (seed 2) stayed inside `curb_car_west_n_in_road` for all 1,800 ticks.

### Finding 4: crowd pressure does not push bodies into solids
The 200-Bloater ring runs (4 player spots × 3 seeds, 600 ticks): 0 bodies inside a solid at the end of any tick, apart from those spawned inside. Pass 4's push-out has the last word after the crowd passes. Hypothesis "crowd overpowers the solid resolve" refuted.

## Deduced Conclusions

### Deduction 1: needs a box thicker than the body
The bounce needs the first box's nearest face to be the join. A centre bounced back sits `r` from that face, so the box must be thicker than 2r. Barricades (0.5 m) can't trap a wide body; cars (2 m) can. Confirmed by a unit test that fails with the fix off (two 2 m boxes) and by the fuzz: its barricade L/T control trials need no escape.

### Deduction 2 (revised twice in review): normal play reached it through unswept hit pushback; FX-B1 removes that
Getting stuck needs a centre that is already inside a solid at the start of a tick. Every normal placement is guarded:
- wave spawns: `downtown.test.ts` checks that every spawn's jitter is clear of collision;
- stampede: `blockedAt`;
- crawler drops: `crawlerDropSpot`;
- decay relocation: `relocateZombie` falls back to `findBoxFreeSpot`;
- knockback: swept against boxes.

Hit pushback (`damage.ts › hurt`) was not swept against solids, and hits on one body in one tick add up. Round 1 claimed that solo play can't embed a centre (one player's pushback per tick is ≤ 0.25 m, below every radius). The parent's review probes disproved that, so the claim is withdrawn. For example, in co-op ~1 m in one tick (for example 4 machete hits from the north) drives a Walker's centre into `dumpster_alley_3`, which stands flush against `se_offices`. Its nearest face is the shared one, so the old push-out bounced it between the two boxes and kept it there (edge-case review, confirmed by the pinned test in `carCorner.test.ts`). At the car L the same needs > 1 m into the 2 m car. FX-B1 now sweeps the pushback like a knockback, so no hit can put a body into a solid; the dumpster case is pinned to stop at the face. A body shoved by a player keeps a clear `from`, so it leaves on that side. Evidence: 12 headless runs (seeds 1–3 × 1/4 bots × god/mortal) and 4 endless runs (vote "stay", 19–20 waves each), with **0 escapes**.

## Hypothesized Paths

1. Crowd separation from 200 neighbours overpowers the solid resolve. **Refuted** (Finding 4).
2. Two boxes' resolves fight at a concave corner from a legal spot. **Refuted** for a clear `from`: a centre-inside push uses the face `from` lies beyond, and that settles. **Confirmed** only for a `from` inside a solid (Finding 3).
3. Spawned inside or overlapping a car. **Confirmed** (Finding 2) as the trigger.
4. Outside the solids but unable to path out of the concave corner. **Refuted**: once the escape takes it out, every body reaches the player (all 200 gone in about 43 ticks).

## Missing Evidence

- The designer's actual screenshot and build. The dev-spawn path is deduced from "used the dev cheats to spawn", not seen.

## Source Code Trace

- Error origin: `packages/shared/src/buildings/collision.ts` › `pushOutOfBuildings`, the final `return bestD > 0 ? PUSH_MOVED : PUSH_STUCK` with `pushed` = `from`.
- Trigger: `zombieAi.ts:476` pass 4, `from` = `prevX/prevY` (start of tick).
- Condition: `from` inside the junction of two touching boxes thicker than the body.

## Conclusion

Root cause: the push-out falls back to `from` while assuming `from` is clear, and nothing enforces that. A dev-spawned centre in a thick two-box junction breaks the assumption and stays inside for good. Confidence: High.

## Recommended Next Steps

### Fix direction
Two mechanisms, both implemented (`spec-fix-bloater-car-corner.md`):
1. Remove the normal-play trigger: sweep hit pushback against solids (FX-B1). This changes normal play, so the digests change.
2. Recover a body already in a solid: when stuck, and `from` overlaps a solid by more than 1 mm, move the body to the nearest clear spot. This is opt-in for the per-tick body moves; the way out never crosses a box the start centre isn't in. Decay relocation doesn't opt in and stays bit-identical to master.

## Reproduction Plan

`npx vitest run packages/shared/src/zombies/carCorner.test.ts packages/shared/src/buildings/collision.test.ts` with the escape disabled: 2 + 2 tests fail. The fuzz (`wideBody.fuzz.test.ts`, concave corners) also fails: longest still 600 ticks, 0 escapes.

## Side Findings

- The dev spawn cheats place bodies inside solids (cars, buildings). With the fix they are pushed out on the first tick. The spawns were left as they are (dev-only).
- `damage.ts › hurt` pushback was not swept against solids (the trigger above): fixed as FX-B1 in review round 2.
- Round 1's unconditional escape changed decay relocation (25 of 48 zombies at seed 1). The escape is now opt-in, and the relocation is pinned to master.
- Crowds jam against car faces (bodies pressed into a wall by the crowd behind, the player on the far side) for more than 4 s. The same happens on master with legal spawns only, so this is crowd steering, outside this fix.
- An unfixed `NetSimHost.decay.test.ts` fixture placed the survivor inside `se_offices`.
