import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 10.11 (AC 4; review L1) → Story 10.12 (AC 8, 9): the cheat panel in a REAL browser, mounted as a production
 * build mounts it (`mountAdminTools`) over a stub Game scene. Online (10.12: the 10.11 "Practice only" lock is gone)
 * every cheat control is enabled and a click sends ONE `admin.cheat` through the scene (no confirm, Q6 B), never
 * touching the local World; the two view tools stay local (no message). Solo, the controls run locally (no message).
 * Skipped (never failed) without Chromium + Playwright, like the other DOM checks.
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
  sent: unknown[];
  blackout: string[];
  run1?: [boolean, string];
  run2?: [boolean, string];
}

/** Mounts a second panel (the dev page has its own) over a stub scene and reads its controls after opening it. */
const probe = (online: boolean) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { mountAdminTools } = await import("/src/debug/adminTools.ts");
  const sent = [];
  const scene = { isOnline: ${online}, debugWorld: null, runSeed: 7, debugView: (r) => Object.assign(r, { x: 1, y: 2, w: 24, h: 13.5 }), restartRun() {}, sendAdminCheat: (c) => sent.push(c), sys: { isActive: () => false } };
  const game = { scene: { getScene: () => scene }, events: { on() {} } };
  const before = new Set(document.querySelectorAll(".dev-gear"));
  mountAdminTools(game);
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
    sent,
  };
  const click = (text) => controls.find((e) => e.tagName === "BUTTON" && e.textContent.trim().startsWith(text))?.click();
  for (const t of ["Spawn", "Skip wave", "Leave last 5", "Spawn Behemoth", "Force stampede", "Set loadout", "+500", "Damage nearest"]) click(t);
  const god = controls.find((e) => e.closest("label")?.textContent.trim() === "God mode");
  god?.click();
  controls.find((e) => e.closest("label")?.textContent.trim() === "Perf overlay")?.click(); // a view tool: local
  // Review L2: the blackout select keeps the level this phone set online, so "off" can be sent afterwards.
  const blackout = panel.querySelector('select[aria-label="Force blackout"]');
  const pick = async (v) => { blackout.value = v; blackout.dispatchEvent(new Event("change", { bubbles: true })); await wait(50); return blackout.value; };
  out.blackout = [await pick("10"), await pick("-1")];
  await wait(50);
  out.sent = sent.slice();
  // Review L5: a new run (a new run.started id, the SAME seed: Restart with seed 7) starts with the box and select clean.
  if (${online}) {
    const { rewardsStore } = await import("/src/net/rewardsStore.ts");
    rewardsStore.setRun({ runId: "11111111-1111-4111-8111-111111111111" });
    await wait(650); // the open panel re-reads every 500 ms
    god?.click();
    await pick("5");
    await wait(50);
    const godBox = () => controls.find((e) => e.closest("label")?.textContent.trim() === "God mode");
    out.run1 = [godBox().checked, blackout.value];
    rewardsStore.setRun({ runId: "22222222-2222-4222-8222-222222222222" });
    await wait(650); // the open panel re-reads every 500 ms
    out.run2 = [godBox().checked, blackout.value];
  }
  gear.parentElement.remove();
  return out;
})()`;

describe.skipIf(pw === null)("Stories 10.11 + 10.12: the admin cheat panel online and solo (real browser)", () => {
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

  it("10.12 online: every cheat is enabled, no 'Practice only' line, each click sends one admin.cheat; view tools send nothing", async (ctx) => {
    if (!page) return ctx.skip();
    const s = (await page.evaluate(probe(true), undefined)) as PanelState;
    expect(s.practiceOnly).toBe(0);
    for (const c of ["Skip wave", "Leave last 5", "Spawn Behemoth", "Force car alarm", "+500 money", "God mode", "Perf overlay", "Collision / grid view"]) expect(s.enabled).toContain(c);
    expect(s.sent).toEqual([
      { cheat: "spawn", type: "walker", count: 50, where: "ring" },
      { cheat: "skip_wave" },
      { cheat: "leave_last" },
      { cheat: "behemoth" },
      { cheat: "event", kind: "stampede" },
      { cheat: "loadout", w0: "pistol", w1: null },
      { cheat: "money" },
      { cheat: "damage_building" },
      { cheat: "god", on: true },
      { cheat: "blackout", pct: 10 },
      { cheat: "blackout", pct: -1 },
    ]);
    expect(s.blackout).toEqual(["10", "-1"]); // the select shows what was set (it no longer snaps back to "off")
    expect(s.run1).toEqual([true, "5"]); // set in run 1 (God on, 5 %)
    expect(s.run2).toEqual([false, "-1"]); // review L5: a new run id with the same seed starts clean
  }, 30_000);

  it("solo (same option): the spawn, wave and loadout controls stay enabled and no 'Practice only' line shows", async (ctx) => {
    if (!page) return ctx.skip();
    const s = (await page.evaluate(probe(false), undefined)) as PanelState;
    expect(s.practiceOnly).toBe(0);
    expect(s.sent).toEqual([]); // solo runs locally (here: no World, so nothing happens)
    for (const c of ["Skip wave", "Leave last 5", "Spawn Behemoth", "Force car alarm", "+500 money", "God mode", "Perf overlay", "Collision / grid view"]) expect(s.enabled).toContain(c);
    expect(s.enabled.some((e) => /^Spawn \d+ around me$/.test(e))).toBe(true);
  }, 30_000);
});
