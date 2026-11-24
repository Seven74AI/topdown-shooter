import type * as Phaser from "phaser";
import { BOSS_ATTACK } from "@topdown/shared";
import { BOSS_FX, BOSS_FX_FRAMES, ensureBossTextures } from "../render/city/bossAtlas";
import { bossMarker, type BossMarker } from "../render/bossMarker";
import { BOSS_BAR_NAME_CSS_PX } from "../ui/sizes";
import { BOSS_BAR_NOTCH, layoutBossBar, type BossBarLayout } from "./bossBar";
import type { HudModel } from "./hudModel";

/**
 * Story 6.5 (D9, F1; AC 13): the HUD's boss parts — the boss bar (top centre: "THE BEHEMOTH", the HP
 * fill, a gold notch at 50 %, red when enraged: 6.7 sets the flag) and the red skull disc at the
 * screen edge while the boss (or the warning's entry point) is off screen, pulsing during the warning
 * and a telegraph, with the coming attack's icon. Objects are made once; the bar is redrawn only when
 * its HP step (0.5 %), colour or layout changes.
 */
const BAR_BG = 0x101012;
const BAR_FILL = 0xb8161c;
const BAR_FILL_ENRAGED = 0xff3a2a;
const NOTCH = 0xf2c14e;
/** Story 6.6 (D6): the bar flashes amber while it is stunned (amber = something you can use: hit it now). */
const BAR_FILL_STUN = 0xffb52e;
const STUN_FLASH_HZ = 4;
const MARKER_CSS_PX = 34;
const ICON_CSS_PX = 18;
const MARKER_MARGIN_CSS_PX = 30;
const PULSE_HZ = 2.5;

export class BossHud {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly disc: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly layout: BossBarLayout = { x: 0, y: 0, w: 0, h: 0, barY: 0, barH: 0 };
  private readonly marker: BossMarker = { visible: false, x: 0, y: 0, angle: 0, pulse: false, icon: 0 };
  /** What the bar was last drawn for (numbers: no string per frame). */
  private shownStep = -1;
  private shownEnraged = false;
  private shownFlash = false;
  private shownAlpha = -1;
  private shownW = -1;
  private shownK = -1;
  private shownInsets = -1;

  constructor(private readonly scene: Phaser.Scene) {
    ensureBossTextures(scene);
    this.bar = scene.add.graphics().setDepth(900).setVisible(false);
    this.name = scene.add
      .text(0, 0, "THE BEHEMOTH", { fontFamily: "Oswald, Impact, system-ui, sans-serif", fontSize: "11px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5, 0)
      .setStroke("#000000", 3)
      .setDepth(901)
      .setVisible(false);
    this.disc = scene.add.image(0, 0, BOSS_FX, BOSS_FX_FRAMES.disc).setDepth(902).setVisible(false);
    this.icon = scene.add.image(0, 0, BOSS_FX, BOSS_FX_FRAMES.slam).setDepth(903).setVisible(false);
  }

  /** Once per HUD frame. `k` = device px per CSS px; insets in CSS px; `nowMs` the scene clock. */
  draw(m: HudModel, k: number, insets: { top: number; right: number; bottom: number; left: number }, nowMs: number): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    // The bar.
    if (!m.bossVisible) {
      if (this.bar.visible) {
        this.bar.setVisible(false);
        this.name.setVisible(false);
        this.shownStep = -1;
      }
    } else {
      const step = Math.round(Math.max(0, Math.min(1, m.bossHpFrac)) * 200);
      const ins = insets.top * 1e6 + insets.left * 1e3 + insets.right;
      const flash = m.bossStunned && Math.floor((nowMs / 1000) * STUN_FLASH_HZ * 2) % 2 === 0;
      const alpha = Math.round(Math.max(0, Math.min(1, m.bossBarAlpha)) * 20) / 20;
      if (alpha !== this.shownAlpha) {
        this.shownAlpha = alpha;
        this.bar.setAlpha(alpha);
        this.name.setAlpha(alpha);
      }
      if (step !== this.shownStep || m.bossEnraged !== this.shownEnraged || flash !== this.shownFlash || w !== this.shownW || k !== this.shownK || ins !== this.shownInsets) {
        this.shownStep = step;
        this.shownEnraged = m.bossEnraged;
        this.shownFlash = flash;
        this.shownW = w;
        this.shownK = k;
        this.shownInsets = ins;
        const l = layoutBossBar(w, insets.left, insets.top, insets.right, k, this.layout);
        const g = this.bar.clear();
        g.fillStyle(BAR_BG, 0.75).fillRect(l.x - 2 * k, l.barY - 2 * k, l.w + 4 * k, l.barH + 4 * k);
        g.fillStyle(flash ? BAR_FILL_STUN : m.bossEnraged ? BAR_FILL_ENRAGED : BAR_FILL, 1).fillRect(l.x, l.barY, (l.w * step) / 200, l.barH);
        g.fillStyle(NOTCH, 1).fillRect(l.x + l.w * BOSS_BAR_NOTCH - k, l.barY - 3 * k, 2 * k, l.barH + 6 * k);
        this.name.setText(m.bossName).setFontSize(Math.round(BOSS_BAR_NAME_CSS_PX * k)).setPosition(w / 2, l.y);
      }
      if (!this.bar.visible) {
        this.bar.setVisible(true);
        this.name.setVisible(true);
      }
    }
    // The edge marker (screen px from the model's camera).
    const sx = (m.bossX - m.camX) * m.camZoom;
    const sy = (m.bossY - m.camY) * m.camZoom;
    const mk = bossMarker(m.bossState, m.bossAtkKind, sx, sy, w, h, MARKER_MARGIN_CSS_PX * k, this.marker);
    if (!mk.visible) {
      if (this.disc.visible) this.disc.setVisible(false);
      if (this.icon.visible) this.icon.setVisible(false);
      return;
    }
    const pulse = mk.pulse ? 1 + 0.15 * Math.sin((nowMs / 1000) * PULSE_HZ * Math.PI * 2) : 1;
    const size = MARKER_CSS_PX * k * pulse;
    this.disc.setPosition(mk.x, mk.y).setDisplaySize(size, size).setVisible(true);
    if (mk.icon === 0) {
      if (this.icon.visible) this.icon.setVisible(false);
      return;
    }
    const frame = mk.icon === BOSS_ATTACK.SLAM ? BOSS_FX_FRAMES.slam : mk.icon === BOSS_ATTACK.CHARGE ? BOSS_FX_FRAMES.charge : BOSS_FX_FRAMES.throw;
    if (this.icon.frame.name !== frame) this.icon.setFrame(frame);
    // The icon sits inward of the disc, toward the screen centre.
    const off = (MARKER_CSS_PX * 0.5 + ICON_CSS_PX * 0.6) * k;
    this.icon
      .setPosition(mk.x - Math.cos(mk.angle) * off, mk.y - Math.sin(mk.angle) * off)
      .setDisplaySize(ICON_CSS_PX * k, ICON_CSS_PX * k)
      .setVisible(true);
  }
}
