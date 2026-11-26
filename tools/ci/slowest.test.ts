import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * E8-A8 + the PR #28 review: `tools/ci/slowest.mjs` fails CI on a test over 30 s AND on a file that spends over 30 s
 * outside its tests (hooks, imports), from fixture reports (no real sleeps). The file-times fixture has the shape
 * `fileTimesReporter.mjs` writes.
 */
const SCRIPT = resolve(import.meta.dirname, "slowest.mjs");
const dir = mkdtempSync(join(tmpdir(), "slowest-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const vitestReport = (testsMs: number[]): string => {
  const p = join(dir, `test-report-${n++}.json`);
  const assertionResults = testsMs.map((d, i) => ({ fullName: `t${i}`, title: `t${i}`, status: "passed", duration: d }));
  writeFileSync(p, JSON.stringify({ testResults: [{ name: "/x/packages/shared/src/a.test.ts", startTime: 0, endTime: 1, assertionResults }] }));
  return p;
};
const fileTimes = (rows: { file: string; duration: number; collect: number; tests: number }[]): string => {
  const p = join(dir, `file-times-${n++}.json`);
  writeFileSync(p, JSON.stringify({ kind: "file-times", files: rows }));
  return p;
};
const run = (...files: string[]) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...files], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_STEP_SUMMARY: "" } });
  return { code: r.status, out: r.stdout };
};

describe("tools/ci/slowest.mjs (E8-A8)", () => {
  it("passes when every test and every file's time outside its tests is under 30 s", () => {
    const r = run(vitestReport([1000, 12_000]), fileTimes([{ file: "packages/shared/src/a.test.ts", duration: 14_000, collect: 300, tests: 13_000 }]));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/No test over 30 s/);
    expect(r.out).toMatch(/No file spends over 30 s outside its tests/);
  });

  it("fails on a single test over 30 s", () => {
    const r = run(vitestReport([31_000]));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toMatch(/::error file=packages\/shared\/src\/a\.test\.ts::31\.0 s/);
  });

  it("fails on a file whose beforeAll takes 31 s, though each of its tests is short", () => {
    // duration = all tests and hooks (31 s beforeAll + 0.5 s of tests); the JSON report alone would show 0.5 s
    const r = run(vitestReport([200, 300]), fileTimes([{ file: "apps/server/src/slowHook.test.ts", duration: 31_500, collect: 50, tests: 500 }]));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toMatch(/1 file\(s\) spend over 30 s outside their tests/);
    expect(r.out).toMatch(/::error file=apps\/server\/src\/slowHook\.test\.ts::31\.1 s outside the tests \(hooks 31\.0 s, collect 0\.1 s/);
  });

  it("counts import / suite-callback time too, and warns (not fails) from 20 s", () => {
    const r = run(vitestReport([100]), fileTimes([{ file: "tools/x.test.ts", duration: 6_000, collect: 19_000, tests: 1_000 }]));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/::warning file=tools\/x\.test\.ts::24\.0 s outside the tests/);
  });

  it("reads a folder of test-report-* and file-times-* files", () => {
    const sub = mkdtempSync(join(dir, "reports-"));
    writeFileSync(join(sub, "test-report-1.json"), JSON.stringify({ testResults: [{ name: "/x/tools/y.test.ts", startTime: 0, endTime: 1, assertionResults: [{ fullName: "a", title: "a", status: "passed", duration: 10 }] }] }));
    writeFileSync(join(sub, "file-times-1.json"), JSON.stringify({ kind: "file-times", files: [{ file: "tools/y.test.ts", duration: 40_000, collect: 0, tests: 10 }] }));
    const r = run(sub);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toMatch(/spend over 30 s outside their tests/);
  });
});
