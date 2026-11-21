import { createEndpoint, matchMaker } from "@colyseus/core";

/** `GET /health`: liveness for the deploy (Story 2.2) and the dev check. */
export const health = createEndpoint("/health", { method: "GET" }, async () => ({
  ok: true,
  rooms: matchMaker.stats.local.roomCount,
  uptimeS: Math.round(process.uptime()),
}));
