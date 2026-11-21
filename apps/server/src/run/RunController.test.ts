import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  TICK_DT_S,
  addPlayer,
  createWorld,
  loadBalance,
  setInput,
  setLoadout,
  snapshotWorld,
  spawnZombie,
  step,
  teamSpawnPoint,
  type PlayerInput,
  type SimEvent,
} from "@topdown/shared";
import { INPUT_QUEUE_MAX, RunController } from "./RunController";

const balance = loadBalance();
const SEED = 1234;
const TWO = [
  { playerId: "p0", slot: 0 },
  { playerId: "p1", slot: 1 },
];

const input = (seq: number, over: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq, ...over });

const newController = (players = TWO) => new RunController({ balance, seed: SEED, players, pauseWaves: true });

describe("RunController", () => {
  it("spawns each player at its team spawn point", () => {
    const c = newController();
    const want = teamSpawnPoint(c.world, 1, { x: 0, y: 0 });
    expect(c.world.players.get("p1")).toMatchObject({ x: want.x, y: want.y });
    expect(c.world.waves.paused).toBe(true);
  });

  it("moves two players exactly like a World fed the same inputs on the same ticks", () => {
    const c = newController();
    const ref = createWorld({ balance, seed: SEED });
    ref.waves.paused = true;
    const at = { x: 0, y: 0 };
    for (const { playerId, slot } of TWO) {
      teamSpawnPoint(ref, slot, at);
      addPlayer(ref, playerId, at.x, at.y);
    }
    for (let seq = 1; seq <= 30; seq++) {
      const a = input(seq, { moveX: 1, aimX: 0.5, aimY: 0.5, fire: seq % 3 === 0 });
      const b = input(seq, { moveX: -0.6, moveY: 0.8, swap: seq === 5 });
      c.queueInput("p0", a);
      c.queueInput("p1", b);
      setInput(ref, "p0", a);
      setInput(ref, "p1", b);
      c.tick();
      step(ref, TICK_DT_S);
    }
    expect(snapshotWorld(c.world)).toEqual(snapshotWorld(ref));
    expect(c.ackSeq("p0")).toBe(30);
    expect(c.world.players.get("p0")?.x).toBeGreaterThan(ref.map.widthM / 2);
  });

  it("a starved player holds still, keeps its aim and its ackSeq", () => {
    const c = newController();
    c.queueInput("p0", input(1, { moveX: 1, aimX: 0, aimY: 1 }));
    c.tick();
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no p0");
    const x = p.x;
    for (let i = 0; i < 3; i++) c.tick();
    expect(p.x).toBe(x);
    expect(c.ackSeq("p0")).toBe(1);
    expect(c.world.inputs.get("p0")).toMatchObject({ seq: 1, moveX: 0, moveY: 0, aimX: 0, aimY: 1 });
    expect(p.facingY).toBeCloseTo(1, 9);
  });

  it("applies two inputs that arrive in one tick over the next two ticks", () => {
    const c = newController();
    c.queueInput("p0", input(1, { moveX: 1 }));
    c.queueInput("p0", input(2, { moveX: 1 }));
    const x0 = c.world.players.get("p0")?.x ?? 0;
    c.tick();
    expect(c.ackSeq("p0")).toBe(1);
    c.tick();
    expect(c.ackSeq("p0")).toBe(2);
    const x2 = c.world.players.get("p0")?.x ?? 0;
    c.tick(); // starved
    expect(c.ackSeq("p0")).toBe(2);
    expect(c.world.players.get("p0")?.x).toBe(x2);
    expect(x2 - x0).toBeCloseTo(2 * balance.player.speedMps * TICK_DT_S, 9);
  });

  it("ignores old and duplicate seqs", () => {
    const c = newController();
    c.queueInput("p0", input(5));
    c.queueInput("p0", input(5));
    c.queueInput("p0", input(3));
    expect(c.queued("p0")).toBe(1);
    c.tick();
    c.queueInput("p0", input(4));
    c.queueInput("p0", input(0));
    expect(c.queued("p0")).toBe(0);
    expect(c.drops("p0").stale).toBe(4);
    c.queueInput("unknown", input(1)); // not in the run: ignored
  });

  it("drops the oldest input when the queue overflows", () => {
    const c = newController();
    for (let seq = 1; seq <= INPUT_QUEUE_MAX + 2; seq++) c.queueInput("p0", input(seq));
    expect(c.queued("p0")).toBe(INPUT_QUEUE_MAX);
    expect(c.drops("p0").overflow).toBe(2);
    c.tick();
    expect(c.ackSeq("p0")).toBe(3);
  });

  it("a swap followed by 3 starved ticks swaps once", () => {
    const c = newController();
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no p0");
    setLoadout(balance, p.loadout, ["pistol", "smg"]);
    const events: SimEvent["type"][] = [];
    c.queueInput("p0", input(1, { swap: true }));
    for (let i = 0; i < 4 + 20; i++) for (const e of c.tick()) if (e.type.startsWith("weapon.swap")) events.push(e.type);
    expect(events).toEqual(["weapon.swap_started", "weapon.swapped"]);
    expect(p.loadout.active).toBe(1);
  });

  it("returns this tick's events in a reused array", () => {
    const c = new RunController({ balance, seed: SEED, players: TWO, systems: { waves: () => {} } });
    c.queueInput("p0", input(1, { aimX: 1, fire: true }));
    const first = c.tick();
    expect(first.some((e) => e.type === "weapon.fired")).toBe(true);
    const second = c.tick();
    expect(second).toBe(first);
  });

  it("removing a player mid-wave is safe and zombies retarget", () => {
    const c = new RunController({ balance, seed: SEED, players: TWO, systems: { waves: () => {} } });
    const p0 = c.world.players.get("p0");
    const p1 = c.world.players.get("p1");
    if (!p0 || !p1) throw new Error("no players");
    // A Walker just left of p0; p1 is 3 m to the right of p0.
    const id = spawnZombie(c.world, "walker", p0.x - 3, p0.y, true);
    c.tick();
    const toP0 = c.world.zombies.x[id] as number;
    expect(toP0).toBeGreaterThan(p0.x - 3); // walking right, toward p0
    c.queueInput("p0", input(1, { moveX: -1 }));
    c.removePlayer("p0");
    expect(c.world.players.has("p0")).toBe(false);
    expect(() => {
      for (let i = 0; i < 10; i++) c.tick();
    }).not.toThrow();
    const zx = c.world.zombies.x[id] as number;
    const zy = c.world.zombies.y[id] as number;
    const before = Math.hypot(p1.x - toP0, p1.y - p0.y);
    expect(Math.hypot(p1.x - zx, p1.y - zy)).toBeLessThan(before);
    expect(c.ackSeq("p0")).toBe(0);
  });

  it("stores the RTT per player", () => {
    const c = newController();
    c.setRtt("p1", 120);
    expect(c.rttMs("p1")).toBe(120);
    expect(c.rttMs("p0")).toBe(0);
  });
});
