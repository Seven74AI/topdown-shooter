import {
  NEUTRAL_INPUT,
  TICK_DT_S,
  createWorld,
  setInput,
  step,
  type Balance,
  type PlayerInput,
  type SimEvent,
  type World,
} from "@topdown/shared";
import type { SimHost } from "./SimHost";

/** Most steps run in one frame; leftover time is dropped (avoids a catch-up spiral after a hidden tab). */
export const MAX_CATCHUP_STEPS = 5;

/** Id of the only player in local (Epic 1) mode. */
export const LOCAL_PLAYER_ID = "local";

/** Runs the shared World in the browser at a fixed 20 Hz step. */
export class LocalSimHost implements SimHost {
  readonly world: World;
  private accumulatorS = 0;
  private input: PlayerInput = NEUTRAL_INPUT;
  /** Edge flags latched until a step consumes them (a tap between two steps is never lost). */
  private latchedSwap = false;
  private latchedConsumable = false;
  /** Input sequence number, one per step (the shared input system fires edges once per seq). */
  private seq = 0;
  private events: SimEvent[] = [];
  private drained: SimEvent[] = [];
  private readonly unsubscribe: () => void;

  constructor(opts: { balance: Balance; seed: number }) {
    this.world = createWorld({ balance: opts.balance, seed: opts.seed });
    this.unsubscribe = this.world.events.subscribe((e) => this.events.push(e));
  }

  get alpha(): number {
    return this.accumulatorS / TICK_DT_S;
  }

  update(frameDtS: number): void {
    if (!(frameDtS > 0)) return;
    this.accumulatorS += frameDtS;
    let steps = 0;
    while (this.accumulatorS >= TICK_DT_S && steps < MAX_CATCHUP_STEPS) {
      setInput(this.world, LOCAL_PLAYER_ID, {
        ...this.input,
        seq: ++this.seq,
        swap: this.latchedSwap,
        consumable: this.latchedConsumable,
      });
      this.latchedSwap = false; // consumed by exactly one step
      this.latchedConsumable = false;
      step(this.world, TICK_DT_S);
      this.accumulatorS -= TICK_DT_S;
      steps++;
    }
    if (this.accumulatorS >= TICK_DT_S) {
      // Hit the catch-up cap: drop whole steps, keep the fraction so alpha stays in [0, 1).
      this.accumulatorS %= TICK_DT_S;
    }
  }

  setLocalInput(input: PlayerInput): void {
    this.input = input;
    if (input.swap) this.latchedSwap = true;
    if (input.consumable) this.latchedConsumable = true;
  }

  drainEvents(): readonly SimEvent[] {
    // Swap buffers instead of allocating a new array every frame.
    const out = this.events;
    this.events = this.drained;
    this.drained = out;
    this.events.length = 0;
    return out;
  }

  dispose(): void {
    this.unsubscribe();
    this.events.length = 0;
    this.drained.length = 0;
  }
}
