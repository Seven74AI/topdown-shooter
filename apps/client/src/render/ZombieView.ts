import * as Phaser from "phaser";
import { ATLAS_CHARACTERS, SPITTER_WINDUP_FRAMES, ZOMBIE_FRAMES, ensureAtlases } from "./city/spriteAtlas";
import { GurgleCues, windupScale } from "./spitCue";
import { CHAR_EXTENT_R } from "./city/spriteArt";
import { ZOMBIE_TYPES, headingToRad, isWindupState, type PlayerState, type Balance, type World, type ZombieTypeId } from "@topdown/shared";
import { playSfx, type SfxName } from "../audio/placeholderSfx";
import { ShriekCues } from "./shriekCue";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const MIN_TURN_MOVE_M = 1e-4;
/** Only for a type missing from balance (never in a valid build). */
const DEFAULT_RADIUS_M = 0.35;
const FLASH_MS = 80;

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
} as const satisfies Record<ZombieTypeId, ZombieLook>;

const lookOf = (type: ZombieTypeId): ZombieLook => LOOKS[type];

/** Clothes variant of a zombie slot (stable per slot and generation: a crowd is not all one shirt). */
const variantOf = (type: ZombieTypeId, id: number, gen: number): string => {
  const frames = ZOMBIE_FRAMES[type];
  return frames[(id * 7 + gen) % frames.length] as string;
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
  ) {
    ensureAtlases(scene); // Story 4.9: the character atlas (idempotent)
    this.shownFrame = new Int32Array(capacity).fill(-1);
    this.shownGeneration = new Int16Array(capacity).fill(-1);
    this.lastAngle = new Float32Array(capacity);
    this.flashUntil = new Float64Array(capacity);
    this.cues = new ShriekCues(capacity);
    this.windupSince = new Float64Array(capacity);
    this.side = new Float32Array(capacity);
  }

  /** White hit flash for a zombie (FR19). */
  flash(id: number): void {
    this.flashUntil[id] = this.scene.time.now + FLASH_MS;
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
        img = this.scene.add.image(0, 0, ATLAS_CHARACTERS, variantOf(type, id, 0));
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
        img.setTexture(ATLAS_CHARACTERS, variantOf(type, id, gen)).setDisplaySize(side, side).setDepth(look.depth).setVisible(true);
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
        img.setFrame(SPITTER_WINDUP_FRAMES[(id * 7 + gen) % SPITTER_WINDUP_FRAMES.length] as string);
        const pan = this.gurgles.windupStarted(drawX, drawY, this.scene.cameras.main.worldView, this.scene.time.now / 1000);
        if (!Number.isNaN(pan)) playSfx("zombie_spitter_gurgle", pan);
      } else if (!winding && since !== 0) {
        this.windupSince[id] = 0;
        img.setFrame(variantOf(type, id, gen)).setDisplaySize(this.side[id] as number, this.side[id] as number);
      }
      if (winding) {
        const s = (this.side[id] as number) * windupScale((this.scene.time.now - (this.windupSince[id] as number)) / 1000);
        img.setDisplaySize(s, s);
      }
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

  destroy(): void {
    for (const img of this.images) img?.destroy();
    this.images.length = 0;
  }
}
