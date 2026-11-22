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
