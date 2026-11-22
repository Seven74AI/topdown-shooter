import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { addPlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { placeBuilding, removeBuilding, type Building } from "./buildings";
import { buildingAtPoint, repairBuilding, repairCost, repairError } from "./repair";

/** Story 3.7: repair rules (one mechanic per test: no wave director). */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const WOOD = "wood_barricade";

function setup(): { world: World; events: SimEvent[]; b: Building } {
  const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
  addPlayer(world, "p0", 10, 10);
  addPlayer(world, "p1", 30, 20);
  startBuild(world);
  const r = placeBuilding(world, "p0", { type: WOOD, gx: 10, gy: 14, rot: 0 });
  if (!r.ok) throw new Error(r.error);
  step(world, TICK_DT_S); // deliver building.placed
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, events, b: r.value };
}

describe("repairCost (Story 3.7)", () => {
  it("is 50 % of the price from buildings.json: the Wood barricade costs 20", () => {
    expect(balance.buildings.repairShare).toBe(0.5);
    expect(repairCost(balance, WOOD)).toBe(20);
    expect(repairCost(balance, "castle")).toBe(0);
  });

  it("rounds up (a repair is never free): price 41 → 21, share 0.01 of 40 → 1", () => {
    const odd = loadBalance(withOverrides(bundledBalanceFiles(), [["buildings", "types.wood_barricade.price", 41]]));
    expect(repairCost(odd, WOOD)).toBe(21);
    const tiny = loadBalance(withOverrides(bundledBalanceFiles(), [["buildings", "repairShare", 0.01]]));
    expect(repairCost(tiny, WOOD)).toBe(1);
  });
});

describe("repairBuilding (Story 3.7)", () => {
  it("restores full HP, charges the full-repair cost whatever the damage, and emits building.repaired with the next step", () => {
    const { world, events, b } = setup();
    const before = world.players.get("p0")?.wallet as number;
    b.hp = 199.5; // shown as 200 (ceil): full, like the client's panel says (3.7 review)
    expect(repairBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "full_hp" });
    b.hp = 199;
    const r = repairBuilding(world, "p0", b.id);
    expect(r).toEqual({ ok: true, value: { building: b, cost: 20 } });
    expect(b.hp).toBe(200);
    expect(world.players.get("p0")?.wallet).toBe(before - 20);
    expect(world.players.get("p0")?.earned).toBe(0);
    expect(world.buildings.version).toBe(1); // HP only: no flow-field rebuild
    expect(events.filter((e) => e.type === "building.repaired")).toHaveLength(0);
    step(world, TICK_DT_S);
    // x/y: the footprint's centre (3.4 review: gx/gy are the min corner on the 0.5 m lattice).
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    expect(events.filter((e) => e.type === "building.repaired")).toEqual([{ type: "building.repaired", buildingId: b.id, playerId: "p0", cost: 20, x: cx, y: cy }]);
  });

  it("a teammate repairs my building and pays from their own wallet; the owner stays the owner", () => {
    const { world, b } = setup();
    const mine = world.players.get("p0")?.wallet as number;
    const theirs = world.players.get("p1")?.wallet as number;
    b.hp = 30;
    expect(repairBuilding(world, "p1", b.id).ok).toBe(true);
    expect(b.hp).toBe(200);
    expect(b.ownerId).toBe("p0");
    expect(world.players.get("p0")?.wallet).toBe(mine);
    expect(world.players.get("p1")?.wallet).toBe(theirs - 20);
  });

  it("a repeat is refused as full_hp: one damage is never charged twice", () => {
    const { world, b } = setup();
    b.hp = 100;
    const before = world.players.get("p0")?.wallet as number;
    expect(repairBuilding(world, "p0", b.id).ok).toBe(true);
    expect(repairBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "full_hp" });
    expect(world.players.get("p0")?.wallet).toBe(before - 20);
  });

  it("refuses in order (unknown player → phase → gone → full HP → money) and changes nothing", () => {
    const { world, events, b } = setup();
    const me = world.players.get("p0");
    if (!me) throw new Error("no p0");
    b.hp = 100;
    me.wallet = 19;
    expect(repairError(world, "p9", b.id)).toBe("unknown_player");
    expect(repairBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "money" });
    me.wallet = 20;
    expect(repairError(world, "p0", b.id)).toBeNull();
    expect(repairBuilding(world, "p0", 999)).toEqual({ ok: false, error: "gone" });
    b.hp = 200;
    me.wallet = 0;
    expect(repairBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "full_hp" }); // before money
    b.hp = 100;
    startWave(world);
    expect(repairBuilding(world, "p0", 999)).toEqual({ ok: false, error: "not_build_phase" }); // before gone
    expect(repairBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "not_build_phase" });
    expect(b.hp).toBe(100);
    expect(me.wallet).toBe(0);
    step(world, TICK_DT_S);
    expect(events.filter((e) => e.type === "building.repaired")).toHaveLength(0);
  });

  it("a building destroyed before the request arrives is refused as gone", () => {
    const { world, b } = setup();
    b.hp = 10;
    removeBuilding(world, b.id); // Story 3.5's destruction
    const before = world.players.get("p0")?.wallet;
    expect(repairBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "gone" });
    expect(world.players.get("p0")?.wallet).toBe(before);
  });
});

describe("buildingAtPoint (Story 3.7)", () => {
  // Relative to the footprint boxes (min/max in metres), so it holds for any grid anchoring.
  it("hits the footprint grown by the tolerance, and picks the nearest centre where two overlap", () => {
    const { world, b } = setup();
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    expect(buildingAtPoint(world, cx, cy, 0)).toBe(b);
    expect(buildingAtPoint(world, cx, b.maxY + 0.25, 0)).toBeNull();
    expect(buildingAtPoint(world, cx, b.maxY + 0.25, 0.4)).toBe(b);
    expect(buildingAtPoint(world, b.maxX + 0.39, cy, 0.4)).toBe(b);
    expect(buildingAtPoint(world, b.maxX + 0.41, cy, 0.4)).toBeNull();
    const r = placeBuilding(world, "p0", { type: WOOD, gx: b.gx, gy: b.gy + 1, rot: 0 }); // just below, not overlapping
    if (!r.ok) throw new Error(r.error);
    const b2 = r.value;
    expect(b2.minY).toBeGreaterThanOrEqual(b.maxY);
    const mid = (b.maxY + b2.minY) / 2;
    expect(buildingAtPoint(world, cx, mid - 0.05, 0.4)).toBe(b);
    expect(buildingAtPoint(world, cx, mid + 0.05, 0.4)).toBe(b2);
  });
});
