import { describe, expect, it } from "vitest";
import { C2S, NEUTRAL_INPUT, S2C, createRng, type RunStateView, type SimEventsFlushed } from "@topdown/shared";
import { DevThrottle } from "./devThrottle";
import { FakeRoom, fakePlayer, fakeState } from "./fakeRoom";
import { RunInbox } from "./session";
import { THROTTLE_QUEUE_SIZE } from "./netConfig";

function setup(lagMs = 150, jitterMs = 0, seed = 1) {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 1, y: 2 })]));
  let now = 0;
  const rng = createRng(seed);
  const throttle = new DevThrottle(room, { lagMs, jitterMs, random: () => rng.next(), now: () => now });
  return { room, throttle, setNow: (ms: number) => (now = ms) };
}

describe("DevThrottle", () => {
  it("holds outgoing sends half the lag, copied at send time", () => {
    const { room, throttle, setNow } = setup(150);
    const buf = { ...NEUTRAL_INPUT, seq: 1, moveX: 1 };
    throttle.send(C2S.INPUT_SEND, buf);
    buf.seq = 2; // the host reuses its buffer
    buf.moveX = -1;
    throttle.send(C2S.INPUT_SEND, buf);
    throttle.pump(74);
    expect(room.sentOf(C2S.INPUT_SEND)).toHaveLength(0);
    setNow(0);
    throttle.pump(75);
    expect(room.sentOf(C2S.INPUT_SEND)).toEqual([
      expect.objectContaining({ seq: 1, moveX: 1 }),
      expect.objectContaining({ seq: 2, moveX: -1 }),
    ]);
  });

  it("holds state patches: listeners and `state` see the delayed copy", () => {
    const { room, throttle, setNow } = setup(100);
    const seen: { tick: number; x: number }[] = [];
    throttle.onStateChange((s: RunStateView) => seen.push({ tick: s.tick, x: s.players.get("p0")?.x ?? -1 }));
    room.state.tick = 5;
    room.patch(); // at t = 0
    setNow(20);
    room.state.tick = 6;
    (room.state.players.get("p0") as { x: number }).x = 9;
    room.patch();
    throttle.pump(49);
    expect(seen).toEqual([]);
    throttle.pump(50);
    expect(seen).toEqual([{ tick: 5, x: 1 }]); // the copy, not the live state (x is 9 now)
    expect(throttle.state.tick).toBe(5);
    throttle.pump(70);
    expect(seen).toEqual([
      { tick: 5, x: 1 },
      { tick: 6, x: 9 },
    ]);
    expect(throttle.state.players.get("p0")?.hp).toBe(100);
  });

  it("copies removed and added players", () => {
    const { room, throttle } = setup(0);
    room.patch();
    throttle.pump(0);
    room.state.players.delete("p0");
    room.state.players.set("p2", fakePlayer(2));
    room.patch();
    throttle.pump(0);
    const ids: string[] = [];
    throttle.state.players.forEach((_p, id) => ids.push(id));
    expect(ids).toEqual(["p2"]);
  });

  it("keeps the order with jitter (TCP never reorders), within lag/2 ± jitter/2", () => {
    const { room, throttle, setNow } = setup(150, 40, 9);
    const got: number[] = [];
    const arrivals: number[] = [];
    let t = 0;
    throttle.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => {
      got.push(m.tick);
      arrivals.push(t);
    });
    for (let i = 0; i < 200; i++) {
      setNow(i * 50);
      room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: i, events: [] });
      for (let f = 0; f < 50; f++) throttle.pump((t = i * 50 + f));
    }
    for (let f = 0; f < 200; f++) throttle.pump((t = 10_000 + f));
    expect(got).toEqual(Array.from({ length: 200 }, (_, i) => i));
    for (let i = 0; i < 200; i++) {
      const delay = (arrivals[i] as number) - i * 50;
      expect(delay).toBeGreaterThanOrEqual(55 - 1);
      expect(delay).toBeLessThanOrEqual(95 + 1);
    }
    expect(new Set(arrivals.map((a, i) => a - i * 50)).size).toBeGreaterThan(5); // it does jitter
  });

  it("copies binary frames into pooled buffers", () => {
    const { room, throttle } = setup(10);
    const got: number[][] = [];
    throttle.onMessage(1, (b: Uint8Array) => got.push([...b]));
    const frame = new Uint8Array([1, 2, 3]);
    (room as unknown as { deliver(t: number, m: unknown): void }).deliver(1, frame);
    frame[0] = 99; // the SDK may reuse its buffer
    throttle.pump(10);
    expect(got).toEqual([[1, 2, 3]]);
  });

  it("a full queue delivers its oldest at once (a hidden tab stops the pump)", () => {
    const { room, throttle } = setup(1000);
    const got: number[] = [];
    throttle.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => got.push(m.tick));
    for (let i = 0; i < THROTTLE_QUEUE_SIZE + 3; i++) room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: i, events: [] });
    expect(got).toEqual([0, 1, 2]);
    expect(throttle.pending.incoming).toBe(THROTTLE_QUEUE_SIZE);
  });

  it("a RunInbox built on it answers pings a full round trip later", () => {
    const { room, throttle, setNow } = setup(150);
    const inbox = new RunInbox(throttle);
    room.deliver(S2C.NET_PINGED, { id: 3, rttMs: 0 }); // at t = 0
    throttle.pump(74);
    expect(room.sentOf(C2S.NET_PONG)).toEqual([]);
    setNow(75);
    throttle.pump(75); // the ping arrives; the pong leaves now
    expect(room.sentOf(C2S.NET_PONG)).toEqual([]);
    throttle.pump(150);
    expect(room.sentOf(C2S.NET_PONG)).toEqual([{ id: 3 }]);
    inbox.close();
  });

  it("close stops listening to the room", () => {
    const { room, throttle } = setup();
    throttle.onMessage(S2C.SIM_EVENTS_FLUSHED, () => {});
    throttle.close();
    expect(room.stateListeners.size).toBe(0);
    expect([...room.handlers.values()].every((l) => l.length === 0)).toBe(true);
  });
});
