import { describe, expect, it } from "vitest";
import { keyVector } from "./keyVector";
import { KEY_MAP, keyAction } from "./keyMap";
import { KeyboardMouse } from "./KeyboardMouse";

const v = () => ({ x: 0, y: 0 });

describe("keyVector", () => {
  it("maps single keys to unit axes (+y down)", () => {
    expect(keyVector(true, false, false, false, v())).toEqual({ x: 0, y: -1 });
    expect(keyVector(false, true, false, false, v())).toEqual({ x: 0, y: 1 });
    expect(keyVector(false, false, true, false, v())).toEqual({ x: -1, y: 0 });
    expect(keyVector(false, false, false, true, v())).toEqual({ x: 1, y: 0 });
  });

  it("normalizes diagonals: W+D = (0.707, -0.707)", () => {
    const out = keyVector(true, false, false, true, v());
    expect(out.x).toBeCloseTo(0.70711, 5);
    expect(out.y).toBeCloseTo(-0.70711, 5);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 12);
  });

  it("cancels opposite keys", () => {
    expect(keyVector(true, true, false, false, v())).toEqual({ x: 0, y: 0 });
    expect(keyVector(false, false, true, true, v())).toEqual({ x: 0, y: 0 });
    const out = keyVector(true, true, false, true, v()); // W+S+D: just right, full speed
    expect(out).toEqual({ x: 1, y: 0 });
  });

  it("writes into the given object", () => {
    const out = v();
    expect(keyVector(false, false, false, true, out)).toBe(out);
  });
});

describe("key map", () => {
  it("binds WASD by physical code, arrows as aliases, Q to swap", () => {
    expect(keyAction("KeyW")).toBe("up");
    expect(keyAction("ArrowLeft")).toBe("left");
    expect(keyAction("KeyQ")).toBe("swap");
    expect(keyAction("KeyZ")).toBeUndefined();
    expect(keyAction("toString")).toBeUndefined(); // no prototype leaks
    expect(Object.isFrozen(KEY_MAP)).toBe(true);
  });
});

describe("KeyboardMouse", () => {
  it("builds the move vector from held keys; W and ArrowUp share one action", () => {
    const k = new KeyboardMouse();
    k.keyDown("KeyW");
    k.keyDown("ArrowUp");
    k.keyDown("KeyD");
    const m = k.moveVector();
    expect(m.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(m.y).toBeCloseTo(-Math.SQRT1_2, 9);
    k.keyUp("KeyW"); // ArrowUp still held
    expect(k.moveVector().y).toBeLessThan(0);
    k.keyUp("ArrowUp");
    k.keyUp("KeyD");
    expect(k.moveVector()).toEqual({ x: 0, y: 0 });
  });

  it("Q gives one swap edge per press; auto-repeat adds none", () => {
    const k = new KeyboardMouse();
    k.keyDown("KeyQ");
    k.keyDown("KeyQ", true);
    expect(k.takeSwap()).toBe(true);
    expect(k.takeSwap()).toBe(false);
    k.keyDown("KeyQ"); // still held, no keyup yet
    expect(k.takeSwap()).toBe(false);
    k.keyUp("KeyQ");
    k.keyDown("KeyQ");
    expect(k.takeSwap()).toBe(true);
  });

  it("releaseAll drops held keys and the mouse button (window blur)", () => {
    const k = new KeyboardMouse();
    k.keyDown("KeyA");
    k.leftButton = true;
    k.releaseAll();
    expect(k.moveVector()).toEqual({ x: 0, y: 0 });
    expect(k.leftButton).toBe(false);
    k.keyUp("KeyA"); // a late keyup does not go negative
    k.keyDown("KeyD");
    expect(k.moveVector()).toEqual({ x: 1, y: 0 });
  });

  it("aims with a unit vector from the survivor to the cursor, keeping the last aim when they coincide", () => {
    const k = new KeyboardMouse();
    const a = k.aimAt(10, 10, 13, 14);
    expect(a.x).toBeCloseTo(0.6, 9);
    expect(a.y).toBeCloseTo(0.8, 9);
    const b = k.aimAt(10, 10, 10, 10);
    expect(b.x).toBeCloseTo(0.6, 9);
    expect(b.y).toBeCloseTo(0.8, 9);
  });
});
