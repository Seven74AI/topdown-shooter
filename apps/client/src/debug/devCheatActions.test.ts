import { describe, expect, it } from "vitest";
import { TICK_DT_S, ZOMBIE_STATE, addPlayer, createWorld, loadBalance, placeBuilding, setBuildReady, startBuild, step, type World } from "@topdown/shared";
import { clampSpawnCount, damageNearestBuilding, leaveLast, parseSeed } from "./devCheatActions";

const balance = loadBalance();

describe("dev cheat helpers", () => {
  it("clamps the spawn count to 1–200", () => {
    expect(clampSpawnCount(0)).toBe(1);
    expect(clampSpawnCount(57.4)).toBe(57);
    expect(clampSpawnCount(999)).toBe(200);
    expect(clampSpawnCount(Number.NaN)).toBe(1);
  });

  it("parses a uint32 seed, decimal or hex", () => {
    expect(parseSeed(" 12345 ")).toBe(12345);
    expect(parseSeed("0xdeadbeef")).toBe(0xdeadbeef);
    expect(parseSeed("4294967295")).toBe(4294967295);
    expect(parseSeed("4294967296")).toBeNull();
    expect(parseSeed("-1")).toBeNull();
    expect(parseSeed("1.5")).toBeNull();
    expect(parseSeed("")).toBeNull();
  });

  it("leaveLast(5) empties the queue and leaves 5 wave zombies, which then rush", () => {
    // Frozen zombies: this test is about the wave bookkeeping, not the chase.
    const world: World = createWorld({ balance, seed: 9, systems: { zombies: () => {} } });
    addPlayer(world, "local", world.map.widthM / 2, world.map.heightM / 2);
    startBuild(world);
    setBuildReady(world, "local", true); // Story 3.1: skip the build phase
    for (let i = 0; i < 20; i++) step(world, TICK_DT_S); // the first spawn batches
    expect(world.run.phase).toBe("wave");
    expect(world.waves.queued).toBeGreaterThan(0);
    leaveLast(world, 5);
    step(world, TICK_DT_S);
    expect(world.waves.queued).toBe(0);
    expect(world.waves.remaining).toBe(5);
    expect(world.waves.rushing).toBe(true);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) expect(z.state[z.aliveIds[i] as number]).toBe(ZOMBIE_STATE.RUSH);
  });
});

describe("damageNearestBuilding (Story 3.7)", () => {
  it("takes half the max HP from the nearest building, never below 1; none → null", () => {
    const world = createWorld({ balance: loadBalance(), seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "local", 10, 10);
    startBuild(world);
    expect(damageNearestBuilding(world, 10, 10, 0.5)).toBeNull();
    const p = world.players.get("local");
    if (p) p.wallet = 1000;
    // gx/gy: min corner in 0.5 m lattice units (3.4 review): (20, 20) m far, (12, 14) m near.
    expect(placeBuilding(world, "local", { type: "wood_barricade", gx: 40, gy: 40, rot: 0 }).ok).toBe(true);
    expect(placeBuilding(world, "local", { type: "wood_barricade", gx: 24, gy: 28, rot: 0 }).ok).toBe(true);
    const b = damageNearestBuilding(world, 10, 10, 0.5);
    expect([b?.gx, b?.hp]).toEqual([24, 100]);
    damageNearestBuilding(world, 10, 10, 0.5);
    expect(b?.hp).toBe(1);
    expect(world.buildings.list.find((x) => x.gx === 40)?.hp).toBe(200);
  });
});
