/* global require, process, console, window, document, HTMLCanvasElement, Event, setTimeout */
// Story 4.13 reproduction: solo dev build, WebGL context loss/restore (+ Android-like canvas wipe) and Canvas mode.
// Run from the repo root with the client dev server on --port (default 5137); writes PNGs to <outDir>.
// usage: node docs/art/4-13/reproduce-context-loss.cjs <outDir> [--gap=ms] [--label=x] [--only=webgl|canvas] [--url=query] [--port=5137]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is installed globally here)
const { chromium } = require("playwright");
const out = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const label = arg("label", "");
const gapMs = Number(arg("gap", "1500"));
const only = arg("only", "");
const query = arg("url", "?solo&zdmg=0&debug=1");
const BASE = `http://localhost:${arg("port", "5137")}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRun(page) {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game"))).catch(() => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("Game scene never started");
}

const info = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const r = g.renderer;
    const gs = g.scene.getScene("Game");
    const tex = g.textures.get("atlas_characters");
    const src = tex && tex.getSourceImage();
    let charPixel = null;
    if (src && src.getContext) {
      // alpha of the middle of the survivor frame in the source canvas: 0 = wiped/blank
      const f = tex.get("survivor_body_a");
      charPixel = src.getContext("2d").getImageData(f.cutX + (f.cutWidth >> 1), f.cutY + (f.cutHeight >> 1), 1, 1).data[3];
    }
    return {
      type: r.type === 2 ? "WEBGL" : r.type === 1 ? "CANVAS" : String(r.type),
      contextLost: !!r.contextLost,
      gameActive: !!gs && g.scene.isActive("Game"),
      mode: gs && gs.mode !== undefined ? String(gs.mode) : null,
      survivorAlphaInAtlas: charPixel,
      gfx: window.__gfx ? window.__gfx() : null,
      notice: document.querySelector(".gfx-notice")?.textContent ?? null,
    };
  });

/** Pretend the page went to the background and came back (what Android does around an app switch). */
const setVisibility = (page, hidden) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

/** Android Chrome may discard GPU-backed 2D canvas content while backgrounded: wipe every texture's source canvas. */
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
  const run = async (name, args, fn) => {
    const browser = await chromium.launch({ args });
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on("console", (m) => logs.push(`[${name}] ${m.type()}: ${m.text().slice(0, 200)}`));
    page.on("pageerror", (e) => logs.push(`[${name}] PAGEERROR: ${e.message}`));
    await page.goto(BASE + query);
    if (arg("online", "") === "1") {
      // host alone: name → Create game → Ready → Start (MIN_PLAYERS_TO_START = 1)
      await page.fill('input[placeholder="Name"]', "Tester");
      await page.click("text=Create game");
      await page.waitForSelector("text=Start", { timeout: 30000 });
      const ready = page.locator(".lobby button.btn", { hasText: /Ready/ }).first();
      if (await ready.count()) await ready.click().catch(() => {});
      await sleep(500);
      await page.click("button.btn--start");
    }
    await waitRun(page);
    await sleep(4000);
    await fn(page);
    await browser.close();
  };

  if (only !== "canvas")
    await run("webgl", [], async (page) => {
      console.log("before", JSON.stringify(await info(page)));
      await page.screenshot({ path: `${out}/before${label}.png` });
      await setVisibility(page, true);
      if (arg("wipeonly", "") === "1") {
        // the browser empties the canvases in the background but keeps the WebGL context
        console.log("wiped canvases (context kept)", await wipeCanvases(page));
        await sleep(gapMs);
        await setVisibility(page, false);
        await sleep(1500);
        console.log("visible again", JSON.stringify(await info(page)));
        await page.screenshot({ path: `${out}/wipe-only${label}.png` });
        return;
      }
      await page.evaluate(() => {
        const c = document.querySelector("#game canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        window.__lc = gl.getExtension("WEBGL_lose_context");
        window.__lc.loseContext();
      });
      const wiped = await wipeCanvases(page);
      console.log("wiped canvases", wiped);
      await sleep(gapMs);
      await setVisibility(page, false);
      await sleep(500);
      console.log("lost", JSON.stringify(await info(page)));
      await page.screenshot({ path: `${out}/after-loss${label}.png` });
      if (arg("norestore", "") === "1") {
        await sleep(7000);
        console.log("never restored", JSON.stringify(await info(page)));
        await page.screenshot({ path: `${out}/never-restored${label}.png` });
        return;
      }
      await page.evaluate(() => window.__lc.restoreContext());
      await sleep(3000);
      console.log("restored", JSON.stringify(await info(page)));
      await page.screenshot({ path: `${out}/after-restore${label}.png` });
    });

  if (only !== "webgl")
    await run("canvas", ["--disable-webgl", "--disable-3d-apis"], async (page) => {
      console.log("canvas", JSON.stringify(await info(page)));
      await page.screenshot({ path: `${out}/canvas-mode${label}.png` });
    });
  console.log(logs.filter((l) => !/GPU stall|\[vite\]|Phaser v4/.test(l)).slice(0, 60).join("\n"));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
