// Story 10.5-Q1: renders the icon stills from index.html with the preinstalled Chromium.
// Run from the repo root: node docs/art/icon/render.mjs   (writes docs/art/icon/stills/*.png)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "stills");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(pathToFileURL(join(here, "index.html")).href);
await page.waitForFunction(() => window.__ready === true);
const ids = await page.$$eval("canvas", (cs) => cs.map((c) => c.id));
for (const id of ids) {
  const data = await page.$eval(`#${id}`, (c) => c.toDataURL("image/png"));
  const file = join(outDir, `${id}.png`);
  writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
  console.log("wrote", file);
}
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
