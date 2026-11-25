import { describe, expect, it } from "vitest";
import { PING_COOLDOWN_MS } from "@topdown/shared";
import { PING_WHEEL_OPEN_MS, closePingWheel, layoutPingWheel, newPingChipRects, newPingWheelState, pickPing, pingChipAt, pingCooldownFrac, stepPingWheel, togglePingWheel } from "./pingWheel";

/** Story 8.7 AC 3 / AC 4: the wheel opens and closes, sends one kind per pick, closes itself after 3 s, and keeps a 1 s cooldown. */
describe("ping wheel (Story 8.7)", () => {
  it("the button toggles it; a chip picks (latched for the scene), closes it and starts the 1 s cooldown ring", () => {
    const s = newPingWheelState();
    togglePingWheel(s, 1000);
    expect(s.open).toBe(true);
    togglePingWheel(s, 1100); // the button again: close
    expect(s.open).toBe(false);
    togglePingWheel(s, 1200);
    expect(pickPing(s, 2, 1300)).toBe(true);
    expect([s.pick, s.open]).toEqual([2, false]);
    expect(pingCooldownFrac(s, 1300)).toBe(1);
    expect(pingCooldownFrac(s, 1300 + PING_COOLDOWN_MS / 2)).toBeCloseTo(0.5);
    // honest players never hit the server's 1/s drop: the button ignores taps during the ring
    togglePingWheel(s, 1300 + PING_COOLDOWN_MS - 1);
    expect(s.open).toBe(false);
    togglePingWheel(s, 1300 + PING_COOLDOWN_MS);
    expect(s.open).toBe(true);
    expect(pingCooldownFrac(s, 1300 + PING_COOLDOWN_MS)).toBe(0);
  });

  it("a pick only while open and in range; never twice within the cooldown", () => {
    const s = newPingWheelState();
    expect(pickPing(s, 0, 0)).toBe(false); // closed
    togglePingWheel(s, 0);
    expect(pickPing(s, 4, 0)).toBe(false);
    expect(pickPing(s, -1, 0)).toBe(false);
    expect(pickPing(s, 3, 0)).toBe(true);
    s.open = true; // forced open (cannot happen through the button during the ring)
    expect(pickPing(s, 1, 500)).toBe(false);
  });

  it(`closes by itself after ${PING_WHEEL_OPEN_MS} ms, at once when the button hides (holding, reconnecting, out), and on a tap elsewhere / Esc`, () => {
    const s = newPingWheelState();
    togglePingWheel(s, 0);
    stepPingWheel(s, PING_WHEEL_OPEN_MS - 1, true);
    expect(s.open).toBe(true);
    stepPingWheel(s, PING_WHEEL_OPEN_MS, true);
    expect(s.open).toBe(false);
    togglePingWheel(s, 5000);
    stepPingWheel(s, 5016, false);
    expect(s.open).toBe(false);
    togglePingWheel(s, 6000);
    closePingWheel(s);
    expect(s.open).toBe(false);
  });

  it("chip hit test: each chip's centre hits it, the gaps and outside miss", () => {
    const chips = layoutPingWheel(640, { left: 44, right: 44, top: 0, bottom: 21 }, 1, newPingChipRects());
    chips.forEach((c, i) => expect(pingChipAt(chips, c.x + c.w / 2, c.y + c.h / 2)).toBe(i));
    const a = chips[0];
    const b = chips[1];
    expect(pingChipAt(chips, (a.x + b.x + b.w) / 2, a.y + a.h / 2)).toBe(-1); // the gap between the columns
    expect(pingChipAt(chips, 10, 10)).toBe(-1);
    // help top-right, here top-left, big under help, ready under here
    expect(a.x).toBeGreaterThan(b.x);
    expect(chips[2].y).toBeGreaterThan(a.y);
    expect(chips[2].x).toBe(a.x);
  });
});
