/* global require, process, console, window, document, WebSocket */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
// Story 8.1 two-tab reconnect smoke (network pass brief line 34). NOT game code, not a test.
//
// Two headless Chromium tabs (?lag=150&jitter=20&debug=1; add &loss=1 once Story 8.8's lossy line is
// on master), real server, mid-wave. Tab B goes through four connection faults; the script times what
// each tab shows ("Connection lost, reconnecting…" on B, the grey "TabB · reconnecting" chip and
// "TabB is back" on A) and screenshots them:
//   1. silent cut 8 s: B's sockets carry nothing either way (held, then delivered in order; no close:
//      a dead spot the browser doesn't notice) — B's 3 s watchdog must close and reconnect;
//   2. a hidden tab 6 s (the game loop sleeps): the server holds B as quiet after 3 s;
//   3. offline 8 s (Playwright context.setOffline: airplane mode);
//   4. a reload mid-wave: sessionStorage takes the seat straight back.
// Steps (own ports; never `npm run dev`; stop each process by PID afterwards):
//   1. server: (cd apps/server && PORT=2812 HOST=127.0.0.1 ALLOW_SOLO_START=1 ALLOW_TEST_SCENARIOS=1 node --import tsx src/index.ts)
//      (the host creates the god-mode `net150` run, SMOKE_SCENARIO= to turn it off)
//   2. client: a local Vite config merging apps/client/vite.config.ts with port 5811 and /api → :2812 (not committed)
//   3. node tools/netaudit/smokeReconnect.cjs <outDir> [clientPort=5811]
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.argv[2] || ".";
const CLIENT_PORT = Number(process.argv[3] || 5811);
const BASE = `http://127.0.0.1:${CLIENT_PORT}/`;
const Q = process.env.SMOKE_QUERY || "?lag=150&jitter=20&debug=1";
/** The host's create asks for the god-mode `net150` scenario (server ALLOW_TEST_SCENARIOS=1): a tab alone can't wipe the run while the other is held. */
const HOST_Q = Q + (process.env.SMOKE_SCENARIO === "" ? "" : `&scenario=${process.env.SMOKE_SCENARIO || "net150"}`);
const t0 = Date.now();
const T = () => ((Date.now() - t0) / 1000).toFixed(1);
const results = [];
const note = (m) => {
  const l = `[${T()} s] ${m}`;
  results.push(l);
  console.log(l);
};

/**
 * Wraps WebSocket so the script can cut a tab's line like a dead spot: while `window.__cutUntil` is
 * ahead, nothing goes out or comes in; what was sent or received meanwhile waits and then flows in
 * order when the cut ends (TCP retransmits), on sockets that are still open. No close is reported.
 */
const CUT_INIT = () => {
  const W = window.WebSocket;
  window.__cutUntil = 0;
  window.__cutHeld = 0;
  const cut = () => Date.now() < window.__cutUntil;
  const waiting = [];
  const flush = () => {
    if (cut()) return;
    while (waiting.length > 0) {
      const f = waiting.shift();
      try {
        f();
      } catch {
        // a socket that closed meanwhile
      }
    }
  };
  setInterval(flush, 20);
  window.WebSocket = class extends W {
    constructor(...a) {
      super(...a);
      const send = this.send.bind(this);
      this.send = (d) => {
        if (cut() || waiting.length > 0) {
          window.__cutHeld++;
          waiting.push(() => this.readyState === 1 && send(d));
          return;
        }
        send(d);
      };
      let handler = null;
      super.onmessage = (ev) => {
        if (cut() || waiting.length > 0) {
          window.__cutHeld++;
          waiting.push(() => handler && handler.call(this, ev));
          return;
        }
        if (handler) handler.call(this, ev);
      };
      Object.defineProperty(this, "onmessage", { get: () => handler, set: (h) => (handler = h) });
    }
  };
};

const probe = (page) =>
  page
    .evaluate(() => {
      const g = window.__game;
      const s = g && g.scene.getScene("Game");
      const h = s && s.host;
      const w = h && h.world;
      const panel = document.querySelector(".link-panel p");
      const paused = document.querySelector(".link-paused p");
      const chips = [...document.querySelectorAll(".held-chip")].map((e) => e.textContent);
      return { active: g ? g.scene.isActive("Game") : false, phase: w && w.run && w.run.phase, wave: w && w.waves && w.waves.number, panel: panel && panel.textContent, paused: paused && paused.textContent, chips };
    })
    .catch((e) => ({ err: String(e).slice(0, 120) }));

async function waitFor(page, pred, ms, step = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const p = await probe(page);
    if (pred(p)) return { ok: true, p, at: Date.now() };
    if (Date.now() > end) return { ok: false, p, at: Date.now() };
    await page.waitForTimeout(step);
  }
}

(async () => {
  const browser = await chromium.launch();
  const mk = async (name, q = Q) => {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(CUT_INIT);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => note(`${name} PAGEERROR ${String(e).slice(0, 300)}`));
    await page.goto(BASE + q);
    return { ctx, page };
  };
  const { page: A } = await mk("A", HOST_Q);
  await A.fill('input[placeholder="Name"]', "TabA");
  await A.click("text=Create game");
  await A.waitForSelector(".lobby__code");
  const code = (await A.textContent(".lobby__code")).trim();
  note(`room ${code}`);
  const { page: B, ctx: Bctx } = await mk("B");
  await B.fill('input[placeholder="Name"]', "TabB");
  await B.fill('input[placeholder="CODE"]', code);
  await B.click("button:has-text('Join')");
  await B.waitForSelector(".lobby__code");
  for (const p of [A, B]) {
    const ready = p.locator(".lobby button.btn", { hasText: /Ready/ }).first();
    if (await ready.count()) await ready.click().catch(() => {});
  }
  await A.waitForTimeout(1500);
  await A.click("button.btn--start");
  note("start clicked");
  // Both tabs Ready in the build phase (the Ready button), then into the wave.
  for (let i = 0; i < 60; i++) {
    for (const p of [A, B]) await p.keyboard.press("r").catch(() => {});
    const a = await probe(A);
    if (a.phase === "wave") break;
    for (const p of [A, B]) await p.locator("text=Ready").first().click({ timeout: 300 }).catch(() => {});
    await A.waitForTimeout(500);
  }
  const w = await waitFor(A, (p) => p.phase === "wave", 60000);
  note(`wave: ${w.ok} ${JSON.stringify(w.p)}`);
  for (const p of [A, B]) {
    await p.mouse.move(500, 150);
    await p.mouse.down();
  }
  await A.waitForTimeout(2000);

  const fault = async (name, start, stop, holdMs) => {
    const t = Date.now();
    await start();
    const shown = await waitFor(B, (p) => !!p.panel || !!p.paused, holdMs + 6000, 50);
    const chip = await waitFor(A, (p) => (p.chips || []).some((c) => /TabB · reconnecting/.test(c)), holdMs + 6000, 100);
    if (shown.ok) await B.screenshot({ path: `${OUT}/8-1-${name}-B-panel.png` }).catch(() => {});
    if (chip.ok) await A.screenshot({ path: `${OUT}/8-1-${name}-A-chip.png` }).catch(() => {});
    const left = holdMs - (Date.now() - t);
    if (left > 0) await B.waitForTimeout(left);
    const endAt = Date.now();
    await stop();
    const back = await waitFor(B, (p) => !p.panel && p.active && (p.phase === "wave" || p.phase === "build"), 20000, 50);
    const backA = await waitFor(A, (p) => (p.chips || []).some((c) => /TabB is back/.test(c)), 20000, 50);
    if (backA.ok) await A.screenshot({ path: `${OUT}/8-1-${name}-A-back.png` }).catch(() => {});
    note(
      `${name}: B panel ${shown.ok ? `"${shown.p.panel || shown.p.paused}" after ${shown.at - t} ms` : "never shown"}; A chip ${chip.ok ? `"${(chip.p.chips || []).join(" | ")}" after ${chip.at - t} ms` : "never"}; B back ${back.ok ? `${back.at - endAt} ms after the fault ended (phase ${back.p.phase}, wave ${back.p.wave})` : `NOT back: ${JSON.stringify(back.p)}`}; A ${backA.ok ? `"${(backA.p.chips || []).join(" | ")}" ${backA.at - endAt} ms after` : `no "is back" toast (${JSON.stringify(backA.p.chips)})`}`,
    );
    await A.waitForTimeout(3000);
  };

  await fault(
    "cut8s",
    () => B.evaluate(() => (window.__cutUntil = Date.now() + 8000)),
    () => B.evaluate(() => window.__cutHeld),
    8000,
  );
  await fault(
    "hidden6s",
    () => B.evaluate(() => window.__game.loop.sleep()),
    () => B.evaluate(() => window.__game.loop.wake()),
    6000,
  );
  await fault(
    "offline8s",
    () => Bctx.setOffline(true),
    () => Bctx.setOffline(false),
    8000,
  );
  // A reload mid-wave: the saved seat (sessionStorage) takes the seat straight back.
  const tr = Date.now();
  await B.reload();
  const r = await waitFor(B, (p) => p.active && (p.phase === "wave" || p.phase === "build"), 30000, 100);
  note(`reload: B ${r.ok ? `back in the run ${r.at - tr} ms after the reload (phase ${r.p.phase}, wave ${r.p.wave})` : `NOT back: ${JSON.stringify(r.p)}`}`);
  if (r.ok) await B.screenshot({ path: `${OUT}/8-1-reload-B.png` }).catch(() => {});
  const a = await probe(A);
  note(`end: A ${JSON.stringify(a)}`);
  fs.writeFileSync(`${OUT}/smoke-8-1.log`, results.join("\n") + "\n");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
