#!/usr/bin/env node
/**
 * `node tools/ci/slowest.mjs <report.json | dir> ...` (Epic 8 retro E8-A8): lists the 15 slowest tests of the given
 * vitest JSON reports (a dir contributes its `test-report-*.json` files), as a Markdown table on stdout and, in CI,
 * in the job summary (`GITHUB_STEP_SUMMARY`). Fails (exit 1) when any single test took longer than `--max` seconds
 * (default 30): split such a test per case (docs/ci.md, "No test over 30 s"). Tests over `--warn` seconds (default
 * 20) get a warning annotation so they are split before they reach the limit.
 *
 * Why a check over the report and not a lower per-test timeout: the timeout also fires on the builders' loaded shared
 * boxes (load 8–16, the reason `testTimeout` is 30 s and the fuzzes carry 120–300 s), so it would flake locally; this
 * check runs only on the CI runners (same machine type every run), reads the time vitest measured, and names every
 * offender at once instead of killing the first one mid-run.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const TOP = 15;
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = Number(args[i + 1]);
  args.splice(i, 2);
  if (!Number.isFinite(v) || v <= 0) {
    process.stderr.write(`slowest.mjs: ${name} needs a number of seconds\n`);
    process.exit(2);
  }
  return v;
};
const maxS = opt("--max", 30);
const warnS = opt("--warn", 20);
if (args.length === 0) {
  process.stderr.write("usage: node tools/ci/slowest.mjs [--max s] [--warn s] <report.json | dir-of-reports> ...\n");
  process.exit(2);
}

const reports = args.flatMap((a) => {
  const p = resolve(a);
  if (!existsSync(p)) {
    process.stderr.write(`slowest.mjs: no such file or folder: ${a}\n`);
    process.exit(2);
  }
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p, { recursive: true })
    .filter((f) => /(^|\/)test-report-[^/]*\.json$/.test(String(f)))
    .map((f) => join(p, String(f)));
});

const tests = [];
for (const r of reports) {
  const json = JSON.parse(readFileSync(r, "utf8"));
  if (!Array.isArray(json.testResults)) throw new Error(`${r} is not a vitest JSON report`);
  for (const t of json.testResults) {
    const file = /(?:^|\/)((?:apps|packages|tools)\/.*)$/.exec(t.name.split("\\").join("/"))?.[1] ?? t.name;
    for (const a of t.assertionResults) {
      if (typeof a.duration === "number") tests.push({ s: a.duration / 1000, status: a.status, file, name: a.fullName });
    }
  }
}
tests.sort((a, b) => b.s - a.s);

const cell = (s) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 160);
const over = tests.filter((t) => t.s > maxS);
const lines = [
  `### Slowest ${Math.min(TOP, tests.length)} of ${tests.length} tests (limit ${maxS} s per test, E8-A8)`,
  "",
  "| s | status | file | test |",
  "| ---: | --- | --- | --- |",
  ...tests.slice(0, TOP).map((t) => `| ${t.s.toFixed(1)}${t.s > maxS ? " ❌" : t.s > warnS ? " ⚠️" : ""} | ${t.status} | ${cell(t.file)} | ${cell(t.name)} |`),
  "",
  over.length ? `**${over.length} test(s) over ${maxS} s: split them per case (docs/ci.md).**` : `No test over ${maxS} s.`,
  "",
];
const md = lines.join("\n");
process.stdout.write(md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
if (process.env.GITHUB_ACTIONS) {
  const esc = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  for (const t of tests.filter((x) => x.s > warnS)) {
    const level = t.s > maxS ? "error" : "warning";
    process.stdout.write(`::${level} file=${t.file}::${esc(`${t.s.toFixed(1)} s (limit ${maxS} s): ${t.name}`)}\n`);
  }
}
if (tests.length === 0) {
  process.stderr.write("slowest.mjs: the reports hold no tests\n");
  process.exit(1);
}
if (over.length) process.exit(1);
