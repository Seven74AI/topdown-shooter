import { describe, expect, it } from "vitest";
import { loadBalance, type Balance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, type BuildingRotation } from "../buildings/buildings";
import { PUSH_ESCAPED, pushEscapes, pushOutOfBuildings, pushed } from "../buildings/collision";
import { applyZombieDamage } from "../combat/damage";
import { createRng } from "../core/rng";
import { createWorld, step, type World } from "../core/world";
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
 * inside the car. That repeats every tick, so the body never leaves. Before FX-B1 (hit pushback
 * swept), co-op hits stacked in one tick could also drive a centre into a solid in normal play.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const H_CAR = "curb_car_west_n_in_road";
const V_CAR = "curb_car_west_s_in_road";

/** The real balance with Bloater blasts harmless to zombies: each Bloater must reach the player itself (no chain-blast deaths). */
const noChainBalance: Balance = (() => {
  const b = JSON.parse(JSON.stringify(balance)) as { zombies: { types: { bloater: { explodes: { zombieDamage: number } } } } };
  b.zombies.types.bloater.explodes.zombieDamage = 0;
  return b as unknown as Balance;
})();

/** Downtown at decay stage 2 with both west curb cars in the road (the designer's L). */
function cornerWorld(seed: number, bal: Balance = balance): World {
  for (const mask of gameplayDecayMasks(map)) {
    const world = createWorld({ balance: bal, seed, map, systems: { waves: () => {} } });
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

function aliveIds(world: World): number[] {
  const ids: number[] = [];
  for (let k = 0; k < world.zombies.aliveCount; k++) ids.push(world.zombies.aliveIds[k] as number);
  return ids;
}

/**
 * The dev cheat "Spawn N in view" (`apps/client/src/debug/stressScenario.ts › spawnInView`) stands in
 * here as `spawnZombie` at uniform random spots in a view-sized rectangle round the corner (its 1.5 m
 * keep-clear round the player is left out: it only makes the crowd start farther away). Neither
 * checks solids, so centres land in the cars.
 */
function spawnInRect(world: World, type: "bloater" | "walker" | "brute", count: number, seed: number, x0: number, y0: number, x1: number, y1: number): void {
  const rng = createRng(seed * 131 + 7);
  for (let i = 0; i < count; i++) expect(spawnZombie(world, type, rng.range(x0, x1), rng.range(y0, y1))).toBeGreaterThanOrEqual(0);
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

  it("a centre anywhere inside either car leaves both cars in one escaping push-out (players, Walkers, Bloaters, Brutes)", () => {
    const world = cornerWorld(1);
    const h = solid(world, H_CAR);
    const v = solid(world, V_CAR);
    const radii = [balance.player.radiusM, ...["walker", "bloater", "brute"].map((t) => balance.zombies.types[t]?.radiusM ?? 0)];
    let tried = 0;
    let escaped = 0;
    const bad: string[] = [];
    for (const r of radii) {
      for (let x = h.minX + 0.05; x < h.maxX; x += 0.1) {
        for (let y = h.minY + 0.05; y < v.maxY; y += 0.1) {
          const inH = y < h.maxY;
          if (!inH && (x <= v.minX || x >= v.maxX)) continue;
          tried++;
          // The dev-spawn case: the start of tick is that spot too.
          if (pushOutOfBuildings(world, x, y, r, x, y, true, true) === PUSH_ESCAPED) escaped++;
          const at = insideBox(world, pushed.x, pushed.y, r);
          if (at && bad.length < 10) bad.push(`r ${r} (${x.toFixed(2)}, ${y.toFixed(2)}) -> (${pushed.x.toFixed(2)}, ${pushed.y.toFixed(2)}) in ${at}`);
        }
      }
    }
    expect(tried).toBeGreaterThan(4000);
    expect(escaped, "liveness: the bounce really happened (1,196 of 7,200 before the fix stayed inside)").toBeGreaterThan(1000);
    expect(bad).toEqual([]);
  });

  it("200 dev-spawned Bloaters (ring and in view, centres inside the cars included) round a player in the corner: none ends a tick in a solid, each reaches the player itself (blasts spare zombies here), none stands still unless held", () => {
    for (const [seed, px, py] of [
      [1, 15, 17.5], // the west pocket: under the horizontal car, left of the vertical one
      [2, 18.25, 17.5], // the east pocket
    ] as const) {
      const world = cornerWorld(seed, noChainBalance);
      world.debug.godMode = true;
      addPlayer(world, "p0", px, py);
      const before = world.zombies.aliveCount;
      spawnRing(world, "bloater", 100, px, py, 8); // the dev cheat "Spawn N around me" (8 m ring)
      spawnInRect(world, "bloater", 100, seed, 12, 13, 20.5, 22);
      const ids = aliveIds(world);
      expect(ids.length - before).toBe(200);
      const startedInside = ids.filter((id) => insideBox(world, world.zombies.x[id] as number, world.zombies.y[id] as number, 0.5) !== null).length;
      expect(startedInside, "liveness: the dev spawn really put centres in solids").toBeGreaterThan(20);
      const res = runCrowd(world, ids, 180 * 20, { untilGone: true });
      expect(res.inside, `seed ${seed}`).toEqual([]);
      expect(res.notReached, `seed ${seed}: Bloaters that never touched the player or swelled on it`).toBe(0);
      expect(res.neverMoved, `seed ${seed}: never moved (review L1)`).toEqual([]);
      expect(res.left, `seed ${seed}: Bloaters left after 180 s`).toBe(0);
      expect(res.ticks, "liveness: the crowd lasted longer than the still bound").toBeGreaterThan(STILL_TICKS);
      expect(res.longestStill, `seed ${seed}: body ${res.longestStillId} stood still`).toBeLessThanOrEqual(STILL_TICKS);
      expect(res.heldTicks / res.bodyTicks, "liveness: the still rule checked a real share of free body-ticks").toBeLessThan(0.9);
    }
  });

  it("a crowd that doesn't burst (120 Walkers + 40 Brutes, dev-spawned, centres inside the cars included) round a player in the corner for 30 s: none in a solid, every body gets on (within 8 m, or 1 m nearer than it started), none stands still unless held", () => {
    for (const [seed, px, py] of [
      [4, 15, 17.5],
      [5, 18.25, 17.5],
    ] as const) {
      const world = cornerWorld(seed);
      world.debug.godMode = true;
      addPlayer(world, "p0", px, py);
      const rng = createRng(seed * 977 + 1);
      for (let i = 0; i < 160; i++) {
        const inCar = i % 4 === 0; // a quarter in the cars' junction
        const x = inCar ? rng.range(15, 18) : px + rng.range(-8, 8);
        const y = inCar ? rng.range(15, 17.5) : py + rng.range(-8, 8);
        expect(spawnZombie(world, i < 120 ? "walker" : "brute", Math.min(47, Math.max(1, x)), Math.min(31, Math.max(1, y)))).toBeGreaterThanOrEqual(0);
      }
      const ids = aliveIds(world);
      const res = runCrowd(world, ids, 30 * 20, { approachOk: (s, c) => c < 8 || c <= s - 1 });
      expect(res.inside, `seed ${seed}`).toEqual([]);
      expect(res.farFrom, `seed ${seed}: bodies that got nowhere (start→closest m)`).toEqual([]);
      expect(res.neverMoved, `seed ${seed}: bodies that never moved (review L1)`).toEqual([]);
      expect(res.longestStill, `seed ${seed}: body ${res.longestStillId} stood still`).toBeLessThanOrEqual(STILL_TICKS);
      expect(res.heldTicks / res.bodyTicks, "liveness: the still rule checked a real share of free body-ticks").toBeLessThan(0.95);
    }
  });

  it("FX-B1: co-op hits stacked in one tick (4 machete pushbacks, 1 m) stop a Walker at the dumpster's face; a centre the dev cheats drop into it leaves on the next tick", () => {
    // Stage 2 puts `dumpster_alley_3` [38, 39.5] × [26, 27.5] flush against the `se_offices` east wall (x = 38): a junction.
    const world = cornerWorld(1);
    const dump = solid(world, "dumpster_alley_3");
    expect(dump.minX).toBe(solid(world, "se_offices").maxX);
    world.debug.godMode = true;
    addPlayer(world, "p0", 38.45, 20);
    const id = spawnZombie(world, "walker", 38.45, dump.minY - 0.36); // legal: just north of the dumpster
    world.zombies.hp[id] = 1e9; // the hits push, they don't kill
    const e0 = pushEscapes.count;
    for (let k = 0; k < 4; k++) applyZombieDamage(world, id, 1, 0, 1, 0.25, "p0", "machete");
    expect(insideBox(world, world.zombies.x[id] as number, world.zombies.y[id] as number, 0.35), "swept: stopped at the face").toBeNull();
    expect(world.zombies.y[id] as number).toBeGreaterThan(dump.minY - 0.36);
    // Before FX-B1 the same hits put its centre at y 26.64, inside; that is the dev-spawn case, which the escape takes out.
    const dev = spawnZombie(world, "walker", 38.45, 26.64);
    step(world, TICK_DT_S);
    expect(insideBox(world, world.zombies.x[dev] as number, world.zombies.y[dev] as number, 0.35)).toBeNull();
    expect(insideBox(world, world.zombies.x[id] as number, world.zombies.y[id] as number, 0.35)).toBeNull();
    expect(pushEscapes.count, "only the dropped-in Walker escaped").toBe(e0 + 1);
  });

  it("a sealed barricade fort with a 0.5 m murder hole: outside Walkers hit towards it by stacked co-op hits every tick never end up inside the fort or a wall", () => {
    const world = createWorld({ balance, seed: 7, map, systems: { waves: () => {} } });
    world.debug.godMode = true;
    // An open lot on Downtown (stage 1). Inside: [19.5, 24] × [9, 12]. Holes narrower than a Walker (0.7 m): the
    // 0.5 m murder hole at x [21.5, 22] in the north wall, and 0.5 m at the south-east corner.
    const walls: [number, number, BuildingRotation][] = [
      [19.5, 8.5, 0], [22, 8.5, 0], // north [19.5, 21.5] + [22, 24]
      [19, 8.5, 1], [19, 10.5, 1], // west [19, 19.5] × [8.5, 12.5]
      [24, 8.5, 1], [24, 10.5, 1], // east [24, 24.5] × [8.5, 12.5]
      [19.5, 12, 0], [21.5, 12, 0], // south [19.5, 23.5]
    ];
    for (const s of world.obstacles.solids) expect(s.maxX <= 18.5 || s.minX >= 25 || s.maxY <= 7.5 || s.minY >= 13, `the lot is clear of ${s.name}`).toBe(true);
    let id = 1;
    for (const [x, y, rot] of walls) expect(addBuildingAt(world, { id: id++, type: "metal_barricade", ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot, hp: 1e9 })).not.toBeNull();
    const fort = { minX: 19.5, minY: 9, maxX: 24, maxY: 12 };
    addPlayer(world, "p0", 21.75, 10.5);
    const zs: number[] = [];
    for (let x = 19.6; x <= 24.4; x += 0.6) {
      const zid = spawnZombie(world, "walker", x, 8.5 - 0.36);
      if (zid >= 0 && insideBox(world, x, 8.5 - 0.36, 0.35) === null) {
        world.zombies.hp[zid] = 1e9;
        zs.push(zid);
      }
    }
    expect(zs.length, "liveness: Walkers lined up against the north wall").toBeGreaterThan(5);
    const holes: string[] = [];
    for (let t = 0; t < 200; t++) {
      for (const zid of zs) for (let k = 0; k < 4; k++) applyZombieDamage(world, zid, 1, 0, 1, 0.25, "p0", "machete"); // 1 m south per tick
      step(world, TICK_DT_S);
      for (const zid of zs) {
        const x = world.zombies.x[zid] as number;
        const y = world.zombies.y[zid] as number;
        const inFort = x > fort.minX && x < fort.maxX && y > fort.minY && y < fort.maxY;
        const at = insideBox(world, x, y, 0.35);
        if ((inFort || at) && holes.length < 5) holes.push(`${zid}@${t} (${x.toFixed(2)}, ${y.toFixed(2)}) ${inFort ? "in the fort" : `in ${at}`}`);
      }
    }
    expect(holes).toEqual([]);
  });

  it("determinism: the same seed and spawns give the same worldDigest, pinned; the escape really ran", () => {
    const digest = (): { d: number; escapes: number } => {
      const world = cornerWorld(3);
      world.debug.godMode = true;
      addPlayer(world, "p0", 15, 17.5);
      spawnRing(world, "bloater", 60, 15, 17.5, 8);
      for (let y = 14.75; y < 21; y += 0.5) spawnZombie(world, "bloater", 16, y);
      const e0 = pushEscapes.count;
      runCrowd(world, aliveIds(world), 200);
      return { d: worldDigest(world), escapes: pushEscapes.count - e0 };
    };
    const a = digest();
    const b = digest();
    expect(a.escapes, "liveness: centres in the cars escaped").toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(a.d).toBe(GOLDEN_DIGEST);
  });
});

/**
 * `worldDigest` of the determinism scenario above (Node / V8; a change here is a behaviour change: say why).
 * Story 9.13: re-pinned (was 1728716985) only because the digest includes `balance.version`, which the four new
 * client-only `controls.fx` caps change (B28); the simulation is unchanged.
 * Story 12.4: re-pinned (was 3587910981) only because removing `decay.buildingRefundShare` changes
 * `balance.version`; this scenario has no buildings and no decay change (it passed unchanged on 12.1's commit).
 */
const GOLDEN_DIGEST = 2551157819;
