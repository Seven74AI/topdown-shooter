import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@topdown/shared";

const CODE_LETTERS = new Set(ROOM_CODE_ALPHABET);

/** What the code field keeps of typed text (Story 2.3): uppercase alphabet letters only, at most 4. */
export function filterCodeInput(raw: string): string {
  let out = "";
  for (const c of raw.toUpperCase()) {
    if (out.length === ROOM_CODE_LENGTH) break;
    if (CODE_LETTERS.has(c)) out += c;
  }
  return out;
}
