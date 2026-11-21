import { GAME_TITLE } from "@topdown/shared";

console.log(`[${GAME_TITLE}] server stub: Colyseus arrives in Story 2.1`);

// Keep the process alive so `tsx watch` behaves like a real server until Story 2.1.
const keepAlive = setInterval(() => {}, 1 << 30);

const shutdown = (): void => {
  clearInterval(keepAlive);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
