import { describe, expect, it } from "vitest";
import { routePointer, type ButtonRect } from "./routePointer";

const swap: ButtonRect = { id: "swap", x: 700, y: 200, w: 64, h: 64, visible: true };

describe("routePointer", () => {
  it("presses a button when the touch starts on it (no stick)", () => {
    expect(routePointer(730, 230, [swap], 800)).toEqual({ kind: "button", id: "swap" });
  });
  it("counts a few px around the button as a press", () => {
    expect(routePointer(698, 199, [swap], 800)).toEqual({ kind: "button", id: "swap" });
  });
  it("spawns the aim stick next to the button and the move stick on the left", () => {
    expect(routePointer(690, 230, [swap], 800)).toEqual({ kind: "aim" });
    expect(routePointer(100, 230, [swap], 800)).toEqual({ kind: "move" });
  });
  it("ignores hidden buttons", () => {
    expect(routePointer(730, 230, [{ ...swap, visible: false }], 800)).toEqual({ kind: "aim" });
  });
});
