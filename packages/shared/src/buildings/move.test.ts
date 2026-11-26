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
import { BEAR_TRAP_STATE, buildingById, footprint, ownedCount, placeBuilding, type Building } from "./buildings";
import { MOVE_ERRORS, moveBuilding, moveError } from "./move";
import { sellBuilding, sellRefund } from "./sell";
import { upgradeBuilding } from "./upgrade";

/** Story 5.22 (BX-8, in 5.21): move a building. F3 owner only, F4 build phase only, F5 keeps everything but the spot, F6 placement rules with itself ignored, F8 free, F9 standing. */
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
  return { world, events, p0, p1, place };
}

const moved = (events: readonly SimEvent[]) => events.filter((e): e is Extract<SimEvent, { type: "building.moved" }> => e.type === "building.moved");

describe("moveBuilding (Story 5.22)", () => {
  it("moves a wall: new corner, rotation and footprint; version +1, wallVersion +1; building.moved; free; the count unchanged", () => {
    const { world, events, p0, place } = setup();
    const b = place("wood_barricade", 40, 20, 0);
    const w = p0.wallet;
    const n = ownedCount(world, "p0");
    const v = world.buildings.version;
    const wv = world.buildings.wallVersion;
    const r = moveBuilding(world, "p0", { id: b.id, gx: 44, gy: 24, rot: 1 });
    expect(r.ok).toBe(true);
    expect([b.gx, b.gy, b.rot]).toEqual([44, 24, 1]);
    const box = footprint(balance.buildings.types.wood_barricade as never, 44, 24, 1, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([box.minX, box.minY, box.maxX, box.maxY]);
    expect([world.buildings.version - v, world.buildings.wallVersion - wv]).toEqual([1, 1]);
    expect([p0.wallet, ownedCount(world, "p0")]).toEqual([w, n]); // F8
    world.events.flush();
    expect(moved(events).map((e) => [e.buildingId, e.buildingType, e.ownerId, e.gx, e.gy, e.rot])).toEqual([[b.id, "wood_barricade", "p0", 44, 24, 1]]);
  });

  it("a floor building (spike trap, mine) moves without dirtying the flow field (wallVersion unchanged)", () => {
    const { world, place } = setup();
    for (const type of ["spike_trap", "mine", "bear_trap"]) {
      const b = place(type, 10, 10);
      const wv = world.buildings.wallVersion;
      expect(moveBuilding(world, "p0", { id: b.id, gx: 10, gy: 14, rot: 0 }).ok).toBe(true);
      expect(world.buildings.wallVersion).toBe(wv);
      expect(sellBuilding(world, "p0", b.id).ok).toBe(true);
    }
  });

  it("checks in order: unknown player → not_alive → not_build_phase → gone → not_owner → blocked → seals_path (12.1); MOVE_ERRORS lists them", () => {
    const { world, p0, place } = setup();
    const b = place("wood_barricade", 40, 20, 0);
    const mate = place("wood_barricade", 40, 30, 0, "p1");
    const ok = { id: b.id, gx: 44, gy: 24, rot: 0 };
    expect(moveError(world, "nobody", ok)).toBe("unknown_player");
    p0.status = "downed";
    expect(moveError(world, "p0", ok)).toBe("not_alive");
    p0.status = "out";
    expect(moveError(world, "p0", ok)).toBe("not_alive");
    p0.status = "alive";
    expect(moveError(world, "p0", { ...ok, id: 999 })).toBe("gone");
    expect(moveError(world, "p0", { ...ok, id: mate.id })).toBe("not_owner"); // F3 (B1)
    expect(moveError(world, "p0", { ...ok, rot: 4 })).toBe("blocked");
    expect(moveError(world, "p0", { ...ok, gx: 44.5 })).toBe("blocked");
    expect(moveError(world, "p0", ok)).toBeNull();
    startWave(world);
    expect(moveError(world, "p0", ok)).toBe("not_build_phase"); // F4 (B2)
    expect(MOVE_ERRORS).toEqual(["unknown_player", "not_alive", "not_build_phase", "gone", "not_owner", "blocked", "seals_path"]);
  });

  it("an error changes nothing (spot, versions, events)", () => {
    const { world, events, place } = setup();
    const b = place("wood_barricade", 40, 20, 0);
    world.events.flush();
    events.length = 0;
    const before = JSON.stringify(snapshotWorld(world));
    for (const req of [
      { id: b.id, gx: 44, gy: 24, rot: 0, who: "p1", e: "not_owner" },
      { id: b.id, gx: 62, gy: 32, rot: 0, who: "p0", e: "blocked" }, // onto p1
      { id: 77, gx: 44, gy: 24, rot: 0, who: "p0", e: "gone" },
    ]) {
      expect(moveBuilding(world, req.who, req)).toEqual({ ok: false, error: req.e });
      expect(JSON.stringify(snapshotWorld(world))).toBe(before);
    }
    world.events.flush();
    expect(moved(events)).toEqual([]);
  });

  it("B13: a 0.5 m shift onto its own old footprint is allowed (itself ignored); onto another building it is blocked (B14)", () => {
    const { world, place } = setup();
    const b = place("wood_barricade", 40, 20, 0); // 2 m × 0.5 m
    const other = place("wood_barricade", 40, 24, 0);
    expect(moveError(world, "p0", { id: b.id, gx: 41, gy: 20, rot: 0 })).toBeNull();
    expect(moveBuilding(world, "p0", { id: b.id, gx: 41, gy: 20, rot: 0 }).ok).toBe(true);
    expect(moveError(world, "p0", { id: b.id, gx: other.gx, gy: other.gy, rot: 0 })).toBe("blocked");
  });

  it("B3: never onto any spawn's 2 m clearance (every decay stage's spawns)", () => {
    const { world, place } = setup();
    const b = place("wood_barricade", 40, 20, 0);
    const sp = world.map.spawnPoints[world.map.spawnPoints.length - 1] as { x: number; y: number };
    const gx = Math.max(0, Math.round((sp.x - 1) / 0.5));
    const gy = Math.max(0, Math.round(sp.y / 0.5));
    expect(moveError(world, "p0", { id: b.id, gx, gy, rot: 0 })).toBe("blocked");
  });

  it("B4: never onto a player (a teammate, or me), downed players too; B16: never off the map", () => {
    const { world, p1, place } = setup();
    const b = place("wood_barricade", 40, 20, 0);
    // p1 stands at (32, 16): a 2 m barricade over x 31–33 at y 16
    expect(moveError(world, "p0", { id: b.id, gx: 62, gy: 32, rot: 0 })).toBe("blocked");
    p1.status = "downed";
    expect(moveError(world, "p0", { id: b.id, gx: 62, gy: 32, rot: 0 })).toBe("blocked");
    // me at (30, 16)
    expect(moveError(world, "p0", { id: b.id, gx: 58, gy: 32, rot: 0 })).toBe("blocked");
    const maxGx = Math.round(world.map.widthM / 0.5);
    expect(moveError(world, "p0", { id: b.id, gx: maxGx - 1, gy: 20, rot: 0 })).toBe("blocked");
  });

  it("B8: a zombie in the way blocks it (no zombie is alive in a real build; the rule is the footprint check)", () => {
    const { world, place } = setup();
    const b = place("spike_trap", 10, 10);
    spawnZombie(world, "walker", 5.5, 7.5);
    expect(moveError(world, "p0", { id: b.id, gx: 10, gy: 14, rot: 0 })).toBe("blocked");
  });

  it("the spot it already has: accepted, nothing changes (no version bump, no event)", () => {
    const { world, events, place } = setup();
    const b = place("wood_barricade", 40, 20, 1);
    world.events.flush();
    events.length = 0;
    const v = world.buildings.version;
    expect(moveBuilding(world, "p0", { id: b.id, gx: 40, gy: 20, rot: 1 }).ok).toBe(true);
    world.events.flush();
    expect([world.buildings.version, moved(events).length]).toEqual([v, 0]);
  });
});

describe("F5: a move changes the spot and nothing else", () => {
  it("B5/B6: HP, tier, owner, id, paid / paidThisBuild / usedThisBuild, burn clock, turret aim kept; take back after a move is still 100 %", () => {
    const { world, place } = setup(2000);
    const b = place("wood_barricade", 40, 20, 0);
    expect(upgradeBuilding(world, "p0", b.id).ok).toBe(true);
    b.hp = 123;
    b.fireTicks = 7;
    b.usedThisBuild = false;
    const keep = { id: b.id, type: b.type, ownerId: b.ownerId, hp: b.hp, maxHp: b.maxHp, paid: b.paid, paidThisBuild: b.paidThisBuild, fireTicks: b.fireTicks, solid: b.solid, stopsBullets: b.stopsBullets };
    expect(moveBuilding(world, "p0", { id: b.id, gx: 46, gy: 26, rot: 1 }).ok).toBe(true);
    const after = buildingById(world, b.id) as Building;
    expect({ id: after.id, type: after.type, ownerId: after.ownerId, hp: after.hp, maxHp: after.maxHp, paid: after.paid, paidThisBuild: after.paidThisBuild, fireTicks: after.fireTicks, solid: after.solid, stopsBullets: after.stopsBullets }).toEqual(keep);
    expect(sellRefund(world, after)).toBe(after.paid); // B6: placed + upgraded this phase, moved: still a full take back
    const t = place("auto_turret", 20, 40);
    t.aimX = 0;
    t.aimY = -1;
    t.fireCooldownS = 0.3;
    expect(moveBuilding(world, "p0", { id: t.id, gx: 24, gy: 40, rot: 0 }).ok).toBe(true);
    expect([t.aimX, t.aimY, t.fireCooldownS]).toEqual([0, -1, 0.3]);
  });

  it("B6: a med station that healed someone and then moved still sells at the share (usedThisBuild kept)", () => {
    const { world, p0, place } = setup(1000);
    const m = place("med_station", 61, 31); // p0 (30, 16) in reach
    p0.hp = 50;
    for (let i = 0; i < 10; i++) step(world, TICK_DT_S);
    expect(m.usedThisBuild).toBe(true);
    expect(moveBuilding(world, "p0", { id: m.id, gx: 70, gy: 31, rot: 0 }).ok).toBe(true);
    expect(sellRefund(world, m)).toBe(200);
  });

  it("B7: a sprung bear trap stays closed after a move (re-arm still needs a player on it); its re-arm clock restarts", () => {
    const { world, place } = setup();
    const b = place("bear_trap", 10, 10);
    b.trapState = BEAR_TRAP_STATE.SPRUNG;
    b.rearmTicks = 15;
    b.rearmPlayer = "p1";
    expect(moveBuilding(world, "p0", { id: b.id, gx: 10, gy: 16, rot: 0 }).ok).toBe(true);
    expect([b.trapState, b.rearmTicks, b.rearmPlayer]).toEqual([BEAR_TRAP_STATE.SPRUNG, 0, ""]);
  });

  it("a trap somehow holding a zombie lets it go and is shut (defensive: traps never catch in a build phase)", () => {
    const { world, place } = setup();
    const b = place("bear_trap", 10, 10);
    const z = spawnZombie(world, "walker", 30, 30);
    b.trapState = BEAR_TRAP_STATE.HOLDING;
    b.heldZombie = z;
    b.heldGen = world.zombies.generation[z] as number;
    world.zombies.holdTicks[z] = 40;
    expect(moveBuilding(world, "p0", { id: b.id, gx: 10, gy: 16, rot: 0 }).ok).toBe(true);
    expect([b.trapState, b.heldZombie, world.zombies.holdTicks[z]]).toEqual([BEAR_TRAP_STATE.SPRUNG, -1, 0]);
  });

  it("B9: the burn clock is kept across a move, so stepping a building in and out of fire never dodges a pulse", () => {
    const { world, place } = setup();
    const b = place("wood_barricade", 40, 20, 0);
    b.fireTicks = 11;
    for (let i = 0; i < 5; i++) expect(moveBuilding(world, "p0", { id: b.id, gx: 40 + (i % 2), gy: 20, rot: 0 }).ok).toBe(true);
    expect(b.fireTicks).toBe(11);
  });

  it("the list stays sorted by id after a move (collision order unchanged)", () => {
    const { world, place } = setup();
    const a = place("wood_barricade", 40, 20, 0);
    const c = place("wood_barricade", 40, 30, 0);
    expect(moveBuilding(world, "p0", { id: a.id, gx: 50, gy: 40, rot: 0 }).ok).toBe(true);
    expect(world.buildings.list.map((b) => b.id)).toEqual([a.id, c.id]);
  });

  it("B10: a move never changes money however often (100 moves)", () => {
    const { world, p0, place } = setup();
    const b = place("wood_barricade", 40, 20, 0);
    const w = p0.wallet;
    for (let i = 0; i < 100; i++) moveBuilding(world, "p0", { id: b.id, gx: 40 + (i % 4), gy: 20, rot: 0 });
    expect(p0.wallet).toBe(w);
  });

  it("B11: refused once the wave starts (the build → wave edge), and allowed again at the next build", () => {
    const { world, place } = setup();
    const b = place("wood_barricade", 40, 20, 0);
    startWave(world);
    expect(moveBuilding(world, "p0", { id: b.id, gx: 44, gy: 20, rot: 0 })).toEqual({ ok: false, error: "not_build_phase" });
    expect(b.gx).toBe(40);
    endWave(world);
    expect(world.run.phase).toBe("build");
    expect(moveBuilding(world, "p0", { id: b.id, gx: 44, gy: 20, rot: 0 }).ok).toBe(true);
  });
});
