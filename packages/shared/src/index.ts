export {
  BUILD_GRID_M,
  FLOW_CELL_M,
  GAME_TITLE,
  GRID_CELL_M,
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
export { MONEY_REASONS, type MoneyReason, type SimEvent, type SimEventType } from "./core/simEvents";
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
  parseDevWallet,
  MAX_DEV_STARTING_WALLET,
  type DevBalanceOptions,
} from "./config/devBalance";
export type { BuildingTypeStats, TurretStats, GunStats, MeleeStats, WeaponStats, ZombieTypeStats } from "./config/balanceSchema";
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
  MAP_STAGE_COUNT,
  SPAWN_KINDS,
  type CoverKind,
  type CoverObject,
  type HazardZone,
  type MapBox,
  type MapSpawn,
  type SpawnJitterAxis,
  type SpawnKind,
  type VisualProp,
} from "./map/districtMap";
export { decayStage } from "./decay/decayStage";
export { SPAWN_SIDE, SPAWN_SIDE_NAMES, SPAWN_STATE, spawnPointStates, spawnSide, type SpawnState } from "./waves/spawnPick";
export { MAP_LAYERS, MAP_STAGE_GROUPS, MapError, loadTiledMap } from "./map/loadTiledMap";
export { mapCollisionCells } from "./map/collisionCells";
export { DOWNTOWN_MAP } from "./map/downtown";
export { addPlayer, removePlayer, type PlayerState, type PlayerStatus } from "./player/player";
export { teamSpawnPoint } from "./player/spawn";
export { checkTeamWipe, downPlayer, findReviver, returnOutPlayers, updateDowned } from "./player/downed";
export { spectateTarget } from "./player/spectate";
export { playerSpeed, slowPlayer, tickSlow } from "./player/slow";
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
export { ZOMBIE_STATE, ZOMBIE_TYPES, type ZombieTypeId } from "./zombies/zombieTypes";
export { isZombieAlive, killZombie, spawnZombie, zombieTypeOf, type ZombiePool } from "./zombies/zombiePool";
export { spawnRing } from "./zombies/spawnRing";
export { createSpatialGrid, queryRadius, queryRect, rebuildGrid, type SpatialGrid } from "./core/spatialGrid";
export {
  HORDE_BACKPRESSURE_BYTES,
  HORDE_HEADER_BYTES,
  HORDE_MAX_FRAME_BYTES,
  HORDE_MAX_RECORDS,
  HORDE_MISSING_LIMIT,
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
  typeOfTypeState,
  writeHordeHeader,
  writeHordeRecord,
  zombieGenerationOfNetId,
  zombieNetId,
  type HordeSink,
} from "./net/hordeFormat";
export { inRect, viewRect, type Rect } from "./net/interest";
export { activeSlot, createLoadout, createSlot, setLoadout, type Loadout, type WeaponSlot } from "./combat/loadout";
export { isGun, isMelee, weaponIds, weaponStats, type WeaponId } from "./combat/weapons";
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
export { rotateBySeqSpread, seqSpreadRoll } from "./combat/spread";
export { segmentCircleT } from "./math/sweep";
export { rotate } from "./math/vec";
export { maxZombieRadius, zombieTypeIndex } from "./zombies/zombieTypes";
export { applyZombieDamage } from "./combat/damage";
export { ticksFor } from "./core/time";
export { assistAim } from "./combat/aimAssist";
export { swingMelee } from "./combat/melee";
export { circleOverlapsSector } from "./math/sector";
export { jitteredSpawn, updateWaves, waveMixOf, waveSize, waveTypeCounts, type WaveState } from "./waves/waveDirector";
export {
  endRun,
  endWave,
  setBuildReady,
  skipWave,
  startBuild,
  startWave,
  updateRun,
  type RunState,
} from "./run/runStateMachine";
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
  buildSetReadySchema,
  buildingPlaceSchema,
  buildingRepairSchema,
  shopBuySchema,
  type ShopBuy,
  type ShopBought,
  type ShopRefused,
  type BuildSetReady,
  type BuildingPlace,
  type BuildingRefused,
  type BuildingRepair,
  type BuildingRepairRefused,
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
export { canStart, startBlocker, type ReadyFlag, type StartBlocker } from "./net/lobbyRules";
export { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from "./net/roomCode";
export {
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
  botWeaponSlot,
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
  footprintH,
  footprintW,
  ownedCount,
  placeBuilding,
  placementError,
  removeBuilding,
  damageBuilding,
  type Box,
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
export { findFreeSpotNear, spotBlocked } from "./player/freeSpot";
export {
  botShopPick,
  buyWeapon,
  owns,
  shopBuildings,
  shopPrice,
  shopWeapons,
  titleCase,
  weaponName,
  type Bought,
  type ShopBuilding,
  type ShopError,
  type ShopWeapon,
} from "./economy/shop";
