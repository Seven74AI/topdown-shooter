import {
  NEUTRAL_INPUT,
  PREDICTION_SYSTEMS,
  TICK_DT_S,
  addPlayer,
  createWorld,
  setInput,
  step,
  type Balance,
  type DistrictMap,
  type PlayerInput,
  type PlayerState,
  type PlayerStatus,
  type World,
} from "@topdown/shared";
import {
  PREDICTION_ERROR_BUCKETS,
  PREDICTION_ERROR_BUCKET_STEPS,
  PREDICTION_HISTORY_SIZE,
  PREDICTION_IGNORE_M,
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
  readonly stats: PredictionStats = { corrections: 0, snaps: 0, maxErrorM: 0, lastErrorM: 0, unackedInputs: 0 };
  private readonly world: World;
  private player: PlayerState | null = null;
  private readonly ring: MutableInput[];
  private head = 0;
  private count = 0;
  /** Highest seq pushed out of the full ring before it was acknowledged (it can't be replayed). */
  private evictedSeq = 0;
  private lastAck = -1;
  private offsetX = 0;
  private offsetY = 0;
  /** The alpha of the last `renderX`: reconcile measures the error at the point drawn last. */
  private alpha = 0;
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

  /** First snapshot: create the predicted player at the server position. */
  init(x: number, y: number): void {
    if (!this.player) this.player = addPlayer(this.world, this.playerId, x, y);
    this.placeAt(x, y);
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /** One local fixed step: record the input and step the prediction World. */
  applyLocal(input: PlayerInput): void {
    if (this.count === PREDICTION_HISTORY_SIZE) {
      this.evictedSeq = (this.ring[this.head] as MutableInput).seq;
      this.head = (this.head + 1) % PREDICTION_HISTORY_SIZE;
      this.count--;
    }
    const slot = this.ring[(this.head + this.count) % PREDICTION_HISTORY_SIZE] as MutableInput;
    copyMovement(slot, input);
    this.count++;
    this.stats.unackedInputs = this.count;
    if (this.player) {
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

  /** Server truth for my player at `ackSeq`; replays newer inputs. Ignores acks older than the last one seen. */
  reconcile(ackSeq: number, x: number, y: number, status: PlayerStatus): void {
    if (ackSeq < this.lastAck) return;
    this.lastAck = ackSeq;
    const first = this.player === null;
    const drawnX = this.drawnX();
    const drawnY = this.drawnY();
    this.dropAcked(ackSeq);
    if (first) this.init(x, y);
    const p = this.player as PlayerState;
    this.placeAt(x, y);
    p.status = status;
    if (this.evictedSeq > ackSeq) {
      // A stall of over 3 s: inputs the server hasn't applied are gone from the history.
      this.count = 0;
      this.evictedSeq = 0;
      this.stats.unackedInputs = 0;
      this.recordError(Math.hypot(drawnX - x, drawnY - y));
      this.snap();
      return;
    }
    for (let i = 0; i < this.count; i++) {
      setInput(this.world, this.playerId, this.ring[(this.head + i) % PREDICTION_HISTORY_SIZE] as MutableInput);
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
    if (e >= PREDICTION_SNAP_M) {
      this.snap();
      return;
    }
    this.offsetX += ex;
    this.offsetY += ey;
    this.stats.corrections++;
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
