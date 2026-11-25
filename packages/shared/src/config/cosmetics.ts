/**
 * Story 7.8: the survivor parts catalogue (`cosmetics.json`, the designer's picks in `docs/epic-7-decisions.md`). Looks only: no gameplay numbers, not part of
 * `Balance` and not in the balance version (a new hat must not force "Please refresh"). Drawing lives in the
 * client (`apps/client/src/render/city/survivorParts.ts`); this file is the data and its zod schema (ADR-03).
 */
import { z } from "zod";
import raw from "./cosmetics.json" with { type: "json" };

/** Story 7.8 picks: five slots (the accent slot was dropped; its colour stays as the colour of hats and bags). */
export const COSMETIC_SLOTS = ["top", "head", "hair", "pack", "skin"] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

/** Which picker colour a part takes (`none` = fixed colours drawn by the part itself; `accent` = hats and bags). */
export const COSMETIC_COLOURS = ["none", "top", "hair", "accent"] as const;
export type CosmeticColour = (typeof COSMETIC_COLOURS)[number];

const hex = z.string().regex(/^#[0-9a-f]{6}$/, "colours are lowercase #rrggbb");
/** Ids fit Story 7.9's look code (≤ 96 characters for the whole code). */
const partId = z.string().regex(/^[a-z0-9]{1,8}$/, "part ids are lowercase, 1-8 characters");
const unlock = z.string().regex(/^(starter|loot|milestone:m([1-9]|10))$/, "unlock is starter, loot or milestone:m1..m10");

/**
 * Story 7.8 (designer 2026-11-24, the spinning propeller): a part may declare an animated layer. The body bake leaves
 * the layer out; the client draws it as its own small sprite on top of the survivor (one texture per layer, through
 * `addGeneratedTexture`; one pooled sprite per survivor), turned each frame. `spinRevPerS` is the spin speed.
 */
export const ANIMATED_LAYERS = ["propeller"] as const;
export type AnimatedLayerId = (typeof ANIMATED_LAYERS)[number];
const animatedSchema = z.object({ layer: z.enum(ANIMATED_LAYERS), spinRevPerS: z.number().positive().max(10) }).strict();

const partSchema = z
  .object({
    id: partId,
    slot: z.enum(COSMETIC_SLOTS),
    name: z.string().min(1).max(24),
    colour: z.enum(COSMETIC_COLOURS),
    unlock,
    /** Headgear only: the hair is not drawn under it. */
    hidesHair: z.boolean().optional(),
    /** Skin only: the preset colour (already the in-game colour). */
    hex: hex.optional(),
    /** An animated layer drawn on top of the survivor (see `animatedSchema`). */
    animated: animatedSchema.optional(),
  })
  .strict();

const colourSet = z.object({ top: hex, hair: hex, accent: hex }).strict();

const lookSchema = z
  .object({
    top: partId,
    head: partId,
    hair: partId,
    pack: partId,
    skin: partId,
    colours: colourSet,
  })
  .strict();

export const cosmeticsSchema = z
  .object({
    look: z
      .object({
        /** HSL factors that turn a chosen colour into its night colour (characters carry the night, D5). */
        nightMute: z.object({ lightness: z.number().gt(0).max(1), saturation: z.number().min(0).max(1) }).strict(),
        /** Extra lightness factor per decay stage 1..5; stage 1 is 1 (no extra dim). */
        stageDim: z.array(z.number().gt(0).max(1)).length(5),
        /** Story 7.10 (D1): the editor's 12 quick colours beside the phone's own picker. A look value, not gameplay. */
        swatches: z.array(hex).length(12).optional(),
      })
      .strict(),
    /** Today's survivor. Its colours are the client's `CHAR` night colours, so they are never muted again. */
    defaultLook: lookSchema,
    parts: z.array(partSchema).min(1),
  })
  .strict();

export type CosmeticPart = Readonly<z.output<typeof partSchema>>;
export type CosmeticColours = Readonly<z.output<typeof colourSet>>;
/** A survivor look: one part id per slot and the three picker colours (chosen, not yet muted). */
export type SurvivorLook = Readonly<z.output<typeof lookSchema>>;
export type Cosmetics = {
  readonly look: { readonly nightMute: { readonly lightness: number; readonly saturation: number }; readonly stageDim: readonly number[]; readonly swatches?: readonly string[] | undefined };
  readonly defaultLook: SurvivorLook;
  readonly parts: readonly CosmeticPart[];
};

/** Thrown when `cosmetics.json` is invalid; the message names the key. */
export class CosmeticsError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "CosmeticsError";
  }
}

function crossCheck(c: z.output<typeof cosmeticsSchema>, issues: string[]): void {
  const seen = new Set<string>();
  c.parts.forEach((p, i) => {
    const key = `${p.slot}:${p.id}`;
    if (seen.has(key)) issues.push(`cosmetics.json: parts.${i}: duplicate id ${key}`);
    seen.add(key);
    if ((p.slot === "head") !== (p.hidesHair !== undefined)) issues.push(`cosmetics.json: parts.${i}: hidesHair is for headgear only, and every headgear has it`);
    if ((p.slot === "skin") !== (p.hex !== undefined)) issues.push(`cosmetics.json: parts.${i}: hex is for skin only, and every skin has it`);
  });
  for (const layer of ANIMATED_LAYERS) {
    const n = c.parts.filter((p) => p.animated?.layer === layer).length;
    if (n > 1) issues.push(`cosmetics.json: layer ${layer}: declared by ${n} parts (one part per layer)`);
  }
  if (c.look.stageDim[0] !== 1) issues.push("cosmetics.json: look.stageDim.0: stage 1 must be 1 (no extra dim)");
  for (const slot of COSMETIC_SLOTS) {
    const p = c.parts.find((x) => x.slot === slot && x.id === c.defaultLook[slot]);
    if (!p) issues.push(`cosmetics.json: defaultLook.${slot}: unknown part ${c.defaultLook[slot]}`);
    else if (p.unlock !== "starter") issues.push(`cosmetics.json: defaultLook.${slot}: ${p.id} is not a starter part`);
  }
}

/** Validates and freezes a catalogue (the bundled one by default). */
export function loadCosmetics(input: unknown = raw): Cosmetics {
  const parsed = cosmeticsSchema.safeParse(input);
  if (!parsed.success) throw new CosmeticsError(parsed.error.issues.map((i) => `cosmetics.json: ${i.path.join(".")}: ${i.message}`));
  const issues: string[] = [];
  crossCheck(parsed.data, issues);
  if (issues.length) throw new CosmeticsError(issues);
  return deepFreeze(parsed.data);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export const COSMETICS: Cosmetics = loadCosmetics();

/** Story 7.9: the longest look code `encodeLook` may write (the longest legal look is 94 characters). */
export const LOOK_CODE_MAX = 96;

/** The default survivor (jacket, the picked cap, short hair under it, backpack, skin 1). */
export const DEFAULT_LOOK: SurvivorLook = COSMETICS.defaultLook;

/** Starter part ids per slot, in catalogue order. Story 7.9 checks looks against these until 7.11 adds owned items. */
export const STARTER_PARTS: Readonly<Record<CosmeticSlot, readonly string[]>> = starterParts(COSMETICS);

export function starterParts(c: Cosmetics): Readonly<Record<CosmeticSlot, readonly string[]>> {
  const out = {} as Record<CosmeticSlot, string[]>;
  for (const slot of COSMETIC_SLOTS) out[slot] = c.parts.filter((p) => p.slot === slot && p.unlock === "starter").map((p) => p.id);
  return deepFreeze(out);
}

/** The spin speed (turns per second) of an animated layer, from the part that declares it; 0 when none does. */
export function layerSpinRevPerS(layer: AnimatedLayerId, c: Cosmetics = COSMETICS): number {
  return c.parts.find((p) => p.animated?.layer === layer)?.animated?.spinRevPerS ?? 0;
}

/** The catalogue entry for a slot's part id, or undefined. */
export function cosmeticPart(slot: CosmeticSlot, id: string, c: Cosmetics = COSMETICS): CosmeticPart | undefined {
  return c.parts.find((p) => p.slot === slot && p.id === id);
}
