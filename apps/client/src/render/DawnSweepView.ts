import * as Phaser from "phaser";
import { DAWN_EDGE_M } from "./cameraDirector";

/** With the city's own lights (`CityView` 4.32), under every zombie and survivor: the horde stands dark against the lit street. */
export const DAWN_DEPTH = 4.31;
/** DW1's sunrise colours (`ui/overlay.css › .dawn--dw1`): warm orange, the line's pink-gold. */
const DAWN_WARM = 0xffaa5a;
const DAWN_LINE = 0xffc89a;
/** Strengths (ADD): the lit district east of the line, the line's peak. */
const LIT_ALPHA = 0.3;
const LINE_ALPHA = 0.55;
/** The bright line's own width (m), east of its soft leading edge (`DAWN_EDGE_M`). */
const LINE_M = 1.2;

/**
 * Story 12.3 (AC 6): the dawn during the fly-out — a line of warm light sweeping west across the map from the east
 * edge (the side the helicopter flies to), the district behind it lit warm. Visual only: nothing in the World changes.
 * One Graphics drawn once (soft leading edge, the line, the lit side), then moved and faded each frame (`dawnX` /
 * `dawnAlpha` from the camera director). Additive, on the street (`DAWN_DEPTH`): the zombies stay dark silhouettes on it.
 */
export class DawnSweepView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, mapW: number, mapH: number) {
    const g = scene.add.graphics().setDepth(DAWN_DEPTH).setVisible(false);
    g.setBlendMode(Phaser.BlendModes.ADD);
    const y0 = -DAWN_EDGE_M;
    const h = mapH + 2 * DAWN_EDGE_M;
    const litW = mapW + 2 * DAWN_EDGE_M; // wide enough to cover every metre east of the line
    // Soft leading edge (west of the line): nothing → the line's peak.
    g.fillGradientStyle(DAWN_LINE, DAWN_LINE, DAWN_LINE, DAWN_LINE, 0, LINE_ALPHA, 0, LINE_ALPHA);
    g.fillRect(-DAWN_EDGE_M, y0, DAWN_EDGE_M, h);
    // The line, then down to the lit district.
    g.fillGradientStyle(DAWN_LINE, DAWN_WARM, DAWN_LINE, DAWN_WARM, LINE_ALPHA, LIT_ALPHA, LINE_ALPHA, LIT_ALPHA);
    g.fillRect(0, y0, LINE_M, h);
    g.fillStyle(DAWN_WARM, LIT_ALPHA);
    g.fillRect(LINE_M, y0, litW, h);
    this.g = g;
  }

  /** `x` = the line (m; NaN = no dawn), `alpha` 0…1. */
  update(x: number, alpha: number): void {
    const on = !Number.isNaN(x) && alpha > 0;
    if (this.g.visible !== on) this.g.setVisible(on);
    if (on) this.g.setPosition(x, 0).setAlpha(alpha);
  }

  get visible(): boolean {
    return this.g.visible;
  }

  destroy(): void {
    this.g.destroy();
  }
}
