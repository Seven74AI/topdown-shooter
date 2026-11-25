#!/usr/bin/env node
/**
 * `node tools/ci/shard.mjs <i> <n>` prints the test files of shard i (1-based) of n, one repo-relative path per line,
 * for `npx vitest run $(node tools/ci/shard.mjs 1 4)` (designer 2026-11-25, CI speed-up item 2; docs/ci.md).
 *
 * - The file list is vitest's own (`vitest list --filesOnly --json`: the config's projects, include and exclude), so a
 *   shard can only name files `npm test` runs. `SHARD_FILE_LIST=<json>` reuses a saved list instead (the test does).
 * - Balanced by LPT (longest first onto the least-loaded shard) on `tools/ci/timings.json` ({file: seconds}).
 *   Files missing from it go round-robin; entries for files that no longer exist are ignored.
 * - Browser tests (`*DomLayout.test.ts`, or any test file that loads `playwright`) all go to shard 1, the only CI
 *   shard that installs Chromium; their time, setup and the install count toward shard 1 (COST below).
 * - vitest matches CLI filters by SUBSTRING, so a file whose path contains another file's path is kept on that file's
 *   shard (otherwise the other shard would run it again).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DOM = /DomLayout\.test\.ts$/;
/**
 * vitest's JSON report times a file from its first test's start to its last test's end: module import, collect and
 * `beforeAll` are left out (242 files read 0 s). These serial-second costs are added on top (measured 2026-11-25, 4-core
 * box: ~0.5 s per file; a browser check's Vite + Chromium setup ~5 s; shard 1's `playwright install --with-deps`
 * ~30–60 s of wall time, i.e. ~90 s of a 3-worker shard's serial load).
 */
export const COST = { perFile: 0.5, browserSetup: 5, browserInstall: 90 };

/** A browser test: a `*DomLayout.test.ts` or any test file that loads `playwright` (it skips without Chromium). */
export function isBrowserTest(file, root = ROOT) {
  if (DOM.test(file)) return true;
  try {
    return /["']playwright["']/.test(readFileSync(join(root, file), "utf8"));
  } catch {
    return false;
  }
}

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

/**
 * @param isBrowser pins a file to shard 1 (the CLI passes `isBrowserTest`; the default only looks at the name).
 * @returns {string[][]} the n shards' files (each sorted).
 */
export function split(files, timings, n, isBrowser = (f) => DOM.test(f), cost = COST) {
  const shards = Array.from({ length: n }, () => ({ load: 0, files: [] }));
  const timed = [];
  const untimed = [];
  let browsers = 0;
  for (const g of groupBySubstring(files)) {
    const known = g.filter((f) => typeof timings[f] === "number");
    const load = known.reduce((s, f) => s + timings[f] + cost.perFile, 0);
    const b = g.filter((f) => isBrowser(f)).length;
    if (b > 0) {
      browsers += b;
      shards[0].files.push(...g);
      shards[0].load += load + b * cost.browserSetup;
    } else if (known.length > 0) timed.push({ g, load });
    else untimed.push(g);
  }
  if (browsers > 0) shards[0].load += cost.browserInstall;
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
  const args = process.argv.slice(2);
  if (args.length !== 2 || !args.every((a) => /^[1-9]\d*$/.test(a))) usage("expected two positive integers");
  const [i, n] = args.map(Number);
  if (i > n) usage("i must be in 1..n");
  const timings = JSON.parse(readFileSync(join(ROOT, "tools", "ci", "timings.json"), "utf8"));
  const shard = split(listFiles(), timings, n, (f) => isBrowserTest(f))[i - 1];
  // An empty filter list would make `vitest run` run EVERY file on this shard.
  if (shard.length === 0) {
    process.stderr.write(`shard.mjs: shard ${i}/${n} is empty\n`);
    process.exit(1);
  }
  process.stdout.write(shard.join("\n") + "\n");
}
