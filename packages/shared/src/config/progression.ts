/**
 * Story 7.1: the meta-progression data (`progression.json`), zod-validated, beside `cosmetics.json` (ADR-03).
 * Today only `starterPool`: the 13 FR79 items every player always has (decision 7.1 D4: a player's saved row holds
 * only what they BOUGHT; the starter pool is data here, so a new save is "starter pool only" by definition).
 * Story 7.2 adds `supplies` (what a run pays); later stories add `unlocks` (7.3), `training` (7.5), `districts` (7.7).
 * Not part of `balanceVersion` until a story puts a gameplay number in it (7.5 does).
 */
import { z } from "zod";
import raw from "./progression.json" with { type: "json" };

const amount = z.number().int().nonnegative();

/** Story 7.2 (AC 2, D1): the Supplies a run pays (`meta/supplies.ts › runSupplies`). Integers only. */
const suppliesSchema = z
  .object({
    perWave: amount,
    behemoth: amount,
    extract: amount,
    perEndlessWave: amount,
    endlessBehemoth: amount,
    rookieLift: z.object({ belowLifetime: amount, multiplier: z.number().int().min(1) }).strict(),
  })
  .strict();

/**
 * Story 7.7 (AC 1, D1): the districts, in list order (the lobby bitmask's bit i = index i). `unlock: null` = open from the
 * start; `{ extractFrom }` = an extraction from that district unlocks it (R1). `playable: false` = "coming soon" (R5).
 */
const districtSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]{1,32}$/),
    name: z.string().min(1).max(24),
    unlock: z.object({ extractFrom: z.string().regex(/^[a-z0-9_]{1,32}$/) }).strict().nullable(),
    playable: z.boolean(),
  })
  .strict();

const itemId = z.string().regex(/^[a-z0-9_]{1,32}$/, "item ids are lowercase snake_case");

export const progressionSchema = z
  .object({
    starterPool: z
      .array(itemId)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, "starterPool has a duplicate id"),
    supplies: suppliesSchema,
    districts: z
      .array(districtSchema)
      .min(1)
      .max(8) // the lobby's u8 bitmask
      .refine((ds) => new Set(ds.map((x) => x.id)).size === ds.length, "districts has a duplicate id")
      .refine((ds) => ds[0]?.unlock === null && ds[0]?.playable === true, "the first district is open and playable (the default pick)")
      .refine((ds) => ds.every((x) => x.unlock === null || ds.some((y) => y.id === x.unlock?.extractFrom)), "an unlock names an unknown district"),
  })
  .strict();

export type Progression = z.output<typeof progressionSchema>;

export class ProgressionError extends Error {
  constructor(readonly issues: string[]) {
    super(`progression.json is invalid:\n  ${issues.join("\n  ")}`);
    this.name = "ProgressionError";
  }
}

/** Validates a progression file (the bundled one by default) into a frozen object. */
export function loadProgression(data: unknown = raw): Readonly<Progression> {
  const result = progressionSchema.safeParse(data);
  if (!result.success) {
    throw new ProgressionError(result.error.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`));
  }
  const p = result.data;
  Object.freeze(p.starterPool);
  Object.freeze(p.supplies.rookieLift);
  Object.freeze(p.supplies);
  for (const d of p.districts) {
    if (d.unlock) Object.freeze(d.unlock);
    Object.freeze(d);
  }
  Object.freeze(p.districts);
  return Object.freeze(p);
}

export const PROGRESSION: Readonly<Progression> = loadProgression();

/** The items every player can always draw (FR79), in file order. */
export const starterPool: readonly string[] = PROGRESSION.starterPool;
