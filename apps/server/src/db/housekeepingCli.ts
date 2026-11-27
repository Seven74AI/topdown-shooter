/**
 * `npm run housekeeping -w @topdown/server` (Story 10.6, B5): runs the daily housekeeping once by hand, on
 * `DATABASE_URL` (PostgreSQL) or, outside production without it, the dev PGlite directory.
 */
import { log } from "../ops/logger";
import { runHousekeeping } from "../ops/housekeeping";
import { type Database, databaseFromEnv } from "./client";
import { DEFAULT_PGLITE_DIR } from "./paths";
import { reportsRepo } from "./reportsRepo";

let database: Database | null = null;
try {
  database = databaseFromEnv(process.env, DEFAULT_PGLITE_DIR);
  const done = await runHousekeeping({ reports: reportsRepo(database) });
  process.stdout.write(`${JSON.stringify(done)}\n`);
} catch (e) {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "housekeeping_command_failed");
  process.exitCode = 1;
} finally {
  await database?.close();
}
