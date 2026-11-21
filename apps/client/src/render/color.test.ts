import { describe, expect, it } from "vitest";
import { mixColor } from "./color";

describe("mixColor", () => {
  it("returns the ends and mixes linearly per channel", () => {
    expect(mixColor(0xff0000, 0x00ff00, 0)).toBe(0xff0000);
    expect(mixColor(0xff0000, 0x00ff00, 1)).toBe(0x00ff00);
    expect(mixColor(0x000000, 0xfefefe, 0.5)).toBe(0x7f7f7f);
  });
});
