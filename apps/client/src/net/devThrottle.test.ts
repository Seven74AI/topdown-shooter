import { describe, expect, it } from "vitest";
import { BYTES, C2S, INPUT_BYTES, NEUTRAL_INPUT, S2C, createRng, encodeInput, type PlayerInput, type RunStateView, type SimEventsFlushed } from "@topdown/shared";

/** Story 8.11: what NetSimHost sends (the binary input; `bytes` reused by the caller). */
const sendInput = (throttle: DevThrottle, input: PlayerInput, bytes = new Uint8Array(INPUT_BYTES)): void => {
  encodeInput(input, bytes);
  throttle.sendBytes(BYTES.INPUT, bytes);
};
import { DEFAULT_STALL_MS, DevThrottle, throttleLossText } from "./devThrottle";
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
  it("holds outgoing sends half the lag, copied at send time (Story 8.11: the input's bytes; a pong keeps its place)", () => {
    const { room, throttle, setNow } = setup(150);
    const bytes = new Uint8Array(INPUT_BYTES); // the host reuses its bytes
    sendInput(throttle, { ...NEUTRAL_INPUT, seq: 1, moveX: 1 }, bytes);
    throttle.send(C2S.NET_PONG, { id: 7 });
    sendInput(throttle, { ...NEUTRAL_INPUT, seq: 2, moveX: -1 }, bytes);
    throttle.pump(74);
    expect(room.inputsSent()).toHaveLength(0);
    expect(room.sentOf(C2S.NET_PONG)).toHaveLength(0);
    setNow(0);
    throttle.pump(75);
    expect(room.inputsSent()).toEqual([
      expect.objectContaining({ seq: 1, moveX: 1 }),
      expect.objectContaining({ seq: 2, moveX: -1 }),
    ]);
    expect(room.sentOf(C2S.NET_PONG)).toEqual([{ id: 7 }]);
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

  it("copies the build phase fields (Story 3.1): phase, build timer, Ready", () => {
    const { room, throttle } = setup(100);
    room.state.phase = "build";
    room.state.buildTicksLeft = 321;
    (room.state.players.get("p0") as { buildReady: boolean }).buildReady = true;
    room.patch();
    throttle.pump(50);
    expect(throttle.state.phase).toBe("build");
    expect(throttle.state.buildTicksLeft).toBe(321);
    expect(throttle.state.players.get("p0")?.buildReady).toBe(true);
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

/**
 * Story 8.8 (AC 1, T6): the lossy line. A scripted `random` decides which message is "lost": the
 * dueFrom draw comes first, the loss draw second (only when `lossPct` > 0).
 */
describe("DevThrottle: Story 8.8 lossy line (&loss, &stall)", () => {
  /** `random` returns the queued values in order, then 0.5 (no jitter offset, never a loss at ≤ 50 %). */
  function lossy(lossPct: number, stallMs?: number, lagMs = 100) {
    const room = new FakeRoom(fakeState([fakePlayer(0, { x: 1, y: 2 })]));
    let now = 0;
    const script: number[] = [];
    const throttle = new DevThrottle(room, { lagMs, jitterMs: 0, lossPct, ...(stallMs === undefined ? {} : { stallMs }), random: () => script.shift() ?? 0.5, now: () => now });
    return { room, throttle, script, setNow: (ms: number) => (now = ms) };
  }
  const ticks = (throttle: DevThrottle) => {
    const got: { tick: number; at: number }[] = [];
    let at = 0;
    throttle.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => got.push({ tick: m.tick, at }));
    return { got, pumpTo: (from: number, to: number) => { for (at = from; at <= to; at++) throttle.pump(at); } };
  };

  it("a stalled incoming message waits the extra 200 ms, and every message behind it waits too, in order", () => {
    const { room, throttle, script, setNow } = lossy(1);
    const { got, pumpTo } = ticks(throttle);
    setNow(0);
    script.push(0.5, 0.001); // message 0: due draw, then a loss draw under 1 %
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 0, events: [] });
    for (let i = 1; i < 6; i++) {
      setNow(i * 50);
      room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: i, events: [] }); // not lost (0.5 × 100 ≥ 1)
    }
    pumpTo(0, 1000);
    expect(got.map((g) => g.tick)).toEqual([0, 1, 2, 3, 4, 5]); // never a reorder, never a drop
    expect(got[0]?.at).toBe(50 + DEFAULT_STALL_MS); // one-way 50 + the stall
    // Head-of-line: 1..4 were due at 100..250 but wait behind message 0 (250); 5 is due at 300.
    expect(got.slice(1, 5).every((g) => g.at === 250)).toBe(true);
    expect(got[5]?.at).toBe(300);
    expect(throttle.stallsIn).toBe(1);
    expect(throttle.stallsOut).toBe(0);
  });

  it("outgoing inputs stall the same way (both directions), with &stall=400", () => {
    const { room, throttle, script } = lossy(5, 400);
    script.push(0.5, 0.01); // the first input is lost
    sendInput(throttle, { ...NEUTRAL_INPUT, seq: 1 });
    sendInput(throttle, { ...NEUTRAL_INPUT, seq: 2 });
    throttle.pump(449);
    expect(room.inputsSent()).toEqual([]);
    throttle.pump(450);
    expect(room.inputsSent().map((m) => m.seq)).toEqual([1, 2]);
    expect(throttle.stallsOut).toBe(1);
    expect(throttle.stallsIn).toBe(0);
  });

  it("a full queue still delivers its oldest at once while stalled (hidden tab)", () => {
    const { room, throttle, script } = lossy(20, 1000, 1000);
    const got: number[] = [];
    throttle.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => got.push(m.tick));
    for (let i = 0; i < THROTTLE_QUEUE_SIZE + 3; i++) {
      script.push(0.5, 0); // every message lost
      room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: i, events: [] });
    }
    expect(got).toEqual([0, 1, 2]); // the oldest, early, in order (nothing is pumped)
    expect(throttle.pending.incoming).toBe(THROTTLE_QUEUE_SIZE);
    expect(throttle.stallsIn).toBe(THROTTLE_QUEUE_SIZE + 3);
  });

  it("loss 0 is the Story 2.6 throttle bit for bit: same arrivals, same random draws", () => {
    const run = (opts: { lossPct?: number }) => {
      const room = new FakeRoom(fakeState([fakePlayer(0, { x: 1, y: 2 })]));
      let now = 0;
      let draws = 0;
      const rng = createRng(4);
      const throttle = new DevThrottle(room, { lagMs: 150, jitterMs: 20, ...opts, random: () => (draws++, rng.next()), now: () => now });
      const arrivals: number[] = [];
      let t = 0;
      throttle.onMessage(S2C.SIM_EVENTS_FLUSHED, () => arrivals.push(t));
      for (let i = 0; i < 100; i++) {
        now = i * 50;
        room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: i, events: [] });
        sendInput(throttle, { ...NEUTRAL_INPUT, seq: i + 1 });
        for (let f = 0; f < 50; f++) throttle.pump((t = i * 50 + f));
      }
      return { arrivals, draws, stalls: throttle.stallsIn + throttle.stallsOut };
    };
    const before = run({});
    expect(run({ lossPct: 0 })).toEqual(before);
    expect(before.draws).toBe(200); // one draw per message: no loss draw
    const lossyRun = run({ lossPct: 20 });
    expect(lossyRun.stalls).toBeGreaterThan(0); // liveness: the switch does stall
    expect(lossyRun.draws).toBe(400);
  });

  it("the overlay suffix shows the line and counts the stalls; nothing when off", () => {
    expect(throttleLossText(null)).toBe("");
    expect(throttleLossText({ lossPct: 0, stallMs: 200, stallsIn: 0, stallsOut: 0 })).toBe("");
    expect(throttleLossText({ lossPct: 1, stallMs: 200, stallsIn: 3, stallsOut: 2 })).toBe(" · loss 1 % × 200 (stalls ↓3 ↑2)");
    expect(throttleLossText({ lossPct: 0.5, stallMs: 400, stallsIn: 0, stallsOut: 0 })).toBe(" · loss 0.5 % × 400 (stalls ↓0 ↑0)");
  });
});
