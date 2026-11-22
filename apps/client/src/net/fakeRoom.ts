import type { BuildingStateView, PlayerStateView, RunPhase, RunStateView } from "@topdown/shared";
import type { NetRoomLike } from "./session";

/** Test helpers (Story 2.4): a plain room state and a fake room behind `NetRoomLike`. */
export type FakePlayer = { -readonly [K in keyof PlayerStateView]: PlayerStateView[K] };

export function fakePlayer(slot: number, over: Partial<FakePlayer> = {}): FakePlayer {
  return {
    slot,
    name: `P${slot}`,
    ready: true,
    x: 0,
    y: 0,
    heading: 0,
    hp: 100,
    maxHp: 100,
    status: "alive",
    ackSeq: 0,
    active: 0,
    weapon0: "pistol",
    weapon1: "",
    ammo0: 12,
    ammo1: 0,
    reloadTicks0: 0,
    reloadTicks1: 0,
    swapTicks: 0,
    downedTicksLeft: 0,
    reviveProgress: 0,
    kills: 0,
    buildReady: false,
    wallet: 100,
    earned: 0,
    slowTicks: 0,
    slowPct: 0,
    ...over,
  };
}

export type FakeBuilding = { -readonly [K in keyof BuildingStateView]: BuildingStateView[K] };

export interface FakeState {
  phase: RunPhase;
  hostSlot: number;
  players: Map<string, FakePlayer>;
  /** Story 3.4: by building id (as a string). */
  buildings: Map<string, FakeBuilding>;
  tick: number;
  wave: number;
  remaining: number;
  aliveCount: number;
  resultWave: number;
  resultHeldOut: boolean;
  buildTicksLeft: number;
  scenario: string;
  /** Story 4.4. */
  runSeed: number;
}

export function fakeState(players: FakePlayer[] = []): FakeState {
  return {
    phase: "wave",
    hostSlot: 0,
    players: new Map(players.map((p) => [`p${p.slot}`, p])),
    buildings: new Map(),
    tick: 0,
    wave: 0,
    remaining: 0,
    aliveCount: players.length,
    resultWave: 0,
    resultHeldOut: false,
    buildTicksLeft: 0,
    scenario: "",
    runSeed: 0,
  };
}

export class FakeRoom implements NetRoomLike {
  readonly sent: { type: string; message: unknown }[] = [];
  readonly handlers = new Map<string | number, ((m: unknown) => void)[]>();
  readonly stateListeners = new Set<(s: RunStateView) => void>();
  left = 0;
  readonly onStateChange: NetRoomLike["onStateChange"];

  constructor(public state: FakeState = fakeState()) {
    const listeners = this.stateListeners;
    const fn = (cb: (s: RunStateView) => void): void => {
      listeners.add(cb);
    };
    fn.remove = (cb: (s: RunStateView) => void): void => {
      listeners.delete(cb);
    };
    this.onStateChange = fn;
  }

  send(type: string, message: unknown): void {
    this.sent.push({ type, message: structuredClone(message) }); // the SDK encodes at once
  }

  onMessage<T>(type: string | number, cb: (m: T) => void): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(cb as (m: unknown) => void);
    this.handlers.set(type, list);
    return () => list.splice(list.indexOf(cb as (m: unknown) => void), 1);
  }

  leave(): void {
    this.left++;
  }

  /** The server sent `type` (a number: a binary message). */
  deliver(type: string | number, message: unknown): void {
    for (const h of this.handlers.get(type) ?? []) h(message);
  }

  /** A patch arrived: notify listeners. */
  patch(): void {
    for (const l of this.stateListeners) l(this.state);
  }

  sentOf(type: string): unknown[] {
    return this.sent.filter((s) => s.type === type).map((s) => s.message);
  }
}
