import { PROGRESSION, type Progression } from "../config/progression";

/**
 * Story 7.7 (R1–R5, D12): the district rules, pure (server and lobby UI alike).
 *
 * - `openMask(unlocked lists)`: the lobby's `districtsOpen` — bit i set when ANY member has district i (R2); the
 *   first district (Downtown, open from the start) is always set.
 * - `canPick(id, mask, isHost)`: only the host (R4), only a district someone here has (R2), only a playable one (R5).
 * - `districtsUnlockedBy(extractedFrom)`: R1 — the districts an extraction from that district unlocks.
 */
type Districts = Progression["districts"];

export const districtList = (p: Readonly<Progression> = PROGRESSION): Districts => p.districts;
export const DEFAULT_DISTRICT = PROGRESSION.districts[0]?.id ?? "downtown";

export function districtIndex(id: string, p: Readonly<Progression> = PROGRESSION): number {
  return p.districts.findIndex((d) => d.id === id);
}

/** R2: the union of the members' unlocked districts as a bitmask (the open-from-start ones always in). */
export function openMask(memberDistricts: Iterable<readonly string[]>, p: Readonly<Progression> = PROGRESSION): number {
  let mask = 0;
  p.districts.forEach((d, i) => {
    if (d.unlock === null) mask |= 1 << i;
  });
  for (const list of memberDistricts) {
    for (const id of list) {
      const i = districtIndex(id, p);
      if (i >= 0) mask |= 1 << i;
    }
  }
  return mask;
}

export type PickRefusal = "not_host" | "unknown" | "locked" | "coming_soon";

/** R2, R4, R5: why a pick is refused, or null when it's allowed. */
export function pickRefusal(id: string, mask: number, isHost: boolean, p: Readonly<Progression> = PROGRESSION): PickRefusal | null {
  if (!isHost) return "not_host";
  const i = districtIndex(id, p);
  if (i < 0) return "unknown";
  if ((mask & (1 << i)) === 0) return "locked";
  if (!(p.districts[i] as Districts[number]).playable) return "coming_soon";
  return null;
}

/** R1: the districts an extraction from `extractedFrom` unlocks (list order). */
export function districtsUnlockedBy(extractedFrom: string, p: Readonly<Progression> = PROGRESSION): string[] {
  return p.districts.filter((d) => d.unlock?.extractFrom === extractedFrom).map((d) => d.id);
}

export function districtName(id: string, p: Readonly<Progression> = PROGRESSION): string {
  return p.districts.find((d) => d.id === id)?.name ?? id;
}
