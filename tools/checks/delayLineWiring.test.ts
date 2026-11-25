import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 8.9 (AC 7, brief R2): the ?debug=1 overlay really prints the delay line (`perfStats.delayLine`, unit-tested there). */
describe("PerfOverlay wires the Story 8.9 delay line", () => {
  it("pushes delayLine(n) among the network lines", () => {
    const src = readFileSync(join(__dirname, "..", "..", "apps", "client", "src", "debug", "PerfOverlay.ts"), "utf8");
    expect(src).toMatch(/lines\.push\(delayLine\(n\)\)/);
  });
});
