// Story 9.14 perf runs (method of docs/perf/epic-7-looks.md / epic-9-characters.md). Usage:
//   NODE_PATH=$(npm root -g) node docs/art/9-14/perf.cjs <label=url> <label=url> [rounds]   (BAKE_ONLY=1: bake times only)
// e.g. master=http://127.0.0.1:5312 branch=http://127.0.0.1:5311
const { chromium } = require("playwright");
const os = require("os");
const targets = process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2));
const rounds = Number(process.argv.find((a) => /^\d+$/.test(a)) || 2);
const WARM_MS = 8000;
const COUNT_MS = 12000;
const SHARED = "/@fs/home/user/topdown-shooter/packages/shared/src/index.ts";

async function page(b, url, rate) {
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await p.goto(url);
  await p.waitForFunction(() => { const s = window.__game?.scene?.getScene("Game"); return s && s.cityView && s.cityView.bakeCount > 0; }, null, { timeout: 120000 });
  return p;
}
async function fps(b, base, rate, stage) {
  const p = await page(b, `${base}/?stress=150`, rate);
  if (stage > 1) await p.evaluate(async ([u, st]) => { const sh = await import(u); sh.applyDecayStage(window.__game.scene.getScene("Game").host.world, st, 0, 0); }, [SHARED, stage]);
  const l0 = os.loadavg()[0];
  await p.waitForTimeout(WARM_MS);
  const r = await p.evaluate((ms) => new Promise((res) => {
    const t = []; const t0 = performance.now();
    const f = (now) => { t.push(now); if (now - t0 < ms) requestAnimationFrame(f); else res(t); };
    requestAnimationFrame(f);
  }), COUNT_MS);
  const police = await p.evaluate(() => window.__game.scene.getScene("Game").cityView.policeLines?.sprites().length ?? 0);
  const l1 = os.loadavg()[0];
  await p.close();
  const d = []; for (let i = 1; i < r.length; i++) d.push(r[i] - r[i - 1]);
  d.sort((a, b) => a - b);
  return { fps: (r.length - 1) / ((r[r.length - 1] - r[0]) / 1000), p95: d[Math.floor(d.length * 0.95)], load: (l0 + l1) / 2, police };
}
async function bakes(b, base, rate) {
  const p = await page(b, `${base}/?solo&startwave=1`, rate);
  const out = [];
  for (const st of [2, 3, 4, 1]) {
    const ms = await p.evaluate(async ([u, st]) => {
      const s = window.__game.scene.getScene("Game"); const sh = await import(u);
      const n = s.cityView.bakeCount; sh.applyDecayStage(s.host.world, st, 0, 0);
      while (s.cityView.bakeCount === n) await new Promise((r) => requestAnimationFrame(r));
      return s.cityView.bakeMs;
    }, [SHARED, st]);
    out.push(Math.round(ms));
  }
  await p.close();
  return out;
}
(async () => {
  const b = await chromium.launch();
  for (let r = 0; r < rounds; r++) {
    const order = r % 2 ? [...targets].reverse() : targets;
    if (!process.env.BAKE_ONLY) for (const rate of [1, 4]) for (const stage of [1, 2]) for (const [label, url] of order) {
      const x = await fps(b, url, rate, stage);
      console.log(JSON.stringify({ round: r + 1, label, rate, stage, fps: +x.fps.toFixed(1), p95: +x.p95.toFixed(1), load: +x.load.toFixed(2), police: x.police }));
    }
    for (const rate of [1, 4]) for (const [label, url] of order) console.log(JSON.stringify({ round: r + 1, label, rate, bakeMs_stage2_3_4_1: await bakes(b, url, rate) }));
  }
  await b.close();
})();
