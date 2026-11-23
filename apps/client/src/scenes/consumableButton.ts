/**
 * Story 5.12 (AC 1, 7): the consumable button's rules, pure (unit-tested; the HUD and GameScene only
 * call these).
 *
 * - **Visible** with a non-empty slot, my survivor standing, a run on screen, and neither placement
 *   mode (5.15: the hand cluster owns the right thumb), the shop nor the menu open.
 * - **Usable** (else greyed, a tap does nothing): the medkit below max HP in a build or wave phase;
 *   a throwable in a wave phase (D3).
 * - **Pending (brief 14):** a tap (or E) is sent only when usable and not pending; then the button
 *   dims and ignores taps until the synced slot changes (the count drops or the item changes: the
 *   server used it) or `timeoutMs` passes (the server refused or ignored it). No optimistic use:
 *   lag never shows a throw that did not happen.
 */
export interface ConsumablePending {
  active: boolean;
  atMs: number;
  item: string | null;
  count: number;
}

export const createConsumablePending = (): ConsumablePending => ({ active: false, atMs: 0, item: null, count: 0 });

/** AC 7: pending ends after this without a state change (the server refused / ignored the use). */
export const CONSUMABLE_PENDING_TIMEOUT_MS = 1000;

export type ConsumableKindLike = "heal" | "grenade" | "molotov";

export interface ConsumableButtonInput {
  item: string | null;
  count: number;
  kind: ConsumableKindLike | null;
  alive: boolean;
  running: boolean;
  placement: boolean;
  shopOpen: boolean;
  menuOpen: boolean;
  phase: string;
  hp: number;
  maxHp: number;
}

export function consumableVisible(s: Readonly<ConsumableButtonInput>): boolean {
  return s.item !== null && s.count > 0 && s.alive && s.running && !s.placement && !s.shopOpen && !s.menuOpen;
}

export function consumableUsable(s: Readonly<ConsumableButtonInput>): boolean {
  if (!consumableVisible(s) || s.kind === null) return false;
  if (s.kind === "heal") return (s.phase === "build" || s.phase === "wave") && s.hp < s.maxHp;
  return s.phase === "wave";
}

/** Ends a pending use when the synced slot moved or the timeout passed. Call every frame. */
export function updateConsumablePending(p: ConsumablePending, nowMs: number, item: string | null, count: number, timeoutMs = CONSUMABLE_PENDING_TIMEOUT_MS): void {
  if (!p.active) return;
  if (item !== p.item || count !== p.count || nowMs - p.atMs >= timeoutMs) p.active = false;
}

/** A tap / E press: true = send the edge flag (and start pending); false = ignored. */
export function tapConsumable(p: ConsumablePending, nowMs: number, s: Readonly<ConsumableButtonInput>): boolean {
  if (p.active || !consumableUsable(s)) return false;
  p.active = true;
  p.atMs = nowMs;
  p.item = s.item;
  p.count = s.count;
  return true;
}
