/**
 * Story 7.10 (AC 8, 11; E2; brief 15, 18, 21, 23): saving my survivor look from the editor.
 *
 * - The account comes from the guest cookie only (never an id in the body).
 * - The look is decoded against what the account OWNS, read from the locked progress row inside the save transaction
 *   (`ownedParts(row.cosmetics)`: starter parts, plus 7.11's items once the row carries them). An unowned or unknown
 *   part becomes that slot's default part; the server stores the CANONICAL code it decoded, never the request text
 *   (7.9 L2). The default look is stored as null (7.6's merge reads null as "never customised").
 * - 10 saves per account per minute (429), 60 calls per IP per minute before the body or the database is read.
 * - Logs `look_saved {accountId, replaced}`; never a token or a cookie.
 */
import { DEFAULT_LOOK, decodeLook, encodeLook, guestTokenSchema, ownedParts } from "@topdown/shared";
import type { AccountsRepo } from "../db/accountsRepo";
import { KEEP_LOOK, type Progress, type ProgressRepo } from "../db/progressRepo";
import { ipKey, type SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";

export interface LookDeps {
  accounts: AccountsRepo;
  progress: ProgressRepo;
  ipLimiter: SlidingWindowLimiter;
  accountLimiter: SlidingWindowLimiter;
  logGate: SlidingWindowLimiter;
}

export type LookOutcome =
  | { status: 200; body: { ok: true; look: string | null; stale?: true } }
  | { status: 401 | 429 | 503; error: "no_account" | "rate_limited" | "save_unavailable" };

const DEFAULT_CODE = encodeLook(DEFAULT_LOOK);

/** The parts this progress row may wear: the starter parts plus the row's owned milestone / loot items (7.11 / 7.12 `cosmetics`). */
export function ownedFor(row: Progress): ReadonlySet<string> {
  return ownedParts(Array.isArray(row.cosmetics) ? row.cosmetics : undefined);
}

/** What is stored for a requested code and an owned set: the canonical code, or null for the default look. */
export function canonicalLook(requested: string, owned: ReadonlySet<string>): { look: string | null; replaced: number } {
  const d = decodeLook(requested, owned);
  const code = encodeLook(d.look);
  return { look: code === DEFAULT_CODE ? null : code, replaced: d.replaced };
}

/** The per-IP limit, first thing in the route (before the body is parsed or the database is touched). */
export function lookIpAllowed(ip: string, deps: Pick<LookDeps, "ipLimiter" | "logGate">): boolean {
  if (deps.ipLimiter.allow(ip)) return true;
  if (deps.logGate.allow(`look:${ipKey(ip)}`)) log.warn({ ip }, "look_rate_limited");
  return false;
}

/**
 * `base` (review L2): the stored look the save was edited from (undefined = none sent: the last Done wins). When given,
 * the look is stored only if the locked row still holds `base`; else the newer stored look is kept and answered `stale`.
 */
export async function saveLook(input: { cookieToken: string | null | undefined; look: string; base?: string | null | undefined }, deps: LookDeps): Promise<LookOutcome> {
  const token = guestTokenSchema.safeParse(input.cookieToken);
  if (!token.success) return { status: 401, error: "no_account" };
  let accountId: string;
  try {
    const account = await deps.accounts.findByTokenHash(hashGuestToken(token.data));
    if (account === null) return { status: 401, error: "no_account" };
    accountId = account.id;
  } catch {
    return { status: 503, error: "save_unavailable" };
  }
  if (!deps.accountLimiter.allow(accountId)) {
    if (deps.logGate.allow(`look:${accountId}`)) log.warn({ accountId }, "look_rate_limited");
    return { status: 429, error: "rate_limited" };
  }
  try {
    let replaced = 0;
    const out = await deps.progress.saveLook(accountId, (row) => {
      if (input.base !== undefined && row.look !== input.base) return KEEP_LOOK;
      const c = canonicalLook(input.look, ownedFor(row));
      replaced = c.replaced;
      return c.look;
    });
    if (!out.written) {
      log.info({ accountId }, "look_save_stale");
      return { status: 200, body: { ok: true, look: out.look, stale: true } };
    }
    log.info({ accountId, replaced }, "look_saved");
    return { status: 200, body: { ok: true, look: out.look } };
  } catch {
    return { status: 503, error: "save_unavailable" }; // logged as db_error by the repository
  }
}
