import { useEffect, useState } from "preact/hooks";
import { titleCase } from "@topdown/shared";
import { uiStore } from "./uiState";
import { SHOP_TEXT, shopStore, type ShopAction, type ShopState } from "./shopStore";

const send = (action: ShopAction) => uiStore.request("shop", action);
const price = (n: number) => (n === 0 ? SHOP_TEXT.free : `$${n}`);

/**
 * The fixed-list shop (Story 3.3), over the live game in a build phase. Weapons (from balance, with
 * prices) and, once Story 3.4 adds them, buildings. Every button goes through the `shop` request;
 * the Game scene runs the purchase (server-validated online) and feeds the answer back. Nothing of
 * it is in the DOM while closed, so the touch zones underneath stay usable (#ui is pointer-events: none).
 */
export function ShopScreen() {
  const [s, setS] = useState<ShopState>(shopStore.get());
  useEffect(() => shopStore.subscribe(setS), []);
  if (!s.open) return null;
  const busy = s.pending !== null;
  const owned = (id: string) => s.slots[0] === id || s.slots[1] === id;
  const nameOf = (id: string) => s.weapons.find((w) => w.id === id)?.name ?? titleCase(id);
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
            <h3 class="shop__section">{SHOP_TEXT.weapons}</h3>
            <div class="shop__items">
              {s.weapons.map((w) => {
                const mine = owned(w.id);
                const short = !mine && w.price > s.wallet;
                return (
                  <button
                    key={w.id}
                    type="button"
                    class={`shop__item${mine ? " shop__item--owned" : ""}${short ? " shop__item--short" : ""}`}
                    disabled={mine || busy}
                    onClick={() => send({ type: "buy", weapon: w.id })}
                  >
                    <span class="shop__name">{w.name}</span>
                    <span class="shop__price">{mine ? SHOP_TEXT.owned : price(w.price)}</span>
                  </button>
                );
              })}
            </div>
            {s.buildings.length > 0 && (
              <>
                <h3 class="shop__section">{SHOP_TEXT.buildings}</h3>
                <div class="shop__items">
                  {s.buildings.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      class={`shop__item${b.price > s.wallet ? " shop__item--short" : ""}`}
                      disabled={busy}
                      onClick={() => send({ type: "building", id: b.id })}
                    >
                      <span class="shop__name">{b.name}</span>
                      <span class="shop__price">{price(b.price)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
