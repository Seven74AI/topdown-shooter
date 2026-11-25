import { describe, expect, it } from "vitest";
import { SILHOUETTE_ZOMBIE, behindAnyWall, coveringWall, silhouetteAlpha, silhouetteCrop, type SilCrop, type SpriteGeom, type WallPic } from "./wallSilhouette";

/** A front wall standing on y = 5 (footprint 2 × 0.5 m at x 1..3): its 2 × 1 m picture rises from y 5.26 to 4.26. */
const wall: WallPic = { x0: 1, y0: 4.26, x1: 3, y1: 5.26, baseY: 5 };

describe("bodies behind standing walls: the silhouette (designer pick C)", () => {
  it("a body just north of the wall, under its picture, is behind it", () => {
    expect(behindAnyWall(2, 4.6, 0.35, [wall])).toBe(true);
    expect(behindAnyWall(1.1, 4.4, 0.35, [wall])).toBe(true); // at the end, partly covered
  });

  it("a body on or in front of the wall's line, or clear of its picture, is not", () => {
    expect(behindAnyWall(2, 5.3, 0.35, [wall])).toBe(false);
    expect(behindAnyWall(2, 5, 0.35, [wall])).toBe(false);
    expect(behindAnyWall(2, 3.8, 0.35, [wall])).toBe(false);
    expect(behindAnyWall(0.5, 4.6, 0.35, [wall])).toBe(false);
    expect(behindAnyWall(2, 4.6, 0.35, [])).toBe(false);
    expect(behindAnyWall(2, 4.6, 0.35, [wall], 0)).toBe(false);
  });

  it("the covering wall is the one it overlaps most", () => {
    const corner: WallPic = { x0: 0.3, y0: 3.9, x1: 1.0, y1: 5.3, baseY: 5 };
    expect(coveringWall(2, 4.6, 0.35, [corner, wall])).toBe(1);
    expect(coveringWall(0.8, 4.6, 0.35, [corner, wall])).toBe(0);
  });

  it("colour and pulse as approved: red zombies, alpha 0.5 ± 0.08", () => {
    expect(SILHOUETTE_ZOMBIE).toBe(0xff5c48);
    for (let t = 0; t < 3; t += 0.05) {
      expect(silhouetteAlpha(t)).toBeGreaterThanOrEqual(0.42 - 1e-9);
      expect(silhouetteAlpha(t)).toBeLessThanOrEqual(0.58 + 1e-9);
    }
  });
});

describe("review M1 / L3: the silhouette is cropped to its wall, never over open street", () => {
  /** A body sprite: 0.7 m square, 68 px frame, origin centred. */
  const body = (x: number, y: number, rotation: number): SpriteGeom => ({ x, y, rotation, displayW: 0.7, displayH: 0.7, originX: 0.5, originY: 0.5, frameW: 68, frameH: 68 });
  /** The crop's corners back in world metres (the inverse of the crop maths, with the quarter-turn heading). */
  const cropWorld = (s: SpriteGeom, c: SilCrop): [number, number][] => {
    const pts: [number, number][] = [];
    for (const [fx, fy] of [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]] as const) {
      const lx = (fx - s.originX * s.frameW) * (s.displayW / s.frameW);
      const ly = (fy - s.originY * s.frameH) * (s.displayH / s.frameH);
      const cs = Math.cos(c.rotation);
      const sn = Math.sin(c.rotation);
      pts.push([s.x + lx * cs - ly * sn, s.y + lx * sn + ly * cs]);
    }
    return pts;
  };

  it("at every heading the cropped silhouette lies inside the wall's picture", () => {
    const out: SilCrop = { rotation: 0, x: 0, y: 0, w: 0, h: 0 };
    let cropped = 0;
    for (let a = -Math.PI; a <= Math.PI; a += 0.13) {
      for (const [x, y] of [[2, 4.3], [1.05, 4.5], [2.9, 4.2], [2, 4.05]] as const) {
        const s = body(x, y, a);
        const c = silhouetteCrop(s, wall, out);
        if (!c) continue;
        cropped++;
        expect(Math.abs(c.rotation / (Math.PI / 2) - Math.round(c.rotation / (Math.PI / 2)))).toBeLessThan(1e-9); // a quarter turn
        expect(Math.abs(Math.atan2(Math.sin(c.rotation - a), Math.cos(c.rotation - a)))).toBeLessThanOrEqual(Math.PI / 4 + 1e-9); // within 45° of the body
        for (const [wx, wy] of cropWorld(s, c)) {
          expect(wx).toBeGreaterThanOrEqual(wall.x0 - 1e-6);
          expect(wx).toBeLessThanOrEqual(wall.x1 + 1e-6);
          expect(wy).toBeGreaterThanOrEqual(wall.y0 - 1e-6);
          expect(wy).toBeLessThanOrEqual(wall.y1 + 1e-6);
        }
      }
    }
    expect(cropped).toBeGreaterThan(100);
  });

  it("a body wholly inside the picture keeps its whole shape; one clear of it gets no silhouette", () => {
    const out: SilCrop = { rotation: 0, x: 0, y: 0, w: 0, h: 0 };
    expect(silhouetteCrop(body(2, 4.76, 0), wall, out)).toEqual({ rotation: 0, x: 0, y: 0, w: 68, h: 68 });
    expect(silhouetteCrop(body(2, 3.5, 0), wall, out)).toBeNull();
  });
});
