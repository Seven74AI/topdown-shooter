import * as Phaser from "phaser";
import { lightRadiusOf, lightsOf, type Balance, type World } from "@topdown/shared";
import { ATLAS_FX, FX_FLOOD_POOL } from "./city/spriteAtlas";
import { nightAt } from "./city/palette";
import { pickDrawnLights } from "./floodlightLook";

/** Story 5.10: CityView's dynamic-light layer (above the baked city and its lightmap, under bodies). */
export const FLOOD_LIGHT_DEPTH = 4.32;
/** Warm white (looks.html FL1: "255,238,205"). */
export const FLOOD_LIGHT_COLOR = 0xffeecd;

/**
 * Story 5.10 (AC 11, D4): the floodlights' light pools. One pooled ADD-blended pool image
 * (`FX_FLOOD_POOL`, the FX atlas's glow family: the FL1 card's flat 4 m disc) per floodlight in view
 * (+ `controls.fx.floodLightViewMarginM`), at most `controls.fx.maxFloodLights` drawn (nearest the
 * camera centre; lamps within `floodLightMergeM` of a drawn one share its pool: `pickDrawnLights`),
 * display size 2 × the light radius (Story 6.3: `lightRadiusOf`, the blackout radius in a blackout), strength
 * `NightLight.floodA` of the decay stage. Positions come from the DERIVED `world.lights` (every copy
 * agrees). No re-bake of the city or its lightmap, no render texture, no full-screen layer; per
 * frame only position/size/alpha of ≤ 8 images (no allocation). The lamp itself is the FL1 sprite
 * (`BuildingView`, atlas frame `prop_floodlight_a`).
 */
export class FloodlightView {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly picked: Int32Array;
  private readonly dist2: Float64Array;
  private readonly marginM: number;
  private readonly mergeM: number;
  private shown = 0;

  constructor(scene: Phaser.Scene, balance: Readonly<Balance>) {
    const max = balance.controls.fx.maxFloodLights;
    this.marginM = balance.controls.fx.floodLightViewMarginM;
    this.mergeM = balance.controls.fx.floodLightMergeM;
    this.picked = new Int32Array(max);
    this.dist2 = new Float64Array(max);
    for (let i = 0; i < max; i++) {
      this.pool.push(scene.add.image(0, 0, ATLAS_FX, FX_FLOOD_POOL).setBlendMode(Phaser.BlendModes.ADD).setTint(FLOOD_LIGHT_COLOR).setDepth(FLOOD_LIGHT_DEPTH).setVisible(false));
    }
  }

  /** Lights drawn this frame (tests and the perf overlay). */
  get drawn(): number {
    return this.shown;
  }

  update(world: World, viewX: number, viewY: number, viewW: number, viewH: number): void {
    const lights = lightsOf(world);
    const n = pickDrawnLights(lights, viewX, viewY, viewW, viewH, this.marginM, this.pool.length, this.picked, this.dist2, this.mergeM);
    const a = nightAt(world.decay.stage).floodA;
    for (let i = 0; i < n; i++) {
      const l = lights[this.picked[i] as number];
      const img = this.pool[i] as Phaser.GameObjects.Image;
      if (!l) continue;
      const size = 2 * lightRadiusOf(world, l); // Story 6.3 (F7, AC 10): 6 m in a blackout (12 m across)
      if (img.x !== l.x || img.y !== l.y) img.setPosition(l.x, l.y);
      if (img.displayWidth !== size) img.setDisplaySize(size, size);
      if (img.alpha !== a) img.setAlpha(a);
      if (!img.visible) img.setVisible(true);
    }
    for (let i = n; i < this.shown; i++) (this.pool[i] as Phaser.GameObjects.Image).setVisible(false);
    this.shown = n;
  }

  destroy(): void {
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
  }
}
