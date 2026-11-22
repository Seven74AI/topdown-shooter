import * as Phaser from "phaser";
import { dpr, safeArea } from "../display";
import { HudButtons } from "../input/HudButtons";
import { hudPointerDown, hudPointerMove, hudPointerReset, hudPointerUp } from "../input/hudPointer";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, MIN_TEXT_CSS_PX } from "../ui/sizes";
import { unlockAudio } from "../audio/placeholderSfx";
import { KNOB_RADIUS_CSS_PX, STICK_RADIUS_CSS_PX, type StickTouch, type TouchSticks } from "../input/TouchSticks";
import type { HudModel } from "./hudModel";
import type { InputRouter } from "../input/InputRouter";
import { mixColor } from "../render/color";
import { edgeArrow } from "../render/edgeArrow";
import { MAX_PLAYERS } from "@topdown/shared";
import { COUNTDOWN_LIFT_M, MAX_DOWNED_MARKERS, MAX_RUSH_MARKERS, NAME_LIFT_M } from "./hudModel";
import { SLOT_COLORS } from "../render/playerColors";
import { createTeammateMarkers, teammateMarkers } from "../render/teammateMarkers";
import { pulseAlpha, pulseScale } from "../render/pulse";
import { PerfOverlay } from "../debug/PerfOverlay";

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
  private moveBase!: Phaser.GameObjects.Arc;
  private moveKnob!: Phaser.GameObjects.Arc;
  private aimBase!: Phaser.GameObjects.Arc;
  private aimKnob!: Phaser.GameObjects.Arc;
  private ammoText!: Phaser.GameObjects.Text;
  private otherText!: Phaser.GameObjects.Text;
  private swapBtn!: Phaser.GameObjects.Arc;
  private swapLabel!: Phaser.GameObjects.Text;
  private menuBtn!: Phaser.GameObjects.Graphics;
  private shownMenuButton: boolean | null = null;
  private shownMenuOpen = false;
  private toastText!: Phaser.GameObjects.Text;
  private shownToast = "";
  private buttons = new HudButtons();
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
    this.shownWeapon = "";
    this.shownWave = -1;
    this.shownBanner = "";
    this.shownStatus = "";
    this.shownSecs.fill(-1);
    this.shownNames.fill("");
    this.shownMenuButton = null;
    this.shownMenuOpen = false;
    this.shownToast = "";
    this.shownMoney = -1;
    this.nextMoneyPop = 0;
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
    this.layoutButtons();
    this.reloadBar = this.add.graphics();
    this.waveText = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(WAVE_TEXT_PX * dpr())}px`, color: "#ffffff", align: "center" })
      .setOrigin(0.5, 0);
    this.bannerText = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(BANNER_TEXT_PX * dpr())}px`, color: "#ffffff", fontStyle: "bold" })
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

    // Buttons first (readiness fix U1): a touch that starts on a HUD button never spawns a stick.
    const down = (p: Phaser.Input.Pointer) => {
      unlockAudio(); // iOS: audio starts only after a user gesture
      hudPointerDown(this.buttons, this.router, p, this.scale.width);
    };
    const move = (p: Phaser.Input.Pointer) => hudPointerMove(this.buttons, this.router, p);
    const up = (p: Phaser.Input.Pointer) => {
      unlockAudio(); // touchend is the activation event on iOS/Chrome; touchstart alone may not unlock
      hudPointerUp(this.buttons, this.router, p);
    };
    const reset = () => hudPointerReset(this.buttons, this.router);
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
    for (const t of this.countdowns) t.setFontSize(Math.round(COUNTDOWN_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr()));
    this.statusText.setFontSize(Math.round(STATUS_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr()));
    this.shownStatus = "\u0000"; // re-place the status line
    this.toastText.setFontSize(Math.round(TOAST_TEXT_PX * dpr())).setStroke(TEXT_STROKE, Math.round(TEXT_STROKE_PX * dpr()));
    this.shownToast = "\u0000";
  }

  /** Redraws the health bar only when HP changes (top-left, inside the safe area from Story 1.8 on). */
  private drawHealth(): void {
    const { hp, maxHp } = this.model;
    if (hp === this.shownHp && maxHp === this.shownMaxHp) return;
    this.shownHp = hp;
    this.shownMaxHp = maxHp;
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
    this.hpText.setText(`HP ${Math.ceil(hp)} / ${maxHp}`).setPosition(x, y + h + 4 * k);
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
    this.drawWeapon();
    this.drawWave();
    this.drawRushArrows();
    this.drawDowned();
    this.drawTeammates();
    this.drawMenu();
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
      if (m.menuOpen) hudPointerReset(this.buttons, this.router);
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
    if (m.wave !== this.shownWave || m.remaining !== this.shownRemaining) {
      this.shownWave = m.wave;
      this.shownRemaining = m.remaining;
      this.waveText
        .setText(m.wave > 0 ? `Wave ${m.wave}   ·   Zombies ${m.remaining}` : "Get ready")
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
      m.ammo === this.shownAmmo &&
      m.magazine === this.shownMag &&
      reloadStep === this.shownReloadStep &&
      this.scale.width === this.shownW &&
      this.scale.height === this.shownH
    ) {
      return; // nothing changed: no string building, no redraw
    }
    this.shownWeapon = m.weaponName;
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
    const count = m.ammo < 0 ? "—" : `${m.ammo} / ${m.magazine}`;
    const status = swapping ? "Swapping" : reloading ? "Reloading" : count;
    this.ammoText.setText(`▶ ${m.weaponName}  ${status}`).setPosition(x, y);
    const otherCount = m.otherAmmo < 0 ? "—" : `${m.otherAmmo} / ${m.otherMag}`;
    this.otherText
      .setText(hasOther ? `${m.otherWeaponName}  ${otherCount}` : "")
      .setPosition(x, y - this.ammoText.height - 2 * k);
    this.reloadBar.clear();
    if (reloading || swapping) {
      const w = RELOAD_BAR_W * k;
      const h = RELOAD_BAR_H * k;
      const by = y + 6 * k;
      this.reloadBar.fillStyle(0x000000, 0.6).fillRect(x - w, by, w, h);
      this.reloadBar.fillStyle(swapping ? 0xf5c542 : 0xffffff, 0.9).fillRect(x - w, by, w * progress, h);
    }
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
