import { createGameServer } from "./app";
import { randomSessionSecret } from "./auth/ticket";
import { databaseFromEnv } from "./db/client";
import { DEFAULT_PGLITE_DIR } from "./db/paths";
import { parseAllowedOrigins } from "./net/origin";
import { log } from "./ops/logger";
import { SAVE_CODE_VERSION, mapForDistrict, serverBalance } from "./rooms/RunRoom";
import { migrateRunSave } from "@topdown/shared";
import { bankSavedRun } from "./meta/saveBank";
import { progressRepo } from "./db/progressRepo";
import { releaseSavesOnBoot } from "./run/roomSaves";
import { startHousekeeping } from "./ops/housekeeping";
import { runResultsRepo } from "./db/runResultsRepo";
import { reportsRepo } from "./db/reportsRepo";

// Environment, read once (Story 2.2 sets these in deploy/docker-compose.yml).
const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? "0.0.0.0";
log.level = process.env.LOG_LEVEL ?? "info";
// Opt-in only (Story 2.3 review): the dev script sets ALLOW_SOLO_START=1; production never does.
const allowSoloStart = process.env.ALLOW_SOLO_START === "1";
/** Story 2.10: the fixed `?scenario=net150` test scenario (set on the 4-phone test day only). */
const allowTestScenarios = process.env.ALLOW_TEST_SCENARIOS === "1";
/** `PUBLIC_ORIGIN`: comma-separated origins allowed to open a WebSocket; unset in dev (allow all). */
const allowedOrigins = parseAllowedOrigins(process.env.PUBLIC_ORIGIN);

// Story 7.1: progress is saved in PostgreSQL (`DATABASE_URL`); outside production without it, in an embedded
// PGlite directory (decision 7.1 D1). Production refuses to start without the database address or the ticket key.
const production = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET?.trim();
if (production && !process.env.DATABASE_URL?.trim()) {
  log.fatal("database_url_missing: set DATABASE_URL (deploy/.env, docs/deploy.md › Database)");
  process.exit(1);
}
if (production && (!sessionSecret || sessionSecret.length < 32)) {
  log.fatal("session_secret_missing: set SESSION_SECRET (≥ 32 chars; deploy/deploy.sh generates it in deploy/.env)");
  process.exit(1);
}
const database = databaseFromEnv(process.env, DEFAULT_PGLITE_DIR);

// Colyseus registers SIGINT/SIGTERM itself and shuts down gracefully: every room's
// onBeforeShutdown tells its players "Server restarting" and closes with 4001, then the process exits.
const server = createGameServer({
  allowedOrigins,
  allowSoloStart,
  allowTestScenarios,
  database,
  sessionSecret: sessionSecret || randomSessionSecret(),
});
// Story 8.4 (AC 8, E8-S6): a process that died without a clean stop left its runs 'open': they become resumable now
// (their last autosave is the save) and top up their seats' Supplies (E8-S4). Before listening: no room exists yet.
const progress = progressRepo(database);
// Review M2: also every resumable save whose top-up never landed (a stop that closed the database under it).
await releaseSavesOnBoot(server.saves, log, async (id, snapshot) => {
  const m = migrateRunSave(snapshot);
  if (!m.ok) return log.error({ runId: id, why: m.reason }, "save_unreadable");
  return bankSavedRun(m.save, { balance: serverBalance, map: mapForDistrict(m.save.district), repo: () => progress, log, codeVersion: SAVE_CODE_VERSION });
});
await server.listen(port, host);
// Story 10.6 (B5) + Story 10.7 (B3): daily housekeeping (first run 5 min after boot, then every 24 h; unref'd timers, stopped on the stop
// signal; not `server.onShutdown`, which holds ONE callback: app.ts's database close).
const stopHousekeeping = startHousekeeping({ reports: reportsRepo(database), runResults: runResultsRepo(database) });
for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, stopHousekeeping);
log.info(
  { port, allowedOrigins, allowSoloStart, allowTestScenarios, balanceVersion: serverBalance.version, database: database.kind, gitSha: process.env.GIT_SHA ?? "dev" },
  "server_started",
);
