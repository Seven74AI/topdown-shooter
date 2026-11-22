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
import { INPUT_DRAIN_AFTER_TICKS, INPUT_QUEUE_MAX, INPUT_QUEUE_TARGET, RunController } from "./RunController";

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

  it("an overflow keeps the dropped input's swap and consumable flags", () => {
    const c = newController();
    c.queueInput("p0", input(1, { swap: true }));
    c.queueInput("p0", input(2, { consumable: true }));
    for (let seq = 3; seq <= INPUT_QUEUE_MAX + 2; seq++) c.queueInput("p0", input(seq));
    expect(c.drops("p0").overflow).toBe(2);
    c.tick();
    expect(c.ackSeq("p0")).toBe(3);
    expect(c.world.inputs.get("p0")).toMatchObject({ seq: 3, swap: true, consumable: true });
  });

  it("drains a backlog after a 300 ms stall back to the target within 3 s", () => {
    const c = newController();
    let seq = 0;
    const send = () => c.queueInput("p0", input(++seq, { moveX: 1 }));
    for (let i = 0; i < 20; i++) {
      send();
      c.tick();
    }
    expect(c.queued("p0")).toBe(0);
    // Stall: 6 ticks with nothing arriving, then the 6 held inputs land at once.
    for (let i = 0; i < 6; i++) c.tick();
    for (let i = 0; i < 6; i++) send();
    let settledAt = -1;
    for (let t = 0; t < 60; t++) {
      send();
      c.tick();
      if (settledAt < 0 && c.queued("p0") <= INPUT_QUEUE_TARGET) settledAt = t;
    }
    expect(settledAt).toBeGreaterThanOrEqual(INPUT_DRAIN_AFTER_TICKS - 1); // not before the window
    expect(settledAt).toBeLessThan(60);
    expect(c.queued("p0")).toBeLessThanOrEqual(INPUT_QUEUE_TARGET);
    expect(c.drops("p0")).toEqual({ overflow: 1, stale: 0, drained: 4 });
    // The lag is gone: the newest input is at most TARGET ticks from being applied.
    expect(seq - c.ackSeq("p0")).toBeLessThanOrEqual(INPUT_QUEUE_TARGET);
  });

  it("a drained input's swap still happens", () => {
    const c = newController();
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no p0");
    setLoadout(balance, p.loadout, ["pistol", "smg"]);
    // A backlog of 5, kept there by one new input per tick. Tick t applies seq t until the
    // drain starts on tick INPUT_DRAIN_AFTER_TICKS: it skips that seq, which carries the swap.
    const skipped = INPUT_DRAIN_AFTER_TICKS;
    let seq = 0;
    const send = () => {
      seq++;
      c.queueInput("p0", input(seq, { swap: seq === skipped }));
    };
    for (let i = 0; i < 5; i++) send();
    const swaps: SimEvent["type"][] = [];
    const acked: number[] = [];
    for (let i = 0; i < INPUT_DRAIN_AFTER_TICKS + 30; i++) {
      send();
      for (const e of c.tick()) if (e.type === "weapon.swap_started") swaps.push(e.type);
      acked.push(c.ackSeq("p0"));
    }
    expect(acked).not.toContain(skipped);
    expect(c.drops("p0").drained).toBeGreaterThan(0);
    expect(swaps).toEqual(["weapon.swap_started"]);
    expect(p.loadout.active).toBe(1);
  });

  it("two swaps on consecutive seqs stay two swaps when the first is dropped", () => {
    const c = newController();
    c.queueInput("p0", input(1, { swap: true }));
    c.queueInput("p0", input(2, { swap: true }));
    for (let seq = 3; seq <= INPUT_QUEUE_MAX + 1; seq++) c.queueInput("p0", input(seq)); // drops seq 1
    const swaps: boolean[] = [];
    for (let i = 0; i < INPUT_QUEUE_MAX; i++) {
      c.tick();
      swaps.push(c.world.inputs.get("p0")?.swap === true);
    }
    expect(swaps.filter(Boolean)).toHaveLength(2);
    expect(c.ackSeq("p0")).toBe(INPUT_QUEUE_MAX + 1);
  });

  it("4G-like jitter with a 150 ms spike every 3 s: no overflow, no extra starving, lag back to target (seeded)", () => {
    const c = newController();
    let rng = 42;
    const rand = () => (rng = (rng * 1103515245 + 12345) >>> 0) / 2 ** 32;
    // Each input is due 0–1 ticks late, plus up to 3 ticks late during a spike; order is kept,
    // so every spike lands as a burst that adds ~3 inputs of lasting lag the drain must remove.
    const TICKS = 2000;
    const SPIKE_EVERY = 60;
    const due: number[] = [];
    let lastDue = 0;
    for (let t = 0; t < TICKS; t++) {
      const spike = t % SPIKE_EVERY < 3 ? 3 - (t % SPIKE_EVERY) : 0;
      lastDue = Math.max(lastDue, t + (rand() < 0.5 ? 0 : 1) + spike);
      due.push(lastDue);
    }
    let seq = 0;
    let next = 0;
    let starved = 0;
    for (let t = 0; t < TICKS; t++) {
      while (next < due.length && (due[next] as number) <= t) {
        c.queueInput("p0", input(++seq));
        next++;
      }
      const before = c.ackSeq("p0");
      c.tick();
      if (seq > 0 && c.ackSeq("p0") === before) starved++;
    }
    const spikes = Math.ceil(TICKS / SPIKE_EVERY);
    expect(c.drops("p0").overflow).toBe(0);
    expect(starved).toBeLessThanOrEqual(spikes * 4); // the spike itself (≤ 3 ticks) + 1 of jitter
    expect(c.drops("p0").drained).toBeLessThanOrEqual(spikes * 3); // only the lag each spike added
    expect(c.queued("p0")).toBeLessThanOrEqual(INPUT_QUEUE_TARGET + 3);
  });

  it("normal jitter (inputs arriving in pairs) never triggers a drain", () => {
    const c = newController();
    let seq = 0;
    for (let i = 0; i < 200; i++) {
      if (i % 2 === 0) {
        c.queueInput("p0", input(++seq));
        c.queueInput("p0", input(++seq));
      }
      c.tick();
    }
    expect(c.drops("p0")).toEqual({ overflow: 0, stale: 0, drained: 0 });
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

  it("turns the RTT into half as shot advance, capped at 150 ms (Story 2.7)", () => {
    const c = newController();
    c.setRtt("p0", 120);
    expect(c.world.players.get("p0")?.shotAdvanceS).toBeCloseTo(0.06, 12);
    c.setRtt("p0", 400);
    expect(c.world.players.get("p0")?.shotAdvanceS).toBe(0.15);
    expect(c.world.players.get("p1")?.shotAdvanceS).toBe(0);
  });

  it("runs aim assist on server positions: touch 5° off a zombie hits, the same mouse aim misses (Story 2.7)", () => {
    const shoot = (isMouse: boolean): SimEvent[] => {
      const c = new RunController({
        balance,
        seed: SEED,
        players: [{ playerId: "p0", slot: 0 }],
        systems: { waves: () => {}, zombies: () => {} },
      });
      const p = c.world.players.get("p0");
      if (!p) throw new Error("no p0");
      setLoadout(balance, p.loadout, ["hunting_rifle", null]); // no spread: the aim alone decides
      const zid = spawnZombie(c.world, "walker", p.x + 8, p.y);
      const a = (5 * Math.PI) / 180;
      const events: SimEvent[] = [];
      c.queueInput("p0", input(1, { aimX: Math.cos(a), aimY: Math.sin(a), fire: true, isMouse }));
      for (let t = 0; t < 8; t++) events.push(...c.tick());
      expect(events.some((e) => e.type === "weapon.fired")).toBe(true);
      return events.filter((e) => e.type === "zombie.hit" && e.zombieId === zid);
    };
    expect(shoot(false)).toHaveLength(1);
    expect(shoot(false)[0]).toMatchObject({ sourceId: "p0" });
    expect(shoot(true)).toHaveLength(0);
  });
});
