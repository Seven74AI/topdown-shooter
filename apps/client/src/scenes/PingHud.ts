import type * as Phaser from "phaser";
import { PING_KINDS, PING_LABELS } from "@topdown/shared";
import type { HudButtons } from "../input/HudButtons";
import { ATLAS_PING, PING_BUTTON_GLYPH, PING_DISC, PING_GLYPHS, ensurePingAtlas } from "../render/pingArt";
import { SLOT_COLORS } from "../render/playerColors";
import { PING_CHIP_H_CSS_PX } from "../ui/sizes";
import type { HudModel } from "./hudModel";
import { layoutPingButton, type HudInsets, type HudRect } from "./hudTopLayout";
import { closePingWheel, layoutPingWheel, newPingChipRects, pickPing, pingCooldownFrac, pingWheelColumn, stepPingWheel, togglePingWheel } from "./pingWheel";

/** HudButtons ids: the ping button and the wheel's chips (in `PING_KINDS` order). */
export const PING_BUTTON_ID = "ping";
export const PING_CHIP_IDS: readonly string[] = PING_KINDS.map((_, i) => `ping_chip${i}`);
/** The chip words (11 px min, AC 1). */
export const PING_CHIP_TEXT_CSS_PX = 11;

const BG = 0x11151c;
const BG_ALPHA = 0.72;
const RING = 0xffffff;

/**
 * Story 8.7 (AC 2, 3, 4): the ping button (top right, left of ☰) with its 1 s cooldown ring, and the open wheel's four
 * chips (my slot-colour disc + the kind's glyph + its word). Taps go through HudScene's `HudButtons` (buttons first, so
 * a chip or the button never starts a stick); a tap anywhere else closes the wheel and goes on to the sticks as usual
 * (`pointerDown`). The wheel's state lives in the HUD model (`m.ping`); the GameScene sends `m.ping.pick`.
 */
export class PingHud {
  private readonly btn: Phaser.GameObjects.Graphics;
  private readonly glyph: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly chipBg: Phaser.GameObjects.Graphics[] = [];
  private readonly chipDisc: Phaser.GameObjects.Image[] = [];
  private readonly chipGlyph: Phaser.GameObjects.Image[] = [];
  private readonly chipText: Phaser.GameObjects.Text[] = [];
  private readonly btnRect: HudRect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly chips = newPingChipRects();
  /** B5 amended: the chips' two layouts (2 × 2 block; one column while quick-use shows) and which one is applied. */
  private readonly chipsGrid = newPingChipRects();
  private readonly chipsColumn = newPingChipRects();
  private column = false;
  private shownButton: boolean | null = null;
  private shownOpen: boolean | null = null;
  private shownRing = -1;
  private shownSlot = -1;
  private k = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly buttons: HudButtons,
    private readonly model: HudModel,
  ) {
    ensurePingAtlas(scene);
    this.btn = scene.add.graphics().setDepth(1001).setVisible(false);
    this.glyph = scene.add.image(0, 0, ATLAS_PING, PING_BUTTON_GLYPH).setDepth(1002).setVisible(false);
    this.ring = scene.add.graphics().setDepth(1002).setVisible(false);
    buttons.set({ id: PING_BUTTON_ID, x: 0, y: 0, w: 0, h: 0, visible: false }, () => togglePingWheel(this.model.ping, this.scene.time.now));
    for (let i = 0; i < PING_KINDS.length; i++) {
      this.chipBg.push(scene.add.graphics().setDepth(1003).setVisible(false));
      this.chipDisc.push(scene.add.image(0, 0, ATLAS_PING, PING_DISC).setDepth(1004).setVisible(false));
      this.chipGlyph.push(scene.add.image(0, 0, ATLAS_PING, PING_GLYPHS[i] as string).setDepth(1005).setVisible(false));
      this.chipText.push(
        scene.add
          .text(0, 0, PING_LABELS[PING_KINDS[i] as (typeof PING_KINDS)[number]], { fontFamily: "system-ui, sans-serif", fontStyle: "bold", fontSize: "11px", color: "#ffffff" })
          .setOrigin(0.5, 1)
          .setDepth(1005)
          .setVisible(false),
      );
      buttons.set({ id: PING_CHIP_IDS[i] as string, x: 0, y: 0, w: 0, h: 0, visible: false }, () => pickPing(this.model.ping, i, this.scene.time.now));
    }
  }

  /** On create and every resize: the button's and the chips' rects (canvas px) and their drawings. */
  layout(width: number, insets: HudInsets, k: number, height = Infinity): void {
    this.k = k;
    const b = layoutPingButton(width, insets, k, this.btnRect);
    const rect = this.buttons.get(PING_BUTTON_ID);
    if (rect) Object.assign(rect, { x: b.x, y: b.y, w: b.w, h: b.h });
    const g = this.btn;
    g.clear();
    g.fillStyle(BG, BG_ALPHA).fillCircle(b.w / 2, b.h / 2, b.w / 2);
    g.lineStyle(2 * k, 0xffffff, 0.5).strokeCircle(b.w / 2, b.h / 2, b.w / 2 - k);
    g.setPosition(b.x, b.y);
    this.glyph.setPosition(b.x + b.w / 2, b.y + b.h / 2).setDisplaySize(b.w * 0.72, b.h * 0.72);
    layoutPingWheel(width, insets, k, this.chipsGrid);
    layoutPingWheel(width, insets, k, this.chipsColumn, true, height);
    this.placeChips();
    this.shownButton = null; // re-apply visibility
    this.shownRing = -1;
  }

  /** B5 amended: (re)places the chips in the layout the quick-use button needs now. */
  private placeChips(): void {
    const k = this.k;
    const src = this.column ? this.chipsColumn : this.chipsGrid;
    for (let i = 0; i < 4; i++) Object.assign(this.chips[i] as HudRect, src[i]);
    const disc = PING_CHIP_H_CSS_PX * 0.56 * k;
    for (let i = 0; i < PING_KINDS.length; i++) {
      const c = this.chips[i] as HudRect;
      const r = this.buttons.get(PING_CHIP_IDS[i] as string);
      if (r) Object.assign(r, { x: c.x, y: c.y, w: c.w, h: c.h });
      const bg = this.chipBg[i] as Phaser.GameObjects.Graphics;
      bg.clear();
      bg.fillStyle(BG, 0.86).fillRoundedRect(0, 0, c.w, c.h, 10 * k);
      bg.lineStyle(2 * k, 0xffffff, 0.55).strokeRoundedRect(0, 0, c.w, c.h, 10 * k);
      bg.setPosition(c.x, c.y);
      const cx = c.x + c.w / 2;
      const iy = c.y + 4 * k + disc / 2;
      (this.chipDisc[i] as Phaser.GameObjects.Image).setPosition(cx, iy).setDisplaySize(disc, disc);
      (this.chipGlyph[i] as Phaser.GameObjects.Image).setPosition(cx, iy).setDisplaySize(disc * 0.86, disc * 0.86);
      (this.chipText[i] as Phaser.GameObjects.Text).setFontSize(Math.round(PING_CHIP_TEXT_CSS_PX * k)).setPosition(cx, c.y + c.h - 2 * k);
    }
  }

  /** The wheel is open (the scene hides swap, quick-use and the build bar under it). */
  get wheelOpen(): boolean {
    return this.model.pingButton && this.model.ping.open;
  }

  /**
   * A new pointer, before HudScene routes it: while the wheel is open a touch that is on neither the button nor a chip
   * closes it (and still reaches the sticks or the game as usual: the wheel only takes taps that land on it).
   */
  pointerDown(hitId: string | null): void {
    if (!this.model.ping.open) return;
    if (hitId === PING_BUTTON_ID || (hitId !== null && PING_CHIP_IDS.includes(hitId))) return;
    closePingWheel(this.model.ping);
  }

  /** Each frame: the 3 s close, visibility, the cooldown ring (redrawn only while it runs), my slot colour. */
  draw(nowMs: number, slot: number): void {
    const m = this.model;
    stepPingWheel(m.ping, nowMs, m.pingButton);
    // Re-review nit: the chips never move under a finger — the layout (column while quick-use shows, else 2 × 2) is
    // chosen while the wheel is shut and kept until it closes; the model carries it for the arrows' keep-offs.
    const column = pingWheelColumn(m);
    if (column !== this.column && !m.ping.open) {
      this.column = column;
      this.placeChips();
    }
    m.pingWheelColumn = this.column;
    const shown = m.pingButton;
    if (shown !== this.shownButton) {
      this.shownButton = shown;
      this.buttons.setVisible(PING_BUTTON_ID, shown);
      this.btn.setVisible(shown);
      this.glyph.setVisible(shown);
    }
    const open = shown && m.ping.open;
    if (open !== this.shownOpen) {
      this.shownOpen = open;
      for (let i = 0; i < PING_KINDS.length; i++) {
        this.buttons.setVisible(PING_CHIP_IDS[i] as string, open);
        (this.chipBg[i] as Phaser.GameObjects.Graphics).setVisible(open);
        (this.chipDisc[i] as Phaser.GameObjects.Image).setVisible(open);
        (this.chipGlyph[i] as Phaser.GameObjects.Image).setVisible(open);
        (this.chipText[i] as Phaser.GameObjects.Text).setVisible(open);
      }
    }
    if (slot !== this.shownSlot) {
      this.shownSlot = slot;
      const tint = SLOT_COLORS[slot] ?? 0x9aa0a6;
      for (const d of this.chipDisc) d.setTint(tint);
    }
    // the cooldown ring: 1 → 0 round the button over 1 s (steps of 1/40 so it is redrawn ≤ 40 times)
    const frac = shown ? pingCooldownFrac(m.ping, nowMs) : 0;
    const step = Math.ceil(frac * 40);
    if (step !== this.shownRing) {
      this.shownRing = step;
      const g = this.ring;
      g.clear();
      g.setVisible(step > 0);
      if (step > 0) {
        const b = this.btnRect;
        const k = this.k;
        g.lineStyle(4 * k, RING, 0.9);
        g.beginPath();
        g.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 - 3 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (step / 40), false);
        g.strokePath();
        this.glyph.setAlpha(0.5);
      } else this.glyph.setAlpha(1);
    }
  }
}
