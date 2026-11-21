import { useEffect, useState } from "preact/hooks";
import { uiStore, type UiScreen } from "./uiState";
import { copyLink, share, shareLink } from "./share";
import { lobbyStore, type LobbySnapshot } from "../net/lobbyStore";

/** How long "Link copied" stays visible. */
const NOTICE_MS = 2000;

/** Online lobby (Story 2.1): the room code, the invite link, Copy and Share, and who is in. */
export function LobbyScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [lobby, setLobby] = useState<LobbySnapshot>(lobbyStore.get());
  const [notice, setNotice] = useState("");
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

  return (
    <div class="menu lobby" role="dialog" aria-labelledby="lobby-title">
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
      <ul class="lobby__players">
        {lobby.players.map((p) => (
          <li key={p.playerId}>
            {p.name}
            {p.slot === lobby.hostSlot ? " (host)" : ""}
          </li>
        ))}
      </ul>
      <button type="button" class="btn btn--secondary" onClick={() => uiStore.request("leaveLobby")}>
        Leave
      </button>
    </div>
  );
}
