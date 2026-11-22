import { describe, expect, it } from "vitest";
import { NET_EVENT_KIND, S2C, loadBalance, type RunPhase, type SimEventsFlushed } from "@topdown/shared";
import { createOnlinePhaseHandler, resultsFromState } from "./onlineFlow";
import { NetSession, RunInbox } from "./session";
import { FakeRoom, fakePlayer, fakeState } from "./fakeRoom";
import { NetSimHost } from "../sim/NetSimHost";
import { activeRun } from "./activeRun";
import type { UiScreen } from "../ui/uiState";

const joined = { playerId: "p1", slot: 1, tickRateHz: 20 };
const batch = (tick: number): SimEventsFlushed => ({ tick, events: [[NET_EVENT_KIND.WAVE_STARTED, tick, 8]] });

/** The main.ts wiring with fakes: one room, its inbox, the ui requests seen. */
function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(2, { name: "Cid", kills: 3, earned: 120 }), fakePlayer(0, { name: "Ana", kills: 7, earned: 245 })]));
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

describe("build phase in the run cycle (Story 3.1)", () => {
  it("lobby → build → wave → build → wave: one session for the whole run, started once", () => {
    const t = setup();
    t.phase("build");
    expect(t.sessions).toHaveLength(1);
    expect(t.requests).toEqual([{ name: "startOnline", arg: t.sessions[0] }]);
    t.phase("wave");
    t.phase("build");
    t.phase("wave");
    expect(t.sessions).toHaveLength(1);
    expect(t.requests).toHaveLength(1);
    expect(t.roomLeaves()).toBe(0);
    t.phase("results");
    t.phase("lobby");
    t.phase("build"); // run 2 starts in its build phase too
    expect(t.sessions).toHaveLength(2);
    expect(t.requests.at(-1)).toEqual({ name: "startOnline", arg: t.sessions[1] });
  });

  it("a new run seen straight after Results (its lobby patch skipped under ?lag) still gets a fresh session", () => {
    const t = setup();
    t.phase("build");
    t.phase("results");
    t.phase("build");
    expect(t.sessions).toHaveLength(2);
    t.sessions[0]?.leave(); // released: the old scene's dispose never leaves the room
    expect(t.roomLeaves()).toBe(0);
  });
});

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
      heldOut: false,
      online: true,
      rows: [
        { slot: 0, name: "Ana", kills: 7, earned: 245 },
        { slot: 2, name: "Cid", kills: 3, earned: 120 },
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

  it("activeRun follows the room: the run's session at wave, null at lobby (late scene starts check it)", () => {
    const { phase, sessions } = setup();
    phase("wave");
    expect(activeRun.current()).toBe(sessions[0]);
    phase("results");
    expect(activeRun.current()).toBe(sessions[0]);
    phase("lobby");
    expect(activeRun.current()).toBeNull();
    phase("wave");
    expect(activeRun.current()).toBe(sessions[1]);
    expect(activeRun.current()).not.toBe(sessions[0]); // a stale start for run 1 is detectable
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
    expect(resultsFromState(s)).toEqual({ wave: 1, heldOut: false, rows: [{ slot: 1, name: "P1", kills: 2, earned: 0 }] });
  });

  it("Story 3.10: the last wave cleared → heldOut, the wave reached and each player's earnings", () => {
    const s = fakeState([fakePlayer(3, { kills: 40, earned: 610 }), fakePlayer(0, { kills: 52, earned: 655 })]);
    s.phase = "results";
    s.resultWave = 5;
    s.resultHeldOut = true;
    expect(resultsFromState(s)).toEqual({
      wave: 5,
      heldOut: true,
      rows: [
        { slot: 0, name: "P0", kills: 52, earned: 655 },
        { slot: 3, name: "P3", kills: 40, earned: 610 },
      ],
    });
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
