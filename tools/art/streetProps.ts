import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { build } from "esbuild";

/**
 * Story 9.14 (B1): renders the street props' image atlas offline (`npm run art:street-props`). Bundles
 * `docs/art/photoreal-1/src/atlas.ts` (the approved pilot pictures + the standing police set, drawn by the approved
 * code itself), runs it on a blank page in the preinstalled headless Chromium (the pictures use canvas blur filters,
 * which only a browser canvas has) and writes:
 *   apps/client/src/render/city/streetProps.webp  — the atlas (lossless WebP)
 *   apps/client/src/render/city/streetProps.json  — frame rects, lamp spots, the hash of the image and of the sources
 * The source hash lets `streetPropsAtlas.test.ts` fail when the drawing code changes and the atlas was not rebuilt.
 * Output is deterministic for a given Chromium (seeded random everywhere).
 */
const ROOT = join(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "apps", "client", "src", "render", "city");

/** Every file whose code draws a picture in the atlas (the drift check hashes them). */
export const STREET_PROPS_SOURCES: readonly string[] = [
  "docs/art/photoreal-1/src/atlas.ts",
  "docs/art/photoreal-1/src/pilot.ts",
  "docs/art/photoreal-1/src/relief.ts",
  "docs/art/asset-fixes-1/src/lib.ts",
  "apps/client/src/render/city/barricadeArt.ts",
  "apps/client/src/render/city/relight.ts",
  "apps/client/src/render/city/groundDamageArt.ts",
  "apps/client/src/render/city/streetPropsFrames.ts",
];

/** sha256 of the sources (line endings normalised), first 16 hex. */
export function sourcesHash(root = ROOT): string {
  const h = createHash("sha256");
  for (const f of STREET_PROPS_SOURCES) h.update(f).update("\0").update(readFileSync(join(root, f), "utf8").replace(/\r\n/g, "\n")).update("\0");
  return h.digest("hex").slice(0, 16);
}

type Result = { width: number; height: number; pxPerM: Record<string, number>; frames: Record<string, { x: number; y: number; w: number; h: number }>; lamps: Record<string, [number, number][]>; png: string; webp: string; webp90: string };
type Page = { on(ev: "pageerror" | "console", fn: (e: { message?: string; text?(): string }) => void): void; setContent(html: string): Promise<unknown>; addScriptTag(o: { content: string }): Promise<unknown>; waitForFunction(fn: () => boolean, arg: null, opts: { timeout: number }): Promise<unknown>; evaluate<T>(fn: () => T): Promise<T> };
type Browser = { newPage(): Promise<Page>; close(): Promise<void>; version(): string };

async function main(): Promise<void> {
  const r = await build({ entryPoints: [join(ROOT, "docs/art/photoreal-1/src/atlas.ts")], bundle: true, format: "iife", platform: "browser", target: "es2022", write: false, legalComments: "none", logLevel: "warning" });
  const js = (r.outputFiles[0] as { text: string }).text;
  // The preinstalled Playwright (not a project dependency) resolves through NODE_PATH.
  const { chromium } = createRequire(import.meta.url)("playwright") as { chromium: { launch(): Promise<Browser> } };
  const browser = await chromium.launch();
  let res: Result;
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.setContent("<!doctype html><html><body></body></html>");
    const t0 = Date.now();
    await page.addScriptTag({ content: js });
    await page.waitForFunction(() => "__streetProps" in globalThis, null, { timeout: 300_000 });
    res = await page.evaluate(() => (globalThis as unknown as { __streetProps: Result }).__streetProps);
    console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s (Chromium ${browser.version()})`);
  } finally {
    await browser.close();
  }
  const bytes = (u: string): Buffer => Buffer.from(u.split(",")[1] as string, "base64");
  const png = bytes(res.png);
  const webp = bytes(res.webp);
  if (webp.subarray(0, 4).toString() !== "RIFF" || webp.subarray(8, 12).toString() !== "WEBP") throw new Error("Chromium did not encode WebP");
  console.log(`atlas ${res.width} × ${res.height}: PNG ${(png.length / 1024).toFixed(0)} KB, WebP lossless ${(webp.length / 1024).toFixed(0)} KB, WebP q90 ${(bytes(res.webp90).length / 1024).toFixed(0)} KB`);
  writeFileSync(join(OUT, "streetProps.webp"), webp);
  const meta = {
    note: "Story 9.14: written by `npm run art:street-props` (tools/art/streetProps.ts); do not edit.",
    image: "streetProps.webp",
    imageSha: createHash("sha256").update(webp).digest("hex").slice(0, 16),
    sourcesHash: sourcesHash(),
    width: res.width,
    height: res.height,
    pxPerM: res.pxPerM,
    frames: res.frames,
    lamps: res.lamps,
  };
  writeFileSync(join(OUT, "streetProps.json"), `${JSON.stringify(meta, null, 1)}\n`);
  console.log(`${Object.keys(res.frames).length} frames → apps/client/src/render/city/streetProps.{webp,json}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
