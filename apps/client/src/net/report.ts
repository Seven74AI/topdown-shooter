/**
 * Story 10.6 (AC 3, 4; B1, B7): "Report a problem". Collects the payload (the ring buffer's lines, the run context,
 * device and browser info) and posts it to `POST /api/account/report` with the session cookie. Never throws; never
 * blocks a menu or a run (one fetch, 8 s timeout).
 */
import {
  ACCOUNT_REPORT_PATH,
  NET_PROTOCOL_VERSION,
  REPORT_NOTE_MAX,
  reportResponseSchema,
  type ReportDevice,
  type ReportPayload,
} from "@topdown/shared";
import { clientLog, reportProbes, runContext, type ClientLog } from "../debug/clientLog";
import { serverUrl } from "./serverUrl";
import { accountSession } from "./account";
import { getSettings } from "../settings/settings";
import { gfxStatus } from "../render/gfx/gfxStatus";

export const REPORT_TIMEOUT_MS = 8000;

export type ReportCall = { kind: "sent"; code: string } | { kind: "failed"; text: string };

export const REPORT_FAIL_TEXT = {
  limited: "Too many reports, try again later",
  offline: "Couldn't send. Try again later.",
} as const;

/** The 10.1 settings that change rendering (quality fields only, AC 3). */
const QUALITY_KEYS = ["rain", "fog", "glow", "filmGrain", "gore", "showPerformance"] as const;

const px = (v: string): number => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function safeArea(): ReportDevice["safeArea"] {
  if (typeof document === "undefined" || !document.body) return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  return out;
}

export function collectDevice(): ReportDevice {
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string; mobile?: boolean } };
  const uad = nav.userAgentData;
  const s = getSettings();
  const quality: Record<string, string | number | boolean> = {};
  for (const k of QUALITY_KEYS) quality[k] = s[k];
  const device: ReportDevice = {
    userAgent: nav.userAgent.slice(0, 400),
    screen: { w: screen.width, h: screen.height },
    viewport: { w: innerWidth, h: innerHeight },
    dpr: devicePixelRatio || 1,
    safeArea: safeArea(),
    input: matchMedia("(pointer: coarse)").matches ? "touch" : "mouse",
    gfxTier: gfxStatus.line().slice(0, 40),
    language: (nav.language ?? "").slice(0, 40),
    installed: matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches,
    quality,
  };
  if (uad?.brands) device.brands = uad.brands.slice(0, 8).map((b) => `${b.brand} ${b.version}`.slice(0, 80));
  if (uad?.platform) device.platform = uad.platform.slice(0, 40);
  if (uad?.mobile !== undefined) device.mobile = uad.mobile;
  const renderer = reportProbes.renderer();
  if (renderer) device.renderer = renderer;
  return device;
}

export function collectPayload(log: ClientLog = clientLog): ReportPayload {
  const p: ReportPayload = { lines: log.lines(), protocol: NET_PROTOCOL_VERSION, device: collectDevice() };
  const c = runContext;
  if (c.roomId) p.roomId = c.roomId.slice(0, 64);
  if (c.phase) p.phase = c.phase.slice(0, 32);
  const run = reportProbes.run();
  if (run) {
    p.runSeed = Math.trunc(run.seed);
    p.wave = Math.max(0, Math.min(10_000, Math.trunc(run.wave)));
  }
  const build = import.meta.env.MODE;
  if (typeof build === "string") p.build = build.slice(0, 64);
  return p;
}

export interface ReportDeps {
  fetch: typeof fetch;
  url: () => string;
  /** Makes sure the phone has a session cookie first (as Create / Join do). */
  session: () => Promise<unknown>;
  timeoutMs: number;
}

const defaults = (): ReportDeps => ({
  fetch: (...args) => globalThis.fetch(...args),
  url: () => `${serverUrl()}${ACCOUNT_REPORT_PATH}`,
  session: () => accountSession(),
  timeoutMs: REPORT_TIMEOUT_MS,
});

export async function sendReport(note: string, over: Partial<ReportDeps> = {}, payload: ReportPayload = collectPayload()): Promise<ReportCall> {
  const deps = { ...defaults(), ...over };
  const body = JSON.stringify({ note: note.slice(0, REPORT_NOTE_MAX), payload });
  const post = async (): Promise<Response> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
    try {
      return await deps.fetch(deps.url(), { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body, signal: abort.signal });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let res = await post();
    if (res.status === 401) {
      // B3: no cookie yet (or a stale one): fetch a session, then try once more.
      await deps.session();
      res = await post();
    }
    if (res.status === 429) return { kind: "failed", text: REPORT_FAIL_TEXT.limited };
    if (!res.ok) return { kind: "failed", text: REPORT_FAIL_TEXT.offline };
    const parsed = reportResponseSchema.safeParse(await res.json());
    return parsed.success ? { kind: "sent", code: parsed.data.code } : { kind: "failed", text: REPORT_FAIL_TEXT.offline };
  } catch {
    return { kind: "failed", text: REPORT_FAIL_TEXT.offline };
  }
}
