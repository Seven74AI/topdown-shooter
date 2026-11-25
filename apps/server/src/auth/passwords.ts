/**
 * Story 7.6 (AC 2, A3; decision 7.6 D4; brief 19): passwords and recovery codes are stored only as Argon2id hashes,
 * OWASP minimum (19 MiB, 2 passes, 1 lane). `@node-rs/argon2`'s async API runs on the libuv thread pool, never on the
 * room tick. A missing account still runs one verify against a fixed dummy hash, so "no such name" is not faster than
 * "wrong password" (A3). Never logs a password, a code or a hash.
 */
import { hash, verify } from "@node-rs/argon2";
import { ARGON2_LANES, ARGON2_MEMORY_KIB, ARGON2_PASSES } from "../net/limits";

/** `Algorithm.Argon2id` (a `const enum` in the package's types: spelled out for isolated modules). */
const ARGON2ID = 2;

export const ARGON2_OPTIONS = { algorithm: ARGON2ID, memoryCost: ARGON2_MEMORY_KIB, timeCost: ARGON2_PASSES, parallelism: ARGON2_LANES } as const;

/** An Argon2id PHC string (`$argon2id$v=19$m=19456,t=2,p=1$…`). */
export function hashSecret(secret: string): Promise<string> {
  return hash(secret, ARGON2_OPTIONS);
}

let verifies = 0;
/** Tests (A3 timing): how many Argon2 verifies ran in this process (a missing name must still run one). */
export function verifyCount(): number {
  return verifies;
}

/** The dummy hash a missing account is verified against (same cost; made once per process, off the tick). */
let dummy: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummy ??= hashSecret(`dummy-${Math.random()}-${Date.now()}`);
  return dummy;
}

/**
 * True only for a stored hash that matches. `stored` null (no such account, or no password yet) still pays one full
 * verify. A malformed stored value is "no match" (never throws).
 */
export async function verifySecret(stored: string | null, secret: string): Promise<boolean> {
  try {
    if (stored === null) {
      const d = await dummyHash();
      verifies++;
      await verify(d, secret);
      return false;
    }
    verifies++;
    return await verify(stored, secret);
  } catch {
    return false;
  }
}
