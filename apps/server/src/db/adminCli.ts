/**
 * `npm run admin -w @topdown/server -- add <username> | remove <username> | list` (Story 10.11, AD-1): marks admins in
 * `DATABASE_URL` (PostgreSQL), or, outside production without it, in the dev PGlite directory. On the VPS it runs in a
 * one-off server container like the migrate step (docs/deploy.md › Database).
 */
import { log } from "../ops/logger";
import { adminsRepo } from "./accountsRepo";
import { runAdminCommand } from "./adminCommand";
import { type Database, databaseFromEnv } from "./client";
import { DEFAULT_PGLITE_DIR } from "./paths";

let database: Database | null = null;
try {
  database = databaseFromEnv(process.env, DEFAULT_PGLITE_DIR);
  process.exitCode = await runAdminCommand(process.argv.slice(2), adminsRepo(database), (line) => process.stdout.write(`${line}\n`));
} catch (e) {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "admin_command_failed");
  process.exitCode = 1;
} finally {
  await database?.close();
}
