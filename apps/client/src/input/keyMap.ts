/**
 * Desktop key bindings by `KeyboardEvent.code` (physical key position, so WASD works on AZERTY and
 * other layouts). One table so later shortcuts slot in:
 * - `KeyE` → "consumable" (Story 5.12)
 * - `KeyF` → "ping" (Story 8.7: opens / closes the wheel; while it is open `Digit1`–`Digit4` pick a ping instead of
 *   a build tile, and Esc closes it before the menu)
 * - `Escape` → "menu" (Story 2.11: opens and closes the in-run menu; never game input; Story 5.23:
 *   while holding a building it puts it away first)
 * - Story 5.23 (BX-11, ux-spec §9): `KeyR` rotate, `Space` place, `Digit1`–`Digit7` / `Numpad1`–`Numpad7`
 *   pick build-bar tile 1–7 (only while building; nothing else is bound to them).
 *
 * Story 5.23 (D15, D16): **undo** and **pick up** are mnemonic letters, read by the layout's letter
 * (`KeyboardEvent.key`) and only when that key's `code` isn't already a game key (`letterAction`): on
 * AZERTY the Z key is `KeyW` (walk up, ZQSD), so a plain Z walks there and Ctrl+Z undoes; QWERTZ's Z
 * sits on `KeyY`. Ctrl/Cmd + letter z undoes on every layout (`desktopInput`).
 */
export type KeyAction = "up" | "down" | "left" | "right" | "swap" | "consumable" | "menu" | "rotate" | "place" | "build" | "undo" | "pickUp" | "ping";

/** Story 5.23: the build-bar tile keys (index 0–6) by code. */
const BUILD_KEYS: Readonly<Record<string, number>> = Object.freeze({
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4,
  Numpad6: 5,
  Numpad7: 6,
});

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
  KeyE: "consumable", // Story 5.12: latched once per press like swap
  Escape: "menu",
  KeyF: "ping", // Story 8.7 (AC 3): opens / closes the ping wheel; 1–4 pick while it is open
  KeyR: "rotate", // Story 5.23
  Space: "place", // Story 5.23
  ...Object.fromEntries(Object.keys(BUILD_KEYS).map((code) => [code, "build" as const])),
});

/** Story 5.23 (D15, D16): letter shortcuts by the layout's letter (lower case). */
export const LETTER_MAP: Readonly<Record<string, KeyAction>> = Object.freeze({
  z: "undo",
  m: "pickUp",
});

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The action bound to a key code, or undefined if the game doesn't use the key. */
export function keyAction(code: string): KeyAction | undefined {
  return own(KEY_MAP, code) ? KEY_MAP[code] : undefined;
}

/**
 * Story 5.23: the action of a key press: its code's binding first (positional keys win: AZERTY's Z
 * walks up), else the layout letter's (`key`, any case) — undefined if neither.
 */
export function letterAction(code: string, key: string | undefined): KeyAction | undefined {
  const byCode = keyAction(code);
  if (byCode !== undefined) return byCode;
  if (key === undefined || key.length !== 1) return undefined;
  const k = key.toLowerCase();
  return own(LETTER_MAP, k) ? LETTER_MAP[k] : undefined;
}

/** Story 5.23: the build-bar tile (0–6) a key code picks, or −1. */
export function buildSlot(code: string): number {
  return own(BUILD_KEYS, code) ? (BUILD_KEYS[code] as number) : -1;
}
