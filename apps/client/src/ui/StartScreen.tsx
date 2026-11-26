import { useEffect, useRef, useState } from "preact/hooks";
import { GAME_TITLE, ROOM_CODE_LENGTH, isRoomCode, playerNameSchema } from "@topdown/shared";
import { openProgress, uiStore, type UiScreen } from "./uiState";
import { filterCodeInput } from "./codeInput";
import { JOIN_ERROR_TEXT, needsRefresh } from "../net/joinErrors";
import { ACCOUNT_GONE_TEXT, accountSession, prefillName } from "../net/account";
import { syncPendingLookOnce } from "../net/lookSave";
import { rewardsStore } from "../net/rewardsStore";
import { accountStore, type AccountSnapshot } from "../net/accountStore";
import { accountLine } from "./accountModel";
import { AccountLineView } from "./AccountScreen";
import { loadSavedRuns, savedAgo, savedRunTitle } from "../net/savedRuns";
import type { SavedRunSummary } from "@topdown/shared";

const NAME_KEY = "topdown.name";
const NAME_MAX = 16;

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return ""; // storage blocked (private mode): start empty
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage blocked: the name is just not remembered
  }
}

/** On phones the keyboard covers half the landscape screen: keep the focused field visible. */
const reveal = (e: Event) => (e.currentTarget as HTMLElement).scrollIntoView?.({ block: "nearest" });

export interface StartScreenProps {
  /** Code from a share link `/j/<code>` (Story 2.3): prefilled, and the name field gets focus. */
  joinCode?: string | null;
}

/**
 * Start screen (Stories 2.1/2.3): a name, then Create game, or a code and Join, or Practice solo
 * (Epic 1 play, offline).
 */
export function StartScreen({ joinCode = null }: StartScreenProps) {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [name, setName] = useState(loadName);
  // A share link's code is kept as given (sliced), so a bad one still reads "Game not found".
  // A link with a malformed code (main.ts already shows "Game not found") prefills nothing.
  const [code, setCode] = useState(() => (joinCode && joinCode.length === ROOM_CODE_LENGTH ? joinCode : ""));
  const [busy, setBusy] = useState<"" | "create" | "join" | "resume">("");
  // Story 8.6 (AC 11): Saved games — undefined while loading, null when the save server couldn't answer.
  const [saved, setSaved] = useState<SavedRunSummary[] | null | undefined>(undefined);
  const [savedTry, setSavedTry] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState<AccountSnapshot>(accountStore.get());
  useEffect(() => accountStore.subscribe(setAccount), []);
  const focused = useRef(false);
  useEffect(
    () =>
      uiStore.subscribe((s) => {
        setScreen(s);
        setBusy("");
      }),
    [],
  );
  useEffect(() => {
    // Story 7.1 AC 7: on start-up, find this device's account; an empty name field gets its display name.
    let live = true;
    void accountSession().then((session) => {
      if (live) setName((current) => prefillName(current, session));
    });
    // Story 7.10 (AC 9, D4): a look saved only on this phone is sent once, now (if the server still has its base).
    void syncPendingLookOnce();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (screen.kind !== "start") return;
    let live = true;
    setSaved(undefined);
    void loadSavedRuns().then((list) => {
      if (live) setSaved(list);
    });
    return () => {
      live = false;
    };
  }, [screen.kind, savedTry]);
  // Story 7.2 (D4): "+40 Supplies banked from your last run", once, after a Leave mid-run (the answer may land a
  // moment after this screen shows: the rewards store is watched while it is up).
  const [banked, setBanked] = useState<string | null>(null);
  useEffect(() => {
    if (screen.kind !== "start") {
      setBanked(null);
      return;
    }
    const take = () => {
      const line = rewardsStore.takeLeaveLine();
      if (line) setBanked(line);
    };
    take();
    return rewardsStore.subscribe(take);
  }, [screen.kind]);
  useEffect(() => {
    // Share link: focus the name once, when the start screen first shows.
    if (screen.kind !== "start" || !joinCode || focused.current) return;
    focused.current = true;
    nameRef.current?.focus();
  }, [screen.kind, joinCode]);
  if (screen.kind !== "start") return null;

  const parsed = playerNameSchema.safeParse(name);
  const create = () => {
    if (!parsed.success || busy) return;
    saveName(parsed.data);
    setBusy("create");
    uiStore.request("createGame", parsed.data);
  };
  const join = () => {
    if (!parsed.success || busy || code.length === 0) return;
    // A code that can't exist is "Game not found" without asking the server.
    if (!isRoomCode(code)) return uiStore.set({ kind: "start", error: JOIN_ERROR_TEXT.notFound });
    saveName(parsed.data);
    setBusy("join");
    uiStore.request("joinGame", code, parsed.data);
  };
  const resume = (id: string) => {
    if (!parsed.success || busy) return;
    saveName(parsed.data);
    setBusy("resume");
    uiStore.request("resumeGame", id, parsed.data);
  };
  // Enter in the name field joins when a code is there (share link), else creates.
  const onNameSubmit = (e: Event) => {
    e.preventDefault();
    if (code.length > 0) join();
    else create();
  };
  const onCodeSubmit = (e: Event) => {
    e.preventDefault();
    join();
  };
  const onCodeInput = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const next = filterCodeInput(input.value);
    input.value = next; // controlled: drop rejected characters even when the state is unchanged
    setCode(next);
  };

  return (
    <div class="menu" role="dialog" aria-labelledby="start-title">
      {/* Story 7.6 (AC 9, AC1): the thin account line, top right. */}
      <AccountLineView line={accountLine(account)} from={screen} />
      <h1 id="start-title">{GAME_TITLE}</h1>
      {/* Story 10.1 review L9: this phone's account was deleted (or logged out) on another phone. */}
      {account.gone ? (
        <p class="menu__banked st-gone" role="status" data-testid="account-gone">
          {ACCOUNT_GONE_TEXT}
          <button type="button" class="btn btn--small btn--secondary" onClick={() => accountStore.dismissGone()}>
            OK
          </button>
        </p>
      ) : null}
      {banked ? (
        <p class="menu__banked" role="status" data-testid="banked-line">
          {banked}
        </p>
      ) : null}
      <form class="menu__form" onSubmit={onNameSubmit}>
        <label class="menu__label" for="start-name">
          Your name
        </label>
        <input
          id="start-name"
          ref={nameRef}
          class="menu__input"
          type="text"
          value={name}
          maxLength={NAME_MAX}
          autocomplete="off"
          autocapitalize="words"
          inputMode="text"
          enterkeyhint="go"
          spellcheck={false}
          placeholder="Name"
          onFocus={reveal}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
        />
        {name.trim() !== "" && !parsed.success && (
          <p class="menu__hint" role="status">
            Use 1–16 visible letters, numbers or emoji
          </p>
        )}
        <button type="button" class="btn" disabled={!parsed.success || busy !== ""} onClick={create}>
          {busy === "create" ? "Creating…" : "Create game"}
        </button>
      </form>
      <form class="menu__form" onSubmit={onCodeSubmit}>
        <label class="menu__label" for="start-code">
          Or join with a code
        </label>
        <input
          id="start-code"
          class="menu__input menu__input--code"
          type="text"
          value={code}
          maxLength={ROOM_CODE_LENGTH}
          autocomplete="off"
          autocapitalize="characters"
          inputMode="text"
          enterkeyhint="go"
          spellcheck={false}
          placeholder="CODE"
          aria-label="Game code"
          onFocus={reveal}
          onInput={onCodeInput}
        />
        <button type="submit" class="btn" disabled={!parsed.success || code.length === 0 || busy !== ""}>
          {busy === "join" ? "Joining…" : "Join"}
        </button>
      </form>
      {screen.error && (
        <p class="menu__error" role="alert">
          {screen.error}
          {needsRefresh(screen.error) && (
            <button type="button" class="btn btn--small" onClick={() => location.reload()}>
              Refresh
            </button>
          )}
        </p>
      )}
      {/* Story 8.6 (AC 11, E8-R5): Saved games between Join and Practice solo (Lumen LF5 rows); nothing without saves. */}
      {saved === null ? (
        <section class="saved-games" aria-label="Saved games">
          <p class="saved-games__error" role="status">
            Couldn't load saved games
            <button type="button" class="btn btn--small btn--secondary" onClick={() => setSavedTry(savedTry + 1)}>
              Retry
            </button>
          </p>
        </section>
      ) : saved && saved.length > 0 ? (
        <section class="saved-games" aria-labelledby="saved-games-title" data-testid="saved-games">
          <h2 id="saved-games-title" class="saved-games__title">
            Saved games
          </h2>
          <ul class="saved-games__list">
            {saved.map((r) => (
              <li key={r.id} class="saved-games__row">
                <span class="saved-games__text">
                  <span class="saved-games__name">{savedRunTitle(r)}</span>
                  <span class="saved-games__ago">{savedAgo(r.savedAt)}</span>
                </span>
                <button type="button" class="btn saved-games__resume" disabled={!parsed.success || busy !== ""} onClick={() => resume(r.id)}>
                  {busy === "resume" ? "Resuming…" : "Resume"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div class="menu__row">
        <button
          type="button"
          class="btn btn--secondary"
          disabled={busy !== ""}
          onClick={() => uiStore.request("startSolo")}
        >
          Practice solo
        </button>
        {/* Story 7.3 (AC 6): the Progress hub (Supplies, Unlocks), beside Practice solo. */}
        <button type="button" class="btn btn--secondary" disabled={busy !== ""} onClick={() => uiStore.set(openProgress({ kind: "start" }))}>
          Progress
        </button>
        {/* Story 10.1 (AC 1, B16): Settings (and Delete my progress), beside Progress. */}
        <button type="button" class="btn btn--secondary" disabled={busy !== ""} data-testid="start-settings" onClick={() => uiStore.set({ kind: "settings", view: "main" })}>
          Settings
        </button>
      </div>
    </div>
  );
}
