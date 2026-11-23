import { MAX_PLAYERS } from "@topdown/shared";
import { FIRE_HIT_QUEUE } from "../render/burnCue";

/** Values the GameScene publishes each frame for the HUD to draw (the HUD never reads the World). */
export interface HudModel {
  hp: number;
  maxHp: number;
  /** Story 4.8: the server reports my survivor burning (the HP text adds "Burning"). */
  burning: boolean;
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
  /** Story 3.4: placement mode is on: touches move the preview, ⟳ ✓ ✕ show, the sticks are off. */
  placementActive: boolean;
  /** The line above ⟳ ✓ ✕ ("Wood barricade · $40", or why it is red) and whether the preview is valid. */
  placementHint: string;
  placementValid: boolean;
  /** A placement touch (down or drag) in canvas px this frame; the GameScene consumes it. */
  placeTap: boolean;
  placeTapX: number;
  placeTapY: number;
  /** ⟳ ✓ ✕ taps; the GameScene consumes them. */
  rotatePressed: boolean;
  confirmPressed: boolean;
  cancelPressed: boolean;
  /** Story 3.3: the Shop button is shown (as Ready, while the shop is closed). */
  shopButton: boolean;
  /** Set by the HUD when Shop is tapped; the GameScene consumes it. */
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
  /** Story 4.11: fire hits on MY survivor this frame (amounts); the HUD pops "-N" for each and sets the count to 0. */
  readonly fireHitAmounts: Float32Array;
  fireHitCount: number;
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
  burning: false,
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
  buildSecs: -1,
  readyButton: false,
  readyOn: false,
  readyCount: 0,
  readyTotal: 0,
  readyPressed: false,
  placementActive: false,
  placementHint: "",
  placementValid: true,
  placeTap: false,
  placeTapX: 0,
  placeTapY: 0,
  rotatePressed: false,
  confirmPressed: false,
  cancelPressed: false,
  shopButton: false,
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
  teammateCount: 0,
  teammateNames: new Array<string>(MAX_PLAYERS).fill(""),
  money: 0,
  moneyGain: 0,
  localX: 0,
  localY: 0,
  burnGlow: 0,
  fireHitAmounts: new Float32Array(FIRE_HIT_QUEUE),
  fireHitCount: 0,
});
