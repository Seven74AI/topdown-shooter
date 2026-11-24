/**
 * Why money was earned (Story 3.2). Append only: the index goes on the wire (`net/netEvents.ts`).
 * Story 4.5 appends "refund" (a building a decay stage destroyed: 50 % of its price back).
 */
export const MONEY_REASONS = ["kill", "assist", "revive", "wave", "refund"] as const;
export type MoneyReason = (typeof MONEY_REASONS)[number];

/**
 * `player.damaged.sourceZombieId` below 0: not a zombie's bite. Story 4.8: -1 = a fire pulse (the
 * client's burn cue); Story 5.9: -2 = a blast (mines; 5.5/5.8/5.12 reuse it: no burn cue);
 * Story 5.6: -3 = acid (Spitter spit and puddles: its own hurt cue). All travel as is on the wire.
 */
export const DAMAGE_SOURCE_FIRE = -1;
export const DAMAGE_SOURCE_EXPLOSION = -2;
export const DAMAGE_SOURCE_ACID = -3;

/**
 * Story 5.4: what hurt a player (`player.damaged.tag`). Append only: the index goes on the wire.
 * The friendly-fire rule (`combat/damage.ts › damagePlayerBy`) reads it: a PLAYER's `bullet` and
 * `melee` never hurt players; their `fire` and `explosion` deal `combat.json › friendlyFire.pct`.
 * `zombie` = bites (and other zombie-caused damage), `acid` = Spitter spit and puddles (5.6).
 */
export const DAMAGE_TAGS = ["zombie", "bullet", "melee", "fire", "explosion", "acid"] as const;
export type DamageTag = (typeof DAMAGE_TAGS)[number];

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
  /** Story 5.3: `seq` (16-bit input seq) only for pellet guns: remote clients rebuild the fan from it. */
  | { type: "weapon.fired"; playerId: string; weapon: string; x: number; y: number; dirX: number; dirY: number; seq?: number }
  | { type: "weapon.reload_started"; playerId: string; weapon: string; reloadS: number }
  | { type: "weapon.reloaded"; playerId: string; weapon: string }
  | { type: "weapon.swap_started"; playerId: string }
  | { type: "weapon.swapped"; playerId: string; active: 0 | 1; weapon: string }
  /** Story 5.2: `hits` (zombies cut) only for a `quietHits` weapon (the Chainsaw), which sends no `zombie.hit` each. */
  | { type: "melee.swung"; playerId: string; weapon: string; x: number; y: number; dirX: number; dirY: number; arcDeg: number; rangeM: number; hits?: number }
  /**
   * Story 5.4: `tag` = what hurt (`DAMAGE_TAGS`), `sourcePlayerId` = the player whose fire or blast
   * it was (friendly fire; null for zombies, car fire, acid). `sourceZombieId` keeps its 4.8/5.6/5.9
   * meaning (the biting zombie, or −1 fire / −2 blast / −3 acid).
   */
  | { type: "player.damaged"; playerId: string; amount: number; sourceZombieId: number; tag: DamageTag; sourcePlayerId: string | null }
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
  /** Story 5.14: a bear trap's jaws closed on a zombie (clang + snap FX; open/closed itself is schema state). */
  | { type: "bear_trap.snapped"; buildingId: number; x: number; y: number }
  /**
   * Story 5.6: Spitter `zombieId` released glob `spitId` from its mouth (x, y) toward (toX, toY), the
   * end of its flight (the target's position at release, or the range end). It flies straight at the
   * type's `spit.speedMps`; `acid.splashed` with the same id ends it.
   */
  | {
      type: "spitter.spat";
      zombieId: number;
      spitId: number;
      x: number;
      y: number;
      toX: number;
      toY: number;
      /** Review M1: client only (never on the wire): seconds since the server tick, set by NetSimHost on drain. */
      ageS?: number;
    }
  /**
   * Story 5.6: glob `puddleId` (= its `spitId`) ended at (x, y) — on a player (`hitPlayerId`), at a
   * car / bus / building face, or at its aim point — and left an acid puddle there (radius and
   * lifetime from balance).
   */
  | { type: "acid.splashed"; puddleId: number; x: number; y: number; hitPlayerId: string | null; /** Review M1: client only, as above. */ ageS?: number }
  /** Story 5.7: a Brute appeared (roar on every one; `first` = the run's first Brute: the "Brute!" banner). Sent to everyone. */
  | { type: "zombie.brute_spawned"; zombieId: number; x: number; y: number; first: boolean; /** Client only: seconds since it happened (a woken tab's backlog: no late banner). */ ageS?: number }
  /** Story 5.1: `playerId` upgraded the weapon in `slot` to `level` (2–maxLevel; build phase only). */
  | { type: "weapon.upgraded"; playerId: string; weapon: string; slot: 0 | 1; level: number }
  /**
   * Story 5.5: `playerId` lobbed round `grenadeId` (u8, wraps) from the muzzle (x, y); it bursts at
   * (tx, ty) — the aim point, or in front of the first car / bus / building on its track — on
   * server tick `landTick`. The client flies a cosmetic round from this (no per-tick state).
   */
  | { type: "grenade.launched"; playerId: string; grenadeId: number; x: number; y: number; tx: number; ty: number; landTick: number; /** landTick − the launch tick (the wire carries this, u8). */ flightTicks: number; /** Review L1: the 16-bit input seq of the shot (the shooter's client matches its instant copy by it). */ seq: number; /** Client only (never on the wire): seconds since the server tick, set by NetSimHost on drain. */ ageS?: number; /** Story 5.12: a thrown consumable (its index + 1); absent / 0 = a weapon's round. */ item?: number }
  /**
   * Story 5.5 (shared with 5.8, 5.9, 5.12): a blast of `radiusM` at (x, y) (`EXPLOSION_KINDS[kind]`),
   * set off by `sourcePlayerId` (null: no player, or one who left). Its hits, kills and player
   * damage follow as their own events; this is the visual. `grenadeId` = the round that burst (0: none).
   */
  | { type: "explosion.happened"; kind: number; x: number; y: number; radiusM: number; sourcePlayerId: string | null; grenadeId: number; /** Client only, as above. */ ageS?: number }
  /**
   * Story 5.8 (FR-A): Bloater `zombieId` touched a standing player and started its swell at (x, y):
   * it bursts exactly `explodes.swellS` later where it stands (the client's cue and fuse ring; the
   * swell is also the zombie's streamed SWELL state).
   */
  | { type: "bloater.swell_started"; zombieId: number; x: number; y: number; /** Client only: seconds since it happened. */ ageS?: number }
  /**
   * Story 5.8: a Bloater burst at (x, y) (its blast ran this tick; hits and kills are their own
   * events). The client draws the burst and the gas cloud (`gasRadiusM` for `gasS`) from it: no
   * cloud state goes on the wire. `chain` = it was killed by another blast (queued a tick).
   */
  | { type: "bloater.burst"; x: number; y: number; chain: boolean; /** Client only: seconds since it happened. */ ageS?: number }
  /**
   * Story 5.4: `playerId` started / stopped flaming (the first and last tick of a burst; never one
   * per tick). Remote clients draw the cone from the flamer's synced heading while it is on.
   */
  | { type: "weapon.flame_started"; playerId: string; weapon: string }
  | { type: "weapon.flame_stopped"; playerId: string }
  /**
   * Story 5.12: `playerId` used one consumable `item` (its `consumables.json` index): HUD and sound
   * only (the count comes from schema; a throw also sends `grenade.launched`).
   */
  | { type: "consumable.used"; playerId: string; item: number }
  /**
   * Story 5.12: a molotov (consumable `item`) lit fire zone `zoneId` (u16) at (x, y), thrown by
   * `playerId` (null: nobody / left). Radius and lifetime come from balance; the client draws the
   * zone from this (no zone state on the wire) and applies the same cap rule.
   */
  | { type: "molotov.ignited"; zoneId: number; item: number; x: number; y: number; playerId: string | null; /** Client only: seconds since it happened. */ ageS?: number }
  | { type: "test.ping"; n: number }; // used by core tests only; remove once real events cover them

export type SimEventType = SimEvent["type"];
