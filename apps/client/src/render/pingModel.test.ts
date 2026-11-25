import { describe, expect, it } from "vitest";
import { PING_KINDS, PING_SHOW_MS } from "@topdown/shared";
import { PingModel, unwrapTick16 } from "./pingModel";

/** Story 8.7 AC 6 / P2 / P3: the client's ping store (4 slots, 4 s, one live ping per player, late pings not shown). */
describe("PingModel (Story 8.7)", () => {
  it("shows a ping for 4,000 ms of the clock, then expires it; reports the start once (the sound)", () => {
    const m = new PingModel();
    m.receive([2, 1, 105, 72, 400], 1000);
    expect(m.update(1000, 400)).toBe(1 << 2);
    expect(m.live(2)).toMatchObject({ kind: 1, x: 10.5, y: 7.2, startMs: 1000 });
    expect(m.update(1016, 400.3)).toBe(0); // started once
    m.update(1000 + PING_SHOW_MS - 1, 480);
    expect(m.live(2)).not.toBeNull();
    m.update(1000 + PING_SHOW_MS, 480);
    expect(m.live(2)).toBeNull();
  });

  it("P2: a new ping replaces the old one of the same player (one live ping per player); others keep theirs", () => {
    const m = new PingModel();
    m.receive([0, 0, 10, 10, 100], 0);
    m.receive([1, 3, 50, 50, 100], 0);
    m.update(0, 100);
    m.receive([0, 2, 90, 90, 120], 1000);
    expect(m.update(1000, 120)).toBe(1);
    expect(m.live(0)).toMatchObject({ kind: 2, x: 9, startMs: 1000 });
    expect(m.live(1)).toMatchObject({ kind: 3, startMs: 0 });
    // two in one frame from the same slot: the newest wins
    m.receive([3, 0, 10, 10, 200], 2000);
    m.receive([3, 1, 20, 20, 201], 2001);
    m.update(2010, 201);
    expect(m.live(3)).toMatchObject({ kind: 1, x: 2 });
  });

  it("AC 6: a ping more than 4 s late (a hidden tab waking, by its server tick or its wait in the inbox) is not shown; a younger one shows only for what is left", () => {
    const m = new PingModel();
    m.receive([1, 0, 3, 3, 100], 0);
    expect(m.update(50, 100 + 10 * 20)).toBe(0); // 10 s old by the server tick
    expect(m.live(1)).toBeNull();
    expect(m.staleDropped).toBe(1);
    m.receive([1, 0, 3, 3, 400], 1000);
    expect(m.update(1000 + 10_000, 0)).toBe(0); // tick unknown; waited 10 s in the inbox
    expect(m.staleDropped).toBe(2);
    m.receive([1, 0, 3, 3, 400], 20_000);
    expect(m.update(20_000, 400 + 3 * 20)).toBe(2); // 3 s old: shows for the last second
    m.update(20_000 + 999, 0);
    expect(m.live(1)).not.toBeNull();
    m.update(20_000 + 1000, 0);
    expect(m.live(1)).toBeNull();
  });

  it("review L1: the 16-bit wire tick is unwrapped against the host's tick estimate (a run past tick 65535; a late ping still dropped)", () => {
    expect(unwrapTick16(70_000 & 0xffff, 70_010)).toBe(70_000);
    expect(unwrapTick16(65_530, 65_540)).toBe(65_530); // estimate already wrapped past 65536, the ping not
    expect(unwrapTick16(5, 65_530)).toBe(65_541); // the ping is a hair ahead of the estimate, across the wrap
    const m = new PingModel();
    m.receive([0, 0, 10, 10, 200_000 & 0xffff], 0);
    expect(m.update(0, 200_000 + 3)).toBe(1); // fresh: shown
    m.receive([1, 0, 10, 10, 200_000 & 0xffff], 0);
    expect(m.update(0, 200_000 + 10 * 20)).toBe(0); // 10 s late past the wrap: not shown
  });

  it("ignores malformed payloads (slot, kind, position, tick)", () => {
    const m = new PingModel();
    for (const bad of [null, {}, [0, 0, 1, 1], [4, 0, 1, 1, 1], [-1, 0, 1, 1, 1], [0, PING_KINDS.length, 1, 1, 1], [0, 0.5, 1, 1, 1], [0, 0, Number.NaN, 1, 1], [0, 0, 1.5, 1, 1], [0, 0, 1, "1", 1], [0, 0, 1, 1, -3], [0, 0, 1, 1, 65536]]) m.receive(bad, 0);
    expect(m.update(0, 1)).toBe(0);
    for (let i = 0; i < 4; i++) expect(m.live(i)).toBeNull();
  });

  it("clears a slot (player left) and everything (lobby / results), pending ones too", () => {
    const m = new PingModel();
    m.receive([0, 0, 1, 1, 1], 0);
    m.receive([1, 0, 1, 1, 1], 0);
    m.update(0, 1);
    m.receive([2, 0, 1, 1, 1], 0);
    m.clearSlot(0);
    expect(m.live(0)).toBeNull();
    expect(m.live(1)).not.toBeNull();
    m.clearAll();
    expect(m.update(1, 1)).toBe(0);
    for (let i = 0; i < 4; i++) expect(m.live(i)).toBeNull();
  });
});
