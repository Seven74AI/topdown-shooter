import { z } from "zod";
import { TICK_RATE_HZ } from "./constants";

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
  /**
   * Story 5.1: the price an upgrade level is a share of (`shop.json › upgrades.priceShare`) when
   * it differs from `price` (the free Pistol: 100). Absent = `price`.
   */
  upgradeBasePrice: z.number().int().min(0).optional(),
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
    /**
     * Story 5.3: projectiles per trigger pull (the Shotgun's 8 pellets; 1 = a single bullet). One pull
     * spends one round and one cooldown; pellets fill the spread cone evenly (`pelletDirection`).
     */
    pellets: z.number().int().min(1).max(16).default(1),
  })
  .strict()
  // Story 5.3: a pellet gun knocks back once per shot (`knockbackM`), never per pellet.
  .refine((g) => g.pellets === 1 || g.hitPushbackM === 0, { message: "a pellet gun (pellets > 1) needs hitPushbackM 0 (knockback is per shot: knockbackM)", path: ["hitPushbackM"] });

const meleeSchema = z
  .object({
    kind: z.literal("melee"),
    ...common,
    arcDeg: z.number().positive().max(360),
    /**
     * Story 5.2: the wielder moves this many percent slower while attacking with it (the Chainsaw's
     * 20: alive, not swapping, fire held with an aim). Integer, so the server and the client's
     * prediction compute the same speed (`player/slow.ts`, the 3.9 rule). 0 = no slow.
     */
    wielderSlowPct: z.number().int().min(0).max(90).default(0),
    /**
     * Story 5.2: hits send no `zombie.hit` each (a 10 Hz Chainsaw would send one per zombie per
     * tick); damage, assist credit and kills are the same, and `melee.swung` carries the hit count.
     */
    quietHits: z.boolean().default(false),
  })
  .strict();

/** Story 5.4 helper: `s` seconds is a whole number of ticks (the 20 Hz tick). */
const wholeTickS = (s: number): boolean => Math.abs(s * TICK_RATE_HZ - Math.round(s * TICK_RATE_HZ)) < 1e-9;

/**
 * Story 5.4: a flame weapon (the Flamethrower and the Gas torch, round C). No projectile and no
 * cooldown: while the trigger is held with fuel left, every tick puts out a cone `rangeM` long
 * (muzzle to the body's edge) and `coneDeg` wide. `damage` is the damage PER SECOND (5.1's
 * `weaponDamage` scales it per upgrade level); a zombie in the cone takes `damage × pulseS` every
 * `pulseS` it spends there (its own clock, first pulse on its first tick), a teammate
 * `damage × playerPulseS × friendlyFire.pct / 100` every `playerPulseS` (first pulse after one
 * pulse). A flame pulse ignites the zombie: `igniteDamagePerS × ignitePulseS` every `ignitePulseS`
 * for `igniteS` (refreshed, never stacked). Fuel is `fuelS` of held fire, counted in ticks (the
 * slot's `ammo`, uint16 on the wire); at 0 a `reloadS` refill starts on its own.
 */
const flameSchema = z
  .object({
    kind: z.literal("flame"),
    damage: z.number().positive(),
    /** Always the tick rate (a flame acts every tick; kept so every weapon has a rate). */
    rateHz: z.number().positive().default(TICK_RATE_HZ),
    rangeM: z.number().positive().max(12),
    coneDeg: z.number().positive().max(120),
    fuelS: z.number().positive(),
    reloadS: z.number().positive(),
    pulseS: z.number().positive().max(2),
    playerPulseS: z.number().positive().max(2),
    igniteDamagePerS: z.number().min(0),
    igniteS: z.number().min(0).max(12),
    ignitePulseS: z.number().positive().max(2),
    knockbackM: z.number().min(0).max(0).default(0),
    hitPushbackM: z.number().min(0),
    screenShake: z.boolean(),
    price: z.number().int().min(0),
    name: z.string().min(1).max(24).optional(),
    upgradeBasePrice: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((f) => f.rateHz === TICK_RATE_HZ, { message: "a flame weapon acts every tick: rateHz must be the tick rate", path: ["rateHz"] })
  .refine((f) => wholeTickS(f.pulseS) && wholeTickS(f.playerPulseS) && wholeTickS(f.ignitePulseS) && wholeTickS(f.igniteS) && wholeTickS(f.fuelS) && wholeTickS(f.reloadS), {
    message: "flame pulseS, playerPulseS, ignitePulseS, igniteS, fuelS and reloadS must be whole numbers of ticks",
  })
  .refine((f) => Math.round(f.fuelS * TICK_RATE_HZ) <= 65535, { message: "fuelS × 20 must fit the uint16 ammo field", path: ["fuelS"] })
  .refine((f) => Math.round(f.igniteS * TICK_RATE_HZ) <= 255, { message: "igniteS × 20 must fit a uint8 clock", path: ["igniteS"] })
  .refine((f) => Math.round(f.pulseS * TICK_RATE_HZ) <= 255 && Math.round(f.playerPulseS * TICK_RATE_HZ) <= 255 && Math.round(f.ignitePulseS * TICK_RATE_HZ) <= 255, "pulses must fit a uint8 clock");

/**
 * Story 5.5: a launcher (the Grenade Launcher). One trigger pull lobs one round along the raw aim
 * (no spread, no aim assist) to the aim point at `minLobM`–`lobRangeM` from the muzzle (the aim
 * vector's length encodes the distance: `combat/grenades.ts`). It flies a straight ground track at
 * `lobSpeedMps` (at least `minFlightS`); cars, the bus and buildings stop it at their face (4.2).
 * On landing it bursts (`combat/explosion.ts`): `damage` (× the 5.1 level) to every body the blast
 * of `blastRadiusM` reaches with a clear line, zombies pushed `blastPushM` straight out (swept, 5.3),
 * players through the friendly-fire rule (`combat.json › friendlyFire`), buildings `blastBuildingDamage`.
 * Magazine and reload follow the gun rules. `rangeM` is the lob range too (it must equal `lobRangeM`).
 */
const launcherSchema = z
  .object({
    kind: z.literal("launcher"),
    ...common,
    spreadDeg: z.literal(0),
    magazine: z.number().int().positive(),
    reloadS: z.number().positive(),
    lobRangeM: z.number().positive().max(30),
    minLobM: z.number().positive(),
    lobSpeedMps: z.number().positive(),
    minFlightS: z.number().positive().max(2),
    blastRadiusM: z.number().positive().max(6),
    blastPushM: z.number().min(0).max(3),
    blastBuildingDamage: z.number().min(0),
  })
  .strict()
  .refine((l) => l.minLobM < l.lobRangeM, { message: "minLobM must be below lobRangeM", path: ["minLobM"] })
  .refine((l) => l.rangeM === l.lobRangeM, { message: "a launcher's rangeM is its lob range: it must equal lobRangeM", path: ["rangeM"] })
  // The landing tick goes on the wire as `landTick − tick` in a u8.
  .refine((l) => Math.round(Math.max(l.minFlightS, l.lobRangeM / l.lobSpeedMps) * TICK_RATE_HZ) <= 255, { message: "the longest flight must fit 255 ticks (lobRangeM / lobSpeedMps)", path: ["lobSpeedMps"] });

export const weaponSchema = z.discriminatedUnion("kind", [gunSchema, meleeSchema, flameSchema, launcherSchema]);
export const weaponsSchema = z.record(balanceId, weaponSchema);

/** Story 5.6 helper: `s` seconds is a whole number of ticks. */
const wholeTicks = (s: number): boolean => Math.abs(s * TICK_RATE_HZ - Math.round(s * TICK_RATE_HZ)) < 1e-9;
/** Story 5.12: a whole, even number (a pulse whose friendly-fire half is whole too). */
const evenWhole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9 && Math.round(v) % 2 === 0;

/**
 * Story 5.6: a ranged spit (Spitters). The Spitter stops within `rangeM` of a player it has a clear
 * shot line to, winds up for `windupS` (the telegraph), spits a glob at `speedMps` (body `radiusM`)
 * that deals `damage` to the first standing player it touches and leaves an acid puddle of
 * `puddleRadiusM` for `puddleS`; standing inside costs `puddleDamagePerS × puddlePulseS` every
 * `puddlePulseS` (per-body clock, the 4.8 rule). `intervalS` runs from spit to spit (windup included).
 */
export const spitSchema = z
  .object({
    rangeM: z.number().positive().max(20),
    windupS: z.number().positive().max(5),
    intervalS: z.number().positive().max(30),
    speedMps: z.number().positive().max(40),
    radiusM: z.number().positive().max(1),
    damage: z.number().positive(),
    puddleRadiusM: z.number().positive().max(5),
    puddleS: z.number().positive().max(30),
    puddleDamagePerS: z.number().positive(),
    puddlePulseS: z.number().positive().max(5),
    /**
     * 5.6 re-review / 5.7 review L4: a puddle is blocked by a shot blocker that the body → centre
     * line enters more than this before the centre (a spit stopped at a face leaves its centre on it).
     */
    acidFaceToleranceM: z.number().min(0).max(0.2).default(0.02),
  })
  .strict()
  .refine((f) => wholeTicks(f.windupS) && wholeTicks(f.intervalS) && wholeTicks(f.puddleS), "spit windupS, intervalS and puddleS must be whole numbers of ticks")
  .refine((f) => f.intervalS > f.windupS, "spit intervalS (spit to spit) must be longer than windupS")
  .refine((f) => Math.abs(f.puddleDamagePerS * f.puddlePulseS - Math.round(f.puddleDamagePerS * f.puddlePulseS)) < 1e-9 && Math.round(f.puddleDamagePerS * f.puddlePulseS) >= 1, "puddleDamagePerS × puddlePulseS must be a whole number ≥ 1")
  .refine((f) => wholeTicks(f.puddlePulseS), "puddlePulseS must be a whole number of ticks");

/** Story 5.6: caps on live spits and puddles (pools are this size; brief line 12). */
export const spitCapsSchema = z
  .object({
    maxLiveSpits: z.number().int().min(1).max(256),
    maxLivePuddles: z.number().int().min(1).max(256),
  })
  .strict();

/**
 * Story 5.8: a Bloater's blast (FR24). On contact with a standing player it swells for `swellS`
 * (stands still, never bites), then bursts where it stands; dying from any cause bursts it too. The
 * blast hits bodies whose circle overlaps `blastRadiusM` with a clear shot line (4.2 cover):
 * standing players take `playerDamage` (never halved: D1), zombies `zombieDamage` (pushed
 * `pushM`), player wall buildings `buildingDamage`. It leaves a gas cloud of `gasRadiusM` for
 * `gasS` that slows standing players inside it `gasSlowPct` (the 3.9 slow, `gasLingerS` after).
 */
export const explodesSchema = z
  .object({
    swellS: z.number().positive().max(5),
    blastRadiusM: z.number().positive().max(10),
    playerDamage: z.number().min(0),
    zombieDamage: z.number().positive(),
    buildingDamage: z.number().int().min(0),
    pushM: z.number().min(0).max(3),
    gasRadiusM: z.number().positive().max(10),
    /** At most 60 s (ticks in a Uint16). */
    gasS: z.number().positive().max(60),
    gasSlowPct: z.number().int().min(0).max(90),
    /** At most 10 s: the slow's remaining ticks go on the wire as a uint8 (3.9). */
    gasLingerS: z.number().positive().max(10),
  })
  .strict()
  .refine((e) => wholeTicks(e.swellS) && wholeTicks(e.gasS) && wholeTicks(e.gasLingerS), "explodes swellS, gasS and gasLingerS must be whole numbers of ticks")
  .refine((e) => Math.round(e.swellS * TICK_RATE_HZ) <= 255, "explodes swellS must fit a uint8 of ticks");

/** Story 5.8: the Bloater blast queue and the gas cloud pool (brief lines 10, 12). */
export const blastsSchema = z
  .object({
    /** Queued (chain) blasts run at most this many per tick, oldest first (FR-E, D4). */
    maxBlastsPerTick: z.number().int().min(1).max(64),
    /** The blast queue's size (a full queue runs its oldest blast at once: never dropped). */
    queueCapacity: z.number().int().min(1).max(1024),
    /** Live gas clouds (the oldest is replaced when full). */
    maxGasClouds: z.number().int().min(1).max(256),
  })
  .strict();

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
    /**
     * Story 5.2 (shared with 5.7's Brute): the share of a knockback or hit pushback this type
     * takes, in percent (100 = all of it; the Brute 20). Applied inside `applyKnockback`.
     */
    knockbackTakenPct: z.number().int().min(0).max(100).default(100),
    /** Story 5.14 (D3): how long a bear trap holds this type, in percent of `bearTrap.holdS` (the Brute 50). */
    trapHoldPct: z.number().int().min(1).max(100).default(100),
    /** Story 3.8: follows the flank field (Runners) instead of the chase field. */
    flanks: z.boolean().default(false),
    /** Story 5.6: a ranged spit (Spitters); absent = no ranged attack. */
    spit: spitSchema.optional(),
    /** Story 5.7 (F5): a hit on a building does `damage × this` (Brutes 3×). */
    buildingDamageMult: z.number().min(1).default(1),
    /** Story 5.7 (F2): a hit on a standing player knocks them this far straight away (0 = none). */
    hitKnockbackM: z.number().min(0).max(5).default(0),
    /** Story 5.7: over this long (ticks on the wire: at most 2.5 s). */
    knockbackS: z.number().positive().max(2.5).default(0.2),
    /**
     * Story 5.7 (F1): before every hit on a player the zombie stands still this long (the WINDUP
     * state, streamed: the telegraph), then hits only a body within contact + `swingReachM`. 0 = an
     * instant hit (every type before the Brute). A melee windup; 5.6's ranged `spit.windupS` is its own.
     */
    windupS: z.number().min(0).max(5).default(0),
    swingReachM: z.number().min(0).max(2).default(0),
    /**
     * Story 5.7 review L1: the swing lands only when the body is closer than the reach minus this
     * (a float margin: a body exactly `swingReachM` out — a step, or the axe's 0.3 m knock during
     * the windup — is always missed, never a coin flip).
     */
    swingToleranceM: z.number().min(0).max(0.1).default(0.01),
    /**
     * Story 5.7 review M1 (designer: "long reach into gaps"): when the target stands in a slot
     * narrower than this body (the wide field is seeded from the slot's mouth), the swing reaches
     * this far, centre to centre (0 = never). Same windup, still dodged by stepping out of it, still
     * needs a clear line (`meleeLineClear`).
     */
    gapReachM: z.number().min(0).max(4).default(0),
    /**
     * Story 5.7 (D1): wider than the flow field's clearance rule allows (0.35 m): paths on the wide
     * grid (every box grown by `pathing.wideInflateM`) and follows the wide chase field.
     */
    wideBody: z.boolean().default(false),
    /** Story 5.8: bursts on contact (after a swell) and on death (Bloaters); absent = never explodes. */
    explodes: explodesSchema.optional(),
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
    /**
     * Story 5.7 (D1): the wide grid grows every map box, building and fire by this much, so a
     * `wideBody` type up to `MAX_PATHING_ZOMBIE_RADIUS_M` + this behaves like a 0.35 m body on it.
     * At most one 0.5 m cell (the rasterizer grows a box by whole cells).
     */
    wideInflateM: z.number().min(0).max(0.5).default(0.25),
    /** Story 5.7 (review L4): rings of cells searched for free cells round a player in a grown wall cell (the field's seeds). */
    wideSeedRings: z.number().int().min(1).max(12).default(6),
    /** Story 5.7 (review L4): rings searched for a reached cell round a wide body standing in a grown wall cell. */
    wideSteerRings: z.number().int().min(1).max(6).default(2),
    /**
     * Story 6.13 (6.8 review M1): the wide-body stall net. A wide body whose wide field gives it no
     * next cell (it stands at the field's end, a seed cell at the mouth of a slot too narrow for it,
     * or in a grown wall cell) while its line to the player is blocked, and that moves less than
     * `wideStuckProgressM` for `wideStuckS`, is stuck: it goes for the wall building within
     * `wideStuckReachM` nearest its target and attacks it (a Bloater swells on it).
     */
    wideStuckS: z.number().positive().refine(wholeTickS, "pathing.wideStuckS must be whole ticks").default(2),
    wideStuckProgressM: z.number().positive().default(0.25),
    wideStuckReachM: z.number().positive().max(8).default(2.5),
  })
  .strict();

/**
 * Story 3.8: the flank field (`zombies/flowField.ts`). Entering a cell within `coneRadiusM` of an
 * alive player and within ±`coneHalfAngleDeg` of their aim costs `penaltyM` extra, so flanking
 * zombies (types with `flanks`) come from the side or behind.
 */
export const flankSchema = z
  .object({
    coneHalfAngleDeg: z.number().min(0).max(90),
    coneRadiusM: z.number().positive().max(48),
    /**
     * The cone's apex sits this far behind the player's centre (along the aim), so the cone is
     * already body-wide where it starts: from the exact centre, flankers would walk in along its
     * 45° edge and still hit from the front diagonal.
     */
    coneApexBackM: z.number().min(0).max(2),
    /** Extra cost (metres of street) per penalized cell; at most 16,000 m (the penalty layer is a Uint16Array of cost units). */
    penaltyM: z.number().min(0).max(16000),
    /** Within this distance of its target a flanker goes straight in (it must eventually bite). */
    directWithinM: z.number().min(0),
    /**
     * 3.8 review H1: flanking is a time-limited commitment. A flanker that spends this long not
     * closing in (see `closingSpeedFrac`) goes straight in like a Walker until it bites or dies.
     * At most 3,000 s (the tick count is a Uint16).
     */
    maxFlankS: z.number().positive().max(3000),
    /** A tick counts as "not closing in" when the flanker got closer by less than this fraction of its speed. */
    closingSpeedFrac: z.number().min(0).max(1),
  })
  .strict();

export const zombiesSchema = z
  .object({ types: z.record(balanceId, zombieTypeSchema), crowd: crowdSchema, pathing: pathingSchema, flank: flankSchema, spitCaps: spitCapsSchema, blasts: blastsSchema })
  .strict();

export const wavesSchema = z
  .object({
    zombiesPerWave: z.number().int().positive().max(65535), // the biggest wave is checked against the Uint16 counts in balance.ts crossCheck (3.10 review)
    maxAlive: z.number().int().positive(),
    lastRushCount: z.number().int().min(0),
    /**
     * Spitter deadlock fix A (designer 2026-11-25; review L5, decision 8.2-B15): the last rush also starts once EVERY
     * remaining wave zombie has been a Spitter holding its spot for `holdS` (checked every `checkEveryTicks` ticks).
     */
    spitterStall: z.object({ holdS: z.number().min(0), checkEveryTicks: z.number().int().min(1) }).strict().default({ holdS: 8, checkEveryTicks: 10 }),
    /** Story 3.1: the build phase before wave 1 and after every wave (FR44); ends early when everyone is Ready. */
    buildPhaseS: z.number().positive(),
    /** Spawn pressure: every spawnIntervalS, up to spawnPerInterval zombies leave the queue. */
    spawnIntervalS: z.number().positive(),
    spawnPerInterval: z.number().int().positive(),
    /** Spawn points closer than this to a player are skipped. */
    spawnMinPlayerDistanceM: z.number().min(0),
    /** Spawns are jittered ±this along their edge so a batch doesn't stack. */
    spawnJitterM: z.number().min(0),
    /**
     * Story 4.3 (`waves/spawnPick.ts`): the spawn pick chooses a map side, then a point on it, each
     * weighted away from the last `recentPicks` picks: side weight = max(minWeight, baseWeight −
     * sidePenalty × picks of that side), point weight = max(minWeight, baseWeight − pointPenalty ×
     * picks of that point). When every active spawn is within the 6 m rule the batch waits up to
     * `allNearMaxWaitS`, then uses the farthest active spawn (a wave never stalls).
     */
    spawnPick: z
      .object({
        recentPicks: z.number().int().min(0).max(16),
        baseWeight: z.number().int().positive().max(1000),
        sidePenalty: z.number().int().min(0).max(1000),
        pointPenalty: z.number().int().min(0).max(1000),
        minWeight: z.number().int().positive().max(1000),
        allNearMaxWaitS: z.number().min(0),
      })
      .strict(),
    /** Story 3.10: clearing this wave ends the run ("You held out!"). Story 6.1: 10 (Epic 6); Story 6.11 opens the vote after it. */
    runWaves: z.number().int().min(1).max(255),
    /**
     * Story 3.10 (FR31): wave size × this, by the number of players in the run when the wave starts
     * (index 0 = solo … 3 = 4 players). GDD: × 0.6 (2), × 0.8 (3), × 1.0 (4); solo × 0.4 (designer note).
     */
    playerCountScale: z.array(z.number().gt(0).max(1)).length(4),
    /**
     * Story 3.10 (FR29): the zombie types of each wave as integer weights per type (index = wave − 1;
     * later waves use the last entry). Counts per type are exact shares of the wave size, spread
     * evenly through the wave. `loadBalance` checks every type exists in `zombies.json`.
     */
    mix: z
      .array(
        z
          .record(balanceId, z.number().int().min(0).max(1000))
          .refine((m) => Object.values(m).some((w) => w > 0), "a wave mix needs a positive weight"),
      )
      .min(1),
    /**
     * Story 5.7 (FR29): exact zombies per type in wave i + 1, NOT scaled by player count (one Brute
     * in waves 5 and 6 at every party size). Part of the wave size (taken off the mix's share,
     * Walkers first). Waves past the list have none (unlike `mix`): later epics only add entries.
     */
    fixed: z.array(z.record(balanceId, z.number().int().min(0).max(255))).default([]),
    /** Story 5.7: the first fixed zombie of a wave spawns once this fraction of the wave has spawned (not in the opening burst). */
    fixedAtFraction: z.number().min(0).max(1).default(0.25),
    /**
     * Story 6.1 (D1): the spawn point of the k-th fixed zombie of a wave (counted over all fixed
     * types in `ZOMBIE_TYPES` order) as a fraction of the wave: it waits until round(size × this)
     * wave zombies have spawned. `[0.25, 0.65]`: the two Brutes of waves 7–10 come at 25 % and 65 %.
     * Ascending, each in [0, 1); empty = `fixedAtFraction` for every fixed zombie (D-A). When not
     * empty, `loadBalance` requires it to cover the biggest `fixed` entry.
     */
    fixedAtFractions: z
      .array(z.number().min(0).lt(1))
      .refine((a) => a.every((v, i) => i === 0 || v >= (a[i - 1] as number)), "fixedAtFractions must be ascending")
      .default([]),
    /**
     * Story 6.11: the evacuation vote. It opens after clearing wave `runWaves` (the single source:
     * no separate `firstWave` key to keep equal, so every `runWaves` override moves it too) and lasts `voteS`; once every player voted it ends `allVotedHoldS`
     * later (D3). `dawnS`: the client's dawn after Extract. `padRadiusM`: the helicopter pad's drawn
     * ring (the centre is map data: the `evac_pad` event spot). Story 6.12: in endless a vote also
     * opens after every `everyWaves`-th wave past `runWaves` (15, 20, 25…).
     */
    evac: z
      .object({
        voteS: z.number().positive().max(120).default(15),
        allVotedHoldS: z.number().min(0).max(10).default(1),
        dawnS: z.number().min(0).max(30).default(4),
        everyWaves: z.number().int().min(1).max(100).default(5),
        padRadiusM: z.number().positive().max(10).default(3),
        /**
         * Story 12.2: the extraction after an Extract vote. `descendS`: the helicopter's descent from the vote's
         * opening (nobody boards before it is on the pad; the client's `DESCEND_S` draws the same 2 s).
         * `walkTimeoutS`: from the extract's start, everyone not yet boarded is boarded anyway (`run.extract_cut`).
         * `liftBeatS`: the beat between the last boarding and the lift-off. `flyOutS`: the fly-out (the sim keeps
         * stepping, then Results). `flyOutHorde`: the extraction horde from lift-off (`count` zombies of `type`,
         * `perS` a second, from the wave spawn points; no wave, no bounty, no kills).
         */
        descendS: z.number().min(0).max(10).default(2),
        walkTimeoutS: z.number().positive().max(60).default(8),
        liftBeatS: z.number().min(0).max(5).default(0.5),
        flyOutS: z.number().positive().max(30).default(8),
        flyOutHorde: z
          .object({
            count: z.number().int().min(0).max(200).default(40),
            perS: z.number().positive().max(100).default(8),
            type: z.enum(["walker"]).default("walker"), // review nit: walkers only (no Bloater swell, no Spitter acid in a phase where nothing hurts)
          })
          .strict()
          .default({ count: 40, perS: 8, type: "walker" }),
      })
      .strict()
      // Story 12.2 review L2: the walk's timeout cut must come after the landing (no boarding, beat or cut before it).
      .refine((e) => e.walkTimeoutS > e.descendS, "evac.walkTimeoutS must be greater than evac.descendS")
      .default({ voteS: 15, allVotedHoldS: 1, dawnS: 4, everyWaves: 5, padRadiusM: 3, descendS: 2, walkTimeoutS: 8, liftBeatS: 0.5, flyOutS: 8, flyOutHorde: { count: 40, perS: 8, type: "walker" } }),
    /**
     * Story 6.12: endless waves (past `runWaves`, after Stay). Size `min(N × zombiesPerWave,
     * maxZombiesPerWave)` × the party scale (F1); every zombie spawned in wave N > `hpGrowthFromWave`
     * has `1 + hpGrowthPerWave × (N − hpGrowthFromWave)` × HP (F2); `N − (brutesFirstWave −
     * brutesAtFirstWave)` Brutes spread from `bruteFromFraction` to `bruteToFraction` of the wave,
     * at most `brutesMaxAlive` alive (F3); a Behemoth every `bossEveryWaves`-th wave past `runWaves`
     * with `1 + bossHpGrowthPerBoss × k` × HP (F4); odd waves reuse wave `oddWaveMix`'s mix, even
     * waves wave `evenWaveMix`'s (D5); `eventEvenWaves`: one special event on even non-boss waves (F6).
     * The light rule is `decay.json › blackout.endlessOddWaves / endlessEvenHalfDark` (6.3's block).
     */
    endless: z
      .object({
        maxZombiesPerWave: z.number().int().positive().max(65535).default(600),
        hpGrowthFromWave: z.number().int().min(1).max(255).default(15),
        hpGrowthPerWave: z.number().min(0).max(1).default(0.06),
        brutesFirstWave: z.number().int().min(1).max(255).default(11),
        brutesAtFirstWave: z.number().int().min(0).max(255).default(3),
        brutesPerWave: z.number().int().min(0).max(10).default(1),
        brutesMaxAlive: z.number().int().min(1).max(64).default(6),
        bruteFromFraction: z.number().min(0).lt(1).default(0.25),
        bruteToFraction: z.number().min(0).lt(1).default(0.9),
        bossEveryWaves: z.number().int().min(1).max(100).default(5),
        bossHpGrowthPerBoss: z.number().min(0).max(10).default(0.25),
        eventEvenWaves: z.boolean().default(true),
        oddWaveMix: z.number().int().min(1).max(255).default(9),
        evenWaveMix: z.number().int().min(1).max(255).default(10),
      })
      .strict()
      .refine((e) => e.bruteToFraction >= e.bruteFromFraction, "endless.bruteToFraction must be ≥ bruteFromFraction")
      .default({
        maxZombiesPerWave: 600,
        hpGrowthFromWave: 15,
        hpGrowthPerWave: 0.06,
        brutesFirstWave: 11,
        brutesAtFirstWave: 3,
        brutesPerWave: 1,
        brutesMaxAlive: 6,
        bruteFromFraction: 0.25,
        bruteToFraction: 0.9,
        bossEveryWaves: 5,
        bossHpGrowthPerBoss: 0.25,
        eventEvenWaves: true,
        oddWaveMix: 9,
        evenWaveMix: 10,
      }),
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
    // Story 5.11 re-review: the synced revive need (`reviveNeed`) is a uint8 of ticks.
    reviveS: z.number().positive().refine((s) => Math.round(s * TICK_RATE_HZ) <= 255, "reviveS × 20 must fit the uint8 reviveNeed"),
    reviveRadiusM: z.number().positive(),
    /** HP after a revive, as a fraction of max HP. */
    reviveHpFrac: z.number().gt(0).max(1),
    /** Story 6.3 (F3): the free flashlight every standing survivor has in a blackout (full cone angle in degrees, range m). */
    flashlight: z
      .object({ coneDeg: z.number().positive().max(179), rangeM: z.number().positive().max(30) })
      .strict()
      .default({ coneDeg: 60, rangeM: 8 }),
    /**
     * Story 3.1: each build phase heals every player by this fraction of max HP (capped at max);
     * downed and out players return standing with this much (FR9).
     */
    buildHealFrac: z.number().gt(0).max(1),
    /** Retro A12: a returning player is placed on the first free spot in this many rings of `spawnOffsetM` around the teammate. */
    returnSearchRings: z.number().int().min(1),
    /**
     * Story 4.1 review L4: when those rings are all taken, the search widens to this many rings
     * (still free of players and zombies), then the team starts, then a spot clear of map boxes and
     * buildings only: a returning player is never placed inside a box.
     */
    returnWideSearchRings: z.number().int().min(1),
    /** Story 8.1 (D3): spawn protection after a mid-wave return from a hold, in ticks (40 = 2 s). */
    returnProtectTicks: z.number().int().min(0).max(255),
    /** Review M1 / decision 8.1 B15: a hold shorter than this (ticks; 60 = 3 s, the quiet rule) returns in place, unprotected. */
    returnMinHoldTicks: z.number().int().min(0),
  })
  .strict();

/** Touch control tuning (Story 1.12 playtest tunes these). Dead zones are fractions of the stick radius. */
/**
 * Story 5.2 (brief line 12): caps of client-only effect pools (fixed size, the oldest reused),
 * `controls.json › fx`. Read by the client only; not gameplay.
 */
export const fxSchema = z
  .object({
    /** Heavy melee swing arcs (the Fire Axe) alive at once. */
    maxSwingArcs: z.number().int().min(1).max(64),
    /** Chainsaw sparks alive at once. */
    maxChainsawSparks: z.number().int().min(1).max(256),
    /** Sparks per chainsaw tick that cuts at least one zombie (fewer when the blade cuts air). */
    chainsawSparksPerHit: z.number().int().min(1).max(16),
    chainsawSparksPerMiss: z.number().int().min(0).max(16),
    /** A spark lives this long (ms). */
    chainsawSparkMs: z.number().int().min(16).max(1000),
    /** The rev loop stops this long after the last chainsaw tick (ms). */
    chainsawRevHoldMs: z.number().int().min(50).max(1000),
    /** Story 5.8: Bloater burst particles (bile drops, cloth scraps, gas puffs) alive at once, all bursts together. */
    maxBloaterParticles: z.number().int().min(16).max(1024).default(240),
    /** Story 5.8: fuse rings drawn at once (one per swelling Bloater on screen). */
    maxFuseRings: z.number().int().min(1).max(64).default(16),
    /** Story 5.10 (D4 fallback, measured): floodlight pools drawn at once (nearest the camera centre; phone FPS cap). */
    maxFloodLights: z.number().int().min(1).max(32).default(4),
    /** Story 5.10: floodlights are drawn when within this margin (m) of the view (their pool reaches in). */
    floodLightViewMarginM: z.number().min(0).max(16).default(2),
    /** Story 5.10 (D4 fallback): a floodlight within this distance (m) of a drawn one shares its pool. */
    floodLightMergeM: z.number().min(0).max(16).default(4),
    /** Designer pick C (2026-11-25): silhouettes of bodies behind standing walls drawn at once (pooled, capped). */
    maxWallSilhouettes: z.number().int().min(1).max(64).default(24),
    /** Story 9.13 (B4): zombies drawn with the full animation (walk crossfade, glow, sheen), nearest the camera first; the rest step their walk pictures and breathe only. `?fx=low` halves every Story 9.13 cap. */
    maxCharacterAnim: z.number().int().min(0).max(256).default(12),
    /** Story 9.13 (B5): of those, the ones that also get the moving sheen. */
    maxCharacterSheen: z.number().int().min(0).max(256).default(6),
    /** Story 9.13 (B6): Bloaters drawn with their glowing veins and acid sacs. */
    maxBloaterFx: z.number().int().min(0).max(32).default(6),
    /** Story 9.13 (B7): Spitters drawn dripping acid. */
    maxSpitterDrips: z.number().int().min(0).max(32).default(8),
    /** Story 5.23: placement dust particles alive at once (8 per puff; the oldest puff reused). */
    maxPlaceDust: z.number().int().min(8).max(512).default(64),
    /** Story 5.23: owner corner tabs (3 s after a placement) drawn at once (the oldest reused). */
    maxOwnerTabs: z.number().int().min(1).max(64).default(12),
  })
  .strict();

/** Story 5.15: carrying a building ghost in a build phase (client presentation; the server judges with placementError). */
export const buildControlsSchema = z
  .object({
    /** The ghost's near edge sits this far beyond the survivor's body along the carry facing (m). */
    carryGapM: z.number().min(0).max(4),
    /** A lattice index changes only once the continuous corner is this far past the half-cell boundary (m; < half a cell). */
    snapHysteresisM: z.number().min(0).max(0.24),
    /** Auto-rotate switches N/S ↔ E/W only when the facing is this many degrees past a 45° diagonal. */
    autoRotateHysteresisDeg: z.number().min(0).max(44),
    /** Story 5.17: a shown block reason stays at least this long before the ghost looks valid again (ms; presentation only). */
    reasonHoldMs: z.number().min(0).max(2000).default(250),
    /** Story 5.18: a sent placement with no `building.placed` / `building.refused` after this long is treated as refused (ms). */
    pendingTimeoutMs: z.number().int().min(250).max(10000).default(2000),
    /** Story 5.18: the least time between two `building.place` sends from this client (ms; 250 = at most 4/s, the guard allows 10/s). */
    chainSendGapMs: z.number().int().min(150).max(2000).default(250),
    /** Story 5.18: the chain jump is the footprint along the jump axis, but at least this far (m; a 0.5 m mine jumps 1.0 m). */
    chainMinStepM: z.number().min(0.5).max(4).default(1),
    /** Story 5.18 (Q2): build-bar taps this soon after the hand empties pick nothing (ms; they were meant for Place). */
    barQuietMs: z.number().int().min(0).max(2000).default(300),
    /** Story 5.19: a right-thumb drag moves the ghost by the finger's movement × this (1 = 1:1 on screen). */
    dragGain: z.number().min(0.25).max(3).default(1),
    /** Story 5.19: a right-half touch becomes a drag (and pins the ghost) after this much travel (CSS px). */
    dragStartPx: z.number().int().min(2).max(40).default(8),
    /** Story 5.20: the undo chip ↶ shows this long after each Place (ms; designer: 10 s). */
    undoWindowMs: z.number().int().min(1000).max(60000).default(10000),
    /**
     * Story 5.21 (ux-spec §5): a touch held this long (ms) on my own building, within the tap slop,
     * picks it up (BX-8); the ring round the finger starts filling at `longPressRingMs`.
     */
    longPressMs: z.number().int().min(300).max(2000).default(450),
    longPressRingMs: z.number().int().min(0).max(1000).default(150),
  })
  .strict();

export const controlsSchema = z
  .object({
    moveDeadZone: z.number().min(0).max(0.9),
    aimDeadZone: z.number().min(0).max(0.9),
    aimAssistDeg: z.number().min(0).max(45),
    /** Story 5.2: client effect caps (no new balance file: every test fixture lists the files). */
    fx: fxSchema,
    build: buildControlsSchema.default({ carryGapM: 1, snapHysteresisM: 0.1, autoRotateHysteresisDeg: 10, reasonHoldMs: 250, pendingTimeoutMs: 2000, chainSendGapMs: 250, chainMinStepM: 1, barQuietMs: 300, dragGain: 1, dragStartPx: 8, undoWindowMs: 10000, longPressMs: 450, longPressRingMs: 150 }),
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
    /**
     * Story 8.2 (FR72, Epic 8 D6/D7, decisions E8-J1/E8-J4): a late joiner's money and the build time a join adds.
     * Money = max(own start money, `base` + ⌊`avgShare` × team average earned⌋); the first late join in a build
     * phase adds `extraBuildS` seconds (whole ticks).
     */
    lateJoin: z
      .object({
        base: z.number().int().min(0),
        avgShare: z.number().min(0).max(1),
        extraBuildS: z.number().min(0).max(120),
      })
      .strict(),
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
    /**
     * Story 5.6 (merge with 5.3): the nearest zombie stands beyond my weapon's range but within range
     * + this (a Spitter holding 6 m against the 5 m Shotgun): step toward it. 0 = never close in.
     */
    closeInExtraM: z.number().min(0).default(0),
    /** Farther than this from the centre of the alive team: move toward it. */
    regroupDistM: z.number().min(0),
    /** A downed teammate within this: go and revive them. */
    reviveSearchM: z.number().min(0),
    /** Stop this close to the downed teammate (inside `player.reviveRadiusM`, so the revive runs). */
    reviveStopM: z.number().min(0),
    /**
     * Story 3.10: shop item ids (weapons and building types) bought in this order in every build
     * phase (`bots/botShop.ts`): stop at the first one the wallet can't pay (save up); a building
     * type listed k times means "own k". Story 5.1: `upgrade:<weapon>` upgrades a held weapon (listed
     * k times: "at level ≥ k + 1").
     */
    shoppingList: z
      // Story 5.12: consumable ids too (a consumables.json key: fill / refill the slot).
      .array(z.union([balanceId, z.string().regex(/^upgrade:[a-z][a-z0-9_]*$/, "an upgrade entry is upgrade:<weapon id>")]))
      .max(31)
      .default([]),
    /**
     * Story 5.13: a bot rerolls its card offer at most this many times per build phase (only while
     * nothing it wants is on offer and the wallet covers the reroll plus the cheapest wanted card).
     */
    maxRerollsPerBuild: z.number().int().min(0).max(10).default(2),
    /** Story 3.10: a bot tries to place a building at these distances (m) around itself, 8 directions each. */
    buildRadiiM: z.array(z.number().positive().max(8)).min(1).max(4).default([2.5]),
    /** Story 5.12: a bot uses its medkit below this share of its max HP. */
    medkitBelowHpFrac: z.number().min(0).max(1).default(0.4),
    /** Story 5.12: a bot throws a grenade / molotov at the densest zombie within throw range when at least this many stand within its radius. */
    throwClusterMin: z.number().int().min(1).max(64).default(5),
    /** Story 6.8: a bot keeps this far (m) outside an active stampede's lane. */
    laneMarginM: z.number().min(0).max(8).default(1),
    /** Story 6.8: rule 2c's strafe changes side every this many input seqs (64 = 3.2 s at 20 Hz). */
    strafeFlipSeqs: z.number().int().min(1).max(10_000).default(64),
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
 * Story 5.9: a spike trap. A zombie whose body overlaps the trap square fills its own spike clock;
 * every `pulseS` of time on a trap it takes `damagePerS × pulseS` (whole) and the trap loses
 * `wearPerHit` HP; while on it, it moves `slowPct` % slower (never stacked).
 */
export const trapSchema = z
  .object({
    damagePerS: z.number().positive(),
    pulseS: z.number().positive().max(5),
    slowPct: z.number().int().min(0).max(100),
    wearPerHit: z.number().int().min(0),
  })
  .strict()
  .refine((t) => Math.abs(t.damagePerS * t.pulseS - Math.round(t.damagePerS * t.pulseS)) < 1e-9 && Math.round(t.damagePerS * t.pulseS) >= 1, "damagePerS × pulseS must be a whole number ≥ 1")
  .refine((t) => Math.abs(t.pulseS * TICK_RATE_HZ - Math.round(t.pulseS * TICK_RATE_HZ)) < 1e-9, "pulseS must be a whole number of ticks");

/**
 * Story 5.9: a mine. A zombie body overlapping the `triggerRadiusM` circle round its centre sets it
 * off (same tick); every zombie body overlapping the `blastRadiusM` circle with a clear shot line
 * takes `damage`, standing players `damage × playerShare`.
 */
export const mineSchema = z
  .object({
    triggerRadiusM: z.number().positive().max(8),
    blastRadiusM: z.number().positive().max(8),
    damage: z.number().positive(),
    playerShare: z.number().min(0).max(1),
  })
  .strict()
  .refine((m) => m.blastRadiusM >= m.triggerRadiusM, "blastRadiusM must be at least triggerRadiusM");

/**
 * Story 5.14: a bear trap (floor). During a wave the tick an alive zombie's CENTRE is strictly within
 * `plateRadiusM` of an armed trap's centre, the jaws close: `snapDamage`, and that one zombie is held
 * (can't move or be pushed, still attacks) for `holdS` (× the type's `trapHoldPct`). Then the trap is
 * sprung (harmless) and worn `wearPerCatch` HP; a standing player whose body overlaps the plate circle
 * for `rearmS` without a break re-arms it (and every trap re-arms at a build start).
 */
export const bearTrapSchema = z
  .object({
    plateRadiusM: z.number().positive().max(4),
    holdS: z.number().positive().max(30),
    snapDamage: z.number().int().min(0),
    wearPerCatch: z.number().int().min(0),
    rearmS: z.number().positive().max(10),
  })
  .strict()
  .refine((b) => wholeTicks(b.holdS) && wholeTicks(b.rearmS), "bearTrap holdS and rearmS must be whole numbers of ticks");

/**
 * Story 5.10: a building that lights the street (floodlight). Gameplay effect only from Story 6.3
 * (blackout reads `world.lights`): `radiusM` normally, `blackoutRadiusM` during a blackout wave
 * (Epic 6 D5). The client draws a glow pool of `radiusM`.
 */
export const lightSchema = z
  .object({
    radiusM: z.number().positive().max(16),
    /** Epic 6 D5: the radius during a blackout wave (Story 6.3 switches to it). */
    blackoutRadiusM: z.number().positive().max(16),
  })
  .strict()
  .refine((l) => l.blackoutRadiusM >= l.radiusM, "blackoutRadiusM must be at least radiusM");

/**
 * Story 5.10: a med station. An alive player whose body circle overlaps the `radiusM` circle round
 * its centre (strict) gains `hpPerS × TICK_DT_S` per tick, capped at their maxHp; stations never stack.
 */
export const healSchema = z
  .object({
    radiusM: z.number().positive().max(8),
    hpPerS: z.number().positive().max(100),
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
    // ---- Story 5.9 (walls vs floor, upgrades, traps, mines) ----
    /** Story 5.9: true = a wall (blocks bodies and the flow field, zombies attack it); false = floor (traps, mines). */
    solid: z.boolean().default(true),
    /**
     * Bullets stop on it (designer 2026-11-23: the barricade tiers): every player's and turret's shot,
     * aim assist and turret targeting. Only a wall (`solid`) may; an upgrade keeps it. Explosions,
     * flames, melee and acid don't read it.
     */
    stopsBullets: z.boolean().default(false),
    /** Story 5.9: false = only reached by an upgrade (never in the shop, refused by placement). */
    forSale: z.boolean().default(true),
    /** Story 5.9: the next tier and what the step costs (the target's `price` is the total paid: F9). */
    upgradesTo: z.object({ type: balanceId, price: z.number().int().positive() }).strict().optional(),
    /** Story 5.9: a spike trap (floor): damages and slows zombies standing on it, per body. */
    trap: trapSchema.optional(),
    /** Story 5.9: a mine (floor, single use): a zombie touching the trigger circle sets off the blast. */
    mine: mineSchema.optional(),
    // ---- Story 5.10 (floodlight, med station) ----
    /**
     * Story 5.10: false = placeable but not offered yet (the floodlight until Story 6.3): not listed
     * by the shop, refused `not_for_sale` by placement unless the dev balance unhides it (`loadDevBalance({ shopAll })`).
     * Different from `forSale: false` (upgrade-only tiers, never placed at all).
     */
    inShop: z.boolean().default(true),
    /** Story 5.10: lights the street (a light source in `world.lights`). */
    light: lightSchema.optional(),
    /** Story 5.10: heals alive players touching the ring. */
    heal: healSchema.optional(),
    // ---- Story 5.14 (bear trap) ----
    /** Story 5.14: a bear trap (floor): grabs one zombie stepping on its plate and holds it. */
    bearTrap: bearTrapSchema.optional(),
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
    /**
     * Story 5.20 (F2): selling a building placed before this build phase refunds this share of what
     * was paid for it before this phase, rounded down (designer: 50 %); this phase's spend comes back
     * 100 %. Equal to `repairShare` so selling and rebuilding costs exactly a repair (no money loop).
     */
    sellShare: z.number().min(0).max(1).default(0.5),
    types: z.record(balanceId, buildingTypeSchema),
  })
  .strict();

/** Story 5.13: one rarity tier of the card shop (by price, D2). `maxPrice: null` = no upper bound (the last tier). */
const rarityTierSchema = z
  .object({
    id: balanceId,
    maxPrice: z.number().int().positive().nullable(),
    weight: z.number().int().positive(),
  })
  .strict();

/**
 * Story 5.13: the roguelike card shop (replaced Story 3.3's fixed weapon list). Weapon and gear
 * cards are drawn per player and build (`economy/shopCards.ts`); prices stay on the items
 * (`weapons.json › price`, `gear.json › items.*.price`). `loadBalance` checks the excluded ids exist.
 */
export const shopSchema = z
  .object({
    /**
     * Story 5.1: weapon upgrades I–IV (GDD › Weapon Systems › Upgrades). Level L deals
     * `damage × (1 + damagePerLevel × (L − 1))`; every level costs `round(priceShare × upgrade base)`
     * (`upgradeBasePrice`, else `price`). `maxLevel` ≤ 4: levels I–IV are the design (the HUD/shop
     * marks and the atlas frames cover II–IV only; 5.1 review L1).
     */
    upgrades: z
      .object({
        maxLevel: z.number().int().min(1).max(4),
        damagePerLevel: z.number().min(0),
        priceShare: z.number().positive(),
      })
      .strict(),
    /** Story 5.13: cards per offer (D1: 6). */
    cards: z.number().int().min(1).max(6),
    /** Story 5.13: at least this many weapon / gear cards whenever the pool has them (D1: 1 + 1). */
    floor: z.object({ weapon: z.number().int().min(0), gear: z.number().int().min(0) }).strict(),
    /** Story 5.13: reroll price = `price + stepPerReroll × rerolls this build` (D3: flat 20). */
    reroll: z.object({ price: z.number().int().min(0), stepPerReroll: z.number().int().min(0) }).strict(),
    /** Story 5.13 (D6): card price × (1 + scale × build), rounded once; 0 = fixed prices. */
    priceScalePerBuild: z.number().min(0),
    /** Story 5.13 (D2): rarity tiers by price, ascending; the last has `maxPrice: null`. */
    rarity: z.array(rarityTierSchema).min(1).max(4),
    /** Story 5.13 (D7): item ids never drawn as cards (the Pistol). */
    excludeFromCards: z.array(balanceId),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.floor.weapon + s.floor.gear > s.cards) ctx.addIssue({ code: "custom", path: ["floor"], message: "floor.weapon + floor.gear must be ≤ cards" });
    s.rarity.forEach((t, i) => {
      const last = i === s.rarity.length - 1;
      if (last !== (t.maxPrice === null)) ctx.addIssue({ code: "custom", path: ["rarity", i, "maxPrice"], message: "only the last tier has maxPrice null" });
      const prev = i > 0 ? s.rarity[i - 1]?.maxPrice : null;
      if (i > 0 && t.maxPrice !== null && prev !== null && prev !== undefined && t.maxPrice <= prev) ctx.addIssue({ code: "custom", path: ["rarity", i, "maxPrice"], message: "tiers must ascend" });
    });
  });

/** Story 6.3: the blackout defaults (every `lightPctByWave` entry 0; Story 6.4 sets waves 9–10 and `halfDarkInBuild` in decay.json). */
export const BLACKOUT_DEFAULTS = {
  lightPctByWave: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  powerFailureLightPct: 20,
  endlessLightPct: 5,
  halfDarkK: 0.5,
  halfDarkInBuild: false,
  endlessOddWaves: true,
  endlessEvenHalfDark: true,
  glowM: 1.6,
  fireLightM: 4,
  muzzleLightM: 3,
  muzzleLightS: 0.1,
  turretMuzzleLight: true,
  flameLightM: 3,
  explosionLightM: 5,
  explosionLightS: 0.15,
  molotovLight: true,
  eyesM: 14,
  maxStamps: 48,
  maxEyes: 150,
  maxSparkles: 160,
  rainK: 0.35,
  hazardAboveDarkPct: 10,
};

/**
 * Story 6.3: blackout lighting (FR64, FR87). `lightPctByWave[n − 1]` is the light (percent of
 * normal) unlit ground keeps in wave n (0 = no blackout; waves past the table: 0, 6.12 adds the
 * endless rule); a power failure (6.10) gives `powerFailureLightPct`; build phases are drawn at
 * `halfDarkK` of the darkness when `halfDarkInBuild` (6.4). The rest are light-source radii (m),
 * flash lengths (s) and client caps. The sim reads none of it for gameplay (F8).
 */
export const blackoutSchema = z
  .object({
    lightPctByWave: z.array(z.number().int().min(0).max(100)).min(1).max(64).default(BLACKOUT_DEFAULTS.lightPctByWave),
    powerFailureLightPct: z.number().int().min(1).max(100).default(BLACKOUT_DEFAULTS.powerFailureLightPct),
    endlessLightPct: z.number().int().min(1).max(100).default(BLACKOUT_DEFAULTS.endlessLightPct),
    halfDarkK: z.number().gt(0).max(1).default(BLACKOUT_DEFAULTS.halfDarkK),
    halfDarkInBuild: z.boolean().default(BLACKOUT_DEFAULTS.halfDarkInBuild),
    /** Story 6.12 (F5): odd endless waves (11, 13, 15…) are blackout waves at `endlessLightPct`. */
    endlessOddWaves: z.boolean().default(true),
    /** Story 6.12 (D3): even endless waves are drawn at `endlessLightPct` at half strength (`halfDarkK`), like a stage-5 build phase. */
    endlessEvenHalfDark: z.boolean().default(true),
    /** F2: the glow round every standing/downed survivor (crossCheck: > every zombie radius + the player's). */
    glowM: z.number().positive().max(4).default(BLACKOUT_DEFAULTS.glowM),
    fireLightM: z.number().positive().max(16).default(BLACKOUT_DEFAULTS.fireLightM),
    muzzleLightM: z.number().positive().max(8).default(BLACKOUT_DEFAULTS.muzzleLightM),
    muzzleLightS: z.number().positive().max(1).default(BLACKOUT_DEFAULTS.muzzleLightS),
    turretMuzzleLight: z.boolean().default(BLACKOUT_DEFAULTS.turretMuzzleLight),
    flameLightM: z.number().positive().max(8).default(BLACKOUT_DEFAULTS.flameLightM),
    explosionLightM: z.number().positive().max(16).default(BLACKOUT_DEFAULTS.explosionLightM),
    explosionLightS: z.number().positive().max(1).default(BLACKOUT_DEFAULTS.explosionLightS),
    molotovLight: z.boolean().default(BLACKOUT_DEFAULTS.molotovLight),
    /** F4: zombies within this of the local survivor show eyes above the darkness. */
    eyesM: z.number().positive().max(40).default(BLACKOUT_DEFAULTS.eyesM),
    /** Client caps (brief 12): light stamps per frame, eye images, beam sparkles. */
    maxStamps: z.number().int().min(4).max(256).default(BLACKOUT_DEFAULTS.maxStamps),
    maxEyes: z.number().int().min(0).max(512).default(BLACKOUT_DEFAULTS.maxEyes),
    maxSparkles: z.number().int().min(0).max(1024).default(BLACKOUT_DEFAULTS.maxSparkles),
    /** D7: the normal rain's alpha × this in a blackout (faint over the dark; beams sparkle instead). */
    rainK: z.number().min(0).max(1).default(BLACKOUT_DEFAULTS.rainK),
    /** Designer 6.3 B3: acid puddles and Bloater gas show above the darkness at this % of their look (full inside light). */
    hazardAboveDarkPct: z.number().min(0).max(100).default(BLACKOUT_DEFAULTS.hazardAboveDarkPct),
  })
  .strict();

/** Story 6.2: the shipped Ruins values (stage 4). */
export const RUINS_DEFAULTS = {
  lampOutMinS: 0.15,
  lampOutMaxS: 0.6,
  lampGapMinS: 4,
  lampGapMaxS: 10,
  dustGapMinS: 0.6,
  dustGapMaxS: 1.6,
  maxDustSmoke: 40,
  maxDustGrit: 60,
  collapseBurstS: 2,
};

/**
 * Story 6.2 (Ruins, client look only; F6/F7): each streetlight drops out for `lampOutMinS`–`lampOutMaxS`
 * every `lampGapMinS`–`lampGapMaxS` (keyed to the run seed and the World tick, so every phone agrees);
 * a falling-debris dust puff every `dustGapMinS`–`dustGapMaxS` within the view (pooled: at most
 * `maxDustSmoke` + `maxDustGrit` particles, halved with `?fx=low`); the stage-4 collapse burst lasts
 * `collapseBurstS`. Nothing here changes the game.
 */
export const ruinsSchema = z
  .object({
    lampOutMinS: z.number().positive().max(5).default(RUINS_DEFAULTS.lampOutMinS),
    lampOutMaxS: z.number().positive().max(5).default(RUINS_DEFAULTS.lampOutMaxS),
    lampGapMinS: z.number().positive().max(60).default(RUINS_DEFAULTS.lampGapMinS),
    lampGapMaxS: z.number().positive().max(60).default(RUINS_DEFAULTS.lampGapMaxS),
    dustGapMinS: z.number().positive().max(30).default(RUINS_DEFAULTS.dustGapMinS),
    dustGapMaxS: z.number().positive().max(30).default(RUINS_DEFAULTS.dustGapMaxS),
    maxDustSmoke: z.number().int().min(0).max(256).default(RUINS_DEFAULTS.maxDustSmoke),
    maxDustGrit: z.number().int().min(0).max(256).default(RUINS_DEFAULTS.maxDustGrit),
    collapseBurstS: z.number().positive().max(10).default(RUINS_DEFAULTS.collapseBurstS),
  })
  .strict()
  .refine((r) => r.lampOutMinS <= r.lampOutMaxS, "lampOutMinS must be ≤ lampOutMaxS")
  .refine((r) => r.lampGapMinS <= r.lampGapMaxS, "lampGapMinS must be ≤ lampGapMaxS")
  .refine((r) => r.lampGapMinS > r.lampOutMaxS, "a lamp's gap must be longer than its longest drop-out")
  .refine((r) => r.dustGapMinS <= r.dustGapMaxS, "dustGapMinS must be ≤ dustGapMaxS");

/** Story 6.4: the shipped Collapse values (stage 5). */
export const COLLAPSE_DEFAULTS = {
  powerOutFromStage: 5,
  fog: { fromStage: 5, waveClearM: 9, waveRadiusM: 10, buildClearM: 13, buildRadiusM: 14 },
  growlMinS: 6,
  growlMaxS: 14,
  maxAshFlakes: 128,
};

/**
 * Story 6.4 (Collapse; FR63, FR87). From `powerOutFromStage` the streetlights, shop glow, neon, the
 * canopy and the running car's lights are off (floodlights and fires stay lit). From `fog.fromStage`
 * a zombie farther than `…ClearM` from your survivor fades out, hidden beyond `…RadiusM` (wave / build
 * phase), unless a standing survivor's beam shows it; touch aim assist never snaps to a zombie your
 * fog hides. Sound: a distant growl every `growlMinS`–`growlMaxS`; CO3's ash pool is capped.
 */
export const collapseSchema = z
  .object({
    powerOutFromStage: z.number().int().min(1).max(5).default(COLLAPSE_DEFAULTS.powerOutFromStage),
    fog: z
      .object({
        fromStage: z.number().int().min(1).max(5),
        waveClearM: z.number().positive().max(60),
        waveRadiusM: z.number().positive().max(60),
        buildClearM: z.number().positive().max(60),
        buildRadiusM: z.number().positive().max(60),
      })
      .strict()
      .refine((f) => f.waveClearM < f.waveRadiusM, "waveClearM must be < waveRadiusM")
      .refine((f) => f.buildClearM < f.buildRadiusM, "buildClearM must be < buildRadiusM")
      .default(COLLAPSE_DEFAULTS.fog),
    growlMinS: z.number().positive().max(120).default(COLLAPSE_DEFAULTS.growlMinS),
    growlMaxS: z.number().positive().max(120).default(COLLAPSE_DEFAULTS.growlMaxS),
    maxAshFlakes: z.number().int().min(0).max(512).default(COLLAPSE_DEFAULTS.maxAshFlakes),
  })
  .strict()
  .refine((c) => c.growlMinS <= c.growlMaxS, "growlMinS must be ≤ growlMaxS");

/**
 * Story 4.5: the decay timeline (GDD › Level Progression; FR58). `stageByWave[n - 1]` is the decay
 * stage of wave n (waves past the table keep its last stage); it is applied at the start of the
 * build phase before that wave, never mid-wave.
 */
export const decaySchema = z
  .object({
    /** Stage (1–5) per wave, wave 1 first; never decreasing. */
    stageByWave: z
      .array(z.number().int().min(1).max(5))
      .min(1)
      .refine((s) => s.every((v, i) => i === 0 || v >= (s[i - 1] as number)), "stages never go back"),
    /** Banner name per stage, stage 1 first (exactly 5). */
    stageNames: z.array(z.string().min(1).max(24)).length(5),
    // Story 12.4 (CN-6): `buildingRefundShare` is gone (decay losses are never refunded); `.strict()` rejects an old override that still sets it.
    /** Rings (spawnOffsetM apart) searched for a free spot when a stage puts a solid on a body. */
    relocateSearchRings: z.number().int().min(1).max(64),
    /**
     * Story 4.8: car fires (FR57, FR61). A zone of `radiusM` round the burning car's centre; every
     * `pulseS` each body inside takes `damagePerS × pulseS` (whole: building HP is whole); a fire lit
     * at the build start before wave w goes out at the build start before wave w + `durationWaves`;
     * each fire cell costs zombies `navCostM` of path (a cost, not a wall).
     */
    fire: z
      .object({
        radiusM: z.number().positive().max(8),
        damagePerS: z.number().positive(),
        pulseS: z.number().positive().max(5),
        durationWaves: z.number().int().min(1).max(10),
        navCostM: z.number().positive().max(200),
      })
      .strict()
      .refine((f) => Math.abs(f.damagePerS * f.pulseS - Math.round(f.damagePerS * f.pulseS)) < 1e-9 && Math.round(f.damagePerS * f.pulseS) >= 1, "damagePerS × pulseS must be a whole number ≥ 1 (building HP is whole)")
      .refine((f) => Math.abs(f.pulseS * TICK_RATE_HZ - Math.round(f.pulseS * TICK_RATE_HZ)) < 1e-9, "pulseS must be a whole number of ticks"),
    /** Story 6.3: blackout lighting (defaults = the shipped values; 6.4/6.10/6.12 switch blackouts on). */
    blackout: blackoutSchema.default(BLACKOUT_DEFAULTS),
    /** Story 6.2: the Ruins flicker and dust (client look only). */
    ruins: ruinsSchema.default(RUINS_DEFAULTS),
    /** Story 6.4: power out and fog at stage 5. */
    collapse: collapseSchema.default(COLLAPSE_DEFAULTS),
  })
  .strict();

/**
 * Story 5.5 (shared with 5.4, 5.8, 5.12): `combat.json`. `friendlyFire` (owner 5.4): a player's fire
 * or explosion that hits a player (a teammate or the shooter) deals `pct` % of its damage; it can
 * down them when `canDown`. `explosion` (owner 5.5): the grenade pool size (`maxLiveRounds`, a u8 id
 * on the wire), how far a round stopped by cover bursts in front of the face, and the client's
 * effect caps (pools: brief line 12). `fx` (Story 5.4): the flame stream and burning-zombie caps.
 */
export const combatSchema = z
  .object({
    friendlyFire: z
      .object({
        /** A player's fire or explosion hitting a player (a teammate or themself) deals this % (GDD: 50). Bullets and melee: 0. */
        pct: z.number().int().min(0).max(100),
        /** D1: friendly fire may down a teammate (false: it stops at 1 HP). */
        canDown: z.boolean(),
      })
      .strict(),
    explosion: z
      .object({
        maxLiveRounds: z.number().int().min(1).max(255),
        faceBackoffM: z.number().min(0.001).max(0.5),
        fx: z
          .object({
            /** The cosmetic round's arc height (scale + shadow offset; never changes the track). */
            lobArcM: z.number().min(0).max(5),
            /** Camera shake for every player within this of a blast (settings toggle respected). */
            shakeWithinM: z.number().min(0).max(20),
            maxExplosionParticles: z.number().int().min(8).max(512),
            maxScorchDecals: z.number().int().min(1).max(64),
            /** Explosions drawn at once (flash + rings each; the oldest is reused). */
            maxLiveExplosions: z.number().int().min(1).max(32),
            /** A cosmetic round whose `explosion.happened` never came is hidden this many ticks after its landing tick. */
            lostEventTicks: z.number().int().min(1).max(100),
          })
          .strict(),
      })
      .strict(),
    /** Client-only effect caps (brief line 12): never read by the simulation. */
    fx: z
      .object({
        /** Flame particles alive at once over every flamer (a shared pool). */
        maxFlameParticles: z.number().int().min(8).max(512),
        /** Particles each flamer emits per second (frame-rate independent). */
        flameParticlesPerS: z.number().min(1).max(600),
        /** Burning zombies drawn with a flame overlay (nearest the camera first). */
        maxBurningZombieFx: z.number().int().min(0).max(128),
      })
      .strict(),
  })
  .strict();

/**
 * Story 5.11: one gear item (FR48). Every number is an integer: max HP bonus, armor tier, speed
 * bonus in integer percent (prediction stays bit-identical). `inShop: false` hides and refuses an
 * item (none ships hidden since Story 6.3; dev: `DEV_SHOP_ALL=1` / `?shopall=1`).
 */
export const gearItemSchema = z
  .object({
    name: z.string().min(1).max(24),
    price: z.number().int().min(0),
    inShop: z.boolean().default(true),
    /** Max HP added while this is the best armor owned (never summed with another armor). */
    maxHpBonus: z.number().int().min(0).optional(),
    /** Armor tier (1–2): owning a tier refuses every tier ≤ it; a higher tier replaces lower ones. */
    armorTier: z.number().int().min(1).max(2).optional(),
    /** Move speed bonus in integer percent (multiplies with slows). */
    speedBonusPct: z.number().int().min(0).max(50).optional(),
    /** Seconds the owner needs to revive a downed teammate (instead of `player.reviveS`). */
    reviveS: z.number().positive().refine((s) => Math.round(s * TICK_RATE_HZ) <= 255, "reviveS × 20 must fit the uint8 reviveNeed").optional(),
    /** Story 6.3: a flashlight item's blackout cone (full angle, degrees) and range (m); the widest owned wins. */
    coneDeg: z.number().min(0).max(179).optional(),
    rangeM: z.number().min(0).max(30).optional(),
  })
  .strict()
  .refine((g) => (g.maxHpBonus === undefined) === (g.armorTier === undefined), "maxHpBonus and armorTier go together (armor)");

/** Story 5.11: the gear items, in bit order (`PlayerState.gear` is a uint8 mask: at most 8). */
export const gearSchema = z
  .object({
    items: z.record(balanceId, gearItemSchema).refine((r) => Object.keys(r).length <= 8, "at most 8 gear items (the gear mask is a uint8)"),
  })
  .strict();

/**
 * Story 5.12: one consumable (FR8, FR49). `kind` picks the use: `heal` (the medkit: `healHp`
 * instantly, capped at max HP), `grenade` (a thrown hand grenade: 5.5's lob, then `explode` with
 * `damage` in `radiusM`), `molotov` (the same lob, then a fire zone of `radiusM` for `durationS`
 * burning `damagePerS` on a per-body clock every `pulseS`). Durations are whole ticks; the pulse
 * damage and its friendly-fire half are whole numbers (no float HP).
 */
export const consumableItemSchema = z
  .object({
    name: z.string().min(1).max(24),
    price: z.number().int().min(0),
    /** Items per purchase (a refill tops the slot up to this). */
    pack: z.number().int().min(1).max(9),
    inShop: z.boolean().default(true),
    kind: z.enum(["heal", "grenade", "molotov"]),
    healHp: z.number().int().min(1).optional(),
    /** Throws: the shortest and longest throw from the hand (m; 5.5's `minLobM` / `lobRangeM`). */
    minThrowM: z.number().positive().optional(),
    throwRangeM: z.number().positive().max(20).optional(),
    /** Throws: ground speed of the thrown item (m/s) and the shortest flight (s). */
    throwSpeedMps: z.number().positive().optional(),
    minFlightS: z.number().positive().optional(),
    /** Grenade: blast damage to zombies (players take the friendly-fire share). Molotov: unused. */
    damage: z.number().int().min(1).optional(),
    radiusM: z.number().positive().max(8).optional(),
    durationS: z.number().positive().optional(),
    damagePerS: z.number().int().min(1).optional(),
    pulseS: z.number().positive().optional(),
  })
  .strict()
  .refine((c) => c.kind !== "heal" || c.healHp !== undefined, "a heal item needs healHp")
  .refine((c) => c.kind === "heal" || (c.minThrowM !== undefined && c.throwRangeM !== undefined && c.throwSpeedMps !== undefined && c.minFlightS !== undefined && c.radiusM !== undefined && c.minThrowM <= c.throwRangeM), "a throwable needs minThrowM ≤ throwRangeM, throwSpeedMps, minFlightS and radiusM")
  .refine((c) => c.kind !== "grenade" || c.damage !== undefined, "a grenade needs damage")
  .refine((c) => c.kind !== "molotov" || (c.durationS !== undefined && c.damagePerS !== undefined && c.pulseS !== undefined), "a molotov needs durationS, damagePerS and pulseS")
  .refine((c) => c.durationS === undefined || (wholeTicks(c.durationS) && Math.round(c.durationS * TICK_RATE_HZ) <= 65535), "durationS must be a whole number of ticks (≤ 65,535)")
  .refine((c) => c.pulseS === undefined || wholeTicks(c.pulseS), "pulseS must be a whole number of ticks")
  .refine((c) => c.damagePerS === undefined || c.pulseS === undefined || evenWhole(c.damagePerS * c.pulseS), "damagePerS × pulseS must be an even whole number (players take half)");


/** Story 5.12: the consumables (at most 8: the slot is a uint8 index, 255 = empty). */
export const consumablesSchema = z
  .object({
    /** Seconds between two uses (whole ticks; D1). */
    useCooldownS: z.number().positive().refine(wholeTicks, "useCooldownS must be a whole number of ticks"),
    /** Live molotov fire zones at most (a new one replaces the oldest; brief 10/12). */
    maxLiveMolotovZones: z.number().int().min(1).max(32),
    /** Review M1: how long the last aim input steers a throw made with no aim (whole ticks). */
    aimMemoryS: z.number().positive().max(10).refine(wholeTicks, "aimMemoryS must be a whole number of ticks"),
    /** M-D: blocker entries this close to a molotov zone's centre don't shield (a zone lit at a face burns that side). */
    fireFaceToleranceM: z.number().min(0).max(0.2),
    /**
     * Client look budget of one molotov zone's particle fire (brief 12): its share of a car fire's
     * low-quality particle caps and spawn rates, and the spacing of its ring flames (m).
     */
    fx: z
      .object({
        particleShare: z.number().min(0.05).max(1),
        /** Smoke is the costliest layer (big normal-blend puffs): its own, smaller share. */
        smokeShare: z.number().min(0.05).max(1),
        edgeSpacingM: z.number().min(0.2).max(2),
        /** Caps over ALL live zones (the 8-zone worst case, C14): particles, and ring flames (their spacing grows to fit). */
        maxParticles: z.number().int().min(8).max(2000),
        maxEdgeFlames: z.number().int().min(8).max(2000),
        /** With more live zones than this, no zone draws its ground light (the costliest layer to fill). */
        maxLights: z.number().int().min(0).max(32),
      })
      .strict(),
    items: z.record(balanceId, consumableItemSchema).refine((r) => Object.keys(r).length >= 1 && Object.keys(r).length <= 8, "1–8 consumables (the slot is a uint8 index)"),
  })
  .strict();

/**
 * Story 6.5: the Behemoth (`boss.json`; FR33, FR34, FR84). Every boss number lives here (brief line
 * 10); 6.6 adds `charge` / `throw`, 6.7 `enrage` / `killPay`. Telegraph lengths are read at the
 * telegraph's start and never scaled (F6). Times are whole ticks.
 */
export const bossSchema = z
  .object({
    /** Waves the Behemoth comes in (6.12 extends this for endless through `isBossWave`). */
    bossWaves: z.array(z.number().int().min(1).max(255)).min(1),
    /** It warns once this share of the wave's zombies has spawned (counts spawns, never alive zombies). */
    arriveAtFraction: z.number().min(0).max(1),
    warningS: z.number().positive().max(30).refine(wholeTickS, "warningS must be a whole number of ticks"),
    radiusM: z.number().positive().max(4),
    speedMps: z.number().positive().max(10),
    /** HP at 4 players; × `waves.playerCountScale` of the run's player count when it arrives (solo × 0.4 is the boss's own, F10). */
    hp: z.number().int().positive().max(1_000_000),
    /** Solo HP scale (designer 2026-11-24: × 0.4; the wave size uses `waves.playerCountScale[0]`). */
    soloHpScale: z.number().gt(0).max(1).default(0.4),
    /** Zombies alive at most while the boss warns or lives (D6, brief line 22). */
    aliveCap: z.number().int().positive(),
    entryMinPlayerDistanceM: z.number().min(0),
    /** Map spawn point names it can enter from (D2: the four street ends). */
    entryPoints: z.array(z.string().min(1)).min(1).max(8),
    /** HP per second to a player building its body overlaps (D8). */
    buildingDps: z.number().positive(),
    /** A hit lands only when the player's centre is this far inside the drawn edge (brief 21c). */
    edgeGraceM: z.number().min(0).max(1),
    /** Gap after each attack's recovery, by player count (index 0 = solo). */
    gapS: z.array(z.number().positive().refine(wholeTickS, "gapS must be whole ticks")).length(4),
    firstGapS: z.number().positive().refine(wholeTickS, "firstGapS must be whole ticks"),
    target: z
      .object({
        /** Threat window: `THREAT_BUCKETS` × `THREAT_BUCKET_TICKS` (crossCheckBoss: 10 × 0.5 s = 5 s). */
        threatWindowS: z.number().positive().max(30),
        switchMinS: z.number().positive().refine(wholeTickS, "switchMinS must be whole ticks"),
      })
      .strict(),
    slam: z
      .object({
        triggerM: z.number().positive(),
        telegraphS: z.number().positive().refine(wholeTickS, "slam.telegraphS must be whole ticks"),
        radiusM: z.number().positive().max(12),
        damage: z.number().int().positive(),
        pushM: z.number().min(0).max(8),
        pushS: z.number().positive().refine(wholeTickS, "slam.pushS must be whole ticks"),
        recoverS: z.number().positive().refine(wholeTickS, "slam.recoverS must be whole ticks"),
        cooldownS: z.number().positive().refine(wholeTickS, "slam.cooldownS must be whole ticks"),
        zombieDamage: z.number().int().min(0),
      })
      .strict()
      .refine((s) => (s.pushM * 1000) / Math.round(s.pushS * TICK_RATE_HZ) <= 65535, "slam push per tick must fit knockStepMm (u16)"),
    /** D1: its body pushes players out. */
    bodyPushPlayers: z.boolean(),
    /**
     * AC 6: its body pushes zombies out. OFF (OPEN FOR DESIGNER): pushed-out zombies jam behind a
     * standing Behemoth in a chokepoint and never reach the team; off, they walk under it (drawn over them).
     */
    bodyPushZombies: z.boolean(),
    pathing: z
      .object({
        /** Map boxes are grown by this on the boss grid (radiusM − the 0.35 m pathing limit). */
        inflateM: z.number().positive().max(4),
        rebuildEveryS: z.number().positive().refine(wholeTickS, "pathing.rebuildEveryS must be whole ticks"),
        /** Speed % while its body overlaps a player building (D8). */
        buildingSlowPct: z.number().int().min(1).max(100),
        /** Rings of cells searched round a target it cannot stand next to (an alley narrower than its body). */
        seedRings: z.number().int().min(1).max(32),
        /** Review H1: the fallback seeds cells up to this walking distance from an unreachable target. */
        fallbackSeedM: z.number().positive().max(200),
        /** Review H1: while in the fallback, the normal field is tried again this often (and at once when the target moves 1 m). */
        fallbackRetryS: z.number().positive().refine(wholeTickS, "pathing.fallbackRetryS must be whole ticks"),
        /** Review H1: ... and at once when the target has moved this far (m) from where the fallback began. */
        fallbackMoveM: z.number().positive().max(10),
      })
      .strict(),
    caps: z.object({ maxDecals: z.number().int().min(1).max(32) }).strict(),
    /** Story 6.6: the charge (F1–F6). Every `*S` is whole ticks. */
    charge: z
      .object({
        /** The target's centre is this far (5–12 m) from the boss's centre. */
        minM: z.number().positive(),
        maxM: z.number().positive(),
        /** The swept lane must be at least this long. */
        minLaneM: z.number().positive(),
        /** Longest rush (m). */
        distM: z.number().positive().max(30),
        telegraphS: z.number().positive().refine(wholeTickS, "charge.telegraphS must be whole ticks"),
        speedMps: z.number().positive().max(40),
        /** The drawn lane's width (body 4 m + a survivor 0.8 m). */
        laneWidthM: z.number().positive().max(12),
        damage: z.number().int().positive(),
        shoveM: z.number().min(0).max(8),
        shoveS: z.number().positive().refine(wholeTickS, "charge.shoveS must be whole ticks"),
        zombieDamage: z.number().int().min(0),
        recoverS: z.number().positive().refine(wholeTickS, "charge.recoverS must be whole ticks"),
        cooldownS: z.number().positive().refine(wholeTickS, "charge.cooldownS must be whole ticks"),
        initialCooldownS: z.number().min(0).refine(wholeTickS, "charge.initialCooldownS must be whole ticks"),
        stunS: z.number().positive().refine(wholeTickS, "charge.stunS must be whole ticks"),
        /** Every damage source × this while stunned (designer D1). */
        stunDamageMult: z.number().min(1).max(5),
        /** The lane sweep's step (m). */
        sweepStepM: z.number().positive().max(0.5),
      })
      .strict()
      .refine((s) => (s.shoveM * 1000) / Math.round(s.shoveS * TICK_RATE_HZ) <= 65535, "charge shove per tick must fit knockStepMm (u16)"),
    /** Story 6.6: the throw (F7, F8). */
    throw: z
      .object({
        /** A standing player farther than this from the boss's centre can be thrown at. */
        minM: z.number().positive(),
        /** ... or farther than this when the boss can't walk to them (D5). */
        unreachableMinM: z.number().positive(),
        liftS: z.number().positive().refine(wholeTickS, "throw.liftS must be whole ticks"),
        flightS: z.number().positive().refine(wholeTickS, "throw.flightS must be whole ticks"),
        radiusM: z.number().positive().max(8),
        damage: z.number().int().positive(),
        zombieDamage: z.number().int().min(0),
        recoverS: z.number().positive().refine(wholeTickS, "throw.recoverS must be whole ticks"),
        cooldownS: z.number().positive().refine(wholeTickS, "throw.cooldownS must be whole ticks"),
        initialCooldownS: z.number().min(0).refine(wholeTickS, "throw.initialCooldownS must be whole ticks"),
        /** D7: a rubble pile or burnt car within this of its body edge is the chunk's look (visual only). */
        sourceRangeM: z.number().min(0).max(20),
      })
      .strict(),
    /** Story 6.7: enrage (F1–F4). */
    enrage: z
      .object({
        atHpFrac: z.number().gt(0).lt(1),
        roarS: z.number().positive().refine(wholeTickS, "enrage.roarS must be whole ticks"),
        roarRadiusM: z.number().min(0).max(12),
        roarPushM: z.number().min(0).max(8),
        roarPushS: z.number().positive().refine(wholeTickS, "enrage.roarPushS must be whole ticks"),
        speedMult: z.number().min(1).max(3),
        cooldownMult: z.number().gt(0).max(1),
        gapMult: z.number().gt(0).max(1),
        /** A Crawler off its back every N s, by player count (index 0 = solo). */
        crawlerEveryS: z.array(z.number().positive().refine(wholeTickS, "enrage.crawlerEveryS must be whole ticks")).min(1),
        firstCrawlerS: z.number().positive().refine(wholeTickS, "enrage.firstCrawlerS must be whole ticks"),
        crawlerBehindM: z.number().min(0).max(8),
        crawlerPlayerClearM: z.number().min(0).max(8),
      })
      .strict(),
    /** Story 6.7 (F6): money to every player in the run the tick it dies. */
    killPay: z.number().int().min(0),
    /** Story 6.7: the collapse (client pose sequence). */
    death: z.object({ collapseS: z.number().positive().refine(wholeTickS, "death.collapseS must be whole ticks") }).strict(),
  })
  .strict();

/**
 * Story 6.8: the special events (`events.json`; FR37, FR38, FR41). The schedule (2 events in 2 of
 * `waves`, never neighbours) and every spot come from the `events` seed stream; every number here.
 */
export const eventsSchema = z
  .object({
    /** Events per run (F2: 2). */
    perRun: z.number().int().min(0).max(4),
    /** Waves an event may come in (never 5: crossCheckEvents). */
    waves: z.array(z.number().int().min(1).max(255)).min(1),
    /** F3: an event starts once this share of its wave has spawned (drawn per event in [min, max]). */
    startFractionMin: z.number().min(0).max(1),
    startFractionMax: z.number().min(0).max(1),
    /** The client skips an event's banner older than this (a woken tab; the 5.7 `ageS` rule). */
    lateBannerS: z.number().positive().max(30),
    carAlarm: z
      .object({
        armedS: z.number().positive().refine(wholeTickS, "carAlarm.armedS must be whole ticks"),
        alarmS: z.number().positive().refine(wholeTickS, "carAlarm.alarmS must be whole ticks"),
        pullRadiusM: z.number().positive().max(48),
        /** A lured zombie with a standing player this close (centre to centre) goes for the player (F5). */
        distractBreakM: z.number().min(0).max(10),
        pickMinM: z.number().min(0),
        pickMaxM: z.number().positive(),
        /** The lure fields are seeded from the free cells within this of the car's box. */
        lureSeedM: z.number().positive().max(3),
      })
      .strict()
      .refine((c) => c.pickMinM < c.pickMaxM, "carAlarm.pickMinM must be below pickMaxM"),
    stampede: z
      .object({
        warningS: z.number().positive().refine(wholeTickS, "stampede.warningS must be whole ticks"),
        runS: z.number().positive().refine(wholeTickS, "stampede.runS must be whole ticks"),
        laneWidthM: z.number().positive().max(16),
        speedMps: z.number().positive().max(12),
        contactDamage: z.number().positive().max(100),
        /** Runners by players in the run (index 0 = solo; downed players count, D11). */
        countByPlayers: z.array(z.number().int().min(1).max(64)).length(4),
        /** Zombies allowed above the alive cap that applies (brief line 22). */
        overCap: z.number().int().min(0),
        rowSize: z.number().int().min(1).max(16),
        rowGapS: z.number().positive().refine(wholeTickS, "stampede.rowGapS must be whole ticks"),
        laneNearTeamM: z.number().min(0),
        stuckS: z.number().positive().refine(wholeTickS, "stampede.stuckS must be whole ticks"),
        stuckProgressM: z.number().positive(),
        /** A Runner looks this far ahead for cover and steers round it (F6: "cover pushes them aside"). */
        deflectLookM: z.number().positive().max(4),
        /** While side-stepping cover, this share of the speed keeps pushing along the lane. */
        sidestepAlongFrac: z.number().min(0).max(1),
      })
      .strict(),
    /** Story 6.9 (FR39, G1–G4): the gas leak at the gas-station zone's centre. */
    gasLeak: z
      .object({
        hissS: z.number().positive().refine(wholeTickS, "gasLeak.hissS must be whole ticks"),
        /** G3: bullets pass the tank for this long, then the first player bullet that reaches it blows it. */
        armDelayS: z.number().min(0).refine(wholeTickS, "gasLeak.armDelayS must be whole ticks"),
        radiusM: z.number().positive().max(12),
        playerDamage: z.number().min(0).max(200),
        /** DD2: every zombie in the blast dies through the normal damage path (no kill flag). */
        killDamage: z.number().positive(),
        buildingDamage: z.number().min(0),
        /** D1: where the tank sits ("zone_centre": the centre of the map's `gas_leak` hazard). */
        tankAt: z.literal("zone_centre"),
        tankRadiusM: z.number().positive().max(2),
        /** Review L4: what the blast does to the Behemoth (every zombie dies; the boss takes this, never a one-shot). */
        bossDamage: z.number().min(0),
      })
      .strict()
      .refine((g) => g.armDelayS < g.hissS, "gasLeak.armDelayS must be below hissS"),
    /** Story 6.9 (FR40, G5–G8): the supply crate. */
    supplyDrop: z
      .object({
        flareS: z.number().positive().refine(wholeTickS, "supplyDrop.flareS must be whole ticks"),
        minFromTeamM: z.number().min(0),
        takeRadiusM: z.number().positive().max(3),
        takeS: z.number().positive().max(10).refine(wholeTickS, "supplyDrop.takeS must be whole ticks"),
        level: z.number().int().min(1).max(8),
        weapons: z.array(z.string().min(1)).min(1).max(16),
        /** The landing spot's circle must be free of boxes, buildings and fire. */
        spotClearM: z.number().positive().max(3),
      })
      .strict(),
    /** Story 6.10 (FR42, P1–P3): the power failure (its light level is `decay.json › blackout.powerFailureLightPct`). */
    powerFailure: z
      .object({
        waves: z.array(z.number().int().min(1).max(255)).min(1),
        flickerS: z.number().positive().refine(wholeTickS, "powerFailure.flickerS must be whole ticks"),
      })
      .strict(),
    /** Story 6.10 (FR43, S1–S5): the survivor NPC. */
    survivor: z
      .object({
        hp: z.number().int().min(1).max(255),
        radiusM: z.number().positive().max(1),
        speedMps: z.number().positive().max(10),
        followGapM: z.number().min(0).max(4),
        pickUpM: z.number().positive(),
        loseM: z.number().positive(),
        minFromTeamM: z.number().min(0),
        safeMinFromNpcM: z.number().min(0),
        saveRadiusM: z.number().positive(),
        reward: z.number().int().min(0),
        helpCallS: z.number().positive(),
        /** S5: a saved survivor waves this long at the flag, then the event ends. */
        waveOffS: z.number().min(0).refine(wholeTickS, "survivor.waveOffS must be whole ticks"),
        /** Decision 6.10 B1: while it waits (not yet led) zombies ignore it unless their centre is within this. */
        waitIgnoreM: z.number().min(0).max(48),
      })
      .strict()
      .refine((s) => s.loseM > s.pickUpM, "survivor.loseM must exceed pickUpM")
      .refine((s) => s.saveRadiusM < s.safeMinFromNpcM, "survivor.saveRadiusM must be below safeMinFromNpcM"),
    fx: z
      .object({
        maxDustParticles: z.number().int().min(1).max(256),
        maxMarkers: z.number().int().min(1).max(8),
        maxChevrons: z.number().int().min(1).max(32),
        maxGasParticles: z.number().int().min(1).max(256), // Story 6.9
        maxFlareParticles: z.number().int().min(1).max(256), // Story 6.9
      })
      .strict(),
    banners: z.record(z.string(), z.string().min(1)),
  })
  .strict()
  .refine((e) => e.startFractionMin <= e.startFractionMax, "startFractionMin must be ≤ startFractionMax");

/**
 * Story 7.12: the surprise loot bag (`loot.json`). One plan per run from the salted `loot` stream:
 * `runChance` of a bag, in a wave `firstWave`–`lastWave` (never endless), at a share of that wave's
 * kills; it lies `bagTicks` and goes to the first standing player within `pickRadiusM`. `glint` and
 * `cue` are look values (client only, but here so no number is inline).
 */
export const lootSchema = z
  .object({
    runChance: z.number().min(0).max(1),
    firstWave: z.number().int().min(1).max(255),
    lastWave: z.number().int().min(1).max(255),
    bagTicks: z.number().int().min(1).max(65535),
    pickRadiusM: z.number().positive().max(5),
    /** The bag's footprint for the "not inside a solid" spot search (m). */
    bagRadiusM: z.number().positive().max(2),
    /** The spot search: rings every `spotStepM` out to `spotRings` rings, 8 directions each. */
    spotStepM: z.number().positive().max(2),
    spotRings: z.number().int().min(1).max(200),
    /** How many looks the bag has (7-UI-6: LB4–LB8). */
    variants: z.number().int().min(1).max(16),
    glint: z.object({
      periodTicks: z.number().int().min(2).max(400),
      flashTicks: z.number().int().min(1).max(400),
      ringRadiusM: z.number().positive().max(3),
      ringAlpha: z.number().min(0).max(1),
      rimAlpha: z.number().min(0).max(1),
      bagM: z.number().positive().max(3),
    }),
    cue: z.object({
      toastS: z.number().positive().max(30),
      badgeM: z.number().positive().max(3),
    }),
  })
  .refine((l) => l.firstWave <= l.lastWave, { message: "firstWave must be <= lastWave" })
  .refine((l) => l.glint.flashTicks <= l.glint.periodTicks, { message: "glint.flashTicks must be <= glint.periodTicks" });

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
  decay: decaySchema,
  combat: combatSchema, // Story 5.5 (5.4 owns friendlyFire)
  gear: gearSchema, // Story 5.11
  consumables: consumablesSchema, // Story 5.12
  boss: bossSchema, // Story 6.5
  events: eventsSchema, // Story 6.8
  loot: lootSchema, // Story 7.12
} as const;

export type BalanceFileName = keyof typeof balanceFileSchemas;
export type GunStats = z.output<typeof gunSchema>;
export type MeleeStats = z.output<typeof meleeSchema>;
export type FlameStats = z.output<typeof flameSchema>;
export type CombatStats = z.output<typeof combatSchema>;
export type LauncherStats = z.output<typeof launcherSchema>;
export type WeaponStats = z.output<typeof weaponSchema>;
export type ZombieTypeStats = z.output<typeof zombieTypeSchema>;
export type SpitStats = z.output<typeof spitSchema>;
export type ExplodesStats = z.output<typeof explodesSchema>;
export type BuildingTypeStats = z.output<typeof buildingTypeSchema>;
export type TurretStats = z.output<typeof turretSchema>;
export type TrapStats = z.output<typeof trapSchema>;
export type MineStats = z.output<typeof mineSchema>;
export type BearTrapStats = z.output<typeof bearTrapSchema>;
export type LightStats = z.output<typeof lightSchema>;
export type HealStats = z.output<typeof healSchema>;
export type GearItemStats = z.output<typeof gearItemSchema>;
export type BossStats = z.output<typeof bossSchema>;
export type EventsStats = z.output<typeof eventsSchema>;
export type LootStats = z.output<typeof lootSchema>;
export type ConsumableItemStats = z.output<typeof consumableItemSchema>;
