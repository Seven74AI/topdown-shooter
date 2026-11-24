import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 5.23 (review M3): every haptic goes through `audio/haptics.ts › vibrate`, so the player's
 * `haptics` setting covers all of them (5.20's sell / undo buzz included). This scan fails when
 * client code calls the vibration API any other way.
 */
const SRC = join(__dirname, "..", "..", "apps", "client", "src");
const ALLOWED = new Set(["audio/haptics.ts"]);
/**
 * A call (`.vibrate(`, `?.(`, `.call/.apply/.bind(`), bracket access (`["vibrate"]`, `?.['vibrate']`)
 * or destructuring (`{ vibrate } = navigator`, `{ vibrate: v } = nav`).
 */
const VIBRATE = /\.vibrate\s*(?:\?\.\s*)?(?:\(|\.\s*(?:call|apply|bind)\s*\()|\[\s*["'`]vibrate["'`]\s*\]|\{[^}]*\bvibrate\b[^}]*\}\s*=/;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("one door to the vibration API (Story 5.23 review M3)", () => {
  it("no client file but audio/haptics.ts calls navigator.vibrate", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50); // liveness: the scan saw the client sources
    const offenders = files.map((f) => relative(SRC, f).split("\\").join("/")).filter((rel) => !ALLOWED.has(rel) && VIBRATE.test(stripComments(readFileSync(join(SRC, rel), "utf8"))));
    expect(offenders, "use vibrate() from audio/haptics.ts (it follows the haptics setting)").toEqual([]);
  });

  it("the scan catches a direct call (self-check)", () => {
    expect(VIBRATE.test("navigator.vibrate?.(12)")).toBe(true);
    expect(VIBRATE.test("nav.vibrate(12)")).toBe(true);
    expect(VIBRATE.test(stripComments("// navigator.vibrate(12)"))).toBe(false);
    expect(VIBRATE.test("navigator.vibrate.call(navigator, 12)")).toBe(true);
    expect(VIBRATE.test("navigator.vibrate.apply(navigator, [12])")).toBe(true);
    expect(VIBRATE.test("const v = navigator.vibrate.bind(navigator)")).toBe(true);
    expect(VIBRATE.test('navigator["vibrate"](12)')).toBe(true);
    expect(VIBRATE.test("navigator?.['vibrate']?.(12)")).toBe(true);
    expect(VIBRATE.test("const { vibrate } = navigator;")).toBe(true);
    expect(VIBRATE.test("const { vibrate: buzz } = nav;")).toBe(true);
    expect(VIBRATE.test("vibrate(SOLD_HAPTIC_MS)")).toBe(false);
    expect(VIBRATE.test('import { vibrate } from "../audio/haptics";')).toBe(false);
  });
});
