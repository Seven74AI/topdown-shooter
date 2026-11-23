import { loadDevBalance } from "@topdown/shared";
import { describe, expect, it } from "vitest";
import { soloOverrides } from "./clientBalance";

describe("solo ?wallet in release builds (designer 2026-11-23)", () => {
  const both = { zombieDamageScale: 0.5, startingWallet: 2000 };

  it("release solo keeps ?wallet but drops ?zdmg; dev keeps both", () => {
    expect(soloOverrides(false, both)).toEqual({ zombieDamageScale: null, startingWallet: 2000, shopAll: false });
    expect(soloOverrides(true, both)).toEqual({ ...both, shopAll: false });
    expect(soloOverrides(false, { zombieDamageScale: 0.5, startingWallet: null })).toEqual({ zombieDamageScale: null, startingWallet: null, shopAll: false });
  });

  it("Story 5.11: ?shopall is dev-only (release solo drops it)", () => {
    expect(soloOverrides(true, { ...both, shopAll: true }).shopAll).toBe(true);
    expect(soloOverrides(false, { ...both, shopAll: true }).shopAll).toBe(false);
  });

  it("the release solo overrides really set the starting wallet", () => {
    const b = loadDevBalance(soloOverrides(false, both));
    expect(b.economy.startingWallet).toBe(2000);
  });
});
