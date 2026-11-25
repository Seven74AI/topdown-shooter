import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CloseCode } from "@colyseus/core";
import type { ColyseusTestServer } from "@colyseus/testing";
import {
  NET_PROTOCOL_VERSION, DOWNTOWN_MAP, RUN_ROOM_NAME, S2C, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { SERVER_RESTARTING_MESSAGE, serverBalance } from "../rooms/RunRoom";

/** Story 2.2 AC 5: a stop or redeploy closes every room with "Server restarting" and code 4001. */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer());
});
afterAll(async () => {
  await colyseus.shutdown(); // no-op once the test below shut it down
});

describe("graceful shutdown", () => {
  it("tells connected players the server is restarting, then closes with 4001", async () => {
    const client = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, {
      intent: "create",
      name: "Ana",
      balanceVersion: serverBalance.version,
      mapVersion: DOWNTOWN_MAP.version,
      netProtocolVersion: NET_PROTOCOL_VERSION,
      guestToken: "0123456789abcdef0123456789abcdef", // required since Story 2.3
    });
    await client.waitForInitialState();
    const message = new Promise<unknown>((resolve) => client.onMessage(S2C.SERVER_SHUTDOWN_STARTED, resolve));
    const left = new Promise<number>((resolve) => client.onLeave((code) => resolve(code)));

    await colyseus.server.gracefullyShutdown(false);

    expect(await message).toEqual({ message: SERVER_RESTARTING_MESSAGE });
    expect(await left).toBe(CloseCode.SERVER_SHUTDOWN);
    expect(SERVER_RESTARTING_MESSAGE).toBe("Server restarting");
  });
});
