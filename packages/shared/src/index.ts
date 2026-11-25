export {
  BUILD_GRID_M,
  FLOW_CELL_M,
  GAME_TITLE,
  GRID_CELL_M,
  INPUT_QUEUE_TARGET,
  MUZZLE_OFFSET_M,
  PROJECTILE_POOL_CAPACITY,
  REWIND_MAX_TICKS,
  TICK_DT_S,
  TICK_RATE_HZ,
  VIEW_HEIGHT_M,
  VIEW_WIDTH_M,
  ZOMBIE_POOL_CAPACITY,
  ZOMBIE_SLOT_HOLD_TICKS,
  ZOMBIE_HISTORY_TICKS,
} from "./config/constants";
export { err, ok, type Result } from "./core/result";
export { createRng, createRngFromState, type Rng, type RngState } from "./core/rng";
export { EventBus, type EventHandler } from "./core/eventBus";
export { DAMAGE_SOURCE_ACID, DAMAGE_SOURCE_EXPLOSION, DAMAGE_SOURCE_FIRE, DAMAGE_TAGS, MONEY_REASONS, type DamageTag, type MoneyReason, type SimEvent, type SimEventType } from "./core/simEvents";
export { canonicalJson, fnv1a32 } from "./core/hash";
export {
  BalanceError,
  bundledBalanceFiles,
  loadBalance,
  withOverrides,
  type Balance,
  type BalanceOverride,
  type RawBalanceFiles,
} from "./config/balance";
export {
  MAX_DEV_ZOMBIE_DAMAGE_SCALE,
  devBalanceOverrides,
  loadDevBalance,
  parseDevScale,
  parseDevShopAll,
  parseDevWallet,
  MAX_DEV_STARTING_WALLET,
  type DevBalanceOptions,
} from "./config/devBalance";
export {
  ANIMATED_LAYERS,
  COSMETIC_COLOURS,
  COSMETIC_SLOTS,
  COSMETICS,
  CosmeticsError,
  DEFAULT_LOOK,
  STARTER_PARTS,
  cosmeticPart,
  layerSpinRevPerS,
  loadCosmetics,
  starterParts,
  type AnimatedLayerId,
  type CosmeticColour,
  type CosmeticColours,
  type CosmeticPart,
  type Cosmetics,
  type CosmeticSlot,
  type SurvivorLook,
} from "./config/cosmetics";
// Story 7.1: meta progression data (starter pool; 7.2–7.7 add Supplies, unlocks, Training, districts).
export { MAX_UNLOCKS, PROGRESSION, ProgressionError, UNLOCK_CATEGORIES, findUnlock, loadProgression, progressionSchema, starterPool, unlockList, type Progression, type Unlock, type UnlockCategory } from "./config/progression";
// Story 7.3: the pool, the unlock mask (7.4) and the "Good next pick".
export { goodNextPick, itemCategories, ownedPerCategory, poolOf, unlockMask } from "./meta/pool";
// Story 7.2: the Supplies a run pays and the run record they come from.
export { runSupplies, suppliesEnding, type RunRecord, type RunSupplies, type SuppliesConfig, type SuppliesEnding, type SuppliesLines } from "./meta/supplies";
export type { BuildingTypeStats, TurretStats, TrapStats, MineStats, BearTrapStats, LightStats, HealStats, GunStats, LauncherStats, MeleeStats, FlameStats, CombatStats, WeaponStats, ZombieTypeStats } from "./config/balanceSchema";
export { NO_SYSTEMS, PREDICTION_SYSTEMS, SYSTEM_ORDER, type SystemFn, type SystemName, type Systems } from "./core/systems";
export { createWorld, setInput, step, type CreateWorldOptions, type World, type WorldDebug } from "./core/world";
export { snapshotWorld, worldDigest, type WorldSnapshot } from "./core/worldSnapshot";
export {
  STREAM_NAMES,
  buildPhaseIndex,
  createSeedStreams,
  parseRunSeed,
  shopStream,
  shopStreamKey,
  streamSeed,
  type SeedStreams,
  type ShopStream,
  type StreamName,
} from "./core/seedStreams";
export { NEUTRAL_INPUT, VIEW_TICK_SCALE, playerInputSchema, viewTickOfInput, type PlayerInput } from "./net/input";
export { PLACEHOLDER_MAP, type DistrictBounds, type DistrictMap, type SpawnPoint } from "./map/placeholderMap";
export {
  COVER_KINDS,
  COVER_STOPS_SHOTS,
  DECAY_ACTIONS,
  MAP_STAGE_COUNT,
  MAX_DECAY_VARIANTS,
  MAX_DECAY_FIRES,
  SPAWN_KINDS,
  type CoverKind,
  type CoverObject,
  type DecayAction,
  type DecayMutation,
  type DecayVariant,
  type HazardZone,
  type MapBox,
  type MapSpawn,
  type SpawnJitterAxis,
  type SpawnKind,
  type VisualProp,
} from "./map/districtMap";
export { SPAWN_SIDE, SPAWN_SIDE_NAMES, SPAWN_STATE, isSpawnBuried, spawnPointStates, spawnSide, type SpawnState } from "./waves/spawnPick";
export { MAP_LAYERS, MAP_STAGE_GROUPS, MapError, loadTiledMap } from "./map/loadTiledMap";
export { fillCollisionCells, mapCollisionCells } from "./map/collisionCells";
export { FIRST_DECAY_STAGE, currentDecayStage } from "./map/decayStage";
export { createObstacles, fillObstacles, isRubble, mutationApplies, RUBBLE_PREFIX, rubblePiles, type ObstacleState } from "./map/obstacles";
// Story 4.5: the decay stage engine.
export { createDecayState, fireRecordOf, gameplayVariantMask, gameplayDecayMasks, legalDecayMasks, pickDecayVariants, stageForWave, type DecayState, type FireRecord } from "./decay/decayState";
export { applyDecayStage } from "./decay/applyDecayStage";
// Story 5.10: the derived light-source list; med station healing.
export {
  createLightState,
  darknessAlpha,
  isBlackout,
  lightRadiusOf,
  lightsOf,
  refreshBlackout,
  setForcedBlackout,
  updateLightState,
  type LightKind,
  type LightSource,
  type LightState,
} from "./decay/lightState";
// Story 6.3: the blackout flashlight cone (6.4's fog uses it too).
export { flashlightOf, inFlashlightCone, type FlashlightCone } from "./player/flashlight";
export { healsSomeoneNow, inHealReach, updateMedStations } from "./buildings/medStation";
// Story 4.8: car fires.
export { circleInFire, fireExpiry, firePulse, firePulseDamage, lightNewFires, segmentHitsFire, updateFires } from "./decay/fire";
export { changeDecayStage, decayFinish, decayMutate, destroyBlockedBuildings, moveOutOfNewFires, relocateBodies, relocated, stageForComingWave } from "./decay/decaySystem";
export { bulletBlockT, bulletLineClear, meleeLineClear, segmentBoxEntryT, shotBlockT, shotLineClear } from "./combat/cover";
export { DOWNTOWN_MAP } from "./map/downtown";
export { SHOPFRONT_KIND, shopfrontsOf, type Shopfront, type ShopfrontFace } from "./map/shopfronts";
export { addPlayer, removePlayer, type PlayerState, type PlayerStatus } from "./player/player";
export { teamSpawnPoint } from "./player/spawn";
export { checkTeamWipe, downPlayer, findReviver, placeNextToTeammate, returnOutPlayers, updateDowned } from "./player/downed";
export { buildStartIndex, holdPlayer, isHeld, releaseHeldPlayer, restoreSeat, returnPlayer } from "./player/hold"; // Story 8.1
export { spectateTarget } from "./player/spectate";
export { playerSpeed, slowPlayer, tickSlow } from "./player/slow";
export { KNOCK_DIR_SCALE, knockPlayer, stepKnock } from "./player/knockback"; // Story 5.7
export { MAX_WAVE_MIX, parseWaveMix } from "./waves/waveMix";
export { headingToRad, lerpHeading, quantizeHeading } from "./net/heading";
export {
  NET_EVENT_KIND,
  NET_NONE,
  decodeNetEvent,
  encodeNetEvent,
  playerIdOfSlot,
  playerSlotOf,
  zombieSlotOfNetId,
  type NetEvent,
  type NetEventContext,
  type NetEventKind,
  type SimEventsFlushed,
} from "./net/netEvents";
export { movePlayers, updatePlayers } from "./player/movement";
export { ZOMBIE_STATE, ZOMBIE_TYPES, isRushState, isSwellState, isWindupState, type ZombieTypeId } from "./zombies/zombieTypes";
export { isZombieAlive, killZombie, spawnZombie, zombieTypeOf, type ZombiePool } from "./zombies/zombiePool";
export { spawnRing } from "./zombies/spawnRing";
export { BRUTE_LOOKS, announceSpawn, bruteLookIndex } from "./zombies/brute"; // Story 5.7
export {
  BLOATER_BLAST_WEAPON,
  BLOATER_LOOKS,
  BLOATER_SWELL_WEAPON,
  blastTrace,
  bloaterLookIndex,
  bloaterStats,
  circleInGas,
  clearBlasts,
  createBlastQueue,
  explodesOf,
  processBlasts,
  resetBloaterStats,
  updateGas,
  type BlastQueue,
} from "./zombies/bloater"; // Story 5.8
export { createSpatialGrid, queryRadius, queryRect, rebuildGrid, type SpatialGrid } from "./core/spatialGrid";
export {
  HORDE_BACKPRESSURE_BYTES,
  HORDE_HEADER_BYTES,
  HORDE_MAX_FRAME_BYTES,
  HORDE_MAX_RECORDS,
  HORDE_MISSING_TICKS,
  HORDE_RECORD_BYTES,
  HORDE_VIEW_MARGIN_M,
  MAX_POS_CM,
  POS_SCALE,
  hordeFrameBytes,
  hordeFrameTick,
  isHordeFrameValid,
  packTypeState,
  quantizePos,
  readHordeFrame,
  stateOfTypeState,
  burningOfTypeState,
  wireState,
  BURNING_STATE_BIT,
  MAX_WIRE_ZOMBIE_STATE,
  typeOfTypeState,
  writeHordeHeader,
  writeHordeRecord,
  zombieGenerationOfNetId,
  zombieNetId,
  type HordeSink,
} from "./net/hordeFormat";
export { inRect, viewRect, type Rect } from "./net/interest";
export { activeSlot, createLoadout, createSlot, setLoadout, validLevel, type Loadout, type WeaponSlot } from "./combat/loadout";
export { fuelTicksOf, hasMagazine, isFlame, isGun, isLauncher, isMelee, magazineOf, upgradePrice, usesAmmo, weaponDamage, weaponIds, weaponStats, type WeaponId } from "./combat/weapons";
// Story 5.4: flames, ignites and the friendly-fire rule
export { FLAME_SLOTS, NO_FLAME_SLOT, flameStats, flameTick, resetFlameClocks, updateIgnites } from "./combat/flame";
export { damagePlayerBy, friendlyFireStats } from "./combat/damage";
export type { ProjectilePool } from "./combat/projectilePool";
// Story 2.7: cosmetic projectiles in the client mirror, the shared cooldown rule, the swept test.
export {
  MAX_PIERCE,
  freeProjectile,
  projectileHasHit,
  recordProjectileHit,
  spawnProjectile,
  type ProjectileSpawn,
} from "./combat/projectilePool";
export { COOLDOWN_EPS_S, cooldownIdle, cooldownReady, cooldownTickEnd, cooldownTickStart } from "./combat/cooldown";
export { skippedInputWeaponTick } from "./combat/firing";
// Story 2.12: rewound hit testing (lag compensation).
export {
  recordZombieHistory,
  rewindTicksFor,
  rewoundView,
  setZombieHistoryEnabled,
  type ZombieHistory,
  type ZombieView,
} from "./combat/rewind";
export { pelletDirection, rotateBySeqSpread, seqPelletRoll, seqSpreadRoll } from "./combat/spread";
export { segmentCircleT } from "./math/sweep";
export { rotate } from "./math/vec";
export { maxZombieRadius, zombieTypeIndex } from "./zombies/zombieTypes";
export { applyKnockback, applyZombieDamage } from "./combat/damage";
export { ticksFor } from "./core/time";
export { assistAim } from "./combat/aimAssist";
export { swingMelee } from "./combat/melee";
export { circleOverlapsSector } from "./math/sector";
export {
  applyFixedCounts,
  endlessBrutes,
  isEndlessNumber,
  spawnJitterFor,
  spawnReachM,
  jitteredSpawn,
  updateWaves,
  waveHpMult,
  waveMixOf,
  waveSize,
  waveTypeCounts,
  type WaveState,
} from "./waves/waveDirector";
export {
  castVote,
  countVotes,
  endRun,
  endWave,
  isEvacWave,
  openEvacVote,
  resolveEvacVote,
  RUN_ENDINGS,
  setBuildReady,
  skipWave,
  startBuild,
  startWave,
  updateRun,
  VOTE_EXTRACT,
  VOTE_NONE,
  VOTE_STAY,
  voteOutcome,
  type EvacChoice,
  type RunEnding,
  type RunState,
} from "./run/runStateMachine";
export { endlessEventCandidates, isEndlessEventWave, pickEndlessEvent, scheduleEndlessEvent } from "./run/endlessEvents";
export {
  BYTES,
  C2S,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  RUN_ROOM_NAME,
  S2C,
  guestTokenSchema,
  joinOptionsSchema,
  lobbySetReadySchema,
  netPongSchema,
  playerNameSchema,
  runStartSchema,
  lobbyReturnSchema,
  runLeaveSchema,
  runRewardsSchema,
  type RunRewards,
  type RunRewardsStatus,
  buildSetReadySchema,
  evacVoteSchema,
  buildingPlaceSchema,
  buildingRepairSchema,
  buildingUpgradeSchema,
  buildingSellSchema,
  buildingMoveSchema,
  buildingGhostSchema,
  GHOST_MIN_INTERVAL_MS,
  GHOST_KEEPALIVE_MS,
  GHOST_TIMEOUT_MS,
  shopBuySchema,
  shopRerollSchema,
  type ShopReroll,
  type ShopOffered,
  shopBuyItemSchema,
  type ShopBuyItem,
  type ShopBoughtItem,
  type ShopRefusedItem,
  shopUpgradeSchema,
  type ShopUpgrade,
  type ShopUpgraded,
  type ShopUpgradeRefused,
  type ShopBuy,
  type ShopBought,
  type ShopRefused,
  type BuildSetReady,
  type BuildingPlace,
  type BuildingRefused,
  type BuildingRepair,
  type BuildingRepairRefused,
  type BuildingUpgrade,
  type BuildingUpgradeRefused,
  type BuildingSell,
  type BuildingSellRefused,
  type BuildingMove,
  type BuildingMoveRefused,
  type BuildingGhost,
  type BuildingGhosted,
  type C2SType,
  type JoinOptions,
  type JoinRefusal,
  type LobbySetReady,
  type NetPinged,
  type NetPong,
  type ParsedJoinOptions,
  type PlayerLeft,
  type PlayerLeftReason,
  type RunJoined,
  type RunPhase,
  type S2CType,
} from "./net/messages";
// Story 7.1: the account HTTP API (guest session, session ticket).
export {
  ACCOUNT_SESSION_PATH,
  ACCOUNT_UNLOCK_PATH,
  GUEST_COOKIE,
  accountSessionRequestSchema,
  accountSessionResponseSchema,
  progressViewSchema,
  sessionTicketSchema,
  unlockRequestSchema,
  unlockResponseSchema,
  type AccountSessionRequest,
  type AccountSessionResponse,
  type ProgressView,
  type UnlockRequest,
  type UnlockResponse,
} from "./net/account";
export { canStart, startBlocker, type ReadyFlag, type StartBlocker } from "./net/lobbyRules";
export { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from "./net/roomCode";
export {
  BOSS_STATE_FIELDS,
  type BossStateView,
  BUILDING_STATE_FIELDS,
  PLAYER_STATE_FIELDS,
  RUN_STATE_FIELDS,
  type BuildingStateView,
  type PlayerStateView,
  type ReadonlyMapView,
  type RunStateView,
} from "./net/stateView";
export { BYTE_RATE_RING_S, ByteRate, KB_BYTES, attachByteCounters, messageBytes, type CountedRoomLike, type MessageSocketLike } from "./net/byteRate";
export { NET150_START_WAVE, TEST_SCENARIOS, applyTestScenario, isTestScenario, type TestScenario } from "./net/testScenarios";
export {
  botConfigOf,
  botInput,
  botViewFromWorld,
  createBotView,
  type BotConfig,
  type BotMate,
  type BotSelf,
  type BotView,
  type BotZombie,
} from "./bots/botPolicy";
export {
  botBuildPhase,
  botPlaceCandidate,
  botPlaceTries,
  botShopNext,
  botCardIndex,
  BOT_LIST_DONE,
  botGearPrice,
  botOwnsGear,
  botWeaponSlot,
  UPGRADE_ENTRY_PREFIX,
  upgradeEntryWeapon,
  createBotShopResult,
  type BotShopResult,
  type BotShopSelf,
} from "./bots/botShop";
export { formatRunLine, runHeadless, type HeadlessRunLog, type HeadlessRunOptions, type HeadlessWaveLog } from "./bots/headlessRun";
// Story 4.4: headless replay (seed + input log).
export {
  applyCommand,
  createHeadlessWorld,
  createInputLog,
  replayRun,
  type BuildCommand,
  type InputLog,
  type ReplayCommand,
  type ReplayOptions,
} from "./replay/inputLog";
// Story 3.2: personal wallets and rewards.
export {
  MAX_DAMAGERS,
  clearDamagers,
  earn,
  payKill,
  refundMoney,
  recordDamager,
  spendMoney,
  updateEconomy,
  type EconomyState,
  type SpendError,
} from "./economy/economy";
// Story 3.4: buildings (placement, collision).
export {
  addBuildingAt,
  buildingById,
  buildingStats,
  buildingTypeIds,
  createBuildingState,
  cornerForCentre,
  footprint,
  footprintBlocked,
  blockReason,
  createBlockReason,
  footprintH,
  footprintW,
  ownedCount,
  placeBuilding,
  placementError,
  removeBuilding,
  relocateBuilding,
  damageBuilding,
  type Box,
  type BlockCause,
  type BlockReason,
  type Building,
  type BuildingRotation,
  type BuildingSpec,
  type BuildingState,
  type PlaceError,
  type PlaceRequest,
} from "./buildings/buildings";
export {
  PUSH_MOVED,
  PUSH_NONE,
  PUSH_STUCK,
  circleHitsBuilding,
  circleOverlapsBox,
  pushOutOfBuildings,
  pushed,
  distanceToBox,
  segmentHitsBox,
  segmentHitsBuildings,
  type PushResult,
} from "./buildings/collision";
// Story 3.5: flow-field pathfinding.
export {
  FLOW_UNREACHED,
  advanceFlowField,
  createFlowField,
  createNavGrid,
  setNavWalls,
  setNavFires,
  flowCellAt,
  flowEdgePinch,
  flowFieldMaxAgeTicks,
  flowSharedMaxAgeTicks,
  fillFlankPenalty,
  inFlankCone,
  flowNextCell,
  flowRefreshTicks,
  flowStepBuilding,
  rasterizeBuildings,
  rebuildFlowFieldNow,
  updatePathing,
  flowNearestReachedCell,
  isWideType,
  wideBodyAlive,
  type FlowField,
  type NavGrid,
  type PathingState,
  type ZombieProgress,
} from "./zombies/flowField";
export { updateBuildings } from "./buildings/buildingSystem";
// Story 3.6: auto-turrets.
export { buildingCentreX, buildingCentreY, nearestZombieInRange, turretStats, updateTurrets } from "./buildings/turret";
// Story 3.7: repairs.
export { REPAIR_ERRORS, buildingAtPoint, isDamaged, repairBuilding, repairCost, repairError, type RepairError, type Repaired } from "./buildings/repair";
// Story 5.9: walls vs floor, upgrades, spike traps, mines, the shared blast.
export { setBuildingType, resetBuildSpend } from "./buildings/buildings";
export { MOVE_ERRORS, moveBuilding, moveError, type MoveError, type MoveRequest } from "./buildings/move"; // Story 5.22
export { GHOST_VIEW_MARGIN_M, ghostError, type GhostError, type GhostRequest } from "./buildings/ghost"; // Story 5.24
export { SELL_ERRORS, sellBuilding, sellError, sellRefund, sellRefundFor, type SellError, type Sold } from "./buildings/sell"; // Story 5.20
export { UPGRADE_ERRORS, upgradeBuilding, upgradeError, upgradeStep, type UpgradeError, type Upgraded } from "./buildings/upgrade";
export { trapCounters, updateTraps } from "./buildings/trap";
export { mineCounters, updateMines } from "./buildings/mine";
export { BEAR_TRAP_STATE } from "./buildings/buildings";
export { bearTrapCounters, resetBearTrapCounters, updateBearTraps, catchOnBearTraps, resetBearTraps, holdTicksFor, bearTrapPlateRadius } from "./buildings/bearTrap"; // Story 5.14
export {
  clearGrenades,
  createGrenadePool,
  createLobTarget,
  grenadeCounters,
  launchGrenade,
  lobAimLength,
  lobFlightTicks,
  lobTarget,
  updateGrenades,
  throwConsumable,
  type GrenadePool,
  type LobFlight,
  type LobRange,
  type LobTarget,
} from "./combat/grenades";
// Story 5.12: consumables (slot, shop, use, molotov fire zones).
export {
  CONSUMABLE_NONE,
  aimMemoryTicks,
  allConsumables,
  buyConsumable,
  consumableAt,
  consumableCooldownTicks,
  consumableIds,
  consumableIndex,
  consumableStats,
  consumableStatsAt,
  isConsumable,
  molotovTicksAt,
  shopConsumables,
  throwStatsAt,
  throwStatsOf,
  type BoughtConsumable,
  type ConsumableId,
  type ConsumableKind,
  type ShopConsumable,
  type ThrowStats,
} from "./economy/consumables";
export { consumableCounters, createThrowAim, launcherRangeInHand, rememberAim, throwAimLength, throwDirection, throwVariant, tryUseConsumable, useConsumables, type ThrowAim } from "./combat/consumables";
export { clearMolotovZones, createMolotovZones, igniteMolotov, molotovStats, molotovZoneAt, type MolotovZones } from "./hazards/molotov";
export { type ConsumableItemStats } from "./config/balanceSchema";
export { EXPLOSION_KINDS, blastResult, createExplosionSpec, explode, explosionCounters, type ExplosionKind, type ExplosionSpec } from "./combat/explosion";
export { boxBlocked, findBoxFreeSpot, findFreeSpotNear, spotBlocked } from "./player/freeSpot";
export { owns, shopBuildings, titleCase, weaponName, type ShopBuilding, type ShopError } from "./economy/shop";
// Story 5.13: the roguelike card shop.
export {
  buyCard,
  cardCatalog,
  cardItem,
  cardPool,
  cardPrice,
  drawAllOffers,
  drawOffer,
  offerFor,
  ownsCardItem,
  parseDevShopCards,
  readOffer,
  reroll,
  rerollPrice,
  slotOf,
  snapshotShop,
  type CardBought,
  type CardItem,
  type CardKind,
  type Rerolled,
  type ShopOfferView,
} from "./economy/shopCards";
export { MAX_CARDS, NO_CARD, createShopOffers, type ShopOffers } from "./economy/shopOffers";
// Story 5.1: weapon upgrades I–IV (damage helper `weaponDamage` is exported with the weapons above).
export { buyItem, type BoughtItem } from "./economy/shop";
export {
  allGear,
  armorBonus,
  armorTier,
  buyGear,
  effectiveMaxHp,
  gearBit,
  gearIds,
  ownsGear,
  reviveTicksFor,
  shopGear,
  speedBonusPct,
  type BoughtGear,
  type GearId,
  type ShopGear,
} from "./economy/gear";
export { romanLevel, shopUpgrades, upgradePriceTable, upgradeWeapon, type ShopUpgradeRow, type WeaponUpgradeError, type WeaponUpgraded } from "./economy/shop";
// Story 5.6: Spitters, spits and acid puddles.
export { acidSpit, acidSpitOf, circleInAcid, clearAcid, spawnSpit, spitStats, spitterStep, updateAcid, updateSpits } from "./zombies/spit";
export { createSpitPool, type SpitPool } from "./zombies/spitPool";
export { AREA_KIND, circleInArea, clearAreas, createAreaPool, spawnArea, type AreaPool } from "./hazards/areaPool";
export { type SpitStats } from "./config/balanceSchema";
// Story 6.5: the Behemoth
export {
  BOSS_ATTACK,
  BOSS_STATE,
  THREAT_BUCKETS,
  bossActive,
  bossBodyOn,
  bossMaxHp,
  createBossState,
  endlessBossHpMult,
  isBossWave,
  pushPlayerOutOfBoss,
  resetBoss,
  BOSS_THROW_SRC,
  rewoundBossPos,
  snapshotBoss,
  type BossAttack,
  type BossAttackKind,
  type BossState,
  type BossStateId,
} from "./boss/bossState";
export { BEHEMOTH_LOOKS, behemothLookIndex, bossEntry, bossEntryOpen, bossPending, pickBossAttack, pickBossEntry, startBossWarning, updateBoss } from "./boss/behemoth";
export { applyBossDamage, bossCircleHitBySegment, bossDamageStats, bossInArc, bossInCircle, zombieUnderBoss, zombiesUnderBoss } from "./boss/bossDamage";
export { bossGapTicks, bossStats, bossTicks, inSlamZone, recoverTicks, startBossAttack, telegraphTicks, windupTicks } from "./boss/telegraph";
export { chargeHitsPoint, sweepChargeLane } from "./boss/charge";
export { pickThrowTarget, throwSource } from "./boss/throw";
export { killBoss } from "./boss/death";
export { checkEnrage, crawlerDropSpot } from "./boss/enrage";
export { bossSlotOf, clearBossThreatSlot, pickBossTarget, recordBossThreat, threatOf } from "./boss/target";
export { maxAliveNow } from "./waves/waveDirector";
export { chargeKnockStepMm, knockPlayerBy, knockPlayerDir, knockStepMmOf } from "./player/knockback";
export { type BossStats } from "./config/balanceSchema";
// Story 6.1: the "start at wave N" dev switch (DEV_START_WAVE / ?startwave=).
export { applyStartWave, MAX_START_WAVE, parseStartWave } from "./run/devStartWave";
// Story 6.2 (Ruins) / 6.4 (Collapse): look picks and the fog / power-out rules (shared, pure).
export { RUINS_LOOKS, RUINS_LOOK_GUTTED, RUINS_LOOK_GROUP, isEndlessWave, lookPick, ruinsLookAt, type RuinsLook } from "./decay/ruinsLook";
export {
  COLLAPSE_STYLES,
  COLLAPSE_STYLE_GROUP,
  collapseStyleAt,
  createFogBeam,
  createFogRadii,
  fogRadiiOf,
  fogVisibility,
  isPowerOut,
  type CollapseStyle,
  type FogBeam,
  type FogRadii,
} from "./decay/collapse";
// Story 6.8: special events (framework, car alarm, stampede)
export {
  EVENT_KINDS,
  EVENT_KIND_NONE_WIRE,
  EVENT_NONE,
  EVENT_OUTCOMES,
  EVENT_PHASE,
  createSpecialEventState,
  eventActive,
  eventKindIndex,
  snapshotSpecial,
  type ActiveEvent,
  type EventKind,
  type EventOutcome,
  type SpecialEventState,
} from "./events/eventState";
export { endSpecialEvent, eventHoldsWave, forceEvent, specialShotTarget, triggerPointReached, updateSpecialEvents } from "./events/specialEvents";
export { armEndlessEvent, eventFits, scheduleRunEvents } from "./events/schedule";
export { alarmCandidates, isAlarmCandidate } from "./events/carAlarm";
export { laneAlong, laneCentreDistance, laneLength, laneOpen, stampedeRunnersAlive } from "./events/stampede";
export { parseDevEvents } from "./events/devEvents";
// Stories 6.9 + 6.10: gas leak, supply drop, power failure, survivor
export { NPC_STATE, type GasLeakState, type SupplyDropState, type SurvivorState } from "./events/eventState";
export { GAS_LEAK_WEAPON, gasLeakZone, gasTankArmed } from "./events/gasLeak";
export { pickCrateSpot } from "./events/supplyDrop";
export { powerFailureWave } from "./events/powerFailure";
export { damageSurvivor, survivorFits, survivorTarget } from "./events/survivor";
export { crateOutcome, crateRefusal, giveCrateWeapon, type CrateOutcome } from "./economy/shop";
export { EVENT_SPOT_KINDS, LANE_DIRS, type EventSpot, type EventSpotKind, type LaneDir, type StampedeLane } from "./map/districtMap";

export { CLOSE_SEAT_KEPT, CLOSE_TAKEN_OVER, RECONNECT, SeatRecovery, Watchdog, configureReconnection, shouldRescueReload, type RecoveryDeps, type RecoveryJoin, type ReconnectionLike } from "./net/reconnect"; // Story 8.1
