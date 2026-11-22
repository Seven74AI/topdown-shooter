import { describe, expect, it } from "vitest";
import { C2S, NET_EVENT_KIND, S2C, type SimEventsFlushed } from "@topdown/shared";
import { EARLY_EVENT_BATCHES_MAX, NetSession, RunInbox } from "./session";
import { FakeRoom } from "./fakeRoom";

const joined = { playerId: "p1", slot: 1, tickRateHz: 20 };
const batch = (tick: number): SimEventsFlushed => ({ tick, events: [[NET_EVENT_KIND.WAVE_STARTED, 1, 8]] });

describe("NetSession (Story 2.4 review: events before the Game scene exists)", () => {
  it("buffers event batches until a listener attaches, then hands them over in order, then live", () => {
    const room = new FakeRoom();
    const session = new NetSession(room, joined, () => {});
    room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(1));
    room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(2));
    const got: number[] = [];
    session.onEvents((m) => got.push(m.tick));
    expect(got).toEqual([1, 2]);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(3));
    expect(got).toEqual([1, 2, 3]);
  });

  it("answers pings at once even before any listener, and keeps the RTT", () => {
    const room = new FakeRoom();
    const session = new NetSession(room, joined, () => {});
    room.deliver(S2C.NET_PINGED, { id: 3, rttMs: 140 });
    expect(room.sentOf(C2S.NET_PONG)).toEqual([{ id: 3 }]);
    expect(session.rttMs).toBe(140);
  });

  it("keeps at most EARLY_EVENT_BATCHES_MAX batches, dropping the oldest", () => {
    const room = new FakeRoom();
    const session = new NetSession(room, joined, () => {});
    for (let t = 1; t <= EARLY_EVENT_BATCHES_MAX + 5; t++) room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(t));
    const got: number[] = [];
    session.onEvents((m) => got.push(m.tick));
    expect(got).toHaveLength(EARLY_EVENT_BATCHES_MAX);
    expect(got[0]).toBe(6);
    expect(session.inbox.earlyDropped).toBe(5);
  });

  it("uses the inbox the lobby opened at join time, so batches from before the start are kept", () => {
    const room = new FakeRoom();
    const inbox = new RunInbox(room); // lobbyStore.attach
    room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(1)); // tick 1 can beat the start patch
    room.deliver(S2C.NET_PINGED, { id: 1, rttMs: 0 });
    const session = new NetSession(room, joined, () => {}, inbox);
    const got: number[] = [];
    session.onEvents((m) => got.push(m.tick));
    expect(got).toEqual([1]);
    expect(room.sentOf(C2S.NET_PONG)).toEqual([{ id: 1 }]);
    session.leave();
    expect([...room.handlers.values()].every((l) => l.length === 0)).toBe(true);
  });

  it("leave stops listening, once", () => {
    const room = new FakeRoom();
    let leaves = 0;
    const session = new NetSession(room, joined, () => leaves++);
    session.leave();
    session.leave();
    expect(leaves).toBe(1);
    expect([...room.handlers.values()].every((l) => l.length === 0)).toBe(true);
  });
});
