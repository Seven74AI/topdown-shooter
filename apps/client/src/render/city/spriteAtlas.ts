import type * as Phaser from "phaser";
import { ZOMBIE_TYPES, type ZombieTypeId } from "@topdown/shared";
import { frameName, packAtlas, variantLetter, type FrameSpec, type PlacedFrame } from "./atlasLayout";
import { CAR_COLORS } from "./dressing";
import { addGeneratedTexture } from "./canvasTexture";
import { STREET_PROPS_FRAMES, STREET_PROPS_HEIGHT, STREET_PROPS_WIDTH, takeStreetProps } from "./streetPropsAtlas";
import { drawObjectInFrame, drawSandbags } from "./objectArt";
import { drawAcidPuddle, drawSpitGlob } from "./spitterArt";
import { TIER_PLATE_H, WEAPON_ART, WEAPON_BACK_ART, drawChainsawRunning, drawTierPlate, tierPlateWidth } from "./weaponArt";
import { BLOATER_SWELL_STAGES, drawBloater } from "./bloaterArt";
import { drawBileSplat, drawBurstFlash, drawClothScrap, drawGasDisc } from "./bloaterFxArt";
import { CHAR_EXTENT_R, drawBarrier, drawBlock, drawBus, drawCar, drawCharredCar, drawDumpster, drawPump, drawSurvivor, drawSurvivorGun, drawZombie } from "./spriteArt";

/**
 * Story 4.9: the placeholder atlases, drawn procedurally into canvases and registered as Phaser
 * textures with named frames (D3). Texture keys and frame names are the final ones: Epic 9 loads
 * `public/assets/atlases/{characters,downtown,fx}.png/.json` under the same keys instead.
 */

export const ATLAS_CHARACTERS = "atlas_characters";
export const ATLAS_DOWNTOWN = "atlas_downtown";
export const ATLAS_FX = "atlas_fx";

/** Collision radius in frame px (characters are drawn in radius units, so the frame fits every balance radius). */
export const CHAR_R_PX = 34;
/** Walker/runner/crawler variants (clothes); the survivor has one. */
export const ZOMBIE_VARIANTS: Readonly<Record<ZombieTypeId, number>> = { walker: 4, runner: 2, crawler: 2, spitter: 2, brute: 5, bloater: 5 }; // Story 5.7: BR1–BR5; Story 5.8: BL1–BL5

/** Frame names per zombie type (built once: views never build strings per frame). */
export const ZOMBIE_FRAMES: Readonly<Record<ZombieTypeId, readonly string[]>> = Object.fromEntries(
  ZOMBIE_TYPES.map((t) => [t, Array.from({ length: ZOMBIE_VARIANTS[t] }, (_, i) => frameName("zombie", t, variantLetter(i)))]),
) as unknown as Record<ZombieTypeId, readonly string[]>;
export const SURVIVOR_FRAME = frameName("survivor", "body", "a");
/** Story 5.6: the Spitter's windup pose (rearing back, mouth blazing), one per clothes variant. */
export const SPITTER_WINDUP_FRAMES: readonly string[] = Array.from({ length: ZOMBIE_VARIANTS.spitter }, (_, i) => `${frameName("zombie", "spitter", "windup")}_${variantLetter(i)}`);
/** Story 5.7: the Brute's windup pose (arms raised under the clothes), one per look (BR1–BR5). */
export const BRUTE_WINDUP_FRAMES: readonly string[] = Array.from({ length: ZOMBIE_VARIANTS.brute }, (_, i) => `${frameName("zombie", "brute", "windup")}_${variantLetter(i)}`);
/**
 * Story 5.8: the Bloater's swell frames per look: `BLOATER_SWELL_FRAMES[stage][look]` =
 * `zombie_bloater_swell<k>_<look>` for k = 1–3 (swell s = k / 3; the view steps through them over the
 * 1 s fuse: the growth is in the art, the frame keeps its size).
 */
export const BLOATER_SWELL_FRAMES: readonly (readonly string[])[] = Array.from({ length: BLOATER_SWELL_STAGES }, (_, k) =>
  Array.from({ length: ZOMBIE_VARIANTS.bloater }, (_, i) => `${frameName("zombie", "bloater", `swell${k + 1}`)}_${variantLetter(i)}`),
);
/**
 * Story 5.3: the survivor holding a weapon with its own art (`weaponArt.ts`), by weapon id:
 * `survivor_shotgun_a`, `survivor_assault_rifle_a`. Other weapons use `SURVIVOR_FRAME`.
 */
export const SURVIVOR_WEAPON_FRAMES: Readonly<Record<string, string>> = Object.fromEntries(Object.keys(WEAPON_ART).map((w) => [w, frameName("survivor", w, "a")]));
/** Story 5.2: the survivor with the Chainsaw running (chain blurred), shown while it cuts. */
export const SURVIVOR_CHAINSAW_RUNNING = frameName("survivor", "chainsaw", "b");
/** The survivor frame for the active weapon (no string building per frame); `running`: a Chainsaw that is cutting. */
export const survivorFrameFor = (weapon: string, running = false): string =>
  running && weapon === "chainsaw" ? SURVIVOR_CHAINSAW_RUNNING : (SURVIVOR_WEAPON_FRAMES[weapon] ?? SURVIVOR_FRAME);

/**
 * Story 7.9 (D2): the held gun on its own (back piece + gun, no body), drawn under each player's own body picture
 * (`SurvivorLookTextures`). Same frame size and centre as `SURVIVOR_FRAME`, so gun and body share one position and
 * rotation. The `survivor_*` frames above stay in the atlas (Story 7.8's digest pin) but are no longer used by the game.
 */
export const SURVIVOR_GUN_PLAIN = frameName("survivorgun", "plain", "a");
export const SURVIVOR_GUN_FRAMES: Readonly<Record<string, string>> = Object.fromEntries(Object.keys(WEAPON_ART).map((w) => [w, frameName("survivorgun", w, "a")]));
export const SURVIVOR_GUN_CHAINSAW_RUNNING = frameName("survivorgun", "chainsaw", "b");
/** The gun frame for the active weapon (no string building per frame); `running`: a Chainsaw that is cutting. */
export const survivorGunFrameFor = (weapon: string, running = false): string =>
  running && weapon === "chainsaw" ? SURVIVOR_GUN_CHAINSAW_RUNNING : (SURVIVOR_GUN_FRAMES[weapon] ?? SURVIVOR_GUN_PLAIN);
/** The weapon has a back piece (the flamethrower's tanks): the body is drawn without its pack. */
export const weaponHidesPack = (weapon: string): boolean => WEAPON_BACK_ART[weapon] !== undefined;

/** Downtown vehicles and props: frame name → native size in map px (32 px = 1 m). */
export const VEHICLE_BUS = frameName("vehicle", "bus", "a");
export const CAR_FRAMES: readonly string[] = CAR_COLORS.map((_, i) => frameName("vehicle", "car", variantLetter(i)));
/** Story 4.12: each car variant burnt (fire-lab panel D): drawn for a car that is a fire's target. */
export const CAR_BURNT_FRAMES: readonly string[] = CAR_COLORS.map((_, i) => frameName("vehicle", "carburnt", variantLetter(i)));
export const PROP_PUMP = frameName("prop", "pump", "a");
/** The two police barrier looks at 6 m (the asset review shows these; the city bake draws each line at its own length). */
export const PROP_BARRIER = frameName("prop", "barrier", "a");
export const PROP_BARRIER_CONCRETE = frameName("prop", "barrier", "b");
export const PROP_SANDBAGS = frameName("prop", "sandbags", "a");
/** Story 4.5's `block` mutations: the dumpster, and a generic blockage for any other block. */
export const PROP_DUMPSTER = frameName("prop", "dumpster", "a");
export const PROP_BLOCK = frameName("prop", "block", "a");
const PROP_NATIVE: Readonly<Record<string, readonly [number, number]>> = {
  [VEHICLE_BUS]: [320, 80],
  ...Object.fromEntries(CAR_FRAMES.map((n) => [n, [144, 64] as const])),
  ...Object.fromEntries(CAR_BURNT_FRAMES.map((n) => [n, [144, 64] as const])),
  [PROP_PUMP]: [64, 32],
  [PROP_BARRIER]: [192, 16],
  [PROP_BARRIER_CONCRETE]: [192, 16],
  [PROP_SANDBAGS]: [96, 32],
  [PROP_DUMPSTER]: [48, 48],
  [PROP_BLOCK]: [48, 48],
};
/** Downtown atlas px per map px (64 px per metre). */
export const DOWNTOWN_ATLAS_SCALE = 2;

export const FX_RAIN = frameName("fx", "rain", "a");
export const FX_SPLASH = frameName("fx", "splash", "a");
export const FX_GLOW = frameName("fx", "glow", "a");
export const FX_VIGNETTE = frameName("fx", "vignette", "a");
/**
 * Story 5.10: the floodlight's light pool (round D FL1 card: a flat warm disc that holds its strength
 * out to ~3/4 of the radius and fades to 0 AT the frame edge = the 4 m light radius). White: tinted.
 */
export const FX_FLOOD_POOL = frameName("fx", "floodpool", "a");
/** Story 4.11: a white edge band (opaque at its top, clear at its bottom), tinted for the burning screen-edge glow. */
export const FX_EDGE = frameName("fx", "edge", "a");
/** Story 5.6: the spit glob in flight and the acid puddle (two shapes); the puddle frame's edge is the damage edge. */
export const FX_SPIT_GLOB = `${frameName("fx", "spit", "glob")}_01`;
export const FX_ACID_PUDDLES: readonly string[] = ["01", "02"].map((v) => `${frameName("fx", "acid", "puddle")}_${v}`);
/**
 * Story 5.1: the U1 upgrade tier plates for the HUD, by level (index 2–4 = II–IV; I has no mark),
 * drawn at `FX_TIER_SCALE` px per CSS px.
 */
export const FX_TIER_MARKS: readonly string[] = ["", "", frameName("fx", "tiermark", "b"), frameName("fx", "tiermark", "c"), frameName("fx", "tiermark", "d")];
export const FX_TIER_SCALE = 3;
/**
 * Story 5.8: the Bloater burst: two gas discs (the frame's edge is the cloud's edge: drawn 2 ×
 * `gasRadiusM` wide), the green flash, four bile splats, a cloth scrap (tinted per look).
 */
export const FX_GAS_CLOUDS: readonly string[] = ["a", "b"].map((v) => frameName("fx", "gascloud", v));
export const FX_EXPLOSION_BLOATER = frameName("fx", "explosionbloater", "a");
export const FX_BILE_SPLATS: readonly string[] = ["a", "b", "c", "d"].map((v) => frameName("fx", "bilesplat", v));
export const FX_CLOTH_SCRAP = frameName("fx", "clothscrap", "a");
/**
 * Story 6.3 (AC 8, D5): zombie eyes above the darkness: two pale yellow dots (236,226,150; drawn at
 * alpha 0.9 by EyesView) side by side across the frame's height (the image is rotated to the
 * facing, so they sit across the head). The Brute's are bigger and wider apart.
 */
export const FX_EYES = frameName("fx", "eyes", "a");
export const FX_EYES_BRUTE = frameName("fx", "eyes", "brute");
/**
 * Story 6.2: the Ruins lamp drop-out (`lamp_dark`: a MULTIPLY disc, the lab's `lampDark`: dark grey
 * centre to white edge, so the baked lamp pool is taken back out while the lamp is off), the falling
 * debris dust puff (white, tinted per material) and a grit chip; Story 6.4: an ash flake (CO3).
 */
export const FX_LAMP_DARK = frameName("fx", "lampdark", "a");
export const FX_DUST = frameName("fx", "dust", "a");
export const FX_GRIT = frameName("fx", "grit", "a");
export const FX_ASH = frameName("fx", "ash", "a");
/** Eye frames: px per metre and the dots (radius, half spacing) in metres (main2.js › eyes: 0.035 m dots, 0.08 m off the centre line). */
export const EYES_PX_PER_M = 160;
export const EYES_DOT_M = { a: [0.035, 0.08], brute: [0.055, 0.13] } as const;
const FX_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  [FX_RAIN]: [4, 28],
  [FX_SPLASH]: [40, 20],
  [FX_GLOW]: [64, 64],
  [FX_FLOOD_POOL]: [64, 64],
  [FX_VIGNETTE]: [8, 64],
  [FX_EDGE]: [8, 64],
  [FX_SPIT_GLOB]: [48, 48],
  ...Object.fromEntries(FX_ACID_PUDDLES.map((n) => [n, [128, 128] as const])),
  ...Object.fromEntries(FX_GAS_CLOUDS.map((n) => [n, [160, 160] as const])), // Story 5.8
  [FX_EXPLOSION_BLOATER]: [96, 96],
  ...Object.fromEntries(FX_BILE_SPLATS.map((n) => [n, [40, 40] as const])),
  [FX_CLOTH_SCRAP]: [16, 10],
  [FX_EYES]: [16, 40], // Story 6.3: 0.1 × 0.25 m at 160 px/m
  [FX_EYES_BRUTE]: [24, 64], // 0.15 × 0.4 m
  [FX_LAMP_DARK]: [64, 64], // Story 6.2
  [FX_DUST]: [48, 48],
  [FX_GRIT]: [8, 8],
  [FX_ASH]: [10, 6], // Story 6.4
  ...Object.fromEntries([2, 3, 4].map((lv) => [FX_TIER_MARKS[lv] as string, [Math.ceil(tierPlateWidth(lv) * FX_TIER_SCALE), TIER_PLATE_H * FX_TIER_SCALE] as const])),
};

export interface AtlasCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly frames: ReadonlyMap<string, PlacedFrame>;
}

/** The frame specs of each atlas (pure: tests check names and sizes). */
export function characterSpecs(): FrameSpec[] {
  const out: FrameSpec[] = [];
  for (const t of ZOMBIE_TYPES) {
    const side = Math.ceil(2 * CHAR_EXTENT_R[t] * CHAR_R_PX);
    for (const name of ZOMBIE_FRAMES[t]) out.push({ name, w: side, h: side });
  }
  const sp = Math.ceil(2 * CHAR_EXTENT_R.spitter * CHAR_R_PX);
  for (const name of SPITTER_WINDUP_FRAMES) out.push({ name, w: sp, h: sp });
  const br = Math.ceil(2 * CHAR_EXTENT_R.brute * CHAR_R_PX);
  for (const name of BRUTE_WINDUP_FRAMES) out.push({ name, w: br, h: br });
  const bl = Math.ceil(2 * CHAR_EXTENT_R.bloater * CHAR_R_PX);
  for (const stage of BLOATER_SWELL_FRAMES) for (const name of stage) out.push({ name, w: bl, h: bl });
  const s = Math.ceil(2 * CHAR_EXTENT_R.survivor * CHAR_R_PX);
  out.push({ name: SURVIVOR_FRAME, w: s, h: s });
  for (const name of Object.values(SURVIVOR_WEAPON_FRAMES)) out.push({ name, w: s, h: s });
  out.push({ name: SURVIVOR_CHAINSAW_RUNNING, w: s, h: s });
  out.push({ name: SURVIVOR_GUN_PLAIN, w: s, h: s });
  for (const name of Object.values(SURVIVOR_GUN_FRAMES)) out.push({ name, w: s, h: s });
  out.push({ name: SURVIVOR_GUN_CHAINSAW_RUNNING, w: s, h: s });
  return out;
}
export function downtownSpecs(): FrameSpec[] {
  return Object.entries(PROP_NATIVE).map(([name, [w, h]]) => ({ name, w: w * DOWNTOWN_ATLAS_SCALE, h: h * DOWNTOWN_ATLAS_SCALE }));
}
export function fxSpecs(): FrameSpec[] {
  return Object.entries(FX_SIZE).map(([name, [w, h]]) => ({ name, w, h }));
}

/** Native size (map px) of a downtown frame. */
export function nativeSize(frame: string): readonly [number, number] {
  return PROP_NATIVE[frame] ?? [32, 32];
}

type DrawFrame = (g: CanvasRenderingContext2D, f: PlacedFrame) => void;

/** Draws every frame, each clipped to its rectangle. */
function paintFrames(g: CanvasRenderingContext2D, frames: Iterable<PlacedFrame>, draw: DrawFrame): void {
  for (const f of frames) {
    g.save();
    g.beginPath();
    g.rect(f.x, f.y, f.w, f.h);
    g.clip();
    draw(g, f);
    g.restore();
  }
}

/** Lays the frames out on a canvas of the atlas's size (not drawn yet). */
function layOut(specs: FrameSpec[]): AtlasCanvas {
  const layout = packAtlas(specs);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const frames = new Map<string, PlacedFrame>();
  for (const f of layout.frames) frames.set(f.name, f);
  return { canvas, frames };
}

function build(specs: FrameSpec[], draw: DrawFrame): AtlasCanvas {
  const a = layOut(specs);
  paintFrames(a.canvas.getContext("2d") as CanvasRenderingContext2D, a.frames.values(), draw);
  return a;
}

function zombieOf(name: string): { type: ZombieTypeId; variant: number } | null {
  for (const t of ZOMBIE_TYPES) {
    const i = ZOMBIE_FRAMES[t].indexOf(name);
    if (i >= 0) return { type: t, variant: i };
  }
  return null;
}

/** Paints one character-atlas frame (exported for tests: Story 7.9 review L2 checks the real gun frames). */
export function drawCharacterFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  g.translate(f.x + f.w / 2, f.y + f.h / 2);
  if (f.name === SURVIVOR_FRAME) return drawSurvivor(g, CHAR_R_PX);
  if (f.name === SURVIVOR_CHAINSAW_RUNNING) return drawSurvivor(g, CHAR_R_PX, (c, r) => drawChainsawRunning(c, "held", r));
  if (f.name === SURVIVOR_GUN_PLAIN) return drawSurvivorGun(g, CHAR_R_PX);
  if (f.name === SURVIVOR_GUN_CHAINSAW_RUNNING) return drawSurvivorGun(g, CHAR_R_PX, (c, r) => drawChainsawRunning(c, "held", r));
  for (const [weapon, name] of Object.entries(SURVIVOR_GUN_FRAMES)) {
    const art = WEAPON_ART[weapon];
    if (name === f.name && art) return drawSurvivorGun(g, CHAR_R_PX, (c, r) => art(c, "held", r), WEAPON_BACK_ART[weapon]);
  }
  for (const [weapon, name] of Object.entries(SURVIVOR_WEAPON_FRAMES)) {
    const art = WEAPON_ART[weapon];
    if (name === f.name && art) return drawSurvivor(g, CHAR_R_PX, (c, r) => art(c, "held", r), WEAPON_BACK_ART[weapon]); // Story 5.4: FT1's tanks
  }
  const z = zombieOf(f.name);
  if (z) drawZombie(g, z.type, CHAR_R_PX, z.variant);
  const w = SPITTER_WINDUP_FRAMES.indexOf(f.name);
  if (w >= 0) drawZombie(g, "spitter", CHAR_R_PX, w, true);
  const bw = BRUTE_WINDUP_FRAMES.indexOf(f.name);
  if (bw >= 0) drawZombie(g, "brute", CHAR_R_PX, bw, true);
  for (let k = 0; k < BLOATER_SWELL_FRAMES.length; k++) {
    const look = (BLOATER_SWELL_FRAMES[k] as readonly string[]).indexOf(f.name);
    if (look >= 0) drawBloater(g, CHAR_R_PX, look, (k + 1) / BLOATER_SWELL_FRAMES.length); // Story 5.8
  }
}

function drawDowntownFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const [w, h] = nativeSize(f.name);
  // Story 4.12: the S2 sandbags drawn in code, in metres (3 × 1 m at 64 px/m)
  if (f.name === PROP_SANDBAGS) return drawObjectInFrame(g, f.x, f.y, f.w, f.h, f.w / (w / 32), (c) => drawSandbags(c, w / 32, h / 32));
  g.translate(f.x, f.y);
  g.scale(DOWNTOWN_ATLAS_SCALE, DOWNTOWN_ATLAS_SCALE);
  if (f.name === VEHICLE_BUS) drawBus(g, w, h);
  else if (f.name === PROP_PUMP) drawPump(g, w, h);
  else if (f.name === PROP_BARRIER) drawBarrier(g, w, h, "sawhorse");
  else if (f.name === PROP_BARRIER_CONCRETE) drawBarrier(g, w, h, "concrete");
  else if (f.name === PROP_DUMPSTER) drawDumpster(g, w, h);
  else if (f.name === PROP_BLOCK) drawBlock(g, w, h);
  else {
    const v = CAR_FRAMES.indexOf(f.name);
    const b = CAR_BURNT_FRAMES.indexOf(f.name);
    if (v >= 0 || b >= 0) {
      g.translate(w / 2, h / 2);
      if (v >= 0) drawCar(g, w, h, v);
      else drawCharredCar(g, w, h, b);
    }
  }
}

function drawFxFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const { x, y, w, h } = f;
  if (f.name === FX_RAIN) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(190,210,230,0)");
    gr.addColorStop(1, "rgba(190,210,230,1)");
    g.fillStyle = gr;
    g.fillRect(x + 1, y, w - 2, h);
  } else if (f.name === FX_SPLASH) {
    g.strokeStyle = "rgba(200,220,240,1)";
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x + w / 2, y + h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (f.name === FX_EYES || f.name === FX_EYES_BRUTE) {
    // Story 6.3: two dots, centred on the frame's middle column, ± half spacing along its height.
    const [r, off] = f.name === FX_EYES ? EYES_DOT_M.a : EYES_DOT_M.brute;
    const cx = x + w / 2;
    const cy = y + h / 2;
    g.fillStyle = "rgba(236,226,150,1)";
    g.beginPath();
    g.arc(cx, cy - off * EYES_PX_PER_M, r * EYES_PX_PER_M, 0, Math.PI * 2);
    g.arc(cx, cy + off * EYES_PX_PER_M, r * EYES_PX_PER_M, 0, Math.PI * 2);
    g.fill();
  } else if (f.name === FX_FLOOD_POOL) {
    // The reference's pool stops (looks.html › buildRD › poolSpr), alpha only.
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.74)");
    gr.addColorStop(0.75, "rgba(255,255,255,0.44)");
    gr.addColorStop(0.92, "rgba(255,255,255,0.2)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  } else if (f.name === FX_LAMP_DARK) {
    // main1.js › lampDark (R 5.8 m): multiplied, so white = unchanged.
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    gr.addColorStop(0, "rgb(70,72,86)");
    gr.addColorStop(0.18, "rgb(120,122,136)");
    gr.addColorStop(0.5, "rgb(200,202,210)");
    gr.addColorStop(1, "rgb(255,255,255)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  } else if (f.name === FX_DUST) {
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(0.55, "rgba(255,255,255,0.4)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  } else if (f.name === FX_GRIT) {
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(x + 1, y + 2);
    g.lineTo(x + 6, y + 1);
    g.lineTo(x + 7, y + 6);
    g.lineTo(x + 2, y + 7);
    g.closePath();
    g.fill();
  } else if (f.name === FX_ASH) {
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.ellipse(x + w / 2, y + h / 2, w / 2 - 1, h / 2 - 1, 0.3, 0, Math.PI * 2);
    g.fill();
  } else if (f.name === FX_GLOW) {
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  } else if (f.name === FX_EDGE) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  } else if (f.name === FX_SPIT_GLOB) {
    g.translate(x + w / 2, y + h / 2);
    drawSpitGlob(g, w);
  } else if (FX_ACID_PUDDLES.includes(f.name)) {
    g.translate(x + w / 2, y + h / 2);
    drawAcidPuddle(g, w, 131 + FX_ACID_PUDDLES.indexOf(f.name) * 70);
  } else if (FX_GAS_CLOUDS.includes(f.name)) {
    drawGasDisc(g, x, y, w, FX_GAS_CLOUDS.indexOf(f.name) * 9); // Story 5.8 (pixel data: device space)
  } else if (f.name === FX_EXPLOSION_BLOATER) {
    g.translate(x + w / 2, y + h / 2);
    drawBurstFlash(g, w);
  } else if (FX_BILE_SPLATS.includes(f.name)) {
    g.translate(x + w / 2, y + h / 2);
    drawBileSplat(g, w, FX_BILE_SPLATS.indexOf(f.name));
  } else if (f.name === FX_CLOTH_SCRAP) {
    g.translate(x + w / 2, y + h / 2);
    drawClothScrap(g, w, h);
  } else if (FX_TIER_MARKS.indexOf(f.name) >= 2) {
    g.translate(x, y);
    g.scale(FX_TIER_SCALE, FX_TIER_SCALE);
    drawTierPlate(g, FX_TIER_MARKS.indexOf(f.name)); // Story 5.1
  } else if (f.name === FX_VIGNETTE) {
    // one edge band (dark at the top, clear at the bottom); the view lays four around the screen
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(0,0,0,0.5)");
    gr.addColorStop(0.55, "rgba(0,0,0,0.16)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }
}

let downtownAtlas: AtlasCanvas | null = null;

/**
 * Registers an atlas as a texture with its frames (once per game: textures outlive scene restarts).
 * Story 4.13: drawn through `addGeneratedTexture`, so a lost graphics context redraws it in place.
 */
function register(scene: Phaser.Scene, key: string, specs: () => FrameSpec[], draw: DrawFrame): AtlasCanvas | null {
  if (scene.textures.exists(key)) return null;
  const a = layOut(specs());
  addGeneratedTexture(
    scene,
    key,
    a.canvas,
    (g) => paintFrames(g, a.frames.values(), draw),
    (tex) => {
      for (const f of a.frames.values()) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
  return a;
}

/**
 * Story 9.14 (B1): the downtown atlas from the pre-rendered street props image: a canvas of the image's layout painted
 * from it (same frame names and sizes as the code atlas, plus the standing police pictures). Registered through
 * `addGeneratedTexture` when `scene` is given (a lost context repaints it from the image, AC 3). Exported for tests.
 */
export function imageAtlas(img: HTMLImageElement, scene?: Phaser.Scene): AtlasCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = STREET_PROPS_WIDTH;
  canvas.height = STREET_PROPS_HEIGHT;
  const frames = new Map<string, PlacedFrame>();
  for (const [name, f] of Object.entries(STREET_PROPS_FRAMES)) frames.set(name, { name, x: f.x, y: f.y, w: f.w, h: f.h });
  const paint = (g: CanvasRenderingContext2D): void => g.drawImage(img, 0, 0);
  if (scene) {
    addGeneratedTexture(scene, ATLAS_DOWNTOWN, canvas, paint, (tex) => {
      for (const f of frames.values()) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    });
  } else paint(canvas.getContext("2d") as CanvasRenderingContext2D);
  return { canvas, frames };
}

/** Creates the three atlases (idempotent) and returns the downtown one (the static bake draws from it). */
export function ensureAtlases(scene: Phaser.Scene): AtlasCanvas {
  register(scene, ATLAS_CHARACTERS, characterSpecs, drawCharacterFrame);
  register(scene, ATLAS_FX, fxSpecs, drawFxFrame);
  // Story 9.14: the pre-rendered photoreal props when the image loaded; the code drawings otherwise (B8)
  if (!scene.textures.exists(ATLAS_DOWNTOWN)) {
    const img = takeStreetProps(scene);
    downtownAtlas = img ? imageAtlas(img, scene) : register(scene, ATLAS_DOWNTOWN, downtownSpecs, drawDowntownFrame);
  }
  if (!downtownAtlas) {
    const img = takeStreetProps(scene);
    downtownAtlas = img ? imageAtlas(img) : build(downtownSpecs(), drawDowntownFrame);
  }
  return downtownAtlas;
}
