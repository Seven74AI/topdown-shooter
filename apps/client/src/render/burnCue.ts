import type { SimEvent } from "@topdown/shared";
import { FIRE_CUE_MS, isAcidHit, isFireHit, type FireCue } from "./fireCue";

/**
 * Story 4.11: the burning-survivor cues (designer: all four), pure parts. Everything is driven by
 * the server's fire-damage events (`player.damaged` with no zombie source; solo: the same events):
 * every player's survivor shows flames, smoke and embers while `FireCue.burning`; MY survivor also
 * gets an orange pulsing screen-edge glow and a "-N" per fire hit (N = the event's amount, rounded
 * up like the HP display, Story 3.7's ceil rule).
 */

/** "-N" pops: at most this many at once (the oldest is reused), their life and rise. */
export const FIRE_POP_POOL = 6;
export const FIRE_POP_MS = 900;
export const FIRE_POP_RISE_PX = 28;
/** Most fire hits queued for the HUD in one frame (more in one frame — a woken tab — are dropped). */
export const FIRE_HIT_QUEUE = 4;
/** Screen-edge glow alpha: low point and peak of the pulse while burning. */
export const EDGE_GLOW_MIN = 0.22;
export const EDGE_GLOW_MAX = 0.55;

const labels = new Map<number, string>();

/** "-5" for an amount of 5 (4.2 → "-5": ceil, like the HP text). Cached: no string per hit. */
export function fireDamageLabel(amount: number): string {
  const n = Math.max(0, Math.ceil(amount - 1e-9));
  let s = labels.get(n);
  if (s === undefined) {
    s = `-${n}`;
    if (labels.size < 256) labels.set(n, s);
  }
  return s;
}

/** The glow's alpha this frame: 0 when not burning, else pulsing with the damage tick (`pulseMs`). */
export function edgeGlowAlpha(burning: boolean, sinceLastHitMs: number, pulseMs: number): number {
  if (!burning) return 0;
  const ph = pulseMs > 0 ? (sinceLastHitMs % pulseMs) / pulseMs : 0;
  const kick = Math.exp(-ph * 4); // brightest right after a hit
  const fade = Math.max(0, 1 - sinceLastHitMs / FIRE_CUE_MS) * 0.3 + 0.7; // dims in the last moments
  return (EDGE_GLOW_MIN + (EDGE_GLOW_MAX - EDGE_GLOW_MIN) * kick) * fade;
}

/** The HUD's fixed queue of fire hits on MY survivor this frame (in `hudModel`). */
export interface FireHitQueue {
  readonly fireHitAmounts: Float32Array;
  /**
   * Story 5.4: per queued hit, the slot (0–3) of the TEAMMATE whose fire it was (friendly fire: the
   * "-N" shows in their ring colour), or -1 (car fire, acid, my own fire).
   */
  readonly fireHitSource: Int8Array;
  fireHitCount: number;
}

/** Story 5.4: the slot of a friendly-fire source (-1: none / not a teammate). */
export type SlotOf = (playerId: string) => number;

/**
 * One drained event: a fire hit marks that player burning (everyone's survivor shows it); a hit on
 * MY survivor also queues a "-N" for the HUD. Returns true for a fire hit.
 */
export function routeFireHit(e: SimEvent, localId: string, nowMs: number, cue: FireCue, q: FireHitQueue, slotOf?: SlotOf): boolean {
  if (!isFireHit(e)) return false;
  cue.hit(e.playerId, nowMs);
  if (e.playerId === localId && q.fireHitCount < q.fireHitAmounts.length) {
    const src = e.sourcePlayerId;
    q.fireHitSource[q.fireHitCount] = src !== null && src !== localId && slotOf ? slotOf(src) : -1;
    q.fireHitAmounts[q.fireHitCount++] = e.amount;
  }
  return true;
}

/**
 * Story 5.4 (AC 7f): the flamer's cue: when MY fire hurts a teammate, their ring flashes orange
 * (so you notice that you are the problem). Returns the hurt teammate's id, or null.
 */
export function friendlyFireVictim(e: SimEvent, localId: string): string | null {
  return e.type === "player.damaged" && e.sourcePlayerId === localId && e.playerId !== localId ? e.playerId : null;
}

/**
 * Story 5.6: the acid hurt cue — an acid hit marks that player "in acid" (`acid` cue clock); a hit
 * on MY survivor queues a "-N" like fire's (the same pop pool). Returns true for an acid hit.
 */
export function routeAcidHit(e: SimEvent, localId: string, nowMs: number, cue: FireCue, q: FireHitQueue): boolean {
  if (!isAcidHit(e)) return false;
  cue.hit(e.playerId, nowMs);
  if (e.playerId === localId && q.fireHitCount < q.fireHitAmounts.length) {
    q.fireHitSource[q.fireHitCount] = -1;
    q.fireHitAmounts[q.fireHitCount++] = e.amount;
  }
  return true;
}

/** A fixed pool of pops (screen-space "-N"): `spawn` takes a free slot, or the oldest one. */
export class PopPool {
  readonly startMs: Float64Array;
  readonly amount: Float32Array;
  private next = 0;

  /** Story 5.20: `lifeMs` (default the fire pop's 900 ms) lets the sold "+$N" use the same pool. */
  constructor(
    readonly capacity: number,
    readonly lifeMs: number = FIRE_POP_MS,
  ) {
    this.startMs = new Float64Array(capacity).fill(-Infinity);
    this.amount = new Float32Array(capacity);
  }

  /** Starts a pop; returns its slot. */
  spawn(nowMs: number, amount: number): number {
    let slot = -1;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive(i, nowMs)) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      // all busy: reuse the oldest
      slot = this.next;
      let oldest = Infinity;
      for (let i = 0; i < this.capacity; i++) {
        const t = this.startMs[i] as number;
        if (t < oldest) {
          oldest = t;
          slot = i;
        }
      }
    }
    this.startMs[slot] = nowMs;
    this.amount[slot] = amount;
    this.next = (slot + 1) % this.capacity;
    return slot;
  }

  alive(i: number, nowMs: number): boolean {
    const t = nowMs - (this.startMs[i] as number);
    return t >= 0 && t < this.lifeMs;
  }

  /** 0 → 1 over the pop's life (≥ 1 when gone). */
  progress(i: number, nowMs: number): number {
    return (nowMs - (this.startMs[i] as number)) / this.lifeMs;
  }

  clear(): void {
    this.startMs.fill(-Infinity);
    this.next = 0;
  }
}

/** At most this many survivors show the burning effects at once (the lobby's player cap). */
export const MAX_BURNING_PLAYERS = 4;
