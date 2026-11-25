// Story 9.14 screenshots (stills, DPR 2). Run against a dev server: BASE=http://127.0.0.1:5311 NODE_PATH=$(npm root -g) node docs/art/9-14/shots.cjs [only]
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5311";
const OUT = __dirname;
const SIZES = [["phone", 844, 390], ["small", 568, 320], ["desktop", 1280, 720]];
// name, query, player spot (m), stage to force (stress runs), wait ms
const SCENES = [
  ["stage1-street", "solo&startwave=1", [14, 22.5], 0, 1500],
  ["stage2-police", "stress=150", [15, 24.2], 2, 9000],
  ["stage2-gasline", "solo&startwave=3", [26.5, 6.5], 0, 1500],
  ["stage2-gasline-north", "solo&startwave=3", [26.5, 2.2], 0, 1500], // review M2: the north drum over the first piece, its blinker on the map
  ["stage3-burning-rain", "solo&startwave=5", "fire", 0, 2500],
  ["stage4-rubble", "solo&startwave=7", [11, 15], 0, 2500],
];
const only = process.argv[2];
(async () => {
  const b = await chromium.launch();
  for (const [name, q, spot, forceStage, waitMs] of SCENES) {
    if (only && !name.includes(only)) continue;
    for (const [sz, w, h] of SIZES) {
      const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      p.on("pageerror", (e) => console.log("ERR", e.message));
      await p.goto(`${BASE}/?${q}`);
      await p.waitForFunction(() => { const s = window.__game?.scene?.getScene("Game"); return s && s.cityView && s.cityView.bakeCount > 0; }, null, { timeout: 60000 });
      if (forceStage) {
        await p.evaluate(async (st) => {
          const sh = await import("/@fs/home/user/topdown-shooter/packages/shared/src/index.ts");
          sh.applyDecayStage(window.__game.scene.getScene("Game").host.world, st, 0, 0);
        }, forceStage);
      }
      const teleport = (x, y) => p.evaluate(([x, y]) => { const s = window.__game.scene.getScene("Game"); for (const pl of s.host.world.players.values()) Object.assign(pl, { x, y, prevX: x, prevY: y }); }, [x, y]);
      // "fire": a little north of the first burning car (which car burns is picked per run)
      const [x, y] = spot === "fire" ? await p.evaluate(() => { const f = window.__game.scene.getScene("Game").host.world.decay.fires[0]; return [f.x, f.y - 3.2]; }) : spot;
      await teleport(x, y);
      // stress: keep the survivor in place while the crowd walks in
      const t0 = Date.now();
      while (Date.now() - t0 < waitMs) { await p.waitForTimeout(250); await teleport(x, y); }
      await p.screenshot({ path: `${OUT}/${name}-${sz}.png` });
      await p.close();
      console.log(name, sz);
    }
  }
  await b.close();
})();
