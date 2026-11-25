import { useEffect, useState } from "preact/hooks";
import { openProgress, openSurvivor, uiStore, type UiScreen } from "./uiState";
import { EDITOR_TEXT } from "./survivorEditorStore";
import { copyLink, share, shareLink } from "./share";
import { lobbyStore, lobbyView, type LobbySnapshot } from "../net/lobbyStore";
import { SLOT_COLOR_CSS, SLOT_COLOR_NAMES } from "../render/playerColors";
import { survivorPortraitUrl } from "../render/city/survivorPortrait";
import { lobbyLayout, type Insets, type Rect } from "./lobbyLayout";

/** How long "Link copied" stays visible. */
const NOTICE_MS = 2000;
/** Dev builds let the host start alone (the dev server allows it too, Story 2.3). */
const ALLOW_SOLO_START = import.meta.env.DEV;
/** Story 7.9: the district line shows the run's district read-only; Story 7.7 makes it the host's picker (DP2). */
const DISTRICT_NAME = "Downtown";

const place = (r: Rect): Record<string, string> => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });

/** The safe-area insets as CSS reports them (a probe with `padding: env(...)`), read on mount and resize. */
function readInsets(): Insets {
  if (typeof document === "undefined") return { left: 0, right: 0, top: 0, bottom: 0 };
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const out = { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
  probe.remove();
  return out;
}

function useViewport(): { w: number; h: number; inset: Insets } {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight, inset: readInsets() });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return vp;
}

/**
 * Online lobby (Stories 2.1/2.3; Story 7.9: SC3 line-up cards with DP2's district line, Lumen LF5). Header: the
 * game code (and link when there is room), the district line, Leave. Four cards: each player's survivor drawn big on
 * asphalt inside the slot ring, the slot colour as a bar under the picture, slot chip + name, Ready / Not ready, the
 * Host and You tags ("You" is a white tag and a white keyline, never the orange accent); an open slot is a dashed card.
 * Buttons: Copy, Share, Ready, Start (host) — or "The host starts the game" for guests.
 */
export function LobbyScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [lobby, setLobby] = useState<LobbySnapshot>(lobbyStore.get());
  const [notice, setNotice] = useState("");
  const vp = useViewport();
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
  const L = lobbyLayout(vp.w, vp.h, vp.inset);
  const showLink = L.code.w >= 200;

  return (
    <div class="menu lobby" role="dialog" aria-labelledby="lobby-title">
      <section class="lobby__panel lobby__code-panel" style={place(L.code)}>
        <h2 id="lobby-title" class="lobby__label">
          Game code
        </h2>
        <p class="lobby__code" aria-label={`Game code ${code.split("").join(" ")}`}>
          {code}
        </p>
        {showLink && <p class="lobby__link">{shareLink(code)}</p>}
      </section>
      <section class="lobby__panel lobby__district" style={place(L.district)} aria-label={`District ${DISTRICT_NAME}`}>
        <span class="lobby__district-thumb" aria-hidden="true" />
        <span class="lobby__district-text">
          <span class="lobby__label lobby__label--accent">District</span>
          <span class="lobby__district-name">{DISTRICT_NAME}</span>
        </span>
      </section>
      {/* Story 7.3 (D2): spend Supplies between runs without leaving the room; beside Leave in the header. */}
      <button type="button" class="lobby__leave lobby__progress" style={place(L.progress)} onClick={() => uiStore.set(openProgress({ kind: "lobby", code }))}>
        Progress
      </button>
      <button type="button" class="lobby__leave" style={place(L.leave)} onClick={() => uiStore.request("leaveLobby")}>
        <span aria-hidden="true">◆ </span>Leave
      </button>
      <ul class="lobby__players" aria-label="Players">
        {view.rows.map((p, slot) => {
          const c = L.cards[slot];
          if (!c) return null;
          const at = (r: Rect): Record<string, string> => place({ x: r.x - c.card.x, y: r.y - c.card.y, w: r.w, h: r.h });
          if (!p)
            return (
              <li key={slot} class="lobby-card lobby-card--open" style={place(c.card)}>
                <span class="lobby-card__plus" style={at(c.picture)} aria-hidden="true">
                  +
                </span>
                <span class="lobby-card__open" style={at({ ...c.name, y: c.name.y - 8, h: c.name.h + 8 })}>
                  <span class="lobby-card__open-title">Open</span>
                  <span class="lobby-card__open-hint">Share the code</span>
                </span>
              </li>
            );
          const you = p.playerId === lobby.localPlayerId;
          const host = p.slot === lobby.hostSlot;
          const url = survivorPortraitUrl(p.look);
          return (
            <li
              key={slot}
              class={`lobby-card${you ? " lobby-card--you lobby-card--edit" : ""}`}
              style={place(c.card)}
              // Story 7.10 (AC 1, O4): tapping MY card opens the survivor editor; other players' cards do nothing.
              {...(you
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": `${EDITOR_TEXT.edit}: ${p.name}`,
                    "data-testid": "lobby-my-card",
                    onClick: () => uiStore.set(openSurvivor({ kind: "lobby", code })),
                    onKeyDown: (e: KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") uiStore.set(openSurvivor({ kind: "lobby", code }));
                    },
                  }
                : {})}
            >
              <span class="lobby-card__ring" style={{ ...at(c.picture), borderColor: SLOT_COLOR_CSS[slot] }} role="img" aria-label={`${SLOT_COLOR_NAMES[slot]} survivor`}>
                {url && <img class="lobby-card__survivor" src={url} alt="" draggable={false} />}
              </span>
              <span class="lobby-card__tags">
                {host && <span class="lobby__tag">Host</span>}
                {you && <span class="lobby__tag lobby__tag--you">You</span>}
              </span>
              <span class="lobby-card__bar" style={{ ...at(c.bar), background: SLOT_COLOR_CSS[slot] }} />
              <span class="lobby-card__name" style={at(c.name)}>
                <span class="lobby-card__who">
                  <span class="lobby-card__chip" style={{ background: SLOT_COLOR_CSS[slot] }}>
                    {slot + 1}
                  </span>
                  <span class="lobby__name">{p.name}</span>
                </span>
                <span class={`lobby__ready${p.ready ? " lobby__ready--on" : ""}`}>{p.ready ? "✓ Ready" : "Not ready"}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" class="lobby__btn" style={place(L.copy)} onClick={onCopy}>
        {notice === "Link copied" ? "Copied" : "Copy"}
      </button>
      <button type="button" class="lobby__btn" style={place(L.share)} onClick={onShare}>
        Share
      </button>
      <button
        type="button"
        class={`lobby__btn${!ready && !view.isHost ? " lobby__btn--primary" : ""}`}
        style={place(L.ready)}
        disabled={view.me === null}
        onClick={() => lobbyStore.setReady(!ready)}
      >
        {ready ? "Not ready" : "Ready"}
      </button>
      {view.isHost ? (
        <button
          type="button"
          class="lobby__btn lobby__btn--primary lobby__start"
          style={place(L.start)}
          disabled={!view.canStart}
          title={view.startHint ?? undefined}
          aria-label={view.startHint ? `Start. ${view.startHint}` : "Start"}
          onClick={() => lobbyStore.start()}
        >
          <span>Start</span>
          {view.startHintShort && <span class="lobby__start-hint">{view.startHintShort}</span>}
        </button>
      ) : (
        view.me && (
          <p class="lobby__hint" style={place(L.start)}>
            The host starts the game
          </p>
        )
      )}
      <p class="lobby__notice" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
