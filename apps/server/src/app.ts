import { createRouter, defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RUN_ROOM_NAME } from "@topdown/shared";
import { createGuardedHttpServer } from "./net/httpGuard";
import { MAX_CLIENT_MESSAGE_BYTES } from "./net/limits";
import { originAllowed } from "./net/origin";
import { health } from "./ops/health";
import { log } from "./ops/logger";
import { RunRoom } from "./rooms/RunRoom";

export interface GameServerOptions {
  /**
   * Origins allowed to open a WebSocket (Story 2.2 AC 2), already parsed by `parseAllowedOrigins`
   * from `PUBLIC_ORIGIN`. Empty (dev, tests): every origin is allowed and a warning is logged.
   */
  allowedOrigins?: readonly string[];
  /** Dev builds let a host start alone (Story 2.3). Room defaults override anything a client sends. */
  allowSoloStart?: boolean;
  /** Story 2.10: hosts may run a fixed test scenario (`ALLOW_TEST_SCENARIOS=1`, the test day only). */
  allowTestScenarios?: boolean;
}

/**
 * The game server: the `run` room, `GET /health`, a WebSocket transport that refuses frames over
 * 1 KB (Story 2.1 AC 5) and upgrades from other origins (Story 2.2 AC 2), on our own HTTP server
 * that refuses oversized request bodies before Colyseus buffers them (Story 2.1 review).
 * Not listening yet: `index.ts` (or a test) calls `listen(port)`.
 */
export function createGameServer({ allowedOrigins = [], allowSoloStart = false, allowTestScenarios = false }: GameServerOptions = {}) {
  if (allowedOrigins.length === 0) log.warn("origin_check_disabled");
  return defineServer({
    rooms: { [RUN_ROOM_NAME]: defineRoom(RunRoom, { allowSoloStart, allowTestScenarios }) },
    routes: createRouter({ health }),
    transport: new WebSocketTransport({
      server: createGuardedHttpServer(),
      maxPayload: MAX_CLIENT_MESSAGE_BYTES,
      beforeUpgrade: (_request, ctx) => {
        if (originAllowed(ctx.headers.get("origin"), allowedOrigins)) return;
        log.warn({ origin: ctx.headers.get("origin"), ip: ctx.ip }, "ws_origin_refused");
        return new Response("Forbidden", { status: 403 });
      },
    }),
    // Colyseus's own lines carry no roomId: keep only its errors (rooms log refusals themselves).
    logger: log.child({ src: "colyseus" }, { level: "error" }),
    greet: false,
  });
}

export type GameServer = ReturnType<typeof createGameServer>;
