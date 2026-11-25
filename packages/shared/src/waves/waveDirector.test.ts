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
import combat from "../config/balance/combat.json" with { type: "json" };
import gear from "../config/balance/gear.json" with { type: "json" };
import consumables from "../config/balance/consumables.json" with { type: "json" };
import boss from "../config/balance/boss.json" with { type: "json" };
import eventsJson from "../config/balance/events.json" with { type: "json" };
import lootJson from "../config/balance/loot.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { addPlayer } from "../player/player";
import { killZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE, ZOMBIE_TYPES } from "../zombies/zombieTypes";
import { applyFixedCounts, fillFixedAtList, spawnJitterFor, spawnReachM, waveMixOf, waveSize, waveTypeCounts } from "./waveDirector";
import { skipWave, startBuild } from "../run/runStateMachine";
import { snapshotWorld } from "../core/worldSnapshot";

/**
 * Story 3.1: a 3 s build phase (60 ticks) keeps these timings short; the build itself is tested in
 * runStateMachine.test.ts. Story 3.10: these one-player tests size waves at × 1.0 (the base curve);
 * the real player-count scale is tested below with `realScale`.
 */
function balanceWith(waves: Partial<typeof wavesJson> = {}, realScale = false) {
  const scale = realScale ? {} : { playerCountScale: [1, 1, 1, 1] };
  return loadBalance({ weapons, zombies, waves: { ...wavesJson, buildPhaseS: 3, ...scale, ...waves }, player, controls, economy, bots, buildings, shop, decay, combat, gear, consumables, boss, events: eventsJson, loot: lootJson } as RawBalanceFiles);
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

  it("4 players: 40 / 80 / 120 / 160 / 200 / 240; 3 players × 0.8; 2 players × 0.6; solo × 0.35 (Epic 5 balance pass B2)", () => {
    const sizes = (players: number) => [1, 2, 3, 4, 5, 6].map((n) => waveSize(real, n, players));
    expect(sizes(4)).toEqual([40, 80, 120, 160, 200, 240]);
    expect(sizes(3)).toEqual([32, 64, 96, 128, 160, 192]);
    expect(sizes(2)).toEqual([24, 48, 72, 96, 120, 144]);
    expect(sizes(1)).toEqual([14, 28, 42, 56, 70, 84]);
    expect(waveSize(real, 1, 9)).toBe(40); // clamped to the last entry
    expect(real.waves.runWaves).toBe(10); // Story 6.1 (Story 5.8 had 6)
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
    // Solo (× 0.35): wave 4 is 56 → 28 / 14 / 9.52 / 4.48 → 28 + 1, 9, 14, 4.
    expect(counts(4, 1)).toEqual({ walker: 29, crawler: 9, runner: 14, spitter: 4, brute: 0, bloater: 0 });
    // Leftovers go one by one in type order: 28 × 80 % = 22.4 → 23 Walkers, 5 Runners.
    expect(counts(2, 1)).toEqual({ walker: 23, crawler: 0, runner: 5, spitter: 0, brute: 0, bloater: 0 });
    // Story 5.8 (D9): 240 × {40, 20, 15, 10, 15} % = 96 / 48 / 36 / 24 / 36 exactly.
    expect(counts(6)).toEqual({ walker: 96, crawler: 36, runner: 48, spitter: 24, brute: 0, bloater: 36 });
    // Solo: 84 → 33.6 / 16.8 / 12.6 / 8.4 / 12.6 → floors 33, 12, 16, 8, 12 + the 3 leftovers in type order.
    expect(counts(6, 1)).toEqual({ walker: 34, crawler: 13, runner: 17, spitter: 8, brute: 0, bloater: 12 });
    // Waves past the list use the last entry.
    expect(waveMixOf(real, 11)).toBe(real.waves.mix[real.waves.mix.length - 1]); // Story 6.1: the list has 10 entries (D-E)
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
    // solo W5: 70 = 32 Walkers, 16 Crawlers, 17 Runners, 5 Spitters (Story 5.6; × 0.35); Story 5.7: one Walker's slot is the Brute.
    const order = spawnOrder(5);
    expect(order).toHaveLength(70);
    const count = (t: string, from = 0, to = order.length) => order.slice(from, to).filter((x) => x === t).length;
    expect([count("walker"), count("crawler"), count("runner"), count("spitter"), count("brute")]).toEqual([31, 16, 17, 5, 1]);
    for (let q = 0; q < 4; q++) {
      // every quarter of the wave holds a quarter of each type (± 1)
      const a = Math.round((q * 70) / 4);
      const z = Math.round(((q + 1) * 70) / 4);
      expect(Math.abs(count("runner", a, z) - ((z - a) * 17) / 70)).toBeLessThanOrEqual(1);
      expect(Math.abs(count("crawler", a, z) - ((z - a) * 16) / 70)).toBeLessThanOrEqual(1);
      expect(Math.abs(count("spitter", a, z) - ((z - a) * 5) / 70)).toBeLessThanOrEqual(1);
    }
  });

  it("the dev wave mix (?wavemix, DEV_WAVE_MIX) overrides the composition", () => {
    const order = spawnOrder(1, 1, ["crawler"]);
    expect(order).toHaveLength(14);
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
    expect(world.run.ending).toBe("none");
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

  it("solo wave 5 (70 zombies, × 0.35): the Brute is the 19th spawn (after 25 %), it takes a Walker's slot", () => {
    const { orders } = runOrders(1);
    const order = orders.get(5) as string[];
    expect(order).toHaveLength(70);
    expect(order.indexOf("brute")).toBe(18); // round(70 × 0.25)
    expect(order.filter((t) => t === "walker")).toHaveLength(31); // 32 by the mix, one slot to the Brute
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
    applyFixedCounts(bal, 11, 10, target, fixed);
    expect(Array.from(target)).toEqual([10, 0, 0, 0, 0, 0]); // wave 11: no entry (Story 6.1: the list covers waves 1–10; 6.12 adds endless Brutes)
    expect(Array.from(fixed)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

/** Story 6.1: the full 10-wave curve (F1–F6). */
describe("Story 6.1: the full 10-wave curve", () => {
  const real = loadBalance();
  const counts = (n: number, players: number) => {
    const size = waveSize(real, n, players);
    const t = new Uint16Array(ZOMBIE_TYPES.length);
    const f = new Uint16Array(ZOMBIE_TYPES.length);
    waveTypeCounts(waveMixOf(real, n), size, t);
    applyFixedCounts(real, n, size, t, f);
    return Object.fromEntries(ZOMBIE_TYPES.map((k, i) => [k, t[i]]));
  };
  /** A real-balance (real player scale) run with frozen zombies killed as they appear; per wave the spawn order. */
  function runOrders(players: number, opts: { runWaves?: number; startWave?: number; seed?: number } = {}) {
    const world = createWorld({ balance: balanceWith({ runWaves: opts.runWaves ?? 10 }, true), seed: opts.seed ?? 3, systems: { zombies: () => {} } });
    world.debug.bossWaves = []; // Story 6.5: the spawn order only (the Behemoth's wave-10 rules: boss/behemoth.test.ts)
    for (let i = 0; i < players; i++) addPlayer(world, `p${i}`, 24 + i, 16).hp = 1e9;
    if (opts.startWave) world.waves.number = opts.startWave - 1;
    startBuild(world);
    const orders = new Map<number, string[]>();
    const seen = new Set<number>();
    for (let guard = 0; guard < 80000 && world.run.phase !== "results"; guard++) {
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
        order.push(ZOMBIE_TYPES[z.type[id] as number] as string);
      }
      while (z.aliveCount > 0) killZombie(world, z.aliveIds[0] as number, null, "pistol");
    }
    return { world, orders };
  }

  it("F1: waves 7–10 sizes at 4 / 3 / 2 / 1 players (N × 40 × 1.0 / 0.8 / 0.6 / 0.35)", () => {
    const sizes = (n: number) => [4, 3, 2, 1].map((p) => waveSize(real, n, p));
    expect(sizes(7)).toEqual([280, 224, 168, 98]);
    expect(sizes(8)).toEqual([320, 256, 192, 112]);
    expect(sizes(9)).toEqual([360, 288, 216, 126]);
    expect(sizes(10)).toEqual([400, 320, 240, 140]);
    expect(real.waves.maxAlive).toBe(150);
  });

  it("F2: waves 7–10 exact type counts (the story's table; solo at × 0.35)", () => {
    const row = (walker: number, runner: number, crawler: number, spitter: number, bloater: number) => ({ walker, runner, crawler, spitter, bloater, brute: 2 });
    const table: Record<number, ReturnType<typeof row>[]> = {
      7: [row(105, 61, 42, 28, 42), row(84, 49, 34, 22, 33), row(62, 37, 26, 16, 25), row(36, 22, 15, 9, 14)],
      8: [row(111, 76, 48, 35, 48), row(88, 61, 39, 28, 38), row(66, 46, 29, 21, 28), row(38, 27, 17, 12, 16)],
      9: [row(143, 64, 61, 36, 54), row(114, 52, 49, 28, 43), row(85, 39, 37, 21, 32), row(49, 23, 22, 12, 18)],
      10: [row(150, 88, 60, 40, 60), row(120, 70, 48, 32, 48), row(90, 52, 36, 24, 36), row(52, 30, 21, 14, 21)],
    };
    for (const [n, rows] of Object.entries(table)) {
      rows.forEach((r, i) => {
        const players = 4 - i;
        const c = counts(Number(n), players);
        expect(c, `wave ${n} ${players}p`).toEqual(r);
        expect(Object.values(c).reduce((a: number, v) => a + (v as number), 0)).toBe(waveSize(real, Number(n), players));
      });
    }
  });

  it("fillFixedAtList: two fixed zombies at round(size × 0.25) and round(size × 0.65); one at 0.25 (waves 5–6 unchanged); empty list → fixedAtFraction (D-A)", () => {
    const out = new Uint16Array(8);
    fillFixedAtList(real, 400, 2, out);
    expect(Array.from(out.subarray(0, 3))).toEqual([100, 260, 0]);
    fillFixedAtList(real, 70, 1, out);
    expect(out[0]).toBe(18); // Story 5.7's solo wave 5 point
    fillFixedAtList(real, 3, 2, out); // tiny wave: never later than size − fixedTotal + k
    expect(Array.from(out.subarray(0, 2))).toEqual([1, 2]);
    fillFixedAtList(real, 2, 2, out); // review L1: the clamp decides (round(2 × 0.65) = 1 → 1, but 0.25 → 1 would leave no slot): [0, 1]
    expect(Array.from(out.subarray(0, 2))).toEqual([0, 1]);
    const legacy = balanceWith({ fixedAtFractions: [] } as Partial<typeof wavesJson>, true);
    fillFixedAtList(legacy, 400, 2, out);
    expect(Array.from(out.subarray(0, 2))).toEqual([100, 100]); // both at 25 % (the old behaviour)
  });

  it("F3: exactly 2 Brutes in each of waves 7–10 at every party size, the first after 25 %, the second after 65 %, never in the opening burst", () => {
    for (let players = 1; players <= 4; players++) {
      const { orders, world } = runOrders(players, { startWave: 5 });
      expect(world.run.phase, `${players}p`).toBe("results");
      expect(world.run.ending).toBe("extracted");
      for (let wave = 5; wave <= 10; wave++) {
        const order = orders.get(wave) ?? [];
        const size = waveSize(world.balance, wave, players);
        expect(order.length, `${players}p wave ${wave}`).toBe(size);
        const at = order.flatMap((t, i) => (t === "brute" ? [i] : []));
        if (wave <= 6) expect(at, `${players}p wave ${wave}`).toEqual([Math.round(size * 0.25)]); // waves 5–6 unchanged
        else expect(at, `${players}p wave ${wave}`).toEqual([Math.round(size * 0.25), Math.round(size * 0.65)]);
      }
    }
  }, 180_000);

  it("review L2: snapshotWorld carries the fixed zombies and their spawn points (wave 7 at 4 players)", () => {
    const world = createWorld({ balance: balanceWith({ runWaves: 10 }, true), seed: 3, systems: { zombies: () => {} } });
    for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 24 + i, 16).hp = 1e9;
    world.waves.number = 6;
    startBuild(world);
    for (let i = 0; i < 200 && world.run.phase !== "wave"; i++) step(world, TICK_DT_S);
    const snap = snapshotWorld(world).waves as unknown as { fixedAtList: number[]; fixedTarget: number[]; fixedSpawned: number[]; fixedServed: number; fixedTotal: number };
    expect(world.waves.number).toBe(7);
    expect(snap.fixedAtList).toEqual([70, 182, 0, 0, 0, 0, 0, 0]); // round(280 × 0.25), round(280 × 0.65)
    expect(snap.fixedTarget).toEqual(ZOMBIE_TYPES.map((t) => (t === "brute" ? 2 : 0)));
    expect(snap.fixedSpawned).toEqual(ZOMBIE_TYPES.map(() => 0)); // the opening burst serves none
    expect(snap.fixedTotal).toBe(2);
    expect(snap.fixedServed).toBe(0);
    expect(Array.isArray(snap.fixedAtList)).toBe(true); // plain arrays (the digest), not typed arrays
  });

  it("the second Brute waits for 65 % SPAWNED (killing everything as it appears does not bring it sooner)", () => {
    // runOrders kills every zombie on the tick it appears: the second Brute still comes at spawn #260 of 400.
    const { orders } = runOrders(4, { startWave: 10 });
    const order = orders.get(10) as string[];
    expect(order.indexOf("brute")).toBe(100);
    expect(order.lastIndexOf("brute")).toBe(260);
  }, 60_000);

  it("F4: zombies never get tougher: a wave-10 zombie has the same HP, speed and damage as a wave-1 zombie of its type", () => {
    const world = createWorld({ balance: balanceWith({ runWaves: 10 }, true), seed: 5, systems: { zombies: () => {} } });
    addPlayer(world, "p0", 24, 16).hp = 1e9;
    const stats = new Map<string, string>();
    const record = (wave: number) => {
      const z = world.zombies;
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        const key = ZOMBIE_TYPES[z.type[id] as number] as string;
        // HP is the only per-body stat set at spawn; speed and damage are read per type from `zombies.json` (no wave input).
        const val = `${z.hp[id]}|${z.slowPct[id]}`;
        const prev = stats.get(key);
        if (prev === undefined) stats.set(key, val);
        else expect(val, `${key} in wave ${wave}`).toBe(prev);
      }
    };
    startBuild(world);
    for (let guard = 0; guard < 80000 && world.run.phase !== "results"; guard++) {
      step(world, TICK_DT_S);
      if (world.run.phase !== "wave") continue;
      record(world.waves.number);
      while (world.zombies.aliveCount > 0) killZombie(world, world.zombies.aliveIds[0] as number, null, "pistol");
    }
    expect(world.waves.number).toBe(10);
    expect([...stats.keys()].sort()).toEqual([...ZOMBIE_TYPES].sort()); // every type seen at least once
    for (const [type, v] of stats) expect(Number(v.split("|")[0]), type).toBe(world.balance.zombies.types[type]?.hp);
  }, 120_000);

  it("F5: the last-5 rush in wave 10 (queue empty, 5 left → they rush)", () => {
    const { world, events } = setup({ runWaves: 10 });
    world.debug.bossWaves = []; // the rush alone (Story 6.6: the wave-10 Behemoth throws at the player and kills zombies by the spot)
    world.waves.number = 9; // the next wave is 10 (single player at × 1.0: 400)
    skipWave(world); // no-op in a build; the build countdown starts wave 10
    for (let i = 0; i < 200 && world.run.phase !== "wave"; i++) step(world, TICK_DT_S);
    expect(world.waves.number).toBe(10);
    expect(world.waves.size).toBe(400);
    for (let i = 0; i < 20000 && world.waves.queued > 0; i++) {
      step(world, TICK_DT_S);
      const z = world.zombies;
      if (world.waves.queued > 0) while (z.aliveCount > 6) killZombie(world, z.aliveIds[0] as number, "local", "pistol");
    }
    expect(world.waves.rushing).toBe(false); // 6 + the last batch alive
    const z = world.zombies;
    while (z.aliveCount > 6) killZombie(world, z.aliveIds[0] as number, "local", "pistol");
    run(world, 1);
    expect(world.waves.rushing).toBe(false);
    killZombie(world, z.aliveIds[0] as number, "local", "pistol");
    run(world, 1);
    expect(world.waves.rushing).toBe(true);
    for (let i = 0; i < z.aliveCount; i++) expect(z.state[z.aliveIds[i] as number]).toBe(ZOMBIE_STATE.RUSH);
    expect(events.some((e) => e.type === "wave.rush_started" && e.count === 5)).toBe(true);
  });
});
