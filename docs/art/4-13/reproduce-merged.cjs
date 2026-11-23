/* global require, process, console, window, document, HTMLCanvasElement, Event, setTimeout, setInterval */
// Story 4.13 after the Epic 5 merge: a Brute, chainsaw / fire axe at level III, stage 3 (car fires),
// then every texture source canvas wiped + WebGL lost / restored, then the shop (upgraded weapon icons).
// Run from the repo root with the client dev server (dev build, cheats on) on --port (default 5137).
// usage: node docs/art/4-13/reproduce-merged.cjs <outDir> [--port=5137] [--gap=3000]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is installed globally here)
const { chromium } = require("playwright");
const out = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const BASE = `http://localhost:${arg("port", "5137")}/`;
const gapMs = Number(arg("gap", "3000"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const info = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const w = g.scene.getScene("Game").host?.world;
    const tex = g.textures.get("atlas_characters");
    const f = tex.get("survivor_body_a");
    const alpha = tex.getSourceImage().getContext("2d").getImageData(f.cutX + (f.cutWidth >> 1), f.cutY + (f.cutHeight >> 1), 1, 1).data[3];
    const types = {};
    if (w) for (let i = 0; i < w.zombies.aliveCount; i++) {
      const id = w.zombies.aliveIds[i];
      const t = w.zombies.type ? w.zombies.type[id] : "?";
      types[t] = (types[t] ?? 0) + 1;
    }
    return {
      contextLost: !!g.renderer.contextLost,
      survivorAlphaInAtlas: alpha,
      stage: w?.decay?.stage,
      fires: w?.decay?.fires?.length,
      zombieTypes: types,
      loadout: w ? JSON.stringify([...w.players.values()][0]?.loadout ?? null).slice(0, 160) : null,
      gfx: window.__gfx ? window.__gfx() : null,
    };
  });

const setVisibility = (page, hidden) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

const wipeCanvases = (page) =>
  page.evaluate(() => {
    let n = 0;
    const tm = window.__game.textures;
    for (const key of tm.getTextureKeys()) {
      for (const s of tm.get(key).source) {
        const c = s.image;
        if (c instanceof HTMLCanvasElement && c.width > 0) {
          const w = c.width;
          c.width = w + 1; // a size change resets the canvas: all pixels transparent
          c.width = w;
          n++;
        }
      }
    }
    return n;
  });

(async () => {
  const logs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => logs.push(`PAGEERROR: ${e.message}`));
  await page.goto(BASE + "?solo&zdmg=0&wallet=5000&loadout=chainsaw:3,fire_axe:3");
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game"))).catch(() => false)) break;
    await sleep(500);
  }
  await sleep(3000);
  // dev cheats: stage 3 (Breakdown: car fires), one Brute in view
  await page.click('button[aria-label="Dev cheats"]');
  await page.selectOption('select[aria-label="Decay stage"]', "3");
  await sleep(500);
  // stand between the two burning cars (so both fires are in the shot)
  console.log("fires", await page.evaluate(() => {
    const w = window.__game.scene.getScene("Game").host.world;
    const f = w.decay.fires;
    const p = [...w.players.values()][0];
    const x = f.reduce((a, r) => a + r.x, 0) / f.length + 2;
    const y = f.reduce((a, r) => a + r.y, 0) / f.length;
    p.x = x;
    p.y = y;
    return JSON.stringify(f.map((r) => [r.target, r.x, r.y]));
  }));
  await sleep(500);
  await page.locator(".dev-cheats select").first().selectOption("brute");
  await page.fill('input[aria-label="How many"]', "1");
  await page.click("text=/Spawn 1 in view/");
  await page.click('button[aria-label="Dev cheats"]');
  // a wider camera so both burning cars and the Brute are in the shot
  await page.evaluate(() => {
    const cam = window.__game.scene.getScene("Game").cameras.main;
    const z = cam.zoom * 0.5;
    setInterval(() => cam.setZoom(z), 50);
  });
  await sleep(3000);
  console.log("before", JSON.stringify(await info(page)));
  await page.screenshot({ path: `${out}/merged-before.png` });
  await setVisibility(page, true);
  await page.evaluate(() => {
    const c = document.querySelector("#game canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    window.__lc = gl.getExtension("WEBGL_lose_context");
    window.__lc.loseContext();
  });
  console.log("wiped canvases", await wipeCanvases(page));
  await sleep(gapMs);
  await setVisibility(page, false);
  await sleep(500);
  console.log("lost", JSON.stringify(await info(page)));
  await page.screenshot({ path: `${out}/merged-after-loss.png` });
  await page.evaluate(() => window.__lc.restoreContext());
  await sleep(3000);
  console.log("restored", JSON.stringify(await info(page)));
  await page.screenshot({ path: `${out}/merged-after-restore.png` });
  await page.mouse.click(511, 340); // the HUD's Shop button (drawn by Phaser, not DOM)
  await sleep(1500);
  await page.screenshot({ path: `${out}/merged-after-restore-shop.png` });
  await browser.close();
  console.log(logs.join("\n"));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
