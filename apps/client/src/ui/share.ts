/**
 * The invite link for a room code, on the page's own origin and base path (Caddy serves
 * `/j/<code>`, Story 2.2; the build's BASE_URL is "/" there, a subpath on GitHub Pages).
 */
export function shareLink(code: string, origin: string = location.origin, base: string = import.meta.env.BASE_URL ?? "/"): string {
  return `${origin}${base.endsWith("/") ? base : `${base}/`}j/${code}`;
}

/** The browser APIs `share()` uses (injected in tests). */
export interface ShareApis {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** Copies the invite link. */
export async function copyLink(code: string, origin: string = location.origin, apis: ShareApis = navigator): Promise<boolean> {
  if (!apis.clipboard) return false;
  try {
    await apis.clipboard.writeText(shareLink(code, origin));
    return true;
  } catch {
    return false;
  }
}

/** Opens the share sheet (Web Share API) where available, else copies the link ("Link copied"). */
export async function share(code: string, origin: string = location.origin, apis: ShareApis = navigator): Promise<ShareResult> {
  const url = shareLink(code, origin);
  if (typeof apis.share === "function") {
    try {
      await apis.share({ title: "Join my game", text: `Join my game: code ${code}`, url });
      return "shared";
    } catch (e) {
      if ((e as { name?: unknown }).name === "AbortError") return "cancelled";
      // Share refused (e.g. not allowed here): fall back to copying.
    }
  }
  return (await copyLink(code, origin, apis)) ? "copied" : "failed";
}
