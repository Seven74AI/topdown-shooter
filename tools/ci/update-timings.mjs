#!/usr/bin/env node
/**
 * `node tools/ci/update-timings.mjs <report.json | dir> ...` (a dir contributes its `test-report-*.json` files) rebuilds `tools/ci/timings.json` ({file: seconds}) from
 * vitest JSON reports: the CI shards' `test-report-*` artifacts, or one local `npx vitest run --reporter=json
 * --outputFile=...` (docs/ci.md, "Refreshing the shard timings").
 *
 * A file's time is its report's endTime - startTime (tests only; shard.mjs adds setup costs). Files in no report, and
 * files whose tests all skipped, keep their old time while they exist (a missing shard artifact must not send its
 * files round-robin); entries for deleted files are dropped.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "tools", "ci", "timings.json");
const TOP = /^(?:apps|packages|tools)\//;

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stderr.write("usage: node tools/ci/update-timings.mjs <report.json | dir-of-reports> ...\n");
  process.exit(2);
}

const reports = args.flatMap((a) => {
  const p = resolve(a);
  if (!existsSync(p)) {
    process.stderr.write(`update-timings.mjs: no such file or folder: ${a}\n`);
    process.exit(2);
  }
  if (!statSync(p).isDirectory()) return [p];
  const found = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (/^test-report-.*\.json$/.test(e.name)) found.push(join(d, e.name));
    }
  };
  walk(p);
  return found;
});

const fresh = {};
for (const r of reports) {
  const json = JSON.parse(readFileSync(r, "utf8"));
  if (!Array.isArray(json.testResults)) throw new Error(`${r} is not a vitest JSON report`);
  for (const t of json.testResults) {
    // The report's paths are absolute on the machine that ran it: keep the part from the repo's top folders on.
    const abs = t.name.split("\\").join("/");
    const rel = relative(ROOT, abs).split("\\").join("/");
    const file = TOP.test(rel) ? rel : /\/((?:apps|packages|tools)\/.*)$/.exec(abs)?.[1];
    if (!file || !TOP.test(file)) continue;
    // All tests skipped (e.g. the DOM checks on a box without Chromium): 0 s would be a lie, keep the old time.
    if (t.assertionResults.length > 0 && t.assertionResults.every((x) => x.status !== "passed" && x.status !== "failed")) continue;
    const s = (t.endTime - t.startTime) / 1000;
    if (Number.isFinite(s) && s >= 0) fresh[file] = Math.round(s * 10) / 10;
  }
}

const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const merged = { ...old, ...fresh };
let kept = 0;
let dropped = 0;
const out = {};
for (const f of Object.keys(merged).sort()) {
  if (!existsSync(join(ROOT, f))) {
    dropped++;
    continue;
  }
  if (!(f in fresh)) kept++;
  out[f] = merged[f];
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
const total = Object.values(out).reduce((s, v) => s + v, 0);
process.stdout.write(
  `timings.json: ${Object.keys(out).length} files, ${total.toFixed(0)} s total (${Object.keys(fresh).length} from ${reports.length} report(s), ${kept} kept from before, ${dropped} deleted files dropped)\n`,
);
