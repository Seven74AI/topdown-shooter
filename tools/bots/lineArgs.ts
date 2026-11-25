/** Story 8.8 (AC 2): `npm run bots -- --lag --jitter --loss --stall` (tools/bots/run.ts), parsed here so it is testable. */
import { LAG_LINE_DEFAULT_STALL_MS } from "../netaudit/lagLine";
import { MAX_THROTTLE_JITTER_MS, MAX_THROTTLE_LAG_MS, MAX_THROTTLE_LOSS_PCT, MAX_THROTTLE_STALL_MS } from "../../apps/client/src/net/devThrottle";

export interface LineArgs {
  rttMs: number;
  jitterMs: number;
  lossPct: number;
  stallMs: number;
  /** Story 8.10 (T8): server→client cap in kbit/s (0 = none). */
  kbps: number;
}

/** Story 8.8 (review N2): the same caps as the client's `?lag` / `&jitter` / `&loss` / `&stall` (one place). */
const MAX_LINE_LOSS_PCT = MAX_THROTTLE_LOSS_PCT;
const MAX_LINE_STALL_MS = MAX_THROTTLE_STALL_MS;
const MAX_LINE_LAG_MS = MAX_THROTTLE_LAG_MS;
const MAX_LINE_JITTER_MS = MAX_THROTTLE_JITTER_MS;
/** Story 8.10: --kbps up to 100 Mbit/s. */
const MAX_LINE_KBPS = 100_000;

/**
 * Story 8.8 (review N2): the URL the bots use through the line on `port`: same scheme, path and host
 * name (an https://localhost certificate still matches), only `[::1]` becomes 127.0.0.1 (the line
 * listens on IPv4 loopback).
 */
export function lineUrl(url: string, port: number): string {
  const u = new URL(url);
  if (u.hostname === "[::1]") u.hostname = "127.0.0.1";
  u.port = String(port);
  return u.toString().replace(/\/$/, "");
}

/** Story 8.8: the line only fronts a server on this machine (a remote --url is refused). */
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  } catch {
    return false;
  }
}

/** Story 8.8: --lag/--jitter/--loss/--stall (+ 8.10 --kbps) → the line, or null when none of lag/jitter/loss/kbps is set. */
export function parseLine(get: (name: string) => string | undefined, url: string): LineArgs | null {
  const num = (name: string, max: number, d: number): number => {
    const raw = get(name);
    if (raw === undefined) return d;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > max) throw new Error(`--${name} must be 0–${max}`);
    return v;
  };
  const rttMs = num("lag", MAX_LINE_LAG_MS, 0);
  const jitterMs = num("jitter", MAX_LINE_JITTER_MS, 0);
  const lossPct = num("loss", MAX_LINE_LOSS_PCT, 0);
  const stallMs = num("stall", MAX_LINE_STALL_MS, LAG_LINE_DEFAULT_STALL_MS);
  const kbps = num("kbps", MAX_LINE_KBPS, 0);
  if (rttMs === 0 && jitterMs === 0 && lossPct === 0 && kbps === 0) return null;
  if (!isLocalUrl(url)) throw new Error(`--lag/--jitter/--loss/--kbps need a local --url (localhost or 127.0.0.1), not ${url}: the line runs on this machine in front of a local server`);
  return { rttMs, jitterMs, lossPct, stallMs, kbps };
}

