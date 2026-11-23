/**
 * Why money was earned (Story 3.2). Append only: the index goes on the wire (`net/netEvents.ts`).
 * Story 4.5 appends "refund" (a building a decay stage destroyed: 50 % of its price back).
 */
export const MONEY_REASONS = ["kill", "assist", "revive", "wave", "refund"] as const;
export type MoneyReason = (typeof MONEY_REASONS)[number];

/**
 * `player.damaged.sourceZombieId` below 0: not a zombie's bite. Story 4.8: -1 = a fire pulse (the
 * client's burn cue); Story 5.9: -2 = a blast (mines; 5.5/5.8/5.12 reuse it: no burn cue).
 */
export const DAMAGE_SOURCE_FIRE = -1;
export const DAMAGE_SOURCE_EXPLOSION = -2;

/**
 * Every event the simulation can emit (architecture › Event System).
 * Naming: domain.past_tense in snake case. Each story adds its own variants.
 */
export type SimEvent =
  | {
      type: "zombie.killed";
      zombieId: number;
      killerId: string | null;
      x: number;
      y: number;
      weapon: string;
      /** Story 3.6: set when a building (turret) killed it; `killerId` is then its owner. */
      buildingId?: number;
    }
  | {
      type: "zombie.hit";
      zombieId: number;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
      damage: number;
      weapon: string;
      /** Story 2.7: the player whose shot or swing it was (null: none). */
      sourceId: string | null;
      /** Story 3.6 review M2: the turret whose shot it was (server only, not on the wire: interest filtering). */
      buildingId?: number;
    }
  | { type: "weapon.fired"; playerId: string; weapon: string; x: number; y: number; dirX: number; dirY: number }
  | { type: "weapon.reload_started"; playerId: string; weapon: string; reloadS: number }
  | { type: "weapon.reloaded"; playerId: string; weapon: string }
  | { type: "weapon.swap_started"; playerId: string }
  | { type: "weapon.swapped"; playerId: string; active: 0 | 1; weapon: string }
  | { type: "melee.swung"; playerId: string; weapon: string; x: number; y: number; dirX: number; dirY: number; arcDeg: number; rangeM: number }
  | { type: "player.damaged"; playerId: string; amount: number; sourceZombieId: number }
  | { type: "player.downed"; playerId: string }
  | { type: "player.revived"; playerId: string; reviverId: string }
  | { type: "player.out"; playerId: string }
  | { type: "player.returned"; playerId: string; x: number; y: number }
  | { type: "team.wiped"; wave: number }
  /** Story 3.10: the team cleared the run's last wave (`waves.runWaves`); the run is over ("You held out!"). */
  | { type: "run.held_out"; wave: number }
  | { type: "wave.started"; number: number; size: number }
  | { type: "wave.ended"; number: number }
  | { type: "wave.rush_started"; count: number }
  /** Story 3.1: a build phase started; `wave` is the wave that comes after it. */
  | { type: "build.started"; wave: number }
  /** Story 3.2: the economy system paid `amount` into `playerId`'s wallet. */
  | { type: "money.earned"; playerId: string; amount: number; reason: MoneyReason }
  /** Story 3.4: `ownerId` placed a building (min corner on lattice point gx, gy in 0.5 m units; rotation 0–3). */
  | { type: "building.placed"; buildingId: number; buildingType: string; ownerId: string; gx: number; gy: number; rot: number }
  /** Story 3.5: zombies broke a building (it is already removed; position for the debris FX). */
  | { type: "building.destroyed"; buildingId: number; buildingType: string; ownerId: string; gx: number; gy: number; rot: number }
  /** Story 3.7: `playerId` repaired building `buildingId` to full HP for `cost`; (x, y) = its footprint's centre in metres. */
  | { type: "building.repaired"; buildingId: number; playerId: string; cost: number; x: number; y: number }
  /**
   * Story 3.6: turret `buildingId` fired a shot from its muzzle (x, y) along the unit (dirX, dirY).
   * On the wire only the id and heading travel; the client computes the muzzle from its building.
   */
  | { type: "turret.fired"; buildingId: number; x: number; y: number; dirX: number; dirY: number }
  /**
   * Story 4.5: the build start moved the district to decay stage `stage` (from `from`); the map's
   * mutations, building refunds and push-outs are done and the flow fields rebuilt. The client
   * shows the stage's name as a banner (the map itself follows the room state).
   */
  | { type: "decay.stage_changed"; stage: number; from: number }
  /**
   * Story 5.9: `playerId` upgraded their building `buildingId` to `toType` for `cost` (the step
   * price); (x, y) = its footprint's centre. FX + HUD only (type, HP and wallet come from schema).
   */
  | { type: "building.upgraded"; buildingId: number; playerId: string; cost: number; toType: string; x: number; y: number }
  /** Story 5.9: mine `buildingId` went off at (x, y) (already removed; its hits/kills follow as events). */
  | { type: "mine.exploded"; buildingId: number; x: number; y: number }
  | { type: "test.ping"; n: number }; // used by core tests only; remove once real events cover them

export type SimEventType = SimEvent["type"];
