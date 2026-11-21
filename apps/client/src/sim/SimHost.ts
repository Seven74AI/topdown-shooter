import type { PlayerInput, SimEvent, World } from "@topdown/shared";

/**
 * How scenes talk to the simulation. Epic 1 uses LocalSimHost (the World runs in the browser);
 * Story 2.4 adds a networked host behind the same interface, so scenes don't change.
 *
 * Interpolation: entity pools keep `prevX/prevY` copied at the start of each tick; renderers draw
 * `lerp(prev, current, alpha)`. This interface only provides `alpha`.
 */
export interface SimHost {
  /** Advance by a real frame time in seconds; steps the simulation 0..N times. */
  update(frameDtS: number): void;
  /** Fraction of the next step already elapsed, in [0, 1). */
  readonly alpha: number;
  /** The authoritative (local) or predicted (networked) world. Renderers only read it. */
  readonly world: Readonly<World>;
  /** The local player's input for upcoming steps. */
  setLocalInput(input: PlayerInput): void;
  /** Events produced since the last call, in order; each event is returned exactly once. */
  drainEvents(): readonly SimEvent[];
  dispose(): void;
}
