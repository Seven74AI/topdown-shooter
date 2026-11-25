/**
 * Story 7.6 (AC 2, 5; designer D10): the one-time recovery code: 12 characters from the Crockford base-32 alphabet
 * (`crypto.randomInt`: 60 bits), shown `ABCD-EFGH-JKMN`, stored only as an Argon2id hash. Input is case-insensitive
 * and dashes are optional (`normaliseRecoveryCode`, shared with the client).
 */
import { randomInt } from "node:crypto";
import { RECOVERY_ALPHABET, RECOVERY_CODE_LENGTH, formatRecoveryCode, normaliseRecoveryCode } from "@topdown/shared";

/** A new code, unformatted (`ABCDEFGHJKMN`). */
export function newRecoveryCode(): string {
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) out += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return out;
}

export { formatRecoveryCode, normaliseRecoveryCode };
