/**
 * `npm run db:migrate` (Story 7.1): applies every committed migration to `DATABASE_URL` (PostgreSQL), or, outside
 * production without it, to the dev PGlite directory. deploy.sh runs it in a one-off server container before `up -d`.
 */
import { log } from "../ops/logger";
import { type Database, databaseFromEnv } from "./client";
import { DEFAULT_PGLITE_DIR } from "./paths";
import { migrateDb } from "./migrate";

let database: Database | null = null;
try {
  database = databaseFromEnv(process.env, DEFAULT_PGLITE_DIR);
  if (database.kind === "postgres") await migrateDb({ kind: "postgres", db: await database.db() });
  else await database.db(); // PGlite migrates when it opens
  log.info({ kind: database.kind }, "db_migrated");
} catch (e) {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "db_migrate_failed");
  process.exitCode = 1;
} finally {
  await database?.close();
}
