import { describe, expect, it } from "vitest";
import { pixelsPerMeter } from "./camera";

describe("pixelsPerMeter", () => {
  it("shows exactly 24 × 13.5 m on a 16:9 screen", () => {
    const ppm = pixelsPerMeter(1920, 1080);
    expect(1920 / ppm).toBeCloseTo(24, 9);
    expect(1080 / ppm).toBeCloseTo(13.5, 9);
  });

  it("never shows more than 24 m wide or 13.5 m tall", () => {
    for (const [w, h] of [[1688, 780], [1024, 768], [2400, 1080], [800, 600]] as const) {
      const ppm = pixelsPerMeter(w, h);
      expect(w / ppm).toBeLessThanOrEqual(24 + 1e-9);
      expect(h / ppm).toBeLessThanOrEqual(13.5 + 1e-9);
    }
  });
});
