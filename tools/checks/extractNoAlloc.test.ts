import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 12.2 review L5 (AGENTS.md §5: no per-tick allocation): the extraction's per-tick functions allocate nothing. */
const src = readFileSync(join(__dirname, "..", "..", "packages", "shared", "src", "run", "extract.ts"), "utf8");

describe("Story 12.2 review L5: no allocation per tick in run/extract.ts", () => {
  for (const fn of ["export function updateExtract", "export function extractInputs"]) {
    it(`${fn}: module-level forEach callbacks (no for…of iterator, no closure)`, () => {
      const at = src.indexOf(fn);
      expect(at).toBeGreaterThan(0);
      const body = src.slice(at, src.indexOf("\n}\n", at));
      expect(body).not.toMatch(/for \(const \w+ of /);
      expect(body).not.toMatch(/=>/);
    });
  }
});
