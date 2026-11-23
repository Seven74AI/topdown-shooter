/* global require, process, console, window, setTimeout */
// Story 5.26 browser shots: the build bar with its icons (solo practice, headless Chromium, mobile emulation).
// Run with the client dev server on --port (default 5426): node docs/art/5-26/shots.cjs <outDir> [--port=5426]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
const out = process.argv[2] || "docs/art/5-26";
const portArg = process.argv.find((s) => s.startsWith("--port="));
const BASE = `http://localhost:${portArg ? portArg.slice(7) : "5426"}/`;
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
    const regs = window.__game.textures.exists("hud_build");
    return { holding: m.placementActive, bar: m.buildBar, owned: m.buildOwned, cap: m.buildCap, money: m.money, icons, hudBuildTexture: regs };
  });

/** Picks the mine tile and places it (HUD handlers, as a tap would), then walks a step right. */
async function placeMine(page, key) {
  await page.evaluate(() => {
    const hud = window.__game.scene.getScene("Hud");
    const s = hud.model.buildItems.findIndex((b) => b.id === "mine");
    hud.pressTile(s);
  });
  await sleep(300);
  await page.evaluate(() => {
    window.__game.scene.getScene("Hud").model.confirmPressed = true;
  });
  await sleep(300);
  await page.keyboard.down(key);
  await sleep(600);
  await page.keyboard.up(key);
  await sleep(200);
}

(async () => {
  const browser = await chromium.launch();
  const logs = [];
  const shot = async (w, h, dpr, wallet, tag, cap) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
    page.on("console", (m) => m.type() === "error" && logs.push(`console.error ${m.text().slice(0, 200)}`));
    await page.goto(`${BASE}?solo&zdmg=0&wallet=${wallet}`);
    await waitRun(page);
    await sleep(1500);
    if (cap) {
      const keys = ["d", "d", "s", "a", "a", "w"];
      for (let i = 0; i < 24; i++) {
        const s = await state(page);
        if (s.owned >= s.cap) break;
        await placeMine(page, keys[i % keys.length]);
      }
      if ((await state(page)).holding) await page.evaluate(() => (window.__game.scene.getScene("Hud").model.cancelPressed = true));
      await sleep(600);
    }
    const name = `${out}/5-26-${tag}-${w}x${h}-dpr${dpr}.png`;
    await page.screenshot({ path: name });
    console.log(name, JSON.stringify(await state(page)));
    await page.close();
  };
  for (const [w, h] of [
    [800, 360],
    [568, 320],
  ])
    for (const dpr of [2, 3]) {
      await shot(w, h, dpr, 5000, "affordable", false);
      await shot(w, h, dpr, 100, "short", false);
    }
  await shot(800, 360, 2, 5000, "cap", true);
  await shot(568, 320, 3, 5000, "cap", true);
  await browser.close();
  console.log(logs.length ? logs.join("\n") : "no page errors");
})();
