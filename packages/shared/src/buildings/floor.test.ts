import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides, type Balance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { applyKnockback } from "../combat/damage";
import { setLoadout } from "../combat/loadout";
import { NEUTRAL_INPUT } from "../net/input";
import type { MapBox } from "../map/districtMap";
import { destroyBlockedBuildings } from "../decay/decaySystem";
import { addPlayer } from "../player/player";
import { spotBlocked } from "../player/freeSpot";
import { startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { updatePathing } from "../zombies/flowField";
import { touchingBuilding } from "../zombies/zombieAi";
import { addBuildingAt, buildingById, placementError, type Building } from "./buildings";
import { circleHitsBuilding, hasObstacles, segmentHitsBuildings } from "./collision";

/**
 * Story 5.9 F1 "floor is floor": spike traps and mines never block a body, a line of sight or the
 * flow field, and zombies never attack them; they still take space on the build lattice, count
 * near spawns and are destroyed (and refunded) by a decay solid.
 */
const noop: SystemFn = () => {};
const balance = loadBalance();
/** No trap wear and no spike damage: what a trap does to movement and attacks alone. */
const harmless: Balance = loadBalance(withOverrides(bundledBalanceFiles(), [["buildings", "types.spike_trap.trap.wearPerHit", 0], ["buildings", "types.spike_trap.trap.slowPct", 0]]));

function setup(b: Balance = balance, systems: Record<string, SystemFn> = { waves: noop }) {
  const world = createWorld({ balance: b, seed: 1, systems });
  addPlayer(world, "p0", 30, 16);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  let nextId = 1;
  const place = (x: number, y: number, type: string, rot: 0 | 1 = 0) =>
    addBuildingAt(world, { id: nextId++, type, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot, hp: b.buildings.types[type]?.hp ?? 1 }) as Building;
  return { world, events, place };
}
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};

describe("floor buildings (Story 5.9 F1)", () => {
  it("players and zombies walk over a trap and a mine (no push-out)", () => {
    const { world, place } = setup(harmless);
    const t = place(14, 15, "spike_trap");
    place(19, 15.75, "mine");
    startWave(world);
    world.run.phase = "build"; // mines only go off in a wave: keep this one armed but quiet
    const z = spawnZombie(world, "walker", 10, 16);
    world.zombies.hp[z] = 1e6;
    let maxStepBack = 0;
    let crossed = false;
    for (let i = 0; i < 400; i++) {
      const before = world.zombies.x[z] as number;
      step(world, TICK_DT_S);
      const x = world.zombies.x[z] as number;
      maxStepBack = Math.max(maxStepBack, before - x);
      if (x > t.maxX) crossed = true;
    }
    expect(crossed).toBe(true); // liveness: it really walked through the trap and the mine
    expect(maxStepBack).toBeLessThan(1e-9); // never pushed back by a floor box
    expect(hasObstacles(world)).toBe(false); // the open map + floor only: nothing to collide with
    expect(circleHitsBuilding(world, 15, 16, 0.4)).toBe(false);
  });

  it("zombie line of sight goes straight across a trap and a mine, not across a barricade", () => {
    const { world, place } = setup();
    place(14, 15, "spike_trap");
    place(17, 15.75, "mine");
    expect(segmentHitsBuildings(world, 10, 16, 25, 16, 0.4)).toBe(false);
    place(21, 15, "wood_barricade", 1);
    expect(segmentHitsBuildings(world, 10, 16, 25, 16, 0.4)).toBe(true);
  });

  it("a trap never changes the flow field (wallVersion unchanged, nav grid identical)", () => {
    const { world, place } = setup();
    updatePathing(world);
    const before = Array.from(world.pathing.nav.buildingAt);
    const costs = Array.from(world.pathing.nav.enterCost);
    const wv = world.buildings.wallVersion;
    const v = world.buildings.version;
    place(14, 15, "spike_trap");
    place(17, 15.75, "mine");
    updatePathing(world);
    expect(world.buildings.version).toBe(v + 2); // renderers and the schema still see them
    expect(world.buildings.wallVersion).toBe(wv);
    expect(Array.from(world.pathing.nav.buildingAt)).toEqual(before);
    expect(Array.from(world.pathing.nav.enterCost)).toEqual(costs);
    place(21, 15, "wood_barricade"); // liveness: a wall does change both
    updatePathing(world);
    expect(world.buildings.wallVersion).toBe(wv + 1);
    expect(Array.from(world.pathing.nav.buildingAt)).not.toEqual(before);
    // …and the re-rasterized grid still has no trap or mine cell in it.
    const nav = world.pathing.nav;
    for (const [x, y] of [
      [15, 16],
      [17.25, 16],
    ] as const) {
      const c = Math.floor(y / nav.cellM) * nav.cols + Math.floor(x / nav.cellM);
      expect(nav.buildingAt[c], `cell at (${x}, ${y})`).toBe(0);
      expect(nav.enterCost[c], `cell at (${x}, ${y})`).toBe(costs[c]);
    }
  });

  it("zombies never attack a trap (a crowd walking across it leaves its HP alone without wear)", () => {
    const { world, place } = setup(harmless);
    const t = place(14, 15, "spike_trap");
    startWave(world);
    for (let i = 0; i < 12; i++) world.zombies.hp[spawnZombie(world, "walker", 10 + (i % 3) * 0.8, 14.5 + Math.floor(i / 3) * 0.8)] = 1e6;
    run(world, 300);
    expect(buildingById(world, t.id)?.hp).toBe(t.maxHp);
    const p = world.players.get("p0");
    expect(p && p.hp < p.maxHp).toBe(true); // liveness: they reached the player beyond it
  });

  it("the stuck safety net never picks a trap or a mine, even the nearest one", () => {
    const { world, place } = setup();
    const t = place(14, 15, "spike_trap");
    place(16, 15, "mine");
    const w = place(14, 18, "wood_barricade");
    expect(touchingBuilding(world, 15, 17.05, 0.5)).toBe(0); // only floor in reach (the trap is 0.05 m away)
    expect(touchingBuilding(world, 15, 17.6, 0.5)).toBe(w.id); // the wall 0.4 m away, the trap 0.6 m away
    expect(touchingBuilding(world, 16.25, 15.25, 0.5)).toBe(0); // on the mine
    expect(t.hp).toBe(t.maxHp);
  });

  it("no building may overlap a trap or a mine (touching is fine)", () => {
    const { world, place } = setup();
    const p = world.players.get("p0");
    if (!p) throw new Error("p0");
    p.wallet = 1000;
    place(14, 15, "spike_trap");
    place(20, 15, "mine");
    expect(placementError(world, "p0", { type: "wood_barricade", gx: 14 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 0 })).toBe("blocked");
    expect(placementError(world, "p0", { type: "spike_trap", gx: 15 / BUILD_GRID_M, gy: 16 / BUILD_GRID_M, rot: 0 })).toBe("blocked"); // stacking
    expect(placementError(world, "p0", { type: "mine", gx: 20 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 0 })).toBe("blocked");
    expect(placementError(world, "p0", { type: "spike_trap", gx: 16 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 0 })).toBeNull(); // adjacent
  });

  it("a decay solid on a trap destroys it with the 50 % refund", () => {
    const { world, events, place } = setup();
    const t = place(14, 15, "spike_trap");
    const p = world.players.get("p0");
    if (!p) throw new Error("p0");
    const wallet = p.wallet;
    (world.obstacles.solids as MapBox[]).push({ name: "test_box", minX: 15, minY: 15.5, maxX: 16, maxY: 16.5 } as MapBox);
    expect(destroyBlockedBuildings(world)).toBe(1);
    expect(buildingById(world, t.id)).toBeUndefined();
    expect(p.wallet - wallet).toBe(Math.floor(80 * balance.decay.buildingRefundShare));
    world.events.flush();
    expect(events.some((e) => e.type === "building.destroyed" && e.buildingId === t.id)).toBe(true);
  });

  it("a returning player may be placed on a trap or a mine, never on a barricade", () => {
    const { world, place } = setup();
    place(14, 15, "spike_trap");
    place(20, 15, "mine");
    place(24, 15, "wood_barricade");
    expect(spotBlocked(world, 15, 16, 0.4, null)).toBe(false);
    expect(spotBlocked(world, 20.25, 15.25, 0.4, null)).toBe(false);
    expect(spotBlocked(world, 25, 15.25, 0.4, null)).toBe(true);
  });

  it("merge with 5.3: a knocked zombie slides over a spike trap and a mine but stops at a barricade's face", () => {
    const { world, place } = setup();
    place(12, 15, "spike_trap"); // [12, 14] × [15, 17]
    place(15, 15.75, "mine"); // [15, 15.5] × [15.75, 16.25]
    const z = spawnZombie(world, "walker", 11, 16);
    const moved = applyKnockback(world, z, 1, 0, 5); // across the trap and the mine
    expect(moved).toBeCloseTo(5, 6);
    expect(world.zombies.x[z]).toBeCloseTo(16, 5);
    const w = place(18, 15, "wood_barricade", 1); // [18, 18.5] × [15, 17]
    const r = balance.zombies.types.walker?.radiusM ?? 0;
    applyKnockback(world, z, 1, 0, 5);
    expect(world.zombies.x[z]).toBeLessThanOrEqual(w.minX - r + 1e-9); // stopped at the wall
    expect(world.zombies.x[z]).toBeGreaterThan(w.minX - r - 1e-3);
  });

  it("merge with 5.3: Shotgun pellets fly over a spike trap, a mine and a barricade (buildings never stop shots)", () => {
    const { world, events, place } = setup(balance, { waves: noop, zombies: noop });
    startWave(world);
    place(10.5, 15, "spike_trap"); // [10.5, 12.5]: the Shotgun reaches 5 m
    place(12.5, 15.75, "mine");
    place(13, 15, "wood_barricade", 1); // [13, 13.5]
    const p = world.players.get("p0");
    if (!p) throw new Error("p0");
    p.x = p.prevX = 10;
    p.y = p.prevY = 16;
    setLoadout(balance, p.loadout, ["shotgun", null]);
    const z = spawnZombie(world, "walker", 14, 16);
    world.zombies.hp[z] = 1e6;
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 1, aimX: 1, aimY: 0, fire: true, isMouse: true });
    run(world, 10);
    expect(events.filter((e) => e.type === "zombie.hit" && e.zombieId === z && e.weapon === "shotgun").length).toBeGreaterThan(0);
  });
});
