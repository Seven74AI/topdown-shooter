/* global require, process, console, window, document, setInterval */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
// Stories 8.2 + 8.3 late-join smoke (brief R10; story T10). NOT game code, not a test.
//
// Three headless Chromium tabs on a real server and the lagged (lossy) dev line (SMOKE_QUERY, default
// ?lag=150&jitter=20&loss=1&debug=1): A creates (god-mode `net150`), B joins, they start and reach a wave;
// C joins MID-WAVE (it must wait: the line "Wave in progress, …", no body), enters at the next build phase
// with late-join money, A (the host) removes C from the ☰ → Players menu in that build phase (C shows "You
// were removed from this run" + OK and can't rejoin), then A goes into a hidden tab 6 s (B becomes host at
// once and sees "You are now the host"). Screenshots of each step.
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
  for (const p of [A, B]) {
    await p.mouse.move(500, 150);
    await p.mouse.down();
  }
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

  // 3. The host removes C from ☰ → Players (build phase).
  if (cb.ok) {
    await A.mouse.up();
    await A.keyboard.press("Escape");
    await A.waitForTimeout(400);
    const players = A.locator(".in-run-menu button", { hasText: "Players" });
    if (await players.count()) {
      await players.first().click();
      await A.waitForTimeout(300);
      await A.screenshot({ path: `${OUT}/8-3-A-players.png` }).catch(() => {});
      await A.locator(".in-run-menu__player", { hasText: "TabC" }).locator("button").click();
      await A.waitForTimeout(300);
      await A.screenshot({ path: `${OUT}/8-3-A-confirm.png` }).catch(() => {});
      await A.locator('[data-testid="remove-confirm"] button.btn--danger').click();
      const tr = Date.now();
      const cr = await waitFor(C, (p) => /removed/.test(p.notice || ""), 10000, 100);
      note(`remove: C ${cr.ok ? `shows "${cr.p.notice}" after ${cr.at - tr} ms` : `no notice: ${JSON.stringify(cr.p)}`}`);
      if (cr.ok) await C.screenshot({ path: `${OUT}/8-3-C-removed.png` }).catch(() => {});
      await A.keyboard.press("Escape").catch(() => {});
    } else {
      note("remove: no Players item in A's menu (not host?)");
    }
  }

  // 4. A hides for 6 s: B is host at once and sees the toast.
  const th = Date.now();
  await A.evaluate(() => window.__game.loop.sleep());
  const bh = await waitFor(B, (p) => p.hostSlot !== null && p.hostSlot === p.mySlot, 12000, 100);
  const toast = await waitFor(B, (p) => /You are now the host/.test(p.toast || ""), 6000, 50);
  note(`host move: B ${bh.ok ? `is host ${bh.at - th} ms after A hid` : `NOT host: ${JSON.stringify(bh.p)}`}; toast ${toast.ok ? `"${toast.p.toast}"` : "not seen"}`);
  if (toast.ok) await B.screenshot({ path: `${OUT}/8-3-B-host-toast.png` }).catch(() => {});
  await A.evaluate(() => window.__game.loop.wake());
  await A.waitForTimeout(4000);
  note(`end: A ${JSON.stringify(await probe(A))} B ${JSON.stringify(await probe(B))}`);
  fs.writeFileSync(`${OUT}/smoke-8-2-3.log`, results.join("\n") + "\n");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
