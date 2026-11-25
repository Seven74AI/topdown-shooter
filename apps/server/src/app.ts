import { createRouter, defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RUN_ROOM_NAME } from "@topdown/shared";
import { createAccountRoutes } from "./auth/accountRoutes";
import { setRoomAccounts } from "./auth/roomAccounts";
import { randomSessionSecret } from "./auth/ticket";
import { accountsRepo } from "./db/accountsRepo";
import { progressRepo } from "./db/progressRepo";
import { type Database, openPglite } from "./db/client";
import { createGuardedHttpServer } from "./net/httpGuard";
import { MAX_CLIENT_MESSAGE_BYTES, TRANSPORT_PING_INTERVAL_MS, TRANSPORT_PING_MAX_RETRIES } from "./net/limits";
import { originAllowed } from "./net/origin";
import { newGuestLimiter } from "./net/rateLimit";
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
  /**
   * Story 7.1: where progress is saved. index.ts passes PostgreSQL (`DATABASE_URL`) or the dev PGlite directory;
   * omitted (tests, tools): a lazy in-memory PGlite, opened only if a route or room asks for it.
   */
  database?: Database;
  /** Story 7.1: HMAC key of the session tickets. Required in production (index.ts); random per start otherwise. */
  sessionSecret?: string;
}

/**
 * The game server: the `run` room, `GET /health`, `POST /account/session` (Story 7.1), a WebSocket transport that refuses frames over
 * 1 KB (Story 2.1 AC 5) and upgrades from other origins (Story 2.2 AC 2), on our own HTTP server
 * that refuses oversized request bodies before Colyseus buffers them (Story 2.1 review).
 * Not listening yet: `index.ts` (or a test) calls `listen(port)`.
 */
export function createGameServer({
  allowedOrigins = [],
  allowSoloStart = false,
  allowTestScenarios = false,
  database = openPglite(),
  sessionSecret = randomSessionSecret(),
}: GameServerOptions = {}) {
  if (allowedOrigins.length === 0) log.warn("origin_check_disabled");
  const accounts = accountsRepo(database);
  const { accountSession } = createAccountRoutes({ accounts, newGuestLimiter, sessionSecret, allowedOrigins });
  setRoomAccounts({ sessionSecret, accounts, progress: progressRepo(database) }); // Story 7.2: banking
  const server = defineServer({
    rooms: { [RUN_ROOM_NAME]: defineRoom(RunRoom, { allowSoloStart, allowTestScenarios }) },
    routes: createRouter({ health, accountSession }),
    transport: new WebSocketTransport({
      server: createGuardedHttpServer(),
      maxPayload: MAX_CLIENT_MESSAGE_BYTES,
      // Story 8.1 (AC 8, D8): ≈ 12–15 s before a silent socket is terminated (Colyseus default 2 retries ≈ 6–9 s).
      pingInterval: TRANSPORT_PING_INTERVAL_MS,
      pingMaxRetries: TRANSPORT_PING_MAX_RETRIES,
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
  // Story 7.1: close the pool / PGlite after the rooms have closed (graceful stop, redeploy, test teardown).
  server.onShutdown(() => database.close());
  return server;
}

export type GameServer = ReturnType<typeof createGameServer>;
