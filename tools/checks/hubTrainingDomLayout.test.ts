import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 7.5 (R9, AC 8; the hubDomLayout pattern): the Progress hub's Training tab (TR1) in a REAL browser at 568×320,
 * 640×360, 800×360 and 844×390 with the 44/21 insets: four rows, every part inside its column (five pips, "Now / Next ·
 * ▣ 250", "Confirm 250", "need 250 more", MAXED), no text under 11 px, every button ≥ 44 px. Skipped (never failed)
 * where Chromium + Playwright are not installed.
 */
const CLIENT = join(__dirname, "..", "..", "apps", "client");
const SIZES = [
  [568, 320],
  [640, 360],
  [800, 360],
  [844, 390],
] as const;
const INSET = { left: 44, right: 44, bottom: 21 };

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

interface Measure {
  out: string[];
  minFont: number;
  smallButtons: string[];
  frame: { x: number; y: number; right: number; bottom: number };
  rows: number;
  maxed: number;
  confirm: string;
  pipsOn: number;
}

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

const CASES = [
  { name: "new player, 340, Confirm on Start money", progress: { supplies: 340, lifetimeSupplies: 340, unlocks: [] as string[], training: {} }, confirm: "start_money", maxed: 0, pipsOn: 0 },
  { name: "worst: 0 Supplies (need 250 more), one maxed, levels 4/5/4/4", progress: { supplies: 0, lifetimeSupplies: 9000, unlocks: [] as string[], training: { max_hp: 4, damage: 5, start_money: 4, reload: 4 } }, confirm: "", maxed: 1, pipsOn: 17 },
  { name: "worst: 7-digit total, Confirm 250 on Reload", progress: { supplies: 1_234_567, lifetimeSupplies: 1_234_567, unlocks: [] as string[], training: { max_hp: 5, damage: 5, start_money: 5, reload: 4 } }, confirm: "reload", maxed: 3, pipsOn: 19 },
];

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

describe.skipIf(!pw)("Story 7.5 (R9): the Training tab in a real browser", () => {
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
    await page.addStyleTag({ content: `.menu.ph{padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px !important}.dev-cheats{display:none!important}` });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  for (const c of CASES) {
    for (const [w, h] of SIZES) {
      it(`${w}×${h}, ${c.name}: inside the safe area and the row columns, text ≥ 11 px, buttons ≥ 44 px`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        const m = (await page.evaluate(`(async (k) => {
          const ui = await import("/src/ui/uiState.ts");
          const ps = await import("/src/net/progressStore.ts");
          if (ui.uiStore.get().kind !== "progress") ui.uiStore.set({ kind: "progress", back: { kind: "start" } });
          for (let i = 0; i < 100 && (ps.progressStore.get().loading || !document.querySelector(".ph-list")); i++) await new Promise((r) => setTimeout(r, 50));
          document.querySelector('[data-tab="training"]').click();
          await new Promise((r) => setTimeout(r, 50));
          ps.progressStore.accept(k.progress);
          await new Promise((r) => setTimeout(r, 150));
          if (k.confirm) document.querySelector('[data-boost="' + k.confirm + '"] .ph-btn').click();
          await new Promise((r) => setTimeout(r, 100));
          const frame = document.querySelector(".ph-frame").getBoundingClientRect();
          const out = [];
          for (const el of document.querySelectorAll(".ph-frame *")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < frame.left - 0.5 || r.right > frame.right + 0.5) out.push((el.className || el.tagName) + " outside the frame x");
          }
          for (const row of document.querySelectorAll(".tr-row")) {
            const pips = row.children[0].getBoundingClientRect();
            const col = row.children[1].getBoundingClientRect();
            const act = row.children[2].getBoundingClientRect();
            if (pips.right > col.left + 0.5) out.push("pips run into the text column: " + row.textContent);
            if (col.right > act.left + 0.5) out.push("text column runs into the action column: " + row.textContent);
            for (const el of row.children[1].querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (r.right > col.right + 0.5) out.push((el.className || el.tagName) + " past its column: " + row.textContent);
              const cs = getComputedStyle(el);
              const clipped = cs.overflow === "hidden" && cs.textOverflow === "ellipsis";
              if (el.scrollWidth > el.clientWidth + 0.5 && !clipped && r.left + el.scrollWidth > col.right + 0.5) out.push((el.className || el.tagName) + " text paints past its column: " + row.textContent);
            }
            for (const el of row.children[2].querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (r.left < act.left - 0.5 || r.right > act.right + 0.5) out.push((el.className || el.tagName) + " past the action column");
            }
          }
          const texts = [...document.querySelectorAll(".ph *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const smallButtons = [...document.querySelectorAll(".ph button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((b) => b.textContent);
          const confirm = document.querySelector(".tr-row .ph-btn--confirm")?.textContent ?? "";
          return { out, minFont, smallButtons, frame: { x: frame.left, y: frame.top, right: frame.right, bottom: frame.bottom }, rows: document.querySelectorAll(".tr-row").length, maxed: document.querySelectorAll(".tr-maxed").length, confirm, pipsOn: document.querySelectorAll(".tr-pip--on").length };
})(${JSON.stringify(c)})`, undefined)) as Measure;
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(11);
        expect(m.smallButtons).toEqual([]);
        expect(m.frame.x).toBeGreaterThanOrEqual(INSET.left - 0.5);
        expect(m.frame.right).toBeLessThanOrEqual(w - INSET.right + 0.5);
        expect(m.frame.bottom).toBeLessThanOrEqual(h - INSET.bottom + 0.5);
        expect(m.rows).toBe(4); // liveness: the four boosts are really drawn
        expect(m.maxed).toBe(c.maxed);
        expect(m.pipsOn).toBe(c.pipsOn);
        if (c.confirm) expect(m.confirm).toContain("Confirm");
      }, 30_000);
    }
  }
});
