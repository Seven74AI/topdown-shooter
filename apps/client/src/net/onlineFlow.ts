import type { RunPhase, RunStateView } from "@topdown/shared";
import type { ResultRow, UiRequests, UiScreen } from "../ui/uiState";
import type { NetSession, RunInbox } from "./session";
import { activeRun } from "./activeRun";

/** What the phase handler needs (main.ts passes the real stores; tests pass fakes). */
export interface OnlineFlowDeps {
  /** The room code (the lobby screen shows it). */
  readonly code: string;
  /** The room's state (Results rows and wave). */
  state(): RunStateView;
  /**
   * A fresh `NetSession` for a run that just started, or null when the room isn't ready (no
   * `run.joined` yet, or the room was left). Built on the lobby store's fight room and inbox.
   */
  makeSession(): NetSession | null;
  /** The room's `RunInbox` (kept by the lobby store for the room's lifetime). */
  inbox(): RunInbox | null;
  readonly ui: {
    set(screen: UiScreen): void;
    request<K extends keyof UiRequests>(name: K, ...args: Parameters<UiRequests[K]>): void;
  };
}

/**
 * Results from the room state: the wave reached (at least 1), whether the team held out (Story
 * 3.10), and kills and money earned per player, by slot.
 */
export function resultsFromState(state: RunStateView): { wave: number; heldOut: boolean; rows: ResultRow[] } {
  const rows: ResultRow[] = [];
  state.players.forEach((p) => rows.push({ slot: p.slot, name: p.name, kills: p.kills, earned: p.earned }));
  rows.sort((a, b) => a.slot - b.slot);
  return { wave: Math.max(1, state.resultWave), heldOut: state.resultHeldOut === true, rows };
}

/**
 * The online run cycle of one room (Stories 2.4 and 2.8), driven by `phase`:
 *
 * - `build` or `wave` (Story 3.1: a run starts in its build phase, then alternates wave ↔ build)
 *   with no session yet: a fresh `NetSession` → `startOnline` (the Game scene runs the fight). Later
 *   build ↔ wave changes keep that session (the scene runs the whole run). Every start in the same
 *   room gets its own session, so the second run never reuses the first one's host.
 * - `results`: the Results screen with Back to lobby (state-driven, so a late joiner of the
 *   screen sees the same table).
 * - `lobby` (after Results): the session is released (the Game scene's dispose then leaves nothing),
 *   the inbox drops the old run's buffered batches, the Game scene stops (`backToLobby`) and the
 *   lobby screen shows. The room is never left.
 */
export function createOnlinePhaseHandler(deps: OnlineFlowDeps): (phase: RunPhase) => void {
  let session: NetSession | null = null;
  let prev: RunPhase = "lobby";
  return (phase) => {
    const last = prev;
    prev = phase;
    if (phase === "build" || phase === "wave") {
      if (session && (last === "build" || last === "wave")) return; // build ↔ wave inside the same run
      session?.release(); // a new run seen without its lobby patch (e.g. under `?lag`): drop the old one
      session = deps.makeSession();
      activeRun.set(session);
      if (session) deps.ui.request("startOnline", session);
    } else if (phase === "results") {
      deps.ui.set({ kind: "results", ...resultsFromState(deps.state()), online: true });
    } else if (phase === "lobby") {
      session?.release();
      session = null;
      activeRun.set(null);
      deps.inbox()?.reset();
      deps.ui.request("backToLobby");
      deps.ui.set({ kind: "lobby", code: deps.code });
    }
  };
}
