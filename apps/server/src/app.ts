import { createRouter, defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RUN_ROOM_NAME } from "@topdown/shared";
import { createGuardedHttpServer } from "./net/httpGuard";
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
    // Our own HTTP server, so oversized request bodies are refused before Colyseus buffers them.
    transport: new WebSocketTransport({ server: createGuardedHttpServer(), maxPayload: MAX_CLIENT_MESSAGE_BYTES }),
    // Colyseus's own lines carry no roomId: keep only its errors (rooms log refusals themselves).
    logger: log.child({ src: "colyseus" }, { level: "error" }),
    greet: false,
  });
}

export type GameServer = ReturnType<typeof createGameServer>;
