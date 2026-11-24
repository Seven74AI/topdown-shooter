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
let clock = 1000;
let hidden = false;
let shownAt = Number.NEGATIVE_INFINITY;
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
    dawnS: 4,
    nowMs: () => clock,
    pageHidden: () => hidden,
    lastShownMs: () => shownAt,
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

describe("Story 6.11: the vote in the run cycle", () => {
  it("build → wave → vote → build keeps the one session; an Extract seen live plays the 4 s dawn, a late one does not", () => {
    const t = setup();
    t.phase("build");
    t.phase("wave");
    t.phase("vote");
    t.phase("build"); // Stay
    t.phase("wave");
    t.phase("vote");
    expect(t.sessions).toHaveLength(1);
    expect(t.requests).toHaveLength(1);
    t.room.state.resultWave = 15;
    t.room.state.resultEnding = "extracted";
    t.room.state.endless = true;
    t.room.state.tick = 80; // the extract tick: 4 s of server time after the phases above (tick 0 at clock 1000)
    clock = 5000;
    t.phase("results");
    expect(t.screens.at(-1)).toMatchObject({ kind: "results", ending: "extracted", endless: true, wave: 15, dawnEndsAtMs: 9000 });
    // A late Game scene start (Results seen first, e.g. a reload) → no dawn.
    const u = setup();
    u.room.state.resultEnding = "extracted";
    u.phase("results");
    expect(u.screens.at(-1)).toMatchObject({ ending: "extracted", dawnEndsAtMs: clock });
  });

  it("review M2: a page frozen across the extract (the backlog delivers vote → results 5 s late) gets no dawn; 1 s late plays the rest", () => {
    clock = 1000;
    const t = setup();
    t.room.state.tick = 1180;
    t.phase("wave");
    t.room.state.tick = 1200;
    clock = 2000;
    t.phase("vote"); // seen live: offset = 2000 − 1200 × 50
    t.room.state.resultEnding = "extracted";
    t.room.state.tick = 1300; // extracted 5 s of server time later
    clock = 2000 + 5000 + 5000; // the tab slept: the vote → results backlog arrives 5 s after the extract
    t.phase("results");
    expect(t.screens.at(-1)).toMatchObject({ ending: "extracted", dawnEndsAtMs: clock }); // straight to the card
    const u = setup();
    clock = 1000;
    u.room.state.tick = 1200;
    u.phase("vote");
    u.room.state.resultEnding = "extracted";
    u.room.state.tick = 1300;
    clock = 1000 + 5000 + 1000; // 1 s late: 3 s of dawn left, ending on the extract tick + 4 s
    u.phase("results");
    expect(u.screens.at(-1)).toMatchObject({ dawnEndsAtMs: 1000 + 5000 + 4000 });
  });

  it("re-review RL1: 5 s of dropped server ticks earlier in the run don't cost a live player the dawn (the clock restarts at each wave)", () => {
    shownAt = Number.NEGATIVE_INFINITY;
    hidden = false;
    clock = 1000;
    const t = setup();
    t.room.state.tick = 0;
    t.phase("build");
    t.room.state.tick = 600;
    clock = 1000 + 600 * 50;
    t.phase("wave"); // wave 1, live
    // … nine waves later, the server lost 5 s of ticks to stalls (setFixedTimestep drops the backlog)
    t.room.state.tick = 20_000;
    clock = 1000 + 20_000 * 50 + 5000;
    t.phase("build");
    t.room.state.tick = 20_600;
    clock = 1000 + 20_600 * 50 + 5000;
    t.phase("wave"); // wave 10 starts: a fresh live sample
    t.room.state.tick = 30_000;
    clock = 1000 + 30_000 * 50 + 5000;
    t.phase("vote");
    t.room.state.resultEnding = "extracted";
    t.room.state.tick = 30_100;
    clock = 1000 + 30_100 * 50 + 5000 + 80; // live (80 ms of latency)
    t.phase("results");
    expect(t.screens.at(-1)).toMatchObject({ ending: "extracted", dawnEndsAtMs: clock - 80 + 4000 });
  });

  /** The live vote → results of one run (wave start at `c0`, extract 5 s into the vote, 80 ms latency). */
  function liveExtract(c0: number) {
    clock = c0;
    const t = setup();
    t.room.state.tick = 600;
    t.phase("wave");
    t.room.state.tick = 1200;
    clock = c0 + 600 * 50;
    t.phase("vote");
    t.room.state.resultEnding = "extracted";
    t.room.state.tick = 1300;
    clock = c0 + 700 * 50 + 80;
    return t;
  }

  it("re-review 2 (RR2-M1): a 2 s tab switch at the vote's start, live at the extract → the full dawn", () => {
    hidden = false;
    shownAt = 1000 + 600 * 50 + 2000; // came back 2 s into the vote, 3 s before the extract
    const t = liveExtract(1000);
    t.phase("results");
    expect(t.screens.at(-1)).toMatchObject({ ending: "extracted", dawnEndsAtMs: clock - 80 + 4000 });
    shownAt = Number.NEGATIVE_INFINITY;
  });

  it("re-review 2 (RR2-M1): hidden when the Results patch is processed → no dawn", () => {
    hidden = true;
    shownAt = Number.NEGATIVE_INFINITY;
    const t = liveExtract(1000);
    t.phase("results");
    expect(t.screens.at(-1)).toMatchObject({ dawnEndsAtMs: clock });
    hidden = false;
  });

  it("re-review 2 (RR2-M1, RR2-L1): shown 0.5 s before the patch (a frozen tab's queued messages) → no dawn", () => {
    hidden = false;
    const t = liveExtract(1000);
    shownAt = clock - 500;
    t.phase("results");
    expect(t.screens.at(-1)).toMatchObject({ dawnEndsAtMs: clock });
    shownAt = Number.NEGATIVE_INFINITY;
  });

  it("re-review RL2: a new run seen without its lobby patch restarts the clock (run 2's dawn plays)", () => {
    shownAt = Number.NEGATIVE_INFINITY;
    hidden = false;
    clock = 1000;
    const t = setup();
    t.room.state.tick = 50_000; // run 1 was long
    t.phase("wave");
    t.room.state.resultEnding = "wiped";
    t.phase("results");
    clock += 60_000 + 1200 * 50; // its lobby, build and wave patches skipped under ?lag: run 2 (ticks from 0) is first seen in its vote
    t.room.state.tick = 1200;
    t.phase("vote");
    t.room.state.resultEnding = "extracted";
    t.room.state.tick = 1300;
    clock += 100 * 50;
    t.phase("results");
    expect(t.sessions).toHaveLength(2);
    expect(t.screens.at(-1)).toMatchObject({ ending: "extracted", dawnEndsAtMs: clock + 4000 });
  });

  it("a vote seen first (a late join / reload during the vote) starts the session", () => {
    const t = setup();
    t.phase("vote");
    expect(t.sessions).toHaveLength(1);
    expect(t.requests).toEqual([{ name: "startOnline", arg: t.sessions[0] }]);
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
    t.room.state.runSeed = 3141592653; // Story 4.4: the server's seed reaches the Results
    t.phase("results");
    expect(t.screens.at(-1)).toEqual({
      kind: "results",
      wave: 4,
      ending: "wiped",
      endless: false,
      online: true,
      seed: 3141592653,
      dawnEndsAtMs: clock, // a wipe: no dawn
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
      dawnS: 4,
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
    expect(resultsFromState(s)).toEqual({ wave: 1, ending: "wiped", endless: false, rows: [{ slot: 1, name: "P1", kills: 2, earned: 0 }], seed: 0 });
  });

  it("Story 6.11: an extract → ending \"extracted\", the wave reached and each player's earnings", () => {
    const s = fakeState([fakePlayer(3, { kills: 40, earned: 610 }), fakePlayer(0, { kills: 52, earned: 655 })]);
    s.phase = "results";
    s.resultWave = 5;
    s.resultEnding = "extracted";
    s.runSeed = 99;
    expect(resultsFromState(s)).toEqual({
      wave: 5,
      ending: "extracted",
      endless: false,
      seed: 99,
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
