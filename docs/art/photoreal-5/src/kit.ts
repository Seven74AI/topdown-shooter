/**
 * Photoreal group 5, FX: the shared contract between the page shell (`fx5.ts`) and the family modules
 * (`gunfire.ts`, `fire.ts`, `matter.ts`, `telegraphs.ts`). Each module exports `cards: FxCard[]`.
 *
 * The model the page follows (the group's ONE idea, see `fx5.ts` header and the page's brief):
 *   "Every effect is light or matter, and the street keeps the mark."
 *
 * A Look (the "Now" column or a take) works like the game: `bake()` makes its textures once (the game's atlas or
 * worker bake), then `draw(g, t, st)` composes sprites from them at time t (s since the event), the way a pooled
 * Phaser view would (position, scale, rotation, alpha, additive blend). No texture is made inside `draw`.
 */

/** Where and how big to draw. The canvas is already cleared and the night street drawn. */
export interface Stage {
  /** Pixels per metre on this canvas (game size: 36; the zoomed cards: 72–120). */
  pxm: number;
  /** Canvas size in px. */
  w: number;
  h: number;
  /** The event's origin in px (the muzzle, the impact, the blast centre). */
  cx: number;
  cy: number;
  /** Inspector: when set, draw ONLY this part (the shell greys the full picture and paints this part cyan). */
  only: string | null;
  /** Deterministic seed of this play (the shell changes it per loop so variants rotate like in the game). */
  seed: number;
  /** `?fx=low` preview: true halves particle counts like the game does. */
  low: boolean;
}

export interface Look {
  /** "now" for today's game, else the take code ("MZ-A"). */
  code: string;
  title: string;
  /** One or two sentences: what this take changes, and why (from the brief). */
  note: string;
  /** Make the textures (once). May yield to the browser (`await idle()`). */
  bake(): Promise<void>;
  /** The effect at time t (seconds since the event), centred on st.cx / st.cy. */
  draw(g: CanvasRenderingContext2D, t: number, st: Stage): void;
  /** The baked textures (decomposition and the performance table). */
  textures(): readonly { name: string; canvas: HTMLCanvasElement; note?: string }[];
  /** Parts for the element inspector (ids passed to `draw` as `st.only`). */
  parts?: readonly { id: string; label: string }[];
  /** The frames the game would show, in order, and when (decomposition: consecutive frames are diffed). */
  frames?: readonly { label: string; t: number; when: string }[];
  /**
   * Goal-first takes (code `${card}-G`, dead-city-model fx.md › FX 4): the reasoning, written BEFORE drawing.
   * The shell shows it on the card under the takes.
   */
  goalFirst?: {
    /** What the player must read, one sentence, from the game's rule (with its numbers). */
    goal: string;
    /** Each element and its one job toward the goal (which read it serves). */
    elements: readonly { name: string; job: string }[];
    /** Where each element may and may not appear, brightness order, one clock, what may cross an edge. */
    composition: readonly string[];
    /** Its own timeline (when it differs from the card's plan). */
    plan?: ActionPlan;
  };
}

/** Dope-sheet lanes for FX (the skill's lanes, for effects instead of a body). */
export type LaneId = "light" | "core" | "matter" | "smoke" | "mark" | "game";
export const LANES: readonly [LaneId, string][] = [
  ["light", "Light (flash, glow, light pool)"],
  ["core", "Core shape (flame, cone, disc)"],
  ["matter", "Matter thrown (blood, bits, sparks)"],
  ["smoke", "Smoke, dust, gas"],
  ["mark", "Mark left on the ground"],
  ["game", "Game (sound, damage, shake)"],
];
export interface Bar {
  t0: number;
  t1: number;
  label: string;
  /** A short accent (the release moment). */
  key?: boolean;
  /** New in this plan (not in the game today). */
  nw?: boolean;
}
export interface ActionPlan {
  /** What the player must read or feel, in one sentence. */
  goal: string;
  /** The real timing from the game's code / balance JSON, with the file it comes from. */
  timing: string;
  /** Length of the timeline in seconds. */
  lengthS: number;
  lanes: Partial<Record<LaneId, Bar[]>>;
}

export interface FxCard {
  /** Short id, also the anchor ("muzzle"). */
  id: string;
  /** Element code used in picks ("MZ"). Takes are `${code}-A`, `${code}-B`. */
  code: string;
  name: string;
  /** Section on the page. */
  family: "gunfire" | "fire" | "matter" | "telegraphs";
  /** Design brief (HTML): why this element looks like it does, derived from the group's idea. */
  brief: string;
  /** How the game uses it today (HTML): file, texture, size, blend, lifetime, pool / cap. */
  game: string;
  /** Performance against the caps (HTML): textures (px), sprites per event, cap, `?fx=low`. */
  perf: string;
  /** Findings while decomposing (HTML list items): bugs found, oddities, checked and fine. */
  findings?: readonly string[];
  /** One play in seconds; the card loops it with `gapS` of empty street after. */
  lengthS: number;
  gapS?: number;
  /** Times shown as stills when animation is off (and as the composed key moments). */
  keyT: readonly number[];
  /** View width in metres (the zoomed card). */
  viewM: number;
  /** Aspect of the view (h / w), default 0.75. */
  aspect?: number;
  /** Where the origin sits in the view, as fractions (default 0.5, 0.5). */
  origin?: [number, number];
  /** Optional: what to draw under the effect (a body, a wall), after the street, before the effect. */
  under?: (g: CanvasRenderingContext2D, t: number, st: Stage) => void;
  looks: readonly Look[];
  plan?: ActionPlan;
}

export const make = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};
export const idle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** Runs a generator to the end (the relight steps). */
export function run<T>(g: Generator<number, T, void>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}
/** Deterministic random (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0 → 1 between a and b (smoothstep). */
export const ramp = (t: number, a: number, b: number): number => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
export const easeOut = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);

/** The game's key light (palette.ts › LIGHT_DIR: from the upper left) and its cool tint. */
export const LIGHT = { dx: -0.6, dy: -0.8, tint: [0.93, 0.98, 1.06] as const };

/**
 * Draws a baked sprite like a Phaser image: centred at (x, y) px, `wM` metres wide (height keeps the texture's
 * aspect), rotation `rot`, alpha `a`, blend "add" (Phaser ADD) or normal. No allocation.
 */
/** Sprite counter for the performance table (the shell resets it; every composed sprite counts once). */
export const drawStats = { sprites: 0, additive: 0 };
/** Count a sprite drawn without `sprite()` (a Graphics shape, a tinted copy): one game object. */
export function countSprite(add = false): void {
  drawStats.sprites++;
  if (add) drawStats.additive++;
}
export function sprite(g: CanvasRenderingContext2D, tex: HTMLCanvasElement, x: number, y: number, wM: number, pxm: number, rot = 0, a = 1, add = false, hM?: number): void {
  if (a <= 0.003) return;
  countSprite(add);
  const w = wM * pxm;
  const h = hM !== undefined ? hM * pxm : (w * tex.height) / tex.width;
  g.save();
  g.globalAlpha = Math.min(1, a);
  if (add) g.globalCompositeOperation = "lighter";
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.drawImage(tex, -w / 2, -h / 2, w, h);
  g.restore();
}

/** A soft radial texture (light pools, glows, dust puffs): stops [offset, "rgba(...)"]. */
export function radialTex(px: number, stops: readonly [number, string][]): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, px, px);
  return c;
}
