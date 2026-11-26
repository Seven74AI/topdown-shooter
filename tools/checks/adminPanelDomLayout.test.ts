import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 10.11 (AC 4; review L1): the production online lock of the cheat panel, in a REAL browser. The panel is mounted
 * with `practiceOnlyOnline: true` (what a production build passes) over a stub Game scene: in an online run only the
 * Perf overlay and Collision / grid view stay enabled and one "Practice only" line shows; in a solo run nothing is
 * locked and the line is absent. Skipped (never failed) without Chromium + Playwright, like the other DOM checks.
 */
const CLIENT = join(__dirname, "..", "..", "apps", "client");

type Pw = { chromium: { launch(): Promise<Browser> } };
type Browser = { newPage(o: object): Promise<Page>; close(): Promise<void> };
type Page = { goto(u: string): Promise<unknown>; waitForSelector(s: string, o?: object): Promise<unknown>; evaluate(src: string, arg: undefined): Promise<unknown>; close(): Promise<void> };

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

interface PanelState {
  enabled: string[];
  disabled: number;
  practiceOnly: number;
}

/** Mounts a second panel (the dev page has its own) over a stub scene and reads its controls after opening it. */
const probe = (online: boolean) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { mountAdminTools } = await import("/src/debug/adminTools.ts");
  const scene = { isOnline: ${online}, debugWorld: null, runSeed: 7, debugView: (r) => r, restartRun() {}, sys: { isActive: () => false } };
  const game = { scene: { getScene: () => scene }, events: { on() {} } };
  const before = new Set(document.querySelectorAll(".dev-gear"));
  mountAdminTools(game, { practiceOnlyOnline: true });
  await wait(50);
  const gear = [...document.querySelectorAll(".dev-gear")].find((g) => !before.has(g));
  gear.click();
  await wait(100);
  const panel = gear.parentElement.querySelector(".dev-cheats");
  const controls = [...panel.querySelectorAll("input, select, button")];
  const label = (e) => (e.closest("label")?.textContent || e.textContent || e.getAttribute("aria-label") || e.tagName).trim();
  const out = {
    enabled: controls.filter((e) => !e.disabled).map(label),
    disabled: controls.filter((e) => e.disabled).length,
    practiceOnly: [...panel.querySelectorAll(".dev-cheats__info")].filter((p) => p.textContent.trim() === "Practice only").length,
  };
  gear.parentElement.remove();
  return out;
})()`;

describe.skipIf(pw === null)("Story 10.11: the cheat panel's production online lock (real browser)", () => {
  beforeAll(async () => {
    const { createServer } = await import("vite");
    server = (await createServer({ root: CLIENT, configFile: join(CLIENT, "vite.config.ts"), logLevel: "silent", server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false } })) as unknown as typeof server;
    await server!.listen();
    try {
      browser = await pw!.chromium.launch();
    } catch {
      browser = null;
      return;
    }
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(server!.resolvedUrls!.local[0] as string);
    await page.waitForSelector("#start-name", { timeout: 60_000 });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  it("online: only Perf overlay and Collision / grid view are enabled, with one 'Practice only' line", async (ctx) => {
    if (!page) return ctx.skip();
    const s = (await page.evaluate(probe(true), undefined)) as PanelState;
    expect(s.enabled).toEqual(["Perf overlay", "Collision / grid view"]);
    expect(s.disabled).toBeGreaterThan(10); // liveness: the panel's other controls are really there, and locked
    expect(s.practiceOnly).toBe(1);
  }, 30_000);

  it("solo (same option): the spawn, wave and loadout controls stay enabled and no 'Practice only' line shows", async (ctx) => {
    if (!page) return ctx.skip();
    const s = (await page.evaluate(probe(false), undefined)) as PanelState;
    expect(s.practiceOnly).toBe(0);
    for (const c of ["Skip wave", "Leave last 5", "Spawn Behemoth", "Force car alarm", "+500 money", "God mode", "Perf overlay", "Collision / grid view"]) expect(s.enabled).toContain(c);
    expect(s.enabled.some((e) => /^Spawn \d+ around me$/.test(e))).toBe(true);
  }, 30_000);
});
