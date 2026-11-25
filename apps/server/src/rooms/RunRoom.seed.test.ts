import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION, DOWNTOWN_MAP, BYTES, C2S, RUN_ROOM_NAME, S2C, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { JOIN_REFUSED_CODE, RunRoom, serverBalance } from "./RunRoom";

/** Story 4.4 integration: the run seed reaches every client through the state; the dev seed switch. */
let colyseus: ColyseusTestServer;
const savedSwitch = process.env.DEV_ALLOW_RUN_SEED;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (savedSwitch === undefined) delete process.env.DEV_ALLOW_RUN_SEED;
  else process.env.DEV_ALLOW_RUN_SEED = savedSwitch;
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

type RunSdkRoom = SdkRoom<unknown, RunStateView>;

const options = (extra: Record<string, unknown> = {}) => ({
  intent: "create" as const,
  name: "Ana",
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken: randomBytes(16).toString("hex"),
  ...extra,
});

function quiet(client: RunSdkRoom): void {
  for (const t of [S2C.RUN_JOINED, BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED]) client.onMessage(t, () => {});
}

async function soloRun(extra: Record<string, unknown> = {}) {
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options(extra));
  quiet(host);
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  host.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect(room.state.players.get("p0")?.ready).toBe(true));
  host.send(C2S.RUN_START, {});
  await vi.waitFor(() => expect(host.state.phase).toBe("build"));
  return { host, room };
}

describe("run seed online (Story 4.4)", () => {
  it("every client gets the server's run seed in the state (a random one by default)", async () => {
    delete process.env.DEV_ALLOW_RUN_SEED;
    const { host, room } = await soloRun();
    const seed = room.controller?.world.seed as number;
    expect(host.state.runSeed).toBe(seed);
    expect(room.devRunSeed).toBeNull();
  });

  it("DEV_ALLOW_RUN_SEED=1 + the host's devRunSeed: the run uses that seed", async () => {
    process.env.DEV_ALLOW_RUN_SEED = "1";
    const { host, room } = await soloRun({ devRunSeed: 4242 });
    expect(room.controller?.world.seed).toBe(4242);
    await vi.waitFor(() => expect(host.state.runSeed).toBe(4242));
  });

  it("without the switch the host's seed is ignored, the run gets its own", async () => {
    delete process.env.DEV_ALLOW_RUN_SEED;
    const { host, room } = await soloRun({ devRunSeed: 4242 });
    expect(room.devRunSeed).toBeNull();
    const seed = room.controller?.world.seed as number;
    expect(host.state.runSeed).toBe(seed);
  });

  it("refuses a malformed devRunSeed with invalid_options", async () => {
    for (const devRunSeed of [-1, 1.5, 2 ** 32, "7"]) {
      const e = (await colyseus.sdk.create(RUN_ROOM_NAME, options({ devRunSeed })).then(
        () => null,
        (err: unknown) => err,
      )) as { code: number; message: string } | null;
      expect(e?.code).toBe(JOIN_REFUSED_CODE);
      expect(e?.message).toBe("invalid_options");
    }
  });
});
