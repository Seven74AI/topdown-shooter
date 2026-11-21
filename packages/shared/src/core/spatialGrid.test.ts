import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { createSpatialGrid, queryRadius, rebuildGrid } from "./spatialGrid";

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

  it("stops at the output buffer size", () => {
    const { xs, ys, ids } = scatter(3);
    const grid = createSpatialGrid(MAP, 2, N);
    rebuildGrid(grid, ids, N, xs, ys);
    const out = new Int32Array(4);
    expect(queryRadius(grid, xs, ys, 24, 16, 100, out)).toBe(4);
  });
});
