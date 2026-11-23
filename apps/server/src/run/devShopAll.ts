/**
 * Story 5.10 dev switch `DEV_SHOP_ALL=1` (server, dev only; read per run): building types with
 * `inShop: false` (the floodlight until 6.3) can be placed (`world.debug.shopAll`). Pure (the
 * environment is passed in) so the production guard is tested: production ignores it
 * (`ignored: "production"`, the room logs it).
 */
export function pickDevShopAll(env: { readonly NODE_ENV?: string | undefined; readonly DEV_SHOP_ALL?: string | undefined }): {
  readonly shopAll: boolean;
  readonly ignored: null | "production";
} {
  if (env.DEV_SHOP_ALL !== "1") return { shopAll: false, ignored: null };
  if (env.NODE_ENV === "production") return { shopAll: false, ignored: "production" };
  return { shopAll: true, ignored: null };
}
