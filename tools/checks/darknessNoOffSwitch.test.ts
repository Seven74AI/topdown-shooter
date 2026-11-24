import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 6.3 (F6, AC 12; brief 24): the blackout darkness can't be switched off or lightened. Its
 * code reads no quality or settings flag (only the sparkles take `?fx=low`), and no setting or URL
 * option names a way to turn the dark off.
 */
const SRC = join(__dirname, "..", "..", "apps", "client", "src");
const src = (f: string) => readFileSync(join(SRC, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the darkness has no off switch (Story 6.3 F6 / AC 12)", () => {
  it("the darkness code reads no quality or settings flag", () => {
    for (const f of ["render/darkness/DarknessView.ts", "render/darkness/darknessPlan.ts", "render/darkness/lightStamps.ts"]) {
      const code = src(f);
      expect(code.length, f).toBeGreaterThan(500); // liveness: the file was really read
      expect(code, f).not.toMatch(/lowFx|urlOptions|getSettings|settings/);
    }
  });

  it("no setting or URL option turns the dark off or lightens it", () => {
    for (const f of ["debug/urlOptions.ts", "settings/settings.ts"]) expect(src(f), f).not.toMatch(/noDark|darkOff|darkness\s*:\s*false|brightness|gamma/i);
  });
});
