import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { firstLoadPaths, loaderScript } from "../../apps/client/vite.config";
import { signalBootLoader } from "../../apps/client/src/ui/bootLoaderSignal";

/**
 * Story 10.4 (B6, AC 2): the loading screen's script (`apps/client/boot/bootLoader.js`, inlined into index.html): its
 * progress maths, the build's inline form (≤ 2 KB, ES5), the first-load file list, and main.ts's signals.
 */
const SRC = readFileSync(join(process.cwd(), "apps/client/boot/bootLoader.js"), "utf8");

interface Api {
  estimate(prev: number, done: number, total: number, t: number, tDone: number): number;
  text(shown: number, total: number): string;
  phase?: (name?: string) => void;
  hide?: () => void;
}

/** Runs the script in a sandbox; `root` null = a page without the loading screen (the maths only). */
function boot(opts: { root?: FakeEl | null; files?: [string, number][]; now?: () => number } = {}) {
  const intervals: (() => void)[] = [];
  let observer: ((list: { getEntries(): unknown[] }) => void) | null = null;
  const w: Record<string, unknown> = {
    __BL_FILES: opts.files,
    performance: { now: opts.now ?? (() => 0) },
    setInterval: (fn: () => void) => intervals.push(fn),
    clearInterval: () => intervals.splice(0),
    PerformanceObserver: class {
      constructor(cb: typeof observer) {
        observer = cb;
      }
      observe() {}
    },
  };
  const d = { getElementById: () => opts.root ?? null };
  runInNewContext(SRC, { window: w, document: d, Math, URL });
  return {
    api: w.__bootLoader as Api,
    tick: () => intervals.forEach((f) => f()),
    land: (name: string, encodedBodySize: number, responseEnd: number) => observer?.({ getEntries: () => [{ name, encodedBodySize, responseEnd }] }),
  };
}

class FakeEl {
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  textContent = "";
  parentNode: { removeChild(c: FakeEl): void } | null = { removeChild: () => (this.parentNode = null) };
  readonly fill = { style: {} as Record<string, string> };
  readonly line = { textContent: "" };
  querySelector(sel: string) {
    return sel === ".bl__fill" ? this.fill : this.line;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
}

describe("Story 10.4: loading screen progress maths", () => {
  const { api } = boot();

  it("guesses from 180 KB/s before 10 % has landed, capped at 98 % until the files finish", () => {
    expect(api.estimate(0, 0, 1_000_000, 1000, 0)).toBe(180_000);
    expect(api.estimate(0, 0, 1_000_000, 60_000, 0)).toBe(980_000);
    expect(api.estimate(0, 1_000_000, 1_000_000, 60_000, 5000)).toBe(1_000_000);
  });

  it("uses the measured rate once 10 % has landed", () => {
    // 200 KB landed by 4 s = 50 KB/s → at 6 s, 300 KB.
    expect(api.estimate(0, 200_000, 1_000_000, 6000, 4000)).toBeCloseTo(300_000);
  });

  it("never goes backwards and never passes the total", () => {
    let shown = 0;
    let prev = 0;
    // A fast default guess, then a slow measured rate: the bar holds instead of shrinking.
    const steps: [number, number, number][] = [
      [0, 0, 0],
      [0, 0, 2000],
      [150_000, 1900, 2100],
      [150_000, 1900, 3000],
      [600_000, 5000, 5100],
      [1_000_000, 7000, 7100],
      [1_000_000, 7000, 9000],
    ];
    for (const [done, tDone, t] of steps) {
      shown = api.estimate(shown, done, 1_000_000, t, tDone);
      expect(shown).toBeGreaterThanOrEqual(prev);
      expect(shown).toBeLessThanOrEqual(1_000_000);
      prev = shown;
    }
    expect(shown).toBe(1_000_000);
    expect(api.estimate(5, 0, 0, 1000, 0)).toBe(5); // no manifest (dev): no movement
  });

  it("reads in MB with one decimal", () => {
    expect(api.text(1_234_567, 2_000_000)).toBe("Downloading… 1.2 / 2.0 MB");
    expect(api.text(0, 870_000)).toBe("Downloading… 0.0 / 0.9 MB");
  });
});

describe("Story 10.4: loading screen on a page", () => {
  it("fills as the listed files land, counts each once, then Drawing the city…, then gone", () => {
    const root = new FakeEl();
    let now = 0;
    const b = boot({ root, files: [["/assets/main-a.js", 300_000], ["/assets/vendor-phaser-b.js", 700_000]], now: () => now });
    b.tick();
    expect(Number(root.attrs["data-progress"])).toBe(0);
    now = 1000;
    b.tick();
    expect(Number(root.attrs["data-progress"])).toBeCloseTo(0.18, 2); // the bar follows the guess…
    expect(root.line.textContent).toBe("Downloading\u2026 0.0 / 1.0 MB"); // …the text doesn't (review L1)
    b.land("http://x.test/assets/other.js", 999_999, 900); // not a first-load file: ignored
    b.land("http://x.test/assets/main-a.js", 310_000, 1500);
    b.land("http://x.test/assets/main-a.js", 310_000, 1500); // twice: counted once
    now = 1600;
    b.tick();
    const mid = Number(root.attrs["data-progress"]);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(1);
    expect(root.line.textContent).toBe("Downloading\u2026 0.3 / 1.0 MB"); // review L1: only the bytes that landed, not the guess
    b.land("http://x.test/assets/vendor-phaser-b.js", 0, 4000); // cached (no body size): its listed size
    now = 4100;
    b.tick();
    expect(root.attrs["data-progress"]).toBe("1.000");
    b.api.phase?.("draw");
    expect(root.line.textContent).toBe("Drawing the city…");
    b.api.hide?.();
    expect(root.parentNode).toBeNull();
    b.tick(); // after hide: nothing runs
  });
});

describe("Story 10.4: the inline build form", () => {
  const inline = loaderScript(SRC);

  it("is ≤ 2 KB and plain ES5 (no arrow, let/const, template, class, spread, bare catch)", () => {
    expect(new TextEncoder().encode(inline).length).toBeLessThanOrEqual(2048);
    expect(inline).not.toMatch(/=>|\blet\b|\bconst\b|`|\bclass\b|\.\.\.|catch\s*\{|\beval\b|new Function/);
    expect(() => new Function(inline)).not.toThrow(); // valid script (parsed only, never run here)
    expect(inline).not.toContain("Story 10.4"); // comments stripped
  });

  it("lists the built page's first-load files in order, once each", () => {
    const html = `<script type="module" crossorigin src="/assets/main-1.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-phaser-2.js">
    <link rel="modulepreload" crossorigin href="/assets/main-1.js">
    <link rel="stylesheet" crossorigin href="/assets/main-3.css">
    <link rel="icon" href="/favicon.png">`;
    expect(firstLoadPaths(html)).toEqual(["/assets/main-1.js", "/assets/vendor-phaser-2.js", "/assets/main-3.css"]);
  });
});

describe("Story 10.4: main.ts's signals", () => {
  it("Drawing the city… at once, gone two frames after the first screen change, once", () => {
    const calls: string[] = [];
    const frames: (() => void)[] = [];
    const listeners = new Set<() => void>();
    const screens = { subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)) };
    signalBootLoader(screens, { __bootLoader: { phase: (n) => calls.push(n), hide: () => calls.push("hide") }, requestAnimationFrame: (cb) => frames.push(cb) });
    expect(calls).toEqual(["draw"]);
    for (const l of [...listeners]) l();
    expect(listeners.size).toBe(0);
    frames.shift()?.();
    expect(calls).toEqual(["draw"]);
    frames.shift()?.();
    expect(calls).toEqual(["draw", "hide"]);
  });

  it("does nothing without a loading screen (dev tools pages, tests)", () => {
    const listeners: (() => void)[] = [];
    const screens = { subscribe: (l: () => void) => (listeners.push(l), () => {}) };
    expect(() => signalBootLoader(screens, { requestAnimationFrame: (cb) => cb() })).not.toThrow();
    expect(() => listeners.forEach((l) => l())).not.toThrow();
  });

  it("review M1: the inline script never ran (a CSP): the overlay is still removed at the first screen", () => {
    let removed = 0;
    const listeners: (() => void)[] = [];
    const frames: (() => void)[] = [];
    const screens = { subscribe: (l: () => void) => (listeners.push(l), () => {}) };
    const document = { getElementById: (id: string) => (id === "boot-loader" ? { remove: () => void removed++ } : null) };
    signalBootLoader(screens, { document, requestAnimationFrame: (cb) => frames.push(cb) });
    expect(removed).toBe(0);
    listeners.forEach((l) => l());
    frames.shift()?.();
    frames.shift()?.();
    expect(removed).toBe(1);
  });
});
