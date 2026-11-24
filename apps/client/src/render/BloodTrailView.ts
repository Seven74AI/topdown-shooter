import type * as Phaser from "phaser";
import { ZOMBIE_TYPES, type World, type ZombieTypeId } from "@topdown/shared";
import { addGeneratedTexture } from "./city/canvasTexture";

/** Types that leave a blood trail (Story 3.9: Crawlers drag themselves along). */
const TRAIL_TYPES: readonly ZombieTypeId[] = ["crawler"];
/** A new mark every this many metres a Crawler moves. */
const SPACING_M = 0.35;
/** Marks fade linearly from START_ALPHA to 0 over FADE_MS, then are hidden (FR22: fades after 5 s). */
const FADE_MS = 5000;
const START_ALPHA = 0.6;
/**
 * Marks in the ring. A Crawler (0.7 m/s) drops 2 marks/s, so 5 s of trail is ~10 marks: 400 covers
 * 40 Crawlers; past that the oldest mark is reused early (memory stays flat).
 */
const TRAIL_CAP = 400;
/** Mark size in metres (a smear along the crawl). */
const MARK_LENGTH_M = 0.42;
const MARK_WIDTH_M = 0.26;
const TEX_W = 32;
const TEX_H = 20;
const TEX_KEY = "blood_trail";
const BLOOD = 0x4a0c0c;
/** With the death splats, under every zombie (crawlers 4.5, walkers 5). */
const DEPTH = 1;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The smear, drawn on a canvas (Story 4.13: through the texture registry, so a lost graphics context
 * redraws it; it was `Graphics.generateTexture` before, which nothing could redraw).
 */
function makeTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_KEY)) return;
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  addGeneratedTexture(scene, TEX_KEY, canvas, (g) => {
    const ellipse = (cx: number, cy: number, w: number, h: number, alpha: number): void => {
      g.fillStyle = `rgba(${(BLOOD >> 16) & 255},${(BLOOD >> 8) & 255},${BLOOD & 255},${alpha})`;
      g.beginPath();
      g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      g.fill();
    };
    ellipse(TEX_W * 0.5, TEX_H * 0.5, TEX_W * 0.9, TEX_H * 0.55, 1);
    ellipse(TEX_W * 0.3, TEX_H * 0.38, TEX_W * 0.4, TEX_H * 0.5, 0.7);
  });
}

/**
 * Blood trails behind Crawlers (Story 3.9), client-side only. Reads the zombie pool (the local
 * World solo, the mirror online) and drops a pooled mark every SPACING_M a trail type moves. Marks
 * fade on this view's own clock, which only advances while the run isn't paused (Story 2.11: a solo
 * pause freezes FX). Nothing is allocated per frame: the marks are a ring of Images created on first
 * use, per-slot state is typed arrays.
 */
export class BloodTrailView {
  private readonly marks: Phaser.GameObjects.Image[] = [];
  private readonly bornMs = new Float64Array(TRAIL_CAP);
  private next = 0;
  private clockMs = 0;
  private frame = 0;
  private readonly lastX: Float32Array;
  private readonly lastY: Float32Array;
  private readonly seenFrame: Int32Array;
  private readonly seenGeneration: Int16Array;
  /** 1 per `ZOMBIE_TYPES` index that leaves a trail. */
  private readonly trailType = new Uint8Array(ZOMBIE_TYPES.length);

  constructor(
    private readonly scene: Phaser.Scene,
    capacity: number,
  ) {
    makeTexture(scene);
    this.lastX = new Float32Array(capacity);
    this.lastY = new Float32Array(capacity);
    this.seenFrame = new Int32Array(capacity).fill(-1);
    this.seenGeneration = new Int16Array(capacity).fill(-1);
    for (const t of TRAIL_TYPES) this.trailType[ZOMBIE_TYPES.indexOf(t)] = 1;
  }

  /** Marks currently visible (tests and automated browser checks). */
  get visibleCount(): number {
    let n = 0;
    for (const m of this.marks) if (m.visible) n++;
    return n;
  }

  /** Story 6.4 review L5 (D3): my screen's fog — a fog-hidden Crawler leaves no new mark (its path would show it). */
  fog: { visibility(x: number, y: number): number } | null = null;

  update(world: Readonly<World>, alpha: number, frameDtMs: number, paused: boolean): void {
    if (!paused && frameDtMs > 0) this.clockMs += frameDtMs;
    const f = ++this.frame;
    const z = world.zombies;
    const spacing2 = SPACING_M * SPACING_M;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      if (this.trailType[z.type[id] as number] !== 1) continue;
      const x = lerp(z.prevX[id] as number, z.x[id] as number, alpha);
      const y = lerp(z.prevY[id] as number, z.y[id] as number, alpha);
      const gen = z.generation[id] as number;
      if (this.seenFrame[id] !== f - 1 || this.seenGeneration[id] !== gen) {
        // (Re)appearing or a new zombie in this slot: start its trail here, no mark yet.
        this.seenGeneration[id] = gen;
        this.lastX[id] = x;
        this.lastY[id] = y;
      } else {
        const dx = x - (this.lastX[id] as number);
        const dy = y - (this.lastY[id] as number);
        if (dx * dx + dy * dy >= spacing2) {
          if (!this.fog || this.fog.visibility(x, y) > 0) this.drop(x, y, Math.atan2(dy, dx));
          this.lastX[id] = x;
          this.lastY[id] = y;
        }
      }
      this.seenFrame[id] = f;
    }
    this.fade();
  }

  private drop(x: number, y: number, angle: number): void {
    let m = this.marks[this.next];
    if (!m) {
      m = this.scene.add.image(0, 0, TEX_KEY).setDepth(DEPTH).setDisplaySize(MARK_LENGTH_M, MARK_WIDTH_M);
      this.marks[this.next] = m;
    }
    this.bornMs[this.next] = this.clockMs;
    this.next = (this.next + 1) % TRAIL_CAP;
    m.setPosition(x, y).setRotation(angle).setAlpha(START_ALPHA).setVisible(true);
  }

  private fade(): void {
    const now = this.clockMs;
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i] as Phaser.GameObjects.Image;
      if (!m.visible) continue;
      const age = now - (this.bornMs[i] as number);
      if (age >= FADE_MS) m.setVisible(false);
      else m.setAlpha(START_ALPHA * (1 - age / FADE_MS));
    }
  }

  destroy(): void {
    for (const m of this.marks) m.destroy();
    this.marks.length = 0;
  }
}
