import { useEffect, useState } from "preact/hooks";
import { RUN_SAVED_TEXT, serverNotice } from "../net/serverNotice";
import { uiStore } from "./uiState";
import { JOIN_ERROR_TEXT } from "../net/joinErrors";

/**
 * "Server restarting. Try again in a moment." with Back to start (Story 2.2 AC 5). Drawn over
 * whatever screen is up (the game-over overlay layout); Back to start closes it.
 */
export function ServerNotice() {
  const [text, setText] = useState<string | null>(serverNotice.get());
  useEffect(() => serverNotice.subscribe(setText), []);
  if (text === null) return null;
  const back = () => {
    serverNotice.dismiss();
    uiStore.set({ kind: "start" });
  };
  return (
    // Opaque, so the start screen underneath doesn't show through the text.
    <div class="game-over" style={{ background: "#000" }} role="alertdialog" aria-labelledby="server-notice-text">
      <p id="server-notice-text">{text}</p>
      <button type="button" class="btn" onClick={back}>
        {/* Story 8.3 (AC 12): "You were removed from this run" with OK (back to the start screen too). */}
        {text === JOIN_ERROR_TEXT.removed || text === RUN_SAVED_TEXT ? "OK" : "Back to start"}
      </button>
    </div>
  );
}
