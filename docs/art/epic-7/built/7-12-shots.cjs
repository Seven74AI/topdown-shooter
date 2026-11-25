/* global require, process, console, window, setTimeout */
// Story 7.12 browser shots: the five loot-bag looks in game (solo practice, normal light and 5 % blackout, the
// Dead City rain), plus the HUD line + off-screen badge. Headless Chromium, 568 × 320 at deviceScaleFactor 2.
// Run with the client dev server on --port (default 5712): node docs/art/epic-7/built/7-12-shots.cjs <outDir> [--port=5712]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
const out = process.argv[2] || "docs/art/epic-7/built";
const portArg = process.argv.find((s) => s.startsWith("--port="));
const BASE = `http://localhost:${portArg ? portArg.slice(7) : "5712"}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRun(page) {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game") && window.__game.scene.getScene("Game").host)).catch(() => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("the run never started");
}

/** Puts a bag of look `v` at (dx, dy) m from my survivor (the real record the view draws; nothing else changes). */
const placeBag = (page, v, dx, dy) =>
  page.evaluate(
    ([v, dx, dy]) => {
      const g = window.__game.scene.getScene("Game");
      const w = g.host.world;
      const me = w.players.get(g.host.localPlayerId);
      const l = w.loot;
      l.state = 1;
      l.x = me.x + dx;
      l.y = me.y + dy;
      l.dropTick = w.tick;
      l.untilTick = w.tick + 400;
      l.variant = v;
      return { x: l.x, y: l.y, tick: w.tick };
    },
    [v, dx, dy],
  );

(async () => {
  const browser = await chromium.launch();
  const logs = [];
  const tiles = [];
  for (const blackout of ["", "5"]) {
    const page = await browser.newPage({ viewport: { width: 568, height: 320 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
    page.on("console", (m) => m.type() === "error" && logs.push(`console.error ${m.text().slice(0, 200)}`));
    await page.goto(`${BASE}?solo&zdmg=0${blackout ? `&blackout=${blackout}` : ""}`);
    await waitRun(page);
    await sleep(2500);
    for (let v = 0; v < 5; v++) {
      await placeBag(page, v, 1.6, -0.2);
      await sleep(700); // a few glint periods; the shot lands on whatever frame it is
      const name = `${out}/7-12-bag-${v}${blackout ? "-blackout5" : ""}.png`;
      await page.screenshot({ path: name });
      tiles.push(name);
    }
    if (!blackout) {
      // the off-screen badge (OA2) and the "Bag found!" line (BF2)
      await placeBag(page, 1, -40, 2);
      await page.evaluate(() => {
        const g = window.__game.scene.getScene("Game");
        g.lootLine.text = "Ana found a bag!";
        g.lootLine.slot = 1;
        g.lootLine.untilMs = g.time.now + 10000;
      });
      await sleep(900);
      await page.screenshot({ path: `${out}/7-12-hud.png` });
    }
    await page.close();
  }
  await browser.close();
  console.log(tiles.join("\n"));
  console.log(logs.length ? logs.join("\n") : "no page errors");
})();
