import { request } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client, MatchMakeError } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import { RUN_ROOM_NAME, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { log } from "../ops/logger";
import { JOIN_REFUSED_CODE, serverBalance } from "../rooms/RunRoom";
import { MAX_ROOM_CREATES_PER_MIN } from "./limits";

/**
 * Story 2.2 at the edge of the server: the WebSocket Origin check (AC 2) and the per-IP room
 * creation limit, keyed by the `X-Real-IP` header Caddy sets from Cloudflare's `Cf-Connecting-Ip`
 * (AC 3).
 */
const GAME_ORIGIN = "https://hordes.sevend.io";

let colyseus: ColyseusTestServer;
let port: number;

beforeAll(async () => {
  ({ colyseus, port } = await bootTestServer({ allowedOrigins: [GAME_ORIGIN] }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await colyseus.cleanup(); // also resets the creation limiter
});
afterAll(async () => {
  await colyseus.shutdown();
});

// guestToken: required since Story 2.3 (a fixed one is fine: every create makes its own room).
const createOptions = { intent: "create", name: "Ana", balanceVersion: serverBalance.version, guestToken: "0123456789abcdef0123456789abcdef" };

/** An SDK client that sends these headers on matchmaking and on the WebSocket (Node only). */
const sdkWith = (headers: Record<string, string>) => new Client(`http://127.0.0.1:${port}`, { headers });

/** Raw WebSocket upgrade; resolves with the HTTP status the server answered (101 = upgraded). */
function upgradeStatus(headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path: "/anything",
      headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", ...headers },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

async function refusal(promise: Promise<unknown>): Promise<MatchMakeError> {
  const e = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(e).toBeInstanceOf(MatchMakeError);
  return e as MatchMakeError;
}

describe("WebSocket Origin check", () => {
  it("refuses an upgrade from another origin with 403", async () => {
    expect(await upgradeStatus({ Origin: "https://evil.example" })).toBe(403);
  });

  it("refuses an upgrade without an Origin", async () => {
    expect(await upgradeStatus({})).toBe(403);
  });

  it("lets the game's origin through the check", async () => {
    // Past the check, the transport handles the (unknown) path itself; anything but 403 is fine.
    expect(await upgradeStatus({ Origin: GAME_ORIGIN })).not.toBe(403);
  });

  it("a client on the game's origin creates and connects to a run", async () => {
    const room = await sdkWith({ Origin: GAME_ORIGIN }).create<RunStateView>(RUN_ROOM_NAME, createOptions);
    await room.waitForInitialState();
    expect(room.connection.isOpen).toBe(true);
    await room.leave(true);
  });

  it("a client on another origin cannot open the room's WebSocket", async () => {
    const create = sdkWith({ Origin: "https://evil.example" }).create(RUN_ROOM_NAME, createOptions);
    await expect(create).rejects.toBeDefined();
  });
});

describe("Room creation limit per IP", () => {
  it(`refuses the ${MAX_ROOM_CREATES_PER_MIN + 1}th create in a minute from one X-Real-IP, not another IP`, async () => {
    const warn = vi.spyOn(log, "warn");
    const a = sdkWith({ Origin: GAME_ORIGIN, "X-Real-IP": "1.2.3.4" });
    for (let i = 0; i < MAX_ROOM_CREATES_PER_MIN; i++) {
      const room = await a.create(RUN_ROOM_NAME, createOptions);
      await room.leave(true);
    }
    const e = await refusal(a.create(RUN_ROOM_NAME, createOptions));
    expect(e.code).toBe(JOIN_REFUSED_CODE);
    expect(e.message).toBe("rate_limited");
    expect(warn).toHaveBeenCalledWith({ ip: "1.2.3.4" }, "room_create_rate_limited");

    const b = sdkWith({ Origin: GAME_ORIGIN, "X-Real-IP": "5.6.7.8" });
    const room = await b.create(RUN_ROOM_NAME, createOptions);
    expect(room.roomId).toHaveLength(4);
    await room.leave(true);
  });

  it("does not count refused (invalid) creates", async () => {
    const a = sdkWith({ Origin: GAME_ORIGIN, "X-Real-IP": "9.9.9.9" });
    for (let i = 0; i < MAX_ROOM_CREATES_PER_MIN + 2; i++) {
      const e = await refusal(a.create(RUN_ROOM_NAME, { ...createOptions, name: "" }));
      expect(e.message).toBe("invalid_options");
    }
    const room = await a.create(RUN_ROOM_NAME, createOptions);
    await room.leave(true);
  });
});
