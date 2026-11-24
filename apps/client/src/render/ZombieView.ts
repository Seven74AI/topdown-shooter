import * as Phaser from "phaser";
import { ATLAS_CHARACTERS, BLOATER_SWELL_FRAMES, BRUTE_WINDUP_FRAMES, SPITTER_WINDUP_FRAMES, ZOMBIE_FRAMES, ensureAtlases } from "./city/spriteAtlas";
import { fuseProgress, swellPulse, swellStage, swellTint } from "./bloaterLook";
import { GurgleCues, windupScale } from "./spitCue";
import { CHAR_EXTENT_R } from "./city/spriteArt";
import { ZOMBIE_TYPES, bloaterLookIndex, bruteLookIndex, headingToRad, isSwellState, isWindupState, type PlayerState, type Balance, type World, type ZombieTypeId } from "@topdown/shared";
import { playSfx, type SfxName } from "../audio/placeholderSfx";
import { ShriekCues } from "./shriekCue";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const MIN_TURN_MOVE_M = 1e-4;
/** Only for a type missing from balance (never in a valid build). */
const DEFAULT_RADIUS_M = 0.35;
const FLASH_MS = 80;
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
  }

  update(world: Readonly<World>, alpha: number): void {
    const z = world.zombies;
    const f = ++this.frame;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const type: ZombieTypeId = ZOMBIE_TYPES[z.type[id] as number] ?? "walker";
      let img = this.images[id];
      if (!img) {
        img = this.scene.add.image(0, 0, ATLAS_CHARACTERS, variantOf(type, id, 0, 0));
        this.images[id] = img;
      }
      const gen = z.generation[id] as number;
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
        img.setTexture(ATLAS_CHARACTERS, variantOf(type, id, gen, this.look[id] as number)).setDisplaySize(side, side).setDepth(look.depth).setVisible(true);
        this.flashUntil[id] = 0; // a new zombie in this slot never inherits a flash
        img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
      const px = z.prevX[id] as number;
      const py = z.prevY[id] as number;
      const cx = z.x[id] as number;
      const cy = z.y[id] as number;
      const mx = cx - px;
      const my = cy - py;
      if (this.streamedHeading) this.lastAngle[id] = headingToRad(z.heading[id] as number);
      else if (mx * mx + my * my > MIN_TURN_MOVE_M * MIN_TURN_MOVE_M) this.lastAngle[id] = Math.atan2(my, mx);
      const drawX = lerp(px, cx, alpha);
      const drawY = lerp(py, cy, alpha);
      // Story 5.6: a winding-up Spitter stands still (no movement heading): it faces the nearest standing player.
      if (isWindupState(z.state[id] as number)) {
        this.near.d2 = Infinity;
        this.near.x = drawX;
        this.near.y = drawY;
        world.players.forEach(this.nearestPlayer);
        if (this.near.d2 < Infinity) this.lastAngle[id] = Math.atan2(this.near.py - drawY, this.near.px - drawX);
      }
      img.setPosition(drawX, drawY).setRotation(this.lastAngle[id] as number);
      const cue = lookOf(type).cue;
      if (cue) {
        const pan = this.cues.check(id, gen, drawX, drawY, this.scene.cameras.main.worldView, this.scene.time.now / 1000);
        if (!Number.isNaN(pan)) playSfx(cue, pan);
      }
      // Story 5.6: the windup telegraph — the rearing-back frame, pulsing, and the gurgle once per windup.
      const winding = isWindupState(z.state[id] as number);
      const since = this.windupSince[id] as number;
      if (winding && since === 0) {
        this.windupSince[id] = this.scene.time.now || 1;
        if (type === "brute") {
          // Story 5.7 (F1): the raised-arms pose of its look (no gurgle: that is the Spitter's).
          img.setFrame(BRUTE_WINDUP_FRAMES[(this.look[id] as number) % BRUTE_WINDUP_FRAMES.length] as string);
        } else {
          img.setFrame(SPITTER_WINDUP_FRAMES[(id * 7 + gen) % SPITTER_WINDUP_FRAMES.length] as string);
          const pan = this.gurgles.windupStarted(drawX, drawY, this.scene.cameras.main.worldView, this.scene.time.now / 1000);
          if (!Number.isNaN(pan)) playSfx("zombie_spitter_gurgle", pan);
        }
      } else if (!winding && since !== 0) {
        this.windupSince[id] = 0;
        img.setFrame(variantOf(type, id, gen, this.look[id] as number)).setDisplaySize(this.side[id] as number, this.side[id] as number);
      }
      if (winding) {
        const s = (this.side[id] as number) * windupScale((this.scene.time.now - (this.windupSince[id] as number)) / 1000);
        img.setDisplaySize(s, s);
      }
      if (type === "bloater") this.swell(id, img, isSwellState(z.state[id] as number), drawX, drawY);
      const until = this.flashUntil[id] as number;
      if (until > 0 && this.scene.time.now >= until) {
        this.flashUntil[id] = 0;
        img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
      this.shownFrame[id] = f;
    }
    // Hide images whose zombie is gone.
    for (let id = 0; id < this.images.length; id++) {
      const img = this.images[id];
      if (img?.visible && this.shownFrame[id] !== f) img.setVisible(false);
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
  }
}
