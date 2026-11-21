import { createGameServer } from "./app";
import { parseAllowedOrigins } from "./net/origin";
import { log } from "./ops/logger";
import { serverBalance } from "./rooms/RunRoom";

// Environment, read once (Story 2.2 sets these in deploy/docker-compose.yml).
const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? "0.0.0.0";
log.level = process.env.LOG_LEVEL ?? "info";
// Opt-in only (Story 2.3 review): the dev script sets ALLOW_SOLO_START=1; production never does.
const allowSoloStart = process.env.ALLOW_SOLO_START === "1";
/** `PUBLIC_ORIGIN`: comma-separated origins allowed to open a WebSocket; unset in dev (allow all). */
const allowedOrigins = parseAllowedOrigins(process.env.PUBLIC_ORIGIN);

// Colyseus registers SIGINT/SIGTERM itself and shuts down gracefully: every room's
// onBeforeShutdown tells its players "Server restarting" and closes with 4001, then the process exits.
const server = createGameServer({ allowedOrigins, allowSoloStart });
await server.listen(port, host);
log.info(
  { port, allowedOrigins, allowSoloStart, balanceVersion: serverBalance.version, gitSha: process.env.GIT_SHA ?? "dev" },
  "server_started",
);
