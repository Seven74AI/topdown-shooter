import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { pushOutOfBuildings, pushed } from "../buildings/collision";
import { createRng } from "../core/rng";
import { createWorld, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { applyDecayStage } from "../decay/applyDecayStage";
import { gameplayDecayMasks } from "../decay/decayState";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { addPlayer } from "../player/player";
import { spawnRing } from "./spawnRing";
import { spawnZombie } from "./zombiePool";
import { insideBox } from "./wideBody.testkit";
import { STILL_TICKS, runCrowd } from "./crowdCorner.testkit";

/**
 * Fix bloater-car-corner (designer bug report 2026-11-25): with the dev cheats, ~200 Bloaters spawned
 * round the player on Downtown, and some stayed wedged in the inside corner where the horizontal car
 * `curb_car_west_n_in_road` meets the end of the vertical `curb_car_west_s_in_road` (decay stage 2+,
 * when both curb cars have moved into the road), partly inside the horizontal car.
 *
 * Root cause: the dev spawn (`spawnRing`, `spawnInView`) places bodies without a solid check, so some
 * centres start inside a car. A centre inside the horizontal car near the join is pushed out across
 * its nearest face, which is the face the vertical car touches. That push lands its centre inside the
 * vertical car, whose nearest face sends it back. The passes never settle, `pushOutOfBuildings`
 * returns PUSH_STUCK and leaves the body at `from` (its start of tick), which is that same spot
 * inside the car. That repeats every tick, so the body never leaves.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const H_CAR = "curb_car_west_n_in_road";
const V_CAR = "curb_car_west_s_in_road";

/** Downtown at decay stage 2 with both west curb cars in the road (the designer's L). */
function cornerWorld(seed: number): World {
  for (const mask of gameplayDecayMasks(map)) {
    const world = createWorld({ balance, seed, map, systems: { waves: () => {} } });
    world.decay.variants = mask;
    applyDecayStage(world, 2, mask);
    const names = world.obstacles.solids.map((s) => s.name);
    if (names.includes(H_CAR) && names.includes(V_CAR)) return world;
  }
  throw new Error("no decay variant puts both west curb cars in the road");
}

function solid(world: World, name: string): MapBox {
  const s = world.obstacles.solids.find((b) => b.name === name);
  if (!s) throw new Error(`no solid ${name}`);
  return s;
}

describe("Bloaters in the Downtown car corner (fix bloater-car-corner)", () => {
  it("the L is there: the vertical car's end touches the horizontal car's long face", () => {
    const world = cornerWorld(1);
    const h = solid(world, H_CAR);
    const v = solid(world, V_CAR);
    expect(h.maxX - h.minX).toBeGreaterThan(h.maxY - h.minY);
    expect(v.maxY - v.minY).toBeGreaterThan(v.maxX - v.minX);
    expect(v.minY).toBe(h.maxY);
    expect(v.minX).toBeGreaterThan(h.minX);
    expect(v.maxX).toBeLessThan(h.maxX);
  });

  it("a centre anywhere inside either car leaves both cars in one push-out (players, Walkers, Bloaters, Brutes)", () => {
    const world = cornerWorld(1);
    const h = solid(world, H_CAR);
    const v = solid(world, V_CAR);
    const radii = [balance.player.radiusM, ...["walker", "bloater", "brute"].map((t) => balance.zombies.types[t]?.radiusM ?? 0)];
    let tried = 0;
    const bad: string[] = [];
    for (const r of radii) {
      for (let x = h.minX + 0.05; x < h.maxX; x += 0.1) {
        for (let y = h.minY + 0.05; y < v.maxY; y += 0.1) {
          const inH = y < h.maxY;
          if (!inH && (x <= v.minX || x >= v.maxX)) continue;
          tried++;
          pushOutOfBuildings(world, x, y, r, x, y); // the dev-spawn case: the start of tick is that spot too
          const at = insideBox(world, pushed.x, pushed.y, r);
          if (at && bad.length < 10) bad.push(`r ${r} (${x.toFixed(2)}, ${y.toFixed(2)}) -> (${pushed.x.toFixed(2)}, ${pushed.y.toFixed(2)}) in ${at}`);
        }
      }
    }
    expect(tried).toBeGreaterThan(4000);
    expect(bad).toEqual([]);
  });

  it("200 dev-spawned Bloaters (ring and in view, centres inside the cars included) round a player in the corner: none ends a tick in a solid, none stands still, all reach the player", () => {
    for (const [seed, px, py] of [
      [1, 15, 17.5], // the west pocket: under the horizontal car, left of the vertical one
      [2, 18.25, 17.5], // the east pocket
    ] as const) {
      const world = cornerWorld(seed);
      world.debug.godMode = true;
      addPlayer(world, "p0", px, py);
      const before = world.zombies.aliveCount;
      // The dev cheat "Spawn N around me" (8 m ring), then "Spawn N in view": a view round the corner.
      spawnRing(world, "bloater", 100, px, py, 8);
      const rng = createRng(seed * 131 + 7);
      for (let i = 0; i < 100; i++) spawnZombie(world, "bloater", rng.range(12, 20.5), rng.range(13, 22));
      const ids: number[] = [];
      for (let k = 0; k < world.zombies.aliveCount; k++) ids.push(world.zombies.aliveIds[k] as number);
      expect(ids.length - before).toBe(200);
      const startedInside = ids.filter((id) => insideBox(world, world.zombies.x[id] as number, world.zombies.y[id] as number, 0.5) !== null).length;
      expect(startedInside, "liveness: the dev spawn really put centres in solids").toBeGreaterThan(20);
      const res = runCrowd(world, ids, 90 * 20, true);
      expect(res.inside, `seed ${seed}`).toEqual([]);
      expect(res.longestStill, `seed ${seed}: body ${res.longestStillId} stood still`).toBeLessThanOrEqual(STILL_TICKS);
      expect(res.left, `seed ${seed}: Bloaters left after 90 s`).toBe(0);
    }
  });

  it("determinism: the same seed and spawns give the same worldDigest", () => {
    const digest = (): number => {
      const world = cornerWorld(3);
      world.debug.godMode = true;
      addPlayer(world, "p0", 15, 17.5);
      spawnRing(world, "bloater", 60, 15, 17.5, 8);
      for (let y = 14.75; y < 21; y += 0.5) spawnZombie(world, "bloater", 16, y);
      const ids: number[] = [];
      for (let k = 0; k < world.zombies.aliveCount; k++) ids.push(world.zombies.aliveIds[k] as number);
      runCrowd(world, ids, 200, false);
      return worldDigest(world);
    };
    expect(digest()).toBe(digest());
  });
});
