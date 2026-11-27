/**
 * Story 10.4 (B6): main.ts's two signals to the loading screen (`boot/bootLoader.js`, inline in index.html): "Drawing the
 * city…" once the game's code runs, and gone at the first screen (the start screen, a lobby, or a `?solo` run), after
 * two frames so that screen has painted under it (also when the inline script never ran: review M1). Never waits for anything: the loading screen takes no touches.
 */
interface BootLoader {
  phase?: (name: "draw") => void;
  hide?: () => void;
}

interface Screens {
  subscribe(listener: () => void): () => void;
}

interface Page {
  __bootLoader?: BootLoader;
  document?: { getElementById(id: string): { remove(): void } | null };
  requestAnimationFrame(cb: () => void): unknown;
}

export function signalBootLoader(screens: Screens, w: Page = globalThis as never): void {
  // Review M1: the inline script didn't run (blocked by a CSP, say): still take the overlay away at the first screen.
  const loader: BootLoader = w.__bootLoader ?? { hide: () => w.document?.getElementById("boot-loader")?.remove() };
  loader.phase?.("draw");
  const off = screens.subscribe(() => {
    off();
    w.requestAnimationFrame(() => w.requestAnimationFrame(() => loader.hide?.()));
  });
}
