import {
  NEUTRAL_INPUT,
  PREDICTION_SYSTEMS,
  TICK_DT_S,
  addPlayer,
  createWorld,
  setInput,
  step,
  type Balance,
  type BossStateView,
  type BuildingStateView,
  type DistrictMap,
  type PlayerInput,
  type PlayerState,
  type PlayerStatus,
  type ReadonlyMapView,
  type World,
} from "@topdown/shared";
import { mirrorBuildings } from "./mirrorBuildings";
import { mirrorDecay } from "./mirrorDecay";
import { mirrorBoss } from "./mirrorBoss";
import {
  PREDICTION_ERROR_BUCKETS,
  PREDICTION_ERROR_BUCKET_STEPS,
  PREDICTION_HISTORY_SIZE,
  PREDICTION_IGNORE_M,
  PREDICTION_CHARGE_SNAP_M,
  PREDICTION_KNOCK_SNAP_M,
  PREDICTION_SMOOTH_TAU_S,
  PREDICTION_SNAP_M,
} from "./netConfig";

export interface PredictionStats {
  /** Reconciles whose error was ≥ 1 mm and < 1 m (smoothed). */
  corrections: number;
  /** Reconciles whose error was ≥ 1 m, or whose ack was older than the history (snapped). */
  snaps: number;
  /** Largest reconcile error over the last 10 s of steps (m). */
  maxErrorM: number;
  /** Error of the latest reconcile (m). */
  lastErrorM: number;
  /** Inputs sent but not yet acknowledged after the latest reconcile. */
  unackedInputs: number;
  /** Story 5.7: corrections that slid a newly seen knockback in (smoothed up to `PREDICTION_KNOCK_SNAP_M`, not snapped). */
  knockSlides: number;
}

type MutableInput = { -readonly [K in keyof PlayerInput]: PlayerInput[K] };

/**
 * Client-side prediction of the local survivor (Story 2.6). Phaser-free and SDK-free, so the
 * `tools/netsim` harness runs it against the real `RunController`.
 *
 * A private World with only this player and `PREDICTION_SYSTEMS` (input + movement, the shared
 * code the server runs) steps once per sent input. A server snapshot rebases the player on the
 * server's position at `ackSeq` and replays only the inputs with `seq > ackSeq`. That never
 * assumes every seq ≤ ackSeq was applied: the server may skip inputs to drain a backlog (Story 2.4
 * review), and the rebase simply leaves their movement out. The difference to what was drawn
 * becomes a visual offset that decays (or a snap when ≥ 1 m).
 *
 * Edge flags (swap, consumable) are cleared in the copies: the predictor never fires anything.
 * No allocation per step, reconcile or frame (the history is a preallocated ring of copies).
 */
export class Predictor {
  readonly stats: PredictionStats = { corrections: 0, snaps: 0, maxErrorM: 0, lastErrorM: 0, unackedInputs: 0, knockSlides: 0 };
  private readonly world: World;
  private player: PlayerState | null = null;
  private readonly ring: MutableInput[];
  /** Story 5.2: per ring entry, the active weapon and swap state my movement saw (from LocalFire). */
  private readonly ringWeapon: string[];
  private readonly ringSwapping: Uint8Array;
  private head = 0;
  private count = 0;
  /** Highest seq pushed out of the full ring before it was acknowledged (it can't be replayed). */
  private evictedSeq = 0;
  private lastAck = -1;
  private offsetX = 0;
  private offsetY = 0;
  /** The alpha of the last `renderX`: reconcile measures the error at the point drawn last. */
  private alpha = 0;
  /** Story 5.7: the ack seq at which the last knock seen ends (ack + knockTicks): a new knock has another. */
  private knockEndSeq = -1;
  private readonly errorBuckets = new Float64Array(PREDICTION_ERROR_BUCKETS);
  private bucket = 0;
  private bucketSteps = 0;

  constructor(
    balance: Balance,
    map: DistrictMap,
    private readonly playerId: string,
  ) {
    this.world = createWorld({ balance, seed: 0, map, systems: PREDICTION_SYSTEMS });
    this.ring = Array.from({ length: PREDICTION_HISTORY_SIZE }, () => ({ ...NEUTRAL_INPUT }));
    this.ringWeapon = new Array<string>(PREDICTION_HISTORY_SIZE).fill("");
    this.ringSwapping = new Uint8Array(PREDICTION_HISTORY_SIZE);
  }

  /** True once the first snapshot created the predicted player. */
  get ready(): boolean {
    return this.player !== null;
  }

  /** Predicted position after the latest local input (not smoothed). */
  get x(): number {
    return this.player?.x ?? 0;
  }

  get y(): number {
    return this.player?.y ?? 0;
  }

  /** Story 5.7: movement ticks of a knockback the predicted player still slides (tests). */
  get knockTicks(): number {
    return this.player?.knockTicks ?? 0;
  }

  /** Story 3.9: movement ticks the predicted player is still slowed (tests, the overlay). */
  get slowTicksLeft(): number {
    return this.player?.slowTicksLeft ?? 0;
  }

  /** Facing of the predicted player: follows the latest aim at once, never reconciled. */
  get facingX(): number {
    return this.player?.facingX ?? 1;
  }

  get facingY(): number {
    return this.player?.facingY ?? 0;
  }

  /** Highest ack seen so far (-1 before the first). */
  get ackSeq(): number {
    return this.lastAck;
  }

  /**
   * Story 3.4 (brief line 4): the server's buildings, copied before every reconcile, so the replay
   * and every later local step collide with them exactly as the server's `movePlayers` does.
   */
  syncBuildings(buildings: ReadonlyMapView<BuildingStateView> | undefined): void {
    mirrorBuildings(buildings, this.world);
  }

  /**
   * Story 4.5: the server's decay stage and variants (room state), applied before every reconcile
   * like the buildings, with the shared `applyDecayStage`: the replay collides with the new map.
   */
  syncDecay(stage: number | undefined, variants: number | undefined, firesOut?: number): void {
    mirrorDecay(this.world, stage, variants, firesOut); // Story 4.8: the fires that burned out
  }

  /** Story 6.5 (D1, DD6): the boss's newest server position, so `movePlayers`' body push matches the server's. */
  syncBoss(boss: BossStateView | undefined): void {
    mirrorBoss(this.world, boss);
  }

  /** Story 4.5: the decay stage the prediction collides with (tests). */
  get decayStage(): number {
    return this.world.decay.stage;
  }

  /** Story 4.8: the fires the prediction World knows (tests: the same names as the server's). */
  get fireNames(): string[] {
    return this.world.decay.fires.map((f) => f.name);
  }

  /** Story 4.5: the prediction World's obstacle solids (tests: the same names as the server's). */
  get solidNames(): string[] {
    return this.world.obstacles.solids.map((b) => b.name);
  }

  /** Story 4.1: the map the prediction collides with (tests: the same object as the server's). */
  get map(): DistrictMap {
    return this.world.map;
  }

  /** Buildings the prediction collides with (tests). */
  get buildingCount(): number {
    return this.world.buildings.list.length;
  }

  /** First snapshot: create the predicted player at the server position. */
  init(x: number, y: number): void {
    if (!this.player) this.player = addPlayer(this.world, this.playerId, x, y);
    this.placeAt(x, y);
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /**
   * One local fixed step: record the input and step the prediction World. Story 5.2 (F6): `weapon`
   * and `swapping` are my active weapon and swap state as the server's movement of this seq sees
   * them (`LocalFireClock.moveWeapon` / `moveSwapping` before its step for this seq), so the
   * shared `wielderSlowPct` (the Chainsaw's 20 %) gives the server's speed; kept per seq for replays.
   */
  applyLocal(input: PlayerInput, weapon = "", swapping = false): void {
    if (this.count === PREDICTION_HISTORY_SIZE) {
      this.evictedSeq = (this.ring[this.head] as MutableInput).seq;
      this.head = (this.head + 1) % PREDICTION_HISTORY_SIZE;
      this.count--;
    }
    const k = (this.head + this.count) % PREDICTION_HISTORY_SIZE;
    const slot = this.ring[k] as MutableInput;
    copyMovement(slot, input);
    this.ringWeapon[k] = weapon;
    this.ringSwapping[k] = swapping ? 1 : 0;
    this.count++;
    this.stats.unackedInputs = this.count;
    if (this.player) {
      this.wield(k);
      setInput(this.world, this.playerId, slot);
      step(this.world, TICK_DT_S);
    }
    if (++this.bucketSteps >= PREDICTION_ERROR_BUCKET_STEPS) {
      this.bucketSteps = 0;
      this.bucket = (this.bucket + 1) % PREDICTION_ERROR_BUCKETS;
      this.errorBuckets[this.bucket] = 0;
      this.updateMaxError();
    }
  }

  /**
   * Server truth for my player at `ackSeq`; replays newer inputs. Ignores acks older than the last
   * one seen. Story 3.9: the bite slow of that same tick (`slowTicks`, `slowPct`) is rebased too, so
   * the replay moves at the server's speed and counts the slow down like the server.
   * Story 5.7: so is a Brute's knockback (`knockTicks` left at the ack, its int8 direction and mm per
   * tick): the replay slides the same ticks the server does. The reconcile that first shows a knock
   * the client could not foresee (it happened on the server) smooths the jump instead of snapping,
   * up to `PREDICTION_KNOCK_SNAP_M`: the survivor visibly slides back rather than teleporting.
   * Story 5.11: and the owned `gear` (the running shoes' speed bonus): the replay from `ackSeq`
   * moves at the server's speed from the first state that shows the shoes (gear never changes in a
   * wave, so no input in flight straddles a purchase).
   */
  reconcile(ackSeq: number, x: number, y: number, status: PlayerStatus, slowTicks = 0, slowPct = 0, knockTicks = 0, knockDx = 0, knockDy = 0, knockStepMm = 0, gear = 0): void {
    if (ackSeq < this.lastAck) return;
    this.lastAck = ackSeq;
    const first = this.player === null;
    const drawnX = this.drawnX();
    const drawnY = this.drawnY();
    // The last step's displacement: kept when nothing is left to replay (review fix, see below).
    const lastDx = first ? 0 : (this.player as PlayerState).x - (this.player as PlayerState).prevX;
    const lastDy = first ? 0 : (this.player as PlayerState).y - (this.player as PlayerState).prevY;
    this.dropAcked(ackSeq);
    if (first) this.init(x, y);
    const p = this.player as PlayerState;
    this.placeAt(x, y);
    p.status = status;
    p.slowTicksLeft = slowTicks;
    p.slowPct = slowTicks > 0 ? slowPct : 0;
    p.knockTicks = knockTicks; // Story 5.7
    p.knockDx = knockDx;
    p.knockDy = knockDy;
    p.knockStepMm = knockStepMm;
    p.gear = gear; // Story 5.11
    const newKnock = knockTicks > 0 && ackSeq + knockTicks !== this.knockEndSeq;
    if (knockTicks > 0) this.knockEndSeq = ackSeq + knockTicks;
    // Story 6.6: a charge shove (its own mm per tick) slides in from further (shove + body push-out).
    const c = this.world.balance.boss.charge;
    const chargeStepMm = Math.round((c.shoveM * 1000) / Math.max(1, Math.round(c.shoveS * 20)));
    // While the server still slides this knock (`knockTicks` > 0), the slide's offset is still decaying:
    // keep the knock's limit for the running total too (else a 0.15 m correction on top of a 2 m slide snaps).
    const knockLimit = knockStepMm === chargeStepMm ? PREDICTION_CHARGE_SNAP_M : PREDICTION_KNOCK_SNAP_M;
    const snapM = newKnock ? knockLimit : PREDICTION_SNAP_M;
    const totalSnapM = newKnock || knockTicks > 0 ? knockLimit : PREDICTION_SNAP_M;
    if (this.evictedSeq > ackSeq) {
      // A stall of over 3 s: inputs the server hasn't applied are gone from the history.
      this.count = 0;
      this.evictedSeq = 0;
      this.stats.unackedInputs = 0;
      if (first) return; // nothing was drawn yet: no error to count
      this.recordError(Math.hypot(drawnX - x, drawnY - y));
      this.snap();
      return;
    }
    if (this.count === 0) {
      // The ack covers the newest input (low RTT: LAN, localhost). The server's x/y is the end of
      // that step; keep the step's start so the drawn prev → cur segment (at the current alpha) is
      // the same, instead of a fake (1 − alpha) × step error on every snapshot.
      p.prevX = x - lastDx;
      p.prevY = y - lastDy;
    }
    for (let i = 0; i < this.count; i++) {
      const k = (this.head + i) % PREDICTION_HISTORY_SIZE;
      this.wield(k);
      setInput(this.world, this.playerId, this.ring[k] as MutableInput);
      step(this.world, TICK_DT_S);
    }
    this.stats.unackedInputs = this.count;
    if (first) return; // nothing was drawn yet
    // The prediction error: where the replay puts the player now vs. where the prediction had it
    // (both at the alpha drawn last; the offset is in both, so it cancels). A correction adds it to
    // the offset, so the drawn point D stays put and then decays toward the truth.
    const ex = drawnX - this.drawnX();
    const ey = drawnY - this.drawnY();
    const e = Math.sqrt(ex * ex + ey * ey);
    this.recordError(e);
    if (e < PREDICTION_IGNORE_M) return; // float32 rounding: offset unchanged
    if (e >= snapM) {
      this.snap();
      return;
    }
    this.offsetX += ex;
    this.offsetY += ey;
    this.stats.corrections++;
    if (newKnock) this.stats.knockSlides++;
    // Corrections in a row can add up: a total offset ≥ 1 m snaps too (review fix).
    if (this.offsetX * this.offsetX + this.offsetY * this.offsetY >= totalSnapM * totalSnapM) this.snap();
  }

  /** Smoothed position to draw this frame. */
  renderX(alpha: number): number {
    this.alpha = alpha;
    return this.drawnX();
  }

  renderY(alpha: number): number {
    this.alpha = alpha;
    return this.drawnY();
  }

  /** Decays the visual offset; call once per frame. */
  frame(frameDtS: number): void {
    if (frameDtS <= 0 || (this.offsetX === 0 && this.offsetY === 0)) return;
    const k = Math.exp(-frameDtS / PREDICTION_SMOOTH_TAU_S);
    this.offsetX *= k;
    this.offsetY *= k;
    if (Math.abs(this.offsetX) < 1e-6 && Math.abs(this.offsetY) < 1e-6) {
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }

  /** Current visual offset length (m), for tests and the overlay. */
  get offsetM(): number {
    return Math.sqrt(this.offsetX * this.offsetX + this.offsetY * this.offsetY);
  }

  private drawnX(): number {
    const p = this.player;
    return p ? p.prevX + (p.x - p.prevX) * this.alpha + this.offsetX : 0;
  }

  private drawnY(): number {
    const p = this.player;
    return p ? p.prevY + (p.y - p.prevY) * this.alpha + this.offsetY : 0;
  }

  /**
   * Story 5.2: the predicted player holds ring entry k's weapon (one slot, never swapping on its own:
   * the prediction World runs no combat), so `movePlayers` reads the server's wield state.
   */
  private wield(k: number): void {
    const lo = (this.player as PlayerState).loadout;
    lo.slots[0].weapon = this.ringWeapon[k] as string;
    lo.active = 0;
    lo.swapTicks = this.ringSwapping[k] === 1 ? 1 : 0;
  }

  /** Story 5.2: the weapon the predicted player held on its latest step (tests). */
  get wieldWeapon(): string {
    return this.player?.loadout.slots[0].weapon ?? "";
  }

  private placeAt(x: number, y: number): void {
    const p = this.player as PlayerState;
    p.x = x;
    p.y = y;
    p.prevX = x;
    p.prevY = y;
  }

  private snap(): void {
    this.offsetX = 0;
    this.offsetY = 0;
    this.stats.snaps++;
  }

  /** Drops history entries the server has acknowledged (applied or skipped). */
  private dropAcked(ackSeq: number): void {
    while (this.count > 0 && (this.ring[this.head] as MutableInput).seq <= ackSeq) {
      this.head = (this.head + 1) % PREDICTION_HISTORY_SIZE;
      this.count--;
    }
  }

  private recordError(e: number): void {
    this.stats.lastErrorM = e;
    if (e > (this.errorBuckets[this.bucket] as number)) this.errorBuckets[this.bucket] = e;
    if (e > this.stats.maxErrorM) this.stats.maxErrorM = e;
  }

  private updateMaxError(): void {
    let m = 0;
    for (let i = 0; i < PREDICTION_ERROR_BUCKETS; i++) m = Math.max(m, this.errorBuckets[i] as number);
    this.stats.maxErrorM = m;
  }
}

/** Movement and aim only: edge flags are never predicted (the server fires them once per seq). */
function copyMovement(to: MutableInput, from: PlayerInput): void {
  to.seq = from.seq;
  to.moveX = from.moveX;
  to.moveY = from.moveY;
  to.aimX = from.aimX;
  to.aimY = from.aimY;
  to.fire = from.fire;
  to.swap = false;
  to.consumable = false;
  to.isMouse = from.isMouse;
}
