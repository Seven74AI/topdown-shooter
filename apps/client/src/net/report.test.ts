import type { ReportPayload } from "@topdown/shared";
import { describe, expect, it, vi } from "vitest";
import { REPORT_MAX_BYTES } from "@topdown/shared";
import { REPORT_FAIL_TEXT, fitBody, sendReport } from "./report";

/** Story 10.6 (AC 4): what the client does with each answer of `POST /api/account/report`. */
const payload: ReportPayload = { lines: ["a"], device: { userAgent: "t", screen: { w: 1, h: 1 }, viewport: { w: 1, h: 1 }, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, input: "touch", language: "en", installed: false } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const deps = (answers: Response[] | (() => Promise<Response>)) => {
  const fetch = vi.fn(typeof answers === "function" ? answers : async () => answers.shift() as Response);
  const session = vi.fn(async () => null);
  return { fetch: fetch as unknown as typeof globalThis.fetch, url: () => "/api/account/report", session, timeoutMs: 1000, calls: fetch, sessions: session };
};

describe("sendReport (Story 10.6)", () => {
  it("200 → sent with the code; the body is { note, payload }, same-origin credentials", async () => {
    const d = deps([json(200, { ok: true, code: "K7QF" })]);
    expect(await sendReport("hi", d, payload)).toEqual({ kind: "sent", code: "K7QF" });
    const [url, init] = d.calls.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/account/report");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ note: "hi", payload });
  });

  it("401 → fetches a session once, then sends again", async () => {
    const d = deps([json(401, { message: "no_account" }), json(200, { ok: true, code: "AB23" })]);
    expect(await sendReport("", d, payload)).toEqual({ kind: "sent", code: "AB23" });
    expect(d.sessions).toHaveBeenCalledTimes(1);
    expect(d.calls).toHaveBeenCalledTimes(2);
  });

  it("429 → 'Too many reports, try again later'; 503, 400, offline and a bad reply → 'Couldn't send. Try again later.'", async () => {
    expect(await sendReport("", deps([json(429, { message: "rate_limited" })]), payload)).toEqual({ kind: "failed", text: REPORT_FAIL_TEXT.limited });
    expect(REPORT_FAIL_TEXT.limited).toBe("Too many reports, try again later");
    expect(REPORT_FAIL_TEXT.offline).toBe("Couldn't send. Try again later.");
    for (const r of [json(503, { message: "save_unavailable" }), json(400, {}), json(200, { ok: true, code: "nope" }), json(401, {})]) {
      const answers = [r, json(401, {})];
      expect(await sendReport("", deps(answers), payload)).toEqual({ kind: "failed", text: REPORT_FAIL_TEXT.offline });
    }
    expect(await sendReport("", deps(() => Promise.reject(new TypeError("Failed to fetch"))), payload)).toEqual({ kind: "failed", text: REPORT_FAIL_TEXT.offline });
  });

  it("the note is cut to 500 characters", async () => {
    const d = deps([json(200, { ok: true, code: "K7QF" })]);
    await sendReport("x".repeat(600), d, payload);
    const init = (d.calls.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((JSON.parse(init.body as string) as { note: string }).note).toHaveLength(500);
  });

  it("review L2: a body over 64 KB drops the OLDEST log lines until it fits (the newest stay)", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `${String(i).padStart(3, "0")} ${"é".repeat(290)}`); // 2-byte chars: ~118 KB
    const body = fitBody("n".repeat(500), { ...payload, lines });
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(REPORT_MAX_BYTES);
    const kept = (JSON.parse(body) as { payload: { lines: string[] } }).payload.lines;
    expect(kept.length).toBeGreaterThan(50);
    expect(kept.length).toBeLessThan(200);
    expect(kept.at(-1)).toBe(lines.at(-1)); // the newest line stays
    expect(kept[0]).toBe(lines[200 - kept.length]); // only a prefix went
    expect(fitBody("", payload)).toBe(JSON.stringify({ note: "", payload })); // a small body is untouched
  });
});
