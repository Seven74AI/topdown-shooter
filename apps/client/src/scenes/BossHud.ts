import type * as Phaser from "phaser";
import { BOSS_ATTACK, BOSS_STATE } from "@topdown/shared";
import { ensureBossTextures } from "../render/city/bossAtlas";
import { BOSS_HUD, HUD_FRAMES, HUD_RED, ensureHudWarnTextures, hudFlicker, hudFrameCssSize, type HudPlate } from "../render/city/hudWarnArt";
import { bossMarker, type BossMarker } from "../render/bossMarker";
import { BOSS_BAR_NAME_CSS_PX } from "../ui/sizes";
import { BOSS_BAR_NOTCH, bossBarHidden, layoutBossBanner, layoutBossBar, type BossBarLayout } from "./bossBar";
import type { HudModel } from "./hudModel";

/**
 * Story 6.5 (D9, F1; AC 13): the HUD's boss parts — the boss bar (top centre: "THE BEHEMOTH", the HP
 * fill, a gold notch at 50 %, red when enraged: 6.7 sets the flag) and the boss's warning display (asset
 * fixes round 5, P1: `hudWarnArt.ts`): the THE BEHEMOTH banner during its warning; while the boss (or the
 * warning's entry point) is off screen, the DANGER panel at the screen edge with chevrons marching toward
 * it, and during a telegraph the coming attack's plate (SLAM / CHARGE / THROW) inward of the panel; all
 * with the display flicker. Objects are made once; the bar is redrawn only when its HP step (0.5 %),
 * colour or layout changes.
 */
const BAR_BG = 0x101012;
const BAR_FILL = 0xb8161c;
const BAR_FILL_ENRAGED = 0xff3a2a;
const NOTCH = 0xf2c14e;
/** Story 6.6 (D6): the bar flashes amber while it is stunned (amber = something you can use: hit it now). */
const BAR_FILL_STUN = 0xffb52e;
const STUN_FLASH_HZ = 4;
const MARKER_MARGIN_CSS_PX = 30;
/** The edge panel and attack plates are shown at this share of their art size (CSS px). */
const PANEL_SCALE = 0.75;
/** The banner stays this long after the warning ends (the boss walks in under it). */
const BANNER_HOLD_MS = 1500;
/** How long the HUD's text banner shows (HudScene `BANNER_SHOW_MS`): the warning banner waits for it (e.g. "Wave 10"). */
const TEXT_BANNER_MS = 1500;
/** Gap between the panel and the attack plate / chevrons (CSS px). */
const PLATE_GAP_CSS_PX = 4;
/** Room kept between the panel and the screen edge on the boss's side, for the chevrons (CSS px). */
const CHEVRON_ROOM_CSS_PX = 38;
const PLATES: Readonly<Record<number, HudPlate>> = { [BOSS_ATTACK.SLAM]: "slam", [BOSS_ATTACK.CHARGE]: "charge", [BOSS_ATTACK.THROW]: "throw" };

export class BossHud {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly panel: Phaser.GameObjects.Image;
  private readonly plate: Phaser.GameObjects.Image;
  private readonly banner: Phaser.GameObjects.Image;
  private readonly chevrons: Phaser.GameObjects.Graphics;
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
  /** When the banner may hide (the scene clock, ms): extended while the warning lasts. */
  private bannerUntilMs = -1;

  constructor(private readonly scene: Phaser.Scene) {
    ensureBossTextures(scene);
    this.bar = scene.add.graphics().setDepth(900).setVisible(false);
    this.name = scene.add
      .text(0, 0, "THE BEHEMOTH", { fontFamily: "Oswald, Impact, system-ui, sans-serif", fontSize: "11px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5, 0)
      .setStroke("#000000", 3)
      .setDepth(901)
      .setVisible(false);
    ensureHudWarnTextures(scene);
    this.panel = scene.add.image(0, 0, BOSS_HUD, HUD_FRAMES.danger).setDepth(902).setVisible(false);
    this.plate = scene.add.image(0, 0, BOSS_HUD, HUD_FRAMES.slam).setDepth(903).setVisible(false);
    this.banner = scene.add.image(0, 0, BOSS_HUD, HUD_FRAMES.banner).setDepth(904).setVisible(false);
    this.chevrons = scene.add.graphics().setDepth(902).setVisible(false);
  }

  /** Once per HUD frame. `k` = device px per CSS px; insets in CSS px; `nowMs` the scene clock. */
  draw(m: HudModel, k: number, insets: { top: number; right: number; bottom: number; left: number }, nowMs: number): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const t = nowMs / 1000;
    const fl = hudFlicker(t);
    // The arrival banner's timing (drawn below); on a short screen it takes the bar's place (review M2).
    if (m.bossState === BOSS_STATE.WARNING) this.bannerUntilMs = nowMs + BANNER_HOLD_MS;
    const textBanner = m.bannerText !== "" && nowMs - m.bannerAtMs < TEXT_BANNER_MS;
    const showBanner = nowMs < this.bannerUntilMs && m.bossState !== BOSS_STATE.NONE && !textBanner;
    const br = layoutBossBanner(w, h, insets.left, insets.top, insets.right, k, hudFrameCssSize("banner"), this.layout);
    // The bar.
    if (bossBarHidden(m.bossVisible, showBanner, br.overBar)) {
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
    // The arrival banner, during the warning.
    if (showBanner) {
      const r = br;
      this.banner
        .setDisplaySize(r.w, r.h)
        .setPosition(r.x + r.w / 2, r.y + r.h / 2)
        .setAlpha(fl * (0.85 + 0.15 * Math.sin(t * 6)))
        .setVisible(true);
    } else if (this.banner.visible) this.banner.setVisible(false);
    // The edge panel (screen px from the model's camera).
    const sx = (m.bossX - m.camX) * m.camZoom;
    const sy = (m.bossY - m.camY) * m.camZoom;
    const mk = bossMarker(m.bossState, m.bossAtkKind, sx, sy, w, h, MARKER_MARGIN_CSS_PX * k, this.marker);
    if (!mk.visible) {
      if (this.panel.visible) {
        this.panel.setVisible(false);
        this.plate.setVisible(false);
        this.chevrons.clear().setVisible(false);
      }
      return;
    }
    const ps = hudFrameCssSize("danger");
    const pw = ps.w * PANEL_SCALE * k;
    const ph = ps.h * PANEL_SCALE * k;
    // step in from the edge toward the centre so the chevrons fit on the boss's side, and keep the panel on screen
    const room = CHEVRON_ROOM_CSS_PX * k;
    // review L5: kept inside the safe area (a notched phone in landscape), not just the screen
    const x = Math.max(pw / 2 + (insets.left + 4) * k, Math.min(w - pw / 2 - (insets.right + 4) * k, mk.x - Math.cos(mk.angle) * (room + pw / 2 - MARKER_MARGIN_CSS_PX * k)));
    const y = Math.max(ph / 2 + insets.top * k + 4 * k, Math.min(h - ph / 2 - (insets.bottom + 4) * k, mk.y - Math.sin(mk.angle) * (room + ph / 2 - MARKER_MARGIN_CSS_PX * k)));
    this.panel.setDisplaySize(pw, ph).setPosition(x, y).setAlpha(fl).setVisible(true);
    // chevrons marching out of the panel toward the boss
    const ca = Math.cos(mk.angle);
    const sa = Math.sin(mk.angle);
    const edge = Math.min(Math.abs(ca) > 1e-3 ? (pw / 2 - 10 * k) / Math.abs(ca) : Infinity, Math.abs(sa) > 1e-3 ? (ph / 2 - 10 * k) / Math.abs(sa) : Infinity);
    const g = this.chevrons.clear();
    for (let i = 0; i < 3; i++) {
      const ph2 = (t * 2 + i / 3) % 1;
      const d = edge + (PLATE_GAP_CSS_PX + 6 + i * 9) * k;
      const cx = x + ca * d;
      const cy = y + sa * d;
      const a = 9 * k;
      g.lineStyle(3 * k, HUD_RED, (0.3 + 0.7 * (1 - Math.abs(ph2 - 0.5) * 2)) * fl);
      // a ">" pointing along the angle: two strokes from the arms to the tip
      const tipX = cx + ca * 4 * k;
      const tipY = cy + sa * 4 * k;
      g.lineBetween(cx - ca * 4 * k - sa * a, cy - sa * 4 * k + ca * a, tipX, tipY);
      g.lineBetween(cx - ca * 4 * k + sa * a, cy - sa * 4 * k - ca * a, tipX, tipY);
    }
    g.setVisible(true);
    const plate = PLATES[mk.icon];
    if (plate === undefined) {
      if (this.plate.visible) this.plate.setVisible(false);
      return;
    }
    const frame = HUD_FRAMES[plate];
    if (this.plate.frame.name !== frame) this.plate.setFrame(frame);
    const ls = hudFrameCssSize(plate);
    const lw = ls.w * PANEL_SCALE * k;
    const lh = ls.h * PANEL_SCALE * k;
    // the plate sits next to the panel on the side toward the screen centre
    const towardX = w / 2 - x;
    const towardY = h / 2 - y;
    let qx = x;
    let qy = y;
    if (Math.abs(towardY) * w >= Math.abs(towardX) * h) qy = y + Math.sign(towardY || 1) * ((ph + lh) / 2 - 8 * k);
    else qx = x + Math.sign(towardX) * ((pw + lw) / 2 + PLATE_GAP_CSS_PX * k);
    qx = Math.max(lw / 2, Math.min(w - lw / 2, qx));
    this.plate.setDisplaySize(lw, lh).setPosition(qx, qy).setAlpha(hudFlicker(t + 0.3)).setVisible(true);
  }
}
