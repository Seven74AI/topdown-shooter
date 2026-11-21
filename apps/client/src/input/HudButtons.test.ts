import { describe, expect, it } from "vitest";
import { HudButtons } from "./HudButtons";

describe("HudButtons", () => {
  it("presses once on pointer-down and holds the pointer until it lifts", () => {
    const b = new HudButtons();
    let presses = 0;
    b.set({ id: "swap", x: 0, y: 0, w: 50, h: 50, visible: true }, () => presses++);
    expect(b.pointerDown(1, 10, 10, 800)).toEqual({ kind: "button", id: "swap" });
    expect(presses).toBe(1);
    expect(b.owns(1)).toBe(true);
    b.pointerUp(1);
    expect(b.owns(1)).toBe(false);
  });
  it("lets other touches through to the sticks", () => {
    const b = new HudButtons();
    b.set({ id: "swap", x: 0, y: 0, w: 50, h: 50, visible: false }, () => {});
    expect(b.pointerDown(2, 10, 10, 800)).toEqual({ kind: "move" });
    expect(b.owns(2)).toBe(false);
  });
});
