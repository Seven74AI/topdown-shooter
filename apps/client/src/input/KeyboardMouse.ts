import { buildSlot, keyAction, letterAction, type KeyAction } from "./keyMap";
import { keyVector, type Vec2 } from "./keyVector";

/** Cursor closer than this (meters) to the survivor keeps the previous aim (no NaN, no jitter). */
const MIN_AIM_DIST_M = 1e-3;

/**
 * Keyboard + mouse state (no Phaser, no DOM): held keys by code, the left mouse button, a latched
 * swap tap, and the aim from the survivor to the cursor. Several codes may share an action (W and
 * ArrowUp), so held codes are counted per action.
 */
export class KeyboardMouse {
  /** Held codes and the action each was bound to at its press (Story 5.23: a letter binding is found by `key`, not code). */
  private readonly heldCodes = new Map<string, KeyAction>();
  private readonly heldCount: Record<KeyAction, number> = { up: 0, down: 0, left: 0, right: 0, swap: 0, consumable: 0, menu: 0, rotate: 0, place: 0, build: 0, undo: 0, pickUp: 0 };
  private swapLatched = false;
  /** Story 5.12: E pressed since the last `takeConsumable()` (one edge per press, no auto-repeat). */
  private consumableLatched = false;
  /** Esc pressed since the last `takeMenu()` (Story 2.11). Kept through `releaseAll`: a press is an intent. */
  private menuLatched = false;
  /** Story 5.23 (AC 10–12): R, Space, a build-bar key (its tile, −1 = none), undo and pick-up, once per press each. */
  private rotateLatched = false;
  private placeLatched = false;
  private buildLatched = -1;
  private undoLatched = false;
  private pickUpLatched = false;
  leftButton = false;
  private readonly move: Vec2 = { x: 0, y: 0 };
  /** Last aim direction (unit), kept while the cursor sits on the survivor. */
  private readonly aim: Vec2 = { x: 1, y: 0 };

  /** Returns true if the key is bound (the caller then prevents the browser default). */
  /**
   * Returns true if the key is bound (the caller then prevents the browser default). Story 5.23:
   * `key` (the layout's letter) finds the letter bindings (undo, pick up) when the code has none.
   */
  keyDown(code: string, repeat = false, key?: string): boolean {
    const action = letterAction(code, key);
    if (!action) return false;
    if (this.heldCodes.has(code)) return true; // auto-repeat of a held key: nothing new
    // A repeat for a key we don't hold means it was already down when focus came back (after a
    // blur released everything): hold it again, but never as a new swap edge.
    this.heldCodes.set(code, action);
    this.heldCount[action]++;
    if (repeat) return true;
    if (action === "swap") this.swapLatched = true;
    else if (action === "consumable") this.consumableLatched = true;
    else if (action === "menu") this.menuLatched = true;
    else if (action === "rotate") this.rotateLatched = true;
    else if (action === "place") this.placeLatched = true;
    else if (action === "build") this.buildLatched = buildSlot(code);
    else if (action === "undo") this.undoLatched = true;
    else if (action === "pickUp") this.pickUpLatched = true;
    return true;
  }

  keyUp(code: string): boolean {
    const held = this.heldCodes.get(code);
    if (held !== undefined) {
      this.heldCodes.delete(code);
      this.heldCount[held]--;
      return true;
    }
    return keyAction(code) !== undefined;
  }

  /** Story 5.23 (D15): Ctrl/Cmd+Z (`desktopInput`): an undo edge on every layout. */
  pressUndo(): void {
    this.undoLatched = true;
  }

  /** Releases every key and the mouse button (window blur: no walking on after Alt-Tab). */
  releaseAll(): void {
    this.heldCodes.clear();
    const c = this.heldCount;
    c.up = c.down = c.left = c.right = c.swap = c.consumable = c.menu = 0;
    c.rotate = c.place = c.build = c.undo = c.pickUp = 0;
    this.leftButton = false;
    this.swapLatched = false;
    this.consumableLatched = false;
    this.rotateLatched = false;
    this.placeLatched = false;
    this.buildLatched = -1;
    this.undoLatched = false;
    this.pickUpLatched = false;
  }

  /** Story 5.23: true once per R press; clears the latch. */
  takeRotate(): boolean {
    const r = this.rotateLatched;
    this.rotateLatched = false;
    return r;
  }

  /** Story 5.23: true once per Space press; clears the latch. */
  takePlace(): boolean {
    const r = this.placeLatched;
    this.placeLatched = false;
    return r;
  }

  /** Story 5.23: the build-bar tile (0–6) of the last digit press, once; −1 = none. */
  takeBuild(): number {
    const r = this.buildLatched;
    this.buildLatched = -1;
    return r;
  }

  /** Story 5.23: true once per undo press (Z where free, Ctrl/Cmd+Z); clears the latch. */
  takeUndo(): boolean {
    const r = this.undoLatched;
    this.undoLatched = false;
    return r;
  }

  /** Story 5.23: true once per M press; clears the latch. */
  takePickUp(): boolean {
    const r = this.pickUpLatched;
    this.pickUpLatched = false;
    return r;
  }

  /** True once per Q press; clears the latch. */
  takeSwap(): boolean {
    const s = this.swapLatched;
    this.swapLatched = false;
    return s;
  }

  /** Story 5.12: true once per E press; clears the latch. */
  takeConsumable(): boolean {
    const c = this.consumableLatched;
    this.consumableLatched = false;
    return c;
  }

  /** True once per Esc press (Story 2.11: toggles the in-run menu); clears the latch. */
  takeMenu(): boolean {
    const m = this.menuLatched;
    this.menuLatched = false;
    return m;
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
