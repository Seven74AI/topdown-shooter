---
title: 'Fix: escape path respects openings narrower than the body'
type: 'bugfix'
created: '2026-11-25'
status: 'in-review'
context: []
baseline_commit: '1204233'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The PR #12 escape (`pushOutOfBuildings › escapeInside`) checked only its centre's straight line out. That had three consequences (round-2 re-review M1, medium, dev-only today):
- a body wedged outside a sealed fort's 0.5 m murder hole could escape through it, into the fort;
- a body dropped into the hole took the nearer mouth, even when that was the inner one;
- the slab test ignores touching boxes, so a centre could slide along the seam between two of them.

Also from the re-review:
- **L1:** the crowd testkit let any held body be vouched for its whole run.
- **N1:** the dead-end cache kept a strong reference to a disposed World.
- **N2:** `MAX_NEAR_BOXES` silently dropped boxes.

**Approach:**
- A path keeps, at every step, the clearance the body had at `from` (r minus its overlap there).
- Boxes are grown by 1e-9 on the centre line, so a seam is a wall.
- Spots whose free area reaches open ground win over spots in a sealed pocket (a fine-grid flood fill, built only during an escape).
- The near-box arrays grow instead of dropping boxes; the dead-end cache holds its World in a WeakRef.
- The testkit reports bodies alive at the bound that never moved and never reached a player.

## Boundaries & Constraints

**Always:** Normal play stays bit-identical (the escape never runs on a legal `from`). Deterministic; allocation-free per tick (the arrays only grow on a new maximum).

**Never:** Shrink or skip a test; touch anything outside the escape and the testkit.

</frozen-after-approval>

## Tasks & Acceptance

- [x] `packages/shared/src/buildings/collision.ts`: `escapeClearPath` with grown boxes and a stepped clearance check (`PATH_STEP_M` 0.025 m); the open-area preference (`buildFlood`, 80 × 80 cells of 0.1 m, used only during an escape); growable near-box arrays; a WeakRef World in the dead-end cache.
- [x] `packages/shared/src/buildings/collision.test.ts`: probes (a) wedged outside the hole, (b) dropped into the hole (81 start spots), (c) next to a seam, (d) a centre in a box whose only near way out is a seam, (e) barely overlapping next to a 0.5 m gap with open ground on both sides, and N2 (96 posts ahead of the cars in map order).
- [x] `packages/shared/src/zombies/crowdCorner.testkit.ts`: `neverMoved`, asserted empty in `carCorner.test.ts` (both crowd tests) and in the corner fuzz.

Each new test fails without its part of the fix: (a) and (b) without the open-area preference; (c) on the old code; (d) without the seam growth; (e) without the clearance check; N2 without the growth.

## Design Notes

- Case (b) has no answer by distance (both mouths can be equally near), so the open-area preference decides it. The flood area is ±4 m round the start, so a pocket larger than that counts as open.
- Only if no open spot exists within reach is an enclosed one taken.
- With the clearance rule a barely-overlapping body can stay stuck (a dead end, cached) where it used to squeeze through a narrower gap. That is the intended trade.

## Verification

- `npm run gate:fast`
- The slow files using the push-out: `wideBody.fuzz`, `downtown.fuzz`, `bloater.fuzz`, `brute.fuzz`, `ruins.fuzz`, `tenWaveSim` (asserts 0 escapes in real runs).
