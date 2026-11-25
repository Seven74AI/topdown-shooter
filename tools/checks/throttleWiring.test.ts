import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 8.8 review R3 (network pass brief 26: a wiring test per hookup): `main.ts › throttled()` must
 * pass the parsed lossy line (`lossPct`, `stallMs`) to the DevThrottle and register it for the
 * overlay; the overlay must read it. Deleting either line would silently run a clean line on
 * `?loss=1` (or drop the overlay's loss suffix) with every unit test still green.
 */
/**
 * The source with comments removed (re-review 1: commented-out wiring must fail): block comments,
 * then line comments not inside a string or template (a `//` after `:` — a URL — is kept).
 */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const read = (...p: string[]) => stripComments(readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8"));

describe("the dev throttle's lossy line is wired (Story 8.8)", () => {
  it("main.ts › throttled() passes lossPct and stallMs from urlOptions().throttle and sets activeThrottle", () => {
    const src = read("main.ts");
    const at = src.indexOf("function throttled(");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n}\n", at));
    expect(body).toContain("const o = urlOptions().throttle;");
    expect(body).toMatch(/new DevThrottle\(room, \{[^}]*lossPct: o\.lossPct[^}]*\}\)/);
    expect(body).toMatch(/new DevThrottle\(room, \{[^}]*stallMs: o\.stallMs[^}]*\}\)/);
    expect(body).toContain("activeThrottle.current = throttle;");
    expect(body).toContain("if (activeThrottle.current === throttle) activeThrottle.current = null;");
  });

  it("the ?debug=1 overlay's ping line appends throttleLossText(activeThrottle.current)", () => {
    const src = read("debug", "PerfOverlay.ts");
    const ping = src.split("\n").find((l) => l.includes("lines.push(`ping "));
    expect(ping).toBeDefined();
    expect(ping).toContain("${throttleLossText(activeThrottle.current)}");
  });

  it("re-review 1 (R5 wiring): the net summary reports urlOptions().throttle, never the raw query", () => {
    const src = read("debug", "netSummary.ts");
    const at = src.indexOf("function browserEnv(");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n}\n", at));
    expect(body).toContain("throttle: throttleLabel(urlOptions().throttle)");
    expect(body).not.toMatch(/location\.search|URLSearchParams/);
  });

  it("the comment stripper removes commented-out wiring (self-check)", () => {
    expect(stripComments("a; // activeThrottle.current = throttle;\nb;")).not.toContain("activeThrottle");
    expect(stripComments("x({ lossPct: 0 /* was lossPct: o.lossPct */ })")).not.toContain("o.lossPct");
    expect(stripComments("const u = `http://x`;")).toContain("http://x");
  });
});
