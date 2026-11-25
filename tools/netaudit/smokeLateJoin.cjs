/* global require, process, console, window, document */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
// Stories 8.2 + 8.3 late-join smoke (brief R10; story T10). NOT game code, not a test.
//
// Three headless Chromium tabs on a real server and the lagged (lossy) dev line (SMOKE_QUERY, default
// ?lag=150&jitter=20&loss=1&debug=1): A creates (god-mode `net150`), B joins, they start and reach a wave;
// C joins MID-WAVE (it must wait: the line "Wave in progress, …", no body), enters at the next build phase
// with late-join money, A (the host) removes C from the ☰ → Players menu in that build phase (C shows "You
// were removed from this run" + OK), then the host's tab closes (a drop: the other tab becomes host at once and
// sees "You are now the host"). Screenshots of each step.
// Steps (own ports; never `npm run dev`; stop each process by PID afterwards):
//   1. server: (cd apps/server && PORT=2813 HOST=127.0.0.1 ALLOW_SOLO_START=1 ALLOW_TEST_SCENARIOS=1 node --import tsx src/index.ts)
//   2. client: a local Vite config merging apps/client/vite.config.ts with port 5813 and /api → :2813 (not committed)
//   3. node tools/netaudit/smokeLateJoin.cjs <outDir> [clientPort=5813]
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.argv[2] || ".";
const CLIENT_PORT = Number(process.argv[3] || 5813);
const BASE = `http://127.0.0.1:${CLIENT_PORT}/`;
const Q = process.env.SMOKE_QUERY || "?lag=150&jitter=20&loss=1&debug=1";
const HOST_Q = Q + (process.env.SMOKE_SCENARIO === "" ? "" : `&scenario=${process.env.SMOKE_SCENARIO || "net150"}`);
const t0 = Date.now();
const T = () => ((Date.now() - t0) / 1000).toFixed(1);
const results = [];
const note = (m) => {
  const l = `[${T()} s] ${m}`;
  results.push(l);
  console.log(l);
};

const probe = (page) =>
  page
    .evaluate(() => {
      const g = window.__game;
      const s = g && g.scene.getScene("Game");
      const h = s && s.host;
      const w = h && h.world;
      const me = w && h.localPlayerId && w.players.get(h.localPlayerId);
      const notice = document.querySelector("#server-notice-text");
      const lobbyNotice = document.querySelector(".lobby__notice, .lobby-notice");
      return {
        active: g ? g.scene.isActive("Game") : false,
        phase: w && w.run && w.run.phase,
        wave: w && w.waves && w.waves.number,
        waiting: h && "waiting" in h ? h.waiting : null,
        line: h && "waitingLine" in h ? h.waitingLine : null,
        wallet: me ? me.wallet : null,
        hostSlot: h && "hostSlot" in h ? h.hostSlot : null,
        mySlot: h && "mySlot" in h ? h.mySlot : null,
        notice: notice && notice.textContent,
        lobbyNotice: lobbyNotice && lobbyNotice.textContent,
        toast: s && s.hudModel ? s.hudModel.toastText : null,
      };
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
    const page = await ctx.newPage();
    page.on("pageerror", (e) => note(`${name} PAGEERROR ${String(e).slice(0, 300)}`));
    await page.goto(BASE + q);
    return { ctx, page };
  };
  const joinTab = async (page, name, code) => {
    await page.fill('input[placeholder="Name"]', name);
    await page.fill('input[placeholder="CODE"]', code);
    await page.click("button:has-text('Join')");
  };
  const { page: A } = await mk("A", HOST_Q);
  await A.fill('input[placeholder="Name"]', "TabA");
  await A.click("text=Create game");
  await A.waitForSelector(".lobby__code");
  const code = (await A.textContent(".lobby__code")).trim();
  note(`room ${code}`);
  const { page: B } = await mk("B");
  await joinTab(B, "TabB", code);
  await B.waitForSelector(".lobby__code");
  for (const p of [A, B]) {
    const ready = p.locator("button.lobby__btn", { hasText: /^Ready$/ }).first(); // Epic 7 Lumen lobby
    if (await ready.count()) await ready.click().catch(() => {});
  }
  await A.waitForTimeout(1500);
  await A.click("button.lobby__start");
  note("start clicked");
  for (let i = 0; i < 60; i++) {
    for (const p of [A, B]) await p.keyboard.press("r").catch(() => {});
    const a = await probe(A);
    if (a.phase === "wave") break;
    await A.waitForTimeout(500);
  }
  const w = await waitFor(A, (p) => p.phase === "wave", 60000);
  note(`wave: ${w.ok} ${JSON.stringify(w.p)}`);
  // The tabs aim at their nearest zombie (screen point from the Game camera) and hold fire, so waves end.
  const aimers = new Set([A, B]);
  let aiming = true;
  const aimOnce = (page) =>
    page
      .evaluate(() => {
        const s = window.__game && window.__game.scene.getScene("Game");
        const h = s && s.host;
        const w = h && h.world;
        const me = w && w.players.get(h.localPlayerId);
        if (!me) return null;
        const z = w.zombies;
        let best = -1;
        let bd = Infinity;
        for (let i = 0; i < z.aliveCount; i++) {
          const id = z.aliveIds[i];
          const d = Math.hypot(z.x[id] - me.x, z.y[id] - me.y);
          if (d < bd) {
            bd = d;
            best = id;
          }
        }
        if (best < 0) return null;
        const cam = s.cameras.main;
        return { x: (z.x[best] - cam.worldView.x) * cam.zoom, y: (z.y[best] - cam.worldView.y) * cam.zoom };
      })
      .catch(() => null);
  void (async () => {
    for (const p of aimers) await p.mouse.down().catch(() => {});
    while (aiming) {
      for (const p of aimers) {
        const at = await aimOnce(p);
        if (at) await p.mouse.move(Math.max(1, Math.min(639, at.x)), Math.max(1, Math.min(359, at.y))).catch(() => {});
      }
      await A.waitForTimeout(150).catch(() => {});
    }
  })();
  await A.waitForTimeout(2000);

  // 1. C joins mid-wave: it waits.
  const tj = Date.now();
  const { page: C } = await mk("C");
  await joinTab(C, "TabC", code);
  const cw = await waitFor(C, (p) => p.active && p.waiting === true, 20000, 100);
  note(`C mid-wave: ${cw.ok ? `waiting after ${cw.at - tj} ms, line "${cw.p.line}", phase ${cw.p.phase}, wave ${cw.p.wave}` : `NOT waiting: ${JSON.stringify(cw.p)}`}`);
  if (cw.ok) await C.screenshot({ path: `${OUT}/8-2-C-waiting.png` }).catch(() => {});

  // 2. The next build phase: C enters with late-join money.
  const cb = await waitFor(C, (p) => p.phase === "build" && p.waiting === false && p.wallet !== null, 240000, 250);
  note(`C at the build phase: ${cb.ok ? `entered (wave ${cb.p.wave}, wallet ${cb.p.wallet})` : `NOT entered: ${JSON.stringify(cb.p)}`}`);
  if (cb.ok) await C.screenshot({ path: `${OUT}/8-2-C-entered.png` }).catch(() => {});
  aiming = false;
  await A.waitForTimeout(400);

  // 3. The host removes C from ☰ → Players (build phase).
  // Whoever is host now (a headless tab can go quiet and lose the role: H1) opens ☰ → Players.
  const pa = await probe(A);
  const H = pa.hostSlot === pa.mySlot ? A : B;
  note(`host for the remove: ${H === A ? "A" : "B"} (hostSlot ${pa.hostSlot})`);
  if (cb.ok) {
    for (const p of [A, B]) await p.mouse.up().catch(() => {});
    // The test scenario's per-wave "Network results" dialog (debug) sits over the menu: close it first.
    for (const p of [A, B]) await p.locator(".stress-results button", { hasText: "Close" }).click({ timeout: 1500 }).catch(() => {});
    await H.keyboard.press("Escape");
    await H.waitForTimeout(400);
    const players = H.locator(".in-run-menu button", { hasText: "Players" });
    if (await players.count()) {
      await players.first().click();
      await H.waitForTimeout(300);
      await H.screenshot({ path: `${OUT}/8-3-host-players.png` }).catch(() => {});
      await H.locator(".in-run-menu__player", { hasText: "TabC" }).locator("button").click();
      await H.waitForTimeout(300);
      await H.screenshot({ path: `${OUT}/8-3-host-confirm.png` }).catch(() => {});
      await H.locator('[data-testid="remove-confirm"] button.btn--danger').click();
      const tr = Date.now();
      const cr = await waitFor(C, (p) => /removed/.test(p.notice || ""), 10000, 100);
      note(`remove: C ${cr.ok ? `shows "${cr.p.notice}" after ${cr.at - tr} ms` : `no notice: ${JSON.stringify(cr.p)}`}`);
      if (cr.ok) await C.screenshot({ path: `${OUT}/8-3-C-removed.png` }).catch(() => {});
      await H.keyboard.press("Escape").catch(() => {});
    } else {
      note("remove: no Players item in A's menu (not host?)");
    }
  }

  // 4. The host's tab closes (a drop: its seat is held; a hidden tab is held only in a wave, 8.1 D1): the other tab is
  //    host at once and sees the toast.
  const O = H === A ? B : A;
  const th = Date.now();
  await H.close();
  const bh = await waitFor(O, (p) => p.hostSlot !== null && p.hostSlot === p.mySlot, 12000, 100);
  const toast = await waitFor(O, (p) => /You are now the host/.test(p.toast || ""), 6000, 50);
  note(`host move: the other tab ${bh.ok ? `is host ${bh.at - th} ms after the host hid` : `NOT host: ${JSON.stringify(bh.p)}`}; toast ${toast.ok ? `"${toast.p.toast}"` : "not seen"}`);
  if (toast.ok) await O.screenshot({ path: `${OUT}/8-3-new-host-toast.png` }).catch(() => {});
  await O.waitForTimeout(2000);
  note(`end: ${H === A ? "B" : "A"} ${JSON.stringify(await probe(O))}`);
  fs.writeFileSync(`${OUT}/smoke-8-2-3.log`, results.join("\n") + "\n");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
