// JPEG captures of loot-bag-2.html, one per option (deviceScaleFactor 2). Run from the repo root.
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1260, height: 900 }, deviceScaleFactor: 2 });
  p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.goto("file://" + path.resolve("docs/art/epic-7/loot-bag-2.html"));
  await p.waitForSelector("body[data-ready='1']", { timeout: 180000 });
  const only = process.argv[2];
  for (const code of ["LB4", "LB5", "LB6", "LB7", "LB8", "LB9"]) {
    if (only && only !== code) continue;
    await p.locator("#" + code).screenshot({ path: `docs/art/epic-7/loot-bag-2/${code.toLowerCase()}.jpg`, type: "jpeg", quality: Number(process.env.Q || 78) });
  }
  await b.close();
})();
