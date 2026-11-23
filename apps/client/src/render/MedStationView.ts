import * as Phaser from "phaser";
import { MAX_PLAYERS, type Balance, type Building, type World } from "@topdown/shared";
import { ATLAS_FX, FX_GLOW } from "./city/spriteAtlas";
import { MED_PANEL_X_M, MED_PANEL_Y_M } from "./city/propArt";
import { barricadeTransform, framePointToWorld, type SpriteTransform } from "./barricadeLook";
import { MED_RING_ALPHA, MED_RING_BAND_ALPHA, MED_RING_BAND_COLOR, MED_RING_BAND_PX, MED_RING_COLOR, MED_RING_FILL_ALPHA, MED_RING_FILL_COLOR, medRingRadiusM, medRingWidthM } from "./medRing";

/** Under bodies and the buildings' sprites (3), above the street and blood (fire ring pattern). */
const RING_DEPTH = 2.9;
/** The LED panel's glow: just above the building sprite, under bodies (5). */
const PANEL_GLOW_DEPTH = 3.6;
const PANEL_GLOW_COLOR = 0x5aff8c;
const PANEL_GLOW_M = 0.9;
const PANEL_GLOW_ALPHA = 0.55;

/**
 * Story 5.10 (AC 10, 11): every med station's soft green ring at exactly the heal radius (`medRing`):
 * your body touches the ring = you heal. One Graphics, redrawn only when the building list or the
 * camera zoom changes (4.8 `fireRing` pattern; ~2 px line at any zoom). MS10's green LED panel gets a
 * small pooled ADD glow (≤ every player's whole allowance; positioned on a list change only, nothing
 * per frame). The case stack itself is the atlas sprite drawn by `BuildingView` (`prop_medstation_a`).
 */
export class MedStationView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly xf: SpriteTransform = { x: 0, y: 0, angle: 0, w: 0, h: 0 };
  private readonly at = { x: 0, y: 0 };
  private shownVersion = -1;
  private shownZoom = -1;

  constructor(scene: Phaser.Scene, balance?: Readonly<Balance>) {
    this.g = scene.add.graphics().setDepth(RING_DEPTH);
    const pool = Math.max(1, (balance?.buildings.maxPerPlayer ?? 6) * MAX_PLAYERS);
    for (let i = 0; i < pool; i++) {
      this.glows.push(scene.add.image(0, 0, ATLAS_FX, FX_GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(PANEL_GLOW_COLOR).setDisplaySize(PANEL_GLOW_M, PANEL_GLOW_M).setAlpha(PANEL_GLOW_ALPHA).setDepth(PANEL_GLOW_DEPTH).setVisible(false));
    }
  }

  update(world: Readonly<World>, zoom: number): void {
    if (world.buildings.version === this.shownVersion && zoom === this.shownZoom) return;
    this.shownVersion = world.buildings.version;
    this.shownZoom = zoom;
    const g = this.g;
    g.clear();
    const types = world.balance.buildings.types;
    const list = world.buildings.list;
    const px = 1 / Math.max(1e-6, zoom);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      const heal = Object.prototype.hasOwnProperty.call(types, b.type) ? types[b.type]?.heal : undefined;
      if (!heal) continue;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const r = medRingRadiusM(heal.radiusM);
      g.fillStyle(MED_RING_FILL_COLOR, MED_RING_FILL_ALPHA).fillCircle(cx, cy, r);
      g.lineStyle(MED_RING_BAND_PX * px, MED_RING_BAND_COLOR, MED_RING_BAND_ALPHA).strokeCircle(cx, cy, r - (MED_RING_BAND_PX / 2) * px);
      g.lineStyle(medRingWidthM(zoom), MED_RING_COLOR, MED_RING_ALPHA).strokeCircle(cx, cy, r - px);
      const glow = this.glows[n];
      if (glow) {
        framePointToWorld(barricadeTransform(b, this.xf), MED_PANEL_X_M, MED_PANEL_Y_M, this.at);
        glow.setPosition(this.at.x, this.at.y).setVisible(true);
        n++;
      }
    }
    for (let i = n; i < this.glows.length; i++) {
      const glow = this.glows[i] as Phaser.GameObjects.Image;
      if (glow.visible) glow.setVisible(false);
    }
  }

  destroy(): void {
    this.g.destroy();
    for (const i of this.glows) i.destroy();
    this.glows.length = 0;
  }
}
