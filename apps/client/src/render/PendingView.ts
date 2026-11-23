import * as Phaser from "phaser";
import { PENDING_POOL, type PendingPlacements } from "../scenes/pendingPlacements";
import { dashedRect } from "./dashes";
import { newPendingLook, pendingLook } from "./pendingLook";

/**
 * Story 5.18 (AC 5, 7, 12; ux-spec §6.4): my pending placements in the world. One Graphics pair
 * (box + spinner) per tracker slot, made once: a box is drawn when a placement takes its slot and
 * redrawn once when it turns red; per frame only position (shake), alpha (fade) and the spinner's
 * rotation change. Graphics only (no texture, brief 20); no allocation per frame.
 */
const WHITE = 0xffffff;
const RED = 0xe53935;
const LINE_M = 0.06;
const DASH_M = 0.25;
const FILL_ALPHA = 0.1;
const SPINNER_R_M = 0.18;
const SPINNER_LINE_M = 0.06;
/** On the ground with the ghost's lattice, just under the placement preview (13) and above bodies' bars (12). */
const PENDING_DEPTH = 12.8;

export class PendingView {
  private readonly boxes: Phaser.GameObjects.Graphics[] = [];
  private readonly spinners: Phaser.GameObjects.Graphics[] = [];
  /** What each slot's box was drawn for: the entry's order (0 = nothing) and colour. */
  private readonly drawnOrder = new Float64Array(PENDING_POOL);
  private readonly drawnRed = new Uint8Array(PENDING_POOL);
  private readonly look = newPendingLook();
  /** Box redraws so far (tests and browser checks read it). */
  redraws = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < PENDING_POOL; i++) {
      this.boxes.push(scene.add.graphics().setDepth(PENDING_DEPTH).setVisible(false));
      const s = scene.add.graphics().setDepth(PENDING_DEPTH).setVisible(false);
      s.lineStyle(SPINNER_LINE_M, WHITE, 0.9);
      s.beginPath();
      s.arc(0, 0, SPINNER_R_M, 0, Math.PI / 2, false);
      s.strokePath();
      this.spinners.push(s);
    }
  }

  update(pending: PendingPlacements, nowMs: number): void {
    const entries = pending.entries;
    for (let i = 0; i < PENDING_POOL; i++) {
      const e = entries[i];
      const g = this.boxes[i];
      const s = this.spinners[i];
      if (!e || !g || !s) continue;
      const l = pendingLook(e, nowMs, this.look);
      if (!l.visible) {
        if (g.visible) g.setVisible(false);
        if (s.visible) s.setVisible(false);
        continue;
      }
      const w = e.maxX - e.minX;
      const h = e.maxY - e.minY;
      const red = l.red ? 1 : 0;
      if (this.drawnOrder[i] !== e.order || this.drawnRed[i] !== red) {
        this.drawnOrder[i] = e.order;
        this.drawnRed[i] = red;
        const c = l.red ? RED : WHITE;
        g.clear();
        g.fillStyle(c, FILL_ALPHA).fillRect(-w / 2, -h / 2, w, h);
        g.lineStyle(LINE_M, c, 0.95);
        dashedRect(g, w, h, DASH_M);
        this.redraws++;
      }
      g.setPosition((e.minX + e.maxX) / 2 + l.dx, (e.minY + e.maxY) / 2).setAlpha(l.alpha).setVisible(true);
      if (Number.isNaN(l.spin)) {
        if (s.visible) s.setVisible(false);
      } else s.setPosition(e.maxX, e.minY).setRotation(l.spin).setVisible(true);
    }
  }

  destroy(): void {
    for (const g of this.boxes) g.destroy();
    for (const s of this.spinners) s.destroy();
    this.boxes.length = 0;
    this.spinners.length = 0;
  }
}
