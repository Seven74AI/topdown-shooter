import { useEffect, useState } from "preact/hooks";
import { romanLevel, titleCase } from "@topdown/shared";
import { uiStore } from "./uiState";
import { SHOP_TEXT, gearRows, replaceWarning, shopStore, upgradeRows, type ShopAction, type ShopState } from "./shopStore";
import { GEAR_ICON_CSS_PX, gearIconUrl } from "../render/city/gearIcons";
import { TIER_PLATE_H, tierMarkUrl, tierPlateWidth, weaponIconUrl } from "../render/city/weaponArt";

/** Story 5.1: the U1 stamped plate for a level (the roman numeral as text where no canvas). */
function TierMark({ level }: { level: number }) {
  const url = tierMarkUrl(level);
  const label = romanLevel(level);
  return url ? <img class="tier-mark" src={url} alt={label} width={tierPlateWidth(level)} height={TIER_PLATE_H} /> : <span class="tier-mark">{label}</span>;
}

const send = (action: ShopAction) => uiStore.request("shop", action);
const price = (n: number) => (n === 0 ? SHOP_TEXT.free : `$${n}`);

/**
 * The fixed-list shop (Story 3.3), over the live game in a build phase. Weapons (from balance, with
 * prices) and upgrades; Story 5.16: no buildings (they are picked from the build bar). Every button
 * goes through the `shop` request; the Game scene runs the purchase (server-validated online) and feeds the answer back. Nothing of
 * it is in the DOM while closed, so the touch zones underneath stay usable (#ui is pointer-events: none).
 */
export function ShopScreen() {
  const [s, setS] = useState<ShopState>(shopStore.get());
  useEffect(() => shopStore.subscribe(setS), []);
  if (!s.open) return null;
  const busy = s.pending !== null;
  const owned = (id: string) => s.slots[0] === id || s.slots[1] === id;
  const nameOf = (id: string) => s.weapons.find((w) => w.id === id)?.name ?? titleCase(id);
  const upgrades = upgradeRows(s);
  return (
    <div class="shop" role="dialog" aria-modal="true" aria-labelledby="shop-title">
      <div class="shop__panel">
        <div class="shop__head">
          <h2 id="shop-title" class="shop__title">
            {SHOP_TEXT.title}
          </h2>
          <span class="shop__wallet" aria-label="Wallet">
            ${s.wallet}
          </span>
          <button type="button" class="btn btn--secondary btn--small" onClick={() => send({ type: "close" })}>
            {SHOP_TEXT.close}
          </button>
        </div>
        <p class={`shop__message${s.refused ? " shop__message--refused" : ""}`} role="status" aria-live="polite">
          {busy ? SHOP_TEXT.waiting : s.message}
        </p>
        {s.choosing !== null ? (
          <div class="shop__choose">
            <p class="shop__choose-title">
              {SHOP_TEXT.replace} ({nameOf(s.choosing)})
            </p>
            <div class="shop__items">
              {([0, 1] as const).map((slot) => (
                <button key={slot} type="button" class="btn" autofocus={slot === 0} onClick={() => send({ type: "slot", slot })}>
                  {slot + 1}. {nameOf(s.slots[slot] ?? "")}
                  {s.levels[slot] > 1 ? ` ${romanLevel(s.levels[slot])}` : ""}
                  {/* Story 5.1: replacing an upgraded weapon loses its levels. */}
                  {replaceWarning(s, slot) ? <span class="shop__lost">{replaceWarning(s, slot)}</span> : null}
                </button>
              ))}
              <button type="button" class="btn btn--secondary" onClick={() => send({ type: "cancel" })}>
                {SHOP_TEXT.cancel}
              </button>
            </div>
            <p class="shop__note">{SHOP_TEXT.lost}</p>
          </div>
        ) : (
          <>
            {upgrades.length > 0 && (
              <>
                {/* Story 5.1: always available; one row per weapon I hold, slot 0 first. */}
                <h3 class="shop__section">{SHOP_TEXT.upgrades}</h3>
                <div class="shop__items">
                  {upgrades.map((u) => {
                    const max = u.price === null;
                    const short = !max && (u.price as number) > s.wallet;
                    // The weapon as it looks at its current level (G1 → G3, R2 → R1 from III).
                    const icon = weaponIconUrl(u.weapon, u.level);
                    return (
                      <button
                        key={`${u.slot}:${u.weapon}`}
                        type="button"
                        class={`shop__item shop__item--upgrade${max ? " shop__item--owned" : ""}${short ? " shop__item--short" : ""}${icon ? " shop__item--icon" : ""}`}
                        disabled={max || busy}
                        aria-label={max ? `${nameOf(u.weapon)} ${romanLevel(u.level)}, ${SHOP_TEXT.max}` : `Upgrade ${nameOf(u.weapon)} ${romanLevel(u.level)} to ${romanLevel(u.level + 1)}, ${price(u.price as number)}`}
                        onClick={() => send({ type: "upgrade", weapon: u.weapon })}
                      >
                        {icon ? <img class="shop__icon" src={icon} alt="" width={64} height={29} /> : null}
                        <span class="shop__text">
                          <span class="shop__name shop__name--upgrade">
                            {nameOf(u.weapon)} <TierMark level={u.level} />
                            {max ? null : (
                              <>
                                {" → "}
                                <TierMark level={u.level + 1} />
                              </>
                            )}
                          </span>
                          <span class="shop__price">{max ? SHOP_TEXT.max : price(u.price as number)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <h3 class="shop__section">{SHOP_TEXT.weapons}</h3>
            <div class="shop__items">
              {s.weapons.map((w) => {
                const mine = owned(w.id);
                const short = !mine && w.price > s.wallet;
                // Story 5.3: weapons with their own art show their side-view icon (drawn once, cached).
                const icon = weaponIconUrl(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    class={`shop__item${mine ? " shop__item--owned" : ""}${short ? " shop__item--short" : ""}${icon ? " shop__item--icon" : ""}`}
                    disabled={mine || busy}
                    onClick={() => send({ type: "buy", weapon: w.id })}
                  >
                    {icon ? <img class="shop__icon" src={icon} alt="" width={64} height={29} /> : null}
                    <span class="shop__text">
                      <span class="shop__name">{w.name}</span>
                      <span class="shop__price">{mine ? SHOP_TEXT.owned : price(w.price)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <GearSection s={s} busy={busy} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Story 5.11: the Gear section (self-contained: Story 5.16 reshapes the rest of the shop). One row
 * per item the shop lists, "Owned" (disabled) for owned gear and armor a higher tier covers.
 */
function GearSection({ s, busy }: { s: ShopState; busy: boolean }) {
  const rows = gearRows(s);
  if (rows.length === 0) return null;
  return (
    <>
      <h3 class="shop__section">{SHOP_TEXT.gear}</h3>
      <div class="shop__items">
        {rows.map((r) => {
          const icon = gearIconUrl(r.id);
          return (
            <button
              key={r.id}
              type="button"
              class={`shop__item shop__item--gear${r.owned ? " shop__item--owned" : ""}${r.short ? " shop__item--short" : ""}${icon ? " shop__item--icon" : ""}`}
              disabled={r.owned || busy}
              aria-label={r.owned ? `${r.name}, ${SHOP_TEXT.owned}` : `${r.name}, ${price(r.price)}`}
              onClick={() => send({ type: "item", item: r.id })}
            >
              {icon ? <img class="shop__icon shop__icon--gear" src={icon} alt="" width={GEAR_ICON_CSS_PX} height={GEAR_ICON_CSS_PX} /> : null}
              <span class="shop__text">
                <span class="shop__name">{r.name}</span>
                <span class="shop__price">{r.owned ? SHOP_TEXT.owned : price(r.price)}</span>
                {r.note ? <span class="shop__gear-note">{r.note}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
