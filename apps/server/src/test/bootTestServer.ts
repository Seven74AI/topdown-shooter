import { ColyseusTestServer } from "@colyseus/testing";
import { createGameServer } from "../app";
import { log } from "../ops/logger";
import type { RunRoomOptions } from "../rooms/RunRoom";

/**
 * Starts the real game server for an integration test file. One port per Vitest worker, because
 * `@colyseus/testing`'s `boot()` always listens on 2568 and collides across parallel files.
 * Logs are silent unless `LOG_LEVEL` is set. Call `shutdown()` in `afterAll`. Solo starts are
 * allowed by default, as in dev; a test can flip `room.allowSoloStart` on a live room.
 */
export async function bootTestServer(
  roomOptions: RunRoomOptions = { allowSoloStart: true },
): Promise<{ colyseus: ColyseusTestServer; port: number }> {
  log.level = process.env.LOG_LEVEL ?? "silent";
  const port = 2600 + Number(process.env.VITEST_POOL_ID ?? 0);
  const server = createGameServer(roomOptions);
  await server.listen(port, "127.0.0.1");
  return { colyseus: new ColyseusTestServer(server), port };
}
