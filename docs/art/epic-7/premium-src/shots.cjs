/* global require, process, console, document, window */
// Premium round 1 captures (preinstalled Chromium, deviceScaleFactor 2). Run from the repo root:
//   node docs/art/epic-7/premium-src/shots.cjs [PR1] [--frames=<scratch dir>]
// Writes docs/art/epic-7/premium/*.jpg (each phone frame + each direction's section). With --frames it also
// renders the reveal at exact times (25 fps) into that scratch dir and encodes docs/art/epic-7/premium/<code>-reveal.webm.
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const OUT = "docs/art/epic-7/premium/";
(async () => {
  const framesArg = process.argv.find((a) => a.startsWith("--frames="));
  const scratch = framesArg ? framesArg.slice(9) : null;
  const only = process.argv.find((a) => /^PR\d$/.test(a));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1340, height: 900 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("console.error", m.text().slice(0, 300)));
  await page.goto("file://" + path.resolve("docs/art/epic-7/premium-rewards.html") + "?static");
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 120000 });
  await page.evaluate(() => { document.querySelector(".bar").style.display = "none"; window.PREMIUM.stop(); });
  await page.waitForTimeout(300);
  const codes = await page.evaluate(() => [...document.querySelectorAll("main > section[id^=s-PR]")].map((s) => s.id.slice(2)));
  for (const code of codes) {
    if (only && code !== only) continue;
    const boxes = await page.$$(`#s-${code} .ph`);
    const names = ["extract-568", "endless-800", "reveal-568-at-2.9s"];
    for (let i = 0; i < 3; i++) { if (i === 2) await page.evaluate((c) => window.PREMIUM.revealAt(c, 2.95), code); await boxes[i].screenshot({ path: `${OUT}${code.toLowerCase()}-${names[i]}.jpg`, type: "jpeg", quality: 80 }); }
    await (await page.$(`#s-${code}`)).screenshot({ path: `${OUT}${code.toLowerCase()}-section.jpg`, type: "jpeg", quality: 52 });
    console.log("shot", code);
    if (scratch) {
      const dir = path.join(scratch, `frames-${code}-${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
      const target = await (await page.$$(`#s-${code} .frames`))[1].$("canvas");
      const fps = 25, dur = 7.6;
      for (let i = 0; i < fps * dur; i++) {
        await page.evaluate(([c, t]) => window.PREMIUM.revealAt(c, t), [code, i / fps]);
        await target.screenshot({ path: path.join(dir, `${String(i).padStart(4, "0")}.png`) });
      }
      const webm = `${OUT}${code.toLowerCase()}-reveal.webm`;
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(dir, "%04d.png"), "-c:v", "libvpx-vp9", "-b:v", "1600k", "-pix_fmt", "yuv420p", webm]);
      console.log("video", webm, (fs.statSync(webm).size / 1024).toFixed(0), "KB");
    }
  }
  await browser.close();
})();
