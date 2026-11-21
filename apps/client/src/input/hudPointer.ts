import type { HudButtons } from "./HudButtons";
import type { InputRouter } from "./InputRouter";

/** The parts of a Phaser pointer the HUD routing needs (keeps this module Phaser-free and testable). */
export interface PointerLike {
  id: number;
  x: number;
  y: number;
  wasTouch: boolean;
  button: number;
  leftButtonDown(): boolean;
}

/**
 * HUD pointer routing, buttons first (readiness fix U1): a pointer that starts on a HUD button presses
 * it and is held by the button until it lifts; it never moves, spawns or lifts a stick, and a mouse
 * click on a button never fires. Everything else goes to the input router (sticks or mouse).
 */
export function hudPointerDown(buttons: HudButtons, router: InputRouter, p: PointerLike, screenWidth: number): void {
  const route = buttons.pointerDown(p.id, p.x, p.y, screenWidth);
  router.pointerDown(p.id, p.x, p.y, p.wasTouch, p.button, route.kind === "button", screenWidth);
}

export function hudPointerMove(buttons: HudButtons, router: InputRouter, p: PointerLike): void {
  router.pointerMove(p.id, p.x, p.y, p.wasTouch, buttons.owns(p.id));
}

export function hudPointerUp(buttons: HudButtons, router: InputRouter, p: PointerLike): void {
  buttons.pointerUp(p.id);
  router.pointerUp(p.id, p.wasTouch, p.leftButtonDown());
}

/** Window blur / scene shutdown: release every stick and button. */
export function hudPointerReset(buttons: HudButtons, router: InputRouter): void {
  router.sticks.reset();
  buttons.reset();
}
