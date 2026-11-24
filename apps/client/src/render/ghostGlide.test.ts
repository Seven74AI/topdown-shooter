import { describe, expect, it } from "vitest";
import { GHOST_GLIDE_TAU_MS, GHOST_SNAP_M, ghostLabel, glideGhost, hideGhostGlide, newGhostGlide } from "./ghostGlide";

describe("ghost glide (Story 5.24, AC 6)", () => {
  it("snaps on appear, then glides toward a new spot (≈ 63 % after τ), arriving within a few τ", () => {
    const g = newGhostGlide();
    glideGhost(g, 2, 0, 10, 10, 16);
    expect([g.x, g.y]).toEqual([10, 10]); // appear: snap
    glideGhost(g, 2, 0, 11, 10, GHOST_GLIDE_TAU_MS);
    expect(g.x).toBeCloseTo(10 + (1 - Math.exp(-1)), 5);
    for (let i = 0; i < 30; i++) glideGhost(g, 2, 0, 11, 10, 16);
    expect(g.x).toBeCloseTo(11, 2);
    glideGhost(g, 2, 0, 11, 10, 0);
    expect(g.x).toBeCloseTo(11, 2); // a 0 ms frame doesn't move it
  });

  it("snaps on a type or rotation change, a far jump, and after being hidden", () => {
    const g = newGhostGlide();
    glideGhost(g, 2, 0, 10, 10, 16);
    glideGhost(g, 2, 1, 10.5, 10, 16);
    expect(g.x).toBe(10.5);
    glideGhost(g, 3, 1, 11, 10, 16);
    expect(g.x).toBe(11);
    glideGhost(g, 3, 1, 11 + GHOST_SNAP_M + 0.5, 10, 16);
    expect(g.x).toBe(11 + GHOST_SNAP_M + 0.5);
    hideGhostGlide(g);
    glideGhost(g, 3, 1, 12, 10, 16);
    expect(g.x).toBe(12);
  });

  it("labels 'Bo · Auto-turret' ('Teammate' without a name)", () => {
    expect(ghostLabel("Bo", "Auto-turret")).toBe("Bo · Auto-turret");
    expect(ghostLabel("", "Mine")).toBe("Teammate · Mine");
  });
});
