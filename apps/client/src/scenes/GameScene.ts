import { linkStore } from "../net/linkMonitor";
import * as Phaser from "phaser";
import { MolotovView } from "../render/MolotovView";
import { consumableUsable, consumableVisible, createConsumablePending, tapConsumable, updateConsumablePending, type ConsumableButtonInput } from "./consumableButton";
import {
  NEUTRAL_INPUT,
  parseDevEvents,
  buildingAtPoint,
  type MoveRequest,
  consumableStats,
  shopConsumables,
  inPoolOnly,
  ALL_UNLOCKED,
  reloadSecondsFor,
  throwAimLength,
  throwStatsOf,
  type ThrowStats,
  PROJECTILE_POOL_CAPACITY,
  TICK_RATE_HZ,
  ZOMBIE_POOL_CAPACITY,
  activeSlot,
  addPlayer,
  countsInVote,
  buildingStats,
  isFlame,
  hasMagazine,
  setLoadout,
  allGear,
  cardCatalog,
  cardPrice,
  parseDevShopCards,
  gearIds,
  ownedCount,
  upgradePriceTable,
  spectateTarget,
  collapseStyleAt,
  ruinsLookAt,
  weaponName,
  ticksFor,
  weaponIds,
  weaponStats,
  parseWaveMix,
  parseStartWave,
  isRushState,
  BOSS_STATE,
  darknessAlpha,
  acidSpitOf,
  type Balance,
  type SimEvent,
  type BuildingRotation,
  type BlockReason,
  type PlaceError,
  type PlaceRequest,
  type RepairError,
  type PlayerInput,
  type PlayerState,
  type LauncherStats,
  type World,
  buildingById,
  footprint,
  type Box,
  inHealReach,
  playerIdOfSlot,
  type ShopOfferView,
  isBlackout as isBlackoutNow,
  setForcedBlackout,
  MAX_PLAYERS,
  PING_SHOW_MS,
  type AdminCheat,
} from "@topdown/shared";
import { dpr, safeArea, type SafeArea } from "../display";
import { STICK_RADIUS_CSS_PX, TouchSticks } from "../input/TouchSticks";
import { InputRouter } from "../input/InputRouter";
import { attachDesktopInput } from "../input/desktopInput";
import { pixelsPerMeter, shakeIntensityFor } from "../render/camera";
import { PlayerView } from "../render/PlayerView";
import { ACID_CUE_MS, FireCue } from "../render/fireCue";
import { ACID_SOUND_MAX_AGE_S, AcidFx } from "../render/acidFx";
import { BRUTE_BANNER, bruteSpawnCue, type BruteCue } from "../render/bruteCue";
import { AcidView } from "../render/AcidView";
import { playSfx, startBossLoop, startChainsawRev, startFlameLoop, stopBossLoop, stopChainsawRev, stopFlameLoop } from "../audio/placeholderSfx";
import { BossView } from "../render/BossView";
import { EVENT_ARROW_CSS_PX, EventView } from "../render/EventView";
import { LootBagView } from "../render/LootBagView";
import { createLootCue, lootCue } from "../render/lootBagCue";
import { cratePrompt, createEventCue, eventCue } from "../render/eventMarkers";
import { BOSS_TARGET_BUZZ, bossCue, type BossCue } from "../render/bossCue";
import { BloaterFx } from "../render/bloaterFx";
import { BloaterView } from "../render/BloaterView";
import { SawClock } from "../render/meleeFx";
import { BurnView } from "../render/BurnView";
import { FlameView } from "../render/FlameView";
import { edgeGlowAlpha, friendlyFireVictim, routeAcidHit, routeFireHit } from "../render/burnCue";
import { ZombieView } from "../render/ZombieView";
import { BloodTrailView } from "../render/BloodTrailView";
import { FxView } from "../render/FxView";
import { ProjectileView } from "../render/ProjectileView";
import { streakScales } from "../render/weaponLook";
import { DownedView } from "../render/DownedView";
import { WallSilhouetteView, type SilhouetteBody } from "../render/WallSilhouetteView";
import { SILHOUETTE_ZOMBIE } from "../render/wallSilhouette";
import { SLOT_COLORS } from "../render/playerColors";
import { BuildingView } from "../render/BuildingView";
import { BlockReasonView } from "../render/BlockReasonView";
import { PendingView } from "../render/PendingView";
import { PendingPlacements, newestBuildingId } from "./pendingPlacements";
import { pendingPlacements } from "../ui/pendingPlacements";
import { runPendingFrame, type PendingFlowScene } from "./pendingFlow";
import { MineView } from "../render/MineView";
import { MINE_SHAKE_MS, mineShakeIntensity } from "../render/mineBlast";
import { GrenadeView } from "../render/GrenadeView";
import { ExplosionView } from "../render/ExplosionView";
import { STALE_EXPLOSION_S, blastLookFor } from "../render/grenadeFx";
import { CityView } from "../render/city/CityView";
import { TurretView } from "../render/TurretView";
import { FloodlightView } from "../render/FloodlightView";
import { DarknessView, padDarknessView } from "../render/darkness/DarknessView";
import { hazardGhostFor } from "../render/city/rainLook";
import { ABOVE_DARK } from "../render/darkness/aboveDark";
import { EyesView } from "../render/darkness/EyesView";
import { BeamSparkleView } from "../render/darkness/BeamSparkleView";
import { DarknessPlan, FlashLights, planDarkness, type DarknessInputs } from "../render/darkness/darknessPlan";
import { ScreenFog } from "../render/fog/screenFog";
import { wireFog, type FogTakers } from "../render/fog/fogWiring";
import { FogView } from "../render/fog/FogView";
import { DustView } from "../render/city/DustView";
import { MedStationView } from "../render/MedStationView";
import { HealCue } from "../render/healCue";
import { Placement, placeRefusalText, stepPlacement, type PlacementFrame } from "./placement";
import { PlaceFxView } from "../render/PlaceFxView";
import { routeBuildKeys, type BuildKeysOut } from "./buildKeys";
import { PLACED_HAPTIC_MS, PlacedSoundPicker, REFUSED_HAPTIC, freshPlace, pickPopScale, placeSoundKind, placeVolume, type PlaceSoundKind } from "../render/placeFeel";
import { vibrate } from "../audio/haptics";
import { decayLossText, placementHintText, type HintContext } from "./blockText";
import { ChipText, chipLeft } from "./chipText";
import { BUILDING_TAP_TOLERANCE_M, RepairPanel, moveRefusalText, repairRefusalText, sellRefusalText, upgradeRefusalText } from "./repairPanel";
import { PendingMoves } from "./pendingMove";
import { longPressRing } from "../input/longPress";
import { MoveView } from "../render/MoveView";
import { TeammateGhostView } from "../render/TeammateGhostView";
import { GhostSender } from "../net/teammateGhosts";
import { NO_ANSWER_TEXT } from "./pendingFlow";
import { UndoChip } from "./undoChip";
import { BuildSpend } from "./buildSpend";
import { BuildingSelectView } from "../render/BuildingSelectView";
import { menuStep, playingScreen, uiStore, type MenuAction } from "../ui/uiState";
import { CLOSED_VOTE, VoteRequest, VoteSender, addHeldVoters, pollVote, voteFrameKey, voteStore, voteView, type VotePlayerIn } from "../ui/voteModel";
import { dawnEndsAt } from "../ui/dawnModel";
import { HeliView } from "../render/HeliView";
import { syncHeliToRun } from "../render/heliSync";
import { evacPadOf } from "../render/heliPose";
import { CameraDirector, DAWN_EDGE_M, createDirectorInputs, type DirectorOutput } from "../render/cameraDirector";
import { CrewView } from "../render/CrewView";
import { CREW_STEP_S } from "../render/crewPose";
import { DawnSweepView } from "../render/DawnSweepView";
import { cardStatLines } from "../ui/cardStats";
import { CLOSED_SHOP, shopAllowed, shopStep, shopStore, type ShopInput } from "../ui/shopStore";
import { holdBuildingInput, neutralizeInput, standsStill } from "../input/menuInput";
import { cachedProgress, practiceInit } from "../net/practicePool";
import { progressStore } from "../net/progressStore";
import { buildBarItems, dropQuietPresses, dropUndoAfterPick, panelStaysOpen, pickError, pickRefusalText, quickType, stepBuildBar, togglePanelKey, type BuildBarFrame, type BuildBarStep } from "./buildBar";
import { ToastQueue, playerLeftText } from "./toastQueue";
import { HOST_TOAST_TEXT, HostToastWatch } from "../ui/hostToast";
import { getSettings } from "../settings/settings";
import {
  COUNTDOWN_LIFT_M,
  MAX_DOWNED_MARKERS,
  MAX_RUSH_MARKERS,
  TEAMMATE_DOWNED,
  TEAMMATE_OUT,
  createHudModel,
  fuelPercent,
} from "./hudModel";
import { LocalSimHost, type SimStepStats } from "../sim/LocalSimHost";
import { NetSimHost } from "../sim/NetSimHost";
import type { SimHost } from "../sim/SimHost";
import { ReadyRequest } from "./readyRequest";
import { activeRun } from "../net/activeRun";
import type { NetSession } from "../net/session";
import type { HudSceneData } from "./HudScene";
import type { BootSceneData } from "./BootScene";
import { parseBossWaves, urlOptions } from "../debug/urlOptions";
import { SurvivorLayerPool } from "../render/SurvivorLayerPool";
import { SurvivorLookTextures, syncViewLook } from "../render/SurvivorLookTextures";
import { DevLooks } from "../render/devLooks";
import { deviceLook } from "../net/deviceLook";
import { clientBalance, soloBalance } from "../debug/clientBalance";
import { soloDevAllowed, soloUrlOptions } from "../debug/soloDevSwitches";
import { getTuning, tunedBalance } from "../debug/tuning";
import { validLoadout } from "./validLoadout";
import { recordSimFrame } from "../debug/perfProbe";
import { perf } from "../debug/perfStats";
import { autoQuality } from "../settings/autoQuality"; // Story 10.2-Q3
import { frameCap } from "../settings/batterySaver"; // Story 10.3 review H
import { STRESS_FLOOR_BUILDINGS, applyStressStage, stressProbe, keepStressMolotovs, placeStressFloor, placeStressFort, placeStressLights, setupStressWorld, stressFireInput, toughenStressZombies, stressRun, viewAround, type ViewRect } from "../debug/stressScenario";
import { netSummary } from "../debug/netSummary";
import { netMeter } from "../net/netMeter";
import { AmbiencePlayer } from "../audio/ambience";
import { PING_FADE_MS, PingView } from "../render/PingView"; // Story 8.7
import { MATE_ARROW_MARGIN_CSS_PX, MATE_NAME_TEXT_CSS_PX, createTeammateMarkers, teammateArrowRect, teammateLabelRect, teammateLabelWidthGuess, teammateMarkers, type TeammateMarker } from "../render/teammateMarkers"; // Story 10.2 B4
import { PING_SFX_VOLUME, pingFrame, pingPan } from "./pingFrame"; // Story 8.7
import { eventArrowDrawnRect, type ScreenRect } from "../render/eventArrow";

/** `scene.restart(data)` / `scene.start(data)` options. Phaser keeps the last data when given none: always pass an object. */
export type GameSceneData =
  | {
      /** Offline (a LocalSimHost): Practice solo, tests, dev and the `?solo` links. Absent means solo. */
      mode?: "solo";
      /** Run seed (uint32); a random one when absent (dev cheat "set run seed", Story 1.11). */
      seed?: number;
    }
  /** The server runs the fight (Story 2.4): a NetSimHost on this run's session. */
  | { mode: "online"; session: NetSession };

/** A host with the step timing the perf overlay reads (both hosts have it). */
type SceneHost = SimHost & { readonly stats: SimStepStats };

/** A random uint32 run seed. Client code, so crypto is allowed here (never in packages/shared). */
export function newRunSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** The fight: runs the World through a SimHost, draws it, and feeds it the local input. */
/** Story 5.4: how long a teammate's ring flashes orange after my fire hurt them (ms). */
/** Story 5.20 (ux-spec §10): a sell's short buzz (Android; ignored elsewhere). */
const SOLD_HAPTIC_MS = 12;
const FF_FLASH_MS = 250;
const RUSH_COLOR = 0xff3b30;
/** Short screen shake for heavy weapons (FR19); intensity is a fraction of the view size. */
/** Story 5.8: the gas-slow edge tint (steady: slowed, not hurt). */
const GAS_GLOW_ALPHA = 0.32;
const SHAKE_MS = 80;
/** Story 6.7: the boss bar empties and fades over this many seconds after its death. */
const BOSS_BAR_FADE_S = 2;
const SHAKE_INTENSITY = 0.004;
/** Rush chevron, in meters, drawn above each of the wave's last zombies. */
const CHEVRON_M = 0.28;
const CHEVRON_LIFT_M = 0.7;
const STATUS_OUT = "You're out: back after this wave";
/** Story 3.1: the banner at the run's first build phase. */
const BUILD_BANNER = "Build phase";
const STATUS_REVIVING = "Reviving…";
/** Solo Results: the one row's name. */
const SOLO_NAME = "You";
/** Story 3.3: shop inputs the scene sends often, allocated once. */
const SHOP_CLOSE: ShopInput = Object.freeze({ type: "close" });
const shopTime: { type: "time"; nowMs: number } = { type: "time", nowMs: 0 };
/** Story 7.4 (K5): my unlock mask (the World's copy: solo from progress, online from the schema); every unlock if unknown. */
export function localUnlocks(host: { readonly world: { readonly players: ReadonlyMap<string, { readonly unlocks: number }> }; readonly localPlayerId: string }): number {
  return host.world.players.get(host.localPlayerId)?.unlocks ?? ALL_UNLOCKED;
}

/** Story 5.13: the per-frame offer feed (reused: no allocation per frame). */
const shopOffer: { type: "offer"; offer: ShopOfferView | null; build: number } = { type: "offer", offer: null, build: -1 };

export class GameScene extends Phaser.Scene {
  private host: SceneHost | null = null;
  /** `?stress` benchmark run (no in-run menu). */
  private stressMode = false;
  /** Story 5.12: `?stressbuild=molotov` with `?stress`. */
  private stressMolotovs = 0;
  /** Story 5.3 `?stressfire=1`: under `?stress`, my survivor holds fire at the nearest zombie. */
  private stressFire = false;
  /** When the solo pause started (scene time), to shift the HUD's banner clock on resume. */
  private pausedAtMs = 0;
  /** The same host when solo (the in-run menu pauses it, Story 2.11); null online. */
  private localHost: LocalSimHost | null = null;
  /** Story 2.11: Leave game runs once (a double tap on Leave does nothing more). */
  private leaving = false;
  /** Story 2.11: "<name> left" lines for the HUD, one at a time. */
  private readonly toasts = new ToastQueue();
  /** Story 8.3 (H1, AC 9): "You are now the host", once, when the role moves to me mid-run (never on the first patch). */
  private readonly hostWatch = new HostToastWatch();
  /** Story 5.7: the Brute spawn cue (reused record). */
  private readonly bruteCue: BruteCue = { roar: false, banner: false, pan: 0 };
  /** How this run is simulated: the local World, or the server's (Story 2.4). */
  mode: "solo" | "online" = "solo";
  private sticks: TouchSticks | null = null;
  /** Touch sticks or keyboard + mouse, whichever was used last (Story 1.10). */
  private router: InputRouter | null = null;
  private readonly cursorWorld = new Phaser.Math.Vector2();
  /** One view per player in `world.players`, added and removed as players come and go (Story 2.4). */
  private readonly playerViews = new Map<string, PlayerView>();
  /** Story 4.8: who the server reports burning (fire damage events). */
  private readonly fireCue = new FireCue();
  private playerRadiusM = 0;
  private readonly syncPlayerView = (p: PlayerState, id: string): void => {
    if (this.host?.world.extract.boarded.has(id)) return; // Story 12.2: in the helicopter: no body drawn
    let view = this.playerViews.get(id);
    if (!view) {
      view = new PlayerView(this, this.playerRadiusM);
      view.setSlot(this.host?.playerInfo(id).slot ?? 0); // Story 2.9: ring colour by slot (E8-A2: set once: a player id's slot never changes, `p${slot}`)
      this.playerViews.set(id, view);
    }
    this.syncLook(view, id, this.host?.playerInfo(id).look ?? "");
    view.noBlink = this.host?.world.run.phase === "extract"; // Story 12.2: protected, but no blink
    view.update(p, this.host?.alpha ?? 0, this.time.now, this.fxView?.saw?.running(id, this.time.now) === true); // Story 5.2: the running Chainsaw frame
    view.setAboveDark(this.blackoutNow); // Story 6.3 (F5): one depth change when a blackout starts or ends
    // Story 5.4 (AC 7f): my fire hurt this teammate just now: their ring flashes orange.
    view.flashRing(this.time.now - (this.ffFlashMs.get(id) ?? -1e9) < FF_FLASH_MS);
    // Story 5.10 (D6): the heal cue — HP from state rose while the body touches a station's ring here.
    const w = this.host?.world;
    view.healCue(w !== undefined && this.healCue.update(id, p.hp, p.status === "alive" && inHealReach(w, p.x, p.y, p.radiusM), this.time.now));
    // Story 5.4: the flame cone of every flamer (mine online: the fire clock's aim, at once).
    const host = this.host;
    const flaming = host && p.status === "alive" ? host.flames.flaming(id) : "";
    if (flaming && host && this.flameView) {
      const own = host.online && id === host.localPlayerId;
      const dx = own ? host.flames.localDir.x : p.facingX;
      const dy = own ? host.flames.localDir.y : p.facingY;
      this.flameView.flamer(host.world.balance, flaming, view.x, view.y, this.playerRadiusM, dx, dy);
    }
    // Story 4.11 / 4.12: flames, smoke and embers on every survivor the server reports burning (dying down after).
    this.burnView?.draw(id, view.x, view.y, this.playerRadiusM, p.status === "alive" && this.fireCue.burning(id, this.time.now));
  };
  /** Story 4.11: the burning cues on survivors (pooled). */
  private burnView: BurnView | null = null;
  /** Story 5.4: flame streams and burning zombies (pooled), and when my fire last hurt each teammate (their ring flash). */
  private flameView: FlameView | null = null;
  /** Story 7.8: sprites of animated part layers (the propeller), made on first use; they go with the scene. */
  private layerPool: SurvivorLayerPool | null = null;
  /** Story 7.9: each player's own body texture (from their look, dimmed by the decay stage, D1). */
  private lookTextures: SurvivorLookTextures | null = null;
  /** Story 7.9 (AC 14): `?devlooks=N` extra survivors next to mine (dev builds, views only). */
  private devLooks: DevLooks | null = null;
  /**
   * Story 7.9: the view's body from the player's look and the decay stage. Cheap when nothing changed (two compares);
   * a new code or a new stage (a build start, D1) repaints that body once. The animated layer follows the look
   * (AC 10); `?devlayer` (dev builds) still forces it on everyone.
   */
  private readonly syncLook = (view: PlayerView, id: string, code: string): void => {
    // Review L7: online, bake only once the mirror has the server's decay stage (no stage-1 bake, then a repaint).
    const host = this.host;
    if (host instanceof NetSimHost && !host.decaySynced) return;
    if (this.lookTextures) syncViewLook(view, this.lookTextures, id, code, this.host?.world.decay.stage ?? 1, this.layerPoolOf, this.layerPool !== null, this.devLayerOpt);
  };
  /** `?devlayer` for this run (Story 10.11: solo reads it for admins too; set at each create). */
  private devLayerOpt: ReturnType<typeof urlOptions>["devLayer"] = null;
  private readonly layerPoolOf = (): SurvivorLayerPool => (this.layerPool ??= new SurvivorLayerPool(this));
  private readonly ffFlashMs = new Map<string, number>();
  private flameLooping = false;
  private readonly slotOfPlayer = (id: string): number => this.host?.playerInfo(id).slot ?? -1;
  /** Story 7.12: a finder's display name ("" solo / unknown: the line says "Bag found!"). */
  private readonly lootNameOf = (id: string): string => this.host?.playerInfo(id).name ?? "";
  /** Story 2.9: every other player for the HUD's names and edge arrows (drawn position, slot, flags). */
  private readonly collectTeammate = (p: PlayerState, id: string): void => {
    const host = this.host;
    const m = this.hudModel;
    if (!host || id === host.localPlayerId || m.teammateCount >= m.teammateSlot.length) return;
    if (host.world.extract.boarded.has(id)) return; // Story 12.2: aboard: no name, no edge arrow
    const info = host.playerInfo(id);
    const i = m.teammateCount++;
    const view = this.playerViews.get(id);
    m.teammates[i * 2] = view ? view.x : p.x;
    m.teammates[i * 2 + 1] = view ? view.y : p.y;
    m.teammateSlot[i] = info.slot;
    m.teammateFlags[i] = (p.status === "downed" ? TEAMMATE_DOWNED : 0) | (p.status === "out" ? TEAMMATE_OUT : 0);
    m.teammateSecs[i] = p.status === "downed" ? Math.ceil(p.downedTicksLeft / TICK_RATE_HZ) : 0;
    if (m.teammateNames[info.slot] !== info.name) m.teammateNames[info.slot] = info.name;
  };
  private readonly dropPlayerView = (view: PlayerView, id: string): void => {
    if (this.host?.world.players.has(id) && !this.host.world.extract.boarded.has(id)) return; // Story 12.2: a boarded body goes too
    view.destroy();
    this.playerViews.delete(id);
    this.lookTextures?.remove(id); // Story 7.9: a player who left takes their body texture along
  };
  /**
   * Designer pick C: hands the drawn bodies to the silhouette view. Review N1: no closure or allocation per frame once
   * warm (the zombie images are copied into a reused array, the entries are reused and never dropped; `silCount` is
   * how many are live this frame).
   */
  private updateWallSilhouettes(world: Readonly<World>): void {
    const sv = this.wallSilhouettes;
    const bv = this.buildingView;
    if (!sv || !bv) return;
    // Story 9.14 (AC 4): the standing police lines hide bodies too (joined into a reused list: no allocation per frame)
    const police = this.cityView?.policeLines.sprites();
    const walls = police && police.length > 0 ? this.joinWalls(bv.standingSprites(), police) : bv.standingSprites();
    let n = 0;
    if (walls.length > 0) {
      const zn = this.zombieView?.shownImages(this.silZombieImgs) ?? 0;
      for (let i = 0; i < zn; i++) n = this.putSilBody(n, this.silZombieImgs[i] as Phaser.GameObjects.Image, SILHOUETTE_ZOMBIE);
      for (const [id, v] of this.playerViews) n = this.putSilBody(n, v.bodyImage, SLOT_COLORS[(this.host?.playerInfo(id).slot ?? 0) % SLOT_COLORS.length] as number);
    }
    sv.update(walls, this.silBodies, n, this.time.now, darknessAlpha(world as World) > 0);
  }
  private joinWalls(a: readonly Phaser.GameObjects.Image[], b: readonly Phaser.GameObjects.Image[]): readonly Phaser.GameObjects.Image[] {
    const out = this.silWalls;
    out.length = 0;
    for (const w of a) out.push(w);
    for (const w of b) out.push(w);
    return out;
  }
  private putSilBody(n: number, img: Phaser.GameObjects.Image, color: number): number {
    let e = this.silBodies[n];
    if (!e) {
      e = { img, color, r: 0 };
      this.silBodies.push(e);
    }
    e.img = img;
    e.color = color;
    e.r = img.displayWidth * 0.25; // the sprite is about twice the body's width
    return n + 1;
  }

  private zombieView: ZombieView | null = null;
  /** Designer pick C: bodies behind standing walls glow through them (red zombies, blue survivors). */
  private wallSilhouettes: WallSilhouetteView | null = null;
  private readonly silBodies: SilhouetteBody[] = [];
  private readonly silZombieImgs: Phaser.GameObjects.Image[] = [];
  /** Story 9.14: the standing walls plus the police lines, for the silhouettes (reused). */
  private readonly silWalls: Phaser.GameObjects.Image[] = [];
  /** Story 6.5: the Behemoth (body, outline, telegraphs, target skull, crack decals). */
  private bossView: BossView | null = null;
  /** Story 6.11: the evacuation helicopter (visual only) and my vote's pending part. */
  private heliView: HeliView | null = null;
  /** Story 12.3: the extraction's camera director (it takes the camera over during `extract`), the crew, the dawn line. */
  private readonly director = new CameraDirector();
  private readonly dirIn = createDirectorInputs();
  private crewView: CrewView | null = null;
  private dawnView: DawnSweepView | null = null;
  /** The scene-clock second of the last boarding seen (−1 none; the crew's pull-in) and the boarded count then. */
  private pullAtS = -1;
  private boardedSeen = 0;
  /** The director had the camera last frame (its zoom goes back to the normal view when it lets go). */
  private directing = false;
  private readonly voteReq = new VoteRequest();
  private readonly voteSend = new VoteSender();
  /** Review L8: four reused voter records, filled by a callback made once; the panel is rebuilt only when its key changes. */
  private readonly votePlayers: VotePlayerIn[] = [0, 1, 2, 3].map(() => ({ slot: 0, vote: 0, standing: true, mine: false }));
  private voteCount = 0;
  private voteKey = -1;
  private voteCollectHost: SceneHost | null = null;
  private readonly collectVoter = (p: PlayerState, id: string): void => {
    const h = this.voteCollectHost;
    if (!h || this.voteCount >= this.votePlayers.length) return;
    const o = this.votePlayers[this.voteCount++] as VotePlayerIn;
    o.slot = h.playerInfo(id).slot;
    o.vote = p.vote;
    o.standing = countsInVote(p); // Story 8.12: downed and out players don't vote
    o.mine = id === h.localPlayerId;
  };
  private bossMusic = false;
  /** Story 6.8: the special events' markers, car lights, stampede chevrons and dust, the alarm loop. */
  private eventView: EventView | null = null;
  /** Story 8.7: everyone's pings in the world (above the darkness) and their edge arrows; online only. */
  private pingView: PingView | null = null;
  /** Story 7.12: the loot bag (bag, ring, glint, off-screen badge) and its HUD line (BF2). */
  private lootView: LootBagView | null = null;
  private readonly lootCueOut = createLootCue();
  private readonly lootLine = { text: "", slot: -1, untilMs: 0 };
  /** Story 6.8 review M2: the safe-area insets the event edge arrow keeps inside (read on create and resize, never per frame). */
  private eventInsets: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };
  private readonly eventCueOut = createEventCue();
  private readonly bossCueOut: BossCue = { banner: "", bannerColor: "", bannerMs: 0, sound: "", shake: false, buzz: false, music: "" };
  /** Story 6.7: the Behemoth number whose EVAC INBOUND was shown (once each, a woken tab too). */
  private bossEvacShown = 0;
  /** Story 6.7: seconds since its death (the bar empties and fades over 2 s); the last state seen (6.6: the rush sound). */
  private bossDeadS = 0;
  private bossLastState = 0;
  private readonly bossAt = { x: 0, y: 0 };
  /** Story 3.9: blood trails behind Crawlers. */
  private trailView: BloodTrailView | null = null;
  /** Story 5.6: the cosmetic spits and puddles (from events, both modes), their view, my acid cue and their clock (s; frozen by the solo pause). */
  private acidFx: AcidFx | null = null;
  private acidView: AcidView | null = null;
  /** Story 5.8: cosmetic Bloater bursts and gas clouds (from events) and the fuse rings. */
  private bloaterFx: BloaterFx | null = null;
  private bloaterView: BloaterView | null = null;
  private readonly acidCue = new FireCue(ACID_CUE_MS);
  private acidClockS = 0;
  private projectileView: ProjectileView | null = null;
  /** Story 5.5: cosmetic rounds + the landing marker, and explosions (both from events; the acid clock drives them). */
  private grenadeView: GrenadeView | null = null;
  private explosionView: ExplosionView | null = null;
  /** Story 5.12: molotov fire zones (from events; the 4.12 particle fire, ring at the 3 m edge). */
  private molotovView: MolotovView | null = null;
  private fxView: FxView | null = null;
  private downedView: DownedView | null = null;
  /** Story 3.4: placed buildings and the placement preview. */
  private buildingView: BuildingView | null = null;
  /** Story 5.9: mine rings (build phase) and blinking lights (waves). */
  private mineView: MineView | null = null;
  /** Story 5.14: one reused record for the re-arm ring (no allocation per frame). */
  private readonly mineRearmMe = { x: 0, y: 0, radiusM: 0, alive: false };
  /**
   * Story 4.9: the Dead City look (static city baked per stage, light, rain, vignette). Its stage
   * entry point is `showStage`; it also redraws by itself when the obstacles change stage/version.
   */
  private cityView: CityView | null = null;
  /** Stories 4.6/4.7: the stage's ambience loop (follows `world.decay.stage`; starts after a gesture). */
  ambience: AmbiencePlayer | null = null;
  /** Story 3.6: turret plates and heads (aim from the World / `turret.fired`). */
  private turretView: TurretView | null = null;
  /** Story 5.10: floodlight pools (pooled glow images) and med station rings; the heal cue from state. */
  private floodlightView: FloodlightView | null = null;
  /** Story 6.3: the blackout darkness, the zombie eyes and the beam sparkles above it (all idle while no blackout). */
  private darknessView: DarknessView | null = null;
  private eyesView: EyesView | null = null;
  private sparkleView: BeamSparkleView | null = null;
  private darknessPlan: DarknessPlan | null = null;
  private flashLights: FlashLights | null = null;
  /** Story 6.3: a blackout is on this frame (survivors above the darkness; flashes recorded). */
  private blackoutNow = false;
  /** Story 6.4: my screen's fog (the camera's survivor + every standing survivor's beam) and its look. */
  private screenFog: ScreenFog | null = null;
  private fogView: FogView | null = null;
  /** Story 6.2: Ruins dust puffs and the collapse burst. */
  private dustView: DustView | null = null;
  private readonly darkInputs: DarknessInputs = {
    localId: "",
    drawnOf: (id) => this.playerViews.get(id),
    flamingOf: (id) => this.host?.flames.flaming(id) ?? "",
    molotovs: [],
    flashes: new FlashLights(1),
    nowS: 0,
    viewX: 0,
    viewY: 0,
    viewW: 0,
    viewH: 0,
  };
  private medStationView: MedStationView | null = null;
  private readonly healCue = new HealCue();
  /** Story 3.4: placement mode on this device; Story 5.15: the ghost is carried while I walk. */
  private readonly placement = new Placement();
  /** "Wood barricade · $40" for the type being placed, and the refusal texts (built once each). */
  private placingLabel = "";
  /** Story 5.19: the held type's name and the item chip's cached text. */
  private placingName = "";
  private readonly chipText = new ChipText();
  /** Story 5.15: the placement step's per-frame context (one object, refilled every frame). */
  private readonly sendPlace = (req: PlaceRequest): void => this.queuePlace(req);
  /** Story 5.18: my placements without an answer yet (the chain's pending boxes), and how they are drawn. */
  private readonly pending = new PendingPlacements();
  private pendingView: PendingView | null = null;
  /** Story 5.23 (BX-9): dust, owner tabs (and the art drops), owner dots. */
  private placeFxView: PlaceFxView | null = null;
  /** Story 5.23 (AC 1): the last pick seen (`Placement.picks`) and when it popped. */
  private seenPicks = 0;
  private pickAtMs = Number.NEGATIVE_INFINITY;
  /** Story 5.23 (D12): the router's mouse-move count at the last pick / Place (the cursor follows once it changes), and the Places seen. */
  private cursorAnchorMoves = 0;
  private anchorPicks = 0;
  private seenPlaces = 0;
  private wasMouse = false;
  /** Story 5.23: the building keys' reused answer. */
  private readonly buildKeysOut: BuildKeysOut = { slot: -1, pickUp: false, panel: false };
  private readonly feelBox: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /** Story 5.23 (D4, review L2): the placed sounds of this frame's events, one per kind (mine wins). */
  private readonly placedSounds = new PlacedSoundPicker();
  private readonly playPlaced = (kind: PlaceSoundKind, pan: number, vol: number): void =>
    playSfx(kind === "thunk" ? "building_placed_thunk" : kind === "clank" ? "building_placed_clank" : "building_placed_click", pan, vol);
  /** Story 5.23 (AC 3, D8): a refusal of my placement: a dull buzz + 30-40-30 ms (the visual twin: the shaking box / the toast). */
  private readonly buzzRefused = (): void => {
    playSfx("building_place_refused");
    vibrate(REFUSED_HAPTIC);
  };
  private readonly pendingBox: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /** Story 5.18: the pump's send (the request is the tracker's reused object: the host encodes at once). */
  private readonly sendNow = (req: PlaceRequest): void => this.host?.placeBuilding(req);
  private readonly placeFrame: PlacementFrame = {
    can: false,
    wave: 0,
    x: 0,
    y: 0,
    ownerId: "",
    label: "",
    refusal: (e) => this.refusalText(e),
    send: this.sendPlace,
    toast: (text) => this.toasts.push(text),
    nowMs: 0,
    hintText: (e, r) => this.hintText(e, r),
    pending: this.pending,
    viewMinX: Number.NaN,
    viewMinY: Number.NaN,
    viewMaxX: Number.NaN,
    viewMaxY: Number.NaN,
    pxPerM: 0,
    avoid: null,
    avoidCount: 0,
    cursorX: Number.NaN,
    cursorY: Number.NaN,
    refused: this.buzzRefused,
  };
  /** Story 5.19 review L4: the hand cluster's rects in world metres (refilled every frame from `hudModel.handAvoid`). */
  private readonly handAvoidM = new Float64Array(16);
  /** Story 5.17: the reason line's last text and what it was built from (rebuilt only when one changes: no string per frame). */
  private hint = { e: "" as PlaceError | "", cause: "", index: 0, id: 0, playerId: "", name: "", wallet: -1, type: "", text: "" };
  private readonly hintCtx: HintContext = { price: 0, wallet: 0, nameOf: (id) => this.ownerName(id), refusal: (e) => this.refusalText(e) };
  /** Story 5.17: the shown reason's culprit and the spawn no-build circles. */
  private blockReasonView: BlockReasonView | null = null;
  private readonly drawnAt = (id: string): { x: number; y: number } | undefined => this.playerViews.get(id);
  private readonly refusalTexts = new Map<PlaceError, string>();
  /** Story 5.16: the build bar's per-frame context and answer (one object each, refilled every frame). */
  private readonly barFrame: BuildBarFrame = { can: false, holding: false, selected: false, owned: 0, cap: 0, wallet: 0, quiet: false };
  private readonly barStep: BuildBarStep = { show: false, pick: "", toast: "" };
  /** Story 5.16: the bar's last refusal toast ("" = none), withdrawn once a pick succeeds. */
  private barToast = "";
  /** Story 10.10 (BU-5, B9): the type of my last confirmed building this run — the server's (solo: the sim's) `building.placed` for me (the quick tile; client-side only). */
  private lastPlacedType = "";
  /** Story 10.10 (re-review 2, M): scene clock when a panel pick or the quick tile last started a hold. */
  private barPickMs = Number.NEGATIVE_INFINITY;
  /** Story 3.7: the repair panel on this device, the selected building's outline. */
  private readonly repairPanel = new RepairPanel();
  /** Story 5.20: the undo chip ↶ (the last Place's take-back) and what I paid per building this build phase (the panel's label). */
  private readonly undo = new UndoChip();
  private readonly buildSpend = new BuildSpend();
  private readonly spentOn = (id: number): number => this.buildSpend.spentOn(id);
  private readonly sellNow = (id: number): void => this.host?.sellBuilding(id);
  /** Story 5.22: my moves waiting for the server (AC 13), the view of them and of the held building's old spot. */
  private readonly pendingMoves = new PendingMoves();
  private moveView: MoveView | null = null;
  /** Story 5.24: teammates' ghosts (cosmetic) and the pacing of mine. */
  private ghostView: TeammateGhostView | null = null;
  private ghostSender = new GhostSender();
  private readonly ghostNameOf = (slot: number): string => {
    const id = playerIdOfSlot(slot);
    return id && this.host ? this.host.playerInfo(id).name : "";
  };
  private readonly moveBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private readonly movingNow = (id: number): boolean => this.pendingMoves.waiting(id);
  private readonly sendMove = (req: MoveRequest): void => this.queueMove(req);
  /** Story 5.21 (AC 7, D8): the HUD asks whether a building's tap area is under canvas (x, y) (Ready yields to it). */
  private readonly buildingAtCanvas = (x: number, y: number): boolean => {
    const host = this.host;
    if (!host) return false;
    const w = this.cameras.main.getWorldPoint(x, y, this.cursorWorld);
    return buildingAtPoint(host.world, w.x, w.y, BUILDING_TAP_TOLERANCE_M) !== null;
  };
  private selectView: BuildingSelectView | null = null;
  /** A teammate's display name for the panel (called only when its texts change). */
  private readonly ownerName = (ownerId: string): string => this.host?.playerInfo(ownerId).name ?? ownerId;
  /** Solo Results (Story 2.8): zombies the local player killed this run (online: from room state). */
  private kills = 0;
  /**
   * Story 3.1: the Ready this device asked for in the current build phase (shown at once, while the
   * server's copy is a round trip away online), and the phase it belongs to: cleared when it changes.
   */
  /** Reused input of `shopAllowed` (no object per frame). */
  private readonly shopCheck = { phase: "", running: false, gameOver: false, menuOpen: false, stressMode: false, leaving: false };
  /** Story 3.1 review: my Ready button (server truth + a pending tap). */
  private readonly ready = new ReadyRequest();
  private myReady = false;
  private readyCount = 0;
  private readonly countReady = (p: PlayerState, id: string): void => {
    if (id === this.host?.localPlayerId ? this.myReady : p.buildReady) this.readyCount++;
  };
  /** Seconds in the "Downed: …" line now (the string is rebuilt only when it changes). */
  private statusSecs = -1;
  /** Set by `collectDowned` while it walks the players this frame. */
  private revivingSomeone = false;
  private readonly collectDowned = (p: PlayerState): void => {
    const m = this.hudModel;
    if (p.status !== "downed") return;
    if (p.reviverId !== null && p.reviverId === this.host?.localPlayerId) this.revivingSomeone = true;
    if (m.downedCount >= MAX_DOWNED_MARKERS) return;
    const i = m.downedCount * 3;
    m.downed[i] = p.x;
    m.downed[i + 1] = p.y - COUNTDOWN_LIFT_M;
    m.downed[i + 2] = Math.ceil(p.downedTicksLeft / TICK_RATE_HZ);
    m.downedCount++;
  };
  private readonly hudModel = createHudModel();
  private gameOver = false;
  /** False until the run is on screen (and on a dead scene): the world doesn't step. */
  private running = false;
  private hudWeaponId = "";
  private hudOtherId = "";
  private readonly chevrons: Phaser.GameObjects.Triangle[] = [];
  /** Reused every frame (no per-frame allocation); the host copies it at each step. */
  private readonly input_: { -readonly [K in keyof PlayerInput]: PlayerInput[K] } = { ...NEUTRAL_INPUT };

  constructor() {
    super("Game");
  }

  create(data?: GameSceneData): void {
    const session = data?.mode === "online" ? data.session : null;
    if (session && session !== activeRun.current()) {
      // A start queued while this tab was hidden, for a run that is over (Story 2.8 review): go to
      // the room's current run, or back to the lobby, instead of a dead scene over the lobby screen.
      this.host = null; // Phaser reuses this object: never update a previous run's host
      this.localHost = null;
      const now = activeRun.current();
      if (now) this.scene.start("Game", { mode: "online", session: now } satisfies GameSceneData);
      else this.scene.start("Boot", { lobby: true } satisfies BootSceneData);
      return;
    }
    this.mode = session ? "online" : "solo";
    // Story 10.11 (AD-4): a solo run reads the dev link switches for dev builds AND admins (read at each solo start);
    // online keeps the dev-build-only `urlOptions()` (the server must run the matching DEV_* env).
    const soloDev = !session && soloDevAllowed();
    const opts = session ? urlOptions() : soloUrlOptions(soloDev);
    this.devLayerOpt = opts.devLayer;
    // ?tune=1: the live tuning values from the panel (validated like any balance change). Online
    // always plays the bundled balance: the server checked that version at join. Solo: `?wallet`
    // works in release builds too (designer 2026-11-23, soloBalance).
    const balance: Balance = session ? clientBalance() : opts.tune ? tunedBalance() : soloBalance(soloDev);
    const stickRadiusCss = opts.tune ? getTuning().stickRadiusCssPx : STICK_RADIUS_CSS_PX;
    const soloSeed = data?.mode !== "online" && data?.seed !== undefined ? data.seed >>> 0 : undefined;
    // Story 2.7: the reversed-hit counter runs in dev builds, and in release while the overlay is on.
    // Story 8.1 (F7): no input while the link is down (`linkStore`, written by the room's LinkMonitor).
    const netHost = session ? new NetSimHost({ balance, session, measureHits: () => import.meta.env.DEV || perf.overlayOn, linkUp: () => linkStore.get().status === "ok" }) : null;
    // Story 6.1 dev (?startwave=7, dev builds, solo, not with ?stress): the first build leads into that wave.
    const startWave = session || opts.stress !== null ? null : parseStartWave(opts.startWave, balance);
    const localHost = netHost ? null : new LocalSimHost({ balance, seed: soloSeed ?? newRunSeed(), startWave, look: deviceLook.get(), owned: progressStore.get().progress?.cosmetics, devLoot: opts.stress === null ? opts.loot : null });
    const host: SceneHost = netHost ?? (localHost as LocalSimHost);
    this.localHost = localHost;
    this.leaving = false;
    this.hostWatch.reset(); // Story 8.3: a (re)started scene's first patch never toasts
    this.toasts.clear();
    this.barToast = "";
    perf.hits = netHost ? netHost.netStats : null;
    perf.net = netHost; // Story 2.10: the overlay's network lines
    perf.soloSeed = localHost ? localHost.world.seed : null; // Story 4.4: online the overlay reads the server's
    const stress = session ? null : opts.stress;
    this.stressMode = stress !== null;
    this.stressMolotovs = stress !== null ? urlOptions().stressMolotovs : 0;
    this.stressFire = stress !== null && opts.stressFire;
    this.pausedAtMs = 0;
    this.host = host;
    const world = host.world;
    const localId = host.localPlayerId;
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    // Stories 7.4/7.5 (D1, T2): Practice solo starts with my cached unlocks and Training (online: from the server).
    // The ?stress tool keeps every unlock (its build scenarios place traps and lights).
    if (!session) addPlayer(world, localId, cx, cy, stress !== null ? {} : practiceInit(opts, progressStore.get().progress ?? cachedProgress()));
    // Story 3.9 dev hook, kept by 3.10 as an override: ?wavemix=walker,crawler replaces the waves.json mix (solo).
    if (!session && stress === null) world.debug.waveMix = parseWaveMix(opts.waveMix, balance);
    // Story 5.13 dev (?shopcards=, dev builds, solo): set before my first offer is drawn (lazily, on first read).
    if (!session && opts.shopCards !== null) world.debug.shopCards = parseDevShopCards(opts.shopCards, balance);
    // Story 6.5 dev (?bosswave=3, ?bosshp=0.1; dev builds, solo): the Behemoth's waves and an HP scale.
    if (!session) {
      world.debug.bossWaves = parseBossWaves(opts.bossWaves);
      world.debug.bossHpScale = opts.bossHpScale ?? 1;
      world.debug.events = parseDevEvents(opts.events); // Story 6.8 dev (?events=car_alarm@1; dev builds, solo)
    }
    this.gameOver = false;
    this.kills = 0;
    this.bossEvacShown = 0; // Story 6.7
    this.bossDeadS = 0;
    this.bossLastState = 0;
    this.consumablePending.active = false; // Story 5.12: Phaser reuses the scene: no pending use from the last run
    this.placement.cancel(); // Phaser reuses this scene object: no placement from the last run
    this.pending.reset(); // Story 5.18: nor a pending box
    this.pending.configure(balance.controls.build.pendingTimeoutMs, balance.controls.build.chainSendGapMs, balance.buildings.maxPerPlayer);
    this.refusalsDropped.seen = host.placeRefusalsDropped;
    this.handEmptiedMs = Number.NEGATIVE_INFINITY;
    this.lastPlacedType = ""; // Story 10.10: the quick tile starts from the first unlocked type each run
    this.barPickMs = Number.NEGATIVE_INFINITY;
    this.hudModel.buildPanelOpen = false;
    this.refusalTexts.clear();
    this.repairPanel.close(); // Story 3.7: no selection from the last run
    this.undo.clear(); // Story 5.20: no undo nor spend from the last run
    this.buildSpend.reset();
    this.ready.reset(); // Phaser reuses this scene object (restart): no Ready from the last run
    this.myReady = false;
    this.statusSecs = -1;
    // Phaser reuses this scene object on restart: reset what the HUD reads (no stale banner).
    Object.assign(this.hudModel, createHudModel());
    this.hudModel.buildingAt = this.buildingAtCanvas; // Story 5.21 (D8)
    this.pendingMoves.clear(); // Story 5.22: no move from the last run
    this.hudWeaponId = "";
    this.hudOtherId = "";
    if (balance.waves.lastRushCount > MAX_RUSH_MARKERS) {
      throw new Error(`waves.lastRushCount ${balance.waves.lastRushCount} exceeds MAX_RUSH_MARKERS ${MAX_RUSH_MARKERS}`);
    }
    if (session) {
      // Online game over → Back to start, or the connection dropped: leave the run (Story 2.4).
      uiStore.handle("leaveRun", (error) => this.scene.start("Boot", (error ? { error } : {}) satisfies BootSceneData));
      // Story 8.1 (AC 4, 6): my seat came back on a new room (a takeover or a reload's seat): the run goes on in a
      // restarted Game scene with the new session (the late-scene-start path; a same-room reconnect never gets here).
      uiStore.handle("startOnline", (next) => {
        if (this.scene.isActive()) this.scene.restart({ mode: "online", session: next } satisfies GameSceneData);
      });
      // Story 2.8: the room went back to the lobby; this device stays in it (the session was released).
      uiStore.handle("backToLobby", () => this.scene.start("Boot", { lobby: true } satisfies BootSceneData));
    } else {
      uiStore.handle("restart", () => this.scene.restart({} satisfies GameSceneData)); // {}: a new random seed
    }
    uiStore.handle("menu", (action) => this.onMenu(action)); // Story 2.11: the in-run menu's buttons
    // Story 2.11: teammates who leave get a toast; their ring, name and arrow go with their state entry.
    const offLeft = session?.onPlayerLeft((m) => {
      if (m.playerId !== localId) this.toasts.push(playerLeftText(m.name, m.reason));
    });
    // ?loadout=a,b (release-safe): start with those weapons; unknown ids are ignored. Solo only.
    // Story 3.3: every other run starts with the Pistol (the dev loadout is a dev cheat now).
    // Story 5.1: `?loadout=smg:3` also sets the upgrade level (solo only, like the weapons).
    const urlLoadout = opts.loadout && !session ? validLoadout(opts.loadout, weaponIds(balance), balance.shop.upgrades.maxLevel) : null;
    if (urlLoadout && (stress === null || this.stressFire)) { // Story 5.3: ?stressfire benchmarks the ?loadout weapon
      const p = world.players.get(localId);
      if (p) setLoadout(balance, p.loadout, urlLoadout.weapons, urlLoadout.levels);
    }
    this.running = true;
    // Online, the run may already be over when this scene starts late (hidden tab): keep Results up.
    // (`!== "results"`, not `=== "wave"`: under `?lag` the throttled state still says "lobby" here; 2.11 review.)
    if (!session || session.room.state?.phase !== "results") uiStore.set(playingScreen(session !== null));
    // Story 3.3: Phaser reuses this scene object (restart, late start): never a shop from the last run.
    shopStore.set(CLOSED_SHOP);
    uiStore.handle("shop", (action) => this.shopInput(action));

    this.ambience?.dispose(); // Phaser reuses this scene object: never two players
    this.ambience = new AmbiencePlayer();
    this.zombieView = new ZombieView(this, balance, ZOMBIE_POOL_CAPACITY, host.online, () => this.runSeed); // Story 5.7: Brute looks
    this.bossView = new BossView(this, host.world, () => this.runSeed); // Story 6.5 (9.15: the run seed predicts the next look to bake)
    this.eventView = new EventView(this, host.world); // Story 6.8
    this.pingView = host.pings ? new PingView(this) : null; // Story 8.7 (B8: online only)
    this.lootView = new LootBagView(this, host.world); // Story 7.12
    this.lootLine.text = ""; // Phaser reuses this scene object: no line from the last run
    this.lootLine.untilMs = 0;
    this.eventInsets = { ...safeArea() };
    this.heliView = new HeliView(this, host.world.map, balance.waves.evac.padRadiusM); // Story 6.11
    // Story 12.3: the cinematic (Phaser reuses the scene: everything reset here).
    this.director.reset();
    this.directing = false;
    this.pullAtS = -1;
    this.boardedSeen = 0;
    const padAt = evacPadOf(host.world.map);
    this.crewView = new CrewView(this, padAt.x, padAt.y);
    this.dawnView = new DawnSweepView(this, host.world.map.widthM, host.world.map.heightM);
    this.voteReq.reset();
    this.voteSend.reset();
    this.voteKey = -1;
    voteStore.set(CLOSED_VOTE);
    voteStore.handle((choice) => {
      // Story 6.11 (brief 30): the choice is latched on the tap and sent at once (solo: castVote before the next step).
      const h = this.host;
      if (!h || h.world.run.phase !== "vote" || this.gameOver) return;
      const me = h.world.players.get(h.localPlayerId);
      if (!me || !countsInVote(me)) return; // Story 8.12 (AC 6): downed / out — the buttons are disabled
      this.voteSend.want(this.voteReq.tap(choice, this.time.now)); // review M1: paced in updateVote
    });
    this.trailView = new BloodTrailView(this, ZOMBIE_POOL_CAPACITY);
    this.projectileView = new ProjectileView(this, PROJECTILE_POOL_CAPACITY, streakScales(balance)); // Story 5.3: short pellet streaks
    this.fxView = new FxView(this, this.zombieView, localId, (id) => buildingById(host.world, id)?.ownerId);
    this.fxView.balance = balance; // Story 3.5: building footprints for the debris
    // Story 5.2: Chainsaw running state (survivor frame, my rev loop) and the drawn-arc count for my own cuts.
    // Review M2/L3: the rev loop stops when the tab hides; it counts as playing only once really started.
    this.fxView.saw = new SawClock(balance.controls.fx.chainsawRevHoldMs, { start: startChainsawRev, stop: stopChainsawRev }, typeof document !== "undefined" ? document : null);
    this.fxView.world = host.world;
    this.downedView = new DownedView(this, world);
    this.buildingView = new BuildingView(this, balance);
    this.wallSilhouettes = new WallSilhouetteView(this, balance.controls.fx.maxWallSilhouettes);
    this.blockReasonView = new BlockReasonView(this);
    this.pendingView = new PendingView(this, this.pending.entries.length);
    this.moveView = new MoveView(this, this.pendingMoves.entries.length); // Story 5.22
    this.ghostView = new TeammateGhostView(this); // Story 5.24
    this.ghostSender = new GhostSender(); // Phaser reuses this scene object: nothing "sent" from the last run
    // Story 5.23: the placement feel's pools (caps in controls.json › fx); the owner's slot from the host (left players: grey).
    this.placeFxView = new PlaceFxView(this, balance.controls.fx.maxPlaceDust, balance.controls.fx.maxOwnerTabs, (id) => (host.world.players.has(id) ? host.playerInfo(id).slot : -1));
    this.seenPicks = this.anchorPicks = this.placement.picks;
    this.seenPlaces = this.placement.places;
    this.pickAtMs = Number.NEGATIVE_INFINITY;
    this.mineView = new MineView(this, balance);
    this.turretView = new TurretView(this);
    this.floodlightView = new FloodlightView(this, balance); // Story 5.10
    // Story 6.3: the darkness layer and what reads above it (pools sized by decay.json › blackout).
    this.darknessView = new DarknessView(this);
    this.eyesView = new EyesView(this, balance);
    this.sparkleView = new BeamSparkleView(this, balance, opts.lowFx);
    this.darknessPlan = new DarknessPlan(balance.decay.blackout.maxStamps);
    this.flashLights = new FlashLights(balance.decay.blackout.maxStamps);
    this.darkInputs.localId = localId;
    this.darkInputs.flashes = this.flashLights;
    this.darkInputs.molotovs = [];
    this.blackoutNow = false;
    // Story 6.4: the fog (rule on my screen + its look, painted into the darkness when it is drawn).
    this.screenFog = new ScreenFog();
    this.fogView = new FogView(this, this.screenFog, opts.lowFx);
    this.darknessView.fog = this.fogView;
    wireFog(this.fogTakers(), this.screenFog); // zombies, trails (review L5: no marks from fog-hidden Crawlers), spit
    // Story 6.2: Ruins dust (pools sized by decay.json › ruins; halved with ?fx=low).
    this.dustView = new DustView(this, balance.decay.ruins.maxDustSmoke, balance.decay.ruins.maxDustGrit, opts.lowFx);
    // Story 6.3 (AC 13): ?blackout=20|10|5 (solo, release-safe) forces the level for the whole run.
    if (!session && opts.blackoutPct !== null) setForcedBlackout(world, opts.blackoutPct);
    this.medStationView = new MedStationView(this, balance);
    this.healCue.clear(); // Phaser reuses this scene object
    this.selectView = new BuildingSelectView(this);
    this.playerRadiusM = balance.player.radiusM;
    this.playerViews.clear(); // Phaser reuses this scene object: the old views died at shutdown
    this.layerPool = null; // Story 7.8: its sprites died with the old scene
    this.lookTextures = new SurvivorLookTextures(this); // Story 7.9: drops a previous run's leftover bodies
    // Story 7.9 (AC 14): ?devlooks=N — N − 1 survivors with random starter looks beside mine (views only, dev builds).
    const devLooks = (this.mode === "solo" ? soloUrlOptions() : urlOptions()).devLooks; // Story 10.11: admins in solo too
    this.devLooks = devLooks > 1 ? new DevLooks(devLooks - 1, () => new PlayerView(this, this.playerRadiusM), this.syncLook) : null;
    this.fireCue.clear(); // Story 4.8
    this.burnView = new BurnView(this, urlOptions().lowFx); // Story 4.11 / 4.12 (?fx=low: half the particles)
    this.flameView = new FlameView(this, balance, urlOptions().lowFx); // Story 5.4
    this.ffFlashMs.clear();
    // Story 5.6: pools sized by the balance caps (created once per scene start).
    this.acidCue.clear();
    this.acidClockS = 0;
    const spitBal = acidSpitOf(balance);
    this.acidFx = new AcidFx(balance.zombies.spitCaps.maxLiveSpits, balance.zombies.spitCaps.maxLivePuddles, spitBal?.speedMps ?? 1, spitBal?.puddleS ?? 0);
    this.acidView = new AcidView(this, this.acidFx, spitBal?.puddleRadiusM ?? 1);
    this.grenadeView = new GrenadeView(this, balance, localId); // Story 5.5
    this.explosionView = new ExplosionView(this, balance);
    this.molotovView = new MolotovView(this, balance); // Story 5.12
    // Story 5.8: pools sized by the balance caps (gas clouds = the server's pool, particles by controls.json › fx).
    const blEx = balance.zombies.types.bloater?.explodes;
    this.bloaterFx = new BloaterFx(balance.zombies.blasts.maxGasClouds, balance.controls.fx.maxBloaterParticles, blEx?.gasRadiusM ?? 2.5, blEx?.gasS ?? 4);
    this.bloaterView = new BloaterView(this, this.bloaterFx, this.zombieView, blEx?.blastRadiusM ?? 2.5, balance.controls.fx.maxFuseRings);
    this.chevrons.length = 0;
    for (let i = 0; i < MAX_RUSH_MARKERS; i++) {
      const c = CHEVRON_M;
      this.chevrons.push(this.add.triangle(0, 0, -c, -c * 0.6, c, -c * 0.6, 0, c * 0.6, RUSH_COLOR).setDisplayOrigin(0, 0).setDepth(ABOVE_DARK.rush).setVisible(false)); // Story 6.3 review L4: above the darkness (FR30). Phaser 4: points are drawn from the display origin (2.9 review)
    }

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setBounds(0, 0, world.map.widthM, world.map.heightM);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.readEventInsets, this); // Story 6.8 review M2
    this.cityView = new CityView(this, world.map, cam.zoom, urlOptions().lowFx, () => this.runSeed); // Story 6.2: the lamp flicker key
    if (stress !== null) {
      // Fixed ?stress scenario (release too): god mode, waves paused, Walkers inside the view, Pistol.
      const view = viewAround(world.map, cx, cy, this.scale.width / cam.zoom, this.scale.height / cam.zoom, { x: 0, y: 0, w: 0, h: 0 });
      if (opts.stressStage !== null) applyStressStage(world, opts.stressStage); // Story 10.2 B1: the wave 9 scene (before the Walkers and buildings)
      if (opts.stressBuild) placeStressFloor(world, localId, cx, cy); // Story 5.9: before the Walkers
      if (opts.stressLights) placeStressLights(world, localId, cx, cy); // Story 5.10: 8 floodlights + 4 med stations
      if (opts.stressFort) placeStressFort(world, localId, cx, cy); // photoreal group 3: standing barricades
      if (opts.stressBear) placeStressFloor(world, localId, cx, cy, STRESS_FLOOR_BUILDINGS, ["bear_trap"]); // Story 5.14
      setupStressWorld(world, stress, view, cx, cy, parseWaveMix(opts.waveMix, balance)); // Story 5.6: ?wavemix=walker,spitter
      // Story 5.2: a melee ?stressfire benchmark (?loadout=chainsaw) keeps its crowd: the zombies can't die.
      // Story 5.4: so does a flame one (?loadout=flamethrower): the whole crowd keeps burning (the worst case).
      const firstKind = urlLoadout !== null ? balance.weapons[urlLoadout.weapons[0]]?.kind : undefined;
      // Story 5.5: a launcher benchmark keeps its crowd too (explosions keep coming on screen).
      const meleeFire = this.stressFire && (firstKind === "melee" || firstKind === "flame" || firstKind === "launcher");
      if (opts.stressBuild || opts.stressLights || opts.stressBear || meleeFire) toughenStressZombies(world);
      stressRun.start(performance.now(), stress);
      // Story 10.2 B2: the read-only probe the frame-rate script reads (release too; under ?stress only).
      Object.assign(window, { __stress: (windowMs = 3000) => stressProbe(world, performance.now(), windowMs) });
    }

    this.sticks = new TouchSticks(stickRadiusCss * dpr(), balance.controls.moveDeadZone, balance.controls.aimDeadZone);
    const router = new InputRouter(this.sticks);
    this.router = router;
    const detachDesktop = attachDesktopInput(router, window, document, document.getElementById("game"));
    const hudData: HudSceneData = { sticks: this.sticks, model: this.hudModel, router, stickRadiusCss };
    this.scene.launch("Hud", hudData);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.readEventInsets, this); // Story 6.8
      this.scene.stop("Hud");
      detachDesktop();
      this.router = null;
      stressRun.cancel();
      delete (window as { __stress?: unknown }).__stress; // Story 10.2 B2
      netSummary.cancel();
      uiStore.handle("restart", undefined);
      uiStore.handle("shop", undefined);
      shopStore.set(CLOSED_SHOP);
      uiStore.handle("leaveRun", undefined);
      uiStore.handle("backToLobby", undefined);
      uiStore.handle("menu", undefined);
      this.placement.cancel();
      this.buildingView?.destroy();
      this.buildingView = null;
      this.wallSilhouettes?.destroy();
      this.wallSilhouettes = null;
      this.blockReasonView?.destroy();
      this.blockReasonView = null;
      this.pending.reset();
      this.pendingView?.destroy();
      this.pendingView = null;
      this.moveView?.destroy();
      this.moveView = null;
      this.ghostView?.destroy();
      this.ghostView = null;
      this.placeFxView?.destroy();
      this.placeFxView = null;
      this.mineView?.destroy();
      this.mineView = null;
      this.cityView?.destroy();
      this.cityView = null;
      this.ambience?.dispose();
      this.ambience = null;
      this.turretView?.destroy();
      this.turretView = null;
      this.floodlightView?.destroy();
      this.floodlightView = null;
      this.darknessView?.destroy(); // Story 6.3
      this.darknessView = null;
      this.fogView?.destroy(); // Story 6.4
      this.fogView = null;
      this.screenFog = null;
      this.dustView?.destroy(); // Story 6.2
      this.dustView = null;
      this.eyesView?.destroy();
      this.eyesView = null;
      this.sparkleView?.destroy();
      this.sparkleView = null;
      this.darknessPlan = null;
      this.flashLights = null;
      this.medStationView?.destroy();
      this.medStationView = null;
      this.repairPanel.close();
      this.undo.clear();
      this.selectView?.destroy();
      this.selectView = null;
      offLeft?.();
      this.toasts.clear();
      for (const c of this.chevrons) c.destroy();
      this.chevrons.length = 0;
      this.fxView?.destroy();
      stopChainsawRev(); // Story 5.2: never a rev left running after the scene
      this.downedView?.destroy();
      this.downedView = null;
      this.projectileView?.destroy();
      this.zombieView?.destroy();
      this.bossView = null; // Story 6.5: its objects go with the scene
      this.eventView?.destroy(); // Story 6.8: the alarm loop stops; its objects go with the scene
      this.pingView?.destroy(); // Story 8.7
      this.pingView = null;
      this.eventView = null;
      this.lootView?.destroy(); // Story 7.12
      this.lootView = null;
      this.heliView = null; // Story 6.11: its images go with the scene
      this.crewView = null; // Story 12.3: likewise
      this.dawnView = null;
      voteStore.handle(null);
      voteStore.set(CLOSED_VOTE);
      if (this.bossMusic) stopBossLoop();
      this.bossMusic = false;
      this.trailView?.destroy();
      this.trailView = null;
      for (const v of this.playerViews.values()) v.destroy();
      this.playerViews.clear();
      this.devLooks?.destroy(); // Story 7.9
      this.devLooks = null;
      this.lookTextures?.dispose(); // Story 7.9: the per-player bodies go with the scene
      this.lookTextures = null;
      this.burnView?.destroy();
      this.burnView = null;
      this.flameView?.destroy(); // Story 5.4
      this.flameView = null;
      stopFlameLoop();
      this.flameLooping = false;
      this.acidView?.destroy();
      this.acidView = null;
      this.acidFx = null;
      this.grenadeView?.destroy();
      this.grenadeView = null;
      this.explosionView?.destroy();
      this.explosionView = null;
      this.molotovView?.destroy();
      this.molotovView = null;
      this.bloaterView?.destroy();
      this.bloaterView = null;
      this.bloaterFx = null;
      perf.hits = null;
      perf.net = null;
      perf.soloSeed = null;
      this.host?.dispose(); // online: also leaves the room
      this.host = null;
      this.localHost = null;
    });
  }

  /** Dev tools and automated browser checks only (Story 1.11): the running World, or null. */
  get debugWorld(): World | null {
    return this.host?.world ?? null;
  }

  /** Dev tools: the camera's visible world rectangle this frame (meters). */
  debugView(out: ViewRect): ViewRect {
    const m = this.hudModel;
    out.x = m.camX;
    out.y = m.camY;
    out.w = this.scale.width / m.camZoom;
    out.h = this.scale.height / m.camZoom;
    return out;
  }

  /** Story 10.12: the cheat panel's online path (an admin's cheat goes to the server, which decides). No-op solo. */
  sendAdminCheat(cheat: AdminCheat): void {
    if (this.host instanceof NetSimHost) this.host.sendAdminCheat(cheat);
  }

  /** Story 4.4 (10.12: online the panel's restart goes through `sendAdminCheat`). */
  get isOnline(): boolean {
    return this.mode === "online";
  }

  /** Story 10.6 (AC 3): the world a report reads its wave from (null between runs). */
  reportWorld(): { readonly waves: { readonly number: number } } | null {
    return this.running ? (this.host?.world ?? null) : null;
  }

  /** Story 4.4: this run's seed (online the server's, from the room state). */
  get runSeed(): number {
    return this.host instanceof NetSimHost ? this.host.runSeed : (this.host?.world.seed ?? 0);
  }

  /** Dev tools: restart the run, with a given seed or a random one. */
  restartRun(seed?: number): void {
    if (this.mode === "online") return; // the server owns the run
    this.scene.restart((seed === undefined ? {} : { seed }) satisfies GameSceneData);
  }

  /**
   * Solo pause (2.11 review): the sim already stops; this also freezes what is drawn on wall time —
   * FX tweens (blood fade, muzzle, puffs) in both scenes, the camera shake, and the wave banner's
   * clock (shifted by the paused time on resume).
   */
  private setPresentationPaused(paused: boolean): void {
    const hud = this.scene.get("Hud");
    if (paused) {
      this.pausedAtMs = this.time.now;
      this.tweens.pauseAll();
      hud?.tweens.pauseAll();
      this.cameras.main.shakeEffect.reset();
    } else {
      this.tweens.resumeAll();
      hud?.tweens.resumeAll();
      this.hudModel.bannerAtMs += this.time.now - this.pausedAtMs;
    }
  }

  /**
   * The in-run menu (Story 2.11): ☰, Esc and the menu's buttons all come here. Only while a run is
   * on screen (not in the dev loadout picker, not on Results). Opening it lets go of every held
   * key, button and stick, so nothing is still pressed when the player resumes.
   */
  private onMenu(action: MenuAction): void {
    const screen = uiStore.get();
    if (screen.kind !== "playing" || !this.running || this.gameOver || this.leaving || !this.host) return;
    const next = menuStep(screen.menu, action);
    if (next === "left") return this.leaveGame();
    if (next === screen.menu) return;
    if (screen.menu === "closed") {
      this.router?.releaseAll();
      this.host?.clearEdges(); // a Q pressed in the same step as Esc must not swap behind the menu
    }
    uiStore.set({ kind: "playing", menu: next, online: screen.online });
  }

  /**
   * Leave game (Story 2.11), once: online the host's dispose leaves the room for good
   * (`NetSession.leave` → `room.leave(true)`, consented: no reconnect window; the lobby store also
   * clears the share link), then the start screen without the title. Solo: the same without the room.
   */
  private leaveGame(): void {
    if (this.leaving) return;
    this.leaving = true;
    const online = this.mode === "online";
    this.host?.dispose();
    this.host = null;
    this.localHost = null;
    if (!online) history.replaceState(null, "", import.meta.env.BASE_URL);
    uiStore.set({ kind: "start" });
    this.scene.start("Boot", { start: true } satisfies BootSceneData); // stops Game, which stops Hud
  }

  private showBanner(text: string, color = "", showMs = 0): void {
    this.hudModel.bannerText = text;
    this.hudModel.bannerAtMs = this.time.now;
    this.hudModel.bannerColor = color; // Stories 6.6 / 6.7 (colour rule: red boss danger, amber something you can use)
    this.hudModel.bannerShowMs = showMs;
  }

  /**
   * Story 4.5: a banner that shares the frame with another one goes on a second line instead of
   * replacing it. A build start ends a wave and changes the decay stage in the same tick ("Wave 2
   * cleared" + "Panic"); a dev stage table can change it at the run's first build ("Panic" + "Build phase").
   */
  private stackBanner(text: string): void {
    const m = this.hudModel;
    if (m.bannerText !== "" && m.bannerAtMs === this.time.now && !m.bannerText.includes("\n")) this.showBanner(`${m.bannerText}\n${text}`);
    else this.showBanner(text);
  }

  /** Red chevrons above rushing zombies, and their positions for the HUD's edge arrows (FR30). */
  private updateRushMarkers(alpha: number, centerX: number, centerY: number): void {
    const host = this.host;
    if (!host) return;
    const z = host.world.zombies;
    const m = this.hudModel;
    let n = 0;
    for (let i = 0; i < z.aliveCount && n < MAX_RUSH_MARKERS; i++) {
      const id = z.aliveIds[i] as number;
      if (!isRushState(z.state[id] as number)) continue; // Story 5.6: a rushing Spitter in its windup too
      const x = (z.prevX[id] as number) + ((z.x[id] as number) - (z.prevX[id] as number)) * alpha;
      const y = (z.prevY[id] as number) + ((z.y[id] as number) - (z.prevY[id] as number)) * alpha;
      (this.chevrons[n] as Phaser.GameObjects.Triangle).setPosition(x, y - CHEVRON_LIFT_M).setVisible(true);
      m.rushers[n * 2] = x;
      m.rushers[n * 2 + 1] = y;
      n++;
    }
    m.rusherCount = n;
    for (let i = n; i < this.chevrons.length; i++) {
      const c = this.chevrons[i] as Phaser.GameObjects.Triangle;
      if (c.visible) c.setVisible(false);
    }
    // The camera's worldView only updates when it renders: compute this frame's view from the
    // centerOn target, clamped to the map like the camera bounds.
    const cam = this.cameras.main;
    const halfW = this.scale.width / cam.zoom / 2;
    const halfH = this.scale.height / cam.zoom / 2;
    const map = host.world.map;
    const cx = map.widthM > 2 * halfW ? Math.min(map.widthM - halfW, Math.max(halfW, centerX)) : map.widthM / 2;
    const cy = map.heightM > 2 * halfH ? Math.min(map.heightM - halfH, Math.max(halfH, centerY)) : map.heightM / 2;
    m.camX = cx - halfW;
    m.camY = cy - halfH;
    m.camZoom = cam.zoom;
    m.wave = host.world.waves.number;
    m.endless = host.world.run.endless; // Story 6.12: "Wave 13 · Endless"
    // Story 6.11: the sticks hide in the vote; Story 12.2: every action control hides during the extraction too.
    m.extracting = host.world.run.phase === "extract" && !this.gameOver;
    m.voting = (host.world.run.phase === "vote" || m.extracting) && !this.gameOver;
    m.watching = host instanceof NetSimHost && host.waiting; // Story 8.2 (J4): a waiting late joiner has only ☰
    m.remaining = host.world.waves.remaining;
  }

  /**
   * Solo Results after the wipe (Story 2.8) or, Story 3.10, after the last wave ("You held out!"):
   * wave reached, kills, money earned, Restart. Online, main.ts shows Results from the room state
   * when `phase` becomes "results" (every player's kills and earnings). `earned` is read from the
   * World after the step, so it includes the last wave's bonus (paid later in the same tick).
   */
  private showSoloResults(host: SceneHost, wave: number): void {
    this.gameOver = true;
    const me = host.world.players.get(host.localPlayerId);
    const earned = me?.earned ?? 0;
    const training = { maxHp: me?.trainHp ?? 0, damage: me?.trainDmg ?? 0, startMoney: me?.trainMoney ?? 0, reload: me?.trainReload ?? 0 }; // Story 7.5 (T4)
    const run = host.world.run;
    const ending = run.ending === "none" ? "wiped" : run.ending; // Story 6.11 / 6.12
    // Story 6.11 (DW1 / DW2): an Extract plays the 4 s dawn first (solo sees it live; a tap skips it).
    // Story 12.3: after the extraction phase the fly-out was the dawn (the screen is white): the card at once.
    const dawnEndsAtMs = dawnEndsAt(ending, !host.world.extract.started, performance.now(), host.world.balance.waves.evac.dawnS);
    uiStore.set({ kind: "results", wave: Math.max(1, wave), ending, endless: run.endless, rows: [{ slot: 0, name: SOLO_NAME, kills: this.kills, earned, training }], online: false, seed: host.world.seed, dawnEndsAtMs, mySlot: 0 });
  }

  /**
   * Story 6.11 (EX1, F1–F4): the vote panel each frame from the World (server truth online: phase,
   * ticks left, each player's `vote`) and my pending tap; the helicopter on the pad. A woken tab or a
   * late scene start during the vote finds the helicopter landed (no replayed descent).
   */
  private updateVote(host: SceneHost): void {
    const run = host.world.run;
    const open = run.phase === "vote" && !this.gameOver;
    const nowS = this.time.now / 1000;
    if (open && this.heliView && this.heliView.phase === "gone") {
      const total = ticksFor(host.world.balance.waves.evac.voteS);
      this.heliView.opened(nowS, (total - run.voteTicksLeft) / TICK_RATE_HZ);
    }
    // Story 12.2: a build clears it (a skipped lift-off, review L4: one already flown off); the extraction's fly-out.
    const ex = host.world.extract;
    if (this.heliView) syncHeliToRun(this.heliView, run.phase, ex.started, ex.liftedAtTick, host.world.tick, nowS, host.world.balance.waves.evac.flyOutS);
    this.heliView?.update(nowS);
    if (!open) {
      if (this.voteKey !== -1) voteStore.set(CLOSED_VOTE);
      this.voteKey = -1;
      return;
    }
    const me = host.world.players.get(host.localPlayerId);
    this.voteCount = 0;
    this.voteCollectHost = host;
    host.world.players.forEach(this.collectVoter);
    this.voteCollectHost = null;
    // Story 8.1 RR1-M1 / 8.12: held seats are dimmed "not voting" chips, left out of the count as the server does.
    if (host.heldSeatSlots) this.voteCount = addHeldVoters(this.votePlayers, this.voteCount, host.heldSeatSlots());
    // Re-review RM1: urgent in the vote's last VOTE_URGENT_MS or once everyone has voted (the 1 s hold):
    // a change of mind goes out at once even with the bucket empty.
    // Review M1 / re-review 2 (N3): paced, newest choice last, urgent near the end (one shared step with the netsim test).
    const send = pollVote(this.voteSend, host.world.waves.number, me?.vote ?? 0, this.time.now, run.voteTicksLeft, TICK_RATE_HZ, this.votePlayers, this.voteCount);
    if (send) host.castVote(send);
    const shown = this.voteReq.update(host.world.waves.number, me?.vote ?? 0, this.time.now);
    const total = ticksFor(host.world.balance.waves.evac.voteS);
    const pending = this.voteReq.isPending();
    const key = voteFrameKey(run.voteTicksLeft, total, TICK_RATE_HZ, this.votePlayers, this.voteCount, shown, pending);
    if (key === this.voteKey) return; // review L8: nothing visible changed, nothing built
    this.voteKey = key;
    voteStore.set(voteView(true, run.voteTicksLeft, total, TICK_RATE_HZ, this.votePlayers.slice(0, this.voteCount), shown, pending));
  }

  /**
   * Story 3.1: the build phase's countdown and Ready button. A tap toggles this device's Ready
   * (`SimHost.setBuildReady`: solo at once, online as `build.set_ready`); the button shows the asked
   * state at once. Hidden outside a build, before the loadout is picked, on Results and under the menu.
   */
  private updateReady(host: SceneHost, menuOpen: boolean): void {
    const m = this.hudModel;
    const run = host.world.run;
    const build = run.phase === "build";
    m.buildSecs = build ? Math.ceil(run.buildTicksLeft / TICK_RATE_HZ) : -1;
    // Story 5.21 (D3): hidden under the action bar too (its row is only 8 px above Ready's top edge).
    m.readyButton = build && this.running && !this.gameOver && !menuOpen && !this.stressMode && !this.placement.active && !this.repairPanel.open && !m.watching;
    const serverReady = host.world.players.get(host.localPlayerId)?.buildReady === true;
    const now = this.time.now;
    this.myReady = this.ready.update(run.phase, host.world.waves.number, serverReady, now);
    const pressed = m.readyPressed;
    m.readyPressed = false;
    if (pressed && m.readyButton) {
      this.myReady = this.ready.tap(serverReady, now);
      host.setBuildReady(this.myReady);
    }
    m.readyOn = this.myReady;
    this.readyCount = 0;
    if (build) host.world.players.forEach(this.countReady);
    m.readyCount = this.readyCount;
    m.readyTotal = host.world.players.size;
  }

  /** Story 3.4: placement is possible now (a build phase, a run on screen, menu closed, my survivor standing). */
  private canPlace(host: SceneHost, menuOpen: boolean): boolean {
    const me = host.world.players.get(host.localPlayerId);
    return (
      host.world.run.phase === "build" &&
      this.running &&
      !this.gameOver &&
      !this.leaving &&
      !menuOpen &&
      !this.stressMode &&
      me !== undefined &&
      me.status === "alive"
    );
  }

  /**
   * Story 5.17 (AC 3): the reason line for the shown error and reason (`placementHintText`), cached:
   * rebuilt only when the error, the cause, the culprit (and a teammate's name), my wallet or the held type changes.
   */
  private hintText(e: PlaceError, r: Readonly<BlockReason> | null): string {
    const host = this.host;
    if (!host) return "";
    const wallet = this.shownWallet(host); // Story 5.18: pending prices off
    const h = this.hint;
    const type = this.placement.type;
    const cause = r ? r.cause : "";
    const index = r ? r.index : 0;
    const id = r ? r.id : 0;
    const playerId = r ? r.playerId : "";
    const name = cause === "teammate" ? this.ownerName(playerId) : ""; // review L3: a name that arrives later updates the line
    if (h.e === e && h.cause === cause && h.index === index && h.id === id && h.playerId === playerId && h.name === name && h.wallet === wallet && h.type === type) return h.text;
    const c = this.hintCtx;
    c.price = buildingStats(host.world.balance, type)?.price ?? 0;
    c.wallet = wallet;
    this.hint = { e, cause, index, id, playerId, name, wallet, type, text: placementHintText(host.world, e, r, c) };
    return this.hint.text;
  }

  private refusalText(e: PlaceError): string {
    let t = this.refusalTexts.get(e);
    if (t === undefined) {
      t = placeRefusalText(e, this.host?.world.balance ?? clientBalance());
      this.refusalTexts.set(e, t);
    }
    return t;
  }

  /**
   * Story 3.4: `startPlacement` (Story 5.16: the build bar calls it when a tile is picked). Ignored
   * outside a build phase, under the menu, on Results or for an unknown type. Story 5.15: I keep
   * walking: only the aim stick and the mouse button let go (a held move stick or key keeps steering).
   */
  private startPlacement(type: string): void {
    const host = this.host;
    const screen = uiStore.get();
    const menuOpen = screen.kind === "playing" && screen.menu !== "closed";
    if (!host || !this.canPlace(host, menuOpen)) return;
    const me = host.world.players.get(host.localPlayerId);
    const stats = buildingStats(host.world.balance, type);
    if (!me || !stats) return;
    const pv = this.playerViews.get(host.localPlayerId);
    if (!this.placement.start(host.world.balance, type, pv?.x ?? me.x, pv?.y ?? me.y, me.facingX, me.facingY, host.world.waves.number)) return;
    this.placingLabel = `${stats.name} · $${stats.price}`;
    this.placingName = stats.name;
    this.router?.releaseAim();
    host.clearEdges();
  }

  /**
   * Story 3.4 / 5.15: placement mode, once per frame before the input goes to the host
   * (`stepPlacement`: hold input, ✕, Place = the spot shown last frame, ⟳, then the carry with my
   * survivor as last drawn and the shared check). One reused frame object: no allocation per frame.
   */
  private updatePlacement(host: SceneHost, menuOpen: boolean): void {
    const f = this.placeFrame;
    const me = host.world.players.get(host.localPlayerId);
    const pv = this.playerViews.get(host.localPlayerId);
    f.can = this.canPlace(host, menuOpen);
    f.wave = host.world.waves.number;
    f.x = pv?.x ?? me?.x ?? 0;
    f.y = pv?.y ?? me?.y ?? 0;
    f.ownerId = host.localPlayerId;
    f.label = this.placingLabel;
    f.send = this.sendPlace;
    f.sendMove = this.sendMove; // Story 5.22
    f.nowMs = this.time.now;
    const v = this.cameras.main.worldView; // Story 5.18: a pinned ghost that leaves it goes back to carry
    f.viewMinX = v.x;
    f.viewMinY = v.y;
    f.viewMaxX = v.x + v.width;
    f.viewMaxY = v.y + v.height;
    const zoom = this.cameras.main.zoom;
    f.pxPerM = zoom; // Story 5.19: the drag's canvas px → metres (gain 1.0 = 1:1 on screen)
    const m = this.hudModel;
    // review L4: the HUD's cluster rects (canvas px, unzoomed) → world metres through this camera
    const av = m.handAvoid;
    const am = this.handAvoidM;
    for (let i = 0; i < 16; i += 2) {
      am[i] = v.x + (av[i] as number) / zoom;
      am[i + 1] = v.y + (av[i + 1] as number) / zoom;
    }
    f.avoid = am;
    f.avoidCount = (av[2] as number) > 0 ? 4 : 0; // 0 until the HUD laid the cluster out
    m.dragStartPx = host.world.balance.controls.build.dragStartPx;
    // Story 5.23 (AC 9, D12): in mouse mode the ghost follows the cursor once the mouse moved after the pick / the last Place
    const r = this.router;
    const p0 = this.placement;
    // review L1 / L9: the chip's "↩ carry" and a switch to the mouse also wait for the next mouse move
    const toMouse = r !== null && r.isMouse && !this.wasMouse;
    this.wasMouse = r !== null && r.isMouse;
    if (r && (p0.picks !== this.anchorPicks || p0.places !== this.seenPlaces || m.chipPressed || toMouse)) {
      this.anchorPicks = p0.picks;
      this.seenPlaces = p0.places;
      this.cursorAnchorMoves = r.mouseMoves;
    }
    const follow = r !== null && p0.active && r.isMouse && !Number.isNaN(r.cursorX) && r.mouseMoves !== this.cursorAnchorMoves;
    if (follow && r) {
      const cw = this.cursorWorld;
      this.cameras.main.getWorldPoint(r.cursorX, r.cursorY, cw);
      f.cursorX = cw.x;
      f.cursorY = cw.y;
    } else {
      f.cursorX = Number.NaN;
      f.cursorY = Number.NaN;
    }
    stepPlacement(this.placement, m, this.input_, host.world, f);
    const p = this.placement;
    if (p.active) {
      // Story 5.19 (AC 7): the item chip (cached: a new string only when a part changes)
      const left = chipLeft(host.world.balance.buildings.maxPerPlayer, ownedCount(host.world, host.localPlayerId), this.pending.count, this.shownWallet(host), p.price);
      m.placementChip = this.chipText.get(this.placingName, p.price, left, p.pinned, m.placementChipShort, p.moveId !== 0); // Story 5.22: "· moving"
    }
  }

  /**
   * Story 5.18: my wallet as shown (HUD, build bar, reason line, shop): the World's (server truth
   * online) minus the prices of my pending placements (AC 5). Never changes the World.
   */
  private shownWallet(host: SceneHost): number {
    const w = host.world.players.get(host.localPlayerId)?.wallet ?? 0;
    return Math.max(0, w - this.pending.money);
  }

  /** Story 5.18: a Place → a pending box at the spot shown (sent by `pumpPending` within the send gap). */
  private queuePlace(req: PlaceRequest): void {
    const host = this.host;
    if (!host) return;
    const world = host.world;
    const stats = buildingStats(world.balance, req.type);
    if (!stats) return;
    footprint(stats, req.gx, req.gy, req.rot, this.pendingBox);
    if (!this.pending.add(req, stats.price, this.pendingBox, newestBuildingId(world), world.run.phase, world.waves.number)) host.placeBuilding(req); // pool full (never with 6 counted): send unpaced
    else this.undo.placed(this.pending.lastOrder, this.time.now, world.waves.number); // Story 5.20: ↶ for 10 s
  }

  /** Story 5.18 (review M2): this frame's context for the two scene steps of `runPendingFrame` (one object). */
  private readonly frameCtx: { host: SceneHost | null; menuOpen: boolean; shopOpen: boolean; deltaMs: number } = { host: null, menuOpen: false, shopOpen: false, deltaMs: 0 };
  private readonly refusalsDropped = { seen: 0 };
  /** Story 5.18 (Q2): scene clock when the hand last emptied; build-bar taps within `barQuietMs` are ignored. */
  private handEmptiedMs = Number.NEGATIVE_INFINITY;
  private readonly pendingScene: PendingFlowScene = {
    beforeHost: () => this.beforeHostStep(),
    stepHost: () => this.hostStep(),
    toast: (text) => this.toasts.push(text),
    refusalText: (e) => this.refusalText(e),
    refused: this.buzzRefused,
  };

  /**
   * Story 5.24 (AC 2): my held building (a new one or a move; "" when my hands are empty or the spot
   * is off the wire), paced by `GhostSender` (on change ≤ 4 Hz, keepalive 2 Hz, one clear). Online only.
   */
  private sendGhost(host: SceneHost): void {
    if (!host.online) return;
    const p = this.placement;
    const held = p.active && p.onWire();
    const s = this.ghostSender;
    if (s.step(this.time.now, host.world.run.phase === "build", held ? p.type : "", p.gx, p.gy, p.rot)) host.sendGhost(s.out.type, s.out.gx, s.out.gy, s.out.rot);
  }

  /** Everything before the host steps (placement, repair, build bar, Ready, the input). */
  private beforeHostStep(): void {
    const fc = this.frameCtx;
    const host = fc.host;
    if (!host) return;
    const { menuOpen, shopOpen } = fc;
    const wasHolding = this.placement.active;
    this.updatePlacement(host, menuOpen || shopOpen); // Story 3.4 / 5.15: holding keeps the move, drops aim and fire
    if (wasHolding && !this.placement.active) this.handEmptiedMs = this.time.now; // Story 5.18 (Q2)
    this.sendGhost(host); // Story 5.24: what I hold now, to my teammates (paced)
    this.updateRepair(host, menuOpen, shopOpen); // Story 3.7: tap a building → Repair
    this.updateBuildBar(host, menuOpen, shopOpen); // Story 5.16: tap a tile → the building is in my hands
    this.updateReady(host, menuOpen || shopOpen);
    if (host instanceof NetSimHost && host.hostSlot >= 0 && this.hostWatch.observe(host.hostSlot, host.mySlot)) this.toasts.push(HOST_TOAST_TEXT); // Story 8.3 (H1): no state yet = no patch yet
    this.updateConsumable(host, menuOpen, shopOpen); // Story 5.12: after placement (the hand cluster hides the button)
    if (this.localHost) {
      if (menuOpen !== this.localHost.paused) this.setPresentationPaused(menuOpen);
      this.localHost.paused = menuOpen;
    }
    if (this.stressFire) stressFireInput(host.world, host.localPlayerId, this.input_);
    if (this.stressMolotovs > 0 && this.localHost) {
      // Story 5.12 (`?stressbuild=molotov`): 8 molotov zones kept burning round my survivor (the visual cap).
      const me = host.world.players.get(host.localPlayerId);
      if (me) keepStressMolotovs(host.world, host.localPlayerId, me.x, me.y, this.stressMolotovs);
    }
    host.setLocalInput(this.input_);
    // Story 6.9 (G7): standing on the crate shows what you lose ("Replaces your SMG III") the whole second.
    const crate = cratePrompt(host.world, host.localPlayerId);
    // Story 7.12 (BF2): a loot find shows in the toast line for `loot.cue.toastS` (the queue waits meanwhile).
    const loot = crate === "" && this.lootLine.text !== "" && this.time.now < this.lootLine.untilMs;
    this.hudModel.toastText = crate !== "" ? crate : loot ? this.lootLine.text : this.toasts.current(this.time.now);
    this.hudModel.toastLoot = loot;
    this.hudModel.toastSlot = loot ? this.lootLine.slot : -1;
  }

  /** The host's step (online: applies the latest state). */
  private hostStep(): void {
    const host = this.frameCtx.host;
    if (!host) return;
    if (this.running) host.update(this.frameCtx.deltaMs / 1000); // LocalSimHost caps catch-up after long frames
    if (perf.net) netSummary.frame(performance.now(), perf.net); // Story 2.10: ping samples for the wave summary
  }

  /**
   * Story 5.23 (AC 2, 4, 6): a building placed (mine or a teammate's; the server's / the sim's event,
   * never the press): its owner tab (3 s), and when fresh — not a woken tab's backlog — its dust, drop,
   * the sound by kind (a teammate's beyond 12 m quieter, panned to its side) and, for mine, 12 ms.
   */
  private placedFeel(host: SceneHost, e: Extract<SimEvent, { type: "building.placed" }>): void {
    const world = host.world;
    const fresh = freshPlace(e.ageS, typeof document !== "undefined" && document.hidden === true);
    if (!this.placeFxView?.placed(world, e.buildingId, e.buildingType, e.ownerId, e.gx, e.gy, e.rot, this.time.now, (e.ageS ?? 0) * 1000, fresh)) return;
    if (!fresh) return;
    const mine = e.ownerId === host.localPlayerId;
    const stats = buildingStats(world.balance, e.buildingType);
    const kind = placeSoundKind(e.buildingType, stats);
    const me = this.playerViews.get(host.localPlayerId);
    const fb = stats ? footprint(stats, e.gx, e.gy, (e.rot & 3) as BuildingRotation, this.feelBox) : null;
    const bx = fb ? (fb.minX + fb.maxX) / 2 : 0;
    const by = fb ? (fb.minY + fb.maxY) / 2 : 0;
    const v = this.cameras.main.worldView;
    const pan = mine ? 0 : Math.max(-1, Math.min(1, (bx - (v.x + v.width / 2)) / Math.max(1e-6, v.width / 2)));
    // review L2: offered, played once per kind after the event loop (mine wins); no survivor drawn → a teammate's is quiet
    this.placedSounds.offer(kind, mine, pan, placeVolume(mine, me ? bx - me.x : 0, me ? by - me.y : 0, me !== undefined));
    if (mine) vibrate(PLACED_HAPTIC_MS);
  }

  /** Story 5.23 (AC 10–12): the building keys, once per frame before the placement step (`routeBuildKeys`). */
  private buildKeys(host: SceneHost, router: InputRouter, blocked: boolean): void {
    const k = routeBuildKeys(router.kbm, this.hudModel, this.placement.active, blocked, this.buildKeysOut);
    if (k.slot >= 0) this.keyPick(host, k.slot, blocked);
    if (k.panel) togglePanelKey(this.hudModel); // Story 10.10 (AC 9): B opens / closes the Build panel
    if (k.pickUp && this.canPlace(host, blocked)) this.onPickUpKey(); // review L5: only while building is possible (5.21: also needs a selection)
  }

  /** Story 5.23 (AC 12, D16): M picks up the building selected in the action bar (Story 5.21's `pickUpSelected`: the ✥ Move path). */
  private onPickUpKey(): void {
    this.pickUpSelected();
  }

  /**
   * Story 5.23 (AC 10, D14): a build-bar key `1`–`7` (tile `slot`). Placing must be possible and no
   * building selected. Holding that type: put it away; holding another: put it away and pick this
   * one. The pick follows the bar's rules (cap, then money → the same toast); no quiet window.
   */
  private keyPick(host: SceneHost, slot: number, menuOpen: boolean): void {
    if (!this.canPlace(host, menuOpen) || this.repairPanel.open) return;
    const items = buildBarItems(host.world.balance, localUnlocks(host)); // Story 7.4 (K5)
    const item = slot >= 0 && slot < items.length ? items[slot] : undefined;
    if (!item) return;
    const p = this.placement;
    if (p.active) {
      const same = p.type === item.id;
      p.cancel();
      this.hudModel.placementActive = false;
      this.hudModel.confirmPressed = this.hudModel.rotatePressed = false; // review L8: a Space / R of the same frame was for the old item
      this.handEmptiedMs = this.time.now;
      if (same) return;
    }
    const world = host.world;
    const err = pickError(ownedCount(world, host.localPlayerId) + this.pending.count, world.balance.buildings.maxPerPlayer, this.shownWallet(host), item.price);
    if (err !== null) {
      this.toasts.pushUnique(pickRefusalText(err, item.price, this.shownWallet(host), world.balance.buildings.maxPerPlayer));
      return;
    }
    this.startPlacement(item.id);
    if (this.placement.active) holdBuildingInput(this.input_);
  }

  /** Story 5.18 (Q2): the hand emptied less than `controls.build.barQuietMs` ago (taps meant for Place don't pick a tile). */
  private barQuiet(host: SceneHost): boolean {
    return this.time.now - this.handEmptiedMs < host.world.balance.controls.build.barQuietMs;
  }

  /**
   * Story 3.7: the repair panel, once per frame after placement. Taps select a building only when
   * placement is possible (a build phase, a run on screen, my survivor standing) and no placement,
   * shop or menu is open; the panel closes as soon as that no longer holds or the building is gone.
   * Repair sends the request (solo: applied at once) and closes the panel; the server judges it.
   */
  private updateRepair(host: SceneHost, menuOpen: boolean, shopOpen: boolean): void {
    const m = this.hudModel;
    const p = this.repairPanel;
    const allowed = this.canPlace(host, menuOpen || shopOpen) && !this.placement.active;
    m.tapsEnabled = allowed;
    const tap = m.worldTap;
    const press = m.repairPressed;
    const close = m.repairClosePressed;
    const upgrade = m.upgradePressed; // Story 5.9
    const sell = m.sellPressed; // Story 5.20
    const move = m.movePressed; // Story 5.22
    const long = m.longPressFired; // Story 5.21 (AC 11)
    m.worldTap = m.repairPressed = m.repairClosePressed = m.upgradePressed = m.sellPressed = m.movePressed = m.longPressFired = false;
    m.longPressMs = host.world.balance.controls.build.longPressMs;
    if (allowed && tap) {
      const w = this.cameras.main.getWorldPoint(m.worldTapX, m.worldTapY, this.cursorWorld);
      p.tap(host.world, w.x, w.y);
    }
    // Story 5.21 (AC 11): the ring fills round a press held on MY building; at 450 ms it picks it up.
    m.pressRing = -1;
    if (allowed && m.pressHeldMs >= 0) {
      const ringMs = host.world.balance.controls.build.longPressRingMs;
      if (m.pressHeldMs >= ringMs && this.myBuildingAtCanvas(host, m.pressX, m.pressY) !== 0) m.pressRing = longPressRing(m.pressHeldMs, ringMs, m.longPressMs);
    }
    if (allowed && long) {
      const id = this.myBuildingAtCanvas(host, m.longPressX, m.longPressY);
      if (id !== 0 && this.pickUp(host, id)) {
        m.repairOpen = false;
        return;
      }
    }
    if (move && allowed && p.open) {
      // Story 5.22 (AC 11): ✥ Move puts it in my hands (pinned where it stands).
      const id = p.pressMove();
      if (id !== 0 && this.pickUp(host, id)) {
        m.repairOpen = false;
        return;
      }
    }
    if (close) p.close();
    if (press && allowed && p.open) host.repairBuilding(p.press());
    if (upgrade && allowed && p.open && p.upgradeErrorNow === null) {
      // Story 5.9: the panel stays open, "Upgrading…" until the World (online: the state) shows the new tier.
      const id = p.pressUpgrade(host.world);
      if (id !== 0) host.upgradeBuilding(id);
    }
    if (sell && allowed && p.open) {
      // Story 5.20: Take back / Sell; the building goes and the refund lands when the World says so.
      const id = p.pressSell();
      if (id !== 0) host.sellBuilding(id);
    }
    m.repairOpen = p.update(host.world, host.localPlayerId, allowed, this.ownerName, this.spentOn, this.movingNow);
    if (m.repairOpen) {
      m.moveShown = p.moveShown; // Story 5.22
      m.moveLabel = p.moveLabel;
      m.moveValid = p.moveErrorNow === null && !p.movePending;
      m.repairFull = p.error === "full_hp"; // Story 5.21: "Repair · full HP", dimmed
      m.barReason = p.barReason;
      m.repairInfo = p.info;
      m.repairReason = p.reason;
      m.repairLabel = p.label;
      m.upgradeShown = p.upgradeShown;
      m.upgradeLabel = p.upgradeLabel;
      m.upgradeReason = p.upgradeReason;
      m.sellShown = p.sellShown;
      m.sellLabel = p.sellLabelText;
      m.sellReason = p.sellReason;
    }
  }

  /** Story 5.21: my building's id under canvas (x, y) within the tap tolerance (0 = none, or not mine). */
  private myBuildingAtCanvas(host: SceneHost, x: number, y: number): number {
    const w = this.cameras.main.getWorldPoint(x, y, this.cursorWorld);
    const b = buildingAtPoint(host.world, w.x, w.y, BUILDING_TAP_TOLERANCE_M);
    return b && b.ownerId === host.localPlayerId ? b.id : 0;
  }

  /**
   * Story 5.22 (AC 11, D11): picks my building `id` up — the hand holds it pinned where it stands
   * (✥ Move, a long-press, 5.23's `M`). Only in a build phase with empty hands, standing, no menu /
   * shop, my own building, no move of it waiting. Nothing is sent until Place.
   */
  private pickUp(host: SceneHost, id: number): boolean {
    const screen = uiStore.get();
    const menuOpen = screen.kind === "playing" && screen.menu !== "closed";
    if (!this.canPlace(host, menuOpen || shopStore.get().open) || this.placement.active || this.pendingMoves.waiting(id)) return false;
    const b = buildingById(host.world, id);
    const me = host.world.players.get(host.localPlayerId);
    const stats = b ? buildingStats(host.world.balance, b.type) : undefined;
    if (!b || !me || !stats || b.ownerId !== host.localPlayerId) return false;
    const pv = this.playerViews.get(host.localPlayerId);
    if (!this.placement.startMove(host.world.balance, b, pv?.x ?? me.x, pv?.y ?? me.y, me.facingX, me.facingY, host.world.waves.number)) return false;
    this.placingLabel = `Move ${stats.name} · free`;
    this.placingName = stats.name;
    this.repairPanel.close();
    this.router?.releaseAim();
    host.clearEdges();
    return true;
  }

  /**
   * Story 5.21 / 5.22 (AC 14): picks up the building selected in the action bar — the entry point for
   * Story 5.23's `M` key (the same path as ✥ Move). False when nothing is selected, it isn't mine, a
   * move of it is waiting, or picking up isn't possible now.
   */
  pickUpSelected(): boolean {
    const host = this.host;
    const p = this.repairPanel;
    if (!host || !p.open) return false;
    const b = buildingById(host.world, p.id);
    if (!b || b.ownerId !== host.localPlayerId) return false;
    return this.pickUp(host, b.id);
  }

  /** Story 5.22 (AC 13): a move Place → a pending box at the new spot and `building.move` (one waiting per building). */
  private queueMove(req: MoveRequest): void {
    const host = this.host;
    if (!host) return;
    const world = host.world;
    const b = buildingById(world, req.id);
    const stats = b ? buildingStats(world.balance, b.type) : undefined;
    if (!stats) return;
    footprint(stats, req.gx, req.gy, req.rot, this.moveBox);
    const seq = this.pendingMoves.add(req.id, req.gx, req.gy, req.rot, this.moveBox, world.run.phase, world.waves.number);
    if (seq !== 0) host.moveBuilding(req, seq); // review L3: the refusal echoes seq
  }

  /**
   * Story 5.20 (AC 6, 7): the undo chip, once per frame after the pending boxes were matched and
   * the host stepped. It shows in a build phase while I'm standing, with the build bar or the hand
   * cluster up (hidden behind the menu, the shop and the repair panel); a press sells the last
   * Place's building, or arms the undo until its pending box becomes the building.
   */
  private updateUndo(host: SceneHost, menuOpen: boolean, shopOpen: boolean): void {
    const m = this.hudModel;
    dropUndoAfterPick(m, this.time.now - this.barPickMs, host.world.balance.controls.build.barQuietMs); // Story 10.10 (re-review 2, M)
    const press = m.undoPressed;
    m.undoPressed = false;
    const standing = this.canPlace(host, false);
    const shown = !menuOpen && !shopOpen && !this.repairPanel.open;
    const u = this.undo;
    const build = host.world.balance.controls.build;
    u.update(host.world, host.localPlayerId, this.pending, this.time.now, build.undoWindowMs, build.pendingTimeoutMs, standing, shown, this.sellNow);
    if (press) {
      const id = u.press(this.time.now);
      if (id !== 0) host.sellBuilding(id);
      u.update(host.world, host.localPlayerId, this.pending, this.time.now, build.undoWindowMs, build.pendingTimeoutMs, standing, shown, this.sellNow);
    }
    m.undoVisible = u.visible;
    m.undoProgress = u.progress;
    m.undoArmed = u.armed;
    m.undoHolding = this.placement.active;
  }

  /** Story 5.20 (AC 9): my sell's "+$N" floats up at the building, with a 12 ms haptic (the coins sound is FxView's). */
  private onSold(e: Extract<SimEvent, { type: "building.sold" }>, localId: string): void {
    if (e.ownerId !== localId) return;
    const m = this.hudModel;
    // The refund's `money.earned` (same tick, just before) would also pop "+N" by the survivor: the sold pop replaces it.
    m.moneyGain = Math.max(0, m.moneyGain - e.refund);
    if (m.soldPopCount < m.soldPopX.length) {
      m.soldPopX[m.soldPopCount] = e.x;
      m.soldPopY[m.soldPopCount] = e.y;
      m.soldPopAmount[m.soldPopCount] = e.refund;
      m.soldPopCount++;
    }
    vibrate(SOLD_HAPTIC_MS); // Story 5.23 (review M3): follows the haptics setting like every haptic
  }
  /** Story 5.12: the consumable button's inputs (reused every frame) and its pending use. */
  private readonly consumableIn: ConsumableButtonInput = { item: null, count: 0, kind: null, alive: false, running: false, placement: false, shopOpen: false, menuOpen: false, phase: "lobby", hp: 0, maxHp: 1 };
  private readonly consumablePending = createConsumablePending();

  private readonly repairTexts = new Map<RepairError, string>();
  private repairText(e: RepairError): string {
    let t = this.repairTexts.get(e);
    if (t === undefined) {
      t = repairRefusalText(e);
      this.repairTexts.set(e, t);
    }
    return t;
  }

  /**
   * Story 3.3: the shop. Story 5.16: it opens from the build bar's Shop tile (only while the bar is on
   * screen); the shop closes by itself as soon as that no longer holds (the wave started, Results,
   * the menu opened, leaving). While open it gets my wallet and weapons when they change, the
   * purchase answers, and the clock for the pending timeout. Returns whether it is open.
   */
  private updateShop(host: SceneHost, menuOpen: boolean): boolean {
    const m = this.hudModel;
    const sc = this.shopCheck;
    sc.phase = host.world.run.phase;
    sc.running = this.running;
    sc.gameOver = this.gameOver;
    sc.menuOpen = menuOpen;
    sc.stressMode = this.stressMode;
    sc.leaving = this.leaving;
    const can = shopAllowed(sc);
    if (shopStore.get().open && !can) this.shopInput(SHOP_CLOSE);
    const pressed = m.shopPressed;
    m.shopPressed = false;
    // Story 5.16: the Shop tile of the build bar, only if the bar was on screen when it was tapped.
    if (pressed && m.buildBar && can && !shopStore.get().open && !this.barQuiet(host)) {
      const balance = host.world.balance;
      this.router?.releaseAll(); // nothing stays held under the shop (as for the menu)
      host.clearEdges();
      // Story 5.13: the card catalog with each item's price for this build (`cardPrice`, the server's function: F9).
      const build = host.world.waves.number;
      const catalog = cardCatalog(balance);
      const cardPrices: Record<string, number> = {};
      for (const c of catalog) cardPrices[c.id] = cardPrice(balance, c.id, build) ?? c.basePrice;
      this.shopInput({ type: "open", catalog, cardPrices, cardStats: cardStatLines(balance), upgradePrices: upgradePriceTable(balance), maxLevel: balance.shop.upgrades.maxLevel, gear: allGear(balance), consumables: inPoolOnly(shopConsumables(balance), localUnlocks(host)) }); // Story 7.4 (K5)
    }
    // Answers: shown while open, dropped while closed (the World already has the result).
    for (let a = host.takeShopAnswer(); a !== null; a = host.takeShopAnswer()) this.shopInput({ type: "answer", answer: a });
    if (shopStore.get().open) {
      // Story 5.13: my offer (solo: world.shop; online: the latest shop.offered) and the build it must match.
      shopOffer.offer = host.shopOffer();
      shopOffer.build = host.world.waves.number;
      this.shopInput(shopOffer);
    }
    const s = shopStore.get();
    if (s.open) {
      const me = host.world.players.get(host.localPlayerId);
      if (me) {
        const w0 = me.loadout.slots[0].weapon;
        const w1 = me.loadout.slots[1]?.weapon ?? null;
        // Story 5.1: levels from the World (online: the state mirror), so the shop shows server truth.
        const l0 = me.loadout.slots[0].level;
        const l1 = me.loadout.slots[1]?.level ?? 0;
        // Story 5.11: the owned gear from the World (online: the state's `gear`), never the tap.
        const wallet = this.shownWallet(host); // Story 5.18: pending prices off
        if (wallet !== s.wallet || w0 !== s.slots[0] || w1 !== s.slots[1] || l0 !== s.levels[0] || l1 !== s.levels[1] || me.gear !== s.gearMask || me.consumable !== s.slotItem || me.consumableCount !== s.slotCount) {
          // Story 5.12: and my consumable slot (server truth online).
          this.shopInput({ type: "sync", wallet, slots: [w0, w1], levels: [l0, l1], gearMask: me.gear, slotItem: me.consumable, slotCount: me.consumableCount });
        }
      }
      if (s.pending !== null) {
        shopTime.nowMs = this.time.now;
        this.shopInput(shopTime);
      }
    }
    return shopStore.get().open;
  }

  /** Story 3.3: a weapon's display name for the shop's "Bought …" text (module-level style: no closure per call). */
  private readonly shopName = (id: string): string => (this.host ? weaponName(this.host.world.balance, id) : id);

  /** Story 3.3: one step of the shop's state machine, and its effect (a purchase or an upgrade). */
  private shopInput(input: ShopInput): void {
    const r = shopStep(shopStore.get(), input, this.shopName);
    shopStore.set(r.state);
    const e = r.effect;
    if (e === null) return;
    if (e.type === "card") this.host?.buyCard(e.card, e.item, e.slot); // Story 5.13
    else if (e.type === "reroll") this.host?.reroll();
    else if (e.type === "upgrade") this.host?.upgradeWeapon(e.weapon); // Story 5.1
    else this.host?.buyItem(e.item); // Story 5.12 consumables
  }

  /**
   * Story 5.16: the build bar (the right-thumb cluster with empty hands). Shown when placement is
   * possible (a build phase, a run on screen, menu and shop closed, my survivor standing), I hold
   * nothing and no building is selected. A tile tapped while it was on screen picks that building:
   * the cap, then money (as `placementError`), from this frame's World (server truth online) →
   * toast; otherwise the 5.15 hold starts this frame (carry, hand cluster) and this frame's input
   * already drops aim and fire. Nothing is sent or charged by a pick (only Place sends).
   */
  private updateBuildBar(host: SceneHost, menuOpen: boolean, shopOpen: boolean): void {
    const m = this.hudModel;
    const world = host.world;
    const f = this.barFrame;
    f.can = this.canPlace(host, menuOpen || shopOpen);
    f.holding = this.placement.active;
    f.selected = this.repairPanel.open;
    f.quiet = this.barQuiet(host); // Story 5.18 (Q2)
    f.owned = ownedCount(world, host.localPlayerId) + this.pending.count; // Story 5.18 (5.16 L2): pending counts
    f.cap = world.balance.buildings.maxPerPlayer;
    f.wallet = this.shownWallet(host);
    m.buildItems = buildBarItems(world.balance, localUnlocks(host)); // Story 5.10 review M2 (?shopall); Story 7.4 (K5): my unlocks only
    const r = stepBuildBar(m, f, this.barStep);
    if (r.toast !== "") {
      this.toasts.pushUnique(r.toast); // tapping a refused tile again doesn't queue the same line again
      this.barToast = r.toast;
    }
    if (r.pick !== "") {
      this.startPlacement(r.pick);
      if (this.placement.active) {
        this.barPickMs = this.time.now; // re-review 2 (M): a double tap on the pick doesn't reach ↶ beneath it
        if (this.barToast !== "") this.toasts.withdraw(this.barToast); // an old refusal off the screen
        this.barToast = "";
        holdBuildingInput(this.input_); // the hold starts now: no aim or fire in this frame's input either
        r.show = false;
      }
    }
    m.buildBar = r.show && !m.watching; // Story 8.2: nothing to build while waiting
    m.buildQuick = quickType(m.buildItems, this.lastPlacedType); // Story 10.10 (BU-5)
    if (m.buildPanelPressed) {
      m.buildPanelPressed = false; // Build / Close (its quiet-window press was dropped by `dropQuietPresses`)
      togglePanelKey(m);
    }
    m.buildPanelOpen = panelStaysOpen(m.buildPanelOpen, m.buildBar, r.pick !== "", m.ping.open, m.buildItems.length); // Story 10.10 (AC 6)
  }

  /** Countdowns of downed players for the HUD, and the local status line (Story 2.8). */
  private updateDownedHud(world: Readonly<World>, me: PlayerState): void {
    const m = this.hudModel;
    m.downedCount = 0;
    this.revivingSomeone = false;
    if (world.teamWiped) {
      m.statusText = ""; // Results are up: no countdowns (solo goes straight there when downed)
      return;
    }
    world.players.forEach(this.collectDowned);
    if (me.status === "downed") {
      const secs = Math.ceil(me.downedTicksLeft / TICK_RATE_HZ);
      if (secs !== this.statusSecs) {
        this.statusSecs = secs;
        m.statusText = `Downed: a teammate can revive you (${secs} s)`;
      }
      return;
    }
    this.statusSecs = -1;
    // Story 8.2 (J4): a waiting late joiner reads as "out" in the mirror; its own line says why.
    const waitingLine = this.host instanceof NetSimHost ? this.host.waitingLine : "";
    m.statusText = waitingLine !== "" ? waitingLine : me.status === "out" ? STATUS_OUT : this.revivingSomeone ? STATUS_REVIVING : "";
  }

  /** Story 2.9: teammates for the HUD (none once the team is wiped: Results are up). */
  private updateTeammates(world: Readonly<World>): void {
    this.hudModel.teammateCount = 0;
    if (!world.teamWiped) world.players.forEach(this.collectTeammate);
  }

  /** Adds, updates and removes player views to match `world.players` (no allocation per frame). */
  private syncPlayerViews(world: Readonly<World>, dtS: number): void {
    this.playerViews.forEach(this.dropPlayerView); // deleting inside forEach is safe for a Map
    this.lookTextures?.beginFrame(); // Story 7.9: one body repaint per frame (a build start's stage dim, D1)
    this.burnView?.begin(dtS, this.time.now / 1000);
    this.flameView?.begin(dtS, this.time.now / 1000, world);
    world.players.forEach(this.syncPlayerView);
    const me = this.host ? world.players.get(this.host.localPlayerId) : undefined;
    if (this.devLooks && me) this.devLooks.update(me, this.host?.alpha ?? 0, this.time.now);
    this.burnView?.end();
    const cam = this.cameras.main;
    this.flameView?.zombies(world, this.host?.online ? 1 : (this.host?.alpha ?? 0), cam.midPoint.x, cam.midPoint.y);
    this.flameView?.end();
  }

  /** A camera shake of `fraction` of the view (see `shakeIntensityFor`: Phaser's own shake scales by zoom²). */
  /** Story 6.8 review M2: the safe area the event edge arrow keeps inside, on resize. */
  private readEventInsets(): void {
    this.eventInsets = { ...safeArea() };
  }

  /** Story 6.5: a boss event's banner, sound, shake, buzz and music (none for a woken tab's backlog). */
  private bossEvent(host: SceneHost, e: SimEvent, localId: string): void {
    const me = host.world.players.get(localId);
    let killer = "";
    if (e.type === "boss.killed") {
      if (e.number <= this.bossEvacShown) return; // once per Behemoth
      this.bossEvacShown = e.number;
      killer = e.killerId !== null ? host.playerInfo(e.killerId).name || "" : "";
      if (e.killerId === localId && !host.online) this.kills++; // D5: who finished it gets +1 kill (online: the server counts it)
    }
    const cue = bossCue(e, localId, me?.x ?? 0, me?.y ?? 0, this.bossCueOut, killer, host.world.balance.boss.killPay);
    if (cue.banner) {
      if (cue.bannerColor || cue.bannerMs) this.showBanner(cue.banner, cue.bannerColor, cue.bannerMs);
      else this.stackBanner(cue.banner);
    }
    if (cue.sound) playSfx(cue.sound);
    if (cue.shake && getSettings().screenShake) this.shake(MINE_SHAKE_MS, 1);
    if (cue.buzz) vibrate(BOSS_TARGET_BUZZ); // D10: off with vibration off (the haptics setting)
    if (e.type === "boss.slammed") this.bossView?.onSlammed(e.x, e.y, (e.attackId * 2.39996) % (Math.PI * 2));
    else if (e.type === "boss.thrown_impact") this.bossView?.onThrownImpact(e.x, e.y, (e.attackId * 2.39996) % (Math.PI * 2));
    else if (e.type === "boss.crashed") this.bossView?.onCrashed(e.x, e.y);
    else if (e.type === "boss.enraged") this.bossView?.onEnraged(e.x, e.y);
    else if (e.type === "boss.crawler_dropped") this.bossView?.onCrawlerDropped(e.x, e.y);
  }

  /**
   * Story 6.5: the boss each frame — its view (at the host's draw position, telegraphs from the
   * estimated server tick), the HUD's bar and marker, and the music (follows the state: playing while
   * it walks, stopped when it dies, a build starts or the run ends).
   */
  private updateBoss(host: SceneHost, dtS: number): void {
    const b = host.world.boss;
    host.bossDrawPos(this.bossAt);
    this.bossView?.setDark(darknessAlpha(host.world as World) > 0); // Story 6.3: the outline + eyes above the darkness
    const target = b.targetId !== null ? this.playerViews.get(b.targetId) : undefined;
    this.bossView?.update(this.localHost?.paused === true ? 0 : dtS, host.serverTick, this.bossAt.x, this.bossAt.y, target, this.zombieView?.drawn);
    const m = this.hudModel;
    const walking = b.state >= BOSS_STATE.WALK && b.state <= BOSS_STATE.ROAR;
    // Story 6.7: after its death the bar shows empty and fades out over 2 s.
    this.bossDeadS = b.state === BOSS_STATE.DEAD ? this.bossDeadS + dtS : 0;
    m.bossVisible = walking || (b.state === BOSS_STATE.DEAD && this.bossDeadS < BOSS_BAR_FADE_S);
    m.bossBarAlpha = walking ? 1 : Math.max(0, 1 - this.bossDeadS / BOSS_BAR_FADE_S);
    m.bossHpFrac = walking && b.maxHp > 0 ? b.hp / b.maxHp : 0;
    m.bossEnraged = b.enraged;
    m.bossStunned = b.state === BOSS_STATE.STUN; // Story 6.6 (D6): the bar flashes amber
    if (b.state === BOSS_STATE.RUSH && this.bossLastState !== BOSS_STATE.RUSH && !document.hidden) playSfx("boss_charge_rush");
    this.bossLastState = b.state;
    m.bossState = b.state;
    m.bossAtkKind = b.attack.kind;
    m.bossX = walking ? this.bossAt.x : b.x;
    m.bossY = walking ? this.bossAt.y : b.y;
    const music = walking && host.world.run.phase === "wave" && document.hidden !== true;
    if (music && !this.bossMusic) this.bossMusic = startBossLoop();
    else if (!music && this.bossMusic) {
      stopBossLoop();
      this.bossMusic = false;
    }
  }

  private shake(ms: number, fraction: number): void {
    const cam = this.cameras.main;
    cam.shake(ms, shakeIntensityFor(fraction, cam.zoom));
  }

  /** Story 5.8: a burst's wet pop (on screen, fresh only) and a short shake when my survivor is near it (the mine's rule). */
  private bloaterBurst(host: SimHost, e: Extract<SimEvent, { type: "bloater.burst" }>): void {
    if ((e.ageS ?? 0) > ACID_SOUND_MAX_AGE_S) return; // a woken tab's backlog: silent
    const v = this.cameras.main.worldView;
    if (e.x >= v.x && e.y >= v.y && e.x <= v.x + v.width && e.y <= v.y + v.height) {
      playSfx("zombie_bloater_burst", Math.max(-1, Math.min(1, (e.x - (v.x + v.width / 2)) / Math.max(1e-6, v.width / 2))));
    }
    const me = host.world.players.get(host.localPlayerId);
    const k = me ? mineShakeIntensity(Math.hypot(me.x - e.x, me.y - e.y)) : 0;
    if (k > 0 && getSettings().screenShake) this.shake(MINE_SHAKE_MS, k);
  }

  /** Story 5.6: the spit's "ptoo" and the splash's hiss, only when on screen (panned by screen position). */
  /** Story 5.5: the launcher in my survivor's hands (alive, not swapping), else null. */
  private localLauncher(host: SimHost): LauncherStats | null {
    const p = host.world.players.get(host.localPlayerId);
    if (!p || p.status !== "alive" || p.loadout.swapTicks > 0) return null;
    const stats = host.world.balance.weapons[activeSlot(p.loadout).weapon];
    return stats?.kind === "launcher" ? stats : null;
  }

  /** Story 5.12 (D11): the throwable in my slot (alive), whose range the aim length carries when no launcher is in hand; else null. */
  private localThrow(host: SimHost): ThrowStats | null {
    const p = host.world.players.get(host.localPlayerId);
    if (!p || p.status !== "alive" || p.consumableCount <= 0) return null;
    return throwStatsOf(host.world.balance, p.consumable);
  }

  /**
   * Story 5.12 (AC 1, 7): the button's state for this frame and the edge-flag gate: a tap or E is
   * sent only when the item is usable and no earlier use is pending (no optimistic use).
   */
  private updateConsumable(host: SimHost, menuOpen: boolean, shopOpen: boolean): void {
    const m = this.hudModel;
    const p = host.world.players.get(host.localPlayerId);
    const b = this.consumableIn;
    b.item = p?.consumable ?? null;
    b.count = p?.consumableCount ?? 0;
    b.kind = consumableStats(host.world.balance, b.item)?.kind ?? null;
    b.alive = p?.status === "alive";
    b.running = this.running && !this.gameOver;
    b.placement = m.placementActive || this.repairPanel.open; // Story 5.21 (D3): not under the action bar either
    b.shopOpen = shopOpen;
    b.menuOpen = menuOpen;
    b.phase = host.world.run.phase;
    b.hp = p?.hp ?? 0;
    b.maxHp = p?.maxHp ?? 1;
    const now = this.time.now;
    updateConsumablePending(this.consumablePending, now, b.item, b.count);
    if (this.input_.consumable && !tapConsumable(this.consumablePending, now, b)) this.input_.consumable = false;
    m.consumableItem = b.item;
    m.consumableCount = b.count;
    m.consumableVisible = consumableVisible(b);
    m.consumableUsable = consumableUsable(b);
    m.consumablePending = this.consumablePending.active;
  }

  /** Story 5.5 (AC 7a): the landing ring while the launcher is aimed (the sim's `lobTarget` on the drawn World). */
  private updateLobMarker(host: SimHost): void {
    const view = this.grenadeView;
    if (!view) return;
    const pv = this.playerViews.get(host.localPlayerId);
    const lob = this.running && !this.gameOver ? this.localLauncher(host) : null;
    const ax = this.input_.aimX;
    const ay = this.input_.aimY;
    const len = Math.hypot(ax, ay);
    if (!lob || !pv || len < 1e-6) view.drawMarker(host.world, null, 0, 0, 0, 1, 0, 0);
    else view.drawMarker(host.world, lob, pv.x, pv.y, this.playerRadiusM, ax / len, ay / len, len);
    // Story 5.12 (D11): the throw's ring (the exact blast / fire radius) while a throwable is in my slot in a wave.
    const thr = this.running && !this.gameOver && host.world.run.phase === "wave" && !this.hudModel.placementActive ? this.localThrow(host) : null;
    if (!thr || !pv || len < 1e-6) view.drawThrowMarker(host.world, null, 0, 0, 0, 1, 0, 0);
    else view.drawThrowMarker(host.world, thr, pv.x, pv.y, this.playerRadiusM, ax / len, ay / len, throwAimLength(thr, len, lob ? lob.lobRangeM : 0));
  }

  private acidSound(e: SimEvent): void {
    if (e.type !== "spitter.spat" && e.type !== "acid.splashed") return;
    if ((e.ageS ?? 0) > ACID_SOUND_MAX_AGE_S) return; // review M1: no sound burst from a woken tab's backlog
    const v = this.cameras.main.worldView;
    if (e.x < v.x || e.y < v.y || e.x > v.x + v.width || e.y > v.y + v.height) return;
    const pan = Math.max(-1, Math.min(1, (e.x - (v.x + v.width / 2)) / Math.max(1e-6, v.width / 2)));
    playSfx(e.type === "spitter.spat" ? "zombie_spitter_spit" : "fx_acid_hiss", pan);
  }

  private applyZoom(): void {
    this.cameras.main.setZoom(pixelsPerMeter(this.scale.width, this.scale.height));
  }

  /** Story 8.7 (AC 6–8): the pings this frame — new ones start (with their chirp, panned by screen x), old ones expire, then the view. */
  private readonly pingArrowRect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly pingFlagRect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly pingLootRect = { x: 0, y: 0, w: 0, h: 0 };
  /** The other arrows the ping arrows keep off: the event arrow, the 6.10 flag arrow, the loot badge (null = none). */
  private readonly pingOthers: (ScreenRect | null)[] = [null, null, null];
  /** Story 10.2 B4 (D6): per slot, the teammate edge arrow HudScene draws (null = none), a keep-off for the ping arrows. */
  private readonly pingMates: (ScreenRect | null)[] = Array.from({ length: 2 * MAX_PLAYERS }, () => null);
  private readonly pingMateRects: ScreenRect[] = Array.from({ length: 2 * MAX_PLAYERS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  private readonly pingMarkers = createTeammateMarkers();
  private updatePings(pings: NonNullable<SceneHost["pings"]>, vx: number, vy: number, vw: number): void {
    const now = performance.now(); // the model's clock (decision 8.7 B4)
    const host = this.host;
    const sw = this.cameras.main.width;
    const sh = this.cameras.main.height;
    const k = dpr();
    const started = pings.update(now, host?.serverTick ?? 0);
    for (let i = 0; started !== 0 && i < MAX_PLAYERS; i++) {
      if ((started & (1 << i)) === 0) continue;
      const p = pings.live(i);
      if (!p || now - p.startMs > PING_SHOW_MS - PING_FADE_MS) continue; // review nit: no chirp for a ping already fading out
      const sx = vw > 0 ? ((p.x - vx) / vw) * sw : sw / 2;
      playSfx(p.kind === 0 ? "ping_double" : "ping", pingPan(sx, sw), PING_SFX_VOLUME); // "Help!" twice (E8-P3)
    }
    const ev = this.eventView;
    const size = EVENT_ARROW_CSS_PX * k;
    // B16 (designer 2026-11-25): ping arrows sit under the HUD (it is semi-transparent): no HUD control is a keep-off.
    // They keep off the other arrows only (the badge is placed before the pings, so the two never overlap); the HUD
    // rects only decide whether a ping's icon is seen (review M1).
    const arrow = ev?.edgeArrowAt() ?? null;
    const flag = ev?.flagArrowAt() ?? null;
    const badge = this.lootView?.badgeArrowAt() ?? null;
    const others = this.pingOthers;
    others[0] = arrow ? eventArrowDrawnRect(arrow, size, this.pingArrowRect) : null;
    others[1] = flag ? eventArrowDrawnRect(flag, size, this.pingFlagRect) : null;
    others[2] = badge ? eventArrowDrawnRect(badge, size, this.pingLootRect) : null;
    // 10.2 B4 (D6): the teammate arrows (+ the downed "+" and red label, review L3) HudScene draws this frame: its own
    // `teammateMarkers` call on this frame's HUD model, same margin.
    const mates = this.pingMates;
    mates.fill(null);
    const m0 = this.hudModel;
    const n = teammateMarkers(m0, sw, sh, MATE_ARROW_MARGIN_CSS_PX * k, this.pingMarkers);
    for (let i = 0; i < n; i++) {
      const mk = this.pingMarkers[i] as TeammateMarker;
      if (!mk.visible) continue;
      mates[2 * mk.slot] = teammateArrowRect(mk, k, this.pingMateRects[2 * mk.slot] as ScreenRect);
      // the label's size as HudScene measured it (last frame: exact while the countdown it drew is the same), else a generous guess
      const measured = m0.mateLabelSecs[mk.slot] === mk.secs;
      const tw = measured ? (m0.mateLabelW[mk.slot] as number) : Math.max(m0.mateLabelW[mk.slot] as number, teammateLabelWidthGuess((m0.teammateNames[mk.slot] ?? "").length, k));
      const th = Math.max(m0.mateLabelH[mk.slot] as number, MATE_NAME_TEXT_CSS_PX * 1.4 * k);
      const lr = this.pingMateRects[2 * mk.slot + 1] as ScreenRect;
      if (teammateLabelRect(mk, k, tw, th, sw, sh, lr)) mates[2 * mk.slot + 1] = lr;
    }
    this.pingView?.update(pings, now, vx, vy, vw, sw, sh, k, this.eventInsets, ev?.controlRects() ?? [], others, mates);
    const m = this.hudModel;
    m.pingArrowSlots = this.pingView?.arrowMask() ?? 0; // review M2: HudScene hides those senders' teammate arrows
  }

  override update(_time: number, deltaMs: number): void {
    const host = this.host;
    const router = this.router;
    if (!host || !router) return;
    // Story 10.2-Q3 B: the one-time quality check (the first 10 s of the run's first wave; never under ?stress).
    const aq = autoQuality.frame(performance.now(), { firstWave: !this.stressMode && !this.gameOver && host.world.run.phase === "wave" && host.world.waves.number === 1, hidden: document.hidden, capped: frameCap.on }); // 10.3 review H: not under Battery saver
    if (aq !== "") this.toasts.push(aq);

    // Mouse aim: survivor (last drawn position) → cursor, through the camera that drew that frame.
    const localId = host.localPlayerId;
    const pv = this.playerViews.get(localId);
    const cw = this.cursorWorld.set(Number.NaN, Number.NaN);
    if (router.isMouse && pv && !Number.isNaN(router.cursorX)) this.cameras.main.getWorldPoint(router.cursorX, router.cursorY, cw);
    // Story 5.5: with the launcher in hand the aim's length carries the lob distance (FR-A, D1).
    // Story 5.12 (D11): with no launcher in hand, a throwable in my slot sets the aim length (its throw range).
    dropQuietPresses(this.hudModel, this.barQuiet(host)); // Story 10.10 (review 1, 2): a stray Place / ✕ tap lands on ↶, swap, quick-use or Build
    router.build(this.input_, this.hudModel.swapPressed, pv?.x ?? 0, pv?.y ?? 0, cw.x, cw.y, this.localLauncher(host) ?? this.localThrow(host), this.playerRadiusM, this.hudModel.consumablePressed, this.localThrow(host));
    this.hudModel.swapPressed = false;
    this.hudModel.consumablePressed = false;
    if (!this.running) this.input_.swap = false; // nothing swaps before the run is on screen

    // Story 2.11: ☰ and Esc toggle the in-run menu (Esc is never game input).
    let menuKey = router.kbm.takeMenu();
    // Story 8.7 (AC 3): Esc closes an open ping wheel before it opens the menu.
    if (menuKey && this.hudModel.ping.open) {
      this.hudModel.ping.open = false;
      menuKey = false;
    }
    // Story 10.10 (AC 9): Esc closes the open Build panel before it opens the menu.
    if (menuKey && this.hudModel.buildPanelOpen) {
      this.hudModel.buildPanelOpen = false;
      menuKey = false;
    }
    const menuTap = this.hudModel.menuPressed;
    this.hudModel.menuPressed = false;
    // Story 5.23 (AC 10, D14): Esc while holding a building puts it away first (the next Esc opens the menu).
    if (menuKey && this.placement.active && !shopStore.get().open) {
      this.hudModel.cancelPressed = true;
      menuKey = false;
    }
    if (menuKey || menuTap) {
      // Story 3.3: Esc / ☰ close the shop first.
      if (shopStore.get().open) this.shopInput(SHOP_CLOSE);
      else this.onMenu("toggle");
      if (!this.host) return; // left
    }
    const screen = uiStore.get();
    const menuOpen = screen.kind === "playing" && screen.menu !== "closed";
    this.hudModel.menuOpen = menuOpen;
    // Not under ?stress: pausing would skew the benchmark's wall-clock duration (2.11 review).
    this.hudModel.menuButton = screen.kind === "playing" && this.running && !this.gameOver && !this.stressMode;
    // Menu open: online the run goes on and my survivor stands still (a fresh seq every step);
    // solo practice pauses (designer decision 2026-11-21), with the accumulator frozen.
    const shopOpen = this.updateShop(host, menuOpen);
    // Story 3.3: I stand still while shopping. Story 6.11 (D-B): and during the vote (the server freezes
    // everything; neutral moves keep the Predictor standing still too).
    if (standsStill(menuOpen, shopOpen, host.world.run.phase)) neutralizeInput(this.input_);
    // Story 8.7: the ping button, F, 1–4 while the wheel is open (before the build keys take the digit), and the send.
    pingFrame(this.hudModel, router.kbm, host, linkStore.get().status === "ok", this.running && !this.gameOver && !this.stressMode && screen.kind === "playing", menuOpen || shopOpen, this.placement.active || this.repairPanel.open, this.time.now);
    this.buildKeys(host, router, menuOpen || shopOpen); // Story 5.23: R, Space, 1–7, Z, M (latches taken every frame)
    // Story 5.18 (review M2): the pending placements' frame order lives in `runPendingFrame` (shared with
    // the netsim test): match → placement step … input (`beforeHostStep`) → send → host step → match +
    // timeouts → refusals (Story 3.4: the server, or solo, said no) to the oldest unanswered box.
    const fc = this.frameCtx;
    fc.host = host;
    fc.menuOpen = menuOpen;
    fc.shopOpen = shopOpen;
    fc.deltaMs = deltaMs;
    runPendingFrame(this.pending, host, this.time.now, this.pendingScene, this.sendNow, this.refusalsDropped);
    pendingPlacements.set(this.pending.count); // Story 8.5: Save and quit waits for my placements to settle
    const repairRefused = host.takeRepairRefusal(); // Story 3.7
    if (repairRefused) this.toasts.push(this.repairText(repairRefused));
    const upgradeRefused = host.takeUpgradeRefusal(); // Story 5.9
    if (upgradeRefused) {
      this.repairPanel.upgradeRefused();
      this.toasts.push(upgradeRefusalText(upgradeRefused));
    }
    const sellRefused = host.takeSellRefusal(); // Story 5.20
    if (sellRefused) this.toasts.push(sellRefusalText(sellRefused));
    // Story 5.22 (AC 13): my moves — done when the World shows them; a refusal (by id) or no answer shakes the box.
    if (this.pendingMoves.update(host.world, this.time.now, host.world.balance.controls.build.pendingTimeoutMs) > 0) this.toasts.push(NO_ANSWER_TEXT);
    for (let r = host.takeMoveRefusal(); r !== null; r = host.takeMoveRefusal()) {
      if (this.pendingMoves.refuse(r.id, r.seq, this.time.now)) this.toasts.push(moveRefusalText(r.reason));
    }
    this.buildSpend.watchUsed(host.world, localId); // Story 5.20 review M1: a med station that healed sells at the normal share
    this.updateUndo(host, menuOpen, shopOpen); // Story 5.20: after the boxes were matched (an armed undo sends here)
    const events = host.drainEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      this.fxView?.handle(e);
      this.buildSpend.handle(e, localId, host.world.balance); // Story 5.20: the panel's Take back / Sell label
      if (e.type === "building.sold") this.onSold(e, localId);
      // Story 4.8 hurt cue; Story 4.11: my hits also queue a "-N" for the HUD.
      routeFireHit(e, localId, this.time.now, this.fireCue, this.hudModel, this.slotOfPlayer);
      // Story 5.4: the flame cones (burst edges) and the flamer's own friendly-fire cue.
      host.flames.handle(e);
      const victim = friendlyFireVictim(e, localId);
      if (victim) this.ffFlashMs.set(victim, this.time.now);
      // Story 5.6: acid has its own hurt cue (never "Burning"); spits and puddles are drawn from events.
      routeAcidHit(e, localId, this.time.now, this.acidCue, this.hudModel);
      if (this.acidFx?.handle(e, this.acidClockS)) this.acidSound(e);
      this.grenadeView?.handle(e, this.acidClockS); // Story 5.5: rounds in flight
      this.explosionView?.handle(e, this.acidClockS);
      this.molotovView?.handle(e, this.acidClockS); // Story 5.12: fire zones and their throws' direction
      if (this.blackoutNow) this.blackoutFlash(e); // Story 6.3 (AC 4, D4): muzzle and explosion flashes light the dark
      if (this.bloaterFx?.handle(e, this.acidClockS) && e.type === "bloater.burst") this.bloaterBurst(host, e);
      // Story 4.11: a build or wave start (a fire may have gone out) closes every burning cue; a real hit relights it.
      if (e.type === "build.started" || e.type === "wave.started") {
        this.fireCue.clear();
        this.acidCue.clear();
      }
      if (e.type === "run.vote_opened") this.heliView?.opened(this.time.now / 1000);
      else if (e.type === "run.vote_resolved" && e.choice === "stay") this.heliView?.left(this.time.now / 1000, false); // Story 12.2: an Extract waits for the lift-off
      if ((e.type === "team.wiped" || e.type === "run.extract_done") && !host.online && !this.gameOver) {
        this.showSoloResults(host, e.wave);
      } else if (e.type === "player.downed" && e.playerId !== localId && !host.world.teamWiped && host.world.players.get(e.playerId)?.status === "downed") {
        // A teammate went down (and still is: a woken tab's backlog stays quiet once revived): say who,
        // with an alert; the pulsing edge arrow shows where and how long they have.
        this.stackBanner(`${host.playerInfo(e.playerId).name || "A teammate"} is down!`);
        playSfx("player_teammate_downed");
      } else if (e.type === "zombie.killed" && e.killerId === localId && e.buildingId === undefined) {
        // Story 3.6: my turret's kills pay me (money.earned) but are not my kills.
        this.kills++;
      } else if (e.type === "building.placed") {
        if (e.ownerId === localId) this.lastPlacedType = e.buildingType; // Story 10.10 (AC 2, review 3): the quick tile repeats my last building that went down (server truth; a refused Place never counts)
        this.placedFeel(host, e);
      } else if (e.type === "money.earned" && e.playerId === localId) {
        this.hudModel.moneyGain += e.amount; // Story 3.2: one "+N" per frame
      } else if (e.type === "zombie.brute_spawned") {
        // Story 5.7 (AC 4): a roar for every Brute, the "Brute!" banner for the run's first.
        const cue = bruteSpawnCue(e, this.cameras.main.worldView, this.bruteCue);
        if (cue.roar) playSfx("zombie_brute_roar", cue.pan);
        if (cue.banner) this.stackBanner(BRUTE_BANNER);
      } else if (e.type === "explosion.happened" && (e.ageS ?? 0) <= STALE_EXPLOSION_S) {
        // Story 5.5 (Story 5.9's mine shake, for every blast): a short shake when my survivor is
        // within `fx.shakeWithinM` of it, a blast sound panned to its side (none for a woken tab's backlog).
        const me = host.world.players.get(localId);
        const k = me ? mineShakeIntensity(Math.hypot(me.x - e.x, me.y - e.y), host.world.balance.combat.explosion.fx.shakeWithinM) : 0;
        if (k > 0 && getSettings().screenShake) this.shake(MINE_SHAKE_MS, k);
        const v = this.cameras.main.worldView;
        const pan = Math.max(-1, Math.min(1, (e.x - (v.x + v.width / 2)) / Math.max(1e-6, v.width / 2)));
        playSfx(blastLookFor(e.kind) === "fireball" ? "fx_explosion" : "building_mine_blast", pan);
      } else if ((e.type === "weapon.fired" || e.type === "melee.swung") && e.playerId === localId) {
        // Story 5.2: my own swing of a screenShake melee weapon (the Fire Axe) shakes too. Online it is
        // the local swing (NetSimHost drops my server echo), so it shakes once and without a round trip.
        const stats = host.world.balance.weapons[e.weapon];
        if (stats?.screenShake && getSettings().screenShake) this.shake(SHAKE_MS, SHAKE_INTENSITY);
      } else if (e.type === "building.destroyed") {
        // Stories 12.1 (AC 6) / 12.4 (AC 5): my building lost to the decay: a toast, no amount (no refund).
        if (e.cause !== undefined && e.ownerId === localId) this.toasts.pushUnique(decayLossText(e.cause, e.buildingType));
      } else if (e.type === "build.started") {
        if (e.wave === 1) this.stackBanner(BUILD_BANNER); // later builds keep "Wave N cleared"
        this.bossView?.clearDecals(); // Story 6.5: no cracks carried into the next wave
      } else if (
        e.type === "boss.warning" ||
        e.type === "boss.arrived" ||
        e.type === "boss.slammed" ||
        e.type === "boss.target_changed" ||
        e.type === "boss.crashed" ||
        e.type === "boss.thrown_impact" ||
        e.type === "boss.enraged" ||
        e.type === "boss.crawler_dropped" ||
        e.type === "boss.killed"
      ) {
        this.bossEvent(host, e, localId); // Stories 6.5–6.7
      } else if (e.type === "event.triggered" || e.type === "event.phase_changed" || e.type === "event.ended") {
        // Story 6.8 (F1): the banner and the sound (none for a woken tab's backlog); the marker follows the state.
        const cue = eventCue(e, host.world.balance, this.eventCueOut);
        if (cue.banner) this.showBanner(cue.banner, cue.bannerColor); // the colour rule: amber = an event you can use, yellow-green = gas, white = pick-ups and people
        if (cue.sound) playSfx(cue.sound);
      } else if (e.type === "loot.found" || e.type === "loot.dropped") {
        // Story 7.12 (AC 7, BF2): "Bag found!" / "Ana found a bag!" in the toast line and the sounds (none for a woken tab's backlog).
        const cue = lootCue(e, localId, this.lootNameOf, this.slotOfPlayer, host.world.balance.loot.cue.toastS, this.lootCueOut);
        if (cue.text !== "") {
          this.lootLine.text = cue.text;
          this.lootLine.slot = cue.slot;
          this.lootLine.untilMs = this.time.now + host.world.balance.loot.cue.toastS * 1000;
        }
        if (cue.sound !== "") playSfx(cue.sound);
      } else if (e.type === "boss.telegraph") {
        this.bossView?.onTelegraph(e.attackId, e.kind, e.startTick, e.hitTick, e.cx, e.cy, e.radiusM, e.endX, e.endY, e.crash, e.src);
        this.bossEvent(host, e, localId); // Story 6.6: the scrape / lift sound
      } else if (e.type === "boss.hit") {
        this.bossView?.onHit();
      } else if (e.type === "wave.started") {
        this.showBanner(`Wave ${e.number}`);
        // Story 2.10: measured only with the overlay on (the 1.11 rule: no measuring cost otherwise).
        if (perf.net && perf.overlayOn) netSummary.start(performance.now(), e.number, perf.net, netMeter);
      } else if (e.type === "decay.stage_changed") {
        this.stackBanner(host.world.balance.decay.stageNames[e.stage - 1] ?? `Stage ${e.stage}`); // Story 4.5: "Panic"
        // Story 6.2 (D9): the collapse moment — a rumble and a dust burst, live only (a tab that slept
        // across the build start wakes with a long frame: it shows the stage without the one-off cue).
        if (e.stage === 4 && deltaMs < LIVE_FRAME_MAX_MS && !document.hidden) this.dustView?.burst(host.world, host.world.balance.decay.ruins.collapseBurstS);
      } else if (e.type === "wave.ended") {
        this.showBanner(`Wave ${e.number} cleared`);
        if (perf.net) netSummary.end(performance.now(), e.number, perf.net, netMeter, perf.overlayOn);
      }
    }

    this.placedSounds.flush(this.playPlaced); // Story 5.23 (review L2): one placed sound per kind, mine first

    // Story 5.2: Chainsaw sparks (one Graphics), and my rev loop starts/stops with my cuts (not per swing).
    this.fxView?.update(this.localHost?.paused === true ? 0 : deltaMs);
    if (this.fxView?.saw) this.fxView.saw.frameMs = deltaMs;
    this.fxView?.saw?.revUpdate(localId, this.time.now);
    // Story 5.4: my flame's roar loop, on the burst edges (stops in a hidden tab).
    const myFlame = host.flames.flaming(localId) !== "" && host.world.players.get(localId)?.status === "alive" && document.hidden !== true;
    if (myFlame && !this.flameLooping) this.flameLooping = startFlameLoop();
    else if (!myFlame && this.flameLooping) {
      stopFlameLoop();
      this.flameLooping = false;
    }
    this.updateScreenFog(host, localId);
    this.zombieView?.update(host.world, host.alpha);
    this.updateBoss(host, deltaMs / 1000); // Story 6.5
    const ev = this.cameras.main.worldView; // Story 6.8: the event markers (from the server's ticks)
    if (this.eventView) this.eventView.bossBarShown = this.hudModel.bossVisible; // Story 6.14 review L3
    this.eventView?.update(this.localHost?.paused === true ? 0 : deltaMs / 1000, host.serverTick, ev.x, ev.y, ev.width, ev.height, this.cameras.main.width, this.cameras.main.height, dpr(), this.eventInsets);
    // Story 7.12: the bag from the World's loot record (server ticks); its badge keeps off the HUD and the event's arrow.
    if (this.eventView) this.lootView?.update(host.serverTick, ev.x, ev.y, ev.width, this.cameras.main.width, this.cameras.main.height, dpr(), this.eventInsets, this.eventView.controlRects(), this.eventView.edgeArrowAt());
    this.updateVote(host); // Story 6.11
    this.trailView?.update(host.world, host.alpha, deltaMs, this.localHost?.paused === true);
    const fxDtS = this.localHost?.paused === true ? 0 : deltaMs / 1000;
    this.acidClockS += fxDtS;
    // Story 6.3 (designer B3): acid puddles and Bloater gas show above the darkness at 10 % (blackout only).
    const hazardGhost = hazardGhostFor(host.world);
    if (this.acidView) this.acidView.darkGhost = hazardGhost;
    if (this.bloaterView) this.bloaterView.darkGhost = hazardGhost;
    this.acidView?.update(this.acidClockS);
    this.grenadeView?.update(this.acidClockS);
    this.explosionView?.update(fxDtS, this.acidClockS);
    if (this.molotovView) {
      const cam = this.cameras.main;
      const vw = this.scale.width / cam.zoom;
      const vh = this.scale.height / cam.zoom;
      this.molotovView.update(fxDtS, this.acidClockS, cam.midPoint.x - vw / 2, cam.midPoint.y - vh / 2, vw, vh);
    }
    this.updateLobMarker(host);
    this.bloaterView?.update(host.world, this.acidClockS); // Story 5.8 (the same paused-aware clock)
    this.projectileView?.update(host.world.projectiles, host.alpha);
    this.syncPlayerViews(host.world, this.localHost?.paused === true ? 0 : deltaMs / 1000);
    this.downedView?.update(host.world, this.time.now);
    this.ambience?.update(host.world.decay.stage, collapseStyleAt(host.world)); // Story 6.4: the ash style mutes the rain bed
    // Story 5.23 (AC 1): a fresh pick pops the ghost (0.8 → 1 in 120 ms) with a soft click
    if (this.placement.picks !== this.seenPicks) {
      this.seenPicks = this.placement.picks;
      if (this.placement.active) {
        this.pickAtMs = this.time.now;
        playSfx("ui_build_pick");
      }
    }
    this.placeFxView?.update(host.world, this.localHost?.paused === true ? 0 : deltaMs / 1000, this.time.now);
    this.buildingView?.update(host.world, this.placement, this.placeFxView, this.time.now, pickPopScale(this.time.now - this.pickAtMs));
    this.updateWallSilhouettes(host.world);
    this.blockReasonView?.update(host.world, this.placement, this.drawnAt);
    this.pendingView?.update(this.pending, this.time.now); // Story 5.18
    this.moveView?.update(host.world, this.placement, this.pendingMoves, this.time.now); // Story 5.22
    this.ghostView?.update(host.world, host.teammateGhosts, host.playerInfo(localId).slot, this.ghostNameOf, deltaMs, this.hudModel); // Story 5.24
    // Story 5.14: my survivor as drawn (predicted online) fills the re-arm ring on a sprung bear trap.
    const meNow = host.world.players.get(localId);
    const meView = this.playerViews.get(localId);
    if (meNow) {
      this.mineRearmMe.x = meView?.x ?? meNow.x;
      this.mineRearmMe.y = meView?.y ?? meNow.y;
      this.mineRearmMe.radiusM = meNow.radiusM;
      this.mineRearmMe.alive = meNow.status === "alive";
    }
    this.mineView?.update(host.world, this.time.now, meNow ? this.mineRearmMe : undefined, this.localHost?.paused === true ? 0 : deltaMs);
    this.turretView?.update(host.world, this.localHost?.paused === true ? 0 : deltaMs / 1000);
    this.medStationView?.update(host.world, this.cameras.main.zoom); // Story 5.10
    this.selectView?.update(host.world, this.repairPanel.id);
    const player = host.world.players.get(localId);
    const playerView = this.playerViews.get(localId);
    this.hudModel.teammateCount = 0; // never stale while my player is missing (2.9 review)
    // Story 12.2: aboard, my body isn't drawn. Story 12.3: during the extraction the camera director has the camera
    // (framing, zoom, letterbox, fades: `render/cameraDirector.ts`); it never touches the World.
    const aboard = player !== undefined && host.world.extract.boarded.has(localId);
    const shot = this.directCamera(host, deltaMs / 1000);
    if (player && (playerView || aboard)) {
      // Out (Story 2.8): the camera spectates the lowest-slot standing teammate (the server streams that view).
      const target = player.status === "out" && !aboard ? spectateTarget(host.world, localId) : null;
      const viewOf = (target && this.playerViews.get(target.id)) ?? playerView ?? player;
      const camX = shot.active ? shot.centreX : viewOf.x;
      const camY = shot.active ? shot.centreY : viewOf.y;
      this.cameras.main.centerOn(camX, camY);
      this.updateRushMarkers(host.alpha, camX, camY);
      this.updateDownedHud(host.world, player);
      this.updateTeammates(host.world);
      const m = this.hudModel;
      recordSimFrame(host.stats, host.world.zombies, m.camX, m.camY, this.scale.width / m.camZoom, this.scale.height / m.camZoom);
      this.floodlightView?.update(host.world, m.camX, m.camY, this.scale.width / m.camZoom, this.scale.height / m.camZoom); // Story 5.10
      this.hudModel.hp = player.hp;
      this.hudModel.burning = this.fireCue.burning(localId, this.time.now); // Story 4.8
      // Story 4.11: my screen-edge glow, pulsing with the fire's damage tick.
      this.hudModel.burnGlow = edgeGlowAlpha(this.hudModel.burning && player.status === "alive", this.fireCue.sinceLastHit(localId, this.time.now), host.world.balance.decay.fire.pulseS * 1000);
      // Story 5.6: my acid cue (green edge glow, "Acid"), pulsing with the puddle's 0.4 s damage tick.
      this.hudModel.inAcid = this.acidCue.burning(localId, this.time.now);
      this.hudModel.acidGlow = edgeGlowAlpha(this.hudModel.inAcid && player.status === "alive", this.acidCue.sinceLastHit(localId, this.time.now), (acidSpitOf(host.world.balance)?.puddlePulseS ?? 0.4) * 1000);
      // Story 5.8: a light yellow-green edge while the gas slows me (the server's slow, inside a drawn cloud).
      this.hudModel.gasGlow = player.status === "alive" && player.slowTicksLeft > 0 && this.bloaterFx?.inCloud(player.x, player.y, player.radiusM, this.acidClockS) === true ? GAS_GLOW_ALPHA : 0;
      this.hudModel.maxHp = player.maxHp;
      this.hudModel.gearMask = player.gear; // Story 5.11: the HUD's gear icons (server truth online)
      this.hudModel.gearIds = gearIds(host.world.balance);
      this.hudModel.money = this.shownWallet(host); // Story 5.18: pending prices off (AC 5)
      this.hudModel.localX = viewOf.x;
      this.hudModel.localY = viewOf.y;
      const slot = activeSlot(player.loadout);
      const stats = weaponStats(host.world.balance, slot.weapon);
      if (slot.weapon !== this.hudWeaponId) {
        this.hudWeaponId = slot.weapon; // rebuild the label only when the weapon changes
        this.hudModel.weaponName = slot.weapon.replace(/_/g, " ").toUpperCase();
      }
      this.hudModel.weaponLevel = slot.level; // Story 5.1 (online: the state's level0/level1 via the mirror)
      this.hudModel.fuel = isFlame(stats); // Story 5.4: a fuel bar instead of a round count
      if (hasMagazine(stats) || isFlame(stats)) {
        this.hudModel.ammo = isFlame(stats) ? fuelPercent(slot.ammo, stats) : slot.ammo;
        this.hudModel.magazine = isFlame(stats) ? 100 : stats.magazine;
        const totalTicks = ticksFor(reloadSecondsFor(player, stats)); // Story 7.5 review L5: the trained reload (the ring fills to 1)
        this.hudModel.reloadFrac = slot.reloadTicks > 0 ? 1 - slot.reloadTicks / totalTicks : -1;
      } else {
        this.hudModel.ammo = -1;
        this.hudModel.magazine = 0;
        this.hudModel.reloadFrac = -1;
      }
      const other = player.loadout.slots[player.loadout.active === 0 ? 1 : 0];
      if (other) {
        if (other.weapon !== this.hudOtherId) {
          this.hudOtherId = other.weapon;
          this.hudModel.otherWeaponName = other.weapon.replace(/_/g, " ").toUpperCase();
        }
        const otherStats = weaponStats(host.world.balance, other.weapon);
        this.hudModel.otherAmmo = hasMagazine(otherStats) ? other.ammo : isFlame(otherStats) ? fuelPercent(other.ammo, otherStats) : -1;
        this.hudModel.otherWeaponLevel = other.level;
        this.hudModel.otherMag = hasMagazine(otherStats) ? otherStats.magazine : isFlame(otherStats) ? 100 : 0;
        this.hudModel.otherFuel = isFlame(otherStats);
      } else {
        this.hudOtherId = "";
        this.hudModel.otherWeaponName = "";
        this.hudModel.otherWeaponLevel = 1;
      }
      const swapTicks = ticksFor(host.world.balance.player.swapS);
      this.hudModel.swapFrac = player.loadout.swapTicks > 0 ? (swapTicks - player.loadout.swapTicks + 1) / swapTicks : -1;
    }
    // Story 8.7; Story 10.2 review L1: after this frame's camera and teammates (hudModel), so the teammate arrows the ping
    // arrows keep off are the ones HudScene draws this frame
    if (this.pingView && host.pings && this.eventView) this.updatePings(host.pings, ev.x, ev.y, ev.width);
    // Story 4.9: after the camera target is known (hudModel.camX/camY are this frame's view).
    const zoom = this.cameras.main.zoom;
    // Online: the first bake waits until the mirror has the server's decay stage (review L: no
    // stage-1 bake followed by a second one a moment later on a late join).
    const synced = !(host instanceof NetSimHost) || host.decaySynced;
    if (this.cityView) this.cityView.powerFlicker = this.eventView?.powerFlicker() ?? -1; // Story 6.10 (P1)
    this.cityView?.update(host.world, this.hudModel.camX, this.hudModel.camY, this.scale.width / zoom, this.scale.height / zoom, this.localHost?.paused === true ? 0 : deltaMs / 1000, synced);
    this.dustView?.update(host.world, ruinsLookAt(host.world), this.hudModel.camX, this.hudModel.camY, this.scale.width / zoom, this.scale.height / zoom, this.localHost?.paused === true ? 0 : deltaMs / 1000);
    this.updateDarkness(host, zoom, this.localHost?.paused === true ? 0 : deltaMs / 1000);
  }

  /**
   * Story 12.3 (AC 1–9): this frame's shot from the camera director — fed the timeline (server ticks), the walkers and
   * the helicopter as drawn — then applied: the camera's zoom (the director's centre is used by the caller), the crew,
   * the dawn line and the HUD's letterbox / fade / hide flags. Client only: nothing here writes the World.
   */
  private directCamera(host: SceneHost, dtS: number): DirectorOutput {
    const world = host.world;
    const ex = world.extract;
    const evac = world.balance.waves.evac;
    const inp = this.dirIn;
    const phase = world.run.phase;
    inp.extracting = ex.started && (phase === "extract" || phase === "results");
    const st = host.serverTick;
    inp.nowTick = Number.isFinite(st) ? st : world.tick;
    inp.startTick = ex.startTick;
    inp.liftedAtTick = ex.liftedAtTick;
    inp.cut = ex.cut;
    inp.dtS = dtS;
    inp.walkTimeoutS = evac.walkTimeoutS;
    inp.liftBeatS = evac.liftBeatS;
    inp.flyOutS = evac.flyOutS;
    inp.mapW = world.map.widthM;
    inp.mapH = world.map.heightM;
    inp.padX = ex.padX;
    inp.padY = ex.padY;
    inp.flyDxM = this.heliView?.flyOutDxM ?? 0;
    inp.heliX = this.heliView?.drawnX ?? ex.padX;
    inp.heliY = this.heliView?.drawnY ?? ex.padY;
    inp.screenW = this.scale.width;
    inp.screenH = this.scale.height;
    inp.ppm = pixelsPerMeter(this.scale.width, this.scale.height);
    inp.walkers = 0;
    if (inp.extracting) world.players.forEach(this.addWalker);
    inp.allAboard = inp.extracting && inp.walkers === 0;
    const o = this.director.update(inp);
    const cam = this.cameras.main;
    if (o.active) cam.setZoom(inp.ppm * o.zoom);
    else if (this.directing) this.applyZoom(); // let go: the normal 24 m view
    this.directing = o.active;
    // The crew (AC 8): out of the door once the helicopter is down and the walk has begun; a pull-in at each boarding.
    const nowS = this.time.now / 1000;
    const boarded = o.active ? ex.boarded.size : 0;
    if (boarded > this.boardedSeen) this.pullAtS = nowS;
    this.boardedSeen = boarded;
    const landedAt = this.heliView?.landedAtS ?? -1;
    const outS = o.active && landedAt >= 0 && o.flyS < 0 ? Math.min(nowS - landedAt, o.walkS) : -1;
    const pullS = this.pullAtS >= 0 && outS >= 0 ? nowS - Math.max(this.pullAtS, nowS - outS + CREW_STEP_S) : -1;
    this.crewView?.update(outS, o.aboardS, pullS);
    this.dawnView?.update(o.dawnX, o.dawnAlpha);
    if (this.darknessView) {
      this.darknessView.dawnX = o.dawnX; // the dawn lifts the night east of its line (a stage-5 blackout)
      this.darknessView.dawnEdgeM = DAWN_EDGE_M;
      this.darknessView.dawnK = o.dawnAlpha;
    }
    const m = this.hudModel;
    m.cinemaOn = o.active;
    m.cinemaBars = o.bars;
    m.cinemaFadeRgb = o.fadeRgb;
    m.cinemaFadeAlpha = o.fadeAlpha;
    return o;
  }

  /** A standing survivor not yet aboard, as drawn (the director frames them with the pad). */
  private readonly addWalker = (p: PlayerState, id: string): void => {
    const inp = this.dirIn;
    const world = this.host?.world;
    if (!world || world.extract.boarded.has(id) || p.status !== "alive" || inp.walkers >= inp.walkerX.length) return;
    const v = this.playerViews.get(id);
    inp.walkerX[inp.walkers] = v ? v.x : p.x;
    inp.walkerY[inp.walkers] = v ? v.y : p.y;
    inp.walkers++;
  };

  /**
   * Story 6.4 (F3, D2, D10): this frame's fog on my screen, before the zombie, eye and spit views:
   * centred on the camera's survivor (mine; the teammate I spectate while out), every standing
   * survivor's beam at its drawn pose (last frame's: the views update after the zombies).
   */
  private updateScreenFog(host: SceneHost, localId: string): void {
    const fog = this.screenFog;
    if (!fog) return;
    const world = host.world;
    const me = world.players.get(localId);
    const target = me && me.status === "out" ? spectateTarget(world, localId) : null;
    const viewer = (target && this.playerViews.get(target.id)) ?? this.playerViews.get(localId) ?? target ?? me;
    fog.update(world, viewer?.x ?? 0, viewer?.y ?? 0, this.darkInputs.drawnOf, this.director.out.fogLift); // Story 12.3 (AC 5): the fog lift of the director's previous frame (it runs later in this frame)
    wireFog(this.fogTakers(), fog); // Story 6.10 follow-up (6.2 R1): one tested wiring, every frame
  }

  /** The views the fog hides things in (`render/fog/fogWiring.ts`); one reused record. */
  private readonly fogTakerList: FogTakers = { zombieView: null, trailView: null, acidView: null };
  private fogTakers(): FogTakers {
    const t = this.fogTakerList;
    t.zombieView = this.zombieView ?? null;
    t.trailView = this.trailView ?? null;
    t.acidView = this.acidView ?? null;
    return t;
  }

  /**
   * Story 6.3 (AC 5–9): after every view has its drawn pose (players, zombies) and the camera view
   * is known: the stamp plan, the darkness, the eyes within `eyesM` of my (or my spectated) survivor
   * and the beam sparkles. All hidden and idle while no blackout (F9).
   */
  private updateDarkness(host: SceneHost, zoom: number, dtS: number): void {
    const world = host.world;
    const on = isBlackoutNow(world);
    if (on !== this.blackoutNow) {
      this.blackoutNow = on;
      for (const v of this.playerViews.values()) v.setAboveDark(on);
      if (!on) this.flashLights?.clear();
    }
    const plan = this.darknessPlan;
    if (!plan) return;
    const m = this.hudModel;
    const vw = this.scale.width / zoom;
    const vh = this.scale.height / zoom;
    if (on) {
      const inp = this.darkInputs;
      inp.molotovs = this.molotovView?.fires.live ?? [];
      inp.nowS = this.acidClockS;
      padDarknessView(m.camX, m.camY, vw, vh, inp); // review M1: the padded darkness (camera shake)
      planDarkness(plan, world, inp);
    }
    this.fogView?.update(world, plan, dtS); // Story 6.4: before the darkness paints (the fog rides in it)
    this.darknessView?.update(world, plan, m.camX, m.camY, vw, vh, zoom, this.scale.width, this.scale.height);
    if (this.zombieView) this.eyesView?.update(world, this.zombieView, m.localX, m.localY, world.balance.decay.blackout.eyesM);
    this.sparkleView?.update(world, plan, this.acidClockS);
  }

  /** Story 6.3 (AC 4, D4): a shot or a blast lights the dark for a moment (only while a blackout is on). */
  private blackoutFlash(e: SimEvent): void {
    const f = this.flashLights;
    if (!f) return;
    const b = this.host?.world.balance.decay.blackout;
    if (!b) return;
    if (e.type === "weapon.fired" || (e.type === "turret.fired" && b.turretMuzzleLight)) {
      f.add(e.x + e.dirX * MUZZLE_LIGHT_AHEAD_M, e.y + e.dirY * MUZZLE_LIGHT_AHEAD_M, b.muzzleLightM, b.muzzleLightS, this.acidClockS);
    } else if (e.type === "explosion.happened" && (e.ageS ?? 0) <= b.explosionLightS) {
      f.add(e.x, e.y, b.explosionLightM, b.explosionLightS - (e.ageS ?? 0), this.acidClockS);
    }
  }
}

/** Story 6.2: a frame longer than this follows a hidden tab (no one-off collapse burst on wake). */
const LIVE_FRAME_MAX_MS = 250;

/** Story 6.3: a muzzle flash lights round a point this far ahead of the shooter (looks.html: 0.8 m). */
const MUZZLE_LIGHT_AHEAD_M = 0.8;
