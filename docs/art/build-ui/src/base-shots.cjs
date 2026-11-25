/* global require, process, console, window, setTimeout */
// HISTORICAL (Story 10.10 review): this script drives the 5.16 4 × 2 grid (`tile0…7`, `hud.barTiles` as a grid),
// which Story 10.10 replaced. It only runs against the commit the BU-1 options were made from:
//   git worktree add /tmp/bu1 a06c9cf   (then run it from there). Today's build stills: docs/art/10-10/stills.cjs.
// Build-button (hybrid) proposals: real build-phase stills to draw the HTML/CSS overlays on.
// Run (your own ports; stop both by PID afterwards):
//   server: (cd apps/server && PORT=2687 ALLOW_SOLO_START=1 DEV_NO_WAVES=1 node --import tsx src/index.ts)
//   client: a local Vite config merging apps/client/vite.config.ts with port 5287 and /api → localhost:2687
//   node docs/art/build-ui/src/base-shots.cjs docs/art/build-ui/src
// Per size (568 × 320, 844 × 390; dpr 2, phone touch emulation): base-<w>-today.png (as built: the 5.16 grid; kept as ../build-ui-today-<w>.png),
// base-<w>-clean.png (the grid's tiles and count line hidden, so the proposals draw on a clean corner),
// and hud-<w>.json (every HUD button rect in CSS px, the grid rect).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");
const out = process.argv[2] || "docs/art/build-ui/src";
const BASE = "http://localhost:5287/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRun(page) {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game") && window.__game.scene.getScene("Game").host)).catch(() => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("the run never started");
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const [w, h] of [[568, 320], [844, 390]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => console.log(w, "PAGEERROR", e.message));
    await page.goto(BASE);
    await page.fill('input[placeholder="Name"]', "Ana");
    await page.click("text=Create game");
    await page.waitForSelector(".lobby__code");
    await page.locator("button", { hasText: /^Ready$/ }).first().click();
    await sleep(600);
    await page.click("button.lobby__start");
    await waitRun(page);
    await page.addStyleTag({ content: ".dev-gear{display:none!important}" }); // dev-only cheats gear: not in production
    await sleep(3500);
    const info = await page.evaluate(() => {
      const g = window.__game.scene.getScene("Game");
      const hud = window.__game.scene.getScene("Hud");
      const k = window.__game.canvas.width / window.__game.canvas.getBoundingClientRect().width;
      const buttons = {};
      for (const r of hud.buttons.rects) if (r.visible) buttons[r.id] = { x: +(r.x / k).toFixed(1), y: +(r.y / k).toFixed(1), w: +(r.w / k).toFixed(1), h: +(r.h / k).toFixed(1) };
      const m = hud.model;
      return { k, phase: g.host.world.run.phase, buildBar: m.buildBar, items: (m.buildItems || []).map((t) => `${t.name} $${t.price}`), owned: m.buildOwned, cap: m.buildCap, buttons };
    });
    console.log(w, h, JSON.stringify({ phase: info.phase, buildBar: info.buildBar, items: info.items, owned: info.owned, cap: info.cap }));
    await page.screenshot({ path: `${out}/base-${w}-today.png` });
    // Hide the 5.16 grid: pause the HUD's update (it keeps rendering) and hide every object inside the grid's box.
    const grid = await page.evaluate(() => {
      const hud = window.__game.scene.getScene("Hud");
      const k = window.__game.canvas.width / window.__game.canvas.getBoundingClientRect().width;
      let left = Infinity;
      let top = Infinity;
      for (const t of hud.barTiles) {
        left = Math.min(left, t.x);
        top = Math.min(top, t.y);
      }
      const tile = 56 * k;
      const gap = 8 * k;
      const right = left + 4 * tile + 3 * gap;
      const bottom = top + 2 * tile + gap;
      const box = { left: left - 2, top: top - 30 * k, right: right + 2, bottom: bottom + 2 };
      hud.scene.pause();
      let count = 0;
      for (const o of hud.children.list) {
        if (!o.visible || !o.getBounds) continue;
        const b = o.getBounds();
        if (b.width === 0) continue;
        if (b.x >= box.left && b.y >= box.top && b.x + b.width <= box.right && b.y + b.height <= box.bottom) {
          o.setVisible(false);
          count++;
        }
      }
      for (const t of hud.barTiles) t.setVisible(false); // Graphics report no bounds
      return { hiddenObjects: count, left: left / k, top: top / k, right: right / k, bottom: bottom / k };
    });
    console.log(w, "grid", JSON.stringify(grid));
    await sleep(300);
    await page.screenshot({ path: `${out}/base-${w}-clean.png` });
    fs.writeFileSync(`${out}/hud-${w}.json`, JSON.stringify({ size: [w, h], ...info, grid }, null, 1));
    await page.close();
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
