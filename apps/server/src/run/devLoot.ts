import { parseDevLoot } from "@topdown/shared";

/**
 * Story 7.12 dev switch `DEV_LOOT=3:0.1` (server, dev only; production ignores it): this run has a
 * loot bag in wave 3 at kill share 0.1 (the client's `?loot=` in practice). Pure (env passed in).
 */
export function pickDevLoot(env: { readonly NODE_ENV?: string | undefined; readonly DEV_LOOT?: string | undefined }): {
  readonly plan: readonly [number, number] | null;
  readonly ignored: null | "production" | "invalid";
} {
  const raw = env.DEV_LOOT;
  if (raw === undefined || raw.trim() === "") return { plan: null, ignored: null };
  if (env.NODE_ENV === "production") return { plan: null, ignored: "production" };
  const plan = parseDevLoot(raw);
  return plan === null ? { plan: null, ignored: "invalid" } : { plan, ignored: null };
}
