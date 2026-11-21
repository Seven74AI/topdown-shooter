import { describe, expect, it } from "vitest";
import { TokenBucket } from "./tokenBucket";

const takeN = (b: TokenBucket, n: number, nowMs: number): number => {
  let ok = 0;
  for (let i = 0; i < n; i++) if (b.take(nowMs)) ok++;
  return ok;
};

describe("TokenBucket", () => {
  it("accepts a full burst of 25, then drops the 26th", () => {
    const b = new TokenBucket(25, 25, 0);
    expect(takeN(b, 25, 0)).toBe(25);
    expect(b.take(0)).toBe(false);
  });

  it("refills one token per 40 ms at 25/s", () => {
    const b = new TokenBucket(25, 25, 0);
    takeN(b, 25, 0);
    expect(b.take(39)).toBe(false);
    expect(b.take(40)).toBe(true);
    expect(b.take(40)).toBe(false);
  });

  it("accepts the burst after a 1 s stall (bucket, not a window)", () => {
    const b = new TokenBucket(25, 25, 0);
    for (let t = 0; t < 1000; t += 50) b.take(t); // steady 20/s
    expect(takeN(b, 20, 2000)).toBe(20);
  });

  it("never holds more than its capacity", () => {
    const b = new TokenBucket(10, 10, 0);
    expect(takeN(b, 20, 60_000)).toBe(10);
  });

  it("ignores a clock that goes backwards", () => {
    const b = new TokenBucket(2, 1, 1000);
    takeN(b, 2, 1000);
    expect(b.take(500)).toBe(false);
    expect(b.take(2000)).toBe(true);
  });
});
