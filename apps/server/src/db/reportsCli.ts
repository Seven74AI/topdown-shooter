/**
 * `npm run reports -w @topdown/server -- [--limit 20] [--code K7QF] [--id <uuid>] [--full]` (Story 10.6, AC 7): the
 * newest problem reports, to the operator's terminal only (B7). Reads `DATABASE_URL` like `migrateCli.ts` /
 * `adminCli.ts`; on the VPS it runs in a one-off server container (docs/deploy.md › Database).
 */
import { log } from "../ops/logger";
import { type Database, databaseFromEnv } from "./client";
import { DEFAULT_PGLITE_DIR } from "./paths";
import { reportsRepo } from "./reportsRepo";
import { runReportsCommand } from "./reportsCommand";

let database: Database | null = null;
try {
  database = databaseFromEnv(process.env, DEFAULT_PGLITE_DIR);
  process.exitCode = await runReportsCommand(process.argv.slice(2), reportsRepo(database), (line) => process.stdout.write(`${line}\n`));
} catch (e) {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "reports_command_failed");
  process.exitCode = 1;
} finally {
  await database?.close();
}
