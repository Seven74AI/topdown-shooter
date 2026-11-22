import type * as Phaser from "phaser";
import type { DistrictMap, MapBox, World } from "@topdown/shared";

/**
 * Story 4.5 `DecayView` (architecture › Decay Stage Engine): everything on the ground that depends on
 * the decay stage, placeholder look (Story 4.9 does the Dead City one):
 *
 * - the visible stage group: `stage1_evening` is the base (drawn by `StreetView`); for stage N ≥ 2
 *   the `stageN_*` group's props are drawn over it, swapped when the stage changes;
 * - hazard zones active at the stage (faint) and the fire records of `ignite` mutations (a ring);
 * - the walls (`world.obstacles.walls`: map collision boxes not removed + `block` mutations), the bus
 *   in its own colour (4.2 review L2: a stage that removes the bus removes its drawing too).
 *
 * Redrawn only when `obstacles.version` changes (one compare per frame), so a stage applied from a
 * late patch (hidden tab, late scene start) is drawn as soon as the World has it.
 */
const SOLID = 0x3b3f46;
const SOLID_EDGE = 0x15171a;
const BUS = 0x8a6a1e;
const BUS_EDGE = 0x3a2c0a;
const BLOCK = 0x4a4136;
const BLOCK_EDGE = 0x1e1a15;
const HAZARD = 0x7a2a1a;
const FIRE = 0xd2562a;
const EDGE_M = 0.12;
const FIRE_RING_M = 0.12;
/** Stage props (`stageN_*` groups) by kind; unknown kinds get the debris look. */
const PROP_FILL: Readonly<Record<string, readonly [number, number]>> = {
  debris: [0x5b5146, 0.9],
};
const DEFAULT_PROP: readonly [number, number] = [0x5b5146, 0.9];
/** Above the street (0), below the cover (1). */
const DECAY_DEPTH = 0.5;

const fill = (g: Phaser.GameObjects.Graphics, b: MapBox): void => {
  g.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
};
const stroke = (g: Phaser.GameObjects.Graphics, b: MapBox, w: number): void => {
  g.strokeRect(b.minX + w / 2, b.minY + w / 2, b.maxX - b.minX - w, b.maxY - b.minY - w);
};

export class DecayView {
  private readonly g: Phaser.GameObjects.Graphics;
  private shownVersion = -1;
  private shownWorld: World | null = null;
  /** The stage drawn (tests and browser checks read it through the scene). */
  shownStage = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DECAY_DEPTH);
  }

  update(world: World): void {
    const o = world.obstacles;
    if (o.version === this.shownVersion && world === this.shownWorld) return;
    this.shownVersion = o.version;
    this.shownWorld = world;
    this.shownStage = world.decay.stage;
    this.draw(world.map, world);
  }

  destroy(): void {
    this.g.destroy();
  }

  private draw(map: DistrictMap, world: World): void {
    const g = this.g;
    const stage = world.decay.stage;
    g.clear();
    // The visible stage group (N ≥ 2) over the stage-1 base.
    if (stage >= 2) {
      for (const p of map.stages[stage - 1] ?? []) {
        const [color, alpha] = PROP_FILL[p.kind] ?? DEFAULT_PROP;
        g.fillStyle(color, alpha);
        fill(g, p);
      }
    }
    g.fillStyle(HAZARD, 0.12);
    for (const h of map.hazards) if (h.minStage <= stage) fill(g, h);
    const blocks = new Set<string>();
    for (const m of map.decay) if (m.action === "block") blocks.add(m.name);
    const bus = new Set<string>();
    for (const c of map.cover) if (c.kind === "bus") bus.add(`${c.minX},${c.minY},${c.maxX},${c.maxY}`);
    for (const s of world.obstacles.walls) {
      const isBus = bus.has(`${s.minX},${s.minY},${s.maxX},${s.maxY}`);
      const isBlock = blocks.has(s.name);
      g.fillStyle(isBus ? BUS : isBlock ? BLOCK : SOLID, 1);
      fill(g, s);
      g.lineStyle(EDGE_M, isBus ? BUS_EDGE : isBlock ? BLOCK_EDGE : SOLID_EDGE, 1);
      stroke(g, s, EDGE_M);
    }
    for (const f of world.decay.fires) {
      g.fillStyle(FIRE, 0.18).fillCircle(f.x, f.y, f.radiusM);
      g.lineStyle(FIRE_RING_M, FIRE, 0.9).strokeCircle(f.x, f.y, f.radiusM);
    }
  }
}
