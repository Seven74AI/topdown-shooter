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
  /**
   * Story 7.12 (BF2): the toast line is a loot find — the bag icon shows left of it and the text takes
   * the finder's slot colour (`toastSlot`, 0–3; −1: white). False / −1 for every other toast.
   */
  toastLoot: boolean;
  toastSlot: number;
  /** Current wave number (0 before wave 1) and zombies remaining (alive + queued). */
  wave: number;
  remaining: number;
  /** Story 3.1: whole seconds left in the build phase, or -1 outside a build. */
  buildSecs: number;
  /** Story 6.12 (AC 12): the team chose Stay: the top line reads "Wave 13 · Endless". */
  endless: boolean;
  /** Story 6.11: the evacuation vote is on (the sticks hide; the top line says so). */
  voting: boolean;
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
  /** Story 5.19: the ghost is pinned (the chip reads "↩ carry" with an orange border). */
  placementPinned: boolean;
  /** Story 5.19: the item chip's text ("Wood barricade · $40 · ×6 left" / "↩ carry · Wood barricade"), cached by the GameScene. */
  placementChip: string;
  /** Story 5.19: the right-thumb drag since the last frame (canvas px) and whether one started or moved; the GameScene consumes them. */
  dragDxPx: number;
  dragDyPx: number;
  dragged: boolean;
  /** Story 5.19: the item chip was tapped (id `placeChip`); the GameScene consumes it. */
  chipPressed: boolean;
  /** Story 5.19: `controls.build.dragStartPx` (CSS px), set by the GameScene for the HUD's drag tracker. */
  dragStartPx: number;
  /** Story 5.19 review M2: a drag gesture began since the last frame (the chain side's net displacement restarts). */
  dragBegan: boolean;
  /** Story 5.19 review L1: a drag is in progress (the pointer crossed `dragStartPx` and is still down): a pinned ghost then doesn't unpin by leaving the view. */
  dragHeld: boolean;
  /** Story 5.23 (AC 10): the mouse wheel turned the held ghost counter-clockwise (wheel up; down sets `rotatePressed`). */
  rotateCcwPressed: boolean;
  /** Story 5.23 (AC 7): the ghost rests faded after a blocked chain (Place and the reason line keep the valid look). */
  placementResting: boolean;
  /** Story 5.19 (main-session decision): the short-screen chip (120 px, short text); set by the HUD's layout. */
  placementChipShort: boolean;
  /** Story 5.19 review L4: Place, ⟳, ✕ and the chip as 4 rects (minX, minY, maxX, maxY in canvas px), set by the HUD's layout. */
  handAvoid: number[];
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
  /** Story 5.20: the Sell / Take back button (my building in the open panel), its label and refusal text; its tap. */
  sellShown: boolean;
  sellLabel: string;
  sellReason: string;
  sellPressed: boolean;
  /**
   * Story 5.21 / 5.22: the action bar's ✥ Move (my building), its label ("Move" / "Moving…") and
   * whether a press picks it up; Repair at full HP ("full HP", dimmed); the one red reason line; its tap.
   */
  moveShown: boolean;
  moveLabel: string;
  moveValid: boolean;
  movePressed: boolean;
  repairFull: boolean;
  barReason: string;
  /** Story 5.22: holding one of my buildings being moved (Place reads "MOVE"). */
  placementMoving: boolean;
  /**
   * Story 5.21 (AC 7, 11): the long-press on the game view — the HUD's detector writes how long the
   * followed press is held (−1 none) and where, and fires once (`longPressFired` at X/Y); the scene
   * writes the threshold and the ring's fill (−1 = no ring: not on my building).
   */
  pressHeldMs: number;
  pressX: number;
  pressY: number;
  longPressFired: boolean;
  longPressX: number;
  longPressY: number;
  longPressMs: number;
  pressRing: number;
  /** Story 5.21 (AC 7, D8): is a building's tap area under canvas (x, y)? (Ready yields to it.) Set by the scene. */
  buildingAt: ((x: number, y: number) => boolean) | null;
  /** Story 5.20: the undo chip ↶ (shown, ring 1 → 0, armed while its placement is pending, holding = the hand cluster's spot); its tap. */
  undoVisible: boolean;
  undoProgress: number;
  undoArmed: boolean;
  undoHolding: boolean;
  undoPressed: boolean;
  /** Story 5.20: "+$N" pops at sold buildings this frame (world m), queued by the GameScene from `building.sold`. */
  readonly soldPopX: Float32Array;
  readonly soldPopY: Float32Array;
  readonly soldPopAmount: Int32Array;
  soldPopCount: number;
  /** Centered banner text and the scene time (ms) it was shown; empty when none. */
  bannerText: string;
  bannerAtMs: number;
  /** Stories 6.6 / 6.7: the banner's colour (CSS; "" = white) and how long it shows (ms; 0 = the default). */
  bannerColor: string;
  bannerShowMs: number;
  /** World positions of rushing zombies (x0, y0, x1, y1, …) and how many are valid. */
  readonly rushers: Float32Array;
  rusherCount: number;
  /**
   * Story 6.5 (D9, AC 13): the boss bar and the boss's edge marker. `bossVisible` while it walks
   * (WALK…ROAR); the marker also shows the warning's entry point. `bossState` = `BOSS_STATE`,
   * `bossX/Y` its world position (the entry during WARNING), `bossAtkKind` the telegraph's kind.
   */
  bossVisible: boolean;
  bossHpFrac: number;
  bossEnraged: boolean;
  bossName: string;
  bossState: number;
  bossX: number;
  bossY: number;
  bossAtkKind: number;
  /** Story 6.6 (D6): stunned after a crash (the bar flashes amber). */
  bossStunned: boolean;
  /** Story 6.7: the bar's opacity (1; empties and fades over 2 s after its death). */
  bossBarAlpha: number;
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
  /**
   * Story 5.24: a teammate's ghost label per slot (index = slot): anchor in world metres (x, y: the
   * label's bottom centre), shown flag, and its text ("Bo · Auto-turret", assigned only when it changes).
   */
  readonly ghostLabelAt: Float32Array;
  readonly ghostLabelShown: Uint8Array;
  readonly ghostLabelText: string[];
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

/** Story 5.20: sold "+$N" pops queued per frame (more in one frame drop the extras). */
export const SOLD_POP_QUEUE = 4;

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
  toastLoot: false,
  toastSlot: -1,
  wave: 0,
  remaining: 0,
  buildSecs: -1,
  endless: false,
  voting: false,
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
  placementPinned: false,
  placementChip: "",
  dragDxPx: 0,
  dragDyPx: 0,
  dragged: false,
  chipPressed: false,
  dragStartPx: 8,
  dragBegan: false,
  dragHeld: false,
  rotateCcwPressed: false,
  placementResting: false,
  placementChipShort: false,
  handAvoid: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
  sellShown: false,
  sellLabel: "",
  sellReason: "",
  sellPressed: false,
  moveShown: false,
  moveLabel: "Move",
  moveValid: false,
  movePressed: false,
  repairFull: false,
  barReason: "",
  placementMoving: false,
  pressHeldMs: -1,
  pressX: 0,
  pressY: 0,
  longPressFired: false,
  longPressX: 0,
  longPressY: 0,
  longPressMs: 450,
  pressRing: -1,
  buildingAt: null,
  undoVisible: false,
  undoProgress: 0,
  undoArmed: false,
  undoHolding: false,
  undoPressed: false,
  soldPopX: new Float32Array(SOLD_POP_QUEUE),
  soldPopY: new Float32Array(SOLD_POP_QUEUE),
  soldPopAmount: new Int32Array(SOLD_POP_QUEUE),
  soldPopCount: 0,
  bannerText: "",
  bannerAtMs: 0,
  bannerColor: "",
  bannerShowMs: 0,
  rushers: new Float32Array(MAX_RUSH_MARKERS * 2),
  rusherCount: 0,
  bossVisible: false, // Story 6.5
  bossHpFrac: 0,
  bossEnraged: false,
  bossName: "THE BEHEMOTH",
  bossState: 0,
  bossX: 0,
  bossY: 0,
  bossAtkKind: 0,
  bossStunned: false,
  bossBarAlpha: 1,
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
  ghostLabelAt: new Float32Array(MAX_PLAYERS * 2),
  ghostLabelShown: new Uint8Array(MAX_PLAYERS),
  ghostLabelText: new Array<string>(MAX_PLAYERS).fill(""),
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

/**
 * The top line (Story 3.1 build countdown; Story 6.11 the vote; Story 6.12 the "Endless" tag):
 * "Wave 4 in 22 s", "Wave 3   ·   Zombies 47", "Wave 13 · Endless · Zombies 300",
 * "Wave 14 · Endless · 22 s", "Wave 10 · Evac vote", "Get ready".
 */
export function waveLine(m: { wave: number; remaining: number; buildSecs: number; endless: boolean; voting: boolean }): string {
  // Story 6.11 / 6.12: the vote and endless lines use single-spaced dots so they fit beside the HP bar at 568 px.
  if (m.voting) return `Wave ${m.wave} · Evac vote`;
  if (m.endless) return m.buildSecs >= 0 ? `Wave ${m.wave + 1} · Endless · ${m.buildSecs} s` : `Wave ${m.wave} · Endless · Zombies ${m.remaining}`;
  if (m.buildSecs >= 0) return `Wave ${m.wave + 1} in ${m.buildSecs} s`;
  return m.wave > 0 ? `Wave ${m.wave}   ·   Zombies ${m.remaining}` : "Get ready";
}
