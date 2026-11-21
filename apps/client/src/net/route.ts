import { normalizeRoomCode } from "@topdown/shared";

/** `/j/<code>`, any case, optional trailing slash (Story 2.3; Caddy serves the page there, 2.2). */
const JOIN_PATH_RE = /^\/j\/([a-z]+)\/?$/i;

/**
 * The room code in a share-link path, normalized (uppercase), or null for any other path. The
 * code may still fail `isRoomCode`; the start screen then shows "Game not found" on Join.
 */
export function parseJoinPath(pathname: string): string | null {
  const m = JOIN_PATH_RE.exec(pathname);
  return m?.[1] ? normalizeRoomCode(m[1]) : null;
}
