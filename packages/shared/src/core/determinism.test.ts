import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { createRng } from "./rng";
import type { SimEvent } from "./simEvents";
import type { SystemFn } from "./systems";
import { createWorld, setInput, step, type World } from "./world";
import { snapshotWorld } from "./worldSnapshot";

const balance = loadBalance();
const TICKS = 1000;

/** A scripted input log, generated from its own seeded Rng (not the World's). */
function makeInputLog(): Map<number, PlayerInput> {
  const rng = createRng(2026);
  const log = new Map<number, PlayerInput>();
  for (let tick = 0; tick < TICKS; tick += rng.int(1, 6)) {
    log.set(tick, {
      ...NEUTRAL_INPUT,
      seq: tick,
      moveX: rng.range(-1, 1),
      moveY: rng.range(-1, 1),
      aimX: rng.range(-1, 1),
      aimY: rng.range(-1, 1),
      fire: rng.next() < 0.5,
    });
  }
  return log;
}

interface Probe {
  acc: number;
  draws: number[];
  events: string[];
}

/** Runs a World with a test system that mixes inputs and a World stream (`events`, Story 4.4) into state and events. */
function run(seed: number, log: Map<number, PlayerInput>) {
  const probe: Probe = { acc: 0, draws: [], events: [] };
  const testSystem: SystemFn = (w: World) => {
    const input = w.inputs.get("local");
    const r = w.streams.events.next();
    probe.acc += (input ? input.moveX * 3 + input.aimY : 0) + r;
    if (r < 0.1) {
      probe.draws.push(w.streams.events.int(0, 1000));
      w.events.emit({ type: "test.ping", n: w.tick });
    }
  };
  const world = createWorld({ balance, seed, systems: { player: testSystem } });
  world.events.subscribe((e: SimEvent) => probe.events.push(JSON.stringify(e)));
  for (let tick = 0; tick < TICKS; tick++) {
    const input = log.get(tick);
    if (input) setInput(world, "local", input);
    step(world, TICK_DT_S);
  }
  return { world: snapshotWorld(world), ...probe };
}

describe("determinism (NFR10)", () => {
  it("gives identical state for the same seed and input log after 1,000 ticks", () => {
    const log = makeInputLog();
    const a = run(42, log);
    const b = run(42, log);
    expect(a.world.tick).toBe(TICKS);
    expect(a.world.inputs.length).toBe(1);
    expect(a.events.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it("diverges for a different seed", () => {
    const log = makeInputLog();
    expect(run(43, log)).not.toEqual(run(42, log));
  });
});

describe("Story 6.3 F8: darkness only hides, it never changes a hit", () => {
  it("a seeded bot run with every wave at 5 % light gives the same snapshot as with the lights on (light fields aside)", async () => {
    const { runHeadless: headlessRun } = await import("../bots/headlessRun");
    const { bundledBalanceFiles } = await import("../config/balance");
    const raw = bundledBalanceFiles() as unknown as { decay: { blackout: { lightPctByWave: number[] } } };
    raw.decay.blackout.lightPctByWave = raw.decay.blackout.lightPctByWave.map(() => 5);
    const dark = loadBalance(raw as never);
    const strip = (w: World) => {
      const { lights, balanceVersion, ...rest } = snapshotWorld(w);
      void balanceVersion;
      return { rest, lights };
    };
    let litEnd: ReturnType<typeof strip> | null = null;
    let darkEnd: ReturnType<typeof strip> | null = null;
    let darkTicks = 0;
    let darkWaves = 0;
    const maxTicks = 20 * 120;
    const a = headlessRun({ balance, seed: 63, players: 2, maxTicks, onEnd: (w) => (litEnd = strip(w)) });
    const b = headlessRun({
      balance: dark,
      seed: 63,
      players: 2,
      maxTicks,
      onTick: (w) => {
        if (w.lights.blackoutPct === 5) darkTicks++;
        if (w.run.phase === "wave" && w.lights.blackoutPct === 5) darkWaves = Math.max(darkWaves, w.waves.number);
      },
      onEnd: (w) => (darkEnd = strip(w)),
    });
    // Liveness: waves were played and fought in the dark.
    expect(a.wavesCleared).toBeGreaterThanOrEqual(2);
    expect(darkWaves).toBeGreaterThanOrEqual(2);
    expect(darkTicks).toBeGreaterThan(400);
    expect(a.kills.reduce((x, y) => x + y, 0)).toBeGreaterThan(20);
    expect(b).toEqual(a);
    expect(darkEnd!.rest).toEqual(litEnd!.rest);
  });
});
