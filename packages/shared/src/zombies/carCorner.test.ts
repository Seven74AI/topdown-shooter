import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { pushEscapes, pushOutOfBuildings, pushed } from "../buildings/collision";
import { applyZombieDamage } from "../combat/damage";
import { TICK_DT_S } from "../config/constants";
import { step } from "../core/world";
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

  it("200 dev-spawned Bloaters (ring and in view, centres inside the cars included) round a player in the corner: none ends a tick in a solid, none stands still, all burst within 90 s", () => {
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
      expect(res.left, `seed ${seed}: Bloaters left after 90 s`).toBe(0); // they swell on the player and burst (chain blasts take the rest)
    }
  });

  it("a crowd that doesn't burst (120 Walkers + 40 Brutes, dev-spawned, centres inside the cars included) round a player in the corner for 30 s: none in a solid, every body comes up to the crowd round the player, none stands still unless the crowd holds it", () => {
    for (const [seed, px, py] of [
      [4, 15, 17.5],
      [5, 18.25, 17.5],
    ] as const) {
      const world = cornerWorld(seed);
      world.debug.godMode = true;
      addPlayer(world, "p0", px, py);
      const rng = createRng(seed * 977 + 1);
      const ids: number[] = [];
      for (let i = 0; i < 160; i++) {
        const inCar = i % 4 === 0; // a quarter in the cars' junction (the dev cheats' "in view" spawn)
        const x = inCar ? rng.range(15, 18) : px + rng.range(-8, 8);
        const y = inCar ? rng.range(15, 17.5) : py + rng.range(-8, 8);
        const id = spawnZombie(world, i < 120 ? "walker" : "brute", Math.min(47, Math.max(1, x)), Math.min(31, Math.max(1, y)));
        expect(id).toBeGreaterThanOrEqual(0);
        ids.push(id);
      }
      const res = runCrowd(world, ids, 30 * 20, false);
      expect(res.inside, `seed ${seed}`).toEqual([]);
      expect(res.ticks, "liveness: the crowd stays longer than the still bound").toBeGreaterThan(STILL_TICKS);
      expect(res.longestStill, `seed ${seed}: body ${res.longestStillId} stood still`).toBeLessThanOrEqual(STILL_TICKS);
      // Spawns reach 11.3 m out; the 160-body crowd packed round the player in the corner reaches ~7.6 m. A body wedged
      // on the way would stay farther out.
      expect(res.farthestApproach, `seed ${seed}: a body never came near the player`).toBeLessThan(8);
      // Liveness of the still rule: a real share of the body-ticks were free bodies it checked.
      expect(res.heldTicks / res.bodyTicks).toBeLessThan(0.98); // a dense crowd by design: ~4 % free is still ~4,000 checked body-ticks
    }
  });

  it("the normal-play path: co-op hits stacked in one tick (4 machete pushbacks, 1 m, no solid sweep) drive a Walker's centre into the dumpster against se_offices; it leaves on the next tick", () => {
    // Stage 2 puts `dumpster_alley_3` [38, 39.5] × [26, 27.5] flush against the `se_offices` east wall (x = 38). Solo play
    // can't do this: one player's pushback per tick (≤ 0.25 m) is below every body radius (≥ 0.35 m).
    const world = cornerWorld(1);
    const dump = solid(world, "dumpster_alley_3");
    const offices = solid(world, "se_offices");
    expect(dump.minX).toBe(offices.maxX);
    world.debug.godMode = true;
    addPlayer(world, "p0", 38.45, 20);
    const id = spawnZombie(world, "walker", 38.45, dump.minY - 0.36); // legal: just north of the dumpster
    expect(insideBox(world, 38.45, dump.minY - 0.36, 0.35)).toBeNull();
    world.zombies.hp[id] = 1e9; // the hits push, they don't kill
    for (let k = 0; k < 4; k++) applyZombieDamage(world, id, 1, 0, 1, 0.25, "p0", "machete");
    const x0 = world.zombies.x[id] as number;
    const y0 = world.zombies.y[id] as number;
    expect(x0 > dump.minX && x0 < dump.maxX && y0 > dump.minY && y0 < dump.maxY, "liveness: its centre is inside the dumpster").toBe(true);
    const e0 = pushEscapes.count;
    step(world, TICK_DT_S);
    expect(insideBox(world, world.zombies.x[id] as number, world.zombies.y[id] as number, 0.35)).toBeNull();
    expect(pushEscapes.count).toBe(e0 + 1);
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
