import type { RunPhase } from "./messages";
import type { PlayerStatus } from "../player/player";

/**
 * Plain read-only views of the room state schema (apps/server/src/rooms/schema/RunState.ts).
 * The client types `room.state` with these, because it cannot import server code. RunState.ts
 * checks at compile time that the schema is assignable to these views, so drift is a type error.
 */
export interface PlayerStateView {
  readonly slot: number;
  readonly name: string;
  /** Lobby Ready flag (Story 2.3); reset when the room returns to the lobby (Story 2.8). */
  readonly ready: boolean;
  /** Fight fields (Story 2.4), written by `syncState` every tick of a run. Metres, float32. */
  readonly x: number;
  readonly y: number;
  /** Facing as `quantizeHeading` (0 = +x, increasing toward +y). */
  readonly heading: number;
  /** Rounded up, so a player at 0.4 HP shows 1. */
  readonly hp: number;
  readonly maxHp: number;
  /** "alive" | "downed" | "out" (Story 2.8). */
  readonly status: PlayerStatus;
  /** Story 2.8: ticks until a downed player is out (0 when not downed). */
  readonly downedTicksLeft: number;
  /** Revive progress of a downed player, 0–255 = 0–100 %. */
  readonly reviveProgress: number;
  /** Zombies this player killed this run (Results screen). */
  readonly kills: number;
  /** Story 3.1: Ready in the current build phase. */
  readonly buildReady: boolean;
  /** Story 3.2: personal wallet (server truth; the client never predicts it). */
  readonly wallet: number;
  /** Story 3.2: total earned this run (never reduced by spending). */
  readonly earned: number;
  /** Story 3.9: movement ticks left at reduced speed (Crawler bite), and the reduction in percent. */
  readonly slowTicks: number;
  readonly slowPct: number;
  /** Story 5.7: a Brute's knockback in progress (ticks left, unit direction × 127, mm per tick): the prediction slides like the server. */
  readonly knockTicks: number;
  readonly knockDx: number;
  readonly knockDy: number;
  readonly knockStepMm: number;
  /** `seq` of the last input the server applied for this player (Story 2.6 replays newer ones). */
  readonly ackSeq: number;
  /** Active weapon slot, 0 or 1. */
  readonly active: number;
  /** Weapon id per slot; "" = empty slot. */
  readonly weapon0: string;
  readonly weapon1: string;
  readonly ammo0: number;
  readonly ammo1: number;
  readonly reloadTicks0: number;
  readonly reloadTicks1: number;
  readonly swapTicks: number;
  /** Story 5.1: each slot's upgrade level (1–4; 0 = empty slot). */
  readonly level0: number;
  readonly level1: number;
  /** Story 5.11: owned gear as a bitmask (bit i = the i-th `gear.json` item); the Predictor reads the shoes. */
  readonly gear: number;
  /** Story 5.11 review L2: ticks this downed player's revive needs (0 = none in progress); `reviveProgress` is of this. */
  readonly reviveNeed: number;
  /** Story 5.12: the quick-use slot — the consumable's index (255 = empty) and how many are left. */
  readonly consumable: number;
  readonly consumableCount: number;
  /** Story 6.11: my evacuation vote (0 none, 1 extract, 2 stay), on change only; every phone shows the chips (F2). */
  readonly vote: number;
}

/** The parts of a schema MapSchema the client reads. Keys are player ids (`p0`–`p3`). */
export interface ReadonlyMapView<V> {
  get(key: string): V | undefined;
  has(key: string): boolean;
  forEach(cb: (value: V, key: string) => void): void;
  readonly size: number;
}

/**
 * Story 3.4: one placed building (schema `BuildingState`; the map key is its id as a string). Sent
 * once when placed; `hp` changes only when it is damaged or repaired (Stories 3.5, 3.7).
 */
export interface BuildingStateView {
  /** `balance.buildings.types` key. */
  readonly type: string;
  /** Player id of the builder. */
  readonly owner: string;
  /** Min corner as 0.5 m lattice indices (x = gx × 0.5 m), and the rotation (0–3, 90° steps). */
  readonly gx: number;
  readonly gy: number;
  readonly rot: number;
  /** `Math.ceil` of the World's HP. */
  readonly hp: number;
  /**
   * Story 5.14: a bear trap's jaws (`BEAR_TRAP_STATE`: 0 armed, 1 holding, 2 sprung); 0 on every other type.
   * Optional in the view (the server always sends it): fixtures and older copies without it read as armed.
   */
  readonly trap?: number;
}

export interface RunStateView {
  readonly phase: RunPhase;
  readonly hostSlot: number;
  readonly players: ReadonlyMapView<PlayerStateView>;
  /** Story 3.4: placed buildings by id (as a string). */
  readonly buildings: ReadonlyMapView<BuildingStateView>;
  /** Server tick of the World these values come from (Story 2.4). */
  readonly tick: number;
  /** `world.waves.number` / `remaining`. */
  readonly wave: number;
  readonly remaining: number;
  /** Players whose status is "alive". */
  readonly aliveCount: number;
  /** Story 2.8: the wave the team reached, set with phase "results" (0 otherwise). */
  readonly resultWave: number;
  /** Story 6.11: how the run ended (`RunEnding`: "wiped" | "extracted" | "lost"), set with phase "results"; "" otherwise. Replaces 3.10's `resultHeldOut`. */
  readonly resultEnding: string;
  /** Story 3.1: ticks left in the build phase (0 outside a build). */
  readonly buildTicksLeft: number;
  /** Story 2.10: the test scenario this room runs (`TestScenario`), "" for a normal game. */
  readonly scenario: string;
  /** Story 4.4: the run's seed (uint32), 0 in the lobby. Results and the performance overlay show it. */
  readonly runSeed: number;
  /**
   * Story 4.5: the decay stage (1–5; 0 in the lobby = not set yet) and the run's chosen variation
   * candidates (bitmask over `map.decayVariants`). Written only when they change; the mirror and the
   * Predictor apply them with the shared `applyDecayStage`, so a late join or a tab that slept
   * across a build start lands on the server's map.
   */
  readonly decayStage: number;
  readonly decayVariants: number;
  /**
   * Story 4.8: the burned-out car fires (bit i = the map's i-th `ignite`), written on change only;
   * the mirror and the Predictor pass it to `applyDecayStage` with the stage.
   */
  readonly decayFiresOut: number;
  /**
   * Story 6.3 (brief 26): the light state's two synced flags (`world.lights.blackoutPct`, `halfDark`),
   * written on change only; the mirror copies them on every patch, so a late join or a woken tab draws
   * the server's darkness on the next frame.
   */
  readonly blackoutPct: number;
  readonly halfDark: boolean;
  /** Story 6.11: ticks left in the evacuation vote (0 outside one); the client draws the ring from it (F4). */
  readonly voteTicksLeft: number;
  /** Story 6.12: the team chose Stay (endless waves; the HUD tag "Endless"). */
  readonly endless: boolean;
  /** Story 6.5: the Behemoth's record (one nested schema; `boss/bossState.ts` is the sim side). */
  readonly boss?: BossStateView; // absent before the first fight patch (a lobby state)
  /**
   * Story 6.8: the active special event (`world.special.active`), on change only: kind (255 none),
   * phase, its start and phase ticks, the marker in cm, the stampede's lane (255 none). The mirror
   * copies them so a late join or a woken tab draws the marker and countdown from server ticks.
   */
  readonly eventKind: number;
  readonly eventPhase: number;
  readonly eventStartTick: number;
  readonly eventPhaseTick: number;
  readonly eventX: number;
  readonly eventY: number;
  readonly eventLane: number;
}

/**
 * Story 6.5: the boss record on the wire (brief line 11: one record in the room state). Position and
 * heading change while it walks; hp on hits; the attack fields once per attack (the telegraph event
 * carries the same numbers: a late Game scene or a woken tab draws from these).
 */
export interface BossStateView {
  /** `BOSS_STATE` (0 none … 8 dead). */
  readonly state: number;
  readonly x: number;
  readonly y: number;
  /** `quantizeHeading` of its facing. */
  readonly heading: number;
  readonly hp: number;
  readonly maxHp: number;
  /** Behemoths this run. */
  readonly number: number;
  readonly look: number;
  /** The target's player slot (255 = none). */
  readonly target: number;
  readonly enraged: boolean;
  /** The current (or last) telegraph: id, kind, start / hit ticks, zone (6.6 adds the lane). */
  readonly atkId: number;
  readonly atkKind: number;
  readonly atkStart: number;
  readonly atkHit: number;
  readonly atkX: number;
  readonly atkY: number;
  readonly atkR: number;
  /** Story 6.6: the charge lane's stop point (= atkX/Y otherwise) and whether it crashes there. */
  readonly atkEndX: number;
  readonly atkEndY: number;
  readonly atkCrash: boolean;
  /** Story 6.6: the throw's chunk source (`BOSS_THROW_SRC`) and spot (visual only). */
  readonly atkSrc: number;
  readonly atkSrcX: number;
  readonly atkSrcY: number;
}

/**
 * Every field of the views as a key list (Epic 2 retro A2). The server's schema (RunState.ts) checks
 * at compile time that its field names are exactly these, and every full client copy of the state
 * (the `?lag` dev throttle) iterates them, so a new schema field that a copy would miss is a type
 * error, not a silent `undefined` under `?lag`. `satisfies` also rejects a key the view lacks.
 */
export const PLAYER_STATE_FIELDS = {
  slot: true,
  name: true,
  ready: true,
  x: true,
  y: true,
  heading: true,
  hp: true,
  maxHp: true,
  status: true,
  ackSeq: true,
  active: true,
  weapon0: true,
  weapon1: true,
  ammo0: true,
  ammo1: true,
  reloadTicks0: true,
  reloadTicks1: true,
  swapTicks: true,
  level0: true, // Story 5.1
  level1: true,
  downedTicksLeft: true,
  reviveProgress: true,
  kills: true,
  buildReady: true,
  wallet: true,
  earned: true,
  slowTicks: true,
  slowPct: true,
  knockTicks: true, // Story 5.7
  knockDx: true,
  knockDy: true,
  knockStepMm: true,
  gear: true, // Story 5.11
  reviveNeed: true,
  consumable: true, // Story 5.12
  consumableCount: true,
  vote: true, // Story 6.11
} as const satisfies Record<keyof PlayerStateView, true>;

/** Story 3.4: `BuildingStateView`'s fields (the server schema and the `?lag` copy check against it). */
export const BUILDING_STATE_FIELDS = {
  type: true,
  owner: true,
  gx: true,
  gy: true,
  rot: true,
  hp: true,
  trap: true, // Story 5.14
} as const satisfies Record<keyof BuildingStateView, true>;

/** `RunStateView`'s fields except the maps `players` and `buildings` (copied per entry). */
export const RUN_STATE_FIELDS = {
  phase: true,
  hostSlot: true,
  tick: true,
  wave: true,
  remaining: true,
  aliveCount: true,
  resultWave: true,
  resultEnding: true, // Story 6.11
  buildTicksLeft: true,
  scenario: true,
  runSeed: true,
  decayStage: true,
  decayVariants: true,
  decayFiresOut: true,
  blackoutPct: true, // Story 6.3
  halfDark: true, // Story 6.3
  eventKind: true, // Story 6.8
  eventPhase: true,
  eventStartTick: true,
  eventPhaseTick: true,
  eventX: true,
  eventY: true,
  eventLane: true,
  voteTicksLeft: true, // Story 6.11
  endless: true, // Story 6.12
} as const satisfies Record<Exclude<keyof RunStateView, "players" | "buildings" | "boss">, true>;

/** Story 6.5: `BossStateView`'s fields (the server schema and the `?lag` copy check against it). */
export const BOSS_STATE_FIELDS = {
  state: true,
  x: true,
  y: true,
  heading: true,
  hp: true,
  maxHp: true,
  number: true,
  look: true,
  target: true,
  enraged: true,
  atkId: true,
  atkKind: true,
  atkStart: true,
  atkHit: true,
  atkX: true,
  atkY: true,
  atkR: true,
  atkEndX: true,
  atkEndY: true,
  atkCrash: true,
  atkSrc: true,
  atkSrcX: true,
  atkSrcY: true,
} as const satisfies Record<keyof BossStateView, true>;
