import type { SystemFn } from "../core/systems";
import { updatePathing } from "../zombies/flowField";
import { updateTurrets } from "./turret";

/**
 * The `buildings` slot of `SYSTEM_ORDER` (after players move, before combat and zombies).
 * Story 3.5: keeps the nav grid current with the buildings and advances the zombies' flow field one
 * slice (the cadence is in `zombies/flowField.ts`). Story 3.6: then turrets aim and fire (their
 * shots fly in this tick's combat, like players').
 * Not in `PREDICTION_SYSTEMS`: the client never runs it.
 */
export const updateBuildings: SystemFn = (world, dtS) => {
  updatePathing(world);
  updateTurrets(world, dtS);
};
