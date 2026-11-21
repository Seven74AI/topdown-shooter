import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// ADR-03 / NFR10: proves the packages/shared lint boundary instead of trusting config.
const eslint = new ESLint({ cwd: process.cwd() });

/** Rule ids of all errors ESLint reports for `code` as if it lived in packages/shared. */
const lintAt = async (code: string, filePath: string): Promise<(string | null)[]> => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId);
};
const lintShared = (code: string) => lintAt(code, "packages/shared/src/__fixture__.ts");

const RESTRICTED = ["no-restricted-imports", "no-restricted-globals", "no-restricted-properties"];

describe("packages/shared lint boundary", () => {
  it.each([
    ['import "phaser";', "no-restricted-imports"],
    ['import "phaser/src/core";', "no-restricted-imports"],
    ['import "colyseus";', "no-restricted-imports"],
    ['import "@colyseus/schema";', "no-restricted-imports"],
    ['import "preact";', "no-restricted-imports"],
    ['import "fs";', "no-restricted-imports"],
    ['import "node:fs";', "no-restricted-imports"],
    ['export const w = window;', "no-restricted-globals"],
    ["export const d = document.body;", "no-restricted-globals"],
    ["export const p = process.env;", "no-restricted-globals"],
    ["setTimeout(() => {}, 1);", "no-restricted-globals"],
    ["export const r = Math.random();", "no-restricted-properties"],
    ["export const t = Date.now();", "no-restricted-properties"],
  ])("rejects %s", async (code, rule) => {
    const errors = await lintShared(code);
    expect(errors).toContain(rule);
    expect(errors.every((id) => id !== null && RESTRICTED.includes(id))).toBe(true);
  });

  it("accepts clean engine-free code", async () => {
    expect(await lintShared("export const x = 1;")).toEqual([]);
  });

  it("allows vitest in shared tests", async () => {
    expect(
      await lintAt(
        'import { expect, test } from "vitest";\ntest("x", () => expect(1).toBe(1));\n',
        "packages/shared/src/__fixture__.test.ts",
      ),
    ).toEqual([]);
  });

  it("does not apply the boundary to client code", async () => {
    expect(
      await lintAt('import "phaser";\nexport const w = window;\n', "apps/client/src/__fixture__.ts"),
    ).toEqual([]);
  });
});
