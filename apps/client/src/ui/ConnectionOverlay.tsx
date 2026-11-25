import { useEffect, useRef, useState } from "preact/hooks";
import { lobbyStore } from "../net/lobbyStore";
import { linkStore } from "../net/linkMonitor";
import { uiStore } from "./uiState";
import { CONNECTION_TEXT, LEAVE_H, LEAVE_MARGIN, LEAVE_W, connectionView, returnedIds, type ConnectionView } from "./connectionModel";

/** How often the overlay re-reads the link and the room (ms): a 1 s countdown needs no more. */
const POLL_MS = 250;
/** "Bo is back" stays this long (ms). */
const BACK_TOAST_MS = 3000;

const NONE: ConnectionView = { screen: "none", line: "", resumeIn: 0, chips: [] };

/**
 * Story 8.1 (decisions 8.1 D2, D4; AC 1, 4, 9, 10): the reconnecting panel (the picture behind is
 * frozen and dimmed: no input is sent while the link is down), "Your seat is kept…", "Paused: nobody
 * connected" with the 3-2-1, the grey "Bo · reconnecting 1:43" chips and the "Bo is back" toast.
 * Leave on the panels is the consented Leave (the seat is freed at once, brief 21).
 */
export function ConnectionOverlay() {
  const [view, setView] = useState<ConnectionView>(NONE);
  const [backToasts, setBackToasts] = useState<{ id: string; text: string; untilMs: number }[]>([]);
  const held = useRef(new Set<string>());
  useEffect(() => {
    const poll = (): void => {
      const now = performance.now();
      const room = lobbyStore.current();
      const state = room?.state;
      const me = lobbyStore.joinedInfo()?.playerId ?? null;
      const v = connectionView(linkStore.get(), state, me, now);
      setView((old) => (sameView(old, v) ? old : v));
      // "Bo is back": held before, present now.
      const back = returnedIds(held.current, state);
      held.current = new Set();
      state?.players?.forEach((p, id) => {
        if (id !== me && p.heldUntilTick > 0) held.current.add(id);
      });
      setBackToasts((list) => {
        const live = list.filter((t) => t.untilMs > now);
        for (const id of back) {
          const name = state?.players.get(id)?.name ?? "";
          live.push({ id, text: `${name} is back`, untilMs: now + BACK_TOAST_MS });
        }
        return live.length === list.length && back.length === 0 ? list : live;
      });
    };
    const t = setInterval(poll, POLL_MS);
    const off = linkStore.subscribe(poll);
    poll();
    return () => {
      clearInterval(t);
      off();
    };
  }, []);
  const leave = (): void => uiStore.request("leaveLobby");
  const panel = view.screen === "reconnecting" || view.screen === "seat_kept";
  return (
    <>
      {(view.chips.length > 0 || backToasts.length > 0) && (
        <div class="held-chips" aria-live="polite">
          {view.chips.map((c) => (
            <span key={`h${c.slot}`} class="held-chip">
              {c.text}
            </span>
          ))}
          {backToasts.map((t) => (
            <span key={`b${t.id}`} class="held-chip back">
              {t.text}
            </span>
          ))}
        </div>
      )}
      {panel && (
        <div class="link-panel" role="alertdialog" aria-labelledby="link-panel-text">
          <p id="link-panel-text">{view.line}</p>
          <button type="button" class="btn link-leave" style={{ width: `${LEAVE_W}px`, height: `${LEAVE_H}px`, right: `calc(env(safe-area-inset-right, 0px) + ${LEAVE_MARGIN}px)`, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${LEAVE_MARGIN}px)` }} onClick={leave}>
            {CONNECTION_TEXT.leave}
          </button>
        </div>
      )}
      {view.screen === "paused" && (
        <div class="link-paused" role="status">
          <p>{view.line}</p>
          {view.resumeIn > 0 && <p class="link-count">{view.resumeIn}</p>}
        </div>
      )}
    </>
  );
}

function sameView(a: ConnectionView, b: ConnectionView): boolean {
  if (a.screen !== b.screen || a.line !== b.line || a.resumeIn !== b.resumeIn || a.chips.length !== b.chips.length) return false;
  for (let i = 0; i < a.chips.length; i++) if (a.chips[i]?.text !== b.chips[i]?.text) return false;
  return true;
}
