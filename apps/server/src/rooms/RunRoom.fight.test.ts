import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  C2S,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  RUN_ROOM_NAME,
  S2C,
  TICK_DT_S,
  type NetPinged,
  type PlayerInput,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { MAX_TICK_ERRORS_IN_A_ROW, RunRoom, TICK_ERROR_MESSAGE, serverBalance } from "./RunRoom";

/** Story 2.4 integration: the server runs the fight. */
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

/** Every fight message a client gets, so tests can wait on them (and the SDK never warns). */
function record(client: RunSdkRoom) {
  const got = { events: [] as SimEventsFlushed[], pings: [] as NetPinged[], shutdown: [] as { message: string }[] };
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => got.events.push(m));
  client.onMessage(S2C.NET_PINGED, (m: NetPinged) => got.pings.push(m));
  client.onMessage(S2C.SERVER_SHUTDOWN_STARTED, (m: { message: string }) => got.shutdown.push(m));
  return got;
}

/** Host + guests, all Ready, started. Waves paused (DEV_NO_WAVES), so nothing else moves. */
async function startRun(players = 2) {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  const clients = [host];
  const got = [record(host)];
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  for (let i = 1; i < players; i++) {
    const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", `G${i}`));
    got.push(record(guest));
    await guest.waitForInitialState();
    clients.push(guest);
  }
  for (const c of clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  await vi.waitFor(() => expect(room.controller).not.toBeNull());
  for (const c of clients) await vi.waitFor(() => expect(c.state.phase).toBe("wave"));
  return { clients, got, room };
}

async function startTwo() {
  const { clients, got, room } = await startRun(2);
  return { host: clients[0] as RunSdkRoom, guest: clients[1] as RunSdkRoom, room, hostGot: got[0] as ReturnType<typeof record>, guestGot: got[1] as ReturnType<typeof record> };
}

/** Sends `count` inputs, one per 50 ms step, like the client. */
async function sendInputs(client: RunSdkRoom, count: number, over: Partial<PlayerInput>): Promise<void> {
  for (let seq = 1; seq <= count; seq++) {
    client.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq, ...over });
    await new Promise((r) => setTimeout(r, TICK_DT_S * 1000));
  }
}

describe("RunRoom fight (Story 2.4)", () => {
  it("both clients see p0 move ~4.5 m after 20 inputs, with ackSeq 20, wave and aliveCount", async () => {
    const { host, guest, room } = await startTwo();
    const x0 = guest.state.players.get("p0")?.x ?? Number.NaN;
    const world0 = room.controller?.world.players.get("p0")?.x;
    expect(x0).toBeCloseTo(world0 ?? 0, 4); // spawn position arrived with phase "wave"
    expect(guest.state.players.get("p1")?.x).toBeGreaterThan(x0); // slot 1 spawns to the right
    const t0 = performance.now();
    await sendInputs(host, 20, { moveX: 1 });
    for (const c of [host, guest]) {
      await vi.waitFor(() => expect(c.state.players.get("p0")?.ackSeq).toBe(20), { timeout: 1200 });
      expect((c.state.players.get("p0")?.x ?? 0) - x0).toBeCloseTo(4.5, 0);
      expect(Math.abs((c.state.players.get("p0")?.x ?? 0) - x0 - 4.5)).toBeLessThanOrEqual(0.3);
    }
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(guest.state.players.get("p1")?.ackSeq).toBe(0); // p1 sent nothing: held still
    expect(guest.state.aliveCount).toBe(2);
    expect(guest.state.wave).toBe(0);
    expect(guest.state.tick).toBeGreaterThan(20);
    expect(guest.state.players.get("p0")).toMatchObject({ hp: 100, maxHp: 100, status: "alive", weapon0: "pistol", weapon1: "" });
  });

  it("forwards sim events to every client as tuples, with the tick", async () => {
    const { host, hostGot, guestGot } = await startTwo();
    await sendInputs(host, 3, { aimX: 1, fire: true });
    await vi.waitFor(() => expect(guestGot.events.length).toBeGreaterThan(0));
    const batch = guestGot.events[0] as SimEventsFlushed;
    expect(batch.tick).toBeGreaterThan(0);
    const fired = batch.events.find((t) => t[0] === NET_EVENT_KIND.WEAPON_FIRED);
    expect(fired?.[1]).toBe(0); // slot 0
    await vi.waitFor(() => expect(hostGot.events.length).toBeGreaterThan(0));
  });

  it("pings every second, measures RTT from the pong and gives it to the controller", async () => {
    const { host, room, hostGot } = await startTwo();
    await vi.waitFor(() => expect(hostGot.pings.length).toBe(1), { timeout: 1500 });
    const ping = hostGot.pings[0] as NetPinged;
    expect(ping).toEqual({ id: 1, rttMs: 0 });
    host.send(C2S.NET_PONG, { id: ping.id });
    host.send(C2S.NET_PONG, { id: ping.id }); // a repeat is ignored
    await vi.waitFor(() => expect(room.controller?.rttMs("p0")).toBeGreaterThan(0));
    const member = [...room.members.values()].find((m) => m.playerId === "p0");
    expect(member?.rttMs).toBe(room.controller?.rttMs("p0"));
    expect(member?.rttMs).toBeLessThan(200);
  });

  it("removes a player who leaves mid-run from the World and the state", async () => {
    const { guest, host, room } = await startTwo();
    await guest.leave(true);
    await vi.waitFor(() => expect(room.controller?.world.players.has("p1")).toBe(false));
    await vi.waitFor(() => expect(host.state.players.has("p1")).toBe(false));
    await vi.waitFor(() => expect(host.state.aliveCount).toBe(1));
    expect(room.controller?.world.players.has("p0")).toBe(true);
  });

  it("logs tick exceptions with method and tick, keeps going, and closes after 20 in a row", async () => {
    const { host, room, hostGot } = await startTwo();
    const error = vi.spyOn(room.log, "error");
    const controller = room.controller;
    if (!controller) throw new Error("no controller");
    const tick = vi.spyOn(controller, "tick").mockImplementation(() => {
      throw new Error("boom");
    });
    await vi.waitFor(() => expect(hostGot.shutdown.length).toBe(1), { timeout: 3000 });
    expect(hostGot.shutdown[0]).toEqual({ message: TICK_ERROR_MESSAGE });
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(MAX_TICK_ERRORS_IN_A_ROW);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ method: "setFixedTimestep", tick: expect.any(Number) }), "room_exception");
    await vi.waitFor(() => expect(host.connection.isOpen).toBe(false));
  });

  it("a successful tick resets the error count", async () => {
    const { room, hostGot } = await startTwo();
    const controller = room.controller;
    if (!controller) throw new Error("no controller");
    const real = controller.tick.bind(controller);
    let n = 0;
    vi.spyOn(room.log, "error").mockImplementation(() => undefined);
    vi.spyOn(controller, "tick").mockImplementation(() => {
      n++;
      if (n % 10 === 0) return real(); // 9 failures, then one good tick
      throw new Error("flaky");
    });
    await vi.waitFor(() => expect(n).toBeGreaterThanOrEqual(30), { timeout: 3000 });
    expect(hostGot.shutdown).toEqual([]);
  });

  it("measures the live room tick with 4 clients and 150 Walkers", async () => {
    const { clients, room } = await startRun(4);
    const controller = room.controller;
    if (!controller) throw new Error("no controller");
    const world = controller.world;
    world.debug.godMode = true;
    const { spawnZombie } = await import("@topdown/shared");
    for (let i = 0; world.zombies.aliveCount < 150 && i < 1000; i++) {
      const sp = world.map.spawnPoints[i % world.map.spawnPoints.length];
      if (sp) spawnZombie(world, "walker", sp.x + (i % 7) * 0.3, sp.y, true);
    }
    const before = room.slowTicks?.ticks ?? 0;
    const totalBefore = room.slowTicks?.totalMs ?? 0;
    if (room.slowTicks) room.slowTicks.maxMs = 0;
    await Promise.all(clients.map((c, i) => sendInputs(c, 40, { moveX: i % 2 ? 0.5 : -0.5, moveY: i < 2 ? 0.5 : -0.5, aimX: i % 2 ? 1 : -1, fire: true })));
    const ticks = (room.slowTicks?.ticks ?? 0) - before;
    const mean = ((room.slowTicks?.totalMs ?? 0) - totalBefore) / ticks;
    expect(world.players.size).toBe(4);
    console.log(`[live tick] 4 clients, ${world.zombies.aliveCount} Walkers alive at end, ${ticks} ticks: mean ${mean.toFixed(3)} ms, max ${room.slowTicks?.maxMs.toFixed(3)} ms`);
    expect(ticks).toBeGreaterThan(30);
    expect(mean).toBeLessThan(5);
  });

  it("observes every tick for the slow-tick log", async () => {
    const { room } = await startTwo();
    await vi.waitFor(() => expect(room.slowTicks?.ticks).toBeGreaterThan(5));
    expect(room.slowTicks?.maxMs).toBeLessThan(40);
  });
});
