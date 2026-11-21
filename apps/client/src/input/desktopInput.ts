import type { InputRouter } from "./InputRouter";
import type { InputSource } from "./selectSource";

/** Class on `#game` in mouse mode; index.html turns it into a crosshair cursor. */
export const MOUSE_MODE_CLASS = "mouse-mode";

interface KeyLike extends Event {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

interface ClassListOwner extends EventTarget {
  classList: { toggle(name: string, force?: boolean): boolean; remove(name: string): void };
}

/** Keys typed into a text field (future name entry, chat) are not game input. */
function inTextField(e: Event): boolean {
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable === true);
}

/**
 * DOM wiring for keyboard and mouse (Story 1.10): keys by `event.code` on the window, release
 * everything on blur or when the tab hides, no context menu over the game, and the crosshair
 * cursor in mouse mode. Returns the detach function (scene shutdown).
 */
export function attachDesktopInput(router: InputRouter, win: EventTarget, doc: EventTarget & { hidden?: boolean }, gameEl: ClassListOwner | null): () => void {
  const keyDown = (ev: Event) => {
    const e = ev as KeyLike;
    if (e.ctrlKey || e.metaKey || e.altKey || inTextField(e)) return; // browser shortcuts stay the browser's
    if (router.keyDown(e.code, e.repeat)) e.preventDefault();
  };
  const keyUp = (ev: Event) => {
    if (router.keyUp((ev as KeyLike).code)) ev.preventDefault();
  };
  const release = () => router.releaseAll();
  const visibility = () => {
    if (doc.hidden) router.releaseAll();
  };
  const noMenu = (e: Event) => e.preventDefault();
  const setCursor = (source: InputSource) => gameEl?.classList.toggle(MOUSE_MODE_CLASS, source === "mouse");

  win.addEventListener("keydown", keyDown);
  win.addEventListener("keyup", keyUp);
  win.addEventListener("blur", release);
  doc.addEventListener("visibilitychange", visibility);
  gameEl?.addEventListener("contextmenu", noMenu);
  router.onSourceChange = setCursor;
  setCursor(router.source);

  return () => {
    win.removeEventListener("keydown", keyDown);
    win.removeEventListener("keyup", keyUp);
    win.removeEventListener("blur", release);
    doc.removeEventListener("visibilitychange", visibility);
    gameEl?.removeEventListener("contextmenu", noMenu);
    if (router.onSourceChange === setCursor) router.onSourceChange = null;
    gameEl?.classList.remove(MOUSE_MODE_CLASS);
  };
}
