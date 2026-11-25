import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Stories 8.5 + 8.6 (AC 10, 11, R9; the playersMenuDomLayout pattern): the host's in-run menu with Save and quit (a
 * build phase; greyed with its note in a wave), the Save confirm (and its "Saving…" / failed states), and the start
 * screen's Saved games list (three rows, long names), measured in a REAL browser at 568×320, 640×360, 800×360 and
 * 844×390 with the 44/21 insets: inside the safe area, no overlaps, every button ≥ 44 px, text ≥ 11 px. Skipped (never
 * failed) where Chromium + Playwright are not installed.
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
  smallButtons: string[];
  rows: number;
  saveDisabled: boolean | null;
  text: string;
}

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

const PLAYERS = [
  { playerId: "p0", slot: 0, name: "Host Ana", ready: true, look: "", waiting: false, held: false },
  { playerId: "p1", slot: 1, name: "Bo", ready: true, look: "", waiting: false, held: false },
];
const SAVED = [
  { id: "0f1e2d3c-4b5a-4968-8776-655443322110", district: "downtown", wave: 6, names: [{ name: "Ana", slot: 0 }, { name: "Bartholomew The Long", slot: 1 }, { name: "Theo", slot: 2 }, { name: "Dee", slot: 3 }], savedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), expiresAt: new Date().toISOString() },
  { id: "1f1e2d3c-4b5a-4968-8776-655443322111", district: "downtown", wave: 3, names: [{ name: "Ana", slot: 0 }], savedAt: new Date().toISOString(), expiresAt: new Date().toISOString() },
  { id: "2f1e2d3c-4b5a-4968-8776-655443322112", district: "downtown", wave: 10, names: [{ name: "Ana", slot: 0 }, { name: "Bo", slot: 1 }], savedAt: new Date(Date.now() - 3_600_000).toISOString(), expiresAt: new Date().toISOString() },
];
const CASES = [
  { name: "menu, build phase (Save and quit enabled)", phase: "build", screen: { kind: "playing", menu: "open", online: true }, sel: ".in-run-menu", rows: 0, saveDisabled: false, says: "Save and quit" },
  { name: "menu, wave (Save and quit greyed + note)", phase: "wave", screen: { kind: "playing", menu: "open", online: true }, sel: ".in-run-menu", rows: 0, saveDisabled: true, says: "You can save during the build phase" },
  { name: "Save confirm", phase: "build", screen: { kind: "playing", menu: "confirmSave", online: true }, sel: "[data-testid=save-confirm]", rows: 0, saveDisabled: null, says: "Anyone from this run can resume it for 7 days." },
  { name: "Save confirm, failed", phase: "build", screen: { kind: "playing", menu: "confirmSave", online: true }, sel: "[data-testid=save-confirm]", rows: 0, saveDisabled: null, says: "Couldn't save the run. Try again.", failed: true },
  { name: "start screen, Saved games", phase: "lobby", screen: { kind: "start" }, sel: "[data-testid=saved-games]", rows: 3, saveDisabled: null, says: "Downtown · Wave 6 · Ana, Bartholomew The Long, Theo, Dee", start: true },
];

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

describe.skipIf(!pw)("Stories 8.5 + 8.6 (R9): Save and quit and Saved games in a real browser", () => {
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
      content: `.in-run-menu{padding:16px ${INSET.right + 16}px ${INSET.bottom + 16}px ${INSET.left + 16}px !important}.menu{padding-left:${INSET.left}px!important;padding-right:${INSET.right}px!important;padding-bottom:${INSET.bottom}px!important}.dev-cheats{display:none!important}`,
    });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  for (const c of CASES) {
    for (const [w, h] of SIZES) {
      it(`${w}×${h}, ${c.name}: inside the safe area, no overlaps, buttons ≥ 44 px, text ≥ 11 px`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        const m = (await page.evaluate(
          `(async (k) => {
          const ui = await import("/src/ui/uiState.ts");
          const ls = await import("/src/net/lobbyStore.ts");
          const realFetch = window.__realFetch || (window.__realFetch = window.fetch);
          window.fetch = (u, o) => (String(u).endsWith("/saved-runs") ? Promise.resolve(new Response(JSON.stringify(k.saved), { status: 200, headers: { "content-type": "application/json" } })) : realFetch(u, o));
          ls.lobbyStore.set({ code: "ABCD", phase: k.phase, hostSlot: 0, players: k.players, localPlayerId: "p0", district: "downtown", districtsOpen: 1, districtReset: "", districtResetSeq: 0, left: [], resumeWave: 0 });
          ls.saveQuitStore.set(k.failed ? "failed" : "idle");
          ui.uiStore.set({ kind: "lobby", code: "ABCD" });
          await new Promise((r) => setTimeout(r, 50));
          ui.uiStore.set(k.screen);
          await new Promise((r) => setTimeout(r, 400));
          const root = document.querySelector(k.sel);
          if (root && k.start) { root.scrollIntoView({ block: "start" }); await new Promise((r) => setTimeout(r, 100)); } // the start screen scrolls
          if (!root) return { found: false, out: [], overlaps: [], minFont: 99, smallButtons: [], rows: 0, saveDisabled: null, text: "" };
          const W = innerWidth, H = innerHeight;
          const out = [];
          const parts = [...root.querySelectorAll("button, p, h2, .saved-games__name, .saved-games__ago")];
          for (const el of parts) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < k.inset.left - 0.5 || r.right > W - k.inset.right + 0.5 || r.top < -0.5 || r.bottom > H - k.inset.bottom + 0.5) out.push((el.className || el.tagName) + " outside the safe area: " + el.textContent);
          }
          const boxes = [...root.querySelectorAll("button, .in-run-menu__title, .in-run-menu__note, .saved-games__text")].map((e) => [e.textContent, e.getBoundingClientRect()]);
          const overlaps = [];
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i][1], b = boxes[j][1];
            if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(boxes[i][0] + " vs " + boxes[j][0]);
          }
          const texts = [...root.querySelectorAll("*")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const smallButtons = [...root.querySelectorAll("button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((b) => b.textContent);
          const save = root.querySelector("[data-testid=menu-save]");
          const text = root.textContent;
          ui.uiStore.set({ kind: "lobby", code: "ABCD" });
          ls.saveQuitStore.set("idle");
          return { found: true, out, overlaps, minFont, smallButtons, rows: root.querySelectorAll(".saved-games__row").length, saveDisabled: save ? save.disabled : null, text };
        })(${JSON.stringify({ ...c, players: PLAYERS, saved: SAVED, inset: INSET })})`,
          undefined,
        )) as Measure;
        expect(m.found, "the screen is drawn").toBe(true);
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.overlaps, m.overlaps.join("\n")).toEqual([]);
        expect(m.smallButtons).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(11);
        expect(m.rows).toBe(c.rows);
        expect(m.saveDisabled).toBe(c.saveDisabled);
        expect(m.text).toContain(c.says);
      }, 30_000);
    }
  }
});
