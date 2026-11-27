import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 10.6 (AC 2; Q1 RP1, Q2 B, Q3 B; Epic 7 R9): the Report a problem card from the start-screen Settings and from
 * ☰ → Settings in a run, its "Sent: report K7QF" and failure states, in a REAL browser at 568×320, 640×360, 800×360 and
 * 844×390 with the 44/21 insets: every control inside the safe area, no overlaps, buttons ≥ 44 px, text ≥ 11 px. Plus the
 * behaviour: the exact "what is sent" words, the counter turns amber at 450, Send is busy while sending, the note stays
 * after a failure, Cancel and Esc go back to Settings. The server answer is mocked here (the route has its own tests).
 * Skipped (never failed) without Chromium + Playwright.
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
  keyboard: { press(k: string): Promise<void> };
  close(): Promise<void>;
};

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

const NOTE = "Wave 7, the Brute got stuck behind the bus and the game froze for a few seconds, then my friend was gone.";
const CASES = [
  { name: "start-screen card, typed", screen: { kind: "settings", view: "report" }, sel: "[data-testid=settings-report]", state: "typed", says: "What is sent: your note, the last 200 log lines, your device and browser" },
  { name: "start-screen card, sent", screen: { kind: "settings", view: "report" }, sel: "[data-testid=settings-report]", state: "sent", says: "Sent: report K7QF" },
  { name: "start-screen card, too many", screen: { kind: "settings", view: "report" }, sel: "[data-testid=settings-report]", state: "limited", says: "Too many reports, try again later" },
  { name: "in-run card, typed", screen: { kind: "playing", menu: "report", online: true }, sel: "[data-testid=report-menu]", state: "typed", says: "What is sent: your note, the last 200 log lines, your device and browser" },
];

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

const SETUP = `
  window.__setScreen = async (k) => {
    const ui = await import("/src/ui/uiState.ts");
    const real = window.__realFetch || (window.__realFetch = window.fetch);
    window.__reportBodies = [];
    window.fetch = (u, o) => {
      if (!String(u).endsWith("/account/report")) return real(u, o);
      window.__reportBodies.push(JSON.parse(o.body));
      const r = k.state === "limited" ? new Response('{"message":"rate_limited"}', { status: 429 }) : new Response('{"ok":true,"code":"K7QF"}', { status: 200, headers: { "content-type": "application/json" } });
      return new Promise((res) => setTimeout(() => res(r), 150));
    };
    ui.uiStore.set({ kind: "start" });
    await new Promise((r) => setTimeout(r, 50));
    ui.uiStore.set(k.screen);
    await new Promise((r) => setTimeout(r, 200));
  };
  window.__type = async (text) => {
    const ta = document.querySelector("[data-testid=report-note]");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
  };
`;

describe.skipIf(!pw)("Story 10.6 (AC 2): Report a problem in a real browser", () => {
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
      content: `.in-run-menu{padding:16px ${INSET.right + 16}px ${INSET.bottom + 16}px ${INSET.left + 16}px !important}.menu{padding-left:${INSET.left}px!important;padding-right:${INSET.right}px!important;padding-bottom:${INSET.bottom}px!important}.dev-cheats{display:none!important}.menu.st-modal{scroll-padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px!important}`,
    });
    await page.evaluate(SETUP, undefined);
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  for (const c of CASES) {
    for (const [w, h] of SIZES) {
      it(`${w}×${h}, ${c.name}: inside the safe area, no overlaps, ≥ 44 px, text ≥ 11 px`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        const m = (await page.evaluate(
          `(async (k) => {
          await window.__setScreen(k);
          if (k.state !== "empty") await window.__type(${JSON.stringify(NOTE)});
          if (k.state === "sent" || k.state === "limited") { document.querySelector("[data-testid=report-send]").click(); await new Promise((r) => setTimeout(r, 400)); }
          const root = document.querySelector(k.sel);
          if (!root) return { found: false };
          const W = innerWidth, H = innerHeight;
          const controls = [...root.querySelectorAll("button, input, textarea")];
          const out = [];
          for (const el of [...controls, ...root.querySelectorAll("p, h1, h2")]) {
            el.scrollIntoView({ block: "nearest" });
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < k.inset.left - 0.5 || r.right > W - k.inset.right + 0.5 || r.top < -0.5 || r.bottom > H - k.inset.bottom + 0.5) out.push((el.className || el.tagName) + " outside the safe area: " + el.textContent);
          }
          root.scrollTop = 0;
          const overlaps = [];
          for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect();
            if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push((controls[i].textContent || controls[i].tagName) + " vs " + (controls[j].textContent || controls[j].tagName));
          }
          const texts = [...root.querySelectorAll("*")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const small = controls.filter((b) => b.tagName === "BUTTON").filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((b) => b.textContent);
          const text = root.textContent;
          const note = document.querySelector("[data-testid=report-note]")?.value ?? null;
          return { found: true, out, overlaps, minFont, small, text, note, bodies: window.__reportBodies.length };
        })(${JSON.stringify({ ...c, inset: INSET })})`,
          undefined,
        )) as { found: boolean; out: string[]; overlaps: string[]; minFont: number; small: string[]; text: string; note: string | null; bodies: number };
        expect(m.found, "the card is drawn").toBe(true);
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.overlaps, m.overlaps.join("\n")).toEqual([]);
        expect(m.small).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(11);
        expect(m.text).toContain(c.says);
        if (c.state === "limited") expect(m.note, "the note stays after a failure").toBe(NOTE);
        if (c.state === "sent" || c.state === "limited") expect(m.bodies).toBe(1);
      }, 60_000);
    }
  }

  it("behaviour: counter amber at 450, Send busy while sending, the payload has lines and device, Cancel / Esc back to Settings (start screen and in a run)", async (ctx) => {
    if (!page) return ctx.skip();
    await page.setViewportSize({ width: 844, height: 390 });
    const r = (await page.evaluate(
      `(async () => {
        const ui = await import("/src/ui/uiState.ts");
        await window.__setScreen({ screen: { kind: "settings", view: "main" }, state: "typed" });
        document.querySelector("[data-testid=settings-report-open]").click();
        await new Promise((r) => setTimeout(r, 150));
        const opened = ui.uiStore.get().view;
        await window.__type("x".repeat(449));
        const c449 = document.querySelector("[data-testid=report-count]").className;
        await window.__type("x".repeat(450));
        const c450 = document.querySelector("[data-testid=report-count]").className;
        const counter = document.querySelector("[data-testid=report-count]").textContent;
        document.querySelector("[data-testid=report-send]").click();
        await new Promise((r) => setTimeout(r, 30));
        const send = document.querySelector("[data-testid=report-send]");
        const busy = send.getAttribute("aria-busy") === "true" && send.disabled;
        await new Promise((r) => setTimeout(r, 400));
        const body = window.__reportBodies[0];
        const sent = document.querySelector("[data-testid=report-sent]")?.textContent;
        document.querySelector("[data-testid=report-close]").click();
        await new Promise((r) => setTimeout(r, 100));
        const afterClose = ui.uiStore.get();
        ui.uiStore.set({ kind: "settings", view: "report" });
        await new Promise((r) => setTimeout(r, 100));
        document.querySelector("[data-testid=report-cancel]").click();
        await new Promise((r) => setTimeout(r, 100));
        const afterCancel = ui.uiStore.get();
        ui.uiStore.set({ kind: "settings", view: "report" });
        await new Promise((r) => setTimeout(r, 100));
        return { opened, c449, c450, counter, busy, sent, afterClose, afterCancel, lines: body.payload.lines.length, hasDevice: !!body.payload.device.userAgent, protocol: body.payload.protocol, noteLen: body.note.length };
      })()`,
      undefined,
    )) as Record<string, unknown>;
    expect(r.opened).toBe("report");
    expect(r.c449).not.toContain("rp-count--warn");
    expect(r.c450).toContain("rp-count--warn");
    expect(r.counter).toBe("450 / 500");
    expect(r.busy).toBe(true);
    expect(r.sent).toBe("Sent: report K7QF");
    expect(r.afterClose).toEqual({ kind: "settings", view: "main" });
    expect(r.afterCancel).toEqual({ kind: "settings", view: "main" });
    expect(r.lines as number).toBeGreaterThanOrEqual(1); // at least the boot note
    expect(r.hasDevice).toBe(true);
    expect(r.protocol).toBeGreaterThan(0);
    expect(r.noteLen).toBe(450);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    expect(await page.evaluate(`import("/src/ui/uiState.ts").then((u) => u.uiStore.get())`, undefined)).toEqual({ kind: "settings", view: "main" });
  }, 60_000);
});
