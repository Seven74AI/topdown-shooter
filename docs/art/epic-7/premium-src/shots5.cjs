/* global require, process, console, document */
// Lumen screens: one JPEG per screen section at deviceScaleFactor 2 -> docs/art/epic-7/lumen/<id>.jpg. Run from the repo root.
const { chromium } = require("playwright");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1340, height: 900 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("console.error", m.text().slice(0, 300)));
  await page.goto("file://" + path.resolve("docs/art/epic-7/lumen-screens.html"));
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 180000 });
  await page.evaluate(() => { document.querySelector(".bar").style.display = "none"; });
  const ids = await page.evaluate(() => [...document.querySelectorAll("section[data-shot]")].map((s) => s.dataset.shot));
  for (const id of ids) { if (process.argv[2] && id !== process.argv[2]) continue; await (await page.$(`#s-${id}`)).screenshot({ path: `docs/art/epic-7/lumen/${id}.jpg`, type: "jpeg", quality: 80 }); console.log("shot", id); }
  // one PNG per picked layout at 568 × 320 (deviceScaleFactor 2 -> 1136 × 640), without the safe-edge hatching -> lumen/picks/
  if (!process.argv[2] || process.argv[2] === 'picks') {
    await page.evaluate(() => document.body.classList.add('no-ins'));
    require('node:fs').mkdirSync('docs/art/epic-7/lumen/picks', { recursive: true });
    for (const id of await page.evaluate(() => [...document.querySelectorAll('[data-pick]')].map((b) => b.dataset.pick))) { const r = await page.evaluate((k) => { const b = document.querySelector(`[data-pick="${k}"]`); b.scrollIntoView(); const q = b.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y) }; }, id); await page.screenshot({ path: `docs/art/epic-7/lumen/picks/${id}.png`, clip: { x: r.x, y: r.y, width: 568, height: 320 } }); console.log('pick', id); }
  }
  await browser.close();
})();
