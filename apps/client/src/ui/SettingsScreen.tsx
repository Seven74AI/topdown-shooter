import { useEffect, useState } from "preact/hooks";
import { uiStore, type UiScreen } from "./uiState";
import { SettingsPanel } from "./SettingsPanel";
import { SETTINGS_TEXT } from "./settingsRows";
import { accountStore, type AccountSnapshot } from "../net/accountStore";
import { deleteMyProgress } from "../net/account";
import { resetPhoneAfterDelete } from "../net/deleteProgress";

/**
 * Story 10.1 (AC 1, 7, 10; B15, B16): the start screen's Settings screen (Lumen LF5, the hub's header) and its
 * "Delete my progress" confirm (`view: "delete"`), which names what goes and asks an account for its password. A
 * confirmed delete resets this phone and reloads (`resetPhoneAfterDelete`): the next open is a fresh guest.
 */
export function SettingsScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [account, setAccount] = useState<AccountSnapshot>(accountStore.get());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => uiStore.subscribe(setScreen), []);
  useEffect(() => accountStore.subscribe(setAccount), []);
  const view = screen.kind === "settings" ? screen.view : null;
  useEffect(() => {
    setPassword("");
    setError(null);
    setBusy(false);
  }, [view]);
  if (screen.kind !== "settings") return null;
  const back = () => uiStore.set(screen.view === "delete" ? { kind: "settings", view: "main" } : { kind: "start" });

  if (screen.view === "delete") {
    const username = account.username;
    const needsPassword = username !== null;
    const ready = !busy && (!needsPassword || password.length > 0);
    const confirm = async () => {
      if (!ready) return;
      setBusy(true);
      setError(null);
      const r = await deleteMyProgress(needsPassword ? password : undefined);
      if (r.kind === "ok") return resetPhoneAfterDelete();
      setBusy(false);
      setError(r.text);
    };
    return (
      <div class="menu ph ac--modal st-modal" role="dialog" aria-modal="true" aria-labelledby="st-delete-title" data-testid="settings-delete">
        <form
          class="ac-card st-delete"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <h1 id="st-delete-title" class="ac-card__title">
            {SETTINGS_TEXT.confirmTitle}
          </h1>
          <ul class="st-delete__list">
            {SETTINGS_TEXT.confirmGoes.map((t) => (
              <li key={t}>{t}</li>
            ))}
            {username !== null && <li>{SETTINGS_TEXT.confirmAccount(username)}</li>}
          </ul>
          <p class="st-delete__footer">{SETTINGS_TEXT.confirmFooter}</p>
          {needsPassword && (
            <label class="st-delete__field">
              <span class="st-label">{SETTINGS_TEXT.password}</span>
              <input class="menu__input st-delete__input" type="password" autocomplete="current-password" value={password} onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)} />
            </label>
          )}
          {error && (
            <p class="menu__error" role="alert">
              {error}
            </p>
          )}
          <div class="st-delete__actions">
            <button type="submit" class="btn btn--danger" disabled={!ready} aria-busy={busy} data-testid="settings-delete-confirm">
              {busy ? SETTINGS_TEXT.deleting : SETTINGS_TEXT.confirm}
            </button>
            <button type="button" class="btn btn--secondary" autofocus disabled={busy} onClick={back}>
              {SETTINGS_TEXT.cancel}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div class="menu ph st" role="dialog" aria-labelledby="st-title" data-testid="settings-screen">
      <div class="ph-frame">
        <header class="ph-head">
          <button type="button" class="ph-back" aria-label={SETTINGS_TEXT.back} onClick={back}>
            <span aria-hidden="true">‹</span>
          </button>
          <h1 id="st-title" class="ph-title">
            {SETTINGS_TEXT.title}
          </h1>
        </header>
        <div class="st-body">
          <SettingsPanel idPrefix="st" />
          <section class="st-group" aria-labelledby="st-progress">
            <h2 id="st-progress" class="st-group__title">
              {SETTINGS_TEXT.progressGroup}
            </h2>
            <div class="st-row">
              <button type="button" class="btn btn--danger st-delete-open" data-testid="settings-delete-open" onClick={() => uiStore.set({ kind: "settings", view: "delete" })}>
                {SETTINGS_TEXT.deleteButton}
              </button>
              <p class="st-hint">{SETTINGS_TEXT.deleteHint}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
