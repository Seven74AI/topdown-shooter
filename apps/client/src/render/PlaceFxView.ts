import * as Phaser from "phaser";
import { buildingStats, footprint, type Box, type World } from "@topdown/shared";
import { DustPool, TabPool, DOT_RADIUS_M } from "./placeFxPools";
import { DOT_INSET_M, DOT_OUTLINE_M, DUST_COLOR, TAB_ARM_M, TAB_THICK_M, ownerColor } from "./placeFeel";
import { SLOT_COLORS } from "./playerColors";

/** Above the buildings (3) and their cracks (3.05), below zombies (5) and players (10). */
const DOTS_DEPTH = 3.2;
const TABS_DEPTH = 3.25;
/** Dust is over the buildings it rises from, still below bodies. */
const DUST_DEPTH = 3.3;
const DOT_OUTLINE = 0x111111;
const TAB_OUTLINE = 0x111111;
const TAB_OUTLINE_M = 0.02;

/**
 * Story 5.23 (BX-9; AC 2, 4, 5): the placement feel in the world — dust puffs, the 3 s owner corner
 * tabs (and the art drops `BuildingView` reads through `dropOf`), and the build phase's owner dots.
 * One Graphics each: dust and tabs are redrawn only while something lives; the dots only when the
 * building list, the phase or the player count changes. Pools sized from `controls.json › fx`
 * (brief line 12); no allocation per frame; no texture (brief 20).
 */
export class PlaceFxView {
  private readonly dust: DustPool;
  readonly tabs: TabPool;
  private readonly dustG: Phaser.GameObjects.Graphics;
  private readonly tabG: Phaser.GameObjects.Graphics;
  private readonly dotG: Phaser.GameObjects.Graphics;
  private dustDrawn = false;
  private tabsDrawn = false;
  private dotsKey = Number.NaN;
  private readonly box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(
    scene: Phaser.Scene,
    maxDust: number,
    maxTabs: number,
    /** The owner's 2.9 slot (−1 = left the run: a grey mark). */
    private readonly slotOf: (ownerId: string) => number,
  ) {
    this.dust = new DustPool(maxDust);
    this.tabs = new TabPool(maxTabs);
    this.dotG = scene.add.graphics().setDepth(DOTS_DEPTH).setVisible(false);
    this.tabG = scene.add.graphics().setDepth(TABS_DEPTH);
    this.dustG = scene.add.graphics().setDepth(DUST_DEPTH);
  }

  /**
   * A `building.placed` (mine or a teammate's): its tab (for what is left of 3 s, `ageMs` old) and,
   * when `fresh` (AC 6), its dust and drop. Returns false for an unknown type.
   */
  placed(world: Readonly<World>, id: number, type: string, ownerId: string, gx: number, gy: number, rot: number, nowMs: number, ageMs: number, fresh: boolean): boolean {
    const stats = buildingStats(world.balance, type);
    if (!stats) return false;
    const b = footprint(stats, gx, gy, (rot & 3) as 0 | 1 | 2 | 3, this.box);
    if (fresh) this.dust.puff(b.minX, b.minY, b.maxX, b.maxY, id);
    if (world.run.phase !== "wave") this.tabs.add(id, b.minX, b.minY, ownerColor(this.slotOf(ownerId), SLOT_COLORS), nowMs, ageMs, fresh);
    return true;
  }

  /** The art's drop offset (m) for building `id` now (`BuildingView`). */
  dropOf(id: number, nowMs: number): number {
    return this.tabs.dropOf(id, nowMs);
  }

  dropping(nowMs: number): boolean {
    return this.tabs.dropping(nowMs);
  }

  /** Once per frame: `dtS` (0 while solo is paused), the scene clock, the World as drawn. */
  update(world: Readonly<World>, dtS: number, nowMs: number): void {
    const wave = world.run.phase === "wave";
    if (wave) this.tabs.clear(); // AC 4: hidden during waves (a tab running at the wave start is cleared)
    this.drawDust(dtS);
    this.drawTabs(nowMs);
    this.drawDots(world, !wave && world.run.phase === "build");
  }

  private drawDust(dtS: number): void {
    const d = this.dust;
    const live = d.step(dtS);
    if (live === 0) {
      if (this.dustDrawn) {
        this.dustG.clear();
        this.dustDrawn = false;
      }
      return;
    }
    const g = this.dustG.clear();
    for (let i = 0; i < d.cap; i++) {
      const a = d.alpha(i);
      if (a <= 0) continue;
      g.fillStyle(DUST_COLOR, a).fillCircle(d.x[i] as number, d.y[i] as number, d.size(i));
    }
    this.dustDrawn = true;
  }

  private drawTabs(nowMs: number): void {
    const t = this.tabs;
    const n = t.prune(nowMs);
    if (n === 0) {
      if (this.tabsDrawn) {
        this.tabG.clear();
        this.tabsDrawn = false;
      }
      return;
    }
    const g = this.tabG.clear();
    for (let i = 0; i < t.cap; i++) {
      const a = t.alphaOf(i, nowMs);
      if (a <= 0) continue;
      const x = t.minX[i] as number;
      const y = t.minY[i] as number;
      // the L on the min corner: one arm along x, one down y, on the footprint's edge
      g.fillStyle(TAB_OUTLINE, a * 0.8);
      g.fillRect(x - TAB_OUTLINE_M, y - TAB_OUTLINE_M, TAB_ARM_M + 2 * TAB_OUTLINE_M, TAB_THICK_M + 2 * TAB_OUTLINE_M);
      g.fillRect(x - TAB_OUTLINE_M, y - TAB_OUTLINE_M, TAB_THICK_M + 2 * TAB_OUTLINE_M, TAB_ARM_M + 2 * TAB_OUTLINE_M);
      g.fillStyle(t.color[i] as number, a);
      g.fillRect(x, y, TAB_ARM_M, TAB_THICK_M);
      g.fillRect(x, y, TAB_THICK_M, TAB_ARM_M);
    }
    this.tabsDrawn = true;
  }

  /** AC 4: every building's owner dot in a build phase; redrawn only when the list, the phase or the players change. */
  private drawDots(world: Readonly<World>, show: boolean): void {
    const key = show ? world.buildings.version * 8 + world.players.size : -1;
    if (key === this.dotsKey) return;
    this.dotsKey = key;
    const g = this.dotG.clear();
    if (!show) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const list = world.buildings.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b) continue;
      const slot = world.players.has(b.ownerId) ? this.slotOf(b.ownerId) : -1;
      const inset = Math.min(DOT_INSET_M, (b.maxX - b.minX) / 2, (b.maxY - b.minY) / 2);
      const cx = b.minX + inset;
      const cy = b.minY + inset;
      g.fillStyle(DOT_OUTLINE, 0.9).fillCircle(cx, cy, DOT_RADIUS_M + DOT_OUTLINE_M);
      g.fillStyle(ownerColor(slot, SLOT_COLORS), 1).fillCircle(cx, cy, DOT_RADIUS_M);
    }
  }

  /** A new run / scene restart. */
  reset(): void {
    this.dust.clear();
    this.tabs.clear();
    this.dotsKey = Number.NaN;
  }

  destroy(): void {
    this.dustG.destroy();
    this.tabG.destroy();
    this.dotG.destroy();
  }
}
