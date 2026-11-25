import { describe, expect, it } from "vitest";
import { dawnEndsAt, dawnLookFor, dawnPlaysFirst, dawnProgress } from "./dawnModel";

/** Story 6.11 (DW1 / DW2, D6) + 6.12 (D7): which dawn, when, the skip and the late-wake rule. */
describe("dawnModel", () => {
  it("DW1 after wave 10, DW2 for an endless extract and behind \"Lost in the city\"; none for a wipe", () => {
    expect(dawnLookFor("extracted", false)).toBe("dw1");
    expect(dawnLookFor("extracted", true)).toBe("dw2");
    expect(dawnLookFor("lost", true)).toBe("dw2");
    expect(dawnLookFor("wiped", false)).toBe("none");
    expect(dawnPlaysFirst("lost")).toBe(false); // D7: no 4 s wait
    expect(dawnPlaysFirst("extracted")).toBe(true);
  });

  it("a live extract plays 4 s; a late one (woken tab / late scene start) none; lost never waits", () => {
    expect(dawnEndsAt("extracted", true, 1000, 4)).toBe(5000);
    expect(dawnEndsAt("extracted", false, 1000, 4)).toBe(1000);
    expect(dawnEndsAt("lost", true, 1000, 4)).toBe(1000);
    expect(dawnEndsAt("wiped", true, 1000, 4)).toBe(1000);
  });

  it("progress 0 → 1 over the dawn; a tap skips; a wake past the end is over", () => {
    expect(dawnProgress(1000, 5000, 4, false)).toBe(0);
    expect(dawnProgress(3000, 5000, 4, false)).toBe(0.5);
    expect(dawnProgress(3000, 5000, 4, true)).toBe(1);
    expect(dawnProgress(9000, 5000, 4, false)).toBe(1);
  });
});
