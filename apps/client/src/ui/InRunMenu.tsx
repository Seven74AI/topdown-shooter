import { useEffect, useState } from "preact/hooks";
import { uiStore, type UiScreen } from "./uiState";
import { MENU_TEXT, visibleMenuItems } from "./menuItems";
import { lobbyStore } from "../net/lobbyStore";

/**
 * The in-run menu (Story 2.11) over the live game: a light backdrop so the danger stays visible,
 * the items of `MENU_ITEMS`, and the confirm step for Leave game. Every button goes through the
 * `menu` request; the Game scene runs the state machine and the leave (once).
 */
export function InRunMenu() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  useEffect(() => uiStore.subscribe(setScreen), []);
  if (screen.kind !== "playing" || screen.menu === "closed") return null;
  const online = screen.online;
  if (screen.menu === "confirmLeave") {
    return (
      <div class="in-run-menu" role="dialog" aria-modal="true" aria-labelledby="in-run-menu-title">
        <p id="in-run-menu-title" class="in-run-menu__title">
          {online ? MENU_TEXT.confirm : MENU_TEXT.confirmSolo}
        </p>
        <div class="in-run-menu__items">
          <button type="button" class="btn btn--danger" onClick={() => uiStore.request("menu", "confirm")}>
            {MENU_TEXT.leave}
          </button>
          <button type="button" class="btn btn--secondary" autofocus onClick={() => uiStore.request("menu", "cancel")}>
            {MENU_TEXT.cancel}
          </button>
        </div>
      </div>
    );
  }
  const s = lobbyStore.get();
  const me = s.players.find((p) => p.playerId === s.localPlayerId);
  const isHost = !online || (me !== undefined && me.slot === s.hostSlot);
  return (
    <div class="in-run-menu" role="dialog" aria-modal="true" aria-labelledby="in-run-menu-title">
      <h2 id="in-run-menu-title" class="in-run-menu__title">
        {MENU_TEXT.title}
      </h2>
      <p class="in-run-menu__note">{online ? MENU_TEXT.online : MENU_TEXT.solo}</p>
      <div class="in-run-menu__items">
        {visibleMenuItems({ online, isHost }).map((item, i) => (
          <button
            key={item.id}
            type="button"
            class={item.secondary ? "btn btn--secondary" : "btn"}
            autofocus={i === 0}
            onClick={() => uiStore.request("menu", item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
