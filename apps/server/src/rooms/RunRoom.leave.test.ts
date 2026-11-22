import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { matchMaker } from "@colyseus/core";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  BYTES,
  C2S,
  NET_EVENT_KIND,
  RUN_ROOM_NAME,
  S2C,
  downPlayer,
  type PlayerLeft,
  type PlayerState,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 2.11 integration: leaving (consented or dropped) in the lobby and mid-run. */
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
  guestToken: randomBytes(16).toString("hex"),
});

interface Seen {
  left: PlayerLeft[];
  events: SimEventsFlushed[];
}

function record(client: RunSdkRoom): Seen {
  const seen: Seen = { left: [], events: [] };
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => seen.events.push(m));
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.PLAYER_LEFT, (m: PlayerLeft) => seen.left.push(m));
  return seen;
}

/** Host Ana (p0), then Bo (p1) and Cy (p2) when `n` is 3; waves paused (only what the test does happens). */
async function lobbyOf(n: 2 | 3) {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const names = ["Ana", "Bo", "Cy"].slice(0, n);
  const clients: RunSdkRoom[] = [];
  const seen: Seen[] = [];
  for (const [i, name] of names.entries()) {
    const c =
      i === 0
        ? await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", name))
        : await colyseus.sdk.joinById<RunStateView>((clients[0] as RunSdkRoom).roomId, options("join", name));
    seen.push(record(c));
    await c.waitForInitialState();
    clients.push(c);
  }
  const room = colyseus.getRoomById<RunRoom>((clients[0] as RunSdkRoom).roomId) as unknown as RunRoom;
  await vi.waitFor(() => expect(room.members.size).toBe(n));
  return { clients, seen, room };
}

async function start(clients: RunSdkRoom[], room: RunRoom): Promise<void> {
  for (const c of clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  (clients[0] as RunSdkRoom).send(C2S.RUN_START, {});
  for (const c of clients) await vi.waitFor(() => expect(c.state.phase).toBe("wave"));
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};

/** Kills the player's socket on the server side without a close handshake (a lost phone signal). */
function dropSocket(room: RunRoom, client: RunSdkRoom): void {
  const server = room.clients.find((c) => c.sessionId === client.sessionId);
  (server?.ref as unknown as { terminate(): void }).terminate();
}

describe("RunRoom leave (Story 2.11)", () => {
  it("a consented leave mid-run: the others get player.left 'left' with the name, the player is gone, the room keeps ticking", async () => {
    const { clients, seen, room } = await lobbyOf(2);
    const [host, guest] = clients as [RunSdkRoom, RunSdkRoom];
    await start(clients, room);
    const info = vi.spyOn(room.log, "info");
    await guest.leave(true);
    await vi.waitFor(() => expect(seen[0]?.left).toEqual([{ playerId: "p1", name: "Bo", reason: "left" }]));
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ playerId: "p1", reason: "left", wave: expect.any(Number) }), "player_left");
    await vi.waitFor(() => expect(host.state.players.has("p1")).toBe(false));
    expect(world(room).players.has("p1")).toBe(false);
    const tick = host.state.tick;
    await vi.waitFor(() => expect(host.state.tick).toBeGreaterThan(tick + 3));
    expect(room.state.phase).toBe("wave");
  });

  it("a dropped socket mid-run gives reason 'disconnected'", async () => {
    const { clients, seen, room } = await lobbyOf(2);
    await start(clients, room);
    dropSocket(room, clients[1] as RunSdkRoom);
    await vi.waitFor(() => expect(seen[0]?.left).toEqual([{ playerId: "p1", name: "Bo", reason: "disconnected" }]));
    expect(world(room).players.has("p1")).toBe(false);
  });

  it("is broadcast in the lobby too", async () => {
    const { clients, seen, room } = await lobbyOf(2);
    await (clients[1] as RunSdkRoom).leave(true);
    await vi.waitFor(() => expect(seen[0]?.left).toEqual([{ playerId: "p1", name: "Bo", reason: "left" }]));
    expect(room.state.players.has("p1")).toBe(false);
  });

  it("the host leaving mid-run moves hostSlot to the longest-connected player, and the run goes on", async () => {
    const { clients, seen, room } = await lobbyOf(3);
    const [host, bo, cy] = clients as [RunSdkRoom, RunSdkRoom, RunSdkRoom];
    await start(clients, room);
    await host.leave(true);
    for (const c of [bo, cy]) await vi.waitFor(() => expect(c.state.hostSlot).toBe(1));
    expect(seen[2]?.left).toEqual([{ playerId: "p0", name: "Ana", reason: "left" }]);
    const tick = cy.state.tick;
    await vi.waitFor(() => expect(cy.state.tick).toBeGreaterThan(tick + 3));
  });

  it("the last one standing leaving while the rest are downed is a team wipe (Story 2.8)", async () => {
    const { clients, seen, room } = await lobbyOf(2);
    const [host, guest] = clients as [RunSdkRoom, RunSdkRoom];
    await start(clients, room);
    const w = world(room);
    w.waves.number = 2;
    downPlayer(w, w.players.get("p0") as PlayerState);
    await vi.waitFor(() => expect(host.state.players.get("p0")?.status).toBe("downed"));
    expect(room.state.phase).toBe("wave");
    await guest.leave(true);
    await vi.waitFor(() => expect(host.state.phase).toBe("results"));
    expect(host.state.resultWave).toBe(2);
    const kinds = (seen[0] as Seen).events.flatMap((b) => b.events.map((t) => t[0]));
    expect(kinds).toContain(NET_EVENT_KIND.TEAM_WIPED);
  });

  it("a downed player leaving takes their countdown with them; the others play on", async () => {
    const { clients, room } = await lobbyOf(2);
    const [host, guest] = clients as [RunSdkRoom, RunSdkRoom];
    await start(clients, room);
    const w = world(room);
    downPlayer(w, w.players.get("p1") as PlayerState);
    await vi.waitFor(() => expect(host.state.players.get("p1")?.status).toBe("downed"));
    await guest.leave(true);
    await vi.waitFor(() => expect(host.state.players.has("p1")).toBe(false));
    const tick = host.state.tick;
    await vi.waitFor(() => expect(host.state.tick).toBeGreaterThan(tick + 3));
    expect(room.state.phase).toBe("wave");
    expect(w.players.get("p0")?.status).toBe("alive");
  });

  it("the room disposes itself when the last player leaves", async () => {
    const { clients, room } = await lobbyOf(2);
    await start(clients, room);
    const code = room.roomId;
    for (const c of clients) await c.leave(true);
    await vi.waitFor(() => expect(matchMaker.getLocalRoomById(code)).toBeUndefined());
  });
});
