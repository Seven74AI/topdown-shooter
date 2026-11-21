import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "./rateLimit";

function limiter(limit = 3, windowMs = 1000) {
  let now = 0;
  const l = new SlidingWindowLimiter(limit, windowMs, () => now);
  return { l, advance: (ms: number) => (now += ms) };
}

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit in the window, then refuses", () => {
    const { l } = limiter();
    expect([l.allow("a"), l.allow("a"), l.allow("a"), l.allow("a")]).toEqual([true, true, true, false]);
  });

  it("counts each key on its own", () => {
    const { l } = limiter(1);
    expect(l.allow("a")).toBe(true);
    expect(l.allow("a")).toBe(false);
    expect(l.allow("b")).toBe(true);
  });

  it("slides: an entry frees up exactly one window after it was made", () => {
    const { l, advance } = limiter(2, 1000);
    l.allow("a"); // t=0
    advance(500);
    l.allow("a"); // t=500
    expect(l.allow("a")).toBe(false);
    advance(499); // t=999: the t=0 entry is still inside
    expect(l.allow("a")).toBe(false);
    advance(1); // t=1000: the t=0 entry is out
    expect(l.allow("a")).toBe(true);
    expect(l.allow("a")).toBe(false);
  });

  it("does not count refused attempts", () => {
    const { l, advance } = limiter(1, 1000);
    l.allow("a");
    advance(900);
    expect(l.allow("a")).toBe(false);
    advance(100);
    expect(l.allow("a")).toBe(true);
  });

  it("prunes keys whose entries all expired", () => {
    const { l, advance } = limiter(1, 1000);
    l.allow("a");
    l.allow("b");
    expect(l.size).toBe(2);
    advance(1000);
    l.allow("c");
    expect(l.size).toBe(1);
  });

  it("reset forgets everything", () => {
    const { l } = limiter(1);
    l.allow("a");
    l.reset();
    expect(l.allow("a")).toBe(true);
  });
});
