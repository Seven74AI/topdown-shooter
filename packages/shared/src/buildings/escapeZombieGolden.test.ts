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
 * pass 4 does (`escapeInside`, buildings solid), and (re-review round 1) a non-player body of the player's
 * radius, hashed: the digest was computed on master `d8ffaee`
 * (before 12.1) and must never change unless the escape itself is meant to change (say why).
 */
const balance = loadBalance();
const GOLDEN = 502889178;

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
    // Re-review round 1 (LOW): plus a non-player body exactly the player's size (`playerBody` false): before the
    // explicit flag, 12.1 snapped on `r === player.radiusM`, which no zombie type has, so only this case catches it.
    for (const type of ["walker", "brute", "bloater", "player_sized"] as const) {
      const r = type === "player_sized" ? balance.player.radiusM : (balance.zombies.types[type]?.radiusM ?? 0.35);
      for (let k = 0; k < 400; k++) {
        const x = rng.range(0, DOWNTOWN_MAP.widthM);
        const y = rng.range(0, DOWNTOWN_MAP.heightM);
        const res = pushOutOfBuildings(world, x, y, r, x, y, true, true, false);
        if (res !== PUSH_ESCAPED) continue;
        mix(`${type}:${k}:${pushed.x}:${pushed.y};`);
      }
    }
  }
  // The narrow cases where the grid offset matters (`collision.test.ts` › review M1's fort with a 0.5 m murder
  // hole and a barricade 0.5 m north of it): a fine grid of starts in and round the hole, for a Walker and a
  // non-player body of the player's radius.
  const fort = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  const hpF = buildingStats(balance, "wood_barricade")?.hp ?? 1;
  let fid = 1;
  for (const [x, y, rot] of [[19.5, 8.5, 0], [22, 8.5, 0], [19, 8.5, 1], [19, 10.5, 1], [24, 8.5, 1], [24, 10.5, 1], [19.5, 12, 0], [21.5, 12, 0], [20.5, 7.5, 0]] as const) {
    addBuildingAt(fort, { id: fid++, type: "wood_barricade", ownerId: "p0", gx: x * 2, gy: y * 2, rot: rot as BuildingRotation, hp: hpF });
  }
  for (const r of [balance.zombies.types.walker?.radiusM ?? 0.35, balance.player.radiusM]) {
    for (let i = 0; i <= 60; i++) {
      for (let j = 0; j <= 40; j++) {
        const x = 20.5 + i * 0.05;
        const y = 7.6 + j * 0.05;
        if (pushOutOfBuildings(fort, x, y, r, x, y, true, true, false) !== PUSH_ESCAPED) continue;
        mix(`fort:${r}:${i}:${j}:${pushed.x}:${pushed.y};`);
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
