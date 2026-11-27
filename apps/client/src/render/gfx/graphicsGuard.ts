import * as Phaser from "phaser";
import { CANVAS_MODE_TEXT, GFX_RESET_ONLINE_TEXT, GFX_RESET_TEXT, LostWatchdog, gfxStatus, rendererKind } from "./gfxStatus";
import { RebuildPhase, textureRegistry } from "./textureRegistry";
import { clientLog } from "../../debug/clientLog";

/** How often a lost context is checked against the watchdog (ms). Nothing runs while the context is fine. */
const WATCH_INTERVAL_MS = 1000;

/**
 * Story 4.13: keeps the game drawn after the browser takes the graphics away (Android Chrome loses
 * the WebGL context on every app switch).
 *
 * Phaser 4.2.1 restores a lost context by itself (`WebGLRenderer.dispatchContextRestored` re-creates
 * every GL texture / buffer / shader and emits `RESTORE_WEBGL`; the `Core.Events.CONTEXT_LOST`
 * "cannot resume" doc is from Phaser 3.19 and nothing emits it), but it re-uploads each texture from
 * its source canvas, which the phone may have emptied. So on `RESTORE_WEBGL` every generated texture
 * is redrawn from game code (`textureRegistry`). Also:
 * - a texture whose canvas looks emptied when the page comes back (no event at all) → the same rebuild;
 * - a context still lost after `RESTORE_WAIT_MS` of visible time → "Graphics were reset — tap to reload";
 * - the Canvas renderer (no WebGL at all) → a dismissible "Graphics acceleration is off" message.
 * Installed once per page; nothing runs per frame.
 */
export function installGraphicsGuard(game: Phaser.Game, isOnline: () => boolean): void {
  if (!game.renderer) {
    game.events.once(Phaser.Core.Events.BOOT, () => installGraphicsGuard(game, isOnline));
    return;
  }
  const renderer = game.renderer;
  const watchdog = new LostWatchdog();
  gfxStatus.renderer = rendererKind(renderer.type);

  // Phaser `Text` objects draw on their own canvas: redraw them too (after the textures).
  textureRegistry.register("phaser_text", RebuildPhase.text, () => redrawTexts(game));

  if (gfxStatus.renderer === "Canvas") {
    gfxStatus.showNotice({ text: CANVAS_MODE_TEXT, action: "dismiss" });
  }

  const visible = (): boolean => document.visibilityState !== "hidden";
  document.addEventListener("visibilitychange", () => {
    watchdog.visibility(performance.now(), visible());
    // Back from the background: a canvas the browser emptied without any event is redrawn now
    // (while the context is lost, the restore does it anyway).
    if (visible() && !gfxStatus.lost && !textureRegistry.allIntact()) textureRegistry.rebuildAll();
  });

  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;

  let timer: ReturnType<typeof setInterval> | null = null;
  const stopTimer = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, () => {
    gfxStatus.lost = true;
    gfxStatus.lostCount++;
    clientLog.note("webgl.lost", { count: gfxStatus.lostCount }); // Story 10.6
    watchdog.lost(performance.now(), visible());
    stopTimer();
    timer = setInterval(() => {
      if (!watchdog.expired(performance.now())) return;
      stopTimer();
      gfxStatus.showNotice({ text: isOnline() ? GFX_RESET_ONLINE_TEXT : GFX_RESET_TEXT, action: "reload" });
    }, WATCH_INTERVAL_MS);
  });

  renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
    stopTimer();
    watchdog.restored();
    gfxStatus.lost = false;
    gfxStatus.restoreCount++;
    clientLog.note("webgl.restored", { count: gfxStatus.restoreCount }); // Story 10.6
    textureRegistry.rebuildAll();
    // A late restore after the reload notice: the game is back, the notice can go.
    if (gfxStatus.getNotice()?.action === "reload") gfxStatus.showNotice(null);
  });
}

/** Redraws every Phaser `Text` in every scene (their canvases may be empty too). */
function redrawTexts(game: Phaser.Game): void {
  const visit = (objs: readonly Phaser.GameObjects.GameObject[]): void => {
    for (const o of objs) {
      if (o instanceof Phaser.GameObjects.Text) o.updateText();
      else if (o instanceof Phaser.GameObjects.Container) visit(o.list);
    }
  };
  for (const scene of game.scene.getScenes(false)) visit(scene.sys.displayList.list);
}
