/* global require, process, console, window, setTimeout */
// HISTORICAL (Story 10.10 review): this script drives the 5.16 4 × 2 grid (`tile0…7`, `hud.barTiles` as a grid),
// which Story 10.10 replaced. It only runs against the commit the BU-1 options were made from:
//   git worktree add /tmp/bu1 a06c9cf   (then run it from there). Today's build stills: docs/art/10-10/stills.cjs.
// Build-button proposals: crop the REAL 5.16 build-bar tiles (5.26/5.27 icons + price) from the game, so the
// mockups reuse today's tile look. Solo practice, dev build: ?solo=1&unlocks=all&shopall=1&wallet=200 at 844 × 390, dpr 2.
// Writes tile-<id>.png (112 × 112 px = 56 CSS px) for every building type, tile-shop.png and tile-more.png.
//   node docs/art/build-ui/src/tile-crops.cjs docs/art/build-ui/src   (Vite on :5287, see base-shots.cjs)
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
const out = process.argv[2] || "docs/art/build-ui/src";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto("http://localhost:5287/?solo=1&unlocks=all&shopall=1&wallet=200");
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Hud") && window.__game.scene.getScene("Hud").model.buildBar)).catch(() => false);
    if (ok) break;
    await sleep(500);
  }
  await page.addStyleTag({ content: ".dev-gear{display:none!important}" });
  await sleep(1500);
  const state = () =>
    page.evaluate(() => {
      const hud = window.__game.scene.getScene("Hud");
      const k = window.__game.canvas.width / window.__game.canvas.getBoundingClientRect().width;
      const m = hud.model;
      const slots = Array.from(hud.barSlots);
      const rects = {};
      for (const r of hud.buttons.rects) if (r.visible && r.id.startsWith("tile")) rects[r.id] = { x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k };
      return { items: m.buildItems.map((t) => ({ id: t.id, name: t.name, price: t.price })), slots, rects };
    });
  const seen = new Set();
  for (let pageNo = 0; pageNo < 3; pageNo++) {
    const s = await state();
    if (pageNo === 0) console.log(JSON.stringify(s.items));
    for (let i = 0; i < s.slots.length; i++) {
      const r = s.rects[`tile${i}`];
      if (!r) continue;
      const v = s.slots[i];
      const name = v >= 0 ? s.items[v].id : v === -2 ? "shop" : v === -3 ? "more" : null;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      await page.screenshot({ path: `${out}/tile-${name}.png`, clip: { x: r.x - 2, y: r.y - 2, width: r.w + 4, height: r.h + 4 } });
    }
    const more = s.slots.indexOf(-3);
    if (more < 0) break;
    const r = s.rects[`tile${more}`];
    await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2);
    await sleep(500);
  }
  console.log("cropped", [...seen].join(","));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
