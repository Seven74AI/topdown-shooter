# Story 6.13: Wide-body stall fix (6.8 review M1)

Status: review (review fixes in, re-review pending)

## Story

As a team camping in a barricade box,
I want the last Brute or Bloater of a wave to come and get us (or break in),
so that a wave never hangs on "1 remaining" while the zombie stands still in front of us.

Source: `6-8-special-events-car-alarm-and-stampede.md` › Senior Developer Review (AI) › **M1** (medium, pre-existing, masked by the bot strafe flip in `bots/botPolicy.ts` rule 2c, which stays as it is).

Brief: `docs/epic-6-brief.md` lines 1–32 apply, especially 7 (spatial fuzz), 8 (determinism), 9 (liveness) and 10 (ticks, no per-tick allocation, numbers in balance JSON).

## Fairness rule (brief line 3)

**A zombie never stands still in sight of a reachable player for more than N = 4 s** (it stands still when it moves less than 0.25 m from where it was). The only exception is while it is attacking: touching a player, winding up, swelling, or hitting a building. A wide body (Brute, Bloater) shut out of a barricade box by a gap too narrow for it goes for the box's barricade within `wideStuckS` (2 s) and attacks it. A Bloater swells on it, and its 2.5 m blast reaches the campers.

## Acceptance criteria

1. **Net.** A wide body becomes stuck when all of these hold: its line to the nearest standing player is blocked, its wide field gives it no next cell (it stands on the field's end, i.e. a seed cell at the mouth of a slot it can't enter, or in a grown wall cell whose nearest reached cell is that end), and it has moved less than `pathing.wideStuckProgressM` (0.25 m) for `pathing.wideStuckS` (2 s = 40 ticks). A stuck body targets the solid building within `pathing.wideStuckReachM` (2.5 m) of it that is nearest **its body** (review H1; ties: nearest its target, then the lower id). If it neither touches that building nor gets any closer to it for `wideStuckS`, it gives it up, excludes it and picks again. It steers at the nearest point of that building's box and attacks it on contact (a Brute hits ×3; a Bloater swells there).
2. **Exit.** The stuck state ends when its building is gone (broken or sold), when its line to a player clears, when it has no target, or when its pool slot is reused. Since review L1 it also ends when the field has given it a way round for `wideStuckS`, or when its target moves more than `wideStuckReachM` from where it stood when the net fired. Then the field takes over again. With no building in reach (shut out by map cover only), the count starts over, so the building scan runs once per `wideStuckS` (review L3).
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

- `zombieAi.ts`: the diff touches pass 1 only inside `if (!steered && blocked) { … }` (the wide/normal choice is now an if/else) and adds one `wideStallClear` call after the target block. Merged with 6.9+6.10 (`62dd2ef`): the one conflict was the `steer` declaration next to the new `ChaseTarget` list. `wideStall` now takes a `ChaseTarget` (it reads only `.x/.y`), so a wide body shut out from the survivor gets the same net.
- `flowField.ts`: only the `ZombieProgress` interface, `createProgress` and `snapshotPathing.progressHash` changed. The survivor seed (6.9/6.10) doesn't touch them.
- `zombies.json › pathing`: 3 new keys at the end of the block.

### Not verified

- The exact M1 run (seed 4, tick ≈ 9770) could not be reproduced, so the fix is proven on the fuzz-found layouts with the same mechanism, not on that run.
- Not tried in a browser or a real room. The change is server/solo sim only (zombies run only there), with no wire, client or bandwidth change.
- A box shut only by map cover (no barricade within 2.5 m) is still a stall by design: there is nothing to break.

## Senior Developer Review (AI)

Reviewer: fresh agent (gds-code-review: Blind Hunter, Edge Case Hunter, Acceptance Auditor), 2026-11-25. Reviewed commit `ac2c2f2` (diff `62dd2ef...ac2c2f2`). No code changed: all probes and mutations were local and reverted.

**Outcome: Changes requested (1 high).** The net works on the three pinned layouts and is bit-identical when it doesn't fire. But its target choice can pick a building the body can never touch, and that brings the M1 stall back, permanently.

### Checks I ran myself

- `npm run typecheck`: clean. `wideBodyStall.test.ts` and `wideBody.fuzz.test.ts`: 6/6 pass.
- **AC 4 digest (reproduced).** 16 headless runs (`runHeadless`): seeds 1–3 × 1/4 bots × god/mortal, plus seeds 1–4 × 4 god bots with `strafeFlipSeqs` 10000. I hashed `snapshotWorld` without `progressHash` and `balanceVersion` at `ac2c2f2`, then again with the 4 source files checked out from `62dd2ef`. All 16 digests match, and the net fired 0 times in all 16 runs. So the claim holds, but these runs only prove the no-fire path.
- **Per-tick cost.** Total wall time for the 16 runs: 61.6 s with the change, 61.0 s without (+1 %, within noise). I did not run the PERF_ASSERT endless sim.
- **Fuzz at 1,500 trials (reproduced).** The net fires exactly 3× (trials 128, 2084, 2485), and every time on the barricade the body touches (0.5–0.6 m). With 2 random extra barricades 2.2–4.5 m from the box (1,500 trials): no failures, 1 firing.
- **Bloater at the barricade hurts the campers.** With god mode off, the burst in layouts 2485 and 128 takes campers from 100 to 70 HP, so the blast reaches them past the barricade (brief 5: barricades don't shield blasts).

### Findings

| # | Severity | Where | Scenario | Fix |
| --- | --- | --- | --- | --- |
| H1 | **high** | `zombies/zombieAi.ts:641-652` (target choice), `:615-617` (stuck keeps it) | The stuck target is "the solid building within 2.5 m **of the body** that is nearest **the player**", with no check that the body can reach it. A camp box usually holds a floodlight, med station or turret, and that building is nearer the player than the walls. Reproduced on layout 2084: I added a `floodlight` (or `med_station`) at (9, 9) inside the box. The net fires, picks it (`stuckBuilding` 3), and the Brute steers straight at it into the 0.5 m gap. The push-out holds it, and pass 4 needs contact (`distanceToBox ≤ rz + eps`), so it never attacks. It stood still for **783 ticks (39 s) of 900**, attacking nothing, which is the M1 stall again. It is permanent: the record only clears when that building is gone or the line clears. A building on the far side of map cover within 2.5 m fails the same way ("through a wall"). It also gives players an exploit: put any solid building in the middle of the box and the last Brute never comes. | Choose by distance **to the body** (ties: nearest the player, then id). Or keep only candidates the body can reach: a clear `segmentHitsBuildings` line, radius rz, to the box's nearest point, ignoring the candidate itself. Also add a give-up: if it hasn't touched its stuck building within `wideStuckS`, clear the record and exclude that building. I checked the first option locally: the 3 layout tests, the fuzz, and both floodlight/med_station probes pass. Pin the floodlight-in-box layout as a 4th regression test. |
| M1 | medium (test gap, AC 3) | `wideBodyStall.test.ts`; `zombieAi.ts:622-625` | AC 3's guard (a body only counts at the field's end) is not tested. Mutation C below, which removes the `fieldEnd` gate entirely, passes all 6 tests. The detour test never slows the Brute down, and the fuzz has one zombie and no crowd. A crowd probe I ran (30 Walkers + 3 Brutes + 1 Bloater against an 8 m wall with a 1 m gap, 6 seeds, 30 s) fired 0× with **and** without the gate. So AC 3 holds today, but nothing protects it. | Add a test where a wide body is held below 0.25 m / 2 s on an ordinary field cell (packed behind Walkers in a 1-body corridor, or slowed to 0 by `slowPct`), and assert the net doesn't fire and no building loses HP. It must fail with the gate removed. |
| L1 | low | `zombieAi.ts:615-617` | Once stuck, the record ignores `fieldEnd` and the target. If the campers leave (a player fits through the 1 m rubble mouth) or another wall falls and opens a path, the body keeps hammering its stuck building while the nearest player's line stays blocked. It ends when the building breaks: a Brute takes ≈ 3 s on wood and ≈ 9 s on metal. A Bloater swells and bursts there, possibly harmlessly away from the team. That costs the team little, but it is a lever: get it stuck, then step out. I couldn't show it cleanly in a probe (wood falls before the record is checked again). | In the stuck branch, clear the record when `fieldEnd` has been false for `wideStuckS` (the field gives a way round again), or when the target moved more than `wideStuckReachM` from where it was at firing. |
| L2 | low (tests) | `wideBodyStall.test.ts`, `balance.test.ts`, determinism | Mutations survived: D (`wideStallClear` no-op), E (stuck record not cleared when its building is gone), F (`stuckBuilding` dropped from `progressHash`), G (`wideStuckS` whole-ticks refine removed), H (no pool-generation reset). For E, a probe shows the right behaviour: remove the stuck building, the record clears and the Brute reaches the player 4 ticks later. But no shipped test asserts it. | One test each: sell the stuck building → record cleared and the body re-paths; the stuck body's line clears → record cleared; `loadBalance` with `wideStuckS: 0.07` throws; a reused slot starts a fresh record; two worlds that differ only in `stuckBuilding` give different `progressHash`. |
| L3 | low (perf) | `zombieAi.ts:653` | Shut out by map cover only (no building in reach): `ticks` stays at the cap and the full building-list scan runs **every tick** for that body, with no result. That's O(buildings) per stalled wide body per tick, with no allocation. It's small, but it runs forever. | Reset `ticks` to 0 (re-check every `wideStuckS`) when no candidate is found. |

### Beat the rule (attempts)

| Attempt | Result |
| --- | --- |
| Solid non-wall building (floodlight / med station) inside the box, nearer the campers than the walls | **Beaten (H1):** the Brute stood still for 39 s. Turret not tried: it would shoot the Brute and hide the stall. |
| Bloater at the rubble mouth (layout 128) with a floodlight in the box | Not beaten: the floodlight changed the field, the Bloater reached the player and swelled at tick 195, and the net didn't fire. |
| The 1 m rubble mouth (layout 128) | The body goes for the east barricade it touches, as expected. |
| Box shut by map cover only | By design no net (story "Not verified"). Found only as L3 (the scan cost). |
| Decoy barricades 2.2–4.5 m from the box (1,500 fuzz trials) | No stall. The net fired only on the touched wall. |
| Crowd (30 Walkers + wide bodies at a 1 m gap) | No false positive (0 fires, 0 building damage), with and without the `fieldEnd` gate. |
| Sell the stuck target right after firing | The record clears the next tick and the Brute reaches the player 4 ticks later. |
| Bear-trap hold while stuck | The record is kept: the `continue` skips the clear. That's fine. |
| Player relocates after firing | Moving to reachable spots: the record cleared (line clear) and the Brute re-pathed. A spot inside map solid kept it stuck: an invalid spot. See L1 for the remaining lever. |
| Bloater swelling at the barricade | It hurts the campers: 100 → 70 HP in layouts 2485 and 128. |
| Car alarm lure / stampede / Behemoth body / survivor chase | Not reachable from the net: `lureWalk` and `stampede` give `target = null` → `wideStallClear`. Swelling and windup `continue` first. `wideStall` takes a `ChaseTarget` and reads only x/y. Code-read only, no runtime probe. |

### Mutations (each new test, once)

| # | Mutation | Result |
| --- | --- | --- |
| A | `wideStall` always returns false | **Killed** (all 3 layouts + the fuzz) |
| B | Target = nearest the body (instead of nearest the player) | Survived. It's the H1 fix, and it also makes the floodlight/med-station probes pass. |
| C | `fieldEnd` gate removed | **Survived** (M1) |
| D | `wideStallClear` is a no-op | Survived (L2) |
| E | Stuck record kept when its building is gone | Survived (L2) |
| F | `stuckBuilding` not in `progressHash` | Survived (L2): no shipped test fails, only my own digest probe |
| G | `wideStuckS` whole-ticks refine removed | Survived (L2) |
| H | No pool-generation reset | Survived (L2) |
| I | `wideStuckReachM` → 99 m | Survived: no test where a far building is wrongly chosen |

### Brief lines

- 7 (fuzz): OK, but it has no solid non-wall buildings in boxes, which is the H1 gap.
- 8 (determinism): OK. The record is in the snapshot and the digest was reproduced (untested hash term: L2).
- 9 (liveness): `fired` is asserted. 10 (ticks / no allocation / JSON): OK.
- 16: timing within noise; PERF_ASSERT not run.
- 19 (merge notes): present.
- 3 (fairness rule as a test): the N = 4 s rule is asserted in the layouts and the fuzz. H1 breaks it in a case neither covers.


### Review fixes (builder, 2026-11-25)

| # | Fix | Where | Test |
| --- | --- | --- | --- |
| H1 | **[BEHAVIOUR]** The stuck target is the solid building in reach **nearest the body** (ties: nearest the target, then the lower id). Give-up: if the body neither touches it (≤ rz + 0.02 m) nor gets 0.01 m closer than its closest yet for `wideStuckS`, it gives the building up, keeps it in `stuckSkip` and picks again at once. New record slots: `stuckSkip` (Int32), `stuckDist` (Float32). | `zombieAi.ts › wideStall`, `pickStuckBuilding`, `resetWideStall`; `flowField.ts` (ZombieProgress + progressHash) | Floodlight-in-box and med-station-in-box regression tests (layout 2084 + a building at (9, 9)): a barricade is attacked within 45 s, the body is never still for more than 4 s, the inner building is **never** the stuck target and keeps full HP. A forced unreachable target (the pre-fix pick) is given up within `wideStuckS` + 1 tick and replaced. The fuzz now puts a floodlight or med station inside a third of the boxes (its own rng stream; liveness `inner` > 0). It passes at 240 trials and at 1,500 (run by hand). |
| M1 | AC 3 guard test: a Brute slowed to 0.01 m/s behind a 6 m wall moves less than 0.25 m in 10 s, its line blocked and a barricade in reach, but the field has a next cell, so the net never fires and HP is unchanged. | `wideBodyStall.test.ts` | Kills mutation C (gate removed). |
| L1 | **[BEHAVIOUR]** While stuck, it leaves the state when the field has given it a next cell for `wideStuckS` in a row (`stuckOpen`, Uint16), or when its target moved more than `wideStuckReachM` from its spot at firing (kept in `anchorX/Y` while stuck). | `zombieAi.ts › wideStall` | Target-moved exit (white-box: anchor shifted 2.6 m) and another-wall-falls exit (leaves without giving its wall up). The open-way rule has **no isolated test**: whenever a path opens, the clear-line exit ends the state first in the probes. Its mutant survives. |
| L2 | Tests: clear line (body shoved into the open, so not the target-moved exit) → cleared (D); stuck building removed → cleared and it reaches the player (E); every stuck field changes `progressHash` (F); `wideStuckS: 0.07` throws (G); a stale generation resets the record (H); reach 0.3 m → never fires (I). | `wideBodyStall.test.ts` | Mutations D, E, F, G, H and I are all killed. |
| L3 | With no building in reach the count restarts (`ticks` = 0), so the scan runs once per `wideStuckS`. | `pickStuckBuilding` | Reach 0.3 m: `ticks` never exceeds 40 and restarts after each empty scan. |

Mutation re-run (`wideBodyStall` + fuzz + config tests, each mutation once):
- Killed: C fieldEnd gate, D clear no-op, E record kept after its building is gone, F hash term, G refine, H generation reset, I reach ignored, the old "nearest the target" pick, no give-up, L1 target-moved exit removed, L3 no restart.
- Survived: L1 open-way exit removed (see above).

Bit-identical (AC 4): the code before the net fires is unchanged by these fixes. They change only the stuck branch, the pick and the clear check, and the new arrays stay zero for a body that never fires. The 16-run digest was not re-run after the fixes.
