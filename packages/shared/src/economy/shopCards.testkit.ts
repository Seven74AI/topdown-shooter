import type { World } from "../core/world";
import { buyCard, drawOffer, readOffer, type CardBought } from "./shopCards";
import type { Result } from "../core/result";
import type { ShopError } from "./shop";

/**
 * Story 5.13 test helper (tests only): puts `item` on `playerId`'s offer (a dev-forced redraw of the
 * build-start offer, like `DEV_SHOP_CARDS`) and buys that card through the real `buyCard`.
 */
export function buyForced(world: World, playerId: string, item: string, slot: 0 | 1 | null): Result<CardBought, ShopError> {
  const keep = world.debug.shopCards;
  world.debug.shopCards = [item];
  world.streams.shop.forEach((s) => (s.buildPhaseIndex = -1)); // a fresh stream: the redraw is not a reroll
  drawOffer(world, playerId, 0);
  world.debug.shopCards = keep;
  const o = readOffer(world, playerId);
  const card = o ? o.cards.indexOf(item) : -1;
  return buyCard(world, playerId, o?.build ?? -1, o?.rev ?? 0, card, item, slot);
}
