import { describe, expect, it } from "vitest";
import { DEFAULT_STRESS_WALKERS, MAX_STRESS_WALKERS, parseUrlOptions } from "./urlOptions";

describe("parseUrlOptions", () => {
  it("is all off for an empty query", () => {
    expect(parseUrlOptions("")).toEqual({ debug: false, stress: null });
  });

  it("reads ?debug=1 and its spellings", () => {
    for (const q of ["?debug=1", "?debug", "?debug=true", "?debug=ON"]) expect(parseUrlOptions(q).debug).toBe(true);
    for (const q of ["?debug=0", "?debug=false", "?debugx=1"]) expect(parseUrlOptions(q).debug).toBe(false);
  });

  it("reads ?stress=N, defaulting a bare ?stress to 150 and capping at 200", () => {
    expect(parseUrlOptions("?stress=150").stress).toBe(150);
    expect(parseUrlOptions("?stress=20&debug=1")).toEqual({ debug: true, stress: 20 });
    expect(parseUrlOptions("?stress").stress).toBe(DEFAULT_STRESS_WALKERS);
    expect(parseUrlOptions("?stress=5000").stress).toBe(MAX_STRESS_WALKERS);
  });

  it("ignores invalid stress values", () => {
    for (const q of ["?stress=0", "?stress=-3", "?stress=abc", "?stress=1.5"]) expect(parseUrlOptions(q).stress).toBeNull();
  });
});
