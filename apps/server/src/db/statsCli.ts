/**
 * `npm run stats -w @topdown/server -- [--since YYYY-MM-DD]` (Story 10.7, AC 8): prints the run stats as text tables
 * (designer Q3 = A), from `DATABASE_URL` (PostgreSQL) or, outside production without it, the dev PGlite directory. On the
 * VPS it runs in a one-off server container like `admin` (docs/deploy.md › Database). Reads only; exit 0 on an empty
 * database ("No finished runs yet").
 */
import { log } from "../ops/logger";
import { type Database, databaseFromEnv } from "./client";
import { DEFAULT_PGLITE_DIR } from "./paths";
import { runResultsRepo } from "./runResultsRepo";
import { formatStats, parseStatsArgs } from "./statsCommand";

let database: Database | null = null;
try {
  const args = parseStatsArgs(process.argv.slice(2));
  if ("error" in args) {
    process.stderr.write(`${args.error}\n`);
    process.exitCode = 2;
  } else {
    database = databaseFromEnv(process.env, DEFAULT_PGLITE_DIR);
    const { runs, seats } = await runResultsRepo(database).statsRows(args.since);
    process.stdout.write(`${formatStats(runs, seats, args.since).join("\n")}\n`);
  }
} catch (e) {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "stats_command_failed");
  process.exitCode = 1;
} finally {
  await database?.close();
}
