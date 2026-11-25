import { describe, expect, it } from "vitest";
import { PROGRESSION, ProgressionError, loadProgression } from "../config/progression";
import { DOWNTOWN_MAP } from "../map/downtown";
import { DEFAULT_DISTRICT, districtsUnlockedBy, openMask, pickRefusal } from "./districts";

/** Story 7.7 (AC 1, R1, R2, R4, R5): the district list and its pure rules. */
const playable2 = loadProgression({ ...PROGRESSION, districts: PROGRESSION.districts.map((d) => ({ ...d, playable: true })) });

describe("Story 7.7: districts", () => {
  it("AC 1: Downtown (open, playable; the map's own name) then District 2 (extract from Downtown, coming soon)", () => {
    expect(PROGRESSION.districts).toEqual([
      { id: "downtown", name: "Downtown", unlock: null, playable: true },
      { id: "district_2", name: "District 2", unlock: { extractFrom: "downtown" }, playable: false },
    ]);
    expect(DEFAULT_DISTRICT).toBe(DOWNTOWN_MAP.name);
    expect(() => loadProgression({ ...PROGRESSION, districts: [{ id: "x", name: "X", unlock: { extractFrom: "y" }, playable: true }] })).toThrow(ProgressionError);
  });

  it("R1: an extraction from Downtown unlocks District 2; from anywhere else nothing", () => {
    expect(districtsUnlockedBy("downtown")).toEqual(["district_2"]);
    expect(districtsUnlockedBy("district_2")).toEqual([]);
  });

  it("R2: the open mask is the union of the lobby's districts (Downtown always in)", () => {
    expect(openMask([])).toBe(0b01);
    expect(openMask([[], []])).toBe(0b01);
    expect(openMask([[], ["district_2"]])).toBe(0b11);
    expect(openMask([["nope"]])).toBe(0b01);
  });

  it("R2/R4/R5: only the host, only a district someone here has, only a playable one", () => {
    expect(pickRefusal("district_2", 0b11, true)).toBe("coming_soon"); // R5 with the real data
    expect(pickRefusal("district_2", 0b11, true, playable2)).toBeNull();
    expect(pickRefusal("district_2", 0b01, true, playable2)).toBe("locked");
    expect(pickRefusal("district_2", 0b11, false, playable2)).toBe("not_host");
    expect(pickRefusal("moon", 0b11, true, playable2)).toBe("unknown");
    expect(pickRefusal("downtown", 0b01, true)).toBeNull();
  });
});
