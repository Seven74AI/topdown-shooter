/** A URL loadout after `validLoadout`: the weapons and (Story 5.1) each slot's upgrade level. */
export interface UrlLoadout {
  weapons: readonly [string, string | null];
  levels: readonly [number, number];
}

/**
 * Keeps the URL loadout's ids that exist in balance; null if neither does. Story 5.1: an entry may
 * be `id:level` (`smg:3`); a level that isn't a whole number from 1 to `maxLevel` is 1.
 */
export function validLoadout(entries: readonly [string, string | null], known: readonly string[], maxLevel: number): UrlLoadout | null {
  const parse = (e: string | null): [string, number] | null => {
    if (e === null) return null;
    const [id, raw] = e.split(":") as [string, string | undefined];
    if (!known.includes(id)) return null;
    const n = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : 1;
    return [id, n >= 1 && n <= maxLevel ? n : 1];
  };
  const a = parse(entries[0]);
  const b = parse(entries[1]);
  if (!a) return b ? { weapons: [b[0], null], levels: [b[1], 1] } : null;
  const second = b && b[0] !== a[0] ? b : null;
  return { weapons: [a[0], second ? second[0] : null], levels: [a[1], second ? second[1] : 1] };
}
