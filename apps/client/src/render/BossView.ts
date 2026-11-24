import type * as Phaser from "phaser";
import { BOSS_ATTACK, BOSS_STATE, zombieUnderBoss, type World } from "@topdown/shared";
import {
  BOSS_ATLAS,
  BOSS_CRACK_PX_PER_M,
  BOSS_FRAME,
  BOSS_FRAMES,
  BOSS_FRAME_PX,
  BOSS_FX,
  BOSS_FX_FRAMES,
  BOSS_PX_PER_M,
  BOSS_TELE,
  BOSS_TELE_RADIUS_PX,
  TELE_TICKS,
  TELE_TICK_IN_PX,
  TELE_TICK_MAJOR,
  ensureBossTextures,
} from "./city/bossAtlas";
import { aboveDarkness } from "./darkness/aboveDark";
import { BOSS_HUD, HUD_FRAMES, HUD_RED, ensureHudWarnTextures, hudFlicker, hudFrameCssSize } from "./city/hudWarnArt";
import { slamFrameIndex, telegraphProgress, type TelegraphLook } from "./bossTelegraph";

/**
 * Story 6.5 (AC 13; F3, DD4, DD10): everything the Behemoth draws in the world.
 *
 * - The body (`boss_<look>_<pose>`), above the zombies (dimmed while any walks under it: review M2), at the host's draw position (online: the
 *   render tick between two patches; solo: between the last two ticks), facing its heading. Pose from
 *   the state: WALK the two-frame walk cycle by distance; TELEGRAPH (slam) the arms rising by the
 *   fill; RECOVER after a slam `slamHit` for half a second. A `boss.hit` flashes it.
 * - In the dark (6.3: `isBlackout` / `darknessAlpha > 0`, set through `setDark`) its outline + eyes
 *   frame above the darkness (`ABOVE_DARK.boss`; red eyes when enraged, 6.7).
 * - The telegraph (asset fixes, designer: S1 glow + sparks + countdown): the baked glowing disc (additive)
 *   brightening over the windup, its countdown ticks lighting one by one clockwise from the top (the
 *   circle closes on the hit tick) with a bright head, and sparks lifting off the rim and drifting in,
 *   thicker toward the hit. Driven by the SERVER's start tick (`telegraphProgress` with the host's
 *   estimated server tick), above the zombies and the darkness (`ABOVE_DARK.telegraph`). Pooled: 2
 *   slots (the current one and the fading one).
 * - Its target's lock (asset fixes round 5, P1): red HUD corner brackets round the hunted survivor, closing in
 *   as a slam winds up, a turning tick ring, a scrolling hazard bar and a TARGET tag; flickering like a
 *   failing display (everyone sees it; `ABOVE_DARK.marker`).
 * - The slam's crack decals: a pool of `boss.json › caps.maxDecals` (oldest reused), cleared at a build start.
 */
const BODY_DEPTH = 6.2;
const DECAL_DEPTH = 1.6;
const WALK_STEP_M = 0.65;
const SLAM_HIT_S = 0.5;
const HIT_FLASH_S = 0.08;
const HIT_TINT = 0xffb0a0;
/** `Phaser.BlendModes.ADD` (a number: this module only imports Phaser's types, so tests run without a browser). */
const BLEND_ADD = 1;
/** The telegraph's lit ticks: a red bloom under a white-hot core (colour, alpha, width in texture px). */
const TICK_GLOW = 0xff3c28;
const TICK_CORE = 0xffebdc;
/** Lit ticks are longer than the dim baked ones (texture px). */
const TICK_LIT_LONG_PX = 20;
const TICK_LIT_SHORT_PX = 11;
/** Sparks off the rim: count at the start and at the hit, how far in they drift (share of the ring's width). */
const SPARKS_MIN = 30;
const SPARKS_MAX = 100;
const SPARK_DRIFT = 0.55;
/** Seconds of spark drift time per spark lifetime (randomised per spark ×1–2.5). */
const SPARK_LIFE_S = 1;
/** The target lock (P1), in metres: bracket box half-size, the tag's display size (88 × 44 CSS px at 47 CSS px per metre). */
const LOCK_R_M = 0.8;
const LOCK_CSS_PER_M = 47;
const LOCK_LINE_M = 2 / LOCK_CSS_PER_M;
/** Review M2: the body's opacity while zombies walk under it (they read through it; no new colour). */
export const BOSS_DIM_ALPHA = 0.55;
/** Review L-b: seconds the body takes to dim or come back (no flicker as a zombie crosses its rim). */
export const BOSS_DIM_FADE_S = 0.25;

/**
 * Review L-b: the body's next opacity — toward `BOSS_DIM_ALPHA` while a DRAWN zombie stands under it,
 * else toward 1, at most 1 / `BOSS_DIM_FADE_S` × (1 − dim) per second. Pure (tested).
 */
export function bossBodyAlpha(current: number, dimmed: boolean, dtS: number): number {
  const target = dimmed ? BOSS_DIM_ALPHA : 1;
  const step = ((1 - BOSS_DIM_ALPHA) * dtS) / BOSS_DIM_FADE_S;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

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
  private readonly tag: Phaser.GameObjects.Image;
  private readonly lock: Phaser.GameObjects.Graphics;
  /** The slam windup (0–1) the brackets close in with (0: none). */
  private lockP = 0;
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
  /** Seconds since the view started (drives the sparks; never the gameplay). */
  private clockS = 0;
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
    ensureHudWarnTextures(scene);
    const tagSize = hudFrameCssSize("tag");
    this.tag = aboveDarkness(scene.add.image(0, 0, BOSS_HUD, HUD_FRAMES.tag).setDisplaySize(tagSize.w / LOCK_CSS_PER_M, tagSize.h / LOCK_CSS_PER_M).setVisible(false), "marker");
    this.lock = aboveDarkness(scene.add.graphics().setVisible(false), "marker");
    for (let i = 0; i < 2; i++) {
      this.tele.push({
        disc: aboveDarkness(scene.add.image(0, 0, BOSS_TELE).setBlendMode(BLEND_ADD).setVisible(false), "telegraph"),
        fill: aboveDarkness(scene.add.graphics().setBlendMode(BLEND_ADD).setVisible(false), "telegraph"),
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
  /** A drawn zombie's centre is under the body (review M2 / L-b). */
  private drawnZombieUnder(drawn: ((id: number) => boolean) | undefined): boolean {
    const z = this.world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      if (drawn && !drawn(id)) continue;
      if (zombieUnderBoss(this.world as World, z.x[id] as number, z.y[id] as number)) return true;
    }
    return false;
  }

  update(dtS: number, serverTick: number, drawX: number, drawY: number, targetAt: { x: number; y: number } | undefined, zombieDrawn?: (id: number) => boolean): void {
    const b = this.world.boss;
    const on = b.state >= BOSS_STATE.WALK && b.state <= BOSS_STATE.ROAR;
    // A late Game scene / a reconnect mid-telegraph: the state carries the attack.
    if (b.state === BOSS_STATE.TELEGRAPH) this.onTelegraph(b.attack.id, b.attack.kind, b.attack.startTick, b.attack.hitTick, b.attack.cx, b.attack.cy, b.attack.radiusM);
    this.clockS += dtS;
    this.drawTelegraphs(serverTick);
    if (!on) {
      if (this.body.visible) {
        this.body.setVisible(false);
        this.outline.setVisible(false);
        this.tag.setVisible(false);
        this.lock.setVisible(false);
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
    // Review M2 / L-b: a zombie under it stays readable — the body fades down while one the player
    // can see (drawn: not hidden by 6.4's fog) stands under it.
    const alpha = bossBodyAlpha(this.body.alpha, this.drawnZombieUnder(zombieDrawn), dtS);
    if (this.body.alpha !== alpha) this.body.setAlpha(alpha);
    if (this.dark) {
      const o = frames[b.enraged ? BOSS_FRAME.outlineEnraged : BOSS_FRAME.outline] as string;
      if (this.outline.frame.name !== o) this.outline.setFrame(o);
      this.outline.setPosition(drawX, drawY).setRotation(b.facing).setVisible(true);
    } else if (this.outline.visible) this.outline.setVisible(false);
    if (targetAt) this.drawLock(targetAt.x, targetAt.y);
    else if (this.tag.visible) {
      this.tag.setVisible(false);
      this.lock.clear().setVisible(false);
    }
  }

  private drawTelegraphs(serverTick: number): void {
    this.lockP = 0;
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
      const p = look.progress;
      if (look.alpha >= 1) this.lockP = Math.max(this.lockP, p);
      s.disc.setAlpha(look.alpha * (0.45 + 0.55 * p)).setVisible(true); // the glow gathers over the windup
      this.drawCountdown(s.fill.clear(), s, p, look.alpha);
      s.fill.setVisible(true);
    }
  }

  /**
   * The target lock at (x, y) (P1): corner brackets (breathing while it walks, closing in over a slam's
   * windup), a turning ring of ticks, a scrolling hazard bar under them and the TARGET tag above, all with
   * the display flicker. Graphics in metres; no allocation.
   */
  private drawLock(x: number, y: number): void {
    const t = this.clockS;
    const fl = hudFlicker(t);
    const r = LOCK_R_M;
    const lock = this.lockP > 0 ? this.lockP : 0.4 + 0.2 * Math.sin(t * 2);
    const gap = r * (1.25 - 0.35 * lock);
    const len = r * 0.55;
    const g = this.lock.clear();
    for (let pass = 0; pass < 2; pass++) {
      g.lineStyle(pass === 0 ? LOCK_LINE_M * 4 : LOCK_LINE_M, HUD_RED, (pass === 0 ? 0.25 : 1) * fl);
      for (let c = 0; c < 4; c++) {
        const sx = c & 1 ? 1 : -1;
        const sy = c & 2 ? 1 : -1;
        const cx = x + sx * gap;
        const cy = y + sy * gap;
        g.lineBetween(cx, cy, cx - sx * len, cy);
        g.lineBetween(cx, cy, cx, cy - sy * len);
      }
    }
    // the turning tick ring
    g.lineStyle(LOCK_LINE_M, HUD_RED, 0.7 * fl);
    for (let i = 0; i < 24; i++) {
      if (i % 6 === 0) continue;
      const a = (i / 24) * Math.PI * 2 + t * 0.8;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      g.lineBetween(x + ca * r * 0.95, y + sa * r * 0.95, x + ca * r * 1.08, y + sa * r * 1.08);
    }
    // the hazard bar under the brackets, its stripes scrolling
    const by = y + gap + 0.08;
    const bh = 0.08;
    const step = 0.08;
    const off = (t * 0.4) % (step * 2);
    g.fillStyle(HUD_RED, fl);
    for (let sx = x - r - step * 2 + off; sx < x + r; sx += step * 2) {
      const x0 = Math.max(x - r, sx);
      const x1 = Math.min(x + r, sx + step);
      if (x1 <= x0) continue;
      // one slanted stripe: a parallelogram as two triangles, kept inside the bar
      const tx0 = Math.min(x + r, x0 + bh);
      const tx1 = Math.min(x + r, x1 + bh);
      g.fillTriangle(x0, by + bh, x1, by + bh, tx1, by);
      g.fillTriangle(x0, by + bh, tx1, by, tx0, by);
    }
    g.setVisible(true);
    this.tag
      .setPosition(x, y - gap - r * 0.65)
      .setAlpha(fl)
      .setVisible(true);
  }

  /**
   * The live part of the slam telegraph into `g` (world metres): the countdown ticks lit up to `p`, the
   * sweep's bright head, and the sparks. No allocation (sparks are hashed from their index and the clock).
   */
  private drawCountdown(g: Phaser.GameObjects.Graphics, s: TeleSlot, p: number, alpha: number): void {
    const k = s.r / BOSS_TELE_RADIUS_PX; // metres per texture px
    const R = s.r;
    const lit = Math.floor(p * TELE_TICKS);
    for (let pass = 0; pass < 2; pass++) {
      g.lineStyle((pass === 0 ? 7 : 2.6) * k, pass === 0 ? TICK_GLOW : TICK_CORE, (pass === 0 ? 0.35 : 0.95) * alpha);
      for (let i = 0; i < lit; i++) {
        const a = -Math.PI / 2 + (i / TELE_TICKS) * Math.PI * 2;
        const l = (i % TELE_TICK_MAJOR === 0 ? TICK_LIT_LONG_PX : TICK_LIT_SHORT_PX) * k;
        const r0 = R - (TELE_TICK_IN_PX - 2) * k;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        g.lineBetween(s.cx + ca * r0, s.cy + sa * r0, s.cx + ca * (r0 - l), s.cy + sa * (r0 - l));
      }
    }
    // the sweep's head: a hot point riding the rim
    if (p < 1) {
      const a = -Math.PI / 2 + p * Math.PI * 2;
      const hx = s.cx + Math.cos(a) * (R - 4 * k);
      const hy = s.cy + Math.sin(a) * (R - 4 * k);
      for (let i = 4; i >= 1; i--) {
        g.fillStyle(i === 1 ? TICK_CORE : TICK_GLOW, (i === 1 ? 0.9 : 0.16) * alpha);
        g.fillCircle(hx, hy, i * 5 * k);
      }
    }
    // sparks lifting off the rim and drifting in, more of them toward the hit
    const n = Math.round(SPARKS_MIN + p * (SPARKS_MAX - SPARKS_MIN));
    const span = (R - s.hole) * SPARK_DRIFT;
    for (let i = 0; i < n; i++) {
      const h1 = sparkHash(i, 1);
      const life = (this.clockS / (SPARK_LIFE_S * (1 + sparkHash(i, 3) * 1.5)) + sparkHash(i, 4)) % 1;
      const a = h1 * Math.PI * 2 + this.clockS * 0.15 * (sparkHash(i, 2) - 0.5);
      const d = R - life * span;
      const fade = Math.sin(life * Math.PI) * (0.5 + p * 0.5) * alpha;
      g.fillStyle(sparkHash(i, 5) < 0.5 ? 0xffb45a : 0xffe08c, fade);
      g.fillCircle(s.cx + Math.cos(a) * d, s.cy + Math.sin(a) * d, (1 + sparkHash(i, 6) * 1.6) * k);
    }
  }
}

/** A stable 0–1 value per spark and channel (no allocation, no Math.random: every client draws the same sparks). */
function sparkHash(i: number, ch: number): number {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(ch, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
