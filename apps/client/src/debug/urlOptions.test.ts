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
    expect(parseUrlOptions("")).toEqual({ debug: false, stress: null, stressFire: false, loadout: null, tune: false, solo: false, throttle: null, zombieDamageScale: null, startingWallet: null, scenario: null, waveMix: null, shopCards: null, runSeed: null, stressBuild: false, stressMolotovs: 0, stressLights: false, stressBear: false, lowFx: false, shopAll: false });
    expect(parseUrlOptions("?shopall=1").shopAll).toBe(true); // Story 5.11
    expect([parseUrlOptions("?stressbuild=molotov").stressMolotovs, parseUrlOptions("?stressbuild=molotov:2").stressMolotovs, parseUrlOptions("?stressbuild=molotov:9").stressMolotovs]).toEqual([8, 2, 0]); // Story 5.12
    expect(parseUrlOptions("?shopall=0").shopAll).toBe(false);
    expect(parseUrlOptions("?fx=low").lowFx).toBe(true); // Story 4.12
    expect(parseUrlOptions("?fx=high").lowFx).toBe(false);
    expect(parseUrlOptions("?stress=150&stressbuild=traps").stressBuild).toBe(true); // Story 5.9
    expect(parseUrlOptions("?stressbuild=walls").stressBuild).toBe(false);
    expect(parseUrlOptions("?zdmg=0.1").zombieDamageScale).toBe(0.1); // retro A5
    expect(parseUrlOptions("?zdmg=x").zombieDamageScale).toBeNull();
    expect(parseUrlOptions("?wallet=2000").startingWallet).toBe(2000); // Story 3.3
    expect(parseUrlOptions("?seed=4242").runSeed).toBe(4242); // Story 4.4
    expect(parseUrlOptions("?seed=0x10").runSeed).toBe(16);
    expect(parseUrlOptions("?seed=-3").runSeed).toBeNull();
    expect(parseUrlOptions("?wallet=-5").startingWallet).toBeNull();
  });

  it("reads ?debug=1 and its spellings", () => {
    for (const q of ["?debug=1", "?debug", "?debug=true", "?debug=ON"]) expect(parseUrlOptions(q).debug).toBe(true);
    for (const q of ["?debug=0", "?debug=false", "?debugx=1"]) expect(parseUrlOptions(q).debug).toBe(false);
  });

  it("Story 5.3: reads ?stressfire=1", () => {
    expect(parseUrlOptions("?stress=150&stressfire=1&loadout=shotgun")).toMatchObject({ stress: 150, stressFire: true, loadout: ["shotgun", null] });
    expect(parseUrlOptions("?stressfire=0").stressFire).toBe(false);
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
    // Story 5.1: id:level entries pass through (levels are checked by validLoadout).
    expect(parseUrlOptions("?loadout=smg:3,machete:2").loadout).toEqual(["smg:3", "machete:2"]);
    expect(parseUrlOptions("?loadout=smg:3,smg:2").loadout).toEqual(["smg:3", null]);
    expect(parseUrlOptions("?loadout=smg:x").loadout).toEqual(["smg:x", null]);
    expect(parseUrlOptions("?loadout=smg:<b>").loadout).toBeNull();
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
  it("Story 5.10: ?shopall=1 (the shop-all dev switch) and ?stressbuild=lights", () => {
    expect(parseUrlOptions("?shopall=1").shopAll).toBe(true);
    expect(parseUrlOptions("?shopall=true").shopAll).toBe(true); // 5.11's parser: "1" / "true"
    expect(parseUrlOptions("?shopall=0").shopAll).toBe(false);
    expect(parseUrlOptions("?shopall=1", false).shopAll).toBe(false); // review L3: a release build ignores it
    expect(parseUrlOptions("?stress=150&stressbuild=lights")).toMatchObject({ stressLights: true, stressBuild: false });
    expect(parseUrlOptions("?stress=150&stressbuild=traps")).toMatchObject({ stressLights: false, stressBuild: true });
    expect(parseUrlOptions("?stress=150&stressbuild=bear")).toMatchObject({ stressBear: true, stressBuild: false, stressLights: false }); // Story 5.14
  });
});
