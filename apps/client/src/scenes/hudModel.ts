import { MAX_PLAYERS } from "@topdown/shared";
import type { BuildTile } from "./buildBar";
import { FIRE_HIT_QUEUE } from "../render/burnCue";

/** Values the GameScene publishes each frame for the HUD to draw (the HUD never reads the World). */
export interface HudModel {
  hp: number;
  maxHp: number;
  /** Story 4.8: the server reports my survivor burning (the HP text adds "Burning"). */
  burning: boolean;
  /** Story 5.6: the server reports my survivor in acid (the HP text adds "Acid", the edge glow turns green). */
  inAcid: boolean;
  /**
   * Story 5.11: my owned gear (the World's `gear`; online the state's, never the tap) and the gear
   * ids in bit order (`gearIds(balance)`, the same array every frame): the HUD's icons beside the HP text.
   */
  gearMask: number;
  gearIds: readonly string[];
  /** Active weapon's display name. */
  weaponName: string;
  /** Story 5.1: the active and the other weapon's upgrade level (1 = I: no mark). */
  weaponLevel: number;
  otherWeaponLevel: number;
  /** Rounds in the magazine; -1 for melee (no magazine). */
  ammo: number;
  magazine: number;
  /** Reload progress 0..1 while reloading, otherwise -1. */
  reloadFrac: number;
  /** The other (inactive) slot: name ("" when empty), ammo (-1 for melee) and magazine. */
  otherWeaponName: string;
  otherAmmo: number;
  otherMag: number;
  /** Swap progress 0..1 while swapping, otherwise -1. */
  swapFrac: number;
  /** Set by the HUD when the swap button is pressed; the GameScene consumes it. */
  swapPressed: boolean;
  /**
   * Story 5.12 (AC 1, 7): the consumable button — my slot (server truth online), whether it is shown,
   * usable (else greyed) and pending (dimmed after a tap until the synced count moves or 1 s passes);
   * `consumablePressed` is set by the HUD on a tap and consumed by the GameScene.
   */
  consumableItem: string | null;
  consumableCount: number;
  consumableVisible: boolean;
  consumableUsable: boolean;
  consumablePending: boolean;
  consumablePressed: boolean;
  /** Story 2.11: set by the HUD when ☰ is pressed; the GameScene consumes it. */
  menuPressed: boolean;
  /** ☰ is shown (a run is on screen, not on Results). */
  menuButton: boolean;
  /** The in-run menu is open (the HUD drops held sticks and buttons when it opens). */
  menuOpen: boolean;
  /** Story 2.11: the toast line under the wave text ("Bo left"), "" when none. */
  toastText: string;
  /** Current wave number (0 before wave 1) and zombies remaining (alive + queued). */
  wave: number;
  remaining: number;
  /** Story 3.1: whole seconds left in the build phase, or -1 outside a build. */
  buildSecs: number;
  /** Story 3.1: the Ready button is shown (a build phase, a run on screen, menu closed). */
  readyButton: boolean;
  /** The local player is Ready (as this device last asked: shown at once, also online). */
  readyOn: boolean;
  /** Players Ready and players in the run (online shows `k/n`; solo has 1). */
  readyCount: number;
  readyTotal: number;
  /** Set by the HUD when Ready is tapped; the GameScene consumes it. */
  readyPressed: boolean;
  /**
   * Story 3.4: placement mode is on. Story 5.15: I hold a building and keep walking: the hand cluster
   * (Place, ⟳, ✕) shows at the bottom right, the move stick works, the right half aims and fires nothing.
   */
  placementActive: boolean;
  /** The hint line ("Wood barricade · $40", or why it is red) and whether the preview is valid. */
  placementHint: string;
  placementValid: boolean;
  /** Story 5.15: ⟳ was pressed for this held item (auto-rotate off): the 🔒 badge on ⟳. */
  placementLocked: boolean;
  /** Place / ⟳ / ✕ taps (ids confirm / rotate / cancel); the GameScene consumes them. */
  rotatePressed: boolean;
  confirmPressed: boolean;
  cancelPressed: boolean;
  /**
   * Story 5.16: the build bar is shown (a build phase, hands empty, nothing selected, shop and menu
   * closed, my survivor standing): its building tiles (balance order, from `buildBarItems`), my
   * buildings and the cap (the count line; with `money` the tiles' short/cap look).
   */
  buildBar: boolean;
  buildItems: readonly BuildTile[];
  buildOwned: number;
  buildCap: number;
  /** Set by the HUD when a building tile is tapped (its type id, "" = none); the GameScene consumes it. */
  buildPick: string;
  /** Set by the HUD when the build bar's Shop tile is tapped (Story 3.3's shop); the GameScene consumes it. */
  shopPressed: boolean;
  /** Story 3.7: taps on the game view select buildings now (a build phase, no placement, shop or menu). */
  tapsEnabled: boolean;
  /** A short tap on the game view (canvas px) this frame; the GameScene consumes it. */
  worldTap: boolean;
  worldTapX: number;
  worldTapY: number;
  /** The repair panel is open: its info line, the reason it would be refused ("" = none), Repair's label. */
  repairOpen: boolean;
  repairInfo: string;
  repairReason: string;
  repairLabel: string;
  /** Repair and ✕ taps; the GameScene consumes them. */
  repairPressed: boolean;
  repairClosePressed: boolean;
  /** Story 5.9: the Upgrade button (my upgradable building in the open panel), its label and refusal text; its tap. */
  upgradeShown: boolean;
  upgradeLabel: string;
  upgradeReason: string;
  upgradePressed: boolean;
  /** Centered banner text and the scene time (ms) it was shown; empty when none. */
  bannerText: string;
  bannerAtMs: number;
  /** World positions of rushing zombies (x0, y0, x1, y1, …) and how many are valid. */
  readonly rushers: Float32Array;
  rusherCount: number;
  /** Main camera's visible world rectangle and zoom, to turn world positions into screen positions. */
  camX: number;
  camY: number;
  camZoom: number;
  /** Story 2.8: the local player's status line ("" = none), e.g. "Reviving…". */
  statusText: string;
  /** Downed players: (x, y, seconds left) in world metres, and how many are valid. */
  readonly downed: Float32Array;
  downedCount: number;
  /**
   * Story 2.9: the other players (never the local one), `teammateCount` valid entries: drawn world
   * position (x0, y0, x1, y1, …), slot and flags (`TEAMMATE_DOWNED`, `TEAMMATE_OUT`).
   */
  readonly teammates: Float32Array;
  readonly teammateSlot: Int8Array;
  readonly teammateFlags: Uint8Array;
  /** Seconds left on a downed teammate's countdown (same index as `teammateSlot`; 0 when not downed). */
  readonly teammateSecs: Int16Array;
  teammateCount: number;
  /** Name per slot (index = slot), assigned only when it changes. */
  readonly teammateNames: string[];
  /** Story 3.2: my wallet (server truth online). */
  money: number;
  /** My `money.earned` amounts this frame, summed; the HUD pops "+N" and sets it back to 0. */
  moneyGain: number;
  /** Drawn world position the camera follows (my survivor, or the teammate I spectate): the pops rise above it. */
  localX: number;
  localY: number;
  /** Story 4.11: my screen-edge glow alpha (0 = off), from the server's fire hits. */
  burnGlow: number;
  /** Story 5.6: my green screen-edge glow alpha while in acid (0 = off); the larger of the two glows shows. */
  acidGlow: number;
  /** Story 5.8: my light yellow-green screen-edge tint alpha while the Bloater gas slows me (0 = off; the largest glow shows). */
  gasGlow: number;
  /** Story 4.11: fire hits on MY survivor this frame (amounts); the HUD pops "-N" for each and sets the count to 0. */
  readonly fireHitAmounts: Float32Array;
  /** Story 5.4: per hit, the friendly-fire source's slot (its ring colour) or -1. */
  readonly fireHitSource: Int8Array;
  fireHitCount: number;
  /** Story 5.4: the active weapon is a flame weapon (the ammo bar shows fuel); the other slot's too. */
  fuel: boolean;
  otherFuel: boolean;
}

/** Most rush markers shown (the last-5 rule marks 5). */
export const MAX_RUSH_MARKERS = 8;
/** Most downed countdowns shown: one per player. */
export const MAX_DOWNED_MARKERS = MAX_PLAYERS;
/** Story 2.8: the downed countdown's bottom edge sits this far above the survivor's centre (m). */
export const COUNTDOWN_LIFT_M = 0.75;
/** Story 2.9: a teammate's name is centred this far above their centre (m). */
export const NAME_LIFT_M = 0.9;
/** `teammateFlags` bits. */
export const TEAMMATE_DOWNED = 1;
export const TEAMMATE_OUT = 2;

/**
 * Story 5.1: the HUD's upgrade tier mark for a level: its roman numeral (the U1 plate shows it),
 * "" for level I (a clean default: no mark) or anything out of range.
 */
export function hudTierMark(level: number): string {
  return Number.isInteger(level) && level >= 2 && level <= 4 ? (["", "", "II", "III", "IV"][level] as string) : "";
}

export const createHudModel = (): HudModel => ({
  hp: 0,
  maxHp: 1,
  burning: false,
  inAcid: false,
  gearMask: 0, // Story 5.11
  gearIds: [],
  weaponName: "",
  weaponLevel: 1,
  otherWeaponLevel: 1,
  ammo: 0,
  magazine: 0,
  reloadFrac: -1,
  otherWeaponName: "",
  otherAmmo: 0,
  otherMag: 0,
  swapFrac: -1,
  swapPressed: false,
  consumableItem: null, // Story 5.12
  consumableCount: 0,
  consumableVisible: false,
  consumableUsable: false,
  consumablePending: false,
  consumablePressed: false,
  menuPressed: false,
  menuButton: false,
  menuOpen: false,
  toastText: "",
  wave: 0,
  remaining: 0,
  buildSecs: -1,
  readyButton: false,
  readyOn: false,
  readyCount: 0,
  readyTotal: 0,
  readyPressed: false,
  placementActive: false,
  placementHint: "",
  placementValid: true,
  placementLocked: false,
  rotatePressed: false,
  confirmPressed: false,
  cancelPressed: false,
  buildBar: false,
  buildItems: [],
  buildOwned: 0,
  buildCap: 0,
  buildPick: "",
  shopPressed: false,
  tapsEnabled: false,
  worldTap: false,
  worldTapX: 0,
  worldTapY: 0,
  repairOpen: false,
  repairInfo: "",
  repairReason: "",
  repairLabel: "",
  repairPressed: false,
  repairClosePressed: false,
  upgradeShown: false,
  upgradeLabel: "",
  upgradeReason: "",
  upgradePressed: false,
  bannerText: "",
  bannerAtMs: 0,
  rushers: new Float32Array(MAX_RUSH_MARKERS * 2),
  rusherCount: 0,
  camX: 0,
  camY: 0,
  camZoom: 1,
  statusText: "",
  downed: new Float32Array(MAX_DOWNED_MARKERS * 3),
  downedCount: 0,
  teammates: new Float32Array(MAX_PLAYERS * 2),
  teammateSlot: new Int8Array(MAX_PLAYERS),
  teammateFlags: new Uint8Array(MAX_PLAYERS),
  teammateSecs: new Int16Array(MAX_PLAYERS),
  teammateCount: 0,
  teammateNames: new Array<string>(MAX_PLAYERS).fill(""),
  money: 0,
  moneyGain: 0,
  localX: 0,
  localY: 0,
  burnGlow: 0,
  acidGlow: 0,
  gasGlow: 0,
  fireHitAmounts: new Float32Array(FIRE_HIT_QUEUE),
  fireHitSource: new Int8Array(FIRE_HIT_QUEUE).fill(-1),
  fireHitCount: 0,
  fuel: false,
  otherFuel: false,
});

/** Story 5.4: a flame weapon's fuel as a whole percent (the HUD text changes at most 100 times per tank). */
export function fuelPercent(fuelTicks: number, stats: { readonly fuelS: number }): number {
  const full = Math.round(stats.fuelS * 20);
  return full > 0 ? Math.max(0, Math.min(100, Math.ceil((fuelTicks / full) * 100))) : 0;
}
