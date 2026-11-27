import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import { createCanvas, type Canvas } from "@napi-rs/canvas";

/**
 * Story 10.5 (B3, Q1 = IC3): bakes the home-screen icons (`npm run art:icons`). Runs the APPROVED drawing code itself,
 * `docs/art/icon/icons.js` (the proposal page's Canvas 2D code the designer picked IC3 from), on node canvas: no copy of
 * the drawing, so the shipped icon is the picked design. Writes into `apps/client/public/icons/`:
 *   icon-192.png, icon-512.png            manifest `purpose: "any"`
 *   icon-maskable-512.png                 manifest `purpose: "maskable"` (IC3 is full-bleed and keeps its badge inside
 *                                         the central 80 % circle, so the maskable picture is the same drawing)
 *   apple-touch-icon-180.png              iOS home screen (opaque, iOS rounds the corners itself)
 *   favicon-32.png                        the tab icon
 * and `icons.json`: the sources' hash and every file's sha256 (tools/art/icons/drawIcon.test.ts checks both).
 * Deterministic: the drawing uses seeded noise only (no Math.random).
 */
export const ROOT = join(import.meta.dirname, "..", "..", "..");
export const OUT_DIR = join(ROOT, "apps", "client", "public", "icons");
/** The picked option (designer 2026-11-27, decision 10.5-Q1). */
export const PICKED = "IC3";
/** Every file the icons are drawn from (repo-relative). */
export const ICON_SOURCES = ["docs/art/icon/icons.js", "tools/art/icons/drawIcon.ts"] as const;

export const ICON_FILES: readonly { file: string; px: number }[] = [
  { file: "icon-192.png", px: 192 },
  { file: "icon-512.png", px: 512 },
  { file: "icon-maskable-512.png", px: 512 },
  { file: "apple-touch-icon-180.png", px: 180 },
  { file: "favicon-32.png", px: 32 },
];

interface IconOption {
  code: string;
  draw(g: unknown): void;
}
interface HordesIcons {
  OPTIONS: IconOption[];
  render(opt: IconOption, px: number): Canvas;
}

/** Loads `icons.js` in a sandbox whose `document.createElement("canvas")` makes a node canvas. */
export function loadIcons(): HordesIcons {
  const src = readFileSync(join(ROOT, "docs/art/icon/icons.js"), "utf8");
  const window: { HordesIcons?: HordesIcons } = {};
  const document = { createElement: (tag: string): Canvas => (tag === "canvas" ? createCanvas(1, 1) : ((): never => { throw new Error(`icons.js: no <${tag}> in node`); })()) };
  runInNewContext(src, { window, document, Math }, { filename: "docs/art/icon/icons.js" });
  if (!window.HordesIcons) throw new Error("icons.js did not define window.HordesIcons");
  return window.HordesIcons;
}

/** Draws every icon file (PNG bytes), in `ICON_FILES` order. */
export function drawIcons(): Map<string, Buffer> {
  const icons = loadIcons();
  const opt = icons.OPTIONS.find((o) => o.code === PICKED);
  if (!opt) throw new Error(`icons.js has no ${PICKED}`);
  const out = new Map<string, Buffer>();
  for (const { file, px } of ICON_FILES) out.set(file, icons.render(opt, px).toBuffer("image/png"));
  return out;
}

/** sha256 of the sources (line endings normalised), first 16 hex. */
export function iconSourcesHash(root = ROOT): string {
  const h = createHash("sha256");
  for (const f of ICON_SOURCES) h.update(f).update("\0").update(readFileSync(join(root, f), "utf8").replace(/\r\n/g, "\n")).update("\0");
  return h.digest("hex").slice(0, 16);
}

export const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const files: Record<string, string> = {};
  for (const [file, png] of drawIcons()) {
    writeFileSync(join(OUT_DIR, file), png);
    files[file] = sha256(png);
    console.log(`wrote ${relative(ROOT, join(OUT_DIR, file))} (${png.length} B)`);
  }
  const meta = { option: PICKED, sources: ICON_SOURCES, sourcesHash: iconSourcesHash(), files };
  writeFileSync(join(import.meta.dirname, "icons.json"), `${JSON.stringify(meta, null, 2)}\n`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
