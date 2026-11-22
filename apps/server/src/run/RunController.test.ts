import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  TICK_DT_S,
  addPlayer,
  killZombie,
  createWorld,
  loadBalance,
  setInput,
  setLoadout,
  setZombieHistoryEnabled,
  seqSpreadRoll,
  snapshotWorld,
  spawnZombie,
  startBuild,
  step,
  teamSpawnPoint,
  type PlayerInput,
  type SimEvent,
} from "@topdown/shared";
import { INPUT_SEQ_RESYNC_AFTER, MAX_INPUT_SEQ_JUMP } from "../net/limits";
import { INPUT_DRAIN_AFTER_TICKS, INPUT_QUEUE_MAX, INPUT_QUEUE_TARGET, REWIND_CAP_TICKS, RunController, parseDevHpFraction } from "./RunController";

const balance = loadBalance();
const SEED = 1234;
const TWO = [
  { playerId: "p0", slot: 0 },
  { playerId: "p1", slot: 1 },
];

const input = (seq: number, over: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq, ...over });

/** Weapon ticks owed to p0 as if it had just been starved `n` ticks (review MED-A: drops are dry ticks only against this). */
const owe = (c: RunController, n: number, playerId = "p0") => {
  ((c as unknown as { slots: Map<string, { weaponDebt: number }> }).slots.get(playerId) as { weaponDebt: number }).weaponDebt = n;
};

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
    setZombieHistoryEnabled(ref, true); // Story 2.12: the controller's lag compensation, set up the same way
    const at = { x: 0, y: 0 };
    for (const { playerId, slot } of TWO) {
      teamSpawnPoint(ref, slot, at);
      addPlayer(ref, playerId, at.x, at.y).rewindMaxTicks = REWIND_CAP_TICKS;
    }
    startBuild(ref); // Story 3.1: a controller starts in its first build phase
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

  it("an overflow keeps the dropped input's swap (at its own seq) and consumable flags", () => {
    const c = newController();
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no p0");
    setLoadout(balance, p.loadout, ["pistol", "smg"]);
    owe(c, 2); // the burst follows a stall (as in play)
    c.queueInput("p0", input(1, { swap: true }));
    c.queueInput("p0", input(2, { consumable: true }));
    for (let seq = 3; seq <= INPUT_QUEUE_MAX + 2; seq++) c.queueInput("p0", input(seq));
    expect(c.drops("p0").overflow).toBe(2);
    const events = c.tick().map((e) => e.type);
    expect(c.ackSeq("p0")).toBe(3);
    // Story 2.7 review: seq 1's swap ran in its own weapon tick; seqs 1–3 are 3 swap ticks.
    expect(events).toContain("weapon.swap_started");
    expect(p.loadout.swapTicks).toBe(Math.round(balance.player.swapS / TICK_DT_S) - 2);
    expect(c.world.inputs.get("p0")).toMatchObject({ seq: 3, swap: false, consumable: true });
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
    expect(c.drops("p0")).toEqual({ overflow: 1, stale: 0, drained: 4, jumped: 0 });
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

  it("dropped inputs keep the weapon timing of their seqs: swaps, shots and reloads as if applied, minus their shots", () => {
    // Reference: every seq applied. Test: seqs 1–2 dropped by overflow. Both fire nothing on
    // seqs 1–2 (the test's inputs don't fire there), so the weapon events must be identical.
    const run = (drop: boolean) => {
      const c = newController();
      const p = c.world.players.get("p0");
      if (!p) throw new Error("no p0");
      setLoadout(balance, p.loadout, ["pistol", "smg"]);
      const types: string[] = [];
      const inp = (seq: number) => input(seq, { swap: seq === 1 || seq === 9, fire: seq > 2, aimX: 1 });
      if (drop) {
        owe(c, 2); // the burst follows a stall (as in play)
        for (let seq = 1; seq <= INPUT_QUEUE_MAX + 2; seq++) c.queueInput("p0", inp(seq));
      }
      for (let seq = drop ? INPUT_QUEUE_MAX + 3 : 1; seq <= 60; seq++) {
        c.queueInput("p0", inp(seq));
        for (const e of c.tick()) if (e.type.startsWith("weapon.") && e.type !== "weapon.fired") types.push(e.type);
      }
      for (let i = 0; i < 8; i++) for (const e of c.tick()) if (e.type.startsWith("weapon.") && e.type !== "weapon.fired") types.push(e.type);
      return { types, active: p.loadout.active, ack: c.ackSeq("p0") };
    };
    const ref = run(false);
    const got = run(true);
    expect(got.ack).toBe(60);
    expect(got.types).toEqual(ref.types);
    expect(got.active).toBe(ref.active);
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
    expect(c.drops("p0")).toEqual({ overflow: 0, stale: 0, drained: 0, jumped: 0 });
  });

  it("a swap followed by starved ticks swaps once, and only finishes as new seqs arrive", () => {
    const c = newController();
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no p0");
    setLoadout(balance, p.loadout, ["pistol", "smg"]);
    const events: SimEvent["type"][] = [];
    c.queueInput("p0", input(1, { swap: true }));
    for (let i = 0; i < 24; i++) for (const e of c.tick()) if (e.type.startsWith("weapon.swap")) events.push(e.type);
    expect(events).toEqual(["weapon.swap_started"]); // starved: the weapon waits (Story 2.7 review)
    const n = Math.round(balance.player.swapS / TICK_DT_S);
    for (let seq = 2; seq <= n + 1; seq++) {
      c.queueInput("p0", input(seq));
      for (const e of c.tick()) if (e.type.startsWith("weapon.swap")) events.push(e.type);
    }
    expect(events).toEqual(["weapon.swap_started", "weapon.swapped"]);
    expect(p.loadout.active).toBe(1);
  });

  it("a dropped input that fires spends its round and cooldown but nothing flies (dry shot, review MED-2)", () => {
    const c = newController();
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no p0");
    owe(c, 1);
    for (let seq = 1; seq <= INPUT_QUEUE_MAX + 1; seq++) c.queueInput("p0", input(seq, { fire: seq === 1, aimX: 1 })); // drops seq 1
    const events = c.tick().map((e) => e.type);
    expect(events).not.toContain("weapon.fired");
    expect(c.world.projectiles.aliveCount).toBe(0);
    expect(p.loadout.slots[0].ammo).toBe(11);
    expect(p.loadout.slots[0].cooldownS).toBeGreaterThan(0);
  });

  it("a burst with no stall before it never shortens a reload (re-review MED-A)", () => {
    const c = newController();
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no p0");
    const slot = p.loadout.slots[0];
    if (!slot) throw new Error("no pistol");
    slot.ammo = 1;
    c.queueInput("p0", input(1, { fire: true, aimX: 1 }));
    c.tick(); // last round: the reload starts
    const reload = slot.reloadTicks;
    expect(reload).toBeGreaterThan(5);
    for (let seq = 2; seq <= 26; seq++) c.queueInput("p0", input(seq)); // 25 inputs at once
    c.tick();
    expect(slot.reloadTicks).toBe(reload - 1); // one real tick, no dry ticks for the flood
    expect(c.drops("p0").overflow).toBeGreaterThan(0);
  });

  it("25 inputs/s fire no more shots than 20/s over 10 s (re-review MED-A)", () => {
    const shots = (perTick: (t: number) => number) => {
      const c = newController();
      const p = c.world.players.get("p0");
      if (!p) throw new Error("no p0");
      setLoadout(balance, p.loadout, ["smg", null]);
      let seq = 0;
      let fired = 0;
      for (let t = 0; t < 200; t++) {
        for (let k = 0; k < perTick(t); k++) c.queueInput("p0", input(++seq, { fire: true, aimX: 1 }));
        for (const e of c.tick()) if (e.type === "weapon.fired") fired++;
      }
      return fired;
    };
    const honest = shots(() => 1);
    const flood = shots((t) => (t % 4 === 3 ? 2 : 1)); // 25 per 20 ticks
    expect(flood).toBeLessThanOrEqual(honest);
  });

  it("starved ticks owe weapon ticks, one per tick after the first input", () => {
    const c = newController();
    c.queueInput("p0", input(1));
    c.tick();
    for (let i = 0; i < 6; i++) c.tick(); // starved: 6 weapon ticks owed
    const debt = (c as unknown as { slots: Map<string, { weaponDebt: number }> }).slots.get("p0")?.weaponDebt;
    expect(debt).toBe(6);
  });

  it("a starved tick never fires: shots happen only on applied seqs (Story 2.7 review)", () => {
    const c = newController();
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no p0");
    setLoadout(balance, p.loadout, ["smg", null]);
    const firedAt: number[] = [];
    for (let seq = 1; seq <= 20; seq++) {
      c.queueInput("p0", input(seq, { fire: true, aimX: 1 }));
      for (const e of c.tick()) if (e.type === "weapon.fired") firedAt.push(c.ackSeq("p0"));
      if (seq === 10) for (let i = 0; i < 6; i++) for (const e of c.tick()) if (e.type === "weapon.fired") firedAt.push(-1);
    }
    expect(firedAt).not.toContain(-1);
    expect(new Set(firedAt).size).toBe(firedAt.length); // at most one shot per seq
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

  it("lag compensation is on by default: history recorded, rewind capped at 300 ms; off: neither (Story 2.12)", () => {
    const on = newController();
    expect(REWIND_CAP_TICKS).toBe(6);
    expect(on.world.zombieHistory.enabled).toBe(true);
    for (const p of on.world.players.values()) expect(p.rewindMaxTicks).toBe(REWIND_CAP_TICKS);
    const off = new RunController({ balance, seed: SEED, players: TWO, pauseWaves: true, lagCompensation: false });
    expect(off.world.zombieHistory.enabled).toBe(false);
    for (const p of off.world.players.values()) expect(p.rewindMaxTicks).toBe(0);
  });

  it("a queued input's shot is tested at its view tick: hits where the zombie was, not where it is (Story 2.12)", () => {
    const shoot = (lagCompensation: boolean): number => {
      const c = new RunController({ balance, seed: SEED, players: [{ playerId: "p0", slot: 0 }], systems: { waves: () => {}, zombies: () => {} }, lagCompensation });
      const p = c.world.players.get("p0");
      if (!p) throw new Error("no p0");
      setLoadout(balance, p.loadout, ["hunting_rifle", null]);
      c.setRtt("p0", 150);
      const z = c.world.zombies;
      const zid = spawnZombie(c.world, "walker", p.x + 3, p.y);
      let seq = 0;
      for (let t = 0; t < 4; t++) {
        c.queueInput("p0", input(++seq));
        c.tick();
      }
      z.y[zid] = (z.y[zid] as number) + 2; // it moved away after the tick the client drew (2)
      let hits = 0;
      c.queueInput("p0", input(seq + 1, { aimX: 1, aimY: 0, fire: true, isMouse: true, viewTick: 200 }));
      for (let t = 0; t < 4; t++) for (const e of c.tick()) if (e.type === "zombie.hit" && e.zombieId === zid) hits++;
      return hits;
    };
    expect(shoot(true)).toBe(1);
    expect(shoot(false)).toBe(0);
  });

  it("refuses an input more than 20 seqs ahead (seqs can't be picked), resyncing after a second of jumps (Story 2.12 review M1)", () => {
    const c = newController();
    for (let seq = 1; seq <= 5; seq++) c.queueInput("p0", input(seq));
    c.queueInput("p0", input(5 + MAX_INPUT_SEQ_JUMP + 1)); // a picked seq
    expect(c.drops("p0").jumped).toBe(1);
    expect(c.queued("p0")).toBe(5);
    c.queueInput("p0", input(5 + MAX_INPUT_SEQ_JUMP)); // within the window: fine
    expect(c.queued("p0")).toBe(6);
    // A client that really jumped (sends on from far ahead) is accepted after INPUT_SEQ_RESYNC_AFTER refusals.
    const far = 1000;
    for (let k = 0; k < INPUT_SEQ_RESYNC_AFTER; k++) c.queueInput("p0", input(far + k));
    expect(c.drops("p0").jumped).toBe(1 + INPUT_SEQ_RESYNC_AFTER);
    c.queueInput("p0", input(far + INPUT_SEQ_RESYNC_AFTER));
    expect(c.drops("p0").jumped).toBe(1 + INPUT_SEQ_RESYNC_AFTER);
  });

  it("reports a spread-cancelling aim once per wave through onSpreadCancelSuspect; an honest jittery aim never (Story 2.12 review M1)", () => {
    const run = (cheat: boolean): number => {
      let reports = 0;
      const c = new RunController({ balance, seed: SEED, players: [{ playerId: "p0", slot: 0 }], systems: { waves: () => {}, zombies: () => {} }, onSpreadCancelSuspect: () => reports++ });
      const p = c.world.players.get("p0");
      if (!p) throw new Error("no p0");
      setLoadout(balance, p.loadout, ["smg", null]);
      const smg = balance.weapons.smg;
      const half = ((smg?.kind === "gun" ? smg.spreadDeg : 0) / 2) * (Math.PI / 180);
      let jitter = 12345;
      for (let seq = 1; seq <= 600; seq++) {
        jitter = (jitter * 1103515245 + 12345) & 0x7fffffff;
        const a = cheat ? 0.4 - seqSpreadRoll("p0", seq) * half : 0.4 + ((jitter / 0x7fffffff) * 6 - 3) * (Math.PI / 180);
        c.queueInput("p0", input(seq, { aimX: Math.cos(a), aimY: Math.sin(a), fire: true, isMouse: true }));
        c.tick();
      }
      return reports;
    };
    expect(run(true)).toBe(1);
    expect(run(false)).toBe(0);
  });

  it("counts kills per killer from zombie.killed (Story 2.8)", () => {
    const c = newController();
    const ids = [0, 1, 2].map((k) => spawnZombie(c.world, "walker", 5 + k, 5));
    c.tick();
    killZombie(c.world, ids[0] as number, "p0", "pistol");
    killZombie(c.world, ids[1] as number, "p1", "pistol");
    c.tick();
    killZombie(c.world, ids[2] as number, "p0", "pistol");
    c.tick();
    expect(c.kills("p0")).toBe(2);
    expect(c.kills("p1")).toBe(1);
    expect(c.kills("p9")).toBe(0);
  });

  it("ignores kills with no player killer (cheats)", () => {
    const c = newController();
    const id = spawnZombie(c.world, "walker", 5, 5);
    c.tick();
    killZombie(c.world, id, null, "cheat");
    c.tick();
    expect(c.kills("p0") + c.kills("p1")).toBe(0);
  });
});

describe("Story 3.7 dev switch DEV_PLACED_BUILDING_HP", () => {
  it("parses a share in (0, 1] only; placed buildings start at that share of their HP", () => {
    expect([parseDevHpFraction("0.5"), parseDevHpFraction("1"), parseDevHpFraction(" 0.25 ")]).toEqual([0.5, 1, 0.25]);
    expect([parseDevHpFraction(undefined), parseDevHpFraction(""), parseDevHpFraction("0"), parseDevHpFraction("1.5"), parseDevHpFraction("-1"), parseDevHpFraction("x")]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    const c = new RunController({ balance, seed: SEED, players: TWO, devPlacedHpFraction: 0.5 });
    const r = c.placeBuilding("p0", { type: "wood_barricade", gx: 3, gy: 3, rot: 0 });
    expect(r.ok && r.value.hp).toBe(100);
    const full = new RunController({ balance, seed: SEED, players: TWO });
    const f = full.placeBuilding("p0", { type: "wood_barricade", gx: 3, gy: 3, rot: 0 });
    expect(f.ok && f.value.hp).toBe(200);
  });
});
