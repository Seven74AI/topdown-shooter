import { describe, expect, it } from "vitest";
import {
  DEFAULT_STRESS_WALKERS,
  MAX_STRESS_WALKERS,
  MAX_THROTTLE_LAG_MS,
  parseUrlOptions,
  skipsStartScreen,
} from "./urlOptions";

describe("parseUrlOptions", () => {
  it("is all off for an empty query", () => {
    expect(parseUrlOptions("")).toEqual({ debug: false, stress: null, loadout: null, tune: false, solo: false, throttle: null, zombieDamageScale: null, startingWallet: null, scenario: null, waveMix: null });
    expect(parseUrlOptions("?zdmg=0.1").zombieDamageScale).toBe(0.1); // retro A5
    expect(parseUrlOptions("?zdmg=x").zombieDamageScale).toBeNull();
    expect(parseUrlOptions("?wallet=2000").startingWallet).toBe(2000); // Story 3.3
    expect(parseUrlOptions("?wallet=-5").startingWallet).toBeNull();
  });

  it("reads ?debug=1 and its spellings", () => {
    for (const q of ["?debug=1", "?debug", "?debug=true", "?debug=ON"]) expect(parseUrlOptions(q).debug).toBe(true);
    for (const q of ["?debug=0", "?debug=false", "?debugx=1"]) expect(parseUrlOptions(q).debug).toBe(false);
  });

  it("reads ?stress=N, defaulting a bare ?stress to 150 and capping at 200", () => {
    expect(parseUrlOptions("?stress=150").stress).toBe(150);
    expect(parseUrlOptions("?stress=20&debug=1")).toMatchObject({ debug: true, stress: 20 });
    expect(parseUrlOptions("?stress").stress).toBe(DEFAULT_STRESS_WALKERS);
    expect(parseUrlOptions("?stress=5000").stress).toBe(MAX_STRESS_WALKERS);
  });

  it("ignores invalid stress values", () => {
    for (const q of ["?stress=0", "?stress=-3", "?stress=abc", "?stress=1.5"]) expect(parseUrlOptions(q).stress).toBeNull();
  });
});

describe("parseUrlOptions: Story 1.12 options", () => {
  it("parses ?loadout into two weapon ids (lowercased, trimmed, deduplicated)", () => {
    expect(parseUrlOptions("?loadout=pistol,machete").loadout).toEqual(["pistol", "machete"]);
    expect(parseUrlOptions("?loadout=SMG, Hunting_Rifle").loadout).toEqual(["smg", "hunting_rifle"]);
    expect(parseUrlOptions("?loadout=smg").loadout).toEqual(["smg", null]);
    expect(parseUrlOptions("?loadout=smg,smg").loadout).toEqual(["smg", null]);
    expect(parseUrlOptions("?loadout=<script>").loadout).toBeNull();
    expect(parseUrlOptions("").loadout).toBeNull();
  });

  it("parses ?tune", () => {
    expect(parseUrlOptions("?tune=1").tune).toBe(true);
    expect(parseUrlOptions("?tune").tune).toBe(true);
    expect(parseUrlOptions("?tune=0").tune).toBe(false);
    expect(parseUrlOptions("").tune).toBe(false);
  });
});

describe("parseUrlOptions: Story 2.1 start screen", () => {
  it("reads ?solo", () => {
    for (const q of ["?solo", "?solo=1", "?solo=true"]) expect(parseUrlOptions(q).solo).toBe(true);
    for (const q of ["", "?solo=0", "?soloist=1"]) expect(parseUrlOptions(q).solo).toBe(false);
  });

  it("skips the start screen for ?solo, ?stress, ?loadout and ?tune only", () => {
    for (const q of ["?solo", "?stress=20", "?loadout=smg", "?tune=1"]) expect(skipsStartScreen(parseUrlOptions(q))).toBe(true);
    for (const q of ["", "?debug=1", "?stress=abc"]) expect(skipsStartScreen(parseUrlOptions(q))).toBe(false);
  });
});

describe("parseUrlOptions: Story 2.6 network throttle", () => {
  it("reads ?lag=<rttMs>&jitter=<ms>", () => {
    expect(parseUrlOptions("?lag=150&jitter=20").throttle).toEqual({ rttMs: 150, jitterMs: 20 });
    expect(parseUrlOptions("?lag=150").throttle).toEqual({ rttMs: 150, jitterMs: 0 });
    expect(parseUrlOptions("?jitter=30").throttle).toEqual({ rttMs: 0, jitterMs: 30 });
    expect(parseUrlOptions("?lag=99999").throttle?.rttMs).toBe(MAX_THROTTLE_LAG_MS);
  });

  it("is off without a usable value, and never skips the start screen", () => {
    for (const q of ["", "?lag=0", "?lag=abc", "?lag=-5&jitter=x", "?lag=1.5"]) expect(parseUrlOptions(q).throttle).toBeNull();
    expect(skipsStartScreen(parseUrlOptions("?lag=150&jitter=20"))).toBe(false);
  });
});

describe("parseUrlOptions: Story 2.10 test scenario", () => {
  it("accepts only the fixed scenario names", () => {
    expect(parseUrlOptions("?scenario=net150").scenario).toBe("net150");
    expect(parseUrlOptions("?scenario=NET150").scenario).toBe("net150");
    expect(parseUrlOptions("?scenario=god").scenario).toBeNull();
    expect(parseUrlOptions("?scenario").scenario).toBeNull();
    expect(parseUrlOptions("?debug=1").scenario).toBeNull();
  });

  it("does not skip the start screen (the scenario is an online test)", () => {
    expect(skipsStartScreen(parseUrlOptions("?scenario=net150"))).toBe(false);
  });
});

describe("parseUrlOptions: Story 3.9 wave mix", () => {
  it("passes ?wavemix through raw (parseWaveMix validates it against balance)", () => {
    expect(parseUrlOptions("?solo&wavemix=walker,crawler").waveMix).toBe("walker,crawler");
    expect(parseUrlOptions("?solo").waveMix).toBeNull();
  });
});
