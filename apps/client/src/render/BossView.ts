import type * as Phaser from "phaser";
import { BOSS_ATTACK, BOSS_STATE, zombieUnderBoss, type World } from "@topdown/shared";
import {
  BOSS_ATLAS,
  BOSS_CHUNK_M,
  BOSS_CRACK_PX_PER_M,
  BOSS_CRATER_M,
  BOSS_FRAME,
  BOSS_FRAMES,
  BOSS_FRAME_PX,
  BOSS_FX,
  BOSS_FX_FRAMES,
  BOSS_LANE,
  BOSS_LANE_PX_PER_M,
  BOSS_PX_PER_M,
  BOSS_RING,
  BOSS_TELE,
  BOSS_TELE_RADIUS_PX,
  ensureBossTextures,
} from "./city/bossAtlas";
import { ABOVE_DARK, aboveDarkness } from "./darkness/aboveDark";
import {
  chargeLaneLook,
  chargeLaneProgress,
  chargeStopTick,
  deathFrameIndex,
  slamFrameIndex,
  telegraphProgress,
  throwChunkAt,
  throwInnerRadius,
  type ChunkLook,
  type LaneLook,
  type TelegraphLook,
} from "./bossTelegraph";

/**
 * Story 6.5 (AC 13; F3, DD4, DD10): everything the Behemoth draws in the world.
 *
 * - The body (`boss_<look>_<pose>`), above the zombies (dimmed while any walks under it: review M2), at the host's draw position (online: the
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
 * - Story 6.6: the charge lane (the baked hatched strip cropped to the lane's length, white arrows, a
 *   red fill growing from the body's back by the start-tick progress, full through the rush, fading
 *   0.3 s after the stop) with the amber CRASH mark at its end when `crash`; the throw's hatched 3 m
 *   ring at the landing spot with a white inner ring shrinking to the impact, the chunk in flight on a
 *   cosmetic arc (its look from the source: road / rubble / burnt car), the crater decal at the impact
 *   (the same decal pool as the cracks: D8, at most 8). All above the darkness (`ABOVE_DARK.telegraph`).
 * - Story 6.7: the roar's shock ring (5 m), the Crawler drop puff, and the collapse (3 frames over
 *   `death.collapseS`), the dark body staying on the street (not solid) until the build start.
 */
const BODY_DEPTH = 6.2;
const DECAL_DEPTH = 1.6;
const WALK_STEP_M = 0.65;
const SLAM_HIT_S = 0.5;
const HIT_FLASH_S = 0.08;
const HIT_TINT = 0xffb0a0;
const FILL_COLOR = 0xff2828;
const FILL_ALPHA = 0.38;
const RING_WHITE = 0xffffff;
const PUFF_COLOR = 0xb8ada0;
const ROAR_COLOR = 0xff4a2e;
/** Story 6.6 / 6.7: transient rings (roar shock ring, drop puff, crash dust) — a pool. */
const RINGS = 4;
const DEAD_TINT = 0x8a8a8a;
const SKULL_M = 0.9;
const SKULL_LIFT_M = 1.1;
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

interface LaneSlot {
  strip: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Graphics;
  crash: Phaser.GameObjects.Image;
  attackId: number;
  startTick: number;
  hitTick: number;
  stopTick: number;
  lane: LaneLook;
  crashOn: boolean;
}

interface RingSlot {
  disc: Phaser.GameObjects.Image;
  inner: Phaser.GameObjects.Graphics;
  chunk: Phaser.GameObjects.Image;
  attackId: number;
  startTick: number;
  releaseTick: number;
  hitTick: number;
  cx: number;
  cy: number;
  r: number;
  fromX: number;
  fromY: number;
}

interface FxRing {
  x: number;
  y: number;
  ageS: number;
  lifeS: number;
  r0: number;
  r1: number;
  color: number;
}

export class BossView {
  private readonly laneSlot: LaneSlot;
  private readonly ringSlot: RingSlot;
  private readonly fxG: Phaser.GameObjects.Graphics;
  private readonly fx: FxRing[] = [];
  private readonly laneFill = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  private readonly chunkLook: ChunkLook = { visible: false, x: 0, y: 0, heightM: 0, f: 0 };
  private deadS = 0;
  private readonly body: Phaser.GameObjects.Image;
  /** Story 6.6: the body redrawn above its own charge lane / throw ring (the "hole for the body"), in the light only. */
  private readonly bodyTop: Phaser.GameObjects.Image;
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
    this.bodyTop = scene.add.image(0, 0, BOSS_ATLAS, BOSS_FRAMES[0]?.[0]).setDisplaySize(side, side).setDepth(ABOVE_DARK.telegraph + 0.002).setVisible(false);
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
    // Story 6.6: one lane and one throw ring (one attack at a time; the previous one has faded by then).
    const w = b.charge.laneWidthM;
    this.laneSlot = {
      strip: aboveDarkness(scene.add.image(0, 0, BOSS_LANE).setOrigin(0, 0.5).setScale(1 / BOSS_LANE_PX_PER_M).setVisible(false), "telegraph"),
      fill: aboveDarkness(scene.add.graphics().setVisible(false), "telegraph"),
      crash: aboveDarkness(scene.add.image(0, 0, BOSS_FX, BOSS_FX_FRAMES.crash).setDisplaySize(w, w).setVisible(false), "telegraph"),
      attackId: -1,
      startTick: 0,
      hitTick: 0,
      stopTick: 0,
      lane: { x0: 0, y0: 0, lengthM: 0, angle: 0, frontX: 0, frontY: 0 },
      crashOn: false,
    };
    this.ringSlot = {
      disc: aboveDarkness(scene.add.image(0, 0, BOSS_RING).setVisible(false), "telegraph"),
      inner: aboveDarkness(scene.add.graphics().setVisible(false), "telegraph"),
      chunk: aboveDarkness(scene.add.image(0, 0, BOSS_FX, BOSS_FX_FRAMES.chunkRoad).setDisplaySize(BOSS_CHUNK_M, BOSS_CHUNK_M).setVisible(false), "telegraph"),
      attackId: -1,
      startTick: 0,
      releaseTick: 0,
      hitTick: 0,
      cx: 0,
      cy: 0,
      r: 0,
      fromX: 0,
      fromY: 0,
    };
    this.fxG = aboveDarkness(scene.add.graphics(), "telegraph");
    for (let i = 0; i < RINGS; i++) this.fx.push({ x: 0, y: 0, ageS: 1, lifeS: 0, r0: 0, r1: 0, color: 0 });
  }

  /** A transient ring (oldest reused). */
  private ring(x: number, y: number, r0: number, r1: number, lifeS: number, color: number): void {
    let slot = this.fx[0] as FxRing;
    for (const f of this.fx) if (f.ageS / Math.max(1e-6, f.lifeS) > slot.ageS / Math.max(1e-6, slot.lifeS)) slot = f;
    slot.x = x;
    slot.y = y;
    slot.r0 = r0;
    slot.r1 = r1;
    slot.ageS = 0;
    slot.lifeS = lifeS;
    slot.color = color;
  }

  /** Story 6.7 `boss.enraged`: the 5 m shock ring (red: boss danger). */
  onEnraged(x: number, y: number): void {
    this.ring(x, y, this.world.balance.boss.radiusM, this.world.balance.boss.enrage.roarRadiusM, 0.45, ROAR_COLOR);
  }

  /** Story 6.7 `boss.crawler_dropped`: a short "slough" puff behind it. */
  onCrawlerDropped(x: number, y: number): void {
    this.ring(x, y, 0.2, 0.9, 0.35, PUFF_COLOR);
  }

  /** Story 6.6 `boss.crashed`: a dust ring round its body. */
  onCrashed(x: number, y: number): void {
    this.ring(x, y, this.world.balance.boss.radiusM, this.world.balance.boss.radiusM + 1.5, 0.5, PUFF_COLOR);
  }

  /** Story 6.6 `boss.thrown_impact`: the crater (the shared decal pool, oldest reused: D8) and a dust ring. */
  onThrownImpact(x: number, y: number, rot: number): void {
    const d = this.decals[this.nextDecal] as Phaser.GameObjects.Image;
    this.nextDecal = (this.nextDecal + 1) % this.decals.length;
    d.setFrame(BOSS_FX_FRAMES.crater).setDisplaySize(BOSS_CRATER_M, BOSS_CRATER_M).setPosition(x, y).setRotation(rot).setVisible(true);
    this.ring(x, y, 0.5, this.world.balance.boss.throw.radiusM, 0.4, PUFF_COLOR);
    this.ringSlot.chunk.setVisible(false);
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
    const side = (2 * 256) / (2 * BOSS_CRACK_PX_PER_M);
    d.setFrame(BOSS_FX_FRAMES.crack).setDisplaySize(side, side).setPosition(x, y).setRotation(rot).setVisible(true);
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
  onTelegraph(attackId: number, kind: number, startTick: number, hitTick: number, cx: number, cy: number, radiusM: number, endX = cx, endY = cy, crash = false, src = 0): void {
    if (kind === BOSS_ATTACK.CHARGE) {
      this.onLane(attackId, startTick, hitTick, cx, cy, endX, endY, crash);
      return;
    }
    if (kind === BOSS_ATTACK.THROW) {
      this.onRing(attackId, startTick, hitTick, cx, cy, radiusM, src);
      return;
    }
    if (kind !== BOSS_ATTACK.SLAM) return;
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

  /** Story 6.6: a charge lane (fixed at the start: F1). */
  private onLane(attackId: number, startTick: number, hitTick: number, cx: number, cy: number, endX: number, endY: number, crash: boolean): void {
    const l = this.laneSlot;
    if (l.attackId === attackId) return;
    const bal = this.world.balance.boss;
    const dx = endX - cx;
    const dy = endY - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    l.attackId = attackId;
    l.startTick = startTick;
    l.hitTick = hitTick;
    l.stopTick = chargeStopTick(hitTick, len, bal.charge.speedMps);
    chargeLaneLook(cx, cy, dx / len, dy / len, len, bal.radiusM, l.lane);
    l.crashOn = crash;
    // The strip: origin at the back edge, cropped to the lane's length (no stretching of the hatching).
    const cropW = Math.min(l.strip.width, Math.round(l.lane.lengthM * BOSS_LANE_PX_PER_M));
    l.strip.setCrop(0, 0, cropW, l.strip.height).setPosition(l.lane.x0, l.lane.y0).setRotation(l.lane.angle);
    l.crash.setPosition(l.lane.frontX, l.lane.frontY).setRotation(l.lane.angle);
  }

  /** Story 6.6: a throw ring at the landing spot (fixed at the start: F7) and the chunk's look (D7). */
  private onRing(attackId: number, startTick: number, hitTick: number, cx: number, cy: number, radiusM: number, src: number): void {
    const r = this.ringSlot;
    if (r.attackId === attackId) return;
    r.attackId = attackId;
    r.startTick = startTick;
    r.hitTick = hitTick;
    r.releaseTick = hitTick - Math.round(this.world.balance.boss.throw.flightS * 20);
    r.cx = cx;
    r.cy = cy;
    r.r = radiusM;
    r.fromX = this.world.boss.x;
    r.fromY = this.world.boss.y;
    const side = (2 * radiusM * (BOSS_TELE_RADIUS_PX + 4)) / BOSS_TELE_RADIUS_PX;
    r.disc.setPosition(cx, cy).setDisplaySize(side, side);
    r.chunk.setFrame(src === 1 ? BOSS_FX_FRAMES.chunkRubble : src === 2 ? BOSS_FX_FRAMES.chunkCar : BOSS_FX_FRAMES.chunkRoad);
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
    // A late Game scene / a reconnect mid-telegraph: the state carries the attack (6.6: a rush, a chunk in flight too).
    const a = b.attack;
    if (b.state === BOSS_STATE.TELEGRAPH || b.state === BOSS_STATE.RUSH || (a.kind === BOSS_ATTACK.THROW && serverTick <= a.hitTick)) {
      this.onTelegraph(a.id, a.kind, a.startTick, a.hitTick, a.cx, a.cy, a.radiusM, a.cx + a.dirX * a.lenM, a.cy + a.dirY * a.lenM, a.crash, a.src);
    }
    this.drawTelegraphs(serverTick);
    this.drawLane(serverTick);
    this.drawRing(serverTick, b.state === BOSS_STATE.DEAD || b.state === BOSS_STATE.NONE);
    this.drawFx(dtS);
    if (b.state === BOSS_STATE.DEAD) {
      this.drawDead(dtS, drawX, drawY);
      return;
    }
    this.deadS = 0;
    if (!on) {
      if (this.bodyTop.visible) this.bodyTop.setVisible(false);
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
    // Review M2 / L-b: a zombie under it stays readable — the body fades down while one the player
    // can see (drawn: not hidden by 6.4's fog) stands under it.
    const alpha = bossBodyAlpha(this.body.alpha, this.drawnZombieUnder(zombieDrawn), dtS);
    if (this.body.alpha !== alpha) this.body.setAlpha(alpha);
    // Story 6.6: the lane (or a throw ring over it) is drawn above the darkness layer; keep the pose
    // readable on top of it in the light (in the dark the outline + eyes frame is already above).
    const over = !this.dark && (this.laneSlot.strip.visible || (this.ringSlot.disc.visible && Math.hypot(this.ringSlot.cx - drawX, this.ringSlot.cy - drawY) < this.ringSlot.r + this.world.balance.boss.radiusM));
    if (over) {
      if (this.bodyTop.frame.name !== name) this.bodyTop.setFrame(name);
      this.bodyTop.setPosition(drawX, drawY).setRotation(b.facing).setAlpha(alpha).setVisible(true);
      if (this.flashS > 0) this.bodyTop.setTint(HIT_TINT);
      else this.bodyTop.clearTint();
    } else if (this.bodyTop.visible) this.bodyTop.setVisible(false);
    if (this.dark) {
      const o = frames[b.enraged ? BOSS_FRAME.outlineEnraged : BOSS_FRAME.outline] as string;
      if (this.outline.frame.name !== o) this.outline.setFrame(o);
      this.outline.setPosition(drawX, drawY).setRotation(b.facing).setVisible(true);
    } else if (this.outline.visible) this.outline.setVisible(false);
    if (targetAt) this.skull.setPosition(targetAt.x, targetAt.y - SKULL_LIFT_M).setVisible(true);
    else if (this.skull.visible) this.skull.setVisible(false);
  }

  /** Story 6.7 (D6): the collapse, then the dark body on the street (not solid) until the build start. */
  private drawDead(dtS: number, drawX: number, drawY: number): void {
    const b = this.world.boss;
    this.deadS += dtS;
    const frames = BOSS_FRAMES[b.look % BOSS_FRAMES.length] as readonly string[];
    const name = frames[BOSS_FRAME.deadA + deathFrameIndex(this.deadS, this.world.balance.boss.death.collapseS)] as string;
    if (this.body.frame.name !== name) this.body.setFrame(name);
    this.body.setPosition(drawX, drawY).setRotation(b.facing).setTint(DEAD_TINT).setAlpha(1).setVisible(true);
    if (this.bodyTop.visible) this.bodyTop.setVisible(false);
    if (this.outline.visible) this.outline.setVisible(false); // no eyes above the dark: it is no danger now
    if (this.skull.visible) this.skull.setVisible(false);
  }

  private drawLane(serverTick: number): void {
    const l = this.laneSlot;
    if (l.attackId < 0 || Number.isNaN(serverTick) || this.world.boss.state === BOSS_STATE.DEAD) {
      if (l.strip.visible) {
        l.strip.setVisible(false);
        l.fill.clear().setVisible(false);
        l.crash.setVisible(false);
      }
      if (this.world.boss.state === BOSS_STATE.DEAD) l.attackId = -1; // 6.7 F5: a cancelled rush is gone
      return;
    }
    const look = chargeLaneProgress(serverTick, l.startTick, l.hitTick, l.stopTick, this.look);
    if (!look.visible) {
      l.strip.setVisible(false);
      l.fill.clear().setVisible(false);
      l.crash.setVisible(false);
      if (serverTick > l.stopTick) l.attackId = -1;
      return;
    }
    l.strip.setAlpha(look.alpha).setVisible(true);
    l.crash.setAlpha(look.alpha).setVisible(l.crashOn);
    // The fill: from the body's back along the lane, to progress × length.
    const len = l.lane.lengthM * look.progress;
    const half = this.world.balance.boss.charge.laneWidthM / 2;
    const c = Math.cos(l.lane.angle);
    const s = Math.sin(l.lane.angle);
    const p = this.laneFill;
    const set = (i: number, along: number, side: number): void => {
      const q = p[i] as { x: number; y: number };
      q.x = l.lane.x0 + c * along - s * side;
      q.y = l.lane.y0 + s * along + c * side;
    };
    set(0, 0, -half);
    set(1, len, -half);
    set(2, len, half);
    set(3, 0, half);
    const g = l.fill.clear();
    if (len > 0) {
      const [q0, q1, q2, q3] = p as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
      g.fillStyle(FILL_COLOR, FILL_ALPHA * look.alpha).fillTriangle(q0.x, q0.y, q1.x, q1.y, q2.x, q2.y).fillTriangle(q0.x, q0.y, q2.x, q2.y, q3.x, q3.y);
    }
    g.setVisible(true);
  }

  private drawRing(serverTick: number, cancelled: boolean): void {
    const r = this.ringSlot;
    if (r.attackId < 0 || Number.isNaN(serverTick) || cancelled) {
      if (r.disc.visible || r.chunk.visible) {
        r.disc.setVisible(false);
        r.inner.clear().setVisible(false);
        r.chunk.setVisible(false);
      }
      if (cancelled) r.attackId = -1; // 6.7 F5: a chunk in flight when it died never lands
      return;
    }
    const look = telegraphProgress(serverTick, r.startTick, r.hitTick, this.look);
    if (!look.visible) {
      r.disc.setVisible(false);
      r.inner.clear().setVisible(false);
      r.chunk.setVisible(false);
      if (serverTick > r.hitTick) r.attackId = -1;
      return;
    }
    r.disc.setAlpha(look.alpha).setVisible(true);
    const g = r.inner.clear();
    const ir = throwInnerRadius(look.progress, r.r);
    if (ir > 0.02) g.lineStyle(0.12, RING_WHITE, 0.9 * look.alpha).strokeCircle(r.cx, r.cy, ir);
    g.setVisible(true);
    // The chunk in flight (the lift shows it in the pose's hands).
    const ch = throwChunkAt(serverTick, r.releaseTick, r.hitTick, r.fromX, r.fromY, r.cx, r.cy, this.chunkLook);
    if (!ch.visible) {
      if (r.chunk.visible) r.chunk.setVisible(false);
      return;
    }
    const scale = 1 + ch.heightM / 6;
    r.chunk
      .setPosition(ch.x, ch.y - ch.heightM * 0.35)
      .setDisplaySize(BOSS_CHUNK_M * scale, BOSS_CHUNK_M * scale)
      .setRotation(ch.f * 5)
      .setVisible(true);
  }

  private drawFx(dtS: number): void {
    const g = this.fxG.clear();
    for (const f of this.fx) {
      if (f.ageS >= f.lifeS) continue;
      f.ageS += dtS;
      const k = Math.min(1, f.ageS / f.lifeS);
      g.lineStyle(0.18, f.color, 0.8 * (1 - k)).strokeCircle(f.x, f.y, f.r0 + (f.r1 - f.r0) * k);
    }
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

