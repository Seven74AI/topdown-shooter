import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, createWorld, loadBalance } from "@topdown/shared";
import { mirrorBuildings } from "./mirrorBuildings";

const balance = loadBalance();

describe("mirrorBuildings", () => {
  it("Story 8.3 E8-H3: a disowned building (owner → \"\") reaches the client World in place, version +1", () => {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    const entry = { type: "wood_barricade", owner: "p2", gx: 20, gy: 20, rot: 0, hp: 200, trap: 0 };
    const state = new Map([["50", entry]]);
    mirrorBuildings(state as never, world);
    const b = world.buildings.list.find((x) => x.id === 50);
    expect(b?.ownerId).toBe("p2");
    const v = world.buildings.version;
    entry.owner = "";
    mirrorBuildings(state as never, world);
    expect(world.buildings.list.find((x) => x.id === 50)).toBe(b);
    expect(b?.ownerId).toBe("");
    expect(world.buildings.version).toBe(v + 1);
    mirrorBuildings(state as never, world);
    expect(world.buildings.version).toBe(v + 1); // no change, no bump
  });

  /**
   * Retro E8-A2: every field the server can change after the entry was sent, "sent → changed →
   * synced": same Building object, the new value, and the version bump the renderers (and, for a
   * move of a wall, the Predictor's flow field: `wallVersion`) wait on.
   */
  function sent(entry: { type: string; owner: string; gx: number; gy: number; rot: number; hp: number; trap: number }) {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    const state = new Map([["7", entry]]);
    mirrorBuildings(state as never, world);
    const b = world.buildings.list.find((x) => x.id === 7);
    if (!b) throw new Error("not added");
    const v = world.buildings.version;
    const wv = world.buildings.wallVersion;
    const sync = (): void => {
      mirrorBuildings(state as never, world);
      expect(world.buildings.list.length).toBe(1);
      expect(world.buildings.list[0]).toBe(b);
    };
    return { world, b, v, wv, sync };
  }

  it("E8-A2: type (an upgrade) is retyped in place with its HP, version +1", () => {
    const entry = { type: "wood_barricade", owner: "p0", gx: 20, gy: 20, rot: 0, hp: 200, trap: 0 };
    const { world, b, v, sync } = sent(entry);
    entry.type = "reinforced_barricade";
    entry.hp = 350;
    sync();
    expect([b.type, b.hp, b.maxHp]).toEqual(["reinforced_barricade", 350, 350]);
    expect(world.buildings.version).toBe(v + 1);
  });

  it("E8-A2: gx, gy, rot (a move) relocate in place, version +1 and wallVersion +1 for a wall", () => {
    const entry = { type: "wood_barricade", owner: "p0", gx: 20, gy: 20, rot: 0, hp: 200, trap: 0 };
    const { world, b, v, wv, sync } = sent(entry);
    const minX = b.minX;
    entry.gx = 24;
    entry.gy = 22;
    entry.rot = 1;
    sync();
    expect([b.gx, b.gy, b.rot]).toEqual([24, 22, 1]);
    expect(b.minX).not.toBe(minX); // the footprint follows (collision)
    expect(world.buildings.version).toBe(v + 1);
    expect(world.buildings.wallVersion).toBe(wv + 1);
  });

  it("E8-A2: trap (the jaws) changes in place, version +1", () => {
    const entry = { type: "bear_trap", owner: "p0", gx: 20, gy: 20, rot: 0, hp: 60, trap: 0 };
    const { world, b, v, sync } = sent(entry);
    entry.trap = 1;
    sync();
    expect(b.trapState).toBe(1);
    expect(world.buildings.version).toBe(v + 1);
  });

  it("E8-A2: hp changes in place with no version bump (BuildingView redraws by its draw key)", () => {
    const entry = { type: "wood_barricade", owner: "p0", gx: 20, gy: 20, rot: 0, hp: 200, trap: 0 };
    const { world, b, v, sync } = sent(entry);
    entry.hp = 121;
    sync();
    expect(b.hp).toBe(121);
    expect(world.buildings.version).toBe(v);
  });
});
