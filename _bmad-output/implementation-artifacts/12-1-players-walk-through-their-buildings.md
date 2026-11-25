---
baseline_commit: e13f439
---

# Story 12.1: Players walk through their own buildings

Status: ready-for-dev

<!-- Quick story 2026-11-25 from a designer decision in the party-mode session on cinematics. A gameplay rule for every phase, and a prerequisite for 12.2 (the extraction walk always has a path). -->

## Story

As a player,
I want to walk through the barricades and turrets my team built,
so that we can never wall ourselves in, and the way to the helicopter is always open.

## Designer decision (2026-11-25)

> Players should not be able to make a fort with their barricades. They should always be able to go through. I don't care about zombies. But players need to be able to go through.

## Acceptance Criteria

1. **Players pass through player buildings.** Player movement and the push-out after a move ignore every building in `world.buildings` (all tiers of barricade, turrets, floodlights, med stations, traps and mines). In `packages/shared/src/player/movement.ts`, both `pushOutOfBuildings` calls pass `withBuildings = false`, the way the Behemoth already does (Story 6.5). Map solids (building boxes, cars, the bus, sandbags, cover from `map/obstacles.ts`) and the map edge still block players.
2. **Zombies are unchanged.** Zombies still collide with buildings, path around them in the flow field (`zombies/flowField.ts`) and attack them.
3. **Prediction agrees.** The client predictor uses the same shared movement, so a local player walks through a barricade with no correction snap. `apps/client/src/net/prediction.test.ts` gets a case: walking east through a metal barricade gives the same final position on the server and in prediction.
4. **No safe spot inside a wall** (decision CN-1, recommended): a player whose body overlaps a wall building (`solid: true`) can still be hit by a zombie touching that building. The zombie's melee reach is measured to the player as usual, and a wall between them doesn't block the hit when the player is inside that wall's box. Test: a player standing in the middle of a 2 m-deep metal barricade, with a zombie pressed against its face, takes damage.
5. **Shots from inside a wall get out** (decision CN-2, recommended): a bullet that starts inside a wall's box isn't stopped by that wall (`stopsBullets`). Other walls along the path still stop it. Zombie spit and bullets aimed *at* a player inside a wall follow the same rule in reverse: the wall the target stands in doesn't shield them.
6. **Placement unchanged.** You still can't place a building on a player or a zombie (`footprintBlocked`). Spawns, return spots and free-spot searches (`player/freeSpot.ts`) still avoid buildings, so nobody spawns inside a wall.
7. **It reads right.** A player walking through a wall shows through it with the existing wall silhouette (`render/WallSilhouetteView.ts`, designer pick C). There's no new art.
8. **Bots.** Bots keep working (`npm run bots` smoke). Their path choice may get shorter; that's fine.
9. **Replay.** The replay digest test is re-recorded (movement changes the run) and still matches between record and replay.

## Tasks

- [ ] `packages/shared/src/player/movement.ts`: `withBuildings = false` at both push-out calls (AC 1); update the Story 3.4 comment.
- [ ] `packages/shared/src/buildings/coverMovement.test.ts` or a new `playerPassThrough.test.ts`: players pass through every building type; map cover still blocks (AC 1, 2).
- [ ] Zombie melee and wall line-of-sight for a player inside a wall (AC 4): `zombies/zombieAi.ts` and `combat/cover.ts`.
- [ ] Shot start inside a wall (AC 5): `combat/damage.ts` / `buildings/collision.ts` `segmentHitsBuildings`.
- [ ] Client prediction test (AC 3).
- [ ] Re-record the seeds the replay and sim tests depend on if their liveness checks change (AC 9).

## Dev Notes

- Story 3.4 made buildings block players. This story reverses that for players only.
- Decisions CN-1 and CN-2 are recommended defaults, not designer calls yet. Without CN-1, a player standing inside a deep wall is untouchable (zombies can't enter the box). That's an exploit, so the story shouldn't ship without some rule there.
- Economy impact: barricades now only hold zombies, not players. The balance pass (Story 10.8) should look at whether wall prices still fit.
