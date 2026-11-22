import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { createSpatialGrid, queryRadius, queryRect, rebuildGrid } from "./spatialGrid";

const MAP = { widthM: 48, heightM: 32 };
const N = 200;

function scatter(seed: number) {
  const rng = createRng(seed);
  const xs = new Float32Array(N);
  const ys = new Float32Array(N);
  const ids = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    xs[i] = rng.range(0, MAP.widthM);
    ys[i] = rng.range(0, MAP.heightM);
    ids[i] = i;
  }
  return { xs, ys, ids };
}

describe("spatial grid", () => {
  it("finds exactly the ids within r (matches brute force)", () => {
    const { xs, ys, ids } = scatter(11);
    const grid = createSpatialGrid(MAP, 2, N);
    rebuildGrid(grid, ids, N, xs, ys);
    const out = new Int32Array(N);
    const rng = createRng(12);
    for (let q = 0; q < 100; q++) {
      const x = rng.range(-1, MAP.widthM + 1);
      const y = rng.range(-1, MAP.heightM + 1);
      const r = rng.range(0.5, 6);
      const n = queryRadius(grid, xs, ys, x, y, r, out);
      const got = Array.from(out.subarray(0, n)).sort((a, b) => a - b);
      const want: number[] = [];
      for (let i = 0; i < N; i++) {
        if (((xs[i] as number) - x) ** 2 + ((ys[i] as number) - y) ** 2 <= r * r) want.push(i);
      }
      expect(got).toEqual(want);
    }
  });

  it("handles items at the map edges and corners", () => {
    const xs = new Float32Array([0, 48, 0, 48, 24]);
    const ys = new Float32Array([0, 0, 32, 32, 16]);
    const ids = new Int32Array([0, 1, 2, 3, 4]);
    const grid = createSpatialGrid(MAP, 2, 5);
    rebuildGrid(grid, ids, 5, xs, ys);
    const out = new Int32Array(5);
    expect(queryRadius(grid, xs, ys, 48, 32, 0.5, out)).toBe(1);
    expect(out[0]).toBe(3);
    expect(queryRadius(grid, xs, ys, 0, 0, 0.5, out)).toBe(1);
    expect(out[0]).toBe(0);
  });

  it("queryRect finds exactly the ids inside the rectangle (matches brute force)", () => {
    const { xs, ys, ids } = scatter(21);
    const grid = createSpatialGrid(MAP, 2, N);
    rebuildGrid(grid, ids, N, xs, ys);
    const out = new Int32Array(N);
    const rng = createRng(22);
    for (let q = 0; q < 100; q++) {
      // Some rectangles stick out of the map on any side.
      const minX = rng.range(-10, MAP.widthM);
      const minY = rng.range(-10, MAP.heightM);
      const maxX = minX + rng.range(0, 30);
      const maxY = minY + rng.range(0, 20);
      const n = queryRect(grid, xs, ys, minX, minY, maxX, maxY, out);
      const got = Array.from(out.subarray(0, n)).sort((a, b) => a - b);
      const want: number[] = [];
      for (let i = 0; i < N; i++) {
        const x = xs[i] as number;
        const y = ys[i] as number;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) want.push(i);
      }
      expect(got).toEqual(want);
    }
  });

  it("queryRect: inside, outside, on the edge, partly off the map, out full", () => {
    const xs = new Float32Array([10, 20, 14, 0.5, 30]);
    const ys = new Float32Array([10, 20, 12, 0.5, 30]);
    const ids = new Int32Array([0, 1, 2, 3, 4]);
    const grid = createSpatialGrid(MAP, 2, 5);
    rebuildGrid(grid, ids, 5, xs, ys);
    const out = new Int32Array(5);
    const sorted = (n: number) => Array.from(out.subarray(0, n)).sort((a, b) => a - b);
    expect(sorted(queryRect(grid, xs, ys, 8, 8, 14, 12, out))).toEqual([0, 2]); // 2 sits on the corner
    expect(queryRect(grid, xs, ys, 40, 1, 47, 5, out)).toBe(0); // nothing there
    expect(sorted(queryRect(grid, xs, ys, -5, -5, 11, 11, out))).toEqual([0, 3]); // off the top-left
    expect(queryRect(grid, xs, ys, 14.001, 0, 20, 19.99, out)).toBe(0); // just past the edges
    const small = new Int32Array(2);
    expect(queryRect(grid, xs, ys, -10, -10, 60, 40, small)).toBe(2); // out full
    expect(queryRect(grid, xs, ys, 5, 5, 4, 4, out)).toBe(0); // empty rectangle
  });

  it("stops at the output buffer size", () => {
    const { xs, ys, ids } = scatter(3);
    const grid = createSpatialGrid(MAP, 2, N);
    rebuildGrid(grid, ids, N, xs, ys);
    const out = new Int32Array(4);
    expect(queryRadius(grid, xs, ys, 24, 16, 100, out)).toBe(4);
  });
});
