import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 8.10 re-review RR1 (decision B7): the game's room builds its encoder with no far-rule radius (every zombie at 20 Hz). */
describe("RunRoom builds the horde encoder with the game default (B7)", () => {
  it("`new HordeEncoder()` with no arguments, and no other construction", () => {
    const src = readFileSync(join(__dirname, "..", "..", "apps", "server", "src", "rooms", "RunRoom.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const all = src.match(/new HordeEncoder\([^)]*\)/g) ?? [];
    expect(all).toEqual(["new HordeEncoder()"]);
  });
});
