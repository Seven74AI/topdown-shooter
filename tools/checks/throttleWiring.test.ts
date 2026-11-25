import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 8.8 review R3 (network pass brief 26: a wiring test per hookup): `main.ts › throttled()` must
 * pass the parsed lossy line (`lossPct`, `stallMs`) to the DevThrottle and register it for the
 * overlay; the overlay must read it. Deleting either line would silently run a clean line on
 * `?loss=1` (or drop the overlay's loss suffix) with every unit test still green.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");

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
});
