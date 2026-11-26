/**
 * A vitest reporter (`--reporter=./tools/ci/fileTimesReporter.mjs`, next to the default and json reporters) that writes
 * each test file's time OUTSIDE its tests to `$FILE_TIMES_OUT` (E8-A8 review). vitest's JSON report times only the
 * tests: a file's `endTime − startTime` leaves out `beforeAll` / `afterAll` / `beforeEach` hooks and the module's own
 * top-level code, so `slowest.mjs` could not see a 31 s `beforeAll`. Per file this writes
 * `{ file, duration, collect, tests }` (ms): `duration` is vitest's "all tests and hooks in the module", `collect` the
 * import + suite-callback time, `tests` the sum of the test durations. `slowest.mjs --files` checks
 * `duration − tests + collect` against the same 30 s limit.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

export default class FileTimesReporter {
  onInit(vitest) {
    this.root = vitest.config.root;
  }

  onTestRunEnd(testModules) {
    const out = process.env.FILE_TIMES_OUT;
    if (!out) return;
    const rows = testModules.map((m) => {
      const d = m.diagnostic();
      let tests = 0;
      for (const t of m.children.allTests()) tests += t.diagnostic()?.duration ?? 0;
      return { file: relative(this.root, m.moduleId).split("\\").join("/"), duration: d.duration, collect: d.collectDuration, tests };
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ kind: "file-times", files: rows }, null, 1) + "\n");
  }
}
