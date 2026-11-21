/**
 * Desktop key bindings by `KeyboardEvent.code` (physical key position, so WASD works on AZERTY and
 * other layouts). One table so later shortcuts slot in:
 * - `KeyE` → "consumable" (Story 5.12)
 * - `KeyF` → "ping" (Story 8.7)
 * - `Escape` → "menu" (Story 2.11)
 */
export type KeyAction = "up" | "down" | "left" | "right" | "swap";

export const KEY_MAP: Readonly<Record<string, KeyAction>> = Object.freeze({
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyQ: "swap",
});

/** The action bound to a key code, or undefined if the game doesn't use the key. */
export function keyAction(code: string): KeyAction | undefined {
  return Object.prototype.hasOwnProperty.call(KEY_MAP, code) ? KEY_MAP[code] : undefined;
}
