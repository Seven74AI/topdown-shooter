---
baseline_commit: 1729ac5
---

# Story 12.1: Buildings never close a path (no forts)

Status: ready-for-dev

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
6. **Map changes over the run.** Cover that appears at later decay stages (`minStage`, Story 4.2) counts as already there for this check (decision CN-1, recommended). That way a decay stage can never close a path that the team's buildings left open. Rubble or wrecks that can appear during a wave (4.8 breakdowns) follow the same rule if they're solid.
7. **A clear refusal.** New `PlaceError` / `MoveError` value `"seals_path"` and a new `BlockCause` `"seals_path"` (`buildings.ts`). The build ghost turns red with the existing block-reason UI (`apps/client/src/scenes/placement.ts`, `render/BlockReasonView.ts`) and the line **"Leave a way through"**. The pocket it would close is highlighted for a moment (decision CN-2: a soft red fill over the cells that would be cut off).
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
    - Decay-stage cover (AC 6).

## Tasks

- [ ] `packages/shared/src/buildings/pathOpen.ts` (new): the player-clearance flood fill and `sealsPath(world, box, exceptId)` (AC 2, 5, 6, 9).
- [ ] `buildings.ts`: call it from `placeBuilding` and `blockReason`; new error and cause values (AC 2, 7).
- [ ] `move.ts`: same check (AC 3).
- [ ] Client: ghost refusal line, pocket highlight (AC 7), cache (AC 9).
- [ ] Bots (AC 11).
- [ ] Tests (AC 8, 12).

## Dev Notes

- The zombie flow field (`zombies/flowField.ts`) already rasterizes buildings and map solids onto the 0.5 m grid with a clearance rule for bodies (review H1: free vertices). Reuse its rasterization, but at player clearance and with buildings as hard walls. Don't reuse its costs: the flow field treats buildings as expensive, not closed.
- Consequence: since there's always a player-sized gap, zombies of the same size can use it too. Brutes and wide bodies may not fit. The designer said zombies don't matter here.
- Decisions CN-1 (future decay cover counts) and CN-2 (pocket highlight) are recommended defaults.
