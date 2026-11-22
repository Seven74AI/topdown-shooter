import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  BYTES,
  ByteRate,
  C2S,
  NET150_START_WAVE,
  RUN_ROOM_NAME,
  S2C,
  attachByteCounters,
  endWave,
  killZombie,
  spawnZombie,
  type RunStateView,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance, type RunClient } from "./RunRoom";

/**
 * Story 2.10: byte counters, `net_stats` / `tick_stats`, and the `net150` test scenario on a server
 * that allows test scenarios (the refusal is in RunRoom.scenario.test.ts: the matchmaker is one per
 * process, so one test file can't hold both room definitions).
 */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer({ allowTestScenarios: true }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

type RunSdkRoom = SdkRoom<unknown, RunStateView>;

const options = (intent: "create" | "join", name: string, extra: Record<string, unknown> = {}) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  guestToken: randomBytes(16).toString("hex"),
  ...extra,
});

function quiet(client: RunSdkRoom): void {
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, () => {});
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.PLAYER_LEFT, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
}

async function create(server: ColyseusTestServer, extra: Record<string, unknown> = {}) {
  const client = await server.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana", extra));
  quiet(client);
  await client.waitForInitialState();
  const room = server.getRoomById<RunRoom>(client.roomId) as unknown as RunRoom;
  await vi.waitFor(() => expect(room.members.size).toBe(1));
  return { client, room };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("byte counters (Story 2.10)", () => {
  it("counts a state patch the server sends, byte for byte what the client receives", async () => {
    const { client, room } = await create(colyseus);
    const meters = [...room.netMeters.values()][0];
    if (!meters) throw new Error("no meters");
    const down = new ByteRate();
    const up = new ByteRate();
    const detach = attachByteCounters(client as unknown as Parameters<typeof attachByteCounters>[0], down, up, () => performance.now());
    await sleep(150); // the lobby is quiet: no pings, no ticks
    const out0 = meters.out.totalBytes;
    const down0 = down.totalBytes;
    const serverClient = room.clients[0] as RunClient;
    room.onSetReady(serverClient, true); // a state change with no message: only the patch goes out
    await vi.waitFor(() => expect(client.state.players.get("p0")?.ready).toBe(true));
    await sleep(120);
    const patchBytes = meters.out.totalBytes - out0;
    expect(patchBytes).toBeGreaterThan(0);
    expect(down.totalBytes - down0).toBe(patchBytes);
    detach();
  });

  it("counts what the client sends, the same as the client's own up counter", async () => {
    const { client, room } = await create(colyseus);
    const meters = [...room.netMeters.values()][0];
    if (!meters) throw new Error("no meters");
    const down = new ByteRate();
    const up = new ByteRate();
    const detach = attachByteCounters(client as unknown as Parameters<typeof attachByteCounters>[0], down, up, () => performance.now());
    await sleep(100);
    const in0 = meters.in.totalBytes;
    client.send(C2S.LOBBY_SET_READY, { ready: true });
    client.send(C2S.LOBBY_SET_READY, { ready: false });
    await vi.waitFor(() => expect(meters.in.totalMessages).toBeGreaterThanOrEqual(2));
    await sleep(50);
    expect(up.totalMessages).toBe(2);
    expect(meters.in.totalBytes - in0).toBe(up.totalBytes);
    detach();
    expect((client as unknown as { connection: { send: unknown } }).connection.send).toBeDefined();
  });

  it("logs net_stats per player and tick_stats on wave.ended", async () => {
    vi.stubEnv("DEV_NO_WAVES", "1");
    const { client, room } = await create(colyseus);
    client.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect(room.state.players.get("p0")?.ready).toBe(true));
    client.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(room.controller).not.toBeNull());
    await sleep(300); // a few ticks, patches and horde frames
    const info = vi.spyOn(room.log, "info");
    const world = room.controller?.world;
    if (!world) throw new Error("no world");
    endWave(world);
    await vi.waitFor(() => expect(info.mock.calls.some((c) => c[1] === "net_stats")).toBe(true));
    const net = info.mock.calls.find((c) => c[1] === "net_stats")?.[0] as Record<string, unknown>;
    expect(net).toMatchObject({ playerId: "p0", wave: 0 });
    expect(net.avgOutKBps).toBeGreaterThan(0);
    expect(net.peakOutKBps).toBeGreaterThanOrEqual(0);
    expect(typeof net.avgInKBps).toBe("number");
    expect(typeof net.rttMs).toBe("number");
    const tick = info.mock.calls.find((c) => c[1] === "tick_stats")?.[0] as Record<string, unknown>;
    expect(tick.ticks).toBeGreaterThan(0);
    expect(tick.tickAvgMs).toBeGreaterThanOrEqual(0);
    expect(tick.tickMaxMs).toBeGreaterThanOrEqual(tick.tickAvgMs as number);
    expect(tick).toHaveProperty("patchAvgMs");
  });

  it("restarts every per-wave counter at wave.started: bytes sent in the break are not in the next wave", async () => {
    vi.stubEnv("DEV_NO_WAVES", "1");
    const { client, room } = await create(colyseus);
    client.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect(room.state.players.get("p0")?.ready).toBe(true));
    client.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(room.controller).not.toBeNull());
    const world = room.controller?.world;
    const me = world?.players.get("p0");
    if (!world || !me) throw new Error("no world");
    world.debug.godMode = true;
    const info = vi.spyOn(room.log, "info");
    const lines = (msg: string) => info.mock.calls.filter((c) => c[1] === msg).map((c) => c[0] as Record<string, number>);
    // The break: 150 zombies around the player for 2.2 s, so every horde frame and second is heavy.
    for (let i = 0; i < 150; i++) spawnZombie(world, "walker", me.x + 2 + (i % 15) * 0.3, me.y - 3 + Math.floor(i / 15) * 0.6);
    await sleep(2200);
    // Wave 2 starts with no zombies left and lasts ~1.5 s: only empty horde frames and small patches.
    for (let i = world.zombies.aliveCount - 1; i >= 0; i--) killZombie(world, world.zombies.aliveIds[i] as number, null, "cheat");
    world.events.emit({ type: "wave.started", number: 2, size: 0 });
    await sleep(1600);
    endWave(world);
    await vi.waitFor(() => expect(lines("tick_stats")).toHaveLength(1));
    const net = lines("net_stats")[0] as Record<string, number>;
    const horde = lines("horde_stats")[0] as Record<string, number>;
    const tick = lines("tick_stats")[0] as Record<string, number>;
    // The break ran at ~20 KB/s of horde frames: none of it may show in wave 2.
    expect(net.avgOutKBps).toBeLessThan(2);
    expect(net.peakOutKBps).toBeLessThan(2);
    expect(net.hordeKBps).toBeLessThan(1);
    expect(horde.avgBytes).toBeLessThan(50); // empty frames (6 B + 2 B header), not 150-zombie ones
    expect(horde.framesSent).toBeLessThan(45); // ~1.6 s of frames, not 3.8 s
    expect(tick.ticks).toBeLessThan(45);
    expect(tick.peakZombiesAlive).toBe(0);
  });

  it("refuses server-only room options sent as join options", async () => {
    for (const extra of [{ allowTestScenarios: true }, { allowSoloStart: true }]) {
      await expect(colyseus.sdk.create(RUN_ROOM_NAME, options("create", "Ana", extra))).rejects.toThrow("invalid_options");
    }
  });
});

describe("test scenario net150 (Story 2.10)", () => {
  it("starts at wave 4 in god mode when the server allows test scenarios, and tags the state", async () => {
    const { client, room } = await create(colyseus, { scenario: "net150" });
    expect(room.scenario).toBe("net150");
    const info = vi.spyOn(room.log, "info");
    client.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect(room.state.players.get("p0")?.ready).toBe(true));
    client.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(room.controller).not.toBeNull());
    const world = room.controller?.world;
    expect(world?.debug.godMode).toBe(true);
    expect(world?.waves.number).toBe(NET150_START_WAVE - 1);
    expect(info.mock.calls.some((c) => c[1] === "test_scenario_started" && (c[0] as { scenario: string }).scenario === "net150")).toBe(true);
    await vi.waitFor(() => expect(client.state.scenario).toBe("net150"));
  });

  it("refuses a scenario name that does not exist", async () => {
    await expect(colyseus.sdk.create(RUN_ROOM_NAME, options("create", "Ana", { scenario: "god" }))).rejects.toThrow("invalid_options");
  });
});
