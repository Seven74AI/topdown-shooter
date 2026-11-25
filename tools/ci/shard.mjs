#!/usr/bin/env node
/**
 * `node tools/ci/shard.mjs <i> <n>` prints the test files of shard i (1-based) of n, one repo-relative path per line,
 * for `npx vitest run $(node tools/ci/shard.mjs 1 4)` (designer 2026-11-25, CI speed-up item 2; docs/ci.md).
 *
 * - The file list is vitest's own (`vitest list --filesOnly --json`: the config's projects, include and exclude), so a
 *   shard can only name files `npm test` runs. `SHARD_FILE_LIST=<json>` reuses a saved list instead (the test does).
 * - Balanced by LPT (longest first onto the least-loaded shard) on `tools/ci/timings.json` ({file: seconds}).
 *   Files missing from it go round-robin; entries for files that no longer exist are ignored.
 * - The browser DOM checks (`*DomLayout.test.ts`) all go to shard 1, the only CI shard that installs Chromium; their
 *   time counts toward shard 1, so LPT balances around them.
 * - vitest matches CLI filters by SUBSTRING, so a file whose path contains another file's path is kept on that file's
 *   shard (otherwise the other shard would run it again).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DOM = /DomLayout\.test\.ts$/;

function usage(msg) {
  process.stderr.write(`shard.mjs: ${msg}\nusage: node tools/ci/shard.mjs <i> <n>   (1 <= i <= n)\n`);
  process.exit(2);
}

/** Repo-relative test files, as vitest resolves them (deduplicated, sorted). */
function listFiles() {
  let raw;
  if (process.env.SHARD_FILE_LIST) raw = readFileSync(process.env.SHARD_FILE_LIST, "utf8");
  else {
    const dir = mkdtempSync(join(tmpdir(), "shard-"));
    try {
      const out = join(dir, "files.json");
      execFileSync(join(ROOT, "node_modules", ".bin", "vitest"), ["list", "--filesOnly", `--json=${out}`], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
      raw = readFileSync(out, "utf8");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const files = JSON.parse(raw).map((e) => relative(ROOT, resolve(ROOT, e.file)).split("\\").join("/"));
  return [...new Set(files)].sort();
}

/** Groups of files that must share a shard: one contains another's path (case-insensitive, like vitest's filter). */
function groupBySubstring(files) {
  const parent = files.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const lower = files.map((f) => f.toLowerCase());
  for (let a = 0; a < files.length; a++)
    for (let b = 0; b < files.length; b++) if (a !== b && lower[b].includes(lower[a])) parent[find(a)] = find(b);
  const groups = new Map();
  files.forEach((f, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(f);
  });
  return [...groups.values()];
}

/** @returns {string[][]} the n shards' files (each sorted). */
export function split(files, timings, n) {
  const shards = Array.from({ length: n }, () => ({ load: 0, files: [] }));
  const timed = [];
  const untimed = [];
  for (const g of groupBySubstring(files)) {
    const known = g.filter((f) => typeof timings[f] === "number");
    const load = known.reduce((s, f) => s + timings[f], 0);
    if (g.some((f) => DOM.test(f))) {
      shards[0].files.push(...g);
      shards[0].load += load;
    } else if (known.length > 0) timed.push({ g, load });
    else untimed.push(g);
  }
  timed.sort((x, y) => y.load - x.load || (x.g[0] < y.g[0] ? -1 : 1));
  for (const { g, load } of timed) {
    let best = shards[0];
    for (const s of shards) if (s.load < best.load) best = s;
    best.files.push(...g);
    best.load += load;
  }
  untimed.sort((x, y) => (x[0] < y[0] ? -1 : 1));
  untimed.forEach((g, k) => shards[k % n].files.push(...g));
  return shards.map((s) => s.files.sort());
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  const [i, n] = process.argv.slice(2).map(Number);
  if (!Number.isInteger(n) || n < 1) usage("n must be an integer >= 1");
  if (!Number.isInteger(i) || i < 1 || i > n) usage("i must be an integer in 1..n");
  const timings = JSON.parse(readFileSync(join(ROOT, "tools", "ci", "timings.json"), "utf8"));
  const shard = split(listFiles(), timings, n)[i - 1];
  // An empty filter list would make `vitest run` run EVERY file on this shard.
  if (shard.length === 0) {
    process.stderr.write(`shard.mjs: shard ${i}/${n} is empty\n`);
    process.exit(1);
  }
  process.stdout.write(shard.join("\n") + "\n");
}
