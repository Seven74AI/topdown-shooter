import { afterEach, describe, expect, it } from "vitest";
import { getTuning, resetTuning, setTuning, tunedBalance, tuningText } from "./tuning";

describe("live tuning", () => {
  afterEach(() => resetTuning());

  it("starts from the balance values", () => {
    const t = getTuning();
    expect(t.aimDeadZone).toBe(0.3);
    expect(t.macheteArcDeg).toBe(110);
    expect(t.stickRadiusCssPx).toBe(60);
  });

  it("produces a validated balance with the tuned values", () => {
    setTuning({ aimDeadZone: 0.22, macheteArcDeg: 140, macheteRangeM: 2.2 });
    const b = tunedBalance();
    expect(b.controls.aimDeadZone).toBe(0.22);
    const m = b.weapons.machete;
    expect(m?.kind === "melee" ? [m.arcDeg, m.rangeM] : []).toEqual([140, 2.2]);
  });

  it("Story 5.19: the build drag gain and start distance start from controls.build and reach the tuned balance", () => {
    expect([getTuning().buildDragGain, getTuning().buildDragStartPx]).toEqual([1, 8]);
    setTuning({ buildDragGain: 1.5, buildDragStartPx: 12 });
    const b = tunedBalance();
    expect([b.controls.build.dragGain, b.controls.build.dragStartPx]).toEqual([1.5, 12]);
    expect(tuningText(getTuning())).toContain("Build drag gain: 1.5");
  });

  it("exports readable values for the playtest doc", () => {
    expect(tuningText(getTuning())).toContain("Machete arc (°): 110");
  });
});
