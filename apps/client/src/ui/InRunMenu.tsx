import { useEffect, useState } from "preact/hooks";
import { uiStore, type UiScreen } from "./uiState";
import { MENU_TEXT, SAVE_TEXT, canRemoveIn, canSaveIn, menuRemoveTarget, removeConfirmText, visibleMenuItems } from "./menuItems";
import { lobbyStore, saveQuitStore, type LobbySnapshot, type SaveQuitState } from "../net/lobbyStore";
import { pendingPlacements } from "./pendingPlacements";
import { SettingsPanel } from "./SettingsPanel";
import { SETTINGS_TEXT } from "./settingsRows";
import { REPORT_TEXT, ReportCard } from "./ReportScreen";

/** Story 10.6: a stable callback (the card's Esc listener depends on it). */
const closeReport = () => uiStore.request("menu", "back");

/**
 * The in-run menu (Story 2.11) over the live game: a light backdrop so the danger stays visible,
 * the items of `MENU_ITEMS`, and the confirm step for Leave game. Every button goes through the
 * `menu` request; the Game scene runs the state machine and the leave (once). Story 8.3 (H2, AC 11):
 * the host's Players list (the other seats in the room state: connected, reconnecting, waiting) with
 * Remove + its confirm; Remove is greyed outside a build phase. Settings: Story 10.1's `SettingsPanel` (every
 * change saved and applied at once).
 */
export function InRunMenu() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [lobby, setLobby] = useState<LobbySnapshot>(lobbyStore.get());
  useEffect(() => uiStore.subscribe(setScreen), []);
  useEffect(() => lobbyStore.subscribe(setLobby), []);
  const [saving, setSaving] = useState<SaveQuitState>(saveQuitStore.get());
  useEffect(() => saveQuitStore.subscribe(setSaving), []);
  const [settled, setSettled] = useState(pendingPlacements.get() === 0);
  useEffect(() => pendingPlacements.subscribe((n) => setSettled(n === 0)), []);
  if (screen.kind !== "playing" || screen.menu === "closed") return null;
  const online = screen.online;
  if (screen.menu === "confirmSave") {
    // Story 8.5 (AC 9, 10): one request; Save waits for my own placements to settle; "Saving…" ignores taps; S8 says so.
    const busy = saving === "saving" || saving === "saved";
    const allowed = canSaveIn(lobby.phase) && settled;
    return (
      <div class="in-run-menu" role="dialog" aria-modal="true" aria-labelledby="in-run-menu-title" data-testid="save-confirm">
        <p id="in-run-menu-title" class="in-run-menu__title">
          {SAVE_TEXT.confirm}
        </p>
        {saving === "failed" && (
          <p class="in-run-menu__note" role="alert">
            {SAVE_TEXT.failed}
          </p>
        )}
        {!canSaveIn(lobby.phase) && <p class="in-run-menu__note">{visibleMenuItems({ online, isHost: true }).find((i) => i.id === "save")?.disabledNote}</p>}
        <div class="in-run-menu__items">
          <button type="button" class="btn" disabled={busy || !allowed} aria-busy={busy} onClick={() => !busy && allowed && lobbyStore.saveQuit()}>
            {busy ? SAVE_TEXT.saving : SAVE_TEXT.save}
          </button>
          {/* Review M4: Cancel always works (it closes the confirm; the server's answer, if any, still lands). */}
          <button type="button" class="btn btn--secondary" autofocus disabled={saving === "saved"} onClick={() => uiStore.request("menu", "cancel")}>
            {MENU_TEXT.cancel}
          </button>
        </div>
      </div>
    );
  }
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
  if (screen.menu === "confirmRemove") {
    const target = menuRemoveTarget.get();
    return (
      <div class="in-run-menu" role="dialog" aria-modal="true" aria-labelledby="in-run-menu-title" data-testid="remove-confirm">
        <p id="in-run-menu-title" class="in-run-menu__title">
          {removeConfirmText(target?.name ?? "")}
        </p>
        <div class="in-run-menu__items">
          <button
            type="button"
            class="btn btn--danger"
            disabled={!target || !canRemoveIn(lobby.phase)}
            onClick={() => {
              if (target && canRemoveIn(lobby.phase)) lobbyStore.remove(target.playerId);
              menuRemoveTarget.set(null);
              uiStore.request("menu", "confirm");
            }}
          >
            {MENU_TEXT.remove}
          </button>
          <button type="button" class="btn btn--secondary" autofocus onClick={() => uiStore.request("menu", "cancel")}>
            {MENU_TEXT.cancel}
          </button>
        </div>
      </div>
    );
  }
  if (screen.menu === "report") {
    // Story 10.6 (Q2 B): Report a problem from the in-run Settings (the run keeps going online; solo stays paused).
    return (
      <div class="in-run-menu in-run-menu--list in-run-menu--settings rp-in-run" role="dialog" aria-modal="true" aria-labelledby="rp-title" data-testid="report-menu">
        <ReportCard onClose={closeReport} />
      </div>
    );
  }
  if (screen.menu === "settings") {
    // Story 10.1 (AC 1, B16): the same panel as the start screen's Settings; Delete my progress only there (no run).
    return (
      <div class="in-run-menu in-run-menu--list in-run-menu--settings" role="dialog" aria-modal="true" aria-labelledby="in-run-menu-title" data-testid="settings-menu">
        <h2 id="in-run-menu-title" class="in-run-menu__title">
          {MENU_TEXT.settings}
        </h2>
        {/* No autofocus on Back here: focusing it would open the long list scrolled to the bottom (☰ / Esc still close). */}
        <SettingsPanel idPrefix="irm" />
        <div class="st-row">
          <button type="button" class="btn btn--secondary st-delete-open" data-testid="settings-report-open" onClick={() => uiStore.request("menu", "report")}>
            {REPORT_TEXT.open}
          </button>
        </div>
        <p class="in-run-menu__note st-hint">{SETTINGS_TEXT.inRunDeleteNote}</p>
        <div class="in-run-menu__items">
          <button type="button" class="btn btn--secondary in-run-menu__back" onClick={() => uiStore.request("menu", "back")}>
            {MENU_TEXT.back}
          </button>
        </div>
      </div>
    );
  }
  if (screen.menu === "players") {
    // Story 8.3 (AC 11): the other seats in the room state, then the remembered ones (left the run).
    const others = [
      ...lobby.players.filter((p) => p.playerId !== lobby.localPlayerId),
      ...lobby.left.filter((l) => !lobby.players.some((p) => p.playerId === l.playerId)).map((l) => ({ ...l, held: false, waiting: false, left: true })),
    ] as readonly { playerId: string; name: string; held?: boolean; waiting?: boolean; left?: boolean }[];
    const allowed = canRemoveIn(lobby.phase);
    return (
      <div class="in-run-menu in-run-menu--list" role="dialog" aria-modal="true" aria-labelledby="in-run-menu-title" data-testid="players-menu">
        <h2 id="in-run-menu-title" class="in-run-menu__title">
          {MENU_TEXT.players}
        </h2>
        {!allowed && <p class="in-run-menu__note">{MENU_TEXT.removeOnlyInBuild}</p>}
        {others.length === 0 && <p class="in-run-menu__note">{MENU_TEXT.noOthers}</p>}
        <ul class="in-run-menu__players">
          {others.map((p) => (
            <li key={p.playerId} class="in-run-menu__player">
              <span class="in-run-menu__player-name">
                {p.name}
                {p.held ? ` · ${MENU_TEXT.reconnecting}` : p.waiting ? ` · ${MENU_TEXT.waiting}` : p.left ? ` · ${MENU_TEXT.left}` : ""}
              </span>
              <button
                type="button"
                class="btn btn--danger in-run-menu__remove"
                disabled={!allowed}
                onClick={() => {
                  menuRemoveTarget.set({ playerId: p.playerId, name: p.name });
                  uiStore.request("menu", "remove");
                }}
              >
                {MENU_TEXT.remove}
              </button>
            </li>
          ))}
        </ul>
        <div class="in-run-menu__items">
          <button type="button" class="btn btn--secondary in-run-menu__back" autofocus onClick={() => uiStore.request("menu", "back")}>
            {MENU_TEXT.back}
          </button>
        </div>
      </div>
    );
  }
  const me = lobby.players.find((p) => p.playerId === lobby.localPlayerId);
  const isHost = !online || (me !== undefined && me.slot === lobby.hostSlot);
  return (
    <div class="in-run-menu" role="dialog" aria-modal="true" aria-labelledby="in-run-menu-title">
      <h2 id="in-run-menu-title" class="in-run-menu__title">
        {MENU_TEXT.title}
      </h2>
      <p class="in-run-menu__note">{online ? MENU_TEXT.online : MENU_TEXT.solo}</p>
      <div class="in-run-menu__items">
        {visibleMenuItems({ online, isHost, phase: lobby.phase }).map((item, i) => {
          const enabled = item.enabled?.({ online, isHost, phase: lobby.phase }) ?? true;
          return (
            <div key={item.id} class="in-run-menu__item">
              <button
                type="button"
                class={item.secondary ? "btn btn--secondary" : "btn"}
                autofocus={i === 0}
                disabled={!enabled}
                data-testid={`menu-${item.id}`}
                onClick={() => enabled && uiStore.request("menu", item.action)}
              >
                {item.label}
              </button>
              {!enabled && item.disabledNote && <p class="in-run-menu__note in-run-menu__note--small">{item.disabledNote}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
