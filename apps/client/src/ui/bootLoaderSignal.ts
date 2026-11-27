/**
 * Story 10.4 (B6): main.ts's two signals to the loading screen (`boot/bootLoader.js`, inline in index.html): "Drawing the
 * city…" once the game's code runs, and gone at the first screen (the start screen, a lobby, or a `?solo` run), after
 * two frames so that screen has painted under it. Never waits for anything: the loading screen takes no touches.
 */
interface BootLoader {
  phase?: (name: "draw") => void;
  hide?: () => void;
}

interface Screens {
  subscribe(listener: () => void): () => void;
}

export function signalBootLoader(screens: Screens, w: { __bootLoader?: BootLoader; requestAnimationFrame(cb: () => void): unknown } = globalThis as never): void {
  const loader = w.__bootLoader;
  if (!loader) return;
  loader.phase?.("draw");
  const off = screens.subscribe(() => {
    off();
    w.requestAnimationFrame(() => w.requestAnimationFrame(() => loader.hide?.()));
  });
}
