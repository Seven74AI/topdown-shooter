import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, step } from "../core/world";
import type { MapBox } from "../map/districtMap";
import { destroyBlockedBuildings } from "../decay/decaySystem";
import { addPlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { updatePathing } from "../zombies/flowField";
import { placeBuilding, type Building } from "./buildings";
import { repairBuilding, repairCost } from "./repair";
import { upgradeBuilding, upgradeError } from "./upgrade";

/** Story 5.9 F9 "upgrades are honest": the barricade ladder (DD1 A), owner only, build phase only, charged once. */
const noop: SystemFn = () => {};
const balance = loadBalance();

function setup(wallet = 1000) {
  const world = createWorld({ balance, seed: 1, systems: { waves: noop } });
  addPlayer(world, "p0", 30, 16);
  addPlayer(world, "p1", 32, 16);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  for (const p of world.players.values()) p.wallet = wallet;
  const r = placeBuilding(world, "p0", { type: "wood_barricade", gx: 20 / BUILD_GRID_M, gy: 10 / BUILD_GRID_M, rot: 1 });
  if (!r.ok) throw new Error(r.error);
  return { world, events, b: r.value, p0: world.players.get("p0") as NonNullable<ReturnType<typeof world.players.get>>, p1: world.players.get("p1") as NonNullable<ReturnType<typeof world.players.get>> };
}

describe("barricade upgrade (Story 5.9)", () => {
  it("wood → reinforced → metal, prices 50 / 70, HP 350 / 600 full; same id, footprint and place", () => {
    const { world, events, b, p0 } = setup();
    const box = [b.minX, b.minY, b.maxX, b.maxY, b.gx, b.gy, b.rot];
    b.hp = 10;
    const w0 = p0.wallet;
    const r1 = upgradeBuilding(world, "p0", b.id);
    expect(r1.ok && r1.value.cost).toBe(50);
    expect([b.type, b.hp, b.maxHp, w0 - p0.wallet]).toEqual(["reinforced_barricade", 350, 350, 50]);
    const r2 = upgradeBuilding(world, "p0", b.id);
    expect(r2.ok && r2.value.cost).toBe(70);
    expect([b.type, b.hp, b.maxHp, w0 - p0.wallet]).toEqual(["metal_barricade", 600, 600, 120]); // the GDD's +120
    expect([b.minX, b.minY, b.maxX, b.maxY, b.gx, b.gy, b.rot]).toEqual(box);
    world.events.flush();
    const ups = events.filter((e) => e.type === "building.upgraded");
    expect(ups.map((e) => (e.type === "building.upgraded" ? [e.buildingId, e.playerId, e.cost, e.toType] : []))).toEqual([
      [b.id, "p0", 50, "reinforced_barricade"],
      [b.id, "p0", 70, "metal_barricade"],
    ]);
  });

  it("metal is the last tier (not_upgradable); turrets and floor types don't upgrade", () => {
    const { world, b } = setup();
    upgradeBuilding(world, "p0", b.id);
    upgradeBuilding(world, "p0", b.id);
    expect(upgradeError(world, "p0", b.id)).toBe("not_upgradable");
    const t = placeBuilding(world, "p0", { type: "spike_trap", gx: 10, gy: 10, rot: 0 });
    expect(t.ok && upgradeError(world, "p0", t.value.id)).toBe("not_upgradable");
  });

  it("not the owner → not_owner; a teammate can still repair", () => {
    const { world, b, p1 } = setup();
    const w = p1.wallet;
    expect(upgradeBuilding(world, "p1", b.id)).toEqual({ ok: false, error: "not_owner" });
    expect(p1.wallet).toBe(w);
    expect(b.type).toBe("wood_barricade");
    b.hp = 1;
    expect(repairBuilding(world, "p1", b.id).ok).toBe(true);
  });

  it("build phase only; gone; unknown player; money", () => {
    const { world, b, p0 } = setup();
    expect(upgradeError(world, "nobody", b.id)).toBe("unknown_player");
    expect(upgradeError(world, "p0", 999)).toBe("gone");
    p0.wallet = 49;
    expect(upgradeError(world, "p0", b.id)).toBe("money");
    p0.wallet = 50;
    expect(upgradeError(world, "p0", b.id)).toBeNull();
    startWave(world);
    expect(upgradeBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "not_build_phase" });
    expect([b.type, p0.wallet]).toEqual(["wood_barricade", 50]);
  });

  it("a double request charges once per tier: the second buys the NEXT step only if it can be paid, never the same one twice", () => {
    const { world, b, p0 } = setup(60);
    p0.wallet = 60;
    expect(upgradeBuilding(world, "p0", b.id).ok).toBe(true);
    expect(upgradeBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "money" }); // 10 left, the next step is 70
    expect([b.type, p0.wallet]).toEqual(["reinforced_barricade", 10]);
  });

  it("repair cost after upgrade 45 / 80; decay refund 45 / 80 (F9: the tier's total price)", () => {
    expect(repairCost(balance, "reinforced_barricade")).toBe(45);
    expect(repairCost(balance, "metal_barricade")).toBe(80);
    for (const [steps, refund] of [
      [1, 45],
      [2, 80],
    ] as const) {
      const { world, b, p0 } = setup();
      for (let i = 0; i < steps; i++) upgradeBuilding(world, "p0", b.id);
      const w = p0.wallet;
      (world.obstacles.solids as MapBox[]).push({ name: "test_box", minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY } as MapBox);
      expect(destroyBlockedBuildings(world)).toBe(1);
      expect(p0.wallet - w).toBe(refund);
    }
  });

  it("an upgrade does not touch wallVersion or the flow field", () => {
    const { world, b } = setup();
    updatePathing(world);
    const grid = Array.from(world.pathing.nav.buildingAt);
    const wv = world.buildings.wallVersion;
    const v = world.buildings.version;
    upgradeBuilding(world, "p0", b.id);
    upgradeBuilding(world, "p0", b.id);
    updatePathing(world);
    step(world, TICK_DT_S);
    expect(world.buildings.version).toBe(v + 2);
    expect(world.buildings.wallVersion).toBe(wv);
    expect(Array.from(world.pathing.nav.buildingAt)).toEqual(grid);
    expect((world.buildings.list[0] as Building).solid).toBe(true);
  });
});
