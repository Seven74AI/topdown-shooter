import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION, DOWNTOWN_MAP, BYTES, C2S, NET_EVENT_KIND, RUN_ROOM_NAME, S2C, skipWave, type RunStateView, type SimEventsFlushed } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 3.10 integration (Story 6.11: clearing wave `runWaves` opens the vote; Extract ends the run "extracted" for every client). */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

type RunSdkRoom = SdkRoom<unknown, RunStateView>;

const options = (intent: "create" | "join", name: string) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken: randomBytes(16).toString("hex"),
});

function record(client: RunSdkRoom) {
  const events: SimEventsFlushed[] = [];
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => events.push(m));
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.SHOP_OFFERED, () => {});
  return events;
}

async function startTwo() {
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  const hostEvents = record(host);
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
  const guestEvents = record(guest);
  await guest.waitForInitialState();
  for (const c of [host, guest]) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return { host, guest, room, hostEvents, guestEvents };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};

describe("RunRoom ten-wave run (Story 3.10; Story 6.1: runWaves 10)", () => {
  it("2 players: wave 1 is 24 Walkers (× 0.6); clearing wave 10 → the vote → Extract → Results \"extracted\", wave 10 and earnings on every client", async () => {
    const { host, guest, room, guestEvents } = await startTwo();
    const info = vi.spyOn(room.log, "info");
    const w = world(room);
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    expect(w.waves.size).toBe(24); // 40 × 0.6 (FR31)
    expect(serverBalance.waves.runWaves).toBe(10); // Story 6.1: the real balance (no override)
    // Jump to wave 10 (dev skips between ticks, as the cheat does), then clear it.
    for (let n = 1; n <= 9; n++) {
      await vi.waitFor(() => expect(w.run.phase).toBe("wave"));
      skipWave(w);
      await vi.waitFor(() => expect(w.run.phase).toBe("build"));
      for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    }
    await vi.waitFor(() => expect(w.waves.number).toBe(10));
    expect(w.waves.size).toBe(240); // 400 × 0.6
    skipWave(w);
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("vote"));
    await new Promise((r) => setTimeout(r, 1100)); // the 20 Ready taps above emptied each client's guard bucket (~10 msgs/s): let it refill
    for (const c of [host, guest]) c.send(C2S.EVAC_VOTE, { choice: "extract" });
    for (const c of [host, guest]) {
      await vi.waitFor(() => expect(c.state.phase).toBe("results"), { timeout: 3000 }); // the 1 s all-voted beat
      expect(c.state.resultEnding).toBe("extracted");
      expect(c.state.resultWave).toBe(10);
      // the wave-clear bonuses 15 × (1 + … + 10) (balance pass B1; skipped waves pay no kills) reached the clients
      for (const id of ["p0", "p1"]) expect(c.state.players.get(id)?.earned).toBe(825);
    }
    await vi.waitFor(() => expect(guestEvents.some((b) => b.events.some((t) => t[0] === NET_EVENT_KIND.RUN_EXTRACTED && t[1] === 10))).toBe(true));
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ wave: 10, ending: "extracted", endless: false, endlessWaves: 0, earned: { p0: 825, p1: 825 } }), "run_ended");
    expect(info).toHaveBeenCalledWith({ wave: 10, extract: 2, stay: 0, silent: 0, choice: "extract" }, "vote_resolved");
    // No more ticks after Results: the World stays put, no build phase for a wave 11.
    const tick = w.tick;
    await new Promise((r) => setTimeout(r, 200));
    expect(w.tick).toBe(tick);
    expect(host.state.phase).toBe("results");
    // Back to lobby clears the flag for the next run.
    host.send(C2S.LOBBY_RETURN, {});
    await vi.waitFor(() => expect(guest.state.phase).toBe("lobby"));
    expect(guest.state.resultEnding).toBe("");
  });

  it("a wipe still ends with resultEnding \"wiped\"", async () => {
    const { host, room } = await startTwo();
    const w = world(room);
    for (const p of w.players.values()) p.status = "downed"; // the downed system sees no one standing
    await vi.waitFor(() => expect(host.state.phase).toBe("results"));
    expect(host.state.resultEnding).toBe("wiped");
  });
});
