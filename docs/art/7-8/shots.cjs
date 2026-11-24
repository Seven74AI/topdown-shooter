/* global require, process, console, window, setTimeout */
// Story 7.8 browser shot: the default survivor in a solo run (dev build, `?solo&zdmg=0`, headless Chromium, dpr 2),
// to see the designer's new default cap in the real atlas. Also crops the survivor frame from the atlas texture.
// Run with the client dev server on --port (default 5478): node docs/art/7-8/shots.cjs <outDir> [--port=5478]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
const out = process.argv[2] || "docs/art/7-8/ingame";
const portArg = process.argv.find((s) => s.startsWith("--port="));
const BASE = `http://localhost:${portArg ? portArg.slice(7) : "5478"}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const logs = [];
  const page = await browser.newPage({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
  page.on("console", (m) => m.type() === "error" && logs.push(`console.error ${m.text().slice(0, 200)}`));
  await page.goto(`${BASE}?solo&zdmg=0`);
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game"))).catch(() => false);
    if (ok) break;
    await sleep(500);
  }
  await sleep(2500);
  await page.screenshot({ path: `${out}/7-8-solo-800x360-dpr2.png` });
  // the survivor_body_a frame straight from the characters atlas, scaled × 3
  const frame = await page.evaluate(() => {
    const tex = window.__game.textures.get("atlas_characters");
    const f = tex.get("survivor_body_a");
    const src = tex.getSourceImage();
    const c = document.createElement("canvas");
    c.width = f.cutWidth * 3;
    c.height = f.cutHeight * 3;
    const g = c.getContext("2d");
    g.fillStyle = "#1a1c1f";
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(src, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, c.width, c.height);
    return { url: c.toDataURL("image/png"), w: f.cutWidth, h: f.cutHeight };
  });
  require("node:fs").writeFileSync(`${out}/7-8-atlas-survivor_body_a-x3.png`, Buffer.from(frame.url.split(",")[1], "base64"));
  console.log(`survivor_body_a ${frame.w}x${frame.h}`);
  // the spinning propeller (?devlayer=propeller, dev builds): two frames 120 ms apart, zoomed on the survivor
  const p2 = await browser.newPage({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p2.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
  await p2.goto(`${BASE}?solo&zdmg=0&devlayer=propeller`);
  for (let i = 0; i < 120; i++) {
    const ok = await p2.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game"))).catch(() => false);
    if (ok) break;
    await sleep(500);
  }
  await sleep(2500);
  const clip = { x: 340, y: 120, width: 120, height: 120 };
  await p2.screenshot({ path: `${out}/7-8-propeller-a.png`, clip });
  await sleep(120);
  await p2.screenshot({ path: `${out}/7-8-propeller-b.png`, clip });
  await browser.close();
  console.log(logs.length ? logs.join("\n") : "no page errors");
})();
