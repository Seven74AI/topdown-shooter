import { describe, expect, it } from "vitest";
import { SILHOUETTE_SURVIVOR, SILHOUETTE_ZOMBIE, behindAnyWall, silhouetteAlpha, type WallPic } from "./wallSilhouette";

/** A front wall standing on y = 5 (footprint 2 × 0.5 m at x 1..3): its 2 × 1 m picture rises from y 5.26 to 4.26. */
const wall: WallPic = { x0: 1, y0: 4.26, x1: 3, y1: 5.26, baseY: 5 };

describe("bodies behind standing walls: the silhouette (designer pick C)", () => {
  it("a body just north of the wall, under its picture, is behind it", () => {
    expect(behindAnyWall(2, 4.6, 0.35, [wall])).toBe(true);
    expect(behindAnyWall(1.1, 4.4, 0.35, [wall])).toBe(true); // at the end, partly covered
  });

  it("a body on or in front of the wall's line, or clear of its picture, is not", () => {
    expect(behindAnyWall(2, 5.3, 0.35, [wall])).toBe(false); // in front (south): drawn over the wall anyway
    expect(behindAnyWall(2, 5, 0.35, [wall])).toBe(false); // on the line
    expect(behindAnyWall(2, 3.8, 0.35, [wall])).toBe(false); // far north, above the picture
    expect(behindAnyWall(0.5, 4.6, 0.35, [wall])).toBe(false); // beside it
    expect(behindAnyWall(2, 4.6, 0.35, [])).toBe(false);
  });

  it("only the first n walls are read (the view reuses its array)", () => {
    expect(behindAnyWall(2, 4.6, 0.35, [wall], 0)).toBe(false);
  });

  it("colours and pulse as approved: red zombies, blue survivors, alpha 0.5 ± 0.08", () => {
    expect(SILHOUETTE_ZOMBIE).toBe(0xff5c48);
    expect(SILHOUETTE_SURVIVOR).toBe(0x60b0ff);
    for (let t = 0; t < 3; t += 0.05) {
      expect(silhouetteAlpha(t)).toBeGreaterThanOrEqual(0.42 - 1e-9);
      expect(silhouetteAlpha(t)).toBeLessThanOrEqual(0.58 + 1e-9);
    }
  });
});
