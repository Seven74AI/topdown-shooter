import { ColyseusTestServer } from "@colyseus/testing";
import { createServer } from "node:net";
import { createGameServer, type GameServerOptions } from "../app";
import { roomCreateLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";

/**
 * Starts the real game server for an integration test file on a free port the OS picks, because
 * `@colyseus/testing`'s `boot()` always listens on 2568, and fixed ports collide when two test
 * runs share the machine (parallel agents in worktrees).
 * Logs are silent unless `LOG_LEVEL` is set. Call `shutdown()` in `afterAll`. Solo starts are
 * allowed by default, as in dev; a test can flip `room.allowSoloStart` on a live room.
 * `cleanup()` (call it in `afterEach`) also resets the per-IP room creation limit (Story 2.2), so
 * tests creating many rooms from 127.0.0.1 don't hit it.
 */
export async function bootTestServer(
  options: GameServerOptions = {},
): Promise<{ colyseus: ColyseusTestServer; port: number }> {
  log.level = process.env.LOG_LEVEL ?? "silent";
  const port = await freePort();
  const server = createGameServer({ allowSoloStart: true, ...options });
  await server.listen(port, "127.0.0.1");
  const colyseus = new ColyseusTestServer(server);
  const cleanup = colyseus.cleanup.bind(colyseus);
  colyseus.cleanup = async () => {
    roomCreateLimiter.reset();
    await cleanup();
  };
  roomCreateLimiter.reset();
  return { colyseus, port };
}

/** A port that was free a moment ago (bind to 0, read it, close). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}
