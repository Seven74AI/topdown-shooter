/**
 * Story 10.5 (decision 10.5-Q3 = C, designer 2026-11-27): the install hint — one Lumen line on the Results screen, at
 * most once ever, the first time a finished run reaches Results on a phone that hasn't installed the game:
 *   - Android (Chrome / Edge / Samsung: the browser fired `beforeinstallprompt`): an "Install" button opens the
 *     browser's own install sheet;
 *   - iOS (no install API): the text "Share → Add to Home Screen";
 *   - anything else (desktop, already installed, a phone browser without either): nothing, and the "once" is kept.
 * ✕ hides it; it never comes back either way (shown = used up, stored in localStorage; decision 10.5-B6).
 * Pure parts first (unit-tested); the store at the bottom holds the browser's deferred prompt.
 */
export const INSTALL_HINT_KEY = "topdown-shooter.installHint";

export const INSTALL_TEXT = {
  android: "Play Hordes like an app: add it to your home screen.",
  ios: "Play Hordes like an app: tap Share → Add to Home Screen.",
  install: "Install",
  dismiss: "Hide this tip",
} as const;

export type InstallPlatform = "android" | "ios";

export interface InstallEnv {
  /** Already running from the home screen (display-mode fullscreen / standalone, or iOS `navigator.standalone`). */
  readonly installed: boolean;
  /** A phone or tablet (coarse primary pointer). */
  readonly touch: boolean;
  /** iPhone / iPad / iPod (iPadOS reports a Mac with touch points). */
  readonly ios: boolean;
  /** The browser handed us a `beforeinstallprompt` event. */
  readonly canPrompt: boolean;
}

/** Which hint this browser gets, or null for none. */
export function installPlatform(env: InstallEnv): InstallPlatform | null {
  if (env.installed || !env.touch) return null;
  if (env.canPrompt) return "android";
  if (env.ios) return "ios";
  return null;
}

/** iOS from the user agent (iPadOS 13+ says "Macintosh" but has touch points). */
export function isIos(ua: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

/** The hint shows when this browser gets one and it was never shown before. */
export function showInstallHint(platform: InstallPlatform | null, stored: string | null): boolean {
  return platform !== null && stored !== "shown";
}

/** The browser's `BeforeInstallPromptEvent` (Chromium only; not in TypeScript's DOM types). */
export interface DeferredInstallPrompt {
  prompt(): Promise<unknown>;
}

type Listener = () => void;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // a private window or blocked site data: the hint may show again next time, nothing breaks
  }
}

/** The deferred prompt and the "once" flag. */
class InstallHintStore {
  private deferred: DeferredInstallPrompt | null = null;
  private readonly listeners = new Set<Listener>();

  /** main.ts: keep the browser's install prompt for the hint's button (no mini-infobar meanwhile). */
  capture(win: Pick<Window, "addEventListener">): void {
    win.addEventListener("beforeinstallprompt", (e: Event) => {
      e.preventDefault();
      this.deferred = e as unknown as DeferredInstallPrompt;
      this.emit();
    });
    win.addEventListener("appinstalled", () => {
      this.deferred = null;
      this.markShown();
      this.emit();
    });
  }

  /** Test hook (and the DOM check): pretend the browser offered an install prompt. */
  setDeferred(p: DeferredInstallPrompt | null): void {
    this.deferred = p;
    this.emit();
  }

  env(): InstallEnv {
    const w = globalThis as unknown as Window & { navigator: Navigator & { standalone?: boolean } };
    const mq = (q: string): boolean => typeof w.matchMedia === "function" && w.matchMedia(q).matches;
    const nav = w.navigator;
    return {
      installed: mq("(display-mode: fullscreen)") || mq("(display-mode: standalone)") || nav?.standalone === true,
      touch: mq("(pointer: coarse)"),
      ios: nav ? isIos(nav.userAgent ?? "", nav.platform ?? "", nav.maxTouchPoints ?? 0) : false,
      canPrompt: this.deferred !== null,
    };
  }

  platform(): InstallPlatform | null {
    return installPlatform(this.env());
  }

  stored(): string | null {
    try {
      return storage()?.getItem(INSTALL_HINT_KEY) ?? null;
    } catch {
      return null;
    }
  }

  markShown(): void {
    try {
      storage()?.setItem(INSTALL_HINT_KEY, "shown");
    } catch {
      // ignore: see storage()
    }
  }

  /** The Install button: the browser's own sheet; the prompt can be used once. */
  async install(): Promise<void> {
    const p = this.deferred;
    this.deferred = null;
    this.emit();
    await p?.prompt();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

export const installHintStore = new InstallHintStore();
