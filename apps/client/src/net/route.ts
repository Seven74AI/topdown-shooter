import { normalizeRoomCode } from "@topdown/shared";

/** `j/<code>` after the build's base path, any case, optional trailing slash (Story 2.3; Caddy serves it, 2.2). */
const JOIN_PATH_RE = /^j\/([a-z]+)\/?$/i;

/**
 * The room code in a share-link path (relative to `base`, the build's BASE_URL: "/" on the VPS,
 * "/topdown-shooter/" on GitHub Pages), normalized (uppercase), or null for any other path. The code
 * may still fail `isRoomCode` (wrong length or letters): the caller shows "Game not found" for it
 * and never shortens it, so a mistyped link can't land in someone else's game.
 */
export function parseJoinPath(pathname: string, base = "/"): string | null {
  if (!pathname.startsWith(base)) return null;
  const m = JOIN_PATH_RE.exec(pathname.slice(base.length));
  return m?.[1] ? normalizeRoomCode(m[1]) : null;
}
