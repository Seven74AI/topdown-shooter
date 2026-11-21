import { useEffect, useState } from "preact/hooks";
import { GAME_TITLE, playerNameSchema } from "@topdown/shared";
import { uiStore, type UiScreen } from "./uiState";
import { needsRefresh } from "../net/joinErrors";

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

/** Start screen (Story 2.1): enter a name, then Create game (online) or Practice solo (Epic 1 play). */
export function StartScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [name, setName] = useState(loadName);
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      uiStore.subscribe((s) => {
        setScreen(s);
        setBusy(false);
      }),
    [],
  );
  if (screen.kind !== "start") return null;

  const parsed = playerNameSchema.safeParse(name);
  const create = (e: Event) => {
    e.preventDefault();
    if (!parsed.success || busy) return;
    saveName(parsed.data);
    setBusy(true);
    uiStore.request("createGame", parsed.data);
  };

  return (
    <div class="menu" role="dialog" aria-labelledby="start-title">
      <h1 id="start-title">{GAME_TITLE}</h1>
      <form class="menu__form" onSubmit={create}>
        <label class="menu__label" for="start-name">
          Your name
        </label>
        <input
          id="start-name"
          class="menu__input"
          type="text"
          value={name}
          maxLength={NAME_MAX}
          autocomplete="off"
          autocapitalize="words"
          enterkeyhint="go"
          spellcheck={false}
          placeholder="Name"
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
        />
        <button type="submit" class="btn" disabled={!parsed.success || busy}>
          {busy ? "Creating…" : "Create game"}
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
      <button type="button" class="btn btn--secondary" disabled={busy} onClick={() => uiStore.request("startSolo")}>
        Practice solo
      </button>
    </div>
  );
}
