---
title: 'Fix: Bloaters wedged in car corners'
type: 'bugfix'
created: '2026-11-25'
status: 'done'
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

## Spec Change Log

- Review round 1 (3 fresh reviewers: blind, edge case, acceptance). Patches only, no loopback:
  - A trial of a "centre inside a solid" guard (blind review #1) left bodies dropped into a gap narrower than themselves (car + `police_line_lot`, bus) stuck for good. Reverted to the overlap guard (> 1 mm at `from`). The edge-case probe found no wall crossing (14,337 bodies) and 0 escapes in 1.6M legal Float32 push-outs.
  - Tests: escape counters asserted in the unit tests; the slot test now pins "an illegal in-slot start leaves on its own side".
  - `tenWaveSim` pins "a real run makes 0 escapes" (auditor #4).
  - The progress check was near-vacuous (auditor #1). Added a non-bursting Walker + Brute crowd test (run > 4 s, every body's closest approach < 8 m, held share < 98 %), and the held share and closest approach in the fuzz.
  - The fuzz asserts its corners really touch, and the car masks are computed once.
  - `NetSimHost.decay.test.ts` fixture was inside `se_offices` (an illegal spot, kept there by the old push-out): mirrored to the dumpster's east side, same assertion.
  - Edge-case finding: co-op hit pushback (`hurt`, not swept) stacked in one tick can drive a centre into a junction (dumpster against `se_offices`). That is a normal-play path, pinned in `carCorner.test.ts`.

- Review round 2 (parent session, PR #12 at 7cad82a: changes requested). The intent was renegotiated by the parent: **FX-B1** (auto-accepted) changes normal play on purpose. Round 1's claims "every normal-play case has a legal `from`", "never jumps a wall" and "solo pushback can't" were disproved by the parent's probes; they are corrected below, and the code changed:
  - **B1 (blocking), the escape crossed walls.**
    - (a) FX-B1: `combat/damage.ts › hurt` now sweeps hit pushback like a knockback (`sweptMove`, shared with `applyKnockback`). No hit can shove a body into a solid any more, solo or co-op, which removes the only normal-play trigger. Headless digests change in 11 of 12 runs (seeds 1–3 × 1/4 bots × god/mortal vs master 2a88929; one is identical). Outcomes change too: seed 3 with 4 mortal bots wiped in wave 3 on master and now clears all 10 waves; seed 3 solo mortal clears 6 waves instead of 7. Two runs of the branch are identical (deterministic).
    - (b) `escapeClearPath`: an escape candidate is rejected if the centre's straight path to it crosses any box the start centre isn't already in.
    - (c) The slot test is parametrised over 100 start spots in the slot: every path stays clear of both walls, ends out of a mouth, and takes the nearer mouth where it is clearly nearer. New full-tick test: a sealed barricade fort with a 0.5 m murder hole, Walkers outside hit 1 m per tick for 200 ticks; none ends inside the fort or a wall.
  - **B2 (blocking), decay relocation drifted from master** (25 of 48 zombies moved at seed 1). The escape is now opt-in (`escapeInside`, default false). Only zombie pass 4, player movement and player knockback enable it. `relocationPinned.test.ts` pins the stage 3 → 4 relocation (seeds 1 and 5) to master's hashes.
  - **M3:** docs and comments corrected (this file, the case file, `collision.ts`).
  - **M4, tests:**
    - (a) The 200-Bloater test now runs with Bloater blasts harmless to zombies, so each Bloater must touch the player or swell on it itself (`notReached` = 0). It also caps the held share and checks the run lasts longer than the still bound.
    - (b) Held now means chained, through touching bodies, to a free one (moving, attacking or touching the player), so two wedged bodies can't vouch for each other. The longest held run is reported.
    - (c) The fuzz checks progress per body: a body alive at the bound must end within 8 m of its player, or at least 1 m nearer than it started.
    - (d) The determinism test pins a golden digest and asserts the escape ran.
    - (e) A comment says that `spawnZombie` in a rectangle stands in for `spawnInView`.
  - **L5:** the escape prefilters the boxes within reach once per search, and caches dead ends per World and obstacle and building versions.
  - **L6:** the direction count grows with the ring (16 to 256, at most one ring step apart along the ring), using rotation literals (only × and +).
  - **Nits:** rings use an integer index; `PUSH_ESCAPED` is a distinct result code; `pushEscapes` is documented as process-global.
  - Not done: a per-body cap on held ticks. A 120-body crowd round one player keeps a back row queued for all 30 s; every held tick is chained to a free body, and the longest held run is reported instead.

## Design Notes

Checkpoint 1 approval: the intent and constraints come from the parent session's brief (bug report 2026-11-25); no human checkpoint is available in this autonomous run.

## Verification

**Commands:**
- `npm run gate:fast` -- expected: green
- `npx vitest run packages/shared/src/zombies packages/shared/src/decay --project slow` -- expected: green
