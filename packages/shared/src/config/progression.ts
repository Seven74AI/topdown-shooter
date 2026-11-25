/**
 * Story 7.1: the meta-progression data (`progression.json`), zod-validated, beside `cosmetics.json` (ADR-03).
 * Today only `starterPool`: the 13 FR79 items every player always has (decision 7.1 D4: a player's saved row holds
 * only what they BOUGHT; the starter pool is data here, so a new save is "starter pool only" by definition).
 * Story 7.2 adds `supplies` (what a run pays); 7.3 `unlocks` (what Supplies buy) and `starterLines` (the hub's line
 * per starter item); later stories add `training` (7.5), `districts` (7.7).
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

/** Story 7.3 (AC 1): the four shop categories an unlock (and a starter item) belongs to, in hub order. */
export const UNLOCK_CATEGORIES = ["weapon", "building", "gear", "consumable"] as const;
export type UnlockCategory = (typeof UNLOCK_CATEGORIES)[number];

/** Story 7.3: the most unlocks `unlockMask` can carry (one bit each in a 32-bit integer, for 7.4). */
export const MAX_UNLOCKS = 32;

/** The one plain line under an item in the hub (player text, never a gameplay number source). */
const line = z.string().min(1).max(60);

/**
 * Story 7.3 (AC 1): one unlock: bought once with Supplies (`price`, checked on the server inside the transaction),
 * it adds `items` to the player's pool (7.4). Prices are Supplies, never run money (`weapons.json › price`).
 */
const unlockSchema = z
  .object({
    id: itemId,
    category: z.enum(UNLOCK_CATEGORIES),
    price: z.number().int().positive(),
    items: z.array(itemId).min(1),
    line,
  })
  .strict();
export type Unlock = z.output<typeof unlockSchema>;

export const progressionSchema = z
  .object({
    starterPool: z
      .array(itemId)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, "starterPool has a duplicate id"),
    supplies: suppliesSchema,
    unlocks: z
      .array(unlockSchema)
      .min(1)
      .max(MAX_UNLOCKS)
      .refine((u) => new Set(u.map((x) => x.id)).size === u.length, "unlocks has a duplicate id"),
    /** Story 7.3: the hub's one plain line for each starter item (same order as `starterPool` not required). */
    starterLines: z.record(itemId, line),
    districts: z
      .array(districtSchema)
      .min(1)
      .max(8) // the lobby's u8 bitmask
      .refine((ds) => new Set(ds.map((x) => x.id)).size === ds.length, "districts has a duplicate id")
      .refine((ds) => ds[0]?.unlock === null && ds[0]?.playable === true, "the first district is open and playable (the default pick)")
      .refine((ds) => ds.every((x) => x.unlock === null || ds.some((y) => y.id === x.unlock?.extractFrom)), "an unlock names an unknown district"),
  })
  .strict()
  .superRefine((p, ctx) => {
    // Every item has ONE place: the starter pool or exactly one unlock (AC 1).
    const seen = new Map<string, string>();
    const place = (item: string, where: string) => {
      const before = seen.get(item);
      if (before !== undefined) ctx.addIssue({ code: "custom", message: `${item} is in both ${before} and ${where}` });
      seen.set(item, where);
    };
    for (const id of p.starterPool) place(id, "starterPool");
    for (const u of p.unlocks) for (const id of u.items) place(id, `unlock ${u.id}`);
    for (const id of p.starterPool) {
      if (p.starterLines[id] === undefined) ctx.addIssue({ code: "custom", message: `starterLines has no line for ${id}` });
    }
    for (const id of Object.keys(p.starterLines)) {
      if (!p.starterPool.includes(id)) ctx.addIssue({ code: "custom", message: `starterLines.${id} is not a starter item` });
    }
  });

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
  for (const u of p.unlocks) {
    Object.freeze(u.items);
    Object.freeze(u);
  }
  Object.freeze(p.unlocks);
  Object.freeze(p.starterLines);
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

/** Story 7.3: the unlock list in file order (the bit order of `unlockMask`). */
export const unlockList: readonly Unlock[] = PROGRESSION.unlocks;

/** Story 7.3: the unlock with this id, or undefined (an unknown id from a client). */
export function findUnlock(id: string, p: Readonly<Progression> = PROGRESSION): Unlock | undefined {
  return p.unlocks.find((u) => u.id === id);
}
