#!/usr/bin/env node
/**
 * `node tools/ci/check-browser-ran.mjs <report.json>`: fails unless the report holds browser tests (shard.mjs
 * `isBrowserTest`: `*DomLayout.test.ts` or any test file that loads `playwright`) and every one of them PASSED. They
 * skip instead of failing when Chromium is missing, so CI shard 1 runs this after its tests (docs/ci.md).
 */
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { isBrowserTest } from "./shard.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const [report] = process.argv.slice(2);
if (!report) {
  process.stderr.write("usage: node tools/ci/check-browser-ran.mjs <vitest-json-report>\n");
  process.exit(2);
}
const json = JSON.parse(readFileSync(report, "utf8"));
const files = json.testResults.filter((t) => isBrowserTest(relative(ROOT, t.name).split("\\").join("/")));
const tests = files.flatMap((t) => t.assertionResults);
const bad = tests.filter((a) => a.status !== "passed");
process.stdout.write(`${files.length} browser test files, ${tests.length} tests, ${tests.length - bad.length} passed\n`);
for (const t of files) process.stdout.write(`  ${relative(ROOT, t.name)}: ${t.assertionResults.length} tests\n`);
for (const a of bad) process.stdout.write(`NOT PASSED (${a.status}): ${a.fullName}\n`);
if (files.length === 0 || tests.length === 0 || bad.length > 0) process.exit(1);
