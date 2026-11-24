import { parseDevShopCards, type Balance } from "@topdown/shared";

export { parseDevShopCards };

/**
 * Story 5.13 dev switch `DEV_SHOP_CARDS=flamethrower,revive_kit` (server, dev only; brief line 18):
 * the build-start offer of every build starts with these card items (the rest come from the stream),
 * so a browser check sees a given card. Pure (the environment is passed in, so the production case
 * is tested): production ignores it (`ignored: "production"`, the room logs it); a list with an id
 * that is not a card item (or too long, or repeated) is ignored as `invalid`.
 */
export function pickDevShopCards(
  env: { readonly NODE_ENV?: string | undefined; readonly DEV_SHOP_CARDS?: string | undefined },
  balance: Balance,
): { readonly cards: readonly string[] | null; readonly ignored: null | "production" | "invalid" } {
  const raw = env.DEV_SHOP_CARDS;
  if (raw === undefined || raw.trim() === "") return { cards: null, ignored: null };
  if (env.NODE_ENV === "production") return { cards: null, ignored: "production" };
  const cards = parseDevShopCards(raw, balance);
  return cards === null ? { cards: null, ignored: "invalid" } : { cards, ignored: null };
}

