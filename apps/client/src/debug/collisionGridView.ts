import type * as Phaser from "phaser";
import { GRID_CELL_M, SPAWN_STATE, ZOMBIE_TYPES, currentDecayStage, jitteredSpawn, spawnPointStates, type World } from "@topdown/shared";

/**
 * Dev collision / grid view (architecture › Debug tools; Story 4.3). DEVELOPMENT BUILDS ONLY: imported
 * only by DevCheats.tsx, so it leaves release builds with it. While on, every frame it draws over the
 * running World (solo: the sim; online: the client's mirror):
 * - the 2 m spatial grid (`GRID_CELL_M`), map collision boxes (red), cover (orange; faint = a later
 *   stage), buildings (yellow) and body hitboxes (players cyan, zombies magenta);
 * - every spawn point: a disc coloured by its state now (green open, orange near a player — skipped,
 *   red blocked by a building — a guard that placement never lets happen, grey not open at this stage), its jitter segment, and a label
 *   `S<minStage> <kind>` + the state. The panel line shows the stage in force.
 */
const GRID = 0x3a6ea5;
const SOLID = 0xff4040;
const COVER = 0xffa030;
const BUILDING = 0xffe040;
const PLAYER = 0x40e0ff;
const ZOMBIE = 0xff40ff;
const STATE_COLOR: Readonly<Record<number, number>> = {
  [SPAWN_STATE.OPEN]: 0x40ff60,
  [SPAWN_STATE.NEAR]: 0xffa030,
  [SPAWN_STATE.BLOCKED]: 0xff3030,
  [SPAWN_STATE.CLOSED]: 0x808080,
};
export const SPAWN_STATE_LABEL: Readonly<Record<number, string>> = {
  [SPAWN_STATE.OPEN]: "open",
  [SPAWN_STATE.NEAR]: "near player",
  [SPAWN_STATE.BLOCKED]: "blocked (guard)",
  [SPAWN_STATE.CLOSED]: "closed",
};
/** CSS colour per state (built once: no string per frame). */
const STATE_CSS: Readonly<Record<number, string>> = Object.fromEntries(Object.entries(STATE_COLOR).map(([k, c]) => [k, `#${c.toString(16).padStart(6, "0")}`]));
const LINE_M = 0.06;
const SPAWN_DISC_M = 0.45;
/** Label text: drawn at 28 px, scaled so a line is ~0.45 m tall in the world. */
const LABEL_PX = 28;
const LABEL_SCALE = 1 / 64;
const DEPTH = 1000;

/** `S2 manhole · open`: what the dev view writes next to a spawn point. */
export function spawnLabel(minStage: number, kind: string, state: number): string {
  return `S${minStage} ${kind}\n${SPAWN_STATE_LABEL[state] ?? "?"}`;
}

export class CollisionGridView {
  private g: Phaser.GameObjects.Graphics | null = null;
  private labels: Phaser.GameObjects.Text[] = [];
  private scene: Phaser.Scene | null = null;
  private states = new Uint8Array(0);
  /** Review L3: the state each label shows; its text and colour change only when the state does. */
  private labelState = new Int16Array(0);
  private readonly lo = { x: 0, y: 0 };
  private readonly hi = { x: 0, y: 0 };

  /** Draws one frame; call every frame while on. Rebuilds its objects when the scene restarted. */
  draw(scene: Phaser.Scene, world: World): void {
    if (this.scene !== scene || !this.g || !this.g.scene) this.rebuild(scene, world);
    const g = this.g as Phaser.GameObjects.Graphics;
    const map = world.map;
    g.clear();
    g.lineStyle(LINE_M / 2, GRID, 0.5);
    for (let x = GRID_CELL_M; x < map.widthM; x += GRID_CELL_M) g.lineBetween(x, 0, x, map.heightM);
    for (let y = GRID_CELL_M; y < map.heightM; y += GRID_CELL_M) g.lineBetween(0, y, map.widthM, y);
    const stage = currentDecayStage(world);
    // Story 4.7: the World's lists (decay mutations applied: removed cars gone, moved cars and police
    // lines in), not the frozen map; map cover of a later stage stays faint.
    g.lineStyle(LINE_M, SOLID, 0.9);
    for (const b of world.obstacles.walls) g.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    g.lineStyle(LINE_M, COVER, 0.9);
    for (const c of world.obstacles.cover) g.strokeRect(c.minX, c.minY, c.maxX - c.minX, c.maxY - c.minY);
    g.lineStyle(LINE_M, COVER, 0.35);
    for (const c of map.cover) if (c.minStage > stage) g.strokeRect(c.minX, c.minY, c.maxX - c.minX, c.maxY - c.minY);
    g.lineStyle(LINE_M, BUILDING, 0.9);
    for (const b of world.buildings.list) g.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    g.lineStyle(LINE_M, PLAYER, 1);
    for (const p of world.players.values()) if (p.status !== "out") g.strokeCircle(p.x, p.y, p.radiusM);
    g.lineStyle(LINE_M / 2, ZOMBIE, 0.9);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const r = world.balance.zombies.types[ZOMBIE_TYPES[z.type[id] as number] as string]?.radiusM ?? 0;
      g.strokeCircle(z.x[id] as number, z.y[id] as number, r);
    }
    spawnPointStates(world, this.states);
    const jitter = world.balance.waves.spawnJitterM;
    for (let i = 0; i < map.spawnPoints.length; i++) {
      const sp = map.spawnPoints[i] as (typeof map.spawnPoints)[number];
      const state = this.states[i] as number;
      const color = STATE_COLOR[state] ?? 0xffffff;
      jitteredSpawn(world, sp, -jitter, 0, this.lo);
      jitteredSpawn(world, sp, jitter, 0, this.hi);
      g.lineStyle(LINE_M * 2, color, 0.9).lineBetween(this.lo.x, this.lo.y, this.hi.x, this.hi.y);
      g.fillStyle(color, state === SPAWN_STATE.CLOSED ? 0.45 : 0.85).fillCircle(sp.x, sp.y, SPAWN_DISC_M);
      g.lineStyle(LINE_M, 0x000000, 1).strokeCircle(sp.x, sp.y, SPAWN_DISC_M);
      const t = this.labels[i];
      if (t && this.labelState[i] !== state) {
        this.labelState[i] = state;
        t.setText(spawnLabel(sp.minStage, sp.kind, state)).setColor(STATE_CSS[state] ?? "#ffffff");
      }
    }
  }

  /** Hides everything (view turned off). */
  hide(): void {
    this.g?.clear();
    for (const t of this.labels) t.setVisible(false);
  }

  /** Shows the labels again (view turned on). */
  show(): void {
    for (const t of this.labels) t.setVisible(true);
  }

  private rebuild(scene: Phaser.Scene, world: World): void {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(DEPTH);
    this.states = new Uint8Array(world.map.spawnPoints.length);
    this.labelState = new Int16Array(world.map.spawnPoints.length).fill(-1);
    this.labels = world.map.spawnPoints.map((sp) => {
      const t = scene.add.text(0, 0, "", { fontFamily: "monospace", fontSize: `${LABEL_PX}px`, color: "#ffffff", stroke: "#000000", strokeThickness: 6 });
      // Labels sit beside the disc, on the map side (points at the right/bottom edges get them inside).
      const left = sp.x > world.map.widthM - 4;
      const up = sp.y > world.map.heightM - 2;
      t.setOrigin(left ? 1 : 0, up ? 1 : 0).setPosition(sp.x + (left ? -1 : 1) * SPAWN_DISC_M * 1.4, sp.y + (up ? -1 : 0.2) * SPAWN_DISC_M).setScale(LABEL_SCALE).setDepth(DEPTH + 1);
      return t;
    });
  }
}
