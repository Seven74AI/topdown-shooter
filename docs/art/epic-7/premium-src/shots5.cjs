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
  await browser.close();
})();
