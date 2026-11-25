import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review M5 (found by the meta-rows resultsDomLayout fixture): a merge dropped the `}` closing `@keyframes ph-spin`,
 * and the browser swallowed every rule after it (the DP2 sheet and the Results item rows lost their styles). No CSS
 * linter runs in the gate, so this checks the client's stylesheets balance their braces outside comments and strings.
 */
const UI = join(__dirname, "..", "..", "apps", "client", "src", "ui");

function depthProblems(css: string): string[] {
  const t = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => " ".repeat(m.length));
  const out: string[] = [];
  let depth = 0;
  t.split("\n").forEach((line, i) => {
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth < 0) {
        out.push(`line ${i + 1}: } without {`);
        depth = 0;
      }
    }
    // a top-level selector line (no indent) while still inside a block = a missing }
    if (/^[.#a-z@:[*]/i.test(line) && line.includes("{") && depth > 1 && !/^@/.test(line)) out.push(`line ${i + 1}: a top-level rule nested ${depth - 1} deep: ${line.trim()}`);
  });
  if (depth !== 0) out.push(`end of file: ${depth} unclosed {`);
  return out;
}

describe("client stylesheets: balanced braces (review M5)", () => {
  it("overlay.css", () => {
    expect(depthProblems(readFileSync(join(UI, "overlay.css"), "utf8"))).toEqual([]);
  });
  it("the check catches the merge slip (a keyframes block missing its })", () => {
    expect(depthProblems("@keyframes a {\n  to {\n    x: 1;\n  }\n\n.b {\n  y: 2;\n}\n").length).toBeGreaterThan(0);
  });
});
