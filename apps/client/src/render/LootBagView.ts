import type * as Phaser from "phaser";
import type { World } from "@topdown/shared";
import { EVENT_ATLAS, EVENT_FRAMES, ensureEventTextures } from "./city/eventArt";
import { LOOT_ATLAS, LOOT_BADGE_FRAME, LOOT_CELL_M, LOOT_FRAMES, LOOT_GLINT_FRAME, LOOT_OBJECT_M, LOOT_RING_FRAME, ensureLootBagTextures, lootGlintOffsetM } from "./city/lootBagAtlas";
import { aboveDarkness } from "./darkness/aboveDark";
import { EVENT_ARROW_DISC_FRAC, EVENT_ARROW_TIP_FRAC, EVENT_ARROW_TIP_OFFSET, type EventArrowPlace, type Insets, type ScreenRect } from "./eventArrow";
import { createPairHold, placeSecondEventArrow } from "./eventArrowPair";
import { EVENT_ARROW_CSS_PX } from "./EventView";
import { createLootBagLook, lootBagLook, type LootBagLook } from "./lootBagLook";

/**
 * Story 7.12 (AC 6, 7-UI-6, OA2): the surprise loot bag on screen. One pooled sprite per part, made
 * once: the bag (one of the five looks, `fx_lootbag_a` … `_e`, with its white rim light baked in), the
 * soft white ground ring under it and the one glint — all above the darkness in `ABOVE_DARK.pickup`
 * (the 6.9 crate's slot: white = pick-ups, readable in a blackout). Off screen, the OA2 badge: a
 * charcoal disc with a white bag, a white tip toward the bag and a white ring that empties over its
 * 20 s, placed by the 6.8/6.10 edge-arrow rules (screen px, off the HUD blocks, inside the safe
 * area, off the event's own arrow). Reads one source (`world.loot`) in solo and online with the
 * host's server tick; nothing is created per frame.
 */
const BADGE_RING_W_CSS_PX = 2.5;

export class LootBagView {
  private readonly ring: Phaser.GameObjects.Image;
  private readonly bag: Phaser.GameObjects.Image;
  private readonly glint: Phaser.GameObjects.Image;
  private readonly badge: Phaser.GameObjects.Image;
  private readonly tip: Phaser.GameObjects.Image;
  private readonly arc: Phaser.GameObjects.Graphics;
  private readonly look: LootBagLook = createLootBagLook();
  private readonly badgeAt: EventArrowPlace = { x: 0, y: 0, angle: 0, side: 0 };
  private readonly badgeHold = createPairHold();
  private shownVariant = -1;
  /** The arc's last drawn share (redrawn only when it moved by ≥ 1 %: no Graphics rebuild per frame). */
  private arcShown = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly world: Readonly<World>,
  ) {
    const cfg = world.balance.loot;
    ensureLootBagTextures(scene, cfg.glint.rimAlpha);
    ensureEventTextures(scene);
    const ringM = cfg.glint.ringRadiusM * 2 * (168 / 156); // the frame's ring sits 6 px inside its 168 px cell
    const cellM = LOOT_CELL_M * (cfg.glint.bagM / LOOT_OBJECT_M);
    this.ring = aboveDarkness(scene.add.image(0, 0, LOOT_ATLAS, LOOT_RING_FRAME).setDisplaySize(ringM, ringM).setVisible(false), "pickup");
    this.bag = aboveDarkness(scene.add.image(0, 0, LOOT_ATLAS, LOOT_FRAMES[0]).setDisplaySize(cellM, cellM).setVisible(false), "pickup");
    this.glint = aboveDarkness(scene.add.image(0, 0, LOOT_ATLAS, LOOT_GLINT_FRAME).setBlendMode(1).setVisible(false), "pickup");
    this.badge = aboveDarkness(scene.add.image(0, 0, LOOT_ATLAS, LOOT_BADGE_FRAME).setVisible(false), "marker");
    this.tip = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.arrowTipWhite).setVisible(false), "marker");
    this.arc = aboveDarkness(scene.add.graphics().setVisible(false), "marker");
  }

  /** Tests: last frame's look and whether the off-screen badge showed. */
  lastLook(): Readonly<LootBagLook> {
    return this.look;
  }
  badgeShown(): boolean {
    return this.badge.visible;
  }

  /**
   * One frame. `serverTick`: the host's server tick; (vx, vy, vw) the camera's world view (m); (sw, sh)
   * the canvas (px), `k` px per CSS px, `insets` the safe area (CSS px); `controls` the HUD keep-offs
   * and `eventArrow` the event's own edge arrow this frame (null: none) — both from `EventView`.
   */
  /** Story 8.7 review L7: the off-screen badge's placement (screen px) when it shows, else null (pings keep off it). */
  badgeArrowAt(): Readonly<EventArrowPlace> | null {
    return this.badge.visible ? this.badgeAt : null;
  }

  update(serverTick: number, vx: number, vy: number, vw: number, sw: number, sh: number, k: number, insets: Insets, controls: readonly ScreenRect[], eventArrow: Readonly<EventArrowPlace> | null): void {
    const look = lootBagLook(this.world, serverTick, this.look);
    const cfg = this.world.balance.loot.glint;
    this.ring.setVisible(look.visible);
    this.bag.setVisible(look.visible);
    this.glint.setVisible(look.visible && look.glint > 0);
    if (look.visible) {
      if (look.variant !== this.shownVariant) {
        this.shownVariant = look.variant;
        this.bag.setFrame(LOOT_FRAMES[look.variant] ?? LOOT_FRAMES[0]);
      }
      this.bag.setPosition(look.x, look.y);
      this.ring.setPosition(look.x, look.y).setAlpha(look.ringAlpha);
      if (look.glint > 0) {
        const off = lootGlintOffsetM(look.variant);
        const s = 0.18 + 0.22 * look.glint;
        const scale = cfg.bagM / LOOT_OBJECT_M;
        this.glint.setPosition(look.x + off.x * scale, look.y + off.y * scale).setDisplaySize(s, s).setAlpha(look.glint);
      }
    }
    // OA2: the off-screen badge (D5).
    const pxPerM = vw > 0 ? sw / vw : 1;
    const sizePx = EVENT_ARROW_CSS_PX * k;
    const onEdge = look.visible && placeSecondEventArrow((look.x - vx) * pxPerM, (look.y - vy) * pxPerM, sw, sh, insets, k, sizePx, controls, eventArrow, this.badgeAt, this.badgeHold);
    if (!look.visible) {
      this.badgeAt.side = 0;
      this.badgeHold.side = 0;
    }
    this.badge.setVisible(onEdge);
    this.tip.setVisible(onEdge);
    this.arc.setVisible(onEdge);
    if (!onEdge) {
      this.arcShown = -1;
      return;
    }
    const discM = (sizePx * EVENT_ARROW_DISC_FRAC) / pxPerM;
    const ex = vx + this.badgeAt.x / pxPerM;
    const ey = vy + this.badgeAt.y / pxPerM;
    const a = this.badgeAt.angle;
    this.badge.setDisplaySize(discM, discM).setPosition(ex, ey);
    this.tip
      .setDisplaySize(discM * EVENT_ARROW_TIP_FRAC, discM * EVENT_ARROW_TIP_FRAC)
      .setPosition(ex + Math.cos(a) * discM * EVENT_ARROW_TIP_OFFSET, ey + Math.sin(a) * discM * EVENT_ARROW_TIP_OFFSET)
      .setRotation(a);
    this.arc.setPosition(ex, ey);
    const left = Math.round(look.left * 100) / 100;
    if (left !== this.arcShown) {
      this.arcShown = left;
      this.arc.clear();
      this.arc.lineStyle((BADGE_RING_W_CSS_PX * k) / pxPerM, 0xffffff, 0.95);
      this.arc.beginPath();
      this.arc.arc(0, 0, discM * 0.5 + (BADGE_RING_W_CSS_PX * k) / pxPerM, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
      this.arc.strokePath();
    }
  }

  destroy(): void {
    this.ring.destroy();
    this.bag.destroy();
    this.glint.destroy();
    this.badge.destroy();
    this.tip.destroy();
    this.arc.destroy();
  }
}
