import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION,
  DOWNTOWN_MAP,
  BYTES,
  C2S,
  NET_EVENT_KIND,
  RUN_ROOM_NAME,
  S2C,
  applyZombieDamage,
  downPlayer,
  endWave,
  spawnZombie,
  type PlayerState,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 3.2 integration: wallets in schema, changed only by the server, and the "+N" events on the wire. */
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
  return events;
}

async function readyAndStart(clients: RunSdkRoom[], room: RunRoom) {
  for (const c of clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  (clients[0] as RunSdkRoom).send(C2S.RUN_START, {});
  for (const c of clients) await vi.waitFor(() => expect(c.state.phase).toBe("build")); // Story 3.1
}

/** Two players, waves paused (DEV_NO_WAVES): only what the test does happens. */
async function startTwo() {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  const hostEvents = record(host);
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
  const guestEvents = record(guest);
  await guest.waitForInitialState();
  await readyAndStart([host, guest], room);
  return { host, guest, room, hostEvents, guestEvents };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};
const player = (room: RunRoom, id: string) => world(room).players.get(id) as PlayerState;
const moneyEvents = (events: SimEventsFlushed[]) =>
  events.flatMap((b) => b.events.filter((t) => t[0] === NET_EVENT_KIND.MONEY_EARNED).map((t) => t.slice(1)));

/** The start money (Story 5.13: 200). */
const S = serverBalance.economy.startingWallet;

describe("RunRoom wallets (Story 3.2)", () => {
  it("every player starts with the start money (S; 200 since 5.13); kill, assist and wave bonus reach every client's state and events", async () => {
    const { host, guest, room, guestEvents } = await startTwo();
    for (const c of [host, guest]) {
      for (const id of ["p0", "p1"]) expect(c.state.players.get(id)).toMatchObject({ wallet: S, earned: 0 });
    }
    const w = world(room);
    const id = spawnZombie(w, "walker", 44, 30);
    applyZombieDamage(w, id, 1, 1, 0, 0, "p0", "pistol");
    applyZombieDamage(w, id, 100, 1, 0, 0, "p1", "pistol");
    await vi.waitFor(() => expect(guest.state.players.get("p1")?.wallet).toBe(S + 2));
    expect(guest.state.players.get("p0")).toMatchObject({ wallet: S + 1, earned: 1 });
    await vi.waitFor(() => expect(moneyEvents(guestEvents)).toEqual([[1, 2, 0], [0, 1, 1]])); // [slot, amount, reason]
    w.waves.number = 2;
    w.run.phase = "wave"; // Story 3.1: the run state machine owns the phase
    downPlayer(w, player(room, "p0")); // downed players get the wave bonus too
    endWave(w);
    await vi.waitFor(() => expect(host.state.players.get("p0")?.wallet).toBe(S + 31)); // wave 2 bonus 2 × 15 (balance pass B1)
    expect(host.state.players.get("p1")).toMatchObject({ wallet: S + 32, earned: 32 });
  });

  it("a client cannot change its wallet; Back to lobby resets it and the next run starts at S again", async () => {
    const { host, guest, room } = await startTwo();
    guest.send("wallet.set" as never, { wallet: 9999 }); // no such message: dropped
    const w = world(room);
    const id = spawnZombie(w, "walker", 44, 30);
    applyZombieDamage(w, id, 100, 1, 0, 0, "p1", "pistol");
    await vi.waitFor(() => expect(guest.state.players.get("p1")?.wallet).toBe(S + 2));
    w.players.forEach((p) => downPlayer(w, p));
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    host.send(C2S.LOBBY_RETURN, {});
    await vi.waitFor(() => expect(guest.state.phase).toBe("lobby"));
    expect(guest.state.players.get("p1")).toMatchObject({ wallet: 0, earned: 0 });
    await readyAndStart([host, guest], room);
    await vi.waitFor(() => expect(guest.state.players.get("p1")?.wallet).toBe(S));
    expect(guest.state.players.get("p1")?.earned).toBe(0);
  });
});
