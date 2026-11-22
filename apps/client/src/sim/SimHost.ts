import type { PlayerInput, SimEvent, World } from "@topdown/shared";

/** Presentation data of a player (Story 2.9): kept out of the shared `PlayerState`. */
export interface PlayerInfo {
  /** Lobby slot 0–3 (ring and arrow colour, `SLOT_COLORS`). */
  readonly slot: number;
  /** Display name ("" solo). */
  readonly name: string;
}

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
  /**
   * The local player's input for upcoming steps. Continuous fields (move, aim, fire) use the latest
   * value; edge flags (swap, consumable) set by any call reach exactly one step.
   */
  setLocalInput(input: PlayerInput): void;
  /**
   * Story 3.1: the local player's build-phase Ready (a toggle; ignored outside a build). Solo it
   * applies before the next step; online it is sent as `build.set_ready` and comes back in the state.
   */
  setBuildReady(ready: boolean): void;
  /** Drops a swap/consumable latched but not sent yet (the in-run menu opened in the same step; 2.11 review). */
  clearEdges(): void;
  /**
   * Events produced since the last call, in order; each event is returned exactly once.
   * The returned array is reused: it is valid only until the next `drainEvents()` call.
   */
  drainEvents(): readonly SimEvent[];
  /** Id of the player this device controls ("local" solo, "p0"–"p3" online). */
  readonly localPlayerId: string;
  /** True for the networked host: renderers may use it to pick data sources (e.g. Story 2.5 heading). */
  readonly online: boolean;
  /**
   * Slot and name of a player (Story 2.9). The returned object may be reused: read it before the
   * next call. Unknown ids get slot 0 (or the id's slot online) and "".
   */
  playerInfo(id: string): PlayerInfo;
  /** Ends the run on this host (the networked host also leaves the room). */
  dispose(): void;
}
