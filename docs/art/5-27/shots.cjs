/* global require, process, console, window, setTimeout */
// Story 5.27 browser shots: the build bar with all seven icons (solo practice, `?shopall=1`, headless Chromium, mobile emulation).
// Run with the client dev server on --port (default 5427): node docs/art/5-27/shots.cjs <outDir> [--port=5427]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
const out = process.argv[2] || "docs/art/5-27";
const portArg = process.argv.find((s) => s.startsWith("--port="));
const BASE = `http://localhost:${portArg ? portArg.slice(7) : "5427"}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRun(page) {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game") && window.__game.scene.getScene("Hud").model.buildBar)).catch(() => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("build bar never showed");
}

const state = (page) =>
  page.evaluate(() => {
    const hud = window.__game.scene.getScene("Hud");
    const m = hud.model;
    const icons = hud.barIcons.filter((i) => i.visible).map((i) => `${i.texture.key}:${i.frame.name}@${Math.round(i.displayWidth)}x${Math.round(i.displayHeight)} a${i.alpha}`);
    return { items: m.buildItems.map((b) => b.id), owned: m.buildOwned, cap: m.buildCap, money: m.money, icons };
  });

(async () => {
  const browser = await chromium.launch();
  const logs = [];
  const shot = async (w, h, wallet, tag) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
    page.on("console", (m) => m.type() === "error" && logs.push(`console.error ${m.text().slice(0, 200)}`));
    await page.goto(`${BASE}?solo&zdmg=0&shopall=1&wallet=${wallet}`);
    await waitRun(page);
    await sleep(1500);
    const name = `${out}/5-27-${tag}-${w}x${h}-dpr2.png`;
    await page.screenshot({ path: name });
    // the bar alone, 2× for the reviewer
    const bar = { x: w - 270, y: h - 150, width: 270, height: 150 };
    await page.screenshot({ path: `${out}/5-27-closeup-${tag}-${w}x${h}-dpr2.png`, clip: bar });
    console.log(name, JSON.stringify(await state(page)));
    await page.close();
  };
  for (const [w, h] of [
    [800, 360],
    [568, 320],
  ]) {
    await shot(w, h, 5000, "affordable");
    await shot(w, h, 100, "short");
  }
  await browser.close();
  console.log(logs.length ? logs.join("\n") : "no page errors");
})();
