import type { LobRange, PlayerInput } from "@topdown/shared";
import { applyLobLength, mouseLobDistance, touchLobDistance } from "./lobAim";
import { KeyboardMouse } from "./KeyboardMouse";
import { keyAction } from "./keyMap";
import { selectSource, type InputSource, type SourceEvent } from "./selectSource";
import { getSettings } from "../settings/settings";
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
  /** Story 5.23 (D12): mouse moves seen so far (the scene's cursor follow starts once it changes after a pick / Place). */
  mouseMoves = 0;
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
    if (x !== this.cursorX || y !== this.cursorY) this.mouseMoves++;
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

  /** Returns true if the key is bound (the caller prevents the browser default). Story 5.23: `key` = the layout's letter. */
  keyDown(code: string, repeat = false, key?: string): boolean {
    const handled = this.kbm.keyDown(code, repeat, key);
    // Esc (the in-run menu, Story 2.11) is not play: it never switches a touch player to the mouse.
    if (handled && !repeat && keyAction(code) !== "menu") this.apply("key");
    return handled;
  }

  keyUp(code: string): boolean {
    return this.kbm.keyUp(code);
  }

  /** Story 5.15: holding a building starts: the aim stick and the mouse button let go; movement (stick, keys) is kept. */
  releaseAim(): void {
    this.kbm.leftButton = false;
    this.sticks.releaseAim();
  }

  /** Window blur / tab hidden: release every key, the mouse button and the sticks. */
  releaseAll(): void {
    this.kbm.releaseAll();
    this.sticks.reset();
  }

  /**
   * Fills `out` (reused, no allocation) for this frame. `hudSwap` is the swap button's edge;
   * origin and cursor are world meters (the survivor's interpolated position, the cursor through
   * the zoomed camera); they are only read in mouse mode. Story 5.5: `lob` = the launcher in hand
   * (null otherwise): the aim's length then carries the lob distance (FR-A; `lobAim.ts`), with
   * `bodyRadiusM` for the mouse's muzzle offset. Every other weapon keeps a unit aim. Story 5.12:
   * `lob` is the throwable consumable's range while no launcher is in hand (D11), and
   * `hudConsumable` the consumable button's edge (E on desktop is latched here); `throwLob` the
   * throwable in the slot: the flagged input encodes its range and drops `fire` (review L5).
   */
  build(out: MutablePlayerInput, hudSwap: boolean, originX: number, originY: number, cursorWorldX: number, cursorWorldY: number, lob: Readonly<LobRange> | null = null, bodyRadiusM = 0, hudConsumable = false, throwLob: Readonly<LobRange> | null = null): MutablePlayerInput {
    const keySwap = this.kbm.takeSwap();
    out.swap = hudSwap || keySwap; // edge flag: LocalSimHost latches it for one step
    const keyConsumable = this.kbm.takeConsumable();
    out.consumable = hudConsumable || keyConsumable; // Story 5.12: edge flag, latched by the hosts for one step
    // Story 5.12 review L5: the input that carries a throw always encodes the THROW's own range (never
    // the launcher's: a swap in flight can't change how the server decodes it) and fires nothing.
    const throwing = out.consumable && throwLob !== null;
    if (throwing) lob = throwLob;
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
        if (lob) applyLobLength(out, lob, mouseLobDistance(originX, originY, cursorWorldX, cursorWorldY, bodyRadiusM));
      }
      out.fire = this.kbm.leftButton && !throwing;
      out.isMouse = true;
      return out;
    }
    const mv = this.sticks.moveVector();
    out.moveX = mv.x;
    out.moveY = mv.y;
    const aim = this.sticks.aimVector();
    out.aimX = aim.x;
    out.aimY = aim.y;
    if (lob) applyLobLength(out, lob, touchLobDistance(lob, aim.deflection, this.sticks.aimDeadZoneFrac));
    out.fire = aim.fire && !throwing;
    // Story 10.1 (B6): aim assist off rides the input's "no assist" bit (FR4's mouse bit): the server and the client
    // mirror skip assist on it; nothing else reads it. No protocol change.
    out.isMouse = !getSettings().aimAssist;
    return out;
  }
}
