import { VIEW_TICK_SCALE } from "@topdown/shared";

/**
 * Story 2.12: `PlayerInput.viewTick` from the render tick (the tick the horde is drawn at), in
 * hundredths of a tick (an integer, review L5), -1 before the first snapshot (the server then uses
 * the 2.7 shot advance). The server tests the input's shots against the zombies of that tick
 * (clamped to 300 ms back).
 */
export const viewTickOf = (renderTick: number): number =>
  Number.isFinite(renderTick) && renderTick >= 0 ? Math.round(renderTick * VIEW_TICK_SCALE) : -1;
