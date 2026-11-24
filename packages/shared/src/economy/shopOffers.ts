import { MAX_PLAYERS } from "../net/messages";

/** Story 5.13: the most cards an offer can hold (`shop.json › cards` is 1–6). */
export const MAX_CARDS = 6;

/** Story 5.13: a card index slot holding no item (an empty slot: the pool ran out). */
export const NO_CARD = 0xff;

/**
 * Story 5.13: every player slot's stored card offer (`world.shop`), preallocated. Indexed by player
 * slot like `streams.shop` (solo = slot 0). Kept apart from `shopCards.ts` so `core/world.ts` can
 * create it without importing the shop's rules.
 */
export interface ShopOffers {
  /** Build phase index the slot's offer was drawn for (-1: none yet). */
  readonly build: Int16Array;
  /** Rerolls of the slot's offer in that build (0 = the build-start draw). */
  readonly rev: Uint16Array;
  /** `MAX_PLAYERS × MAX_CARDS` card-catalog indices (`NO_CARD` = empty slot). */
  readonly cards: Uint8Array;
  /** Per player slot: bit c set = card c was bought ("Sold"; it never refills). */
  readonly sold: Uint8Array;
}

export function createShopOffers(): ShopOffers {
  return {
    build: new Int16Array(MAX_PLAYERS).fill(-1),
    rev: new Uint16Array(MAX_PLAYERS),
    cards: new Uint8Array(MAX_PLAYERS * MAX_CARDS).fill(NO_CARD),
    sold: new Uint8Array(MAX_PLAYERS),
  };
}
