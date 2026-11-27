/* global require, process, console, window, performance, requestAnimationFrame, module, localStorage, document, fetch */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
// Story 10.2 (B2, "the 9.13 way"): the frame-rate pass measuring script. CommonJS like docs/art/9-14/perf.cjs, run with
// the preinstalled Playwright + Chromium (headless, SwiftShader: the CPU draws, so the frame is fill-bound).
//
//   NODE_PATH=$(npm root -g) node tools/perf/fps.cjs <label=dist:<dir>|label=url> […] [rounds]
//   e.g. node tools/perf/fps.cjs before=dist:/tmp/dist-before after=dist:apps/client/dist 2
//   (`dist:` targets are served in this process on an OS-picked port, bundle-checked: the safe way, review M2)
//   A target may carry its own extra URL switches after a `|`: `lowfx=http://127.0.0.1:5322|&fx=low`.
//
// Env: RATES=1,4 (CDP CPU throttling), SCENES=stage1,wave9, DPRS=2, QUERY=&fx=low (extra URL switches for every page),
// RESOLUTION=sharp|balanced|fast (the stored Resolution setting, Story 10.2-Q2),
// PROFILE=1 (one CDP Profiler capture of the count at the LAST rate per scene and target: top self-time functions),
// WARM_MS / COUNT_MS (8000 / 12000). Prints one JSON line per row. Every row asserts the scene: frames counted
// (≥ 60 at 4×, else the row is thrown out and re-run once), 150 alive, ≥ 140 in view, the stage and darkness asked for.
// Exports the page/throttle helpers for Story 10.3.
const { chromium } = require("playwright");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { createServer } = require("./serveDist.cjs");

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
  // RESOLUTION=balanced|fast (Story 10.2-Q2): the stored Resolution setting, set before the game reads it
  if (process.env.RESOLUTION) await p.addInitScript((r) => { try { localStorage.setItem("topdown-shooter.settings", JSON.stringify({ resolution: r })); } catch { /* none */ } }, process.env.RESOLUTION);
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
  const [root, extra = ""] = base.split("|"); // `label=url|&ab=x`: extra switches for this target only
  const { page: p, cdp } = await openPage(browser, `${root}/${sc.query}${QUERY}${extra}`, rate, dpr);
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
  const canvasW = await p.evaluate(() => document.querySelector("#game canvas")?.width ?? 0); // Resolution check: 844 × the step's ratio
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
    inView: probe.inView, canvasW, heapMB: Math.round(heap / 1048576), load: +((l0 + l1) / 2).toFixed(2), top, errs,
  };
}

/** The main bundle a dist's index.html loads (`assets/main-<hash>.js`). */
function mainBundleOf(dir) {
  const m = /assets\/main-[\w-]+\.js/.exec(fs.readFileSync(path.join(dir, "index.html"), "utf8"));
  if (!m) throw new Error(`no main bundle in ${dir}/index.html`);
  return m[0];
}

/**
 * Review M2 (10.2): `label=dist:<dir>` targets are served IN this process (10.4's `serveDist`, the Caddy headers) on a
 * port the OS picks: no `vite preview`, no wrapper PID to kill, no port another server can hold. Before measuring,
 * the served index must load that dist's own main bundle (a stale server can't answer for it). `label=<url>` targets
 * are used as given. Returns the URLs and a close function.
 */
async function serveTargets(targets) {
  const servers = [];
  const out = [];
  for (const [label, spec] of targets) {
    if (!spec.startsWith("dist:")) {
      out.push([label, spec]);
      continue;
    }
    const [dirRaw, extra = ""] = spec.slice(5).split("|");
    const dir = path.resolve(dirRaw);
    const server = createServer(dir);
    await new Promise((res, rej) => server.once("error", rej).listen(0, "127.0.0.1", res));
    servers.push(server);
    const url = `http://127.0.0.1:${server.address().port}`;
    const want = mainBundleOf(dir);
    const html = await (await fetch(`${url}/`)).text();
    if (!html.includes(want)) throw new Error(`${label}: ${url} does not serve ${dir} (${want})`);
    console.error(`[fps] ${label}: ${dir} (${want}) on ${url}`);
    out.push([label, extra ? `${url}|${extra}` : url]);
  }
  return { targets: out, close: () => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))) };
}

async function main() {
  const served = await serveTargets(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
  const targets = served.targets;
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
      console.log(JSON.stringify({ round: r + 1, label, scene, rate, dpr, resolution: process.env.RESOLUTION || "sharp", ...x }));
    }
  }
  await browser.close();
  await served.close();
}

module.exports = { openPage, countFrames, frameStats, topSelf, serveTargets, mainBundleOf, SCENES };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
