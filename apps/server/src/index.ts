import { createGameServer } from "./app";
import { log } from "./ops/logger";
import { serverBalance } from "./rooms/RunRoom";

// Environment, read once (Story 2.2 sets these on the VPS).
const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? "0.0.0.0";
log.level = process.env.LOG_LEVEL ?? "info";

// Colyseus registers SIGINT/SIGTERM itself and shuts down gracefully (rooms disposed, then exit).
const server = createGameServer();
await server.listen(port, host);
log.info({ port, balanceVersion: serverBalance.version }, "server_started");
