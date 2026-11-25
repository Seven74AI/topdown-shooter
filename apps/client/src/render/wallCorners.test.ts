import { describe, expect, it } from "vitest";
import { findCorners, type Corner, type WallLike } from "./wallCorners";

const standing = (t: string): boolean => t.endsWith("_barricade");
/** A barricade (2 × 0.5 m) with its min corner at (x, y), at `rot`. */
const wall = (x: number, y: number, rot: number, type = "wood_barricade"): WallLike => ((rot & 1) === 1 ? { type, rot, minX: x, minY: y, maxX: x + 0.5, maxY: y + 2 } : { type, rot, minX: x, minY: y, maxX: x + 2, maxY: y + 0.5 });

/** The test fort: north and south walls of two pieces, west and east walls of two, the four corner squares empty. */
function fort(): WallLike[] {
  return [
    wall(0.5, 0, 2), wall(2.5, 0, 2), // north (x 0.5..4.5, y 0..0.5)
    wall(0, 0.5, 1), wall(0, 2.5, 1), // west (x 0..0.5, y 0.5..4.5)
    wall(4.5, 0.5, 3), wall(4.5, 2.5, 3), // east (x 4.5..5, y 0.5..4.5)
    wall(0.5, 4.5, 0, "metal_barricade"), wall(2.5, 4.5, 0, "metal_barricade"), // south (y 4.5..5)
  ];
}

describe("photoreal group 3 step 3: automatic corner pieces (findCorners)", () => {
  it("a closed fort gets its four corners, each in its empty square with the right kind and the front line's look", () => {
    const out = findCorners(fort(), standing, []);
    const byKind = Object.fromEntries(out.map((c) => [c.kind, c])) as Record<string, Corner>;
    expect(out).toHaveLength(4);
    expect(byKind.nw).toEqual({ x: 0.25, y: 0.25, kind: "nw", type: "wood_barricade" });
    expect(byKind.ne).toEqual({ x: 4.75, y: 0.25, kind: "ne", type: "wood_barricade" });
    expect(byKind.sw).toEqual({ x: 0.25, y: 4.75, kind: "sw", type: "metal_barricade" });
    expect(byKind.se).toEqual({ x: 4.75, y: 4.75, kind: "se", type: "metal_barricade" });
  });

  it("no corner without both lines, for lines that don't meet, for an occupied square, or for non-standing types", () => {
    const f = fort();
    expect(findCorners([f[0]!], standing, [])).toHaveLength(0);
    expect(findCorners([f[0]!, wall(0, 1, 1)], standing, [])).toHaveLength(0); // the side line starts 0.5 m too far south
    const blocked = [...f, { type: "spike_trap", rot: 0, minX: 0, minY: 0, maxX: 0.5, maxY: 0.5 }];
    expect(findCorners(blocked, standing, []).some((c) => c.kind === "nw")).toBe(false);
    expect(findCorners(f.map((w) => ({ ...w, type: "floodlight" })), standing, [])).toHaveLength(0);
  });

  it("two front lines or two side lines never make a corner; a T (a side line under a front line's middle) doesn't either", () => {
    expect(findCorners([wall(0, 0, 0), wall(2, 0.5, 2)], standing, [])).toHaveLength(0);
    expect(findCorners([wall(0, 0, 1), wall(0.5, 2, 3)], standing, [])).toHaveLength(0);
    expect(findCorners([wall(0, 0, 2), wall(0.75, 0.5, 1)], standing, [])).toHaveLength(0);
  });

  it("reuses its output array and never lists a square twice", () => {
    const out: Corner[] = [{ x: 9, y: 9, kind: "nw", type: "x" }];
    // two front pieces share the square's row from both sides: still one corner per square
    const list = [wall(0.5, 0, 2), wall(0, 0.5, 1), wall(-2, 0.5, 3)];
    findCorners(list, standing, out);
    expect(out.filter((c) => c.x === 0.25 && c.y === 0.25)).toHaveLength(1);
    expect(out.some((c) => c.x === 9)).toBe(false);
  });
});
