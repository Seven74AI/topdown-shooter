import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sourcesHash, streetPropsSources } from "../art/streetProps";

/**
 * Story 9.14 (B1): the committed street props atlas (`apps/client/src/render/city/streetProps.{webp,json}`) is the
 * output of `npm run art:street-props` for today's drawing code, and stays inside the download budget (AC 2). The frame
 * names and sizes are checked by `streetPropsAtlas.test.ts` next to the atlas code.
 */
const DIR = join(__dirname, "..", "..", "apps", "client", "src", "render", "city");
const webp = readFileSync(join(DIR, "streetProps.webp"));
const meta = JSON.parse(readFileSync(join(DIR, "streetProps.json"), "utf8")) as { imageSha: string; sourcesHash: string; sources: string[]; chromium: string; width: number; height: number };
const STREET_PROPS_WIDTH = meta.width;
const STREET_PROPS_HEIGHT = meta.height;

describe("Story 9.14: the committed street props atlas", () => {
  it("is the committed image the tool wrote (hash, WebP, size), within the 2 MB download budget (AC 2)", () => {
    expect(createHash("sha256").update(webp).digest("hex").slice(0, 16)).toBe(meta.imageSha);
    expect(webp.subarray(0, 4).toString()).toBe("RIFF");
    expect(webp.subarray(8, 12).toString()).toBe("WEBP");
    const chunks: string[] = [];
    for (let i = 12; i + 8 <= webp.length; ) {
      const n = webp.readUInt32LE(i + 4);
      chunks.push(webp.subarray(i, i + 4).toString());
      i += 8 + n + (n & 1);
    }
    expect(chunks).toContain("VP8L"); // lossless
    // extended header (VP8X): canvas width − 1 and height − 1, 24 bits each
    expect(chunks[0]).toBe("VP8X");
    expect([webp.readUIntLE(24, 3) + 1, webp.readUIntLE(27, 3) + 1]).toEqual([STREET_PROPS_WIDTH, STREET_PROPS_HEIGHT]);
    expect(webp.length).toBeLessThan(2 * 1024 * 1024);
  });

  it("was rebuilt after the last change to its drawing code (run `npm run art:street-props`)", async () => {
    // review M1: every file the atlas page is built from (esbuild's inputs), not a hand-kept list
    const sources = await streetPropsSources();
    expect(sources).toEqual(meta.sources);
    for (const f of ["docs/art/photoreal-1/src/pilot.ts", "docs/art/photoreal-1/src/relief.ts", "apps/client/src/render/city/barricadeArt.ts", "apps/client/src/render/city/relight.ts", "apps/client/src/render/city/atlasLayout.ts", "apps/client/src/render/city/buildingsFrames.ts", "apps/client/src/render/city/dressing.ts", "apps/client/src/render/city/palette.ts"]) expect(sources).toContain(f);
    expect(sources.some((f) => f.startsWith("packages/shared/") || f.includes("node_modules"))).toBe(false);
    expect(sourcesHash(sources)).toBe(meta.sourcesHash);
    expect(meta.chromium).toMatch(/^\d+\./); // review L2: the Chromium that rendered it
  });

});
