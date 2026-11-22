import { describe, expect, it } from "vitest";
import {
  C2S,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  S2C,
  loadBalance,
  quantizeHeading,
  type PlayerInput,
  type SimEventsFlushed,
} from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { INPUT_HISTORY_SIZE, NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
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
    expect(host.history[19]).toMatchObject({ seq: 20, moveX: 1 });
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

  it("keeps the last 64 inputs", () => {
    const { host } = setup();
    for (let i = 0; i < 100; i++) host.update(0.05);
    expect(host.sentSeq).toBe(100);
    const seqs = host.history.map((h) => h.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: INPUT_HISTORY_SIZE }, (_, i) => 100 - INPUT_HISTORY_SIZE + 1 + i));
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
});
