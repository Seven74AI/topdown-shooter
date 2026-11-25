import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Review M5 (Story 7.7 DP2; the hubDomLayout pattern): the lobby's district sheet measured in a REAL browser at
 * 568×320 (and the other three sizes), host view, both districts open: every card inside the sheet and the sheet
 * inside the screen, each card's name and line in full (no text wider than its box), text ≥ 11 px, card buttons
 * ≥ 44 px; 7.3's Progress button and the district line both drawn, ≥ 44 px, inside the screen and apart.
 * Skipped (never failed) where Chromium + Playwright are not installed.
 */
const CLIENT = join(__dirname, "..", "..", "apps", "client");
const SIZES = [
  [568, 320],
  [640, 360],
  [800, 360],
  [844, 390],
] as const;

type Pw = { chromium: { launch(): Promise<Browser> } };
type Browser = { newPage(o: object): Promise<Page>; close(): Promise<void> };
type Page = {
  goto(u: string): Promise<unknown>;
  waitForSelector(s: string, o?: object): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  addStyleTag(o: { content: string }): Promise<unknown>;
  evaluate(src: string, arg: undefined): Promise<unknown>;
  close(): Promise<void>;
};
interface Box {
  x: number;
  y: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
}
interface Measure {
  sheet: Box | null;
  cards: { text: string; box: Box; btnH: number }[];
  out: string[];
  minFont: number;
  progress: Box | null;
  district: Box | null;
}

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}
let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

const overlap = (a: Box, b: Box): boolean => a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;

describe.skipIf(!pw)("Story 7.7 DP2 (review M5): the district sheet in a real browser", () => {
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
    page = await browser.newPage({ viewport: { width: 568, height: 320 } });
    await page.goto(server!.resolvedUrls!.local[0] as string);
    await page.waitForSelector("#start-name", { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.waitForSelector("#start-name", { timeout: 60_000 });
    await page.addStyleTag({ content: `.dev-gear,.dev-cheats{display:none!important}` });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  for (const [w, h] of SIZES) {
    it(`${w}×${h}: cards inside the sheet, full text, ≥ 11 px, buttons ≥ 44 px; Progress and the district line drawn apart`, async (ctx) => {
      if (!page) return ctx.skip();
      await page.setViewportSize({ width: w, height: h });
      const m = (await page.evaluate(`(async () => {
        const ui = await import("/src/ui/uiState.ts");
        const ls = await import("/src/net/lobbyStore.ts");
        const names = ["WWWWWWWWWWWWWWWW", "MMMMMMMMMMMMMMMM", "Anastasia-Bérénic", "QQQQQQQQQQQQQQQQ"];
        ls.lobbyStore["set"]({ code: "ABCD", phase: "lobby", hostSlot: 0, players: names.map((n, i) => ({ playerId: "p" + i, slot: i, name: n.slice(0, 16), ready: i > 0, look: "" })), localPlayerId: "p0", district: "downtown", districtsOpen: 3, districtReset: "", districtResetSeq: 0 });
        ui.uiStore.set({ kind: "lobby", code: "ABCD" });
        await new Promise((r) => setTimeout(r, 150));
        const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
        if (!document.querySelector("[data-testid=district-sheet]")) document.querySelector("button.lobby__district").click();
        await new Promise((r) => setTimeout(r, 150));
        const sheetEl = document.querySelector("[data-testid=district-sheet]");
        const out = [];
        const cards = [...document.querySelectorAll(".district-card")].map((li) => {
          const c = li.getBoundingClientRect();
          for (const el of li.querySelectorAll("*")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) out.push((el.className || el.tagName) + " outside its card");
            if (el.scrollWidth > el.clientWidth + 0.5 && getComputedStyle(el).overflow !== "visible") out.push((el.className || el.tagName) + " text cut: " + el.textContent);
          }
          return { text: li.textContent, box: box(li), btnH: li.querySelector("button").getBoundingClientRect().height };
        });
        const texts = [...document.querySelectorAll(".district-sheet *, .lobby__progress, .lobby__district *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
        const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
        return { sheet: box(sheetEl), cards, out, minFont, progress: box(document.querySelector(".lobby__progress")), district: box(document.querySelector("button.lobby__district")) };
      })()`, undefined)) as Measure;
      expect(m.sheet).not.toBeNull();
      expect(m.out, m.out.join("\n")).toEqual([]);
      expect(m.cards).toHaveLength(2); // liveness: both cards drawn (Downtown, District 2)
      expect(m.cards[0]?.text).toContain("Downtown");
      expect(m.cards[1]?.text).toContain("District 2");
      for (const c of m.cards) {
        expect(c.box.x).toBeGreaterThanOrEqual(m.sheet!.x - 0.5);
        expect(c.box.right).toBeLessThanOrEqual(m.sheet!.right + 0.5);
        expect(c.box.bottom).toBeLessThanOrEqual(m.sheet!.bottom + 0.5);
        expect(c.btnH).toBeGreaterThanOrEqual(44);
      }
      expect(m.sheet!.x).toBeGreaterThanOrEqual(0);
      expect(m.sheet!.right).toBeLessThanOrEqual(w + 0.5);
      expect(m.sheet!.bottom).toBeLessThanOrEqual(h + 0.5);
      expect(m.minFont).toBeGreaterThanOrEqual(11);
      // 7.3's Progress button beside DP2's district line: both drawn, both ≥ 44 px tall, inside the screen, apart
      expect(m.progress).not.toBeNull();
      expect(m.district).not.toBeNull();
      for (const b of [m.progress!, m.district!]) {
        expect(b.h).toBeGreaterThanOrEqual(44);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(w + 0.5);
      }
      expect(overlap(m.progress!, m.district!)).toBe(false);
      expect(overlap(m.progress!, m.sheet!)).toBe(false);
    }, 30_000);
  }
});
