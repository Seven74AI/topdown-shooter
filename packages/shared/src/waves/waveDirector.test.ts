import { describe, expect, it } from "vitest";
import { loadBalance, type RawBalanceFiles } from "../config/balance";
import weapons from "../config/balance/weapons.json" with { type: "json" };
import zombies from "../config/balance/zombies.json" with { type: "json" };
import wavesJson from "../config/balance/waves.json" with { type: "json" };
import player from "../config/balance/player.json" with { type: "json" };
import controls from "../config/balance/controls.json" with { type: "json" };
import economy from "../config/balance/economy.json" with { type: "json" };
import bots from "../config/balance/bots.json" with { type: "json" };
import buildings from "../config/balance/buildings.json" with { type: "json" };
import shop from "../config/balance/shop.json" with { type: "json" };
import decay from "../config/balance/decay.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { addPlayer } from "../player/player";
import { killZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE, ZOMBIE_TYPES } from "../zombies/zombieTypes";
import { applyFixedCounts, spawnJitterFor, spawnReachM, waveMixOf, waveSize, waveTypeCounts } from "./waveDirector";
import { skipWave, startBuild } from "../run/runStateMachine";

/**
 * Story 3.1: a 3 s build phase (60 ticks) keeps these timings short; the build itself is tested in
 * runStateMachine.test.ts. Story 3.10: these one-player tests size waves at × 1.0 (the base curve);
 * the real player-count scale is tested below with `realScale`.
 */
function balanceWith(waves: Partial<typeof wavesJson> = {}, realScale = false) {
  const scale = realScale ? {} : { playerCountScale: [1, 1, 1, 1] };
  return loadBalance({ weapons, zombies, waves: { ...wavesJson, buildPhaseS: 3, ...scale, ...waves }, player, controls, economy, bots, buildings, shop, decay } as RawBalanceFiles);
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

/** Story 3.10: the 5-wave curve, its composition and the player-count scale (FR28, FR29, FR31). */
describe("six-wave curve and composition (Story 3.10; Story 5.8: 6 waves)", () => {
  const real = loadBalance();
  const typeOf = (world: World, id: number) => ZOMBIE_TYPES[world.zombies.type[id] as number];

  it("4 players: 40 / 80 / 120 / 160 / 200 / 240; 3 players × 0.8; 2 players × 0.6; solo × 0.4", () => {
    const sizes = (players: number) => [1, 2, 3, 4, 5, 6].map((n) => waveSize(real, n, players));
    expect(sizes(4)).toEqual([40, 80, 120, 160, 200, 240]);
    expect(sizes(3)).toEqual([32, 64, 96, 128, 160, 192]);
    expect(sizes(2)).toEqual([24, 48, 72, 96, 120, 144]);
    expect(sizes(1)).toEqual([16, 32, 48, 64, 80, 96]);
    expect(waveSize(real, 1, 9)).toBe(40); // clamped to the last entry
    expect(real.waves.runWaves).toBe(6); // Story 5.8 (FR29: "the temporary run grows to 6 waves")
  });

  it("W1 Walkers only, W2 adds Runners, W3 adds Crawlers, W4–W5 add Spitters (Story 5.6: 8 %), W6 adds Bloaters (Story 5.8: 15 %), exact counts", () => {
    const out = new Uint16Array(ZOMBIE_TYPES.length);
    const counts = (n: number, players = 4) => {
      waveTypeCounts(waveMixOf(real, n), waveSize(real, n, players), out);
      return Object.fromEntries(ZOMBIE_TYPES.map((t, i) => [t, out[i]]));
    };
    expect(counts(1)).toEqual({ walker: 40, crawler: 0, runner: 0, spitter: 0, brute: 0, bloater: 0 });
    expect(counts(2)).toEqual({ walker: 64, crawler: 0, runner: 16, spitter: 0, brute: 0, bloater: 0 });
    expect(counts(3)).toEqual({ walker: 78, crawler: 18, runner: 24, spitter: 0, brute: 0, bloater: 0 });
    // Story 5.6 (DD3): 160 × {50, 25, 17, 8} % = 80 / 40 / 27.2 / 12.8 → floors + the leftover one to the Walkers.
    expect(counts(4)).toEqual({ walker: 81, crawler: 27, runner: 40, spitter: 12, brute: 0, bloater: 0 });
    // The mix share alone (Story 5.7's fixed Brute is folded in by `applyFixedCounts`: below).
    expect(counts(5)).toEqual({ walker: 90, crawler: 44, runner: 50, spitter: 16, brute: 0, bloater: 0 });
    // Solo: wave 4 is 64 → 32 / 16 / 10.88 / 5.12 → 32 + 1, 10, 16, 5.
    expect(counts(4, 1)).toEqual({ walker: 33, crawler: 10, runner: 16, spitter: 5, brute: 0, bloater: 0 });
    // Leftovers go one by one in type order: 32 × 80 % = 25.6 → 26 Walkers, 6 Runners.
    expect(counts(2, 1)).toEqual({ walker: 26, crawler: 0, runner: 6, spitter: 0, brute: 0, bloater: 0 });
    // Story 5.8 (D9): 240 × {40, 20, 15, 10, 15} % = 96 / 48 / 36 / 24 / 36 exactly.
    expect(counts(6)).toEqual({ walker: 96, crawler: 36, runner: 48, spitter: 24, brute: 0, bloater: 36 });
    // Solo: 96 → 38.4 / 19.2 / 14.4 / 9.6 / 14.4 → floors 38, 14, 19, 9, 14 + the 2 leftovers in type order.
    expect(counts(6, 1)).toEqual({ walker: 39, crawler: 15, runner: 19, spitter: 9, brute: 0, bloater: 14 });
    // Waves past the list use the last entry.
    expect(waveMixOf(real, 9)).toBe(real.waves.mix[real.waves.mix.length - 1]);
  });

  /** Runs a real-balance solo World through `wave` waves (cleared by hand) and returns the spawn order of the last one. */
  function spawnOrder(wave: number, players = 1, mix: readonly string[] | null = null): string[] {
    const world = createWorld({ balance: balanceWith({}, true), seed: 3, systems: { zombies: () => {} } });
    for (let i = 0; i < players; i++) addPlayer(world, `p${i}`, 24 + i, 16).hp = 1e9;
    if (mix) world.debug.waveMix = mix as World["debug"]["waveMix"];
    startBuild(world);
    const order: string[] = [];
    const seen = new Set<number>();
    for (let guard = 0; guard < 20000 && world.run.phase !== "results"; guard++) {
      step(world, TICK_DT_S);
      if (world.waves.number === wave && world.run.phase === "wave") {
        const z = world.zombies;
        for (let i = 0; i < z.aliveCount; i++) {
          const id = z.aliveIds[i] as number;
          const key = id | ((z.generation[id] as number) << 16);
          if (!seen.has(key)) {
            seen.add(key);
            order.push(typeOf(world, id) as string);
          }
        }
        if (world.waves.queued === 0) return order;
      } else if (world.run.phase === "wave" && world.waves.queued === 0) {
        skipWave(world);
      }
    }
    return order;
  }

  it("spreads the types through the wave (no block of Runners at the end) and spawns the exact composition", () => {
    // solo W5: 80 = 37 Walkers, 17 Crawlers, 20 Runners, 6 Spitters (Story 5.6); Story 5.7: one Walker's slot is the Brute.
    const order = spawnOrder(5);
    expect(order).toHaveLength(80);
    const count = (t: string, from = 0, to = order.length) => order.slice(from, to).filter((x) => x === t).length;
    expect([count("walker"), count("crawler"), count("runner"), count("spitter"), count("brute")]).toEqual([36, 17, 20, 6, 1]);
    for (let q = 0; q < 4; q++) {
      // every quarter of the wave holds a quarter of each type (± 1)
      expect(Math.abs(count("runner", q * 20, (q + 1) * 20) - 5)).toBeLessThanOrEqual(1);
      expect(Math.abs(count("crawler", q * 20, (q + 1) * 20) - 17 / 4)).toBeLessThanOrEqual(1);
      expect(Math.abs(count("spitter", q * 20, (q + 1) * 20) - 6 / 4)).toBeLessThanOrEqual(1);
    }
  });

  it("the dev wave mix (?wavemix, DEV_WAVE_MIX) overrides the composition", () => {
    const order = spawnOrder(1, 1, ["crawler"]);
    expect(order).toHaveLength(16);
    expect(new Set(order)).toEqual(new Set(["crawler"]));
  });

  it("a player who leaves during the build makes the next wave smaller (players counted at the wave start)", () => {
    const world = createWorld({ balance: balanceWith({}, true), seed: 3, systems: { zombies: () => {} } });
    for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 20 + i, 16).hp = 1e9;
    startBuild(world);
    while (world.waves.number < 1) step(world, TICK_DT_S);
    expect(world.waves.size).toBe(40);
    skipWave(world); // → build for wave 2
    world.players.delete("p3");
    while (world.waves.number < 2) step(world, TICK_DT_S);
    expect(world.waves.size).toBe(64); // 80 × 0.8
  });

  it("wave 5 at 4 players (200) never has more than 150 alive, and the rush waits for the queue", () => {
    const world = createWorld({ balance: balanceWith({}, true), seed: 5, systems: { zombies: () => {} } });
    for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 20 + i, 16).hp = 1e9;
    startBuild(world);
    while (world.waves.number < 5) {
      step(world, TICK_DT_S);
      if (world.run.phase === "wave" && world.waves.number < 5) skipWave(world);
    }
    expect(world.waves.size).toBe(200);
    let maxAlive = 0;
    let rushedWithQueue = false;
    for (let i = 0; i < 20000 && world.run.phase === "wave"; i++) {
      step(world, TICK_DT_S);
      maxAlive = Math.max(maxAlive, world.zombies.aliveCount);
      if (world.waves.rushing && world.waves.queued > 0) rushedWithQueue = true;
      // let the horde reach the cap, then thin it slowly (the queue drains into the freed room)
      if ((world.zombies.aliveCount >= 148 || world.waves.queued === 0) && i % 3 === 0 && world.zombies.aliveCount > 0) {
        killZombie(world, world.zombies.aliveIds[0] as number, "p0", "pistol");
      }
    }
    expect(maxAlive).toBe(150);
    expect(rushedWithQueue).toBe(false);
    expect(world.run.phase).toBe("build"); // Story 5.8: wave 6 is the run's last now
    expect(world.run.heldOut).toBe(false);
  });

  it("the last-zombies rush waits until the whole wave has spawned (3.10 review)", () => {
    // one zombie every 2 s: kill each as it appears so alive + queued drops to 5 while some are still queued
    const { world } = setup({ spawnIntervalS: 2, spawnPerInterval: 1 });
    while (world.waves.number < 1) step(world, TICK_DT_S);
    let sawSmallWithQueue = false;
    for (let i = 0; i < 20000 && world.waves.queued > 0; i++) {
      step(world, TICK_DT_S);
      if (world.waves.queued > 1) killAll(world);
      if (world.waves.remaining <= 5 && world.waves.queued > 0) {
        sawSmallWithQueue = true;
        expect(world.waves.rushing).toBe(false);
      }
    }
    expect(sawSmallWithQueue).toBe(true);
    run(world, 1);
    expect(world.waves.queued).toBe(0);
    expect(world.waves.rushing).toBe(true);
  });
});

describe("Story 5.7: the Brute in the waves (AC 3, 4; F6, F8)", () => {
  /** A real-balance run of `runWaves` waves for `players` players; per wave, the spawn order and Brute spawn events. */
  function runOrders(players: number, runWaves = 6, seed = 3) {
    const world = createWorld({ balance: balanceWith({ runWaves }, true), seed, systems: { zombies: () => {} } });
    for (let i = 0; i < players; i++) addPlayer(world, `p${i}`, 24 + i, 16).hp = 1e9;
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    startBuild(world);
    const orders = new Map<number, string[]>();
    const positions: [number, number][] = [];
    const seen = new Set<number>();
    for (let guard = 0; guard < 60000 && world.run.phase !== "results"; guard++) {
      step(world, TICK_DT_S);
      if (world.run.phase !== "wave") continue;
      const order = orders.get(world.waves.number) ?? [];
      orders.set(world.waves.number, order);
      const z = world.zombies;
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        const key = id | ((z.generation[id] as number) << 16) | (world.waves.number << 24);
        if (seen.has(key)) continue;
        seen.add(key);
        const type = ZOMBIE_TYPES[z.type[id] as number] as string;
        order.push(type);
        if (type === "brute") positions.push([z.x[id] as number, z.y[id] as number]);
      }
      // Recorded: gone (the 150-alive cap never holds the queue; the wave ends on its own).
      while (z.aliveCount > 0) killZombie(world, z.aliveIds[0] as number, null, "pistol");
    }
    return { world, orders, events, positions };
  }

  it("exactly one Brute in wave 5 and one in wave 6 at 1, 2, 3 and 4 players; none before (not scaled, FR27)", () => {
    for (let players = 1; players <= 4; players++) {
      const { orders, world } = runOrders(players);
      expect(world.run.phase, `${players}p`).toBe("results");
      for (let wave = 1; wave <= 6; wave++) {
        const order = orders.get(wave) ?? [];
        expect(order.length, `${players}p wave ${wave}`).toBe(waveSize(world.balance, wave, players)); // the wave size is unchanged
        expect(order.filter((t) => t === "brute").length, `${players}p wave ${wave}`).toBe(wave >= 5 ? 1 : 0);
      }
    }
  }, 120_000);

  it("solo wave 5 (80 zombies, × 0.4): the Brute is the 21st spawn (after 25 %), it takes a Walker's slot", () => {
    const { orders } = runOrders(1);
    const order = orders.get(5) as string[];
    expect(order).toHaveLength(80);
    expect(order.indexOf("brute")).toBe(20);
    expect(order.filter((t) => t === "walker")).toHaveLength(36); // 37 by the mix, one slot to the Brute
  }, 60_000);

  it("zombie.brute_spawned for every Brute; first = true only for the run's first; brutesSpawned counts them", () => {
    const { events, world } = runOrders(2);
    const b = events.filter((e) => e.type === "zombie.brute_spawned");
    expect(b.map((e) => e.type === "zombie.brute_spawned" && e.first)).toEqual([true, false]);
    expect(world.waves.brutesSpawned).toBe(2);
  }, 60_000);

  it("spawns stream only: same seed → the same Brute spawn points; another seed → others", () => {
    const a = runOrders(2, 6, 11).positions;
    const b = runOrders(2, 6, 11).positions;
    const c = runOrders(2, 6, 12).positions;
    expect(a).toHaveLength(2);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  }, 120_000);

  it("a Brute spawns ≥ spawnMinPlayerDistanceM from every standing player and its jitter is narrowed (jitter + radius ≤ a Walker's)", () => {
    const bal = balanceWith({}, true);
    expect(spawnJitterFor(bal, 0.6)).toBeCloseTo(0.75, 9);
    expect(spawnJitterFor(bal, 0.35)).toBe(1);
    expect(spawnReachM(bal)).toBeCloseTo(1.35, 9);
    const { positions, world } = runOrders(1);
    for (const [x, y] of positions) {
      for (const p of world.players.values()) expect(Math.hypot(x - p.x, y - p.y)).toBeGreaterThanOrEqual(bal.waves.spawnMinPlayerDistanceM);
    }
  }, 60_000);

  it("applyFixedCounts: Walkers give the slot first, then the largest share; waves past the list have none", () => {
    const bal = balanceWith({}, true);
    const target = new Uint16Array(ZOMBIE_TYPES.length);
    const fixed = new Uint16Array(ZOMBIE_TYPES.length);
    target.set([0, 3, 5, 1, 0, 0]);
    applyFixedCounts(bal, 5, 9, target, fixed);
    expect(Array.from(target)).toEqual([0, 3, 4, 1, 1, 0]); // no Walkers: the Runners (largest) give it
    expect(Array.from(fixed)).toEqual([0, 0, 0, 0, 1, 0]);
    target.set([10, 0, 0, 0, 0, 0]);
    applyFixedCounts(bal, 7, 10, target, fixed);
    expect(Array.from(target)).toEqual([10, 0, 0, 0, 0, 0]); // wave 7: no entry
    expect(Array.from(fixed)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
