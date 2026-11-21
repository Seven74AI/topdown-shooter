import { keyAction, type KeyAction } from "./keyMap";
import { keyVector, type Vec2 } from "./keyVector";

/** Cursor closer than this (meters) to the survivor keeps the previous aim (no NaN, no jitter). */
const MIN_AIM_DIST_M = 1e-3;

/**
 * Keyboard + mouse state (no Phaser, no DOM): held keys by code, the left mouse button, a latched
 * swap tap, and the aim from the survivor to the cursor. Several codes may share an action (W and
 * ArrowUp), so held codes are counted per action.
 */
export class KeyboardMouse {
  private readonly heldCodes = new Set<string>();
  private readonly heldCount: Record<KeyAction, number> = { up: 0, down: 0, left: 0, right: 0, swap: 0 };
  private swapLatched = false;
  leftButton = false;
  private readonly move: Vec2 = { x: 0, y: 0 };
  /** Last aim direction (unit), kept while the cursor sits on the survivor. */
  private readonly aim: Vec2 = { x: 1, y: 0 };

  /** Returns true if the key is bound (the caller then prevents the browser default). */
  keyDown(code: string, repeat = false): boolean {
    const action = keyAction(code);
    if (!action) return false;
    if (this.heldCodes.has(code)) return true; // auto-repeat of a held key: nothing new
    // A repeat for a key we don't hold means it was already down when focus came back (after a
    // blur released everything): hold it again, but never as a new swap edge.
    this.heldCodes.add(code);
    this.heldCount[action]++;
    if (action === "swap" && !repeat) this.swapLatched = true;
    return true;
  }

  keyUp(code: string): boolean {
    const action = keyAction(code);
    if (!action) return false;
    if (this.heldCodes.delete(code)) this.heldCount[action]--;
    return true;
  }

  /** Releases every key and the mouse button (window blur: no walking on after Alt-Tab). */
  releaseAll(): void {
    this.heldCodes.clear();
    const c = this.heldCount;
    c.up = c.down = c.left = c.right = c.swap = 0;
    this.leftButton = false;
    this.swapLatched = false;
  }

  /** True once per Q press; clears the latch. */
  takeSwap(): boolean {
    const s = this.swapLatched;
    this.swapLatched = false;
    return s;
  }

  /** Normalized WASD/arrow vector (+y down); the returned object is reused. */
  moveVector(): Vec2 {
    const c = this.heldCount;
    return keyVector(c.up > 0, c.down > 0, c.left > 0, c.right > 0, this.move);
  }

  /** Unit vector from the survivor to the cursor (both world m); keeps the last aim when they coincide. */
  aimAt(originX: number, originY: number, cursorX: number, cursorY: number): Vec2 {
    const dx = cursorX - originX;
    const dy = cursorY - originY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > MIN_AIM_DIST_M) {
      this.aim.x = dx / d;
      this.aim.y = dy / d;
    }
    return this.aim;
  }
}
