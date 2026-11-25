import { useEffect, useState } from "preact/hooks";
import { romanLevel, titleCase } from "@topdown/shared";
import { uiStore } from "./uiState";
import { SHOP_TEXT, borrowedLabel, borrowedTag, canReroll, cardViews, consumableRows, offerCurrent, replaceWarning, shopStore, upgradeRows, type CardView, type ShopAction, type ShopState } from "./shopStore";
import { CARD_GAP_CSS_PX, CARD_MIN_H_CSS_PX, CARD_MIN_W_CSS_PX } from "./sizes";
import { consumableIconUrl } from "../render/city/consumableIcons";
import { SLOT_COLOR_CSS } from "../render/playerColors";
import { gearIconUrl } from "../render/city/gearIcons";
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
 * The shop (Story 3.3; Story 5.13: the roguelike card shop), over the live game in a build phase.
 * Landscape (D9): a 3 × 2 grid of my cards on the left (C3 "police evidence tag" cards, drawn in
 * CSS), the always-available list on the right (upgrades, consumables, the repair and barricade
 * hints; it scrolls), wallet + Reroll in the head row, Close top-right. Tap a card to select it,
 * tap it again to buy (D8). Every button goes through the `shop` request; the Game scene runs the
 * purchase (server-validated online) and feeds the answer and the new offer back. Nothing of it is
 * in the DOM while closed, so the touch zones underneath stay usable (#ui is pointer-events: none).
 */
export function ShopScreen() {
  const [s, setS] = useState<ShopState>(shopStore.get());
  useEffect(() => shopStore.subscribe(setS), []);
  if (!s.open) return null;
  const busy = s.pending !== null;
  const nameOf = (id: string) => s.catalog.find((c) => c.id === id)?.name ?? titleCase(id);
  const upgrades = upgradeRows(s);
  const current = offerCurrent(s);
  const rerollPrice = current && s.offer ? s.offer.rerollPrice : 0;
  const status = s.pending === "reroll" ? SHOP_TEXT.rerolling : busy ? SHOP_TEXT.waiting : s.message;
  return (
    <div class="shop" role="dialog" aria-modal="true" aria-labelledby="shop-title" onClick={() => send({ type: "deselect" })}>
      <div class="shop__panel shop__panel--cards">
        <div class="shop__head">
          <h2 id="shop-title" class="shop__title">
            {SHOP_TEXT.title}
          </h2>
          <span class="shop__wallet" aria-label="Wallet">
            ${s.wallet}
          </span>
          <button
            type="button"
            class={`btn btn--small shop__reroll${rerollPrice > s.wallet ? " shop__reroll--short" : ""}`}
            disabled={!canReroll(s)}
            onClick={(e) => {
              e.stopPropagation();
              send({ type: "reroll" });
            }}
          >
            {SHOP_TEXT.reroll(rerollPrice)}
          </button>
          <button type="button" class="btn btn--secondary btn--small" onClick={() => send({ type: "close" })}>
            {SHOP_TEXT.close}
          </button>
        </div>
        {s.choosing !== null ? (
          <div class="shop__choose" onClick={(e) => e.stopPropagation()}>
            <p class="shop__choose-title">
              {SHOP_TEXT.replace} ({nameOf(s.choosing)})
            </p>
            <div class="shop__items">
              {([0, 1] as const).map((slot) => (
                <button key={slot} type="button" class="btn" autofocus={slot === 0} onClick={() => send({ type: "slot", slot })}>
                  {slot + 1}. {weaponNameOf(s, s.slots[slot] ?? "")}
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
          <div class="shop__body">
            <CardGrid s={s} busy={busy} />
            <div class="shop__always">
              <p class={`shop__message${s.refused ? " shop__message--refused" : ""}`} role="status" aria-live="polite">
                {status}
              </p>
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
                          aria-label={max ? `${weaponNameOf(s, u.weapon)} ${romanLevel(u.level)}, ${SHOP_TEXT.max}` : `Upgrade ${weaponNameOf(s, u.weapon)} ${romanLevel(u.level)} to ${romanLevel(u.level + 1)}, ${price(u.price as number)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            send({ type: "upgrade", weapon: u.weapon });
                          }}
                        >
                          {icon ? <img class="shop__icon" src={icon} alt="" width={64} height={29} /> : null}
                          <span class="shop__text">
                            <span class="shop__name shop__name--upgrade">
                              {weaponNameOf(s, u.weapon)} <TierMark level={u.level} />
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
              <ConsumableSection s={s} busy={busy} />
              <p class="shop__hint">{SHOP_TEXT.repairHint}</p>
              <p class="shop__hint">{SHOP_TEXT.barricadeHint}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The display name of a weapon in my slots (the Pistol is not a card: Title Case of its balance name). */
function weaponNameOf(s: ShopState, id: string): string {
  return s.catalog.find((c) => c.id === id)?.name ?? (id === "pistol" ? "Pistol" : titleCase(id));
}

const GRID_STYLE = {
  gridTemplateColumns: `repeat(3, minmax(${CARD_MIN_W_CSS_PX}px, 1fr))`,
  gridAutoRows: `minmax(${CARD_MIN_H_CSS_PX}px, 1fr)`,
  gap: `${CARD_GAP_CSS_PX}px`,
};

/** Story 5.13 (AC 9): my 6 cards in a 3 × 2 grid, or "Loading cards…" until this build's offer is here. */
function CardGrid({ s, busy }: { s: ShopState; busy: boolean }) {
  if (!offerCurrent(s)) {
    return (
      <div class="shop__cards shop__cards--loading" style={GRID_STYLE}>
        <p class="shop__loading">{SHOP_TEXT.loading}</p>
      </div>
    );
  }
  const cards = cardViews(s);
  return (
    <div class="shop__cards" style={GRID_STYLE} role="group" aria-label={SHOP_TEXT.cards}>
      {cards.map((c) => (
        <Card key={c.index} c={c} busy={busy} />
      ))}
    </div>
  );
}

/** Story 5.13 (D10, C3): one evidence-tag card: rarity tape, number, category icon, name, price, one stat line. */
function Card({ c, busy }: { c: CardView; busy: boolean }) {
  if (c.item === "") {
    return (
      <div class="shop-card shop-card--empty" aria-label="Empty">
        <span class="shop-card__empty">{SHOP_TEXT.empty}</span>
      </div>
    );
  }
  // Story 5.28: every card item has side-view art (the 5.13 pictogram is gone); null only without a canvas.
  const icon = c.kind === "weapon" ? weaponIconUrl(c.item) : gearIconUrl(c.item);
  const state = c.sold ? "sold" : c.owned ? "owned" : c.short ? "short" : "ok";
  const priceText = c.sold ? SHOP_TEXT.sold : c.owned ? SHOP_TEXT.owned : c.selected ? SHOP_TEXT.buyFor(c.price) : price(c.price);
  const borrowed = c.borrowedFrom !== "";
  const cls = `shop-card shop-card--${c.rarity} shop-card--${state}${c.selected ? " shop-card--selected" : ""}${borrowed ? " shop-card--borrowed" : ""}`;
  return (
    <button
      type="button"
      class={cls}
      disabled={busy || c.sold || c.owned}
      aria-pressed={c.selected}
      aria-label={`${c.name}, ${c.kind === "weapon" ? SHOP_TEXT.weapon : SHOP_TEXT.gearKind}, ${c.rarity}, ${priceText}${c.short ? `, ${SHOP_TEXT.tooDear}` : ""}${borrowed ? `, ${borrowedLabel(c.borrowedFrom)}` : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        send({ type: "card", card: c.index });
      }}
    >
      {borrowed ? (
        // Story 7.4 (K2, designer pick BT1): the tape row becomes the lender's tag — slot badge + "From Mo".
        <span class="shop-card__tape shop-card__tape--borrowed" aria-hidden="true" data-testid="borrowed-tag">
          <span class="shop-card__lender" style={{ background: SLOT_COLOR_CSS[c.lenderSlot] ?? "#888" }}>
            {c.lenderSlot < 4 ? c.lenderSlot + 1 : "?"}
          </span>
          <span class="shop-card__from">{borrowedTag(c.borrowedFrom)}</span>
        </span>
      ) : (
        <span class="shop-card__tape" aria-hidden="true">
          <span class="shop-card__no">#{String(c.index + 1).padStart(2, "0")}</span>
          <span class="shop-card__kind">{c.kind === "weapon" ? "WPN" : "GEAR"}</span>
        </span>
      )}
      <span class="shop-card__art" aria-hidden="true">
        {icon && <img class={c.kind === "weapon" ? "shop-card__icon" : "shop-card__icon shop-card__icon--gear"} src={icon} alt="" />}
      </span>
      <span class="shop-card__name">{c.name}</span>
      <span class="shop-card__price">{priceText}</span>
      <span class="shop-card__stat">{c.short && !c.selected ? SHOP_TEXT.tooDear : c.stat}</span>
    </button>
  );
}

/**
 * Story 5.12 (AC 2): the always-available Consumables section — icon (CI4), name × pack, price;
 * "Full" (disabled) when my slot already holds a full pack of it; "Replaces Grenades ×2" before a
 * tap that would replace another item (its rest is lost), "Refills to ×3" for a partial slot.
 */
function ConsumableSection({ s, busy }: { s: ShopState; busy: boolean }) {
  const rows = consumableRows(s);
  if (rows.length === 0) return null;
  return (
    <>
      <h3 class="shop__section">{SHOP_TEXT.consumables}</h3>
      <div class="shop__items">
        {rows.map((r) => {
          const icon = consumableIconUrl(r.id);
          return (
            <button
              key={r.id}
              type="button"
              class={`shop__item shop__item--gear${r.full ? " shop__item--owned" : ""}${r.short ? " shop__item--short" : ""}${icon ? " shop__item--icon" : ""}`}
              disabled={r.full || busy}
              aria-label={r.full ? `${r.name}, ${SHOP_TEXT.full}` : `${r.name} ×${r.pack}, ${price(r.price)}`}
              onClick={(e) => {
                e.stopPropagation();
                send({ type: "item", item: r.id });
              }}
            >
              {icon ? <img class="shop__icon shop__icon--gear" src={icon} alt="" width={32} height={32} /> : null}
              <span class="shop__text">
                <span class="shop__name">{`${r.name} ×${r.pack}`}</span>
                <span class="shop__price">{r.full ? SHOP_TEXT.full : price(r.price)}</span>
                {r.note ? <span class="shop__gear-note">{r.note}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
