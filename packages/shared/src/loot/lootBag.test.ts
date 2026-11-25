import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import type { SimEvent } from "../core/simEvents";
import { createWorld, type World } from "../core/world";
import { addPlayer, removePlayer } from "../player/player";
import { encodeNetEvent, decodeNetEvent, NET_EVENT_KIND } from "../net/netEvents";
import { snapshotWorld } from "../core/worldSnapshot";
import { LOOT_BAG, forceLootPlan, parseDevLoot, updateLootBag } from "./lootBag";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { boxBlocked } from "../player/freeSpot";

const balance = loadBalance();

/** A World whose bag is planned in wave 3 at kill share `frac` (no other system runs: `tick` drives the loot system alone). */
function bagWorld(frac = 0.25): { world: World; events: SimEvent[] } {
  const world = createWorld({ balance, seed: 1, loot: { off: true } });
  forceLootPlan(world, 3, frac);
  world.run.phase = "wave";
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, events };
}
function tick(world: World): void {
  updateLootBag(world);
  world.tick++;
  world.events.flush();
}
const kill = (world: World, x: number, y: number): void => world.events.emit({ type: "zombie.killed", zombieId: 0, killerId: "p0", x, y, weapon: "pistol" });
const startWave = (world: World, number: number, size: number): void => world.events.emit({ type: "wave.started", number, size });
const of = <T extends SimEvent["type"]>(events: readonly SimEvent[], t: T) => events.filter((e) => e.type === t) as Extract<SimEvent, { type: T }>[];

/** Drops the bag at (x, y): wave 3 of size 4, frac 0.25 → the 2nd kill. Returns the drop tick. */
function dropAt(world: World, x: number, y: number): number {
  startWave(world, 3, 4);
  kill(world, 1, 1);
  tick(world);
  kill(world, x, y);
  const t = world.tick;
  tick(world);
  return t;
}

describe("Story 7.12 T2: the drop", () => {
  it("drops at the killIndex-th kill of the planned wave, where that zombie died; kills in other waves don't count", () => {
    const { world, events } = bagWorld(0.25);
    startWave(world, 2, 4);
    for (let i = 0; i < 4; i++) kill(world, 5, 5);
    world.events.emit({ type: "wave.ended", number: 2 });
    tick(world);
    expect(world.loot.state).toBe(LOOT_BAG.NONE);
    startWave(world, 3, 4); // killIndex = 1 + floor(0.25 × 4) = 2
    kill(world, 10, 10);
    tick(world);
    expect(of(events, "loot.dropped")).toHaveLength(0);
    kill(world, 12.5, 7.25);
    kill(world, 20, 20); // the same tick, after it: no second bag
    tick(world);
    const d = of(events, "loot.dropped");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ x: 12.5, y: 7.25, untilTick: 2 + 400 });
    expect(world.loot.killed).toBe(2);
    // one bag per run, ever
    startWave(world, 3, 4);
    for (let i = 0; i < 8; i++) kill(world, 3, 3);
    tick(world);
    expect(of(events, "loot.dropped")).toHaveLength(1);
  });

  it("a zombie that died inside a car (Downtown) drops the bag on the nearest clear spot, not in the car", () => {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, loot: { off: true } });
    forceLootPlan(world, 3, 0);
    world.run.phase = "wave";
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    const car = world.obstacles.solids.find((b) => /car/.test(b.name)) as MapBox;
    const cx = (car.minX + car.maxX) / 2;
    const cy = (car.minY + car.maxY) / 2;
    startWave(world, 3, 4);
    kill(world, cx, cy);
    tick(world);
    const d = of(events, "loot.dropped")[0];
    expect(d).toBeDefined();
    expect(boxBlocked(world, d?.x ?? cx, d?.y ?? cy, balance.loot.bagRadiusM)).toBe(false);
    expect(Math.hypot((d?.x ?? cx) - cx, (d?.y ?? cy) - cy)).toBeGreaterThan(0.5);
  });

  it("no plan → no bag; a team wipe before the kill → no bag", () => {
    const a = createWorld({ balance, seed: 1, loot: { off: true } });
    a.run.phase = "wave";
    startWave(a, 3, 4);
    for (let i = 0; i < 4; i++) kill(a, 5, 5);
    tick(a);
    expect(a.loot.state).toBe(LOOT_BAG.NONE);
    const { world } = bagWorld(0.25);
    startWave(world, 3, 4);
    kill(world, 1, 1);
    tick(world);
    world.teamWiped = true;
    kill(world, 1, 1);
    tick(world);
    expect(world.loot.state).toBe(LOOT_BAG.NONE);
  });

  it("the planned wave ends before the kill index (team shrank) → the count stops", () => {
    const { world } = bagWorld(0.999);
    startWave(world, 3, 4); // index 4
    kill(world, 1, 1);
    world.events.emit({ type: "wave.ended", number: 3 });
    tick(world);
    for (let i = 0; i < 5; i++) kill(world, 1, 1);
    tick(world);
    expect(world.loot.state).toBe(LOOT_BAG.NONE);
  });
});

describe("Story 7.12 T2: the pick-up (B3)", () => {
  it("standing within 0.6 m takes it (0.59 yes, 0.61 no); the bag is gone for everyone", () => {
    const { world, events } = bagWorld();
    const p = addPlayer(world, "p0", 30, 30);
    dropAt(world, 10, 10);
    expect(world.loot.state).toBe(LOOT_BAG.OUT);
    p.x = 10.61;
    p.y = 10;
    tick(world);
    expect(world.loot.state).toBe(LOOT_BAG.OUT);
    p.x = 10.59;
    tick(world);
    expect(world.loot.state).toBe(LOOT_BAG.FOUND);
    expect(of(events, "loot.found")).toEqual([{ type: "loot.found", playerId: "p0", wave: 3 }]);
    expect(world.loot.foundBy).toBe("p0");
    tick(world);
    expect(of(events, "loot.found")).toHaveLength(1);
  });

  it("downed and out players can't; a held / left player (not in world.players) can't", () => {
    const { world } = bagWorld();
    const a = addPlayer(world, "p0", 10, 10);
    const b = addPlayer(world, "p1", 10, 10);
    a.status = "downed";
    b.status = "out";
    dropAt(world, 10, 10);
    for (let i = 0; i < 5; i++) tick(world);
    expect(world.loot.state).toBe(LOOT_BAG.OUT);
    b.status = "alive";
    removePlayer(world, "p1");
    tick(world);
    expect(world.loot.state).toBe(LOOT_BAG.OUT);
    a.status = "alive";
    tick(world);
    expect(world.loot.foundBy).toBe("p0");
  });

  it("several in range on the same tick → the lowest slot", () => {
    const { world } = bagWorld();
    addPlayer(world, "p0", 30, 30);
    const p1 = addPlayer(world, "p1", 30, 30);
    const p2 = addPlayer(world, "p2", 30, 30);
    dropAt(world, 10, 10);
    p2.x = 10;
    p2.y = 10;
    p1.x = 10.5;
    p1.y = 10;
    tick(world);
    expect(world.loot.foundBy).toBe("p1");
  });
});

describe("Story 7.12 T2: the 20 s", () => {
  it("lies exactly 400 ticks, into the build phase (D6), then loot.expired; the run's end takes it", () => {
    const { world, events } = bagWorld();
    const t0 = dropAt(world, 10, 10);
    world.events.emit({ type: "wave.ended", number: 3 });
    world.run.phase = "build";
    while (world.tick < t0 + 400) {
      expect(world.loot.state).toBe(LOOT_BAG.OUT);
      tick(world);
    }
    expect(world.loot.state).toBe(LOOT_BAG.OUT); // the system ran on ticks t0 … t0 + 399: 400 ticks out
    tick(world); // tick t0 + 400 = untilTick
    expect(world.loot.state).toBe(LOOT_BAG.GONE);
    expect(of(events, "loot.expired")).toHaveLength(1);
    // the last tick it could be taken is t0 + 399
    const b = bagWorld();
    const p = addPlayer(b.world, "p0", 30, 30);
    const t1 = dropAt(b.world, 10, 10);
    while (b.world.tick < t1 + 399) tick(b.world);
    p.x = 10;
    p.y = 10;
    tick(b.world);
    expect(b.world.loot.state).toBe(LOOT_BAG.FOUND);
    const c = bagWorld();
    dropAt(c.world, 10, 10);
    c.world.run.phase = "results";
    tick(c.world);
    expect(c.world.loot.state).toBe(LOOT_BAG.GONE);
    expect(of(c.events, "loot.expired")).toHaveLength(1);
  });
});

describe("Story 7.12: dev switch, wire and snapshot", () => {
  it("devLoot parses <wave>:<frac>", () => {
    expect(parseDevLoot("3:0.1")).toEqual([3, 0.1]);
    expect(parseDevLoot(" 10:0 ")).toEqual([10, 0]);
    for (const bad of ["", "3", "0:0.1", "3:1", "3:-1", "x:0.1", "3:0.1:2", "256:0.5"]) expect(parseDevLoot(bad)).toBeNull();
  });

  it("netEvents 130–132 round-trip; ≤ 60 B per run", () => {
    expect([NET_EVENT_KIND.LOOT_DROPPED, NET_EVENT_KIND.LOOT_FOUND, NET_EVENT_KIND.LOOT_EXPIRED]).toEqual([130, 131, 132]);
    const ctx = { balance };
    const evs: SimEvent[] = [
      { type: "loot.dropped", x: 12.34, y: 45.67, untilTick: 123456, variant: 4 },
      { type: "loot.found", playerId: "p2", wave: 7 },
      { type: "loot.expired" },
    ];
    let bytes = 0;
    for (const e of evs) {
      const t = encodeNetEvent(e, ctx);
      expect(t).not.toBeNull();
      expect(decodeNetEvent(t as number[], ctx)).toEqual(e);
      bytes += JSON.stringify(t).length; // an upper bound of the msgpack size
    }
    expect(bytes).toBeLessThanOrEqual(60);
    expect(decodeNetEvent([131, 255, 3], ctx)).toBeNull(); // no finder: dropped
  });

  it("AC 12: snapshotWorld covers the bag (a moved bag changes the snapshot)", () => {
    const { world } = bagWorld();
    dropAt(world, 10, 10);
    const a = JSON.stringify(snapshotWorld(world).loot);
    world.loot.x += 0.01;
    expect(JSON.stringify(snapshotWorld(world).loot)).not.toBe(a);
    expect(snapshotWorld(world).loot.plan).toMatchObject({ has: true, wave: 3 });
  });
});
