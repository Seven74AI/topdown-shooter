import type { World } from "../core/world";

/**
 * Story 4.3: the decay stage in force (1 = `stage1_evening` … 5 = `stage5_collapse`). Story 4.5 drives
 * it (it applies a new stage at the start of a build phase, so during a build phase this is also the
 * stage of the coming wave). Until then every run stays at stage 1; `world.debug.decayStage` is a
 * dev/test override (solo cheat, tests; never synced).
 *
 * Readers: the wave director's spawn pick (`waves/spawnPick.ts`), barricade placement clearance
 * (`buildings/buildings.ts › footprintBlocked`) and the dev collision/grid view.
 */
export function decayStage(world: Readonly<World>): number {
  return world.debug.decayStage ?? 1;
}
