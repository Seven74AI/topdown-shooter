import { districtList, pickRefusal } from "@topdown/shared";

/**
 * Story 7.7 (R2, R4, R5; DP2): the district cards of the lobby's sheet, pure. One card per district in list order:
 * the current pick is "Selected"; a district someone here has and that is playable can be picked by the host; one
 * someone has but that isn't playable says "Unlocked · coming soon"; one nobody has is locked with how to get it.
 */
export const DISTRICT_LOCKED_TEXT = "Extract from Downtown to unlock";
export const DISTRICT_SOON_TEXT = "Unlocked · coming soon";
export const DISTRICT_SELECTED_TEXT = "Selected";
export const DISTRICT_OPEN_TEXT = "Tap to pick";

export interface DistrictCard {
  readonly id: string;
  readonly name: string;
  readonly state: "selected" | "open" | "soon" | "locked";
  readonly line: string;
  /** The host can tap it (sends `lobby.district`). */
  readonly pickable: boolean;
}

export function districtCards(picked: string, mask: number, isHost: boolean): DistrictCard[] {
  return districtList().map((d, i) => {
    const has = (mask & (1 << i)) !== 0;
    const state: DistrictCard["state"] = d.id === picked ? "selected" : !has ? "locked" : d.playable ? "open" : "soon";
    const line = state === "selected" ? DISTRICT_SELECTED_TEXT : state === "locked" ? lockedText(d.unlock?.extractFrom) : state === "soon" ? DISTRICT_SOON_TEXT : isHost ? DISTRICT_OPEN_TEXT : "";
    return { id: d.id, name: d.name, state, line, pickable: state === "open" && pickRefusal(d.id, mask, isHost) === null };
  });
}

function lockedText(from: string | undefined): string {
  if (!from) return DISTRICT_LOCKED_TEXT;
  const name = districtList().find((x) => x.id === from)?.name ?? from;
  return `Extract from ${name} to unlock`;
}

/** R3's notice line. */
export const districtResetText = (name: string): string => `Back to Downtown: nobody here has ${name}`;
