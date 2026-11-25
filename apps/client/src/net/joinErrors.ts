/**
 * Player text for a failed create/join (Story 2.1; Story 2.3 reuses it). Short and plain
 * (architecture › Error Handling). Server refusals arrive as an SDK `MatchMakeError` whose
 * `message` is the `JoinRefusal` reason; Colyseus' own 522 errors are told apart by message.
 */
export const JOIN_ERROR_TEXT = {
  balanceMismatch: "Please refresh",
  /** Story 8.10 (D5): the server's wire format changed (a tab left open across a deploy). */
  updateRequired: "A new version is out. Please reload.",
  notFound: "Game not found",
  full: "This game is full",
  started: "This game has already started",
  rateLimited: "Too many games created, try again in a minute",
  unreachable: "Can't reach the server",
  invalid: "Check your name and try again",
  /** Same guest token already in the room: this device joined in another tab (Story 2.3). */
  alreadyJoined: "You're already in this game",
  unknown: "Something went wrong, try again",
} as const;

/** Colyseus "invalid room id" (not found, or locked when full). */
const INVALID_ROOM_ID = 522;
/** Gateway/proxy errors (Vite proxy or Caddy with the game server down) and shutdown. */
/** 404/405: a static host with no game server (e.g. the GitHub Pages build). */
const UNREACHABLE_STATUS = new Set([404, 405, 502, 503, 504]);

export function joinErrorText(err: unknown): string {
  if (typeof err !== "object" || err === null) return JOIN_ERROR_TEXT.unreachable;
  const code = (err as { code?: unknown }).code;
  const message = String((err as { message?: unknown }).message ?? "");
  if (typeof code !== "number") return JOIN_ERROR_TEXT.unreachable; // fetch/WebSocket failure
  switch (message) {
    case "balance_mismatch":
      return JOIN_ERROR_TEXT.balanceMismatch;
    case "update_required":
      return JOIN_ERROR_TEXT.updateRequired;
    case "run_started":
      return JOIN_ERROR_TEXT.started;
    case "rate_limited":
      return JOIN_ERROR_TEXT.rateLimited;
    case "invalid_options":
      return JOIN_ERROR_TEXT.invalid;
    case "already_joined":
      return JOIN_ERROR_TEXT.alreadyJoined;
  }
  if (code === INVALID_ROOM_ID && /not found/i.test(message)) return JOIN_ERROR_TEXT.notFound;
  if (code === INVALID_ROOM_ID && /locked/i.test(message)) return JOIN_ERROR_TEXT.full;
  if (UNREACHABLE_STATUS.has(code)) return JOIN_ERROR_TEXT.unreachable;
  return JOIN_ERROR_TEXT.unknown;
}

/** The balance mismatch and update texts come with a Refresh button. */
export function needsRefresh(text: string | undefined): boolean {
  return text === JOIN_ERROR_TEXT.balanceMismatch || text === JOIN_ERROR_TEXT.updateRequired;
}
