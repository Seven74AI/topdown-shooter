import * as Phaser from "phaser";
import { buildingById, maxZombieRadius, type MapSpawn, type World } from "@topdown/shared";
import type { Placement } from "../scenes/placement";
import { dashedCircle, zombieAlive } from "./dashes";

/**
 * Story 5.17 (AC 4, 5; ux-spec §7.2): what the reason line points at, in world metres.
 *
 * - **Spawn circles** (AC 5): while I hold anything, every spawn point's `buildings.spawnClearM`
 *   no-build circle (every decay stage's spawns: the server keeps them all clear, D7), red 12 % fill
 *   with a dashed edge. Drawn once per map into one Graphics and shown/hidden with holding (the
 *   camera culls what's off screen).
 * - **Culprit** (AC 4): the shown reason's culprit outlined red — the map box (solid/cover), the
 *   building, the spawn's circle (dashed, stronger), my or the teammate's ring (round the body as
 *   drawn), the zombie (a circle at the check's radius), or the map's edge for "off the street".
 *   Redrawn only when the culprit or its position changes (> 1 cm); nothing per frame otherwise.
 * - **Pocket** (Story 12.1 AC 7, CN-2): for "Leave a way through", a soft red fill over the cells the
 *   wall would cut off (`Placement.pocketCells`: lattice vertices, one 0.5 m square each), drawn once
 *   per shown reason.
 *
 * Graphics only (no texture, brief 20).
 */
const RED = 0xe53935;
const SPAWN_FILL_ALPHA = 0.12;
const SPAWN_EDGE_ALPHA = 0.45;
const SPAWN_EDGE_M = 0.05;
const SPAWN_DASH_M = 0.3;
const CULPRIT_LINE_M = 0.06;
const CULPRIT_ALPHA = 0.95;
/** Story 12.1 (CN-2): the pocket's soft fill. */
const POCKET_ALPHA = 0.28;
/** The culprit's circle sits this far outside a body (the slot ring is at radius + 0.15). */
const BODY_RING_GAP_M = 0.15;
/** A moving culprit (a body) is redrawn when it moved more than this (m). */
const MOVE_EPS_M = 0.01;
/** On the ground, above the street and its decals, under building art (3) and bodies. */
const SPAWN_DEPTH = 2.9;
/** Above bodies (≤ 10) and health bars (12), under the placement preview (13). */
const CULPRIT_DEPTH = 12.5;

/** Where a body is drawn (my survivor and teammates: the player views), or undefined. */
export type DrawnAt = (playerId: string) => { readonly x: number; readonly y: number } | undefined;

export class BlockReasonView {
  private readonly spawns: Phaser.GameObjects.Graphics;
  private readonly culprit: Phaser.GameObjects.Graphics;
  private spawnMap: readonly MapSpawn[] | null = null;
  private shownVersion = -1;
  private shownX = Number.NaN;
  private shownY = Number.NaN;
  /** Culprit redraws so far (browser checks and tests read it). */
  redraws = 0;

  constructor(scene: Phaser.Scene) {
    this.spawns = scene.add.graphics().setDepth(SPAWN_DEPTH).setVisible(false);
    this.culprit = scene.add.graphics().setDepth(CULPRIT_DEPTH).setVisible(false);
  }

  update(world: Readonly<World>, p: Placement, drawnAt: DrawnAt): void {
    this.drawSpawns(world, p.active);
    this.drawCulprit(world, p, drawnAt);
  }

  private drawSpawns(world: Readonly<World>, holding: boolean): void {
    if (holding && this.spawnMap !== world.map.spawnPoints) {
      this.spawnMap = world.map.spawnPoints;
      const g = this.spawns.clear();
      const r = world.balance.buildings.spawnClearM;
      for (const sp of world.map.spawnPoints) {
        g.fillStyle(RED, SPAWN_FILL_ALPHA).fillCircle(sp.x, sp.y, r);
        g.lineStyle(SPAWN_EDGE_M, RED, SPAWN_EDGE_ALPHA);
        dashedCircle(g, sp.x, sp.y, r, SPAWN_DASH_M);
      }
    }
    if (this.spawns.visible !== holding) this.spawns.setVisible(holding);
  }

  private drawCulprit(world: Readonly<World>, p: Placement, drawnAt: DrawnAt): void {
    const g = this.culprit;
    const sealed = p.active && p.shownError === "seals_path" && p.shownHasReason; // Story 12.1 (AC 7)
    const show = sealed || (p.active && p.shownError === "blocked" && p.shownHasReason && !p.resting); // Story 5.23 (AC 7): no culprit while resting
    if (!show) {
      if (g.visible) g.clear().setVisible(false);
      this.shownVersion = -1;
      return;
    }
    const r = p.shownReason;
    // Where a moving culprit is now (bodies); NaN for a fixed one.
    let x = Number.NaN;
    let y = Number.NaN;
    let radius = 0;
    let gone = false;
    if (r.cause === "me" || r.cause === "teammate") {
      const pl = world.players.get(r.playerId);
      const at = drawnAt(r.playerId) ?? pl;
      if (at && pl && pl.status !== "out") {
        x = at.x;
        y = at.y;
        radius = pl.radiusM + BODY_RING_GAP_M;
      } else gone = true; // review L4: left, or out, during the hold
    } else if (r.cause === "zombie") {
      const z = world.zombies;
      if (zombieAlive(z.aliveIds, z.alivePos, z.aliveCount, r.id)) {
        x = z.x[r.id] as number;
        y = z.y[r.id] as number;
        radius = maxZombieRadius(world.balance);
      } else gone = true; // review L4: died (or its slot was reused) during the hold
    }
    if (gone) {
      if (g.visible) g.clear().setVisible(false);
      this.shownVersion = -1;
      return;
    }
    const moved = Number.isFinite(x) && !(Math.abs(x - this.shownX) <= MOVE_EPS_M && Math.abs(y - this.shownY) <= MOVE_EPS_M);
    if (p.shownVersion === this.shownVersion && !moved) return;
    this.shownVersion = p.shownVersion;
    this.shownX = x;
    this.shownY = y;
    this.redraws++;
    g.clear().setVisible(true);
    g.lineStyle(CULPRIT_LINE_M, RED, CULPRIT_ALPHA);
    switch (r.cause) {
      case "off_map":
        g.strokeRect(0, 0, world.map.widthM, world.map.heightM);
        break;
      case "spawn": {
        const sp = world.map.spawnPoints[r.index];
        if (sp) dashedCircle(g, sp.x, sp.y, world.balance.buildings.spawnClearM, SPAWN_DASH_M);
        break;
      }
      case "solid": {
        const b = world.obstacles.solids[r.index];
        if (b) g.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
        break;
      }
      case "building": {
        const b = buildingById(world, r.id);
        if (b) g.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
        break;
      }
      case "me":
      case "teammate":
      case "zombie":
        if (Number.isFinite(x)) g.strokeCircle(x, y, radius);
        break;
      case "seals_path": {
        // Story 12.1 (CN-2): each cut-off vertex as a 0.5 m square round it.
        const c = p.pocketCellM;
        const cols = p.pocketCols;
        g.fillStyle(RED, POCKET_ALPHA);
        for (let k = 0; k < p.pocketCount; k++) {
          const v = p.pocketCells[k] as number;
          g.fillRect((v % cols) * c - c / 2, Math.floor(v / cols) * c - c / 2, c, c);
        }
        break;
      }
    }
  }

  destroy(): void {
    this.spawns.destroy();
    this.culprit.destroy();
  }
}
