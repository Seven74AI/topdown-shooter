import type { PlayerInput } from "@topdown/shared";
import { KeyboardMouse } from "./KeyboardMouse";
import { keyAction } from "./keyMap";
import { selectSource, type InputSource, type SourceEvent } from "./selectSource";
import type { TouchSticks } from "./TouchSticks";

export type MutablePlayerInput = { -readonly [K in keyof PlayerInput]: PlayerInput[K] };

/** Phaser `pointer.button` value for the primary (left) mouse button. */
const LEFT_BUTTON = 0;

/**
 * Owns both input sources (touch sticks, keyboard + mouse) and builds the one PlayerInput per
 * frame from whichever was used last (Story 1.10). No Phaser, no DOM: the HUD scene feeds it
 * pointer events (tagged with `pointer.wasTouch`), the DOM layer feeds it keys, and the game scene
 * converts the cursor to world space. A mouse pointer never creates a touch stick.
 */
export class InputRouter {
  source: InputSource = "touch";
  readonly kbm = new KeyboardMouse();
  /** Last mouse position in canvas px (NaN until the mouse is seen). */
  cursorX = Number.NaN;
  cursorY = Number.NaN;
  /** Where the mouse was when touch took over; it must move > MOUSE_SWITCH_PX from here to switch back. */
  private anchorX = Number.NaN;
  private anchorY = Number.NaN;
  /** Called on every source change (cursor style). */
  onSourceChange: ((source: InputSource) => void) | null = null;

  constructor(readonly sticks: TouchSticks) {}

  get isMouse(): boolean {
    return this.source === "mouse";
  }

  private apply(event: SourceEvent, movePx = 0): void {
    const next = selectSource(this.source, event, movePx);
    if (next === this.source) return;
    this.source = next;
    if (next === "mouse") {
      this.sticks.reset(); // a resting thumb must not keep steering once the mouse took over
    } else {
      this.kbm.leftButton = false;
      this.anchorX = this.cursorX;
      this.anchorY = this.cursorY;
    }
    this.onSourceChange?.(next);
  }

  /** `onButton`: the HUD buttons claimed this pointer (it presses the button; no stick, no fire). */
  pointerDown(pointerId: number, x: number, y: number, wasTouch: boolean, button: number, onButton: boolean, screenWidth: number): void {
    if (wasTouch) {
      this.apply("touchDown");
      if (!onButton) this.sticks.pointerDown(pointerId, x, y, screenWidth);
      return;
    }
    this.cursorX = x;
    this.cursorY = y;
    this.apply("mouseButton");
    if (!onButton && button === LEFT_BUTTON) this.kbm.leftButton = true;
  }

  /** `ownedByButton`: the pointer is holding a HUD button (touch moves then never reach the sticks). */
  pointerMove(pointerId: number, x: number, y: number, wasTouch: boolean, ownedByButton: boolean, leftDown = false): void {
    if (wasTouch) {
      if (!ownedByButton) this.sticks.pointerMove(pointerId, x, y);
      return;
    }
    this.cursorX = x;
    this.cursorY = y;
    if (this.source === "mouse") return;
    if (Number.isNaN(this.anchorX)) {
      this.anchorX = x; // first sighting of the mouse: measure movement from here
      this.anchorY = y;
      return;
    }
    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    this.apply("mouseMove", Math.sqrt(dx * dx + dy * dy));
    // Back in mouse mode with the button physically held: keep firing (the cached flag was cleared).
    if (this.isMouse) this.kbm.leftButton = leftDown;
  }

  /** `leftStillDown`: for a mouse, whether the left button is still held after this release. */
  pointerUp(pointerId: number, wasTouch: boolean, leftStillDown: boolean): void {
    if (wasTouch) {
      this.sticks.pointerUp(pointerId);
      return;
    }
    if (!leftStillDown) this.kbm.leftButton = false;
  }

  /** Returns true if the key is bound (the caller prevents the browser default). */
  keyDown(code: string, repeat = false): boolean {
    const handled = this.kbm.keyDown(code, repeat);
    // Esc (the in-run menu, Story 2.11) is not play: it never switches a touch player to the mouse.
    if (handled && !repeat && keyAction(code) !== "menu") this.apply("key");
    return handled;
  }

  keyUp(code: string): boolean {
    return this.kbm.keyUp(code);
  }

  /** Window blur / tab hidden: release every key, the mouse button and the sticks. */
  releaseAll(): void {
    this.kbm.releaseAll();
    this.sticks.reset();
  }

  /**
   * Fills `out` (reused, no allocation) for this frame. `hudSwap` is the swap button's edge;
   * origin and cursor are world meters (the survivor's interpolated position, the cursor through
   * the zoomed camera); they are only read in mouse mode.
   */
  build(out: MutablePlayerInput, hudSwap: boolean, originX: number, originY: number, cursorWorldX: number, cursorWorldY: number): MutablePlayerInput {
    const keySwap = this.kbm.takeSwap();
    out.swap = hudSwap || keySwap; // edge flag: LocalSimHost latches it for one step
    if (this.source === "mouse") {
      const mv = this.kbm.moveVector();
      out.moveX = mv.x;
      out.moveY = mv.y;
      if (Number.isNaN(cursorWorldX) || Number.isNaN(cursorWorldY)) {
        out.aimX = 0;
        out.aimY = 0;
      } else {
        const aim = this.kbm.aimAt(originX, originY, cursorWorldX, cursorWorldY);
        out.aimX = aim.x;
        out.aimY = aim.y;
      }
      out.fire = this.kbm.leftButton;
      out.isMouse = true;
      return out;
    }
    const mv = this.sticks.moveVector();
    out.moveX = mv.x;
    out.moveY = mv.y;
    const aim = this.sticks.aimVector();
    out.aimX = aim.x;
    out.aimY = aim.y;
    out.fire = aim.fire;
    out.isMouse = false;
    return out;
  }
}
