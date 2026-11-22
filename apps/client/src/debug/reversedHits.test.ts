import { describe, expect, it } from "vitest";
import { ReversedHits, hitsLine } from "./reversedHits";

const W = 500;
const net = (slot: number, gen: number) => slot | (gen << 8);

describe("ReversedHits (Story 2.7, AC 4)", () => {
  it("a server hit from me on the same net id confirms", () => {
    const r = new ReversedHits();
    r.apparent(net(3, 1), 0, W);
    r.serverHit(net(3, 1), 200, W);
    r.update(1000);
    expect(r.counts).toEqual({ apparentHits: 1, confirmed: 1, reversed: 0 });
  });

  it("an unconfirmed apparent hit past its deadline is reversed", () => {
    const r = new ReversedHits();
    r.apparent(net(3, 1), 0, W);
    r.update(W - 1);
    expect(r.counts.reversed).toBe(0);
    r.update(W + 1);
    expect(r.counts).toEqual({ apparentHits: 1, confirmed: 0, reversed: 1 });
    r.serverHit(net(3, 1), W + 2, W); // too late
    expect(r.counts.confirmed).toBe(0);
  });

  it("a hit on an unrelated zombie is ignored either way", () => {
    const r = new ReversedHits();
    r.apparent(net(3, 1), 0, W);
    r.serverHit(net(4, 1), 100, W);
    r.update(2000);
    expect(r.counts).toEqual({ apparentHits: 1, confirmed: 0, reversed: 1 });
  });

  it("a generation mismatch (reused slot) does not confirm", () => {
    const r = new ReversedHits();
    r.apparent(net(3, 2), 0, W);
    r.serverHit(net(3, 1), 100, W);
    r.update(2000);
    expect(r.counts.confirmed).toBe(0);
    expect(r.counts.reversed).toBe(1);
  });

  it("a server hit that arrives before my bullet reaches the drawn zombie still confirms", () => {
    const r = new ReversedHits();
    r.serverHit(net(5, 0), 0, W);
    r.apparent(net(5, 0), 120, W);
    r.update(2000);
    expect(r.counts).toEqual({ apparentHits: 1, confirmed: 1, reversed: 0 });
  });

  it("an early hit from one shot doesn't confirm another shot's apparent hit later (review LOW-1)", () => {
    const r = new ReversedHits();
    const early = 200; // one-way + render delay + slack
    r.serverHit(net(6, 0), 0, early); // shot A hit; A's bullet missed the drawn zombie
    r.apparent(net(6, 0), 600, W); // shot B, 600 ms later, looks like a hit
    r.update(2000);
    expect(r.counts).toEqual({ apparentHits: 1, confirmed: 0, reversed: 1 });
  });

  it("two bullets, one hit: one confirmed, one reversed (the oldest is confirmed)", () => {
    const r = new ReversedHits();
    r.apparent(net(1, 0), 0, W);
    r.apparent(net(1, 0), 100, W);
    r.serverHit(net(1, 0), 200, W);
    r.update(W + 50); // the first one's deadline is past, but it was confirmed
    expect(r.counts).toEqual({ apparentHits: 2, confirmed: 1, reversed: 0 });
    r.update(W + 150);
    expect(r.counts.reversed).toBe(1);
  });

  it("a zombie already dead on the server is not tracked, and pending ones on it are dropped", () => {
    const r = new ReversedHits();
    r.apparent(net(2, 0), 0, W);
    r.serverKilled(net(2, 0)); // a teammate's kill: the player sees it die
    r.apparent(net(2, 0), 50, W); // my next bullet crosses the still-drawn body
    r.update(2000);
    expect(r.counts).toEqual({ apparentHits: 1, confirmed: 0, reversed: 0 });
  });

  it("formats the overlay line", () => {
    expect(hitsLine({ apparentHits: 212, confirmed: 208, reversed: 4 })).toBe("hits 212 · reversed 4 (1.9%)");
    expect(hitsLine({ apparentHits: 0, confirmed: 0, reversed: 0 })).toBe("hits 0 · reversed 0 (0.0%)");
  });
});
