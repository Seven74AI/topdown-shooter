// Story 9.14: the approved page's street scene (docs/art/photoreal-1/compare.html, "Photoreal") next to in-game stills.
// NODE_PATH=$(npm root -g) node docs/art/9-14/sidebyside.cjs   (after shots.cjs)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const D = __dirname;
const png = (f) => "data:image/png;base64," + fs.readFileSync(path.join(D, f)).toString("base64");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + path.join(D, "..", "photoreal-1", "compare.html"));
  await p.waitForFunction(() => document.getElementById("loading") === null && document.querySelector("#scene-after canvas"), null, { timeout: 180000 });
  const scene = await p.evaluate(() => document.querySelector("#scene-after canvas").toDataURL("image/png"));
  const q = await b.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 2 });
  const fig = (src, cap) => `<figure><img src="${src}"><figcaption>${cap}</figcaption></figure>`;
  await q.setContent(`<!doctype html><style>body{margin:0;background:#15161a;color:#ddd;font:15px system-ui;display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}figure{margin:0}img{width:100%;display:block;border-radius:4px}figcaption{padding:4px 2px}</style>
  ${fig(scene, "Approved: compare.html street scene (Photoreal)")}${fig(png("stage2-gasline-phone.png"), "In game, stage 2 (844 × 390, DPR 2): car, concrete barrier, police line end-on, pumps")}
  ${fig(png("stage1-street-phone.png"), "In game, stage 1: curb cars")}${fig(png("stage3-burning-rain-phone.png"), "In game, stage 3: police line, sandbags, burning car in the rain")}`);
  await q.screenshot({ path: path.join(D, "side-by-side-compare.png"), fullPage: true });
  await b.close();
  console.log("side-by-side-compare.png");
})();
