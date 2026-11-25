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
     * Story 2.12: the server tick the client drew the horde at when it sampled this input (its
     * render tick), in **hundredths of a tick** (an integer: 14 B on the wire instead of 18 for a
     * float; review L5), or -1 for none (solo, before the first snapshot). The server tests this
     * input's shots against zombie positions of that tick (clamped to 300 ms back). Read it with
     * `viewTickOfInput`.
     */
    viewTick: z.number().int().min(-1).max(2 ** 31),
  })
  .strict();

export type PlayerInput = z.infer<typeof playerInputSchema>;

/** Story 2.12: `PlayerInput.viewTick` units per tick (hundredths). */
export const VIEW_TICK_SCALE = 100;

/** Story 2.12: the input's view tick in ticks (fractional), or -1 for none. */
export const viewTickOfInput = (input: PlayerInput): number => (input.viewTick >= 0 ? input.viewTick / VIEW_TICK_SCALE : -1);

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

// ── Story 8.11: the binary input (`BYTES.INPUT`, brief 18/19) ──

/**
 * Story 8.11 (AC 3, decision 8.11 D4): the input on the wire, 14 bytes instead of the ~116 B msgpack map.
 *
 *   [0]      format (`INPUT_FORMAT`; anything else is refused)
 *   [1..4]   seq, u32 little-endian
 *   [5..8]   moveX, moveY, aimX, aimY: int8 in −127…127 = value × 127 (−128 is refused: it is below −1)
 *   [9]      flags: 1 fire, 2 swap, 4 consumable, 8 isMouse (any other bit set is refused: "nothing extra")
 *   [10..13] viewTick + 1, u32 little-endian (0 = −1, none; above 2³¹ + 1 is refused)
 *
 * `decodeInput` accepts exactly what `playerInputSchema` accepts (F2: seq integer ≥ 0, sticks in [−1, 1], booleans,
 * viewTick −1…2³¹, nothing extra), at 1/127 stick steps; everything else is refused (false) and never throws.
 * The phone quantises its input BEFORE predicting (`quantizeInput`), so the predicted and the server's moves use the
 * same values. The format is covered by `NET_PROTOCOL_VERSION` (3) at join (brief 19).
 */
export const INPUT_BYTES = 14;
/** The first byte of every binary input (bump with `NET_PROTOCOL_VERSION`). */
export const INPUT_FORMAT = 1;
/** Stick steps per unit (int8, decision 8.11 D4). */
export const INPUT_STICK_STEPS = 127;

const FLAG_FIRE = 1;
const FLAG_SWAP = 2;
const FLAG_CONSUMABLE = 4;
const FLAG_MOUSE = 8;
const FLAGS_ALL = FLAG_FIRE | FLAG_SWAP | FLAG_CONSUMABLE | FLAG_MOUSE;
const VIEW_TICK_MAX = 2 ** 31;

/** A stick value → its int8 step (clamped to ±127; NaN → 0). */
const stickStep = (v: number): number => {
  const q = Math.round(v * INPUT_STICK_STEPS);
  return q > INPUT_STICK_STEPS ? INPUT_STICK_STEPS : q < -INPUT_STICK_STEPS ? -INPUT_STICK_STEPS : q === q ? q : 0;
};

const putU32 = (out: Uint8Array, at: number, v: number): void => {
  out[at] = v & 0xff;
  out[at + 1] = (v >>> 8) & 0xff;
  out[at + 2] = (v >>> 16) & 0xff;
  out[at + 3] = (v >>> 24) & 0xff;
};
const getU32 = (b: Uint8Array, at: number): number =>
  ((b[at] as number) | ((b[at + 1] as number) << 8) | ((b[at + 2] as number) << 16) | ((b[at + 3] as number) << 24)) >>> 0;
/** int8 from a byte (−128…127). */
const getI8 = (b: Uint8Array, at: number): number => ((b[at] as number) << 24) >> 24;

/** Writes `input` into `out` (≥ INPUT_BYTES; preallocated by the caller: nothing is allocated). Returns INPUT_BYTES. */
export function encodeInput(input: PlayerInput, out: Uint8Array): number {
  out[0] = INPUT_FORMAT;
  putU32(out, 1, input.seq >>> 0);
  out[5] = stickStep(input.moveX) & 0xff;
  out[6] = stickStep(input.moveY) & 0xff;
  out[7] = stickStep(input.aimX) & 0xff;
  out[8] = stickStep(input.aimY) & 0xff;
  out[9] = (input.fire ? FLAG_FIRE : 0) | (input.swap ? FLAG_SWAP : 0) | (input.consumable ? FLAG_CONSUMABLE : 0) | (input.isMouse ? FLAG_MOUSE : 0);
  const vt = Math.trunc(input.viewTick);
  putU32(out, 10, vt >= 0 ? Math.min(vt, VIEW_TICK_MAX) + 1 : 0);
  return INPUT_BYTES;
}

/**
 * Reads a binary input into `out` (reused: nothing is allocated). False (and `out` unspecified) for anything
 * `playerInputSchema` would refuse or that is not exactly INPUT_BYTES long (F2).
 */
export function decodeInput(b: Uint8Array, out: { -readonly [K in keyof PlayerInput]: PlayerInput[K] }): boolean {
  if (b.length !== INPUT_BYTES || b[0] !== INPUT_FORMAT) return false;
  const mx = getI8(b, 5);
  const my = getI8(b, 6);
  const ax = getI8(b, 7);
  const ay = getI8(b, 8);
  if (mx < -INPUT_STICK_STEPS || my < -INPUT_STICK_STEPS || ax < -INPUT_STICK_STEPS || ay < -INPUT_STICK_STEPS) return false;
  const flags = b[9] as number;
  if ((flags & ~FLAGS_ALL) !== 0) return false;
  const vt = getU32(b, 10);
  if (vt > VIEW_TICK_MAX + 1) return false;
  out.seq = getU32(b, 1);
  out.moveX = mx / INPUT_STICK_STEPS;
  out.moveY = my / INPUT_STICK_STEPS;
  out.aimX = ax / INPUT_STICK_STEPS;
  out.aimY = ay / INPUT_STICK_STEPS;
  out.fire = (flags & FLAG_FIRE) !== 0;
  out.swap = (flags & FLAG_SWAP) !== 0;
  out.consumable = (flags & FLAG_CONSUMABLE) !== 0;
  out.isMouse = (flags & FLAG_MOUSE) !== 0;
  out.viewTick = vt - 1;
  return true;
}

/**
 * Story 8.11 (AC 3): `input` rounded to what the server will decode (1/127 stick steps, u32 seq), in place, through
 * the real encoder and decoder (`scratch` ≥ INPUT_BYTES). The phone predicts with the result.
 */
export function quantizeInput(input: { -readonly [K in keyof PlayerInput]: PlayerInput[K] }, scratch: Uint8Array): void {
  encodeInput(input, scratch);
  decodeInput(scratch.length === INPUT_BYTES ? scratch : scratch.subarray(0, INPUT_BYTES), input);
}
