import { describe, expect, it } from "vitest";
import { BalanceError, bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { parseWaveMix } from "../waves/waveMix";
import { spawnZombie, zombieTypeOf } from "../zombies/zombiePool";
import { ZOMBIE_TYPES } from "../zombies/zombieTypes";
import { addPlayer, type PlayerState } from "./player";
import { playerSpeed, slowPlayer, tickSlow } from "./slow";
import { setBuildReady, startBuild } from "../run/runStateMachine";

/** These tests cover one mechanic: keep the wave director from spawning extra zombies. */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const crawler = balance.zombies.types.crawler;
const SPEED = balance.player.speedMps;
const SLOWED_STEP = (SPEED * (100 - 30)) / 100 * TICK_DT_S;
const FULL_STEP = SPEED * TICK_DT_S;

const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};

/** A player with a Crawler in contact (it bites on the first tick). */
function bitten(godMode = false) {
  const world = createWorld({ balance, seed: 3, systems: NO_WAVES });
  world.debug.godMode = godMode;
  const p = addPlayer(world, "p0", 20, 16);
  const id = spawnZombie(world, "crawler", 20 - p.radiusM - 0.35, 16);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, p, id, events };
}

describe("Crawler balance (Story 3.9, FR22)", () => {
  it("has the GDD numbers", () => {
    expect(crawler).toMatchObject({ hp: 8, speedMps: 0.7, damage: 12, attackIntervalS: 1, reward: 3, biteSlowPct: 30, biteSlowS: 1 });
    expect(ZOMBIE_TYPES.indexOf("crawler")).toBe(1); // append-only wire index
  });

  it("Walkers default to no slow", () => {
    expect(balance.zombies.types.walker).toMatchObject({ biteSlowPct: 0, biteSlowS: 0 });
  });

  it("rejects a non-integer or too strong slow, and a slow too long for the uint8 wire field", () => {
    for (const [path, v] of [
      ["types.crawler.biteSlowPct", 95],
      ["types.crawler.biteSlowPct", 1.5],
      ["types.crawler.biteSlowS", 11],
    ] as const) {
      expect(() => loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", path, v]]))).toThrow(BalanceError);
    }
  });
});

describe("Crawler AI", () => {
  it("crawls straight at the player at 0.7 m/s", () => {
    const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(world, "p0", 30, 10);
    const id = spawnZombie(world, "crawler", 10, 10);
    run(world, 20);
    expect(zombieTypeOf(world.zombies, id)).toBe("crawler");
    expect(world.zombies.x[id]).toBeCloseTo(10.7, 4);
  });

  it("bites for 12 once per second", () => {
    const { world, p, events } = bitten();
    run(world, 1);
    expect(p.hp).toBe(88);
    run(world, 19);
    expect(p.hp).toBe(88);
    run(world, 1);
    expect(p.hp).toBe(76);
    expect(events.filter((e) => e.type === "player.damaged").length).toBe(2);
  });
});

describe("bite slow (Story 3.9)", () => {
  it("a bite slows exactly 30 % for exactly 20 movement ticks", () => {
    const { world, p, id } = bitten();
    run(world, 1); // tick 1: the bite (zombie system, after movement)
    expect(p.slowTicksLeft).toBe(20);
    expect(p.slowPct).toBe(30);
    world.zombies.x[id] = 2; // out of reach: no second bite
    world.zombies.y[id] = 2;
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 1, moveX: 0, moveY: 1 });
    const steps: number[] = [];
    for (let i = 0; i < 22; i++) {
      const y0 = p.y;
      step(world, TICK_DT_S);
      steps.push(p.y - y0);
    }
    for (let i = 0; i < 20; i++) expect(steps[i]).toBeCloseTo(SLOWED_STEP, 12);
    expect(steps[20]).toBeCloseTo(FULL_STEP, 12);
    expect(steps[21]).toBeCloseTo(FULL_STEP, 12);
    expect(p.slowTicksLeft).toBe(0);
    expect(p.slowPct).toBe(0);
  });

  it("a second bite refreshes the second, and never stacks", () => {
    const { world, p } = bitten();
    p.hp = 1e9;
    run(world, 1);
    expect(p.slowTicksLeft).toBe(20);
    run(world, 10);
    expect(p.slowTicksLeft).toBe(10);
    run(world, 10); // tick 21: the second bite
    expect(p.slowTicksLeft).toBe(20);
    expect(p.slowPct).toBe(30);
    // Two Crawlers biting in the same tick: still 30 %, still 20 ticks.
    const id2 = spawnZombie(world, "crawler", p.x + p.radiusM + 0.35, p.y);
    expect(id2).toBeGreaterThanOrEqual(0);
    run(world, 20);
    expect(p.slowPct).toBe(30);
    expect(p.slowTicksLeft).toBeLessThanOrEqual(20);
  });

  it("Walkers never slow", () => {
    const world = createWorld({ balance, seed: 3, systems: NO_WAVES });
    const p = addPlayer(world, "p0", 20, 16);
    spawnZombie(world, "walker", 20 - p.radiusM - 0.35, 16);
    run(world, 1);
    expect(p.hp).toBe(90);
    expect(p.slowTicksLeft).toBe(0);
  });

  it("god mode: no bite, no slow", () => {
    const { world, p } = bitten(true);
    run(world, 5);
    expect(p.hp).toBe(100);
    expect(p.slowTicksLeft).toBe(0);
  });

  it("the slow runs out while downed", () => {
    const { world, p } = bitten();
    p.hp = 5; // the bite downs them
    run(world, 1);
    expect(p.status).toBe("downed");
    expect(p.slowTicksLeft).toBe(20);
    run(world, 20);
    expect(p.slowTicksLeft).toBe(0);
  });

  it("slowPlayer / playerSpeed / tickSlow", () => {
    const p = { slowTicksLeft: 0, slowPct: 0 } as PlayerState;
    expect(playerSpeed(4.5, p)).toBe(4.5);
    slowPlayer(p, 30, 20);
    expect(playerSpeed(4.5, p)).toBe((4.5 * 70) / 100);
    slowPlayer(p, 10, 5); // weaker and shorter: neither changes
    expect(p).toMatchObject({ slowTicksLeft: 20, slowPct: 30 });
    for (let i = 0; i < 20; i++) tickSlow(p);
    expect(p).toMatchObject({ slowTicksLeft: 0, slowPct: 0 });
    slowPlayer(p, 10, 5); // a new weaker slow after the old one ended applies on its own
    expect(p).toMatchObject({ slowTicksLeft: 5, slowPct: 10 });
    slowPlayer(p, 0, 20);
    expect(p).toMatchObject({ slowTicksLeft: 5, slowPct: 10 });
  });
});

describe("dev wave mix (Story 3.9; Story 3.10 keeps it as an override)", () => {
  it("parseWaveMix keeps known types only", () => {
    expect(parseWaveMix("walker, Crawler,ghost,", balance)).toEqual(["walker", "crawler"]);
    expect(parseWaveMix("ghost", balance)).toBeNull();
    expect(parseWaveMix(null, balance)).toBeNull();
    expect(parseWaveMix("", balance)).toBeNull();
  });

  it("wave zombies cycle through the mix; without it they are all Walkers", () => {
    const count = (mix: ReturnType<typeof parseWaveMix>) => {
      const world = createWorld({ balance, seed: 9, systems: { zombies: () => {} } });
      world.debug.waveMix = mix;
      addPlayer(world, "p0", 24, 16).hp = 1e9;
      startBuild(world); // Story 3.1: skip the first build phase
      setBuildReady(world, "p0", true);
      run(world, 400);
      const z = world.zombies;
      const types = { walker: 0, crawler: 0, runner: 0, spitter: 0 };
      for (let i = 0; i < z.aliveCount; i++) types[zombieTypeOf(z, z.aliveIds[i] as number)]++;
      return types;
    };
    expect(count(null).crawler).toBe(0);
    const mixed = count(parseWaveMix("walker,crawler", balance));
    expect(mixed.walker + mixed.crawler).toBe(16); // Story 3.10: solo W1 = 40 × 0.4
    expect(mixed.crawler).toBe(8);
  });

  it("is deterministic: the same seed with Crawlers gives identical snapshots (slow included)", () => {
    let slowedTicks = 0;
    const sim = () => {
      const world = createWorld({ balance, seed: 42 });
      world.debug.waveMix = parseWaveMix("crawler,walker,crawler", balance);
      addPlayer(world, "p0", 24, 16).hp = 1e9;
      for (let k = 0; k < 6; k++) spawnZombie(world, "crawler", 24.6 + k * 0.1, 16, true); // bites guaranteed
      for (let i = 0; i < 600; i++) {
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: i + 1, moveX: i % 80 < 40 ? 0.3 : -0.3 });
        step(world, TICK_DT_S);
        if ((world.players.get("p0")?.slowTicksLeft ?? 0) > 0) slowedTicks++;
      }
      return world;
    };
    const a = sim();
    const b = sim();
    expect(snapshotWorld(a)).toEqual(snapshotWorld(b));
    expect(snapshotWorld(a).players[0]?.[1]).toHaveProperty("slowTicksLeft");
    expect(slowedTicks).toBeGreaterThan(0); // the run really had bites (review: it never did)
  });
});
