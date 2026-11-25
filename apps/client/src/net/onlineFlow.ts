import { RUN_ENDINGS, TICK_DT_S, type RunEnding, type RunPhase, type RunStateView } from "@topdown/shared";
import { dawnEndsAt } from "../ui/dawnModel";

const TICK_MS = TICK_DT_S * 1000;
/** Re-review 2: no dawn for a Results patch processed less than this after the page became visible (ms). */
export const SHOWN_GRACE_MS = 1000;
/**
 * Story 6.14 (6.11 RR3-L1): slack (ms) for the vote's real-time length check. The vote lasts at least
 * the 1 s all-voted hold of server time; a live client sees about that much time pass between the
 * vote and Results patches, a backlog burst after an unlock sees ~0.
 */
export const VOTE_SEEN_SLACK_MS = 500;
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
  /** Story 7.2 review N1: this phone's slot (the Results "YOU" row), or undefined before `run.joined`. */
  mySlot?(): number | undefined;
  /** The room's `RunInbox` (kept by the lobby store for the room's lifetime). */
  inbox(): RunInbox | null;
  /** Story 6.11: the dawn's length (`waves.json › evac.dawnS`) and the clock (default `performance.now`). */
  readonly dawnS: number;
  nowMs?(): number;
  /**
   * Re-review 2 (RR2-M1): the page state when the Results patch is processed — hidden now, and when
   * it last became visible (the clock above; −∞ if it never was hidden). Defaults: visible, never hidden.
   */
  pageHidden?(): boolean;
  lastShownMs?(): number;
  readonly ui: {
    set(screen: UiScreen): void;
    request<K extends keyof UiRequests>(name: K, ...args: Parameters<UiRequests[K]>): void;
  };
}

/** Story 6.11: the room's `resultEnding` as a `RunEnding` (anything unknown, e.g. an older server: "wiped"). */
export function endingOf(raw: string | undefined): RunEnding {
  return (RUN_ENDINGS as readonly string[]).includes(raw ?? "") && raw !== "none" ? (raw as RunEnding) : "wiped";
}

/**
 * Results from the room state: the wave reached (at least 1), how the run ended (Story 6.11:
 * `resultEnding`; 6.12: `endless`), kills and money earned per player, by slot, and the run seed (Story 4.4).
 */
export function resultsFromState(state: RunStateView): { wave: number; ending: RunEnding; endless: boolean; rows: ResultRow[]; seed: number } {
  const rows: ResultRow[] = [];
  state.players.forEach((p) => rows.push({ slot: p.slot, name: p.name, kills: p.kills, earned: p.earned }));
  rows.sort((a, b) => a.slot - b.slot);
  return { wave: Math.max(1, state.resultWave), ending: endingOf(state.resultEnding), endless: state.endless === true, rows, seed: state.runSeed ?? 0 };
}

/**
 * The online run cycle of one room (Stories 2.4 and 2.8), driven by `phase`:
 *
 * - `build`, `wave` or (Story 6.11) `vote` (Story 3.1: a run starts in its build phase, then alternates wave ↔ build)
 *   with no session yet: a fresh `NetSession` → `startOnline` (the Game scene runs the fight). Later
 *   build ↔ wave changes keep that session (the scene runs the whole run). Every start in the same
 *   room gets its own session, so the second run never reuses the first one's host.
 * - `results`: the Results screen with Back to lobby (state-driven, so a late joiner of the
 *   screen sees the same table). Story 6.11: an Extract seen live (the previous phase was the
 *   vote) plays the 4 s dawn first; a late scene start or a woken tab past the dawn goes straight
 *   to the card (`dawnModel.ts`).
 * - `lobby` (after Results): the session is released (the Game scene's dispose then leaves nothing),
 *   the inbox drops the old run's buffered batches, the Game scene stops (`backToLobby`) and the
 *   lobby screen shows. The room is never left.
 */
export function createOnlinePhaseHandler(deps: OnlineFlowDeps): (phase: RunPhase) => void {
  let session: NetSession | null = null;
  let prev: RunPhase = "lobby";
  // Review M2: the smallest (arrival ms − server tick × tick ms) seen on recent phase patches. A
  // patch delivered late (a frozen tab's backlog) has a larger value, so the minimum keeps a live
  // sample; estimated server tick now = (now − minOffset) / tick ms. Re-review RL1: only since the
  // last wave start (dropped server ticks during a long run would make a run-long minimum run ahead);
  // RL2: also reset when a new run is seen without its lobby patch (the tick restarts at 0).
  let minOffsetMs = Number.POSITIVE_INFINITY;
  // Story 6.14 (RR3-L1): when (client clock) and at which server tick the vote phase was first seen.
  let voteSeenAtMs = Number.NEGATIVE_INFINITY;
  let voteTick = 0;
  return (phase) => {
    const last = prev;
    prev = phase;
    const now = deps.nowMs ? deps.nowMs() : performance.now();
    const inRun = (p: RunPhase): boolean => p === "build" || p === "wave" || p === "vote";
    const newRun = inRun(phase) && !(session && inRun(last));
    if (phase === "lobby" || newRun || (phase === "wave" && last !== "wave")) minOffsetMs = Number.POSITIVE_INFINITY;
    if (phase !== "lobby") minOffsetMs = Math.min(minOffsetMs, now - deps.state().tick * TICK_MS);
    if (phase === "vote" && last !== "vote") {
      voteSeenAtMs = now;
      voteTick = deps.state().tick;
    }
    if (phase === "build" || phase === "wave" || phase === "vote") {
      if (session && (last === "build" || last === "wave" || last === "vote")) return; // build ↔ wave ↔ vote inside the same run
      session?.release(); // a new run seen without its lobby patch (e.g. under `?lag`): drop the old one
      session = deps.makeSession();
      activeRun.set(session);
      if (session) deps.ui.request("startOnline", session);
    } else if (phase === "results") {
      const st = deps.state();
      const r = resultsFromState(st);
      // Review M2 (AC 10): the dawn runs from the EXTRACT tick (the Results patch's tick, the same
      // server tick), never from when the patch was processed: a page that slept past it gets the card.
      const ageMs = Math.max(0, now - minOffsetMs - st.tick * TICK_MS);
      // Re-review 2 (RR2-M1, RR2-L1): judged at the moment this patch is processed — no dawn while the
      // page is hidden, or within SHOWN_GRACE_MS of it becoming visible (a frozen tab runs its queued
      // socket messages around the time it comes back, even before `visibilitychange`). A tab switch
      // earlier in the vote doesn't matter.
      const hiddenNow = deps.pageHidden ? deps.pageHidden() : false;
      const shownAt = deps.lastShownMs ? deps.lastShownMs() : Number.NEGATIVE_INFINITY;
      const justShown = now - shownAt < SHOWN_GRACE_MS;
      // Story 6.14 (RR3-L1): the vote → Results patches must be seen about as far apart as the server
      // ticks between them (a backlog that lands > 1 s after an unlock has every sample equally late,
      // so its age reads 0, but the two patches arrive together).
      const sawVoteRun = now - voteSeenAtMs >= (st.tick - voteTick) * TICK_MS - VOTE_SEEN_SLACK_MS;
      const live = last === "vote" && ageMs < deps.dawnS * 1000 && !hiddenNow && !justShown && sawVoteRun;
      const mySlot = deps.mySlot?.();
      deps.ui.set({ kind: "results", ...r, online: true, dawnEndsAtMs: dawnEndsAt(r.ending, live, live ? now - ageMs : now, deps.dawnS), ...(mySlot === undefined ? {} : { mySlot }) });
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
