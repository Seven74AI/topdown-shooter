import { applyDecayStage, type World } from "@topdown/shared";

/**
 * Story 4.5 (brief line 2): the room state's decay stage and variant mask → a client World (the
 * mirror and the Predictor), through the SAME shared `applyDecayStage` the server and solo run.
 * Stage 0 = not set yet (a lobby patch): nothing happens. Cheap when unchanged (two compares), so
 * it runs on every patch / frame; it rebuilds the lists only on a change, which also brings a late
 * join, a tab that slept across a build start or a late Game scene start onto the server's map.
 * Returns whether the map changed.
 */
export function mirrorDecay(world: World, stage: number | undefined, variants: number | undefined, firesOut: number | undefined = 0): boolean {
  if (stage === undefined || !(stage >= 1)) return false;
  return applyDecayStage(world, stage, variants ?? 0, firesOut ?? 0); // Story 4.8: + the burned-out fires
}
