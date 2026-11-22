import {
  TICK_DT_S,
  cooldownIdle,
  cooldownReady,
  cooldownTickEnd,
  cooldownTickStart,
  isGun,
  ticksFor,
  type Balance,
  type PlayerInput,
  type PlayerStateView,
  type WeaponId,
} from "@topdown/shared";

/** The fields of my player's latest snapshot the clock reads (Story 2.4 schema). */
export type FireGateView = Pick<
  PlayerStateView,
  "status" | "active" | "swapTicks" | "ackSeq" | "weapon0" | "weapon1" | "ammo0" | "ammo1" | "reloadTicks0" | "reloadTicks1"
>;

/** Local shots remembered per seq for predicted ammo: 64 steps = 3.2 s (the predictor's history). */
export const LOCAL_SHOT_HISTORY = 64;
const MIN_AIM = 1e-6;

/** What the last `step` that returned true attacked with (one object, reused). */
export interface LocalAttack {
  weapon: WeaponId;
  melee: boolean;
  /** Unit raw aim (the server's direction before assist and spread). */
  dirX: number;
  dirY: number;
}

/**
 * The local fire clock (Story 2.7, AC 2): decides, once per sent 50 ms input, whether my weapon
 * attacks NOW, so the muzzle flash, sound and cosmetic projectile need no round trip. It never
 * decides a hit: the server still fires its own shot from the same input.
 *
 * - Cadence: the shared cooldown rule (`combat/cooldown.ts`, the functions `firing.ts` uses) per
 *   slot, step by step, so a held trigger fires on exactly the steps the server does.
 * - Gates: alive, fire with an aim, not swapping, not reloading, and (guns) predicted ammo > 0.
 * - Swap and reload are timed by seq, because the server applies one input per tick: a snapshot
 *   with `ackSeq` A and `swapTicks`/`reloadTicks` k means the swap ends on seq A + k (the weapon
 *   can fire that step) and the reload on seq A + k (it can fire from the next one). Before the
 *   snapshot knows, my own swap tap on seq S ends on S + N, and my shot that empties the
 *   magazine on seq S starts a reload that ends on S + R. Gating on the stale snapshot alone
 *   would put every shot after a reload one RTT behind the server's (seen in the hits harness).
 * - Predicted ammo = the snapshot's ammo of the slot minus my local shots on it with
 *   `seq > ackSeq` (a ring of shots per seq), or a full magazine minus my shots after a predicted
 *   reload end. Exact while the server and the client agree on the cooldown phase; at worst one
 *   extra cosmetic shot at the end of a magazine (accepted).
 *
 * Phaser-free and SDK-free (the `tools/netsim` hits harness runs it). No allocation per step.
 */
export class LocalFireClock {
  readonly attack: LocalAttack = { weapon: "", melee: false, dirX: 1, dirY: 0 };
  private readonly cooldown = new Float64Array(2);
  private readonly cooldownWeapon: string[] = ["", ""];
  private readonly shotSeq = new Float64Array(LOCAL_SHOT_HISTORY).fill(-1);
  private readonly shotCount = new Uint8Array(LOCAL_SHOT_HISTORY);
  private readonly shotSlot = new Uint8Array(LOCAL_SHOT_HISTORY);
  private lastSeq = 0;
  /** Seq of my last swap tap that started a swap (0: none). */
  private swapSeq = 0;
  /** Per slot: seq of my local shot that emptied the magazine (0: none). */
  private readonly emptySeq = new Float64Array(2);
  private attackSlot = 0;

  constructor(private readonly balance: Balance) {}

  /**
   * One local step for the input just sent (`input.seq` increasing). `me` is my latest snapshot
   * (undefined before the first). Returns true when the weapon attacks on this step; `attack`
   * then says with what and where.
   */
  step(input: PlayerInput, me: FireGateView | undefined): boolean {
    const attacked = me ? this.decide(input, me) : false;
    const i = input.seq % LOCAL_SHOT_HISTORY;
    this.shotSeq[i] = input.seq;
    this.shotCount[i] = attacked && !this.attack.melee ? 1 : 0;
    this.shotSlot[i] = this.attackSlot;
    this.lastSeq = input.seq;
    return attacked;
  }

  /**
   * Rounds predicted in `slot` (default: the snapshot's active one) for the step after the last
   * one: the snapshot's ammo minus my unacknowledged shots, or a full magazine minus my shots
   * since a predicted reload end.
   */
  predictedAmmo(me: FireGateView, slot = me.active === 1 ? 1 : 0): number {
    const weapon = slot === 1 ? me.weapon1 : me.weapon0;
    const stats = this.balance.weapons[weapon];
    const end = this.reloadEndSeq(me, slot as 0 | 1);
    if (end > 0 && this.lastSeq + 1 > end && stats && isGun(stats)) return stats.magazine - this.shotsAfter(end, slot);
    if (end > 0) return 0;
    return (slot === 1 ? me.ammo1 : me.ammo0) - this.shotsAfter(me.ackSeq, slot);
  }

  private decide(input: PlayerInput, me: FireGateView): boolean {
    const seq = input.seq;
    const shown = me.active === 1 ? 1 : 0;
    // Swap: the snapshot's, else my own tap the server hasn't applied yet.
    if (this.swapSeq > 0 && me.ackSeq >= this.swapSeq) this.swapSeq = 0; // the snapshot knows now
    if (input.swap && this.swapSeq === 0 && me.swapTicks === 0 && me.weapon1 !== "" && me.status === "alive") this.swapSeq = seq;
    const swapEnd = me.swapTicks > 0 ? me.ackSeq + me.swapTicks : this.swapSeq > 0 ? this.swapSeq + ticksFor(this.balance.player.swapS) : 0;
    const swapping = swapEnd > 0 && seq < swapEnd;
    const flipped = swapEnd > 0 && seq >= swapEnd;
    const active = flipped ? (shown === 0 ? 1 : 0) : shown;
    this.attackSlot = active;
    this.syncSlot(0, me.weapon0);
    this.syncSlot(1, me.weapon1);
    const other = active === 0 ? 1 : 0;
    this.cooldown[other] = cooldownIdle(this.cooldown[other] as number, TICK_DT_S);
    const weapon = active === 1 ? me.weapon1 : me.weapon0;
    const stats = this.balance.weapons[weapon];
    if (!stats) return false;
    if (swapping) {
      this.cooldown[active] = cooldownIdle(this.cooldown[active] as number, TICK_DT_S);
      return false; // no attack during a swap (FR5)
    }
    const c = cooldownTickStart(this.cooldown[active] as number, TICK_DT_S);
    const gun = isGun(stats);
    const reloadEnd = gun ? this.reloadEndSeq(me, active) : 0;
    const reloading = reloadEnd > 0 && seq <= reloadEnd;
    let ammo = 1;
    if (gun) {
      ammo = reloadEnd > 0 ? stats.magazine - this.shotsAfter(reloadEnd, active) : (active === 1 ? me.ammo1 : me.ammo0) - this.shotsAfter(me.ackSeq, active);
    }
    const aimLen = Math.sqrt(input.aimX * input.aimX + input.aimY * input.aimY);
    const attacked = !reloading && me.status === "alive" && input.fire && aimLen >= MIN_AIM && cooldownReady(c) && ammo > 0;
    this.cooldown[active] = cooldownTickEnd(c, attacked, stats.rateHz);
    if (attacked) {
      if (gun && ammo === 1) this.emptySeq[active] = seq; // the server starts its reload on this tick
      const a = this.attack;
      a.weapon = weapon;
      a.melee = !gun;
      a.dirX = input.aimX / aimLen;
      a.dirY = input.aimY / aimLen;
    }
    return attacked;
  }

  /** Seq on which the slot's reload ends (it may fire from the next), or 0 when none is known. */
  private reloadEndSeq(me: FireGateView, slot: 0 | 1): number {
    const k = slot === 1 ? me.reloadTicks1 : me.reloadTicks0;
    if (k > 0) return me.ackSeq + k;
    const s = this.emptySeq[slot] as number;
    if (s > 0 && me.ackSeq < s) {
      const stats = this.balance.weapons[slot === 1 ? me.weapon1 : me.weapon0];
      return stats && isGun(stats) ? s + ticksFor(stats.reloadS) : 0;
    }
    this.emptySeq[slot] = 0;
    return 0;
  }

  /** My local shots on `slot` with seq > `afterSeq` (within the history). */
  private shotsAfter(afterSeq: number, slot: number): number {
    let n = 0;
    for (let s = Math.max(afterSeq + 1, this.lastSeq - LOCAL_SHOT_HISTORY + 1); s <= this.lastSeq; s++) {
      const i = s % LOCAL_SHOT_HISTORY;
      if (this.shotSeq[i] === s && this.shotSlot[i] === slot) n += this.shotCount[i] as number;
    }
    return n;
  }

  /** A slot whose weapon changed (shop, swap of slots) starts ready, like a fresh `createSlot`. */
  private syncSlot(i: 0 | 1, weapon: string): void {
    if (this.cooldownWeapon[i] === weapon) return;
    this.cooldownWeapon[i] = weapon;
    this.cooldown[i] = 0;
    this.emptySeq[i] = 0;
  }
}
