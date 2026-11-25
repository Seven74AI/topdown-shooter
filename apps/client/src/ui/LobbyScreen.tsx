import { useEffect, useState } from "preact/hooks";
import { STARTING_MS, startButton } from "./startButton";
import { openProgress, uiStore, type UiScreen } from "./uiState";
import { copyLink, share, shareLink } from "./share";
import { lobbyStore, lobbyView, type LobbySnapshot } from "../net/lobbyStore";
import { SLOT_COLOR_CSS, SLOT_COLOR_NAMES } from "../render/playerColors";

/** How long "Link copied" stays visible. */
const NOTICE_MS = 2000;
/** Dev builds let the host start alone (the dev server allows it too, Story 2.3). */
const ALLOW_SOLO_START = import.meta.env.DEV;

/**
 * Online lobby (Stories 2.1/2.3): the room code, the invite link, Copy and Share, the 4 slots with
 * color, name, Ready, Host and You, then Ready, Start (host only) and Leave. When the host starts,
 * the Game scene starts online (Story 2.4) and this screen hides.
 */
export function LobbyScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [lobby, setLobby] = useState<LobbySnapshot>(lobbyStore.get());
  const [notice, setNotice] = useState("");
  const [startTap, setStartTap] = useState<number | null>(null); // Stories 7.4/7.5: "Starting…" while the server reads progress
  useEffect(() => {
    if (startTap === null) return;
    const id = setTimeout(() => setStartTap(null), STARTING_MS);
    return () => clearTimeout(id);
  }, [startTap]);
  useEffect(() => uiStore.subscribe(setScreen), []);
  useEffect(() => lobbyStore.subscribe(setLobby), []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);
  if (screen.kind !== "lobby") return null;

  const code = screen.code;
  const onCopy = async () => setNotice((await copyLink(code)) ? "Link copied" : "Couldn't copy the link");
  const onShare = async () => {
    const r = await share(code);
    if (r === "copied") setNotice("Link copied");
    else if (r === "failed") setNotice("Couldn't share the link");
  };
  const view = lobbyView(lobby, ALLOW_SOLO_START);
  const ready = view.me?.ready === true;

  return (
    <div class="menu lobby" role="dialog" aria-labelledby="lobby-title">
      <section class="lobby__invite">
        <h2 id="lobby-title" class="lobby__label">
          Game code
        </h2>
        <p class="lobby__code" aria-label={`Game code ${code.split("").join(" ")}`}>
          {code}
        </p>
        <p class="lobby__link">{shareLink(code)}</p>
        <div class="lobby__row">
          <button type="button" class="btn" onClick={onCopy}>
            Copy
          </button>
          <button type="button" class="btn" onClick={onShare}>
            Share
          </button>
        </div>
        <p class="lobby__notice" aria-live="polite">
          {notice}
        </p>
      </section>
      <section class="lobby__team">
        <ul class="lobby__players" aria-label="Players">
          {view.rows.map((p, slot) => (
            <li key={slot} class={`lobby__player${p ? "" : " lobby__player--open"}`}>
              <span
                class="lobby__dot"
                style={{ background: SLOT_COLOR_CSS[slot] }}
                role="img"
                aria-label={SLOT_COLOR_NAMES[slot]}
              />
              <span class="lobby__name">{p ? p.name : "Open"}</span>
              {p && p.slot === lobby.hostSlot && <span class="lobby__tag">Host</span>}
              {p && p.playerId === lobby.localPlayerId && <span class="lobby__tag lobby__tag--you">You</span>}
              {p && (
                <span class={`lobby__ready${p.ready ? " lobby__ready--on" : ""}`}>{p.ready ? "Ready" : "Not ready"}</span>
              )}
            </li>
          ))}
        </ul>
        <div class="lobby__row">
          <button
            type="button"
            class={`btn${ready ? " btn--secondary" : ""}`}
            disabled={view.me === null}
            onClick={() => lobbyStore.setReady(!ready)}
          >
            {ready ? "Not ready" : "Ready"}
          </button>
          {view.isHost && (
            <button
              type="button"
              class="btn btn--start"
              disabled={!view.canStart || startButton(startTap, performance.now()).starting}
              onClick={() => {
                setStartTap(performance.now());
                lobbyStore.start();
              }}
            >
              {startButton(startTap, performance.now()).label}
            </button>
          )}
        </div>
        {view.startHint && <p class="lobby__hint">{view.startHint}</p>}
        {!view.isHost && view.me && <p class="lobby__hint">The host starts the game</p>}
        <div class="lobby__row">
          {/* Story 7.3 (D2): spend Supplies between runs without leaving the room. */}
          <button type="button" class="btn btn--secondary" onClick={() => uiStore.set(openProgress({ kind: "lobby", code }))}>
            Progress
          </button>
          <button type="button" class="btn btn--secondary" onClick={() => uiStore.request("leaveLobby")}>
            Leave
          </button>
        </div>
      </section>
    </div>
  );
}
