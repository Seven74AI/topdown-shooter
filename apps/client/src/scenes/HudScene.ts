import * as Phaser from "phaser";
import { dpr, safeArea } from "../display";
import { HudButtons } from "../input/HudButtons";
import { hudPointerDown, hudPointerMove, hudPointerReset, hudPointerUp } from "../input/hudPointer";
import { MIN_TEXT_CSS_PX } from "../ui/sizes";
import { unlockAudio } from "../audio/placeholderSfx";
import { KNOB_RADIUS_CSS_PX, STICK_RADIUS_CSS_PX, type StickTouch, type TouchSticks } from "../input/TouchSticks";
import type { HudModel } from "./hudModel";
import type { InputRouter } from "../input/InputRouter";
import { mixColor } from "../render/color";
import { edgeArrow } from "../render/edgeArrow";
import { MAX_RUSH_MARKERS } from "./hudModel";
import { PerfOverlay } from "../debug/PerfOverlay";

export interface HudSceneData {
  sticks: TouchSticks;
  model: HudModel;
  /** Pointer events go through the router: touches drive the sticks, the mouse aims and fires. */
  router: InputRouter;
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

  constructor() {
    super("Hud");
  }

  init(data: HudSceneData): void {
    this.sticks = data.sticks;
    this.model = data.model;
    this.router = data.router;
    this.shownHp = -1;
    this.shownMaxHp = -1;
    this.shownWeapon = "";
    this.shownWave = -1;
    this.shownBanner = "";
  }

  create(): void {
    const r = STICK_RADIUS_CSS_PX * dpr();
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
      this.arrows.push(this.add.triangle(0, 0, a, 0, -a * 0.6, -a * 0.7, -a * 0.6, a * 0.7, RUSH_COLOR).setVisible(false));
    }
    this.hpBar = this.add.graphics();
    this.perfOverlay = new PerfOverlay(this); // Story 1.11 (top-right, toggled by ?debug=1 / three-finger tap)
    this.hpText = this.add.text(0, 0, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${Math.round(HP_TEXT_PX * dpr())}px`,
      color: "#ffffff",
    });

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
  }

  private onResize(): void {
    this.insets = { ...safeArea() };
    const r = STICK_RADIUS_CSS_PX * dpr();
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
    this.shownWeapon = "";
    this.hpText.setFontSize(Math.round(HP_TEXT_PX * dpr()));
    this.shownHp = -1; // force a redraw at the new scale
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

  override update(): void {
    const touch = !this.router.isMouse; // mouse mode hides the sticks
    this.drawStick(touch ? this.sticks.move : null, this.moveBase, this.moveKnob);
    this.drawStick(touch ? this.sticks.aim : null, this.aimBase, this.aimKnob);
    this.drawHealth();
    this.drawWeapon();
    this.drawWave();
    this.drawRushArrows();
    this.perfOverlay?.update();
  }

  /** "Wave 3 · Zombies 47" top-center, and the centered banner fading out. */
  private drawWave(): void {
    const m = this.model;
    if (m.wave !== this.shownWave || m.remaining !== this.shownRemaining) {
      this.shownWave = m.wave;
      this.shownRemaining = m.remaining;
      this.waveText
        .setText(m.wave > 0 ? `Wave ${m.wave}   ·   Zombies ${m.remaining}` : "Get ready")
        .setPosition(this.scale.width / 2, (12 + this.insets.top) * dpr());
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
