import * as Phaser from "phaser";
import { reviveTicksFor, type PlayerState, type World } from "@topdown/shared";
import { REVIVE_ZONE_COLOR, reviveZoneStyle, type ReviveZoneStyle } from "./reviveZone";

/** Ring around a downed survivor, in metres (world space, so it zooms with the camera). */
const RING_GAP_M = 0.25;
const RING_WIDTH_M = 0.1;
const TRACK_COLOR = 0x000000;
const TRACK_ALPHA = 0.55;
const FILL_COLOR = 0x6ee7a8;
const START_RAD = -Math.PI / 2; // 12 o'clock, filling clockwise
/** Story 4.9: the revive zone sits on the ground: above barricades and turrets, below zombies (4.5). */
const ZONE_DEPTH = 4.4;

/**
 * Story 2.8: a revive progress ring around each downed player: a dark track, and an arc that fills
 * clockwise from 12 o'clock with `reviveTicks / reviveNeedTicks` (Story 5.11: the fastest revive kit
 * among the revivers in reach, 30 ticks, else `ticksFor(reviveS)`). Moving away resets it (the
 * World does; this only draws). One Graphics object, redrawn only while someone is downed.
 * The countdown text is drawn by the HUD in screen space (crisp at any zoom).
 * Story 4.9: also the revive zone (radius `player.reviveRadiusM`, see `reviveZone.ts`) on the ground.
 */
export class DownedView {
  private readonly g: Phaser.GameObjects.Graphics;
  private world: Readonly<World> | null = null;
  private drawn = false;
  private any = false;
  private readonly zone: Phaser.GameObjects.Graphics;
  private readonly zoneStyle: ReviveZoneStyle = { fillAlpha: 0, lineAlpha: 0, lineWidthM: 0 };
  private reviveRadiusM = 0;
  private timeMs = 0;
  private readonly drawOne = (p: PlayerState): void => {
    if (p.status !== "downed") return;
    this.any = true;
    const st = reviveZoneStyle(p.reviverId !== null, this.timeMs, this.zoneStyle);
    this.zone.fillStyle(REVIVE_ZONE_COLOR, st.fillAlpha).fillCircle(p.x, p.y, this.reviveRadiusM);
    this.zone.lineStyle(st.lineWidthM, REVIVE_ZONE_COLOR, st.lineAlpha).strokeCircle(p.x, p.y, this.reviveRadiusM - st.lineWidthM / 2);
    const r = p.radiusM + RING_GAP_M;
    const g = this.g;
    g.lineStyle(RING_WIDTH_M, TRACK_COLOR, TRACK_ALPHA).strokeCircle(p.x, p.y, r);
    // Story 5.11 (review L2): the revive's own need (server truth online, synced as `reviveNeed`).
    const need = p.reviveNeedTicks > 0 ? p.reviveNeedTicks : reviveTicksFor((this.world as Readonly<World>).balance, 0);
    const frac = Math.min(1, p.reviveTicks / need);
    if (frac <= 0) return;
    g.lineStyle(RING_WIDTH_M, FILL_COLOR, 1)
      .beginPath()
      .arc(p.x, p.y, r, START_RAD, START_RAD + frac * Math.PI * 2, false)
      .strokePath();
  };

  constructor(scene: Phaser.Scene, world: Readonly<World>) {
    this.g = scene.add.graphics().setDepth(9);
    this.zone = scene.add.graphics().setDepth(ZONE_DEPTH);
    this.world = world;
  }

  /**
   * Downed players don't move, so their drawn position is `x`/`y` (the mirror writes `prevX = x`;
   * locally a downed survivor's prev equals its position after one tick).
   */
  update(world: Readonly<World>, timeMs: number): void {
    this.reviveRadiusM = world.balance.player.reviveRadiusM;
    this.world = world;
    this.timeMs = timeMs;
    if (this.drawn) {
      this.g.clear();
      this.zone.clear();
    }
    this.any = false;
    if (!world.teamWiped) world.players.forEach(this.drawOne); // Results are up: no rings
    this.drawn = this.any;
  }

  destroy(): void {
    this.g.destroy();
    this.zone.destroy();
  }
}
