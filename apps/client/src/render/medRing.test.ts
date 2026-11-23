import { describe, expect, it } from "vitest";
import { inHealReach, loadBalance, createWorld, addBuildingAt, BUILD_GRID_M } from "@topdown/shared";
import { bodyHeals, medRingRadiusM, medRingWidthM } from "./medRing";
import { HEAL_CUE_MS, HealCue } from "./healCue";

const balance = loadBalance();
const HEAL = balance.buildings.types.med_station?.heal as { radiusM: number; hpPerS: number };
const R = balance.player.radiusM;

describe("Story 5.10: the med ring is the heal edge (AC 10)", () => {
  it("a body touching the ring heals (d = r + r_body − ε), at d = r + r_body it does not; same as the sim's inHealReach", () => {
    const ring = medRingRadiusM(HEAL.radiusM);
    expect(ring).toBe(2);
    const world = createWorld({ balance, seed: 1 });
    addBuildingAt(world, { id: 1, type: "med_station", ownerId: "p0", gx: 20 / BUILD_GRID_M, gy: 16 / BUILD_GRID_M, rot: 0, hp: 300 });
    const cx = 20.5;
    const cy = 16.5;
    for (const a of [0, 1, 2.5, 4]) {
      for (const [d, heals] of [
        [ring + R - 1e-3, true],
        [ring + R + 1e-3, false],
      ] as const) {
        expect(bodyHeals(d, HEAL.radiusM, R)).toBe(heals);
        expect(inHealReach(world, cx + Math.cos(a) * d, cy + Math.sin(a) * d, R), `a ${a} d ${d}`).toBe(heals);
        expect(d - R < ring).toBe(heals); // the body's nearest edge is inside the drawn ring
      }
    }
    expect(bodyHeals(ring + R, HEAL.radiusM, R)).toBe(false); // strict
  });

  it("the line is ~2 px at any zoom", () => {
    expect(medRingWidthM(40) * 40).toBeCloseTo(2, 9);
    expect(medRingWidthM(70) * 70).toBeCloseTo(2, 9);
  });
});

describe("Story 5.10 heal cue from state (D6)", () => {
  it("shows only when HP rose inside a ring; lasts HEAL_CUE_MS; a rise outside (revive, build heal) shows nothing", () => {
    const c = new HealCue();
    expect(c.update("p0", 50, true, 0)).toBe(false); // first sight: no rise
    expect(c.update("p0", 51, true, 100)).toBe(true);
    expect(c.update("p0", 51, true, 100 + HEAL_CUE_MS - 1)).toBe(true);
    expect(c.update("p0", 51, true, 100 + HEAL_CUE_MS)).toBe(false);
    expect(c.update("p0", 80, false, 1000)).toBe(false); // outside a ring
    expect(c.update("p0", 70, true, 1100)).toBe(false); // falling (fire) inside a ring
    expect(c.update("p1", 10, true, 1100)).toBe(false); // per player
  });
});
