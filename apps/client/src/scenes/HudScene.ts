import { LOOT_ICON_CSS_PX, LOOT_ICON_GAP_CSS_PX, hudBandTop, layoutLootLine } from "./hudTopLayout";
import { LOOT_ATLAS, LOOT_BADGE_FRAME } from "../render/city/lootBagAtlas";
import { BANNER_TEXT_PX, HP_BAR_H, HP_BAR_W, HP_MARGIN, HP_TEXT_PX, LINE_HEIGHT, MONEY_GAP_PX, MONEY_TEXT_PX, WAVE_TEXT_PX, WAVE_TOP_PX, WIDEST_HP_TEXT, WIDEST_MONEY_TEXT, WIDEST_WAVE_LINE, bannerWrapWidth, fitWaveText, hpRowText, layoutBanner, reportHudTextWidths } from "./hudTopLayout";
import { layoutBossBar } from "./bossBar";
import { PingHud } from "./PingHud"; // Story 8.7
import * as Phaser from "phaser";
import { dpr, safeArea } from "../display";
import { HudButtons } from "../input/HudButtons";
import { hudPointerDown, hudPointerMove, hudPointerReset, hudPointerUp } from "../input/hudPointer";
import {
  ACTION_INFO_CSS_PX,
  ACTION_LABEL_CSS_PX,
  LONG_PRESS_RING_CSS_PX,
  LONG_PRESS_RING_LINE_CSS_PX,
  MENU_BUTTON_CSS_PX,
  MENU_BUTTON_INSET_CSS_PX,
  MIN_TEXT_CSS_PX,
  READY_BUTTON_BOTTOM_CSS_PX,
  READY_BUTTON_H_CSS_PX,
  READY_BUTTON_W_CSS_PX,
  BUILD_COUNT_TEXT_CSS_PX,
  BUILD_PANEL_PAD_CSS_PX,
  BUILD_PRICE_TEXT_CSS_PX,
  BUILD_TILE_CSS_PX,
  HAND_CHIP_PAD_CSS_PX,
  HAND_CHIP_TEXT_CSS_PX,
  UNDO_GLYPH_CSS_PX,
  UNDO_RING_CSS_PX,
} from "../ui/sizes";
import { layoutUndoChip } from "./undoChip";
import { ACTION_IDS, actionLabel, layoutActionBar, newActionBarLayout, type ActionRect } from "./actionBar";
import { LongPress, longPressArmed, readyYields } from "../input/longPress";
import { unlockAudio } from "../audio/placeholderSfx";
import { TAP_SLOP_CSS_PX, TapDetector } from "../input/tapDetector";
import { ThumbDrag, onChipRect } from "../input/thumbDrag";
import { WheelRotate } from "../input/wheelRotate";

/** Phaser `pointer.button`: the primary (left) and secondary (right) mouse buttons (Story 5.23). */
const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;
import { BUTTON_TOLERANCE_PX } from "../input/routePointer";
import { KNOB_RADIUS_CSS_PX, STICK_RADIUS_CSS_PX, type StickTouch, type TouchSticks } from "../input/TouchSticks";
import type { HudModel } from "./hudModel";
import { layoutHandCluster, newHandLayout, type HandRect } from "./handCluster";
import { BUILD_BAR_SLOTS, PANEL_CELLS, PANEL_TAP_CONSUME, PANEL_TAP_KEEP, PANEL_TAP_NONE, buildPanelSlots, SLOT_EMPTY, SLOT_MORE, SLOT_SHOP, TILE_SHORT, layoutBuildCluster, layoutBuildPanel, newBuildClusterLayout, newBuildPanelLayout, onPanelCard, panelAllowed, panelTapOutside, readyClearLeft, readyLeftX, tileState, type BuildTile } from "./buildBar";
import { FRAME_WOOD, buildingFrame, ensureBuildingsAtlas, textureOfFrame } from "../render/city/buildingsAtlas";
import { BUILD_ICON_FRAME_H, BUILD_ICON_FRAME_W, BUILD_ICON_ORIGIN_X, BUILD_ICON_ORIGIN_Y, BUILD_ICON_TEXTURE, buildIconFrame, ensureBuildIcons } from "../render/city/buildIcons";
import { drawPlankIcon } from "../render/BuildingView";
import { drawTurretIcon } from "../render/TurretView";
import type { InputRouter } from "../input/InputRouter";
import { mixColor } from "../render/color";
import { edgeArrow } from "../render/edgeArrow";
import { BossHud } from "./BossHud";
import { MAX_PLAYERS } from "@topdown/shared";
import { COUNTDOWN_LIFT_M, MAX_DOWNED_MARKERS, MAX_RUSH_MARKERS, NAME_LIFT_M, SOLD_POP_QUEUE, hudTierMark, waveLine } from "./hudModel";
import { SLOT_COLORS, SLOT_COLOR_CSS } from "../render/playerColors";
import { MATE_ARROW_CSS_PX, MATE_ARROW_MARGIN_CSS_PX, MATE_ARROW_OUTLINE_CSS_PX, MATE_CROSS_CSS_PX, MATE_CROSS_INSET_CSS_PX, MATE_CROSS_THICK_CSS_PX, MATE_DOWNED_SCALE, MATE_LABEL_INSET_CSS_PX, MATE_LABEL_PAD_CSS_PX, MATE_NAME_TEXT_CSS_PX, createTeammateMarkers, teammateMarkers } from "../render/teammateMarkers";
import { pulseAlpha, pulseScale } from "../render/pulse";
import { PerfOverlay } from "../debug/PerfOverlay";
import { FIRE_POP_POOL, FIRE_POP_RISE_PX, PopPool, fireDamageLabel } from "../render/burnCue";
import { ATLAS_FX, FX_EDGE, FX_TIER_MARKS, FX_TIER_SCALE, ensureAtlases } from "../render/city/spriteAtlas";
import { GEAR_ICON_CSS_PX, GEAR_ICON_FRAME_PX, GEAR_ICON_TEXTURE, ensureGearIcons, gearIconFramesFor } from "../render/city/gearIcons";
import { RIGHT_BUTTON_CSS_PX, layoutRightButtons, layoutRowAboveCluster, newRightButtonsLayout } from "./consumableButton";
import { CONSUMABLE_ICON_CSS_PX, CONSUMABLE_ICON_FRAMES, CONSUMABLE_ICON_TEXTURE, ensureConsumableIcons } from "../render/city/consumableIcons";
import { barPx, cinemaTapPasses, filterHud, type CameraFiltered } from "./cinemaHud";

export interface HudSceneData {
  sticks: TouchSticks;
  model: HudModel;
  /** Pointer events go through the router: touches drive the sticks, the mouse aims and fires. */
  router: InputRouter;
  /** Stick radius in CSS px (STICK_RADIUS_CSS_PX, or the ?tune=1 value). */
  stickRadiusCss: number;
}

/** Story 12.3: the cinematic's letterbox and fade, above every HUD object (≤ 1004), the debug overlay above them. */
const CINEMA_BARS_DEPTH = 2000;
const CINEMA_FADE_DEPTH = 2001;
/** Review L1: ☰ between the bars and the fade while the cinematic is on (its own depth otherwise). */
const CINEMA_MENU_DEPTH = 2000.5;
const MENU_DEPTH = 1001;
/** Health bar size and placement in CSS px (× dpr). */
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
/** Swap (FR5) and Story 5.12's consumable button: 64 × 64 CSS px, placed by `layoutRightButtons` (consumableButton.ts). */
/** Story 5.12: the consumable button's count badge (CSS px) and its pending / greyed looks. */
const CONS_COUNT_PX = 16;
const CONS_PENDING_ALPHA = 0.5;
const CONS_GREY_ALPHA = 0.4;
const RELOAD_BAR_W = 120;
const RELOAD_BAR_H = 6;
/** Story 5.4: the fuel bar of a flame weapon (orange, under the fuel percent). */
const FUEL_BAR_COLOR = 0xff8a2a;
/** Wave panel (top-center) and banner. */
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
const NAME_TEXT_PX = MATE_NAME_TEXT_CSS_PX; // review N6: shared with the ping arrows' keep-off
const NAME_STROKE_PX = 3;
const NAME_STROKE = "#0b0d10";
/** Gap between a downed teammate's countdown and their name, CSS px. */
const NAME_GAP_PX = 2;
/** Wider than the rush arrows' margin, so the two kinds don't overlap at the same edge spot (10.2: in `teammateMarkers.ts`, shared with the ping arrows' keep-off). */
const MATE_ARROW_MARGIN = MATE_ARROW_MARGIN_CSS_PX;
const MATE_ARROW_OUTLINE_PX = MATE_ARROW_OUTLINE_CSS_PX;
const MATE_ARROW_OUTLINE = 0xffffff;
/** The downed "+" icon: arm length and thickness (CSS px), and its distance inside the arrow tip. */
const CROSS_PX = MATE_CROSS_CSS_PX;
const CROSS_THICK_PX = MATE_CROSS_THICK_CSS_PX;
const CROSS_INSET_PX = MATE_CROSS_INSET_CSS_PX;
const CROSS_COLOR = 0xffffff;
// An off-screen DOWNED teammate's arrow is MATE_DOWNED_SCALE bigger (before the pulse), so it can't be missed (`teammateMarkers.ts`).
/** Their "Bo · 14 s" label: centred this far inward from the arrow tip (CSS px), in this colour. */
const MATE_LABEL_INSET_PX = MATE_LABEL_INSET_CSS_PX;
const MATE_DOWNED_COLOR = "#ff6b6b";
const NAME_COLOR = "#ffffff";
/** Story 5.24 (D7): a teammate ghost's label ("Bo · Auto-turret"), CSS px × dpr, in the sender's colour. */
const GHOST_LABEL_PX = 12;
const GHOST_LABEL_STROKE_PX = 3;
/** Story 2.11: ☰ (three white bars on a dark square), and the toast line under the status line. */
const MENU_BAR_W_FRAC = 0.5;
const MENU_BAR_H_PX = 3;
const MENU_BAR_GAP_PX = 6;
const MENU_BG = 0x000000;
const MENU_BG_ALPHA = 0.35;
const MENU_RADIUS_PX = 8;
const MENU_BAR_COLOR = 0xffffff;
const TOAST_TEXT_PX = 18;
/** The toast line's colour (Story 7.12: a loot find takes the finder's slot colour instead). */
const TOAST_COLOR = "#ffffff";
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
const REPAIR_REASON = "#ff8a80";
/** Story 5.9: the Upgrade button when it would be accepted (steel blue: a stronger wall). */
const UPGRADE_FILL = 0x37587a;
const UPGRADE_BORDER = 0x90caf9;
/** Story 5.20: the Sell / Take back button (a coin gold) and the undo chip ↶ (dark disc, gold ring draining). */
const SELL_FILL = 0x6b5320;
const SELL_BORDER = 0xf2c94c;
/** Story 5.21 / 5.22: ✥ Move (a teal: "pick it up") and the long-press ring in the same colour. */
const MOVE_FILL = 0x1f5f5b;
const MOVE_BORDER = 0x64ffda;
/** The action buttons' HudButtons ids, in `ACTION_IDS` order (Repair / ✕ keep 3.7's ids). */
const ACTION_BUTTON_IDS = ["move", "upgrade", "repair", "sell", "repairClose"] as const;
/** The long-press ring is redrawn when its fill changes by 1/LONG_PRESS_RING_STEPS. */
const LONG_PRESS_RING_STEPS = 30;
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
/**
 * Story 10.10 (BU-1 = B): the tile objects — 0–7 the open panel's cells (Story 5.16's 8 slots), 8 the
 * quick tile (BU-3: the 1st short-list tile), 9 BU-3's 2nd short-list tile on Build's spot.
 */
const TILE_IDS = ["ptile0", "ptile1", "ptile2", "ptile3", "ptile4", "ptile5", "ptile6", "ptile7", "quick", "quick2"] as const;
const TILE_COUNT = TILE_IDS.length;
const T_QUICK = 8;
const T_SHORT2 = 9;
/** Story 10.10: what the build tiles show — hidden, BU-3's short list, the closed cluster, the open panel. */
const BAR_HIDDEN = 0;
const BAR_SHORT = 1;
const BAR_CLOSED = 2;
const BAR_OPEN = 3;
/** Story 10.10: Build / Close's icon box (centred `TILE_ICON_Y_PX` down), label size; the Shop chip's glyph; the ↻ "again" mark. */
const BUILD_ICON_PX = 11;
const BUILD_LABEL_PX = 13;
const SHOP_CHIP_GLYPH_PX = 22;
const AGAIN_R_PX = 10;
const AGAIN_GLYPH_PX = 13;
const BADGE_PAD_X_PX = 6;
const BADGE_H_PX = 20;
const PANEL_TITLE_PX = 15;
const PANEL_CARD_ALPHA = 0.72;
const PANEL_CARD_RADIUS_PX = 14;
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
const LINE_GAP_PX = 12;

/** Story 3.2: the wallet line under the HP text, and the "+N" pops above my survivor. */
/** A text line's height as a multiple of its font size. */
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
  /** Story 5.12 (AC 1): the consumable button (pooled circle + CI4 icon + count badge; redrawn on change only). */
  private consBtn!: Phaser.GameObjects.Arc;
  private consIcon!: Phaser.GameObjects.Image;
  private consCount!: Phaser.GameObjects.Text;
  /** Story 5.12 review L7: what the button shows (compared field by field: no string built per frame). */
  private shownConsFrame = "";
  private shownConsCount = -1;
  private shownConsLook = -1;
  /** The build bar was up at the last layout (the button then sits above the grid). */
  private consAboveBar = false;
  private menuBtn!: Phaser.GameObjects.Graphics;
  /** Story 8.7: the ping button and its wheel. */
  private pingHud!: PingHud;
  private readonly waveFit = { x: 0, scale: 1, compact: false };
  private shownMenuButton: boolean | null = null;
  private shownMenuOpen = false;
  private toastText!: Phaser.GameObjects.Text;
  /** Story 7.12 (BF2): the loot line's bag icon (made on first use) and what the toast line last showed. */
  private lootIcon: Phaser.GameObjects.Image | null = null;
  private readonly lootLineRect = { x: 0, y: 0, w: 0, h: 0, scale: 1 };
  private readonly lootBoss = { x: 0, y: 0, w: 0, h: 0, barY: 0, barH: 0 };
  private shownToastLoot = false;
  private shownToastSlot = -1;
  private shownToastBoss = false;
  private shownToast = "";
  /** Story 3.1: the Ready button (a Graphics redrawn on change only) and its label. */
  private readyBtn!: Phaser.GameObjects.Graphics;
  private readyLabel!: Phaser.GameObjects.Text;
  private shownReadyVisible: boolean | null = null;
  /** `readyOn`, count and total folded into one key (redraw only when it changes). */
  private shownReadyKey = -1;
  /**
   * Story 5.16 / 10.10: the build tiles (`TILE_IDS`: background, icon image or Graphics, price/label,
   * glyph), Build / Close, the Shop chip, the count (Build's badge, or the panel's header), the panel's
   * card and title and the quick tile's ↻. Slots and looks are redrawn only when the items, the page,
   * the mode, the quick type or the state key change.
   */
  private barTiles: Phaser.GameObjects.Graphics[] = [];
  private barIcons: Phaser.GameObjects.Image[] = [];
  private barIconGfx: Phaser.GameObjects.Graphics[] = [];
  private barPrices: Phaser.GameObjects.Text[] = [];
  private barGlyphs: Phaser.GameObjects.Text[] = [];
  private barCount!: Phaser.GameObjects.Text;
  private barBadge!: Phaser.GameObjects.Graphics;
  private buildBtn!: Phaser.GameObjects.Graphics;
  private buildIcon!: Phaser.GameObjects.Graphics;
  private buildLabel!: Phaser.GameObjects.Text;
  private shopChip!: Phaser.GameObjects.Graphics;
  private shopChipGlyph!: Phaser.GameObjects.Text;
  private panelCard!: Phaser.GameObjects.Graphics;
  private panelTitle!: Phaser.GameObjects.Text;
  private againMark!: Phaser.GameObjects.Graphics;
  private againGlyph!: Phaser.GameObjects.Text;
  private readonly cluster = newBuildClusterLayout();
  private readonly panel = newBuildPanelLayout();
  private readonly rightBtns = newRightButtonsLayout();
  /** Story 5.16's 8 slots (the panel's first 8 cells). */
  private readonly barSlots = new Int16Array(BUILD_BAR_SLOTS);
  /** Story 10.10: what each tile object shows (an item index or SLOT_*) and where (canvas px). */
  private readonly tileSlot = new Int16Array(TILE_COUNT);
  private readonly tileX = new Float32Array(TILE_COUNT);
  private readonly tileY = new Float32Array(TILE_COUNT);
  private barPage = 0;
  private barSlotsDirty = true;
  private shownBarMode = -1;
  private shownQuick = "";
  private shownBarItems: readonly BuildTile[] | null = null;
  private shownBarKey = -1;
  private shownBuildSecs = -2;
  private shownEndless = false; // Story 6.12
  private shownVoting = false; // Story 6.11
  private shownExtracting = false; // Story 12.2
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
  /** Story 5.23 (D18): the wheel's rotation steps while holding. */
  private readonly wheelRotate = new WheelRotate();
  private readonly dragOut = { dx: 0, dy: 0, began: false };
  /** Story 5.19: the item chip (panel, text) and what it last showed. */
  private placeChip!: Phaser.GameObjects.Graphics;
  private placeChipText!: Phaser.GameObjects.Text;
  private shownChip = "";
  private shownChipPinned: boolean | null = null;
  /** Story 5.22: Place's glyph shows "MOVE" (null = not set yet). */
  private shownMoving: boolean | null = null;
  /**
   * Story 5.21: the action bar (replaces 3.7's repair panel; `RepairPanel` keeps the logic): one
   * button per `ACTION_IDS` (Move · Upgrade · Repair · Sell · ✕) in one row bottom-right, the info
   * line and the red reason line right-aligned above it.
   */
  private readonly actBtns: Phaser.GameObjects.Graphics[] = [];
  private readonly actTexts: Phaser.GameObjects.Text[] = [];
  private readonly actLayout = newActionBarLayout();
  private readonly actOn = [false, false, false, false, false];
  private repairInfo!: Phaser.GameObjects.Text;
  private repairReason!: Phaser.GameObjects.Text;
  private shownRepairOpen: boolean | null = null;
  /** Which optional buttons are on the bar (bits: Move 1, Upgrade 2, Sell 8); −1 = not laid out yet. */
  private shownActKey = -1;
  private readonly shownActLabel = ["", "", "", "", ""];
  /** Review L2: each button's source text (and Repair's full-HP flag) its label was built from: the label is rebuilt only when it changes. */
  private readonly shownActSrc = ["", "", "", "", ""];
  private shownActFull: boolean | null = null;
  /** Per button: −1 = not drawn yet, 0 = dimmed, 1 = valid. */
  private readonly shownActLook = [-1, -1, -1, -1, -1];
  private shownRepairInfo = "";
  private shownRepairReason = "";
  /** Story 5.21 (AC 11): the long-press detector and its ring round the finger (redrawn on quantized change). */
  private readonly longPress = new LongPress();
  private pressRingG!: Phaser.GameObjects.Graphics;
  private shownRingStep = -1;
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
  /** Story 6.5: the boss bar and edge marker. */
  private bossHud: BossHud | null = null;
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
  private shownBannerColor = "";
  private shownBannerBoss = false;
  /** Story 6.14: layout scratch (no allocation per frame). */
  private readonly bannerAt = { x: 0, y: 0, w: 0, h: 0 };
  private readonly bannerBoss = { x: 0, y: 0, w: 0, h: 0, barY: 0, barH: 0 };
  private shownWeapon = "";
  private shownAmmo = Number.NaN;
  private shownMag = Number.NaN;
  private shownReloadStep = Number.NaN;
  private shownW = 0;
  private shownH = 0;
  private perfOverlay: PerfOverlay | null = null;
  /** Story 12.3: the extraction cinematic's letterbox (one Graphics, redrawn when its height or the screen changes), fade, and the objects that stay on. */
  private cinemaBars!: Phaser.GameObjects.Graphics;
  private cinemaFade!: Phaser.GameObjects.Rectangle;
  private readonly cinemaKeep: CameraFiltered[] = [];
  private cinemaHidden = false;
  private shownBarPx = -1;
  private shownBarW = -1;
  private shownBarH = -1;
  private readonly countdowns: Phaser.GameObjects.Text[] = [];
  /** Seconds each countdown text shows (setText only when it changes). */
  private readonly shownSecs = new Int32Array(MAX_DOWNED_MARKERS).fill(-1);
  private statusText!: Phaser.GameObjects.Text;
  private shownStatus = "";
  /** Story 2.9, all indexed by slot: name tags, edge arrows and downed crosses, created once. */
  private readonly names: Phaser.GameObjects.Text[] = [];
  /** Story 5.24: teammate ghost labels by slot, and the text each shows (setText only on change). */
  private readonly ghostLabels: Phaser.GameObjects.Text[] = [];
  private readonly shownGhostLabels: string[] = new Array<string>(MAX_PLAYERS).fill("");
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
    this.shownBannerBoss = false;
    this.shownStatus = "";
    this.shownSecs.fill(-1);
    this.shownNames.fill("");
    this.shownMenuButton = null;
    this.shownMenuOpen = false;
    this.shownToast = "";
    this.shownReadyVisible = null;
    this.shownReadyKey = -1;
    this.shownBarMode = -1; // Story 5.16 / 10.10
    this.shownQuick = "";
    this.model.buildPanelOpen = false; // Story 10.10: never remembered open across a restart
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
    this.shownMoving = null;
    this.shownRepairOpen = null;
    this.shownRepairInfo = "";
    this.shownRepairReason = "";
    this.shownActKey = -1;
    this.shownActLabel.fill("");
    this.shownActSrc.fill("");
    this.shownActFull = null;
    this.shownActLook.fill(-1);
    this.shownRingStep = -1;
    this.longPress.reset();
    this.shownUndoVisible = null;
    this.shownUndoHolding = null;
    this.shownUndoStep = -1;
    this.shownUndoArmed = null;
    this.taps.reset();
  }

  create(): void {
    this.lootIcon = null; // Story 7.12: Phaser reuses the scene object; the last run's icon went with its display list
    this.shownToastLoot = false;
    this.shownToastSlot = -1;
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
      .circle(0, 0, (RIGHT_BUTTON_CSS_PX / 2) * dpr(), 0xffffff, 0.14)
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
    // Story 5.12 (AC 1, D5): the consumable button, 16 px left of swap at the same height.
    ensureConsumableIcons(this);
    this.consBtn = this.add
      .circle(0, 0, (RIGHT_BUTTON_CSS_PX / 2) * dpr(), 0xffffff, 0.14)
      .setStrokeStyle(2 * dpr(), 0xffffff, 0.5)
      .setVisible(false);
    this.consIcon = this.add.image(0, 0, CONSUMABLE_ICON_TEXTURE, CONSUMABLE_ICON_FRAMES.medkit).setVisible(false);
    this.consCount = this.add.text(0, 0, "", this.outlinedStyle(CONS_COUNT_PX)).setOrigin(1, 1).setVisible(false);
    this.shownConsFrame = "";
    this.shownConsCount = -1;
    this.shownConsLook = -1;
    this.consAboveBar = false;
    this.buttons.set({ id: "consumable", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.consumablePressed = true;
    });
    // Story 2.11: ☰ top-right, away from both thumbs (the sticks live in the lower halves).
    this.menuBtn = this.add.graphics().setDepth(MENU_DEPTH).setVisible(false);
    this.buttons.set({ id: "menu", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.menuPressed = true;
    });
    this.pingHud = new PingHud(this, this.buttons, this.model); // Story 8.7: left of ☰
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
    // Story 10.10: the panel's card under its cells.
    this.panelCard = this.add.graphics().setDepth(1000).setVisible(false);
    this.panelTitle = this.add.text(0, 0, "Build", { ...this.outlinedStyle(PANEL_TITLE_PX), fontStyle: "bold" }).setOrigin(0, 0.5).setDepth(1002).setVisible(false);
    for (let s = 0; s < TILE_COUNT; s++) {
      this.barTiles.push(this.add.graphics().setDepth(1001).setVisible(false));
      this.barIcons.push(this.add.image(0, 0, textureOfFrame(FRAME_WOOD), FRAME_WOOD).setDepth(1002).setVisible(false));
      this.barIconGfx.push(this.add.graphics().setDepth(1002).setVisible(false));
      this.barGlyphs.push(this.add.text(0, 0, "", this.outlinedStyle(TILE_GLYPH_PX)).setOrigin(0.5).setDepth(1002).setVisible(false));
      this.barPrices.push(this.add.text(0, 0, "", { ...this.outlinedStyle(BUILD_PRICE_TEXT_CSS_PX), fontStyle: "bold" }).setOrigin(0.5).setDepth(1002).setVisible(false));
      this.buttons.set({ id: TILE_IDS[s] as string, x: 0, y: 0, w: 0, h: 0, visible: false }, () => this.pressTile(s));
    }
    // Story 10.10: Build (Close while the panel is open), the Shop chip above it, the quick tile's ↻ and the count badge.
    this.buildBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.buildIcon = this.add.graphics().setDepth(1002).setVisible(false);
    this.buildLabel = this.add.text(0, 0, "Build", { ...this.outlinedStyle(BUILD_LABEL_PX), fontStyle: "bold" }).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.buttons.set({ id: "build", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.buildPanelPressed = true; // the GameScene toggles the panel (review 1: not in 5.18's quiet window)
    });
    this.shopChip = this.add.graphics().setDepth(1001).setVisible(false);
    this.shopChipGlyph = this.add.text(0, 0, "🛒", this.outlinedStyle(SHOP_CHIP_GLYPH_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.buttons.set({ id: "shopchip", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      if (this.model.buildPick === "") this.model.shopPressed = true; // review L3 (5.16): a building picked this frame wins
    });
    this.againMark = this.add.graphics().setDepth(1003).setVisible(false);
    this.againGlyph = this.add.text(0, 0, "↻", { ...this.outlinedStyle(AGAIN_GLYPH_PX), fontStyle: "bold" }).setOrigin(0.5).setDepth(1004).setVisible(false);
    this.barBadge = this.add.graphics().setDepth(1003).setVisible(false);
    this.barCount = this.add.text(0, 0, "", { ...this.outlinedStyle(BUILD_COUNT_TEXT_CSS_PX), fontStyle: "bold" }).setOrigin(1, 0).setDepth(1004).setVisible(false);
    // Story 5.21: the action bar (Move · Upgrade · Repair · Sell · ✕; a touch on its buttons never starts a stick).
    this.actBtns.length = 0;
    this.actTexts.length = 0;
    for (let i = 0; i < ACTION_IDS.length; i++) {
      this.actBtns.push(this.add.graphics().setDepth(1001).setVisible(false));
      this.actTexts.push(this.add.text(0, 0, "", { ...this.outlinedStyle(ACTION_LABEL_CSS_PX), align: "center" }).setOrigin(0.5).setDepth(1002).setVisible(false));
      const id = ACTION_BUTTON_IDS[i] as string;
      this.buttons.set({ id, x: 0, y: 0, w: 0, h: 0, visible: false }, () => this.pressAction(i));
    }
    this.repairInfo = this.add.text(0, 0, "", { ...this.outlinedStyle(ACTION_INFO_CSS_PX), align: "right" }).setOrigin(1, 1).setDepth(1002).setVisible(false);
    this.repairReason = this.add
      .text(0, 0, "", { ...this.outlinedStyle(ACTION_INFO_CSS_PX), color: REPAIR_REASON, align: "right" })
      .setOrigin(1, 1)
      .setDepth(1002)
      .setVisible(false);
    this.pressRingG = this.add.graphics().setDepth(1003).setVisible(false);
    // Story 5.20: the undo chip ↶.
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
    this.bossHud = new BossHud(this); // Story 6.5 (objects made once per create)
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
    this.ghostLabels.length = 0;
    this.shownGhostLabels.fill("");
    this.mateArrows.length = 0;
    this.crosses.length = 0;
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      this.names.push(this.add.text(0, 0, "", this.nameStyle()).setOrigin(0.5).setVisible(false));
      this.ghostLabels.push(this.add.text(0, 0, "", this.ghostLabelStyle(slot)).setOrigin(0.5, 1).setVisible(false)); // Story 5.24
      const a = MATE_ARROW_CSS_PX * this.arrowDpr;
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
    // Story 12.3: the letterbox and fade above every HUD object; the debug overlay raised above them (AC 12's measure).
    this.cinemaBars = this.add.graphics().setDepth(CINEMA_BARS_DEPTH).setVisible(false);
    this.cinemaFade = this.add.rectangle(0, 0, 1, 1, 0x000000, 1).setOrigin(0, 0).setDepth(CINEMA_FADE_DEPTH).setVisible(false);
    this.perfOverlay.gameObject.setDepth(CINEMA_FADE_DEPTH + 1);
    this.cinemaKeep.length = 0;
    this.cinemaKeep.push(this.cinemaBars, this.cinemaFade, this.perfOverlay.gameObject, this.menuBtn); // review L1: ☰ stays
    this.cinemaHidden = false;
    this.shownBarPx = this.shownBarW = this.shownBarH = -1;
    this.hpText = this.add.text(0, 0, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(HP_TEXT_PX * dpr())}px`,
      color: "#ffffff",
    });
    // Story 3.2: wallet and "+N" pops (Phaser reuses this scene: the old objects died at shutdown).
    this.moneyText = this.add.text(0, 0, "", this.moneyStyle(MONEY_TEXT_PX)).setVisible(false);
    // Story 6.8 re-review 3 RR3-3: measure the widest wave line / HP text / money line with these very
    // styles (once per create, before the first frame), so the event arrow's keep-off rects match.
    {
      const k = dpr();
      const wave = this.waveText.setText(WIDEST_WAVE_LINE).width / k;
      const hp = this.hpText.setText(WIDEST_HP_TEXT).width / k;
      const money = this.moneyText.setText(WIDEST_MONEY_TEXT).width / k;
      this.waveText.setText("");
      this.hpText.setText("");
      this.moneyText.setText("");
      reportHudTextWidths(wave, hp, money);
    }
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
      // Story 12.3: the HUD is hidden under the extraction's cinematic (no hidden button answers); review L1: ☰ stays (menu, Leave).
      if (this.model.cinemaOn) {
        if (cinemaTapPasses(true, this.buttons.hit(p.x, p.y, this.scale.width))) this.buttons.pointerDown(p.id, p.x, p.y, this.scale.width);
        return;
      }
      this.pingHud.pointerDown(this.buttons.hit(p.x, p.y, this.scale.width)); // Story 8.7: a tap off the wheel closes it
      // Story 10.10 (AC 6): a touch outside the open Build panel closes it; off every button it is consumed
      // (no stick, no fire, no building selected), on another button (Ready, ping, ☰) that button still gets it.
      // Review 4, 5: a touch on the card itself keeps it open (consumed); a move-stick-half touch closes it and still walks.
      const open = this.shownBarMode === BAR_OPEN;
      const outside = panelTapOutside(open, this.buttons.hit(p.x, p.y, this.scale.width), open && onPanelCard(this.panel, p.x, p.y), p.wasTouch && p.x < this.scale.width / 2);
      if (outside !== PANEL_TAP_NONE) {
        if (outside !== PANEL_TAP_KEEP) this.model.buildPanelOpen = false;
        if (outside === PANEL_TAP_CONSUME || outside === PANEL_TAP_KEEP) {
          this.buttons.claim(p.id);
          this.router.pointerDown(p.id, p.x, p.y, p.wasTouch, p.button, true, this.scale.width);
          return;
        }
      }
      if (this.model.placementActive) {
        // Story 5.23 (AC 10, D13): a mouse while holding: right button puts away; a left press that
        // misses the HUD buttons places (on press, like the buttons); no mouse drag (the ghost follows the cursor).
        if (!p.wasTouch) {
          if (p.button === RIGHT_BUTTON) {
            this.model.cancelPressed = true;
            return;
          }
          if (this.buttons.pointerDown(p.id, p.x, p.y, this.scale.width).kind === "button") return;
          if (onChipRect(p.x, p.y, this.hand.chip, BUTTON_TOLERANCE_PX)) this.model.chipPressed = true;
          else if (p.button === LEFT_BUTTON) this.model.confirmPressed = true;
          return;
        }
        // Story 5.19 review M1: the chip is hit-tested first and is no HudButton (those press on
        // touch-down): a chip touch is claimed by the drag, a tap only if it lifts within dragStartPx.
        if (onChipRect(p.x, p.y, this.hand.chip, BUTTON_TOLERANCE_PX)) this.drag.down(p.id, p.x, p.y, true);
        else if (p.wasTouch && p.x < this.scale.width / 2) hudPointerDown(this.buttons, this.router, p, this.scale.width);
        else if (this.buttons.pointerDown(p.id, p.x, p.y, this.scale.width).kind !== "button") this.drag.down(p.id, p.x, p.y); // Story 5.19
        return;
      }
      // Story 5.21 (AC 7, D8): a touch on Ready over a building's tap area goes to the building (tap / long-press), not Ready.
      const m = this.model;
      if (readyYields(this.buttons.hit(p.x, p.y, this.scale.width), m.tapsEnabled, m.buildingAt?.(p.x, p.y) === true)) {
        this.buttons.claim(p.id);
        this.router.pointerDown(p.id, p.x, p.y, p.wasTouch, p.button, true, this.scale.width);
        this.taps.down(p.id, p.x, p.y, this.time.now, true);
        this.longPress.down(p.id, p.x, p.y, this.time.now, true);
        return;
      }
      hudPointerDown(this.buttons, this.router, p, this.scale.width);
      // Story 3.7: the tap detector only watches (the stick or the mouse fire already started as usual).
      const eligible = !this.buttons.owns(p.id);
      this.taps.down(p.id, p.x, p.y, this.time.now, eligible);
      this.longPress.down(p.id, p.x, p.y, this.time.now, eligible && m.tapsEnabled && longPressArmed(p.wasTouch, p.x, this.scale.width)); // Story 5.21 (review M1: not the move stick's half)
    };
    const move = (p: Phaser.Input.Pointer) => {
      if (p.id === this.drag.pointerId) this.dragMove(p.id, p.x, p.y); // Story 5.19
      this.taps.move(p.id, p.x, p.y, TAP_SLOP_CSS_PX * dpr());
      this.longPress.move(p.id, p.x, p.y, TAP_SLOP_CSS_PX * dpr()); // Story 5.21
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
      this.longPress.up(p.id); // Story 5.21
      hudPointerUp(this.buttons, this.router, p);
    };
    const reset = () => {
      hudPointerReset(this.buttons, this.router);
      this.taps.reset();
      this.longPress.reset(); // Story 5.21
      this.drag.reset();
      this.model.dragHeld = false;
    };
    // Story 5.23 (AC 10, D18): the wheel turns a held ghost (down clockwise, up counter-clockwise).
    const wheel = (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (!this.model.placementActive) {
        this.wheelRotate.reset();
        return;
      }
      const mode = (p.event as WheelEvent | undefined)?.deltaMode ?? 0;
      const step = this.wheelRotate.wheel(dy, mode, this.time.now);
      if (step > 0) this.model.rotatePressed = true;
      else if (step < 0) this.model.rotateCcwPressed = true;
    };
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, wheel);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, down);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, move);
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
    this.game.events.on(Phaser.Core.Events.BLUR, reset);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_WHEEL, wheel);
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
  /** Story 5.24: a teammate ghost label (bold, slot colour, dark stroke). */
  private ghostLabelStyle(slot: number): Phaser.Types.GameObjects.Text.TextStyle {
    const k = dpr();
    return {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(GHOST_LABEL_PX * k)}px`,
      color: SLOT_COLOR_CSS[slot] ?? SLOT_COLOR_CSS[0],
      fontStyle: "bold",
      stroke: NAME_STROKE,
      strokeThickness: Math.round(GHOST_LABEL_STROKE_PX * k),
    };
  }

  /**
   * Story 5.24 (AC 5): each live teammate ghost's label above its outline (the Game scene's
   * `TeammateGhostView` fills the model; world → screen like the name tags). Under the hand cluster.
   */
  private drawGhostLabels(): void {
    const m = this.model;
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      const t = this.ghostLabels[slot];
      if (!t) continue;
      if (m.ghostLabelShown[slot] !== 1) {
        if (t.visible) t.setVisible(false);
        continue;
      }
      const text = m.ghostLabelText[slot] ?? "";
      if (text !== this.shownGhostLabels[slot]) {
        this.shownGhostLabels[slot] = text;
        t.setText(text);
      }
      const sx = ((m.ghostLabelAt[slot * 2] as number) - m.camX) * m.camZoom;
      const sy = ((m.ghostLabelAt[slot * 2 + 1] as number) - m.camY) * m.camZoom;
      t.setPosition(sx, sy).setVisible(true);
    }
  }

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

  /** Story 5.12 / 10.10 (AC 8): swap + consumable — above the Build cluster while it is up, else bottom right. */
  private rightRow(k: number): ReturnType<typeof layoutRightButtons> {
    const safe = this.insets;
    const w = this.scale.width;
    const h = this.scale.height;
    if (!this.consAboveBar) return layoutRightButtons(w, h, safe.right, safe.bottom, k, false, 0, 0, this.rightBtns);
    const c = layoutBuildCluster(w, h, safe.right, safe.bottom, k, this.cluster);
    return layoutRowAboveCluster(w, h, safe.right, safe.bottom, k, c.top, c.right, this.rightBtns, safe.top); // re-review 2: under a top inset too
  }

  /** Places HUD buttons inside the safe area (canvas px) and registers their hit rects. */
  private layoutButtons(): void {
    const k = dpr();
    const l = this.rightRow(k);
    const size = l.size;
    const x = l.swapX;
    const y = l.swapY;
    const rect = this.buttons.get("swap");
    if (rect) Object.assign(rect, { x, y, w: size, h: size });
    this.swapBtn.setRadius(size / 2).setPosition(x + size / 2, y + size / 2);
    this.swapLabel.setFontSize(Math.round(28 * k)).setPosition(x + size / 2, y + size / 2);
    this.layoutConsumableButton();
    this.layoutMenuButton();
    this.pingHud.layout(this.scale.width, this.insets, k, this.scale.height); // Story 8.7 (10.5: the height fits the column)
    this.layoutBuildBar(); // Story 5.16: before Ready (Ready keeps clear of the grid)
    this.layoutReadyButton();
    this.layoutPlacementButtons();
    this.layoutActionBar();
    this.layoutUndo(); // Story 5.20: after the build bar and the hand cluster (it sits by both)
  }

  /** Story 5.20 (D4) / 10.10 (re-review 1): ↶ on its one spot (`layoutUndoChip`), hands empty or full. */
  private layoutUndo(): void {
    const k = dpr();
    const l = layoutUndoChip(this.scale.width, this.scale.height, this.insets.right, this.insets.bottom, k, this.undoRect);
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
    const shown = m.undoVisible && this.barMode() !== BAR_OPEN; // Story 10.10: under the open Build panel
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
   * Story 5.12 (D5): the consumable button 16 px left of swap at the same height; while the build bar
   * is up (5.16: the swap is hidden under it) above the grid's left edge, so the medkit stays usable.
   */
  private layoutConsumableButton(): void {
    const k = dpr();
    const l = this.rightRow(k);
    const size = l.size;
    const x = l.consX;
    const y = l.consY;
    const rect = this.buttons.get("consumable");
    if (rect) Object.assign(rect, { x, y, w: size, h: size });
    this.consBtn.setRadius(size / 2).setPosition(x + size / 2, y + size / 2);
    const icon = CONSUMABLE_ICON_CSS_PX * k;
    this.consIcon.setDisplaySize(icon, icon).setPosition(x + size / 2, y + size / 2);
    this.consCount.setFontSize(Math.round(CONS_COUNT_PX * k)).setPosition(x + size - 2 * k, y + size - 1 * k);
  }

  /** Story 5.12 (AC 1, 7): the button's visibility, icon, count and greyed / pending look (touched on change only). */
  private drawConsumable(): void {
    const m = this.model;
    if (m.buildBar !== this.consAboveBar) {
      this.consAboveBar = m.buildBar;
      this.layoutButtons(); // swap and the consumable move above / below the build bar together
    }
    const frame = m.consumableItem !== null ? CONSUMABLE_ICON_FRAMES[m.consumableItem] : undefined;
    const show = m.consumableVisible && frame !== undefined && !m.voting && !m.watching && this.barMode() !== BAR_OPEN; // Story 10.10: under the open Build panel // Story 6.11: hidden in the vote; 8.2: and while waiting (8.7 B5 amended: it stays while the ping wheel is open)
    const look = !show ? 0 : m.consumablePending ? 2 : m.consumableUsable ? 1 : 3;
    const f = show ? (frame as string) : "";
    const count = show ? m.consumableCount : -1;
    if (f === this.shownConsFrame && count === this.shownConsCount && look === this.shownConsLook) return;
    this.shownConsFrame = f;
    this.shownConsCount = count;
    this.shownConsLook = look;
    this.buttons.setVisible("consumable", show);
    this.consBtn.setVisible(show);
    this.consIcon.setVisible(show);
    this.consCount.setVisible(show);
    if (!show) return;
    this.consIcon.setFrame(frame as string);
    this.consCount.setText(`${m.consumableCount}`);
    // usable: full; pending: dimmed (AC 7); not usable now (full HP, a throwable in a build phase): greyed.
    const a = look === 1 ? 1 : look === 2 ? CONS_PENDING_ALPHA : CONS_GREY_ALPHA;
    this.consIcon.setAlpha(a);
    this.consCount.setAlpha(a);
    this.consBtn.setFillStyle(0xffffff, look === 1 ? 0.14 : 0.07).setStrokeStyle(2 * dpr(), 0xffffff, look === 1 ? 0.5 : 0.25);
    if (look === 3) this.consIcon.setTint(0x9a9a9a);
    else this.consIcon.clearTint();
  }

  /** Story 5.21: a tap on action button `i` (`ACTION_IDS` order) → the model's press flag. */
  private pressAction(i: number): void {
    const m = this.model;
    const id = ACTION_IDS[i];
    if (id === "move") m.movePressed = true;
    else if (id === "upgrade") m.upgradePressed = true;
    else if (id === "repair") m.repairPressed = true;
    else if (id === "sell") m.sellPressed = true;
    else m.repairClosePressed = true;
  }

  /**
   * Story 5.21 (AC 1, 5): the action bar's row (`layoutActionBar`: right-aligned at 16, centre bottom
   * 112, absent buttons closed up to the right) and the info / reason lines right-aligned above it.
   */
  private layoutActionBar(): void {
    const k = dpr();
    const m = this.model;
    const on = this.actOn;
    on[0] = m.moveShown;
    on[1] = m.upgradeShown;
    on[3] = m.sellShown;
    const l = layoutActionBar(this.scale.width, this.scale.height, this.insets.right, this.insets.bottom, k, on, this.actLayout);
    const open = this.shownRepairOpen === true;
    for (let i = 0; i < ACTION_IDS.length; i++) {
      const r = l.rects[i] as ActionRect;
      const id = ACTION_BUTTON_IDS[i] as string;
      const rect = this.buttons.get(id);
      if (rect) Object.assign(rect, { x: r.x, y: r.y, w: r.w, h: r.h });
      const shown = open && r.visible;
      this.buttons.setVisible(id, shown);
      (this.actBtns[i] as Phaser.GameObjects.Graphics).setPosition(r.x, r.y).setVisible(shown);
      (this.actTexts[i] as Phaser.GameObjects.Text)
        .setFontSize(Math.round((ACTION_IDS[i] === "close" ? READY_TEXT_PX : ACTION_LABEL_CSS_PX) * k))
        .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
        .setLineSpacing(-2 * k)
        .setPosition(r.x + r.w / 2, r.y + r.h / 2)
        .setVisible(shown);
    }
    // The info lines wrap clear of the survivor at the screen centre (14 px on a narrow screen: they still clear ☰).
    this.repairInfo.setFontSize(Math.round(l.infoPx)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setWordWrapWidth(l.infoMaxW, true).setPosition(l.infoRight, l.infoBottom);
    this.repairReason.setFontSize(Math.round(l.infoPx)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setWordWrapWidth(l.infoMaxW, true);
    this.placeReasonLine();
    this.shownActLook.fill(-1); // redraw at the new size
  }

  /** The red reason line sits right above the info lines (their height changes with the text). */
  private placeReasonLine(): void {
    this.repairReason.setPosition(this.actLayout.infoRight, this.actLayout.infoBottom - this.repairInfo.height);
  }

  /** Story 5.21: shows, hides and updates the action bar (only when what it shows changes). */
  private drawActionBar(): void {
    const m = this.model;
    const open = m.repairOpen;
    if (open !== this.shownRepairOpen) {
      this.shownRepairOpen = open;
      this.repairInfo.setVisible(open);
      this.repairReason.setVisible(open);
      this.shownActKey = -1; // lay out (and show / hide every button) below
      if (!open) {
        for (let i = 0; i < ACTION_IDS.length; i++) {
          this.buttons.setVisible(ACTION_BUTTON_IDS[i] as string, false);
          (this.actBtns[i] as Phaser.GameObjects.Graphics).setVisible(false);
          (this.actTexts[i] as Phaser.GameObjects.Text).setVisible(false);
        }
      }
    }
    if (!open) return;
    const key = (m.moveShown ? 1 : 0) | (m.upgradeShown ? 2 : 0) | (m.sellShown ? 8 : 0);
    if (key !== this.shownActKey) {
      this.shownActKey = key;
      this.layoutActionBar();
    }
    if (m.repairInfo !== this.shownRepairInfo) {
      this.shownRepairInfo = m.repairInfo;
      this.repairInfo.setText(m.repairInfo);
      this.placeReasonLine();
    }
    if (m.barReason !== this.shownRepairReason) {
      this.shownRepairReason = m.barReason;
      this.repairReason.setText(m.barReason);
    }
    const k = dpr();
    for (let i = 0; i < ACTION_IDS.length; i++) {
      const r = this.actLayout.rects[i] as ActionRect;
      if (!r.visible) continue;
      const id = ACTION_IDS[i];
      // Review L2: the two-line label is rebuilt only when its source text changes (no string per frame).
      const src = id === "move" ? m.moveLabel : id === "upgrade" ? m.upgradeLabel : id === "repair" ? m.repairLabel : id === "sell" ? m.sellLabel : "✕";
      const text = this.actTexts[i] as Phaser.GameObjects.Text;
      if (src !== this.shownActSrc[i] || (id === "repair" && m.repairFull !== this.shownActFull)) {
        this.shownActSrc[i] = src;
        if (id === "repair") this.shownActFull = m.repairFull;
        const label = id === "move" ? (src === "Move" ? "✥\nMove" : src) : id === "repair" && m.repairFull ? "Repair\nfull HP" : id === "close" ? src : actionLabel(src);
        if (label !== this.shownActLabel[i]) {
          this.shownActLabel[i] = label;
          text.setText(label);
        }
      }
      const valid = id === "move" ? m.moveValid : id === "upgrade" ? m.upgradeReason === "" : id === "repair" ? m.repairReason === "" : id === "sell" ? m.sellReason === "" : true;
      const look = valid ? 1 : 0;
      if (look === this.shownActLook[i]) continue;
      this.shownActLook[i] = look;
      const fill = id === "move" ? MOVE_FILL : id === "upgrade" ? UPGRADE_FILL : id === "repair" ? PLACE_CONFIRM : id === "sell" ? SELL_FILL : PLACE_CANCEL;
      const border = id === "move" ? MOVE_BORDER : id === "upgrade" ? UPGRADE_BORDER : id === "repair" ? REPAIR_OK : id === "sell" ? SELL_BORDER : READY_BORDER;
      const g = this.actBtns[i] as Phaser.GameObjects.Graphics;
      g.clear();
      g.fillStyle(valid ? fill : READY_BG, valid ? 0.85 : READY_BG_ALPHA).fillRoundedRect(0, 0, r.w, r.h, READY_RADIUS_PX * k);
      g.lineStyle(READY_BORDER_PX * k, valid ? border : READY_BORDER, 0.9).strokeRoundedRect(0, 0, r.w, r.h, READY_RADIUS_PX * k);
      g.setAlpha(valid ? 1 : REPAIR_DIM_ALPHA);
      text.setAlpha(valid ? 1 : REPAIR_DIM_ALPHA);
    }
  }

  /**
   * Story 5.21 (AC 11): the long-press — the detector's state into the model (the scene answers
   * whether the press is on my building, `pressRing`), and the ring round the finger.
   */
  private drawLongPress(): void {
    const m = this.model;
    const now = this.time.now;
    if (!m.tapsEnabled) this.longPress.reset();
    m.pressHeldMs = this.longPress.heldMs(now);
    m.pressX = this.longPress.pressX;
    m.pressY = this.longPress.pressY;
    if (this.longPress.update(now, m.longPressMs)) {
      m.longPressFired = true;
      m.longPressX = this.longPress.pressX;
      m.longPressY = this.longPress.pressY;
    }
    const step = m.pressRing < 0 || m.pressHeldMs < 0 ? -1 : Math.round(m.pressRing * LONG_PRESS_RING_STEPS);
    if (step === this.shownRingStep) return;
    this.shownRingStep = step;
    const g = this.pressRingG;
    if (step < 0) {
      g.setVisible(false);
      return;
    }
    const k = dpr();
    const r = LONG_PRESS_RING_CSS_PX * k;
    g.clear();
    g.lineStyle(LONG_PRESS_RING_LINE_CSS_PX * k, 0x000000, 0.45).strokeCircle(0, 0, r);
    if (step > 0) {
      g.lineStyle(LONG_PRESS_RING_LINE_CSS_PX * k, MOVE_BORDER, 1);
      g.beginPath();
      g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * step) / LONG_PRESS_RING_STEPS, false);
      g.strokePath();
    }
    g.setPosition(m.pressX, m.pressY).setVisible(true);
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
    if (!placing) {
      this.wheelRotate.reset(); // Story 5.23 (review L6): a partial notch never carries into the next hold
      return;
    }
    if (m.placementMoving !== this.shownMoving) {
      // Story 5.22 (AC 12): Place reads "MOVE" while I hold one of my buildings.
      this.shownMoving = m.placementMoving;
      (this.placeGlyphs[PLACE_IDS.indexOf("confirm")] as Phaser.GameObjects.Text).setText(m.placementMoving ? "MOVE" : (PLACE_GLYPHS[1] as string));
    }
    this.drawHandButtons(m.placementValid || m.placementResting); // Story 5.23 (AC 7): no red ring while resting
    this.drawChip();
    if (m.placementHint !== this.shownHint) {
      this.shownHint = m.placementHint;
      this.placeHint.setText(m.placementHint);
    }
    const hintValid = m.placementValid || m.placementResting; // Story 5.23: the resting ghost's line is the label
    if (hintValid !== this.shownHintValid) {
      this.shownHintValid = hintValid;
      this.placeHint.setColor(hintValid ? HINT_VALID : HINT_BLOCKED);
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
    const x = readyLeftX(this.scale.width, w, readyClearLeft(this.panel), k); // Story 10.10 (B4): clear of the open card (it never jumps; ↶ sits above Ready's row)
    const y = this.scale.height - (READY_BUTTON_BOTTOM_CSS_PX + this.insets.bottom) * k - h;
    const rect = this.buttons.get("ready");
    if (rect) Object.assign(rect, { x, y, w, h });
    this.readyBtn.setPosition(x, y);
    this.readyLabel.setFontSize(Math.round(READY_TEXT_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(x + w / 2, y + h / 2);
    this.shownReadyKey = -1; // redraw at the new size
  }

  /**
   * Story 10.10: the Build cluster (`layoutBuildCluster`) and the open panel (`layoutBuildPanel`), from
   * the bottom-right safe-area corner. Fixed parts (Build / Close, the Shop chip, the card, the ↻) are
   * drawn here; the tiles go where the mode puts them (`placeBarSlots`).
   */
  private layoutBuildBar(): void {
    const k = dpr();
    const w = this.scale.width;
    const h = this.scale.height;
    const c = layoutBuildCluster(w, h, this.insets.right, this.insets.bottom, k, this.cluster);
    const p = layoutBuildPanel(w, h, this.insets.right, this.insets.bottom, k, this.panel, this.insets.top);
    this.buildLabel.setFontSize(Math.round(BUILD_LABEL_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k * 0.75));
    const chipRect = this.buttons.get("shopchip");
    if (chipRect) Object.assign(chipRect, { x: c.chipX, y: c.chipY, w: c.chip, h: c.chip });
    const r = c.chip / 2;
    this.shopChip
      .clear()
      .fillStyle(READY_BG, READY_BG_ALPHA)
      .fillCircle(r, r, r)
      .lineStyle(TILE_BORDER_PX * 1.4 * k, SHOP_BORDER, 1)
      .strokeCircle(r, r, r - TILE_BORDER_PX * 0.7 * k)
      .setPosition(c.chipX, c.chipY);
    this.shopChipGlyph.setFontSize(Math.round(SHOP_CHIP_GLYPH_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k * 0.5)).setPosition(c.chipX + r, c.chipY + r);
    const ar = AGAIN_R_PX * k;
    this.againMark
      .clear()
      .fillStyle(READY_BG, 0.85)
      .fillCircle(0, 0, ar)
      .lineStyle(TILE_BORDER_PX * k, READY_BORDER, TILE_BORDER_ALPHA)
      .strokeCircle(0, 0, ar)
      .setPosition(c.quickX + ar / 2, c.quickY + ar / 2);
    this.againGlyph.setFontSize(Math.round(AGAIN_GLYPH_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k * 0.5)).setPosition(c.quickX + ar / 2, c.quickY + ar / 2);
    this.panelCard
      .clear()
      .fillStyle(READY_BG, PANEL_CARD_ALPHA)
      .fillRoundedRect(0, 0, p.cardW, p.cardH, PANEL_CARD_RADIUS_PX * k)
      .lineStyle(TILE_BORDER_PX * k, READY_BORDER, 0.35)
      .strokeRoundedRect(0, 0, p.cardW, p.cardH, PANEL_CARD_RADIUS_PX * k)
      .setPosition(p.cardX, p.cardY);
    this.panelTitle
      .setFontSize(Math.round(PANEL_TITLE_PX * k))
      .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k * 0.75))
      .setPosition(p.cardX + (BUILD_PANEL_PAD_CSS_PX + 2) * k, p.headerY);
    this.barCount.setFontSize(Math.round(BUILD_COUNT_TEXT_CSS_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k * 0.75));
    for (let s = 0; s < TILE_COUNT; s++) {
      (this.barGlyphs[s] as Phaser.GameObjects.Text).setFontSize(Math.round(TILE_GLYPH_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k));
      (this.barPrices[s] as Phaser.GameObjects.Text).setFontSize(Math.round(BUILD_PRICE_TEXT_CSS_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k * 0.75));
    }
    this.barSlotsDirty = true; // tiles re-placed and icons re-fitted at the new size
    this.shownBarKey = -1;
  }

  /** Story 5.16: a tile tap (HudButtons handler): a building → `buildPick`, Shop → `shopPressed`, More ▸ → the next page. */
  private pressTile(s: number): void {
    const slot = this.tileSlot[s] as number;
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

  /** Story 10.10: the mode the build tiles are in now (hidden under the open ping wheel, Story 8.7). */
  private barMode(): number {
    const m = this.model;
    const v = m.buildBar && !this.pingHud.wheelOpen; // Story 8.7: hidden under the open ping wheel (≤ 3 s)
    if (!v) return BAR_HIDDEN;
    if (!panelAllowed(m.buildItems.length)) return BAR_SHORT;
    return m.buildPanelOpen ? BAR_OPEN : BAR_CLOSED;
  }

  /**
   * Story 5.16 / 10.10: shows, hides and redraws the build tiles, only when something they show changes:
   * the mode, the slots (items, page, quick type, layout) re-place the tiles, icons and labels; the state
   * key (each tile's short/cap bits, my count, the cap) redraws the tiles' looks and the count. No allocation otherwise.
   */
  private drawBuildBar(): void {
    const m = this.model;
    const mode = this.barMode();
    if (m.buildItems !== this.shownBarItems) {
      this.shownBarItems = m.buildItems;
      this.barPage = 0;
      this.barSlotsDirty = true;
    }
    if (m.buildQuick !== this.shownQuick) {
      this.shownQuick = m.buildQuick;
      this.barSlotsDirty = true;
    }
    if (mode !== this.shownBarMode || this.barSlotsDirty) {
      if (mode !== BAR_OPEN && this.barPage !== 0) this.barPage = 0; // review L4 (5.16): the panel reopens on its first page
      this.shownBarMode = mode;
      this.placeBarSlots(mode);
      for (let s = 0; s < TILE_COUNT; s++) {
        const slot = this.tileSlot[s] as number;
        const on = slot !== SLOT_EMPTY;
        this.buttons.setVisible(TILE_IDS[s] as string, on);
        (this.barTiles[s] as Phaser.GameObjects.Graphics).setVisible(on);
        (this.barPrices[s] as Phaser.GameObjects.Text).setVisible(on);
        (this.barGlyphs[s] as Phaser.GameObjects.Text).setVisible(on && slot < 0);
        const framed = slot >= 0 && hasBarImage((m.buildItems[slot] as BuildTile).id);
        (this.barIcons[s] as Phaser.GameObjects.Image).setVisible(on && framed);
        (this.barIconGfx[s] as Phaser.GameObjects.Graphics).setVisible(on && slot >= 0 && !framed);
      }
      const build = mode === BAR_CLOSED || mode === BAR_OPEN;
      const chip = mode === BAR_SHORT || mode === BAR_CLOSED;
      this.buttons.setVisible("build", build);
      this.buildBtn.setVisible(build);
      this.buildIcon.setVisible(build);
      this.buildLabel.setVisible(build);
      this.buttons.setVisible("shopchip", chip);
      this.shopChip.setVisible(chip);
      this.shopChipGlyph.setVisible(chip);
      const again = mode === BAR_CLOSED && (this.tileSlot[T_QUICK] as number) >= 0;
      this.againMark.setVisible(again);
      this.againGlyph.setVisible(again);
      this.panelCard.setVisible(mode === BAR_OPEN);
      this.panelTitle.setVisible(mode === BAR_OPEN);
      this.barCount.setVisible(mode !== BAR_HIDDEN);
      this.barBadge.setVisible(mode === BAR_SHORT || mode === BAR_CLOSED);
      if (build) this.drawBuildButton(mode === BAR_OPEN);
      else this.buttons.setVisible("build", false);
      this.shownBarKey = -1;
    }
    if (mode === BAR_HIDDEN) return;
    let bits = 0;
    for (let s = 0; s < TILE_COUNT; s++) {
      const slot = this.tileSlot[s] as number;
      if (slot >= 0) bits += tileState(m.buildOwned, m.buildCap, m.money, (m.buildItems[slot] as BuildTile).price) * 4 ** s;
    }
    const key = bits + m.buildOwned * 4 ** TILE_COUNT + m.buildCap * 4 ** TILE_COUNT * 256;
    if (key === this.shownBarKey) return;
    this.shownBarKey = key;
    const k = dpr();
    const t = this.shownBarMode === BAR_OPEN ? this.panel.tile : this.cluster.tile;
    for (let s = 0; s < TILE_COUNT; s++) {
      const slot = this.tileSlot[s] as number;
      if (slot === SLOT_EMPTY) continue;
      const st = slot >= 0 ? tileState(m.buildOwned, m.buildCap, m.money, (m.buildItems[slot] as BuildTile).price) : 0;
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
    const count = this.barCount.setText(`${m.buildOwned}/${m.buildCap}`).setColor(m.buildOwned >= m.buildCap ? COUNT_FULL : COUNT_OK);
    if (this.shownBarMode === BAR_OPEN) {
      count.setOrigin(1, 0.5).setPosition(this.panel.cardX + this.panel.cardW - (BUILD_PANEL_PAD_CSS_PX + 2) * k, this.panel.headerY);
      return;
    }
    // The badge on Build's top-right corner (BU-3: on the corner tile): a dark pill behind the count.
    const c = this.cluster;
    const bw = count.width + 2 * BADGE_PAD_X_PX * k;
    const bh = BADGE_H_PX * k;
    this.barBadge
      .clear()
      .fillStyle(READY_BG, 0.85)
      .fillRoundedRect(0, 0, bw, bh, bh / 2)
      .lineStyle(TILE_BORDER_PX * k, READY_BORDER, TILE_BORDER_ALPHA)
      .strokeRoundedRect(0, 0, bw, bh, bh / 2)
      .setPosition(c.badgeX - bw, c.badgeY);
    count.setOrigin(1, 0.5).setPosition(c.badgeX - BADGE_PAD_X_PX * k, c.badgeY + bh / 2);
  }

  /**
   * Story 10.10: Build (hammer + "Build") on its corner spot or, while the panel is open, Close (✕ +
   * "Close") as the panel's 9th cell (the same spot; 10.10-B3: a shrunk cell on the tightest screen).
   */
  private drawBuildButton(close: boolean): void {
    const k = dpr();
    const c = this.cluster;
    const p = this.panel;
    const t = close ? p.tile : c.tile;
    const x = close ? (p.x[PANEL_CELLS - 1] as number) : c.buildX;
    const y = close ? (p.y[PANEL_CELLS - 1] as number) : c.buildY;
    const rect = this.buttons.get("build");
    if (rect) Object.assign(rect, { x, y, w: t, h: t });
    this.buildBtn.setPosition(x, y);
    const f = t / (BUILD_TILE_CSS_PX * k); // review 6: a shrunk cell (10.10-B3)
    this.buildIcon.setPosition(x + t / 2, y + TILE_ICON_Y_PX * k * f);
    this.buildLabel.setPosition(x + t / 2, y + TILE_PRICE_Y_PX * k * f);
    const g = this.buildBtn.clear();
    g.fillStyle(READY_BG, READY_BG_ALPHA).fillRoundedRect(0, 0, t, t, TILE_RADIUS_PX * k);
    g.lineStyle(TILE_BORDER_PX * 1.4 * k, READY_BORDER, 0.95).strokeRoundedRect(0, 0, t, t, TILE_RADIUS_PX * k);
    const s = BUILD_ICON_PX * k;
    const ic = this.buildIcon.clear().lineStyle(3 * k, 0xf4f4f2, 1);
    if (close) {
      ic.lineBetween(-s * 0.7, -s * 0.7, s * 0.7, s * 0.7).lineBetween(s * 0.7, -s * 0.7, -s * 0.7, s * 0.7);
    } else {
      // A hammer: the handle down-left, the head across its top end.
      ic.lineBetween(-s * 0.8, s * 0.85, s * 0.25, -s * 0.2);
      const hx = s * 0.35;
      const hy = -s * 0.3;
      const u = Math.SQRT1_2;
      const L = s * 0.75;
      const W = s * 0.32;
      const ax = hx - u * L + u * W;
      const ay = hy - u * L - u * W;
      const bx = hx + u * L + u * W;
      const by = hy + u * L - u * W;
      const cx = hx + u * L - u * W;
      const cy = hy + u * L + u * W;
      const dx = hx - u * L - u * W;
      const dy = hy - u * L + u * W;
      ic.fillStyle(0xf4f4f2, 1).fillTriangle(ax, ay, bx, by, cx, cy).fillTriangle(ax, ay, cx, cy, dx, dy);
    }
    this.buildLabel.setText(close ? "Close" : "Build");
  }

  /**
   * Story 5.16 / 10.10: what each tile object shows and where, by mode (on change only) — open: the 8
   * slots (page, Shop last) in the panel's cells; closed: the quick type on the quick tile; BU-3: the 1–2
   * types on the quick tile's and Build's spots. Then their icons and labels.
   */
  private placeBarSlots(mode: number): void {
    this.barSlotsDirty = false;
    const items = this.model.buildItems;
    const c = this.cluster;
    const p = this.panel;
    this.tileSlot.fill(SLOT_EMPTY);
    let quick = -1;
    for (let i = 0; i < items.length; i++) if ((items[i] as BuildTile).id === this.model.buildQuick) quick = i;
    if (mode === BAR_OPEN) {
      buildPanelSlots(items.length, quick, this.barPage, this.barSlots); // review 9 (B13): the quick type on the quick tile's own spot
      for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
        this.tileSlot[s] = this.barSlots[s] as number;
        this.tileX[s] = p.x[s] as number;
        this.tileY[s] = p.y[s] as number;
      }
    } else if (mode === BAR_CLOSED) {
      this.tileSlot[T_QUICK] = quick;
    } else if (mode === BAR_SHORT) {
      if (items.length === 2) this.tileSlot[T_QUICK] = 0;
      if (items.length >= 1) this.tileSlot[T_SHORT2] = items.length - 1;
    }
    this.tileX[T_QUICK] = c.quickX;
    this.tileY[T_QUICK] = c.quickY;
    this.tileX[T_SHORT2] = c.buildX;
    this.tileY[T_SHORT2] = c.buildY;
    const k = dpr();
    const t = mode === BAR_OPEN ? p.tile : c.tile;
    const f = t / (BUILD_TILE_CSS_PX * k); // review 6: a shrunk cell (10.10-B3) scales its icon and label spots
    const boxW = TILE_ICON_W_PX * k * f;
    const boxH = TILE_ICON_H_PX * k * f;
    for (let s = 0; s < TILE_COUNT; s++) {
      const slot = this.tileSlot[s] as number;
      const x = this.tileX[s] as number;
      const y = this.tileY[s] as number;
      const rect = this.buttons.get(TILE_IDS[s] as string);
      if (rect) Object.assign(rect, { x, y, w: t, h: t });
      (this.barTiles[s] as Phaser.GameObjects.Graphics).setPosition(x, y);
      const cx = x + t / 2;
      const cy = y + TILE_ICON_Y_PX * k * f;
      const price = (this.barPrices[s] as Phaser.GameObjects.Text).setPosition(cx, y + TILE_PRICE_Y_PX * k * f);
      const glyph = (this.barGlyphs[s] as Phaser.GameObjects.Text).setPosition(cx, cy);
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
          .setDisplaySize(BUILD_ICON_FRAME_W * k * f, BUILD_ICON_FRAME_H * k * f);
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
    const y = (MENU_BUTTON_INSET_CSS_PX + hudBandTop(safe.top)) * k;
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
    for (const t of this.ghostLabels) t.setFontSize(Math.round(GHOST_LABEL_PX * dpr())).setStroke(NAME_STROKE, Math.round(GHOST_LABEL_STROKE_PX * dpr())); // Story 5.24
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
    // Story 8.2 (AC 4, B11): a waiting late joiner has no survivor yet: no HP row (it would read "0 / 0").
    const watching = this.model.watching;
    if (this.hpBar.visible === watching) {
      this.hpBar.setVisible(!watching);
      this.hpText.setVisible(!watching);
    }
    if (hp === this.shownHp && maxHp === this.shownMaxHp && burning === this.shownBurning && inAcid === this.shownAcid && gearMask === this.shownGearMask) return;
    this.shownGearMask = gearMask;
    this.shownHp = hp;
    this.shownMaxHp = maxHp;
    this.shownBurning = burning;
    this.shownAcid = inAcid;
    const k = dpr();
    const safe = this.insets;
    const x = (HP_MARGIN + safe.left) * k;
    const y = (HP_MARGIN + hudBandTop(safe.top)) * k;
    const w = HP_BAR_W * k;
    const h = HP_BAR_H * k;
    const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.hpBar.clear();
    this.hpBar.fillStyle(HP_BG, 0.6).fillRect(x - 2 * k, y - 2 * k, w + 4 * k, h + 4 * k);
    this.hpBar.fillStyle(mixColor(HP_LOW, HP_HIGH, frac), 1).fillRect(x, y, w * frac, h);
    // Story 4.8: "Burning" while the server's fire damage keeps arriving (HP stays the server's, ceil).
    this.hpText
      .setText(hpRowText(hp, maxHp, burning, inAcid))
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
    if (this.moneyText.text !== "" && this.moneyText.visible === m.watching) this.moneyText.setVisible(!m.watching); // Story 8.2: no "$0" while waiting
    if (m.money !== this.shownMoney) {
      this.shownMoney = m.money;
      const safe = this.insets;
      const y = (HP_MARGIN + hudBandTop(safe.top) + HP_BAR_H + 4 + HP_TEXT_PX * LINE_HEIGHT + MONEY_GAP_PX) * k;
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
    const touch = !this.router.isMouse && !this.model.voting && !this.model.watching; // mouse mode hides the sticks; Story 6.11: so does the vote; 8.2: and waiting
    this.drawStick(touch ? this.sticks.move : null, this.moveBase, this.moveKnob);
    this.drawStick(touch ? this.sticks.aim : null, this.aimBase, this.aimKnob);
    this.drawHealth();
    this.drawMoney();
    this.drawBurn();
    this.drawWeapon();
    this.drawConsumable(); // Story 5.12
    this.drawWave();
    this.drawRushArrows();
    this.bossHud?.draw(this.model, dpr(), this.insets, this.time.now); // Story 6.5
    this.drawDowned();
    this.drawTeammates();
    this.drawGhostLabels(); // Story 5.24
    this.drawMenu();
    this.pingHud.draw(this.time.now, this.model.pingSlot); // Story 8.7: before the buttons the open wheel hides
    this.drawReady();
    this.drawPlacement();
    this.drawBuildBar(); // Story 5.16
    this.drawActionBar(); // Story 5.21 (3.7's panel, 5.9's Upgrade, 5.20's Sell, 5.22's Move)
    this.drawLongPress(); // Story 5.21
    this.drawUndo(); // Story 5.20
    this.drawSoldPops(); // Story 5.20
    this.drawCinema(); // Story 12.3: after every draw (they may set objects visible: the camera filter hides them)
    this.perfOverlay?.update();
  }

  /** Story 12.3 (AC 2–4, 7, 11): the letterbox and the fade from the camera director; every other HUD object hidden. */
  private drawCinema(): void {
    const m = this.model;
    const on = m.cinemaOn;
    if (on || this.cinemaHidden) filterHud(this.children.list, this.cinemaKeep, this.cameras.main.id, on);
    if (on !== this.cinemaHidden) this.menuBtn.setDepth(on ? CINEMA_MENU_DEPTH : MENU_DEPTH); // review L1: ☰ above the bars, under the fades
    this.cinemaHidden = on;
    const w = this.scale.width;
    const h = this.scale.height;
    const bar = on ? barPx(m.cinemaBars, h) : 0;
    if (bar !== this.shownBarPx || w !== this.shownBarW || h !== this.shownBarH) {
      this.shownBarPx = bar;
      this.shownBarW = w;
      this.shownBarH = h;
      this.cinemaBars.clear();
      if (bar > 0) this.cinemaBars.fillStyle(0x000000, 1).fillRect(0, 0, w, bar).fillRect(0, h - bar, w, bar);
      this.cinemaBars.setVisible(bar > 0);
    }
    const fade = on ? m.cinemaFadeAlpha : 0;
    if (fade > 0) {
      if (this.cinemaFade.width !== w || this.cinemaFade.height !== h) this.cinemaFade.setSize(w, h);
      if (this.cinemaFade.fillColor !== m.cinemaFadeRgb) this.cinemaFade.setFillStyle(m.cinemaFadeRgb, 1);
      this.cinemaFade.setAlpha(fade);
    }
    if (this.cinemaFade.visible !== fade > 0) this.cinemaFade.setVisible(fade > 0);
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
    if (m.toastText !== this.shownToast || m.toastLoot !== this.shownToastLoot || m.toastSlot !== this.shownToastSlot || (m.toastLoot && m.bossVisible !== this.shownToastBoss)) {
      this.shownToastBoss = m.bossVisible;
      this.shownToast = m.toastText;
      this.shownToastLoot = m.toastLoot;
      this.shownToastSlot = m.toastSlot;
      const y = (WAVE_TOP_PX + hudBandTop(this.insets.top) + WAVE_TEXT_PX + LINE_GAP_PX + STATUS_TEXT_PX + LINE_GAP_PX) * dpr();
      // Story 7.12 (BF2): a loot find in the finder's slot colour, with the bag icon left of it.
      const colour = m.toastLoot && m.toastSlot >= 0 ? (SLOT_COLOR_CSS[m.toastSlot] ?? TOAST_COLOR) : TOAST_COLOR;
      this.toastText.setText(m.toastText).setColor(colour).setScale(1).setPosition(this.scale.width / 2, y).setVisible(m.toastText !== "");
      this.drawLootIcon(m.toastLoot && m.toastText !== "");
    }
  }

  /** Story 7.12 (BF2): the bag icon left of the loot line (`layoutLootLine`), made on first use. */
  private drawLootIcon(show: boolean): void {
    if (!show) {
      this.lootIcon?.setVisible(false);
      return;
    }
    if (!this.lootIcon) {
      if (!this.textures.exists(LOOT_ATLAS)) return; // the Game scene makes the atlas; never a missing-texture box
      this.lootIcon = this.add.image(0, 0, LOOT_ATLAS, LOOT_BADGE_FRAME).setOrigin(0.5, 0.5);
    }
    const k = dpr();
    const boss = this.model.bossVisible ? layoutBossBar(this.scale.width, this.insets.left, this.insets.top, this.insets.right, k, this.lootBoss) : null;
    const r = layoutLootLine(this.scale.width, this.insets, k, this.toastText.width, this.lootLineRect, boss, this.scale.height);
    const iconPx = LOOT_ICON_CSS_PX * k * Math.min(1, r.h / (LOOT_ICON_CSS_PX * k));
    const icon = iconPx + LOOT_ICON_GAP_CSS_PX * k * (iconPx / (LOOT_ICON_CSS_PX * k));
    this.toastText.setScale(r.scale).setPosition(r.x + icon + (r.w - icon) / 2, r.y);
    this.lootIcon.setDisplaySize(iconPx, iconPx).setPosition(r.x + iconPx / 2, r.y + r.h / 2).setVisible(true);
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
        .setPosition(this.scale.width / 2, (WAVE_TOP_PX + hudBandTop(this.insets.top) + WAVE_TEXT_PX + LINE_GAP_PX) * dpr())
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
      // Story 10.2 review L3: the label's measured size for the ping arrows' keep-off (GameScene, next frame)
      m.mateLabelSecs[slot] = offDowned ? mk.secs : -1;
      m.mateLabelW[slot] = name.width;
      m.mateLabelH[slot] = name.height;
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
        const hw = name.width / 2 + MATE_LABEL_PAD_CSS_PX * k;
        const hh = name.height / 2 + MATE_LABEL_PAD_CSS_PX * k;
        const lx = Math.min(this.scale.width - hw, Math.max(hw, mk.x - Math.cos(mk.angle) * inset));
        const ly = Math.min(this.scale.height - hh, Math.max(hh, mk.y - Math.sin(mk.angle) * inset));
        name.setPosition(lx, ly).setVisible(true);
      } else if (name.visible) name.setVisible(false);
      // Story 8.7 review M2: while this teammate's ping shows as an edge arrow on the same bearing, it stands in for
      // their arrow (a downed teammate keeps the red "Bo · 14 s" label).
      if ((m.pingArrowSlots & (1 << slot)) !== 0) {
        if (arrow.visible) arrow.setVisible(false);
        if (cross.visible) cross.setVisible(false);
        continue;
      }
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
    if (m.wave !== this.shownWave || m.remaining !== this.shownRemaining || m.buildSecs !== this.shownBuildSecs || m.endless !== this.shownEndless || m.voting !== this.shownVoting || m.extracting !== this.shownExtracting) {
      this.shownWave = m.wave;
      this.shownRemaining = m.remaining;
      this.shownBuildSecs = m.buildSecs;
      this.shownEndless = m.endless; // Story 6.12
      this.shownVoting = m.voting; // Story 6.11
      this.shownExtracting = m.extracting; // Story 12.2
      // Story 3.1: during a build the top line counts down to the next wave.
      // Story 6.14: off the HP bar on small screens (shifted right, shrunk only if it can't fit). Story 8.7 (B3): beside
      // the ping button a line that would drop under 11 px is drawn compact ("Wave 12 · 350 left").
      const compact = waveLine(m, true);
      const compactW = this.waveText.setText(compact).width;
      const fullW = this.waveText.setText(waveLine(m)).width;
      const at = fitWaveText(this.scale.width, this.insets, dpr(), fullW, compactW, this.waveFit);
      if (at.compact) this.waveText.setText(compact);
      this.waveText.setScale(at.scale).setPosition(at.x, (WAVE_TOP_PX + hudBandTop(this.insets.top)) * dpr());
    }
    if (m.bannerText !== this.shownBanner || m.bannerColor !== this.shownBannerColor || m.bossVisible !== this.shownBannerBoss) {
      this.shownBanner = m.bannerText;
      this.shownBannerColor = m.bannerColor; // Stories 6.6 / 6.7: CRASH! / EVAC INBOUND amber, ENRAGED red
      this.shownBannerBoss = m.bossVisible;
      // Stories 6.6 / 6.7: a long line (a player's name) wraps inside the screen instead of running off it
      // (Story 6.14: inside the safe area), and sits below the HP block, wave line and boss bar.
      const k = dpr();
      this.bannerText
        .setWordWrapWidth(bannerWrapWidth(this.scale.width, this.insets, k))
        .setText(m.bannerText)
        .setColor(m.bannerColor || "#ffffff");
      const boss = m.bossVisible ? layoutBossBar(this.scale.width, this.insets.left, this.insets.top, this.insets.right, k, this.bannerBoss) : null;
      const r = layoutBanner(this.scale.width, this.scale.height, this.insets, k, this.bannerText.width, this.bannerText.height, boss, this.bannerAt);
      this.bannerText.setPosition(this.scale.width / 2, r.y + r.h / 2);
    }
    const age = this.time.now - m.bannerAtMs;
    const showMs = m.bannerShowMs > 0 ? m.bannerShowMs : BANNER_SHOW_MS;
    if (!m.bannerText || age > showMs) {
      this.bannerText.setVisible(false);
    } else {
      const fadeStart = showMs - Math.min(BANNER_FADE_MS, showMs / 2);
      this.bannerText.setVisible(true).setAlpha(age < fadeStart ? 1 : 1 - (age - fadeStart) / (showMs - fadeStart));
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
    // Story 5.15: under the hand cluster while holding (and nothing fires); Story 5.16: under the build bar (D3); Story 5.21: under the action bar.
    const hidden = m.placementActive || m.buildBar || m.repairOpen || m.voting || m.watching; // Story 6.11: under the vote's buttons too; 8.2: a waiting joiner has no weapon yet
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
    // Story 5.12 (main-session decision 2026-11-23): in a build phase the swap sits above the build bar; hidden only while holding.
    const hasOther = m.otherWeaponName !== "" && !m.placementActive && !m.repairOpen && !m.voting && !m.watching && !this.pingHud.wheelOpen && this.barMode() !== BAR_OPEN; // Story 10.10: under the open Build panel; Story 8.2: nor while waiting; Story 8.7: not under the open ping wheel; Story 5.21 (D3): not under the action bar either; Story 6.11: nor in the vote
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
