/**
 * Story 9.13: the characters' relit frames (take 4's look) and one frame's bake (`charBakeSteps`). Pure: no Phaser,
 * no DOM (canvases from `make`), so the bake worker (`charactersBakeWorker.ts`) imports it. `charactersAtlas.ts`
 * owns the sheets, the kept cache and the worker.
 *
 * Sheets (B13): one texture per look (type + variant: every walk phase, windup and swell stage of that look, plus its
 * glow, sheen and vein pictures), so a picture landing re-uploads only a small sheet; each gun frame has its own.
 * Frame names: the walk loop `zombie_<walker|runner|crawler>_<v>_w<0..9>`; the other zombies and the guns keep their
 * atlas names (`zombie_spitter_windup_a`, `survivorgun_shotgun_a` …) on their sheet; a primary frame's layers add
 * `_glow`, `_sheen<k>`, `_vein<k>`.
 */
import type { ZombieTypeId } from "@topdown/shared";
import { frameName, variantLetter, type FrameSpec } from "./atlasLayout";
import { drawBloater } from "./bloaterArt";
import { VEIN_STEPS, prepareBloaterFx, type BloaterFxData } from "./charBloaterFx";
import { SHEEN_STEPS, relightCharSteps, sheenSide, sheenStrip } from "./charRelight";
import { drawCrawler2, drawRunner2, drawWalker2 } from "./commonzArt";
import type { MakeCanvas } from "./relight";
import { freeCanvas } from "./canvasRecycle";
import { CHAR_EXTENT_R, drawSurvivorBody, drawSurvivorGun, drawZombie } from "./spriteArt";
import type { ResolvedLook } from "./survivorLook";
import { WEAPON_ART, WEAPON_BACK_ART, drawChainsawRunning } from "./weaponArt";

/** Frame px per collision radius (`spriteAtlas.ts › CHAR_RX`; repeated: this module must not pull in Phaser). */
export const CHAR_PX_PER_R = 34;
/**
 * B3: the source is drawn at `CHAR_SS` × the output (68 px per radius: the page's output density), so the creases,
 * weave and mottle have the page's size in the frame. The page draws at 136 and outputs 68; at the game's 34 px per
 * radius ss 2 keeps every detail the frame can show (a frame px is 2 page px) at a quarter of ss 4's bake time.
 */
export const CHAR_SS = 2;
/** Walk loop pictures per look (take 4 `LOOP_FRAMES`: crossfaded, so 10 drawings read as smooth motion). */
export const LOOP_FRAMES = 10;
/** The loop types (the new commonz designs). */
export const LOOP_TYPES = ["walker", "runner", "crawler"] as const;
export type LoopType = (typeof LOOP_TYPES)[number];
export const isLoopType = (t: ZombieTypeId): t is LoopType => t === "walker" || t === "runner" || t === "crawler";

/** Variants per zombie type (`spriteAtlas.ts › ZOMBIE_VARIANTS`). */
const VARIANTS: Readonly<Record<ZombieTypeId, number>> = { walker: 4, runner: 2, crawler: 2, spitter: 2, brute: 5, bloater: 5 };
const SWELL_STAGES = 3;

export type G = CanvasRenderingContext2D;
/** One relit frame of the character sheets. */
export interface CharArt {
  readonly frame: string;
  readonly sheet: string;
  readonly extent: number;
  /** take 4's row seed (`900 + row × 7`), so the texture noise matches the approved page. */
  readonly seed: number;
  readonly draw: (g: G, r: number) => void;
  /** A primary frame also gets the glow, sheen (and a Bloater's veins and sacs); a loop's phases 1–9 don't (page: phase-0 glow and gloss). */
  readonly primary: boolean;
  /** Its drawing has glowing details (acid, pilot flames): a glow frame is kept for it (a test checks the bake agrees). */
  readonly glows?: boolean;
  readonly bloater?: { readonly look: number; readonly s: number; readonly seed: number };
  /** The walk loop's first picture: also baked plain first (B10: the new design shows before its relit picture lands). */
  readonly plainFirst?: boolean;
}

export const walkFrame = (type: LoopType, v: number, k: number): string => `${frameName("zombie", type, variantLetter(v))}_w${k}`;
export const sheetOf = (type: ZombieTypeId, v: number): string => `chars_${type}_${variantLetter(v)}`;
/** A Bloater look's vein pictures live on their own sheet (the biggest part: a landing re-uploads less). */
export const veinSheetOf = (v: number): string => `chars_bloaterveins_${variantLetter(v)}`;
const GUN_SHEETS = new Map<string, string>();
/** The sheet of a gun frame (memoised: the player view asks every frame). */
export function gunSheetOf(gunFrame: string): string {
  let s = GUN_SHEETS.get(gunFrame);
  if (s === undefined) {
    s = `chars_${gunFrame}`;
    GUN_SHEETS.set(gunFrame, s);
  }
  return s;
}
export const glowFrame = (frame: string): string => `${frame}_glow`;
export const sheenFrame = (frame: string, k: number): string => `${frame}_sheen${k}`;
export const veinFrame = (frame: string, k: number): string => `${frame}_vein${k}`;

/** take 4 `ROWS` index → seed. */
const rowSeed = (row: number): number => 900 + row * 7;
/** Rows of take 4's page: survivors 0–8, walkers 9–12, runners 13–14, crawlers 15–16, spitters 17–20, brutes 21–30, bloaters 31–50. */
const ROW = { walker: 9, runner: 13, crawler: 15, spitter: 17, brute: 21, bloater: 31 } as const;
const LOOP_DRAW: Readonly<Record<LoopType, (g: G, r: number, v: number, ph: number) => void>> = { walker: drawWalker2, runner: drawRunner2, crawler: drawCrawler2 };

/** Gun frames (`spriteAtlas.ts › SURVIVOR_GUN_*`), with take 4's survivor row of their weapon. */
const GUN_ROW_WEAPONS = ["shotgun", "assault_rifle", "fire_axe", "chainsaw", "grenade_launcher", "flamethrower", "gas_torch"];
export const GUN_PLAIN = frameName("survivorgun", "plain", "a");
export const GUN_CHAINSAW_RUNNING = frameName("survivorgun", "chainsaw", "b");
export const gunFrameOf = (weapon: string): string => frameName("survivorgun", weapon, "a");

function build(): CharArt[] {
  const out: CharArt[] = [];
  // walk loops first (the stress scene and wave 1 are walkers)
  for (const type of LOOP_TYPES) {
    for (let v = 0; v < VARIANTS[type]; v++) {
      const draw = LOOP_DRAW[type];
      for (let k = 0; k < LOOP_FRAMES; k++) {
        out.push({ frame: walkFrame(type, v, k), sheet: sheetOf(type, v), extent: CHAR_EXTENT_R[type], seed: rowSeed(ROW[type] + v), draw: (g, r) => draw(g, r, v, k / LOOP_FRAMES), primary: k === 0, ...(k === 0 ? { plainFirst: true } : {}) });
      }
    }
  }
  for (let v = 0; v < VARIANTS.spitter; v++) {
    for (const wu of [false, true]) {
      const name = wu ? `${frameName("zombie", "spitter", "windup")}_${variantLetter(v)}` : frameName("zombie", "spitter", variantLetter(v));
      out.push({ frame: name, sheet: sheetOf("spitter", v), extent: CHAR_EXTENT_R.spitter, seed: rowSeed(ROW.spitter + v * 2 + (wu ? 1 : 0)), draw: (g, r) => drawZombie(g, "spitter", r, v, wu), primary: true, glows: true });
    }
  }
  for (let v = 0; v < VARIANTS.brute; v++) {
    for (const wu of [false, true]) {
      const name = wu ? `${frameName("zombie", "brute", "windup")}_${variantLetter(v)}` : frameName("zombie", "brute", variantLetter(v));
      out.push({ frame: name, sheet: sheetOf("brute", v), extent: CHAR_EXTENT_R.brute, seed: rowSeed(ROW.brute + v * 2 + (wu ? 1 : 0)), draw: (g, r) => drawZombie(g, "brute", r, v, wu), primary: true, ...(v === 1 ? { glows: true } : {}) }); // BR2's hi-vis orange reads as glowing on the page too
    }
  }
  for (let v = 0; v < VARIANTS.bloater; v++) {
    for (let st = 0; st <= SWELL_STAGES; st++) {
      const name = st === 0 ? frameName("zombie", "bloater", variantLetter(v)) : `${frameName("zombie", "bloater", `swell${st}`)}_${variantLetter(v)}`;
      const row = ROW.bloater + v * 4 + st;
      out.push({ frame: name, sheet: sheetOf("bloater", v), extent: CHAR_EXTENT_R.bloater, seed: rowSeed(row), draw: (g, r) => drawBloater(g, r, v, st / SWELL_STAGES), primary: true, bloater: { look: v, s: st / SWELL_STAGES, seed: 1300 + row * 17 } });
    }
  }
  const gun = (frame: string, row: number, draw: (g: G, r: number) => void): CharArt => ({ frame, sheet: gunSheetOf(frame), extent: CHAR_EXTENT_R.survivor, seed: rowSeed(row), draw, primary: true });
  out.push(gun(GUN_PLAIN, 0, (g, r) => drawSurvivorGun(g, r)));
  const flames = new Set(["flamethrower", "gas_torch"]);
  for (const [i, w] of GUN_ROW_WEAPONS.entries()) {
    const art = WEAPON_ART[w];
    if (art) out.push({ ...gun(gunFrameOf(w), 1 + i, (g, r) => drawSurvivorGun(g, r, (c, rr) => art(c, "held", rr), WEAPON_BACK_ART[w])), ...(flames.has(w) ? { glows: true } : {}) });
  }
  for (const w of Object.keys(WEAPON_ART)) {
    const art = WEAPON_ART[w];
    if (!GUN_ROW_WEAPONS.includes(w) && art) out.push(gun(gunFrameOf(w), 0, (g, r) => drawSurvivorGun(g, r, (c, rr) => art(c, "held", rr), WEAPON_BACK_ART[w])));
  }
  out.push(gun(GUN_CHAINSAW_RUNNING, 8, (g, r) => drawSurvivorGun(g, r, (c, rr) => drawChainsawRunning(c, "held", rr))));
  return out;
}

let arts: readonly CharArt[] | null = null;
let byFrame: ReadonlyMap<string, CharArt> | null = null;
/** Every relit character frame, in bake order. */
export function charArts(): readonly CharArt[] {
  arts ??= build();
  return arts;
}
export function charArt(frame: string): CharArt | undefined {
  byFrame ??= new Map(charArts().map((a) => [a.frame, a]));
  return byFrame.get(frame);
}
/** Every sheet's texture key, in bake order. */
export function charSheets(): readonly string[] {
  const out = new Set<string>();
  for (const a of charArts()) {
    out.add(a.sheet);
    if (a.bloater) out.add(veinSheetOf(a.bloater.look));
  }
  return [...out];
}
export const frameSide = (extent: number): number => Math.ceil(2 * extent * CHAR_PX_PER_R);

/** A sheet's frame specs: each frame, and for a primary its glow, sheen steps (and a Bloater's vein steps). */
export function charSheetSpecs(sheet: string): FrameSpec[] {
  const out: FrameSpec[] = [];
  for (const a of charArts()) {
    const n = frameSide(a.extent);
    if (a.bloater && veinSheetOf(a.bloater.look) === sheet) for (let k = 0; k < VEIN_STEPS; k++) out.push({ name: veinFrame(a.frame, k), w: n, h: n });
    if (a.sheet !== sheet) continue;
    out.push({ name: a.frame, w: n, h: n });
    if (!a.primary) continue;
    if (a.glows) out.push({ name: glowFrame(a.frame), w: n, h: n });
    const h = sheenSide(n);
    for (let k = 0; k < SHEEN_STEPS; k++) out.push({ name: sheenFrame(a.frame, k), w: h, h });
  }
  return out;
}

/** A frame's bake result (canvases of the frame's size; strips side by side). */
export interface CharBaked {
  readonly base: HTMLCanvasElement;
  readonly glow: HTMLCanvasElement | null;
  /** `SHEEN_STEPS` sheen pictures side by side (primary frames). */
  readonly sheen: HTMLCanvasElement | null;
  /** `VEIN_STEPS` vein pictures side by side (Bloaters). */
  readonly veins: HTMLCanvasElement | null;
  readonly bloater: BloaterFxData | null;
  /** The plain drawing only (B10's first picture of a new design), not relit. */
  readonly plain: boolean;
}

/** Draws `draw` centred in a new `side` px canvas at `pxPerR`. */
export function drawCentred(make: MakeCanvas, side: number, pxPerR: number, draw: (g: G, r: number) => void): HTMLCanvasElement {
  const c = make(side, side);
  const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.translate(side / 2, side / 2);
  draw(g, pxPerR);
  return c;
}

/**
 * One picture's bake, resumable: draws the source at `CHAR_SS`×, relights it (yields per band / row), then the glow,
 * the sheen strip and a Bloater's veins and sacs. `plain`: only the drawing at the frame's size (B10).
 */
export function* charBakeSteps(draw: (g: G, r: number) => void, extent: number, seed: number, primary: boolean, bloater: CharArt["bloater"], make: MakeCanvas, plain = false): Generator<number, CharBaked, void> {
  const n = frameSide(extent);
  if (plain) {
    const base = drawCentred(make, n, CHAR_PX_PER_R, draw);
    yield n * n;
    return { base, glow: null, sheen: null, veins: null, bloater: null, plain: true };
  }
  const W = n * CHAR_SS;
  const src = drawCentred(make, W, CHAR_PX_PER_R * CHAR_SS, draw);
  try {
    yield (W * W) >> 3;
    const lit = yield* relightCharSteps(src, n, CHAR_SS, CHAR_PX_PER_R * CHAR_SS, seed, make);
    let veins: HTMLCanvasElement | null = null;
    let bfx: BloaterFxData | null = null;
    if (bloater) {
      const p = prepareBloaterFx(lit.base, lit.glow, bloater.look, bloater.s, bloater.seed, CHAR_PX_PER_R, CHAR_PX_PER_R / 68, make);
      veins = p.veins;
      bfx = p.fx;
      yield n * n * 4;
    }
    const sheen = primary ? sheenStrip(lit.gloss, n, make) : null;
    freeCanvas(lit.gloss);
    if (sheen) yield n * n;
    return { base: lit.base, glow: primary ? lit.glow : null, sheen, veins, bloater: bfx, plain: false };
  } finally {
    freeCanvas(src);
  }
}

/** A frame's bake (`charArt(frame)`); `plain` for B10's first picture. */
export function* charFrameSteps(a: CharArt, make: MakeCanvas, plain = false): Generator<number, CharBaked, void> {
  return yield* charBakeSteps(a.draw, a.extent, a.seed, a.primary, a.bloater, make, plain);
}

/** take 4's survivor row seed (the Pistol row: the body the page relit with the default gun). */
export const BODY_SEED = rowSeed(0);
/** A survivor body (Story 7.9's per-player picture, with or without the pack), relit; no glow layer (B14). */
export function* bodyBakeSteps(look: ResolvedLook, withPack: boolean, make: MakeCanvas): Generator<number, CharBaked, void> {
  const r = yield* charBakeSteps((g, rr) => drawSurvivorBody(g, rr, look, withPack, false), CHAR_EXTENT_R.survivor, BODY_SEED, true, undefined, make);
  freeCanvas(r.glow);
  return { ...r, glow: null };
}
