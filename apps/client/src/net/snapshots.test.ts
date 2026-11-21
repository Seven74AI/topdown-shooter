import { describe, expect, it } from "vitest";
import type { SimEvent } from "@topdown/shared";
import { SNAPSHOT_RING_SIZE, SnapshotRing, type SampledPose } from "./snapshots";
import { EventQueue } from "./eventQueue";
import { fakePlayer, fakeState } from "./fakeRoom";

const pose = (): SampledPose => ({ x: Number.NaN, y: Number.NaN, heading: Number.NaN });

describe("SnapshotRing", () => {
  it("interpolates between the two snapshots around the render tick", () => {
    const ring = new SnapshotRing();
    const s = fakeState([fakePlayer(0, { x: 10, y: 5, heading: 250 })]);
    s.tick = 10;
    ring.push(s);
    const p = s.players.get("p0");
    if (!p) throw new Error("no p0");
    p.x = 11; // copies, never references: changing the state later changes nothing stored
    p.y = 7;
    p.heading = 6;
    s.tick = 11;
    ring.push(s);
    p.x = 999;
    const out = pose();
    expect(ring.sample(0, 10.5, out)).toBe(true);
    expect(out.x).toBeCloseTo(10.5, 9);
    expect(out.y).toBeCloseTo(6, 9);
    expect(out.heading).toBeCloseTo(0, 9); // 250 → 6 the short way round
  });

  it("holds the oldest before the first and the newest past the last (no extrapolation)", () => {
    const ring = new SnapshotRing();
    const s = fakeState([fakePlayer(1, { x: 1 })]);
    s.tick = 5;
    ring.push(s);
    (s.players.get("p1") as { x: number }).x = 2;
    s.tick = 6;
    ring.push(s);
    const out = pose();
    ring.sample(1, 2, out);
    expect(out.x).toBe(1);
    ring.sample(1, 9, out);
    expect(out.x).toBe(2);
    expect(ring.sample(3, 5.5, out)).toBe(false); // nobody in slot 3
  });

  it("ignores ticks that are not newer and keeps the last 16", () => {
    const ring = new SnapshotRing();
    const s = fakeState([fakePlayer(0)]);
    for (let t = 1; t <= 20; t++) {
      s.tick = t;
      (s.players.get("p0") as { x: number }).x = t;
      ring.push(s);
    }
    s.tick = 20;
    (s.players.get("p0") as { x: number }).x = -1;
    ring.push(s); // same tick again: ignored
    expect(ring.size).toBe(SNAPSHOT_RING_SIZE);
    expect(ring.latestTick).toBe(20);
    const out = pose();
    ring.sample(0, 1, out);
    expect(out.x).toBe(5); // ticks 1–4 fell out
    ring.sample(0, 30, out);
    expect(out.x).toBe(20);
  });

  it("uses only snapshots that have the player (a joiner or leaver)", () => {
    const ring = new SnapshotRing();
    const s = fakeState([fakePlayer(0, { x: 0 })]);
    s.tick = 1;
    ring.push(s);
    s.players.set("p2", fakePlayer(2, { x: 50 }));
    s.tick = 2;
    ring.push(s);
    const out = pose();
    ring.sample(2, 1.5, out);
    expect(out.x).toBe(50);
  });
});

describe("EventQueue", () => {
  const ev = (n: number): SimEvent => ({ type: "wave.started", number: n, size: 1 });

  it("drains only events whose tick is at or before the render tick, in order", () => {
    const q = new EventQueue();
    q.push(10, ev(1));
    q.push(11, ev(2));
    q.push(12, ev(3));
    const out: SimEvent[] = [];
    expect(q.drain(11, out)).toBe(2);
    expect(out).toEqual([ev(1), ev(2)]);
    expect(q.drain(11.9, out)).toBe(0);
    expect(q.drain(12, out)).toBe(1);
    expect(out).toHaveLength(3);
    expect(q.size).toBe(0);
  });

  it("drops the oldest when full", () => {
    const q = new EventQueue(2);
    q.push(1, ev(1));
    q.push(2, ev(2));
    q.push(3, ev(3));
    expect(q.dropped).toBe(1);
    const out: SimEvent[] = [];
    q.drain(10, out);
    expect(out).toEqual([ev(2), ev(3)]);
  });
});
