/* global require, process, console, window, performance, requestAnimationFrame, module */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
// Story 10.2 (B2, "the 9.13 way"): the frame-rate pass measuring script. CommonJS like docs/art/9-14/perf.cjs, run with
// the preinstalled Playwright + Chromium (headless, SwiftShader: the CPU draws, so the frame is fill-bound).
//
//   NODE_PATH=$(npm root -g) node tools/perf/fps.cjs <label=url> [<label=url> …] [rounds]
//   e.g. node tools/perf/fps.cjs master=http://127.0.0.1:5321 branch=http://127.0.0.1:5322 2
//
// Env: RATES=1,4 (CDP CPU throttling), SCENES=stage1,wave9, DPRS=2, QUERY=&fx=low (extra URL switches for every page),
// PROFILE=1 (one CDP Profiler capture of the count at the LAST rate per scene and target: top self-time functions),
// WARM_MS / COUNT_MS (8000 / 12000). Prints one JSON line per row. Every row asserts the scene: frames counted
// (≥ 60 at 4×, else the row is thrown out and re-run once), 150 alive, ≥ 140 in view, the stage and darkness asked for.
// Exports the page/throttle helpers for Story 10.3.
const { chromium } = require("playwright");
const os = require("os");

const WARM_MS = Number(process.env.WARM_MS || 8000);
const COUNT_MS = Number(process.env.COUNT_MS || 12000);
const QUERY = process.env.QUERY || "";
/** The scenes (Story 10.2 B1): stage 1 Evening, and wave 9 = stage 5 Collapse + 10 % light. */
const SCENES = {
  stage1: { query: "?stress=150", stage: 1, blackoutPct: 0 },
  wave9: { query: "?stress=150&stressstage=5&blackout=10", stage: 5, blackoutPct: 10 },
};

/** A page at 844 × 390 (the 9.13 phone view), `dpr`, CPU throttled ×`rate`, on `url`; resolves when the city is baked. */
async function openPage(browser, url, rate, dpr = 2) {
  const p = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: dpr });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await p.goto(url);
  // the stress probe exists (release too) and the characters' bake is done (9.13: steady state after __charBake.doneMs)
  await p.waitForFunction(() => typeof window.__stress === "function" && (!window.__charBake || window.__charBake.doneMs > 0), null, { timeout: 180000 });
  return { page: p, cdp };
}

/** rAF timestamps over `ms` (the 7.9 / 9.13 count). */
function countFrames(p, ms) {
  return p.evaluate((ms) => new Promise((res) => {
    const t = []; const t0 = performance.now();
    const f = (now) => { t.push(now); if (now - t0 < ms) requestAnimationFrame(f); else res(t); };
    requestAnimationFrame(f);
  }), ms);
}

/** avg FPS, 1 % low (1000 / the 99th-percentile frame ms), p95 frame ms, frame count. */
function frameStats(t) {
  const d = [];
  for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
  d.sort((a, b) => a - b);
  const q = (f) => d[Math.min(d.length - 1, Math.floor(d.length * f))];
  return { frames: d.length, fps: d.length / ((t[t.length - 1] - t[0]) / 1000), low1: 1000 / q(0.99), p95: q(0.95) };
}

/** The top `n` self-time functions of a CDP Profiler profile (ms). */
function topSelf(profile, n = 10) {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    const cf = node.callFrame;
    const key = `${cf.functionName || "(anon)"} ${(cf.url || "").split("/").pop()}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => ({ fn: k, ms: Math.round(ms), pct: +((100 * ms) / total).toFixed(1) }));
}

async function measure(browser, base, rate, sceneName, dpr, profile) {
  const sc = SCENES[sceneName];
  const { page: p, cdp } = await openPage(browser, `${base}/${sc.query}${QUERY}`, rate, dpr);
  const l0 = os.loadavg()[0];
  await p.waitForTimeout(WARM_MS);
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
    await cdp.send("Profiler.start");
  }
  const t = await countFrames(p, COUNT_MS);
  const top = profile ? topSelf((await cdp.send("Profiler.stop")).profile) : undefined;
  const probe = await p.evaluate(() => window.__stress(3000));
  const heap = await p.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
  const l1 = os.loadavg()[0];
  await p.close();
  const s = frameStats(t);
  const errs = [];
  if (probe.stage !== sc.stage) errs.push(`stage ${probe.stage} ≠ ${sc.stage}`);
  if (probe.blackoutPct !== sc.blackoutPct) errs.push(`blackout ${probe.blackoutPct} ≠ ${sc.blackoutPct}`);
  if (probe.alive !== 150) errs.push(`alive ${probe.alive}`);
  if (probe.inView < 140) errs.push(`in view ${probe.inView}`);
  if (s.frames < (rate >= 4 ? 60 : 100)) errs.push(`only ${s.frames} frames`);
  return {
    fps: +s.fps.toFixed(1), low1: +s.low1.toFixed(1), p95: +s.p95.toFixed(1), frames: s.frames,
    updateMs: +probe.updateMs.toFixed(1), renderMs: +probe.renderMs.toFixed(1), tickMs: +probe.tickMs.toFixed(2),
    // B3: the rest of the frame is the GPU fill (SwiftShader: CPU too) and the browser's compositing
    fillMs: +(1000 / s.fps - probe.updateMs - probe.renderMs).toFixed(1),
    bottleneck: probe.tickMs > 8 ? "simulation" : "rendering/GPU", // the 1.11 rule (epic-1-stress.md)
    inView: probe.inView, heapMB: Math.round(heap / 1048576), load: +((l0 + l1) / 2).toFixed(2), top, errs,
  };
}

async function main() {
  const targets = process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2));
  const rounds = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 2);
  const rates = (process.env.RATES || "1,4").split(",").map(Number);
  const scenes = (process.env.SCENES || "stage1,wave9").split(",");
  const dprs = (process.env.DPRS || "2").split(",").map(Number);
  const browser = await chromium.launch();
  for (let r = 0; r < rounds; r++) {
    const order = r % 2 ? [...targets].reverse() : targets;
    for (const dpr of dprs) for (const rate of rates) for (const scene of scenes) for (const [label, url] of order) {
      const profile = process.env.PROFILE === "1" && r === 0 && rate === rates[rates.length - 1];
      let x = await measure(browser, url, rate, scene, dpr, profile);
      if (x.errs.length) x = { ...(await measure(browser, url, rate, scene, dpr, profile)), rerun: x.errs };
      console.log(JSON.stringify({ round: r + 1, label, scene, rate, dpr, ...x }));
    }
  }
  await browser.close();
}

module.exports = { openPage, countFrames, frameStats, topSelf, SCENES };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
