import { describe, expect, it } from "vitest";
import { READY_PENDING_MS, ReadyRequest } from "./readyRequest";

describe("ReadyRequest (Story 3.1 review)", () => {
  it("shows a tap at once, then follows the server once it agrees", () => {
    const r = new ReadyRequest();
    expect(r.update("build", 0, false, 0)).toBe(false);
    expect(r.tap(false, 10)).toBe(true);
    expect(r.update("build", 0, false, 20)).toBe(true); // pending
    expect(r.update("build", 0, true, 300)).toBe(true); // confirmed
    expect(r.tap(true, 400)).toBe(false); // un-Ready
    expect(r.update("build", 0, true, 410)).toBe(false);
  });

  it("a hidden tab sleeping across build → wave → build: the old Ready is void, one tap sends Ready", () => {
    const r = new ReadyRequest();
    r.update("build", 0, false, 0);
    r.tap(false, 10);
    r.update("build", 0, true, 300);
    // Asleep: the wave ran and the next build started. First frame after wake: build of wave 1, server not ready.
    expect(r.update("build", 1, false, 60_000)).toBe(false);
    expect(r.tap(false, 60_010)).toBe(true); // Ready, not "un-Ready"
  });

  it("a request the server never got falls back to the server's value", () => {
    const r = new ReadyRequest();
    r.update("build", 0, false, 0);
    r.tap(false, 0);
    expect(r.update("build", 0, false, READY_PENDING_MS)).toBe(true);
    expect(r.update("build", 0, false, READY_PENDING_MS + 1)).toBe(false);
    expect(r.tap(false, READY_PENDING_MS + 2)).toBe(true);
  });
});
