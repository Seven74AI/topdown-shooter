import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 7.6 (brief 13, R9; the 7.2/7.3 DOM layout pattern): the account screens measured in a REAL browser at
 * 568×320, 640×360, 800×360 and 844×390 with the 44/21 insets — the start-screen account line (guest and a 20-char
 * username), the hub header with the line, the Save / Log in / Forgot password forms with an error showing, the
 * recovery-code card and the log-out confirm: inside the safe area, no two tap targets overlap, every button ≥ 44 px,
 * no text under 11 px. KEYBOARD-OPEN STRIP: the same forms with the viewport cut to the strip a landscape phone
 * keyboard leaves (568×130, 800×150): the header and its main button stay fully visible, and the focused field
 * (each one in turn) sits inside the strip under the header. Skipped (never failed) without Chromium + Playwright.
 */
const CLIENT = join(__dirname, "..", "..", "apps", "client");
const SIZES = [
  [568, 320],
  [640, 360],
  [800, 360],
  [844, 390],
] as const;
/** The visible strip with the keyboard up on a landscape phone (AC1 sheet: about 140 px of 320). */
const KEYBOARD_STRIPS = [
  [568, 130],
  [800, 150],
] as const;
const INSET = { left: 44, right: 44, bottom: 21 };
const LONG_NAME = "mo_42_abcdefghijklmn"; // 20 characters, the longest a username can be

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
  problems: string[];
  minFont: number;
  smallButtons: string[];
  drawn: string;
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

/** Shared in-page helpers: rect checks over the visible tap targets of `root`. */
const HELPERS = `
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && el.getAttribute("aria-hidden") !== "true"; };
  const name = (el) => (el.getAttribute("data-testid") || el.className || el.tagName) + " '" + (el.textContent || "").trim().slice(0, 24) + "'";
  const taps = (root) => [...root.querySelectorAll("button, input, a")].filter(vis);
  const check = (root, safe, problems) => {
    const t = taps(root);
    for (const el of t) {
      const r = el.getBoundingClientRect();
      // In a scrolling column (the start screen, the form strip) a control below the fold is reached by scrolling:
      // only its horizontal place is checked; anything not in a scroller must be fully inside.
      const sc = el.closest(".ac-strip, .menu");
      const scrolls = sc && sc.scrollHeight > sc.clientHeight + 1 && getComputedStyle(sc).overflowY !== "hidden";
      const outY = !scrolls && (r.top < safe.top - 0.5 || r.bottom > safe.bottom + 0.5);
      if (r.left < safe.left - 0.5 || r.right > safe.right + 0.5 || r.top < safe.top - 0.5 || outY) problems.push(name(el) + " outside the safe area " + JSON.stringify([r.left, r.top, r.right, r.bottom]));
    }
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
      const a = t[i].getBoundingClientRect(), b = t[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 0.5 && oy > 0.5) problems.push(name(t[i]) + " overlaps " + name(t[j]));
    }
    const texts = [...root.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
    for (const e of texts) {
      const cs = getComputedStyle(e);
      const clipped = cs.overflow === "hidden" && cs.textOverflow === "ellipsis";
      if (e.scrollWidth > e.clientWidth + 1 && !clipped && cs.overflowX !== "auto" && e.tagName !== "INPUT") problems.push(name(e) + " text wider than its box");
    }
    return {
      minFont: Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize))),
      smallButtons: [...root.querySelectorAll("button")].filter(vis).filter((b) => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map(name),
    };
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
`;

describe.skipIf(!pw)("Story 7.6 (R9, brief 13): the account screens in a real browser", () => {
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
      content: `.menu{padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px !important}.menu.ph{padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px !important}.dev-cheats,.dev-gear{display:none!important}`,
    });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  const SCREENS = [
    { id: "start, guest", screen: { kind: "start" }, user: null, sel: ".menu", drawn: "[data-testid=ac-open-login]" },
    { id: "start, logged in (20-char name)", screen: { kind: "start" }, user: LONG_NAME, sel: ".menu", drawn: "[data-testid=ac-open-logout]" },
    { id: "hub header, guest", screen: { kind: "progress", back: { kind: "start" } }, user: null, sel: ".ph-head", drawn: "[data-testid=ac-open-login]" },
    { id: "hub header, logged in (20-char name)", screen: { kind: "progress", back: { kind: "start" } }, user: LONG_NAME, sel: ".ph-head", drawn: "[data-testid=ac-open-logout]" },
    { id: "Save my progress, error", screen: { kind: "account", view: "save", back: { kind: "start" } }, user: null, sel: ".ac", drawn: "[data-testid=account-save]", error: "That name is taken" },
    { id: "Log in, error", screen: { kind: "account", view: "login", back: { kind: "start" } }, user: null, sel: ".ac", drawn: "[data-testid=ac-forgot]", error: "Wrong username or password" },
    { id: "Forgot password, code hint", screen: { kind: "account", view: "forgot", back: { kind: "start" } }, user: null, sel: ".ac", drawn: "[data-testid=ac-code-hint]", code: "abcd-efgh-jk" },
    { id: "recovery-code card", screen: { kind: "account", view: "code", back: { kind: "start" }, code: "WWWW-WWWW-WWWW" }, user: LONG_NAME, sel: ".ac", drawn: "[data-testid=recovery-code]" },
    { id: "log-out confirm", screen: { kind: "account", view: "logout", back: { kind: "start" } }, user: LONG_NAME, sel: ".ac", drawn: "[data-testid=account-logout]" },
  ] as const;

  for (const s of SCREENS) {
    for (const [w, h] of SIZES) {
      it(`${w}×${h}, ${s.id}: inside the safe area, no overlap, buttons ≥ 44 px, text ≥ 11 px`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        const m = (await page.evaluate(
          `(async (k) => {
            ${HELPERS}
            const ui = await import("/src/ui/uiState.ts");
            const as = await import("/src/net/accountStore.ts");
            ui.uiStore.set({ kind: "start" });
            await wait(30);
            as.accountStore.accept(k.user);
            ui.uiStore.set(k.screen);
            await wait(120);
            if (k.code) { const i = document.querySelector(".ac-input--code"); i.value = k.code; i.dispatchEvent(new Event("input", { bubbles: true })); await wait(60); }
            if (k.error) {
              // the error line as the server's refusal draws it (no server here)
              const strip = document.querySelector(".ac-strip"); const p = document.createElement("p"); p.className = "ac-error"; p.setAttribute("role", "alert"); p.textContent = k.error; strip.prepend(p);
              for (const i of document.querySelectorAll(".ac-input")) i.classList.add("ac-input--bad");
              await wait(30);
            }
            const root = document.querySelector(k.sel);
            const problems = [];
            const safe = { left: ${INSET.left}, right: innerWidth - ${INSET.right}, top: 0, bottom: innerHeight - ${INSET.bottom} };
            const r = check(root, safe, problems);
            // a scrolling strip may hold fields below the fold: only what is on screen must be inside the safe area,
            // and the header's parts must stay inside the header.
            const head = document.querySelector(".ph-head");
            if (head && root.contains(head)) {
              const hr = head.getBoundingClientRect();
              for (const el of head.children) { const b = el.getBoundingClientRect(); if (b.width && (b.right > hr.right + 10.5 || b.left < hr.left - 2.5)) problems.push(name(el) + " past the header"); }
            }
            return { problems, minFont: r.minFont, smallButtons: r.smallButtons, drawn: document.querySelector(k.drawn) ? "yes" : "no" };
          })(${JSON.stringify(s)})`,
          undefined,
        )) as Measure;
        expect(m.drawn).toBe("yes"); // liveness: the screen under test is really on the page
        expect(m.problems, m.problems.join("\n")).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(11);
        expect(m.smallButtons).toEqual([]);
      }, 30_000);
    }
  }

  for (const view of ["save", "login", "forgot"] as const) {
    for (const [w, h] of KEYBOARD_STRIPS) {
      it(`keyboard open (${w}×${h}), ${view}: the header + main button stay visible and each focused field sits in the strip under it`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        const m = (await page.evaluate(
          `(async (view) => {
            ${HELPERS}
            const ui = await import("/src/ui/uiState.ts");
            ui.uiStore.set({ kind: "start" });
            await wait(30);
            ui.uiStore.set({ kind: "account", view, back: { kind: "start" } });
            await wait(120);
            const problems = [];
            const main = document.querySelector("[data-testid=ac-main]").getBoundingClientRect();
            const back = document.querySelector("[data-testid=ac-back]").getBoundingClientRect();
            for (const [n, r] of [["main button", main], ["back", back]]) {
              if (r.top < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth - ${INSET.right} + 0.5 || r.left < ${INSET.left} - 0.5) problems.push(n + " not fully visible " + JSON.stringify([r.left, r.top, r.right, r.bottom]));
              if (r.height < 44) problems.push(n + " under 44 px");
            }
            const strip = document.querySelector(".ac-strip").getBoundingClientRect();
            const inputs = [...document.querySelectorAll(".ac-input")];
            for (const input of inputs) {
              input.focus();
              input.dispatchEvent(new FocusEvent("focus"));
              await wait(80);
              const r = input.getBoundingClientRect();
              if (r.top < strip.top - 0.5 || r.bottom > Math.min(strip.bottom, innerHeight) + 0.5) problems.push(input.name + " not in the strip when focused " + JSON.stringify([r.top, r.bottom, strip.top, strip.bottom]));
              if (r.top < main.bottom - 0.5) problems.push(input.name + " under the header");
            }
            return { problems, minFont: 11, smallButtons: [], drawn: String(inputs.length) };
          })(${JSON.stringify(view)})`,
          undefined,
        )) as Measure;
        expect(Number(m.drawn)).toBe(view === "forgot" ? 3 : 2);
        expect(m.problems, m.problems.join("\n")).toEqual([]);
      }, 30_000);
    }
  }
});
