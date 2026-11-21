import { describe, expect, it } from "vitest";
import { assignSlot, hashGuestToken, nextHost } from "./lobby";

describe("assignSlot", () => {
  it("returns the lowest free slot", () => {
    expect(assignSlot([])).toBe(0);
    expect(assignSlot([0])).toBe(1);
    expect(assignSlot([0, 2])).toBe(1);
    expect(assignSlot([1, 2, 3])).toBe(0);
    expect(assignSlot(new Set([3, 0, 1]))).toBe(2);
  });

  it("returns -1 when all 4 slots are taken", () => {
    expect(assignSlot([0, 1, 2, 3])).toBe(-1);
    expect(assignSlot([3, 2, 1, 0])).toBe(-1);
  });
});

describe("nextHost", () => {
  it("picks the longest-connected member", () => {
    const members = [
      { slot: 2, joinOrder: 300 },
      { slot: 1, joinOrder: 100 },
      { slot: 3, joinOrder: 200 },
    ];
    expect(nextHost(members)?.slot).toBe(1);
  });

  it("breaks ties by join (iteration) order and handles an empty room", () => {
    const m = new Map([
      ["b", { slot: 3, joinOrder: 100 }],
      ["a", { slot: 1, joinOrder: 100 }],
    ]);
    expect(nextHost(m.values())?.slot).toBe(3);
    expect(nextHost([])).toBeUndefined();
  });
});

describe("hashGuestToken", () => {
  it("is hex SHA-256 and never the token itself", () => {
    const token = "0123456789abcdef0123456789abcdef";
    const h = hashGuestToken(token);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(token);
    expect(hashGuestToken(token)).toBe(h);
    expect(hashGuestToken("ffffffffffffffffffffffffffffffff")).not.toBe(h);
    // Known vector: SHA-256("abc").
    expect(hashGuestToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
