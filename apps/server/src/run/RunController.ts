import {
  NEUTRAL_INPUT,
  TICK_DT_S,
  addPlayer,
  createWorld,
  removePlayer,
  setInput,
  step,
  teamSpawnPoint,
  type Balance,
  type PlayerInput,
  type SimEvent,
  type Systems,
  type World,
} from "@topdown/shared";

/** Inputs kept per player: 6 steps = 300 ms of jitter (Story 2.4 › Input queue). */
export const INPUT_QUEUE_MAX = 6;

type MutableInput = { -readonly [K in keyof PlayerInput]: PlayerInput[K] };

const copyInput = (to: MutableInput, from: PlayerInput): void => {
  to.seq = from.seq;
  to.moveX = from.moveX;
  to.moveY = from.moveY;
  to.aimX = from.aimX;
  to.aimY = from.aimY;
  to.fire = from.fire;
  to.swap = from.swap;
  to.consumable = from.consumable;
  to.isMouse = from.isMouse;
};

/** Per-player input ring and ack. Preallocated: queueing and ticking never allocate. */
class PlayerSlot {
  constructor(readonly playerId: string) {}
  readonly ring: MutableInput[] = Array.from({ length: INPUT_QUEUE_MAX }, () => ({ ...NEUTRAL_INPUT }));
  head = 0;
  count = 0;
  /** Highest seq queued so far; anything ≤ it is a duplicate or arrived late. */
  lastQueuedSeq = 0;
  /** Seq of the input applied on the last tick (a starved tick keeps it). */
  ackSeq = 0;
  /** The input handed to the World this tick (one object per player, copied into). */
  readonly current: MutableInput = { ...NEUTRAL_INPUT };
  rttMs = 0;
  /** Inputs dropped because the ring was full (oldest first). */
  overflowDrops = 0;
  /** Inputs ignored because their seq was not newer. */
  staleDrops = 0;
}

export interface RunControllerOptions {
  balance: Balance;
  seed: number;
  /** In join order; each gets `teamSpawnPoint(slot)`. */
  players: readonly { playerId: string; slot: number }[];
  /** Dev (`DEV_NO_WAVES=1`): waves don't advance (the Story 1.7 cheat flag). */
  pauseWaves?: boolean;
  /** Tests only: replace systems by name (Epic 1 lesson: isolate mechanics). */
  systems?: Partial<Systems>;
}

/**
 * One run on the server, without Colyseus (Story 2.4): owns the World, the per-player input
 * queues and this tick's events. The room is its only caller; Story 2.10 bots and headless replay
 * reuse it. Seed of the architecture's run state machine (Epic 3 adds Build and phases here).
 *
 * Input rule: each tick a player with queued input applies the oldest one (`ackSeq` = its seq);
 * a starved player holds still with the same seq, keeping aim and fire. So the server's movement
 * for acked inputs equals the client's prediction exactly (Story 2.6).
 */
export class RunController {
  readonly world: World;
  private readonly slots = new Map<string, PlayerSlot>();
  /** The same slots in join order, for iteration without an iterator per tick. */
  private readonly order: PlayerSlot[] = [];
  private readonly events: SimEvent[] = [];

  constructor(opts: RunControllerOptions) {
    this.world = createWorld({ balance: opts.balance, seed: opts.seed, ...(opts.systems ? { systems: opts.systems } : {}) });
    this.world.waves.paused = opts.pauseWaves === true;
    const at = { x: 0, y: 0 };
    for (const { playerId, slot } of opts.players) {
      teamSpawnPoint(this.world, slot, at);
      addPlayer(this.world, playerId, at.x, at.y);
      const s = new PlayerSlot(playerId);
      this.slots.set(playerId, s);
      this.order.push(s);
    }
    this.world.events.subscribe((e) => this.events.push(e));
  }

  /** Queues one input (already validated). Old or duplicate seqs are ignored; a full ring drops its oldest. */
  queueInput(playerId: string, input: PlayerInput): void {
    const s = this.slots.get(playerId);
    if (!s) return;
    if (input.seq <= s.lastQueuedSeq) {
      s.staleDrops++;
      return;
    }
    if (s.count === INPUT_QUEUE_MAX) {
      s.head = (s.head + 1) % INPUT_QUEUE_MAX;
      s.count--;
      s.overflowDrops++;
    }
    copyInput(s.ring[(s.head + s.count) % INPUT_QUEUE_MAX] as MutableInput, input);
    s.count++;
    s.lastQueuedSeq = input.seq;
  }

  /** Stores the player's round-trip time; Story 2.7 turns it into the shot advance. */
  setRtt(playerId: string, rttMs: number): void {
    const s = this.slots.get(playerId);
    if (s) s.rttMs = rttMs;
  }

  rttMs(playerId: string): number {
    return this.slots.get(playerId)?.rttMs ?? 0;
  }

  /** Seq of the last input applied for this player (0 before the first). */
  ackSeq(playerId: string): number {
    return this.slots.get(playerId)?.ackSeq ?? 0;
  }

  /** Inputs waiting in this player's queue. */
  queued(playerId: string): number {
    return this.slots.get(playerId)?.count ?? 0;
  }

  /** Dropped inputs so far: `overflow` (ring full) and `stale` (seq not newer). */
  drops(playerId: string): { overflow: number; stale: number } {
    const s = this.slots.get(playerId);
    return { overflow: s?.overflowDrops ?? 0, stale: s?.staleDrops ?? 0 };
  }

  /** Removes a player who left mid-run; zombies pick the next-nearest player on the next tick. */
  removePlayer(playerId: string): void {
    const s = this.slots.get(playerId);
    if (s) this.order.splice(this.order.indexOf(s), 1);
    this.slots.delete(playerId);
    removePlayer(this.world, playerId);
  }

  /** One fixed step. Returns this tick's events (a reused array, valid until the next tick). */
  tick(): readonly SimEvent[] {
    this.events.length = 0;
    for (let i = 0; i < this.order.length; i++) {
      const s = this.order[i] as PlayerSlot;
      const cur = s.current;
      if (s.count > 0) {
        copyInput(cur, s.ring[s.head] as MutableInput);
        s.head = (s.head + 1) % INPUT_QUEUE_MAX;
        s.count--;
        s.ackSeq = cur.seq;
      } else {
        // Starved: hold still, keep aim and fire, same seq (edge flags already spent on it).
        cur.moveX = 0;
        cur.moveY = 0;
        cur.swap = false;
        cur.consumable = false;
      }
      setInput(this.world, s.playerId, cur);
    }
    step(this.world, TICK_DT_S);
    return this.events;
  }
}
