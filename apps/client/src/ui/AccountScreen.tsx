import { useEffect, useRef, useState } from "preact/hooks";
import { uiStore, openAccount, type UiScreen } from "./uiState";
import { ACCOUNT_TEXT, EMPTY_FIELDS, VIEW_ACTION, VIEW_TITLE, formState, inRoom, saveHints, type AccountFields } from "./accountModel";
import { logInAccount, logOutAccount, recoverAccount, upgradeAccount } from "../net/account";

/** Back (and Esc): the screen the account screen was opened from. */
function goBack(): void {
  const s = uiStore.get();
  if (s.kind === "account") uiStore.set(s.back);
}

/** AC1: the field you type in sits at the top of the strip, above the phone keyboard. */
const toTop = (e: Event) => (e.currentTarget as HTMLElement).scrollIntoView?.({ block: "start" });

/**
 * Story 7.6 (AC 3, 7, 9; layout AC1, Lumen LF5): Save my progress, Log in, Forgot password (one screen: username +
 * code + new password), the one-time recovery-code card and the log-out confirm. Every outcome is the server's
 * (`net/account.ts`); a phone in a room can only Save ("Leave the game first" for the others, the server refuses too).
 */
export function AccountScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [fields, setFields] = useState<AccountFields>(EMPTY_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => uiStore.subscribe(setScreen), []);
  const view = screen.kind === "account" ? screen.view : null;
  useEffect(() => {
    // A new view starts clean (a typed password never carries over to another form).
    setFields(EMPTY_FIELDS);
    setError(null);
    setBusy(false);
    setCopied(false);
    if (view === "save" || view === "login" || view === "forgot") firstRef.current?.focus({ preventScroll: true });
  }, [view]);
  useEffect(() => {
    // D3: the code card closes only with "I saved it" (no Esc there).
    if (view === null || view === "code") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);
  if (screen.kind !== "account") return null;
  const blocked = inRoom(screen.back);
  const set = (k: keyof AccountFields) => (e: Event) => setFields((f) => ({ ...f, [k]: (e.currentTarget as HTMLInputElement).value }));

  if (screen.view === "code") {
    const code = screen.code ?? "";
    const copy = () => {
      void navigator.clipboard
        ?.writeText(code)
        .then(() => setCopied(true))
        .catch(() => setCopied(false));
    };
    return (
      <div class="menu ph ac ac--modal" role="dialog" aria-labelledby="ac-title" data-testid="account-code">
        <div class="ac-card">
          <h1 id="ac-title" class="ac-card__title">
            {ACCOUNT_TEXT.codeTitle}
          </h1>
          <p class="ac-code" data-testid="recovery-code">
            {code}
          </p>
          <p class="ac-card__line">{ACCOUNT_TEXT.codeLine}</p>
          <div class="ac-card__row">
            <button type="button" class="ph-btn ac-btn" onClick={copy}>
              {copied ? ACCOUNT_TEXT.copied : ACCOUNT_TEXT.copy}
            </button>
            <button type="button" class="ph-btn ph-btn--confirm ac-btn" onClick={goBack}>
              {ACCOUNT_TEXT.savedIt}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen.view === "logout") {
    const doLogOut = () => {
      if (busy) return;
      if (blocked) return setError(ACCOUNT_TEXT.leaveFirst);
      setBusy(true);
      void logOutAccount().then((r) => {
        setBusy(false);
        if (r.kind === "ok") goBack();
        else setError(r.text);
      });
    };
    return (
      <div class="menu ph ac ac--modal" role="dialog" aria-labelledby="ac-title" data-testid="account-logout">
        <div class="ac-card">
          <h1 id="ac-title" class="ac-card__title">
            {ACCOUNT_TEXT.logOutTitle}
          </h1>
          <p class="ac-card__line">{ACCOUNT_TEXT.logOutLine}</p>
          {error ? (
            <p class="ac-error" role="alert">
              {error}
            </p>
          ) : null}
          <div class="ac-card__row">
            <button type="button" class="ac-link" onClick={goBack}>
              {ACCOUNT_TEXT.cancel}
            </button>
            <button type="button" class="ph-btn ph-btn--confirm ac-btn" disabled={busy} aria-busy={busy} onClick={doLogOut}>
              {busy ? ACCOUNT_TEXT.working : ACCOUNT_TEXT.logOut}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const form = screen.view;
  const state = formState(form, fields);
  const hints = form === "save" ? saveHints(fields) : { username: null, password: null };
  const from = screen;
  const submit = (e?: Event) => {
    e?.preventDefault();
    if (busy || !state.canSubmit) return;
    if (form !== "save" && blocked) return setError(ACCOUNT_TEXT.leaveFirst);
    setBusy(true);
    setError(null);
    const done = (r: { kind: "ok" } | { kind: "error"; text: string }, next: () => void) => {
      setBusy(false);
      if (r.kind === "ok") next();
      else setError(r.text);
    };
    if (form === "save") void upgradeAccount(fields.username, fields.password).then((r) => done(r, () => r.kind === "ok" && uiStore.set(openAccount("code", from, r.body.recoveryCode))));
    else if (form === "login") void logInAccount(fields.username, fields.password).then((r) => done(r, goBack));
    else void recoverAccount(fields.username, fields.code, fields.password).then((r) => done(r, () => r.kind === "ok" && uiStore.set(openAccount("code", from, r.body.recoveryCode))));
  };

  return (
    <div class="menu ph ac" role="dialog" aria-labelledby="ac-title" data-testid={`account-${form}`}>
      <div class="ph-frame">
        <header class="ph-head ac-head">
          <button type="button" class="ph-back" aria-label={ACCOUNT_TEXT.back} onClick={goBack} data-testid="ac-back">
            <span aria-hidden="true">‹</span>
          </button>
          <h1 id="ac-title" class="ph-title ac-title">
            {VIEW_TITLE[form]}
          </h1>
          <button type="submit" form="ac-form" class="ph-btn ph-btn--confirm ac-main" disabled={busy || !state.canSubmit} aria-busy={busy} data-testid="ac-main">
            {busy ? ACCOUNT_TEXT.working : VIEW_ACTION[form]}
          </button>
        </header>
        <form id="ac-form" class={`ac-strip ac-strip--${form}`} onSubmit={submit} noValidate>
          {error ? (
            <p class="ac-error" role="alert" data-testid="ac-error">
              {error}
            </p>
          ) : null}
          {form !== "save" && blocked ? <p class="ac-note">{ACCOUNT_TEXT.leaveFirst}</p> : null}
          <div class="ac-fields">
            <label class="ac-field">
              <span class="ac-label">
                {ACCOUNT_TEXT.username}
                {form === "save" ? ` · ${ACCOUNT_TEXT.usernameHint}` : ""}
              </span>
              <input
                ref={firstRef}
                class={`ac-input${error && form !== "save" ? " ac-input--bad" : ""}`}
                type="text"
                name="username"
                autocomplete="username"
                autocapitalize="none"
                spellcheck={false}
                maxLength={20}
                value={fields.username}
                onInput={set("username")}
                onFocus={toTop}
                enterkeyhint="next"
              />
              {hints.username ? <span class="ac-hint">{hints.username}</span> : null}
            </label>
            {form === "forgot" ? (
              <label class="ac-field">
                <span class="ac-label">{ACCOUNT_TEXT.code}</span>
                <input
                  class="ac-input ac-input--code"
                  type="text"
                  name="recovery-code"
                  autocomplete="one-time-code"
                  autocapitalize="characters"
                  spellcheck={false}
                  maxLength={20}
                  value={fields.code}
                  onInput={set("code")}
                  onFocus={toTop}
                  enterkeyhint="next"
                />
                {state.codeHint && fields.code !== "" ? <span class="ac-hint" data-testid="ac-code-hint">{state.codeHint}</span> : null}
              </label>
            ) : null}
            <label class="ac-field ac-field--wide">
              <span class="ac-label">
                {form === "forgot" ? ACCOUNT_TEXT.newPassword : ACCOUNT_TEXT.password}
                {form === "login" ? "" : ` · ${ACCOUNT_TEXT.passwordHint}`}
              </span>
              <input
                class={`ac-input${error && form === "login" ? " ac-input--bad" : ""}`}
                type="password"
                name={form === "login" ? "password" : "new-password"}
                autocomplete={form === "login" ? "current-password" : "new-password"}
                maxLength={128}
                value={fields.password}
                onInput={set("password")}
                onFocus={toTop}
                enterkeyhint="go"
              />
              {hints.password ? <span class="ac-hint">{hints.password}</span> : null}
            </label>
          </div>
          {form === "login" ? (
            <button type="button" class="ac-link" onClick={() => uiStore.set(openAccount("forgot", from))} data-testid="ac-forgot">
              {ACCOUNT_TEXT.forgot}
            </button>
          ) : null}
          {form === "forgot" ? <p class="ac-note">{ACCOUNT_TEXT.noCodeNote}</p> : null}
          {/* Enter in a field submits; the visible main button is in the header (AC1). */}
          <button type="submit" class="ac-hidden-submit" tabIndex={-1} aria-hidden="true" />
        </form>
      </div>
    </div>
  );
}

/**
 * The thin account line (AC 9, AC1): "Guest · Save my progress · Log in" or "Logged in as mo_42 · Log out". `from`
 * is the screen it sits on (the forms return there).
 */
export function AccountLineView({ line, from, compact = false }: { line: import("./accountModel").AccountLine; from: UiScreen; compact?: boolean }) {
  if (line.kind === "unknown") return null;
  return (
    <p class={`ac-line${compact ? " ac-line--compact" : ""}`} data-testid="account-line">
      {line.kind === "guest" ? (
        <>
          <span class="ac-line__who ac-line__prefix">{ACCOUNT_TEXT.guest} ·</span>
          <button type="button" class="ac-link" onClick={() => uiStore.set(openAccount("save", from))} data-testid="ac-open-save">
            {ACCOUNT_TEXT.save}
          </button>
          <button type="button" class="ac-link" onClick={() => uiStore.set(openAccount("login", from))} data-testid="ac-open-login">
            {ACCOUNT_TEXT.logIn}
          </button>
        </>
      ) : (
        <>
          <span class="ac-line__who">
            <span class="ac-line__prefix">{ACCOUNT_TEXT.loggedInAs} </span>
            <b class="ac-line__name">{line.username}</b>
          </span>
          <button type="button" class="ac-link" onClick={() => uiStore.set(openAccount("logout", from))} data-testid="ac-open-logout">
            {ACCOUNT_TEXT.logOut}
          </button>
        </>
      )}
    </p>
  );
}
