import { NEUTRAL_INPUT } from "@topdown/shared";
import type { MutablePlayerInput } from "./InputRouter";

/**
 * Story 2.11: the input while the in-run menu is open. The survivor stands still and stops firing,
 * and no swap or consumable is pressed. The seq is not touched: the host still stamps a fresh one
 * on every step, so online the server keeps getting one input per tick (no starve, no backlog).
 * The aim and the mouse flag are kept, so the survivor keeps facing the same way.
 */
export function neutralizeInput(out: MutablePlayerInput): MutablePlayerInput {
  out.moveX = NEUTRAL_INPUT.moveX;
  out.moveY = NEUTRAL_INPUT.moveY;
  out.fire = NEUTRAL_INPUT.fire;
  out.swap = NEUTRAL_INPUT.swap;
  out.consumable = NEUTRAL_INPUT.consumable;
  return out;
}

/**
 * Story 5.15: the input while I hold a building in a build phase. I keep walking (the move is
 * kept), but nothing aims or fires: the right half belongs to the build cluster, and with a zero
 * aim the sim faces my survivor the way it walks (the carry facing). Swap, consumable and the seq
 * are untouched (edge flags stay once per input seq).
 */
export function holdBuildingInput(out: MutablePlayerInput): MutablePlayerInput {
  out.aimX = 0;
  out.aimY = 0;
  out.fire = false;
  return out;
}
