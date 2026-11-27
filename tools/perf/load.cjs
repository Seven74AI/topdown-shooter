/* global require, process, console, window, document, performance */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
/*
 * Story 10.4 (B1, B2, B4; AC 1–3): load times of a release build, served like production (tools/perf/serveDist.cjs).
 * Headless Chromium at 844 × 390 DPR 2, CDP network + CPU throttling. Per profile × CPU rate, `--runs` (default 3) of:
 *   first  – a new browser context (empty cache): "playable" = the start screen's Practice solo button is on screen and
 *            enabled (its handler is registered in the same step); bytes = Σ Network.loadingFinished.encodedDataLength
 *            until then. Liveness: Practice solo is tapped and the Game scene must start (`window.__charBake` appears).
 *   return – a new page in the same context (warm HTTP cache): "playable" again, with requests answered from the cache
 *            vs the network (all /assets/* should come from the cache; index.html is revalidated).
 *   solo   – `?solo` in a new context: → the Game scene running (its create bakes the first city), → characters baked
 *            (`__charBake.doneMs`), bytes until the bake is done.
 * Loading screen (AC 2): sampled every ~100 ms; visible at 1 s, its progress never goes backwards, gone once the start
 * screen is up. A run that doesn't reach "playable" in 60 s fails (no number).
 *
 * Usage: node tools/perf/load.cjs [--dir apps/client/dist] [--runs 3] [--label after] [--profiles slow4g,fast4g] [--cpu 4,1]
 * Prints one JSON line per load, then a median table (Markdown).
 */
const path = require("node:path");
const { chromium } = require("playwright");
const { createServer } = require("./serveDist.cjs");

const PROFILES = {
  // DevTools' "Slow 4G" (the 9.14 profile): the one the < 10 s / < 3 s targets are judged on.
  slow4g: { offline: false, latency: 562.5, downloadThroughput: (1.6e6 * 0.9) / 8, uploadThroughput: (750e3 * 0.9) / 8 },
  // DevTools' "Fast 4G": recorded alongside.
  fast4g: { offline: false, latency: 165, downloadThroughput: (10e6 * 0.9) / 8, uploadThroughput: (2e6 * 0.9) / 8 },
};
const TIMEOUT_MS = 60_000;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const DIR = path.resolve(arg("--dir", path.join(__dirname, "../../apps/client/dist")));
const RUNS = Number(arg("--runs", "3"));
const LABEL = arg("--label", "build");
const PROFILE_NAMES = arg("--profiles", "slow4g,fast4g").split(",");
const CPU_RATES = arg("--cpu", "4,1").split(",").map(Number);

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

/** Network + CPU throttling and a request log on a page. */
async function instrument(ctx, page, profile, cpu) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", PROFILES[profile]);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const log = { bytes: 0, requests: [], byId: new Map(), stopAt: Infinity };
  cdp.on("Network.requestWillBeSent", (e) => {
    const r = { url: e.request.url, fromCache: false, status: 0, bytes: 0 };
    log.byId.set(e.requestId, r);
    log.requests.push(r);
  });
  cdp.on("Network.requestServedFromCache", (e) => {
    const r = log.byId.get(e.requestId);
    if (r) r.fromCache = true;
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = log.byId.get(e.requestId);
    if (!r) return;
    r.status = e.response.status;
    if (e.response.fromDiskCache || e.response.fromPrefetchCache) r.fromCache = true;
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = log.byId.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
    if (Date.now() <= log.stopAt) log.bytes += e.encodedDataLength;
  });
  return log;
}

/** Samples the loading screen every ~100 ms (page time): [ms, progress | "gone"]. */
const SAMPLER = `(() => {
  const s = (window.__blSamples = []);
  let seen = false;
  const tick = () => {
    const el = document.getElementById("boot-loader");
    if (el) seen = true;
    if (el || seen || performance.now() > 5000) s.push([Math.round(performance.now()), el ? Number(el.getAttribute("data-progress")) : "gone", el ? getComputedStyle(el).display !== "none" : false]);
    if (el || (!seen && performance.now() <= 5000)) setTimeout(tick, el ? 100 : 20);
  };
  tick();
})();`;

async function playable(page) {
  const handle = await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Practice solo");
      return b && !b.disabled && b.offsetParent !== null ? Math.round(performance.now()) : 0;
    },
    null,
    { timeout: TIMEOUT_MS, polling: 50 },
  );
  return handle.jsonValue();
}

function loaderCheck(samples, playableMs, goneMs) {
  const shown = samples.filter((s) => s[1] !== "gone");
  const at1s = shown.find((s) => s[0] >= 900 && s[0] <= 1500);
  let backwards = 0;
  for (let i = 1; i < shown.length; i++) if (shown[i][1] < shown[i - 1][1]) backwards++;
  const gone = shown.length > 0 ? goneMs : null; // a page without the loading screen (master) never showed one
  return {
    firstSampleMs: shown[0] ? shown[0][0] : null,
    visibleAt1s: !!(at1s && at1s[2]),
    movingBy2s: shown.some((s) => s[0] <= 2000 && s[1] > 0),
    backwards,
    goneMs: gone,
    goneAfterPlayable: gone !== null && gone >= playableMs - 150,
  };
}

async function firstAndReturn(browser, base, profile, cpu) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(SAMPLER);
  const log = await instrument(ctx, page, profile, cpu);
  await page.goto(base + "/", { waitUntil: "commit" });
  const ms = await playable(page);
  log.stopAt = Date.now();
  const goneMs = await (await page.waitForFunction(() => (document.getElementById("boot-loader") ? 0 : Math.round(performance.now())), null, { timeout: 5000, polling: "raf" })).jsonValue();
  const loader = loaderCheck(await page.evaluate(() => window.__blSamples), ms, goneMs);
  const first = { kind: "first", playableMs: ms, bytes: log.bytes, requests: log.requests.length, loader };
  // Liveness: Practice solo really starts a run (the Game scene's create starts the character bake).
  await page.getByRole("button", { name: "Practice solo" }).click();
  await page.waitForFunction(() => !!window.__charBake, null, { timeout: TIMEOUT_MS });
  await page.close();

  const again = await ctx.newPage();
  await again.addInitScript(SAMPLER);
  const log2 = await instrument(ctx, again, profile, cpu);
  await again.goto(base + "/", { waitUntil: "commit" });
  const ms2 = await playable(again);
  log2.stopAt = Date.now();
  const assets = log2.requests.filter((r) => r.url.includes("/assets/"));
  const doc = log2.requests.find((r) => !r.url.includes("/assets/"));
  const back = {
    kind: "return",
    playableMs: ms2,
    bytes: log2.bytes,
    assetsFromCache: assets.filter((r) => r.fromCache).length,
    assetsFromNetwork: assets.filter((r) => !r.fromCache).map((r) => r.url.replace(base, "")),
    indexStatus: doc ? doc.status : null, // 304 = revalidated
    indexBytes: doc ? doc.bytes : null,
  };
  await ctx.close();
  return [first, back];
}

async function solo(browser, base, profile, cpu) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const log = await instrument(ctx, page, profile, cpu);
  await page.goto(base + "/?solo", { waitUntil: "commit" });
  const runMs = await (await page.waitForFunction(() => (window.__charBake ? Math.round(performance.now()) : 0), null, { timeout: TIMEOUT_MS, polling: 50 })).jsonValue();
  const bakedMs = await (
    await page.waitForFunction(() => (window.__charBake && window.__charBake.doneMs > 0 ? Math.round(window.__charBake.doneMs) : 0), null, { timeout: 120_000, polling: 100 })
  ).jsonValue();
  log.stopAt = Date.now();
  await ctx.close();
  return { kind: "solo", runMs, charBakedMs: bakedMs, bytes: log.bytes };
}

(async () => {
  const server = createServer(DIR);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const profile of PROFILE_NAMES) {
      for (const cpu of CPU_RATES) {
        const runs = [];
        for (let i = 0; i < RUNS; i++) {
          const [first, back] = await firstAndReturn(browser, base, profile, cpu);
          const s = await solo(browser, base, profile, cpu);
          for (const r of [first, back, s]) console.log(JSON.stringify({ label: LABEL, profile, cpu, run: i + 1, ...r }));
          if (!(first.bytes > 0 && back.playableMs > 0 && s.runMs > 0)) throw new Error("liveness: a load did nothing");
          runs.push({ first, back, s });
        }
        rows.push({
          profile,
          cpu,
          first: median(runs.map((r) => r.first.playableMs)),
          firstMB: (median(runs.map((r) => r.first.bytes)) / 1e6).toFixed(2),
          ret: median(runs.map((r) => r.back.playableMs)),
          retCache: `${median(runs.map((r) => r.back.assetsFromCache))} cache / ${median(runs.map((r) => r.back.assetsFromNetwork.length))} net`,
          soloRun: median(runs.map((r) => r.s.runMs)),
          soloBaked: median(runs.map((r) => r.s.charBakedMs)),
          soloMB: (median(runs.map((r) => r.s.bytes)) / 1e6).toFixed(2),
          loader: runs.every((r) => r.first.loader.visibleAt1s && r.first.loader.movingBy2s && r.first.loader.backwards === 0 && r.first.loader.goneAfterPlayable) ? "ok" : "CHECK",
        });
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n| build | network | CPU | first visit → playable (ms) | bytes (MB) | return visit → playable (ms) | return: /assets/ from | ?solo → run (ms) | ?solo → characters baked (ms) | ?solo bytes (MB) | loading screen |`);
  console.log(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const r of rows) console.log(`| ${LABEL} | ${r.profile} | ${r.cpu}× | ${r.first} | ${r.firstMB} | ${r.ret} | ${r.retCache} | ${r.soloRun} | ${r.soloBaked} | ${r.soloMB} | ${r.loader} |`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
