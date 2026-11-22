import { describe, expect, it } from "vitest";
import { loadBalance, bundledBalanceFiles, withOverrides } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { endWave, startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import {
  addBuildingAt,
  buildingTypeIds,
  footprint,
  ownedCount,
  placeBuilding,
  placementError,
  removeBuilding,
  type Box,
} from "./buildings";

/** Story 3.4: placement rules (one mechanic per test: no wave director). */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const WOOD = "wood_barricade";

function setup(): { world: World; events: SimEvent[] } {
  const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
  addPlayer(world, "p0", 10, 10);
  addPlayer(world, "p1", 30, 20);
  startBuild(world);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, events };
}
const box = (): Box => ({ minX: 0, minY: 0, maxX: 0, maxY: 0 });

describe("buildings.json (Story 3.4)", () => {
  it("has the Wood barricade: 40, 2 × 0.5 m, 200 HP, cap 6", () => {
    expect(balance.buildings.maxPerPlayer).toBe(6);
    expect(balance.buildings.types[WOOD]).toEqual({ name: "Wood barricade", price: 40, widthM: 2, depthM: 0.5, hp: 200 });
    expect(buildingTypeIds(balance)).toEqual([WOOD]);
  });

  it("rejects a bad value with the file and key", () => {
    const raw = withOverrides(bundledBalanceFiles(), [["buildings", "types.wood_barricade.hp", -1]]);
    expect(() => loadBalance(raw)).toThrow(/buildings\.json: types\.wood_barricade\.hp/);
  });
});

describe("footprint", () => {
  const stats = balance.buildings.types[WOOD];
  it("centres the box on the grid point; rotation 1 and 3 swap width and depth", () => {
    if (!stats) throw new Error("no wood");
    expect(footprint(stats, 10, 5, 0, box())).toEqual({ minX: 9, maxX: 11, minY: 4.75, maxY: 5.25 });
    expect(footprint(stats, 10, 5, 2, box())).toEqual({ minX: 9, maxX: 11, minY: 4.75, maxY: 5.25 });
    expect(footprint(stats, 10, 5, 1, box())).toEqual({ minX: 9.75, maxX: 10.25, minY: 4, maxY: 6 });
    expect(footprint(stats, 10, 5, 3, box())).toEqual({ minX: 9.75, maxX: 10.25, minY: 4, maxY: 6 });
  });
});

describe("placeBuilding", () => {
  it("places a 200 HP barricade, charges 40 and emits building.placed (with the next step)", () => {
    const { world, events } = setup();
    const r = placeBuilding(world, "p0", { type: WOOD, gx: 10, gy: 14, rot: 1 });
    expect(r.ok).toBe(true);
    expect(world.players.get("p0")?.wallet).toBe(balance.economy.startingWallet - 40);
    expect(world.players.get("p0")?.earned).toBe(0);
    expect(world.buildings.list).toHaveLength(1);
    expect(world.buildings.list[0]).toMatchObject({ id: 1, type: WOOD, ownerId: "p0", gx: 10, gy: 14, rot: 1, hp: 200, maxHp: 200, minX: 9.75, maxX: 10.25, minY: 13, maxY: 15 });
    expect(world.buildings.version).toBe(1);
    expect(events.filter((e) => e.type === "building.placed")).toHaveLength(0); // pending until the step
    step(world, TICK_DT_S);
    expect(events.filter((e) => e.type === "building.placed")).toEqual([
      { type: "building.placed", buildingId: 1, buildingType: WOOD, ownerId: "p0", gx: 10, gy: 14, rot: 1 },
    ]);
  });

  it("refuses outside a build phase (lobby, wave) and changes nothing", () => {
    const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(world, "p0", 10, 10);
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 20, gy: 20, rot: 0 })).toEqual({ ok: false, error: "not_build_phase" });
    startBuild(world);
    startWave(world);
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 20, gy: 20, rot: 0 })).toEqual({ ok: false, error: "not_build_phase" });
    expect(world.buildings.list).toHaveLength(0);
    expect(world.players.get("p0")?.wallet).toBe(balance.economy.startingWallet);
  });

  it("refuses an unknown player, type or rotation", () => {
    const { world } = setup();
    expect(placementError(world, "p9", { type: WOOD, gx: 20, gy: 20, rot: 0 })).toBe("unknown_player");
    expect(placementError(world, "p0", { type: "castle", gx: 20, gy: 20, rot: 0 })).toBe("unknown_type");
    expect(placementError(world, "p0", { type: "toString", gx: 20, gy: 20, rot: 0 })).toBe("unknown_type");
    expect(placementError(world, "p0", { type: WOOD, gx: 20, gy: 20, rot: 4 })).toBe("unknown_type");
    expect(placementError(world, "p0", { type: WOOD, gx: 20.5, gy: 20, rot: 0 })).toBe("blocked");
  });

  it("refuses the map edge: the footprint must lie inside the map", () => {
    const { world } = setup();
    expect(placementError(world, "p0", { type: WOOD, gx: 0, gy: 20, rot: 0 })).toBe("blocked"); // x from -1
    expect(placementError(world, "p0", { type: WOOD, gx: 1, gy: 20, rot: 0 })).toBeNull(); // x from 0: flush is fine
    expect(placementError(world, "p0", { type: WOOD, gx: 47, gy: 20, rot: 0 })).toBeNull();
    expect(placementError(world, "p0", { type: WOOD, gx: 48, gy: 20, rot: 0 })).toBe("blocked");
    expect(placementError(world, "p0", { type: WOOD, gx: 20, gy: 0, rot: 0 })).toBe("blocked");
    expect(placementError(world, "p0", { type: WOOD, gx: 20, gy: 32, rot: 1 })).toBe("blocked");
    expect(placementError(world, "p0", { type: WOOD, gx: 20, gy: 31, rot: 1 })).toBeNull();
  });

  it("refuses an overlap with another building but allows touching ones (a wall)", () => {
    const { world } = setup();
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 20, gy: 20, rot: 0 }).ok).toBe(true);
    expect(placementError(world, "p1", { type: WOOD, gx: 21, gy: 20, rot: 0 })).toBe("blocked");
    expect(placementError(world, "p1", { type: WOOD, gx: 20, gy: 20, rot: 1 })).toBe("blocked"); // a cross
    expect(placeBuilding(world, "p1", { type: WOOD, gx: 22, gy: 20, rot: 0 }).ok).toBe(true); // edge to edge
    expect(placeBuilding(world, "p1", { type: WOOD, gx: 20, gy: 21, rot: 0 }).ok).toBe(true); // 0.5 m gap
  });

  it("refuses a spot where a player stands (out players don't count) or an alive zombie is", () => {
    const { world } = setup();
    expect(placementError(world, "p1", { type: WOOD, gx: 10, gy: 10, rot: 0 })).toBe("blocked"); // p0 at (10, 10)
    // p0's 0.4 m circle at y = 10 reaches y = 10.4: a barricade at gy 11 (y from 10.75) is clear.
    expect(placementError(world, "p1", { type: WOOD, gx: 10, gy: 11, rot: 0 })).toBeNull();
    const p0 = world.players.get("p0");
    if (p0) p0.status = "out";
    expect(placementError(world, "p1", { type: WOOD, gx: 10, gy: 10, rot: 0 })).toBeNull();
    spawnZombie(world, "walker", 40, 5);
    expect(placementError(world, "p1", { type: WOOD, gx: 40, gy: 5, rot: 0 })).toBe("blocked");
  });

  it("caps each player at 6 (FR51): the 7th is refused, others can still build", () => {
    const { world } = setup();
    const p0 = world.players.get("p0");
    if (p0) p0.wallet = 1000;
    for (let i = 0; i < 6; i++) expect(placeBuilding(world, "p0", { type: WOOD, gx: 5 + i * 3, gy: 25, rot: 0 }).ok).toBe(true);
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 28, rot: 0 })).toEqual({ ok: false, error: "limit" });
    expect(ownedCount(world, "p0")).toBe(6);
    expect(p0?.wallet).toBe(1000 - 6 * 40);
    expect(placeBuilding(world, "p1", { type: WOOD, gx: 40, gy: 28, rot: 0 }).ok).toBe(true);
    removeBuilding(world, 3); // destroyed (Story 3.5): a free slot again
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 2, rot: 0 }).ok).toBe(true);
  });

  it("refuses without enough money and changes nothing (the cap is checked first)", () => {
    const { world } = setup();
    const p0 = world.players.get("p0");
    if (p0) p0.wallet = 39;
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 20, gy: 20, rot: 0 })).toEqual({ ok: false, error: "money" });
    expect(p0?.wallet).toBe(39);
    expect(world.buildings.list).toHaveLength(0);
    expect(world.buildings.version).toBe(0);
    if (p0) p0.wallet = 40;
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 20, gy: 20, rot: 0 }).ok).toBe(true);
    expect(p0?.wallet).toBe(0);
  });

  it("persists across waves (until destroyed)", () => {
    const { world } = setup();
    placeBuilding(world, "p0", { type: WOOD, gx: 20, gy: 20, rot: 0 });
    for (let w = 0; w < 3; w++) {
      startWave(world);
      step(world, TICK_DT_S);
      endWave(world);
      step(world, TICK_DT_S);
    }
    expect(world.run.phase).toBe("build");
    expect(world.buildings.list.map((b) => b.id)).toEqual([1]);
  });
});

describe("building list", () => {
  it("stays sorted by id (the mirror may add out of order); version counts adds and removes", () => {
    const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
    for (const id of [5, 2, 9]) addBuildingAt(world, { id, type: WOOD, ownerId: "p0", gx: id * 3, gy: 5, rot: 0, hp: 200 });
    expect(world.buildings.list.map((b) => b.id)).toEqual([2, 5, 9]);
    expect(world.buildings.nextId).toBe(10);
    expect(addBuildingAt(world, { id: 5, type: WOOD, ownerId: "p0", gx: 40, gy: 20, rot: 0, hp: 200 })).toBeNull();
    expect(addBuildingAt(world, { id: 11, type: "castle", ownerId: "p0", gx: 40, gy: 20, rot: 0, hp: 200 })).toBeNull();
    expect(removeBuilding(world, 5)).toBe(true);
    expect(removeBuilding(world, 5)).toBe(false);
    expect(world.buildings.version).toBe(4);
    expect(world.buildings.list.map((b) => b.id)).toEqual([2, 9]);
  });

  it("is in the World snapshot (determinism, Story 8.4)", () => {
    const { world } = setup();
    placeBuilding(world, "p0", { type: WOOD, gx: 20, gy: 20, rot: 0 });
    const s = snapshotWorld(world);
    expect(s.buildings).toMatchObject({ nextId: 2, version: 1, list: [{ id: 1, gx: 20, gy: 20, hp: 200 }] });
  });

  it("two Worlds with the same seed, inputs and placements stay identical", () => {
    const a = setup().world;
    const b = setup().world;
    for (const w of [a, b]) {
      placeBuilding(w, "p0", { type: WOOD, gx: 10, gy: 8, rot: 0 });
      for (let i = 0; i < 60; i++) {
        setInput(w, "p0", { ...NEUTRAL_INPUT, seq: i + 1, moveX: Math.cos(i / 9), moveY: -1 });
        step(w, TICK_DT_S);
      }
    }
    expect(snapshotWorld(a)).toEqual(snapshotWorld(b));
  });
});
