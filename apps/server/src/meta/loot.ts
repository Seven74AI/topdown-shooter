import { lootPartKeys } from "@topdown/shared";

/**
 * Story 7.12 (AC 8, B6): the server's item for a loot find — from the finder's UNOWNED loot parts in
 * catalogue order, `unowned[floor(itemRoll × unowned.length)]` (`itemRoll` from the run's loot plan,
 * the salted `loot` stream). Owning all ten → "Collector" (null: no item). Pure; the bank (7.2's
 * transaction) re-picks with the owned set it reads inside the transaction (Beat the rule 6).
 */
export function pickLootItem(owned: ReadonlySet<string>, itemRoll: number, loot: readonly string[] = lootPartKeys()): string | null {
  const unowned = loot.filter((k) => !owned.has(k));
  if (unowned.length === 0) return null;
  const i = Math.min(unowned.length - 1, Math.max(0, Math.floor(itemRoll * unowned.length)));
  return unowned[i] ?? null;
}
