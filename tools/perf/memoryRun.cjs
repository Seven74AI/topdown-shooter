/* global require, process, console, window, localStorage, module, __dirname, setTimeout */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
// Story 10.3: the memory and battery pass (decisions 10.3-B1 … B5). Headless Chromium (SwiftShader), 844 × 390, DPR 2,
// on a solo DEV build (the run is driven through the dev-only `window.__memRun`, `apps/client/src/debug/memProbe.ts`).
//
//   NODE_PATH=$(npm root -g) node tools/perf/memoryRun.cjs [run|battery|restart|all] [--url http://127.0.0.1:5391]
//
// Without --url the script runs its own Vite dev server (apps/client) in this process, on a port the OS picks, with no
// file watching (AGENTS §6: never `npm run dev`, never pkill). Prints one JSON line per sample / window / run.
//
// - run (B1–B3): a full 10-wave solo run at 1× (`?solo&loadout=assault_rifle:4,shotgun:4`), god mode, the stress fire
//   input (holds fire at the nearest zombie), Ready in every build, a wave still running after 240 s is skipped once
//   (logged), Extract in the vote. At the start of every build phase and at Results: CDP GC, then
//   `Performance.getMetrics` (heap used / total, DOM nodes, listeners) + `__mem()` (textures, estimate, canvases).
//   A heap snapshot splits the heap: `jsMB` = heap used − V8's compiled code (the code part grows as functions get
//   optimised: a JIT warm-up). Exits non-zero unless 10 waves started, the Behemoth was seen, Extract and Results were
//   reached, and (B3) every build phase after wave 2 is within 5 % (jsMB, texture estimate) of the first build phase of
//   its decay stage.
// - battery (B4): at 4× CPU (RATE=), waves 1, 5, 9 (`?startwave=`), Battery saver off and on: a window of up to 60 s
//   inside the wave, holding no fire (the wave's horde on screen, no kills; shorter if the wave ends first: the numbers are
//   per minute), 20 s after the wave starts, of TaskDuration / ScriptDuration /
//   LayoutDuration deltas, frames drawn and sim ticks. SETTINGS='{"resolution":"fast"}' adds stored settings.
// - restart (B5): wave 1 → Game over → Restart, 4 runs (the first + 3 restarts); a GC'd sample at each Results; runs
//   2–4 within 5 % of run 1 (jsMB, object count, textures).
const { chromium } = require("playwright");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const LOADOUT = "assault_rifle:4,shotgun:4";
const WAVE_SKIP_S = 240;
const RUN_WAVES = 10;
/** B4: the battery windows' CPU throttling (RATE=1 for a 1× row). */
const RATE = Number(process.env.RATE || 4);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (o) => console.log(JSON.stringify(o));

/**
 * The Vite dev server, in this process (closed at the end: no PID to kill, no port another server can hold). No file
 * watching and no HMR: an edit to the tree while a run is measuring must not reload the page (it did once: the run
 * lost its page in wave 10). Modules are compiled on the first load and kept.
 */
async function startVite() {
  const { createServer } = await import("vite");
  const root = path.join(ROOT, "apps/client");
  const server = await createServer({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
  await server.listen();
  const url = server.resolvedUrls.local[0].replace(/\/$/, "");
  console.error(`[mem] vite dev (in process ${process.pid}, no watch) on ${url}`);
  return { url, stop: () => server.close() };
}

async function metrics(cdp) {
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  const o = {};
  for (const x of m) o[x.name] = x.value;
  return o;
}

/**
 * B5: a heap snapshot's JS-heap self sizes split into the game's objects and V8's compiled code (type "code": machine
 * code, feedback vectors, bytecode; "native" / "synthetic" nodes, the DOM and buffer backing stores, are left out). Restart × 3 grows the code part as more functions get optimised (a JIT warm-up, not a
 * leak: the object counts stay flat), so the B3 and B5 rules use `jsMB` = heap used − code (the whole heap is recorded too).
 */
async function heapSplit(cdp) {
  const chunks = [];
  const h = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", h);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", h);
  const snap = JSON.parse(chunks.join(""));
  const f = snap.snapshot.meta.node_fields;
  const types = snap.snapshot.meta.node_types[0];
  const ti = f.indexOf("type");
  const si = f.indexOf("self_size");
  let code = 0;
  let objects = 0;
  let count = 0;
  for (let i = 0; i < snap.nodes.length; i += f.length) {
    const size = snap.nodes[i + si];
    const type = types[snap.nodes[i + ti]];
    if (type === "code") code += size;
    else if (type === "native" || type === "synthetic") continue; // DOM / ArrayBuffer backing stores: outside the JS heap
    else {
      objects += size;
      count++;
    }
  }
  return { objectsMB: +(objects / 1048576).toFixed(1), codeMB: +(code / 1048576).toFixed(1), objectCount: count };
}

/** A GC'd sample plus the snapshot split; `jsMB` = heap used − compiled code (the B3 / B5 rule's "heap"). */
async function fullSample(page, cdp, extra) {
  const row = { ...(await sample(page, cdp, extra)), ...(await heapSplit(cdp)) };
  row.jsMB = +(row.heapUsedMB - row.codeMB).toFixed(1);
  return row;
}

/** B2: a forced GC, then the CDP metrics and the texture probe. */
async function sample(page, cdp, extra) {
  await cdp.send("HeapProfiler.collectGarbage");
  await sleep(300);
  await cdp.send("HeapProfiler.collectGarbage");
  const m = await metrics(cdp);
  const mem = await page.evaluate(() => window.__mem());
  const st = await page.evaluate(() => window.__memRun.state());
  const row = {
    ...extra,
    wave: st.wave,
    stage: st.stage,
    heapUsedMB: +(m.JSHeapUsedSize / 1048576).toFixed(1),
    heapTotalMB: +(m.JSHeapTotalSize / 1048576).toFixed(1),
    nodes: m.Nodes,
    listeners: m.JSEventListeners,
    textures: mem.textures,
    textureMB: mem.textureMB,
    canvases: mem.canvases,
    load: +os.loadavg()[0].toFixed(2),
  };
  // A sampler that read nothing must fail, not pass.
  if (!(row.heapUsedMB > 0) || !(row.textures > 0) || !(row.textureMB > 0)) throw new Error(`empty sample ${JSON.stringify(row)}`);
  return row;
}

/**
 * A page like fps.cjs's `openPage` (844 × 390, DPR 2, CPU ×`rate`), on the dev build: it waits for the memory probe
 * and the characters' bake (fps.cjs waits for `__stress`, which only a `?stress` page has). `settings`: stored
 * settings set before the game reads them (Battery saver).
 */
async function newRunPage(browser, url, query, rate, settings) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  if (settings) await page.addInitScript((s) => { try { localStorage.setItem("topdown-shooter.settings", JSON.stringify(s)); } catch { /* none */ } }, settings);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await cdp.send("Performance.enable");
  await page.goto(`${url}/?solo&loadout=${LOADOUT}${query}`);
  await page.waitForFunction(() => window.__memRun && window.__memRun.state().phase !== null && (!window.__charBake || window.__charBake.doneMs > 0), null, { timeout: 240000 });
  return { page, cdp };
}

const state = (page) => page.evaluate(() => window.__memRun.state());

async function pinSeed(page, seed) {
  await page.evaluate((s) => window.__memRun.seed(s), seed);
  await sleep(1500);
  await page.waitForFunction(() => window.__memRun.state().phase !== null, null, { timeout: 60000 });
  if (!(await page.evaluate(() => window.__memRun.setup()))) throw new Error("setup failed");
}

/** B1–B3: the whole run. */
async function fullRun(browser, url) {
  const { page, cdp } = await newRunPage(browser, url, "", 1);
  await pinSeed(page, 1003);
  const t0 = Date.now();
  const rows = [];
  const skipped = [];
  let lastBuildWave = -1;
  let lastWave = 0;
  let waveStartMs = 0;
  let skippedThis = false;
  let bossSeen = false;
  let bossDead = false;
  let voted = false;
  for (;;) {
    const st = await state(page);
    if (st.boss) bossSeen = true;
    if (st.bossDead) bossDead = true;
    if (st.phase === "build" && st.wave !== lastBuildWave) {
      lastBuildWave = st.wave;
      const row = await fullSample(page, cdp, { kind: "build", afterWave: st.wave, tS: Math.round((Date.now() - t0) / 1000) });
      rows.push(row);
      log(row);
      await page.evaluate(() => window.__memRun.ready());
    } else if (st.phase === "build") {
      await page.evaluate(() => window.__memRun.ready());
    }
    if (st.phase === "wave" && st.wave !== lastWave) {
      lastWave = st.wave;
      waveStartMs = Date.now();
      skippedThis = false;
      console.error(`[mem] wave ${st.wave} started (stage ${st.stage}) at ${Math.round((Date.now() - t0) / 1000)} s`);
    }
    if (st.phase === "wave" && !skippedThis && Date.now() - waveStartMs > WAVE_SKIP_S * 1000) {
      skippedThis = true;
      skipped.push(st.wave);
      console.error(`[mem] wave ${st.wave} still running after ${WAVE_SKIP_S} s: skip wave`);
      await page.evaluate(() => window.__memRun.skipWave());
    }
    if (st.phase === "vote" && !voted) {
      voted = true;
      await page.evaluate(() => window.__memRun.voteExtract());
    }
    if (st.ui === "results" || st.phase === "results") {
      await sleep(3000);
      const row = await fullSample(page, cdp, { kind: "results", ending: st.ending, tS: Math.round((Date.now() - t0) / 1000) });
      rows.push(row);
      log(row);
      break;
    }
    if (Date.now() - t0 > 60 * 60 * 1000) throw new Error("the run took over an hour");
    await sleep(1000);
  }
  await page.close();
  const errs = [];
  if (lastWave < RUN_WAVES) errs.push(`only ${lastWave} waves started`);
  if (!bossSeen) errs.push("the Behemoth never spawned");
  if (!voted) errs.push("no extract vote");
  const ending = rows[rows.length - 1].ending;
  if (ending !== "extracted") errs.push(`ending ${ending}`);
  // B3: after wave 2, the JS objects (heap minus V8's compiled code) and the texture estimate of every build phase stay
  // within 5 % of the first build phase of the same decay stage (wave 2's build for the stage it is in): a stage change
  // may add (the doc names each jump), a stage must not climb wave after wave. The whole heap is recorded too.
  const builds = rows.filter((r) => r.kind === "build");
  const ref = (r) => (r.stage === builds.find((b) => b.afterWave === 2).stage ? builds.find((b) => b.afterWave === 2) : builds.find((b) => b.stage === r.stage && b.afterWave > 2));
  const growth = builds.filter((r) => r.afterWave > 2).map((r) => {
    const b = ref(r);
    return { afterWave: r.afterWave, stage: r.stage, vsWave: b.afterWave, js: +(r.jsMB / b.jsMB).toFixed(3), tex: +(r.textureMB / b.textureMB).toFixed(3), heap: +(r.heapUsedMB / b.heapUsedMB).toFixed(3) };
  });
  for (const g of growth) if (g.js > 1.05 || g.tex > 1.05) errs.push(`B3: build after wave ${g.afterWave} ${JSON.stringify(g)}`);
  const peak = { heapUsedMB: Math.max(...rows.map((r) => r.heapUsedMB)), jsMB: Math.max(...rows.map((r) => r.jsMB)), textureMB: Math.max(...rows.map((r) => r.textureMB)) };
  log({ kind: "run", waves: lastWave, bossSeen, bossDead, voted, ending, skipped, minutes: +((Date.now() - t0) / 60000).toFixed(1), peak, growth, errs });
  return errs;
}

/** B4: one window at 4×, Battery saver off or on. */
async function batteryWindow(browser, url, wave, saver) {
  // SETTINGS='{"resolution":"fast"}': extra stored settings for every window (a lighter frame, so the cap can engage)
  const extra = process.env.SETTINGS ? JSON.parse(process.env.SETTINGS) : {};
  const settings = { ...extra, ...(saver ? { batterySaver: true } : {}) };
  const { page, cdp } = await newRunPage(browser, url, `&startwave=${wave}`, RATE, Object.keys(settings).length ? settings : null);
  await pinSeed(page, 2000 + wave);
  await page.evaluate(() => window.__memRun.fire(false)); // the horde stays: no kills, so the wave lasts the window
  for (let i = 0; i < 600; i++) {
    const st = await state(page);
    if (st.phase === "wave") break;
    await page.evaluate(() => window.__memRun.ready());
    await sleep(250);
  }
  await sleep(20000); // the wave's spawns arrive
  const m0 = await metrics(cdp);
  const d0 = await page.evaluate(() => window.__memRun.drawn());
  const s0 = await state(page);
  const t0 = Date.now();
  let st = s0;
  while (Date.now() - t0 < 60000) {
    await sleep(1000);
    st = await state(page);
    if (st.phase !== "wave") break;
  }
  const m1 = await metrics(cdp);
  const d1 = await page.evaluate(() => window.__memRun.drawn());
  const s = (Date.now() - t0) / 1000;
  await page.close();
  const perMin = (k) => +(((m1[k] - m0[k]) / s) * 60).toFixed(1);
  const row = {
    kind: "battery", rate: RATE, settings: process.env.SETTINGS || "", wave, stage: s0.stage, batterySaver: saver, windowS: +s.toFixed(1),
    busySPerMin: perMin("TaskDuration"), scriptSPerMin: perMin("ScriptDuration"), layoutSPerMin: perMin("LayoutDuration"),
    framesPerS: +((d1 - d0) / s).toFixed(1), ticksPerS: +((st.tick - s0.tick) / s).toFixed(1), alive: s0.alive, load: +os.loadavg()[0].toFixed(2),
  };
  log(row);
  const errs = [];
  if (s < 20) errs.push(`wave ${wave}: window only ${s} s`);
  if (!(row.framesPerS > 0)) errs.push(`wave ${wave}: no frames drawn`);
  if (saver && row.framesPerS > 31) errs.push(`wave ${wave}: ${row.framesPerS} frames/s with Battery saver on`);
  if (row.ticksPerS < 18) errs.push(`wave ${wave}: ${row.ticksPerS} ticks/s`);
  return errs;
}

/** B5: wave 1 → Game over → Restart, 4 runs. */
async function restarts(browser, url) {
  const { page, cdp } = await newRunPage(browser, url, "", 1);
  const rows = [];
  for (let run = 1; run <= 4; run++) {
    if (!(await page.evaluate(() => window.__memRun.setup()))) throw new Error("setup failed");
    for (let i = 0; i < 400; i++) {
      const st = await state(page);
      if (st.phase === "wave") break;
      await page.evaluate(() => window.__memRun.ready());
      await sleep(250);
    }
    await sleep(20000);
    await page.evaluate(() => window.__memRun.gameOver());
    await page.waitForFunction(() => window.__memRun.state().ui === "results", null, { timeout: 30000 });
    await sleep(3000);
    const row = await fullSample(page, cdp, { kind: "restart", run });
    rows.push(row);
    log(row);
    if (run < 4) {
      await page.evaluate(() => window.__memRun.restart());
      await page.waitForFunction(() => window.__memRun.state().ui === "playing" && window.__memRun.state().phase !== null, null, { timeout: 60000 });
      await sleep(1000);
    }
  }
  await page.close();
  const first = rows[0];
  const ratio = (a, b) => +(a / b).toFixed(3);
  const vs = rows.slice(1).map((r) => ({
    run: r.run, heap: ratio(r.heapUsedMB, first.heapUsedMB), js: ratio(r.jsMB, first.jsMB), objectCount: ratio(r.objectCount, first.objectCount),
    codeMB: +(r.codeMB - first.codeMB).toFixed(1), textures: ratio(r.textures, first.textures), listeners: r.listeners - first.listeners, nodes: r.nodes - first.nodes,
  }));
  // The rule (AC 3): the JS objects (heap − code), their count and the textures back to the first run ±5 %; the whole
  // heap is recorded (its compiled-code part grows as more functions get optimised: a JIT warm-up).
  const errs = vs.filter((v) => Math.abs(v.js - 1) > 0.05 || Math.abs(v.objectCount - 1) > 0.05 || Math.abs(v.textures - 1) > 0.05).map((v) => `restart ${v.run}: ${JSON.stringify(v)}`);
  log({ kind: "restarts", vs, errs });
  return errs;
}

async function main() {
  const mode = process.argv[2] || "all";
  const urlArg = process.argv.indexOf("--url");
  const vite = urlArg > 0 ? null : await startVite();
  const url = urlArg > 0 ? process.argv[urlArg + 1] : vite.url;
  const browser = await chromium.launch();
  const errs = [];
  try {
    if (mode === "restart" || mode === "all") errs.push(...(await restarts(browser, url)));
    if (mode === "battery" || mode === "all") for (const w of [1, 5, 9]) for (const saver of [false, true]) errs.push(...(await batteryWindow(browser, url, w, saver)));
    if (mode === "run" || mode === "all") errs.push(...(await fullRun(browser, url)));
  } finally {
    await browser.close();
    if (vite) await vite.stop();
  }
  if (errs.length) {
    console.error(`[mem] FAILED: ${errs.join("; ")}`);
    process.exit(1);
  }
}

module.exports = { sample, metrics };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
