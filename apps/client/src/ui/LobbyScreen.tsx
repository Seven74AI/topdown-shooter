import { useEffect, useState } from "preact/hooks";
import { STARTING_MS, startButton } from "./startButton";
import { openProgress, openSurvivor, uiStore, type UiScreen } from "./uiState";
import { EDITOR_TEXT } from "./survivorEditorStore";
import { copyLink, share, shareLink } from "./share";
import { lobbyStore, lobbyView, type LobbySnapshot } from "../net/lobbyStore";
import { SLOT_COLOR_CSS, SLOT_COLOR_NAMES } from "../render/playerColors";
import { survivorPortraitUrl } from "../render/city/survivorPortrait";
import { lobbyLayout, type Insets, type Rect } from "./lobbyLayout";
import { districtCards, districtResetText } from "./districtModel";
import { districtName } from "@topdown/shared";
import { MENU_TEXT, removeConfirmText } from "./menuItems";
import { HOST_TOAST_TEXT, HostToastWatch } from "./hostToast";

/** How long "Link copied" stays visible. */
const NOTICE_MS = 2000;
/** Dev builds let the host start alone (the dev server allows it too, Story 2.3). */
const ALLOW_SOLO_START = import.meta.env.DEV;

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
  const [sheet, setSheet] = useState(false); // Story 7.7: the DP2 district sheet
  const vp = useViewport();
  const [startTap, setStartTap] = useState<number | null>(null); // Stories 7.4/7.5: "Starting…" while the server reads progress
  const [confirmRemove, setConfirmRemove] = useState<{ playerId: string; name: string } | null>(null); // Story 8.3 (H2)
  const [hostWatch] = useState(() => new HostToastWatch()); // Story 8.3 (H1): "You are now the host", once
  useEffect(() => {
    if (startTap === null) return;
    const id = setTimeout(() => setStartTap(null), STARTING_MS);
    return () => clearTimeout(id);
  }, [startTap]);
  useEffect(() => uiStore.subscribe(setScreen), []);
  useEffect(() => lobbyStore.subscribe(setLobby), []);
  // Story 7.7 R3: "Back to Downtown: nobody here has District 2", once per notice from the server.
  useEffect(() => {
    if (lobby.districtResetSeq > 0 && lobby.districtReset) setNotice(districtResetText(lobby.districtReset));
  }, [lobby.districtResetSeq]);
  // Story 8.3 (H1, AC 9): the role moved to me (the host left): once, never on the first patch (the creator never sees it).
  useEffect(() => {
    const mine = lobby.players.find((p) => p.playerId === lobby.localPlayerId)?.slot;
    if (hostWatch.observe(lobby.hostSlot, mine)) setNotice(HOST_TOAST_TEXT);
  }, [lobby.hostSlot, lobby.localPlayerId, lobby.players]);
  // Story 8.3: a confirm for someone who has left meanwhile closes.
  useEffect(() => {
    if (confirmRemove && !lobby.players.some((p) => p.playerId === confirmRemove.playerId)) setConfirmRemove(null);
  }, [lobby.players, confirmRemove]);
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
  const pickedName = districtName(lobby.district);
  const cards = districtCards(lobby.district, lobby.districtsOpen, view.isHost);
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
      {/* Story 7.7 (DP2): the district line opens the sheet; the host picks there, everyone sees the pick. */}
      {lobby.resumeWave > 0 ? (
        // Story 8.6 (E8-R1): a resumed run keeps its district: "Resuming · Downtown · wave 6" (no sheet).
        <div class="lobby__panel lobby__district" style={place(L.district)} data-testid="resume-line">
          <span class="lobby__district-thumb" aria-hidden="true" />
          <span class="lobby__district-text">
            <span class="lobby__label lobby__label--accent">Resuming</span>
            <span class="lobby__district-name">{resumeLine(pickedName, lobby.resumeWave)}</span>
          </span>
        </div>
      ) : (
        <button type="button" class="lobby__panel lobby__district" style={place(L.district)} aria-label={`District ${pickedName}. ${view.isHost ? "Change" : "See"} districts`} aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
          <span class="lobby__district-thumb" aria-hidden="true" />
          <span class="lobby__district-text">
            <span class="lobby__label lobby__label--accent">District</span>
            <span class="lobby__district-name">{pickedName}</span>
          </span>
        </button>
      )}
      {/* Story 7.3 (D2): spend Supplies between runs without leaving the room; beside Leave in the header. */}
      <button type="button" class="lobby__leave lobby__progress" style={place(L.progress)} onClick={() => uiStore.set(openProgress({ kind: "lobby", code }))}>
        Progress
      </button>
      {sheet && (
        <section class="lobby__panel district-sheet" style={place(L.sheet.panel)} aria-label="Districts" data-testid="district-sheet">
          <ul class="district-sheet__cards">
            {cards.map((d, i) => {
              const at = L.sheet.cards[i];
              if (!at) return null;
              const box = place({ x: at.x - L.sheet.panel.x, y: at.y - L.sheet.panel.y, w: at.w, h: at.h });
              return (
                <li key={d.id} style={box} class={`district-card district-card--${d.state}`}>
                  <button
                    type="button"
                    class="district-card__btn"
                    disabled={!d.pickable}
                    aria-pressed={d.state === "selected"}
                    onClick={() => {
                      lobbyStore.pickDistrict(d.id);
                      setSheet(false);
                    }}
                  >
                    <span class="district-card__thumb" aria-hidden="true" />
                    <span class="district-card__name">{d.name}</span>
                    {d.line && <span class="district-card__line">{d.line}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
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
              {/* Story 8.3 (H2, AC 11): the host removes another player (never themselves), with a confirm. */}
              {view.isHost && !you && (
                <button
                  type="button"
                  class="lobby-card__remove"
                  style={at(c.remove)}
                  aria-label={`${MENU_TEXT.remove} ${p.name}`}
                  data-testid="lobby-remove"
                  onClick={() => setConfirmRemove({ playerId: p.playerId, name: p.name })}
                >
                  ✕
                </button>
              )}
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
          disabled={!view.canStart || startButton(startTap, performance.now()).starting}
          title={view.startHint ?? undefined}
          aria-label={view.startHint ? `Start. ${view.startHint}` : "Start"}
          onClick={() => {
            setStartTap(performance.now()); // Stories 7.4/7.5: "Starting…" while the server reads progress
            lobbyStore.start();
          }}
        >
          <span>{startButton(startTap, performance.now()).label}</span>
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
      {confirmRemove && (
        <div class="in-run-menu" role="dialog" aria-modal="true" aria-labelledby="lobby-remove-title" data-testid="lobby-remove-confirm">
          <p id="lobby-remove-title" class="in-run-menu__title">
            {removeConfirmText(confirmRemove.name)}
          </p>
          <div class="in-run-menu__items">
            <button
              type="button"
              class="btn btn--danger"
              onClick={() => {
                lobbyStore.remove(confirmRemove.playerId);
                setConfirmRemove(null);
              }}
            >
              {MENU_TEXT.remove}
            </button>
            <button type="button" class="btn btn--secondary" autofocus onClick={() => setConfirmRemove(null)}>
              {MENU_TEXT.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Story 8.6 (E8-R1): the resumed lobby's line under "Resuming". */
export const resumeLine = (district: string, wave: number): string => `${district} · wave ${wave}`;
