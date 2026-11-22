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
  damageBuilding,
  buildingTypeIds,
  cornerForCentre,
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
    expect(balance.buildings.spawnClearM).toBe(2);
    expect(balance.buildings.types[WOOD]).toEqual({ name: "Wood barricade", price: 40, widthM: 2, depthM: 0.5, hp: 200 });
    expect(buildingTypeIds(balance)).toEqual([WOOD]);
  });

  it("rejects a bad value with the file and key", () => {
    const raw = withOverrides(bundledBalanceFiles(), [["buildings", "types.wood_barricade.hp", -1]]);
    expect(() => loadBalance(raw)).toThrow(/buildings\.json: types\.wood_barricade\.hp/);
  });
});

describe("footprint (review H2: min corner on the 0.5 m lattice)", () => {
  const stats = balance.buildings.types[WOOD];
  it("rot 0/2 cover [x, x + 2] × [y, y + 0.5], rot 1/3 [x, x + 0.5] × [y, y + 2], x = gx × 0.5", () => {
    if (!stats) throw new Error("no wood");
    expect(footprint(stats, 20, 10, 0, box())).toEqual({ minX: 10, maxX: 12, minY: 5, maxY: 5.5 });
    expect(footprint(stats, 20, 10, 2, box())).toEqual({ minX: 10, maxX: 12, minY: 5, maxY: 5.5 });
    expect(footprint(stats, 20, 10, 1, box())).toEqual({ minX: 10, maxX: 10.5, minY: 5, maxY: 7 });
    expect(footprint(stats, 21, 11, 3, box())).toEqual({ minX: 10.5, maxX: 11, minY: 5.5, maxY: 7.5 });
  });

  it("cornerForCentre centres the box on a point (rounded to the lattice), for each rotation", () => {
    if (!stats) throw new Error("no wood");
    const c = { gx: 0, gy: 0 };
    cornerForCentre(stats, 0, 11, 5.25, c);
    expect(c).toEqual({ gx: 20, gy: 10 }); // [10, 12] × [5, 5.5]
    cornerForCentre(stats, 1, 11, 5.25, c);
    expect(c).toEqual({ gx: 22, gy: 9 }); // [10.75 → 11, …] rounded: x 11, y 4.5 → [11, 11.5] × [4.5, 6.5]
    expect(Number.isInteger(c.gx) && Number.isInteger(c.gy)).toBe(true);
  });

  it("the balance only accepts footprints on the lattice", () => {
    const raw = withOverrides(bundledBalanceFiles(), [["buildings", "types.wood_barricade.depthM", 0.3]]);
    expect(() => loadBalance(raw)).toThrow(/buildings\.json: types\.wood_barricade\.depthM/);
  });
});

describe("placeBuilding", () => {
  it("places a 200 HP barricade, charges 40 and emits building.placed (with the next step)", () => {
    const { world, events } = setup();
    const r = placeBuilding(world, "p0", { type: WOOD, gx: 20, gy: 28, rot: 1 });
    expect(r.ok).toBe(true);
    expect(world.players.get("p0")?.wallet).toBe(balance.economy.startingWallet - 40);
    expect(world.players.get("p0")?.earned).toBe(0);
    expect(world.buildings.list).toHaveLength(1);
    expect(world.buildings.list[0]).toMatchObject({ id: 1, type: WOOD, ownerId: "p0", gx: 20, gy: 28, rot: 1, hp: 200, maxHp: 200, minX: 10, maxX: 10.5, minY: 14, maxY: 16 });
    expect(world.buildings.version).toBe(1);
    expect(events.filter((e) => e.type === "building.placed")).toHaveLength(0); // pending until the step
    step(world, TICK_DT_S);
    expect(events.filter((e) => e.type === "building.placed")).toEqual([
      { type: "building.placed", buildingId: 1, buildingType: WOOD, ownerId: "p0", gx: 20, gy: 28, rot: 1 },
    ]);
  });

  it("refuses outside a build phase (lobby, wave) and changes nothing", () => {
    const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(world, "p0", 10, 10);
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 40, rot: 0 })).toEqual({ ok: false, error: "not_build_phase" });
    startBuild(world);
    startWave(world);
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 40, rot: 0 })).toEqual({ ok: false, error: "not_build_phase" });
    expect(world.buildings.list).toHaveLength(0);
    expect(world.players.get("p0")?.wallet).toBe(balance.economy.startingWallet);
  });

  it("refuses an unknown player, type or rotation, or a corner off the lattice", () => {
    const { world } = setup();
    expect(placementError(world, "p9", { type: WOOD, gx: 40, gy: 40, rot: 0 })).toBe("unknown_player");
    expect(placementError(world, "p0", { type: "castle", gx: 40, gy: 40, rot: 0 })).toBe("unknown_type");
    expect(placementError(world, "p0", { type: "toString", gx: 40, gy: 40, rot: 0 })).toBe("unknown_type");
    expect(placementError(world, "p0", { type: WOOD, gx: 40, gy: 40, rot: 4 })).toBe("unknown_type");
    expect(placementError(world, "p0", { type: WOOD, gx: 40.5, gy: 40, rot: 0 })).toBe("blocked");
  });

  it("the footprint must lie inside the map; it may touch every edge, in both orientations (H2)", () => {
    const { world } = setup();
    expect(placementError(world, "p0", { type: WOOD, gx: 0, gy: 52, rot: 1 })).toBeNull(); // [0, 0.5] × [26, 28]
    expect(placementError(world, "p0", { type: WOOD, gx: 95, gy: 52, rot: 1 })).toBeNull(); // [47.5, 48]
    expect(placementError(world, "p0", { type: WOOD, gx: 96, gy: 52, rot: 1 })).toBe("blocked");
    expect(placementError(world, "p0", { type: WOOD, gx: 92, gy: 52, rot: 0 })).toBeNull(); // [46, 48]
    expect(placementError(world, "p0", { type: WOOD, gx: 93, gy: 52, rot: 0 })).toBe("blocked");
    expect(placementError(world, "p0", { type: WOOD, gx: 22, gy: 0, rot: 0 })).toBeNull(); // [11, 13] × [0, 0.5]
    expect(placementError(world, "p0", { type: WOOD, gx: 22, gy: 63, rot: 0 })).toBeNull(); // y up to 32
    expect(placementError(world, "p0", { type: WOOD, gx: 22, gy: 64, rot: 0 })).toBe("blocked");
  });

  it("L5: refuses within spawnClearM (2 m) of a wave spawn point", () => {
    const { world } = setup();
    expect(balance.buildings.spawnClearM).toBe(2);
    expect(placementError(world, "p0", { type: WOOD, gx: 34, gy: 2, rot: 0 })).toBe("blocked"); // [17, 19] × [1, 1.5], spawn (18, 0.5)
    expect(placementError(world, "p0", { type: WOOD, gx: 34, gy: 6, rot: 0 })).toBeNull(); // 2.5 m below it
  });

  it("refuses an overlap with another building but allows touching ones: walls, L corners, T joints (H2)", () => {
    const { world } = setup();
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 40, rot: 0 }).ok).toBe(true); // [20, 22] × [20, 20.5]
    expect(placementError(world, "p1", { type: WOOD, gx: 42, gy: 40, rot: 0 })).toBe("blocked"); // [21, 23]
    expect(placementError(world, "p1", { type: WOOD, gx: 41, gy: 39, rot: 1 })).toBe("blocked"); // a cross
    expect(placeBuilding(world, "p1", { type: WOOD, gx: 44, gy: 40, rot: 0 }).ok).toBe(true); // edge to edge: [22, 24]
    expect(placeBuilding(world, "p1", { type: WOOD, gx: 48, gy: 40, rot: 1 }).ok).toBe(true); // L corner: [24, 24.5] × [20, 22]
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 43, gy: 41, rot: 1 }).ok).toBe(true); // T joint: [21.5, 22] × [20.5, 22.5]
  });

  it("refuses a spot where a player stands (out players don't count) or an alive zombie is", () => {
    const { world } = setup();
    expect(placementError(world, "p1", { type: WOOD, gx: 18, gy: 19, rot: 0 })).toBe("blocked"); // [9, 11] × [9.5, 10], p0 at (10, 10)
    expect(placementError(world, "p1", { type: WOOD, gx: 18, gy: 21, rot: 0 })).toBeNull(); // y from 10.5: 0.5 m > 0.4 m radius
    const p0 = world.players.get("p0");
    if (p0) p0.status = "out";
    expect(placementError(world, "p1", { type: WOOD, gx: 18, gy: 19, rot: 0 })).toBeNull();
    spawnZombie(world, "walker", 40, 5);
    expect(placementError(world, "p1", { type: WOOD, gx: 78, gy: 9, rot: 0 })).toBe("blocked");
  });

  it("caps each player at 6 (FR51): the 7th is refused, others can still build", () => {
    const { world } = setup();
    const p0 = world.players.get("p0");
    if (p0) p0.wallet = 1000;
    for (let i = 0; i < 6; i++) expect(placeBuilding(world, "p0", { type: WOOD, gx: 10 + i * 6, gy: 50, rot: 0 }).ok).toBe(true);
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 80, gy: 56, rot: 0 })).toEqual({ ok: false, error: "limit" });
    expect(ownedCount(world, "p0")).toBe(6);
    expect(p0?.wallet).toBe(1000 - 6 * 40);
    expect(placeBuilding(world, "p1", { type: WOOD, gx: 80, gy: 56, rot: 0 }).ok).toBe(true);
    removeBuilding(world, 3); // destroyed (Story 3.5): a free slot again
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 80, gy: 10, rot: 0 }).ok).toBe(true);
  });

  it("refuses without enough money and changes nothing (the cap is checked first)", () => {
    const { world } = setup();
    const p0 = world.players.get("p0");
    if (p0) p0.wallet = 39;
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 40, rot: 0 })).toEqual({ ok: false, error: "money" });
    expect(p0?.wallet).toBe(39);
    expect(world.buildings.list).toHaveLength(0);
    expect(world.buildings.version).toBe(0);
    if (p0) p0.wallet = 40;
    expect(placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 40, rot: 0 }).ok).toBe(true);
    expect(p0?.wallet).toBe(0);
  });

  it("persists across waves (until destroyed)", () => {
    const { world } = setup();
    placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 40, rot: 0 });
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
    for (const id of [5, 2, 9]) addBuildingAt(world, { id, type: WOOD, ownerId: "p0", gx: id * 6, gy: 10, rot: 0, hp: 200 });
    expect(world.buildings.list.map((b) => b.id)).toEqual([2, 5, 9]);
    expect(world.buildings.nextId).toBe(10);
    expect(addBuildingAt(world, { id: 5, type: WOOD, ownerId: "p0", gx: 80, gy: 40, rot: 0, hp: 200 })).toBeNull();
    expect(addBuildingAt(world, { id: 11, type: "castle", ownerId: "p0", gx: 80, gy: 40, rot: 0, hp: 200 })).toBeNull();
    expect(removeBuilding(world, 5)).toBe(true);
    expect(removeBuilding(world, 5)).toBe(false);
    expect(world.buildings.version).toBe(4);
    expect(world.buildings.list.map((b) => b.id)).toEqual([2, 9]);
  });

  it("is in the World snapshot (determinism, Story 8.4)", () => {
    const { world } = setup();
    placeBuilding(world, "p0", { type: WOOD, gx: 40, gy: 40, rot: 0 });
    const s = snapshotWorld(world);
    expect(s.buildings).toMatchObject({ nextId: 2, version: 1, list: [{ id: 1, gx: 40, gy: 40, minX: 20, hp: 200 }] });
  });

  it("two Worlds with the same seed, inputs and placements stay identical", () => {
    const a = setup().world;
    const b = setup().world;
    for (const w of [a, b]) {
      expect(placeBuilding(w, "p0", { type: WOOD, gx: 18, gy: 14, rot: 0 }).ok).toBe(true); // [9, 11] × [7, 7.5], just above p0
      for (let i = 0; i < 60; i++) {
        setInput(w, "p0", { ...NEUTRAL_INPUT, seq: i + 1, moveX: Math.cos(i / 9), moveY: -1 });
        step(w, TICK_DT_S);
      }
    }
    expect(snapshotWorld(a)).toEqual(snapshotWorld(b));
  });
});

describe("damageBuilding (Story 3.5)", () => {
  it("keeps HP whole (fractional hits round, never to 0), destroys at 0 with building.destroyed", () => {
    const w = createWorld({ balance: loadBalance(), seed: 1, systems: { waves: () => {} } });
    const events: string[] = [];
    w.events.subscribe((e) => events.push(e.type));
    const b = addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 10, gy: 10, rot: 0, hp: 200 });
    if (!b) throw new Error("no building");
    expect(damageBuilding(w, b, 3.6)).toBe(false);
    expect(b.hp).toBe(196);
    damageBuilding(w, b, 0.2);
    expect(b.hp).toBe(195);
    expect(damageBuilding(w, b, 0)).toBe(false);
    expect(b.hp).toBe(195);
    const v = w.buildings.version;
    expect(damageBuilding(w, b, 1000)).toBe(true);
    expect(b.hp).toBe(0);
    expect(w.buildings.list).toHaveLength(0);
    expect(w.buildings.version).toBe(v + 1);
    w.events.flush();
    expect(events).toEqual(["building.destroyed"]);
  });
});
