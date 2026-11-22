import { describe, expect, it } from "vitest";
import { loadBalance } from "./balance";
import { devBalanceOverrides, loadDevBalance, parseDevScale, parseDevWallet } from "./devBalance";

describe("dev balance switch (Epic 2 retro A5)", () => {
  it("parses a scale, rejecting junk and out-of-range values", () => {
    expect(parseDevScale("0.1")).toBe(0.1);
    expect(parseDevScale(" 0 ")).toBe(0);
    expect(parseDevScale("2")).toBe(2);
    for (const bad of [null, undefined, "", "-1", "abc", "11", "1e3"]) expect(parseDevScale(bad)).toBeNull();
  });

  it("scales every zombie type's damage, and both sides building it get the same version", () => {
    const base = loadBalance();
    const a = loadDevBalance({ zombieDamageScale: 0.1 });
    const b = loadDevBalance({ zombieDamageScale: 0.1 });
    for (const [id, t] of Object.entries(base.zombies.types)) expect(a.zombies.types[id]?.damage).toBeCloseTo(t.damage * 0.1, 9);
    expect(a.version).toBe(b.version);
    expect(a.version).not.toBe(base.version);
  });

  it("no switch (null or 1) is exactly the bundled balance", () => {
    expect(devBalanceOverrides({ zombieDamageScale: null })).toEqual([]);
    expect(loadDevBalance({ zombieDamageScale: 1 }).version).toBe(loadBalance().version);
  });

  it("Story 3.3: a dev starting wallet changes only economy.startingWallet, the same on both sides", () => {
    expect(parseDevWallet("2000")).toBe(2000);
    for (const bad of [null, undefined, "", "-1", "1.5", "abc", "100001"]) expect(parseDevWallet(bad)).toBeNull();
    const a = loadDevBalance({ zombieDamageScale: null, startingWallet: 2000 });
    expect(a.economy.startingWallet).toBe(2000);
    expect(a.version).toBe(loadDevBalance({ zombieDamageScale: null, startingWallet: 2000 }).version);
    expect(a.version).not.toBe(loadBalance().version);
    expect(loadDevBalance({ zombieDamageScale: null, startingWallet: null }).version).toBe(loadBalance().version);
  });
});
