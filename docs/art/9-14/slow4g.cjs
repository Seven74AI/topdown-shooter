// Story 9.14 review H1: page load → title (and → baked city with ?solo) on Slow 4G (CDP), two dev-mode builds served by vite preview:
//   NODE_ENV=development npx vite build --mode development --outDir <dir>; npx vite preview --outDir <dir> --port <port>
// Time from navigation to the title (Boot scene's Text) and to the Game scene's first city bake (?solo), Slow 4G.
const { chromium } = require('playwright');
const SLOW4G = { offline: false, latency: 562.5, downloadThroughput: (1.6e6 * 0.9) / 8, uploadThroughput: (750e3 * 0.9) / 8 };
(async () => {
  const b = await chromium.launch();
  const targets = [["before", "http://127.0.0.1:5321"], ["after", "http://127.0.0.1:5322"]];
  for (let r = 0; r < 2; r++) for (const [label, base] of (r ? [...targets].reverse() : targets)) {
    for (const q of ["", "?solo"]) {
      const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
      const p = await ctx.newPage();
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", SLOW4G);
      const t0 = Date.now();
      await p.goto(base + "/" + q, { waitUntil: "commit" });
      const title = await p.waitForFunction(() => { const s = window.__game?.scene?.getScene("Boot"); return !!s && s.sys.isActive() && s.children.list.some((c) => c.type === "Text"); }, null, { timeout: 240000, polling: 50 }).then(() => Date.now() - t0);
      let game = "";
      // review NEW-2: does the canvas say "Loading…" while a taken start waits for the image?
      const loadingSeen = q ? p.waitForFunction(() => window.__game?.scene?.getScene("Boot")?.children?.list?.some((c) => c.type === "Text" && c.text === "Loading…"), null, { timeout: 240000, polling: 20 }).then(() => true, () => false) : Promise.resolve("");
      if (q) game = await p.waitForFunction(() => { const s = window.__game?.scene?.getScene("Game"); return s && s.cityView && s.cityView.bakeCount > 0; }, null, { timeout: 240000, polling: 50 }).then(() => Date.now() - t0);
      const loading = await Promise.race([loadingSeen, new Promise((r) => setTimeout(() => r(false), 100))]);
      const photo = q ? await p.evaluate(() => window.__game.textures.get("atlas_downtown").has("prop_policedrum_a")) : "";
      console.log(JSON.stringify({ round: r + 1, label, q: q || "(start screen)", titleMs: title, gameBakedMs: game, loadingShown: loading, photoAtlas: photo }));
      await ctx.close();
    }
  }
  await b.close();
})();
