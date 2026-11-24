import type * as Phaser from "phaser";
import { BOSS_ATTACK, BOSS_STATE, type World } from "@topdown/shared";
import { BOSS_ATLAS, BOSS_CRACK_PX_PER_M, BOSS_FRAME, BOSS_FRAMES, BOSS_FRAME_PX, BOSS_FX, BOSS_FX_FRAMES, BOSS_PX_PER_M, BOSS_TELE, BOSS_TELE_RADIUS_PX, ensureBossTextures } from "./city/bossAtlas";
import { aboveDarkness } from "./darkness/aboveDark";
import { slamFrameIndex, telegraphProgress, type TelegraphLook } from "./bossTelegraph";

/**
 * Story 6.5 (AC 13; F3, DD4, DD10): everything the Behemoth draws in the world.
 *
 * - The body (`boss_<look>_<pose>`), above the zombies, at the host's draw position (online: the
 *   render tick between two patches; solo: between the last two ticks), facing its heading. Pose from
 *   the state: WALK the two-frame walk cycle by distance; TELEGRAPH (slam) the arms rising by the
 *   fill; RECOVER after a slam `slamHit` for half a second. A `boss.hit` flashes it.
 * - In the dark (6.3: `isBlackout` / `darknessAlpha > 0`, set through `setDark`) its outline + eyes
 *   frame above the darkness (`ABOVE_DARK.boss`; red eyes when enraged, 6.7).
 * - The telegraph: the baked disc (red + white hatching, red edge, dashed inner edge, a hole for the
 *   body) and a red fill ring growing from the body's edge to the ring, drawn from the SERVER's start
 *   tick (`telegraphProgress` with the host's estimated server tick), above the zombies and the
 *   darkness (`ABOVE_DARK.telegraph`). Pooled: 2 slots (the current one and the fading one).
 * - A red skull over its target (everyone sees it; `ABOVE_DARK.marker`).
 * - The slam's crack decals: a pool of `boss.json › caps.maxDecals` (oldest reused), cleared at a build start.
 */
const BODY_DEPTH = 6.2;
const DECAL_DEPTH = 1.6;
const WALK_STEP_M = 0.65;
const SLAM_HIT_S = 0.5;
const HIT_FLASH_S = 0.08;
const HIT_TINT = 0xffb0a0;
const FILL_COLOR = 0xff2828;
const FILL_ALPHA = 0.38;
const SKULL_M = 0.9;
const SKULL_LIFT_M = 1.1;

interface TeleSlot {
  disc: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Graphics;
  attackId: number;
  startTick: number;
  hitTick: number;
  cx: number;
  cy: number;
  r: number;
  hole: number;
}

export class BossView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly outline: Phaser.GameObjects.Image;
  private readonly skull: Phaser.GameObjects.Image;
  private readonly tele: TeleSlot[] = [];
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private nextDecal = 0;
  private dark = false;
  private walked = 0;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private flashS = 0;
  private slamHitS = 0;
  private readonly look: TelegraphLook = { progress: 0, visible: false, alpha: 0 };
  private readonly at = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly world: Readonly<World>,
  ) {
    const b = world.balance.boss;
    ensureBossTextures(scene, b.radiusM / b.slam.radiusM);
    const side = BOSS_FRAME_PX / BOSS_PX_PER_M; // 7 m: the frame's metres
    this.body = scene.add.image(0, 0, BOSS_ATLAS, BOSS_FRAMES[0]?.[0]).setDisplaySize(side, side).setDepth(BODY_DEPTH).setVisible(false);
    this.outline = aboveDarkness(scene.add.image(0, 0, BOSS_ATLAS, BOSS_FRAMES[0]?.[BOSS_FRAME.outline]).setDisplaySize(side, side).setVisible(false), "boss");
    this.skull = aboveDarkness(scene.add.image(0, 0, BOSS_FX, BOSS_FX_FRAMES.skull).setDisplaySize(SKULL_M, SKULL_M).setVisible(false), "marker");
    for (let i = 0; i < 2; i++) {
      this.tele.push({
        disc: aboveDarkness(scene.add.image(0, 0, BOSS_TELE).setVisible(false), "telegraph"),
        fill: aboveDarkness(scene.add.graphics().setVisible(false), "telegraph"),
        attackId: -1,
        startTick: 0,
        hitTick: 0,
        cx: 0,
        cy: 0,
        r: 0,
        hole: 0,
      });
    }
    const decalSide = (2 * 256) / (2 * BOSS_CRACK_PX_PER_M);
    for (let i = 0; i < b.caps.maxDecals; i++) this.decals.push(scene.add.image(0, 0, BOSS_FX, BOSS_FX_FRAMES.crack).setDisplaySize(decalSide, decalSide).setDepth(DECAL_DEPTH).setAlpha(0.85).setVisible(false));
  }

  /** 6.3's light state: draw the outline + eyes above the darkness. */
  setDark(dark: boolean): void {
    this.dark = dark;
  }

  /** `boss.hit` (DD9: one per source per tick): a short flash. */
  onHit(): void {
    this.flashS = HIT_FLASH_S;
  }

  /** `boss.slammed`: the crack decal (oldest reused) and the slamHit pose. */
  onSlammed(x: number, y: number, rot: number): void {
    const d = this.decals[this.nextDecal] as Phaser.GameObjects.Image;
    this.nextDecal = (this.nextDecal + 1) % this.decals.length;
    d.setPosition(x, y).setRotation(rot).setVisible(true);
    this.slamHitS = SLAM_HIT_S;
  }

  /** A build start: no cracks carried into the next wave. */
  clearDecals(): void {
    for (const d of this.decals) d.setVisible(false);
    this.nextDecal = 0;
  }

  /**
   * `boss.telegraph` (or the state's attack fields on a late start / a woken tab): remember the zone
   * in a free slot (the older one keeps fading). Nothing is drawn from the arrival time (DD4).
   */
  onTelegraph(attackId: number, kind: number, startTick: number, hitTick: number, cx: number, cy: number, radiusM: number): void {
    if (kind !== BOSS_ATTACK.SLAM) return; // 6.6: lanes and throw rings
    for (const s of this.tele) if (s.attackId === attackId) return;
    const a = this.tele[0] as TeleSlot;
    const b = this.tele[1] as TeleSlot;
    const slot = a.hitTick <= b.hitTick ? a : b;
    slot.attackId = attackId;
    slot.startTick = startTick;
    slot.hitTick = hitTick;
    slot.cx = cx;
    slot.cy = cy;
    slot.r = radiusM;
    slot.hole = this.world.balance.boss.radiusM;
    slot.disc.setPosition(cx, cy).setDisplaySize((2 * radiusM * (BOSS_TELE_RADIUS_PX + 4)) / BOSS_TELE_RADIUS_PX, (2 * radiusM * (BOSS_TELE_RADIUS_PX + 4)) / BOSS_TELE_RADIUS_PX);
  }

  /**
   * Once per frame. `serverTick`: the host's estimated server tick (NaN: no clock yet); `drawX/Y`: the
   * host's boss draw position; `targetAt`: where the target survivor is drawn (undefined: none).
   */
  update(dtS: number, serverTick: number, drawX: number, drawY: number, targetAt: { x: number; y: number } | undefined): void {
    const b = this.world.boss;
    const on = b.state >= BOSS_STATE.WALK && b.state <= BOSS_STATE.ROAR;
    // A late Game scene / a reconnect mid-telegraph: the state carries the attack.
    if (b.state === BOSS_STATE.TELEGRAPH) this.onTelegraph(b.attack.id, b.attack.kind, b.attack.startTick, b.attack.hitTick, b.attack.cx, b.attack.cy, b.attack.radiusM);
    this.drawTelegraphs(serverTick);
    if (!on) {
      if (this.body.visible) {
        this.body.setVisible(false);
        this.outline.setVisible(false);
        this.skull.setVisible(false);
      }
      this.lastX = Number.NaN;
      return;
    }
    this.at.x = drawX;
    this.at.y = drawY;
    if (!Number.isNaN(this.lastX)) this.walked += Math.hypot(drawX - this.lastX, drawY - this.lastY);
    this.lastX = drawX;
    this.lastY = drawY;
    this.slamHitS = Math.max(0, this.slamHitS - dtS);
    this.flashS = Math.max(0, this.flashS - dtS);
    const frames = BOSS_FRAMES[b.look % BOSS_FRAMES.length] as readonly string[];
    let f: number = Math.floor(this.walked / WALK_STEP_M) % 2 === 0 ? BOSS_FRAME.walkA : BOSS_FRAME.walkB;
    if (b.state === BOSS_STATE.TELEGRAPH && b.attack.kind === BOSS_ATTACK.SLAM) {
      telegraphProgress(serverTick, b.attack.startTick, b.attack.hitTick, this.look);
      f = BOSS_FRAME.slamA + slamFrameIndex(this.look.progress);
    } else if (b.state === BOSS_STATE.RECOVER && this.slamHitS > 0) f = BOSS_FRAME.slamHit;
    else if (b.state === BOSS_STATE.STUN) f = BOSS_FRAME.stun;
    else if (b.state === BOSS_STATE.ROAR) f = BOSS_FRAME.roar;
    else if (b.state === BOSS_STATE.RUSH) f = BOSS_FRAME.rush;
    const name = frames[f] as string;
    if (this.body.frame.name !== name) this.body.setFrame(name);
    this.body.setPosition(drawX, drawY).setRotation(b.facing).setVisible(true);
    if (this.flashS > 0) this.body.setTint(HIT_TINT);
    else this.body.clearTint();
    if (this.dark) {
      const o = frames[b.enraged ? BOSS_FRAME.outlineEnraged : BOSS_FRAME.outline] as string;
      if (this.outline.frame.name !== o) this.outline.setFrame(o);
      this.outline.setPosition(drawX, drawY).setRotation(b.facing).setVisible(true);
    } else if (this.outline.visible) this.outline.setVisible(false);
    if (targetAt) this.skull.setPosition(targetAt.x, targetAt.y - SKULL_LIFT_M).setVisible(true);
    else if (this.skull.visible) this.skull.setVisible(false);
  }

  private drawTelegraphs(serverTick: number): void {
    for (const s of this.tele) {
      if (s.attackId < 0 || Number.isNaN(serverTick)) {
        if (s.disc.visible) {
          s.disc.setVisible(false);
          s.fill.setVisible(false);
        }
        continue;
      }
      const look = telegraphProgress(serverTick, s.startTick, s.hitTick, this.look);
      if (!look.visible) {
        s.disc.setVisible(false);
        s.fill.clear().setVisible(false);
        if (serverTick > s.hitTick) s.attackId = -1; // done: the slot is free
        continue;
      }
      s.disc.setAlpha(look.alpha).setVisible(true);
      // The fill: a ring from the body's edge out to progress × radius (the body hole stays clear).
      const outer = s.r * look.progress;
      const g = s.fill.clear();
      if (outer > s.hole) {
        const w = outer - s.hole;
        g.lineStyle(w, FILL_COLOR, FILL_ALPHA * look.alpha).strokeCircle(s.cx, s.cy, s.hole + w / 2);
      }
      g.setVisible(true);
    }
  }
}

