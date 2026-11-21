/** Keeps the URL loadout's ids that exist in balance; null if the first one doesn't. */
export function validLoadout(ids: readonly [string, string | null], known: readonly string[]): readonly [string, string | null] | null {
  if (!known.includes(ids[0])) return ids[1] && known.includes(ids[1]) ? [ids[1], null] : null;
  return [ids[0], ids[1] && known.includes(ids[1]) ? ids[1] : null];
}
