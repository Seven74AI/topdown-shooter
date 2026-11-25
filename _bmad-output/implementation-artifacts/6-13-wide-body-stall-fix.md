# Story 6.13: Wide-body stall fix (6.8 review M1)

Status: review

## Story

As a team camping in a barricade box,
I want the last Brute or Bloater of a wave to come and get us (or break in),
so that a wave never hangs on "1 remaining" while the zombie stands still in front of us.

Source: `6-8-special-events-car-alarm-and-stampede.md` › Senior Developer Review (AI) › **M1** (medium, pre-existing, masked by the bot strafe flip in `bots/botPolicy.ts` rule 2c, which stays as it is).

Brief: `docs/epic-6-brief.md` lines 1–32 apply, especially 7 (spatial fuzz), 8 (determinism), 9 (liveness) and 10 (ticks, no per-tick allocation, numbers in balance JSON).

## Fairness rule (brief line 3)

**A zombie never stands still in sight of a reachable player for more than N = 4 s** (it stands still when it moves less than 0.25 m from where it was). The only exception is while it is attacking: touching a player, winding up, swelling, or hitting a building. A wide body (Brute, Bloater) shut out of a barricade box by a gap too narrow for it goes for the box's barricade within `wideStuckS` (2 s) and attacks it. A Bloater swells on it, and its 2.5 m blast reaches the campers.

## Acceptance criteria

1. **Net.** A wide body becomes stuck when all of these hold: its line to the nearest standing player is blocked, its wide field gives it no next cell (it stands on the field's end, i.e. a seed cell at the mouth of a slot it can't enter, or in a grown wall cell whose nearest reached cell is that end), and it has moved less than `pathing.wideStuckProgressM` (0.25 m) for `pathing.wideStuckS` (2 s = 40 ticks). A stuck body targets the solid building within `pathing.wideStuckReachM` (2.5 m) of it that is nearest its player (ties: lower id). It steers at the nearest point of that building's box and attacks it on contact (a Brute hits ×3; a Bloater swells there).
2. **Exit.** The stuck state ends when its building is gone (broken or sold), when its line to a player clears, when it has no target, or when its pool slot is reused. Then the field takes over again.
3. **No crowd false positives.** A body on an ordinary field cell (the field gives a next cell), which includes one held back by a crowd, never counts towards the net. This keeps the 3.5/5.7 re-review rule that crowds must not smash walls they could walk around.
4. **Bit-identical when nothing is stuck.** Steering, positions and every other piece of World state are unchanged unless the net fires. Proof: 16 headless runs (seeds 1–3 × 1/4 bots × god/mortal on the real balance, plus seeds 1–4 × 4 god bots with the strafe flip off). Their `snapshotWorld` digest, minus the pathing `progressHash` (the record the net writes) and `balanceVersion` (a hash of the parsed balance, which the 3 new keys change), is the same before and after the change.
5. **No per-tick allocation.** The record lives in the existing `pathing.progress` typed arrays (plus one `Int32Array stuckBuilding`) and is included in the snapshot hash (brief 8).
6. **Numbers in JSON.** The three numbers are in `zombies.json › pathing` (2 s, 0.25 m, 2.5 m), schema-validated (`wideStuckS` must be whole ticks).
7. **Regression test.** The three layouts the fuzz found stalling (two Bloaters and one Brute) are pinned with fixed coordinates. Each must attack the box's barricade within 45 s, never stand still for more than 4 s, and the net must fire exactly once (liveness).
8. **Fuzz (brief 7).** Brutes and Bloaters (CHASE and RUSH) go round 240 random Downtown barricade boxes: stages 1/4/5, random variants, every wall shifted by half a cell along and/or out (giving 0.5 m diagonal gaps), a third with an open side, 1–3 god-mode campers. Every trial must reach a player or attack a building within 45 s, never stand still for more than 4 s, and never end up inside a box. Liveness: both outcomes, both types, both states, closed boxes and the net firing are all seen.

## Beat the rule (for the reviewer)

- Camp in a box whose mouth is exactly one body wide against map cover (the 1 m rubble mouth). Expected: the body goes for the barricade.
- Box in with **only map cover** (no barricade within 2.5 m of the mouth). Expected: nothing to break, so the net doesn't fire. Not reachable by a barricade camp, but worth a try: can players build such a pocket with barricades more than 2.5 m from the mouth?
- Crowds: does a Brute in a Walker crowd ever fire the net? (It needs the field's end, not just slow progress.)
- Sell the stuck target mid-approach. Expected: the record clears and it re-paths.

## Tasks

- [x] Reproduce M1 (it could not be reproduced as written: see Dev Agent Record). Found the same stall with the new fuzz.
- [x] Root cause: the field's end at a seed cell plus the straight-walk/grown-cell shuttle.
- [x] `zombieAi.ts`: `steerByField` reports `steer.fieldEnd` (wide grid only). New `wideStall` / `steerAtBuilding` / `wideStallClear`. Pass 1 calls them only in the wide branch of "line blocked → follow the field". `wideStallStats.fired` counts firings (tests and logs).
- [x] `flowField.ts`: `ZombieProgress.stuckBuilding`, included in the progress hash. Doc comments updated.
- [x] `balanceSchema.ts` + `zombies.json`: `wideStuckS`, `wideStuckProgressM`, `wideStuckReachM`.
- [x] Tests: `wideBodyStall.test.ts` (3 layouts, a detour that must not fire the net, the balance numbers), `wideBody.fuzz.test.ts`, `wideBody.testkit.ts` (shared trial runner).
- [x] Bit-identical digest proof (AC 4). Mutation checks.
- [x] Full gate on the branch merged with current origin/master.

## Dev Agent Record

### Reproduction

- The M1 run (seed 4, 4 god bots, flip reverted, wave 8, tick ≈ 9770) **does not reproduce** at any commit I tried, with the flip off (`strafeFlipSeqs` 10 000):
  - current master (`dfaefcb`): seeds 1–5, 4 bots, no stall;
  - the parent of the review commit (`9743f51`): 1–4 bots × seeds 1–8, 24 runs, no zombie still for ≥ 30 s;
  - the commit that introduced the flip (`3105c89`): 4 bots seed 4, 3 bots seeds 1/4, no stall.
  - The review's own layout (barricades [21.5–23.5, 20–20.5] and [19–21, 19.5–20], a RUSH Bloater at (21.13, 21.25), campers north of them) also reached the players in every isolated variant I tried. The reviewer probably reverted more than the flip, or ran on a local tree.
- The new fuzz found the **same mechanism** on unchanged code: 3 of 1,500 trials (128, 2084, 2485) stood still for the whole 45 s bound (705–799 ticks). Trial 2485 has the M1 shape: a 0.5 m diagonal gap between two barricade corners, with a RUSH Bloater outside.

### Root cause

The mouth of the box is narrower than a wide body (a 0.5 m diagonal gap, or a 1 m slot against rubble). The wide grid therefore can't reach the players' cells. `seedAround` seeds the wide field round them, so the mouth cell is a **seed cell: the field's end** (`flowNextCell` = −1). `steerByField` returns false and the body walks straight at the player. The push-out stops it against the cover, inside a grown wall cell, and `flowNearestReachedCell` steers it back to the seed cell. It shuttles in place forever (trace for trial 128: (38.47, 2.47) ↔ (38.51, 2.50) every 1–2 ticks). It touches map cover (rubble) or nothing, never a building, so the H1 net (which needs a wedged push-out against buildings) never fires. A Bloater only swells on touching a player or its target building, so it never swells. Brutes have the gap swing for slots, but at a diagonal gap the player is beyond the 1.8 m gap reach (trial 2084).

### What changed (behaviour)

- Only a wide body that is stuck at its wide field's end for 2 s, with its line blocked, changes behaviour: it attacks the nearest barricade (nearest to its player, within 2.5 m). Nothing else changes (AC 4).
- No hysteresis was added to wide-field steering. The shuttle is not a next-cell flip between two field cells; it is the field's end. Hysteresis would not end it, and it would change ordinary steering (not bit-identical).

### Tests and evidence

- `wideBodyStall.test.ts`: 5 tests pass. Mutant "net off" (`wideStall` returns false): all 3 layout tests fail, and so does the fuzz. Mutant "keep the target building but ignore the steer override" survived: in these layouts the straight walk plus the target building also ends at the barricade. The override is kept because it walks the body to the box instead of into the cover.
- `wideBody.fuzz.test.ts` (240 trials, about 10 s): passes and the net fires once (trial 128). At 1,500 trials (run by hand) it passes and the net fires exactly 3×, the same 3 trials that stall without the fix.
- Digest proof (AC 4): 16/16 runs give the same digest with `progressHash` and `balanceVersion` excluded. Both sides were computed by the same throwaway test, on the fixed tree and with the 4 source files stashed (on master `dfaefcb`, before 6.9 landed). The full digest also differs by those two fields: the new `stuckBuilding` array and the net's tick counter enter the progress hash, and the 3 new JSON keys change the balance hash. Same run lengths and waves cleared.
- Gate: see the hand-back below (filled in at the end).

### File list

- `packages/shared/src/zombies/zombieAi.ts`: `steer.fieldEnd`; `wideStall`, `steerAtBuilding`, `wideStallClear`, `wideStallStats`; pass 1 wide branch.
- `packages/shared/src/zombies/flowField.ts`: `ZombieProgress.stuckBuilding` (+ hash) and docs.
- `packages/shared/src/config/balanceSchema.ts`, `packages/shared/src/config/balance/zombies.json`: the 3 numbers.
- `packages/shared/src/zombies/wideBody.testkit.ts`, `wideBody.fuzz.test.ts`, `wideBodyStall.test.ts`: new tests.

### Notes for the merge

- `zombieAi.ts`: the diff touches pass 1 only inside `if (!steered && blocked) { … }` (the wide/normal choice is now an if/else) and adds one `wideStallClear` call after the target block. Story 6.9+6.10's ChaseTarget list (players, then the survivor) replaces `target`. `wideStall` takes the chase target as a `PlayerState` (it reads only `.x/.y`). If the target becomes a union, widen the parameter to `{ x: number; y: number }`. If a survivor is the target, the net still applies; the reach and tie rules are unchanged.
- `flowField.ts`: only the `ZombieProgress` interface, `createProgress` and `snapshotPathing.progressHash` changed. The survivor seed (6.9/6.10) doesn't touch them.
- `zombies.json › pathing`: 3 new keys at the end of the block.

### Not verified

- The exact M1 run (seed 4, tick ≈ 9770) could not be reproduced, so the fix is proven on the fuzz-found layouts with the same mechanism, not on that run.
- Not tried in a browser or a real room. The change is server/solo sim only (zombies run only there), with no wire, client or bandwidth change.
- A box shut only by map cover (no barricade within 2.5 m) is still a stall by design: there is nothing to break.
