/**
 * Story 7.9: the look code — how a survivor look travels (join option, room state, the `progress.look` column).
 *
 *   v1|top:<id>|head:<id>|hair:<id>|pack:<id>|skin:<id>|c:<top>,<hair>,<accent>
 *
 * Colours are lowercase `rrggbb` without `#`. Five slots, no `acc` (7.8). Encoding is in fixed slot order; decoding is
 * tolerant and NEVER fails: each slot and each colour is read on its own, and a missing, unknown or not-owned part (or a
 * bad colour) becomes that field's default (`DEFAULT_LOOK`). Pure, engine-free (ADR-03); runs at join / bake time only.
 */
import { COSMETIC_SLOTS, COSMETICS, DEFAULT_LOOK, LOOK_CODE_MAX, STARTER_PARTS, cosmeticPart, type Cosmetics, type CosmeticSlot, type SurvivorLook } from "../config/cosmetics";

export const LOOK_CODE_VERSION = "v1";

const COLOUR_KEYS = ["top", "hair", "accent"] as const;
/** Fields a decode can replace: the five slots and the three colours. */
const FIELD_COUNT = COSMETIC_SLOTS.length + COLOUR_KEYS.length;
const COLOUR_RE = /^[0-9a-f]{6}$/;

/** The owned-set key of a part (ids are unique per slot only: `head:none` and `pack:none` both exist). */
export function partKey(slot: CosmeticSlot, id: string): string {
  return `${slot}:${id}`;
}

/**
 * The parts an account may wear: every starter part, plus the given `slot:id` keys (Story 7.11 passes the account's
 * `cosmetics` column here; nothing else changes). Unknown keys are kept as given; decode checks the catalogue too.
 */
export function ownedParts(cosmetics?: readonly string[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const slot of COSMETIC_SLOTS) for (const id of STARTER_PARTS[slot]) out.add(partKey(slot, id));
  if (cosmetics) for (const k of cosmetics) if (typeof k === "string") out.add(k);
  return out;
}

/**
 * Every catalogue part. The CLIENT decodes `state.look` with this: the server already checked ownership (L2), so the
 * client only needs "does this part exist in my catalogue" (an older tab falls back per slot).
 */
export function catalogueParts(c: Cosmetics = COSMETICS): ReadonlySet<string> {
  return new Set(c.parts.map((p) => partKey(p.slot, p.id)));
}

/** The look code of a look. Throws only for a look that is not a catalogue look (ids are ≤ 8 characters by schema). */
export function encodeLook(look: SurvivorLook): string {
  let s = LOOK_CODE_VERSION;
  for (const slot of COSMETIC_SLOTS) s += `|${slot}:${look[slot]}`;
  s += `|c:${look.colours.top.slice(1)},${look.colours.hair.slice(1)},${look.colours.accent.slice(1)}`;
  if (s.length > LOOK_CODE_MAX) throw new RangeError(`look code is ${s.length} characters (max ${LOOK_CODE_MAX})`);
  return s;
}

export type DecodedLook = {
  readonly look: SurvivorLook;
  /** How many of the 8 fields (5 slots + 3 colours) were replaced by their default (for one log line; 0 = none). */
  readonly replaced: number;
};

const DEFAULT_DECODED: DecodedLook = Object.freeze({ look: DEFAULT_LOOK, replaced: 0 });

/**
 * Reads any input into a full look. `undefined` / `null` / `""` mean "no look sent": the default look with 0 replaced
 * (bots and old tabs). A non-string, an over-long string (> 4 × LOOK_CODE_MAX, no regex on kilobytes of junk) or another
 * version decode to the default look with every field replaced. `owned` defaults to the starter parts.
 */
export function decodeLook(input: unknown, owned: ReadonlySet<string> = ownedParts(), c: Cosmetics = COSMETICS): DecodedLook {
  if (input === undefined || input === null || input === "") return c === COSMETICS ? DEFAULT_DECODED : { look: c.defaultLook, replaced: 0 };
  if (typeof input !== "string" || input.length > LOOK_CODE_MAX * 4) return { look: c.defaultLook, replaced: FIELD_COUNT };
  const fields = input.split("|");
  if (fields[0] !== LOOK_CODE_VERSION) return { look: c.defaultLook, replaced: FIELD_COUNT };

  const raw: Partial<Record<CosmeticSlot | "c", string>> = {};
  for (let i = 1; i < fields.length; i++) {
    const f = fields[i]!;
    const colon = f.indexOf(":");
    if (colon <= 0) continue;
    const key = f.slice(0, colon);
    if (key !== "c" && !(COSMETIC_SLOTS as readonly string[]).includes(key)) continue;
    const k = key as CosmeticSlot | "c";
    if (raw[k] === undefined) raw[k] = f.slice(colon + 1); // the first of a duplicate wins
  }

  let replaced = 0;
  const parts = {} as Record<CosmeticSlot, string>;
  for (const slot of COSMETIC_SLOTS) {
    const id = raw[slot];
    if (id !== undefined && cosmeticPart(slot, id, c) && owned.has(partKey(slot, id))) parts[slot] = id;
    else {
      parts[slot] = c.defaultLook[slot];
      replaced++;
    }
  }
  const given = raw.c === undefined ? [] : raw.c.split(",");
  const colours = {} as Record<(typeof COLOUR_KEYS)[number], string>;
  COLOUR_KEYS.forEach((key, i) => {
    const v = given.length === COLOUR_KEYS.length ? given[i]! : "";
    if (COLOUR_RE.test(v)) colours[key] = `#${v}`;
    else {
      colours[key] = c.defaultLook.colours[key];
      replaced++;
    }
  });
  return { look: Object.freeze({ ...parts, colours: Object.freeze(colours) }), replaced };
}
