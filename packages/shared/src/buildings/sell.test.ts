import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, step } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { addPlayer, type PlayerState } from "../player/player";
import { endWave, startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { BEAR_TRAP_STATE, buildingById, placeBuilding, placementError, type Building } from "./buildings";
import { repairBuilding, repairCost, repairError } from "./repair";
import { sellBuilding, sellError, sellRefund, sellRefundFor } from "./sell";
import { upgradeBuilding, upgradeError } from "./upgrade";

/** Story 5.20 (BX-6): take back and sell. F2 no money loop, F3 owner only, F4 build phase only, F9 standing only. */
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
  const p0 = world.players.get("p0") as PlayerState;
  const p1 = world.players.get("p1") as PlayerState;
  const place = (type: string, gx: number, gy: number, rot = 0, owner = "p0"): Building => {
    const r = placeBuilding(world, owner, { type, gx, gy, rot });
    if (!r.ok) throw new Error(`${type}: ${r.error}`);
    return r.value;
  };
  /** A whole wave (nothing spawns: no wave system) then the next build start. */
  const nextBuild = (): void => {
    startWave(world);
    endWave(world);
  };
  return { world, events, p0, p1, place, nextBuild };
}

const sold = (events: readonly SimEvent[]) => events.filter((e): e is Extract<SimEvent, { type: "building.sold" }> => e.type === "building.sold");

describe("sellRefundFor (F2)", () => {
  it("this phase's spend back whole, the rest at the share rounded down", () => {
    expect(sellRefundFor(0.5, 40, 40)).toBe(40);
    expect(sellRefundFor(0.5, 40, 0)).toBe(20);
    expect(sellRefundFor(0.5, 90, 50)).toBe(70); // old wood upgraded now: 20 + 50 (not 45 + 50)
    expect(sellRefundFor(0.5, 160, 0)).toBe(80);
    expect(sellRefundFor(0.5, 81, 0)).toBe(40); // rounded down
    expect(sellRefundFor(0.5, 40, 99)).toBe(40); // never more than paid
  });
});

describe("take back and sell (Story 5.20)", () => {
  it("take back in the same build phase: 100 %, removed, money.earned refund, building.sold at its centre", () => {
    const { world, events, p0, place } = setup();
    const b = place("wood_barricade", 40, 20, 1);
    const w = p0.wallet;
    const earned = p0.earned;
    const v = world.buildings.version;
    const wv = world.buildings.wallVersion;
    const r = sellBuilding(world, "p0", b.id);
    expect(r).toEqual({ ok: true, value: { buildingId: b.id, type: "wood_barricade", refund: 40 } });
    expect(p0.wallet - w).toBe(40);
    expect(p0.earned).toBe(earned); // money returned, not income
    expect(buildingById(world, b.id)).toBeUndefined();
    expect([world.buildings.version - v, world.buildings.wallVersion - wv]).toEqual([1, 1]);
    world.events.flush();
    expect(sold(events).map((e) => [e.buildingId, e.buildingType, e.rot, e.ownerId, e.refund, e.x, e.y])).toEqual([[b.id, "wood_barricade", 1, "p0", 40, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]]);
    expect(events.some((e) => e.type === "money.earned" && e.reason === "refund" && e.amount === 40 && e.playerId === "p0")).toBe(true);
  });

  it("sold in a later build phase: 50 % rounded down (= its repair cost)", () => {
    const { world, p0, place, nextBuild } = setup();
    const wood = place("wood_barricade", 40, 20, 1);
    const trap = place("spike_trap", 10, 10);
    nextBuild();
    expect(world.run.phase).toBe("build");
    expect([wood.paid, wood.paidThisBuild, trap.paidThisBuild]).toEqual([40, 0, 0]);
    const w = p0.wallet;
    expect(sellRefund(world, wood)).toBe(20);
    expect(sellBuilding(world, "p0", wood.id).ok).toBe(true);
    expect(p0.wallet - w).toBe(20);
    expect(20).toBe(repairCost(balance, "wood_barricade"));
    expect(sellRefund(world, trap)).toBe(Math.floor(80 / 2));
  });

  it("upgrade then sell in the same phase: 100 % of both; upgrade last phase, sell now: 50 % of everything", () => {
    const { world, p0, place, nextBuild } = setup();
    const a = place("wood_barricade", 40, 20, 1);
    expect(upgradeBuilding(world, "p0", a.id).ok).toBe(true);
    expect([a.paid, a.paidThisBuild]).toEqual([90, 90]);
    let w = p0.wallet;
    expect(sellBuilding(world, "p0", a.id).ok).toBe(true);
    expect(p0.wallet - w).toBe(90);
    const b = place("wood_barricade", 44, 20, 1);
    upgradeBuilding(world, "p0", b.id);
    upgradeBuilding(world, "p0", b.id);
    nextBuild();
    expect([b.type, b.paid, b.paidThisBuild]).toEqual(["metal_barricade", 160, 0]);
    w = p0.wallet;
    expect(sellBuilding(world, "p0", b.id).ok).toBe(true);
    expect(p0.wallet - w).toBe(80); // = metal's repair cost: no money loop
    expect(repairCost(balance, "metal_barricade")).toBe(80);
  });

  it("old wood upgraded this phase: 50 % of the old part + 100 % of the step (70, never 95)", () => {
    const { world, p0, place, nextBuild } = setup();
    const b = place("wood_barricade", 40, 20, 1);
    nextBuild();
    upgradeBuilding(world, "p0", b.id);
    const w = p0.wallet;
    sellBuilding(world, "p0", b.id);
    expect(p0.wallet - w).toBe(70);
  });

  it("repairs are never refunded; sell + rebuy of a worn building costs exactly its repair", () => {
    for (const type of ["wood_barricade", "spike_trap", "mine", "bear_trap", "auto_turret", "med_station"]) {
      const { world, p0, place, nextBuild } = setup(5000); // a fresh run each (6 waves end the run)
      const b = place(type, 8, 40);
      nextBuild();
      if (b.maxHp > 1) {
        b.hp = 1;
        const rr = repairBuilding(world, "p0", b.id);
        expect([type, rr.ok ? "ok" : rr.error]).toEqual([type, "ok"]);
      }
      expect(b.paid).toBe(balance.buildings.types[type]?.price); // the repair didn't count
      b.hp = 1;
      const w = p0.wallet;
      sellBuilding(world, "p0", b.id);
      const again = place(type, 8, 40);
      expect([type, w - p0.wallet]).toEqual([type, repairCost(balance, type)]);
      expect(again.hp).toBe(again.maxHp);
      sellBuilding(world, "p0", again.id); // take back (100 %) to clear the spot
    }
  });

  it("check order: unknown → not_alive → not_build_phase → gone → not_owner; nothing changes on an error", () => {
    const { world, p0, p1, place } = setup();
    const b = place("wood_barricade", 40, 20, 1);
    const w0 = p0.wallet;
    const w1 = p1.wallet;
    expect(sellError(world, "p9", b.id)).toBe("unknown_player");
    expect(sellBuilding(world, "p1", b.id)).toEqual({ ok: false, error: "not_owner" });
    expect(sellError(world, "p0", 999)).toBe("gone");
    p0.status = "downed";
    expect(sellError(world, "p0", 999)).toBe("not_alive"); // before gone
    p0.status = "out";
    expect(sellBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "not_alive" });
    p0.status = "alive";
    startWave(world);
    expect(sellBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "not_build_phase" });
    expect([p0.wallet, p1.wallet, buildingById(world, b.id) === b]).toEqual([w0, w1, true]);
  });

  it("a repeated sell is gone: refunded once", () => {
    const { world, p0, place } = setup();
    const b = place("mine", 20, 20);
    const w = p0.wallet;
    expect(sellBuilding(world, "p0", b.id).ok).toBe(true);
    expect(sellBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "gone" });
    expect(p0.wallet - w).toBe(35); // the mine's price (balance pass B8)
  });

  it("a mine sold with a zombie standing on it in the build phase: removed, no blast; floor sells keep wallVersion", () => {
    const { world, events, place } = setup();
    const m = place("mine", 20, 20);
    const z = spawnZombie(world, "walker", (m.minX + m.maxX) / 2, (m.minY + m.maxY) / 2);
    expect(z).toBeGreaterThanOrEqual(0);
    const wv = world.buildings.wallVersion;
    expect(sellBuilding(world, "p0", m.id).ok).toBe(true);
    expect(world.buildings.wallVersion).toBe(wv);
    for (let i = 0; i < 10; i++) step(world, TICK_DT_S);
    world.events.flush();
    expect(events.some((e) => e.type === "mine.exploded" || e.type === "explosion.happened")).toBe(false);
    expect(sold(events)).toHaveLength(1);
  });

  it("a bear trap sold while it holds a zombie lets it go", () => {
    const { world, place } = setup();
    const t = place("bear_trap", 20, 20);
    const z = spawnZombie(world, "walker", 10.5, 10.5);
    t.trapState = BEAR_TRAP_STATE.HOLDING;
    t.heldZombie = z;
    t.heldGen = world.zombies.generation[z] as number;
    world.zombies.holdTicks[z] = 40;
    expect(sellBuilding(world, "p0", t.id).ok).toBe(true);
    expect(world.zombies.holdTicks[z]).toBe(0);
  });

  it("paidThisBuild resets at every build start; both fields are in snapshotWorld (determinism)", () => {
    const { world, place, nextBuild } = setup();
    const b = place("auto_turret", 20, 20);
    const snap = snapshotWorld(world) as { buildings: { list: { paid: number; paidThisBuild: number }[] } };
    expect(snap.buildings.list[0]).toMatchObject({ paid: 250, paidThisBuild: 250 });
    nextBuild();
    expect([b.paid, b.paidThisBuild]).toEqual([250, 0]);
  });
});

describe("review M1: no free healing by taking a med station back", () => {
  it("a med station that healed someone this build phase sells at the normal share (200 of 400), not 100 %; reset at the next build start", () => {
    const { world, p0, place, nextBuild } = setup(1000);
    const m = place("med_station", 61, 31); // centre (31, 16): p0 (30, 16) stands in its 2 m reach
    expect(m.usedThisBuild).toBe(false);
    expect(sellRefund(world, m)).toBe(400); // bought now, not used yet: take back 100 %
    p0.hp = 50;
    for (let i = 0; i < 10; i++) step(world, TICK_DT_S);
    expect(p0.hp).toBeGreaterThan(50); // it healed
    expect(m.usedThisBuild).toBe(true);
    const w = p0.wallet;
    expect(sellBuilding(world, "p0", m.id)).toMatchObject({ ok: true, value: { refund: 200 } });
    expect(p0.wallet - w).toBe(200);
    const again = place("med_station", 61, 31);
    p0.hp = 50;
    for (let i = 0; i < 4; i++) step(world, TICK_DT_S);
    expect(again.usedThisBuild).toBe(true);
    nextBuild();
    expect([again.usedThisBuild, again.paidThisBuild]).toEqual([false, 0]);
  });

  it("re-review: healing a TEAMMATE counts too: p1 healed in p0's station → p0's take-back gives 200", () => {
    const { world, p0, p1, place } = setup(1000);
    const m = place("med_station", 61, 31); // centre (31, 16): p1 (32, 16) is in reach; p0 stays at full HP
    p1.hp = 50;
    for (let i = 0; i < 10; i++) step(world, TICK_DT_S);
    expect([p0.hp, p1.hp > 50, m.usedThisBuild]).toEqual([p0.maxHp, true, true]);
    const w = p0.wallet;
    expect(sellBuilding(world, "p0", m.id)).toMatchObject({ ok: true, value: { refund: 200 } });
    expect(p0.wallet - w).toBe(200);
  });

  it("standing in reach at full HP is no use: still a 100 % take-back", () => {
    const { world, p0, place } = setup(1000);
    const m = place("med_station", 61, 31);
    for (let i = 0; i < 10; i++) step(world, TICK_DT_S);
    expect([p0.hp, m.usedThisBuild, sellRefund(world, m)]).toEqual([p0.maxHp, false, 400]);
  });
});

describe("standing only (Story 5.20, 5.11 R2): place, repair, upgrade refuse a downed or out player", () => {
  for (const status of ["downed", "out"] as const) {
    it(`${status}: not_alive, nothing charged`, () => {
      const { world, p0, place } = setup();
      const b = place("wood_barricade", 40, 20, 1);
      b.hp = 1;
      const w = p0.wallet;
      p0.status = status;
      expect(placementError(world, "p0", { type: "wood_barricade", gx: 50, gy: 20, rot: 1 })).toBe("not_alive");
      expect(placeBuilding(world, "p0", { type: "wood_barricade", gx: 50, gy: 20, rot: 1 })).toEqual({ ok: false, error: "not_alive" });
      expect(repairError(world, "p0", b.id)).toBe("not_alive");
      expect(repairBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "not_alive" });
      expect(upgradeError(world, "p0", b.id)).toBe("not_alive");
      expect(upgradeBuilding(world, "p0", b.id)).toEqual({ ok: false, error: "not_alive" });
      expect(sellError(world, "p0", b.id)).toBe("not_alive");
      expect([p0.wallet, b.hp, b.type]).toEqual([w, 1, "wood_barricade"]);
      p0.status = "alive";
      expect(repairError(world, "p0", b.id)).toBeNull();
    });
  }
});
