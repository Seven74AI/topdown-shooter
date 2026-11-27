// Story 10.4 (10.4-Q1): stills of the three loading screen options, from the real index.html + boot/bootLoader.js.
// The game's JS is held back (never answered) so the loading screen stays; the bar moves on its own rate guess.
// Usage: node docs/art/loading-screen/stills.cjs <outDir>   (after `npx vite build` in apps/client)
const path = require("node:path");
const { chromium } = require("playwright");
const { createServer } = require("../../../tools/perf/serveDist.cjs");

const OUT = path.resolve(process.argv[2] || __dirname);
const SIZES = [
  [844, 390],
  [568, 320],
];

(async () => {
  const server = createServer(path.resolve(__dirname, "../../../apps/client/dist"));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  for (const [w, h] of SIZES) {
    for (const opt of ["a", "b", "c", "b-draw"]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      await page.route(/\.js$/, () => {}); // hold the game's code: the loading screen stays up
      await page.goto(base + "/", { waitUntil: "commit" });
      await page.waitForFunction(() => window.__bootLoader && window.__bootLoader.hide);
      await page.evaluate((o) => {
        const el = document.getElementById("boot-loader");
        el.className = "bl bl--" + o[0];
        if (o === "b-draw") window.__bootLoader.phase("draw");
      }, opt);
      await page.waitForTimeout(opt === "b-draw" ? 400 : 2600);
      const file = path.join(OUT, `loading-${opt}-${w}x${h}.png`);
      await page.screenshot({ path: file });
      console.log(file, await page.locator("#boot-loader").getAttribute("data-progress"));
      await page.close();
    }
  }
  await browser.close();
  server.close();
})();
