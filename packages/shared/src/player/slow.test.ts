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
import { playerSpeed, slowPlayer, tickSlow, wielderSlowPct } from "./slow";
import { setLoadout } from "../combat/loadout";
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

describe("Story 5.2: the Chainsaw slows its wielder only while attacking (F5)", () => {
  const STEP_ATTACK = (SPEED * 80) / 100 * TICK_DT_S; // 3.6 m/s
  const STEP_BOTH = (SPEED * 70 * 80) / 10000 * TICK_DT_S; // 2.52 m/s
  const chainsawWorld = (weapons: [string, string | null] = ["chainsaw", "pistol"]) => {
    const world = createWorld({ balance, seed: 3, systems: { waves: () => {}, zombies: () => {} } });
    const p = addPlayer(world, "p0", 10, 16);
    setLoadout(balance, p.loadout, weapons);
    return { world, p };
  };
  /** One tick walking +x with the given aim/fire; returns the distance moved. */
  const walk = (world: World, p: PlayerState, seq: number, extra: Partial<typeof NEUTRAL_INPUT> = {}) => {
    const x0 = p.x;
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq, moveX: 1, aimX: 0, aimY: 1, fire: true, ...extra });
    step(world, TICK_DT_S);
    return p.x - x0;
  };

  it("balance: 20 % on the Chainsaw, 0 on every other weapon", () => {
    for (const [id, w] of Object.entries(balance.weapons)) expect(w.kind === "melee" ? w.wielderSlowPct : 0, id).toBe(id === "chainsaw" ? 20 : 0);
  });

  it("chainsaw slows to 3.6 m/s only while attacking", () => {
    const { world, p } = chainsawWorld();
    for (let t = 1; t <= 20; t++) expect(walk(world, p, t)).toBeCloseTo(STEP_ATTACK, 12);
    expect(speedNow(p, world)).toBeCloseTo(3.6, 12);
    // aim released (fire held by a stick that sends zero aim inside the dead zone) → full speed next tick
    expect(walk(world, p, 21, { aimX: 0, aimY: 0 })).toBeCloseTo(FULL_STEP, 12);
    expect(walk(world, p, 22, { fire: false })).toBeCloseTo(FULL_STEP, 12);
    expect(walk(world, p, 23)).toBeCloseTo(STEP_ATTACK, 12);
    expect(walk(world, p, 24, { aimX: 1e-7, aimY: 0 })).toBeCloseTo(FULL_STEP, 12); // below MIN_AIM_LEN: no swing, no slow
  });

  it("no slow while swapping / downed / aim released / chainsaw not in hand", () => {
    const a = chainsawWorld(["pistol", "chainsaw"]);
    expect(walk(a.world, a.p, 1)).toBeCloseTo(FULL_STEP, 12); // the Chainsaw in the other slot
    expect(walk(a.world, a.p, 2, { swap: true })).toBeCloseTo(FULL_STEP, 12); // the tap tick: the swap starts in combat
    const swapTicks = Math.round(balance.player.swapS / TICK_DT_S);
    for (let t = 0; t < swapTicks; t++) expect(walk(a.world, a.p, 3 + t), `swap tick ${t}`).toBeCloseTo(FULL_STEP, 12);
    expect(a.p.loadout.active).toBe(1);
    expect(walk(a.world, a.p, 3 + swapTicks)).toBeCloseTo(STEP_ATTACK, 12); // now in hand and attacking
    // swap away: full speed from the next tick on (the swap is running)
    walk(a.world, a.p, 4 + swapTicks, { swap: true });
    expect(walk(a.world, a.p, 5 + swapTicks)).toBeCloseTo(FULL_STEP, 12);

    const d = chainsawWorld();
    d.p.status = "downed";
    expect(wielderSlowPct(balance, d.p, { ...NEUTRAL_INPUT, aimX: 1, fire: true })).toBe(0);
    d.p.status = "alive";
    expect(wielderSlowPct(balance, d.p, { ...NEUTRAL_INPUT, aimX: 1, fire: true })).toBe(20);
    expect(wielderSlowPct(balance, d.p, undefined)).toBe(0);
    const m = chainsawWorld(["machete", null]);
    expect(walk(m.world, m.p, 1)).toBeCloseTo(FULL_STEP, 12);
  });

  it("stacks with a Crawler bite to 2.52 m/s (multiplied, never below)", () => {
    const { world, p } = chainsawWorld();
    slowPlayer(p, 30, 10);
    expect(speedNow(p, world)).toBeCloseTo(2.52, 12);
    expect(walk(world, p, 1)).toBeCloseTo(STEP_BOTH, 12);
    expect(playerSpeed(SPEED, p, 20)).toBe((SPEED * 70 * 80) / 10000);
    expect(playerSpeed(SPEED, p, 0)).toBe((SPEED * 70) / 100); // the 3.9 expression unchanged without a wield slow
  });

  it("the same integers give the same speed on both sides (no float percent)", () => {
    const { world, p } = chainsawWorld();
    const input = { ...NEUTRAL_INPUT, aimX: 0.3, aimY: -0.9, fire: true };
    expect(Number.isInteger(wielderSlowPct(balance, p, input))).toBe(true);
    // A second World with the same state computes the identical number (the Predictor's case).
    const b = chainsawWorld();
    expect(playerSpeed(SPEED, b.p, wielderSlowPct(balance, b.p, input))).toBe(playerSpeed(SPEED, p, wielderSlowPct(world.balance, p, input)));
  });
});

/** The speed `movePlayers` would use for p now with a held, aimed trigger. */
function speedNow(p: PlayerState, world: World): number {
  return playerSpeed(SPEED, p, wielderSlowPct(world.balance, p, { ...NEUTRAL_INPUT, aimX: 1, fire: true }));
}
