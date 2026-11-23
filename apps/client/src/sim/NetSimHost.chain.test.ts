import { describe, expect, it } from "vitest";
import { C2S, NEUTRAL_INPUT, S2C, addPlayer, buildingStats, createWorld, footprint, loadBalance, placeBuilding, spawnZombie, startBuild, startWave, type PlaceError, type PlaceRequest, type World } from "@topdown/shared";
import { NetSession } from "../net/session";
import { DevThrottle } from "../net/devThrottle";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { CHAIN_MONEY_TEXT, Placement, placeRefusalText, stepPlacement, type PlacementFrame, type PlacementHud } from "../scenes/placement";
import { PendingPlacements, newestBuildingId } from "../scenes/pendingPlacements";
import { NO_ANSWER_TEXT, runPendingFrame, type PendingFlowScene } from "../scenes/pendingFlow";

/**
 * Story 5.18 (AC 7–11, B1–B2): the chain and the pending boxes against a fake server that runs the
 * shared `placeBuilding` on its own World, behind the dev throttle at 150 ms ± 20 (one tick = 50 ms,
 * a patch per tick, a refusal sent at once). The client loop is GameScene's: pending update → the
 * placement step → pump + update → throttle pump → host update → refusals to the oldest box.
 */
const balance = loadBalance();
const WOOD = "wood_barricade";
const RTT_MS = 150;
const JITTER_MS = 20;
const FRAME_MS = 16;
const TICK_MS = 50;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rig(wallet: number, seed = 7) {
  const server = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(server, "p1", 20, 16);
  (server.players.get("p1") as { wallet: number }).wallet = wallet;
  startBuild(server);
  const room = new FakeRoom(fakeState([fakePlayer(1, { x: 20, y: 16, wallet, ackSeq: 0 })]));
  room.state.phase = "build";
  room.state.wave = server.waves.number;
  room.state.buildTicksLeft = 600;
  let now = 0;
  const throttle = new DevThrottle(room, { lagMs: RTT_MS, jitterMs: JITTER_MS, random: lcg(seed), now: () => now });
  const session = new NetSession(throttle, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => now });
  const pending = new PendingPlacements();
  pending.configure(balance.controls.build.pendingTimeoutMs, balance.controls.build.chainSendGapMs, balance.buildings.maxPerPlayer);
  const p = new Placement();
  const m: PlacementHud = { placementActive: false, placementValid: true, placementLocked: false, placementHint: "", rotatePressed: false, confirmPressed: false, cancelPressed: false };
  const toasts: string[] = [];
  const box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const w = (): Readonly<World> => host.world;
  const f: PlacementFrame = {
    can: true,
    wave: 0,
    x: 20,
    y: 16,
    ownerId: "p1",
    label: "Wood barricade · $40",
    refusal: (e: PlaceError) => placeRefusalText(e, balance),
    send: (r: PlaceRequest) => {
      const s = buildingStats(balance, r.type);
      if (!s) throw new Error("type");
      pending.add(r, s.price, footprint(s, r.gx, r.gy, r.rot, box), newestBuildingId(w()), w().run.phase, w().waves.number);
    },
    toast: (t) => toasts.push(t),
    nowMs: 0,
    hintText: (e: PlaceError) => placeRefusalText(e, balance),
    pending,
  };
  let handled = 0;
  let nextTick = TICK_MS;
  const refusals: PlaceError[] = [];
  /** Shown-wallet samples (ms, shown, the server's wallet). */
  const shown: [number, number, number][] = [];
  /** Server ticks are paused until this time (a server hitch: messages are still handled on arrival). */
  let stallUntil = 0;
  /** The server drops every place unanswered (as the message guard would). */
  let deaf = false;
  const handle = (): void => {
    if (deaf) {
      handled = room.sentOf(C2S.BUILDING_PLACE).length;
      return;
    }
    // the places that arrived, in order, between ticks (a refusal goes out at once, the building with the next patch)
    const sent = room.sentOf(C2S.BUILDING_PLACE) as PlaceRequest[];
    for (; handled < sent.length; handled++) {
      const r = placeBuilding(server, "p1", sent[handled] as PlaceRequest);
      if (!r.ok) {
        refusals.push(r.error);
        room.deliver(S2C.BUILDING_REFUSED, { reason: r.error });
      }
    }
  };
  const serverTick = (): void => {
    room.state.tick++;
    room.state.phase = server.run.phase;
    room.state.wave = server.waves.number;
    for (const b of server.buildings.list) room.state.buildings.set(String(b.id), { type: b.type, owner: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, hp: b.hp });
    const me = room.state.players.get("p1");
    if (me) me.wallet = server.players.get("p1")?.wallet ?? 0;
    room.patch();
  };
  let tapNow = false;
  const dropped = { seen: 0 };
  const send = (r: PlaceRequest): void => host.placeBuilding(r);
  const scene: PendingFlowScene = {
    beforeHost: () => {
      f.wave = w().waves.number;
      f.can = w().run.phase === "build";
      f.nowMs = now;
      m.confirmPressed = tapNow;
      stepPlacement(p, m, { ...NEUTRAL_INPUT }, w(), f);
    },
    stepHost: () => host.update(FRAME_MS / 1000),
    toast: (t) => toasts.push(t),
    refusalText: (e) => placeRefusalText(e, balance),
  };
  const frame = (tap = false): void => {
    now += FRAME_MS;
    throttle.pump(now);
    handle();
    while (now >= nextTick) {
      if (now >= stallUntil) serverTick();
      nextTick += TICK_MS;
    }
    tapNow = tap;
    runPendingFrame(pending, host, now, scene, send, dropped); // GameScene's order (review M2)
    shown.push([now, (w().players.get("p1")?.wallet ?? 0) - pending.money, server.players.get("p1")?.wallet ?? 0]);
  };
  const start = (): void => {
    for (let i = 0; i < 20; i++) frame(); // the first patches arrive (the mirror has me)
    expect(p.start(balance, WOOD, 20, 16, 0, -1, w().waves.number)).toBe(true);
    frame();
  };
  const stall = (ms: number): void => {
    stallUntil = now + ms;
  };
  /** A hidden tab: no frame for `ms` (the server keeps ticking; the throttle isn't pumped). */
  const sleep = (ms: number, during?: () => void): void => {
    const end = now + ms;
    while (nextTick <= end) {
      serverTick();
      nextTick += TICK_MS;
      during?.();
      during = undefined;
    }
    now = end - FRAME_MS; // the next frame lands at `end`
  };
  const setDeaf = (v: boolean): void => {
    deaf = v;
  };
  return { server, room, host, pending, p, m, toasts, refusals, shown, frame, start, stall, sleep, setDeaf, now: () => now };
}

/** Longest stretch (ms) the shown wallet was below `final`. */
function longestBelow(shown: readonly [number, number, number][], final: number): number {
  let longest = 0;
  let since = Number.NaN;
  for (const [t, v] of shown) {
    if (v < final) {
      if (Number.isNaN(since)) since = t;
      longest = Math.max(longest, t - since);
    } else since = Number.NaN;
  }
  return longest;
}

describe("Story 5.18: chain + pending under ?lag=150&jitter=20 (NetSimHost, fake server)", () => {
  it("three quick Places give three buildings end to end, each charged once; the shown wallet never below the final (AC 11)", () => {
    const s = rig(5000);
    s.start();
    s.frame(true);
    s.frame();
    s.frame(true);
    s.frame();
    s.frame(true);
    for (let i = 0; i < 150; i++) s.frame(); // 2.4 s
    const built = s.server.buildings.list.map((b) => [b.gx, b.gy, b.rot]);
    expect(built).toEqual([
      [38, 28, 2],
      [42, 28, 2],
      [46, 28, 2],
    ]);
    expect(s.room.sentOf(C2S.BUILDING_PLACE).length).toBe(3); // no double send
    expect(s.server.players.get("p1")?.wallet).toBe(5000 - 120); // no double charge
    expect(s.host.world.buildings.list.length).toBe(3);
    expect([s.pending.count, s.pending.money, s.pending.entries.filter((e) => e.live).length]).toEqual([0, 0, 0]);
    expect(longestBelow(s.shown, 5000 - 120)).toBe(0);
    expect(Math.min(...s.shown.map((x) => x[1]))).toBe(5000 - 120);
    expect(s.toasts).toEqual([]);
    expect(s.p.pinned).toBe(true); // still holding the 4th, pinned at the wall's end
  });

  it("10 taps in 1 s with $100: 2 sent, 2 built, $80 charged (B1)", () => {
    const s = rig(100);
    s.start();
    for (let i = 0; i < 60; i++) s.frame(i % 6 === 0); // a tap every 96 ms
    for (let i = 0; i < 150; i++) s.frame();
    expect(s.room.sentOf(C2S.BUILDING_PLACE).length).toBe(2);
    expect(s.server.buildings.list.length).toBe(2);
    expect(s.server.players.get("p1")?.wallet).toBe(20);
    expect(s.refusals).toEqual([]);
    expect(s.toasts).toEqual([CHAIN_MONEY_TEXT]);
    expect(s.shown.at(-1)?.[1]).toBe(20);
  });

  it("a box the server refuses between two it accepts: only that one shakes, its money is shown back within one round trip (AC 7, 8)", () => {
    const s = rig(5000);
    // a zombie on the 2nd spot that this device doesn't see (the fake room streams no horde): the server says "blocked"
    spawnZombie(s.server, "walker", 22, 14.25);
    s.start();
    s.frame(true);
    s.frame(true);
    s.frame(true);
    let refusedSeen = false;
    for (let i = 0; i < 150; i++) {
      s.frame();
      const red = s.pending.entries.find((e) => e.live && !Number.isNaN(e.refusedMs));
      if (red) {
        refusedSeen = true;
        expect([red.gx, red.gy]).toEqual([42, 28]);
      }
    }
    expect(refusedSeen).toBe(true);
    expect(s.refusals).toEqual(["blocked"]);
    expect(s.server.buildings.list.map((b) => b.gx)).toEqual([38, 46]);
    expect(s.server.players.get("p1")?.wallet).toBe(5000 - 80);
    expect(s.toasts).toEqual(["Can't build here"]);
    // the shown wallet was below the final only while the refusal was on its way (≤ one round trip + a tick + jitter)
    const below = longestBelow(s.shown, 5000 - 80);
    expect(below).toBeGreaterThan(0);
    expect(below).toBeLessThanOrEqual(RTT_MS + JITTER_MS + TICK_MS + 2 * FRAME_MS + 250); // + the send gap of the 3rd box
    expect(s.pending.count).toBe(0);
  });

  it("a server hitch: my 1st place accepted and the 2nd refused before any patch — still only the 2nd box shakes (AC 8)", () => {
    const s = rig(5000);
    spawnZombie(s.server, "walker", 22, 14.25); // the 2nd spot, unseen here
    s.start();
    s.stall(700); // no patch for 700 ms: both places are handled, the refusal goes out, the building waits for the next patch
    s.frame(true);
    s.frame(true);
    const shook: number[] = [];
    for (let i = 0; i < 150; i++) {
      s.frame();
      for (const e of s.pending.entries) if (e.live && !Number.isNaN(e.refusedMs) && !shook.includes(e.gx)) shook.push(e.gx);
    }
    expect(s.refusals).toEqual(["blocked"]);
    expect(s.server.buildings.list.map((b) => b.gx)).toEqual([38]);
    expect(shook).toEqual([42]); // never the accepted box, and no "No answer" timeout
    expect(s.toasts).toEqual(["Can't build here"]);
    expect([s.pending.count, s.pending.money]).toEqual([0, 0]);
  });

  it("review M1: Place, then a hidden tab for 3 s: no false \"No answer\", the box becomes the building, charged once", () => {
    const s = rig(5000);
    s.start();
    s.frame(true);
    for (let i = 0; i < 6; i++) s.frame(); // sent; the server built it; the patch is still on its way
    s.sleep(3000);
    for (let i = 0; i < 60; i++) s.frame();
    expect(s.toasts).toEqual([]);
    expect(s.server.buildings.list.length).toBe(1);
    expect(s.server.players.get("p1")?.wallet).toBe(4960);
    expect([s.pending.count, s.shown.at(-1)?.[1]]).toEqual([0, 4960]);
  });

  it("review M1: the tab hides in the very frame of the Place (the send still queued): woken, the answer comes a round trip later and no box times out", () => {
    const s = rig(5000);
    s.start();
    s.frame(true);
    s.sleep(3000);
    for (let i = 0; i < 60; i++) s.frame();
    expect(s.toasts).toEqual([]);
    expect(s.server.buildings.list.length).toBe(1);
    expect([s.pending.count, s.shown.at(-1)?.[1]]).toEqual([0, 4960]);
  });

  it("review M1 / B3: a hidden tab across a build start with a box pending: cleared on the woken frame, no false toast", () => {
    const s = rig(5000);
    s.setDeaf(true); // the place never gets an answer before the phase ends
    s.start();
    s.frame(true);
    s.frame();
    s.sleep(5000, () => {
      startWave(s.server);
      startBuild(s.server); // the next build: a new wave number
    });
    s.frame();
    expect([s.pending.count, s.pending.money]).toEqual([0, 0]);
    for (let i = 0; i < 200; i++) s.frame();
    expect(s.toasts).toEqual([]);
    expect(s.shown.at(-1)?.[1]).toBe(5000);
  });

  it("a server that never answers: after 2 s the box shakes with \"No answer from the server\" and the money is shown back (AC 7, B8)", () => {
    const s = rig(5000);
    s.setDeaf(true);
    s.start();
    s.frame(true);
    let maxPending = 0;
    for (let i = 0; i < 160; i++) {
      s.frame();
      maxPending = Math.max(maxPending, s.pending.count);
    }
    expect(maxPending).toBe(1);
    expect(s.toasts).toEqual([NO_ANSWER_TEXT]);
    expect([s.pending.count, s.shown.at(-1)?.[1]]).toEqual([0, 5000]);
  });

  it("Place at the build→wave edge: refused not_build_phase, nothing charged, the box goes with the phase (B2)", () => {
    const s = rig(5000);
    s.start();
    s.frame(true);
    startWave(s.server); // the server's build ends before my place arrives
    for (let i = 0; i < 100; i++) s.frame();
    expect(s.refusals).toEqual(["not_build_phase"]);
    expect(s.server.players.get("p1")?.wallet).toBe(5000);
    expect(s.server.buildings.list.length).toBe(0);
    expect([s.pending.count, s.pending.money]).toEqual([0, 0]);
    expect(s.shown.at(-1)?.[1]).toBe(5000);
    expect(s.p.active).toBe(false); // the wave ended holding (5.15)
    expect(s.toasts).toEqual(["Only during the build phase"]);
  });
});
