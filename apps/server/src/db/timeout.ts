import { log } from "../ops/logger";

/** Story 7.1 AC 9: every repository call gives up after this long (the caller then plays unsaved). */
export const DB_TIMEOUT_MS = 2000;

/** A repository call failed or timed out; callers treat it as "the save server is down" (P3). */
export class DbUnavailableError extends Error {
  constructor(
    readonly op: string,
    readonly reason: "timeout" | "error",
  ) {
    super(`db ${op}: ${reason}`);
    this.name = "DbUnavailableError";
  }
}

/**
 * Runs one repository operation with a timeout. A failure or timeout is logged once as `db_error {op}` at `error`
 * level (never the arguments: they may hold token hashes) and rethrown as `DbUnavailableError`.
 */
export async function withDbTimeout<T>(op: string, run: () => Promise<T>, timeoutMs = DB_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DbUnavailableError(op, "timeout")), timeoutMs);
  });
  try {
    return await Promise.race([run(), timeout]);
  } catch (e) {
    const reason = e instanceof DbUnavailableError ? e.reason : "error";
    log.error({ op, reason, err: e instanceof DbUnavailableError ? undefined : errMessage(e) }, "db_error");
    throw e instanceof DbUnavailableError ? e : new DbUnavailableError(op, "error");
  } finally {
    clearTimeout(timer);
  }
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
}
