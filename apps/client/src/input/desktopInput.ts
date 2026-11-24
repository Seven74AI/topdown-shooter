import type { InputRouter } from "./InputRouter";
import { letterAction } from "./keyMap";
import type { InputSource } from "./selectSource";

/** Class on `#game` in mouse mode; index.html turns it into a crosshair cursor. */
export const MOUSE_MODE_CLASS = "mouse-mode";

interface KeyLike extends Event {
  code: string;
  key?: string;
  shiftKey?: boolean;
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
 * Story 5.23 (review M1): a focused DOM control (a menu / shop / results button, a link, a select):
 * Space and Enter belong to it, so the building keys (Space place, R, 1–7) neither act nor prevent
 * its default there. Movement, Q, E and Esc keep working as before.
 */
function onDomControl(e: Event): boolean {
  const t = e.target as { tagName?: string; getAttribute?: (n: string) => string | null } | null;
  if (!t || typeof t.tagName !== "string") return false;
  const tag = t.tagName;
  if (tag === "BUTTON" || tag === "SELECT" || tag === "A") return true;
  return typeof t.getAttribute === "function" && t.getAttribute("role") === "button";
}

/** Story 5.23: the building keys a focused DOM control keeps (review M1). */
const CONTROL_KEEPS = new Set(["place", "rotate", "build"]);

/** Story 5.23 (review L10): the layout's letter, or — for a non-Latin layout (Russian, Greek) — the US letter at that key. */
function latinLetter(key: string | undefined, code: string): string | undefined {
  if (key === undefined || key.length !== 1 || key.charCodeAt(0) < 128) return key; // no key, a named key ("Escape") or Latin
  return code.length === 4 && code.startsWith("Key") ? code.charAt(3).toLowerCase() : key;
}

/**
 * DOM wiring for keyboard and mouse (Story 1.10): keys by `event.code` on the window, release
 * everything on blur or when the tab hides, no context menu over the game, and the crosshair
 * cursor in mouse mode. Returns the detach function (scene shutdown).
 */
export function attachDesktopInput(router: InputRouter, win: EventTarget, doc: EventTarget & { hidden?: boolean }, gameEl: ClassListOwner | null): () => void {
  const keyDown = (ev: Event) => {
    const e = ev as KeyLike;
    if (inTextField(e)) return;
    const letter = latinLetter(e.key, e.code);
    if (e.ctrlKey || e.metaKey || e.altKey) {
      // Story 5.23 (D15): Ctrl/Cmd + the layout's letter Z is the game's undo (AZERTY too); every other shortcut stays the browser's.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey !== true && !e.repeat && (letter === "z" || letter === "Z")) {
        router.kbm.pressUndo();
        e.preventDefault();
      }
      return;
    }
    const action = letterAction(e.code, letter);
    if (action !== undefined && CONTROL_KEEPS.has(action) && onDomControl(e)) return; // review M1: the button's own Space / Enter
    if (router.keyDown(e.code, e.repeat, letter)) e.preventDefault();
  };
  const keyUp = (ev: Event) => {
    const code = (ev as KeyLike).code;
    // macOS sends no keyup for keys released while Cmd is held: drop everything when Cmd lifts.
    if (code === "MetaLeft" || code === "MetaRight") {
      router.releaseAll();
      return;
    }
    if (router.keyUp(code)) ev.preventDefault();
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
