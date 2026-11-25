import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 8.3 (AC 11, R9; the hubDomLayout pattern): the host's in-run Players list (three other seats: connected,
 * reconnecting, waiting; in a build phase and greyed in a wave), its Remove confirm, and the lobby's Remove confirm,
 * measured in a REAL browser at 568×320, 640×360, 800×360 and 844×390 with the 44/21 insets: every part inside the
 * safe area, no overlaps between rows and buttons, every button ≥ 44 px, text ≥ 11 px. Skipped (never failed) where
 * Chromium + Playwright are not installed.
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
  removeDisabled: boolean[];
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
  { playerId: "p1", slot: 1, name: "Bartholomew The Long", ready: true, look: "", waiting: false, held: false },
  { playerId: "p2", slot: 2, name: "Cid", ready: false, look: "", waiting: false, held: true },
  { playerId: "p3", slot: 3, name: "Dee", ready: false, look: "", waiting: true, held: false },
];
const CASES = [
  { name: "Players list, build phase", phase: "build", screen: { kind: "playing", menu: "players", online: true }, sel: "[data-testid=players-menu]", rows: 3, disabled: false },
  { name: "Players list, wave (greyed + note)", phase: "wave", screen: { kind: "playing", menu: "players", online: true }, sel: "[data-testid=players-menu]", rows: 3, disabled: true },
  { name: "in-run Remove confirm", phase: "build", screen: { kind: "playing", menu: "confirmRemove", online: true }, sel: "[data-testid=remove-confirm]", rows: 0, disabled: false },
  { name: "lobby Remove confirm", phase: "lobby", screen: { kind: "lobby", code: "ABCD" }, sel: "[data-testid=lobby-remove-confirm]", rows: 0, disabled: false, lobbyTap: true },
];

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

describe.skipIf(!pw)("Story 8.3 (R9): the Players menu and the Remove confirms in a real browser", () => {
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
    // The notched phone's insets (env() is 0 in headless Chromium).
    await page.addStyleTag({
      content: `.in-run-menu{padding:16px ${INSET.right + 16}px ${INSET.bottom + 16}px ${INSET.left + 16}px !important}.dev-cheats{display:none!important}`,
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
          const mi = await import("/src/ui/menuItems.ts");
          ls.lobbyStore.set({ code: "ABCD", phase: k.phase, hostSlot: 0, players: k.players, localPlayerId: "p0", district: "downtown", districtsOpen: 1, districtReset: "", districtResetSeq: 0, left: k.left ?? [] });
          mi.menuRemoveTarget.set({ playerId: "p1", name: "Bartholomew The Long" });
          ui.uiStore.set({ kind: "start" });
          await new Promise((r) => setTimeout(r, 50));
          ui.uiStore.set(k.screen);
          await new Promise((r) => setTimeout(r, 150));
          if (k.lobbyTap) {
            const b = document.querySelector("[data-testid=lobby-remove]");
            if (b) b.click();
            await new Promise((r) => setTimeout(r, 150));
          }
          const root = document.querySelector(k.sel);
          if (!root) return { found: false, out: [], overlaps: [], minFont: 99, smallButtons: [], rows: 0, removeDisabled: [], text: "" };
          const W = innerWidth, H = innerHeight;
          const out = [];
          const parts = [...root.querySelectorAll("button, .in-run-menu__title, .in-run-menu__note, .in-run-menu__player-name")];
          for (const el of parts) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < k.inset.left - 0.5 || r.right > W - k.inset.right + 0.5 || r.top < -0.5 || r.bottom > H - k.inset.bottom + 0.5) out.push((el.className || el.tagName) + " outside the safe area: " + el.textContent);
          }
          const boxes = [...root.querySelectorAll("button, .in-run-menu__title, .in-run-menu__note")].map((e) => [e.textContent, e.getBoundingClientRect()]);
          const overlaps = [];
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i][1], b = boxes[j][1];
            if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(boxes[i][0] + " vs " + boxes[j][0]);
          }
          const texts = [...root.querySelectorAll("*")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const smallButtons = [...root.querySelectorAll("button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((b) => b.textContent);
          const removes = [...root.querySelectorAll(".in-run-menu__remove")];
          const text = root.textContent;
          ui.uiStore.set({ kind: "start" });
          return { found: true, out, overlaps, minFont, smallButtons, rows: root.querySelectorAll(".in-run-menu__player").length, removeDisabled: removes.map((b) => b.disabled), text };
        })(${JSON.stringify({ ...c, players: PLAYERS, inset: INSET })})`,
          undefined,
        )) as Measure;
        expect(m.found, "the screen is drawn").toBe(true);
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.overlaps, m.overlaps.join("\n")).toEqual([]);
        expect(m.smallButtons).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(11);
        expect(m.rows).toBe(c.rows); // liveness: the three other seats are listed (never me)
        if (c.rows > 0) {
          expect(m.removeDisabled).toEqual([c.disabled, c.disabled, c.disabled]);
          expect(m.text.includes("You can remove players in the build phase")).toBe(c.disabled);
          expect(m.text).toContain("reconnecting");
          expect(m.text).toContain("joins at the build phase");
          expect(m.text).not.toContain("Host Ana");
        } else {
          expect(m.text).toContain("Remove Bartholomew The Long from this run? They can't come back.");
        }
      }, 30_000);
    }
  }
});
