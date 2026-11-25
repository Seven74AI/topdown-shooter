import * as Phaser from "phaser";
import { BLOATER_SWELL_FRAMES, BRUTE_WINDUP_FRAMES, SPITTER_WINDUP_FRAMES, ZOMBIE_FRAMES, ensureAtlases } from "./city/spriteAtlas";
import { fuseProgress, swellPulse, swellStage, swellTint } from "./bloaterLook";
import { GurgleCues, windupScale } from "./spitCue";
import { CHAR_EXTENT_R } from "./city/spriteArt";
import { charFx, veinSheetOf, ensureCharacterSheets, frameSide, isLoopType, layerNames, loopReady, pumpCharacters, walkFrames, zombieSheet, type LayerNames } from "./city/charactersAtlas";
import { sheenStep } from "./city/charRelight";
import { breath, glowPulse, loopSeconds, phaseOffset, sway, zombieAnim } from "./charAnim";
import { CharacterFxView } from "./CharacterFxView";
import { urlOptions } from "../debug/urlOptions";
import { ZOMBIE_TYPES, bloaterLookIndex, bruteLookIndex, headingToRad, isSwellState, isWindupState, type PlayerState, type Balance, type World, type ZombieTypeId } from "@topdown/shared";
import { playSfx, type SfxName } from "../audio/placeholderSfx";
import { ShriekCues } from "./shriekCue";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const MIN_TURN_MOVE_M = 1e-4;
/** Only for a type missing from balance (never in a valid build). */
const DEFAULT_RADIUS_M = 0.35;
const FLASH_MS = 80;
/** Story 9.13 (B4): the cap pass (who gets the full animation) runs every this many frames, not every frame. */
export const CAP_EVERY_FRAMES = 8;
/** Story 9.13: the glow and sheen layers (additive) sit on one depth band above every zombie type (one batch). */
export const ZOMBIE_FX_DEPTH = 5.9;
/** The crossfade's top picture: just above its type's bodies. */
const TOP_DZ = 0.001;
/** A move longer than this between two frames is a respawn / teleport, not a step of the walk loop. */
const MAX_STEP_M = 1;
/** B19: each walk step shows its picture alone for this share at either end and crossfades in between. */
export const CROSSFADE_FROM = 0.25;
/** Story 5.7 (AC 8): a Brute's hit flash is heavier (held longer: it soaks many hits). */
const BRUTE_FLASH_MS = 160;

/** How one zombie type is shown. Frames (`atlas_characters`, Story 4.9) face +x, centred on the body. */
interface ZombieLook {
  /** Render depth: lower types are drawn beneath the others (Story 3.9). */
  readonly depth: number;
  /** Story 3.8: signature sound played when one first enters my view (null: none). */
  readonly cue: SfxName | null;
}

/**
 * Per-type looks. `satisfies Record<ZombieTypeId, …>`: a new type must add its own, and its art in
 * `city/spriteArt.ts › drawZombie` + `CHAR_EXTENT_R` (readability rule: every type has a distinct
 * silhouette). Story 4.9: Walker arms reaching forward; Runner thin, leaning, red shirt, drawn above
 * the others; Crawler long and low, darker, drawn beneath every other type.
 */
const LOOKS = {
  walker: { depth: 5, cue: null },
  crawler: { depth: 4.5, cue: null },
  runner: { depth: 5.5, cue: "zombie_runner_shriek" },
  // Story 5.6: hunched woman, distended jaw glowing green; its cue is the windup gurgle (below).
  spitter: { depth: 5.2, cue: null },
  // Story 5.7: 1.2 m wide, hunched, five looks (BR1–BR5); drawn above the crowd. Its roar plays on
  // its spawn event (GameScene), not when it enters the view.
  brute: { depth: 5.8, cue: null },
  // Story 5.8: round and swollen (1 m wide, wider than every other type), five looks (BL1–BL5); a
  // gurgle when it first enters my view, the rising swell sound when its fuse starts.
  bloater: { depth: 5.6, cue: "zombie_bloater_gurgle" },
} as const satisfies Record<ZombieTypeId, ZombieLook>;

const lookOf = (type: ZombieTypeId): ZombieLook => LOOKS[type];

/** Clothes variant of a zombie slot (stable per slot and generation: a crowd is not all one shirt). */
const variantOf = (type: ZombieTypeId, id: number, gen: number, look: number): string => {
  const frames = ZOMBIE_FRAMES[type];
  // Story 5.7: a Brute's look comes from the run seed's `look:brute:<netId>` stream (`look`); Story 5.8: a Bloater's from `look:bloater:<netId>`.
  return frames[(type === "brute" || type === "bloater" ? look : id * 7 + gen) % frames.length] as string;
};

/** Story 9.13: the Bloater looks' vein sheets (built once). */
const VEIN_SHEETS: readonly string[] = Array.from({ length: ZOMBIE_FRAMES.bloater.length }, (_, v) => veinSheetOf(v));

/** The game loop's frame number (one character-bake pump per frame, whoever calls first), or −2 (tests: always pump). */
export const gameFrame = (scene: Phaser.Scene): number => (scene.game as { loop?: { frame?: number } } | undefined)?.loop?.frame ?? -2;

/** Story 9.13: the variant index of a zombie slot (the sheet of its look). */
const variantIndexOf = (type: ZombieTypeId, id: number, gen: number, look: number): number => (type === "brute" || type === "bloater" ? look : id * 7 + gen) % ZOMBIE_FRAMES[type].length;

/**
 * One pooled Image per zombie slot, created lazily and reused (never a Graphics redraw per zombie
 * per frame). Reads the pool only. Positions are interpolated with the host's alpha.
 *
 * Online (Story 2.5) the facing is the streamed heading (`pool.heading`), since the mirror's
 * positions are already interpolated; solo it comes from movement as before. A slot's image is
 * re-initialized when it reappears after a gap or when its generation changes (a new zombie).
 */
export class ZombieView {
  private readonly images: (Phaser.GameObjects.Image | undefined)[] = [];

  /** Story 6.5 (review L-b): zombie slot `id` is drawn this frame (6.4's fog may hide some: then it isn't). */
  readonly drawn = (id: number): boolean => this.images[id]?.visible === true;
  private readonly shownFrame: Int32Array;
  private readonly lastAngle: Float32Array;
  private readonly shownGeneration: Int16Array;
  private frame = 0;
  /** Time (scene ms) until which each slot shows the white hit flash. */
  private readonly flashUntil: Float64Array;
  /** Story 3.8: signature sounds when a Runner first enters my view. */
  private readonly cues: ShriekCues;
  /** Story 5.6: per slot, the windup start (scene ms) while it shows the windup pose; 0 = normal pose. */
  private readonly windupSince: Float64Array;
  private readonly side: Float32Array;
  /** Story 5.7: per slot, the Brute look (`bruteLookIndex`, picked once per new zombie). */
  private readonly look: Uint8Array;
  /** Story 5.7: 1 while the slot shows a Brute (its heavier flash). */
  private readonly brute: Uint8Array;
  /** Story 5.8: per slot, the swell start (scene ms) while a Bloater shows its swell; 0 = not swelling. */
  private readonly swellSince: Float64Array;
  /** Story 5.8: the swell frame stage shown (0 = the walking frame). */
  private readonly swellShown: Uint8Array;
  /** Story 5.8: the fuse length (`explodes.swellS`; 0 without a Bloater type). */
  private readonly swellS: number;
  private readonly gurgles = new GurgleCues();
  // ── Story 9.13: the relit look's layers and animation ──
  /** The look (variant index: its sheet) and type index of each slot. */
  private readonly variant: Uint8Array;
  private readonly typeIx: Uint8Array;
  /** The walk loop's phase (0–1, B8: advanced by the distance moved) and the last drawn position. */
  private readonly walkPhase: Float32Array;
  private readonly lastX: Float32Array;
  private readonly lastY: Float32Array;
  /** The walk picture shown on the body (−1: none set yet) and on the crossfade's top layer. */
  private readonly walkShown: Int8Array;
  private readonly topShown: Int8Array;
  /** The sheen step shown (−1: none). */
  private readonly sheenShown: Int8Array;
  /** Cap pass result (B4): 1 full animation, 2 full + sheen; 0 stepped walk + breathing only. */
  private readonly capped: Uint8Array;
  /** Pooled layer images per slot (only within the cap). */
  private readonly top: (Phaser.GameObjects.Image | undefined)[] = [];
  private readonly glow: (Phaser.GameObjects.Image | undefined)[] = [];
  private readonly sheen: (Phaser.GameObjects.Image | undefined)[] = [];
  private readonly freeTop: Phaser.GameObjects.Image[] = [];
  private readonly freeGlow: Phaser.GameObjects.Image[] = [];
  private readonly freeSheen: Phaser.GameObjects.Image[] = [];
  /** Layer images made so far (tests: the pools stay within the caps). */
  layerImages = 0;
  /** The Bloater / Spitter FX slot of each zombie slot (−1: none), and each FX slot's owner. */
  private readonly bloaterSlot: Int8Array;
  private readonly spitterSlot: Int8Array;
  private readonly bloaterOwner: Int32Array;
  private readonly spitterOwner: Int32Array;
  /** Scratch for the cap pass (sorted distance keys; no allocation). */
  private readonly capKeys: Float64Array;
  /** Walk loop length (m) per type index × 4 + variant (B8: page `loopS` × the type's speed). */
  private readonly loopM: Float32Array;
  private readonly fx: CharacterFxView;
  /** The caps (`controls.fx`; `?fx=low` halves them). */
  readonly caps: { readonly anim: number; readonly sheen: number; readonly bloater: number; readonly spitter: number };
  /** Zombies drawn with the full animation this frame (tests, the perf overlay). */
  animated = 0;
  /** Scratch for `nearestPlayer` (module-free callback, no closure per frame). */
  private readonly near = { x: 0, y: 0, px: 0, py: 0, d2: Infinity };
  private readonly nearestPlayer = (p: PlayerState): void => {
    if (p.status !== "alive") return;
    const dx = p.x - this.near.x;
    const dy = p.y - this.near.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < this.near.d2) {
      this.near.d2 = d2;
      this.near.px = p.x;
      this.near.py = p.y;
    }
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly balance: Balance,
    capacity: number,
    /** Use the streamed heading (the networked host's mirror). */
    private readonly streamedHeading = false,
    /** Story 5.7: the run seed (room state online, the World's seed solo): the Brute looks' stream. */
    private readonly runSeed: () => number = () => 0,
  ) {
    ensureAtlases(scene); // Story 4.9: the character atlas (idempotent)
    ensureCharacterSheets(scene); // Story 9.13: the relit sheets (plain until the bake lands)
    this.shownFrame = new Int32Array(capacity).fill(-1);
    this.shownGeneration = new Int16Array(capacity).fill(-1);
    this.lastAngle = new Float32Array(capacity);
    this.flashUntil = new Float64Array(capacity);
    this.cues = new ShriekCues(capacity);
    this.windupSince = new Float64Array(capacity);
    this.side = new Float32Array(capacity);
    this.look = new Uint8Array(capacity);
    this.brute = new Uint8Array(capacity);
    this.swellSince = new Float64Array(capacity);
    this.swellShown = new Uint8Array(capacity);
    this.swellS = balance.zombies.types.bloater?.explodes?.swellS ?? 0;
    this.variant = new Uint8Array(capacity);
    this.typeIx = new Uint8Array(capacity);
    this.walkPhase = new Float32Array(capacity);
    this.lastX = new Float32Array(capacity);
    this.lastY = new Float32Array(capacity);
    this.walkShown = new Int8Array(capacity).fill(-1);
    this.topShown = new Int8Array(capacity).fill(-1);
    this.sheenShown = new Int8Array(capacity).fill(-1);
    this.capped = new Uint8Array(capacity);
    this.bloaterSlot = new Int8Array(capacity).fill(-1);
    this.spitterSlot = new Int8Array(capacity).fill(-1);
    this.capKeys = new Float64Array(capacity);
    const fxc = balance.controls.fx;
    const k = urlOptions().lowFx ? 0.5 : 1;
    this.caps = { anim: Math.floor(fxc.maxCharacterAnim * k), sheen: Math.floor(fxc.maxCharacterSheen * k), bloater: Math.floor(fxc.maxBloaterFx * k), spitter: Math.floor(fxc.maxSpitterDrips * k) };
    this.bloaterOwner = new Int32Array(this.caps.bloater).fill(-1);
    this.spitterOwner = new Int32Array(this.caps.spitter).fill(-1);
    this.fx = new CharacterFxView(scene, this.caps.bloater, this.caps.spitter);
    this.loopM = new Float32Array(ZOMBIE_TYPES.length * 4);
    ZOMBIE_TYPES.forEach((t, ti) => {
      for (let v = 0; v < 4; v++) this.loopM[ti * 4 + v] = loopSeconds(t, v) * (balance.zombies.types[t]?.speedMps ?? 1);
    });
  }

  /**
   * Story 5.8: the swelling Bloaters this frame, for the fuse rings (`BloaterView`): calls `fn` with
   * the drawn position and the fuse progress 0–1. No allocation.
   */
  forEachSwell(world: Readonly<World>, fn: (x: number, y: number, progress: number) => void): void {
    const z = world.zombies;
    const now = this.scene.time.now;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const since = this.swellSince[id] as number;
      const img = this.images[id];
      if (since === 0 || !img?.visible) continue;
      fn(img.x, img.y, fuseProgress((now - since) / 1000, this.swellS));
    }
  }

  /** White hit flash for a zombie (FR19). */
  flash(id: number): void {
    this.flashUntil[id] = this.scene.time.now + (this.brute[id] === 1 ? BRUTE_FLASH_MS : FLASH_MS);
    this.images[id]?.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.top[id]?.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
  }

  /**
   * Story 6.4 (F3, F6): my screen's fog (null: none). Each zombie's alpha × its `visibility` at the
   * drawn position; at 0 it is hidden (not drawn, no eyes). The sim never sees this (F4).
   */
  fog: { visibility(x: number, y: number): number } | null = null;
  /** Zombies the fog hid this frame (tests, the perf overlay). */
  fogHidden = 0;

  /** Designer pick C: copies every zombie image drawn this frame into `out` (reused); returns how many. */
  shownImages(out: Phaser.GameObjects.Image[]): number {
    let n = 0;
    for (const img of this.images) if (img?.visible) out[n++] = img;
    return n;
  }

  /** The texture (sheet) and frame of slot `id`'s plain pose (walking / normal). */
  private baseFrame(type: ZombieTypeId, id: number): string {
    const walk = walkFrames(type, this.variant[id] as number);
    return walk ? (walk[0] as string) : variantOf(type, id, this.shownGeneration[id] as number, this.look[id] as number);
  }

  update(world: Readonly<World>, alpha: number): void {
    const z = world.zombies;
    const f = ++this.frame;
    pumpCharacters(undefined, undefined, gameFrame(this.scene)); // Story 9.13: the relit pictures land here (like BuildingView → pumpBuildingsAtlas)
    if (f % CAP_EVERY_FRAMES === 1) this.capPass(world);
    const fog = this.fog;
    const now = this.scene.time.now;
    const tS = now / 1000;
    let hidden = 0;
    let animated = 0;
    this.fx.begin();
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const ti = ZOMBIE_TYPES[z.type[id] as number] !== undefined ? (z.type[id] as number) : 0;
      const type: ZombieTypeId = ZOMBIE_TYPES[ti] ?? "walker";
      let img = this.images[id];
      if (!img) {
        img = this.scene.add.image(0, 0, zombieSheet(type, 0), walkFrames(type, 0)?.[0] ?? variantOf(type, id, 0, 0));
        this.images[id] = img;
      }
      const gen = z.generation[id] as number;
      const px = z.prevX[id] as number;
      const py = z.prevY[id] as number;
      const cx = z.x[id] as number;
      const cy = z.y[id] as number;
      const drawX = lerp(px, cx, alpha);
      const drawY = lerp(py, cy, alpha);
      if (this.shownFrame[id] !== f - 1 || this.shownGeneration[id] !== gen) {
        // (Re)appearing, or a new generation: a new zombie in this slot, set its texture and size.
        this.shownGeneration[id] = gen;
        const r = this.balance.zombies.types[type]?.radiusM ?? DEFAULT_RADIUS_M;
        const look = lookOf(type);
        const side = 2 * r * CHAR_EXTENT_R[type];
        this.side[id] = side;
        this.windupSince[id] = 0;
        this.look[id] = type === "brute" ? bruteLookIndex(this.runSeed(), id | (gen << 8)) : type === "bloater" ? bloaterLookIndex(this.runSeed(), id | (gen << 8)) : 0; // the horde net id
        this.swellSince[id] = 0;
        this.swellShown[id] = 0;
        this.brute[id] = type === "brute" ? 1 : 0;
        this.typeIx[id] = ti;
        this.variant[id] = variantIndexOf(type, id, gen, this.look[id] as number);
        this.walkPhase[id] = phaseOffset(id) % 1;
        this.walkShown[id] = 0;
        this.lastX[id] = drawX;
        this.lastY[id] = drawY;
        img.setTexture(zombieSheet(type, this.variant[id] as number), this.baseFrame(type, id)).setDisplaySize(side, side).setDepth(look.depth).setVisible(true);
        this.flashUntil[id] = 0; // a new zombie in this slot never inherits a flash
        img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        this.dropLayers(id);
      }
      const mx = cx - px;
      const my = cy - py;
      if (this.streamedHeading) this.lastAngle[id] = headingToRad(z.heading[id] as number);
      else if (mx * mx + my * my > MIN_TURN_MOVE_M * MIN_TURN_MOVE_M) this.lastAngle[id] = Math.atan2(my, mx);
      // Story 5.6: a winding-up Spitter stands still (no movement heading): it faces the nearest standing player.
      if (isWindupState(z.state[id] as number)) {
        this.near.d2 = Infinity;
        this.near.x = drawX;
        this.near.y = drawY;
        world.players.forEach(this.nearestPlayer);
        if (this.near.d2 < Infinity) this.lastAngle[id] = Math.atan2(this.near.py - drawY, this.near.px - drawX);
      }
      // Story 6.4: fade at the fog edge, hidden beyond it (one distance + ≤ 4 cone tests; no allocation).
      const vis = fog ? fog.visibility(drawX, drawY) : 1;
      if (vis <= 0) {
        hidden++;
        if (img.visible) img.setVisible(false);
        this.hideLayers(id);
      } else {
        if (!img.visible) img.setVisible(true);
        if (img.alpha !== vis) img.setAlpha(vis);
      }
      const cue = lookOf(type).cue;
      if (cue) {
        const pan = this.cues.check(id, gen, drawX, drawY, this.scene.cameras.main.worldView, now / 1000);
        if (!Number.isNaN(pan)) playSfx(cue, pan);
      }
      // Story 5.6: the windup telegraph — the rearing-back frame, pulsing, and the gurgle once per windup.
      const winding = isWindupState(z.state[id] as number);
      const since = this.windupSince[id] as number;
      if (winding && since === 0) {
        this.windupSince[id] = now || 1;
        if (type === "brute") {
          // Story 5.7 (F1): the raised-arms pose of its look (no gurgle: that is the Spitter's).
          img.setFrame(BRUTE_WINDUP_FRAMES[(this.look[id] as number) % BRUTE_WINDUP_FRAMES.length] as string);
        } else {
          img.setFrame(SPITTER_WINDUP_FRAMES[(id * 7 + gen) % SPITTER_WINDUP_FRAMES.length] as string);
          const pan = this.gurgles.windupStarted(drawX, drawY, this.scene.cameras.main.worldView, now / 1000);
          if (!Number.isNaN(pan)) playSfx("zombie_spitter_gurgle", pan);
        }
      } else if (!winding && since !== 0) {
        this.windupSince[id] = 0;
        img.setFrame(this.baseFrame(type, id));
      }
      const ws = winding ? windupScale((now - (this.windupSince[id] as number)) / 1000) : 1;
      if (type === "bloater") this.swell(id, img, isSwellState(z.state[id] as number), drawX, drawY);
      const until = this.flashUntil[id] as number;
      if (until > 0 && now >= until) {
        this.flashUntil[id] = 0;
        img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        this.top[id]?.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
      // Story 9.13 (AC 2): breathing (non-uniform scale) and the weight shift, on every zombie
      const pose = type === "bloater" ? (this.swellShown[id] as number) : winding ? 1 : 0;
      const anim = zombieAnim(type, pose);
      const t = tS + phaseOffset(id);
      const br = breath(anim, t);
      const side = (this.side[id] as number) * ws;
      const sx = side * br;
      const sy = side * (1 + (br - 1) * 0.6);
      const rot = (this.lastAngle[id] as number) + sway(anim, t);
      img.setPosition(drawX, drawY).setRotation(rot).setDisplaySize(sx, sy);
      if (vis > 0) {
        const full = this.capped[id] !== 0;
        if (full) animated++;
        this.walk(id, type, img, drawX, drawY, full, vis, sx, sy, rot);
        if (full) this.layers(id, type, img, vis, sx, sy, rot, t, anim, drawX, drawY);
        else this.hideLayers(id);
      }
      this.lastX[id] = drawX;
      this.lastY[id] = drawY;
      this.shownFrame[id] = f;
    }
    this.fx.end();
    this.fogHidden = hidden;
    this.animated = animated;
    // Hide images whose zombie is gone.
    for (let id = 0; id < this.images.length; id++) {
      const img = this.images[id];
      if (img?.visible && this.shownFrame[id] !== f) {
        img.setVisible(false);
        this.dropLayers(id);
      }
    }
  }

  /**
   * Story 9.13 (B8, B10, B4): the walk loop of Walkers, Runners and Crawlers. The phase follows the distance moved
   * (feet don't slide; a standing zombie stops). Once every relit picture of its look is in, a zombie within the cap
   * crossfades its two neighbouring pictures; beyond the cap it steps them; before that it shows the first picture.
   */
  private walk(id: number, type: ZombieTypeId, img: Phaser.GameObjects.Image, x: number, y: number, full: boolean, vis: number, sx: number, sy: number, rot: number): void {
    if (!isLoopType(type)) return;
    const v = this.variant[id] as number;
    const frames = walkFrames(type, v) as readonly string[];
    const dx = x - (this.lastX[id] as number);
    const dy = y - (this.lastY[id] as number);
    const d = Math.sqrt(dx * dx + dy * dy);
    const loop = this.loopM[(this.typeIx[id] as number) * 4 + v] as number;
    if (d < MAX_STEP_M && loop > 0) this.walkPhase[id] = ((this.walkPhase[id] as number) + d / loop) % 1;
    if (!loopReady(type, v)) {
      if (this.walkShown[id] !== 0) {
        this.walkShown[id] = 0;
        img.setFrame(frames[0] as string);
      }
      this.hideTop(id);
      return;
    }
    const n = frames.length;
    const fr = (this.walkPhase[id] as number) * n;
    // B19: the crossfade runs over the middle half of each step (the picture alone at either end), so the top layer
    // exists half the time: half its fill cost, and the motion still reads smooth
    const w = fr - Math.floor(fr);
    const blend = full ? Math.max(0, Math.min(1, (w - CROSSFADE_FROM) / (1 - 2 * CROSSFADE_FROM))) : 0;
    const i0 = full ? (blend >= 1 ? Math.floor(fr) + 1 : Math.floor(fr)) % n : Math.round(fr) % n;
    if (this.walkShown[id] !== i0) {
      this.walkShown[id] = i0;
      img.setFrame(frames[i0] as string);
    }
    if (!full || blend <= 0 || blend >= 1) {
      this.hideTop(id);
      return;
    }
    let top = this.top[id];
    if (!top) {
      top = this.freeTop.pop() ?? this.newLayer(img.texture.key, frames[0] as string, false);
      this.top[id] = top;
      this.topShown[id] = -1;
      top.setTexture(img.texture.key, frames[0] as string).setDepth(img.depth + TOP_DZ).setTintMode(Phaser.TintModes.MULTIPLY);
      if ((this.flashUntil[id] as number) > 0) top.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else top.clearTint();
    }
    const i1 = (i0 + 1) % n;
    if (this.topShown[id] !== i1) {
      this.topShown[id] = i1;
      top.setFrame(frames[i1] as string);
    }
    top.setPosition(x, y).setRotation(rot).setDisplaySize(sx, sy).setAlpha(vis * blend).setVisible(true);
  }

  /** Story 9.13: the glow (pulsing, additive), the sheen (B5) and a Bloater's / Spitter's FX, for a zombie within the cap. */
  private layers(id: number, type: ZombieTypeId, img: Phaser.GameObjects.Image, vis: number, sx: number, sy: number, rot: number, t: number, anim: ReturnType<typeof zombieAnim>, x: number, y: number): void {
    const primary = isLoopType(type) ? ((walkFrames(type, this.variant[id] as number) as readonly string[])[0] as string) : img.frame.name;
    const fx = charFx(primary);
    const names: LayerNames | null = fx ? layerNames(primary) : null;
    const sheet = img.texture.key;
    if (fx?.glow && names) {
      let g = this.glow[id];
      if (!g) {
        g = this.freeGlow.pop() ?? this.newLayer(sheet, names.glow, true);
        this.glow[id] = g;
      }
      if (g.texture.key !== sheet) g.setTexture(sheet, names.glow);
      else if (g.frame.name !== names.glow) g.setFrame(names.glow);
      g.setPosition(x, y).setRotation(rot).setDisplaySize(sx, sy).setAlpha(vis * glowPulse(anim, t)).setVisible(true);
    } else this.release(this.glow, this.freeGlow, id);
    if (fx?.sheen && names && this.capped[id] === 2) {
      let s = this.sheen[id];
      if (!s) {
        s = this.freeSheen.pop() ?? this.newLayer(sheet, names.sheen[0] as string, true);
        this.sheen[id] = s;
        this.sheenShown[id] = -1;
      }
      const k = sheenStep(t);
      const name = names.sheen[k] as string;
      if (s.texture.key !== sheet) s.setTexture(sheet, name);
      else if (this.sheenShown[id] !== k || s.frame.name !== name) s.setFrame(name);
      this.sheenShown[id] = k;
      s.setPosition(x, y).setRotation(rot).setDisplaySize(sx, sy).setAlpha(vis).setVisible(true);
    } else this.release(this.sheen, this.freeSheen, id);
    const bs = this.bloaterSlot[id] as number;
    if (type === "bloater" && bs >= 0 && fx?.bloater && names) this.fx.bloater(bs, VEIN_SHEETS[(this.variant[id] as number) % VEIN_SHEETS.length] as string, names.veins, frameSide(CHAR_EXTENT_R.bloater), x, y, rot, sx, sy, img.depth, vis, t, fx.bloater);
    const ss = this.spitterSlot[id] as number;
    if (type === "spitter" && ss >= 0 && anim.drip) this.fx.spitter(ss, id, x, y, rot, this.balance.zombies.types.spitter?.radiusM ?? DEFAULT_RADIUS_M, anim.drip[0], anim.drip[1], img.depth, vis, t);
  }

  private newLayer(sheet: string, frame: string, add: boolean): Phaser.GameObjects.Image {
    this.layerImages++;
    const img = this.scene.add.image(0, 0, sheet, frame).setVisible(false);
    if (add) img.setBlendMode(Phaser.BlendModes.ADD).setDepth(ZOMBIE_FX_DEPTH);
    return img;
  }
  private release(list: (Phaser.GameObjects.Image | undefined)[], free: Phaser.GameObjects.Image[], id: number): void {
    const img = list[id];
    if (!img) return;
    img.setVisible(false);
    free.push(img);
    list[id] = undefined;
  }
  private hideTop(id: number): void {
    this.release(this.top, this.freeTop, id);
  }
  private hideLayers(id: number): void {
    this.release(this.top, this.freeTop, id);
    this.release(this.glow, this.freeGlow, id);
    this.release(this.sheen, this.freeSheen, id);
  }
  /** A slot's zombie is gone or new: its layers go back to the pools and its FX slots are freed. */
  private dropLayers(id: number): void {
    this.hideLayers(id);
    this.capped[id] = 0;
    const b = this.bloaterSlot[id] as number;
    if (b >= 0) this.bloaterOwner[b] = -1;
    this.bloaterSlot[id] = -1;
    const s = this.spitterSlot[id] as number;
    if (s >= 0) this.spitterOwner[s] = -1;
    this.spitterSlot[id] = -1;
  }

  /**
   * Story 9.13 (B4, AC 4): who gets the full animation, every `CAP_EVERY_FRAMES` frames: the zombies nearest the
   * camera's centre, up to `caps.anim` (of those the first `caps.sheen` also get the sheen); the nearest
   * `caps.bloater` Bloaters and `caps.spitter` Spitters among them get their FX slot (a slot kept stays the same).
   */
  private capPass(world: Readonly<World>): void {
    const z = world.zombies;
    const v = this.scene.cameras.main.worldView;
    const ccx = v.x + v.width / 2;
    const ccy = v.y + v.height / 2;
    let n = 0;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const dx = (z.x[id] as number) - ccx;
      const dy = (z.y[id] as number) - ccy;
      // the key sorts by distance (cm²) and carries the slot id in its low bits
      this.capKeys[n++] = Math.min(4e9, Math.floor((dx * dx + dy * dy) * 100)) * 65536 + id;
    }
    const keys = this.capKeys.subarray(0, n);
    keys.sort();
    this.capped.fill(0);
    for (let k = 0; k < this.bloaterOwner.length; k++) {
      const o = this.bloaterOwner[k] as number;
      if (o >= 0) this.bloaterSlot[o] = -2; // kept if still in the cap (below)
    }
    for (let k = 0; k < this.spitterOwner.length; k++) {
      const o = this.spitterOwner[k] as number;
      if (o >= 0) this.spitterSlot[o] = -2;
    }
    let bl = 0;
    let sp = 0;
    const lim = Math.min(n, this.caps.anim);
    for (let k = 0; k < lim; k++) {
      const id = (keys[k] as number) % 65536;
      this.capped[id] = k < this.caps.sheen ? 2 : 1;
      const type = ZOMBIE_TYPES[z.type[id] as number];
      if (type === "bloater" && bl < this.caps.bloater) {
        bl++;
        if (this.bloaterSlot[id] === -2) this.bloaterSlot[id] = this.ownerSlot(this.bloaterOwner, id);
        else this.bloaterSlot[id] = -3; // wants a slot
      } else if (type === "spitter" && sp < this.caps.spitter) {
        sp++;
        if (this.spitterSlot[id] === -2) this.spitterSlot[id] = this.ownerSlot(this.spitterOwner, id);
        else this.spitterSlot[id] = -3;
      }
    }
    this.settleSlots(this.bloaterOwner, this.bloaterSlot, z);
    this.settleSlots(this.spitterOwner, this.spitterSlot, z);
  }
  private ownerSlot(owner: Int32Array, id: number): number {
    for (let k = 0; k < owner.length; k++) if (owner[k] === id) return k;
    return -3;
  }
  /** After the cap pass: owners no longer in it lose their slot; those that want one get a free one. */
  private settleSlots(owner: Int32Array, slotOf: Int8Array, z: Readonly<World>["zombies"]): void {
    for (let k = 0; k < owner.length; k++) {
      const o = owner[k] as number;
      if (o >= 0 && slotOf[o] === -2) {
        slotOf[o] = -1;
        owner[k] = -1;
      }
    }
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      if (slotOf[id] !== -3) continue;
      slotOf[id] = -1;
      for (let k = 0; k < owner.length; k++) {
        if (owner[k] === -1) {
          owner[k] = id;
          slotOf[id] = k;
          break;
        }
      }
    }
  }

  /**
   * Story 5.8 (AC 8b): the swell, from the streamed SWELL state (so a client that missed the event
   * still draws it): the three swell frames of its look in turn over the fuse (the art grows 1.35 ×),
   * a sickly green pulse quickening as the fuse burns, the rising sound once when it starts.
   */
  private swell(id: number, img: Phaser.GameObjects.Image, swelling: boolean, x: number, y: number): void {
    const now = this.scene.time.now;
    if (!swelling) {
      if (this.swellSince[id] !== 0) {
        this.swellSince[id] = 0;
        this.swellShown[id] = 0;
        img.setFrame(variantOf("bloater", id, 0, this.look[id] as number));
        if ((this.flashUntil[id] as number) === 0) img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
      return;
    }
    if (this.swellSince[id] === 0) {
      this.swellSince[id] = now || 1;
      const v = this.scene.cameras.main.worldView;
      if (x >= v.x && y >= v.y && x <= v.x + v.width && y <= v.y + v.height) {
        playSfx("zombie_bloater_swell", Math.max(-1, Math.min(1, (x - (v.x + v.width / 2)) / Math.max(1e-6, v.width / 2))));
      }
    }
    const tS = (now - (this.swellSince[id] as number)) / 1000;
    const p = fuseProgress(tS, this.swellS);
    const stage = swellStage(p);
    if (stage !== this.swellShown[id]) {
      this.swellShown[id] = stage;
      const frames = BLOATER_SWELL_FRAMES[stage - 1] as readonly string[];
      img.setFrame(frames[(this.look[id] as number) % frames.length] as string);
    }
    if ((this.flashUntil[id] as number) === 0) img.setTint(swellTint(swellPulse(tS, p))).setTintMode(Phaser.TintModes.MULTIPLY);
  }

  /**
   * Story 6.3 (EyesView): the image of zombie slot `id` if it was drawn this frame (its position and
   * rotation are the drawn pose), else undefined.
   */
  drawnImage(id: number): Phaser.GameObjects.Image | undefined {
    const img = this.images[id];
    return img && img.visible && this.shownFrame[id] === this.frame ? img : undefined;
  }

  destroy(): void {
    for (const img of this.images) img?.destroy();
    this.images.length = 0;
    for (const list of [this.top, this.glow, this.sheen]) {
      for (const img of list) img?.destroy();
      list.length = 0;
    }
    for (const list of [this.freeTop, this.freeGlow, this.freeSheen]) {
      for (const img of list) img.destroy();
      list.length = 0;
    }
    this.fx.destroy();
  }
}
