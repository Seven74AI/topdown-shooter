import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { randomBytes } from "node:crypto";
import { BYTES, C2S, RUN_ROOM_NAME, S2C, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 2.10: without ALLOW_TEST_SCENARIOS the host's `scenario` is ignored and the run is normal. */
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

describe("test scenario refused (Story 2.10)", () => {
  it("ignores the scenario when the server does not allow test scenarios", async () => {
    const client = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, {
      intent: "create",
      name: "Ana",
      balanceVersion: serverBalance.version,
      guestToken: randomBytes(16).toString("hex"),
      scenario: "net150",
    });
    client.onMessage(S2C.RUN_JOINED, () => {});
    client.onMessage(S2C.SIM_EVENTS_FLUSHED, () => {});
    client.onMessage(S2C.NET_PINGED, () => {});
    client.onMessage(BYTES.HORDE_FRAME, () => {});
    await client.waitForInitialState();
    const room = colyseus.getRoomById<RunRoom>(client.roomId) as unknown as RunRoom;
    expect(room.scenario).toBeNull();
    client.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect(room.state.players.get("p0")?.ready).toBe(true));
    client.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(room.controller).not.toBeNull());
    expect(room.controller?.world.debug.godMode).toBe(false);
    expect(room.controller?.world.waves.number).toBe(0);
    expect(room.state.scenario).toBe("");
  });
});
