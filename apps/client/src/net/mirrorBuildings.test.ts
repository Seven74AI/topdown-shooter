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
});
