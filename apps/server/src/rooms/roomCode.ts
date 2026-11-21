import { randomInt as cryptoRandomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@topdown/shared";

/** Codes tried before giving up (24^4 ≈ 330k codes, so a retry is already rare). */
export const MAX_ROOM_CODE_TRIES = 20;

/** A uniform integer in [0, max). Defaults to `crypto.randomInt`. */
export type RandomInt = (max: number) => number;

/** One random room code. */
export function generateRoomCode(randomInt: RandomInt = cryptoRandomInt): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** A random room code for which `exists` is false; throws after `MAX_ROOM_CODE_TRIES` collisions. */
export function uniqueRoomCode(exists: (code: string) => boolean, randomInt: RandomInt = cryptoRandomInt): string {
  for (let i = 0; i < MAX_ROOM_CODE_TRIES; i++) {
    const code = generateRoomCode(randomInt);
    if (!exists(code)) return code;
  }
  throw new Error(`no free room code after ${MAX_ROOM_CODE_TRIES} tries`);
}
