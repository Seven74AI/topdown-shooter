/**
 * Stories 7.10 + 7.11: the ten milestones (`milestones.json`): the editor's lock line (`howTo`), the
 * Results reason (`resultLine`, "New item: Riot helmet (first extraction)") and the rule the server
 * checks at the bank (`rule`). Unlock data, not gameplay balance: not in `Balance`, no version bump.
 * Cross-checked against `cosmetics.json`: each `mN` unlocks exactly one part.
 */
import { z } from "zod";
import raw from "./milestones.json" with { type: "json" };
import { COSMETICS, type Cosmetics } from "./cosmetics";

export const MILESTONE_IDS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10"] as const;
export type MilestoneId = (typeof MILESTONE_IDS)[number];

const ruleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wave_cleared"), n: z.number().int().min(1).max(255) }).strict(),
  z.object({ kind: z.literal("extracted"), district: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("boss_killed") }).strict(),
  z.object({ kind: z.literal("lifetime_revives"), n: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal("lifetime_kills"), n: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal("lifetime_barricades"), n: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal("lifetime_runs"), n: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal("extracted_all_four") }).strict(),
  z.object({ kind: z.literal("wave10_never_downed") }).strict(),
]);

const milestoneSchema = z
  .object({
    id: z.enum(MILESTONE_IDS),
    howTo: z.string().min(1).max(48),
    resultLine: z.string().min(1).max(40),
    rule: ruleSchema,
  })
  .strict();

export const milestonesSchema = z.object({ milestones: z.array(milestoneSchema).length(MILESTONE_IDS.length) }).strict();

export type Milestone = Readonly<z.output<typeof milestoneSchema>>;
export type MilestoneRule = Readonly<z.output<typeof ruleSchema>>;

export class MilestonesError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "MilestonesError";
  }
}

/** Validates `milestones.json` (each id once, in m1…m10 order) and its cross-check with the catalogue. */
export function loadMilestones(input: unknown = raw, cosmetics: Cosmetics = COSMETICS): readonly Milestone[] {
  const parsed = milestonesSchema.safeParse(input);
  if (!parsed.success) throw new MilestonesError(parsed.error.issues.map((i) => `milestones.json: ${i.path.join(".")}: ${i.message}`));
  const issues: string[] = [];
  parsed.data.milestones.forEach((m, i) => {
    if (m.id !== MILESTONE_IDS[i]) issues.push(`milestones.json: milestones.${i}: expected ${MILESTONE_IDS[i]}, got ${m.id}`);
    const parts = cosmetics.parts.filter((p) => p.unlock === `milestone:${m.id}`);
    if (parts.length !== 1) issues.push(`milestones.json: ${m.id} unlocks ${parts.length} parts in cosmetics.json (exactly 1 expected)`);
  });
  if (issues.length) throw new MilestonesError(issues);
  return Object.freeze(parsed.data.milestones.map((m) => Object.freeze({ ...m, rule: Object.freeze({ ...m.rule }) })));
}

export const MILESTONES: readonly Milestone[] = loadMilestones();

/** The part key (`slot:id`) a milestone unlocks. */
export function milestonePartKey(id: MilestoneId, cosmetics: Cosmetics = COSMETICS): string {
  const p = cosmetics.parts.find((x) => x.unlock === `milestone:${id}`);
  if (!p) throw new Error(`milestonePartKey: no part for ${id}`);
  return `${p.slot}:${p.id}`;
}

/** Story 7.12: the loot parts' keys (`slot:id`) in catalogue order — the order the item pick reads. */
export function lootPartKeys(cosmetics: Cosmetics = COSMETICS): readonly string[] {
  return cosmetics.parts.filter((p) => p.unlock === "loot").map((p) => `${p.slot}:${p.id}`);
}
