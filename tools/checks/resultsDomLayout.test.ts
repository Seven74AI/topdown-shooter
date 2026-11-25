import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 7.2 (R9, review L2): the Results "Run rewards" screen measured in a REAL browser at 568×320, 640×360,
 * 800×360 and 844×390 with the 44/21 insets: every element inside its card, both cards inside the safe area, no
 * text under 11 px, the button ≥ 44 px — with short names AND the worst case (four 16-character wide names, 5-digit
 * kills, 7-digit money, a 7-digit run and account total, every breakdown line, the rookie badge, the "YOU" row).
 *
 * Needs Chromium + Playwright (pre-installed in the cloud sessions, reached through NODE_PATH); without them the test
 * is skipped, never failed. The page is the real client served by Vite in-process; the screen is set through its own
 * stores (the same module instances the page uses).
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
  btn: { w: number; h: number };
  rects: { x: number; y: number; right: number; bottom: number }[];
  you: string;
  note: string;
  nCards: number;
  trains: number;
  unlock: string;
  items: string[];
  districts: string[];
  cut: string[];
}

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

interface Case {
  readonly name: string;
  readonly names: readonly string[];
  readonly kills: number;
  readonly earned: number;
  readonly total: number;
  readonly newTotal: number;
  readonly endless: boolean;
  readonly ending: "extracted" | "wiped" | "lost";
  /** Review M5: the 7.11 / 7.12 / 7.7 rows (group 2 items, group 3 unlocks) on top of 7.4's unlock line. */
  readonly meta?: boolean;
}
const CASES: readonly Case[] = [
  { name: "short names", names: ["Mo", "Ana", "Kit", "Lu"], kills: 212, earned: 1840, total: 500, newTotal: 1240, endless: false, ending: "extracted" },
  { name: "worst case (16 × W names, 7-digit money and totals, endless)", names: ["WWWWWWWWWWWWWWWW", "MMMMMMMMMMMMMMMM", "Anastasia-Bérénic", "QQQQQQQQQQQQQQQQ"], kills: 99999, earned: 9_999_999, total: 1_311_900, newTotal: 1_234_567, endless: true, ending: "lost" },
  // review M5: the worst meta case: two new items (the longest reasons), my find, District 2, plus the long names
  { name: "meta rows (2 new items, a find, District 2) with the worst names", names: ["WWWWWWWWWWWWWWWW", "MMMMMMMMMMMMMMMM", "Anastasia-Bérénic", "QQQQQQQQQQQQQQQQ"], kills: 99999, earned: 9_999_999, total: 1_311_900, newTotal: 1_234_567, endless: false, ending: "extracted", meta: true },
];

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

describe.skipIf(!pw)("Story 7.2 (R9 / review L2): Results in a real browser", () => {
  beforeAll(async () => {
    const { createServer } = await import("vite");
    server = (await createServer({ root: CLIENT, configFile: join(CLIENT, "vite.config.ts"), logLevel: "silent", server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false } })) as unknown as typeof server;
    await server!.listen();
    try {
      browser = await pw!.chromium.launch();
    } catch {
      browser = null; // no Chromium on this machine: the tests skip
      return;
    }
    page = await browser.newPage({ viewport: { width: 568, height: 320 } });
    await page.goto(server!.resolvedUrls!.local[0] as string);
    await page.waitForSelector("#start-name", { timeout: 60_000 }); // the app is up (Vite may reload once after pre-bundling)
    await page.waitForTimeout(1500);
    await page.waitForSelector("#start-name", { timeout: 60_000 });
    // The 44/21 safe-area insets (env() can't be emulated headless) and no dev gear.
    await page.addStyleTag({ content: `.results.rw{padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px !important}.dev-gear,.dev-cheats{display:none!important}` });
  }, 90_000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await server?.close();
  });

  for (const c of CASES) {
    for (const [w, h] of SIZES) {
      it(`${w}×${h}, ${c.name}: inside the cards and the safe area, text ≥ 11 px, button ≥ 44 px`, async (ctx) => {
        if (!page) return ctx.skip();
        await page.setViewportSize({ width: w, height: h });
        // Browser code as a string: Vitest would rewrite an import() inside a function passed to the page.
        const m = (await page.evaluate(`(async (k) => {
          const ui = await import("/src/ui/uiState.ts");
          const rs = await import("/src/net/rewardsStore.ts");
          // Story 7.5 (TL3): every row has a Train cell; the worst case mixes "MAX" and "19/20".
          const T = [{ maxHp: 5, damage: 5, startMoney: 5, reload: 5 }, { maxHp: 5, damage: 5, startMoney: 5, reload: 4 }, { maxHp: 0, damage: 0, startMoney: 0, reload: 0 }, { maxHp: 3, damage: 0, startMoney: 0, reload: 0 }];
          const rows = k.names.map((n, i) => ({ slot: i, name: n.slice(0, 16), kills: k.kills, earned: k.earned, training: T[i] }));
          ui.uiStore.set({ kind: "results", wave: k.endless ? 47 : 10, rows, online: true, ending: k.ending, endless: k.endless, seed: 4294967295, dawnEndsAtMs: 0, mySlot: 0 });
          rs.rewardsStore.setRun({ runId: k.endless ? "1f1e2d3c-4b5a-4968-8776-655443322111" : "0f1e2d3c-4b5a-4968-8776-655443322110" });
          rs.rewardsStore.receive({
            runId: k.endless ? "1f1e2d3c-4b5a-4968-8776-655443322111" : "0f1e2d3c-4b5a-4968-8776-655443322110",
            seed: 4294967295,
            status: "saved",
            lines: k.endless ? { waves: 100, boss: 50, extract: 0, endless: 655350, endlessBoss: 350 } : { waves: 100, boss: 50, extract: 100, endless: 0, endlessBoss: 0 },
            waveCount: 10,
            endlessWaveCount: k.endless ? 32767 : 0,
            rookie: true,
            total: k.total,
            newTotal: k.newTotal,
            ending: k.endless ? "quit" : "extracted",
            leftWave: k.endless ? 47 : 0,
            // Story 7.4 (K7): the unlock line in group 3 (the longest weapon name)
            lockedUsed: { unlockId: "grenade_launcher", name: "Grenade Launcher", price: 500 },
            ...(k.meta ? {
              newItems: [{ key: "head:fire", name: "Firefighter helmet", reason: "survived wave 5" }, { key: "head:laurel", name: "Laurel wreath", reason: "extracted with all four standing" }],
              loot: { wave: 9, key: "pack:cat", name: "Cat in the backpack" },
              newDistricts: [{ id: "district_2", name: "District 2" }],
            } : {}),
          });
          for (let i = 0; i < 40 && !document.querySelector(".rw-btn"); i++) await new Promise((r) => setTimeout(r, 50));
          await new Promise((r) => setTimeout(r, 150));
          const cards = [...document.querySelectorAll(".rw-card")];
          const out = [];
          for (const card of cards) {
            const c = card.getBoundingClientRect();
            if (card.scrollWidth > card.clientWidth + 0.5) out.push(\`\${card.className}: scrollWidth \${card.scrollWidth} > \${card.clientWidth}\`);
            for (const el of card.querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              const clipped = el.closest(".rw-body, .rw-table-wrap"); // the two scrolling regions: only check horizontally there
              if (r.left < c.left - 0.5 || r.right > c.right + 0.5) out.push(\`\${el.className || el.tagName} x \${r.left.toFixed(1)}–\${r.right.toFixed(1)} outside \${c.left}–\${c.right}\`);
              if (!clipped && (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5)) out.push(\`\${el.className || el.tagName} y outside the card\`);
            }
          }
          const texts = [...document.querySelectorAll(".results.rw *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const btn = document.querySelector(".rw-btn").getBoundingClientRect();
          const rects = cards.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.left, y: r.top, right: r.right, bottom: r.bottom }));
          const you = document.querySelector(".rw-row--me .rw-you")?.textContent || "";
          const note = document.querySelector("[data-testid=rewards-note]")?.textContent || "";
          // Story 7.5 (TL3): each Train cell's number and bars fit inside the cell (no overlap with Earned).
          const trains = [...document.querySelectorAll("[data-testid=train-cell]")];
          for (const td of trains) {
            const c = td.getBoundingClientRect();
            for (const el of td.querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && (r.left < c.left - 0.5 || r.right > c.right + 0.5)) out.push(\`train cell part \${el.className} \${r.left.toFixed(1)}–\${r.right.toFixed(1)} outside \${c.left.toFixed(1)}–\${c.right.toFixed(1)}\`);
            }
          }
          const unlock = document.querySelector("[data-testid=unlock-line]")?.textContent || "";
          const items = [...document.querySelectorAll("[data-testid=rewards-items] .rw-item__line")].map((e) => e.textContent);
          const districts = [...document.querySelectorAll(".rw-unlock--district")].map((e) => e.textContent);
          // review M5: no meta row's text is cut (wider than its box) unless it ends in an ellipsis
          const cut = [...document.querySelectorAll(".rw-item *, .rw-unlock *")].filter((e) => e.scrollWidth > e.clientWidth + 0.5 && getComputedStyle(e).textOverflow !== "ellipsis").map((e) => e.textContent);
          return { items, districts, cut, out, minFont, btn: { w: btn.width, h: btn.height }, rects, you, note, nCards: cards.length, trains: trains.length, unlock };
})(${JSON.stringify(c)})`, undefined)) as Measure;
        expect(m.nCards).toBe(2);
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(11);
        expect(m.btn.h).toBeGreaterThanOrEqual(44);
        expect(m.btn.w).toBeGreaterThanOrEqual(44);
        for (const r of m.rects) {
          expect(r.x).toBeGreaterThanOrEqual(INSET.left - 0.5);
          expect(r.right).toBeLessThanOrEqual(w - INSET.right + 0.5);
          expect(r.bottom).toBeLessThanOrEqual(h - INSET.bottom + 0.5);
          expect(r.y).toBeGreaterThanOrEqual(0);
        }
        expect(m.you.toUpperCase()).toBe("YOU"); // N1: my own row is marked
        expect(m.trains).toBe(c.names.length); // Story 7.5 liveness: the Train column is drawn on every row
        expect(m.unlock).toBe("You used the Grenade Launcher: unlock it for 500"); // Story 7.4 K7
        if (c.meta) {
          expect(m.items).toEqual(["New item: Firefighter helmet", "New item: Laurel wreath", "Found in wave 9: Cat in the backpack"]);
          expect(m.districts).toEqual(["Unlocked: District 2coming soon"]);
          expect(m.cut).toEqual([]);
        }
        if (c.endless) expect(m.note).toBe("Banked when you left (wave 47)"); // L4
      }, 30_000);
    }
  }
});
