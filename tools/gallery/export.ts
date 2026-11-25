import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createServer } from "vite";

/**
 * Asset review export (`npm run gallery:export`). Opens the asset gallery (`apps/client/gallery.html`,
 * which draws every texture with the game's own code) in headless Chromium, takes every frame, and writes
 * `tools/gallery/out/assets.json` for the review page (`tools/gallery/review-page.html`, published at the
 * URL in `docs/art/asset-review.md`).
 *
 * It also adds the approved photoreal looks that are not in the game yet (`docs/art/photoreal-1/compare.html`,
 * street props and vehicles; the characters' take 4 is in the game since Story 9.13), from those pages' export hooks,
 * as groups of their own, so the designer can review them on the same page. Build those pages first.
 *
 * Each asset gets a `hash` of its pixels and an `added` date. `tools/gallery/manifest.json` (committed)
 * remembers both, so the review page can mark art that is new since the first export, and art whose
 * pixels changed after the designer reviewed it.
 */
type Asset = { id: string; group: string; name: string; w: number; h: number; url: string };
type Entry = { hash: string; added: string; changed: string };

const ROOT = join(import.meta.dirname, "..", "..");
const OUT_DIR = join(import.meta.dirname, "out");
const MANIFEST = join(import.meta.dirname, "manifest.json");
const today = new Date().toISOString().slice(0, 10);

const server = await createServer({ root: join(ROOT, "apps", "client"), configFile: join(ROOT, "apps", "client", "vite.config.ts"), server: { port: 0, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite did not start");

// The preinstalled Playwright (not a project dependency) resolves through NODE_PATH.
type Page = {
  on(ev: "pageerror", fn: (e: Error) => void): void;
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: () => boolean, arg: null, opts: { timeout: number }): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
};
type Browser = { newPage(): Promise<Page>; close(): Promise<void> };
const { chromium } = createRequire(import.meta.url)("playwright") as { chromium: { launch(): Promise<Browser> } };
const browser = await chromium.launch();
let assets: Asset[];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("gallery error:", e.message));
  await page.goto(`${url}gallery.html`);
  await page.waitForFunction(() => "__assets" in globalThis, null, { timeout: 120_000 });
  assets = await page.evaluate(() => (globalThis as unknown as { __assets: Asset[] }).__assets);
  // Story 9.13: the relit characters' sheets (one texture per look) show as one group on the page
  assets = assets.map((a) => (a.group.startsWith("chars_") ? { ...a, group: "characters_relit" } : a));
  // the approved photoreal looks (not in the game yet), from their pages' hooks
  for (const [file, hook, group, ready] of [
    ["docs/art/photoreal-1/compare.html", "__photoreal", "approved_photoreal_props", "loading"],
    ["docs/art/photoreal-3/compare.html", "__build3", "approved_buildables", "loading"],
  ] as const) {
    const path = join(ROOT, file);
    if (!existsSync(path)) {
      console.warn(`skipped ${file} (not built)`);
      continue;
    }
    await page.goto(`file://${path}`);
    await page.waitForFunction(new Function(`return document.getElementById("${ready}") === null && "${hook}" in globalThis`) as () => boolean, null, { timeout: 180_000 });
    const items = await page.evaluate(new Function(`return globalThis.${hook}`) as () => { id?: string; name: string; group?: string; url: string }[]);
    for (const it of items) {
      const png = Buffer.from(it.url.split(",")[1] as string, "base64");
      const slug = (it.id ?? `${it.group ?? ""}_${it.name}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      assets.push({ id: `${group}/${slug}`, group, name: it.group ? `${it.group}: ${it.name}` : it.name, w: png.readUInt32BE(16), h: png.readUInt32BE(20), url: it.url });
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (assets.length < 100) throw new Error(`only ${assets.length} assets: the gallery is broken`);

const old: Record<string, Entry> = existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, Entry>) : {};
const first = Object.keys(old).length === 0;
const manifest: Record<string, Entry> = {};
let added = 0;
let changed = 0;
const out = assets.map((a) => {
  const hash = createHash("sha1").update(a.url).digest("hex").slice(0, 12);
  const prev = old[a.id];
  const entry: Entry = prev ? { hash, added: prev.added, changed: prev.hash === hash ? prev.changed : today } : { hash, added: first ? "" : today, changed: "" };
  if (!prev && !first) added++;
  if (prev && prev.hash !== hash) changed++;
  manifest[a.id] = entry;
  return { ...a, ...entry };
});
const removed = Object.keys(old).filter((id) => !(id in manifest));

mkdirSync(OUT_DIR, { recursive: true });
// One record per line: the review page fetches it; people can still diff it.
writeFileSync(join(OUT_DIR, "assets.json"), `[\n${out.map((a) => JSON.stringify(a)).join(",\n")}\n]\n`);
writeFileSync(MANIFEST, `{\n${Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)).map(([id, e]) => `  ${JSON.stringify(id)}: ${JSON.stringify(e)}`).join(",\n")}\n}\n`);
console.log(`${out.length} assets → tools/gallery/out/assets.json (${added} new, ${changed} changed, ${removed.length} removed${removed.length ? `: ${removed.join(", ")}` : ""})`);
