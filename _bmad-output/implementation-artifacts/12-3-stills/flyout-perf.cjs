// Story 12.3 AC 14 (X10): ?stress=150 at 4× CPU in headless Chromium — a normal wave (the stress scene) vs. the
// extraction fly-out over the same 150 Walkers (+ the 40-Walker fly-out horde). Method of docs/perf/epic-9-*.md.
// Usage: node flyout-perf.cjs [port] [rounds] [rate]   (a Vite dev server of apps/client on <port>, default 5293)
const { chromium } = require("playwright");
const os = require("os");
const port = Number(process.argv[2] ?? 5293);
const rounds = Number(process.argv[3] ?? 2);
const rate = Number(process.argv[4] ?? 4);
const SHARED = "/@fs/home/user/topdown-shooter/packages/shared/src/index.ts";
const WARM_MS = 8000;
const COUNT_MS = 7000; // the fly-out is 8 s
const frames = (p, ms) => p.evaluate((ms) => new Promise((res) => {
  const t = []; const t0 = performance.now();
  const f = (now) => { t.push(now); if (now - t0 < ms) requestAnimationFrame(f); else res(t); };
  requestAnimationFrame(f);
}), ms);
const stats = (r) => {
  const d = []; for (let i = 1; i < r.length; i++) d.push(r[i] - r[i - 1]);
  d.sort((a, b) => a - b);
  return { fps: +((r.length - 1) / ((r[r.length - 1] - r[0]) / 1000)).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1) };
};
(async () => {
  const b = await chromium.launch();
  for (let round = 1; round <= rounds; round++) {
    const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await p.goto(`http://localhost:${port}/?stress=150`);
    await p.waitForFunction(() => { const s = window.__game?.scene?.getScene("Game"); return s && s.cityView && s.cityView.bakeCount > 0; }, null, { timeout: 120000 });
    await p.waitForTimeout(WARM_MS);
    let l0 = os.loadavg()[0];
    const wave = stats(await frames(p, COUNT_MS));
    const waveZ = await p.evaluate(() => window.__game.scene.getScene("Game").host.world.zombies.aliveCount);
    const waveLoad = (l0 + os.loadavg()[0]) / 2;
    // Drive the extraction in the page (the stress scene pauses the waves: unpause, open the vote, resolve Extract).
    await p.evaluate(async (u) => {
      const sh = await import(u); const w = window.__game.scene.getScene("Game").host.world;
      w.waves.paused = false;
      if (w.run.phase === "build") sh.startWave(w);
      sh.openEvacVote(w);
      w.extract.landTicksLeft = 0; // landed (the walk starts on the pad: the survivor stands next to it in ?stress)
      sh.resolveEvacVote(w);
    }, SHARED);
    await p.waitForFunction(() => window.__game.scene.getScene("Game").director.out.flyS >= 0.3, null, { timeout: 60000 });
    l0 = os.loadavg()[0];
    const fly = stats(await frames(p, COUNT_MS));
    const st = await p.evaluate(() => { const s = window.__game.scene.getScene("Game"); const o = s.director.out; return { flyS: +o.flyS.toFixed(1), zoom: o.zoom, phase: s.host.world.run.phase, zombies: s.host.world.zombies.aliveCount, overlay: s.scene.get("Hud").perfOverlay?.gameObject?.text ?? "" }; });
    const flyLoad = (l0 + os.loadavg()[0]) / 2;
    console.log(JSON.stringify({ round, rate, wave: { ...wave, zombies: waveZ, load: +waveLoad.toFixed(2) }, flyout: { ...fly, zombies: st.zombies, zoomEnd: st.zoom, endFlyS: st.flyS, load: +flyLoad.toFixed(2) }, dFps: +(fly.fps - wave.fps).toFixed(1), dP95: +(fly.p95 - wave.p95).toFixed(1) }));
    await p.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
