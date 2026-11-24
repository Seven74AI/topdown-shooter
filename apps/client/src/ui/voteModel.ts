import { VOTE_EXTRACT, VOTE_NONE, VOTE_STAY, voteOutcome, type EvacChoice } from "@topdown/shared";

/**
 * Story 6.11 (look EX1; F1–F4): the evacuation vote panel's state, pure. The Game scene feeds it the
 * server's truth every frame (phase, ticks left, each player's `vote`) and my taps; the Preact
 * `EvacVote` overlay draws it. My tap is shown at once (pending, the `readyRequest.ts` pattern)
 * until the server's `vote` agrees or `VOTE_PENDING_MS` passes (a dropped message: the server wins).
 */
export const VOTE_PENDING_MS = 1500;

export interface VoteChip {
  readonly slot: number;
  /** 0 none, 1 extract, 2 stay (mine: the pending choice when one is in flight). */
  readonly vote: number;
  /** Downed or out: drawn dimmed, still votes (F1). */
  readonly dimmed: boolean;
  readonly mine: boolean;
}

export interface VoteView {
  readonly open: boolean;
  /** 0–1: the ring's remaining part, from the server's ticks (F4: never the phone's own clock). */
  readonly ringFrac: number;
  /** Whole seconds left (ceil), for the ring's number. */
  readonly secondsLeft: number;
  readonly chips: readonly VoteChip[];
  /** My shown choice (pending or confirmed); 0 = none. */
  readonly mine: number;
  /** My choice is not confirmed by the server yet. */
  readonly pending: boolean;
  /** Everyone voted: the result line ("EXTRACT · 3 – 1") during the hold beat; "" otherwise. */
  readonly result: string;
}

export const CLOSED_VOTE: VoteView = { open: false, ringFrac: 0, secondsLeft: 0, chips: [], mine: VOTE_NONE, pending: false, result: "" };

export interface VotePlayerIn {
  readonly slot: number;
  readonly vote: number;
  readonly standing: boolean;
  readonly mine: boolean;
}

/** The pending part of my vote (one per device). */
export class VoteRequest {
  private pending = VOTE_NONE;
  private pendingAtMs = 0;
  private openKey = -1;

  /** Call once per frame; returns my shown vote. `voteKey` changes when a new vote opens (e.g. the wave number). */
  update(voteKey: number, serverVote: number, nowMs: number): number {
    if (voteKey !== this.openKey) {
      this.openKey = voteKey;
      this.pending = VOTE_NONE; // a new vote: the server cleared every vote
    }
    if (this.pending !== VOTE_NONE && (this.pending === serverVote || nowMs - this.pendingAtMs > VOTE_PENDING_MS)) this.pending = VOTE_NONE;
    return this.pending !== VOTE_NONE ? this.pending : serverVote;
  }

  isPending(): boolean {
    return this.pending !== VOTE_NONE;
  }

  /** A tap: latches the choice (brief 30: the payload is fixed on the tap frame) and returns it to send. */
  tap(choice: EvacChoice, nowMs: number): EvacChoice {
    this.pending = choice === "stay" ? VOTE_STAY : VOTE_EXTRACT;
    this.pendingAtMs = nowMs;
    return choice;
  }

  reset(): void {
    this.pending = VOTE_NONE;
    this.openKey = -1;
  }
}

/** Story 6.11 (EX1): "EXTRACT · 3 – 1" (choice, then extract – stay counts; silent players count as Extract, F3). */
export function voteResultLine(players: readonly VotePlayerIn[], mineShown: number): string {
  let stay = 0;
  let extract = 0;
  for (const p of players) {
    const v = p.mine ? mineShown : p.vote;
    if (v === VOTE_STAY) stay++;
    else extract++;
  }
  return `${voteOutcome(stay, players.length) === "stay" ? "STAY" : "EXTRACT"} · ${extract} – ${stay}`;
}

/** The panel from the server's truth and my shown vote. Pure; allocates (the vote shows for ≤ 15 s on a cleared map). */
export function voteView(open: boolean, ticksLeft: number, totalTicks: number, tickRateHz: number, players: readonly VotePlayerIn[], mineShown: number, pending: boolean): VoteView {
  if (!open) return CLOSED_VOTE;
  const sorted = [...players].sort((a, b) => a.slot - b.slot);
  const chips = sorted.map((p) => ({ slot: p.slot, vote: p.mine ? mineShown : p.vote, dimmed: !p.standing, mine: p.mine }));
  const allIn = chips.length > 0 && chips.every((c) => c.vote !== VOTE_NONE);
  const left = Math.max(0, ticksLeft);
  return {
    open,
    ringFrac: totalTicks > 0 ? Math.min(1, left / totalTicks) : 0,
    secondsLeft: Math.ceil(left / tickRateHz),
    chips,
    mine: mineShown,
    pending,
    result: allIn && !pending ? voteResultLine(sorted, mineShown) : "",
  };
}

type Listener = (v: VoteView) => void;

/** The tiny store between the Game scene (writes on change) and `EvacVote` (renders). */
class VoteStore {
  private view: VoteView = CLOSED_VOTE;
  private key = "";
  private readonly listeners = new Set<Listener>();
  private onTap: ((choice: EvacChoice) => void) | null = null;

  get(): VoteView {
    return this.view;
  }

  /** Publishes when something visible changed (the ring's seconds, chips, result): not every frame. */
  set(view: VoteView): void {
    const key = view.open ? `${view.secondsLeft}|${Math.round(view.ringFrac * 60)}|${view.mine}|${view.pending}|${view.result}|${view.chips.map((c) => `${c.slot}${c.vote}${c.dimmed ? 1 : 0}`).join(",")}` : "closed";
    if (key === this.key) return;
    this.key = key;
    this.view = view;
    for (const l of this.listeners) l(view);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  handle(fn: ((choice: EvacChoice) => void) | null): void {
    this.onTap = fn;
  }

  tap(choice: EvacChoice): void {
    this.onTap?.(choice);
  }
}

export const voteStore = new VoteStore();

/** Story 6.11 (EX1) layout in CSS px — `overlay.css › .evac__*` uses the same numbers. */
export const VOTE_BTN_W = 140;
export const VOTE_BTN_H = 56;
export const VOTE_RING_PX = 48;
export const VOTE_ROW_GAP = 24;
export const VOTE_BOTTOM_MIN = 14;

export interface VoteLayout {
  readonly extract: { x: number; y: number; w: number; h: number };
  readonly stay: { x: number; y: number; w: number; h: number };
}

/** The two buttons, centred on the screen's middle line with the ring between them, above the bottom inset. */
export function layoutEvacVote(w: number, h: number, insetBottom: number): VoteLayout {
  const y = h - Math.max(VOTE_BOTTOM_MIN, insetBottom) - VOTE_BTN_H;
  const half = VOTE_RING_PX / 2 + VOTE_ROW_GAP;
  return {
    extract: { x: w / 2 - half - VOTE_BTN_W, y, w: VOTE_BTN_W, h: VOTE_BTN_H },
    stay: { x: w / 2 + half, y, w: VOTE_BTN_W, h: VOTE_BTN_H },
  };
}
