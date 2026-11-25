import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 7.3 (R9; the 7.2 resultsDomLayout pattern): the Progress hub measured in a REAL browser at 568×320, 640×360,
 * 800×360 and 844×390 with the 44/21 insets: the frame inside the safe area, every row part inside its column (the
 * "Good next pick" tag beside the longest names, "need 500 more", a 7-digit Supplies total), no text under 11 px,
 * every button ≥ 44 px. Skipped (never failed) where Chromium + Playwright are not installed.
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
  pick: string;
  supplies: string;
  gearShown: boolean;
}

let pw: Pw | null = null;
try {
  pw = createRequire(__filename)("playwright") as Pw;
} catch {
  pw = null;
}

const ALL_BUT_WEAPONS = ["spike_trap", "bear_trap", "mine", "floodlight", "barricade_upgrades", "med_station", "tactical_flashlight", "body_armor_2", "molotovs", "assault_rifle", "chainsaw", "gas_torch", "flamethrower"];
const CASES = [
  { name: "new player, 340", progress: { supplies: 340, lifetimeSupplies: 340, unlocks: [] as string[] }, pick: "Spike trap" },
  { name: "worst: 0 Supplies, pick on Grenade Launcher (need 500 more)", progress: { supplies: 0, lifetimeSupplies: 9000, unlocks: ALL_BUT_WEAPONS }, pick: "Grenade Launcher" },
  { name: "worst: 7-digit total, pick on Tactical flashlight", progress: { supplies: 1_234_567, lifetimeSupplies: 1_234_567, unlocks: ["spike_trap", "bear_trap", "mine", "floodlight", "barricade_upgrades", "med_station", "molotovs"] }, pick: "Tactical flashlight" },
  // review F8: a 42-character name (longer than the column even alone, a future item) on the tagged row ends in "…" and keeps the tag in its column
  { name: "review F8: a 42-char name on the Good next pick row", progress: { supplies: 340, lifetimeSupplies: 340, unlocks: [] as string[] }, pick: "Reinforced metal barricade kit with spikes", longName: "Reinforced metal barricade kit with spikes" },
] as { name: string; progress: { supplies: number; lifetimeSupplies: number; unlocks: readonly string[] }; pick: string; longName?: string }[];

let server: { listen(): Promise<unknown>; close(): Promise<void>; resolvedUrls: { local: string[] } | null } | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

describe.skipIf(!pw)("Story 7.3 (R9): the Progress hub in a real browser", () => {
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
    await page.addStyleTag({ content: `.menu.ph{padding:8px ${INSET.right}px ${INSET.bottom}px ${INSET.left}px !important}.dev-cheats{display:none!important}` }); // the dev gear is NOT hidden here: F11 checks the hub hides it
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
          ps.progressStore.accept(k.progress); // the server's answer (no server here: the refresh failed)
          await new Promise((r) => setTimeout(r, 200));
          if (k.longName) document.querySelector(".ph-pick").closest(".ph-name").querySelector(".ph-name__text").textContent = k.longName;
          await new Promise((r) => setTimeout(r, 50));
          const gear = document.querySelector(".dev-gear");
          const gearShown = gear ? getComputedStyle(gear).display !== "none" : false;
          const frame = document.querySelector(".ph-frame").getBoundingClientRect();
          const out = [];
          for (const el of document.querySelectorAll(".ph-frame *")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < frame.left - 0.5 || r.right > frame.right + 0.5) out.push((el.className || el.tagName) + " outside the frame x");
          }
          for (const row of document.querySelectorAll(".ph-row")) {
            const col = row.children[1].getBoundingClientRect();
            const act = row.children[2].getBoundingClientRect();
            if (col.right > act.left + 0.5) out.push("text column runs into the action column: " + row.textContent);
            for (const el of row.children[1].querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (r.right > col.right + 0.5) out.push((el.className || el.tagName) + " past its column: " + row.textContent);
            }
            for (const el of row.children[2].querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (r.left < act.left - 0.5 || r.right > act.right + 0.5) out.push((el.className || el.tagName) + " past the action column");
            }
          }
          const head = document.querySelector(".ph-head").getBoundingClientRect();
          for (const el of document.querySelectorAll(".ph-head > *")) {
            const r = el.getBoundingClientRect();
            if (r.right > head.right + 0.5) out.push((el.className || el.tagName) + " past the header");
          }
          const texts = [...document.querySelectorAll(".ph *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim() !== ""));
          const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const smallButtons = [...document.querySelectorAll(".ph button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((b) => b.textContent);
          const pickRow = document.querySelector(".ph-pick")?.closest(".ph-row");
          return { out, minFont, smallButtons, frame: { x: frame.left, y: frame.top, right: frame.right, bottom: frame.bottom }, gearShown, pick: pickRow ? pickRow.querySelector(".ph-name__text").textContent : "", supplies: document.querySelector("[data-testid=hub-supplies]").textContent };
})(${JSON.stringify(c)})`, undefined)) as Measure;
        expect(m.out, m.out.join("\n")).toEqual([]);
        expect(m.minFont).toBeGreaterThanOrEqual(11);
        expect(m.smallButtons).toEqual([]);
        expect(m.frame.x).toBeGreaterThanOrEqual(INSET.left - 0.5);
        expect(m.frame.right).toBeLessThanOrEqual(w - INSET.right + 0.5);
        expect(m.frame.bottom).toBeLessThanOrEqual(h - INSET.bottom + 0.5);
        expect(m.frame.y).toBeGreaterThanOrEqual(0);
        expect(m.pick).toBe(c.pick); // liveness: the tag is really drawn on the expected row
        expect(m.gearShown).toBe(false); // review F11: no dev gear over the hub header
        expect(m.supplies).toContain(c.progress.supplies.toLocaleString("en-US"));
      }, 30_000);
    }
  }
});
