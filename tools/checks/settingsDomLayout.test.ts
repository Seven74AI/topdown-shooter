import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 10.1 (AC 11; the saveMenuDomLayout pattern): the start screen's Settings screen, its Delete my progress confirm
 * (guest and account) and the ☰ in-run Settings view, measured in a REAL browser at 568×320, 640×360, 800×360 and
 * 844×390 with the 44/21 insets (padding and scroll-padding, as `env(safe-area-inset-*)` sets both on a phone). The lists scroll: every control, scrolled into view, lies inside the safe area; no two
 * controls overlap; every button and choice ≥ 44 px; text ≥ 14 px. Skipped (never failed) without Chromium + Playwright.
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
  found: boolean;
  out: string[];
  overlaps: string[];
  minFont: number;
  small: string[];
  controls: number;
  text: string;
}

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

const CASES = [
  { name: "start-screen Settings", screen: { kind: "settings", view: "main" }, sel: "[data-testid=settings-screen]", user: null, says: "Delete my progress", controls: 11 },
  { name: "Delete confirm, guest", screen: { kind: "settings", view: "delete" }, sel: "[data-testid=settings-delete]", user: null, says: "Saved games", controls: 2 },
  { name: "Delete confirm, account", screen: { kind: "settings", view: "delete" }, sel: "[data-testid=settings-delete]", user: "Bartholomew_Long", says: "The account Bartholomew_Long", controls: 3 },
  { name: "in-run Settings", screen: { kind: "playing", menu: "settings", online: true }, sel: "[data-testid=settings-menu]", user: null, says: "Delete my progress is on the start screen", controls: 11 },
  // Review nit: the phone thought it was a guest; the server says wrong_password → the password field appears.
  { name: "Delete confirm after wrong_password", screen: { kind: "settings", view: "delete" }, sel: "[data-testid=settings-delete]", user: null, says: "Wrong password", controls: 3, wrongPassword: true },
  // Review L9: the start screen says this phone's account went away elsewhere.
  { name: "start screen, account gone", screen: { kind: "start" }, sel: "[data-testid=account-gone]", user: "gone", says: "This account was deleted or logged out on another phone", controls: 1 },
];

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

describe.skipIf(!pw)("Story 10.1 (AC 11): Settings in a real browser", () => {
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
    await page.addStyleTag({
      content: `.in-run-menu{padding:16px ${INSET.right + 16}px ${INSET.bottom + 16}px ${INSET.left + 16}px !important}.menu{padding-left:${INSET.left}px!important;padding-right:${INSET.right}px!important;padding-bottom:${INSET.bottom}px!important}.dev-cheats{display:none!important}.in-run-menu--settings{scroll-padding:16px ${INSET.right + 16}px ${INSET.bottom + 16}px ${INSET.left + 16}px!important}.menu.st-modal{scroll-padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px!important}`,
    });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  for (const c of CASES) {
    for (const [w, h] of SIZES) {
      it(`${w}×${h}, ${c.name}: every control inside the safe area when scrolled to, no overlaps, ≥ 44 px, text ≥ 14 px`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        const m = (await page.evaluate(
          `(async (k) => {
          const ui = await import("/src/ui/uiState.ts");
          const acc = await import("/src/net/accountStore.ts");
          if (k.user === "gone") { acc.accountStore.accept("mo_42"); acc.accountStore.accept(null); } else acc.accountStore.accept(k.user);
          ui.uiStore.set({ kind: "lobby", code: "ABCD" });
          await new Promise((r) => setTimeout(r, 50));
          ui.uiStore.set(k.screen);
          await new Promise((r) => setTimeout(r, 300));
          if (k.wrongPassword) {
            const realFetch = window.__realFetch || (window.__realFetch = window.fetch);
            window.fetch = (u, o) => (String(u).endsWith("/account/delete") ? Promise.resolve(new Response(JSON.stringify({ message: "wrong_password" }), { status: 401 })) : realFetch(u, o));
            document.querySelector("[data-testid=settings-delete-confirm]").click();
            await new Promise((r) => setTimeout(r, 300));
            window.fetch = realFetch;
          }
          const root = document.querySelector(k.sel);
          if (!root) return { found: false, out: [], overlaps: [], minFont: 99, small: [], controls: 0, text: "" };
          const W = innerWidth, H = innerHeight;
          const controls = [...root.querySelectorAll("button, input")];
          const out = [];
          for (const el of [...controls, ...root.querySelectorAll("p, h1, h2, li")]) {
            el.scrollIntoView({ block: "nearest" });
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < k.inset.left - 0.5 || r.right > W - k.inset.right + 0.5 || r.top < -0.5 || r.bottom > H - k.inset.bottom + 0.5) out.push((el.className || el.tagName) + " outside the safe area: " + el.textContent);
          }
          const scroller = root.querySelector(".st-body") || root;
          scroller.scrollTop = 0;
          const boxes = controls.map((e) => [e.textContent || e.getAttribute("data-testid") || e.type, e]);
          const overlaps = [];
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i][1].getBoundingClientRect(), b = boxes[j][1].getBoundingClientRect();
            if (boxes[i][1].contains(boxes[j][1]) || boxes[j][1].contains(boxes[i][1])) continue;
            if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(boxes[i][0] + " vs " + boxes[j][0]);
          }
          const texts = [...root.querySelectorAll("*")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const small = controls.filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((b) => b.textContent || b.type);
          const text = root.textContent;
          acc.accountStore.dismissGone();
          ui.uiStore.set({ kind: "start" });
          return { found: true, out, overlaps, minFont, small, controls: controls.length, text };
        })(${JSON.stringify({ ...c, inset: INSET })})`,
          undefined,
        )) as Measure;
        expect(m.found, "the screen is drawn").toBe(true);
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.overlaps, m.overlaps.join("\n")).toEqual([]);
        expect(m.small).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(14);
        expect(m.text).toContain(c.says);
        expect(m.controls).toBeGreaterThanOrEqual(c.controls);
      }, 60_000);
    }
  }
});
