/* global require, process, console, __dirname */
// Renders mock.html to the option stills: docs/art/build-ui/build-ui-<opt>-<w>-<state>.png (deviceScaleFactor 2).
//   node docs/art/build-ui/src/render.cjs
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");
const outDir = path.resolve(__dirname, "..");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const w of [568, 844]) {
    const h = w === 568 ? 320 : 390;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    for (const opt of ["A", "B", "C", "D"]) {
      for (const state of ["closed", "open"]) {
        await page.goto(`file://${path.join(__dirname, "mock.html")}?opt=${opt}&w=${w}&state=${state}`);
        await page.waitForLoadState("networkidle");
        await page.locator("#stage").screenshot({ path: path.join(outDir, `build-ui-${opt}-${w}-${state}.png`) });
      }
    }
    // Today (Story 5.16, as built) for comparison.
    await page.close();
  }
  await browser.close();
  console.log("rendered to", outDir);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
