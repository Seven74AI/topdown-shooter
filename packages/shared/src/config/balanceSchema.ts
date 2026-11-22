import { z } from "zod";

/** Balance ids are lowercase snake case (architecture › Naming Conventions). */
const balanceId = z.string().regex(/^[a-z][a-z0-9_]*$/, "balance ids are lowercase snake_case");

const common = {
  damage: z.number().positive(),
  rateHz: z.number().positive(),
  rangeM: z.number().positive(),
  knockbackM: z.number().min(0).default(0),
  hitPushbackM: z.number().min(0),
  screenShake: z.boolean(),
  price: z.number().int().min(0),
  /** Story 3.3: the display name (shop); the id in Title Case when absent. Not a gameplay number. */
  name: z.string().min(1).max(24).optional(),
};

const gunSchema = z
  .object({
    kind: z.literal("gun"),
    ...common,
    spreadDeg: z.number().min(0).max(90),
    magazine: z.number().int().positive(),
    reloadS: z.number().positive(),
    pierce: z.number().int().min(1),
    projectileSpeedMps: z.number().positive(),
  })
  .strict();

const meleeSchema = z
  .object({
    kind: z.literal("melee"),
    ...common,
    arcDeg: z.number().positive().max(360),
  })
  .strict();

export const weaponSchema = z.discriminatedUnion("kind", [gunSchema, meleeSchema]);
export const weaponsSchema = z.record(balanceId, weaponSchema);

export const zombieTypeSchema = z
  .object({
    hp: z.number().positive(),
    speedMps: z.number().positive(),
    damage: z.number().min(0),
    attackIntervalS: z.number().positive(),
    radiusM: z.number().positive(),
    reward: z.number().int().min(0),
    /**
     * Story 3.9: a hit slows the player by this many percent (integer, so the server and the
     * client's prediction compute the same speed from the same integers) for `biteSlowS`.
     * Refreshes, never stacks. 0 = no slow.
     */
    biteSlowPct: z.number().int().min(0).max(90).default(0),
    /** At most 10 s: the remaining ticks go on the wire as a uint8. */
    biteSlowS: z.number().min(0).max(10).default(0),
  })
  .strict();

/** Crowd movement: zombies push each other apart within `separationRadiusM`. */
export const crowdSchema = z
  .object({
    separationRadiusM: z.number().positive(),
    /** Push speed (m/s) at full overlap. */
    separationStrength: z.number().min(0),
    /** Desired speed + push is capped at speedMps × this factor. */
    maxSpeedFactor: z.number().min(1),
  })
  .strict();

/**
 * Story 3.5: the flow field (`zombies/flowField.ts`). The field is rebuilt continuously: each tick
 * settles at most `rebuildCellsPerTick` cells, so a full refresh of the map takes
 * ceil(cells / rebuildCellsPerTick) ticks (the cadence) and the field zombies read is at most twice
 * that old.
 */
export const pathingSchema = z
  .object({
    /** Rebuild budget: cells settled per tick (the 48 × 32 m map has 6,144). */
    rebuildCellsPerTick: z.number().int().positive(),
    /** Walking a building cell costs as much as this many metres of open street (so zombies detour unless breaking is cheaper). */
    buildingCostM: z.number().positive(),
    /** Extra cost of a cell next to a building (paths keep off walls and round corners cleanly). */
    nearWallCostM: z.number().min(0),
    /** A zombie steers at the centre of the cell this many steps down the field (stops before a building). */
    lookaheadCells: z.number().int().min(1).max(8),
  })
  .strict();

export const zombiesSchema = z
  .object({ types: z.record(balanceId, zombieTypeSchema), crowd: crowdSchema, pathing: pathingSchema })
  .strict();

export const wavesSchema = z
  .object({
    zombiesPerWave: z.number().int().positive(),
    maxAlive: z.number().int().positive(),
    lastRushCount: z.number().int().min(0),
    /** Story 3.1: the build phase before wave 1 and after every wave (FR44); ends early when everyone is Ready. */
    buildPhaseS: z.number().positive(),
    /** Spawn pressure: every spawnIntervalS, up to spawnPerInterval zombies leave the queue. */
    spawnIntervalS: z.number().positive(),
    spawnPerInterval: z.number().int().positive(),
    /** Spawn points closer than this to a player are skipped. */
    spawnMinPlayerDistanceM: z.number().min(0),
    /** Spawns are jittered ±this along their edge so a batch doesn't stack. */
    spawnJitterM: z.number().min(0),
  })
  .strict();

export const playerSchema = z
  .object({
    maxHp: z.number().positive(),
    speedMps: z.number().positive(),
    radiusM: z.number().positive(),
    swapS: z.number().min(0),
    /** Run start (Story 2.4): survivors stand at the map centre ± this on each axis, by slot. */
    spawnOffsetM: z.number().min(0),
    /** Story 2.8: a downed player is out after this long without a revive (paused while being revived). */
    downedS: z.number().positive(),
    /** A standing teammate this close (centre to centre) for `reviveS` revives a downed player. */
    reviveS: z.number().positive(),
    reviveRadiusM: z.number().positive(),
    /** HP after a revive, as a fraction of max HP. */
    reviveHpFrac: z.number().gt(0).max(1),
    /**
     * Story 3.1: each build phase heals every player by this fraction of max HP (capped at max);
     * downed and out players return standing with this much (FR9).
     */
    buildHealFrac: z.number().gt(0).max(1),
    /** Retro A12: a returning player is placed on the first free spot in this many rings of `spawnOffsetM` around the teammate. */
    returnSearchRings: z.number().int().min(1),
  })
  .strict();

/** Touch control tuning (Story 1.12 playtest tunes these). Dead zones are fractions of the stick radius. */
export const controlsSchema = z
  .object({
    moveDeadZone: z.number().min(0).max(0.9),
    aimDeadZone: z.number().min(0).max(0.9),
    aimAssistDeg: z.number().min(0).max(45),
  })
  .strict();

/** Story 3.2: personal wallets and rewards (GDD › Economy and Resources). Kill rewards live on the zombie types. */
export const economySchema = z
  .object({
    /** Every player's wallet at run start (FR12). */
    startingWallet: z.number().int().min(0),
    /** An assist (damaging a zombie a teammate kills) pays this share of the kill reward, rounded down (FR45). */
    assistShare: z.number().min(0).max(1),
    /** Paid to the reviver when a revive completes. */
    reviveReward: z.number().int().min(0),
    /** Wave N cleared pays N × this to every player in the run (downed and out included). */
    waveClearBonusPerWave: z.number().int().min(0),
    /** Story 3.6: a building's kill pays its owner this share of the kill reward, rounded down. */
    buildingKillShare: z.number().min(0).max(1),
  })
  .strict();

/**
 * Story 2.10 bot policy (`bots/botPolicy.ts`): load-test and economy bots (Stories 3.10, 6.1,
 * 10.8 tune these without code changes).
 */
export const botsSchema = z
  .object({
    /** A zombie closer than this (centre to centre): back away from it. */
    keepDistanceM: z.number().min(0),
    /** Farther than this from the centre of the alive team: move toward it. */
    regroupDistM: z.number().min(0),
    /** A downed teammate within this: go and revive them. */
    reviveSearchM: z.number().min(0),
    /** Stop this close to the downed teammate (inside `player.reviveRadiusM`, so the revive runs). */
    reviveStopM: z.number().min(0),
    /** Epic 3 hook: shop item ids bought in this order between waves. Unused until then. */
    shoppingList: z.array(balanceId).default([]),
  })
  .strict();

/**
 * Story 3.6: a building that shoots (GDD › Buildings: Auto-turret). During a wave it shoots the
 * nearest alive zombie whose centre is within `rangeM` of its centre (`buildings/turret.ts`).
 */
export const turretSchema = z
  .object({
    /** Target range from the turret's centre to the zombie's centre (GDD: 8 m). */
    rangeM: z.number().positive().max(32),
    /** Shots per second (GDD: 5), through the shared cooldown rule (`combat/cooldown.ts`). */
    rateHz: z.number().positive().max(20),
    /** Damage per shot (GDD: 3). */
    damage: z.number().positive(),
    projectileSpeedMps: z.number().positive(),
    /** How far a shot flies before it vanishes (a little past `rangeM`, from the muzzle). */
    projectileRangeM: z.number().positive(),
    /** The muzzle sits this far from the turret's centre along the aim. */
    muzzleM: z.number().min(0),
    hitPushbackM: z.number().min(0),
  })
  .strict();

/**
 * Story 3.4: one building type (GDD › Buildings and Defenses). The footprint is `widthM` along x and
 * `depthM` along y at rotation 0 (rotations 1 and 3 swap them), both multiples of the 0.5 m build
 * lattice; its min corner sits on a lattice point. Story 3.6 adds turret fields (with defaults).
 */
export const buildingTypeSchema = z
  .object({
    /** Display name (shop, placement hint). */
    name: z.string().min(1).max(32),
    price: z.number().int().min(0),
    /** Footprint in metres: multiples of the 0.5 m lattice (`BUILD_GRID_M`), at most 8 m. */
    widthM: z.number().positive().max(8).multipleOf(0.5),
    depthM: z.number().positive().max(8).multipleOf(0.5),
    /** Full HP (synced as a uint16). */
    hp: z.number().int().positive().max(65535),
    /** Story 3.6: present on buildings that shoot (default: none, the building never fires). */
    turret: turretSchema.optional(),
  })
  .strict();

/** Story 3.4: placeable buildings and the per-player cap (FR51). Story 3.3's shop lists `types`. */
export const buildingsSchema = z
  .object({
    /** Buildings one player may own at once (GDD: 6). */
    maxPerPlayer: z.number().int().min(1).max(64),
    /** Review L5: no building within this many metres of a wave spawn point (spawns can't be boxed in). */
    spawnClearM: z.number().min(0),
    /** Story 3.7: a full repair costs this share of the building's price, rounded up (GDD: 50 %). */
    repairShare: z.number().min(0).max(1),
    types: z.record(balanceId, buildingTypeSchema),
  })
  .strict();

/**
 * Story 3.3: the fixed-list shop (replaced by the roguelike shop in Epic 5). Which weapons it offers,
 * in order; prices stay on the weapons (`weapons.json › price`). `loadBalance` checks every id is a weapon.
 */
export const shopSchema = z
  .object({
    weapons: z
      .array(balanceId)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, "duplicate weapon id"),
  })
  .strict();

/** One entry per balance file: file name (without .json) → schema. */
export const balanceFileSchemas = {
  weapons: weaponsSchema,
  zombies: zombiesSchema,
  waves: wavesSchema,
  player: playerSchema,
  controls: controlsSchema,
  economy: economySchema,
  bots: botsSchema,
  buildings: buildingsSchema,
  shop: shopSchema,
} as const;

export type BalanceFileName = keyof typeof balanceFileSchemas;
export type GunStats = z.output<typeof gunSchema>;
export type MeleeStats = z.output<typeof meleeSchema>;
export type WeaponStats = z.output<typeof weaponSchema>;
export type ZombieTypeStats = z.output<typeof zombieTypeSchema>;
export type BuildingTypeStats = z.output<typeof buildingTypeSchema>;
export type TurretStats = z.output<typeof turretSchema>;
