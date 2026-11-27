import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 10.5 (AC 2, AC 5): the installable check and the device emulation run, in the preinstalled Chromium.
 *
 * - **Installable (AC 2):** a release build (`vite build` into a temp dir, ~1–2 s) served the way Caddy serves it
 *   (`tools/perf/serveDist.cjs`: the manifest's MIME type and short cache) on its own port: CDP `Page.getAppManifest`
 *   has no errors and `Page.getInstallabilityErrors` is empty.
 * - **Safe areas (AC 5):** `devices["iPhone 13"]` and `devices["Pixel 7"]` in landscape, with safe-area insets forced
 *   through CDP `Emulation.setSafeAreaInsetsOverride` (this Chromium has it: CSS `env(safe-area-inset-*)` returns the
 *   forced values, so `display.ts › safeArea()` reads them exactly as on a phone; decision 10.5-B7). On the start
 *   screen, in a Practice solo build phase and in its first wave: the HUD (HP, wave line, ☰; the ping button is
 *   online only, so the browser smoke and hudLayout.test.ts cover it) and the touch
 *   controls (both sticks where a thumb lands, swap, quick-use, Build, Ready) sit inside the safe area. The HUD's
 *   positions are read from the running HudScene, which only a dev build exposes (`window.__game` is dev-only,
 *   Story 10.11), so this part runs on the client served by Vite in-process, like the other `*DomLayout` checks.
 *   `SAFE_AREA_STILLS=<dir>` saves stills of the RELEASE build at each step (deviceScaleFactor as emulated).
 *
 * Needs Chromium + Playwright (pre-installed in the cloud sessions; CI shard 1 installs it); skipped without them.
 */
const ROOT = join(__dirname, "..", "..");
const CLIENT = join(ROOT, "apps", "client");
const STILLS = process.env.SAFE_AREA_STILLS;

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** Landscape insets as the phones report them (iPhone 13: notch side 47, home bar 21; Pixel 7: camera cutout side). */
const DEVICES: readonly { name: "iPhone 13" | "Pixel 7"; insets: Insets }[] = [
  { name: "iPhone 13", insets: { top: 0, right: 47, bottom: 21, left: 47 } },
  { name: "Pixel 7", insets: { top: 0, right: 0, bottom: 0, left: 32 } },
];

type Pw = { chromium: { launch(): Promise<Browser> }; devices: Record<string, DeviceDesc> };
type DeviceDesc = { viewport: { width: number; height: number }; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean; userAgent: string };
type Browser = { newContext(o: object): Promise<Context>; close(): Promise<void> };
type Context = { newPage(): Promise<Page>; newCDPSession(p: Page): Promise<Cdp>; close(): Promise<void> };
type Cdp = { send(method: string, params?: object): Promise<unknown> };
type Page = {
  goto(u: string): Promise<unknown>;
  waitForSelector(s: string, o?: object): Promise<unknown>;
  waitForFunction(src: string, arg?: unknown, o?: object): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate(src: string, arg?: unknown): Promise<unknown>;
  click(sel: string): Promise<void>;
  screenshot(o: { path: string }): Promise<unknown>;
  touchscreen: { tap(x: number, y: number): Promise<void> };
};

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

const require = createRequire(import.meta.url);
const serveDist = require("../perf/serveDist.cjs") as { createServer(dir: string): Server };

let vite: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let dist = "";
let release: Server | null = null;
let releaseUrl = "";
let browser: Browser | null = null;

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface HudProbe {
  phase: string;
  insets: Insets;
  boxes: Box[];
  sticks: { move: { x: number; y: number } | null; aim: { x: number; y: number } | null };
}

/** The running HUD, in CSS px: its insets, the visible button rects, the HP and wave texts, the sticks' origins. */
const PROBE = `(() => {
  const g = window.__game;
  const hud = g.scene.getScene("Hud");
  const game = g.scene.getScene("Game");
  const k = Math.min(window.devicePixelRatio || 1, 2);
  const w = game && game.host && (game.host.world || game.host.mirror);
  const boxes = [];
  for (const id of ["menu", "ping", "swap", "consumable", "build", "shopchip", "quick", "ready"]) {
    const r = hud.buttons.get(id);
    if (r && r.visible && r.w > 0) boxes.push({ id, x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k });
  }
  for (const [id, t] of [["hp_text", hud.hpText], ["wave_line", hud.waveText]]) {
    if (t && t.visible && t.text) { const b = t.getBounds(); boxes.push({ id, x: b.x / k, y: b.y / k, w: b.width / k, h: b.height / k }); }
  }
  const s = hud.sticks;
  const o = (st) => (st ? { x: st.originX / k, y: st.originY / k } : null);
  return { phase: w && w.run ? w.run.phase : "none", insets: { ...hud.insets }, boxes, sticks: { move: o(s.move), aim: o(s.aim) } };
})()`;

/** A phone in landscape with forced safe-area insets; `url` = the dev or release client. */
/** `?loadout=…` starts a Practice solo run at once (BootScene), with no start screen to wait for. */
async function phone(device: (typeof DEVICES)[number], url: string): Promise<{ ctx: Context; page: Page; cdp: Cdp; w: number; h: number }> {
  const d = pw!.devices[device.name] as DeviceDesc;
  const w = Math.max(d.viewport.width, d.viewport.height);
  const h = Math.min(d.viewport.width, d.viewport.height);
  const ctx = await browser!.newContext({ ...d, viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: device.insets });
  await page.goto(url);
  if (url.includes("loadout=")) return { ctx, page, cdp, w, h };
  await page.waitForSelector("#start-name", { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.waitForSelector("#start-name", { timeout: 60_000 }); // Vite may reload once after pre-bundling
  return { ctx, page, cdp, w, h };
}

const inside = (b: { x: number; y: number; w: number; h: number }, ins: Insets, w: number, h: number): boolean =>
  b.x >= ins.left - 0.5 && b.y >= ins.top - 0.5 && b.x + b.w <= w - ins.right + 0.5 && b.y + b.h <= h - ins.bottom + 0.5;

/** One touch with CDP (a real touch: HudScene's router sees a touch pointer). */
async function touch(cdp: Cdp, type: "touchStart" | "touchEnd", x: number, y: number, id = 1): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id }] });
}

describe.skipIf(!pw)("Story 10.5 (AC 2, AC 5): installable release build; HUD and controls inside the safe areas on emulated phones", () => {
  beforeAll(async () => {
    const { build, createServer } = await import("vite");
    dist = mkdtempSync(join(tmpdir(), "hordes-dist-"));
    // a real release build: Vitest runs with NODE_ENV=test, which would make Vite keep import.meta.env.DEV true
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await build({ root: CLIENT, configFile: join(CLIENT, "vite.config.ts"), mode: "production", logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });
    } finally {
      process.env.NODE_ENV = env;
    }
    release = serveDist.createServer(dist);
    await new Promise<void>((r) => release!.listen(0, "127.0.0.1", r));
    releaseUrl = `http://127.0.0.1:${(release.address() as AddressInfo).port}/`;
    vite = (await createServer({ root: CLIENT, configFile: join(CLIENT, "vite.config.ts"), logLevel: "silent", server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false } })) as unknown as typeof vite;
    await vite!.listen();
    try {
      browser = await pw!.chromium.launch();
    } catch {
      browser = null;
    }
    if (STILLS) mkdirSync(STILLS, { recursive: true });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    release?.close();
    if (dist) rmSync(dist, { recursive: true, force: true });
  });

  it("AC 2: the release build is installable (manifest parses without errors, no installability errors)", async (t) => {
    if (!browser) return t.skip();
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    try {
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await page.goto(releaseUrl);
      await page.waitForSelector("#start-name", { timeout: 20_000 });
      const m = (await cdp.send("Page.getAppManifest")) as { url: string; errors: { message: string }[]; data?: string };
      expect(m.url).toBe(`${releaseUrl}manifest.webmanifest`);
      expect(m.errors).toEqual([]);
      expect(JSON.parse(m.data ?? "{}").short_name).toBe("Hordes");
      // the icons are fetched as part of the check; give the browser a moment after load
      let errs: { installabilityErrors: { errorId: string }[] } = { installabilityErrors: [{ errorId: "not checked" }] };
      for (let i = 0; i < 20; i++) {
        errs = (await cdp.send("Page.getInstallabilityErrors")) as typeof errs;
        if (errs.installabilityErrors.length === 0) break;
        await page.waitForTimeout(250);
      }
      expect(errs.installabilityErrors.map((e) => e.errorId)).toEqual([]);
      expect(await page.evaluate("document.title")).toBe("Hordes");
    } finally {
      await ctx.close();
    }
  }, 30_000);

  for (const device of DEVICES) {
    it(`${device.name} landscape (insets ${JSON.stringify(device.insets)}): the start screen's controls sit inside the safe area`, async (t) => {
      if (!browser) return t.skip();
      const { ctx, page, w, h } = await phone(device, vite!.resolvedUrls!.local[0] as string);
      try {
        const probe = (await page.evaluate(`(() => {
          const p = document.createElement("div");
          p.style.cssText = "position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
          document.body.appendChild(p);
          const cs = getComputedStyle(p);
          const ins = { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) };
          p.remove();
          const els = [...document.querySelectorAll("#ui button, #ui input, #start-title")].filter((e) => e.getBoundingClientRect().width > 0);
          return { ins, boxes: els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 20), x: r.left, y: r.top, w: r.width, h: r.height }; }) };
        })()`)) as { ins: Insets; boxes: Box[] };
        expect(probe.ins, "env(safe-area-inset-*) returns the forced insets").toEqual(device.insets);
        expect(probe.boxes.length).toBeGreaterThan(3); // liveness: the start screen is up
        // the start screen scrolls on short phones: check what is on screen horizontally, and nothing under the notch
        for (const b of probe.boxes) expect(b.x >= device.insets.left - 0.5 && b.x + b.w <= w - device.insets.right + 0.5, `${b.id} x ${b.x}–${b.x + b.w}`).toBe(true);
        void h;
      } finally {
        await ctx.close();
      }
    }, 30_000);

    it(`${device.name} landscape: Practice solo — build phase, then the first wave: HUD (HP, wave line, ping, ☰) and controls (sticks, swap, quick-use, Build, Ready) inside the safe area`, async (t) => {
      if (!browser) return t.skip();
      const { ctx, page, cdp, w, h } = await phone(device, `${vite!.resolvedUrls!.local[0]}?loadout=pistol,smg`); // two weapons: the swap button shows
      try {
        await page.waitForFunction(`(() => { const g = window.__game; const s = g && g.scene.getScene("Game"); const w = s && s.host && s.host.world; return !!(w && w.run && w.run.phase === "build" && g.scene.getScene("Hud").buttons.get("ready")?.visible); })()`, undefined, { timeout: 15_000 });
        await page.waitForTimeout(300);
        const build = (await page.evaluate(PROBE)) as HudProbe;
        expect(build.phase).toBe("build");
        expect(build.insets, "HudScene read the forced insets (display.ts › safeArea)").toEqual(device.insets);
        const ids = build.boxes.map((b) => b.id);
        // (the ping button is online only: Practice solo has none; its rect is in hudLayout.test.ts at every size)
        for (const id of ["menu", "ready", "shopchip", "hp_text", "wave_line"]) expect(ids, `build phase: ${id} shown`).toContain(id);
        // Story 10.10: the Build button, or (1–2 unlocked types, a new player's Practice solo: BU-3) its tiles on the same spots
        expect(ids.includes("build") || ids.includes("quick"), "build phase: the Build button or its tiles").toBe(true);
        for (const b of build.boxes) expect(inside(b, device.insets, w, h), `build phase ${b.id} ${JSON.stringify(b)}`).toBe(true);
        // both sticks where a thumb lands (lower left, lower right, inside the safe area): the stick starts there
        const thumbs = { move: { x: device.insets.left + 70, y: h - device.insets.bottom - 70 }, aim: { x: w - device.insets.right - 150, y: h - device.insets.bottom - 70 } };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: thumbs.move.x, y: thumbs.move.y, id: 1 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: thumbs.move.x, y: thumbs.move.y, id: 1 }, { x: thumbs.aim.x, y: thumbs.aim.y, id: 2 }] });
        await page.waitForTimeout(100);
        const held = (await page.evaluate(PROBE)) as HudProbe;
        await touch(cdp, "touchEnd", 0, 0);
        expect(held.sticks.move, "move stick").not.toBeNull();
        expect(held.sticks.aim, "aim stick").not.toBeNull();
        for (const s of [held.sticks.move!, held.sticks.aim!]) expect(inside({ x: s.x, y: s.y, w: 0, h: 0 }, device.insets, w, h)).toBe(true);
        // Ready (tapped where HudScene drew it) starts the wave
        const ready = build.boxes.find((b) => b.id === "ready") as Box;
        await page.touchscreen.tap(ready.x + ready.w / 2, ready.y + ready.h / 2);
        await page.waitForFunction(`(() => { const s = window.__game.scene.getScene("Game"); return s.host.world.run.phase === "wave"; })()`, undefined, { timeout: 10_000 });
        await page.waitForTimeout(400);
        const wave = (await page.evaluate(PROBE)) as HudProbe;
        expect(wave.phase).toBe("wave");
        const wids = wave.boxes.map((b) => b.id);
        for (const id of ["menu", "swap", "hp_text", "wave_line"]) expect(wids, `wave: ${id} shown`).toContain(id);
        for (const b of wave.boxes) expect(inside(b, device.insets, w, h), `wave ${b.id} ${JSON.stringify(b)}`).toBe(true);
      } finally {
        await ctx.close();
      }
    }, 30_000);

    it(`${device.name} landscape: the RELEASE build — start screen, build phase, wave (stills when SAFE_AREA_STILLS is set)`, async (t) => {
      if (!browser) return t.skip();
      const first = await phone(device, releaseUrl);
      const still = async (p: Page, step: string): Promise<void> => {
        if (STILLS) await p.screenshot({ path: join(STILLS, `safe-area-${device.name.replace(/\s+/g, "-").toLowerCase()}-${step}.png`) });
      };
      try {
        expect(await first.page.evaluate("typeof window.__game"), "release build: no dev handle").toBe("undefined");
        await still(first.page, "start");
      } finally {
        await first.ctx.close();
      }
      // a two-weapon Practice solo run (release-safe ?loadout: it starts at once), so the wave shows swap
      const { ctx, page, w, h } = await phone(device, `${releaseUrl}?loadout=pistol,smg`);
      const shot = (step: string): Promise<void> => still(page, step);
      try {
        await page.waitForTimeout(3000); // the build phase opens at once (no hook in a release build to wait on)
        await shot("build");
        // Ready: where the layout puts it (the dev run above checked HudScene draws it there): bottom centre-ish
        const { READY_BUTTON_BOTTOM_CSS_PX, READY_BUTTON_H_CSS_PX } = await import("../../apps/client/src/ui/sizes");
        const { readyLeftX, readyClearLeft, layoutBuildPanel, newBuildPanelLayout } = await import("../../apps/client/src/scenes/buildBar");
        const { READY_BUTTON_W_CSS_PX } = await import("../../apps/client/src/ui/sizes");
        const pn = layoutBuildPanel(w, h, device.insets.right, device.insets.bottom, 1, newBuildPanelLayout(), device.insets.top);
        const rx = readyLeftX(w, READY_BUTTON_W_CSS_PX, readyClearLeft(pn), 1);
        const ry = h - (READY_BUTTON_BOTTOM_CSS_PX + device.insets.bottom) - READY_BUTTON_H_CSS_PX;
        await page.touchscreen.tap(rx + READY_BUTTON_W_CSS_PX / 2, ry + READY_BUTTON_H_CSS_PX / 2);
        await page.waitForTimeout(2500);
        await shot("wave");
      } finally {
        await ctx.close();
      }
    }, 30_000);
  }
});
