import * as Phaser from "phaser";
import { buildingById, type World } from "@topdown/shared";
import type { PendingMoves } from "../scenes/pendingMove";
import type { Placement } from "../scenes/placement";
import { dashedRect } from "./dashes";
import { newPendingLook, pendingLook } from "./pendingLook";

/**
 * Story 5.22 (AC 11, 13; D12): moves in the world. While I hold one of my buildings, its OLD spot
 * gets a dashed outline (it still stands and blocks for everyone until the move is accepted); each
 * pending move is 5.18's pending box at the new spot (dashed + spinner, red shake on a refusal).
 * Graphics only (no texture, brief 20); redrawn only when what it shows changes; no allocation per
 * frame.
 */
const WHITE = 0xffffff;
const RED = 0xe53935;
const ORIGIN = 0x64ffda;
const LINE_M = 0.06;
const DASH_M = 0.25;
const FILL_ALPHA = 0.1;
const SPINNER_R_M = 0.18;
const SPINNER_LINE_M = 0.06;
/** With 5.18's pending boxes: under the placement preview (13), above bodies' bars (12). */
const MOVE_DEPTH = 12.8;

export class MoveView {
  private readonly origin: Phaser.GameObjects.Graphics;
  private readonly boxes: Phaser.GameObjects.Graphics[] = [];
  private readonly spinners: Phaser.GameObjects.Graphics[] = [];
  private readonly drawnKey: Float64Array;
  private readonly look = newPendingLook();
  /** The old-spot outline's key (building id × footprint), −1 = hidden. */
  private originKey = -1;

  constructor(scene: Phaser.Scene, size: number) {
    this.origin = scene.add.graphics().setDepth(MOVE_DEPTH).setVisible(false);
    this.drawnKey = new Float64Array(size).fill(-1);
    for (let i = 0; i < size; i++) {
      this.boxes.push(scene.add.graphics().setDepth(MOVE_DEPTH).setVisible(false));
      const s = scene.add.graphics().setDepth(MOVE_DEPTH).setVisible(false);
      s.lineStyle(SPINNER_LINE_M, WHITE, 0.9);
      s.beginPath();
      s.arc(0, 0, SPINNER_R_M, 0, Math.PI / 2, false);
      s.strokePath();
      this.spinners.push(s);
    }
  }

  update(world: Readonly<World>, placement: Readonly<Placement>, moves: PendingMoves, nowMs: number): void {
    this.drawOrigin(world, placement);
    const entries = moves.entries;
    const n = Math.min(entries.length, this.boxes.length);
    for (let i = 0; i < n; i++) {
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
      const key = (e.id * 4 + e.rot) * 2 + (l.red ? 1 : 0) + e.gx * 1e6 + e.gy * 1e9;
      if (this.drawnKey[i] !== key) {
        this.drawnKey[i] = key;
        const c = l.red ? RED : WHITE;
        g.clear();
        g.fillStyle(c, FILL_ALPHA).fillRect(-w / 2, -h / 2, w, h);
        g.lineStyle(LINE_M, c, 0.95);
        dashedRect(g, w, h, DASH_M);
      }
      g.setPosition((e.minX + e.maxX) / 2 + l.dx, (e.minY + e.maxY) / 2).setAlpha(l.alpha).setVisible(true);
      if (Number.isNaN(l.spin)) {
        if (s.visible) s.setVisible(false);
      } else s.setPosition(e.maxX, e.minY).setRotation(l.spin).setVisible(true);
    }
  }

  /** The held building's old spot, dashed (AC 11). */
  private drawOrigin(world: Readonly<World>, p: Readonly<Placement>): void {
    const b = p.active && p.moveId !== 0 ? buildingById(world, p.moveId) : undefined;
    const g = this.origin;
    if (!b) {
      if (this.originKey !== -1) {
        this.originKey = -1;
        g.setVisible(false);
      }
      return;
    }
    const key = b.id + b.gx * 1e5 + b.gy * 1e8 + b.rot * 1e11;
    if (key === this.originKey) return;
    this.originKey = key;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    g.clear();
    g.fillStyle(ORIGIN, FILL_ALPHA).fillRect(-w / 2, -h / 2, w, h);
    g.lineStyle(LINE_M, ORIGIN, 0.95);
    dashedRect(g, w, h, DASH_M);
    g.setPosition((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2).setVisible(true);
  }

  destroy(): void {
    this.origin.destroy();
    for (const g of this.boxes) g.destroy();
    for (const s of this.spinners) s.destroy();
    this.boxes.length = 0;
    this.spinners.length = 0;
  }
}
