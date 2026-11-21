import { MIN_PLAYERS_TO_START } from "./messages";

/** Why the host can't start yet; `null` means Start is allowed. */
export type StartBlocker = "not_host" | "too_few" | "not_ready";

/** Anything with a Ready flag (schema `PlayerState`, lobby snapshot rows, test data). */
export interface ReadyFlag {
  readonly ready: boolean;
}

/**
 * The start rule (Story 2.3, AC 4), shared so the client's Start button and the server's
 * `run.start` check can never disagree. The phase check (lobby only) stays on the server.
 */
export function startBlocker(players: readonly ReadyFlag[], isHost: boolean, allowSolo: boolean): StartBlocker | null {
  if (!isHost) return "not_host";
  if (players.length < (allowSolo ? 1 : MIN_PLAYERS_TO_START)) return "too_few";
  if (!players.every((p) => p.ready)) return "not_ready";
  return null;
}

/** True when the host may start: everyone Ready and at least 2 players (1 with `allowSolo`). */
export function canStart(players: readonly ReadyFlag[], isHost: boolean, allowSolo: boolean): boolean {
  return startBlocker(players, isHost, allowSolo) === null;
}
