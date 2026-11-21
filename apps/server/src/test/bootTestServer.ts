import { ColyseusTestServer } from "@colyseus/testing";
import { createGameServer, type GameServerOptions } from "../app";
import { roomCreateLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";

/**
 * Starts the real game server for an integration test file. One port per Vitest worker, because
 * `@colyseus/testing`'s `boot()` always listens on 2568 and collides across parallel files.
 * Logs are silent unless `LOG_LEVEL` is set. Call `shutdown()` in `afterAll`.
 * `cleanup()` (call it in `afterEach`) also resets the per-IP room creation limit (Story 2.2), so
 * tests creating many rooms from 127.0.0.1 don't hit it.
 */
export async function bootTestServer(
  options: GameServerOptions = {},
): Promise<{ colyseus: ColyseusTestServer; port: number }> {
  log.level = process.env.LOG_LEVEL ?? "silent";
  const port = 2600 + Number(process.env.VITEST_POOL_ID ?? 0);
  const server = createGameServer(options);
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
