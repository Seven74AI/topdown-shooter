import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, shopfrontsOf } from "@topdown/shared";
import { DOWNTOWN_DRESSING, MAP_PX_PER_M } from "./dressing";
import { windowSpill } from "./drawCity";

/** Story 4.6 × 4.9: the warm shop-window glow comes from the map's lit shop fronts (box + face). */
describe("window spill from the shop fronts", () => {
  it("one facade segment per shop front, on the face touching its shop, shining across the strip; then the side facades", () => {
    const fronts = shopfrontsOf(DOWNTOWN_MAP);
    const spill = windowSpill(DOWNTOWN_MAP, DOWNTOWN_DRESSING);
    expect(fronts).toHaveLength(5);
    expect(spill).toHaveLength(fronts.length + DOWNTOWN_DRESSING.spill.length);
    const P = MAP_PX_PER_M;
    fronts.forEach((f, i) => {
      const [x1, y1, x2, y2, nx, ny, col, a] = spill[i] as (typeof spill)[number];
      const shop = DOWNTOWN_MAP.solids.find((s) => s.name === f.shop);
      if (!shop) throw new Error(f.shop);
      // The segment lies on the shop's face and spans the strip; the normal points away from the shop, into the strip.
      if (f.face === "n" || f.face === "s") {
        expect([x1, x2]).toEqual([f.minX * P, f.maxX * P]);
        expect(y1).toBe(y2);
        expect(y1).toBe((f.face === "n" ? shop.maxY : shop.minY) * P);
        expect([nx, ny]).toEqual([0, f.face === "n" ? 1 : -1]);
      } else {
        expect(x1).toBe(x2);
        expect(nx).toBe(f.face === "w" ? 1 : -1);
      }
      const mx = (x1 + x2) / 2 / P + nx * 0.5;
      const my = (y1 + y2) / 2 / P + ny * 0.5;
      expect(mx > f.minX && mx < f.maxX && my > f.minY && my < f.maxY, `${f.name}: glow falls on its strip`).toBe(true);
      expect([col, a]).toEqual(DOWNTOWN_DRESSING.shopLight[f.name]);
    });
    expect(windowSpill(DOWNTOWN_MAP, DOWNTOWN_DRESSING)).toBe(spill); // cached
  });
});
