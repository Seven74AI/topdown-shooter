/** Story 8.8 (AC 2): `npm run bots -- --lag --jitter --loss --stall` (tools/bots/run.ts), parsed here so it is testable. */
import { LAG_LINE_DEFAULT_STALL_MS } from "../netaudit/lagLine";

export interface LineArgs {
  rttMs: number;
  jitterMs: number;
  lossPct: number;
  stallMs: number;
}

/** Story 8.8: largest --loss (%) and --stall (ms), like the client's `&loss` / `&stall`. */
const MAX_LINE_LOSS_PCT = 20;
const MAX_LINE_STALL_MS = 1000;
const MAX_LINE_LAG_MS = 2000;

/** Story 8.8: the line only fronts a server on this machine (a remote --url is refused). */
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  } catch {
    return false;
  }
}

/** Story 8.8: --lag/--jitter/--loss/--stall → the line, or null when none of the first three is set. */
export function parseLine(get: (name: string) => string | undefined, url: string): LineArgs | null {
  const num = (name: string, max: number, d: number): number => {
    const raw = get(name);
    if (raw === undefined) return d;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > max) throw new Error(`--${name} must be 0–${max}`);
    return v;
  };
  const rttMs = num("lag", MAX_LINE_LAG_MS, 0);
  const jitterMs = num("jitter", MAX_LINE_LAG_MS, 0);
  const lossPct = num("loss", MAX_LINE_LOSS_PCT, 0);
  const stallMs = num("stall", MAX_LINE_STALL_MS, LAG_LINE_DEFAULT_STALL_MS);
  if (rttMs === 0 && jitterMs === 0 && lossPct === 0) return null;
  if (!isLocalUrl(url)) throw new Error(`--lag/--jitter/--loss need a local --url (localhost or 127.0.0.1), not ${url}: the line runs on this machine in front of a local server`);
  return { rttMs, jitterMs, lossPct, stallMs };
}

