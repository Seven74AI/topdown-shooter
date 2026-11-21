import { z } from "zod";

/**
 * One input sample from a player, sent once per 50 ms step (architecture › Networking).
 * Move and aim are stick vectors with length ≤ 1; dead zones are applied on the client.
 */
export const playerInputSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    moveX: z.number().min(-1).max(1),
    moveY: z.number().min(-1).max(1),
    aimX: z.number().min(-1).max(1),
    aimY: z.number().min(-1).max(1),
    /** Aim stick past its dead zone, or mouse button held. */
    fire: z.boolean(),
    /** Edge-triggered: true for exactly one sample per tap. */
    swap: z.boolean(),
    /** Story 5.12; always false until then. */
    consumable: z.boolean(),
    /** Mouse aiming disables aim assist (FR4). */
    isMouse: z.boolean(),
  })
  .strict();

export type PlayerInput = z.infer<typeof playerInputSchema>;

export const NEUTRAL_INPUT: PlayerInput = Object.freeze({
  seq: 0,
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  fire: false,
  swap: false,
  consumable: false,
  isMouse: false,
});
