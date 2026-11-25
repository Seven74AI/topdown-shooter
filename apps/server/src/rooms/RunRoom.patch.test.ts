import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import { BYTES, C2S, DOWNTOWN_MAP, NET_PROTOCOL_VERSION, RUN_ROOM_NAME, S2C, hordeFrameTick, startWave, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { serverBalance, type RunRoom } from "./RunRoom";

/**
 * Story 8.11 (AC 1, F3): the state patch comes from the tick. During stepping each patch carries exactly one tick
 * (never 0, never 2), after that tick's horde frame (decision D3: horde, events, then the patch); outside the
 * stepping phases (here: Results → Back to lobby) the room still patches promptly at ≤ 20 Hz. The 8.1 frozen room's
 * `frozen`/`resumeIn` patches are covered by RunRoom.reconnect.test.ts (the 3-2-1 counts reach the phone).
 */
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

const quiet = (c: RunSdkRoom): void => {
  for (const t of [S2C.RUN_JOINED, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.SHOP_OFFERED, S2C.RUN_STARTED]) c.onMessage(t, () => {});
};

/** Host + guest, Ready, started (waves paused: the build phase steps; a test starts a wave by hand). */
async function startRun(onHorde?: (b: Uint8Array) => void) {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  quiet(host);
  host.onMessage(BYTES.HORDE_FRAME, (b: Uint8Array) => onHorde?.(b));
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
  quiet(guest);
  guest.onMessage(BYTES.HORDE_FRAME, () => {});
  await guest.waitForInitialState();
  for (const c of [host, guest]) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.state.players.values()].every((p) => p.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  await vi.waitFor(() => expect(room.controller).not.toBeNull());
  for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return { host, guest, room };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Story 8.11 one patch per tick (F3)", () => {
  it("during a wave every patch is exactly one tick after the last (server and phone), after that tick's horde frame", async () => {
    const seen: string[] = [];
    const { host, room } = await startRun((b) => seen.push(`h${hordeFrameTick(b)}`));
    const world = room.controller?.world;
    if (!world) throw new Error("no run");
    startWave(world);
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    const serverTicks: number[] = [];
    const patch = room.broadcastPatch.bind(room);
    vi.spyOn(room, "broadcastPatch").mockImplementation(() => {
      serverTicks.push(world.tick);
      return patch();
    });
    const phoneTicks: number[] = [];
    host.onStateChange((s) => {
      phoneTicks.push(s.tick);
      seen.push(`p${s.tick}`);
    });
    await sleep(1500);
    expect(room.patchRate).toBeNull(); // the tick patches; no Colyseus patch interval runs
    expect(room.autoBatchMessages).toBe(true); // D2: one socket write per tick
    // Liveness: ~30 ticks in 1.5 s (a busy box: ≥ 15).
    expect(serverTicks.length).toBeGreaterThanOrEqual(15);
    expect(phoneTicks.length).toBeGreaterThanOrEqual(15);
    const steps = (ticks: number[]) => ticks.slice(1).map((t, i) => t - (ticks[i] as number));
    expect(new Set(steps(serverTicks))).toEqual(new Set([1])); // mutation "patch twice per tick" → a 0 here
    expect(new Set(steps(phoneTicks))).toEqual(new Set([1]));
    // D3: each patch's tick had its horde frame first (same write, same order).
    for (const t of phoneTicks.slice(1)) expect(seen.indexOf(`h${t}`), `horde ${t} before patch ${t}`).toBeLessThan(seen.indexOf(`p${t}`));
  });

  it("outside the stepping phases (Results → Back to lobby) a Ready tap still reaches the other phone within 150 ms", async () => {
    const { host, guest, room } = await startRun();
    room.state.phase = "results"; // what endRun sets; nothing steps any more
    await vi.waitFor(() => expect(guest.state.phase).toBe("results"));
    guest.send(C2S.LOBBY_RETURN, {});
    await vi.waitFor(() => expect(host.state.phase).toBe("lobby"));
    expect(room.patchRate).toBeNull(); // still patched by the timestep, not by an interval
    const guestId = [...room.members.values()].find((m) => m.slot === 1)?.playerId ?? "";
    expect(host.state.players.get(guestId)?.ready).toBe(false);
    const t0 = performance.now();
    guest.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect(host.state.players.get(guestId)?.ready).toBe(true), { timeout: 2000, interval: 5 });
    expect(performance.now() - t0).toBeLessThan(150); // ≤ 50 ms patch + the local round trip (brief list 5: < 100 ms + slack)
  });
});
