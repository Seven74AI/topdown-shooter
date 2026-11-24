import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { ticksFor } from "../core/time";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { downPlayer } from "../player/downed";
import { addPlayer, removePlayer, type PlayerState } from "../player/player";
import { killZombie } from "../zombies/zombiePool";
import { endRun, endWave, setBuildReady, skipWave, startBuild, startWave } from "./runStateMachine";

const balance = loadBalance();
const BUILD_TICKS = ticksFor(balance.waves.buildPhaseS);

/** Zombies frozen (kills by hand), players can't be hurt unless a test says so. */
function setup(ids: readonly string[] = ["p0", "p1"], zombiesMove = false) {
  const world = createWorld({ balance, seed: 11, ...(zombiesMove ? {} : { systems: { zombies: () => {} } }) });
  const players = ids.map((id, i) => addPlayer(world, id, 20 + i * 3, 16));
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, players, events };
}
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const ofType = (events: readonly SimEvent[], type: SimEvent["type"]) => events.filter((e) => e.type === type);
const killWave = (world: World) => {
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) killZombie(world, z.aliveIds[i] as number, "p0", "pistol");
};
/** Spawns the whole wave and kills it, tick by tick, until the wave ends. */
const clearWave = (world: World) => {
  for (let i = 0; i < 5000 && world.run.phase === "wave"; i++) {
    step(world, TICK_DT_S);
    killWave(world);
  }
};

describe("run state machine: transitions (AC 1)", () => {
  it("a new World is in the lobby, with no build timer", () => {
    const { world } = setup();
    expect(world.run).toEqual({ phase: "lobby", buildTicksLeft: 0, heldOut: false });
    run(world, 100); // nothing moves the lobby on by itself
    expect(world.run.phase).toBe("lobby");
    expect(world.waves.number).toBe(0);
  });

  it("Lobby → Build → Wave → Build → Wave → Results through the named transitions only", () => {
    const { world, events } = setup();
    startBuild(world);
    expect(world.run).toEqual({ phase: "build", buildTicksLeft: BUILD_TICKS, heldOut: false });
    startWave(world);
    expect(world.run.phase).toBe("wave");
    expect(world.waves.number).toBe(1);
    endWave(world);
    expect(world.run.phase).toBe("build");
    expect(world.run.buildTicksLeft).toBe(BUILD_TICKS);
    startWave(world);
    expect(world.waves.number).toBe(2);
    endRun(world);
    expect(world.run.phase).toBe("results");
    world.events.flush();
    expect(events.map((e) => e.type)).toEqual(["build.started", "wave.started", "wave.ended", "build.started", "wave.started"]);
    expect(ofType(events, "build.started")).toEqual([
      { type: "build.started", wave: 1 },
      { type: "build.started", wave: 2 },
    ]);
  });

  it("every transition from a wrong phase throws", () => {
    const { world } = setup();
    expect(() => startWave(world)).toThrow(/startWave/);
    expect(() => endWave(world)).toThrow(/endWave/);
    expect(() => endRun(world)).toThrow(/endRun/);
    startBuild(world);
    expect(() => startBuild(world)).toThrow(/startBuild/);
    expect(() => endWave(world)).toThrow(/endWave/);
    startWave(world);
    expect(() => startWave(world)).toThrow(/startWave/);
    endRun(world);
    for (const t of [startBuild, startWave, endWave, endRun]) expect(() => t(world)).toThrow();
  });

  it("an empty World is never 'all Ready': the build runs its full countdown (3.1 review)", () => {
    const { world } = setup([]);
    startBuild(world);
    run(world, BUILD_TICKS - 1);
    expect(world.run.phase).toBe("build");
  });

  it("a build can end the run too (endRun from build)", () => {
    const { world } = setup();
    startBuild(world);
    endRun(world);
    expect(world.run).toEqual({ phase: "results", buildTicksLeft: 0, heldOut: false });
  });
});

describe("build phase (AC 2)", () => {
  it("counts exactly 600 ticks (30 s): the wave is not started at 599, and starts on tick 600", () => {
    const { world, events } = setup();
    expect(BUILD_TICKS).toBe(600);
    startBuild(world);
    run(world, BUILD_TICKS - 1);
    expect(world.run.phase).toBe("build");
    expect(world.run.buildTicksLeft).toBe(1);
    expect(ofType(events, "wave.started")).toEqual([]);
    run(world, 1);
    expect(world.run.phase).toBe("wave");
    expect(world.run.buildTicksLeft).toBe(0);
    expect(ofType(events, "wave.started")).toEqual([{ type: "wave.started", number: 1, size: 24 }]); // 2 players: 40 × 0.6
    expect(world.zombies.aliveCount).toBeGreaterThan(0); // the first batch spawns on the start tick
  });

  it("spawns no zombie during a build", () => {
    const { world } = setup();
    startBuild(world);
    for (let i = 0; i < BUILD_TICKS - 1; i++) {
      step(world, TICK_DT_S);
      expect(world.zombies.aliveCount).toBe(0);
    }
  });

  it("everyone Ready ends it at the next tick; one not Ready keeps it", () => {
    const { world } = setup(["p0", "p1", "p2"]);
    startBuild(world);
    run(world, 10);
    setBuildReady(world, "p0", true);
    setBuildReady(world, "p1", true);
    run(world, 5);
    expect(world.run.phase).toBe("build");
    expect(world.run.buildTicksLeft).toBe(BUILD_TICKS - 15);
    setBuildReady(world, "p2", true);
    expect(world.run.phase).toBe("build"); // takes effect at the next tick
    run(world, 1);
    expect(world.run.phase).toBe("wave");
    for (const p of world.players.values()) expect(p.buildReady).toBe(false); // cleared at the wave start
  });

  it("Ready is a toggle: taking it back keeps the build", () => {
    const { world, players } = setup(["p0", "p1"]);
    startBuild(world);
    setBuildReady(world, "p0", true);
    setBuildReady(world, "p1", true);
    setBuildReady(world, "p1", false);
    expect((players[1] as PlayerState).buildReady).toBe(false);
    run(world, 3);
    expect(world.run.phase).toBe("build");
  });

  it("solo: the one player's Ready skips the rest of the build", () => {
    const { world } = setup(["local"]);
    startBuild(world);
    run(world, 2);
    setBuildReady(world, "local", true);
    run(world, 1);
    expect(world.run.phase).toBe("wave");
    expect(world.waves.number).toBe(1);
  });

  it("a player who left doesn't block the others' Ready", () => {
    const { world } = setup(["p0", "p1"]);
    startBuild(world);
    setBuildReady(world, "p0", true);
    removePlayer(world, "p1");
    run(world, 1);
    expect(world.run.phase).toBe("wave");
  });

  it("Ready outside a build, and for an unknown player, is ignored", () => {
    const { world, players } = setup(["p0"]);
    setBuildReady(world, "p0", true); // lobby
    expect((players[0] as PlayerState).buildReady).toBe(false);
    startBuild(world);
    startWave(world);
    setBuildReady(world, "p0", true); // wave
    expect((players[0] as PlayerState).buildReady).toBe(false);
    endWave(world);
    setBuildReady(world, "nobody", true);
    run(world, 1);
    expect(world.run.phase).toBe("build");
  });

  it("every build starts with Ready cleared", () => {
    const { world, players } = setup(["p0", "p1"]);
    startBuild(world);
    setBuildReady(world, "p0", true);
    startWave(world);
    endWave(world);
    expect(players.map((p) => p.buildReady)).toEqual([false, false]);
  });

  it("a cleared wave goes straight to the next build (no 5 s pause, AC 4)", () => {
    const { world, events } = setup(["p0"]);
    startBuild(world);
    setBuildReady(world, "p0", true);
    run(world, 1);
    clearWave(world);
    expect(world.run.phase).toBe("build");
    expect(world.waves.number).toBe(1);
    expect(world.run.buildTicksLeft).toBe(BUILD_TICKS);
    const ended = events.findIndex((e) => e.type === "wave.ended");
    expect(events[ended + 1]).toEqual({ type: "build.started", wave: 2 });
    run(world, BUILD_TICKS);
    expect(world.run.phase).toBe("wave");
    expect(world.waves.number).toBe(2);
  });

  it("a paused run (DEV_NO_WAVES, ?stress) freezes the countdown and ignores Ready", () => {
    const { world } = setup(["p0"]);
    startBuild(world);
    world.waves.paused = true;
    setBuildReady(world, "p0", true);
    run(world, BUILD_TICKS + 10);
    expect(world.run).toEqual({ phase: "build", buildTicksLeft: BUILD_TICKS, heldOut: false });
    world.waves.paused = false;
    run(world, 1);
    expect(world.run.phase).toBe("wave");
  });

  it("players move and fire during a build (same rules as a wave)", () => {
    const { world, players, events } = setup(["p0"]);
    const p = players[0] as PlayerState;
    startBuild(world);
    const x = p.x;
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 1, moveX: 1, aimX: 1, fire: true });
    run(world, 5);
    expect(p.x).toBeGreaterThan(x);
    expect(ofType(events, "weapon.fired").length).toBeGreaterThan(0);
    expect(world.run.phase).toBe("build");
  });
});

describe("heal and return at the build start (AC 3)", () => {
  it("heals standing players by 50 % of max HP (capped), returns downed and out players next to a teammate with 50 HP", () => {
    const { world, players, events } = setup(["p0", "p1", "p2", "p3"]);
    const [a, b, c, d] = players as [PlayerState, PlayerState, PlayerState, PlayerState];
    startBuild(world);
    startWave(world);
    a.hp = 20;
    b.hp = 70;
    downPlayer(world, c);
    run(world, ticksFor(balance.player.downedS));
    downPlayer(world, d);
    run(world, 3);
    expect([c.status, d.status]).toEqual(["out", "downed"]);
    killWave(world);
    world.waves.queued = 0;
    run(world, 1); // wave cleared → build
    expect(world.run.phase).toBe("build");
    expect(a.hp).toBe(70);
    expect(b.hp).toBe(100);
    expect(c).toMatchObject({ status: "alive", hp: 50 });
    expect(d).toMatchObject({ status: "alive", hp: 50 });
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeCloseTo(balance.player.spawnOffsetM, 9);
    expect(ofType(events, "player.returned").map((e) => (e as { playerId: string }).playerId)).toEqual(["p2", "p3"]);
  });

  it("a downed player (not yet out) comes back at the build start too", () => {
    const { world, players } = setup(["p0", "p1"]);
    const [, b] = players as [PlayerState, PlayerState];
    startBuild(world);
    startWave(world);
    downPlayer(world, b);
    run(world, 3);
    skipWave(world);
    expect(b).toMatchObject({ status: "alive", hp: 50, downedTicksLeft: 0 });
  });

  it("a team wipe ends the run (Results) on the same tick, and nothing changes phase after it", () => {
    const { world, players } = setup(["p0"], true);
    const p = players[0] as PlayerState;
    startBuild(world);
    startWave(world);
    p.hp = 1;
    for (let i = 0; i < 2000 && world.run.phase === "wave"; i++) step(world, TICK_DT_S);
    expect(p.status).toBe("downed");
    expect(world.teamWiped).toBe(true);
    expect(world.run.phase).toBe("results");
    run(world, BUILD_TICKS + 5);
    expect(world.run.phase).toBe("results");
  });
});

describe("determinism (NFR10)", () => {
  it("snapshots cover the run state and Ready, and two runs of the same seed through build → wave → build → wave match", () => {
    const go = () => {
      const { world } = setup(["p0", "p1"]);
      startBuild(world);
      run(world, 20);
      setBuildReady(world, "p1", true);
      run(world, 1);
      const mid = snapshotWorld(world);
      expect(mid.run).toEqual({ phase: "build", buildTicksLeft: BUILD_TICKS - 21, heldOut: false });
      expect(mid.players.find(([id]) => id === "p1")?.[1].buildReady).toBe(true);
      run(world, BUILD_TICKS);
      clearWave(world);
      setBuildReady(world, "p0", true);
      setBuildReady(world, "p1", true);
      run(world, 40);
      return snapshotWorld(world);
    };
    const a = go();
    expect(a.run.phase).toBe("wave");
    expect(a.waves.number).toBe(2);
    expect(go()).toEqual(a);
  });
});

describe("the run ends after wave runWaves (Story 3.10)", () => {
  /** Jumps the run to the build before wave `n` (waves skipped by the dev cheat). */
  const toBuildBefore = (world: World, n: number) => {
    startBuild(world);
    while (world.waves.number < n - 1) {
      startWave(world);
      skipWave(world);
    }
  };

  it("Story 6.1: clearing wave 10 (runWaves 10): wave.ended, the bonus, run.held_out, Results; no build after it", () => {
    const { world, events } = setup(["p0", "p1"]);
    expect(world.balance.waves.runWaves).toBe(10);
    toBuildBefore(world, 10);
    expect(world.run.phase).toBe("build");
    startWave(world);
    clearWave(world);
    expect(world.waves.number).toBe(10);
    expect(world.run).toEqual({ phase: "results", buildTicksLeft: 0, heldOut: true });
    expect(ofType(events, "build.started").map((e) => (e as { wave: number }).wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // none for a wave 11
    const tail = events.filter((e) => e.type === "wave.ended" || e.type === "run.held_out" || (e.type === "money.earned" && e.reason === "wave"));
    expect(tail.slice(-4)).toEqual([
      { type: "wave.ended", number: 10 },
      { type: "run.held_out", wave: 10 },
      { type: "money.earned", playerId: "p0", amount: 150, reason: "wave" }, // 10 × 15 (balance pass B1)
      { type: "money.earned", playerId: "p1", amount: 150, reason: "wave" },
    ]);
    run(world, BUILD_TICKS + 5);
    expect(world.run.phase).toBe("results");
    expect(world.waves.number).toBe(10);
    expect(world.zombies.aliveCount).toBe(0);
  });

  it("Story 6.1: clearing wave 6 (the old last wave) and wave 9 go to a build phase, not Results", () => {
    for (const n of [6, 9]) {
      const { world, events } = setup(["p0"]);
      toBuildBefore(world, n);
      startWave(world);
      clearWave(world);
      expect(world.run, `wave ${n}`).toEqual({ phase: "build", buildTicksLeft: BUILD_TICKS, heldOut: false });
      expect(ofType(events, "run.held_out")).toEqual([]);
    }
  });

  it("Story 6.1 (beat the rule 3): the last zombie of wave 10 dies on the tick the last player goes down: one ending, the wipe", () => {
    const { world, players, events } = setup(["p0"]);
    toBuildBefore(world, 10);
    startWave(world);
    world.waves.queued = 0;
    const z = world.zombies;
    for (let i = z.aliveCount - 1; i >= 0; i--) killZombie(world, z.aliveIds[i] as number, null, "pistol");
    downPlayer(world, players[0] as PlayerState); // and no zombie is left: both conditions on the same tick
    run(world, 2);
    expect(world.run).toEqual({ phase: "results", buildTicksLeft: 0, heldOut: false });
    expect(ofType(events, "run.held_out")).toEqual([]);
  });

  it("the dev skip of wave 10 ends the run too (how the browser check reaches the Results)", () => {
    const { world, events } = setup(["p0"]);
    toBuildBefore(world, 10);
    startWave(world);
    skipWave(world);
    expect(world.run.heldOut).toBe(true);
    expect(world.run.phase).toBe("results");
    run(world, 1); // events emitted between steps go out with the next one
    expect(ofType(events, "run.held_out")).toEqual([{ type: "run.held_out", wave: 10 }]);
  });

  it("a wipe in wave 10 is not a hold-out", () => {
    const { world, players, events } = setup(["p0"]);
    toBuildBefore(world, 10);
    startWave(world);
    downPlayer(world, players[0] as PlayerState);
    run(world, 2);
    expect(world.run).toEqual({ phase: "results", buildTicksLeft: 0, heldOut: false });
    expect(ofType(events, "run.held_out")).toEqual([]);
  });
});
