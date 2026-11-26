#!/usr/bin/env node
/**
 * `node tools/ci/check-all-passed.mjs <report.json> <min-tests>`: fails unless the vitest JSON report holds at least
 * `min-tests` tests and every one PASSED (none skipped or todo). The real-PostgreSQL files skip themselves without
 * `TEST_DATABASE_URL` (Epic 7 retro E7-A1), so the `postgres` CI job runs this after them: a lost variable or a
 * service that never came up turns the job red instead of green-by-skipping.
 */
import { readFileSync } from "node:fs";

const [report, minArg] = process.argv.slice(2);
const min = Number(minArg);
if (!report || !Number.isInteger(min) || min < 1) {
  process.stderr.write("usage: node tools/ci/check-all-passed.mjs <vitest-json-report> <min-tests>\n");
  process.exit(2);
}
const json = JSON.parse(readFileSync(report, "utf8"));
const tests = json.testResults.flatMap((t) => t.assertionResults);
const bad = tests.filter((a) => a.status !== "passed");
process.stdout.write(`${json.testResults.length} files, ${tests.length} tests, ${tests.length - bad.length} passed (need ≥ ${min}, all passed)\n`);
for (const a of bad) process.stdout.write(`NOT PASSED (${a.status}): ${a.fullName}\n`);
if (tests.length < min || bad.length > 0) process.exit(1);
