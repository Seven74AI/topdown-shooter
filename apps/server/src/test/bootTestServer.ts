import { ColyseusTestServer } from "@colyseus/testing";
import { createGameServer } from "../app";
import { log } from "../ops/logger";

/**
 * Starts the real game server for an integration test file. One port per Vitest worker, because
 * `@colyseus/testing`'s `boot()` always listens on 2568 and collides across parallel files.
 * Logs are silent unless `LOG_LEVEL` is set. Call `shutdown()` in `afterAll`.
 */
export async function bootTestServer(): Promise<{ colyseus: ColyseusTestServer; port: number }> {
  log.level = process.env.LOG_LEVEL ?? "silent";
  const port = 2600 + Number(process.env.VITEST_POOL_ID ?? 0);
  const server = createGameServer();
  await server.listen(port, "127.0.0.1");
  return { colyseus: new ColyseusTestServer(server), port };
}
