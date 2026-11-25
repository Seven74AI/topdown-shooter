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

- [x] `packages/shared/src/buildings/collision.ts`: `escapeClearPath` with grown boxes and a stepped clearance check (`PATH_STEP_M` 0.025 m); the open-area preference (`buildFlood`, 102 × 102 cells of 0.25 m over the whole escape reach since review M-A, used only during an escape); growable near-box arrays; a WeakRef World in the dead-end cache.
- [x] `packages/shared/src/buildings/collision.test.ts`: probes (a) wedged outside the hole, (b) dropped into the hole (81 start spots), (c) next to a seam, (d) a centre in a box whose only near way out is a seam, (e) barely overlapping next to a 0.5 m gap with open ground on both sides, and N2 (96 posts ahead of the cars in map order).
- [x] `packages/shared/src/zombies/crowdCorner.testkit.ts`: `neverMoved`, asserted empty in `carCorner.test.ts` (both crowd tests) and in the corner fuzz.

Each new test fails without its part of the fix: (a) and (b) without the open-area preference; (c) on the old code; (d) without the seam growth; (e) without the clearance check; N2 without the growth.

## Spec Change Log

- Review round 1 (parent, 814e7ed: changes requested, 2 M / 2 L, all on the dev-spawn path):
  - **M-A, deep forts counted as open.** The flood window was ±4 m round the start, so a fort deeper than about 3.5 m touched its edge. It now covers the whole escape reach (±12.5 m, 0.25 m cells, 102 × 102). New test: forts 6 and 10 m deep, with the outer 0.3 m gap and with a car against the wall over the hole. Nobody ends inside; it fails with the old window.
  - **M-B, clearance stricter than the body needs.** A Downtown stage-4 Brute wedged between `parking_wall` and `parked_car_1` went 6.75 m north instead of PR #12's 0.55 m. The clearance now has 2 cm of slack (`CLEARANCE_SLACK_M`). Pinned: it lands within 1 m of #12's spot, and the test fails with no slack.
  - **L-C, a centre on a box face was a dead end.** The "start is inside this box" test used the ungrown box while the path test grew it. Both use the grown box now. Pinned with the reviewer's two boxes and a Brute at (4.3, 15).
  - **L-D, bodies frozen for good (round 1's "intended trade").** The escape now tries three passes: (1) clearance and open; (2) open, with clearance dropped (a squeeze as the last resort into open ground); (3) clearance, enclosed allowed.
    - Test (e) is now "never frozen": real Walkers with the player in each of four places, all move more than 0.25 m within 20 ticks and end clear. It fails without pass 2.
    - New test (e′) keeps the clearance rule pinned: a 0.68 m slot whose far exit keeps the body's clearance beats a nearer 0.5 m gap. It fails with clearance off.
  - **Nit:** PR #12's golden digest is unchanged (its escapes don't change), so there was nothing to re-pin.

- Re-review round 1 (parent, 993b1a1: changes requested, 2 M / 1 L / 1 nit, dev-only paths):
  - **M1-new, the square window's corners leaked.** Near boxes were filtered by the reach circle, but the flood window is a square, so boxes entirely in its corners were missing and their cells read as free. A big fort's corner then made it "open". The filter is now the window square grown by the body (Chebyshev); it contains the reach circle, so one list serves the candidates, paths and flood. Test: a segmented fort of 2 m barricade pieces, 10 × 11 m inside, both the 0.3 m outer-gap and car-over-hole variants. Nobody ends inside; it fails with the circle filter.
  - **M2-new, the L-D squeeze pushed a player out of their own fort.** The start's side is now decided by its nearest free flood cell (the flood is built at every escape). Pass orders:
    - open start: (0) clearance open → (1) squeeze open → (2) clearance any → (3) squeeze any;
    - enclosed start: (0) → (2) → (3). It stays in its own pocket, squeezing within it if it must.
    - Pass 3 is new: a body is never frozen while a centre-clear way out exists. Mid-crate in the reviewer's fort, every way out is a squeeze, and it moves to the crate's nearest end, inside.
    - Test: the reviewer's fort and crate, a player wedged at (19.875, 12.3), 13 and 13.7. It always stays inside, under 1 m from the starts at the crate's ends (12.3, 13.7) and under 1.6 m mid-crate (13). It fails with the open order for every start.
  - **L1:** `buildFlood` documents its cost (~1.4–3.9 ms per escape) and says to cache it per (World, versions, r) if the escape ever runs in real play.
  - **N1:** `buildFlood` documents the resolution condition 2 · minR + minWallDepth > 1.5 · √2 · FLOOD_CELL_M (1.2 m > 0.53 m today).

## Design Notes

- Case (b) has no answer by distance (both mouths can be equally near), so the open-area preference decides it. The flood area covers the escape's whole reach (±12.5 m, since review M-A), so only a pocket deeper than that counts as open.
- Only if no open spot exists within reach is an enclosed one taken.
- Round 1's trade (a barely-overlapping body stays stuck rather than squeeze) was withdrawn in review (L-D). The squeeze into open ground is now the last resort before an enclosed spot.

## Verification

- `npm run gate:fast`
- The slow files using the push-out: `wideBody.fuzz`, `downtown.fuzz`, `bloater.fuzz`, `brute.fuzz`, `ruins.fuzz`, `tenWaveSim` (asserts 0 escapes in real runs).
