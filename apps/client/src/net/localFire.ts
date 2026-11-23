import {
  TICK_DT_S,
  cooldownIdle,
  cooldownReady,
  cooldownTickEnd,
  cooldownTickStart,
  isFlame,
  magazineOf,
  ticksFor,
  usesAmmo,
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
/** Unacknowledged swap taps remembered (a tap every 2 steps for 0.8 s). */
const SWAP_TAPS_MAX = 8;

/** What the last `step` that returned true attacked with (one object, reused). */
export interface LocalAttack {
  weapon: WeaponId;
  melee: boolean;
  /** Story 5.4: a flame weapon's tick (no projectile: the cone is drawn from the flame cues). */
  flame: boolean;
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
 * - Swap and reload are timed by seq: the server's weapon timers advance once per seq it was
 *   sent (a starved tick pauses them, a skipped input still gets its weapon tick: Story 2.7
 *   review), so a snapshot with `ackSeq` A and `swapTicks`/`reloadTicks` k means the swap ends on
 *   seq A + k (the weapon can fire that step) and the reload on seq A + k (it can fire from the
 *   next one). Before the snapshot knows, my unacknowledged swap taps are replayed by the
 *   server's rule (`swapState`), and my shot that empties the magazine on seq S starts a reload
 *   that ends on S + R. Gating on the stale snapshot alone
 *   would put every shot after a reload one RTT behind the server's (seen in the hits harness).
 * - Predicted ammo = the snapshot's ammo of the slot minus my local shots on it with
 *   `seq > ackSeq` (a ring of shots per seq), or a full magazine minus my shots after a predicted
 *   reload end. Exact while the server and the client agree on the cooldown phase; at worst one
 *   extra cosmetic shot at the end of a magazine (accepted).
 *
 * Phaser-free and SDK-free (the `tools/netsim` hits harness runs it). No allocation per step.
 */
export class LocalFireClock {
  readonly attack: LocalAttack = { weapon: "", melee: false, flame: false, dirX: 1, dirY: 0 };
  private readonly cooldown = new Float64Array(2);
  private readonly cooldownWeapon: string[] = ["", ""];
  private readonly shotSeq = new Float64Array(LOCAL_SHOT_HISTORY).fill(-1);
  private readonly shotCount = new Uint8Array(LOCAL_SHOT_HISTORY);
  private readonly shotSlot = new Uint8Array(LOCAL_SHOT_HISTORY);
  /** Story 5.4: 1 when the seq's ammo use was a gun shot (a flame tick spends fuel but fires no `weapon.fired`). */
  private readonly shotGun = new Uint8Array(LOCAL_SHOT_HISTORY);
  private lastSeq = 0;
  /** Gun shots this clock has fired so far (NetSimHost's safety net compares the server's). */
  shotsFired = 0;
  /** My gun shots at seqs ≤ the highest ack seen (`ack`): by then the server's shots for them have arrived. */
  shotsAcked = 0;
  private ackedSeq = 0;
  /** My swap taps the snapshot hasn't acknowledged yet, oldest first (Story 2.7 review). */
  private readonly taps = new Float64Array(SWAP_TAPS_MAX);
  private tapCount = 0;
  /** Per slot: seq of my local shot that emptied the magazine (0: none). */
  private readonly emptySeq = new Float64Array(2);
  private attackSlot = 0;
  /**
   * Story 5.2 (F6): my active weapon and whether a swap runs, as the server's weapon state stands
   * after the last stepped seq, i.e. what its `movePlayers` sees on the NEXT seq (movement runs
   * before combat in a tick). The Predictor takes these for the next input, so the Chainsaw's
   * wielder slow is predicted with the server's rule ("" before the first snapshot: no slow).
   */
  moveWeapon: WeaponId = "";
  moveSwapping = false;

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
    const gunShot = attacked && !this.attack.melee && !this.attack.flame;
    this.shotGun[i] = gunShot ? 1 : 0;
    if (gunShot) this.shotsFired++;
    this.lastSeq = input.seq;
    return attacked;
  }

  /** The server acknowledged every seq ≤ `ackSeq`: count my shots on the newly acked seqs. */
  ack(ackSeq: number): void {
    if (ackSeq <= this.ackedSeq) return;
    const from = Math.max(this.ackedSeq + 1, ackSeq - LOCAL_SHOT_HISTORY + 1);
    for (let seq = from; seq <= ackSeq; seq++) {
      const i = seq % LOCAL_SHOT_HISTORY;
      if (this.shotSeq[i] === seq) this.shotsAcked += this.shotGun[i] as number;
    }
    this.ackedSeq = ackSeq;
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
    if (end > 0 && this.lastSeq + 1 > end && stats && usesAmmo(stats)) return magazineOf(stats) - this.shotsAfter(end, slot);
    return (slot === 1 ? me.ammo1 : me.ammo0) - this.shotsAfter(me.ackSeq, slot);
  }

  private decide(input: PlayerInput, me: FireGateView): boolean {
    const seq = input.seq;
    const shown = me.active === 1 ? 1 : 0;
    if (input.swap) this.pushTap(seq);
    const swapping = this.swapState(me, seq);
    const active = this.flips % 2 === 1 ? (shown === 0 ? 1 : 0) : shown;
    this.attackSlot = active;
    this.syncSlot(0, me.weapon0);
    this.syncSlot(1, me.weapon1);
    const other = active === 0 ? 1 : 0;
    this.cooldown[other] = cooldownIdle(this.cooldown[other] as number, TICK_DT_S);
    const weapon = active === 1 ? me.weapon1 : me.weapon0;
    // Story 5.2: the state this seq's combat leaves (a downed player's swap is cancelled).
    this.moveWeapon = weapon;
    this.moveSwapping = swapping && me.status === "alive";
    const stats = this.balance.weapons[weapon];
    if (!stats) return false;
    if (swapping) {
      this.cooldown[active] = cooldownIdle(this.cooldown[active] as number, TICK_DT_S);
      return false; // no attack during a swap (FR5)
    }
    const c = cooldownTickStart(this.cooldown[active] as number, TICK_DT_S);
    // Story 5.4: a flame weapon spends one fuel tick per flaming step, with no cooldown (`firing.ts`).
    const ammoW = usesAmmo(stats);
    const flame = isFlame(stats);
    const reloadEnd = ammoW ? this.reloadEndSeq(me, active) : 0;
    const reloading = reloadEnd > 0 && seq <= reloadEnd;
    let ammo = 1;
    if (ammoW) {
      ammo = reloadEnd > 0 ? magazineOf(stats) - this.shotsAfter(reloadEnd, active) : (active === 1 ? me.ammo1 : me.ammo0) - this.shotsAfter(me.ackSeq, active);
    }
    const aimLen = Math.sqrt(input.aimX * input.aimX + input.aimY * input.aimY);
    const attacked = !reloading && me.status === "alive" && input.fire && aimLen >= MIN_AIM && (flame || cooldownReady(c)) && ammo > 0;
    this.cooldown[active] = flame ? cooldownTickEnd(c, false, stats.rateHz) : cooldownTickEnd(c, attacked, stats.rateHz);
    if (attacked) {
      if (ammoW && ammo === 1) this.emptySeq[active] = seq; // the server starts its reload on this tick
      const a = this.attack;
      a.weapon = weapon;
      a.melee = !ammoW;
      a.flame = flame;
      a.dirX = input.aimX / aimLen;
      a.dirY = input.aimY / aimLen;
    }
    return attacked;
  }

  private flips = 0;

  /**
   * Replays the swap from the snapshot (`ackSeq` + `swapTicks`) and my unacknowledged taps, the
   * way the server applies them one seq per tick: a tap on seq S (not during a swap, nor on the
   * seq a swap ends) swaps on S … S+N−1 and flips the active slot on S+N. Sets `flips` (how many
   * swaps have flipped by `seq`); returns true while swapping on `seq`.
   */
  private swapState(me: FireGateView, seq: number): boolean {
    while (this.tapCount > 0 && (this.taps[0] as number) <= me.ackSeq) this.shiftTap();
    const n = ticksFor(this.balance.player.swapS);
    let end = me.swapTicks > 0 ? me.ackSeq + me.swapTicks : 0;
    let swapping = end > 0 && seq < end;
    let flips = end > 0 && !swapping ? 1 : 0;
    if (me.weapon1 !== "" && me.status === "alive") {
      for (let i = 0; i < this.tapCount; i++) {
        const t = this.taps[i] as number;
        if (t > seq) break;
        if (end > 0 && t <= end) continue; // the server ignores it
        end = t + n;
        if (seq < end) swapping = true;
        else flips++;
      }
    }
    this.flips = flips;
    return swapping;
  }

  private pushTap(seq: number): void {
    if (this.tapCount === SWAP_TAPS_MAX) this.shiftTap();
    this.taps[this.tapCount++] = seq;
  }

  private shiftTap(): void {
    this.taps.copyWithin(0, 1, this.tapCount);
    this.tapCount--;
  }

  /** Reload ticks left in `slot` as predicted for the next step (the HUD's reload bar). */
  predictedReloadTicks(me: FireGateView, slot: 0 | 1): number {
    const end = this.reloadEndSeq(me, slot);
    return end > 0 ? Math.max(0, end - this.lastSeq) : 0;
  }

  /** Seq on which the slot's reload ends (it may fire from the next), or 0 when none is known. */
  private reloadEndSeq(me: FireGateView, slot: 0 | 1): number {
    const k = slot === 1 ? me.reloadTicks1 : me.reloadTicks0;
    if (k > 0) return me.ackSeq + k;
    const s = this.emptySeq[slot] as number;
    if (s > 0 && me.ackSeq < s) {
      const stats = this.balance.weapons[slot === 1 ? me.weapon1 : me.weapon0];
      return stats && usesAmmo(stats) ? s + ticksFor(stats.reloadS) : 0;
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
