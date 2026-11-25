import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { COST, isBrowserTest, split } from "./shard.mjs";

/**
 * CI speed-up item 2 (designer 2026-11-25): the 4 CI shards together run exactly the files `npm test` runs — none
 * dropped, none twice — checked against vitest's OWN file list and its own CLI filter matching (`vitest list`).
 */
const run = promisify(execFile);
const ROOT = resolve(__dirname, "..", "..");
const VITEST = join(ROOT, "node_modules", ".bin", "vitest");
const SHARD = join(ROOT, "tools", "ci", "shard.mjs");
const N = 4;
const tmp = mkdtempSync(join(tmpdir(), "shard-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** `vitest list --filesOnly` with the given filters: [repo-relative file, project] pairs. */
async function vitestList(name: string, filters: readonly string[]): Promise<{ file: string; projectName?: string }[]> {
  const out = join(tmp, `${name}.json`);
  await run(VITEST, ["list", "--filesOnly", `--json=${out}`, ...filters], { cwd: ROOT, maxBuffer: 1 << 26 });
  return (JSON.parse(readFileSync(out, "utf8")) as { file: string; projectName?: string }[]).map((e) => ({ ...e, file: relative(ROOT, e.file) }));
}

describe("tools/ci/shard.mjs against vitest's own file list", () => {
  it("4 shards: pairwise disjoint, union = every file, each shard's filters select exactly its files; DOM checks on shard 1", async () => {
    const full = await vitestList("full", []);
    const all = full.map((e) => e.file);
    expect(all.length).toBeGreaterThan(400);
    // The unit / slow projects are disjoint: `npm test` runs no file twice.
    expect(new Set(all).size).toBe(all.length);

    const env = { ...process.env, SHARD_FILE_LIST: join(tmp, "full.json") };
    const shards = await Promise.all(
      Array.from({ length: N }, async (_, k) => (await run(process.execPath, [SHARD, String(k + 1), String(N)], { cwd: ROOT, env })).stdout.trim().split("\n")),
    );
    const seen = new Map<string, number>();
    for (const s of shards) for (const f of s) seen.set(f, (seen.get(f) ?? 0) + 1);
    expect([...seen].filter(([, c]) => c !== 1)).toEqual([]);
    expect([...seen.keys()].sort()).toEqual([...all].sort());

    // vitest matches CLI filters by substring: what each shard's command line REALLY selects.
    const selected = await Promise.all(shards.map((s, k) => vitestList(`shard${k + 1}`, s)));
    selected.forEach((sel, k) => expect(sel.map((e) => e.file).sort(), `shard ${k + 1}`).toEqual([...(shards[k] as string[])].sort()));
    expect(selected.flat().length).toBe(all.length);

    const dom = all.filter((f) => /DomLayout\.test\.ts$/.test(f));
    expect(dom.length).toBeGreaterThan(0);
    expect(dom.every((f) => shards[0]!.includes(f))).toBe(true);
  }, 120_000);
});

describe("split()", () => {
  const NO_COST = { perFile: 0, browserSetup: 0, browserInstall: 0 };

  it("browser tests: *DomLayout by name, or any test file that loads playwright", () => {
    expect(isBrowserTest("tools/checks/hubDomLayout.test.ts")).toBe(true);
    expect(isBrowserTest("tools/checks/hubLayoutCss.test.ts")).toBe(false);
    expect(isBrowserTest("tools/ci/shard.test.ts")).toBe(false);
  });

  it("setup costs: every file costs perFile, and shard 1 carries browser setup + install", () => {
    // 0 s files (import/collect not in the report) still spread out instead of piling onto one shard
    const zeros = ["a", "b", "c", "d"].map((x) => `${x}.test.ts`);
    expect(split(zeros, Object.fromEntries(zeros.map((f) => [f, 0])), 2).map((s) => s.length)).toEqual([2, 2]);
    // shard 1 starts at 1 + 5 + 90 s, so the 50 s file goes to shard 2
    const t = { "x/hubDomLayout.test.ts": 1, "big.test.ts": 50 };
    expect(split(Object.keys(t), t, 2, undefined, { ...COST, perFile: 0 })).toEqual([["x/hubDomLayout.test.ts"], ["big.test.ts"]]);
  });

  it("LPT: longest first onto the least-loaded shard", () => {
    const t = { "a.test.ts": 10, "b.test.ts": 7, "c.test.ts": 5, "d.test.ts": 4, "e.test.ts": 3 };
    expect(split(Object.keys(t), t, 2, undefined, NO_COST)).toEqual([
      ["a.test.ts", "d.test.ts"], // 10 + 4
      ["b.test.ts", "c.test.ts", "e.test.ts"], // 7 + 5 + 3
    ]);
  });

  it("files missing from timings go round-robin; timings for deleted files are ignored", () => {
    const shards = split(["a.test.ts", "n1.test.ts", "n2.test.ts", "n3.test.ts"], { "a.test.ts": 5, "gone.test.ts": 99 }, 3);
    expect(shards).toEqual([["a.test.ts", "n1.test.ts"], ["n2.test.ts"], ["n3.test.ts"]]);
    expect(shards.flat()).not.toContain("gone.test.ts");
  });

  it("DOM checks are pinned to shard 1 and count toward its load", () => {
    const t = { "x/hubDomLayout.test.ts": 20, "a.test.ts": 15, "b.test.ts": 10 };
    // shard 1 starts at 20 s, so both a (15) and b (10) go to shard 2
    expect(split(Object.keys(t), t, 2, undefined, NO_COST)).toEqual([["x/hubDomLayout.test.ts"], ["a.test.ts", "b.test.ts"]]);
  });

  it("a file whose path contains another file's path shares that file's shard (vitest filters by substring)", () => {
    const t = { "tools/x.test.ts": 1, "apps/c/src/tools/x.test.ts": 1, "big.test.ts": 50 };
    const shards = split(Object.keys(t), t, 3);
    const home = shards.findIndex((s) => s.includes("tools/x.test.ts"));
    expect(shards[home]).toContain("apps/c/src/tools/x.test.ts");
    expect(shards.flat().sort()).toEqual(Object.keys(t).sort());
  });
});
