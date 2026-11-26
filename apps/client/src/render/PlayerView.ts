import { protectBlinkAlpha } from "./protectBlink";
import { RING_ALPHA, RING_GAP_M, RING_WIDTH_M } from "./playerRing";
import * as Phaser from "phaser";
import type { PlayerState } from "@topdown/shared";
import { SLOT_COLORS } from "./playerColors";
import { pulseAlpha, pulseScale } from "./pulse";
import { ATLAS_CHARACTERS, SURVIVOR_FRAME, SURVIVOR_GUN_PLAIN, ensureAtlases, survivorFrameFor, survivorGunFrameFor, weaponHidesPack } from "./city/spriteAtlas";
import { LOOK_FRAME_NOPACK, LOOK_FRAME_PACK, LOOK_SHEEN_FRAMES } from "./SurvivorLookTextures";
import { charFx, ensureCharacterSheets, needSheet, gunSheetOf, layerNames } from "./city/charactersAtlas";
import { sheenStep } from "./city/charRelight";
import { SURV_ANIM, SURV_SAW_ANIM, breath, glowPulse, phaseOffset, sway } from "./charAnim";
import { CHAR_EXTENT_R } from "./city/spriteArt";
import { ABOVE_DARK } from "./darkness/aboveDark";
import type { AnimatedLayerId } from "@topdown/shared";
import { SURVIVOR_LAYERS, layerPose, type LayerPose } from "./city/survivorLayers";
import type { SurvivorLayerPool } from "./SurvivorLayerPool";

/** Story 4.9: the survivor sprite (`survivor_body_a`), tinted for states (MULTIPLY). */
const BODY_TINT = 0xffffff;
/** Story 2.8: a downed survivor is drawn darker; an out one is hidden. */
const DOWNED_TINT = 0x6a6e74;
/** Story 3.9: a slowed survivor (Crawler bite) is drawn a sickly green while it lasts. */
const SLOWED_TINT = 0xa9cf8a;
/** Story 2.9: ground ring in the slot colour (FR55, NFR11), in metres (Story 7.10: `playerRing.ts`, shared with the editor). */
/** Under the body (10) and Story 2.8's revive ring (9), above the street, blood, zombies and shots. */
const RING_DEPTH = 8.5;
/** Story 5.4: the friendly-fire ring flash (fire orange, brighter than the orange slot colour). */
const FF_FLASH_COLOR = 0xffb020;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Story 5.10 (D6): the heal cue, a small green "+" beside the body (m). */
const HEAL_PLUS_COLOR = 0x8dff9a;
const HEAL_PLUS_M = 0.32;
const HEAL_PLUS_BAR_M = 0.1;
const HEAL_PLUS_DEPTH = 11;
/** Story 6.3 (D6, F5): in a blackout the survivor's body (and "+") sit in the teammate slot above the darkness, the ring just under it. */
export const BODY_DEPTH = 10;
export const DARK_BODY_DEPTH = ABOVE_DARK.teammate;
export const DARK_RING_DEPTH = ABOVE_DARK.teammate - 0.001;
export const DARK_PLUS_DEPTH = ABOVE_DARK.teammate + 0.001;
/** Story 7.8: an animated part layer (the propeller) sits just above the body. */
const LAYER_DEPTH_STEP = 0.0005;
/** Story 7.9 (D2): the held gun is its own image just under the body (above the ring and the revive ring). */
const GUN_DEPTH_STEP = 0.0005;
/** Story 9.13: the sheen over the body / the gun, and the gun's glow (additive), just above each. */
const SHEEN_DZ = 0.0002;
const GLOW_DZ = 0.0003;
/** take 4's page px per radius (the chainsaw shake is 1.2 of them). */
const PAGE_PX_PER_R = 68;
const shakeNoise = (n: number): number => {
  const h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  return (((h ^ (h >>> 15)) >>> 0) / 4294967296) - 0.5;
};

/** Survivor seen from above (Story 4.9 sprite, facing its aim) on a slot-coloured ground ring. Units are meters. */
export class PlayerView {
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly body: Phaser.GameObjects.Image;
  /** Story 7.9 (D2): the held gun (shared atlas frame), under the per-player body; hidden until `setBodyTexture`. */
  private readonly gun: Phaser.GameObjects.Image;
  /** Story 7.9: the per-player body texture (`SurvivorLookTextures`), or null = the 7.8 one-piece atlas frame. */
  private bodyKey: string | null = null;
  private shownGunFrame = SURVIVOR_GUN_PLAIN;
  private shownPack = true;
  /** Story 7.9: the look code this view was last set up for (GameScene: the animated layer follows it). */
  lookCode: string | null = null;
  x = 0;
  y = 0;
  /** Story 6.3 (DD5): the drawn facing (the flashlight cone follows it). */
  facingX = 1;
  facingY = 0;
  /** Story 6.3: drawn above the darkness (one depth change per blackout start/end, not per frame). */
  private aboveDark = false;
  private shownStatus: PlayerState["status"] | null = null;
  private shownSlowed = false;
  private slot = -1;
  /** Story 5.4: the ring shows the friendly-fire flash (orange) instead of the slot colour. */
  private flashing = false;
  /** Story 5.10: the heal cue ("+", drawn once, only moved and shown while healing). */
  private readonly plus: Phaser.GameObjects.Graphics;
  private healing = false;
  private readonly plusOffM: number;
  /** Story 5.3: the frame shown (the active weapon's survivor frame); changed only on a swap or buy. */
  private shownFrame = SURVIVOR_FRAME;
  /** Story 7.8: the animated part layer (one pooled sprite) and its pose, reused every frame. */
  private layer: { id: AnimatedLayerId; img: Phaser.GameObjects.Image; pool: SurvivorLayerPool } | null = null;
  private readonly layerAt: LayerPose = { x: 0, y: 0, rotation: 0 };
  private readonly radiusM: number;
  /** Story 9.13 (AC 2, 5): the relit layers: the body's sheen, the gun's sheen and the gun's glow (pilot flames). */
  private readonly bodySheen: Phaser.GameObjects.Image;
  private readonly gunSheen: Phaser.GameObjects.Image;
  private readonly gunGlow: Phaser.GameObjects.Image;
  private sheenKey: string | null = null;
  private readonly side: number;
  private readonly t0: number;
  private shakeN = 0;

  constructor(scene: Phaser.Scene, radiusM: number) {
    this.radiusM = radiusM;
    // A stroked Arc with no fill, created once and only moved (no Graphics redraw).
    this.ring = scene.add
      .circle(0, 0, radiusM + RING_GAP_M)
      .setStrokeStyle(RING_WIDTH_M, SLOT_COLORS[0], RING_ALPHA)
      .setDepth(RING_DEPTH);
    ensureAtlases(scene);
    ensureCharacterSheets(scene); // Story 9.13: the relit gun frames (plain until the bake lands)
    const side = 2 * radiusM * CHAR_EXTENT_R.survivor;
    this.side = side;
    this.t0 = phaseOffset(Math.floor(Math.random() * 97)); // each survivor breathes on its own beat (visual only)
    this.body = scene.add.image(0, 0, ATLAS_CHARACTERS, SURVIVOR_FRAME).setDisplaySize(side, side).setDepth(BODY_DEPTH);
    needSheet(gunSheetOf(SURVIVOR_GUN_PLAIN));
    this.gun = scene.add.image(0, 0, gunSheetOf(SURVIVOR_GUN_PLAIN), SURVIVOR_GUN_PLAIN).setDisplaySize(side, side).setDepth(BODY_DEPTH - GUN_DEPTH_STEP).setVisible(false);
    this.bodySheen = scene.add.image(0, 0, ATLAS_CHARACTERS, SURVIVOR_FRAME).setBlendMode(Phaser.BlendModes.ADD).setDepth(BODY_DEPTH + SHEEN_DZ).setVisible(false);
    this.gunSheen = scene.add.image(0, 0, gunSheetOf(SURVIVOR_GUN_PLAIN), SURVIVOR_GUN_PLAIN).setBlendMode(Phaser.BlendModes.ADD).setDepth(BODY_DEPTH - GUN_DEPTH_STEP + SHEEN_DZ).setVisible(false);
    this.gunGlow = scene.add.image(0, 0, gunSheetOf(SURVIVOR_GUN_PLAIN), SURVIVOR_GUN_PLAIN).setBlendMode(Phaser.BlendModes.ADD).setDepth(BODY_DEPTH + GLOW_DZ).setVisible(false);
    const h = HEAL_PLUS_M / 2;
    const t = HEAL_PLUS_BAR_M / 2;
    this.plus = scene.add.graphics().setDepth(HEAL_PLUS_DEPTH).setVisible(false);
    this.plus.fillStyle(0x0b1a10, 0.8).fillRect(-h - 0.03, -t - 0.03, 2 * h + 0.06, 2 * t + 0.06).fillRect(-t - 0.03, -h - 0.03, 2 * t + 0.06, 2 * h + 0.06);
    this.plus.fillStyle(HEAL_PLUS_COLOR, 1).fillRect(-h, -t, 2 * h, 2 * t).fillRect(-t, -h, 2 * t, 2 * h);
    this.plusOffM = radiusM + RING_GAP_M + h;
  }

  /**
   * Story 7.8: shows an animated part layer (e.g. the propeller cap's propeller) on this survivor, or none (null).
   * Takes one sprite from `pool` (gives back the old one); Story 7.9 calls this from the player's look.
   */
  setAnimatedLayer(pool: SurvivorLayerPool, id: AnimatedLayerId | null): void {
    if (this.layer?.id === id) return;
    if (this.layer) this.layer.pool.release(this.layer.id, this.layer.img);
    this.layer = null;
    if (id === null) return;
    const img = pool.acquire(id);
    if (!img) return;
    const side = 2 * SURVIVOR_LAYERS[id].extentR * this.radiusM;
    img.setDisplaySize(side, side).setDepth(this.body.depth + LAYER_DEPTH_STEP).setVisible(this.body.visible).setAlpha(this.shownBlink);
    this.layer = { id, img, pool };
    this.shownStatus = null; // Story 7.9 re-review RR1: the status tint reaches the new sprite at the next update
  }

  /**
   * Story 7.9 (AC 7): draw this survivor from its own body texture (`survivorlook_<id>`, frames pack / nopack) over
   * the shared gun frame. Called once per view (the texture is repainted in place on a look or stage change).
   */
  setBodyTexture(key: string): void {
    if (key === this.bodyKey) return;
    this.bodyKey = key;
    this.body.setTexture(key, this.shownPack ? LOOK_FRAME_PACK : LOOK_FRAME_NOPACK);
    this.gun.setTexture(gunSheetOf(this.shownGunFrame), this.shownGunFrame).setVisible(this.body.visible);
    this.shownStatus = null; // the tint and visibility are applied to both images at the next update
  }

  /** Story 9.13: the relit body's sheen texture (`SurvivorLookTextures.sheenOf`), or null: no sheen yet. */
  setBodySheen(key: string | null): void {
    if (key === this.sheenKey) return;
    this.sheenKey = key;
    if (key === null) this.bodySheen.setVisible(false);
    else this.bodySheen.setTexture(key, (LOOK_SHEEN_FRAMES[0] as readonly string[])[0] as string);
  }

  /** Story 9.13 (tests): the relit layers. */
  get relitLayers(): { readonly bodySheen: Phaser.GameObjects.Image; readonly gunSheen: Phaser.GameObjects.Image; readonly gunGlow: Phaser.GameObjects.Image } {
    return { bodySheen: this.bodySheen, gunSheen: this.gunSheen, gunGlow: this.gunGlow };
  }

  /** Story 7.9 (tests): the gun image. */
  get gunSprite(): Phaser.GameObjects.Image {
    return this.gun;
  }

  /** Story 7.9 (tests): the body image. */
  get bodySprite(): Phaser.GameObjects.Image {
    return this.body;
  }

  /** Story 7.8 (tests): the layer sprite now, or null. */
  /** Designer pick C: the body image (the silhouette behind a standing wall copies it). */
  get bodyImage(): Phaser.GameObjects.Image {
    return this.body;
  }

  get layerSprite(): Phaser.GameObjects.Image | null {
    return this.layer?.img ?? null;
  }

  /** Story 5.10 (AC 9, D6): while `on` (my HP from state rose inside a ring), a green "+" by the body. */
  healCue(on: boolean): void {
    if (on !== this.healing) {
      this.healing = on;
      this.plus.setVisible(on);
    }
    if (on) this.plus.setPosition(this.x + this.plusOffM, this.y - this.plusOffM);
  }

  /**
   * Story 6.3 (AC 9, F5): while `on` (a blackout), the body, ring and heal "+" are drawn above the
   * darkness (`ABOVE_DARK.teammate`); back to their normal depths when it ends. Only acts on a change.
   */
  setAboveDark(on: boolean): void {
    if (on === this.aboveDark) return;
    this.aboveDark = on;
    this.ring.setDepth(on ? DARK_RING_DEPTH : RING_DEPTH);
    this.body.setDepth(on ? DARK_BODY_DEPTH : BODY_DEPTH);
    this.gun.setDepth(this.body.depth - GUN_DEPTH_STEP);
    this.bodySheen.setDepth(this.body.depth + SHEEN_DZ);
    this.gunSheen.setDepth(this.gun.depth + SHEEN_DZ);
    this.gunGlow.setDepth(this.body.depth + GLOW_DZ);
    this.plus.setDepth(on ? DARK_PLUS_DEPTH : HEAL_PLUS_DEPTH);
    this.layer?.img.setDepth(this.body.depth + LAYER_DEPTH_STEP);
  }

  /** Story 6.3 (tests): the body's and the ring's depths now. */
  get depths(): { body: number; ring: number } {
    return { body: this.body.depth, ring: this.ring.depth };
  }

  /** Ring colour by lobby slot (0–3; solo is 0, blue). */
  setSlot(slot: number): void {
    if (slot === this.slot) return;
    this.slot = slot;
    this.ring.setStrokeStyle(RING_WIDTH_M, SLOT_COLORS[slot] ?? SLOT_COLORS[0], RING_ALPHA);
  }

  /**
   * Story 5.4 (AC 7f): while `on`, the ring is orange and thicker: MY fire is hurting this teammate.
   * Only touches the ring when the state changes.
   */
  flashRing(on: boolean): void {
    if (on === this.flashing) return;
    this.flashing = on;
    if (on) this.ring.setStrokeStyle(RING_WIDTH_M * 2.2, FF_FLASH_COLOR, 1);
    else this.ring.setStrokeStyle(RING_WIDTH_M, SLOT_COLORS[this.slot] ?? SLOT_COLORS[0], RING_ALPHA);
  }

  /** Reads the player (never writes it) and draws it at the interpolated position; `timeMs` drives the downed pulse. */
  /** Story 12.2: the extraction protects everyone the whole phase: no spawn-protection blink then. */
  noBlink = false;

  update(p: PlayerState, alpha: number, timeMs: number, sawRunning = false): void {
    this.x = lerp(p.prevX, p.x, alpha);
    this.y = lerp(p.prevY, p.y, alpha);
    this.ring.setPosition(this.x, this.y);
    this.facingX = p.facingX;
    this.facingY = p.facingY;
    // Story 5.2: a Chainsaw that is cutting shows its running (blurred chain) frame.
    const weapon = p.loadout.slots[p.loadout.active]?.weapon ?? "";
    const running = sawRunning && p.status === "alive";
    // Story 9.13 (AC 2): take 4's survivor breathing and weight shift; the running chainsaw shakes the figure
    const anim = running ? SURV_SAW_ANIM : SURV_ANIM;
    const t = timeMs / 1000 + this.t0;
    const br = breath(anim, t);
    const rotation = Math.atan2(p.facingY, p.facingX) + sway(anim, t);
    let bx = this.x;
    let by = this.y;
    if (anim.shake) {
      const k = (anim.shake / PAGE_PX_PER_R) * this.radiusM;
      const j = shakeNoise(++this.shakeN);
      bx += j * k;
      by += j * k * 0.6;
    }
    const sx = this.side * br;
    const sy = this.side * (1 + (br - 1) * 0.6);
    this.body.setPosition(bx, by).setRotation(rotation).setDisplaySize(sx, sy);
    if (this.bodyKey !== null) {
      // Story 7.9 (D2): the gun frame under the body; the body drops its pack for a weapon with a back piece.
      this.gun.setPosition(bx, by).setRotation(rotation).setDisplaySize(sx, sy);
      const gunFrame = survivorGunFrameFor(weapon, running);
      if (gunFrame !== this.shownGunFrame) {
        this.shownGunFrame = gunFrame;
        needSheet(gunSheetOf(gunFrame));
        this.gun.setTexture(gunSheetOf(gunFrame), gunFrame);
      }
      const pack = !weaponHidesPack(weapon);
      if (pack !== this.shownPack) {
        this.shownPack = pack;
        this.body.setFrame(pack ? LOOK_FRAME_PACK : LOOK_FRAME_NOPACK);
      }
    } else {
      const frame = survivorFrameFor(weapon, running);
      if (frame !== this.shownFrame) {
        this.shownFrame = frame;
        this.body.setFrame(frame);
      }
    }
    const slowed = p.slowTicksLeft > 0 && p.status === "alive";
    // Story 4.11: no burning tint any more (4.8's ember tint): BurnView draws flames, smoke and embers on the body.
    if (p.status !== this.shownStatus || slowed !== this.shownSlowed) {
      this.shownStatus = p.status; // only touch the objects when the status (or the slow) changes
      this.shownSlowed = slowed;
      const shown = p.status !== "out";
      const tint = p.status === "downed" ? DOWNED_TINT : slowed ? SLOWED_TINT : BODY_TINT;
      this.body.setTint(tint).setVisible(shown);
      this.gun.setTint(tint).setVisible(shown && this.bodyKey !== null);
      this.layer?.img.setTint(tint).setVisible(shown);
      this.ring.setVisible(shown).setScale(1).setAlpha(1);
    }
    if (this.layer) {
      // Story 7.8: the layer rides on the head and spins (a downed survivor's propeller keeps turning).
      const at = layerPose(this.layerAt, this.layer.id, this.x, this.y, p.facingX, p.facingY, this.radiusM, timeMs);
      this.layer.img.setPosition(at.x, at.y).setRotation(at.rotation);
    }
    if (p.status === "downed") {
      // Story 2.9: a downed survivor's ring pulses (mine too), so the revive chance is obvious.
      this.ring.setScale(pulseScale(timeMs)).setAlpha(pulseAlpha(timeMs));
    }
    // Story 8.1 (D3): spawn protection after a mid-wave return blinks the body (only touched while it changes).
    const blink = protectBlinkAlpha(this.noBlink ? 0 : p.protectTicks, timeMs);
    if (blink !== this.shownBlink) {
      this.shownBlink = blink;
      this.body.setAlpha(blink);
      this.gun.setAlpha(blink); // Story 7.9 review M1: the gun blinks with the body
      this.layer?.img.setAlpha(blink);
    }
    this.relit(p, bx, by, rotation, sx, sy, t, anim); // review L4: after the blink, so the sheen and glow take this frame's alpha
  }

  /**
   * Story 9.13 (AC 2, 5): the relit layers once their pictures landed: the body's sheen (B5, its own texture), the
   * gun's sheen and the gun's glow flickering with a bloom (take 4's pilot flames). Hidden for a downed or out
   * survivor (the tint and the ring tell those states) and on the 7.8 one-piece fallback.
   */
  private relit(p: PlayerState, x: number, y: number, rot: number, sx: number, sy: number, t: number, anim: typeof SURV_ANIM): void {
    const on = p.status === "alive" && this.bodyKey !== null;
    const step = sheenStep(t);
    const a = this.shownBlink;
    if (on && this.sheenKey !== null) {
      const name = (LOOK_SHEEN_FRAMES[this.shownPack ? 0 : 1] as readonly string[])[step] as string;
      if (this.bodySheen.frame.name !== name) this.bodySheen.setFrame(name);
      this.bodySheen.setPosition(x, y).setRotation(rot).setDisplaySize(sx, sy).setAlpha(a).setVisible(true);
    } else if (this.bodySheen.visible) this.bodySheen.setVisible(false);
    const fx = on ? charFx(this.shownGunFrame) : undefined;
    const names = fx ? layerNames(this.shownGunFrame) : null;
    const sheet = gunSheetOf(this.shownGunFrame);
    if (fx?.sheen && names) {
      const name = names.sheen[step] as string;
      if (this.gunSheen.texture.key !== sheet) this.gunSheen.setTexture(sheet, name);
      else if (this.gunSheen.frame.name !== name) this.gunSheen.setFrame(name);
      this.gunSheen.setPosition(x, y).setRotation(rot).setDisplaySize(sx, sy).setAlpha(a).setVisible(true);
    } else if (this.gunSheen.visible) this.gunSheen.setVisible(false);
    if (fx?.glow && names) {
      if (this.gunGlow.texture.key !== sheet) this.gunGlow.setTexture(sheet, names.glow);
      else if (this.gunGlow.frame.name !== names.glow) this.gunGlow.setFrame(names.glow);
      this.gunGlow.setPosition(x, y).setRotation(rot).setDisplaySize(sx, sy).setAlpha(a * glowPulse(anim, t)).setVisible(true);
    } else if (this.gunGlow.visible) this.gunGlow.setVisible(false);
  }

  /** Story 8.1: the body alpha last set by the protection blink (1 = none). */
  private shownBlink = 1;

  destroy(): void {
    this.ring.destroy();
    this.body.destroy();
    this.gun.destroy();
    this.bodySheen.destroy();
    this.gunSheen.destroy();
    this.gunGlow.destroy();
    this.plus.destroy();
    if (this.layer) this.layer.pool.release(this.layer.id, this.layer.img);
    this.layer = null;
  }
}
