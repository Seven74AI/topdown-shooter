import { describe, expect, it } from "vitest";
import { NET_EVENT_KIND, S2C, loadBalance, type RunPhase, type SimEventsFlushed } from "@topdown/shared";
import { createOnlinePhaseHandler, resultsFromState } from "./onlineFlow";
import { NetSession, RunInbox } from "./session";
import { FakeRoom, fakePlayer, fakeState } from "./fakeRoom";
import { NetSimHost } from "../sim/NetSimHost";
import type { UiScreen } from "../ui/uiState";

const joined = { playerId: "p1", slot: 1, tickRateHz: 20 };
const batch = (tick: number): SimEventsFlushed => ({ tick, events: [[NET_EVENT_KIND.WAVE_STARTED, tick, 8]] });

/** The main.ts wiring with fakes: one room, its inbox, the ui requests seen. */
function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(2, { name: "Cid", kills: 3 }), fakePlayer(0, { name: "Ana", kills: 7 })]));
  room.state.phase = "lobby";
  const inbox = new RunInbox(room);
  let roomLeaves = 0;
  const sessions: NetSession[] = [];
  const screens: UiScreen[] = [];
  const requests: { name: string; arg: unknown }[] = [];
  const onPhase = createOnlinePhaseHandler({
    code: "ABCD",
    state: () => room.state,
    makeSession: () => {
      const s = new NetSession(room, joined, () => roomLeaves++, inbox);
      sessions.push(s);
      return s;
    },
    inbox: () => inbox,
    ui: {
      set: (s) => screens.push(s),
      request: (name, ...args) => requests.push({ name, arg: args[0] }),
    },
  });
  const phase = (p: RunPhase) => {
    room.state.phase = p;
    onPhase(p);
  };
  return { room, inbox, sessions, screens, requests, phase, roomLeaves: () => roomLeaves };
}

describe("online run cycle in one room (Story 2.8)", () => {
  it("the Game scene's NetSimHost.dispose after Back to lobby doesn't leave the room", () => {
    const t = setup();
    t.phase("wave");
    const host1 = new NetSimHost({ balance: loadBalance(), session: t.sessions[0] as NetSession });
    t.phase("results");
    t.phase("lobby");
    host1.dispose(); // the scene stops a frame later
    expect(t.room.left).toBe(0);
    expect(t.roomLeaves()).toBe(0);
    t.room.deliver(S2C.NET_PINGED, { id: 9, rttMs: 30 });
    expect(t.room.sentOf("net.pong")).toEqual([{ id: 9 }]); // the inbox still answers
  });

  it("lobby → wave → results → lobby → wave: a fresh session per run, Results from state, the room is never left", () => {
    const t = setup();
    t.phase("wave");
    expect(t.requests).toEqual([{ name: "startOnline", arg: t.sessions[0] }]);

    t.room.state.resultWave = 4;
    t.phase("results");
    expect(t.screens.at(-1)).toEqual({
      kind: "results",
      wave: 4,
      online: true,
      rows: [
        { slot: 0, name: "Ana", kills: 7 },
        { slot: 2, name: "Cid", kills: 3 },
      ],
    });

    t.phase("lobby");
    expect(t.requests.at(-1)).toEqual({ name: "backToLobby", arg: undefined });
    expect(t.screens.at(-1)).toEqual({ kind: "lobby", code: "ABCD" });
    // The Game scene's dispose calls session.leave(): released, so the room stays.
    t.sessions[0]?.leave();
    expect(t.roomLeaves()).toBe(0);
    expect(t.room.left).toBe(0);

    t.phase("wave");
    expect(t.sessions).toHaveLength(2);
    expect(t.sessions[1]).not.toBe(t.sessions[0]);
    expect(t.requests.at(-1)).toEqual({ name: "startOnline", arg: t.sessions[1] });
    t.sessions[1]?.leave(); // a real leave in run 2 still leaves
    expect(t.roomLeaves()).toBe(1);
  });

  it("the next run's host never gets the previous run's events, but keeps its own tick 1", () => {
    const t = setup();
    t.phase("wave");
    const off = t.sessions[0]?.onEvents(() => {}); // run 1's host
    t.room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(50)); // run 1, to its host
    t.phase("results");
    off?.(); // the host unsubscribed before the lobby patch was seen
    t.room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(51)); // run 1, re-buffered by the inbox
    t.phase("lobby"); // reset: dropped
    expect(t.room.left).toBe(0);
    t.room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(1)); // run 2's tick 1 can beat the start patch
    t.phase("wave");
    const got: number[] = [];
    t.sessions[1]?.onEvents((m) => got.push(m.tick));
    expect(got).toEqual([1]);
  });

  it("no session (room not ready) starts nothing", () => {
    const screens: UiScreen[] = [];
    const requests: string[] = [];
    const onPhase = createOnlinePhaseHandler({
      code: "ABCD",
      state: () => fakeState(),
      makeSession: () => null,
      inbox: () => null,
      ui: {
        set: (s) => {
          screens.push(s);
        },
        request: (...args) => {
          requests.push(args[0]);
        },
      },
    });
    onPhase("wave");
    expect(requests).toEqual([]);
  });
});

describe("resultsFromState", () => {
  it("shows at least wave 1, rows by slot", () => {
    const s = fakeState([fakePlayer(1, { kills: 2 })]);
    expect(resultsFromState(s)).toEqual({ wave: 1, rows: [{ slot: 1, name: "P1", kills: 2 }] });
  });
});

describe("RunInbox.reset / NetSession.release", () => {
  it("reset drops buffered batches and counters but keeps listening", () => {
    const room = new FakeRoom();
    const inbox = new RunInbox(room);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(1));
    inbox.reset();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(2));
    const got: number[] = [];
    inbox.onEvents((m) => got.push(m.tick));
    expect(got).toEqual([2]);
  });

  it("release makes leave a no-op that keeps the inbox open", () => {
    const room = new FakeRoom();
    const inbox = new RunInbox(room);
    let leaves = 0;
    const s = new NetSession(room, joined, () => leaves++, inbox);
    s.release();
    s.leave();
    expect(leaves).toBe(0);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, batch(3));
    const got: number[] = [];
    inbox.onEvents((m) => got.push(m.tick));
    expect(got).toEqual([3]);
  });
});
