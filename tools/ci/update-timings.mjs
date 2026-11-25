#!/usr/bin/env node
/**
 * `node tools/ci/update-timings.mjs <report.json | dir> ...` rebuilds `tools/ci/timings.json` ({file: seconds}) from
 * vitest JSON reports: the CI shards' `test-report-*` artifacts, or one local `npx vitest run --reporter=json
 * --outputFile=...` (docs/ci.md, "Refreshing the shard timings").
 *
 * A file's time is its report's endTime - startTime. Files in no report keep their old time while they exist (a
 * missing shard artifact must not send its files round-robin); entries for deleted files are dropped.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "tools", "ci", "timings.json");

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stderr.write("usage: node tools/ci/update-timings.mjs <report.json | dir-of-reports> ...\n");
  process.exit(2);
}

const reports = args.flatMap((a) => {
  const p = resolve(a);
  if (!statSync(p).isDirectory()) return [p];
  const found = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".json")) found.push(join(d, e.name));
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
    let file = relative(ROOT, abs).split("\\").join("/");
    if (file.startsWith("..")) file = /\/((?:apps|packages|tools)\/.*)$/.exec(abs)?.[1] ?? file;
    fresh[file] = Math.round(((t.endTime - t.startTime) / 1000) * 10) / 10;
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
