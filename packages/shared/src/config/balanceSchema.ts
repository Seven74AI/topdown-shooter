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

export const weaponSchema = z.discriminatedUnion("kind", [gunSchema, meleeSchema]);
export const weaponsSchema = z.record(balanceId, weaponSchema);

/** Story 5.6 helper: `s` seconds is a whole number of ticks. */
const wholeTicks = (s: number): boolean => Math.abs(s * TICK_RATE_HZ - Math.round(s * TICK_RATE_HZ)) < 1e-9;

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
    /** Story 3.8: follows the flank field (Runners) instead of the chase field. */
    flanks: z.boolean().default(false),
    /** Story 5.6: a ranged spit (Spitters); absent = no ranged attack. */
    spit: spitSchema.optional(),
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
  .object({ types: z.record(balanceId, zombieTypeSchema), crowd: crowdSchema, pathing: pathingSchema, flank: flankSchema, spitCaps: spitCapsSchema })
  .strict();

export const wavesSchema = z
  .object({
    zombiesPerWave: z.number().int().positive().max(65535), // the biggest wave is checked against the Uint16 counts in balance.ts crossCheck (3.10 review)
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
    /** Story 3.10: clearing this wave ends the run ("You held out!"; Epic 6 sets 10 and adds the boss). */
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
    /**
     * Story 4.1 review L4: when those rings are all taken, the search widens to this many rings
     * (still free of players and zombies), then the team starts, then a spot clear of map boxes and
     * buildings only: a returning player is never placed inside a box.
     */
    returnWideSearchRings: z.number().int().min(1),
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
  })
  .strict();

export const controlsSchema = z
  .object({
    moveDeadZone: z.number().min(0).max(0.9),
    aimDeadZone: z.number().min(0).max(0.9),
    aimAssistDeg: z.number().min(0).max(45),
    /** Story 5.2: client effect caps (no new balance file: every test fixture lists the files). */
    fx: fxSchema,
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
      .array(z.union([balanceId, z.string().regex(/^upgrade:[a-z][a-z0-9_]*$/, "an upgrade entry is upgrade:<weapon id>")]))
      .max(31)
      .default([]),
    /** Story 3.10: a bot tries to place a building at these distances (m) around itself, 8 directions each. */
    buildRadiiM: z.array(z.number().positive().max(8)).min(1).max(4).default([2.5]),
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
    /** Story 5.9: false = only reached by an upgrade (never in the shop, refused by placement). */
    forSale: z.boolean().default(true),
    /** Story 5.9: the next tier and what the step costs (the target's `price` is the total paid: F9). */
    upgradesTo: z.object({ type: balanceId, price: z.number().int().positive() }).strict().optional(),
    /** Story 5.9: a spike trap (floor): damages and slows zombies standing on it, per body. */
    trap: trapSchema.optional(),
    /** Story 5.9: a mine (floor, single use): a zombie touching the trigger circle sets off the blast. */
    mine: mineSchema.optional(),
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
  })
  .strict();

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
    /** A building destroyed by a stage change refunds this share of its price to its owner, rounded down (FR58: 50 %). */
    buildingRefundShare: z.number().min(0).max(1),
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
  decay: decaySchema,
} as const;

export type BalanceFileName = keyof typeof balanceFileSchemas;
export type GunStats = z.output<typeof gunSchema>;
export type MeleeStats = z.output<typeof meleeSchema>;
export type WeaponStats = z.output<typeof weaponSchema>;
export type ZombieTypeStats = z.output<typeof zombieTypeSchema>;
export type SpitStats = z.output<typeof spitSchema>;
export type BuildingTypeStats = z.output<typeof buildingTypeSchema>;
export type TurretStats = z.output<typeof turretSchema>;
export type TrapStats = z.output<typeof trapSchema>;
export type MineStats = z.output<typeof mineSchema>;
