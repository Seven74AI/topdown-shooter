import { MAX_PLAYERS } from "@topdown/shared";

/** Values the GameScene publishes each frame for the HUD to draw (the HUD never reads the World). */
export interface HudModel {
  hp: number;
  maxHp: number;
  /** Active weapon's display name. */
  weaponName: string;
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
  /** Story 2.11: set by the HUD when ☰ is pressed; the GameScene consumes it. */
  menuPressed: boolean;
  /** ☰ is shown (a run is on screen: not in the loadout picker, not on Results). */
  menuButton: boolean;
  /** The in-run menu is open (the HUD drops held sticks and buttons when it opens). */
  menuOpen: boolean;
  /** Story 2.11: the toast line under the wave text ("Bo left"), "" when none. */
  toastText: string;
  /** Current wave number (0 before wave 1) and zombies remaining (alive + queued). */
  wave: number;
  remaining: number;
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

export const createHudModel = (): HudModel => ({
  hp: 0,
  maxHp: 1,
  weaponName: "",
  ammo: 0,
  magazine: 0,
  reloadFrac: -1,
  otherWeaponName: "",
  otherAmmo: 0,
  otherMag: 0,
  swapFrac: -1,
  swapPressed: false,
  menuPressed: false,
  menuButton: false,
  menuOpen: false,
  toastText: "",
  wave: 0,
  remaining: 0,
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
  teammateCount: 0,
  teammateNames: new Array<string>(MAX_PLAYERS).fill(""),
  money: 0,
  moneyGain: 0,
  localX: 0,
  localY: 0,
});
