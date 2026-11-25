import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 7.10 (AC 2, 9, 13; E2, E4; R9; the 7.3 hubDomLayout pattern): the survivor editor measured in a REAL browser at
 * 568×320, 640×360, 800×360 and 844×390 with the 44/21 insets, on every tab, with the longest locked line tapped:
 * the frame inside the safe area, no overlaps between its parts, both previews fully on screen (never scrolled away),
 * every button ≥ 44 px, text ≥ 14 px, no price or Supplies text (E2). Then Done with no server: the honest
 * "Saved on this phone…" line and the look kept as pending (E4). Skipped (never failed) without Chromium + Playwright.
 */
const CLIENT = join(__dirname, "..", "..", "apps", "client");
const SIZES = [
  [568, 320],
  [640, 360],
  [800, 360],
  [844, 390],
] as const;
const INSET = { left: 44, right: 44, bottom: 21 };
const TABS = ["top", "head", "hair", "pack", "skin"] as const;
/** The longest milestone line on each tab that has one (m8 "Extract with all 4 players standing" on Head). */
const TAP: Partial<Record<(typeof TABS)[number], string>> = { head: "laurel", top: "camo", pack: "golf" };

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
  previews: { top: number; bottom: number; h: number; w: number }[];
  info: string;
  tiles: number;
  shop: string[];
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

describe.skipIf(!pw)("Story 7.10 (R9): the survivor editor in a real browser", () => {
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
    await page.addStyleTag({ content: `.menu.se{padding:6px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px !important}.dev-cheats{display:none!important}` });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  for (const [w, h] of SIZES)
    for (const tab of TABS) {
      it(`${w}×${h}, ${tab} tab${TAP[tab] ? ` (${TAP[tab]} tapped)` : ""}: inside the safe area, no overlaps, previews on screen, buttons ≥ 44 px, text ≥ 14 px, no prices`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        const m = (await page.evaluate(`(async (k) => {
          const ui = await import("/src/ui/uiState.ts");
          if (ui.uiStore.get().kind !== "survivor") ui.uiStore.set({ kind: "survivor", back: { kind: "progress", back: { kind: "start" } } });
          for (let i = 0; i < 100 && !document.querySelector(".se-tiles"); i++) await new Promise((r) => setTimeout(r, 50));
          document.querySelector('[data-tab="' + k.tab + '"]').click();
          await new Promise((r) => setTimeout(r, 120));
          if (k.tap) document.querySelector('[data-part="' + k.tap + '"]').click();
          await new Promise((r) => setTimeout(r, 250));
          const R = (el) => el.getBoundingClientRect();
          const frame = R(document.querySelector(".se-frame"));
          const out = [];
          for (const el of document.querySelectorAll(".se-frame *")) {
            const r = R(el);
            if (r.width === 0 && r.height === 0) continue;
            if (el.closest(".se-swatches") && el !== el.closest(".se-swatches")) continue; // swatches scroll sideways inside their strip
            if (el.closest(".se-tiles") && el !== el.closest(".se-tiles")) continue; // tiles scroll inside their box
            if (r.left < frame.left - 0.5 || r.right > frame.right + 0.5 || r.top < frame.top - 0.5 || r.bottom > frame.bottom + 0.5) out.push((el.className || el.tagName) + " outside the frame");
          }
          const parts = [".se-back", ".se-big", ".se-game", ".se-tabs", ".se-tiles", ".se-info", ".se-colours", ".se-actions", ".se-sw"];
          const boxes = [];
          for (const sel of parts) for (const el of document.querySelectorAll(sel)) boxes.push([sel, R(el)]);
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const [na, a] = boxes[i];
              const [nb, b] = boxes[j];
              if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) out.push(na + " overlaps " + nb);
            }
          // the info text is clipped with an ellipsis, never painted past its row
          const info = document.querySelector(".se-info__text");
          const cs = getComputedStyle(info);
          if (info.scrollWidth > info.clientWidth + 0.5 && !(cs.overflow === "hidden" && cs.textOverflow === "ellipsis")) out.push("info text paints past its row");
          for (const b of document.querySelectorAll(".se-actions .se-btn")) if (b.scrollWidth > b.clientWidth + 1) out.push("button text cut: " + b.textContent);
          const texts = [...document.querySelectorAll(".se *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== "") && R(e).width > 0 && !e.classList.contains("se-sr"));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const smallButtons = [...document.querySelectorAll(".se button, .se label.se-picker")].filter((b) => { const r = R(b); return r.width > 0 && (r.width < 43.5 || r.height < 43.5); }).map((b) => b.className + ":" + b.textContent);
          const previews = [...document.querySelectorAll(".se-big, .se-game")].map((c) => { const r = R(c); return { top: r.top, bottom: r.bottom, h: r.height, w: r.width }; });
          const shop = [...document.querySelectorAll(".se *")].map((e) => e.textContent || "").filter((t) => /supplies|price|buy|unlock ·/i.test(t));
          return { out, minFont, smallButtons, frame: { x: frame.left, y: frame.top, right: frame.right, bottom: frame.bottom }, previews, info: document.querySelector("[data-testid=se-info]").textContent, tiles: document.querySelectorAll(".se-tile").length, shop };
})(${JSON.stringify({ tab, tap: TAP[tab] ?? null })})`, undefined)) as Measure;
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(14);
        expect(m.smallButtons).toEqual([]);
        expect(m.frame.x).toBeGreaterThanOrEqual(INSET.left - 0.5);
        expect(m.frame.right).toBeLessThanOrEqual(w - INSET.right + 0.5);
        expect(m.frame.bottom).toBeLessThanOrEqual(h - INSET.bottom + 0.5);
        expect(m.frame.y).toBeGreaterThanOrEqual(0);
        for (const p of m.previews) {
          expect(p.top).toBeGreaterThanOrEqual(0);
          expect(p.bottom).toBeLessThanOrEqual(h - INSET.bottom + 0.5);
          expect(p.h).toBeGreaterThanOrEqual(80); // AC 2: both previews really visible at 568 × 320
          expect(p.w).toBeGreaterThanOrEqual(150);
        }
        expect(m.tiles).toBeGreaterThan(0);
        expect(m.shop).toEqual([]); // E2: never a price or Supplies text
        if (tab === "head") expect(m.info).toBe("Laurel wreath: Extract with all 4 players standing"); // liveness: the longest line is drawn
      }, 30_000);
    }

  it("E4 / AC 9: Done with the server unreachable → 'Saved on this phone…', the look kept as pending; then the editor closes by itself", async (ctx) => {
    if (!page) return ctx.skip();
    await page.setViewportSize({ width: 568, height: 320 });
    const r = (await page.evaluate(`(async () => {
      localStorage.removeItem("topdown.look");
      const ui = await import("/src/ui/uiState.ts");
      ui.uiStore.set({ kind: "start" });
      await new Promise((r) => setTimeout(r, 50));
      ui.uiStore.set({ kind: "survivor", back: { kind: "progress", back: { kind: "start" } } });
      for (let i = 0; i < 100 && !document.querySelector(".se-tiles"); i++) await new Promise((r) => setTimeout(r, 50));
      document.querySelector('[data-tab="hair"]').click();
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('[data-part="mohawk"]').click();
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector(".se-done").click();
      let line = "";
      for (let i = 0; i < 120 && !line.includes("phone"); i++) { await new Promise((r) => setTimeout(r, 50)); line = document.querySelector("[data-testid=se-info]").textContent; }
      const stored = JSON.parse(localStorage.getItem("topdown.look") || "null");
      for (let i = 0; i < 80 && ui.uiStore.get().kind === "survivor"; i++) await new Promise((r) => setTimeout(r, 50));
      return { line, stored, after: ui.uiStore.get().kind };
    })()`, undefined)) as { line: string; stored: { code: string; base: string | null } | null; after: string };
    expect(r.line).toBe("Saved on this phone. It will sync next time.");
    expect(r.line).not.toMatch(/^Saved$/);
    expect(r.stored?.code).toContain("hair:mohawk");
    expect(r.after).toBe("progress"); // closed back to the hub
  }, 30_000);
});
