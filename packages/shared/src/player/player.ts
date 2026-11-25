import type { World } from "../core/world";
import { createLoadout, type Loadout } from "../combat/loadout";
import { bossSlotOf, clearBossThreatSlot } from "../boss/target";
import { claimFlameSlot, releaseFlameSlot } from "../combat/flame";

/**
 * Story 2.8: at 0 HP a player is "downed" (can't move or fire; a teammate can revive them), and
 * "out" when the downed countdown runs out (spectating until the next build phase). See player/downed.ts.
 */
export type PlayerStatus = "alive" | "downed" | "out";

export interface PlayerState {
  readonly id: string;
  /** Meters, map origin top-left, +y down. */
  x: number;
  y: number;
  /** Position at the start of the current tick (renderers interpolate prev → current). */
  prevX: number;
  prevY: number;
  /** Unit vector the survivor faces. */
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  radiusM: number;
  status: PlayerStatus;
  /** Two weapon slots (Story 1.8 adds the second) and the active one. */
  loadout: Loadout;
  /** Story 2.7: half the RTT (capped) a new projectile's first sweep is advanced by; 0 offline. */
  shotAdvanceS: number;
  /**
   * Story 2.12: the most ticks this player's shots may be rewound (lag compensation); 0 = off
   * (offline). The server sets it; the rewind of a shot comes from its input's `viewTick`.
   */
  rewindMaxTicks: number;
  /** Story 2.7 review: the server had no new input for this tick: weapon timers pause (server only). */
  weaponsPaused: boolean;
  /** Downed (Story 2.8): ticks until out; paused while a revive is in progress. 0 when not downed. */
  downedTicksLeft: number;
  /** Ticks a teammate has stood within reach in a row (reset when no one does). */
  reviveTicks: number;
  /** The teammate reviving this tick, or null. */
  reviverId: string | null;
  /**
   * Story 5.11: ticks this revive needs (the fastest revive kit among the revivers in reach, else
   * `ticksFor(player.reviveS)`); 0 while no one revives. On the wire, so the client's ring matches.
   */
  reviveNeedTicks: number;
  /** Story 3.1: this player tapped Ready in the current build phase (cleared at every build and wave start). */
  buildReady: boolean;
  /**
   * Story 3.2: personal wallet (spendable currency). Only the economy system and server-validated
   * spending (`economy/economy.ts`) change it; the online client mirrors it from schema.
   */
  wallet: number;
  /** Story 3.2: everything earned this run (never reduced by spending; Story 3.10 logs it). */
  earned: number;
  /**
   * Story 6.11: this player's evacuation vote while the run is in phase "vote": 0 none, 1 extract,
   * 2 stay (`EVAC_VOTE`). Cleared at every vote open; changeable until the vote ends (D2).
   */
  vote: number;
  /**
   * Story 6.12 (F7): `earned` at the moment the team first chose Stay (the end of wave 10): the
   * part of the run's earnings that a later wipe in endless never loses. 0 until then.
   */
  earnedAtEvac: number;
  /** Story 3.9 (`player/slow.ts`): movement ticks left at reduced speed; 0 = not slowed. */
  slowTicksLeft: number;
  /** Speed reduction in integer percent while `slowTicksLeft > 0`; 0 otherwise. */
  slowPct: number;
  /**
   * Story 4.8 review L4: this body's burn clock — ticks spent inside a fire since its last fire hit
   * (kept while outside, so stepping out on the pulse tick doesn't dodge it). Server / solo only.
   */
  fireTicks: number;
  /**
   * Story 5.6 (F4): this body's acid clock — ticks spent inside any acid puddle since its last acid
   * hit (kept while outside, reset at every build start; the 4.8 D3 rule). Server / solo only.
   */
  acidTicks: number;
  /**
   * Story 5.7 (`player/knockback.ts`): movement ticks left in a Brute's knockback (0 = none), its
   * direction as the unit vector × 127 (int8 each) and its distance per tick in millimetres. All on
   * the wire: the client's prediction slides exactly like the server.
   */
  knockTicks: number;
  knockDx: number;
  knockDy: number;
  knockStepMm: number;
  /** Story 5.4: this player's flame slot (`world.flameSlots`; 255 = none: their flames hurt nothing). */
  flameSlot: number;
  /** Story 5.4: flamed on the last weapon tick (burst edges: `weapon.flame_started` / `_stopped`). */
  flaming: boolean;
  /**
   * Story 5.4 (FR-C): this body's flame clock per flamer slot: ticks spent in that teammate's cone
   * since its last friendly-fire pulse (kept while outside, reset at every build start). Fixed
   * length FLAME_SLOTS (preallocated). Server / solo only.
   */
  flameClock: number[];
  /**
   * Story 5.11 (`economy/gear.ts`): owned gear as a bitmask (bit i = the i-th `gear.json` item);
   * kept for the whole run. On the wire (uint8): the client's prediction reads the shoes from it.
   */
  gear: number;
  /**
   * Story 5.12 (`economy/consumables.ts`, `combat/consumables.ts`): the quick-use slot — the
   * consumable id (a `consumables.json` key) or null, and how many are left (0 ⇔ null). On the wire
   * as a uint8 index (255 = empty) and a uint8 count.
   */
  consumable: string | null;
  consumableCount: number;
  /** Story 5.12 (D1, D7): applied-input ticks until the next use is allowed (0 = ready). Server / solo only. */
  consumableCooldownTicks: number;
  /**
   * Story 5.12 review M1: the last AIM input (unit direction and its distance in metres: re-review L,
   * decoded from the encoding of what was in hand, so a launcher swap never changes it), written only from aim
   * input and kept `consumables.json › aimMemoryS` worth of applied ticks (`lastAimTicks` > 0), so a
   * throw with the aim stick released goes where the player last aimed, not where they walk. Server / solo only.
   */
  lastAimX: number;
  lastAimY: number;
  /** Metres (< 0: unknown, nothing to decode it with: a throw then goes full range). */
  lastAimM: number;
  lastAimTicks: number;
  /**
   * Story 8.1 (F4, decision 8.1 D3): spawn-protection ticks left after a mid-wave return from a hold
   * (`player.json › returnProtectTicks`): nothing hurts the body and its weapons don't run. Counted
   * down by `movePlayers`; 0 = none. On the wire (uint8): the phone blinks the body and holds its fire.
   */
  protectTicks: number;
  /**
   * Review M1 / decision 8.1 B15: the wave of this player's last protected (teleported) return from a
   * hold; −1 none. A second return in the same wave lands in place, unprotected. Server / solo only.
   */
  protectedReturnWave: number;
  /**
   * Story 7.2 (S2, `meta/runRecord.ts`): the run record Supplies are paid from. Waves 1–`runWaves` that ended while this
   * player was in the run (present or held; the wave a team wipe falls in counts too, decision 7.2 D8), endless waves
   * the same way, Behemoths killed while present (the wave-10 one included) and the endless ones among them. Server
   * bookkeeping only: not in the Colyseus schema, not mirrored; a late joiner starts at 0.
   */
  wavesIn: number;
  endlessWavesIn: number;
  bossesIn: number;
  endlessBossesIn: number;
}

/** Adds a player at (x, y) with stats from `balance.player`. Returns the new state. */
export function addPlayer(world: World, id: string, x: number, y: number): PlayerState {
  if (world.players.has(id)) throw new Error(`addPlayer: player ${id} already exists`);
  const stats = world.balance.player;
  const player: PlayerState = {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    facingX: 1,
    facingY: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    radiusM: stats.radiusM,
    status: "alive",
    loadout: createLoadout(world.balance),
    shotAdvanceS: 0,
    rewindMaxTicks: 0,
    weaponsPaused: false,
    downedTicksLeft: 0,
    reviveTicks: 0,
    reviverId: null,
    reviveNeedTicks: 0, // Story 5.11
    buildReady: false,
    wallet: world.balance.economy.startingWallet,
    earned: 0,
    vote: 0, // Story 6.11
    earnedAtEvac: 0, // Story 6.12
    slowTicksLeft: 0,
    fireTicks: 0,
    acidTicks: 0, // Story 5.6
    slowPct: 0,
    knockTicks: 0, // Story 5.7
    knockDx: 0,
    knockDy: 0,
    knockStepMm: 0,
    flameSlot: 255, // Story 5.4: set by claimFlameSlot below
    flaming: false,
    flameClock: [0, 0, 0, 0],
    gear: 0, // Story 5.11
    consumable: null, // Story 5.12
    consumableCount: 0,
    consumableCooldownTicks: 0,
    lastAimX: 1, // Story 5.12 review M1
    lastAimY: 0,
    lastAimM: -1,
    lastAimTicks: 0,
    protectTicks: 0, // Story 8.1
    protectedReturnWave: -1, // review M1 (B15)
    wavesIn: 0, // Story 7.2
    endlessWavesIn: 0,
    bossesIn: 0,
    endlessBossesIn: 0,
  };
  world.players.set(id, player);
  claimFlameSlot(world, player);
  return player;
}

/**
 * Removes a player and every input record of theirs (Story 2.4: leaving mid-run). Zombies pick the
 * next-nearest player on the next tick. A no-op for an unknown id.
 */
export function removePlayer(world: World, id: string): void {
  clearBossThreatSlot(world, bossSlotOf(world, id)); // Story 6.5 (F7): a player who left has no threat (the target switches at once)
  releaseFlameSlot(world, id); // Story 5.4
  world.players.delete(id);
  world.heldPlayers.delete(id); // Story 8.1: a final leave while held
  world.pendingInputs.delete(id);
  world.inputs.delete(id);
  world.lastAppliedSeq.delete(id);
}
