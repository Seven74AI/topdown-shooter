import { describe, expect, it } from "vitest";
import { loadBalance, type RawBalanceFiles } from "../config/balance";
import weapons from "../config/balance/weapons.json" with { type: "json" };
import zombiesJson from "../config/balance/zombies.json" with { type: "json" };
import waves from "../config/balance/waves.json" with { type: "json" };
import player from "../config/balance/player.json" with { type: "json" };
import controls from "../config/balance/controls.json" with { type: "json" };
import economy from "../config/balance/economy.json" with { type: "json" };
import bots from "../config/balance/bots.json" with { type: "json" };
import shop from "../config/balance/shop.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { addPlayer } from "../player/player";
import { spawnRing } from "./spawnRing";
import { spawnZombie } from "./zombiePool";

/** These tests cover one mechanic: keep the wave director from spawning extra zombies. */
const NO_WAVES = { waves: () => {} };

const balance = loadBalance();
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};

describe("Walker AI", () => {
  it("walks straight at the player at 1.2 m/s", () => {
    const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
    addPlayer(world, "local", 30, 10);
    const id = spawnZombie(world, "walker", 10, 10);
    run(world, 20);
    expect(world.zombies.x[id]).toBeCloseTo(11.2, 4);
    expect(world.zombies.y[id]).toBeCloseTo(10, 4);
  });

  it("targets the nearer of two players", () => {
    const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
    addPlayer(world, "a", 5, 10);
    addPlayer(world, "b", 20, 10);
    const id = spawnZombie(world, "walker", 14, 10);
    run(world, 10);
    expect(world.zombies.x[id]).toBeGreaterThan(14); // toward b (6 m) not a (9 m)
  });

  it("ignores downed players", () => {
    const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
    const a = addPlayer(world, "a", 13, 10);
    addPlayer(world, "b", 30, 10);
    a.status = "downed";
    const id = spawnZombie(world, "walker", 12, 10);
    run(world, 10);
    expect(world.zombies.x[id]).toBeGreaterThan(12);
  });

  it("spreads 50 Walkers spawned on one point into a crowd", () => {
    const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
    for (let i = 0; i < 50; i++) spawnZombie(world, "walker", 24, 16);
    run(world, 60); // no player: only separation acts
    const z = world.zombies;
    const ids = Array.from(z.aliveIds.subarray(0, z.aliveCount));
    let minD = Infinity;
    let sumNearest = 0;
    for (const i of ids) {
      let nearest = Infinity;
      for (const j of ids) {
        if (i === j) continue;
        nearest = Math.min(nearest, Math.hypot((z.x[i] as number) - (z.x[j] as number), (z.y[i] as number) - (z.y[j] as number)));
      }
      minD = Math.min(minD, nearest);
      sumNearest += nearest;
    }
    const combinedRadii = 0.7;
    expect(minD).toBeGreaterThan(0.5 * combinedRadii);
    expect(sumNearest / ids.length).toBeGreaterThan(0.6);
  });

  it("wraps the crowd around the player instead of overlapping them", () => {
    const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
    const p = addPlayer(world, "local", 24, 16);
    p.hp = 1e9; // survive the test
    spawnRing(world, "walker", 30, 24, 16, 6);
    run(world, 200);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const d = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
      expect(d).toBeGreaterThanOrEqual(0.75 - 1e-3); // 0.35 + 0.4
    }
  });

  it("never leaves the map when pushed out of a player standing at a wall", () => {
    const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
    addPlayer(world, "local", 0.4, 10).hp = 1e9;
    const id = spawnZombie(world, "walker", 0.35, 10.05);
    for (let i = 0; i < 40; i++) {
      step(world, TICK_DT_S);
      expect(world.zombies.x[id]).toBeGreaterThanOrEqual(0.35 - 1e-6);
      expect(world.zombies.y[id]).toBeGreaterThanOrEqual(0.35 - 1e-6);
    }
  });

  it("keeps a 150-Walker crowd around a player from stacking", () => {
    const world = createWorld({ balance, seed: 3 , systems: NO_WAVES });
    const p = addPlayer(world, "local", 24, 16);
    p.hp = 1e9;
    spawnRing(world, "walker", 150, 24, 16, 20);
    run(world, 400);
    const z = world.zombies;
    let minD = Infinity;
    for (let a = 0; a < z.aliveCount; a++) {
      const i = z.aliveIds[a] as number;
      expect(z.x[i]).toBeGreaterThanOrEqual(0.35 - 1e-6);
      expect(z.x[i]).toBeLessThanOrEqual(48 - 0.35 + 1e-6);
      for (let b = a + 1; b < z.aliveCount; b++) {
        const j = z.aliveIds[b] as number;
        minD = Math.min(minD, Math.hypot((z.x[i] as number) - (z.x[j] as number), (z.y[i] as number) - (z.y[j] as number)));
      }
    }
    expect(minD).toBeGreaterThan(0.5 * 0.7); // never closer than half their combined radii
  });

  it("is deterministic for a fixed seed", () => {
    const make = () => {
      const world = createWorld({ balance, seed: 9 , systems: NO_WAVES });
      addPlayer(world, "local", 24, 16).hp = 1e9;
      spawnRing(world, "walker", 40, 24, 16, 30);
      run(world, 300);
      return snapshotWorld(world);
    };
    expect(make()).toEqual(make());
  });
});

describe("contact damage (FR9)", () => {
  function contactWorld(walkers: number) {
    const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
    const p = addPlayer(world, "local", 24, 16);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    for (let i = 0; i < walkers; i++) spawnZombie(world, "walker", 24 + (i === 0 ? 0.74 : -0.74), 16);
    return { world, p, events };
  }

  it("hits on contact, then exactly once per second", () => {
    const { world, p, events } = contactWorld(1);
    step(world, TICK_DT_S);
    expect(p.hp).toBe(90);
    run(world, 19);
    expect(p.hp).toBe(90);
    step(world, TICK_DT_S);
    expect(p.hp).toBe(80);
    expect(events.filter((e) => e.type === "player.damaged")).toHaveLength(2);
  });

  it("god mode (debug flag, Story 1.11) blocks contact damage; turning it off restores it", () => {
    const { world, p, events } = contactWorld(3);
    world.debug.godMode = true;
    run(world, 100);
    expect(p.hp).toBe(100);
    expect(p.status).toBe("alive");
    expect(events.some((e) => e.type === "player.damaged")).toBe(false);
    expect(snapshotWorld(world).debug).toEqual({ godMode: true, waveMix: null });
    world.debug.godMode = false;
    run(world, 21);
    expect(p.hp).toBeLessThan(100);
  });

  it("keeps exact timing for any attack interval (timers count ticks)", () => {
    for (const [intervalS, expectedTicks] of [[0.3, 6], [1.5, 30], [0.7, 14]] as const) {
      const z = JSON.parse(JSON.stringify(zombiesJson));
      z.types.walker.attackIntervalS = intervalS;
      const b = loadBalance({ weapons, zombies: z, waves, player, controls, economy, bots, shop } as RawBalanceFiles);
      const world = createWorld({ balance: b, seed: 1 , systems: NO_WAVES });
      const p = addPlayer(world, "local", 24, 16);
      p.hp = 1e9;
      spawnZombie(world, "walker", 24.74, 16);
      const hitTicks: number[] = [];
      world.events.subscribe((e) => e.type === "player.damaged" && hitTicks.push(world.tick));
      run(world, expectedTicks * 3 + 1);
      expect(hitTicks.slice(1, 3).map((t, k) => t - (hitTicks[k] as number))).toEqual([expectedTicks, expectedTicks]);
    }
  });

  it("keeps counting the cooldown down out of contact, so a returning zombie can hit at once", () => {
    const { world, p } = contactWorld(1);
    step(world, TICK_DT_S); // hit at tick 1
    expect(p.hp).toBe(90);
    p.x = 40; // player escapes
    run(world, 40); // the Walker (1.2 m/s) can't catch up in 2 s from ~15 m away
    expect(p.hp).toBe(90);
    p.x = 24; // the player walks back into it
    const z = world.zombies;
    p.x = (z.x[0] as number) + 0.74;
    p.y = z.y[0] as number;
    step(world, TICK_DT_S);
    expect(p.hp).toBe(80);
  });

  it("two Walkers deal two hits per second", () => {
    const { world, p } = contactWorld(2);
    run(world, 20);
    expect(p.hp).toBe(80);
  });

  it("has no regeneration", () => {
    const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
    const p = addPlayer(world, "local", 24, 16);
    p.hp = 40;
    run(world, 1200);
    expect(p.hp).toBe(40);
  });

  it("downs the player at 0 HP and stops targeting them", () => {
    const { world, p, events } = contactWorld(1);
    p.hp = 15;
    run(world, 21);
    expect(p.hp).toBe(0);
    expect(p.status).toBe("downed");
    expect(events.filter((e) => e.type === "player.downed")).toEqual([{ type: "player.downed", playerId: "local" }]);
    const hitsAfter = events.filter((e) => e.type === "player.damaged").length;
    run(world, 40);
    expect(events.filter((e) => e.type === "player.damaged").length).toBe(hitsAfter);
  });
});
