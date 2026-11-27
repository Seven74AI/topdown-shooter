/**
 * Story 10.12 (AC 1, 2; B4, B7, B9): who may use an online admin cheat, decided by the SERVER (never a client claim),
 * and the rate rule of the cheat log lines. Pure of Colyseus: the room owns one per run.
 *
 * - B7: a seat's answer is read once per run from the database (`findByTokenHash` of the seat's device token; the
 *   account must be the seat's own account and `isAdminAccount`), then cached. An `admin remove` takes effect for that
 *   seat at the next run. A failed read refuses, and is cached for `CHEAT_LOG_EVERY_MS` (review N2), then read again.
 * - B9: `DEV_ADMIN_CHEATS=1` lets any seat cheat on a dev server (ignored when `NODE_ENV=production`).
 * - B4: `admin_cheat_used` / `admin_cheat_refused` at most once per seat per 10 s per cheat kind.
 */
import { isAdminAccount, type AccountsRepo } from "../db/accountsRepo";

/** B4: one log line per seat, cheat kind and outcome per this many ms. */
export const CHEAT_LOG_EVERY_MS = 10_000;

/** What the gate reads of a seat. */
export interface CheatSeat {
  readonly seatId: string;
  readonly guestTokenHash: string;
  readonly accountId: string | null;
}

/** B9: the dev switch, read per call (tests set it); production always ignores it. */
export function devAdminCheats(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DEV_ADMIN_CHEATS === "1";
}

export class AdminCheatGate {
  private readonly answers = new Map<string, boolean | Promise<boolean>>();
  private readonly loggedAt = new Map<string, number>();
  /** Review N2: seats whose read failed, until when their "no" holds. */
  private readonly failedUntil = new Map<string, number>();

  constructor(
    private readonly repo: () => Pick<AccountsRepo, "findByTokenHash"> | null,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly nowMs: () => number = Date.now,
  ) {}

  /** The seat's cached answer (true / false), or the read in flight. */
  isAdmin(seat: CheatSeat): boolean | Promise<boolean> {
    const until = this.failedUntil.get(seat.seatId);
    if (until !== undefined && this.nowMs() >= until) {
      this.failedUntil.delete(seat.seatId);
      this.answers.delete(seat.seatId);
    }
    const known = this.answers.get(seat.seatId);
    if (known !== undefined) return known;
    if (devAdminCheats(this.env)) {
      this.answers.set(seat.seatId, true);
      return true;
    }
    const repo = this.repo();
    if (!repo || seat.accountId === null) {
      this.answers.set(seat.seatId, false); // a guest seat or no database: never an admin this run
      return false;
    }
    const accountId = seat.accountId;
    const read = repo.findByTokenHash(seat.guestTokenHash).then(
      (a) => {
        const ok = a !== null && a.id === accountId && isAdminAccount(a);
        this.answers.set(seat.seatId, ok);
        return ok;
      },
      () => {
        this.answers.set(seat.seatId, false); // review N2: a failed read refuses for 10 s, then reads again
        this.failedUntil.set(seat.seatId, this.nowMs() + CHEAT_LOG_EVERY_MS);
        return false;
      },
    );
    this.answers.set(seat.seatId, read);
    return read;
  }

  /** B4: true when this (seat, kind, outcome) line may be logged now (the first always). */
  shouldLog(seatId: string, kind: string, outcome: "used" | "refused"): boolean {
    const key = `${seatId}|${kind}|${outcome}`;
    const now = this.nowMs();
    const at = this.loggedAt.get(key);
    if (at !== undefined && now - at < CHEAT_LOG_EVERY_MS) return false;
    this.loggedAt.set(key, now);
    return true;
  }
}
