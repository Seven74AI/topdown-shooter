import { describe, expect, it } from "vitest";
import { loadBalance, type RawBalanceFiles } from "../config/balance";
import weapons from "../config/balance/weapons.json" with { type: "json" };
import zombies from "../config/balance/zombies.json" with { type: "json" };
import wavesJson from "../config/balance/waves.json" with { type: "json" };
import player from "../config/balance/player.json" with { type: "json" };
import controls from "../config/balance/controls.json" with { type: "json" };
import economy from "../config/balance/economy.json" with { type: "json" };
import bots from "../config/balance/bots.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { addPlayer } from "../player/player";
import { killZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";
import { waveSize } from "./waveDirector";
import { skipWave, startBuild } from "../run/runStateMachine";

/** Story 3.1: a 3 s build phase (60 ticks) keeps these timings short; the build itself is tested in runStateMachine.test.ts. */
function balanceWith(waves: Partial<typeof wavesJson> = {}) {
  return loadBalance({ weapons, zombies, waves: { ...wavesJson, buildPhaseS: 3, ...waves }, player, controls, economy, bots } as RawBalanceFiles);
}

/** Zombies frozen in place (tests drive kills by hand), invulnerable player; the run is in its first build phase. */
function setup(waves: Partial<typeof wavesJson> = {}) {
  const world = createWorld({ balance: balanceWith(waves), seed: 7, systems: { zombies: () => {} } });
  const p = addPlayer(world, "local", 24, 16);
  p.hp = 1e9;
  startBuild(world);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, p, events };
}
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const killAll = (world: World) => {
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) killZombie(world, z.aliveIds[i] as number, "local", "pistol");
};
/** Runs until the current wave's queue is empty (all spawned). */
const spawnOut = (world: World) => {
  for (let i = 0; i < 5000 && world.waves.queued > 0; i++) step(world, TICK_DT_S);
};

describe("wave director (FR28, FR30)", () => {
  it("waits for the first build phase, then starts wave 1 with 40 Walkers", () => {
    const { world, events } = setup();
    run(world, 59);
    expect(world.waves.number).toBe(0);
    run(world, 1);
    expect(world.waves.number).toBe(1);
    expect(events.find((e) => e.type === "wave.started")).toEqual({ type: "wave.started", number: 1, size: 40 });
    spawnOut(world);
    expect(world.zombies.aliveCount).toBe(40);
  });

  it("spawns exactly 120 in wave 3", () => {
    const { world } = setup();
    for (let wave = 1; wave <= 3; wave++) {
      while (world.waves.number < wave) step(world, TICK_DT_S);
      spawnOut(world);
      if (wave < 3) {
        killAll(world);
        step(world, TICK_DT_S);
      }
    }
    expect(world.zombies.aliveCount).toBe(120);
  });

  it("rushes even when remaining jumps from 7 to 3 in one tick", () => {
    const { world, events } = setup();
    run(world, 60);
    spawnOut(world);
    const z = world.zombies;
    while (z.aliveCount > 7) killZombie(world, z.aliveIds[0] as number, "local", "pistol");
    step(world, TICK_DT_S);
    for (let i = 0; i < 4; i++) killZombie(world, z.aliveIds[0] as number, "local", "pistol");
    step(world, TICK_DT_S);
    expect(events.filter((e) => e.type === "wave.rush_started")).toEqual([{ type: "wave.rush_started", count: 3 }]);
  });

  it("rushes a wave smaller than 5 as soon as its queue is empty", () => {
    const { world } = setup({ zombiesPerWave: 3 });
    run(world, 61);
    expect(world.waves.queued).toBe(1);
    run(world, 5);
    expect(world.waves.queued).toBe(0);
    expect(world.waves.rushing).toBe(true);
  });

  it("keeps the queue when the pool is full and retries later", () => {
    const { world } = setup({ zombiesPerWave: 400, maxAlive: 400 });
    run(world, 60);
    spawnOut(world); // stops early: the pool (256) fills
    for (let i = 0; i < 400; i++) step(world, TICK_DT_S);
    expect(world.zombies.aliveCount).toBe(256);
    expect(world.waves.queued).toBe(400 - 256);
    expect(world.waves.remaining).toBe(400);
  });

  it("sizes wave N as N × 40", () => {
    const b = balanceWith();
    expect([1, 3, 10].map((n) => waveSize(b, n, 1))).toEqual([40, 120, 400]);
  });

  it("never has more than 150 alive, queues the rest and drains the queue as zombies die", () => {
    const { world } = setup({ zombiesPerWave: 400 });
    run(world, 60);
    let maxAlive = 0;
    for (let i = 0; i < 6000 && (world.waves.queued > 0 || world.zombies.aliveCount > 0); i++) {
      step(world, TICK_DT_S);
      maxAlive = Math.max(maxAlive, world.zombies.aliveCount);
      if (i % 4 === 0 && world.zombies.aliveCount > 0) killZombie(world, world.zombies.aliveIds[0] as number, "local", "pistol");
    }
    expect(maxAlive).toBe(150);
    expect(world.waves.queued).toBe(0);
  });

  it("starts the rush exactly when 5 remain with an empty queue, and marks them", () => {
    const { world, events } = setup();
    run(world, 60);
    spawnOut(world);
    const z = world.zombies;
    while (z.aliveCount > 6) killZombie(world, z.aliveIds[0] as number, "local", "pistol");
    step(world, TICK_DT_S);
    expect(world.waves.rushing).toBe(false);
    killZombie(world, z.aliveIds[0] as number, "local", "pistol");
    step(world, TICK_DT_S);
    expect(world.waves.rushing).toBe(true);
    expect(events.filter((e) => e.type === "wave.rush_started")).toEqual([{ type: "wave.rush_started", count: 5 }]);
    for (let i = 0; i < z.aliveCount; i++) expect(z.state[z.aliveIds[i] as number]).toBe(ZOMBIE_STATE.RUSH);
  });

  it("does not rush while zombies are still queued", () => {
    const { world } = setup();
    run(world, 61); // first batch of 2 spawned, 38 queued
    killAll(world);
    step(world, TICK_DT_S);
    expect(world.waves.queued).toBeGreaterThan(0);
    expect(world.waves.rushing).toBe(false);
  });

  it("ends the wave on the last kill, then a build phase (no 5 s pause), then the next wave", () => {
    const { world, events } = setup();
    run(world, 60);
    spawnOut(world);
    killAll(world);
    step(world, TICK_DT_S);
    expect(events.filter((e) => e.type === "wave.ended")).toEqual([{ type: "wave.ended", number: 1 }]);
    expect(world.run.phase).toBe("build");
    run(world, 59);
    expect(world.waves.number).toBe(1);
    step(world, TICK_DT_S);
    expect(world.waves.number).toBe(2);
    expect(world.waves.size).toBe(80);
  });

  it("skips spawn points within 6 m of the player", () => {
    const { world } = setup();
    world.players.get("local")!.x = 6;
    world.players.get("local")!.y = 2; // right next to the (6, 0.5) spawn point
    run(world, 60);
    spawnOut(world);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      expect(Math.hypot((z.x[id] as number) - 6, (z.y[id] as number) - 2)).toBeGreaterThanOrEqual(6); // even after jitter
    }
  });

  it("stops when no player is alive", () => {
    const { world, p } = setup();
    p.status = "downed";
    run(world, 200);
    expect(world.waves.number).toBe(0);
  });

  it("skipWave (dev cheat) kills the wave and ends it", () => {
    const { world } = setup();
    run(world, 60);
    spawnOut(world);
    skipWave(world);
    expect(world.zombies.aliveCount).toBe(0);
    expect(world.run.phase).toBe("build");
  });

  it("a paused director (stress scenario, Story 1.11) starts no wave and spawns nothing", () => {
    const { world } = setup();
    world.waves.paused = true;
    run(world, 400);
    expect(world.waves.number).toBe(0);
    expect(world.zombies.aliveCount).toBe(0);
    world.waves.paused = false;
    run(world, 61);
    expect(world.waves.number).toBe(1);
  });

  it("is deterministic for a seed", () => {
    const positions = () => {
      const { world } = setup();
      run(world, 60);
      spawnOut(world);
      return Array.from(world.zombies.x.subarray(0, 40));
    };
    expect(positions()).toEqual(positions());
  });
});
