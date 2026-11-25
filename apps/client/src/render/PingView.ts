import type * as Phaser from "phaser";
import { MAX_PLAYERS, PING_SHOW_MS } from "@topdown/shared";
import { aboveDarkness } from "./darkness/aboveDark";
import { EVENT_ARROW_DISC_FRAC, EVENT_ARROW_TIP_FRAC, EVENT_ARROW_TIP_OFFSET, type EventArrowPlace, type Insets, type ScreenRect } from "./eventArrow";
import { ATLAS_PING, PING_DISC, PING_GLYPHS, PING_RING, PING_TIP, PING_WORDS, PING_WORD_H_PX, PING_WORD_W_PX, ensurePingAtlas } from "./pingArt";
import { PING_ICON_CSS_PX, PING_LIFT_CSS_PX, PING_WORD_CSS_PX, newPingArrows, placePingArrows, type PingArrows } from "./pingArrows";
import type { PingModel } from "./pingModel";
import { SLOT_COLORS } from "./playerColors";

/** The pop-in (ms of the clock): the icon grows from 40 % to full size. */
export const PING_POP_MS = 150;
/** The last share of its 4 s the icon fades out over. */
export const PING_FADE_MS = 500;

interface SlotObjs {
  ring: Phaser.GameObjects.Image;
  disc: Phaser.GameObjects.Image;
  glyph: Phaser.GameObjects.Image;
  word: Phaser.GameObjects.Image;
  aDisc: Phaser.GameObjects.Image;
  aGlyph: Phaser.GameObjects.Image;
  aTip: Phaser.GameObjects.Image;
}

/**
 * Story 8.7 (AC 6, 7, P3): draws the pings in the GameScene's world, every object above the blackout darkness
 * (`ABOVE_DARK.ping`, Epic 6 brief 24) and never hidden by fog (fog hides zombies only). One set of pooled images per
 * slot, made once (no allocation per frame). On screen: the icon (slot-colour disc + white glyph + its word) over the
 * ping point; off screen: an edge arrow (slot-colour disc + the glyph at 24 px + tip) placed by `placePingArrows` (the
 * 6.8 event-arrow rule; decision 8.7 B6: drawn here like the event arrow, not in HudScene).
 */
export class PingView {
  private readonly objs: SlotObjs[] = [];
  private readonly arrows: PingArrows = newPingArrows();

  constructor(private readonly scene: Phaser.Scene) {
    ensurePingAtlas(scene);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const img = (frame: string): Phaser.GameObjects.Image => aboveDarkness(scene.add.image(0, 0, ATLAS_PING, frame).setVisible(false), "ping");
      const tint = SLOT_COLORS[i] ?? 0xffffff;
      this.objs.push({
        ring: img(PING_RING).setTint(tint),
        disc: img(PING_DISC).setTint(tint),
        glyph: img(PING_GLYPHS[0] as string),
        word: img(PING_WORDS[0] as string),
        aDisc: img(PING_DISC).setTint(tint),
        aGlyph: img(PING_GLYPHS[0] as string),
        aTip: img(PING_TIP).setTint(tint),
      });
    }
  }

  /** Review M2: a bit per slot whose ping shows as an edge arrow this frame. */
  arrowMask(): number {
    let m = 0;
    for (let i = 0; i < MAX_PLAYERS; i++) if (this.arrows.shown[i]) m |= 1 << i;
    return m;
  }

  /** Where slot `i`'s edge arrow is (screen px) when shown — for tests and the loot arrow's keep-off. */
  arrowAt(i: number): Readonly<EventArrowPlace> | null {
    return this.arrows.shown[i] ? (this.arrows.at[i] as EventArrowPlace) : null;
  }

  /**
   * One frame. (vx, vy, vw) the camera's world view (m), (sw, sh) the canvas (px), `k` px per CSS px, `insets` the
   * safe area (CSS px); `controls` the HUD keep-offs (`waveControlRects`, 8 with the ping button) and `eventArrow`
   * the event's drawn edge arrow (or null).
   */
  update(model: PingModel, nowMs: number, vx: number, vy: number, vw: number, sw: number, sh: number, k: number, insets: Insets, controls: readonly ScreenRect[], eventArrow: Readonly<ScreenRect> | null, lite: readonly ScreenRect[] | null = null): void {
    const pxPerM = vw > 0 ? sw / vw : 1;
    placePingArrows(model, vx, vy, pxPerM, sw, sh, insets, k, controls, eventArrow, this.arrows, lite);
    const iconM = (PING_ICON_CSS_PX * k) / pxPerM;
    const wordHM = (PING_WORD_CSS_PX * k) / pxPerM;
    const liftM = (PING_LIFT_CSS_PX * k) / pxPerM;
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const o = this.objs[i] as SlotObjs;
      const p = model.live(i);
      const onEdge = p !== null && this.arrows.shown[i] === true;
      const inView = p !== null && !onEdge;
      o.ring.setVisible(inView);
      o.disc.setVisible(inView);
      o.glyph.setVisible(inView);
      o.word.setVisible(inView);
      o.aDisc.setVisible(onEdge);
      o.aGlyph.setVisible(onEdge);
      o.aTip.setVisible(onEdge);
      if (!p) continue;
      const age = nowMs - p.startMs;
      const alpha = age > PING_SHOW_MS - PING_FADE_MS ? Math.max(0, (PING_SHOW_MS - age) / PING_FADE_MS) : 1;
      const glyphFrame = PING_GLYPHS[p.kind] as string;
      if (inView) {
        const pop = age < PING_POP_MS ? 0.4 + (0.6 * Math.max(0, age)) / PING_POP_MS : 1;
        const cx = p.x;
        const cy = p.y - liftM;
        const s = iconM * pop;
        o.disc.setPosition(cx, cy).setDisplaySize(s, s).setAlpha(alpha);
        o.glyph.setFrame(glyphFrame).setPosition(cx, cy).setDisplaySize(s * 0.82, s * 0.82).setAlpha(alpha);
        const u = (age % 1000) / 1000; // a soft ring pulse, once a second
        const rs = iconM * (1 + u * 0.9);
        o.ring.setPosition(cx, cy).setDisplaySize(rs, rs).setAlpha(alpha * 0.7 * (1 - u));
        o.word
          .setFrame(PING_WORDS[p.kind] as string)
          .setPosition(cx, cy - s / 2 - wordHM * 0.45) // above the icon: the name label sits under it
          .setDisplaySize((wordHM * PING_WORD_W_PX) / PING_WORD_H_PX, wordHM)
          .setAlpha(alpha);
      } else {
        const a = this.arrows.at[i] as EventArrowPlace;
        const discM = (this.arrows.sizePx * EVENT_ARROW_DISC_FRAC) / pxPerM;
        const ex = vx + a.x / pxPerM;
        const ey = vy + a.y / pxPerM;
        o.aDisc.setPosition(ex, ey).setDisplaySize(discM, discM).setAlpha(alpha);
        o.aGlyph.setFrame(glyphFrame).setPosition(ex, ey).setDisplaySize(discM, discM).setAlpha(alpha);
        o.aTip
          .setPosition(ex + Math.cos(a.angle) * discM * EVENT_ARROW_TIP_OFFSET, ey + Math.sin(a.angle) * discM * EVENT_ARROW_TIP_OFFSET)
          .setDisplaySize(discM * EVENT_ARROW_TIP_FRAC, discM * EVENT_ARROW_TIP_FRAC)
          .setRotation(a.angle)
          .setAlpha(alpha);
      }
    }
  }

  destroy(): void {
    for (const o of this.objs) for (const img of Object.values(o)) (img as Phaser.GameObjects.Image).destroy();
    this.objs.length = 0;
  }
}
