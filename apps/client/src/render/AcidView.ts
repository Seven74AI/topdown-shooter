import * as Phaser from "phaser";
import { ATLAS_FX, FX_ACID_PUDDLES, FX_GLOW, FX_SPIT_GLOB, ensureAtlases } from "./city/spriteAtlas";
import { acidRingRadiusM, type AcidFx } from "./acidFx";
import { aboveDarkness } from "./darkness/aboveDark";

/** Puddles lie on the street (above blood trails and fire rings, below bodies); globs fly above everyone. */
const PUDDLE_DEPTH = 1.55;
const GLOB_DEPTH = 11.5;
const GLOB_SHADOW_DEPTH = 1.56;
/** The glob's drawn size (m) and how much bigger it looks at the top of its lob (cosmetic arc; the sim path is straight). */
const GLOB_M = 0.45;
const LOB_GROW = 0.7;
/** The lob lifts the glob this far "up the screen" at mid-flight (m): a lobbed look over barricades. */
const LOB_LIFT_M = 0.35;
const SHADOW_M = 0.28;
const SHADOW_ALPHA = 0.35;
/** A puddle fades in this fast and out over its last part (s). */
const PUDDLE_FADE_IN_S = 0.12;
const PUDDLE_FADE_OUT_S = 0.6;

/**
 * Story 5.6: draws the cosmetic spits and puddles of an `AcidFx` (pooled images sized by the caps,
 * created once: one glob + shadow per spit slot, one puddle per puddle slot). Position,
 * alpha and size only per frame: no allocation.
 */
export class AcidView {
  private readonly globs: Phaser.GameObjects.Image[] = [];
  private readonly shadows: Phaser.GameObjects.Image[] = [];
  private readonly puddles: Phaser.GameObjects.Image[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly fx: AcidFx,
    private readonly puddleRadiusM: number,
  ) {
    ensureAtlases(scene);
    for (let i = 0; i < fx.maxGlobs; i++) {
      this.globs.push(scene.add.image(0, 0, ATLAS_FX, FX_SPIT_GLOB).setDepth(GLOB_DEPTH).setVisible(false));
      this.shadows.push(scene.add.image(0, 0, ATLAS_FX, FX_GLOW).setTint(0x000000).setAlpha(SHADOW_ALPHA).setDisplaySize(SHADOW_M, SHADOW_M).setDepth(GLOB_SHADOW_DEPTH).setVisible(false));
    }
    const d = 2 * acidRingRadiusM(puddleRadiusM);
    for (let i = 0; i < fx.maxPuddles; i++) {
      this.puddles.push(scene.add.image(0, 0, ATLAS_FX, FX_ACID_PUDDLES[i % FX_ACID_PUDDLES.length] as string).setDisplaySize(d, d).setDepth(PUDDLE_DEPTH).setVisible(false));
      // Story 6.3 (designer B3): the same puddle above the darkness at `darkGhost` strength (blackout only).
      this.ghosts.push(aboveDarkness(scene.add.image(0, 0, ATLAS_FX, FX_ACID_PUDDLES[i % FX_ACID_PUDDLES.length] as string).setDisplaySize(d, d).setVisible(false), "hazard"));
    }
  }

  /** Story 6.3 (B3): puddle ghosts above the darkness — 0 = none (no blackout), else their share of the puddle's alpha (0.1). */
  darkGhost = 0;
  private readonly ghosts: Phaser.GameObjects.Image[] = [];

  update(nowS: number): void {
    const fx = this.fx;
    fx.update(nowS);
    for (let i = 0; i < fx.maxGlobs; i++) {
      const g = this.globs[i] as Phaser.GameObjects.Image;
      const sh = this.shadows[i] as Phaser.GameObjects.Image;
      if (fx.globId[i] === -1) {
        if (g.visible) {
          g.setVisible(false);
          sh.setVisible(false);
        }
        continue;
      }
      const f = fx.globProgress(i, nowS);
      const x = (fx.globX0[i] as number) + ((fx.globX1[i] as number) - (fx.globX0[i] as number)) * f;
      const y = (fx.globY0[i] as number) + ((fx.globY1[i] as number) - (fx.globY0[i] as number)) * f;
      const arc = 4 * f * (1 - f);
      const s = GLOB_M * (1 + LOB_GROW * arc);
      const dir = Math.atan2((fx.globY1[i] as number) - (fx.globY0[i] as number), (fx.globX1[i] as number) - (fx.globX0[i] as number));
      g.setPosition(x, y - LOB_LIFT_M * arc).setDisplaySize(s, s).setRotation(dir).setVisible(true);
      sh.setPosition(x, y).setVisible(true);
    }
    for (let i = 0; i < fx.maxPuddles; i++) {
      const p = this.puddles[i] as Phaser.GameObjects.Image;
      const gh = this.ghosts[i] as Phaser.GameObjects.Image;
      if (fx.puddleId[i] === -1) {
        if (p.visible) p.setVisible(false);
        if (gh.visible) gh.setVisible(false);
        continue;
      }
      const age = nowS - (fx.puddleStartS[i] as number);
      const a = Math.min(1, age / PUDDLE_FADE_IN_S, (fx.puddleS - age) / PUDDLE_FADE_OUT_S + 0.35);
      const id = fx.puddleId[i] as number;
      // The ring stays at full size (it is the damage edge); only alpha moves. No extra glow quad: the
      // frame carries its own halo (32 big ADD quads were fill-bound on the CPU rasterizer).
      p.setPosition(fx.puddleX[i] as number, fx.puddleY[i] as number).setRotation(id * 1.3).setAlpha(Math.max(0, a)).setVisible(true);
      if (this.darkGhost > 0) gh.setPosition(p.x, p.y).setRotation(p.rotation).setAlpha(Math.max(0, a) * this.darkGhost).setVisible(true);
      else if (gh.visible) gh.setVisible(false);
    }
  }

  destroy(): void {
    for (const g of this.ghosts) g.destroy();
    for (const img of [...this.globs, ...this.shadows, ...this.puddles]) img.destroy();
    this.globs.length = 0;
    this.shadows.length = 0;
    this.puddles.length = 0;
  }
}
