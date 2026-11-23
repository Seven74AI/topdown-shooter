import * as Phaser from "phaser";
import {
  NEUTRAL_INPUT,
  PROJECTILE_POOL_CAPACITY,
  TICK_RATE_HZ,
  ZOMBIE_POOL_CAPACITY,
  activeSlot,
  addPlayer,
  buildingStats,
  isFlame,
  hasMagazine,
  setLoadout,
  shopGear,
  gearIds,
  ownedCount,
  shopWeapons,
  upgradePriceTable,
  spectateTarget,
  weaponName,
  ticksFor,
  weaponIds,
  weaponStats,
  parseWaveMix,
  isRushState,
  acidSpitOf,
  type Balance,
  type SimEvent,
  type BlockReason,
  type PlaceError,
  type PlaceRequest,
  type RepairError,
  type PlayerInput,
  type PlayerState,
  type LauncherStats,
  type World,
  buildingById,
  inHealReach,
} from "@topdown/shared";
import { dpr } from "../display";
import { STICK_RADIUS_CSS_PX, TouchSticks } from "../input/TouchSticks";
import { InputRouter } from "../input/InputRouter";
import { attachDesktopInput } from "../input/desktopInput";
import { pixelsPerMeter, shakeIntensityFor } from "../render/camera";
import { PlayerView } from "../render/PlayerView";
import { ACID_CUE_MS, FireCue } from "../render/fireCue";
import { ACID_SOUND_MAX_AGE_S, AcidFx } from "../render/acidFx";
import { BRUTE_BANNER, bruteSpawnCue, type BruteCue } from "../render/bruteCue";
import { AcidView } from "../render/AcidView";
import { playSfx, startChainsawRev, startFlameLoop, stopChainsawRev, stopFlameLoop } from "../audio/placeholderSfx";
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
import { BuildingView } from "../render/BuildingView";
import { BlockReasonView } from "../render/BlockReasonView";
import { MineView } from "../render/MineView";
import { MINE_SHAKE_MS, mineShakeIntensity } from "../render/mineBlast";
import { GrenadeView } from "../render/GrenadeView";
import { ExplosionView } from "../render/ExplosionView";
import { STALE_EXPLOSION_S, blastLookFor } from "../render/grenadeFx";
import { CityView } from "../render/city/CityView";
import { TurretView } from "../render/TurretView";
import { FloodlightView } from "../render/FloodlightView";
import { MedStationView } from "../render/MedStationView";
import { HealCue } from "../render/healCue";
import { Placement, placeRefusalText, stepPlacement, type PlacementFrame } from "./placement";
import { placementHintText, type HintContext } from "./blockText";
import { RepairPanel, repairRefusalText, upgradeRefusalText } from "./repairPanel";
import { BuildingSelectView } from "../render/BuildingSelectView";
import { menuStep, playingScreen, uiStore, type MenuAction } from "../ui/uiState";
import { CLOSED_SHOP, shopAllowed, shopStep, shopStore, type ShopInput } from "../ui/shopStore";
import { holdBuildingInput, neutralizeInput } from "../input/menuInput";
import { buildBarItems, stepBuildBar, type BuildBarFrame, type BuildBarStep } from "./buildBar";
import { ToastQueue, playerLeftText } from "./toastQueue";
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
import { urlOptions } from "../debug/urlOptions";
import { clientBalance, soloBalance } from "../debug/clientBalance";
import { getTuning, tunedBalance } from "../debug/tuning";
import { validLoadout } from "./validLoadout";
import { recordSimFrame } from "../debug/perfProbe";
import { perf } from "../debug/perfStats";
import { STRESS_FLOOR_BUILDINGS, placeStressFloor, placeStressLights, setupStressWorld, stressFireInput, toughenStressZombies, stressRun, viewAround, type ViewRect } from "../debug/stressScenario";
import { netSummary } from "../debug/netSummary";
import { netMeter } from "../net/netMeter";
import { AmbiencePlayer } from "../audio/ambience";

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
const FF_FLASH_MS = 250;
const RUSH_COLOR = 0xff3b30;
/** Short screen shake for heavy weapons (FR19); intensity is a fraction of the view size. */
/** Story 5.8: the gas-slow edge tint (steady: slowed, not hurt). */
const GAS_GLOW_ALPHA = 0.32;
const SHAKE_MS = 80;
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

export class GameScene extends Phaser.Scene {
  private host: SceneHost | null = null;
  /** `?stress` benchmark run (no in-run menu). */
  private stressMode = false;
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
    let view = this.playerViews.get(id);
    if (!view) {
      view = new PlayerView(this, this.playerRadiusM);
      view.setSlot(this.host?.playerInfo(id).slot ?? 0); // Story 2.9: ring colour by slot
      this.playerViews.set(id, view);
    }
    view.update(p, this.host?.alpha ?? 0, this.time.now, this.fxView?.saw?.running(id, this.time.now) === true); // Story 5.2: the running Chainsaw frame
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
  private readonly ffFlashMs = new Map<string, number>();
  private flameLooping = false;
  private readonly slotOfPlayer = (id: string): number => this.host?.playerInfo(id).slot ?? -1;
  /** Story 2.9: every other player for the HUD's names and edge arrows (drawn position, slot, flags). */
  private readonly collectTeammate = (p: PlayerState, id: string): void => {
    const host = this.host;
    const m = this.hudModel;
    if (!host || id === host.localPlayerId || m.teammateCount >= m.teammateSlot.length) return;
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
    if (this.host?.world.players.has(id)) return;
    view.destroy();
    this.playerViews.delete(id);
  };
  private zombieView: ZombieView | null = null;
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
  private medStationView: MedStationView | null = null;
  private readonly healCue = new HealCue();
  /** Story 3.4: placement mode on this device; Story 5.15: the ghost is carried while I walk. */
  private readonly placement = new Placement();
  /** "Wood barricade · $40" for the type being placed, and the refusal texts (built once each). */
  private placingLabel = "";
  /** Story 5.15: the placement step's per-frame context (one object, refilled every frame). */
  private readonly sendPlace = (req: PlaceRequest): void => this.host?.placeBuilding(req);
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
  };
  /** Story 5.17: the reason line's last text and what it was built from (rebuilt only when one changes: no string per frame). */
  private hint = { e: "" as PlaceError | "", cause: "", index: 0, id: 0, playerId: "", name: "", wallet: -1, type: "", text: "" };
  private readonly hintCtx: HintContext = { price: 0, wallet: 0, nameOf: (id) => this.ownerName(id), refusal: (e) => this.refusalText(e) };
  /** Story 5.17: the shown reason's culprit and the spawn no-build circles. */
  private blockReasonView: BlockReasonView | null = null;
  private readonly drawnAt = (id: string): { x: number; y: number } | undefined => this.playerViews.get(id);
  private readonly refusalTexts = new Map<PlaceError, string>();
  /** Story 5.16: the build bar's per-frame context and answer (one object each, refilled every frame). */
  private readonly barFrame: BuildBarFrame = { can: false, holding: false, selected: false, owned: 0, cap: 0, wallet: 0 };
  private readonly barStep: BuildBarStep = { show: false, pick: "", toast: "" };
  /** Story 5.16: the bar's last refusal toast ("" = none), withdrawn once a pick succeeds. */
  private barToast = "";
  /** Story 3.7: the repair panel on this device, the selected building's outline. */
  private readonly repairPanel = new RepairPanel();
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
    const opts = urlOptions();
    // ?tune=1: the live tuning values from the panel (validated like any balance change). Online
    // always plays the bundled balance: the server checked that version at join. Solo: `?wallet`
    // works in release builds too (designer 2026-11-23, soloBalance).
    const balance: Balance = session ? clientBalance() : opts.tune ? tunedBalance() : soloBalance();
    const stickRadiusCss = opts.tune ? getTuning().stickRadiusCssPx : STICK_RADIUS_CSS_PX;
    const soloSeed = data?.mode !== "online" && data?.seed !== undefined ? data.seed >>> 0 : undefined;
    // Story 2.7: the reversed-hit counter runs in dev builds, and in release while the overlay is on.
    const netHost = session ? new NetSimHost({ balance, session, measureHits: () => import.meta.env.DEV || perf.overlayOn }) : null;
    const localHost = netHost ? null : new LocalSimHost({ balance, seed: soloSeed ?? newRunSeed() });
    const host: SceneHost = netHost ?? (localHost as LocalSimHost);
    this.localHost = localHost;
    this.leaving = false;
    this.toasts.clear();
    this.barToast = "";
    perf.hits = netHost ? netHost.netStats : null;
    perf.net = netHost; // Story 2.10: the overlay's network lines
    perf.soloSeed = localHost ? localHost.world.seed : null; // Story 4.4: online the overlay reads the server's
    const stress = session ? null : opts.stress;
    this.stressMode = stress !== null;
    this.stressFire = stress !== null && opts.stressFire;
    this.pausedAtMs = 0;
    this.host = host;
    const world = host.world;
    const localId = host.localPlayerId;
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    if (!session) addPlayer(world, localId, cx, cy); // online, players come from the server
    // Story 3.9 dev hook, kept by 3.10 as an override: ?wavemix=walker,crawler replaces the waves.json mix (solo).
    if (!session && stress === null) world.debug.waveMix = parseWaveMix(opts.waveMix, balance);
    this.gameOver = false;
    this.kills = 0;
    this.placement.cancel(); // Phaser reuses this scene object: no placement from the last run
    this.refusalTexts.clear();
    this.repairPanel.close(); // Story 3.7: no selection from the last run
    this.ready.reset(); // Phaser reuses this scene object (restart): no Ready from the last run
    this.myReady = false;
    this.statusSecs = -1;
    // Phaser reuses this scene object on restart: reset what the HUD reads (no stale banner).
    Object.assign(this.hudModel, createHudModel());
    this.hudWeaponId = "";
    this.hudOtherId = "";
    if (balance.waves.lastRushCount > MAX_RUSH_MARKERS) {
      throw new Error(`waves.lastRushCount ${balance.waves.lastRushCount} exceeds MAX_RUSH_MARKERS ${MAX_RUSH_MARKERS}`);
    }
    if (session) {
      // Online game over → Back to start, or the connection dropped: leave the run (Story 2.4).
      uiStore.handle("leaveRun", (error) => this.scene.start("Boot", (error ? { error } : {}) satisfies BootSceneData));
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
    this.blockReasonView = new BlockReasonView(this);
    this.mineView = new MineView(this, balance);
    this.turretView = new TurretView(this);
    this.floodlightView = new FloodlightView(this, balance); // Story 5.10
    this.medStationView = new MedStationView(this, balance);
    this.healCue.clear(); // Phaser reuses this scene object
    this.selectView = new BuildingSelectView(this);
    this.playerRadiusM = balance.player.radiusM;
    this.playerViews.clear(); // Phaser reuses this scene object: the old views died at shutdown
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
    // Story 5.8: pools sized by the balance caps (gas clouds = the server's pool, particles by controls.json › fx).
    const blEx = balance.zombies.types.bloater?.explodes;
    this.bloaterFx = new BloaterFx(balance.zombies.blasts.maxGasClouds, balance.controls.fx.maxBloaterParticles, blEx?.gasRadiusM ?? 2.5, blEx?.gasS ?? 4);
    this.bloaterView = new BloaterView(this, this.bloaterFx, this.zombieView, blEx?.blastRadiusM ?? 2.5, balance.controls.fx.maxFuseRings);
    this.chevrons.length = 0;
    for (let i = 0; i < MAX_RUSH_MARKERS; i++) {
      const c = CHEVRON_M;
      this.chevrons.push(this.add.triangle(0, 0, -c, -c * 0.6, c, -c * 0.6, 0, c * 0.6, RUSH_COLOR).setDisplayOrigin(0, 0).setDepth(12).setVisible(false)); // Phaser 4: points are drawn from the display origin (2.9 review)
    }

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setBounds(0, 0, world.map.widthM, world.map.heightM);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.cityView = new CityView(this, world.map, cam.zoom, urlOptions().lowFx);
    if (stress !== null) {
      // Fixed ?stress scenario (release too): god mode, waves paused, Walkers inside the view, Pistol.
      const view = viewAround(world.map, cx, cy, this.scale.width / cam.zoom, this.scale.height / cam.zoom, { x: 0, y: 0, w: 0, h: 0 });
      if (opts.stressBuild) placeStressFloor(world, localId, cx, cy); // Story 5.9: before the Walkers
      if (opts.stressLights) placeStressLights(world, localId, cx, cy); // Story 5.10: 8 floodlights + 4 med stations
      if (opts.stressBear) placeStressFloor(world, localId, cx, cy, STRESS_FLOOR_BUILDINGS, ["bear_trap"]); // Story 5.14
      setupStressWorld(world, stress, view, cx, cy, parseWaveMix(opts.waveMix, balance)); // Story 5.6: ?wavemix=walker,spitter
      // Story 5.2: a melee ?stressfire benchmark (?loadout=chainsaw) keeps its crowd: the zombies can't die.
      // Story 5.4: so does a flame one (?loadout=flamethrower): the whole crowd keeps burning (the worst case).
      const firstKind = urlLoadout !== null ? balance.weapons[urlLoadout.weapons[0]]?.kind : undefined;
      // Story 5.5: a launcher benchmark keeps its crowd too (explosions keep coming on screen).
      const meleeFire = this.stressFire && (firstKind === "melee" || firstKind === "flame" || firstKind === "launcher");
      if (opts.stressBuild || opts.stressLights || opts.stressBear || meleeFire) toughenStressZombies(world);
      stressRun.start(performance.now(), stress);
    }

    this.sticks = new TouchSticks(stickRadiusCss * dpr(), balance.controls.moveDeadZone, balance.controls.aimDeadZone);
    const router = new InputRouter(this.sticks);
    this.router = router;
    const detachDesktop = attachDesktopInput(router, window, document, document.getElementById("game"));
    const hudData: HudSceneData = { sticks: this.sticks, model: this.hudModel, router, stickRadiusCss };
    this.scene.launch("Hud", hudData);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
      this.scene.stop("Hud");
      detachDesktop();
      this.router = null;
      stressRun.cancel();
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
      this.blockReasonView?.destroy();
      this.blockReasonView = null;
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
      this.medStationView?.destroy();
      this.medStationView = null;
      this.repairPanel.close();
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
      this.trailView?.destroy();
      this.trailView = null;
      for (const v of this.playerViews.values()) v.destroy();
      this.playerViews.clear();
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

  /** Story 4.4: the dev cheats' "Restart with seed" is solo only. */
  get isOnline(): boolean {
    return this.mode === "online";
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

  private showBanner(text: string): void {
    this.hudModel.bannerText = text;
    this.hudModel.bannerAtMs = this.time.now;
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
    m.remaining = host.world.waves.remaining;
  }

  /**
   * Solo Results after the wipe (Story 2.8) or, Story 3.10, after the last wave ("You held out!"):
   * wave reached, kills, money earned, Restart. Online, main.ts shows Results from the room state
   * when `phase` becomes "results" (every player's kills and earnings). `earned` is read from the
   * World after the step, so it includes the last wave's bonus (paid later in the same tick).
   */
  private showSoloResults(host: SceneHost, wave: number, heldOut: boolean): void {
    this.gameOver = true;
    const earned = host.world.players.get(host.localPlayerId)?.earned ?? 0;
    uiStore.set({ kind: "results", wave: Math.max(1, wave), heldOut, rows: [{ slot: 0, name: SOLO_NAME, kills: this.kills, earned }], online: false, seed: host.world.seed });
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
    m.readyButton = build && this.running && !this.gameOver && !menuOpen && !this.stressMode && !this.placement.active;
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
    const wallet = host.world.players.get(host.localPlayerId)?.wallet ?? 0;
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
    f.nowMs = this.time.now;
    stepPlacement(this.placement, this.hudModel, this.input_, host.world, f);
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
    m.worldTap = m.repairPressed = m.repairClosePressed = m.upgradePressed = false;
    if (allowed && tap) {
      const w = this.cameras.main.getWorldPoint(m.worldTapX, m.worldTapY, this.cursorWorld);
      p.tap(host.world, w.x, w.y);
    }
    if (close) p.close();
    if (press && allowed && p.open) host.repairBuilding(p.press());
    if (upgrade && allowed && p.open && p.upgradeErrorNow === null) {
      // Story 5.9: the panel stays open, "Upgrading…" until the World (online: the state) shows the new tier.
      const id = p.pressUpgrade(host.world);
      if (id !== 0) host.upgradeBuilding(id);
    }
    m.repairOpen = p.update(host.world, host.localPlayerId, allowed, this.ownerName);
    if (m.repairOpen) {
      m.repairInfo = p.info;
      m.repairReason = p.reason;
      m.repairLabel = p.label;
      m.upgradeShown = p.upgradeShown;
      m.upgradeLabel = p.upgradeLabel;
      m.upgradeReason = p.upgradeReason;
    }
  }

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
    if (pressed && m.buildBar && can && !shopStore.get().open) {
      const balance = host.world.balance;
      this.router?.releaseAll(); // nothing stays held under the shop (as for the menu)
      host.clearEdges();
      this.shopInput({ type: "open", weapons: shopWeapons(balance), upgradePrices: upgradePriceTable(balance), maxLevel: balance.shop.upgrades.maxLevel, gear: shopGear(balance) });
    }
    // Answers: shown while open, dropped while closed (the World already has the result).
    for (let a = host.takeShopAnswer(); a !== null; a = host.takeShopAnswer()) this.shopInput({ type: "answer", answer: a });
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
        if (me.wallet !== s.wallet || w0 !== s.slots[0] || w1 !== s.slots[1] || l0 !== s.levels[0] || l1 !== s.levels[1] || me.gear !== s.gearMask) {
          this.shopInput({ type: "sync", wallet: me.wallet, slots: [w0, w1], levels: [l0, l1], gearMask: me.gear });
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
    if (e.type === "buy") this.host?.buyWeapon(e.weapon, e.slot);
    else if (e.type === "upgrade") this.host?.upgradeWeapon(e.weapon); // Story 5.1
    else this.host?.buyItem(e.item); // Story 5.11
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
    f.owned = ownedCount(world, host.localPlayerId);
    f.cap = world.balance.buildings.maxPerPlayer;
    f.wallet = world.players.get(host.localPlayerId)?.wallet ?? 0;
    m.buildItems = buildBarItems(world.balance); // Story 5.10 review M2: the ?shopall dev balance lists the floodlight
    const r = stepBuildBar(m, f, this.barStep);
    if (r.toast !== "") {
      this.toasts.pushUnique(r.toast); // tapping a refused tile again doesn't queue the same line again
      this.barToast = r.toast;
    }
    if (r.pick !== "") {
      this.startPlacement(r.pick);
      if (this.placement.active) {
        if (this.barToast !== "") this.toasts.withdraw(this.barToast); // an old refusal off the screen
        this.barToast = "";
        holdBuildingInput(this.input_); // the hold starts now: no aim or fire in this frame's input either
        r.show = false;
      }
    }
    m.buildBar = r.show;
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
    m.statusText = me.status === "out" ? STATUS_OUT : this.revivingSomeone ? STATUS_REVIVING : "";
  }

  /** Story 2.9: teammates for the HUD (none once the team is wiped: Results are up). */
  private updateTeammates(world: Readonly<World>): void {
    this.hudModel.teammateCount = 0;
    if (!world.teamWiped) world.players.forEach(this.collectTeammate);
  }

  /** Adds, updates and removes player views to match `world.players` (no allocation per frame). */
  private syncPlayerViews(world: Readonly<World>, dtS: number): void {
    this.playerViews.forEach(this.dropPlayerView); // deleting inside forEach is safe for a Map
    this.burnView?.begin(dtS, this.time.now / 1000);
    this.flameView?.begin(dtS, this.time.now / 1000, world);
    world.players.forEach(this.syncPlayerView);
    this.burnView?.end();
    const cam = this.cameras.main;
    this.flameView?.zombies(world, this.host?.online ? 1 : (this.host?.alpha ?? 0), cam.midPoint.x, cam.midPoint.y);
    this.flameView?.end();
  }

  /** A camera shake of `fraction` of the view (see `shakeIntensityFor`: Phaser's own shake scales by zoom²). */
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

  override update(_time: number, deltaMs: number): void {
    const host = this.host;
    const router = this.router;
    if (!host || !router) return;

    // Mouse aim: survivor (last drawn position) → cursor, through the camera that drew that frame.
    const localId = host.localPlayerId;
    const pv = this.playerViews.get(localId);
    const cw = this.cursorWorld.set(Number.NaN, Number.NaN);
    if (router.isMouse && pv && !Number.isNaN(router.cursorX)) this.cameras.main.getWorldPoint(router.cursorX, router.cursorY, cw);
    // Story 5.5: with the launcher in hand the aim's length carries the lob distance (FR-A, D1).
    router.build(this.input_, this.hudModel.swapPressed, pv?.x ?? 0, pv?.y ?? 0, cw.x, cw.y, this.localLauncher(host), this.playerRadiusM);
    this.hudModel.swapPressed = false;
    if (!this.running) this.input_.swap = false; // nothing swaps before the run is on screen

    // Story 2.11: ☰ and Esc toggle the in-run menu (Esc is never game input).
    const menuKey = router.kbm.takeMenu();
    const menuTap = this.hudModel.menuPressed;
    this.hudModel.menuPressed = false;
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
    if (menuOpen || shopOpen) neutralizeInput(this.input_); // Story 3.3: I stand still while shopping
    this.updatePlacement(host, menuOpen || shopOpen); // Story 3.4 / 5.15: holding keeps the move, drops aim and fire
    this.updateRepair(host, menuOpen, shopOpen); // Story 3.7: tap a building → Repair
    this.updateBuildBar(host, menuOpen, shopOpen); // Story 5.16: tap a tile → the building is in my hands
    this.updateReady(host, menuOpen || shopOpen);
    if (this.localHost) {
      if (menuOpen !== this.localHost.paused) this.setPresentationPaused(menuOpen);
      this.localHost.paused = menuOpen;
    }
    if (this.stressFire) stressFireInput(host.world, host.localPlayerId, this.input_);
    host.setLocalInput(this.input_);
    this.hudModel.toastText = this.toasts.current(this.time.now);

    if (this.running) host.update(deltaMs / 1000); // LocalSimHost caps catch-up after long frames
    if (perf.net) netSummary.frame(performance.now(), perf.net); // Story 2.10: ping samples for the wave summary
    const refused = host.takePlaceRefusal(); // Story 3.4: the server (or solo) said no
    if (refused) this.toasts.push(this.refusalText(refused));
    const repairRefused = host.takeRepairRefusal(); // Story 3.7
    if (repairRefused) this.toasts.push(this.repairText(repairRefused));
    const upgradeRefused = host.takeUpgradeRefusal(); // Story 5.9
    if (upgradeRefused) {
      this.repairPanel.upgradeRefused();
      this.toasts.push(upgradeRefusalText(upgradeRefused));
    }
    const events = host.drainEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      this.fxView?.handle(e);
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
      if (this.bloaterFx?.handle(e, this.acidClockS) && e.type === "bloater.burst") this.bloaterBurst(host, e);
      // Story 4.11: a build or wave start (a fire may have gone out) closes every burning cue; a real hit relights it.
      if (e.type === "build.started" || e.type === "wave.started") {
        this.fireCue.clear();
        this.acidCue.clear();
      }
      if ((e.type === "team.wiped" || e.type === "run.held_out") && !host.online && !this.gameOver) {
        this.showSoloResults(host, e.wave, e.type === "run.held_out");
      } else if (e.type === "player.downed" && e.playerId !== localId && !host.world.teamWiped && host.world.players.get(e.playerId)?.status === "downed") {
        // A teammate went down (and still is: a woken tab's backlog stays quiet once revived): say who,
        // with an alert; the pulsing edge arrow shows where and how long they have.
        this.stackBanner(`${host.playerInfo(e.playerId).name || "A teammate"} is down!`);
        playSfx("player_teammate_downed");
      } else if (e.type === "zombie.killed" && e.killerId === localId && e.buildingId === undefined) {
        // Story 3.6: my turret's kills pay me (money.earned) but are not my kills.
        this.kills++;
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
      } else if (e.type === "build.started") {
        if (e.wave === 1) this.stackBanner(BUILD_BANNER); // later builds keep "Wave N cleared"
      } else if (e.type === "wave.started") {
        this.showBanner(`Wave ${e.number}`);
        // Story 2.10: measured only with the overlay on (the 1.11 rule: no measuring cost otherwise).
        if (perf.net && perf.overlayOn) netSummary.start(performance.now(), e.number, perf.net, netMeter);
      } else if (e.type === "decay.stage_changed") {
        this.stackBanner(host.world.balance.decay.stageNames[e.stage - 1] ?? `Stage ${e.stage}`); // Story 4.5: "Panic"
      } else if (e.type === "wave.ended") {
        this.showBanner(`Wave ${e.number} cleared`);
        if (perf.net) netSummary.end(performance.now(), e.number, perf.net, netMeter, perf.overlayOn);
      }
    }

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
    this.zombieView?.update(host.world, host.alpha);
    this.trailView?.update(host.world, host.alpha, deltaMs, this.localHost?.paused === true);
    const fxDtS = this.localHost?.paused === true ? 0 : deltaMs / 1000;
    this.acidClockS += fxDtS;
    this.acidView?.update(this.acidClockS);
    this.grenadeView?.update(this.acidClockS);
    this.explosionView?.update(fxDtS, this.acidClockS);
    this.updateLobMarker(host);
    this.bloaterView?.update(host.world, this.acidClockS); // Story 5.8 (the same paused-aware clock)
    this.projectileView?.update(host.world.projectiles, host.alpha);
    this.syncPlayerViews(host.world, this.localHost?.paused === true ? 0 : deltaMs / 1000);
    this.downedView?.update(host.world, this.time.now);
    this.ambience?.update(host.world.decay.stage);
    this.buildingView?.update(host.world, this.placement);
    this.blockReasonView?.update(host.world, this.placement, this.drawnAt);
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
    if (player && playerView) {
      // Out (Story 2.8): the camera spectates the lowest-slot standing teammate (the server streams that view).
      const target = player.status === "out" ? spectateTarget(host.world, localId) : null;
      const viewOf = (target && this.playerViews.get(target.id)) ?? playerView;
      this.cameras.main.centerOn(viewOf.x, viewOf.y);
      this.updateRushMarkers(host.alpha, viewOf.x, viewOf.y);
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
      this.hudModel.money = player.wallet;
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
        const totalTicks = ticksFor(stats.reloadS);
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
    // Story 4.9: after the camera target is known (hudModel.camX/camY are this frame's view).
    const zoom = this.cameras.main.zoom;
    // Online: the first bake waits until the mirror has the server's decay stage (review L: no
    // stage-1 bake followed by a second one a moment later on a late join).
    const synced = !(host instanceof NetSimHost) || host.decaySynced;
    this.cityView?.update(host.world, this.hudModel.camX, this.hudModel.camY, this.scale.width / zoom, this.scale.height / zoom, this.localHost?.paused === true ? 0 : deltaMs / 1000, synced);
  }
}
