import { createGameServer } from "./app";
import { log } from "./ops/logger";
import { serverBalance } from "./rooms/RunRoom";

// Environment, read once (Story 2.2 sets these on the VPS).
const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? "0.0.0.0";
log.level = process.env.LOG_LEVEL ?? "info";
// Dev builds let the host start alone (Story 2.3); the Docker image sets NODE_ENV=production (2.2).
const allowSoloStart = process.env.NODE_ENV !== "production";

// Colyseus registers SIGINT/SIGTERM itself and shuts down gracefully (rooms disposed, then exit).
const server = createGameServer({ allowSoloStart });
await server.listen(port, host);
log.info({ port, balanceVersion: serverBalance.version, allowSoloStart }, "server_started");
