import { describe, expect, it } from "vitest";
import { TICK_DT_S, ZOMBIE_STATE, addPlayer, createWorld, loadBalance, step, type World } from "@topdown/shared";
import { clampSpawnCount, leaveLast, parseSeed } from "./devCheatActions";

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
    for (let i = 0; i < 80; i++) step(world, TICK_DT_S); // intro (3 s) + first spawn batches
    expect(world.waves.phase).toBe("active");
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
