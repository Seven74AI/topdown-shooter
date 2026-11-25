import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The asset review (docs/art/asset-review.md) shows what `apps/client/src/gallery/collect.ts` draws. New art
 * comes in through a new `ensure…()` texture builder, so every exported `ensure…` in the client's render code
 * must be called by the gallery, or the new art would never reach the designer's review page.
 */
const SRC = join(__dirname, "..", "..", "apps", "client", "src");
const COLLECT = readFileSync(join(SRC, "gallery", "collect.ts"), "utf8");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

describe("the asset gallery draws every code-drawn texture set", () => {
  it("calls every exported ensure…() texture builder", () => {
    const builders: string[] = [];
    for (const f of files(join(SRC, "render"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/export function (ensure[A-Z]\w*)\s*\(/g)) builders.push(`${m[1]} (${relative(SRC, f)})`);
    }
    expect(builders.length).toBeGreaterThan(5); // liveness: the scan found the builders
    const missing = builders.filter((b) => !new RegExp(`\\b${b.split(" ")[0]}\\(`).test(COLLECT));
    expect(missing, "add these to apps/client/src/gallery/collect.ts so new art shows on the review page").toEqual([]);
  });

  it("makes the survivor layer textures", () => {
    expect(COLLECT).toMatch(/new SurvivorLayerPool\(/);
  });
});
