import { beforeEach, describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, isPowerOut, lightsOf, setForcedBlackout, NEUTRAL_INPUT, PLACEHOLDER_MAP, TICK_DT_S, addPlayer, createWorld, loadBalance, setInput, setLoadout, step, type SimEvent } from "@topdown/shared";
import { perf } from "./perfStats";
import {
  STRESS_DURATION_MS,
  STRESS_WARMUP_MS,
  StressRun,
  STRESS_FLOOR_BUILDINGS,
  applyStressStage,
  formatStressReport,
  placeStressFloor,
  placeStressLights,
  STRESS_FLOODLIGHTS,
  STRESS_MED_STATIONS,
  setupStressWorld,
  toughenStressZombies,
  spawnInView,
  stressFireInput,
  viewAround,
  type ViewRect,
} from "./stressScenario";

const balance = loadBalance();
const env = () => ({ userAgent: "TestUA", viewport: "844×390", dpr: 2 });

// The global `perf` singleton is shared by every test in this file; reset it so a test can never
// observe the overlay/summary/ring-buffer state left behind by an earlier one.
beforeEach(() => perf.reset());

describe("stressFireInput (Story 5.3 ?stressfire)", () => {
  it("aims at the nearest zombie and holds fire; the stress survivor's Shotgun really kills", () => {
    const world = createWorld({ balance, seed: 4, map: PLACEHOLDER_MAP });
    const p = addPlayer(world, "local", 24, 16);
    setLoadout(balance, p.loadout, ["shotgun", null]);
    const view: ViewRect = { x: 0, y: 0, w: 0, h: 0 };
    setupStressWorld(world, 150, viewAround(world.map, 24, 16, 20, 10, view), 24, 16);
    const input = { ...NEUTRAL_INPUT };
    let kills = 0;
    let fired = 0;
    world.events.subscribe((e: SimEvent) => {
      if (e.type === "zombie.killed" && e.weapon === "shotgun") kills++;
      if (e.type === "weapon.fired") fired++;
    });
    for (let t = 0; t < 200; t++) {
      expect(stressFireInput(world, "local", input)).toBe(true);
      expect(Math.hypot(input.aimX, input.aimY)).toBeCloseTo(1, 6);
      setInput(world, "local", { ...input, seq: t + 1 });
      step(world, TICK_DT_S);
    }
    expect(fired).toBeGreaterThan(5);
    expect(kills).toBeGreaterThan(5);
  });

  it("releases fire with no zombie", () => {
    const world = createWorld({ balance, seed: 4, map: PLACEHOLDER_MAP });
    addPlayer(world, "local", 24, 16);
    const input = { ...NEUTRAL_INPUT, fire: true };
    expect(stressFireInput(world, "local", input)).toBe(false);
    expect(input.fire).toBe(false);
  });
});

describe("viewAround", () => {
  it("centers the view on the target and clamps it inside the map", () => {
    const v: ViewRect = { x: 0, y: 0, w: 0, h: 0 };
    viewAround(PLACEHOLDER_MAP, PLACEHOLDER_MAP.widthM / 2, PLACEHOLDER_MAP.heightM / 2, 20, 10, v);
    expect(v.x).toBeCloseTo(PLACEHOLDER_MAP.widthM / 2 - 10, 6);
    viewAround(PLACEHOLDER_MAP, 1, 1, 20, 10, v);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });
});

describe("spawnInView", () => {
  it("places every zombie inside the view, clear of the survivor, repeatably for a seed", () => {
    const positions = () => {
      const world = createWorld({ balance, seed: 42, systems: { waves: () => {} } });
      const view: ViewRect = { x: 10, y: 5, w: 20, h: 10 };
      expect(spawnInView(world, "walker", 150, view, 20, 10)).toBe(150);
      const z = world.zombies;
      const out: number[] = [];
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        const x = z.x[id] as number;
        const y = z.y[id] as number;
        expect(x).toBeGreaterThanOrEqual(10);
        expect(x).toBeLessThanOrEqual(30);
        expect(y).toBeGreaterThanOrEqual(5);
        expect(y).toBeLessThanOrEqual(15);
        expect(Math.hypot(x - 20, y - 10)).toBeGreaterThanOrEqual(2.5);
        out.push(x, y);
      }
      return out;
    };
    expect(positions()).toEqual(positions());
  });
});

describe("setupStressWorld", () => {
  it("turns god mode on, pauses the waves and spawns the Walkers; the survivor never takes damage", () => {
    const world = createWorld({ balance, seed: 3 });
    const p = addPlayer(world, "local", PLACEHOLDER_MAP.widthM / 2, PLACEHOLDER_MAP.heightM / 2);
    const view = viewAround(world.map, p.x, p.y, 24, 11, { x: 0, y: 0, w: 0, h: 0 });
    expect(setupStressWorld(world, 150, view, p.x, p.y)).toBe(150);
    for (let i = 0; i < 20 * 20; i++) step(world, TICK_DT_S); // 20 s, real zombie AI and wave system
    expect(p.hp).toBe(p.maxHp);
    expect(world.waves.number).toBe(0);
    expect(world.zombies.aliveCount).toBe(150);
  });

  it("Story 5.6: ?wavemix=walker,spitter puts Spitters in the stress crowd; spits fly and puddles pile up (capped), god mode holds", () => {
    const world = createWorld({ balance, seed: 3 });
    const p = addPlayer(world, "local", PLACEHOLDER_MAP.widthM / 2, PLACEHOLDER_MAP.heightM / 2);
    const view = viewAround(world.map, p.x, p.y, 24, 11, { x: 0, y: 0, w: 0, h: 0 });
    expect(setupStressWorld(world, 150, view, p.x, p.y, ["walker", "spitter"])).toBe(150);
    let spits = 0;
    let maxPuddles = 0;
    world.events.subscribe((e) => {
      if (e.type === "spitter.spat") spits++;
    });
    for (let i = 0; i < 20 * 20; i++) {
      step(world, TICK_DT_S);
      maxPuddles = Math.max(maxPuddles, world.areas.count);
    }
    let spitters = 0;
    for (let i = 0; i < world.zombies.aliveCount; i++) if (world.zombies.type[world.zombies.aliveIds[i] as number] === 3) spitters++;
    expect(spitters).toBe(75);
    expect(spits).toBeGreaterThan(20); // liveness
    expect(maxPuddles).toBeLessThanOrEqual(balance.zombies.spitCaps.maxLivePuddles);
    expect(maxPuddles).toBeGreaterThan(0);
    expect(p.hp).toBe(p.maxHp);
  });
});

describe("StressRun", () => {
  it("warms up, measures 60 s, then publishes a report and stops measuring", () => {
    const run = new StressRun(env);
    const phases: string[] = [];
    run.subscribe((s) => phases.push(s.phase));
    let t = 0;
    run.start(t, 150);
    expect(perf.overlayOn).toBe(true);
    const frame = () => {
      t += 1000 / 60;
      perf.recordFrame(t, 1000 / 60, 4, 2);
      perf.recordTick(t, 1.5);
      run.frame(t);
    };
    while (t < STRESS_WARMUP_MS + 10) frame();
    expect(run.state.phase).toBe("running");
    expect(perf.summary).not.toBeNull();
    while (run.state.phase === "running" && t < 100_000) frame();
    expect(run.state.phase).toBe("done");
    expect(perf.summary).toBeNull();
    expect(phases).toEqual(["warmup", "running", "done"]);
    const r = run.state.result;
    expect(r?.durationS).toBeGreaterThanOrEqual(STRESS_DURATION_MS / 1000);
    expect(r?.avgFps).toBeCloseTo(60, 3);
    expect(r?.tickAvgMs).toBeCloseTo(1.5, 5);
    expect(run.state.report).toContain("150 Walkers");
    expect(run.state.report).toContain("| (device) | TestUA | 60.0 |");
  });
});

describe("formatStressReport", () => {
  it("prints the numbers, the verdict and the bottleneck", () => {
    const text = formatStressReport(
      {
        durationS: 60,
        frames: 1800,
        avgFps: 30,
        minFps: 12.5,
        worstSecondFps: 22,
        pctUnder30: 41.234,
        frameAvgMs: 33.3,
        tickAvgMs: 9.1,
        tickMaxMs: 20,
        renderAvgMs: 5,
        updateAvgMs: 12,
        bottleneck: "simulation",
        targetMet: false,
      },
      150,
      env(),
    );
    expect(text).toContain("avg FPS 30.0 · min FPS 12.5 (worst second 22)");
    expect(text).toContain("frames < 30 FPS: 41.23 %");
    expect(text).toContain("missed · bottleneck: simulation");
    expect(text).not.toContain("renderer"); // no renderer line given
  });

  it("Story 4.13: prints the renderer line when the env has one", () => {
    const r = { durationS: 60, frames: 1, avgFps: 1, minFps: 1, worstSecondFps: 1, pctUnder30: 0, frameAvgMs: 1, tickAvgMs: 1, tickMaxMs: 1, renderAvgMs: 1, updateAvgMs: 1, bottleneck: "simulation" as const, targetMet: false };
    const text = formatStressReport(r, 150, { ...env(), renderer: "renderer Canvas" });
    expect(text.split("\n")).toContain("renderer Canvas");
  });
});

describe("StressRun interruption", () => {
  it("stops with a message instead of a report when the page goes to the background", async () => {
    const { StressRun, INTERRUPTED_REPORT } = await import("./stressScenario");
    const run = new StressRun(() => ({ userAgent: "test", viewport: "844x390", dpr: 2 }));
    run.start(0, 150);
    run.frame(2500); // past the warm-up: running
    expect(run.state.phase).toBe("running");
    run.interrupt();
    expect(run.state.phase).toBe("interrupted");
    expect(run.state.report).toBe(INTERRUPTED_REPORT);
    expect(run.state.result).toBeNull();
    run.interrupt(); // no-op once stopped
    expect(run.state.phase).toBe("interrupted");
  });
});


describe("Story 10.2 B1: ?stress=150&stressstage=5&blackout=10 (the wave 9 scene)", () => {
  it("the Downtown stress world really reaches stage 5 (power out, the stage 5 map) with 150 Walkers alive in view, darkness 10 %", () => {
    const world = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP });
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    addPlayer(world, "local", cx, cy);
    setForcedBlackout(world, 10);
    const solidsAt1 = world.obstacles.solids.length;
    expect(applyStressStage(world, 5)).toBe(5); // before the Walkers, like GameScene
    expect(world.decay.stage).toBe(5);
    expect(world.obstacles.stage).toBe(5);
    expect(isPowerOut(world)).toBe(true);
    expect(world.obstacles.solids.length).not.toBe(solidsAt1); // the stage 5 map's cover, not stage 1's
    const view = viewAround(world.map, cx, cy, 844 / 32, 390 / 32, { x: 0, y: 0, w: 0, h: 0 });
    expect(setupStressWorld(world, 150, view, cx, cy)).toBe(150);
    for (let i = 0; i < 40; i++) step(world, TICK_DT_S); // it keeps running: the crowd lives (god mode, waves paused)
    const z = world.zombies;
    expect(z.aliveCount).toBe(150);
    let inView = 0;
    for (let k = 0; k < z.aliveCount; k++) {
      const id = z.aliveIds[k] as number;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      if (x >= view.x - 1 && x <= view.x + view.w + 1 && y >= view.y - 1 && y <= view.y + view.h + 1) inView++;
    }
    expect(inView).toBeGreaterThanOrEqual(140);
    expect(world.decay.stage).toBe(5); // nothing moved it back
    expect(world.lights.blackoutPct).toBe(10);
  });
});

describe("Story 5.10: ?stressbuild=lights", () => {
  it("lays 8 floodlights and 4 med stations round the survivor on Downtown, none overlapping; they stay standing; 8 lights", () => {
    const world = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP });
    addPlayer(world, "local", 24, 16);
    expect(placeStressLights(world, "local", 24, 16)).toBe(STRESS_FLOODLIGHTS + STRESS_MED_STATIONS);
    const types = world.buildings.list.map((b) => b.type);
    expect(types.filter((t) => t === "floodlight").length).toBe(8);
    expect(types.filter((t) => t === "med_station").length).toBe(4);
    const list = world.buildings.list;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        expect(a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY).toBe(false);
      }
    expect(list.every((b) => b.hp === b.maxHp && b.hp >= 1e9)).toBe(true);
    expect(lightsOf(world).filter((l) => l.kind === "floodlight")).toHaveLength(8);
  });
});

describe("Story 5.9: ?stressbuild=traps", () => {
  it("lays 24 non-overlapping spike traps and mines round the survivor; the crowd can't die on them", () => {
    const world = createWorld({ balance, seed: 3, map: PLACEHOLDER_MAP });
    addPlayer(world, "local", 24, 16);
    expect(placeStressFloor(world, "local", 24, 16)).toBe(STRESS_FLOOR_BUILDINGS);
    const types = world.buildings.list.map((b) => b.type);
    expect(types.filter((t) => t === "spike_trap").length).toBe(12);
    expect(types.filter((t) => t === "mine").length).toBe(12);
    const list = world.buildings.list;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        expect(a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY).toBe(false);
      }
    setupStressWorld(world, 50, viewAround(world.map, 24, 16, 20, 10, { x: 0, y: 0, w: 0, h: 0 }), 24, 16);
    toughenStressZombies(world);
    for (let i = 0; i < 100; i++) step(world, TICK_DT_S);
    expect(world.zombies.aliveCount).toBe(50);
  });
});
