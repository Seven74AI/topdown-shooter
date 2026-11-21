import { describe, expect, it } from "vitest";
import { DEFAULT_STRESS_WALKERS, MAX_STRESS_WALKERS, parseUrlOptions, skipsStartScreen } from "./urlOptions";

describe("parseUrlOptions", () => {
  it("is all off for an empty query", () => {
    expect(parseUrlOptions("")).toEqual({ debug: false, stress: null, loadout: null, tune: false, solo: false });
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
