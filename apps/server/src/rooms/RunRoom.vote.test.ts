import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import { DOWNTOWN_MAP, BYTES, C2S, NET_EVENT_KIND, RUN_ROOM_NAME, S2C, skipWave, type RunStateView, type SimEventsFlushed } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/**
 * Story 6.11 (T2): the evacuation vote in a real room (brief 2, 14, 17): the vote opens after wave
 * 10 for every client, each `vote` is live on every phone, a changed vote counts, a vote outside
 * the vote is ignored, a burst of votes stays inside the guard and the last one counts, a leaver is
 * not counted, Stay → the wave-11 build with `endless` synced.
 */
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

/** Two players in a run, the World jumped to the vote after wave 10 (dev skips between ticks, as the cheat does). */
async function toVote() {
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  const hostEvents = record(host);
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
  record(guest);
  await guest.waitForInitialState();
  for (const c of [host, guest]) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  w.debug.bossWaves = []; // the vote flow alone (the Behemoth's room tests cover wave 10's boss)
  w.waves.number = 9; // the build before wave 10 (as the start-wave switch would set it)
  for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
  await vi.waitFor(() => expect(w.run.phase).toBe("wave"));
  expect(w.waves.number).toBe(10);
  skipWave(w);
  for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("vote"));
  return { host, guest, room, w, hostEvents };
}

const slotOf = (c: RunSdkRoom, room: RunRoom): string => {
  const m = room.members.get(c.sessionId);
  if (!m) throw new Error("no member");
  return m.playerId;
};

describe("RunRoom evacuation vote (Story 6.11)", () => {
  it("opens for everyone with the server's ticks; votes are live on every phone and changeable; Stay → wave-11 build, endless synced", async () => {
    const { host, guest, room, hostEvents } = await toVote();
    const info = vi.spyOn(room.log, "info");
    await vi.waitFor(() => expect(hostEvents.some((b) => b.events.some((t) => t[0] === NET_EVENT_KIND.RUN_VOTE_OPENED && t[1] === 10 && t[2] === 300))).toBe(true));
    expect(host.state.voteTicksLeft).toBeGreaterThan(200);
    const hostId = slotOf(host, room);
    const guestId = slotOf(guest, room);
    host.send(C2S.EVAC_VOTE, { choice: "extract" });
    await vi.waitFor(() => expect(guest.state.players.get(hostId)?.vote).toBe(1)); // F2: live on the other phone
    host.send(C2S.EVAC_VOTE, { choice: "stay" }); // D2: changed
    await vi.waitFor(() => expect(guest.state.players.get(hostId)?.vote).toBe(2));
    guest.send(C2S.EVAC_VOTE, { choice: "stay" });
    await vi.waitFor(() => expect(host.state.players.get(guestId)?.vote).toBe(2));
    for (const c of [host, guest]) {
      await vi.waitFor(() => expect(c.state.phase).toBe("build"), { timeout: 3000 }); // the 1 s all-voted beat
      expect(c.state.endless).toBe(true);
      expect(c.state.voteTicksLeft).toBe(0);
    }
    expect(info).toHaveBeenCalledWith({ wave: 10, extract: 0, stay: 2, silent: 0, choice: "stay" }, "vote_resolved");
    expect(room.controller?.world.waves.number).toBe(10); // the build before wave 11
    // a vote outside the vote is ignored
    host.send(C2S.EVAC_VOTE, { choice: "extract" });
    await new Promise((r) => setTimeout(r, 100));
    expect(room.controller?.world.players.get(hostId)?.vote).toBe(2);
  });

  it("a burst of votes stays inside the guard bucket and the last one counts (beat the rule 1)", async () => {
    const { host, room } = await toVote();
    const hostId = slotOf(host, room);
    for (let i = 0; i < 6; i++) host.send(C2S.EVAC_VOTE, { choice: i % 2 === 0 ? "stay" : "extract" });
    await vi.waitFor(() => expect(room.controller?.world.players.get(hostId)?.vote).toBe(1)); // the 6th (extract)
    expect(room.state.phase).toBe("vote");
  });

  it("a malformed vote is dropped; the leaver's vote is gone and the vote can end early with Extract", async () => {
    const { host, guest, room } = await toVote();
    host.send(C2S.EVAC_VOTE, { choice: "maybe" });
    host.send(C2S.EVAC_VOTE, { choice: "stay", extra: 1 });
    await new Promise((r) => setTimeout(r, 100));
    const hostId = slotOf(host, room);
    expect(room.controller?.world.players.get(hostId)?.vote).toBe(0);
    guest.send(C2S.EVAC_VOTE, { choice: "stay" });
    await vi.waitFor(() => expect(room.controller?.world.players.size === 2 && [...room.controller!.world.players.values()].some((p) => p.vote === 2)).toBe(true));
    await guest.leave();
    await vi.waitFor(() => expect(room.controller?.world.players.size).toBe(1));
    host.send(C2S.EVAC_VOTE, { choice: "extract" });
    await vi.waitFor(() => expect(host.state.phase).toBe("results"), { timeout: 3000 }); // everyone left voted: 1 s, not 15
    expect(host.state.resultEnding).toBe("extracted");
  });
});
