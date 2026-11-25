import { PING_COOLDOWN_MS, PING_KINDS } from "@topdown/shared";

/**
 * Story 8.7 (AC 3, 4): the ping wheel's state machine (pure, no layout imports: `hudModel` holds one). Layout and hit
 * tests are in `pingWheel.ts`.
 */
export const PING_WHEEL_OPEN_MS = 3000;

/** The wheel's state on this device (one object, kept by the HUD model). */
export interface PingWheelState {
  open: boolean;
  /** When it opened (clock ms): it closes `PING_WHEEL_OPEN_MS` later. */
  openedAtMs: number;
  /** No send before this (clock ms): the 1 s ring after a send (E8-P5). */
  cooldownUntilMs: number;
  /** The kind picked this frame (index into `PING_KINDS`), −1 = none; the GameScene consumes it. */
  pick: number;
}

export function newPingWheelState(): PingWheelState {
  return { open: false, openedAtMs: 0, cooldownUntilMs: Number.NEGATIVE_INFINITY, pick: -1 };
}

/** The ping button (or F): opens the wheel, or closes it when open. Ignored while the 1 s cooldown runs (AC 4). */
export function togglePingWheel(s: PingWheelState, nowMs: number): void {
  if (s.open) {
    s.open = false;
    return;
  }
  if (nowMs < s.cooldownUntilMs) return;
  s.open = true;
  s.openedAtMs = nowMs;
}

/** A chip (or 1–4 on a keyboard) while open: latches that kind for the scene to send and closes (review L3: the cooldown starts only on a real send, `markPingSent`). */
export function pickPing(s: PingWheelState, kind: number, nowMs: number): boolean {
  if (!s.open || kind < 0 || kind >= PING_KINDS.length || nowMs < s.cooldownUntilMs) return false;
  s.pick = kind;
  s.open = false;
  return true;
}

/** Story 8.7 review L3: a ping really went out: the 1.2 s cooldown ring starts. */
export function markPingSent(s: PingWheelState, nowMs: number): void {
  s.cooldownUntilMs = nowMs + PING_COOLDOWN_MS;
}

/** A tap anywhere but the wheel, Esc, or the button hiding (holding, reconnecting, out…): closes it. */
export function closePingWheel(s: PingWheelState): void {
  s.open = false;
}

/** Each frame: closes after 3 s open, or at once while the button is hidden. */
export function stepPingWheel(s: PingWheelState, nowMs: number, shown: boolean): void {
  if (s.open && (!shown || nowMs - s.openedAtMs >= PING_WHEEL_OPEN_MS)) s.open = false;
}

/** The cooldown ring's remaining share (1 → 0 over `PING_COOLDOWN_MS`; 0 = ready). */
export function pingCooldownFrac(s: PingWheelState, nowMs: number): number {
  const left = s.cooldownUntilMs - nowMs;
  return left > 0 ? Math.min(1, left / PING_COOLDOWN_MS) : 0;
}

