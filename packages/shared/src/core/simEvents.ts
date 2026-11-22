/**
 * Why money was earned (Story 3.2). Append only: the index goes on the wire (`net/netEvents.ts`).
 * Story 3.6 appends "building".
 */
export const MONEY_REASONS = ["kill", "assist", "revive", "wave"] as const;
export type MoneyReason = (typeof MONEY_REASONS)[number];

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
  | { type: "test.ping"; n: number }; // used by core tests only; remove once real events cover them

export type SimEventType = SimEvent["type"];
