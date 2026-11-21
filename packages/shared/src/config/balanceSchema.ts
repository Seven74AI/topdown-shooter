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

export const zombiesSchema = z
  .object({ types: z.record(balanceId, zombieTypeSchema), crowd: crowdSchema })
  .strict();

export const wavesSchema = z
  .object({
    zombiesPerWave: z.number().int().positive(),
    maxAlive: z.number().int().positive(),
    lastRushCount: z.number().int().min(0),
    pauseBetweenWavesS: z.number().min(0),
    /** Banner time before wave 1. */
    firstWaveDelayS: z.number().min(0),
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

/** One entry per balance file: file name (without .json) → schema. */
export const balanceFileSchemas = {
  weapons: weaponsSchema,
  zombies: zombiesSchema,
  waves: wavesSchema,
  player: playerSchema,
  controls: controlsSchema,
} as const;

export type BalanceFileName = keyof typeof balanceFileSchemas;
export type GunStats = z.output<typeof gunSchema>;
export type MeleeStats = z.output<typeof meleeSchema>;
export type WeaponStats = z.output<typeof weaponSchema>;
export type ZombieTypeStats = z.output<typeof zombieTypeSchema>;
