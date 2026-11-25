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
  downPlayer,
  skipWave,
  ticksFor,
  type PlayerState,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 3.1 integration: Start → build → (everyone Ready) → wave → build … with the real run state machine. */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

/** Two players in the lobby, Ready, started: the run is in its first build phase. Real waves. */
async function startTwo() {
  vi.stubEnv("DEV_NO_WAVES", "0");
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
  return { host, guest, room, hostEvents };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};
const kinds = (events: SimEventsFlushed[]) => events.flatMap((b) => b.events.map((t) => t[0]));

describe("RunRoom build phase (Story 3.1)", () => {
  it("starts in a 30 s build: the countdown runs on both clients, no zombies spawn, build.started is forwarded", async () => {
    const { host, guest, room, hostEvents } = await startTwo();
    const full = ticksFor(serverBalance.waves.buildPhaseS);
    await vi.waitFor(() => expect(world(room).tick).toBeGreaterThan(5));
    for (const c of [host, guest]) {
      await vi.waitFor(() => expect(c.state.buildTicksLeft).toBeLessThan(full));
      expect(c.state.buildTicksLeft).toBeGreaterThan(full - 200);
      expect(c.state.wave).toBe(0);
    }
    expect(world(room).zombies.aliveCount).toBe(0);
    await vi.waitFor(() => expect(kinds(hostEvents)).toContain(NET_EVENT_KIND.BUILD_STARTED));
    const b = hostEvents.flatMap((m) => m.events).find((t) => t[0] === NET_EVENT_KIND.BUILD_STARTED);
    expect(b).toEqual([NET_EVENT_KIND.BUILD_STARTED, 1]);
  });

  it("Ready from one player shows on both clients but keeps the build; Ready from both starts wave 1", async () => {
    const { host, guest, room } = await startTwo();
    host.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(guest.state.players.get("p0")?.buildReady).toBe(true));
    expect(guest.state.players.get("p1")?.buildReady).toBe(false);
    const tick = world(room).tick;
    await vi.waitFor(() => expect(world(room).tick).toBeGreaterThan(tick + 3));
    expect(room.state.phase).toBe("build");
    guest.send(C2S.BUILD_SET_READY, { ready: true });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("wave"));
    expect(host.state.wave).toBe(1);
    expect(host.state.buildTicksLeft).toBe(0);
    await vi.waitFor(() => expect(world(room).zombies.aliveCount).toBeGreaterThan(0));
    expect(host.state.players.get("p0")?.buildReady).toBe(false); // cleared at the wave start
  });

  it("taking Ready back keeps the build; a malformed Ready is dropped by the guard", async () => {
    const { host, guest, room } = await startTwo();
    host.send(C2S.BUILD_SET_READY, { ready: true });
    host.send(C2S.BUILD_SET_READY, { ready: false });
    host.send(C2S.BUILD_SET_READY, { ready: "yes" });
    guest.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(room.state.players.get("p1")?.buildReady).toBe(true));
    const tick = world(room).tick;
    await vi.waitFor(() => expect(world(room).tick).toBeGreaterThan(tick + 3));
    expect(room.state.phase).toBe("build");
    expect(room.state.players.get("p0")?.buildReady).toBe(false);
  });

  it("a cleared wave goes back to a build with the downed teammate returned and healed; Ready again starts wave 2", async () => {
    const { host, guest, room } = await startTwo();
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(room.state.phase).toBe("wave"));
    const w = world(room);
    w.debug.godMode = true;
    const p0 = w.players.get("p0") as PlayerState;
    p0.hp = 40;
    downPlayer(w, w.players.get("p1") as PlayerState);
    await vi.waitFor(() => expect(guest.state.players.get("p1")?.status).toBe("downed"));
    skipWave(w); // dev cheat: the wave ends now → build
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
    expect(host.state.wave).toBe(1);
    await vi.waitFor(() => expect(host.state.players.get("p1")?.status).toBe("alive"));
    expect(host.state.players.get("p1")?.hp).toBe(50);
    expect(host.state.players.get("p0")?.hp).toBe(90);
    expect(host.state.buildTicksLeft).toBeGreaterThan(ticksFor(serverBalance.waves.buildPhaseS) - 100);
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("wave"));
    expect(host.state.wave).toBe(2);
  });

  it("the one player left in a build skips it alone; Ready in the lobby does nothing", async () => {
    const { host, guest, room } = await startTwo();
    await guest.leave(true);
    await vi.waitFor(() => expect(room.members.size).toBe(1));
    host.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    // A fresh lobby ignores build.set_ready (no run, nothing to change).
    const other = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Cy"));
    record(other);
    await other.waitForInitialState();
    other.send(C2S.BUILD_SET_READY, { ready: true });
    const lobby = colyseus.getRoomById<RunRoom>(other.roomId) as unknown as RunRoom;
    await new Promise((r) => setTimeout(r, 100));
    expect(lobby.state.phase).toBe("lobby");
    expect(lobby.controller).toBeNull();
  });
});
