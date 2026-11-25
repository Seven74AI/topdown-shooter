import { describe, expect, it } from "vitest";
import { wireFog, type FogTaker } from "./fogWiring";

/** Story 6.10 follow-up (6.2 re-review R1): the fog reaches every view (GameScene calling it: tools/checks/fogWiring.test.ts). */
describe("fog wiring", () => {
  const fog = { visibility: () => 0.5 };

  it("gives the zombie, trail and acid views the scene's fog (and skips the absent ones)", () => {
    const z: FogTaker = { fog: null };
    const t: FogTaker = { fog: null };
    const a: FogTaker = { fog: null };
    expect(wireFog({ zombieView: z, trailView: t, acidView: a }, fog)).toBe(3);
    expect([z.fog, t.fog, a.fog]).toEqual([fog, fog, fog]);
    expect(wireFog({ zombieView: z, trailView: null, acidView: null }, null)).toBe(1);
    expect(z.fog).toBeNull();
  });

});
