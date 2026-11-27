import { REPORT_LINE_MAX, REPORT_LINES_MAX } from "@topdown/shared";
import { describe, expect, it, vi } from "vitest";
import { ClientLog, errorText, installClientLog } from "./clientLog";

/** Story 10.6 (AC 1; B6): the report ring buffer. */
describe("ClientLog (Story 10.6 B6)", () => {
  it("450 pushes → exactly the last 200, oldest first, each ≤ 300 characters", () => {
    const log = new ClientLog();
    for (let i = 0; i < 450; i++) log.push("info", `line ${i} ${"x".repeat(i % 7 === 0 ? 400 : 10)}`, Date.UTC(2026, 10, 27, 12, 0, 0, i));
    const lines = log.lines();
    expect(log.size).toBe(REPORT_LINES_MAX);
    expect(lines).toHaveLength(REPORT_LINES_MAX);
    lines.forEach((l, k) => {
      expect(l).toMatch(new RegExp(`^\\d\\d:\\d\\d:\\d\\d\\.\\d{3} info line ${250 + k} `));
      expect(l.length).toBeLessThanOrEqual(REPORT_LINE_MAX);
    });
    expect(lines.some((l) => l.length === REPORT_LINE_MAX)).toBe(true); // the 400-char ones were cut
  });

  it("review M1: a line cut at 300 never ends in half an emoji", () => {
    const log = new ClientLog();
    const text = "x".repeat(300 - 13 - 6) + "😀😀"; // the stamp + level prefix is 18 chars: the first emoji straddles 300
    log.push("info", text, 0);
    const line = log.lines()[0]!;
    expect(line.length).toBeLessThanOrEqual(300);
    expect(/[\uD800-\uDBFF]$/.test(line)).toBe(false);
  });

  it("under capacity: only what was pushed, in order; clear() empties it", () => {
    const log = new ClientLog(5);
    log.push("warn", "a");
    log.note("phase", { phase: "wave", wave: 3 });
    expect(log.lines().map((l) => l.slice(13))).toEqual(["warn a", "note phase phase=wave wave=3"]);
    log.clear();
    expect(log.lines()).toEqual([]);
  });

  it("the slots are allocated once (no growth)", () => {
    const log = new ClientLog(3);
    const slots = (log as unknown as { slots: string[] }).slots;
    for (let i = 0; i < 10; i++) log.push("info", String(i));
    expect((log as unknown as { slots: string[] }).slots).toBe(slots);
    expect(slots).toHaveLength(3);
  });

  it("wrapping console keeps the original output; info / warn / error each land as one line", () => {
    const log = new ClientLog();
    const seen: unknown[][] = [];
    const con = { info: (...a: unknown[]) => seen.push(["info", ...a]), warn: (...a: unknown[]) => seen.push(["warn", ...a]), error: (...a: unknown[]) => seen.push(["error", ...a]) };
    installClientLog(log, con, undefined);
    con.info("hello", { a: 1 });
    con.warn("texture rebuild failed: x");
    con.error(new Error("boom"));
    expect(seen.map((s) => s[0])).toEqual(["info", "warn", "error"]);
    expect(seen[0]).toEqual(["info", "hello", { a: 1 }]);
    const lines = log.lines().map((l) => l.slice(13));
    expect(lines[0]).toBe('info hello {"a":1}');
    expect(lines[1]).toBe("warn texture rebuild failed: x");
    expect(lines[2]).toMatch(/^error Error: boom/);
  });

  it("a window error (e.g. thrown in a Preact handler) and an unhandled rejection each land as one line", () => {
    const log = new ClientLog();
    const handlers = new Map<string, (e: Event) => void>();
    const win = { addEventListener: (t: string, h: (e: Event) => void) => void handlers.set(t, h) } as unknown as Parameters<typeof installClientLog>[2];
    installClientLog(log, { info: () => {}, warn: () => {}, error: () => {} }, win);
    const err = new TypeError("Cannot read properties of undefined");
    err.stack = "TypeError: Cannot read properties of undefined\n    at onClick (Shop.tsx:10)\n    at a (b.js:1)\n    at c (d.js:2)\n    at e (f.js:3)";
    handlers.get("error")!({ error: err, message: err.message } as unknown as Event);
    handlers.get("unhandledrejection")!({ reason: new Error("fetch failed") } as unknown as Event);
    const lines = log.lines().map((l) => l.slice(13));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("error TypeError: Cannot read properties of undefined | at onClick (Shop.tsx:10) | at a (b.js:1) | at c (d.js:2)");
    expect(lines[1]).toMatch(/^error unhandledrejection Error: fetch failed/);
  });

  it("errorText of a non-Error is its string", () => {
    expect(errorText("plain")).toBe("plain");
    expect(errorText(42)).toBe("42");
  });

  it("a console argument that can't be stringified never breaks the call", () => {
    const log = new ClientLog();
    const original = vi.fn();
    const con = { info: original, warn: original, error: original };
    installClientLog(log, con, undefined);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    con.warn("x", cyclic);
    expect(original).toHaveBeenCalledTimes(1);
    expect(log.size).toBe(1);
  });
});
