import { createRouter, defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RUN_ROOM_NAME } from "@topdown/shared";
import { MAX_CLIENT_MESSAGE_BYTES } from "./net/limits";
import { health } from "./ops/health";
import { log } from "./ops/logger";
import { RunRoom } from "./rooms/RunRoom";

/**
 * The game server: the `run` room, `GET /health`, and a WebSocket transport that refuses frames
 * over 1 KB (AC 5). Not listening yet: `index.ts` (or a test) calls `listen(port)`.
 */
export function createGameServer() {
  return defineServer({
    rooms: { [RUN_ROOM_NAME]: defineRoom(RunRoom) },
    routes: createRouter({ health }),
    transport: new WebSocketTransport({ maxPayload: MAX_CLIENT_MESSAGE_BYTES }),
    logger: log,
    greet: false,
  });
}

export type GameServer = ReturnType<typeof createGameServer>;
