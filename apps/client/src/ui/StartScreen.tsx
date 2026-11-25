import { useEffect, useRef, useState } from "preact/hooks";
import { GAME_TITLE, ROOM_CODE_LENGTH, isRoomCode, playerNameSchema } from "@topdown/shared";
import { uiStore, type UiScreen } from "./uiState";
import { filterCodeInput } from "./codeInput";
import { JOIN_ERROR_TEXT, needsRefresh } from "../net/joinErrors";
import { accountSession, prefillName } from "../net/account";
import { rewardsStore } from "../net/rewardsStore";

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
  const [busy, setBusy] = useState<"" | "create" | "join">("");
  const nameRef = useRef<HTMLInputElement>(null);
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
    return () => {
      live = false;
    };
  }, []);
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
      <h1 id="start-title">{GAME_TITLE}</h1>
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
      <button
        type="button"
        class="btn btn--secondary"
        disabled={busy !== ""}
        onClick={() => uiStore.request("startSolo")}
      >
        Practice solo
      </button>
    </div>
  );
}
