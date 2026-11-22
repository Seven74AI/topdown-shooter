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
    /**
     * Story 2.12: the (fractional) server tick the client drew the horde at when it sampled this
     * input (its render tick), or -1 for none (solo, before the first snapshot). The server tests
     * this input's shots against zombie positions of that tick (clamped to 300 ms back).
     */
    viewTick: z.number().min(-1).max(2 ** 31),
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
  viewTick: -1,
});
