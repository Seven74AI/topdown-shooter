import type * as Phaser from "phaser";
import { createLobTarget, lobTarget, type Balance, type LauncherStats, type LobTarget, type SimEvent, type World } from "@topdown/shared";
import { ATLAS_BLASTFX, FX_GRENADE_ROUND, FX_GRENADE_SHADOW, ROUND_H_M, ROUND_W_M, ensureBlastFxAtlas } from "./city/blastFxAtlas";
import { GrenadeFlights, type RoundPose } from "./grenadeFx";

/** Over the bodies (a round in the air), shadow on the ground under them. */
const ROUND_DEPTH = 11.5;
const SHADOW_DEPTH = 4.2;
const MARKER_DEPTH = 4.25;
/** The landing ring: white when the round lands at the aim point, amber when cover stops it short. */
const MARKER_OPEN = 0xf2f0e8;
const MARKER_BLOCKED = 0xffb347;
const MARKER_ALPHA = 0.55;
const MARKER_LINE_M = 0.05;
const TRACK_ALPHA = 0.18;
/** The round looks bigger the higher it is, its shadow drifts down-right (looks.html `drawRound`). */
const ROUND_SCALE_PER_M = 0.3;
const SHADOW_DX_PER_M = 0.35;
const SHADOW_DY_PER_M = 0.45;
/** Shown at 3 × its true size so the 4 cm round reads on a phone (≈ 0.37 m long). */
const ROUND_READ_SCALE = 3;

/**
 * Story 5.5 (AC 7 a–c): the cosmetic rounds (pooled sprites on the arc, from `GrenadeFlights`) and
 * the landing marker: while the Grenade Launcher is aimed, a ring of the EXACT blast radius at the
 * point the round will burst — `lobTarget`, the sim's own function, so a car on the track pulls the
 * ring back to its face (the ring turns amber) exactly where the server will burst it.
 */
export class GrenadeView {
  readonly flights: GrenadeFlights;
  private readonly rounds: Phaser.GameObjects.Image[] = [];
  private readonly shadows: Phaser.GameObjects.Image[] = [];
  private readonly marker: Phaser.GameObjects.Graphics;
  private readonly pose: RoundPose = { x: 0, y: 0, z: 0, heading: 0, landed: false };
  private readonly arcM: number;
  readonly target: LobTarget = createLobTarget();
  /** The last marker drawn (browser checks): NaN = none. */
  markerX = Number.NaN;
  markerY = Number.NaN;
  markerBlocked = false;

  constructor(scene: Phaser.Scene, balance: Balance, localPlayerId: string) {
    ensureBlastFxAtlas(scene);
    const ex = balance.combat.explosion;
    this.arcM = ex.fx.lobArcM;
    this.flights = new GrenadeFlights(ex.maxLiveRounds, localPlayerId, ex.fx.lostEventTicks / 20);
    for (let i = 0; i < ex.maxLiveRounds; i++) {
      this.rounds.push(scene.add.image(0, 0, ATLAS_BLASTFX, FX_GRENADE_ROUND).setDepth(ROUND_DEPTH).setVisible(false));
      this.shadows.push(scene.add.image(0, 0, ATLAS_BLASTFX, FX_GRENADE_SHADOW).setDepth(SHADOW_DEPTH).setVisible(false));
    }
    this.marker = scene.add.graphics().setDepth(MARKER_DEPTH);
  }

  handle(e: SimEvent, nowS: number): void {
    this.flights.handle(e, nowS);
  }

  /** Rounds drawn now (browser checks). */
  visibleRounds(): number {
    let n = 0;
    for (const r of this.rounds) if (r.visible) n++;
    return n;
  }

  update(nowS: number): void {
    const f = this.flights;
    f.update(nowS);
    const p = this.pose;
    for (let i = 0; i < f.capacity; i++) {
      const img = this.rounds[i] as Phaser.GameObjects.Image;
      const sh = this.shadows[i] as Phaser.GameObjects.Image;
      if (f.id[i] === -1) {
        if (img.visible) img.setVisible(false);
        if (sh.visible) sh.setVisible(false);
        continue;
      }
      f.pose(i, nowS, this.arcM, p);
      const s = (1 + p.z * ROUND_SCALE_PER_M) * ROUND_READ_SCALE;
      img.setPosition(p.x, p.y - p.z * 0.15).setRotation(p.heading).setDisplaySize(ROUND_W_M * s, ROUND_H_M * s).setVisible(true);
      sh.setPosition(p.x + p.z * SHADOW_DX_PER_M, p.y + p.z * SHADOW_DY_PER_M).setRotation(p.heading).setDisplaySize(ROUND_W_M * ROUND_READ_SCALE, ROUND_H_M * ROUND_READ_SCALE * 0.9).setAlpha(Math.max(0.25, 0.8 - p.z * 0.25)).setVisible(true);
    }
  }

  /**
   * The landing marker for my survivor at (px, py) aiming the unit (dirX, dirY) with aim length
   * `aimLen` (the input's), or hidden (`stats` null: not a launcher / not aiming).
   */
  drawMarker(world: Readonly<World>, stats: Readonly<LauncherStats> | null, px: number, py: number, radiusM: number, dirX: number, dirY: number, aimLen: number): void {
    const g = this.marker;
    g.clear();
    if (!stats || !(aimLen > 1e-6)) {
      this.markerX = this.markerY = Number.NaN;
      return;
    }
    const t = lobTarget(world, stats, px, py, radiusM, dirX, dirY, aimLen, this.target);
    const col = t.blocked ? MARKER_BLOCKED : MARKER_OPEN;
    g.lineStyle(MARKER_LINE_M * 0.6, col, TRACK_ALPHA);
    g.lineBetween(t.x0, t.y0, t.x, t.y);
    g.lineStyle(MARKER_LINE_M, col, MARKER_ALPHA);
    g.strokeCircle(t.x, t.y, stats.blastRadiusM);
    g.fillStyle(col, MARKER_ALPHA);
    g.fillCircle(t.x, t.y, 0.08);
    this.markerX = t.x;
    this.markerY = t.y;
    this.markerBlocked = t.blocked;
  }

  destroy(): void {
    for (const r of this.rounds) r.destroy();
    for (const s of this.shadows) s.destroy();
    this.marker.destroy();
    this.rounds.length = 0;
    this.shadows.length = 0;
  }
}
