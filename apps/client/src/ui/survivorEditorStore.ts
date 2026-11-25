/**
 * Story 7.10 (AC 2–7, 10; E2, E3, E5; layout ED1 + LK2 + LS1): the survivor editor's state, pure (tested).
 * `SurvivorEditor.tsx` draws it. Owned parts come from the server's progress (7.9's `ownedParts`; the client never
 * unlocks anything); a locked part can be tapped (it shows how to get it) but never worn, saved or bought.
 */
import {
  COSMETICS,
  COSMETIC_SLOTS,
  MILESTONES,
  catalogueParts,
  cosmeticPart,
  decodeLook,
  encodeLook,
  ownedParts,
  partKey,
  type CosmeticPart,
  type CosmeticSlot,
  type SurvivorLook,
} from "@topdown/shared";

export const EDITOR_TEXT = {
  title: "Survivor",
  back: "Back",
  chosen: "Chosen",
  inGame: "In game",
  random: "Random",
  done: "Done",
  saving: "Saving…",
  /** D1: the accent picker, in the Head and Pack tabs. */
  accent: "Hat & bag colour",
  top: "Top colour",
  hair: "Hair colour",
  pickColour: "Pick any colour",
  /** LS1: a loot part's line (its name stays hidden). */
  loot: "Found during waves",
  /** AC 9 (D4): the server didn't store it. */
  offline: "Saved on this phone. It will sync next time.",
  /** AC 11. */
  rateLimited: "Too many saves, try again in a minute",
  /** Review L4: the server refused this look for good (never kept for a retry). */
  refused: "Couldn't save this look",
  edit: "Edit my survivor",
} as const;

/** AC 2: the tabs, in the 7.8 order (no Accent tab: its colour sits in Head and Pack). */
export const EDITOR_TABS: readonly { readonly slot: CosmeticSlot; readonly label: string }[] = Object.freeze([
  { slot: "top", label: "Top" },
  { slot: "head", label: "Head" },
  { slot: "hair", label: "Hair" },
  { slot: "pack", label: "Pack" },
  { slot: "skin", label: "Skin" },
]);

export type ColourKey = "top" | "hair" | "accent";

/** D1: the colour pickers under the tiles of each tab ("Hat & bag colour" in Head and Pack, D1; none in Skin). */
export const TAB_PICKERS: Readonly<Record<CosmeticSlot, readonly ColourKey[]>> = Object.freeze({ top: ["top"], head: ["accent"], hair: ["hair"], pack: ["accent"], skin: [] });

export const PICKER_LABEL: Readonly<Record<ColourKey, string>> = Object.freeze({ top: EDITOR_TEXT.top, hair: EDITOR_TEXT.hair, accent: EDITOR_TEXT.accent });

/** D1: the 12 quick colours (`cosmetics.json › look.swatches`), or none in an older catalogue. */
export const SWATCHES: readonly string[] = COSMETICS.look.swatches ?? [];

export type TileState = "owned" | "milestone" | "loot";

export interface PartTile {
  readonly slot: CosmeticSlot;
  readonly id: string;
  /** The part's name (shown for owned and milestone parts; a loot part's name stays hidden: LS1). */
  readonly name: string;
  readonly state: TileState;
  /** Locked parts only: the line shown on tap (milestone `howTo`, or "Found during waves"). Never a price (D3). */
  readonly line: string | null;
}

const HOW_TO: ReadonlyMap<string, string> = new Map(MILESTONES.map((m) => [`milestone:${m.id}`, m.howTo]));

function tileOf(p: CosmeticPart, owned: ReadonlySet<string>): PartTile {
  if (owned.has(partKey(p.slot, p.id))) return { slot: p.slot, id: p.id, name: p.name, state: "owned", line: null };
  if (p.unlock === "loot") return { slot: p.slot, id: p.id, name: p.name, state: "loot", line: EDITOR_TEXT.loot };
  return { slot: p.slot, id: p.id, name: p.name, state: "milestone", line: HOW_TO.get(p.unlock) ?? null };
}

/** The tiles of one tab, in catalogue order: owned parts drawn, milestone parts locked (LK2), loot parts as silhouettes (LS1). */
export function tilesFor(slot: CosmeticSlot, owned: ReadonlySet<string>): readonly PartTile[] {
  return COSMETICS.parts.filter((p) => p.slot === slot).map((p) => tileOf(p, owned));
}

/** The line in the info row for a tapped tile: "Gas mask: Kill the Behemoth", "Found during waves", or the part's name. */
export function tileLine(t: PartTile): string {
  if (t.state === "milestone") return t.line === null ? t.name : `${t.name}: ${t.line}`;
  if (t.state === "loot") return EDITOR_TEXT.loot;
  return t.name;
}

export interface EditorState {
  readonly tab: CosmeticSlot;
  /** What the previews show and Done saves. */
  readonly draft: SurvivorLook;
  /** The look the editor opened with (Back keeps it, D7). */
  readonly opened: SurvivorLook;
  readonly owned: ReadonlySet<string>;
  /** The tile tapped last (its line shows in the info row), or null (the info row names the worn part). */
  readonly tapped: { readonly slot: CosmeticSlot; readonly id: string } | null;
}

/** The owned set from my progress: starter parts plus the server's `cosmetics` (Story 7.11), never a local guess (AC 6). */
export function ownedFrom(progress: { cosmetics?: readonly string[] | null } | null | undefined): ReadonlySet<string> {
  const c = progress?.cosmetics;
  return ownedParts(Array.isArray(c) ? c : undefined);
}

/** Opens the editor on my current look (a code; undefined = the default look), worn parts limited to what I own. */
export function openEditor(code: string | undefined, owned: ReadonlySet<string>, tab: CosmeticSlot = "top"): EditorState {
  const look = decodeLook(code, owned).look;
  return { tab, draft: look, opened: look, owned, tapped: null };
}

export function setTab(s: EditorState, tab: CosmeticSlot): EditorState {
  return s.tab === tab ? s : { ...s, tab, tapped: null };
}

/** A tap on a tile: an owned part is worn (both previews update); a locked one only shows its line (AC 5). */
export function pick(s: EditorState, slot: CosmeticSlot, id: string): EditorState {
  if (!cosmeticPart(slot, id)) return s;
  const tapped = { slot, id };
  if (!s.owned.has(partKey(slot, id))) return { ...s, tapped };
  return { ...s, draft: { ...s.draft, [slot]: id }, tapped };
}

const HEX = /^#[0-9a-f]{6}$/;

/** Any colour, no warning (AC 4, E5): a `#rrggbb` (any case) replaces the picker's colour; anything else is ignored. */
export function setColour(s: EditorState, key: ColourKey, hex: string): EditorState {
  const v = hex.toLowerCase();
  if (!HEX.test(v) || s.draft.colours[key] === v) return s;
  return { ...s, draft: { ...s.draft, colours: { ...s.draft.colours, [key]: v } } };
}

/** The owned part ids of a slot, in catalogue order ("none" included where the slot has it). */
export function ownedIds(slot: CosmeticSlot, owned: ReadonlySet<string>): readonly string[] {
  return COSMETICS.parts.filter((p) => p.slot === slot && owned.has(partKey(p.slot, p.id))).map((p) => p.id);
}

const hexOf = (n: number): string => `#${Math.floor(n).toString(16).padStart(6, "0")}`;

/**
 * AC 7, D5, E3: one OWNED part per slot (each equally likely, skin included) and three uniform RGB colours. `rng`
 * returns [0, 1). A slot with no owned part (never: every slot has starter parts) keeps its part.
 */
export function random(s: EditorState, rng: () => number = Math.random): EditorState {
  const parts = {} as Record<CosmeticSlot, string>;
  for (const slot of COSMETIC_SLOTS) {
    const ids = ownedIds(slot, s.owned);
    parts[slot] = ids.length === 0 ? s.draft[slot] : (ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))] as string);
  }
  const colours = { top: hexOf(rng() * 0x1000000), hair: hexOf(rng() * 0x1000000), accent: hexOf(rng() * 0x1000000) };
  return { ...s, draft: { ...parts, colours }, tapped: null };
}

/** Done: the look code to save (7.9's `encodeLook`). */
export const draftCode = (s: EditorState): string => encodeLook(s.draft);

/** True when the draft differs from the look the editor opened with. */
export const changed = (s: EditorState): boolean => encodeLook(s.draft) !== encodeLook(s.opened);

/** The info row: the tapped tile's line, else the name of the part worn in this tab. */
export function infoLine(s: EditorState): string {
  if (s.tapped !== null) {
    const p = cosmeticPart(s.tapped.slot, s.tapped.id);
    if (p) return tileLine(tileOf(p, s.owned));
  }
  return cosmeticPart(s.tab, s.draft[s.tab])?.name ?? "";
}

/** True when the info row shows a locked part's line (drawn with the lock, LK2). */
export function infoLocked(s: EditorState): boolean {
  return s.tapped !== null && !s.owned.has(partKey(s.tapped.slot, s.tapped.id));
}

/** The colour shown in the Chosen / In game swatches for a tab: its picker's colour, or the skin preset. */
export function tabColour(s: EditorState): { key: ColourKey | "skin"; hex: string } {
  const k = TAB_PICKERS[s.tab][0];
  if (k) return { key: k, hex: s.draft.colours[k] };
  return { key: "skin", hex: cosmeticPart("skin", s.draft.skin)?.hex ?? "#000000" };
}

/** Every catalogue part (the editor decodes server answers with it: the server already checked ownership). */
export const ANY_PART = catalogueParts();
