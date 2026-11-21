/** A HUD button's hit area in canvas pixels. */
export interface ButtonRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export type PointerRoute = { kind: "button"; id: string } | { kind: "move" } | { kind: "aim" };

/** Extra px around a button that still counts as a press (fat fingers). */
export const BUTTON_TOLERANCE_PX = 4;

/**
 * Where a new touch goes (readiness fix U1): a touch that starts on a visible HUD button presses it
 * and never spawns a stick; otherwise the left half spawns the move stick and the right half the aim
 * stick. Pure, so it is unit-tested; every HUD button (swap, consumable, ping, menu, Shop, Ready) is
 * routed here.
 */
export function routePointer(x: number, y: number, buttons: readonly ButtonRect[], screenWidth: number, tolerance = BUTTON_TOLERANCE_PX): PointerRoute {
  for (const b of buttons) {
    if (!b.visible) continue;
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) {
      return { kind: "button", id: b.id };
    }
  }
  return x < screenWidth / 2 ? { kind: "move" } : { kind: "aim" };
}
