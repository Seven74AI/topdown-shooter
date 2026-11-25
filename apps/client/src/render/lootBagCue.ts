import type { SimEvent } from "@topdown/shared";

/**
 * Story 7.12 (AC 7, BF2, brief 14): what a loot event shows and plays. `loot.found` → the HUD line
 * "Bag found!" for the finder, "<name> found a bag!" for teammates (the line shows the bag icon and
 * the finder's slot colour, BF2) and the `loot_found` sound; `loot.dropped` → the soft `loot_drop`.
 * A woken tab's backlog (`ageS`, NetSimHost) shows and plays neither once stale (the bag itself
 * follows the room record): no line older than `cue.toastS`, no sound older than 1 s.
 */
export const LOOT_FOUND_MINE = "Bag found!";
export const LOOT_SOUND_MAX_AGE_S = 1;

export function lootFoundText(finderName: string, mine: boolean): string {
  const name = finderName.trim();
  return mine || name === "" ? LOOT_FOUND_MINE : `${name} found a bag!`;
}

export interface LootCue {
  /** The HUD line ("" = none). */
  text: string;
  /** The finder's player slot (−1: none) — the line's colour. */
  slot: number;
  sound: "" | "loot_found" | "loot_drop";
}

export const createLootCue = (): LootCue => ({ text: "", slot: -1, sound: "" });

/** Fills `out` for event `e` (any type: other events leave it empty). `nameOf` = the finder's display name. */
export function lootCue(e: SimEvent, localId: string, nameOf: (playerId: string) => string, slotOf: (playerId: string) => number, toastS: number, out: LootCue): LootCue {
  out.text = "";
  out.slot = -1;
  out.sound = "";
  if (e.type === "loot.found") {
    const age = e.ageS ?? 0;
    if (age <= toastS) {
      out.text = lootFoundText(nameOf(e.playerId), e.playerId === localId);
      out.slot = slotOf(e.playerId);
    }
    if (age <= LOOT_SOUND_MAX_AGE_S) out.sound = "loot_found";
  } else if (e.type === "loot.dropped") {
    if ((e.ageS ?? 0) <= LOOT_SOUND_MAX_AGE_S) out.sound = "loot_drop";
  }
  return out;
}
