import { parseDevShopAll } from "@topdown/shared";

/**
 * Stories 5.10 + 5.11: the server's `DEV_SHOP_ALL` switch (dev only), parsed like the client's
 * `?shopall` (`parseDevShopAll`: "1" / "true"). Pure (the environment is passed in) so the
 * production guard is tested: production ignores it (`ignored: "production"`, logged by the room's
 * `dev_balance_override_ignored`). On → `loadDevBalance({ shopAll: true })`.
 */
export function pickDevShopAll(env: { readonly NODE_ENV?: string | undefined; readonly DEV_SHOP_ALL?: string | undefined }): {
  readonly shopAll: boolean;
  readonly ignored: null | "production";
} {
  if (!parseDevShopAll(env.DEV_SHOP_ALL)) return { shopAll: false, ignored: null };
  if (env.NODE_ENV === "production") return { shopAll: false, ignored: "production" };
  return { shopAll: true, ignored: null };
}
