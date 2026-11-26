---
baseline_commit: 1729ac5
---

# Story 12.1: Buildings never close a path (no forts)

Status: review

<!-- Quick story 2026-11-25 from a designer decision in the party-mode session on cinematics. A building rule for every phase, and a prerequisite for 12.2 (the extraction walk always has a path). Rewritten the same day: walls stay solid; placement prevents the fort. -->

## Story

As a player,
I want the game to refuse a building that would wall off part of the map,
so that my team can't build a sealed fort, and there's always a way through for every survivor.

## Designer decision (2026-11-25)

> Players shouldn't be able to pass through their barricades. They shouldn't be able to build a fort. It's the building system that we need to change. A building cannot block a path entirely. A player should always be able to pass, because we prevent them from building it.

## Acceptance Criteria

1. **Walls stay solid.** Players, zombies and bullets interact with buildings exactly as today (Story 3.4 collision, 2026-11-23 bullet rule). Nothing changes in movement.
2. **The rule: no sealed pocket.** A placement is refused if, with the new building added, any walkable area that a player could reach before is no longer reachable from the rest of the map.
   - "Walkable" is measured for a **player's body** (`player.radiusM` 0.4 m): a gap narrower than a player doesn't count as a way through.
   - Equivalently: after the placement, every free cell must still connect to the **main walkable region**, the one containing the `evac_pad`. Cells under the new building's own footprint don't count.
   - This covers a ring of barricades around the pad, a ring around a teammate, closing off a dead-end alley, and walling a corner against map solids or the map edge.
3. **Moves too.** Moving a building (Story 5.24, `buildings/move.ts`) checks the same rule at the destination, with the building removed from its old spot. Upgrades keep the footprint, so they need no check.
4. **Chained and pending placements.** The server checks each placement in arrival order against the buildings already placed (5.18's place-place-place chain under lag). A pending placement that becomes illegal because an earlier one landed is refused like any other block.
5. **Only walls count.** Floor types (`solid: false`: spike trap, mine, bear trap) never block a path and are never refused by this rule.
6. **Map changes over the run: buildings too close to new cover go** (designer 2026-11-25). The placement check only uses the map as it is now. When a decay stage adds solid cover (Story 4.2 `minStage`; also any solid wreck or rubble a 4.8 breakdown or fire leaves), **every building whose box is closer than one player body (`2 × player.radiusM` = 0.8 m) to the new cover is destroyed**, whether or not it would actually seal a path. No path search is needed: a building can never end up squeezing a gap below player width against new cover.
   - **A decay stage re-checks paths; walls that now seal are cleared** (review H1, designer-decided 2026-11-26: option A). After the stage's mutations and the 0.8 m clearing, the path rule runs again: a spot that was in the main region before the stage, is still free, and is now cut off by walls (while the map alone still joins it) gets the wall nearest it cleared (highest building id first, again until nothing is cut), cause `cleared`, no refund, the same toast. The 0.8 m margin stays (the re-check also covers wider gaps the grid reads as closed, e.g. 0.85 m).
   - **No refund** (Story 12.4): the building is simply lost; `building.destroyed` is emitted as for any decay loss.
   - **Where:** inside `destroyBlockedBuildings` (`decay/decaySystem.ts`). Today it destroys buildings that *overlap* new solids; this widens "overlap" to "within 0.8 m". Same build-phase start, same order (building id), so every phone and every replay agrees.
   - **Floor types** (traps, mines) are not affected: they never block.
   - **Visible:** a toast for the owner, **"Your barricade was cleared by the collapse"**, with no amount (Story 12.4: decay losses aren't refunded).
7. **A clear refusal.** New `PlaceError` / `MoveError` value `"seals_path"` and a new `BlockCause` `"seals_path"` (`buildings.ts`). The build ghost turns red with the existing block-reason UI (`apps/client/src/scenes/placement.ts`, `render/BlockReasonView.ts`) and the line **"Leave a way through"**. The pocket it would close is highlighted for a moment (CN-2, accepted: a soft red fill over the cells that would be cut off).
8. **Same answer on both sides.** The client's ghost preview and the server use the same shared check. Fuzz test: random building layouts on Downtown, the client preview's answer equals the server's for every candidate spot (in the style of `blockReason.test.ts`).
9. **Fast enough.** The check is a flood fill on the 0.5 m nav grid (96 × 64 = 6,144 cells on Downtown; Epic 11's 70 × 70 m maps are bigger). It allocates nothing per call (preallocated buffers). On the server it runs once per placement. On the client it's cached per (ghost cell, rotation, `buildings.version`), so dragging the ghost doesn't redo it every frame. Target: < 1 ms per check on Downtown on a reference phone.
10. **Existing layouts.** A save (8.4–8.6) or replay that already contains a sealed fort still loads; the rule only refuses new placements and moves.
11. **Bots.** `botShop` / bot placement handles `"seals_path"` (picks another spot or skips). `npm run bots` smoke passes. Replay and sim seeds whose liveness checks change are re-recorded.
12. **Tests.**
    - A ring of barricades around the pad → the closing piece is refused; the ring with a one-player gap is allowed.
    - A gap of 0.7 m (narrower than a player's 0.8 m body) counts as closed.
    - A wall against the map edge and against a map solid that would seal a corner → refused.
    - Floor traps never refused.
    - Move and chain cases (AC 3, 4).
    - A decay stage adds cover 0.5 m from a barricade → the barricade is destroyed (no refund); one 1.0 m away stays; a mine 0.2 m away stays (AC 6).

Added 2026-11-26 (clashes X3, X4, X5, X10; designer "ok" 2026-11-26, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6). These add tests and measures; the rule above is unchanged.

13. **One shared rasteriser (X3).** `pathOpen.ts` uses the same grid and clearance helper as `pushOutOfBuildings › escapeInside` (PRs #12 and #18, `spec-fix-escape-narrow-openings.md`), or the flow-field rasteriser named in the Dev Notes, so the placement check and the escape fill never disagree about what a gap is. The sealed-fort escape tests (`collision.test.ts`, `relocationPinned.test.ts`) stay: saves and replays can still hold forts (AC 10). New test: a placement this check accepts never produces a pocket the escape would call sealed.
14. **Measure the zombie side (X4).** Before and after this story, run the 10-wave bot sim (bots build around the pad) and record wall damage taken, zombies through gaps and team wipes in the story file, as input for 10.8. Add the 6.13 wide-body case "Brute at a 0.8 m forced gap" to the tests.
15. **The dev fort stays (X5).** `?stress=5&stressbuild=fort` (`debug/stressScenario.ts`, used by the 9.11 / 9.12 look checks and readability sheet item 63) keeps its closed fort as a debug-only layout that bypasses the placement check (it never reaches the server), with a comment pointing to AC 10.
16. **AC 9 measured headless (X10).** Reference phones are parked: measure the check at 4× CPU throttle in headless Chromium (< 1 ms per check on Downtown), and record the time on a 140 × 140-cell grid for Epic 11's 70 × 70 m maps. The reference-phone wording of AC 9 stays, parked.

## Tasks

- [x] `packages/shared/src/buildings/pathOpen.ts` (new): the player-clearance flood fill and `sealsPath(world, box, exceptId)` (AC 2, 5, 6, 9).
- [x] `buildings.ts`: call it from `placeBuilding` and `blockReason`; new error and cause values (AC 2, 7).
- [x] `move.ts`: same check (AC 3).
- [x] `decay/decaySystem.ts`: widen the overlap test to a 0.8 m margin (AC 6), plus the owner toast.
- [x] Client: ghost refusal line, pocket highlight (AC 7), cache (AC 9).
- [x] Bots (AC 11).
- [x] Tests (AC 8, 12).
- [x] Shared rasteriser + escape-agreement test (AC 13).
- [x] Bot-sim before/after table + Brute forced-gap test (AC 14).
- [x] Dev fort bypass comment (AC 15).
- [x] Headless 4× CPU timing, Downtown + 140 × 140 grid (AC 16).

## Dev Notes

- The zombie flow field (`zombies/flowField.ts`) already rasterizes buildings and map solids onto the 0.5 m grid with a clearance rule for bodies (review H1: free vertices). Reuse its rasterization, but at player clearance and with buildings as hard walls. Don't reuse its costs: the flow field treats buildings as expensive, not closed.
- Consequence: since there's always a player-sized gap, zombies of the same size can use it too. Brutes and wide bodies may not fit. The designer said zombies don't matter here.
- CN-1 settled: AC 6 (destroy buildings within one player body of new cover; no refund, Story 12.4). CN-2 accepted by the designer: highlight the pocket a refused placement would close.
- AC 6 builds on FR58: decay already destroys buildings that end up under new cover.

## Dev Agent Record

Builder: cloud session, branch `story-12-1` (one PR with Story 12.4), 2026-11-26. Built with `gds-dev-story`.

### Decisions

No decision was left open in this story file (CN-1, CN-2 settled). Builder decisions, each the recommended/minimal option, **auto-accepted (designer 2026-11-26: follow recommendations)** unless marked otherwise:

- **D1 the grid** (**designer-confirmed 2026-11-26**, "ok": the strict gap rule may refuse a placement that still leaves a narrow way through, but never allows a real seal). The check floods the vertices of the 0.5 m build lattice (97 × 65 on Downtown) at player clearance: a vertex is free when a 0.4 m body centred there overlaps no box and stays in the map; two neighbours are joined when the body slides between them (exact box-to-segment clearance). A lattice gap between buildings is open exactly when ≥ 1.0 m (0.5 m: closed). Between a building and a map solid it is conservative: 0.8–0.9 m can read closed, never the reverse (a grid path is always a real path). A pocket with no lattice vertex inside (only possible between map solids) isn't tracked.
- **D2 "before" region.** Refused iff a vertex of the evac pad's region **before** the placement is still free but no longer joined to it. Map nooks the grid already reads as closed, and the inside of an old save's fort (AC 10), never refuse anything. A map without an `evac_pad` anchors at team start 0.
- **D3 shared rasteriser (AC 13).** `collision.ts` exports the two clearance helpers (`bodyFitsInMap`, `segmentNearBox`, plus the existing `circleOverlapsBox`); `pathOpen.ts` and the escape's flood both use them. For a **player's body** (an explicit `playerBody` flag on `pushOutOfBuildings`, passed by player movement and knockback) the escape's flood is snapped to the lattice in a 100-cell window. The agreement is **one way**: a spot the placement check calls open is open for the escape's player flood (the AC 13 test); the reverse is not promised (the check is the stricter of the two between a building and a map solid). Every other body keeps the unsnapped 98-cell window and reach (snapping zombies too broke three tuned escape tests), and since review M2 a test pins zombie escapes to a digest computed on master `d8ffaee` (`escapeZombieGolden.test.ts`).
- **D4 highlight.** The pocket fill is the smaller side of the cut: for a ring round the pad the cut-off part is the whole rest of the map, so the ring's inside is filled instead.
- **D5 decay-loss cause.** `building.destroyed` gets an optional `cause` (`collapse` | `fire` | `cleared`), appended to the existing net tuple (index + 1); no new net kind. The toast for `cleared` says "barricade" for the barricade types, else "building".
- **D6 pending placements.** The client preview judges the seal against the World without my pending boxes (5.18); the server judges in arrival order (AC 4), so a chained Place that becomes illegal is refused with the toast "Leave a way through".

### Implementation notes

- `packages/shared/src/buildings/pathOpen.ts` (new): `sealsPath(world, box, exceptId)`, `sealedPocket`. Module buffers sized to the largest map (no allocation per call). Caches: map-solid layer per (World, `obstacles.version`), before-flood per (`buildings.wallVersion`, moved id), last answer per box (AC 9's ghost cache: same cell + rotation + wall version → no flood).
- `buildings.ts`: `PlaceError` / `BlockCause` + `seals_path`; `placementError` checks it last (walls only, AC 5); `blockReason(…, wall)` explains it (index = the pocket's first vertex, id = its size, so a new pocket is a new reason). `move.ts`: `MoveError` + `seals_path`, judged with the building lifted (AC 3).
- `decaySystem.ts`: `decayMutate` copies the solids before the mutations; `destroyBlockedBuildings(world, fires, before)` also removes every wall closer than `2 × player.radiusM` (box to box) to a solid not in `before` (AC 6), no refund, cause `cleared`. Floor types only go by overlap.
- Client: "Leave a way through" (`SEALS_PATH_TEXT`, placement refusal, reason line, move refusal), the soft red pocket fill (`BlockReasonView`, from `Placement.pocketCells`), the decay-loss toast (`decayLossText`). Over-the-wire bots treat `seals_path` like `blocked` (next spot); headless bots already try the next candidate on any refusal (AC 11).
- AC 15: comment on `placeStressFort` (it uses `addBuildingAt` + `footprintBlocked` only; verified, `stressScenario.ts:392`).

### Tests

- `buildings/pathOpen.test.ts` (new, 21): ring round the pad (closing piece refused; 1.0 m gap ok; two 0.5 m gaps refused; highlight = the ring's inside, 49 vertices); ring round a teammate (pocket highlighted inside the ring); 0.7 m gap against a map solid refused, 0.9 / 1.0 m allowed; corner against the map edge and against a map solid refused; floor types never refused; old sealed fort (AC 10); move into the gap refused, a ring piece moved along allowed (lifted), own spot ok; chained turrets (AC 4); AC 8 fuzz: 6 Downtown layouts × 600 spots, the client's `blockReason(…, wall)` asked twice (cache) equals the server's cold `placementError`; AC 13 (one way: check-open ⇒ escape-open): 4 Downtown layouts built only from accepted placements near the pad, every main-region vertex within 3 m of a building is open for the escape's player flood (`escapeAreaOpen`), with liveness (seal refusals happened); AC 6: new cover 0.5 m from a barricade destroys it (cause `cleared`, no money), 1.0 m / 1.41 m / 1.5 m stay, a mine 0.2 m away stays.
- `zombies/wideBodyStall.test.ts`: AC 14's "Brute at a forced 0.8 m gap" (built with no checks between a map wall and a barricade; a player fits): the Brute never squeezes in, never stands still > 4 s, and breaks a barricade within 45 s.
- `decay/decay.test.ts`: 4.5's "a path can still be closed" is now the 12.1 rule (the piece leaving 0.5 m is refused with `seals_path`; a body-wide line stays open). `map/evening.test.ts`: the shop-front build spot keeps 0.8 m from every box a later stage adds. `net/netEvents.test.ts`: the three causes round-trip. Client: `placement.test.ts` (seals_path shown with its pocket), `blockText.test.ts` (texts).
- The sealed-fort escape tests (`collision.test.ts`, `relocationPinned.test.ts`) are unchanged and pass.

### AC 14: 10-wave bot sim, before → after

Mortal runs, `runHeadless` on Downtown, 1–4 bots × seeds 1–3 (bots build round where they stand, by the pad). Wall damage = HP lost by wall buildings during waves. AC 14 asks for "zombies through gaps", which the sim doesn't measure directly; the column **"zombies reaching a player"** (distinct zombies that bit a player) stands in for it (bites = `player.damaged` from a zombie; solo bots mostly die to Spitter acid). Script: `tools/sims/wallSim.ts` (committed with review L6).

**Before** (master `d8ffaee`):

| bots | seed | ending | waves cleared | walls placed | wall damage taken (HP) | walls broken | zombies reaching a player | zombie bites | wiped |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | wiped | 3 | 2 | 0 | 0 | 0 | 0 | yes |
| 1 | 2 | wiped | 5 | 3 | 0 | 0 | 0 | 0 | yes |
| 1 | 3 | wiped | 6 | 3 | 80 | 0 | 2 | 2 | yes |
| 2 | 1 | wiped | 8 | 8 | 800 | 2 | 0 | 0 | yes |
| 2 | 2 | wiped | 9 | 7 | 1600 | 7 | 1 | 3 | yes |
| 2 | 3 | wiped | 9 | 7 | 1400 | 5 | 6 | 6 | yes |
| 3 | 1 | wiped | 9 | 9 | 360 | 1 | 0 | 0 | yes |
| 3 | 2 | wiped | 9 | 11 | 1500 | 6 | 1 | 1 | yes |
| 3 | 3 | wiped | 3 | 7 | 0 | 0 | 19 | 21 | yes |
| 4 | 1 | wiped | 9 | 13 | 2140 | 8 | 0 | 0 | yes |
| 4 | 2 | wiped | 9 | 15 | 3200 | 14 | 1 | 1 | yes |
| 4 | 3 | extracted | 10 | 13 | 1640 | 7 | 3 | 3 | no |
| **all** | 12 runs | | 89 | 98 | 12720 | 50 | 33 | 37 | 11 |

**After** (12.1 + 12.4; 12.1 alone gives the identical table — 12.4 changes no bot behaviour here):

| bots | seed | ending | waves cleared | walls placed | wall damage taken (HP) | walls broken | zombies reaching a player | zombie bites | wiped |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | wiped | 3 | 2 | 0 | 0 | 0 | 0 | yes |
| 1 | 2 | wiped | 5 | 3 | 0 | 0 | 0 | 0 | yes |
| 1 | 3 | wiped | 6 | 4 | 80 | 0 | 2 | 2 | yes |
| 2 | 1 | wiped | 8 | 8 | 800 | 2 | 0 | 0 | yes |
| 2 | 2 | wiped | 9 | 7 | 1600 | 7 | 1 | 3 | yes |
| 2 | 3 | wiped | 9 | 7 | 1400 | 5 | 6 | 6 | yes |
| 3 | 1 | wiped | 9 | 9 | 360 | 1 | 0 | 0 | yes |
| 3 | 2 | wiped | 9 | 11 | 1500 | 6 | 1 | 1 | yes |
| 3 | 3 | wiped | 3 | 7 | 0 | 0 | 19 | 21 | yes |
| 4 | 1 | wiped | 9 | 13 | 2140 | 8 | 0 | 0 | yes |
| 4 | 2 | wiped | 9 | 15 | 3200 | 14 | 1 | 1 | yes |
| 4 | 3 | wiped | 9 | 15 | 780 | 3 | 3 | 3 | yes |
| **all** | 12 runs | | 88 | 101 | 11860 | 46 | 33 | 37 | 12 |

Only two runs differ. 1 bot seed 3: 12.1's margin cleared the bot's turret at the build start before wave 6; it rebuilt one (the extra wall) and so skipped a revive kit. 4 bots seed 3: at the stage-3 build start (before wave 5) 12.1's margin cleared one bot barricade 0.5 m from new cover; the bot rebuilt elsewhere, the run diverged and the team wiped in wave 10 instead of extracting (wall damage 1,640 → 780, walls broken 7 → 3). A placement-by-placement diff of that run shows every bot placement identical up to that clearing (so no `seals_path` refusal changed anything before it); `seals_path` refusals were not counted across the other runs. Totals: wall damage 12,720 → 11,860 HP, walls broken 50 → 46, zombies reaching a player 33 → 33, wipes 11 → 12 of 12. Input for 10.8: no sign that the rule weakens the bots' defence beyond that one butterfly.

### AC 9 / AC 16: timing (headless Chromium, `Emulation.setCPUThrottlingRate`)

24 walls placed through the real check, 400 random wood spots; machine load average ≈ 1.1–1.3 (4 cores) during the runs. Harness: `tools/sims/pathOpenBench.ts` (+ `.entry.ts`, committed with review L6). Two more runs after the review fixes (fresh container, load ≈ 0.7): Downtown ×4 per placement 0.56–0.64 ms, new spot 0.16–0.18 ms, fully cold 1.90–2.29 ms; 70 × 70 m ×4 per placement 1.84–2.91 ms, new spot 0.91–1.39 ms.

| Map | Vertices | Per server placement (map layer cached, walls + 2 floods) | Client new ghost spot (before cached, 1 flood) | Ghost held still | Fully cold (map layer rebuilt: once per decay change) |
| --- | --- | --- | --- | --- | --- |
| Downtown 48 × 32 m, ×1 | 6,305 | 0.115 ms | 0.040 ms | ~0 | 0.39 ms |
| Downtown 48 × 32 m, **×4** | 6,305 | **0.49–0.56 ms** | **0.17 ms** | ~0 | 1.77 ms |
| 70 × 70 m (140 × 140 cells), ×1 | 19,881 | 0.43 ms | 0.21 ms | ~0 | 0.56 ms |
| 70 × 70 m (140 × 140 cells), ×4 | 19,881 | 1.93–1.97 ms | 0.95–1.07 ms | ~0 | 2.39–2.48 ms |

Downtown meets < 1 ms at 4× for every check a placement or a drag makes. The fully cold path (1.8 ms at 4×) happens once after a decay stage changes the map. Epic 11's 70 × 70 m maps are about 2 ms per placement at 4× (recorded, not a target). The reference-phone wording of AC 9 stays parked.

### Browser check

Headless Chromium, mobile emulation, dpr 2, Practice solo (`?wallet=5000`), Vite on its own port (5421, stopped by PID). A wood ring round the pad laid in the solo World but for one piece; the ghost pinned on the closing spot. Shots in `docs/art/12-1/` (README): `12-1-ghost-{844x390,568x320}.png` (red ghost, "Leave a way through", the ring's inside filled soft red) and `12-1-refusal-toast-{844x390,568x320}.png` (after Place the solo host refuses it and the toast reads "Leave a way through"). No console or page errors. Not verified in a browser: the online path (the refusal comes back as `building.refused`, same text) and the decay-loss toasts (unit-tested texts; the event path is the same loop as other toasts).

### Review fixes (PR #33 review, 2026-11-26: 1 high, 3 medium, 7 low)

- **H1** (a decay stage can finish a seal the walls started): **designer-decided 2026-11-26: A** (re-check paths after each decay stage). `pathOpen.ts › captureStageRegion` keeps the main region just before a build start's mutations; after them (and the 0.8 m clearing) `decaySystem.ts › clearStageSeals` asks `stageCutWall` for the highest-id wall within `player.radiusM + BUILD_GRID_M` of a vertex that was in the main region, is still free, is cut off by walls and is joined in the map-only layer, clears it (cause `cleared`, no refund, toast "Your barricade was cleared by the collapse") and asks again until nothing is cut. It runs in the DecaySystem (server and solo); the client mirror and the Predictor follow the removal like every decay loss (`applyDecayStage` has no side effects on buildings by design). Build starts only, module buffers (no allocation per tick). The 0.8 m margin stays: the re-check also covers the 0.85 m flip case. Tests (`pathOpen.test.ts` "H1"): the review's parking-lot layout (Downtown, five wood walls at (20, 22) and (19.5, 24/26/28/30) rot 1, variants 1 << 10, stages 2 → 4: 208 vertices sealed before the fix, 0 after, a wall cleared, wallets unchanged), the 0.85 m gap after new cover (35 → 0, highest id first, no money), and a stage that seals nothing clears nothing. Both regressions fail on the previous head. CI caught a cost: the capture ran at every build start, and `shopCards.test.ts` (2,000 build starts, no buildings) went from ~4 s to 35 s locally (69 s on a CI runner, over the 30 s limit). The capture and the re-check now run only while a wall stands (without one the re-check can never name a wall, so results are unchanged): back to 4.6 s. Bot sim: the re-check cleared **0 walls in all 12 runs** (the table above is unchanged; new column in `tools/sims/wallSim.ts`).
- **M1** fixed: `moveError` skips the seal check for the spot the building already has (a pick-up, or a move that changes nothing), so a wall of an old save's sealed fort can be picked up. Test: `repairPanel.test.ts` "review M1" (fails without the fix: `seals_path`).
- **M2** fixed: the snapped 100-cell window and its wider reach now apply only with the explicit `playerBody` flag (player movement and knockback pass it); every other body has the old 98-cell window and reach, and the dead-end cache is keyed by body kind. Test: `escapeZombieGolden.test.ts` pins 2 stages × 3 zombie types × 400 illegal starts' escapes to the digest computed on master `d8ffaee` (1332647416; failed on the reviewed head).
- **M3** done: `npm run bots -- --url http://localhost:2621 --count 4 --until-wave 3` against a local server (own port, stopped by PID): 3 waves ended, 8 buildings placed, no placement refused, 0 horde decode errors.
- **L1** answered, no change: the anchor search already gives the base layer's vertex. The walls layer's free set is a subset of the base layer's, so when the base layer's nearest free vertex is free in the walls layer it is also the walls layer's first in scan order; when a wall covers it, a search in the walls layer is what both would need. The results are identical, so no test can fail without a change.
- **L2** documented: `SEALS_PATH_TEXT`'s doc says the preview ignores my pending walls (D6) and the server's toast covers it.
- **L3** added: `verticesOutsideMainRegion(world)`; Downtown has 0 at every stage 1–5 and every legal decay mask (`pathOpen.test.ts`).
- **L4** added: the AC 8 fuzz now asserts `seals_path` answers happened (placements and moves), checks moves (client warm vs server cold), and lands a wall every 100 spots so the client's warm cache crosses a `wallVersion` change.
- **L5** fixed: the shown pocket refreshes when `wallVersion` changes (`Placement.pocketWallVersion`). Test in `placement.test.ts` (fails without the fix).
- **L6** fixed in this record: the AC 14 column label (stand-in for "zombies through gaps"), the 1-bot seed-3 cause, the god seed-3 wallet (12.4 story and changelog), the two scripts committed under `tools/sims/`, the `pathOpen.ts` JSDoc of `inMainRegion` / `resetPathOpenCache`.
- **L7** fixed: D3 / AC 13 now say "one way".
- Nits: the `BUILDING_DESTROYED` comment names the 8th field; the dead `void`s in the tests are gone.

### Follow-ups

- **For 10.8 (balance pass):** in the 10-wave bot sim, 4 bots seed 3 went from extracting to a team wipe in wave 10. 12.1's 0.8 m margin cleared one bot barricade at the stage-3 build start, and the run diverged from there. Re-check bot survival with 12.1's rules in force.

### Notes for the merge

- Shared files other stories may touch: `packages/shared/src/index.ts` (two export lines), `core/simEvents.ts` (optional `cause` on `building.destroyed`, `BUILDING_LOSS_CAUSES`), `net/netEvents.ts` (`BUILDING_DESTROYED` tuple gains an optional 8th field; **no new net kind**), `apps/client/src/net/session.ts` (one line: `PLACE_ERRORS` + `seals_path`), `apps/client/src/scenes/GameScene.ts` (one `else if` in the event loop + an import), `apps/client/src/debug/stressScenario.ts` (comment only), `buildings/collision.ts` (helpers + the player-only flood snap).
- No readability-sheet item and no new net event kind used.
- No save shape change (`SAVE_SCHEMA_VERSION` unchanged); `balance.version` changes with 12.4.

### File List

New: `packages/shared/src/buildings/pathOpen.ts`, `packages/shared/src/buildings/pathOpen.test.ts`, `docs/art/12-1/` (README + 4 PNG).
Modified: `packages/shared/src/buildings/{buildings,move,collision}.ts`, `packages/shared/src/buildings/{blockReason,move}.test.ts`, `packages/shared/src/decay/decaySystem.ts`, `packages/shared/src/decay/decay.test.ts`, `packages/shared/src/core/simEvents.ts`, `packages/shared/src/net/netEvents.ts`, `packages/shared/src/net/netEvents.test.ts`, `packages/shared/src/index.ts`, `packages/shared/src/map/evening.test.ts`, `packages/shared/src/zombies/wideBodyStall.test.ts`, `apps/client/src/scenes/{placement,blockText,repairPanel,GameScene}.ts`, `apps/client/src/scenes/{placement,blockText}.test.ts`, `apps/client/src/render/BlockReasonView.ts`, `apps/client/src/net/session.ts`, `apps/client/src/debug/stressScenario.ts`, `tools/bots/botClient.ts`.

### Change Log

- 2026-11-26: built (branch `story-12-1`, with 12.4).
