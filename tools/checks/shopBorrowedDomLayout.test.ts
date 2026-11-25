import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 7.4 (R9, review L8; designer pick BT1): the shop with one borrowed card in a REAL browser at 568×320, 640×360,
 * 800×360 and 844×390 with the 44/21 insets: the tag (slot badge + "FROM <lender>") stays inside its card's tape with a
 * 16-character lender name (the text ends in "…", never past the card), no text under 11 px. Skipped (never failed)
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
  tags: number;
  tagText: string;
}

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

const CASES = [
  { name: "lender Mo, slot 2", lender: "Mo", slot: 1 },
  { name: "worst: a 16-character lender (WWWWWWWWWWWWWWWW), slot 4", lender: "WWWWWWWWWWWWWWWW", slot: 3 },
];

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

describe.skipIf(!pw)("Story 7.4 (R9, L8): the borrowed card in a real browser", () => {
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
    await page.addStyleTag({ content: `.shop{padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px !important}.dev-cheats,.dev-gear{display:none!important}` });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  for (const c of CASES) {
    for (const [w, h] of SIZES) {
      it(`${w}×${h}, ${c.name}: the tag inside its card's tape, text ≥ 11 px`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        const m = (await page.evaluate(`(async (k) => {
          const sh = await import("/src/ui/shopStore.ts");
          const S = await import("/@fs${join(__dirname, "..", "..", "packages", "shared", "src", "index.ts")}");
          const cs = await import("/src/ui/cardStats.ts");
          const b = S.loadBalance();
          const catalog = S.cardCatalog(b);
          const cardPrices = {}; for (const x of catalog) cardPrices[x.id] = S.cardPrice(b, x.id, 5) ?? x.basePrice;
          let s = sh.shopStep(sh.shopStore.get(), { type: "close" }).state;
          const step = (i) => { s = sh.shopStep(s, i).state; };
          step({ type: "open", catalog, cardPrices, cardStats: cs.cardStatLines(b), upgradePrices: {}, maxLevel: 4, gear: S.allGear(b), consumables: S.inPoolOnly(S.shopConsumables(b), 0) });
          step({ type: "sync", wallet: 340, slots: ["pistol", null], levels: [1, 0], gearMask: 0, slotItem: null, slotCount: 0 });
          step({ type: "offer", build: 5, offer: { build: 5, rev: 0, cards: ["smg", "hunting_rifle", "shotgun", "grenade_launcher", "body_armor_1", "running_shoes"], sold: 0, rerollPrice: 20, canReroll: true, borrowed: 8, lender: k.slot, lenderName: k.lender } });
          sh.shopStore.set(s);
          await new Promise((r) => setTimeout(r, 200));
          const out = [];
          const tags = [...document.querySelectorAll("[data-testid=borrowed-tag]")];
          for (const tag of tags) {
            const card = tag.closest(".shop-card").getBoundingClientRect();
            const t = tag.getBoundingClientRect();
            if (t.left < card.left - 0.5 || t.right > card.right + 0.5) out.push("tape outside its card");
            for (const el of tag.querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (r.left < t.left - 0.5 || r.right > t.right + 0.5) out.push(el.className + " outside the tape " + r.left.toFixed(1) + "–" + r.right.toFixed(1));
              const st = getComputedStyle(el);
              const clipped = st.overflow === "hidden" && st.textOverflow === "ellipsis";
              if (el.scrollWidth > el.clientWidth + 0.5 && !clipped) out.push(el.className + " text paints past its box");
            }
            if (card.right > window.innerWidth + 0.5 || card.bottom > window.innerHeight + 0.5) out.push("card off screen");
          }
          const texts = [...document.querySelectorAll(".shop *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const tagText = tags[0] ? tags[0].textContent : "";
          sh.shopStore.set(sh.shopStep(sh.shopStore.get(), { type: "close" }).state);
          return { out, minFont, tags: tags.length, tagText };
})(${JSON.stringify(c)})`, undefined)) as Measure;
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(11);
        expect(m.tags).toBe(1); // liveness: exactly one borrowed tag drawn
        expect(m.tagText).toContain(`From ${c.lender}`);
      }, 30_000);
    }
  }
});
