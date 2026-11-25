/**
 * Story 7.1: the meta-progression data (`progression.json`), zod-validated, beside `cosmetics.json` (ADR-03).
 * Today only `starterPool`: the 13 FR79 items every player always has (decision 7.1 D4: a player's saved row holds
 * only what they BOUGHT; the starter pool is data here, so a new save is "starter pool only" by definition).
 * Later stories add `supplies` (7.2), `unlocks` (7.3), `training` (7.5), `districts` (7.7).
 * Not part of `balanceVersion` until a story puts a gameplay number in it (7.5 does).
 */
import { z } from "zod";
import raw from "./progression.json" with { type: "json" };

const itemId = z.string().regex(/^[a-z0-9_]{1,32}$/, "item ids are lowercase snake_case");

export const progressionSchema = z
  .object({
    starterPool: z
      .array(itemId)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, "starterPool has a duplicate id"),
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
  return Object.freeze(p);
}

export const PROGRESSION: Readonly<Progression> = loadProgression();

/** The items every player can always draw (FR79), in file order. */
export const starterPool: readonly string[] = PROGRESSION.starterPool;
