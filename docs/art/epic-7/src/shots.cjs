/* global require, process, console, document, window */
// Epic 7 looks: one PNG per item (each section) at deviceScaleFactor 2, headless Chromium (preinstalled).
// Run from the repo root: node docs/art/epic-7/src/shots.cjs [only-section-id]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain Node script
const { chromium } = require("playwright");
const path = require("node:path");
(async () => {
  const only = process.argv[2];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("console.error", m.text().slice(0, 300)));
  await page.goto("file://" + path.resolve("docs/art/epic-7/looks.html") + "?static");
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 120000 });
  await page.evaluate(() => { document.querySelector(".bar").style.display = "none"; });
  await page.waitForTimeout(800);
  const ids = await page.evaluate(() => [...document.querySelectorAll("main > section")].map((s) => s.id));
  for (const id of ids) {
    if (only && id !== only) continue;
    const s = await page.$("#" + id);
    await s.screenshot({ path: `docs/art/epic-7/shots/${id.replace(/^s-/, "")}.png` });
    console.log("shot", id);
  }
  await browser.close();
})();
