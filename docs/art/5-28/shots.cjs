/* global require, process, console, window, document, setTimeout */
// Story 5.28 browser shots: the 5.13 card shop with the SMG, Hunting Rifle and Machete cards (solo, dev build,
// `?shopcards=smg,hunting_rifle,machete`, headless Chromium, dpr 2). The shop is opened through `hudModel.shopPressed`.
// Run with the client dev server on --port (default 5428): node docs/art/5-28/shots.cjs <outDir> [--port=5428]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
const out = process.argv[2] || "docs/art/5-28";
const portArg = process.argv.find((s) => s.startsWith("--port="));
const BASE = `http://localhost:${portArg ? portArg.slice(7) : "5428"}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openShop(page) {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game") && window.__game.scene.getScene("Hud").model.buildBar)).catch(() => false);
    if (ok) break;
    await sleep(500);
  }
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => (window.__game.scene.getScene("Hud").model.shopPressed = true));
    await sleep(250);
    if ((await page.$$(".shop-card")).length) return;
  }
  throw new Error("shop never opened");
}

(async () => {
  const browser = await chromium.launch();
  const logs = [];
  for (const [w, h] of [
    [800, 360],
    [568, 320],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
    page.on("console", (m) => m.type() === "error" && logs.push(`console.error ${m.text().slice(0, 200)}`));
    await page.goto(`${BASE}?solo&zdmg=0&wallet=1000&shopcards=smg,hunting_rifle,machete`);
    await openShop(page);
    await sleep(800);
    const name = `${out}/5-28-shop-${w}x${h}-dpr2.png`;
    await page.screenshot({ path: name });
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll(".shop-card")].map((c) => {
        const img = c.querySelector(".shop-card__art img");
        const glyph = c.querySelector(".shop-card__art svg");
        const r = c.getBoundingClientRect();
        return `${c.querySelector(".shop-card__name")?.textContent}: ${img ? `img ${img.naturalWidth}x${img.naturalHeight}` : glyph ? "PICTOGRAM" : "no art"} card ${Math.round(r.width)}x${Math.round(r.height)}`;
      }),
    );
    console.log(name, JSON.stringify(cards));
    await page.close();
  }
  await browser.close();
  console.log(logs.length ? logs.join("\n") : "no page errors");
})();
