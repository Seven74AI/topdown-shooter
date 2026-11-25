import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { openProgress, uiStore, type SurvivorBack, type UiScreen } from "./uiState";
import {
  EDITOR_TABS,
  EDITOR_TEXT,
  PICKER_LABEL,
  SWATCHES,
  TAB_PICKERS,
  changed,
  draftCode,
  infoLine,
  infoLocked,
  openEditor,
  ownedFrom,
  pick,
  random,
  setColour,
  setTab,
  tabColour,
  tileLine,
  tilesFor,
  type ColourKey,
  type EditorState,
  type PartTile,
} from "./survivorEditorStore";
import { progressStore } from "../net/progressStore";
import { deviceLook } from "../net/deviceLook";
import { lobbyStore } from "../net/lobbyStore";
import { DEFAULT_LOOK_CODE, saveFromEditor } from "../net/lookSave";
import { partTileUrl } from "../render/city/partTiles";
import { resolveLook } from "../render/city/survivorLook";
import { BigPreview, DRAG_RAD_PER_PX, drawGamePreview, watchVisible } from "../render/editorPreview";
import type { SurvivorLook } from "@topdown/shared";

/** AC 9: how long "Saved on this phone…" stays before the editor closes by itself (Back closes at once). */
export const OFFLINE_NOTE_MS = 2500;
/** Tiles follow the draft's colours after this pause (a colour drag repaints the previews every frame, the tiles once). */
const TILE_SETTLE_MS = 150;

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "note"; text: string; closeAtMs: number | null };

function backScreen(back: SurvivorBack): UiScreen {
  return back.kind === "lobby" ? { kind: "lobby", code: back.code } : openProgress(back.back);
}

/** My slot in the lobby (the ring colour), else the first slot. */
function mySlot(back: SurvivorBack): number {
  if (back.kind !== "lobby") return 0;
  const s = lobbyStore.get();
  return s.players.find((p) => p.playerId === s.localPlayerId)?.slot ?? 0;
}

/** The look the editor opens with: this phone's copy (it follows every server answer; a pending Done wins, AC 9). */
function openState(tab?: EditorState["tab"]): EditorState {
  return openEditor(deviceLook.get(), ownedFrom(progressStore.get().progress as { cosmetics?: readonly string[] } | null), tab);
}

/** Sizes a canvas to its CSS box × dpr; returns false when it has no size yet. */
function fit(cv: HTMLCanvasElement): boolean {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(cv.clientWidth * dpr);
  const h = Math.round(cv.clientHeight * dpr);
  if (w === 0 || h === 0) return false;
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return true;
}

/**
 * Story 7.10 (AC 1–10; layout ED1 + LK2 + LS1, Lumen LF5): the survivor editor. Left: Back, the Chosen / In game
 * swatches, the big turning preview and the game-size preview. Right: the tabs (Top / Head / Hair / Pack / Skin), the
 * part tiles, the info row (a tapped locked tile's line), the colour row (the phone's picker + 12 quick colours),
 * Random and Done in the bottom-right corner. Back discards (D7); Done saves through the account API (AC 8, 9).
 */
export function SurvivorEditor() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [st, setSt] = useState<EditorState | null>(null);
  const [tileDraft, setTileDraft] = useState<SurvivorLook | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const stRef = useRef(st);
  stRef.current = st;
  const bigRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HTMLCanvasElement>(null);
  const preview = useMemo(() => new BigPreview(), []);
  const drag = useRef<{ x: number; id: number } | null>(null);
  useEffect(() => uiStore.subscribe(setScreen), []);
  const open = screen.kind === "survivor";
  const back = screen.kind === "survivor" ? screen.back : null;
  const slot = back ? mySlot(back) : 0;

  // Open: my look as this phone has it; ask the server once if the hub's copy is not the server's (two phones).
  useEffect(() => {
    if (!open) {
      setSt(null);
      setStatus({ kind: "idle" });
      return;
    }
    setSt(openState());
    if (progressStore.get().source === "server") return;
    let live = true;
    void progressStore.refresh().then((snap) => {
      const cur = stRef.current;
      if (live && snap.source === "server" && cur && !changed(cur)) setSt(openState(cur.tab));
    });
    return () => {
      live = false;
    };
  }, [open]);

  const close = (): void => {
    const s = uiStore.get();
    if (s.kind === "survivor") uiStore.set(backScreen(s.back));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The offline note closes the editor after a moment (AC 9).
  useEffect(() => {
    if (status.kind !== "note" || status.closeAtMs === null) return;
    const id = setTimeout(close, Math.max(0, status.closeAtMs - performance.now()));
    return () => clearTimeout(id);
  }, [status]);

  // AC 3: both previews follow the draft in the same frame; the game-size one is drawn once per change.
  const drawGame = (): void => {
    const cv = gameRef.current;
    const cur = stRef.current;
    if (!cv || !cur || !fit(cv)) return;
    const g = cv.getContext("2d");
    if (g) drawGamePreview(g, cv.width, cv.height, window.devicePixelRatio || 1, resolveLook(cur.draft, 1), slot);
  };
  const draft = st?.draft;
  useEffect(() => {
    if (!draft) return;
    preview.setLook(draft);
    drawGame();
    const id = setTimeout(() => setTileDraft(draft), TILE_SETTLE_MS);
    if (tileDraft === null) setTileDraft(draft);
    return () => clearTimeout(id);
  }, [draft, slot]);

  // D6: the big preview turns while the editor is open (one requestAnimationFrame loop, nothing allocated per frame).
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const loop = (t: number): void => {
      const cv = bigRef.current;
      if (cv && fit(cv)) {
        const g = cv.getContext("2d");
        if (g) preview.frame(g, cv.width, cv.height, t, slot);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onResize = (): void => drawGame();
    window.addEventListener("resize", onResize);
    // Brief 20: Android may empty DOM canvases while the page is hidden: redraw on return (the loop redraws the big one).
    const unwatch = watchVisible(document, drawGame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      unwatch();
    };
  }, [open, slot]);

  if (screen.kind !== "survivor" || !st) return null;

  const tiles = tilesFor(st.tab, st.owned);
  const pickers = TAB_PICKERS[st.tab];
  const tc = tabColour(st);
  const resolved = resolveLook(st.draft, 1);
  const inGame = tc.key === "skin" ? resolved.colours.skin : resolved.colours[tc.key];
  const busy = status.kind === "saving";
  const locked = infoLocked(st);
  const info = status.kind === "note" ? status.text : busy ? EDITOR_TEXT.saving : infoLine(st);

  // A new change clears a note that stays (the 429 line); the offline note closes the editor by itself.
  const touch = (): void => {
    if (status.kind === "note" && status.closeAtMs === null) setStatus({ kind: "idle" });
  };
  const onTile = (t: PartTile): void => {
    touch();
    setSt((s) => (s ? pick(s, t.slot, t.id) : s));
  };
  const onColour = (k: ColourKey, hex: string): void => {
    touch();
    setSt((s) => (s ? setColour(s, k, hex) : s));
  };
  const onRandom = (): void => {
    touch();
    setSt((s) => (s ? random(s) : s));
  };
  const onDone = async (): Promise<void> => {
    const cur = stRef.current;
    if (!cur || busy) return;
    const code = draftCode(cur);
    setStatus({ kind: "saving" });
    const r = await saveFromEditor(code);
    const inLobby = back?.kind === "lobby";
    if (r.kind === "saved") {
      if (inLobby) lobbyStore.setLook(r.look ?? DEFAULT_LOOK_CODE); // D3: my card changes for everyone at once
      close();
    } else if (r.kind === "offline") {
      if (inLobby) lobbyStore.setLook(code); // the room checks it against what I own
      setStatus({ kind: "note", text: EDITOR_TEXT.offline, closeAtMs: performance.now() + OFFLINE_NOTE_MS });
    } else setStatus({ kind: "note", text: EDITOR_TEXT.rateLimited, closeAtMs: null });
  };

  const onDown = (e: PointerEvent): void => {
    drag.current = { x: e.clientX, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    preview.dragAngle += (e.clientX - d.x) * DRAG_RAD_PER_PX;
    d.x = e.clientX;
  };
  const onUp = (): void => {
    drag.current = null;
  };

  return (
    <div class="menu se" role="dialog" aria-labelledby="se-title" data-testid="survivor-editor">
      <h1 id="se-title" class="se-sr">
        {EDITOR_TEXT.title}
      </h1>
      <div class="se-frame">
        <section class="se-left" aria-label="Preview">
          <header class="se-head">
            <button type="button" class="se-back" aria-label={EDITOR_TEXT.back} onClick={close}>
              <span aria-hidden="true">‹</span>
            </button>
            <span class="se-sw">
              <span class="se-sw__label">{EDITOR_TEXT.chosen}</span>
              <span class="se-sw__chip" data-testid="se-chosen" style={{ background: tc.hex }} />
            </span>
            <span class="se-sw">
              <span class="se-sw__label">{EDITOR_TEXT.inGame}</span>
              <span class="se-sw__chip" data-testid="se-ingame" style={{ background: inGame }} />
            </span>
          </header>
          <canvas
            ref={bigRef}
            class="se-big"
            role="img"
            aria-label="Your survivor, turning"
            data-testid="se-big"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <canvas ref={gameRef} class="se-game" role="img" aria-label="Your survivor at game size" data-testid="se-game" />
        </section>
        <section class="se-right">
          <div class="se-tabs" role="tablist">
            {EDITOR_TABS.map((t) => (
              <button
                key={t.slot}
                type="button"
                role="tab"
                class={`se-tab${t.slot === st.tab ? " se-tab--on" : ""}`}
                aria-selected={t.slot === st.tab}
                data-tab={t.slot}
                onClick={() => setSt((s) => (s ? setTab(s, t.slot) : s))}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div class="se-panel" role="tabpanel">
            <div class="se-tiles" data-testid="se-tiles">
              {tiles.map((t) => {
                const url = tileDraft ? partTileUrl(t.slot, t.id, tileDraft, t.state) : null;
                const worn = st.draft[t.slot] === t.id;
                const tapped = st.tapped?.slot === t.slot && st.tapped.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    class={`se-tile se-tile--${t.state}${worn ? " se-tile--worn" : ""}${tapped && t.state !== "owned" ? " se-tile--tapped" : ""}`}
                    aria-label={t.state === "owned" ? t.name : tileLine(t)}
                    aria-pressed={worn}
                    data-part={t.id}
                    data-state={t.state}
                    onClick={() => onTile(t)}
                  >
                    {url ? <img src={url} alt="" draggable={false} /> : null}
                    {t.state === "milestone" ? <span class="se-lock" aria-hidden="true" /> : null}
                    {t.state === "loot" ? (
                      <span class="se-q" aria-hidden="true">
                        ?
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p class={`se-info${locked && status.kind === "idle" ? " se-info--locked" : ""}`} role="status" data-testid="se-info">
              {locked && status.kind === "idle" ? <span class="se-lock se-lock--inline" aria-hidden="true" /> : null}
              <span class="se-info__text">{info}</span>
            </p>
            {pickers.map((k) => (
              <div class="se-colours" key={k}>
                <span class="se-colours__label">{PICKER_LABEL[k]}</span>
                <label class="se-picker" aria-label={`${PICKER_LABEL[k]}: ${EDITOR_TEXT.pickColour}`}>
                  <input type="color" value={st.draft.colours[k]} onInput={(e) => onColour(k, (e.currentTarget as HTMLInputElement).value)} />
                </label>
                <div class="se-swatches">
                  {SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      class={`se-swatch${st.draft.colours[k] === hex ? " se-swatch--on" : ""}`}
                      style={{ background: hex }}
                      aria-label={`${PICKER_LABEL[k]} ${hex}`}
                      onClick={() => onColour(k, hex)}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div class="se-actions">
              <button type="button" class="se-btn se-random" disabled={busy} onClick={onRandom}>
                {EDITOR_TEXT.random}
              </button>
              <button type="button" class="se-btn se-done" disabled={busy} aria-busy={busy} onClick={() => void onDone()}>
                {EDITOR_TEXT.done}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
