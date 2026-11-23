import type { SystemFn } from "../core/systems";
import { updatePathing } from "../zombies/flowField";
import { updateTurrets } from "./turret";
import { updateTraps } from "./trap";
import { updateMines } from "./mine";
import { updateMedStations } from "./medStation";
import { updateLightState } from "../decay/lightState";

/**
 * The `buildings` slot of `SYSTEM_ORDER` (after players move, before combat and zombies).
 * Story 3.5: keeps the nav grid current with the buildings and advances the zombies' flow field one
 * slice (the cadence is in `zombies/flowField.ts`). Story 3.6: then turrets aim and fire (their
 * shots fly in this tick's combat, like players'). Story 5.9 (D4): then spike traps (slow + spike
 * clock, read by this tick's zombie movement) and mines (trigger + blast). Story 5.10: then med
 * stations heal, and the derived light list follows the buildings and fires.
 * Not in `PREDICTION_SYSTEMS`: the client never runs it.
 */
export const updateBuildings: SystemFn = (world, dtS) => {
  updatePathing(world);
  updateTurrets(world, dtS);
  updateTraps(world);
  updateMines(world);
  updateMedStations(world, dtS);
  updateLightState(world);
};
