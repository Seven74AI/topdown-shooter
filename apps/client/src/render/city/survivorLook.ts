/**
 * Story 7.8: turns a survivor look (part ids + chosen colours) into what the part drawings need: the part ids and
 * the final in-game colours. Pure, no Phaser, no canvas. Called when a survivor texture is baked, never per frame.
 *
 * Characters are drawn above the lightmap, so they carry the night themselves (D5): a chosen colour is darkened and
 * slightly desaturated (`cosmetics.json › look.nightMute`), then dimmed per decay stage (`look.stageDim`, stage 1 =
 * no extra dim). The default look's colours are the `CHAR` night colours already, so they are not muted again.
 */
import { COSMETICS, DEFAULT_LOOK, cosmeticPart, type CosmeticSlot, type Cosmetics, type SurvivorLook } from "@topdown/shared";

export type ResolvedColours = { readonly top: string; readonly hair: string; readonly accent: string; readonly skin: string };

export type ResolvedLook = {
  readonly top: string;
  readonly head: string;
  readonly hair: string;
  readonly pack: string;
  readonly acc: string;
  readonly skin: string;
  /** The headgear covers the hair (catalogue `hidesHair`). */
  readonly hidesHair: boolean;
  /** Final colours: picker colours night-muted and stage-dimmed; skin is the preset, stage-dimmed. */
  readonly colours: ResolvedColours;
  /** Decay stage 1..5, for the fixed colours the parts draw themselves (`stageDim`). */
  readonly stage: number;
};

function rgbOf(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function toHsl(h: string): [number, number, number] {
  const [r, g, b] = rgbOf(h).map((v) => v / 255) as [number, number, number];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hue = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue / 6, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  if (s === 0) return toHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t0: number): number => {
    const t = (t0 + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 0.5) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return toHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

/** HSL lightness and saturation of a `#rrggbb` colour (0..1). Exported for tests. */
export function lightSat(h: string): { l: number; s: number } {
  const [, s, l] = toHsl(h);
  return { l, s };
}

/** A chosen colour at night: lightness and saturation scaled by `look.nightMute`. */
export function nightMute(h: string, c: Cosmetics = COSMETICS): string {
  const [hue, s, l] = toHsl(h);
  return fromHsl(hue, s * c.look.nightMute.saturation, l * c.look.nightMute.lightness);
}

/** A colour dimmed for decay stage 1..5 (`look.stageDim`). Stage 1 returns the input unchanged (same string). */
export function stageDim(h: string, stage: number, c: Cosmetics = COSMETICS): string {
  const k = c.look.stageDim[clampStage(stage) - 1] ?? 1;
  if (k === 1) return h;
  const [hue, s, l] = toHsl(h);
  return fromHsl(hue, s, l * k);
}

function clampStage(stage: number): number {
  return Math.max(1, Math.min(5, Math.round(stage) || 1));
}

const PICKERS = ["top", "hair", "accent"] as const;

/** One part id per slot, falling back to the default part for an unknown id (a look never breaks drawing). */
function partOr(slot: CosmeticSlot, id: string, c: Cosmetics): string {
  return cosmeticPart(slot, id, c) ? id : c.defaultLook[slot];
}

/** The look ready to draw at a decay stage. */
export function resolveLook(look: SurvivorLook, stage = 1, c: Cosmetics = COSMETICS): ResolvedLook {
  const st = clampStage(stage);
  const top = partOr("top", look.top, c);
  const head = partOr("head", look.head, c);
  const hair = partOr("hair", look.hair, c);
  const pack = partOr("pack", look.pack, c);
  const acc = partOr("acc", look.acc, c);
  const skin = partOr("skin", look.skin, c);
  const final = {} as Record<(typeof PICKERS)[number], string>;
  for (const k of PICKERS) {
    const chosen = look.colours[k].toLowerCase();
    const muted = chosen === c.defaultLook.colours[k] ? chosen : nightMute(chosen, c);
    final[k] = stageDim(muted, st, c);
  }
  const skinHex = cosmeticPart("skin", skin, c)?.hex ?? (cosmeticPart("skin", c.defaultLook.skin, c)?.hex as string);
  return {
    top,
    head,
    hair,
    pack,
    acc,
    skin,
    hidesHair: cosmeticPart("head", head, c)?.hidesHair === true,
    colours: { top: final.top, hair: final.hair, accent: final.accent, skin: stageDim(skinHex, st, c) },
    stage: st,
  };
}

/** Today's survivor at stage 1: its colours are exactly the `CHAR` constants. */
export const DEFAULT_RESOLVED_LOOK: ResolvedLook = Object.freeze(resolveLook(DEFAULT_LOOK, 1));
