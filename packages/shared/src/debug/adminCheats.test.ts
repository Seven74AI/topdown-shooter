import { describe, expect, it } from "vitest";
import { createWorld, step, type World } from "../core/world";
import { TICK_DT_S } from "../config/constants";
import { addPlayer } from "../player/player";
import { setBuildReady, startBuild } from "../run/runStateMachine";
import { loadBalance } from "../config/balance";
import { damagePlayerBy } from "../combat/damage";
import { adminCheatSchema, type AdminCheat } from "../net/messages";
import { placeBuilding } from "../buildings/buildings";
import { CHEAT_MONEY, CHEAT_RING_RADIUS_M, applyAdminCheat } from "./adminCheats";

const balance = loadBalance();

/** Two players (admin p0, teammate p1) in a build phase; frozen zombies (this is about the cheat, not the chase). */
function twoPlayers(): World {
  const world = createWorld({ balance, seed: 7, systems: { zombies: () => {} } });
  addPlayer(world, "p0", 20, 16);
  addPlayer(world, "p1", 30, 16);
  startBuild(world);
  return world;
}

function toWave(world: World): void {
  setBuildReady(world, "p0", true);
  setBuildReady(world, "p1", true);
  for (let i = 0; i < 5 && world.run.phase !== "wave"; i++) step(world, TICK_DT_S);
  expect(world.run.phase).toBe("wave");
}

const cheat = (c: unknown): AdminCheat => adminCheatSchema.parse(c);

describe("adminCheatSchema (Story 10.12)", () => {
  it("accepts every panel cheat", () => {
    for (const c of [
      { cheat: "spawn", type: "walker", count: 50, where: "ring" },
      { cheat: "spawn", type: "runner", count: 1, where: "view", view: { x: 1, y: 2, w: 24, h: 13.5 } },
      { cheat: "skip_wave" },
      { cheat: "leave_last" },
      { cheat: "behemoth" },
      { cheat: "event", kind: "stampede" },
      { cheat: "loadout", w0: "pistol", w1: null },
      { cheat: "money" },
      { cheat: "damage_building" },
      { cheat: "god", on: true },
      { cheat: "decay", stage: 5 },
      { cheat: "blackout", pct: -1 },
      { cheat: "blackout", pct: 5 },
      { cheat: "restart", seed: 0xffffffff },
    ]) expect(adminCheatSchema.safeParse(c).success, JSON.stringify(c)).toBe(true);
  });

  it("refuses out-of-range values, unknown names and extra fields", () => {
    for (const c of [
      { cheat: "spawn", type: "walker", count: 10_000, where: "ring" },
      { cheat: "spawn", type: "walker", count: 0, where: "ring" },
      { cheat: "spawn", type: "dragon", count: 5, where: "ring" },
      { cheat: "spawn", type: "walker", count: 5, where: "ring", view: { x: 0, y: 0, w: 1e9, h: 1 } },
      { cheat: "decay", stage: 9 },
      { cheat: "decay", stage: 0 },
      { cheat: "event", kind: "gas_leak" },
      { cheat: "blackout", pct: 50 },
      { cheat: "restart", seed: -1 },
      { cheat: "restart", seed: 2 ** 32 },
      { cheat: "money", amount: 1e9 },
      { cheat: "god", on: true, playerId: "p1" },
      { cheat: "admin" },
      { cheat: "loadout", w0: "x".repeat(33), w1: null },
    ]) expect(adminCheatSchema.safeParse(c).success, JSON.stringify(c)).toBe(false);
  });
});

describe("applyAdminCheat (Story 10.12, AC 3)", () => {
  it("spawn ring: N zombies around the admin's own survivor", () => {
    const world = twoPlayers();
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "spawn", type: "walker", count: 12, where: "ring" }))).toBe(true);
    const z = world.zombies;
    expect(z.aliveCount).toBe(12);
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      expect(Math.hypot((z.x[id] as number) - 20, (z.y[id] as number) - 16)).toBeLessThan(CHEAT_RING_RADIUS_M + 1);
    }
  });

  it("spawn view: inside the sent view (or a default view around the admin)", () => {
    const world = twoPlayers();
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "spawn", type: "walker", count: 20, where: "view", view: { x: 2, y: 2, w: 10, h: 8 } }))).toBe(true);
    const z = world.zombies;
    expect(z.aliveCount).toBe(20);
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      expect(z.x[id]).toBeGreaterThanOrEqual(2);
      expect(z.x[id]).toBeLessThanOrEqual(12);
    }
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "spawn", type: "walker", count: 5, where: "view" }))).toBe(true);
    expect(z.aliveCount).toBe(25);
  });

  it("a seat with no survivor changes nothing", () => {
    const world = twoPlayers();
    expect(applyAdminCheat(world, "p3", cheat({ cheat: "spawn", type: "walker", count: 12, where: "ring" }))).toBe(false);
    expect(applyAdminCheat(world, "p3", cheat({ cheat: "money" }))).toBe(false);
    expect(world.zombies.aliveCount).toBe(0);
  });

  it("money and loadout: the admin's own only; unknown weapons refused", () => {
    const world = twoPlayers();
    const p0 = world.players.get("p0")!;
    const p1 = world.players.get("p1")!;
    const w0 = p0.wallet;
    const w1 = p1.wallet;
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "money" }))).toBe(true);
    expect([p0.wallet - w0, p1.wallet - w1, p0.earned]).toEqual([CHEAT_MONEY, 0, 0]);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "loadout", w0: "shotgun", w1: "smg" }))).toBe(true);
    expect(p0.loadout.slots.map((s) => s?.weapon ?? null)).toEqual(["shotgun", "smg"]);
    expect(p1.loadout.slots[0]?.weapon).toBe("pistol");
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "loadout", w0: "railgun", w1: null }))).toBe(false);
    expect(p0.loadout.slots[0]?.weapon).toBe("shotgun");
  });

  it("god mode protects the admin only (Q4 B); off again", () => {
    const world = twoPlayers();
    toWave(world);
    const p0 = world.players.get("p0")!;
    const p1 = world.players.get("p1")!;
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "god", on: true }))).toBe(true);
    expect(damagePlayerBy(world, p0, 30, "zombie", null)).toBe(0);
    expect(damagePlayerBy(world, p1, 30, "zombie", null)).toBe(30);
    expect(p0.hp).toBe(p0.maxHp);
    applyAdminCheat(world, "p0", cheat({ cheat: "god", on: false }));
    expect(damagePlayerBy(world, p0, 30, "zombie", null)).toBe(30);
  });

  it("skip wave / leave last only in a wave; skip ends it", () => {
    const world = twoPlayers();
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "skip_wave" }))).toBe(false);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "leave_last" }))).toBe(false);
    toWave(world);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "leave_last" }))).toBe(true);
    expect(world.waves.queued).toBe(0);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "skip_wave" }))).toBe(true);
    step(world, TICK_DT_S);
    expect(world.run.phase).toBe("build");
  });

  it("Behemoth starts its warning in a wave; events, blackout", () => {
    const world = twoPlayers();
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "behemoth" }))).toBe(false);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "blackout", pct: 10 }))).toBe(true);
    expect(world.lights.forcedPct).toBe(10);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "event", kind: "car_alarm" }))).toBe(true);
    toWave(world);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "behemoth" }))).toBe(true);
    expect(world.boss.state).not.toBe("none");
  });

  it("decay stage: build phase only", () => {
    const world = twoPlayers();
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "decay", stage: 3 }))).toBe(true);
    expect(world.decay.stage).toBe(3);
    toWave(world);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "decay", stage: 1 }))).toBe(false);
    expect(world.decay.stage).toBe(3);
  });

  it("damage building: the nearest to the admin", () => {
    const world = twoPlayers();
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "damage_building" }))).toBe(false);
    world.players.get("p0")!.wallet = 1000;
    expect(placeBuilding(world, "p0", { type: "wood_barricade", gx: 44, gy: 30, rot: 0 }).ok).toBe(true);
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "damage_building" }))).toBe(true);
    const b = world.buildings.list[0]!;
    expect(b.hp).toBe(b.maxHp / 2);
  });

  it("restart is the room's (never applied here)", () => {
    const world = twoPlayers();
    expect(applyAdminCheat(world, "p0", cheat({ cheat: "restart", seed: 5 }))).toBe(false);
  });
});
