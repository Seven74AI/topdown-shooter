import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { createRng } from "../core/rng";
import { createWorld } from "../core/world";
import { applyDecayStage } from "../decay/applyDecayStage";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addBuildingAt, buildingStats, type BuildingRotation } from "./buildings";
import { PUSH_ESCAPED, pushEscapes, pushOutOfBuildings, pushed } from "./collision";

/**
 * Story 12.1 review M2: 12.1 snaps the escape's flood to the build lattice for a PLAYER's body only
 * (`pushOutOfBuildings(…, playerBody)`); every other body's escape must be exactly what it was before.
 * Many illegal zombie starts on Downtown (stages 1 and 4, a few barricades), each escaped as zombie
 * pass 4 does (`escapeInside`, buildings solid), hashed: the digest was computed on master `d8ffaee`
 * (before 12.1) and must never change unless the escape itself is meant to change (say why).
 */
const balance = loadBalance();
const GOLDEN = 1332647416;

function digest(): { h: number; escapes: number } {
  let h = 2166136261;
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  };
  const e0 = pushEscapes.count;
  for (const stage of [1, 4]) {
    const world = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    applyDecayStage(world, stage, 0);
    const hp = buildingStats(balance, "wood_barricade")?.hp ?? 1;
    let id = 1;
    for (const [x, y, rot] of [[19.5, 8.5, 0], [22, 8.5, 0], [19, 8.5, 1], [24, 8.5, 1], [30, 20, 1], [31, 22, 0], [12, 24, 0], [36, 10, 1]] as const) {
      addBuildingAt(world, { id: id++, type: "wood_barricade", ownerId: "p0", gx: x * 2, gy: y * 2, rot: rot as BuildingRotation, hp });
    }
    const rng = createRng(1201 + stage);
    for (const type of ["walker", "brute", "bloater"] as const) {
      const r = balance.zombies.types[type]?.radiusM ?? 0.35;
      for (let k = 0; k < 400; k++) {
        const x = rng.range(0, DOWNTOWN_MAP.widthM);
        const y = rng.range(0, DOWNTOWN_MAP.heightM);
        const res = pushOutOfBuildings(world, x, y, r, x, y, true, true);
        if (res !== PUSH_ESCAPED) continue;
        mix(`${type}:${k}:${pushed.x}:${pushed.y};`);
      }
    }
  }
  return { h, escapes: pushEscapes.count - e0 };
}

describe("Story 12.1 review M2: zombie escapes are exactly master's", () => {
  it("the digest of many illegal zombie starts' escapes equals the one computed on master d8ffaee", () => {
    const d = digest();
    expect(d.escapes, "liveness: escapes really ran").toBeGreaterThan(100);
    expect(d.h).toBe(GOLDEN);
  });
});
