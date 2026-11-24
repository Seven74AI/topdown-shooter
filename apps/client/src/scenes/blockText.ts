import { isRubble, type BlockReason, type CoverKind, type MapBox, type PlaceError, type World } from "@topdown/shared";
import { pickRefusalText } from "./buildBar";

/**
 * Story 5.17 (AC 3, D3): the reason line's words for a blocked ghost (ux-spec §7.2). Map boxes are
 * named by their Tiled object name (Downtown's collision layer; `decay` `block` mutations) and cover
 * by its kind; anything not in the table is "a wall" (a building's walls, an unknown map). Pure (no
 * Phaser), unit-tested.
 */
export const SOLID_NAMES: Readonly<Record<string, string>> = Object.freeze({
  city_bus: "the bus",
  bus_hull: "the bus",
  gas_pump_a: "a petrol pump",
  gas_pump_b: "a petrol pump",
  parking_wall: "a wall",
  dumpster_alley_3: "a dumpster",
});

export const COVER_WORDS: Readonly<Record<CoverKind, string>> = Object.freeze({
  car: "a car",
  bus: "the bus",
  barrier: "the police barrier",
  sandbags: "the sandbags",
});

const WALL = "a wall";
/** Story 6.2 (F3): every `rubble_*` box (the collapsed alley, the street piles): one prefix rule. */
export const RUBBLE_WORD = "rubble";

/** What blocks: "the bus", "a car", "the sandbags", "a wall"… for an entry of `world.obstacles.solids`. */
export function solidWord(box: Readonly<MapBox> | undefined): string {
  if (!box) return WALL;
  const kind = (box as { kind?: string }).kind;
  if (kind !== undefined && Object.prototype.hasOwnProperty.call(COVER_WORDS, kind)) return COVER_WORDS[kind as CoverKind];
  if (isRubble(box)) return RUBBLE_WORD;
  return Object.prototype.hasOwnProperty.call(SOLID_NAMES, box.name) ? (SOLID_NAMES[box.name] as string) : WALL;
}

/** Trims "2.0" to "2" (the spec's "(2 m)"). */
const metres = (m: number): string => `${Math.round(m * 10) / 10}`;

/** The reason line for `reason` on this device's World; `nameOf` gives a teammate's display name. */
export function blockText(world: Readonly<World>, reason: Readonly<BlockReason>, nameOf: (playerId: string) => string): string {
  switch (reason.cause) {
    case "off_map":
      return "Off the street";
    case "spawn":
      return `Too close to a zombie spawn (${metres(world.balance.buildings.spawnClearM)} m)`;
    case "solid":
      return `Blocked by ${solidWord(world.obstacles.solids[reason.index])}`;
    case "building":
      return "Overlaps a building";
    case "me":
      return "You're standing there";
    case "teammate":
      return `${nameOf(reason.playerId) || "A teammate"} is standing there`; // no name yet (a late join): still says who
    case "zombie":
      return "A zombie is in the way";
  }
}

/** What `placementHintText` needs besides the World (filled by the scene). */
export interface HintContext {
  /** The held type's price and my wallet (as this device's World has it). */
  price: number;
  wallet: number;
  /** A teammate's display name. */
  nameOf: (playerId: string) => string;
  /** Fallback texts (`placeRefusalText`) for the other errors. */
  refusal: (e: PlaceError) => string;
}

/**
 * Story 5.17 (AC 3, D1): the reason line for a shown placement error: the cap and money first (5.16's
 * texts), then the spot's first cause (`blockText`); anything else as the 3.4 refusal text.
 */
export function placementHintText(world: Readonly<World>, e: PlaceError, reason: Readonly<BlockReason> | null, c: HintContext): string {
  if (e === "limit" || e === "money") return pickRefusalText(e, c.price, c.wallet, world.balance.buildings.maxPerPlayer);
  if (e === "blocked" && reason) return blockText(world, reason, c.nameOf);
  return c.refusal(e);
}
