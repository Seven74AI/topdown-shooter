import { describe, expect, it } from "vitest";
import { ChipText, chipLeft } from "./chipText";

describe("Story 5.19: the item chip's text (AC 7, D8)", () => {
  it("carrying: name · price · how many left; pinned: ↩ carry · name", () => {
    const c = new ChipText();
    expect(c.get("Wood barricade", 40, 6, false)).toBe("Wood barricade · $40 · ×6 left");
    expect(c.get("Wood barricade", 40, 6, true)).toBe("↩ carry · Wood barricade");
    expect(c.get("Auto-turret", 250, 1, false)).toBe("Auto-turret · $250 · ×1 left");
  });

  it("is rebuilt only when a part changes", () => {
    const c = new ChipText();
    const a = c.get("Mine", 60, 3, false);
    expect(c.get("Mine", 60, 3, false)).toBe(a);
    expect(c.get("Mine", 60, 2, false)).toBe("Mine · $60 · ×2 left");
    expect(c.get("Mine", 70, 2, false)).toBe("Mine · $70 · ×2 left");
    expect(c.get("Spike trap", 70, 2, false)).toBe("Spike trap · $70 · ×2 left");
  });

  it("left = min(cap − owned − pending, ⌊shown wallet / price⌋), never below 0", () => {
    expect(chipLeft(6, 0, 0, 5000, 40)).toBe(6); // the cap
    expect(chipLeft(6, 2, 1, 5000, 40)).toBe(3); // owned and pending count
    expect(chipLeft(6, 0, 0, 100, 40)).toBe(2); // the money
    expect(chipLeft(6, 0, 0, 39, 40)).toBe(0);
    expect(chipLeft(6, 6, 1, 5000, 40)).toBe(0);
    expect(chipLeft(6, 1, 0, 0, 0)).toBe(5); // a free type: only the cap
  });
});
