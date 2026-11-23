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
  PLACE_BUTTON_CSS_PX,
  PLACE_BUTTON_GAP_CSS_PX,
  REPAIR_BUTTON_W_CSS_PX,
  REPAIR_CLOSE_CSS_PX,
  REPAIR_ROW_GAP_CSS_PX,
  SHOP_BUTTON_GAP_CSS_PX,
  SHOP_BUTTON_W_CSS_PX,
} from "../ui/sizes";
import { unlockAudio } from "../audio/placeholderSfx";
import { TAP_SLOP_CSS_PX, TapDetector } from "../input/tapDetector";
import { KNOB_RADIUS_CSS_PX, STICK_RADIUS_CSS_PX, type StickTouch, type TouchSticks } from "../input/TouchSticks";
import type { HudModel } from "./hudModel";
import type { InputRouter } from "../input/InputRouter";
import { mixColor } from "../render/color";
import { edgeArrow } from "../render/edgeArrow";
import { MAX_PLAYERS } from "@topdown/shared";
import { COUNTDOWN_LIFT_M, MAX_DOWNED_MARKERS, MAX_RUSH_MARKERS, NAME_LIFT_M, hudTierMark } from "./hudModel";
import { SLOT_COLORS, SLOT_COLOR_CSS } from "../render/playerColors";
import { createTeammateMarkers, teammateMarkers } from "../render/teammateMarkers";
import { pulseAlpha, pulseScale } from "../render/pulse";
import { PerfOverlay } from "../debug/PerfOverlay";
import { FIRE_POP_POOL, FIRE_POP_RISE_PX, PopPool, fireDamageLabel } from "../render/burnCue";
import { ATLAS_FX, FX_EDGE, FX_TIER_MARKS, FX_TIER_SCALE, ensureAtlases } from "../render/city/spriteAtlas";

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
/** Story 3.4: placement buttons (⟳ ✓ ✕), the hint line above ⟳ ✓ ✕. */
const PLACE_IDS = ["rotate", "confirm", "cancel"] as const;
const PLACE_GLYPHS = ["⟳", "✓", "✕"] as const;
const PLACE_GLYPH_PX = 30;
const PLACE_CONFIRM = 0x2e7d32;
const PLACE_CANCEL = 0x8e2a2a;
const HINT_TEXT_PX = 18;
const HINT_GAP_PX = 10;
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
/** Story 3.3: the Shop button's border (the money colour). */
const SHOP_BORDER = 0xf5c542;
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
  /** Story 3.3: the Shop button beside Ready (drawn on layout only; shown and hidden on change). */
  private shopBtn!: Phaser.GameObjects.Graphics;
  private shopLabel!: Phaser.GameObjects.Text;
  private shownShopVisible: boolean | null = null;
  private shownBuildSecs = -2;
  private buttons = new HudButtons();
  /** Story 3.4: placement mode's ⟳ ✓ ✕ and the hint line. */
  private readonly placeBtns: Phaser.GameObjects.Graphics[] = [];
  private readonly placeGlyphs: Phaser.GameObjects.Text[] = [];
  private placeHint!: Phaser.GameObjects.Text;
  private shownPlacement: boolean | null = null;
  private shownHint = "";
  private shownHintValid: boolean | null = null;
  /** The pointer moving the preview (touch or mouse), or -1. */
  private placePointer = -1;
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
    this.shownShopVisible = null;
    this.shownBuildSecs = -2;
    this.shownMoney = -1;
    this.nextMoneyPop = 0;
    this.shownPlacement = null;
    this.shownHint = "";
    this.shownHintValid = null;
    this.placePointer = -1;
    this.shownRepairOpen = null;
    this.shownRepairInfo = "";
    this.shownRepairReason = "";
    this.shownRepairLabel = "";
    this.shownRepairValid = -1;
    this.shownUpgradeShown = null;
    this.shownUpgradeLabel = "";
    this.shownUpgradeReason = "";
    this.shownUpgradeValid = -1;
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
    // Story 3.1: Ready, bottom centre (a touch on it never starts a stick). Story 3.3 adds Shop beside it.
    this.readyBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.readyLabel = this.add.text(0, 0, "", this.outlinedStyle(READY_TEXT_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.buttons.set({ id: "ready", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.readyPressed = true;
    });
    // Story 3.4: placement mode's ⟳ ✓ ✕ (where Ready and Shop are, hidden while placing) and its hint line.
    this.placeBtns.length = 0;
    this.placeGlyphs.length = 0;
    PLACE_IDS.forEach((id, i) => {
      this.placeBtns.push(this.add.graphics().setDepth(1001).setVisible(false));
      this.placeGlyphs.push(this.add.text(0, 0, PLACE_GLYPHS[i] ?? "", this.outlinedStyle(PLACE_GLYPH_PX)).setOrigin(0.5).setDepth(1002).setVisible(false));
      this.buttons.set({ id, x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
        if (id === "rotate") this.model.rotatePressed = true;
        else if (id === "confirm") this.model.confirmPressed = true;
        else this.model.cancelPressed = true;
      });
    });
    this.placeHint = this.add.text(0, 0, "", this.outlinedStyle(HINT_TEXT_PX)).setOrigin(0.5, 1).setDepth(1002).setVisible(false);
    // Story 3.3: Shop, right of Ready (a touch on it never starts a stick either).
    this.shopBtn = this.add.graphics().setDepth(1001).setVisible(false);
    this.shopLabel = this.add.text(0, 0, "Shop", this.outlinedStyle(READY_TEXT_PX)).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.buttons.set({ id: "shop", x: 0, y: 0, w: 0, h: 0, visible: false }, () => {
      this.model.shopPressed = true;
    });
    // Story 3.7: the repair panel (one row above Ready / Shop; a touch on its buttons never starts a stick).
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
    ensureAtlases(this);
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
    // Story 3.4: in placement mode a touch or click that misses the HUD buttons moves the preview
    // (down and drag) and never reaches the sticks or the mouse fire.
    const down = (p: Phaser.Input.Pointer) => {
      unlockAudio(); // iOS: audio starts only after a user gesture
      if (this.model.placementActive) {
        if (this.buttons.pointerDown(p.id, p.x, p.y, this.scale.width).kind !== "button") {
          this.placePointer = p.id;
          this.placeTap(p.x, p.y);
        }
        return;
      }
      hudPointerDown(this.buttons, this.router, p, this.scale.width);
      // Story 3.7: the tap detector only watches (the stick or the mouse fire already started as usual).
      this.taps.down(p.id, p.x, p.y, this.time.now, !this.buttons.owns(p.id));
    };
    const move = (p: Phaser.Input.Pointer) => {
      if (this.model.placementActive && p.id === this.placePointer) this.placeTap(p.x, p.y);
      this.taps.move(p.id, p.x, p.y, TAP_SLOP_CSS_PX * dpr());
      hudPointerMove(this.buttons, this.router, p);
    };
    const up = (p: Phaser.Input.Pointer) => {
      unlockAudio(); // touchend is the activation event on iOS/Chrome; touchstart alone may not unlock
      if (p.id === this.placePointer) this.placePointer = -1;
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
    this.layoutReadyButton();
    this.layoutPlacementButtons();
    this.layoutRepairPanel();
  }

  /**
   * Story 3.7: Repair and ✕ in a row centred one row above Ready / Shop; the info (two lines) right
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

  /** Story 3.4: a placement touch at canvas (x, y) for the GameScene (it converts through the camera). */
  private placeTap(x: number, y: number): void {
    const m = this.model;
    m.placeTap = true;
    m.placeTapX = x;
    m.placeTapY = y;
  }

  /**
   * Story 3.4: ⟳ ✓ ✕ in a row centred where Ready and Shop are (bottom centre, inside the safe area,
   * 64 CSS px each; those two are hidden while placing), with the hint line above them.
   */
  private layoutPlacementButtons(): void {
    const k = dpr();
    const bottom = this.scale.height - (READY_BUTTON_BOTTOM_CSS_PX + this.insets.bottom) * k;
    const size = PLACE_BUTTON_CSS_PX * k;
    const gap = PLACE_BUTTON_GAP_CSS_PX * k;
    const rowW = size * PLACE_IDS.length + gap * (PLACE_IDS.length - 1);
    const y = bottom - size;
    for (let i = 0; i < PLACE_IDS.length; i++) {
      const x = (this.scale.width - rowW) / 2 + i * (size + gap);
      const rect = this.buttons.get(PLACE_IDS[i] as string);
      if (rect) Object.assign(rect, { x, y, w: size, h: size });
      const g = (this.placeBtns[i] as Phaser.GameObjects.Graphics).clear().setPosition(x, y);
      const fill = i === 1 ? PLACE_CONFIRM : i === 2 ? PLACE_CANCEL : READY_BG;
      g.fillStyle(fill, i === 0 ? READY_BG_ALPHA : 0.85).fillRoundedRect(0, 0, size, size, READY_RADIUS_PX * k);
      g.lineStyle(READY_BORDER_PX * k, READY_BORDER, 0.9).strokeRoundedRect(0, 0, size, size, READY_RADIUS_PX * k);
      (this.placeGlyphs[i] as Phaser.GameObjects.Text)
        .setFontSize(Math.round(PLACE_GLYPH_PX * k))
        .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
        .setPosition(x + size / 2, y + size / 2);
    }
    this.placeHint
      .setFontSize(Math.round(HINT_TEXT_PX * k))
      .setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k))
      .setPosition(this.scale.width / 2, y - HINT_GAP_PX * k);
  }

  /** Story 3.4: shows or hides placement mode's buttons and hint (on change only). */
  private drawPlacement(): void {
    const m = this.model;
    const placing = m.placementActive;
    if (placing !== this.shownPlacement) {
      this.shownPlacement = placing;
      if (placing) hudPointerReset(this.buttons, this.router); // the sticks are off: let go of every held stick
      this.placePointer = -1;
      for (let i = 0; i < PLACE_IDS.length; i++) {
        this.buttons.setVisible(PLACE_IDS[i] as string, placing);
        (this.placeBtns[i] as Phaser.GameObjects.Graphics).setVisible(placing);
        (this.placeGlyphs[i] as Phaser.GameObjects.Text).setVisible(placing);
      }
      this.placeHint.setVisible(placing);
    }
    if (!placing) return;
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
   * Story 3.1: the Ready button's hit rect and position (bottom, inside the safe area). Story 3.3:
   * Ready and Shop side by side, the pair centred.
   */
  private layoutReadyButton(): void {
    const k = dpr();
    const w = READY_BUTTON_W_CSS_PX * k;
    const h = READY_BUTTON_H_CSS_PX * k;
    const sw = SHOP_BUTTON_W_CSS_PX * k;
    const gap = SHOP_BUTTON_GAP_CSS_PX * k;
    const x = (this.scale.width - (w + gap + sw)) / 2;
    const y = this.scale.height - (READY_BUTTON_BOTTOM_CSS_PX + this.insets.bottom) * k - h;
    const rect = this.buttons.get("ready");
    if (rect) Object.assign(rect, { x, y, w, h });
    this.readyBtn.setPosition(x, y);
    this.readyLabel.setFontSize(Math.round(READY_TEXT_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(x + w / 2, y + h / 2);
    this.shownReadyKey = -1; // redraw at the new size
    const sx = x + w + gap;
    const shop = this.buttons.get("shop");
    if (shop) Object.assign(shop, { x: sx, y, w: sw, h });
    const g = this.shopBtn;
    g.clear();
    g.fillStyle(READY_BG, READY_BG_ALPHA).fillRoundedRect(0, 0, sw, h, READY_RADIUS_PX * k);
    g.lineStyle(READY_BORDER_PX * k, SHOP_BORDER, 0.9).strokeRoundedRect(0, 0, sw, h, READY_RADIUS_PX * k);
    g.setPosition(sx, y);
    this.shopLabel.setFontSize(Math.round(READY_TEXT_PX * k)).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * k)).setPosition(sx + sw / 2, y + h / 2);
  }

  /** Story 3.3: shows or hides the Shop button (only when that changes). */
  private drawShop(): void {
    const v = this.model.shopButton;
    if (v === this.shownShopVisible) return;
    this.shownShopVisible = v;
    this.buttons.setVisible("shop", v);
    this.shopBtn.setVisible(v);
    this.shopLabel.setVisible(v);
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
    const { hp, maxHp, burning, inAcid } = this.model;
    if (hp === this.shownHp && maxHp === this.shownMaxHp && burning === this.shownBurning && inAcid === this.shownAcid) return;
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
    this.drawShop();
    this.drawRepair();
    this.drawUpgrade(); // Story 5.9
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
      if (label !== this.shownNames[slot]) {
        this.shownNames[slot] = label;
        name.setText(label);
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
      if (name.visible) name.setVisible(false);
      const pulse = mk.downed ? pulseScale(now) : 1;
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
    const hasOther = m.otherWeaponName !== "";
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
