import { buildingById, type World } from "@topdown/shared";
import { UNDO_ABOVE_BAR_GAP_CSS_PX, UNDO_CHIP_CSS_PX, UNDO_HAND, UNDO_ROW_BUTTON_CSS_PX, UNDO_ROW_SLOT } from "../ui/sizes";

/**
 * Story 5.20 (BX-6, ux-spec §4/§5): the undo chip ↶ (Phaser-free, unit-tested). Shown for
 * `controls.build.undoWindowMs` (10 s, designer) after each Place, with a draining ring; pressing it
 * sells (takes back, 100 %) the building that Place made. The press may come while the placement is
 * still pending (5.18's box, no answer yet): the chip is then **armed** and the sell is sent as soon
 * as the box becomes my building (even after the 10 s), or dropped if the box is refused / lost.
 *
 * It goes when the build phase ends or a new wave number starts (a hidden tab), when I'm downed or
 * out, when the building is gone, and when a newer Place replaces it. A sell is only ever sent in a
 * build phase (the server would refuse it anyway: F4). The World is never changed here (F1).
 */

/** What the chip needs from `PendingPlacements` (the box's fate). */
export interface UndoPendingView {
  builtId(order: number): number;
  waiting(order: number): boolean;
}

export class UndoChip {
  /** The pending box's order (0 = no chip). */
  order = 0;
  /** The building it became (0 = not yet). */
  id = 0;
  /** Pressed while still pending: sent when the building appears. */
  armed = false;
  /** Shown now (`update`). */
  visible = false;
  /** The ring: 1 = the whole window left, 0 = none (armed: 0). */
  progress = 0;
  private startMs = 0;
  private wave = -1;

  /** A Place made box `order` (its 10 s start now). `wave` = the World's wave number. */
  placed(order: number, nowMs: number, wave: number): void {
    if (order <= 0) return;
    this.order = order;
    this.id = 0;
    this.armed = false;
    this.startMs = nowMs;
    this.wave = wave;
  }

  clear(): void {
    this.order = 0;
    this.id = 0;
    this.armed = false;
    this.visible = false;
    this.progress = 0;
  }

  /**
   * Once per frame, after the pending boxes were matched (`runPendingFrame`). `standing`: my survivor
   * is alive and the run is on screen; `shown`: no menu/shop/selection hides it now. `send` gets the
   * id of an armed undo whose building just appeared. Returns whether it is visible.
   */
  update(world: Readonly<World>, ownerId: string, pending: UndoPendingView, nowMs: number, windowMs: number, standing: boolean, shown: boolean, send: (id: number) => void): boolean {
    if (this.order === 0) return (this.visible = false);
    if (world.run.phase !== "build" || world.waves.number !== this.wave || !standing) {
      this.clear();
      return false;
    }
    if (this.id === 0) {
      this.id = pending.builtId(this.order);
      if (this.id === 0 && !pending.waiting(this.order)) {
        this.clear(); // refused, timed out for good, or cleared: nothing to take back
        return false;
      }
    }
    if (this.id !== 0) {
      const b = buildingById(world, this.id);
      if (!b || b.ownerId !== ownerId) {
        this.clear(); // destroyed, already sold
        return false;
      }
      if (this.armed) {
        const id = this.id;
        this.clear();
        send(id);
        return false;
      }
    }
    const left = this.armed ? 0 : 1 - (nowMs - this.startMs) / windowMs;
    if (left <= 0 && !this.armed) {
      this.clear();
      return false;
    }
    this.progress = Math.max(0, left);
    this.visible = shown;
    return this.visible;
  }

  /** A tap on ↶ (or Z): the building id to sell now, or 0 (armed while pending, or nothing shown). */
  press(): number {
    if (!this.visible || this.armed || this.order === 0) return 0;
    if (this.id !== 0) {
      const id = this.id;
      this.clear();
      return id;
    }
    this.armed = true;
    this.progress = 0;
    return 0;
  }
}

/**
 * Story 5.20 (D4; ux-spec §4 + alignment Q4): where ↶ goes (canvas px, top-left + size; insets in
 * CSS px, `k` = dpr):
 *
 * - **build bar up** (empty hands; Ready is shown, slid left): above the bar's top-left, in Story
 *   5.12's consumable/swap row (64 px buttons 12 px above the tiles, 12 px apart) at its third slot,
 *   `gridLeft + 2 × (64 + 12)`, centred on the row: it never meets the slid Ready, 5.12's buttons or
 *   the tiles;
 * - **holding** (Ready, the bar and 5.12's row are hidden): the spec's hand-cluster spot, centre
 *   (270, 64) from the bottom-right safe-area corner, left of ⟳ under the right thumb — away from the
 *   survivor and the ghost (a spot above the grid covered the just-placed building at 568 × 320).
 *
 * Pure (`undoChip.test.ts` checks 568 × 320, 800 × 360 and 1024 × 768 against 5.12's row, Ready, the
 * hand cluster, the item chip and ☰).
 */
export function layoutUndoChip(width: number, height: number, insetRight: number, insetBottom: number, gridLeft: number, gridTop: number, k: number, holding: boolean, out: { x: number; y: number; size: number }): { x: number; y: number; size: number } {
  const size = UNDO_CHIP_CSS_PX * k;
  out.size = size;
  if (holding) {
    out.x = width - (UNDO_HAND.rightCss + insetRight) * k - size / 2;
    out.y = height - (UNDO_HAND.bottomCss + insetBottom) * k - size / 2;
    return out;
  }
  const gap = UNDO_ABOVE_BAR_GAP_CSS_PX * k;
  const row = UNDO_ROW_BUTTON_CSS_PX * k;
  out.x = gridLeft + UNDO_ROW_SLOT * (row + gap);
  out.y = gridTop - gap - row / 2 - size / 2;
  return out;
}
