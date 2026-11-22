import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  BYTES,
  C2S,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  RUN_ROOM_NAME,
  S2C,
  TICK_DT_S,
  downPlayer,
  killZombie,
  spawnZombie,
  type PlayerState,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 2.8 integration: team wipe → Results → Back to lobby → a second run in the same room. */
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
  for (const c of clients) await vi.waitFor(() => expect(c.state.phase).toBe("wave"));
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
const kinds = (events: SimEventsFlushed[]) => events.flatMap((b) => b.events.map((t) => t[0]));

describe("RunRoom downed and team wipe (Story 2.8)", () => {
  it("counts kills per player, and a wipe sets phase results and resultWave for everyone, then stops the World", async () => {
    const { host, guest, room, guestEvents } = await startTwo();
    const w = world(room);
    const ids = [0, 1, 2].map((k) => spawnZombie(w, "walker", 3 + k, 3));
    await vi.waitFor(() => expect(w.tick).toBeGreaterThan(2));
    killZombie(w, ids[0] as number, "p0", "pistol");
    killZombie(w, ids[1] as number, "p0", "pistol");
    killZombie(w, ids[2] as number, "p1", "smg");
    await vi.waitFor(() => expect(guest.state.players.get("p0")?.kills).toBe(2));
    expect(guest.state.players.get("p1")?.kills).toBe(1);

    w.waves.number = 3;
    downPlayer(w, player(room, "p0"));
    await vi.waitFor(() => expect(guest.state.players.get("p0")?.status).toBe("downed"));
    expect(guest.state.players.get("p0")?.downedTicksLeft).toBeGreaterThan(0);
    expect(room.state.phase).toBe("wave");
    downPlayer(w, player(room, "p1"));
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("results"));
    expect(guest.state.resultWave).toBe(3);
    await vi.waitFor(() => expect(kinds(guestEvents)).toContain(NET_EVENT_KIND.TEAM_WIPED));
    expect(kinds(guestEvents).filter((k) => k === NET_EVENT_KIND.PLAYER_DOWNED)).toHaveLength(2);
    const tick = w.tick;
    await new Promise((r) => setTimeout(r, 200));
    expect(w.tick).toBe(tick); // no more ticks in Results
  });

  it("lobby.return is ignored during the fight, and from any member in results resets the room to the lobby", async () => {
    const { host, guest, room } = await startTwo();
    guest.send(C2S.LOBBY_RETURN, {});
    await new Promise((r) => setTimeout(r, 150));
    expect(room.state.phase).toBe("wave");
    const w = world(room);
    w.players.forEach((p) => downPlayer(w, p));
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    guest.send(C2S.LOBBY_RETURN, {}); // not the host
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("lobby"));
    expect(room.controller).toBeNull();
    expect(room.state.hostSlot).toBe(0);
    expect(guest.state.resultWave).toBe(0);
    for (const [id, slot, name] of [["p0", 0, "Ana"], ["p1", 1, "Bo"]] as const) {
      expect(guest.state.players.get(id)).toMatchObject({ slot, name, ready: false, kills: 0, status: "alive", downedTicksLeft: 0 });
    }
    expect(room.members.size).toBe(2);
  });

  it("after Back to lobby, Ready + Start runs a fresh run in the same room (inputs, events, a second wipe)", async () => {
    const { host, guest, room, guestEvents } = await startTwo();
    const w1 = world(room);
    w1.players.forEach((p) => downPlayer(w1, p));
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    host.send(C2S.LOBBY_RETURN, {});
    await vi.waitFor(() => expect(guest.state.phase).toBe("lobby"));
    host.send(C2S.RUN_START, {}); // nobody Ready yet: refused
    await new Promise((r) => setTimeout(r, 100));
    expect(room.state.phase).toBe("lobby");

    guestEvents.length = 0;
    await readyAndStart([host, guest], room);
    const w2 = world(room);
    expect(w2).not.toBe(w1);
    expect(player(room, "p0").status).toBe("alive");
    const x0 = player(room, "p0").x;
    for (let seq = 1; seq <= 10; seq++) {
      host.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq, moveX: 1, aimX: 1, fire: true });
      await new Promise((r) => setTimeout(r, TICK_DT_S * 1000));
    }
    await vi.waitFor(() => expect(guest.state.players.get("p0")?.ackSeq).toBe(10));
    expect(player(room, "p0").x).toBeGreaterThan(x0 + 1);
    await vi.waitFor(() => expect(kinds(guestEvents)).toContain(NET_EVENT_KIND.WEAPON_FIRED));
    expect(guestEvents[0]?.tick).toBeLessThan(40); // run 2's ticks start again from 1

    w2.players.forEach((p) => downPlayer(w2, p));
    await vi.waitFor(() => expect(guest.state.phase).toBe("results"));
  });

  it("an out player's horde view follows the lowest-slot standing teammate", async () => {
    const { room } = await startTwo();
    const p0 = player(room, "p0");
    const p1 = player(room, "p1");
    expect(room.viewTargetFor("p0")).toBe(p0);
    p0.status = "out";
    expect(room.viewTargetFor("p0")).toBe(p1);
    p1.status = "downed";
    expect(room.viewTargetFor("p0")).toBe(p0); // nobody standing: their own spot
    expect(room.viewTargetFor("p1")).toBe(p1);
  });
});
