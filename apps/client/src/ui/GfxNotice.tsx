import { useEffect, useState } from "preact/hooks";
import { gfxStatus, type GfxNotice as Notice } from "../render/gfx/gfxStatus";

/**
 * Story 4.13: the graphics notice. "Graphics were reset — tap to reload" (the WebGL context never
 * came back) covers the screen and reloads the page on tap; "Graphics acceleration is off" (Canvas
 * renderer) is a small banner with OK.
 */
export function GfxNotice() {
  const [notice, setNotice] = useState<Notice | null>(gfxStatus.getNotice());
  useEffect(() => gfxStatus.subscribe(setNotice), []);
  if (notice === null) return null;
  if (notice.action === "reload") {
    return (
      <div class="game-over gfx-notice gfx-notice--reset" role="alertdialog" aria-labelledby="gfx-notice-text" onClick={() => location.reload()}>
        <p id="gfx-notice-text">{notice.text}</p>
        <button type="button" class="btn">
          Reload
        </button>
      </div>
    );
  }
  return (
    <div class="gfx-notice gfx-notice--banner" role="status">
      <span>{notice.text}</span>
      <button type="button" class="btn btn--small" onClick={() => gfxStatus.showNotice(null)}>
        OK
      </button>
    </div>
  );
}
