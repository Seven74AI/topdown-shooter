/* global require, process, console, window, setTimeout */
// Story 10.10 browser stills (Playwright + the preinstalled Chromium, dpr 2, phone touch emulation, no videos).
// Run a dev client first (solo practice needs no server): (cd apps/client && npx vite --port 5310 --strictPort)
//   node docs/art/10-10/stills.cjs docs/art/10-10
// States, each at 568 × 320 and 844 × 390: closed, open (Build tapped), money (?wallet=60: short of money),
// cap (six wood barricades placed with 1 + Space: 6/6), short (?unlocks=starter: BU-3), repeat (one mine placed: the quick
// tile and the open panel's cell on its spot show the mine — review 9, B13).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
const out = process.argv[2] || "docs/art/10-10";
const BASE = process.env.BASE || "http://localhost:5310/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRun(page) {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game") && window.__game.scene.getScene("Game").host && window.__game.scene.getScene("Hud").model.buildBar)).catch(() => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("the build phase never showed the Build cluster");
}

/** Taps a HUD button by id (its hit rect's centre, CSS px). */
async function tapButton(page, id) {
  const r = await page.evaluate((id) => {
    const hud = window.__game.scene.getScene("Hud");
    const k = window.__game.canvas.width / window.__game.canvas.getBoundingClientRect().width;
    const b = hud.buttons.rects.find((x) => x.id === id && x.visible);
    return b ? { x: (b.x + b.w / 2) / k, y: (b.y + b.h / 2) / k } : null;
  }, id);
  if (!r) throw new Error(`button ${id} not visible`);
  await page.touchscreen.tap(r.x, r.y);
}

async function state(page) {
  return page.evaluate(() => {
    const hud = window.__game.scene.getScene("Hud");
    const k = window.__game.canvas.width / window.__game.canvas.getBoundingClientRect().width;
    const m = hud.model;
    const buttons = {};
    for (const r of hud.buttons.rects) if (r.visible) buttons[r.id] = [+(r.x / k).toFixed(1), +(r.y / k).toFixed(1), +(r.w / k).toFixed(1), +(r.h / k).toFixed(1)];
    return { buildBar: m.buildBar, open: m.buildPanelOpen, quick: m.buildQuick, items: m.buildItems.map((t) => t.id), owned: m.buildOwned, cap: m.buildCap, money: m.money, buttons };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const shots = [
    ["closed", "?solo=1&wallet=400&unlocks=all"],
    ["open", "?solo=1&wallet=400&unlocks=all"],
    ["money", "?solo=1&wallet=60&unlocks=all"],
    ["cap", "?solo=1&wallet=1000&unlocks=all"],
    ["short", "?solo=1&wallet=200&unlocks=starter"],
    ["repeat", "?solo=1&wallet=400&unlocks=all"],
  ];
  for (const [w, h] of [
    [568, 320],
    [844, 390],
  ]) {
    for (const [name, query] of shots) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      page.on("pageerror", (e) => console.log(w, name, "PAGEERROR", e.message));
      await page.goto(BASE + query);
      await waitRun(page);
      await page.addStyleTag({ content: ".dev-gear{display:none!important}" }); // dev-only cheats gear: not in production
      await sleep(1500);
      if (name === "cap") {
        // Chains of three wood barricades (a chain meets a blocked spot after a few), walking in between; mines if still short.
        for (const [key, walk] of [
          ["Digit1", "KeyA"],
          ["Digit1", "KeyS"],
          ["Digit4", null],
        ]) {
          for (let tries = 0; tries < 3; tries++) {
            const owned = await page.evaluate(() => window.__game.scene.getScene("Hud").model.buildOwned);
            if (owned >= 6) break;
            await page.keyboard.press(key);
            for (let i = 0; i < 3; i++) {
              await sleep(350);
              await page.keyboard.press("Space");
            }
            await sleep(600);
            if (await page.evaluate(() => window.__game.scene.getScene("Hud").model.placementActive)) await page.keyboard.press("Escape"); // put it away
            await sleep(400);
            if (walk) {
              await page.keyboard.down(walk);
              await sleep(700);
              await page.keyboard.up(walk);
            }
          }
        }
        await sleep(900);
      }
      if (name === "repeat") {
        // review 9 (B13): one mine placed → the quick tile is the mine, and so is the open panel's cell on that spot.
        await page.keyboard.press("Digit4");
        await sleep(400);
        await page.keyboard.press("Space");
        await sleep(900);
        if (await page.evaluate(() => window.__game.scene.getScene("Hud").model.placementActive)) await page.keyboard.press("Escape");
        await sleep(900);
      }
      if (name === "open" || name === "money") {
        await tapButton(page, "build");
        await sleep(400);
      }
      const s = await state(page);
      console.log(w, h, name, JSON.stringify(s));
      await page.screenshot({ path: `${out}/10-10-${w}-${name}.png` });
      if (name === "cap" || name === "repeat") {
        await tapButton(page, "build");
        await sleep(400);
        console.log(w, h, `${name}-open`, JSON.stringify(await state(page)));
        await page.screenshot({ path: `${out}/10-10-${w}-${name}-open.png` });
      }
      await page.close();
    }
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
