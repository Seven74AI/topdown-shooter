/**
 * Story 5.21 (AC 11, D9; ux-spec §5): a long-press on the game view — a touch (or mouse press) held
 * `longPressMs` without travelling more than the tap slop — picks my own building up. Like the
 * Story 3.7 tap detector it only watches (it never takes the pointer); it follows one pointer (the
 * latest eligible down) and fires at most once per press. `heldMs` feeds the ring that fills round
 * the finger. Plain fields: no allocation per event or frame. Phaser-free, so it is unit-tested.
 */
export class LongPress {
  private id = -1;
  private x = 0;
  private y = 0;
  private atMs = 0;
  private fired = false;

  /** A pointer went down at canvas (x, y). `eligible` false: it pressed a HUD button. */
  down(id: number, x: number, y: number, nowMs: number, eligible: boolean): void {
    if (!eligible) {
      if (this.id === id) this.id = -1;
      return;
    }
    this.id = id;
    this.x = x;
    this.y = y;
    this.atMs = nowMs;
    this.fired = false;
  }

  /** The followed pointer moved: it stops being a press once it leaves the slop circle. */
  move(id: number, x: number, y: number, slopPx: number): void {
    if (id !== this.id) return;
    const dx = x - this.x;
    const dy = y - this.y;
    if (dx * dx + dy * dy > slopPx * slopPx) this.id = -1;
  }

  /** The pointer lifted. */
  up(id: number): void {
    if (id === this.id) this.id = -1;
  }

  /** Window blur, the menu, holding a building: forget the press. */
  reset(): void {
    this.id = -1;
  }

  /** How long the followed press has been held (ms), or −1 when none is held (or it already fired). */
  heldMs(nowMs: number): number {
    return this.id < 0 || this.fired ? -1 : Math.max(0, nowMs - this.atMs);
  }

  /** Once per frame: true exactly once, when the press has been held `longMs`. */
  update(nowMs: number, longMs: number): boolean {
    if (this.id < 0 || this.fired || nowMs - this.atMs < longMs) return false;
    this.fired = true;
    return true;
  }

  /** Where the followed press went down (canvas px). */
  get pressX(): number {
    return this.x;
  }
  get pressY(): number {
    return this.y;
  }
}

/** Story 5.21 (AC 11): the long-press ring's fill (0–1) after `heldMs`, empty before `ringMs`; −1 = no ring. */
export function longPressRing(heldMs: number, ringMs: number, longMs: number): number {
  if (heldMs < 0 || heldMs < ringMs) return -1;
  if (longMs <= ringMs) return 1;
  return Math.min(1, (heldMs - ringMs) / (longMs - ringMs));
}

/**
 * Story 5.21 review M1: a long-press is armed only for a right-half touch or a mouse press — a
 * left-half touch is the floating move stick, and a thumb resting on it over my own building must
 * never pick that building up.
 */
export function longPressArmed(wasTouch: boolean, x: number, screenWidth: number): boolean {
  return !wasTouch || x >= screenWidth / 2;
}

/**
 * Story 5.21 (AC 7, D8; 5.20's open question): does a touch that would press Ready go to the
 * building under it instead? Only Ready yields (starting the wave by accident is costly and the menu
 * has no other route); every other HUD button keeps priority. `buildingUnder`: a building's tap
 * area (footprint + 0.4 m) is under the touch; `tapsEnabled`: a build phase, empty hands, no shop or
 * menu, standing (the same gate as a tap).
 */
export function readyYields(buttonId: string | null, tapsEnabled: boolean, buildingUnder: boolean): boolean {
  return buttonId === "ready" && tapsEnabled && buildingUnder;
}
