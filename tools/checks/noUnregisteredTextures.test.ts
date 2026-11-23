import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 4.13 review L2 / EPIC 5 BRIEF line 20: every texture drawn in code must go through
 * `addGeneratedTexture` (render/city/canvasTexture.ts) so the texture registry can repaint it after
 * Android empties GPU canvases in the background. This scan fails when client code creates a texture
 * any other way. Allowed: canvasTexture.ts itself and CityView.ts (the city bake tiles, which the
 * registry re-bakes as a whole).
 */
const SRC = join(__dirname, "..", "..", "apps", "client", "src");
const ALLOWED = new Set(["render/city/canvasTexture.ts", "render/city/CityView.ts"]);
const FORBIDDEN: readonly [RegExp, string][] = [
  [/\btextures\.addCanvas\s*\(/, "textures.addCanvas("],
  [/\baddCanvasTexture\s*\(/, "addCanvasTexture("],
  [/\.generateTexture\s*\(/, ".generateTexture("],
  [/\bnew\s+(?:Phaser\.)?(?:GameObjects\.)?RenderTexture\b/, "new RenderTexture"],
  [/\bnew\s+(?:Phaser\.)?(?:Textures\.)?DynamicTexture\b/, "new DynamicTexture"],
  [/\b(?:add|make)\.renderTexture\s*\(/, "add.renderTexture("],
  [/\btextures\.addDynamicTexture\s*\(/, "textures.addDynamicTexture("],
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Drops line and block comments so prose that names an API doesn't count. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("every generated texture is registered for repaint (Story 4.13, brief line 20)", () => {
  it("no client file outside canvasTexture.ts / CityView.ts creates a texture directly", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50); // liveness: the scan really saw the client sources
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(SRC, f).split("\\").join("/");
      if (ALLOWED.has(rel)) continue;
      const code = stripComments(readFileSync(f, "utf8"));
      for (const [re, label] of FORBIDDEN) if (re.test(code)) offenders.push(`${rel}: ${label}`);
    }
    expect(offenders, "use addGeneratedTexture (render/city/canvasTexture.ts) instead").toEqual([]);
  });

  it("the scan catches a direct texture creation (self-check)", () => {
    const sample = stripComments('// textures.addCanvas("x") in a comment is fine\nscene.textures.addCanvas("k", c);');
    expect(FORBIDDEN.some(([re]) => re.test(sample))).toBe(true);
    expect(FORBIDDEN.some(([re]) => re.test(stripComments("// g.generateTexture('k')")))).toBe(false);
  });
});
