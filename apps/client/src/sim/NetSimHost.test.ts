import { describe, expect, it } from "vitest";
import {
  BYTES,
  C2S,
  HORDE_MAX_FRAME_BYTES,
  ZOMBIE_STATE,
  hordeFrameBytes,
  packTypeState,
  writeHordeHeader,
  writeHordeRecord,
  zombieNetId,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  S2C,
  loadBalance,
  quantizeHeading,
  seqSpreadRoll,
  seqPelletRoll,
  pelletDirection,
  type PlayerInput,
  type SimEventsFlushed,
} from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { PREDICTION_HISTORY_SIZE } from "../net/netConfig";
import { MAX_CATCHUP_STEPS } from "./LocalSimHost";

const balance = loadBalance();
const FRAME_60HZ = 1 / 60;

function setup(players = [fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 })]) {
  const room = new FakeRoom(fakeState(players));
  let now = 0;
  let leaves = 0;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => leaves++);
  const host = new NetSimHost({ balance, session, now: () => now });
  return {
    room,
    host,
    setNow: (ms: number) => (now = ms),
    leaves: () => leaves,
    /** Server tick `tick` arrives now. */
    arrive(tick: number, update: (s: FakeRoom["state"]) => void = () => {}) {
      room.state.tick = tick;
      update(room.state);
      room.patch();
    },
  };
}

const inputs = (room: FakeRoom) => room.sentOf(C2S.INPUT_SEND) as PlayerInput[];

describe("NetSimHost", () => {
  it("Story 4.4: runSeed is the server's (room state), the mirror World never draws a seed of its own", () => {
    const t = setup();
    expect(t.host.runSeed).toBe(0);
    t.arrive(1, (s) => (s.runSeed = 3000000001));
    expect(t.host.runSeed).toBe(3000000001);
    expect(t.host.world.seed).toBe(0);
  });

  it("is online and controls the player from run.joined", () => {
    const { host } = setup();
    expect(host.online).toBe(true);
    expect(host.localPlayerId).toBe("p1");
    expect(host.alpha).toBe(0);
  });

  it("sends one input per 50 ms step with increasing seq", () => {
    const { host, room } = setup();
    host.setLocalInput({ ...NEUTRAL_INPUT, moveX: 1, aimY: -1, fire: true });
    for (let i = 0; i < 60; i++) host.update(FRAME_60HZ);
    host.update(1e-9);
    const sent = inputs(room);
    expect(sent).toHaveLength(20);
    expect(sent.map((s) => s.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(sent[0]).toMatchObject({ moveX: 1, aimY: -1, fire: true, swap: false });
    expect(host.predictor.stats.unackedInputs).toBe(20); // kept for replay until acked
  });

  it("each input carries the tick the horde is drawn at (Story 2.12 view tick), -1 before the first snapshot", () => {
    const { host, room, arrive, setNow } = setup();
    setNow(0);
    host.update(0.05);
    expect(inputs(room).at(-1)?.viewTick).toBe(-1);
    setNow(1000);
    arrive(10);
    setNow(1050);
    arrive(11);
    setNow(500 + (10.5 + RENDER_DELAY_TICKS) * 50 + 3.3);
    host.update(0.05);
    expect(host.renderTick).toBeGreaterThan(10);
    expect(inputs(room).at(-1)?.viewTick).toBe(Math.round(host.renderTick * 100));
  });

  it("a swap tap reaches exactly one sent input", () => {
    const { host, room } = setup();
    host.setLocalInput({ ...NEUTRAL_INPUT, swap: true });
    host.setLocalInput({ ...NEUTRAL_INPUT }); // released before the step
    host.update(0.01); // no step yet: the tap stays latched
    for (let i = 0; i < 10; i++) host.update(0.05);
    const swaps = inputs(room).filter((s) => s.swap);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]?.seq).toBe(1);
  });

  it("never bursts after a hidden tab: at most 5 steps, the rest dropped", () => {
    const { host, room } = setup();
    host.update(10);
    expect(inputs(room)).toHaveLength(MAX_CATCHUP_STEPS);
    host.update(FRAME_60HZ);
    expect(inputs(room).length).toBeLessThanOrEqual(MAX_CATCHUP_STEPS + 1);
  });

  it("Story 8.9 (D5): steps at 0.9× while the server reports my queue over its target 3 patches in a row, 1× at the target", () => {
    const { host, room, arrive } = setup();
    const run = (queued: number): number => {
      const before = inputs(room).length;
      for (let i = 0; i < 3; i++) arrive(room.state.tick + 1, (s) => Object.assign(s.players.get("p1") ?? {}, { inputQueued: queued }));
      for (let i = 0; i < 600; i++) host.update(FRAME_60HZ); // 10 s
      return inputs(room).length - before;
    };
    const slowed = run(4);
    expect(slowed).toBeGreaterThanOrEqual(179); // 0.9 × 200 (float accumulator)
    expect(slowed).toBeLessThanOrEqual(180);
    expect(host.netStats.queued).toBe(4);
    expect(run(2)).toBe(200);
    expect(run(0)).toBe(200); // starved: never faster than 1×
  });

  it("Story 8.9: a hidden tab while slowed still never bursts (at most 5 steps, the rest dropped)", () => {
    const { host, room, arrive } = setup();
    for (let i = 0; i < 3; i++) arrive(i + 1, (s) => Object.assign(s.players.get("p1") ?? {}, { inputQueued: 5 }));
    host.update(10);
    expect(inputs(room)).toHaveLength(MAX_CATCHUP_STEPS);
    host.update(FRAME_60HZ);
    expect(inputs(room).length).toBeLessThanOrEqual(MAX_CATCHUP_STEPS + 1);
  });

  it("keeps the last 64 unacknowledged inputs", () => {
    const { host } = setup();
    for (let i = 0; i < 100; i++) host.update(0.05);
    expect(host.sentSeq).toBe(100);
    expect(host.predictor.stats.unackedInputs).toBe(PREDICTION_HISTORY_SIZE);
  });

  it("draws a player at the midpoint halfway between ticks 10 and 11", () => {
    const { host, arrive, setNow } = setup();
    setNow(1000);
    arrive(10, (s) => Object.assign(s.players.get("p0") ?? {}, { x: 10, y: 4, heading: quantizeHeading(0, 1) }));
    setNow(1050);
    arrive(11, (s) => Object.assign(s.players.get("p0") ?? {}, { x: 11, y: 6 }));
    // Clock: offset = 1000 − 10 × 50 = 500 ms. Render tick 10.5 at estimate 12.5 → now = 500 + 625.
    setNow(500 + (10.5 + RENDER_DELAY_TICKS) * 50);
    host.update(0);
    expect(host.renderTick).toBeCloseTo(10.5, 9);
    const p0 = host.world.players.get("p0");
    expect(p0?.x).toBeCloseTo(10.5, 9);
    expect(p0?.y).toBeCloseTo(5, 9);
    expect(p0?.prevX).toBe(p0?.x);
    expect(p0?.facingY).toBeCloseTo(1, 9); // heading 64 = +y in both snapshots
  });

  it("takes HP, status, loadout and waves from the latest state", () => {
    const { host, arrive, setNow } = setup();
    setNow(1000);
    arrive(1, (s) => {
      Object.assign(s.players.get("p1") ?? {}, {
        hp: 40,
        status: "alive",
        weapon0: "smg",
        weapon1: "machete",
        ammo0: 17,
        reloadTicks0: 3,
        active: 1,
        swapTicks: 2,
      });
      s.wave = 3;
      s.remaining = 9;
    });
    host.update(0);
    const p1 = host.world.players.get("p1");
    expect(p1?.hp).toBe(40);
    expect(p1?.loadout.slots[0]).toMatchObject({ weapon: "smg", ammo: 17, reloadTicks: 3 });
    expect(p1?.loadout.slots[1]?.weapon).toBe("machete");
    expect(p1?.loadout.active).toBe(1);
    expect(p1?.loadout.swapTicks).toBe(2);
    expect(host.world.waves.number).toBe(3);
    expect(host.world.waves.remaining).toBe(9);
    expect(host.world.zombies.aliveCount).toBe(0); // the horde stream is Story 2.5
  });

  it("adds and removes mirror players as the state's players change", () => {
    const { host, room, arrive } = setup();
    host.update(0);
    expect([...host.world.players.keys()].sort()).toEqual(["p0", "p1"]);
    room.state.players.delete("p0");
    room.state.players.set("p3", fakePlayer(3, { x: 30, y: 3 }));
    arrive(5);
    host.update(0);
    expect([...host.world.players.keys()].sort()).toEqual(["p1", "p3"]);
    expect(host.world.players.get("p3")?.x).toBe(30);
  });

  it("does not drain events for tick 12 while the render tick is 11", () => {
    const { host, room, arrive, setNow } = setup();
    setNow(1000);
    arrive(10);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 11, events: [[NET_EVENT_KIND.WAVE_STARTED, 1, 8]] } satisfies SimEventsFlushed);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, {
      tick: 12,
      events: [
        [NET_EVENT_KIND.WEAPON_FIRED, 0, 0, 1000, 500, 0],
        [NET_EVENT_KIND.WAVE_ENDED, 1],
      ],
    } satisfies SimEventsFlushed);
    setNow(500 + (11 + RENDER_DELAY_TICKS) * 50); // render tick 11
    host.update(0);
    expect(host.drainEvents()).toEqual([{ type: "wave.started", number: 1, size: 8 }]);
    expect(host.drainEvents()).toEqual([]);
    setNow(500 + (12 + RENDER_DELAY_TICKS) * 50);
    host.update(0);
    const later = host.drainEvents();
    expect(later.map((e) => e.type)).toEqual(["weapon.fired", "wave.ended"]);
    expect(later[0]).toMatchObject({ playerId: "p0", weapon: "pistol", x: 10, y: 5 });
  });

  it("events that came before the host was built (hidden tab at Start) still play", () => {
    const room = new FakeRoom(fakeState([fakePlayer(1, { x: 20, y: 10 })]));
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 1, events: [[NET_EVENT_KIND.WAVE_STARTED, 1, 8]] } satisfies SimEventsFlushed);
    let now = 0;
    const host = new NetSimHost({ balance, session, now: () => now });
    now = 5000;
    room.state.tick = 100;
    room.patch();
    host.update(0);
    expect(host.drainEvents()).toEqual([{ type: "wave.started", number: 1, size: 8 }]);
  });

  it("answers net.pinged with net.pong at once and keeps the RTT", () => {
    const { host, room } = setup();
    room.deliver(S2C.NET_PINGED, { id: 7, rttMs: 83 });
    expect(room.sentOf(C2S.NET_PONG)).toEqual([{ id: 7 }]);
    expect(host.rttMs).toBe(83);
  });

  it("dispose stops listening and leaves the room once", () => {
    const { host, room, leaves } = setup();
    host.dispose();
    host.dispose();
    expect(leaves()).toBe(1);
    expect(room.stateListeners.size).toBe(0);
    expect([...room.handlers.values()].every((l) => l.length === 0)).toBe(true);
    host.update(1);
    expect(inputs(room)).toHaveLength(0);
  });

  describe("horde stream (Story 2.5)", () => {
    const scratch = new Uint8Array(HORDE_MAX_FRAME_BYTES);
    const view = new DataView(scratch.buffer);
    const frame = (tick: number, zs: { netId: number; x: number; y: number; heading?: number }[]): Uint8Array => {
      writeHordeHeader(view, tick, zs.length);
      zs.forEach((z, i) => writeHordeRecord(view, i, z.netId, z.x, z.y, z.heading ?? 0, packTypeState(0, ZOMBIE_STATE.CHASE)));
      // The SDK hands a subarray of a larger receive buffer.
      const wire = new Uint8Array(hordeFrameBytes(zs.length) + 3);
      wire.set(scratch.subarray(0, hordeFrameBytes(zs.length)), 3);
      return wire.subarray(3);
    };
    const Z = zombieNetId(9, 2);

    it("samples zombies at the players' render tick into the mirror pool", () => {
      const { host, room, arrive, setNow } = setup();
      for (let t = 10; t <= 12; t++) {
        setNow(500 + t * 50);
        room.deliver(BYTES.HORDE_FRAME, frame(t, [{ netId: Z, x: t, y: 5, heading: 64 }]));
        arrive(t);
      }
      setNow(500 + (10.5 + RENDER_DELAY_TICKS) * 50);
      host.update(0);
      const z = host.world.zombies;
      expect(z.aliveCount).toBe(1);
      expect(z.aliveIds[0]).toBe(9);
      expect(z.x[9]).toBeCloseTo(10.5, 5);
      expect(z.prevX[9]).toBe(z.x[9]);
      expect(z.generation[9]).toBe(2);
      expect(z.heading[9]).toBe(64);
      expect(host.hordeStats.framesReceived).toBe(3);
      room.deliver(BYTES.HORDE_FRAME, new Uint8Array(7));
      expect(host.hordeStats.decodeErrors).toBe(1);
    });

    it("a zombie.killed hides the zombie in the same frame its death event drains", () => {
      const { host, room, arrive, setNow } = setup();
      for (let t = 10; t <= 13; t++) {
        setNow(500 + t * 50);
        room.deliver(BYTES.HORDE_FRAME, frame(t, t < 12 ? [{ netId: Z, x: 3, y: 3 }] : []));
        if (t === 12) {
          room.deliver(S2C.SIM_EVENTS_FLUSHED, {
            tick: 12,
            events: [[NET_EVENT_KIND.ZOMBIE_KILLED, Z, 0, 300, 300, 0]],
          } satisfies SimEventsFlushed);
        }
        arrive(t);
      }
      setNow(500 + (11.5 + RENDER_DELAY_TICKS) * 50);
      host.update(0);
      expect(host.drainEvents()).toHaveLength(0);
      expect(host.world.zombies.aliveCount).toBe(1); // still drawn: the death is 0.5 tick ahead
      setNow(500 + (12 + RENDER_DELAY_TICKS) * 50);
      host.update(0);
      const events = host.drainEvents();
      expect(events.map((e) => e.type)).toEqual(["zombie.killed"]);
      expect(host.world.zombies.aliveCount).toBe(0);
      // A late frame still carrying that net id stays hidden.
      setNow(500 + 14 * 50);
      room.deliver(BYTES.HORDE_FRAME, frame(14, [{ netId: Z, x: 3, y: 3 }]));
      arrive(14);
      setNow(500 + (14 + RENDER_DELAY_TICKS) * 50);
      host.update(0);
      expect(host.world.zombies.aliveCount).toBe(0);
    });

    it("horde frames before the host exists are dropped quietly", () => {
      const room = new FakeRoom(fakeState([fakePlayer(1)]));
      const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
      room.deliver(BYTES.HORDE_FRAME, frame(1, [{ netId: Z, x: 1, y: 1 }]));
      expect(session.inbox.earlyHordeDropped).toBe(1);
      const host = new NetSimHost({ balance, session, now: () => 0 });
      room.deliver(BYTES.HORDE_FRAME, frame(2, [{ netId: Z, x: 1, y: 1 }]));
      expect(host.hordeStats.framesReceived).toBe(1);
    });
  });

  describe("Story 2.6: prediction and adaptive delay", () => {
    const STEP_M = balance.player.speedMps * 0.05;

    it("my survivor moves at once; others stay on the interpolated path", () => {
      const { host, arrive, setNow } = setup();
      setNow(1000);
      arrive(1); // p1 (me) at (20, 10), ack 0
      host.setLocalInput({ ...NEUTRAL_INPUT, moveX: 1, aimX: 0, aimY: 1 });
      host.update(0.05); // one step sent and predicted, alpha 0
      host.update(0.025); // half way into the next step
      const me = host.world.players.get("p1");
      expect(me?.x).toBeCloseTo(20 + STEP_M * 0.5, 9); // prev → predicted, like LocalSimHost
      expect(me?.prevX).toBe(me?.x);
      expect(me?.facingY).toBeCloseTo(1, 9); // aim applies at once
      expect(host.world.players.get("p0")?.x).toBe(10);
    });

    it("the streamed Crawler slow reaches my prediction (3.9 review: the wiring was untested)", () => {
      const { host, arrive, setNow } = setup();
      setNow(1000);
      arrive(1, (st) => Object.assign(st.players.get("p1") ?? {}, { slowTicks: 10, slowPct: 30 }));
      host.setLocalInput({ ...NEUTRAL_INPUT, moveX: 1 });
      host.update(0.05); // one predicted step, slowed
      expect(host.predictor.x).toBeCloseTo(20 + (STEP_M * 70) / 100, 6);
    });

    it("an exact server ack causes no correction; a skipped input is smoothed", () => {
      const { host, arrive, setNow } = setup();
      setNow(1000);
      arrive(1);
      host.setLocalInput({ ...NEUTRAL_INPUT, moveX: 1 });
      for (let i = 0; i < 3; i++) host.update(0.05);
      setNow(1050);
      arrive(2, (s) => Object.assign(s.players.get("p1") ?? {}, { ackSeq: 1, x: Math.fround(20 + STEP_M) }));
      expect(host.predictor.stats.corrections).toBe(0);
      // The server skipped seq 2 (backlog drain): ack 2, still at seq 1's position.
      setNow(1100);
      arrive(3, (s) => Object.assign(s.players.get("p1") ?? {}, { ackSeq: 2, x: Math.fround(20 + STEP_M) }));
      host.update(1e-6);
      expect(host.netStats.corrections).toBe(1);
      expect(host.netStats.snaps).toBe(0);
      expect(host.netStats.unackedInputs).toBe(1);
      expect(host.predictor.x).toBeCloseTo(20 + 2 * STEP_M, 5);
    });

    it("Story 8.9: the render delay covers measured lateness (patches + horde frames), within 100–250 ms", () => {
      const { host, arrive, setNow } = setup();
      expect(host.netStats.delayMs).toBe(0);
      for (let t = 1; t <= 200; t++) {
        setNow(1000 + t * 50 + (t % 4 === 0 ? 80 : 0)); // every 4th patch 80 ms late
        arrive(t);
        for (let f = 0; f < 3; f++) host.update(1 / 60);
      }
      expect(host.netStats.lateP95Ms).toBeGreaterThanOrEqual(80);
      expect(host.netStats.targetMs).toBeCloseTo(80 + 5 + 50, 0); // p95 bucket edge + one tick
      expect(host.netStats.delayMs).toBeGreaterThan(125);
      expect(host.netStats.delayMs).toBeLessThanOrEqual(250);
      expect(host.renderTick).toBeCloseTo(host.serverTick - host.netStats.delayMs / 50, 6);
      expect(host.renderTick).toBeLessThan(host.serverTick - RENDER_DELAY_TICKS);
    });

    it("lobby patches (late from a throttled room) are ignored", () => {
      const room = new FakeRoom(fakeState([fakePlayer(1, { x: 0, y: 0 })]));
      room.state.phase = "lobby";
      const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
      const host = new NetSimHost({ balance, session, now: () => 0 });
      room.patch();
      host.update(0);
      expect(host.predictor.ready).toBe(false);
      expect(host.world.players.size).toBe(0);
    });
  });

  describe("server-confirmed hits (Story 2.7)", () => {
    const fire = { ...NEUTRAL_INPUT, aimX: 1, aimY: 0, fire: true, isMouse: true };

    it("my shot plays at once from local input: weapon.fired first, and a cosmetic projectile", () => {
      const { host, arrive, setNow } = setup();
      setNow(1000);
      arrive(10);
      host.update(0);
      host.setLocalInput(fire);
      host.update(0.05); // one step
      const events = host.drainEvents();
      expect(events[0]).toMatchObject({ type: "weapon.fired", playerId: "p1", weapon: "pistol", dirX: expect.closeTo(1, 1) });
      const muzzle = 20 + balance.player.radiusM + 0.1;
      expect(events[0]).toMatchObject({ x: expect.closeTo(muzzle, 5), y: expect.closeTo(10, 5) });
      expect(host.world.projectiles.aliveCount).toBe(1);
      expect(host.drainEvents()).toHaveLength(0); // handed out exactly once
    });

    it("my cosmetic SMG shot flies in the seq's spread direction, the one the server gives that seq (Story 2.12 review M2)", () => {
      const { host, arrive, setNow } = setup([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10, weapon0: "smg", ammo0: 30 })]);
      setNow(1000);
      arrive(10);
      host.update(0);
      const smg = balance.weapons.smg;
      const half = ((smg?.kind === "gun" ? smg.spreadDeg : 0) / 2) * (Math.PI / 180);
      expect(half).toBeGreaterThan(0);
      host.setLocalInput(fire);
      let shots = 0;
      for (let i = 0; i < 12; i++) {
        host.update(0.05); // one step
        const fired = host.drainEvents().filter((e) => e.type === "weapon.fired");
        if (fired.length === 0) continue;
        const roll = seqSpreadRoll("p1", host.sentSeq); // independent of the shared helper
        expect(fired[0]).toMatchObject({ dirX: expect.closeTo(Math.cos(roll * half), 9), dirY: expect.closeTo(Math.sin(roll * half), 9) });
        shots++;
      }
      expect(shots).toBeGreaterThan(3);
    });

    it("Story 5.3: my local Shotgun shot keeps the centre aim and spawns the seq's 8-pellet fan (the server's)", () => {
      const { host, arrive, setNow } = setup([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10, weapon0: "shotgun", ammo0: 6 })]);
      setNow(1000);
      arrive(10);
      host.update(0);
      host.setLocalInput(fire);
      host.update(0.05); // one step
      const fired = host.drainEvents().filter((e) => e.type === "weapon.fired");
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({ weapon: "shotgun", dirX: expect.closeTo(1, 9), dirY: expect.closeTo(0, 9) }); // no single roll on the centre
      const pool = host.world.projectiles;
      expect(pool.aliveCount).toBe(8);
      const out = { x: 0, y: 0 };
      const want = Array.from({ length: 8 }, (_, k) => {
        pelletDirection(1, 0, 30, 8, k, seqPelletRoll("p1", host.sentSeq & 0xffff, k), out);
        return Math.atan2(out.y, out.x);
      }).sort((a, b) => a - b);
      const got = Array.from({ length: 8 }, (_, i) => Math.atan2(pool.dirY[pool.aliveIds[i] as number] as number, pool.dirX[pool.aliveIds[i] as number] as number)).sort((a, b) => a - b);
      got.forEach((a, k) => expect(a).toBeCloseTo(want[k] as number, 5));
    });

    it("drops my own server weapon.fired once predicted; others' shots wait for the render tick and fly cosmetically", () => {
      const { host, room, arrive, setNow } = setup();
      setNow(1000);
      arrive(10);
      host.update(0);
      host.setLocalInput(fire);
      host.update(0.05); // my local shot
      host.setLocalInput({ ...NEUTRAL_INPUT });
      host.drainEvents();
      host.cosmetics.clear();
      room.deliver(S2C.SIM_EVENTS_FLUSHED, {
        tick: 11,
        events: [
          [NET_EVENT_KIND.WEAPON_FIRED, 1, 0, 2050, 1000, 0], // mine, predicted
          [NET_EVENT_KIND.WEAPON_FIRED, 0, 0, 1050, 1000, 0], // p0's
          [NET_EVENT_KIND.MELEE_SWUNG, 1, 3, 2000, 1000, 0], // mine
        ],
      } satisfies SimEventsFlushed);
      setNow(500 + (11 + RENDER_DELAY_TICKS) * 50);
      host.update(0);
      const events = host.drainEvents();
      expect(events.map((e) => (e.type === "weapon.fired" ? e.playerId : e.type))).toEqual(["p0"]);
      expect(host.world.projectiles.aliveCount).toBe(1);
      expect(host.world.projectiles.owner[host.world.projectiles.aliveIds[0] as number]).toBe("p0");
    });

    it("safety net: my own server shot the fire clock did not predict is drawn (review MED-2)", () => {
      const { host, room, arrive, setNow } = setup();
      setNow(1000);
      arrive(10);
      room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 11, events: [[NET_EVENT_KIND.WEAPON_FIRED, 1, 0, 2050, 1000, 0]] } satisfies SimEventsFlushed);
      setNow(500 + (11 + RENDER_DELAY_TICKS) * 50);
      host.update(0);
      expect(host.drainEvents().map((e) => e.type)).toEqual(["weapon.fired"]);
      expect(host.world.projectiles.aliveCount).toBe(1);
    });

    it("delivers my own reload and swap events on arrival, others' at the render tick", () => {
      const { host, room, arrive, setNow } = setup();
      setNow(1000);
      arrive(10);
      room.deliver(S2C.SIM_EVENTS_FLUSHED, {
        tick: 20,
        events: [
          [NET_EVENT_KIND.WEAPON_RELOAD_STARTED, 1, 0, 1000],
          [NET_EVENT_KIND.WEAPON_SWAPPED, 1, 1, 1],
          [NET_EVENT_KIND.WEAPON_RELOAD_STARTED, 0, 0, 1000],
        ],
      } satisfies SimEventsFlushed);
      host.update(0); // render tick far below 20
      const events = host.drainEvents();
      expect(events.map((e) => e.type)).toEqual(["weapon.reload_started", "weapon.swapped"]);
      expect(events.every((e) => "playerId" in e && e.playerId === "p1")).toBe(true);
    });

    it("never removes or damages a mirror zombie on its own, and counts confirmations on arrival", () => {
      const { host, room, arrive, setNow } = setup();
      setNow(1000);
      arrive(10);
      host.update(0);
      // A server hit from me arrives first (low RTT); my bullet then reaches the drawn zombie.
      room.deliver(S2C.SIM_EVENTS_FLUSHED, {
        tick: 11,
        events: [[NET_EVENT_KIND.ZOMBIE_HIT, zombieNetId(4, 2), 100, 100, 0, 50, 0, 1]],
      } satisfies SimEventsFlushed);
      host.hits.apparent(zombieNetId(4, 2), 1010, 500);
      host.update(0);
      expect(host.netStats).toMatchObject({ apparentHits: 1, confirmed: 1, reversed: 0 });
    });

    it("my HUD ammo drops at once with a local shot, before the server acks it (review LOW-3)", () => {
      const { host, arrive, setNow } = setup();
      setNow(1000);
      arrive(10);
      host.update(0);
      expect(host.world.players.get("p1")?.loadout.slots[0].ammo).toBe(12);
      host.setLocalInput(fire);
      host.update(0.05);
      expect(host.world.players.get("p1")?.loadout.slots[0].ammo).toBe(11);
    });

    it("turning the counter back on starts clean: nothing pending from before counts as reversed (review LOW-2)", () => {
      let on = true;
      const room = new FakeRoom(fakeState([fakePlayer(1, { x: 20, y: 10 })]));
      const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
      let now = 0;
      const host = new NetSimHost({ balance, session, now: () => now, measureHits: () => on });
      host.update(0);
      host.hits.apparent(4, 0, 500);
      on = false;
      now = 100;
      host.update(0);
      on = true;
      now = 5000;
      host.update(0);
      expect(host.netStats).toMatchObject({ apparentHits: 0, reversed: 0 });
    });

    it("the reversed-hit counter is off when measureHits says so", () => {
      const room = new FakeRoom(fakeState([fakePlayer(1, { x: 20, y: 10 })]));
      const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
      const host = new NetSimHost({ balance, session, now: () => 0, measureHits: () => false });
      room.deliver(S2C.SIM_EVENTS_FLUSHED, {
        tick: 1,
        events: [[NET_EVENT_KIND.ZOMBIE_HIT, 4, 100, 100, 0, 50, 0, 1]],
      } satisfies SimEventsFlushed);
      host.hits.apparent(4, 0, 500); // what a bullet would record if it were on
      host.update(0);
      expect(host.netStats.confirmed).toBe(0);
    });
  });
});
