import { TICK_RATE_HZ, type RunStateView } from "@topdown/shared";
import type { LinkSnapshot } from "../net/linkMonitor";

/**
 * Story 8.1 (AC 1, 4, 9, 10; decisions 8.1 D2, D4; brief 24: plain text, never blame): what the
 * connection overlay shows, from the link status, the room state and the clock. Pure (tested).
 */
export const CONNECTION_TEXT = {
  reconnecting: "Connection lost, reconnecting…",
  seatKept: "Your seat is kept. You'll rejoin at the next build phase",
  paused: "Paused: nobody connected",
  leave: "Leave",
} as const;

/** Seconds a dropped seat is held (server `HOLD_S`, Epic 8 D1). */
export const HOLD_S = 120;

export interface HeldChip {
  readonly slot: number;
  readonly name: string;
  /** "Bo · reconnecting 1:43" */
  readonly text: string;
}

export interface ConnectionView {
  /** The full-screen (dimmed, picture frozen) panel, or none. */
  readonly screen: "none" | "reconnecting" | "seat_kept" | "paused";
  /** The panel's line (with the countdown for reconnecting). */
  readonly line: string;
  /** The 3-2-1 after a freeze (0 = none). */
  readonly resumeIn: number;
  /** Teammates on hold (grey chips), slot order. */
  readonly chips: readonly HeldChip[];
}

/** m:ss, never negative. */
export function clock(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function connectionView(link: LinkSnapshot, state: RunStateView | null | undefined, localPlayerId: string | null, nowMs: number): ConnectionView {
  const chips: HeldChip[] = [];
  const inRun = !!state && (state.phase === "build" || state.phase === "wave" || state.phase === "vote" || state.phase === "extract"); // Story 12.2
  if (state && inRun) {
    state.players.forEach((p, id) => {
      if (id === localPlayerId || !(p.heldUntilTick > 0)) return;
      chips.push({ slot: p.slot, name: p.name, text: `${p.name} · reconnecting ${clock((p.heldUntilTick - state.tick) / TICK_RATE_HZ)}` });
    });
    chips.sort((a, b) => a.slot - b.slot);
  }
  if (link.status === "reconnecting") {
    return { screen: "reconnecting", line: `${CONNECTION_TEXT.reconnecting} ${clock(HOLD_S - (nowMs - link.sinceMs) / 1000)}`, resumeIn: 0, chips };
  }
  if (link.status === "seat_kept") return { screen: "seat_kept", line: CONNECTION_TEXT.seatKept, resumeIn: 0, chips: [] };
  if (state && inRun && state.frozen) {
    return { screen: "paused", line: CONNECTION_TEXT.paused, resumeIn: state.resumeIn, chips };
  }
  return { screen: "none", line: "", resumeIn: 0, chips };
}

/** "Bo is back" (AC 1): ids held in `before` and present (not held) now. */
export function returnedIds(before: ReadonlySet<string>, state: RunStateView | null | undefined): string[] {
  const out: string[] = [];
  if (!state) return out;
  for (const id of before) {
    const p = state.players.get(id);
    if (p && !(p.heldUntilTick > 0)) out.push(id);
  }
  return out;
}

/**
 * Story 8.1: the Leave button's rect (CSS px) on the reconnecting / seat-kept panel: bottom right
 * inside the safe area (clear of the survivor at the centre and of the move-stick half; the HUD
 * layout test checks it at 568 × 320 and 640 × 360). The component uses the same numbers.
 */
export const LEAVE_W = 160;
export const LEAVE_H = 48;
export const LEAVE_MARGIN = 16;
export function leaveRect(w: number, h: number, insetRight: number, insetBottom: number): { x: number; y: number; w: number; h: number } {
  return { x: w - insetRight - LEAVE_MARGIN - LEAVE_W, y: h - insetBottom - LEAVE_MARGIN - LEAVE_H, w: LEAVE_W, h: LEAVE_H };
}

/**
 * Story 8.1: the held chips' box (CSS px): top left under the money line. overlay.css `.held-chips`
 * (top, left offset after the safe-area inset, max-width) and `.held-chip` (height) must say the same
 * (tools/checks/heldChipsCss.test.ts); the HUD layout test places this box.
 */
export const HELD_CHIPS = { topPx: 86, leftPx: 16, maxWidthPx: 170, rowPx: 20 } as const;
