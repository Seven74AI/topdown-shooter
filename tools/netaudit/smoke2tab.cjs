/* global require, process, __dirname, console, setTimeout, window, document */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
// Network pass two-tab smoke (brief addendum line 34; Story 8.8, review R6). NOT game code, not a test.
//
// Two headless Chromium tabs on the lossy line (?lag=150&jitter=20&loss=1&debug=1) + 2 bots on the
// same line (`npm run bots -- --room <code> --count 2 --lag 150 --jitter 20 --loss 1`), real server.
// Tab B's game loop sleeps 8 s (hidden-tab simulation) across the run start / first build start, the
// first event start, the first boss telegraph and the vote; it logs each tab's mirror World (phase,
// wave, boss state, decay stage, event, tick) on every change, screenshots both tabs, and stops when
// both tabs show Results (or after 15 min).
//
// Steps (your own ports; never `npm run dev`; stop every process by PID afterwards):
//   1. server:  (cd apps/server && PORT=<sp> DEV_START_WAVE=9 DEV_EVENTS=car_alarm@9 node --import tsx src/index.ts)
//      (other runs: DEV_BOSS_WAVES=1 for a telegraph early; no DEV_* balance override: the bots
//      would be refused with balance_mismatch)
//   2. client:  a temporary Vite config next to apps/client/vite.config.ts (local, not committed) that
//      merges it with { server: { port: <cp>, strictPort: true, proxy: { "/api": { target:
//      "http://localhost:<sp>", ws: true, rewrite: (p) => p.replace(/^\/api/, "") } } } }, then
//      (cd apps/client && npx vite --config <that file>)
//   3. node tools/netaudit/smoke2tab.cjs <outDir> [clientPort=5281] [serverPort=2681]
//   Report: docs/perf/network-pass-smoke-<date>.md (2026-11-25: three runs, results there).
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const OUT = process.argv[2];
const REPO = require("path").resolve(__dirname, "..", "..");
const CLIENT_PORT = Number(process.argv[3] || 5281);
const SERVER_PORT = Number(process.argv[4] || 2681);
const BASE = `http://localhost:${CLIENT_PORT}/`;
const Q = "?lag=150&jitter=20&loss=1&debug=1";
const t0 = Date.now();
const T = () => ((Date.now() - t0) / 1000).toFixed(1);
const log = [];
const note = (m) => { const l = `[${T()} s] ${m}`; log.push(l); console.log(l); };

const probe = (page) => page.evaluate(() => {
  const g = window.__game;
  if (!g) return { noGame: true };
  const s = g.scene.getScene("Game");
  const active = g.scene.isActive("Game");
  const h = s && s.host;
  const w = h && (h.world || h.mirror);
  const ev = document.querySelector('[data-testid="evac-vote"]');
  const res = document.querySelector(".results, [data-testid='results']");
  return {
    active,
    fps: Math.round(g.loop.actualFps),
    phase: w && w.run && w.run.phase,
    wave: w && w.waves && w.waves.number,
    boss: w && w.boss && w.boss.state,
    stage: w && w.decay && (w.decay.stage ?? w.decay.currentStage),
    tick: w && w.tick,
    event: w && w.special && w.special.active && w.special.active.kind >= 0 ? `kind ${w.special.active.kind} phase ${w.special.active.phase}` : null,
    vote: !!ev,
    results: !!res,
    hostKeys: h ? Object.keys(h).slice(0, 40).join(",") : null,
    runKeys: w && w.run ? Object.keys(w.run).join(",") : null,
  };
}).catch((e) => ({ err: String(e).slice(0, 120) }));

(async () => {
  const browser = await chromium.launch();
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") note(`${name} console.${m.type()}: ${m.text().slice(0, 200)}`); });
    page.on("pageerror", (e) => note(`${name} PAGEERROR ${String(e).slice(0, 300)}`));
    await page.goto(BASE + Q);
    return page;
  };
  const A = await mk("A");
  await A.fill('input[placeholder="Name"]', "TabA");
  await A.click("text=Create game");
  await A.waitForSelector(".lobby__code");
  const code = (await A.textContent(".lobby__code")).trim();
  note(`room ${code}`);
  const B = await mk("B");
  await B.fill('input[placeholder="Name"]', "TabB");
  await B.fill('input[placeholder="CODE"]', code);
  await B.click("button:has-text('Join')");
  await B.waitForSelector(".lobby__code");
  const bots = spawn("npx", ["tsx", "tools/bots/run.ts", "--url", `http://localhost:${SERVER_PORT}`, "--room", code, "--count", "2", "--lag", "150", "--jitter", "20", "--loss", "1", "--max-seconds", "1200"], { cwd: REPO });
  const botOut = fs.createWriteStream(`${OUT}/smoke-bots.log`);
  bots.stdout.pipe(botOut);
  bots.stderr.pipe(botOut);
  for (const p of [A, B]) {
    const ready = p.locator(".lobby button.btn", { hasText: /Ready/ }).first();
    if (await ready.count()) await ready.click().catch(() => {});
  }
  // Wait for 4 players, then start.
  for (let i = 0; i < 120; i++) {
    const n = await A.locator(".lobby__players li").count();
    if (n >= 4) break;
    await A.waitForTimeout(500);
  }
  await A.waitForTimeout(1500);
  await A.click("button.btn--start");
  note("start clicked");
  // Hidden tab across the run start / first build start (B sleeps 8 s).
  const sleepB = async (why) => {
    const before = await probe(B);
    await B.evaluate(() => window.__game.loop.sleep());
    await B.waitForTimeout(8000);
    await B.evaluate(() => window.__game.loop.wake());
    await B.waitForTimeout(3000);
    const after = await probe(B);
    const a = await probe(A);
    note(`B slept 8 s (${why}): before ${JSON.stringify({ phase: before.phase, wave: before.wave, boss: before.boss, tick: before.tick })} after ${JSON.stringify({ phase: after.phase, wave: after.wave, boss: after.boss, tick: after.tick, fps: after.fps })} A tick ${a.tick}`);
  };
  await A.waitForTimeout(1000);
  await sleepB("across the run start / build start");
  for (const p of [A, B]) { await p.mouse.move(560, 150); await p.mouse.down(); } // both tabs keep firing (aim right)
  let last = {};
  let shot = 0;
  let votedSlept = false;
  let telegraphSlept = false;
  let eventSlept = false;
  let firstProbe = true;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const a = await probe(A);
    const b = await probe(B);
    if (firstProbe) { note(`host keys: ${a.hostKeys} | run keys: ${a.runKeys}`); firstProbe = false; }
    const key = JSON.stringify({ phase: a.phase, wave: a.wave, boss: a.boss, stage: a.stage, event: a.event, vote: a.vote, results: a.results });
    if (key !== last.key) {
      note(`A ${key} fps ${a.fps} tick ${a.tick} | B phase ${b.phase} wave ${b.wave} boss ${b.boss} fps ${b.fps} tick ${b.tick} vote ${b.vote}`);
      last.key = key;
      await A.screenshot({ path: `${OUT}/A-${String(shot).padStart(2, "0")}-${a.phase}-w${a.wave}.png` }).catch(() => {});
      await B.screenshot({ path: `${OUT}/B-${String(shot).padStart(2, "0")}-${b.phase}-w${b.wave}.png` }).catch(() => {});
      shot++;
    }
    if (a.boss === 3 && !telegraphSlept) { telegraphSlept = true; await sleepB("across a boss telegraph"); continue; }
    if (a.event && !eventSlept) { eventSlept = true; await sleepB(`across an event start (${a.event})`); continue; }
    if (a.vote && !votedSlept) {
      votedSlept = true;
      await A.screenshot({ path: `${OUT}/A-vote.png` }).catch(() => {});
      await sleepB("across the vote");
      await A.click("button:has-text('Extract')").catch(() => {});
      continue;
    }
    if (a.results && b.results) { note("both tabs on Results"); break; }
    if (a.phase === "results" && b.phase === "results") { note("both tabs: results phase"); await A.waitForTimeout(3000); break; }
    await A.waitForTimeout(1000);
  }
  await A.screenshot({ path: `${OUT}/A-end.png` }).catch(() => {});
  await B.screenshot({ path: `${OUT}/B-end.png` }).catch(() => {});
  bots.kill("SIGINT");
  await new Promise((r) => setTimeout(r, 3000));
  fs.writeFileSync(`${OUT}/smoke.log`, log.join("\n") + "\n");
  await browser.close();
  process.exit(0);
})().catch((e) => { note(`FATAL ${e && e.stack}`); fs.writeFileSync(`${OUT}/smoke.log`, log.join("\n") + "\n"); process.exit(1); });
