---
title: 'Fix: Bloaters wedged in car corners'
type: 'bugfix'
created: '2026-11-25'
status: 'in-review'
context: []
baseline_commit: '388b584'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On Downtown, a body whose centre starts inside the junction of two touching solids (the L where the horizontal car `curb_car_west_n_in_road` meets the end of the vertical car `curb_car_west_s_in_road`, at decay stage 2 and later) stays inside the car forever. `pushOutOfBuildings` bounces it between the two boxes' nearest-face pushes, gives up (PUSH_STUCK) and returns `from`, which is that same spot inside the solid. The dev spawn cheats (`spawnRing`, `spawnInView`) place bodies with no solid check, so ~200 Bloaters round the player put 60–75 centres inside solids and 1–2 of them freeze in the car (designer report 2026-11-25).

**Approach:** When the push-out cannot settle and `from` itself overlaps a solid by more than float noise, move the body to the nearest clear spot round `from`. Use a fixed ring search: same obstacle set, map edge, deterministic order, no allocation. When `from` is legal (every normal-play case), nothing changes, so the result is bit-identical.

## Boundaries & Constraints

**Always:** Determinism: same seed + inputs give the same `worldDigest`. No per-tick allocation. Only + − × ÷, sqrt, min and max (shared by the client prediction).

**Ask First:** Any change to normal-play behaviour (a legal `from`).

**Never:** Shrink, skip or loosen any test. Escape from a merely float-noise overlap (a slot-stuck body must never jump through a wall). Use bmad-build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Centre in a two-solid junction | from = x inside H near V | moved to the nearest clear spot, PUSH_MOVED | none found within the search: PUSH_STUCK at `from` (as before) |
| Legal `from`, slot narrower than the body | from clear | PUSH_STUCK at `from` (unchanged) | n/a |
| Float-noise overlap at `from` (≤ 1 mm) | Float32 rounding against a face | unchanged (no escape) | n/a |

</frozen-after-approval>

## Code Map

- `packages/shared/src/buildings/collision.ts` -- `pushOutOfBuildings` / `settle`; used by zombies (pass 4), players, the Behemoth, and decay relocation.
- `packages/shared/src/zombies/zombieAi.ts:476` -- pass-4 push-out with `from` = start of tick.
- `packages/shared/src/zombies/spawnRing.ts`, `apps/client/src/debug/stressScenario.ts` -- dev spawns with no solid check (the trigger).
- `packages/shared/src/zombies/wideBody.fuzz.test.ts` -- the wide-body fuzz to extend.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/buildings/collision.ts` -- escape ring search when stuck and `from` is inside a solid by > 1 mm, plus a diagnostic counter `pushEscapes` (not snapshotted).
- [x] `packages/shared/src/zombies/carCorner.test.ts` + `crowdCorner.testkit.ts` -- the pinned repro (failing before the fix).
- [x] `packages/shared/src/zombies/wideBody.fuzz.test.ts` -- concave corners of two solids (barricade L/T pairs and the Downtown car L) × crowds of 40–120 wide bodies, dev-spawned centres inside the junctions included.

**Acceptance Criteria:**
- Given 200 dev-spawned Bloaters round a player in the car corner, when the World runs, then from the end of tick 1 no body overlaps a solid, none stands still for more than 4 s while not attacking, and all reach the player within 90 s.
- Given the headless bot runs, when compared before and after the fix, then the `worldDigest` values are identical and the escape fired 0 times.

## Design Notes

Checkpoint 1 approval: the intent and constraints come from the parent session's brief (bug report 2026-11-25); no human checkpoint is available in this autonomous run.

## Verification

**Commands:**
- `npm run gate:fast` -- expected: green
- `npx vitest run packages/shared/src/zombies packages/shared/src/decay --project slow` -- expected: green
