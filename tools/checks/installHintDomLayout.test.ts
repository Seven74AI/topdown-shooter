import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 10.5 (Q3 = C): the install hint on Results, in a REAL browser (phone emulation: touch, coarse pointer) at
 * 568 × 320 and 844 × 390 with the 44/21 insets: the line sits inside the rewards card, its text ≥ 11 px, Install and ✕
 * ≥ 44 px, nothing outside the card; Android (a deferred prompt) shows Install, iOS the Share text; ✕ hides it; the next
 * Results never shows it again (once ever); a desktop pointer never sees it.
 * `INSTALL_HINT_STILLS=<dir>` also saves the stills (the hand-back's `docs/qa/browsers/install-hint-*.png`).
 * Needs Chromium + Playwright (pre-installed in the cloud sessions); without them the test is skipped.
 */
const CLIENT = join(__dirname, "..", "..", "apps", "client");
const SIZES = [
  [568, 320],
  [844, 390],
] as const;
const INSET = { left: 44, right: 44, bottom: 21 };
const STILLS = process.env.INSTALL_HINT_STILLS;
const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
} as const;

type Pw = { chromium: { launch(): Promise<Browser> } };
type Browser = { newContext(o: object): Promise<Context>; close(): Promise<void> };
type Context = { newPage(): Promise<Page>; close(): Promise<void> };
type Page = {
  goto(u: string): Promise<unknown>;
  waitForSelector(s: string, o?: object): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  addStyleTag(o: { content: string }): Promise<unknown>;
  evaluate(src: string, arg: undefined): Promise<unknown>;
  screenshot(o: { path: string }): Promise<unknown>;
};

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

interface Measure {
  shown: boolean;
  platform: string;
  text: string;
  out: string[];
  minFont: number;
  buttons: { name: string; w: number; h: number }[];
  row: { top: number; bottom: number } | null;
  card: { top: number; bottom: number; left: number; right: number };
}

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;

/** Sets a finished run's Results (and its saved rewards) through the page's own stores; `prompt` fakes Chrome's event. */
const showResults = (prompt: boolean, clear: boolean): string => `(async () => {
  const ui = await import("/src/ui/uiState.ts");
  const rs = await import("/src/net/rewardsStore.ts");
  const ih = await import("/src/install/installHint.ts");
  if (${clear}) localStorage.removeItem(ih.INSTALL_HINT_KEY);
  ih.installHintStore.setDeferred(${prompt} ? { prompt: async () => { window.__prompted = (window.__prompted || 0) + 1; } } : null);
  ui.uiStore.set({ kind: "start" });
  await new Promise((r) => setTimeout(r, 50));
  const rows = ["Mo", "Ana"].map((n, i) => ({ slot: i, name: n, kills: 120, earned: 900 }));
  const runId = "0f1e2d3c-4b5a-4968-8776-6554433221" + String(Math.floor(Math.random() * 90) + 10);
  ui.uiStore.set({ kind: "results", wave: 10, rows, online: true, ending: "extracted", endless: false, seed: 1234, dawnEndsAtMs: 0, mySlot: 0 });
  rs.rewardsStore.setRun({ runId });
  rs.rewardsStore.receive({ runId, seed: 1234, status: "saved", lines: { waves: 100, boss: 50, extract: 100, endless: 0, endlessBoss: 0 }, waveCount: 10, endlessWaveCount: 0, rookie: false, total: 250, newTotal: 750, ending: "extracted", leftWave: 0 });
  for (let i = 0; i < 40 && !document.querySelector(".rw-btn"); i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 150));
})()`;

const MEASURE = `(() => {
  const row = document.querySelector("[data-testid=install-hint]");
  const card = document.querySelector(".rw-card--rewards").getBoundingClientRect();
  const out = [];
  let minFont = 99;
  const buttons = [];
  if (row) {
    for (const el of [row, ...row.querySelectorAll("*")]) {
      const r = el.getBoundingClientRect();
      if (r.left < card.left - 0.5 || r.right > card.right + 0.5) out.push((el.className || el.tagName) + " x outside the card");
      if ([...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim())) minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
    }
    for (const b of row.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      buttons.push({ name: b.getAttribute("aria-label") || b.textContent, w: r.width, h: r.height });
    }
  }
  const rr = row ? row.getBoundingClientRect() : null;
  return { shown: !!row, platform: row ? row.dataset.platform : "", text: row ? row.querySelector(".rw-install__text").textContent : "", out, minFont, buttons,
    row: rr ? { top: rr.top, bottom: rr.bottom } : null, card: { top: card.top, bottom: card.bottom, left: card.left, right: card.right } };
})()`;

describe.skipIf(!pw)("Story 10.5 (Q3 = C): the install hint on Results in a real browser", () => {
  beforeAll(async () => {
    const { createServer } = await import("vite");
    server = (await createServer({ root: CLIENT, configFile: join(CLIENT, "vite.config.ts"), logLevel: "silent", server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false } })) as unknown as typeof server;
    await server!.listen();
    try {
      browser = await pw!.chromium.launch();
    } catch {
      browser = null;
    }
    if (STILLS) mkdirSync(STILLS, { recursive: true });
  }, 90_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function phone(platform: "android" | "ios", w: number, h: number, touch = true): Promise<{ page: Page; ctx: Context }> {
    const ctx = await browser!.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, userAgent: UA[platform] });
    const page = await ctx.newPage();
    await page.goto(server!.resolvedUrls!.local[0] as string);
    await page.waitForSelector("#start-name", { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.waitForSelector("#start-name", { timeout: 60_000 });
    await page.addStyleTag({ content: `.results.rw{padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px !important}.dev-gear,.dev-cheats{display:none!important}` });
    return { page, ctx };
  }

  for (const platform of ["android", "ios"] as const) {
    for (const [w, h] of SIZES) {
      it(`${platform} ${w} × ${h}: one line inside the rewards card, text ≥ 11 px, buttons ≥ 44 px; ✕ hides it; never again`, async (t) => {
        if (!browser) return t.skip();
        const { page, ctx } = await phone(platform, w, h);
        try {
          await page.evaluate(showResults(platform === "android", true), undefined);
          const m = (await page.evaluate(MEASURE, undefined)) as Measure;
          if (STILLS) {
            // scroll the rewards card so the hint is in view, as a player would
            await page.evaluate(`document.querySelector("[data-testid=install-hint]")?.scrollIntoView({ block: "nearest" })`, undefined);
            await page.screenshot({ path: join(STILLS, `install-hint-${platform}-${w}x${h}.png`) });
          }
          expect(m.shown).toBe(true);
          expect(m.platform).toBe(platform);
          expect(m.text).toBe(platform === "ios" ? "Play Hordes like an app: tap Share → Add to Home Screen." : "Play Hordes like an app: add it to your home screen.");
          expect(m.out, m.out.join("\n")).toEqual([]);
          expect(m.minFont).toBeGreaterThanOrEqual(11);
          expect(m.buttons.map((b) => b.name)).toEqual(platform === "android" ? ["Hide this tip", "Install"] : ["Hide this tip"]); // DOM order (CSS puts Install before ✕ on a wide card)
          for (const b of m.buttons) expect(Math.min(b.w, b.h), b.name).toBeGreaterThanOrEqual(44);
          expect(m.card.left).toBeGreaterThanOrEqual(INSET.left - 0.5);
          expect(m.card.right).toBeLessThanOrEqual(w - INSET.right + 0.5);
          expect(m.card.bottom).toBeLessThanOrEqual(h - INSET.bottom + 0.5);
          if (platform === "android") {
            await page.evaluate(`document.querySelector(".rw-install__btn").click()`, undefined);
            await page.waitForTimeout(100);
            expect(await page.evaluate(`window.__prompted || 0`, undefined)).toBe(1); // the browser's own sheet opened
          } else {
            await page.evaluate(`document.querySelector(".rw-install__x").click()`, undefined);
            await page.waitForTimeout(100);
          }
          expect(((await page.evaluate(MEASURE, undefined)) as Measure).shown, "hidden after Install / ✕").toBe(false);
          // the next finished run: no hint (once ever), even with a prompt on offer
          await page.evaluate(showResults(true, false), undefined);
          expect(((await page.evaluate(MEASURE, undefined)) as Measure).shown, "once ever").toBe(false);
        } finally {
          await ctx.close();
        }
      }, 30_000);
    }
  }

  it("a desktop (fine pointer) never gets it, even when Chrome offers an install prompt; the 'once' is kept", async (t) => {
    if (!browser) return t.skip();
    const { page, ctx } = await phone("android", 844, 390, false);
    try {
      await page.evaluate(showResults(true, true), undefined);
      expect(((await page.evaluate(MEASURE, undefined)) as Measure).shown).toBe(false);
      expect(await page.evaluate(`localStorage.getItem("topdown-shooter.installHint")`, undefined)).toBeNull();
    } finally {
      await ctx.close();
    }
  }, 30_000);
});
