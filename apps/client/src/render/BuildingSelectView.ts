import type * as Phaser from "phaser";
import { buildingById, type World } from "@topdown/shared";

/** Story 3.7: the selected building's outline (world metres): white, a little outside the footprint. */
const SELECT_COLOR = 0xffffff;
const SELECT_LINE_M = 0.08;
const SELECT_PAD_M = 0.12;
/** Above buildings (3), below zombies (≥ 5). */
const SELECT_DEPTH = 4;

/** Story 3.7: outlines the building the repair panel is open for; redrawn only when the selection changes. */
export class BuildingSelectView {
  private readonly g: Phaser.GameObjects.Graphics;
  private shownId = 0;
  private shownVersion = -1;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(SELECT_DEPTH).setVisible(false);
  }

  /** `id` 0 = nothing selected. */
  update(world: Readonly<World>, id: number): void {
    if (id === this.shownId && world.buildings.version === this.shownVersion) return;
    this.shownId = id;
    this.shownVersion = world.buildings.version;
    const b = id !== 0 ? buildingById(world, id) : undefined;
    if (!b) {
      this.g.clear().setVisible(false);
      return;
    }
    const p = SELECT_PAD_M;
    this.g
      .clear()
      .lineStyle(SELECT_LINE_M, SELECT_COLOR, 0.95)
      .strokeRect(b.minX - p, b.minY - p, b.maxX - b.minX + 2 * p, b.maxY - b.minY + 2 * p)
      .setVisible(true);
  }

  destroy(): void {
    this.g.destroy();
  }
}
