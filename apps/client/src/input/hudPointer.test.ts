import { describe, expect, it } from "vitest";
import { HudButtons } from "./HudButtons";
import { InputRouter } from "./InputRouter";
import { TouchSticks } from "./TouchSticks";
import { hudPointerDown, hudPointerMove, hudPointerReset, hudPointerUp, type PointerLike } from "./hudPointer";

const W = 800;
const touch = (id: number, x: number, y: number): PointerLike => ({ id, x, y, wasTouch: true, button: 0, leftButtonDown: () => false });
const mouse = (x: number, y: number, held = true): PointerLike => ({ id: 99, x, y, wasTouch: false, button: 0, leftButtonDown: () => held });

function setup() {
  const buttons = new HudButtons();
  let presses = 0;
  buttons.set({ id: "swap", x: 700, y: 200, w: 64, h: 64, visible: true }, () => presses++);
  const router = new InputRouter(new TouchSticks(100, 0.1, 0.3));
  return { buttons, router, presses: () => presses };
}

describe("HUD pointer routing (buttons first)", () => {
  it("a touch on a button never creates, moves or lifts a stick", () => {
    const { buttons, router, presses } = setup();
    hudPointerDown(buttons, router, touch(1, 730, 230), W);
    hudPointerMove(buttons, router, touch(1, 500, 230)); // drags off the button, across the right half
    expect(presses()).toBe(1);
    expect(router.sticks.aim).toBeNull();
    expect(router.sticks.move).toBeNull();
    hudPointerUp(buttons, router, touch(1, 500, 230));
    expect(buttons.owns(1)).toBe(false);
  });

  it("a stick touch that slides over a button stays a stick (and presses nothing)", () => {
    const { buttons, router, presses } = setup();
    hudPointerDown(buttons, router, touch(2, 600, 230), W);
    hudPointerMove(buttons, router, touch(2, 730, 230));
    expect(router.sticks.aim?.pointerId).toBe(2);
    expect(presses()).toBe(0);
  });

  it("routes two thumbs independently: one on the button, one on the move stick", () => {
    const { buttons, router } = setup();
    hudPointerDown(buttons, router, touch(1, 100, 300), W);
    hudPointerDown(buttons, router, touch(2, 730, 230), W);
    hudPointerMove(buttons, router, touch(1, 200, 300));
    expect(router.sticks.move?.pointerId).toBe(1);
    expect(router.sticks.aim).toBeNull();
    hudPointerUp(buttons, router, touch(2, 730, 230));
    expect(router.sticks.move?.pointerId).toBe(1); // lifting the button finger leaves the stick alone
  });

  it("keeps a held button's pointer even if the button is hidden meanwhile", () => {
    const { buttons, router } = setup();
    hudPointerDown(buttons, router, touch(1, 730, 230), W);
    buttons.setVisible("swap", false);
    hudPointerMove(buttons, router, touch(1, 650, 230));
    expect(router.sticks.aim).toBeNull();
  });

  it("reset releases sticks and buttons", () => {
    const { buttons, router } = setup();
    hudPointerDown(buttons, router, touch(1, 100, 300), W);
    hudPointerDown(buttons, router, touch(2, 730, 230), W);
    hudPointerReset(buttons, router);
    expect(router.sticks.move).toBeNull();
    expect(buttons.owns(2)).toBe(false);
  });

  it("a mouse click on a button presses it and does not fire", () => {
    const { buttons, router, presses } = setup();
    hudPointerDown(buttons, router, mouse(730, 230), W);
    expect(presses()).toBe(1);
    expect(router.kbm.leftButton).toBe(false);
  });
});
