/* global require, process, console, window, setTimeout */
// Story 8.7 browser shots: the ping in play on a real server, two tabs — a phone in landscape (844 × 390, touch) and a
// desktop (1280 × 720, mouse + keys), both at deviceScaleFactor 2. The phone opens the wheel and pings "Help!"; the
// desktop pings "Over here" with F, 2 and walks away so the phone's ping shows as an edge arrow.
// Run (your own ports; stop both by PID afterwards):
//   server: (cd apps/server && PORT=2687 ALLOW_SOLO_START=1 DEV_NO_WAVES=1 node --import tsx src/index.ts)
//   client: a local Vite config merging apps/client/vite.config.ts with port 5287 and /api → localhost:2687
//   node docs/art/epic-8/built/8-7-shots.cjs <outDir> [--port=5287]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled)
const { chromium } = require("playwright");
const out = process.argv[2] || "docs/art/epic-8/built";
const portArg = process.argv.find((s) => s.startsWith("--port="));
const BASE = `http://localhost:${portArg ? portArg.slice(7) : "5287"}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logs = [];

async function waitRun(page) {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.isActive("Game") && window.__game.scene.getScene("Game").host)).catch(() => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("the run never started");
}

/** A HUD button's centre in CSS px (HudButtons rects are canvas px). */
const buttonAt = (page, id) =>
  page.evaluate((id) => {
    const hud = window.__game.scene.getScene("Hud");
    const r = hud.buttons.get(id);
    const k = window.__game.canvas.width / window.__game.canvas.getBoundingClientRect().width;
    return r ? { x: (r.x + r.w / 2) / k, y: (r.y + r.h / 2) / k, visible: r.visible } : null;
  }, id);

const pingState = (page) =>
  page.evaluate(() => {
    const g = window.__game.scene.getScene("Game");
    const p = g.host.pings;
    const m = window.__game.scene.getScene("Hud").model;
    return { button: m.pingButton, open: m.ping.open, live: p ? p.slots.map((s) => s.kind) : null, phase: g.host.world.run.phase };
  });

(async () => {
  const browser = await chromium.launch();
  const mk = async (name, opts) => {
    const page = await browser.newPage(opts);
    page.on("pageerror", (e) => logs.push(`${name} PAGEERROR ${e.message}`));
    page.on("console", (m) => m.type() === "error" && logs.push(`${name} console.error ${m.text().slice(0, 200)}`));
    await page.goto(BASE);
    return page;
  };
  const desk = await mk("desktop", { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await desk.fill('input[placeholder="Name"]', "Ana");
  await desk.click("text=Create game");
  await desk.waitForSelector(".lobby__code");
  const code = (await desk.textContent(".lobby__code")).trim();
  const phone = await mk("phone", { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.fill('input[placeholder="Name"]', "Bo");
  await phone.fill('input[placeholder="CODE"]', code);
  await phone.click("button:has-text('Join')");
  await phone.waitForSelector(".lobby__code");
  for (const p of [desk, phone]) await p.locator("button", { hasText: /^Ready$/ }).first().click();
  await sleep(800);
  await desk.click("button.lobby__start");
  await waitRun(desk);
  await waitRun(phone);
  await sleep(2500);
  // Phone: tap the ping button → the wheel opens.
  const btn = await buttonAt(phone, "ping");
  console.log("phone ping button", btn, await pingState(phone));
  await phone.touchscreen.tap(btn.x, btn.y);
  await sleep(250);
  console.log("after tap", await pingState(phone));
  await phone.screenshot({ path: `${out}/8-7-phone-wheel-open.png` });
  const help = await buttonAt(phone, "ping_chip0");
  await phone.touchscreen.tap(help.x, help.y);
  await sleep(700);
  console.log("after Help!", await pingState(phone), await pingState(desk));
  await phone.screenshot({ path: `${out}/8-7-phone-help.png` });
  await desk.screenshot({ path: `${out}/8-7-desktop-help-seen.png` });
  // Desktop: F opens the wheel (keys 1–4 pick).
  await desk.mouse.move(900, 300);
  await desk.keyboard.press("KeyF");
  await sleep(150);
  await desk.screenshot({ path: `${out}/8-7-desktop-wheel-open.png` });
  await desk.keyboard.press("Escape"); // closes the wheel (before the menu)
  await sleep(4200); // the phone's first ping has ended
  // The desktop walks up for 5 s, then the phone pings "Help!" again (off the desktop's screen: an edge arrow) and the
  // desktop pings "Over here" with F, 2 (off the phone's screen: an edge arrow there).
  await desk.keyboard.down("KeyW");
  await sleep(5000);
  await desk.keyboard.up("KeyW");
  await phone.touchscreen.tap(btn.x, btn.y);
  await sleep(200);
  await phone.touchscreen.tap(help.x, help.y);
  await desk.keyboard.press("KeyF");
  await sleep(100);
  await desk.keyboard.press("Digit2");
  await sleep(600);
  console.log("both pinged", await pingState(desk), await pingState(phone));
  await desk.screenshot({ path: `${out}/8-7-desktop-pings.png` });
  await phone.screenshot({ path: `${out}/8-7-phone-edge-arrow.png` });
  console.log(logs.join("\n") || "no page errors");
  await browser.close();
})().catch((e) => {
  console.error(e);
  console.log(logs.join("\n"));
  process.exit(1);
});
