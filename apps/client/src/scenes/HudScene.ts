import * as Phaser from "phaser";
import { dpr, safeArea } from "../display";
import { HudButtons } from "../input/HudButtons";
import { hudPointerDown, hudPointerMove, hudPointerReset, hudPointerUp } from "../input/hudPointer";
import {
  MENU_BUTTON_CSS_PX,
  MENU_BUTTON_INSET_CSS_PX,
  MIN_TEXT_CSS_PX,
  READY_BUTTON_BOTTOM_CSS_PX,
  READY_BUTTON_H_CSS_PX,
  READY_BUTTON_W_CSS_PX,
  REPAIR_BUTTON_W_CSS_PX,
  REPAIR_CLOSE_CSS_PX,
  REPAIR_ROW_GAP_CSS_PX,
  BUILD_COUNT_TEXT_CSS_PX,
  BUILD_PRICE_TEXT_CSS_PX,
  HAND_CHIP_PAD_CSS_PX,
  HAND_CHIP_TEXT_CSS_PX,
  UNDO_GLYPH_CSS_PX,
  UNDO_RING_CSS_PX,
} from "../ui/sizes";
import { layoutUndoChip } from "./undoChip";
import { unlockAudio } from "../audio/placeholderSfx";
import { TAP_SLOP_CSS_PX, TapDetector } from "../input/tapDetector";
import { ThumbDrag, onChipRect } from "../input/thumbDrag";
import { BUTTON_TOLERANCE_PX } from "../input/routePointer";
import { KNOB_RADIUS_CSS_PX, STICK_RADIUS_CSS_PX, type StickTouch, type TouchSticks } from "../input/TouchSticks";
import type { HudModel } from "./hudModel";
import { layoutHandCluster, newHandLayout, type HandRect } from "./handCluster";
import { BUILD_BAR_SLOTS, SLOT_EMPTY, SLOT_MORE, SLOT_SHOP, TILE_SHORT, buildBarSlots, layoutBuildBar, newBuildBarLayout, readyLeftX, tileState, type BuildTile } from "./buildBar";
import { ATLAS_BUILDINGS, FRAME_WOOD, buildingFrame, ensureBuildingsAtlas } from "../render/city/buildingsAtlas";
import { BUILD_ICON_FRAME_H, BUILD_ICON_FRAME_W, BUILD_ICON_ORIGIN_X, BUILD_ICON_ORIGIN_Y, BUILD_ICON_TEXTURE, buildIconFrame, ensureBuildIcons } from "../render/city/buildIcons";
import { drawPlankIcon } from "../render/BuildingView";
import { drawTurretIcon } from "../render/TurretView";
import type { InputRouter } from "../input/InputRouter";
import { mixColor } from "../render/color";
import { edgeArrow } from "../render/edgeArrow";
import { MAX_PLAYERS } from "@topdown/shared";
import { COUNTDOWN_LIFT_M, MAX_DOWNED_MARKERS, MAX_RUSH_MARKERS, NAME_LIFT_M, SOLD_POP_QUEUE, hudTierMark } from "./hudModel";
import { SLOT_COLORS, SLOT_COLOR_CSS } from "../render/playerColors";
import { createTeammateMarkers, teammateMarkers } from "../render/teammateMarkers";
import { pulseAlpha, pulseScale } from "../render/pulse";
import { PerfOverlay } from "../debug/PerfOverlay";
import { FIRE_POP_POOL, FIRE_POP_RISE_PX, PopPool, fireDamageLabel } from "../render/burnCue";
import { ATLAS_FX, FX_EDGE, FX_TIER_MARKS, FX_TIER_SCALE, ensureAtlases } from "../render/city/spriteAtlas";
import { GEAR_ICON_CSS_PX, GEAR_ICON_FRAME_PX, GEAR_ICON_TEXTURE, ensureGearIcons, gearIconFramesFor } from "../render/city/gearIcons";

export interface HudSceneData {
  sticks: TouchSticks;
  model: HudModel;
  /** Pointer events go through the router: touches drive the sticks, the mouse aims and fires. */
  router: InputRouter;
  /** Stick radius in CSS px (STICK_RADIUS_CSS_PX, or the ?tune=1 value). */
  stickRadiusCss: number;
}

/** Health bar size and placement in CSS px (× dpr). */
const HP_BAR_W = 200;
const HP_BAR_H = 16;
const HP_MARGIN = 16;
const HP_TEXT_PX = 14;
const HP_BG = 0x000000;
const HP_HIGH = 0x4caf50;
const HP_LOW = 0xe53935;
/** Story 4.8: the HP line's colour while burning. */
const BURNING_TEXT = "#ffa060";
/** Story 5.6: the HP line's colour and the screen-edge glow while in acid (green, never the fire orange). */
const ACID_TEXT = "#b6ff5a";
const ACID_GLOW_COLOR = 0x7cff28;
/** Story 5.8: the gas slow's edge tint (lighter, yellower than acid: slowed, not hurt). */
const GAS_GLOW_COLOR = 0xd8ec7a;
/**
 * Story 4.11: my "-N" fire-damage pops (small, orange, left of my survivor: the money "+N" pops sit
 * right of it) and the orange screen-edge glow while I burn (four bands, each this fraction of the
 * screen's short side, additive, under every HUD control).
 */
const FIRE_POP_TEXT_PX = 15;
const FIRE_POP_COLOR = "#ff9a3c";
const FIRE_POP_LEFT_M = 0.55;
const FIRE_POP_LIFT_M = 0.35;
const EDGE_GLOW_COLOR = 0xff5a14;
const EDGE_GLOW_BAND = 0.16;
const EDGE_GLOW_DEPTH = -1;
/** Weapon panel (bottom-right), CSS px × dpr. */
const AMMO_TEXT_PX = 18;
const OTHER_TEXT_PX = MIN_TEXT_CSS_PX;
const AMMO_MARGIN = 24;
/** Swap button (FR5): 64 × 64 CSS px, bottom-right, above where the right thumb rests. */
const SWAP_BTN_PX = 64;
const SWAP_BTN_RIGHT = 24;
const SWAP_BTN_BOTTOM = 120;
const RELOAD_BAR_W = 120;
const RELOAD_BAR_H = 6;
/** Story 5.4: the fuel bar of a flame weapon (orange, under the fuel percent). */
const FUEL_BAR_COLOR = 0xff8a2a;
/** Wave panel (top-center) and banner. */
const WAVE_TEXT_PX = 16;
const BANNER_TEXT_PX = 34;
const BANNER_SHOW_MS = 1500;
const BANNER_FADE_MS = 400;
/** Edge arrows for off-screen rushers. */
const ARROW_PX = 14;
const ARROW_MARGIN = 28;
const RUSH_COLOR = 0xff3b30;
/** Story 2.8: downed countdown above each downed survivor, and the local status line. */
const COUNTDOWN_TEXT_PX = 16;
const STATUS_TEXT_PX = 18;
const TEXT_STROKE = "#000000";
const TEXT_STROKE_PX = 4;
/** The same stroke as a number (Graphics outlines). */
const TEXT_STROKE_COLOR = 0x000000;
/** Story 2.9: teammate name tags (CSS px × dpr) and edge arrows. */
const NAME_TEXT_PX = 14;
const NAME_STROKE_PX = 3;
const NAME_STROKE = "#0b0d10";
/** Gap between a downed teammate's countdown and their name, CSS px. */
const NAME_GAP_PX = 2;
const MATE_ARROW_SCALE = 1.3;
/** Wider than the rush arrows' margin, so the two kinds don't overlap at the same edge spot. */
const MATE_ARROW_MARGIN = ARROW_MARGIN + 12;
const MATE_ARROW_OUTLINE_PX = 2;
const MATE_ARROW_OUTLINE = 0xffffff;
/** The downed "+" icon: arm length and thickness (CSS px), and its distance inside the arrow tip. */
const CROSS_PX = 6;
const CROSS_THICK_PX = 2.5;
const CROSS_INSET_PX = 20;
const CROSS_COLOR = 0xffffff;
/** An off-screen DOWNED teammate's arrow is this much bigger (before the pulse), so it can't be missed. */
const MATE_DOWNED_SCALE = 1.5;
/** Their "Bo · 14 s" label: centred this far inward from the arrow tip (CSS px), in this colour. */
const MATE_LABEL_INSET_PX = 62;
const MATE_DOWNED_COLOR = "#ff6b6b";
const NAME_COLOR = "#ffffff";
/** Story 2.11: ☰ (three white bars on a dark square), and the toast line under the status line. */
const MENU_BAR_W_FRAC = 0.5;
const MENU_BAR_H_PX = 3;
const MENU_BAR_GAP_PX = 6;
const MENU_BG = 0x000000;
const MENU_BG_ALPHA = 0.35;
const MENU_RADIUS_PX = 8;
const MENU_BAR_COLOR = 0xffffff;
const TOAST_TEXT_PX = 18;
/** Story 3.1: the Ready button (dark when not Ready, green with ✓ when Ready). */
const READY_TEXT_PX = 20;
const READY_RADIUS_PX = 12;
const READY_BG = 0x000000;
const READY_BG_ALPHA = 0.5;
const READY_ON = 0x2e7d32;
const READY_BORDER = 0xffffff;
const READY_BORDER_PX = 2;
/** Story 3.4 / 5.15: the hand cluster (⟳, Place, ✕: round, bottom right) and the hint line. */
const PLACE_IDS = ["rotate", "confirm", "cancel"] as const;
const PLACE_GLYPHS = ["⟳", "Place", "✕"] as const;
const PLACE_GLYPH_PX = [30, 18, 22] as const;
const PLACE_CONFIRM = 0x2e7d32;
/** Place when the shared check says no: grey with a red ring (a press still sends: the server judges). */
const PLACE_BLOCKED = 0x5a5a5a;
const PLACE_BLOCKED_RING = 0xe53935;
const PLACE_CANCEL = 0x8e2a2a;
/** The 🔒 badge on ⟳ (auto-rotate off): a padlock drawn in Graphics, CSS px. */
const LOCK_BODY_W_PX = 12;
const LOCK_BODY_H_PX = 9;
const LOCK_SHACKLE_R_PX = 4;
const LOCK_COLOR = 0xf5c542;
const HINT_TEXT_PX = 18;
/** Story 5.19: the item chip (ux-spec §4): dark panel, faint white border; orange border when pinned ("↩ carry"). */
const CHIP_BG = 0x000000;
const CHIP_BG_ALPHA = 0.55;
const CHIP_BORDER = 0xffffff;
const CHIP_BORDER_ALPHA = 0.4;
const CHIP_PINNED = 0xffb74d;
const CHIP_RADIUS_PX = 8;
const HINT_VALID = "#ffffff";
const HINT_BLOCKED = "#ff8a80";
/** Story 3.7: the repair panel (Repair's border when it would be accepted, its look when not). */
const REPAIR_OK = 0x4caf50;
const REPAIR_DIM_ALPHA = 0.55;
const REPAIR_INFO_PX = 16;
const REPAIR_REASON = "#ff8a80";
/** Story 5.9: the Upgrade button when it would be accepted (steel blue: a stronger wall). */
const UPGRADE_FILL = 0x37587a;
const UPGRADE_BORDER = 0x90caf9;
/** Story 5.20: the Sell / Take back button (a coin gold) and the undo chip ↶ (dark disc, gold ring draining). */
const SELL_FILL = 0x6b5320;
const SELL_BORDER = 0xf2c94c;
const UNDO_BG = 0x1d232b;
const UNDO_BG_ALPHA = 0.82;
const UNDO_RING = 0xf2c94c;
const UNDO_RING_TRACK = 0x4a5360;
/** The ring is redrawn when its drawn share changes by 1/UNDO_RING_STEPS (not every frame). */
const UNDO_RING_STEPS = 120;
const UNDO_ARMED_ALPHA = 0.6;
/** Story 5.20 (ux-spec §10): "+$N" floats up 0.6 m in 600 ms above a sold building. */
const SOLD_POP_MS = 600;
const SOLD_POP_RISE_M = 0.6;
const SOLD_POP_TEXT_PX = 17;
const SOLD_POP_COLOR = "#f2c94c";
/** Story 3.3: the Shop button's border (the money colour); Story 5.16: the build bar's Shop tile. */
const SHOP_BORDER = 0xf5c542;
/**
 * Story 5.16 (ux-spec §4, prototype): the build bar's tiles. Dark rounded square, white border; the
 * icon centred 22 px from the tile's top in a 42 × 28 px box, the price centred 45 px down; a tile I
 * can't pick (too expensive, or at the cap) at 40 % with a red price when it's the money.
 */
const TILE_IDS = ["tile0", "tile1", "tile2", "tile3", "tile4", "tile5", "tile6", "tile7"] as const;
const TILE_BG_ALPHA = 0.58;
const TILE_BORDER_ALPHA = 0.85;
const TILE_RADIUS_PX = 10;
const TILE_BORDER_PX = 1.5;
const TILE_DIM_ALPHA = 0.4;
const TILE_ICON_Y_PX = 22;
const TILE_ICON_W_PX = 42;
const TILE_ICON_H_PX = 28;
const TILE_PRICE_Y_PX = 45;
const TILE_GLYPH_PX = 20;
const TILE_PRICE = "#ffe082";
const TILE_PRICE_SHORT = "#ff8a80";
const TILE_LABEL = "#ffffff";
const COUNT_OK = "#ffffff";
const COUNT_FULL = "#ff8a80";
/** Wave text → status line → toast line, CSS px from the top inset. */
const WAVE_TOP_PX = 12;
const LINE_GAP_PX = 12;

/** Story 3.2: the wallet line under the HP text, and the "+N" pops above my survivor. */
const MONEY_TEXT_PX = 16;
const MONEY_GAP_PX = 4;
/** A text line's height as a multiple of its font size. */
const LINE_HEIGHT = 1.3;
const MONEY_COLOR = "#ffd54a";
const MONEY_POPS = 6;
const MONEY_POP_TEXT_PX = 16;
const MONEY_POP_MS = 900;
/**
 * How far a pop rises while it fades (CSS px), and where it starts: right of the survivor, near head
 * height (m), so it stays clear of the wave banner above the survivor (32 % of the screen height).
 */
const MONEY_POP_RISE_PX = 22;
const MONEY_POP_RIGHT_M = 0.6;
const MONEY_POP_LIFT_M = 0.2;

/** One pooled "+N": the tween drives `rise` (canvas px) and `alpha`; `update` places the text. */
interface MoneyPop {
  readonly text: Phaser.GameObjects.Text;
  rise: number;
  alpha: number;
  active: boolean;
}

const STICK_FILL = 0xffffff;
const STICK_FILL_ALPHA = 0.12;
const STICK_RING_ALPHA = 0.35;
const KNOB_ALPHA = 0.45;

/**
 * Unzoomed overlay above the GameScene: touch sticks now; health bar, wave text and buttons later.
 * Coordinates are canvas pixels (device pixels, DPR-capped).
 */
export class HudScene extends Phaser.Scene {
  private sticks!: TouchSticks;
  private model!: HudModel;
  private router!: InputRouter;
  private stickRadiusCss = STICK_RADIUS_CSS_PX;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  /** Story 5.11: pooled gear icons beside the HP text (one per gear item; redrawn on a change only). */
  private readonly gearIcons: Phaser.GameObjects.Image[] = [];
  private readonly gearFrames: string[] = [];
  private shownGearMask = -1;
  private shownHp = -1;
  private shownMaxHp = -1;
  private shownBurning = false;
  private shownAcid = false;
  private moveBase!: Phaser.GameObjects.Arc;
  private moveKnob!: Phaser.GameObjects.Arc;
  private aimBase!: Phaser.GameObjects.Arc;
  private aimKnob!: Phaser.GameObjects.Arc;
  private ammoText!: Phaser.GameObjects.Text;
  private otherText!: Phaser.GameObjects.Text;
  /** Story 5.1: "▶ NAME" / "NAME" left of the U1 tier plate; `ammoText` / `otherText` hold the counts. */
  private ammoNameText!: Phaser.GameObjects.Text;
  private otherNameText!: Phaser.GameObjects.Text;
  private ammoMark!: Phaser.GameObjects.Image;
  private otherMark!: Phaser.GameObjects.Image;
  private shownLevel = -1;
  private shownOtherLevel = -1;
  private swapBtn!: Phaser.GameObjects.Arc;
  private swapLabel!: Phaser.GameObjects.Text;
  private menuBtn!: Phaser.GameObjects.Graphics;
  private shownMenuButton: boolean | null = null;
  private shownMenuOpen = false;
  private toastText!: Phaser.GameObjects.Text;
  private shownToast = "";
  /** Story 3.1: the Ready button (a Graphics redrawn on change only) and its label. */
  private readyBtn!: Phaser.GameObjects.Graphics;
  private readyLabel!: Phaser.GameObjects.Text;
  private shownReadyVisible: boolean | null = null;
  /** `readyOn`, count and total folded into one key (redraw only when it changes). */
  private shownReadyKey = -1;
  /**
   * Story 5.16: the build bar (8 tiles: background, icon image or Graphics, price/label, glyph) and
   * its count line. Slots and looks are redrawn only when the items, the page or the state key change.
   */
  private barTiles: Phaser.GameObjects.Graphics[] = [];
  private barIcons: Phaser.GameObjects.Image[] = [];
  private barIconGfx: Phaser.GameObjects.Graphics[] = [];
  private barPrices: Phaser.GameObjects.Text[] = [];
  private barGlyphs: Phaser.GameObjects.Text[] = [];
  private barCount!: Phaser.GameObjects.Text;
  private readonly bar = newBuildBarLayout();
  private readonly barSlots = new Int16Array(BUILD_BAR_SLOTS);
  private barPage = 0;
  private barSlotsDirty = true;
  private shownBarVisible: boolean | null = null;
  private shownBarItems: readonly BuildTile[] | null = null;
  private shownBarKey = -1;
  private shownBuildSecs = -2;
  private buttons = new HudButtons();
  /** Story 3.4: placement mode's ⟳ ✓ ✕ and the hint line; Story 5.15: the hand cluster, the 🔒 badge. */
  private readonly placeBtns: Phaser.GameObjects.Graphics[] = [];
  private readonly placeGlyphs: Phaser.GameObjects.Text[] = [];
  private placeHint!: Phaser.GameObjects.Text;
  private placeLock!: Phaser.GameObjects.Graphics;
  private readonly hand = newHandLayout();
  private shownPlacement: boolean | null = null;
  private shownPlaceValid: boolean | null = null;
  private shownLocked: boolean | null = null;
  /** Story 5.15: the weapon lines are hidden while holding (they sit under the hand cluster). */
  private shownWeaponHidden = false;
  private shownHint = "";
  private shownHintValid: boolean | null = null;
  /**
   * Story 5.15: a right-half touch (or a mouse press) while holding that missed the buttons is
   * claimed; Story 5.19: it drags (pins and nudges) the ghost once it travels past `dragStartPx`.
   */
  private readonly drag = new ThumbDrag();
  private readonly dragOut = { dx: 0, dy: 0, began: false };
  /** Story 5.19: the item chip (panel, text) and what it last showed. */
  private placeChip!: Phaser.GameObjects.Graphics;
  private placeChipText!: Phaser.GameObjects.Text;
  private shownChip = "";
  private shownChipPinned: boolean | null = null;
  /** Story 3.7: the repair panel (info line, reason line, Repair, ✕) and the tap detector. */
  private repairBtn!: Phaser.GameObjects.Graphics;
  private repairText!: Phaser.GameObjects.Text;
  private repairCloseBtn!: Phaser.GameObjects.Graphics;
  private repairCloseGlyph!: Phaser.GameObjects.Text;
  private repairInfo!: Phaser.GameObjects.Text;
  private repairReason!: Phaser.GameObjects.Text;
  private shownRepairOpen: boolean | null = null;
  private shownRepairInfo = "";
  private shownRepairReason = "";
  private shownRepairLabel = "";
  /** -1 = not drawn yet, 0 = dimmed, 1 = valid. */
  private shownRepairValid = -1;
  /** Story 5.9: the Upgrade button one row above Repair, its refusal text to its left. */
  private upgradeBtn!: Phaser.GameObjects.Graphics;
  private upgradeText!: Phaser.GameObjects.Text;
  private upgradeReason!: Phaser.GameObjects.Text;
  private shownUpgradeShown: boolean | null = null;
  private shownUpgradeLabel = "";
  private shownUpgradeReason = "";
  private shownUpgradeValid = -1;
  /** Story 5.20: Sell / Take back, right of Upgrade on its row; its refusal text above it. */
  private sellBtn!: Phaser.GameObjects.Graphics;
  private sellText!: Phaser.GameObjects.Text;
  private sellReasonText!: Phaser.GameObjects.Text;
  private shownSellShown: boolean | null = null;
  private shownSellLabel = "";
  private shownSellReason = "";
  private shownSellValid = -1;
  /** Story 5.20: the undo chip ↶ (a disc, its glyph, the draining ring); its layout follows the hand / bar state. */
  private undoBg!: Phaser.GameObjects.Graphics;
  private undoRing!: Phaser.GameObjects.Graphics;
  private undoGlyph!: Phaser.GameObjects.Text;
  private readonly undoRect = { x: 0, y: 0, size: 0 };
  private shownUndoVisible: boolean | null = null;
  private shownUndoHolding: boolean | null = null;
  private shownUndoStep = -1;
  private shownUndoArmed: boolean | null = null;
  /** Story 5.20: sold "+$N" pops (pooled texts at world positions). */
  private readonly soldPops: Phaser.GameObjects.Text[] = [];
  private readonly soldPool = new PopPool(SOLD_POP_QUEUE, SOLD_POP_MS);
  private readonly soldX = new Float32Array(SOLD_POP_QUEUE);
  private readonly soldY = new Float32Array(SOLD_POP_QUEUE);
  private readonly taps = new TapDetector();
  /** Safe-area insets (CSS px), measured on create and resize only (getComputedStyle is costly). */
  private insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private shownSwapVisible: boolean | null = null;
  private shownOther = "";
  private shownOtherAmmo = Number.NaN;
  private shownSwapStep = Number.NaN;
  private reloadBar!: Phaser.GameObjects.Graphics;
  private waveText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private readonly arrows: Phaser.GameObjects.Triangle[] = [];
  private readonly arrowOut = { x: 0, y: 0, angle: 0 };
  /** dpr() when the arrows were built; they are rescaled on resize. */
  private arrowDpr = 1;
  private shownWave = -1;
  private shownRemaining = -1;
  private shownBanner = "";
  private shownWeapon = "";
  private shownAmmo = Number.NaN;
  private shownMag = Number.NaN;
  private shownReloadStep = Number.NaN;
  private shownW = 0;
  private shownH = 0;
  private perfOverlay: PerfOverlay | null = null;
  private readonly countdowns: Phaser.GameObjects.Text[] = [];
  /** Seconds each countdown text shows (setText only when it changes). */
  private readonly shownSecs = new Int32Array(MAX_DOWNED_MARKERS).fill(-1);
  private statusText!: Phaser.GameObjects.Text;
  private shownStatus = "";
  /** Story 2.9, all indexed by slot: name tags, edge arrows and downed crosses, created once. */
  private readonly names: Phaser.GameObjects.Text[] = [];
  private readonly shownNames: string[] = new Array<string>(MAX_PLAYERS).fill("");
  /** Name tags currently in the downed colour (the off-screen "Bo · 14 s" label), by slot. */
  private readonly redNames: boolean[] = new Array<boolean>(MAX_PLAYERS).fill(false);
  private readonly mateArrows: Phaser.GameObjects.Triangle[] = [];
  private readonly crosses: Phaser.GameObjects.Graphics[] = [];
  /** Preallocated `teammateMarkers` output. */
  private readonly markers = createTeammateMarkers();
  private moneyText!: Phaser.GameObjects.Text;
  private shownMoney = -1;
  private readonly moneyPops: MoneyPop[] = [];
  private nextMoneyPop = 0;
  /** Story 4.11: "-N" pops (pooled texts + their clocks) and the edge-glow bands (top, bottom, left, right). */
  private readonly firePops: Phaser.GameObjects.Text[] = [];
  private readonly firePool = new PopPool(FIRE_POP_POOL);
  private readonly edgeGlow: Phaser.GameObjects.Image[] = [];

  constructor() {
    super("Hud");
  }

  init(data: HudSceneData): void {
    this.sticks = data.sticks;
    this.model = data.model;
    this.router = data.router;
    this.stickRadiusCss = data.stickRadiusCss;
    this.shownHp = -1;
    this.shownMaxHp = -1;
    this.shownBurning = false;
    this.shownAcid = false;
    this.shownWeapon = "";
    this.shownLevel = -1; // Story 5.1
    this.shownOtherLevel = -1;
    this.shownWave = -1;
    this.shownBanner = "";
    this.shownStatus = "";
    this.shownSecs.fill(-1);
    this.shownNames.fill("");
    this.shownMenuButton = null;
    this.shownMenuOpen = false;
    this.shownToast = "";
    this.shownReadyVisible = null;
    this.shownReadyKey = -1;
    this.shownBarVisible = null; // Story 5.16
    this.shownBarItems = null;
    this.shownBarKey = -1;
    this.barSlotsDirty = true;
    this.barPage = 0;
    this.shownBuildSecs = -2;
    this.shownMoney = -1;
    this.nextMoneyPop = 0;
    this.shownPlacement = null;
    this.shownPlaceValid = null;
    this.shownLocked = null;
    this.shownWeaponHidden = false;
    this.shownHint = "";
    this.shownHintValid = null;
    this.drag.reset();
    this.shownChip = "";
    this.shownChipPinned = null;
    this.shownRepairOpen = null;
    this.shownRepairInfo = "";
    this.shownRepairReason = "";
    this.shownRepairLabel = "";
    this.shownRepairValid = -1;
    this.shownUpgradeShown = null;
    this.shownUpgradeLabel = "";
    this.shownUpgradeReason = "";
    this.shownUpgradeValid = -1;
    this.shownSellShown = null;
    this.shownSellLabel = "";
    this.shownSellReason = "";
    this.shownSellValid = -1;
    this.shownUndoVisible = null;
    this.shownUndoHolding = null;
    this.shownUndoStep = -1;
    this.shownUndoArmed = null;
    this.taps.reset();
  }

  create(): void {
    const r = this.stickRadiusCss * dpr();
    this.sticks.setRadius(r);
    this.moveBase = this.add
      .circle(0, 0, r, STICK_FILL, STICK_FILL_ALPHA)
      .setStrokeStyle(2 * dpr(), STICK_FILL, STICK_RING_ALPHA)
      .setVisible(false);
    this.moveKnob = this.add.circle(0, 0, KNOB_RADIUS_CSS_PX * dpr(), STICK_FILL, KNOB_ALPHA).setVisible(false);
    this.aimBase = this.add
      .circle(0, 0, r, STICK_FILL, STICK_FILL_ALPHA)
      .setStrokeStyle(2 * dpr(), STICK_FILL, STICK_RING_ALPHA)
      .setVisible(false);
    this.aimKnob = this.add.circle(0, 0, KNOB_RADIUS_CSS_PX * dpr(), STICK_FILL, KNOB_ALPHA).setVisible(false);
    this.ammoText = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(AMMO_TEXT_PX * dpr())}px`, color: "#ffffff" })
      .setOrigin(1, 1);
    this.otherText = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(OTHER_TEXT_PX * dpr())}px`, color: "#9aa0a6" })
      .setOrigin(1, 1);
    this.ammoNameText = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(AMMO_TEXT_PX * dpr())}px`, color: "#ffffff" })
      .setOrigin(1, 1);
    this.otherNameText = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(OTHER_TEXT_PX * dpr())}px`, color: "#9aa0a6" })
      .setOrigin(1, 1);
    // Story 5.1: the U1 plates come from the FX atlas (ensured above for the edge glow); hidden at level I.
    this.ammoMark = this.add.image(0, 0, ATLAS_FX, FX_TIER_MARKS[2]).setOrigin(1, 0.5).setVisible(false);
    this.otherMark = this.add.image(0, 0, ATLAS_FX, FX_TIER_MARKS[2]).setOrigin(1, 0.5).setVisible(false);
    this.swapBtn = this.add
      .circle(0, 0, (SWAP_BTN_PX / 2) * dpr(), 0xffffff, 0.14)
      .setStrokeStyle(2 * dpr(), 0xffffff, 0.5)
      .setVisible(false);
    this.swapLabel = this.add
      .text(0, 0, "⇄", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(28 * dpr())}px`, color: "#ffffff" })
      .setOrigin(0.5)
      .setVisible(false);
    this.buttons = new HudButtons();
    this.insets = { ...safeArea() };
    this.shownSwapVisible = null;
    this.buttons.set({ id: "swap", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.swapPressed = true;
    });
    // Story 2.11: ☰ top-right, away from both thumbs (the sticks live in the lower halves).
    this.menuBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.buttons.set({ id: "menu", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.menuPressed = true;
    });
    // Story 3.1: Ready, bottom centre (a touch on it never starts a stick). Story 5.16: Shop is a build-bar tile.
    this.readyBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.readyLabel = this.add.text(0, 0, "", this.outlinedStyle(READY_TEXT_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.buttons.set({ id: "ready", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.readyPressed = true;
    });
    // Story 3.4: placement mode's buttons and its hint line; Story 5.15: the hand cluster at the bottom right.
    this.placeBtns.length = 0;
    this.placeGlyphs.length = 0;
    PLACE_IDS.forEach((id, i) => {
      this.placeBtns.push(this.add.graphics().setDepth(1001).setVisible(false));
      this.placeGlyphs.push(this.add.text(0, 0, PLACE_GLYPHS[i] ?? "", this.outlinedStyle(PLACE_GLYPH_PX[i] ?? 30)).setOrigin(0.5).setDepth(1002).setVisible(false));
      this.buttons.set({ id, x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
        if (id === "rotate") this.model.rotatePressed = true;
        else if (id === "confirm") this.model.confirmPressed = true;
        else this.model.cancelPressed = true;
      });
    });
    this.placeHint = this.add.text(0, 0, "", this.outlinedStyle(HINT_TEXT_PX)).setOrigin(1, 1).setDepth(1002).setVisible(false);
    this.placeLock = this.add.graphics().setDepth(1003).setVisible(false);
    // Story 5.19: the item chip (tap = carry a pinned ghost again).
    this.placeChip = this.add.graphics().setDepth(1001).setVisible(false);
    this.placeChipText = this.add.text(0, 0, "", this.outlinedStyle(HAND_CHIP_TEXT_CSS_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    // Story 5.16: the build bar (bottom right, hands empty in a build phase; a touch on a tile never
    // starts a stick). Story 5.26: the icons come from the build icon atlas; a type without one falls
    // back to the buildings atlas (world art). Both are registered through addGeneratedTexture.
    ensureBuildingsAtlas(this);
    ensureBuildIcons(this);
    this.barTiles.length = 0;
    this.barIcons.length = 0;
    this.barIconGfx.length = 0;
    this.barPrices.length = 0;
    this.barGlyphs.length = 0;
    for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
      this.barTiles.push(this.add.graphics().setDepth(1001).setVisible(false));
      this.barIcons.push(this.add.image(0, 0, ATLAS_BUILDINGS, FRAME_WOOD).setDepth(1002).setVisible(false));
      this.barIconGfx.push(this.add.graphics().setDepth(1002).setVisible(false));
      this.barGlyphs.push(this.add.text(0, 0, "", this.outlinedStyle(TILE_GLYPH_PX)).setOrigin(0.5).setDepth(1002).setVisible(false));
      this.barPrices.push(this.add.text(0, 0, "", { ...this.outlinedStyle(BUILD_PRICE_TEXT_CSS_PX), fontStyle: "bold" }).setOrigin(0.5).setDepth(1002).setVisible(false));
      this.buttons.set({ id: TILE_IDS[s] as string, x: 0, y: 0, w: 0, h: 0, visible: false }, () => this.pressTile(s));
    }
    this.barCount = this.add.text(0, 0, "", { ...this.outlinedStyle(BUILD_COUNT_TEXT_CSS_PX), fontStyle: "bold" }).setOrigin(1, 1).setDepth(1002).setVisible(false);
    // Story 3.7: the repair panel (one row above Ready; a touch on its buttons never starts a stick).
    this.repairBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.repairText = this.add.text(0, 0, "", this.outlinedStyle(READY_TEXT_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.repairCloseBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.repairCloseGlyph = this.add.text(0, 0, "✕", this.outlinedStyle(READY_TEXT_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.repairInfo = this.add.text(0, 0, "", this.outlinedStyle(REPAIR_INFO_PX)).setOrigin(0, 0.5).setDepth(1002).setVisible(false);
    this.repairReason = this.add
      .text(0, 0, "", { ...this.outlinedStyle(REPAIR_INFO_PX), color: REPAIR_REASON })
      .setOrigin(0, 1)
      .setDepth(1002)
      .setVisible(false);
    this.buttons.set({ id: "repair", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.repairPressed = true;
    });
    this.buttons.set({ id: "repairClose", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.repairClosePressed = true;
    });
    // Story 5.9: Upgrade (my own upgradable buildings only).
    this.upgradeBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.upgradeText = this.add.text(0, 0, "", this.outlinedStyle(READY_TEXT_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.upgradeReason = this.add
      .text(0, 0, "", { ...this.outlinedStyle(REPAIR_INFO_PX), color: REPAIR_REASON })
      .setOrigin(1, 0.5)
      .setDepth(1002)
      .setVisible(false);
    this.buttons.set({ id: "upgrade", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.upgradePressed = true;
    });
    // Story 5.20: Sell / Take back (my own buildings only) and the undo chip ↶.
    this.sellBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.sellText = this.add.text(0, 0, "", this.outlinedStyle(READY_TEXT_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.sellReasonText = this.add
      .text(0, 0, "", { ...this.outlinedStyle(REPAIR_INFO_PX), color: REPAIR_REASON })
      .setOrigin(1, 0.5)
      .setDepth(1002)
      .setVisible(false);
    this.buttons.set({ id: "sell", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.sellPressed = true;
    });
    this.undoBg = this.add.graphics().setDepth(1001).setVisible(false);
    this.undoRing = this.add.graphics().setDepth(1002).setVisible(false);
    this.undoGlyph = this.add.text(0, 0, "↶", this.outlinedStyle(UNDO_GLYPH_CSS_PX)).setOrigin(0.5).setDepth(1003).setVisible(false);
    this.buttons.set({ id: "undo", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.undoPressed = true;
    });
    this.layoutButtons();
    this.reloadBar = this.add.graphics();
    this.waveText = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(WAVE_TEXT_PX * dpr())}px`, color: "#ffffff", align: "center" })
      .setOrigin(0.5, 0);
    this.bannerText = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(BANNER_TEXT_PX * dpr())}px`, color: "#ffffff", fontStyle: "bold", align: "center" }) // Story 4.5: a second line (the decay stage)
      .setOrigin(0.5)
      .setVisible(false);
    this.arrows.length = 0;
    this.arrowDpr = dpr();
    for (let i = 0; i < MAX_RUSH_MARKERS; i++) {
      const a = ARROW_PX * this.arrowDpr;
      // Triangle pointing +x; rotated toward the target.
      // Display origin (0, 0): the points are relative to the position, so the arrow is centred on
      // it and rotates about it (the default origin is half the bounding box, which shifted it).
      this.arrows.push(this.add.triangle(0, 0, a, 0, -a * 0.6, -a * 0.7, -a * 0.6, a * 0.7, RUSH_COLOR).setDisplayOrigin(0, 0).setVisible(false));
    }
    this.countdowns.length = 0;
    for (let i = 0; i < MAX_DOWNED_MARKERS; i++) {
      this.countdowns.push(
        this.add
          .text(0, 0, "", this.outlinedStyle(COUNTDOWN_TEXT_PX))
          .setOrigin(0.5, 1)
          .setVisible(false),
      );
    }
    this.statusText = this.add.text(0, 0, "", this.outlinedStyle(STATUS_TEXT_PX)).setOrigin(0.5, 0).setVisible(false);
    this.toastText = this.add.text(0, 0, "", this.outlinedStyle(TOAST_TEXT_PX)).setOrigin(0.5, 0).setVisible(false);
    this.names.length = 0;
    this.mateArrows.length = 0;
    this.crosses.length = 0;
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      this.names.push(this.add.text(0, 0, "", this.nameStyle()).setOrigin(0.5).setVisible(false));
      const a = ARROW_PX * MATE_ARROW_SCALE * this.arrowDpr;
      this.mateArrows.push(
        this.add
          .triangle(0, 0, a, 0, -a * 0.6, -a * 0.7, -a * 0.6, a * 0.7, SLOT_COLORS[slot] ?? SLOT_COLORS[0])
          .setStrokeStyle(MATE_ARROW_OUTLINE_PX * this.arrowDpr, MATE_ARROW_OUTLINE, 1)
          .setDisplayOrigin(0, 0)
          .setVisible(false),
      );
      this.crosses.push(this.drawCross(this.add.graphics().setVisible(false)));
    }
    this.hpBar = this.add.graphics();
    this.perfOverlay = new PerfOverlay(this); // Story 1.11 (top-right, toggled by ?debug=1 / three-finger tap)
    this.hpText = this.add.text(0, 0, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(HP_TEXT_PX * dpr())}px`,
      color: "#ffffff",
    });
    // Story 3.2: wallet and "+N" pops (Phaser reuses this scene: the old objects died at shutdown).
    this.moneyText = this.add.text(0, 0, "", this.moneyStyle(MONEY_TEXT_PX)).setVisible(false);
    this.moneyPops.length = 0;
    for (let i = 0; i < MONEY_POPS; i++) {
      const text = this.add.text(0, 0, "", this.moneyStyle(MONEY_POP_TEXT_PX)).setOrigin(0, 1).setVisible(false);
      this.moneyPops.push({ text, rise: 0, alpha: 0, active: false });
    }
    this.model.moneyGain = 0;
    // Story 4.11: fire pops and the burning edge glow (Phaser reuses this scene: rebuilt here).
    this.firePops.length = 0;
    this.firePool.clear();
    for (let i = 0; i < FIRE_POP_POOL; i++) this.firePops.push(this.add.text(0, 0, "", this.firePopStyle()).setOrigin(1, 1).setVisible(false));
    this.model.fireHitCount = 0;
    // Story 5.20: sold "+$N" pops (rebuilt with the scene).
    this.soldPops.length = 0;
    this.soldPool.clear();
    for (let i = 0; i < SOLD_POP_QUEUE; i++) this.soldPops.push(this.add.text(0, 0, "", this.soldPopStyle()).setOrigin(0.5, 1).setDepth(1003).setVisible(false));
    this.model.soldPopCount = 0;
    ensureAtlases(this);
    // Story 5.11: gear icons (Phaser reuses this scene: rebuilt here, shown on the next HP redraw).
    ensureGearIcons(this);
    this.gearIcons.length = 0;
    for (let i = 0; i < 8; i++) this.gearIcons.push(this.add.image(0, 0, GEAR_ICON_TEXTURE).setOrigin(0, 0.5).setVisible(false));
    this.shownGearMask = -1;
    this.edgeGlow.length = 0;
    for (let i = 0; i < 4; i++) {
      this.edgeGlow.push(
        this.add
          .image(0, 0, ATLAS_FX, FX_EDGE)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(EDGE_GLOW_COLOR)
          .setRotation([0, Math.PI, -Math.PI / 2, Math.PI / 2][i] as number)
          .setDepth(EDGE_GLOW_DEPTH)
          .setVisible(false),
      );
    }

    // Buttons first (readiness fix U1): a touch that starts on a HUD button never spawns a stick.
    // Story 5.15: while I hold a building, a left-half touch is the move stick as usual (I keep
    // walking); a right-half touch or a mouse press that misses the HUD buttons is claimed and does
    // nothing (no aim stick, no fire: the right half belongs to the build cluster; BX-5 drags with it).
    const down = (p: Phaser.Input.Pointer) => {
      unlockAudio(); // iOS: audio starts only after a user gesture
      if (this.model.placementActive) {
        // Story 5.19 review M1: the chip is hit-tested first and is no HudButton (those press on
        // touch-down): a chip touch is claimed by the drag, a tap only if it lifts within dragStartPx.
        if (onChipRect(p.x, p.y, this.hand.chip, BUTTON_TOLERANCE_PX)) this.drag.down(p.id, p.x, p.y, true);
        else if (p.wasTouch && p.x < this.scale.width / 2) hudPointerDown(this.buttons, this.router, p, this.scale.width);
        else if (this.buttons.pointerDown(p.id, p.x, p.y, this.scale.width).kind !== "button") this.drag.down(p.id, p.x, p.y); // Story 5.19
        return;
      }
      hudPointerDown(this.buttons, this.router, p, this.scale.width);
      // Story 3.7: the tap detector only watches (the stick or the mouse fire already started as usual).
      this.taps.down(p.id, p.x, p.y, this.time.now, !this.buttons.owns(p.id));
    };
    const move = (p: Phaser.Input.Pointer) => {
      if (p.id === this.drag.pointerId) this.dragMove(p.id, p.x, p.y); // Story 5.19
      this.taps.move(p.id, p.x, p.y, TAP_SLOP_CSS_PX * dpr());
      hudPointerMove(this.buttons, this.router, p);
    };
    const up = (p: Phaser.Input.Pointer) => {
      unlockAudio(); // touchend is the activation event on iOS/Chrome; touchstart alone may not unlock
      if (p.id === this.drag.pointerId) {
        this.dragMove(p.id, p.x, p.y); // the last bit of movement before the lift
        if (this.drag.up(p.id)) this.model.chipPressed = true; // review M1: a chip tap = lifted within dragStartPx
        this.model.dragHeld = false;
      }
      if (this.taps.up(p.id, p.x, p.y, this.time.now, TAP_SLOP_CSS_PX * dpr()) && this.model.tapsEnabled) {
        const m = this.model;
        m.worldTap = true;
        m.worldTapX = this.taps.tapX;
        m.worldTapY = this.taps.tapY;
      }
      hudPointerUp(this.buttons, this.router, p);
    };
    const reset = () => {
      hudPointerReset(this.buttons, this.router);
      this.taps.reset();
      this.drag.reset();
      this.model.dragHeld = false;
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, down);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, move);
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
    this.game.events.on(Phaser.Core.Events.BLUR, reset);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, down);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, move);
      this.input.off(Phaser.Input.Events.POINTER_UP, up);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
      this.game.events.off(Phaser.Core.Events.BLUR, reset);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.sticks.reset();
      this.buttons.reset();
    });
  }

  /** Story 5.19: the claimed pointer moved: past `dragStartPx` it is a drag; the movement goes to the GameScene (canvas px). */
  private dragMove(id: number, x: number, y: number): void {
    const m = this.model;
    this.drag.move(id, x, y, m.dragStartPx * dpr());
    m.dragHeld = this.drag.dragging; // re-review: only a real drag (crossed dragStartPx) holds off the view unpin
    if (!this.drag.take(this.dragOut)) return;
    m.dragDxPx += this.dragOut.dx;
    m.dragDyPx += this.dragOut.dy;
    m.dragged = true;
    if (this.dragOut.began) m.dragBegan = true; // review M2: a new gesture
  }

  /** White text with a dark outline, readable over the street at any zoom (Story 2.8). */
  private outlinedStyle(cssPx: number): Phaser.Types.GameObjects.Text.TextStyle {
    const k = dpr();
    return {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(cssPx * k)}px`,
      color: "#ffffff",
      fontStyle: "bold",
      stroke: TEXT_STROKE,
      strokeThickness: Math.round(TEXT_STROKE_PX * k),
    };
  }

  /** Story 3.2: bold gold text with a dark stroke (wallet line and "+N"). */
  private moneyStyle(cssPx: number): Phaser.Types.GameObjects.Text.TextStyle {
    const k = dpr();
    return {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(cssPx * k)}px`,
      color: MONEY_COLOR,
      fontStyle: "bold",
      stroke: TEXT_STROKE,
      strokeThickness: Math.round(TEXT_STROKE_PX * k * 0.75),
    };
  }

  /** Story 4.11: the small orange "-N" (bold, dark stroke). */
  private firePopStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    const k = dpr();
    return {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(FIRE_POP_TEXT_PX * k)}px`,
      color: FIRE_POP_COLOR,
      fontStyle: "bold",
      stroke: TEXT_STROKE,
      strokeThickness: Math.round(TEXT_STROKE_PX * k * 0.75),
    };
  }

  /**
   * Story 4.11: my burning cues on the HUD — a "-N" per fire hit the GameScene queued (server events
   * only), rising and fading beside my survivor, and the pulsing orange screen-edge glow.
   */
  private drawBurn(): void {
    const m = this.model;
    const now = this.time.now;
    for (let i = 0; i < m.fireHitCount; i++) {
      const slot = this.firePool.spawn(now, m.fireHitAmounts[i] as number);
      // Story 5.4: a teammate's flame shows its "-N" in their ring colour (who hurt you).
      const src = m.fireHitSource[i] as number;
      (this.firePops[slot] as Phaser.GameObjects.Text).setText(fireDamageLabel(m.fireHitAmounts[i] as number)).setColor(src >= 0 ? (SLOT_COLOR_CSS[src] ?? FIRE_POP_COLOR) : FIRE_POP_COLOR);
    }
    m.fireHitCount = 0;
    const k = dpr();
    const sx = (m.localX - FIRE_POP_LEFT_M - m.camX) * m.camZoom;
    const sy = (m.localY - FIRE_POP_LIFT_M - m.camY) * m.camZoom;
    for (let i = 0; i < this.firePops.length; i++) {
      const t = this.firePops[i] as Phaser.GameObjects.Text;
      if (!this.firePool.alive(i, now)) {
        if (t.visible) t.setVisible(false);
        continue;
      }
      const p = this.firePool.progress(i, now);
      t.setPosition(sx, sy - p * FIRE_POP_RISE_PX * k).setAlpha(1 - p * p).setVisible(true);
    }
    const acid = m.acidGlow > m.burnGlow; // Story 5.6: green for acid, orange for fire
    const hurt = acid ? m.acidGlow : m.burnGlow;
    const gas = m.gasGlow > hurt; // Story 5.8: a light yellow-green while the gas slows me (hurt cues win)
    const a = gas ? m.gasGlow : hurt;
    // review fix L2: indexed access (no array destructuring / iterator per frame)
    const glow = this.edgeGlow;
    const top = glow[0] as Phaser.GameObjects.Image;
    const bottom = glow[1] as Phaser.GameObjects.Image;
    const left = glow[2] as Phaser.GameObjects.Image;
    const right = glow[3] as Phaser.GameObjects.Image;
    if (a <= 0) {
      if (top.visible) for (let i = 0; i < glow.length; i++) (glow[i] as Phaser.GameObjects.Image).setVisible(false);
      return;
    }
    const w = this.scale.width;
    const h = this.scale.height;
    const band = Math.min(w, h) * EDGE_GLOW_BAND;
    top.setPosition(w / 2, band / 2).setDisplaySize(w, band);
    bottom.setPosition(w / 2, h - band / 2).setDisplaySize(w, band);
    left.setPosition(band / 2, h / 2).setDisplaySize(h, band);
    right.setPosition(w - band / 2, h / 2).setDisplaySize(h, band);
    const tint = gas ? GAS_GLOW_COLOR : acid ? ACID_GLOW_COLOR : EDGE_GLOW_COLOR;
    for (let i = 0; i < glow.length; i++) (glow[i] as Phaser.GameObjects.Image).setAlpha(a).setTint(tint).setVisible(true);
  }

  /** Story 2.9: bold white name tag with a dark stroke. */
  private nameStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    const k = dpr();
    return {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(NAME_TEXT_PX * k)}px`,
      color: "#ffffff",
      fontStyle: "bold",
      stroke: NAME_STROKE,
      strokeThickness: Math.round(NAME_STROKE_PX * k),
    };
  }

  /** The downed "+" icon around the Graphics' own origin, at the arrows' build scale (moved, never redrawn per frame). */
  private drawCross(g: Phaser.GameObjects.Graphics): Phaser.GameObjects.Graphics {
    const k = this.arrowDpr;
    const arm = CROSS_PX * k;
    const t = CROSS_THICK_PX * k;
    g.clear();
    g.fillStyle(CROSS_COLOR, 1).fillRect(-arm, -t / 2, arm * 2, t).fillRect(-t / 2, -arm, t, arm * 2);
    return g;
  }

  /** Places HUD buttons inside the safe area (canvas px) and registers their hit rects. */
  private layoutButtons(): void {
    const k = dpr();
    const safe = this.insets;
    const size = SWAP_BTN_PX * k;
    const x = this.scale.width - (SWAP_BTN_RIGHT + safe.right) * k - size;
    const y = this.scale.height - (SWAP_BTN_BOTTOM + safe.bottom) * k - size;
    const rect = this.buttons.get("swap");
    if (rect) Object.assign(rect, { x, y, w: size, h: size });
    this.swapBtn.setRadius(size / 2).setPosition(x + size / 2, y + size / 2);
    this.swapLabel.setFontSize(Math.round(28 * k)).setPosition(x + size / 2, y + size / 2);
    this.layoutMenuButton();
    this.layoutBuildBar(); // Story 5.16: before Ready (Ready keeps clear of the grid)
    this.layoutReadyButton();
    this.layoutPlacementButtons();
    this.layoutRepairPanel();
    this.layoutUndo(); // Story 5.20: after the build bar and the hand cluster (it sits by both)
  }

  /** Story 5.20 (D4): ↶ above the build bar's top-left (`layoutUndoChip`), the bar's or the hand's spot. */
  private layoutUndo(): void {
    const k = dpr();
    const l = layoutUndoChip(this.scale.width, this.scale.height, this.insets.right, this.insets.bottom, this.bar.left, this.bar.top, this.bar.countX, k, this.model.undoHolding, this.undoRect);
    const rect = this.buttons.get("undo");
    if (rect) Object.assign(rect, { x: l.x, y: l.y, w: l.size, h: l.size });
    const g = this.undoBg;
    g.clear();
    g.fillStyle(UNDO_BG, UNDO_BG_ALPHA).fillCircle(l.size / 2, l.size / 2, l.size / 2);
    g.setPosition(l.x, l.y);
    this.undoRing.setPosition(l.x + l.size / 2, l.y + l.size / 2);
    this.undoGlyph
      .setFontSize(Math.round(UNDO_GLYPH_CSS_PX * k))
      .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
      .setPosition(l.x + l.size / 2, l.y + l.size / 2);
    this.shownUndoHolding = this.model.undoHolding;
    this.shownUndoStep = -1; // redraw the ring at the new size
  }

  /** Story 5.20: shows ↶ with its draining ring (redrawn only when the drawn share changes). */
  private drawUndo(): void {
    const m = this.model;
    const shown = m.undoVisible;
    if (shown !== this.shownUndoVisible) {
      this.shownUndoVisible = shown;
      this.buttons.setVisible("undo", shown);
      this.undoBg.setVisible(shown);
      this.undoRing.setVisible(shown);
      this.undoGlyph.setVisible(shown);
    }
    if (!shown) return;
    if (m.undoHolding !== this.shownUndoHolding) this.layoutUndo();
    if (m.undoArmed !== this.shownUndoArmed) {
      this.shownUndoArmed = m.undoArmed;
      const a = m.undoArmed ? UNDO_ARMED_ALPHA : 1;
      this.undoGlyph.setAlpha(a);
      this.undoBg.setAlpha(a);
    }
    const step = Math.ceil(Math.max(0, Math.min(1, m.undoProgress)) * UNDO_RING_STEPS);
    if (step === this.shownUndoStep) return;
    this.shownUndoStep = step;
    const k = dpr();
    const r = this.undoRect.size / 2 - (UNDO_RING_CSS_PX * k) / 2;
    const g = this.undoRing;
    g.clear();
    g.lineStyle(UNDO_RING_CSS_PX * k, UNDO_RING_TRACK, 0.9).strokeCircle(0, 0, r);
    if (step > 0) {
      const top = -Math.PI / 2;
      g.lineStyle(UNDO_RING_CSS_PX * k, UNDO_RING, 1).beginPath().arc(0, 0, r, top, top + (step / UNDO_RING_STEPS) * Math.PI * 2, false).strokePath();
    }
  }

  /** Story 5.20: the sold "+$N" text (bold gold, dark stroke). */
  private soldPopStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    const k = dpr();
    return {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(SOLD_POP_TEXT_PX * k)}px`,
      color: SOLD_POP_COLOR,
      fontStyle: "bold",
      stroke: TEXT_STROKE,
      strokeThickness: Math.round(TEXT_STROKE_PX * k * 0.75),
    };
  }

  /** Story 5.20 (ux-spec §10): "+$N" rises 0.6 m in 600 ms at each sold building (world → screen each frame). */
  private drawSoldPops(): void {
    const m = this.model;
    const now = this.time.now;
    for (let i = 0; i < m.soldPopCount; i++) {
      const amount = m.soldPopAmount[i] as number;
      const slot = this.soldPool.spawn(now, amount);
      this.soldX[slot] = m.soldPopX[i] as number;
      this.soldY[slot] = m.soldPopY[i] as number;
      (this.soldPops[slot] as Phaser.GameObjects.Text).setText(`+$${amount}`); // once per sell, not per frame
    }
    m.soldPopCount = 0;
    for (let i = 0; i < this.soldPops.length; i++) {
      const t = this.soldPops[i] as Phaser.GameObjects.Text;
      if (!this.soldPool.alive(i, now)) {
        if (t.visible) t.setVisible(false);
        continue;
      }
      const p = this.soldPool.progress(i, now);
      const sx = ((this.soldX[i] as number) - m.camX) * m.camZoom;
      const sy = ((this.soldY[i] as number) - p * SOLD_POP_RISE_M - m.camY) * m.camZoom;
      t.setPosition(sx, sy).setAlpha(1 - p * p).setVisible(true);
    }
  }

  /**
   * Story 3.7: Repair and ✕ in a row centred one row above Ready; the info (two lines) right
   * of ✕ and the reason above it, so the texts stay clear of the survivor at the screen centre.
   */
  private layoutRepairPanel(): void {
    const k = dpr();
    const h = READY_BUTTON_H_CSS_PX * k;
    const w = REPAIR_BUTTON_W_CSS_PX * k;
    const cw = REPAIR_CLOSE_CSS_PX * k;
    const gap = REPAIR_ROW_GAP_CSS_PX * k;
    const readyTop = this.scale.height - (READY_BUTTON_BOTTOM_CSS_PX + this.insets.bottom) * k - h;
    const y = readyTop - gap - h;
    const x = (this.scale.width - (w + gap + cw)) / 2;
    const rect = this.buttons.get("repair");
    if (rect) Object.assign(rect, { x, y, w, h });
    this.repairBtn.setPosition(x, y);
    this.repairText.setFontSize(Math.round(READY_TEXT_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(x + w / 2, y + h / 2);
    const cx = x + w + gap;
    const close = this.buttons.get("repairClose");
    if (close) Object.assign(close, { x: cx, y, w: cw, h });
    const g = this.repairCloseBtn;
    g.clear();
    g.fillStyle(PLACE_CANCEL, 0.85).fillRoundedRect(0, 0, cw, h, READY_RADIUS_PX * k);
    g.lineStyle(READY_BORDER_PX * k, READY_BORDER, 0.9).strokeRoundedRect(0, 0, cw, h, READY_RADIUS_PX * k);
    g.setPosition(cx, y);
    this.repairCloseGlyph.setFontSize(Math.round(READY_TEXT_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(cx + cw / 2, y + h / 2);
    const tx = cx + cw + gap;
    const lineH = REPAIR_INFO_PX * LINE_HEIGHT * k;
    this.repairInfo.setFontSize(Math.round(REPAIR_INFO_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(tx, y + h / 2);
    this.repairReason
      .setFontSize(Math.round(REPAIR_INFO_PX * k))
      .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
      .setPosition(tx, y + h / 2 - lineH * 1.5); // above the info (up to 3 lines since Story 5.9)
    this.shownRepairValid = -1; // redraw at the new size
    // Story 5.9: Upgrade one row above Repair, same width; its refusal text to its left.
    const uy = y - gap - h;
    const up = this.buttons.get("upgrade");
    if (up) Object.assign(up, { x, y: uy, w, h });
    this.upgradeBtn.setPosition(x, uy);
    this.upgradeText.setFontSize(Math.round(READY_TEXT_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(x + w / 2, uy + h / 2);
    this.upgradeReason.setFontSize(Math.round(REPAIR_INFO_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(x - gap, uy + h / 2);
    this.shownUpgradeValid = -1;
    // Story 5.20 (D6): Sell one row above Upgrade, same width (clear of ✕'s info column at 568 px); its refusal text to its left.
    const sy = uy - gap - h;
    const sell = this.buttons.get("sell");
    if (sell) Object.assign(sell, { x, y: sy, w, h });
    this.sellBtn.setPosition(x, sy);
    this.sellText.setFontSize(Math.round(READY_TEXT_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(x + w / 2, sy + h / 2);
    this.sellReasonText.setFontSize(Math.round(REPAIR_INFO_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(x - gap, sy + h / 2);
    this.shownSellValid = -1;
  }

  /** Story 5.20: shows, hides and updates Sell / Take back (only when what it shows changes). */
  private drawSell(): void {
    const m = this.model;
    const shown = m.repairOpen && m.sellShown;
    if (shown !== this.shownSellShown) {
      this.shownSellShown = shown;
      this.buttons.setVisible("sell", shown);
      this.sellBtn.setVisible(shown);
      this.sellText.setVisible(shown);
      this.sellReasonText.setVisible(shown);
    }
    if (!shown) return;
    if (m.sellLabel !== this.shownSellLabel) {
      this.shownSellLabel = m.sellLabel;
      this.sellText.setText(m.sellLabel);
    }
    if (m.sellReason !== this.shownSellReason) {
      this.shownSellReason = m.sellReason;
      this.sellReasonText.setText(m.sellReason);
    }
    const valid = m.sellReason === "" ? 1 : 0;
    if (valid === this.shownSellValid) return;
    this.shownSellValid = valid;
    const k = dpr();
    const w = REPAIR_BUTTON_W_CSS_PX * k;
    const h = READY_BUTTON_H_CSS_PX * k;
    const g = this.sellBtn;
    g.clear();
    g.fillStyle(valid ? SELL_FILL : READY_BG, valid ? 0.85 : READY_BG_ALPHA).fillRoundedRect(0, 0, w, h, READY_RADIUS_PX * k);
    g.lineStyle(READY_BORDER_PX * k, valid ? SELL_BORDER : READY_BORDER, 0.9).strokeRoundedRect(0, 0, w, h, READY_RADIUS_PX * k);
    g.setAlpha(valid ? 1 : REPAIR_DIM_ALPHA);
    this.sellText.setAlpha(valid ? 1 : REPAIR_DIM_ALPHA);
  }

  /** Story 5.9: shows, hides and updates the Upgrade button (only when what it shows changes). */
  private drawUpgrade(): void {
    const m = this.model;
    const shown = m.repairOpen && m.upgradeShown;
    if (shown !== this.shownUpgradeShown) {
      this.shownUpgradeShown = shown;
      this.buttons.setVisible("upgrade", shown);
      this.upgradeBtn.setVisible(shown);
      this.upgradeText.setVisible(shown);
      this.upgradeReason.setVisible(shown);
    }
    if (!shown) return;
    if (m.upgradeLabel !== this.shownUpgradeLabel) {
      this.shownUpgradeLabel = m.upgradeLabel;
      this.upgradeText.setText(m.upgradeLabel);
    }
    if (m.upgradeReason !== this.shownUpgradeReason) {
      this.shownUpgradeReason = m.upgradeReason;
      this.upgradeReason.setText(m.upgradeReason);
    }
    const valid = m.upgradeReason === "" ? 1 : 0;
    if (valid === this.shownUpgradeValid) return;
    this.shownUpgradeValid = valid;
    const k = dpr();
    const w = REPAIR_BUTTON_W_CSS_PX * k;
    const h = READY_BUTTON_H_CSS_PX * k;
    const g = this.upgradeBtn;
    g.clear();
    g.fillStyle(valid ? UPGRADE_FILL : READY_BG, valid ? 0.85 : READY_BG_ALPHA).fillRoundedRect(0, 0, w, h, READY_RADIUS_PX * k);
    g.lineStyle(READY_BORDER_PX * k, valid ? UPGRADE_BORDER : READY_BORDER, 0.9).strokeRoundedRect(0, 0, w, h, READY_RADIUS_PX * k);
    g.setAlpha(valid ? 1 : REPAIR_DIM_ALPHA);
    this.upgradeText.setAlpha(valid ? 1 : REPAIR_DIM_ALPHA);
  }

  /** Story 3.7: shows, hides and updates the repair panel (only when what it shows changes). */
  private drawRepair(): void {
    const m = this.model;
    const open = m.repairOpen;
    if (open !== this.shownRepairOpen) {
      this.shownRepairOpen = open;
      this.buttons.setVisible("repair", open);
      this.buttons.setVisible("repairClose", open);
      this.repairBtn.setVisible(open);
      this.repairText.setVisible(open);
      this.repairCloseBtn.setVisible(open);
      this.repairCloseGlyph.setVisible(open);
      this.repairInfo.setVisible(open);
      this.repairReason.setVisible(open);
    }
    if (!open) return;
    if (m.repairInfo !== this.shownRepairInfo) {
      this.shownRepairInfo = m.repairInfo;
      this.repairInfo.setText(m.repairInfo);
    }
    if (m.repairReason !== this.shownRepairReason) {
      this.shownRepairReason = m.repairReason;
      this.repairReason.setText(m.repairReason);
    }
    if (m.repairLabel !== this.shownRepairLabel) {
      this.shownRepairLabel = m.repairLabel;
      this.repairText.setText(m.repairLabel);
    }
    const valid = m.repairReason === "" ? 1 : 0;
    if (valid === this.shownRepairValid) return;
    this.shownRepairValid = valid;
    const k = dpr();
    const w = REPAIR_BUTTON_W_CSS_PX * k;
    const h = READY_BUTTON_H_CSS_PX * k;
    const g = this.repairBtn;
    g.clear();
    g.fillStyle(valid ? PLACE_CONFIRM : READY_BG, valid ? 0.85 : READY_BG_ALPHA).fillRoundedRect(0, 0, w, h, READY_RADIUS_PX * k);
    g.lineStyle(READY_BORDER_PX * k, valid ? REPAIR_OK : READY_BORDER, 0.9).strokeRoundedRect(0, 0, w, h, READY_RADIUS_PX * k);
    g.setAlpha(valid ? 1 : REPAIR_DIM_ALPHA);
    this.repairText.setAlpha(valid ? 1 : REPAIR_DIM_ALPHA);
  }

  /**
   * Story 5.15: the hand cluster where the right thumb rests (`layoutHandCluster`, ux-spec §4):
   * round Place, ⟳ and ✕, the 🔒 badge on ⟳ and the hint line right-aligned above them.
   */
  private layoutPlacementButtons(): void {
    const k = dpr();
    const l = layoutHandCluster(this.scale.width, this.scale.height, this.insets.right, this.insets.bottom, k, this.hand, this.insets.top);
    const rects = [l.rotate, l.place, l.cancel];
    for (let i = 0; i < PLACE_IDS.length; i++) {
      const r = rects[i] as HandRect;
      const rect = this.buttons.get(PLACE_IDS[i] as string);
      if (rect) Object.assign(rect, { x: r.x, y: r.y, w: r.size, h: r.size });
      (this.placeGlyphs[i] as Phaser.GameObjects.Text)
        .setFontSize(Math.round((PLACE_GLYPH_PX[i] ?? 30) * k))
        .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
        .setPosition(r.x + r.size / 2, r.y + r.size / 2);
    }
    this.shownPlaceValid = null; // redraw the circles at the new size
    this.drawHandButtons(this.model.placementValid);
    const rot = l.rotate;
    const g = this.placeLock.clear();
    const bw = LOCK_BODY_W_PX * k;
    const bh = LOCK_BODY_H_PX * k;
    const sr = LOCK_SHACKLE_R_PX * k;
    g.lineStyle(2 * k, LOCK_COLOR, 1).beginPath().arc(0, 0, sr, Math.PI, 0).strokePath();
    g.fillStyle(LOCK_COLOR, 1).fillRect(-bw / 2, 0, bw, bh);
    g.lineStyle(1.5 * k, TEXT_STROKE_COLOR, 1).strokeRect(-bw / 2, 0, bw, bh);
    g.setPosition(rot.x + rot.size - bw / 2, rot.y + sr + k);
    this.placeHint
      .setFontSize(Math.round(HINT_TEXT_PX * k))
      .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
      .setPosition(l.hintX, l.hintY);
    // Story 5.19: the item chip (hit-tested in `down`, review M1); the short-screen chip's text (main-session decision)
    const c = l.chip;
    this.model.placementChipShort = l.chipRow;
    // review L4: the cluster's rects (canvas px) the dragged ghost keeps out from under
    const av = this.model.handAvoid;
    const sq = [l.place, l.rotate, l.cancel];
    for (let i = 0; i < 3; i++) {
      const r = sq[i] as HandRect;
      av[i * 4] = r.x;
      av[i * 4 + 1] = r.y;
      av[i * 4 + 2] = r.x + r.size;
      av[i * 4 + 3] = r.y + r.size;
    }
    av[12] = c.x;
    av[13] = c.y;
    av[14] = c.x + c.w;
    av[15] = c.y + c.h;
    this.placeChipText
      .setFontSize(Math.round(HAND_CHIP_TEXT_CSS_PX * k))
      .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
      .setPosition(c.x + c.w / 2, c.y + c.h / 2);
    this.shownChipPinned = null; // redraw the panel at the new size
    this.shownChip = ""; // refit the text
    this.drawChip();
  }

  /** Story 5.19: the chip's panel (on a pin change) and its text, shrunk to fit (on a text change). */
  private drawChip(): void {
    const m = this.model;
    const k = dpr();
    const c = this.hand.chip;
    if (m.placementPinned !== this.shownChipPinned) {
      this.shownChipPinned = m.placementPinned;
      const g = this.placeChip.clear().setPosition(c.x, c.y);
      g.fillStyle(CHIP_BG, CHIP_BG_ALPHA).fillRoundedRect(0, 0, c.w, c.h, CHIP_RADIUS_PX * k);
      if (m.placementPinned) g.lineStyle(2 * k, CHIP_PINNED, 1);
      else g.lineStyle(k, CHIP_BORDER, CHIP_BORDER_ALPHA);
      g.strokeRoundedRect(0, 0, c.w, c.h, CHIP_RADIUS_PX * k);
    }
    if (m.placementChip !== this.shownChip) {
      this.shownChip = m.placementChip;
      const t = this.placeChipText.setScale(1).setText(m.placementChip);
      const inner = c.w - 2 * HAND_CHIP_PAD_CSS_PX * k;
      t.setScale(t.width > inner ? inner / t.width : 1);
    }
  }

  /** Story 5.15: the three round buttons; Place green when the shared check passes, grey with a red ring when not. */
  private drawHandButtons(valid: boolean): void {
    if (valid === this.shownPlaceValid) return;
    this.shownPlaceValid = valid;
    const k = dpr();
    const rects = [this.hand.rotate, this.hand.place, this.hand.cancel];
    for (let i = 0; i < PLACE_IDS.length; i++) {
      const r = rects[i] as HandRect;
      const rad = r.size / 2;
      const g = (this.placeBtns[i] as Phaser.GameObjects.Graphics).clear().setPosition(r.x + rad, r.y + rad);
      const place = i === 1;
      const fill = place ? (valid ? PLACE_CONFIRM : PLACE_BLOCKED) : i === 2 ? PLACE_CANCEL : READY_BG;
      g.fillStyle(fill, i === 0 ? READY_BG_ALPHA : 0.85).fillCircle(0, 0, rad);
      const ring = place && !valid ? PLACE_BLOCKED_RING : READY_BORDER;
      g.lineStyle((place && !valid ? 2 : 1) * READY_BORDER_PX * k, ring, 0.95).strokeCircle(0, 0, rad);
    }
    (this.placeGlyphs[1] as Phaser.GameObjects.Text).setAlpha(valid ? 1 : 0.7);
  }

  /** Story 3.4: shows or hides placement mode's buttons and hint (on change only); Story 5.15: Place's colour and the 🔒 badge. */
  private drawPlacement(): void {
    const m = this.model;
    const placing = m.placementActive;
    if (placing !== this.shownPlacement) {
      this.shownPlacement = placing;
      if (placing) this.router.releaseAim(); // Story 5.15: the move thumb keeps steering; only the aim stick lets go
      this.drag.reset(); // Story 5.19
      this.model.dragHeld = false;
      this.placeChip.setVisible(placing);
      this.placeChipText.setVisible(placing);
      for (let i = 0; i < PLACE_IDS.length; i++) {
        this.buttons.setVisible(PLACE_IDS[i] as string, placing);
        (this.placeBtns[i] as Phaser.GameObjects.Graphics).setVisible(placing);
        (this.placeGlyphs[i] as Phaser.GameObjects.Text).setVisible(placing);
      }
      this.placeHint.setVisible(placing);
      this.shownLocked = null;
    }
    const locked = placing && m.placementLocked;
    if (locked !== this.shownLocked) {
      this.shownLocked = locked;
      this.placeLock.setVisible(locked);
    }
    if (!placing) return;
    this.drawHandButtons(m.placementValid);
    this.drawChip();
    if (m.placementHint !== this.shownHint) {
      this.shownHint = m.placementHint;
      this.placeHint.setText(m.placementHint);
    }
    if (m.placementValid !== this.shownHintValid) {
      this.shownHintValid = m.placementValid;
      this.placeHint.setColor(m.placementValid ? HINT_VALID : HINT_BLOCKED);
    }
  }

  /**
   * Story 3.1: the Ready button's hit rect and position (bottom, inside the safe area). Story 5.15:
   * 40 px left of centre; Story 5.16: Shop moved into the build bar, and Ready slides further left
   * when it would come within 12 px of the grid (`readyLeftX`).
   */
  private layoutReadyButton(): void {
    const k = dpr();
    const w = READY_BUTTON_W_CSS_PX * k;
    const h = READY_BUTTON_H_CSS_PX * k;
    const x = readyLeftX(this.scale.width, w, this.bar.left, k);
    const y = this.scale.height - (READY_BUTTON_BOTTOM_CSS_PX + this.insets.bottom) * k - h;
    const rect = this.buttons.get("ready");
    if (rect) Object.assign(rect, { x, y, w, h });
    this.readyBtn.setPosition(x, y);
    this.readyLabel.setFontSize(Math.round(READY_TEXT_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(x + w / 2, y + h / 2);
    this.shownReadyKey = -1; // redraw at the new size
  }

  /** Story 5.16: the build bar's tiles and count line, from the bottom-right safe-area corner (`layoutBuildBar`). */
  private layoutBuildBar(): void {
    const k = dpr();
    const l = layoutBuildBar(this.scale.width, this.scale.height, this.insets.right, this.insets.bottom, k, this.bar);
    for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
      const x = l.x[s] as number;
      const y = l.y[s] as number;
      const rect = this.buttons.get(TILE_IDS[s] as string);
      if (rect) Object.assign(rect, { x, y, w: l.tile, h: l.tile });
      (this.barTiles[s] as Phaser.GameObjects.Graphics).setPosition(x, y);
      (this.barGlyphs[s] as Phaser.GameObjects.Text)
        .setFontSize(Math.round(TILE_GLYPH_PX * k))
        .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
        .setPosition(x + l.tile / 2, y + TILE_ICON_Y_PX * k);
      (this.barPrices[s] as Phaser.GameObjects.Text)
        .setFontSize(Math.round(BUILD_PRICE_TEXT_CSS_PX * k))
        .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k * 0.75))
        .setPosition(x + l.tile / 2, y + TILE_PRICE_Y_PX * k);
    }
    this.barCount
      .setFontSize(Math.round(BUILD_COUNT_TEXT_CSS_PX * k))
      .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k * 0.75))
      .setPosition(l.countX, l.countY);
    this.barSlotsDirty = true; // icons re-fitted at the new size
    this.shownBarKey = -1;
  }

  /** Story 5.16: a tile tap (HudButtons handler): a building → `buildPick`, Shop → `shopPressed`, More ▸ → the next page. */
  private pressTile(s: number): void {
    const slot = this.barSlots[s] as number;
    if (slot >= 0) {
      const item = this.model.buildItems[slot];
      if (item && this.model.buildPick === "") this.model.buildPick = item.id; // review L3: two taps in one frame: the first wins
    } else if (slot === SLOT_SHOP) {
      if (this.model.buildPick === "") this.model.shopPressed = true; // review L3: a building picked this frame wins
    }
    else if (slot === SLOT_MORE) {
      this.barPage++;
      this.barSlotsDirty = true;
    }
  }

  /**
   * Story 5.16: shows, hides and redraws the build bar, only when something it shows changes: the
   * slots (items, page, layout) re-place the icons and labels; the state key (each tile's short/cap
   * bits, my count, the cap) redraws the tiles' looks and the count line. No allocation otherwise.
   */
  private drawBuildBar(): void {
    const m = this.model;
    const v = m.buildBar;
    if (m.buildItems !== this.shownBarItems) {
      this.shownBarItems = m.buildItems;
      this.barPage = 0;
      this.barSlotsDirty = true;
    }
    if (v !== this.shownBarVisible || this.barSlotsDirty) {
      if (!v && this.shownBarVisible === true && this.barPage !== 0) {
        this.barPage = 0; // review L4: the bar reopens on its first page
        this.barSlotsDirty = true;
      }
      if (this.barSlotsDirty) this.placeBarSlots();
      this.shownBarVisible = v;
      for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
        const slot = this.barSlots[s] as number;
        const on = v && slot !== SLOT_EMPTY;
        this.buttons.setVisible(TILE_IDS[s] as string, on);
        (this.barTiles[s] as Phaser.GameObjects.Graphics).setVisible(on);
        (this.barPrices[s] as Phaser.GameObjects.Text).setVisible(on);
        (this.barGlyphs[s] as Phaser.GameObjects.Text).setVisible(on && slot < 0);
        const framed = slot >= 0 && hasBarImage((m.buildItems[slot] as BuildTile).id);
        (this.barIcons[s] as Phaser.GameObjects.Image).setVisible(on && framed);
        (this.barIconGfx[s] as Phaser.GameObjects.Graphics).setVisible(on && slot >= 0 && !framed);
      }
      this.barCount.setVisible(v);
      this.shownBarKey = -1;
    }
    if (!v) return;
    let bits = 0;
    for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
      const slot = this.barSlots[s] as number;
      if (slot >= 0) bits |= tileState(m.buildOwned, m.buildCap, m.money, (m.buildItems[slot] as BuildTile).price) << (2 * s);
    }
    const key = bits + m.buildOwned * 65536 + m.buildCap * 65536 * 256;
    if (key === this.shownBarKey) return;
    this.shownBarKey = key;
    const k = dpr();
    const t = this.bar.tile;
    for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
      const slot = this.barSlots[s] as number;
      if (slot === SLOT_EMPTY) continue;
      const st = slot >= 0 ? (bits >> (2 * s)) & 3 : 0;
      const a = st !== 0 ? TILE_DIM_ALPHA : 1;
      const g = (this.barTiles[s] as Phaser.GameObjects.Graphics).clear();
      g.fillStyle(READY_BG, slot === SLOT_SHOP ? READY_BG_ALPHA : TILE_BG_ALPHA).fillRoundedRect(0, 0, t, t, TILE_RADIUS_PX * k);
      g.lineStyle(TILE_BORDER_PX * k, slot === SLOT_SHOP ? SHOP_BORDER : READY_BORDER, TILE_BORDER_ALPHA).strokeRoundedRect(0, 0, t, t, TILE_RADIUS_PX * k);
      g.setAlpha(a);
      (this.barPrices[s] as Phaser.GameObjects.Text).setAlpha(a); // review L1: the whole tile dims, its price too
      (this.barIcons[s] as Phaser.GameObjects.Image).setAlpha(a);
      (this.barIconGfx[s] as Phaser.GameObjects.Graphics).setAlpha(a);
      if (slot >= 0) (this.barPrices[s] as Phaser.GameObjects.Text).setColor(st & TILE_SHORT ? TILE_PRICE_SHORT : TILE_PRICE);
    }
    this.barCount.setText(`${m.buildOwned}/${m.buildCap}`).setColor(m.buildOwned >= m.buildCap ? COUNT_FULL : COUNT_OK);
  }

  /** Story 5.16: which item each slot shows (page, Shop last) and their icons and labels (on change only). */
  private placeBarSlots(): void {
    this.barSlotsDirty = false;
    const items = this.model.buildItems;
    buildBarSlots(items.length, this.barPage, this.barSlots);
    const k = dpr();
    const t = this.bar.tile;
    const boxW = TILE_ICON_W_PX * k;
    const boxH = TILE_ICON_H_PX * k;
    for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
      const slot = this.barSlots[s] as number;
      const cx = (this.bar.x[s] as number) + t / 2;
      const cy = (this.bar.y[s] as number) + TILE_ICON_Y_PX * k;
      const price = this.barPrices[s] as Phaser.GameObjects.Text;
      const glyph = this.barGlyphs[s] as Phaser.GameObjects.Text;
      const gfx = (this.barIconGfx[s] as Phaser.GameObjects.Graphics).clear();
      if (slot === SLOT_SHOP || slot === SLOT_MORE) {
        glyph.setText(slot === SLOT_SHOP ? "🛒" : "▸");
        price.setText(slot === SLOT_SHOP ? "Shop" : "More").setColor(TILE_LABEL);
        continue;
      }
      if (slot < 0) continue;
      const item = items[slot] as BuildTile;
      price.setText(`$${item.price}`);
      const icon = buildIconFrame(item.id);
      const art = icon === null ? buildingFrame(item.id) : null;
      if (icon !== null) {
        // Story 5.26: the type's own build-bar icon (I1 / T1 / M1), at the mockup's size (48 × 36 CSS px
        // frame, its 44 × 30 box centred on the icon anchor).
        (this.barIcons[s] as Phaser.GameObjects.Image)
          .setTexture(BUILD_ICON_TEXTURE, icon)
          .setOrigin(BUILD_ICON_ORIGIN_X, BUILD_ICON_ORIGIN_Y)
          .setPosition(cx, cy)
          .setDisplaySize(BUILD_ICON_FRAME_W * k, BUILD_ICON_FRAME_H * k);
      } else if (art) {
        // No icon yet (e.g. 5.10's types): the same code-drawn frame as in the world (rot 0), fitted into the icon box.
        const img = (this.barIcons[s] as Phaser.GameObjects.Image).setTexture(art.texture, art.frame).setOrigin(0.5);
        const aspect = img.frame.width / Math.max(1, img.frame.height);
        const w = aspect >= boxW / boxH ? boxW : boxH * aspect;
        img.setPosition(cx, cy).setDisplaySize(w, w / aspect);
      } else if (item.turret) drawTurretIcon(gfx, cx, cy, boxH);
      else {
        const aspect = item.widthM / Math.max(0.01, item.depthM);
        const w = aspect >= boxW / boxH ? boxW : boxH * aspect;
        const h = w / aspect;
        drawPlankIcon(gfx, cx - w / 2, cy - h / 2, w, h, w / Math.max(0.01, item.widthM));
      }
    }
  }

  /** Story 3.1: shows, hides and redraws the Ready button (only when what it shows changes). */
  private drawReady(): void {
    const m = this.model;
    if (m.readyButton !== this.shownReadyVisible) {
      this.shownReadyVisible = m.readyButton;
      this.buttons.setVisible("ready", m.readyButton);
      this.readyBtn.setVisible(m.readyButton);
      this.readyLabel.setVisible(m.readyButton);
    }
    if (!m.readyButton) return;
    const key = (m.readyOn ? 1 : 0) + m.readyCount * 2 + m.readyTotal * 64;
    if (key === this.shownReadyKey) return;
    this.shownReadyKey = key;
    const k = dpr();
    const w = READY_BUTTON_W_CSS_PX * k;
    const h = READY_BUTTON_H_CSS_PX * k;
    const g = this.readyBtn;
    g.clear();
    if (m.readyOn) g.fillStyle(READY_ON, 1);
    else g.fillStyle(READY_BG, READY_BG_ALPHA);
    g.fillRoundedRect(0, 0, w, h, READY_RADIUS_PX * k);
    g.lineStyle(READY_BORDER_PX * k, READY_BORDER, 0.9).strokeRoundedRect(0, 0, w, h, READY_RADIUS_PX * k);
    const count = m.readyTotal > 1 ? `  ${m.readyCount}/${m.readyTotal}` : "";
    this.readyLabel.setText(`${m.readyOn ? "Ready ✓" : "Ready"}${count}`);
  }

  /** ☰: 48 × 48 CSS px, 12 px inside the safe area at the top-right; redrawn on layout only. */
  private layoutMenuButton(): void {
    const k = dpr();
    const safe = this.insets;
    const size = MENU_BUTTON_CSS_PX * k;
    const x = this.scale.width - (MENU_BUTTON_INSET_CSS_PX + safe.right) * k - size;
    const y = (MENU_BUTTON_INSET_CSS_PX + safe.top) * k;
    const rect = this.buttons.get("menu");
    if (rect) Object.assign(rect, { x, y, w: size, h: size });
    const g = this.menuBtn;
    g.clear();
    g.fillStyle(MENU_BG, MENU_BG_ALPHA).fillRoundedRect(0, 0, size, size, MENU_RADIUS_PX * k);
    const barW = size * MENU_BAR_W_FRAC;
    const barH = MENU_BAR_H_PX * k;
    const gap = MENU_BAR_GAP_PX * k;
    const bx = (size - barW) / 2;
    const by = size / 2 - barH / 2;
    g.fillStyle(MENU_BAR_COLOR, 1);
    for (let i = -1; i <= 1; i++) g.fillRect(bx, by + i * (gap + barH), barW, barH);
    g.setPosition(x, y);
  }

  private onResize(): void {
    this.insets = { ...safeArea() };
    const r = this.stickRadiusCss * dpr();
    this.sticks.setRadius(r);
    this.moveBase.setRadius(r);
    this.moveKnob.setRadius(KNOB_RADIUS_CSS_PX * dpr());
    this.aimBase.setRadius(r);
    this.aimKnob.setRadius(KNOB_RADIUS_CSS_PX * dpr());
    this.ammoText.setFontSize(Math.round(AMMO_TEXT_PX * dpr()));
    this.otherText.setFontSize(Math.round(OTHER_TEXT_PX * dpr()));
    this.ammoNameText.setFontSize(Math.round(AMMO_TEXT_PX * dpr()));
    this.otherNameText.setFontSize(Math.round(OTHER_TEXT_PX * dpr()));
    this.layoutButtons();
    this.shownOther = "";
    this.waveText.setFontSize(Math.round(WAVE_TEXT_PX * dpr()));
    this.bannerText.setFontSize(Math.round(BANNER_TEXT_PX * dpr()));
    this.shownWave = -1;
    this.shownBanner = ""; // re-center the banner
    for (const a of this.arrows) a.setScale(dpr() / this.arrowDpr);
    // Teammate arrows and crosses: their scale is set every frame from dpr() / arrowDpr (× the pulse).
    for (const t of this.names) t.setFontSize(Math.round(NAME_TEXT_PX * dpr())).setStroke(NAME_STROKE, Math.round(NAME_STROKE_PX * dpr()));
    this.shownWeapon = "";
    this.hpText.setFontSize(Math.round(HP_TEXT_PX * dpr()));
    this.shownHp = -1; // force a redraw at the new scale
    this.shownGearMask = -1;
    this.moneyText.setFontSize(Math.round(MONEY_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr() * 0.75));
    this.shownMoney = -1;
    for (const pop of this.moneyPops) {
      pop.text.setFontSize(Math.round(MONEY_POP_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr() * 0.75));
    }
    for (const t of this.firePops) t.setFontSize(Math.round(FIRE_POP_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr() * 0.75));
    for (const t of this.countdowns) t.setFontSize(Math.round(COUNTDOWN_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr()));
    this.statusText.setFontSize(Math.round(STATUS_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr()));
    this.shownStatus = "\u0000"; // re-place the status line
    this.toastText.setFontSize(Math.round(TOAST_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr()));
    this.shownToast = "\u0000";
  }

  /** Redraws the health bar only when HP changes (top-left, inside the safe area from Story 1.8 on). */
  private drawHealth(): void {
    const { hp, maxHp, burning, inAcid, gearMask } = this.model;
    if (hp === this.shownHp && maxHp === this.shownMaxHp && burning === this.shownBurning && inAcid === this.shownAcid && gearMask === this.shownGearMask) return;
    this.shownGearMask = gearMask;
    this.shownHp = hp;
    this.shownMaxHp = maxHp;
    this.shownBurning = burning;
    this.shownAcid = inAcid;
    const k = dpr();
    const safe = this.insets;
    const x = (HP_MARGIN + safe.left) * k;
    const y = (HP_MARGIN + safe.top) * k;
    const w = HP_BAR_W * k;
    const h = HP_BAR_H * k;
    const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.hpBar.clear();
    this.hpBar.fillStyle(HP_BG, 0.6).fillRect(x - 2 * k, y - 2 * k, w + 4 * k, h + 4 * k);
    this.hpBar.fillStyle(mixColor(HP_LOW, HP_HIGH, frac), 1).fillRect(x, y, w * frac, h);
    // Story 4.8: "Burning" while the server's fire damage keeps arriving (HP stays the server's, ceil).
    this.hpText
      .setText(burning ? `HP ${Math.ceil(hp)} / ${maxHp}   Burning` : inAcid ? `HP ${Math.ceil(hp)} / ${maxHp}   Acid` : `HP ${Math.ceil(hp)} / ${maxHp}`)
      .setColor(burning ? BURNING_TEXT : inAcid ? ACID_TEXT : "#ffffff")
      .setPosition(x, y + h + 4 * k);
    this.drawGear(this.hpText.x + this.hpText.width + 8 * k, this.hpText.y + this.hpText.height / 2);
  }

  /** Story 5.11 (AC 3, D7): one icon per owned gear item, fixed order, beside the HP text. */
  private drawGear(x0: number, cy: number): void {
    const k = dpr();
    const frames = gearIconFramesFor(this.model.gearIds, this.model.gearMask, this.gearFrames);
    const size = GEAR_ICON_CSS_PX * k;
    for (let i = 0; i < this.gearIcons.length; i++) {
      const icon = this.gearIcons[i] as Phaser.GameObjects.Image;
      const frame = frames[i];
      if (frame === undefined) {
        icon.setVisible(false);
        continue;
      }
      icon.setFrame(frame).setScale(size / GEAR_ICON_FRAME_PX).setPosition(x0 + i * (size + 4 * k), cy).setVisible(true);
    }
  }

  /**
   * Story 3.2: "$120" under the HP text (setText only when it changes), and a "+N" beside the
   * survivor for each frame's gain, rising and fading on a HUD tween (the solo pause freezes it).
   */
  private drawMoney(): void {
    const m = this.model;
    const k = dpr();
    if (m.money !== this.shownMoney) {
      this.shownMoney = m.money;
      const safe = this.insets;
      const y = (HP_MARGIN + safe.top + HP_BAR_H + 4 + HP_TEXT_PX * LINE_HEIGHT + MONEY_GAP_PX) * k;
      this.moneyText.setText(`$${m.money}`).setPosition((HP_MARGIN + safe.left) * k, y).setVisible(true);
    }
    if (m.moneyGain > 0) {
      const pop = this.moneyPops[this.nextMoneyPop] as MoneyPop;
      this.nextMoneyPop = (this.nextMoneyPop + 1) % this.moneyPops.length;
      this.tweens.killTweensOf(pop);
      pop.text.setText(`+${m.moneyGain}`);
      pop.rise = 0;
      pop.alpha = 1;
      pop.active = true;
      this.tweens.add({
        targets: pop,
        rise: MONEY_POP_RISE_PX * k,
        alpha: 0,
        duration: MONEY_POP_MS,
        ease: "Quad.easeIn",
        onComplete: () => {
          pop.active = false;
          pop.text.setVisible(false);
        },
      });
      m.moneyGain = 0;
    }
    const sx = (m.localX + MONEY_POP_RIGHT_M - m.camX) * m.camZoom;
    const sy = (m.localY - MONEY_POP_LIFT_M - m.camY) * m.camZoom;
    for (let i = 0; i < this.moneyPops.length; i++) {
      const pop = this.moneyPops[i] as MoneyPop;
      if (pop.active) pop.text.setPosition(sx, sy - pop.rise).setAlpha(pop.alpha).setVisible(true);
    }
  }

  override update(): void {
    const touch = !this.router.isMouse; // mouse mode hides the sticks
    this.drawStick(touch ? this.sticks.move : null, this.moveBase, this.moveKnob);
    this.drawStick(touch ? this.sticks.aim : null, this.aimBase, this.aimKnob);
    this.drawHealth();
    this.drawMoney();
    this.drawBurn();
    this.drawWeapon();
    this.drawWave();
    this.drawRushArrows();
    this.drawDowned();
    this.drawTeammates();
    this.drawMenu();
    this.drawReady();
    this.drawPlacement();
    this.drawBuildBar(); // Story 5.16
    this.drawRepair();
    this.drawUpgrade(); // Story 5.9
    this.drawSell(); // Story 5.20
    this.drawUndo(); // Story 5.20
    this.drawSoldPops(); // Story 5.20
    this.perfOverlay?.update();
  }

  /**
   * Story 2.11: ☰ while a run is on screen, and the toast line. When the menu opens, every held
   * stick and button lets go (the finger that tapped ☰ lifts over the menu, not the canvas).
   */
  private drawMenu(): void {
    const m = this.model;
    if (m.menuButton !== this.shownMenuButton) {
      this.shownMenuButton = m.menuButton;
      this.buttons.setVisible("menu", m.menuButton);
      this.menuBtn.setVisible(m.menuButton);
    }
    if (m.menuOpen !== this.shownMenuOpen) {
      this.shownMenuOpen = m.menuOpen;
      if (m.menuOpen) {
        hudPointerReset(this.buttons, this.router);
        this.taps.reset();
      }
    }
    if (m.toastText !== this.shownToast) {
      this.shownToast = m.toastText;
      const y = (WAVE_TOP_PX + this.insets.top + WAVE_TEXT_PX + LINE_GAP_PX + STATUS_TEXT_PX + LINE_GAP_PX) * dpr();
      this.toastText.setText(m.toastText).setPosition(this.scale.width / 2, y).setVisible(m.toastText !== "");
    }
  }

  /**
   * Story 2.8: a countdown above each downed survivor (world → screen like the rush arrows, so the
   * text stays crisp at any camera zoom) and the local status line under the wave text.
   */
  private drawDowned(): void {
    const m = this.model;
    const n = Math.min(m.downedCount, this.countdowns.length);
    for (let i = 0; i < this.countdowns.length; i++) {
      const t = this.countdowns[i] as Phaser.GameObjects.Text;
      if (i >= n) {
        if (t.visible) t.setVisible(false);
        continue;
      }
      const secs = m.downed[i * 3 + 2] as number;
      if (secs !== this.shownSecs[i]) {
        this.shownSecs[i] = secs;
        t.setText(`${secs} s`);
      }
      const sx = ((m.downed[i * 3] as number) - m.camX) * m.camZoom;
      const sy = ((m.downed[i * 3 + 1] as number) - m.camY) * m.camZoom;
      t.setPosition(sx, sy).setVisible(true);
    }
    if (m.statusText !== this.shownStatus) {
      this.shownStatus = m.statusText;
      this.statusText
        .setText(m.statusText)
        .setPosition(this.scale.width / 2, (WAVE_TOP_PX + this.insets.top + WAVE_TEXT_PX + LINE_GAP_PX) * dpr())
        .setVisible(m.statusText !== "");
    }
  }

  /**
   * Story 2.9: a name tag over each on-screen teammate, and an edge arrow in their slot colour for
   * each off-screen one (with a "+" when downed). Downed markers pulse. Out teammates: nothing.
   * An off-screen downed teammate's arrow is 1.5× bigger and carries a red "Bo · 14 s" label.
   */
  private drawTeammates(): void {
    const m = this.model;
    const k = dpr();
    const base = k / this.arrowDpr;
    const n = teammateMarkers(m, this.scale.width, this.scale.height, MATE_ARROW_MARGIN * k, this.markers);
    const now = this.time.now;
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      const mk = this.markers[i];
      if (!mk) continue;
      const slot = mk.slot;
      drawn |= 1 << slot;
      const name = this.names[slot] as Phaser.GameObjects.Text;
      const arrow = this.mateArrows[slot] as Phaser.GameObjects.Triangle;
      const cross = this.crosses[slot] as Phaser.GameObjects.Graphics;
      const label = m.teammateNames[slot] ?? "";
      const offDowned = mk.visible && mk.downed;
      // Off screen and down: who, and how long they have ("Bo · 14 s"), in red beside the arrow.
      const text = offDowned ? `${label || "Teammate"} · ${mk.secs} s` : label;
      if (text !== this.shownNames[slot]) {
        this.shownNames[slot] = text;
        name.setText(text);
      }
      if (offDowned !== this.redNames[slot]) {
        this.redNames[slot] = offDowned;
        name.setColor(offDowned ? MATE_DOWNED_COLOR : NAME_COLOR);
      }
      if (!mk.visible) {
        if (arrow.visible) arrow.setVisible(false);
        if (cross.visible) cross.setVisible(false);
        let ny = mk.sy - NAME_LIFT_M * m.camZoom;
        if (mk.downed) {
          // Keep the name above the downed countdown (its bottom edge is COUNTDOWN_LIFT_M up).
          const countdownTop = mk.sy - COUNTDOWN_LIFT_M * m.camZoom - this.countdownHeight();
          ny = Math.min(ny, countdownTop - NAME_GAP_PX * k - name.height / 2);
        }
        name.setPosition(mk.sx, ny).setVisible(label !== "");
        continue;
      }
      const pulse = mk.downed ? pulseScale(now) * MATE_DOWNED_SCALE : 1;
      if (offDowned) {
        // Inward from the arrow, kept fully on screen.
        const inset = MATE_LABEL_INSET_PX * k * MATE_DOWNED_SCALE;
        const hw = name.width / 2 + 4 * k;
        const hh = name.height / 2 + 4 * k;
        const lx = Math.min(this.scale.width - hw, Math.max(hw, mk.x - Math.cos(mk.angle) * inset));
        const ly = Math.min(this.scale.height - hh, Math.max(hh, mk.y - Math.sin(mk.angle) * inset));
        name.setPosition(lx, ly).setVisible(true);
      } else if (name.visible) name.setVisible(false);
      arrow
        .setPosition(mk.x, mk.y)
        .setRotation(mk.angle)
        .setScale(base * pulse)
        .setAlpha(mk.downed ? pulseAlpha(now) : 1)
        .setVisible(true);
      if (mk.downed) {
        const inset = CROSS_INSET_PX * k * pulse; // scales with the arrow, so the "+" never touches it
        cross
          .setPosition(mk.x - Math.cos(mk.angle) * inset, mk.y - Math.sin(mk.angle) * inset)
          .setScale(base * pulse)
          .setVisible(true);
      } else if (cross.visible) {
        cross.setVisible(false);
      }
    }
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      if (drawn & (1 << slot)) continue;
      const name = this.names[slot] as Phaser.GameObjects.Text;
      const arrow = this.mateArrows[slot] as Phaser.GameObjects.Triangle;
      const cross = this.crosses[slot] as Phaser.GameObjects.Graphics;
      if (name.visible) name.setVisible(false);
      if (arrow.visible) arrow.setVisible(false);
      if (cross.visible) cross.setVisible(false);
    }
  }

  /** Height of the downed countdown text (all share one style). */
  private countdownHeight(): number {
    return this.countdowns[0]?.height ?? COUNTDOWN_TEXT_PX * dpr();
  }

  /** "Wave 3 · Zombies 47" top-center, and the centered banner fading out. */
  private drawWave(): void {
    const m = this.model;
    if (m.wave !== this.shownWave || m.remaining !== this.shownRemaining || m.buildSecs !== this.shownBuildSecs) {
      this.shownWave = m.wave;
      this.shownRemaining = m.remaining;
      this.shownBuildSecs = m.buildSecs;
      // Story 3.1: during a build the top line counts down to the next wave.
      const text =
        m.buildSecs >= 0 ? `Wave ${m.wave + 1} in ${m.buildSecs} s` : m.wave > 0 ? `Wave ${m.wave}   ·   Zombies ${m.remaining}` : "Get ready";
      this.waveText
        .setText(text)
        .setPosition(this.scale.width / 2, (WAVE_TOP_PX + this.insets.top) * dpr());
    }
    if (m.bannerText !== this.shownBanner) {
      this.shownBanner = m.bannerText;
      this.bannerText.setText(m.bannerText).setPosition(this.scale.width / 2, this.scale.height * 0.32);
    }
    const age = this.time.now - m.bannerAtMs;
    if (!m.bannerText || age > BANNER_SHOW_MS) {
      this.bannerText.setVisible(false);
    } else {
      const fadeStart = BANNER_SHOW_MS - BANNER_FADE_MS;
      this.bannerText.setVisible(true).setAlpha(age < fadeStart ? 1 : 1 - (age - fadeStart) / BANNER_FADE_MS);
    }
  }

  /** Red arrows on the screen edge pointing at rushing zombies that are off screen (FR30). */
  private drawRushArrows(): void {
    const m = this.model;
    const w = this.scale.width;
    const h = this.scale.height;
    const margin = ARROW_MARGIN * dpr();
    let used = 0;
    for (let i = 0; i < m.rusherCount && used < this.arrows.length; i++) {
      const sx = ((m.rushers[i * 2] as number) - m.camX) * m.camZoom;
      const sy = ((m.rushers[i * 2 + 1] as number) - m.camY) * m.camZoom;
      if (!edgeArrow(sx, sy, w, h, margin, this.arrowOut)) continue;
      (this.arrows[used++] as Phaser.GameObjects.Triangle)
        .setPosition(this.arrowOut.x, this.arrowOut.y)
        .setRotation(this.arrowOut.angle)
        .setVisible(true);
    }
    for (let i = used; i < this.arrows.length; i++) {
      const a = this.arrows[i] as Phaser.GameObjects.Triangle;
      if (a.visible) a.setVisible(false);
    }
  }

  /** Magazine count bottom-right and a reload bar under it (redrawn only on change). */
  private drawWeapon(): void {
    const m = this.model;
    // Story 5.15: under the hand cluster while holding (and nothing fires); Story 5.16: under the build bar (D3).
    const hidden = m.placementActive || m.buildBar;
    if (hidden !== this.shownWeaponHidden) {
      this.shownWeaponHidden = hidden;
      const a = hidden ? 0 : 1;
      this.ammoText.setAlpha(a);
      this.ammoNameText.setAlpha(a);
      this.ammoMark.setAlpha(a);
      this.otherText.setAlpha(a);
      this.otherNameText.setAlpha(a);
      this.otherMark.setAlpha(a);
      this.reloadBar.setAlpha(a);
    }
    const hasOther = m.otherWeaponName !== "" && !hidden;
    if (hasOther !== this.shownSwapVisible) {
      this.shownSwapVisible = hasOther; // only touch the registry and objects when it changes
      this.buttons.setVisible("swap", hasOther);
      this.swapBtn.setVisible(hasOther);
      this.swapLabel.setVisible(hasOther);
    }
    const reloading = m.reloadFrac >= 0;
    const swapping = m.swapFrac >= 0;
    const progress = swapping ? m.swapFrac : m.reloadFrac;
    const reloadStep = reloading || swapping ? Math.round(progress * 50) : -1;
    const swapStep = swapping ? 1 : 0;
    if (
      m.otherWeaponName === this.shownOther &&
      m.otherAmmo === this.shownOtherAmmo &&
      swapStep === this.shownSwapStep &&
      m.weaponName === this.shownWeapon &&
      m.weaponLevel === this.shownLevel &&
      m.otherWeaponLevel === this.shownOtherLevel &&
      m.ammo === this.shownAmmo &&
      m.magazine === this.shownMag &&
      reloadStep === this.shownReloadStep &&
      this.scale.width === this.shownW &&
      this.scale.height === this.shownH
    ) {
      return; // nothing changed: no string building, no redraw
    }
    this.shownWeapon = m.weaponName;
    this.shownLevel = m.weaponLevel;
    this.shownOtherLevel = m.otherWeaponLevel;
    this.shownOther = m.otherWeaponName;
    this.shownOtherAmmo = m.otherAmmo;
    this.shownSwapStep = swapStep;
    this.shownAmmo = m.ammo;
    this.shownMag = m.magazine;
    this.shownReloadStep = reloadStep;
    this.shownW = this.scale.width;
    this.shownH = this.scale.height;
    const k = dpr();
    const safe = this.insets;
    const x = this.scale.width - (AMMO_MARGIN + safe.right) * k;
    const y = this.scale.height - (AMMO_MARGIN + safe.bottom) * k - RELOAD_BAR_H * k - 6 * k;
    // Story 5.4: a flame weapon shows its fuel (percent + an orange bar) instead of a round count.
    const count = m.ammo < 0 ? "—" : m.fuel ? `Fuel ${m.ammo}%` : `${m.ammo} / ${m.magazine}`;
    const status = swapping ? "Swapping" : reloading ? "Reloading" : count;
    this.ammoText.setText(`  ${status}`).setPosition(x, y);
    this.placeNameAndMark(this.ammoNameText, this.ammoMark, this.ammoText, `▶ ${m.weaponName}`, m.weaponLevel, x, y);
    const otherCount = m.otherAmmo < 0 ? "—" : m.otherFuel ? `Fuel ${m.otherAmmo}%` : `${m.otherAmmo} / ${m.otherMag}`;
    const oy = y - this.ammoText.height - 2 * k;
    this.otherText.setText(hasOther ? `  ${otherCount}` : "").setPosition(x, oy);
    this.placeNameAndMark(this.otherNameText, this.otherMark, this.otherText, hasOther ? m.otherWeaponName : "", hasOther ? m.otherWeaponLevel : 1, x, oy);
    this.reloadBar.clear();
    if (reloading || swapping) {
      const w = RELOAD_BAR_W * k;
      const h = RELOAD_BAR_H * k;
      const by = y + 6 * k;
      this.reloadBar.fillStyle(0x000000, 0.6).fillRect(x - w, by, w, h);
      this.reloadBar.fillStyle(swapping ? 0xf5c542 : 0xffffff, 0.9).fillRect(x - w, by, w * progress, h);
    } else if (m.fuel && m.ammo >= 0) {
      const w = RELOAD_BAR_W * k;
      const h = RELOAD_BAR_H * k;
      const by = y + 6 * k;
      this.reloadBar.fillStyle(0x000000, 0.6).fillRect(x - w, by, w, h);
      this.reloadBar.fillStyle(FUEL_BAR_COLOR, 0.95).fillRect(x - w, by, (w * m.ammo) / 100, h);
    }
  }

  /**
   * Story 5.1: lays one weapon line out right to left: the count (already at `x`), the U1 tier
   * plate for `level` (none at I: `hudTierMark`), then the name. Only called when something changed.
   */
  private placeNameAndMark(nameText: Phaser.GameObjects.Text, mark: Phaser.GameObjects.Image, count: Phaser.GameObjects.Text, name: string, level: number, x: number, y: number): void {
    const k = dpr();
    let right = x - count.width;
    const frame = hudTierMark(level) !== "" && name !== "" ? FX_TIER_MARKS[level] : undefined;
    if (frame) {
      const h = count.height * 0.72; // the plate sits inside the line height
      mark.setFrame(frame).setVisible(true);
      mark.setScale(h / (mark.frame.realHeight || FX_TIER_SCALE));
      mark.setPosition(right - 2 * k, y - count.height / 2);
      right -= mark.displayWidth + 6 * k;
    } else mark.setVisible(false);
    nameText.setText(name).setPosition(right, y);
  }

  private drawStick(touch: StickTouch | null, base: Phaser.GameObjects.Arc, knob: Phaser.GameObjects.Arc): void {
    if (!touch) {
      base.setVisible(false);
      knob.setVisible(false);
      return;
    }
    const r = this.sticks.radius;
    let dx = touch.x - touch.originX;
    let dy = touch.y - touch.originY;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      dx = (dx / d) * r; // knob drawn clamped on the ring
      dy = (dy / d) * r;
    }
    base.setPosition(touch.originX, touch.originY).setVisible(true);
    knob.setPosition(touch.originX + dx, touch.originY + dy).setVisible(true);
  }
}

/** Story 5.26: a building tile shows an Image (its build icon, else its world-art frame), not the turret/plank Graphics. */
function hasBarImage(type: string): boolean {
  return buildIconFrame(type) !== null || buildingFrame(type) !== null;
}
