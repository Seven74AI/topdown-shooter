import type * as Phaser from "phaser";
import { BOSS_ATTACK, BOSS_STATE, TICK_DT_S, behemothLookIndex, zombieUnderBoss, type World } from "@topdown/shared";
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
  BOSS_EYES,
  BOSS_EYE_FRAMES,
  BOSS_EYE_M,
  BOSS_LANE,
  BOSS_LANE_PX_PER_M,
  BOSS_OUTLINE,
  BOSS_OUTLINE_FRAMES,
  BOSS_PX_PER_M,
  BOSS_RING,
  BOSS_TELE,
  BOSS_TELE_RADIUS_PX,
  TELE_TICKS,
  TELE_TICK_IN_PX,
  TELE_TICK_MAJOR,
  ensureBossTextures,
} from "./city/bossAtlas";
import { ABOVE_DARK, aboveDarkness } from "./darkness/aboveDark";
import { BH_EYE_AHEAD_R, BH_EYE_SIDE_R, BH_R_M, behemothHeadM, type BhPoint } from "./city/behemothArt";
import { BOSS_POSES, bossHasEnraged, bossHasSheen, relitBodyName, relitSheenName, relitSheenStrip, relitVeinName } from "./city/bossFrames";
import { bossRelitCrop, bossRelitKey, bossRelitLook, bossRelitReady, ensureBossRelit, pumpBossRelit, requestBossLook } from "./city/bossRelit";
import { SHEEN_STEPS, sheenStep } from "./city/charRelight";
import { charBakeProgress } from "./city/charactersAtlas";
import { ATLAS_FX, FX_DUST } from "./city/spriteAtlas";
import { BOSS_ANIM, BossAnim, type BossAnimInput } from "./bossAnim";
import { BOSS_DUST, BossDust } from "./bossDust";
import { urlOptions } from "../debug/urlOptions";
import { BOSS_HUD, HUD_FRAMES, HUD_RED, ensureHudWarnTextures, hudFlicker, hudFrameCssSize } from "./city/hudWarnArt";
import {
  chargeLaneLook,
  chargeLaneProgress,
  chargeStopTick,
  deathFrameIndex,
  slamFrameIndex,
  telegraphProgress,
  throwChunkAt,
  throwLiftProgress,
  warningPoseIndex,
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
/** Story 6.6: the charge lane's fill (the slam has its own glowing countdown). */
const FILL_COLOR = 0xff2828;
const FILL_ALPHA = 0.38;
const RING_WHITE = 0xffffff;
const PUFF_COLOR = 0xb8ada0;
const ROAR_COLOR = 0xff4a2e;
/** Story 6.6 / 6.7: transient rings (roar shock ring, drop puff, crash dust) — a pool. */
const RINGS = 4;
const DEAD_TINT = 0x8a8a8a;
/** Review M2: the body's opacity while zombies walk under it (they read through it; no new colour). */
export const BOSS_DIM_ALPHA = 0.55;
/** Review L-b: seconds the body takes to dim or come back (no flicker as a zombie crosses its rim). */
export const BOSS_DIM_FADE_S = 0.25;
/** Story 9.15 (B1): the relit bake of the next Behemoth's look waits for the characters' bake, at most this long. */
const BOSS_BAKE_WAIT_S = 25;
/** Story 9.15: the layers' depth offsets above the body (roar crossfade, veins, sheen, eyes) and the dust's. */
const LAYER_DZ = 0.0004;
const DUST_DZ = 0.01;

/** Story 9.15: relit frame names, built once (the view never builds strings per frame). */
const RELIT_BODY: readonly (readonly [string, string])[] = BOSS_POSES.map((_, i) => [relitBodyName(i, false), bossHasEnraged(i) ? relitBodyName(i, true) : relitBodyName(i, false)] as const);
const RELIT_VEIN: readonly (string | null)[] = BOSS_POSES.map((_, i) => (bossHasEnraged(i) || i === BOSS_FRAME.deadA ? relitVeinName(i) : null));
const RELIT_SHEEN_STRIP: readonly (readonly [string, string] | null)[] = BOSS_POSES.map((_, i) => (bossHasSheen(i) ? ([relitSheenStrip(i, false), relitSheenStrip(i, true)] as const) : null));
const RELIT_SHEEN: readonly (readonly (readonly string[])[] | null)[] = BOSS_POSES.map((_, i) => (bossHasSheen(i) ? [false, true].map((e) => Array.from({ length: SHEEN_STEPS }, (_, k) => relitSheenName(i, e, k))) : null));

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
  /** Story 9.15: the roar's enraged picture over the calm one; the vein + split glow, the sheen, the eyes (all ADD but the first). */
  private readonly body2: Phaser.GameObjects.Image;
  private readonly vein: Phaser.GameObjects.Image;
  private readonly sheen: Phaser.GameObjects.Image;
  private readonly eyes: Phaser.GameObjects.Image[] = [];
  private readonly dustImgs: Phaser.GameObjects.Image[] = [];
  private readonly dust: BossDust;
  private readonly anim: BossAnim;
  private readonly animIn: BossAnimInput = { state: 0, attackKind: 0, progress: 0, enraged: false, step: 0, stepPhase: 0, released: false, slammed: false, crashed: false };
  private readonly head: BhPoint = { x: 0, y: 0 };
  private slammedNow = false;
  private crashedNow = false;
  private rushAcc = 0;
  private crumbAcc = 0;
  private crumbs = 0;
  private roarDust = false;
  private deathDust = false;
  private layerDepth = BODY_DEPTH;
  /** The picture `pick` chose (texture key, frame, whether it is the enraged one). */
  private pickKey = BOSS_ATLAS;
  private pickName = "";
  private pickEnr = false;
  /** Story 9.15 (B1): the look the relit bake is asked for, predicted for the next Behemoth from the run seed. */
  private predSeed = Number.NaN;
  private predNumber = -1;
  private predPrev = -1;
  private predLook = 0;
  private bakeAllowed = false;
  private frameNo = 0;
  /** `?fx=low`: no sheen, half the dust (as the characters' caps halve). */
  private readonly lowFx = urlOptions().lowFx;
  private lastDt = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly world: Readonly<World>,
    private readonly runSeed: () => number = () => world.seed,
  ) {
    const b = world.balance.boss;
    ensureBossTextures(scene, b.radiusM / b.slam.radiusM);
    ensureBossRelit(scene);
    const side = BOSS_FRAME_PX / BOSS_PX_PER_M; // 7 m: the frame's metres
    this.body = scene.add.image(0, 0, BOSS_ATLAS, BOSS_FRAMES[0]?.[0]).setDisplaySize(side, side).setDepth(BODY_DEPTH).setVisible(false);
    this.bodyTop = scene.add.image(0, 0, BOSS_ATLAS, BOSS_FRAMES[0]?.[0]).setDisplaySize(side, side).setDepth(ABOVE_DARK.telegraph + 0.002).setVisible(false);
    this.outline = aboveDarkness(scene.add.image(0, 0, BOSS_OUTLINE, BOSS_OUTLINE_FRAMES[0]?.[0]).setDisplaySize(side, side).setVisible(false), "boss");
    // Story 9.15: the layers (pooled once; additive ones are never tinted by the hit flash)
    this.body2 = scene.add.image(0, 0, BOSS_ATLAS, BOSS_FRAMES[0]?.[0]).setDisplaySize(side, side).setDepth(BODY_DEPTH + LAYER_DZ).setVisible(false);
    this.vein = scene.add.image(0, 0, BOSS_ATLAS, BOSS_FRAMES[0]?.[0]).setDisplaySize(side, side).setBlendMode(BLEND_ADD).setDepth(BODY_DEPTH + 2 * LAYER_DZ).setVisible(false);
    this.sheen = scene.add.image(0, 0, BOSS_ATLAS, BOSS_FRAMES[0]?.[0]).setDisplaySize(side, side).setBlendMode(BLEND_ADD).setDepth(BODY_DEPTH + 3 * LAYER_DZ).setVisible(false);
    for (let i = 0; i < 2; i++) this.eyes.push(scene.add.image(0, 0, BOSS_EYES, BOSS_EYE_FRAMES[0]).setDisplaySize(BOSS_EYE_M, BOSS_EYE_M).setBlendMode(BLEND_ADD).setDepth(BODY_DEPTH + 4 * LAYER_DZ).setVisible(false));
    const nDust = this.lowFx ? Math.floor(BOSS_DUST.pool / 2) : BOSS_DUST.pool;
    this.dust = new BossDust(nDust);
    for (let i = 0; i < nDust; i++) this.dustImgs.push(scene.add.image(0, 0, ATLAS_FX, FX_DUST).setTint(PUFF_COLOR).setDepth(BODY_DEPTH + DUST_DZ).setVisible(false));
    this.anim = new BossAnim({ slamRecoverS: b.slam.recoverS, roarS: b.enrage.roarS, stepS: WALK_STEP_M / b.speedMps, stepEnragedS: WALK_STEP_M / (b.speedMps * b.enrage.speedMult) });
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
    this.crashedNow = true; // Story 9.15: the crash burst and the release peak (next update)
    this.ring(x, y, this.world.balance.boss.radiusM, this.world.balance.boss.radiusM + 1.5, 0.5, PUFF_COLOR);
  }

  /** Story 6.6 `boss.thrown_impact`: the crater (the shared decal pool, oldest reused: D8) and a dust ring. */
  onThrownImpact(x: number, y: number, rot: number): void {
    const d = this.decals[this.nextDecal] as Phaser.GameObjects.Image;
    this.nextDecal = (this.nextDecal + 1) % this.decals.length;
    d.setFrame(BOSS_FX_FRAMES.crater).setDisplaySize(BOSS_CRATER_M, BOSS_CRATER_M).setPosition(x, y).setRotation(rot).setVisible(true);
    this.ring(x, y, 0.5, this.world.balance.boss.throw.radiusM, 0.4, PUFF_COLOR);
    this.dust.burst(BOSS_DUST.throwLanding, x, y); // Story 9.15: the landing puff
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
    this.slammedNow = true; // Story 9.15: everything peaks on the hit, dust from the fists (next update)
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
    this.lastDt = dtS;
    const b = this.world.boss;
    const on = b.state >= BOSS_STATE.WALK && b.state <= BOSS_STATE.ROAR;
    // A late Game scene / a reconnect mid-telegraph: the state carries the attack (6.6: a rush, a chunk in flight too).
    const a = b.attack;
    if (b.state === BOSS_STATE.TELEGRAPH || b.state === BOSS_STATE.RUSH || (a.kind === BOSS_ATTACK.THROW && serverTick <= a.hitTick)) {
      this.onTelegraph(a.id, a.kind, a.startTick, a.hitTick, a.cx, a.cy, a.radiusM, a.cx + a.dirX * a.lenM, a.cy + a.dirY * a.lenM, a.crash, a.src);
    }
    this.clockS += dtS;
    this.bakeLook(on || b.state === BOSS_STATE.DEAD);
    this.drawTelegraphs(serverTick);
    this.drawLane(serverTick);
    this.drawRing(serverTick, b.state === BOSS_STATE.DEAD || b.state === BOSS_STATE.NONE);
    this.drawFx(dtS);
    this.dust.step(dtS);
    if (b.state === BOSS_STATE.DEAD) {
      this.drawDead(dtS, drawX, drawY);
      this.drawDust();
      return;
    }
    this.deadS = 0;
    this.deathDust = false;
    if (!on) {
      if (this.bodyTop.visible) this.bodyTop.setVisible(false);
      if (this.body.visible) {
        this.body.setVisible(false);
        this.outline.setVisible(false);
        this.tag.setVisible(false);
        this.lock.setVisible(false);
        this.hideLayers();
      }
      if (b.state === BOSS_STATE.NONE) {
        this.anim.reset();
        this.dust.clear();
      }
      this.slammedNow = false;
      this.crashedNow = false;
      this.drawDust();
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
    const look = b.look % BOSS_FRAMES.length;
    const frames = BOSS_FRAMES[look] as readonly string[];
    const stepF = this.walked / WALK_STEP_M;
    const step = Math.floor(stepF);
    let f: number = step % 2 === 0 ? BOSS_FRAME.walkA : BOSS_FRAME.walkB;
    let progress = 0;
    const telegraph = b.state === BOSS_STATE.TELEGRAPH;
    if (telegraph && b.attack.kind === BOSS_ATTACK.SLAM) {
      progress = telegraphProgress(serverTick, b.attack.startTick, b.attack.hitTick, this.look).progress;
      f = BOSS_FRAME.slamA + slamFrameIndex(progress);
    } else if (telegraph && b.attack.kind === BOSS_ATTACK.CHARGE) {
      // Story 9.15 (G2 A): the charge pose by progress (half-way, then head down)
      progress = telegraphProgress(serverTick, b.attack.startTick, b.attack.hitTick, this.look).progress;
      f = warningPoseIndex(progress) === 0 ? BOSS_FRAME.chargeB : BOSS_FRAME.charge;
    } else if (telegraph && b.attack.kind === BOSS_ATTACK.THROW) {
      // Story 9.15 (G2 A): the throw pose by the lift's progress (lifting, then the chunk overhead)
      progress = throwLiftProgress(serverTick, b.attack.startTick, this.releaseTickOf(b.attack.hitTick));
      f = warningPoseIndex(progress) === 0 ? BOSS_FRAME.throwB : BOSS_FRAME.throw;
    } else if (b.state === BOSS_STATE.RECOVER && this.slamHitS > 0) f = BOSS_FRAME.slamHit;
    else if (b.state === BOSS_STATE.STUN) f = BOSS_FRAME.stun;
    else if (b.state === BOSS_STATE.ROAR) f = BOSS_FRAME.roar;
    else if (b.state === BOSS_STATE.RUSH) f = BOSS_FRAME.rush;
    // the action plan (Story 9.15): breath, heartbeat, glow, eyes
    const ai = this.animIn;
    ai.state = b.state;
    ai.attackKind = b.attack.kind;
    ai.progress = progress;
    ai.enraged = b.enraged;
    ai.step = step;
    ai.stepPhase = stepF - step;
    ai.released = b.attack.kind === BOSS_ATTACK.THROW && Number.isFinite(serverTick) && serverTick >= this.releaseTickOf(b.attack.hitTick) && serverTick <= b.attack.hitTick;
    ai.slammed = this.slammedNow;
    ai.crashed = this.crashedNow;
    const an = this.anim.update(dtS, ai);
    // the picture: relit once landed (enraged when it is), else the plain atlas frame (never a blank one)
    const enr = an.enragedMix >= 1 && bossHasEnraged(f);
    this.pick(f, enr, frames);
    const side = (BOSS_FRAME_PX / BOSS_PX_PER_M) * an.breath;
    if (this.body.texture.key !== this.pickKey || this.body.frame.name !== this.pickName) BossView.setPicture(this.body, this.pickKey, this.pickName);
    this.body.setDisplaySize(side, side).setPosition(drawX, drawY).setRotation(b.facing).setVisible(true);
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
      if (this.bodyTop.texture.key !== this.pickKey || this.bodyTop.frame.name !== this.pickName) BossView.setPicture(this.bodyTop, this.pickKey, this.pickName);
      this.bodyTop.setDisplaySize(side, side).setPosition(drawX, drawY).setRotation(b.facing).setAlpha(alpha).setVisible(true);
      if (this.flashS > 0) this.bodyTop.setTint(HIT_TINT);
      else this.bodyTop.clearTint();
    } else if (this.bodyTop.visible) this.bodyTop.setVisible(false);
    this.drawLayers(f, an.enragedMix, an.glow, an.eyes, an.eyesRed, an.eyeScale, an.breath, alpha, drawX, drawY, b.facing, over);
    this.emitDust(f, progress, drawX, drawY, b.facing);
    this.slammedNow = false;
    this.crashedNow = false;
    this.drawDust();
    if (this.dark) {
      const o = (BOSS_OUTLINE_FRAMES[look] as readonly [string, string])[b.enraged ? 1 : 0];
      if (this.outline.frame.name !== o) this.outline.setFrame(o);
      this.outline.setPosition(drawX, drawY).setRotation(b.facing).setVisible(true);
    } else if (this.outline.visible) this.outline.setVisible(false);
    if (targetAt) this.drawLock(targetAt.x, targetAt.y);
    else if (this.tag.visible) {
      this.tag.setVisible(false);
      this.lock.clear().setVisible(false);
    }
  }

  /** The throw's release tick (the impact minus the flight), as `onRing`. */
  private releaseTickOf(hitTick: number): number {
    return hitTick - Math.round(this.world.balance.boss.throw.flightS / TICK_DT_S);
  }

  /** The picture for body frame `f`: relit (enraged if asked and landed), else relit calm, else the plain frame. */
  private pick(f: number, enr: boolean, frames: readonly string[]): void {
    const names = RELIT_BODY[f] as readonly [string, string];
    if (enr && bossRelitReady(names[1])) {
      this.pickName = names[1];
      this.pickEnr = true;
    } else if (bossRelitReady(names[0])) {
      this.pickName = names[0];
      this.pickEnr = false;
    } else {
      this.pickKey = BOSS_ATLAS;
      this.pickName = frames[f] as string;
      this.pickEnr = false;
      return;
    }
    this.pickKey = bossRelitKey(this.pickName);
  }

  /** Puts `img` on relit frame `name` (its own sheet), cropped to the picture's opaque box (B8). */
  private static setRelit(img: Phaser.GameObjects.Image, name: string): void {
    const key = bossRelitKey(name);
    if (img.texture.key !== key || img.frame.name !== name) BossView.setPicture(img, key, name);
  }

  /**
   * Story 9.15 (B8): `img` shows frame `name` of texture `key`; a relit picture is cropped to its opaque box (the 7 m
   * frame is mostly empty: no fill for the margins, which counted in the software renderer), a plain one is not.
   */
  private static setPicture(img: Phaser.GameObjects.Image, key: string, name: string): void {
    img.setTexture(key, name);
    const c = key === BOSS_ATLAS ? undefined : bossRelitCrop(name);
    if (c) img.setCrop(c[0], c[1], c[2], c[3]);
    else img.setCrop();
  }

  private setLayerDepth(over: boolean): void {
    const d = over ? ABOVE_DARK.telegraph + 0.002 : BODY_DEPTH;
    if (d === this.layerDepth) return;
    this.layerDepth = d;
    this.body2.setDepth(d + LAYER_DZ);
    this.vein.setDepth(d + 2 * LAYER_DZ);
    this.sheen.setDepth(d + 3 * LAYER_DZ);
    for (const e of this.eyes) e.setDepth(d + 4 * LAYER_DZ);
  }

  /**
   * Story 9.15 (G3 E2, G4 A, B3): the roar's enraged picture over the calm one, the vein + split glow (whole layer on
   * the beat), the sheen (walk frames), the two eyes at the pose's eye points; all with the body's breath, rotation and
   * dim (`alpha`), above the lane with `bodyTop` (`over`). The additive ones never take the hit flash.
   */
  private drawLayers(f: number, mix: number, glow: number, eyes: number, red: boolean, eyeScale: number, breath: number, alpha: number, x: number, y: number, rot: number, over: boolean): void {
    this.setLayerDepth(over);
    const side = (BOSS_FRAME_PX / BOSS_PX_PER_M) * breath;
    // the roar: the enraged picture fading in over the calm one
    const crossfade = mix > 0 && mix < 1 && bossHasEnraged(f) && bossRelitReady((RELIT_BODY[f] as readonly [string, string])[1]) && !this.pickEnr;
    if (crossfade) {
      BossView.setRelit(this.body2, (RELIT_BODY[f] as readonly [string, string])[1]);
      this.body2.setDisplaySize(side, side).setPosition(x, y).setRotation(rot).setAlpha(alpha * mix).setVisible(true);
      if (this.flashS > 0) this.body2.setTint(HIT_TINT);
      else this.body2.clearTint();
    } else if (this.body2.visible) this.body2.setVisible(false);
    // the veins and splits: only over an enraged picture (or the roar's)
    const vName = RELIT_VEIN[f];
    const vOn = vName !== null && vName !== undefined && glow > 0.004 && (this.pickEnr || crossfade) && bossRelitReady(vName);
    if (vOn) {
      BossView.setRelit(this.vein, vName);
      this.vein.setDisplaySize(side, side).setPosition(x, y).setRotation(rot).setAlpha(alpha * glow * (crossfade ? mix : 1)).setVisible(true);
    } else if (this.vein.visible) this.vein.setVisible(false);
    // the sheen drifting over the glossy parts (the walk, the picture shown)
    const strips = RELIT_SHEEN_STRIP[f];
    const sOn = !this.lowFx && strips !== null && strips !== undefined && this.pickKey !== BOSS_ATLAS && bossRelitReady(strips[this.pickEnr ? 1 : 0]);
    if (sOn) {
      const name = ((RELIT_SHEEN[f] as readonly (readonly string[])[])[this.pickEnr ? 1 : 0] as readonly string[])[sheenStep(this.clockS)] as string;
      BossView.setRelit(this.sheen, name);
      this.sheen.setDisplaySize(side, side).setPosition(x, y).setRotation(rot).setAlpha(alpha).setVisible(true);
    } else if (this.sheen.visible) this.sheen.setVisible(false);
    // the eyes
    const p = BOSS_POSES[f] as (typeof BOSS_POSES)[number];
    if (eyes > 0.004 && p.pose !== "dead") {
      behemothHeadM(p.pose, p.k, this.head);
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      const fx = (this.head.x + BH_EYE_AHEAD_R * BH_R_M) * breath;
      const frame = BOSS_EYE_FRAMES[red ? 1 : 0];
      const size = BOSS_EYE_M * eyeScale * breath;
      for (let i = 0; i < 2; i++) {
        const fy = (this.head.y + (i === 0 ? -1 : 1) * BH_EYE_SIDE_R * BH_R_M) * breath;
        const e = this.eyes[i] as Phaser.GameObjects.Image;
        if (e.frame.name !== frame) e.setFrame(frame);
        e.setPosition(x + c * fx - sn * fy, y + sn * fx + c * fy).setDisplaySize(size, size).setAlpha(alpha * Math.min(1, eyes)).setVisible(true);
      }
    } else for (const e of this.eyes) if (e.visible) e.setVisible(false);
  }

  private hideLayers(): void {
    if (this.body2.visible) this.body2.setVisible(false);
    if (this.vein.visible) this.vein.setVisible(false);
    if (this.sheen.visible) this.sheen.setVisible(false);
    for (const e of this.eyes) if (e.visible) e.setVisible(false);
  }

  /** Body-local (m, facing +x) → world, into `this.head` (reused). */
  private toWorld(x: number, y: number, rot: number, lx: number, ly: number): BhPoint {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    this.head.x = x + c * lx - s * ly;
    this.head.y = y + s * lx + c * ly;
    return this.head;
  }

  /** Story 9.15 (the plan's dust lane, `puffsFor`; R5: after its cause). Body-local metres turned to the world. */
  private emitDust(f: number, progress: number, x: number, y: number, rot: number): void {
    const D = BOSS_DUST;
    const r = BH_R_M;
    const b = this.world.boss;
    const dtS = this.lastDt;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const d = this.dust;
    if (this.slammedNow) {
      for (let sd = -1; sd <= 1; sd += 2) {
        const p = this.toWorld(x, y, rot, D.fistAhead * r, sd * D.fistSide * r); // the fists hit the ground
        d.burst(D.slamFists, p.x, p.y);
        const G = D.slamGrit; // grit falls off the shoulders, one after another
        for (let k = 0; k < G.n; k++) {
          const lx = G.ahead * r + (d.next(1) - 0.5) * 0.4;
          const ly = sd * G.side * r;
          const vx = (d.next(2) - 0.5) * 0.4;
          const vy = sd * (G.outMin + (G.outMax - G.outMin) * d.next(3));
          const q = this.toWorld(x, y, rot, lx, ly);
          d.emit(q.x, q.y, c * vx - s * vy, s * vx + c * vy, G.r, G.lifeS, G.delayS + k * G.everyS);
        }
      }
    }
    if (this.crashedNow) {
      const p = this.toWorld(x, y, rot, D.crashAhead * r, 0);
      d.burst(D.crash, p.x, p.y);
    }
    if (b.state === BOSS_STATE.RUSH) {
      const T = D.rushTrail; // the trail kicked up behind it
      this.rushAcc += dtS;
      while (this.rushAcc >= T.everyS) {
        this.rushAcc -= T.everyS;
        const p = this.toWorld(x, y, rot, -T.behind * r, (d.next(1) - 0.5) * T.across * r);
        const vx = -(T.backMin + (T.backMax - T.backMin) * d.next(2));
        const vy = (d.next(3) - 0.5) * 0.6;
        d.emit(p.x, p.y, c * vx - s * vy, s * vx + c * vy, T.r0 + T.rSpread * d.next(4), T.lifeS, 0);
      }
    } else this.rushAcc = 0;
    if (f === BOSS_FRAME.throwB || f === BOSS_FRAME.throw) {
      const C = D.throwCrumbs; // crumbs fall from the chunk overhead
      if (progress >= C.fromP && this.crumbs < C.n) {
        this.crumbAcc += dtS;
        while (this.crumbAcc >= C.everyS && this.crumbs < C.n) {
          this.crumbAcc -= C.everyS;
          this.crumbs++;
          const p = this.toWorld(x, y, rot, (d.next(1) - 0.4) * 0.6, (d.next(2) - 0.5) * 0.6);
          d.emit(p.x, p.y, (d.next(3) - 0.5) * 0.3, (d.next(4) - 0.5) * 0.3, C.r, C.lifeS, 0);
        }
      }
    } else {
      this.crumbAcc = 0;
      this.crumbs = 0;
    }
    if (b.state === BOSS_STATE.ROAR) {
      if (!this.roarDust && this.anim.stateTime >= BOSS_ANIM.eyes.roarSnapS) {
        this.roarDust = true;
        d.burst(D.roar, x, y); // blown off as the roar comes out, with the shock ring
      }
    } else this.roarDust = false;
  }

  private drawDust(): void {
    const d = this.dust;
    for (let i = 0; i < d.n; i++) {
      const img = this.dustImgs[i] as Phaser.GameObjects.Image;
      if (!d.live(i)) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const sz = d.size(i);
      img.setPosition(d.x[i] as number, d.y[i] as number).setDisplaySize(sz, sz).setAlpha(d.alpha(i)).setVisible(true);
    }
  }

  /**
   * Story 9.15 (B1): the relit bake of the look in play (on the street) or of the next Behemoth (predicted from the run
   * seed, after the characters' bake), pumped once a frame.
   */
  private bakeLook(present: boolean): void {
    const b = this.world.boss;
    let want = b.look;
    if (!present) {
      const seed = this.runSeed();
      if (seed !== this.predSeed || b.number !== this.predNumber || b.look !== this.predPrev) {
        this.predSeed = seed;
        this.predNumber = b.number;
        this.predPrev = b.look;
        this.predLook = behemothLookIndex(seed, b.number + 1, b.number >= 1 ? b.look : -1);
      }
      want = this.predLook;
      if (!this.bakeAllowed && (b.state === BOSS_STATE.WARNING || this.clockS > BOSS_BAKE_WAIT_S || (this.frameNo % 30 === 0 && charDone()))) this.bakeAllowed = true;
      if (!this.bakeAllowed) {
        this.frameNo++;
        return;
      }
    }
    if (want !== bossRelitLook()) requestBossLook(want);
    pumpBossRelit(this.frameNo++);
  }

  /** Story 6.7 (D6): the collapse, then the dark body on the street (not solid) until the build start. */
  private drawDead(dtS: number, drawX: number, drawY: number): void {
    const b = this.world.boss;
    const collapseS = this.world.balance.boss.death.collapseS;
    this.deadS += dtS;
    const frames = BOSS_FRAMES[b.look % BOSS_FRAMES.length] as readonly string[];
    const f = BOSS_FRAME.deadA + deathFrameIndex(this.deadS, collapseS);
    this.pick(f, false, frames);
    if (this.body.texture.key !== this.pickKey || this.body.frame.name !== this.pickName) BossView.setPicture(this.body, this.pickKey, this.pickName);
    const side = BOSS_FRAME_PX / BOSS_PX_PER_M;
    this.body.setDisplaySize(side, side).setPosition(drawX, drawY).setRotation(b.facing).setTint(DEAD_TINT).setAlpha(1).setVisible(true);
    if (this.bodyTop.visible) this.bodyTop.setVisible(false);
    if (this.outline.visible) this.outline.setVisible(false); // no eyes above the dark: it is no danger now
    if (this.tag.visible) {
      this.tag.setVisible(false); // no target lock once it is dead
      this.lock.clear().setVisible(false);
    }
    // Story 9.15 (R4): the heart stops first — the last weak beat on dead_a, out by 0.4 s; no eyes, no sheen
    const ai = this.animIn;
    ai.state = b.state;
    ai.enraged = b.enraged;
    ai.slammed = false;
    ai.crashed = false;
    const an = this.anim.update(dtS, ai);
    this.setLayerDepth(false);
    if (this.body2.visible) this.body2.setVisible(false);
    if (this.sheen.visible) this.sheen.setVisible(false);
    for (const e of this.eyes) if (e.visible) e.setVisible(false);
    const vName = RELIT_VEIN[BOSS_FRAME.deadA] as string;
    if (f === BOSS_FRAME.deadA && an.deathGlow > 0.004 && bossRelitReady(vName)) {
      BossView.setRelit(this.vein, vName);
      this.vein.setDisplaySize(side, side).setPosition(drawX, drawY).setRotation(b.facing).setAlpha(an.deathGlow).setVisible(true);
    } else if (this.vein.visible) this.vein.setVisible(false);
    // the big dust puff as it hits the ground (R5)
    if (!this.deathDust && this.deadS >= collapseS * BOSS_DUST.death.atShare) {
      this.deathDust = true;
      const p = this.toWorld(drawX, drawY, b.facing, -0.2, 0.3);
      this.dust.burst(BOSS_DUST.death, p.x, p.y);
    }
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

/** Story 9.15 (B1): the characters' bake is done (the boss bake starts after it). */
function charDone(): boolean {
  const p = charBakeProgress();
  return p.total > 0 && p.landed >= p.total;
}

/** A stable 0–1 value per spark and channel (no allocation, no Math.random: every client draws the same sparks). */
function sparkHash(i: number, ch: number): number {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(ch, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
