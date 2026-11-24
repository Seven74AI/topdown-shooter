import * as Phaser from "phaser";
import { MAX_PLAYERS, buildingStats, buildingTypeIds, footprint, type Box, type World } from "@topdown/shared";
import type { TeammateGhosts } from "../net/teammateGhosts";
import type { HudModel } from "../scenes/hudModel";
import { dashedRect } from "./dashes";
import { ghostLabel, glideGhost, hideGhostGlide, newGhostGlide, type GhostGlide } from "./ghostGlide";
import { SLOT_COLORS } from "./playerColors";

/**
 * Story 5.24 (AC 5, 6; D7): teammates' ghosts in the world. Each live teammate ghost is a dashed
 * outline of its footprint in the sender's ring colour at 50 % alpha with a faint fill, never red /
 * green (F7c); its label ("Bo · Auto-turret") goes to the HUD model (the HUD scene draws it).
 * Hidden at once outside a build phase (F7b: the store is cleared). Graphics only (no texture,
 * brief 20); redrawn only when the footprint or colour changes; no allocation per frame.
 */
const LINE_M = 0.06;
const DASH_M = 0.25;
const ALPHA = 0.5;
const FILL_ALPHA = 0.08;
/** Under my placement preview (13) and my pending / move boxes (12.8). */
const GHOST_DEPTH = 12.7;
/** The label's bottom edge above the footprint's top edge (m). */
const LABEL_LIFT_M = 0.25;

export class TeammateGhostView {
  private readonly gfx: Phaser.GameObjects.Graphics[] = [];
  private readonly glide: GhostGlide[] = [];
  /** The drawn outline's key per slot (w × h × colour), −1 = none drawn yet. */
  private readonly drawnKey = new Float64Array(MAX_PLAYERS).fill(-1);
  /** The label's source per slot (name + type), so the text is rebuilt only on a change. */
  private readonly labelName: string[] = new Array<string>(MAX_PLAYERS).fill("");
  private readonly labelType = new Int16Array(MAX_PLAYERS).fill(-1);
  private readonly box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      this.gfx.push(scene.add.graphics().setDepth(GHOST_DEPTH).setVisible(false));
      this.glide.push(newGhostGlide());
    }
  }

  /** `localSlot`: mine (never drawn); `nameOf(slot)`: the sender's display name. */
  update(world: Readonly<World>, ghosts: TeammateGhosts | null, localSlot: number, nameOf: (slot: number) => string, dtMs: number, m: HudModel): void {
    const build = world.run.phase === "build";
    if (ghosts && !build) ghosts.clearAll(); // F7b: never outside a build phase
    const ids = buildingTypeIds(world.balance);
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      const g = this.gfx[slot] as Phaser.GameObjects.Graphics;
      const glide = this.glide[slot] as GhostGlide;
      const e = ghosts && build && slot !== localSlot ? ghosts.live(slot) : null;
      const type = e ? ids[e.typeIdx] : undefined;
      const stats = type !== undefined ? buildingStats(world.balance, type) : undefined;
      if (!e || !stats) {
        if (g.visible) g.setVisible(false);
        hideGhostGlide(glide);
        m.ghostLabelShown[slot] = 0;
        continue;
      }
      const b = footprint(stats, e.gx, e.gy, e.rot, this.box);
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      glideGhost(glide, e.typeIdx, e.rot, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, dtMs);
      const color = SLOT_COLORS[slot] ?? SLOT_COLORS[0];
      const key = (w * 1000 + h) * 16 + slot;
      if (this.drawnKey[slot] !== key) {
        this.drawnKey[slot] = key;
        g.clear();
        g.fillStyle(color, FILL_ALPHA).fillRect(-w / 2, -h / 2, w, h);
        g.lineStyle(LINE_M, color, 1);
        dashedRect(g, w, h, DASH_M);
      }
      g.setPosition(glide.x, glide.y).setAlpha(ALPHA).setVisible(true);
      const name = nameOf(slot);
      if (this.labelName[slot] !== name || this.labelType[slot] !== e.typeIdx) {
        this.labelName[slot] = name;
        this.labelType[slot] = e.typeIdx;
        m.ghostLabelText[slot] = ghostLabel(name, stats.name);
      }
      m.ghostLabelAt[slot * 2] = glide.x;
      m.ghostLabelAt[slot * 2 + 1] = glide.y - h / 2 - LABEL_LIFT_M;
      m.ghostLabelShown[slot] = 1;
    }
  }

  destroy(): void {
    for (const g of this.gfx) g.destroy();
    this.gfx.length = 0;
  }
}
