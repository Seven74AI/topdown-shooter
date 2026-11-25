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
  /** Story 7.4 (K2): per player slot, bit c set = card c is borrowed from a teammate's unlocks. */
  readonly borrowed: Uint8Array;
  /** Story 7.4: per player slot, the lender's slot of the borrowed card (`NO_LENDER` = none). */
  readonly lender: Uint8Array;
  /**
   * Story 7.4 (K3): the room at the build start (`drawAllOffers`): each present slot's unlock mask and the bitmask of
   * present slots (`world.players` + 8.1's held players). Every draw of that build (rerolls too) reads this, never the
   * live room, so a teammate joining, leaving, buying or rerolling never changes my cards.
   */
  readonly teamMasks: Uint32Array;
  present: number;
}

/** Story 7.4: no lender (u8). */
export const NO_LENDER = 0xff;

export function createShopOffers(): ShopOffers {
  return {
    build: new Int16Array(MAX_PLAYERS).fill(-1),
    rev: new Uint16Array(MAX_PLAYERS),
    cards: new Uint8Array(MAX_PLAYERS * MAX_CARDS).fill(NO_CARD),
    sold: new Uint8Array(MAX_PLAYERS),
    borrowed: new Uint8Array(MAX_PLAYERS),
    lender: new Uint8Array(MAX_PLAYERS).fill(NO_LENDER),
    teamMasks: new Uint32Array(MAX_PLAYERS),
    present: 0,
  };
}
